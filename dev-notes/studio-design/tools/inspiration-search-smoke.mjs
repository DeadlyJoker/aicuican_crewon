/** Local discovery matches names and descriptions without mutating the example catalog. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-inspiration-search.js',import.meta.url),'utf8');
const context=vm.createContext({document:{addEventListener(){}},handleAction(){}});vm.runInContext(source,context);
const filter=(items,query)=>context.referenceFilterInspiration(items,query);
const items=[{key:'drama',name:'末班灯',description:'五集剧本 全剧资产'},{key:'reference',name:'CrewON · 资产对照',description:'本地示例'},{key:'blank',name:'空白'}];
test('search combines words across the title and description',()=>{
 assert.deepEqual(Array.from(filter(items,'末班 资产'),item=>item.key),['drama']);
 assert.deepEqual(Array.from(filter(items,'不存在'),item=>item.key),[]);
});
test('full-width input and case differences match the same example',()=>{
 assert.deepEqual(Array.from(filter(items,'ＣＲＥＷＯＮ'),item=>item.key),['reference']);
});
test('blank queries restore all visible examples and keep catalog entries intact',()=>{
 const before=JSON.stringify(items);assert.equal(filter(items,'  ').length,2);filter(items,'[.*]');assert.equal(JSON.stringify(items),before);
});
test('workflow discovery reads the existing catalog and excludes example projects',()=>{
 context.S={referenceDiscover:3};context.studioExamples=items;context.referenceWorkflowTemplates=()=>[{id:'workflow-1',name:'镜头预演',nodes:[],edges:[]}];
 const workflows=context.referenceInspirationDirectory();assert.equal(workflows.length,1);assert.equal(workflows[0].workflow,true);assert.equal(workflows[0].key,'workflow-1');
 assert.equal(context.referenceInspirationDirectory(1).length,0);assert.equal(context.referenceInspirationDirectory(0).length,2);
});

test('previs recommendations are hidden without removing their catalogue entry',()=>{
 const examples=[...items,{key:'previs',name:'空间预演'}],before=JSON.stringify(examples);context.studioExamples=examples;
 assert.equal(context.referenceInspirationDirectory(0).some(item=>item.key==='previs'),false);
 assert.equal(context.referenceInspirationDirectory(2).some(item=>item.key==='previs'),false);
 assert.equal(JSON.stringify(examples),before);
});
