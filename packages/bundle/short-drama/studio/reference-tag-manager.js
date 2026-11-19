/* Tag catalog editing keeps stable ids and saves one explicit draft transaction. */
'use strict';
let referenceTagEditor=null,referenceDraggingTag=null,referenceTagPointer=null,referenceTagIgnoreClick=0;
const referenceTagSwatches=['#F9B902','#F97316','#EF4444','#EC4899','#A855F7','#6366F1','#3B82F6','#06B6D4','#22C55E','#14B8A6'];
function referenceValidateTagCatalog(catalog){
 const names=new Set();
 for(const tag of catalog){const name=tag.name.trim();if(!name)return '请输入标签名称';if(Array.from(name).length>24)return '标签名称最多24个字';if(names.has(name))return '标签名称不能重复';if(!/^#[0-9a-f]{6}$/i.test(tag.color))return '请输入六位颜色值，例如 #3B82F6';names.add(name);}
 return '';
}
function referenceMoveCatalogTag(catalog,id,beforeId){
 if(id===beforeId||!catalog.some(tag=>tag.id===id)||!catalog.some(tag=>tag.id===beforeId))return catalog.slice();
 const tag=catalog.find(item=>item.id===id),next=catalog.filter(item=>item.id!==id);next.splice(next.findIndex(item=>item.id===beforeId),0,tag);return next;
}
function referenceOpenTagManager(create=false,opener=null){
 referenceTagEditor={project:S.project,opener,before:structuredClone(referenceTags()),catalog:structuredClone(referenceTags()),active:referenceTags()[0]?.id};
 if(create)referenceAddCatalogTag(false);
 referenceRenderTagManager();
}
function referenceAddCatalogTag(redraw=true){
 const tag={id:studioRandomUUID(),name:'',color:'#3B82F6'};referenceTagEditor.catalog.push(tag);referenceTagEditor.active=tag.id;
 if(redraw)referenceRenderTagManager();
}
function referenceSafeTagColor(color){return /^#[0-9a-f]{6}$/i.test(color)?color:'#666666';}
function referenceRenderTagManager(){
 const editor=referenceTagEditor,active=editor.catalog.find(tag=>tag.id===editor.active),used=active?S.nodes.filter(node=>node.referenceTagIds?.includes(active.id)).length:0;
 showDialog('管理标签',`<div class="tag-editor"><section class="tag-editor-list" aria-label="标签顺序"><div class="tag-editor-scroll">${editor.catalog.map(tag=>`<button draggable="false" data-catalog-tag="${tag.id}" aria-pressed="${tag.id===editor.active}" title="拖动排序，或按Alt与上下方向键"><i style="background:${referenceSafeTagColor(tag.color)}"></i><span>${esc(tag.name||'新标签')}</span><small aria-hidden="true">⠿</small></button>`).join('')}</div><button class="tag-editor-add" data-catalog-add>＋ 添加标签</button></section><section class="tag-editor-detail">${active?`<label class="field">标签名称<span class="tag-editor-name"><input id="tag-editor-name" maxlength="24" value="${esc(active.name)}" placeholder="输入标签名称"><small id="tag-editor-count">${Array.from(active.name).length}/24</small></span></label><div class="tag-editor-color-field"><label for="tag-editor-hex">标签颜色</label><div class="tag-editor-color"><div class="tag-editor-palette"><div class="tag-editor-color-preview" style="background:${referenceSafeTagColor(active.color)}" aria-hidden="true"></div><span>预设颜色</span><div class="tag-editor-swatches">${referenceTagSwatches.map(color=>`<button data-catalog-color="${color}" style="background:${color}" aria-label="颜色 ${color}" aria-pressed="${color.toLowerCase()===active.color.toLowerCase()}"></button>`).join('')}</div></div><div class="tag-editor-color-controls field"><input id="tag-editor-hex" aria-label="标签颜色" value="${esc(active.color)}" maxlength="7" spellcheck="false"><hex-color-picker id="tag-editor-color" color="${referenceSafeTagColor(active.color)}" aria-label="标签调色板"></hex-color-picker></div></div></div><div class="tag-editor-delete"><span>${used?`已用于 ${used} 个节点`:'尚未使用'}</span><button data-catalog-remove ${used?'disabled':''} title="${used?'先移除节点上的标记':'删除后可通过取消恢复'}">${I('trash')}删除标签</button></div>`:'<p>暂无标签，先添加一个标签</p>'}<p id="tag-editor-error" role="alert"></p></section></div><p class="tag-editor-hint">拖动标签调整顺序，保存后生效</p>`,`<button class="button outline" data-action="close-modal">取消</button><button class="button primary" data-catalog-save>保存</button>`);
 document.querySelector('#modal-root .dialog').classList.add('tag-editor-dialog');
 const picker=document.getElementById('tag-editor-color');
 if(picker){
  picker.shadowRoot?.querySelector('[part=hue]')?.setAttribute('aria-label','色相');
  picker.shadowRoot?.querySelector('[part=saturation]')?.setAttribute('aria-label','饱和度与明度');
  picker.addEventListener('color-changed',event=>{if(referenceTagEditorIsActive())referenceSetTagEditorColor(event.detail.value);});
 }

}
/** Synchronize valid picker values while leaving invalid HEX input available for correction. */
function referenceSetTagEditorColor(color){
 const tag=referenceTagEditor?.catalog.find(item=>item.id===referenceTagEditor.active);if(!tag)return;
 tag.color=color;if(!/^#[0-9a-f]{6}$/i.test(color))return;
 tag.color=color.toUpperCase();
 document.getElementById('tag-editor-hex').value=tag.color;
 const picker=document.getElementById('tag-editor-color');if(picker&&picker.color?.toLowerCase()!==color.toLowerCase())picker.color=tag.color;
 document.querySelector('.tag-editor-color-preview').style.background=tag.color;
 document.querySelector(`[data-catalog-tag="${tag.id}"] i`).style.background=tag.color;
 document.querySelectorAll('[data-catalog-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.catalogColor.toLowerCase()===color.toLowerCase())));
}
function referenceTagEditorIsActive(){return referenceTagEditor?.project===S.project&&currentModal==='管理标签';}
document.addEventListener('input',event=>{
 if(!referenceTagEditorIsActive()||!['tag-editor-name','tag-editor-hex','tag-editor-color'].includes(event.target.id))return;
 const tag=referenceTagEditor.catalog.find(item=>item.id===referenceTagEditor.active);if(!tag)return;
 if(event.target.id==='tag-editor-name'){tag.name=event.target.value;document.getElementById('tag-editor-count').textContent=Array.from(tag.name).length+'/24';document.querySelector(`[data-catalog-tag="${tag.id}"] span`).textContent=tag.name||'新标签';}
 else referenceSetTagEditorColor(event.target.value);
});
document.addEventListener('click',event=>{
 if(!referenceTagEditorIsActive())return;
 if(Date.now()<referenceTagIgnoreClick){event.preventDefault();event.stopImmediatePropagation();return;}
 const row=event.target.closest('[data-catalog-tag]'),color=event.target.closest('[data-catalog-color]');
 if(row){event.preventDefault();referenceTagEditor.active=row.dataset.catalogTag;referenceRenderTagManager();return;}
 if(color){event.preventDefault();referenceSetTagEditorColor(color.dataset.catalogColor);return;}
 if(event.target.closest('[data-catalog-add]')){event.preventDefault();referenceAddCatalogTag();document.getElementById('tag-editor-name')?.focus();return;}
 if(event.target.closest('[data-catalog-remove]')){event.preventDefault();const id=referenceTagEditor.active;if(S.nodes.some(node=>node.referenceTagIds?.includes(id)))return;referenceTagEditor.catalog=referenceTagEditor.catalog.filter(tag=>tag.id!==id);referenceTagEditor.active=referenceTagEditor.catalog[0]?.id;referenceRenderTagManager();return;}
 if(event.target.closest('[data-catalog-save]')){event.preventDefault();const editor=referenceTagEditor,error=referenceValidateTagCatalog(editor.catalog);if(error){document.getElementById('tag-editor-error').textContent=error;return;}const after=editor.catalog.map(tag=>({...tag,name:tag.name.trim()}));if(JSON.stringify(after)!==JSON.stringify(editor.before)){studioRecordCanvasHistory({type:'tag-catalog',before:editor.before,after});S.referenceTagCatalog=structuredClone(after);save();editor.before=structuredClone(after);refreshCanvasNavigator();}closeDialog();toast('标签已保存');}
});
function referenceFinishTagReorder(cancel=false){
 const drag=referenceTagPointer;if(!drag)return;referenceTagPointer=null;
 if(drag.host.hasPointerCapture(drag.pointerId))drag.host.releasePointerCapture(drag.pointerId);
 document.querySelectorAll('[data-catalog-tag]').forEach(row=>row.removeAttribute('data-drop-before'));
 if(drag.moved){referenceTagIgnoreClick=Date.now()+300;if(!cancel&&drag.target&&referenceTagEditorIsActive()){referenceTagEditor.catalog=referenceMoveCatalogTag(referenceTagEditor.catalog,drag.id,drag.target);referenceRenderTagManager();}}
}
document.addEventListener('pointerdown',event=>{
 const row=event.target.closest('[data-catalog-tag]');if(!row||!referenceTagEditorIsActive()||event.button!==0)return;
 const host=row.closest('.tag-editor-list');referenceTagPointer={id:row.dataset.catalogTag,pointerId:event.pointerId,host,x:event.clientX,y:event.clientY,moved:false,target:null};
});
document.addEventListener('pointermove',event=>{
 const drag=referenceTagPointer;if(!drag||event.pointerId!==drag.pointerId)return;
 if(!drag.moved&&Math.abs(event.clientX-drag.x)+Math.abs(event.clientY-drag.y)<4)return;
 event.preventDefault();if(!drag.moved)drag.host.setPointerCapture(event.pointerId);drag.moved=true;
 const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-catalog-tag]');drag.target=target?.dataset.catalogTag;
 document.querySelectorAll('[data-catalog-tag]').forEach(row=>row.toggleAttribute('data-drop-before',row===target&&drag.id!==drag.target));
});
document.addEventListener('pointerup',event=>{if(referenceTagPointer&&event.pointerId===referenceTagPointer.pointerId)referenceFinishTagReorder();});
document.addEventListener('pointercancel',()=>referenceFinishTagReorder(true));
window.addEventListener('blur',()=>referenceFinishTagReorder(true));
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&referenceTagPointer){event.preventDefault();event.stopImmediatePropagation();referenceFinishTagReorder(true);}},true);
document.addEventListener('keydown',event=>{
 const row=event.target.closest('[data-catalog-tag]');if(!row||!referenceTagEditorIsActive()||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
 event.preventDefault();const list=referenceTagEditor.catalog,index=list.findIndex(tag=>tag.id===row.dataset.catalogTag),to=index+(event.key==='ArrowUp'?-1:1);if(to<0||to>=list.length)return;[list[index],list[to]]=[list[to],list[index]];referenceRenderTagManager();document.querySelector(`[data-catalog-tag="${row.dataset.catalogTag}"]`)?.focus();
});

/** Closing any tag-management layer returns to the filter or node that opened it. */
const referenceTagManagerCloseDialog=closeDialog;
closeDialog=function(){
 const opener=currentModal==='管理标签'?referenceTagEditor?.opener:null;
 referenceTagManagerCloseDialog();if(opener)referenceFocusTagOpener(opener);
};
