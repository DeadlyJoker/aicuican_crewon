/** Interrupted canvas gestures restore their origin without adding an undo entry. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function cancelCanvasDrag(){'),source.indexOf('function setupTimelineDrag(){'));
function fixture(type='node'){
 const listeners=new Map(),captured=new Set(),history=[],node={id:'one',x:120,y:80},classes=new Set();
 const viewport={dataset:{},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)},addEventListener:(name,callback)=>listeners.set(name,callback),setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
 const element={style:{}},S={project:'first',mode:'select',pan:{x:20,y:40},zoom:2};
 const ctx=vm.createContext({S,drag:null,spaceDown:false,document:{getElementById:id=>id==='viewport'?viewport:{},querySelector:()=>element},nodeById:id=>id===node.id?node:null,selectNode(){},applyCamera(){},save(){},drawEdges(){},syncCanvasRecovery(){},drawMinimap(){},positionSelectionToolbar(){},setupTimelineDrag(){},scriptCanvasGroups(){return '';},studioRecordCanvasHistory:entry=>history.push(entry),toast(){},setTimeout(){}});
 vm.runInContext(code+';setupCanvas()',ctx);
 const target={closest:selector=>selector==='[data-drag]'&&type==='node'?{dataset:{drag:node.id}}:null};
 function send(name,extra={}){listeners.get(name)({target,button:0,pointerId:7,clientX:100,clientY:100,...extra});}
 return {send,node,S,history,classes,captured,ctx};
}
for(const reason of ['pointercancel','lostpointercapture'])test(`${reason} restores a node move and does not commit history`,()=>{
 const h=fixture();h.send('pointerdown');h.send('pointermove',{clientX:160,clientY:140});assert.equal(h.node.x,150);h.send(reason);assert.equal(h.node.x,120);assert.equal(h.node.y,80);assert.equal(h.history.length,0);assert.equal(h.captured.size,0);assert.equal(h.ctx.drag,null);h.send('pointermove',{clientX:500});assert.equal(h.node.x,120);
});
test('canceling a pan restores the camera and clears the grabbing state',()=>{
 const h=fixture('pan');h.send('pointerdown');h.send('pointermove',{clientX:200,clientY:140});assert.equal(h.S.pan.x,120);h.send('pointercancel');assert.equal(h.S.pan.x,20);assert.equal(h.S.pan.y,40);assert.equal(h.classes.has('panning'),false);
});
test('another pointer cannot move or end the active gesture',()=>{
 const h=fixture();h.send('pointerdown');h.send('pointermove',{pointerId:8,clientX:500});h.send('pointerup',{pointerId:8});h.send('pointercancel',{pointerId:8});assert.equal(h.node.x,120);assert.ok(h.ctx.drag);h.send('pointercancel');
});
test('a completed move adds one undo entry and capture loss does not roll it back',()=>{
 const h=fixture();h.send('pointerdown');h.send('pointermove',{clientX:160});h.send('pointerup');h.send('lostpointercapture');assert.equal(h.history.length,1);assert.equal(h.history[0].x,120);assert.equal(h.node.x,150);assert.equal(h.captured.size,0);
});
test('canceling a stale gesture does not overwrite another project camera',()=>{
 const h=fixture('pan');h.send('pointerdown');h.S.project='second';h.S.pan={x:500,y:600};h.send('pointercancel');assert.equal(h.S.pan.x,500);assert.equal(h.S.pan.y,600);assert.equal(h.captured.size,0);
});
