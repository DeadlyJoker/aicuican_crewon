/* Temporary image inspection leaves adopted assets and the workbench untouched. */
'use strict';
let referenceAssetPreview=null;
function referenceCloseAssetPreview(){
 const state=referenceAssetPreview;if(!state)return;
 state.root.remove();state.parent.inert=state.inert;referenceAssetPreview=null;
 if(state.opener.isConnected)state.opener.focus({preventScroll:true});
}
function referencePaintAssetPreview(){
 const state=referenceAssetPreview;if(!state)return;
 state.image.style.transform=`translate(${state.x}px,${state.y}px) rotate(${state.rotation}deg) scale(${state.zoom*state.flipX},${state.zoom*state.flipY})`;
 state.root.querySelector('[data-preview-command="reset"]').textContent=Math.round(state.zoom*100)+'%';
 const select=state.root.querySelector('[data-preview-zoom]');if(select){const value=state.fitMode?'fit':String(Math.round(state.zoom*100));select.querySelector('[data-preview-current]').textContent=Math.round(state.zoom*100)+'%';select.value=[...select.options].some(option=>option.value===value)?value:'current';}
}
function referenceAssetPreviewCommand(command){
 const s=referenceAssetPreview;if(!s)return;
 if(command==='close'){referenceCloseAssetPreview();return;}
 if(command==='in'||command==='out'){s.fitMode=false;s.zoom=Math.max(0.05,Math.min(4,s.zoom*(command==='in'?1.25:.8)));}
 if(command==='left'||command==='right')s.rotation+=(command==='left'?-90:90);
 if(command==='horizontal')s.flipX*=-1;if(command==='vertical')s.flipY*=-1;
 if(command==='reset')Object.assign(s,{zoom:1,rotation:0,flipX:1,flipY:1,x:0,y:0,fitMode:false});
 if(s.fitMode&&(command==='left'||command==='right')){referenceFitAssetInfo();return;}
 referencePaintAssetPreview();
}
function referenceOpenAssetPreview(opener,info=null,focusOpener=null){
 const source=opener.querySelector('.ref-sb-asset-image')||opener,url=referenceResultFileUrl(source);if(!url){toast('当前素材没有可预览图片');return;}
 referenceCloseAssetPreview();const parent=opener.closest('.ref-wb-asset-overlay,.ref-collection-overlay')||document.querySelector('#modal-root > .overlay')||document.getElementById('app');if(!parent)return;
 const root=document.createElement('div');root.className='ref-asset-lightbox';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','素材大图');
 const controls=[['horizontal','水平翻转',I('preview-triangles-centerline-dashed-vertical')],['vertical','垂直翻转',I('preview-triangles-centerline-dashed-horizontal')],['left','向左旋转',I('preview-rotate-ccw')],['right','向右旋转',I('preview-rotate-cw')],['out','缩小',I('preview-zoom-out')],['reset','恢复原始视图','100%'],['in','放大',I('preview-zoom-in')]];
 root.innerHTML=`<header class="ref-asset-lightbox-header"><span>图片</span><span data-preview-dimensions></span></header><button class="ref-asset-lightbox-close" data-preview-command="close" aria-label="关闭大图" title="关闭大图">${I('close')}</button><div class="ref-asset-lightbox-stage"><img draggable="false" alt="${esc(opener.dataset.previewTitle||'素材')}" src="${esc(url.href)}"></div><div class="ref-asset-lightbox-tools" role="toolbar" aria-label="图片查看工具">${controls.map(([id,label,text])=>`<button data-preview-command="${id}" aria-label="${label}" title="${label}">${text}</button>`).join('')}</div>`;
 referenceAssetPreview={root,parent,inert:parent.inert,opener:focusOpener||(info?(opener.closest('[data-node]')||opener):opener),image:root.querySelector('img'),zoom:1,rotation:0,flipX:1,flipY:1,x:0,y:0,drag:null,info,fitMode:true};parent.inert=true;document.getElementById('modal-root').append(root);
 root.querySelector('[data-preview-command="close"]').focus({preventScroll:true});
 root.querySelector('img').addEventListener('load',event=>{if(referenceAssetPreview?.root!==root)return;root.querySelector('[data-preview-dimensions]').textContent=event.target.naturalWidth+' × '+event.target.naturalHeight;event.target.style.width=event.target.naturalWidth+'px';event.target.style.height=event.target.naturalHeight+'px';referenceFitAssetInfo();});
 if(info)referenceEnhanceAssetInfo(referenceAssetPreview,url);
 root.addEventListener('click',event=>{const button=event.target.closest('[data-preview-command]');if(button)referenceAssetPreviewCommand(button.dataset.previewCommand);else if(event.target.matches('.ref-asset-lightbox-stage'))referenceCloseAssetPreview();});
 root.querySelector('img').addEventListener('dblclick',()=>referenceAssetPreviewCommand('reset'));
 root.addEventListener('wheel',event=>{event.preventDefault();referenceAssetPreviewCommand(event.deltaY<0?'in':'out');},{passive:false});
 root.addEventListener('pointerdown',event=>{if(event.target.tagName!=='IMG'||event.button!==0)return;event.preventDefault();const s=referenceAssetPreview;s.drag={id:event.pointerId,x:event.clientX,y:event.clientY,baseX:s.x,baseY:s.y};event.target.setPointerCapture(event.pointerId);});
 root.addEventListener('pointermove',event=>{const s=referenceAssetPreview,d=s?.drag;if(!d||event.pointerId!==d.id)return;s.x=d.baseX+event.clientX-d.x;s.y=d.baseY+event.clientY-d.y;referencePaintAssetPreview();});
 for(const type of ['pointerup','pointercancel'])root.addEventListener(type,()=>{if(referenceAssetPreview)referenceAssetPreview.drag=null;});
 root.querySelector('img').addEventListener('error',()=>{referenceCloseAssetPreview();toast('图片无法加载，原素材保持不变');});
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-sb-preview]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();referenceOpenAssetPreview(button);},true);
window.addEventListener('keydown',event=>{
 const state=referenceAssetPreview;if(!state)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseAssetPreview();return;}
 if(event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();const buttons=[...state.root.querySelectorAll('button,select')].filter(control=>control.getClientRects().length),i=buttons.indexOf(document.activeElement);buttons[(i+(event.shiftKey?buttons.length-1:1))%buttons.length].focus();}
},true);

/** Read known source metadata without inventing remote generation details. */
function referenceNodeImageInfo(node){
 const candidate=studioAdoptedCandidate(node),settings=candidate?.input?.creationSettings;
 return {title:node.title,source:candidate?.localOperation==='grid-crop'?'本地裁剪':candidate?.importedFile?'本地上传':candidate?.reusedFrom?'复用素材':'本地示例',model:settings?.modelLabel||settings?.modelName||''};
}
function referenceOpenNodeImageInfo(id){
 const node=nodeById(id),element=document.querySelector(`[data-node="${id}"] .node-media`);
 if(!node||!studioAdoptedCandidate(node)||!element){toast('当前节点没有可查看的图片');return;}
 referenceOpenAssetPreview(element,referenceNodeImageInfo(node));
}
function referenceFitAssetInfo(){
 const state=referenceAssetPreview;if(!state?.image.naturalWidth)return;
 const rect=state.root.querySelector('.ref-asset-lightbox-stage').getBoundingClientRect();
 const rotated=Math.abs(state.rotation||0)%180===90,width=rotated?state.image.naturalHeight:state.image.naturalWidth,height=rotated?state.image.naturalWidth:state.image.naturalHeight;
 state.zoom=Math.min(1,Math.max(1,rect.width-24)/width,Math.max(1,rect.height-24)/height);state.fitMode=true;state.x=0;state.y=0;referencePaintAssetPreview();
}
function referenceEnhanceAssetInfo(state,url){
 const {root,info}=state;root.classList.add('ref-asset-info');root.setAttribute('aria-label','图片简介');state.image.alt=info.title;
 root.querySelector('.ref-asset-lightbox-header').innerHTML=`<div class="ref-asset-metadata"><span class="ref-asset-info-name" title="${esc(info.title)}">名称：<strong>${esc(info.title)}</strong></span><span>来源：${esc(info.source)}</span><span>类型：图片</span><span>尺寸：<span data-preview-dimensions>读取中</span></span><span data-preview-file>读取文件信息…</span>${info.model?`<span title="${esc(info.model)}">提交模型：${esc(info.model)}</span>`:''}</div><select data-preview-zoom aria-label="缩放图片"><option value="current" data-preview-current hidden>100%</option><option value="fit">适应</option>${[25,50,75,100,150,200,300,400].map(value=>`<option value="${value}">${value}%</option>`).join('')}</select>`;
 root.querySelector('[data-preview-zoom]').addEventListener('change',event=>{if(event.target.value==='fit'){referenceFitAssetInfo();return;}state.fitMode=false;state.zoom=Number(event.target.value)/100;state.x=0;state.y=0;referencePaintAssetPreview();});
 referenceReadResultImage(url).then(({blob,extension})=>{if(referenceAssetPreview!==state)return;root.querySelector('[data-preview-file]').textContent=`大小：${blob.size<1024*1024?(blob.size/1024).toFixed(1)+' KB':(blob.size/(1024*1024)).toFixed(2)+' MB'}　格式：${extension.toUpperCase()}`;}).catch(error=>{if(referenceAssetPreview===state)root.querySelector('[data-preview-file]').textContent='文件信息不可读取';});
}
window.addEventListener('resize',()=>{if(referenceAssetPreview?.fitMode)referenceFitAssetInfo();});
