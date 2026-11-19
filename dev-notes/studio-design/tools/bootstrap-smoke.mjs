/** Startup failures must stop later scripts without touching saved drafts. */
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=await readFile(new URL('../bootstrap.js',import.meta.url),'utf8');
async function run(mode){
 const loaded=[],panels=[],listeners={};
 const element=tag=>({tag,style:{},dataset:{},children:[],setAttribute(){},append(...children){this.children.push(...children)},focus(){}});
 const document={documentElement:{dataset:{}},getElementById(){return null},querySelector(){return null},querySelectorAll(){return ['a.js','b.js'].map(src=>({dataset:{studioSrc:src}}))},createElement:element,body:{append(el){if(el.tag!=='script'){panels.push(el);return;}loaded.push(el.src);if(mode==='network'&&loaded.length===1){el.onerror();return;}if(mode==='runtime'&&loaded.length===1)listeners.error({filename:el.src,message:'runtime failure'});el.onload();}}};
 vm.runInNewContext(source,{document,window:{addEventListener(type,handler){listeners[type]=handler}},location:{href:'http://localhost/',reload(){}},URL,Error});
 await new Promise(resolve=>setImmediate(resolve));
 return {loaded,panels,ready:document.documentElement.dataset.studioReady};
}
test('successful startup preserves declared dependency order',async()=>{const result=await run('success');assert.deepEqual(result.loaded,['http://localhost/a.js','http://localhost/b.js']);assert.equal(result.ready,'true');assert.equal(result.panels.length,0);});
test('missing dependency prevents all later scripts and presents recovery',async()=>{const result=await run('network');assert.equal(result.loaded.length,1);assert.equal(result.ready,undefined);assert.equal(result.panels[0].dataset.studioStartup,'failed');assert.equal(result.panels[0].children.at(-1).textContent,'刷新重试');});
test('a dependency runtime exception also prevents later consumers',async()=>{const result=await run('runtime');assert.equal(result.loaded.length,1);assert.equal(result.ready,undefined);assert.equal(result.panels.length,1);});
