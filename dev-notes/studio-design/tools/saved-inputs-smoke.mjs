/** Saved library inputs commit as a reversible edit, preserving accepted outputs. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const sources=await Promise.all(['reference-group-model.js','reference-node-commands.js','reference-asset-vault.js','asset-reference-model.js','reference-saved-inputs.js'].map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')));
function fixture(){
 let serial=0;const ctx=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}},handleAction(){},home(){},location:{hash:''},referenceRunNodeCommand(){},studioAssetPickerRows(){},studioRefreshAssetPickerRows(){},studioRenderAssetPicker(){},studioApplyAssetPicker(){},handleStudioAssetAction(){},studioScriptId:()=>`copy-${++serial}`,referenceVaultImportPosition:()=>({x:400,y:200}),studioNewContentPosition:()=>({x:400,y:200})});
 vm.runInContext("var S={project:'B',nodes:[{id:'target',kind:'image',title:'Target',assetReferences:[],adoptedCandidateId:'accepted',candidates:[{id:'accepted',number:1,frame:1,prompt:'keep'}]}],edges:[],nodeDrafts:{},versions:{},layoutBase:[],history:[],revision:0};var entries=[];function nodeById(id){return S.nodes.find(n=>n.id===id)};function studioRecordCanvasHistory(entry){entries.push(entry)};var saved={id:'a',project:'A',nodeId:'old',kind:'character',title:'Saved',candidate:{id:'v3',number:3,frame:2,prompt:'original'}}",ctx);
 for(const source of sources)vm.runInContext(source,ctx);return code=>vm.runInContext(code,ctx);
}
test('saved input imports and references one version with a single undo entry',()=>{
 const run=fixture();run('var result=studioCommitSavedInputs(S.nodes[0],[],[saved])');assert.equal(run('result.ok'),true);assert.equal(run('entries.length'),1);assert.equal(run('S.nodes.length'),2);assert.equal(run('S.nodes[0].candidates[0].prompt'),'keep');assert.equal(run('S.nodes[1].candidates[0].savedAsset.assetId'),'a');assert.equal(run('S.nodes[0].assetReferences[0].sourceId'),run('S.nodes[1].id'));
 assert.equal(run('referenceRestoreNodeGraph(S,entries[0].after,entries[0].before).ok'),true);assert.equal(run('S.nodes.length'),1);assert.equal(run('S.nodes[0].assetReferences.length'),0);assert.equal(run('saved.candidate.number'),3);
});
test('reapplying the same saved version reuses its project copy',()=>{
 const run=fixture();run('studioCommitSavedInputs(S.nodes[0],[],[saved]);var result=studioCommitSavedInputs(S.nodes[0],S.nodes[0].assetReferences,[saved])');assert.equal(run('result.ok'),true);assert.equal(run('S.nodes.length'),2);assert.equal(run('entries.length'),1);
});
test('failure after a staged import rolls back every added node and layout entry',()=>{
 const run=fixture();run("var before=JSON.stringify(S);var result=studioCommitSavedInputs(S.nodes[0],[{sourceId:'missing'}],[saved])");assert.equal(run('result.ok'),false);assert.equal(run('JSON.stringify(S)===before'),true);assert.equal(run('entries.length'),0);
});
test('an edited project copy does not replace the saved asset version',()=>{
 const run=fixture();run("studioCommitSavedInputs(S.nodes[0],[],[saved]);S.nodes[1].candidates[0].prompt='changed';var result=studioCommitSavedInputs(S.nodes[0],[],[saved])");assert.equal(run('result.ok'),true);assert.equal(run('S.nodes.length'),3);assert.equal(run('S.nodes[2].candidates[0].prompt'),'original');assert.equal(run('S.nodes[1].candidates[0].prompt'),'changed');
});
test('original local audio IDs remain pinned across serialization and undo',()=>{
 const run=fixture();run("saved.kind='audio';saved.candidate.frame=-1730000000010;saved.candidate.localMedia={frame:-1730000000010,type:'音频',duration:2};var result=studioCommitSavedInputs(S.nodes[0],[],[saved]);S=JSON.parse(JSON.stringify(S))");assert.equal(run('result.ok'),true);assert.equal(run('S.nodes[0].assetReferences[0].frame'),-1730000000010);assert.equal(run('S.nodes[1].candidates[0].localMedia.duration'),2);assert.equal(run('referenceRestoreNodeGraph(S,entries[0].after,entries[0].before).ok'),true);assert.equal(run('S.nodes.length'),1);
});
test('frame identity accepts signed safe IDs and rejects invalid numeric IDs',()=>{
 const run=fixture();assert.equal(run("studioAssetReferenceValid({sourceId:'a',sourceTitle:'Audio',sourceKind:'audio',candidateId:'c',number:1,frame:-10})"),true);assert.equal(run("[NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1].every(frame=>!studioAssetReferenceValid({sourceId:'a',sourceTitle:'Audio',sourceKind:'audio',candidateId:'c',number:1,frame}))"),true);
});
