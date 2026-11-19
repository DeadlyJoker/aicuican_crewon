/* Local candidate review for the product prototype. No media requests are made. */
'use strict';

const studioCandidateKinds = new Set(['image', 'video', 'shot', 'scene', 'character', 'ending', 'voice', 'audio', 'final']);
let pendingCandidateRequest = null;
let studioCandidateSequence = 0;

function candidateSnapshot(n, number, values = {}) {
  const references = Object.hasOwn(values, 'sourceReferences') ? values.sourceReferences : studioAssetReferenceSnapshot(n);
  return {
    id: values.id || `${n.id}-candidate-${Date.now()}-${++studioCandidateSequence}`,
    number,
    frame: n.frame ?? 0,
    prompt: n.prompt || '',
    dialogue: n.dialogue || '',
    seconds: n.seconds || 0,
    motion: n.motion || '',
    text: n.text || '',
    description: n.description || '',
    kind: n.kind,
    createdAt: new Date().toISOString(),
    scriptRevision: n.scriptRevision || 0,
    scriptSourceId: n.scriptSourceId || null,
    ...values,
    sourceReferences: structuredClone(references),
  };
}

/** Preserve a legacy output once; a planned-only node has no output to migrate. */
function ensureCandidateHistory(n) {
  if (!n || !studioCandidateKinds.has(n.kind)) return [];
  const explicitlyUnadopted = Object.hasOwn(n, 'adoptedCandidateId') && !n.adoptedCandidateId;
  if (n.referenceOnly || explicitlyUnadopted) {
    if (!Array.isArray(n.candidates)) n.candidates = [];
    return n.candidates;
  }
  if (!Array.isArray(n.candidates) || !n.candidates.length) {
    const oldNumber = Math.max(1, Number(S.versions[n.id]) || 1);
    n.candidates = [candidateSnapshot(n, oldNumber, { id: `${n.id}-existing-${oldNumber}`, createdAt: null, sourceReferences: null })];
    n.adoptedCandidateId = n.candidates[0].id;
  }
  if (!n.candidates.some(c => c.id === n.adoptedCandidateId)) {
    n.adoptedCandidateId = (n.candidates.find(c => c.frame === n.frame) || n.candidates[0]).id;
  }
  return n.candidates;
}

/** A planned reference remains unadopted until the user chooses a candidate. */
function studioAdoptedCandidate(n, candidates = ensureCandidateHistory(n)) {
  return n && !n.referenceOnly ? candidates.find(c => c.id === n.adoptedCandidateId) : undefined;
}

/** Return zero when no output has been adopted, independent of the editable input. */
function candidateVersion(n) {
  return studioAdoptedCandidate(n)?.number || 0;
}

function candidateVisual(c, className = '') {
  if (['voice', 'audio'].includes(c.kind)) {
    return `<div class="candidate-visual candidate-sound ${className}">${I('mic')}<span>声音稿示意</span></div>`;
  }
  const label=c.sourcePreview?'原图参考 · 效果未生成':c.localOperation==='panorama-capture'?'全景截图':c.sourceHistory?'导入作品':c.reusedFrom?'复用素材':(c.importedAsset||c.importedFile)?'导入素材':'示意照片';
  return `<div class="candidate-visual still frame${c.frame} ${className}" role="img" aria-label="版本 ${c.number} · ${label}"><span>${label}</span></div>`;
}

function candidateChoiceHtml(n, c, previewedId) {
  const adopted = !n.referenceOnly && c.id === n.adoptedCandidateId;
  return `<button class="candidate-thumb ${adopted ? 'adopted' : ''} ${previewedId === c.id ? 'previewed' : ''}" data-action="candidate-review:${n.id}:${c.id}" aria-label="查看候选 v${c.number}${adopted ? '，当前采用' : ''}" ${previewedId ? `aria-pressed="${previewedId === c.id}"` : ''}>${candidateVisual(c)}<span class="candidate-thumb-caption"><strong>v${c.number}</strong><span>${adopted ? '当前采用' : '候选'}</span></span></button>`;
}

/** Render previews that open a review; clicking a thumbnail never adopts its output. */
function candidateSectionHtml(n) {
  if (!n || !studioCandidateKinds.has(n.kind)) return '';
  const candidates = ensureCandidateHistory(n);
  if (!candidates.length) return `<section class="candidate-section" aria-label="候选与采用"><div class="candidate-empty"><strong>${n.referenceOnly ? '尚未制作' : '还没有候选'}</strong><p>先确认内容，再准备示例候选</p></div></section>`;
  const adopted = studioAdoptedCandidate(n, candidates);
  return `<section class="candidate-section" aria-label="候选与采用"><div class="candidate-section-head"><h3>候选与采用 <span>${candidates.length}</span></h3>${candidates.length > 1 ? btn('比较', `candidate-review:${n.id}`, 'ghost') : ''}</div><div class="candidate-list">${candidates.map(c => candidateChoiceHtml(n, c)).join('')}</div><p class="candidate-section-note">${adopted ? '先点开比较，再决定采用。新候选不会自动替换当前结果。' : '候选尚未用于作品，审阅后再明确采用。'}</p></section>`;
}

/** Describe captured settings using the candidate media, including older snapshots. */
function candidateCreationSettingsLabel(c){
 const settings=c.creationSettings;if(!settings)return '';
 const sound=['audio','voice'].includes(c.kind)||settings.mediaType==='audio';
 const model=settings.modelLabel||({project:'项目模型',preview:'低成本预览',quality:sound?'精细声音':'精细画面'})[settings.model]||settings.model;
 const values=sound?(settings.mode==='music'?['音乐']:[settings.voicePreset?.name?'音色 '+settings.voicePreset.name:null,settings.expression,settings.pace,settings.format,settings.sampleRate?settings.sampleRate+' Hz':null,...[['speed','语速','倍'],['volume','音量','倍'],['pitch','音调','']].filter(([key])=>typeof settings[key]==='number').map(([key,label,unit])=>label+' '+settings[key]+unit)]):[({text:'文生视频',reference:'全能参考',first:'首帧',frames:'首尾帧',images:'多图参考',video:'视频参考',edit:'视频编辑',extend:'视频延长'})[settings.videoMode],({text:'文生图',image:'图生图'})[settings.imageMode],settings.ratio,settings.resolution,...(settings.imageQuality?['质量 '+(({auto:'自动',low:'低',medium:'中等',high:'高','very-high':'极高',xhigh:'极高',max:'最大'})[settings.imageQuality]||settings.imageQuality)]:[]),...(settings.mediaType==='video'&&typeof settings.generateAudio==='boolean'?[settings.generateAudio?'生成声音':'静音视频']:[]),...(['auto','standard','high'].includes(settings.videoQuality)?[({auto:'自动画质',standard:'标准画质',high:'高画质'})[settings.videoQuality]]:[]),...(typeof settings.previewMode==='boolean'?[settings.previewMode?'样片模式':'成片模式']:[])];
 return [settings.tool||'常规制作',model,...values].filter(Boolean).join(' · ');
}

/** Describe the captured base image without resolving it against a later adopted version. */
function candidateSourceReferencesHtml(candidate){
 if(candidate.panorama){const view=candidate.panorama;return `<p class="studio-asset-note">全景取景 · 水平 ${esc(view.yaw.toFixed(1))}° · 俯仰 ${esc(view.pitch.toFixed(1))}° · 视野 ${esc(view.hfov.toFixed(0))}°</p><p class="studio-asset-note">${esc(view.width)} × ${esc(view.height)} · ${view.captureMode==='expanded'?'全屏视口取景':'节点画幅 '+esc(view.ratio)}${view.mirrored?' · 镜像':''}</p>`+studioCandidateReferencesHtml(candidate);}
 if(candidate.reusedFrom){const origin=candidate.reusedFrom;return `<p class="studio-asset-note">复用自 ${esc(origin.sourceTitle||'已记录素材')}${Number.isInteger(origin.number)?' · v'+origin.number:''}</p>`+studioCandidateReferencesHtml(candidate);}
 if(candidate.creationSettings?.costume)return `<p class="studio-asset-note">变装示例使用源角色原图，效果未生成</p>`+studioCandidateReferencesHtml(candidate);
 if(!candidate.sourcePreview)return studioCandidateReferencesHtml(candidate);
 const number=candidate.creationSettings?.baseCandidateNumber,version=Number.isInteger(number)&&number>0?'基于 v'+number+' 原图':'基于当时采用的原图';
 const extra=candidate.sourceReferences?.length?studioCandidateReferencesHtml(candidate):'';
 return `<div class="studio-asset-candidate-references"><span class="studio-asset-caption">原图参考</span><p class="studio-asset-note">${version}</p></div>${extra}`;
}

function candidateCardHtml(c, adopted, stateLabel = adopted ? '当前采用' : '正在比较') {
  const inputs = c.prompt || c.text || c.description;
  const sound=['voice','audio'].includes(c.kind);
  return `<article class="candidate-review-card ${sound?'candidate-review-sound':''}"><header><span>${stateLabel}</span><strong>v${c.number}</strong></header>${candidateVisual(c)}<div class="candidate-review-card-body">${candidateSourceReferencesHtml(c)}<details class="candidate-input-detail" ${sound?'open':''}><summary>${sound?'声音稿与参数':'查看制作描述'}</summary><p>${esc(inputs || '旧示例未记录制作描述')}</p>${c.creationSettings?`<p>制作方式：${esc(candidateCreationSettingsLabel(c))}</p>`:''}${c.creationSettings?.cameraControl?`<p>摄像机：${[c.creationSettings.cameraControl.camera,c.creationSettings.cameraControl.lens,c.creationSettings.cameraControl.focal,c.creationSettings.cameraControl.aperture].map(esc).join(' · ')}</p>`:''}${c.creationSettings?.imagePresets?`<p>预设：${Object.values(c.creationSettings.imagePresets).map(value=>esc(value.name||'自定义')).join('、')}</p>${c.creationSettings.imagePresets.custom?`<p>前缀：${esc(c.creationSettings.imagePresets.custom.prefix||'未设置')}</p><p>后缀：${esc(c.creationSettings.imagePresets.custom.suffix||'未设置')}</p>`:''}`:''}${c.creationSettings?.style?`<p>风格：${esc(c.creationSettings.style.name)}</p>`:''}${c.creationSettings?.roleDesign&&Object.values(c.creationSettings.roleDesign).flat().length?`<p>角色设计：${Object.values(c.creationSettings.roleDesign).flat().map(esc).join('、')}</p>`:''}${c.creationSettings?.providerParams?`<p>模型标识：${esc(c.creationSettings.model)}</p><p>制作参数：${Object.entries(c.creationSettings.providerParams).map(([key,value])=>esc(referenceParameterLabels[key]||key)+' '+esc(typeof value==='boolean'?(value?'是':'否'):value===null?'自动':String(value))).join(' · ')}</p>`:''}${c.creationSettings?.referenceRoles?.length?`<p>画面分工：${c.creationSettings.referenceRoles.map(item=>esc(item.role)+' · '+esc(c.sourceReferences?.find(ref=>ref.sourceId===item.sourceId&&ref.candidateId===item.candidateId)?.sourceTitle||'已记录素材')).join('；')}</p>`:''}${c.creationSettings?.toolSettings?`<p>工具参数：${Object.entries(c.creationSettings.toolSettings).filter(([key,value])=>value!==''&&!['tab','appearanceVersion','faceVersion','makeupVersion','qualityVersion','poseVersion','presetId','emotionX','emotionY'].includes(key)).map(([key,value])=>esc(({joints:'关节',locked:'比例锁定',sceneLight:'场景光氛',blend:'人景融合',faceLight:'面部光感',cleanup:'瑕疵修饰',skinTexture:'皮肤质感',skinTone:'肤色调节',imageTexture:'画面质感',preset:'创作方式',presetName:'妆容',presetCategory:'妆容分类',presetVersion:'预设版本',mode:'处理方式',direction:'光源方向',azimuth:'水平环绕',elevation:'光源高度',intensity:'光线强度',color:'灯光颜色',rotation:'旋转',tilt:'倾斜',scale:'缩放',emotion:'情绪',gaze:'视线',mouth:'嘴巴',strength:'调节强度',age:'年龄',skin:'肤色',hair:'发型',body:'体态',protectStyle:'风格保护',protectBackground:'背景保护'})[key]||key)+' '+esc(typeof value==='boolean'?(value?'开启':'关闭'):key==='joints'?Object.keys(value).length+' 个':String(value))).join(' · ')}</p>`:''}${c.dialogue ? `<p>对白：${esc(c.dialogue)}</p>` : ''}${c.seconds ? `<span class="candidate-input-meta">${c.seconds} 秒${c.motion ? ' · ' + esc(c.motion) : ''}</span>` : ''}</details></div></article>`;
}

/** Review an unadopted output alone, or compare it with the stable adopted output. */
function openCandidateReview(nodeId, candidateId) {
  const n = nodeById(nodeId);
  const candidates = ensureCandidateHistory(n);
  if (!candidates.length) { prepareNodeCandidate(nodeId); return; }
  const adopted = studioAdoptedCandidate(n, candidates);
  const selected = candidates.find(c => c.id === candidateId) || candidates.findLast(c => c.id !== adopted?.id) || adopted;
  const comparing = !!adopted && selected.id !== adopted.id;
  const canAdopt = !adopted || comparing;
  const title = !adopted ? '查看候选' : comparing ? '比较候选' : '查看采用结果';
  const hint = !adopted ? '这份候选尚未用于作品，明确采用后才会加入预览。' : comparing ? '比较后再决定；关闭弹窗会继续使用原采用结果。' : adopted.localOperation==='panorama-capture' ? '取自原图的球面视角，原图与来源版本保留。' : adopted.importedFile ? '这是当前采用的本地图片，原有记录保持不变。' : '这是当前采用的示例内容，原有记录保持不变。';
  showDialog(title, `<div class="candidate-review-heading"><h3>${esc(n.title)}</h3><p>${hint}</p></div><div class="candidate-compare ${comparing ? '' : 'single'}">${adopted ? candidateCardHtml(adopted, true) : candidateCardHtml(selected, false, '尚未采用')}${comparing ? candidateCardHtml(selected, false) : ''}</div>${candidates.length > 1 ? `<div class="candidate-review-switch"><span>选择要${adopted ? '比较' : '查看'}的候选</span><div class="candidate-switch-row" role="group" aria-label="切换比较版本">${candidates.map(c => `<button class="${c.id === selected.id ? 'selected' : ''}" aria-label="查看候选 v${c.number}${c.id === adopted?.id ? '，当前采用' : ''}" aria-pressed="${c.id === selected.id}" data-action="candidate-review:${n.id}:${c.id}">v${c.number}${c.id === adopted?.id ? '<span>当前采用</span>' : ''}</button>`).join('')}</div></div>` : `<p class="candidate-section-note">${adopted ? '当前仅保留这一份采用结果，新增候选会独立保存。' : '当前候选还未采用，关闭后会继续保留待制作状态。'}</p>`}`, `<span class="note">${selected.localOperation==='panorama-capture'?'本地取景 · 未运行生成':selected.importedFile?'本地上传 · '+esc(selected.importedFile):'示例内容 · 未运行生成'}</span>${btn('返回内容', `candidate-return:${n.id}`, 'outline')}${canAdopt ? btn(`采用 v${selected.number}`, `candidate-adopt:${n.id}:${selected.id}`, 'primary', 'check') : btn('准备新候选', `candidate-prepare:${n.id}`, 'primary', 'plus')}`, true);
  document.querySelector('.dialog')?.setAttribute('data-candidate-review','');
}

/** Prepare a local candidate for one node, carrying its current unsaved input forward. */
function prepareNodeCandidate(nodeId) {
  const n = nodeById(nodeId);
  if (!n || !studioCandidateKinds.has(n.kind)) return;
  const candidates = ensureCandidateHistory(n);
  const adopted = studioAdoptedCandidate(n, candidates);
  const draft = S.nodeDrafts[n.id] || {};
  pendingCandidateRequest = {
    project: S.project,
    nodeId: n.id,
    sourceReferences: structuredClone(studioAssetReferenceSnapshot(n)),
    input: {
      prompt: draft.prompt ?? n.prompt ?? n.text ?? n.description ?? '',
      dialogue: draft.dialogue ?? n.dialogue ?? '',
      seconds: Number(draft.seconds ?? n.seconds) || 0,
      motion: draft.motion ?? n.motion ?? '',
    },
  };
  if(mediaKind(n)==='video'){
    const preferences=canvasCreationDraft(n),binding=referenceVideoBinding(preferences),plan=canvasVideoReferencePlan(preferences,pendingCandidateRequest.sourceReferences);
    if(binding?.error||plan.error){pendingCandidateRequest=null;toast(binding?.error||plan.error);return;}
    pendingCandidateRequest.sourceReferences=structuredClone(plan.active);
    pendingCandidateRequest.input.creationSettings={...canvasMediaSettings(n,preferences),videoMode:plan.mode,referenceRoles:structuredClone(plan.roles)};
    pendingCandidateRequest.input.seconds=referenceVideoExecutionSettings(n,preferences)?.seconds??pendingCandidateRequest.input.seconds;
  }
  const input = pendingCandidateRequest.input;
  showDialog(candidates.length ? '准备新候选' : '准备首个候选', `<div class="tool-source">${I(kindIcon[n.kind] || 'image')}<span>只调整「${esc(n.title)}」</span><span class="pill">${adopted ? '保留当前采用' : '先审阅，再采用'}</span></div>${pendingCandidateRequest.input.creationSettings?studioCandidateReferencesHtml(pendingCandidateRequest):studioCandidateReferenceScopeHtml(n)}<label class="field">制作描述<textarea id="candidate-description" aria-describedby="candidate-description-error">${esc(input.prompt)}</textarea></label><p id="candidate-description-error" class="candidate-field-error" hidden>请补充希望保留或调整的内容</p><label class="field">候选数量<select id="candidate-count"><option value="1">1 个候选</option><option value="2">2 个候选</option></select></label><div class="candidate-scope"><span>${I('check')}只为这一项内容增加候选</span><span>${I('check')}${adopted ? '其他内容与原采用结果保留' : '不自动采用，其他内容保持不变'}</span></div><p class="candidate-disclosure">本轮使用示意照片演示候选管理，不调用 API，也不计费。</p>`, `${btn('取消', 'close-modal', 'outline')}${btn('演示新增候选', 'candidate-create', 'primary', 'plus')}`);
}

/** Append immutable output snapshots without changing the adopted output. */
function commitNodeCandidate() {
  const description = document.getElementById('candidate-description');
  const countField = document.getElementById('candidate-count');
  if (!pendingCandidateRequest || !description || !countField) return;
  const request = pendingCandidateRequest;
  const n = nodeById(request.nodeId);
  if (request.project !== S.project || !n) {
    pendingCandidateRequest = null;
    closeDialog();
    toast('项目已变化，请重新选择需要调整的内容');
    return;
  }
  const prompt = description.value.trim();
  if (!prompt) {
    document.getElementById('candidate-description-error').hidden = false;
    description.setAttribute('aria-invalid', 'true');
    description.focus();
    return;
  }
  const {created,adopted}=createPreparedCandidates(request,prompt,countField.value);
  pendingCandidateRequest = null;
  S.revision++;
  closeDialog();
  render();
  openCandidateReview(n.id, created[0].id);
  toast(adopted ? `已新增 ${created.length} 个示例候选，当前采用未改变` : `已新增 ${created.length} 个示例候选，尚未采用`);
}

/** Append a reviewed prototype request; callers own its UI and validation feedback. */
function createPreparedCandidates(request,prompt,requestedCount) {
  const n=nodeById(request.nodeId);
  if(request.project!==S.project||!n||!studioCandidateKinds.has(n.kind)||!prompt.trim())throw new Error('制作请求与当前项目不匹配');
  const candidates = ensureCandidateHistory(n);
  const adopted = studioAdoptedCandidate(n, candidates);
  const count = Math.max(1, Math.min(2, Number(requestedCount) || 1));
  const startNumber = Math.max(0, ...candidates.map(c => c.number)) + 1;
  const sourcePreview=['image','character','scene'].includes(n.kind)&&!!(request.input.creationSettings?.toolSettings||request.input.creationSettings?.costume);
  const created = Array.from({ length: count }, (_, i) => candidateSnapshot(n, startNumber + i, {
    ...request.input,
    sourceReferences: request.sourceReferences,
    prompt,
    description: prompt,
    frame: sourcePreview?(request.input.creationSettings?.costume?.source.frame??adopted?.frame??n.frame??0):((adopted?.frame ?? n.frame ?? 0) + i + 1) % 6,
    ...(sourcePreview?{sourcePreview:true}:{}),
  }));
  candidates.push(...created);
  for (const c of created) S.history.push({ type: 'candidate-created', nodeId: n.id, nodeTitle: n.title, candidateId: c.id, number: c.number, hadAdoptedOutput: !!adopted, createdAt: c.createdAt });
  return {created,adopted};
}

/** Change only the adopted output selection; editing inputs and earlier candidates remain intact. */
function adoptNodeCandidate(nodeId, candidateId) {
  const n = nodeById(nodeId);
  const candidates = ensureCandidateHistory(n);
  const next = candidates.find(c => c.id === candidateId);
  if (!next || (!n.referenceOnly && n.adoptedCandidateId === next.id)) return;
  const previous = studioAdoptedCandidate(n, candidates);
  n.frame = next.frame;
  n.adoptedCandidateId = next.id;
  n.referenceOnly = false;
  S.versions[n.id] = next.number;
  if (n.reviewRequired && next.scriptSourceId === n.scriptSourceId && next.scriptRevision === n.scriptRevision) {
    n.reviewRequired = false;
    n.reviewAcknowledgedRevision = n.scriptRevision;
  }
  S.history.push({ type: 'candidate-adopted', nodeId: n.id, nodeTitle: n.title, candidateId: next.id, number: next.number, previousNumber: previous?.number ?? null, createdAt: new Date().toISOString() });
  S.revision++;
  closeDialog();
  if(document.getElementById('viewport')?.clientWidth<=720)focusNode(n.id);
  else{
    S.selected = n.id;
    S.panel = null;
    render();
    document.querySelector(`[data-node="${n.id}"]`)?.focus({preventScroll:true});
  }
  toast(previous ? `已采用 v${next.number}，此前候选仍可回看` : `已首次采用 v${next.number} 到作品`);
}

/** Record the saved input separately from immutable output candidates. */
function recordNodeInputEdit(n) {
  S.history.push({ type: 'input-edited', nodeId: n.id, nodeTitle: n.title, prompt: n.prompt || n.text || n.description || '', dialogue: n.dialogue || '', seconds: n.seconds || 0, motion: n.motion || '', createdAt: new Date().toISOString() });
}

function candidateHistoryTime(entry) {
  const time = new Date(entry.createdAt);
  return entry.createdAt && !Number.isNaN(time.getTime()) ? time.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '时间未记录';
}

function candidateHistoryEntry(entry) {
  const nodeId = entry.nodeId || entry.targetId || entry.id;
  const n = nodeById(nodeId);
  const title = entry.nodeTitle || n?.title || '';
  const info = ({
    'edit-node-added': ['新增了剪辑节点', title, '原素材与采用结果保留，剪辑草稿独立保存'],
    'node-duplicated': ['创建了节点副本', title, '已有结果和上游参考已保留，下游连线未复制'],
    'node-renamed': ['重命名了节点', title, '此前候选的输入记录保持原样'],
    'node-deleted': ['删除了画布节点', title, '可通过画布撤销恢复'],
    'script-updated': ['更新了剧本', entry.nodeTitle || entry.scriptTitle || title, '保留了此前剧本版本'],
    'script-shot-inputs': ['更新了镜头制作输入', title, '当前采用结果继续保留'],
    'script-shot-added': ['新增了剧本镜头', title, '已加入画布'],
    'script-shot-detached': ['从当前剪辑移出镜头', title, '原素材与候选保留在画布'],
    'script-output-kept': ['确认沿用当前画面', title, `采用 v${entry.number}，剧本新输入继续保留`],
    'asset-added': ['加入了项目素材', title, '复用示例参考，未运行生成'],
    'asset-references-updated': ['更新了制作参考', title, '旧结果与候选继续保留'],
    'input-edited': ['保存了内容编辑', title, entry.prompt],
    'candidate-created': [`新增候选 v${entry.number}`, title, entry.hadAdoptedOutput === false ? '候选尚未采用到作品' : '原采用结果未改变'],
    'candidate-adopted': [`采用 v${entry.number}`, title, entry.previousNumber === null ? '首次采用到作品' : entry.previousNumber !== undefined ? `此前采用 v${entry.previousNumber}，仍保留在候选中` : '采用结果已保留'],
    'demo-stage': [entry.stage === 'video' ? '查看了视频就绪示例' : '确认了分镜预览方案', '演示阶段', '未运行真实生成任务'],
    'tool-demo': ['使用了创作工具', entry.name || '', '来源与新增内容保留在原画布'],
    direction: ['记录了调整方向', entry.text || '', (entry.references||[]).map(ref=>ref.sourceTitle+' · '+(ref.number==null?'版本未记录':'v'+ref.number)+(ref.available===false?' · 提交时来源已移除':'')).join('；')],
    brief: ['记录了作品目标', entry.text || '', ''],
    import: ['选择了参考材料', entry.name || '', '未上传或解析文件'],
    layout: ['整理了画布布局', '', ''],
  })[entry.type] || (entry.id && entry.x !== undefined ? ['移动了画布内容', title, ''] : ['旧版操作记录', entry.text || entry.name || title || '此记录没有完整制作明细', '']);
  return `<li class="candidate-history-item"><span class="candidate-history-dot"></span><div><div class="candidate-history-title"><strong>${esc(info[0])}</strong><time>${esc(candidateHistoryTime(entry))}</time></div>${n ? `<button class="candidate-history-subject" aria-label="查看内容：${esc(title)}" data-action="candidate-return:${n.id}">${esc(info[1] || title)}${I('chev')}</button>` : info[1] ? `<p>${esc(info[1])}</p>` : ''}${info[2] ? `<details><summary>${entry.type==='direction'&&entry.references?.length?'参考图片 · '+entry.references.length:'查看记录'}</summary><p>${esc(info[2])}</p></details>` : ''}</div></li>`;
}

/** Show actual local changes while retaining readable entries from older prototype records. */
function projectHistoryDialog() {
  const entries = S.history.slice().reverse();
  showDialog('项目记录', `<div class="candidate-review-heading"><h3>${esc(S.project)}</h3><p>这里记录本地编辑、候选和采用操作，不表示真实生成任务日志。</p></div>${entries.length ? `<ol class="candidate-history-list">${entries.map(candidateHistoryEntry).join('')}</ol>` : `<div class="candidate-history-empty">${I('history')}<h3>还没有制作记录</h3><p>保存编辑、准备候选或采用结果后，会记录在这里。</p></div>`}`, btn('回到创作', 'close-modal', 'outline'));
}
