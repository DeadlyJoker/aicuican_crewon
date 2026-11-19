/** Quality presets keep optional choices, immutable execution inputs and ordinary prompts separate. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../portrait-quality-model.js',import.meta.url),'utf8');
function fixture(){const context=vm.createContext({});vm.runInContext(source,context);return code=>vm.runInContext(code,context)}
test('ordinary saved drafts are not implicitly upgraded into a quality preset',()=>{
 const run=fixture();assert.equal(run('portraitQualityValues(undefined)'),null);assert.equal(run('portraitQualityExecution(undefined)'),null);
 run('var d=portraitQualityValues({})');assert.equal(run('d.sceneLight'),'');assert.equal(run("portraitQualityGroups.filter(([key])=>d[key]).length"),6);
});
test('clicking a selected option clears just that category and does not mutate an earlier draft',()=>{
 const run=fixture();run("var d=portraitQualityValues({});var next=portraitQualityChoose(d,'skinTexture','自然质感');var next2=portraitQualityChoose(next,'sceneLight','黄昏暖光')");
 assert.equal(run('d.skinTexture'),'自然质感');assert.equal(run('next.skinTexture'),'');assert.equal(run('next.blend'),'自然融合');assert.equal(run('next2.sceneLight'),'黄昏暖光');assert.equal(run('next.sceneLight'),'');
});
test('execution keeps its own choices and instructions after a later edit',()=>{
 const run=fixture();run("var d=portraitQualityValues({sceneLight:'黄昏暖光'});var execution=portraitQualityExecution(d,'保留衣服颜色');d.sceneLight='清晨柔光';d.skinTexture=''");
 assert.equal(run('execution.settings.sceneLight'),'黄昏暖光');assert.equal(run('execution.settings.skinTexture'),'自然质感');assert.match(run('execution.prompt'),/保留衣服颜色/);assert.equal(run('execution.settings.qualityVersion'),1);assert.equal(run('Object.hasOwn(execution.settings,"enabled")'),false);
});
test('removing the preset does not execute defaults or discard the saved selections',()=>{
 const run=fixture();run("var stored={...portraitQualityValues({sceneLight:'夜间低照'}),enabled:false};stored=JSON.parse(JSON.stringify(stored));");
 assert.equal(run("portraitQualityExecution(stored,'独立的文字输入')"),null);assert.equal(run('portraitQualityValues(stored).sceneLight'),'夜间低照');assert.equal(run('portraitQualityValues(stored).enabled'),false);
});
