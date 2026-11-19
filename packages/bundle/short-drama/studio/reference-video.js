/* The reference's grouped video settings, stored through the existing Demo draft owner. */
'use strict';
const referenceVideoFields={
 resolution:{key:'creationVideoResolution',label:'分辨率',values:['480p','720p','1080p','2k','4k','原生1080p']},
 seconds:{key:'seconds',label:'生成时长',values:Array.from({length:27},(_,i)=>i+4)},
 generateAudio:{key:'creationGenerateAudio',label:'生成视频音频',values:['yes','no'],labels:{yes:'是',no:'否'}},
 ratio:{key:'creationRatio',label:'画幅',values:['自适应','16:9','9:16','1:1']},
 videoQuality:{key:'creationVideoQuality',label:'画质',values:['auto','standard','high'],labels:{auto:'自动',standard:'标准',high:'高画质'}},
 previewMode:{key:'creationVideoPreviewMode',label:'样片模式',values:['yes','no'],labels:{yes:'是',no:'否'}},
};
/** Preserve older video duration and resolution while resolving the new preference fields. */
function referenceVideoSettings(n,d){
 const duration=Number(d.seconds??n.seconds);
 return {resolution:d.creationVideoResolution||'720p',seconds:Number.isFinite(duration)&&duration>0?duration:5,generateAudio:d.creationGenerateAudio!=='no',ratio:d.creationRatio||'自适应',videoQuality:['auto','standard','high'].includes(d.creationVideoQuality)?d.creationVideoQuality:'auto',previewMode:d.creationVideoPreviewMode==='yes'};
}
/** Render compact choices instead of a vertical stack of native selects. */
function referenceVideoParametersHtml(n,d){
 const binding=referenceVideoBinding(d);if(binding&&!binding.error)return referenceProviderParametersHtml(n,d,binding);
 const s=referenceVideoSettings(n,d),selected={...s,generateAudio:s.generateAudio?'yes':'no',previewMode:s.previewMode?'yes':'no'};
 return `<details class="creation-settings ref-video-settings"><summary role="button" aria-label="制作参数">${esc(s.resolution)} / ${s.seconds}s / ${s.generateAudio?'是':'否'} / ${esc(s.ratio)}${I('down')}</summary><div class="ref-video-popover" role="group" aria-label="视频制作参数">${Object.entries(referenceVideoFields).map(([name,f])=>{
  const values=f.values.some(v=>v===selected[name])?f.values:[...f.values,selected[name]];
  return `<fieldset class="ref-video-options ref-video-${name}"><legend>${f.label}</legend><div>${values.map(value=>`<button type="button" data-video-choice="${name}" data-value="${esc(value)}" aria-label="${f.label} ${esc(f.labels?.[value]??value)}${name==='seconds'?'秒':''}" aria-pressed="${selected[name]===value}">${esc(f.labels?.[value]??value)}${name==='seconds'?'s':''}</button>`).join('')}</div></fieldset>`;
 }).join('')}</div></details>`;
}
function positionReferenceVideoParameters(){
 const details=document.querySelector('.ref-video-settings[open]'),menu=details?.querySelector('.ref-video-popover');if(!menu)return;
 const r=details.getBoundingClientRect(),margin=12,top=76,above=r.top-top-8,below=innerHeight-r.bottom-margin-8,useAbove=above>=below;
 menu.style.maxHeight=Math.max(80,Math.min(560,useAbove?above:below))+'px';menu.style.width=Math.min(320,innerWidth-margin*2)+'px';
 menu.style.left=Math.max(margin,Math.min(innerWidth-menu.offsetWidth-margin,r.left))+'px';
 menu.style.bottom='auto';menu.style.top=(useAbove?Math.max(top,r.top-menu.offsetHeight-8):Math.min(innerHeight-menu.offsetHeight-margin,r.bottom+8))+'px';
}
/** Replace parameter content while retaining its focused control and scroll position. */
function referenceReplaceParameterMenu(details,replacement,selector,attributes,position){
 const old=details.querySelector(selector),scroll=old.scrollTop,active=document.activeElement;
 const focus=old.contains(active)?attributes.filter(key=>active.hasAttribute(key)).map(key=>[key,active.getAttribute(key)]):[];
 old.replaceWith(replacement);position();replacement.scrollTop=scroll;
 if(focus.length){
  const target=[...replacement.querySelectorAll('button,input')].find(control=>!control.disabled&&focus.every(([key,value])=>control.getAttribute(key)===value));
  (target||details.querySelector('summary')).focus({preventScroll:true});
 }
}
/** Retain video parameter focus across model-specific menu updates. */
function referenceReplaceVideoParameterMenu(details,replacement){
 referenceReplaceParameterMenu(details,replacement,'.ref-video-popover',['data-provider-choice','data-option-index','data-video-choice','data-value','data-provider-input','data-provider-range'],positionReferenceVideoParameters);
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-video-choice]');if(!button)return;event.stopImmediatePropagation();
 const n=canvasCreationNode();if(!n)return;const f=referenceVideoFields[button.dataset.videoChoice],d=S.nodeDrafts[n.id]??={};d[f.key]=button.dataset.value;
 const details=button.closest('.ref-video-settings');
 const template=document.createElement('template');template.innerHTML=referenceVideoParametersHtml(n,canvasCreationDraft(n));
 details.querySelector('summary').innerHTML=template.content.querySelector('summary').innerHTML;
 referenceReplaceVideoParameterMenu(details,template.content.querySelector('.ref-video-popover'));save();
});
document.addEventListener('toggle',event=>{if(event.target.matches?.('.ref-video-settings[open]'))requestAnimationFrame(positionReferenceVideoParameters);},true);
window.addEventListener('resize',positionReferenceVideoParameters);
