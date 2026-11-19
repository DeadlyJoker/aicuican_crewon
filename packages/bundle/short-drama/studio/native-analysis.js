/* Native media analysis stays attached to the selected archived source. */
'use strict';
const studioAnalysisResults=new Map(),studioAnalysisPending=new Map(),studioAnalysisLoaded=new Set(),studioAnalysisErrors=new Map();
function studioAnalysisCandidate(mediaId){const owner=referenceCutOwner(),clip=owner&&referenceCutSelection(owner),record=[...(studioAnalysisResults.get(mediaId)||[])].reverse().find(row=>row.state==='ready'&&row.result?.transcript.state==='complete');if(!clip||!record||!studioNativeConfig.editCopy||!owner.editor.nativeTracks)return null;const key=record.id+':'+clip.id;return {owner,clip,record,key,segments:owner.editor.nativeTranscriptDrafts?.[key]||record.result.transcript.segments.map(row=>({...row}))};}
function studioAnalysisCandidateHtml(mediaId){const candidate=studioAnalysisCandidate(mediaId);if(!candidate)return '';const copy=studioNativeConfig.editCopy;return `<div class="native-subtitle-editor" data-subtitle-media="${esc(mediaId)}"><header>${esc(copy.transcriptCandidates)}</header><p class="native-subtitle-hint">${esc(copy.subtitleHint)}</p><ol>${candidate.segments.map((segment,index)=>`<li><div class="native-subtitle-time"><label>${esc(copy.start)}<input type="number" min="0" step="0.01" data-subtitle-index="${index}" data-subtitle-field="startSeconds" value="${segment.startSeconds}" aria-label="${esc(copy.start)} ${index+1}"></label><label>${esc(copy.end)}<input type="number" min="0" step="0.01" data-subtitle-index="${index}" data-subtitle-field="endSeconds" value="${segment.endSeconds}" aria-label="${esc(copy.end)} ${index+1}"></label><button data-subtitle-remove="${index}" aria-label="${esc(copy.removeSegment)}" title="${esc(copy.removeSegment)}">×</button></div><textarea rows="2" maxlength="2000" data-subtitle-index="${index}" data-subtitle-field="text" aria-label="${esc(copy.subtitleContent)} ${index+1}">${esc(segment.text)}</textarea></li>`).join('')}</ol><div class="native-subtitle-footer"><button data-subtitle-add>${esc(copy.addSegment)}</button><button class="native-subtitle-confirm" data-subtitle-confirm ${candidate.segments.length?'':'disabled'}>${esc(copy.confirmSubtitles)}</button></div></div>`;}
function studioAnalysisSetDraft(candidate,segments){candidate.owner.editor.nativeTranscriptDrafts={...candidate.owner.editor.nativeTranscriptDrafts,[candidate.key]:segments};save();}
function studioAnalysisTime(seconds){return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toFixed(2).padStart(5,'0')}`;}
function studioAnalysisCopy(){return studioNativeConfig.analysisCopy;}
function studioAnalysisBody(mediaId){
 const copy=studioAnalysisCopy(),records=studioAnalysisResults.get(mediaId)||[],latest=records.at(-1);
 if(studioAnalysisPending.has(mediaId))return '<div class="native-analysis-wait" role="status"><span></span></div>';
 if(studioAnalysisErrors.has(mediaId))return `<p role="alert">${esc(studioAnalysisErrors.get(mediaId))}</p>`;
 if(!latest)return '';
 if(latest.state==='running')return '<div class="native-analysis-wait" role="status"><span></span></div>';
 if(latest.state!=='ready')return `<p role="status">${esc(latest.state==='interrupted'?copy.interrupted:copy.failed)}</p>`;
 const result=latest.result;if(!result)return '';
 let html=`<dl><div><dt>${esc(copy.duration)}</dt><dd>${studioAnalysisTime(result.durationSeconds)}</dd></div><div><dt>${esc(copy.video)}</dt><dd>${result.videoTracks.length}</dd></div><div><dt>${esc(copy.audio)}</dt><dd>${result.audioTracks.length}</dd></div></dl>`;
 if(latest.mode==='scenes')html+=`<ol class="native-analysis-segments">${result.scenes.map(scene=>`<li><time>${studioAnalysisTime(scene.startSeconds)}–${studioAnalysisTime(scene.endSeconds)}</time></li>`).join('')}</ol>`;
 if(result.transcript.state==='unavailable')html+=`<p>${esc(result.transcript.reason==='no-audio'?copy.noAudio:copy.missing)}</p>`;
 if(result.transcript.state==='complete'&&!studioAnalysisCandidate(mediaId))html+=result.transcript.segments.length?`<ol class="native-analysis-segments">${result.transcript.segments.map(segment=>`<li><time>${studioAnalysisTime(segment.startSeconds)}–${studioAnalysisTime(segment.endSeconds)}</time><p>${esc(segment.text)}</p></li>`).join('')}</ol>`:`<p>${esc(copy.empty)}</p>`;
 return html+studioAnalysisCandidateHtml(mediaId);
}
const studioAnalysisProperties=referenceCutPropertyHtml;
referenceCutPropertyHtml=function(owner){
 const html=studioAnalysisProperties(owner),clip=referenceCutSelection(owner),media=studioCutClipMedia(clip),copy=studioAnalysisCopy();
 if(!copy||media?.kind!=='video')return html;
 return html+`<section class="native-media-analysis" data-analysis-media="${esc(media.id)}"><h3>${esc(copy.title)}</h3><div class="native-analysis-actions">${['inspect','scenes','transcript'].map(mode=>`<button type="button" data-media-analysis="${mode}" data-media-id="${esc(media.id)}" ${studioAnalysisPending.has(media.id)?'disabled':''}>${esc(copy[mode])}</button>`).join('')}</div><div class="native-analysis-result">${studioAnalysisBody(media.id)}</div></section>`;
};
function studioAnalysisRefresh(mediaId){
 const section=document.querySelector('.native-media-analysis');if(section?.dataset.analysisMedia!==mediaId)return;
 const result=section.querySelector('.native-analysis-result'),scroll=result.querySelector('.native-analysis-segments')?.scrollTop||0;
 result.innerHTML=studioAnalysisBody(mediaId);
 const segments=result.querySelector('.native-analysis-segments');if(segments)segments.scrollTop=scroll;
 section.querySelectorAll('[data-media-analysis]').forEach(button=>{button.disabled=studioAnalysisPending.has(mediaId);});
}
function studioAnalysisMerge(mediaId,incoming){
 const combined=new Map((studioAnalysisResults.get(mediaId)||[]).map(record=>[record.id,record]));
 for(const record of incoming){const previous=combined.get(record.id);if(!previous||previous.state==='running')combined.set(record.id,record);}
 studioAnalysisResults.set(mediaId,[...combined.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)));
}
function studioAnalysisAwait(mediaId,mode,requestId){
 studioAnalysisPending.set(mediaId,requestId);studioAnalysisErrors.delete(mediaId);
 studioNativePost('analyze-media',{mediaId,mode,requestId});
 studioAnalysisRefresh(mediaId);
}
const studioAnalysisPaint=referenceCutPaint;
referenceCutPaint=function(){
 studioAnalysisPaint();
 const owner=referenceCutOwner();if(!owner)return;
 const media=studioCutClipMedia(referenceCutSelection(owner));
 if(!studioAnalysisCopy()||media?.kind!=='video'||studioAnalysisLoaded.has(media.id))return;
 studioAnalysisLoaded.add(media.id);studioNativePost('read-media-analysis',{mediaId:media.id});
};
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-media-analysis]');if(!button)return;
 const mediaId=button.dataset.mediaId;if(studioAnalysisPending.has(mediaId))return;
 event.preventDefault();studioAnalysisAwait(mediaId,button.dataset.mediaAnalysis,studioRandomUUID());
});
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!=='crewon-studio-v1')return;
 const value=event.data;
 if(value.type==='media-analysis-history'){
  studioAnalysisMerge(value.mediaId,value.records||[]);
  const latest=studioAnalysisResults.get(value.mediaId).at(-1);
  if(latest?.state==='running'&&!studioAnalysisPending.has(value.mediaId))studioAnalysisAwait(value.mediaId,latest.mode,latest.id);
 }
 else if(value.type==='media-analysis-result'){
  if(studioAnalysisPending.get(value.mediaId)===value.record.id){studioAnalysisPending.delete(value.mediaId);studioAnalysisErrors.delete(value.mediaId);}
  studioAnalysisMerge(value.mediaId,[value.record]);
 }else if(value.type==='media-analysis-failed'){
  if(studioAnalysisPending.get(value.mediaId)!==value.requestId)return;
  studioAnalysisPending.delete(value.mediaId);studioAnalysisErrors.set(value.mediaId,value.message);
 }else if(value.type==='media-analysis-history-failed'){
  if(!studioAnalysisPending.has(value.mediaId)&&!studioAnalysisResults.get(value.mediaId)?.length)studioAnalysisErrors.set(value.mediaId,value.message);
 }else return;
 studioAnalysisRefresh(value.mediaId);
});

document.addEventListener('input',event=>{const field=event.target.dataset?.subtitleField;if(!field)return;const mediaId=event.target.closest('.native-subtitle-editor')?.dataset.subtitleMedia,candidate=mediaId&&studioAnalysisCandidate(mediaId);if(!candidate)return;const index=Number(event.target.dataset.subtitleIndex),segments=candidate.segments.map(row=>({...row})),segment=segments[index];if(!segment)return;const value=field==='text'?event.target.value:Number(event.target.value);segment[field]=value;const valid=field==='text'?value.trim().length>0&&studioEditPlainSubtitle(value):Number.isFinite(value)&&value>=0;event.target.setAttribute('aria-invalid',String(!valid));studioAnalysisSetDraft(candidate,segments);});
document.addEventListener('click',event=>{const control=event.target.closest?.('[data-subtitle-confirm],[data-subtitle-add],[data-subtitle-remove]');if(!control)return;const mediaId=control.closest('.native-subtitle-editor')?.dataset.subtitleMedia,candidate=mediaId&&studioAnalysisCandidate(mediaId);if(!candidate)return;event.preventDefault();const copy=studioNativeConfig.editCopy,segments=candidate.segments.map(row=>({...row}));if(control.hasAttribute('data-subtitle-remove')){segments.splice(Number(control.dataset.subtitleRemove),1);studioAnalysisSetDraft(candidate,segments);studioAnalysisRefresh(mediaId);return;}if(control.hasAttribute('data-subtitle-add')){const start=segments.at(-1)?.endSeconds||candidate.clip.sourceIn;segments.push({startSeconds:start,endSeconds:Math.min(candidate.clip.sourceIn+candidate.clip.duration,start+1),text:''});studioAnalysisSetDraft(candidate,segments);studioAnalysisRefresh(mediaId);return;}if(segments.some(row=>!studioEditPlainSubtitle(row.text))){toast(copy.plainSubtitle);return;}if(segments.some(row=>!Number.isFinite(row.startSeconds)||!Number.isFinite(row.endSeconds)||row.startSeconds<0||row.endSeconds<=row.startSeconds||!row.text.trim())){toast(copy.invalidSubtitle);return;}try{if(studioEditApplyTranscript(candidate.clip.id,candidate.record.id,segments))toast(copy.subtitleAdded);}catch(error){toast(error.message);}});
