import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-group-model.js',import.meta.url),'utf8');
function run(code){return vm.runInNewContext(source+'\n'+code);}
test('horizontal layout leaves media data unchanged and spaces differently sized nodes',()=>{
 const result=run("const nodes=[{id:'a',x:20,y:80,w:360,h:420,prompt:'keep'},{id:'b',x:500,y:10,w:380,h:280}];const before=JSON.stringify(nodes);const result=referenceGroupLayout(nodes,'horizontal');JSON.stringify({result,unchanged:before===JSON.stringify(nodes)})");
 assert.deepEqual(JSON.parse(result),{result:[{id:'a',x:20,y:10},{id:'b',x:410,y:10}],unchanged:true});
});
test('vertical layout uses rendered heights without overlap',()=>{assert.equal(run("JSON.stringify(referenceGroupLayout([{id:'a',x:0,y:0,w:360,h:420},{id:'b',x:4,y:4,w:380,h:280}],'vertical'))"),'[{"id":"a","x":0,"y":0},{"id":"b","x":0,"y":450}]');});
test('grid rows reserve the widest column and tallest row',()=>{assert.equal(run("JSON.stringify(referenceGroupLayout([{id:'a',x:0,y:0,w:360,h:420},{id:'b',x:4,y:4,w:380,h:280},{id:'c',x:8,y:8,w:500,h:200}],'grid'))"),'[{"id":"a","x":0,"y":0},{"id":"b","x":530,"y":0},{"id":"c","x":0,"y":450}]');});
test('empty groups stay empty and blank names retain the previous name',()=>{assert.equal(run("referenceGroupLayout([],'grid').length"),0);assert.equal(run("referenceGroupName('  ','角色组')"),'角色组');assert.equal(run("referenceGroupName('  演员  ','角色组')"),'演员');});
test('earlier asset sections retain names without writing a membership migration',()=>{
 const result=run("const state={nodes:[{id:'a',kind:'character'},{id:'b',kind:'scene'},{id:'p',kind:'image',assetCategory:'prop'}],referenceGroupNames:{character:'主要角色'}};const groups=referenceReadGroups(state);JSON.stringify({groups,written:Object.hasOwn(state,'referenceGroups')})");
 assert.deepEqual(JSON.parse(result),{groups:[{id:'character',name:'主要角色',nodeIds:['a']},{id:'scene',name:'场景组',nodeIds:['b']},{id:'prop',name:'道具组',nodeIds:['p']}],written:false});
});
test('regrouping arbitrary nodes removes previous membership without changing the graph',()=>{
 const result=run("const state={nodes:[{id:'a',kind:'character',prompt:'keep',candidates:[{version:1}]},{id:'b',kind:'scene'},{id:'c',kind:'character'}],edges:[['a','b']]};const before=JSON.stringify(state);const result=referenceCreateGroup(state,['a','b','a'],'mix');JSON.stringify({result,unchanged:before===JSON.stringify(state)})");
 assert.deepEqual(JSON.parse(result),{result:{ok:true,groups:[{id:'character',name:'角色组',nodeIds:['c']},{id:'mix',name:'新建组',nodeIds:['a','b']}]},unchanged:true});
});
test('explicit groups do not automatically capture newly added assets',()=>{
 assert.equal(run("const state={nodes:[{id:'a',kind:'character'},{id:'b',kind:'character'},{id:'new',kind:'character'}],referenceGroups:{version:1,groups:[{id:'g',name:'主角',nodeIds:['a','b']}]}};JSON.stringify(referenceReadGroups(state)[0].nodeIds)"),'["a","b"]');
});
test('single or missing selection cannot create an empty group',()=>{
 assert.equal(run("referenceCreateGroup({nodes:[{id:'a',kind:'image'}]},['a','gone'],'g').ok"),false);
});
const historySource=await readFile(new URL('../canvas-links.js',import.meta.url),'utf8');
test('disband undo and redo restore memberships while preserving coordinates and references',()=>{
 const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source+'\n'+historySource,context);
 const result=vm.runInContext("var S={nodes:[{id:'a',kind:'character',x:12,y:15,candidates:[{id:'v1'}]},{id:'b',kind:'image',x:200,y:15}],edges:[['a','b']],revision:1,canvasUndo:[],canvasRedo:[],referenceGroups:{version:1,groups:[]}};function nodeById(id){return S.nodes.find(n=>n.id===id)};var before=[{id:'g',name:'临时组',nodeIds:['a','b']}],after=[];S.canvasUndo.push({type:'groups',before,after});var graph=JSON.stringify({nodes:S.nodes,edges:S.edges});var undo=studioReplayCanvasHistory();var restored=referenceReadGroups(S);var redo=studioReplayCanvasHistory(true);JSON.stringify({undo,restored,redo,groups:referenceReadGroups(S),unchanged:graph===JSON.stringify({nodes:S.nodes,edges:S.edges})})",context);
 assert.deepEqual(JSON.parse(result),{undo:{ok:true},restored:[{id:'g',name:'临时组',nodeIds:['a','b']}],redo:{ok:true},groups:[],unchanged:true});
});
test('group translation preserves offsets and supports negative canvas coordinates',()=>{
 assert.equal(run("JSON.stringify(referenceTranslateGroup([{id:'a',x:20,y:30},{id:'b',x:143,y:81}],-80,40))"),'[{"id":"a","x":-60,"y":70},{"id":"b","x":63,"y":121}]');
});
test('grid snapping applies one shared delta instead of snapping each member separately',()=>{
 assert.equal(run("JSON.stringify(referenceTranslateGroup([{id:'a',x:17,y:33},{id:'b',x:144,y:88}],14,12,true))"),'[{"id":"a","x":40,"y":40},{"id":"b","x":167,"y":95}]');
});
test('a whole group move undoes together without changing unrelated nodes',()=>{
 const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source+'\n'+historySource,context);
 const result=vm.runInContext("var S={nodes:[{id:'a',kind:'character',x:20,y:30},{id:'b',kind:'image',x:143,y:81},{id:'other',kind:'scene',x:500,y:600}],revision:1,canvasUndo:[{type:'positions',before:[{id:'a',x:0,y:0},{id:'b',x:123,y:51}],after:[{id:'a',x:20,y:30},{id:'b',x:143,y:81}]}],canvasRedo:[]};function nodeById(id){return S.nodes.find(n=>n.id===id)};studioReplayCanvasHistory();JSON.stringify(S.nodes.map(n=>({id:n.id,x:n.x,y:n.y})))",context);
 assert.equal(result,'[{"id":"a","x":0,"y":0},{"id":"b","x":123,"y":51},{"id":"other","x":500,"y":600}]');
});
test('group color survives reading and rename without mutating nodes or membership',()=>{
 const result=run("const state={nodes:[{id:'a',kind:'image',x:5,candidates:[{version:1}]}],referenceGroups:{version:1,groups:[{id:'g',name:'素材',nodeIds:['a']}]}};const before=JSON.stringify(state);const groups=referenceSetGroupColor(state,'g','blue');groups[0].name='新名称';JSON.stringify({groups:referenceReadGroups({...state,referenceGroups:{version:1,groups}}),unchanged:before===JSON.stringify(state)})");
 assert.deepEqual(JSON.parse(result),{groups:[{id:'g',name:'新名称',nodeIds:['a'],color:'blue'}],unchanged:true});
});
test('unknown colors and groups are rejected while legacy and invalid stored colors stay neutral',()=>{
 assert.equal(run("referenceSetGroupColor({nodes:[]},'missing','blue')"),null);
 assert.equal(run("referenceSetGroupColor({nodes:[]},'missing','injected')"),null);
 assert.equal(run("JSON.stringify(referenceReadGroups({nodes:[{id:'a'}],referenceGroups:{version:1,groups:[{id:'g',name:'素材',nodeIds:['a'],color:'invalid'}]}}))"),'[{"id":"g","name":"素材","nodeIds":["a"]}]');
});
test('group color undo restores legacy appearance and redo restores the selected color',()=>{
 const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source+'\n'+historySource,context);
 const result=vm.runInContext("var before=[{id:'g',name:'素材',nodeIds:['a']}],after=[{...before[0],color:'purple'}];var S={nodes:[{id:'a',x:5}],revision:1,referenceGroups:{version:1,groups:after},canvasUndo:[{type:'groups',before,after}],canvasRedo:[]};function nodeById(id){return S.nodes.find(n=>n.id===id)};studioReplayCanvasHistory();var neutral=referenceReadGroups(S)[0].color??null;studioReplayCanvasHistory(true);JSON.stringify({neutral,color:referenceReadGroups(S)[0].color,x:S.nodes[0].x})",context);
 assert.deepEqual(JSON.parse(result),{neutral:null,color:'purple',x:5});
});
test('resizing east and west changes bounds without changing the opposite edge',()=>{
 assert.equal(run("JSON.stringify(referenceResizeGroupFrame({dx:0,dy:0,width:420,height:500},'e',80,0))"),'{"dx":0,"dy":0,"width":500,"height":500}');
 assert.equal(run("JSON.stringify(referenceResizeGroupFrame({dx:0,dy:0,width:420,height:500},'w',900,0))"),'{"dx":220,"dy":0,"width":200,"height":500}');
});
test('corner resizing clamps each changed dimension and does not invert the frame',()=>{
 assert.equal(run("JSON.stringify(referenceResizeGroupFrame({dx:-20,dy:-30,width:420,height:500},'nw',900,900))"),'{"dx":200,"dy":270,"width":200,"height":200}');
});
test('saved frames preserve color and membership; invalid geometry is discarded',()=>{
 assert.equal(run("JSON.stringify(referenceReadGroups({nodes:[{id:'a'}],referenceGroups:{version:1,groups:[{id:'g',name:'素材',nodeIds:['a'],color:'blue',frame:{dx:10,dy:-20,width:500,height:150}}]}})[0])"),'{"id":"g","name":"素材","nodeIds":["a"],"color":"blue","frame":{"dx":10,"dy":-20,"width":500,"height":150}}');
 assert.equal(run("referenceValidGroupFrame({dx:0,dy:0,width:Infinity,height:500})"),false);
 assert.equal(run("referenceValidGroupFrame({dx:0,dy:0,width:-1,height:500})"),false);
});
test('frame history undoes and redoes independently of node positions and content',()=>{
 const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source+'\n'+historySource,context);
 const result=vm.runInContext("var before=[{id:'g',name:'素材',nodeIds:['a'],color:'blue'}],after=[{...before[0],frame:{dx:20,dy:10,width:500,height:600}}];var S={nodes:[{id:'a',x:5,prompt:'keep'}],revision:1,referenceGroups:{version:1,groups:after},canvasUndo:[{type:'groups',before,after}],canvasRedo:[]};function nodeById(id){return S.nodes.find(n=>n.id===id)};studioReplayCanvasHistory();var previous=referenceReadGroups(S)[0].frame??null;studioReplayCanvasHistory(true);JSON.stringify({previous,frame:referenceReadGroups(S)[0].frame,node:S.nodes[0]})",context);
 assert.deepEqual(JSON.parse(result),{previous:null,frame:{dx:20,dy:10,width:500,height:600},node:{id:'a',x:5,prompt:'keep'}});
});
