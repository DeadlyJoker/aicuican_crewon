/* Character reference imagery is separate from the creation-agent directory. */
'use strict';
let referenceCharacterDetailParents=[],referenceCharacterImageParent=null,referenceCharacterLibraryOpener=null;
let referenceCharacterPanel={query:'',favorites:false,selected:null,world:'全部',mode:'world',attributes:{}};
S.referenceCharacterFavorites??=[];
function referenceImportCharacter(state,item,ids,position){
 if(!item||item.views.length!==3||ids.length!==3||new Set(ids).size!==3||ids.some(id=>state.nodes.some(n=>n.id===id)))return {ok:false,error:'角色素材不完整，未添加任何内容'};
 const before=referenceCaptureNodeGraph(state);
 item.views.forEach((view,index)=>{
  const id=ids[index],candidateId=id+'-imported';
  const importedAsset={catalogId:item.id,name:item.name,view:view.label,source:view.source,image:view.image};
  state.nodes.push({id,kind:'image',label:'图片',title:item.name+' · '+view.label,x:position.x+index*280,y:position.y,w:244,h:300,frame:view.frame,prompt:'',description:'角色参考素材 · '+view.label,assetReferences:[],adoptedCandidateId:candidateId,candidates:[{id:candidateId,number:1,frame:view.frame,kind:'image',createdAt:new Date().toISOString(),sourceReferences:[],importedAsset}]});
  if(Array.isArray(state.layoutBase))state.layoutBase.push({id,x:position.x+index*280,y:position.y});
 });
 return {ok:true,ids,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
function referenceCharacterList(){
 const p=referenceCharacterPanel,query=p.query.trim().toLocaleLowerCase();
 return referenceCharacterCatalog.filter(item=>(p.world==='全部'||item.world===p.world)&&Object.entries(p.attributes).every(([key,value])=>!value||item.attributes?.[key]?.includes(value))&&(!query||item.name.toLocaleLowerCase().includes(query))&&(!p.favorites||S.referenceCharacterFavorites.includes(item.id)));
}
function referenceCharacterFilterFields(){
 const p=referenceCharacterPanel;
 if(p.mode==='world')return `<nav class="ref-character-worlds" aria-label="世界背景">${['全部','近代','架空'].map(world=>`<button data-character-world="${world}" aria-pressed="${p.world===world}">${world}</button>`).join('')}</nav>`;
 const field=([key,label])=>{const values=[...new Set(referenceCharacterCatalog.flatMap(item=>item.attributes?.[key]||[]))];return `<select data-character-attribute="${key}" aria-label="${label}"><option value="">${label}</option>${values.map(value=>`<option ${p.attributes[key]===value?'selected':''}>${esc(value)}</option>`).join('')}</select>`;};
 return `<div class="ref-character-attributes">${[['gender','性别'],['age','年龄'],['species','物种']].map(field).join('')}</div><details class="ref-character-more"><summary>更多属性</summary><div class="ref-character-attributes">${[['body','体型'],['height','身高'],['hairLength','发长'],['hairColor','发色'],['temperament','气质'],['dimension','渲染维度'],['style','风格']].map(field).join('')}</div></details>`;
}
function pResetCharacterFilters(){referenceCharacterPanel.attributes={};referenceCharacterPanel.world='全部';referenceCharacterPanel.query='';referenceCharacterPanel.favorites=false;document.querySelector('[data-character-search]').value='';document.querySelector('[data-character-only-favorites]').setAttribute('aria-pressed','false');document.querySelector('.ref-character-filter-fields').innerHTML=referenceCharacterFilterFields();document.querySelector('.ref-character-grid').innerHTML=referenceCharacterGrid();}
function referenceCharacterGrid(){
 const list=referenceCharacterList(),filters=[referenceCharacterPanel.world==='全部'?'':referenceCharacterPanel.world,...Object.values(referenceCharacterPanel.attributes),referenceCharacterPanel.favorites?'已收藏':''].filter(Boolean);
 return `<div class="ref-character-result-state" role="status">${esc([...filters,list.length+' 个角色'].join(' · '))}</div>`+(list.map(item=>`<article><button class="ref-character-open" data-character-open="${item.id}" aria-label="查看${esc(item.name)}详情"><img src="${item.views[0].image}" alt="${esc(item.name)}"><span>${esc(item.name)}</span></button><button class="ref-character-star" data-character-favorite="${item.id}" aria-pressed="${S.referenceCharacterFavorites.includes(item.id)}" aria-label="收藏${esc(item.name)}">${I(S.referenceCharacterFavorites.includes(item.id)?'check':'pin')}</button></article>`).join('')||'<p class="ref-character-empty">没有匹配的角色</p>');
}
function referenceCloseCharacterDetail(restoreFocus=true){
 const id=referenceCharacterPanel.selected;referenceCloseCharacterImage();document.querySelector('.ref-character-detail-mask')?.remove();
 for(const {element,inert}of referenceCharacterDetailParents)element.inert=inert;referenceCharacterDetailParents=[];referenceCharacterPanel.selected=null;
 if(restoreFocus)document.querySelector(`.ref-character-library [data-character-open="${id}"]`)?.focus({preventScroll:true});
}
function referenceCloseCharacterLibrary(){referenceCloseCharacterDetail(false);document.querySelector('.ref-character-library')?.remove();if(referenceCharacterLibraryOpener?.isConnected)referenceCharacterLibraryOpener.focus({preventScroll:true});referenceCharacterLibraryOpener=null;}
function referenceOpenCharacterLibrary(){
 if(document.querySelector('.ref-character-library')){referenceCloseCharacterLibrary();return;}
 const p=referenceCharacterPanel;referenceCharacterLibraryOpener=document.querySelector('[data-action="character-library"]')||document.activeElement;
 document.body.insertAdjacentHTML('beforeend',`<section class="ref-character-library" role="dialog" aria-label="角色库"><header><h2>角色库</h2><button data-character-close aria-label="关闭角色库">${I('close')}</button></header><div class="ref-character-filter"><label>${I('search')}<input aria-label="搜索角色" placeholder="搜索角色" value="${esc(p.query)}" data-character-search></label><button data-character-only-favorites aria-pressed="${p.favorites}" aria-label="只看已收藏">${I('pin')}</button></div><nav class="ref-character-filter-modes" aria-label="角色筛选方式">${[['world','世界背景'],['attributes','角色属性']].map(([mode,label])=>`<button data-character-mode="${mode}" aria-pressed="${p.mode===mode}">${label}</button>`).join('')}<button data-character-reset>重置</button></nav><div class="ref-character-filter-fields">${referenceCharacterFilterFields()}</div><div class="ref-character-grid">${referenceCharacterGrid()}</div><footer>本地研究目录 · 20 份形象参考</footer></section>`);
 document.querySelector('[data-character-search]').focus({preventScroll:true});
}
function referenceOpenCharacterDetail(id){
 const item=referenceCharacterCatalog.find(v=>v.id===id);if(!item)return;
 if(!document.querySelector('.ref-character-detail-mask')){
  referenceCharacterDetailParents=[document.querySelector('.ref-character-library'),document.getElementById('app')].filter(Boolean).map(element=>({element,inert:element.inert}));
  for(const {element}of referenceCharacterDetailParents)element.inert=true;
 }
 document.querySelector('.ref-character-detail-mask')?.remove();referenceCharacterPanel.selected=id;
 const list=referenceCharacterList(),index=list.indexOf(item);
 document.body.insertAdjacentHTML('beforeend',`<div class="ref-character-detail-mask"><section class="ref-character-detail" role="dialog" aria-modal="true" aria-label="${esc(item.name)}"><button class="ref-character-detail-close" data-character-detail-close aria-label="关闭角色详情">${I('close')}</button><div class="ref-character-views">${item.views.map((view,index)=>`<figure><button data-character-preview="${index}" aria-label="放大${esc(item.name+' · '+view.label)}"><img src="${view.image}" alt="${esc(item.name+' · '+view.label)}"></button><figcaption>${view.label}</figcaption></figure>`).join('')}</div><div class="ref-character-title"><h2>${esc(item.name)}</h2><button data-character-import="${item.id}">添加到画布</button></div><nav aria-label="切换角色"><button data-character-prev ${index<=0?'disabled':''} aria-label="上一个角色">${I('chev')}</button><div>${list.map(role=>`<button data-character-open="${role.id}" aria-pressed="${role.id===id}" aria-label="切换到${esc(role.name)}"><img src="${role.views[0].image}" alt=""></button>`).join('')}</div><button data-character-next ${index>=list.length-1?'disabled':''} aria-label="下一个角色">${I('chev')}</button></nav></section></div>`);
 document.querySelector('[data-character-detail-close]').focus();
}
let referenceCharacterImageIndex=0;
function referenceOpenCharacterImage(index){
 const item=referenceCharacterCatalog.find(v=>v.id===referenceCharacterPanel.selected);if(!item||!Number.isInteger(index)||index<0||index>=item.views.length)return;
 referenceCloseCharacterImage();referenceCharacterImageIndex=index;const parent=document.querySelector('.ref-character-detail-mask');if(parent){referenceCharacterImageParent={element:parent,inert:parent.inert};parent.inert=true;}const view=item.views[index];
 document.body.insertAdjacentHTML('beforeend',`<div class="ref-character-image-preview" role="dialog" aria-modal="true" aria-label="${esc(item.name+' · '+view.label)}"><img src="${view.image}" alt="${esc(item.name+' · '+view.label)}"><button class="ref-character-image-close" data-character-image-close aria-label="关闭放大图片">${I('close')}</button><button class="ref-character-image-prev" data-character-image-step="-1" aria-label="上一张" ${index===0?'disabled':''}>${I('chev')}</button><button class="ref-character-image-next" data-character-image-step="1" aria-label="下一张" ${index===item.views.length-1?'disabled':''}>${I('chev')}</button><span class="ref-character-image-count">${index+1} / ${item.views.length} · ${view.label}</span></div>`);
 document.querySelector('[data-character-image-close]').focus({preventScroll:true});
}
function referenceCloseCharacterImage(){if(!document.querySelector('.ref-character-image-preview'))return;document.querySelector('.ref-character-image-preview').remove();if(referenceCharacterImageParent)referenceCharacterImageParent.element.inert=referenceCharacterImageParent.inert;referenceCharacterImageParent=null;document.querySelector(`[data-character-preview="${referenceCharacterImageIndex}"]`)?.focus({preventScroll:true});}
document.addEventListener('click',event=>{
 const zoom=event.target.closest('[data-character-preview]'),step=event.target.closest('[data-character-image-step]');
 if(zoom||step||event.target.closest('[data-character-image-close]')){event.preventDefault();event.stopImmediatePropagation();if(zoom)referenceOpenCharacterImage(Number(zoom.dataset.characterPreview));else if(step)referenceOpenCharacterImage(referenceCharacterImageIndex+Number(step.dataset.characterImageStep));else referenceCloseCharacterImage();}
},true);
document.addEventListener('input',event=>{if(!event.target.matches('[data-character-search]'))return;referenceCharacterPanel.query=event.target.value;document.querySelector('.ref-character-grid').innerHTML=referenceCharacterGrid();});
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-character-open],[data-character-favorite],[data-character-only-favorites],[data-character-close],[data-character-detail-close],[data-character-prev],[data-character-next],[data-character-import],[data-character-world],[data-character-mode],[data-character-reset]');if(!target)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(target.hasAttribute('data-character-close'))return referenceCloseCharacterLibrary();
 if(target.hasAttribute('data-character-detail-close')){referenceCloseCharacterDetail();return;}
 if(target.hasAttribute('data-character-reset')){pResetCharacterFilters();return;}
 if(target.dataset.characterMode){referenceCharacterPanel.mode=target.dataset.characterMode;document.querySelectorAll('[data-character-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.characterMode===referenceCharacterPanel.mode)));document.querySelector('.ref-character-filter-fields').innerHTML=referenceCharacterFilterFields();return;}
 if(target.dataset.characterWorld){referenceCharacterPanel.world=target.dataset.characterWorld;document.querySelectorAll('[data-character-world]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.characterWorld===referenceCharacterPanel.world)));document.querySelector('.ref-character-grid').innerHTML=referenceCharacterGrid();return;}
 if(target.dataset.characterOpen)return referenceOpenCharacterDetail(target.dataset.characterOpen);
 if(target.dataset.characterFavorite){const id=target.dataset.characterFavorite;S.referenceCharacterFavorites=S.referenceCharacterFavorites.includes(id)?S.referenceCharacterFavorites.filter(v=>v!==id):[...S.referenceCharacterFavorites,id];save();}
 else if(target.hasAttribute('data-character-only-favorites')){referenceCharacterPanel.favorites=!referenceCharacterPanel.favorites;target.setAttribute('aria-pressed',String(referenceCharacterPanel.favorites));}
 else if(target.hasAttribute('data-character-prev')||target.hasAttribute('data-character-next')){const list=referenceCharacterList(),at=list.findIndex(v=>v.id===referenceCharacterPanel.selected),next=list[at+(target.hasAttribute('data-character-next')?1:-1)];if(next)referenceOpenCharacterDetail(next.id);return;}
 else if(target.dataset.characterImport){
  const item=referenceCharacterCatalog.find(v=>v.id===target.dataset.characterImport),ids=Array.from({length:3},()=>studioScriptId('character-view'));
  const result=referenceImportCharacter(S,item,ids,{x:Math.max(0,...S.nodes.map(n=>n.x+n.w))+100,y:180});if(!result.ok){toast(result.error);return;}
  studioRecordCanvasHistory(result.entry);S.revision++;S.selected=null;S.panel=null;referenceCloseCharacterLibrary();render();fitCanvas(true);referenceMultiSelection=ids;referenceSyncMultiSelection();save();toast('已添加三种视图，可一起撤销');return;
 }
 document.querySelector('.ref-character-grid').innerHTML=referenceCharacterGrid();
},true);
document.addEventListener('keydown',event=>{const preview=document.querySelector('.ref-character-image-preview');if(preview){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseCharacterImage();}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopImmediatePropagation();referenceOpenCharacterImage(referenceCharacterImageIndex+(event.key==='ArrowRight'?1:-1));}else if(event.key==='Tab'){const controls=[...preview.querySelectorAll('button:not(:disabled)')],at=controls.indexOf(document.activeElement);if(event.shiftKey&&at<=0){event.preventDefault();controls.at(-1).focus();}else if(!event.shiftKey&&at===controls.length-1){event.preventDefault();controls[0].focus();}}return;}const detail=document.querySelector('.ref-character-detail-mask');if(detail&&event.key==='Tab'){const controls=[...detail.querySelectorAll('button:not(:disabled)')],at=controls.indexOf(document.activeElement);if(event.shiftKey&&at<=0){event.preventDefault();event.stopImmediatePropagation();controls.at(-1)?.focus();}else if(!event.shiftKey&&at===controls.length-1){event.preventDefault();event.stopImmediatePropagation();controls[0]?.focus();}return;}if(event.key!=='Escape'||!document.querySelector('.ref-character-library'))return;event.preventDefault();event.stopImmediatePropagation();if(document.querySelector('.ref-character-detail-mask'))referenceCloseCharacterDetail();else referenceCloseCharacterLibrary();},true);
const referenceCharacterLibraryAction=handleAction;
handleAction=function(action){if(action==='character-library'){referenceOpenCharacterLibrary();return;}referenceCharacterLibraryAction(action);};

document.addEventListener('change',event=>{if(!event.target.matches('[data-character-attribute]'))return;referenceCharacterPanel.attributes[event.target.dataset.characterAttribute]=event.target.value;document.querySelector('.ref-character-grid').innerHTML=referenceCharacterGrid();});
