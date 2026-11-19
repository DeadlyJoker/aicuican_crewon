/** Preset choices coexist by category and preserve model-request snapshots. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../image-presets.js',import.meta.url),'utf8');
const image=await readFile(new URL('../reference-image.js',import.meta.url),'utf8');
function run(script){return vm.runInNewContext(source+'\n'+image+'\n'+script,{structuredClone,handleAction(){},document:{addEventListener(){},getElementById(){return null;}},window:{addEventListener(){}}});}
test('different preset categories coexist while another filter replaces its predecessor',()=>{
 const value=JSON.parse(run("var s={nodes:[{id:'a',kind:'image',prompt:'原提示词'}],nodeDrafts:{}};imagePresetChoose(s,'a','functions',{name:'3秒后'});imagePresetChoose(s,'a','filters',{name:'柯达'});imagePresetChoose(s,'a','filters',{name:'富士'});JSON.stringify({presets:s.nodeDrafts.a.creationImagePresets,prompt:s.nodes[0].prompt})"));
 assert.deepEqual(value,{presets:{functions:{name:'3秒后'},filters:{name:'富士'}},prompt:'原提示词'});
});
test('removing one preset retains other categories and historical settings',()=>{
 assert.equal(run("var s={nodes:[{id:'a',kind:'image'}],nodeDrafts:{}};imagePresetChoose(s,'a','filters',{name:'柯达'});imagePresetChoose(s,'a','custom',{name:'光线',prefix:'自然光',suffix:'保留纹理'});var record=referenceImageSettings(s.nodeDrafts.a);imagePresetChoose(s,'a','filters',null);!s.nodeDrafts.a.creationImagePresets.filters&&s.nodeDrafts.a.creationImagePresets.custom.prefix==='自然光'&&record.imagePresets.filters.name==='柯达'"),true);
});
test('unsupported targets and preset types do not create drafts',()=>{
 assert.equal(run("var s={nodes:[{id:'a',kind:'video'}],nodeDrafts:{}};!imagePresetChoose(s,'a','filters',{name:'柯达'})&&!imagePresetChoose(s,'missing','custom',{})&&!imagePresetChoose(s,'a','invalid',{})&&Object.keys(s.nodeDrafts).length===0"),true);
});
