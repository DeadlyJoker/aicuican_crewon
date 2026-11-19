/* Canvas creation is a local design preview, using the existing candidate snapshots. */
'use strict';
let canvasSubmitting=false;
function canvasOutlineHtml(){return canvasNavigatorHtml();}
function canvasCreationNode(){const n=nodeById(S.selected);return n&&S.view==='canvas'&&studioCandidateKinds.has(n.kind)&&n.kind!=='final'?n:null;}
/** Resolve an optional inline preset without opening an independent node-tool panel. */
function canvasPresetExecution(n){return null;}
/** Ordinary prompts retain their existing submission behavior; preset providers may constrain it. */
function canvasPromptCanSubmit(n,d,prompt){return mediaKind(n)!=='video'||!referenceVideoBinding(d)?.error;}
function canvasCreationDraft(n){return {...n.creationPreferences,...S.nodeDrafts[n.id]};}
/** Menu labels may differ from existing tool names; disabled choices never dispatch actions. */
function canvasToolMenu(label,icon,items){return `<details class="canvas-tool-menu"><summary role="button" aria-label="${esc(label)}">${I(icon)}${label}${I('down')}</summary><div role="menu" aria-label="${esc(label)}">${items.map(item=>{const spec=typeof item==='string'?{label:item,tool:item}:item;return `<button class="button ghost" role="menuitem" ${spec.disabled?'disabled':`data-action="canvas-creation-tool:${esc(spec.tool)}"`}>${esc(spec.label)}</button>`;}).join('')}</div></details>`;}
function canvasContextToolbar(n){
 if(['video','voice','audio'].includes(n.kind))return '';
 const kind=mediaKind(n),version=n.candidates?.length||0;
 const groups=kind==='image'?`${btn('参考编辑','canvas-creation-tool:参考图编辑','ghost','image')}${n.kind==='scene'?canvasToolMenu('构图','scene',['多角度相机','扩图','多机位九宫格']):btn('人物调节','canvas-tool-open:person','ghost','user')}${btn('编辑元素','canvas-tool-open:elements','ghost','layers')}${referenceStoryboardMenuHtml()}${btn('宫格裁剪','grid-crop-open','ghost','grid')}${canvasToolMenu('画质','layers',[{label:'增强',tool:'画质增强'},{label:'放大',disabled:true},{label:'高清',tool:'图片超分'}])}${btn('角度','canvas-tool-open:angle','ghost','rotate')}${btn('打光','canvas-tool-open:lighting','ghost','sun')}${canvasToolMenu('更多','more',[{label:'调色',tool:'调色'},{label:'裁剪',tool:'裁剪'},{label:'旋转',tool:'旋转'},{label:'重绘',tool:'局部重绘'},{label:'擦除',tool:'擦除'},'扩图','抠图',{label:'去文字',tool:'擦除文字'}])}`:kind==='video'?`${btn('图生视频','canvas-creation-tool:图片生成视频','ghost','film')}${btn('续写','canvas-creation-tool:视频续写','ghost','arrow')}${btn('重拍','canvas-creation-tool:片段重拍','ghost','image')}${canvasToolMenu('画质','layers',['视频超分','画质增强','扩展画幅'])}`:`${btn('配音','canvas-creation-audio-mode:voice','ghost','mic')}${btn('氛围音乐','canvas-creation-audio-mode:music','ghost','spark')}${btn('提取音轨','canvas-creation-tool:音轨提取','ghost','film')}`;
 return `<div class="selection-toolbar creation-toolbar" role="toolbar" aria-label="选中内容操作">${groups}<span class="creation-tool-divider"></span>${kind==='image'&&studioAdoptedCandidate(n)?iconBtn('下载原图','canvas-creation-image-download','download')+iconBtn('放大预览','canvas-creation-image-preview','fit'):''}${kind==='image'?'':`<details class="node-more"><summary role="button" aria-label="节点操作">节点操作</summary><div>${version?btn('版本 '+version,'candidate-review:'+n.id,'ghost','history'):''}${btn('深度编辑','edit-node:'+n.id,'ghost','sliders')}${btn('定位内容','focus-node:'+n.id,'ghost','fit')}${btn('复制内容','duplicate:'+n.id,'ghost','copy')}${btn('全部创作工具','all-tools','ghost','layers')}</div></details>`}</div>`;
}
/** Keep media-specific settings separate; audio never inherits image dimensions. */
function canvasMediaSettings(n,d){
 const kind=mediaKind(n),base={model:d.creationModel||'project'};
 if(kind==='image'&&d.creationImageFamily)return {mediaType:kind,...referenceImageSettings(d,n)};
 if(kind==='video'){const selected=referenceVideoExecutionSettings(n,d);if(selected)return {...selected,mediaType:'video'};}
 return kind==='audio'?{...base,mediaType:kind,mode:d.creationAudioMode||'voice',expression:d.creationExpression||'自然旁白',pace:d.creationPace||'自然',...(d.creationAudioMode==='music'?{musicStyle:d.creationMusicStyle||'',lyrics:d.creationLyrics||''}:{...referenceAudioSettings(d),...(d.creationVoicePreset?{voicePreset:structuredClone(d.creationVoicePreset)}:{})})}:{...base,mediaType:kind,ratio:d.creationRatio||'自适应',resolution:kind==='video'?(d.creationVideoResolution||'720p'):(d.creationResolution||'1K'),...(kind==='video'?referenceVideoSettings(n,d):referenceImageSettings(d,n))};
}
/** Capture the selected character voice when starting a separate audio draft. */
function canvasDerivedPreferences(source,kind){return kind==='voice'&&source.voicePreset?{creationVoicePreset:structuredClone(source.voicePreset)}:{};}
function canvasVoicePresetHtml(n,d){return mediaKind(n)==='audio'&&d.creationAudioMode!=='music'?`<button class="canvas-voice-preset" data-canvas-voice="${n.id}" aria-label="选择声音音色" aria-haspopup="listbox" title="${esc(d.creationVoicePreset?.name||'选择音色')}">${esc(d.creationVoicePreset?.name||'选择音色')}${I('down')}</button>`:'';}
function canvasMediaParametersHtml(n,d){
 const kind=mediaKind(n),settings=canvasMediaSettings(n,d);
 if(kind==='audio'&&settings.mode==='music')return `<details class="creation-settings"><summary role="button" aria-label="制作参数">${I('sliders')}音乐参数${I('down')}</summary><div><span>音乐风格与歌词分别保存；正式参数由所选模型提供</span></div></details>`;
 if(kind==='audio')return referenceAudioParametersHtml(d);
 if(kind==='video')return referenceVideoParametersHtml(n,d);
 return referenceImageParametersHtml(d,'node',n);
}
/** Audio modes retain independent input; switching never rewrites a prior candidate. */
function canvasAudioModeHtml(n,d){
 if(mediaKind(n)!=='audio')return '';
 const mode=d.creationAudioMode||'voice';
 return `<details class="creation-settings creation-audio-type"><summary role="button" aria-label="声音创作类型">${mode==='music'?'音乐':'语音'}${I('down')}</summary><div role="group" aria-label="声音类型">${[['voice','语音'],['music','音乐']].map(([value,label])=>`<button aria-pressed="${mode===value}" data-action="canvas-creation-audio-mode:${value}">${label}</button>`).join('')}</div></details>`;
}
/** Identify the first missing music input without treating a style description as lyrics. */
function canvasMusicInputIssue(style,lyrics){
 if(!style?.trim())return {field:'canvas-music-style',message:'请填写音乐风格'};
 if(!lyrics?.trim())return {field:'canvas-creation-prompt',message:'请填写歌词'};
 return null;
}
function canvasPromptHtml(n,d,prompt){
 const music=mediaKind(n)==='audio'&&d.creationAudioMode==='music';
 return `${music?`<label class="creation-music-label" for="canvas-music-style">音乐风格</label><textarea id="canvas-music-style" class="creation-music-style" data-creation-setting="creationMusicStyle" aria-label="音乐风格" aria-describedby="canvas-creation-error" placeholder="描述曲风、情绪、节奏与乐器…">${esc(d.creationMusicStyle||'')}</textarea>`:''}<label class="${music?'creation-music-label':'creation-prompt-label'}" for="canvas-creation-prompt">${music?'歌词':'节点提示词'}</label><textarea id="canvas-creation-prompt" aria-label="${music?'歌词':'节点提示词'}" aria-describedby="canvas-creation-error" placeholder="${music?'输入或粘贴歌词…':'描述你希望保留或调整的内容…'}">${esc(music?d.creationLyrics||'':prompt)}</textarea>`;
}
const canvasVideoModes=referenceVideoModeLabels;
/** Resolve active media references without deleting inactive inputs or changing their versions. */
function canvasVideoReferencePlan(d,refs){
 const visual=refs.filter(ref=>['character','scene','image'].includes(ref.sourceKind));
 const mode=d.creationVideoMode|| (refs.length?'reference':'text');
 const ordered=mode==='frames'&&d.creationReverseFrames&&visual.length>=2?[visual[1],visual[0],...visual.slice(2)]:visual;
 const videos=refs.filter(ref=>['video','shot'].includes(ref.sourceKind)),videoMode=['video','edit','extend'].includes(mode);
 const active=mode==='text'?[]:videoMode?videos.slice(0,1):mode==='images'?visual:mode==='first'?ordered.slice(0,1):mode==='frames'?ordered.slice(0,2):refs;
 const roles=active.map((ref,index)=>({sourceId:ref.sourceId,candidateId:ref.candidateId,role:mode==='frames'?(index===0?'首帧':'尾帧'):mode==='first'?'首帧':videoMode?'视频参考':'参考'}));
 const required=mode==='frames'?2:mode!=='text'?1:0;
 const count=videoMode?videos.length:['first','frames','images'].includes(mode)?visual.length:refs.length;
 const error=count<required?`请再添加 ${required-count} 份${videoMode?'视频参考':mode==='reference'?'参考素材':'画面参考'}`:'';
 return {mode,active,roles,error};
}
function canvasVideoModeHtml(n,d,refs){
 if(mediaKind(n)!=='video')return '';
 const plan=canvasVideoReferencePlan(d,refs),binding=referenceVideoBinding(d),modes=binding&&!binding.error?binding.family.modes.map(m=>[m.id,m.label]):['text','reference','first','frames'].map(id=>[id,canvasVideoModes[id]]);
 return `${binding?.error?`<p class="creation-reference-notice" role="alert">${esc(binding.error)}</p>`:''}<div class="creation-audio-modes creation-video-modes" role="group" aria-label="视频创作方式">${modes.map(([mode,label])=>`<button aria-pressed="${plan.mode===mode}" data-action="canvas-creation-video-mode:${mode}">${label}</button>`).join('')}${plan.mode==='frames'&&plan.active.length===2?`<button class="creation-swap" data-action="canvas-creation-swap-frames" aria-label="交换首尾帧">${I('rotate')}</button>`:''}</div>${plan.error?`<p class="creation-reference-notice" role="status">${esc(plan.error)}${btn('选择素材','asset-picker:'+n.id,'ghost')}</p>`:''}`;
}
function canvasDisplayReferences(n,d,refs){
 if(mediaKind(n)!=='video')return refs;
 const active=canvasVideoReferencePlan(d,refs).active;
 return [...active,...refs.filter(ref=>!active.some(item=>item.sourceId===ref.sourceId))];
}
function canvasReferenceHtml(n,d,ref,refs){
 const video=mediaKind(n)==='video',plan=video?canvasVideoReferencePlan(d,refs):null,role=plan?.roles.find(item=>item.sourceId===ref.sourceId)?.role;
 const inactive=video&&!role;
 return `<button class="creation-reference ${inactive?'creation-reference-inactive':''}" data-action="asset-picker:${n.id}" aria-label="调整参考：${esc(ref.sourceTitle)} v${ref.number}${video?' · '+(role||'未生效'):''}">${studioAssetThumb(ref)}<span>${esc(ref.sourceTitle)}</span><small>v${ref.number}</small>${video?`<em>${role||'未生效'}</em>`:''}</button>`;
}
function canvasCreationHtml(){
 const n=canvasCreationNode();if(!n||S.panel==='selection')return '';
 if(canvasActiveTool?.nodeId===n.id)return canvasNodeToolHtml(n);
 const d=canvasCreationDraft(n),kind=mediaKind(n),refs=studioAssetReferenceSnapshot(n);
 const prompt=d.prompt??n.prompt??n.text??n.description??'';
 return `<section class="canvas-creation ${kind==='audio'?'creation-audio':''} ${kind==='audio'&&!refs.length&&!studioAdoptedCandidate(n)?'creation-audio-plain':''}" aria-label="节点提示词编辑" data-creation-node="${n.id}">${canvasVideoModeHtml(n,d,refs)}<header class="creation-reference-row"><div class="creation-references">${typeof canvasStyleReferenceHtml==='function'?canvasStyleReferenceHtml(d):''}${studioAdoptedCandidate(n)?`<button class="creation-reference creation-base" data-action="candidate-review:${n.id}:${n.adoptedCandidateId}" aria-label="查看当前采用画面">${studioAssetThumb({sourceKind:n.kind,frame:studioAdoptedCandidate(n).frame})}<span>当前画面</span></button>`:''}${canvasDisplayReferences(n,d,refs).map(ref=>canvasReferenceHtml(n,d,ref,refs)).join('')}<button class="creation-reference-add" data-action="asset-picker:${n.id}" aria-label="添加制作参考">${I('plus')}</button><span class="creation-selection">${esc(n.title)}<small>提示词编辑</small></span></div>${iconBtn(d.creationExpanded?'收起提示词':'展开提示词','canvas-creation-expand','fit')}</header>${typeof canvasPresetTagsHtml==='function'?canvasPresetTagsHtml(d):''}${canvasPromptHtml(n,d,prompt)}<p class="creation-error" id="canvas-creation-error" role="alert" hidden>请填写${kind==='audio'&&d.creationAudioMode==='music'?'音乐风格与歌词':'提示词'}</p><footer class="creation-control-row">${canvasAudioModeHtml(n,d)}${kind==='video'?referenceVideoModelPickerHtml(n,d):kind==='image'?referenceAssetImageModelPicker(d,'node',n):`<label class="creation-model">${I(kind==='audio'?'mic':kind==='video'?'film':'image')}<select aria-label="制作模型" data-creation-setting="creationModel"><option value="project" ${!d.creationModel||d.creationModel==='project'?'selected':''}>跟随项目模型</option><option value="preview" ${d.creationModel==='preview'?'selected':''}>低成本预览 · 示例</option><option value="quality" ${d.creationModel==='quality'?'selected':''}>${kind==='audio'?'精细声音':'精细画面'} · 示例</option></select></label>`}${canvasVoicePresetHtml(n,d)}${canvasMediaParametersHtml(n,d)}${kind==='image'?`<div class="creation-image-tools" role="group" aria-label="图片创作工具">${typeof roleDesignTriggerHtml==='function'?roleDesignTriggerHtml(d):''}${typeof canvasStyleTriggerHtml==='function'?canvasStyleTriggerHtml():''}${typeof imagePresetTriggerHtml==='function'?imagePresetTriggerHtml():''}${typeof cameraControlTriggerHtml==='function'?cameraControlTriggerHtml(d):''}</div>`:''}<span class="creation-spacer"></span><label class="creation-count"><select data-creation-setting="creationCount" aria-label="候选数量"><option value="1" ${d.creationCount!=='2'?'selected':''}>1×</option><option value="2" ${d.creationCount==='2'?'selected':''}>2×</option></select></label><span class="creation-demo-label">交给项目 Agent</span><button class="creation-submit" aria-label="提交创作" data-action="canvas-creation-submit" ${canvasPromptCanSubmit(n,d,prompt)?'':'disabled'}>${I('arrowup')}</button></footer></section>`;
}
function refreshCanvasCreation(){
 const vp=document.getElementById('viewport');if(!vp)return;
 if(canvasActiveTool&&canvasActiveTool.nodeId!==S.selected)canvasActiveTool=null;
 vp.querySelector('.canvas-creation')?.remove();vp.insertAdjacentHTML('beforeend',canvasCreationHtml());
 if(!canvasActiveTool)document.querySelectorAll('[data-action^="canvas-tool-open:"]').forEach(el=>el.setAttribute('aria-pressed','false'));
 const n=canvasCreationNode();vp.classList.toggle('has-creation',!!n&&S.panel!=='selection');vp.classList.toggle('creation-expanded',!!n&&!!canvasCreationDraft(n).creationExpanded);syncCanvasToolPreview();positionCanvasNodeOverlays();
}
function handleCanvasCreationAction(action){
 if(handleCanvasReferenceShortcut(action))return true;
 if(handleCanvasNodeToolAction(action))return true;
 const [key,...rest]=action.split(':');const n=canvasCreationNode();
 if(!key.startsWith('canvas-creation-'))return false;if(!n)return true;
 if(key==='canvas-creation-image-download'){void referenceDownloadNodeImage(n.id);return true;}
 if(key==='canvas-creation-image-preview'){const image=document.querySelector(`[data-node="${n.id}"] .node-media`);if(image)referenceOpenAssetPreview(image,null,document.querySelector('[data-action="canvas-creation-image-preview"]'));return true;}
 if(key==='canvas-creation-video-mode'||key==='canvas-creation-swap-frames'){if(mediaKind(n)!=='video')return true;const d=S.nodeDrafts[n.id]??={};if(key==='canvas-creation-swap-frames')d.creationReverseFrames=!d.creationReverseFrames;else if(canvasCreationDraft(n).creationVideoFamily){if(!referenceSelectVideoMode(d,rest[0],canvasCreationDraft(n)))return true;}else if(['text','reference','first','frames'].includes(rest[0]))d.creationVideoMode=rest[0];refreshCanvasCreation();frameCanvasNodeControls();save();return true;}
 if(key==='canvas-creation-video-parameters'){selectNode(n.id);frameCanvasNodeControls();const details=document.querySelector('.ref-video-settings');if(details)details.open=true;return true;}
 if(key==='canvas-creation-audio-mode'){const mode=rest[0];if(mediaKind(n)!=='audio'||!['voice','music'].includes(mode))return true;const d=S.nodeDrafts[n.id]??={};d.creationAudioMode=mode;refreshCanvasCreation();frameCanvasNodeControls();save();return true;}
 if(key==='canvas-creation-expand'){const d=S.nodeDrafts[n.id]??={};d.creationExpanded=!canvasCreationDraft(n).creationExpanded;refreshCanvasCreation();if(d.creationExpanded)frameCanvasNodeControls();save();return true;}
 if(key==='canvas-creation-tool'){const name=rest.join(':');if(name==='参考图编辑'){canvasActiveTool=null;refreshCanvasCreation();document.getElementById('canvas-creation-prompt')?.focus({preventScroll:true});}else if(Object.hasOwn(canvasStoryboardPresets,name)){storeCanvasToolValue(n,'storyboard','preset',name);handleCanvasNodeToolAction('canvas-tool-open:storyboard');}else handleAction('tool:'+name);return true;}
 if(key==='canvas-creation-submit'){
  if(canvasSubmitting||currentModal)return true;
  const nodePanel=canvasActiveTool?.nodeId===n.id,tool=nodePanel?canvasToolExecution(n):canvasPresetExecution(n);
  const field=document.getElementById('canvas-creation-prompt'),draft=canvasCreationDraft(n),music=mediaKind(n)==='audio'&&draft.creationAudioMode==='music',style=draft.creationMusicStyle?.trim(),lyrics=field?.value.trim(),prompt=tool?.prompt||(music?(style&&lyrics?`风格：${style}\n歌词：${lyrics}`:''):lyrics);
  const references=studioAssetReferenceSnapshot(n),videoPlan=mediaKind(n)==='video'?canvasVideoReferencePlan(draft,references):null;
  const modelError=mediaKind(n)==='video'?referenceVideoBinding(draft)?.error:mediaKind(n)==='image'&&draft.creationImageFamily&&!referenceAssetImageBinding(draft,referenceImageDraftMode('node',n))?'当前图片模型已不在目录中，请重新选择':null;
  const musicIssue=music&&!tool?canvasMusicInputIssue(style,lyrics):null;
  if(!prompt||videoPlan?.error||modelError){const error=document.getElementById('canvas-creation-error');error.textContent=modelError||videoPlan?.error|| musicIssue?.message||'请先填写提示词';error.hidden=false;const invalid=document.getElementById(musicIssue?.field||'canvas-creation-prompt');invalid?.setAttribute('aria-invalid','true');invalid?.focus();return true;}
  const submitRect=document.querySelector('[data-action="canvas-creation-submit"]').getBoundingClientRect();canvasSubmitting=true;
  try{
   const d=canvasCreationDraft(n),request={project:S.project,nodeId:n.id,sourceReferences:structuredClone(videoPlan?videoPlan.active:references),input:{prompt,dialogue:d.dialogue??n.dialogue??'',seconds:mediaKind(n)==='video'?(referenceVideoExecutionSettings(n,d)?.seconds??(Number(d.seconds??n.seconds)||0)):0,motion:d.motion??n.motion??'',creationSettings:{baseCandidateId:studioAdoptedCandidate(n)?.id||null,baseCandidateNumber:studioAdoptedCandidate(n)?.number||null,...canvasMediaSettings(n,d),...tool?.mediaSettings,...(videoPlan?{videoMode:videoPlan.mode,referenceRoles:structuredClone(videoPlan.roles)}:{}),tool:tool?.name||(d.creationCostume?'角色变装':'提示词编辑'),...(tool?{toolSettings:tool.settings}:{})}}};
   if(tool)delete request.input.creationSettings.costume;
   const {created}=createPreparedCandidates(request,prompt,nodePanel?1:d.creationCount||1);S.revision++;render();openCandidateReview(n.id,created[0].id);const openedAt=performance.now();document.getElementById('overlay')?.addEventListener('click',event=>{if(event.target.id==='overlay'&&performance.now()-openedAt<400&&event.clientX>=submitRect.left&&event.clientX<=submitRect.right&&event.clientY>=submitRect.top&&event.clientY<=submitRect.bottom)event.stopImmediatePropagation();},{capture:true});toast('已新增示例候选，原采用结果保留');
  }finally{canvasSubmitting=false;}
  return true;
 }
 return false;
}
document.addEventListener('input',event=>{
 const n=canvasCreationNode();if(!n)return;
 if(event.target.id==='canvas-creation-prompt'){const d=S.nodeDrafts[n.id]??={};if(mediaKind(n)==='audio'&&canvasCreationDraft(n).creationAudioMode==='music')d.creationLyrics=event.target.value;else d.prompt=event.target.value;event.target.removeAttribute('aria-invalid');document.getElementById('canvas-creation-error').hidden=true;save();}
 if(event.target.dataset.creationSetting&&['INPUT','TEXTAREA'].includes(event.target.tagName)){const d=S.nodeDrafts[n.id]??={};d[event.target.dataset.creationSetting]=event.target.value;if(event.target.id==='canvas-music-style'){event.target.removeAttribute('aria-invalid');document.getElementById('canvas-creation-error').hidden=true;}save();}
});
document.addEventListener('change',event=>{if(!event.target.dataset.creationSetting)return;const n=canvasCreationNode();if(!n)return;const d=S.nodeDrafts[n.id]??={};d[event.target.dataset.creationSetting]=event.target.value;if(event.target.dataset.creationSetting==='creationCount'){save();return;}const summary=document.querySelector('.canvas-creation .creation-settings:not(.creation-audio-type) > summary');if(summary){const template=document.createElement('template');template.innerHTML=canvasMediaParametersHtml(n,canvasCreationDraft(n));summary.innerHTML=template.content.querySelector('summary').innerHTML;}save();});
document.addEventListener('click',event=>{document.querySelectorAll('.canvas-tool-menu[open],.creation-settings[open]').forEach(el=>{if(!el.contains(event.target)||event.target.closest('[data-action]'))el.open=false;});});
window.addEventListener('resize',()=>{document.querySelectorAll('.canvas-tool-menu[open],.creation-settings[open]').forEach(menu=>{menu.open=false;});});
/** Tool menus keep keyboard navigation inside their enabled choices. */
document.addEventListener('keydown',event=>{
 const menu=event.target.closest?.('.canvas-tool-menu');if(!menu||!menu.querySelector('[role=menu]'))return;
 const summary=menu.querySelector('summary'),items=[...menu.querySelectorAll('[role=menuitem]:not(:disabled)')];
 if(event.key==='Escape'&&menu.open){menu.open=false;summary.focus({preventScroll:true});event.preventDefault();event.stopImmediatePropagation();return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||!items.length)return;
 menu.open=true;const index=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:index<0?(event.key==='ArrowUp'?items.length-1:0):(index+(event.key==='ArrowDown'?1:items.length-1))%items.length;
 items[next].focus();event.preventDefault();event.stopImmediatePropagation();
},true);
document.addEventListener('keydown',event=>{if(event.target.id==='canvas-creation-prompt'&&event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();handleCanvasCreationAction('canvas-creation-submit');}});

/** Reserve both the floating card name and the owning group heading above a node. */
function canvasNodeLabelClearance(element){
 const group=typeof referenceReadGroups==='function'?referenceReadGroups(S).find(g=>g.nodeIds.includes(S.selected)):null;
 const label=group?document.querySelector(`[data-asset-group="${group.id}"] .world-section-label`):null;
 return Math.max(element.classList.contains('ref-media-node')?38:12,label?element.getBoundingClientRect().top-label.getBoundingClientRect().top+12:0);
}
/** Fit a prompt beside its node without intersecting the node or viewport edges. */
function canvasPromptPlacement(node,bounds,size,gap=12){
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const width=Math.min(size.width,bounds.right-bounds.left),height=size.height;
 const x=clamp((node.left+node.right-width)/2,bounds.left,bounds.right-width);
 if(node.bottom+gap+height<=bounds.bottom)return {left:x,top:Math.max(bounds.top,node.bottom+gap),width};
 if(node.top-gap-height>=bounds.top)return {left:x,top:node.top-gap-height,width};
 const y=clamp((node.top+node.bottom-height)/2,bounds.top,bounds.bottom-height);
 const rightWidth=Math.min(width,bounds.right-node.right-gap),leftWidth=Math.min(width,node.left-gap-bounds.left);
 if(rightWidth>=260&&height<=bounds.bottom-bounds.top)return {left:node.right+gap,top:y,width:rightWidth};
 if(leftWidth>=260&&height<=bounds.bottom-bounds.top)return {left:node.left-gap-leftWidth,top:y,width:leftWidth};
 return null;
}
/** Position media controls from the selected node's live canvas rectangle. */
function positionCanvasNodeOverlays(){
 const vp=document.getElementById('viewport'),node=document.querySelector(`[data-node="${S.selected}"]`),bar=document.querySelector('.creation-toolbar'),panel=document.querySelector('.canvas-creation');if(!vp||!node||(!bar&&!panel))return;
 const r=node.getBoundingClientRect(),v=vp.getBoundingClientRect();
 node.classList.toggle('reference-inside-left',r.left-v.left<50);node.classList.toggle('reference-inside-right',v.right-r.right<50);
 const margin=v.width<500?12:24,topInset=Math.max(margin,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||v.top)-v.top+12),navigation=document.querySelector('.canvas-navigator'),covered=navigation?Math.max(0,navigation.getBoundingClientRect().right-v.left):0,leftInset=Math.max(v.width<500?12:76,covered?covered+76:0),available=v.width-leftInset-margin;
 const visible=available>=280&&r.right>v.left+covered&&r.left<v.right&&r.bottom>v.top&&r.top<v.bottom;if(bar)bar.hidden=!visible;if(panel)panel.hidden=!visible;if(!visible)return;
 if(bar)bar.style.maxWidth=available+'px';if(panel){panel.style.width='';panel.style.maxWidth=available+'px';}
 if(panel)panel.style.maxHeight=Math.floor(panel.classList.contains('node-tool-panel')?v.height-topInset-margin:v.height*.65)+'px';
 const center=r.left-v.left+r.width/2;
 const place=(el,top)=>{el.style.left=Math.max(leftInset,Math.min(v.width-el.offsetWidth-margin,center-el.offsetWidth/2))+'px';el.style.top=Math.max(topInset,Math.min(v.height-el.offsetHeight-margin,top))+'px';};
 const labelClearance=canvasNodeLabelClearance(node);
 const barHeight=bar?.offsetHeight||0,toolbarTop=r.top-v.top-barHeight-labelClearance,toolbarBelow=!!bar&&toolbarTop<topInset;
 if(bar)place(bar,toolbarBelow?r.bottom-v.top+12:toolbarTop);
 if(panel&&panel.classList.contains('node-tool-panel')){place(panel,r.bottom-v.top+14);}
 else if(panel){
  const nodeRect={left:r.left-v.left,right:r.right-v.left,top:r.top-v.top-(toolbarBelow?0:barHeight+labelClearance),bottom:r.bottom-v.top+(toolbarBelow?barHeight+12:0)};
  let placement=canvasPromptPlacement(nodeRect,{left:leftInset,right:v.width-margin,top:topInset,bottom:v.height-margin},{width:panel.offsetWidth,height:panel.offsetHeight});
  if(!placement){
   const space=Math.max(nodeRect.top-topInset-12,v.height-margin-nodeRect.bottom-12);
   if(space>=140){panel.style.maxHeight=Math.floor(space)+'px';placement=canvasPromptPlacement(nodeRect,{left:leftInset,right:v.width-margin,top:topInset,bottom:v.height-margin},{width:panel.offsetWidth,height:panel.offsetHeight});}
  }
  if(placement){panel.style.width=placement.width+'px';panel.style.left=placement.left+'px';panel.style.top=placement.top+'px';}
  else{panel.hidden=true;}
 }
}

document.addEventListener('toggle',event=>{if(!event.target.matches?.('.creation-settings')||!event.target.closest('.canvas-creation')||!event.target.isConnected)return;const menu=event.target.querySelector(':scope > div'),viewport=document.getElementById('viewport');if(!event.target.open||!menu||!viewport)return;const r=event.target.getBoundingClientRect(),vp=viewport.getBoundingClientRect();menu.style.top=r.bottom+menu.offsetHeight+12<vp.bottom?'42px':'auto';menu.style.bottom=menu.style.top==='auto'?'48px':'auto';},true);

/** Frame prompt editing; independent tool panels only fit their own viewport position. */
function frameCanvasNodeControls(){
 const vp=document.getElementById('viewport'),el=document.querySelector(`[data-node="${S.selected}"]`),panel=document.querySelector('.canvas-creation'),bar=document.querySelector('.creation-toolbar'),n=canvasCreationNode();if(!vp||!el||!panel||!n)return;
 if(panel.matches('.node-tool-panel,.compact-tool-panel,.appearance-panel,.ref-face-panel,.makeup-panel,.pose-panel')){positionCanvasNodeOverlays();return;}
 panel.hidden=false;
 const margin=vp.clientWidth<500?12:24,labelClearance=canvasNodeLabelClearance(el);
 if(vp.clientWidth<500){const tools=document.querySelector('.floating-tools')?.getBoundingClientRect(),left=tools?.width?Math.max(margin,tools.right-vp.getBoundingClientRect().left+12):margin,available=vp.clientWidth-left-margin;S.zoom=Math.max(.25,Math.min(S.zoom,available/n.w));const x=S.pan.x+n.x*S.zoom,width=n.w*S.zoom;if(x<left||x+width>vp.clientWidth-margin)S.pan.x=left+(available-width)/2-n.x*S.zoom;}
 const top=Math.max(margin,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||vp.getBoundingClientRect().top)-vp.getBoundingClientRect().top+12)+(bar?.offsetHeight||0)+labelClearance,available=vp.clientHeight-panel.offsetHeight-top-margin-14;
 if(available>60&&el.offsetHeight*S.zoom>available){const center=S.pan.x+(n.x+n.w/2)*S.zoom;S.zoom=Math.max(.25,Math.min(S.zoom,available/el.offsetHeight));S.pan.x=center-(n.x+n.w/2)*S.zoom;}
 const y=S.pan.y+n.y*S.zoom,spaceBelow=vp.clientHeight-y-el.offsetHeight*S.zoom;
 if(spaceBelow<panel.offsetHeight+30||y<top)S.pan.y=top-n.y*S.zoom;
 applyCamera();save();
}

document.addEventListener('toggle',event=>{
 if(!event.target.matches?.('.canvas-tool-menu')||!event.target.open)return;
 const menu=event.target.querySelector(':scope > div'),r=event.target.querySelector('summary').getBoundingClientRect(),safeTop=Math.max(12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||0)+8);
 menu.style.position='fixed';menu.style.inset='auto';menu.style.maxHeight=Math.max(48,innerHeight-safeTop-12)+'px';menu.style.overflow='auto';
 menu.style.left=Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,r.left))+'px';
 const below=r.bottom+8,above=r.top-menu.offsetHeight-8;menu.style.top=Math.max(safeTop,Math.min(innerHeight-menu.offsetHeight-12,below+menu.offsetHeight<=innerHeight-12?below:above))+'px';
},true);


/** Keep reference input and subsequent creation separate from direct port connections. */
function canvasNodeReferenceShortcuts(n){
 const input=studioAssetTargetKinds.has(n.kind)?iconBtn('为'+esc(n.title)+'添加参考','node-reference:'+n.id,'plus','node-reference-shortcut input-shortcut'):'';
 const output=studioAssetSourceSnapshot(nodeById(n.id))?iconBtn('基于'+esc(n.title)+'新建内容','node-followup:'+n.id,'plus','node-reference-shortcut output-shortcut'):'';
 return input+output;
}
function handleCanvasReferenceShortcut(action){
 const [key,id,kind]=action.split(':');
 if(!['node-reference','node-followup','node-derive'].includes(key))return false;
 const n=nodeById(id);if(!n)return true;
 if(key==='node-reference'){selectNode(id);studioOpenAssetPicker(id);return true;}
 const reference=studioAssetSourceSnapshot(n);
 if(!reference){toast('请先采用一个版本，再基于它新建内容');return true;}
 if(key==='node-derive'){
  if(!['image','video','voice'].includes(kind))return true;
  document.querySelector('.canvas-followup-menu')?.remove();
  const label={image:'图片',video:'视频',voice:'声音'}[kind];
  addNode(kind,n.title+' · '+label+'草稿',reference,{creationPreferences:canvasDerivedPreferences(n,kind)});return true;
 }
 selectNode(id);
 const trigger=document.querySelector(`[data-action="node-followup:${id}"]`);
 const r=trigger.getBoundingClientRect();
 const menu=document.createElement('div');menu.className='canvas-followup-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','基于此内容新建');
 menu.innerHTML=`<header><span>基于此内容新建</span><small>${esc(n.title)} · v${reference.number}</small></header>${[['image','图片','image'],['video','视频','film'],['voice','声音','mic']].map(([type,label,icon])=>`<button role="menuitem" data-action="node-derive:${id}:${type}">${I(icon)}${label}</button>`).join('')}<footer>仅创建草稿，保留参考版本</footer>`;
 document.body.append(menu);menu.style.left=Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,r.right+8))+'px';menu.style.top=Math.max(12,Math.min(innerHeight-menu.offsetHeight-12,r.top))+'px';menu.querySelector('button').focus({preventScroll:true});return true;
}
document.addEventListener('click',event=>{
 if(!event.target.closest('.canvas-followup-menu,[data-action^="node-followup:"]'))document.querySelector('.canvas-followup-menu')?.remove();
});
document.addEventListener('keydown',event=>{
 const menu=document.querySelector('.canvas-followup-menu');if(!menu)return;
 if(event.key==='Escape'){const id=menu.querySelector('button').dataset.action.split(':')[1];menu.remove();document.querySelector(`[data-action="node-followup:${id}"]`)?.focus({preventScroll:true});event.preventDefault();}
 else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
  const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length;
  buttons[next].focus();event.preventDefault();
 }
});
