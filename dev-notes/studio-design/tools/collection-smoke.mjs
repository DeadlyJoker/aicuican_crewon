import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-collection.js',import.meta.url),'utf8');
function setup(){const storage=new Map(),context=vm.createContext({localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},document:{addEventListener(){}},handleAction(){}});vm.runInContext(source,context);return code=>vm.runInContext(code,context);}
test('collection persists independently and excludes recoverably removed items',()=>{
 const r=setup();r(`var items=[{id:'1',type:'图片',title:'雨夜',frame:1},{id:'2',type:'图片',title:'旧灯',frame:2,removedAt:'now'}];referenceCollectionWrite(items)`);
 assert.equal(r("referenceCollectionRead().length"),2);assert.equal(r("referenceCollectionVisible(referenceCollectionRead(),'','全部类型').length"),1);
 r("delete items[1].removedAt;referenceCollectionWrite(items)");assert.equal(r("referenceCollectionVisible(referenceCollectionRead(),'','图片').length"),2);
});
test('collection search and type filters compose without mutating originals',()=>{
 const r=setup();r(`var items=[{id:'1',type:'图片',title:'Night 雨夜'},{id:'2',type:'音频',title:'Night 雨声'}];var before=JSON.stringify(items)`);
 assert.equal(r("referenceCollectionVisible(items,' NIGHT ','图片')[0].id"),'1');
 assert.equal(r("referenceCollectionVisible(items,'Night','视频').length"),0);assert.equal(r('JSON.stringify(items)===before'),true);
});
test('invalid persisted collection fails instead of replacing existing records',()=>{const r=setup();r("localStorage.setItem(referenceCollectionKey,'{}')");assert.throws(()=>r('referenceCollectionRead()'),/无法读取/);});
