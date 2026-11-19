import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const sources=await Promise.all(['reference-video-catalog.js','reference-video-models.js','reference-video.js','reference-audio.js','canvas-creation.js','candidate-ux.js','asset-reference-model.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
function fixture(){
 const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}},I:()=>'',esc:String,mediaKind:n=>['voice','audio'].includes(n.kind)?'audio':n.kind==='shot'?'video':n.kind});
 vm.runInContext(sources.join('\n'),context);return code=>vm.runInContext(code,context);
}
test('each observed model family resolves every advertised mode to a fetched definition',()=>{
 const run=fixture();assert.equal(run('referenceVideoModelCatalog.families.length'),41);assert.equal(run('Object.keys(referenceVideoModelCatalog.definitions).length'),111);
 assert.equal(run('referenceVideoModelCatalog.families.every(f=>f.modes.length&&f.modes.every(m=>referenceVideoModelCatalog.definitions[m.modelCode]))'),true);
});
test('selecting Hailuo from a two-frame Seedance draft switches to its supported first frame and own defaults',()=>{
 const run=fixture();const result=run("var d={creationVideoMode:'frames',creationVideoResolution:'4k',seconds:12};referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id);d.creationVideoProvider.params.resolution='4k';d.creationVideoProvider.params.duration='12';referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Hailuo 2.3').id);JSON.stringify({mode:d.creationVideoMode,params:referenceVideoProviderParams(d),code:referenceVideoBinding(d).mode.modelCode})");
 assert.deepEqual(JSON.parse(result),{mode:'first',params:{enablePromptExpansion:true,duration:'6'},code:'start-video-hailuo-2.3-standard'});
});
test('legacy project settings do not select a concrete provider or rewrite the saved draft',()=>{
 const run=fixture();assert.equal(run("var d={creationModel:'project',creationVideoMode:'frames',seconds:60};var before=JSON.stringify(d);referenceVideoBinding(d)"),null);assert.equal(run('JSON.stringify(d)===before'),true);
 assert.equal(run("canvasMediaSettings({kind:'video',seconds:60},d).model"),'project');
});
test('new snapshots retain the exact model and an independent parameter copy',()=>{
 const run=fixture();run("var d={creationVideoMode:'frames'};referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id);var result=canvasMediaSettings({kind:'video'},d);d.creationVideoProvider.params.duration='12';");
 assert.equal(run('result.model'),'start-end-video-seedance-2.5-global-token');assert.equal(run('result.modelLabel'),'Seedance 2.5 Global');assert.equal(run('result.providerParams.duration'),'5');assert.equal(run('result.seconds'),5);
});
test('combined native model filters match either capability and can be cleared',()=>{
 const run=fixture();run("referenceModelFilters=['first','edit'];");assert.equal(run("referenceModelVisibleFamilies().some(f=>f.label==='Kling 4.0')"),true);run('referenceModelFilters=[]');assert.equal(run('referenceModelVisibleFamilies().length'),41);
});
test('switching a provider mode discards previous parameters but never touches reference versions',()=>{
 const run=fixture();assert.equal(run("var d={creationVideoMode:'frames'};var refs=[{sourceId:'one',candidateId:'v1'}];var before=JSON.stringify(refs);referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id);d.creationVideoProvider.params.fake='old';referenceSelectVideoMode(d,'text');referenceVideoProviderParams(d).fake"),undefined);assert.equal(run('JSON.stringify(refs)===before'),true);
});
test('unavailable saved model identifiers stop submission instead of silently using another model',()=>{
 const run=fixture();assert.equal(run("canvasPromptCanSubmit({kind:'video'},{creationVideoFamily:'removed',creationVideoMode:'text'},'hello')"),false);
});
test('video reference modes require an adopted video and retain inactive image inputs',()=>{
 const run=fixture();assert.equal(run("canvasVideoReferencePlan({creationVideoMode:'edit'},[{sourceId:'a',sourceKind:'image'}]).error"),'请再添加 1 份视频参考');assert.equal(run("canvasVideoReferencePlan({creationVideoMode:'edit'},[{sourceId:'a',sourceKind:'image'},{sourceId:'v',sourceKind:'video',candidateId:'v2'}]).active[0].candidateId"),'v2');
});
test('adopted video snapshots use fixed versions and unadopted candidates stay unavailable',()=>{
 const run=fixture();assert.equal(run("var S={nodes:[{id:'v',kind:'video',title:'素材',frame:1,referenceOnly:false,adoptedCandidateId:'v1',candidates:[{id:'v1',number:1,frame:2},{id:'v2',number:2,frame:3}]}],versions:{}};studioAssetSourceSnapshot('v').candidateId"),'v1');run("S.nodes[0].adoptedCandidateId=null");assert.equal(run("studioAssetSourceSnapshot('v')"),null);
});
test('model configuration owns labels, visibility and advanced fields',()=>{
 const run=fixture();run("var d={creationVideoMode:'frames'};referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id);var b=referenceVideoBinding(d);var html=referenceProviderParametersHtml({},d,b)");
 assert.equal(run("b.definition.presentation.returnLastFrame.advanced"),true);assert.match(run('html'),/data-provider-group="advanced"/);assert.doesNotMatch(run('html'),/data-provider-choice="ratio"/);
});
test('draft mode applies the model-declared 480p rule without changing another saved snapshot',()=>{
 const run=fixture();run("var d={creationVideoMode:'frames'};referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id);var b=referenceVideoBinding(d),before=referenceVideoProviderParams(d,b),next=referenceProviderUpdatedParams(d,b,'draft',true)");
 assert.equal(run('next.resolution'),'480p');assert.equal(run('next.draft'),true);assert.equal(run('before.resolution'),'720p');
});
test('models without a duration setting do not invent an output duration',()=>{
 const run=fixture();run("var d={creationVideoMode:'edit'};referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id)");assert.equal(run('referenceVideoExecutionSettings({seconds:12},d).seconds'),0);
});
test('an image target cannot acquire a video input through the reference picker owner',()=>{
 const run=fixture();assert.equal(run("var S={nodes:[{id:'v',kind:'video',title:'素材',frame:1,referenceOnly:false,adoptedCandidateId:'v1',candidates:[{id:'v1',number:1,frame:2}]},{id:'image',kind:'image',frame:1,referenceOnly:true,assetReferences:[]}],versions:{},edges:[]};studioApplyAssetReferences(S.nodes[1],['v']).code"),'invalid-source-kind');
});

test('active draft constraints survive edits and restored drafts without rewriting history',()=>{
 const run=fixture();run("var d={creationVideoMode:'text'};referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id);var b=referenceVideoBinding(d);d.creationVideoProvider.params={...d.creationVideoProvider.params,draft:true,resolution:'4k'};var original=JSON.stringify(d)");
 assert.equal(run('referenceVideoProviderParams(d).resolution'),'480p');
 assert.equal(run("referenceProviderUpdatedParams(d,b,'resolution','4k').resolution"),'480p');
 assert.equal(run('JSON.stringify(d)===original'),true);
 assert.match(run('referenceProviderParametersHtml({},d,b)'),/样片模式固定/);
 run("d.creationVideoProvider.params=referenceProviderUpdatedParams(d,b,'draft',false);d.creationVideoProvider.params=referenceProviderUpdatedParams(d,b,'resolution','4k')");
 assert.equal(run('referenceVideoProviderParams(d).resolution'),'4k');
 assert.doesNotMatch(run('referenceProviderParametersHtml({},d,b)'),/样片模式固定/);
});

test('first model selection keeps the visible reference mode without changing adopted inputs',()=>{
 const run=fixture();run("var refs=[{sourceId:'actor',sourceKind:'character',candidateId:'accepted-v1'}],stored={},current={creationVideoMode:canvasVideoReferencePlan({},refs).mode};referenceSelectVideoFamily(stored,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id,current)");
 assert.equal(run('stored.creationVideoMode'),'reference');
 assert.equal(run('canvasVideoReferencePlan(stored,refs).active[0].candidateId'),'accepted-v1');
});
test('mode edits inherit the saved model when no unsaved model override exists',()=>{
 const run=fixture();run("var saved={creationVideoMode:'reference'};referenceSelectVideoFamily(saved,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id);var edited={};var before=JSON.stringify(saved);referenceSelectVideoMode(edited,'first',saved)");
 assert.equal(run('edited.creationVideoMode'),'first');
 assert.equal(run('referenceVideoBinding(edited).mode.modelCode'),'start-video-seedance-2.5-global-token');
 assert.equal(run('JSON.stringify(saved)===before'),true);
});

test('collapsed parameters expose visible basic choices and explain their labels without changing drafts',()=>{
 const run=fixture();run("var d={creationVideoMode:'frames'};referenceSelectVideoFamily(d,referenceVideoModelCatalog.families.find(f=>f.label==='Seedance 2.5 Global').id);var b=referenceVideoBinding(d),params=referenceVideoProviderParams(d),before=JSON.stringify(d);var summary=referenceProviderSummary(b.definition,params);");
 assert.match(run('summary.compact'),/720p \/ 5s \/ 是/);
 assert.match(run('summary.title'),/生成视频音频：是/);
 assert.match(run('summary.title'),/样片模式：否/);
 assert.doesNotMatch(run('summary.title'),/随机种子/);
 assert.equal(run('JSON.stringify(d)===before'),true);
 run("d.creationVideoProvider.params=referenceProviderUpdatedParams(d,b,'draft',true);summary=referenceProviderSummary(b.definition,referenceVideoProviderParams(d));");
 assert.match(run('summary.compact'),/^480p/);assert.match(run('summary.title'),/样片模式：是/);
});
