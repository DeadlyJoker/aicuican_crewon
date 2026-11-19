import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-audio.js',import.meta.url),'utf8');
const creation=await readFile(new URL('../canvas-creation.js',import.meta.url),'utf8');
const catalog=await readFile(new URL('../reference-video-catalog.js',import.meta.url),'utf8');
const models=await readFile(new URL('../reference-video-models.js',import.meta.url),'utf8');
const video=await readFile(new URL('../reference-video.js',import.meta.url),'utf8');
const candidates=await readFile(new URL('../candidate-ux.js',import.meta.url),'utf8');
function fixture(){
 const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}},mediaKind:n=>n.kind==='voice'?'audio':n.kind});
 vm.runInContext(source+'\n'+catalog+'\n'+models+'\n'+video+'\n'+creation+'\n'+candidates,context);return code=>vm.runInContext(code,context);
}
test('old voice drafts keep legacy fields and receive explicit voice defaults',()=>{
 const run=fixture();assert.deepEqual(JSON.parse(run("JSON.stringify(canvasMediaSettings({kind:'voice'},{creationExpression:'角色对白',creationPace:'舒缓'}))")),{model:'project',mediaType:'audio',mode:'voice',expression:'角色对白',pace:'舒缓',format:'wav',sampleRate:44100,speed:1,volume:1,pitch:0});
});
test('stored values are normalized at read without rewriting old drafts',()=>{
 const run=fixture();assert.equal(run("var d={creationAudioFormat:'unknown',creationAudioSampleRate:123,creationAudioSpeed:'99',creationAudioVolume:'bad',creationAudioPitch:-40};var before=JSON.stringify(d);JSON.stringify(referenceAudioSettings(d))"),'{"format":"wav","sampleRate":44100,"speed":2,"volume":1,"pitch":-12}');assert.equal(run('JSON.stringify(d)===before'),true);
});
test('a prepared run keeps voice settings after the editable draft changes',()=>{
 const run=fixture();assert.equal(run("var d={creationAudioFormat:'mp3',creationAudioSampleRate:'24000',creationAudioSpeed:'1.3',creationAudioPitch:'4'};var snapshot=canvasMediaSettings({kind:'voice'},d);d.creationAudioSpeed=2;JSON.stringify([snapshot.format,snapshot.sampleRate,snapshot.speed,snapshot.pitch])"),'["mp3",24000,1.3,4]');
});
test('music mode keeps its separate style and lyrics alongside voice preferences',()=>{
 const run=fixture();assert.equal(run("var d={creationAudioMode:'music',creationMusicStyle:'安静钢琴',creationLyrics:'雨停之前',creationAudioSpeed:1.4};var s=canvasMediaSettings({kind:'voice'},d);d.creationAudioMode='voice';JSON.stringify([s.mode,s.musicStyle,s.lyrics,canvasMediaSettings({kind:'voice'},d).speed])"),'["music","安静钢琴","雨停之前",1.4]');
});

test('old candidate labels do not invent missing format or numeric parameters',()=>{
 const run=fixture();assert.equal(run("candidateCreationSettingsLabel({kind:'voice',creationSettings:{model:'project',expression:'角色对白',pace:'舒缓'}})"),'常规制作 · 项目模型 · 角色对白 · 舒缓');
});
test('new candidate labels show the captured values including zero pitch',()=>{
 const run=fixture();assert.equal(run("candidateCreationSettingsLabel({kind:'voice',creationSettings:{model:'project',format:'mp3',sampleRate:24000,speed:1.3,volume:1,pitch:0}})"),'常规制作 · 项目模型 · mp3 · 24000 Hz · 语速 1.3倍 · 音量 1倍 · 音调 0');
});

test('music validation identifies the first missing field',()=>{
 const run=fixture();assert.equal(run("canvasMusicInputIssue('', '已有歌词').field"),'canvas-music-style');assert.equal(run("canvasMusicInputIssue('安静钢琴', '  ').field"),'canvas-creation-prompt');assert.equal(run("canvasMusicInputIssue('安静钢琴', '等雨停')"),null);
});
