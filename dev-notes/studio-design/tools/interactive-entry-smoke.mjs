/** Interactive requirements remain validated planning data, separate from authored sample branches. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-interactive-entry.js',import.meta.url),'utf8');
function fixture(){const ctx=vm.createContext({S:{},render(){},home(){},handleAction(){},document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source,ctx);return code=>vm.runInContext(code,ctx);}
test('story settings reject fractional counts and impossible choice requirements',()=>{
 const run=fixture();assert.equal(run('referenceValidateInteractiveOptions(referenceInteractiveOptions()).ok'),true);
 for(const next of ['{shots:1.5}','{shots:1,choices:2}','{options:1}','{endings:0}',"{template:'unknown'}"]){assert.equal(run(`referenceValidateInteractiveOptions({...referenceInteractiveDefaults,...${next}}).ok`),false);}
});
test('custom interactive input is not replaced by the station sample story',async()=>{
 const catalog=await readFile(new URL('../catalog.js',import.meta.url),'utf8'),result=vm.runInNewContext(catalog+";makeStoryWorkspace('interactive','在午夜列车调查失踪事件')");
 assert.equal(result.project,'互动影游');assert.equal(result.nodes[0].text,'在午夜列车调查失踪事件');assert.equal(result.nodes.some(node=>['ending','choice','image'].includes(node.kind)),false);
 assert.match(result.nodes[1].text,/尚未生成分支/);
});
