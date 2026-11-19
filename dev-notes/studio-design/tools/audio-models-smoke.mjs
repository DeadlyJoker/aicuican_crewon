import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({S:{screen:"home"},structuredClone,referenceProviderOption:option=>typeof option==='object'&&option!==null?option:{value:option},referenceAudioParametersHtml(){},positionCanvasNodeOverlays(){},canvasCreationHtml(){},canvasMediaParametersHtml(){},canvasMediaSettings(){return {legacy:true};},handleAction(){},document:{addEventListener(){}},mediaKind:n=>n.kind});
for(const name of ['reference-audio-model-catalog.js','reference-audio-models.js'])vm.runInContext(await readFile(new URL('../'+name,import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);
test('audio models retain different parameter ranges and reject a model from another mode',()=>{
 assert.equal(run('referenceAudioDefinition({creationAudioModelCode:"text-audio-rhart-audio-speech-2.8-turbo"}).properties.volume.max'),10);
 assert.equal(run('referenceAudioDefinition({creationAudioModelCode:"bytedance-doubao-seed-audio-1.0"}).properties.loudness_rate.max'),100);
 assert.equal(run('referenceAudioDefinition({creationAudioMode:"music",creationAudioModelCode:"text-audio-rhart-audio-speech-2.8-turbo"})'),undefined);
 assert.equal(run('referenceAudioChangeModel({creationAudioMode:"music"},"text-audio-rhart-audio-speech-2.8-turbo")'),false);
});
test('switching audio models retains each model voice and independent parameter drafts',()=>{
 run('var d={creationAudioModelCode:"bytedance-doubao-seed-audio-1.0",creationVoicePreset:{id:"old",name:"Vivi"},creationAudioParamsByModel:{"bytedance-doubao-seed-audio-1.0":{speech_rate:20}}};referenceAudioChangeModel(d,"text-audio-rhart-audio-speech-2.8-turbo");');
 assert.equal(run('d.creationVoicePreset'),null);
 run('d.creationVoicePreset={id:"Wise_Woman",name:"智慧女性"};referenceAudioChangeModel(d,"bytedance-doubao-seed-audio-1.0");');
 assert.equal(run('d.creationVoicePreset.name'),'Vivi');
 assert.equal(run('referenceAudioProviderParams(d).speech_rate'),20);
 run('referenceAudioChangeModel(d,"text-audio-rhart-audio-speech-2.8-turbo");');
 assert.equal(run('d.creationVoicePreset.name'),'智慧女性');
 assert.equal(run('referenceAudioProviderParams(d).volume'),1);
});
test('candidate audio snapshots preserve exact parameters and omit stale legacy fields',()=>{
 run('var d2={creationAudioModelCode:"text-audio-rhart-audio-speech-2.8-turbo",creationAudioVolume:2,creationAudioParamsByModel:{"text-audio-rhart-audio-speech-2.8-turbo":{volume:4}},creationVoicePreset:{id:"Wise_Woman",name:"智慧女性"}};var snapshot=canvasMediaSettings({kind:"audio"},d2);d2.creationAudioParamsByModel["text-audio-rhart-audio-speech-2.8-turbo"].volume=7;d2.creationVoicePreset.name="changed";');
 assert.equal(run('snapshot.providerParams.volume'),4);
 assert.equal(run('snapshot.volume'),undefined);
 assert.equal(run('snapshot.voicePreset.name'),'智慧女性');
 assert.equal(run('canvasMediaSettings({kind:"audio"},{}).legacy'),true);
});
test('music defaults match declared option types and explicit models constrain candidate counts',()=>{
 assert.equal(run('referenceAudioProviderParams({creationAudioMode:"music",creationAudioModelCode:"text-music-rhart-audio-music-2.5"}).bitrate'),'64000');
 run('var countDraft={creationCount:"2"};referenceAudioChangeModel(countDraft,"bytedance-doubao-seed-tts-2.0");');
 assert.equal(run('countDraft.creationCount'),'1');
});
test('audio picker groups only compatible models without duplicating definitions',()=>{
 const voice=JSON.parse(run('JSON.stringify(referenceAudioModelGroups({}))'));
 assert.deepEqual(voice.map(group=>group.vendor),['Doubao','Kling','MiniMax']);
 assert.equal(new Set(voice.flatMap(group=>group.models.map(model=>model.code))).size,voice.flatMap(group=>group.models).length);
 const music=JSON.parse(run('JSON.stringify(referenceAudioModelGroups({creationAudioMode:"music"}))'));
 assert.equal(music.every(group=>group.models.every(model=>model.buckets.includes('TEXT_MUSIC'))),true);
 assert.equal(music.some(group=>group.models.some(model=>model.code.includes('speech'))),false);
});
