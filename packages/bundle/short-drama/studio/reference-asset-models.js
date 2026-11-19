/* Read-only model research snapshot for project asset preparation, never a generation client. */
'use strict';
function referenceAssetImageBinding(draft,mode='text'){
 if(!draft.creationImageFamily)return null;
 const family=referenceImageModelCatalog.families.find(item=>item.id===draft.creationImageFamily);
 const modelCode=family&&(mode==='image'?family.imageCode:family.textCode),definition=modelCode&&referenceImageModelCatalog.definitions[modelCode];
 return definition?{family,definition,modelCode,mode}:null;
}
function referenceSelectAssetImageModel(draft,id,mode='text'){
 const family=referenceImageModelCatalog.families.find(item=>item.id===id),modelCode=family&&(mode==='image'?family.imageCode:family.textCode),definition=modelCode&&referenceImageModelCatalog.definitions[modelCode];
 if(!definition)return false;
 draft.creationImageFamily=id;draft.creationImageProvider={modelCode,params:referenceResolveAssetImageParams(definition,referenceProviderDefaults(definition))};return true;
}
/** Retain shared editable values when an entry changes between the same family's modes. */
function referenceRebindAssetImageMode(draft,mode){
 const binding=referenceAssetImageBinding(draft,mode),prior=draft.creationImageProvider;
 if(!binding||prior?.modelCode===binding.modelCode)return false;
 const params=referenceProviderDefaults(binding.definition),sameFamily=prior&&[binding.family.textCode,binding.family.imageCode].includes(prior.modelCode);
 if(sameFamily)for(const [key,property] of Object.entries(binding.definition.properties)){
  if(property.readOnly||property.kind==='prompt'||!Object.hasOwn(prior.params,key))continue;
  const value=prior.params[key];
  if(property.options){const option=referenceAssetProviderOptions(property).find(item=>item.value===value);if(option)params[key]=option.value;continue;}
  if(property.type==='boolean'&&typeof value==='boolean'||property.type==='string'&&typeof value==='string')params[key]=value;
  else if(['int','number','float'].includes(property.type)&&typeof value==='number'&&Number.isFinite(value)&&(property.min==null||value>=property.min)&&(property.max==null||value<=property.max)&&(property.type!=='int'||Number.isInteger(value)))params[key]=value;
 }
 draft.creationImageProvider={modelCode:binding.modelCode,params:referenceResolveAssetImageParams(binding.definition,params)};return true;
}
/** Expand the dimension table supplied by the selected model; do not estimate sizes. */
function referenceResolveAssetImageParams(definition,params){
 const ratioEntry=Object.entries(definition.properties).find(([,p])=>p.kind==='whAspectRatio'),resolutionEntry=Object.entries(definition.properties).find(([,p])=>p.kind==='whResolution');
 if(!ratioEntry||!resolutionEntry)return params;
 const ratio=ratioEntry[1].options.find(o=>(o.value??o.labelCn??o.labelEn)===params[ratioEntry[0]]),size=ratio?.listResolution?.find(o=>o.resolution===params[resolutionEntry[0]]);
 return size?{...params,[size.widthParam]:size.widthValue,[size.heightParam]:size.heightValue}:params;
}
function referenceAssetProviderOptions(p){return (p.options||[]).map(o=>p.kind==='whAspectRatio'?{value:o.value??o.labelCn??o.labelEn,label:o.labelCn??o.labelEn}:referenceProviderOption(o));}
function referenceAssetImageModelPicker(draft,scope='assets',owner=null){
 const legacyLabels={project:'跟随项目模型',preview:'低成本预览 · 示例',quality:'精细画面 · 示例'},binding=referenceAssetImageBinding(draft),label=binding?.family.label||(draft.creationImageFamily?'模型已不在研究目录中':legacyLabels[draft.creationModel||'project']);
 return `<details class="ref-asset-model-picker" data-image-scope="${scope}" data-image-owner="${esc(owner?.id||'')}"><summary role="button" aria-label="${scope==='assets'?'资产制作模型':'图片模型'}">${I('image')}<span>${esc(label)}</span>${I('down')}</summary><div class="ref-asset-model-menu"><input aria-label="搜索图片模型" placeholder="搜索模型…" type="search"><div role="listbox" aria-label="图片模型">${(scope==='entry'?[]:scope==='node'?['project','preview','quality']:['project']).map(id=>`<button role="option" aria-selected="${!draft.creationImageFamily&&(draft.creationModel||'project')===id}" data-asset-model="legacy:${id}">${legacyLabels[id]}</button>`).join('')}${referenceImageModelCatalog.families.map(f=>`<button role="option" aria-selected="${f.id===draft.creationImageFamily}" data-asset-model="${esc(f.id)}">${esc(f.label)}</button>`).join('')}</div><small>研究目录 · 未连接生成服务</small></div></details>`;
}
function referenceAssetImageProviderHtml(draft,scope='assets',owner=null){
 const binding=referenceAssetImageBinding(draft,referenceImageDraftMode(scope,owner));if(!binding)return '<span role="status">请重新选择模型</span>';
 const {definition}=binding,params=referenceResolveAssetImageParams(definition,draft.creationImageProvider?.modelCode===binding.modelCode?draft.creationImageProvider.params:referenceProviderDefaults(definition));
 const sizes=Object.values(definition.properties).filter(p=>p.kind==='whAspectRatio').flatMap(p=>p.options.flatMap(o=>o.listResolution||[])),dimensionKeys=new Set(sizes.flatMap(s=>[s.widthParam,s.heightParam]));
 const fields=Object.entries(definition.properties).filter(([key,p])=>!p.readOnly&&p.kind!=='prompt'&&!dimensionKeys.has(key)&&definition.presentation[key]?.display!==false);
 const summary=fields.filter(([key])=>['比例','分辨率','生成质量'].includes(definition.presentation[key]?.title)).map(([key,p])=>{const option=referenceAssetProviderOptions(p).find(o=>JSON.stringify(o.value)===JSON.stringify(params[key]));return option?.label??params[key];}).filter(v=>v!=null).join(' / ')||'模型参数';
 return `<details class="creation-settings ref-image-settings" data-image-scope="${scope}" data-image-owner="${esc(owner?.id||'')}"><summary role="button" aria-label="${scope==='assets'?'资产制作参数':'制作参数'}">${esc(summary)}${I('down')}</summary><div class="ref-image-popover ref-asset-provider-menu" role="group" aria-label="${esc(binding.family.label)}参数">${fields.map(([key,p])=>referenceProviderParameterHtml(key,p.options?{...p,options:referenceAssetProviderOptions(p).map(o=>({value:o.value,labelCn:o.label}))}:p,params[key],definition.presentation[key]?.title).replaceAll('data-provider-','data-asset-provider-')).join('')}${dimensionKeys.size?`<p>尺寸：${[...dimensionKeys].map(key=>params[key]).join(' × ')} · 随比例与分辨率联动</p>`:''}<p>${binding.mode==='image'?'图生图':'文生图'}参数预设 · 不执行生成</p></div></details>`;
}
function referenceImageDraftMode(scope,node){if(scope==='entry')return (S.referenceEntryMedia?.create||[]).some(item=>item.type==='图片')?'image':'text';return scope==='node'&&node&&studioAssetReferenceSnapshot(node).some(r=>['image','character','scene'].includes(r.sourceKind))?'image':'text';}
function referenceImageModelTarget(element){
 const root=element.closest('[data-image-scope]'),scope=root?.dataset.imageScope||'assets';
 if(scope==='entry')return {root,scope,node:null,mode:referenceImageDraftMode(scope,null),draft:referenceEntryImageDraft(S)};
 const node=nodeById(root?.dataset.imageOwner||(scope==='assets'?referenceWorkbench.nodeId:canvasCreationNode()?.id));
 if(!node)return null;
 return {root,scope,node,mode:referenceImageDraftMode(scope,node),draft:scope==='assets'?(ensureStudioSeries(node).assetImageDraft??={}):(S.nodeDrafts[node.id]??={})};
}
/** Snapshot the active image definition without mutating a stored candidate or inactive mode. */
function referenceImageExecutionSettings(node,draft){
 const binding=referenceAssetImageBinding(draft,referenceImageDraftMode('node',node));if(!binding)return null;
 const params=referenceResolveAssetImageParams(binding.definition,draft.creationImageProvider?.modelCode===binding.modelCode?draft.creationImageProvider.params:referenceProviderDefaults(binding.definition));
 const get=label=>Object.keys(binding.definition.properties).find(k=>binding.definition.presentation[k]?.title===label);
 const ratio=get('比例'),resolution=get('分辨率'),quality=get('生成质量');
 return {model:binding.modelCode,modelLabel:binding.family.label,imageMode:binding.mode,providerParams:structuredClone(params),...(ratio?{ratio:params[ratio]??'自适应'}:{}),...(resolution?{resolution:params[resolution]}:{}),...(quality?{imageQuality:params[quality]}:{})};
}
/** Place the shared model menu on the side with room for browsing. */
function referenceImageModelMenuLayout(rect,viewportWidth,viewportHeight,topInset=12){
 const margin=12,gap=8,width=Math.min(320,viewportWidth-margin*2);
 const below=Math.max(0,viewportHeight-rect.bottom-gap-margin),above=Math.max(0,rect.top-gap-topInset);
 const downward=below>=420||below>=above,height=Math.min(420,downward?below:above);
 return {width,height,left:Math.max(margin,Math.min(rect.left,viewportWidth-width-margin)),top:downward?rect.bottom+gap:Math.max(topInset,rect.top-gap-height)};
}
function referencePositionAssetModels(){
 const root=document.querySelector('.ref-asset-model-picker[open]'),menu=root?.querySelector('.ref-asset-model-menu');if(!menu)return;
 const header=document.querySelector('.ref-canvas-header'),topInset=Math.max(12,(header?.getBoundingClientRect().bottom||0)+8);
 const rect=root.getBoundingClientRect(),layout=referenceImageModelMenuLayout(rect,innerWidth,innerHeight,topInset);
 menu.style.width=layout.width+'px';menu.style.left=layout.left+'px';menu.style.maxHeight=layout.height+'px';menu.style.top=(layout.top<rect.top?Math.max(topInset,rect.top-menu.offsetHeight-8):layout.top)+'px';
}

function referenceRefreshAssetParameters(target){
 const root=target.root;if(!root)return;
 const opened=root.open,scroll=root.querySelector('.ref-image-popover')?.scrollTop||0,template=document.createElement('template');template.innerHTML=referenceAssetImageProviderHtml(target.draft,target.scope,target.node);const next=template.content.firstElementChild;root.replaceWith(next);next.open=opened;positionReferenceImageParameters();next.querySelector('.ref-image-popover').scrollTop=scroll;
}
function referenceStoreAssetProviderValue(target,key,value){
 const binding=referenceAssetImageBinding(target.draft,target.mode),p=binding?.definition.properties[key];if(!p||p.readOnly||p.kind==='prompt')return;
 const old=target.draft.creationImageProvider,params=old?.modelCode===binding.modelCode?old.params:referenceProviderDefaults(binding.definition);
 target.draft.creationImageProvider={modelCode:binding.modelCode,params:referenceResolveAssetImageParams(binding.definition,{...params,[key]:value})};save();
}
document.addEventListener('click',event=>{
 const model=event.target.closest('[data-asset-model]');
 if(model){event.stopImmediatePropagation();const target=referenceImageModelTarget(model);if(!target)return;const {draft}=target;if(model.dataset.assetModel.startsWith('legacy:')){delete draft.creationImageFamily;delete draft.creationImageProvider;draft.creationModel=model.dataset.assetModel.slice(7);}else if(!referenceSelectAssetImageModel(draft,model.dataset.assetModel,target.mode))return;save();if(target.scope==='assets')referenceDrawWorkbench();else if(target.scope==='entry'){referenceRenderEntryControls('[data-image-scope=entry].ref-asset-model-picker>summary');}else{refreshCanvasCreation();frameCanvasNodeControls();}return;}
 const choice=event.target.closest('[data-asset-provider-choice]');if(choice){event.stopImmediatePropagation();const target=referenceImageModelTarget(choice);if(!target)return;const binding=referenceAssetImageBinding(target.draft,target.mode),p=binding?.definition.properties[choice.dataset.assetProviderChoice];if(!p)return;const options=p.type==='boolean'?[{value:true},{value:false}]:referenceAssetProviderOptions(p);referenceStoreAssetProviderValue(target,choice.dataset.assetProviderChoice,options[Number(choice.dataset.optionIndex)].value);referenceRefreshAssetParameters(target);return;}
 for(const root of document.querySelectorAll('.ref-asset-model-picker[open]'))if(!root.contains(event.target))root.open=false;
});
document.addEventListener('input',event=>{
 if(event.target.matches('.ref-asset-model-menu input')){const q=event.target.value.trim().toLocaleLowerCase();for(const button of event.target.parentElement.querySelectorAll('[data-asset-model]'))button.hidden=!button.textContent.toLocaleLowerCase().includes(q);referencePositionAssetModels();}
 if(event.target.dataset.assetProviderRange){referenceStoreAssetProviderValue(referenceImageModelTarget(event.target),event.target.dataset.assetProviderRange,Number(event.target.value));const paired=document.querySelector(`[data-asset-provider-input="${event.target.dataset.assetProviderRange}"]`);if(paired)paired.value=event.target.value;}
});
document.addEventListener('change',event=>{const key=event.target.dataset.assetProviderInput;if(!key||!event.target.reportValidity())return;const target=referenceImageModelTarget(event.target);if(!target)return;const binding=referenceAssetImageBinding(target.draft,target.mode),p=binding?.definition.properties[key];if(p)referenceStoreAssetProviderValue(target,key,p.type==='string'?event.target.value:Number(event.target.value));});
document.addEventListener('toggle',event=>{if(event.target.matches?.('.ref-asset-model-picker[open]'))requestAnimationFrame(referencePositionAssetModels);},true);
window.addEventListener('resize',referencePositionAssetModels);
window.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const root=document.querySelector('.ref-asset-model-picker[open]');if(root){event.preventDefault();event.stopImmediatePropagation();root.open=false;root.querySelector('summary').focus();}},true);
