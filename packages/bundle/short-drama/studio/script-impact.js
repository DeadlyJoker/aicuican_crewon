/* Local script changes update preparation inputs, never adopted media outputs. */
'use strict';

function studioScriptEntries(doc) {
  return doc.scenes.flatMap((scene, sceneIndex) => scene.shots.map((shot, shotIndex) => ({
    shot, sceneId: scene.id, sceneTitle: scene.title, sceneIndex, shotIndex,
  })));
}

function studioScriptContent(doc) {
  return {
    title: doc.title,
    logline: doc.logline || '',
    ...(doc.legacyText ? { legacyText: doc.legacyText } : {}),
    scenes: doc.scenes.map(scene => ({
      id: scene.id, title: scene.title,
      shots: scene.shots.map(shot => ({
        id: shot.id, title: shot.title, action: shot.action,
        dialogue: shot.dialogue || '', seconds: Number(shot.seconds),
      })),
    })),
  };
}

/** Return only unsaved fields that differ from the values currently shown in the editor. */
function studioEffectiveNodeDraft(n, draft = S.nodeDrafts?.[n.id] || {}) {
  const differences = [];
  const text = n.text ?? n.prompt ?? n.description ?? '';
  const baselines = { prompt: text, text: n.text ?? text, description: n.description ?? text, dialogue: n.dialogue ?? '' };
  for (const [key, value] of Object.entries(draft)) {
    let equal = false;
    if (Object.hasOwn(baselines, key)) equal = value == null || value === baselines[key];
    else if (key === 'seconds') {
      const supplied = typeof value === 'number' || typeof value === 'string' && value.trim() !== '';
      const seconds = Number(value), baseline = Number(n.seconds);
      equal = value == null || supplied && Number.isFinite(seconds) && Number.isFinite(baseline) && seconds === baseline;
    } else if (key === 'motion') equal = value == null || typeof value === 'string' && (value || '缓慢推进') === (n.motion || '缓慢推进');
    if (!equal) differences.push([key, value]);
  }
  return Object.fromEntries(differences);
}

/** Copy the applied script with independent scene and shot identities, without creating media nodes. */
function forkStudioScriptNode(original, copyId) {
  const copy = structuredClone(original);
  const source = copy.scriptDocument || ensureStudioScript(copy);
  let shotNumber = 0;
  const document = {
    ...studioScriptContent(source), revision: 1, title: source.title + ' · 副本',
    scenes: source.scenes.map((scene, index) => ({
      id: copyId + '-scene-' + (index + 1), title: scene.title,
      shots: scene.shots.map(shot => ({
        id: copyId + '-shot-' + (++shotNumber), title: shot.title, action: shot.action,
        dialogue: shot.dialogue || '', seconds: Number(shot.seconds),
      })),
    })),
  };
  copy.id = copyId;
  copy.title = document.title;
  copy.subtitle = document.logline;
  copy.status = '草稿';
  copy.scriptDocument = document;
  copy.scriptVersions = [{ ...structuredClone(document), createdAt: new Date().toISOString() }];
  copy.scriptDraft = null;
  copy.scriptDraftUndo = [];
  copy.scriptRetainedShotIds = [];
  copy.scriptApplyReceipt = null;
  copy.scriptPendingShotIds = studioScriptEntries(document).map(entry => entry.shot.id);
  copy.scriptEditorSceneId = document.scenes[0]?.id || null;
  copy.scriptEditorShotId = document.scenes[0]?.shots[0]?.id || null;
  copy.scriptForkOf = { nodeId: original.id, revision: source.revision, title: source.title };
  copy.reviewRequired = false;
  for (const key of ['reviewNote', 'scriptSourceId', 'scriptSceneId', 'scriptSceneTitle', 'scriptRevision', 'scriptDetachedFrom', 'scriptDetachedAt', 'candidates', 'adoptedCandidateId']) delete copy[key];
  return copy;
}

function studioScriptDocumentError(doc) {
  if (!doc || typeof doc.title !== 'string' || !doc.title.trim()) return '请填写剧本名称';
  if (doc.logline !== undefined && typeof doc.logline !== 'string') return '故事概况无法读取，请重新打开编辑';
  if (!Array.isArray(doc.scenes) || !doc.scenes.length) return '请至少保留一个场景';
  const sceneIds = new Set(), shotIds = new Set();
  for (const scene of doc.scenes) {
    if (!scene || typeof scene.id !== 'string' || !scene.id || sceneIds.has(scene.id)) return '场景标识重复或缺失，请重新打开编辑';
    sceneIds.add(scene.id);
    if (typeof scene.title !== 'string' || !scene.title.trim()) return '请填写场景名称';
    if (!Array.isArray(scene.shots)) return '场景中的镜头无法读取，请重新打开编辑';
    for (const shot of scene.shots) {
      if (!shot || typeof shot.id !== 'string' || !shot.id || shotIds.has(shot.id)) return '镜头标识重复或缺失，请重新打开编辑';
      shotIds.add(shot.id);
      if (typeof shot.title !== 'string' || !shot.title.trim()) return '请填写镜头名称';
      if (typeof shot.action !== 'string' || !shot.action.trim()) return '请补充镜头画面与动作';
      if (shot.dialogue !== undefined && typeof shot.dialogue !== 'string') return '镜头对白无法读取，请重新打开编辑';
      const seconds = Number(shot.seconds);
      if (!Number.isFinite(seconds) || seconds <= 0) return '镜头时长需大于 0 秒';
    }
  }
  return '';
}

function studioScriptPlanFailure(n, error) {
  return { baseRevision: n?.scriptDocument?.revision || 1, docChanged: false, items: [], orderChanged: false, error };
}

/** Compare the script with saved preparation inputs without reading or changing adopted candidates. */
function buildStudioScriptPlan(n, doc) {
  const error = studioScriptDocumentError(doc);
  if (error) return studioScriptPlanFailure(n, error);
  if (!n || n.kind !== 'story' || !S.nodes.includes(n)) return studioScriptPlanFailure(n, '当前剧本已变化，请重新打开编辑');
  const current = ensureStudioScript(n);
  const content = studioScriptContent(doc), currentContent = studioScriptContent(current);
  const docChanged = JSON.stringify(content) !== JSON.stringify(currentContent);
  if (docChanged && doc.revision !== undefined && doc.revision !== current.revision) {
    return studioScriptPlanFailure(n, '剧本已有更新，请重新打开审阅');
  }
  const entries = studioScriptEntries(content), previous = studioScriptEntries(currentContent);
  const previousById = new Map(previous.map(entry => [entry.shot.id, entry]));
  const desiredIds = entries.map(entry => entry.shot.id), desiredSet = new Set(desiredIds);
  const items = [];
  for (const entry of entries) {
    const { shot, sceneId, sceneTitle } = entry, node = nodeById(shot.id);
    const base = { shotId: shot.id, title: shot.title, sceneId, sceneTitle };
    if (!node) {
      items.push({ ...base, id: 'add:' + shot.id, kind: 'add', fields: ['新增镜头'], blockedByDraft: false, selected: true });
      continue;
    }
    if (!['shot', 'video'].includes(node.kind)) return studioScriptPlanFailure(n, '镜头标识与其他内容冲突，请重新添加该镜头');
    const before = previousById.get(shot.id);
    const fields = [];
    if (shot.title !== node.title) fields.push('标题');
    if (shot.action !== (node.prompt ?? node.text ?? node.description ?? '')) fields.push('画面与动作');
    if ((shot.dialogue || '') !== (node.dialogue || '')) fields.push('对白');
    if (Number(shot.seconds) !== Number(node.seconds)) fields.push('时长');
    const oldSceneId = node.scriptSceneId || before?.sceneId;
    const oldSceneTitle = node.scriptSceneTitle || before?.sceneTitle;
    if (sceneId !== oldSceneId || sceneTitle !== oldSceneTitle) fields.push('所属场景');
    if (!S.clips.includes(shot.id)) fields.push('加入当前剪辑');
    if (!fields.length) continue;
    const blockedByDraft = Object.keys(studioEffectiveNodeDraft(node)).length > 0;
    items.push({ ...base, id: 'update:' + shot.id, kind: 'update', fields, blockedByDraft, selected: !blockedByDraft });
  }
  const oldIds = new Set([...previous.map(entry => entry.shot.id), ...(n.scriptRetainedShotIds || [])]);
  for (const shotId of oldIds) {
    if (desiredSet.has(shotId)) continue;
    const node = nodeById(shotId), before = previousById.get(shotId);
    if (!node) continue;
    items.push({
      id: 'remove:' + shotId, kind: 'remove', shotId, title: node.title,
      sceneId: node.scriptSceneId || before?.sceneId || '',
      sceneTitle: node.scriptSceneTitle || before?.sceneTitle || '',
      fields: ['移出当前剪辑，保留素材'], blockedByDraft: false, selected: false,
    });
  }
  const currentOrder = S.clips.filter(id => desiredSet.has(id));
  const desiredExistingOrder = desiredIds.filter(id => S.clips.includes(id));
  const orderChanged = JSON.stringify(currentOrder) !== JSON.stringify(desiredExistingOrder)
    || items.some(item => item.kind === 'add' || item.fields.includes('加入当前剪辑'));
  return { baseRevision: current.revision, docChanged, items, orderChanged };
}

function studioScriptApplyFailure(error, blockedIds = []) {
  return { ok: false, error, changedIds: [], addedIds: [], removedIds: [], blockedIds };
}

function studioScriptNewPosition(entry, nodes, entries) {
  const ids = new Set(entries.filter(other => other.sceneId === entry.sceneId).map(other => other.shot.id));
  const members = nodes.filter(node => ids.has(node.id));
  const baseX = members.length ? Math.min(...members.map(node => node.x)) : 762;
  const baseY = members.length ? Math.min(...members.map(node => node.y)) : 96 + entry.sceneIndex * 420;
  const x = baseX + entry.shotIndex % 2 * 354;
  let y = baseY + Math.floor(entry.shotIndex / 2) * 380;
  while (nodes.some(node => x < node.x + node.w + 24 && x + 286 + 24 > node.x && y < node.y + node.h + 24 && y + 297 + 24 > node.y)) y += 380;
  return { x, y };
}

function studioScriptClipOrder(clips, desiredIds, addedIds, syncOrder) {
  const next = [...clips], desiredSet = new Set(desiredIds);
  if (syncOrder) {
    const ordered = desiredIds.filter(id => next.includes(id));
    let index = 0;
    for (let i = 0; i < next.length; i++) if (desiredSet.has(next[i])) next[i] = ordered[index++];
  }
  const additions = new Set(addedIds);
  for (let index = 0; index < desiredIds.length; index++) {
    const id = desiredIds[index];
    if (!additions.has(id) || next.includes(id)) continue;
    const previous = desiredIds.slice(0, index).findLast(other => next.includes(other));
    const following = desiredIds.slice(index + 1).find(other => next.includes(other));
    if (previous) next.splice(next.indexOf(previous) + 1, 0, id);
    else if (following) next.splice(next.indexOf(following), 0, id);
    else next.push(id);
  }
  return next;
}

/** Commit a reviewed local change while preserving media snapshots, unsaved inputs and detached content. */
function applyStudioScriptPlan(n, doc, selectedIds, options = {}) {
  const plan = buildStudioScriptPlan(n, doc);
  if (plan.error) return studioScriptApplyFailure(plan.error);
  if (!Array.isArray(selectedIds) || selectedIds.some(id => typeof id !== 'string')) return studioScriptApplyFailure('更新选项无法读取，请重新审阅');
  const selected = [...new Set(selectedIds)], selectedSet = new Set(selected), byId = new Map(plan.items.map(item => [item.id, item]));
  const content = studioScriptContent(doc), fingerprint = JSON.stringify(content), syncOrder = options.syncOrder === true;
  const blockedIds = plan.items.filter(item => item.blockedByDraft).map(item => item.shotId);
  const unknown = selected.filter(id => !byId.has(id));
  if (unknown.length) {
    const receipt = n.scriptApplyReceipt;
    const repeated = unknown.length === selected.length && !plan.docChanged && receipt?.fingerprint === fingerprint
      && receipt.syncOrder === syncOrder && JSON.stringify(receipt.selectedIds) === JSON.stringify([...selected].sort())
      && JSON.stringify(receipt.clipOrder) === JSON.stringify(S.clips);
    return repeated ? { ok: true, changedIds: [], addedIds: [], removedIds: [], blockedIds, repeated: true } : studioScriptApplyFailure('需要更新的镜头已变化，请重新审阅', blockedIds);
  }
  if (selected.some(id => byId.get(id).blockedByDraft)) return studioScriptApplyFailure('所选镜头有未保存输入，请先处理后再更新', blockedIds);
  const nextRevision = plan.baseRevision + (plan.docChanged ? 1 : 0);
  const nextDoc = { revision: nextRevision, ...content }, entries = studioScriptEntries(content);
  const entriesById = new Map(entries.map(entry => [entry.shot.id, entry]));
  const updates = [], additions = [], removals = [], events = [], now = new Date().toISOString();
  let nextEdges = S.edges.map(edge => [...edge]);
  const finalIds = new Set(S.nodes.filter(node => node.kind === 'final').map(node => node.id));
  for (const item of plan.items) {
    if (!selectedSet.has(item.id)) continue;
    const node = nodeById(item.shotId), entry = entriesById.get(item.shotId);
    if (item.kind === 'update') {
      const { shot } = entry;
      const patch = {
        title: shot.title, prompt: shot.action, dialogue: shot.dialogue || '', seconds: Number(shot.seconds),
        scriptSourceId: n.id, scriptSceneId: entry.sceneId, scriptSceneTitle: entry.sceneTitle, scriptRevision: nextRevision,
        reviewRequired: true, reviewNote: '剧本已更新，沿用旧结果',
      };
      const clearEqualDraft = Object.hasOwn(S.nodeDrafts || {}, node.id) && Object.keys(studioEffectiveNodeDraft(node)).length === 0;
      updates.push({ node, patch, clearEqualDraft });
      events.push({ type: 'script-shot-inputs', nodeId: node.id, nodeTitle: shot.title, scriptNodeId: n.id, scriptRevision: nextRevision, fields: [...item.fields], before: { title: node.title, prompt: node.prompt || '', dialogue: node.dialogue || '', seconds: node.seconds }, after: { title: shot.title, prompt: shot.action, dialogue: shot.dialogue || '', seconds: Number(shot.seconds) }, createdAt: now });
    } else if (item.kind === 'add') {
      const { shot } = entry, position = studioScriptNewPosition(entry, [...S.nodes, ...additions], entries);
      const frame = S.nodes.find(existing => existing.kind === 'scene')?.frame ?? 0;
      additions.push({ id: shot.id, kind: 'shot', label: '镜头 ' + String(S.nodes.filter(existing => existing.kind === 'shot').length + additions.length + 1).padStart(2, '0'), title: shot.title, description: shot.action, prompt: shot.action, dialogue: shot.dialogue || '', seconds: Number(shot.seconds), ...position, w: 286, h: 297, status: '草稿', frame, referenceOnly: true, scriptSourceId: n.id, scriptSceneId: entry.sceneId, scriptSceneTitle: entry.sceneTitle, scriptRevision: nextRevision, reviewRequired: false });
      for (const edge of [[n.id, shot.id], ...[...finalIds].map(id => [shot.id, id])]) if (!nextEdges.some(existing => existing[0] === edge[0] && existing[1] === edge[1])) nextEdges.push(edge);
      events.push({ type: 'script-shot-added', nodeId: shot.id, nodeTitle: shot.title, scriptNodeId: n.id, scriptRevision: nextRevision, sceneTitle: entry.sceneTitle, createdAt: now });
    } else {
      const removedEdges = nextEdges.filter(edge => edge[0] === n.id && edge[1] === node.id || edge[0] === node.id && finalIds.has(edge[1]));
      nextEdges = nextEdges.filter(edge => !removedEdges.includes(edge));
      removals.push({ node, removedEdges });
      events.push({ type: 'script-shot-detached', nodeId: node.id, nodeTitle: node.title, scriptNodeId: n.id, scriptRevision: nextRevision, previousClipIndex: S.clips.indexOf(node.id), removedEdges, createdAt: now });
    }
  }
  const removedSet = new Set(removals.map(item => item.node.id));
  const insertedIds = [...additions.map(node => node.id), ...updates.filter(item => !S.clips.includes(item.node.id)).map(item => item.node.id)];
  const nextClips = studioScriptClipOrder(S.clips.filter(id => !removedSet.has(id)), entries.map(entry => entry.shot.id), insertedIds, syncOrder);
  const orderApplied = JSON.stringify(nextClips) !== JSON.stringify(S.clips);
  if (plan.docChanged || orderApplied) events.unshift({ type: 'script-updated', nodeId: n.id, nodeTitle: content.title, revision: nextRevision, previousRevision: plan.baseRevision, documentChanged: plan.docChanged, previousClipOrder: [...S.clips], clipOrder: [...nextClips], createdAt: now });
  const current = n.scriptDocument;
  const versions = Array.isArray(n.scriptVersions) ? [...n.scriptVersions] : [{ ...structuredClone(current), createdAt: null }];
  if (plan.docChanged) versions.push({ ...structuredClone(nextDoc), createdAt: now });
  const retained = new Set(n.scriptRetainedShotIds || []);
  for (const item of plan.items) if (item.kind === 'remove') {
    if (selectedSet.has(item.id)) retained.delete(item.shotId);
    else retained.add(item.shotId);
  }
  for (const entry of entries) retained.delete(entry.shot.id);
  const pending = plan.items.filter(item => item.kind !== 'remove' && !selectedSet.has(item.id)).map(item => item.shotId);
  for (const { node, patch, clearEqualDraft } of updates) {
    if (clearEqualDraft) delete S.nodeDrafts[node.id];
    Object.assign(node, patch);
    delete node.scriptDetachedFrom;
    delete node.scriptDetachedAt;
  }
  for (const { node } of removals) {
    delete node.scriptSourceId;
    delete node.scriptSceneId;
    delete node.scriptSceneTitle;
    delete node.scriptRevision;
    node.scriptDetachedFrom = n.id;
    node.scriptDetachedAt = now;
  }
  S.nodes.push(...additions);
  S.edges = nextEdges;
  S.clips = nextClips;
  S.layoutBase = [...(S.layoutBase || S.nodes.filter(node => !additions.includes(node)).map(node => ({ id: node.id, x: node.x, y: node.y }))), ...additions.map(node => ({ id: node.id, x: node.x, y: node.y }))];
  n.scriptDocument = nextDoc;
  n.scriptVersions = versions;
  n.scriptDraft = null;
  n.scriptRetainedShotIds = [...retained];
  n.scriptPendingShotIds = pending;
  n.scriptApplyReceipt = { fingerprint, selectedIds: [...selected].sort(), syncOrder, clipOrder: [...nextClips] };
  n.title = content.title;
  n.subtitle = content.logline;
  if (updates.length || additions.length || removals.length || orderApplied) for (const node of S.nodes) if (finalIds.has(node.id)) {
    node.reviewRequired = true;
    node.reviewNote = '剧本已更新，旧成片仍保留';
    node.scriptSourceId = n.id;
    node.scriptRevision = nextRevision;
  }
  S.history.push(...events);
  if (events.length) S.revision++;
  save();
  return { ok: true, changedIds: updates.map(item => item.node.id), addedIds: additions.map(node => node.id), removedIds: removals.map(item => item.node.id), blockedIds };
}
