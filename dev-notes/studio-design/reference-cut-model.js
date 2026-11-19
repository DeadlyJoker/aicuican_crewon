/* Editable timeline snapshots are independent from the original media and its versions. */
'use strict';
const referenceCutKinds=new Set(['video-compose','quick-cut']);
function referenceCutEmpty(){return {version:1,clips:[],selected:null,playhead:0,zoom:1,ratio:'16:9',collapsed:false,undo:[],redo:[],export:{title:'',resolution:'720P',format:'MP4',fps:'30',audio:true}};}
function referenceCutRead(owner){return owner.editor?.version===1?structuredClone(owner.editor):referenceCutEmpty();}
function referenceCutDuration(editor){return Math.max(0,...editor.clips.map(c=>c.start+c.duration));}
function referenceCutContent(editor){return structuredClone({clips:editor.clips,ratio:editor.ratio,export:editor.export});}
function referenceCutRestore(editor,content){Object.assign(editor,structuredClone(content));if(!editor.clips.some(c=>c.id===editor.selected))editor.selected=null;editor.playhead=Math.min(editor.playhead,referenceCutDuration(editor));}
/** Pin the chosen output, including image placeholders used by earlier Demo projects. */
function referenceCutSourceClip(node,output,id,pending=false){
 const duration=Number(output?.seconds||node.seconds)||5,kind=['voice','audio'].includes(node.kind)?'audio':['image','character','scene'].includes(node.kind)?'image':'video';
 return {id,kind,track:kind==='audio'?'audio':'media',name:pending?'未添加':node.title,start:0,duration,sourceIn:0,sourceDuration:duration,pending,frame:output?.frame??node.frame??0,volume:100,opacity:100,scale:100,x:0,y:0,rotation:0,source:{id:node.id,title:node.title,...(output?{candidateId:output.id,number:output.number}:{}),snapshot:output?structuredClone(output):null}};
}
/** All changing operations validate on a private draft before replacing the saved editor. */
function referenceCutApply(owner,command){
 const editor=referenceCutRead(owner),before=referenceCutContent(editor),clip=editor.clips.find(c=>c.id===(command.id||editor.selected));
 const fail=error=>({ok:false,error});
 if(command.type==='gesture'){
  const preview=referenceCutGesturePreview(editor,command.id||editor.selected,command.spec);if(!preview.ok)return preview;editor.clips=preview.clips;editor.selected=preview.clip.id;
 }else if(command.type==='add'||command.type==='add-at'){
  if(editor.clips.some(c=>c.id===command.clip.id))return fail('片段标识重复');
  const next=structuredClone(command.clip);if(!Number.isFinite(next.duration)||next.duration<=0)return fail('片段时长无效');
  next.start=next.kind==='text'?editor.playhead:Math.max(0,...editor.clips.filter(c=>c.track===next.track).map(c=>c.start+c.duration));editor.clips.push(next);editor.selected=next.id;if(command.type==='add-at'){const placed=referenceCutGesturePreview(editor,next.id,command.spec);if(!placed.ok)return placed;editor.clips=placed.clips;}
 }else if(command.type==='split'){
  if(!clip)return fail('请先选择片段');const at=editor.playhead-clip.start;if(at<.1||clip.duration-at<.1)return fail('请把播放头放在片段内部');
  if(editor.clips.some(c=>c.id===command.newId))return fail('片段标识重复');
  const right={...structuredClone(clip),id:command.newId,start:editor.playhead,sourceIn:clip.sourceIn+at,duration:clip.duration-at};clip.duration=at;editor.clips.splice(editor.clips.indexOf(clip)+1,0,right);editor.selected=right.id;
 }else if(command.type==='delete'){
  if(!clip)return fail('请先选择片段');editor.clips=editor.clips.filter(c=>c.id!==clip.id);editor.selected=null;
 }else if(command.type==='trim'){
  if(!clip)return fail('请先选择片段');const start=Number(command.start),end=Number(command.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end-start<.1||(['video','audio'].includes(clip.kind)&&end>clip.sourceDuration))return fail('入点和出点需位于原素材时长内');
  clip.sourceIn=start;clip.duration=end-start;
 }else if(command.type==='property'){
  if(!clip)return fail('请先选择片段');const numeric={volume:[0,200],opacity:[0,100],scale:[1,400],x:[-4096,4096],y:[-4096,4096],rotation:[-360,360],fontSize:[8,240]};
  if(command.key==='text'){if(clip.kind!=='text')return fail('这个片段没有文本内容');clip.text=String(command.value).slice(0,2000);}
  else if(numeric[command.key]){const value=Number(command.value),[min,max]=numeric[command.key];if(!Number.isFinite(value)||value<min||value>max)return fail('参数超出可编辑范围');clip[command.key]=value;}
  else return fail('暂不支持这项属性');
 }else if(command.type==='move'){
  if(!clip)return fail('请先选择片段');const peers=editor.clips.filter(c=>c.track===clip.track).sort((a,b)=>a.start-b.start),at=peers.findIndex(c=>c.id===clip.id),target=at+command.direction;
  if(![-1,1].includes(command.direction)||target<0||target>=peers.length)return {ok:true,changed:false};
  [peers[at],peers[target]]=[peers[target],peers[at]];let time=0;for(const c of peers){c.start=time;time+=c.duration;}
 }else if(command.type==='ratio'){
  if(!['16:9','9:16','1:1','4:3'].includes(command.value))return fail('请选择支持的画幅');editor.ratio=command.value;
 }else return fail('未知剪辑操作');
 const after=referenceCutContent(editor);if(JSON.stringify(before)===JSON.stringify(after))return {ok:true,changed:false};
 editor.undo.push(before);editor.undo=editor.undo.slice(-40);editor.redo=[];owner.editor=editor;return {ok:true,changed:true};
}
function referenceCutReplay(owner,redo=false){
 const editor=referenceCutRead(owner),source=redo?editor.redo:editor.undo,target=redo?editor.undo:editor.redo;
 if(!source.length)return {ok:false,error:redo?'没有可重做的剪辑操作':'没有可撤销的剪辑操作'};
 const next=source.pop();target.push(referenceCutContent(editor));referenceCutRestore(editor,next);owner.editor=editor;return {ok:true};
}
/** Create a separate owner instead of replacing the source or an earlier timeline. */
function referenceCutCreateNode(state,kind,source,output,id,position){
 if(!referenceCutKinds.has(kind)||state.nodes.some(n=>n.id===id))return {ok:false,error:'无法创建剪辑节点'};
 const before=referenceCaptureNodeGraph(state),editor=referenceCutEmpty(),title=kind==='video-compose'?'视频合成':'快捷剪辑';
 if(source&&(output||kind==='quick-cut'))editor.clips.push(referenceCutSourceClip(source,output,id+'-clip',!output));
 const n={id,kind,title,label:title,status:'草稿',x:position.x,y:position.y,w:kind==='video-compose'?756:1008,h:kind==='video-compose'?598:230,editor};state.nodes.push(n);if(source)state.edges.push([source.id,id]);
 return {ok:true,changed:true,id,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
