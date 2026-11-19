/* Import retained results as independent copies; this view never runs generation. */
'use strict';
let referenceWorksImport=null;
/** Stage every selected copy before committing one reversible graph patch. */
function referenceImportWorkBatch(state,keys,operation,newId){
 const chosen=[...new Set(keys)],entries=referenceResultEntries(state),existing=state.nodes.filter(node=>node.worksImport?.operation===operation);
 if(!chosen.length)return {ok:false,error:'请先选择作品'};
 if(existing.length){if(existing.length===chosen.length&&existing.every(node=>chosen.includes(node.worksImport.key)))return {ok:true,changed:false,ids:existing.map(node=>node.id)};return {ok:false,error:'本次导入已处理，请重新打开选择窗口'};}
 const items=chosen.map(key=>entries.find(item=>item.key===key));if(items.some(item=>!item))return {ok:false,error:'部分记录已变化，请重新选择'};
 const before=referenceCaptureNodeGraph(state),working=structuredClone(state),ids=[];
 const left=Math.max(0,...state.nodes.map(node=>node.x+node.w))+100,top=Math.min(100,...state.nodes.map(node=>node.y));
 for(const [index,item] of items.entries()){
  const result=referenceVaultImport(working,item,newId(),{x:left+(index%3)*420,y:top+Math.floor(index/3)*500});if(!result.ok)return result;
  const node=working.nodes.find(node=>node.id===result.id);node.worksImport={operation,key:item.key};node.candidates[0].sourceHistory.number=item.candidate.number;node.candidates[0].sourceHistory.title=item.title;ids.push(result.id);
 }
 const entry=referenceNodeGraphPatch(before,referenceCaptureNodeGraph(working)),commit=referenceRestoreNodeGraph(state,entry.before,entry.after);return commit.ok?{ok:true,changed:true,ids,entry}:commit;
}
function referenceWorksImportGrid(){
 const state=referenceWorksImport,query=state.query.trim().toLocaleLowerCase(),entries=state.entries.filter(item=>(state.type==='all'||item.type===state.type)&&(!query||[item.title,item.project].join(' ').toLocaleLowerCase().includes(query)));
 return entries.map(item=>`<button type="button" class="ref-work-import-card ${state.selected.has(item.key)?'is-selected':''}" aria-pressed="${state.selected.has(item.key)}" aria-label="选择 ${esc(item.title)} v${item.candidate.number}，${esc(item.project)}" data-work-import-key="${esc(item.key)}"><span class="ref-work-import-picture ref-result-picture">${referenceResultPicture(item)}<i>${I('check')}</i></span><strong>${esc(item.title)} <small>v${item.candidate.number}</small></strong><span>${esc(item.project)}</span></button>`).join('')||'<p class="ref-result-empty">暂无匹配作品</p>';
}
function referenceRefreshWorksImport(){
 const grid=document.querySelector('[data-work-import-grid]');if(!grid||!referenceWorksImport)return;
 const scroll=grid.scrollTop;grid.innerHTML=referenceWorksImportGrid();grid.scrollTop=scroll;referenceMarkMissingResultImages(grid);
 const confirm=document.querySelector('[data-work-import-confirm]');confirm.textContent=`添加到画布（${referenceWorksImport.selected.size}）`;confirm.disabled=!referenceWorksImport.selected.size;
}
function referenceOpenWorksImport(){
 referenceCloseCreateMenu();referenceWorksImport={project:S.project,operation:studioScriptId('works-import'),entries:referenceResultEntries(S).filter(item=>!(S.referenceHiddenResults||[]).includes(item.key)),selected:new Set(),type:'all',query:''};
 const state=referenceWorksImport;
 const root=showDialog('我的作品',`<div class="ref-work-import-controls"><div role="group" aria-label="作品类型">${[['all','全部'],['image','图片'],['video','视频'],['audio','声音']].map(([key,label])=>`<button aria-pressed="${key==='all'}" data-work-import-type="${key}">${label}</button>`).join('')}</div><input type="search" aria-label="搜索作品" placeholder="搜索作品或项目" data-work-import-search></div><div class="ref-work-import-grid" data-work-import-grid>${referenceWorksImportGrid()}</div>`,`<span class="note">本机保留的结果与素材 · 不运行生成</span><button class="button outline" data-action="close-modal">取消</button><button class="button primary" data-work-import-confirm disabled>添加到画布（0）</button>`);
 referenceWorksImport=state;referenceMarkMissingResultImages(root);root.querySelector('.dialog').classList.add('ref-work-import-dialog');
}
const referenceWorkImportAction=handleAction;
handleAction=function(action){if(action==='works-import'){referenceOpenWorksImport();return;}referenceWorkImportAction(action);};
const referenceWorkImportClose=closeDialog;
closeDialog=function(){referenceWorksImport=null;referenceWorkImportClose();};
document.addEventListener('input',event=>{if(!event.target.matches('[data-work-import-search]')||!referenceWorksImport)return;referenceWorksImport.query=event.target.value;referenceRefreshWorksImport();});
document.addEventListener('click',event=>{
 const state=referenceWorksImport;if(!state)return;
 const type=event.target.closest('[data-work-import-type]');if(type){state.type=type.dataset.workImportType;for(const button of type.parentElement.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===type));referenceRefreshWorksImport();return;}
 const card=event.target.closest('[data-work-import-key]');if(card){const key=card.dataset.workImportKey;state.selected.has(key)?state.selected.delete(key):state.selected.add(key);referenceRefreshWorksImport();document.querySelector(`[data-work-import-key="${CSS.escape(key)}"]`)?.focus({preventScroll:true});return;}
 if(!event.target.closest('[data-work-import-confirm]'))return;
 if(S.project!==state.project){toast('当前项目已变化，请重新打开作品导入');return;}
 const result=referenceImportWorkBatch(S,[...state.selected],state.operation,()=>studioScriptId('work-copy'));if(!result.ok){toast(result.error);return;}
 if(result.changed){const checkpoint={undo:structuredClone(S.canvasUndo),redo:structuredClone(S.canvasRedo),revision:S.revision};try{studioRecordCanvasHistory(result.entry);S.revision++;persist();}catch(error){referenceRestoreNodeGraph(S,result.entry.after,result.entry.before);S.canvasUndo=checkpoint.undo;S.canvasRedo=checkpoint.redo;S.revision=checkpoint.revision;toast('作品未保存，请检查本机存储空间后重试');return;}}
 closeDialog();render();focusNode(result.ids[0]);toast(`已导入 ${result.ids.length} 份独立副本，来源保留`);
});

const referenceWorkSourceHtml=candidateSourceReferencesHtml;
candidateSourceReferencesHtml=function(candidate){
 const origin=candidate.sourceHistory;
 const label=origin?`<p class="studio-asset-note">导入自 ${esc(origin.project)}${origin.title?' · '+esc(origin.title):''}${Number.isInteger(origin.number)?' · v'+origin.number:''}</p>`:'';
 return label+referenceWorkSourceHtml(candidate);
};
