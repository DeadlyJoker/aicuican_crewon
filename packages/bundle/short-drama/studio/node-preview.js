/* One media projection for the node manager and project resource list. */
'use strict';
function studioNodePreviewCopy(){return {empty:'尚未生成',candidate:'待审阅',adopted:'已采用',generating:'正在生成',failed:'生成失败',unknown:'等待核对',unavailable:'预览加载失败',script:'剧本',text:'文本'};}
/** Resolve a preview from saved content without generating or adopting media. */
function studioNodePreview(node){
 if(['story','text','note'].includes(node.kind))return {kind:'text',text:[node.text,node.scriptDocument?.legacyText,node.prompt,node.description].find(value=>typeof value==='string'&&value.trim())||'',state:'text'};
 const candidates=node.candidates||[],adopted=candidates.find(item=>item.id===node.adoptedCandidateId),candidate=adopted||candidates.at(-1),state=adopted?'adopted':candidate?'candidate':'empty';
 const media=candidate?.nativeMedia,local=candidate?.localMedia;
 if(media){
  const kind=media.kind==='voice'?'audio':media.kind;
  const poster=candidates.find(item=>item.nativeMedia?.kind==='image'&&item.frame===node.frame)?.nativeMedia.url;
  return {kind,url:media.url,poster,state,candidateId:candidate.id};
 }
 if(local){const url=typeof referenceUploadUrls!=='undefined'?referenceUploadUrls.get(local.frame):undefined;return {kind:local.type==='视频'?'video':local.type==='音频'?'audio':'image',url,state,candidateId:candidate.id};}
 if(!node.referenceOnly&&Number.isFinite(candidate?.frame??node.frame)&&! /^(asset|shot):/.test(node.id))return {kind:'image',frame:candidate?.frame??node.frame,state};
 return {kind:'empty',state:'empty'};
}
/** Render the same preview in compact rows and expanded resource cards. */
function studioNodePreviewHtml(node){
 const preview=studioNodePreview(node),copy=studioNodePreviewCopy(),state=preview.state;
 if(preview.kind==='text')return `<span class="studio-node-preview is-text" data-node-preview data-preview-state="text"><span class="studio-node-document"><span class="studio-node-document-title">${I(node.kind==='story'?'script':'file')}<b>${esc(node.kind==='story'?copy.script:copy.text)}</b></span><span class="studio-node-excerpt">${esc(preview.text.slice(0,700))}</span></span></span>`;
 const fallback=I(preview.kind==='audio'?'audio-media':preview.kind==='video'?'video-media':'image');
 const label=copy[state]||copy.empty;
 let media='';
 if(preview.kind==='video'&&preview.url)media=`<video class="studio-node-preview-media" src="${esc(preview.url.split('#')[0]+'#t=0.001')}" ${preview.poster?`poster="${esc(preview.poster)}"`:''} muted playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video>`;
 else if(preview.kind==='image'&&preview.url)media=`<img class="studio-node-preview-media" src="${esc(preview.url)}" alt="" loading="lazy">`;
 else if(preview.kind==='image'&&Number.isFinite(preview.frame))media=`<span class="studio-node-preview-media still frame${preview.frame}"></span>`;
 return `<span class="studio-node-preview is-${preview.kind}" data-node-preview data-preview-state="${state}"><span class="studio-node-preview-fallback">${fallback}<small>${esc(label)}</small></span>${media}${state==='generating'?'<span class="native-generation-spinner studio-node-preview-spinner" aria-hidden="true"></span>':''}${media?`<small class="studio-node-preview-badge">${esc(label)}</small>`:''}</span>`;
}
// Failed media stays identifiable and can still be opened from its node.
document.addEventListener('error',event=>{if(!event.target.matches?.('.studio-node-preview-media'))return;const preview=event.target.closest('[data-node-preview]');if(!preview)return;event.target.hidden=true;preview.dataset.previewState='unavailable';const label=preview.querySelector('.studio-node-preview-fallback small');if(label)label.textContent=studioNodePreviewCopy().unavailable;},true);
