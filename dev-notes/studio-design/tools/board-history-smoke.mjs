import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-board.js',import.meta.url),'utf8');
function fixture(){const ctx=vm.createContext({fabric:{FabricObject:{customProperties:[]}},handleAction(){},document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source,ctx);return code=>vm.runInContext(code,ctx);}
test('a new edit after undo removes only the abandoned redo branch',()=>{const r=fixture();assert.equal(r("var h={items:['empty','a','b'],index:1};referenceBoardHistoryPush(h,'c');h.items.join(',')"),'empty,a,c');assert.equal(r('h.index'),2);});
test('selection and repeated saves do not add undo steps',()=>{const r=fixture();assert.equal(r("var h={items:['a'],index:0};referenceBoardHistoryPush(h,'a')"),false);assert.equal(r('h.items.length'),1);});
test('drawing histories are bounded and separate between modes',()=>{const r=fixture();r("var a=referenceBoardDocument(),b=referenceBoardDocument();for(var i=0;i<40;i++)referenceBoardHistoryPush(a.history,String(i));");assert.equal(r('a.history.items.length'),30);assert.equal(r('a.history.items[0]'),'10');assert.equal(r('a.history.index'),29);assert.equal(r('b.history.items.length'),0);});
