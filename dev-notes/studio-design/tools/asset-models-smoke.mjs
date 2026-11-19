/** Model choices retain exact observed parameter names and isolate each selection. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const files=['reference-image-model-catalog.js','reference-video-models.js','reference-asset-models.js'];
const sources=await Promise.all(files.map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
function run(code){return vm.runInNewContext(sources.join('\n')+'\n'+code,{structuredClone,document:{addEventListener(){}},window:{addEventListener(){}},handleAction(){},esc:String,I(){return ''}});}
test('each visible image family has separate text and image definitions',()=>{
 assert.equal(run('referenceImageModelCatalog.families.length'),38);
 assert.equal(run('referenceImageModelCatalog.families.every(f=>f.textCode!==f.imageCode&&referenceImageModelCatalog.definitions[f.textCode]&&referenceImageModelCatalog.definitions[f.imageCode])'),true);
});
test('switching models reinitializes provider parameters without changing the earlier snapshot',()=>{
 const result=run("var d={};referenceSelectAssetImageModel(d,'text-image-rhart-image-g-2.5-official-token-sunburst');d.creationImageProvider.params.quality='max';var prior=structuredClone(d.creationImageProvider);referenceSelectAssetImageModel(d,'text-image-seedream-v5-lite');JSON.stringify({prior:prior.params.quality,newQuality:d.creationImageProvider.params.quality,hasActualResolution:Object.hasOwn(d.creationImageProvider.params,'whResolution'),hasGuessedResolution:Object.hasOwn(d.creationImageProvider.params,'resolution')})");
 assert.deepEqual(JSON.parse(result),{prior:'max',hasActualResolution:true,hasGuessedResolution:false});
});
test('unknown model does not overwrite a valid selection',()=>{
 assert.equal(run("var d={};referenceSelectAssetImageModel(d,'text-image-seedream-v5-lite');var before=JSON.stringify(d);!referenceSelectAssetImageModel(d,'missing')&&before===JSON.stringify(d)"),true);
});
test('ratio and resolution use the model dimension table',()=>{
 assert.equal(run("var d={};referenceSelectAssetImageModel(d,'text-image-seedream-v5-lite');var def=referenceAssetImageBinding(d).definition;var next=referenceResolveAssetImageParams(def,{...d.creationImageProvider.params,whAspectRatio:'16:9',whResolution:'4K'});next.width===4096&&next.height===2304"),true);
 assert.equal(run("referenceAssetProviderOptions(referenceImageModelCatalog.definitions['text-image-seedream-v5-lite'].properties.whAspectRatio)[0].value"),'1:1');
});
test('referenced image nodes use image-to-image definitions and freeze candidate parameters',()=>{
 const result=run("function studioAssetReferenceSnapshot(node){return node.refs||[]};var node={refs:[{sourceKind:'image'}]},draft={};referenceSelectAssetImageModel(draft,'text-image-rhart-image-g-2.5-official-token-sunburst','image');draft.creationImageProvider.params.quality='max';var captured=referenceImageExecutionSettings(node,draft);draft.creationImageProvider.params.quality='low';JSON.stringify({mode:captured.imageMode,code:captured.model,quality:captured.providerParams.quality,now:draft.creationImageProvider.params.quality})");
 assert.deepEqual(JSON.parse(result),{mode:'image',code:'image-image-rhart-image-g-2.5-official-token-sunburst-edit',quality:'max',now:'low'});
});
test('removing image references resolves text parameters without changing the stored image draft',()=>{
 const result=run("function studioAssetReferenceSnapshot(node){return node.refs||[]};var draft={};referenceSelectAssetImageModel(draft,'text-image-rhart-image-g-2.5-official-token-sunburst','image');draft.creationImageProvider.params.quality='max';var captured=referenceImageExecutionSettings({refs:[]},draft);JSON.stringify({mode:captured.imageMode,quality:captured.providerParams.quality,retained:draft.creationImageProvider.params.quality})");
 assert.deepEqual(JSON.parse(result),{mode:'text',quality:'high',retained:'max'});
});

test('model menus flip above a bottom canvas composer and stay within the viewport',()=>{
 const result=JSON.parse(run('JSON.stringify(referenceImageModelMenuLayout({left:95,top:550,bottom:586},1280,720))'));
 assert.deepEqual(result,{width:320,height:420,left:95,top:122});
 const small=JSON.parse(run('JSON.stringify(referenceImageModelMenuLayout({left:300,top:90,bottom:126},390,720))'));
 assert.equal(small.left,58);assert.equal(small.top,134);assert.equal(small.height,420);
});
test('homepage mode changes preserve valid shared dimensions without copying provider inputs',()=>{
 const result=run("var d={};referenceSelectAssetImageModel(d,'text-image-seedream-v5-lite');d.creationImageProvider.params={...d.creationImageProvider.params,whAspectRatio:'16:9',whResolution:'4K',prompt:'do not carry',imageUrls:['private-reference']};referenceRebindAssetImageMode(d,'image');var image=structuredClone(d.creationImageProvider);referenceRebindAssetImageMode(d,'text');JSON.stringify({code:image.modelCode,ratio:image.params.whAspectRatio,resolution:image.params.whResolution,width:image.params.width,height:image.params.height,hasPrompt:Object.hasOwn(image.params,'prompt'),hasInputs:Object.hasOwn(image.params,'imageUrls'),restored:d.creationImageProvider.params.whResolution})");
 const value=JSON.parse(result);assert.equal(value.code,'image-image-seedream-v5-lite');assert.equal(value.ratio,'16:9');assert.equal(value.resolution,'4K');assert.equal(value.width,4096);assert.equal(value.height,2304);assert.equal(value.hasPrompt,false);assert.equal(value.hasInputs,false);assert.equal(value.restored,'4K');
});
test('mode changes ignore incompatible options and parameters from unrelated model families',()=>{
 assert.equal(run("var d={};referenceSelectAssetImageModel(d,'text-image-seedream-v5-lite');d.creationImageProvider.params.whResolution='unsupported';referenceRebindAssetImageMode(d,'image');d.creationImageProvider.params.whResolution"),'2K');
 assert.equal(run("var d={};referenceSelectAssetImageModel(d,'text-image-seedream-v5-lite');d.creationImageProvider={modelCode:'unrelated',params:{whResolution:'4K'}};referenceRebindAssetImageMode(d,'image');d.creationImageProvider.params.whResolution"),'2K');
});
