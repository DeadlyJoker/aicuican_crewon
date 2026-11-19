/** Asset inspection does not present unfinished references as available images. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-storyboard-mentions.js',import.meta.url),'utf8');
function fixture(){
 const context=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},studioAdoptedCandidate:asset=>asset.candidate,esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),I:()=>''});
 vm.runInContext(source,context);return value=>vm.runInContext(value,context);
}
test('unfinished references show their description without a blank preview column',()=>{
 const run=fixture();const html=run("referenceStoryboardMentionDetailHtml({id:'a',kind:'character',title:'陈叔',description:'守站人 <script>',referenceOnly:true,candidate:{frame:1,number:2}})");
 assert.ok(html.includes('出镜角色 · 暂无参考图'));assert.ok(html.includes('守站人 &lt;script>'));assert.ok(!html.includes('data-sb-preview'));assert.ok(!html.includes('class="ref-sb-mention-image"'));
});
test('adopted references retain the preview target and recorded version',()=>{
 const run=fixture();const html=run("referenceStoryboardMentionDetailHtml({id:'station',kind:'scene',title:'旧站台',prompt:'雨夜',candidate:{frame:3,number:4}})");
 assert.ok(html.includes('data-sb-preview="station"'));assert.ok(html.includes('分镜场景 · v4'));assert.ok(html.includes('frame3'));assert.ok(html.includes('雨夜'));
});
