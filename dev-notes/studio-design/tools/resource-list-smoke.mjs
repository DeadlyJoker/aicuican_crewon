import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context=vm.createContext({structuredClone,S:{screen:'home'},handleAction(){},render(){},document:{addEventListener(){}},window:{addEventListener(){}}});
vm.runInContext(await readFile(new URL('../reference-resource-list.js',import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);
test('resource categories include old media and scripts without converting their kinds',()=>{
 run('var nodes=[{id:"s",kind:"story"},{id:"shot",kind:"shot"},{id:"voice",kind:"voice"},{id:"image",kind:"character"},{id:"text",kind:"note"},{id:"choice",kind:"choice"}];var original=JSON.stringify(nodes);');
 assert.equal(run('nodes.map(referenceResourceCategory).join(",")'),'story,video,audio,character,text,other');
 assert.equal(run('JSON.stringify(nodes)'),run('original'));
});
test('resource filters combine category text and existing tags without reordering',()=>{
 run('var input=[{id:"a",kind:"character",title:"苏晚",referenceTagIds:["person"]},{id:"b",kind:"scene",title:"雨巷",description:"苏晚经过"},{id:"c",kind:"text",title:"苏晚"}];');
 assert.equal(run('referenceResourceNodes(input,{category:"character",query:" 苏晚 "}).map(n=>n.id).join(",")'),'a');
 assert.equal(run('referenceResourceNodes(input,{category:"character",query:"苏晚"},"person").map(n=>n.id).join(",")'),'a');
 assert.equal(run('referenceResourceNodes(input,{category:"audio",query:""}).length'),0);
});
test('project list query and scroll state remain independent',()=>{
 run('referenceResourceState("one").query="keep";referenceResourceState("one").scrollTop=200;referenceResourceState("two").category="audio";');
 assert.equal(run('referenceResourceState("one").query'),'keep');
 assert.equal(run('referenceResourceState("one").scrollTop'),200);
 assert.equal(run('referenceResourceState("two").query'),'');
 assert.equal(run('referenceResourceState("two").category'),'audio');
});

test('characters, scenes and props remain separate from ordinary image results',()=>{
 run('var assets=[{id:"person",kind:"character"},{id:"scene",kind:"scene"},{id:"prop",kind:"image",assetCategory:"prop"},{id:"legacy",kind:"image",label:"道具"},{id:"image",kind:"image"}];var before=JSON.stringify(assets);');
 assert.equal(run('assets.map(referenceResourceCategory).join(",")'),'character,scene,prop,prop,image');
 assert.equal(run('referenceResourceNodes(assets,{category:"prop",query:""}).map(n=>n.id).join(",")'),'prop,legacy');
 assert.equal(run('referenceResourceNodes(assets,{category:"image",query:""}).map(n=>n.id).join(",")'),'image');
 assert.equal(run('JSON.stringify(assets)'),run('before'));
});

test('resource cards preview existing input safely while accepted images keep their thumbnails',()=>{
 run("function esc(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;');}function I(){return '<svg></svg>';}function referenceTags(){return [];}var draft={id:'draft',kind:'character',title:'新角色',referenceOnly:true,prompt:'<img src=x onerror=run()>角色描述'};var before=JSON.stringify(draft);var html=referenceResourceCard(draft);");
 assert.equal(run("html.includes('ref-resource-text')"),true);
 assert.equal(run("html.includes('&lt;img src=x onerror=run()&gt;角色描述')"),true);
 assert.equal(run("html.includes('<img src=x')"),false);
 assert.equal(run('JSON.stringify(draft)===before'),true);
 run("var ready={...draft,referenceOnly:false,adoptedCandidateId:'v1',candidates:[{id:'v1',frame:2}]};var readyHtml=referenceResourceCard(ready);");
 assert.equal(run("readyHtml.includes('still frame2')"),true);
 assert.equal(run("readyHtml.includes('ref-resource-text')"),false);
 assert.equal(run("referenceResourceCard({id:'blank',kind:'character',title:'空角色',referenceOnly:true}).includes('ref-resource-text')"),false);
});

test('local video cards use the retained file without autoplay or simulated frames',()=>{
 run("var referenceUploadUrls=new Map([[-7,'blob:https://localhost/local-file']]);var clip={id:'video',kind:'video',title:'本地片段',adoptedCandidateId:'v1',candidates:[{id:'v1',localMedia:{type:'视频',frame:-7,duration:2}}]};var original=JSON.stringify(clip);var card=referenceResourceCard(clip);");
 assert.equal(run("card.includes('class=\"ref-resource-video\"')"),true);
 assert.equal(run("card.includes('blob:https://localhost/local-file#t=0.001')"),true);
 assert.equal(run("card.includes('autoplay')"),false);
 assert.equal(run("card.includes('原始视频 · 2秒')"),true);
 assert.equal(run('JSON.stringify(clip)'),run('original'));
});

test('legacy list state follows project identity through rename without sharing its old record',()=>{
 run('S.referenceResourceViews={original:{category:"character",query:"苏晚",scrollTop:406,categoryScrollLeft:130}};S.referenceProjectMeta={original:{id:"stable-project"}};var legacy=JSON.stringify(S.referenceResourceViews.original);referenceMigrateResourceViews(S);S.referenceProjectMeta.renamed=S.referenceProjectMeta.original;delete S.referenceProjectMeta.original;S.project="renamed";');
 assert.equal(run('referenceResourceState().query'),'苏晚');
 assert.equal(run('referenceResourceState().scrollTop'),406);
 assert.equal(run('referenceResourceState().categoryScrollLeft'),130);
 run('referenceResourceState().query="changed";referenceMigrateResourceViews(S);');
 assert.equal(run('referenceResourceState().query'),'changed');
 assert.equal(run('S.referenceResourceViews.original'),undefined);
 run('S.referenceProjectMeta.original={id:"different-project"};');
 assert.equal(run('referenceResourceState("original").query'),'');
 assert.equal(run('referenceResourceState("renamed").query'),'changed');
});
