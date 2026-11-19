/** Voice recordings commit only after successful decoding in the still-open editor. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-workbench-voice-upload.js',import.meta.url),'utf8');
function fixture(){
 const error={textContent:''},save={disabled:false},button={innerHTML:''},revoked=[];
 let complete,fail;
 const context=vm.createContext({referenceWorkbenchAssetEditor:{voicePreset:{id:'old',name:'Existing'}},referenceVoiceNodeId:null,referenceOpenWorkbenchAsset(){},referenceCloseWorkbenchAsset(){},referenceSelectVoice(){},referencePickWorkbenchLibrary(){},referenceRevertWorkbenchReuse(){},referenceVoiceTriggerContent:s=>s,referenceCollectionFileType:file=>file.type==='audio/wav'?'音频':null,referenceCollectionProbe:()=>new Promise((resolve,reject)=>{complete=resolve;fail=reject;}),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:url=>revoked.push(url)},document:{addEventListener(){},getElementById:()=>error,querySelector:s=>s==='[data-wb-asset-save]'?save:button},Date,esc:s=>s,I:()=>''});
 vm.runInContext(source+'\nreferenceDrawVoiceRecording=function(){};',context);
 return {context,error,save,revoked,complete:value=>complete(value),fail:error=>fail(error),run:expression=>vm.runInContext(expression,context)};
}
test('invalid input and failed decode preserve the prior preset',async()=>{
 const f=fixture();await f.run("referenceStageVoiceRecording({type:'image/png',size:10})");assert.match(f.error.textContent,/音频/);
 const pending=f.run("referenceStageVoiceRecording({type:'audio/wav',size:10,name:'test.wav'})");assert.equal(f.save.disabled,true);f.fail(new Error('decode failed'));await pending;
 assert.equal(f.run('referenceWorkbenchAssetEditor.voicePreset.id'),'old');assert.equal(f.save.disabled,false);assert.deepEqual(f.revoked,['blob:test']);
});
test('closing an editor during decoding discards the file without modifying the new editor',async()=>{
 const f=fixture(),pending=f.run("referenceStageVoiceRecording({type:'audio/wav',size:10,name:'test.wav'})");f.run("referenceWorkbenchAssetEditor={voicePreset:{id:'new'}}");f.complete({duration:2});await pending;
 assert.equal(f.run('referenceWorkbenchAssetEditor.voicePreset.id'),'new');assert.deepEqual(f.revoked,['blob:test']);
});
test('successful decode stages a recording and releases the save control',async()=>{
 const f=fixture(),pending=f.run("referenceStageVoiceRecording({type:'audio/wav',size:10,name:'test.wav'})");f.complete({duration:2});await pending;
 assert.equal(f.run('referenceWorkbenchAssetEditor.voicePreset.referenceAudio.duration'),2);assert.equal(f.run('referenceWorkbenchAssetEditor.voiceUpload.name'),'test.wav');assert.equal(f.save.disabled,false);
});
