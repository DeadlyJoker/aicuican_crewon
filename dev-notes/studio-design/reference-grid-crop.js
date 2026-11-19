/* Grid cropping is a local file operation; it never starts a generation service. */
'use strict';
let referenceGridCrop=null;
/** Cover every source pixel once, including images not evenly divisible by the grid. */
function referenceGridCropCells(width,height,rows,columns){
 if(![width,height,rows,columns].every(Number.isSafeInteger)||width<1||height<1||rows<1||columns<1||rows>20||columns>20)return {ok:false,error:'行和列请填写 1–20 的整数'};
 if(rows>height||columns>width)return {ok:false,error:'网格数量超出图片像素，请减少行或列'};
 const cells=[];
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const x=Math.floor(col*width/columns),y=Math.floor(row*height/rows);
  cells.push({row,col,x,y,width:Math.floor((col+1)*width/columns)-x,height:Math.floor((row+1)*height/rows)-y});
 }
 return {ok:true,cells};
}
/** Commit all cropped image nodes and their references as one graph edit. */
function referenceCommitGridCrops(state,sourceId,candidateId,records,ids,groupId,position){
 const source=state.nodes.find(n=>n.id===sourceId),candidate=source?.candidates?.find(c=>c.id===candidateId);
 if(!candidate||source.adoptedCandidateId!==candidateId)return {ok:false,error:'原图版本已变化，请重新打开裁剪'};
 if(records.length>1&&referenceReadGroups(state).some(group=>group.id===groupId))return {ok:false,error:'分组标识重复，请重试'};
 if(!records.length||records.length!==ids.length||new Set(ids).size!==ids.length||ids.some(id=>state.nodes.some(n=>n.id===id))||records.some(r=>!Number.isSafeInteger(r.frame)||r.width<1||r.height<1))return {ok:false,error:'裁剪结果不完整，未加入画布'};
 const before=referenceCaptureNodeGraph(state),snapshot=studioAssetSourceSnapshot(source),left=position.x,top=position.y;
 const nodes=records.map((record,index)=>{
  const id=ids[index],title=source.title+' · '+(record.row+1)+'-'+(record.col+1);
  const output={id:id+'-v1',number:1,frame:record.frame,createdAt:new Date().toISOString(),importedFile:record.name,localOperation:'grid-crop',sourceReferences:snapshot?[structuredClone(snapshot)]:[],crop:{sourceId,candidateId,x:record.x,y:record.y,width:record.width,height:record.height}};
  return {id,kind:'image',label:'图片',title,x:left+record.col*330,y:top+record.row*440,w:300,h:356,frame:record.frame,status:'已采用',assetReferences:snapshot?[structuredClone(snapshot)]:[],adoptedCandidateId:output.id,candidates:[output],prompt:'',description:'原图宫格裁剪'};
 });
 state.nodes.push(...nodes);for(const node of nodes){state.edges.push([sourceId,node.id]);if(Array.isArray(state.layoutBase))state.layoutBase.push({id:node.id,x:node.x,y:node.y});}
 if(nodes.length>1){const group=referenceCreateGroup(state,ids,groupId);if(group.ok){group.groups.at(-1).name='宫格裁剪 · '+source.title;state.referenceGroups={version:1,groups:group.groups};}}
 return {ok:true,ids,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
function referenceUpdateGridCrop(){
 const state=referenceGridCrop,root=document.querySelector('.ref-grid-crop-dialog');if(!state||!root)return;
 for(const input of root.querySelectorAll('input,select'))input.disabled=state.busy;
 state.rows=Number(root.querySelector('[data-grid-rows]').value);state.columns=Number(root.querySelector('[data-grid-columns]').value);
 const valid=referenceGridCropCells(state.width||1,state.height||1,state.rows,state.columns),grid=root.querySelector('.ref-grid-lines');
 grid.style.gridTemplateColumns=`repeat(${valid.ok?state.columns:1},1fr)`;grid.style.gridTemplateRows=`repeat(${valid.ok?state.rows:1},1fr)`;
 grid.innerHTML=valid.ok?valid.cells.map((cell,index)=>`<span>${index+1}</span>`).join(''):'';
 root.querySelector('[data-grid-error]').textContent=state.error||(state.width&&!valid.ok?valid.error:'');
 root.querySelector('[data-grid-count]').textContent=valid.ok?'新增 '+valid.cells.length+' 张图片 · 原图保留':'请调整行列';
 root.querySelector('[data-action="grid-crop-commit"]').disabled=!state.width||!valid.ok||state.busy;
}
function referenceOpenGridCrop(){
 const node=canvasCreationNode(),candidate=node&&studioAdoptedCandidate(node),picture=node&&document.querySelector(`[data-node="${CSS.escape(node.id)}"] .still`),url=picture&&referenceResultFileUrl(picture);
 if(!candidate||mediaKind(node)!=='image'||!url){toast('先选择已有图片，再进行宫格裁剪');return;}
 const state={project:S.project,nodeId:node.id,candidateId:candidate.id,url,rows:3,columns:3,width:0,height:0,busy:false,error:''};referenceGridCrop=state;
 showDialog('宫格裁剪',`<div class="ref-grid-crop-layout"><div class="ref-grid-crop-stage"><div class="ref-grid-image"><img src="${esc(url.href)}" alt="${esc(node.title)}裁剪预览"><div class="ref-grid-lines" aria-hidden="true"></div></div></div><aside><label>网格<select aria-label="宫格规格" data-grid-preset><option value="2">4 宫格 · 2×2</option><option value="3" selected>9 宫格 · 3×3</option><option value="4">16 宫格 · 4×4</option><option value="5">25 宫格 · 5×5</option><option value="custom">自定义</option></select></label><div class="ref-grid-dimensions"><label>行<input aria-label="裁剪行数" data-grid-rows type="number" min="1" max="20" step="1" value="3"></label><span>×</span><label>列<input aria-label="裁剪列数" data-grid-columns type="number" min="1" max="20" step="1" value="3"></label></div><small data-grid-size>正在读取图片</small><p data-grid-error role="alert"></p></aside></div>`,`<span class="note" data-grid-count></span>${btn('取消','close-modal','outline')}<button class="button primary" data-action="grid-crop-commit" disabled>裁剪并加入画布</button>`,true);
 const root=document.querySelector('#modal-root .dialog');root.classList.add('ref-grid-crop-dialog');state.root=root;
 const image=root.querySelector('img');image.onload=()=>{if(referenceGridCrop!==state||!root.isConnected)return;state.width=image.naturalWidth;state.height=image.naturalHeight;root.querySelector('.ref-grid-image').style.width=`min(100%,${380*state.width/state.height}px)`;root.querySelector('[data-grid-size]').textContent=state.width+' × '+state.height+' · 本地处理';referenceUpdateGridCrop();};
 image.onerror=()=>{root.querySelector('[data-grid-error]').textContent='图片读取失败，请关闭后重试';};
 referenceUpdateGridCrop();
}
/** Persist all output files in one IndexedDB transaction, never overwriting earlier media. */
async function referenceStoreGridCrops(records){
 const db=await referenceImageDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');for(const record of records)tx.objectStore('images').add({frame:record.frame,blob:record.blob,name:record.name});tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('裁剪图片保存失败，原图保持不变'));tx.onabort=()=>reject(new Error('裁剪图片保存已中断，原图保持不变'));});
}
async function referenceRunGridCrop(){
 const state=referenceGridCrop;if(!state||state.busy||!state.root.isConnected)return;
 const cells=referenceGridCropCells(state.width,state.height,state.rows,state.columns);if(!cells.ok)return;
 state.busy=true;state.error='';referenceUpdateGridCrop();const button=state.root.querySelector('[data-action="grid-crop-commit"]');button.textContent='正在裁剪…';
 let bitmap,stored=false,committed=false,records=[];const ownerState=S;
 try{
  const {blob}=await referenceReadResultImage(state.url);bitmap=await createImageBitmap(blob);const base=Date.now()*1000;
  for(const [index,cell] of cells.cells.entries()){
   if(!state.root.isConnected||S!==ownerState||S.project!==state.project)return;
   const canvas=document.createElement('canvas');canvas.width=cell.width;canvas.height=cell.height;const context=canvas.getContext('2d');if(!context)throw new Error('当前环境无法裁剪图片');context.drawImage(bitmap,cell.x,cell.y,cell.width,cell.height,0,0,cell.width,cell.height);
   const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!output)throw new Error('图片编码失败');
   records.push({...cell,frame:-(base+index),blob:output,name:'crop-'+(cell.row+1)+'-'+(cell.col+1)+'.png'});
  }
  const owner=nodeById(state.nodeId);if(!state.root.isConnected||S!==ownerState||S.project!==state.project||owner?.adoptedCandidateId!==state.candidateId)throw new Error('原图或项目已变化，未加入画布');
  await referenceStoreGridCrops(records);stored=true;
  if(!state.root.isConnected||S!==ownerState||S.project!==state.project)return;
  const result=referenceCommitGridCrops(S,state.nodeId,state.candidateId,records,records.map(()=>studioScriptId('grid-crop')),studioScriptId('crop-group'),studioNewContentPosition(state.columns*330-30,state.rows*440-84));
  if(!result.ok)throw new Error(result.error);
  committed=true;records.forEach(referenceInstallUpload);studioRecordCanvasHistory(result.entry);S.revision++;referenceGridCrop=null;closeDialog();S.selected=result.ids[0];render();revealSelectedNode();save();toast('已裁剪 '+records.length+' 张图片，原图保留');
 }catch(error){state.error=error.message;if(state.root.isConnected)state.root.querySelector('[data-grid-error]').textContent=error.message;else toast(error.message);}
 finally{if(stored&&!committed){try{const db=await referenceImageDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');for(const record of records)tx.objectStore('images').delete(record.frame);tx.oncomplete=resolve;tx.onabort=()=>reject(new Error('清理失败'));});}catch(error){toast('裁剪未加入画布，临时文件清理失败，请重试');}}bitmap?.close();state.busy=false;if(state.root.isConnected){button.textContent='裁剪并加入画布';referenceUpdateGridCrop();}}
}
const referenceGridCropBaseAction=handleAction;
handleAction=function(action){if(action==='grid-crop-open'){referenceOpenGridCrop();return;}if(action==='grid-crop-commit'){void referenceRunGridCrop();return;}referenceGridCropBaseAction(action);};
document.addEventListener('input',event=>{if(event.target.matches('[data-grid-rows],[data-grid-columns]')){document.querySelector('[data-grid-preset]').value='custom';referenceGridCrop.error='';referenceUpdateGridCrop();}});
document.addEventListener('change',event=>{if(!event.target.matches('[data-grid-preset]')||event.target.value==='custom')return;for(const input of referenceGridCrop.root.querySelectorAll('[data-grid-rows],[data-grid-columns]'))input.value=event.target.value;referenceGridCrop.error='';referenceUpdateGridCrop();});
