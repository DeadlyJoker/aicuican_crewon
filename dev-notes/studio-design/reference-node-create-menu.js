/* Creation entries reuse existing node commands; unavailable professional tools stay disabled. */
'use strict';
function referenceCloseCreateMenu(restoreFocus=false){
 document.querySelector('.ref-create-menu')?.remove();const trigger=document.querySelector('[data-action="add-node"]');trigger?.setAttribute('aria-expanded','false');if(restoreFocus)trigger?.focus({preventScroll:true});
}
function referenceCreateEntry(kind,label,icon){return `<button role="menuitem" data-add="${kind}">${I(icon)}<span>${label}</span></button>`;}
function referenceCreateUnavailable(label,icon){return `<button role="menuitem" disabled title="尚未接入此专业能力">${I(icon)}<span>${label}</span></button>`;}
function referenceCreateGroup(label,icon,entries){return `<details class="ref-create-group"><summary role="menuitem" aria-haspopup="menu">${I(icon)}<span>${label}</span>${I('chev')}</summary><div role="menu" aria-label="${label}">${entries}</div></details>`;}
showAdd=function(){
 const old=document.querySelector('.add-popover');if(old){referenceCloseCreateMenu();return;}
 const tool=document.querySelector('.floating-tools');if(!tool)return;
 const basic=[['text','文本','file'],['image','图片','image'],['video','视频','video-media'],['voice','音频','audio-media']].map(item=>referenceCreateEntry(...item)).join('');
 const extra=[['character','角色参考','user'],['scene','场景参考','scene'],['shot','分镜镜头','film'],['note','灵感便签','edit']].map(item=>referenceCreateEntry(...item)).join('');
 document.body.insertAdjacentHTML('beforeend',`<div class="add-popover ref-create-menu" role="menu" aria-label="添加节点"><small>添加节点</small>${basic}${referenceCreateGroup('3D','grid',referenceCreateUnavailable('3D 世界','scene')+referenceCreateUnavailable('3D 模型','grid'))}${referenceCreateUnavailable('导演台','camera-control')}${referenceCreateGroup('影视创作','film',referenceCreateUnavailable('脚本策划','edit')+referenceCreateEntry('story','剧本工坊','script'))}${referenceCreateUnavailable('互动影游','layers')}${referenceCreateUnavailable('视频编辑器','production')}${referenceCreateUnavailable('AI 应用','spark')}${referenceCreateUnavailable('云片场','scene')}${referenceCreateUnavailable('分镜格子','grid')}${referenceCreateGroup('更多本地节点','more',extra)}<hr><small>添加资源</small><button role="menuitem" data-action="collection-inbox">${I('upload')}<span>收集箱与本地上传</span></button><button role="menuitem" data-action="works-import">${I('folder')}<span>从作品导入</span></button></div>`);
 const menu=document.querySelector('.ref-create-menu'),trigger=tool.querySelector('[data-action="add-node"]'),r=trigger.getBoundingClientRect(),header=document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||0;
 trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','true');
 menu.addEventListener('click',event=>{event.stopPropagation();const button=event.target.closest('button');if(!button||button.disabled)return;if(button.dataset.add){referenceCloseCreateMenu();addNode(button.dataset.add);}else if(button.dataset.action){referenceCloseCreateMenu();handleAction(button.dataset.action);}});
 menu.style.left=Math.min(innerWidth-menu.offsetWidth-12,r.right+10)+'px';menu.style.top=Math.max(header+12,Math.min(innerHeight-menu.offsetHeight-12,r.top))+'px';menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
};
document.addEventListener('toggle',event=>{
 const group=event.target;if(!group.matches?.('.ref-create-group')||!group.open)return;
 for(const other of group.parentElement.querySelectorAll('.ref-create-group[open]'))if(other!==group)other.open=false;
 const menu=group.querySelector('[role=menu]'),r=group.querySelector('summary').getBoundingClientRect(),safeTop=Math.max(12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||0)+8);
 menu.style.left=Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,r.right+8))+'px';menu.style.top=Math.max(safeTop,Math.min(innerHeight-menu.offsetHeight-12,r.top))+'px';
},true);
document.addEventListener('keydown',event=>{
 const root=event.target.closest?.('.ref-create-menu');if(!root)return;
 const submenu=event.target.closest('.ref-create-group[open]'),items=[...((submenu&&event.target.closest('[role=menu]')!==root)?submenu.querySelector('[role=menu]'):root).querySelectorAll(':scope > button:not(:disabled),:scope > details > summary')],index=items.indexOf(event.target);
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();if(!items.length)return;const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:items.length-1))%items.length;items[next].focus();return;}
 if(event.key==='Escape'||event.key==='ArrowLeft'){event.preventDefault();event.stopImmediatePropagation();if(submenu){submenu.open=false;submenu.querySelector('summary').focus();}else{referenceCloseCreateMenu(true);}return;}
 if(event.key==='ArrowRight'&&event.target.matches('summary')){event.preventDefault();event.stopImmediatePropagation();event.target.parentElement.open=true;event.target.parentElement.querySelector('button:not(:disabled)')?.focus();}
},true);
window.addEventListener('resize',()=>referenceCloseCreateMenu());
document.addEventListener('click',event=>{if(!event.target.closest('.ref-create-menu,[data-action="add-node"]'))referenceCloseCreateMenu();},true);
const referenceCreateMenuRender=render;
render=function(){referenceCloseCreateMenu();referenceCreateMenuRender();};
