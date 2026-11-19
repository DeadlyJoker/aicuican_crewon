/* Observed image options for the local preview; not a provider capability declaration. */
'use strict';
const referenceImageFields={
 ratio:{key:'creationRatio',label:'比例',values:['自适应','1:1','1:2','2:1','1:3','3:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','21:9','9:21','16:9'],value:'自适应'},
 resolution:{key:'creationResolution',label:'分辨率',values:['1K','2K','4K'],value:'1K'},
 imageQuality:{key:'creationImageQuality',label:'生成质量',values:['auto','low','medium','high','very-high','max'],labels:{auto:'自动',low:'低',medium:'中等',high:'高','very-high':'极高',max:'最大'},value:'high'},
};
/** Resolve new image drafts without adding defaults to historical candidate records. */
function referenceImageSettings(d,n=null){return {...(d.creationImageFamily?referenceImageExecutionSettings(n,d):Object.fromEntries(Object.entries(referenceImageFields).map(([name,f])=>[name,d[f.key]||f.value]))),...(d.creationRoleDesign?{roleDesign:structuredClone(d.creationRoleDesign)}:{}),...(d.creationStyle?{style:structuredClone(d.creationStyle)}:{}),...(d.creationImagePresets?{imagePresets:structuredClone(d.creationImagePresets)}:{}),...(d.creationCamera?.enabled?{cameraControl:structuredClone(d.creationCamera)}:{})};}
/** Change only a validated image choice on the owning draft. */
function referenceUpdateImageDraft(draft,name,value){
 const field=referenceImageFields[name];if(!field||!field.values.includes(value))return false;
 draft[field.key]=value;return true;
}
function referenceImageParametersHtml(d,scope='node',node=null){
 if(d.creationImageFamily&&typeof referenceAssetImageProviderHtml==='function')return referenceAssetImageProviderHtml(d,scope,node);
 const settings=referenceImageSettings(d);
 return `<details class="creation-settings ref-image-settings" data-image-scope="${scope}"><summary role="button" aria-label="${scope==='assets'?'资产制作参数':'制作参数'}">${esc(settings.ratio)} / ${esc(settings.resolution)} / ${esc(referenceImageFields.imageQuality.labels[settings.imageQuality]||settings.imageQuality)}${I('down')}</summary><div class="ref-image-popover" role="group" aria-label="图片制作参数">${Object.entries(referenceImageFields).map(([name,f])=>{
  const values=f.values.includes(settings[name])?f.values:[...f.values,settings[name]];
  return `<fieldset class="ref-image-options ref-image-${name}"><legend>${f.label}</legend><div>${values.map(value=>{const ratio=name==='ratio'&&value.includes(':')?value.split(':').map(Number):null;return `<button type="button" data-image-choice="${name}" data-value="${esc(value)}" aria-label="${f.label} ${esc(f.labels?.[value]||value)}" aria-pressed="${settings[name]===value}">${name==='ratio'?`<span class="ref-image-ratio-icon" aria-hidden="true" style="width:${ratio?Math.round(16*Math.min(1,ratio[0]/ratio[1])):18}px;height:${ratio?Math.round(16*Math.min(1,ratio[1]/ratio[0])):18}px"></span>`:''}<span>${esc(f.labels?.[value]||value)}</span></button>`;}).join('')}</div></fieldset>`;
 }).join('')}<p>示例参数，未连接生成服务</p></div></details>`;
}
function positionReferenceImageParameters(){
 const details=document.querySelector('.ref-image-settings[open]'),menu=details?.querySelector('.ref-image-popover');if(!menu)return;
 const r=details.getBoundingClientRect(),margin=12,top=76,above=r.top-top-8,below=innerHeight-r.bottom-margin-8,useAbove=above>=below;
 menu.style.width=Math.min(320,innerWidth-margin*2)+'px';menu.style.maxHeight=Math.max(80,Math.min(520,useAbove?above:below))+'px';
 menu.style.left=Math.max(margin,Math.min(innerWidth-menu.offsetWidth-margin,r.left))+'px';menu.style.bottom='auto';
 menu.style.top=(useAbove?Math.max(top,r.top-menu.offsetHeight-8):Math.min(innerHeight-menu.offsetHeight-margin,r.bottom+8))+'px';
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-image-choice]');if(!button)return;
 const details=button.closest('.ref-image-settings'),scope=details?.dataset.imageScope||'node';
 const n=scope==='assets'?nodeById(referenceWorkbench.nodeId):canvasCreationNode();
 const f=referenceImageFields[button.dataset.imageChoice];if(!n||scope==='node'&&mediaKind(n)!=='image'||!f||!f.values.includes(button.dataset.value))return;
 event.stopImmediatePropagation();
 const d=scope==='assets'?(ensureStudioSeries(n).assetImageDraft??={}):(S.nodeDrafts[n.id]??={});
 referenceUpdateImageDraft(d,button.dataset.imageChoice,button.dataset.value);
 const menu=details.querySelector('.ref-image-popover'),scroll=menu.scrollTop;
 const template=document.createElement('template');template.innerHTML=referenceImageParametersHtml(scope==='assets'?d:canvasCreationDraft(n),scope);details.querySelector('summary').innerHTML=template.content.querySelector('summary').innerHTML;
 menu.replaceWith(template.content.querySelector('.ref-image-popover'));positionReferenceImageParameters();details.querySelector('.ref-image-popover').scrollTop=scroll;
 details.querySelector(`[data-image-choice="${button.dataset.imageChoice}"][data-value="${button.dataset.value}"]`)?.focus({preventScroll:true});save();
});
document.addEventListener('toggle',event=>{if(event.target.matches?.('.ref-image-settings[open]'))requestAnimationFrame(positionReferenceImageParameters);},true);
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const details=document.querySelector('.ref-image-settings[open]');if(details){event.preventDefault();event.stopImmediatePropagation();details.open=false;details.querySelector('summary').focus();}},true);
window.addEventListener('resize',positionReferenceImageParameters);

/** Reuse the main style picker while targeting only the current image draft. */
function canvasStyleTriggerHtml(){return `<button class="canvas-style-trigger" data-ref-setting="style" data-action="ref-node-style" aria-label="风格库" title="风格库">${I('theme')}</button>`;}
function canvasStyleReferenceHtml(d){const style=d.creationStyle;if(!style)return '';return `<div class="canvas-selected-style"><button data-action="ref-node-style" aria-label="风格：${esc(style.name)}" title="${esc(style.name)}"><img src="${esc(style.image)}" alt=""><span>风格</span></button><button data-action="ref-node-style-remove" aria-label="移除风格 ${esc(style.name)}" title="移除风格">${I('close')}</button></div>`;}

function referenceSaveNodeStyle(state,nodeId,style){
 const node=state.nodes.find(node=>node.id===nodeId);if(!node||!['image','character','scene'].includes(node.kind))return false;
 state.nodeDrafts??={};(state.nodeDrafts[nodeId]??={}).creationStyle=style?{name:style.name,image:style.image}:null;return true;
}

document.addEventListener('click',event=>{
 for(const details of document.querySelectorAll('.ref-image-settings[open]'))if(!details.contains(event.target))details.open=false;
});
