/** Branch inspection distinguishes intermediate choices from endings and preserves backtracking. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-story-playback.js',import.meta.url),'utf8');
function fixture(){
 const dialogs=[],errors=[];
 const S={project:'test',selected:'a',nodes:[{id:'a',kind:'choice',title:'出发',text:'在哪里等？',options:[{label:'继续',target:'b'},{label:'离开',target:'end'}]},{id:'b',kind:'choice',title:'下一站',text:'跟谁走？',options:[{label:'左边',target:'end'},{label:'右边',target:'end'}]},{id:'end',kind:'ending',label:'结局',title:'到达',description:'平安归来',frame:0}],edges:[['a','b'],['a','end'],['b','end']]};
 const ctx=vm.createContext({S,choiceProperties(){},saveStoryChoice(){},playStory(){},handleAction(){},nodeById:id=>S.nodes.find(n=>n.id===id),esc:String,btn:(text,action)=>`<button data-action="${action}">${text}</button>`,showDialog:(title,body,footer)=>dialogs.push({title,body,footer}),toast:text=>errors.push(text)});
 vm.runInContext(source,ctx);return {run:s=>vm.runInContext(s,ctx),S,dialogs,errors};
}
test('intermediate choices remain playable and previous steps restore the earlier choice',()=>{
 const f=fixture();f.run("playStory();playStory('b')");assert.match(f.dialogs.at(-1).body,/下一站/);assert.match(f.dialogs.at(-1).body,/左边/);
 f.run("playStory('end')");assert.match(f.dialogs.at(-1).body,/平安归来/);
 f.run("handleAction('story-play-back')");assert.match(f.dialogs.at(-1).body,/跟谁走/);
 f.run("handleAction('story-play-restart')");assert.match(f.dialogs.at(-1).body,/在哪里等/);
});
test('choice targets exclude self and any path returning to the edited choice',()=>{
 const f=fixture();assert.equal(f.run("referenceStoryTargets(S,'b').map(n=>n.id).join(',')"),'end');
 assert.equal(f.run("referenceValidateStoryChoice(S,'b',[{label:'循环',target:'a'},{label:'结局',target:'end'}]).ok"),false);
 assert.equal(f.run("referenceValidateStoryChoice(S,'a',[{label:'下一步',target:'b'},{label:'结局',target:'end'}]).ok"),true);
});
test('missing or changed targets stop traversal without moving the current path',()=>{
 const f=fixture();f.run("playStory();playStory('missing')");assert.equal(f.run('referenceStoryPlayback.path.join()'),'a');assert.equal(f.errors.length,1);
 f.S.nodes=f.S.nodes.filter(node=>node.id!=='b');f.run("playStory('b')");assert.equal(f.run('referenceStoryPlayback.path.join()'),'a');assert.equal(f.errors.length,2);
});
