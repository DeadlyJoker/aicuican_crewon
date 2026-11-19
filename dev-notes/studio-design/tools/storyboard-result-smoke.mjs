import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const src=(await Promise.all(['reference-storyboard-assets.js','reference-storyboard-result.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')))).join('\n');
function fixture(){const ctx=vm.createContext({structuredClone,esc:value=>String(value),I:()=>'<svg></svg>',studioAdoptedCandidate:asset=>asset.candidates?.find(c=>c.id===asset.adoptedCandidateId),referenceStoryboardPending(){},referenceDrawWorkbench(){},referenceRememberWorkbenchScroll(){},handleAction(){},document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(src,ctx);return s=>vm.runInContext(s,ctx);}
test('local storyboard grouping retains script order and total duration without inventing fields',()=>{const r=fixture();r("var ep={document:{scenes:[{id:'s',title:'站台',shots:[{id:'a',title:'开场',seconds:8,action:'雨夜',dialogue:'你好'},{id:'b',title:'回应',seconds:8,action:'举灯'}]}]}};var built=referenceBuildLocalStoryboard(ep,'adaptive')");assert.equal(r('built.result.groups.length'),1);assert.equal(r('built.result.groups[0].seconds'),16);assert.equal(r('built.result.groups[0].segments[0].fields.lighting'),'');assert.equal(r("referenceBuildLocalStoryboard(ep,'standard').result.groups.length"),2);});
test('editing a group preserves previous revision and original script',()=>{const r=fixture();r("var ep={document:{scenes:[{id:'s',title:'站台',shots:[{id:'a',title:'开场',seconds:8,action:'原文'}]}]}};var result=referenceBuildLocalStoryboard(ep,'adaptive').result;var draft=structuredClone(result.groups[0]);draft.segments[0].fields.description='新画面';draft.prompt='连接';var saved=referenceSaveStoryboardGroup(result,draft.id,draft)");assert.equal(r('saved.ok'),true);assert.equal(r('result.versions[0].groups[0].segments[0].fields.description'),'原文');assert.equal(r('ep.document.scenes[0].shots[0].action'),'原文');assert.equal(r('result.groups[0].prompt'),'连接');});
test('invalid duration cannot be silently cut to fit a group',()=>{const r=fixture();assert.equal(r("referenceBuildLocalStoryboard({document:{scenes:[{id:'s',shots:[{id:'a',seconds:40}]}]}},'adaptive').ok"),false);});

test('asset preview uses the adopted candidate and keeps unmade assets empty',()=>{
 const r=fixture();assert.match(r("referenceStoryboardAssetMarkup({id:'a',title:'角色',frame:1,adoptedCandidateId:'v2',candidates:[{id:'v2',frame:4}]})"),/still frame4/);
 const empty=r("referenceStoryboardAssetMarkup({id:'a',title:'角色',frame:1,referenceOnly:true,candidates:[]})");assert.doesNotMatch(empty,/still frame/);assert.match(empty,/暂无参考图/);
});

test('saved explicit mentions become group references and removal retains the earlier revision',()=>{
 const r=fixture();r("var assets=[{id:'a',title:'旧站台'}];var result={revision:1,versions:[],groups:[{id:'g',prompt:'原文',segments:[]}]};var draft={id:'g',prompt:'@旧站台 保留雨夜',segments:[]};referenceSaveStoryboardGroup(result,'g',draft,assets)");assert.equal(r("result.groups[0].mentionedAssetIds.join(',')"),'a');
 r("referenceSaveStoryboardGroup(result,'g',{id:'g',prompt:'不再引用',segments:[]},assets)");assert.equal(r('result.groups[0].mentionedAssetIds.length'),0);assert.equal(r("result.versions[1].groups[0].mentionedAssetIds[0]"),'a');
});
test('inline mentions show thumbnails only for adopted images and retain unmade references',()=>{
 const r=fixture();
 r("var assets=[{id:'a',title:'旅人',candidates:[{id:'v1',frame:2}],adoptedCandidateId:'v1'},{id:'b',title:'旧灯',referenceOnly:true,candidates:[]}];function referenceStoryboardMentions(){return [{assetId:'a',text:'@旅人'},{text:' '},{assetId:'b',text:'@旧灯'}]};var html=referenceStoryboardMentionHtml('',assets)");
 assert.equal(r("(html.match(/ref-sb-mention-thumbnail/g)||[]).length"),1);
 assert.equal(r("html.includes('frame2')&&html.includes('data-sb-mention=\"b\"')"),true);
});
test('authored shot directions survive grouping as an independent snapshot',()=>{
 const r=fixture();r("var ep={document:{scenes:[{id:'s',title:'站台',shots:[{id:'a',title:'借灯',seconds:8,action:'递出灯',storyboardFields:{color:'冷暖对照',blocking:'原地交接',lighting:'暖光',performance:'克制',sound:'雨声',prompt:'缓慢交接'}}]}]}};var result=referenceBuildLocalStoryboard(ep,'adaptive').result;var fields=result.groups[0].segments[0].fields");
 assert.equal(r('fields.color'),'冷暖对照');assert.equal(r('fields.blocking'),'原地交接');assert.equal(r('fields.prompt'),'缓慢交接');
 r("fields.lighting='新光线'");assert.equal(r('ep.document.scenes[0].shots[0].storyboardFields.lighting'),'暖光');
});
test('prompt reading groups the overall direction and timed segments without changing data',()=>{
 const r=fixture();r("function referenceStoryboardMentions(text){return [{text}]};var group={prompt:'整体衔接',segments:[{title:'起点',seconds:8,fields:{prompt:'第一段'}},{title:'终点',seconds:6,fields:{prompt:'第二段'}}]};var before=JSON.stringify(group);var html=referenceStoryboardPromptHtml(group,[])");
 assert.match(r('html'),/【整体镜头衔接】/);assert.match(r('html'),/【分段完整提示词】/);
 assert.match(r('html'),/【0–8s 起点】/);assert.match(r('html'),/【8–14s 终点】/);
 assert.equal(r('JSON.stringify(group)===before'),true);
});

test('whole-series parsing preserves older revisions and rejects a later invalid episode atomically',()=>{
 const r=fixture();r("var episodes=[{id:'one',number:1,document:{scenes:[{id:'s1',shots:[{id:'a',seconds:8}]}]}},{id:'two',number:2,document:{scenes:[{id:'s2',shots:[{id:'b',seconds:10}]}]}}];var first=referenceBuildStoryboardEpisodes(episodes,'adaptive').results;var before=JSON.stringify(first);var second=referenceBuildStoryboardEpisodes(episodes,'adaptive',first);episodes[1].document.scenes[0].shots[0].seconds=40;var failed=referenceBuildStoryboardEpisodes(episodes,'adaptive',first)");
 assert.equal(r('second.ok'),true);assert.equal(r('second.results.one.revision'),2);assert.equal(r('second.results.two.versions.length'),1);assert.equal(r('failed.ok'),false);assert.equal(r('JSON.stringify(first)===before'),true);
});

test('reading and editing scroll positions do not overwrite each other',()=>{const r=fixture();r("var referenceWorkbench={};var main={dataset:{sbEpisode:'e1',sbGroup:'g1',sbMode:'read'},querySelector:s=>s==='.ref-sb-details'?{scrollTop:120}:{scrollTop:24}};document.querySelector=()=>main;referenceRememberStoryboardScroll();main.dataset.sbMode='edit';main.querySelector=s=>s==='.ref-sb-details'?{scrollTop:40}:{scrollTop:12};referenceRememberStoryboardScroll()");assert.equal(r("referenceWorkbench.storyboardPositions[JSON.stringify(['e1','g1','read'])].details"),120);assert.equal(r("referenceWorkbench.storyboardPositions[JSON.stringify(['e1','g1','edit'])].details"),40);});

test('saving an unchanged group does not create a new revision or history entry',()=>{const r=fixture();r("var result={revision:3,versions:[],groups:[{id:'g',prompt:'原文',segments:[{id:'s',fields:{color:'暖色'}}]}]};var before=JSON.stringify(result);var saved=referenceSaveStoryboardGroup(result,'g',structuredClone(result.groups[0]))");assert.equal(r('saved.changed'),false);assert.equal(r('JSON.stringify(result)===before'),true);});

test('initial grouping resolves authored mentions before any edit and keeps unknown names verbatim',()=>{
 const r=fixture();r("var assets=[{id:'actor',title:'林晚 · 旅人'},{id:'lamp',title:'旧灯'}],ep={document:{scenes:[{id:'s',title:'站台',shots:[{id:'a',title:'借灯',seconds:8,action:'@林晚 · 旅人 接过 @旧灯 。@陌生人 经过',storyboardFields:{blocking:'@旧灯 留在右手'}}]}]}};var before=JSON.stringify(ep);var result=referenceBuildLocalStoryboard(ep,'adaptive',assets).result");
 assert.equal(r("result.groups[0].mentionedAssetIds.join(',')"),'actor,lamp');
 assert.equal(r('JSON.stringify(ep)===before'),true);
 assert.match(r('result.groups[0].segments[0].fields.description'),/@陌生人/);
 assert.equal(r("referenceStoryboardGroupAssets({nodes:assets.map(a=>({...a,kind:'image'})),edges:[]},result.groups[0]).length"),2);
});

test('reading a different shot cannot overwrite the earlier shot position',()=>{
 const r=fixture();r("var referenceWorkbench={};var details={scrollTop:900},assets={scrollTop:100};var main={dataset:{sbEpisode:'e1',sbGroup:'g1',sbMode:'read'},querySelector:s=>s==='.ref-sb-details'?details:assets};document.querySelector=()=>main;referenceRememberStoryboardScroll();main.dataset.sbGroup='g2';details.scrollTop=20;assets.scrollTop=0;referenceRememberStoryboardScroll();");
 assert.equal(r("referenceWorkbench.storyboardPositions[JSON.stringify(['e1','g1','read'])].details"),900);
 assert.equal(r("referenceWorkbench.storyboardPositions[JSON.stringify(['e1','g2','read'])].details"),20);
});

test('reference review reports adopted versions and unavailable images without changing assets',()=>{
 const r=fixture();r("var references=[{node:{id:'a',kind:'character',title:'旅人',adoptedCandidateId:'v2',candidates:[{id:'v1',number:1,frame:1},{id:'v2',number:2,frame:2}]}},{node:{id:'b',title:'旧灯',referenceOnly:true,candidates:[]}},{id:'deleted'}];var before=JSON.stringify(references);var html=referenceStoryboardReferenceHtml(references)");
 assert.match(r('html'),/当前引用资产/);assert.match(r('html'),/frame2/);assert.doesNotMatch(r('html'),/frame1/);assert.match(r('html'),/v2/);assert.match(r('html'),/暂无参考图/);assert.match(r('html'),/素材已移除/);assert.equal(r('JSON.stringify(references)===before'),true);
});

test('legacy adopted candidates do not invent a version number in reference review',()=>{
 const r=fixture();assert.match(r("referenceStoryboardReferenceHtml([{node:{id:'a',title:'旧站台',adoptedCandidateId:'old',candidates:[{id:'old',frame:3}]}}])"),/版本未记录/);
 assert.match(r('referenceStoryboardReferenceHtml([])'),/暂无关联素材/);
});

 test('leaving the workbench retains separate reading positions for each shot and mode',()=>{
 const r=fixture();
 r("var referenceWorkbench={};var pane={dataset:{sbEpisode:'ep',sbGroup:'g1',sbMode:'read'},querySelector:selector=>({scrollTop:selector==='.ref-sb-details'?720:86})};document.querySelector=()=>pane;referenceRememberWorkbenchScroll()");
 assert.equal(r('referenceWorkbench.storyboardPositions[JSON.stringify(["ep","g1","read"])].details'),720);
 r("pane.dataset.sbMode='edit';referenceRememberWorkbenchScroll();pane.dataset.sbGroup='g2';referenceRememberWorkbenchScroll()");
 assert.equal(r('Object.keys(referenceWorkbench.storyboardPositions).length'),3);
 assert.equal(r('referenceWorkbench.storyboardPositions[JSON.stringify(["ep","g1","read"])].assets'),86);
});
