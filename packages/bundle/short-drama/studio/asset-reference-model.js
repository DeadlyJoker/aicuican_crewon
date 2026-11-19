/* Fixed preparation references for the local prototype; adopted outputs stay independent. */
'use strict';

const studioAssetSourceKinds = new Set(['character', 'scene', 'image', 'voice', 'audio', 'video', 'shot']);
const studioAssetTargetKinds = new Set(['shot', 'video', 'image', 'character', 'scene', 'voice', 'audio']);
const studioAssetReferenceFields = ['sourceId', 'sourceTitle', 'sourceKind', 'candidateId', 'number', 'frame'];

function studioAssetNode(id) { return S.nodes.find(node => node.id === id); }
function studioAssetReferenceEqual(a, b) {
  return !!a && !!b && studioAssetReferenceFields.every(key => a[key] === b[key]);
}
function studioAssetVersionEqual(a, b) {
  return !!a && !!b && ['sourceId', 'sourceKind', 'candidateId', 'number', 'frame'].every(key => a[key] === b[key]);
}
function studioAssetReferenceValid(reference) {
  return !!reference && typeof reference === 'object'
    && ['sourceId', 'sourceTitle', 'candidateId'].every(key => typeof reference[key] === 'string' && reference[key].trim())
    && studioAssetSourceKinds.has(reference.sourceKind)
    && Number.isInteger(reference.number) && reference.number > 0
    // Frames identify bundled previews or persisted uploads; uploaded media use negative IDs.
    && Number.isSafeInteger(reference.frame);
}
function studioAssetReferenceCopy(reference) {
  return Object.fromEntries(studioAssetReferenceFields.map(key => [key, reference[key]]));
}

/** Read the current adopted asset without migrating candidates or selecting an output. */
function studioAssetSourceSnapshot(sourceOrId) {
  const source = typeof sourceOrId === 'string' ? studioAssetNode(sourceOrId) : sourceOrId;
  if (!source || !S.nodes.includes(source) || !studioAssetSourceKinds.has(source.kind) || source.referenceOnly) return null;
  const hasSelection = Object.hasOwn(source, 'adoptedCandidateId');
  if (hasSelection && !source.adoptedCandidateId) return null;
  const candidates = Array.isArray(source.candidates) ? source.candidates : [];
  const candidate = hasSelection ? candidates.find(item => item.id === source.adoptedCandidateId) : null;
  if (hasSelection && !candidate) return null;
  const legacyNumber = Number(S.versions?.[source.id]);
  const legacyAdopted = Number.isInteger(legacyNumber) && legacyNumber > 0 || ['已采用', '已完成'].includes(source.status);
  if (!candidate && (candidates.length || !legacyAdopted)) return null;
  const number = candidate ? Number(candidate.number) : legacyNumber > 0 ? legacyNumber : 1;
  const snapshot = {
    sourceId: source.id,
    sourceTitle: source.title || source.label || source.id,
    sourceKind: source.kind,
    candidateId: candidate ? candidate.id : `${source.id}-existing-${number}`,
    number,
    frame: candidate ? candidate.frame : source.frame,
  };
  return studioAssetReferenceValid(snapshot) ? snapshot : null;
}

function studioAssetReferenceRead(n) {
  if (!n || !studioAssetTargetKinds.has(n.kind)) return [];
  if (Object.hasOwn(n, 'assetReferences')) return Array.isArray(n.assetReferences) && n.assetReferences.every(studioAssetReferenceValid) ? n.assetReferences.map(studioAssetReferenceCopy) : [];
  const seen = new Set(), references = [];
  for (const edge of S.edges) {
    if (edge[1] !== n.id || seen.has(edge[0]) || edge[0] === n.id) continue;
    const reference = studioAssetSourceSnapshot(edge[0]);
    if (!reference) continue;
    references.push(reference); seen.add(reference.sourceId);
  }
  return references;
}

/** Initialize preparation references once from existing asset edges; later reads keep the pinned versions. */
function ensureStudioAssetReferences(n) {
  if (!n || !S.nodes.includes(n) || !studioAssetTargetKinds.has(n.kind)) return [];
  if (!Object.hasOwn(n, 'assetReferences')) n.assetReferences = studioAssetReferenceRead(n);
  return studioAssetReferenceRead(n);
}

/** Capture independent preparation references for a newly prepared candidate, never an earlier output. */
function studioAssetReferenceSnapshot(n) {
  return ensureStudioAssetReferences(n);
}

/** List pinned assets whose current adopted output changed or became unavailable. */
function studioAssetReferenceChanges(n) {
  return ensureStudioAssetReferences(n).flatMap(reference => {
    const source = studioAssetNode(reference.sourceId);
    const latest = studioAssetSourceSnapshot(source);
    const status = !source ? 'missing' : !latest ? 'unavailable' : !studioAssetVersionEqual(reference, latest) ? 'updated' : null;
    return status ? [{ sourceId: reference.sourceId, reference, latest, status }] : [];
  });
}

/** Return current-project nodes whose preparation inputs reference this asset, without changing their inputs. */
function studioAssetUsers(sourceId) {
  return S.nodes.filter(node => studioAssetTargetKinds.has(node.kind)
    && studioAssetReferenceRead(node).some(reference => reference.sourceId === sourceId));
}

function studioAssetReferenceFailure(code, error, sourceId = null) {
  return { ok: false, code, error, sourceId, changed: false, references: [], addedIds: [], removedIds: [] };
}

function studioAssetReferenceCycle(target, references) {
  const outgoing = new Map();
  for (const node of S.nodes) {
    if (!studioAssetTargetKinds.has(node.kind)) continue;
    const inputs = node === target ? references : Object.hasOwn(node, 'assetReferences')
      ? Array.isArray(node.assetReferences) ? node.assetReferences : []
      : S.edges.filter(edge => edge[1] === node.id && studioAssetSourceKinds.has(studioAssetNode(edge[0])?.kind)).map(edge => ({ sourceId: edge[0] }));
    for (const reference of inputs) {
      const targets = outgoing.get(reference.sourceId) || [];
      targets.push(node.id); outgoing.set(reference.sourceId, targets);
    }
  }
  const sources = new Set(references.map(reference => reference.sourceId));
  const seen = new Set(), queue = [target.id];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (seen.has(id)) continue;
    seen.add(id);
    if (sources.has(id)) return id;
    queue.push(...(outgoing.get(id) || []));
  }
  return null;
}

/**
 * Commit preparation references and their incoming asset edges after complete validation.
 * Each entry is a source ID, its current adopted snapshot, or an already pinned snapshot.
 * Failure changes no state. Success never changes outputs, candidates, drafts or clip order;
 * the caller owns persistence and UI feedback. A batch owner passes record=false
 * and records its complete transaction only after all targets succeed.
 */
function studioApplyAssetReferences(n, refs, record=true) {
  if (!n || !S.nodes.includes(n) || !studioAssetTargetKinds.has(n.kind)) return studioAssetReferenceFailure('invalid-target', '请选择当前项目中的镜头、视频或图片');
  if (!Array.isArray(refs)) return studioAssetReferenceFailure('invalid-references', '参考素材无法读取，请重新选择');
  if (Object.hasOwn(n, 'assetReferences') && (!Array.isArray(n.assetReferences) || !n.assetReferences.every(studioAssetReferenceValid)
    || new Set(n.assetReferences.map(reference => reference.sourceId)).size !== n.assetReferences.length)) return studioAssetReferenceFailure('invalid-existing-references', '当前参考记录无法读取，请保留项目后重新打开');
  const before = studioAssetReferenceRead(n), next = [], seen = new Set();
  for (const value of refs) {
    const sourceId = typeof value === 'string' ? value : value?.sourceId;
    if (typeof sourceId !== 'string' || !sourceId) return studioAssetReferenceFailure('invalid-source-id', '参考素材标识缺失，请重新选择');
    if (seen.has(sourceId)) return studioAssetReferenceFailure('duplicate-source', '同一素材只能引用一个采用版本', sourceId);
    if (sourceId === n.id) return studioAssetReferenceFailure('self-reference', '内容不能引用自身', sourceId);
    const source = studioAssetNode(sourceId), latest = studioAssetSourceSnapshot(source);
    if (!source) return studioAssetReferenceFailure('missing-source', '参考素材已不在当前项目，请重新选择', sourceId);
    if (!studioAssetSourceKinds.has(source.kind)) return studioAssetReferenceFailure('invalid-source-kind', '请选择当前项目中的图片、声音或视频作为参考', sourceId);
    if (['video','shot'].includes(source.kind)&&!['video','shot'].includes(n.kind)) return studioAssetReferenceFailure('invalid-source-kind','视频参考只用于视频制作',sourceId);
    if (!latest) return studioAssetReferenceFailure('unavailable-source', '参考素材尚无可用的采用结果，请先审阅并采用', sourceId);
    const requested = typeof value === 'string' ? latest : value;
    if (!studioAssetReferenceValid(requested)) return studioAssetReferenceFailure('invalid-snapshot', '参考版本记录不完整，请重新选择', sourceId);
    const pinned = before.find(reference => reference.sourceId === sourceId);
    if (!studioAssetReferenceEqual(requested, latest) && !studioAssetReferenceEqual(requested, pinned)) return studioAssetReferenceFailure('unadopted-version', '请选择已锁定版本或当前采用版本', sourceId);
    next.push(studioAssetReferenceCopy(requested)); seen.add(sourceId);
  }
  const cycle = studioAssetReferenceCycle(n, next);
  if (cycle) return studioAssetReferenceFailure('reference-cycle', '这组参考会形成循环，请移除相互引用的素材', cycle);
  return studioCommitAssetReferences(n, before, next, record);
}

/** Replay a recorded preparation edit, preserving its pinned versions and all output history. */
function studioRestoreAssetReferences(n, expected, refs) {
  if(!n||!S.nodes.includes(n)||!studioAssetTargetKinds.has(n.kind))return studioAssetReferenceFailure('missing-target','原内容已不在项目中，无法恢复参考');
  const before=studioAssetReferenceRead(n);
  if(!Array.isArray(expected))return studioAssetReferenceFailure('invalid-history','这一步的参考记录不完整，无法恢复');
  if(before.length!==expected.length||!before.every((ref,index)=>studioAssetReferenceEqual(ref,expected[index])))return studioAssetReferenceFailure('history-conflict','参考已发生其他变化，暂不能撤销这一步');
  if(!Array.isArray(refs)||!refs.every(studioAssetReferenceValid)||new Set(refs.map(ref=>ref.sourceId)).size!==refs.length)return studioAssetReferenceFailure('invalid-history','这一步的参考记录不完整，无法恢复');
  if(refs.some(ref=>!S.nodes.some(source=>source.id===ref.sourceId&&source.kind===ref.sourceKind)))return studioAssetReferenceFailure('missing-source','原参考素材已不在项目中，无法恢复');
  if(studioAssetReferenceCycle(n,refs))return studioAssetReferenceFailure('reference-cycle','恢复这一步会形成循环，暂不能恢复');
  return studioCommitAssetReferences(n,before,refs.map(studioAssetReferenceCopy));
}

/** Commit validated preparation references and matching incoming edges together. */
function studioCommitAssetReferences(n,before,next,record=true) {
  const previousIds = new Set(before.map(reference => reference.sourceId));
  const nextIds = new Set(next.map(reference => reference.sourceId));
  const incomingAsset = edge => edge[1] === n.id
    && (studioAssetSourceKinds.has(studioAssetNode(edge[0])?.kind) || previousIds.has(edge[0]));
  const existingIds = S.edges.filter(incomingAsset).map(edge => edge[0]);
  const edgesMatch = existingIds.length === next.length && new Set(existingIds).size === next.length && existingIds.every(id => nextIds.has(id));
  const inputsMatch = before.length === next.length && before.every((reference, index) => studioAssetReferenceEqual(reference, next[index]));
  const changed = !Object.hasOwn(n, 'assetReferences') || !inputsMatch || !edgesMatch;
  const addedIds = [...nextIds].filter(id => !previousIds.has(id));
  const removedIds = [...previousIds].filter(id => !nextIds.has(id));
  if (changed) {
    const nextEdges = edgesMatch ? S.edges : [...S.edges.filter(edge => !incomingAsset(edge)), ...next.map(reference => [reference.sourceId, n.id])];
    const entry = { type: 'asset-references-updated', nodeId: n.id, nodeTitle: n.title, before, after: next.map(studioAssetReferenceCopy), createdAt: new Date().toISOString() };
    n.assetReferences = next.map(studioAssetReferenceCopy);
    S.edges = nextEdges;
    if(record){S.history.push(entry);S.revision++;}
  }
  return { ok: true, changed, references: next.map(studioAssetReferenceCopy), addedIds, removedIds };
}

/** Compare a candidate's recorded sources with preparation inputs; missing legacy metadata stays unknown. */
function studioAssetOutputReferenceDiff(n, candidate) {
  const output = candidate === undefined
    ? Array.isArray(n?.candidates) ? n.candidates.find(item => item.id === n.adoptedCandidateId) : null
    : candidate;
  if (!output || !Array.isArray(output.sourceReferences) || !output.sourceReferences.every(studioAssetReferenceValid)) return { known: false, changes: [] };
  const inputs = ensureStudioAssetReferences(n), recorded = output.sourceReferences.map(studioAssetReferenceCopy);
  const inputById = new Map(inputs.map(reference => [reference.sourceId, reference]));
  const outputById = new Map(recorded.map(reference => [reference.sourceId, reference]));
  const changes = [];
  for (const [sourceId, reference] of inputById) {
    const outputReference = outputById.get(sourceId) || null;
    if (!outputReference || !studioAssetVersionEqual(reference, outputReference)) changes.push({ sourceId, status: outputReference ? 'updated' : 'added', reference, outputReference });
  }
  for (const [sourceId, outputReference] of outputById) if (!inputById.has(sourceId)) changes.push({ sourceId, status: 'removed', reference: null, outputReference: studioAssetReferenceCopy(outputReference) });
  return { known: true, changes };
}
