/** Video entry requires an actual model and the references required by its selected mode. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const media=(await readFile(new URL('../reference-entry-media.js',import.meta.url),'utf8')).split('async function referenceReadEntryMedia')[0];
const source=(await Promise.all(['reference-entry-kind.js','reference-video-catalog.js','reference-video-models.js','canvas-creation.js','reference-entry-video.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')))).join('\n')+'\n'+media;
function fixture(){const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source,context);return code=>vm.runInContext(code,context);}
test('unselected and unavailable models cannot start video preparation',()=>{
 const run=fixture();assert.equal(run("referenceEntryVideoCanStart({})"),false);assert.equal(run("referenceEntryVideoCanStart({referenceEntryCreationDrafts:{video:{creationVideoFamily:'missing',creationVideoMode:'text'}}})"),false);
});
test('first and last frames require two images while text mode needs none',()=>{
 const run=fixture();run("var state={};var draft=referenceEntryVideoDraft(state);var family=referenceVideoModelCatalog.families.find(item=>item.modes.some(mode=>mode.id==='frames')&&item.modes.some(mode=>mode.id==='text'));referenceSelectVideoFamily(draft,family.id,{creationVideoMode:'text'})");
 assert.equal(run('referenceEntryVideoCanStart(state)'),true);run("referenceSelectVideoMode(draft,'frames',draft)");assert.equal(run('referenceEntryVideoCanStart(state)'),false);
 run("state.referenceEntryMedia={create:[{id:'a',type:'图片'},{id:'b',type:'图片'}]}");assert.equal(run('referenceEntryVideoCanStart(state)'),true);
 run("state.referenceEntryMedia.create[1].type='视频'");assert.equal(run('referenceEntryVideoCanStart(state)'),false);
});
test('homepage drafts remain independent from image settings and use shared parameter defaults',()=>{
 const run=fixture();run("var state={referenceEntryCreationDrafts:{image:{creationRatio:'4:3'}}};var draft=referenceEntryVideoDraft(state);var family=referenceVideoModelCatalog.families.find(item=>item.modes.some(mode=>mode.id==='text'));referenceSelectVideoFamily(draft,family.id,{creationVideoMode:'text'});var binding=referenceVideoBinding(draft)");
 assert.equal(run('state.referenceEntryCreationDrafts.image.creationRatio'),'4:3');assert.equal(run('draft.creationVideoProvider.modelCode===binding.mode.modelCode'),true);
});
test('clearing the video model retains input and unrelated image preparation',()=>{
 const run=fixture();run("var state={referenceEntryDrafts:{create:'用户要求'},referenceEntryCreationDrafts:{image:{creationRatio:'16:9'},video:{creationVideoFamily:'old',creationVideoMode:'frames',creationVideoProvider:{params:{duration:6}}}}};referenceResetEntryVideoDraft(state)");
 assert.equal(run('state.referenceEntryDrafts.create'),'用户要求');assert.equal(run('state.referenceEntryCreationDrafts.image.creationRatio'),'16:9');assert.equal(run('referenceEntryVideoCanStart(state)'),false);
});
test('frame reversal changes assignments without changing uploaded items or other modes',()=>{
 const run=fixture();run("var state={referenceEntryMedia:{create:[{id:'first',type:'图片'},{id:'last',type:'图片'}]}};var draft=referenceEntryVideoDraft(state);draft.creationVideoMode='frames';var before=JSON.stringify(state.referenceEntryMedia);draft.creationReverseFrames=true");
 assert.equal(run('referenceEntryVideoPlan(state).roles[0].sourceId'),'last');assert.equal(run('referenceEntryVideoPlan(state).roles[0].role'),'首帧');assert.equal(run('referenceEntryVideoPlan(state).roles[1].sourceId'),'first');assert.equal(run('JSON.stringify(state.referenceEntryMedia)===before'),true);
 run("draft.creationVideoMode='text'");assert.equal(run('referenceEntryVideoPlan(state).active.length'),0);
});

test('homepage renders active frame order before unused references without reordering storage',()=>{
 const run=fixture();run("var state={referenceCreateKind:'video',referenceEntryCreationDrafts:{video:{creationVideoMode:'frames',creationReverseFrames:true}},referenceEntryMedia:{create:[{id:'first',type:'图片'},{id:'last',type:'图片'},{id:'extra',type:'图片'}]}};var before=JSON.stringify(state)");
 assert.equal(run("referenceEntryMediaDisplayItems(state,'create').map(item=>item.id).join(',')"),'last,first,extra');assert.equal(run('JSON.stringify(state)===before'),true);
 run("state.referenceCreateKind='image'");assert.equal(run("referenceEntryMediaDisplayItems(state,'create').map(item=>item.id).join(',')"),'first,last,extra');
});
