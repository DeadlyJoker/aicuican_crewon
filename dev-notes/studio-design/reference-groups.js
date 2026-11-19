/* Canvas groups keep explicit members; graph commands preserve media and references. */
'use strict';
const referenceScriptGroups=scriptCanvasGroups;
let referenceSelectedGroup=null,referenceGroupEditing=null,referenceGroupProject=S.project,referenceMultiSelection=[],referenceGroupResize=null;
function referenceGroupNodes(id){const group=referenceReadGroups(S).find(g=>g.id===id);return (group?.nodeIds||[]).map(nodeById).filter(Boolean);}
function referenceGroupLabel(id){return referenceReadGroups(S).find(g=>g.id===id)?.name||'';}
function referenceCommitGroups(groups){
 const before=referenceReadGroups(S),after=structuredClone(groups);
 if(JSON.stringify(before)===JSON.stringify(after))return;
 studioRecordCanvasHistory({type:'groups',before,after});S.referenceGroups={version:1,groups:after};S.revision++;save();refreshCanvasNavigator();
}
function referenceClearSingleSelection(){
 S.selected=null;S.panel=null;document.querySelectorAll('.node.selected').forEach(el=>el.classList.remove('selected'));document.querySelector('.selection-toolbar')?.remove();document.querySelector('.inspector')?.remove();refreshCanvasCreation();
}
function referenceSyncMultiSelection(){
 document.querySelectorAll('[data-node]').forEach(el=>el.classList.toggle('ref-multi-selected',referenceMultiSelection.includes(el.dataset.node)));
 referencePositionGroupToolbar();
}
function referenceMakeGroup(){
 const id=crypto.randomUUID(),result=referenceCreateGroup(S,referenceMultiSelection,id);if(!result.ok){toast(result.error);return;}
 referenceCommitGroups(result.groups);referenceMultiSelection=[];referenceSelectedGroup=id;render();referenceRefreshGroups();
}
scriptCanvasGroups=function(){
 if(referenceGroupProject!==S.project){referenceGroupProject=S.project;referenceSelectedGroup=null;referenceGroupEditing=null;referenceMultiSelection=[];}
 const base=S.projectKind==='drama'?referenceScriptGroups().replace(/<div class="world-label"[^>]*>角色与场景<\/div>/,''):'';
 return base+referenceReadGroups(S).map(({id:kind,color,frame})=>{
  const nodes=referenceGroupNodes(kind);if(!nodes.length)return '';
  let x=Math.min(...nodes.map(n=>n.x))-24,y=Math.min(...nodes.map(n=>n.y))-40;
  let right=Math.max(...nodes.map(n=>n.x+n.w))+24,bottom=Math.max(...nodes.map(n=>n.y+(document.querySelector(`[data-node="${n.id}"]`)?.offsetHeight||n.h)))+24;
  const sizing=referenceGroupResize?.id===kind?referenceGroupResize.preview:frame;
  if(sizing){right=x+sizing.dx+sizing.width;bottom=y+sizing.dy+sizing.height;x+=sizing.dx;y+=sizing.dy;}
  return `<div class="world-section ref-asset-group ${referenceSelectedGroup===kind?'group-selected':''}" data-asset-group="${kind}" style="left:${x}px;top:${y}px;width:${right-x}px;height:${bottom-y}px;${color?`background:rgba(${referenceGroupColors.find(item=>item.id===color).rgb},.12);border-color:rgba(${referenceGroupColors.find(item=>item.id===color).rgb},.35)`:''}"><div class="world-section-label"><button class="ref-group-name" data-group-name="${kind}" aria-pressed="${referenceSelectedGroup===kind}" aria-label="${esc(referenceGroupLabel(kind))}，双击编辑组名">${esc(referenceGroupLabel(kind))}</button></div></div>`;
 }).join('');
};
function referenceRefreshGroups(){
 const groups=document.getElementById('script-groups');if(groups)groups.innerHTML=scriptCanvasGroups();
 referencePositionGroupToolbar();
}
function referencePositionGroupToolbar(){
 document.querySelector('.ref-group-toolbar')?.remove();document.querySelector('.ref-group-resizers')?.remove();
 if(S.screen!=='canvas')return;
 if(referenceMultiSelection.length>=2){referencePositionMultiToolbar();return;}
 if(!referenceSelectedGroup||S.selected)return;
 const group=document.querySelector(`[data-asset-group="${referenceSelectedGroup}"]`),vp=document.getElementById('viewport');if(!group||!vp)return;
 const r=group.getBoundingClientRect(),v=vp.getBoundingClientRect(),safeTop=Math.max(12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||v.top)-v.top+12);
 if(r.right<v.left||r.left>v.right||r.bottom<v.top+safeTop||r.top>v.bottom)return;
 referenceRenderGroupResizers(vp,r,v,safeTop);
 const left=Math.max(12,Math.min(v.width-232,r.left-v.left+r.width/2-116)),above=r.top-v.top-86,below=r.bottom-v.top+12,top=above>=safeTop?above:below+42<=v.height-12?below:Math.max(safeTop,v.height-52);
 vp.insertAdjacentHTML('beforeend',`<div class="ref-group-toolbar" style="left:${left}px;top:${top}px"><details class="ref-group-layout ref-group-colors"><summary aria-label="背景颜色" title="背景颜色">${I('theme')}</summary><div role="menu" aria-label="分组背景颜色">${referenceGroupColors.map(color=>`<button role="menuitemradio" aria-label="${color.name}" aria-checked="${referenceReadGroups(S).find(item=>item.id===referenceSelectedGroup)?.color===color.id}" data-group-color="${color.id}" style="--swatch:${color.rgb}" title="${color.name}"></button>`).join('')}</div></details><details class="ref-group-layout"><summary aria-label="布局">${I('grid')}布局<span aria-hidden="true" class="ref-group-caret">⌄</span></summary><div role="menu" aria-label="分组布局">${[['grid','宫格布局'],['horizontal','水平布局'],['vertical','垂直布局']].map(([mode,label])=>`<button role="menuitem" data-group-layout="${mode}">${label}</button>`).join('')}</div></details><span class="ref-group-separator"></span><button data-workflow-save-group>创建工作流</button><button class="ref-group-disband" data-group-disband aria-label="解组">${I('layers')}解组</button></div>`);
}
function referenceSelectGroup(kind){
 referenceMultiSelection=[];referenceSyncMultiSelection();
 if(S.selected)referenceClearSingleSelection();
 referenceSelectedGroup=kind;document.querySelectorAll('[data-asset-group]').forEach(el=>{const selected=el.dataset.assetGroup===kind;el.classList.toggle('group-selected',selected);el.querySelector('[data-group-name]')?.setAttribute('aria-pressed',String(selected));});referencePositionGroupToolbar();
}
function referencePositionMultiToolbar(){
 const selected=referenceMultiSelection.map(id=>document.querySelector(`[data-node="${id}"]`)).filter(Boolean);if(selected.length<2)return;
 const vp=document.getElementById('viewport'),v=vp.getBoundingClientRect(),rects=selected.map(el=>el.getBoundingClientRect());
 const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right)),top=Math.min(...rects.map(r=>r.top));
 const safeTop=Math.max(12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||v.top)-v.top+12);
 if(right<v.left||left>v.right||Math.max(...rects.map(r=>r.bottom))<v.top+safeTop||top>v.bottom)return;
 vp.insertAdjacentHTML('beforeend',`<div class="ref-group-toolbar ref-multi-toolbar" aria-label="已选 ${selected.length} 个节点" style="left:${Math.max(12,Math.min(v.width-236,(left+right)/2-v.left-112))}px;top:${Math.max(safeTop,Math.min(v.height-52,top-v.top-54))}px"><button data-group-save-assets ${referenceMultiSelection.some(id=>studioAdoptedCandidate(nodeById(id)))?'':'disabled'}>${I('image')}创建资产</button><button data-group-create>${I('layers')}打组</button></div>`);
}
function referenceEditGroup(kind){
 referenceSelectGroup(kind);referenceGroupEditing=kind;
 const label=document.querySelector(`[data-group-name="${kind}"]`);if(!label)return;
 label.outerHTML=`<input class="ref-group-name-input" data-group-name-input="${kind}" aria-label="组名" value="${esc(referenceGroupLabel(kind))}">`;
 const input=document.querySelector('[data-group-name-input]');input.focus({preventScroll:true});input.select();
}
function referenceFinishGroupName(input,commit){
 const kind=input.dataset.groupNameInput;if(referenceGroupEditing!==kind)return;
 referenceGroupEditing=null;
 if(commit){const groups=referenceReadGroups(S),group=groups.find(g=>g.id===kind);if(group){group.name=referenceGroupName(input.value,group.name);referenceCommitGroups(groups);}}
 referenceRefreshGroups();document.querySelector(`[data-group-name="${kind}"]`)?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{
 if(currentModal)return;
 const active=document.querySelector('[data-group-name-input]');if(active&&!active.contains(event.target))referenceFinishGroupName(active,true);
 const node=event.target.closest('.node');
 if(event.shiftKey&&node&&!event.target.closest('button,input,textarea,select')){
  event.preventDefault();event.stopImmediatePropagation();const id=node.dataset.node;
  if(!referenceMultiSelection.length&&S.selected)referenceMultiSelection=[S.selected];
  referenceMultiSelection=referenceMultiSelection.includes(id)?referenceMultiSelection.filter(key=>key!==id):[...referenceMultiSelection,id];
  referenceSelectedGroup=null;referenceClearSingleSelection();referenceSyncMultiSelection();return;
 }
 if(event.target.closest('[data-group-save-assets]')){event.preventDefault();event.stopImmediatePropagation();referenceVaultSaveSelection(referenceMultiSelection);return;}
 if(event.target.closest('[data-group-create]')){event.preventDefault();event.stopImmediatePropagation();referenceMakeGroup();return;}
 if(event.target.closest('[data-group-disband]')){
  event.preventDefault();event.stopImmediatePropagation();referenceCommitGroups(referenceReadGroups(S).filter(g=>g.id!==referenceSelectedGroup));referenceSelectedGroup=null;render();save();toast('已解组，节点与引用保留');return;
 }
 const color=event.target.closest('[data-group-color]');if(color){event.preventDefault();event.stopImmediatePropagation();const groups=referenceSetGroupColor(S,referenceSelectedGroup,color.dataset.groupColor);if(groups){referenceCommitGroups(groups);referenceRefreshGroups();document.querySelector('.ref-group-colors summary')?.focus();}return;}
 const name=event.target.closest('[data-group-name]');if(name){event.preventDefault();event.stopImmediatePropagation();referenceSelectGroup(name.dataset.groupName);return;}
 const layout=event.target.closest('[data-group-layout]');if(layout){
  event.preventDefault();event.stopImmediatePropagation();
  const nodes=referenceGroupNodes(referenceSelectedGroup),before=nodes.map(n=>({id:n.id,x:n.x,y:n.y}));
  const next=referenceGroupLayout(nodes.map(n=>({...n,h:document.querySelector(`[data-node="${n.id}"]`)?.offsetHeight||n.h})),layout.dataset.groupLayout);
  if(next.some((p,i)=>p.x!==before[i].x||p.y!==before[i].y)){
   studioRecordCanvasHistory({type:'positions',before,after:next});next.forEach(p=>Object.assign(nodeById(p.id),{x:p.x,y:p.y}));S.revision++;
   render();save();
  }
  referenceRefreshGroups();return;
 }
 if(event.target.closest('.ref-group-toolbar,.ref-group-resizers,[data-group-name-input]'))return;
 if(referenceSelectedGroup||referenceMultiSelection.length){referenceSelectedGroup=null;referenceGroupEditing=null;referenceMultiSelection=[];referenceSyncMultiSelection();referenceRefreshGroups();}
},true);
document.addEventListener('dblclick',event=>{const name=event.target.closest('[data-group-name]');if(name){event.preventDefault();event.stopImmediatePropagation();referenceEditGroup(name.dataset.groupName);}},true);
document.addEventListener('keydown',event=>{
 const input=event.target.closest('[data-group-name-input]');if(input&&['Enter','Escape'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();referenceFinishGroupName(input,event.key==='Enter');return;}
 const opened=document.querySelector('.ref-group-layout[open]');if(event.key==='Escape'&&opened){event.preventDefault();event.stopImmediatePropagation();opened.open=false;opened.querySelector('summary')?.focus();return;}
 if(event.key==='Escape'&&(referenceSelectedGroup||referenceMultiSelection.length)){event.preventDefault();event.stopImmediatePropagation();referenceSelectedGroup=null;referenceGroupEditing=null;referenceMultiSelection=[];referenceSyncMultiSelection();referenceRefreshGroups();}
},true);
document.addEventListener('focusout',event=>{if(event.target.matches('[data-group-name-input]'))referenceFinishGroupName(event.target,true);});
const referenceGroupApplyCamera=applyCamera;
applyCamera=function(){
 const input=document.querySelector('[data-group-name-input]');
 const pending=input?{kind:input.dataset.groupNameInput,value:input.value,start:input.selectionStart,end:input.selectionEnd}:null;
 referenceGroupApplyCamera();referencePositionGroupToolbar();
 if(pending){referenceEditGroup(pending.kind);const next=document.querySelector('[data-group-name-input]');if(next){next.value=pending.value;next.setSelectionRange(pending.start,pending.end);}}
};
referenceRefreshGroups();

document.addEventListener('toggle',event=>{
 const details=event.target;if(!details.matches?.('.ref-group-layout')||!details.open)return;
 document.querySelectorAll('.ref-group-layout[open]').forEach(other=>{if(other!==details)other.open=false;});
 const menu=details.querySelector('[role="menu"]'),r=menu.getBoundingClientRect(),v=document.getElementById('viewport').getBoundingClientRect();
 if(r.bottom>v.bottom-12){menu.style.top='auto';menu.style.bottom='38px';}
 menu.style.maxHeight=Math.max(70,v.height-120)+'px';
},true);
document.addEventListener('keydown',event=>{
 const details=event.target.closest('.ref-group-layout');if(!details?.open||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 const items=[...details.querySelectorAll('[role="menuitem"],[role="menuitemradio"]')],index=items.indexOf(document.activeElement);
 const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:(index+items.length-1)%items.length;
 event.preventDefault();event.stopImmediatePropagation();items[next].focus();
},true);

document.addEventListener('pointerdown',event=>{if(event.shiftKey&&event.target.closest('.node')&&!event.target.closest('button,input,textarea,select'))event.stopPropagation();},true);
const referenceGroupSelectNode=selectNode;
selectNode=function(id,edit=false){referenceMultiSelection=[];referenceSelectedGroup=null;referenceSyncMultiSelection();return referenceGroupSelectNode(id,edit);};

const referenceGroupCanvasLabels=canvasLabels;
canvasLabels=function(){return referenceGroupCanvasLabels()+`<div id="script-groups">${scriptCanvasGroups()}</div>`;};
if(S.screen==='canvas'&&S.projectKind!=='drama')render();

let referenceGroupDrag=null,referenceGroupIgnoreClickUntil=0;
function referenceApplyGroupPositions(positions){
 for(const p of positions){const n=nodeById(p.id);if(!n)continue;n.x=p.x;n.y=p.y;const el=document.querySelector(`[data-node="${p.id}"]`);if(el){el.style.left=p.x+'px';el.style.top=p.y+'px';}}
 drawEdges();syncCanvasRecovery();drawMinimap();referenceRefreshGroups();
}
function referenceFinishGroupMove(cancel=false){
 const state=referenceGroupDrag;if(!state)return;referenceGroupDrag=null;
 if(cancel){referenceApplyGroupPositions(state.before);}else if(state.changed){
  const after=state.before.map(p=>{const n=nodeById(p.id);return {id:p.id,x:n.x,y:n.y};});
  if(after.some((p,i)=>p.x!==state.before[i].x||p.y!==state.before[i].y)){studioRecordCanvasHistory({type:'positions',before:state.before,after});S.revision++;save();}
 }
 const vp=document.getElementById('viewport');vp?.classList.remove('group-dragging');
 if(vp?.hasPointerCapture(state.pointerId))vp.releasePointerCapture(state.pointerId);
 referenceGroupIgnoreClickUntil=performance.now()+300;
}
document.addEventListener('pointerdown',event=>{
 const group=event.target.closest('[data-asset-group]');if(!group||event.button!==0||S.mode==='pan'||spaceDown||event.target.closest('button,input,textarea,summary'))return;
 event.preventDefault();event.stopImmediatePropagation();const id=group.dataset.assetGroup;
 referenceSelectGroup(id);const vp=document.getElementById('viewport');
 referenceGroupDrag={id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,zoom:S.zoom,before:referenceGroupNodes(id).map(n=>({id:n.id,x:n.x,y:n.y})),changed:false};
 vp.classList.add('group-dragging');vp.setPointerCapture(event.pointerId);
},true);
document.addEventListener('pointermove',event=>{
 const state=referenceGroupDrag;if(!state||event.pointerId!==state.pointerId)return;
 event.preventDefault();event.stopImmediatePropagation();const dx=event.clientX-state.startX,dy=event.clientY-state.startY;
 if(!state.changed&&Math.abs(dx)+Math.abs(dy)<3)return;
 state.changed=true;referenceApplyGroupPositions(referenceTranslateGroup(state.before,dx/state.zoom,dy/state.zoom,S.referenceGridSnap));
},true);
document.addEventListener('pointerup',event=>{if(!referenceGroupDrag||event.pointerId!==referenceGroupDrag.pointerId)return;event.preventDefault();event.stopImmediatePropagation();referenceFinishGroupMove();},true);
document.addEventListener('pointercancel',()=>referenceFinishGroupMove(true),true);
window.addEventListener('blur',()=>referenceFinishGroupMove(true));
window.addEventListener('click',event=>{if(performance.now()<referenceGroupIgnoreClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
window.addEventListener('keydown',event=>{
 if(referenceGroupDrag&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceFinishGroupMove(true);return;}
 const title=event.target.closest('[data-group-name]');if(!title||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.ctrlKey||event.metaKey)return;
 event.preventDefault();event.stopImmediatePropagation();const id=title.dataset.groupName,step=event.shiftKey?40:10;
 const before=referenceGroupNodes(id).map(n=>({id:n.id,x:n.x,y:n.y}));
 const after=referenceTranslateGroup(before,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0,S.referenceGridSnap);
 referenceApplyGroupPositions(after);studioRecordCanvasHistory({type:'positions',before,after});S.revision++;save();document.querySelector(`[data-group-name="${id}"]`)?.focus({preventScroll:true});
},true);

/** Keep screen-sized resize targets above members, even when the frame crosses a card. */
function referenceRenderGroupResizers(vp,r,v,safeTop){
 const left=r.left-v.left,top=r.top-v.top,right=r.right-v.left,bottom=r.bottom-v.top;
 const points=[['nw','左上角',left,top],['n','上边', (left+right)/2,top],['ne','右上角',right,top],['e','右边',right,(top+bottom)/2],['se','右下角',right,bottom],['s','下边',(left+right)/2,bottom],['sw','左下角',left,bottom],['w','左边',left,(top+bottom)/2]];
 vp.insertAdjacentHTML('beforeend',`<div class="ref-group-resizers">${points.filter(([, ,x,y])=>x>=6&&x<=v.width-6&&y>=safeTop&&y<=v.height-6).map(([edge,label,x,y])=>`<button data-group-resize="${edge}" aria-label="调整分组${label}" title="拖动或用方向键调整分组${label}" style="left:${x}px;top:${y}px" class="ref-resize-${edge}"></button>`).join('')}</div>`);
}
function referenceFinishGroupResize(cancel=false){
 const gesture=referenceGroupResize;if(!gesture)return;referenceGroupResize=null;
 const vp=document.getElementById('viewport');if(vp?.hasPointerCapture(gesture.pointerId))vp.releasePointerCapture(gesture.pointerId);
 if(!cancel&&gesture.project===S.project&&gesture.changed){const groups=referenceReadGroups(S),group=groups.find(item=>item.id===gesture.id);if(group){group.frame=gesture.preview;referenceCommitGroups(groups);}}
 referenceRefreshGroups();referenceGroupIgnoreClickUntil=performance.now()+300;
}
document.addEventListener('pointerdown',event=>{
 const handle=event.target.closest('[data-group-resize]');if(!handle||event.button!==0)return;
 event.preventDefault();event.stopImmediatePropagation();
 const group=referenceReadGroups(S).find(item=>item.id===referenceSelectedGroup),el=document.querySelector(`[data-asset-group="${referenceSelectedGroup}"]`);if(!group||!el)return;
 const frame=group.frame||{dx:0,dy:0,width:el.offsetWidth,height:el.offsetHeight};
 referenceGroupResize={id:group.id,project:S.project,edge:handle.dataset.groupResize,pointerId:event.pointerId,x:event.clientX,y:event.clientY,zoom:S.zoom,before:frame,preview:frame,changed:false};
 document.getElementById('viewport').setPointerCapture(event.pointerId);
},true);
document.addEventListener('pointermove',event=>{
 const gesture=referenceGroupResize;if(!gesture||event.pointerId!==gesture.pointerId)return;
 event.preventDefault();event.stopImmediatePropagation();
 gesture.preview=referenceResizeGroupFrame(gesture.before,gesture.edge,(event.clientX-gesture.x)/gesture.zoom,(event.clientY-gesture.y)/gesture.zoom);
 gesture.changed=JSON.stringify(gesture.before)!==JSON.stringify(gesture.preview);referenceRefreshGroups();
},true);
document.addEventListener('pointerup',event=>{if(referenceGroupResize&&event.pointerId===referenceGroupResize.pointerId){event.preventDefault();event.stopImmediatePropagation();referenceFinishGroupResize();}},true);
document.addEventListener('pointercancel',()=>referenceFinishGroupResize(true),true);
window.addEventListener('blur',()=>referenceFinishGroupResize(true));
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&referenceGroupResize){event.preventDefault();event.stopImmediatePropagation();referenceFinishGroupResize(true);}},true);

window.addEventListener('keydown',event=>{
 const handle=event.target.closest?.('[data-group-resize]');
 if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.ctrlKey||event.metaKey)return;
 event.preventDefault();event.stopImmediatePropagation();
 const edge=handle.dataset.groupResize,group=referenceReadGroups(S).find(item=>item.id===referenceSelectedGroup),el=document.querySelector(`[data-asset-group="${referenceSelectedGroup}"]`);if(!group||!el)return;
 const step=event.shiftKey?40:10,frame=group.frame||{dx:0,dy:0,width:el.offsetWidth,height:el.offsetHeight};
 const next=referenceResizeGroupFrame(frame,edge,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);
 if(JSON.stringify(frame)!==JSON.stringify(next)){const groups=referenceReadGroups(S);groups.find(item=>item.id===group.id).frame=next;referenceCommitGroups(groups);referenceRefreshGroups();}
 document.querySelector(`[data-group-resize="${edge}"]`)?.focus({preventScroll:true});
},true);
