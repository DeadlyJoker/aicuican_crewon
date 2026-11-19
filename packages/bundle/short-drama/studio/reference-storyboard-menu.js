/* Nested choices are portaled so canvas transforms and parent scrolling cannot clip them. */
'use strict';
let referenceStoryboardSubmenu=null;
function referenceCloseStoryboardSubmenu(restoreFocus=false){
 const state=referenceStoryboardSubmenu;if(!state)return;
 referenceStoryboardSubmenu=null;state.menu.remove();state.trigger.setAttribute('aria-expanded','false');
 if(restoreFocus&&state.trigger.isConnected)state.trigger.focus({preventScroll:true});
}
function referenceOpenStoryboardSubmenu(trigger,focus=false){
 if(referenceStoryboardSubmenu?.trigger===trigger){if(focus)referenceStoryboardSubmenu.menu.querySelector('button')?.focus();return;}
 referenceCloseStoryboardSubmenu();
 const group=referenceStoryboardMenuItems[Number(trigger.dataset.storyboardGroup)];if(!group?.children)return;
 const menu=document.createElement('div');menu.className='reference-storyboard-submenu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',group.label);
 menu.innerHTML=group.children.map(label=>`<button role="menuitem" data-action="canvas-creation-tool:${esc(referenceStoryboardChoice(group,label))}">${esc(label)}</button>`).join('');
 document.body.append(menu);trigger.setAttribute('aria-expanded','true');referenceStoryboardSubmenu={trigger,menu};
 const r=trigger.getBoundingClientRect(),parent=trigger.parentElement.getBoundingClientRect(),safeTop=Math.max(12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||0)+8);
 menu.style.maxHeight=Math.max(48,innerHeight-safeTop-12)+'px';
 menu.style.left=Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,parent.right+menu.offsetWidth+4<=innerWidth-12?parent.right+4:parent.left-menu.offsetWidth-4))+'px';
 menu.style.top=Math.max(safeTop,Math.min(innerHeight-menu.offsetHeight-12,r.top))+'px';
 if(focus)menu.querySelector('button')?.focus({preventScroll:true});
}
document.addEventListener('pointerover',event=>{
 const root=event.target.closest('.reference-storyboard-menu[open]');if(!root)return;
 const trigger=event.target.closest('[data-storyboard-group]');if(trigger)referenceOpenStoryboardSubmenu(trigger);else if(event.target.closest('[role=menuitem],summary'))referenceCloseStoryboardSubmenu();
});
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-storyboard-group]');if(trigger){event.preventDefault();event.stopImmediatePropagation();referenceOpenStoryboardSubmenu(trigger,true);return;}
 if(!event.target.closest('.reference-storyboard-submenu'))referenceCloseStoryboardSubmenu();
},true);
window.addEventListener('keydown',event=>{
 const state=referenceStoryboardSubmenu,inside=state?.menu.contains(event.target),trigger=event.target.closest?.('[data-storyboard-group]');
 if(trigger&&event.key==='ArrowRight'){event.preventDefault();event.stopImmediatePropagation();referenceOpenStoryboardSubmenu(trigger,true);return;}
 if(!inside)return;
 if(['Escape','ArrowLeft','Tab'].includes(event.key)){
  referenceCloseStoryboardSubmenu(true);
  if(event.key==='Tab'){const root=document.querySelector('.reference-storyboard-menu');if(root){root.open=false;root.querySelector('summary').focus({preventScroll:true});}return;}
  event.preventDefault();event.stopImmediatePropagation();return;
 }
 if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 const items=[...state.menu.querySelectorAll('button')],at=items.indexOf(document.activeElement),index=event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowDown'?1:items.length-1))%items.length;
 event.preventDefault();event.stopImmediatePropagation();items[index].focus();
},true);
document.addEventListener('toggle',event=>{if(event.target.matches?.('.reference-storyboard-menu')&&!event.target.open)referenceCloseStoryboardSubmenu();},true);
document.addEventListener('scroll',event=>{if(referenceStoryboardSubmenu&&event.target.closest?.('.reference-storyboard-menu'))referenceCloseStoryboardSubmenu();},true);
window.addEventListener('resize',()=>referenceCloseStoryboardSubmenu());
const referenceStoryboardMenuRender=render;
render=function(){referenceCloseStoryboardSubmenu();referenceStoryboardMenuRender();};
