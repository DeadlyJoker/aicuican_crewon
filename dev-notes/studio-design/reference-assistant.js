/* Keep the existing local assistant reachable without replacing canvas creation controls. */
'use strict';
function referenceAssistantDraftKey(state){return state.referenceProjectMeta?.[state.project]?.id||state.project;}
function referenceAssistantDraft(state){return state.referenceAssistantDrafts?.[referenceAssistantDraftKey(state)]||'';}
function referenceSetAssistantDraft(state,value){
 const key=referenceAssistantDraftKey(state);state.referenceAssistantDrafts??={};
 if(value)state.referenceAssistantDrafts[key]=value;else delete state.referenceAssistantDrafts[key];
}
const referenceAssistantCanvas=canvasHtml;
canvasHtml=function(){
 const html=referenceAssistantCanvas();if(S.panel==='director')return html;
 return html.replace(/(<div class="canvas-viewport"[^>]*>)/,`$1<button class="ref-assistant-launch tip" data-action="director" aria-label="打开创作助手" title="创作助手 · 本地交互示例">${I('spark')}</button>`);
};
const referenceAssistantInspector=inspectorHtml;
inspectorHtml=function(){
 const html=referenceAssistantInspector();if(S.panel!=='director')return html;
 const script=studioScriptNode();
 const welcome=`<div class="ref-assistant-welcome"><p>CrewON Studio</p><h2>今天一起创作点什么？</h2><div>${script?btn('查看剧本','script-open:'+script.id,'ghost','script'):''}${btn('选择工作流','workflow-library','ghost','layers')}${btn('浏览项目资产','asset-vault','ghost','folder')}</div></div>`;
 const presented=html.replace(/(<div class="inspector-content">)([\s\S]*?)(<\/div><div class="chat-input-wrap">)/,(_,open,content,close)=>open+welcome+'<details class="ref-assistant-overview"><summary>项目概览</summary>'+content+'</details>'+close);
 const prepared=referenceAssistantDraft(S).trim()?presented:presented.replace(/(<button type="submit"[^>]*)(>)/,'$1 disabled$2');
 return prepared.replace('<aside class="inspector"','<aside class="inspector ref-assistant-panel"').replace(/(<textarea aria-label="与创作助手对话"[^>]*>)[\s\S]*?(<\/textarea>)/,(_,open,close)=>open+esc(referenceAssistantDraft(S))+close).replace('<span>只改你指定的部分</span>','<span>本地示例 · 未连接 Agent</span>');
};
document.addEventListener('input',event=>{
 if(!event.target.matches('#director-form textarea'))return;
 referenceSetAssistantDraft(S,event.target.value);const send=document.querySelector('#director-form button[type="submit"]');if(send)send.disabled=!event.target.value.trim();save();
});
if(S.screen==='canvas')render();
const referenceAssistantAction=handleAction;
handleAction=function(action){
 const closing=action==='close-panel'&&S.panel==='director';referenceAssistantAction(action);
 if(closing)document.querySelector('.ref-assistant-launch')?.focus({preventScroll:true});
};
