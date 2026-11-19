/* Named drawing snapshots and portable files remain local to this prototype. */
'use strict';
function referenceBoardPortableRecord(record){return {version:1,mode:record.mode,description:record.description||'',docs:Object.fromEntries(['draw','realtime'].map(mode=>[mode,{json:structuredClone(record.docs[mode].json),history:{items:[],index:-1}}]))};}
function referenceBoardRecordKey(record){
 const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
 return JSON.stringify(ordered(referenceBoardPortableRecord(record)));
}
function referenceReadBoardProject(input){
 if(!input||input.version!==1||!['draw','realtime'].includes(input.mode)||!input.docs||typeof input.description!=='string')return {ok:false,error:'不是受支持的 CrewON 画板工程'};
 const allowed=new Set(['Rect','Ellipse','Triangle','Line','Textbox','Path','Image']);
 const arrayKeys=new Set(['path','strokeDashArray','filters']);
 const colorKeys=new Set(['fill','stroke','backgroundColor','textBackgroundColor']);
 const checkArray=value=>Array.isArray(value)&&value.every(item=>Array.isArray(item)?checkArray(item):typeof item==='string'||(typeof item==='number'&&Number.isFinite(item)));
 const safeKeys=new Set('type version originX originY left top width height fill stroke strokeWidth strokeDashArray strokeLineCap strokeDashOffset strokeLineJoin strokeUniform strokeMiterLimit scaleX scaleY angle flipX flipY opacity shadow visible backgroundColor fillRule paintFirst globalCompositeOperation skewX skewY boardName rx ry radius x1 x2 y1 y2 path text fontSize fontWeight fontFamily fontStyle lineHeight underline overline linethrough textAlign textBackgroundColor charSpacing styles direction minWidth splitByGrapheme pathAlign pathSide pathStartOffset textDecorationThickness cropX cropY crossOrigin filters src'.split(' '));
 const docs={};
 for(const mode of ['draw','realtime']){
  const json=input.docs[mode]?.json;if(!json||!Array.isArray(json.objects)||json.objects.length>1000||typeof json.background!=='string'||/url\s*\(/i.test(json.background))return {ok:false,error:'画板对象或背景数据无效'};
  const objects=[];
  for(const item of json.objects){
   if(!item||!allowed.has(item.type)||(item.type==='Image'&&typeof item.src!=='string'))return {ok:false,error:'工程包含当前不支持的绘图对象'};
   const object={};
   for(const [key,value] of Object.entries(item)){
    if(!safeKeys.has(key))return {ok:false,error:'工程包含当前不支持的对象属性'};
    if(key==='src'){if(typeof value!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(value))return {ok:false,error:'工程图片必须内嵌，不能读取外部地址'};}
    else if(key==='styles'){if(!value||typeof value!=='object'||Object.keys(value).length)return {ok:false,error:'暂不支持带局部文字样式的工程'};}
    else if(key==='shadow'){if(value!==null)return {ok:false,error:'暂不支持带阴影的工程'};}
    else if(arrayKeys.has(key)){if(value!==null&&(!checkArray(value)||(key==='filters'&&value.length)))return {ok:false,error:'工程包含不支持的绘图效果'};}
    else if(value!==null&&!['string','number','boolean'].includes(typeof value))return {ok:false,error:'工程对象数据无效'};
    if(typeof value==='number'&&!Number.isFinite(value))return {ok:false,error:'工程坐标无效'};
    if(colorKeys.has(key)&&typeof value==='string'&&/url\s*\(/i.test(value))return {ok:false,error:'工程颜色不能引用外部资源'};
    object[key]=structuredClone(value);
   }
   objects.push(object);
  }
  docs[mode]={json:{version:'6.9.0',background:json.background,objects},history:{items:[],index:-1}};
 }
 return {ok:true,record:{version:1,mode:input.mode,description:input.description.slice(0,10000),docs}};
}
function referenceBoardProjectStore(items,record,{id,name,cover,updatedAt}){
 const title=name.trim();if(!title||title.length>40)return {ok:false,error:'请填写 1–40 字的工程名称'};
 return {ok:true,items:[{id,name:title,cover,updatedAt,record:referenceBoardPortableRecord(record)},...items.filter(item=>item.id!==id)]};
}
let referenceBoardProjectForm=null;
function referenceBoardProjectsPanel(){
 const root=document.querySelector('.ref-board-overlay');if(!root)return;
 let panel=root.querySelector('.ref-board-project-panel');if(panel){panel.remove();return;}
 panel=document.createElement('aside');panel.className='ref-board-project-panel';panel.setAttribute('aria-label','我的画板工程');panel.innerHTML=`<header>我的工程 <small>${(S.referenceBoardLibrary||[]).length}</small><button data-board-projects-close aria-label="关闭工程列表">${I('close')}</button></header><div>${(S.referenceBoardLibrary||[]).map(item=>`<button data-board-project-load="${esc(item.id)}"><img src="${esc(item.cover)}" alt=""><span>${esc(item.name)}<small>${item.record.mode==='draw'?'2D画板':'实时模式'} · ${esc(new Date(item.updatedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</small></span></button>`).join('')||'<p>暂无已命名工程</p>'}</div><footer><button data-board-project-import>选择文件</button><input type="file" accept=".json,application/json" data-board-project-file hidden></footer>`;root.append(panel);
}
function referenceBoardProjectCover(){const canvas=referenceBoard.canvas.toCanvasElement(),thumb=document.createElement('canvas');thumb.width=320;thumb.height=200;const ctx=thumb.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,320,200);const scale=Math.min(320/canvas.width,200/canvas.height);ctx.drawImage(canvas,(320-canvas.width*scale)/2,(200-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale);return thumb.toDataURL('image/webp',.75);}
function referenceBoardProjectClose(){document.querySelector('.ref-board-switch').hidden=true;referenceBoardProjectForm=null;document.querySelector('[data-board-command="save"]').focus({preventScroll:true});}
function referenceBoardProjectSaveDialog(){
 const board=referenceBoard;if(!board||!referenceBoardSave())return;const current=(S.referenceBoardLibrary||[]).find(item=>item.id===board.record.savedId);
 const cover=referenceBoardProjectCover();referenceBoardProjectForm={mode:'create',current,cover,generatedCover:cover,coverEdited:false};referenceBoardProjectDrawDialog(current?.name||S.project.slice(0,40));
}
function referenceBoardProjectDrawDialog(name){const form=referenceBoardProjectForm,root=document.querySelector('.ref-board-switch');root.hidden=false;root.innerHTML=`<section class="ref-board-save-dialog" role="dialog" aria-label="保存画板工程" aria-modal="true"><nav>${[['create','新建工程'],['update','覆盖原工程']].map(([mode,label])=>`<button data-board-project-mode="${mode}" aria-pressed="${form.mode===mode}" ${mode==='update'&&!form.current?'disabled':''}>${label}</button>`).join('')}<button data-board-project-cancel aria-label="关闭保存工程">${I('close')}</button></nav><div class="ref-board-save-body"><label>工程封面<button class="ref-board-cover" data-board-project-cover><img src="${esc(form.cover)}" alt="工程封面"><span>更换封面</span></button><input type="file" accept="image/png,image/jpeg,image/webp" data-board-cover-file hidden></label><label>工程名称<input aria-label="工程名称" data-board-project-name maxlength="40" value="${esc(name)}" placeholder="输入工程名称"><small>模式：${referenceBoard.mode==='draw'?'2D画板':'实时模式'}</small><small>数据大小：${(new Blob([JSON.stringify(referenceBoardPortableRecord(referenceBoard.record))]).size/1024).toFixed(1)} KB</small></label></div><p class="ref-board-project-error" role="alert"></p><footer><button data-board-project-cancel>取消</button><button data-board-project-save>保存</button></footer></section>`;root.querySelector('[data-board-project-name]').focus();}
async function referenceBoardProjectLoad(record,id,name){
 const board=referenceBoard;if(!board||board.loading)return false;const oldRecord=structuredClone(board.record),oldLibrary=S.referenceBoardLibrary,oldState=S.referenceBoard;
 const library=[...(oldLibrary||[])],portable=referenceBoardPortableRecord(oldRecord);
 if(Object.values(portable.docs).some(doc=>doc.json.objects.length)&&!library.some(item=>referenceBoardRecordKey(item.record)===referenceBoardRecordKey(portable)))library.unshift({id:crypto.randomUUID(),name:(S.project+' · 载入前').slice(0,40),cover:referenceBoardProjectCover(),updatedAt:new Date().toISOString(),record:portable});
 board.record=structuredClone(record);board.record.savedId=id;board.mode=record.mode;
 const ok=await referenceBoardLoad(record.docs[record.mode].json);if(ok===false){board.record=oldRecord;board.mode=oldRecord.mode;await referenceBoardLoad(oldRecord.docs[oldRecord.mode].json);return false;}
 referenceBoardFit();if(!library.some(item=>item.id===id))library.unshift({id,name,cover:referenceBoardProjectCover(),updatedAt:new Date().toISOString(),record:referenceBoardPortableRecord(record)});
 S.referenceBoardLibrary=library;
 if(!referenceBoardSave()){S.referenceBoardLibrary=oldLibrary;S.referenceBoard=oldState;board.record=oldRecord;board.mode=oldRecord.mode;await referenceBoardLoad(oldRecord.docs[oldRecord.mode].json);return false;}
 document.querySelector('.ref-board-overlay').classList.toggle('is-realtime',board.mode==='realtime');document.querySelectorAll('[data-board-mode]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.boardMode===board.mode)));document.querySelector('.ref-board-preview textarea').value=record.description;
 document.querySelector('.ref-board-project-panel')?.remove();referenceBoardProjectClose();referenceBoardSetTool('select');referenceBoardFit();referenceBoardReport('已载入 '+name);return true;
}
window.addEventListener('click',async event=>{
 const target=event.target,root=target.closest('.ref-board-overlay');if(!root||!referenceBoard)return;
 if(!target.closest('.ref-board-project-panel,[data-board-projects]'))root.querySelector('.ref-board-project-panel')?.remove();
 if(target.closest('[data-board-command="save"]')){event.preventDefault();event.stopImmediatePropagation();referenceBoardProjectSaveDialog();return;}
 if(target.closest('[data-board-projects]')){referenceBoardProjectsPanel();return;}
 if(target.closest('[data-board-projects-close]')){root.querySelector('.ref-board-project-panel')?.remove();return;}
 if(target.closest('[data-board-project-import]')){root.querySelector('[data-board-project-file]').click();return;}
 if(target.closest('[data-board-project-cover]')){root.querySelector('[data-board-cover-file]').click();return;}
 if(target.closest('[data-board-project-cancel]')){referenceBoardProjectClose();return;}
 const mode=target.closest('[data-board-project-mode]');if(mode){const name=root.querySelector('[data-board-project-name]').value;referenceBoardProjectForm.mode=mode.dataset.boardProjectMode;if(!referenceBoardProjectForm.coverEdited)referenceBoardProjectForm.cover=mode.dataset.boardProjectMode==='update'?referenceBoardProjectForm.current.cover:referenceBoardProjectForm.generatedCover;referenceBoardProjectDrawDialog(mode.dataset.boardProjectMode==='update'?referenceBoardProjectForm.current.name:name);return;}
 const load=target.closest('[data-board-project-load]');if(load){const item=S.referenceBoardLibrary.find(item=>item.id===load.dataset.boardProjectLoad);referenceBoardProjectForm={load:item};const dialog=root.querySelector('.ref-board-switch');dialog.hidden=false;dialog.innerHTML=`<section role="dialog" aria-label="载入画板工程"><h2>载入 ${esc(item.name)}？</h2><p>当前未收录的画板将保留为“载入前”工程，再载入所选内容。</p><footer><button data-board-project-cancel>取消</button><button data-board-project-confirm-load>载入工程</button></footer></section>`;dialog.querySelector('button').focus();return;}
 if(target.closest('[data-board-project-confirm-load]')){const item=referenceBoardProjectForm.load;await referenceBoardProjectLoad(item.record,item.id,item.name);return;}
 if(target.closest('[data-board-project-save]')){
  const form=referenceBoardProjectForm;if(form.coverLoading)return;const name=root.querySelector('[data-board-project-name]').value,id=form.mode==='update'?form.current.id:crypto.randomUUID(),result=referenceBoardProjectStore(S.referenceBoardLibrary||[],referenceBoard.record,{id,name,cover:form.cover,updatedAt:new Date().toISOString()});
  if(!result.ok){root.querySelector('.ref-board-project-error').textContent=result.error;return;}
  const old=S.referenceBoardLibrary;S.referenceBoardLibrary=result.items;const oldId=referenceBoard.record.savedId;referenceBoard.record.savedId=id;
  if(!referenceBoardSave()){S.referenceBoardLibrary=old;referenceBoard.record.savedId=oldId;root.querySelector('.ref-board-project-error').textContent='保存失败，原工程保留，请导出文件';return;}
  referenceBoardProjectClose();referenceBoardReport('工程已保存：'+name.trim());
 }
},true);
document.addEventListener('change',async event=>{
 const input=event.target;if(!input.matches('[data-board-project-file],[data-board-cover-file]'))return;const file=input.files[0];input.value='';if(!file)return;const board=referenceBoard;
 if(input.matches('[data-board-cover-file]')){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){referenceBoardReport('请选择不超过 5 MB 的封面图片');return;}
  const form=referenceBoardProjectForm;form.coverLoading=true;document.querySelector('[data-board-project-save]').disabled=true;try{const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;canvas.getContext('2d').drawImage(bitmap,0,0,320,200);bitmap.close();if(board!==referenceBoard||form!==referenceBoardProjectForm)return;form.cover=canvas.toDataURL('image/webp',.8);form.coverEdited=true;document.querySelector('.ref-board-cover img').src=form.cover;}catch(error){referenceBoardReport('封面读取失败，请重新选择');}finally{form.coverLoading=false;if(form===referenceBoardProjectForm&&document.querySelector('[data-board-project-save]'))document.querySelector('[data-board-project-save]').disabled=false;}return;
 }
 if(file.size>10*1024*1024){referenceBoardReport('工程文件超过 10 MB，请先精简图片');return;}
 let result;try{result=referenceReadBoardProject(JSON.parse(await file.text()));}catch(error){referenceBoardReport('工程文件无法解析，当前内容未改变');return;}
 if(referenceBoard!==board)return;if(!result.ok){referenceBoardReport(result.error);return;}
 const existing=(S.referenceBoardLibrary||[]).find(item=>referenceBoardRecordKey(item.record)===referenceBoardRecordKey(result.record));referenceBoardProjectForm={load:{id:existing?.id||crypto.randomUUID(),name:existing?.name||file.name.replace(/\.json$/i,''),record:result.record}};
 const dialog=document.querySelector('.ref-board-switch');dialog.hidden=false;dialog.innerHTML=`<section role="dialog" aria-label="导入画板工程"><h2>导入 ${esc(file.name)}？</h2><p>当前画板会先保留到工程列表。文件中的对象与两个模式均会载入，撤销历史重新开始。</p><footer><button data-board-project-cancel>取消</button><button data-board-project-confirm-load>载入工程</button></footer></section>`;dialog.querySelector('button').focus();
});
const referenceOpenBoardWithProjects=referenceOpenBoard;
referenceOpenBoard=async function(){await referenceOpenBoardWithProjects();const root=document.querySelector('.ref-board-overlay');if(!root||root.querySelector('[data-board-projects]'))return;root.insertAdjacentHTML('beforeend','<button class="ref-board-projects-toggle" data-board-projects>我的工程 '+I('down')+'</button>');};

document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-board-project-name]')){event.preventDefault();document.querySelector('[data-board-project-save]').click();}});
