/* The observed creation policy remains a local preview preference, never payment authorization. */
'use strict';
S.referenceCreationPolicy=S.referenceCreationPolicy==='direct'?'direct':'ask';
let referencePendingCreationBrief=null,referencePendingCreationKind=null;
function referenceCloseCreationPolicy(){
 document.querySelector('.ref-start-policy-menu')?.remove();
 document.querySelector('.ref-start-policy-trigger')?.setAttribute('aria-expanded','false');
}
function referenceOpenCreationPolicy(){
 if(document.querySelector('.ref-start-policy-menu')){referenceCloseCreationPolicy();return;}
 const trigger=document.querySelector('.ref-start-policy-trigger');if(!trigger)return;
 const rect=trigger.getBoundingClientRect(),width=Math.min(274,innerWidth-24),height=122;
 const below=innerHeight-rect.bottom-18,top=below>=height?rect.bottom+6:Math.max(12,rect.top-height-6);
 const left=Math.max(12,Math.min(innerWidth-width-12,rect.right-width));
 document.body.insertAdjacentHTML('beforeend',`<div class="ref-start-policy-menu" role="menu" aria-label="生成前确认" style="left:${left}px;top:${top}px;width:${width}px">${[['direct','直接生成','无需确认，直接生成'],['ask','先询问我','生成前先向你确认']].map(([key,label,note])=>`<button role="menuitemradio" aria-checked="${S.referenceCreationPolicy===key}" data-reference-start-policy="${key}"><span><strong>${label}</strong><small>${note}</small></span>${S.referenceCreationPolicy===key?I('check'):''}</button>`).join('')}</div>`);
 trigger.setAttribute('aria-expanded','true');document.querySelector('.ref-start-policy-menu [aria-checked=true]')?.focus({preventScroll:true});
}
function referenceReviewCreation(){
 const brief=referenceEntryInput(S);if(!brief.trim())return;
 referencePendingCreationBrief=brief;referencePendingCreationKind=S.referenceCreateKind||'agent';
 const root=showDialog('确认创作内容',`<div class="ref-start-review-prompt">${esc(brief)}</div><p>将打开本地创作示例，不调用生成服务，不产生费用</p>`,`${btn('返回修改','close-modal','outline')}${btn('打开示例','ref-start-confirm','primary')}`);
 root.querySelector('.dialog').classList.add('ref-start-review');
}
const referenceStartPolicyAction=handleAction;
handleAction=function(action){
 if(action==='ref-start-policy'){referenceOpenCreationPolicy();return;}
 referenceCloseCreationPolicy();
 if(action==='ref-start'&&S.referenceMode==='create'&&S.referenceCreationPolicy==='ask'&&(!S.referenceCreateKind||S.referenceCreateKind==='agent')){referenceReviewCreation();return;}
 if(action==='ref-start-confirm'){
  if(!document.querySelector('.ref-start-review')||referencePendingCreationBrief===null)return;
  const brief=referencePendingCreationBrief,kind=referencePendingCreationKind;referencePendingCreationBrief=null;referencePendingCreationKind=null;
  if(S.referenceMode!=='create'||referenceEntryInput(S)!==brief||(S.referenceCreateKind||'agent')!==kind){closeDialog();toast('内容已变化，请重新确认');return;}
  closeDialog();referenceStartPolicyAction('ref-start');return;
 }
 referenceStartPolicyAction(action);
};
document.addEventListener('click',event=>{
 const choice=event.target.closest('[data-reference-start-policy]');
 if(choice){event.preventDefault();event.stopImmediatePropagation();S.referenceCreationPolicy=choice.dataset.referenceStartPolicy;
  referenceCloseCreationPolicy();const trigger=document.querySelector('.ref-start-policy-trigger');
  if(trigger){trigger.textContent=S.referenceCreationPolicy==='direct'?'直接生成':'先询问';trigger.focus({preventScroll:true});}save();return;
 }
 if(!event.target.closest('.ref-start-policy-menu,.ref-start-policy-trigger'))referenceCloseCreationPolicy();
},true);
window.addEventListener('keydown',event=>{
 const menu=document.querySelector('.ref-start-policy-menu');if(!menu)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseCreationPolicy();document.querySelector('.ref-start-policy-trigger')?.focus({preventScroll:true});return;}
 const controls=[...menu.querySelectorAll('button')],index=controls.indexOf(document.activeElement);
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const next=event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(event.key==='ArrowDown'?1:controls.length-1))%controls.length;controls[next].focus();}
 if(event.key==='Tab')referenceCloseCreationPolicy();
},true);
window.addEventListener('resize',referenceCloseCreationPolicy);
document.addEventListener('scroll',event=>{const menu=document.querySelector('.ref-start-policy-menu');if(menu&&!menu.contains(event.target))referenceCloseCreationPolicy();},true);
