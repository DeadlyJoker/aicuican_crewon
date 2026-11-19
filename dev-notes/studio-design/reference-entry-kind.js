/* Creation mode selects the appropriate local example without changing entered text. */
'use strict';
const referenceEntryKinds=[
 {id:'agent',name:'Agent',icon:'people',recipe:'blank'},
 {id:'image',name:'图片生成',icon:'image',recipe:'image'},
 {id:'video',name:'视频生成',icon:'film',recipe:'video'},
 {id:'model',name:'3D 模型',icon:'layers'},
 {id:'audio',name:'音频生成',icon:'mic',recipe:'audio'},
 {id:'motion',name:'动作模仿',icon:'pointer'}
];
function referenceEntryKind(state){const item=referenceEntryKinds.find(item=>item.id===state.referenceCreateKind&&item.recipe)||referenceEntryKinds[0];return item.id==='audio'&&state.referenceEntryCreationDrafts?.audio?.creationAudioMode==='music'?{...item,recipe:'audio-music'}:item;}
function referenceEntryKindButton(){const item=referenceEntryKind(S);return `<button class="button ghost" data-entry-kind-open aria-haspopup="menu" aria-expanded="false">${I(item.icon)}${item.name}</button>`;}
function referenceEntryImageDraft(state){
 const drafts=state.referenceEntryCreationDrafts??={},draft=drafts.image??={};
 if(!draft.creationImageFamily&&!draft.creationModel)referenceSelectAssetImageModel(draft,'text-image-rhart-image-g-2-official-text-to-image');
 referenceRebindAssetImageMode(draft,(state.referenceEntryMedia?.create||[]).some(item=>item.type==='图片')?'image':'text');
 return draft;
}
function referenceEntryCanStart(){return S.referenceMode!=='create'||referenceEntryKind(S).id!=='video'||referenceEntryVideoCanStart(S);}
function referenceEntryCreatePlaceholder(){return ({image:'描述你想生成的图片，包括主体、场景和风格',video:'描述你想生成的视频，包括画面、动作和镜头',audio:'输入配音文案或描述你想生成的声音'})[referenceEntryKind(S).id]||'描述你想创作的内容，例如：雨夜街头的一段电影镜头';}
function referenceEntryCreationControls(){
 const kind=referenceEntryKind(S).id;if(kind==='video')return referenceEntryVideoControls();if(kind==='audio'&&typeof referenceEntryAudioControls==='function')return referenceEntryAudioControls();const image=kind==='image';
 return referenceEntryKindButton()+(image?referenceAssetImageModelPicker(referenceEntryImageDraft(S),'entry')+referenceImageParametersHtml(referenceEntryImageDraft(S),'entry'):btn('自动','ref-auto','ghost','sliders')+btn('一键复刻','ref-remake','ghost','film'));
}
function referenceRenderEntryControls(focusSelector){
 const scroll=document.querySelector('.ref-home')?.scrollTop||0;render();const page=document.querySelector('.ref-home');if(page)page.scrollTop=scroll;document.querySelector(focusSelector)?.focus({preventScroll:true});
}
function referenceCloseEntryKind(restoreFocus=false){
 document.querySelector('.ref-entry-kind-menu')?.remove();const trigger=document.querySelector('[data-entry-kind-open]');trigger?.setAttribute('aria-expanded','false');if(restoreFocus)trigger?.focus({preventScroll:true});
}
function referenceOpenEntryKind(){
 if(document.querySelector('.ref-entry-kind-menu')){referenceCloseEntryKind(true);return;}
 const trigger=document.querySelector('[data-entry-kind-open]');if(!trigger)return;
 const rect=trigger.getBoundingClientRect(),width=Math.min(200,innerWidth-24),height=234,below=innerHeight-rect.bottom-12,above=rect.top-12;
 const top=below>=height||below>=above?rect.bottom+6:Math.max(12,rect.top-height-6),left=Math.max(12,Math.min(innerWidth-width-12,rect.left));
 const selected=referenceEntryKind(S).id;
 document.body.insertAdjacentHTML('beforeend',`<div class="ref-entry-kind-menu" role="menu" aria-label="创作模式" style="left:${left}px;top:${top}px;width:${width}px;max-height:${Math.max(40,innerHeight-top-12)}px">${referenceEntryKinds.map(item=>`<button role="menuitemradio" aria-checked="${selected===item.id}" data-entry-kind="${item.id}" ${item.recipe?'':'disabled title="当前 Demo 尚未复刻此能力"'}>${I(item.icon)}<span>${item.name}</span>${selected===item.id?I('check'):''}</button>`).join('')}</div>`);
 trigger.setAttribute('aria-expanded','true');document.querySelector('.ref-entry-kind-menu [aria-checked=true]')?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{
 const open=event.target.closest('[data-entry-kind-open]'),choice=event.target.closest('[data-entry-kind]');
 if(open){event.preventDefault();event.stopImmediatePropagation();referenceOpenEntryKind();return;}
 if(choice){
  event.preventDefault();event.stopImmediatePropagation();const item=referenceEntryKinds.find(item=>item.id===choice.dataset.entryKind&&item.recipe);if(!item)return;
  S.referenceCreateKind=item.id;referenceCloseEntryKind();render();save();document.querySelector('[data-entry-kind-open]')?.focus({preventScroll:true});return;
 }
 if(!event.target.closest('.ref-entry-kind-menu'))referenceCloseEntryKind();
},true);
document.addEventListener('keydown',event=>{
 const menu=document.querySelector('.ref-entry-kind-menu');if(!menu)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseEntryKind(true);return;}
 if(event.key==='Tab'){referenceCloseEntryKind();return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 const items=[...menu.querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:items.length-1))%items.length;
 event.preventDefault();event.stopImmediatePropagation();items[next]?.focus({preventScroll:true});
},true);
window.addEventListener('resize',()=>referenceCloseEntryKind());
document.addEventListener('scroll',event=>{const menu=document.querySelector('.ref-entry-kind-menu');if(menu&&!menu.contains(event.target))referenceCloseEntryKind();},true);
