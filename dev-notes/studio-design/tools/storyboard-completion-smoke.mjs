/** Chinese composition must not commit the highlighted asset suggestion. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-storyboard-completion.js',import.meta.url),'utf8');
function fixture(){
 const listeners={document:{},window:{}};
 const ctx=vm.createContext({document:{addEventListener(type,fn){listeners.document[type]=fn;}},window:{addEventListener(type,fn){listeners.window[type]=fn;}}});
 vm.runInContext(source+";var chosen=0,updates=0;referenceChooseStoryboardMention=()=>chosen++;referenceUpdateStoryboardCompletion=()=>updates++;referenceStoryboardCompletion={assets:[{}],index:0};",ctx);
 return {listeners,read:code=>vm.runInContext(code,ctx)};
}
test('IME Enter remains with the text input rather than choosing a suggestion',()=>{
 const f=fixture();let prevented=0;
 f.listeners.window.keydown({key:'Enter',isComposing:true,preventDefault(){prevented++},stopImmediatePropagation(){}});
 assert.equal(prevented,0);assert.equal(f.read('chosen'),0);
 f.listeners.window.keydown({key:'Enter',isComposing:false,preventDefault(){prevented++},stopImmediatePropagation(){}});
 assert.equal(prevented,1);assert.equal(f.read('chosen'),1);
});
test('search waits for composition completion',()=>{
 const f=fixture(),target={matches:()=>true};f.listeners.document.input({target,isComposing:true});assert.equal(f.read('updates'),0);
 f.listeners.document.compositionend({target});assert.equal(f.read('updates'),1);
});
test('caret navigation refreshes the replacement position',()=>{
 const f=fixture();f.listeners.document.keyup({target:{matches:()=>true},key:'ArrowLeft',isComposing:false});assert.equal(f.read('updates'),1);
});
test('mention query ignores email addresses, earlier lines and selected prose',()=>{
 const f=fixture();assert.equal(f.read("referenceStoryboardMentionQuery('a@example.com',13)"),null);assert.equal(f.read("referenceStoryboardMentionQuery('@林 晚',4)"),null);assert.equal(f.read("referenceStoryboardMentionQuery('开始 @林',5,3)"),null);assert.equal(f.read("referenceStoryboardMentionQuery('开场，@林，然后转身',5).query"),'林');assert.equal(f.read("referenceStoryboardMentionQuery('递给@林',4).query"),'林');
});
test('owner scrolling repositions suggestions without discarding the keyboard selection',()=>{
 const f=fixture();f.read("var placed=0,closed=0;referencePositionStoryboardCompletion=()=>placed++;referenceCloseStoryboardCompletion=()=>closed++;referenceStoryboardCompletion={menu:{contains:()=>false},index:1}");f.listeners.document.scroll({target:{}});assert.equal(f.read('placed'),1);assert.equal(f.read('closed'),0);assert.equal(f.read('referenceStoryboardCompletion.index'),1);
});
