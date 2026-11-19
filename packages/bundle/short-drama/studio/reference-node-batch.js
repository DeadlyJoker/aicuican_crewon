/* Batch commands retain one undo entry and never partially delete a protected selection. */
'use strict';
let referenceBatchDeletePending=null,referenceBatchDownloading=false;
function referenceDeleteCanvasBatch(state,ids){
 const selected=[...new Set(ids)];if(!selected.length)return {ok:false,error:'请先选择内容'};
 if(selected.some(id=>!state.nodes.some(n=>n.id===id)))return {ok:false,error:'选中内容已变化，请重新选择'};
 const before=referenceCaptureNodeGraph(state),working=structuredClone(state);
 for(const id of selected){const result=referenceDeleteCanvasNode(working,id);if(!result.ok)return {ok:false,error:result.error};}
 const entry=referenceNodeGraphPatch(before,referenceCaptureNodeGraph(working)),applied=referenceRestoreNodeGraph(state,entry.before,entry.after);
 return applied.ok?{ok:true,entry,count:selected.length}:applied;
}
referenceTagFooter=function(){
 if(!canvasNavigatorState().batch)return '';
 const summary=referenceBatchSelectionSummary(referenceTagSelection(),referenceVisibleBatchIds()),count=summary.total;
 return `<footer class="canvas-tag-batch"><label class="canvas-tag-select-all"><input type="checkbox" data-tag-all aria-label="全选当前结果" aria-checked="${summary.mixed?'mixed':summary.checked}" ${summary.checked?'checked':''} ${summary.visible?'':'disabled'}>全选</label><span title="${summary.hidden?'当前筛选内 '+summary.selectedVisible+' 项，筛选外 '+summary.hidden+' 项':'已选择当前结果中的 '+summary.selectedVisible+' 项'}">已选择 ${count} 项${summary.hidden?`<small>筛选外 ${summary.hidden} 项</small>`:''}</span><button data-tag-apply ${count?'':'disabled'} aria-label="批量打标签" title="批量打标签">${I('sliders')}</button><button data-node-batch-download ${count&&!referenceBatchDownloading?'':'disabled'} aria-label="批量下载" title="批量下载">${I(referenceBatchDownloading?'history':'download')}</button><button data-node-batch-delete ${count?'':'disabled'} aria-label="批量删除" title="批量删除">${I('trash')}</button></footer>`;
};
function referenceRefreshBatchFooter(){const footer=document.querySelector('.canvas-tag-batch');if(footer)footer.outerHTML=referenceTagFooter();}
function referenceOpenBatchDelete(){
 const ids=[...referenceTagSelection()],preview=referenceDeleteCanvasBatch(structuredClone(S),ids);if(!preview.ok){toast(preview.error);return;}
 referenceBatchDeletePending={ids,project:S.project};
 const summary=referenceBatchSelectionSummary(ids,referenceVisibleBatchIds());
 showDialog('批量删除',`<p>删除选中的 ${ids.length} 项画布内容？</p>${summary.hidden?`<p class="canvas-batch-scope-notice">其中 ${summary.hidden} 项在当前筛选之外</p>`:''}<p>可以撤销恢复。收集箱原素材和资产库保持不变。</p>`,btn('取消','close-modal','outline')+btn('删除','node-batch-confirm-delete','primary'));
}
async function referenceDownloadNodeBatch(){
 if(referenceBatchDownloading)return;
 const items=referenceTagSelection().map(id=>nodeById(id)),files=[];
 for(const node of items){
  const candidate=node&&studioAdoptedCandidate(node);if(!candidate){toast('选中内容包含尚无可下载结果的节点，未开始下载');return;}
  const media=candidate.localMedia,stored=referenceUploadUrls.get(media?.frame??candidate.frame),image=document.querySelector(`[data-node="${node.id}"] .node-media.still`),url=stored||(image&&referenceResultFileUrl(image)?.href);
  if(!url){toast('部分内容没有本机文件，未开始下载');return;}
  const original=candidate.importedFile||'',suffix=original.includes('.')?original.split('.').pop():new URL(url).pathname.split('.').pop();
  const extension=/^[a-z0-9]{1,5}$/i.test(suffix)?suffix:media?.type==='视频'?'mp4':media?.type==='音频'?'wav':'jpg',title=node.title.replace(/[\\/:*?"<>|]/g,'_');
  files.push({url,name:title.toLocaleLowerCase().endsWith('.'+extension.toLocaleLowerCase())?title:title+'.'+extension});
 }
 if(!files.length)return;
 referenceBatchDownloading=true;referenceRefreshBatchFooter();
 try{const archive={};for(const [index,file] of files.entries()){const response=await fetch(file.url);if(!response.ok)throw new Error('文件不可读');archive[String(index+1).padStart(3,'0')+'-'+file.name]=new Uint8Array(await response.arrayBuffer());}const url=URL.createObjectURL(new Blob([fflate.zipSync(archive,{level:0})],{type:'application/zip'})),link=document.createElement('a');link.href=url;link.download='CrewON-画布素材.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 catch(error){toast('素材打包失败，选中内容保持不变');}
 finally{referenceBatchDownloading=false;referenceRefreshBatchFooter();}
}
const referenceBatchBaseAction=handleAction;
handleAction=function(action){
 if(action==='node-batch-confirm-delete'){
  const pending=referenceBatchDeletePending;referenceBatchDeletePending=null;if(!pending||pending.project!==S.project){toast('项目已变化，未删除内容');return;}
  const result=referenceDeleteCanvasBatch(S,pending.ids);if(!result.ok){toast(result.error);return;}closeDialog();studioRecordCanvasHistory(result.entry);referenceTagSelected=[];if(pending.ids.includes(S.selected))S.selected=null;S.revision++;render();save();toast('已删除 '+result.count+' 项，可撤销恢复');return;
 }
 if(action==='close-modal'&&currentModal==='批量删除')referenceBatchDeletePending=null;
 referenceBatchBaseAction(action);
};
document.addEventListener('click',event=>{if(event.target.closest('[data-node-batch-delete]')){event.preventDefault();event.stopImmediatePropagation();referenceOpenBatchDelete();}if(event.target.closest('[data-node-batch-download]')){event.preventDefault();event.stopImmediatePropagation();void referenceDownloadNodeBatch();}},true);
if(S.screen==='canvas')render();
