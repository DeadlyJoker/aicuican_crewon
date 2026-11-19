/* Local project tags classify nodes without altering accepted outputs. */
'use strict';
const referenceDefaultTags=[['person','人物','#F9B902'],['scene','场景','#22C55E'],['prop','道具','#3B82F6'],['style','风格参考','#A855F7'],['shot','分镜图','#EC4899'],['reference','参考图','#06B6D4'],['other','其他','#14B8A6']].map(([id,name,color])=>({id,name,color}));
let referenceTagSelected=[],referenceTagProject=null,referenceTagTarget=null,referenceTagOpener=null;
function referenceTags(){const seen=new Set();const source=Array.isArray(S.referenceTagCatalog)?S.referenceTagCatalog:referenceDefaultTags;return source.filter(tag=>{if(!tag||typeof tag.id!=='string'||!/^[-\w]+$/.test(tag.id)||seen.has(tag.id)||typeof tag.name!=='string'||!tag.name.trim()||typeof tag.color!=='string'||!/^#[0-9a-f]{6}$/i.test(tag.color))return false;seen.add(tag.id);return true;});}
function referenceTagSelection(){if(referenceTagProject!==S.project){referenceTagProject=S.project;referenceTagSelected=[];}referenceTagSelected=referenceTagSelected.filter(id=>nodeById(id));return referenceTagSelected;}
function referenceFilterTaggedGroups(groups){const tag=canvasNavigatorState().tagFilter;return tag?groups.map(group=>({...group,nodes:group.nodes.filter(node=>node.referenceTagIds?.includes(tag))})).filter(group=>group.nodes.length):groups;}
function referenceActiveTagName(){return referenceTags().find(tag=>tag.id===canvasNavigatorState().tagFilter)?.name||'';}
function referenceTagHeader(){return `<button class="icon-btn" data-tag-batch aria-label="${canvasNavigatorState().batch?'退出批量操作':'批量操作'}" aria-pressed="${!!canvasNavigatorState().batch}">${I('list')}</button><button class="canvas-tag-filter" data-tag-filter aria-label="按标签筛选" aria-pressed="${!!canvasNavigatorState().tagFilter}" title="按标签筛选">${I('sliders')}</button>`;}
function referenceTagRow(node,row,state){
 const tags=referenceTags().filter(tag=>node.referenceTagIds?.includes(tag.id));
 return `<div class="canvas-tag-row">${state.batch?`<input type="checkbox" data-tag-select="${node.id}" aria-label="选择 ${esc(node.title)}" ${referenceTagSelection().includes(node.id)?'checked':''}>`:''}${row}<button class="canvas-node-tag" data-tag-node="${node.id}" aria-label="${esc(node.title)}的标签" title="${esc(tags.map(tag=>tag.name).join('、')||'添加标签')}">${tags.length?tags.map(tag=>`<i style="background:${tag.color}"></i>`).join(''):I('sliders')}</button>${typeof referenceNodeManagerControls==='function'?referenceNodeManagerControls(node):''}</div>`;
}
/** Select group members without adding the group id to the node selection. */
function referenceSelectGroupMembers(selected,ids,checked){const members=new Set(ids);return checked?[...new Set([...selected,...ids])]:selected.filter(id=>!members.has(id));}
/** Resolve visible selection independently of collapsed rows and hidden filtered selections. */
function referenceBatchSelectionSummary(selected,ids){
 const chosen=new Set(selected),visible=new Set(ids),selectedVisible=[...visible].filter(id=>chosen.has(id)).length;
 return {total:chosen.size,visible:visible.size,selectedVisible,hidden:[...chosen].filter(id=>!visible.has(id)).length,checked:visible.size>0&&selectedVisible===visible.size,mixed:selectedVisible>0&&selectedVisible<visible.size};
}
function referenceVisibleBatchIds(){return canvasFilteredNavigationGroups(canvasCurrentNavigationGroups(),canvasNavigatorState().query).flatMap(group=>group.nodes.map(node=>node.id));}
function referenceTagGroupHeader(group,heading,state){
 if(!state.batch||!group.title)return heading;
 const summary=referenceBatchSelectionSummary(referenceTagSelection(),group.nodes.map(node=>node.id));
 return `<div class="canvas-tag-group-heading"><input type="checkbox" data-tag-group="${esc(group.id)}" aria-label="选择 ${esc(group.title)}" aria-checked="${summary.mixed?'mixed':summary.checked}" ${summary.checked?'checked':''}>${heading}</div>`;
}
function referenceSyncBatchSelection(){
 const selected=referenceTagSelection(),groups=canvasFilteredNavigationGroups(canvasCurrentNavigationGroups(),canvasNavigatorState().query);
 document.querySelectorAll('[data-tag-select]').forEach(input=>input.checked=selected.includes(input.dataset.tagSelect));
 document.querySelectorAll('[data-tag-group]').forEach(input=>{const group=groups.find(group=>group.id===input.dataset.tagGroup),summary=referenceBatchSelectionSummary(selected,(group?.nodes||[]).map(node=>node.id));input.checked=summary.checked;input.indeterminate=summary.mixed;input.setAttribute('aria-checked',String(summary.mixed?'mixed':summary.checked));});
 if(typeof referenceRefreshBatchFooter==='function')referenceRefreshBatchFooter();
 const all=document.querySelector('input[data-tag-all]');if(all){const summary=referenceBatchSelectionSummary(selected,referenceVisibleBatchIds());all.checked=summary.checked;all.indeterminate=summary.mixed;all.setAttribute('aria-checked',String(summary.mixed?'mixed':summary.checked));}
}
function referenceTagFooter(){const state=canvasNavigatorState();return state.batch?`<footer class="canvas-tag-batch"><button data-tag-all>全选结果</button><span>已选 ${referenceTagSelection().length} 项</span><button data-tag-apply ${referenceTagSelection().length?'':'disabled'}>打标签</button></footer>`:'';}
function referenceToggleNodeTags(nodes,ids,tag){
 const selected=new Set(ids),targets=nodes.filter(node=>selected.has(node.id)),remove=targets.length&&targets.every(node=>node.referenceTagIds?.includes(tag));
 return targets.map(node=>({id:node.id,tags:remove?(node.referenceTagIds||[]).filter(id=>id!==tag):[...new Set([...(node.referenceTagIds||[]),tag])]}));
}
/** Find a re-rendered tag control without relying on a detached menu button. */
function referenceFocusTagOpener(opener){
 if(!opener||opener.project!==S.project)return;
 const target=opener.element?.isConnected?opener.element:opener.nodeId?[...document.querySelectorAll('[data-tag-node]')].find(node=>node.dataset.tagNode===opener.nodeId):document.querySelector(opener.batch?'[data-tag-apply]':'[data-tag-filter]');
 (target||document.querySelector('[data-tag-filter]')||document.querySelector('[aria-label="节点管理"]'))?.focus({preventScroll:true});
}
function referenceCloseTagPicker(restoreFocus=false){
 const opener=referenceTagOpener;document.querySelector('.canvas-tag-picker')?.remove();referenceTagTarget=null;referenceTagOpener=null;
 if(restoreFocus)referenceFocusTagOpener(opener);return opener;
}
function referenceOpenTagPicker(anchor,ids=null){
 referenceCloseTagPicker();referenceTagTarget=ids?{ids:[...ids],project:S.project}:null;referenceTagOpener={element:anchor,project:S.project,nodeId:anchor.dataset.tagNode,batch:anchor.hasAttribute('data-tag-apply')};
 const filter=!ids,all=referenceTags(),rect=anchor.getBoundingClientRect();
 const choices=all.map(tag=>{const active=filter?canvasNavigatorState().tagFilter===tag.id:ids.every(id=>nodeById(id)?.referenceTagIds?.includes(tag.id));return `<button data-tag-choice="${tag.id}" role="menuitemcheckbox" aria-checked="${active}"><i style="background:${tag.color}"></i><span>${esc(tag.name)}</span>${active?I('check'):''}</button>`;}).join('');
 document.body.insertAdjacentHTML('beforeend',`<div class="canvas-tag-picker" role="menu" aria-label="${filter?'按标签筛选':'节点标签'}" style="left:${Math.max(12,Math.min(innerWidth-192,rect.left))}px;top:${Math.max(12,Math.min(innerHeight-340,rect.bottom+6))}px">${filter?'<button data-tag-clear>全部标签</button>':''}${choices}<hr><button data-tag-new>＋ 新建标签</button><button data-tag-manage>管理标签</button></div>`);
 const menu=document.querySelector('.canvas-tag-picker'),minTop=Math.max(12,(document.querySelector('.ref-canvas-header')?.getBoundingClientRect().bottom||0)+8);
 menu.style.maxHeight=Math.max(48,Math.min(316,innerHeight-minTop-12))+'px';menu.style.top=Math.max(minTop,Math.min(innerHeight-menu.offsetHeight-12,rect.bottom+6))+'px';
 menu.querySelector('button')?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{
 const target=event.target;
 if(target.closest('[data-tag-batch]')){event.preventDefault();event.stopImmediatePropagation();canvasNavigatorState().batch=!canvasNavigatorState().batch;referenceTagSelected=[];render();save();return;}
 const groupSelect=target.closest('[data-tag-group]');if(groupSelect){event.stopImmediatePropagation();const group=canvasFilteredNavigationGroups(canvasCurrentNavigationGroups(),canvasNavigatorState().query).find(group=>group.id===groupSelect.dataset.tagGroup);if(group){referenceTagSelected=referenceSelectGroupMembers(referenceTagSelection(),group.nodes.map(node=>node.id),groupSelect.checked);referenceSyncBatchSelection();}return;}
 const select=target.closest('[data-tag-select]');if(select){event.stopImmediatePropagation();referenceTagSelected=select.checked?[...new Set([...referenceTagSelection(),select.dataset.tagSelect])]:referenceTagSelection().filter(id=>id!==select.dataset.tagSelect);referenceSyncBatchSelection();if(typeof referenceRefreshBatchFooter!=='function'){document.querySelector('.canvas-tag-batch span').textContent=`已选 ${referenceTagSelection().length} 项`;document.querySelector('[data-tag-apply]').disabled=!referenceTagSelection().length;}return;}
 if(target.closest('[data-tag-all]')){event.preventDefault();event.stopImmediatePropagation();const ids=canvasFilteredNavigationGroups(canvasCurrentNavigationGroups(),canvasNavigatorState().query).flatMap(group=>group.nodes.map(node=>node.id));const all=ids.every(id=>referenceTagSelection().includes(id));referenceTagSelected=all?referenceTagSelection().filter(id=>!ids.includes(id)):[...new Set([...referenceTagSelection(),...ids])];referenceSyncBatchSelection();document.querySelector('input[data-tag-all]')?.focus({preventScroll:true});return;}
 const node=target.closest('[data-tag-node]'),filter=target.closest('[data-tag-filter]'),batch=target.closest('[data-tag-apply]');
 if(node||filter||batch){event.preventDefault();event.stopImmediatePropagation();referenceOpenTagPicker(node||filter||batch,node?[node.dataset.tagNode]:batch?referenceTagSelection():null);return;}
 const choice=target.closest('[data-tag-choice]');if(choice){event.preventDefault();event.stopImmediatePropagation();const id=choice.dataset.tagChoice;
  if(referenceTagTarget){if(referenceTagTarget.project!==S.project){referenceCloseTagPicker();return;}const after=referenceToggleNodeTags(S.nodes,referenceTagTarget.ids,id),before=after.map(item=>({id:item.id,tags:[...(nodeById(item.id).referenceTagIds||[])]}));if(JSON.stringify(before)!==JSON.stringify(after)){studioRecordCanvasHistory({type:'node-tags',before,after});after.forEach(item=>nodeById(item.id).referenceTagIds=item.tags);S.revision++;}}
  else canvasNavigatorState().tagFilter=canvasNavigatorState().tagFilter===id?null:id;
  const opener=referenceCloseTagPicker();render();save();referenceFocusTagOpener(opener);return;
 }
 if(target.closest('[data-tag-clear]')){event.preventDefault();event.stopImmediatePropagation();canvasNavigatorState().tagFilter=null;const opener=referenceCloseTagPicker();render();save();referenceFocusTagOpener(opener);return;}
 if(target.closest('[data-tag-manage]')){event.preventDefault();event.stopImmediatePropagation();const opener=referenceCloseTagPicker();referenceManageTags(opener);return;}
 if(target.closest('[data-tag-new]')){event.preventDefault();event.stopImmediatePropagation();const opener=referenceCloseTagPicker();referenceOpenTagManager(true,opener);return;}
 if(!target.closest('.canvas-tag-picker'))referenceCloseTagPicker();
},true);
document.addEventListener('keydown',event=>{
 const menu=document.querySelector('.canvas-tag-picker');if(!menu)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseTagPicker(true);return;}
 if(event.key==='Tab'){referenceCloseTagPicker(true);return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index+buttons.length-1)%buttons.length;event.preventDefault();buttons[next].focus();
},true);
function referenceManageTags(opener){referenceOpenTagManager(false,opener);}
if(S.screen==='canvas')render();

window.addEventListener('resize',()=>referenceCloseTagPicker(true));
