/* Asset confirmation freezes the reviewed roster; it does not start generation. */
'use strict';
function referenceConfirmSeriesAssets(node,assets,confirmedAt){
 const series=node?.scriptSeries;
 if(!series||!assets.length)return {ok:false,error:'请先准备角色、场景或道具，再确认资产'};
 if(series.assetConfirmation)return {ok:true,changed:false};
 series.assetConfirmation={confirmedAt,assets:structuredClone(assets)};
 series.stage='storyboard';
 return {ok:true,changed:true};
}
function referenceSeriesAssetsLocked(node){return !!node?.scriptSeries?.assetConfirmation;}
function referenceSeriesAssetAddLocked(node){
 return referenceSeriesAssetsLocked(node)&&!Object.values(node.scriptSeries.storyboardDemo||{}).some(result=>Array.isArray(result?.groups)&&result.groups.length>0);
}
function referenceStoryboardPending(node){
 const w=referenceWorkbench,episodes=studioSeriesEpisodes(node),episode=studioSeriesEpisode(node,w.episodeId),ratio=S.referenceCreationSpec?.ratio||'16:9';
 return `<main class="ref-storyboard-pending"><header><select aria-label="选择单集" data-ref-storyboard-episode>${episodes.map(ep=>`<option value="${ep.id}" ${ep.id===episode.id?'selected':''}>${node.scriptSeries.storyboardDemo?.[ep.id]?'已有示例':'待解析'} 第${ep.number}集</option>`).join('')}</select><span>全剧画幅 ${esc(ratio)}</span><span>待解析</span></header><section><button data-action="ref-storyboard-settings:episode">解析第${episode.number}集分镜</button></section><footer><span>资产已确认，开始拆解全剧分镜</span><button data-action="ref-storyboard-settings:all">解析全剧分镜</button><small>当前为待解析界面，未调用生成服务</small></footer></main>`;
}

function referenceSaveStoryboardSettings(node,mode){
 if(!node?.scriptSeries?.assetConfirmation)return {ok:false,error:'请先确认资产'};
 if(!['standard','adaptive'].includes(mode))return {ok:false,error:'请选择有效的视频合并模式'};
 node.scriptSeries.storyboardSettings={mergeMode:mode};return {ok:true};
}
const referenceStoryboardBaseAction=handleAction;
handleAction=function(action){
 if(action.startsWith('ref-storyboard-settings:')){
  const node=nodeById(referenceWorkbench.nodeId),mode=node.scriptSeries?.storyboardSettings?.mergeMode||'adaptive';
  showDialog('分镜解析设置',`<p>沿用剧本已确认的逐集时长，分镜总时长与对应集一致；缺少单集时长时自动规划。</p><fieldset class="ref-storyboard-options"><legend>视频合并模式</legend>${[['standard','标准合并','每组合计最多 15 秒；短分镜各 4–15 秒'],['adaptive','自适应合并','每组合计最多 30 秒；短分镜各 4–15 秒']].map(([key,title,detail])=>`<label><input type="radio" name="storyboard-merge" value="${key}" ${mode===key?'checked':''}><span><strong>${title}</strong><small>${detail}</small></span></label>`).join('')}</fieldset><p class="ref-storyboard-demo-note">交互演示：仅保存设置，不启动解析。</p>`,btn('取消','ref-storyboard-cancel','outline')+btn('保存设置','ref-storyboard-save','primary'));return;
 }
 if(action==='ref-storyboard-cancel'){referenceDrawWorkbench();return;}
 if(action==='ref-storyboard-save'){
  const result=referenceSaveStoryboardSettings(nodeById(referenceWorkbench.nodeId),document.querySelector('[name="storyboard-merge"]:checked')?.value);if(!result.ok){toast(result.error);return;}persist();referenceDrawWorkbench();return;
 }
 referenceStoryboardBaseAction(action);
};
