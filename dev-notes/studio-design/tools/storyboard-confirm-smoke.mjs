import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-storyboard-state.js',import.meta.url),'utf8');
function fixture(){const ctx=vm.createContext({structuredClone,handleAction(){}});vm.runInContext(source,ctx);return code=>vm.runInContext(code,ctx);}
test('confirmation freezes assets once without creating shots or changing media',()=>{const r=fixture();r("var node={scriptSeries:{stage:'assets'}},assets=[{id:'a',title:'角色',candidates:[{id:'v1'}]}];var first=referenceConfirmSeriesAssets(node,assets,'first');assets[0].title='later';var second=referenceConfirmSeriesAssets(node,assets,'second')");assert.equal(r('first.changed'),true);assert.equal(r('second.changed'),false);assert.equal(r('node.scriptSeries.stage'),'storyboard');assert.equal(r('node.scriptSeries.assetConfirmation.assets[0].title'),'角色');assert.equal(r('node.scriptSeries.assetConfirmation.confirmedAt'),'first');assert.equal(r('assets[0].candidates.length'),1);assert.equal(r('referenceSeriesAssetsLocked(node)'),true);});
test('missing series or empty asset roster cannot advance',()=>{const r=fixture();assert.equal(r("referenceConfirmSeriesAssets({},[{id:'a'}],'now').ok"),false);r("var node={scriptSeries:{stage:'assets'}}");assert.equal(r("referenceConfirmSeriesAssets(node,[],'now').ok"),false);assert.equal(r('node.scriptSeries.stage'),'assets');});

test('parse settings require confirmed assets and preserve earlier settings on invalid input',()=>{const r=fixture();r("var node={scriptSeries:{stage:'assets'}}");assert.equal(r("referenceSaveStoryboardSettings(node,'standard').ok"),false);r("referenceConfirmSeriesAssets(node,[{id:'a'}],'now')");assert.equal(r("referenceSaveStoryboardSettings(node,'standard').ok"),true);assert.equal(r("referenceSaveStoryboardSettings(node,'bad').ok"),false);assert.equal(r('node.scriptSeries.storyboardSettings.mergeMode'),'standard');});

test('adding assets unlocks after a storyboard result without discarding the confirmation snapshot',()=>{
 const run=fixture();
 const node={scriptSeries:{assetConfirmation:{assets:[{id:'actor'}]},storyboardDemo:{}}};
 assert.equal(run('referenceSeriesAssetAddLocked('+JSON.stringify(node)+')'),true);
 node.scriptSeries.storyboardDemo.ep={groups:[{id:'g'}]};
 assert.equal(run('referenceSeriesAssetAddLocked('+JSON.stringify(node)+')'),false);
 assert.deepEqual(node.scriptSeries.assetConfirmation.assets,[{id:'actor'}]);
});
