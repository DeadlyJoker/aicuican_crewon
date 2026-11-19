/* Local script editing keeps drafts separate from applied script and adopted media. */
'use strict';

let studioScriptSequence = 0;
let scriptEditorContext = null;
let pendingScriptReview = null;

function studioScriptId(kind) {
  return `script-${kind}-${Date.now()}-${++studioScriptSequence}`;
}

/** Initialize one script from saved inputs without changing the linked media nodes. */
function ensureStudioScript(n) {
  if (!n || n.kind !== 'story') return null;
  if (!n.scriptDocument) {
    const clips = n.id === 'story' || S.nodes.filter(node => node.kind === 'story').length === 1 ? S.clips : [];
    const shots = clips.map(nodeById).filter(Boolean).map(shot => ({ id: shot.id, title: shot.title, action: shot.prompt || shot.description || '', dialogue: shot.dialogue || '', seconds: shot.seconds || 6 }));
    const scenes = [];
    for (let i = 0; i < shots.length; i += 2) scenes.push({ id: `script-scene-${i / 2 + 1}`, title: S.projectKind === 'drama' && i === 0 ? '站台 · 夜' : S.projectKind === 'drama' && i === 2 ? '街口 · 黎明' : `场景 ${i / 2 + 1}`, shots: shots.slice(i, i + 2) });
    const legacyText = n.text || n.prompt || '';
    n.scriptDocument = { revision: 1, title: n.title || S.project, logline: n.subtitle || legacyText.split('\n')[0] || '从人物的目标与一次相遇开始。', scenes: scenes.length ? scenes : [{ id: 'script-scene-1', title: '场景 1', shots: [] }], ...(legacyText ? { legacyText } : {}) };
  }
  if (!Array.isArray(n.scriptVersions) || !n.scriptVersions.length) n.scriptVersions = [{ ...structuredClone(n.scriptDocument), createdAt: null }];
  return n.scriptDocument;
}

function scriptShotCount(doc) {
  return doc.scenes.reduce((sum, scene) => sum + scene.shots.length, 0);
}

function scriptHasDraft(n) {
  return !!n.scriptDraft && JSON.stringify(n.scriptDraft) !== JSON.stringify(n.scriptDocument);
}

/** Render the applied script rather than a fixed story excerpt. */
function scriptNodeBody(n) {
  const doc = ensureStudioScript(n);
  return `<div class="node-content script-summary"><div class="script-title">${esc(doc.title)}</div><p class="script-summary-logline">${esc(doc.logline)}</p>${doc.scenes.slice(0, 2).map((scene, i) => `<div class="script-scene">${String(i + 1).padStart(2, '0')}　${esc(scene.title)}</div><p class="script-summary-excerpt">${esc(scene.shots[0]?.dialogue || scene.shots[0]?.action || '尚未安排镜头')}</p>`).join('')}<div class="script-meta"><span>${doc.scenes.length} 场景</span><span>${scriptShotCount(doc)} 镜头</span><span>剧本 v${doc.revision}</span></div>${scriptHasDraft(n) ? '<span class="script-draft-marker">有未应用草稿</span>' : ''}</div>`;
}

/** Show a compact reading entry while the professional editor stays in a modal. */
function scriptProperties(n) {
  const doc = ensureStudioScript(n);
  return `<h2 class="inspector-title">${esc(doc.title)}</h2><p class="inspector-sub">剧本 v${doc.revision} · ${doc.scenes.length} 场景 · ${scriptShotCount(doc)} 镜头</p><p class="script-property-logline">${esc(doc.logline)}</p>${n.scriptForkOf?`<p class="script-local-note">副本基于《${esc(n.scriptForkOf.title)}》v${n.scriptForkOf.revision}，应用时新增独立镜头</p>`:''}${n.scriptPendingShotIds?.length?`<p class="script-local-note">有 ${n.scriptPendingShotIds.length} 个镜头输入尚未同步</p>`:''}${scriptHasDraft(n) ? '<p class="script-local-note">上次编辑的草稿已保留，尚未应用到剧本</p>' : ''}<div class="script-property-scenes">${doc.scenes.map((scene, i) => `<button data-action="script-open-scene:${n.id}:${scene.id}"><span>${String(i + 1).padStart(2, '0')}</span><span>${esc(scene.title)}<small>${scene.shots.length} 个镜头</small></span>${I('chev')}</button>`).join('')}</div><div class="inspector-buttons">${btn('打开剧本工坊', `script-open:${n.id}`, 'primary', 'edit')}${btn('剧本版本', `script-history:${n.id}`, 'outline', 'history')}</div><p class="inspector-feedback">先编辑剧本，再审阅需要同步的镜头。已采用的画面、声音和候选继续保留。</p>`;
}

function scriptContextNode() {
  return scriptEditorContext?.project === S.project ? nodeById(scriptEditorContext.nodeId) : null;
}

function scriptIcon(label, action, icon, disabled = false) {
  return `<button class="icon-btn tip" aria-label="${esc(label)}" data-action="${action}" ${disabled ? 'disabled' : ''}>${I(icon)}</button>`;
}

function scriptField(field, label, value, options = {}) {
  const scope = options.shot ? `data-script-shot="${options.shot}"` : options.scene ? 'data-script-scene-field' : 'data-script-document-field';
  const id = `script-input-${options.shot || (options.scene ? 'scene' : 'document')}-${field}`;
  const attrs = `id="${id}" data-script-field="${field}" ${scope} aria-describedby="${id}-error"`;
  const control = options.multiline ? `<textarea ${attrs}>${esc(value)}</textarea>` : `<input ${attrs} value="${esc(value)}">`;
  return `<label class="field script-field">${label}${control}<span id="${id}-error" class="script-field-error" hidden></span></label>`;
}

function scriptShotCard(shot, index, open) {
  const linked = nodeById(shot.id);
  const adopted = linked?.candidates?.find(c => c.id === linked.adoptedCandidateId);
  const preview = linked ? `<div class="script-shot-reference still frame${adopted?.frame ?? linked.frame ?? 0}"><span>${adopted ? '采用 v' + adopted.number : linked.referenceOnly ? '参考图' : '示例画面'}</span></div>` : `<div class="script-shot-reference script-shot-empty">${I('film')}<span>新镜头</span></div>`;
  const lengths = [...new Set([4, 6, 8, 10, 12, Number(shot.seconds) || 6])].sort((a, b) => a - b);
  return `<details class="script-shot-card" data-script-shot-card="${shot.id}" ${open ? 'open' : ''}><summary><span class="script-shot-index">${String(index + 1).padStart(2, '0')}</span><span class="script-shot-summary-title" data-script-summary-title="${shot.id}">${esc(shot.title)}</span><span class="script-shot-summary-length" data-script-summary-length="${shot.id}">${shot.seconds} 秒</span>${I('down')}</summary><div class="script-shot-edit"><div class="script-shot-reference-column">${preview}<span class="script-shot-link-state">${linked ? '已关联画布' : '审阅后加入画布'}</span></div><div class="script-shot-fields"><div class="script-shot-title-row">${scriptField('title', '镜头名称', shot.title, { shot: shot.id })}${scriptIcon('从剧本移除此镜头', `script-remove-shot:${shot.id}`, 'trash')}</div>${scriptField('action', '画面与动作', shot.action, { shot: shot.id, multiline: true })}<div class="script-shot-bottom">${scriptField('dialogue', '对白 / 旁白', shot.dialogue, { shot: shot.id })}<label class="field script-field">时长<select data-script-shot="${shot.id}" data-script-field="seconds" aria-label="${esc(shot.title)}的镜头时长">${lengths.map(v => `<option value="${v}" ${Number(shot.seconds) === v ? 'selected' : ''}>${v} 秒</option>`).join('')}</select></label></div></div></div></details>`;
}

function scriptWorkbenchBody(n) {
  const doc = n.scriptDraft;
  const scene = doc.scenes.find(s => s.id === scriptEditorContext.sceneId) || doc.scenes[0];
  scriptEditorContext.sceneId = scene.id;
  n.scriptEditorSceneId = scene.id;
  const index = doc.scenes.indexOf(scene);
  const openShot = scene.shots.find(s => s.id === scriptEditorContext.shotId)?.id || scene.shots[0]?.id;
  return `<section class="script-workbench" aria-label="剧本编辑"><aside class="script-outline"><div class="script-outline-heading"><span>分场大纲</span><small>v${n.scriptDocument.revision}</small></div><div class="script-outline-scenes">${doc.scenes.map((entry, i) => `<button data-action="script-scene:${entry.id}" aria-pressed="${entry.id === scene.id}"><span>${String(i + 1).padStart(2, '0')}</span><span data-script-outline-title="${entry.id}">${esc(entry.title)}<small>${entry.shots.length} 个镜头</small></span></button>`).join('')}</div>${btn('新增场景', 'script-add-scene', 'ghost', 'plus')}<p>结构调整只保留在草稿，审阅后再应用</p></aside><div class="script-main"><p class="script-review-error" id="script-workbench-error" hidden></p><div class="script-document-heading">${scriptField('title', '剧本名称', doc.title)}<details class="script-logline"><summary>故事概况</summary>${scriptField('logline', '一句话故事', doc.logline, { multiline: true })}${doc.legacyText ? `<details class="script-legacy"><summary>原有文字</summary><p>${esc(doc.legacyText)}</p></details>` : ''}</details></div><div class="script-mobile-scene"><label class="field">当前场景<select data-script-scene-picker>${doc.scenes.map((entry, i) => `<option value="${entry.id}" ${entry.id === scene.id ? 'selected' : ''}>${String(i + 1).padStart(2, '0')} · ${esc(entry.title)}</option>`).join('')}</select></label>${scriptIcon('新增场景', 'script-add-scene', 'plus')}</div><div class="script-scene-heading">${scriptField('title', '场景名称', scene.title, { scene: true })}<div class="script-scene-actions">${scriptIcon('上移场景', 'script-move-scene:-1', 'arrowup', index === 0)}${scriptIcon('下移场景', 'script-move-scene:1', 'down', index === doc.scenes.length - 1)}${scriptIcon('从剧本移除此场景', 'script-remove-scene', 'trash', doc.scenes.length === 1)}</div></div><div class="script-shot-list">${scene.shots.map((shot, i) => scriptShotCard(shot, i, shot.id === openShot)).join('')}${scene.shots.length ? '' : '<div class="script-empty-scene">还没有镜头，先安排这场戏的第一个画面</div>'}</div><div class="script-scene-end">${btn('添加镜头', 'script-add-shot', 'ghost', 'plus')}<span>原素材与已采用结果保留</span></div></div></section>`;
}

function drawScriptWorkbench() {
  const n = scriptContextNode();
  if (!n) return;
  const root = showDialog('剧本工坊', scriptWorkbenchBody(n), `<span class="note" data-script-save-state>草稿保存在此浏览器</span>${scriptIcon('撤销结构调整', 'script-undo', 'undo', !n.scriptDraftUndo?.length)}${btn('版本', `script-history:${n.id}`, 'outline', 'history')}${btn('审阅更新', 'script-review', 'primary', 'arrow')}`, true);
  root.querySelector('.dialog').classList.add('script-workbench-dialog');
}

/** Open the existing draft and keep the applied document unchanged. */
function openScriptWorkbench(nodeId, sceneId) {
  const n = nodeById(nodeId);
  if (!ensureStudioScript(n)) return;
  if (!n.scriptDraft) n.scriptDraft = structuredClone(n.scriptDocument);
  n.scriptDraftUndo ||= [];
  scriptEditorContext = { project: S.project, nodeId, sceneId: sceneId || n.scriptEditorSceneId || n.scriptDraft.scenes[0].id, shotId: n.scriptEditorShotId || null };
  pendingScriptReview = null;
  drawScriptWorkbench();
  save();
}

function pushScriptUndo(n) {
  n.scriptDraftUndo ||= [];
  n.scriptDraftUndo.push(structuredClone(n.scriptDraft));
  if (n.scriptDraftUndo.length > 20) n.scriptDraftUndo.shift();
}

function findDraftShot(doc, id) {
  for (const scene of doc.scenes) {
    const shot = scene.shots.find(s => s.id === id);
    if (shot) return { scene, shot };
  }
  return null;
}

function scriptValidation(n) {
  const doc = n.scriptDraft;
  let error;
  if (!doc.title.trim()) error = { field: 'script-input-document-title', message: '填写一个剧本名称' };
  for (const scene of doc.scenes) {
    if (error) break;
    if (!scene.title.trim()) error = { sceneId: scene.id, field: 'script-input-scene-title', message: '填写场景名称' };
    for (const shot of scene.shots) {
      if (error) break;
      if (!shot.title.trim()) error = { sceneId: scene.id, shotId: shot.id, field: `script-input-${shot.id}-title`, message: '填写镜头名称' };
      else if (!shot.action.trim()) error = { sceneId: scene.id, shotId: shot.id, field: `script-input-${shot.id}-action`, message: '补充这个镜头的画面与动作' };
    }
  }
  if (!error) return true;
  if (error.sceneId) scriptEditorContext.sceneId = error.sceneId;
  if (error.shotId) scriptEditorContext.shotId = error.shotId;
  drawScriptWorkbench();
  const field = document.getElementById(error.field), notice = document.getElementById(error.field + '-error');
  if (notice) { notice.hidden = false; notice.textContent = error.message; }
  if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
  return false;
}

function reviewStudioScript() {
  const n = scriptContextNode();
  if (!n || !scriptValidation(n)) return;
  const doc = structuredClone(n.scriptDraft);
  const plan = buildStudioScriptPlan(n, doc);
  if (plan.error) { const error = document.getElementById('script-workbench-error'); if (error) { error.hidden = false; error.textContent = plan.error; } return; }
  pendingScriptReview = { project: S.project, nodeId: n.id, document: doc, plan };
  const changed = plan.items.filter(item => item.kind !== 'remove');
  const rows = plan.items.map(item => {
    const linked = nodeById(item.shotId);
    const adopted = linked?.candidates?.find(c => c.id === linked.adoptedCandidateId);
    return `<label class="script-plan-item ${item.blockedByDraft ? 'blocked' : ''}"><input type="checkbox" data-script-plan-item value="${esc(item.id)}" ${item.selected && !item.blockedByDraft ? 'checked' : ''} ${item.blockedByDraft ? 'disabled' : ''}><span class="script-plan-picture ${linked ? 'still frame' + (adopted?.frame ?? linked.frame ?? 0) : ''}">${linked ? '' : I('film')}</span><span class="script-plan-item-content"><strong>${esc(item.title)}</strong><span>${({ update: '更新制作输入', add: '新增镜头', remove: '从当前剪辑移出' })[item.kind]} · ${esc(item.sceneTitle || '')}</span><small>${item.blockedByDraft ? '已有未保存输入，本次先保留' : item.kind === 'remove' ? '原素材、候选与历史继续保留' : esc(item.fields.join(' · ') || '镜头内容')}</small></span>${adopted ? `<span class="script-plan-version">采用 v${adopted.number}</span>` : ''}</label>`;
  }).join('');
  const root = showDialog('审阅剧本更新', `<div class="script-review-heading"><h3>${esc(doc.title)}</h3><p>剧本${plan.docChanged ? '将保存为新版本' : '保持当前版本'}，选择这次需要同步的镜头。</p></div><div class="script-plan-list">${rows || '<div class="script-no-updates">没有镜头输入需要同步，可保留当前剧本。</div>'}</div>${plan.orderChanged ? '<label class="script-order-check"><input type="checkbox" id="script-sync-order" checked><span>按剧本顺序更新当前剪辑</span></label>' : ''}<p class="script-review-error" id="script-review-error" hidden></p><p class="script-review-note">${changed.length ? '只更新选中的制作输入；' : ''}已采用的画面与声音不重做，也不启动生成任务。</p>`, `${btn('回到编辑', 'script-return-editor', 'outline')}${btn('应用更新', 'script-apply', 'primary', 'check')}`, true);
  root.querySelector('.dialog').classList.add('script-review-dialog');
}

function scriptReadMarkup(doc) {
  return `<article class="script-read-document"><h3>${esc(doc.title)}</h3><p class="script-read-logline">${esc(doc.logline)}</p>${doc.scenes.map((scene, i) => `<section><h4><span>${String(i + 1).padStart(2, '0')}</span>${esc(scene.title)}</h4>${scene.shots.map((shot, j) => `<div class="script-read-shot"><header><span>${String(j + 1).padStart(2, '0')} · ${esc(shot.title)}</span><small>${shot.seconds} 秒</small></header><p>${esc(shot.action)}</p>${shot.dialogue ? `<blockquote>${esc(shot.dialogue)}</blockquote>` : ''}</div>`).join('') || '<p class="script-read-empty">此场景未安排镜头</p>'}</section>`).join('')}${doc.legacyText ? `<details class="script-legacy"><summary>原有文字</summary><p>${esc(doc.legacyText)}</p></details>` : ''}</article>`;
}

function studioScriptHistory(nodeId) {
  const n = nodeById(nodeId);
  if (!ensureStudioScript(n)) return;
  if (!scriptEditorContext || scriptEditorContext.project !== S.project || scriptEditorContext.nodeId !== n.id) scriptEditorContext = { project: S.project, nodeId: n.id, sceneId: n.scriptEditorSceneId || n.scriptDocument.scenes[0].id };
  showDialog('剧本版本', `<div class="script-review-heading"><h3>${esc(n.scriptDocument.title)}</h3><p>每次应用保留一份剧本；候选与媒体记录分别保存。</p></div><div class="script-version-list">${n.scriptVersions.slice().reverse().map(version => `<button data-action="script-version:${version.revision}"><span class="script-version-number">v${version.revision}</span><span><strong>${esc(version.title)}</strong><small>${version.scenes.length} 场景 · ${scriptShotCount(version)} 镜头${version.createdAt ? ' · ' + esc(new Date(version.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })) : ' · 初始示例'}</small></span>${version.revision === n.scriptDocument.revision ? '<span class="pill">当前剧本</span>' : ''}${I('chev')}</button>`).join('')}</div>`, btn('回到剧本', 'script-return-editor', 'outline'));
}

function applyReviewedStudioScript() {
  const pending = pendingScriptReview;
  const n = scriptContextNode();
  const error = document.getElementById('script-review-error');
  if (!pending || !n || pending.project !== S.project || pending.nodeId !== n.id || pending.plan.baseRevision !== n.scriptDocument.revision) {
    if (error) { error.hidden = false; error.textContent = '剧本已变化，请回到编辑重新审阅'; }
    return;
  }
  const selectedIds = [...document.querySelectorAll('[data-script-plan-item]:checked')].map(el => el.value);
  const result = applyStudioScriptPlan(n, pending.document, selectedIds, { syncOrder: !!document.getElementById('script-sync-order')?.checked });
  if (!result.ok) {
    if (error) { error.hidden = false; error.textContent = result.error || '本次未能应用，请回到编辑检查'; }
    return;
  }
  n.scriptDraftUndo = [];
  pendingScriptReview = null;
  closeDialog();
  render();
  save();
  toast(result.blockedIds?.length ? '剧本已保存，未保存的镜头输入继续保留' : '剧本已更新，采用结果与原素材保留');
}

/** Dispatch only this workbench's actions; all other controls keep their owner. */
function handleScriptAction(action) {
  const [key, ...args] = action.split(':');
  if (!key.startsWith('script-')) return false;
  if (key === 'script-open') { openScriptWorkbench(args[0]); return true; }
  if (key === 'script-open-scene') { openScriptWorkbench(args[0], args[1]); return true; }
  if (key === 'script-history') { studioScriptHistory(args[0] || scriptEditorContext?.nodeId); return true; }
  const n = scriptContextNode();
  if (!n) return true;
  const doc = n.scriptDraft || n.scriptDocument;
  const scene = doc.scenes.find(entry => entry.id === scriptEditorContext.sceneId) || doc.scenes[0];
  switch (key) {
    case 'script-scene': scriptEditorContext.sceneId = args[0]; scriptEditorContext.shotId = null; drawScriptWorkbench(); break;
    case 'script-add-scene': pushScriptUndo(n); { const next = { id: studioScriptId('scene'), title: '新场景', shots: [] }; doc.scenes.push(next); scriptEditorContext.sceneId = next.id; scriptEditorContext.shotId = null; drawScriptWorkbench(); } break;
    case 'script-move-scene': { const index = doc.scenes.indexOf(scene), to = index + Number(args[0]); if (to >= 0 && to < doc.scenes.length) { pushScriptUndo(n); [doc.scenes[index], doc.scenes[to]] = [doc.scenes[to], doc.scenes[index]]; drawScriptWorkbench(); } break; }
    case 'script-remove-scene': if (doc.scenes.length > 1) { pushScriptUndo(n); doc.scenes.splice(doc.scenes.indexOf(scene), 1); scriptEditorContext.sceneId = doc.scenes[0].id; drawScriptWorkbench(); toast('已从草稿移出场景，原素材保留'); } break;
    case 'script-add-shot': pushScriptUndo(n); { const shot = { id: studioScriptId('shot'), title: '新的镜头', action: '', dialogue: '', seconds: 6 }; scene.shots.push(shot); scriptEditorContext.shotId = shot.id; drawScriptWorkbench(); } break;
    case 'script-remove-shot': { const found = findDraftShot(doc, args[0]); if (found) { pushScriptUndo(n); found.scene.shots.splice(found.scene.shots.indexOf(found.shot), 1); drawScriptWorkbench(); toast('已从剧本草稿移出，原素材保留'); } break; }
    case 'script-undo': if (n.scriptDraftUndo?.length) { n.scriptDraft = n.scriptDraftUndo.pop(); drawScriptWorkbench(); } break;
    case 'script-review': reviewStudioScript(); break;
    case 'script-return-editor': if (!n.scriptDraft) n.scriptDraft = structuredClone(n.scriptDocument); drawScriptWorkbench(); break;
    case 'script-apply': applyReviewedStudioScript(); break;
    case 'script-version': { const version = n.scriptVersions.find(entry => entry.revision === Number(args[0])); if (version) showDialog('剧本 v' + version.revision, scriptReadMarkup(version), `${btn('版本列表', `script-history:${n.id}`, 'outline')}${btn('回到剧本', 'script-return-editor', 'primary')}`, true); break; }
  }
  save();
  return true;
}

// Persist field values without rebuilding focused inputs or the surrounding workspace.
document.addEventListener('input', event => {
  if (!event.target.closest('.script-workbench')) return;
  const field = event.target.dataset.scriptField;
  if (!field) return;
  const n = scriptContextNode();
  if (!n?.scriptDraft) return;
  const doc = n.scriptDraft;
  const value = field === 'seconds' ? Number(event.target.value) : event.target.value;
  let target = doc;
  if (event.target.dataset.scriptShot) target = findDraftShot(doc, event.target.dataset.scriptShot)?.shot;
  else if (event.target.hasAttribute('data-script-scene-field')) target = doc.scenes.find(scene => scene.id === scriptEditorContext.sceneId);
  if (!target) return;
  target[field] = value;
  event.target.removeAttribute('aria-invalid');
  const error = document.getElementById(event.target.id + '-error');
  if (error) error.hidden = true;
  if (event.target.dataset.scriptShot) {
    if (field === 'title') document.querySelector(`[data-script-summary-title="${target.id}"]`).textContent = value;
    if (field === 'seconds') document.querySelector(`[data-script-summary-length="${target.id}"]`).textContent = value + ' 秒';
  } else if (event.target.hasAttribute('data-script-scene-field') && field === 'title') {
    const title = document.querySelector(`[data-script-outline-title="${target.id}"]`);
    if (title) { if (title.firstChild?.nodeType === 3) title.firstChild.textContent = value; else title.prepend(document.createTextNode(value)); }
  }
  const state = document.querySelector('[data-script-save-state]');
  if (state) state.textContent = '草稿保存在此浏览器';
  save();
});
document.addEventListener('change', event => {
  if (!event.target.matches('[data-script-scene-picker]')) return;
  const n = scriptContextNode();
  if (!n) return;
  scriptEditorContext.sceneId = event.target.value;
  scriptEditorContext.shotId = null;
  drawScriptWorkbench();
  save();
});
document.addEventListener('toggle', event => {
  if (!event.target.matches('details[data-script-shot-card]') || !event.target.open) return;
  const n = scriptContextNode();
  if (!n) return;
  for (const other of document.querySelectorAll('details[data-script-shot-card]')) if (other !== event.target) other.open = false;
  scriptEditorContext.shotId = event.target.dataset.scriptShotCard;
  n.scriptEditorShotId = scriptEditorContext.shotId;
  save();
}, true);
