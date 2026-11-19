/* Compact reference-canvas navigation reuses the camera and minimap owners. */
'use strict';
const referenceControlsCanvas=canvasHtml,referenceControlsAction=handleAction,referenceControlsCamera=applyCamera;
S.referenceCanvasViews ||= [];
let referenceViewPanel=false,referenceViewDraft=null;
/** List implemented canvas shortcuts without changing project contents. */
function referenceOpenCanvasShortcuts(){
 const modifier=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl';
 const row=(name,keys)=>`<div class="ref-shortcut-row"><span>${name}</span><span>${keys.map(key=>`<kbd>${key}</kbd>`).join('')}</span></div>`;
 const group=(title,rows)=>`<section><h3>${title}</h3>${rows.map(([name,keys])=>row(name,keys)).join('')}</section>`;
 const html=group('画布导航',[
  ['搜索节点', [modifier,'F']],['适应全部', ['F']],['缩放',[modifier,'滚轮']],['平移',['拖动空白处']],['关闭当前面板',['Esc']]
 ])+group('普通节点',[
  ['复制',[modifier,'C']],['粘贴',[modifier,'V']],['删除',['⌫ / Delete']],['撤销',[modifier,'Z']],['重做',['Shift',modifier,'Z']]
 ])+group('正文编辑',[
  ['进入编辑',['双击 / Enter']],['放大后返回',['Esc']],['粗体',[modifier,'B']],['斜体',[modifier,'I']],['下划线',[modifier,'U']]
 ])+group('连接与定位',[
  ['建立引用',['拖动连接点']],['断开引用',['选中连线','Delete']],['移动选中节点',['方向键']],['加速移动',['Shift','方向键']],['保存本地草稿',[modifier,'S']]
 ]);
 showDialog('快捷键',`<div class="ref-shortcuts-grid">${html}</div>${typeof referencePromptShortcutSettingsHtml==='function'?referencePromptShortcutSettingsHtml():''}<p class="ref-shortcuts-note">正文编辑保留编辑器自身的快捷键</p>`);
 document.querySelector('.dialog').classList.add('ref-shortcuts-dialog');
}
function referenceViewportThumbnail(view){
 const width=160,height=90,viewport=document.getElementById('viewport'),ratio=width/(viewport?.clientWidth||1280);
 return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${S.nodes.map(n=>`<rect x="${(n.x*view.zoom+view.pan.x)*ratio}" y="${(n.y*view.zoom+view.pan.y)*ratio}" width="${n.w*view.zoom*ratio}" height="${n.h*view.zoom*ratio}" rx="1" fill="#484848"/>`).join('')}</svg>`;
}
function referenceViewsHtml(){
 const views=S.referenceCanvasViews||[];
 return `<section class="ref-views-panel" role="dialog" aria-label="视窗"><header><h2>视窗</h2>${iconBtn('关闭视窗','ref-views-close','close')}</header><div class="ref-view-list">${views.map(v=>`<div class="ref-saved-view"><button class="ref-view-restore" data-action="ref-view-open:${v.id}" aria-label="定位到${esc(v.name)}"><span class="ref-view-preview">${referenceViewportThumbnail(v)}</span><span>${esc(v.name)}</span></button>${iconBtn('移除视窗 '+v.name,'ref-view-remove:'+v.id,'trash')}</div>`).join('')}${referenceViewDraft?`<div class="ref-saved-view editing"><span class="ref-view-preview">${referenceViewportThumbnail({zoom:S.zoom,pan:S.pan})}</span><input id="ref-view-name" aria-label="视窗名称" value="${esc(referenceViewDraft.name)}" maxlength="60">${iconBtn('确认保存','ref-view-save','check')}${iconBtn('取消新建视窗','ref-view-cancel','close')}</div>`:''}</div>${referenceViewDraft?`<div class="ref-view-hint"><p>移动或缩放画布调整区域。保存后可再次定位到该视窗</p><button data-action="ref-view-save">确认保存</button></div>`:''}<button class="ref-view-add" data-action="ref-view-add" ${referenceViewDraft?'disabled':''}>${I('plus')}添加视窗</button></section>`;
}
function referenceCanvasNavigation(){
 return `<div class="canvas-bottom ref-canvas-navigation"><div class="minimap" id="minimap" aria-label="画布缩略图"></div><div class="zoom-control ref-navigation-bar"><details class="ref-navigation-menu"><summary aria-label="地图与视窗">${I('locate')}</summary><div role="menu" aria-label="地图与视窗"><button role="menuitemcheckbox" aria-checked="${canvasNavigatorState().mapVisible}" data-action="canvas-nav-map">${I('locate')}地图</button><button role="menuitem" data-action="ref-views">${I('file')}视窗</button></div></details>${iconBtn(S.referenceEdgesHidden?'显示连线':'隐藏连线','ref-toggle-edges','eye',S.referenceEdgesHidden?'active':'')}${iconBtn('网格吸附已'+(S.referenceGridSnap?'开启':'关闭'),'ref-toggle-grid','magnet',S.referenceGridSnap?'active':'')}${iconBtn('重置视图','fit','reset')}<span class="ref-navigation-divider"></span><input class="ref-zoom-range" type="range" min="1" max="160" step="1" value="${Math.round(S.zoom*100)}" aria-label="缩放画布" title="${Math.round(S.zoom*100)}%"><span class="zoom-label ref-visually-hidden">${Math.round(S.zoom*100)}%</span></div>${iconBtn('画布帮助','help','help')}${iconBtn('整理画布','layout','grid')}</div>${referenceViewPanel?referenceViewsHtml():''}`;
}
canvasHtml=function(){
 const html=referenceControlsCanvas(),start=html.indexOf('<div class="canvas-bottom">'),end=html.indexOf('</div></div></div>',start);
 if(start<0||end<0)return html;
 return (html.slice(0,start)+referenceCanvasNavigation()+html.slice(end+12)).replace('<section class="canvas-shell"','<section class="canvas-shell'+(S.referenceEdgesHidden?' ref-edges-hidden':'')+'"');
};
applyCamera=function(){referenceControlsCamera();const range=document.querySelector('.ref-zoom-range');if(range){range.value=Math.round(S.zoom*100);range.title=Math.round(S.zoom*100)+'%'}};
function referenceRefreshViews(focus=false){document.querySelector('.ref-views-panel')?.remove();if(referenceViewPanel){document.getElementById('viewport')?.insertAdjacentHTML('beforeend',referenceViewsHtml());if(focus){const input=document.getElementById('ref-view-name');input?.focus({preventScroll:true});input?.select()}}}
handleAction=function(action){
 const [key,...args]=action.split(':'),value=args.join(':');
 if(key==='help'){referenceOpenCanvasShortcuts();return}
 if(key==='ref-toggle-edges'){S.referenceEdgesHidden=!S.referenceEdgesHidden;render();save();return}
 if(key==='ref-toggle-grid'){S.referenceGridSnap=!S.referenceGridSnap;render();save();return}
 if(key==='ref-views'){referenceViewPanel=!referenceViewPanel;referenceViewDraft=referenceViewPanel&&!S.referenceCanvasViews.length?{name:'当前视窗'}:null;document.querySelector('.ref-navigation-menu')?.removeAttribute('open');referenceRefreshViews(true);return}
 if(key==='ref-views-close'){referenceViewPanel=false;referenceViewDraft=null;referenceRefreshViews();return}
 if(key==='ref-view-add'){referenceViewDraft={name:'视窗 '+(S.referenceCanvasViews.length+1)};referenceRefreshViews(true);return}
 if(key==='ref-view-cancel'){referenceViewDraft=null;referenceRefreshViews();return}
 if(key==='ref-view-save'){const name=document.getElementById('ref-view-name')?.value.trim();if(!name){document.getElementById('ref-view-name')?.focus();return}S.referenceCanvasViews.push({id:studioRandomUUID(),name,zoom:S.zoom,pan:{...S.pan}});referenceViewDraft=null;referenceRefreshViews();save();return}
 if(key==='ref-view-open'){const v=S.referenceCanvasViews.find(v=>v.id===value);if(v){S.zoom=v.zoom;S.pan={...v.pan};applyCamera();save()}return}
 if(key==='ref-view-remove'){S.referenceCanvasViews=S.referenceCanvasViews.filter(v=>v.id!==value);referenceRefreshViews();save();return}
 if(['ref-nav','home','ref-new','ref-project-open','resume-project','open-example','ref-start'].includes(key)){referenceViewPanel=false;referenceViewDraft=null}
 referenceControlsAction(action);
};
document.addEventListener('input',event=>{if(event.target.matches('.ref-zoom-range'))zoomBy(Number(event.target.value)/100/S.zoom);if(event.target.id==='ref-view-name'&&referenceViewDraft)referenceViewDraft.name=event.target.value});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.ref-navigation-menu'))document.querySelector('.ref-navigation-menu[open]')?.removeAttribute('open')},true);
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const menu=document.querySelector('.ref-navigation-menu[open]');if(menu){menu.open=false;menu.querySelector('summary').focus();event.preventDefault();event.stopImmediatePropagation();return}if(referenceViewPanel&&!currentModal){referenceViewPanel=false;referenceViewDraft=null;referenceRefreshViews();event.preventDefault();event.stopImmediatePropagation()}},true);
render();
