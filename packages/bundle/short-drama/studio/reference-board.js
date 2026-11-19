/* Local Fabric.js drawing study; no generation requests leave the browser. */
'use strict';
let referenceBoard=null;
fabric.FabricObject.customProperties=[...new Set([...fabric.FabricObject.customProperties,'boardName'])];
function referenceBoardHistoryPush(history,json){
 if(history.items[history.index]===json)return false;
 history.items=history.items.slice(0,history.index+1);history.items.push(json);history.items=history.items.slice(-30);history.index=history.items.length-1;return true;
}
function referenceBoardDocument(){return {json:{version:'6.9.0',objects:[],background:'#0b0b0b'},history:{items:[],index:-1}};}
function referenceBoardReport(message){const el=document.querySelector('.ref-board-notice');if(el){el.textContent=message;el.title=message;}}
function referenceBoardSave(){
 const board=referenceBoard;if(!board||board.loading)return false;
 const json=board.canvas.toJSON(),old=S.referenceBoard;
 board.record.docs[board.mode].json=json;referenceBoardHistoryPush(board.record.docs[board.mode].history,JSON.stringify(json));
 S.referenceBoard=structuredClone(board.record);
 let saved=true;try{persist();referenceBoardReport('已保存到本机');}
 catch(error){S.referenceBoard=old;saved=false;referenceBoardReport('保存失败，请导出工程以保留当前内容');}
 referenceBoardLayers();return saved;
}
function referenceBoardLayers(){
 const board=referenceBoard;if(!board)return;
 const objects=board.canvas.getObjects(),selected=board.canvas.getActiveObjects();
 document.querySelector('.ref-board-layer-list').innerHTML=objects.slice().reverse().map(object=>{const i=objects.indexOf(object),label=object.boardName||({rect:'矩形',ellipse:'椭圆',triangle:'三角形',line:'线条',path:'画笔',textbox:'文本',image:'图片'}[object.type.toLowerCase()]||'对象');return `<div><button data-board-layer="${i}" aria-pressed="${selected.includes(object)}">${esc(label)}</button><button data-board-visible="${i}" aria-label="${object.visible?'隐藏':'显示'}${esc(label)}">${I(object.visible?'eye':'minus')}</button></div>`;}).join('')||'<p>画布中还没有对象</p>';
 for(const button of document.querySelectorAll('[data-board-command="undo"],[data-board-command="redo"],[data-board-command="delete"]'))button.disabled=button.dataset.boardCommand==='delete'?!selected.length:button.dataset.boardCommand==='undo'?board.record.docs[board.mode].history.index<=0:board.record.docs[board.mode].history.index>=board.record.docs[board.mode].history.items.length-1;
}
function referenceBoardSetTool(tool){
 const board=referenceBoard;if(!board)return;board.tool=tool;board.canvas.isDrawingMode=tool==='brush';board.canvas.selection=tool==='select';board.canvas.skipTargetFind=['brush','rect','ellipse','triangle','line','text','pan'].includes(tool);board.canvas.defaultCursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';
 if(tool!=='select'){board.canvas.discardActiveObject();board.canvas.requestRenderAll();}
 if(tool==='brush'){board.canvas.freeDrawingBrush=new fabric.PencilBrush(board.canvas);board.canvas.freeDrawingBrush.color=board.color;board.canvas.freeDrawingBrush.width=board.width;}
 document.querySelectorAll('[data-board-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.boardTool===tool)));
 referenceBoardLayers();
}
function referenceBoardFit(){
 const board=referenceBoard;if(!board)return;const canvas=board.canvas,objects=canvas.getObjects();
 const boxes=objects.map(object=>object.getBoundingRect());const left=boxes.length?Math.min(...boxes.map(box=>box.left)):0,top=boxes.length?Math.min(...boxes.map(box=>box.top)):0,right=boxes.length?Math.max(...boxes.map(box=>box.left+box.width)):960,bottom=boxes.length?Math.max(...boxes.map(box=>box.top+box.height)):540;
 const usableHeight=canvas.height-Math.max(90,(document.querySelector('.ref-board-tools')?.offsetHeight||0)+70);
 const scale=Math.min(1.5,Math.max(.15,Math.min((canvas.width-80)/Math.max(100,right-left),(usableHeight-40)/Math.max(100,bottom-top))));
 canvas.setViewportTransform([scale,0,0,scale,(canvas.width-(right-left)*scale)/2-left*scale,(usableHeight-(bottom-top)*scale)/2-top*scale+20]);referenceBoardZoomLabel();
}
function referenceBoardZoomLabel(){const button=document.querySelector('[data-board-command="fit"]');if(button)button.textContent=Math.round(referenceBoard.canvas.getZoom()*100)+'%';}
function referenceBoardObjectStyle(object){object.set({borderColor:'#91a6c7',cornerColor:'#e4e4e4',cornerStrokeColor:'#444',cornerSize:9,transparentCorners:false});}
async function referenceBoardLoad(json){const board=referenceBoard;if(!board)return;board.loading=true;try{await board.canvas.loadFromJSON(json);if(referenceBoard!==board)return;board.canvas.getObjects().forEach(referenceBoardObjectStyle);board.canvas.requestRenderAll();referenceBoardLayers();return true;}catch(error){referenceBoardReport('画板恢复失败，已保留原工程记录');return false;}finally{board.loading=false;}}
function referenceBoardClose(){const board=referenceBoard;if(!board)return;if(!referenceBoardSave())return;board.inertAreas.forEach(({element,previous})=>element.inert=previous);board.observer?.disconnect();board.canvas.dispose();document.querySelector('.ref-board-overlay')?.remove();referenceBoard=null;if(board.opener?.isConnected)board.opener.focus({preventScroll:true});}
function referenceBoardRequestMode(mode){
 const board=referenceBoard;if(!board||board.mode===mode)return;referenceBoardSave();
 const notice=document.querySelector('.ref-board-switch');notice.innerHTML=`<section role="dialog" aria-label="切换画板模式"><h2>切换到${mode==='draw'?'2D画板':'实时模式'}？</h2><p>同步会替换目标画板内容；保留独立内容则不影响另一边。</p><footer><button data-board-switch="cancel">取消</button><button data-board-switch="separate" data-mode="${mode}">保留独立内容</button><button data-board-switch="sync" data-mode="${mode}">同步并切换</button></footer></section>`;notice.hidden=false;notice.querySelector('button').focus();
}
async function referenceBoardApplyMode(mode,sync){const board=referenceBoard;if(!board)return;if(sync)board.record.docs[mode]=structuredClone(board.record.docs[board.mode]);board.mode=mode;board.record.mode=mode;document.querySelector('.ref-board-overlay').classList.toggle('is-realtime',mode==='realtime');document.querySelectorAll('[data-board-mode]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.boardMode===mode)));document.querySelector('.ref-board-switch').hidden=true;await referenceBoardLoad(board.record.docs[mode].json);referenceBoardFit();referenceBoardSave();}
async function referenceOpenBoard(){
 if(referenceBoard)return;const root=document.createElement('section');root.className='ref-board-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-label','画板');
 root.innerHTML=`<header><strong>画板</strong><button data-board-command="save">保存工程</button><span class="ref-board-notice" role="status">本机工程</span><nav role="tablist" aria-label="画板模式"><button role="tab" data-board-mode="draw" aria-selected="true">2D画板</button><button role="tab" data-board-mode="realtime" aria-selected="false">实时模式</button></nav><button data-board-command="close" class="ref-board-close" aria-label="关闭画板">${I('close')}</button></header><main><section class="ref-board-stage"><canvas id="ref-fabric-board"></canvas></section><aside class="ref-board-preview"><h2>实时生成预览</h2><p>尚未连接实时生图服务</p><small>绘画与画面描述保存在本机，当前不发起生成</small><textarea aria-label="画面描述" placeholder="描述想要的画面…"></textarea><button disabled>生成</button></aside></main><div class="ref-board-tools" role="toolbar" aria-label="绘图工具">${[['select','选择','pointer'],['pan','移动','hand'],['brush','画笔','edit']].map(([tool,label,icon])=>`<button data-board-tool="${tool}" aria-label="${label}" title="${label}" aria-pressed="${tool==='select'}">${I(icon)}</button>`).join('')}<details><summary aria-label="形状" title="形状">${I('grid')}</summary><div>${[['rect','矩形'],['ellipse','椭圆'],['triangle','三角形'],['line','线条']].map(([tool,label])=>`<button data-board-tool="${tool}" aria-pressed="false">${label}</button>`).join('')}</div></details><button data-board-tool="text" aria-label="文本" title="文本">T</button><button data-board-command="image" aria-label="插入图片" title="插入图片">${I('image')}</button><input type="file" accept="image/png,image/jpeg,image/webp" data-board-image hidden><label title="颜色"><input type="color" aria-label="画笔颜色" value="#e4e4e4"></label><input type="range" min="1" max="30" value="4" aria-label="线条粗细"><span class="ref-board-separator"></span>${[['undo','撤销','undo'],['redo','重做','redo'],['delete','删除所选','trash'],['export','导出图片','download']].map(([action,label,icon])=>`<button data-board-command="${action}" aria-label="${label}" title="${label}">${I(icon)}</button>`).join('')}</div><div class="ref-board-zoom"><button data-board-command="out" aria-label="缩小">−</button><button data-board-command="fit" title="适应内容">100%</button><button data-board-command="in" aria-label="放大">+</button></div><button class="ref-board-layers-toggle" data-board-command="layers">${I('layers')}图层</button><aside class="ref-board-layers" hidden><header>图层<button data-board-command="layers" aria-label="关闭图层">${I('close')}</button></header><div class="ref-board-layer-list"></div><footer><button data-board-command="forward">上移</button><button data-board-command="backward">下移</button><button data-board-command="project">导出工程</button></footer></aside><div class="ref-board-switch" hidden></div>`;
 document.body.append(root);const canvas=new fabric.Canvas('ref-fabric-board',{preserveObjectStacking:true,backgroundColor:'#0b0b0b'});
 const saved=S.referenceBoard,record=saved?.version===1?structuredClone(saved):{version:1,mode:'draw',docs:{draw:referenceBoardDocument(),realtime:referenceBoardDocument()},description:''};
 const opener=document.activeElement;const inertAreas=[document.getElementById('app'),document.getElementById('modal-root')].filter(Boolean).map(element=>({element,previous:element.inert}));inertAreas.forEach(({element})=>element.inert=true);
 const board={canvas,record,mode:record.mode,tool:'select',width:4,color:'#e4e4e4',loading:true,opener,inertAreas};referenceBoard=board;
 root.classList.toggle('is-realtime',board.mode==='realtime');root.querySelectorAll('[data-board-mode]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.boardMode===board.mode)));root.querySelector('textarea').value=record.description||'';
 const resize=()=>{root.style.setProperty('--board-tools-height',root.querySelector('.ref-board-tools').offsetHeight+'px');const stage=root.querySelector('.ref-board-stage'),width=stage.clientWidth,height=stage.clientHeight,transform=[...canvas.viewportTransform];transform[4]+=(width-canvas.width)/2;transform[5]+=(height-canvas.height)/2;canvas.setDimensions({width,height});canvas.setViewportTransform(transform);if(!board.loading)referenceBoardFit();canvas.requestRenderAll();};board.observer=new ResizeObserver(resize);board.observer.observe(root.querySelector('.ref-board-stage'));resize();
 await referenceBoardLoad(record.docs[board.mode].json);if(referenceBoard!==board)return;referenceBoardFit();referenceBoardSave();
 let drawing=null,start=null,pan=null;
 canvas.on('mouse:down',event=>{
  if(board.loading)return;const point=canvas.getScenePoint(event.e);
  if(board.tool==='pan'){pan={x:event.e.clientX,y:event.e.clientY};return;}
  if(board.tool==='text'){const text=new fabric.Textbox('输入文字',{left:point.x,top:point.y,width:220,fontSize:28,fill:board.color});canvas.add(text);referenceBoardSetTool('select');canvas.setActiveObject(text);text.enterEditing();text.selectAll();referenceBoardSave();return;}
  const options={left:point.x,top:point.y,width:1,height:1,fill:'transparent',stroke:board.color,strokeWidth:board.width,strokeUniform:true};
  const Shape={rect:fabric.Rect,ellipse:fabric.Ellipse,triangle:fabric.Triangle}[board.tool];
  if(Shape){start=point;drawing=new Shape(options);canvas.add(drawing);}else if(board.tool==='line'){start=point;drawing=new fabric.Line([point.x,point.y,point.x,point.y],options);canvas.add(drawing);}
 });
 canvas.on('mouse:move',event=>{if(pan){const transform=canvas.viewportTransform;transform[4]+=event.e.clientX-pan.x;transform[5]+=event.e.clientY-pan.y;pan={x:event.e.clientX,y:event.e.clientY};canvas.requestRenderAll();return;}if(!drawing)return;const p=canvas.getScenePoint(event.e),width=Math.max(1,Math.abs(p.x-start.x)),height=Math.max(1,Math.abs(p.y-start.y));if(board.tool==='line')drawing.set({x2:p.x,y2:p.y});else drawing.set({left:Math.min(p.x,start.x),top:Math.min(p.y,start.y),width,height,...(board.tool==='ellipse'?{rx:width/2,ry:height/2}:{})});canvas.requestRenderAll();});
 canvas.on('mouse:up',()=>{pan=null;if(!drawing)return;drawing.setCoords();canvas.setActiveObject(drawing);drawing=null;referenceBoardSetTool('select');referenceBoardSave();});
 canvas.on('object:added',event=>referenceBoardObjectStyle(event.target));
 canvas.on('path:created',()=>referenceBoardSave());canvas.on('object:modified',()=>referenceBoardSave());canvas.on('text:editing:exited',()=>referenceBoardSave());
 for(const event of ['selection:created','selection:updated','selection:cleared'])canvas.on(event,referenceBoardLayers);
 root.querySelector('[data-board-command="close"]').focus();
}
const referenceBoardBaseAction=handleAction;handleAction=function(action){if(action==='ref-board'){referenceOpenBoard();return;}referenceBoardBaseAction(action);};
document.addEventListener('click',async event=>{
 const root=event.target.closest('.ref-board-overlay'),board=referenceBoard;if(!root||!board)return;
 const tool=event.target.closest('[data-board-tool]'),command=event.target.closest('[data-board-command]'),mode=event.target.closest('[data-board-mode]'),change=event.target.closest('[data-board-switch]');
 if(tool){referenceBoardSetTool(tool.dataset.boardTool);root.querySelector('details').open=false;}
 if(mode)referenceBoardRequestMode(mode.dataset.boardMode);
 if(change){if(change.dataset.boardSwitch==='cancel')root.querySelector('.ref-board-switch').hidden=true;else await referenceBoardApplyMode(change.dataset.mode,change.dataset.boardSwitch==='sync');}
 if(event.target.closest('[data-board-layer]')){canvasSelect(Number(event.target.closest('[data-board-layer]').dataset.boardLayer));}
 if(event.target.closest('[data-board-visible]')){const object=board.canvas.getObjects()[Number(event.target.closest('[data-board-visible]').dataset.boardVisible)];object.set('visible',!object.visible);board.canvas.requestRenderAll();referenceBoardSave();}
 if(!command)return;const action=command.dataset.boardCommand,canvas=board.canvas;
 if(action==='close'){referenceBoardClose();return;}
 if(action==='save')referenceBoardSave();
 if(action==='layers')root.querySelector('.ref-board-layers').hidden=!root.querySelector('.ref-board-layers').hidden;
 if(action==='image')root.querySelector('[data-board-image]').click();
 if(action==='delete'){canvas.getActiveObjects().forEach(object=>canvas.remove(object));canvas.discardActiveObject();referenceBoardSave();}
 if(action==='undo'||action==='redo'){const history=board.record.docs[board.mode].history,next=history.index+(action==='undo'?-1:1);if(next>=0&&next<history.items.length){history.index=next;await referenceBoardLoad(JSON.parse(history.items[next]));referenceBoardSave();}}
 if(action==='in'||action==='out'){canvas.zoomToPoint(new fabric.Point(canvas.width/2,canvas.height/2),Math.max(.1,Math.min(4,canvas.getZoom()*(action==='in'?1.2:1/1.2))));referenceBoardZoomLabel();}
 if(action==='fit')referenceBoardFit();
 if(action==='forward'||action==='backward'){const selected=canvas.getActiveObject();if(selected){action==='forward'?canvas.bringObjectForward(selected):canvas.sendObjectBackwards(selected);canvas.requestRenderAll();referenceBoardSave();}}
 if(action==='export'||action==='project'){
  try{const blob=action==='export'?await new Promise(resolve=>canvas.toCanvasElement().toBlob(resolve,'image/png')):new Blob([JSON.stringify(referenceBoardPortableRecord(board.record),null,2)],{type:'application/json'});if(!blob)throw new Error('Empty export');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=S.project+'-画板.'+(action==='export'?'png':'json');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);referenceBoardReport('已准备导出文件');}
  catch(error){referenceBoardReport('导出失败，画板内容仍保留，请重试');}
 }
 function canvasSelect(index){const object=board.canvas.getObjects()[index];if(object){referenceBoardSetTool('select');board.canvas.setActiveObject(object);board.canvas.requestRenderAll();referenceBoardLayers();}}
},true);
document.addEventListener('input',event=>{const board=referenceBoard;if(!board||!event.target.closest('.ref-board-overlay'))return;if(event.target.matches('[type=color]'))board.color=event.target.value;if(event.target.matches('[type=range]'))board.width=Number(event.target.value);if(board.tool==='brush')referenceBoardSetTool('brush');if(event.target.matches('textarea')){board.record.description=event.target.value;referenceBoardSave();}});
document.addEventListener('change',async event=>{
 const input=event.target;if(!input.matches('[data-board-image]'))return;const board=referenceBoard,file=input.files[0];input.value='';if(!board||!file)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){referenceBoardReport('请选择不超过 5 MB 的 PNG、JPG 或 WebP 图片');return;}
 try{const bitmap=await createImageBitmap(file),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const image=await fabric.FabricImage.fromURL(canvas.toDataURL('image/webp',.85));if(referenceBoard!==board)return;image.scaleToWidth(Math.min(480,image.width));image.set({left:80,top:80,boardName:file.name});board.canvas.add(image);referenceBoardSetTool('select');board.canvas.setActiveObject(image);referenceBoardFit();referenceBoardSave();}catch(error){referenceBoardReport('图片无法读取，原画板内容已保留');}
});
window.addEventListener('keydown',event=>{const board=referenceBoard;if(!board)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(board.canvas.getActiveObject()?.isEditing){board.canvas.getActiveObject().exitEditing();referenceBoardSave();return;}const notice=document.querySelector('.ref-board-switch');if(!notice.hidden)notice.hidden=true;else if(document.querySelector('.ref-board-project-panel')){document.querySelector('.ref-board-project-panel').remove();document.querySelector('[data-board-projects]').focus();}else referenceBoardClose();return;}if(event.key==='Tab'){const scope=document.querySelector('.ref-board-switch:not([hidden])')||document.querySelector('.ref-board-overlay');const controls=[...scope.querySelectorAll('button:not(:disabled),input,textarea,summary')].filter(element=>element.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;}if(event.target.closest('input,textarea')||board.canvas.getActiveObject()?.isEditing)return;const command=(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'?(event.shiftKey?'redo':'undo'):['Delete','Backspace'].includes(event.key)?'delete':null;if(command){event.preventDefault();event.stopImmediatePropagation();document.querySelector(`[data-board-command="${command}"]`).click();}else event.stopPropagation();},true);
