/* Asset metadata edits stay inside the workbench and preserve generated candidates. */
'use strict';
let referenceWorkbenchAssetEditor=null;
/** Resolve actual shot references; episode membership alone is not a shot reference. */
function referenceAssetShotLabels(state,source,assetId,scope='all'){
 const episodes=source?.scriptSeries?.episodes||[],labels=[];
 for(const episode of episodes){
  if(scope!=='all'&&episode.id!==scope)continue;
  const document=episode.primary?source.scriptDocument:episode.document;
  const shots=document?.scenes?.flatMap(scene=>scene.shots)||[];
  shots.forEach((shot,index)=>{
   const node=state.nodes.find(item=>item.id===shot.id);
   if(!state.edges.some(([from,to])=>from===assetId&&to===shot.id)&&!node?.assetReferences?.some(ref=>ref.sourceId===assetId))return;
   labels.push((episodes.length>1?'第'+episode.number+'集 · ':'')+String(index+1).padStart(2,'0'));
  });
 }
 return labels;
}
/** Reuse a copied output as a new target version, retaining earlier candidates. */
function referenceApplyWorkbenchReuse(asset,reuse){
 if(!reuse)return;
 const candidate={...structuredClone(reuse.candidate),id:reuse.id,number:Math.max(0,...(asset.candidates||[]).map(item=>item.number||0))+1,kind:asset.kind,reusedFrom:{sourceId:reuse.sourceId,sourceTitle:reuse.sourceTitle,candidateId:reuse.candidate.id,number:reuse.candidate.number}};
 asset.candidates=[...(asset.candidates||[]),candidate];asset.adoptedCandidateId=candidate.id;asset.referenceOnly=false;asset.frame=candidate.frame;asset.status='已采用';
}
function referenceSaveWorkbenchAsset(state,id,name,description,reuse=null,voicePreset=undefined){
 const asset=state.nodes.find(node=>node.id===id);
 if(!asset||!(['character','scene'].includes(asset.kind)||asset.assetCategory==='prop'))return {ok:false,error:'当前资产已不存在'};
 const title=name.trim(),prompt=description.trim();if(!title||!prompt)return {ok:false,error:'请填写名称和描述'};
 if(state.nodes.some(node=>node.id!==id&&node.kind===asset.kind&&node.assetCategory===asset.assetCategory&&node.title===title))return {ok:false,error:'已有同名资产，请换一个名称'};
 const before=referenceCaptureNodeGraph(state);
 asset.title=title;asset.prompt=prompt;asset.description=prompt;referenceApplyWorkbenchReuse(asset,reuse);
 if(voicePreset!==undefined){if(voicePreset===null)delete asset.voicePreset;else asset.voicePreset=structuredClone(voicePreset);}
 for(const node of state.nodes)for(const ref of node.assetReferences||[])if(ref.sourceId===id)ref.sourceTitle=title;
 if(state.nodeDrafts?.[id]&&Object.hasOwn(state.nodeDrafts[id],'prompt')){delete state.nodeDrafts[id].prompt;if(!Object.keys(state.nodeDrafts[id]).length)delete state.nodeDrafts[id];}
 const after=referenceCaptureNodeGraph(state);if(referenceNodeEqual(before,after))return {ok:true,changed:false,id};
 return {ok:true,changed:true,id,entry:referenceNodeGraphPatch(before,after)};
}
function referenceAssetVariantRoot(state,asset){return asset?.variantOf?state.nodes.find(node=>node.id===asset.variantOf)||asset:asset;}
function referenceAssetVariantLabel(state,asset,includeCount=true){
 if(asset.kind!=='character')return '';
 const root=referenceAssetVariantRoot(state,asset),variants=state.nodes.filter(node=>node.variantOf===root.id);
 return asset.variantOf?'变体 '+(variants.findIndex(node=>node.id===asset.id)+1):'主角色'+(includeCount&&variants.length?' · '+variants.length+' 个变体':'');
}
/** Display a main role and its variants together without rewriting saved order. */
function referenceArrangeAssetCards(assets){
 const roots=assets.filter(asset=>!asset.variantOf),known=new Set(roots.map(asset=>asset.id));
 return roots.flatMap(root=>[root,...assets.filter(asset=>asset.variantOf===root.id)]).concat(assets.filter(asset=>asset.variantOf&&!known.has(asset.variantOf)));
}
/** Find free space near a variant's parent without moving existing canvas nodes. */
function referenceWorkbenchAssetPosition(state,source,kind,parent){
 const peers=state.nodes.filter(n=>n.kind===kind),width=parent?.w||peers[0]?.w||380,height=width+56,gap=32;
 const nodeHeight=n=>['character','scene','image'].includes(n.kind)?Math.max(n.h||0,(n.w||380)+56):(n.h||height);
 const x=parent?parent.x:peers.length?Math.max(...peers.map(n=>n.x+(n.w||width)))+gap:source.x+source.w+48;
 let y=parent?parent.y+nodeHeight(parent)+gap:source.y;
 for(;;){
  const collisions=state.nodes.filter(n=>x<n.x+(n.w||width)+gap&&x+width+gap>n.x&&y<n.y+nodeHeight(n)+gap&&y+height+gap>n.y);
  if(!collisions.length)return {x,y,w:width,h:height};
  y=Math.max(...collisions.map(n=>n.y+nodeHeight(n)))+gap;
 }
}
/** Add an ungenerated asset to the selected series scope, without rewriting its script. */
function referenceCreateWorkbenchAsset(state,scriptId,id,scope,category,name,description,reuse=null,voicePreset=undefined,variantOf=null,imageDraft=null){
 const source=state.nodes.find(node=>node.id===scriptId),series=source?.scriptSeries;
 const title=name.trim(),prompt=description.trim();
 if(!series||!['character','scene','prop'].includes(category)||state.nodes.some(node=>node.id===id))return {ok:false,error:'当前项目已变化，请重新打开资产页'};
 const parent=variantOf?state.nodes.find(node=>node.id===variantOf&&node.kind==='character'&&!node.variantOf):null;
 if(variantOf&&(!parent||category!=='character'))return {ok:false,error:'所属角色已不存在，请重新打开'};
 const episodes=parent?series.episodes.filter(episode=>episode.assetIds.includes(parent.id)):scope==='all'?series.episodes:series.episodes.filter(episode=>episode.id===scope);
 if(!episodes.length)return {ok:false,error:'当前集已不存在'};
 if(!title||!prompt)return {ok:false,error:'请填写名称和描述'};
 const kind=category==='prop'?'image':category;
 if(state.nodes.some(node=>node.kind===kind&&(node.assetCategory==='prop')===(category==='prop')&&node.title===title))return {ok:false,error:'已有同名资产，请换一个名称'};
 const before=referenceCaptureNodeGraph(state),position=referenceWorkbenchAssetPosition(state,source,kind,parent);
 const asset={id,kind,label:{character:'角色',scene:'场景',prop:'道具'}[category],title,description:prompt,prompt,...position,status:'待制作',referenceOnly:true,adoptedCandidateId:null,candidates:[],assetReferences:[],frame:0,...(category==='prop'?{assetCategory:'prop'}:{})};
 if(parent){asset.variantOf=parent.id;const output=parent.candidates?.find(candidate=>candidate.id===parent.adoptedCandidateId);if(output&&!parent.referenceOnly){asset.assetReferences=[{sourceId:parent.id,sourceTitle:parent.title,sourceKind:parent.kind,candidateId:output.id,number:output.number,frame:output.frame}];state.edges.push([parent.id,id]);}}
 referenceApplyWorkbenchReuse(asset,reuse);if(voicePreset)asset.voicePreset=structuredClone(voicePreset);state.nodes.push(asset);
 if(imageDraft){state.nodeDrafts??={};state.nodeDrafts[id]=structuredClone(imageDraft);}
 if(parent){const group=state.referenceGroups?.groups?.find(g=>g.nodeIds.includes(parent.id));if(group)group.nodeIds=[...group.nodeIds,id];}
 for(const episode of episodes)episode.assetIds=[...new Set([...episode.assetIds,id])];
 if(Array.isArray(series.sharedAssetIds))series.sharedAssetIds=[...new Set([...series.sharedAssetIds,id])];
 if(Array.isArray(state.layoutBase))state.layoutBase.push({id,x:asset.x,y:asset.y});
 return {ok:true,changed:true,id,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
function referenceVariantStrip(asset){
 const root=referenceAssetVariantRoot(S,asset),members=[root,...S.nodes.filter(node=>node.variantOf===root.id)];
 return `<div class="ref-wb-variant-strip" role="tablist" aria-label="角色造型">${members.map((node,index)=>`<button role="tab" tabindex="${asset.id===node.id?0:-1}" aria-selected="${asset.id===node.id}" data-wb-variant="${node.id}" title="${esc(node.title)}">${(()=>{const output=studioAdoptedCandidate(node);return `<span class="ref-wb-variant-thumb ${output?'still frame'+output.frame:''}" aria-hidden="true">${output?'':I('user')}</span>`})()}<span>${index?'变体 '+index:'主角色'}</span></button>`).join('')}<button data-wb-add-variant="${root.id}" aria-label="新增角色变体">${I('plus')}</button></div>`;
}
/** Keep variant navigation and its next model choice beside the role fields. */
function referenceVariantControls(asset,parent,imageDraft){
 if(parent)return `<label class="field">造型模型<input readonly value="${esc(referenceAssetImageBinding(imageDraft||{},'image')?.family.label||'跟随项目模型')}"></label>`;
 if(asset.kind!=='character'||!asset.id)return '';
 const root=referenceAssetVariantRoot(S,asset),members=[root,...S.nodes.filter(n=>n.variantOf===root.id)];
 return `<label class="field">角色造型<div class="ref-wb-variant-controls"><select aria-label="角色变体" data-wb-variant-select>${members.map((n,i)=>`<option value="${n.id}" ${n.id===asset.id?'selected':''}>${i?'变体 '+i:'主角色'} · ${esc(n.title)}</option>`).join('')}</select><select aria-label="造型模型" data-wb-variant-model><option value="">跟随项目模型</option>${referenceImageModelCatalog.families.map(f=>`<option value="${f.id}">${esc(f.label)}</option>`).join('')}</select><button type="button" data-wb-prepare-variant="${root.id}">新建造型草稿</button></div></label>`;
}
function referenceAssetEditorDirty(){
 const editor=referenceWorkbenchAssetEditor;if(!editor)return false;
 return !!editor.reuse||document.getElementById('ref-wb-asset-name').value!==editor.initial.name||document.getElementById('ref-wb-asset-description').value!==editor.initial.description||JSON.stringify(editor.voicePreset)!==JSON.stringify(editor.initial.voicePreset);
}
function referenceCloseWorkbenchAsset(){
 const editor=referenceWorkbenchAssetEditor;if(typeof referenceCloseWorkbenchLibrary==='function')referenceCloseWorkbenchLibrary(false);document.querySelector('.ref-wb-voice-popover')?.remove();document.querySelector('.ref-wb-library-overlay')?.remove();document.querySelector('.ref-wb-asset-overlay')?.remove();referenceWorkbenchAssetEditor=null;
 if(editor?.background)editor.background.inert=editor.backgroundInert;
 if(editor?.opener?.isConnected)editor.opener.focus({preventScroll:true});
}
function referenceOpenWorkbenchAsset(id,variantOf=null,imageDraft=null){
 const creating=id===null,category=referenceWorkbench.assetCategory,parent=variantOf?nodeById(variantOf):null;
 const asset=creating?{title:parent?parent.title+' · 新造型':'',prompt:parent?.prompt||parent?.description||'',voicePreset:parent?.voicePreset,kind:category==='scene'?'scene':category==='prop'?'image':'character',assetCategory:category==='prop'?'prop':undefined,referenceOnly:true}:nodeById(id);if(!asset)return;referenceCloseWorkbenchAsset();
 referenceWorkbenchAssetEditor={id,creating,category,variantOf,imageDraft,scriptId:referenceWorkbench.nodeId,scope:referenceWorkbench.assetScope,project:S.project,voicePreset:asset.voicePreset?structuredClone(asset.voicePreset):null,opener:document.activeElement};
 const kind=asset.assetCategory==='prop'?'道具':asset.kind==='scene'?'场景':'角色',prompt=S.nodeDrafts?.[id]?.prompt??asset.prompt??asset.description??'';
 const background=document.querySelector('.ref-workbench-dialog');if(background){referenceWorkbenchAssetEditor.background=background;referenceWorkbenchAssetEditor.backgroundInert=background.inert;background.inert=true;}
 referenceWorkbenchAssetEditor.initial={name:asset.title,description:prompt,voicePreset:structuredClone(referenceWorkbenchAssetEditor.voicePreset)};
 const adopted=creating?null:studioAdoptedCandidate(asset),hasPreview=Boolean(adopted&&!asset.referenceOnly);
 const shots=creating?[]:referenceAssetShotLabels(S,nodeById(referenceWorkbench.nodeId),id);
 const preview=`<aside class="ref-wb-asset-preview"><${hasPreview?'button':'div'} ${hasPreview?`type="button" data-sb-preview data-preview-title="${esc(asset.title)}" title="查看大图"`:``} class="ref-wb-asset-image ${hasPreview?'still frame'+adopted.frame:'ref-wb-asset-empty'}" role="${hasPreview?'button':'img'}" aria-label="${esc(asset.title)}${hasPreview?'的已采用画面':'尚未制作'}">${hasPreview?'':I(kind==='角色'?'user':kind==='场景'?'scene':'image')}</${hasPreview?'button':'div'}><div class="ref-wb-asset-preview-caption"><span>${esc(asset.title||'新'+kind)}</span><small>${hasPreview?'已采用 · v'+adopted.number:'尚未制作'}</small></div><div class="ref-wb-source-actions"><label class="ref-wb-library-open">上传图片<input data-wb-upload-file type="file" accept="image/png,image/jpeg,image/webp" hidden></label><button class="ref-wb-library-open" data-wb-library-open>资产库</button></div>${!creating&&asset.kind==='character'?referenceVariantStrip(asset):parent?`<p class="ref-wb-asset-note">所属角色：${esc(parent.title)}</p>`:''}</aside>`;
 document.getElementById('modal-root').insertAdjacentHTML('beforeend',`<div class="ref-wb-asset-overlay"><section class="ref-wb-asset-dialog" role="dialog" aria-modal="true" aria-labelledby="ref-wb-asset-title"><header><h2 id="ref-wb-asset-title">${parent?'新增角色变体':(creating?'新增':'编辑')+kind}</h2><button data-wb-asset-close aria-label="关闭资产编辑">${I('close')}</button></header><div class="ref-wb-asset-body">${preview}<div class="ref-wb-asset-form"><label class="field" for="ref-wb-asset-name"><span>名称<span class="ref-wb-required" aria-hidden="true">*</span></span><input id="ref-wb-asset-name" aria-label="名称" value="${esc(asset.title)}" maxlength="120" required></label><label class="field" for="ref-wb-asset-description"><span>描述<span class="ref-wb-required" aria-hidden="true">*</span></span><textarea id="ref-wb-asset-description" aria-label="描述" rows="7" required>${esc(prompt)}</textarea></label>${kind==='角色'?referenceWorkbenchVoiceField(asset):''}${referenceVariantControls(asset,parent,imageDraft)}<label class="field">分镜镜号<input value="${esc(shots.join('、'))}" placeholder="暂无引用分镜" readonly aria-readonly="true"></label><p class="ref-wb-asset-note">${parent?'沿用所属角色的分集关联，只创建造型草稿':creating?'添加到当前资产范围，不自动生成图片':'修改后用于后续制作，已有候选和采用结果保留'}</p><p id="ref-wb-asset-error" role="alert"></p></div></div><footer><button class="button outline" data-wb-asset-close>取消</button><button class="button primary" data-wb-asset-save>${creating?'添加':'保存'}</button></footer></section></div>`);
 document.getElementById('ref-wb-asset-name').focus({preventScroll:true});
}
document.addEventListener('click',async event=>{
 const prepare=event.target.closest('[data-wb-prepare-variant]');if(prepare){event.preventDefault();event.stopImmediatePropagation();if(referenceAssetEditorDirty()){document.getElementById('ref-wb-asset-error').textContent='请先保存或取消当前修改，再新建造型';return;}const id=document.querySelector('[data-wb-variant-model]').value,draft={};if(id&&!referenceSelectAssetImageModel(draft,id,'image'))return;referenceOpenWorkbenchAsset(null,prepare.dataset.wbPrepareVariant,id?draft:null);return;}
 const variant=event.target.closest('[data-wb-variant]'),addVariant=event.target.closest('[data-wb-add-variant]');
 if(variant||addVariant){event.preventDefault();event.stopImmediatePropagation();if(referenceAssetEditorDirty()){document.getElementById('ref-wb-asset-error').textContent='请先保存或取消当前修改，再切换造型';return;}if(variant)referenceOpenWorkbenchAsset(variant.dataset.wbVariant);else referenceOpenWorkbenchAsset(null,addVariant.dataset.wbAddVariant);return;}
 if(event.target.closest('[data-wb-asset-close]')||event.target.matches('.ref-wb-asset-overlay')){event.preventDefault();event.stopImmediatePropagation();referenceCloseWorkbenchAsset();return;}
 if(!event.target.closest('[data-wb-asset-save]'))return;
 event.preventDefault();event.stopImmediatePropagation();const editor=referenceWorkbenchAssetEditor;if(!editor||editor.project!==S.project)return;
 if(editor.saving||editor.voiceReading)return;
 const name=document.getElementById('ref-wb-asset-name').value,description=document.getElementById('ref-wb-asset-description').value;
 if(editor.upload||editor.voiceUpload){editor.saving=true;event.target.disabled=true;try{if(editor.upload)editor.reuse=await referencePrepareUploadedReuse(editor);if(editor.voiceUpload)await referencePrepareVoiceRecording(editor);}catch(error){editor.saving=false;event.target.disabled=false;document.getElementById('ref-wb-asset-error').textContent=error.message;return;}editor.saving=false;event.target.disabled=false;if(referenceWorkbenchAssetEditor!==editor||editor.project!==S.project)return;}
 const checkpoint=editor.upload||editor.voiceUpload?structuredClone(S):null;
 const result=editor.creating?referenceCreateWorkbenchAsset(S,editor.scriptId,studioScriptId('asset'),editor.scope,editor.category,name,description,editor.reuse,editor.voicePreset,editor.variantOf,editor.imageDraft):referenceSaveWorkbenchAsset(S,editor.id,name,description,editor.reuse,editor.voicePreset);
 if(!result.ok){document.getElementById('ref-wb-asset-error').textContent=result.error;return;}
 if(result.changed){studioRecordCanvasHistory(result.entry);S.revision++;if(checkpoint){try{persist();}catch(error){Object.assign(S,checkpoint);document.getElementById('ref-wb-asset-error').textContent='项目保存失败，请检查浏览器存储空间后重试';return;}}else save();}
 const openerAction=editor.opener?.dataset.action;referenceCloseWorkbenchAsset();referenceDrawWorkbench();const focusAction=editor.creating?'ref-wb-asset-edit:'+result.id:openerAction;const returnControl=[...document.querySelectorAll('.ref-workbench [data-action]')].find(control=>control.dataset.action===focusAction);returnControl?.focus({preventScroll:true});toast(editor.upload?'图片已保存，原有版本保留':editor.reuse?'素材已复用，原有版本保留':editor.creating?'资产已添加，尚未生成':result.changed?'资产已更新，已有结果保留':'资产未改动');
},true);
document.addEventListener('change',event=>{
 if(!event.target.matches('[data-wb-variant-select]'))return;
 const id=event.target.value;if(referenceAssetEditorDirty()){event.target.value=referenceWorkbenchAssetEditor.id;document.getElementById('ref-wb-asset-error').textContent='请先保存或取消当前修改，再切换造型';return;}referenceOpenWorkbenchAsset(id);
});
document.addEventListener('keydown',event=>{
 if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)&&event.target.matches('[data-wb-variant]')){
  event.preventDefault();event.stopImmediatePropagation();
  if(referenceAssetEditorDirty()){document.getElementById('ref-wb-asset-error').textContent='请先保存或取消当前修改，再切换造型';return;}
  const tabs=[...document.querySelectorAll('[data-wb-variant]')],at=tabs.indexOf(event.target),next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length].dataset.wbVariant;
  referenceOpenWorkbenchAsset(next);document.querySelector(`[data-wb-variant="${next}"]`)?.focus();return;
 }
 if(!event.defaultPrevented&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&document.querySelector('.ref-workbench')&&!document.querySelector('.ref-wb-asset-dialog')&&!event.target.closest('input,textarea,select,[contenteditable="true"]')){
  event.preventDefault();event.stopImmediatePropagation();referenceRememberWorkbenchScroll();handleAction(event.shiftKey?'redo':'undo');referenceDrawWorkbench();return;
 }
 const dialog=document.querySelector('.ref-wb-asset-dialog');if(!dialog||dialog.inert)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseWorkbenchAsset();return;}
 if(event.key==='Tab'){const controls=[...dialog.querySelectorAll('button,input,textarea,select')].filter(control=>!control.disabled&&control.getClientRects().length>0),index=controls.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1).focus();}else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0].focus();}}
},true);
const referenceWorkbenchAssetAction=handleAction;
handleAction=function(action){if(action.startsWith('ref-wb-asset-voice:')){referenceRememberWorkbenchScroll();referenceOpenWorkbenchAsset(action.slice('ref-wb-asset-voice:'.length));const trigger=document.querySelector('[data-wb-voice-open]');trigger?.scrollIntoView({block:'nearest'});trigger?.focus({preventScroll:true});return;}if(action.startsWith('ref-wb-asset-delete:')){if(referenceSeriesAssetsLocked(nodeById(referenceWorkbench.nodeId))){toast('已确认资产不可删除');return;}referenceRememberWorkbenchScroll();referenceRunNodeCommand('delete',action.slice('ref-wb-asset-delete:'.length));referenceDrawWorkbench();return;}if(action==='ref-wb-asset-add'){if(referenceSeriesAssetAddLocked(nodeById(referenceWorkbench.nodeId))){toast('分镜解析完成后可新增资产');return;}referenceRememberWorkbenchScroll();referenceOpenWorkbenchAsset(null);return;}if(action.startsWith('ref-wb-asset-edit:')){referenceRememberWorkbenchScroll();referenceOpenWorkbenchAsset(action.slice('ref-wb-asset-edit:'.length));return;}referenceWorkbenchAssetAction(action);};
