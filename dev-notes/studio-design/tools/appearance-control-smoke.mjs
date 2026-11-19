/** Exercise saved appearance drafts, candidate inputs and local preview resources. */
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../appearance-preview-catalog.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../appearance-control-model.js',import.meta.url),'utf8'),context);
const run=source=>vm.runInContext(source,context);
test('older nodes without appearance fields receive neutral controls without mutation',()=>{
 run("var legacy={emotion:'开心',prompt:'旧角色描述'};var before=JSON.stringify(legacy);var resolved=appearanceValues(legacy);");
 assert.equal(run('resolved.age'),'');assert.equal(run('appearanceChanged(legacy)'),false);assert.equal(run('JSON.stringify(legacy)===before'),true);
});
test('candidate snapshots retain requested settings while subsequent drafts and accordion state stay separate',()=>{
 run("var draft={age:'青年',skin:'小麦色',hair:'长发',body:'纤瘦',expanded:'hair',protectBackground:false};var captured=appearanceSnapshot(draft);draft.hair='光头';var restored=appearanceValues(JSON.parse(JSON.stringify(draft)));");
 assert.equal(run('captured.hair'),'长发');assert.equal(run('captured.protectBackground'),false);assert.equal(run('captured.expanded'),undefined);assert.equal(run('captured.appearanceVersion'),1);assert.equal(run('restored.hair'),'光头');assert.equal(run('appearanceChanged(restored)'),true);
});
test('all selectable combinations resolve to an existing local preview',async()=>{
 const options=JSON.parse(run('JSON.stringify(appearanceChoices)')),files=new Set();
 for(const age of ['',...options.age.map(c=>c[0])])for(const skin of ['',...options.skin.map(c=>c[0])])for(const hair of ['',...options.hair.map(c=>c[0])])for(const body of ['',...options.body.map(c=>c[0])])files.add(run(`appearancePreview(${JSON.stringify({age,skin,hair,body})}).file`));
 for(const file of files)await access(new URL('../assets/reference-study/appearance/'+file,import.meta.url));
 assert.ok(files.has('character-young-natural-long-hair-cutout.webp'));assert.ok(files.has('body-young-wheat-long-hair-slim-cutout.webp'));assert.equal(files.size,288);
});
