/* The reference quality tool creates an image draft with a fixed source reference and an inline preset tag. */
'use strict';
const qualityBasePrompt=canvasPromptHtml,qualityBasePreset=canvasPresetExecution,qualityBaseCanSubmit=canvasPromptCanSubmit,qualityBaseAction=handleCanvasNodeToolAction,qualityBaseToolbar=canvasContextToolbar,qualityBaseReference=canvasReferenceHtml;
function portraitQualityCurrent(n){return portraitQualityValues(canvasCreationDraft(n).creationPortraitQuality)}
function portraitQualityStore(n,values){(S.nodeDrafts[n.id]??={}).creationPortraitQuality={...values};save()}
function portraitQualityPopover(d){
 return `<div class="portrait-quality-popover" role="dialog" aria-label="人像质感调节"><header>${iconBtn('关闭人像质感调节','portrait-quality-close','close')}</header><div class="portrait-quality-groups">${portraitQualityGroups.map(([key,label,choices])=>`<section><h3>${label}</h3><div role="group" aria-label="${label}">${choices.map((text,index)=>`<button aria-pressed="${d[key]===text}" data-action="portrait-quality-select:${key}:${index}">${text}</button>`).join('')}</div></section>`).join('')}</div></div>`;
}
canvasPromptHtml=function(n,d,prompt){
 const preset=portraitQualityCurrent(n);let base=qualityBasePrompt(n,d,prompt);if(n.derivedOperation==='portrait-quality')base=base.replace('描述你希望保留或调整的内容…','描述你想要生成的内容');
 if(!preset?.enabled)return base;
 return `<div class="portrait-quality-prompt"><span class="portrait-quality-tag"><details class="canvas-tool-menu portrait-quality-menu"><summary role="button" aria-label="人像质感调节" aria-expanded="false">${I('user')}<span>人像质感</span></summary>${portraitQualityPopover(preset)}</details>${iconBtn('移除人像质感预设','portrait-quality-remove','close')}</span>${base}</div>`;
};
canvasReferenceHtml=function(n,d,ref,refs){if(n.derivedOperation!=='portrait-quality')return qualityBaseReference(n,d,ref,refs);return `<button class="creation-reference" data-action="asset-picker:${n.id}" aria-label="调整参考：${esc(ref.sourceTitle)} v${ref.number}">${studioAssetThumb(ref)}<span>图片${refs.indexOf(ref)+1}</span></button>`;};
canvasPresetExecution=function(n){const d=canvasCreationDraft(n),preset=portraitQualityExecution(d.creationPortraitQuality,d.prompt??n.prompt??'');return preset||qualityBasePreset(n)};
canvasPromptCanSubmit=function(n,d,prompt){const preset=portraitQualityValues(d.creationPortraitQuality);return preset?preset.enabled||!!prompt.trim():qualityBaseCanSubmit(n,d,prompt)};
canvasContextToolbar=function(n){if(n.derivedOperation!=='portrait-quality'||!n.referenceOnly)return qualityBaseToolbar(n);return n.candidates?.length?`<div class="selection-toolbar creation-toolbar" role="toolbar" aria-label="选中内容操作">${btn('版本 '+n.candidates.length,'candidate-review:'+n.id,'ghost','history')}</div>`:'<div class="selection-toolbar creation-toolbar portrait-quality-empty-toolbar" aria-hidden="true"></div>'};
function portraitQualityUpdateSubmit(n){const field=document.getElementById('canvas-creation-prompt'),button=document.querySelector('[data-action="canvas-creation-submit"]');if(field&&button)button.disabled=!canvasPromptCanSubmit(n,canvasCreationDraft(n),field.value)}
handleCanvasNodeToolAction=function(action){
 const [key,field,index]=action.split(':');
 if(!key.startsWith('portrait-quality-'))return qualityBaseAction(action);
 const n=canvasCreationNode();if(!n)return true;
 if(key==='portrait-quality-create'){
  const reference=studioAssetSourceSnapshot(n);if(!reference){toast('请先采用一张图片，再进行质感调节');return true}
  canvasActiveTool=null;addNode('image','人像质感调节',reference,{width:380,height:280,derivedOperation:'portrait-quality',creationPreferences:{creationPortraitQuality:portraitQualityValues({})}});return true;
 }
 const values=portraitQualityCurrent(n);if(!values)return true;
 if(key==='portrait-quality-remove'){portraitQualityStore(n,{...values,enabled:false});refreshCanvasCreation();positionCanvasNodeOverlays();document.getElementById('canvas-creation-prompt')?.focus({preventScroll:true});return true}
 if(key==='portrait-quality-close'){const menu=document.querySelector('.portrait-quality-menu');if(menu){menu.open=false;menu.querySelector('summary').focus({preventScroll:true})}return true}
 if(key==='portrait-quality-select'){
  const group=portraitQualityGroups.find(g=>g[0]===field),choice=group?.[2][Number(index)];if(!choice)return true;
  const next=portraitQualityChoose(values,field,choice);portraitQualityStore(n,next);
  document.querySelectorAll(`[data-action^="portrait-quality-select:${field}:"]`).forEach(button=>button.setAttribute('aria-pressed',group[2][Number(button.dataset.action.split(':')[2])]===next[field]));portraitQualityUpdateSubmit(n);return true;
 }
 return true;
};
document.addEventListener('toggle',event=>{if(event.target.matches?.('.portrait-quality-menu'))event.target.querySelector('summary').setAttribute('aria-expanded',String(event.target.open))},true);
document.addEventListener('input',event=>{if(event.target.id==='canvas-creation-prompt'){const n=canvasCreationNode();if(n&&portraitQualityCurrent(n))portraitQualityUpdateSubmit(n)}});
render();
