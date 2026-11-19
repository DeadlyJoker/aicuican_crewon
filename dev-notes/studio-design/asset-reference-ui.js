/* Reference selection for the local prototype; applying inputs never remakes an output. */
'use strict';

let studioAssetPickerState = null;
let studioAssetLibraryState = null;
const studioExampleAssets = [
  { catalogId:'studio-example-linwan', legacyId:'actor', title:'林晚', kind:'character', label:'角色', frame:1, description:'奶白风衣，棕色挎包。克制、疲惫，眼神里仍有期待。' },
  { catalogId:'studio-example-keeper', title:'守站人', kind:'character', label:'角色', frame:2, description:'深蓝工作服，沉稳而温和的守站人。' },
  { catalogId:'studio-example-platform', legacyId:'scene', title:'旧站台', kind:'scene', label:'场景', frame:0, description:'湿润路面，深青色雨夜，一点暖光。' },
  { catalogId:'studio-example-alley', title:'雨巷', kind:'scene', label:'场景', frame:4, description:'雨后的窄巷，路灯暖光照亮前行的方向。' },
  { catalogId:'studio-example-lamp', title:'旧灯', kind:'image', label:'道具', frame:3, description:'雨夜里传递的一盏旧灯，暖光照亮两人的手。' },
  { catalogId:'studio-example-crossroad', title:'街口', kind:'scene', label:'场景', frame:5, description:'黎明前的街口，路面留着雨水的反光。' },
];

function studioAssetCanonical(n) { return n && nodeById(typeof n === 'string' ? n : n.id); }
function studioAssetActionId(id) { return encodeURIComponent(id); }
function studioAssetKindLabel(kind) { return ({character:'角色',scene:'场景',image:'图片',voice:'声音',audio:'声音',video:'视频',shot:'视频'})[kind] || '素材'; }
function studioAssetThumb(reference, extra = '') {
  const kind=reference.sourceKind||reference.kind,sound=['voice','audio'].includes(kind),video=['video','shot'].includes(kind);
  return `<span class="studio-asset-thumb ${sound||video?'studio-asset-sound':'still frame'+Number(reference.frame)} ${extra}" aria-hidden="true">${sound?I('mic'):video?I('film'):''}</span>`;
}
function studioAssetUnavailableThumb(kind) {
  return `<span class="studio-asset-thumb studio-asset-placeholder" aria-label="尚无采用结果">${I(['voice','audio'].includes(kind)?'mic':'image')}</span>`;
}
function studioAssetReferenceChip(reference) {
  return `<span class="studio-asset-chip">${studioAssetThumb(reference)}<span>${esc(reference.sourceTitle)}</span><small>v${reference.number}</small></span>`;
}
function studioAssetOutput(n) { return n?.referenceOnly ? null : n?.candidates?.find(c => c.id === n.adoptedCandidateId); }
function studioAssetDescription(n) { const output=studioAssetOutput(n);return output?.description || output?.prompt || n?.description || ''; }

function assetReferenceSectionHtml(value) {
  const n = studioAssetCanonical(value);
  if (!n || !studioAssetTargetKinds.has(n.kind)) return '';
  const refs = studioAssetReferenceSnapshot(n), changes = studioAssetReferenceChanges(n), output = studioAssetOutput(n);
  const diff = studioAssetOutputReferenceDiff(n);
  const note = output && !diff.known ? '当前画面的参考版本未记录' : diff.changes.length ? '参考已调整，当前画面继续保留' : '';
  return `<section class="studio-asset-section"><div class="studio-asset-heading"><h3>制作参考${refs.length?`<span>${refs.length}</span>`:''}</h3>${btn('管理','asset-picker:'+studioAssetActionId(n.id),'ghost')}</div>${refs.length?`<div class="studio-asset-reference-list">${refs.map(ref=>{
    const change=changes.find(item=>item.sourceId===ref.sourceId);
    const hint=change?.status==='updated'?'有 v'+change.latest.number:change?.status==='missing'?'素材已移出':change?.status==='unavailable'?'当前不可用':'';
    return `<div class="studio-asset-reference-row">${studioAssetThumb(ref)}<span class="studio-asset-reference-title">${esc(ref.sourceTitle)}</span><span class="studio-asset-version">v${ref.number}</span>${hint?`<small class="studio-asset-update">${esc(hint)}</small>`:''}</div>`;
  }).join('')}</div>`:'<p class="studio-asset-note">选择项目里的角色、场景或声音</p>'}${note?`<p class="studio-asset-note">${note}</p>`:''}</section>`;
}

function assetUsageSectionHtml(value) {
  const n = studioAssetCanonical(value);
  if (!n || !studioAssetSourceKinds.has(n.kind)) return '';
  const users=studioAssetUsers(n.id), shots=users.filter(item=>['shot','video'].includes(item.kind)).length;
  const label=users.length?(shots===users.length?`用于 ${shots} 个镜头`:`用于 ${users.length} 项内容`):'暂无引用';
  return `<section class="studio-asset-usage-summary"><span>${label}</span>${btn('查看引用','asset-usage:'+studioAssetActionId(n.id),'ghost')}</section>`;
}

function studioCandidateReferencesHtml(candidate) {
  if (!Array.isArray(candidate?.sourceReferences)) return '<p class="studio-asset-note studio-asset-candidate-note">旧版本未记录参考</p>';
  return `<div class="studio-asset-candidate-references"><span class="studio-asset-caption">制作参考</span>${candidate.sourceReferences.length?`<div class="studio-asset-chips">${candidate.sourceReferences.map(studioAssetReferenceChip).join('')}</div>`:'<p class="studio-asset-note">没有制作参考</p>'}</div>`;
}

function studioCandidateReferenceScopeHtml(value) {
  const n=studioAssetCanonical(value);
  if(!n || !studioAssetTargetKinds.has(n.kind)) return '';
  const refs=studioAssetReferenceSnapshot(n), changes=studioAssetReferenceChanges(n);
  const hint=changes.some(item=>item.status==='updated')?'有新版可选，本次仍用已锁定版本':changes.length?'部分参考已不可用，请先检查制作参考':'';
  return `<section class="studio-asset-scope"><span class="studio-asset-caption">本次制作参考</span>${refs.length?`<div class="studio-asset-chips">${refs.map(studioAssetReferenceChip).join('')}</div>`:'<p class="studio-asset-note">没有制作参考</p>'}${hint?`<p class="studio-asset-note">${hint}</p>`:''}</section>`;
}

function studioAssetNodeSourceLabel(value) {
  const n=studioAssetCanonical(value), output=studioAssetOutput(n);
  if(!output) return '尚未采用结果';
  if(!Array.isArray(output.sourceReferences)) return '参考版本未记录';
  return output.sourceReferences.length?output.sourceReferences.map(ref=>ref.sourceTitle+' v'+ref.number).join(' · '):'未使用参考素材';
}

function studioOpenAssetPicker(targetId, updateSourceId) {
  const n=nodeById(targetId);
  if(!n || !studioAssetTargetKinds.has(n.kind)) { toast('请选择镜头、视频或图片');return; }
  const locked=studioAssetReferenceSnapshot(n);
  studioAssetPickerState={project:S.project,targetId:n.id,locked:structuredClone(locked),refs:structuredClone(locked),query:'',category:'all',error:''};
  if(updateSourceId){const latest=studioAssetSourceSnapshot(updateSourceId);if(latest){const index=studioAssetPickerState.refs.findIndex(ref=>ref.sourceId===updateSourceId);if(index>=0)studioAssetPickerState.refs[index]=latest;else studioAssetPickerState.refs.push(latest);}}
  studioRenderAssetPicker();
}

function studioAssetPickerRows() {
  const state=studioAssetPickerState;
  if(!state) return '';
  const entries=S.nodes.filter(n=>studioAssetSourceKinds.has(n.kind)&&n.id!==state.targetId&&(!['video','shot'].includes(n.kind)||['video','shot'].includes(studioAssetNode(state.targetId)?.kind))).map(n=>({node:n,id:n.id,title:n.title,kind:n.kind}));
  for(const ref of state.refs) if(!entries.some(item=>item.id===ref.sourceId)) entries.push({node:null,id:ref.sourceId,title:ref.sourceTitle,kind:ref.sourceKind});
  const query=state.query.trim().toLocaleLowerCase();
  const filtered=entries.filter(item=>(state.category==='all'||(state.category==='sound'?['voice','audio'].includes(item.kind):state.category==='video'?['video','shot'].includes(item.kind):item.kind===state.category))&&(!query||(item.title+' '+studioAssetKindLabel(item.kind)+' '+studioAssetDescription(item.node)).toLocaleLowerCase().includes(query)));
  if(!filtered.length)return `<div class="studio-asset-empty" role="status">${I('folder')}<span>${query?'没有匹配的素材':'暂无此类素材'}</span>${query?'<button data-action="asset-picker-clear-search">清空搜索</button>':''}</div>`;
  return filtered.map(item=>{
    const selected=state.refs.find(ref=>ref.sourceId===item.id), locked=state.locked.find(ref=>ref.sourceId===item.id), latest=studioAssetSourceSnapshot(item.id);
    const ref=selected||latest||locked||{sourceKind:item.kind,frame:item.node?.frame||0};
    const options=[];
    if(locked)options.push({key:'locked',reference:locked,label:'已锁定 v'+locked.number});
    if(latest&&(!locked||latest.candidateId!==locked.candidateId||latest.number!==locked.number))options.push({key:'latest',reference:latest,label:'当前采用 v'+latest.number});
    if(!options.length&&latest)options.push({key:'latest',reference:latest,label:'当前采用 v'+latest.number});
    const selectedKey=selected&&locked&&selected.candidateId===locked.candidateId&&selected.number===locked.number?'locked':'latest';
    const inlineVersion=selected&&options.length<2?' · 锁定 v'+selected.number:selected&&latest&&selected.candidateId!==latest.candidateId?' · 有 v'+latest.number+' 可用':!selected&&latest?' · v'+latest.number:'';
    return `<div class="studio-asset-picker-row ${selected?'selected':''}"><label class="studio-asset-pick-label"><input type="checkbox" data-studio-asset-check="${esc(item.id)}" aria-label="引用 ${esc(item.title)}" ${selected?'checked':''} ${!latest&&!selected?'disabled':''}>${latest?studioAssetThumb(ref):studioAssetUnavailableThumb(item.kind)}<span class="studio-asset-pick-copy"><span title="${esc(item.title)}">${esc(item.title)}</span><small>${studioAssetKindLabel(item.kind)}${inlineVersion}${!item.node?' · 已移出项目':!latest?' · 尚无采用结果':''}</small></span></label><div class="studio-asset-picker-version">${selected&&options.length>1?`<select aria-label="${esc(item.title)}的参考版本" data-studio-asset-version="${esc(item.id)}">${options.map(option=>`<option value="${option.key}" ${option.key===selectedKey?'selected':''}>${option.label}</option>`).join('')}</select>`:''}</div></div>`;
  }).join('');
}

function studioRenderAssetPicker() {
  const state=studioAssetPickerState,n=nodeById(state?.targetId);
  if(!state||!n)return;
  showDialog('制作参考',`<div class="studio-asset-modal"><div class="studio-asset-target"><span>${esc(n.title)}</span><small>引用已有素材，不复制、不自动重做</small></div><div class="studio-asset-filters"><label class="studio-asset-search">${I('search')}<input id="studio-asset-search" aria-label="搜索参考素材" placeholder="搜索项目素材" value="${esc(state.query)}"><button type="button" data-action="asset-picker-clear-search" aria-label="清空素材搜索" ${state.query?'':'hidden'}>${I('close')}</button></label><select id="studio-asset-category" aria-label="筛选素材类型">${[['all','全部类型'],['character','角色'],['scene','场景'],['image','图片'],['sound','声音'],['video','视频']].map(([key,label])=>`<option value="${key}" ${state.category===key?'selected':''}>${label}</option>`).join('')}</select></div><div id="studio-asset-picker-list" class="studio-asset-picker-list">${studioAssetPickerRows()}</div><p id="studio-asset-picker-error" class="studio-asset-error" role="alert">${esc(state.error)}</p><div class="studio-asset-picker-more">${btn('添加示例素材','asset-picker-examples','ghost','plus')}</div></div>`,`<span class="note" id="studio-asset-selected-count">已选 ${state.refs.length} 项</span>${btn('取消','asset-picker-cancel','outline')}${btn('应用参考','asset-picker-apply','primary')}`,true);
  document.querySelector('#modal-root .dialog')?.classList.add('studio-asset-dialog','studio-asset-picker-dialog');
}

function studioRefreshAssetPickerRows() {
  const list=document.getElementById('studio-asset-picker-list');
  const active=document.activeElement;
  const focusKind=active?.dataset?.studioAssetCheck?'studioAssetCheck':active?.dataset?.studioAssetVersion?'studioAssetVersion':null;
  const focusId=focusKind?active.dataset[focusKind]:null;
  if(list)list.innerHTML=studioAssetPickerRows();
  if(list&&focusKind){const control=[...list.querySelectorAll('[data-studio-asset-check],[data-studio-asset-version]')].find(element=>element.dataset[focusKind]===focusId);control?.focus({preventScroll:true});}
  const clear=document.querySelector('[aria-label="清空素材搜索"]');
  if(clear)clear.hidden=!studioAssetPickerState.query;
  const count=document.getElementById('studio-asset-selected-count');
  if(count)count.textContent='已选 '+studioAssetPickerState.refs.length+' 项';
  const error=document.getElementById('studio-asset-picker-error');
  if(error)error.textContent=studioAssetPickerState.error||'';
}

function studioApplyAssetPicker() {
  const state=studioAssetPickerState,n=nodeById(state?.targetId);
  if(!state||state.project!==S.project||!n){toast('项目已切换，请重新选择参考');return;}
  const result=studioApplyCanvasReferences(n,state.refs);
  if(!result.ok){state.error=result.error;studioRefreshAssetPickerRows();return;}
  studioAssetPickerState=null;closeDialog();render();save();toast(result.changed?'制作参考已更新，原画面保持不变':'制作参考未改变');
}

function studioOpenAssetUsage(sourceId) {
  const source=nodeById(sourceId);
  if(!source){toast('素材已不在当前项目');return;}
  const latest=studioAssetSourceSnapshot(source),users=studioAssetUsers(sourceId);
  showDialog('素材引用',`<div class="studio-asset-modal"><div class="studio-asset-target"><span>${esc(source.title)}</span><small>${latest?'当前采用 v'+latest.number:'尚无采用结果'} · 共 ${users.length} 处引用</small></div>${users.length?`<div class="studio-asset-usage-list">${users.map(n=>{
    const ref=studioAssetReferenceSnapshot(n).find(item=>item.sourceId===sourceId),changed=latest&&ref&&latest.candidateId!==ref.candidateId;
    return `<div class="studio-asset-usage-row"><div class="studio-asset-usage-copy"><span>${esc(n.title)}</span><small>锁定 v${ref?.number||'?'}${changed?' · 有 v'+latest.number+' 可用':''}</small></div><div class="studio-asset-usage-actions">${btn('定位','asset-locate:'+studioAssetActionId(n.id),'ghost')}${btn(changed?'更新参考':'查看参考','asset-picker-update:'+studioAssetActionId(n.id)+':'+studioAssetActionId(changed?sourceId:''),'ghost')}</div></div>`;
  }).join('')}</div>`:'<p class="studio-asset-empty">尚未被镜头或其他内容引用</p>'}<p class="studio-asset-note">更新参考后，已有画面继续保留；需要新画面时再准备候选</p></div>`,btn('关闭','close-modal','outline'),true);
  document.querySelector('#modal-root .dialog')?.classList.add('studio-asset-dialog');
}

function studioFindExampleAsset(example) {
  return S.nodes.find(n=>n.catalogId===example.catalogId || (example.legacyId&&n.id===example.legacyId&&n.kind===example.kind));
}

function studioAssetLibraryCards() {
  const state=studioAssetLibraryState;
  if(!state)return '';
  const query=state.query.trim().toLocaleLowerCase(), examples=state.tab==='examples';
  const entries=examples?studioExampleAssets:S.nodes.filter(n=>studioAssetSourceKinds.has(n.kind));
  const filtered=entries.filter(n=>!query||(n.title+' '+studioAssetDescription(n)+' '+n.label).toLocaleLowerCase().includes(query));
  if(!filtered.length)return `<div class="studio-asset-empty" role="status">${I('folder')}<span>${query?'没有匹配的素材':'暂无此类素材'}</span>${query?'<button data-action="asset-picker-clear-search">清空搜索</button>':''}</div>`;
  return `<div class="studio-asset-library-grid">${filtered.map(item=>{
    const existing=examples?studioFindExampleAsset(item):item,ref=existing?studioAssetSourceSnapshot(existing):null;
    const display=ref||{sourceKind:item.kind,frame:item.frame};
    return `<article class="studio-asset-library-card">${existing&&!ref?studioAssetUnavailableThumb(existing.kind):studioAssetThumb(display)}<div class="studio-asset-library-copy"><h3>${esc(existing?.title||item.title)}</h3><span>${esc(existing?.label||item.label||studioAssetKindLabel(item.kind))}${ref?' · v'+ref.number:existing?' · 尚无采用结果':' · 示例素材'}</span><p>${esc(existing?studioAssetDescription(existing):item.description||'')}</p></div><div class="studio-asset-library-actions">${existing?`${btn('定位','asset-locate:'+studioAssetActionId(existing.id),'ghost')}${btn('查看引用','asset-usage:'+studioAssetActionId(existing.id),'ghost')}`:btn('加入项目','asset-example-add:'+item.catalogId,'outline','plus')}</div></article>`;
  }).join('')}</div>`;
}

function studioRenderAssetLibrary() {
  const state=studioAssetLibraryState;
  showDialog('项目资产',`<div class="studio-asset-modal"><div class="studio-asset-library-top"><div class="segmented" role="tablist" aria-label="资产来源">${[['project','当前项目'],['examples','示例素材']].map(([key,label])=>`<button role="tab" aria-selected="${state.tab===key}" class="${state.tab===key?'active':''}" data-action="asset-library-tab:${key}">${label}</button>`).join('')}</div><label class="studio-asset-search">${I('search')}<input id="studio-asset-library-search" aria-label="搜索资产" placeholder="搜索资产" value="${esc(state.query)}"></label></div><p class="studio-asset-note studio-asset-library-note">${state.tab==='examples'?'示例画面仅用于体验，同一素材只加入一次':'这里是当前项目实际素材，引用时不复制'}</p><div id="studio-asset-library-cards">${studioAssetLibraryCards()}</div></div>`,state.returnPicker?btn('返回制作参考','asset-picker-resume','primary'):btn('关闭','close-modal','outline'),true);
  document.querySelector('#modal-root .dialog')?.classList.add('studio-asset-dialog');
}

function openStudioAssetLibrary() {
  const target=nodeById(S.selected);
  if(target&&studioAssetTargetKinds.has(target.kind)){studioOpenAssetPicker(target.id);return;}
  studioAssetLibraryState={tab:'project',query:'',returnPicker:false};studioRenderAssetLibrary();
}

/** Place added content without moving or covering existing nodes. */
function studioNewContentPosition(width, height) {
  const viewport=document.getElementById('viewport');
  const origin=viewport?{x:(viewport.clientWidth/2-S.pan.x)/S.zoom-width/2,y:(viewport.clientHeight/2-S.pan.y)/S.zoom-height/2}:{x:414,y:96};
  const fits=(x,y)=>S.nodes.every(node=>{const actualHeight=document.querySelector(`[data-node="${node.id}"]`)?.offsetHeight||node.h;return x+width+24<=node.x||x>=node.x+node.w+24||y+height+24<=node.y||y>=node.y+actualHeight+24;});
  for(let ring=0;ring<=8;ring++)for(let row=-ring;row<=ring;row++)for(let col=-ring;col<=ring;col++){
    if(Math.max(Math.abs(row),Math.abs(col))!==ring)continue;
    const x=Math.round(origin.x+col*(width+24)),y=Math.round(origin.y+row*(height+24));
    if(fits(x,y))return {x,y};
  }
  return {x:Math.max(0,...S.nodes.map(node=>node.x+node.w))+24,y:origin.y};
}

function studioAddExampleAsset(catalogId) {
  const example=studioExampleAssets.find(item=>item.catalogId===catalogId);
  if(!example)return;
  if(studioFindExampleAsset(example)){toast('此素材已在项目中');studioRenderAssetLibrary();return;}
  const viewport=document.getElementById('viewport'),id='asset-'+example.catalogId;
  const n={id,catalogId:example.catalogId,kind:example.kind,label:example.label,title:example.title,description:example.description,prompt:example.description,frame:example.frame,status:'已采用',x:viewport?(viewport.clientWidth/2-S.pan.x)/S.zoom-124:414,y:viewport?(viewport.clientHeight/2-S.pan.y)/S.zoom-138:96,w:248,h:276};
  Object.assign(n,studioNewContentPosition(n.w,n.h));
  if(example.kind==='image'){n.assetRole='prop';n.assetReferences=[];}
  S.nodes.push(n);
  const candidate=candidateSnapshot(n,1,{id:id+'-imported-1',sourceReferences:[]});n.candidates=[candidate];n.adoptedCandidateId=candidate.id;
  S.history.push({type:'asset-added',nodeId:n.id,nodeTitle:n.title,catalogId:example.catalogId,createdAt:new Date().toISOString()});S.revision++;
  render();save();studioRenderAssetLibrary();toast('已加入项目，可在制作参考中选用');
}

function studioConnectAssetReference(from, to) {
  const source=studioAssetCanonical(from),target=studioAssetCanonical(to);
  if(!source||!studioAssetSourceKinds.has(source.kind))return {handled:false,ok:false};
  const refs=target&&studioAssetTargetKinds.has(target.kind)?studioAssetReferenceSnapshot(target):[];
  if(refs.some(ref=>ref.sourceId===source.id))return {handled:true,ok:true,changed:false};
  const next=[...refs,studioAssetSourceSnapshot(source)||source.id];
  const result=studioApplyCanvasReferences(target,next);
  if(result.ok&&result.changed)save();
  return {handled:true,ok:result.ok,changed:result.changed,error:result.error};
}

function handleStudioAssetAction(action) {
  const [key,...parts]=String(action).split(':');
  if(!key.startsWith('asset-'))return false;
  const first=parts[0]?decodeURIComponent(parts[0]):'';
  switch(key){
    case'asset-picker':studioOpenAssetPicker(first);return true;
    case'asset-picker-update':studioOpenAssetPicker(first,parts[1]?decodeURIComponent(parts[1]):'');return true;
    case'asset-picker-clear-search':if(studioAssetPickerState){studioAssetPickerState.query='';const input=document.getElementById('studio-asset-search');if(input)input.value='';studioRefreshAssetPickerRows();input?.focus({preventScroll:true});}return true;
    case'asset-picker-apply':studioApplyAssetPicker();return true;
    case'asset-picker-cancel':studioAssetPickerState=null;closeDialog();return true;
    case'asset-picker-examples':studioAssetLibraryState={tab:'examples',query:'',returnPicker:true};studioRenderAssetLibrary();return true;
    case'asset-picker-resume':if(studioAssetPickerState?.project===S.project)studioRenderAssetPicker();else openStudioAssetLibrary();return true;
    case'asset-usage':studioOpenAssetUsage(first);return true;
    case'asset-locate':closeDialog();if(S.screen!=='canvas'){S.screen='canvas';location.hash='canvas';render();}focusNode(first);return true;
    case'asset-library-tab':if(studioAssetLibraryState){studioAssetLibraryState.tab=first==='examples'?'examples':'project';studioAssetLibraryState.query='';studioRenderAssetLibrary();}return true;
    case'asset-example-add':studioAddExampleAsset(first);return true;
    default:return false;
  }
}

document.addEventListener('input',event=>{
  if(event.target.id==='studio-asset-search'&&studioAssetPickerState){studioAssetPickerState.query=event.target.value;studioRefreshAssetPickerRows();}
  if(event.target.id==='studio-asset-library-search'&&studioAssetLibraryState){studioAssetLibraryState.query=event.target.value;const list=document.getElementById('studio-asset-library-cards');if(list)list.innerHTML=studioAssetLibraryCards();}
});
document.addEventListener('change',event=>{
  const state=studioAssetPickerState,element=event.target;
  if(!state)return;
  if(element.id==='studio-asset-category'){state.category=element.value;studioRefreshAssetPickerRows();return;}
  const sourceId=element.dataset?.studioAssetCheck;
  if(sourceId){
    state.error='';
    if(element.checked){const ref=state.locked.find(item=>item.sourceId===sourceId)||studioAssetSourceSnapshot(sourceId);if(ref&&!state.refs.some(item=>item.sourceId===sourceId))state.refs.push(structuredClone(ref));}
    else state.refs=state.refs.filter(item=>item.sourceId!==sourceId);
    studioRefreshAssetPickerRows();return;
  }
  const versionId=element.dataset?.studioAssetVersion;
  if(versionId){const ref=element.value==='locked'?state.locked.find(item=>item.sourceId===versionId):studioAssetSourceSnapshot(versionId);const index=state.refs.findIndex(item=>item.sourceId===versionId);if(ref&&index>=0)state.refs[index]=structuredClone(ref);state.error='';studioRefreshAssetPickerRows();}
});
