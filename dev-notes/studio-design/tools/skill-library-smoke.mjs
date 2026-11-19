/** Skill browsing filters the shared directory and stores favorites independently of projects. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const [search,library]=await Promise.all(['reference-inspiration-search.js','reference-skill-library.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
function fixture(){const ctx=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},location:{hash:''},home(){},render(){},handleAction(){}});vm.runInContext(search+'\n'+library,ctx);return ctx;}
const skills=[{id:'city-walk',name:'电影感城市漫步',description:'旅行镜头'},{id:'food-asmr',name:'沉浸式美食短片',description:'食物声音'}];
test('purpose and favorites filter the shared skill catalog without changing it',()=>{
 const ctx=fixture(),before=JSON.stringify(skills),state={referenceSkillLibrary:{tab:'discover',purpose:'旅行记录',query:''}};assert.equal(ctx.referenceSkillLibraryItems(state,skills)[0].id,'city-walk');state.referenceSkillLibrary={tab:'favorites',purpose:'全部',query:''};state.referenceSkillFavorites=['food-asmr'];assert.equal(ctx.referenceSkillLibraryItems(state,skills)[0].id,'food-asmr');state.referenceSkillLibrary.query='不存在';assert.equal(ctx.referenceSkillLibraryItems(state,skills).length,0);assert.equal(JSON.stringify(skills),before);
});
test('favoriting and unfavoriting do not alter project content',()=>{
 const ctx=fixture(),state={nodes:[{id:'old'}],referenceSkillFavorites:[]};let writes=0;assert.equal(ctx.referenceToggleSkillFavorite(state,'city-walk',()=>writes++).ok,true);assert.deepEqual(Array.from(state.referenceSkillFavorites),['city-walk']);assert.equal(ctx.referenceToggleSkillFavorite(state,'city-walk',()=>writes++).ok,true);assert.equal(state.referenceSkillFavorites.length,0);assert.equal(state.nodes[0].id,'old');assert.equal(writes,2);
});
test('failed storage restores the prior collection including an absent collection',()=>{
 const ctx=fixture();for(const state of [{},{referenceSkillFavorites:['food-asmr']}]){const before=JSON.stringify(state),result=ctx.referenceToggleSkillFavorite(state,'city-walk',()=>{throw Error('full');});assert.equal(result.ok,false);assert.equal(JSON.stringify(state),before);}
});
