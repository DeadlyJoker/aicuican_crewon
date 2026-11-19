/* Saved inputs are staged in the picker and imported only by its apply action. */
'use strict';
function studioSavedInputSource(state,item){
 return state.nodes.find(node=>{
  const candidate=node.candidates?.find(c=>c.id===node.adoptedCandidateId);
  if(!candidate)return false;
  const payload=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['id','number','savedAsset'].includes(key)));
  const sameVersion=referenceNodeEqual(payload(candidate),payload(item.candidate));
  return sameVersion&&(candidate.savedAsset?.assetId===item.id||item.project===state.project&&item.nodeId===node.id&&item.candidate.id===candidate.id);
 });
}
/** Import and reference saved versions as one reversible graph edit; failures retain the graph. */
function studioCommitSavedInputs(target,refs,items){
 const before=referenceCaptureNodeGraph(S),length=S.nodes.length,layout=Array.isArray(S.layoutBase)?structuredClone(S.layoutBase):null,next=[...refs];
 const rollback=()=>{S.nodes.splice(length);if(layout)S.layoutBase=layout;};
 for(const item of items){
  let node=studioSavedInputSource(S,item);
  if(!node){
   const result=referenceVaultImport(S,item,studioScriptId('saved-reference'),referenceVaultImportPosition(item));
   if(!result.ok){rollback();return result;}
   node=nodeById(result.id);
  }
  const snapshot=studioAssetSourceSnapshot(node);
  if(!snapshot){rollback();return {ok:false,error:'这个保存版本暂不能作为制作参考'};}
  if(!next.some(ref=>ref.sourceId===snapshot.sourceId))next.push(snapshot);
 }
 const result=studioApplyAssetReferences(target,next);
 if(!result.ok){rollback();return result;}
 if(result.changed||S.nodes.length!==length)studioRecordCanvasHistory(referenceNodeGraphPatch(before,referenceCaptureNodeGraph(S)));
 return result;
}
function studioSavedInputRows(){
 const state=studioAssetPickerState,query=state.query.trim().toLocaleLowerCase(),target=nodeById(state.targetId),vault=referenceVaultData(S);
 const items=vault.items.filter(item=>studioAssetSourceKinds.has(item.kind)&&(!['shot','video'].includes(item.kind)||['shot','video'].includes(target?.kind))&&(!state.savedFolder||item.folderId===state.savedFolder)&&(state.category==='all'||(state.category==='sound'?['voice','audio'].includes(item.kind):state.category==='video'?['shot','video'].includes(item.kind):state.category===item.kind))&&(!query||item.title.toLocaleLowerCase().includes(query)));
 if(!items.length)return `<div class="studio-asset-empty" role="status">${I('folder')}<span>${query?'没有匹配的资产':'暂无保存的素材'}</span>${query?'<button data-action="asset-picker-clear-search">清空搜索</button>':''}</div>`;
 return items.map(item=>{
  const source=studioSavedInputSource(S,item),checked=!!state.savedInputs?.[item.id]||!!source&&state.refs.some(ref=>ref.sourceId===source.id),folder=vault.folders.find(f=>f.id===item.folderId),available=source?.id!==state.targetId&&Number.isSafeInteger(item.candidate?.frame);
  return `<div class="studio-asset-picker-row ${checked?'selected':''}"><label class="studio-asset-pick-label"><input type="checkbox" data-saved-input="${esc(item.id)}" aria-label="引用保存素材 ${esc(item.title)}" ${checked?'checked':''} ${available?'':'disabled'}>${studioAssetThumb({frame:item.candidate?.frame,sourceKind:item.kind})}<span class="studio-asset-pick-copy"><span title="${esc(item.title)}">${esc(item.title)}</span><small title="${esc(folder?.name||'')} · 保存版本 v${item.candidate.number}">${esc(folder?.name||studioAssetKindLabel(item.kind))} · v${item.candidate.number}${source?.id===state.targetId?' · 当前内容':available?'':' · 暂不可引用'}</small></span></label>${item.candidate.localMedia?`<button class="studio-saved-media-preview" data-saved-input-preview="${esc(item.id)}" aria-label="预览保存素材 ${esc(item.title)}">${I('play')}</button>`:''}</div>`;
 }).join('');
}
const studioSavedInputBaseRows=studioAssetPickerRows;
studioAssetPickerRows=function(){return studioAssetPickerState?.source==='saved'?studioSavedInputRows():studioSavedInputBaseRows();};
const studioSavedInputBaseRefresh=studioRefreshAssetPickerRows;
studioRefreshAssetPickerRows=function(){
 const active=document.activeElement?.dataset?.savedInput;
 studioSavedInputBaseRefresh();
 const state=studioAssetPickerState;if(!state)return;
 const count=document.getElementById('studio-asset-selected-count');
 if(count)count.textContent='已选 '+(state.refs.length+Object.keys(state.savedInputs||{}).length)+' 项';
 if(active)[...document.querySelectorAll('[data-saved-input]')].find(e=>e.dataset.savedInput===active)?.focus({preventScroll:true});
};
const studioSavedInputBaseRender=studioRenderAssetPicker;
studioRenderAssetPicker=function(){
 studioSavedInputBaseRender();
 const state=studioAssetPickerState,filters=document.querySelector('.studio-asset-picker-dialog .studio-asset-filters');if(!state||!filters)return;
 filters.insertAdjacentHTML('beforebegin',`<nav class="studio-asset-source-tabs" role="tablist" aria-label="参考来源"><button role="tab" aria-selected="${state.source!=='saved'}" data-action="asset-picker-source:canvas">画布</button><button role="tab" aria-selected="${state.source==='saved'}" data-action="asset-picker-source:saved">我的资产</button></nav>`);
 if(state.source==='saved'){
  const folders=referenceVaultData(S).folders;
  document.getElementById('studio-asset-search').placeholder='搜索我的资产';
  filters.insertAdjacentHTML('afterend',`<label class="studio-asset-folder-filter">保存位置<select aria-label="筛选资产文件夹" data-saved-input-folder><option value="">全部文件夹</option>${folders.map(f=>`<option value="${esc(f.id)}" ${state.savedFolder===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>`);
  document.querySelector('.studio-asset-picker-more').hidden=true;
  const hint=document.querySelector('.studio-asset-target>small');if(hint)hint.textContent='应用后加入保存版本，资产库原件不变';
 }
 studioRefreshAssetPickerRows();
};
const studioSavedInputBaseApply=studioApplyAssetPicker;
studioApplyAssetPicker=function(){
 const state=studioAssetPickerState,items=Object.values(state?.savedInputs||{});
 if(!items.length){studioSavedInputBaseApply();return;}
 const target=nodeById(state.targetId);
 if(state.project!==S.project||!target){toast('项目已切换，请重新选择参考');return;}
 const result=studioCommitSavedInputs(target,state.refs,items);
 if(!result.ok){state.error=result.error;studioRefreshAssetPickerRows();return;}
 studioAssetPickerState=null;closeDialog();render();save();toast('制作参考已更新，保存版本已加入项目');
};
const studioSavedInputBaseAction=handleStudioAssetAction;
handleStudioAssetAction=function(action){
 if(action.startsWith('asset-picker-source:')){
  const state=studioAssetPickerState;if(!state)return true;
  state.source=action.endsWith(':saved')?'saved':'canvas';state.query='';state.category='all';studioRenderAssetPicker();
  document.querySelector(`.studio-asset-source-tabs [aria-selected=true]`)?.focus({preventScroll:true});return true;
 }
 return studioSavedInputBaseAction(action);
};
document.addEventListener('change',event=>{
 const state=studioAssetPickerState;if(!state)return;
 if(event.target.matches('[data-saved-input-folder]')){state.savedFolder=event.target.value;studioRefreshAssetPickerRows();return;}
 const id=event.target.dataset?.savedInput;if(!id)return;
 const item=referenceVaultData(S).items.find(item=>item.id===id);if(!item)return;
 const source=studioSavedInputSource(S,item);state.savedInputs??={};
 if(event.target.checked){
  if(source){const ref=studioAssetSourceSnapshot(source);if(ref&&!state.refs.some(r=>r.sourceId===ref.sourceId))state.refs.push(ref);}
  else state.savedInputs[id]=structuredClone(item);
 }else{delete state.savedInputs[id];if(source)state.refs=state.refs.filter(ref=>ref.sourceId!==source.id);}
 state.error='';studioRefreshAssetPickerRows();
});

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-saved-input-preview]');if(!button)return;
 const item=referenceVaultData(S).items.find(item=>item.id===button.dataset.savedInputPreview);
 if(!item?.candidate.localMedia)return;event.preventDefault();event.stopPropagation();
 void referenceOpenCollectionPlayer({...item.candidate.localMedia,title:item.title},button);
});
