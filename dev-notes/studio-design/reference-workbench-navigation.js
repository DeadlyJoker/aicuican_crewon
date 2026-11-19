/* Workbench edits stay open until saved or cancelled before browser navigation. */
'use strict';
let referenceWorkbenchNavigation=null;
function referenceWorkbenchPendingEdits(){
 if(!document.querySelector('.ref-workbench'))return null;
 if(referenceWorkbenchAssetEditor&&referenceAssetEditorDirty())return 'asset';
 if(referenceStoryboardEdit)return 'storyboard';
 return null;
}
function referenceCloseNavigatingWorkbench(){
 referenceRememberWorkbenchScroll();
 if(referenceAssetPreview)referenceCloseAssetPreview();
 referenceCloseVoicePicker();referenceCloseWorkbenchAsset();closeDialog();
}
function referenceFinishWorkbenchNavigation(){
 const intent=referenceWorkbenchNavigation;
 if(!intent||referenceWorkbenchAssetEditor||referenceStoryboardEdit)return;
 referenceWorkbenchNavigation=null;
 referenceCloseNavigatingWorkbench();
 window.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:intent.oldURL,newURL:location.href}));
}
function referenceGuardWorkbenchNavigation(event){
 const hash=new URL(event.newURL).hash;
 if(hash==='#canvas'){
  const error=document.getElementById('ref-wb-asset-error');
  if(error&&error.textContent===referenceWorkbenchNavigation?.hint)error.textContent='';
  referenceWorkbenchNavigation=null;return;
 }
 if(!['','#projects','#assets'].includes(hash)||!document.querySelector('.ref-workbench'))return;
 const pending=referenceWorkbenchPendingEdits();
 if(pending){
  event.stopImmediatePropagation();
  const hint='保存或取消当前修改后，将离开工作台';
  referenceWorkbenchNavigation={oldURL:event.oldURL,newURL:event.newURL,hint};
  if(pending==='asset'){
   const error=document.getElementById('ref-wb-asset-error');if(error)error.textContent=hint;
  }
  toast(hint);return;
 }
 referenceWorkbenchNavigation=null;referenceCloseNavigatingWorkbench();
}
const referenceNavigationCloseAsset=referenceCloseWorkbenchAsset;
referenceCloseWorkbenchAsset=function(){referenceNavigationCloseAsset();queueMicrotask(referenceFinishWorkbenchNavigation);};
const referenceNavigationAction=handleAction;
handleAction=function(action){
 referenceNavigationAction(action);
 if(action==='ref-sb-save'||action==='ref-sb-cancel')queueMicrotask(referenceFinishWorkbenchNavigation);
};
// Capture precedes the shell's route rendering; the browser's history stays intact.
window.addEventListener('hashchange',referenceGuardWorkbenchNavigation,true);
window.addEventListener('beforeunload',event=>{
 if(!referenceWorkbenchPendingEdits())return;
 event.preventDefault();event.returnValue='';
});
