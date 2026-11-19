/** Verify local library actions retain historic project data and reject name collisions. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-projects.js',import.meta.url),'utf8');
function fixture(){
 const inputs={name:{value:'新名字'},error:{hidden:true,textContent:''},destination:{value:''}};
 const context=vm.createContext({crypto:webcrypto,structuredClone,document:{addEventListener(){},getElementById(id){return id==='ref-project-name-input'?inputs.name:id==='ref-project-error'?inputs.error:null},querySelector(selector){return selector.startsWith('input[name=')?inputs.destination:null}},window:{addEventListener(){}},render(){},persist(){},toast(){},closeDialog(){},mediaKind(n){return n.kind},handleAction(){},home(){},rememberProject(){}});
 vm.runInContext(`var S={project:'旧项目',projectDrafts:{'旧项目':{project:'旧项目',nodes:[{id:'a',kind:'image',candidates:[{id:'output',prompt:'旧输入',createdAt:'2026-11-01'}],adoptedCandidateId:'output'}],history:[{type:'finished',expertVersion:3}],nodeDrafts:{a:{prompt:'未提交的新输入'}},canvasUndo:[{type:'positions',positions:[]}],pan:{x:120,y:90},zoom:.7},'同名项目':{project:'同名项目',nodes:[],history:[]}}};var referenceSection='projects';`,context);
 vm.runInContext(source,context);
 return {inputs,run:code=>vm.runInContext(code,context)};
}
test('renaming a legacy project retains candidates, history, unsaved node drafts and viewport',()=>{
 const {inputs,run}=fixture();const before=run(`JSON.stringify(S.projectDrafts['旧项目'])`);inputs.name.value='新名字';
 run(`referenceProjectEdit={kind:'rename',ids:[S.referenceProjectMeta['旧项目'].id]};referenceSaveProjectForm();`);
 assert.equal(run(`S.project`),'新名字');assert.equal(run(`Boolean(S.projectDrafts['旧项目'])`),false);
 const expected=JSON.parse(before);expected.project='新名字';assert.deepEqual(JSON.parse(run(`JSON.stringify(S.projectDrafts['新名字'])`)),expected);
 assert.equal(run(`S.referenceProjectMeta['新名字'].id.startsWith('local-')`),true);
});
test('a duplicate name leaves both existing records and current identity unchanged',()=>{
 const {inputs,run}=fixture();const before=run('JSON.stringify(S.projectDrafts)');inputs.name.value='同名项目';
 run(`referenceProjectEdit={kind:'rename',ids:[S.referenceProjectMeta['旧项目'].id]};referenceSaveProjectForm();`);
 assert.equal(run('JSON.stringify(S.projectDrafts)'),before);assert.equal(run('S.project'),'旧项目');assert.equal(inputs.error.hidden,false);
});
test('moving and deleting only change library metadata across a storage round trip',()=>{
 const {inputs,run}=fixture();const before=run(`JSON.stringify(S.projectDrafts['旧项目'])`);inputs.destination.value='folder-a';
 run(`S.referenceFolders.push({id:'folder-a',name:'文件夹',folder:null,deletedAt:null});referenceProjectEdit={kind:'move',ids:[S.referenceProjectMeta['旧项目'].id]};referenceSaveProjectForm();referenceDeleteProjects([S.referenceProjectMeta['旧项目'].id]);S=JSON.parse(JSON.stringify(S));`);
 assert.equal(run(`S.referenceProjectMeta['旧项目'].folder`),'folder-a');assert.equal(run(`typeof S.referenceProjectMeta['旧项目'].deletedAt`),'string');
 assert.equal(run(`JSON.stringify(S.projectDrafts['旧项目'])`),before);
 run(`S.referenceProjectMeta['旧项目'].deletedAt=null;referenceLibrary.folder='folder-a';`);
 assert.equal(run('referenceLibraryItems().length'),1);
 assert.equal(run(`JSON.stringify(referenceLibraryItems()[0].draft)`),before);
});
test('a deleted folder hides its contents without deleting project records',()=>{
 const {inputs,run}=fixture();inputs.destination.value='folder-a';
 run(`S.referenceFolders.push({id:'folder-a',name:'文件夹',folder:null,deletedAt:null});referenceProjectEdit={kind:'move',ids:[S.referenceProjectMeta['旧项目'].id]};referenceSaveProjectForm();referenceDeleteProjects(['folder-a']);`);
 assert.equal(run(`Boolean(S.projectDrafts['旧项目'])`),true);assert.equal(run(`referenceLibraryItems().some(p=>p.id==='folder-a')`),false);
 run(`S.referenceFolders[0].deletedAt=null;referenceLibrary.folder='folder-a';`);assert.equal(run('referenceLibraryItems().length'),1);
});

test('project edit labels use actual elapsed time and retain unknown legacy dates',()=>{
 const {run}=fixture();run("var now=Date.parse('2026-11-10T12:00:00Z');");
 for(const [age,label] of [[0,'刚刚编辑'],[59000,'刚刚编辑'],[60000,'1分钟前编辑'],[59*60000,'59分钟前编辑'],[3600000,'1小时前编辑'],[86400000,'1天前编辑'],[29*86400000,'29天前编辑']])assert.equal(run(`referenceProjectModifiedLabel(new Date(now-${age}).toISOString(),now)`),label);
 assert.equal(run("referenceProjectModifiedLabel(null,now)"),'本地草稿');assert.equal(run("referenceProjectModifiedLabel('invalid',now)"),'本地草稿');
 assert.equal(run("referenceProjectModifiedLabel(new Date(now+60000).toISOString(),now)"),'刚刚编辑');
 assert.equal(run("referenceProjectModifiedLabel('2025-01-01T00:00:00Z',now).endsWith(' 编辑')"),true);
});
