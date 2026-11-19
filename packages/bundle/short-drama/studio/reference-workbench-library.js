/* Asset reuse is staged in the open editor until its Save action commits it. */
'use strict';
let referenceWorkbenchLibrary=null;
/** Project-independent saved image snapshots remain usable when their source node changes. */
function referenceSavedImageLibraryEntries(state){
 const vault=state.referenceAssetVault;
 return (vault?.items||[]).filter(item=>item.candidate&&['image','character','scene'].includes(item.kind)).map(item=>{
  const folder=vault.folders.find(folder=>folder.id===item.folderId),category=({角色:'character',场景:'scene',道具:'prop'})[folder?.category]||item.kind;
  const candidate={...structuredClone(item.candidate),savedAsset:{assetId:item.id,project:item.project,nodeId:item.nodeId,candidateId:item.candidate.id}};
  return {key:item.id,sourceId:'saved:'+item.id,title:item.title,kind:item.kind,category,description:item.description||candidate.description||candidate.prompt||'',...(Object.hasOwn(item,'voicePreset')?{voicePreset:structuredClone(item.voicePreset)}:{}),candidate};
 });
}
function referenceLibraryEntries(){
 const state=referenceWorkbenchLibrary;if(!state)return [];
 const target=state.target||referenceWorkbenchAssetEditor,category=target.category,query=state.query.trim().toLocaleLowerCase();
 const entries=state.tab==='saved'?referenceSavedImageLibraryEntries(S):state.tab==='canvas'?S.nodes.map(node=>({key:node.id,sourceId:node.id,title:node.title,kind:node.kind,category:node.assetCategory==='prop'?'prop':node.kind,description:node.description||node.prompt||'',voicePreset:node.voicePreset||null,current:node.id===target.id,candidate:node.referenceOnly?null:studioAdoptedCandidate(node)})):studioExampleAssets.map(item=>({key:item.catalogId,sourceId:item.catalogId,title:item.title,kind:item.kind,category:item.label==='道具'?'prop':item.kind,description:item.description,candidate:{id:item.catalogId,number:1,frame:item.frame,prompt:item.description,description:item.description,sourceReferences:[],createdAt:null}}));
 return entries.filter(item=>(state.type==='image'?['image','character','scene'].includes(item.kind):item.category===category)&&(!query||(item.title+' '+item.description).toLocaleLowerCase().includes(query)));
}
function referenceOpenWorkbenchLibrary(target=null){
 referenceCloseWorkbenchLibrary(false);
 const background=target?document.getElementById('app'):document.querySelector('.ref-wb-asset-dialog');
 referenceWorkbenchLibrary={tab:'canvas',type:target?.category==='image'?'image':'asset',query:'',target,project:S.project,replacement:null,opener:document.activeElement,background,backgroundInert:background?.inert??false};if(background)background.inert=true;referenceDrawWorkbenchLibrary();
}
function referenceCloseWorkbenchLibrary(restoreFocus=true){
 const state=referenceWorkbenchLibrary;
 document.querySelector('.ref-wb-library-overlay')?.remove();referenceWorkbenchLibrary=null;if(state?.background?.isConnected)state.background.inert=state.backgroundInert;
 if(restoreFocus){const opener=state?.target?state.opener:document.querySelector('[data-wb-library-open]');if(opener?.isConnected)opener.focus({preventScroll:true});}
}
function referenceLibraryCards(){
 const entries=referenceLibraryEntries();return entries.length?entries.map(item=>`<article class="ref-wb-library-card ${referenceWorkbenchLibrary.replacement?.key===item.key?'is-selected':''}"><div class="${item.candidate?'still frame'+item.candidate.frame:'ref-wb-library-unmade'}" role="img" aria-label="${esc(item.title)}${item.candidate?'':'，暂无可用图片'}">${item.candidate?`<small class="ref-wb-library-version">${referenceWorkbenchLibrary.tab==='saved'?'已保存 ':''}v${item.candidate.number}</small>`:I('image')}<button data-wb-library-pick="${esc(item.key)}" ${!item.candidate||item.current?'disabled':''}>${item.current?'当前素材':item.candidate?(referenceWorkbenchLibrary.target?(referenceWorkbenchLibrary.replacement?.key===item.key?'已选':'选择'):'复用'):'暂无可用图片'}</button></div><span title="${esc(item.title)}">${esc(item.title)}</span></article>`).join(''):'<p class="ref-wb-library-empty">没有匹配的素材，试试其他名称或分类</p>';
}
function referenceDrawWorkbenchLibrary(){
 document.querySelector('.ref-wb-library-overlay')?.remove();const state=referenceWorkbenchLibrary;if(!state)return;
 const category={character:'角色',scene:'场景',prop:'道具',image:'图片'}[(state.target||referenceWorkbenchAssetEditor).category];
 document.getElementById('modal-root').insertAdjacentHTML('beforeend',`<div class="ref-wb-library-overlay"><section class="ref-wb-library" role="dialog" aria-label="${state.target?'替换图片':'选择复用素材'}" aria-modal="true"><header><nav aria-label="素材来源">${[['canvas','画布'],['saved','我的资产'],['examples','示例资产']].map(([key,label])=>`<button data-wb-library-tab="${key}" aria-pressed="${state.tab===key}">${label}</button>`).join('')}</nav><input data-wb-library-search aria-label="搜索名称或描述" placeholder="${state.tab==='saved'?'搜索我的资产':'搜索名称或描述'}" value="${esc(state.query)}"><button data-wb-library-close aria-label="关闭素材库">${I('close')}</button></header><nav class="ref-wb-library-types" aria-label="素材类型">${(category==='图片'?[['image','图片']]:[['asset',category],['image','图片']]).map(([key,label])=>`<button data-wb-library-type="${key}" aria-pressed="${state.type===key}">${label}</button>`).join('')}</nav><div class="ref-wb-library-grid">${referenceLibraryCards()}</div><footer>${state.target?`<span>${state.replacement?`替换为 ${esc(state.replacement.title)} · v${state.replacement.candidate.number}`:'选择替换图片，原有版本将保留'}</span><button class="button primary" data-canvas-replace-confirm ${state.replacement?'':'disabled'}>确认替换</button>`:'选择后只更新本次编辑，保存后生效'}</footer></section></div>`);
 document.querySelector(state.target?'[data-wb-library-close]':'[data-wb-library-search]').focus({preventScroll:true});
}
function referencePickWorkbenchLibrary(key){
 const item=referenceLibraryEntries().find(entry=>entry.key===key);if(!item?.candidate||item.current)return;
 if(referenceWorkbenchLibrary.target){referenceWorkbenchLibrary.replacement={...structuredClone(item),reuseId:studioScriptId('replaced-image')};referenceDrawWorkbenchLibrary();document.querySelector('[data-canvas-replace-confirm]')?.focus({preventScroll:true});return;}
 const editor=referenceWorkbenchAssetEditor;if(editor.upload){URL.revokeObjectURL(editor.upload.previewUrl);delete editor.upload;editor.beforeReuse=editor.uploadBefore;delete editor.uploadBefore;}
 const preview=document.querySelector('.ref-wb-asset-preview'),description=document.getElementById('ref-wb-asset-description'),note=document.querySelector('.ref-wb-asset-note');
 editor.beforeReuse??={description:description.value,voicePreset:structuredClone(editor.voicePreset),image:preview.querySelector('.ref-wb-asset-image').outerHTML,caption:preview.querySelector('.ref-wb-asset-preview-caption small').textContent,note:note.textContent};
 referenceWorkbenchAssetEditor.reuse={sourceId:item.sourceId,sourceTitle:item.title,candidate:structuredClone(item.candidate),id:studioScriptId('reused-output')};
 if(item.description.trim())document.getElementById('ref-wb-asset-description').value=item.description;
 if(Object.hasOwn(item,'voicePreset'))referenceWorkbenchAssetEditor.voicePreset=item.voicePreset?structuredClone(item.voicePreset):null;
 const voiceButton=document.querySelector('[data-wb-voice-open]');if(voiceButton)voiceButton.innerHTML=referenceVoiceTriggerContent(editor.voicePreset?.name);
 preview.querySelector('.ref-wb-asset-image').outerHTML=`<div class="ref-wb-asset-image still frame${item.candidate.frame}" role="img" aria-label="待复用：${esc(item.title)}"></div>`;
 preview.querySelector('.ref-wb-asset-preview-caption small').textContent='待保存';
 note.textContent='保存后生效，已有版本保留；素材未记录的信息沿用当前设置';
 if(!document.querySelector('[data-wb-reuse-revert]'))note.insertAdjacentHTML('afterend','<button class="ref-wb-reuse-revert" data-wb-reuse-revert>撤销本次复用</button>');
 referenceCloseWorkbenchLibrary();
}
function referenceRevertWorkbenchReuse(){
 const editor=referenceWorkbenchAssetEditor,before=editor?.beforeReuse;if(!before)return;
 document.getElementById('ref-wb-asset-description').value=before.description;editor.voicePreset=structuredClone(before.voicePreset);
 const preview=document.querySelector('.ref-wb-asset-preview');preview.querySelector('.ref-wb-asset-image').outerHTML=before.image;preview.querySelector('.ref-wb-asset-preview-caption small').textContent=before.caption;
 const voiceButton=document.querySelector('[data-wb-voice-open]');if(voiceButton)voiceButton.innerHTML=referenceVoiceTriggerContent(editor.voicePreset?.name);
 document.querySelector('.ref-wb-asset-note').textContent=before.note;document.querySelector('[data-wb-reuse-revert]')?.remove();delete editor.beforeReuse;delete editor.reuse;
 document.querySelector('[data-wb-library-open]')?.focus({preventScroll:true});
}
document.addEventListener('input',event=>{if(!event.target.matches('[data-wb-library-search]')||!referenceWorkbenchLibrary)return;referenceWorkbenchLibrary.query=event.target.value;document.querySelector('.ref-wb-library-grid').innerHTML=referenceLibraryCards();});
document.addEventListener('click',event=>{
 const target=event.target;
 if(target.closest('[data-wb-reuse-revert]')){event.preventDefault();referenceRevertWorkbenchReuse();return;}
 if(target.closest('[data-wb-library-open]')){event.preventDefault();referenceOpenWorkbenchLibrary();return;}
 if(!referenceWorkbenchLibrary)return;
 if(target.closest('[data-wb-library-close]')||target.matches('.ref-wb-library-overlay')){event.preventDefault();referenceCloseWorkbenchLibrary();return;}
 const tab=target.closest('[data-wb-library-tab]'),type=target.closest('[data-wb-library-type]'),pick=target.closest('[data-wb-library-pick]');
 if(tab){referenceWorkbenchLibrary.tab=tab.dataset.wbLibraryTab;referenceDrawWorkbenchLibrary();}
 if(type){referenceWorkbenchLibrary.type=type.dataset.wbLibraryType;referenceDrawWorkbenchLibrary();}
 if(pick)referencePickWorkbenchLibrary(pick.dataset.wbLibraryPick);
},true);
window.addEventListener('keydown',event=>{
 const dialog=document.querySelector('.ref-wb-library');if(!dialog)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseWorkbenchLibrary();return;}
 if(event.key==='Tab'){event.stopImmediatePropagation();const controls=[...dialog.querySelectorAll('button,input')].filter(control=>!control.disabled),index=controls.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0]?.focus();}}
},true);

const referenceWorkbenchLibraryAction=handleAction;
handleAction=function(action){
 if(action.startsWith('ref-wb-asset-library:')){
  referenceRememberWorkbenchScroll();referenceOpenWorkbenchAsset(action.slice('ref-wb-asset-library:'.length));
  if(referenceWorkbenchAssetEditor)referenceOpenWorkbenchLibrary();return;
 }
 referenceWorkbenchLibraryAction(action);
};
