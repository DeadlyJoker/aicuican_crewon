/** Creation modes resolve to distinct existing recipes without rewriting input drafts. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-entry-kind.js',import.meta.url),'utf8');
const context=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source,context);
test('Agent, image, video and audio use their corresponding local recipes',()=>{
 for(const [id,recipe] of [['agent','blank'],['image','image'],['video','video'],['audio','audio']])assert.equal(context.referenceEntryKind({referenceCreateKind:id}).recipe,recipe);
});
test('unavailable and legacy choices resolve to Agent without changing the draft',()=>{
 for(const id of ['model','motion','legacy',undefined]){
  const state={referenceCreateKind:id,referenceEntryDrafts:{create:'原始输入'}};const before=JSON.stringify(state);
  assert.equal(context.referenceEntryKind(state).id,'agent');assert.equal(JSON.stringify(state),before);
 }
});

test('music starts its own recipe while retaining the audio type and input',()=>{
 const state={referenceCreateKind:'audio',referenceEntryCreationDrafts:{audio:{creationAudioMode:'music'}},referenceEntryDrafts:{create:'音乐描述'}},before=JSON.stringify(state);
 assert.equal(context.referenceEntryKind(state).recipe,'audio-music');assert.equal(context.referenceEntryKind(state).id,'audio');assert.equal(JSON.stringify(state),before);
});
test('the music recipe contains only the entered direction and an ungenerated music draft',async()=>{
 const catalog=await readFile(new URL('../catalog.js',import.meta.url),'utf8'),ctx=vm.createContext({});vm.runInContext(catalog,ctx);
 const recipe=ctx.makeStudioExample('audio-music','钢琴与雨声');assert.equal(recipe.projectKind,'audio');assert.equal(recipe.nodes.length,2);assert.equal(recipe.nodes[0].text,'钢琴与雨声');assert.equal(recipe.nodes[1].id,'audio-result');assert.equal(recipe.nodes[1].referenceOnly,true);assert.equal(recipe.nodes[1].candidates.length,0);assert.equal(recipe.nodes[1].dialogue,'');
});
