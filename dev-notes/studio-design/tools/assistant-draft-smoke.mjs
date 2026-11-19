/** Local assistant drafts follow stable project identities and remain independent of canvas input. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-assistant.js',import.meta.url),'utf8');
function fixture(){const context=vm.createContext({S:{screen:'home'},handleAction(){},canvasHtml(){return ''},inspectorHtml(){return ''},document:{addEventListener(){}}});vm.runInContext(source,context);return code=>vm.runInContext(code,context);}
test('assistant drafts remain independent between projects and node prompts',()=>{
 const run=fixture();run("var state={project:'A',referenceProjectMeta:{A:{id:'a'},B:{id:'b'}},nodeDrafts:{node:{prompt:'保留节点草稿'}}};referenceSetAssistantDraft(state,'未发送的想法');state.project='B'");assert.equal(run('referenceAssistantDraft(state)'),'');run("referenceSetAssistantDraft(state,'另一个项目');state.project='A'");assert.equal(run('referenceAssistantDraft(state)'),'未发送的想法');assert.equal(run('state.nodeDrafts.node.prompt'),'保留节点草稿');
});
test('renaming a project retains its assistant draft through the existing project id',()=>{
 const run=fixture();run("var state={project:'旧名',referenceProjectMeta:{旧名:{id:'same'}}};referenceSetAssistantDraft(state,'草稿');state.referenceProjectMeta.新名=state.referenceProjectMeta.旧名;delete state.referenceProjectMeta.旧名;state.project='新名'");assert.equal(run('referenceAssistantDraft(state)'),'草稿');
});
test('clearing the active draft preserves other drafts after persistence roundtrip',()=>{
 const run=fixture();run("var state={project:'A'};referenceSetAssistantDraft(state,'A草稿');state.project='B';referenceSetAssistantDraft(state,'B草稿');referenceSetAssistantDraft(state,'');state=JSON.parse(JSON.stringify(state))");assert.equal(run('referenceAssistantDraft(state)'),'');run("state.project='A'");assert.equal(run('referenceAssistantDraft(state)'),'A草稿');
});
