/* Materialize reviewed storyboard groups as editable video drafts, never as generated media. */
'use strict';
let referenceStoryboardAssetReturn=null;
/** Retain distinct directions without repeating the same reviewed text in every field. */
function referenceStoryboardVideoPrompt(group){
 const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
 const segments=group.segments||[],combined=segments.map(segment=>segment.fields?.prompt||'').filter(Boolean).join('\n\n');
 const sections=normalize(group.prompt)&&normalize(group.prompt)!==normalize(combined)?[group.prompt]:[];
 let elapsed=0;
 for(const segment of segments){
  const prompt=segment.fields?.prompt||'',details=Object.entries(segment.fields||{}).filter(([key,value])=>key!=='prompt'&&normalize(value)&&!normalize(prompt).includes(normalize(value))).map(([key,value])=>`${referenceStoryboardFields.find(([id])=>id===key)?.[1]||key}：${value}`);
  const content=[prompt,...details].filter(Boolean).join('\n');
  const end=elapsed+(Number(segment.seconds)||0);
  if(content)sections.push(`【${elapsed}–${end}秒 ${segment.title||segment.id}】\n`+content);
  elapsed=end;
 }
 return sections.filter(Boolean).join('\n\n');
}
function referenceStoryboardVideoNodes(state,scriptId,episodeId,revision){
 return state.nodes.filter(node=>node.storyboardOrigin?.scriptId===scriptId&&node.storyboardOrigin.episodeId===episodeId&&node.storyboardOrigin.revision===revision);
}
function referenceCreateStoryboardVideoDrafts(state,scriptId,episodeId,newId){
 const script=state.nodes.find(node=>node.id===scriptId),episode=script?.scriptSeries?.episodes.find(item=>item.id===episodeId),result=script?.scriptSeries?.storyboardDemo?.[episodeId];
 if(!episode||!result?.groups?.length)return {ok:false,error:'请先完成本集分镜'};
 const existing=referenceStoryboardVideoNodes(state,scriptId,episodeId,result.revision),pending=result.groups.filter(group=>!existing.some(node=>node.storyboardOrigin.groupId===group.id));
 if(!pending.length)return {ok:true,changed:false,ids:existing.map(node=>node.id)};
 const resolved=pending.map(group=>({group,assets:referenceStoryboardGroupAssets(state,group)}));
 const before=referenceCaptureNodeGraph(state),nodes=[];
 const left=Math.max(0,...state.nodes.map(node=>node.x+node.w))+120,top=script.y||0;
 for(const {group,assets} of resolved){
  const refs=assets.flatMap(({node})=>{const candidate=!node?.referenceOnly&&node?.candidates?.find(item=>item.id===node.adoptedCandidateId);return candidate?[{sourceId:node.id,sourceTitle:node.title,sourceKind:node.kind,candidateId:candidate.id,number:candidate.number,frame:candidate.frame}]:[];});
  const plannedAssets=assets.map(({id,node})=>({id,title:node?.title||id}));
  const index=result.groups.indexOf(group),id=newId();
  if(state.nodes.some(node=>node.id===id)||nodes.some(node=>node.id===id))return {ok:false,error:'草稿标识重复，未创建节点'};
  nodes.push({id,kind:'video',label:'视频',title:`第${episode.number}集 · 镜头 ${index+1}`,description:group.sceneTitle,prompt:referenceStoryboardVideoPrompt(group),seconds:group.seconds,x:left+(index%4)*280,y:top+Math.floor(index/4)*350,w:248,h:280,frame:refs[0]?.frame||0,status:'待制作',referenceOnly:true,candidates:[],adoptedCandidateId:null,assetReferences:refs,creationPreferences:{creationVideoMode:assets.length?'reference':'text'},storyboardOrigin:{plannedAssets,scriptId,episodeId,revision:result.revision,groupId:group.id,group:structuredClone(group)}});
 }
 const groupId=newId();if(state.nodes.some(node=>node.id===groupId)||nodes.some(node=>node.id===groupId)||referenceReadGroups(state).some(group=>group.id===groupId))return {ok:false,error:'分组标识重复，未创建节点'};
 state.nodes.push(...nodes);for(const node of nodes)for(const ref of node.assetReferences)state.edges.push([ref.sourceId,node.id]);
 const ids=[...existing.map(node=>node.id),...nodes.map(node=>node.id)];
 const groups=referenceReadGroups(state),name=`第${episode.number}集分镜 · v${result.revision}`;
 groups.push({id:groupId,name,nodeIds:nodes.map(node=>node.id)});state.referenceGroups={version:1,groups};
 if(Array.isArray(state.layoutBase))state.layoutBase.push(...nodes.map(({id,x,y})=>({id,x,y})));
 return {ok:true,changed:true,ids,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
/** All episodes must have reviewed groups before the batch can be prepared. */
function referenceStoryboardAllEpisodesReady(script){return !!script?.scriptSeries?.episodes.length&&script.scriptSeries.episodes.every(episode=>script.scriptSeries.storyboardDemo?.[episode.id]?.groups?.length);}
/** Prepare every episode on a copy; commit all drafts as one reversible operation. */
function referenceCreateAllStoryboardVideoDrafts(state,scriptId,newId){
 const script=state.nodes.find(node=>node.id===scriptId);
 if(!referenceStoryboardAllEpisodesReady(script))return {ok:false,error:'请先完成全剧所有集的分镜'};
 const before=referenceCaptureNodeGraph(state),working=structuredClone(state),ids=[];let changed=false;
 for(const episode of script.scriptSeries.episodes){
  const result=referenceCreateStoryboardVideoDrafts(working,scriptId,episode.id,newId);
  if(!result.ok)return {ok:false,error:'第'+episode.number+'集：'+result.error};
  ids.push(...result.ids);changed||=result.changed;
 }
 if(!changed)return {ok:true,changed:false,ids};
 const entry=referenceNodeGraphPatch(before,referenceCaptureNodeGraph(working)),commit=referenceRestoreNodeGraph(state,entry.before,entry.after);if(!commit.ok)return commit;
 return {ok:true,changed:true,ids,entry};
}
const referenceStoryboardCanvasAction=handleAction;
handleAction=function(action){
 if(action==='ref-sb-return-video'){const target=referenceStoryboardAssetReturn&&nodeById(referenceStoryboardAssetReturn.videoId);referenceStoryboardAssetReturn=null;if(target)focusNode(target.id);else toast('原视频草稿已不在项目中');return true;}
 if(action.startsWith('ref-sb-pending-asset:')){const id=action.slice('ref-sb-pending-asset:'.length),video=nodeById(S.selected);if(nodeById(id)){referenceStoryboardAssetReturn=video?.storyboardOrigin?{videoId:video.id,assetId:id}:null;focusNode(id);}else toast('原资产已不在项目中，分镜记录仍保留');return true;}
 if(action==='ref-sb-video-drafts'||action==='ref-sb-all-video-drafts'){
  if(referenceStoryboardEdit){toast('请先保存或取消分镜修改');return;}
  const script=nodeById(referenceWorkbench.nodeId),episode=studioSeriesEpisode(script,referenceWorkbench.episodeId);
  const result=action==='ref-sb-all-video-drafts'?referenceCreateAllStoryboardVideoDrafts(S,script.id,()=>studioScriptId('storyboard-video')):referenceCreateStoryboardVideoDrafts(S,script.id,episode.id,()=>studioScriptId('storyboard-video'));
  if(!result.ok){toast(result.error);return;}
  if(result.changed){studioRecordCanvasHistory(result.entry);S.revision++;save();}
  closeDialog();render();focusNode(result.ids[0]);toast(result.changed?'视频草稿已加入画布，尚未生成视频':'已定位本版分镜的视频草稿');return;
 }
 referenceStoryboardCanvasAction(action);
};

/** Unbound storyboard inputs remain plans, never fabricated candidate references. */
function referenceStoryboardPendingAssets(node,refs){
 return (node?.storyboardOrigin?.plannedAssets||[]).filter(asset=>!refs.some(ref=>ref.sourceId===asset.id));
}
const referenceStoryboardVideoModes=canvasVideoModeHtml;
canvasVideoModeHtml=function(node,draft,refs){
 const pending=referenceStoryboardPendingAssets(node,refs),html=referenceStoryboardVideoModes(node,draft,refs);
 if(!pending.length)return html;
 const textMode=canvasVideoReferencePlan(draft,refs).mode==='text';
 return html+`<div class="creation-storyboard-pending" role="status"><span>${textMode?'文生视频不使用以下分镜参考':'待补参考'} · ${pending.length}</span><div>${pending.map(asset=>`<button data-action="ref-sb-pending-asset:${esc(asset.id)}" title="定位原资产">${esc(asset.title)}${I('arrow')}</button>`).join('')}</div>${textMode?'':`<button data-action="asset-picker:${node.id}">选择已采用图片${I('plus')}</button>`}</div>`;
};
const referenceStoryboardCanSubmit=canvasPromptCanSubmit;
canvasPromptCanSubmit=function(node,draft,prompt){
 return referenceStoryboardCanSubmit(node,draft,prompt)&&!(mediaKind(node)==='video'&&canvasVideoReferencePlan(draft,studioAssetReferenceSnapshot(node)).mode!=='text'&&referenceStoryboardPendingAssets(node,studioAssetReferenceSnapshot(node)).length);
};
const referenceStoryboardCreationAction=handleCanvasCreationAction;
handleCanvasCreationAction=function(action){
 if(action==='canvas-creation-submit'){
  const node=canvasCreationNode();
  if(node&&mediaKind(node)==='video'&&canvasVideoReferencePlan(canvasCreationDraft(node),studioAssetReferenceSnapshot(node)).mode!=='text'&&referenceStoryboardPendingAssets(node,studioAssetReferenceSnapshot(node)).length){toast('请先补齐分镜参考，或切换为文生视频');return true;}
 }
 return referenceStoryboardCreationAction(action);
};

/** Keep the originating shot reachable while preparing one of its missing references. */
const referenceStoryboardCreationHtml=canvasCreationHtml;
canvasCreationHtml=function(){
 const html=referenceStoryboardCreationHtml(),route=referenceStoryboardAssetReturn;
 const video=route&&nodeById(route.videoId);
 if(!html||!video||S.selected!==route.assetId)return html;
 return html.replace('<header class="creation-reference-row">',`<div class="creation-storyboard-return"><button data-action="ref-sb-return-video" title="${esc(video.title)}">${I('arrow')}返回分镜视频<span>${esc(video.title)}</span></button></div><header class="creation-reference-row">`);
};
