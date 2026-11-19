/* Node context commands use the same retained drafts and scoped canvas history. */
'use strict';
let referenceNodeMenu=null,referenceNodeClipboard=null,referenceNodeRename=null;
function referenceCloseNodeMenu(restoreFocus=false){
 const state=referenceNodeMenu;document.getElementById('reference-node-menu')?.remove();referenceNodeMenu=null;
 if(restoreFocus&&state?.opener?.isConnected)state.opener.focus({preventScroll:true});
}
function referenceNodeMenuButton(action,label,disabled=false,hint=''){
 return `<button role="menuitem" data-node-command="${action}" ${disabled?'disabled':''}>${label}${hint?`<span class="reference-command-hint">${hint}</span>`:''}</button>`;
}
function referenceOpenNodeMenu(id,x,y,keyboard=false,origin='canvas',sourceOpener=null){
 referenceCloseNodeMenu();const n=nodeById(id),editable=referenceNodeEditable(n),vp=document.getElementById('viewport');if(!vp)return;
 const opener=sourceOpener||(n?document.querySelector(`[data-node="${n.id}"]`):vp);
 const item=referenceNodeMenuButton,divider='<div class="reference-command-divider" role="separator"></div>';
 const operations=n&&['video','shot','voice','audio'].includes(n.kind)?`${['video','shot'].includes(n.kind)?item('compose','视频合成'):''}${item('quickcut','快捷剪辑')}${divider}`:'';
 const html=origin==='manager'?`${item('rename','重命名',!editable)}${item('download','下载',true)}${item('delete','删除',!editable||referenceConfirmedAsset(S,id))}`:n?`${operations}${item('save-asset','加入我的资产',!studioAdoptedCandidate(n))}${['character','scene','image'].includes(n.kind)?item('info','显示简介',!studioAdoptedCandidate(n)):''}${divider}${item('duplicate','创建副本',!editable,'ⓘ')}${item('copy','复制节点',!editable)}${item('paste','粘贴节点',!referenceNodeClipboard)}${divider}${item('rename','重命名',!editable)}${item('delete','删除节点',!editable||referenceConfirmedAsset(S,id))}`:`${item('add','添加节点')}${divider}${item('undo','撤销',!S.canvasUndo?.length,'⌘ / Ctrl Z')}${item('redo','重做',!S.canvasRedo?.length,'⇧ ⌘ / Ctrl Z')}${divider}${item('paste','粘贴',!referenceNodeClipboard,'⌘ / Ctrl V')}`;
 document.body.insertAdjacentHTML('beforeend',`<div id="reference-node-menu" class="reference-node-menu" role="menu" aria-label="${n?'节点操作':'画布操作'}">${html}</div>`);
 const menu=document.getElementById('reference-node-menu'),top=Math.max(12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||0)+8);
 menu.style.maxHeight=Math.max(80,innerHeight-top-12)+'px';menu.style.left=Math.max(12,Math.min(innerWidth-menu.offsetWidth-12,x))+'px';menu.style.top=Math.max(top,Math.min(innerHeight-menu.offsetHeight-12,y))+'px';
 menu.querySelector('[data-node-command="duplicate"]')?.setAttribute('title','复制该节点所有参数，并复制上游参考线（下游连线请手动链接）');
 if(origin==='manager'){menu.querySelector('[data-node-command="download"]').title='示例素材没有独立源文件';if(!editable)menu.querySelector('[data-node-command="rename"]').title='请在剧本工坊或时间线中管理这类内容';}
 referenceNodeMenu={id,origin,opener,point:{x,y}};if(keyboard)menu.querySelector('button:not(:disabled)')?.focus();
}
function referenceRecordNodeCommand(result,type,title){
 if(!result.ok){toast(result.error);return false;}if(!result.changed)return false;
 studioRecordCanvasHistory(result.entry);S.revision++;S.history.push({type,nodeId:result.id,nodeTitle:title,createdAt:new Date().toISOString()});return true;
}
function referenceRefreshNodeLabel(id){
 const n=nodeById(id),el=document.querySelector(`[data-node="${id}"]`);if(n&&el)el.outerHTML=nodeHtml(n);
 const selected=document.querySelector('.creation-selection');if(n&&S.selected===id&&selected?.firstChild)selected.firstChild.textContent=n.title;
 const groups=document.getElementById('script-groups');if(groups)groups.innerHTML=scriptCanvasGroups();
 requestAnimationFrame(()=>{drawEdges();drawMinimap();positionSelectionToolbar();});refreshCanvasNavigator();save();
}
function referenceFinishNodeRename(cancel=false){
 const state=referenceNodeRename;if(!state)return;referenceNodeRename=null;
 if(!cancel){const result=referenceRenameCanvasNode(S,state.id,state.input.value);referenceRecordNodeCommand(result,'node-renamed',nodeById(state.id)?.title||state.title);}
 referenceRefreshNodeLabel(state.id);
}
function referenceStartNodeRename(id,origin='canvas'){
 const n=nodeById(id);if(!referenceNodeEditable(n))return;
 const el=document.querySelector(`[data-node="${id}"]`),label=el?.querySelector('.ref-node-name,.node-content h3');if(!label)return;
 const input=document.createElement('input');input.className='reference-node-name-input';input.setAttribute('aria-label','节点名称');input.value=n.title;input.maxLength=120;
 referenceNodeRename={id,title:n.title,input,origin};
 if(origin==='manager'){const row=document.querySelector(`[data-nav-node="${id}"]`);if(!row){referenceNodeRename=null;return;}row.tabIndex=-1;row.style.pointerEvents='none';const caption=[...row.children].find(child=>child.tagName==='SPAN'&&!child.classList.contains('canvas-nav-thumb')&&!child.classList.contains('canvas-nav-kind'));if(caption)caption.style.visibility='hidden';input.classList.add('manager-node-rename');row.after(input);}else label.replaceChildren(input);input.focus({preventScroll:true});input.select();
 input.addEventListener('blur',()=>referenceFinishNodeRename(),{once:true});
}
function referenceRunNodeCommand(action,id=S.selected,origin='canvas'){
 const n=nodeById(id);
 if(action==='info'){referenceOpenNodeImageInfo(id);return;}
 if(action==='compose'||action==='quickcut'){referenceAddEditNode(action,id);return;}
 if(action==='rename'){referenceStartNodeRename(id,origin);return;}
 if(action==='copy'){const result=referenceCopyCanvasNode(S,id);if(result.ok){referenceNodeClipboard=result.payload;toast('已复制节点，可在画布中粘贴');}else toast(result.error);return;}
 if(action==='add'){showAdd();return;}
 if(action==='undo'||action==='redo'){handleAction(action);return;}
 let result;
 if(action==='duplicate'&&n)result=referenceDuplicateCanvasNode(S,id,studioScriptId('copy'),studioNewContentPosition(n.w,n.h));
 if(action==='paste'&&referenceNodeClipboard){const copy=referenceNodeClipboard.node;result=referencePasteCanvasNode(S,referenceNodeClipboard,studioScriptId('copy'),studioNewContentPosition(copy.w,copy.h));}
 if(action==='delete'&&n)result=referenceDeleteCanvasNode(S,id);
 if(!result)return;
 const label=action==='paste'?referenceNodeClipboard.node.title:n?.title;
 if(!referenceRecordNodeCommand(result,action==='delete'?'node-deleted':'node-duplicated',label))return;
 canvasSelectedLink=null;S.selected=action==='delete'?null:result.id;if(S.panel==='selection')S.panel=null;
 render();if(S.selected){revealSelectedNode();frameCanvasNodeControls();document.querySelector(`[data-node="${S.selected}"]`)?.focus({preventScroll:true});}save();
 toast(action==='delete'?'已删除节点，可撤销恢复':result.dropped?'已粘贴节点；原项目的参考连接未带入':'已创建副本，已有结果与上游参考保留');
}
document.addEventListener('contextmenu',event=>{
 if(S.screen!=='canvas'||S.view!=='canvas'||currentModal||event.target.closest('input,textarea,select,[contenteditable="true"],.canvas-creation,.selection-toolbar,.floating-tools,.canvas-bottom,.canvas-navigator'))return;
 if(!event.target.closest('#viewport'))return;event.preventDefault();event.stopImmediatePropagation();
 referenceFinishNodeRename();referenceOpenNodeMenu(event.target.closest('[data-node]')?.dataset.node||null,event.clientX,event.clientY);
},true);
document.addEventListener('pointerdown',event=>{if(referenceNodeMenu&&!event.target.closest('#reference-node-menu'))referenceCloseNodeMenu();},true);
document.addEventListener('click',event=>{
 const command=event.target.closest('[data-node-command]');if(command){event.preventDefault();event.stopImmediatePropagation();const id=referenceNodeMenu?.id,origin=referenceNodeMenu?.origin;referenceCloseNodeMenu();referenceRunNodeCommand(command.dataset.nodeCommand,id,origin);return;}
 const duplicate=event.target.closest('[data-action^="duplicate:"]'),id=duplicate?.dataset.action.slice('duplicate:'.length);if(duplicate&&referenceNodeEditable(nodeById(id))){event.preventDefault();event.stopImmediatePropagation();referenceRunNodeCommand('duplicate',id);}
},true);
document.addEventListener('keydown',event=>{
 if(referenceNodeRename&&event.target===referenceNodeRename.input){if(['Enter','Escape'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const id=referenceNodeRename.id,origin=referenceNodeRename.origin;referenceFinishNodeRename(event.key==='Escape');document.querySelector(origin==='manager'?`[data-node-more="${id}"]`:`[data-node="${id}"]`)?.focus({preventScroll:true});}return;}
 if(referenceNodeMenu){
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseNodeMenu(true);return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const buttons=[...document.querySelectorAll('#reference-node-menu button:not(:disabled)')],at=buttons.indexOf(document.activeElement),index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:buttons.length-1)+buttons.length)%buttons.length;buttons[index]?.focus();return;}
 }
 if(referenceNodeMenu&&(event.key==='Tab'||(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'))referenceCloseNodeMenu();
 if(currentModal||S.screen!=='canvas'||S.view!=='canvas'||event.target.closest('input,textarea,select,[contenteditable="true"],.canvas-creation,.selection-toolbar,.canvas-navigator'))return;
 if(!event.target.closest('#viewport'))return;
 if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();event.stopImmediatePropagation();const el=event.target.closest('[data-node]'),r=(el||document.getElementById('viewport')).getBoundingClientRect();referenceOpenNodeMenu(el?.dataset.node||null,r.left+Math.min(80,r.width/2),r.top+Math.min(60,r.height/2),true);return;}
 const key=event.key.toLowerCase(),id=event.target.closest('[data-node]')?.dataset.node||S.selected;
 if((event.metaKey||event.ctrlKey)&&!event.shiftKey&&['c','v'].includes(key)&&((key==='c'&&referenceNodeEditable(nodeById(id)))||(key==='v'&&referenceNodeClipboard))){event.preventDefault();event.stopImmediatePropagation();referenceCloseNodeMenu();referenceRunNodeCommand(key==='c'?'copy':'paste',id);return;}
 if(['Delete','Backspace'].includes(event.key)&&!canvasSelectedLink&&referenceNodeEditable(nodeById(id))){event.preventDefault();event.stopImmediatePropagation();referenceCloseNodeMenu();referenceRunNodeCommand('delete',id);}
},true);
window.addEventListener('resize',()=>referenceCloseNodeMenu());
window.addEventListener('blur',()=>referenceCloseNodeMenu());
document.addEventListener('wheel',event=>{if(!event.target.closest?.('#reference-node-menu'))referenceCloseNodeMenu();},{passive:true});

function referenceNodeManagerControls(node){return `<button class="canvas-node-more" data-node-more="${node.id}" aria-label="${esc(node.title)}的更多操作" title="更多操作">${I('more')}</button>`;}
document.addEventListener('click',event=>{const button=event.target.closest('[data-node-more]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const r=button.getBoundingClientRect();referenceOpenNodeMenu(button.dataset.nodeMore,r.left,r.bottom+5,true,'manager',button);},true);
