/** Camera settings are cyclic draft choices and enter requests only when enabled. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../camera-control.js',import.meta.url),'utf8');
const catalog=await readFile(new URL('../camera-control-catalog.js',import.meta.url),'utf8');
const image=await readFile(new URL('../reference-image.js',import.meta.url),'utf8');
function run(code){return vm.runInNewContext(catalog+'\n'+source+'\n'+image+'\n'+code,{structuredClone,handleAction(){},document:{addEventListener(){},getElementById(){return null;}},window:{addEventListener(){}}});}
test('camera defaults do not mutate empty drafts or turn themselves on',()=>{assert.equal(run("var d={};var settings=cameraControlResolve(d);settings.camera==='Sony VENICE（索尼）'&&!settings.enabled&&!Object.keys(d).length"),true);});
test('cycling through each category returns to the original choice',()=>{assert.equal(run("Object.keys(cameraControlCatalog).every(key=>{var initial=cameraControlResolve({}),next=initial;for(var i=0;i<cameraControlCatalog[key].length;i++)next=cameraControlStep(next,key,1);return next[key]===initial[key]})"),true);});
test('disabled settings stay out of execution and enabled settings are copied',()=>{assert.equal(run("var d={creationCamera:cameraControlResolve({})};var disabled=referenceImageSettings(d);d.creationCamera.enabled=true;var enabled=referenceImageSettings(d);d.creationCamera.focal='50 mm';!disabled.cameraControl&&enabled.cameraControl.focal==='8 mm'"),true);});
