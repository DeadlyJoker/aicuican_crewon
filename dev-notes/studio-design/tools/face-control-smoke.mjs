/** Validate face drafts and candidate snapshots independently from the visual study artwork. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../face-control-model.js',import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);
test('legacy person settings remain unchanged while resolving to face controls',()=>{
 run("var legacy={emotion:'开心',gaze:'向左',mouth:'张开',strength:60};var before=JSON.stringify(legacy);var resolved=faceControlValues(legacy);");
 assert.equal(run('resolved.emotionX'),1);assert.equal(run('resolved.gaze'),'左侧');assert.equal(run('resolved.mouth'),'张嘴');assert.equal(run('resolved.protectStyle'),true);assert.equal(run('JSON.stringify(legacy)===before'),true);
});
test('emotion interpolation preserves total weight and does not select outside the observed frame grid',()=>{
 for(const x of [-1,-.7,-.1,0,.2,.8,1])for(const y of [-1,-.6,0,.4,1]){
  const layers=JSON.parse(run(`JSON.stringify(faceEmotionLayers(${x},${y}))`));
  assert.ok(Math.abs(layers.reduce((sum,layer)=>sum+layer.weight,0)-1)<1e-10);
  assert.ok(layers.every(layer=>layer.file==='neutral.png'||/^(happy|sad)-(low|excited)-source-[1-9]\.png$/.test(layer.file)));
 }
 assert.equal(run('faceEmotionLayers(0,0)[0].file'),'neutral.png');assert.equal(run('faceEmotionLayers(1,0)[0].file'),'happy-excited-source-3.png');
});
test('candidate snapshots contain only current requested edits and protection settings',()=>{
 run("var draft={emotionX:.5,emotionY:-.3,gaze:'右上',mouth:'嘟嘴',protectStyle:false,protectBackground:true,faceUndo:[{emotionX:-1}],tab:'嘴巴'};var captured=faceControlSnapshot(draft);draft.emotionX=-1;");
 assert.equal(run('captured.emotionX'),.5);assert.equal(run('captured.faceVersion'),1);assert.equal(run('captured.protectStyle'),false);assert.equal(run('captured.faceUndo'),undefined);assert.equal(run('captured.tab'),undefined);
});
test('neutral controls do not request generation and edits survive a storage round trip',()=>{
 assert.equal(run("faceControlChanged({emotion:'自然',gaze:'正前方',mouth:'自然'})"),false);
 run("var saved=JSON.parse(JSON.stringify({emotionX:-.6,emotionY:.8,gaze:'左下',mouth:'咬嘴唇',protectBackground:false}));var restored=faceControlValues(saved);");
 assert.equal(run('restored.emotionY'),.8);assert.equal(run('restored.gaze'),'左下');assert.equal(run('restored.protectBackground'),false);assert.equal(run('faceControlChanged(restored)'),true);
});
test('emotion undo does not restore stale gaze or mouth selections',()=>{
 run("var grouped={emotionX:.5,emotionY:.4,gaze:'右上',mouth:'嘟嘴',faceHistory:{情绪:[{emotionX:0,emotionY:0,emotion:'自然'}]}};var undo=faceUndoStack(grouped)[0];var next={...grouped,...undo};");
 assert.equal(run('next.emotionX'),0);assert.equal(run('next.gaze'),'右上');assert.equal(run('next.mouth'),'嘟嘴');
 run("var legacyHistory={faceUndo:[{emotionX:-.5,emotionY:0,gaze:'左侧',mouth:'张嘴'}]};var projected=faceUndoStack(legacyHistory)[0];");
 assert.equal(run('projected.gaze'),undefined);assert.equal(run('projected.mouth'),undefined);
});
