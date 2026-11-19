/** Collection metadata and original files commit together or clean up the staged original. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-collection.js',import.meta.url),'utf8');
function fixture(options={}){
 const storage=new Map(),files=new Set(),installed=[],notices=[],revoked=[];let html='';
 const context=vm.createContext({localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>{if(options.failWrite)throw Error('quota');storage.set(key,value);}},document:{addEventListener(){},querySelector(){return null;},body:{insertAdjacentHTML(_position,value){html=value;}}},handleAction(){},currentModal:null,esc:String,I(){return '';},referenceCollectionItemHtml(){return '';},toast:message=>notices.push(message),crypto:{randomUUID:()=> 'new-item'},URL:{createObjectURL:()=> 'blob:temporary',revokeObjectURL:url=>revoked.push(url)},referenceCollectionFileType:()=> '视频',referenceCollectionProbe:options.probe||(()=>Promise.resolve({duration:2,width:640,height:360})),referenceStoreGridCrops:async records=>records.forEach(record=>files.add(record.frame)),referenceInstallUpload:record=>{if(options.failPreview)throw Error('preview');installed.push(record.frame);},referenceRemoveUncommittedImages:async frames=>{if(options.failCleanup)throw Error('db');frames.forEach(frame=>files.delete(frame));}});
 vm.runInContext(source,context);const run=code=>vm.runInContext(code,context);
 return {run,files,installed,notices,revoked,html:()=>html,upload:()=>run('referenceCollectionUpload({name:"test.webm",size:100})')};
}
test('a valid media original is committed before its preview becomes available',async()=>{
 const h=fixture();await h.upload();assert.equal(h.run('referenceCollectionRead().length'),1);assert.equal(h.files.size,1);assert.equal(h.installed.length,1);assert.equal(h.run('referenceCollectionState.busy'),false);assert.equal(h.revoked.length,1);
});
test('metadata write failure removes only the newly staged original',async()=>{
 const h=fixture({failWrite:true});h.files.add(-123);await h.upload();assert.deepEqual([...h.files],[-123]);assert.equal(h.installed.length,0);assert.equal(h.run('referenceCollectionRead().length'),0);assert.match(h.notices[0],/导入失败/);assert.equal(h.run('referenceCollectionState.busy'),false);
});
test('failed cleanup is reported distinctly without inventing a collection entry',async()=>{
 const h=fixture({failWrite:true,failCleanup:true});await h.upload();assert.equal(h.files.size,1);assert.equal(h.run('referenceCollectionRead().length'),0);assert.match(h.notices[0],/临时文件清理失败/);
});
test('an undecodable media file never reaches durable storage',async()=>{
 const h=fixture({probe:()=>Promise.reject(Error('decode'))});await h.upload();assert.equal(h.files.size,0);assert.equal(h.run('referenceCollectionRead().length'),0);assert.equal(h.revoked.length,1);
});
test('both upload entrances are disabled while inspection is pending and repeat upload is ignored',async()=>{
 let finish;const h=fixture({probe:()=>new Promise(resolve=>{finish=resolve;})}),pending=h.upload();
 assert.equal((h.html().match(/data-collection-upload disabled/g)||[]).length,2);assert.match(h.html(),/aria-busy="true"/);await h.upload();finish({duration:2,width:640,height:360});await pending;assert.equal(h.run('referenceCollectionRead().length'),1);
});
test('preview failure retains the committed original and reports its saved status',async()=>{
 const h=fixture({failPreview:true});await h.upload();assert.equal(h.files.size,1);assert.equal(h.run('referenceCollectionRead().length'),1);assert.match(h.notices[0],/素材已保存/);
});
