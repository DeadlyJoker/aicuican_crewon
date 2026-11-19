/** Voice menus fit both icon triggers and compact windows. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-workbench-voice.js',import.meta.url),'utf8');
function layout(rect,width,height){return JSON.parse(vm.runInNewContext(source+'\nJSON.stringify(referenceVoicePickerLayout(rect,width,height))',{rect,width,height,document:{addEventListener(){}},window:{addEventListener(){}}}));}
test('an icon trigger keeps a readable menu width and flips above near the bottom',()=>{
 const result=layout({left:960,top:650,bottom:682,width:32},1280,720);
 assert.equal(result.width,260);assert.equal(result.height,300);assert.equal(result.top,344);
});
test('a narrow viewport contains the entire menu',()=>{
 const result=layout({left:340,top:410,bottom:446,width:30},390,844);
 assert.ok(result.left>=12);assert.ok(result.left+result.width<=378);assert.ok(result.top+result.height<=832);
});
test('limited vertical space shortens the menu on the roomier side',()=>{
 const result=layout({left:12,top:120,bottom:150,width:200},300,300);
 assert.equal(result.height,132);assert.equal(result.top,156);assert.equal(result.width,260);
});
