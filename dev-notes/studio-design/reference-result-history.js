/* Result history reads retained candidates; edit history remains owned by the project log. */
'use strict';
let referenceResultTab='image',referenceResultOpener=null,referenceResultPreviewIndex=null;
const referenceResultScrolls={};
let referenceResultBatch=false,referenceResultArchived=false,referenceResultSelected=new Set(),referenceResultDownloading=false;
function referenceResultEntries(state){
 const projects=new Map(Object.values(state.projectDrafts||{}).map(p=>[p.project,p]));projects.set(state.project,state);
 const results=[];
 for(const [project,draft] of projects)for(const node of draft.nodes||[])for(const candidate of node.candidates||[]){
  const kind=candidate.kind||node.kind,type=['video','shot'].includes(kind)?'video':['voice','audio'].includes(kind)?'audio':['image','character','scene'].includes(kind)?'image':null;
  if(type)results.push({key:JSON.stringify([project,node.id,candidate.id]),project,nodeId:node.id,title:node.title,type,kind:node.kind,canvasSize:{width:node.w,height:node.h},candidate:structuredClone(candidate)});
 }
 return results.sort((a,b)=>String(b.candidate.createdAt||'').localeCompare(String(a.candidate.createdAt||'')));
}
function referenceMoveResultRecords(state,keys,remove){
 const known=new Set(referenceResultEntries(state).map(item=>item.key)),hidden=new Set(state.referenceHiddenResults||[]);
 for(const key of keys)if(known.has(key)){if(remove)hidden.add(key);else hidden.delete(key);}
 state.referenceHiddenResults=[...hidden];
}
function referenceResultFileUrl(element){
 const match=getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/);if(!match)return null;
 const url=new URL(match[1],location.href);return url.origin===location.origin?url:null;
}
/** Resolve original image formats without using a blob URL's opaque id as an extension. */
function referenceResultImageExtension(url,mime){
 const known={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
 const type=(mime||'').split(';')[0].trim().toLowerCase();if(known[type])return known[type];
 const match=url.pathname.match(/\.(png|jpe?g|webp|gif|avif)$/i);
 return match?match[1].toLowerCase().replace('jpeg','jpg'):null;
}
/** Read only a local retained image and preserve its bytes for download. */
async function referenceReadResultImage(url){
 const response=await fetch(url);if(!response.ok)throw new Error('图片不可读取');
 const blob=await response.blob(),extension=referenceResultImageExtension(url,blob.type);
 if(!extension)throw new Error('无法识别本地图片格式');
 return {blob,extension};
}
function referenceResultImageFilename(title,number,extension){return title.replace(/[\\/:*?"<>|]/g,'_').replace(/\.(png|jpe?g|webp|gif|avif)$/i,'')+'-v'+number+'.'+extension;}
/** Preserve old records whose local image reference cannot be resolved. */
/** Download retained image bytes without rendering or converting the source. */
async function referenceDownloadResultImage(url,title,number){
 const {blob,extension}=await referenceReadResultImage(url),downloadUrl=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=downloadUrl;link.download=referenceResultImageFilename(title,number,extension);link.click();setTimeout(()=>URL.revokeObjectURL(downloadUrl),1000);
}
let referenceNodeImageDownloading=false;
/** Capture the adopted version before awaiting the file read; repeated clicks share one download. */
async function referenceDownloadNodeImage(id){
 if(referenceNodeImageDownloading)return;
 const node=nodeById(id),candidate=node&&studioAdoptedCandidate(node),image=document.querySelector(`[data-node="${id}"] .node-media.still`),url=image&&referenceResultFileUrl(image);
 if(!candidate||!url){toast('当前节点没有可下载的本地图片');return;}
 referenceNodeImageDownloading=true;const button=document.querySelector('[data-action="canvas-creation-image-download"]');if(button)button.disabled=true;
 try{await referenceDownloadResultImage(url,node.title,candidate.number);}catch(error){toast(error.message||'图片下载失败，原结果已保留');}
 finally{referenceNodeImageDownloading=false;if(button?.isConnected)button.disabled=false;}
}
function referenceMarkMissingResultImages(root){
 for(const image of root.querySelectorAll('.ref-result-picture .still,.ref-result-large'))image.classList.toggle('is-missing',getComputedStyle(image).backgroundImage==='none');
}
/** Retained local media has a playable file, not a simulated image preview. */
function referenceResultPicture(item){
 const media=item.candidate.localMedia;
 if(media)return `<span class="ref-result-file-placeholder">${I(media.type==='视频'?'film':'audio-media')}<small>原始${media.type} · ${Math.round(media.duration)}秒</small></span>`;
 return `<span class="still frame${item.candidate.frame}"><span class="ref-result-missing">${I('image')}<small>预览不可用</small></span></span>${item.type!=='image'?I(item.type==='video'?'film':'audio-media'):''}`;
}
function referenceResultHistory(){
 const all=referenceResultEntries(S),indices=new Map(all.map((item,index)=>[item.key,index])),items=all.filter(item=>item.type===referenceResultTab&&(S.referenceHiddenResults||[]).includes(item.key)===referenceResultArchived),dates=new Map();
 for(const item of items){const date=item.candidate.createdAt?.slice(0,10)||'较早记录';if(!dates.has(date))dates.set(date,[]);dates.get(date).push(item);}
 const root=showDialog('生成历史',`<div class="ref-result-tabs" role="tablist" aria-label="生成历史类型">${[['image','图片历史'],['video','视频历史'],['audio','音频历史']].map(([type,label])=>`<button role="tab" aria-selected="${referenceResultTab===type}" data-result-tab="${type}">${label}</button>`).join('')}<button disabled title="尚无此类结果">3D 世界</button><button disabled title="尚无此类结果">3D 模型</button></div><div class="ref-result-batch-tools"><button data-result-batch>${referenceResultBatch?'退出批量':'批量操作'}</button><button data-result-archived aria-pressed="${referenceResultArchived}">${referenceResultArchived?'返回历史':'已移除记录'}</button>${referenceResultBatch?`<span>已选 ${referenceResultSelected.size} 项</span><button data-result-select-all>全选当前列表</button><button data-result-select-none>清空已选</button><button data-result-zip ${!referenceResultSelected.size||referenceResultTab!=='image'||referenceResultDownloading?'disabled':''}>${referenceResultDownloading?'打包中…':'下载图片包'}</button><button data-result-remove ${referenceResultSelected.size?'':'disabled'}>${referenceResultArchived?'恢复记录':'移除记录'}</button>`:''}</div><div class="ref-result-list">${[...dates].map(([date,rows])=>`<section><h3>${date}</h3><div class="ref-result-grid">${rows.map(item=>{const index=indices.get(item.key);return `<article data-result-index="${index}" class="${referenceResultBatch?'is-batch':''} ${referenceResultSelected.has(item.key)?'is-selected':''}">${referenceResultBatch?`<input type="checkbox" aria-label="选择${esc(item.title)} v${item.candidate.number}" ${referenceResultSelected.has(item.key)?'checked':''} data-result-select="${index}">`:''}<button class="ref-result-picture" data-result-preview="${index}" aria-label="查看${esc(item.title)} v${item.candidate.number}">${referenceResultPicture(item)}</button><div><strong>${esc(item.title)} <small>v${item.candidate.number}</small></strong><small>${esc(item.project)}</small></div><footer><button data-result-preview="${index}" aria-label="查看" title="查看">${I('eye')}</button><button data-result-use="${index}" aria-label="使用" title="使用">${I('plus')}</button><button data-result-copy="${index}" aria-label="复制提示词" title="复制提示词" ${item.candidate.prompt?'':'disabled'}>${I('copy')}</button>${item.type==='image'?`<button data-result-download="${index}" aria-label="下载图片" title="下载图片">${I('download')}</button>`:''}</footer></article>`}).join('')}</div></section>`).join('')||'<p class="ref-result-empty">暂无历史记录</p>'}</div>`, '<span class="ref-result-note">本机保留的候选与原始素材 · 未连接生成服务</span>');
 root.querySelector('.dialog').classList.add('ref-result-dialog');
 const header=root.querySelector('.dialog-header'),close=header.querySelector('button');header.insertBefore(root.querySelector('.ref-result-tabs'),close);header.insertBefore(root.querySelector('.ref-result-batch-tools'),close);
 referenceMarkMissingResultImages(root);
 root.querySelector('.ref-result-list').scrollTop=referenceResultScrolls[referenceResultTab]||0;modalOpener=referenceResultOpener;
}
function referenceResultPreview(index){
 const item=referenceResultEntries(S)[index];if(!item)return;referenceResultPreviewIndex=index;
 if(item.candidate.localMedia){void referenceOpenCollectionPlayer({...item.candidate.localMedia,title:item.title},document.activeElement);return;}
 const c=item.candidate,root=showDialog(item.title+' · v'+c.number,`<div class="ref-result-detail"><div class="ref-result-large still frame${c.frame}" role="img" aria-label="${esc(item.title)}的示例画面"><span class="ref-result-missing">${I('image')}<small>预览不可用</small></span></div><aside><dl><dt>来源项目</dt><dd>${esc(item.project)}</dd><dt>记录时间</dt><dd>${esc(c.createdAt||'旧记录未保存时间')}</dd><dt>提示词</dt><dd>${esc(c.prompt||'该历史没有提示词')}</dd></dl>${item.type!=='image'?'<p>当前为示例画面，无真实音视频播放文件。</p>':''}</aside></div>`,btn('返回历史','result-history-back','outline'));
 root.querySelector('.dialog').classList.add('ref-result-preview-dialog');referenceMarkMissingResultImages(root);
}
const referenceResultBaseAction=handleAction;
handleAction=function(action){if(action==='result-history'){referenceResultOpener=document.activeElement;referenceResultHistory();return;}if(action==='result-history-back'){referenceResultHistory();document.querySelector(`[data-result-preview="${referenceResultPreviewIndex}"]`)?.focus({preventScroll:true});return;}referenceResultBaseAction(action);};
document.addEventListener('click',async event=>{
 const target=event.target.closest('[data-result-tab],[data-result-preview],[data-result-use],[data-result-copy],[data-result-download]');if(!target)return;
 if(target.dataset.resultTab){referenceResultTab=target.dataset.resultTab;referenceResultSelected.clear();referenceResultHistory();return;}
 if(target.dataset.resultPreview!==undefined){referenceResultPreview(Number(target.dataset.resultPreview));return;}
 const index=Number(target.dataset.resultUse??target.dataset.resultCopy??target.dataset.resultDownload),item=referenceResultEntries(S)[index];if(!item)return;
 if(target.dataset.resultDownload!==undefined){
  const image=target.closest('article').querySelector('.still'),url=image&&referenceResultFileUrl(image);
  if(!url){toast('这条历史没有可下载的本地图片');return;}
  target.disabled=true;
  try{
   await referenceDownloadResultImage(url,item.title,item.candidate.number);
  }catch(error){toast(error.message||'图片下载失败，历史记录已保留');}
  finally{target.disabled=false;}
  return;
 }
 if(target.dataset.resultCopy!==undefined){navigator.clipboard.writeText(item.candidate.prompt).then(()=>toast('已复制提示词')).catch(()=>toast('复制失败，请在详情中选择提示词'));return;}
 const result=referenceVaultImport(S,item,studioScriptId('history-copy'),referenceVaultImportPosition(item));if(!result.ok){toast(result.error);return;}
 studioRecordCanvasHistory(result.entry);S.revision++;S.selected=result.id;closeDialog();render();revealSelectedNode();save();toast('已将独立副本加入画布');
});

document.addEventListener('scroll',event=>{if(event.target.matches?.('.ref-result-list'))referenceResultScrolls[referenceResultTab]=event.target.scrollTop;},true);

document.addEventListener('click',async event=>{
 const control=event.target.closest('[data-result-batch],[data-result-archived],[data-result-select-all],[data-result-select-none],[data-result-zip],[data-result-remove],[data-result-select]');
 const preview=referenceResultBatch&&event.target.closest('[data-result-preview]');if(!control&&!preview)return;
 event.preventDefault();event.stopImmediatePropagation();
 const visible=referenceResultEntries(S).filter(item=>item.type===referenceResultTab&&(S.referenceHiddenResults||[]).includes(item.key)===referenceResultArchived);
 if(preview||control?.hasAttribute('data-result-select')){const index=Number(preview?.dataset.resultPreview??control.dataset.resultSelect),item=referenceResultEntries(S)[index];if(item){referenceResultSelected.has(item.key)?referenceResultSelected.delete(item.key):referenceResultSelected.add(item.key);}}
 if(control?.hasAttribute('data-result-batch')){referenceResultBatch=!referenceResultBatch;referenceResultSelected.clear();}
 if(control?.hasAttribute('data-result-archived')){referenceResultArchived=!referenceResultArchived;referenceResultSelected.clear();}
 if(control?.hasAttribute('data-result-select-all'))referenceResultSelected=new Set(visible.map(item=>item.key));
 if(control?.hasAttribute('data-result-select-none'))referenceResultSelected.clear();
 if(control?.hasAttribute('data-result-remove')){referenceMoveResultRecords(S,referenceResultSelected,!referenceResultArchived);referenceResultSelected.clear();persist();}
 if(control?.hasAttribute('data-result-zip')){
  if(referenceResultDownloading)return;const chosen=visible.filter(item=>referenceResultSelected.has(item.key));
  const files=chosen.map((item,index)=>{const card=document.querySelector(`[data-result-index="${referenceResultEntries(S).findIndex(x=>x.key===item.key)}"]`);return {item,index,url:referenceResultFileUrl(card.querySelector('.still'))};});
  if(files.some(file=>!file.url)){toast('部分记录没有本地图片，未开始下载');return;}
  referenceResultDownloading=true;referenceResultHistory();
  try{const archive={};for(const {item,index,url} of files){const {blob,extension}=await referenceReadResultImage(url);archive[`${String(index+1).padStart(3,'0')}-${referenceResultImageFilename(item.title,item.candidate.number,extension)}`]=new Uint8Array(await blob.arrayBuffer());}const bytes=fflate.zipSync(archive,{level:0}),url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),link=document.createElement('a');link.href=url;link.download='CrewON-历史图片.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  catch(error){toast('图片打包失败，记录与选择已保留');}
  finally{referenceResultDownloading=false;if(document.querySelector('.ref-result-list'))referenceResultHistory();}return;
 }
 referenceResultHistory();
},true);
