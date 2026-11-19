/* Timeline gestures use frame-aligned previews and commit one history entry on release. */
'use strict';
function referenceCutFps(editor){return editor.fps||30;}
function referenceCutTrackKind(clip){return clip.kind==='text'?'text':clip.kind==='audio'?'audio':'media';}
function referenceCutTrackDefinitions(editor){
 const rows=[];
 for(const [kind,label] of [['text','文本'],['media','画面'],['audio','声音']]){
  const ids=[...new Set(editor.clips.filter(c=>referenceCutTrackKind(c)===kind).map(c=>c.track))];if(kind==='media'&&!ids.includes('media'))ids.unshift('media');
  ids.forEach((id,i)=>rows.push({id,kind,label:ids.length>1?label+' '+(i+1):label}));
 }
 return rows;
}
function referenceCutNewTrack(editor,clip){const kind=referenceCutTrackKind(clip),used=new Set(editor.clips.map(c=>c.track));let i=2;while(used.has(kind+'-'+i))i++;return kind+'-'+i;}
function referenceCutGestureSnap(editor,clip,value,anchors,min,max,threshold){
 let time=value,guide=null,best=threshold;
 const points=[editor.playhead,0,...editor.clips.filter(c=>c.id!==clip.id).flatMap(c=>[c.start,c.start+c.duration])];
 for(const point of points)for(const offset of anchors){const candidate=point-offset,distance=Math.abs(candidate-value);if(candidate>=min&&candidate<=max&&distance<=best){time=candidate;guide=point;best=distance;}}
 return {time,guide};
}
/** Preview preserves source snapshots and returns a complete changed clip list without mutating the editor. */
function referenceCutGesturePreview(editor,id,spec){
 const clips=structuredClone(editor.clips),clip=clips.find(c=>c.id===id),original=editor.clips.find(c=>c.id===id),fps=referenceCutFps(editor),referenceCutFrame=1/fps,frame=value=>Math.round(value*fps)/fps;
 if(!clip)return {ok:false,error:'片段已不存在，原草稿保留'};
 const threshold=Number.isFinite(spec.threshold)?Math.max(0,spec.threshold):8/(170*(editor.zoom||1));let guide=null,inserted=false;
 const snap=(value,anchors,min,max)=>{
  const bounded=Math.max(min,Math.min(max,frame(value)));if(spec.snap===false||editor.snapping===false)return bounded;
  const result=referenceCutGestureSnap(editor,original,bounded,anchors,min,max,threshold);guide=result.guide;return Math.max(min,Math.min(max,frame(result.time)));
 };
 if(spec.mode==='move'){
  if(!Number.isFinite(spec.start))return {ok:false,error:'片段位置无效'};
  const target=spec.track||clip.track,kind=referenceCutTrackKind(clip),existing=editor.clips.filter(c=>c.track===target);
  if(existing.some(c=>referenceCutTrackKind(c)!==kind)||!existing.length&&!editor.nativeTracks?.some(row=>row.id===target&&(row.kind==='video'?'media':row.kind==='subtitle'?'text':row.kind)===kind)&&target!==kind&&!new RegExp('^'+kind+'-(?:[2-9]|[1-9][0-9]+)$').test(target))return {ok:false,error:'请拖到同类轨道或下方空白处'};
  clip.track=target;clip.start=snap(spec.start,[0,clip.duration],0,Infinity);
  const peers=clips.filter(c=>c.id!==clip.id&&c.track===target).sort((a,b)=>a.start-b.start);
  if(peers.some(c=>clip.start<c.start+c.duration-1e-7&&clip.start+clip.duration>c.start+1e-7)){
   inserted=true;let at=peers.findIndex(c=>clip.start<c.start+c.duration/2);if(at<0)at=peers.length;
   clip.start=at<peers.length?Math.min(clip.start,peers[at].start):peers.length?peers.at(-1).start+peers.at(-1).duration:clip.start;
   let end=clip.start+clip.duration;for(const peer of peers.slice(at)){peer.start=Math.max(peer.start,end);end=peer.start+peer.duration;}
   guide=clip.start;
  }
 }else if(spec.mode==='start'||spec.mode==='end'){
  if(!Number.isFinite(spec.delta))return {ok:false,error:'裁剪位置无效'};
  const peers=clips.filter(c=>c.id!==clip.id&&c.track===clip.track),boundedSource=['video','audio'].includes(clip.kind),previous=Math.max(0,...peers.filter(c=>c.start+c.duration<=clip.start+1e-7).map(c=>c.start+c.duration)),next=Math.min(Infinity,...peers.filter(c=>c.start>=clip.start+clip.duration-1e-7).map(c=>c.start));
  if(spec.mode==='start'){
   const min=Math.max(previous,boundedSource?clip.start-clip.sourceIn:0),max=clip.start+clip.duration-referenceCutFrame;
   const start=snap(clip.start+spec.delta,[0],min,max),delta=start-clip.start;clip.start=start;clip.duration=frame(clip.duration-delta);if(boundedSource)clip.sourceIn=frame(clip.sourceIn+delta);
  }else{
   const max=Math.min(next,boundedSource?clip.start+clip.sourceDuration-clip.sourceIn:Infinity),end=snap(clip.start+clip.duration+spec.delta,[0],clip.start+referenceCutFrame,max);clip.duration=frame(end-clip.start);
  }
 }else return {ok:false,error:'未知时间轴手势'};
 return {ok:true,clips,clip,guide,inserted};
}
