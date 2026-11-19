/* Saved assets are immutable copies; project references retain their existing owner. */
'use strict';
const referenceVaultCategories=['角色','场景','道具','风格','商品','其他'];
let referenceVaultPanel={folder:null,category:'全部',query:'',expanded:false},referenceVaultPending=null;
function referenceVaultData(state){return state.referenceAssetVault??={folders:[],items:[]};}
function referenceVaultCreateFolder(state,id,name,category){
 const title=String(name).trim(),vault=referenceVaultData(state);
 if(!title||!referenceVaultCategories.includes(category))return {ok:false,error:'请填写文件夹名称并选择分类'};
 if(vault.folders.some(f=>f.id===id||f.category===category&&f.name.toLocaleLowerCase()===title.toLocaleLowerCase()))return {ok:false,error:'该分类下已存在同名文件夹'};
 const folder={id,name:title,category};vault.folders.push(folder);return {ok:true,folder};
}
function referenceVaultCapture(state,node){
 const candidate=studioAdoptedCandidate(node);if(!candidate)return null;
 return {project:state.project,nodeId:node.id,title:node.title,kind:node.kind,description:node.description||node.prompt||'',...(node.voicePreset?{voicePreset:structuredClone(node.voicePreset)}:{}),canvasSize:{width:node.w,height:node.h},candidate:structuredClone(candidate)};
}
function referenceVaultSave(state,id,folderId,captured){
 const vault=referenceVaultData(state),folder=vault.folders.find(f=>f.id===folderId);
 if(!folder||!captured?.candidate)return {ok:false,error:'请选择保存文件夹，素材需有已采用版本'};
 if(vault.items.some(item=>item.id===id))return {ok:false,error:'素材标识已存在'};
 const existing=vault.items.find(item=>item.folderId===folderId&&item.project===captured.project&&item.nodeId===captured.nodeId&&item.candidate.id===captured.candidate.id);
 if(existing)return {ok:true,item:existing,duplicate:true};
 const item={id,folderId,...structuredClone(captured),savedAt:new Date().toISOString()};vault.items.push(item);return {ok:true,item};
}
/** Capture eligible outputs once; an unmade node is not a saved asset. */
function referenceVaultCaptureSelection(state,ids){return [...new Set(ids)].flatMap(id=>{const node=state.nodes.find(item=>item.id===id),captured=node&&referenceVaultCapture(state,node);return captured?[captured]:[];});}
/** Validate the complete batch before replacing the library; repeated versions are reused. */
function referenceVaultSaveBatch(state,folderId,captures,newId){
 if(!captures.length)return {ok:false,error:'请选择已有采用结果的素材'};
 const working={referenceAssetVault:structuredClone(referenceVaultData(state))},items=[];let added=0;
 for(const captured of captures){const result=referenceVaultSave(working,newId(),folderId,captured);if(!result.ok)return result;items.push(result.item);if(!result.duplicate)added++;}
 state.referenceAssetVault=working.referenceAssetVault;return {ok:true,items,added};
}
/** Resolve retained canvas dimensions, including legacy image records without them. */
function referenceVaultImportSize(item){
 const image=['image','character','scene'].includes(item.kind),saved=item.canvasSize;
 const width=Number.isFinite(saved?.width)&&saved.width>0?saved.width:image?380:244;
 const height=Number.isFinite(saved?.height)&&saved.height>0?saved.height:image?width+56:300;
 return {width,height:image?Math.max(height,width+56):height};
}
function referenceVaultImportPosition(item){const size=referenceVaultImportSize(item);return studioNewContentPosition(size.width,size.height);}
function referenceVaultImport(state,item,id,position){
 if(!item?.candidate||state.nodes.some(n=>n.id===id))return {ok:false,error:'素材不可用，未添加内容'};
 const size=referenceVaultImportSize(item),before=referenceCaptureNodeGraph(state),candidate={...structuredClone(item.candidate),id:id+'-imported',number:1};
 if(item.collectionSource)candidate.collectionSource=structuredClone(item.collectionSource);else if(item.id)candidate.savedAsset={assetId:item.id,project:item.project,nodeId:item.nodeId,candidateId:item.candidate.id};else candidate.sourceHistory={project:item.project,nodeId:item.nodeId,candidateId:item.candidate.id};
 state.nodes.push({id,kind:item.kind,label:'素材',title:item.title,x:position.x,y:position.y,w:size.width,h:size.height,frame:candidate.frame,...(candidate.localMedia?{seconds:candidate.localMedia.duration}:{}),prompt:candidate.prompt||'',description:candidate.description||'',assetReferences:[],adoptedCandidateId:candidate.id,candidates:[candidate]});
 if(Array.isArray(state.layoutBase))state.layoutBase.push({id,...position});
 return {ok:true,id,entry:referenceNodeGraphPatch(before,referenceCaptureNodeGraph(state))};
}
function referenceVaultVisibleItems(){
 const p=referenceVaultPanel,vault=referenceVaultData(S),folders=vault.folders.filter(f=>p.category==='全部'||f.category===p.category),ids=new Set(folders.map(f=>f.id)),query=p.query.trim().toLocaleLowerCase();
 return vault.items.filter(item=>ids.has(item.folderId)&&(!p.folder||item.folderId===p.folder)&&(!query||item.title.toLocaleLowerCase().includes(query)));
}
function referenceVaultVisibleFolders(){
 const p=referenceVaultPanel,vault=referenceVaultData(S),query=p.query.trim().toLocaleLowerCase();
 return vault.folders.filter(folder=>(p.category==='全部'||folder.category===p.category)&&(!query||folder.name.toLocaleLowerCase().includes(query)||vault.items.some(item=>item.folderId===folder.id&&item.title.toLocaleLowerCase().includes(query))));
}
function referenceVaultItemHtml(item){const media=item.candidate.localMedia;return `<article>${media?`<button class="ref-vault-media-preview" data-vault-preview="${item.id}" aria-label="预览 ${esc(item.title)}">${I(media.type==='视频'?'film':'audio-media')}<small>原始${media.type} · ${Math.round(media.duration)}秒</small></button>`:`<div class="still frame${item.candidate.frame}" role="img" aria-label="${esc(item.title)}"></div>`}<strong>${esc(item.title)}</strong><small>保存版本 v${item.candidate.number}</small><button data-vault-import="${item.id}">${S.screen==='canvas'?'加入画布':'加入项目'}</button></article>`;}
function referenceVaultPage(){
 const p=referenceVaultPanel,vault=referenceVaultData(S),folders=referenceVaultVisibleFolders(),folder=vault.folders.find(f=>f.id===p.folder);
 return `<main class="ref-project-page ref-vault-page"><div class="ref-vault-page-top"><div><button class="active">个人资产</button><button disabled title="尚未连接团队空间">团队资产</button><button data-action="collection-inbox">收集箱</button></div><label class="ref-vault-search">${I('search')}<input aria-label="搜索我的资产" placeholder="搜索我的资产" data-vault-search value="${esc(p.query)}"></label></div><div class="ref-vault-page-toolbar"><select aria-label="资产类型" data-vault-category-select>${['全部',...referenceVaultCategories].map(label=>`<option ${p.category===label?'selected':''}>${label}</option>`).join('')}</select><span></span><button data-vault-new-folder>${I('folder')}新建文件夹</button></div>${folder?`<div class="ref-vault-breadcrumb"><button data-vault-folder="">个人资产</button><span> / ${esc(folder.name)}</span></div><div class="ref-vault-items">${referenceVaultVisibleItems().map(referenceVaultItemHtml).join('')||'<p class="ref-vault-empty">这个文件夹还没有素材</p>'}</div>`:`<div class="ref-vault-folders">${folders.map(f=>`<button data-vault-folder="${f.id}">${I('folder')}<strong>${esc(f.name)}</strong><small>${f.category} · ${vault.items.filter(item=>item.folderId===f.id).length} 项素材</small></button>`).join('')||'<div class="ref-vault-empty">还没有资源集，先新建文件夹，再从画布保存素材</div>'}</div>`}</main>`;
}
function referenceVaultRefresh(){if(S.screen==='home'&&referenceSection==='assets')render();else if(document.querySelector('.ref-vault-shell'))referenceVaultRender();}
let referenceVaultTargetAsset=null,referenceVaultOpener=null;
function referenceVaultClose(){
 document.querySelector('.ref-vault-shell')?.remove();
 if(referenceVaultOpener?.isConnected)referenceVaultOpener.focus({preventScroll:true});
 referenceVaultOpener=null;
}
function referenceVaultChooseProject(assetId){
 referenceVaultTargetAsset=assetId;const projects=referenceAllProjects().filter(p=>!p.meta.deletedAt);
 showDialog('加入项目',`<label class="field">目标项目<select id="vault-target-project" aria-label="目标项目">${projects.map(p=>`<option value="${p.id}" ${p.name===S.project?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><p>复制保存的素材版本，原项目与资产库不会改变</p>`,btn('取消','close-modal','outline')+`<button class="button primary" data-action="vault-confirm-import" ${projects.length?'':'disabled'}>加入项目</button>`);
}
function referenceVaultImportItem(item){
 const result=referenceVaultImport(S,item,studioScriptId('saved-copy'),referenceVaultImportPosition(item));if(!result.ok){toast(result.error);return;}
 studioRecordCanvasHistory(result.entry);S.revision++;S.selected=result.id;S.panel=null;document.querySelector('.ref-vault-shell')?.remove();render();revealSelectedNode();save();toast('已加入独立副本，资产库版本保留');
}
const referenceVaultPreviousHome=home;
home=function(){return referenceSection==='assets'?referenceVaultPage():referenceVaultPreviousHome();};
if(location.hash==='#assets'){referenceSection='assets';S.screen='home';render();}
window.addEventListener('hashchange',()=>{if(location.hash==='#assets'){referenceSection='assets';S.screen='home';render();}});
function referenceVaultRender(){
 document.querySelector('.ref-vault-shell')?.remove();const p=referenceVaultPanel,vault=referenceVaultData(S),folders=vault.folders.filter(f=>p.category==='全部'||f.category===p.category),items=referenceVaultVisibleItems();
 document.body.insertAdjacentHTML('beforeend',`<section class="ref-vault-shell ${p.expanded?'is-expanded':''}" role="dialog" aria-label="我的资产库"><header><h2>资产库</h2><span></span><button data-vault-new-folder aria-label="新建文件夹">${I('folder')}${I('plus')}</button><button data-vault-expand aria-label="${p.expanded?'缩小':'放大'}资产库">${I('fit')}</button><button data-vault-close aria-label="关闭资产库">${I('close')}</button></header><div class="ref-vault-categories">${['全部',...referenceVaultCategories].map(label=>`<button data-vault-category="${label}" aria-pressed="${p.category===label}">${label}</button>`).join('')}</div><label class="ref-vault-search">${I('search')}<input placeholder="搜索我的资产" aria-label="搜索我的资产" data-vault-search value="${esc(p.query)}"></label><div class="ref-vault-content"><nav aria-label="资产文件夹"><button data-vault-folder="" aria-current="${!p.folder}">全部素材 <small>${vault.items.length}</small></button>${folders.map(folder=>`<button data-vault-folder="${folder.id}" aria-current="${p.folder===folder.id}">${I('folder')}<span>${esc(folder.name)}</span><small>${vault.items.filter(item=>item.folderId===folder.id).length}</small></button>`).join('')}</nav><div class="ref-vault-items">${items.map(referenceVaultItemHtml).join('')||`<p class="ref-vault-empty">${vault.items.length?'没有匹配的资产':'暂无资产，可从画布加入'}</p>`}</div></div><footer>本机资产 · 保存所选版本，原节点修改不影响此处</footer></section>`);
}
function referenceVaultFolderForm(){
 showDialog('新建文件夹',`<label class="field">文件夹名称<input id="vault-folder-name" aria-label="文件夹名称" placeholder="例如：角色参考"></label><div class="field">分类<input type="hidden" id="vault-folder-category" value="其他"><div class="ref-vault-folder-categories" role="group" aria-label="文件夹分类">${referenceVaultCategories.map(label=>`<button type="button" data-vault-folder-category="${label}" aria-pressed="${label==='其他'}">${label}</button>`).join('')}</div></div><p id="vault-folder-error" role="alert"></p>`,btn('取消','close-modal','outline')+'<button class="button primary" data-action="vault-create-folder" disabled>创建</button>');
}
function referenceVaultSaveForm(id){referenceVaultSaveSelection([id]);}
function referenceVaultSaveSelection(ids){
 const captures=referenceVaultCaptureSelection(S,ids);if(!captures.length){toast('先采用一个结果，再保存到资产库');return;}
 referenceVaultPending={captures,category:captures.every(item=>item.kind==='character')?'角色':captures.every(item=>item.kind==='scene')?'场景':'其他'};referenceVaultDrawSaveForm();
}
function referenceVaultSaveFolderOptions(category){return '<option value="">请选择文件夹</option>'+referenceVaultData(S).folders.filter(folder=>folder.category===category).map(folder=>`<option value="${folder.id}">${esc(folder.name)}</option>`).join('');}
function referenceVaultDrawSaveForm(){
 const pending=referenceVaultPending;if(!pending)return;const captures=pending.captures;
 const root=showDialog('保存到资产库',`<div class="ref-vault-save"><div class="ref-vault-save-selection" role="region" aria-label="已选择 ${captures.length} 项素材">${captures.map(p=>`<article>${p.candidate.localMedia?`<div class="ref-vault-save-media">${I(p.candidate.localMedia.type==='视频'?'film':'audio-media')}<small>原始${p.candidate.localMedia.type} · ${Math.round(p.candidate.localMedia.duration)}秒</small></div>`:`<div class="still frame${p.candidate.frame}" role="img" aria-label="${esc(p.title)}"></div>`}<strong title="${esc(p.title)}">${esc(p.title)}</strong><small>已采用 · v${p.candidate.number}</small></article>`).join('')}</div><section><label class="field">分类<select id="vault-save-category" aria-label="资产分类">${referenceVaultCategories.map(category=>`<option ${category===pending.category?'selected':''}>${category}</option>`).join('')}</select></label><label class="field">保存位置<select id="vault-save-folder" aria-label="保存位置">${referenceVaultSaveFolderOptions(pending.category)}</select></label><button data-action="vault-new-folder">新建文件夹</button><p id="vault-save-error" role="alert"></p></section></div>`,`<span class="ref-vault-save-count">已选择 ${captures.length} 项素材</span>`+btn('取消','vault-cancel-save','outline')+`<button class="button primary" data-action="vault-save" disabled>保存</button>`,true);
 root.querySelector('.dialog').classList.add('ref-vault-save-dialog');
}
const referenceVaultBaseAction=handleAction;
handleAction=function(action){
 if(action==='ref-nav:assets'){rememberProject();referenceSection='assets';S.screen='home';location.hash='assets';document.querySelector('.ref-vault-shell')?.remove();referenceCloseCharacterLibrary();render();return;}
 if(action==='vault-confirm-import'){const id=document.getElementById('vault-target-project')?.value,item=referenceVaultData(S).items.find(v=>v.id===referenceVaultTargetAsset),project=referenceProjectById(id);if(!project||project.kind!=='project'||!item)return;closeDialog();referenceVaultTargetAsset=null;referenceVaultBaseAction('ref-project-open:'+id);referenceVaultImportItem(item);return;}
 if(action==='asset-vault'){referenceVaultPending=null;referenceCloseCharacterLibrary();if(document.querySelector('.ref-vault-shell'))referenceVaultClose();else{referenceVaultOpener=document.activeElement;referenceVaultRender();document.querySelector('[data-vault-search]')?.focus();}return;}
 if(action==='vault-new-folder'){referenceVaultFolderForm();if(referenceVaultPending){document.getElementById('vault-folder-category').value=referenceVaultPending.category;document.querySelectorAll('[data-vault-folder-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.vaultFolderCategory===referenceVaultPending.category)));}return;}
 if(action==='vault-create-folder'){const result=referenceVaultCreateFolder(S,studioScriptId('asset-folder'),document.getElementById('vault-folder-name').value,document.getElementById('vault-folder-category').value);if(!result.ok){document.getElementById('vault-folder-error').textContent=result.error;return;}save();closeDialog();referenceVaultRefresh();if(referenceVaultPending){referenceVaultPending.category=result.folder.category;referenceVaultDrawSaveForm();}return;}
 if(action==='vault-cancel-save'){referenceVaultPending=null;closeDialog();return;}
 if(action==='vault-save'){if(!referenceVaultPending)return;const result=referenceVaultSaveBatch(S,document.getElementById('vault-save-folder').value,referenceVaultPending.captures,()=>studioScriptId('saved-asset'));if(!result.ok){document.getElementById('vault-save-error').textContent=result.error;return;}referenceVaultPending=null;save();closeDialog();referenceVaultRefresh();toast(result.added?'已保存 '+result.added+' 项素材':'所选版本已在此文件夹中');return;}
 if(action==='close-modal'&&currentModal==='新建文件夹'&&referenceVaultPending){closeDialog();referenceVaultDrawSaveForm();return;}
 if(action==='close-modal'&&currentModal==='保存到资产库')referenceVaultPending=null;
 referenceVaultBaseAction(action);if(S.screen!=='canvas'){document.querySelector('.ref-vault-shell')?.remove();referenceVaultPending=null;referenceCloseCharacterLibrary();}
};
const referenceVaultBaseCommand=referenceRunNodeCommand;
referenceRunNodeCommand=function(action,id,origin){if(action==='save-asset'){referenceVaultSaveForm(id);return;}referenceVaultBaseCommand(action,id,origin);};
document.addEventListener('change',event=>{if(event.target.id==='vault-save-category'&&referenceVaultPending){referenceVaultPending.category=event.target.value;document.getElementById('vault-save-folder').innerHTML=referenceVaultSaveFolderOptions(event.target.value);document.querySelector('[data-action="vault-save"]').disabled=true;return;}if(event.target.id==='vault-save-folder')document.querySelector('[data-action="vault-save"]').disabled=!event.target.value;});
document.addEventListener('input',event=>{if(event.target.id==='vault-folder-name'){document.querySelector('[data-action="vault-create-folder"]').disabled=!event.target.value.trim();return;}if(!event.target.matches('[data-vault-search]'))return;const start=event.target.selectionStart;referenceVaultPanel.query=event.target.value;referenceVaultRefresh();const input=document.querySelector('[data-vault-search]');input.focus();input.setSelectionRange(start,start);});
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-vault-close],[data-vault-new-folder],[data-vault-expand],[data-vault-category],[data-vault-folder],[data-vault-import],[data-vault-preview]');if(!target)return;event.preventDefault();
 if(target.hasAttribute('data-vault-close')){referenceVaultClose();return;}
 if(target.hasAttribute('data-vault-new-folder')){referenceVaultPending=null;referenceVaultFolderForm();return;}
 if(target.hasAttribute('data-vault-expand'))referenceVaultPanel.expanded=!referenceVaultPanel.expanded;
 if(target.dataset.vaultCategory){referenceVaultPanel.category=target.dataset.vaultCategory;referenceVaultPanel.folder=null;}
 if(target.hasAttribute('data-vault-folder')){referenceVaultPanel.folder=target.dataset.vaultFolder||null;referenceVaultPanel.query='';}
 if(target.dataset.vaultPreview){const item=referenceVaultData(S).items.find(v=>v.id===target.dataset.vaultPreview);if(item?.candidate.localMedia)void referenceOpenCollectionPlayer({...item.candidate.localMedia,title:item.title},target);return;}
 if(target.dataset.vaultImport){if(S.screen!=='canvas'){referenceVaultChooseProject(target.dataset.vaultImport);return;}const item=referenceVaultData(S).items.find(v=>v.id===target.dataset.vaultImport),result=referenceVaultImport(S,item,studioScriptId('saved-copy'),referenceVaultImportPosition(item));if(!result.ok){toast(result.error);return;}studioRecordCanvasHistory(result.entry);S.revision++;S.selected=result.id;S.panel=null;document.querySelector('.ref-vault-shell')?.remove();render();revealSelectedNode();save();toast('已加入独立副本，资产库版本保留');return;}
 referenceVaultRefresh();
});

document.addEventListener('change',event=>{if(event.target.matches('[data-vault-category-select]')){referenceVaultPanel.category=event.target.value;referenceVaultPanel.folder=null;referenceVaultRefresh();}});

// The modeless drawer closes before the canvas consumes Escape; open forms own their keys.
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape'||currentModal||!document.querySelector('.ref-vault-shell'))return;
 event.preventDefault();event.stopImmediatePropagation();referenceVaultClose();
},true);

document.addEventListener('click',event=>{
 const target=event.target.closest('[data-vault-folder-category]');if(!target)return;
 document.getElementById('vault-folder-category').value=target.dataset.vaultFolderCategory;
 document.querySelectorAll('[data-vault-folder-category]').forEach(button=>button.setAttribute('aria-pressed',String(button===target)));
});
