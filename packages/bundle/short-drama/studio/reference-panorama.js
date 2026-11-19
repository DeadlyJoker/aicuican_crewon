/* Real spherical viewing stays inside the selected image node and never runs generation. */
'use strict';
let referencePanorama=null;
/** Normalize only view controls; a different image version starts from a neutral camera. */
function referencePanoramaView(saved,candidateId){
 const input=saved?.candidateId===candidateId?saved:{};
 const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
 return {candidateId,yaw:((finite(input.yaw,0)+180)%360+360)%360-180,pitch:Math.max(-85,Math.min(85,finite(input.pitch,0))),hfov:Math.max(15,Math.min(120,finite(input.hfov,90))),ratio:['16:9','9:16','21:9'].includes(input.ratio)?input.ratio:'16:9',mirrored:input.mirrored===true,guides:input.guides===true};
}
function referencePanoramaRemember(state){
 if(!state?.viewer||!state.ready)return;
 Object.assign(state.view,{yaw:state.viewer.getYaw(),pitch:state.viewer.getPitch(),hfov:state.viewer.getHfov()});
 const n=nodeById(state.nodeId);if(state.project!==S.project||n?.adoptedCandidateId!==state.candidateId)return;
 S.nodeDrafts[n.id]??={};S.nodeDrafts[n.id].panoramaView=structuredClone(state.view);save();
 const fov=document.querySelector('[data-panorama-fov]'),fovOutput=document.querySelector('.ref-panorama-fov-value');if(fov)fov.value=String(state.view.hfov);if(fovOutput)fovOutput.textContent=state.view.hfov.toFixed(0);
 const output=state.root?.querySelector('.ref-panorama-camera');if(output)output.textContent=`水平 ${state.view.yaw.toFixed(1)}° · 俯仰 ${state.view.pitch.toFixed(1)}° · 视野 ${state.view.hfov.toFixed(0)}°`;
}
function referencePanoramaDispose(state){
 state.expandedRoot?.remove();state.expandedRoot=null;
 state.epoch++;state.viewer?.destroy();state.viewer=null;state.ready=false;
 if(state.textureUrl)URL.revokeObjectURL(state.textureUrl);state.textureUrl=null;
}
function referenceExitPanorama(){const state=referencePanorama;if(!state)return;referencePanoramaRemember(state);referencePanoramaDispose(state);referencePanorama=null;render();document.querySelector(`[data-node="${CSS.escape(state.nodeId)}"]`)?.focus({preventScroll:true});}
async function referenceInitializePanorama(state){
 const root=document.querySelector('[data-panorama-node]'),viewerRoot=root?.querySelector('.ref-panorama-viewer');if(!root||!viewerRoot||referencePanorama!==state)return;
 state.root=root;const epoch=++state.epoch;
 const fail=message=>{if(referencePanorama!==state||state.epoch!==epoch)return;state.ready=false;const capture=document.querySelector('[data-action="ref-panorama-capture"]');if(capture)capture.disabled=true;root.querySelector('.ref-panorama-notice').textContent=message;root.querySelector('.ref-panorama-notice').setAttribute('role','alert');};
 try{
  if(!state.image){const image=new Image();image.src=state.url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error('原图无法读取');state.image=image;}
  if(referencePanorama!==state||state.epoch!==epoch||!viewerRoot.isConnected)return;
  let textureImage=state.image;
  if(state.view.mirrored){const canvas=document.createElement('canvas');canvas.width=state.image.naturalWidth;canvas.height=state.image.naturalHeight;const context=canvas.getContext('2d');if(!context)throw new Error('当前环境无法镜像图片');context.translate(canvas.width,0);context.scale(-1,1);context.drawImage(state.image,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('镜像图片编码失败');if(referencePanorama!==state||state.epoch!==epoch)return;state.textureUrl=URL.createObjectURL(blob);textureImage=new Image();textureImage.src=state.textureUrl;await textureImage.decode();if(referencePanorama!==state||state.epoch!==epoch)return;}
  const viewer=pannellum.viewer(viewerRoot,{type:'equirectangular',panorama:textureImage,dynamic:true,dynamicUpdate:true,autoLoad:true,showFullscreenCtrl:false,showZoomCtrl:false,showControls:false,keyboardZoom:false,disableKeyboardCtrl:true,mouseZoom:false,doubleClickZoom:false,ignoreGPanoXMP:true,yaw:state.view.yaw,pitch:state.view.pitch,hfov:state.view.hfov,minHfov:15,maxHfov:120,minPitch:-85,maxPitch:85});state.viewer=viewer;
  const loaded=()=>{if(referencePanorama!==state||state.epoch!==epoch)return;state.ready=true;state.viewer.setUpdate(false);const capture=document.querySelector('[data-action="ref-panorama-capture"]');if(capture)capture.disabled=!!state.captureBusy;const full=Math.abs(state.image.naturalWidth/state.image.naturalHeight-2)<.02;root.querySelector('.ref-panorama-notice').textContent=full?'全景取景 · 拖动转向，滚轮缩放':'普通图片投影预览 · 不代表真实全景，可能畸变';referencePanoramaRemember(state);};viewer.on('load',loaded);if(viewer.isLoaded())loaded();
  viewer.on('error',()=>fail('全景查看失败，请确认图片可读取且当前环境支持 WebGL'));
  if(viewerRoot.querySelector('.pnlm-error-msg')?.textContent.trim())fail('全景查看失败，请确认当前环境支持 WebGL');
  for(const event of ['mouseup','touchend','zoomchange','animatefinished'])viewer.on(event,()=>referencePanoramaRemember(state));
  viewerRoot.addEventListener('pointerdown',event=>event.stopPropagation());
  viewerRoot.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();if(state.ready){viewer.setHfov(Math.max(15,Math.min(120,viewer.getHfov()+event.deltaY*.05)),false);referencePanoramaRemember(state);}},{passive:false});
  viewerRoot.addEventListener('keydown',event=>{if(!state.ready)return;const steps={ArrowLeft:[-5,0,0],ArrowRight:[5,0,0],ArrowUp:[0,5,0],ArrowDown:[0,-5,0],'+':[0,0,-5],'-':[0,0,5]},step=steps[event.key];if(!step)return;event.preventDefault();event.stopPropagation();viewer.setYaw(viewer.getYaw()+step[0],false);viewer.setPitch(Math.max(-85,Math.min(85,viewer.getPitch()+step[1])),false);viewer.setHfov(Math.max(15,Math.min(120,viewer.getHfov()+step[2])),false);referencePanoramaRemember(state);});
 }catch(error){fail(error.message||'全景查看器未能启动');}
}
function referenceEnterPanorama(){
 const node=canvasCreationNode(),candidate=node&&studioAdoptedCandidate(node),picture=node&&document.querySelector(`[data-node="${CSS.escape(node.id)}"] .node-media.still`),url=picture&&referenceResultFileUrl(picture);
 if(!candidate||!url||mediaKind(node)!=='image'){toast('请先选择已有图片');return;}
 if(referencePanorama)referencePanoramaDispose(referencePanorama);
 canvasActiveTool=null;referencePanorama={project:S.project,nodeId:node.id,candidateId:candidate.id,url:url.href,view:referencePanoramaView(canvasCreationDraft(node).panoramaView,candidate.id),image:null,viewer:null,root:null,textureUrl:null,epoch:0,ready:false};render();frameCanvasNodeControls();
}
const referencePanoramaNodeHtml=nodeHtml;
nodeHtml=function(n){
 const html=referencePanoramaNodeHtml(n),state=referencePanorama;if(!state||state.nodeId!==n.id||state.expanded)return html;
 return html.replace(/<div class="node-media still[^\"]*"[^>]*><\/div>/,`<div class="node-media ref-panorama-media" data-panorama-node="${n.id}" style="aspect-ratio:${state.view.ratio.replace(':','/')}"><div class="ref-panorama-viewer" role="application" tabindex="0" aria-label="全景取景：${esc(n.title)}" aria-description="方向键转动，滚轮或加减键缩放"></div><div class="ref-panorama-guides" ${state.view.guides?'':'hidden'} aria-hidden="true"></div><span class="ref-panorama-notice">正在加载全景投影</span><output class="ref-panorama-camera"></output></div>`);
};
const referencePanoramaToolbar=canvasContextToolbar;
canvasContextToolbar=function(n){
 const state=referencePanorama;if(state?.nodeId===n.id&&state.expanded)return '';if(state?.nodeId===n.id)return `<div class="selection-toolbar creation-toolbar ref-panorama-toolbar" role="toolbar" aria-label="全景取景操作">${btn('退出','ref-panorama-exit','ghost','arrow')}${btn('重置','ref-panorama-reset','ghost','reset')}<button class="button ghost" data-action="ref-panorama-mirror" aria-pressed="${state.view.mirrored}">镜像</button><button class="button ghost" data-action="ref-panorama-guides" aria-pressed="${state.view.guides}">参考线</button><select aria-label="全景画幅" data-panorama-ratio>${['16:9','9:16','21:9'].map(value=>`<option ${state.view.ratio===value?'selected':''}>${value}</option>`).join('')}</select><button class="button ghost" disabled title="多视角分布尚未核实">4视角截图</button><button class="button ghost" disabled title="多视角分布尚未核实">12视角截图</button>${btn('全屏','ref-panorama-expand','ghost','expand')}</div>`;
 const html=referencePanoramaToolbar(n);if(mediaKind(n)!=='image')return html;
 const menu=`<details class="canvas-tool-menu"><summary role="button" aria-label="全景图">${I('scene')}全景图${I('down')}</summary><div role="menu" aria-label="全景图"><button role="menuitem" disabled title="尚未连接全景生成服务">生成全景图</button><button role="menuitem" data-action="ref-panorama-enter">进入全景</button></div></details>`;
 return html.replace(btn('编辑元素','canvas-tool-open:elements','ghost','layers'),menu+btn('编辑元素','canvas-tool-open:elements','ghost','layers'));
};
/** A page overlay shares the current camera while keeping the canvas node and image intact. */
function referencePanoramaExpandedHtml(state){
 const n=nodeById(state.nodeId);
 return `<section class="ref-panorama-expanded" role="dialog" aria-modal="true" aria-label="全景全屏预览"><div class="ref-panorama-expanded-stage ref-panorama-media" data-panorama-node="${state.nodeId}"><div class="ref-panorama-viewer" role="application" tabindex="0" aria-label="全景取景：${esc(n.title)}" aria-description="拖动环视，滚轮缩放，Escape 返回节点"></div><div class="ref-panorama-guides" ${state.view.guides?'':'hidden'} aria-hidden="true"></div><span class="ref-panorama-notice">正在加载全景投影</span><output class="ref-panorama-camera"></output></div><div class="ref-panorama-expanded-tools" role="toolbar" aria-label="全景全屏操作"><button data-action="ref-panorama-capture" title="保存整个预览视口，尺寸以实际像素为准" ${!state.ready||state.captureBusy?'disabled':''}>截图</button><button disabled title="多视角分布尚未核实">4视角截图</button><button disabled title="多视角分布尚未核实">12视角截图</button><button data-action="ref-panorama-reset">重置</button><button data-action="ref-panorama-mirror" aria-pressed="${state.view.mirrored}">镜像</button><button data-action="ref-panorama-guides" aria-pressed="${state.view.guides}">参考线</button></div><button class="ref-panorama-expanded-close" data-action="ref-panorama-collapse" aria-label="退出全景全屏">${I('close')}</button><label class="ref-panorama-fov">FOV<input type="range" min="15" max="120" step="1" value="${state.view.hfov}" data-panorama-fov aria-label="全景视野"><output class="ref-panorama-fov-value">${state.view.hfov.toFixed(0)}</output></label></section>`;
}
const referencePanoramaRender=render;
render=function(){
 const state=referencePanorama;
 if(state){const n=nodeById(state.nodeId);referencePanoramaRemember(state);referencePanoramaDispose(state);if(S.screen!=='canvas'||S.selected!==state.nodeId||S.project!==state.project||n?.adoptedCandidateId!==state.candidateId)referencePanorama=null;}
 referencePanoramaRender();
 if(referencePanorama?.expanded){document.body.insertAdjacentHTML('beforeend',referencePanoramaExpandedHtml(referencePanorama));referencePanorama.expandedRoot=document.querySelector('.ref-panorama-expanded');}
 if(referencePanorama)requestAnimationFrame(()=>void referenceInitializePanorama(referencePanorama));
};
const referencePanoramaSelectNode=selectNode;
selectNode=function(id,edit=false){
 const state=referencePanorama;
 if(state&&state.nodeId!==id&&nodeById(id)){referencePanoramaRemember(state);referencePanoramaDispose(state);referencePanorama=null;const previous=document.querySelector(`[data-node="${CSS.escape(state.nodeId)}"]`),node=nodeById(state.nodeId);if(previous&&node)previous.outerHTML=nodeHtml(node);}
 referencePanoramaSelectNode(id,edit);
};
const referencePanoramaAction=handleAction;
handleAction=function(action){
 if(action==='ref-panorama-enter'){referenceEnterPanorama();return;}
 if(action==='ref-panorama-exit'){referenceExitPanorama();return;}
 const state=referencePanorama;
 if(state&&action==='ref-panorama-expand'){referencePanoramaRemember(state);state.expanded=true;render();document.querySelector('[data-action="ref-panorama-collapse"]')?.focus({preventScroll:true});return;}
 if(state&&action==='ref-panorama-collapse'){referencePanoramaRemember(state);state.expanded=false;render();frameCanvasNodeControls();document.querySelector('[data-action="ref-panorama-expand"]')?.focus({preventScroll:true});return;}
 if(state&&action==='ref-panorama-reset'){state.viewer?.setYaw(0,false);state.viewer?.setPitch(0,false);state.viewer?.setHfov(90,false);referencePanoramaRemember(state);return;}
 if(state&&action==='ref-panorama-mirror'){referencePanoramaRemember(state);state.view.mirrored=!state.view.mirrored;render();frameCanvasNodeControls();return;}
 if(state&&action==='ref-panorama-guides'){state.view.guides=!state.view.guides;const guides=state.root.querySelector('.ref-panorama-guides');guides.hidden=!state.view.guides;document.querySelector('[data-action="ref-panorama-guides"]').setAttribute('aria-pressed',state.view.guides);referencePanoramaRemember(state);return;}
 referencePanoramaAction(action);
};
document.addEventListener('change',event=>{if(!event.target.matches('[data-panorama-ratio]')||!referencePanorama)return;referencePanoramaRemember(referencePanorama);referencePanorama.view.ratio=event.target.value;render();frameCanvasNodeControls();});
document.addEventListener('input',event=>{const state=referencePanorama;if(!state?.ready||!event.target.matches('[data-panorama-fov]'))return;state.viewer.setHfov(Number(event.target.value),false);referencePanoramaRemember(state);});
document.addEventListener('keydown',event=>{
 const state=referencePanorama;if(!state||currentModal)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(state.expanded)handleAction('ref-panorama-collapse');else referenceExitPanorama();return;}
 if(event.key==='Tab'&&state.expandedRoot){const items=[...state.expandedRoot.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')],first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
},true);
render();
