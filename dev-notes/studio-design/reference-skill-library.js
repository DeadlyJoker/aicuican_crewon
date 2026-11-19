/* The full skill page and homepage share one local directory and detail presentation. */
'use strict';
const referenceSkillPurposes={'city-walk':'旅行记录','food-asmr':'美食内容','cafe-portrait':'人像摄影','script-adaptation':'剧本改编'};
function referenceSkillLibraryState(){return S.referenceSkillLibrary??={tab:'discover',purpose:'全部',query:'',scrolls:{}};}
function referenceSkillLibraryItems(state,skills){
 const favorites=state.referenceSkillFavorites||[],view=state.referenceSkillLibrary||{};
 return referenceFilterInspiration(skills,view.query||'').filter(skill=>(view.tab!=='favorites'||favorites.includes(skill.id))&&(!view.purpose||view.purpose==='全部'||referenceSkillPurposes[skill.id]===view.purpose));
}
/** A failed favorite write leaves the visible collection unchanged. */
function referenceToggleSkillFavorite(state,id,write){
 const previous=state.referenceSkillFavorites,items=previous||[];state.referenceSkillFavorites=items.includes(id)?items.filter(item=>item!==id):[...items,id];
 try{write();return {ok:true};}catch(error){if(previous===undefined)delete state.referenceSkillFavorites;else state.referenceSkillFavorites=previous;return {ok:false,error:'收藏未保存，请检查浏览器存储空间后重试'};}
}
function referenceSkillLibraryPage(){
 const view=referenceSkillLibraryState(),items=referenceSkillLibraryItems(S,referenceSkillCatalog),favorites=S.referenceSkillFavorites||[],key=JSON.stringify([view.tab,view.purpose,view.query]);
 return `<main class="ref-skill-library" aria-label="创作技能" tabindex="0" data-skill-view="${esc(key)}"><div class="ref-skill-library-tabs" role="tablist" aria-label="技能来源">${[['discover','发现'],['favorites','已收藏']].map(([id,label])=>`<button role="tab" aria-selected="${view.tab===id}" tabindex="${view.tab===id?0:-1}" data-skill-tab="${id}">${label}</button>`).join('')}</div><div class="ref-skill-library-toolbar"><nav aria-label="技能用途">${['全部',...new Set(Object.values(referenceSkillPurposes))].map(purpose=>`<button data-skill-purpose="${purpose}" aria-pressed="${view.purpose===purpose}">${purpose}</button>`).join('')}</nav><label>${I('search')}<input type="search" aria-label="搜索创作技能" placeholder="搜索技能或使用场景" value="${esc(view.query)}" data-skill-query></label></div><section class="ref-skill-library-grid" aria-label="技能列表">${items.map(skill=>`<article class="ref-skill-card"><button data-inspiration-skill="${skill.id}" aria-label="查看 ${esc(skill.name)}"><div class="ref-skill-card-cover"><img src="${esc(skill.cover)}" alt="${esc(skill.name)}对照封面"><small>${esc(skill.type)}</small></div><strong>${esc(skill.name)}</strong><p>${esc(skill.description)}</p></button><footer><small>本地样例 · v${skill.version}</small><button data-skill-favorite="${skill.id}" aria-label="${favorites.includes(skill.id)?'取消收藏':'收藏'} ${esc(skill.name)}" aria-pressed="${favorites.includes(skill.id)}" title="${favorites.includes(skill.id)?'取消收藏':'收藏'}">${I(favorites.includes(skill.id)?'check':'pin')}</button></footer></article>`).join('')||`<div class="ref-skill-library-empty"><p role="status">${view.query?'没有匹配的技能':view.tab==='favorites'?'还没有收藏技能':'此用途暂无技能'}</p>${view.query?'<button data-skill-query-clear>清空搜索</button>':''}</div>`}</section><p class="ref-skill-library-note">${items.length} 个本地技能样例 · 未连接 Agent 执行</p></main>`;
}
function referenceRememberSkillScroll(){const page=document.querySelector('.ref-skill-library');if(page)referenceSkillLibraryState().scrolls[page.dataset.skillView]=page.scrollTop;}
const referenceSkillLibraryHome=home;
home=function(){return referenceSection==='templates'?referenceSkillLibraryPage():referenceSkillLibraryHome();};
const referenceSkillLibraryRender=render;
render=function(){referenceRememberSkillScroll();referenceSkillLibraryRender();const page=document.querySelector('.ref-skill-library');if(page)page.scrollTop=referenceSkillLibraryState().scrolls[page.dataset.skillView]||0;};
const referenceSkillLibraryAction=handleAction;
handleAction=function(action){
 referenceRememberSkillScroll();
 if(action==='ref-nav:templates'){rememberProject();referenceSection='templates';S.screen='home';location.hash='skills';render();return;}
 referenceSkillLibraryAction(action);
};
document.addEventListener('input',event=>{
 if(!event.target.matches('[data-skill-query]'))return;
 const cursor=event.target.selectionStart;referenceSkillLibraryState().query=event.target.value;render();const input=document.querySelector('[data-skill-query]');input.focus({preventScroll:true});input.setSelectionRange(cursor,cursor);
});
document.addEventListener('click',event=>{
 const tab=event.target.closest('[data-skill-tab]'),purpose=event.target.closest('[data-skill-purpose]'),favorite=event.target.closest('[data-skill-favorite]'),clear=event.target.closest('[data-skill-query-clear]');if(!tab&&!purpose&&!favorite&&!clear)return;
 event.preventDefault();event.stopImmediatePropagation();const view=referenceSkillLibraryState();
 if(tab)view.tab=tab.dataset.skillTab;if(purpose)view.purpose=purpose.dataset.skillPurpose;if(clear)view.query='';
 if(favorite){const result=referenceToggleSkillFavorite(S,favorite.dataset.skillFavorite,persist);if(!result.ok){toast(result.error);return;}}
 const selector=tab?`[data-skill-tab="${CSS.escape(tab.dataset.skillTab)}"]`:purpose?`[data-skill-purpose="${CSS.escape(purpose.dataset.skillPurpose)}"]`:favorite?`[data-skill-favorite="${CSS.escape(favorite.dataset.skillFavorite)}"]`:'[data-skill-query]';
 render();save();document.querySelector(selector)?.focus({preventScroll:true});
},true);
document.addEventListener('keydown',event=>{
 const tab=event.target.closest('[data-skill-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=[...tab.parentElement.querySelectorAll('[data-skill-tab]')],index=tabs.indexOf(tab),next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+1)%tabs.length];event.preventDefault();event.stopImmediatePropagation();next.click();
},true);
window.addEventListener('hashchange',()=>{if(location.hash==='#skills'){referenceSection='templates';S.screen='home';render();}});
if(location.hash==='#skills'){referenceSection='templates';S.screen='home';render();}
