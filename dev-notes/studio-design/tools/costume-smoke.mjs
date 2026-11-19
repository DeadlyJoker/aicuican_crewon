/** Batch preparation must preserve outputs and remain atomic and reversible. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const files=['asset-reference-model.js','reference-node-commands.js','reference-costume.js'];
const source=(await Promise.all(files.map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')))).join('\n');
function fixture(){
 const context=vm.createContext({structuredClone,document:{addEventListener(){}},nodeHtml(){return '';},canvasMediaSettings(){return {};},canvasCreationHtml(){return '';},canvasPromptCanSubmit(){return true;},handleCanvasCreationAction(){return false;},handleAction(){},render(){}});
 vm.runInContext(`var S={nodes:['source','one','two'].map((id,i)=>({id,title:id,kind:'character',prompt:'描述 '+id,frame:i,referenceOnly:false,adoptedCandidateId:id+'-v1',candidates:[{id:id+'-v1',number:1,frame:i,prompt:'旧图片'}]})),edges:[],nodeDrafts:{one:{prompt:'未提交的描述'}},versions:{}};var nodeById=id=>S.nodes.find(n=>n.id===id);`,context);
 vm.runInContext(source,context);
 return expression=>vm.runInContext(expression,context);
}
test('preparing two targets pins the source and retains drafts and every candidate',()=>{
 const r=fixture();r("var outputs=JSON.stringify(S.nodes.map(n=>[n.prompt,n.candidates,n.adoptedCandidateId]));var result=referencePrepareCostumeDrafts('source','source-v1',['one','two']);");
 assert.equal(r('result.ok'),true);assert.equal(r('S.nodeDrafts.one.prompt'),'未提交的描述');
 assert.equal(r('JSON.stringify(S.nodes.map(n=>[n.prompt,n.candidates,n.adoptedCandidateId]))'),r('outputs'));
 assert.equal(r('S.nodeDrafts.two.creationCostume.source.candidateId'),'source-v1');
 assert.equal(r('S.edges.length'),2);
 r("nodeById('source').candidates.push({id:'source-v2',number:2,frame:4});nodeById('source').adoptedCandidateId='source-v2'");
 assert.equal(r('S.nodeDrafts.two.creationCostume.source.candidateId'),'source-v1');
});
test('a later cycle failure restores all earlier targets in the batch',()=>{
 const r=fixture();r("S.edges=[['two','source']];var before=JSON.stringify(S);var result=referencePrepareCostumeDrafts('source','source-v1',['one','two']);");
 assert.equal(r('result.ok'),false);assert.equal(r('JSON.stringify(S)'),r('before'));
});
test('stale source, missing targets, duplicates and self-selection change nothing',()=>{
 for(const [candidate,ids] of [['old',['one']],['source-v1',['missing']],['source-v1',['one','one']],['source-v1',['source']],['source-v1',[]]]){
  const r=fixture();r('var before=JSON.stringify(S)');
  assert.equal(r(`referencePrepareCostumeDrafts('source',${JSON.stringify(candidate)},${JSON.stringify(ids)}).ok`),false);
  assert.equal(r('JSON.stringify(S)'),r('before'));
 }
});
test('repeated preparation is a no-op and one undo restores the entire batch',()=>{
 const r=fixture();r("var before=JSON.stringify(S);var first=referencePrepareCostumeDrafts('source','source-v1',['one','two']);var second=referencePrepareCostumeDrafts('source','source-v1',['one','two']);");
 assert.equal(r('second.changed'),false);
 assert.equal(r('referenceRestoreNodeGraph(S,first.entry.after,first.entry.before).ok'),true);
 assert.equal(r('JSON.stringify(S)'),r('before'));
});
test('removing or replacing the pinned reference requires explicit correction',()=>{
 const r=fixture();r("referencePrepareCostumeDrafts('source','source-v1',['one']);var target=nodeById('one');");
 assert.equal(r('referenceCostumeDraftReady(target,S.nodeDrafts.one)'),true);
 r('target.assetReferences=[]');assert.equal(r('referenceCostumeDraftReady(target,S.nodeDrafts.one)'),false);
});
