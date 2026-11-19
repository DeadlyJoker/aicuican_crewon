/* Input preferences are local to this browser and reuse the existing candidate submission. */
'use strict';
const referencePromptShortcutKey='crewon-studio-prompt-shortcut-v1';
let referencePromptShortcut='enter';
try{const saved=studioStorage.getItem(referencePromptShortcutKey);if(['enter','shift-enter','button'].includes(saved))referencePromptShortcut=saved;}catch(error){/* The default remains usable when browser storage is unavailable. */}
/** Match submission only after composition and without unrelated modifier keys. */
function referencePromptShortcutMatches(event,mode){return event.key==='Enter'&&!event.isComposing&&event.keyCode!==229&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&(mode==='enter'&&!event.shiftKey||mode==='shift-enter'&&event.shiftKey);}
function referencePromptShortcutHint(){return referencePromptShortcut==='enter'?'Enter 提交 · Shift+Enter 换行':referencePromptShortcut==='shift-enter'?'Shift+Enter 提交 · Enter 换行':'Enter 换行 · 点击按钮提交';}
function referencePromptShortcutSettingsHtml(){return `<section class="ref-input-shortcuts"><h3>提示词输入</h3><label><span>提交</span><select data-prompt-submit-shortcut aria-label="提示词提交快捷键"><option value="enter" ${referencePromptShortcut==='enter'?'selected':''}>Enter</option><option value="shift-enter" ${referencePromptShortcut==='shift-enter'?'selected':''}>Shift+Enter</option><option value="button" ${referencePromptShortcut==='button'?'selected':''}>仅按钮</option></select></label><p data-prompt-shortcut-hint>${referencePromptShortcutHint()}</p></section>`;}
const referenceShortcutPromptHtml=canvasPromptHtml;
canvasPromptHtml=function(...args){return referenceShortcutPromptHtml(...args)+`<small class="ref-prompt-keyhint" data-prompt-shortcut-hint>${referencePromptShortcutHint()}</small>`;};
document.addEventListener('change',event=>{
 if(!event.target.matches('[data-prompt-submit-shortcut]')||!['enter','shift-enter','button'].includes(event.target.value))return;
 referencePromptShortcut=event.target.value;document.querySelectorAll('[data-prompt-shortcut-hint]').forEach(element=>element.textContent=referencePromptShortcutHint());
 try{studioStorage.setItem(referencePromptShortcutKey,referencePromptShortcut);}catch(error){toast('快捷键仅在当前窗口生效，浏览器未能保存设置');}
});
document.addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.target.id!=='canvas-creation-prompt'||!referencePromptShortcutMatches(event,referencePromptShortcut))return;
 const panel=event.target.closest('.canvas-creation'),submit=panel?.querySelector('[data-action="canvas-creation-submit"]');
 if(!submit||panel.classList.contains('node-tool-panel')||currentModal)return;
 event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
 handleAction('canvas-creation-submit');
},true);
if(S.screen==='canvas')refreshCanvasCreation();
