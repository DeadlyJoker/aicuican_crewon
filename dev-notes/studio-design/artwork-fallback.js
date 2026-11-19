/* Failed promotional artwork keeps its card usable without exposing a broken image glyph. */
'use strict';
document.addEventListener('error',event=>{
 const image=event.target;
 if(!(image instanceof HTMLImageElement)||!image.matches('.ref-feature-image img,.ref-feature-banner img')||image.dataset.artworkFailed)return;
 image.dataset.artworkFailed='true';image.hidden=true;
 const fallback=document.createElement('span');fallback.className='ref-artwork-unavailable';fallback.setAttribute('role','img');fallback.setAttribute('aria-label','预览图片暂不可用');
 fallback.textContent='暂无预览';
 image.parentElement.append(fallback);
},true);
