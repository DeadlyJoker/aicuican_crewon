/** Menu scrolling must not be treated as canvas navigation. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-node-menu.js',import.meta.url),'utf8');
test('scrolling within a long node menu retains it while canvas scrolling dismisses it',()=>{
 const context=vm.createContext({});
 vm.runInContext("var listeners={},removed=0;var document={addEventListener(type,handler){(listeners[type]??=[]).push(handler);},getElementById(){return {remove(){removed++;}};}};var window={addEventListener(){}};",context);
 vm.runInContext(source,context);
 vm.runInContext("referenceNodeMenu={id:'node'};listeners.wheel[0]({target:{closest(){return {};}}});",context);
 assert.equal(vm.runInContext('removed',context),0);
 assert.equal(vm.runInContext('referenceNodeMenu.id',context),'node');
 vm.runInContext('listeners.wheel[0]({target:{closest(){return null;}}});',context);
 assert.equal(vm.runInContext('removed',context),1);
 assert.equal(vm.runInContext('referenceNodeMenu',context),null);
});
