/** An unrelated prompt must not start screenplay production or overwrite imported source text. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-entry-model.js',import.meta.url),'utf8');
const context=vm.createContext({});vm.runInContext(source,context);
const run=code=>vm.runInContext(code,context);
test('switching to production requires an imported script even when creative instructions exist',()=>{
 run("var state={referenceMode:'drama',referenceDrama:'write',drafts:{shared:'保留蓝色雨夜'}}");
 assert.equal(run('referenceEntryInput(state)'),'保留蓝色雨夜');
 run("state.referenceDrama='produce'");assert.equal(run('referenceEntryInput(state)'),'');
 run("state.referenceScriptInput={text:'剧本原文'}");assert.equal(run('referenceEntryInput(state)'),'剧本原文');
 run("state.referenceDrama='write'");assert.equal(run('referenceEntryInput(state)'),'保留蓝色雨夜');
});
test('script validation retains internal spacing and rejects empty or oversized input',()=>{
 assert.equal(run("referenceValidateScript('  \ufeff第1集\\n  林晚：等一下。  ').text"),'第1集\n  林晚：等一下。');
 assert.equal(run("referenceValidateScript(' \\n ').ok"),false);
 assert.equal(run("referenceValidateScript('字'.repeat(150000)).ok"),true);
 assert.equal(run("referenceValidateScript('字'.repeat(150001)).ok"),false);
});
test('video conversion cannot accidentally run from a text prompt or an imported screenplay',()=>{
 run("state.referenceDrama='redraw'");assert.equal(run('referenceEntryInput(state)'),'');
});

test('creation modes keep independent drafts and restore them after serialization',()=>{
 run("var separate={referenceMode:'drama',referenceDrama:'write',drafts:{shared:'原有短剧构思'}};referenceSetEntryInput(separate,referenceEntryInput(separate));separate.referenceMode='previs'");
 assert.equal(run('referenceEntryInput(separate)'),'');
 run("referenceSetEntryInput(separate,'空间预演');separate.referenceMode='drama'");
 assert.equal(run('referenceEntryInput(separate)'),'原有短剧构思');
 run("separate=JSON.parse(JSON.stringify(separate));separate.referenceMode='previs'");
 assert.equal(run('referenceEntryInput(separate)'),'空间预演');
});

test('custom previs stores the request without substituting station example outputs',async()=>{
 const catalog=await readFile(new URL('../catalog.js',import.meta.url),'utf8');
 const value=vm.runInNewContext(catalog+";makeStoryWorkspace('previs','从客厅入口转向落地窗')");
 assert.equal(value.project,'空间预演');
 assert.equal(value.nodes[0].text,'从客厅入口转向落地窗');
 assert.equal(value.nodes.some(node=>['image','camera'].includes(node.kind)),false);
 assert.match(value.nodes[1].text,/尚未接入三维预演服务/);
});
