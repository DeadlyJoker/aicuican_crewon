/* Image presets remain separate from prompt text and existing adopted results. */
'use strict';
let imagePresetPanel=null;
function imagePresetSelected(d){return structuredClone(d.creationImagePresets||{});}
function imagePresetChoose(state,nodeId,type,value){
 const node=state.nodes.find(node=>node.id===nodeId);if(!node||!['image','character','scene'].includes(node.kind)||!['filters','functions','custom'].includes(type))return false;
 state.nodeDrafts??={};const draft=state.nodeDrafts[nodeId]??={},selected=imagePresetSelected({...node.creationPreferences,...draft});
 if(value)selected[type]=structuredClone(value);else delete selected[type];draft.creationImagePresets=selected;return true;
}
function imagePresetTriggerHtml(){return `<button class="image-preset-trigger" data-action="image-presets-open" aria-label="预设" title="预设">${I('grid')}</button>`;}
function canvasPresetTagsHtml(d){return `<div class="image-preset-tags">${Object.entries(imagePresetSelected(d)).map(([type,value])=>`<span><button data-action="image-presets-open:${type}" aria-label="编辑预设 ${esc(value.name||'自定义')}">${esc(value.name||'自定义')}</button><button data-action="image-presets-remove:${type}" aria-label="移除预设 ${esc(value.name||'自定义')}">${I('close')}</button></span>`).join('')}</div>`;}
function imagePresetPosition(){
 const panel=document.querySelector('.image-preset-panel'),anchor=document.querySelector('.image-preset-trigger');if(!panel||!anchor)return;
 const r=anchor.getBoundingClientRect(),width=Math.min(760,innerWidth-24),height=Math.min(460,innerHeight-24);
 panel.style.width=width+'px';panel.style.height=height+'px';panel.style.left=Math.max(12,Math.min(innerWidth-width-12,r.left+r.width/2-width/2))+'px';panel.style.top=Math.max(12,Math.min(innerHeight-height-12,r.top-height-10))+'px';
}
function imagePresetItems(){
 const p=imagePresetPanel,favorites=S.referenceImagePresetFavorites||[];
 return (imagePresetCatalog[p.tab]||[]).map((item,index)=>({...item,index})).filter(item=>(!p.favorites||favorites.includes(p.tab+':'+item.name))&&item.name.toLocaleLowerCase().includes(p.query.toLocaleLowerCase()));
}
function imagePresetContent(){
 const p=imagePresetPanel;if(p.tab==='custom')return `<div class="image-preset-custom"><aside><button data-preset-custom="" aria-pressed="${!p.customId}">无预设</button>${(S.referenceCustomImagePresets||[]).map(item=>`<button data-preset-custom="${item.id}" aria-pressed="${p.customId===item.id}">${esc(item.name)}</button>`).join('')}</aside><div><div class="image-preset-field"><span><label for="image-preset-prefix">前缀内容</label><button data-preset-save-open aria-label="保存为预设">+ 保存为预设</button></span><textarea id="image-preset-prefix" aria-label="前缀内容" data-preset-field="prefix" placeholder="在主体描述前使用的风格与制作要求">${esc(p.custom.prefix||'')}</textarea></div><div class="image-preset-field"><span><label for="image-preset-suffix">后缀内容</label></span><textarea id="image-preset-suffix" aria-label="后缀内容" data-preset-field="suffix" placeholder="在主体描述后使用的限制与质量要求">${esc(p.custom.suffix||'')}</textarea></div><p class="image-preset-error" role="alert"></p><footer><button data-preset-clear>清空</button><button data-preset-apply>应用</button></footer></div></div>`;
 const selected=imagePresetSelected(canvasCreationDraft(nodeById(p.nodeId)))[p.tab],favorites=S.referenceImagePresetFavorites||[];
 return `<nav class="image-preset-filter"><button data-preset-favorites="yes" aria-pressed="${p.favorites}">收藏</button><button data-preset-favorites="no" aria-pressed="${!p.favorites}">全部</button></nav><div class="image-preset-grid">${imagePresetItems().map(item=>`<article><button class="image-preset-card" data-preset-pick="${item.index}" ${item.name==='无'?'disabled':''} aria-pressed="${selected?.name===item.name}" aria-label="${esc(item.name)}"><img src="${esc(item.image)}" alt="" loading="lazy"><span>${esc(item.name)}</span>${selected?.name===item.name?`<i>${I('check')}</i>`:''}</button>${item.name!=='无'?`<button class="image-preset-favorite" data-preset-favorite="${item.index}" aria-label="${favorites.includes(p.tab+':'+item.name)?'取消收藏':'收藏'} ${esc(item.name)}" aria-pressed="${favorites.includes(p.tab+':'+item.name)}">${I('favorite-star')}</button>`:''}</article>`).join('')||'<p>没有匹配的预设</p>'}</div>`;
}
function imagePresetDraw(){
 const p=imagePresetPanel;if(!p)return;document.querySelector('.image-preset-layer')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="image-preset-layer"><section class="image-preset-panel" role="dialog" aria-modal="true" aria-label="图片预设"><header><nav role="tablist" aria-label="预设分类">${[['filters','滤镜'],['functions','功能'],['custom','自定义']].map(([type,name])=>`<button role="tab" aria-selected="${p.tab===type}" data-preset-tab="${type}">${name}</button>`).join('')}</nav>${p.tab!=='custom'?`<label>${I('search')}<input type="search" aria-label="搜索预设" placeholder="搜索预设" value="${esc(p.query)}"></label>`:''}<button data-preset-close aria-label="关闭预设">${I('close')}</button></header><main>${imagePresetContent()}</main></section></div>`);imagePresetPosition();
}
function imagePresetClose(){document.querySelector('.image-preset-layer')?.remove();imagePresetPanel=null;document.querySelector('.image-preset-trigger')?.focus({preventScroll:true});}
function imagePresetOpen(tab='filters'){
 const node=canvasCreationNode();if(!node||mediaKind(node)!=='image')return;
 const custom=imagePresetSelected(canvasCreationDraft(node)).custom||{};imagePresetPanel={tab:['filters','functions','custom'].includes(tab)?tab:'filters',nodeId:node.id,project:S.project,query:'',favorites:false,custom:structuredClone(custom),customId:custom.id||null};imagePresetDraw();document.querySelector('[data-preset-tab]')?.focus();
}
function imagePresetCommit(type,value){const p=imagePresetPanel;if(p.project!==S.project)return;imagePresetChoose(S,p.nodeId,type,value);imagePresetClose();refreshCanvasCreation();save();}
function imagePresetSavePrompt(){
 const p=imagePresetPanel;if(!p.custom.prefix?.trim()&&!p.custom.suffix?.trim()){document.querySelector('.image-preset-error').textContent='请先填写前缀或后缀内容';return;}
 document.querySelector('.image-preset-panel').insertAdjacentHTML('beforeend',`<div class="image-preset-save-mask"><section role="dialog" aria-modal="true" aria-label="保存为预设"><h3>保存为预设</h3><label>名称<input aria-label="预设名称" maxlength="60"></label><p role="alert"></p><footer><button data-preset-save-cancel>取消</button><button data-preset-save-confirm>保存</button></footer></section></div>`);document.querySelector('[aria-label="预设名称"]').focus();
}
const imagePresetAction=handleAction;
handleAction=function(action){if(action.startsWith('image-presets-open')){imagePresetOpen(action.split(':')[1]);return;}if(action.startsWith('image-presets-remove:')){const node=canvasCreationNode();if(node){imagePresetChoose(S,node.id,action.split(':')[1],null);refreshCanvasCreation();save();}return;}imagePresetAction(action);};
document.addEventListener('input',event=>{
 const p=imagePresetPanel;if(!p)return;
 if(event.target.matches('[aria-label="搜索预设"]')){p.query=event.target.value;document.querySelector('.image-preset-panel main').innerHTML=imagePresetContent();}
 if(event.target.dataset.presetField)p.custom[event.target.dataset.presetField]=event.target.value;
});
document.addEventListener('click',event=>{
 const p=imagePresetPanel;if(!p)return;const target=event.target;
 if(target.matches('.image-preset-layer')||target.closest('[data-preset-close]')){imagePresetClose();return;}
 const tab=target.closest('[data-preset-tab]'),pick=target.closest('[data-preset-pick]'),favorite=target.closest('[data-preset-favorite]'),filter=target.closest('[data-preset-favorites]'),custom=target.closest('[data-preset-custom]');
 if(tab){p.tab=tab.dataset.presetTab;p.query='';p.favorites=false;imagePresetDraw();return;}
 if(filter){p.favorites=filter.dataset.presetFavorites==='yes';imagePresetDraw();return;}
 if(pick){const item=imagePresetCatalog[p.tab]?.[Number(pick.dataset.presetPick)];if(item&&item.name!=='无')imagePresetCommit(p.tab,{name:item.name,image:item.image});return;}
 if(favorite){const item=imagePresetCatalog[p.tab]?.[Number(favorite.dataset.presetFavorite)];if(!item)return;const key=p.tab+':'+item.name,list=S.referenceImagePresetFavorites||[];S.referenceImagePresetFavorites=list.includes(key)?list.filter(value=>value!==key):[...list,key];const top=document.querySelector('.image-preset-grid').scrollTop;imagePresetDraw();document.querySelector('.image-preset-grid').scrollTop=top;save();return;}
 if(custom){const item=(S.referenceCustomImagePresets||[]).find(item=>item.id===custom.dataset.presetCustom);p.custom=item?structuredClone(item):{};p.customId=item?.id||null;imagePresetDraw();return;}
 if(target.closest('[data-preset-clear]')){p.custom={};p.customId=null;imagePresetDraw();return;}
 if(target.closest('[data-preset-apply]')){const data={name:p.custom.name||'自定义',prefix:p.custom.prefix||'',suffix:p.custom.suffix||'',...(p.customId?{id:p.customId}:{})};imagePresetCommit('custom',data.prefix.trim()||data.suffix.trim()?data:null);return;}
 if(target.closest('[data-preset-save-open]')){imagePresetSavePrompt();return;}
 if(target.closest('[data-preset-save-cancel]')){document.querySelector('.image-preset-save-mask').remove();return;}
 if(target.closest('[data-preset-save-confirm]')){
  const mask=document.querySelector('.image-preset-save-mask'),name=mask.querySelector('input').value.trim();if(!name){mask.querySelector('[role=alert]').textContent='请填写预设名称';return;}
  const list=S.referenceCustomImagePresets||[];if(list.some(item=>item.name===name)){mask.querySelector('[role=alert]').textContent='已有同名预设，请换一个名称';return;}
  const item={id:studioScriptId('image-preset'),name,prefix:p.custom.prefix||'',suffix:p.custom.suffix||''};S.referenceCustomImagePresets=[...list,item];p.custom=structuredClone(item);p.customId=item.id;imagePresetDraw();save();
 }
});
window.addEventListener('keydown',event=>{
 if(!imagePresetPanel)return;event.stopPropagation();
 const mask=document.querySelector('.image-preset-save-mask');if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(mask)mask.remove();else imagePresetClose();return;}
 if(event.key==='Tab'){const root=mask||document.querySelector('.image-preset-panel'),controls=[...root.querySelectorAll('button,input,textarea')].filter(el=>!el.disabled&&el.getClientRects().length),at=controls.indexOf(document.activeElement);if(event.shiftKey&&at<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&(at===controls.length-1||at<0)){event.preventDefault();controls[0]?.focus();}}
},true);
window.addEventListener('resize',imagePresetPosition);
if(document.getElementById('viewport'))refreshCanvasCreation();
