/* Expanded prompts reuse the same controls and draft owner without moving the canvas. */
'use strict';
let referencePromptExpansion=null,referencePromptPresentation=null;
const referencePromptDraft=canvasCreationDraft;
canvasCreationDraft=function(node){return {...referencePromptDraft(node),creationExpanded:referencePromptExpansion?.project===S.project&&referencePromptExpansion.nodeId===node.id};};
function referencePromptCursor(){const field=document.getElementById('canvas-creation-prompt');return field?{start:field.selectionStart,end:field.selectionEnd,scroll:field.scrollTop}:null;}
function referenceRestorePromptCursor(cursor){const field=document.getElementById('canvas-creation-prompt');if(!field)return;field.focus({preventScroll:true});if(cursor){field.setSelectionRange(cursor.start,cursor.end);field.scrollTop=cursor.scroll;}}
function referenceClearPromptPresentation(){
 const state=referencePromptPresentation;if(!state)return;
 state.root.remove();state.app.inert=state.inert;referencePromptPresentation=null;
}
function referenceCollapsePrompt(){
 const cursor=referencePromptCursor(),state=referencePromptExpansion;referencePromptExpansion=null;
 if(state?.project===S.project){S.zoom=state.camera.zoom;S.pan={...state.camera.pan};}
 refreshCanvasCreation();applyCamera();referenceRestorePromptCursor(cursor);save();
}
const referencePromptRefresh=refreshCanvasCreation;
refreshCanvasCreation=function(){
 const active=document.activeElement,focused=active?.id==='canvas-creation-prompt',cursor=focused?referencePromptCursor():null;
 const inside=!!active?.closest('.canvas-creation'),action=inside?active.getAttribute('data-action'):null,setting=inside?active.getAttribute('data-creation-setting'):null;
 referenceClearPromptPresentation();
 const node=canvasCreationNode();
 if(!node||referencePromptExpansion?.project!==S.project||referencePromptExpansion?.nodeId!==node.id||canvasActiveTool)referencePromptExpansion=null;
 referencePromptRefresh();
 if(!referencePromptExpansion)return;
 const panel=document.querySelector('.canvas-creation'),app=document.getElementById('app');if(!panel||!app)return;
 const root=document.createElement('div');root.className='ref-expanded-prompt ref-canvas-body';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','提示词编辑');
 panel.hidden=false;root.append(panel);document.body.append(root);
 referencePromptPresentation={root,app,inert:app.inert};app.inert=true;
 const close=panel.querySelector('[data-action="canvas-creation-expand"]');if(close){close.innerHTML=I('close');close.title='收起提示词';}
 root.addEventListener('click',event=>{if(event.target===root)referenceCollapsePrompt();});
 if(focused)referenceRestorePromptCursor(cursor);else if(action||setting){const control=[...panel.querySelectorAll('[data-action],[data-creation-setting]')].find(element=>action?element.getAttribute('data-action')===action:element.getAttribute('data-creation-setting')===setting);control?.focus({preventScroll:true});}
};
const referencePromptPosition=positionCanvasNodeOverlays;
positionCanvasNodeOverlays=function(){if(referencePromptExpansion){const toolbar=document.querySelector('.creation-toolbar');if(toolbar)toolbar.hidden=true;return;}referencePromptPosition();};
const referencePromptFrame=frameCanvasNodeControls;
frameCanvasNodeControls=function(){if(!referencePromptExpansion)referencePromptFrame();};
const referencePromptAction=handleCanvasCreationAction;
handleCanvasCreationAction=function(action){
 if(action==='canvas-creation-expand'){
  const node=canvasCreationNode();if(!node)return true;
  if(referencePromptExpansion){referenceCollapsePrompt();return true;}
  const cursor=referencePromptCursor();referencePromptExpansion={project:S.project,nodeId:node.id,camera:{zoom:S.zoom,pan:{...S.pan}}};refreshCanvasCreation();referenceRestorePromptCursor(cursor);return true;
 }
 return referencePromptAction(action);
};
window.addEventListener('keydown',event=>{
 const state=referencePromptPresentation;if(!state||currentModal||event.defaultPrevented)return;
 if(event.key==='Escape'){
  const menu=state.root.querySelector('details[open]');
  event.preventDefault();event.stopImmediatePropagation();
  if(menu){menu.open=false;menu.querySelector('summary')?.focus();return;}
  referenceCollapsePrompt();return;
 }
 if(event.key!=='Tab'||!state.root.contains(event.target))return;
 const controls=[...state.root.querySelectorAll('button,input,textarea,select,summary')].filter(control=>!control.disabled&&control.tabIndex!==-1&&control.getClientRects().length),at=controls.indexOf(document.activeElement);
 if(!controls.length)return;
 if(event.shiftKey&&at<=0){event.preventDefault();controls.at(-1).focus();}else if(!event.shiftKey&&(at<0||at===controls.length-1)){event.preventDefault();controls[0].focus();}
},true);

const referencePromptRender=render;
render=function(){if(S.screen!=='canvas'||referencePromptExpansion&&referencePromptExpansion.project!==S.project){referencePromptExpansion=null;referenceClearPromptPresentation();}referencePromptRender();};

if(S.screen==='canvas')refreshCanvasCreation();

const referencePromptReveal=revealSelectedNode;
revealSelectedNode=function(){if(!referencePromptExpansion)referencePromptReveal();};

/** Candidate review replaces expanded prompt editing instead of opening behind it. */
const referencePromptCandidateReview=openCandidateReview;
openCandidateReview=function(...args){if(referencePromptExpansion)referenceCollapsePrompt();return referencePromptCandidateReview(...args);};
