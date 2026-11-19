import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-asset-preview.js',import.meta.url),'utf8');
function fixture(){const context=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},studioAdoptedCandidate:node=>node.candidate});vm.runInContext(source,context);return code=>vm.runInContext(code,context);}
test('image information reports known local sources and never invents a remote model',()=>{
 const r=fixture();r("var node={title:'苏晚',candidate:{importedFile:'su-wan.png'}};var before=JSON.stringify(node);var info=referenceNodeImageInfo(node);");
 assert.equal(r('info.source'),'本地上传');assert.equal(r('info.model'),'');assert.equal(r('JSON.stringify(node)===before'),true);
 assert.equal(r("referenceNodeImageInfo({title:'画面',candidate:{reusedFrom:{sourceId:'source'}}}).source"),'复用素材');
 assert.equal(r("referenceNodeImageInfo({title:'旧样例',candidate:{}}).source"),'本地示例');
 assert.equal(r("referenceNodeImageInfo({title:'裁剪',candidate:{importedFile:'crop.png',localOperation:'grid-crop'}}).source"),'本地裁剪');
 assert.equal(r("referenceNodeImageInfo({title:'画面',candidate:{input:{creationSettings:{modelLabel:'已记录模型'}}}}).model"),'已记录模型');
});
test('fit uses natural pixels, preserves aspect ratio and does not upscale small images',()=>{
 const r=fixture();
 for(const [width,height,stageWidth,stageHeight,zoom] of [[1024,1024,900,1200,876/1024],[1920,1080,1200,600,576/1080],[400,200,900,600,1]]){
 r(`referenceAssetPreview={info:{},image:{naturalWidth:${width},naturalHeight:${height},style:{}},root:{querySelector(selector){if(selector==='.ref-asset-lightbox-stage')return {getBoundingClientRect:()=>({width:${stageWidth},height:${stageHeight}})};if(selector==='[data-preview-zoom]')return null;return {}; }},zoom:1,x:100,y:20,rotation:0,flipX:1,flipY:1};referenceFitAssetInfo();`);
 assert.equal(r('referenceAssetPreview.zoom'),zoom);assert.equal(r('referenceAssetPreview.x'),0);assert.equal(r('referenceAssetPreview.y'),0);
 }
});

test('ordinary previews use natural-pixel zoom and refit rotated images without an information panel',()=>{
 const r=fixture();r("var reset={};referenceAssetPreview={info:null,image:{naturalWidth:1280,naturalHeight:1600,style:{}},root:{querySelector(selector){if(selector==='.ref-asset-lightbox-stage')return {getBoundingClientRect:()=>({width:900,height:600})};if(selector==='[data-preview-zoom]')return null;return reset;}},rotation:0,zoom:1,x:12,y:20,flipX:1,flipY:1};referenceFitAssetInfo();");
 assert.equal(r('referenceAssetPreview.zoom'),576/1600);assert.equal(r('reset.textContent'),'36%');
 r("referenceAssetPreviewCommand('right');");assert.equal(r('referenceAssetPreview.zoom'),Math.min(876/1600,576/1280));assert.equal(r('referenceAssetPreview.rotation'),90);
 r("referenceAssetPreviewCommand('reset');");assert.equal(r('referenceAssetPreview.zoom'),1);assert.equal(r('referenceAssetPreview.rotation'),0);assert.equal(r('reset.textContent'),'100%');assert.equal(r('referenceAssetPreview.fitMode'),false);
});
