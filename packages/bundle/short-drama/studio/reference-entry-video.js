/* Homepage video preparation reuses the canvas catalog and parameter renderers. */
'use strict';
function referenceEntryVideoDraft(state){return (state.referenceEntryCreationDrafts??={}).video??={};}
function referenceResetEntryVideoDraft(state){const draft=referenceEntryVideoDraft(state);delete draft.creationVideoFamily;delete draft.creationVideoMode;delete draft.creationVideoProvider;}
function referenceEntryVideoPlan(state){
 const refs=(state.referenceEntryMedia?.create||[]).map(item=>({sourceId:item.id,candidateId:item.id,sourceKind:item.type==='视频'?'video':'image'}));
 return canvasVideoReferencePlan(referenceEntryVideoDraft(state),refs);
}
function referenceEntryVideoCanStart(state){const binding=referenceVideoBinding(referenceEntryVideoDraft(state));return !!binding&&!binding.error&&!referenceEntryVideoPlan(state).error;}
function referenceEntryVideoMarkup(html){
 return html.replaceAll('data-model-','data-entry-video-model-').replaceAll('data-video-family','data-entry-video-family').replaceAll('data-provider-choice','data-entry-video-provider-choice').replaceAll('data-provider-input','data-entry-video-provider-input').replaceAll('data-provider-range','data-entry-video-provider-range').replace(/<div class="ref-model-legacy">[\s\S]*?<\/div>/,'<div class="ref-model-legacy"><button data-entry-video-model-clear>清除模型选择</button></div>');
}
function referenceEntryVideoControls(){
 const draft=referenceEntryVideoDraft(S),binding=referenceVideoBinding(draft);
 const picker=referenceEntryVideoMarkup(referenceVideoModelPickerHtml(null,draft)).replace('<details ','<details data-entry-video ').replace('跟随项目模型','请选择模型');
 const parameters=binding&&!binding.error?referenceEntryVideoMarkup(referenceProviderParametersHtml(null,draft,binding)).replaceAll('<details ','<details data-entry-video '):'<button class="ref-entry-video-default" disabled title="请先选择模型">默认</button>';
 return referenceEntryKindButton()+picker+parameters;
}
function referenceEntryVideoModesHtml(){
 const draft=referenceEntryVideoDraft(S),binding=referenceVideoBinding(draft);if(!binding||binding.error)return '';
 return `<div class="ref-entry-video-modes" role="group" aria-label="视频创作方式">${binding.family.modes.map(mode=>`<button data-entry-video-mode="${mode.id}" aria-pressed="${draft.creationVideoMode===mode.id}">${esc(mode.label)}</button>`).join('')}${draft.creationVideoMode==='frames'&&referenceEntryVideoPlan(S).active.length===2?`<button data-entry-video-swap aria-label="交换首尾帧" title="交换首尾帧">${I('rotate')}</button>`:''}</div>${referenceEntryVideoPlan(S).error?`<p class="ref-entry-mode-notice" role="status">${esc(referenceEntryVideoPlan(S).error)}</p>`:''}`;
}
function referenceRefreshEntryVideoModels(){
 const menu=document.querySelector('[data-entry-video].ref-video-models[open] .ref-model-popover');if(!menu)return;
 const scroll=menu.querySelector('.ref-model-categories').scrollTop,active=document.activeElement,brand=active?.dataset.entryVideoModelBrand,filter=active?.dataset.entryVideoModelFilter;
 menu.innerHTML=referenceEntryVideoMarkup(referenceVideoModelMenuHtml(referenceEntryVideoDraft(S)));menu.querySelector('.ref-model-categories').scrollTop=scroll;
 [...menu.querySelectorAll('button')].find(button=>brand?button.dataset.entryVideoModelBrand===brand:filter&&button.dataset.entryVideoModelFilter===filter)?.focus({preventScroll:true});referencePositionModelPicker();
}
function referenceStoreEntryVideoValue(key,value){
 const draft=referenceEntryVideoDraft(S),binding=referenceVideoBinding(draft),property=binding?.definition?.properties[key];
 if(!property||property.readOnly||property.kind==='prompt')return false;
 draft.creationVideoProvider={modelCode:binding.mode.modelCode,params:referenceProviderUpdatedParams(draft,binding,key,value)};save();return true;
}
function referenceRefreshEntryVideoParameters(){
 const draft=referenceEntryVideoDraft(S),binding=referenceVideoBinding(draft),details=document.querySelector('[data-entry-video].ref-video-settings[open]');if(!binding||binding.error||!details)return;
 const template=document.createElement('template');template.innerHTML=referenceEntryVideoMarkup(referenceProviderParametersHtml(null,draft,binding));
 const basic=document.querySelector('[data-entry-video][data-provider-group="basic"]>summary'),nextBasic=template.content.querySelector('[data-provider-group="basic"]>summary');
 if(basic&&nextBasic){basic.innerHTML=nextBasic.innerHTML;basic.title=nextBasic.title;}
 const next=template.content.querySelector(`[data-provider-group="${details.dataset.providerGroup}"]`);
 referenceReplaceParameterMenu(details,next.querySelector('.ref-video-popover'),'.ref-video-popover',['data-entry-video-provider-choice','data-option-index','data-entry-video-provider-input','data-entry-video-provider-range'],positionReferenceVideoParameters);
}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-entry-video-swap],[data-entry-video-model-clear],[data-entry-video-model-brand],[data-entry-video-model-filter],[data-entry-video-family],[data-entry-video-mode],[data-entry-video-provider-choice]');if(!target)return;
 event.preventDefault();event.stopImmediatePropagation();const draft=referenceEntryVideoDraft(S);
 if(target.hasAttribute('data-entry-video-swap')){draft.creationReverseFrames=!draft.creationReverseFrames;save();referenceRenderEntryControls('[data-entry-video-swap]');return;}
 if(target.hasAttribute('data-entry-video-model-clear')){referenceResetEntryVideoDraft(S);save();referenceRenderEntryControls('[data-entry-video].ref-video-models>summary');return;}
 if(target.dataset.entryVideoModelBrand){referenceModelBrand=target.dataset.entryVideoModelBrand;referenceRefreshEntryVideoModels();return;}
 if(target.dataset.entryVideoModelFilter){const id=target.dataset.entryVideoModelFilter;referenceModelFilters=referenceModelFilters.includes(id)?referenceModelFilters.filter(value=>value!==id):[...referenceModelFilters,id];referenceRefreshEntryVideoModels();return;}
 if(target.dataset.entryVideoProviderChoice){const key=target.dataset.entryVideoProviderChoice,binding=referenceVideoBinding(draft),property=binding?.definition.properties[key];if(!property)return;const options=property.type==='boolean'?[{value:true},{value:false}]:property.options.map(referenceProviderOption);if(referenceStoreEntryVideoValue(key,options[Number(target.dataset.optionIndex)].value))referenceRefreshEntryVideoParameters();return;}
 const mode=target.dataset.entryVideoMode,result=mode?referenceSelectVideoMode(draft,mode,draft):referenceSelectVideoFamily(draft,target.dataset.entryVideoFamily,{...draft,creationVideoMode:referenceEntryVideoPlan(S).mode});
 if(mode?!result:!result.ok){toast(mode?'制作方式不可用':result.error);return;}
 save();referenceRenderEntryControls(mode?`[data-entry-video-mode="${mode}"]`:'[data-entry-video].ref-video-models>summary');
},true);
document.addEventListener('change',event=>{
 const key=event.target.dataset.entryVideoProviderInput;if(!key||!event.target.reportValidity())return;
 const property=referenceVideoBinding(referenceEntryVideoDraft(S))?.definition.properties[key];if(!property)return;
 if(referenceStoreEntryVideoValue(key,property.type==='string'?event.target.value:Number(event.target.value)))referenceRefreshEntryVideoParameters();
});
document.addEventListener('input',event=>{
 const key=event.target.dataset.entryVideoProviderRange;if(!key)return;
 if(referenceStoreEntryVideoValue(key,Number(event.target.value))){const number=document.querySelector(`[data-entry-video-provider-input="${key}"]`);if(number)number.value=event.target.value;}
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;const details=document.querySelector('[data-entry-video][open]');if(!details)return;
 event.preventDefault();event.stopImmediatePropagation();details.open=false;details.querySelector('summary')?.focus({preventScroll:true});
},true);
