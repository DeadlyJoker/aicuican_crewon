/* Panorama captures are retained local renders, not generated scene content. */
'use strict';
let referencePanoramaCaptureSequence=0;
/** Add one independently retained view with its source version and camera snapshot. */
function referenceCommitPanoramaCapture(state,sourceId,candidateId,record,id,position){
 const source=state.nodes.find(n=>n.id===sourceId),candidate=source?.candidates?.find(c=>c.id===candidateId);
 if(!candidate||source.adoptedCandidateId!==candidateId)return {ok:false,error:'原图版本已变化，截图未加入画布'};
 const existing=state.nodes.find(n=>n.id===id);
 if(existing)return existing.candidates?.some(c=>c.localOperation==='panorama-capture'&&c.frame===record.frame)?{ok:true,changed:false,id}:{ok:false,error:'截图标识重复，未加入画布'};
 if(!Number.isSafeInteger(record.frame)||record.frame>=0||!Number.isSafeInteger(record.width)||!Number.isSafeInteger(record.height)||record.width<1||record.height<1)return {ok:false,error:'截图尺寸无效，未加入画布'};
 const before=referenceCaptureNodeGraph(state),ref={sourceId:source.id,sourceTitle:source.title,sourceKind:source.kind,candidateId:candidate.id,number:candidate.number,frame:candidate.frame};
 const panorama={sourceId,candidateId,sourceNumber:candidate.number,...structuredClone(record.view),captureMode:record.captureMode,width:record.width,height:record.height,sourceWidth:record.sourceWidth,sourceHeight:record.sourceHeight};
 const output={id:id+'-v1',kind:'image',number:1,frame:record.frame,createdAt:new Date().toISOString(),importedFile:record.name,localOperation:'panorama-capture',sourceReferences:[structuredClone(ref)],panorama};
 const width=380,height=Math.round(width*record.height/record.width)+56;
 state.nodes.push({id,kind:'image',label:'图片',title:source.title+' · 全景截图',description:'全景取景截图，原图内容未改变',prompt:'',x:position.x,y:position.y,w:width,h:height,frame:record.frame,status:'已采用',assetReferences:[structuredClone(ref)],adoptedCandidateId:output.id,candidates:[output]});
 state.edges.push([sourceId,id]);if(Array.isArray(state.layoutBase))state.layoutBase.push({id,x:position.x,y:position.y});
 return {ok:true,changed:true,id,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
async function referenceCapturePanorama(){
 const state=referencePanorama;if(!state?.ready||state.captureBusy)return;
 state.captureBusy=true;const owner=S,button=document.querySelector('[data-action="ref-panorama-capture"]');if(button){button.disabled=true;button.textContent='正在保存…';}
 let record,stored=false,committed=false;
 try{
  state.viewer.stopMovement();referencePanoramaRemember(state);
  const view=structuredClone(state.view),renderer=state.viewer.getRenderer(),canvas=renderer.getCanvas();
  const width=canvas.width,height=canvas.height,data=renderer.render(view.pitch*Math.PI/180,view.yaw*Math.PI/180,view.hfov*Math.PI/180,{returnImage:true});
  if(!data||!width||!height)throw new Error('无法读取取景画面，请重试');
  const response=await fetch(data),blob=await response.blob();if(!blob.size)throw new Error('截图编码失败，请重试');
  if(referencePanorama!==state||S!==owner||S.project!==state.project)return;
  record={frame:-(Date.now()*1000+(referencePanoramaCaptureSequence++%1000)),blob,name:'panorama-view.png',captureMode:state.expanded?'expanded':'node',width,height,sourceWidth:state.image.naturalWidth,sourceHeight:state.image.naturalHeight,view};
  await referenceStoreGridCrops([record]);stored=true;
  if(referencePanorama!==state||S!==owner||S.project!==state.project)return;
  const result=referenceCommitPanoramaCapture(S,state.nodeId,state.candidateId,record,studioScriptId('panorama-capture'),studioNewContentPosition(380,Math.round(380*height/width)+56));
  if(!result.ok)throw new Error(result.error);
  const checkpoint={undo:structuredClone(S.canvasUndo),redo:structuredClone(S.canvasRedo),revision:S.revision};
  try{studioRecordCanvasHistory(result.entry);S.revision++;persist();}
  catch(error){const restored=referenceRestoreNodeGraph(S,result.entry.after,result.entry.before);S.canvasUndo=checkpoint.undo;S.canvasRedo=checkpoint.redo;S.revision=checkpoint.revision;if(!restored.ok)throw new Error(restored.error);throw new Error('截图保存失败，请检查浏览器存储空间后重试');}
  committed=true;referenceInstallUpload(record);focusNode(result.id);toast('全景截图已保存，原图保留');
 }catch(error){toast(error.message||'截图保存失败，原图保持不变');}
 finally{
  if(stored&&!committed)try{await referenceRemoveUncommittedImages([record.frame]);}catch(error){toast('截图未加入画布，临时图片清理失败，请重试');}
  state.captureBusy=false;const current=document.querySelector('[data-action="ref-panorama-capture"]');if(referencePanorama===state&&current){current.disabled=!state.ready;current.textContent='截图';}
 }
}
const referencePanoramaCaptureNodeHtml=nodeHtml;
nodeHtml=function(node){
 const html=referencePanoramaCaptureNodeHtml(node),candidate=studioAdoptedCandidate(node),capture=candidate?.localOperation==='panorama-capture'&&candidate.panorama;
 if(!capture)return html;
 return html.replace('class="node ','class="node ref-panorama-capture ').replace('style="',`style="--panorama-capture-ratio:${capture.width}/${capture.height};`);
};
const referencePanoramaCaptureToolbar=canvasContextToolbar;
canvasContextToolbar=function(node){
 const html=referencePanoramaCaptureToolbar(node);if(referencePanorama?.nodeId!==node.id)return html;
 const button=`<button class="button ghost" data-action="ref-panorama-capture" ${!referencePanorama.ready||referencePanorama.captureBusy?'disabled':''} title="保存当前取景为独立图片，原图保留">${I('camera')}${referencePanorama.captureBusy?'正在保存…':'截图'}</button>`;
 return html.replace(btn('重置','ref-panorama-reset','ghost','reset'),button+btn('重置','ref-panorama-reset','ghost','reset'));
};
const referencePanoramaCaptureAction=handleAction;
handleAction=function(action){if(action==='ref-panorama-capture'){void referenceCapturePanorama();return;}referencePanoramaCaptureAction(action);};
render();
