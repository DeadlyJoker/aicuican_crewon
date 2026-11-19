/* Expand explicit asset mentions in place without changing the storyboard draft. */
'use strict';
/** Missing reference images leave the asset description readable without an empty image column. */
function referenceStoryboardMentionDetailHtml(asset){
 const candidate=studioAdoptedCandidate(asset),ready=Boolean(candidate&&!asset.referenceOnly),kind=asset.kind==='character'?'出镜角色':asset.kind==='scene'?'分镜场景':'关联道具';
 const image=ready?`<button class="ref-sb-mention-image" data-sb-preview="${asset.id}" data-preview-title="${esc(asset.title)}" aria-label="查看 ${esc(asset.title)}"><span class="ref-sb-asset-image still frame${candidate.frame}"></span></button>`:'';
 return `<button class="ref-sb-mention-close" data-sb-mention-close aria-label="收起素材详情">${I('close')}</button>${image}<div><strong>${esc('@'+asset.title)}</strong><small>${kind}${ready?' · v'+candidate.number:' · 暂无参考图'}</small><p>${esc(asset.description||asset.prompt||'未填写描述')}</p></div>`;
}
document.addEventListener('click',event=>{
 const mention=event.target.closest('[data-sb-mention]'),close=event.target.closest('[data-sb-mention-close]');if(!mention&&!close)return;
 event.preventDefault();event.stopImmediatePropagation();
 const field=(mention||close).closest('.ref-sb-read-field');if(!field)return;
 const detail=field.querySelector('.ref-sb-mention-detail'),previous=field.querySelector('[data-sb-mention][aria-expanded="true"]');
 detail?.remove();previous?.setAttribute('aria-expanded','false');
 if(close){previous?.focus({preventScroll:true});return;}if(previous===mention)return;
 const asset=nodeById(mention.dataset.sbMention);if(!asset)return;
 const box=document.createElement('div');box.className='ref-sb-mention-detail';box.setAttribute('role','region');box.setAttribute('aria-label','素材详情');
 box.innerHTML=referenceStoryboardMentionDetailHtml(asset);box.classList.toggle('ref-sb-mention-text-only',!box.querySelector('.ref-sb-mention-image'));
 mention.setAttribute('aria-expanded','true');field.append(box);box.scrollIntoView({block:'nearest',inline:'nearest'});
},true);

/** Dismiss the active inline inspection before the surrounding workbench. */
window.addEventListener('keydown',event=>{
 if(event.key!=='Escape'||referenceAssetPreview||referenceStoryboardEdit)return;
 const details=[...document.querySelectorAll('.ref-sb-mention-detail')];if(!details.length)return;
 const field=document.activeElement.closest('.ref-sb-read-field'),detail=field?.querySelector('.ref-sb-mention-detail')||details.at(-1);
 const owner=detail.closest('.ref-sb-read-field'),opener=owner.querySelector('[data-sb-mention][aria-expanded="true"]');
 event.preventDefault();event.stopImmediatePropagation();detail.remove();opener?.setAttribute('aria-expanded','false');opener?.focus({preventScroll:true});
},true);
