/* Homepage audio preparation reuses the canvas model directory and parameter renderer. */
'use strict';
function referenceEntryAudioDraft(state){
 const draft=(state.referenceEntryCreationDrafts??={}).audio??={};
 if(!draft.creationAudioModelCode)referenceAudioChangeModel(draft,referenceAudioMode(draft)==='music'?'text-music-rhart-audio-music-2.5':'bytedance-doubao-seed-audio-1.0');
 return draft;
}
function referenceEntryAudioMode(state,mode){
 if(!['voice','music'].includes(mode))return false;
 const draft=referenceEntryAudioDraft(state);draft.creationAudioMode=mode;
 return referenceAudioChangeModel(draft,draft.creationAudioModelByMode?.[mode]||(mode==='music'?'text-music-rhart-audio-music-2.5':'bytedance-doubao-seed-audio-1.0'));
}
function referenceEntryAudioMarkup(html){return html.replaceAll('data-audio-','data-entry-audio-');}
function referenceEntryAudioControls(){
 const draft=referenceEntryAudioDraft(S),music=referenceAudioMode(draft)==='music';
 const picker=referenceAudioModelPickerHtml(draft).replace(/<button role="option"[^>]*data-audio-model-choice=""[\s\S]*?<\/button>/,'');
 const parameters=(music?'':referenceAudioProviderParametersHtml(draft)).replace(/(<summary[^>]*>)[\s\S]*?(<\/summary>)/,'$1默认'+I('down')+'$2');
 return referenceEntryKindButton()+`<details class="creation-audio-type" data-entry-audio-root><summary role="button" aria-label="声音类型">${music?'音乐':'语音'}${I('down')}</summary><div>${['voice','music'].map(mode=>`<button data-entry-audio-mode="${mode}" aria-pressed="${referenceAudioMode(draft)===mode}">${mode==='music'?'音乐':'语音'}</button>`).join('')}</div></details>`+referenceEntryAudioMarkup(picker+parameters);
}
function referenceRefreshEntryAudioParameters(){
 const details=document.querySelector('.ref-composer-footer .ref-audio-settings[open]');if(!details)return;
 const template=document.createElement('template');template.innerHTML=referenceEntryAudioMarkup(referenceAudioProviderParametersHtml(referenceEntryAudioDraft(S)));
 referenceReplaceParameterMenu(details,template.content.querySelector('.ref-audio-popover'),'.ref-audio-popover',['data-entry-audio-provider-choice','data-option-index','data-entry-audio-provider-reset'],positionReferenceAudioParameters);
}
document.addEventListener('click',event=>{
 const mode=event.target.closest('[data-entry-audio-mode]'),model=event.target.closest('[data-entry-audio-model-choice]'),choice=event.target.closest('[data-entry-audio-provider-choice]'),reset=event.target.closest('[data-entry-audio-provider-reset]');
 if(!mode&&!model&&!choice&&!reset){if(!event.target.closest('.ref-composer-footer details'))for(const open of document.querySelectorAll('.ref-composer-footer details[open]'))open.open=false;return;}
 event.preventDefault();event.stopImmediatePropagation();const draft=referenceEntryAudioDraft(S);
 if(mode||model){if(mode)referenceEntryAudioMode(S,mode.dataset.entryAudioMode);else referenceAudioChangeModel(draft,model.dataset.entryAudioModelChoice);save();referenceRenderEntryControls(mode?'[data-entry-audio-root]>summary':'.ref-audio-model-picker>summary');return;}
 const definition=referenceAudioDefinition(draft),values={...referenceAudioProviderParams(draft)};
 if(reset)for(const key of Object.keys(values))values[key]=definition.properties[key].default??null;
 else{const key=choice.dataset.entryAudioProviderChoice,property=definition.properties[key];values[key]=(property.type==='boolean'?[true,false]:property.options.map(referenceProviderOption).map(option=>option.value))[Number(choice.dataset.optionIndex)];}
 draft.creationAudioParamsByModel={...draft.creationAudioParamsByModel,[definition.code]:values};save();referenceRefreshEntryAudioParameters();
},true);
document.addEventListener('input',event=>{
 const key=event.target.dataset.entryAudioProviderRange||event.target.dataset.entryAudioProviderInput;
 if(key){
  const draft=referenceEntryAudioDraft(S),definition=referenceAudioDefinition(draft),value=Number(event.target.value),normalized=referenceNormalizeAudioProviderValue(definition,key,event.target.value);if(normalized===null)return;
  draft.creationAudioParamsByModel={...draft.creationAudioParamsByModel,[definition.code]:{...referenceAudioProviderParams(draft),[key]:normalized}};
  const other=document.querySelector(`[data-entry-audio-provider-${event.target.dataset.entryAudioProviderRange?'input':'range'}="${key}"]`);if(other)other.value=value;save();return;
 }
 if(!event.target.matches('.ref-composer-footer .ref-audio-model-picker input'))return;
 event.stopImmediatePropagation();const menu=event.target.closest('.ref-asset-model-menu'),query=event.target.value.trim().toLocaleLowerCase();let count=0;
 for(const option of menu.querySelectorAll('[data-entry-audio-model-choice]')){option.hidden=!(option.textContent+' '+(option.closest('[data-entry-audio-model-group]')?.getAttribute('aria-label')||'')).toLocaleLowerCase().includes(query);if(!option.hidden)count++;}
 for(const group of menu.querySelectorAll('[data-entry-audio-model-group]'))group.hidden=![...group.querySelectorAll('button')].some(option=>!option.hidden);
 menu.querySelector('[data-entry-audio-model-empty]').hidden=count>0;referencePositionAssetModels();
},true);
document.addEventListener('focusout',event=>{
 const key=event.target.dataset.entryAudioProviderInput;if(!key)return;
 const draft=referenceEntryAudioDraft(S),definition=referenceAudioDefinition(draft),normalized=referenceNormalizeAudioProviderValue(definition,key,event.target.value);
 if(normalized!==null)draft.creationAudioParamsByModel={...draft.creationAudioParamsByModel,[definition.code]:{...referenceAudioProviderParams(draft,definition),[key]:normalized}};
 const config=definition.config.find(item=>item.paramName===key),value=referenceAudioProviderParams(draft,definition)[key];
 const display=config.paramExt?.multiplierSet?Number((1+value/100).toFixed(2)):value??'';
 event.target.value=display;const range=document.querySelector(`[data-entry-audio-provider-range="${key}"]`);if(range)range.value=display;save();
},true);
document.addEventListener('toggle',event=>{
 if(!event.target.open||!event.target.closest?.('.ref-composer-footer')||!event.target.matches('details'))return;
 for(const other of document.querySelectorAll('.ref-composer-footer details[open]'))if(other!==event.target)other.open=false;
 requestAnimationFrame(()=>{positionReferenceAudioType();positionReferenceAudioParameters();referencePositionAssetModels();});
},true);
document.addEventListener('keydown',event=>{
 const root=event.target.closest?.('.ref-composer-footer details');if(!root)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();root.open=false;root.querySelector('summary')?.focus({preventScroll:true});return;}
 if(!root.matches('.ref-audio-model-picker')||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 if(event.target.matches('input')&&['Home','End'].includes(event.key))return;
 const items=[...root.querySelectorAll('[data-entry-audio-model-choice]')].filter(item=>!item.hidden),index=items.indexOf(document.activeElement);if(!items.length)return;
 const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:items.length-1))%items.length;event.preventDefault();event.stopImmediatePropagation();items[next].focus();
},true);
if(S.screen==='home'&&S.referenceMode==='create'&&referenceEntryKind(S).id==='audio')referenceRenderEntryControls();
