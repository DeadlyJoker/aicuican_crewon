import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const sources=await Promise.all(['reference-group-model.js','reference-node-commands.js','reference-node-batch.js'].map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')));
function fixture(){const ctx=vm.createContext({structuredClone,S:{screen:'home'},handleAction(){},referenceTagFooter(){},document:{addEventListener(){}}});for(const source of sources)vm.runInContext(source,ctx);return code=>vm.runInContext(code,ctx);}
test('batch delete is atomic when any selected node is protected',()=>{const r=fixture();r("var state={nodes:[{id:'a',kind:'image'},{id:'b',kind:'story'}],edges:[]};var before=JSON.stringify(state);var result=referenceDeleteCanvasBatch(state,['a','b'])");assert.equal(r('result.ok'),false);assert.equal(r('JSON.stringify(state)===before'),true);});
test('batch deletion and one undo retain candidates links and draft data',()=>{
 const r=fixture();r("var state={nodes:[{id:'a',kind:'image',candidates:[{id:'v1'}]},{id:'b',kind:'audio',candidates:[{id:'v2'}]},{id:'c',kind:'image',assetReferences:[{sourceId:'a'}]}],edges:[['a','b']],nodeDrafts:{a:{prompt:'keep'}},versions:{},clips:[],layoutBase:[]};var before=JSON.stringify(state);var result=referenceDeleteCanvasBatch(state,['a','b','a'])");
 assert.equal(r('result.ok'),true);assert.equal(r('result.count'),2);assert.equal(r('state.nodes.length'),1);
 assert.equal(r('referenceRestoreNodeGraph(state,result.entry.after,result.entry.before).ok'),true);
 assert.equal(r("state.nodes.find(n=>n.id==='a').candidates[0].id"),'v1');assert.equal(r("state.nodeDrafts.a.prompt"),'keep');assert.equal(r('state.edges.length'),1);
});
test('a stale id rejects the whole batch before changes',()=>{const r=fixture();r("var state={nodes:[{id:'a',kind:'image'}],edges:[]};var result=referenceDeleteCanvasBatch(state,['a','missing'])");assert.equal(r('result.ok'),false);assert.equal(r('state.nodes.length'),1);});
test('confirmed screenplay assets reject the entire mixed batch',()=>{const r=fixture();r("var state={nodes:[{id:'free',kind:'image'},{id:'locked',kind:'image'},{id:'story',kind:'story',scriptSeries:{sharedAssetIds:[],episodes:[],assetConfirmation:{assets:[{id:'locked'}]}}}],edges:[]};var before=JSON.stringify(state);var result=referenceDeleteCanvasBatch(state,['free','locked'])");assert.equal(r('result.ok'),false);assert.equal(r('JSON.stringify(state)===before'),true);});
