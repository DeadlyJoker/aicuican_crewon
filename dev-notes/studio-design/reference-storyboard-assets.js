/* Shared asset references for storyboard review and video-draft creation. */
'use strict';
function referenceStoryboardGroupAssets(state,group){
 const shots=new Set(group.segments.map(segment=>segment.id)),ids=new Set([...(group.mentionedAssetIds||[]),...state.edges.filter(([,to])=>shots.has(to)).map(([from])=>from)]);
 for(const node of state.nodes.filter(node=>shots.has(node.id)))for(const ref of node.assetReferences||[])ids.add(ref.sourceId);
 return [...ids].map(id=>({id,node:state.nodes.find(node=>node.id===id)})).filter(item=>!item.node||['character','scene','image'].includes(item.node.kind));
}
/** Split explicit mentions of this group's assets, preserving unknown text verbatim. */
function referenceStoryboardMentions(text,assets){
 const names=assets.filter(a=>a?.title).map(a=>({token:'@'+a.title,id:a.id})).sort((a,b)=>b.token.length-a.token.length),parts=[];
 let start=0,index=0;
 while(index<text.length){
  const match=text[index]==='@'?names.find(a=>text.startsWith(a.token,index)&&!/[\p{L}\p{N}_]/u.test(text[index+a.token.length]||'')):null;
  if(!match){index++;continue;}
  if(index>start)parts.push({text:text.slice(start,index)});
  parts.push({text:match.token,assetId:match.id});index+=match.token.length;start=index;
 }
 if(start<text.length)parts.push({text:text.slice(start)});return parts;
}

/** Collect only explicit, resolvable mentions from all authored fields in a group. */
function referenceStoryboardMentionIds(group,assets){
 const texts=[group.prompt,...group.segments.flatMap(segment=>Object.values(segment.fields))];
 return [...new Set(texts.flatMap(text=>referenceStoryboardMentions(text,assets).flatMap(part=>part.assetId?[part.assetId]:[])))];
}
