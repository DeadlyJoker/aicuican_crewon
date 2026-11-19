/** Check independent node-tool drafts and immutable execution input in the design Demo. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../reference-storyboard-catalog.js', import.meta.url), 'utf8')+'\n'+await readFile(new URL('../canvas-node-tools.js', import.meta.url), 'utf8');
function fixture() {
  const context = vm.createContext({
    structuredClone,
    document: { addEventListener() {} },
    save() {},
    S: { nodeDrafts: {} },
  });
  vm.runInContext(source, context);
  const run = expression => vm.runInContext(expression, context);
  run("var first={id:'one',title:'角色',prompt:'保留原提示词'}, second={id:'two',title:'场景'};");
  return run;
}

test('different tools and nodes retain separate parameters', () => {
  const run = fixture();
  run("storeCanvasToolValue(first,'lighting','intensity',65);storeCanvasToolValue(first,'angle','rotation',35);storeCanvasToolValue(second,'lighting','intensity',20);");
  assert.equal(run("canvasToolValues(first,'lighting').intensity"), 65);
  assert.equal(run("canvasToolValues(first,'angle').rotation"), 35);
  assert.equal(run("canvasToolValues(second,'lighting').intensity"), 20);
  assert.equal(run("canvasToolValues(second,'angle').rotation"), 0);
  assert.equal(run('first.prompt'), '保留原提示词');
});

test('execution captures the chosen tool without mutating node text or later inputs', () => {
  const run = fixture();
  run("canvasActiveTool={nodeId:first.id,type:'person'};storeCanvasToolValue(first,'person','emotion','开心');var request=canvasToolExecution(first);storeCanvasToolValue(first,'person','emotion','严肃');");
  assert.equal(run('request.settings.emotion'), '开心');
  assert.match(run('request.prompt'), /情绪开心/);
  assert.equal(run('first.prompt'), '保留原提示词');
  assert.equal(run("canvasToolValues(first,'person').emotion"), '严肃');
});

test('a browser-state round trip preserves drafts without modifying shared defaults', () => {
  const run = fixture();
  run("storeCanvasToolValue(first,'angle','tilt',20);S=JSON.parse(JSON.stringify(S));var values=canvasToolValues(first,'angle');values.tilt=50;");
  assert.equal(run("canvasToolValues(first,'angle').tilt"), 20);
  assert.equal(run('canvasToolDefaults.angle.tilt'), 0);
});

test('saving node properties can retain tools while a new draft overrides one field', () => {
  const run = fixture();
  run("first.creationPreferences={toolDrafts:{angle:{rotation:40,tilt:15}}};storeCanvasToolValue(first,'angle','tilt',25);");
  assert.equal(run("canvasToolValues(first,'angle').rotation"), 40);
  assert.equal(run("canvasToolValues(first,'angle').tilt"), 25);
  assert.equal(run('first.creationPreferences.toolDrafts.angle.tilt'), 15);
});


test('storyboard executions keep the chosen preset when later selections change', () => {
  const run = fixture();
  run("canvasActiveTool={nodeId:first.id,type:'storyboard'};storeCanvasToolValue(first,'storyboard','preset','多机位九宫格');var request=canvasToolExecution(first);storeCanvasToolValue(first,'storyboard','preset','剧情推演四宫格');");
  assert.equal(run('request.name'), '分镜大师');
  assert.equal(run('request.settings.preset'), '多机位九宫格');
  assert.match(run('request.prompt'), /多机位九宫格/);
  assert.equal(run('first.prompt'), '保留原提示词');
});

test('element extraction has its own operation instead of reusing the source prompt', () => {
  const run = fixture();
  run("canvasActiveTool={nodeId:first.id,type:'elements'};var request=canvasToolExecution(first);");
  assert.equal(run('request.name'), '编辑元素');
  assert.equal(run('request.settings.mode'), '默认');
  assert.match(run('request.prompt'), /分层抠图并修复背景/);
  assert.equal(run('first.prompt'), '保留原提示词');
});

test('reference angle controls project older signed angles and percentage zoom without rewriting them',()=>{
 const run=fixture();
 run("first.creationPreferences={toolDrafts:{angle:{rotation:-90,tilt:-45,scale:120}}};var stored=JSON.stringify(first);var view=canvasAngleView(canvasToolValues(first,'angle'));");
 assert.equal(run('view.rotation'),270);
 assert.equal(run('view.tilt'),-45);
 assert.equal(run('view.zoom'),6);
 assert.equal(run('JSON.stringify(first)===stored'),true);
 assert.equal(run('canvasAngleView(canvasToolDefaults.angle).zoom'),5);
});

test('angle dragging and keyboard movement wrap rotation and respect the reference tilt limits',()=>{
 const run=fixture();
 run('var values={rotation:358,tilt:59,scale:100};var moved=canvasAngleAdjustment(values,5,5);');
 assert.equal(run('moved.rotation'),3);
 assert.equal(run('moved.tilt'),60);
 assert.equal(run('canvasAngleAdjustment(values,-360,-100).tilt'),-30);
 assert.equal(run('values.rotation'),358);
});

test('layer splitting stores the observed model choice per node and snapshots it independently',()=>{
 const run=fixture();run("storeCanvasToolValue(first,'elements','mode','Dola-Seedream-5.0-Pro-图层拆分');canvasActiveTool={nodeId:'one',type:'elements'};var execution=canvasToolExecution(first);storeCanvasToolValue(first,'elements','mode','默认')");
 assert.equal(run('execution.settings.mode'),'Dola-Seedream-5.0-Pro-图层拆分');assert.equal(run("canvasToolValues(second,'elements').mode"),'默认');assert.equal(run('first.prompt'),'保留原提示词');
});

test('older 25-grid drafts display the current name without rewriting saved history',()=>{
 const run=fixture();run("first.creationPreferences={toolDrafts:{storyboard:{preset:'25 宫格分镜'}}};var before=JSON.stringify(first);var values=canvasToolValues(first,'storyboard');");
 assert.equal(run('values.preset'),'25宫格连贯分镜');
 assert.equal(run('JSON.stringify(first)===before'),true);
 assert.equal(run('canvasStoryboardPresets[values.preset]'),'二十五幅画面，规划连续分镜');
 run("storeCanvasToolValue(first,'storyboard','preset','多机位九宫格');");
 assert.equal(run("canvasToolValues(first,'storyboard').preset"),'多机位九宫格');
});

test('all observed storyboard choices remain distinct and snapshot independently',()=>{
 const run=fixture();assert.equal(run('referenceStoryboardChoices().length'),45);assert.equal(run('new Set(referenceStoryboardChoices()).size'),45);
 run("storeCanvasToolValue(first,'storyboard','preset','电影级光影校正 · 伦勃朗布光');canvasActiveTool={nodeId:first.id,type:'storyboard'};var request=canvasToolExecution(first);storeCanvasToolValue(first,'storyboard','preset','动态场效（意境增强） · 雨天');");
 assert.equal(run('request.settings.preset'),'电影级光影校正 · 伦勃朗布光');assert.match(run('request.prompt'),/伦勃朗布光/);assert.equal(run("canvasToolValues(second,'storyboard').preset"),'剧情推演四宫格');assert.equal(run('first.prompt'),'保留原提示词');
});
