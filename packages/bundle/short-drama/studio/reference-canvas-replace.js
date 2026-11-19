/* Canvas image replacement shares the asset gallery while preserving target metadata. */
'use strict';
/** Commit one copied output; repeated confirmation of the same request adds no version. */
function referenceReplaceCanvasImage(state,id,expectedCandidateId,reuse){
 const node=state.nodes.find(n=>n.id===id);
 if(!node||!['character','scene','image'].includes(node.kind)||!reuse?.candidate||!reuse.id)return {ok:false,error:'替换图片或目标已不可用，请重新选择'};
 const duplicate=node.candidates?.find(c=>c.id===reuse.id);
 if(duplicate)return duplicate.reusedFrom?.sourceId===reuse.sourceId&&duplicate.reusedFrom?.candidateId===reuse.candidate.id?{ok:true,changed:false,id}:{ok:false,error:'图片版本标识重复，未执行替换'};
 if((node.adoptedCandidateId||null)!==expectedCandidateId)return {ok:false,error:'当前采用图片已变化，请重新打开替换'};
 const before=referenceCaptureNodeGraph(state);
 referenceApplyWorkbenchReuse(node,reuse);
 return {ok:true,changed:true,id,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
const referenceCanvasReplaceNodeHtml=nodeHtml;
nodeHtml=function(node){
 const html=referenceCanvasReplaceNodeHtml(node);
 if(!['character','scene','image'].includes(node.kind)||node.referenceOnly||!studioAdoptedCandidate(node))return html;
 return html.replace('<footer class="ref-node-footer">',`<button class="ref-canvas-image-replace" data-action="ref-canvas-image-replace:${node.id}" aria-label="替换图片：${esc(node.title)}">${I('upload')}替换</button><footer class="ref-node-footer">`);
};
const referenceCanvasReplaceAction=handleAction;
handleAction=function(action){
 if(action.startsWith('ref-canvas-image-replace:')){
  const n=nodeById(action.slice('ref-canvas-image-replace:'.length));if(!n)return;
  referenceOpenWorkbenchLibrary({id:n.id,category:n.assetCategory==='prop'?'prop':n.kind,expectedCandidateId:n.adoptedCandidateId||null});return;
 }
 referenceCanvasReplaceAction(action);
};
document.addEventListener('click',event=>{
 if(!event.target.closest('[data-canvas-replace-confirm]'))return;
 event.preventDefault();event.stopImmediatePropagation();
 const state=referenceWorkbenchLibrary,item=state?.replacement;
 if(!state?.target||!item||state.project!==S.project)return;
 const result=referenceReplaceCanvasImage(S,state.target.id,state.target.expectedCandidateId,{id:item.reuseId,sourceId:item.sourceId,sourceTitle:item.title,candidate:item.candidate});
 if(!result.ok){toast(result.error);return;}
 if(result.changed){studioRecordCanvasHistory(result.entry);S.revision++;save();}
 const id=result.id;referenceCloseWorkbenchLibrary(false);render();focusNode(id);toast(result.changed?'图片已替换，原版本与角色资料保留':'图片已替换，未重复新增版本');
},true);
render();
