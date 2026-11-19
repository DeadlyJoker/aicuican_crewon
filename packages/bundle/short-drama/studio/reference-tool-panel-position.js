/* Manual positions belong to the current page's project, node and independent tool. */
'use strict';
const referenceToolPanelPositions=new Map();
let referenceToolPanelDrag=null;
function referenceToolPanelKey(){return canvasActiveTool?JSON.stringify([referenceAssistantDraftKey(S),canvasActiveTool.nodeId,canvasActiveTool.type]):null;}
/** Clamp a panel origin while keeping its controls inside the usable viewport. */
function referenceClampToolPanel(point,size,bounds){return {x:Math.max(bounds.left,Math.min(bounds.right-size.width,point.x)),y:Math.max(bounds.top,Math.min(bounds.bottom-size.height,point.y))};}
function referenceToolPanelBounds(){
 const viewport=document.getElementById('viewport').getBoundingClientRect(),navigation=document.querySelector('.canvas-navigator')?.getBoundingClientRect();
 const top=Math.max(viewport.top+12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||0)+12),controls=['.canvas-bottom','.ref-assistant-launch'].map(selector=>document.querySelector(selector)?.getBoundingClientRect()).filter(rect=>rect&&rect.width>0&&rect.height>0&&rect.top>top);
 return {left:Math.max(viewport.left+12,navigation?navigation.right+12:viewport.left+76),right:viewport.right-12,top,bottom:Math.min(viewport.bottom-12,...controls.map(rect=>rect.top-12)),origin:{x:viewport.left,y:viewport.top}};
}
function referencePlaceToolPanel(panel,point){
 const bounds=referenceToolPanelBounds();panel.style.maxHeight=Math.max(1,bounds.bottom-bounds.top)+'px';const placed=referenceClampToolPanel(point,panel.getBoundingClientRect(),bounds);panel.style.left=placed.x-bounds.origin.x+'px';panel.style.top=placed.y-bounds.origin.y+'px';return placed;
}
const referenceManualToolHtml=canvasNodeToolHtml;
canvasNodeToolHtml=function(node){
 const html=referenceManualToolHtml(node);if(!['angle','lighting'].includes(canvasActiveTool?.type))return html;
 const hint='拖动移动面板，方向键微调，Shift 加速',label='移动'+canvasToolNames[canvasActiveTool.type]+'面板';
 return canvasActiveTool.type==='lighting'?html.replace('><button','><button type="button" class="ref-tool-panel-handle ref-lighting-move-handle" data-tool-panel-handle aria-label="'+label+'" title="'+hint+'"></button><button'):html.replace('<strong>','<strong class="ref-tool-panel-handle" data-tool-panel-handle role="button" tabindex="0" aria-label="'+label+'" title="'+hint+'">');
};
const referenceManualToolPosition=positionCanvasNodeOverlays;
positionCanvasNodeOverlays=function(){
 referenceManualToolPosition();const panel=document.querySelector('.ref-angle-panel,.ref-lighting-panel'),key=referenceToolPanelKey();if(!panel||panel.hidden||!key)return;
 const point=referenceToolPanelDrag?.key===key?referenceToolPanelDrag.current:referenceToolPanelPositions.get(key);const rect=panel.getBoundingClientRect();referencePlaceToolPanel(panel,point||{x:rect.left,y:rect.top});
};
function referenceFinishToolPanelDrag(cancel){
 const state=referenceToolPanelDrag;if(!state)return;referenceToolPanelDrag=null;
 if(state.panel.isConnected&&state.key===referenceToolPanelKey()){
  if(cancel){if(state.saved)referenceToolPanelPositions.set(state.key,state.saved);else referenceToolPanelPositions.delete(state.key);referencePlaceToolPanel(state.panel,state.start);}
  else referenceToolPanelPositions.set(state.key,{...state.current});
  state.handle.classList.remove('is-dragging');if(state.handle.hasPointerCapture(state.pointerId))state.handle.releasePointerCapture(state.pointerId);
 }
}
document.addEventListener('pointerdown',event=>{
 const handle=event.target.closest('[data-tool-panel-handle]');if(!handle||event.button!==0)return;
 const panel=handle.closest('.ref-angle-panel,.ref-lighting-panel'),rect=panel.getBoundingClientRect(),key=referenceToolPanelKey();
 referenceToolPanelDrag={panel,handle,key,pointerId:event.pointerId,client:{x:event.clientX,y:event.clientY},start:{x:rect.left,y:rect.top},current:{x:rect.left,y:rect.top},saved:referenceToolPanelPositions.get(key)};
 handle.setPointerCapture(event.pointerId);handle.classList.add('is-dragging');handle.focus({preventScroll:true});event.preventDefault();event.stopImmediatePropagation();
},true);
document.addEventListener('pointermove',event=>{
 const state=referenceToolPanelDrag;if(!state||state.pointerId!==event.pointerId)return;
 if(!state.panel.isConnected||state.key!==referenceToolPanelKey()){referenceToolPanelDrag=null;return;}
 state.current=referencePlaceToolPanel(state.panel,{x:state.start.x+event.clientX-state.client.x,y:state.start.y+event.clientY-state.client.y});event.preventDefault();event.stopImmediatePropagation();
},true);
document.addEventListener('pointerup',event=>{if(referenceToolPanelDrag?.pointerId===event.pointerId){event.preventDefault();event.stopImmediatePropagation();referenceFinishToolPanelDrag(false);}},true);
document.addEventListener('pointercancel',event=>{if(referenceToolPanelDrag?.pointerId===event.pointerId)referenceFinishToolPanelDrag(true);},true);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&referenceToolPanelDrag){event.preventDefault();event.stopImmediatePropagation();referenceFinishToolPanelDrag(true);return;}
 const handle=event.target.closest('[data-tool-panel-handle]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;
 event.preventDefault();event.stopImmediatePropagation();const key=referenceToolPanelKey();
 if(event.key==='Home'){referenceToolPanelPositions.delete(key);positionCanvasNodeOverlays();return;}
 const panel=handle.closest('.ref-angle-panel,.ref-lighting-panel'),rect=panel.getBoundingClientRect(),step=event.shiftKey?40:10;
 const point=referencePlaceToolPanel(panel,{x:rect.left+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),y:rect.top+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)});referenceToolPanelPositions.set(key,point);
},true);
window.addEventListener('blur',()=>referenceFinishToolPanelDrag(true));
document.addEventListener('lostpointercapture',event=>{if(referenceToolPanelDrag?.pointerId===event.pointerId)referenceFinishToolPanelDrag(true);},true);
