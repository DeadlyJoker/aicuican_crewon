/* Homepage media preparation is copied into a new draft, never into accepted outputs. */
'use strict';
function referenceApplyEntryMediaDraft(kind,draft,referenceIds){
 const state=S;
 const node=state.nodes.find(item=>item.id===kind+'-result'&&item.kind===(kind==='audio'?'voice':kind));if(!node)return {ok:false,error:'制作草稿不存在，请保留项目后重新打开'};
 const before=referenceCaptureNodeGraph(state),result=studioApplyAssetReferences(node,referenceIds,false);if(!result.ok)return result;
 state.nodeDrafts??={};state.nodeDrafts[node.id]={...structuredClone(draft),prompt:kind==='audio'&&draft.creationAudioMode==='music'?'':referenceEntryInput(state),...(kind==='audio'&&draft.creationAudioMode==='music'?{creationMusicStyle:referenceEntryInput(state)}:{})};
 return {ok:true,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
function referenceApplyEntryImageDraft(draft,referenceIds){return referenceApplyEntryMediaDraft('image',draft,referenceIds);}
const referenceEntryImageAction=handleAction;
handleAction=function(action){
 const kind=referenceEntryKind(S).id,creating=action==='ref-start'&&S.screen==='home'&&S.referenceMode==='create'&&['image','video','audio'].includes(kind);
 if(creating&&kind==='video'&&!referenceEntryVideoCanStart(S)){toast(referenceEntryVideoPlan(S).error||'请先选择视频模型');return;}
 const draft=creating?structuredClone(kind==='image'?referenceEntryImageDraft(S):kind==='video'?referenceEntryVideoDraft(S):referenceEntryAudioDraft(S)):null;
 referenceEntryImageAction(action);
 if(!creating||S.screen!=='canvas'||S.projectKind!==kind)return;
 const sources=S.nodes.filter(node=>(kind==='video'?['image','video'].includes(node.kind):node.kind==='image')&&(node.candidates||[]).some(candidate=>candidate.sourceHistory?.project==='创作参考')).map(node=>node.id);
 const result=referenceApplyEntryMediaDraft(kind,draft,sources);if(!result.ok){toast(result.error);return;}
 studioRecordCanvasHistory(result.entry);render();save();
};
