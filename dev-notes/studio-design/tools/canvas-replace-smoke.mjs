/** Image-only replacement preserves target identity, version history and undo. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const commands=await readFile(new URL('../reference-node-commands.js',import.meta.url),'utf8');
const assets=await readFile(new URL('../reference-workbench-asset.js',import.meta.url),'utf8');
const reuse=assets.slice(assets.indexOf('function referenceApplyWorkbenchReuse('),assets.indexOf('function referenceSaveWorkbenchAsset('));
const source=await readFile(new URL('../reference-canvas-replace.js',import.meta.url),'utf8');
function fixture(){const context=vm.createContext({structuredClone,nodeHtml(){return '';},handleAction(){},document:{addEventListener(){}},render(){}});vm.runInContext(commands+reuse+source,context);vm.runInContext("var state={nodes:[{id:'actor',kind:'character',title:'原角色',prompt:'原描述',description:'原简介',voicePreset:{id:'voice'},x:120,y:80,w:380,h:436,adoptedCandidateId:'old',candidates:[{id:'old',number:4,frame:1}],assetReferences:[]}],edges:[],nodeDrafts:{actor:{prompt:'尚未保存的输入'}},versions:{}};var replacement={id:'new',sourceId:'saved:asset',sourceTitle:'库中素材',candidate:{id:'saved-v2',number:2,frame:3,prompt:'素材描述',savedAsset:{assetId:'asset'}}};",context);return text=>vm.runInContext(text,context);}
test('replacement changes only output fields and retains original versions and metadata',()=>{
 const r=fixture();r("var before=JSON.stringify(state);var result=referenceReplaceCanvasImage(state,'actor','old',replacement);var node=state.nodes[0];");
 assert.equal(r('result.ok'),true);assert.equal(r('node.adoptedCandidateId'),'new');assert.equal(r('node.candidates.length'),2);assert.equal(r('node.candidates[1].number'),5);
 assert.equal(r('node.title'),'原角色');assert.equal(r('node.prompt'),'原描述');assert.equal(r('node.voicePreset.id'),'voice');assert.equal(r('node.x'),120);assert.equal(r('state.nodeDrafts.actor.prompt'),'尚未保存的输入');assert.equal(r('node.candidates[0].id'),'old');assert.equal(r('node.candidates[1].savedAsset.assetId'),'asset');
 assert.equal(r('referenceRestoreNodeGraph(state,result.entry.after,result.entry.before).ok'),true);assert.equal(r('JSON.stringify(state)'),r('before'));
});
test('repeating one confirmed request does not append a second candidate',()=>{
 const r=fixture();r("referenceReplaceCanvasImage(state,'actor','old',replacement);var result=referenceReplaceCanvasImage(state,'actor','old',replacement);");
 assert.equal(r('result.changed'),false);assert.equal(r('state.nodes[0].candidates.length'),2);
});
test('a changed adopted image or missing target rejects replacement without mutations',()=>{
 const r=fixture();r('var before=JSON.stringify(state)');assert.equal(r("referenceReplaceCanvasImage(state,'actor','different',replacement).ok"),false);assert.equal(r("referenceReplaceCanvasImage(state,'missing','old',replacement).ok"),false);assert.equal(r('JSON.stringify(state)'),r('before'));
});
