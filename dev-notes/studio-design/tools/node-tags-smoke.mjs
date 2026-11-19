/** Classification updates preserve media and replay as a single batch. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-node-tags.js',import.meta.url),'utf8');
const manager=await readFile(new URL('../reference-tag-manager.js',import.meta.url),'utf8');
const history=await readFile(new URL('../canvas-links.js',import.meta.url),'utf8');
function fixture(){const context=vm.createContext({structuredClone,closeDialog(){},currentModal:null,document:{addEventListener(){}},window:{addEventListener(){}},S:{screen:'home'}});vm.runInContext(source+'\n'+manager+'\n'+history,context);return expression=>vm.runInContext(expression,context);}
test('batch tag adds once to mixed selection without mutating inputs',()=>{const run=fixture();run("var nodes=[{id:'a',referenceTagIds:['scene'],prompt:'keep'},{id:'b',referenceTagIds:[],candidates:[{version:1}]}];var before=JSON.stringify(nodes);var after=referenceToggleNodeTags(nodes,['a','b','a'],'scene');");assert.equal(run('JSON.stringify(after)'), '[{"id":"a","tags":["scene"]},{"id":"b","tags":["scene"]}]');assert.equal(run('before===JSON.stringify(nodes)'),true);});
test('common tag toggles off without removing other labels',()=>{const run=fixture();assert.equal(run("JSON.stringify(referenceToggleNodeTags([{id:'a',referenceTagIds:['scene','person']},{id:'b',referenceTagIds:['scene']}],['a','b'],'scene'))"),'[{"id":"a","tags":["person"]},{"id":"b","tags":[]}]');});
test('batch label undo and redo preserve candidate versions and coordinates',()=>{const run=fixture();const result=run("S={nodes:[{id:'a',x:12,candidates:[{version:1}],referenceTagIds:['scene']}],revision:1,canvasUndo:[{type:'node-tags',before:[{id:'a',tags:[]}],after:[{id:'a',tags:['scene']}]}],canvasRedo:[]};function nodeById(id){return S.nodes.find(n=>n.id===id)};studioReplayCanvasHistory();var before=S.nodes[0].referenceTagIds.slice();studioReplayCanvasHistory(true);JSON.stringify({before,node:S.nodes[0]})");assert.deepEqual(JSON.parse(result),{before:[],node:{id:'a',x:12,candidates:[{version:1}],referenceTagIds:['scene']}});});
test('conflicting labels reject history replay without touching nodes',()=>{const run=fixture();assert.equal(run("S={nodes:[{id:'a',referenceTagIds:['other']}],canvasUndo:[{type:'node-tags',before:[{id:'a',tags:[]}],after:[{id:'a',tags:['scene']}]}],canvasRedo:[]};function nodeById(id){return S.nodes.find(n=>n.id===id)};studioReplayCanvasHistory().ok"),false);assert.equal(run("S.nodes[0].referenceTagIds[0]"),'other');});
test('catalog removal can be undone without changing assignments',()=>{const run=fixture();assert.equal(run("S.referenceTagCatalog=[...referenceTags(),{id:'night',name:'夜景',color:'#123456'}];var before=structuredClone(referenceTags()),after=before.filter(t=>t.id!=='night');S.nodes=[];S.canvasUndo=[{type:'tag-catalog',before,after}];S.canvasRedo=[];S.referenceTagCatalog=after;studioReplayCanvasHistory();referenceTags().some(t=>t.id==='night')"),true);});
test('stored catalog discards malformed or duplicate entries before HTML presentation',()=>{const run=fixture();assert.equal(run("S.referenceTagCatalog=[{id:'bad',name:'bad',color:'red\" onclick=bad'},{id:'person',name:'override',color:'#112233'},{id:'night',name:'夜景',color:'#123456'},{id:'night',name:'duplicate',color:'#123456'}];referenceTags().length"),2);});

test('catalog edit validation rejects duplicate names, blanks and invalid colors',()=>{const run=fixture();assert.equal(run("referenceValidateTagCatalog([{id:'a',name:'参考',color:'#123456'},{id:'b',name:' 参考 ',color:'#112233'}])"),'标签名称不能重复');assert.equal(run("referenceValidateTagCatalog([{id:'a',name:' ',color:'#123456'}])"),'请输入标签名称');assert.equal(run("referenceValidateTagCatalog([{id:'a',name:'参考',color:'red'}])"),'请输入六位颜色值，例如 #3B82F6');});
test('reordering catalog entries preserves stable ids and leaves source unchanged',()=>{const run=fixture();assert.equal(run("var tags=[{id:'a',name:'人物'},{id:'b',name:'场景'},{id:'c',name:'道具'}];var reordered=referenceMoveCatalogTag(tags,'c','a');JSON.stringify([tags.map(t=>t.id),reordered.map(t=>t.id)])"),'[["a","b","c"],["c","a","b"]]');});
test('renamed built-in entries retain their original id in the saved catalog',()=>{const run=fixture();assert.equal(run("S.referenceTagCatalog=[{id:'person',name:'主要角色',color:'#123456'}];JSON.stringify(referenceTags())"),'[{"id":"person","name":"主要角色","color":"#123456"}]');});

test('group selection counts distinct members and preserves selections in other groups',()=>{const run=fixture();assert.equal(run("JSON.stringify(referenceSelectGroupMembers(['outside','a'],['a','b','b'],true))"),'["outside","a","b"]');assert.equal(run("JSON.stringify(referenceSelectGroupMembers(['outside','a','b'],['a','b'],false))"),'["outside"]');});

test('selection summaries distinguish visible and hidden members without changing input',()=>{
 const r=fixture();r("var selected=['a','b','outside','a'];var visible=['a','c','c'];var before=JSON.stringify([selected,visible]);var summary=referenceBatchSelectionSummary(selected,visible);");
 assert.equal(r('summary.total'),3);assert.equal(r('summary.visible'),2);assert.equal(r('summary.selectedVisible'),1);assert.equal(r('summary.hidden'),2);assert.equal(r('summary.mixed'),true);assert.equal(r('summary.checked'),false);assert.equal(r('JSON.stringify([selected,visible])===before'),true);
 assert.equal(r("referenceBatchSelectionSummary(['a','outside'],['a']).checked"),true);assert.equal(r("referenceBatchSelectionSummary(['outside'],[]).checked"),false);assert.equal(r("referenceBatchSelectionSummary(['outside'],[]).mixed"),false);
});

test('inline color edits synchronize the staged controls without changing the saved catalog',()=>{
 const run=fixture();run("var hex={value:''},picker={color:'#F9B902'},preview={style:{}},row={style:{}},button={dataset:{catalogColor:'#22C55E'},setAttribute(name,value){this[name]=value;}};document.getElementById=id=>id==='tag-editor-hex'?hex:picker;document.querySelector=selector=>selector==='.tag-editor-color-preview'?preview:row;document.querySelectorAll=()=>[button];referenceTagEditor={active:'person',catalog:[{id:'person',name:'人物',color:'#F9B902'}]};var saved=JSON.stringify(referenceTags());referenceSetTagEditorColor('#22c55e');");
 assert.equal(run('hex.value'),'#22C55E');assert.equal(run('picker.color'),'#22C55E');assert.equal(run('preview.style.background'),'#22C55E');assert.equal(run("button['aria-pressed']"),'true');assert.equal(run('JSON.stringify(referenceTags())===saved'),true);
 run("referenceSetTagEditorColor('#GGGGGG');");assert.equal(run('referenceTagEditor.catalog[0].color'),'#GGGGGG');assert.equal(run('picker.color'),'#22C55E');assert.equal(run('preview.style.background'),'#22C55E');
 assert.equal(run('referenceValidateTagCatalog(referenceTagEditor.catalog)'),'请输入六位颜色值，例如 #3B82F6');
});

test('tag focus survives replaced controls and does not enter a different project',()=>{
 const run=fixture();run("S.project='one';var focused=[];var row={dataset:{tagNode:'story'},focus(){focused.push('row')}};var filter={focus(){focused.push('filter')}};document.querySelectorAll=()=>[row];document.querySelector=()=>filter;var opener={project:'one',nodeId:'story',element:{isConnected:false}};referenceFocusTagOpener(opener);");
 assert.equal(run('JSON.stringify(focused)'),'["row"]');
 run("document.querySelectorAll=()=>[];referenceFocusTagOpener(opener);");
 assert.equal(run('JSON.stringify(focused)'),'["row","filter"]');
 run("S.project='two';referenceFocusTagOpener(opener);");
 assert.equal(run('JSON.stringify(focused)'),'["row","filter"]');
});
