/* Canvas relations and local undo only edit preparation inputs, never accepted outputs. */
'use strict';
let canvasSelectedLink=null,canvasLinkDrag=null,canvasLinkClickUntil=0;
function studioRecordCanvasHistory(entry){S.canvasUndo??=[];S.canvasRedo=[];S.canvasUndo.push(structuredClone(entry));document.querySelector('[data-action="undo"]')?.removeAttribute('disabled');document.querySelector('[data-action="redo"]')?.setAttribute('disabled','');}
function studioApplyCanvasReferences(n,refs){
 const before=studioAssetReferenceRead(n),result=studioApplyAssetReferences(n,refs);
 if(result.ok&&result.changed)studioRecordCanvasHistory({type:'references',targetId:n.id,before,after:result.references});
 return result;
}
function studioCanvasCycle(from,to){
 const seen=new Set(),queue=[to];
 for(let at=0;at<queue.length;at++){const id=queue[at];if(id===from)return true;if(seen.has(id))continue;seen.add(id);queue.push(...S.edges.filter(edge=>edge[0]===id).map(edge=>edge[1]));}
 return false;
}
function studioConnectCanvasNodes(from,to){
 if(!nodeById(from)||!nodeById(to))return {ok:false,error:'请选择当前项目中的内容'};
 if(from===to||studioCanvasCycle(from,to))return {ok:false,error:'这条连接会形成循环，请选择其他内容'};
 const reference=studioConnectAssetReference(from,to);if(reference.handled)return reference;
 if(S.edges.some(edge=>edge[0]===from&&edge[1]===to))return {ok:true,changed:false};
 S.edges.push([from,to]);studioRecordCanvasHistory({type:'edge',from,to,before:false,after:true});
 return {ok:true,changed:true,relationOnly:true};
}
function canvasLinkEditable(from,to){return !['story','choice'].includes(nodeById(from)?.kind)&&nodeById(to)?.kind!=='final';}
function studioRemoveCanvasLink(from,to){
 if(!canvasLinkEditable(from,to))return {ok:false,error:'请在剧本或时间线中调整这条结构连接'};
 if(!S.edges.some(edge=>edge[0]===from&&edge[1]===to))return {ok:false,error:'这条连接已不存在'};
 const target=nodeById(to),refs=target&&studioAssetReferenceRead(target);
 if(refs?.some(ref=>ref.sourceId===from))return studioApplyCanvasReferences(target,refs.filter(ref=>ref.sourceId!==from));
 S.edges=S.edges.filter(edge=>edge[0]!==from||edge[1]!==to);studioRecordCanvasHistory({type:'edge',from,to,before:true,after:false});
 return {ok:true,changed:true};
}
/** Normalize earlier move/layout entries only when replaying, leaving the saved predecessors readable. */
function studioCanvasHistoryCommand(entry){
 if(entry.type==='references'||entry.type==='edge'||entry.type==='positions'||entry.type==='groups'||entry.type==='node-tags'||entry.type==='tag-catalog'||entry.type==='node-graph')return entry;
 const before=entry.id?[{id:entry.id,x:entry.x,y:entry.y}]:entry.nodes;
 if(!Array.isArray(before))return null;
 const after=before.map(p=>{const n=nodeById(p.id);return n?{id:n.id,x:n.x,y:n.y}:null;});
 return after.every(Boolean)?{type:'positions',before,after}:null;
}
function studioReplayCanvasHistory(redo=false){
 const source=redo?(S.canvasRedo??=[]):(S.canvasUndo??=[]),destination=redo?S.canvasUndo:(S.canvasRedo??=[]);
 if(!source.length)return {ok:false,error:redo?'没有可重做的画布操作':'没有可撤销的画布操作'};
 const entry=studioCanvasHistoryCommand(source.at(-1));if(!entry)return {ok:false,error:'这一步对应的内容已不存在，无法恢复'};
 const expected=redo?entry.before:entry.after,next=redo?entry.after:entry.before;
 if(entry.type==='node-graph'){
  const result=referenceRestoreNodeGraph(S,expected,next);if(!result.ok)return result;
  if(S.selected&&!nodeById(S.selected)){S.selected=null;if(S.panel==='selection')S.panel=null;}
 }else if(entry.type==='references'){
  if(!Array.isArray(expected)||!Array.isArray(next))return {ok:false,error:'参考记录不完整，无法恢复'};
  const result=studioRestoreAssetReferences(nodeById(entry.targetId),expected,next);if(!result.ok)return result;
 }else if(entry.type==='tag-catalog'){
  if(JSON.stringify(referenceTags())!==JSON.stringify(expected))return {ok:false,error:'标签目录已发生变化，暂不能恢复'};
  S.referenceTagCatalog=structuredClone(next);
 }else if(entry.type==='node-tags'){
  if(expected.some(item=>{const node=nodeById(item.id);return !node||JSON.stringify(node.referenceTagIds||[])!==JSON.stringify(item.tags);}))return {ok:false,error:'节点标签已发生变化，暂不能恢复'};
  next.forEach(item=>{nodeById(item.id).referenceTagIds=[...item.tags];});
 }else if(entry.type==='groups'){
  if(JSON.stringify(referenceReadGroups(S))!==JSON.stringify(expected))return {ok:false,error:'分组已发生其他变化，暂不能恢复'};
  S.referenceGroups={version:1,groups:structuredClone(next)};
 }else if(entry.type==='positions'){
  if(expected.some(p=>{const n=nodeById(p.id);return !n||n.x!==p.x||n.y!==p.y;}))return {ok:false,error:'节点位置已发生其他变化，暂不能恢复'};
  next.forEach(p=>Object.assign(nodeById(p.id),{x:p.x,y:p.y}));
 }else if(entry.type==='edge'){
  if(!nodeById(entry.from)||!nodeById(entry.to))return {ok:false,error:'原连接的内容已不存在，无法恢复'};
  const present=S.edges.some(edge=>edge[0]===entry.from&&edge[1]===entry.to);
  if(present!==expected)return {ok:false,error:'连接已发生其他变化，暂不能恢复'};
  if(next&&studioCanvasCycle(entry.from,entry.to))return {ok:false,error:'恢复连接会形成循环，暂不能恢复'};
  S.edges=S.edges.filter(edge=>edge[0]!==entry.from||edge[1]!==entry.to);if(next)S.edges.push([entry.from,entry.to]);
 }
 source.pop();destination.push(structuredClone(entry));S.revision++;canvasSelectedLink=null;
 return {ok:true};
}
function canvasHistoryButtonsHtml(){
 return [['撤销','undo','undo',S.canvasUndo],['重做','redo','rotate',S.canvasRedo]].map(([label,action,icon,stack])=>`<button class="icon-btn tip" aria-label="${label}" data-action="${action}" ${stack?.length?'':'disabled'}>${I(icon)}</button>`).join('');
}
function canvasLinkPath(from,to){
 const s=nodeById(from),t=nodeById(to);if(!s||!t)return null;
 const sh=document.querySelector(`[data-node="${s.id}"]`)?.offsetHeight||s.h,th=document.querySelector(`[data-node="${t.id}"]`)?.offsetHeight||t.h;
 const x1=s.x+s.w,y1=s.y+sh/2,x2=t.x,y2=t.y+th/2,bend=Math.max(90,Math.abs(x2-x1)*.5);
 return {d:`M${x1} ${y1}C${x1+bend} ${y1},${x2-bend} ${y2},${x2} ${y2}`,x:(x1+x2)/2,y:(y1+y2)/2};
}
function canvasLinkPanelSync(){
 document.querySelector('.canvas-link-panel')?.remove();if(!canvasSelectedLink)return;
 const {from,to}=canvasSelectedLink,source=nodeById(from),target=nodeById(to),vp=document.getElementById('viewport'),path=canvasLinkPath(from,to);
 if(!vp||!path||!S.edges.some(edge=>edge[0]===from&&edge[1]===to)){canvasSelectedLink=null;return;}
 const editable=canvasLinkEditable(from,to),reference=studioAssetReferenceRead(target).some(ref=>ref.sourceId===from);
 vp.insertAdjacentHTML('beforeend',`<aside class="canvas-link-panel" aria-label="连接详情"><div><strong>${esc(source.title)} ${I('arrow')} ${esc(target.title)}</strong><small>${editable?(reference?'制作参考 · 断开不影响已有结果':'内容关系 · 不作为制作参考'):'结构连接 · 在剧本或时间线中调整'}</small></div>${editable?iconBtn('断开连接','canvas-link-remove','trash'):''}${iconBtn('关闭连接详情','canvas-link-close','close')}</aside>`);
 const panel=vp.querySelector('.canvas-link-panel'),left=document.querySelector('.canvas-navigator')?.offsetWidth||0;
 panel.style.left=Math.max(left+12,Math.min(vp.clientWidth-panel.offsetWidth-12,S.pan.x+path.x*S.zoom-panel.offsetWidth/2))+'px';
 panel.style.top=Math.max(12,Math.min(vp.clientHeight-panel.offsetHeight-60,S.pan.y+path.y*S.zoom+14))+'px';
}
function handleCanvasLinkAction(action){
 if(!action.startsWith('canvas-link-'))return false;
 if(action==='canvas-link-remove'&&canvasSelectedLink){const result=studioRemoveCanvasLink(canvasSelectedLink.from,canvasSelectedLink.to);if(!result.ok){toast(result.error);return true;}canvasSelectedLink=null;render();save();toast('连接已断开，已有结果保留');}
 if(action==='canvas-link-close'){canvasSelectedLink=null;drawEdges();}
 return true;
}
function studioFinishCanvasConnection(from,to){
 const result=studioConnectCanvasNodes(from,to);
 if(!result.ok){toast(result.error||'无法建立连接');return false;}
 connecting=null;canvasSelectedLink=null;render();save();toast(result.changed===false?'这份连接已存在':result.editingInput?'已连接剪辑素材，原版本保留':result.relationOnly?'已建立内容关系，不作为制作参考':'制作参考已添加，已有结果保留');return true;
}
function canvasPreviewLink(x,y){
 const svg=document.getElementById('connections'),vp=document.getElementById('viewport'),source=nodeById(canvasLinkDrag?.from);if(!svg||!vp||!source)return;
 let path=svg.querySelector('#canvas-link-preview');if(!path){path=document.createElementNS('http://www.w3.org/2000/svg','path');path.id='canvas-link-preview';path.classList.add('canvas-link-preview');svg.append(path);}
 const r=vp.getBoundingClientRect(),x1=source.x+source.w,y1=source.y+(document.querySelector(`[data-node="${source.id}"]`)?.offsetHeight||source.h)/2,x2=(x-r.left-S.pan.x)/S.zoom,y2=(y-r.top-S.pan.y)/S.zoom;
 path.setAttribute('d',`M${x1} ${y1}C${x1+90} ${y1},${x2-90} ${y2},${x2} ${y2}`);
}
function canvasClearLinkDrag(){document.getElementById('canvas-link-preview')?.remove();document.querySelectorAll('.canvas-drop-target').forEach(el=>el.classList.remove('canvas-drop-target'));canvasLinkDrag=null;}
document.addEventListener('pointerdown',event=>{
 const port=event.target.closest('[data-port-out]');if(!port||event.button!==0)return;
 canvasLinkDrag={from:port.dataset.portOut,x:event.clientX,y:event.clientY,pointerId:event.pointerId,moved:false};
});
document.addEventListener('pointermove',event=>{
 if(!canvasLinkDrag)return;canvasLinkDrag.moved||=Math.abs(event.clientX-canvasLinkDrag.x)+Math.abs(event.clientY-canvasLinkDrag.y)>5;if(!canvasLinkDrag.moved)return;
 canvasPreviewLink(event.clientX,event.clientY);document.querySelectorAll('.canvas-drop-target').forEach(el=>el.classList.remove('canvas-drop-target'));
 const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-node]');if(target&&target.dataset.node!==canvasLinkDrag.from)target.classList.add('canvas-drop-target');
});
document.addEventListener('pointerup',event=>{
 if(!canvasLinkDrag)return;const state=canvasLinkDrag,target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-node]');canvasClearLinkDrag();
 if(state.moved){canvasLinkClickUntil=performance.now()+300;event.preventDefault();if(target)studioFinishCanvasConnection(state.from,target.dataset.node);else toast('未连接到内容，原参考保持不变');}
});
document.addEventListener('pointercancel',canvasClearLinkDrag);
window.addEventListener('blur',canvasClearLinkDrag);
document.addEventListener('click',event=>{
 if(performance.now()<canvasLinkClickUntil){event.preventDefault();event.stopImmediatePropagation();return;}
 const link=event.target.closest('[data-link-from]');if(!link)return;event.preventDefault();event.stopImmediatePropagation();canvasSelectedLink={from:link.dataset.linkFrom,to:link.dataset.linkTo};S.selected=null;if(S.panel==='selection')S.panel=null;render();
},true);
document.addEventListener('keydown',event=>{
 if(currentModal||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
 const link=event.target.closest('[data-link-from]');if(link&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();canvasSelectedLink={from:link.dataset.linkFrom,to:link.dataset.linkTo};S.selected=null;if(S.panel==='selection')S.panel=null;render();return;}
 if(!canvasSelectedLink)return;
 if(['Delete','Backspace'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();handleCanvasLinkAction('canvas-link-remove');}
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();handleCanvasLinkAction('canvas-link-close');}
});
