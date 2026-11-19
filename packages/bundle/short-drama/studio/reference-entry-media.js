/* Homepage references share the existing local-original store and imported-media canvas nodes. */
'use strict';
const referenceEntryReading=new Set(),referenceEntryErrors=new Map();
function referenceEntryMediaMode(){return ['create','previs','interactive'].includes(S.referenceMode)?S.referenceMode:null;}
function referenceEntryMediaItems(mode){return S.referenceEntryMedia?.[mode]||[];}
function referenceEntryMediaRole(mode,item){
 if(mode!=='create'||referenceEntryKind(S).id!=='video')return '';
 const plan=referenceEntryVideoPlan(S);return plan.roles.find(role=>role.sourceId===item.id)?.role||'未使用';
}
function referenceEntryMediaDisplayItems(state,mode){
 const items=state.referenceEntryMedia?.[mode]||[];
 if(mode!=='create'||referenceEntryKind(state).id!=='video')return items;
 const active=referenceEntryVideoPlan(state).active.map(ref=>ref.sourceId);
 return [...active.map(id=>items.find(item=>item.id===id)).filter(Boolean),...items.filter(item=>!active.includes(item.id))];
}
function referenceEntryMediaHtml(mode){
 const items=referenceEntryMediaDisplayItems(S,mode),error=referenceEntryErrors.get(mode);
 return `<div class="ref-entry-media" aria-label="创作参考">${items.map(item=>`<div class="ref-entry-media-item"><button data-entry-preview="${item.id}" title="${esc(item.title)}" aria-label="预览 ${esc(item.title)}" data-preview-title="${esc(item.title)}">${item.type==='图片'?`<span class="ref-sb-asset-image still frame${item.frame}"></span>`:`<span class="ref-entry-video-icon">${I('film')}</span><small>${Math.round(item.duration)}s</small>`}${referenceEntryMediaRole(mode,item)?`<span class="ref-entry-reference-role">${referenceEntryMediaRole(mode,item)}</span>`:''}</button><button class="ref-entry-media-remove" data-entry-remove="${item.id}" aria-label="移除 ${esc(item.title)}">${I('close')}</button></div>`).join('')}${referenceEntryReading.has(mode)?'<span class="ref-entry-reading" role="status">正在读取参考…</span>':''}</div>${error?`<p class="ref-entry-media-error" role="alert">${esc(error)}</p>`:''}`;
}
function referenceEntryFileError(file){
 const type=referenceCollectionFileType(file);
 if(!['图片','视频'].includes(type))return '请选择 PNG、JPEG、WebP 图片或 MP4、WebM 视频';
 if(file.size>(type==='图片'?20:100)*1024*1024)return type==='图片'?'图片不能超过20 MB':'视频不能超过100 MB';
 return null;
}
async function referenceReadEntryMedia(files,mode){
 if(referenceEntryReading.has(mode))return;
 referenceEntryErrors.delete(mode);referenceEntryReading.add(mode);render();
 try{
  for(const file of files){
   const error=referenceEntryFileError(file);if(error)throw new Error(error);
   const type=referenceCollectionFileType(file),url=URL.createObjectURL(file);
   let metadata;try{metadata=await referenceCollectionProbe(file,url,type);}catch(error){throw new Error('文件无法读取，请换一个文件');}finally{URL.revokeObjectURL(url);}
   let frame=-Date.now();while(referenceUploadUrls.has(frame))frame--;
   await referenceStoreUpload({frame,blob:file,name:file.name});
   const item={id:studioScriptId('entry-reference'),frame,type,title:file.name,...metadata,createdAt:new Date().toISOString()};
   S.referenceEntryMedia??={};const items=S.referenceEntryMedia[mode]??=[];items.push(item);
   try{persist();}catch(error){items.pop();throw new Error('参考未保存，请检查本机存储空间');}
  }
 }catch(error){referenceEntryErrors.set(mode,error.message);}
 finally{referenceEntryReading.delete(mode);if(S.screen==='home')render();}
}
function referenceChooseEntryMedia(mode){
 if(referenceEntryReading.has(mode))return;
 document.getElementById('ref-entry-files')?.remove();const input=document.createElement('input');input.id='ref-entry-files';input.type='file';input.accept='image/png,image/jpeg,image/webp,video/mp4,video/webm';input.multiple=true;input.hidden=true;document.body.append(input);
 input.addEventListener('change',()=>{const files=[...input.files];input.remove();if(files.length)void referenceReadEntryMedia(files,mode);},{once:true});input.click();
}
const referenceEntryMediaHome=home;
home=function(){
 const html=referenceEntryMediaHome(),mode=referenceEntryMediaMode();if(!mode||referenceSection!=='home')return html;
 return html.replace('<div class="ref-input-wrap">',`<div class="ref-input-wrap ${referenceEntryMediaItems(mode).length?'has-entry-media':''}">${referenceEntryMediaHtml(mode)}`).replace(/(<button class="ref-start-button"[^>]*)(>)/,(_,button,end)=>button+(referenceEntryReading.has(mode)&&!button.includes(' disabled')?' disabled':'')+end);
};
const referenceEntryMediaAction=handleAction;
handleAction=function(action){
 const mode=referenceEntryMediaMode();
 if(action==='ref-upload'&&mode&&S.screen==='home'){referenceChooseEntryMedia(mode);return;}
 if(action==='ref-start'&&mode){
  if(referenceEntryReading.has(mode)){toast('请等待参考文件读取完成');return;}
  const items=structuredClone(referenceEntryMediaItems(mode));referenceEntryMediaAction(action);if(S.screen!=='canvas'||!items.length)return;
  const before=referenceCaptureNodeGraph(S),working=structuredClone(S);
  for(const [index,item] of items.entries()){
   const candidate={id:item.id,number:1,frame:item.frame,importedFile:item.title,createdAt:item.createdAt,sourceReferences:[],...(item.type==='视频'?{localMedia:{...item}}:{})};
   const result=referenceVaultImport(working,{project:'创作参考',nodeId:item.id,title:item.title,kind:item.type==='图片'?'image':'video',candidate,canvasSize:{width:284,height:item.type==='图片'?340:250}},studioScriptId('entry-media'),{x:100+index*320,y:500});
   if(!result.ok){toast(result.error);return;}
  }
  const entry=referenceNodeGraphPatch(before,referenceCaptureNodeGraph(working)),commit=referenceRestoreNodeGraph(S,entry.before,entry.after);if(!commit.ok){toast(commit.error);return;}studioRecordCanvasHistory(entry);render();fitCanvas(true);save();return;
 }
 referenceEntryMediaAction(action);
};
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-entry-remove],[data-entry-preview]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();
 const mode=referenceEntryMediaMode(),items=referenceEntryMediaItems(mode),id=button.dataset.entryRemove||button.dataset.entryPreview,item=items.find(value=>value.id===id);if(!item)return;
 if(button.hasAttribute('data-entry-remove')){
  const previous=[...items];S.referenceEntryMedia[mode]=items.filter(value=>value.id!==id);
  try{persist();}catch(error){S.referenceEntryMedia[mode]=previous;toast('移除未保存，请检查本机存储空间');return;}render();return;
 }
 if(item.type==='视频')void referenceOpenCollectionPlayer(item,button);else referenceOpenAssetPreview(button);
},true);
void referenceRestoreUploadedImages().then(()=>{if(S.screen==='home'&&referenceEntryMediaMode())render();});
