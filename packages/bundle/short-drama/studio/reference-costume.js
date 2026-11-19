/* Batch costume preparation pins a source version and preserves every target output. */
'use strict';
let referenceCostumePicker=null;
/** Save all target drafts together, rolling back reference failures before returning. */
function referencePrepareCostumeDrafts(sourceId,candidateId,targetIds){
 const source=nodeById(sourceId),snapshot=studioAssetSourceSnapshot(source);
 if(source?.kind!=='character'||!snapshot||snapshot.candidateId!==candidateId)return {ok:false,error:'源角色图片已变化，请重新打开选择器'};
 if(!Array.isArray(targetIds)||!targetIds.length||new Set(targetIds).size!==targetIds.length)return {ok:false,error:'请选择不同的目标角色'};
 const targets=targetIds.map(nodeById);
 if(targets.some(n=>!n||n.kind!=='character'||n.id===sourceId))return {ok:false,error:'目标角色已变化，请重新选择'};
 const before=referenceCaptureNodeGraph(S);
 for(const target of targets){
  const refs=studioAssetReferenceRead(target).filter(ref=>ref.sourceId!==sourceId);
  const result=studioApplyAssetReferences(target,[...refs,snapshot],false);
  if(!result.ok){const after=referenceCaptureNodeGraph(S);const rollback=referenceNodeGraphPatch(before,after);referenceRestoreNodeGraph(S,rollback.after,rollback.before);return {ok:false,error:result.error};}
  S.nodeDrafts??={};S.nodeDrafts[target.id]??={};
  S.nodeDrafts[target.id].creationCostume={source:structuredClone(snapshot)};
 }
 const after=referenceCaptureNodeGraph(S);
 return {ok:true,changed:!referenceNodeEqual(before,after),ids:targetIds.slice(),entry:referenceNodeGraphPatch(before,after)};
}
function referenceOpenCostumePicker(id){
 const source=nodeById(id),snapshot=studioAssetSourceSnapshot(source);
 if(source?.kind!=='character'||!snapshot){toast('请先为源角色采用一张图片');return;}
 const targets=S.nodes.filter(n=>n.kind==='character'&&n.id!==id);
 referenceCostumePicker={project:S.project,sourceId:id,candidateId:snapshot.candidateId};
 showDialog('选择变装角色',`<div class="ref-costume-source"><span class="still frame${snapshot.frame}" aria-hidden="true"></span><div><strong>${esc(source.title)} · v${snapshot.number}</strong><small>源图仅作参考，各目标保留自己的描述与已有结果</small></div></div><div class="ref-costume-targets" role="group" aria-label="目标角色">${targets.map(n=>{const c=studioAdoptedCandidate(n),description=S.nodeDrafts[n.id]?.prompt??n.prompt??n.description??'';return `<label class="ref-costume-target"><input type="checkbox" value="${esc(n.id)}" aria-label="选择 ${esc(n.title)}" data-costume-target><span class="ref-costume-thumb ${c?'still frame'+c.frame:''}" aria-hidden="true">${c?'':I('user')}</span><span class="ref-costume-copy"><strong>${esc(n.title)}</strong><small title="${esc(description)}">${esc(description||'暂无描述')}</small></span></label>`}).join('')||'<p>没有其他角色，请先添加角色或造型草稿</p>'}</div><p class="ref-costume-note">仅保存制作草稿，不生成图片，不改变当前采用版本。</p><p class="ref-costume-error" role="alert" hidden></p>`,`${btn('取消','close-modal','outline')}<button class="button primary" data-action="ref-costume-save" disabled>保存变装草稿</button>`);
 document.querySelector('.dialog').classList.add('ref-costume-dialog');
}
const referenceCostumeNodeHtml=nodeHtml;
nodeHtml=function(n){
 const html=referenceCostumeNodeHtml(n);if(n.kind!=='character')return html;
 const ready=!!studioAdoptedCandidate(n);
 return html.replace('<div class="ref-node-actions">',`<div class="ref-node-actions"><button class="icon-btn tip" data-action="ref-costume-open:${n.id}" aria-label="选择变装：${esc(n.title)}" title="选择变装" ${ready?'':'disabled'}>${I('user')}</button>`);
};
function referenceCostumeDraftReady(n,d){const source=d.creationCostume?.source;return !source||studioAssetReferenceRead(n).some(ref=>studioAssetReferenceEqual(ref,source));}
const referenceCostumeCanSubmit=canvasPromptCanSubmit;
canvasPromptCanSubmit=function(n,d,prompt){return referenceCostumeCanSubmit(n,d,prompt)&&referenceCostumeDraftReady(n,d);};
const referenceCostumeSettings=canvasMediaSettings;
canvasMediaSettings=function(n,d){const settings=referenceCostumeSettings(n,d);return mediaKind(n)==='image'&&d.creationCostume?{...settings,tool:'角色变装',costume:structuredClone(d.creationCostume)}:settings;};
const referenceCostumeCreationHtml=canvasCreationHtml;
canvasCreationHtml=function(){
 const html=referenceCostumeCreationHtml(),n=canvasCreationNode(),costume=n&&canvasCreationDraft(n).creationCostume;
 if(!html||!costume)return html;
 const ref=costume.source;
 return html.replace('<header class="creation-reference-row">',`${referenceCostumeDraftReady(n,canvasCreationDraft(n))?'':'<p class="ref-costume-note" role="alert">变装源参考已移除或更换，请重新选择或移除变装设置</p>'}<div class="ref-costume-draft"><span>变装草稿 · ${esc(ref.sourceTitle)} v${ref.number}</span><button data-action="ref-costume-clear" aria-label="移除变装设置" title="移除变装设置">${I('close')}</button></div><header class="creation-reference-row">`);
};
const referenceCostumeCreationAction=handleCanvasCreationAction;
handleCanvasCreationAction=function(action){const n=canvasCreationNode();if(action==='canvas-creation-submit'&&n&&!referenceCostumeDraftReady(n,canvasCreationDraft(n))){toast('变装源参考已变化，请重新选择或移除变装设置');return true;}return referenceCostumeCreationAction(action);};
const referenceCostumeAction=handleAction;
handleAction=function(action){
 if(action.startsWith('ref-costume-open:')){referenceOpenCostumePicker(action.slice('ref-costume-open:'.length));return;}
 if(action==='ref-costume-clear'){const n=canvasCreationNode();if(n){const before=referenceCaptureNodeGraph(S);delete S.nodeDrafts[n.id]?.creationCostume;delete n.creationPreferences?.creationCostume;studioRecordCanvasHistory(referenceNodeGraphPatch(before,referenceCaptureNodeGraph(S)));render();save();toast('已移除变装设置，参考图仍保留');}return;}
 if(action==='ref-costume-save'){
  const picker=referenceCostumePicker;if(!picker||picker.project!==S.project)return;
  const ids=[...document.querySelectorAll('[data-costume-target]:checked')].map(input=>input.value),result=referencePrepareCostumeDrafts(picker.sourceId,picker.candidateId,ids);
  if(!result.ok){const error=document.querySelector('.ref-costume-error');error.textContent=result.error;error.hidden=false;return;}
  if(result.changed){studioRecordCanvasHistory(result.entry);S.revision++;save();}
  referenceCostumePicker=null;closeDialog();render();focusNode(result.ids[0]);toast(result.changed?`已保存 ${ids.length} 个变装草稿，尚未生成图片`:'已定位已有变装草稿');return;
 }
 referenceCostumeAction(action);
};
document.addEventListener('change',event=>{if(!event.target.matches('[data-costume-target]'))return;const count=document.querySelectorAll('[data-costume-target]:checked').length,button=document.querySelector('[data-action="ref-costume-save"]');button.disabled=!count;button.textContent=count?`保存 ${count} 个变装草稿`:'保存变装草稿';});
render();
