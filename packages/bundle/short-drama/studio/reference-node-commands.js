/* Local canvas commands preserve accepted results and record only changed graph entries. */
'use strict';
const referenceMutableNodeKinds=new Set(['video','voice','audio','image','character','scene','text','note','video-compose','quick-cut']);
const referenceNodeMapFields=['nodeDrafts','versions'];
const referenceNodeValueFields=['clips','referenceGroups','layoutBase'];
function referenceNodeEditable(n){return !!n&&referenceMutableNodeKinds.has(n.kind)&&!n.scriptSourceId;}
function referenceNodeValue(object,key){return Object.hasOwn(object,key)?{present:true,value:structuredClone(object[key])}:{present:false};}
function referenceNodeEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function referenceCaptureNodeGraph(state){
 return {nodes:structuredClone(state.nodes),edges:structuredClone(state.edges),maps:Object.fromEntries(referenceNodeMapFields.map(key=>[key,structuredClone(state[key]||{})])),values:Object.fromEntries(referenceNodeValueFields.map(key=>[key,referenceNodeValue(state,key)]))};
}
/** Store changed nodes and map entries, not another copy of every retained media result. */
function referenceNodeGraphPatch(before,after){
 const left={nodes:[],edges:[],maps:{},values:{}},right={nodes:[],edges:[],maps:{},values:{}};
 for(const id of new Set([...before.nodes,...after.nodes].map(n=>n.id))){
  const a=before.nodes.findIndex(n=>n.id===id),b=after.nodes.findIndex(n=>n.id===id),av=a<0?null:before.nodes[a],bv=b<0?null:after.nodes[b];
  if(!referenceNodeEqual(av,bv)){left.nodes.push({id,index:a,value:av});right.nodes.push({id,index:b,value:bv});}
 }
 const edgeKey=edge=>JSON.stringify(edge),all=new Set([...before.edges,...after.edges].map(edgeKey));
 for(const key of all){const a=before.edges.findIndex(edge=>edgeKey(edge)===key),b=after.edges.findIndex(edge=>edgeKey(edge)===key);if((a<0)!==(b<0)){left.edges.push({edge:JSON.parse(key),index:a,present:a>=0});right.edges.push({edge:JSON.parse(key),index:b,present:b>=0});}}
 for(const field of referenceNodeMapFields){left.maps[field]=[];right.maps[field]=[];for(const key of new Set([...Object.keys(before.maps[field]),...Object.keys(after.maps[field])])){const a=referenceNodeValue(before.maps[field],key),b=referenceNodeValue(after.maps[field],key);if(!referenceNodeEqual(a,b)){left.maps[field].push({key,...a});right.maps[field].push({key,...b});}}}
 for(const field of referenceNodeValueFields)if(!referenceNodeEqual(before.values[field],after.values[field])){left.values[field]=before.values[field];right.values[field]=after.values[field];}
 return {type:'node-graph',before:left,after:right};
}
/** Validate every affected entry before restoring; unrelated later edits remain intact. */
function referenceRestoreNodeGraph(state,expected,next){
 const fail=()=>({ok:false,error:'相关内容已发生其他变化，暂不能恢复，现有内容已保留'});
 for(const item of expected.nodes)if(!referenceNodeEqual(state.nodes.find(n=>n.id===item.id)||null,item.value))return fail();
 for(const item of expected.edges)if(state.edges.some(edge=>referenceNodeEqual(edge,item.edge))!==item.present)return fail();
 for(const field of referenceNodeMapFields)for(const item of expected.maps[field]||[])if(!referenceNodeEqual(referenceNodeValue(state[field]||{},item.key),item.present?{present:true,value:item.value}:{present:false}))return fail();
 for(const [field,value] of Object.entries(expected.values))if(!referenceNodeEqual(referenceNodeValue(state,field),value))return fail();
 const removed=new Set(next.nodes.filter(item=>item.value===null).map(item=>item.id));
 const survivingEdges=state.edges.filter(edge=>!next.edges.some(item=>!item.present&&referenceNodeEqual(item.edge,edge)));
 if(survivingEdges.some(([from,to])=>removed.has(from)||removed.has(to)))return fail();
 const survivingNodes=state.nodes.map(n=>next.nodes.find(item=>item.id===n.id)?.value??n).filter(n=>!removed.has(n.id));
 if(survivingNodes.some(n=>removed.has(n.variantOf)||n.assetReferences?.some(ref=>removed.has(ref.sourceId))||n.scriptSeries?.sharedAssetIds?.some(id=>removed.has(id))||n.scriptSeries?.episodes?.some(episode=>episode.assetIds.some(id=>removed.has(id)))))return fail();
 const groups=Object.hasOwn(next.values,'referenceGroups')?(next.values.referenceGroups.present?next.values.referenceGroups.value:null):state.referenceGroups;
 if(groups?.groups?.some(g=>g.nodeIds.some(id=>removed.has(id))))return fail();
 for(const item of next.nodes){const at=state.nodes.findIndex(n=>n.id===item.id);if(item.value===null){if(at>=0)state.nodes.splice(at,1);}else if(at>=0)state.nodes[at]=structuredClone(item.value);}
 for(const item of next.nodes.filter(item=>item.value!==null&&!state.nodes.some(n=>n.id===item.id)).sort((a,b)=>a.index-b.index))state.nodes.splice(Math.max(0,Math.min(item.index,state.nodes.length)),0,structuredClone(item.value));
 for(const item of next.edges.filter(item=>!item.present))state.edges=state.edges.filter(edge=>!referenceNodeEqual(edge,item.edge));
 for(const item of next.edges.filter(item=>item.present).sort((a,b)=>a.index-b.index))if(!state.edges.some(edge=>referenceNodeEqual(edge,item.edge)))state.edges.splice(Math.max(0,Math.min(item.index,state.edges.length)),0,structuredClone(item.edge));
 for(const field of referenceNodeMapFields){state[field]??={};for(const item of next.maps[field]||[]){if(item.present)Object.defineProperty(state[field],item.key,{value:structuredClone(item.value),enumerable:true,writable:true,configurable:true});else delete state[field][item.key];}}
 for(const [field,item] of Object.entries(next.values)){if(item.present)state[field]=structuredClone(item.value);else delete state[field];}
 return {ok:true};
}
function referenceNodeCommandResult(state,before,id){return {ok:true,changed:true,id,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};}
/** Copy node data, retained versions and preparation drafts, with incoming links only. */
function referenceDuplicateCanvasNode(state,sourceId,id,position){
 const source=state.nodes.find(n=>n.id===sourceId);if(!referenceNodeEditable(source))return {ok:false,error:'请在剧本工坊或时间线中管理这类内容'};
 if(state.nodes.some(n=>n.id===id))return {ok:false,error:'副本标识重复，请重试'};
 const before=referenceCaptureNodeGraph(state),copy=structuredClone(source),draft=state.nodeDrafts?.[sourceId];
 if(!state.referenceGroups)state.referenceGroups={version:1,groups:structuredClone(referenceReadGroups(state))};
 copy.id=id;Object.assign(copy,position);delete copy.groupId;delete copy.scriptSourceId;delete copy.scriptSceneId;delete copy.scriptSceneTitle;delete copy.scriptDetachedFrom;delete copy.scriptDetachedAt;
 state.nodes.push(copy);for(const [from,to] of before.edges)if(to===sourceId)state.edges.push([from,id]);
 state.nodeDrafts??={};if(draft)Object.defineProperty(state.nodeDrafts,id,{value:structuredClone(draft),enumerable:true,writable:true,configurable:true});
 state.versions??={};if(Object.hasOwn(before.maps.versions,sourceId))Object.defineProperty(state.versions,id,{value:structuredClone(before.maps.versions[sourceId]),enumerable:true,writable:true,configurable:true});
 if(Array.isArray(state.layoutBase))state.layoutBase.push({id,x:copy.x,y:copy.y});
 return referenceNodeCommandResult(state,before,id);
}
/** Change the canvas label and live reference labels; historical candidate inputs remain unchanged. */
function referenceRenameCanvasNode(state,id,name){
 const node=state.nodes.find(n=>n.id===id);if(!referenceNodeEditable(node))return {ok:false,error:'请在剧本工坊或时间线中管理这类内容'};
 const title=String(name).trim()||node.title;if(title===node.title)return {ok:true,changed:false,id};
 const before=referenceCaptureNodeGraph(state);node.title=title;
 for(const n of state.nodes)if(Array.isArray(n.assetReferences))for(const ref of n.assetReferences)if(ref.sourceId===id)ref.sourceTitle=title;
 return referenceNodeCommandResult(state,before,id);
}
function referenceConfirmedAsset(state,id){return state.nodes.some(n=>n.scriptSeries?.assetConfirmation?.assets?.some(asset=>asset.id===id));}
/** Remove one canvas node and its live connections while keeping earlier output snapshots readable. */
function referenceDeleteCanvasNode(state,id){
 if(referenceConfirmedAsset(state,id))return {ok:false,error:'该资产已确认用于分镜，不能删除；可创建副本继续编辑'};
 const node=state.nodes.find(n=>n.id===id);if(!referenceNodeEditable(node))return {ok:false,error:'请在剧本工坊或时间线中管理这类内容'};
 const before=referenceCaptureNodeGraph(state);state.nodes=state.nodes.filter(n=>n.id!==id);state.edges=state.edges.filter(([from,to])=>from!==id&&to!==id);
 for(const n of state.nodes)if(Array.isArray(n.assetReferences))n.assetReferences=n.assetReferences.filter(ref=>ref.sourceId!==id);
 for(const n of state.nodes)if(n.variantOf===id)delete n.variantOf;
 for(const n of state.nodes)if(n.scriptSeries){
  if(Array.isArray(n.scriptSeries.sharedAssetIds))n.scriptSeries.sharedAssetIds=n.scriptSeries.sharedAssetIds.filter(value=>value!==id);
  for(const episode of n.scriptSeries.episodes)episode.assetIds=episode.assetIds.filter(value=>value!==id);
 }
 for(const field of referenceNodeMapFields)if(state[field])delete state[field][id];
 if(Array.isArray(state.clips))state.clips=state.clips.filter(value=>value!==id);
 if(Array.isArray(state.layoutBase))state.layoutBase=state.layoutBase.filter(value=>value.id!==id);
 if(state.referenceGroups)state.referenceGroups={version:1,groups:referenceReadGroups(state).map(g=>({...g,nodeIds:g.nodeIds.filter(value=>value!==id)})).filter(g=>g.nodeIds.length)};
 return referenceNodeCommandResult(state,before,id);
}
/** Capture the selected node for the Demo's internal clipboard without touching the system clipboard. */
function referenceCopyCanvasNode(state,id){
 const node=state.nodes.find(n=>n.id===id);if(!referenceNodeEditable(node))return {ok:false,error:'请在剧本工坊或时间线中管理这类内容'};
 return {ok:true,payload:{project:state.project,node:structuredClone(node),draft:state.nodeDrafts?.[id]?structuredClone(state.nodeDrafts[id]):null,version:referenceNodeValue(state.versions||{},id),incoming:state.edges.filter(([,to])=>to===id).map(edge=>[...edge])}};
}
function referencePasteCanvasNode(state,payload,id,position){
 if(!payload||!referenceNodeEditable(payload.node))return {ok:false,error:'请先复制一个节点'};
 if(state.nodes.some(n=>n.id===id))return {ok:false,error:'副本标识重复，请重试'};
 const before=referenceCaptureNodeGraph(state),copy=structuredClone(payload.node),sameProject=payload.project===state.project;
 if(!state.referenceGroups)state.referenceGroups={version:1,groups:structuredClone(referenceReadGroups(state))};
 copy.id=id;Object.assign(copy,position);delete copy.groupId;
 const incoming=sameProject?payload.incoming.filter(([from])=>state.nodes.some(n=>n.id===from)):[];
 const dropped=payload.incoming.length-incoming.length;
 if(Array.isArray(copy.assetReferences))copy.assetReferences=copy.assetReferences.filter(ref=>sameProject&&state.nodes.some(n=>n.id===ref.sourceId));
 state.nodes.push(copy);state.edges.push(...incoming.map(([from])=>[from,id]));state.nodeDrafts??={};state.versions??={};
 if(payload.draft)Object.defineProperty(state.nodeDrafts,id,{value:structuredClone(payload.draft),enumerable:true,writable:true,configurable:true});
 if(payload.version.present)Object.defineProperty(state.versions,id,{value:structuredClone(payload.version.value),enumerable:true,writable:true,configurable:true});
 if(Array.isArray(state.layoutBase))state.layoutBase.push({id,x:copy.x,y:copy.y});
 return {...referenceNodeCommandResult(state,before,id),dropped};
}
