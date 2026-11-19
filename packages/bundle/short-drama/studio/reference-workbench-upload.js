/* Imported images live in IndexedDB; project versions retain their stable frame ids. */
'use strict';
let referenceUploadDatabase;
const referenceUploadUrls=new Map();
function referenceImageDatabase(){return studioNativeMediaDatabase();}

function referenceInstallUpload(record){
 const previous=referenceUploadUrls.get(record.frame);if(previous)URL.revokeObjectURL(previous);
 const url=URL.createObjectURL(record.blob);referenceUploadUrls.set(record.frame,url);
 let sheet=document.getElementById('reference-upload-styles');if(!sheet){sheet=document.createElement('style');sheet.id='reference-upload-styles';document.head.append(sheet);}
 sheet.textContent=[...referenceUploadUrls].map(([frame,source])=>`.still.frame${frame}{background-image:url("${source}")}`).join('\n');
 return url;
}
async function referenceRestoreUploadedImages(){
 try{
  const db=await referenceImageDatabase();const records=await new Promise((resolve,reject)=>{const request=db.transaction('images').objectStore('images').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('无法恢复本机图片'));});
  records.forEach(referenceInstallUpload);
 }catch(error){toast(error.message);}
}
async function referenceStoreUpload(record){
 const db=await referenceImageDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('图片保存失败，请检查本机存储空间'));tx.onabort=()=>reject(new Error('图片保存已中断，请重试'));});
 referenceInstallUpload(record);
}
async function referenceStageUpload(file){
 const editor=referenceWorkbenchAssetEditor;if(!editor)return;
 const errorNode=document.getElementById('ref-wb-asset-error');errorNode.textContent='';
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)){errorNode.textContent='请选择 PNG、JPEG 或 WebP 图片';return;}
 if(file.size>20*1024*1024){errorNode.textContent='图片不能超过 20 MB';return;}
 const attempt=(editor.uploadAttempt||0)+1;editor.uploadAttempt=attempt;
 const previewUrl=URL.createObjectURL(file),image=new Image();
 try{image.src=previewUrl;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error('无效图片');}
 catch(error){URL.revokeObjectURL(previewUrl);if(editor===referenceWorkbenchAssetEditor&&editor.uploadAttempt===attempt)errorNode.textContent='图片无法读取，请换一张图片';return;}
 if(editor!==referenceWorkbenchAssetEditor||editor.uploadAttempt!==attempt){URL.revokeObjectURL(previewUrl);return;}
 if(editor.upload?.previewUrl)URL.revokeObjectURL(editor.upload.previewUrl);
 const panel=document.querySelector('.ref-wb-asset-preview');
 editor.uploadBefore??=editor.beforeReuse||{description:document.getElementById('ref-wb-asset-description').value,voicePreset:structuredClone(editor.voicePreset),image:panel.querySelector('.ref-wb-asset-image').outerHTML,caption:panel.querySelector('.ref-wb-asset-preview-caption small').textContent,note:document.querySelector('.ref-wb-asset-note').textContent};
 delete editor.beforeReuse;document.querySelector('[data-wb-reuse-revert]')?.remove();
 editor.upload={frame:-Date.now(),blob:file,name:file.name,previewUrl};
 const preview=document.querySelector('.ref-wb-asset-image');preview.className='ref-wb-asset-image';preview.style.backgroundImage=`url("${previewUrl}")`;preview.innerHTML='';preview.setAttribute('aria-label','待保存：'+file.name);
 document.querySelector('.ref-wb-asset-note').textContent='已选择 '+file.name+'，保存后新增版本，已有图片保留';
 document.querySelector('.ref-wb-asset-preview-caption small').textContent='待保存';
 delete editor.reuse;
}
async function referencePrepareUploadedReuse(editor){
 if(!editor.upload)return editor.reuse;
 const {frame,blob,name}=editor.upload;await referenceStoreUpload({frame,blob,name});
 return {id:studioScriptId('uploaded-output'),sourceId:'local-file',sourceTitle:name,candidate:{id:studioScriptId('local-image'),frame,number:1,importedFile:name,createdAt:new Date().toISOString(),sourceReferences:[]}};
}
const referenceUploadClose=referenceCloseWorkbenchAsset;
referenceCloseWorkbenchAsset=function(){const upload=referenceWorkbenchAssetEditor?.upload;if(upload)URL.revokeObjectURL(upload.previewUrl);referenceUploadClose();};
const referenceUploadDirty=referenceAssetEditorDirty;
referenceAssetEditorDirty=function(){return !!referenceWorkbenchAssetEditor?.upload||referenceUploadDirty();};
const referenceUploadAction=handleAction;
handleAction=function(action){
 if(action.startsWith('ref-wb-asset-upload:')){referenceRememberWorkbenchScroll();referenceOpenWorkbenchAsset(action.slice('ref-wb-asset-upload:'.length));document.querySelector('[data-wb-upload-file]').click();return;}
 referenceUploadAction(action);
};
document.addEventListener('change',event=>{if(event.target.matches('[data-wb-upload-file]')&&event.target.files[0])void referenceStageUpload(event.target.files[0]);});
void referenceRestoreUploadedImages();

/** Delete newly allocated image records that were never committed to a project. */
async function referenceRemoveUncommittedImages(frames){
 const db=await referenceImageDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');for(const frame of frames)tx.objectStore('images').delete(frame);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('临时图片清理失败'));tx.onabort=()=>reject(new Error('临时图片清理已中断'));});
}
