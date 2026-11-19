import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({referenceOpenVoicePicker(){},document:{addEventListener(){}}});
for(const name of ['reference-audio-voice-catalog.js','reference-audio-voice-library.js'])vm.runInContext(await readFile(new URL('../'+name,import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);

test('observed audio directory keeps every distinct row with a local display identifier',()=>{
 assert.equal(run('referenceAudioVoiceCatalog.rows.length'),439);
 assert.equal(run('new Set(referenceAudioVoiceCatalog.rows.map(row=>row.id)).size'),439);
 assert.equal(run('new Set(referenceAudioVoiceCatalog.rows.map(row=>row.name)).size'),439);
 assert.equal(run('referenceAudioVoiceCatalog.rows.every(row=>row.id.startsWith("audio-study-")&&typeof row.labels==="string")'),true);
});

test('voice search combines language gender and favorites without changing the directory',()=>{
 assert.equal(run('referenceAudioVoiceMatches(referenceAudioVoiceCatalog.rows,{query:"vIvI"})[0].name'),'Vivi 2.0');
 assert.equal(run('referenceAudioVoiceMatches(referenceAudioVoiceCatalog.rows,{language:"中文",gender:"男声"}).every(row=>row.labels.startsWith("中文 · ")&&row.labels.includes("男声"))'),true);
 assert.equal(run('referenceAudioVoiceMatches(referenceAudioVoiceCatalog.rows,{favoritesOnly:true},["audio-study-001"])[0].name'),'Vivi 2.0');
 assert.equal(run('referenceAudioVoiceMatches(referenceAudioVoiceCatalog.rows,{favoritesOnly:true},[]).length'),0);
 assert.equal(run('referenceAudioVoiceMatches(referenceAudioVoiceCatalog.rows,{query:"不存在的音色名字"}).length'),0);
});
