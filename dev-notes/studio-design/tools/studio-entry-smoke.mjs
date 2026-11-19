/** Short-drama starts review its script; canvas-first modes retain their entry. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-settings.js',import.meta.url),'utf8');
function start(mode,drama){
 const opened=[],calls=[];
 const ctx=vm.createContext({S:{referenceMode:mode,referenceDrama:drama,referenceOptions:{episodes:'5 集'}},structuredClone,handleAction:action=>calls.push(action),home:()=>'',render(){},save(){},studioScriptNode:()=>({id:'new-script'}),studioSeriesInitialize(){},openScriptWorkbench:id=>opened.push(id),document:{addEventListener(){},getElementById(){return null;}},window:{addEventListener(){}}});
 vm.runInContext(source+";handleAction('ref-start');",ctx);return {opened,calls};
}
test('writing, adapting and producing short drama open the new script workbench',()=>{
 for(const mode of ['write','adapt','produce'])assert.deepEqual(start('drama',mode),{opened:['new-script'],calls:['ref-start']});
});
test('redraw, free creation, previs and interactive creation stay on their original canvas route',()=>{
 for(const [mode,drama] of [['drama','redraw'],['create','write'],['previs','write'],['interactive','write']])assert.deepEqual(start(mode,drama),{opened:[],calls:['ref-start']});
});
