/* Assistant references pin adopted image versions without editing the canvas graph. */
'use strict';
let referenceAssistantPicking=null;
function referenceAssistantReferences(state){return state.referenceAssistantReferences?.[referenceAssistantDraftKey(state)]||[];}
function referenceAddAssistantReference(state,nodeId){
 const node=state.nodes.find(item=>item.id===nodeId),candidate=node&&studioAdoptedCandidate(node);
 if(!node||mediaKind(node)!=='image'||!candidate||node.referenceOnly)return {ok:false,error:'请选择已有参考图的图片、角色或场景'};
 const refs=referenceAssistantReferences(state),id=JSON.stringify([node.id,candidate.id]);
 if(refs.some(ref=>ref.id===id))return {ok:true,changed:false};
 if(refs.length>=5)return {ok:false,error:'最多选择 5 张图片，请先移除不需要的参考'};
 state.referenceAssistantReferences??={};state.referenceAssistantReferences[referenceAssistantDraftKey(state)]=[...refs,{id,sourceId:node.id,candidateId:candidate.id,title:node.title,frame:candidate.frame}];
 return {ok:true,changed:true};
}
function referenceRemoveAssistantReference(state,id){
 const key=referenceAssistantDraftKey(state),refs=referenceAssistantReferences(state);state.referenceAssistantReferences??={};state.referenceAssistantReferences[key]=refs.filter(ref=>ref.id!==id);
}
function referenceAssistantReferenceAvailable(state,ref){return !!state.nodes.find(node=>node.id===ref.sourceId)?.candidates?.some(candidate=>candidate.id===ref.candidateId);}
/** Record the referenced versions at submission, independently of the editable composer. */
function referenceAssistantDirectionEntry(state,text,createdAt){
 const references=referenceAssistantReferences(state).map(ref=>{
  const node=state.nodes.find(item=>item.id===ref.sourceId),candidate=node?.candidates?.find(item=>item.id===ref.candidateId);
  return {sourceId:ref.sourceId,sourceTitle:ref.title,candidateId:ref.candidateId,number:candidate?.number??null,frame:ref.frame,available:!!candidate};
 });
 return {type:'direction',text,createdAt,references:structuredClone(references)};
}
/** Save a local request without synthesizing an assistant response or modifying media. */
function referenceCommitAssistantRequest(state,text,createdAt){
 const request=text.trim();if(!request)return null;
 const entry=referenceAssistantDirectionEntry(state,request,createdAt);state.history??=[];state.history.push(entry);referenceSetAssistantDraft(state,'');return entry;
}
function referenceAssistantConversationHtml(state){
 const entries=(state.history||[]).filter(entry=>entry.type==='direction');if(!entries.length)return '';
 return `<section class="ref-assistant-conversation" role="log" aria-label="本地请求记录">${entries.map(entry=>`<article class="ref-assistant-message" aria-label="已保存的创作请求"><p>${esc(entry.text||'')}</p>${entry.skill?`<small class="ref-assistant-message-skill">${esc(entry.skill.name)} · v${esc(entry.skill.version)}</small>`:''}${referenceAssistantRequestContextHtml(entry.references)}<footer><span>已保存</span><time>${esc(candidateHistoryTime(entry))}</time></footer></article>`).join('')}</section>`;
}
function referenceAssistantRequestContextHtml(references){
 if(!references?.length)return '';
 return `<section class="ref-assistant-request-context" aria-label="本次参考"><span>本次参考 · ${references.length}</span><div>${references.map(ref=>`<div><span class="still frame${ref.frame}" role="img" aria-label="${esc(ref.sourceTitle)}"></span><p>${esc(ref.sourceTitle)}<small>${ref.number==null?'版本未记录':'v'+ref.number}${ref.available?'':' · 来源已移除'}</small></p></div>`).join('')}</div></section>`;
}
function referenceAssistantIsPicking(){return S.screen==='canvas'&&S.panel==='director'&&referenceAssistantPicking===referenceAssistantDraftKey(S);}
function referenceAssistantContextHtml(){
 return `<div class="ref-assistant-references" aria-label="助手参考">${referenceAssistantReferences(S).map(ref=>`<div class="ref-assistant-reference"><button type="button" data-assistant-preview="${esc(ref.id)}" data-preview-title="${esc(ref.title)}" aria-label="预览参考 ${esc(ref.title)}" title="${esc(ref.title)}${referenceAssistantReferenceAvailable(S,ref)?'':' · 来源已移除'}"><span class="ref-sb-asset-image still frame${ref.frame}"></span></button><button type="button" class="ref-assistant-reference-remove" data-assistant-remove="${esc(ref.id)}" aria-label="移除参考 ${esc(ref.title)}">${I('close')}</button></div>`).join('')}</div>`;
}
function referenceAssistantPickerHtml(){return `<div class="ref-assistant-pick-notice" role="status"><span>正在从画布选择图片 · ${referenceAssistantReferences(S).length}/5</span><button data-action="assistant-pick-done" type="button">完成</button></div>`;}
function referencePaintAssistantContext(){
 const root=document.querySelector('.ref-assistant-references');if(root)root.outerHTML=referenceAssistantContextHtml();
 document.querySelectorAll('.node[data-assistant-selectable]').forEach(element=>{const node=S.nodes.find(item=>item.id===element.dataset.node),candidate=node&&studioAdoptedCandidate(node);element.toggleAttribute('data-assistant-picked',!!candidate&&referenceAssistantReferences(S).some(ref=>ref.sourceId===node.id&&ref.candidateId===candidate.id));});
 const notice=document.querySelector('.ref-assistant-pick-notice');if(notice)notice.outerHTML=referenceAssistantPickerHtml();
}
const referenceAssistantContextInspector=inspectorHtml;
inspectorHtml=function(){
 const html=referenceAssistantContextInspector();if(S.panel!=='director')return html;
 const thread=referenceAssistantConversationHtml(S),presented=thread?html.replace(/(<div class="inspector-content">)[\s\S]*?(<\/div><div class="chat-input-wrap">)/,(_,open,close)=>open+thread+'<details class="ref-assistant-overview"><summary>项目概览</summary>'+directorHtml()+'</details>'+close):html;
 return presented.replace('<form class="chat-input" id="director-form">',`<form class="chat-input" id="director-form"><div class="ref-assistant-composer-context">${referenceAssistantContextHtml()}<button type="button" class="ref-assistant-pick" data-action="assistant-pick" aria-label="从画布选择参考" aria-pressed="${referenceAssistantIsPicking()}" title="从画布选择参考">${I('pointer')}</button></div>`);
};
const referenceAssistantContextCanvas=canvasHtml;
canvasHtml=function(){
 const html=referenceAssistantContextCanvas();if(!referenceAssistantIsPicking())return html;
 return html.replace('ref-canvas-body','ref-canvas-body ref-assistant-picking').replace(/(<div class="canvas-viewport"[^>]*>)/,`$1${referenceAssistantPickerHtml()}`);
};
const referenceAssistantContextNode=nodeHtml;
nodeHtml=function(node){const html=referenceAssistantContextNode(node),candidate=studioAdoptedCandidate(node);if(mediaKind(node)!=='image'||!candidate||node.referenceOnly)return html;const picked=referenceAssistantReferences(S).some(ref=>ref.sourceId===node.id&&ref.candidateId===candidate.id);return html.replace('<article ',`<article data-assistant-selectable ${picked?'data-assistant-picked ':''}`);};
const referenceAssistantContextAction=handleAction;
handleAction=function(action){
 if(action==='assistant-pick'){referenceAssistantPicking=referenceAssistantIsPicking()?null:referenceAssistantDraftKey(S);render();return;}
 if(action==='assistant-pick-done'){referenceAssistantPicking=null;render();document.querySelector('[data-action="assistant-pick"]')?.focus({preventScroll:true});return;}
 if(['close-panel','director','home','ref-nav:projects'].includes(action))referenceAssistantPicking=null;
 referenceAssistantContextAction(action);
};
document.addEventListener('pointerdown',event=>{
 if(!referenceAssistantIsPicking()||event.button!==0||!event.target.closest('.node[data-node]'))return;
 event.preventDefault();event.stopImmediatePropagation();
},true);
document.addEventListener('click',event=>{
 const remove=event.target.closest('[data-assistant-remove]'),preview=event.target.closest('[data-assistant-preview]');
 if(remove||preview){event.preventDefault();event.stopImmediatePropagation();if(remove){referenceRemoveAssistantReference(S,remove.dataset.assistantRemove);save();referencePaintAssistantContext();document.querySelector('[data-action="assistant-pick"]')?.focus({preventScroll:true});}else referenceOpenAssetPreview(preview);return;}
 const node=referenceAssistantIsPicking()&&event.target.closest('.node[data-node]');if(!node)return;
 event.preventDefault();event.stopImmediatePropagation();const result=referenceAddAssistantReference(S,node.dataset.node);if(!result.ok){toast(result.error);return;}save();referencePaintAssistantContext();
},true);
document.addEventListener('keydown',event=>{
 if(!referenceAssistantIsPicking())return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();handleAction('assistant-pick-done');return;}
 const node=event.target.closest('.node[data-node]');if(!node||!['Enter',' '].includes(event.key)||event.target.closest('input,textarea'))return;
 event.preventDefault();event.stopImmediatePropagation();const result=referenceAddAssistantReference(S,node.dataset.node);if(!result.ok){toast(result.error);return;}save();referencePaintAssistantContext();
},true);
if(S.screen==='canvas'&&S.panel==='director')render();
