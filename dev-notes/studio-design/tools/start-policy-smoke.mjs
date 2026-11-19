/** Creation review gates local example entry without changing unrelated creation modes. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-start-policy.js',import.meta.url),'utf8');
function harness(policy='ask',mode='create'){
 const state={referenceCreationPolicy:policy,referenceMode:mode,brief:'本地创作内容'},actions=[],messages=[];
 let dialog=false;
 const context=vm.createContext({S:state,
  document:{querySelector:selector=>selector==='.ref-start-review'&&dialog?{}:null,addEventListener(){}},
  window:{addEventListener(){}},referenceEntryInput:s=>s.brief,esc:text=>text,btn:()=>'',
  showDialog:()=>{dialog=true;return {querySelector:()=>({classList:{add(){}}})};},
  closeDialog:()=>{dialog=false;},toast:message=>messages.push(message),
  handleAction:action=>{actions.push(action);if(action==='close-modal')dialog=false;},
 });
 vm.runInContext(source,context);
 return {state,actions,messages,open:()=>dialog,act:action=>vm.runInContext(`handleAction(${JSON.stringify(action)})`,context)};
}
test('asking first does not start an example until confirmation',()=>{
 const h=harness();h.act('ref-start');assert.equal(h.open(),true);assert.deepEqual(h.actions,[]);
 h.act('ref-start-confirm');assert.equal(h.open(),false);assert.deepEqual(h.actions,['ref-start']);
 h.act('ref-start-confirm');assert.deepEqual(h.actions,['ref-start']);
});
test('cancelled and stale confirmations cannot start a project',()=>{
 const cancelled=harness();cancelled.act('ref-start');cancelled.act('close-modal');cancelled.act('ref-start-confirm');
 assert.deepEqual(cancelled.actions,['close-modal']);
 const changed=harness();changed.act('ref-start');changed.state.brief='修改后的内容';changed.act('ref-start-confirm');
 assert.deepEqual(changed.actions,[]);assert.equal(changed.messages.length,1);
});
test('direct entry and other creation modes retain their original handlers',()=>{
 const direct=harness('direct');direct.act('ref-start');assert.deepEqual(direct.actions,['ref-start']);assert.equal(direct.open(),false);
 const drama=harness('ask','drama');drama.act('ref-start');assert.deepEqual(drama.actions,['ref-start']);assert.equal(drama.open(),false);
});
test('empty input cannot open a review and unknown stored policies ask first',()=>{
 const empty=harness();empty.state.brief=' ';empty.act('ref-start');assert.equal(empty.open(),false);assert.deepEqual(empty.actions,[]);
 const old=harness('retired');old.act('ref-start');assert.equal(old.open(),true);assert.equal(old.state.referenceCreationPolicy,'ask');
});
test('a pending Agent confirmation cannot start a newly selected media mode',()=>{
 const h=harness();h.state.referenceCreateKind='agent';h.act('ref-start');h.state.referenceCreateKind='image';h.act('ref-start-confirm');assert.deepEqual(h.actions,[]);assert.equal(h.open(),false);
});
test('direct media modes do not expose the Agent planning confirmation',()=>{
 const h=harness();h.state.referenceCreateKind='image';h.act('ref-start');assert.equal(h.open(),false);assert.deepEqual(h.actions,['ref-start']);
});
