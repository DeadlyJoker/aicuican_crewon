/* Full-screen series reading and asset review. The original editor still owns applied episode-one edits. */
'use strict';
const referenceEditScript=openScriptWorkbench;
const referenceWorkbenchAction=handleAction;
let referenceWorkbench={nodeId:null,tab:'script',section:'body',episodeId:null,assetScope:'all',assetCategory:'character',scrolls:{}};
scriptNodeBody=function(n){
 const series=ensureStudioSeries(n),episode=studioSeriesEpisodes(n)[0];
 const preview=episode?.document?.scenes?.map(scene=>`【${scene.title}】\n${scene.shots.map(shot=>[shot.action||shot.title,shot.dialogue].filter(Boolean).join('\n')).join('\n')}`).join('\n\n')||series.logline;
 return `<div class="node-content script-summary"><div class="ref-script-series-state"><span>共 ${series.episodes.length} 集</span><span>${studioSeriesEpisodes(n).every(studioSeriesEpisodeReady)?'剧本已整理':'部分剧本待创作'}</span></div><p class="script-summary-logline">${esc(preview)}</p></div><div class="ref-script-open">${btn('打开剧本','script-open:'+n.id,'outline')}</div>`;
};
openScriptWorkbench=function(nodeId){
 const n=nodeById(nodeId);if(!ensureStudioScript(n))return;const series=ensureStudioSeries(n);
 const previous=referenceWorkbench;
 referenceWorkbench=previous.nodeId===nodeId&&previous.project===S.project?{...previous,opener:document.activeElement}:{nodeId,project:S.project,tab:series.stage==='storyboard'?'storyboard':series.stage==='assets'?'assets':'script',section:'body',episodeId:series.episodes[0].id,assetScope:'all',assetCategory:'character',scrolls:{},opener:document.activeElement};referenceDrawWorkbench();save();
};
function referenceWorkbenchScriptLocked(n){return ['assets','storyboard'].includes(ensureStudioSeries(n).stage);}
function referenceWorkbenchReadMode(n){const locked=referenceWorkbenchScriptLocked(n);return `<details class="ref-wb-readonly"><summary>${I(locked?'shield':'eye')}${locked?'只读':'阅读模式'}</summary><div>${locked?'已进入资产或分镜阶段，剧本已锁定，不可修改。':'当前为阅读视图，可通过右上角编辑入口修改首集草稿。'}</div></details>`;}
function referenceWorkbenchScrollKey(){const w=referenceWorkbench;return w.tab+'/'+w.section+'/'+(w.tab==='assets'?w.assetScope+'/'+w.assetCategory:w.episodeId)}
function referenceRememberWorkbenchScroll(){const pane=document.querySelector('.ref-wb-scroll');if(pane)referenceWorkbench.scrolls[referenceWorkbenchScrollKey()]=pane.scrollTop}
/** Return to the unchanged canvas camera; only explicit object links reposition it. */
function referenceReturnToCanvas(){
 referenceRememberWorkbenchScroll();closeDialog();render();
 const opener=referenceWorkbench.opener?.isConnected?referenceWorkbench.opener:document.querySelector(`[data-action="script-open:${referenceWorkbench.nodeId}"]`);
 opener?.focus({preventScroll:true});
}
function referenceEpisodeBody(episode){
 const doc=episode.document;
 if(!studioSeriesEpisodeReady(episode))return `<div class="ref-wb-pending"><h1>第 ${episode.number} 集</h1><p>本集尚未创作</p><small>当前 Demo 只展示已有正文，不复制其他集的内容填充</small></div>`;
 return `<article class="ref-wb-document">${iconBtn('复制当前集','ref-wb-copy','copy')}<h1>第 ${episode.number} 集：${esc(doc.title)}</h1>${doc.legacyText?`<p>${esc(doc.legacyText)}</p>`:''}${doc.scenes.map((scene,i)=>`<section><h3>【${episode.number}-${i+1}｜${esc(scene.title)}】</h3>${scene.shots.map(shot=>`<p>（${esc(shot.action||shot.title)}）</p>${shot.dialogue?`<blockquote>${esc(shot.dialogue)}</blockquote>`:''}`).join('')}</section>`).join('')}</article>`;
}
function referenceSeriesOutline(n){
 const series=ensureStudioSeries(n);
 return `<div class="ref-wb-series-outline"><h1>《${esc(series.title)}》分集大纲（第 1–${series.episodes.length} 集）</h1><p class="ref-wb-outline-intro">单集预计时长 ${series.targetSeconds.min}–${series.targetSeconds.max} 秒，时长依据当前剧本估算。</p>${studioSeriesEpisodes(n).map(ep=>`<article class="ref-wb-outline-card" aria-label="第 ${ep.number} 集大纲"><header><span class="ref-wb-episode-number">${String(ep.number).padStart(2,'0')}</span><h2>${esc(ep.document.title)}</h2><span class="ref-wb-body-state">${studioSeriesEpisodeReady(ep)?'已有正文':'待创作'}</span>${btn('查看正文','ref-wb-open-episode:'+ep.id,'ghost')}</header>${studioSeriesEpisodeReady(ep)?`<p>预计时长：约 ${studioSeriesEpisodeSeconds(ep)} 秒</p><p>核心事件：${esc(ep.outline?.event||ep.document.logline)}</p>${ep.outline?.conflict?`<p>主要冲突：${esc(ep.outline.conflict)}</p>`:''}${ep.outline?.hook?`<p>集尾钩子：${esc(ep.outline.hook)}</p>`:''}`:'<p>尚未创作，保留本集的位置与独立记录。</p>'}</article>`).join('')}</div>`;
}
function referenceSeriesSetting(n){
 const series=ensureStudioSeries(n),assets=studioSeriesAssetsFor(n),spec=S.referenceCreationSpec;
 return `<article class="ref-wb-document ref-wb-setting-document"><h1>《${esc(series.title)}》故事设定</h1><dl class="ref-wb-setting-facts"><div><dt>集数</dt><dd>共 ${series.episodes.length} 集</dd></div><div><dt>题材</dt><dd>${esc(spec?.genre||'未设定')}</dd></div><div><dt>风格</dt><dd>${esc(spec?.style&&spec.style!=='风格'?spec.style:'未设定')}</dd></div></dl><section id="ref-setting-position"><h2>故事定位</h2><p>${esc(series.setting||series.logline)}</p></section><section id="ref-setting-logline"><h2>一句话故事</h2><p>${esc(series.logline)}</p></section><section id="ref-setting-overview"><h2>故事梗概</h2><p>${esc(studioSeriesEpisodes(n).filter(studioSeriesEpisodeReady).map(ep=>ep.outline?.event||ep.document.logline).join('\n\n'))}</p></section><section id="ref-setting-characters"><h2>主要角色人物小传</h2>${assets.filter(a=>studioSeriesCategory(a)==='character').map(a=>`<h3>${esc(a.title)}</h3><p>${esc(a.description||a.prompt||'尚未填写角色描述')}</p>`).join('')}</section></article>`;
}
function referenceWorkbenchAssetCard(script,asset,workbench){
 const adopted=studioAdoptedCandidate(asset),ready=!!adopted&&!asset.referenceOnly;
 const label=workbench.assetCategory==='character'?referenceAssetVariantLabel(S,asset,false):workbench.assetCategory==='scene'?'场景':'道具';
 const editLabel=workbench.assetCategory==='character'?'编辑角色':workbench.assetCategory==='scene'?'编辑场景':'编辑道具';
 const variants=workbench.assetCategory==='character'?S.nodes.filter(n=>n.variantOf===(asset.variantOf||asset.id)).length:0;
 const shots=referenceAssetShotLabels(S,script,asset.id,workbench.assetScope),shotText='分镜：'+(shots.length?shots.join('、'):'—');
 return `<article class="ref-wb-asset-card" aria-label="${esc(asset.title)}"><header><span>${esc(label)}${variants?`<small>${variants} 个变体</small>`:''}</span></header><div class="ref-wb-asset-cover ${ready?'still frame'+adopted.frame:'ref-wb-asset-empty'}" role="img" aria-label="${esc(asset.title)}${ready?'的参考图':'暂无参考图'}">${ready?'':I('image')}</div><div class="ref-wb-asset-controls"><button disabled title="当前为样式 Demo，尚未连接生成服务">开始生成</button><button data-action="ref-wb-asset-upload:${asset.id}" title="上传本地图片">上传</button>${workbench.assetCategory==='character'?`<button class="ref-wb-card-voice" data-action="ref-wb-asset-voice:${asset.id}" aria-label="设置 ${esc(asset.title)} 的音色">${I('mic')}<span>${esc(asset.voicePreset?.name||'设置音色')}</span></button>`:''}</div><div class="ref-wb-asset-info"><div class="ref-wb-asset-info-text"><h3 title="${esc(asset.title)}">${esc(asset.title)}</h3><small title="${esc(shotText)}">${esc(shotText)}</small></div><button class="ref-wb-card-more" data-action="ref-wb-asset-edit:${asset.id}" aria-label="${editLabel}：${esc(asset.title)}" title="${editLabel}">${I('more')}</button></div></article>`;
}
function referenceWorkbenchAssets(n){
 const w=referenceWorkbench,series=ensureStudioSeries(n),episodes=studioSeriesEpisodes(n),assets=referenceArrangeAssetCards(studioSeriesAssetsFor(n,w.assetScope,w.assetCategory));
 return `<main class="ref-wb-asset-workspace"><header class="ref-wb-asset-filters"><div class="ref-wb-asset-selection"><label class="ref-wb-scope"><select aria-label="资产范围" data-ref-wb-scope><option value="all" ${w.assetScope==='all'?'selected':''}>全剧</option>${episodes.map(ep=>`<option value="${ep.id}" ${w.assetScope===ep.id?'selected':''}>第${ep.number}集</option>`).join('')}</select></label><div class="ref-wb-asset-categories">${[['character','角色'],['scene','场景'],['prop','道具']].map(([k,label])=>`<button aria-pressed="${w.assetCategory===k}" class="${w.assetCategory===k?'active':''}" data-action="ref-wb-asset-category:${k}">${I({character:'user',scene:'image',prop:'asset-prop'}[k])}<span>${label}</span><small>${studioSeriesAssetsFor(n,w.assetScope,k).length}</small></button>`).join('')}</div></div><div class="ref-wb-toolbar-actions"><button disabled>重新解析资产</button><button class="button ghost ref-wb-edit-canvas" data-action="ref-wb-edit-canvas" aria-label="去画布编辑" title="去画布编辑">${I('edit')}<span>去画布编辑</span></button></div><div class="ref-wb-asset-creation">${referenceAssetImageModelPicker(series.assetImageDraft||{})}${referenceImageParametersHtml(series.assetImageDraft||{},'assets')}<span class="top-spacer"></span><button class="ref-wb-generate-disabled" disabled>生成主角色、场景和道具图</button></div></header><div class="ref-wb-scroll ref-wb-assets-scroll" role="region" aria-label="资产内容" tabindex="0"><p class="ref-wb-assets-style">风格：${esc(S.referenceCreationSpec?.style&&S.referenceCreationSpec.style!=='风格'?S.referenceCreationSpec.style:'未设定')}</p><section class="ref-wb-assets" aria-label="${{character:'角色',scene:'场景',prop:'道具'}[w.assetCategory]}列表">${assets.map(a=>referenceWorkbenchAssetCard(n,a,w)).join('')}<button class="ref-wb-add-asset" ${referenceSeriesAssetAddLocked(n)?'disabled title="分镜解析完成后可新增资产"':''} data-action="ref-wb-asset-add" aria-label="添加${{character:'角色',scene:'场景',prop:'道具'}[w.assetCategory]}">${I('plus')}</button></section></div><footer class="ref-wb-assets-handoff"><span class="ref-wb-handoff-hint">${I('film')}<span>角色、场景和道具将应用于全剧，确认后继续</span></span><button class="button" data-action="${referenceSeriesAssetsLocked(n)?'ref-wb-tab:storyboard':'ref-wb-confirm-assets'}">${referenceSeriesAssetsLocked(n)?'查看分镜':'确认资产'}${I('stage-next')}</button></footer></main>`;
}
function referenceDrawWorkbench(){
 const n=nodeById(referenceWorkbench.nodeId);if(!n)return;
 const series=ensureStudioSeries(n),w=referenceWorkbench,episode=studioSeriesEpisode(n,w.episodeId),episodes=studioSeriesEpisodes(n),isBody=w.section==='body',isSetting=w.section==='setting';
 const body=w.tab==='storyboard'?referenceStoryboardPending(n):w.tab==='assets'?referenceWorkbenchAssets(n):`<main class="ref-wb-script-workspace"><header class="ref-wb-meta"><h2>剧本</h2><span>每集 ${series.targetSeconds.min}～${series.targetSeconds.max} 秒（允许 ±10%）</span><span class="ref-wb-status">已接受</span>${isBody?`<span>第 ${episode.number} 集</span>${studioSeriesEpisodeReady(episode)?`<span>预计 ${studioSeriesEpisodeSeconds(episode)} 秒（非成片实测）</span>`:''}`:''}${referenceWorkbenchReadMode(n)}<span class="top-spacer"></span><span>累计 ${episodes.map(ep=>studioSeriesEpisodeText(ep).replace(/\s/g,'').length).reduce((a,b)=>a+b,0)} 字</span></header><div class="ref-wb-sections"><div role="tablist" aria-label="剧本内容">${[['setting','故事设定'],['outline','分集大纲'],['body','剧本正文']].map(([key,label])=>`<button role="tab" aria-selected="${w.section===key}" tabindex="${w.section===key?0:-1}" class="${w.section===key?'active':''}" data-action="ref-wb-section:${key}">${label}</button>`).join('')}</div><span class="top-spacer"></span>${isBody?`${btn('下载全部','ref-wb-download-all','ghost','download')}${btn('下载当前集','ref-wb-download','ghost','download')}`:''}</div><div class="ref-wb-content ${w.section==='outline'?'ref-wb-content-wide':''}">${isBody?`<nav class="ref-wb-directory" aria-label="剧本目录"><small>剧本目录</small>${episodes.map(ep=>`<button class="${ep.id===episode.id?'active':''}" aria-current="${ep.id===episode.id?'page':'false'}" data-action="ref-wb-episode:${ep.id}">第 ${ep.number} 集</button>`).join('')}</nav>`:isSetting?`<nav class="ref-wb-directory" aria-label="本页目录"><small>本页目录</small>${[['position','故事定位'],['logline','一句话故事'],['overview','故事梗概'],['characters','主要角色人物小传']].map(([id,label])=>`<button data-action="ref-wb-anchor:${id}">${label}</button>`).join('')}</nav>`:''}<div class="ref-wb-scroll" role="tabpanel" aria-label="${{setting:'故事设定',outline:'分集大纲',body:'剧本正文'}[w.section]}">${isBody?referenceEpisodeBody(episode):isSetting?referenceSeriesSetting(n):referenceSeriesOutline(n)}</div></div><div class="ref-wb-bottom">${I('layers')}<span>剧本已整理完成，开始拆解全剧资产</span>${btn('解析资产','ref-wb-tab:assets','outline')}</div></main>`;
 const root=showDialog('剧本工作台',`<div class="ref-workbench"><header class="ref-wb-header">${btn('剧本工作台','close-modal','ghost','back')}<nav role="tablist" aria-label="剧本工作台">${[['script','剧本','file'],['assets','资产','layers'],['storyboard','分镜','film']].map(([key,label,icon])=>`<button role="tab" aria-selected="${w.tab===key}" tabindex="${w.tab===key?0:-1}" ${key==='storyboard'&&!referenceSeriesAssetsLocked(n)?'disabled':''} class="${w.tab===key?'active':''}" data-action="ref-wb-tab:${key}">${I(icon)}${label}</button>`).join('')}</nav><div class="ref-wb-header-actions">${w.tab==='script'&&episode.primary&&!referenceWorkbenchScriptLocked(n)?iconBtn('编辑当前集草稿','ref-wb-edit','edit'):''}${iconBtn('返回画布','close-modal','layout')}</div></header>${body}</div>`);
 root.querySelector('.dialog').classList.add('ref-workbench-dialog');root.querySelector('.dialog > .dialog-header').remove();modalOpener=w.opener;
 const pane=root.querySelector('.ref-wb-scroll');if(pane)pane.scrollTop=w.scrolls[referenceWorkbenchScrollKey()]||0;
 root.querySelector('.ref-wb-header button')?.focus({preventScroll:true});
}
function referenceDownloadScript(n,all){
 const entries=all?studioSeriesEpisodes(n):[studioSeriesEpisode(n,referenceWorkbench.episodeId)];
 const text=entries.map(ep=>studioSeriesEpisodeReady(ep)?studioSeriesEpisodeText(ep):'第 '+ep.number+' 集：尚未创作').join('\n\n\n');
 const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=ensureStudioSeries(n).title+(all?'·全部剧本':'·第'+entries[0].number+'集')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}
handleAction=function(action){
 const [key,...args]=action.split(':'),value=args.join(':');
 if(key==='ref-wb-tab'){if(value==='storyboard'&&!referenceSeriesAssetsLocked(nodeById(referenceWorkbench.nodeId)))return;referenceRememberWorkbenchScroll();referenceWorkbench.tab=value;referenceDrawWorkbench();document.querySelector(`[data-action="ref-wb-tab:${value}"]`)?.focus({preventScroll:true});return}
 if(key==='ref-wb-confirm-assets'){showDialog('确认资产并进入分镜解析？','<p>资产确认后将进入分镜解析阶段，解析期间不能新增资产；解析完成后可以新增角色、场景和道具，已有资产不可删除。请确认后继续。</p>',btn('取消','ref-wb-confirm-cancel','outline')+btn('确认并继续','ref-wb-confirm-commit','primary'));return;}
 if(key==='ref-wb-confirm-cancel'){referenceDrawWorkbench();return;}
 if(key==='ref-wb-confirm-commit'){const n=nodeById(referenceWorkbench.nodeId),result=referenceConfirmSeriesAssets(n,studioSeriesAssetsFor(n,'all'),new Date().toISOString());if(!result.ok){toast(result.error);referenceDrawWorkbench();return;}S.revision+=result.changed?1:0;persist();referenceWorkbench.tab='storyboard';referenceDrawWorkbench();return;}
 if(key==='ref-wb-section'){referenceRememberWorkbenchScroll();referenceWorkbench.section=value;referenceDrawWorkbench();document.querySelector(`[data-action="ref-wb-section:${value}"]`)?.focus({preventScroll:true});return}
 if(key==='ref-wb-episode'||key==='ref-wb-open-episode'){referenceRememberWorkbenchScroll();referenceWorkbench.tab='script';referenceWorkbench.section='body';referenceWorkbench.episodeId=value;referenceDrawWorkbench();return}
 if(key==='ref-wb-asset-category'){referenceRememberWorkbenchScroll();referenceWorkbench.assetCategory=value;referenceDrawWorkbench();return}
 if(key==='ref-wb-edit'){const ep=studioSeriesEpisode(nodeById(referenceWorkbench.nodeId),referenceWorkbench.episodeId);if(!ep.primary||referenceWorkbenchScriptLocked(nodeById(referenceWorkbench.nodeId)))return;const id=referenceWorkbench.nodeId;closeDialog();referenceEditScript(id);return}
 if(key==='ref-wb-focus'){closeDialog();focusNode(value);return}
 if(key==='ref-wb-edit-canvas'||key==='close-modal'&&document.querySelector('.ref-workbench')){referenceReturnToCanvas();return}
 if(key==='ref-wb-copy'){const n=nodeById(referenceWorkbench.nodeId),episode=studioSeriesEpisode(n,referenceWorkbench.episodeId);navigator.clipboard.writeText(studioSeriesEpisodeText(episode)).then(()=>toast('已复制当前集')).catch(error=>{toast('复制失败，请使用下载当前集')});return}
 if(key==='ref-wb-download'||key==='ref-wb-download-all'){referenceDownloadScript(nodeById(referenceWorkbench.nodeId),key==='ref-wb-download-all');return}
 if(key==='ref-wb-anchor'){const pane=document.querySelector('.ref-wb-scroll'),target=document.getElementById('ref-setting-'+value);if(pane&&target)pane.scrollTo({top:target.getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop-18,behavior:'smooth'});return}
 referenceWorkbenchAction(action);
};
document.addEventListener('change',event=>{if(event.target.matches('[data-ref-wb-scope]')){referenceRememberWorkbenchScroll();referenceWorkbench.assetScope=event.target.value;referenceDrawWorkbench()}});
document.addEventListener('click',event=>{for(const hint of document.querySelectorAll('.ref-wb-readonly[open]'))if(!hint.contains(event.target))hint.open=false;},true);
document.addEventListener('click',event=>{
 if(event.target.id!=='overlay'||!document.querySelector('.ref-workbench'))return;
 event.preventDefault();event.stopImmediatePropagation();referenceReturnToCanvas();
},true);
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 const hint=document.querySelector('.ref-wb-readonly[open]');
 if(hint){event.preventDefault();event.stopImmediatePropagation();hint.open=false;hint.querySelector('summary')?.focus({preventScroll:true});return;}
 if(document.querySelector('.ref-workbench')&&!document.querySelector('.ref-wb-asset-overlay,.ref-wb-library-overlay,.ref-wb-voice-popover'))referenceRememberWorkbenchScroll();
},true);
render();

document.addEventListener('change',event=>{if(event.target.matches('[data-ref-storyboard-episode]')){referenceWorkbench.episodeId=event.target.value;referenceDrawWorkbench();}});


/** Keep keyboard navigation within the active workbench tab group. */
document.addEventListener('keydown',event=>{
 const tab=event.target.closest('.ref-workbench [role="tab"]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=[...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')].filter(item=>!item.disabled),index=tabs.indexOf(tab);if(index<0)return;
 const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
 event.preventDefault();event.stopImmediatePropagation();next.click();
},true);
