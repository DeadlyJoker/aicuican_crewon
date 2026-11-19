/* Storyboard previews derive only from the local script; they are not remote generation results. */
'use strict';
const referenceStoryboardFields=[['color','色彩基调'],['description','画面描述'],['blocking','角色走位'],['lighting','光影氛围'],['performance','表演基调'],['dialogue','对白'],['sound','音效'],['prompt','分镜视频提示词']];
let referenceStoryboardSelected=null,referenceStoryboardEdit=null,referenceStoryboardBuildScope='episode',referenceStoryboardAssetsExpanded=false;
function referenceBuildLocalStoryboard(episode,mode,assets=[]){
 const max=mode==='standard'?15:30,groups=[];
 if(!episode?.document?.scenes?.length)return {ok:false,error:'本集没有可拆解的正文，未生成示例'};
 for(const scene of episode.document.scenes){let group=null;for(const shot of scene.shots){
  const seconds=Number(shot.seconds);if(!Number.isFinite(seconds)||seconds<=0||seconds>max)return {ok:false,error:'单镜时长超出当前合并模式，请先调整剧本时长'};
  if(!group||group.seconds+seconds>max){group={id:scene.id+'-group-'+groups.length,sceneTitle:scene.title,seconds:0,segments:[],prompt:''};groups.push(group);}
  group.segments.push({id:shot.id,title:shot.title,seconds,fields:{color:shot.storyboardFields?.color||'',description:shot.action||'',blocking:shot.storyboardFields?.blocking||'',lighting:shot.storyboardFields?.lighting||'',performance:shot.storyboardFields?.performance||'',dialogue:shot.dialogue||'',sound:shot.storyboardFields?.sound||'',prompt:shot.storyboardFields?.prompt||[shot.title,shot.action,shot.dialogue].filter(Boolean).join('\n')}});group.seconds+=seconds;
 }}
 if(!groups.length)return {ok:false,error:'本集没有镜头内容'};
 for(const group of groups){group.prompt=group.segments.map(s=>s.fields.prompt).join('\n\n');group.mentionedAssetIds=referenceStoryboardMentionIds(group,assets);}
 return {ok:true,result:{revision:1,mode,groups,versions:[]}};
}
/** Validate all selected episodes before replacing any saved storyboard result. */
function referenceBuildStoryboardEpisodes(episodes,mode,previous={},assets=[]){
 if(!['standard','adaptive'].includes(mode))return {ok:false,error:'请选择有效的视频合并模式'};
 const next=structuredClone(previous);
 for(const episode of episodes){
  const built=referenceBuildLocalStoryboard(episode,mode,assets);if(!built.ok)return {ok:false,error:'第'+episode.number+'集：'+built.error};
  const old=previous[episode.id];if(old)built.result.versions=[...(old.versions||[]),{revision:old.revision,groups:structuredClone(old.groups)}];
  built.result.revision=(old?.revision||0)+1;next[episode.id]=built.result;
 }
 return {ok:true,results:next};
}
function referenceSaveStoryboardGroup(result,groupId,draft,assets=null){
 const group=result.groups.find(g=>g.id===groupId);if(!group||draft.id!==groupId)return {ok:false,error:'当前镜头组已变化，未保存修改'};
 const allowed=new Set(referenceStoryboardFields.map(([key])=>key));
 if(draft.segments.length!==group.segments.length||draft.segments.some((s,i)=>s.id!==group.segments[i].id||Object.keys(s.fields).some(key=>!allowed.has(key))))return {ok:false,error:'镜头字段不匹配，未保存修改'};
 if(group.prompt===draft.prompt&&group.segments.every((segment,index)=>JSON.stringify(segment.fields)===JSON.stringify(draft.segments[index].fields)))return {ok:true,changed:false};
 result.versions.push({revision:result.revision,groups:structuredClone(result.groups)});result.revision++;
 if(assets)group.mentionedAssetIds=referenceStoryboardMentionIds(draft,assets);
 group.prompt=draft.prompt;group.segments=draft.segments.map((segment,index)=>({...group.segments[index],fields:structuredClone(segment.fields)}));return {ok:true,changed:true};
}
/** Render only an adopted image; unmade assets retain a visible empty state. */
function referenceStoryboardAssetMarkup(asset){
 const candidate=studioAdoptedCandidate(asset),ready=Boolean(candidate&&!asset.referenceOnly);
 return `<button class="ref-sb-asset" ${ready?`data-sb-preview="${asset.id}" data-preview-title="${esc(asset.title)}"`:'disabled'} aria-label="查看 ${esc(asset.title)}"><span class="ref-sb-asset-image ${ready?'still frame'+candidate.frame:'ref-sb-asset-empty'}">${ready?'':I('image')}</span><span class="ref-sb-asset-name" title="${esc(asset.title)}">${esc(asset.title)}</span>${ready?'':'<small>暂无参考图</small>'}</button>`;
}
function referenceStoryboardMentionHtml(text,assets){
 return referenceStoryboardMentions(text,assets).map(part=>{
  if(!part.assetId)return esc(part.text);
  const asset=assets.find(item=>item.id===part.assetId),candidate=asset&&studioAdoptedCandidate(asset);
  const thumbnail=candidate&&!asset.referenceOnly?`<span class="ref-sb-mention-thumbnail still frame${candidate.frame}" aria-hidden="true"></span>`:'';
  return `<button class="ref-sb-mention" data-sb-mention="${part.assetId}" aria-expanded="false" aria-label="查看素材 ${esc(part.text)}">${thumbnail}${esc(part.text)}</button>`;
 }).join('');
}
/** Read the same current assets used by video-draft creation without changing saved results. */
function referenceStoryboardReferenceHtml(references){
 if(!references.length)return '<h4>【当前引用资产】</h4><p>暂无关联素材</p>';
 return '<h4>【当前引用资产】</h4><p>'+references.map(({node})=>{
  if(!node)return '<span>素材已移除</span>';
  const candidate=studioAdoptedCandidate(node),ready=!!candidate&&!node.referenceOnly;
  const status=ready?(Number.isInteger(candidate.number)?'v'+candidate.number:'版本未记录'):'暂无参考图';
  return referenceStoryboardMentionHtml('@'+node.title,[node])+' <small>'+status+'</small>';
 }).join('　')+'</p>';
}
/** Present the group prompt and editable segment prompts under one reading section. */
function referenceStoryboardPromptHtml(group,assets,references=[]){
 let elapsed=0;
 return `<h4>【整体镜头衔接】</h4><p>${referenceStoryboardMentionHtml(group.prompt||'未填写',assets)}</p><h4>【分段完整提示词】</h4>`+group.segments.map(segment=>{
  const start=elapsed;elapsed+=segment.seconds;
  return `<h4>【${start}–${elapsed}s ${esc(segment.title)}】</h4><p>${referenceStoryboardMentionHtml(segment.fields.prompt||'未填写',assets)}</p>`;
 }).join('')+referenceStoryboardReferenceHtml(references);
}
const referenceStoryboardPendingBase=referenceStoryboardPending;
referenceStoryboardPending=function(node){
 const episode=studioSeriesEpisode(node,referenceWorkbench.episodeId),result=node.scriptSeries.storyboardDemo?.[episode.id];if(!result)return referenceStoryboardPendingBase(node);
 const group=result.groups.find(g=>g.id===referenceStoryboardSelected)||result.groups[0];referenceStoryboardSelected=group.id;
 const editing=!!referenceStoryboardEdit,display=editing?referenceStoryboardEdit:group,ratio=S.referenceCreationSpec?.ratio||'16:9';
 const references=referenceStoryboardGroupAssets(S,group),assets=references.map(item=>item.node).filter(Boolean),scenes=assets.filter(a=>a.kind==='scene'),props=assets.filter(a=>a.assetCategory==='prop'),mentionAssets=studioSeriesAssetsFor(node,'all');
 const editRow=(label,value,attributes)=>`<tr><th scope="row">${esc(label)}</th><td><textarea ${attributes} aria-label="${esc(label)}" rows="1">${esc(value)}</textarea></td></tr>`;
 const fields=editing?`<section class="ref-sb-segment"><h3>整体镜头衔接</h3><table class="ref-sb-edit-table"><tbody>${editRow('整体镜头衔接',display.prompt,'data-sb-group-prompt')}</tbody></table></section>`+display.segments.map((s,index)=>`<section class="ref-sb-segment"><h3>【${display.segments.slice(0,index).reduce((a,x)=>a+x.seconds,0)}–${display.segments.slice(0,index+1).reduce((a,x)=>a+x.seconds,0)}s ${esc(s.title)}】</h3><table class="ref-sb-edit-table"><tbody>${referenceStoryboardFields.map(([key,label])=>editRow(label,s.fields[key],`data-sb-field="${key}" data-sb-segment="${index}" data-sb-label="${esc(s.title+' · '+label)}"`)).join('')}</tbody></table></section>`).join(''):referenceStoryboardFields.map(([key,label])=>`<section class="ref-sb-read-field"><h3>${label}</h3>${key==='prompt'?referenceStoryboardPromptHtml(group,mentionAssets,references):group.segments.map((s,i)=>`<p><span class="ref-sb-time">${group.segments.slice(0,i).reduce((a,x)=>a+x.seconds,0)}–${group.segments.slice(0,i+1).reduce((a,x)=>a+x.seconds,0)}s</span>${referenceStoryboardMentionHtml(s.fields[key]||'未填写',mentionAssets)}</p>`).join('')}</section>`).join('');
 return `<main class="ref-sb-result${referenceStoryboardAssetsExpanded?' is-assets-open':''}" data-sb-episode="${esc(episode.id)}" data-sb-group="${esc(group.id)}" data-sb-mode="${editing?'edit':'read'}"><header><select aria-label="选择单集" data-ref-storyboard-episode ${editing?'disabled':''}>${studioSeriesEpisodes(node).map(ep=>`<option value="${ep.id}" ${ep.id===episode.id?'selected':''}>${node.scriptSeries.storyboardDemo?.[ep.id]?'已有示例':'待解析'} 第${ep.number}集</option>`).join('')}</select><span>共 ${episode.document.scenes.length} 个场景 · ${result.groups.length} 组镜头 · 预计 ${result.groups.reduce((a,g)=>a+g.seconds,0)} 秒</span><small>本地示例 · 全剧画幅 ${esc(ratio)}</small><div class="ref-sb-draft-actions"><button class="button outline ref-sb-to-canvas" data-action="ref-sb-video-drafts" ${editing?'disabled':''} title="创建可编辑的视频草稿，不调用生成服务">创建本集视频草稿</button>${node.scriptSeries.episodes.length>1?`<button class="button outline ref-sb-to-canvas" data-action="ref-sb-all-video-drafts" ${editing||!referenceStoryboardAllEpisodesReady(node)?'disabled':''} title="${referenceStoryboardAllEpisodesReady(node)?'为全剧创建可编辑的视频草稿，不调用生成服务':'请先完成全剧所有集的分镜'}">创建全剧视频草稿</button>`:''}</div></header><div class="ref-sb-body"><aside id="ref-sb-assets"><h2>镜头号 ${episode.number}-${result.groups.indexOf(group)+1}<small>${group.seconds}s</small></h2><div class="ref-sb-assets-panel"><h3>出镜角色</h3><div class="ref-sb-asset-grid">${assets.filter(a=>a.kind==='character').map(referenceStoryboardAssetMarkup).join('')||'<p>暂无关联角色</p>'}</div><h3>分镜场景</h3><div class="ref-sb-asset-grid ref-sb-scenes">${scenes.length?scenes.map(referenceStoryboardAssetMarkup).join(''):`<div class="ref-sb-asset"><span class="ref-sb-asset-image ref-sb-asset-empty">${I('image')}</span><span class="ref-sb-asset-name">${esc(group.sceneTitle)}</span><small>暂无关联场景素材</small></div>`}</div>${props.length?`<h3>关联道具</h3><div class="ref-sb-asset-grid">${props.map(referenceStoryboardAssetMarkup).join('')}</div>`:''}${references.some(item=>!item.node)?'<p>部分引用素材已不存在</p>':''}</div></aside><div class="ref-sb-main"><div class="ref-sb-actions"><button class="button ghost ref-sb-assets-toggle" data-action="ref-sb-assets" aria-controls="ref-sb-assets" aria-expanded="${referenceStoryboardAssetsExpanded}">${referenceStoryboardAssetsExpanded?'收起素材':'关联素材'}</button>${editing?btn('保存','ref-sb-save','outline')+btn('取消','ref-sb-cancel','ghost'):btn('重新拆解示例','ref-storyboard-settings:episode','ghost')+btn('编辑分镜','ref-sb-edit','outline')}</div><div class="ref-sb-details" role="region" aria-label="分镜内容" tabindex="0">${fields}</div><nav class="ref-sb-strip" aria-label="分镜" aria-description="方向键切换镜头，Home 和 End 跳至首尾">${result.groups.map((g,i)=>`<button data-action="ref-sb-select:${g.id}" ${editing?'disabled':''} aria-current="${g.id===group.id}"><span class="ref-sb-thumb" aria-hidden="true"></span><small>镜头号 ${episode.number}-${i+1} · ${g.seconds}s</small></button>`).join('')}</nav></div></div></main>`;
};
const referenceStoryboardResultAction=handleAction;
handleAction=function(action){
 const node=nodeById(referenceWorkbench.nodeId);
 if(action==='ref-sb-assets'){referenceStoryboardAssetsExpanded=!referenceStoryboardAssetsExpanded;const main=document.querySelector('.ref-sb-result'),button=document.querySelector('[data-action="ref-sb-assets"]');main.classList.toggle('is-assets-open',referenceStoryboardAssetsExpanded);button.setAttribute('aria-expanded',referenceStoryboardAssetsExpanded);button.textContent=referenceStoryboardAssetsExpanded?'收起素材':'关联素材';return;}
 if(action==='ref-sb-build'){
  const mode=document.querySelector('[name="storyboard-merge"]:checked')?.value||'adaptive',episode=studioSeriesEpisode(node,referenceWorkbench.episodeId),episodes=referenceStoryboardBuildScope==='all'?studioSeriesEpisodes(node):[episode],built=referenceBuildStoryboardEpisodes(episodes,mode,node.scriptSeries.storyboardDemo,studioSeriesAssetsFor(node,'all'));
  if(!built.ok){toast(built.error);return;}const settings=referenceSaveStoryboardSettings(node,mode);if(!settings.ok){toast(settings.error);return;}node.scriptSeries.storyboardDemo=built.results;referenceStoryboardSelected=built.results[episode.id].groups[0].id;referenceStoryboardEdit=null;S.revision++;persist();referenceDrawWorkbench();return;
 }
 if(action.startsWith('ref-sb-')){
  const stripScroll=document.querySelector('.ref-sb-strip')?.scrollLeft||0;
  const episode=studioSeriesEpisode(node,referenceWorkbench.episodeId),result=node.scriptSeries.storyboardDemo?.[episode.id];if(!result)return;
  if(action.startsWith('ref-sb-select:')){if(referenceStoryboardEdit)return;referenceStoryboardSelected=action.slice('ref-sb-select:'.length);}
  if(action==='ref-sb-edit')referenceStoryboardEdit=structuredClone(result.groups.find(g=>g.id===referenceStoryboardSelected)||result.groups[0]);
  if(action==='ref-sb-cancel')referenceStoryboardEdit=null;
  if(action==='ref-sb-save'){const saved=referenceSaveStoryboardGroup(result,referenceStoryboardSelected,referenceStoryboardEdit,studioSeriesAssetsFor(node,'all'));if(!saved.ok){toast(saved.error);return;}referenceStoryboardEdit=null;if(saved.changed)S.revision++;persist();}
  referenceDrawWorkbench();referenceSizeStoryboardEditor();
  if(action==='ref-sb-save'||action==='ref-sb-cancel')document.querySelector('[data-action="ref-sb-edit"]')?.focus({preventScroll:true});
  if(action==='ref-sb-edit'){const pane=document.querySelector('.ref-sb-details'),bounds=pane.getBoundingClientRect(),visible=[...pane.querySelectorAll('textarea')].find(field=>{const rect=field.getBoundingClientRect();return rect.bottom>bounds.top&&rect.top<bounds.bottom;});visible?.focus({preventScroll:true});}
  const strip=document.querySelector('.ref-sb-strip');if(strip){strip.scrollLeft=stripScroll;if(action.startsWith('ref-sb-select:'))referenceRevealStoryboardThumbnail(strip);}
  return;
 }
 if(referenceStoryboardEdit&&(action.startsWith('ref-wb-tab:')||action==='close-modal')){toast('请先保存或取消分镜修改');return;}
 if(action.startsWith('ref-storyboard-settings:'))referenceRememberStoryboardScroll();
 referenceStoryboardResultAction(action);
 if(action.startsWith('ref-storyboard-settings:')){
  referenceStoryboardBuildScope=action.endsWith(':all')?'all':'episode';
  const submit=document.querySelector('[data-action="ref-storyboard-save"]');submit.dataset.action='ref-sb-build';submit.textContent=`拆解${referenceStoryboardBuildScope==='all'?'全剧':'本集'}示例`;
  document.querySelector('.ref-storyboard-demo-note').textContent='根据本地已有剧本整理示例，不调用生成服务。未填写的创作字段留空。';
 }
};
document.addEventListener('input',event=>{
 if(!referenceStoryboardEdit)return;
 if(event.target.hasAttribute('data-sb-group-prompt'))referenceStoryboardEdit.prompt=event.target.value;
 if(event.target.hasAttribute('data-sb-field'))referenceStoryboardEdit.segments[Number(event.target.dataset.sbSegment)].fields[event.target.dataset.sbField]=event.target.value;
});

// Preserve the pending edit until the explicit save or cancel action.
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&referenceStoryboardAssetsExpanded&&document.querySelector('.ref-sb-result')&&innerWidth<=700){handleAction('ref-sb-assets');document.querySelector('[data-action="ref-sb-assets"]')?.focus({preventScroll:true});event.preventDefault();event.stopImmediatePropagation();return;}
 if(event.key==='Escape'&&referenceStoryboardEdit&&document.querySelector('.ref-sb-result')){event.preventDefault();event.stopImmediatePropagation();toast('请先保存或取消分镜修改');}
},true);

/** Keep table cells compact while making all draft text visible without inner scrollbars. */
function referenceSizeStoryboardEditor(){
 for(const field of document.querySelectorAll('.ref-sb-edit-table textarea')){
  if(field.dataset.sbLabel)field.setAttribute('aria-label',field.dataset.sbLabel);
  field.style.height='0px';field.style.height=Math.max(46,field.scrollHeight)+'px';
 }
}
document.addEventListener('input',event=>{if(event.target.matches('.ref-sb-edit-table textarea'))referenceSizeStoryboardEditor()});
window.addEventListener('resize',referenceSizeStoryboardEditor);

/** Keep independent reading and editing positions for each shot group. */
function referenceRememberStoryboardScroll(){
 const main=document.querySelector('.ref-sb-result');if(!main)return;
 const key=JSON.stringify([main.dataset.sbEpisode,main.dataset.sbGroup,main.dataset.sbMode]);
 referenceWorkbench.storyboardPositions??={};referenceWorkbench.storyboardPositions[key]={details:main.querySelector('.ref-sb-details').scrollTop,assets:main.querySelector('.ref-sb-body>aside').scrollTop};
}
const referenceStoryboardDrawWorkbench=referenceDrawWorkbench;
referenceDrawWorkbench=function(options){
 referenceRememberStoryboardScroll();referenceStoryboardDrawWorkbench(options);
 const main=document.querySelector('.ref-sb-result');if(!main)return;
 referenceSizeStoryboardEditor();const position=referenceWorkbench.storyboardPositions?.[JSON.stringify([main.dataset.sbEpisode,main.dataset.sbGroup,main.dataset.sbMode])];
 if(position){main.querySelector('.ref-sb-details').scrollTop=position.details;main.querySelector('.ref-sb-body>aside').scrollTop=position.assets;}
};

/** Reveal the selected thumbnail without moving the surrounding workbench. */
function referenceRevealStoryboardThumbnail(strip){
 const selected=strip.querySelector('[aria-current=true]');if(!selected)return;
 selected.focus({preventScroll:true});
 const item=selected.getBoundingClientRect(),bounds=strip.getBoundingClientRect();
 if(item.left<bounds.left+12)strip.scrollLeft-=bounds.left+12-item.left;
 else if(item.right>bounds.right-12)strip.scrollLeft+=item.right-bounds.right+12;
}
document.addEventListener('keydown',event=>{
 const current=event.target.closest?.('.ref-sb-strip button');if(!current||current.disabled||referenceStoryboardEdit)return;
 const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;
 const items=[...current.closest('.ref-sb-strip').querySelectorAll('button:not(:disabled)')],index=items.indexOf(current);
 const next=event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowRight'?1:-1)));
 event.preventDefault();event.stopImmediatePropagation();if(next!==index)handleAction(items[next].dataset.action);
},true);

// Leaving the workbench records the same per-shot positions as a tab change.
const referenceStoryboardRememberWorkbench=referenceRememberWorkbenchScroll;
referenceRememberWorkbenchScroll=function(){
 referenceStoryboardRememberWorkbench();
 referenceRememberStoryboardScroll();
};
