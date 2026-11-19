/** Verify canvas undo never rolls back accepted outputs or unrelated content. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const sources=await Promise.all(['asset-reference-model.js','asset-reference-ui.js','canvas-links.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
function fixture(){
 const context=vm.createContext({structuredClone,document:{addEventListener(){},querySelector(){return null;}},window:{addEventListener(){}},save(){}});
 vm.runInContext("var S={nodes:[{id:'a',kind:'image',title:'图片',status:'已采用',frame:1,x:0,y:0},{id:'b',kind:'video',title:'视频',assetReferences:[],candidates:[{id:'accepted',prompt:'旧候选'}],adoptedCandidateId:'accepted',x:200,y:0},{id:'c',kind:'text',title:'文本',text:'保留这段稿',x:400,y:0}],edges:[],history:[],canvasUndo:[],canvasRedo:[],revision:1};function nodeById(id){return S.nodes.find(n=>n.id===id)}",context);
 for(const source of sources)vm.runInContext(source,context);
 return expression=>vm.runInContext(expression,context);
}
test('adding, removing, undoing and redoing references preserves accepted candidate data',()=>{
 const run=fixture();run("var outputs=JSON.stringify(nodeById('b').candidates);studioConnectCanvasNodes('a','b');studioRemoveCanvasLink('a','b');");
 assert.equal(run('S.edges.length'),0);
 assert.equal(run('studioReplayCanvasHistory().ok'),true);
 assert.equal(run('S.edges.length'),1);
 assert.equal(run('studioReplayCanvasHistory().ok'),true);
 assert.equal(run('S.edges.length'),0);
 assert.equal(run('studioReplayCanvasHistory(true).ok'),true);
 assert.equal(run('S.edges.length'),1);
 assert.equal(run("JSON.stringify(nodeById('b').candidates)"),run('outputs'));
 assert.equal(run("nodeById('b').adoptedCandidateId"),'accepted');
});
test('restoring a prior pinned version does not silently upgrade to a later adoption',()=>{
 const run=fixture();run("studioConnectCanvasNodes('a','b');var pinned=nodeById('b').assetReferences[0].candidateId;studioRemoveCanvasLink('a','b');nodeById('a').candidates=[{id:'new',number:2,frame:2}];nodeById('a').adoptedCandidateId='new';");
 assert.equal(run('studioReplayCanvasHistory().ok'),true);
 assert.equal(run("nodeById('b').assetReferences[0].candidateId"),run('pinned'));
 assert.equal(run("nodeById('a').adoptedCandidateId"),'new');
});
test('missing sources block restoration without losing the command or altering other nodes',()=>{
 const run=fixture();run("studioConnectCanvasNodes('a','b');studioRemoveCanvasLink('a','b');S.nodes=S.nodes.filter(n=>n.id!=='a');var count=S.canvasUndo.length;");
 assert.equal(run('studioReplayCanvasHistory().ok'),false);
 assert.equal(run('S.canvasUndo.length'),run('count'));
 assert.equal(run('S.edges.length'),0);
 assert.equal(run("nodeById('c').text"),'保留这段稿');
});
test('legacy position entries can undo and redo after a storage round trip',()=>{
 const run=fixture();run("S.canvasUndo=[{id:'c',x:300,y:20}];S=JSON.parse(JSON.stringify(S));");
 assert.equal(run('studioReplayCanvasHistory().ok'),true);
 assert.equal(run("nodeById('c').x"),300);
 assert.equal(run('studioReplayCanvasHistory(true).ok'),true);
 assert.equal(run("nodeById('c').x"),400);
});
test('a new edit clears redo and cyclic visual relations are rejected',()=>{
 const run=fixture();run("studioConnectCanvasNodes('c','b');studioReplayCanvasHistory();studioConnectCanvasNodes('a','b');");
 assert.equal(run('S.canvasRedo.length'),0);
 assert.equal(run("studioConnectCanvasNodes('b','a').ok"),false);
 assert.equal(run('S.edges.length'),1);
});
