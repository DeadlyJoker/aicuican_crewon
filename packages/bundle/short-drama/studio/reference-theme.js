/* Theme selection changes presentation only; project data and camera state are retained. */
'use strict';
function referenceCloseThemeMenu(){document.querySelector('.ref-theme-menu')?.remove();document.querySelector('[data-action="toggle-theme"]')?.setAttribute('aria-expanded','false');}
function referenceOpenThemeMenu(){
 if(document.querySelector('.ref-theme-menu')){referenceCloseThemeMenu();return;}
 const trigger=document.querySelector('[data-action="toggle-theme"]');if(!trigger)return;
 const rect=trigger.getBoundingClientRect(),width=132,left=Math.max(12,Math.min(innerWidth-width-12,rect.right-width)),top=Math.min(innerHeight-150,rect.bottom+6);
 document.body.insertAdjacentHTML('beforeend',`<div class="ref-theme-menu" role="menu" aria-label="主题" style="left:${left}px;top:${Math.max(12,top)}px">${[['dark','深色'],['light','浅色']].map(([key,name])=>`<button role="menuitemradio" aria-checked="${S.theme===key}" data-reference-theme="${key}"><span>${name}</span>${S.theme===key?I('check'):''}</button>`).join('')}</div>`);
 trigger.setAttribute('aria-expanded','true');document.querySelector('.ref-theme-menu [aria-checked=true]')?.focus();
}
const referenceThemeAction=handleAction;
handleAction=function(action){if(action==='toggle-theme'){referenceOpenThemeMenu();return;}referenceThemeAction(action);};
document.addEventListener('click',event=>{
 const choice=event.target.closest('[data-reference-theme]');
 if(choice){event.preventDefault();event.stopImmediatePropagation();S.theme=choice.dataset.referenceTheme;referenceCloseThemeMenu();render();document.querySelector('[data-action="toggle-theme"]')?.focus({preventScroll:true});return;}
 if(!event.target.closest('.ref-theme-menu,[data-action="toggle-theme"]'))referenceCloseThemeMenu();
},true);
window.addEventListener('keydown',event=>{
 const menu=document.querySelector('.ref-theme-menu');if(!menu)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseThemeMenu();document.querySelector('[data-action="toggle-theme"]')?.focus({preventScroll:true});return;}
 const options=[...menu.querySelectorAll('button')],index=options.indexOf(document.activeElement);
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:options.length-1))%options.length;options[next].focus();}
 if(event.key==='Tab')referenceCloseThemeMenu();
},true);
window.addEventListener('resize',referenceCloseThemeMenu);
