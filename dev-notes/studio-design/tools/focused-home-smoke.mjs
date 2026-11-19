/** The focused homepage hides advanced previs promotion without removing saved work. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const model=await readFile(new URL('../reference-entry-model.js',import.meta.url),'utf8');
const layout=await readFile(new URL('../reference-layout.js',import.meta.url),'utf8');
function fixture(state){
 const ctx=vm.createContext({S:state,render(){},window:{addEventListener(){}},handleAction(){},canvasHtml(){return '';},document:{addEventListener(){}},location:{hash:''},esc:String,I(){return '';},iconBtn(){return '';},btn(){return '';},studioExamples:[{key:'previs',name:'预演示例'},{key:'drama',name:'短剧示例'}],mediaKind:()=> 'image',referenceEntryCanStart:()=>true,referenceInspirationHtml:()=>'',referenceUploadHtml:()=>'',referenceEntryKind:()=>({id:'agent'}),referenceEntryCreatePlaceholder:()=>'',referenceEntryCreationControls:()=>''});vm.runInContext(model+'\n'+layout,ctx);return ctx;
}
test('a legacy previs input is retained separately while the homepage returns to the drama draft',()=>{
 const state={screen:'home',referenceMode:'previs',referenceDrama:'write',drafts:{shared:'原空间预演需求'},referenceEntryDrafts:{previs:'已有空间草稿',drama:'已有短剧草稿'},projectDrafts:{空间项目:{project:'空间项目',projectKind:'previs',nodes:[]}}},before=JSON.stringify(state.projectDrafts),ctx=fixture(state);
 assert.equal(state.referenceMode,'drama');assert.equal(state.referenceEntryDrafts.previs,'已有空间草稿');assert.equal(state.drafts.shared,'已有短剧草稿');assert.equal(JSON.stringify(state.projectDrafts),before);
 const html=ctx.home();assert.doesNotMatch(html,/ref-mode:previs|3D导演台|片场预演|深度捕捉|可灵 4.0/);assert.match(html,/resume-project:空间项目/);assert.equal((html.match(/class="ref-feature-image"/g)||[]).length,4);
});
test('an old shared previs draft remains available even when no split draft records exist',()=>{
 const state={referenceMode:'previs',referenceDrama:'write',drafts:{shared:'未完成的空间需求'},projectDrafts:{}};const ctx=fixture(state);assert.equal(state.referenceEntryDrafts.previs,'未完成的空间需求');assert.equal(state.referenceMode,'drama');assert.equal(state.drafts.shared,'');assert.doesNotMatch(ctx.home(),/open-example:previs|ref-example:previs/);
});
test('existing creation selection and input are not rewritten',()=>{
 const state={referenceMode:'create',referenceDrama:'write',drafts:{shared:'原始创意'},projectDrafts:{}},ctx=fixture(state);assert.equal(state.referenceMode,'create');assert.equal(state.drafts.shared,'原始创意');assert.match(ctx.home(),/原始创意/);
});

test('recommendations switch to existing creation entries without submitting or overwriting another draft',()=>{
 const state={referenceMode:'drama',referenceDrama:'write',drafts:{shared:'剧本草稿'},referenceEntryDrafts:{drama:'剧本草稿',create:'素材需求'},projectDrafts:{}},ctx=fixture(state),before=JSON.stringify(state.projectDrafts);
 assert.equal(ctx.referenceSelectHomeFeature(state,'audio'),true);assert.equal(state.referenceMode,'create');assert.equal(state.referenceCreateKind,'audio');assert.equal(state.drafts.shared,'素材需求');assert.equal(state.referenceEntryDrafts.drama,'剧本草稿');
 ctx.referenceSelectHomeFeature(state,'script');assert.equal(state.drafts.shared,'剧本草稿');assert.equal(state.referenceDrama,'write');assert.equal(JSON.stringify(state.projectDrafts),before);assert.equal(ctx.referenceSelectHomeFeature(state,'previs'),false);
});
