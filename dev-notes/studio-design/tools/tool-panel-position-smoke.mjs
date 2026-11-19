/** Independent panel movement changes presentation only and stays isolated per node, tool and project. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-tool-panel-position.js',import.meta.url),'utf8');
function fixture(controls={}){
 const listeners=new Map(),captured=new Set(),style={},S={project:'first',pan:{x:0,y:17},zoom:.9,nodes:[{id:'image'}]},tool={nodeId:'image',type:'angle'};
 const panel={style,isConnected:true,hidden:false,getBoundingClientRect:()=>({left:parseFloat(style.left??'374'),top:parseFloat(style.top??'150')+64,width:560,height:314})};
 const handle={closest:()=>panel,classList:{add(){},remove(){}},focus(){},setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
 const document={getElementById:()=>({getBoundingClientRect:()=>({left:0,top:64,right:1280,bottom:720})}),querySelector:selector=>selector==='.ref-angle-panel,.ref-lighting-panel'?panel:selector==='.ref-canvas-header'?{getBoundingClientRect:()=>({bottom:64})}:controls[selector]?{getBoundingClientRect:()=>controls[selector]}:null,addEventListener:(name,fn)=>listeners.set(name,fn)};
 const ctx=vm.createContext({S,canvasActiveTool:tool,referenceAssistantDraftKey:state=>state.project,canvasNodeToolHtml(){return '';},positionCanvasNodeOverlays(){style.left='374px';style.top='150px';},document,window:{addEventListener:(name,fn)=>listeners.set(name,fn)}});vm.runInContext(source,ctx);
 function send(name,extra={}){listeners.get(name)({target:{closest:()=>handle},button:0,pointerId:1,clientX:400,clientY:230,preventDefault(){},stopImmediatePropagation(){},...extra});}
 return {ctx,S,tool,panel,send,point:()=>panel.getBoundingClientRect()};
}
test('pointer movement and reopening preserve camera and node data',()=>{
 const h=fixture(),before=JSON.stringify(h.S);h.send('pointerdown');h.send('pointermove',{clientX:500,clientY:280});h.send('pointerup');assert.equal(h.point().left,474);assert.equal(h.point().top,264);h.ctx.positionCanvasNodeOverlays();assert.equal(h.point().left,474);assert.equal(JSON.stringify(h.S),before);
});
test('positions remain separate for tools and projects',()=>{
 const h=fixture();h.send('keydown',{key:'ArrowRight'});assert.equal(h.point().left,384);h.tool.type='lighting';h.ctx.positionCanvasNodeOverlays();assert.equal(h.point().left,374);h.tool.type='angle';h.S.project='second';h.ctx.positionCanvasNodeOverlays();assert.equal(h.point().left,374);
});
test('canceling a drag restores its starting position and Home restores automatic placement',()=>{
 const h=fixture();h.send('keydown',{key:'ArrowRight'});const before=h.point();h.send('pointerdown');h.send('pointermove',{clientX:600});h.send('keydown',{key:'Escape'});assert.equal(h.point().left,before.left);h.send('keydown',{key:'Home'});assert.equal(h.point().left,374);
});
test('large pointer motion clamps the complete panel inside the available region',()=>{
 const h=fixture();h.send('pointerdown');h.send('pointermove',{clientX:10000,clientY:10000});h.send('pointerup');assert.equal(h.point().left+560,1268);assert.equal(h.point().top+314,708);
});
test('window focus loss cancels an unfinished drag',()=>{
 const h=fixture(),before=h.point();h.send('pointerdown');h.send('pointermove',{clientX:600});h.send('blur');assert.equal(h.point().left,before.left);
});

test('manual movement leaves clearance above bottom navigation and assistant launcher',()=>{
 const h=fixture({'.canvas-bottom':{top:666,width:290,height:38},'.ref-assistant-launch':{top:660,width:40,height:40}});
 h.send('pointerdown');h.send('pointermove',{clientX:10000,clientY:10000});h.send('pointerup');
 assert.equal(h.point().top+314,648);assert.equal(h.panel.style.maxHeight,'572px');
});
