/** Local skill selection remains project-specific and submitted requests retain its version. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const [entry,assistant,contextSource,skills]=await Promise.all(['reference-inspiration-search.js','reference-assistant.js','reference-assistant-context.js','reference-skills.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
function fixture(fail=false){
 const S={screen:'home',project:'old',projectSequence:3,nodes:[{id:'old-node'}],projectDrafts:{},referenceProjectMeta:{old:{id:'old-id'}}};let writes=0;
 const ctx=vm.createContext({S,structuredClone,document:{addEventListener(){},getElementById(){return null;},querySelector(){return null;}},makeStudioExample:()=>({projectKind:'blank'}),inspectorHtml:()=>'',referenceRefreshInspiration(){},rememberProject(){S.projectDrafts[S.project]={nodes:structuredClone(S.nodes)};S.referenceProjectMeta[S.project]??={id:'id-'+S.project};},persist(){if(fail)throw Error('full');writes++;},toast(){},closeDialog(){},render(){},location:{hash:''}});
 vm.runInContext(entry,ctx);vm.runInContext(assistant.slice(assistant.indexOf('function referenceAssistantDraftKey'),assistant.indexOf('const referenceAssistantCanvas')),ctx);vm.runInContext(contextSource.slice(0,contextSource.indexOf('function referenceAssistantIsPicking')),ctx);vm.runInContext(skills,ctx);
 return {S,run:code=>vm.runInContext(code,ctx),writes:()=>writes};
}
test('adding a skill creates one empty independent project and restores its assistant draft',()=>{
 const h=fixture();h.run("referenceLaunchSkill('city-walk');referenceLaunchSkill('city-walk')");assert.equal(h.S.nodes.length,0);assert.equal(h.S.projectDrafts.old.nodes[0].id,'old-node');assert.equal(h.S.panel,'director');assert.equal(h.run('referenceAssistantSkill(S).id'),'city-walk');assert.match(h.run('referenceAssistantDraft(S)'),/城市漫步/);assert.equal(h.writes(),1);assert.equal(h.S.projectSequence,4);
});
test('submitted skill metadata stays frozen when the composer selection changes',()=>{
 const h=fixture();h.run("referenceLaunchSkill('city-walk');var entry=referenceAssistantDirectionEntry(S,'用户请求','now');referenceAssistantSkill(S).name='修改后的名称';delete S.referenceAssistantSkills[referenceAssistantDraftKey(S)]");assert.equal(h.run('entry.skill.name'),'电影感城市漫步');assert.equal(h.run('entry.skill.version'),1);assert.equal(h.run('referenceAssistantSkill(S)'),null);
});
test('failed storage restores the previous project, draft metadata and sequence',()=>{
 const h=fixture(true),before=JSON.stringify(h.S);h.run("referenceLaunchSkill('city-walk')");assert.equal(JSON.stringify(h.S),before);assert.equal(h.writes(),0);
});
test('the project saver retains empty canvases after leaving them',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=app.indexOf('function rememberProject(){'),end=app.indexOf('function loadStudioExample(',start),S={project:'empty',nodes:[],projectDrafts:{}};
 const ctx=vm.createContext({S,structuredClone});vm.runInContext(app.slice(start,end),ctx);ctx.rememberProject();assert.equal(S.projectDrafts.empty.nodes.length,0);
});
