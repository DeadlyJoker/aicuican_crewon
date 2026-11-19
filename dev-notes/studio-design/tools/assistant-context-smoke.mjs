/** Assistant image selection freezes versions without changing adopted canvas outputs. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=(await Promise.all(['catalog.js','candidate-ux.js','reference-assistant.js','reference-assistant-context.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')))).join('\n');
function fixture(){const context=vm.createContext({S:{screen:'home'},structuredClone,handleAction(){},canvasHtml(){return ''},inspectorHtml(){return ''},nodeHtml(){return ''},document:{addEventListener(){}}});vm.runInContext(source,context);vm.runInContext("var state={project:'A',nodes:Array.from({length:6},(_,i)=>({id:'image'+i,kind:'image',title:'图片'+i,adoptedCandidateId:'v1',candidates:[{id:'v1',frame:i,number:1}]}))}",context);return code=>vm.runInContext(code,context);}
test('selection pins the adopted version and duplicate picks leave graph and references unchanged',()=>{
 const run=fixture();run("var before=JSON.stringify(state.nodes);referenceAddAssistantReference(state,'image0');var captured=JSON.stringify(referenceAssistantReferences(state))");assert.equal(run("referenceAddAssistantReference(state,'image0').changed"),false);assert.equal(run('JSON.stringify(state.nodes)===before'),true);assert.equal(run('JSON.stringify(referenceAssistantReferences(state))===captured'),true);
 run("state.nodes[0].candidates.push({id:'v2',frame:99,number:2});state.nodes[0].adoptedCandidateId='v2'");assert.equal(run('referenceAssistantReferences(state)[0].candidateId'),'v1');assert.equal(run('referenceAssistantReferences(state)[0].frame'),0);
});
test('the sixth distinct image is rejected without changing the saved selection',()=>{
 const run=fixture();run("for(let i=0;i<5;i++)referenceAddAssistantReference(state,'image'+i);var before=JSON.stringify(state)");assert.equal(run("referenceAddAssistantReference(state,'image5').ok"),false);assert.equal(run('JSON.stringify(state)===before'),true);
});
test('missing outputs and non-image nodes cannot become assistant image references',()=>{
 const run=fixture();run("state.nodes[0].adoptedCandidateId=null;state.nodes[1].kind='video'");assert.equal(run("referenceAddAssistantReference(state,'image0').ok"),false);assert.equal(run("referenceAddAssistantReference(state,'image1').ok"),false);assert.equal(run("referenceAddAssistantReference(state,'missing').ok"),false);assert.equal(run('referenceAssistantReferences(state).length'),0);
});
test('references survive persistence and remain isolated when changing projects',()=>{
 const run=fixture();run("referenceAddAssistantReference(state,'image0');state=JSON.parse(JSON.stringify(state));state.project='B'");assert.equal(run('referenceAssistantReferences(state).length'),0);run("state.project='A';referenceRemoveAssistantReference(state,referenceAssistantReferences(state)[0].id)");assert.equal(run('referenceAssistantReferences(state).length'),0);
});
test('removed source versions stay identifiable rather than silently switching to a new output',()=>{
 const run=fixture();run("referenceAddAssistantReference(state,'image0');var ref=referenceAssistantReferences(state)[0];state.nodes=[]");assert.equal(run('referenceAssistantReferenceAvailable(state,ref)'),false);assert.equal(run('ref.candidateId'),'v1');
});
test('submitted direction freezes image version metadata after composer and adoption change',()=>{
 const run=fixture();run("referenceAddAssistantReference(state,'image0');var entry=referenceAssistantDirectionEntry(state,'只调整光线','2026-11-11T00:00:00.000Z');state.nodes[0].candidates.push({id:'v2',number:2,frame:99});state.nodes[0].adoptedCandidateId='v2';referenceRemoveAssistantReference(state,referenceAssistantReferences(state)[0].id);entry=JSON.parse(JSON.stringify(entry))");
 assert.equal(run('entry.references[0].candidateId'),'v1');assert.equal(run('entry.references[0].number'),1);assert.equal(run('entry.references[0].frame'),0);assert.equal(run('entry.references[0].sourceTitle'),'图片0');assert.equal(run('entry.text'),'只调整光线');assert.equal(run('entry.createdAt'),'2026-11-11T00:00:00.000Z');
});
test('project history reads legacy requests and records frozen reference versions',()=>{
 const run=fixture();run("function nodeById(){return undefined}function esc(value){return String(value)}function I(){return ''}referenceAddAssistantReference(state,'image0');var entry=referenceAssistantDirectionEntry(state,'记录验收','2026-11-11T00:00:00.000Z')");
 assert.match(run('candidateHistoryEntry(entry)'),/图片0 · v1/);assert.match(run('candidateHistoryEntry(entry)'),/参考图片 · 1/);assert.match(run("candidateHistoryEntry({type:'direction',text:'旧请求'})"),/旧请求/);
});
