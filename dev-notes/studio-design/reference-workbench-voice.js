/* Observed display presets only; selection does not synthesize or preview audio. */
'use strict';
const referenceVoiceNames=["Adorable Girl", "Aloof Girl", "Amiable Grandpa", "Amiable Lady", "Baritone Man", "Bookish Girl", "Bright Teen", "Career Lady", "Clean Boy", "Clean Teen", "Clever Boy", "Commanding Lady", "Composed Lady", "Composed Man", "Cool Lady", "Cool Teen", "Cutie Boy", "Deep Elder", "Deep Man", "Dignified Lady", "Dreamy Girl", "Elder Man", "Elegant Lady", "Elegant Sis", "Firm Man", "Fresh Guy", "Gentle Auntie", "Gentle Girl", "Gentle Lady", "Gentleman", "Giggly Girl", "Gracious Lady", "Gracious Lady 2", "Grizzled Elder", "Intelligent Lady", "Kindly Granny", "Kindly Lady", "Leader Man", "Loving Granny", "Loving Lady", "Magnetic Man", "Mature Guy", "Mature Lady", "Mellow Lady", "Milky Girl", "Motherly Lady", "Passionate Guy", "Peaceful Lady", "Playful Boy", "Poised Lady", "Powerful Man", "Prestigious Man", "Pro Lady", "Quiet Boy", "Refined Man", "Reliable Guy", "Rich Man", "Rock Man", "Seasoned Elder", "Seasoned Man", "Serene Lady", "Shy Girl", "Solid Guy", "Solid Man", "Soothing Lady", "Soothing Sis", "Steady Gent", "Steady Guy", "Steady Man", "Stern Man", "Strong Lady", "Sunny Boy", "Sunny Teen", "Sweet Girl", "Sweet Sis", "Timid Boy", "Trusty Man", "Vibrant Youth", "Warm Granny", "Warm Lady", "Warm Sis", "Weathered Elder", "Weathered Man", "Wise Elder", "Wise Grandpa", "Wise Man"];
let referenceVoiceNodeId=null;
function referenceVoiceTriggerContent(name){return `<span title="${esc(name||'请选择音色')}">${esc(name||'请选择音色')}</span>${I('down')}`;}
function referenceCloseVoicePicker(){document.querySelector('.ref-wb-voice-popover')?.remove();for(const trigger of document.querySelectorAll('[data-wb-voice-open],[data-canvas-voice]'))trigger.setAttribute('aria-expanded','false');}
function referenceVoiceOptions(query=''){
 const selected=(referenceVoiceNodeId?canvasCreationDraft(nodeById(referenceVoiceNodeId)).creationVoicePreset:referenceWorkbenchAssetEditor?.voicePreset)?.name;
 return referenceVoiceNames.filter(name=>name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(name=>`<button role="option" tabindex="-1" aria-selected="${name===selected}" data-wb-voice-name="${name}">${name}${name===selected?I('check'):''}</button>`).join('')||'<p role="status">没有匹配的音色</p>';
}
/** Keep voice options readable even when their trigger is a small canvas icon. */
function referenceVoicePickerLayout(rect,viewportWidth,viewportHeight){
 const margin=12,gap=6,width=Math.min(Math.max(rect.width,260),320,viewportWidth-margin*2);
 const below=Math.max(0,viewportHeight-margin-rect.bottom-gap),above=Math.max(0,rect.top-margin-gap);
 const downward=below>=300||below>=above,height=Math.min(300,downward?below:above);
 return {width,height,left:Math.max(margin,Math.min(viewportWidth-width-margin,rect.left)),top:downward?rect.bottom+gap:Math.max(margin,rect.top-height-gap)};
}
function referenceOpenVoicePicker(nodeId=null){
 if(!nodeId&&!referenceWorkbenchAssetEditor)return;referenceCloseVoicePicker();referenceVoiceNodeId=nodeId;
 const trigger=document.querySelector(nodeId?'[data-canvas-voice]':'[data-wb-voice-open]'),layout=referenceVoicePickerLayout(trigger.getBoundingClientRect(),innerWidth,innerHeight);
 document.getElementById('modal-root').insertAdjacentHTML('beforeend',`<div class="ref-wb-voice-popover" style="width:${layout.width}px;max-height:${layout.height}px;left:${layout.left}px;top:${layout.top}px"><input aria-label="搜索音色" aria-controls="ref-wb-voice-options" placeholder="搜索音色" data-wb-voice-search><div id="ref-wb-voice-options" role="listbox" aria-label="音色">${referenceVoiceOptions()}</div><footer><span>音色配置，不合成音频</span><button data-wb-voice-clear>清除</button></footer></div>`);
 trigger.setAttribute('aria-expanded','true');document.querySelector('[data-wb-voice-search]').focus({preventScroll:true});
}
function referenceSelectVoice(name){
 if(referenceVoiceNodeId){const n=nodeById(referenceVoiceNodeId);if(!n){referenceCloseVoicePicker();return;}(S.nodeDrafts[n.id]??={}).creationVoicePreset=name?{id:name.toLowerCase().replaceAll(' ','-'),name}:null;referenceCloseVoicePicker();save();refreshCanvasCreation();frameCanvasNodeControls();document.querySelector('[data-canvas-voice]')?.focus({preventScroll:true});return;}
 const editor=referenceWorkbenchAssetEditor;if(!editor)return;
 editor.voicePreset=name?{id:name.toLowerCase().replaceAll(' ','-'),name}:null;
 const button=document.querySelector('[data-wb-voice-open]');if(button)button.innerHTML=referenceVoiceTriggerContent(name);referenceCloseVoicePicker();button?.focus({preventScroll:true});
}
document.addEventListener('input',event=>{if(event.target.matches('[data-wb-voice-search]'))document.querySelector('.ref-wb-voice-popover [role=listbox]').innerHTML=referenceVoiceOptions(event.target.value);});
document.addEventListener('click',event=>{
 const canvasButton=event.target.closest('[data-canvas-voice]');if(canvasButton){event.preventDefault();referenceOpenVoicePicker(canvasButton.dataset.canvasVoice);return;}
 if(event.target.closest('[data-wb-voice-open]')){event.preventDefault();document.querySelector('.ref-wb-voice-popover')?referenceCloseVoicePicker():referenceOpenVoicePicker();return;}
 const option=event.target.closest('[data-wb-voice-name]');if(option){event.preventDefault();referenceSelectVoice(option.dataset.wbVoiceName);return;}
 if(event.target.closest('[data-wb-voice-clear]')){event.preventDefault();referenceSelectVoice(null);return;}
 if(!event.target.closest('.ref-wb-voice-popover'))referenceCloseVoicePicker();
},true);
window.addEventListener('keydown',event=>{
 const picker=document.querySelector('.ref-wb-voice-popover');if(!picker)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseVoicePicker();document.querySelector(referenceVoiceNodeId?'[data-canvas-voice]':'[data-wb-voice-open]')?.focus();return;}
 const options=[...picker.querySelectorAll('[role=option]')],index=options.indexOf(document.activeElement),search=picker.querySelector('[data-wb-voice-search]');
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&!(event.target===search&&['Home','End'].includes(event.key))){
  event.preventDefault();event.stopImmediatePropagation();if(!options.length)return;
  const next=event.key==='Home'?0:event.key==='End'?options.length-1:index<0?(event.key==='ArrowUp'?options.length-1:0):(index+(event.key==='ArrowDown'?1:options.length-1))%options.length;
  options[next].focus({preventScroll:true});options[next].scrollIntoView({block:'nearest'});return;
 }
 if(event.key==='Enter'&&event.target===search){event.preventDefault();event.stopImmediatePropagation();if(options[0])referenceSelectVoice(options[0].dataset.wbVoiceName);return;}
 if(event.key==='Tab'){
  event.preventDefault();event.stopImmediatePropagation();
  const clear=picker.querySelector('[data-wb-voice-clear]');(event.target===clear?search:clear).focus();
 }
},true);
window.addEventListener('resize',referenceCloseVoicePicker);

/* A fixed menu must not remain detached when its anchor scrolls away. */
document.addEventListener('scroll',event=>{
 const picker=document.querySelector('.ref-wb-voice-popover');if(!picker||picker.contains(event.target))return;
 const trigger=document.querySelector(referenceVoiceNodeId?'[data-canvas-voice]':'[data-wb-voice-open]');
 if(event.target===document||event.target instanceof Element&&event.target.contains(trigger))referenceCloseVoicePicker();
},true);
