/* Canvas audio voices have their own directory; role presets retain their earlier picker. */
'use strict';
let referenceAudioVoiceLibrary=null;
const referenceRoleVoicePicker=referenceOpenVoicePicker;
/** Filter observed display names without substituting provider-specific identifiers. */
function referenceAudioVoiceMatches(rows,{query='',gender='',language='',favoritesOnly=false},favorites=[]){
 const text=query.trim().toLocaleLowerCase();
 return rows.filter(row=>(!text||`${row.name} ${row.labels}`.toLocaleLowerCase().includes(text))&&(!gender||row.labels.includes(gender))&&(!language||row.labels.split(' · ')[0]===language)&&(!favoritesOnly||favorites.includes(row.id)));
}
function referenceAudioVoiceDirectory(d){
 const definition=typeof referenceAudioDefinition==='function'?referenceAudioDefinition(d):null;
 if(!definition||definition.code.includes('doubao'))return referenceAudioVoiceCatalog.rows;
 const field=definition.config.find(item=>['modelVoiceType','listSelect'].includes(item.type));
 return (field?.optionValue||[]).map(option=>({id:option.value,name:option.labelCn||option.labelEn||option.value,labels:''}));
}
function referenceAudioVoiceRows(){
 const view=referenceAudioVoiceLibrary;if(!view)return '';
 const selected=canvasCreationDraft(nodeById(view.nodeId)).creationVoicePreset;
 const favorites=S.referenceAudioVoiceFavorites||[];
 const rows=referenceAudioVoiceMatches(view.rows,view,favorites);
 return rows.map(row=>`<div class="ref-audio-voice-row" role="listitem"><button class="icon-btn" type="button" disabled aria-label="${esc(row.name)}暂无试听" title="目录未提供本地试听音频">${I('audio')}</button><div><strong>${esc(row.name)}</strong><small>${esc(row.labels)}</small></div><button type="button" class="button outline" data-audio-voice-select="${row.id}" aria-label="选择 ${esc(row.name)}" ${selected?.id===row.id?'disabled':''}>${selected?.id===row.id?'已选择':'选择'}</button><button type="button" class="icon-btn" data-audio-voice-favorite="${row.id}" aria-label="${favorites.includes(row.id)?'取消收藏':'收藏'} ${esc(row.name)}" aria-pressed="${favorites.includes(row.id)}">${I('favorite-star')}</button></div>`).join('')||'<p class="ref-audio-voice-empty" role="status">没有匹配的音色</p>';
}
function referenceRefreshAudioVoiceRows(){
 const list=document.querySelector('[data-audio-voice-list]');if(!list)return;
 const scroll=list.scrollTop,active=document.activeElement;
 const favorite=active?.getAttribute('data-audio-voice-favorite');
 list.innerHTML=referenceAudioVoiceRows();list.scrollTop=scroll;
 if(favorite)list.querySelector(`[data-audio-voice-favorite="${favorite}"]`)?.focus({preventScroll:true});
 document.querySelector('[data-audio-voice-count]').textContent=`${list.querySelectorAll('[role=listitem]').length} 个音色`;
}
referenceOpenVoicePicker=function(nodeId=null){
 if(!nodeId){referenceRoleVoicePicker();return;}
 const node=nodeById(nodeId);if(!node)return;
 referenceCloseVoicePicker();referenceVoiceNodeId=nodeId;
 referenceAudioVoiceLibrary={nodeId,rows:referenceAudioVoiceDirectory(canvasCreationDraft(node)),query:'',gender:'',language:'',favoritesOnly:false};
 const selected=canvasCreationDraft(node).creationVoicePreset;
 const languages=[...new Set(referenceAudioVoiceLibrary.rows.map(row=>row.labels.split(' · ')[0]).filter(Boolean))];
 showDialog('音色选择',`<section class="ref-audio-voice-library"><div class="ref-audio-voice-controls"><div role="tablist" aria-label="音色分类"><button role="tab" aria-selected="true" data-audio-voice-tab="all">音色库</button><button role="tab" aria-selected="false" data-audio-voice-tab="favorites">收藏音色</button></div><input type="search" aria-label="搜索音色库" placeholder="搜索名称、语言或口音" data-audio-voice-search><button class="button outline" data-audio-voice-filter aria-expanded="false">${I('sliders')}筛选</button></div><div class="ref-audio-voice-filters" hidden><label>语言<select data-audio-voice-language aria-label="音色语言"><option value="">全部</option>${languages.map(language=>`<option>${esc(language)}</option>`).join('')}</select></label><label>性别<select data-audio-voice-gender aria-label="音色性别"><option value="">全部</option><option>女声</option><option>男声</option></select></label><button class="button ghost" data-audio-voice-reset>重置筛选</button></div>${selected?`<p class="ref-audio-voice-current">当前音色：${esc(selected.name)} <button data-audio-voice-clear>清除</button></p>`:''}<div class="ref-audio-voice-list" role="list" aria-label="音色目录" data-audio-voice-list>${referenceAudioVoiceRows()}</div><div class="ref-audio-voice-note"><span data-audio-voice-count>${referenceAudioVoiceLibrary.rows.length} 个音色</span><span>原站目录展示 · 未连接合成与试听服务</span></div></section>`,btn('取消','close-modal','outline'));
 document.querySelector('[data-audio-voice-search]')?.focus({preventScroll:true});
};
document.addEventListener('input',event=>{
 if(!event.target.matches('[data-audio-voice-search]')||!referenceAudioVoiceLibrary)return;
 referenceAudioVoiceLibrary.query=event.target.value;referenceRefreshAudioVoiceRows();
});
document.addEventListener('change',event=>{
 const field=event.target;if(!referenceAudioVoiceLibrary)return;
 if(field.matches('[data-audio-voice-language]'))referenceAudioVoiceLibrary.language=field.value;
 else if(field.matches('[data-audio-voice-gender]'))referenceAudioVoiceLibrary.gender=field.value;
 else return;
 referenceRefreshAudioVoiceRows();
});
document.addEventListener('click',event=>{
 const library=event.target.closest('.ref-audio-voice-library');if(!library||!referenceAudioVoiceLibrary)return;
 const button=event.target.closest('button');if(!button)return;
 if(button.hasAttribute('data-audio-voice-filter')){const filters=library.querySelector('.ref-audio-voice-filters');filters.hidden=!filters.hidden;button.setAttribute('aria-expanded',String(!filters.hidden));return;}
 if(button.hasAttribute('data-audio-voice-tab')){referenceAudioVoiceLibrary.favoritesOnly=button.dataset.audioVoiceTab==='favorites';for(const tab of library.querySelectorAll('[role=tab]'))tab.setAttribute('aria-selected',String(tab===button));referenceRefreshAudioVoiceRows();return;}
 if(button.hasAttribute('data-audio-voice-reset')){referenceAudioVoiceLibrary.gender='';referenceAudioVoiceLibrary.language='';for(const select of library.querySelectorAll('select'))select.value='';referenceRefreshAudioVoiceRows();return;}
 if(button.hasAttribute('data-audio-voice-favorite')){const id=button.dataset.audioVoiceFavorite;const favorites=S.referenceAudioVoiceFavorites??=[];S.referenceAudioVoiceFavorites=favorites.includes(id)?favorites.filter(value=>value!==id):[...favorites,id];save();referenceRefreshAudioVoiceRows();return;}
 if(button.hasAttribute('data-audio-voice-select')||button.hasAttribute('data-audio-voice-clear')){
  const row=referenceAudioVoiceLibrary.rows.find(item=>item.id===button.dataset.audioVoiceSelect);
  const node=nodeById(referenceAudioVoiceLibrary.nodeId);if(!node)return;
  (S.nodeDrafts[node.id]??={}).creationVoicePreset=row?{id:row.id,name:row.name,directory:canvasCreationDraft(node).creationAudioModelCode||'doubao-display-study'}:null;
  closeDialog();referenceAudioVoiceLibrary=null;save();refreshCanvasCreation();frameCanvasNodeControls();document.querySelector('[data-canvas-voice]')?.focus({preventScroll:true});
 }
});
