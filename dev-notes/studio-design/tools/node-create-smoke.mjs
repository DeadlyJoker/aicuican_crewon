/** New nodes must own their undo entry instead of undoing the previous user action. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const graph=await readFile(new URL('../reference-node-commands.js',import.meta.url),'utf8');
const add=app.split('\n').find(line=>line.startsWith('function addNode('));
function fixture(){
 const context=vm.createContext({structuredClone,document:{getElementById(){return {clientWidth:800,clientHeight:600};}},render(){},revealSelectedNode(){},save(){},toast(){},frameCanvasNodeControls(){}});
 vm.runInContext(graph.slice(0,graph.indexOf('function referenceNodeCommandResult('))+`;var S={nodes:[{id:'existing',kind:'image',x:0,y:0,w:200}],edges:[],nodeDrafts:{},versions:{},canvasUndo:[{type:'previous'}],canvasRedo:[{type:'redo'}],pan:{x:0,y:0},zoom:1};var studioCandidateKinds=new Set(['image','video']);var studioScriptId=()=> 'created';var studioNewContentPosition=()=>({x:100,y:100});var studioRecordCanvasHistory=entry=>{S.canvasUndo.push(entry);S.canvasRedo=[];};var studioApplyAssetReferences=()=>({ok:false,error:'缺少原图'});var canvasSelectedLink=null;`+add,context);
 return code=>vm.runInContext(code,context);
}
test('adding a node owns one reversible graph entry and preserves preceding history',()=>{
 const r=fixture();r("var added=addNode('text');var entry=S.canvasUndo.at(-1);var undo=referenceRestoreNodeGraph(S,entry.after,entry.before);");
 assert.equal(r('S.canvasUndo.length'),2);assert.equal(r('S.canvasUndo[0].type'),'previous');assert.equal(r('undo.ok'),true);assert.equal(r('S.nodes.length'),1);assert.equal(r('S.nodes[0].id'),'existing');
 r('var redo=referenceRestoreNodeGraph(S,entry.before,entry.after);');assert.equal(r('redo.ok'),true);assert.equal(r('S.nodes[1].id'),'created');
});
test('failed reference creation preserves old nodes and the redo stack',()=>{
 const r=fixture();r("var added=addNode('image','有参考的草稿',{});");assert.equal(r('added'),null);assert.equal(r('S.nodes.length'),1);assert.equal(r('S.canvasUndo.length'),1);assert.equal(r('S.canvasRedo[0].type'),'redo');
});
