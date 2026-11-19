/* Preserve Studio interactions while sending every creative execution to the native Agent. */
'use strict';
const studioNativePersistKey='crewon-studio-demo-v1';
const studioNativePendingRequests=new Map();
let studioNativeSavedState='';
const studioNativeBasePreview=studioNodePreview,studioNativeBasePreviewCopy=studioNodePreviewCopy;
studioNodePreviewCopy=function(){return studioNativeConfig.previewCopy||studioNativeBasePreviewCopy();};
studioNodePreview=function(node){
 const preview=studioNativeBasePreview(node);if(!/^(asset|shot):/.test(node.id))return preview;
 const id=node.id.slice(node.id.indexOf(':')+1),job=studioNativeConfig.production?.jobs.filter(item=>item.targetId===id&&item.targetVersion===node.nativeRevision).at(-1);
 const state=studioNativePendingRequests.has(node.id)||['submitting','running'].includes(job?.state)?'generating':job?.state==='failed'?'failed':job?.state==='unknown'?'unknown':preview.state;
 return {...preview,state};
};

rememberProject=referenceRememberProject;
const studioNativeCreationDraft=canvasCreationDraft;
canvasCreationDraft=function(node){return {prompt:node.prompt||'',...studioNativeCreationDraft(node)};};
function studioNativeNode(native,kind,index){
 const saved=S.nodes.find(node=>node.id===native.id);
 return {x:kind==='story'?40:kind==='shot'?800:400,y:kind==='story'?90:(index%5)*340+80,w:280,h:320,
  title:native.title||native.name||'',prompt:native.prompt||'',description:native.prompt||'',kind,label:kind==='story'?'剧本':kind==='scene'?'场景':kind==='character'?'角色':'分镜',
  candidates:[],adoptedCandidateId:null,referenceOnly:true,status:'待制作',frame:null,...saved,...native};
}
function studioNativeApplyProject(first){
 const value=studioNativeConfig,project=value.project;
 if(!project){S.project='';S.projectDrafts={};S.nodes=[];S.clips=[];S.history=[];S.screen='home';referenceSection='projects';render();return;}
 S.project=project.title;S.projectKind='drama';S.goal='drama';S.referenceMode='drama';S.panel=null;
 if(first&&!Array.isArray(stored.nodes)){S.nodes=[];S.edges=[];S.clips=[];S.projectDrafts={};S.history=[];S.versions={};}
 const production=value.production,previous=S.nodes||[],nativeIds=new Set();
 const script=project.scripts.at(-1);
 const story=studioNativeNode({id:'story',title:project.title,prompt:script?.body||project.synopsis||'',text:script?.body||'',nativeRevision:project.revision},'story',0);
 if(!previous.some(n=>n.id==='story'&&n.nativeRevision===project.revision)){
  delete story.scriptDocument;delete story.scriptSeries;
  story.scriptVersions=project.scripts.map((item,index)=>({revision:index+1,title:project.title,logline:project.synopsis,legacyText:item.body,scenes:[],createdAt:item.createdAt}));
 }
 const nodes=[story];nativeIds.add('story');
 for(const [index,asset]of production.assets.entries()){
  const id='asset:'+asset.id;nativeIds.add(id);const saved=previous.find(n=>n.id===id);
  const kind=asset.kind==='prop'?'image':asset.kind;
  const node=studioNativeNode({id,kind,label:{character:'角色',scene:'场景',prop:'道具',voice:'声音'}[asset.kind],assetCategory:asset.kind==='prop'?'prop':undefined,title:asset.name,prompt:asset.prompt,description:asset.prompt,nativeRevision:asset.version},kind,index);
  if(saved?.nativeRevision===asset.version)Object.assign(node,{prompt:saved.prompt,title:saved.title,description:saved.description});
  if(asset.kind==='prop'){node.assetCategory='prop';node.label='道具';}nodes.push(node);
 }
 for(const [index,shot]of production.shots.entries()){
  const id='shot:'+shot.id;nativeIds.add(id);const saved=previous.find(n=>n.id===id);
  const node=studioNativeNode({id,title:shot.title,prompt:shot.prompt,dialogue:shot.dialogue,seconds:shot.frames/production.fps,nativeRevision:shot.version},'shot',index);
  if(saved?.nativeRevision===shot.version)Object.assign(node,{prompt:saved.prompt,title:saved.title,dialogue:saved.dialogue});nodes.push(node);
 }
 S.nodes=[...nodes,...previous.filter(n=>!nativeIds.has(n.id)&&!n.id.startsWith('asset:')&&!n.id.startsWith('shot:'))];
 if(story.scriptSeries)story.scriptSeries.sharedAssetIds=S.nodes.filter(node=>['character','scene'].includes(node.kind)||node.assetCategory==='prop').map(node=>node.id);
 const previousIds=new Set(previous.map(node=>node.id)),occupied=S.nodes.filter(node=>previousIds.has(node.id));
 for(const node of S.nodes.filter(item=>!previousIds.has(item.id))){
  while(occupied.some(other=>node.x<other.x+(other.w||280)+40&&node.x+(node.w||280)+40>other.x&&node.y<other.y+(other.h||320)+60&&node.y+(node.h||320)+60>other.y))node.y+=380;
  occupied.push(node);
 }
 const addedNodes=S.nodes.some(node=>!previousIds.has(node.id));
 S.edges=S.edges?.filter(([a,b])=>S.nodes.some(n=>n.id===a)&&S.nodes.some(n=>n.id===b))||[];
 for(const shot of production.shots){const target='shot:'+shot.id;for(const source of ['story',...shot.assetIds.map(id=>'asset:'+id)])if(!S.edges.some(([a,b])=>a===source&&b===target))S.edges.push([source,target]);}
 S.clips=production.timeline.map(item=>'shot:'+item.shotId);S.history=S.history||[];S.versions=S.versions||{};
 S.projectDrafts={[S.project]:S.projectDrafts?.[S.project]||{project:S.project,nodes:S.nodes}};
 S.referenceProjectMeta={[S.project]:{id:project.id,modifiedAt:null,createdAt:null,sequence:0}};
 S.screen='canvas';S.view=S.view||'canvas';S.panel=null;S.selected=first?null:S.selected;
 const repaired=studioNativePrepareLayout(S);
 if(addedNodes&&S.studioNativeLayoutMode==='auto')studioNativeArrangeLayout(S);
 location.hash='canvas';render();
 const viewport=document.getElementById('viewport'),size=S.studioNativeViewport;
 if(first&&(repaired||!size||size.width!==viewport?.clientWidth||size.height!==viewport?.clientHeight)||addedNodes&&S.studioNativeCamera==='fit')studioNativeFitViewport();
 S.studioNativeLayoutRepaired=repaired;
 const styles=[];let frame=900000;
 for(const node of S.nodes){
  const id=node.id.split(':').slice(1).join(':');const native=production.assets.find(a=>a.id===id)||production.shots.find(a=>a.id===id);
  if(!native)continue;
  const adopted=native.adoptedMediaId||native.adoptedVideoId||native.adoptedImageId;
  node.candidates=production.jobs.filter(job=>job.targetId===native.id&&job.state==='ready').flatMap(job=>job.outputs.map(media=>{
   const candidate={id:media.id,number:0,frame:++frame,kind:media.kind==='voice'?'voice':media.kind,prompt:node.prompt,
    createdAt:job.createdAt,seconds:node.seconds,dialogue:node.dialogue,nativeMedia:media,nativeJobId:job.id,nativeVersion:job.targetVersion};
   if(media.kind==='image')styles.push(`.frame${frame}{background-image:url("${media.url}")!important}`);return candidate;
  }));
  node.candidates.forEach((candidate,index)=>{candidate.number=index+1;});
  node.adoptedCandidateId=adopted||null;node.referenceOnly=!adopted;
  const current=node.candidates.find(candidate=>candidate.id===adopted);
  if(current){node.frame=(node.candidates.find(item=>item.id===native.adoptedImageId)||current).frame;const latestVideo=node.candidates.filter(item=>item.nativeVersion===native.version&&item.kind==='video').at(-1);node.status=latestVideo&&latestVideo.id!==native.adoptedVideoId?'待审阅':'已采用';}
  else if(node.candidates.length)node.status='待审阅';

 }
 let sheet=document.getElementById('studio-native-media');if(!sheet){sheet=document.createElement('style');sheet.id='studio-native-media';document.head.append(sheet);}sheet.textContent=styles.join('\n');
 render();
 studioNativeRefreshAssetWorkbench();
}
function studioNativeRefreshAssetWorkbench(){
 if(typeof referenceWorkbench!=='undefined'&&referenceWorkbench.project===S.project&&referenceWorkbench.tab==='assets'&&document.querySelector('.ref-workbench')
  &&!(typeof referenceWorkbenchAssetEditor!=='undefined'&&referenceWorkbenchAssetEditor)&&!document.querySelector('.ref-wb-library-overlay,.ref-asset-lightbox')){
  referenceRememberWorkbenchScroll();referenceDrawWorkbench({focus:false});
 }
}
function studioNativeRun(intent,node,labelOverride){
 if(!studioNativeConfig.project){studioNativePost('overview');return;}
 const selected=node||nodeById(S.selected)||studioScriptNode();
 const draft=selected?S.nodeDrafts?.[selected.id]||{}:{};
 const native=selected&&(studioNativeConfig.production?.shots.find(item=>'shot:'+item.id===selected.id)||studioNativeConfig.production?.assets.find(item=>'asset:'+item.id===selected.id));
 const context=selected?JSON.stringify({id:selected.id,title:selected.title,kind:selected.kind,...(selected.kind!=='story'&&(!native||selected.prompt!==native.prompt)?{prompt:draft.prompt??selected.prompt??''}:{}),...(selected.kind!=='story'&&Object.keys(draft).length?{userEdits:draft}:{})}):'';
 rememberProject();persist();
 const label=labelOverride||(intent.includes('studio-u22-compiler')?`生成「${selected?.title||'当前分镜'}」视频候选`:intent.includes('studio-script-diagnosis')?'诊断当前剧本':intent.includes('studio-asset-bible')?'提取资产设定':intent.includes('studio-storyboard')?'构建分镜计划':intent.includes('studio-media-review')?(intent.includes('返修')?`返修「${selected?.title||'当前候选'}」`:'审查媒体候选'):intent.slice(0,160));
 if(selected&&/^(asset|shot):/.test(selected.id)&&/生成/.test(intent)){const last=studioNativeConfig.production.jobs.filter(job=>selected.id===job.targetType+':'+job.targetId).at(-1);studioNativePendingRequests.set(selected.id,last?.id||'');render();}
 const instruction=`${intent}。先读取当前项目已有剧本、资产、分镜和任务，再使用以下用户保存的创作输入。若有未保存到制作记录的节点，请先通过原生工具保存定义后执行。保留已采用版本，结果作为候选，不伪造生成结果。未连接所需服务时说明需要配置什么。只简短报告结果，候选留在右侧审阅。\n${context}`;
 studioNativePost('run',{text:label+'\n\n[crewon-studio-action:v1]\n'+JSON.stringify({instruction})});
}
const studioNativeScriptBody=scriptNodeBody;
scriptNodeBody=function(node){if(node.id==='story'&&!studioNativeConfig.project?.scripts.length)return studioNativeConfig.direction?'<div class="node-content script-summary"><p>'+esc(studioNativeConfig.direction.idea)+'</p><button class="button ghost" data-action="native-direction-view">查看故事设定</button></div>':'<div class="node-content script-summary"><p>与项目 Agent 一起完善故事</p></div>';const html=studioNativeScriptBody(node),candidate=studioNativeConfig.project?.scripts.at(-1);return candidate?html.replace(/(<p class=\"script-summary-logline\">)[\s\S]*?(<\/p>)/,'$1'+esc(candidate.body.slice(0,180))+'$2'):html;};
const studioNativeDownloadScript=referenceDownloadScript;
referenceDownloadScript=function(node,all){const project=studioNativeConfig.project,candidate=project?.scripts.at(-1);if(!candidate)return studioNativeDownloadScript(node,all);const url=URL.createObjectURL(new Blob([candidate.body],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=project.title+(all?'·全部剧本':'·当前剧本')+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),500);};
exportDialog=function(){studioNativeRun('检查已采用素材和剪辑时间线，通过原生导出工具导出真实成片；缺少素材时明确说明，不演示虚假导出');};
projectHistoryDialog=function(){
 const production=studioNativeConfig.production;
 const exports=production.exports||[];
 const rendered=exports.map((item,index)=>`<article class="native-export-item"><header style="display:flex;align-items:center;justify-content:space-between;gap:16px"><strong style="font-size:14px">成片 ${index+1}</strong><small style="color:var(--muted)">${esc(new Date(item.createdAt).toLocaleString())} · ${(item.frames/production.fps).toFixed(1)} 秒</small></header><video controls preload="metadata" src="${esc(item.video.url)}" style="display:block;width:100%;max-height:50vh;background:#111;margin:12px 0"></video><a class="btn outline" href="${esc(item.video.url)}" download="${esc(S.project)}-${index+1}.mp4">下载 MP4</a>${item.subtitle?` <a class="btn outline" href="${esc(item.subtitle.url)}" download="${esc(S.project)}-${index+1}.srt">下载字幕</a>`:''}</article>`).join('');
 const jobs=production.jobs.map((job,index)=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-top:1px solid var(--line)"><span>候选 ${index+1} · ${esc(({image:'图片',video:'视频',voice:'声音'})[job.kind]||job.kind)}</span><small>${esc(({ready:'已归档',running:'生成中',submitting:'提交中',unknown:'待核对',failed:'失败'})[job.state]||job.state)}</small></div>`).join('');
 showDialog('制作历史',`${rendered||'<p>尚未导出成片。采用视频后，在对话中完成剪辑与导出。</p>'}<h3 style="margin-top:24px">生成记录</h3>${jobs||'<p>尚无生成记录</p>'}`,btn('关闭','close-modal','outline'));
};

const studioNativeEpisodeBody=referenceEpisodeBody;
referenceEpisodeBody=function(episode){const candidate=studioNativeConfig.project?.scripts.at(-1);return candidate?`<article class="ref-wb-document"><h1>第 ${episode.number} 集：${esc(studioNativeConfig.project.title)}</h1><p style="white-space:pre-wrap">${esc(candidate.body)}</p></article>`:studioNativeEpisodeBody(episode);};
function studioNativeEditScript(){
 const project=studioNativeConfig.project,candidate=project?.scripts.at(-1);if(!candidate)return;
 const draft=S.studioNativeScriptDraft,body=draft?.body??candidate.body;
 S.studioNativeScriptDraft={scriptId:draft?.scriptId||candidate.id,revision:project.revision,body};
 const root=showDialog('编辑剧本',`<textarea id="native-script-body" aria-label="剧本正文" maxlength="16000" style="width:100%;min-height:45vh;box-sizing:border-box">${esc(body)}</textarea><p role="alert" id="native-script-error"></p>`,btn('取消','native-script-cancel','outline')+btn('保存草稿','native-script-save','primary'));
 root.querySelector('.dialog').classList.add('ref-paste-dialog');
 const field=root.querySelector('textarea');field.addEventListener('input',()=>{S.studioNativeScriptDraft.body=field.value;save();});field.focus({preventScroll:true});
}
const studioNativeDrawWorkbench=referenceDrawWorkbench;
referenceDrawWorkbench=function(options){
 studioNativeDrawWorkbench(options);const project=studioNativeConfig.project,candidate=project?.scripts.at(-1),footer=document.querySelector('.ref-wb-bottom');
 if(!candidate||!footer)return;
 for(const span of document.querySelectorAll('.ref-wb-meta>span'))if(/^预计 0 秒/.test(span.textContent))span.remove();
 const pendingDraft=S.studioNativeScriptDraft&&S.studioNativeScriptDraft.body!==candidate.body;
 const header=document.querySelector('.ref-wb-header-actions');if(header&&!header.querySelector('[data-action=\"ref-wb-edit\"]'))header.insertAdjacentHTML('afterbegin',iconBtn('编辑剧本','ref-wb-edit','edit'));
 footer.querySelector('span').textContent=pendingDraft?'有编辑草稿，保存后再决定是否采用':project.adoptedScriptId===candidate.id?'当前剧本已采用，可继续拆解资产与分镜':'核对剧本后采用，才会用于后续分镜';
 if(pendingDraft||project.adoptedScriptId!==candidate.id){const button=document.createElement('button');button.className='button primary';button.dataset.action=pendingDraft?'ref-wb-edit':'native-adopt-script';button.textContent=pendingDraft?'继续编辑':'采用此剧本';footer.append(button);}
};
window.addEventListener('message',event=>{if(event.source===parent&&event.data?.channel==='crewon-studio-v1'&&event.data.type==='script-saved'){delete S.studioNativeScriptDraft;persist();closeDialog();openScriptWorkbench('story');}if(event.source===parent&&event.data?.channel==='crewon-studio-v1'&&event.data.type==='error'){const button=document.querySelector('[data-action=\"native-adopt-script\"]');if(button)button.disabled=false;const saveButton=document.querySelector('[data-action=\"native-script-save\"]');if(saveButton)saveButton.disabled=false;}if(event.source===parent&&event.data?.channel==='crewon-studio-v1'&&event.data.type==='script-adopted'){closeDialog();render();toast('剧本已采用，原候选与历史已保留');}});
const studioNativeStage=nodeStageLabel;
nodeStageLabel=function(node){
 if(/^(asset|shot):/.test(node.id)){
  const id=node.id.split(':')[1],jobs=studioNativeConfig.production?.jobs||[];
  if(jobs.some(job=>job.targetId===id&&job.targetVersion===node.nativeRevision&&['submitting','running'].includes(job.state)))return '生成中';
  if(!node.adoptedCandidateId&&node.candidates?.some(item=>item.nativeVersion===node.nativeRevision))return '待审阅';
 }
 return studioNativeStage(node);
};
const studioNativeNodeHtml=nodeHtml;
nodeHtml=function(node){
 const html=studioNativeNodeHtml(node),images=node.candidates?.filter(item=>item.nativeMedia?.kind==='image')||[];
 const native=studioNativeConfig.production?.shots.find(item=>'shot:'+item.id===node.id);
 const poster=images.find(item=>item.id===(native?.adoptedImageId||node.adoptedCandidateId))||images.at(-1);
 const candidate=node.candidates?.filter(item=>item.nativeMedia).at(-1);
 const id=node.id.split(':')[1],job=studioNativeConfig.production?.jobs.filter(item=>item.targetId===id&&item.targetVersion===node.nativeRevision).at(-1);
 if(studioNativePendingRequests.has(node.id)&&job&&job.id!==studioNativePendingRequests.get(node.id))studioNativePendingRequests.delete(node.id);
 const pending=studioNativePendingRequests.has(node.id);
 if(pending||job&&['submitting','running','unknown','failed'].includes(job.state)){
  const waiting=pending||['submitting','running'].includes(job?.state),label=pending?'等待助手安排':!studioNativeStatusConnected?'状态连接中断':({submitting:'正在提交',running:'正在生成',unknown:'等待恢复查询',failed:'生成未完成'})[job.state];
  const kind=({image:'图片',video:'视频',voice:'声音'})[job?.kind]||(['voice','audio'].includes(node.kind)?'声音':node.kind==='shot'?'视频':'图片');
  const message=pending?'正在准备制作任务':job.state==='unknown'?'任务已保留，不会重复提交':job.state==='failed'?'打开任务记录查看原因':node.adoptedCandidateId?'已采用版本继续保留':'完成后将在这里显示候选';
  const pattern=html.includes('class="ref-empty-media-body"')?/<div class="ref-empty-media-body">[\s\S]*?<\/div>/:/<div class="node-media[^"]*">[\s\S]*?<\/div>/;
  return html.replace(pattern,`<div class="node-media native-generation-state ${poster?'still frame'+poster.frame:''}" role="status" aria-live="polite" aria-busy="${waiting}" aria-label="${esc(node.title+'：'+label+kind)}"><div class="native-generation-overlay">${waiting&&studioNativeStatusConnected?'<span class="native-generation-spinner" aria-hidden="true"></span>':`<strong>${esc(label)}</strong><small>${esc(message)}</small>`}</div></div>`);
 }
 if(!candidate)return html;
 if(!poster){
  const preview=candidate.nativeMedia.kind==='video'?`<video src="${esc(candidate.nativeMedia.url)}" preload="metadata" muted playsinline aria-hidden="true"></video>`:'';
  const label=candidate.nativeMedia.kind==='video'?'查看视频候选':'查看声音候选';
  const pattern=html.includes('class="ref-empty-media-body"')?/<div class="ref-empty-media-body">[\s\S]*?<\/div>/:/<div class="node-media[^"]*">[\s\S]*?<\/div>/;
  return html.replace(pattern,`<button class="node-media native-completed-media" aria-label="查看候选：${esc(node.title)}" data-action="native-review:${node.id}:${candidate.id}">${preview}<span>${label}</span></button>`);
 }

 return html.replace(/<div class="node-media[^"]*">[\s\S]*?<\/div>/,
  `<button class="node-media still frame${poster.frame}" style="width:100%;border:0;padding:0;cursor:pointer" aria-label="查看候选：${esc(node.title)}" data-action="native-review:${node.id}:${candidate.id}"><span>${candidate.nativeMedia.kind==='video'?'查看视频候选':node.adoptedCandidateId?'查看采用结果':'候选 · 未采用'}</span></button>`);
};

window.addEventListener('pointerdown',event=>{
 const action=event.target.closest('[data-action]')?.dataset.action||'';
 if(/^(versions:(asset|shot):|native-review:|native-adopt-media:)/.test(action))event.stopImmediatePropagation();
},true);
const studioNativeReviewCandidate=openCandidateReview;
openCandidateReview=function(nodeId,candidateId){
 const node=nodeById(nodeId);if(!node?.id?.startsWith('asset:')&&!node?.id?.startsWith('shot:'))return studioNativeReviewCandidate(nodeId,candidateId);
 const candidates=node.candidates||[],selected=candidates.find(item=>item.id===candidateId)||candidates.at(-1);
 if(!selected){toast('尚无已完成候选，请在对话中发起生成');return;}
 const native=studioNativeConfig.production.assets.find(item=>'asset:'+item.id===nodeId)||studioNativeConfig.production.shots.find(item=>'shot:'+item.id===nodeId);
 const media=selected.nativeMedia,adopted=node.adoptedCandidateId===selected.id,current=selected.nativeVersion===native?.version;
 const preview=media.kind==='image'?`<img src="${esc(media.url)}" alt="${esc(node.title)}" style="width:100%;max-height:56vh;object-fit:contain">`:
  `<${media.kind==='video'?'video':'audio'} src="${esc(media.url)}" controls style="width:100%;max-height:56vh"></${media.kind==='video'?'video':'audio'}>`;
 showDialog('候选与采用',`<div class="candidate-review-heading"><h3>${esc(node.title)}</h3><p>${adopted?'当前采用版本':current?'真实生成候选，采用后用于后续制作':'历史版本，保留供查看'}</p></div>${preview}<div class="candidate-switch-row">${candidates.map(item=>`<button class="${item.id===selected.id?'selected':''}" data-action="native-review:${nodeId}:${item.id}">v${item.number} · ${item.nativeMedia.kind==='image'?'图片':item.nativeMedia.kind==='video'?'视频':'声音'}</button>`).join('')}</div>`,
  `<span class="note">已归档 · v${selected.number}</span>${btn('关闭','close-modal','outline')}${!adopted&&current?btn('采用此版本',`native-adopt-media:${nodeId}:${selected.id}`,'primary'):''}`,true);
};
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!=='crewon-studio-v1')return;
 if(event.data.type==='media-adopted'){closeDialog();render();toast('已采用，历史候选已保留');}
 if(event.data.type==='error'){document.querySelector('[data-action^="native-adopt-media:"]')?.removeAttribute('disabled');}
});
const studioNativeOriginalAction=handleAction;
handleAction=function(action){
 const [key,...args]=String(action).split(':'),value=args.join(':');
 if(key==='versions'&&value.match(/^(asset|shot):/)){openCandidateReview(value);return;}
 if(key==='native-review'||key==='native-adopt-media'){
  const parts=value.split(':'),nodeId=parts.slice(0,2).join(':'),mediaId=parts[2],node=nodeById(nodeId);
  if(key==='native-review'){openCandidateReview(nodeId,mediaId);return;}
  const candidate=node?.candidates?.find(item=>item.id===mediaId);if(!candidate)return;
  const button=document.querySelector('[data-action^="native-adopt-media:"]');if(button?.disabled)return;if(button)button.disabled=true;
  studioNativePost('adopt-media',{revision:studioNativeConfig.production.revision,jobId:candidate.nativeJobId,mediaId});return;
 }
 if(key==='native-complete-outline'){studioNativeRun('完善当前项目的故事设定与逐集大纲。先读取已保存的创作方向及用户在创建项目时选择的题材、风格、画幅和集数，保持这些选择不变。补齐故事定位、一句话故事、具有完整因果和结尾的故事梗概、主要人物小传及每集的剧情概要、冲突、关键转折和结尾，通过创作方向工具保存新版本供我审阅。保留现有剧本和素材，不重新生成媒体。');return;}
 if(key==='settings'){studioNativePost('settings');return;}
 if(key==='history'||key==='result-history'){projectHistoryDialog();return;}
 if(key==='ref-wb-edit'){studioNativeEditScript();return;}
 if(key==='native-script-cancel'){closeDialog();referenceDrawWorkbench();return;}
 if(key==='native-script-save'){const project=studioNativeConfig.project,field=document.getElementById('native-script-body'),body=field?.value.trim();if(!project||!body){document.getElementById('native-script-error').textContent='请填写剧本正文';return;}const button=document.querySelector('[data-action=\"native-script-save\"]');if(button?.disabled)return;if(button)button.disabled=true;studioNativePost('save-script',{revision:S.studioNativeScriptDraft?.revision??project.revision,body});return;}
 if(key==='script-open'){openScriptWorkbench(value);return;}
 if(key==='native-adopt-script'){const project=studioNativeConfig.project,candidate=project?.scripts.at(-1),node=studioScriptNode();if(!candidate||!node)return;const body=candidate.body;if(!body){toast('剧本正文为空');return;}if(body.length>16000){toast('单个剧本版本最多 16,000 字，请先分集整理');return;}const button=document.querySelector('[data-action=\"native-adopt-script\"]');if(button?.disabled)return;if(button)button.disabled=true;studioNativePost('adopt-script',{revision:project.revision,scriptId:candidate.id,body});return;}
 if(key==='ref-new'){studioNativePost('new-project');return;}
 if(['home','ref-nav'].includes(key)){studioNativePost('overview');return;}
 if(['ref-start','ref-start-confirm','start'].includes(key)){
  const brief=typeof referenceEntryInput==='function'?referenceEntryInput(S):S.drafts?.shared||'';
  if(!brief.trim()){toast('先写下你想创作的内容');return;}
  studioNativePost('create',{title:brief.trim().slice(0,32),synopsis:brief});return;
 }
 if(['open-project','resume-project','ref-project-open'].includes(key)){
  const project=studioNativeConfig.projects.find(p=>p.id===value||p.title===value);if(project)studioNativePost('open',{id:project.id});return;
 }
 if(['run-single','regenerate','run-video','run-preview','canvas-creation-submit','ref-wb-confirm-commit','ref-sb-build','ref-sb-parse','ref-storyboard-parse','ref-wb-reparse','import-start'].includes(key)){
  const label=document.activeElement?.textContent?.trim()||'根据所选节点继续创作';studioNativeRun(label);return;
 }
 if(['simulate-export','export','download-plan'].includes(key)){studioNativeRun('检查当前项目已采用素材和剪辑时间线，具备条件时用原生导出工具导出成片；缺少素材时列出缺少项');return;}
 if(['approve','confirm-project-demo','confirm-tool-demo'].includes(key)){studioNativeRun('审阅当前保存的创作输入并继续制作，使用宿主审批机制');return;}
 if(key==='director'){studioNativePost('focus-agent');return;}
 if(['ref-example','open-example','plan-template','template'].includes(key)){studioNativePost('create',{title:'新的创作项目',synopsis:'请根据用户选择的创作方向开始规划：'+value});return;}
 return studioNativeOriginalAction(action);
};
prepareNodeCandidate=function(id){studioNativeRun('为所选内容生成新的候选',nodeById(id));};
referenceProjectCards=function(all=false){
 const projects=studioNativeConfig.projects.slice(0,all?100:3);
 return `<div class="ref-project-grid ${all?'all':''}" id="project-grid"><button class="ref-project new" data-action="ref-new"><div class="ref-cover">${I('plus')}</div><strong>新建项目</strong></button>${projects.map(p=>`<article class="ref-project"><button data-action="ref-project-open:${esc(p.id)}" aria-label="打开 ${esc(p.title)}" class="ref-cover" style="display:grid;place-items:center;background:var(--panel)">${I('folder')}</button><div class="ref-project-caption"><div><strong>${esc(p.title)}</strong></div></div></article>`).join('')}</div>`;
};
function studioNativeSerialize(){
 return JSON.stringify({...S,screen:undefined,studioNativeLayoutRepaired:undefined,canvasUndo:S.canvasUndo?.slice(-30),canvasRedo:S.canvasRedo?.slice(-30)});
}
persist=function(){
 if(studioNativeConfig.project)rememberProject();
 const value=studioNativeSerialize();if(value===studioNativeSavedState)return;
 studioNativeSavedState=value;studioStorage.setItem(studioNativePersistKey,value);
};
document.addEventListener('submit',event=>{if(event.target.id==='director-form'){event.preventDefault();event.stopImmediatePropagation();const text=event.target.querySelector('textarea')?.value?.trim();if(text)studioNativePost('run',{text});}},true);
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action,key=action?.split(':')[0],label=button.textContent.trim();
 if(['versions','native-review','native-adopt-media','script-open','ref-wb-edit','native-script-save','native-script-cancel','native-adopt-script','canvas-creation-submit','run-single','regenerate','run-video','ref-start','ref-start-confirm','start','ref-sb-build','ref-sb-parse','ref-wb-confirm-commit'].includes(key)||/^(生成主角色|解析第\d+集|重新解析资产|生成候选|重新生成|开始生成|拆解分镜)/.test(label)){
  event.preventDefault();event.stopImmediatePropagation();handleAction(action);}
},true);
const studioNativeEntryHome=home;
home=function(){if(!studioNativeConfig.project)referenceSection='projects';return studioNativeEntryHome();};
studioNativeApplyProject(true);
rememberProject();studioNativeSavedState=studioNativeSerialize();studioNativeWritable=true;
if(new URLSearchParams(location.search).get('entry')!=='1'&&(S.studioNativeLayoutRepaired||!studioNativeConfig.document.storage[studioNativePersistKey]))studioStorage.setItem(studioNativePersistKey,studioNativeSavedState);
document.documentElement.dataset.studioNative='true';

const studioGenerationStyle=document.createElement('style');studioGenerationStyle.textContent=`.native-completed-media{position:relative;width:100%;padding:0;border:0;cursor:pointer;overflow:hidden;min-height:160px;display:grid;place-items:center}.native-completed-media video{width:100%;height:100%;object-fit:cover;pointer-events:none}.native-completed-media span{position:absolute;bottom:10px;padding:4px 8px;background:var(--panel);border-radius:6px;font-size:12px}.native-generation-state{position:relative;display:grid;place-items:center;min-height:160px}.native-generation-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;background:color-mix(in srgb,var(--panel) 84%,transparent);text-align:center}.native-generation-overlay strong{font-size:13px;font-weight:500}.native-generation-overlay small{font-size:11px;line-height:1.6;color:var(--muted)}.native-generation-spinner{width:22px;height:22px;border:2px solid var(--line);border-top-color:var(--text);border-radius:50%;animation:studio-generation-spin 1s linear infinite}@keyframes studio-generation-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.native-generation-spinner{animation:none}}`;document.head.append(studioGenerationStyle);

/* Creative direction is the same Host record shown in the chat review card. */
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-action="native-direction-view"]');if(!trigger)return;
 event.stopImmediatePropagation();const brief=studioNativeConfig.direction;if(!brief)return;
 showDialog('故事设定',`<article class="ref-wb-document"><h3>${esc(brief.idea)}</h3><p>${esc(brief.durationSeconds)} 秒 · ${esc(brief.style)}</p>${[['故事背景',brief.background],['人物关系',brief.characters],['核心冲突',brief.conflict],['故事大纲',brief.outline],['建议设定',brief.assumptions.join('；')]].map(([label,text])=>`<h4>${label}</h4><p>${esc(text)}</p>`).join('')}</article>`,btn('关闭','close-modal','outline'));
},true);
