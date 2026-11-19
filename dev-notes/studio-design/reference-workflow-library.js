/* Local templates import editable graphs without executing generation. */
'use strict';
const referenceWorkflowCatalog=[
 {id:'portrait',name:'雨夜人像构图',category:'平面设计',frame:0,description:'人物参考、构图描述与图片节点',nodes:[{id:'brief',kind:'text',title:'人像构图说明',prompt:'雨夜街角的人像，暖色橱窗光与冷色街灯形成对比，人物位于画面右侧。'},{id:'reference',kind:'image',title:'人物参考',prompt:''},{id:'result',kind:'image',title:'人像画面',prompt:'根据构图说明与人物参考生成画面。'}],edges:[['brief','result'],['reference','result']]},
 {id:'story',name:'短片镜头预演',category:'短视频内容',frame:3,description:'镜头说明、首帧与视频串联',nodes:[{id:'brief',kind:'text',title:'镜头说明',prompt:'雨停之后，旅人沿亮灯的街道向前走。先固定中景，再缓慢跟随。'},{id:'frame',kind:'image',title:'镜头首帧',prompt:'雨后街道，暖色路灯，旅人背影。'},{id:'video',kind:'video',title:'跟随镜头',prompt:'保持人物与街道一致，镜头缓慢前移。'}],edges:[['brief','frame'],['frame','video'],['brief','video']]},
 {id:'poster',name:'城市活动海报',category:'文案策划',frame:1,description:'文案和视觉分别准备，再汇合排版',nodes:[{id:'copy',kind:'text',title:'海报文案',prompt:'主题：夜行城市。副标题：在灯光里发现熟悉的街道。日期与地点待补充。'},{id:'image',kind:'image',title:'海报视觉',prompt:'城市夜景，留出标题区域。'},{id:'layout',kind:'image',title:'海报排版',prompt:'结合文案与视觉，保持信息层级清晰。'}],edges:[['copy','layout'],['image','layout']]}
];
let referenceWorkflowPanel={tab:'灵感库',category:'全部',query:'',selected:null},referenceWorkflowOpener=null,referenceWorkflowSavingGroup=null,referenceWorkflowCover=null,referenceWorkflowCoverRead=0,referenceWorkflowCoverPending=false,referenceWorkflowHost=null;
function referenceCaptureWorkflow(state,group,id,name){
 const title=name.trim();if(!title||title.length>20||!group?.nodeIds?.length)return {ok:false,error:'请填写 1 至 20 字名称并选择非空分组'};
 const nodes=group.nodeIds.map(id=>state.nodes.find(n=>n.id===id)).filter(Boolean),supported=new Set(['text','image','character','scene','video','audio','voice','note']);
 if(nodes.some(n=>!supported.has(n.kind)))return {ok:false,error:'该分组含暂不支持保存的节点，请先单独整理图片、文字、视频或声音'};
 const ids=new Set(nodes.map(n=>n.id)),left=Math.min(...nodes.map(n=>n.x)),top=Math.min(...nodes.map(n=>n.y));
 const preferences=node=>({...node.creationPreferences,...state.nodeDrafts?.[node.id]});
 if(nodes.some(node=>{const source=preferences(node).creationCostume?.source;return source&&!ids.has(source.sourceId);}))return {ok:false,error:'变装来源不在分组中，请把源角色一并加入后保存'};
 const copies=structuredClone(nodes).map(n=>{const draft=preferences(n);if(typeof draft.prompt==='string')n.prompt=draft.prompt;const settings=Object.fromEntries(Object.entries(draft).filter(([key])=>key.startsWith('creation')&&key!=='creationExpanded'));if(Object.keys(settings).length)n.creationPreferences=structuredClone(settings);n.x-=left;n.y-=top;delete n.scriptSourceId;delete n.workflowTemplate;n.assetReferences=(n.assetReferences||[]).filter(ref=>ids.has(ref.sourceId));if(n.variantOf&&!ids.has(n.variantOf))delete n.variantOf;for(const c of n.candidates||[])c.sourceReferences=(c.sourceReferences||[]).filter(ref=>ids.has(ref.sourceId));return n;});
 return {ok:true,template:{id,name:title,category:'我的工作流',frame:nodes.find(n=>Number.isFinite(n.frame))?.frame||0,description:nodes.length+' 个节点 · 本地保存',snapshot:true,nodes:copies,edges:state.edges.filter(([a,b])=>ids.has(a)&&ids.has(b)).map(e=>[...e])}};
}
function referenceCommitWorkflow(state,template,write){
 const previous=state.referenceSavedWorkflows;state.referenceSavedWorkflows=[...(previous||[]),template];
 try{write();return {ok:true};}catch(error){if(previous===undefined)delete state.referenceSavedWorkflows;else state.referenceSavedWorkflows=previous;return {ok:false,error:'本机存储空间不足或不可写，模板尚未保存。请保留当前画布并清理存储后重试。'};}
}
function referenceWorkflowTemplates(){return [...referenceWorkflowCatalog,...(S.referenceSavedWorkflows||[])];}
function referenceImportWorkflow(state,template,prefix,position){
 if(!template||!template.nodes.length)return {ok:false,error:'模板没有可添加的内容'};
 const mapping=new Map(template.nodes.map(n=>[n.id,prefix+'-'+n.id]));
 if(mapping.size!==template.nodes.length||[...mapping.values()].some(id=>state.nodes.some(n=>n.id===id))||template.edges.some(([a,b])=>!mapping.has(a)||!mapping.has(b)))return {ok:false,error:'模板引用不完整，未添加内容'};
 const groups=referenceReadGroups(state);if(groups.some(group=>group.id===prefix+'-group'))return {ok:false,error:'模板分组标识重复，未添加内容'};
 const before=referenceCaptureNodeGraph(state),candidateIds=new Map(template.nodes.flatMap(n=>(n.candidates||[]).map(c=>[JSON.stringify([n.id,c.id]),mapping.get(n.id)+'-'+c.id])));
 const nodes=template.nodes.map((n,index)=>({
  ...structuredClone(n),id:mapping.get(n.id),
  x:position.x+(template.snapshot?n.x:index*290),y:position.y+(template.snapshot?n.y:0),
  ...(template.snapshot?{}:{label:n.kind==='text'?'文本':n.kind==='video'?'视频':'图片',w:244,h:300,frame:template.frame,status:'待制作'}),
  assetReferences:template.snapshot?(n.assetReferences||[]).filter(ref=>mapping.has(ref.sourceId)).map(ref=>({...ref,sourceId:mapping.get(ref.sourceId),candidateId:candidateIds.get(JSON.stringify([ref.sourceId,ref.candidateId]))||ref.candidateId})):[],
  workflowTemplate:template.id,referenceOnly:template.snapshot?n.referenceOnly:n.kind!=='text',candidates:template.snapshot?structuredClone(n.candidates||[]):[]
 }));
 for(const node of nodes){
  const costume=node.creationPreferences?.creationCostume?.source;if(costume){const original=costume.sourceId;costume.sourceId=mapping.get(original);costume.candidateId=candidateIds.get(JSON.stringify([original,costume.candidateId]))||costume.candidateId;}
  if(node.variantOf)node.variantOf=mapping.get(node.variantOf);
  for(const candidate of node.candidates){const previous=candidate.id;candidate.id=node.id+'-'+previous;if(node.adoptedCandidateId===previous)node.adoptedCandidateId=candidate.id;candidate.sourceReferences=(candidate.sourceReferences||[]).filter(ref=>mapping.has(ref.sourceId)).map(ref=>({...ref,sourceId:mapping.get(ref.sourceId),...(ref.candidateId?{candidateId:candidateIds.get(JSON.stringify([ref.sourceId,ref.candidateId]))||ref.candidateId}:{})}));}
 }
 state.nodes.push(...nodes);state.edges.push(...template.edges.map(([a,b])=>[mapping.get(a),mapping.get(b)]));
 state.referenceGroups={version:1,groups:[...groups,{id:prefix+'-group',name:template.name,nodeIds:nodes.map(n=>n.id)}]};
 if(Array.isArray(state.layoutBase))state.layoutBase.push(...nodes.map(n=>({id:n.id,x:n.x,y:n.y})));
 return {ok:true,ids:nodes.map(n=>n.id),entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
/** Retain each gallery view without carrying a search result's offset into another view. */
function referenceWorkflowRememberScroll(){
 const grid=document.querySelector('.ref-workflow-grid');if(grid){referenceWorkflowPanel.scrolls??={};referenceWorkflowPanel.scrolls[grid.dataset.viewKey]=grid.scrollTop;}
}
function referenceWorkflowClose(){referenceWorkflowRememberScroll();document.querySelector('.ref-workflow-mask')?.remove();if(referenceWorkflowHost){referenceWorkflowHost.element.inert=referenceWorkflowHost.inert;referenceWorkflowHost=null;}if(referenceWorkflowOpener?.isConnected)referenceWorkflowOpener.focus({preventScroll:true});referenceWorkflowOpener=null;}
function referenceWorkflowRender(){
 referenceWorkflowRememberScroll();const p=referenceWorkflowPanel;p.scrolls??={};
 document.querySelector('.ref-workflow-mask')?.remove();const viewKey=JSON.stringify([p.tab,p.category,p.query]);
 if(!referenceWorkflowHost){const element=document.getElementById('app');if(element)referenceWorkflowHost={element,inert:element.inert};}if(referenceWorkflowHost)referenceWorkflowHost.element.inert=true;
 const favorites=S.referenceWorkflowFavorites||[],list=referenceWorkflowTemplates().filter(t=>(p.tab!=='我的收藏'||favorites.includes(t.id))&&(p.tab!=='我的工作流'||t.snapshot)&&(p.category==='全部'||p.category===t.category)&&(!p.query||t.name.includes(p.query)||t.description.includes(p.query)));
 document.body.insertAdjacentHTML('beforeend',`<div class="ref-workflow-mask"><section class="ref-workflow-library" role="dialog" aria-modal="true" aria-label="工作流库"><header><div role="tablist" aria-label="工作流来源">${['灵感库','我的收藏','我的工作流'].map(tab=>`<button role="tab" aria-selected="${p.tab===tab}" data-workflow-tab="${tab}">${tab}</button>`).join('')}</div><label>${I('search')}<input aria-label="搜索工作流" placeholder="搜索" value="${esc(p.query)}" data-workflow-search></label><button aria-label="关闭工作流库" data-workflow-close>${I('close')}</button></header>${p.tab==='我的工作流'?'':`<nav aria-label="工作流用途">${['全部','文案策划','平面设计','短视频内容'].map(category=>`<button aria-pressed="${p.category===category}" data-workflow-category="${category}">${category}</button>`).join('')}</nav>`}<div class="ref-workflow-grid" data-view-key="${esc(viewKey)}">${list.map(t=>`<article class="${p.selected===t.id?'is-selected':''}"><div class="ref-workflow-media"><button class="ref-workflow-preview" data-workflow-select="${t.id}" aria-label="选择${t.name}">${t.cover?`<img src="${esc(t.cover)}" alt="${esc(t.name)}封面">`:`<span class="still frame${t.frame}"></span>`}</button><button class="ref-workflow-apply" data-workflow-apply="${t.id}" aria-label="应用${esc(t.name)}">应用</button></div><button class="ref-workflow-star" aria-label="收藏${t.name}" aria-pressed="${favorites.includes(t.id)}" data-workflow-favorite="${t.id}">${I(favorites.includes(t.id)?'check':'pin')}</button><div class="ref-workflow-caption"><strong>${t.name}</strong><small>${t.description}</small></div></article>`).join('')||`<p class="ref-workflow-empty">${p.tab==='我的工作流'?'暂无工作流':p.tab==='我的收藏'?'暂无收藏':'没有匹配的工作流'}</p>`}</div><footer>${p.tab==='我的工作流'?'本机保存 · ':'本地示例模板 · '}应用只添加可编辑内容，不启动生成</footer></section></div>`);
 document.querySelector('.ref-workflow-grid').scrollTop=p.scrolls[viewKey]||0;
}
const referenceWorkflowBaseAction=handleAction;
handleAction=function(action){if(action==='workflow-library'){referenceWorkflowOpener=document.activeElement;referenceWorkflowRender();document.querySelector('[data-workflow-search]')?.focus();return;}if(action==='workflow-save-confirm'){const group=referenceWorkflowSavingGroup,result=referenceCaptureWorkflow(S,group,studioScriptId('template'),document.getElementById('workflow-name').value);if(!result.ok){document.getElementById('workflow-save-error').textContent=result.error;return;}if(referenceWorkflowCoverPending)return;if(referenceWorkflowCover)result.template.cover=referenceWorkflowCover;const committed=referenceCommitWorkflow(S,result.template,persist);if(!committed.ok){document.getElementById('workflow-save-error').textContent=committed.error;return;}referenceWorkflowSavingGroup=null;closeDialog();toast('已保存到我的工作流');return;}referenceWorkflowBaseAction(action);};
document.addEventListener('input',event=>{if(!event.target.matches('[data-workflow-search]'))return;const cursor=event.target.selectionStart;referenceWorkflowPanel.query=event.target.value;referenceWorkflowRender();const input=document.querySelector('[data-workflow-search]');input.focus();input.setSelectionRange(cursor,cursor);});
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-workflow-close],[data-workflow-tab],[data-workflow-category],[data-workflow-select],[data-workflow-favorite],[data-workflow-apply]');if(!target)return;
 if(target.hasAttribute('data-workflow-close')){referenceWorkflowClose();return;}
 if(target.dataset.workflowTab){referenceWorkflowPanel.tab=target.dataset.workflowTab;referenceWorkflowPanel.category='全部';}
 if(target.dataset.workflowCategory)referenceWorkflowPanel.category=target.dataset.workflowCategory;
 if(target.dataset.workflowSelect)referenceWorkflowPanel.selected=target.dataset.workflowSelect;
 if(target.dataset.workflowFavorite){const id=target.dataset.workflowFavorite,items=S.referenceWorkflowFavorites||[];S.referenceWorkflowFavorites=items.includes(id)?items.filter(x=>x!==id):[...items,id];save();}
 if(target.dataset.workflowApply&&referenceWorkflowPanel.selected!==target.dataset.workflowApply){referenceWorkflowPanel.selected=target.dataset.workflowApply;referenceWorkflowRender();document.querySelector(`[data-workflow-apply="${CSS.escape(target.dataset.workflowApply)}"]`)?.focus({preventScroll:true});return;}
 if(target.dataset.workflowApply){const template=referenceWorkflowTemplates().find(t=>t.id===target.dataset.workflowApply),result=referenceImportWorkflow(S,template,studioScriptId('workflow'),studioNewContentPosition(850,300));if(!result.ok){toast(result.error);return;}studioRecordCanvasHistory(result.entry);S.revision++;S.selected=result.ids[0];referenceWorkflowClose();render();revealSelectedNode();save();toast('已添加模板内容');return;}
 const focusKey=[...target.attributes].find(attribute=>attribute.name.startsWith('data-workflow-'));referenceWorkflowRender();if(focusKey)[...document.querySelectorAll('.ref-workflow-library button')].find(button=>button.getAttribute(focusKey.name)===focusKey.value)?.focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{const panel=document.querySelector('.ref-workflow-library');if(!panel)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceWorkflowClose();}if(event.key==='Tab'){const controls=[...panel.querySelectorAll('button,input')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}},true);

document.addEventListener('click',event=>{if(!event.target.closest('[data-workflow-save-group]'))return;const group=referenceReadGroups(S).find(g=>g.id===referenceSelectedGroup);if(!group)return;referenceWorkflowSavingGroup=structuredClone(group);referenceWorkflowCover=null;referenceWorkflowCoverRead++;referenceWorkflowCoverPending=false;showDialog('创建工作流',`<label class="ref-workflow-cover" aria-label="选择工作流封面"><span>${I('image')}<small>封面</small></span><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="工作流封面"></label><label class="field">名称<input id="workflow-name" aria-label="工作流名称" maxlength="20" value="${esc(group.name.slice(0,20))}"></label><p>保存组内内容、提示词、制作参数与连线，外部连线不带入。</p><p id="workflow-save-error" role="alert"></p>`,btn('取消','close-modal','outline')+btn('确定','workflow-save-confirm','primary'));},true);

document.addEventListener('change',async event=>{
 if(!event.target.matches('.ref-workflow-cover input'))return;
 const file=event.target.files[0],input=event.target;if(!file)return;
 const error=document.getElementById('workflow-save-error'),read=++referenceWorkflowCoverRead;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){referenceWorkflowCoverPending=false;document.querySelector('[data-action="workflow-save-confirm"]').disabled=false;error.textContent='请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片';return;}
 referenceWorkflowCoverPending=true;document.querySelector('[data-action="workflow-save-confirm"]').disabled=true;error.textContent='正在读取封面…';
 try{
  const bitmap=await createImageBitmap(file);if(!input.isConnected||read!==referenceWorkflowCoverRead){bitmap.close();return;}
  const canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  referenceWorkflowCover=canvas.toDataURL('image/webp',.8);input.parentElement.querySelector('span').innerHTML=`<img src="${referenceWorkflowCover}" alt="已选择的工作流封面">`;error.textContent='';
 }catch(error){if(input.isConnected&&read===referenceWorkflowCoverRead)document.getElementById('workflow-save-error')?.replaceChildren(document.createTextNode('无法读取这张图片，请换一张重试'));}finally{if(input.isConnected&&read===referenceWorkflowCoverRead){referenceWorkflowCoverPending=false;document.querySelector('[data-action="workflow-save-confirm"]').disabled=false;}}
});
