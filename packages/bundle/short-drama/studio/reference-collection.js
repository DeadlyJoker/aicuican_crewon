/* Local collection originals are independent of project nodes and curated assets. */
'use strict';
const referenceCollectionKey='crewon-studio-collection-v1';
let referenceCollectionState={query:'',type:'全部类型',manage:false,opener:null,busy:false};
function referenceCollectionRead(){
 const raw=studioStorage.getItem(referenceCollectionKey);if(!raw)return [];
 const items=JSON.parse(raw);if(!Array.isArray(items)||items.some(item=>!item||typeof item.id!=='string'||typeof item.title!=='string'||!['图片','视频','音频'].includes(item.type)||!Number.isFinite(item.frame)))throw new Error('收集箱记录无法读取');return items;
}
function referenceCollectionWrite(items){studioStorage.setItem(referenceCollectionKey,JSON.stringify(items));}
function referenceCollectionVisible(items,query,type){return items.filter(item=>!item.removedAt&&(type==='全部类型'||item.type===type)&&item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));}
function referenceCollectionClose(){document.querySelector('.ref-collection-overlay')?.remove();if(currentModal==='收集箱')currentModal=null;referenceCollectionState.opener?.focus({preventScroll:true});}
function referenceCollectionRender(){
 let items;try{items=referenceCollectionRead();}catch(error){toast(error.message);return;}
 const p=referenceCollectionState,list=referenceCollectionVisible(items,p.query,p.type),removed=items.filter(item=>item.removedAt);
 document.querySelector('.ref-collection-overlay')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="ref-collection-overlay"><section class="ref-collection" role="dialog" aria-modal="true" aria-label="收集箱" aria-busy="${p.busy}"><header><h2>收集箱</h2><label>${I('search')}<input aria-label="搜索收集箱" placeholder="搜索收集箱" value="${esc(p.query)}" data-collection-search></label><button aria-label="关闭收集箱" data-collection-close>${I('close')}</button></header><nav aria-label="收集类型">${['全部类型','图片','视频','音频'].map(type=>`<button aria-pressed="${p.type===type}" data-collection-type="${type}">${type}</button>`).join('')}<span></span><button aria-pressed="${p.manage}" data-collection-manage>${I('settings')}${p.manage?'取消':'管理'}</button><button data-collection-upload ${p.busy?'disabled':''}>${I('upload')}${p.busy?'正在导入':'本地上传'}</button><input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm" data-collection-file hidden></nav><div class="ref-collection-content">${list.length?`<div class="ref-collection-grid">${list.map(item=>referenceCollectionItemHtml(item,p.manage)).join('')}</div>`:`<div class="ref-collection-empty">${I('image')}<h3>${p.query?'没有匹配的素材':p.type==='全部类型'?'开始收集灵感吧':'暂无'+p.type}</h3><p>${p.query?'试试其他关键词':'上传图片、视频或音频，保留原始文件，在此预览。'}</p><button data-collection-upload ${p.busy?'disabled':''}>${p.busy?'正在导入':'本地上传'}</button></div>`}</div><footer><span>素材仅保存在本机浏览器 · 网页采集扩展尚未接入</span>${removed.length?`<button data-collection-restore>恢复已移除的 ${removed.length} 项</button>`:''}<span class="ref-collection-error" role="alert"></span></footer></section></div>`);
}
async function referenceCollectionUpload(file){
 const p=referenceCollectionState;if(p.busy)return;
 const fail=message=>{const target=document.querySelector('.ref-collection-error');if(target)target.textContent=message;else toast(message);};
 const type=referenceCollectionFileType(file);if(!type){fail('支持 PNG/JPEG/WebP、MP4/WebM、MP3/WAV/OGG');return;}
 if(file.size>(type==='图片'?20:100)*1024*1024){fail(type==='图片'?'图片不能超过20 MB':'视频或音频不能超过100 MB');return;}
 p.busy=true;referenceCollectionRender();const url=URL.createObjectURL(file);let record,stored=false,committed=false;
 try{
  const metadata=await referenceCollectionProbe(file,url,type);
  const item={id:studioRandomUUID(),frame:-Date.now(),type,title:file.name,...metadata,createdAt:new Date().toISOString()};
  record={frame:item.frame,blob:file,name:file.name};await referenceStoreGridCrops([record]);stored=true;
  const items=referenceCollectionRead();items.push(item);referenceCollectionWrite(items);committed=true;referenceInstallUpload(record);p.type='全部类型';p.query='';
 }catch(error){let message=committed?'素材已保存，预览加载失败，请重新打开收集箱':'导入失败，请检查文件格式或本机存储空间';if(stored&&!committed)try{await referenceRemoveUncommittedImages([record.frame]);}catch(cleanupError){message='导入未完成，临时文件清理失败，请检查本机存储空间';}p.busy=false;if(document.querySelector('.ref-collection-overlay'))referenceCollectionRender();fail(message);return;}
 finally{URL.revokeObjectURL(url);p.busy=false;}
 if(document.querySelector('.ref-collection-overlay'))referenceCollectionRender();
}
function referenceCollectionImport(item){
 const captured={id:item.id,collectionSource:{itemId:item.id,name:item.title},project:'收集箱',nodeId:item.id,kind:item.type==='图片'?'image':item.type==='视频'?'video':'audio',title:item.title,canvasSize:{width:380,height:item.type==='图片'?436:item.type==='视频'?290:190},candidate:{id:item.id,number:1,frame:item.frame,...(item.type==='图片'?{}:{localMedia:{frame:item.frame,type:item.type,duration:item.duration,width:item.width,height:item.height}}),importedFile:item.title,createdAt:item.createdAt,sourceReferences:[]}};
 if(S.screen!=='canvas'){toast('请在目标项目的画布中打开收集箱，再加入素材');return;}
 const result=referenceVaultImport(S,captured,studioScriptId('collection-copy'),referenceVaultImportPosition(captured));if(!result.ok){toast(result.error);return;}
 studioRecordCanvasHistory(result.entry);S.revision++;S.selected=result.id;S.panel=null;referenceCollectionClose();render();revealSelectedNode();save();toast('已加入画布，收集箱原素材保留');
}
const referenceCollectionBaseAction=handleAction;
handleAction=function(action){if(action==='collection-inbox'){referenceCollectionState.opener=document.activeElement;referenceCollectionRender();if(document.querySelector('.ref-collection-overlay'))currentModal='收集箱';document.querySelector('[data-collection-search]')?.focus();return;}referenceCollectionBaseAction(action);};
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-collection-close],[data-collection-type],[data-collection-manage],[data-collection-upload],[data-collection-import],[data-collection-remove],[data-collection-restore]');if(!target)return;event.preventDefault();event.stopPropagation();
 if(target.hasAttribute('data-collection-close')){referenceCollectionClose();return;}
 if(target.hasAttribute('data-collection-upload')){document.querySelector('[data-collection-file]').click();return;}
 try{
  const items=referenceCollectionRead();
  if(target.dataset.collectionImport){const item=items.find(i=>i.id===target.dataset.collectionImport&&!i.removedAt);if(item)referenceCollectionImport(item);return;}
  if(target.dataset.collectionRemove){const item=items.find(i=>i.id===target.dataset.collectionRemove);if(item)item.removedAt=new Date().toISOString();referenceCollectionWrite(items);}
  if(target.hasAttribute('data-collection-restore')){for(const item of items)delete item.removedAt;referenceCollectionWrite(items);}
  if(target.dataset.collectionType)referenceCollectionState.type=target.dataset.collectionType;
  if(target.hasAttribute('data-collection-manage'))referenceCollectionState.manage=!referenceCollectionState.manage;
  referenceCollectionRender();
 }catch(error){toast('收集箱保存失败，原始文件仍保留在本机');}
});
document.addEventListener('input',event=>{if(!event.target.matches('[data-collection-search]'))return;const position=event.target.selectionStart;referenceCollectionState.query=event.target.value;referenceCollectionRender();const input=document.querySelector('[data-collection-search]');input.focus();input.setSelectionRange(position,position);});
document.addEventListener('change',event=>{if(event.target.matches('[data-collection-file]')&&event.target.files[0])void referenceCollectionUpload(event.target.files[0]);});
document.addEventListener('keydown',event=>{const panel=document.querySelector('.ref-collection');if(!panel)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCollectionClose();}if(event.key==='Tab'){const fields=[...panel.querySelectorAll('button:not(:disabled),input:not([hidden])')],index=fields.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();fields.at(-1)?.focus();}else if(!event.shiftKey&&index===fields.length-1){event.preventDefault();fields[0]?.focus();}}},true);
