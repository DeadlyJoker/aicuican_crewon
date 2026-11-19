/** Capturing creates an independent image without replacing its source. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const graph=await readFile(new URL('../reference-node-commands.js',import.meta.url),'utf8');
const capture=await readFile(new URL('../reference-panorama-capture.js',import.meta.url),'utf8');
function fixture(){
 const context=vm.createContext({structuredClone});
 vm.runInContext(graph.slice(0,graph.indexOf('function referenceNodeCommandResult('))+capture.slice(capture.indexOf('function referenceCommitPanoramaCapture('),capture.indexOf('async function referenceCapturePanorama(')),context);
 vm.runInContext(`var state={nodes:[{id:'source',kind:'image',title:'全景',prompt:'原提示词',adoptedCandidateId:'v1',candidates:[{id:'v1',number:1,frame:9}]}],edges:[],nodeDrafts:{source:{prompt:'未提交草稿'}},versions:{}};var record={captureMode:'node',frame:-123,width:640,height:360,sourceWidth:2048,sourceHeight:1024,name:'view.png',view:{yaw:45,pitch:5,hfov:85,ratio:'16:9',mirrored:false}};var commit=()=>referenceCommitPanoramaCapture(state,'source','v1',record,'capture',{x:200,y:100});`,context);
 return code=>vm.runInContext(code,context);
}
test('capture keeps original media and drafts and snapshots its camera',()=>{
 const r=fixture();r('var original=JSON.stringify(state.nodes[0]);var result=commit();record.view.yaw=120;');
 assert.equal(r('result.ok'),true);assert.equal(r('JSON.stringify(state.nodes[0])'),r('original'));
 assert.equal(r('state.nodeDrafts.source.prompt'),'未提交草稿');assert.equal(r('state.nodes[1].candidates[0].panorama.yaw'),45);
 assert.equal(r('state.nodes[1].assetReferences[0].candidateId'),'v1');assert.equal(r('state.nodes[1].candidates[0].frame'),-123);
});
test('duplicate confirmation is idempotent and stale source rejects without a mutation',()=>{
 const r=fixture();r('commit();var before=JSON.stringify(state);var repeated=commit();');
 assert.equal(r('repeated.changed'),false);assert.equal(r('JSON.stringify(state)'),r('before'));
 r("state.nodes[0].adoptedCandidateId='v2';before=JSON.stringify(state);var stale=commit();");
 assert.equal(r('stale.ok'),false);assert.equal(r('JSON.stringify(state)'),r('before'));
});
test('undo and redo restore the derived image and retain source history',()=>{
 const r=fixture();r('var before=JSON.stringify(state);var result=commit();var after=JSON.stringify(state);var undo=referenceRestoreNodeGraph(state,result.entry.after,result.entry.before);');
 assert.equal(r('undo.ok'),true);assert.equal(r('JSON.stringify(state)'),r('before'));
 r('var redo=referenceRestoreNodeGraph(state,result.entry.before,result.entry.after);');
 assert.equal(r('redo.ok'),true);assert.equal(r('JSON.stringify(state)'),r('after'));
});


test('expanded captures retain viewport dimensions separately from the node aspect selection',()=>{
 const r=fixture();r("record.captureMode='expanded';record.width=366;record.height=820;var result=commit();var saved=state.nodes[1].candidates[0].panorama");
 assert.equal(r('result.ok'),true);assert.equal(r('saved.captureMode'),'expanded');assert.equal(r('saved.width'),366);assert.equal(r('saved.height'),820);assert.equal(r('saved.ratio'),'16:9');
 assert.equal(r("state.nodes[0].adoptedCandidateId"),'v1');
});
