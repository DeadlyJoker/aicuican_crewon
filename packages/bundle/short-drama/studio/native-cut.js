/* Native editing uses archived videos and the same ordered clips as Host export. */
'use strict';
let studioCutRequest=null;
function studioCutClipMedia(clip){return clip?.source?.snapshot?.nativeMedia;}
function studioCutTimeline(production){
 let time=0;
 return production.timeline.map((row,index)=>{
  const node=nodeById('shot:'+row.shotId),output=node?.candidates.find(item=>item.id===row.videoId);
  if(!node||!output)throw new Error('时间线素材不可读取，请保留草稿并重新打开项目');
  const clip=referenceCutSourceClip(node,output,'native-cut-'+index);
  Object.assign(clip,{start:time,sourceIn:row.startFrame/production.fps,duration:row.frames/production.fps,nativeVoiceId:row.voiceId,nativeSubtitle:row.subtitle});
  time+=clip.duration;return clip;
 });
}
function studioCutSerialize(editor,production){
 const clips=[...editor.clips].sort((a,b)=>a.start-b.start),fps=production.fps;let end=0;
 if(!clips.length)throw new Error('先添加已采用的视频');
 if(clips.length>120)throw new Error('单集最多保存120个片段，请拆分项目');
 return clips.map(clip=>{
  const media=studioCutClipMedia(clip),shot=production.shots.find(item=>'shot:'+item.id===clip.source?.id);
  if(clip.kind!=='video'||clip.pending||!media||!shot||shot.adoptedVideoId!==media.id||clip.nativeVoiceId&&shot.adoptedVoiceId!==clip.nativeVoiceId)throw new Error('请选择当前已采用的镜头视频；旧草稿素材继续保留');
  if(Math.abs(clip.start-end)>1/fps/2)throw new Error('当前导出支持连续串接，请移除空隙或重叠片段');
  if(clip.scale!==100||clip.opacity!==100||clip.x!==0||clip.y!==0||clip.rotation!==0||clip.volume!==100)throw new Error('当前编码器尚不支持此草稿的变换或混音，请保留原草稿，恢复默认后导出');
  const startFrame=Math.round(clip.sourceIn*fps),frames=Math.round(clip.duration*fps);
  if(frames<1||Math.abs(clip.sourceIn-startFrame/fps)>1/fps/2||startFrame+frames>Math.round(clip.sourceDuration*fps))throw new Error('裁切范围超出源视频');
  end=clip.start+clip.duration;
  return {shotId:shot.id,videoId:media.id,voiceId:clip.nativeVoiceId||null,startFrame,frames,subtitle:clip.nativeSubtitle||''};
 });
}
const studioCutApplyOriginal=referenceCutApply;
referenceCutApply=function(owner,command){if(command.spec?.track&&command.spec.track!=='media')return {ok:false,error:'当前编码支持连续画面轨，叠轨草稿请继续保留'};const result=studioCutApplyOriginal(owner,command);if(result.ok&&result.changed){const clips=owner.editor.clips;if(clips.every(c=>c.kind==='video'&&c.track==='media')){clips.sort((a,b)=>a.start-b.start);let time=0;for(const clip of clips){clip.start=time;time+=clip.duration;}}owner.editor.playhead=Math.min(owner.editor.playhead,referenceCutDuration(owner.editor));owner.editor.nativeDirty=true;}return result;};
const studioCutStopOriginal=referenceCutStop;
referenceCutStop=function(){studioCutStopOriginal();document.querySelectorAll('.native-cut-player,.native-cut-voice').forEach(video=>video.pause());};
const studioCutOpenOriginal=referenceOpenCut;
referenceOpenCut=function(nodeId=null){
 if(!nodeId){
  const production=studioNativeConfig.production,old=S.referenceProjectEdit?.editor;
  if(!old?.nativeProject&&!old?.nativeLegacy){if(old?.clips?.length)S.referenceLegacyProjectEdit=structuredClone(S.referenceProjectEdit);S.referenceProjectEdit={title:'剪辑',editor:{...referenceCutEmpty(),clips:studioCutTimeline(production),nativeProject:studioNativeConfig.project.id,nativeRevision:production.revision,nativeTimeline:JSON.stringify(production.timeline)}};}
  else if(old.nativeProject&&!old.nativeDirty&&old.nativeTimeline!==JSON.stringify(production.timeline))Object.assign(old,{clips:studioCutTimeline(production),nativeRevision:production.revision,nativeTimeline:JSON.stringify(production.timeline)});
  else if(old.nativeProject&&old.nativeTimeline===JSON.stringify(production.timeline))old.nativeRevision=production.revision;
 }
 const owner=nodeId?nodeById(nodeId):S.referenceProjectEdit;if(owner?.editor){owner.editor.fps=studioNativeConfig.production.fps;owner.editor.playhead=Math.min(owner.editor.playhead,referenceCutDuration(owner.editor));}
 studioCutOpenOriginal(nodeId);
};
const studioCutSourceOriginal=referenceCutSourceClip;
referenceCutSourceClip=function(node,output,id,pending=false){const clip=studioCutSourceOriginal(node,output,id,pending);if(output?.nativeMedia?.kind==='video')clip.kind='video';return clip;};
referenceCutClock=function(time){const fps=studioNativeConfig.production.fps,frames=Math.round(Math.max(0,time)*fps);return [Math.floor(frames/(fps*3600)),Math.floor(frames/(fps*60))%60,Math.floor(frames/fps)%60,frames%fps].map(v=>String(v).padStart(2,'0')).join(':');};
const studioCutAssetsOriginal=referenceCutAssets;
referenceCutAssets=function(){return studioCutAssetsOriginal().filter(row=>row.output.nativeMedia?.kind==='video');};
function studioCutVideo(clip,className){const media=studioCutClipMedia(clip);return media?.kind==='video'?`<video class="${className}" src="${esc(media.url)}" preload="metadata" playsinline ${className==='native-cut-player'&&!clip.nativeVoiceId?'':'muted'}></video>`:'';}
referenceCutPreviewHtml=function(owner){
 const d=referenceCutRead(owner),time=Math.min(d.playhead,Math.max(0,referenceCutDuration(d)-1/studioNativeConfig.production.fps)),clip=d.clips.find(c=>!c.pending&&time>=c.start&&time<c.start+c.duration&&c.kind==='video');
 return `<div class="ref-cut-surface" data-native-cut-preview="${esc(clip?.id||'')}" style="aspect-ratio:${d.ratio.replace(':','/')}">${clip?studioCutVideo(clip,'native-cut-player')+(clip.nativeVoiceId?`<audio class="native-cut-voice" src="${esc(studioNativeConfig.production.jobs.flatMap(job=>job.outputs).find(media=>media.id===clip.nativeVoiceId)?.url||'')}" preload="metadata"></audio>`:''):'<div class="ref-cut-empty-preview">选择片段或从左侧添加已采用视频</div>'}</div>`;
};
const studioCutLibraryOriginal=referenceCutLibraryHtml;
referenceCutLibraryHtml=function(){
 if(referenceCutView.tab==='text')return '<p class="ref-cut-library-note">当前支持镜头串接与裁切。文字叠轨尚未接入编码，已有草稿会保留。</p>';
 if(referenceCutView.tab==='settings')return '<p class="ref-cut-library-note">预览、裁切按项目帧率。导出使用原生编码配置，保留视频原音。</p>';
 let html=studioCutLibraryOriginal().replaceAll('示例素材','已采用视频').replace(/<div class="ref-cut-filter">[\s\S]*?<\/div>/,'<div class="ref-cut-filter"><button class="active" data-cut-filter="all">已采用镜头</button></div>');
 for(const {n,output}of referenceCutAssets())html=html.replace(`class="still frame${output.frame}">`,`class="native-cut-thumb">${studioCutVideo({source:{snapshot:output}},'native-cut-thumbnail')}`);
 return html;
};
const studioCutTimelineOriginal=referenceCutTimelineHtml;
referenceCutTimelineHtml=function(owner,inline=false){let html=studioCutTimelineOriginal(owner,inline);for(const clip of referenceCutRead(owner).clips){if(studioCutClipMedia(clip)?.kind==='video')html=html.replace(`<span class="ref-cut-clip-picture still frame${clip.frame}"></span>`,`<span class="ref-cut-clip-picture">${studioCutVideo(clip,'native-cut-thumbnail')}</span>`);}return html;};
referenceCutPropertyHtml=function(owner){const clip=referenceCutSelection(owner);if(!clip)return '<div class="ref-cut-property-empty">选择片段以裁切源视频</div>';if(clip.kind!=='video')return '<div class="ref-cut-property-empty">旧素材草稿已保留；当前编码支持已采用镜头的视频裁切与串接</div>';return `<div class="ref-cut-source"><span>${esc(clip.name)}</span><small>采用 v${clip.source?.number||1} · ${clip.nativeVoiceId?'已采用配音':'原视频声音'}</small></div><details open><summary>裁切源视频</summary><div class="ref-cut-property-pair"><label>入点<input type="number" step="${1/studioNativeConfig.production.fps}" min="0" value="${clip.sourceIn}" data-cut-trim="start" aria-label="裁剪入点"></label><label>出点<input type="number" step="${1/studioNativeConfig.production.fps}" min="0" value="${clip.sourceIn+clip.duration}" data-cut-trim="end" aria-label="裁剪出点"></label></div></details>`;};
const studioCutPaintOriginal=referenceCutPaint;
referenceCutPaint=function(){studioCutPaintOriginal();const root=document.querySelector('.ref-cut-workbench');if(!root)return;root.querySelector('.ref-cut-player>header').textContent='预览';root.querySelector('.ref-cut-properties>header').textContent='片段';root.querySelector('.ref-cut-demo-mark')?.remove();root.querySelector('[aria-label="快捷比例"]')?.remove();const header=root.querySelector('.ref-cut-header'),trigger=header.querySelector('[data-cut-action="export"]');trigger.textContent=studioCutRequest?'处理中…':'导出';trigger.disabled=!!studioCutRequest;trigger.insertAdjacentHTML('beforebegin',`${referenceCutOwner()?.editor.nativeDirty&&referenceCutOwner().editor.nativeTimeline!==JSON.stringify(studioNativeConfig.production.timeline)?'<button class="ref-cut-header-toggle" data-cut-action="native-reload" style="display:block">载入最新时间线</button>':''}${S.referenceLegacyProjectEdit?'<button class="ref-cut-header-toggle native-cut-legacy" data-cut-action="native-legacy" style="display:block">切换保留草稿</button>':''}<button class="ref-cut-export-trigger native-cut-save" data-cut-action="native-save" ${studioCutRequest?'disabled':''}>保存剪辑</button>`);referenceCutUpdatePreview();};
referenceCutUpdatePreview=function(){
 const owner=referenceCutOwner();if(!owner)return;const d=referenceCutRead(owner),preview=document.querySelector('.ref-cut-preview'),time=Math.min(d.playhead,Math.max(0,referenceCutDuration(d)-1/studioNativeConfig.production.fps)),clip=d.clips.find(c=>time>=c.start&&time<c.start+c.duration&&c.kind==='video'&&!c.pending);
 if(preview){if(preview.querySelector('[data-native-cut-preview]')?.dataset.nativeCutPreview!==(clip?.id||''))preview.innerHTML=referenceCutPreviewHtml(owner);referenceCutSizePreview();const video=preview.querySelector('video');if(video&&clip){const target=clip.sourceIn+time-clip.start;const sync=()=>{if(!referenceCutTimer||Math.abs(video.currentTime-target)>.22)video.currentTime=target;if(referenceCutTimer){const playing=video.play();playing.catch(()=>{referenceCutStop();toast('播放被中断，请再次点击播放');});}else video.pause();};if(video.readyState)sync();else video.onloadedmetadata=sync;const voice=preview.querySelector('audio');if(voice){const syncVoice=()=>{const position=Math.min(Math.max(0,time-clip.start),Number.isFinite(voice.duration)?voice.duration:Infinity);if(!referenceCutTimer||Math.abs(voice.currentTime-position)>.22)voice.currentTime=position;if(referenceCutTimer)voice.play().catch(()=>{referenceCutStop();toast('配音播放被中断，请再次点击播放');});else voice.pause();};if(voice.readyState)syncVoice();else voice.onloadedmetadata=syncVoice;}}}
 const clock=document.querySelector('.ref-cut-clock');if(clock)clock.textContent=referenceCutClock(d.playhead);const head=document.querySelector('.ref-cut-playhead'),ruler=document.querySelector('[data-cut-ruler]');if(head&&ruler)head.style.left=180+d.playhead*Number(ruler.dataset.cutPx)+'px';if(ruler)ruler.setAttribute('aria-valuenow',d.playhead);
};
const studioCutCommitOriginal=referenceCutCommit;
referenceCutCommit=function(owner,command,...args){referenceCutStop();const result=studioCutCommitOriginal(owner,command,...args);if(result){owner.editor.nativeDirty=true;save();}return result;};
function studioCutSubmit(owner,exporting){
 if(studioCutRequest)return;referenceCutStop();
 try{const production=studioNativeConfig.production,editor=owner.editor,clips=studioCutSerialize(editor,production),fingerprint=JSON.stringify(clips);
  if(exporting&&(editor.nativeExportInput!==fingerprint||!editor.nativeExportId)){editor.nativeExportInput=fingerprint;editor.nativeExportId=studioRandomUUID();}
  studioCutRequest={owner,fingerprint,exportId:exporting?editor.nativeExportId:null};save();
  studioNativePost('save-cut',{revision:editor.nativeRevision??production.revision,clips,exportId:studioCutRequest.exportId});referenceCutPaint();
 }catch(error){studioCutRequest=null;toast(error.message);}
}
const studioCutRunOriginal=referenceCutRun;
referenceCutRun=function(action,owner){if(action==='native-reload'){referenceCutStop();S.referenceLegacyProjectEdit=structuredClone(S.referenceProjectEdit);S.referenceProjectEdit=null;referenceCloseCut();referenceOpenCut();return;}if(action==='native-legacy'){referenceCutStop();const previous=S.referenceProjectEdit;S.referenceProjectEdit=S.referenceLegacyProjectEdit;S.referenceProjectEdit.editor.nativeLegacy=true;S.referenceLegacyProjectEdit=previous;referenceCutView.nodeId=null;referenceCutPaint();save();return;}if(action==='native-save'||action==='export'){studioCutSubmit(owner,action==='export');return;}if(action==='undo'||action==='redo'){studioCutRunOriginal(action,owner);owner.editor.nativeDirty=true;save();return;}studioCutRunOriginal(action,owner);};
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!=='crewon-studio-v1')return;const value=event.data;
 if(value.type==='cut-saved'&&studioCutRequest){const request=studioCutRequest;studioCutRequest=null;studioNativeConfig.production=value.production;const editor=request.owner.editor;editor.nativeRevision=value.production.revision;editor.nativeTimeline=JSON.stringify(value.production.timeline);editor.nativeProject=studioNativeConfig.project.id;try{editor.nativeDirty=JSON.stringify(studioCutSerialize(editor,value.production))!==request.fingerprint;}catch(_error){editor.nativeDirty=true;}save();if(referenceCutView)referenceCutPaint();toast(value.exportId?'成片已导出，可在制作历史中播放':'剪辑已保存');}
 if(value.type==='cut-failed'&&studioCutRequest){studioCutRequest=null;if(referenceCutView)referenceCutPaint();toast(value.message);}
});
const studioCutStyle=document.createElement('style');studioCutStyle.textContent='.native-cut-player{width:100%;height:100%;object-fit:contain}.native-cut-thumbnail{width:100%;height:100%;object-fit:cover;pointer-events:none}.native-cut-thumb{position:relative;overflow:hidden}.native-cut-save{background:var(--panel)!important;color:var(--text)!important;border:1px solid var(--line)!important}.ref-cut-header button:disabled{opacity:.5}.ref-cut-empty-preview{height:100%;display:grid;place-items:center;color:var(--muted);font-size:12px}';document.head.append(studioCutStyle);
