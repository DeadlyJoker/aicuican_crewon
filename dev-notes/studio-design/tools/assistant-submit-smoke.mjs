/** Local request submission keeps edits recoverable when browser persistence fails. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const [assistant,contextSource,app]=await Promise.all(['reference-assistant.js','reference-assistant-context.js','app.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
const start=app.indexOf("document.addEventListener('submit',event=>{"),end=app.indexOf("\ndocument.addEventListener('click'",start);assert.ok(start>=0&&end>start);
function fixture(fail=false){
 let submit;const stats={persisted:0,rendered:0,message:''},state={screen:'home',project:'A',history:[{type:'brief',text:'已有记录'}],nodes:[{id:'image',candidates:[{id:'v1',number:1,frame:0}]}],referenceAssistantDrafts:{A:'保留输入'},referenceAssistantReferences:{A:[{id:'ref',sourceId:'image',candidateId:'v1',title:'站台',frame:0}]}};
 const context=vm.createContext({S:state,structuredClone,handleAction(){},canvasHtml(){return ''},inspectorHtml(){return ''},nodeHtml(){return ''},document:{addEventListener(type,callback){if(type==='submit')submit=callback;},querySelector(){return null;}},persist(){if(fail)throw new Error('storage full');stats.persisted++;},render(){stats.rendered++;},toast(message){stats.message=message;}});
 vm.runInContext(assistant+'\n'+contextSource+'\n'+app.slice(start,end),context);
 return {state,stats,submit(value){submit({target:{id:'director-form',querySelector(){return {value};}},preventDefault(){}});}};
}
test('successful submission saves one request with pinned references and clears only its draft',()=>{
 const h=fixture();h.submit(' 新请求 ');assert.equal(h.state.history.length,2);assert.equal(h.state.history[1].text,'新请求');assert.equal(h.state.history[1].references[0].candidateId,'v1');assert.equal(h.state.referenceAssistantDrafts.A,undefined);assert.equal(h.state.referenceAssistantReferences.A.length,1);assert.equal(h.stats.persisted,1);assert.equal(h.stats.rendered,1);
});
test('failed persistence restores the previous history and unsent draft',()=>{
 const h=fixture(true),before=JSON.stringify(h.state);h.submit('新请求');assert.equal(JSON.stringify(h.state),before);assert.equal(h.stats.rendered,0);assert.match(h.stats.message,/请求未保存/);
});
test('empty submissions do not save, clear input, or render a request',()=>{
 const h=fixture(),before=JSON.stringify(h.state);h.submit(' \n ');assert.equal(JSON.stringify(h.state),before);assert.equal(h.stats.persisted,0);assert.equal(h.stats.rendered,0);
});
