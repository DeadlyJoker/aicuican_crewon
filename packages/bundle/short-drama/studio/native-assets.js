/* Project asset cards use production identities, revisions and Agent execution. */
'use strict';
let studioNativeAssetRequest=null;
function studioNativeAssetCopy(){return studioNativeConfig.assetCopy;}
function studioNativeAssetRecord(nodeId){return studioNativeConfig.production.assets.find(asset=>'asset:'+asset.id===nodeId);}
function studioNativeAssetWaiting(node){
 return studioNativePendingRequests.has(node.id)||studioNativeConfig.production.jobs.some(job=>job.targetType==='asset'&&'asset:'+job.targetId===node.id&&job.targetVersion===node.nativeRevision&&['submitting','running'].includes(job.state));
}
const studioNativeOriginalAssetShotLabels=referenceAssetShotLabels;
referenceAssetShotLabels=function(state,source,assetId,scope='all'){
 const asset=studioNativeAssetRecord(assetId);if(!asset)return studioNativeOriginalAssetShotLabels(state,source,assetId,scope);
 return studioNativeConfig.production.shots.filter(shot=>shot.assetIds.includes(asset.id)).map(shot=>{
  const index=state.clips.indexOf('shot:'+shot.id);return index>=0?String(index+1).padStart(2,'0'):shot.title;
 });
};
const studioNativeOriginalImageModel=referenceAssetImageModelPicker;
referenceAssetImageModelPicker=function(draft,scope='assets',owner=null){
 if(scope!=='assets')return studioNativeOriginalImageModel(draft,scope,owner);
 const copy=studioNativeAssetCopy(),label=studioNativeConfig.production.settings?.image?.model||copy.configureImage;
 return `<button class="button ghost native-asset-model" data-action="settings" aria-label="${esc(copy.services)}" title="${esc(label)}">${I('image')}<span>${esc(label)}</span>${I('down')}</button>`;
};
const studioNativeOriginalImageParameters=referenceImageParametersHtml;
referenceImageParametersHtml=function(draft,scope='node',owner=null){return scope==='assets'?'':studioNativeOriginalImageParameters(draft,scope,owner);};
const studioNativeOriginalAssetCard=referenceWorkbenchAssetCard;
referenceWorkbenchAssetCard=function(script,node,workbench){
 let html=studioNativeOriginalAssetCard(script,node,workbench);const copy=studioNativeAssetCopy();
 const waiting=studioNativeAssetWaiting(node),candidate=node.candidates?.filter(item=>item.nativeMedia?.kind==='image').find(item=>item.id===node.adoptedCandidateId)||node.candidates?.filter(item=>item.nativeMedia?.kind==='image').at(-1);
 html=html.replace('<button disabled title="当前为样式 Demo，尚未连接生成服务">开始生成</button>',`<button data-action="native-generate-asset:${esc(node.id)}" ${waiting?'disabled':''}>${esc(copy.generate)}</button>`)
  .replace(/(<button) data-action="ref-wb-asset-upload:[^"]*" title="上传本地图片"(>上传<\/button>)/,`$1 disabled title="${esc(copy.importUnavailable)}"$2`)
  .replace(/<button class="ref-wb-card-voice"[\s\S]*?<\/button>/,`<button class="ref-wb-card-voice" data-action="settings" title="${esc(copy.voiceUsesProject)}">${I('mic')}<span>${esc(copy.voiceSettings)}</span></button>`);
 const cover=candidate?`<button class="ref-wb-asset-cover native-asset-preview still frame${candidate.frame}" data-action="native-review:${esc(node.id)}:${esc(candidate.id)}" aria-label="${esc((candidate.id===node.adoptedCandidateId?copy.reviewAdopted:copy.reviewCandidate).replace('{name}',node.title))}"></button>`:null;
 if(waiting)html=html.replace(/<div class="ref-wb-asset-cover[\s\S]*?<\/div>/,`<div class="ref-wb-asset-cover native-generation-state ${candidate?'still frame'+candidate.frame:''}" role="status" aria-label="${esc(copy.generating.replace('{name}',node.title))}" aria-busy="true"><div class="native-generation-overlay"><span class="native-generation-spinner" aria-hidden="true"></span></div></div>`);
 else if(cover)html=html.replace(/<div class="ref-wb-asset-cover[\s\S]*?<\/div>/,cover);
 return html;
};
const studioNativeOriginalAssets=referenceWorkbenchAssets;
referenceWorkbenchAssets=function(script){
 const copy=studioNativeAssetCopy(),eligible=studioNativeConfig.production.assets.some(asset=>asset.kind!=='voice'&&!asset.adoptedMediaId);
 return studioNativeOriginalAssets(script).replace('<button disabled>重新解析资产</button>',`<button data-action="native-creative-run:assets">${esc(copy.reparse)}</button>`)
  .replace('<button class="ref-wb-generate-disabled" disabled>生成主角色、场景和道具图</button>',`<button class="button" data-action="native-generate-project-assets" ${eligible?'':'disabled'}>${esc(copy.generatePending)}</button>`);
};
const studioNativeOriginalOpenAsset=referenceOpenWorkbenchAsset;
referenceOpenWorkbenchAsset=function(...args){
 studioNativeOriginalOpenAsset(...args);
 const editor=referenceWorkbenchAssetEditor,root=document.querySelector('.ref-wb-asset-dialog'),copy=studioNativeAssetCopy();if(!editor||!root)return;
 root.querySelector('#ref-wb-asset-description')?.setAttribute('maxlength','8000');
 for(const element of root.querySelectorAll('[data-wb-upload-file],[data-wb-library-open]')){element.disabled=true;element.title=copy.importUnavailable;}
 for(const element of root.querySelectorAll('[data-wb-variant-model],[data-wb-prepare-variant],[data-wb-add-variant]')){element.disabled=true;element.title=copy.variantsViaAgent;}
 for(const element of root.querySelectorAll('[data-wb-voice-open]')){element.disabled=true;element.title=copy.voiceUsesProject;}
};
function studioNativeSubmitAsset(){
 if(studioNativeAssetRequest?.projectId!==studioNativeConfig.project.id)studioNativeAssetRequest=null;
 const editor=referenceWorkbenchAssetEditor;if(!editor||editor.project!==S.project||editor.saving||studioNativeAssetRequest)return;
 const name=document.getElementById('ref-wb-asset-name').value.trim(),prompt=document.getElementById('ref-wb-asset-description').value.trim(),error=document.getElementById('ref-wb-asset-error'),copy=studioNativeAssetCopy();
 if(!name||!prompt){error.textContent=copy.requiredFields;return;}
 if(prompt.length>8000){error.textContent=copy.promptLimit;return;}
 if(editor.reuse||editor.upload||editor.voiceUpload){error.textContent=copy.referenceUnsupported;return;}
 const native=studioNativeAssetRecord(editor.id),node=editor.id?nodeById(editor.id):null,kind=native?.kind||(node?.assetCategory==='prop'?'prop':node?.kind)||editor.category;
 const requestId=studioRandomUUID();studioNativeAssetRequest={requestId,kind:'save',projectId:studioNativeConfig.project.id,editor,localNodeId:node&&!native?node.id:null,promptDraft:S.nodeDrafts?.[editor.id]?.prompt};editor.saving=true;
 for(const id of ['ref-wb-asset-name','ref-wb-asset-description'])document.getElementById(id).readOnly=true;
 const button=document.querySelector('[data-wb-asset-save]');if(button)button.disabled=true;
 studioNativePost('save-asset',{requestId,revision:studioNativeConfig.production.revision,asset:{id:native?.id||null,kind,name,prompt}});
}
function studioNativeRemoveAsset(nodeId){
 if(studioNativeAssetRequest?.projectId!==studioNativeConfig.project.id)studioNativeAssetRequest=null;
 const asset=studioNativeAssetRecord(nodeId);if(!asset||studioNativeAssetRequest)return;
 if(studioNativeConfig.production.shots.some(shot=>shot.assetIds.includes(asset.id))){toast(studioNativeAssetCopy().referenced);return;}
 const requestId=studioRandomUUID();studioNativeAssetRequest={requestId,kind:'remove',projectId:studioNativeConfig.project.id};
 studioNativePost('remove-asset',{requestId,revision:studioNativeConfig.production.revision,assetId:asset.id});
}
const studioNativeOriginalNodeCommand=referenceRunNodeCommand;
referenceRunNodeCommand=function(action,id=S.selected,origin='canvas'){
 if(action==='delete'&&studioNativeAssetRecord(id)){studioNativeRemoveAsset(id);return;}
 return studioNativeOriginalNodeCommand(action,id,origin);
};
const studioNativeOriginalBatchDelete=referenceDeleteCanvasBatch;
referenceDeleteCanvasBatch=function(state,ids){
 if(ids.some(id=>studioNativeAssetRecord(id)))return {ok:false,error:studioNativeAssetCopy().batchDelete};
 return studioNativeOriginalBatchDelete(state,ids);
};
const studioNativeAssetAction=handleAction;
handleAction=function(action){
 const [key,...parts]=String(action).split(':'),id=parts.join(':');
 if(key==='native-generate-asset'){
  const node=nodeById(id);if(!node||studioNativeAssetWaiting(node))return;
  const copy=studioNativeAssetCopy();studioNativeRun(copy.generateRequest,node,copy.generateFor.replace('{name}',node.title));
  referenceRememberWorkbenchScroll();referenceDrawWorkbench({focus:false});return;
 }
 if(key==='native-generate-project-assets'){
  const assets=studioNativeConfig.production.assets.filter(asset=>asset.kind!=='voice'&&!asset.adoptedMediaId);if(!assets.length)return;
  for(const asset of assets){const previous=studioNativeConfig.production.jobs.filter(job=>job.targetType==='asset'&&job.targetId===asset.id).at(-1);studioNativePendingRequests.set('asset:'+asset.id,previous?.id||'');}
  const copy=studioNativeAssetCopy();studioNativeRun(copy.generateBatchRequest.replace('{assets}',JSON.stringify(assets.map(asset=>({id:asset.id,name:asset.name,version:asset.version})))),studioScriptNode(),copy.generatePending);referenceRememberWorkbenchScroll();referenceDrawWorkbench({focus:false});return;
 }
 if(key==='ref-wb-asset-delete'){studioNativeRemoveAsset(id);return;}
 return studioNativeAssetAction(action);
};
window.addEventListener('click',event=>{if(!event.target.closest('[data-wb-asset-save]'))return;event.preventDefault();event.stopImmediatePropagation();studioNativeSubmitAsset();},true);
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!=='crewon-studio-v1'||!studioNativeAssetRequest||event.data.requestId!==studioNativeAssetRequest.requestId||studioNativeConfig.project?.id!==studioNativeAssetRequest.projectId)return;
 const pending=studioNativeAssetRequest,value=event.data;
 if(value.type==='asset-save-failed'){
  studioNativeAssetRequest=null;if(pending.editor)pending.editor.saving=false;
  if(pending.editor&&referenceWorkbenchAssetEditor===pending.editor){for(const id of ['ref-wb-asset-name','ref-wb-asset-description'])document.getElementById(id).readOnly=false;const button=document.querySelector('[data-wb-asset-save]');if(button)button.disabled=false;const error=document.getElementById('ref-wb-asset-error');if(error)error.textContent=value.message;}
  else toast(value.message);return;
 }
 if(!['asset-saved','asset-removed'].includes(value.type))return;
 studioNativeAssetRequest=null;
 const draft=pending.editor&&S.nodeDrafts?.[pending.editor.id];
 if(draft&&Object.hasOwn(draft,'prompt')&&draft.prompt===pending.promptDraft){delete draft.prompt;if(!Object.keys(draft).length)delete S.nodeDrafts[pending.editor.id];}
 if(pending.localNodeId){
  const previous=nodeById(pending.localNodeId),next=nodeById('asset:'+value.assetId);
  if(previous&&next){Object.assign(next,{x:previous.x,y:previous.y,w:previous.w,h:previous.h});S.nodes=S.nodes.filter(node=>node.id!==previous.id);S.edges=S.edges.map(([from,to])=>[from===previous.id?next.id:from,to===previous.id?next.id:to]);}
 }
 if(pending.editor&&referenceWorkbenchAssetEditor===pending.editor)referenceCloseWorkbenchAsset();
 if(!referenceWorkbenchAssetEditor&&typeof referenceWorkbench!=='undefined'&&referenceWorkbench.project===S.project&&document.querySelector('.ref-workbench')){referenceRememberWorkbenchScroll();referenceDrawWorkbench({focus:false});}
 render();persist();toast(value.type==='asset-removed'?studioNativeAssetCopy().removed:studioNativeAssetCopy().saved);
});
const studioNativeAssetStyles=document.createElement('style');studioNativeAssetStyles.textContent='.native-asset-model{display:inline-flex;align-items:center;gap:7px;min-width:0;max-width:300px}.native-asset-model span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ref-wb-asset-card .native-asset-preview{cursor:pointer}.ref-wb-asset-controls button:disabled{opacity:.45;cursor:default}';document.head.append(studioNativeAssetStyles);
