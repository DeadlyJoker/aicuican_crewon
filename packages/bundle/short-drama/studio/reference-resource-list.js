/* Project resource cards share node records and tag commands with the canvas. */
'use strict';
const referenceResourceCategories=[['text','文本','file','text'],['image','图片','image','image'],['character','角色','user',null],['scene','场景','scene',null],['prop','道具','layers',null],['video','视频','video-media','video'],['audio','音频','audio-media','voice'],['world','3D 世界','scene',null],['model','3D 模型','grid',null],['director','导演台','camera-control',null],['planning','脚本策划','edit',null],['story','剧本工坊','script','story'],['storyboard','分镜格子','grid',null],['other','其他','layers',null]];
/** Classify existing nodes without converting their persisted kind. */
function referenceResourceCategory(node){
 if(node.kind==='story')return 'story';
 if(['text','note'].includes(node.kind))return 'text';
 if(['voice','audio'].includes(node.kind))return 'audio';
 if(['video','shot','final','camera','composition','edit'].includes(node.kind))return 'video';
 if(node.kind==='character'||node.kind==='scene')return node.kind;
 if(node.kind==='image'&&(node.assetCategory==='prop'||node.label==='道具'))return 'prop';
 if(['image','ending'].includes(node.kind))return 'image';
 return 'other';
}
/** Keep list browsing state attached to project identity when its name changes. */
function referenceMigrateResourceViews(state){
 const views=state.referenceResourceViews;if(!views)return;
 for(const [name,meta] of Object.entries(state.referenceProjectMeta||{})){
  if(meta.id&&meta.id!==name&&views[name]){if(!views[meta.id])views[meta.id]=structuredClone(views[name]);delete views[name];}
 }
}
function referenceResourceState(project=S.project){
 referenceMigrateResourceViews(S);S.referenceResourceViews??={};
 const key=S.referenceProjectMeta?.[project]?.id||project;
 return S.referenceResourceViews[key]??={category:'image',query:'',scrollTop:0};
}
referenceMigrateResourceViews(S);
/** Filter by title, input text and existing project tags without changing node order. */
function referenceResourceNodes(nodes,state,tag=null){
 const query=state.query.trim().toLocaleLowerCase();
 return nodes.filter(node=>referenceResourceCategory(node)===state.category&&(!tag||node.referenceTagIds?.includes(tag))&&(!query||[node.title,node.text,node.prompt,node.description].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
}
function referenceResourceCard(node){

 const tags=referenceTags().filter(tag=>node.referenceTagIds?.includes(tag.id));
 return `<article class="ref-resource-card"><button type="button" class="ref-resource-open" data-action="resource-open:${esc(node.id)}" aria-label="定位 ${esc(node.title)}"><span class="ref-resource-thumb">${studioNodePreviewHtml(node)}</span><strong>${esc(node.title)}</strong></button><button class="ref-resource-tags" data-tag-node="${esc(node.id)}" aria-label="${esc(node.title)}的标签" title="${esc(tags.map(tag=>tag.name).join('、')||'添加标签')}">${tags.length?tags.map(tag=>`<i style="background:${tag.color}"></i>`).join(''):I('sliders')}</button></article>`;
}
function referenceResourceGrid(){
 const state=referenceResourceState(),category=referenceResourceCategories.find(item=>item[0]===state.category),nodes=referenceResourceNodes(S.nodes,state,canvasNavigatorState().tagFilter);
 return `${nodes.map(referenceResourceCard).join('')}${category?.[3]?`<button class="ref-resource-new" data-action="resource-new:${category[3]}"><span>${I('plus')}</span><strong>新建${category[1]}</strong><small>在画布中创建</small></button>`:''}${!nodes.length&&!category?.[3]?'<p class="ref-resource-empty">暂无此类型节点</p>':''}`;
}
storyboardHtml=function(){
 const state=referenceResourceState();
 return `<section class="storyboard-list ref-resource-list" role="region" aria-label="列表"><header class="ref-resource-controls"><div class="ref-resource-category-nav"><div class="ref-resource-tabs" role="tablist" aria-label="节点类型">${referenceResourceCategories.map(([key,label,icon])=>`<button role="tab" data-resource-category="${key}" aria-selected="${state.category===key}">${I(icon)}<span>${label}</span><small>${S.nodes.filter(node=>referenceResourceCategory(node)===key).length}</small></button>`).join('')}</div><button class="icon-btn" data-resource-category-prev aria-label="查看前面的分类">${I('back')}</button><button class="icon-btn" data-resource-category-next aria-label="查看后面的分类">${I('chev')}</button></div><div class="ref-resource-search"><input type="search" aria-label="搜索资源" placeholder="搜索资源" value="${esc(state.query)}" data-resource-search><button class="icon-btn" data-tag-filter aria-label="按标签筛选" aria-pressed="${!!canvasNavigatorState().tagFilter}" title="按标签筛选">${I('sliders')}</button></div></header>${canvasNavigatorState().tagFilter?`<div class="ref-resource-active-filter">${esc(referenceActiveTagName())}<button data-action="resource-clear-tag" aria-label="清除标签筛选">${I('close')}</button></div>`:''}<div class="ref-resource-grid" role="group" aria-label="资源卡片" tabindex="0" data-resource-grid data-resource-project="${esc(S.project)}">${referenceResourceGrid()}</div></section>`;
};
const referenceResourceAction=handleAction;
handleAction=function(action){
 if(action.startsWith('resource-open:')){const id=action.slice('resource-open:'.length);if(nodeById(id)){focusNode(id);save();}return;}
 if(action.startsWith('resource-new:')){const kind=action.slice('resource-new:'.length);if(!referenceResourceCategories.some(item=>item[3]===kind))return;S.view='canvas';S.panel=null;render();const node=addNode(kind);if(node)focusNode(node.id);return;}
 if(action==='resource-clear-tag'){canvasNavigatorState().tagFilter=null;render();save();return;}
 referenceResourceAction(action);
};
function referenceResourceTabEdges(){const tabs=document.querySelector('.ref-resource-tabs');if(!tabs)return;document.querySelector('[data-resource-category-prev]').disabled=tabs.scrollLeft<1;document.querySelector('[data-resource-category-next]').disabled=tabs.scrollLeft+tabs.clientWidth>=tabs.scrollWidth-1;}
const referenceResourceRender=render;
render=function(){
 const old=document.querySelector('[data-resource-grid]');if(old){const state=referenceResourceState(old.dataset.resourceProject);state.scrollTop=old.scrollTop;state.categoryScrollLeft=document.querySelector('.ref-resource-tabs')?.scrollLeft||0;}
 referenceResourceRender();
 const grid=document.querySelector('[data-resource-grid]');if(grid){grid.scrollTop=referenceResourceState().scrollTop;document.querySelector('.ref-resource-tabs').scrollLeft=referenceResourceState().categoryScrollLeft||0;}referenceResourceTabEdges();
};
document.addEventListener('scroll',event=>{if(event.target.matches?.('.ref-resource-tabs')){referenceResourceState().categoryScrollLeft=event.target.scrollLeft;referenceResourceTabEdges();save();return;}if(event.target.matches?.('[data-resource-grid]')){referenceResourceState(event.target.dataset.resourceProject).scrollTop=event.target.scrollTop;save();}},true);
document.addEventListener('input',event=>{
 if(!event.target.matches('[data-resource-search]'))return;
 const state=referenceResourceState();state.query=event.target.value;state.scrollTop=0;
 const grid=document.querySelector('[data-resource-grid]');grid.innerHTML=referenceResourceGrid();grid.scrollTop=0;save();
});
document.addEventListener('click',event=>{
 const direction=event.target.closest('[data-resource-category-prev],[data-resource-category-next]');if(direction){const tabs=document.querySelector('.ref-resource-tabs');tabs.scrollBy({left:(direction.hasAttribute('data-resource-category-next')?1:-1)*tabs.clientWidth*.7,behavior:'smooth'});return;}
 if(event.target.closest('[data-view]')){save();return;}
 const tab=event.target.closest('[data-resource-category]');if(!tab)return;
 referenceResourceState().category=tab.dataset.resourceCategory;referenceResourceState().scrollTop=0;const grid=document.querySelector('[data-resource-grid]');if(grid)grid.scrollTop=0;render();save();
 document.querySelector(`[data-resource-category="${tab.dataset.resourceCategory}"]`)?.focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{
 const tab=event.target.closest('[data-resource-category]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=[...tab.parentElement.querySelectorAll('[role=tab]')],index=tabs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
 event.preventDefault();event.stopImmediatePropagation();const category=tabs[next].dataset.resourceCategory;tabs[next].click();document.querySelector(`[data-resource-category="${category}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
});
window.addEventListener('resize',referenceResourceTabEdges);
if(S.screen==='canvas'&&S.view==='storyboard')render();

// A failed local preview retains the media icon and its original duration label.
document.addEventListener('error',event=>{if(event.target.matches?.('.ref-resource-video'))event.target.hidden=true;},true);
