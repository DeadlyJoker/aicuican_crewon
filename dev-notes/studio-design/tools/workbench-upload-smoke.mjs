/** Local imports stage output without modifying an accepted asset before Save. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const code=(await readFile(new URL('../reference-workbench-upload.js',import.meta.url),'utf8')).replace('void referenceRestoreUploadedImages();','');
function setup(){
 const nodes=new Map(),revoked=[];const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',className:'',style:{},innerHTML:'',outerHTML:'<div></div>',querySelector:selector=>node(selector),remove(){},setAttribute(){}});return nodes.get(selector);};
 const ctx=vm.createContext({referenceWorkbenchAssetEditor:{id:'a'},referenceCloseWorkbenchAsset(){},referenceAssetEditorDirty(){return false;},handleAction(){},document:{getElementById:node,querySelector:node,addEventListener(){}},URL:{createObjectURL:file=>'blob:'+file.name,revokeObjectURL:url=>revoked.push(url)},Image:class{naturalWidth=100;naturalHeight=100;decode(){return Promise.resolve();}},Date,Error,structuredClone});
 vm.runInContext(code,ctx);return {ctx,nodes,revoked};
}
test('selecting a valid image stages it and cancel releases its preview',async()=>{
 const {ctx,revoked}=setup();await vm.runInContext("referenceStageUpload({name:'portrait.png',type:'image/png',size:100})",ctx);
 assert.equal(vm.runInContext('referenceWorkbenchAssetEditor.upload.name',ctx),'portrait.png');assert.equal(vm.runInContext('referenceAssetEditorDirty()',ctx),true);
 assert.equal(vm.runInContext('referenceWorkbenchAssetEditor.reuse',ctx),undefined);
 vm.runInContext('referenceCloseWorkbenchAsset()',ctx);assert.deepEqual(revoked,['blob:portrait.png']);
});
test('invalid and oversized inputs leave the existing staged image intact',async()=>{
 const {ctx,nodes}=setup();await vm.runInContext("referenceStageUpload({name:'portrait.png',type:'image/png',size:100})",ctx);
 await vm.runInContext("referenceStageUpload({name:'bad.svg',type:'image/svg+xml',size:100})",ctx);
 assert.equal(vm.runInContext('referenceWorkbenchAssetEditor.upload.name',ctx),'portrait.png');assert.match(nodes.get('ref-wb-asset-error').textContent,/PNG/);
 await vm.runInContext("referenceStageUpload({name:'huge.png',type:'image/png',size:21*1024*1024})",ctx);assert.match(nodes.get('ref-wb-asset-error').textContent,/20 MB/);
});
test('a completed decode from a closed editor does not stage output',async()=>{
 const {ctx,revoked}=setup();let finish;ctx.Image=class{naturalWidth=10;naturalHeight=10;decode(){return new Promise(resolve=>{finish=resolve;});}};
 const pending=vm.runInContext("referenceStageUpload({name:'late.png',type:'image/png',size:10})",ctx);ctx.referenceWorkbenchAssetEditor=null;finish();await pending;assert.deepEqual(revoked,['blob:late.png']);
});
