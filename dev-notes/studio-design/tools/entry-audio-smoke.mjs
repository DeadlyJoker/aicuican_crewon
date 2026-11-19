/** Audio entry changes preserve each mode's model and provider preparation. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const [catalog,models,entry]=await Promise.all(['reference-audio-model-catalog.js','reference-audio-models.js','reference-entry-audio.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
function fixture(){const context=vm.createContext({S:{},structuredClone,document:{addEventListener(){}}});vm.runInContext(catalog+'\n'+models.split('const referenceLegacyAudioParameters=')[0]+'\n'+entry,context);return code=>vm.runInContext(code,context);}
test('switching music and speech restores each model and parameter draft',()=>{
 const run=fixture();run("var state={referenceEntryCreationDrafts:{image:{kept:true}}};var draft=referenceEntryAudioDraft(state);draft.creationAudioParamsByModel={[draft.creationAudioModelCode]:{format:'mp3'}};referenceEntryAudioMode(state,'music')");
 assert.equal(run('draft.creationAudioModelCode'),'text-music-rhart-audio-music-2.5');run("referenceEntryAudioMode(state,'voice')");
 assert.equal(run('draft.creationAudioModelCode'),'bytedance-doubao-seed-audio-1.0');assert.equal(run('draft.creationAudioParamsByModel[draft.creationAudioModelCode].format'),'mp3');assert.equal(run('state.referenceEntryCreationDrafts.image.kept'),true);
});
test('audio entry rejects an incompatible model without changing its draft',()=>{
 const run=fixture();run('var state={};var draft=referenceEntryAudioDraft(state);var before=JSON.stringify(draft)');assert.equal(run("referenceAudioChangeModel(draft,'text-music-rhart-audio-music-2.5')"),false);assert.equal(run('JSON.stringify(draft)===before'),true);
});
test('audio numeric values clamp in native units and reject unfinished inputs',()=>{
 const run=fixture();run('var definition=referenceAudioModelDefinitions.find(item=>item.code==="bytedance-doubao-seed-audio-1.0")');
 assert.equal(run("referenceNormalizeAudioProviderValue(definition,'speech_rate','100')"),100);
 assert.equal(run("referenceNormalizeAudioProviderValue(definition,'speech_rate','0.1')"),-50);
 assert.equal(run("referenceNormalizeAudioProviderValue(definition,'speech_rate','1.2')"),20);
 assert.equal(run("referenceNormalizeAudioProviderValue(definition,'speech_rate','')"),null);
});
