/* Audio model drafts are independent from adopted candidates and other audio models. */
'use strict';
function referenceAudioMode(d){return d.creationAudioMode==='music'?'music':'voice';}
function referenceAudioDefinition(d){return referenceAudioModelDefinitions.find(item=>item.code===d.creationAudioModelCode&&item.buckets.includes(referenceAudioMode(d)==='music'?'TEXT_MUSIC':'TEXT_AUDIO'));}
function referenceAudioModelLabel(code){
 if(code==='bytedance-doubao-seed-audio-1.0'||code==='text-music-bytedance-doubao-seed-audio-1.0')return 'Doubao 音频生成 1.0';
 if(code==='bytedance-doubao-seed-tts-2.0')return 'Doubao TTS 2.0';
 if(code==='text-audio-kling-lip-sync-tts')return '可灵对口型-语音合成';
 if(code==='text-music-rhart-audio-music-2.5')return 'MiniMax Music 2.5';
 return code.replace('text-audio-rhart-audio-speech-','MiniMax Speech ').replace(/-hd$/,' · HD').replace(/-turbo$/,' · Turbo');
}
/** Group only the models compatible with the current audio creation type. */
function referenceAudioModelGroups(d){
 const bucket=referenceAudioMode(d)==='music'?'TEXT_MUSIC':'TEXT_AUDIO';
 return ['Doubao','Kling','MiniMax'].map(vendor=>({vendor,models:referenceAudioModelDefinitions.filter(item=>item.buckets.includes(bucket)&&(vendor==='Doubao'?item.code.includes('doubao'):vendor==='MiniMax'?item.code.includes('rhart'):item.code.includes('kling')))})).filter(group=>group.models.length);
}
function referenceAudioModelPickerHtml(d){
 const legacy=d.creationModel==='quality'?'精细声音 · 旧示例':d.creationModel==='preview'?'低成本预览 · 旧示例':'跟随项目模型',definition=referenceAudioDefinition(d),label=definition?referenceAudioModelLabel(definition.code):d.creationAudioModelCode?'重新选择声音模型':legacy;
 return `<details class="ref-asset-model-picker ref-audio-model-picker"><summary role="button" aria-label="声音制作模型">${I('mic')}<span>${esc(label)}</span>${I('down')}</summary><div class="ref-asset-model-menu"><input aria-label="搜索声音模型" placeholder="搜索模型或供应商…" type="search"><div role="listbox" aria-label="声音模型"><button role="option" aria-selected="${!d.creationAudioModelCode}" data-audio-model-choice="">${legacy}</button>${referenceAudioModelGroups(d).map(group=>`<section data-audio-model-group role="group" aria-label="${group.vendor}"><small>${group.vendor}</small>${group.models.map(model=>`<button role="option" aria-selected="${definition?.code===model.code}" data-audio-model-choice="${esc(model.code)}">${esc(referenceAudioModelLabel(model.code))}</button>`).join('')}</section>`).join('')}<p data-audio-model-empty hidden>没有找到相关模型</p></div><small>研究目录 · 未连接生成服务</small></div></details>`;
}
/** Keep the existing per-model draft and voice restoration when selecting from a menu. */
function referenceChooseAudioModel(code){
 const n=canvasCreationNode();if(!n)return;const d=S.nodeDrafts[n.id]??={};Object.assign(d,canvasCreationDraft(n));
 if(referenceAudioChangeModel(d,code)){save();refreshCanvasCreation();frameCanvasNodeControls();document.querySelector('.ref-audio-model-picker>summary')?.focus({preventScroll:true});}
}
/** Return only parameters declared by the selected audio definition. */
function referenceAudioProviderParams(d,definition=referenceAudioDefinition(d)){
 if(!definition)return {};
 const stored=d.creationAudioParamsByModel?.[definition.code]||{};
 return Object.fromEntries(Object.entries(definition.properties).filter(([,p])=>!p.readOnly&&!['prompt','modelVoiceType','listSelect'].includes(p.kind)).map(([key,p])=>{const value=Object.hasOwn(stored,key)?stored[key]:p.default??null;const match=p.options?.map(referenceProviderOption).find(option=>option.value===value||(option.value!=null&&value!=null&&String(option.value)===String(value)));return [key,match?match.value:value];}));
}
/** Convert displayed audio values to the selected model's bounded native units. */
function referenceNormalizeAudioProviderValue(definition,key,raw){
 if(raw==='')return null;const value=Number(raw);if(!Number.isFinite(value))return null;
 const property=definition.properties[key],config=definition.config.find(item=>item.paramName===key);
 const native=config.paramExt?.multiplierSet?Math.round((value-1)*100):value;
 return Number(Math.max(property.min,Math.min(property.max,Math.round(native/(property.step||1))*(property.step||1))).toFixed(6));
}
/** Model changes retain earlier drafts while removing another model's active voice. */
function referenceAudioChangeModel(d,code){
 if(code&&!referenceAudioModelDefinitions.some(item=>item.code===code&&item.buckets.includes(referenceAudioMode(d)==='music'?'TEXT_MUSIC':'TEXT_AUDIO')))return false;
 const prior=d.creationAudioModelCode||'legacy';
 d.creationAudioVoicesByModel={...d.creationAudioVoicesByModel,[prior]:structuredClone(d.creationVoicePreset??null)};
 d.creationAudioModelCode=code;d.creationAudioModelByMode={...d.creationAudioModelByMode,[referenceAudioMode(d)]:code};
 d.creationVoicePreset=structuredClone(d.creationAudioVoicesByModel[code||'legacy']??null);
 const definition=referenceAudioDefinition(d);if(definition&&!definition.generateNum.includes(Number(d.creationCount)))d.creationCount=String(definition.generateNum[0]);
 return true;
}
function referenceAudioProviderParametersHtml(d){
 const definition=referenceAudioDefinition(d),params=referenceAudioProviderParams(d,definition);
 const fields=definition.config.filter(c=>c.display!==false&&!['prompt','modelVoiceType','listSelect','text'].includes(c.type));
 const content=fields.map(c=>{
  const p=definition.properties[c.paramName],ext=c.paramExt;
  const multiplier=ext?.multiplierSet;
  const value=multiplier?Number((1+Number(params[c.paramName])/100).toFixed(2)):params[c.paramName];
  const display=multiplier?{...p,min:ext.multiplierUnitMin,max:ext.multiplierUnitMax,step:ext.multiplierStep}:p;
  return referenceProviderParameterHtml(c.paramName,display,value,c.title).replaceAll('data-provider-choice','data-audio-provider-choice').replaceAll('data-provider-range','data-audio-provider-range').replaceAll('data-provider-input','data-audio-provider-input');
 }).join('');
 if(!content)return '';
 return `<details class="creation-settings ref-audio-settings"><summary role="button" aria-label="高级参数">${I('settings')}</summary><div class="ref-audio-popover ref-provider-parameters" role="group" aria-label="声音高级参数"><div class="ref-audio-reset"><button data-audio-provider-reset type="button">重置</button></div>${content}</div></details>`;
}
const referenceLegacyAudioParameters=referenceAudioParametersHtml;
referenceAudioParametersHtml=function(d){return referenceAudioDefinition(d)?referenceAudioProviderParametersHtml(d):referenceLegacyAudioParameters(d);};
const referenceLegacyAudioMediaParameters=canvasMediaParametersHtml;
canvasMediaParametersHtml=function(n,d){return mediaKind(n)==='audio'&&referenceAudioDefinition(d)?referenceAudioProviderParametersHtml(d):referenceLegacyAudioMediaParameters(n,d);};
const referenceLegacyCreationHtml=canvasCreationHtml;
canvasCreationHtml=function(){
 const html=referenceLegacyCreationHtml(),node=canvasCreationNode();if(!node||mediaKind(node)!=='audio')return html;
 const d=canvasCreationDraft(node),definition=referenceAudioDefinition(d);
 const result=html.replace(/<label class="creation-model">[\s\S]*?<\/label>/,referenceAudioModelPickerHtml(d));
 return definition?result.replace(/<label class="creation-count">[\s\S]*?<\/label>/,`<label class="creation-count"><select data-creation-setting="creationCount" aria-label="候选数量">${definition.generateNum.map(count=>`<option value="${count}" ${Number(d.creationCount)===count?'selected':''}>${count}×</option>`).join('')}</select></label>`):result;
};
const referenceLegacyMediaSettings=canvasMediaSettings;
canvasMediaSettings=function(n,d){
 const settings=referenceLegacyMediaSettings(n,d),definition=mediaKind(n)==='audio'?referenceAudioDefinition(d):null;
 return definition?{mediaType:'audio',model:definition.code,modelLabel:referenceAudioModelLabel(definition.code),mode:referenceAudioMode(d),providerParams:structuredClone(referenceAudioProviderParams(d,definition)),...(referenceAudioMode(d)==='music'?{musicStyle:d.creationMusicStyle||'',lyrics:d.creationLyrics||''}:d.creationVoicePreset?{voicePreset:structuredClone(d.creationVoicePreset)}:{})}:settings;
};
const referenceAudioModeAction=handleAction;
handleAction=function(action){
 if(action.startsWith('canvas-creation-audio-mode:')){
  const node=canvasCreationNode();if(node&&mediaKind(node)==='audio'){
   const mode=action.split(':')[1];if(!['voice','music'].includes(mode))return;
   const d=S.nodeDrafts[node.id]??={};
   const current=canvasCreationDraft(node),old=referenceAudioMode(current);
   d.creationAudioModelByMode={...current.creationAudioModelByMode,[old]:current.creationAudioModelCode||''};
   Object.assign(d,current);d.creationAudioMode=mode;referenceAudioChangeModel(d,d.creationAudioModelByMode[mode]||'');
   refreshCanvasCreation();frameCanvasNodeControls();save();return;
  }
 }
 referenceAudioModeAction(action);
};
function referenceRefreshAudioProviderMenu(){
 const details=document.querySelector('.ref-audio-settings[open]'),n=canvasCreationNode();if(!details||!n)return;
 const template=document.createElement('template');template.innerHTML=referenceAudioProviderParametersHtml(canvasCreationDraft(n));
 referenceReplaceParameterMenu(details,template.content.querySelector('.ref-audio-popover'),'.ref-audio-popover',['data-audio-provider-choice','data-option-index','data-audio-provider-reset'],positionReferenceAudioParameters);
}
document.addEventListener('click',event=>{
 const choice=event.target.closest('[data-audio-provider-choice]'),reset=event.target.closest('[data-audio-provider-reset]');if(!choice&&!reset)return;
 event.stopImmediatePropagation();const n=canvasCreationNode();if(!n)return;
 const d=S.nodeDrafts[n.id]??={},definition=referenceAudioDefinition(canvasCreationDraft(n));if(!definition)return;
 const values={...referenceAudioProviderParams(canvasCreationDraft(n),definition)};
 if(reset)for(const key of Object.keys(values))values[key]=definition.properties[key].default??null;
 else{const key=choice.dataset.audioProviderChoice,p=definition.properties[key],options=p.type==='boolean'?[true,false]:p.options.map(option=>referenceProviderOption(option).value);values[key]=options[Number(choice.dataset.optionIndex)];}
 d.creationAudioParamsByModel={...canvasCreationDraft(n).creationAudioParamsByModel,[definition.code]:values};save();referenceRefreshAudioProviderMenu();
});
document.addEventListener('input',event=>{
 const key=event.target.dataset.audioProviderRange||event.target.dataset.audioProviderInput;if(!key)return;
 const n=canvasCreationNode();if(!n)return;const d=S.nodeDrafts[n.id]??={},definition=referenceAudioDefinition(canvasCreationDraft(n));if(!definition)return;
 const value=Number(event.target.value),normalized=referenceNormalizeAudioProviderValue(definition,key,event.target.value);if(normalized===null)return;
 d.creationAudioParamsByModel={...canvasCreationDraft(n).creationAudioParamsByModel,[definition.code]:{...referenceAudioProviderParams(canvasCreationDraft(n),definition),[key]:normalized}};
 const other=document.querySelector(event.target.dataset.audioProviderRange?`[data-audio-provider-input="${key}"]`:`[data-audio-provider-range="${key}"]`);if(other)other.value=value;
 save();
});
document.addEventListener('change',event=>{
 if(event.target.matches('[data-audio-provider-input]')){const n=canvasCreationNode();if(!n)return;const d=canvasCreationDraft(n),definition=referenceAudioDefinition(d),key=event.target.dataset.audioProviderInput;if(!definition)return;const value=referenceAudioProviderParams(d,definition)[key],config=definition.config.find(item=>item.paramName===key);event.target.value=config.paramExt?.multiplierSet?Number((1+value/100).toFixed(2)):value??'';return;}
 if(!event.target.matches('[data-audio-model]'))return;
 referenceChooseAudioModel(event.target.value);
});

/** Follow the selected node when camera movement relocates its prompt controls. */
const referencePositionBeforeAudioMenus=positionCanvasNodeOverlays;
positionCanvasNodeOverlays=function(){
 referencePositionBeforeAudioMenus();
 const panel=document.querySelector('.canvas-creation');
 if(!panel||panel.hidden){for(const menu of document.querySelectorAll('.ref-audio-settings[open],.creation-audio-type[open],.ref-audio-model-picker[open]'))menu.open=false;return;}
 positionReferenceAudioType();positionReferenceAudioParameters();referencePositionAssetModels();
};
if(S.screen==='canvas'&&canvasCreationNode()&&mediaKind(canvasCreationNode())==='audio')render();

/** Search and keyboard interactions reuse the shared model-menu presentation. */
document.addEventListener('click',event=>{
 const choice=event.target.closest('[data-audio-model-choice]');if(!choice)return;
 event.preventDefault();event.stopImmediatePropagation();referenceChooseAudioModel(choice.dataset.audioModelChoice);
},true);
document.addEventListener('input',event=>{
 if(!event.target.matches('.ref-audio-model-picker input'))return;
 const menu=event.target.closest('.ref-asset-model-menu'),query=event.target.value.trim().toLocaleLowerCase();let count=0;
 for(const option of menu.querySelectorAll('[data-audio-model-choice]')){option.hidden=!(option.textContent+' '+(option.closest('[data-audio-model-group]')?.getAttribute('aria-label')||'')).toLocaleLowerCase().includes(query);if(!option.hidden)count++;}
 for(const group of menu.querySelectorAll('[data-audio-model-group]'))group.hidden=![...group.querySelectorAll('[data-audio-model-choice]')].some(option=>!option.hidden);
 menu.querySelector('[data-audio-model-empty]').hidden=count>0;referencePositionAssetModels();
});
document.addEventListener('toggle',event=>{
 if(event.target.matches?.('.ref-audio-model-picker[open]'))requestAnimationFrame(()=>event.target.querySelector('input')?.focus({preventScroll:true}));
},true);
document.addEventListener('keydown',event=>{
 const root=event.target.closest?.('.ref-audio-model-picker');if(!root||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 if(event.target.matches('input')&&['Home','End'].includes(event.key))return;
 const items=[...root.querySelectorAll('[data-audio-model-choice]')].filter(option=>!option.hidden);if(!items.length)return;
 root.open=true;const index=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:index<0?(event.key==='ArrowUp'?items.length-1:0):(index+(event.key==='ArrowDown'?1:items.length-1))%items.length;
 items[next].focus();event.preventDefault();event.stopImmediatePropagation();
},true);
