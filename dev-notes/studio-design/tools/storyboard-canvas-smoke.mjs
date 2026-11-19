import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const files=['reference-group-model.js','reference-node-commands.js','reference-storyboard-assets.js','reference-storyboard-canvas.js'];
const source=(await Promise.all(files.map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')))).join('\n');
function fixture(){const context=vm.createContext({structuredClone,canvasCreationHtml(){return '';},handleAction(){},canvasVideoModeHtml(){return '';},canvasPromptCanSubmit(){return true;},handleCanvasCreationAction(){return false;},mediaKind(){return 'video';},canvasVideoReferencePlan(d){return {mode:d.creationVideoMode||'reference'};},studioAssetReferenceSnapshot(n){return n.assetReferences;},referenceStoryboardFields:[['color','色彩基调']]});vm.runInContext(source+`;
var state={nodes:[{id:'script',kind:'story',x:0,y:0,w:200,scriptSeries:{episodes:[{id:'episode',number:1,assetIds:['actor']}],storyboardDemo:{episode:{revision:1,groups:[{id:'g',seconds:8,sceneTitle:'站台',prompt:'原分镜',segments:[{id:'shot'}]}]}}}},{id:'actor',kind:'character',title:'旅人',x:210,y:0,w:200,referenceOnly:false,adoptedCandidateId:'v1',candidates:[{id:'v1',number:1,frame:2}]},{id:'shot',kind:'shot',x:500,y:0,w:200,assetReferences:[]}],edges:[['actor','shot']],nodeDrafts:{},versions:{}};
var S=state;var counter=0;var newId=()=> 'draft-'+(++counter);`,context);return code=>vm.runInContext(code,context);}
test('creation pins assets and reviewed prompts without inventing video output',()=>{const r=fixture();r("var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId);var video=state.nodes.find(n=>n.id===result.ids[0]);");assert.equal(r('result.ok'),true);assert.equal(r('video.prompt'),'原分镜');assert.equal(r('video.referenceOnly'),true);assert.equal(r('video.candidates.length'),0);assert.equal(r('video.assetReferences[0].candidateId'),'v1');assert.equal(r('state.referenceGroups.groups.at(-1).nodeIds[0]'),r('video.id'));});
test('unmade images retain planning identity without fabricating candidate references',()=>{const r=fixture();r("state.nodes[1].referenceOnly=true;var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId);var video=state.nodes.find(n=>n.id===result.ids[0]);");assert.equal(r('result.ok'),true);assert.equal(r('video.assetReferences.length'),0);assert.equal(r('referenceStoryboardPendingAssets(video,video.assetReferences)[0].title'),'旅人');assert.equal(r('video.creationPreferences.creationVideoMode'),'reference');assert.equal(r('canvasPromptCanSubmit(video,video.creationPreferences,video.prompt)'),false);assert.equal(r("canvasPromptCanSubmit(video,{creationVideoMode:'text'},video.prompt)"),true);});
test('repeated creation keeps edited video drafts and creates nothing else',()=>{const r=fixture();r("var first=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId);state.nodes.find(n=>n.id===first.ids[0]).prompt='已改视频草稿';var before=JSON.stringify(state);var second=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId)");assert.equal(r('second.changed'),false);assert.equal(r('JSON.stringify(state)===before'),true);});
test('new storyboard revision creates independent drafts and preserves old asset versions',()=>{const r=fixture();r("var first=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId);state.nodes[0].scriptSeries.storyboardDemo.episode.revision=2;state.nodes[0].scriptSeries.storyboardDemo.episode.groups[0].prompt='新版';state.nodes[1].candidates.push({id:'v2',number:2,frame:4});state.nodes[1].adoptedCandidateId='v2';var second=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId)");assert.equal(r('state.nodes.find(n=>n.id===first.ids[0]).prompt'),'原分镜');assert.equal(r('state.nodes.find(n=>n.id===first.ids[0]).assetReferences[0].candidateId'),'v1');assert.equal(r('state.nodes.find(n=>n.id===second.ids[0]).assetReferences[0].candidateId'),'v2');});
test('undo removes newly materialized drafts and restores previous groups and references',()=>{const r=fixture();r("var before=JSON.stringify(state);var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId);var undo=referenceRestoreNodeGraph(state,result.entry.after,result.entry.before)");assert.equal(r('undo.ok'),true);assert.equal(r('JSON.stringify(state)===before'),true);});
test('id collisions are rejected before adding nodes or groups',()=>{const r=fixture();r("var before=JSON.stringify(state);var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',()=> 'actor')");assert.equal(r('result.ok'),false);assert.equal(r('JSON.stringify(state)===before'),true);});

test('edited structured fields are included in the video prompt',()=>{const r=fixture();r("state.nodes[0].scriptSeries.storyboardDemo.episode.groups[0].segments[0].fields={color:'暖黄'};var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId)");assert.match(r('state.nodes.find(n=>n.id===result.ids[0]).prompt'),/色彩基调：暖黄/);});

test('review and draft creation resolve pinned references without requiring a duplicate edge',()=>{
 const r=fixture();r("state.edges=[];state.nodes[2].assetReferences=[{sourceId:'actor'}];var refs=referenceStoryboardGroupAssets(state,state.nodes[0].scriptSeries.storyboardDemo.episode.groups[0]);var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId)");
 assert.equal(r('refs.length'),1);assert.equal(r('refs[0].node.title'),'旅人');assert.equal(r('state.nodes.find(n=>n.id===result.ids[0]).assetReferences[0].sourceId'),'actor');
});

test('explicit mentions resolve longest names without inventing references from ordinary prose',()=>{
 const r=fixture();const result=JSON.parse(r(`JSON.stringify(referenceStoryboardMentions('旅人看向 @旅人雨衣，随后 @旅人 转身；@旅人甲 保持文字。',[{id:'a',title:'旅人'},{id:'b',title:'旅人雨衣'}]))`));
 assert.deepEqual(result.filter(p=>p.assetId).map(p=>p.assetId),['b','a']);assert.equal(result.map(p=>p.text).join(''),'旅人看向 @旅人雨衣，随后 @旅人 转身；@旅人甲 保持文字。');
});

test('saved mention-only assets participate in draft reference validation',()=>{
 const r=fixture();r("state.edges=[];state.nodes[0].scriptSeries.storyboardDemo.episode.groups[0].mentionedAssetIds=['actor'];var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId)");assert.equal(r('result.ok'),true);assert.equal(r('state.nodes.find(n=>n.id===result.ids[0]).assetReferences[0].sourceId'),'actor');
});

test('whole-series creation commits both episodes once and undoes as one operation',()=>{
 const r=fixture();r("state.nodes[0].scriptSeries.episodes.push({id:'second',number:2,assetIds:['actor']});state.nodes[0].scriptSeries.storyboardDemo.second=structuredClone(state.nodes[0].scriptSeries.storyboardDemo.episode);var before=JSON.stringify(state);var first=referenceCreateAllStoryboardVideoDrafts(state,'script',newId);var after=JSON.stringify(state);var second=referenceCreateAllStoryboardVideoDrafts(state,'script',newId);var same=JSON.stringify(state)===after;var undo=referenceRestoreNodeGraph(state,first.entry.after,first.entry.before)");
 assert.equal(r('first.ok'),true);assert.equal(r('first.ids.length'),2);assert.equal(r('second.changed'),false);assert.equal(r('same'),true);assert.equal(r('undo.ok'),true);assert.equal(r('JSON.stringify(state)===before'),true);
});
test('missing source nodes remain visible planning inputs across the whole batch',()=>{
 const r=fixture();r("state.nodes[0].scriptSeries.episodes.push({id:'second',number:2,assetIds:['actor']});state.nodes[0].scriptSeries.storyboardDemo.second=structuredClone(state.nodes[0].scriptSeries.storyboardDemo.episode);state.nodes[0].scriptSeries.storyboardDemo.second.groups[0].mentionedAssetIds=['missing'];var result=referenceCreateAllStoryboardVideoDrafts(state,'script',newId);var video=state.nodes.find(n=>n.storyboardOrigin?.episodeId==='second');");
 assert.equal(r('result.ok'),true);assert.equal(r('result.ids.length'),2);assert.equal(r('referenceStoryboardPendingAssets(video,video.assetReferences)[0].id'),'missing');assert.equal(r('video.assetReferences.length'),1);
});
test('binding planned inputs clears pending state while preserving earlier reference versions',()=>{
 const r=fixture();r("state.nodes[1].referenceOnly=true;var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId);var video=state.nodes.find(n=>n.id===result.ids[0]);video.assetReferences=[{sourceId:'actor',candidateId:'v2'}];");
 assert.equal(r('referenceStoryboardPendingAssets(video,video.assetReferences).length'),0);assert.equal(r('canvasPromptCanSubmit(video,video.creationPreferences,video.prompt)'),true);
 assert.equal(r('referenceStoryboardPendingAssets({storyboardOrigin:{}},[]).length'),0);
});
test('unparsed episodes prevent whole-series creation without altering completed drafts',()=>{
 const r=fixture();r("referenceCreateStoryboardVideoDrafts(state,'script','episode',newId);state.nodes[0].scriptSeries.episodes.push({id:'second',number:2});var before=JSON.stringify(state);var result=referenceCreateAllStoryboardVideoDrafts(state,'script',newId)");
 assert.equal(r('result.ok'),false);assert.equal(r('JSON.stringify(state)===before'),true);
});

test('pending asset actions locate the source before generic storyboard actions intercept them',()=>{
 const r=fixture();r("var focused=null;function nodeById(id){return state.nodes.find(n=>n.id===id);}function focusNode(id){focused=id;}handleAction('ref-sb-pending-asset:actor');");
 assert.equal(r('focused'),'actor');
});

test('missing-reference navigation returns to the same video without modifying its data',()=>{
 const r=fixture();
 r("var result=referenceCreateStoryboardVideoDrafts(state,'script','episode',newId);var video=state.nodes.find(n=>n.id===result.ids[0]);var S=state;S.selected=video.id;var nodeById=id=>state.nodes.find(n=>n.id===id);var focusNode=id=>{S.selected=id;};var before=JSON.stringify(video);handleAction('ref-sb-pending-asset:actor');");
 assert.equal(r('S.selected'),'actor');
 r("handleAction('ref-sb-return-video')");
 assert.equal(r('S.selected'),r('video.id'));
 assert.equal(r('JSON.stringify(video)'),r('before'));
 assert.equal(r('referenceStoryboardAssetReturn'),null);
});


test('video prompts retain each reviewed segment once with its timeline',()=>{
 const r=fixture();r("var group={prompt:'旅人走近\\n\\n旧灯亮起',segments:[{id:'a',title:'走近',seconds:4,fields:{prompt:'旅人走近',description:'旅人走近',color:'蓝色'}},{id:'b',title:'亮灯',seconds:5,fields:{prompt:'旧灯亮起',description:'旧灯亮起'}}]};var original=JSON.stringify(group);var prompt=referenceStoryboardVideoPrompt(group);");
 assert.equal(r("prompt.split('旅人走近').length-1"),1);assert.equal(r("prompt.split('旧灯亮起').length-1"),1);
 assert.equal(r("prompt.includes('色彩基调：蓝色')"),true);assert.equal(r("prompt.includes('【4–9秒 亮灯】')"),true);assert.equal(r('JSON.stringify(group)'),r('original'));
});
test('distinct group guidance and legacy fields survive prompt assembly',()=>{
 const r=fixture();r("var prompt=referenceStoryboardVideoPrompt({prompt:'连续长镜头，不切换视角',segments:[{id:'a',seconds:5,fields:{description:'旅人走近',color:'蓝色'}}]});");
 assert.equal(r("prompt.includes('连续长镜头，不切换视角')"),true);assert.equal(r("prompt.includes('description：旅人走近')"),true);assert.equal(r("prompt.includes('色彩基调：蓝色')"),true);
});
