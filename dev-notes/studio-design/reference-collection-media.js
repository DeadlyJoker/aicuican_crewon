/* Media inspection uses browser decoding; the original file stays in local storage. */
'use strict';
let referenceCollectionPlayer=null;
function referenceCollectionFileType(file){
 if(['image/png','image/jpeg','image/webp'].includes(file.type))return '图片';
 if(['video/mp4','video/webm'].includes(file.type))return '视频';
 if(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/webm'].includes(file.type))return '音频';
 return null;
}
async function referenceCollectionProbe(file,url,type){
 if(type==='图片'){const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error('无效图片');return {width:image.naturalWidth,height:image.naturalHeight};}
 const media=document.createElement(type==='视频'?'video':'audio');media.preload='metadata';
 try{return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('媒体读取超时')),10000);
  media.onloadedmetadata=()=>{clearTimeout(timer);if(!Number.isFinite(media.duration)||media.duration<=0){reject(new Error('无效媒体时长'));return;}resolve({duration:media.duration,...(type==='视频'?{width:media.videoWidth,height:media.videoHeight}:{})});};
  media.onerror=()=>{clearTimeout(timer);reject(new Error('媒体无法解码'));};media.src=url;
 });}finally{media.removeAttribute('src');media.load();}
}
function referenceCollectionItemHtml(item,manage){
 const image=item.type==='图片',metadata=item.type==='音频'?`${Math.round(item.duration||0)}秒 · 原始音频`:`${item.width} × ${item.height}${item.type==='视频'?' · '+Math.round(item.duration||0)+'秒':' · 原始素材'}`;
 return `<article><button class="ref-collection-preview ${image?'still frame'+item.frame:'ref-collection-media-tile'}" ${image?'data-sb-preview=""':`data-collection-preview="${item.id}"`} data-preview-title="${esc(item.title)}" aria-label="预览 ${esc(item.title)}">${image?'':I(item.type==='视频'?'film':'audio-media')}</button><strong title="${esc(item.title)}">${esc(item.title)}</strong><small>${metadata}</small><button ${manage?`data-collection-remove="${item.id}"`:`data-collection-import="${item.id}"`}>${manage?'移到回收站':'加入画布'}</button></article>`;
}
function referenceCloseCollectionPlayer(){
 const state=referenceCollectionPlayer;if(!state)return;state.root.querySelector('video,audio')?.pause();state.root.remove();state.parent.inert=state.inert;if(currentModal==='媒体预览')currentModal=state.previousModal;referenceCollectionPlayer=null;state.opener?.focus({preventScroll:true});
}
async function referenceOpenCollectionPlayer(item,opener){
 const parent=document.querySelector('.ref-collection-overlay')||document.querySelector('#modal-root > .overlay')||document.querySelector('.ref-vault-shell')||document.getElementById('app');if(!parent)return;
 if(!referenceUploadUrls.has(item.frame))await referenceRestoreUploadedImages();
 const url=referenceUploadUrls.get(item.frame);if(!url||!parent.isConnected){toast('本机媒体文件不可用');return;}
 referenceCloseCollectionPlayer();const root=document.createElement('section');root.className='ref-collection-player'+(item.type==='音频'?' is-audio':'');root.setAttribute('role','dialog');root.setAttribute('aria-label','媒体预览');root.setAttribute('aria-modal','true');
 root.innerHTML=`<header><strong>${esc(item.title)}</strong><button data-collection-player-close aria-label="关闭媒体预览">${I('close')}</button></header><main>${item.type==='音频'?I('audio-media'):''}<${item.type==='视频'?'video':'audio'} controls preload="metadata" src="${esc(url)}" aria-label="${esc(item.title)}"></${item.type==='视频'?'video':'audio'}></main><footer>${item.type} · ${Math.round(item.duration||0)}秒 · 本机原始文件</footer>`;
 if(item.type==='音频'){root.innerHTML='<div class="ref-audio-player-panel">'+root.innerHTML+'</div>';root.addEventListener('click',event=>{if(event.target===root)referenceCloseCollectionPlayer();});}
 referenceCollectionPlayer={root,parent,inert:parent.inert,opener,previousModal:currentModal};currentModal='媒体预览';parent.inert=true;document.body.append(root);root.querySelector('button').focus();
 root.querySelector('button').addEventListener('click',referenceCloseCollectionPlayer);root.querySelector('video,audio').addEventListener('error',()=>{root.querySelector('footer').textContent='媒体无法播放，请检查文件格式';});
}
document.addEventListener('click',event=>{const target=event.target.closest('[data-collection-preview]');if(!target)return;const item=referenceCollectionRead().find(item=>item.id===target.dataset.collectionPreview);if(item)void referenceOpenCollectionPlayer(item,target);});
window.addEventListener('keydown',event=>{if(!referenceCollectionPlayer)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseCollectionPlayer();}if(event.key==='Tab'){const controls=[...referenceCollectionPlayer.root.querySelectorAll('button,video,audio')],index=controls.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1).focus();}else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0].focus();}}},true);

/** Canvas media nodes retain the collected file instead of displaying a simulated result. */
const referenceCollectionNodeHtml=nodeHtml;
nodeHtml=function(node){
 const candidate=studioAdoptedCandidate(node),media=candidate?.localMedia;if(!media)return referenceCollectionNodeHtml(node);
 const url=referenceUploadUrls.get(media.frame),video=media.type==='视频',tag=video?'video':'audio';
 return `<article class="node ref-media-node ref-collected-media ${S.selected===node.id?'selected':''}" tabindex="0" data-node="${node.id}" aria-label="${esc(media.type+' · '+node.title)}" style="left:${node.x}px;top:${node.y}px;width:${node.w}px"><header class="ref-node-name" data-drag="${node.id}">${I(video?'video-media':'audio-media')}<span>${esc(node.title)}</span></header><div class="ref-collected-player">${video?'':I('audio-media')}<${tag} controls preload="metadata" ${url?`src="${esc(url)}"`:''} data-local-media-frame="${media.frame}" aria-label="播放 ${esc(node.title)}"></${tag}></div><footer><span>原始${media.type} · ${Math.round(media.duration)}秒</span><button data-collection-node-preview="${node.id}" aria-label="放大预览 ${esc(node.title)}">${I('fit')}</button></footer><button class="port in" data-port-in="${node.id}" aria-label="连接到${esc(node.title)}"></button><button class="port out" data-port-out="${node.id}" aria-label="从${esc(node.title)}开始连线"></button></article>`;
};
document.addEventListener('click',event=>{const button=event.target.closest('[data-collection-node-preview]');if(!button)return;const node=nodeById(button.dataset.collectionNodePreview),media=node&&studioAdoptedCandidate(node)?.localMedia;if(media)void referenceOpenCollectionPlayer({...media,title:node.title},button);});
for(const type of ['click','pointerdown'])window.addEventListener(type,event=>{if(event.target.closest('[data-local-media-frame]'))event.stopPropagation();},true);
void referenceRestoreUploadedImages().then(()=>{for(const media of document.querySelectorAll('[data-local-media-frame]')){const url=referenceUploadUrls.get(Number(media.dataset.localMediaFrame));if(url&&!media.getAttribute('src'))media.src=url;}});
render();
