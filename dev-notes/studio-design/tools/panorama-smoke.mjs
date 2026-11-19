/** Saved camera inputs must not become nonfinite or leak across image versions. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-panorama.js',import.meta.url),'utf8');
const view=source.slice(source.indexOf('function referencePanoramaView('),source.indexOf('function referencePanoramaRemember('));
function read(saved,id='v1'){const context=vm.createContext({saved,id});vm.runInContext(view+';var result=referencePanoramaView(saved,id)',context);return JSON.parse(vm.runInContext('JSON.stringify(result)',context));}
test('another image version starts from a neutral view',()=>{assert.deepEqual(read({candidateId:'v0',yaw:95,pitch:40,hfov:45,ratio:'9:16',mirrored:true}),{candidateId:'v1',yaw:0,pitch:0,hfov:90,ratio:'16:9',mirrored:false,guides:false});});
test('camera angles wrap and remain within supported ranges',()=>{const result=read({candidateId:'v1',yaw:725,pitch:140,hfov:5});assert.equal(result.yaw,5);assert.equal(result.pitch,85);assert.equal(result.hfov,15);});
test('invalid durable camera values cannot reach the renderer',()=>{const result=read({candidateId:'v1',yaw:NaN,pitch:Infinity,hfov:'40',ratio:'not-a-ratio'});assert.equal(result.yaw,0);assert.equal(result.pitch,0);assert.equal(result.hfov,90);assert.equal(result.ratio,'16:9');});
test('valid camera settings round trip without modifying the saved record',()=>{const saved={candidateId:'v1',yaw:-110,pitch:-24,hfov:65,ratio:'21:9',mirrored:true,guides:true};const before=JSON.stringify(saved);assert.deepEqual(read(saved),saved);assert.equal(JSON.stringify(saved),before);});

test('close-up views between fifteen and thirty degrees retain their saved field of view',()=>{
 for(const hfov of [15,16,25,29,30,90,120])assert.equal(read({candidateId:'v1',hfov}).hfov,hfov);
 assert.equal(read({candidateId:'v1',hfov:200}).hfov,120);
});
