/* Rich text is node content; generation instructions and adopted candidates remain separate. */
'use strict';
let referenceTextEditor=null;
function referenceTextValue(node){return Object.hasOwn(node,'text')?node.text:node.prompt||node.description||'';}
/** Commit one text edit while preserving prompts, accepted results and unrelated drafts. */
function referenceCommitTextNode(state,id,payload){
 const node=state.nodes.find(n=>n.id===id);if(!node||!['text','note'].includes(node.kind)||node.scriptSourceId)return {ok:false,error:'请在该内容所属的编辑器中修改正文'};
 if(typeof payload?.text!=='string'||payload.text.length>100000||payload.document?.root?.type!=='root'||!Array.isArray(payload.document.root.children))return {ok:false,error:'文字内容无法保存，请复制后重试'};
 const actual=referenceCaptureNodeGraph(state),before=structuredClone(actual),draft=before.maps.nodeDrafts[id];
 if(draft){delete draft.textEditor;if(!Object.keys(draft).length)delete before.maps.nodeDrafts[id];}
 node.text=payload.text;node.richText={version:1,document:structuredClone(payload.document)};
 if(state.nodeDrafts?.[id]){delete state.nodeDrafts[id].textEditor;if(!Object.keys(state.nodeDrafts[id]).length)delete state.nodeDrafts[id];}
 const after=referenceCaptureNodeGraph(state);
 const entry=referenceNodeGraphPatch(before,after);return {ok:true,changed:entry.before.nodes.length>0,entry,rollback:referenceNodeGraphPatch(actual,after)};
}
function referenceTextPreview(node){
 const draft=S.nodeDrafts[node.id]?.textEditor,record=draft||(node.richText?.version===1?node.richText:null),text=draft?.text??referenceTextValue(node);
 if(record){try{return CrewONRichText.preview(record.document);}catch(error){/* Retain unreadable records and show their plain text until the editor reports the failure. */}}
 return text?'<p>'+esc(text).replaceAll('\n','<br>')+'</p>':'<p class="ref-text-empty">双击开始编辑…</p>';
}
const referenceTextNodeHtml=nodeHtml;
nodeHtml=function(node){
 const html=referenceTextNodeHtml(node);if(!['text','note'].includes(node.kind)||node.scriptSourceId)return html;
 return html.replace('class="node ', 'class="node ref-text-node ').replace(/<div class="node-content node-text">[\s\S]*?<\/div>/,`<div class="node-content node-text ref-text-preview" role="region" aria-label="正文预览" tabindex="0" title="双击或按 Enter 编辑正文"><div class="ref-text-heading"><h3>${esc(node.title)}</h3><button data-text-import="${node.id}" aria-label="导入文字" title="导入文字文件或 DOCX">${I('upload')}</button><input type="file" hidden data-text-import-file="${node.id}" accept=".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.srt,.vtt,.log,.xml,.html,.htm,.docx"></div><div class="ref-text-document">${referenceTextPreview(node)}</div></div>`);
};
function referenceTextMessage(text,error=false){const state=referenceTextEditor;if(!state)return;const label=state.shell.querySelector('[data-text-status]');label.textContent=text;label.classList.toggle('is-error',error);}
function referenceTextCollapse(){
 const state=referenceTextEditor,expanded=state?.expanded;if(!expanded)return;
 if((expanded.width!==innerWidth||expanded.height!==innerHeight)&&state.project===S.project&&state.home.isConnected){const node=nodeById(state.id);if(node){referenceTextFrame(node);state.home=document.querySelector(`[data-node="${state.id}"]`);}}
 state.home.append(state.shell);expanded.app.inert=expanded.inert;expanded.root.remove();state.expanded=null;referenceTextExpandLabel(state,false);state.editor.focus();
}
function referenceTextExpandLabel(state,expanded){const button=state.shell.querySelector('[data-text-command="fullscreen"]');button.setAttribute('aria-label',expanded?'退出放大编辑':'放大编辑');button.title=expanded?'退出放大编辑':'放大编辑';button.setAttribute('aria-pressed',String(expanded));}
function referenceTextExpand(){
 const state=referenceTextEditor;if(!state)return;if(state.expanded){referenceTextCollapse();return;}
 const root=document.createElement('div'),app=document.getElementById('app');root.className='ref-text-editor-expanded';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','文字编辑');
 root.append(state.shell);document.body.append(root);state.expanded={root,app,inert:app.inert,width:innerWidth,height:innerHeight};app.inert=true;referenceTextExpandLabel(state,true);
 root.addEventListener('click',event=>{if(event.target===root)referenceTextCollapse();});state.editor.focus();
}
/** A failed write keeps the editor and its recoverable draft visible. */
function referenceTextFinish(focus=false){
 const state=referenceTextEditor;if(!state)return true;
 if(state.project!==S.project||!state.home.isConnected){referenceTextCollapse();state.editor.destroy();referenceTextEditor=null;return true;}
 if(state.changed){
  const result=referenceCommitTextNode(S,state.id,state.editor.snapshot());if(!result.ok){referenceTextMessage(result.error,true);return false;}
  const undo=structuredClone(S.canvasUndo),redo=structuredClone(S.canvasRedo),revision=S.revision;
  if(result.changed){studioRecordCanvasHistory(result.entry);S.revision++;}
  try{persist();}catch(error){referenceRestoreNodeGraph(S,result.rollback.after,result.rollback.before);S.canvasUndo=undo;S.canvasRedo=redo;S.revision=revision;referenceTextMessage('本机保存失败，内容仍在当前窗口，请复制后重试',true);return false;}
 }
 referenceTextCollapse();state.editor.destroy();state.shell.remove();referenceTextEditor=null;const node=nodeById(state.id);if(node&&state.home.isConnected)state.home.outerHTML=nodeHtml(node);drawEdges();drawMinimap();positionSelectionToolbar();if(focus)document.querySelector(`[data-node="${state.id}"]`)?.focus({preventScroll:true});return true;
}
/** Bring the entire editable node into view instead of focusing an offscreen text area. */
function referenceTextFrame(node){
 S.selected=node.id;S.panel=null;render();const vp=document.getElementById('viewport'),element=document.querySelector(`[data-node="${node.id}"]`);if(!vp||!element)return;
 const box=vp.getBoundingClientRect(),rect=element.getBoundingClientRect(),width=rect.width/S.zoom,height=rect.height/S.zoom,sidebar=document.querySelector('.canvas-navigator')?.getBoundingClientRect();
 const left=Math.max(box.left+72,sidebar?sidebar.right+12:0),top=Math.max(box.top+12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||0)+12),right=box.right-24,bottom=box.bottom-24;
 if(rect.left>=left&&rect.right<=right&&rect.top>=top&&rect.bottom<=bottom&&S.zoom>=.75)return;
 S.zoom=Math.max(.25,Math.min(1,(right-left)/width,(bottom-top)/height));S.pan={x:left-box.left+(right-left-width*S.zoom)/2-node.x*S.zoom,y:top-box.top+(bottom-top-height*S.zoom)/2-node.y*S.zoom};applyCamera();
}
function referenceTextOpen(id){
 if(!referenceTextFinish())return;const node=nodeById(id);if(!node||!referenceNodeEditable(node)||!['text','note'].includes(node.kind))return;
 referenceTextFrame(node);const home=document.querySelector(`[data-node="${id}"]`);if(!home)return;
 const draft=S.nodeDrafts[id]?.textEditor,record=draft||node.richText;if(record&&record.version!==1){toast('文字记录版本暂不支持，已保留原内容');return;}const shell=document.createElement('section');shell.className='ref-text-editor-shell';shell.setAttribute('aria-label','节点正文编辑');
 const controls=[['bold','粗体','B'],['italic','斜体','I'],['underline','下划线','U'],['h1','标题1','H1'],['h2','标题2','H2'],['h3','标题3','H3'],['paragraph','正文','¶'],['table','插入表格',I('grid')],['copy','复制正文',I('copy')],['fullscreen','放大编辑',I('fit')],['done','完成编辑',I('check')]];
 const button=([key,label,content])=>`<button type="button" data-text-command="${key}" aria-label="${label}" title="${label}" ${['bold','italic','underline','h1','h2','h3','paragraph'].includes(key)?'aria-pressed="false"':''}>${content}</button>`;
 shell.innerHTML=`<div class="ref-text-toolbar" role="toolbar" aria-label="文字格式"><div class="ref-text-format-controls">${controls.filter(([key])=>!['fullscreen','done'].includes(key)).map(button).join('')}</div>${controls.filter(([key])=>['fullscreen','done'].includes(key)).map(button).join('')}</div><div class="ref-text-editor" role="textbox" aria-label="文字内容" aria-multiline="true" contenteditable="true"></div><p data-text-status role="status">双击编辑正文 · 提示词保持独立</p>`;
 home.append(shell);const state={id,project:S.project,home,shell,changed:!!draft,expanded:null,editor:null};referenceTextEditor=state;
 try{state.editor=CrewONRichText.mount(shell.querySelector('.ref-text-editor'),{document:record?.version===1?record.document:null,text:referenceTextValue(node),onChange(payload){
  if(referenceTextEditor!==state)return;state.changed=!!draft||!referenceNodeEqual(state.initial,payload);const current=S.nodeDrafts[id]??={};if(state.changed)current.textEditor={version:1,...structuredClone(payload)};else{delete current.textEditor;if(!Object.keys(current).length)delete S.nodeDrafts[id];}
  try{persist();referenceTextMessage('编辑草稿已保留');}catch(error){referenceTextMessage('草稿仅保留在当前窗口，请复制正文后重试',true);}
 },onSelection(formats){for(const [key,pressed]of Object.entries(formats))shell.querySelector(`[data-text-command="${key}"]`)?.setAttribute('aria-pressed',String(pressed));}});}catch(error){shell.remove();referenceTextEditor=null;toast('原文字格式无法读取，已保留记录，请先复制正文');return;}
 shell.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
 shell.addEventListener('pointerdown',event=>{event.stopPropagation();if(event.target.closest('[data-text-command]'))event.preventDefault();});
 shell.addEventListener('click',event=>{event.stopPropagation();const command=event.target.closest('[data-text-command]')?.dataset.textCommand;if(!command)return;
  if(command==='done'){referenceTextFinish(true);return;}if(command==='fullscreen'){referenceTextExpand();return;}
  if(command==='copy'){navigator.clipboard.writeText(state.editor.snapshot().text).then(()=>referenceTextMessage('正文已复制')).catch(()=>referenceTextMessage('复制失败，请直接选择正文复制',true));return;}state.editor.command(command);
 });
 shell.addEventListener('keydown',event=>{
  event.stopPropagation();if(event.key==='Escape'){event.preventDefault();if(state.expanded)referenceTextCollapse();else referenceTextFinish(true);return;}
  if(event.key!=='Tab'||!state.expanded||event.defaultPrevented)return;
  const controls=[...shell.querySelectorAll('button,[contenteditable=true]')].filter(control=>!control.disabled&&(control.isContentEditable||control.tabIndex!==-1)&&control.getClientRects().length),index=controls.indexOf(document.activeElement);
  if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&(index<0||index===controls.length-1)){event.preventDefault();controls[0]?.focus();}
 });
 state.initial=state.editor.snapshot();if(draft)referenceTextMessage('已恢复编辑草稿');state.editor.focus();
}
document.addEventListener('dblclick',event=>{
 const node=nodeById(event.target.closest('[data-node]')?.dataset.node);if(!node||!['text','note'].includes(node.kind)||!referenceNodeEditable(node)||event.target.closest('button,.ref-text-editor-shell'))return;
 event.preventDefault();event.stopImmediatePropagation();referenceTextOpen(node.id);
},true);
document.addEventListener('pointerdown',event=>{
 const state=referenceTextEditor;if(!state||state.shell.contains(event.target)||state.expanded?.root.contains(event.target))return;
 if(!referenceTextFinish()){event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('keydown',event=>{
 if(event.key!=='Enter'||!event.target.matches?.('[data-node],.ref-text-preview'))return;
 const element=event.target.closest('[data-node]'),node=nodeById(element?.dataset.node);if(node&&['text','note'].includes(node.kind)&&referenceNodeEditable(node)){event.preventDefault();event.stopImmediatePropagation();referenceTextOpen(node.id);}
},true);
const referenceTextAction=handleAction;
handleAction=function(action){if(referenceTextEditor&&!referenceTextFinish())return;if(action.startsWith('edit-node:')){const id=action.slice(10),node=nodeById(id);if(node&&['text','note'].includes(node.kind)&&referenceNodeEditable(node)){referenceTextOpen(id);return;}}referenceTextAction(action);};
if(S.screen==='canvas')render();

/** Scroll long node documents locally; short previews still allow canvas navigation. */
document.addEventListener('wheel',event=>{
 const preview=event.target.closest?.('.ref-text-preview');if(preview&&preview.scrollHeight>preview.clientHeight)event.stopPropagation();
},{capture:true,passive:true});
