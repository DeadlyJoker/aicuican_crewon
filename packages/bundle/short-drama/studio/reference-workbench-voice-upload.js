/* Reference recordings stay local; accepting a file does not clone or synthesize a voice. */
'use strict';
function referenceWorkbenchVoiceField(asset){
 return `<div class="field"><label for="ref-wb-voice-trigger">音色</label><div class="ref-wb-voice-row"><button id="ref-wb-voice-trigger" type="button" class="ref-wb-voice-trigger" data-wb-voice-open aria-label="音色" aria-haspopup="listbox" aria-expanded="false">${referenceVoiceTriggerContent(asset.voicePreset?.name)}</button><button type="button" data-wb-voice-upload-open>${I('upload')}上传音频</button><input type="file" hidden data-wb-voice-upload accept="audio/mpeg,audio/wav,audio/ogg,audio/webm"></div><div class="ref-wb-voice-recording" data-wb-voice-recording></div></div>`;
}
function referenceDrawVoiceRecording(){
 const editor=referenceWorkbenchAssetEditor,root=document.querySelector('[data-wb-voice-recording]');if(!editor||!root)return;
 const recording=editor.voicePreset?.referenceAudio,url=editor.voiceUpload?.previewUrl||referenceUploadUrls.get(recording?.frame);
 root.innerHTML=recording?`<audio controls preload="metadata" ${url?`src="${esc(url)}"`:''} aria-label="试听参考音频"></audio><small>${esc(editor.voicePreset.name)} · ${Math.round(recording.duration)}秒 · 仅保存本机参考，未克隆音色</small>`:'';
 if(recording&&!url)void referenceRestoreUploadedImages().then(()=>{if(editor!==referenceWorkbenchAssetEditor)return;const restored=referenceUploadUrls.get(recording.frame);if(restored)root.querySelector('audio').src=restored;});
}
function referenceSetVoiceReading(editor,reading){
 editor.voiceReading=reading;if(editor===referenceWorkbenchAssetEditor){const save=document.querySelector('[data-wb-asset-save]');if(save)save.disabled=reading||!!editor.saving;}
}
async function referenceStageVoiceRecording(file){
 const editor=referenceWorkbenchAssetEditor;if(!editor)return;
 const error=document.getElementById('ref-wb-asset-error');error.textContent='';
 if(referenceCollectionFileType(file)!=='音频'){error.textContent='请选择 MP3、WAV、OGG 或 WebM 音频';return;}
 if(file.size>20*1024*1024){error.textContent='参考音频不能超过 20 MB';return;}
 const attempt=(editor.voiceUploadAttempt||0)+1;editor.voiceUploadAttempt=attempt;
 const previewUrl=URL.createObjectURL(file);let metadata;referenceSetVoiceReading(editor,true);
 try{metadata=await referenceCollectionProbe(file,previewUrl,'音频');}catch(failure){URL.revokeObjectURL(previewUrl);if(editor===referenceWorkbenchAssetEditor&&editor.voiceUploadAttempt===attempt)error.textContent=failure.message;return;}finally{if(editor.voiceUploadAttempt===attempt)referenceSetVoiceReading(editor,false);}
 if(editor!==referenceWorkbenchAssetEditor||editor.voiceUploadAttempt!==attempt){URL.revokeObjectURL(previewUrl);return;}
 if(editor.voiceUpload)URL.revokeObjectURL(editor.voiceUpload.previewUrl);
 const frame=-Date.now();editor.voiceUpload={frame,blob:file,name:file.name,previewUrl};
 editor.voicePreset={id:'local-recording-'+Math.abs(frame),name:file.name,referenceAudio:{frame,duration:metadata.duration,type:'音频'}};
 document.querySelector('[data-wb-voice-open]').innerHTML=referenceVoiceTriggerContent(file.name);referenceDrawVoiceRecording();
}
async function referencePrepareVoiceRecording(editor){
 if(editor.voiceUpload){const {frame,blob,name}=editor.voiceUpload;await referenceStoreUpload({frame,blob,name});}
}
const referenceVoiceUploadOpen=referenceOpenWorkbenchAsset;
referenceOpenWorkbenchAsset=function(...args){referenceVoiceUploadOpen(...args);referenceDrawVoiceRecording();};
const referenceVoiceUploadClose=referenceCloseWorkbenchAsset;
referenceCloseWorkbenchAsset=function(){const upload=referenceWorkbenchAssetEditor?.voiceUpload;if(upload)URL.revokeObjectURL(upload.previewUrl);referenceVoiceUploadClose();};
const referenceVoiceUploadSelect=referenceSelectVoice;
referenceSelectVoice=function(name){
 if(!referenceVoiceNodeId&&referenceWorkbenchAssetEditor){referenceWorkbenchAssetEditor.voiceUploadAttempt=(referenceWorkbenchAssetEditor.voiceUploadAttempt||0)+1;referenceSetVoiceReading(referenceWorkbenchAssetEditor,false);}
 if(!referenceVoiceNodeId&&referenceWorkbenchAssetEditor?.voiceUpload){URL.revokeObjectURL(referenceWorkbenchAssetEditor.voiceUpload.previewUrl);delete referenceWorkbenchAssetEditor.voiceUpload;}
 referenceVoiceUploadSelect(name);referenceDrawVoiceRecording();
};
document.addEventListener('click',event=>{if(event.target.closest('[data-wb-voice-upload-open]')){event.preventDefault();document.querySelector('[data-wb-voice-upload]')?.click();}});
document.addEventListener('change',event=>{if(event.target.matches('[data-wb-voice-upload]')&&event.target.files[0])void referenceStageVoiceRecording(event.target.files[0]);});
/** Material reuse may replace the voice selection while leaving the role editor open. */
function referenceRefreshReusedVoice(){
 const editor=referenceWorkbenchAssetEditor;if(!editor)return;
 if(editor.voiceUpload&&editor.voicePreset?.referenceAudio?.frame!==editor.voiceUpload.frame){URL.revokeObjectURL(editor.voiceUpload.previewUrl);delete editor.voiceUpload;}
 editor.voiceUploadAttempt=(editor.voiceUploadAttempt||0)+1;referenceSetVoiceReading(editor,false);referenceDrawVoiceRecording();
}
const referenceVoiceLibraryPick=referencePickWorkbenchLibrary;
referencePickWorkbenchLibrary=function(...args){referenceVoiceLibraryPick(...args);referenceRefreshReusedVoice();};
const referenceVoiceLibraryRevert=referenceRevertWorkbenchReuse;
referenceRevertWorkbenchReuse=function(...args){referenceVoiceLibraryRevert(...args);referenceRefreshReusedVoice();};
