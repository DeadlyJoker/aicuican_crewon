/** Asset edits do not rewrite scripts, accepted candidates, or other pending options. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const model=await readFile(new URL('../reference-node-commands.js',import.meta.url),'utf8');
const edit=await readFile(new URL('../reference-workbench-asset.js',import.meta.url),'utf8');
function run(code){return vm.runInNewContext(model+'\n'+edit+'\n'+code,{structuredClone,handleAction(){},document:{addEventListener(){}}});}
test('asset edit keeps identity, candidates and script text while updating live labels',()=>{
 const output=run("var state={nodes:[{id:'a',kind:'character',title:'旧名',prompt:'旧描述',x:12,candidates:[{id:'v1',prompt:'原版本'}]},{id:'story',kind:'story',text:'剧本不变'},{id:'v',kind:'video',assetReferences:[{sourceId:'a',sourceTitle:'旧名'}]}],edges:[['a','v']],nodeDrafts:{a:{prompt:'暂存描述',model:'保持模型'}},versions:{}};var result=referenceSaveWorkbenchAsset(state,'a','新名','新描述');JSON.stringify({ok:result.ok,node:state.nodes[0],story:state.nodes[1].text,label:state.nodes[2].assetReferences[0].sourceTitle,draft:state.nodeDrafts.a})");
 assert.deepEqual(JSON.parse(output),{ok:true,node:{id:'a',kind:'character',title:'新名',prompt:'新描述',description:'新描述',x:12,candidates:[{id:'v1',prompt:'原版本'}]},story:'剧本不变',label:'新名',draft:{model:'保持模型'}});
});
test('blank, duplicate or missing assets fail without changing state',()=>{assert.equal(run("var state={nodes:[{id:'a',kind:'scene',title:'甲'},{id:'b',kind:'scene',title:'乙'}]};var before=JSON.stringify(state);[referenceSaveWorkbenchAsset(state,'a','','描述').ok,referenceSaveWorkbenchAsset(state,'a','乙','描述').ok,referenceSaveWorkbenchAsset(state,'missing','新名','描述').ok].every(value=>value===false)&&before===JSON.stringify(state)"),true);});
test('saved asset patch restores old content and preparation draft',()=>{assert.equal(run("var state={nodes:[{id:'a',kind:'character',title:'旧名',prompt:'旧描述'}],nodeDrafts:{a:{prompt:'未保存草稿'}},edges:[],versions:{}};var before=JSON.stringify(state);var result=referenceSaveWorkbenchAsset(state,'a','新名','新描述');var restored=referenceRestoreNodeGraph(state,result.entry.after,result.entry.before);restored.ok&&before===JSON.stringify(state)"),true);});
const creationState="var state={nodes:[{id:'s',kind:'story',x:0,y:0,w:200,scriptDocument:{title:'保留剧本'},scriptSeries:{episodes:[{id:'e1',assetIds:[]},{id:'e2',assetIds:[]}],sharedAssetIds:[]}}],edges:[],nodeDrafts:{},versions:{},layoutBase:[]};";
test('adding a global asset references it in each episode without inventing output',()=>{
 const output=JSON.parse(run(creationState+"var result=referenceCreateWorkbenchAsset(state,'s','a','all','character','旅人','奶白风衣');JSON.stringify({ok:result.ok,episodes:state.nodes[0].scriptSeries.episodes.map(e=>e.assetIds),shared:state.nodes[0].scriptSeries.sharedAssetIds,asset:state.nodes[1],script:state.nodes[0].scriptDocument})"));
 assert.equal(output.ok,true);assert.deepEqual(output.episodes,[['a'],['a']]);assert.deepEqual(output.shared,['a']);assert.equal(output.asset.referenceOnly,true);assert.equal(output.asset.adoptedCandidateId,null);assert.deepEqual(output.asset.candidates,[]);assert.deepEqual(output.script,{title:'保留剧本'});
});
test('adding a scoped prop leaves other episodes intact and supports undo',()=>{
 assert.equal(run(creationState+"var before=JSON.stringify(state);var result=referenceCreateWorkbenchAsset(state,'s','a','e2','prop','旧灯','暖光旧灯');var valid=Array.isArray(state.nodes[1].assetReferences)&&state.nodes[1].kind==='image'&&state.nodes[1].assetCategory==='prop'&&state.nodes[0].scriptSeries.episodes[0].assetIds.length===0&&state.nodes[0].scriptSeries.episodes[1].assetIds[0]==='a';var restored=referenceRestoreNodeGraph(state,result.entry.after,result.entry.before);valid&&restored.ok&&JSON.stringify(state)===before"),true);
});
test('invalid scope and duplicate ids do not partially create assets',()=>{
 assert.equal(run(creationState+"var before=JSON.stringify(state);var results=[referenceCreateWorkbenchAsset(state,'s','a','missing','scene','街道','描述'),referenceCreateWorkbenchAsset(state,'s','s','all','scene','街道','描述'),referenceCreateWorkbenchAsset(state,'s','a','all','video','街道','描述')];results.every(r=>!r.ok)&&JSON.stringify(state)===before"),true);
});
test('shot labels follow actual links and pinned references rather than episode membership',()=>{
 const result=run("var source={scriptDocument:{scenes:[{shots:[{id:'s1'},{id:'s2'}]}]},scriptSeries:{episodes:[{id:'e1',number:1,primary:true,assetIds:['a','unused']},{id:'e2',number:2,assetIds:['a'],document:{scenes:[{shots:[{id:'s3'}]}]}}]}};var state={nodes:[{id:'s2',assetReferences:[{sourceId:'a'}]}],edges:[['a','s1'],['a','s3']]};JSON.stringify([referenceAssetShotLabels(state,source,'a'),referenceAssetShotLabels(state,source,'a','e2'),referenceAssetShotLabels(state,source,'unused')])");
 assert.deepEqual(JSON.parse(result),[['第1集 · 01','第1集 · 02','第2集 · 01'],['第2集 · 01'],[]]);
});
test('saving reused material preserves target name and older versions with independent snapshots',()=>{
 const result=JSON.parse(run("var state={nodes:[{id:'a',kind:'character',title:'目标名称',prompt:'原描述',candidates:[{id:'old',number:1,frame:1}],adoptedCandidateId:'old'}],edges:[],nodeDrafts:{},versions:{}};var reuse={id:'new',sourceId:'source',sourceTitle:'来源名称',candidate:{id:'source-v2',number:2,frame:4,prompt:'来源输入',sourceReferences:[]}};var before=JSON.stringify(state);var result=referenceSaveWorkbenchAsset(state,'a','目标名称','来源描述',reuse);reuse.candidate.frame=7;JSON.stringify({name:state.nodes[0].title,old:state.nodes[0].candidates[0].id,frame:state.nodes[0].candidates[1].frame,number:state.nodes[0].candidates[1].number,adopted:state.nodes[0].adoptedCandidateId,undo:referenceRestoreNodeGraph(state,result.entry.after,result.entry.before).ok,restored:before===JSON.stringify(state)})"));
 assert.deepEqual(result,{name:'目标名称',old:'old',frame:4,number:2,adopted:'new',undo:true,restored:true});
});
test('voice selection changes independently from historical candidates and can be cleared or undone',()=>{
 assert.equal(run("var state={nodes:[{id:'a',kind:'character',title:'角色',prompt:'描述',candidates:[{id:'v1',voicePreset:{name:'Old'}}]}],edges:[],nodeDrafts:{},versions:{}};var before=JSON.stringify(state);var voice={id:'gentle-girl',name:'Gentle Girl'};var result=referenceSaveWorkbenchAsset(state,'a','角色','描述',null,voice);voice.name='changed';var valid=state.nodes[0].voicePreset.name==='Gentle Girl'&&state.nodes[0].candidates[0].voicePreset.name==='Old';var cleared=referenceSaveWorkbenchAsset(state,'a','角色','描述',null,null);var absent=!Object.hasOwn(state.nodes[0],'voicePreset');var undoClear=referenceRestoreNodeGraph(state,cleared.entry.after,cleared.entry.before).ok;var undoSelect=referenceRestoreNodeGraph(state,result.entry.after,result.entry.before).ok;valid&&absent&&undoClear&&undoSelect&&JSON.stringify(state)===before"),true);
});
test('variants share the parent episode scope and pin its current image without copying output',()=>{
 const result=JSON.parse(run(creationState+"state.nodes[0].scriptSeries.episodes[0].assetIds=['main'];state.nodes.push({id:'main',kind:'character',title:'旅人',x:240,y:0,w:248,adoptedCandidateId:'v1',candidates:[{id:'v1',number:1,frame:2}]});var before=JSON.stringify(state);var result=referenceCreateWorkbenchAsset(state,'s','variant','all','character','旅人雨衣','雨衣造型',null,null,'main');var node=state.nodes.find(n=>n.id==='variant');var checks={ok:result.ok,parent:node.variantOf,empty:node.candidates.length===0,reference:node.assetReferences[0].candidateId,episodes:state.nodes[0].scriptSeries.episodes.map(ep=>ep.assetIds),label:referenceAssetVariantLabel(state,node)};checks.undo=referenceRestoreNodeGraph(state,result.entry.after,result.entry.before).ok&&before===JSON.stringify(state);JSON.stringify(checks)"));
 assert.deepEqual(result,{ok:true,parent:'main',empty:true,reference:'v1',episodes:[['main','variant'],[]],label:'变体 1',undo:true});
});

test('role cards keep variants adjacent without changing persisted order',()=>{
 const output=JSON.parse(run("var assets=[{id:'main',kind:'character'},{id:'other',kind:'character'},{id:'variant',kind:'character',variantOf:'main'}];JSON.stringify({ordered:referenceArrangeAssetCards(assets).map(a=>a.id),stored:assets.map(a=>a.id),label:referenceAssetVariantLabel({nodes:assets},assets[0],false)})"));
 assert.deepEqual(output,{ordered:['main','variant','other'],stored:['main','other','variant'],label:'主角色'});
});
test('a variant keeps its selected model draft separate from its parent and in undo history',()=>{
 const result=JSON.parse(run(creationState+"state.nodes.push({id:'main',kind:'character',title:'旅人',x:240,y:0,w:248,adoptedCandidateId:'v1',candidates:[{id:'v1',number:1,frame:2}]});state.nodes[0].scriptSeries.episodes[0].assetIds=['main'];state.nodeDrafts.main={creationModel:'quality'};var before=JSON.stringify(state);var draft={creationImageFamily:'image-family',creationImageProvider:{modelCode:'image-code',params:{quality:'high'}}};var created=referenceCreateWorkbenchAsset(state,'s','variant','all','character','雨衣','雨衣描述',null,null,'main',draft);draft.creationImageProvider.params.quality='low';var checks={quality:state.nodeDrafts.variant.creationImageProvider.params.quality,parent:state.nodeDrafts.main.creationModel};checks.undo=referenceRestoreNodeGraph(state,created.entry.after,created.entry.before).ok&&JSON.stringify(state)===before;JSON.stringify(checks)"));
 assert.deepEqual(result,{quality:'high',parent:'quality',undo:true});
});

test('new variants avoid surrounding nodes and join an explicit parent group',()=>{
 const out=JSON.parse(run(creationState+"state.nodes[0].scriptSeries.episodes[0].assetIds=['main'];state.nodes.push({id:'main',kind:'character',title:'旅人',x:250,y:0,w:248,h:276},{id:'scene',kind:'scene',x:250,y:308,w:380,h:380});state.referenceGroups={version:1,groups:[{id:'g',name:'角色组',nodeIds:['main']}]};var before=JSON.stringify(state);var result=referenceCreateWorkbenchAsset(state,'s','variant','all','character','雨衣','描述',null,null,'main');var n=state.nodes.find(n=>n.id==='variant');var out={x:n.x,y:n.y,members:state.referenceGroups.groups[0].nodeIds,parentY:state.nodes[1].y};out.undo=referenceRestoreNodeGraph(state,result.entry.after,result.entry.before).ok&&JSON.stringify(state)===before;JSON.stringify(out)"));
 assert.deepEqual(out,{x:250,y:776,members:['main','variant'],parentY:0,undo:true});
});
