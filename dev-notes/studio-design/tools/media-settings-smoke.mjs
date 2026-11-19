/** Exercise media-specific settings and compatibility with older candidate snapshots. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}},mediaKind:n=>['voice','audio'].includes(n.kind)?'audio':n.kind,I:()=>'',esc:String});
for(const file of ['reference-video-catalog.js','reference-video-models.js','reference-video.js','reference-audio.js','reference-image.js','canvas-creation.js','candidate-ux.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);
test('audio ignores legacy image dimensions and captures independent voice settings',()=>{
 run("var draft={creationRatio:'16:9',creationResolution:'2K',creationExpression:'角色对白',creationPace:'舒缓'};var captured=canvasMediaSettings({kind:'voice'},draft);draft.creationPace='轻快';");
 assert.equal(run('captured.pace'),'舒缓');
 assert.equal(run('captured.ratio'),undefined);
 const html=run("canvasMediaParametersHtml({kind:'voice'},draft)");
 assert.match(html,/aria-label="语速"/);assert.doesNotMatch(html,/制作画幅|制作清晰度/);
});
test('image and video retain visual parameters',()=>{
 assert.equal(run("canvasMediaSettings({kind:'image'},{creationResolution:'2K'}).resolution"),'2K');
 assert.match(run("canvasMediaParametersHtml({kind:'video',seconds:8},{})"),/生成时长/);
});
test('legacy audio records remain readable without pretending to have image dimensions',()=>{
 run("var old={kind:'voice',creationSettings:{model:'quality',ratio:'16:9',resolution:'1K'}};var before=JSON.stringify(old)");
 assert.equal(run('candidateCreationSettingsLabel(old)'),'常规制作 · 精细声音');
 assert.equal(run('JSON.stringify(old)'),run('before'));
 assert.equal(run("candidateCreationSettingsLabel({kind:'voice',creationSettings:captured})"),'常规制作 · 项目模型 · 角色对白 · 舒缓 · wav · 44100 Hz · 语速 1倍 · 音量 1倍 · 音调 0');
});
test('voice and music drafts survive mode switches independently',()=>{
 run("var n={kind:'voice'}, d={prompt:'旁白稿',creationAudioMode:'music',creationMusicStyle:'温暖的钢琴',creationLyrics:'雨停之前'};var music=canvasMediaSettings(n,d);d.creationAudioMode='voice';var voice=canvasMediaSettings(n,d)");
 assert.equal(run('music.musicStyle'),'温暖的钢琴');
 assert.equal(run('music.lyrics'),'雨停之前');
 assert.equal(run('voice.mode'),'voice');
 assert.equal(run('d.prompt'),'旁白稿');
 assert.match(run("canvasPromptHtml(n,{...d,creationAudioMode:'music'},d.prompt)"),/音乐风格[\s\S]*雨停之前/);
 assert.match(run('canvasPromptHtml(n,d,d.prompt)'),/旁白稿/);
});
test('video uses video resolution and sound settings instead of legacy image resolution',()=>{
 assert.equal(run("canvasMediaSettings({kind:'video'},{creationResolution:'2K'}).resolution"),'720p');
 assert.equal(run("canvasMediaSettings({kind:'video'},{creationGenerateAudio:'no'}).generateAudio"),false);
});
test('video modes keep inactive inputs but only select the required media',()=>{
 run("var refs=[{sourceId:'a',sourceKind:'character',candidateId:'a-v1'},{sourceId:'sound',sourceKind:'voice',candidateId:'s-v1'},{sourceId:'b',sourceKind:'scene',candidateId:'b-v2'},{sourceId:'c',sourceKind:'image',candidateId:'c-v1'}];var original=JSON.stringify(refs);var frames=canvasVideoReferencePlan({creationVideoMode:'frames'},refs)");
 assert.equal(run('frames.active.length'),2);
 assert.equal(run('frames.roles[1].candidateId'),'b-v2');
 assert.equal(run('frames.roles[1].role'),'尾帧');
 assert.equal(run("canvasVideoReferencePlan({creationVideoMode:'text'},refs).active.length"),0);
 assert.equal(run("canvasVideoReferencePlan({creationVideoMode:'first'},refs).active.length"),1);
 assert.equal(run("canvasVideoReferencePlan({creationVideoMode:'reference'},refs).active.length"),4);
 assert.equal(run('JSON.stringify(refs)'),run('original'));
});
test('frame swapping only reverses the selected pair and incomplete frames remain invalid',()=>{
 assert.equal(run("canvasVideoReferencePlan({creationVideoMode:'frames',creationReverseFrames:true},refs).active.map(ref=>ref.sourceId).join(',')"),'b,a');
 assert.equal(run("canvasVideoReferencePlan({creationVideoMode:'frames'},refs.slice(0,1)).error"),'请再添加 1 份画面参考');
 assert.equal(run("canvasVideoReferencePlan({creationVideoMode:'frames'},refs.filter(ref=>ref.sourceKind==='voice')).active.length"),0);
});

test('video snapshots keep quality and sample mode independent from later editing',()=>{
 run("var draft={creationVideoQuality:'high',creationVideoPreviewMode:'yes',seconds:'12'};var shot=canvasMediaSettings({kind:'video'},draft);draft.creationVideoQuality='standard';draft.creationVideoPreviewMode='no';");
 assert.equal(run('shot.videoQuality'),'high');assert.equal(run('shot.previewMode'),true);assert.equal(run('shot.seconds'),12);
 assert.match(run("candidateCreationSettingsLabel({kind:'video',creationSettings:shot})"),/高画质 · 样片模式/);
});
test('earlier video durations remain selectable without rewriting the record',()=>{
 assert.match(run("referenceVideoParametersHtml({seconds:60},{})"),/data-value="60"[^>]*aria-label="生成时长 60秒"[^>]*aria-pressed="true"/);
 assert.equal(run("referenceVideoSettings({seconds:60},{}).seconds"),60);
});
test('derived audio captures a voice preset independently and music omits it',()=>{
 run("var source={voicePreset:{id:'gentle-girl',name:'Gentle Girl'}};var derived=canvasDerivedPreferences(source,'voice');source.voicePreset.name='Changed';var voice=canvasMediaSettings({kind:'voice'},derived);derived.creationVoicePreset.name='Edited';");
 assert.equal(run('voice.voicePreset.name'),'Gentle Girl');
 assert.deepEqual(JSON.parse(run("JSON.stringify(canvasDerivedPreferences(source,'video'))")),{});
 assert.equal(run("canvasMediaSettings({kind:'voice'},{...derived,creationAudioMode:'music'}).voicePreset"),undefined);
 assert.match(run("candidateCreationSettingsLabel({kind:'voice',creationSettings:voice})"),/音色 Gentle Girl/);
});

test('image options include observed ratios, resolution and independent quality snapshots',()=>{
 run("var imageDraft={creationRatio:'21:9',creationResolution:'4K',creationImageQuality:'max'};var imageSnapshot=canvasMediaSettings({kind:'image'},imageDraft);imageDraft.creationImageQuality='low'");
 assert.equal(run('imageSnapshot.imageQuality'),'max');
 assert.equal(run('imageSnapshot.ratio'),'21:9');
 assert.equal(run('imageSnapshot.resolution'),'4K');
 assert.match(run("candidateCreationSettingsLabel({kind:'image',creationSettings:imageSnapshot})"),/质量 最大/);
 assert.doesNotMatch(run("candidateCreationSettingsLabel({kind:'image',creationSettings:{model:'project',ratio:'1:1',resolution:'1K'}})"),/质量/);
 assert.equal(run("canvasMediaSettings({kind:'voice'},imageDraft).imageQuality"),undefined);
 assert.equal(run("canvasMediaSettings({kind:'video'},imageDraft).imageQuality"),undefined);
 const html=run('referenceImageParametersHtml(imageDraft)');
 assert.match(html,/比例 9:21/);assert.match(html,/分辨率 4K/);assert.match(html,/生成质量 极高/);
});
test('batch image settings retain their own draft and reject unsupported choices',()=>{
 run("var batch={};var nodeDraft={creationRatio:'1:1'};var historical={ratio:'16:9'};var accepted=referenceUpdateImageDraft(batch,'ratio','21:9');var rejected=referenceUpdateImageDraft(batch,'resolution','8K');var batchMarkup=referenceImageParametersHtml(batch,'assets');");
 assert.equal(run('accepted'),true);assert.equal(run('rejected'),false);
 assert.equal(run('batch.creationRatio'),'21:9');assert.equal(run('batch.creationResolution'),undefined);
 assert.equal(run('nodeDraft.creationRatio'),'1:1');assert.equal(run('historical.ratio'),'16:9');
 assert.match(run('batchMarkup'),/data-image-scope="assets"/);
 assert.match(run('batchMarkup'),/aria-label="资产制作参数"/);
});

test('tool examples keep the original uploaded image and label it as an ungenerated preview',()=>{
 run("var previewNode={id:'preview',kind:'image',frame:-123,adoptedCandidateId:'old',candidates:[{id:'old',number:1,frame:-123,kind:'image',prompt:'original'}]};var S={project:'preview-project',versions:{},history:[]};function nodeById(id){return id===previewNode.id?previewNode:null};var oldPreview=JSON.stringify(previewNode.candidates[0]);var previewRequest={project:S.project,nodeId:previewNode.id,sourceReferences:[],input:{creationSettings:{tool:'分镜大师',toolSettings:{preset:'电影级光影校正 · 伦勃朗布光'}}}};var previewResult=createPreparedCandidates(previewRequest,'example only',1);");
 assert.equal(run('previewResult.created[0].frame'),-123);assert.equal(run('previewResult.created[0].sourcePreview'),true);assert.equal(run('previewNode.adoptedCandidateId'),'old');assert.equal(run('JSON.stringify(previewNode.candidates[0])===oldPreview'),true);
 assert.match(run('candidateVisual(previewResult.created[0])'),/原图参考 · 效果未生成/);assert.doesNotMatch(run('candidateVisual(previewResult.created[0])'),/示意照片/);
});

test('source preview reference labels use recorded versions and preserve older unknown versions',()=>{
 run("function studioCandidateReferencesHtml(candidate){return candidate.sourceReferences?.length?'additional references':'existing reference presentation'};var referenceCandidate={sourcePreview:true,creationSettings:{baseCandidateNumber:2},sourceReferences:[]};var referenceBefore=JSON.stringify(referenceCandidate);");
 assert.match(run('candidateSourceReferencesHtml(referenceCandidate)'),/基于 v2 原图/);assert.doesNotMatch(run('candidateSourceReferencesHtml(referenceCandidate)'),/没有制作参考/);assert.equal(run('JSON.stringify(referenceCandidate)===referenceBefore'),true);
 assert.match(run('candidateSourceReferencesHtml({sourcePreview:true,creationSettings:{},sourceReferences:[]})'),/基于当时采用的原图/);
 assert.match(run("candidateSourceReferencesHtml({...referenceCandidate,sourceReferences:[{sourceId:'extra'}]})"),/additional references/);
 assert.equal(run('candidateSourceReferencesHtml({sourceReferences:[]})'),'existing reference presentation');
});

test('costume examples use the pinned source preview and keep old target output intact',()=>{
 run("var costumeRequest={project:S.project,nodeId:previewNode.id,sourceReferences:[{sourceId:'source',candidateId:'source-v3',number:3,frame:4}],input:{creationSettings:{tool:'角色变装',costume:{source:{sourceId:'source',candidateId:'source-v3',number:3,frame:4}}}}};var costumeExample=createPreparedCandidates(costumeRequest,'目标造型描述',1).created[0];");
 assert.equal(run('costumeExample.frame'),4);assert.equal(run('costumeExample.sourcePreview'),true);
 assert.equal(run('previewNode.adoptedCandidateId'),'old');assert.equal(run('JSON.stringify(previewNode.candidates[0])===oldPreview'),true);
 assert.match(run('candidateSourceReferencesHtml(costumeExample)'),/变装示例使用源角色原图，效果未生成/);
});

test('reused outputs identify their copied origin without inventing old version numbers',()=>{
 assert.match(run("candidateVisual({kind:'character',number:2,frame:3,reusedFrom:{sourceTitle:'角色'}})"),/复用素材/);
 assert.match(run("candidateSourceReferencesHtml({reusedFrom:{sourceTitle:'角色',number:3},sourceReferences:[]})"),/复用自 角色 · v3/);
 assert.doesNotMatch(run("candidateSourceReferencesHtml({reusedFrom:{sourceTitle:'旧素材'},sourceReferences:[]})"),/vundefined|v0|v1/);
});
