/* Native embedding uses the Demo's own group layout and measures its complete rendered content. */
'use strict';
function studioNativeArrangeLayout(state){
 const story=state.nodes.find(node=>node.kind==='story');
 if(story)Object.assign(story,{x:80,y:160});
 const assets=state.nodes.filter(node=>['character','scene'].includes(node.kind)||node.assetCategory==='prop');
 const categories=[assets.filter(node=>node.kind==='character'),assets.filter(node=>node.kind==='scene'),assets.filter(node=>node.assetCategory==='prop')];
 let top=160,assetRight=600;
 for(const nodes of categories){
  if(!nodes.length)continue;
  const width=Math.max(...nodes.map(node=>node.w)),height=Math.max(...nodes.map(node=>node.h));
  const columns=Math.min(4,Math.ceil(Math.sqrt(nodes.length)));
  nodes.forEach((node,index)=>Object.assign(node,{x:600+(index%columns)*(width+48),y:top+Math.floor(index/columns)*(height+72)}));
  assetRight=Math.max(assetRight,600+columns*width+(columns-1)*48);
  top+=Math.ceil(nodes.length/columns)*(height+72)+48;
 }
 const remaining=state.nodes.filter(node=>node!==story&&!assets.includes(node));
 const start=assetRight+160,columns=Math.min(3,Math.max(1,Math.ceil(Math.sqrt(remaining.length))));
 const width=Math.max(320,...remaining.map(node=>node.w)),height=Math.max(320,...remaining.map(node=>node.h));
 remaining.forEach((node,index)=>Object.assign(node,{x:start+(index%columns)*(width+64),y:160+Math.floor(index/columns)*(height+80)}));
}
function studioNativePrepareLayout(state){
 if(state.studioNativeLayoutVersion===1)return false;
 referenceArrangeNewDrama();
 studioNativeArrangeLayout(state);
 state.studioNativeLayoutVersion=1;
 state.studioNativeLayoutMode='auto';
 state.studioNativeCamera='fit';
 return true;
}
function studioNativeFitViewport(){
 const viewport=document.getElementById('viewport');if(!viewport||!S.nodes.length)return;
 referenceRefreshGroups();
 const origin=viewport.getBoundingClientRect(),scale=S.zoom||1;
 const bounds=[...viewport.querySelectorAll('[data-node],.world-label,.world-section-label')]
  .map(element=>element.getBoundingClientRect()).filter(rect=>rect.width&&rect.height);
 if(!bounds.length)return;
 const left=(Math.min(...bounds.map(r=>r.left))-origin.left-S.pan.x)/scale;
 const top=(Math.min(...bounds.map(r=>r.top))-origin.top-S.pan.y)/scale;
 const right=(Math.max(...bounds.map(r=>r.right))-origin.left-S.pan.x)/scale;
 const bottom=(Math.max(...bounds.map(r=>r.bottom))-origin.top-S.pan.y)/scale;
 const header=document.querySelector('.ref-canvas-header')?.getBoundingClientRect();
 const safe={left:80,right:28,top:Math.max(28,(header?.bottom||origin.top)-origin.top+20),bottom:72};
 const width=Math.max(1,viewport.clientWidth-safe.left-safe.right),height=Math.max(1,viewport.clientHeight-safe.top-safe.bottom);
 S.zoom=Math.min(.9,width/Math.max(1,right-left),height/Math.max(1,bottom-top));
 S.pan={x:safe.left+(width-(right-left)*S.zoom)/2-left*S.zoom,y:safe.top+(height-(bottom-top)*S.zoom)/2-top*S.zoom};
 S.studioNativeCamera='fit';
 S.studioNativeViewport={width:viewport.clientWidth,height:viewport.clientHeight};
 applyCamera();
 if(S.selected&&canvasCreationNode()&&!canvasActiveTool)frameCanvasNodeControls();
}
const studioNativeBaseFit=fitCanvas;
fitCanvas=function(all=true){if(!all)return studioNativeBaseFit(false);studioNativeFitViewport();save();};
const studioNativeBaseZoom=zoomBy;
zoomBy=function(...args){S.studioNativeCamera='free';return studioNativeBaseZoom(...args);};
const studioNativeBaseFocus=focusNode;
focusNode=function(...args){S.studioNativeCamera='free';return studioNativeBaseFocus(...args);};
window.addEventListener('resize',()=>{
 if(S.screen!=='canvas')return;
 requestAnimationFrame(()=>{if(S.studioNativeCamera==='fit')studioNativeFitViewport();});
});
document.addEventListener('pointerdown',event=>{
 if(event.target.closest('#viewport')&&!event.target.closest('button,input,textarea,select'))S.studioNativeCamera='free';
},true);
/* Make room for the node and its attached editor together in short desktop viewports. */
const studioNativeBaseSelect=selectNode;
selectNode=function(...args){
 studioNativeBaseSelect(...args);
 if(canvasCreationNode()&&!canvasActiveTool)frameCanvasNodeControls();
};

/* Explicit arrangement is undoable; saved layouts are never rearranged by theme changes. */
const studioNativeArrangeAction=handleAction;
handleAction=function(action){
 if(action!=='layout'||S.projectKind!=='drama')return studioNativeArrangeAction(action);
 const before=S.nodes.map(node=>({id:node.id,x:node.x,y:node.y}));
 studioNativeArrangeLayout(S);
 const after=S.nodes.map(node=>({id:node.id,x:node.x,y:node.y}));
 studioRecordCanvasHistory({type:'positions',before,after});
 S.studioNativeLayoutMode='auto';S.revision++;render();studioNativeFitViewport();save();
};

let studioNativeDragPositions=null;
document.addEventListener('pointerdown',event=>{
 if(event.target.closest('[data-node],[data-asset-group]'))studioNativeDragPositions=JSON.stringify(S.nodes.map(node=>[node.id,node.x,node.y]));
},true);
document.addEventListener('pointerup',()=>{
 if(studioNativeDragPositions&&studioNativeDragPositions!==JSON.stringify(S.nodes.map(node=>[node.id,node.x,node.y]))){S.studioNativeLayoutMode='manual';save();}
 studioNativeDragPositions=null;
});
