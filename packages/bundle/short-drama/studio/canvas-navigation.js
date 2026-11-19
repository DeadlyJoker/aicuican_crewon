/* Searchable project navigation and camera recovery for the local design Demo. */
'use strict';

function canvasNavigationGroups(nodes, scenes=[]){
 const assigned=new Set(),groups=[];
 const take=(id,title,predicate)=>{
  const members=nodes.filter(n=>!assigned.has(n.id)&&predicate(n));
  if(!members.length)return;
  members.forEach(n=>assigned.add(n.id));groups.push({id,title,nodes:members});
 };
 take('story','故事与设定',n=>['story','text'].includes(n.kind));
 take('characters','角色',n=>n.kind==='character');
 take('scenes','场景',n=>n.kind==='scene');
 for(const scene of scenes){const ids=new Set(scene.shots.map(n=>n.id));take('scene-'+scene.id,scene.title,n=>ids.has(n.id));}
 take('images','图片',n=>n.kind==='image');
 take('videos','镜头与视频',n=>['shot','video'].includes(n.kind));
 take('editing','剪辑与合成',n=>['video-compose','quick-cut'].includes(n.kind));
 take('sound','声音',n=>['voice','audio'].includes(n.kind));
 take('final','交付作品',n=>n.kind==='final');
 take('other','其他内容',()=>true);
 return groups;
}
function canvasFilteredNavigationGroups(groups,query){
 const term=query.trim().toLocaleLowerCase();if(!term)return groups;
 return groups.map(g=>({...g,nodes:g.title.toLocaleLowerCase().includes(term)?g.nodes:g.nodes.filter(n=>(n.title+' '+n.label).toLocaleLowerCase().includes(term))})).filter(g=>g.nodes.length);
}
/** Keep explicit memberships and label remaining screenplay, shot and media sections. */
function canvasManagedGroups(nodes,groups,kind='all'){
 const types={image:['character','scene','image'],video:['shot','video','video-remake'],text:['story','text','note'],audio:['voice','audio']};
 const visible=nodes.filter(n=>!types[kind]||types[kind].includes(n.kind)),byId=new Map(visible.map(n=>[n.id,n])),claimed=new Set();
 const result=groups.map(g=>({id:g.id,title:g.name,nodes:g.nodeIds.filter(id=>{if(!byId.has(id)||claimed.has(id))return false;claimed.add(id);return true;}).map(id=>byId.get(id))})).filter(g=>g.nodes.length);
 const remaining=canvasNavigationGroups(visible.filter(n=>!claimed.has(n.id)));return [...remaining.filter(group=>group.id==='story'),...result,...remaining.filter(group=>group.id!=='story')];
}
function canvasCurrentNavigationGroups(){const groups=canvasManagedGroups(S.nodes,typeof referenceReadGroups==='function'?referenceReadGroups(S):[],canvasNavigatorState().kind);return typeof referenceFilterTaggedGroups==='function'?referenceFilterTaggedGroups(groups):groups;}
function canvasNavigatorState(){
 S.canvasNavigation??={};const key=S.projectKind+':'+S.project;
 const state=S.canvasNavigation[key]??={query:'',folded:{},scrollTop:0,mapVisible:false};
 state.searchOpen??=!!state.query;return state;
}
/** Restore the browsing position after a temporary search within the same view. */
function canvasNavigatorQuery(state,query){
 const view=JSON.stringify([state.kind||'all',!!state.grid,state.tagFilter||null]),active=!!query.trim();
 if(!state.query.trim()&&active)state.searchScroll={top:state.scrollTop,view};
 state.query=query;
 if(active)state.scrollTop=0;
 else{if(state.searchScroll?.view===view)state.scrollTop=state.searchScroll.top;delete state.searchScroll;}
}
function canvasNavigatorListHtml(){
 const state=canvasNavigatorState(),all=canvasCurrentNavigationGroups(),groups=canvasFilteredNavigationGroups(all,state.query);
 const count=groups.reduce((sum,g)=>sum+g.nodes.length,0);
 return `<p class="canvas-nav-count" role="status">${state.query?'找到':'共'} ${count} 项内容${typeof referenceActiveTagName==='function'&&referenceActiveTagName()?` · ${esc(referenceActiveTagName())}`:''}</p>${groups.map(g=>{
  const folded=!state.query&&!!state.folded[g.id];
  const heading=`<button class="canvas-nav-group-heading" data-action="canvas-nav-fold:${esc(g.id)}" aria-expanded="${!folded}" ${state.query?'disabled':''}>${I('chev')}${I('folder')}<span>${esc(g.title)}</span><small>${g.nodes.length}</small></button>`;
  return `<section class="canvas-nav-group ${g.title?'':'ungrouped'} ${state.grid?'is-grid-group':''}">${typeof referenceTagGroupHeader==='function'?referenceTagGroupHeader(g,heading,state):heading}${folded?'':`<div class="canvas-nav-items ${state.grid?'is-grid':''}">`+g.nodes.map(n=>{
   const thumb=`<span class="canvas-nav-thumb">${studioNodePreviewHtml(n)}</span>`;
   const row=`<button class="canvas-nav-row tip ${S.selected===n.id?'active':''}" data-nav-node="${n.id}" data-focus="${n.id}" aria-label="定位${esc(n.title)}" aria-current="${S.selected===n.id}">${thumb}<span>${esc(n.title)}</span>${n.referenceOnly?'<small>草稿</small>':''}</button>`;return typeof referenceTagRow==='function'?referenceTagRow(n,row,state):row;
  }).join('')+'</div>'}</section>`;
 }).join('')}${count?'':'<div class="canvas-nav-empty">没有找到相关内容<button data-action="canvas-nav-reset">重置筛选</button></div>'}`;
}
function canvasNavigatorHtml(){
 const state=canvasNavigatorState();
 const tabs=[['all','全部'],['image','图片'],['video','视频'],['text','文本'],['audio','音频']];
 return `<aside class="project-nav canvas-navigator ${state.grid?'is-grid-mode':''}" aria-label="节点管理">${canvasNavigatorResizeHtml()}<header>${state.searchOpen?`<input id="canvas-node-search" type="search" aria-label="搜索画布内容" placeholder="搜索节点名称" value="${esc(state.query)}">`:`<strong>节点管理</strong>${iconBtn('折叠或展开全部分组','canvas-nav-fold-all','layers')}${iconBtn(state.grid?'列表视图':'网格视图','canvas-nav-grid',state.grid?'list':'grid')}${typeof referenceTagHeader==='function'?referenceTagHeader():''}`}${iconBtn(state.searchOpen?'关闭搜索':'搜索','canvas-nav-search',state.searchOpen?'close':'search')}${iconBtn('收起面板','canvas-outline','close')}</header><div class="canvas-nav-types" role="tablist" aria-label="节点类型">${tabs.map(([id,label])=>`<button role="tab" aria-selected="${(state.kind||'all')===id}" data-action="canvas-nav-kind:${id}">${label}</button>`).join('')}</div><div class="canvas-nav-scroll" id="canvas-nav-list">${canvasNavigatorListHtml()}</div>${typeof referenceTagFooter==='function'?referenceTagFooter():''}</aside>`;
}
function restoreCanvasNavigator(){const list=document.getElementById('canvas-nav-list');if(list){list.scrollTop=canvasNavigatorState().scrollTop;canvasApplyNavigatorWidth(canvasNavigatorState().width);if(typeof referenceSyncBatchSelection==='function')referenceSyncBatchSelection();}}
function refreshCanvasNavigator(){
 const list=document.getElementById('canvas-nav-list');if(!list)return;
 list.innerHTML=canvasNavigatorListHtml();list.scrollTop=canvasNavigatorState().scrollTop;if(typeof referenceSyncBatchSelection==='function')referenceSyncBatchSelection();
}
function syncCanvasNavigatorSelection(){document.querySelectorAll('[data-nav-node]').forEach(el=>{const active=el.dataset.navNode===S.selected;el.classList.toggle('active',active);el.setAttribute('aria-current',String(active));});}
function syncCanvasRecovery(){
 const vp=document.getElementById('viewport');if(!vp)return;
 let hint=vp.querySelector('.canvas-return-hint');
 if(!hint){hint=document.createElement('div');hint.className='canvas-return-hint';hint.innerHTML='<span>画布内容在视野外</span><button data-action="canvas-nav-return">返回内容</button>';vp.append(hint);}
 const bounds=vp.getBoundingClientRect(),left=Math.max(bounds.left,document.querySelector('.canvas-navigator')?.getBoundingClientRect().right||bounds.left),visible=[...vp.querySelectorAll('.node')].some(el=>{const r=el.getBoundingClientRect();return r.right>left&&r.left<bounds.right&&r.bottom>bounds.top&&r.top<bounds.bottom;});
 hint.hidden=S.view!=='canvas'||!S.nodes.length||visible;
 const bottom=vp.querySelector('.canvas-bottom');if(bottom)bottom.dataset.mapVisible=String(canvasNavigatorState().mapVisible);
}
function handleCanvasNavigatorAction(action){
 const [key,id]=action.split(':');if(!key.startsWith('canvas-nav-'))return false;
 const state=canvasNavigatorState();
 if(key==='canvas-nav-fold'){state.folded[id]=!state.folded[id];refreshCanvasNavigator();}
 else if(key==='canvas-nav-fold-all'){
  const groups=canvasCurrentNavigationGroups().filter(g=>g.title),fold=!groups.every(g=>state.folded[g.id]);groups.forEach(g=>state.folded[g.id]=fold);refreshCanvasNavigator();
 }else if(key==='canvas-nav-kind'){state.kind=id;state.scrollTop=0;render();
 }else if(key==='canvas-nav-grid'){state.grid=!state.grid;render();
 }else if(key==='canvas-nav-search'){state.searchOpen=!state.searchOpen;if(!state.searchOpen)canvasNavigatorQuery(state,'');render();document.getElementById('canvas-node-search')?.focus();
 }else if(key==='canvas-nav-reset'){state.query='';delete state.searchScroll;state.kind='all';state.tagFilter=null;state.scrollTop=0;render();
 }else if(key==='canvas-nav-clear'){
  canvasNavigatorQuery(state,'');const input=document.getElementById('canvas-node-search');if(input){input.value='';input.focus();}refreshCanvasNavigator();
 }else if(key==='canvas-nav-return'){if(nodeById(S.selected))focusNode(S.selected);else fitCanvas();}
 else if(key==='canvas-nav-map'){
  state.mapVisible=!state.mapVisible;syncCanvasRecovery();drawMinimap();const button=document.querySelector('[data-action="canvas-nav-map"]');button.setAttribute('aria-pressed',String(state.mapVisible));
 }
 save();return true;
}
document.addEventListener('input',event=>{
 if(event.target.id!=='canvas-node-search')return;
 const state=canvasNavigatorState();canvasNavigatorQuery(state,event.target.value);refreshCanvasNavigator();save();
});
document.addEventListener('scroll',event=>{if(event.target.id==='canvas-nav-list'){canvasNavigatorState().scrollTop=event.target.scrollTop;save();}},true);
document.addEventListener('keydown',event=>{
 if(event.defaultPrevented||S.screen!=='canvas'||currentModal)return;
 if(event.target.id==='viewport'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
  const step=event.shiftKey?320:80;S.pan.x+=event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0;S.pan.y+=event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0;applyCamera();save();event.preventDefault();return;
 }
 if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'&&!event.target.isContentEditable&&!event.target.matches('textarea,input:not(#canvas-node-search)')){
  if(!S.outlineOpen||!canvasNavigatorState().searchOpen){S.outlineOpen=true;canvasNavigatorState().searchOpen=true;render();}const input=document.getElementById('canvas-node-search');input.focus();input.select();event.preventDefault();event.stopImmediatePropagation();
 }else if(event.target.id==='canvas-node-search'&&event.key==='Escape'){
  if(event.target.value)handleCanvasNavigatorAction('canvas-nav-clear');else{canvasNavigatorState().searchOpen=false;render();document.querySelector('[data-action="canvas-nav-search"]')?.focus();}event.preventDefault();
 }
});

/** Resolve a stored sidebar width against the current viewport without rewriting it. */
function canvasNavigatorWidth(width,viewportWidth){
 const max=Math.min(800,Math.max(200,viewportWidth-20)),min=Math.min(280,max);
 return {min,max,value:Math.min(max,Math.max(min,Number.isFinite(width)?width:300))};
}
function canvasNavigatorResizeHtml(){
 const size=canvasNavigatorWidth(canvasNavigatorState().width,window.innerWidth);
 return `<button class="canvas-nav-resize" role="separator" aria-orientation="vertical" aria-label="调节面板宽度" aria-valuemin="${size.min}" aria-valuemax="${size.max}" aria-valuenow="${Math.round(size.value)}"></button>`;
}
function canvasApplyNavigatorWidth(width){
 const size=canvasNavigatorWidth(width,window.innerWidth),panel=document.querySelector('.canvas-navigator');if(!panel)return;
 panel.closest('.studio-body').style.setProperty('--canvas-nav-width',size.value+'px');
 const handle=panel.querySelector('.canvas-nav-resize');handle.setAttribute('aria-valuemin',size.min);handle.setAttribute('aria-valuemax',size.max);handle.setAttribute('aria-valuenow',Math.round(size.value));
}
let canvasNavigatorResize=null;
function canvasFinishNavigatorResize(cancel=false){
 const gesture=canvasNavigatorResize;if(!gesture)return;canvasNavigatorResize=null;
 if(gesture.handle.hasPointerCapture(gesture.pointerId))gesture.handle.releasePointerCapture(gesture.pointerId);
 if(!cancel&&gesture.project===S.project){canvasNavigatorState().width=gesture.width;save();}
 canvasApplyNavigatorWidth(canvasNavigatorState().width);
}
document.addEventListener('pointerdown',event=>{
 const handle=event.target.closest('.canvas-nav-resize');if(!handle||event.button!==0)return;
 event.preventDefault();event.stopImmediatePropagation();const width=canvasNavigatorWidth(canvasNavigatorState().width,window.innerWidth).value;
 canvasNavigatorResize={handle,pointerId:event.pointerId,project:S.project,x:event.clientX,before:width,width};handle.setPointerCapture(event.pointerId);
},true);
document.addEventListener('pointermove',event=>{
 const gesture=canvasNavigatorResize;if(!gesture||event.pointerId!==gesture.pointerId)return;
 event.preventDefault();event.stopImmediatePropagation();gesture.width=canvasNavigatorWidth(gesture.before+event.clientX-gesture.x,window.innerWidth).value;canvasApplyNavigatorWidth(gesture.width);
},true);
document.addEventListener('pointerup',event=>{if(canvasNavigatorResize&&event.pointerId===canvasNavigatorResize.pointerId){event.preventDefault();event.stopImmediatePropagation();canvasFinishNavigatorResize();}},true);
document.addEventListener('pointercancel',()=>canvasFinishNavigatorResize(true),true);
window.addEventListener('blur',()=>canvasFinishNavigatorResize(true));
window.addEventListener('resize',()=>canvasApplyNavigatorWidth(canvasNavigatorState().width));
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&canvasNavigatorResize){event.preventDefault();event.stopImmediatePropagation();canvasFinishNavigatorResize(true);return;}
 if(!event.target.matches?.('.canvas-nav-resize')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.preventDefault();event.stopImmediatePropagation();const size=canvasNavigatorWidth(canvasNavigatorState().width,window.innerWidth),step=event.shiftKey?40:10;
 const width=event.key==='Home'?size.min:event.key==='End'?size.max:size.value+(event.key==='ArrowLeft'?-step:step);
 canvasNavigatorState().width=canvasNavigatorWidth(width,window.innerWidth).value;canvasApplyNavigatorWidth(canvasNavigatorState().width);save();
},true);
