/** Homepage template handoff preserves previous projects and rejects incomplete graphs before switching. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-inspiration-search.js',import.meta.url),'utf8');
const context=vm.createContext({structuredClone,document:{addEventListener(){}},makeStudioExample:()=>({project:'blank',projectKind:'blank',nodes:[{id:'placeholder'}]}),referenceImportWorkflow(state,template,prefix){if(template.invalid)return {ok:false,error:'模板引用不完整'};state.nodes.push(...template.nodes.map(node=>({...structuredClone(node),id:prefix+'-'+node.id})));state.edges.push(...template.edges.map(([a,b])=>[prefix+'-'+a,prefix+'-'+b]));return {ok:true};}});vm.runInContext(source,context);
const template={id:'story',name:'镜头预演',nodes:[{id:'text',prompt:'保持人物一致'},{id:'video',creationPreferences:{creationAgent:'director'}}],edges:[['text','video']]};
test('template preparation creates an independent graph without a placeholder or inherited project history',()=>{
 const before=JSON.stringify(template),result=context.referencePrepareWorkflowProject(template,'new','新草稿','2026-11-11');assert.equal(result.ok,true);assert.equal(result.project.nodes.length,2);assert.equal(result.project.edges[0][0],'new-text');assert.equal(result.project.nodes[1].creationPreferences.creationAgent,'director');assert.equal(result.project.history[0].templateId,'story');assert.equal(JSON.stringify(template),before);result.project.nodes[1].creationPreferences.creationAgent='changed';assert.equal(template.nodes[1].creationPreferences.creationAgent,'director');
});
test('invalid template graphs fail before a project can be installed',()=>{assert.equal(context.referencePrepareWorkflowProject({...template,invalid:true},'new','新草稿','now').ok,false);});
test('successful persistence retains the old project while saving the new graph once',()=>{
 const state={project:'old',nodes:[{id:'old-node'}],projectDrafts:{},projectSequence:4},project=context.referencePrepareWorkflowProject(template,'new','new','now').project;let writes=0;
 const remember=()=>{state.projectDrafts[state.project]=structuredClone(state.nodes);};
 assert.equal(context.referenceCommitWorkflowProject(state,project,5,remember,()=>writes++).ok,true);assert.equal(state.project,'new');assert.equal(state.projectDrafts.old[0].id,'old-node');assert.equal(state.projectDrafts.new.length,2);assert.equal(writes,1);
});
test('failed persistence restores the active project, drafts and sequence',()=>{
 const state={project:'old',nodes:[{id:'old-node'}],projectDrafts:{},projectSequence:4},before=JSON.stringify(state),project=context.referencePrepareWorkflowProject(template,'new','new','now').project;
 const result=context.referenceCommitWorkflowProject(state,project,5,()=>{state.projectDrafts[state.project]=structuredClone(state.nodes);},()=>{throw Error('full');});assert.equal(result.ok,false);assert.equal(JSON.stringify(state),before);
});
