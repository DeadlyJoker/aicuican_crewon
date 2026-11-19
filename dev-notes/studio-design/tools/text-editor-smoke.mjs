/** Text content edits leave generation instructions and accepted media unchanged. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const graph=await readFile(new URL('../reference-node-commands.js',import.meta.url),'utf8'),source=await readFile(new URL('../reference-text-editor.js',import.meta.url),'utf8');
function fixture(){const ctx=vm.createContext({listeners:{},structuredClone,handleAction(){},nodeHtml(){},S:{screen:'home'}});vm.runInContext("var document={addEventListener(type,handler){(listeners[type]??=[]).push(handler)}};",ctx);vm.runInContext(graph+'\n'+source,ctx);return code=>vm.runInContext(code,ctx);}
test('committing rich text preserves prompts, accepted candidates and other draft preferences',()=>{
 const run=fixture();run(`var S={nodes:[{id:'a',kind:'text',prompt:'生成提示词',text:'原正文',candidates:[{id:'v1',text:'已采用内容'}],adoptedCandidateId:'v1'}],edges:[],versions:{},nodeDrafts:{a:{creationModel:'quality',textEditor:{version:1,text:'新正文'}}}};var payload={text:'新正文',document:{root:{type:'root',version:1,children:[{type:'paragraph',version:1,children:[]}]}}};var result=referenceCommitTextNode(S,'a',payload);`);
 assert.equal(run('result.ok'),true);assert.equal(run('S.nodes[0].prompt'),'生成提示词');assert.equal(run('S.nodes[0].candidates[0].text'),'已采用内容');assert.equal(run('S.nodes[0].text'),'新正文');assert.equal(run('S.nodeDrafts.a.creationModel'),'quality');assert.equal(run('S.nodeDrafts.a.textEditor'),undefined);
 assert.equal(run('referenceRestoreNodeGraph(S,result.entry.after,result.entry.before).ok'),true);assert.equal(run('S.nodes[0].text'),'原正文');assert.equal(run('S.nodeDrafts.a.textEditor'),undefined);
});
test('write rollback restores the recoverable edit draft while invalid input leaves nodes untouched',()=>{
 const run=fixture();run(`var S={nodes:[{id:'a',kind:'text',prompt:'旧提示词'}],edges:[],versions:{},nodeDrafts:{a:{textEditor:{version:1,text:'保留草稿'}}}};var before=JSON.stringify(S);var payload={text:'正文',document:{root:{type:'root',children:[]}}};var result=referenceCommitTextNode(S,'a',payload);`);
 assert.equal(run('referenceRestoreNodeGraph(S,result.rollback.after,result.rollback.before).ok'),true);assert.equal(run('JSON.stringify(S)'),run('before'));
 assert.equal(run("referenceCommitTextNode(S,'a',{text:'bad',document:{}}).ok"),false);assert.equal(run('JSON.stringify(S)'),run('before'));
 run("S.nodes[0].scriptSourceId='story';");assert.equal(run("referenceCommitTextNode(S,'a',payload).ok"),false);
});
test('an intentionally empty text value never falls back to a generation prompt',()=>{
 const run=fixture();assert.equal(run("referenceTextValue({text:'',prompt:'生成说明'})"),'');assert.equal(run("referenceTextValue({prompt:'旧正文'})"),'旧正文');
});

test('long text previews consume scrolling without taking over short-node canvas navigation',()=>{
 const run=fixture();run("var stopped=0;var preview={scrollHeight:800,clientHeight:360};var event={target:{closest(){return preview;}},stopPropagation(){stopped++;}};listeners.wheel[0](event);");assert.equal(run('stopped'),1);
 run('stopped=0;preview.scrollHeight=200;listeners.wheel[0](event);');assert.equal(run('stopped'),0);
});


test('Enter opens the focused preview without intercepting its import control',()=>{
 const run=fixture();
 run("var opened=0,prevented=0;nodeById=()=>({id:'text',kind:'text'});referenceNodeEditable=()=>true;referenceTextOpen=()=>{opened++;};var target={matches(){return false;},closest(){return {dataset:{node:'text'}};}};var key={key:'Enter',target,preventDefault(){prevented++;},stopImmediatePropagation(){}};listeners.keydown[0](key);");
 assert.equal(run('opened'),0);assert.equal(run('prevented'),0);
 run('target.matches=()=>true;listeners.keydown[0](key);');
 assert.equal(run('opened'),1);assert.equal(run('prevented'),1);
 run("key.key='Tab';listeners.keydown[0](key);");assert.equal(run('opened'),1);
});
