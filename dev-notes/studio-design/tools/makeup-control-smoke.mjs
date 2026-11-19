/** Verify local preset assets and immutable makeup execution inputs. */
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const context=vm.createContext({});
for(const file of ['makeup-catalog.js','makeup-control-model.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),context);
const run=source=>vm.runInContext(source,context);
test('the five observed categories retain 83 unique presets with local thumbnails',async()=>{
 const items=JSON.parse(run('JSON.stringify(makeupCatalog)'));
 assert.equal(items.length,83);assert.equal(new Set(items.map(item=>item.id)).size,83);
 assert.deepEqual(Object.values(Object.groupBy(items,item=>item.category)).map(group=>group.length),[26,27,12,11,7]);
 for(const item of items)await access(new URL('../'+item.image,import.meta.url));
});
test('browsing another category and editing a draft do not rewrite captured preset inputs',()=>{
 run("var first=makeupCatalog[0],second=makeupCatalog[26];var draft=makeupValues({selectedId:first.id,protectBackground:false,scrolls:{'现代·人设':260}});var captured=makeupSnapshot(draft);draft.category='古装·人设';draft.selectedId=second.id;var restored=makeupValues(JSON.parse(JSON.stringify(draft)));");
 assert.equal(run('captured.presetName'),'通勤裸妆');assert.equal(run('captured.presetVersion'),1);assert.equal(run('captured.protectBackground'),false);assert.equal(run('captured.scrolls'),undefined);assert.equal(run('restored.category'),'古装·人设');assert.equal(run('makeupSelected(restored).name'),'宋韵淡雅');
});
test('custom image bytes stay in the library while execution records capture their immutable identity',()=>{
 run("var custom=[{id:'custom-test',name:'参考妆容',category:'我的',version:1,image:'data:image/webp;base64,example'}];var customSnapshot=makeupSnapshot({selectedId:'custom-test'},custom);custom[0].name='更名草稿';");
 assert.equal(run('customSnapshot.presetName'),'参考妆容');assert.equal(run('customSnapshot.presetId'),'custom-test');assert.equal(run('customSnapshot.image'),undefined);assert.equal(run('customSnapshot.makeupVersion'),1);
 assert.throws(()=>run("makeupSnapshot({selectedId:'missing'})"),/must be selected/);
 assert.equal(run('makeupValues().selectedId'),'');
});
