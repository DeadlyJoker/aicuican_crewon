/** Check that canvas search never loses or duplicates project nodes. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../canvas-navigation.js',import.meta.url),'utf8');
function fixture(){
 const context=vm.createContext({listeners:{},document:{addEventListener(type,handler){(context.listeners[type]??=[]).push(handler);}},window:{addEventListener(){}}});vm.runInContext(source,context);
 return expression=>vm.runInContext(expression,context);
}
test('scene membership and new draft types each appear exactly once',()=>{
 const run=fixture();
 run(`var nodes=[{id:'story',kind:'story',title:'剧本',label:'故事'},{id:'actor',kind:'character',title:'林晚',label:'角色'},{id:'one',kind:'shot',title:'站台',label:'镜头'},{id:'video',kind:'video',title:'视频草稿',label:'视频'},{id:'future',kind:'future',title:'其他',label:'其他'}];var scenes=[{id:'a',title:'第一场',shots:[{id:'one'},{id:'missing'}]},{id:'b',title:'第二场',shots:[{id:'one'}]}];var groups=canvasNavigationGroups(nodes,scenes);`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(groups.flatMap(g=>g.nodes.map(n=>n.id)))')),['story','actor','one','video','future']);
 assert.equal(run('groups.find(g=>g.id===\'scene-b\')'),undefined);
 assert.equal(run('nodes.length'),5);
});
test('name and group searches retain source data and normalize query spacing',()=>{
 const run=fixture();
 run("var nodes=[{id:'a',title:'LIN · 林晚',kind:'character',label:'角色'},{id:'b',title:'旧站台',kind:'scene',label:'场景'}];var groups=canvasNavigationGroups(nodes);");
 assert.equal(run("canvasFilteredNavigationGroups(groups,' lin ')[0].nodes[0].id"),'a');
 assert.equal(run("canvasFilteredNavigationGroups(groups,'角色')[0].nodes[0].id"),'a');
 assert.equal(run("canvasFilteredNavigationGroups(groups,'不存在').length"),0);
 assert.equal(run('groups.flatMap(g=>g.nodes).length'),2);
 assert.equal(run('nodes[0].title'),'LIN · 林晚');
});
test('node manager shows real groups and leaves ungrouped nodes unclassified',()=>{
 const run=fixture();run("var nodes=[{id:'a',kind:'character'},{id:'b',kind:'video'},{id:'c',kind:'image'}];var groups=canvasManagedGroups(nodes,[{id:'g',name:'制作参考',nodeIds:['a','b']}]);");
 assert.equal(run('JSON.stringify(groups.map(g=>({id:g.id,title:g.title,ids:g.nodes.map(n=>n.id)})))'),'[{"id":"g","title":"制作参考","ids":["a","b"]},{"id":"__ungrouped","title":"","ids":["c"]}]');
});
test('media filters retain group membership and keep editor nodes in all only',()=>{
 const run=fixture();run("var nodes=[{id:'a',kind:'character'},{id:'b',kind:'video'},{id:'c',kind:'video-compose'},{id:'d',kind:'voice'},{id:'s',kind:'story'}];var group=[{id:'g',name:'混合组',nodeIds:['a','b']}];");
 assert.equal(run("JSON.stringify(canvasManagedGroups(nodes,group,'video').flatMap(g=>g.nodes.map(n=>n.id)))"),'["b"]');
 assert.equal(run("JSON.stringify(canvasManagedGroups(nodes,group,'audio').flatMap(g=>g.nodes.map(n=>n.id)))"),'["d"]');
 assert.equal(run("JSON.stringify(canvasManagedGroups(nodes,group,'text').flatMap(g=>g.nodes.map(n=>n.id)))"),'["s"]');
 assert.equal(run("canvasManagedGroups(nodes,group,'all').flatMap(g=>g.nodes).length"),5);
});
test('overlapping group input cannot duplicate nodes in manager output',()=>{
 const run=fixture();assert.equal(run("canvasManagedGroups([{id:'a',kind:'image'}],[{id:'g',name:'组',nodeIds:['a','a']},{id:'h',name:'另一个组',nodeIds:['a']}]).flatMap(g=>g.nodes).length"),1);
});

test('panel width stays within reference limits and fits narrow windows without changing stored preference',()=>{
 const run=fixture();
 assert.equal(run('JSON.stringify(canvasNavigatorWidth(480,1280))'),'{"min":360,"max":800,"value":480}');
 assert.equal(run('canvasNavigatorWidth(1000,1280).value'),800);
 assert.equal(run('canvasNavigatorWidth(100,1280).value'),360);
 assert.equal(run('canvasNavigatorWidth(480,390).value'),370);
 assert.equal(run('canvasNavigatorWidth(undefined,1280).value'),360);
 assert.equal(run('canvasNavigatorWidth(480,1280).value'),480);
});

test('clearing a temporary search restores the original browsing position',()=>{
 const run=fixture();run("var state={query:'',scrollTop:701,kind:'all',grid:true};canvasNavigatorQuery(state,'林');state.scrollTop=20;canvasNavigatorQuery(state,'林晚');");
 assert.equal(run('state.scrollTop'),0);run("canvasNavigatorQuery(state,'');");assert.equal(run('state.scrollTop'),701);assert.equal(run('state.grid'),true);assert.equal(run('state.searchScroll'),undefined);
 run("state.scrollTop=480;canvasNavigatorQuery(state,'雨夜');canvasNavigatorQuery(state,'   ');");assert.equal(run('state.scrollTop'),480);
});
test('changing filters during search does not restore another view position',()=>{
 const run=fixture();run("var state={query:'',scrollTop:701,kind:'all',grid:true};canvasNavigatorQuery(state,'林');state.kind='image';state.scrollTop=0;canvasNavigatorQuery(state,'');");
 assert.equal(run('state.scrollTop'),0);assert.equal(run('state.searchScroll'),undefined);
});

 test('search shortcut consumes the event before ordinary F can reframe the canvas',()=>{
 const run=fixture();run("var S={screen:'canvas',outlineOpen:true,projectKind:'test',project:'draft',canvasNavigation:{'test:draft':{searchOpen:true}}};var currentModal=null;var focused=0,selected=0,stopped=0,prevented=0;document.getElementById=()=>({focus(){focused++;},select(){selected++;}});var event={key:'f',metaKey:true,target:{matches(){return false;}},preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}};listeners.keydown[0](event);");
 assert.equal(run('focused'),1);assert.equal(run('selected'),1);assert.equal(run('prevented'),1);assert.equal(run('stopped'),1);
});
 test('node search leaves contenteditable text shortcuts with their editor',()=>{
 const run=fixture();run("var S={screen:'canvas'},currentModal=null;var prevented=0;var event={key:'f',ctrlKey:true,target:{isContentEditable:true,matches(){return false;}},preventDefault(){prevented++;}};listeners.keydown[0](event);");assert.equal(run('prevented'),0);
});
