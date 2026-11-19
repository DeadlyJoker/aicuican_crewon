/* Model families and parameter definitions are a dated, read-only design snapshot. */
'use strict';
const referenceVideoModeLabels={reference:'全能参考',text:'文生视频',images:'多图参考',frames:'首尾帧',first:'首帧',video:'视频参考',edit:'视频编辑',extend:'视频延长'};
let referenceModelBrand=null,referenceModelFilters=[],referenceModelHoverTimer=null;
const referenceParameterLabels={resolution:'分辨率',duration:'生成时长',generateAudio:'生成视频音频',ratio:'画幅',aspectRatio:'画幅',sound:'生成声音',mode:'模式',seed:'随机种子',shotType:'镜头类型',cfgScale:'提示词引导',webSearch:'联网搜索增强',audio:'生成声音',linkUrl:'参考链接',enableThinking:'深度思考',enablePromptExpansion:'提示词增强',generateAudioSwitch:'生成声音',thinkingType:'思考方式',style:'风格',movementAmplitude:'运动幅度',returnLastFrame:'返回尾帧图片',bitrateMode:'画质',draft:'样片模式',promptExtend:'提示词扩展',isRec:'智能推荐',keepOriginalSound:'保留原声',motion:'运动方式',raw:'原始模式',generateMultiClipSwitch:'多镜头',bgm:'背景音乐',audioSetting:'声音设置',model:'模型版本',outputFps:'输出帧率',numFrames:'帧数',frameRate:'帧率',colorMapping:'颜色映射',targetFps:'目标帧率',targetResolution:'目标分辨率',fps:'帧率',bitrateLevel:'码率等级',bitrate:'码率',lora1_strength:'LoRA 1 强度',lora2_strength:'LoRA 2 强度',lora3_strength:'LoRA 3 强度'};
/** Resolve a selected family and mode; no concrete model is chosen for a legacy draft. */
function referenceVideoBinding(d){
 if(!d.creationVideoFamily)return null;
 const family=referenceVideoModelCatalog.families.find(f=>f.id===d.creationVideoFamily),mode=family?.modes.find(m=>m.id===d.creationVideoMode);
 if(!family||!mode)return {error:'已保存的模型或制作方式不在当前研究目录中，请重新选择模型。'};
 const definition=referenceVideoModelCatalog.definitions[mode.modelCode];
 return definition?{family,mode,definition}:{error:'当前模型缺少已核验的参数定义，请重新选择模型。'};
}
/** Only documented defaults are initialized, without carrying fields from another model. */
function referenceProviderDefaults(definition){return Object.fromEntries(Object.entries(definition.properties).filter(([,p])=>!p.readOnly&&p.kind!=='prompt'&&Object.hasOwn(p,'default')).map(([key,p])=>[key,structuredClone(p.default)]));}
function referenceVideoProviderParams(d,binding=referenceVideoBinding(d)){
 if(!binding||binding.error)return {};
 const saved=d.creationVideoProvider;
 const input=saved?.modelCode===binding.mode.modelCode?saved.params:{};
 return referenceApplyProviderDependencies(binding.definition,{...referenceProviderDefaults(binding.definition),...Object.fromEntries(Object.entries(input||{}).filter(([key])=>{const p=binding.definition.properties[key];return p&&!p.readOnly&&p.kind!=='prompt';}))});
}
/** Keep the nearest supported input mode when switching families; references remain owned by the node. */
function referenceSelectVideoFamily(d,id,current=d){
 const family=referenceVideoModelCatalog.families.find(f=>f.id===id);if(!family)return {ok:false,error:'模型已不在当前研究目录中。'};
 const old=current.creationVideoMode||'text',order=old==='frames'?['frames','first','images','reference','text']:old==='first'?['first','frames','images','reference','text']:[old,'text','reference','images','first','frames','video','edit','extend'];
 const mode=order.map(key=>family.modes.find(m=>m.id===key)).find(Boolean)||family.modes[0];
 const definition=referenceVideoModelCatalog.definitions[mode.modelCode];if(!definition)return {ok:false,error:'当前模型缺少已核验的参数定义。'};
 d.creationVideoFamily=id;d.creationVideoMode=mode.id;d.creationVideoProvider={modelCode:mode.modelCode,params:referenceProviderDefaults(definition)};
 return {ok:true};
}
function referenceSelectVideoMode(d,mode,current=d){
 const binding=referenceVideoBinding(current);if(!binding)return false;if(binding.error||!binding.family.modes.some(m=>m.id===mode))return false;
 d.creationVideoFamily=binding.family.id;d.creationVideoMode=mode;const next=referenceVideoBinding(d);d.creationVideoProvider={modelCode:next.mode.modelCode,params:referenceProviderDefaults(next.definition)};return true;
}
function referenceVideoExecutionSettings(n,d){
 const b=referenceVideoBinding(d);if(!b||b.error)return null;const p=referenceVideoProviderParams(d,b);
 return {model:b.mode.modelCode,modelLabel:b.family.label,providerParams:structuredClone(p),seconds:Number.isFinite(Number(p.duration))&&Number(p.duration)>0?Number(p.duration):0,...(p.resolution!=null?{resolution:p.resolution}:{}),...(p.ratio!=null||p.aspectRatio!=null?{ratio:p.ratio??p.aspectRatio}:{}),...(typeof (p.generateAudio??p.sound??p.audio??p.generateAudioSwitch)==='boolean'?{generateAudio:p.generateAudio??p.sound??p.audio??p.generateAudioSwitch}:{}),...(Object.hasOwn(p,'bitrateMode')?{videoQuality:p.bitrateMode??'auto'}:{}),...(typeof p.draft==='boolean'?{previewMode:p.draft}:{})};
}
function referenceModelVisibleFamilies(){return referenceVideoModelCatalog.families.filter(f=>!referenceModelFilters.length||f.modes.some(m=>referenceModelFilters.includes(m.id)));}
function referenceVideoModelMenuHtml(d){
 const binding=referenceVideoBinding(d),visible=referenceModelVisibleFamilies(),brands=[...new Set(referenceVideoModelCatalog.families.map(f=>f.brand))];
 const active=referenceModelBrand||(!binding?.error&&binding?.family.brand)||brands[0];
 const list=visible.filter(f=>f.brand===active);
 return `<section class="ref-model-categories"><div class="ref-model-filters"><span>筛选</span><div>${Object.entries(referenceVideoModeLabels).map(([id,label])=>`<button type="button" data-model-filter="${id}" aria-pressed="${referenceModelFilters.includes(id)}">${label}</button>`).join('')}</div></div><nav aria-label="视频模型品牌">${brands.map(brand=>`<button type="button" data-model-brand="${esc(brand)}" aria-pressed="${active===brand}" ${visible.some(f=>f.brand===brand)?'':'disabled'}>${esc(brand)}${I('arrow')}</button>`).join('')}</nav><div class="ref-model-legacy"><span>原有配置</span>${[['project','跟随项目模型'],['preview','低成本预览 · 示例'],['quality','精细画面 · 示例']].map(([id,label])=>`<button type="button" data-model-legacy="${id}" aria-pressed="${!d.creationVideoFamily&&(d.creationModel||'project')===id}">${label}</button>`).join('')}</div></section><section class="ref-model-list" aria-label="${esc(active)}模型">${list.length?list.map(f=>`<button type="button" data-video-family="${f.id}" aria-pressed="${d.creationVideoFamily===f.id}"><span class="ref-model-label">${esc(f.label)}</span><span class="ref-model-badges">${f.modes.map(m=>`<span>${m.label}</span>`).join('')}</span></button>`).join(''):'<p class="ref-model-empty">此品牌没有匹配的模型</p>'}</section>`;
}
function referenceVideoModelPickerHtml(n,d){
 const b=referenceVideoBinding(d),label=b?.error?'重新选择模型':b?.family.label||({project:'跟随项目模型',preview:'低成本预览 · 示例',quality:'精细画面 · 示例'})[d.creationModel||'project']||d.creationModel;
 return `<details class="creation-settings ref-video-models"><summary role="button" aria-label="视频模型">${I('video-media')}<span>${esc(label)}</span>${I('down')}</summary><div class="ref-model-popover" role="group" aria-label="视频模型目录">${referenceVideoModelMenuHtml(d)}</div></details>`;
}
function referencePositionModelPicker(){
 const details=document.querySelector('.ref-video-models[open]'),menu=details?.querySelector('.ref-model-popover');if(!menu)return;
 const r=details.getBoundingClientRect(),top=76,margin=12;menu.style.width=Math.min(640,innerWidth-margin*2)+'px';menu.style.height=Math.min(430,innerHeight-top-margin)+'px';menu.style.left=Math.max(margin,Math.min(innerWidth-menu.offsetWidth-margin,r.left))+'px';menu.style.bottom='auto';menu.style.top=Math.max(top,Math.min(innerHeight-menu.offsetHeight-margin,r.top-menu.offsetHeight-8))+'px';
 const selected=menu.querySelector('nav button[aria-pressed=true]'),list=menu.querySelector('.ref-model-list'),narrow=innerWidth<660;
 list.style.width=narrow?'':Math.max(200,Math.min(326,innerWidth-menu.getBoundingClientRect().left-318-margin))+'px';
 list.style.top=narrow?'0px':Math.max(0,Math.min(innerHeight-menu.getBoundingClientRect().top-Math.min(list.scrollHeight,430)-margin,(selected?.getBoundingClientRect().top||menu.getBoundingClientRect().top)-menu.getBoundingClientRect().top-8))+'px';
 list.style.maxHeight=Math.min(430,innerHeight-menu.getBoundingClientRect().top-parseFloat(list.style.top)-margin)+'px';
}
function referenceRefreshModelPicker(){const d=canvasCreationDraft(canvasCreationNode()),menu=document.querySelector('.ref-video-models[open] .ref-model-popover');if(menu){const scroll=menu.querySelector('.ref-model-categories').scrollTop,focus=document.activeElement?.dataset;menu.innerHTML=referenceVideoModelMenuHtml(d);menu.querySelector('.ref-model-categories').scrollTop=scroll;if(focus?.modelBrand||focus?.modelFilter)[...menu.querySelectorAll('button')].find(b=>focus.modelBrand?b.dataset.modelBrand===focus.modelBrand:b.dataset.modelFilter===focus.modelFilter)?.focus({preventScroll:true});referencePositionModelPicker();}}
function referenceProviderOption(option){return typeof option==='object'&&option!==null?{value:option.value,label:option.labelCn??option.labelEn??String(option.value)}:{value:option,label:option===null?'自动':String(option)};}
function referenceProviderParameterHtml(key,p,value,title,locked=false){
 const label=title||referenceParameterLabels[key]||key;
 if(p.options||p.type==='boolean'){
  const options=p.type==='boolean'?[{value:true,label:'是'},{value:false,label:'否'}]:p.options.map(referenceProviderOption);
  return `<fieldset class="ref-video-options ref-provider-${key}"><legend>${esc(label)}${locked?'<small class="ref-provider-lock-note">样片模式固定</small>':''}</legend><div>${options.map((o,index)=>`<button type="button" data-provider-choice="${key}" data-option-index="${index}" ${locked?'disabled title="样片模式固定此参数，关闭样片模式后可修改"':''} aria-label="${esc(label)} ${esc(o.label)}" aria-pressed="${JSON.stringify(value)===JSON.stringify(o.value)}">${esc(o.label)}</button>`).join('')}</div></fieldset>`;
 }
 if(p.kind==='slider'&&p.min!=null&&p.max!=null)return `<div class="ref-audio-range ref-provider-range"><label for="provider-range-${key}">${esc(label)}</label><div><input id="provider-range-${key}" type="range" data-provider-range="${key}" min="${p.min}" max="${p.max}" step="${p.step??1}" value="${esc(value??p.min)}" aria-label="${esc(label)}"><input type="number" data-provider-input="${key}" min="${p.min}" max="${p.max}" step="${p.step??1}" value="${esc(value??p.min)}" aria-label="${esc(label)}数值"></div></div>`;
 const numeric=['int','float','slider'].includes(p.kind),type=numeric?'number':'text';
 return `<label class="ref-provider-field">${esc(label)}<input type="${type}" data-provider-input="${key}" aria-label="${esc(label)}" value="${esc(value??'')}" ${p.min!=null?`min="${p.min}"`:''} ${p.max!=null?`max="${p.max}"`:''} ${numeric?`step="${p.step??(p.kind==='int'?1:'any')}"`:''}></label>`;
}
/** Summarize the visible basic choices using the same labels as the open panel. */
function referenceProviderSummary(definition,params){
 const fields=Object.entries(definition.properties).filter(([key,p])=>!p.readOnly&&p.kind!=='prompt'&&definition.presentation?.[key]?.display!==false&&!definition.presentation?.[key]?.advanced);
 const values=fields.flatMap(([key,p])=>{
  const value=params[key];if(value===undefined||value==='')return [];
  const option=p.options?.map(referenceProviderOption).find(option=>JSON.stringify(option.value)===JSON.stringify(value));
  const label=p.type==='boolean'?(value?'是':'否'):key==='duration'&&Number.isFinite(Number(value))?value+'s':option?.label??(value===null?'自动':String(value));
  return [{name:definition.presentation?.[key]?.title||referenceParameterLabels[key]||key,label}];
 });
 return {compact:values.map(value=>value.label).join(' / ')||'制作参数',title:values.map(value=>value.name+'：'+value.label).join(' · ')||'制作参数'};
}
function referenceProviderParametersHtml(n,d,b){
 const params=referenceVideoProviderParams(d,b),locks=referenceProviderDependencies(b.definition,params),entries=Object.entries(b.definition.properties).filter(([key,p])=>!p.readOnly&&p.kind!=='prompt'&&b.definition.presentation?.[key]?.display!==false);
 const summary=referenceProviderSummary(b.definition,params);
 return ['basic','advanced'].map(group=>{const fields=entries.filter(([key])=>!!b.definition.presentation?.[key]?.advanced===(group==='advanced'));if(!fields.length)return '';return `<details class="creation-settings ref-video-settings ${group==='advanced'?'ref-provider-advanced-settings':''}" data-provider-group="${group}"><summary role="button" aria-label="${group==='advanced'?'高级参数':'制作参数'}" title="${esc(group==='advanced'?'高级参数':summary.title)}">${group==='advanced'?I('settings'):'<span class="ref-provider-summary">'+esc(summary.compact)+'</span>'+I('down')}</summary><div class="ref-video-popover ref-provider-parameters" role="group" aria-label="${esc(b.family.label)}${group==='advanced'?'高级参数':'制作参数'}">${fields.map(([key,p])=>referenceProviderParameterHtml(key,p,params[key],b.definition.presentation?.[key]?.title,Object.hasOwn(locks,key))).join('')}</div></details>`;}).join('');
}

/** Resolve parameter values required by enabled model options. */
function referenceProviderDependencies(definition,params){
 const required={};
 for(const [key,presentation] of Object.entries(definition.presentation||{})){
  const values=params[key]===true&&presentation.paramExt?.draftParamValueTrue;
  if(values)for(const [field,value] of Object.entries(values)){
   const property=definition.properties[field];
   if(property&&!property.readOnly&&property.kind!=='prompt')required[field]=value;
  }
 }
 return required;
}
/** Apply dependencies to a copy, keeping persisted and historical snapshots unchanged. */
function referenceApplyProviderDependencies(definition,params){return {...params,...referenceProviderDependencies(definition,params)};}
/** Reapply active dependencies after every parameter change, including dependent fields. */
function referenceProviderUpdatedParams(d,b,key,value){return referenceApplyProviderDependencies(b.definition,{...referenceVideoProviderParams(d,b),[key]:value});}
function referenceStoreProviderValue(key,value){
 const n=canvasCreationNode();if(!n)return;const d=S.nodeDrafts[n.id]??={},b=referenceVideoBinding(canvasCreationDraft(n));if(!b||b.error)return;
 const p=b.definition.properties[key];if(!p||p.readOnly||p.kind==='prompt')return;
 const params=referenceProviderUpdatedParams(canvasCreationDraft(n),b,key,value);
 d.creationVideoProvider={modelCode:b.mode.modelCode,params};save();
 const summary=document.querySelector('.ref-video-settings[data-provider-group="basic"]>summary');
 if(summary){const template=document.createElement('template');template.innerHTML=referenceProviderParametersHtml(n,canvasCreationDraft(n),b);const updated=template.content.querySelector('[data-provider-group="basic"]>summary');summary.innerHTML=updated.innerHTML;summary.title=updated.title;}

}
function referenceRefreshProviderParameters(){
 const n=canvasCreationNode(),d=canvasCreationDraft(n),b=referenceVideoBinding(d),details=document.querySelector('.ref-video-settings[open]');if(!details||!b||b.error)return;
 const template=document.createElement('template');template.innerHTML=referenceProviderParametersHtml(n,d,b);const replacement=template.content.querySelector(`[data-provider-group="${details.dataset.providerGroup}"]`);details.querySelector('summary').innerHTML=replacement.querySelector('summary').innerHTML;details.querySelector('summary').title=replacement.querySelector('summary').title;referenceReplaceVideoParameterMenu(details,replacement.querySelector('.ref-video-popover'));
}
document.addEventListener('click',event=>{
 const el=event.target.closest('[data-model-brand],[data-model-filter],[data-video-family],[data-model-legacy],[data-provider-choice]');if(!el)return;clearTimeout(referenceModelHoverTimer);event.stopImmediatePropagation();
 const n=canvasCreationNode();if(!n)return;const d=S.nodeDrafts[n.id]??={};
 if(el.dataset.modelBrand){referenceModelBrand=el.dataset.modelBrand;referenceRefreshModelPicker();return;}
 if(el.dataset.modelFilter){const id=el.dataset.modelFilter;referenceModelFilters=referenceModelFilters.includes(id)?referenceModelFilters.filter(v=>v!==id):[...referenceModelFilters,id];referenceRefreshModelPicker();return;}
 if(el.dataset.providerChoice){const b=referenceVideoBinding(canvasCreationDraft(n)),p=b?.definition?.properties[el.dataset.providerChoice];if(!p)return;const options=p.type==='boolean'?[{value:true},{value:false}]:p.options.map(referenceProviderOption);referenceStoreProviderValue(el.dataset.providerChoice,options[Number(el.dataset.optionIndex)].value);referenceRefreshProviderParameters();return;}
 if(el.dataset.modelLegacy){delete d.creationVideoFamily;delete d.creationVideoProvider;d.creationModel=el.dataset.modelLegacy;if(!['text','reference','first','frames'].includes(d.creationVideoMode))d.creationVideoMode='text';}
 else{const current=canvasCreationDraft(n),plan=canvasVideoReferencePlan(current,studioAssetReferenceSnapshot(n));const result=referenceSelectVideoFamily(d,el.dataset.videoFamily,{...current,creationVideoMode:plan.mode});if(!result.ok){toast(result.error);return;}}
 refreshCanvasCreation();frameCanvasNodeControls();save();
});
document.addEventListener('change',event=>{const key=event.target.dataset.providerInput;if(!key)return;const n=canvasCreationNode(),b=n&&referenceVideoBinding(canvasCreationDraft(n)),p=b?.definition?.properties[key];if(!p)return;if(!event.target.reportValidity())return;const raw=event.target.value;referenceStoreProviderValue(key,p.type==='string'?raw:Number(raw));});
document.addEventListener('toggle',event=>{if(event.target.matches?.('.ref-video-models[open]'))requestAnimationFrame(referencePositionModelPicker);},true);
window.addEventListener('resize',referencePositionModelPicker);

document.addEventListener('pointerover',event=>{clearTimeout(referenceModelHoverTimer);const brand=event.target.closest('[data-model-brand],[data-entry-video-model-brand]'),entry=!!brand?.dataset.entryVideoModelBrand,value=brand?.dataset.modelBrand||brand?.dataset.entryVideoModelBrand;if(!brand||brand.disabled||value===referenceModelBrand||event.pointerType==='touch')return;referenceModelHoverTimer=setTimeout(()=>{if(!document.querySelector('.ref-video-models[open]'))return;referenceModelBrand=value;if(entry)referenceRefreshEntryVideoModels();else referenceRefreshModelPicker();},180);});
document.addEventListener('scroll',event=>{if(event.target.matches?.('.ref-model-categories'))referencePositionModelPicker();},true);

document.addEventListener('input',event=>{const key=event.target.dataset.providerRange;if(!key)return;const n=canvasCreationNode(),b=n&&referenceVideoBinding(canvasCreationDraft(n)),p=b?.definition?.properties[key];if(!p)return;referenceStoreProviderValue(key,p.type==='string'?event.target.value:Number(event.target.value));const number=document.querySelector(`[data-provider-input="${key}"]`);if(number)number.value=event.target.value;});
