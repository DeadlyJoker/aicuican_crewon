/** Homepage image settings and adopted references survive the handoff without changing outputs. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const sources=await Promise.all(['reference-entry-model.js','reference-node-commands.js','asset-reference-model.js','reference-entry-image.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
function fixture(){
 const S={referenceMode:'create',referenceEntryDrafts:{create:'用户的图片要求'},drafts:{},nodeDrafts:{},versions:{},edges:[],nodes:[{id:'ref',kind:'image',title:'参考图',adoptedCandidateId:'v2',candidates:[{id:'v2',number:2,frame:-1}]},{id:'image-result',kind:'image',title:'图片',adoptedCandidateId:'old',candidates:[{id:'old',number:1,frame:0,prompt:'旧画面'}]}]};
 const context=vm.createContext({S,structuredClone,handleAction(){}});vm.runInContext(sources.join('\n'),context);
 return {S,run:code=>vm.runInContext(code,context)};
}
test('image handoff pins the adopted reference and copies preparation independently',()=>{
 const h=fixture(),before=JSON.stringify(h.S.nodes[1].candidates);h.run("var draft={creationImageFamily:'selected',creationImageProvider:{params:{ratio:'16:9'}}};var applied=referenceApplyEntryImageDraft(draft,['ref']);draft.creationImageProvider.params.ratio='1:1'");
 assert.equal(h.run('applied.ok'),true);assert.equal(h.S.nodeDrafts['image-result'].creationImageProvider.params.ratio,'16:9');assert.equal(h.S.nodeDrafts['image-result'].prompt,'用户的图片要求');assert.equal(h.S.nodes[1].assetReferences[0].candidateId,'v2');assert.equal(JSON.stringify(h.S.nodes[1].candidates),before);
});
test('an unavailable reference rejects before preparation settings or graph entries change',()=>{
 const h=fixture(),before=JSON.stringify(h.S);assert.equal(h.run("referenceApplyEntryImageDraft({creationImageFamily:'new'},['missing']).ok"),false);assert.equal(JSON.stringify(h.S),before);
});
test('video handoff retains its model input and the previous accepted result',()=>{
 const h=fixture();h.S.nodes[1].id='video-result';h.S.nodes[1].kind='video';const accepted=JSON.stringify(h.S.nodes[1].candidates);
 assert.equal(h.run("referenceApplyEntryMediaDraft('video',{creationVideoFamily:'selected-video',creationVideoProvider:{params:{duration:6}}},['ref']).ok"),true);
 assert.equal(h.S.nodeDrafts['video-result'].creationVideoProvider.params.duration,6);assert.equal(JSON.stringify(h.S.nodes[1].candidates),accepted);
});
test('audio handoff targets the existing voice node and retains accepted audio',()=>{
 const h=fixture();h.S.nodes[1].id='audio-result';h.S.nodes[1].kind='voice';const accepted=JSON.stringify(h.S.nodes[1].candidates);
 assert.equal(h.run("referenceApplyEntryMediaDraft('audio',{creationAudioMode:'music',creationAudioModelCode:'music-model'},[]).ok"),true);
 assert.equal(h.S.nodeDrafts['audio-result'].creationMusicStyle,'用户的图片要求');assert.equal(h.S.nodeDrafts['audio-result'].prompt,'');assert.equal(h.S.nodeDrafts['audio-result'].creationLyrics,undefined);assert.equal(JSON.stringify(h.S.nodes[1].candidates),accepted);
});
