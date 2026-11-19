/* Layout commands only replace coordinates; references and accepted media stay untouched. */
'use strict';
function referenceGroupLayout(nodes,mode){
 if(!nodes.length)return [];
 const columns=mode==='horizontal'?nodes.length:mode==='vertical'?1:Math.ceil(Math.sqrt(nodes.length));
 const widths=Array(columns).fill(0),heights=Array(Math.ceil(nodes.length/columns)).fill(0);
 nodes.forEach((n,i)=>{widths[i%columns]=Math.max(widths[i%columns],n.w);heights[Math.floor(i/columns)]=Math.max(heights[Math.floor(i/columns)],n.h);});
 const left=Math.min(...nodes.map(n=>n.x)),top=Math.min(...nodes.map(n=>n.y));
 const offset=(values,i)=>values.slice(0,i).reduce((sum,value)=>sum+value+30,0);
 return nodes.map((n,i)=>({id:n.id,x:left+offset(widths,i%columns),y:top+offset(heights,Math.floor(i/columns))}));
}
function referenceGroupName(value,previous){return value.trim()||previous;}
/** Project native assets into their categories while retaining unrelated saved groups and layout. */
function referenceReadGroups(state){
 const exists=new Set(state.nodes.map(n=>n.id)),claimed=new Set();
 if(state.referenceGroups?.version===1&&Array.isArray(state.referenceGroups.groups)){
  const saved=state.referenceGroups.groups.filter(g=>g&&typeof g.id==='string'&&typeof g.name==='string'&&Array.isArray(g.nodeIds)).map(g=>{
   const nodeIds=g.nodeIds.filter(id=>{if(!exists.has(id)||claimed.has(id))return false;claimed.add(id);return true;});
   return {id:g.id,name:g.name,nodeIds,...(referenceGroupColors.some(color=>color.id===g.color)?{color:g.color}:{}),...(referenceValidGroupFrame(g.frame)?{frame:{...g.frame}}:{})};
  }).filter(g=>g.nodeIds.length);
  if(!state.nodes.some(node=>node.id.startsWith('asset:')))return saved;
  const categories=[['character','角色组'],['scene','场景组'],['prop','道具组']];
  const members=new Set(state.nodes.filter(node=>['character','scene'].includes(node.kind)||node.assetCategory==='prop').map(node=>node.id));
  const projected=categories.map(([id,name])=>{
   const previous=saved.find(group=>group.id===id),{frame,...details}=previous||{};
   const nodeIds=state.nodes.filter(node=>id==='prop'?node.assetCategory==='prop':node.kind===id&&node.assetCategory!=='prop').map(node=>node.id);
   const unchanged=previous?.nodeIds.length===nodeIds.length&&previous.nodeIds.every(nodeId=>nodeIds.includes(nodeId));
   return {...details,id,name:state.referenceGroupNames?.[id]||previous?.name||name,nodeIds,...(unchanged&&frame?{frame}:{})};
  }).filter(group=>group.nodeIds.length);
  const retained=saved.filter(group=>!categories.some(([category,name])=>group.id===category||(group.id.startsWith(category+'-other')&&group.name===name))).map(group=>({...group,nodeIds:group.nodeIds.filter(id=>!members.has(id))})).filter(group=>group.nodeIds.length);
  return [...projected,...retained];
 }
 return [['character','角色组'],['scene','场景组'],['prop','道具组']].map(([id,name])=>({id,name:state.referenceGroupNames?.[id]||name,nodeIds:state.nodes.filter(n=>id==='prop'?n.assetCategory==='prop':n.kind===id&&n.assetCategory!=='prop').map(n=>n.id)})).filter(g=>g.nodeIds.length);
}
/** Move selected memberships to one ordinary group without changing nodes or edges. */
function referenceCreateGroup(state,nodeIds,id){
 const exists=new Set(state.nodes.map(n=>n.id)),ids=[...new Set(nodeIds)].filter(key=>exists.has(key));
 if(ids.length<2)return {ok:false,error:'请选择至少两个节点'};
 const selected=new Set(ids),groups=referenceReadGroups(state).map(g=>({...g,nodeIds:g.nodeIds.filter(key=>!selected.has(key))})).filter(g=>g.nodeIds.length);
 if(groups.some(g=>g.id===id))return {ok:false,error:'分组标识已存在'};
 groups.push({id,name:'新建组',nodeIds:ids});return {ok:true,groups};
}
/** Translate members by one shared delta so snapping never distorts their relative positions. */
function referenceTranslateGroup(positions,dx,dy,snap=false){
 if(!positions.length)return [];
 const deltaX=snap?Math.round((positions[0].x+dx)/20)*20-positions[0].x:dx;
 const deltaY=snap?Math.round((positions[0].y+dy)/20)*20-positions[0].y:dy;
 return positions.map(p=>({id:p.id,x:p.x+deltaX,y:p.y+deltaY}));
}

/** Observed rhTV palette; absent colors retain the earlier project appearance. */
const referenceGroupColors=[
 {id:'gray',name:'灰色',rgb:'100,116,139'}, {id:'red',name:'红色',rgb:'239,68,68'},
 {id:'orange',name:'橙色',rgb:'245,158,11'}, {id:'yellow',name:'黄色',rgb:'234,179,8'},
 {id:'green',name:'绿色',rgb:'204,255,0'}, {id:'cyan',name:'青色',rgb:'6,182,212'},
 {id:'blue',name:'蓝色',rgb:'59,130,246'}, {id:'purple',name:'紫色',rgb:'139,92,246'}
];
/** Update one known group's color without changing memberships or source data. */
function referenceSetGroupColor(state,id,color){
 if(!referenceGroupColors.some(item=>item.id===color))return null;
 const groups=referenceReadGroups(state),group=groups.find(item=>item.id===id);
 if(!group)return null;
 group.color=color;return groups;
}

/** A saved frame is relative to the members' automatic top-left corner. */
function referenceValidGroupFrame(frame){return !!frame&&['dx','dy','width','height'].every(key=>Number.isFinite(frame[key]))&&frame.width>0&&frame.height>0;}
/** Resize one or two edges without moving or rescaling group members. */
function referenceResizeGroupFrame(frame,edge,dx,dy){
 let left=frame.dx,top=frame.dy,right=left+frame.width,bottom=top+frame.height;
 if(edge.includes('w'))left=Math.min(left+dx,right-200);
 if(edge.includes('e'))right=Math.max(right+dx,left+200);
 if(edge.includes('n'))top=Math.min(top+dy,bottom-200);
 if(edge.includes('s'))bottom=Math.max(bottom+dy,top+200);
 return {dx:left,dy:top,width:right-left,height:bottom-top};
}
