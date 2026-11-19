/** Homepage references commit decoded originals to their captured creation mode. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-entry-media.js',import.meta.url),'utf8');
function fixture({failDecode=false,failSave=false}={}){
 const stored=[],revoked=[];
 const ctx=vm.createContext({S:{screen:'canvas',referenceMode:'previs'},home(){return '';},handleAction(){},render(){},persist(){if(failSave)throw new Error('quota');},referenceUploadUrls:new Map(),referenceRestoreUploadedImages:async()=>{},referenceCollectionFileType:file=>file.type==='image/png'?'图片':file.type==='video/mp4'?'视频':null,referenceCollectionProbe:async()=>{if(failDecode)throw new Error('decode');return {width:320,height:180,duration:2};},referenceStoreUpload:async record=>stored.push(record),studioScriptId:()=>String(stored.length),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:url=>revoked.push(url)},document:{addEventListener(){}},structuredClone,Date});
 vm.runInContext(source,ctx);return {run:s=>vm.runInContext(s,ctx),stored,revoked};
}
test('unsupported and corrupt files keep prior references intact',async()=>{
 for(const options of [{},{failDecode:true}]){
  const f=fixture(options);f.run("S.referenceEntryMedia={previs:[{id:'old'}]}");
  await f.run(`referenceReadEntryMedia([{name:'bad',type:'${options.failDecode?'image/png':'audio/wav'}',size:10}],'previs')`);
  assert.equal(f.run('S.referenceEntryMedia.previs.length'),1);assert.equal(f.stored.length,0);
  assert.equal(f.run('referenceEntryReading.size'),0);assert.equal(f.run('referenceEntryErrors.has("previs")'),true);
 }
});
test('decoded media belongs to the captured mode and retains original file metadata',async()=>{
 const f=fixture();f.run("S.referenceMode='drama'");
 await f.run("referenceReadEntryMedia([{name:'clip.mp4',type:'video/mp4',size:10}],'previs')");
 assert.equal(f.run('S.referenceEntryMedia.previs[0].duration'),2);assert.equal(f.run('S.referenceEntryMedia.drama'),undefined);
 assert.equal(f.stored[0].blob.name,'clip.mp4');assert.deepEqual(f.revoked,['blob:test']);
});
test('metadata storage failure does not present an unsaved attachment as available',async()=>{
 const f=fixture({failSave:true});await f.run("referenceReadEntryMedia([{name:'image.png',type:'image/png',size:10}],'previs')");
 assert.equal(f.run('S.referenceEntryMedia.previs.length'),0);assert.equal(f.run('referenceEntryErrors.has("previs")'),true);
});
