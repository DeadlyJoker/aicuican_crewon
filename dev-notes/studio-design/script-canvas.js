/* Project navigation and review feedback for local screenplay edits. */
'use strict';

function studioScriptNode() {
  return S.projectKind === 'drama' ? S.nodes.find(n => n.id === 'story' && n.kind === 'story') || S.nodes.find(n => n.kind === 'story') : null;
}
function studioScriptScenes() {
  const script = studioScriptNode();
  return script ? ensureStudioScript(script).scenes : [];
}
function scriptSceneNodes(scene) {
  return scene.shots.map(shot => nodeById(shot.id)).filter(Boolean);
}
function scriptCanvasGroups() {
  const script = studioScriptNode();
  const assets = S.nodes.filter(n => ['character', 'scene'].includes(n.kind));
  const final = S.nodes.find(n => n.kind === 'final');
  const label = (title, x, y) => `<div class="world-label" style="left:${x}px;top:${y}px">${esc(title)}</div>`;
  let result = script ? label('故事与剧本', script.x, script.y - 50) : '';
  if (assets.length) result += label('角色与场景', Math.min(...assets.map(n => n.x)), Math.min(...assets.map(n => n.y)) - 50);
  const offsets = new Map();let elapsed = 0;
  for(const id of S.clips){const node=nodeById(id);if(!node)continue;const start=elapsed;elapsed+=nodeDisplay(node).seconds||0;offsets.set(id,{start,end:elapsed});}
  for (const scene of studioScriptScenes()) {
    const nodes = scriptSceneNodes(scene);
    if (!nodes.length) continue;
    const x = Math.min(...nodes.map(n => n.x)) - 24, y = Math.min(...nodes.map(n => n.y)) - 40;
    const right = Math.max(...nodes.map(n => n.x + n.w)) + 24;
    const bottom = Math.max(...nodes.map(n => n.y + (document.querySelector(`[data-node="${n.id}"]`)?.offsetHeight || n.h))) + 24;
    const memberIds=new Set(nodes.map(n=>n.id)),ordered=S.clips.filter(id=>memberIds.has(id)),indices=ordered.map(id=>S.clips.indexOf(id));
    const contiguous=indices.every((index,i)=>i===0||index===indices[i-1]+1);
    const duration=ordered.reduce((sum,id)=>sum+(offsets.get(id).end-offsets.get(id).start),0);
    const time=ordered.length?(contiguous?timeLabel(offsets.get(ordered[0]).start)+'—'+timeLabel(offsets.get(ordered.at(-1)).end):duration+' 秒 · 多段'):'未编入剪辑';
    result += `<div class="world-section" style="left:${x}px;top:${y}px;width:${right - x}px;height:${bottom - y}px"><div class="world-section-label">${esc(scene.title)}<small>${time}</small></div></div>`;
  }
  if (final) result += label('交付作品', final.x, final.y - 50);
  return result;
}
function scriptSceneTabs() {
  return `<div class="scene-tabs"><button class="${S.scene === 'all' ? 'active' : ''}" data-action="fit">全部</button>${studioScriptScenes().map(scene => `<button class="${S.scene === scene.id ? 'active' : ''}" data-action="focus-script-scene:${scene.id}">${esc(scene.title)}</button>`).join('')}</div>`;
}
function scriptProjectNav() {
  const script = studioScriptNode();
  const linkedIds = new Set(studioScriptScenes().flatMap(scene=>scene.shots.map(shot=>shot.id)));
  const otherShots = S.nodes.filter(n=>n.kind==='shot'&&!linkedIds.has(n.id));
  return `<aside class="project-nav" aria-label="项目内容"><div class="project-name">${I('folder')}<strong>${esc(S.project)}</strong><span class="pill">01</span></div><button class="tree-item active" data-action="fit">${I('grid')}项目总览</button><div class="nav-label">故事与设定</div>${script ? `<button class="tree-item" data-action="script-open:${script.id}">${I('file')}剧本工坊</button>` : ''}${S.nodes.filter(n => ['character', 'scene'].includes(n.kind)).map(n => `<button class="tree-item" data-focus="${n.id}">${I(kindIcon[n.kind])}<span>${esc(n.title)}</span></button>`).join('')}<div class="nav-label">分场与镜头</div>${studioScriptScenes().map(scene => `<div class="script-tree-group"><button class="tree-item script-tree-scene" data-action="focus-script-scene:${scene.id}">${esc(scene.title)}</button>${scriptSceneNodes(scene).map(n => `<button class="tree-item script-tree-shot" data-focus="${n.id}"><span>${esc(n.label)} · ${esc(n.title)}</span>${n.reviewRequired ? '<span class="script-review-dot" aria-label="待复核"></span>' : ''}</button>`).join('')}</div>`).join('')}${otherShots.length?`<div class="nav-label">其他镜头</div>${otherShots.map(n=>`<button class="tree-item script-tree-shot" data-focus="${n.id}"><span>${esc(n.title)}</span></button>`).join('')}`:''}<div class="nav-spacer"></div><button class="tree-item" data-action="timeline">${I('film')}剪辑与配音</button><button class="tree-item" data-action="history">${I('history')}项目记录</button></aside>`;
}
function focusScriptScene(sceneId) {
  const scene = studioScriptScenes().find(item => item.id === sceneId);
  const nodes = scene && scriptSceneNodes(scene);
  if (!nodes?.length) { toast('这一场还没有加入画布的镜头'); return; }
  S.scene = sceneId; S.view = 'canvas'; S.selected = null;
  if (S.panel === 'selection') S.panel = 'director';
  render();
  const viewport = document.getElementById('viewport');
  const x = Math.min(...nodes.map(n => n.x)) - 24, y = Math.min(...nodes.map(n => n.y)) - 42;
  const w = Math.max(...nodes.map(n => n.x + n.w)) - x + 24;
  const h = Math.max(...nodes.map(n => n.y + (document.querySelector(`[data-node="${n.id}"]`)?.offsetHeight || n.h))) - y + 24;
  S.zoom = Math.max(.25, Math.min(.95, (viewport.clientWidth - 120) / w, (viewport.clientHeight - 110) / h));
  S.pan = { x: (viewport.clientWidth - w * S.zoom) / 2 - x * S.zoom, y: 55 - y * S.zoom };
  applyCamera(); save();
}
function scriptReviewNodes() { return S.nodes.filter(n => n.reviewRequired); }
function scriptReviewNotice(n) {
  if (!n.reviewRequired) return '';
  return `<section class="script-review-notice" aria-label="剧本变更待复核"><strong>剧本已更新</strong><p>当前画面仍沿用已采用版本</p><div>${btn('查看剧本', `script-open:${n.scriptSourceId || studioScriptNode()?.id}`, 'ghost')}${btn('继续沿用', `keep-script-output:${n.id}`, 'outline')}</div></section>`;
}
function scriptExportNotice() {
  const count = scriptReviewNodes().length;
  return count ? `<div class="script-export-notice"><span>${count} 项内容仍沿用修改前的结果</span>${btn('查看变更', 'review-script-changes', 'ghost', 'chev')}</div>` : '';
}
function openScriptPendingReview() {
  const nodes = scriptReviewNodes();
  showDialog('变更待复核', `<p>剧本输入已更新，当前采用结果继续保留。</p>${nodes.length ? `<div class="script-pending-list">${nodes.map(n => `<article><div><h3>${esc(n.title)}</h3><p>剧本 v${n.scriptRevision || 1} · ${n.kind==='final'?'组合结果待复核':'当前画面 v'+candidateVersion(n)}</p></div><div>${btn('查看内容', `candidate-return:${n.id}`, 'outline')}${btn('继续沿用', `keep-script-output:${n.id}`, 'ghost')}</div></article>`).join('')}</div>` : '<div class="script-review-empty">当前采用结果都已确认</div>'}`, btn('回到创作', 'close-modal', 'outline'));
}
function keepScriptOutput(nodeId) {
  const n = nodeById(nodeId);
  if (!n?.reviewRequired) return;
  n.reviewRequired = false;
  n.reviewAcknowledgedRevision = n.scriptRevision;
  S.history.push({ type: 'script-output-kept', nodeId: n.id, nodeTitle: n.title, scriptRevision: n.scriptRevision, number: candidateVersion(n), createdAt: new Date().toISOString() });
  if (currentModal === '变更待复核') { render(); openScriptPendingReview(); }
  else render();
  save(); toast(`已沿用 v${candidateVersion(n)}，剧本新输入继续保留`);
}
function scriptShotSourceLabel(n) {
  return studioAssetNodeSourceLabel(n);
}

function showPendingClipExport() {
  const nodes = S.clips.map(nodeById).filter(n => n?.referenceOnly);
  showDialog('先完成待制作镜头', `<p>还有 ${nodes.length} 个镜头没有采用结果，可先保存制作方案。</p><div class="script-pending-list">${nodes.map(n => `<article><div><h3>${esc(n.title)}</h3><p>${esc(n.scriptSceneTitle || '剧本镜头')} · 尚未制作</p></div>${btn('查看镜头', `candidate-return:${n.id}`, 'outline', 'chev')}</article>`).join('')}</div>`, `${btn('回到创作','close-modal','outline')}${btn('下载制作方案','download-plan','primary','download')}`);
}
