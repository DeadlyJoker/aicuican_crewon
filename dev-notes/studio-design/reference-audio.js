/* Voice parameters observed in rhTV; local Demo values never invoke a provider. */
'use strict';
const referenceAudioFields={
 format:{key:'creationAudioFormat',values:['wav','mp3','pcm','ogg_opus'],value:'wav'},
 sampleRate:{key:'creationAudioSampleRate',values:[8000,16000,24000,32000,44100,48000],value:44100},
 speed:{key:'creationAudioSpeed',min:.5,max:2,step:.1,value:1,label:'语速',unit:'倍'},
 volume:{key:'creationAudioVolume',min:.5,max:2,step:.1,value:1,label:'音量',unit:'倍'},
 pitch:{key:'creationAudioPitch',min:-12,max:12,step:1,value:0,label:'音调',unit:''},
};
/** Resolve stored voice settings, leaving legacy expression and pace fields intact. */
function referenceAudioSettings(d){
 return Object.fromEntries(Object.entries(referenceAudioFields).map(([name,f])=>{
  const raw=d[f.key],number=Number(raw);
  const value='values' in f?f.values.find(v=>String(v)===String(raw))??f.value:raw==null||raw===''||!Number.isFinite(number)?f.value:Math.round(Math.max(f.min,Math.min(f.max,number))/f.step)*f.step;
  return [name,typeof value==='number'?Number(value.toFixed(1)):value];
 }));
}
/** Render one compact parameter surface for the selected voice node. */
function referenceAudioParametersHtml(d){
 const settings=referenceAudioSettings(d);
 const choices=(name,label)=>`<fieldset class="ref-audio-options"><legend>${label}</legend><div>${referenceAudioFields[name].values.map(value=>`<button type="button" data-audio-choice="${name}" data-value="${value}" aria-pressed="${settings[name]===value}">${value}</button>`).join('')}</div></fieldset>`;
 return `<details class="creation-settings ref-audio-settings"><summary role="button" aria-label="高级参数" title="高级参数">${I('settings')}</summary><div class="ref-audio-popover" role="group" aria-label="声音高级参数"><div class="ref-audio-reset"><button type="button" data-audio-reset>重置</button></div>${choices('format','输出音频格式')}${choices('sampleRate','输出采样率 (Hz)')}${['speed','volume','pitch'].map(name=>{const f=referenceAudioFields[name];return `<div class="ref-audio-range"><label for="audio-range-${name}">${f.label}</label><div><input id="audio-range-${name}" type="range" data-audio-range="${name}" min="${f.min}" max="${f.max}" step="${f.step}" value="${settings[name]}" aria-label="${f.label}"><input type="number" data-audio-number="${name}" min="${f.min}" max="${f.max}" step="${f.step}" value="${settings[name]}" aria-label="${f.label}数值"><span>${f.unit}</span></div></div>`;}).join('')}</div></details>`;
}
/** Fit the parameter surface to the visible window without moving the canvas camera. */
function positionReferenceAudioParameters(){
 const details=document.querySelector('.ref-audio-settings[open]'),menu=details?.querySelector('.ref-audio-popover');if(!menu)return;
 const r=details.getBoundingClientRect(),margin=12,top=76;
 menu.style.maxHeight=Math.max(80,innerHeight-top-margin)+'px';
 menu.style.width=Math.min(360,innerWidth-margin*2)+'px';
 menu.style.left=Math.max(margin,Math.min(innerWidth-menu.offsetWidth-margin,r.left))+'px';
 menu.style.bottom='auto';menu.style.top=Math.max(top,Math.min(innerHeight-menu.offsetHeight-margin,r.top-menu.offsetHeight-8))+'px';
}
function refreshReferenceAudioParameters(){
 const details=document.querySelector('.ref-audio-settings[open]'),n=canvasCreationNode();if(!details||!n)return;
 const template=document.createElement('template');template.innerHTML=referenceAudioParametersHtml(canvasCreationDraft(n));
 referenceReplaceParameterMenu(details,template.content.querySelector('.ref-audio-popover'),'.ref-audio-popover',['data-audio-choice','data-value','data-audio-reset'],positionReferenceAudioParameters);
}
document.addEventListener('click',event=>{
 const choice=event.target.closest('[data-audio-choice]'),reset=event.target.closest('[data-audio-reset]');if(!choice&&!reset)return;event.stopImmediatePropagation();
 const n=canvasCreationNode();if(!n)return;const d=S.nodeDrafts[n.id]??={};
 if(reset){for(const f of Object.values(referenceAudioFields))d[f.key]=f.value;}
 else{const f=referenceAudioFields[choice.dataset.audioChoice];d[f.key]=choice.dataset.value;}
 save();refreshReferenceAudioParameters();
});
document.addEventListener('input',event=>{
 const name=event.target.dataset.audioRange||event.target.dataset.audioNumber;if(!name)return;
 const n=canvasCreationNode();if(!n)return;const d=S.nodeDrafts[n.id]??={},f=referenceAudioFields[name];
 if(event.target.value===''||!Number.isFinite(Number(event.target.value)))return;
 d[f.key]=event.target.value;const value=referenceAudioSettings(d)[name];
 const other=document.querySelector(event.target.dataset.audioRange?`[data-audio-number="${name}"]`:`[data-audio-range="${name}"]`);if(other)other.value=value;
 save();
});
document.addEventListener('change',event=>{
 const name=event.target.dataset.audioNumber;if(!name)return;const n=canvasCreationNode();if(!n)return;
 const d=S.nodeDrafts[n.id]??={},f=referenceAudioFields[name];d[f.key]=referenceAudioSettings({...d,[f.key]:event.target.value})[name];event.target.value=d[f.key];save();
});
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const details=document.querySelector('.ref-audio-settings[open]');if(details){event.preventDefault();details.open=false;details.querySelector('summary').focus();event.stopPropagation();}});
document.addEventListener('toggle',event=>{if(event.target.matches?.('.ref-audio-settings[open]'))requestAnimationFrame(positionReferenceAudioParameters);},true);
window.addEventListener('resize',positionReferenceAudioParameters);
/** Voice type choices open above their footer trigger when the window has room. */
function positionReferenceAudioType(){
 const details=document.querySelector('.creation-audio-type[open]'),menu=details?.querySelector(':scope > div');if(!menu)return;
 const r=details.getBoundingClientRect(),above=r.top-menu.offsetHeight-8>=76;
 menu.style.position='fixed';menu.style.width='112px';menu.style.left=Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,r.left))+'px';menu.style.right='auto';menu.style.bottom='auto';menu.style.top=(above?r.top-menu.offsetHeight-8:Math.min(innerHeight-menu.offsetHeight-12,r.bottom+8))+'px';
}
document.addEventListener('toggle',event=>{if(event.target.matches?.('.creation-audio-type[open]'))requestAnimationFrame(positionReferenceAudioType);},true);
window.addEventListener('resize',positionReferenceAudioType);
