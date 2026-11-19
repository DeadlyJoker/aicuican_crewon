import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-collection-media.js',import.meta.url),'utf8');
const ctx=vm.createContext({document:{addEventListener(){},querySelectorAll(){return []}},window:{addEventListener(){}},nodeHtml(){return 'ordinary'},render(){},referenceRestoreUploadedImages(){return Promise.resolve()},referenceUploadUrls:new Map(),S:{selected:null},studioAdoptedCandidate:node=>node.candidates?.[0],esc:String,I:name=>'<svg>'+name+'</svg>'});vm.runInContext(source,ctx);
const run=code=>vm.runInContext(code,ctx);
test('supported image video and audio formats resolve explicitly',()=>{
 for(const [type,expected] of [['image/png','图片'],['video/mp4','视频'],['video/webm','视频'],['audio/wav','音频'],['audio/mpeg','音频']])assert.equal(run(`referenceCollectionFileType({type:${JSON.stringify(type)}})`),expected);
 assert.equal(run("referenceCollectionFileType({type:'application/javascript'})"),null);
});
test('media cards offer playback and independent canvas import',()=>{
 const html=run("referenceCollectionItemHtml({id:'v1',type:'视频',title:'片段',duration:2,width:640,height:360},false)");
 assert.match(html,/data-collection-preview="v1"/);assert.match(html,/640 × 360 · 2秒/);assert.match(html,/data-collection-import="v1"/);
 const managed=run("referenceCollectionItemHtml({id:'v1',type:'音频',title:'声音',duration:2},true)");assert.match(managed,/data-collection-remove="v1"/);assert.doesNotMatch(managed,/undefined/);
});

test('local media nodes use real media controls and preserve ordinary rendering',()=>{
 const html=run("nodeHtml({id:'v',title:'原片',kind:'video',x:0,y:0,w:380,candidates:[{localMedia:{frame:-1,type:'视频',duration:2}}]})");
 assert.match(html,/<video controls/);assert.match(html,/data-local-media-frame="-1"/);assert.doesNotMatch(html,/still frame/);assert.equal(run("nodeHtml({kind:'image'})"),'ordinary');
});
