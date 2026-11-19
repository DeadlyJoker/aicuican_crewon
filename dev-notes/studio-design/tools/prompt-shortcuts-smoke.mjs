/** Prompt submission respects composition, line breaks and one-shot key presses. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-prompt-shortcuts.js',import.meta.url),'utf8');
function fixture(){const ctx=vm.createContext({listeners:{},S:{screen:'home'},currentModal:null,localStorage:{getItem(){return null;}},canvasPromptHtml(){return '';}});vm.runInContext("var document={addEventListener(type,handler){listeners[type]=handler;}};var submitted=0;function handleAction(){submitted++;}",ctx);vm.runInContext(source,ctx);return code=>vm.runInContext(code,ctx);}
test('submit modes leave composition and unrelated modifier keys untouched',()=>{
 const r=fixture();assert.equal(r("referencePromptShortcutMatches({key:'Enter'},'enter')"),true);
 for(const fields of ["shiftKey:true","ctrlKey:true","metaKey:true","altKey:true","isComposing:true","keyCode:229"]){assert.equal(r(`referencePromptShortcutMatches({key:'Enter',${fields}},'enter')`),false);}
 assert.equal(r("referencePromptShortcutMatches({key:'Enter',shiftKey:true},'shift-enter')"),true);assert.equal(r("referencePromptShortcutMatches({key:'Enter',shiftKey:false},'shift-enter')"),false);assert.equal(r("referencePromptShortcutMatches({key:'Enter'},'button')"),false);
});
test('a held key submits once and an active dialog prevents background submission',()=>{
 const r=fixture();r("var prevented=0;var panel={querySelector(){return {};},classList:{contains(){return false;}}};var event={key:'Enter',target:{id:'canvas-creation-prompt',closest(){return panel;}},preventDefault(){prevented++;},stopImmediatePropagation(){}};listeners.keydown(event);event.repeat=true;listeners.keydown(event);");assert.equal(r('submitted'),1);assert.equal(r('prevented'),2);
 r("event.repeat=false;currentModal='preview';listeners.keydown(event);");assert.equal(r('submitted'),1);
});
