import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-result-history.js',import.meta.url),'utf8');
function run(code,extra={}){const ctx=vm.createContext({structuredClone,URL,document:{addEventListener(){}},handleAction(){},...extra});vm.runInContext(source,ctx);return vm.runInContext(code,ctx);}
test('result history reads current project once and retains other projects independently',()=>{const value=run("var state={project:'A',nodes:[{id:'x',title:'new',kind:'image',candidates:[{id:'v',number:2,createdAt:'2026-11-10'}]}],projectDrafts:{A:{project:'A',nodes:[{id:'x',title:'stale',kind:'image',candidates:[{id:'v'}]}]},B:{project:'B',nodes:[{id:'x',title:'other',kind:'video',candidates:[{id:'v',number:1,createdAt:'2026-11-09'}]}]}}};referenceResultEntries(state)");assert.equal(value.length,2);assert.equal(value[0].title,'new');assert.equal(value[1].type,'video');assert.notEqual(value[0].key,value[1].key);});
test('reading history does not initialize missing candidates or change saved media',()=>{assert.equal(run("var state={project:'A',nodes:[{id:'empty',kind:'image'},{id:'text',kind:'text',candidates:[{id:'t'}]},{id:'voice',kind:'voice',candidates:[{id:'a',prompt:'old'}]}]};var entries=referenceResultEntries(state);entries[0].candidate.prompt='changed';state.nodes[2].candidates[0].prompt"),'old');});
test('removing and restoring history never changes source candidates and ignores unknown keys',()=>{assert.equal(run("var state={project:'A',nodes:[{id:'x',title:'图',kind:'image',candidates:[{id:'v',number:1}]}]};var key=referenceResultEntries(state)[0].key;referenceMoveResultRecords(state,[key,'missing'],true);referenceMoveResultRecords(state,[key],false);state.referenceHiddenResults.length"),0);assert.equal(run("var state={project:'A',nodes:[{id:'x',kind:'image',candidates:[{id:'v',number:1}]}]};referenceMoveResultRecords(state,[referenceResultEntries(state)[0].key],true);state.nodes[0].candidates.length"),1);});
test('local media history identifies a playable file instead of a missing image',()=>{
 const html=run("function I(name){return '<svg>'+name+'</svg>'};referenceResultPicture({type:'audio',candidate:{localMedia:{type:'音频',duration:2}}})");
 assert.match(html,/原始音频 · 2秒/);assert.doesNotMatch(html,/预览不可用|still frame/);
});
test('image downloads use original MIME for blob files and never expose opaque blob ids as extensions',()=>{
 assert.equal(run('referenceResultImageExtension(new URL("blob:http://localhost:3090/opaque-id"),"image/jpeg")'),'jpg');
 assert.equal(run('referenceResultImageExtension(new URL("blob:http://localhost:3090/opaque-id"),"")'),null);
 assert.equal(run('referenceResultImageExtension(new URL("http://localhost:3090/frame.WEBP"),"application/octet-stream")'),'webp');
 assert.equal(run('referenceResultImageExtension(new URL("http://localhost:3090/no-extension"),"image/png; charset=binary")'),'png');
 assert.equal(run('referenceResultImageFilename("folder/frame4.jpg",2,"jpg")'),'folder_frame4-v2.jpg');
});
test('reading an original image keeps its exact bytes and rejects failed responses',async()=>{
 const original=new Uint8Array([137,80,78,71,13,10,26,10]);
 const result=await run('referenceReadResultImage(new URL("blob:http://localhost:3090/original"))',{fetch:async()=>new Response(original,{headers:{'content-type':'image/png'}})});
 assert.equal(result.extension,'png');assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),original);
 await assert.rejects(run('referenceReadResultImage(new URL("http://localhost:3090/gone.png"))',{fetch:async()=>new Response(null,{status:404})}),/图片不可读取/);
});
