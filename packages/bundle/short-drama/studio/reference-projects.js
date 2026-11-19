/* Local project-library interactions. Deletion only marks metadata; draft and history records remain intact. */
'use strict';
const referenceProjectsAction=handleAction;
const referenceProjectsHome=home;
const referenceRememberProject=rememberProject;
S.referenceProjectMeta ||= {};
S.referenceFolders ||= [];
let referenceLibrary={tab:'mine',folder:null,filter:'all',sort:'modified',order:'desc',query:'',bulk:false,selected:[]};
let referenceProjectMenu=null;
let referenceProjectEdit=null;
function referenceEnsureProjectMeta(){
 Object.keys(S.projectDrafts).forEach((name,index)=>{S.referenceProjectMeta[name] ||= {id:'local-'+studioRandomUUID(),createdAt:null,modifiedAt:null,sequence:index,folder:null,pinned:false,deletedAt:null}});
}
rememberProject=function(){referenceRememberProject();referenceEnsureProjectMeta();const meta=S.referenceProjectMeta[S.project];if(meta)meta.modifiedAt=new Date().toISOString()};
function referenceAllProjects(){
 referenceEnsureProjectMeta();
 return Object.values(S.projectDrafts).map(d=>({kind:'project',id:S.referenceProjectMeta[d.project].id,name:d.project,draft:d,meta:S.referenceProjectMeta[d.project],frame:d.nodes.find(n=>mediaKind(n)==='image')?.frame??0}));
}
function referenceProjectById(id){return referenceAllProjects().find(p=>p.id===id)||S.referenceFolders.find(f=>f.id===id)&&referenceFolderItem(S.referenceFolders.find(f=>f.id===id))}
function referenceFolderItem(folder){return {kind:'folder',id:folder.id,name:folder.name,meta:folder,frame:0}}
function referenceLibraryItems(home=false){
 let items=referenceAllProjects();
 if(!home){items=[...S.referenceFolders.map(referenceFolderItem),...items];items=items.filter(p=>p.meta.folder===referenceLibrary.folder)}
 items=items.filter(p=>!p.meta.deletedAt);
 if(!home){if(referenceLibrary.filter==='projects')items=items.filter(p=>p.kind==='project');if(referenceLibrary.filter==='folders')items=items.filter(p=>p.kind==='folder');if(referenceLibrary.query)items=items.filter(p=>p.name.toLowerCase().includes(referenceLibrary.query.toLowerCase()))}
 items.sort((a,b)=>{
  if(a.meta.pinned!==b.meta.pinned)return a.meta.pinned?-1:1;
  if(a.kind!==b.kind)return a.kind==='folder'?-1:1;
  let av,bv;
  if(referenceLibrary.sort==='size'&&!home){av=a.draft?JSON.stringify(a.draft).length:0;bv=b.draft?JSON.stringify(b.draft).length:0}else{av=Date.parse((!home&&referenceLibrary.sort==='created'?a.meta.createdAt:a.meta.modifiedAt)||'')||a.meta.sequence||0;bv=Date.parse((!home&&referenceLibrary.sort==='created'?b.meta.createdAt:b.meta.modifiedAt)||'')||b.meta.sequence||0}
  return (av-bv)*(home||referenceLibrary.order==='desc'?-1:1);
 });
 return home?items.slice(0,3):items;
}
/** Show stored edit times without labelling every saved project as just edited. */
function referenceProjectModifiedLabel(value,now=Date.now()){
 const timestamp=Date.parse(value||'');if(!Number.isFinite(timestamp))return '本地草稿';
 const minutes=Math.floor(Math.max(0,now-timestamp)/60000);
 if(minutes<1)return '刚刚编辑';
 if(minutes<60)return minutes+'分钟前编辑';
 const hours=Math.floor(minutes/60);if(hours<24)return hours+'小时前编辑';
 const days=Math.floor(hours/24);if(days<30)return days+'天前编辑';
 return new Date(timestamp).toLocaleDateString('zh-CN')+' 编辑';
}
function referenceProjectCard(item){const bulk=referenceLibrary.bulk&&referenceSection==='projects',selected=referenceLibrary.selected.includes(item.id);return `<article class="ref-project ${item.kind==='folder'?'ref-folder-card':''} ${selected?'ref-project-selected':''}" data-ref-project-id="${item.id}">${bulk?`<label class="ref-project-check"><input type="checkbox" aria-label="选择 ${esc(item.name)}" data-ref-project-check="${item.id}" ${selected?'checked':''}></label>`:''}<button class="ref-cover ${item.kind==='project'?'still frame'+item.frame:''}" data-action="${bulk?'ref-project-select:':'ref-project-open:'}${item.id}" aria-label="打开 ${esc(item.name)}">${item.kind==='folder'?I('folder'):`<span class="ref-project-node-count">节点数：${item.draft.nodes.length}</span>`}</button><div class="ref-project-caption"><div><strong>${item.meta.pinned?`<span class="ref-project-pin" aria-label="已置顶">${I('pin')}</span>`:''}${esc(item.name)}</strong><small ${item.kind==='project'&&Number.isFinite(Date.parse(item.meta.modifiedAt||''))?`title="最后编辑：${esc(new Date(item.meta.modifiedAt).toLocaleString('zh-CN',{hour12:false}))}"`:''}>${item.kind==='folder'?referenceAllProjects().filter(p=>p.meta.folder===item.id&&!p.meta.deletedAt).length+' 个项目':referenceProjectModifiedLabel(item.meta.modifiedAt)}</small></div>${bulk?'':iconBtn('更多','ref-project-menu:'+item.id,'more')}</div></article>`}
referenceProjectCards=function(all=false){
 const items=referenceLibraryItems(!all);
 const fallback=!items.length&&!Object.keys(S.projectDrafts).length?studioExamples.filter(e=>e.key!=='blank').slice(0,3).map(e=>`<article class="ref-project"><button class="ref-cover still frame${e.frame}" data-action="open-example:${e.key}" aria-label="打开 ${esc(e.name)}"></button><div class="ref-project-caption"><div><strong>${esc(e.name)}</strong><small>示例项目</small></div></div></article>`).join(''):'';
 return `<div class="ref-project-grid ${all?'all':''}" id="project-grid">${referenceLibrary.bulk&&all?'':`<button class="ref-project new" data-action="ref-new"><div class="ref-cover">${I('plus')}</div><strong>新建项目</strong></button>`}${items.map(referenceProjectCard).join('')}${fallback}</div>${all&&!items.length&&Object.keys(S.projectDrafts).length?'<div class="ref-library-empty">没有找到项目</div>':''}`;
};
function referenceLibraryPage(){
 const folder=referenceLibrary.folder&&S.referenceFolders.find(f=>f.id===referenceLibrary.folder),count=referenceLibrary.selected.length;
 const bulkButton=(label,action,style,icon)=>btn(label,action,style,icon).replace('<button ', '<button '+(count?'':'disabled '));
 const controls=referenceLibrary.bulk?`<div class="ref-project-bulk" role="group" aria-label="批量管理"><span>已选 ${count} 项</span>${btn('全选','ref-project-select-all','ghost')}<span class="top-spacer"></span>${bulkButton('复制到团队','ref-copy-team','ghost','people')}${bulkButton('移动至','ref-project-bulk-move','ghost','folder')}${bulkButton('置顶','ref-project-bulk-pin','ghost','pin')}${bulkButton('删除','ref-project-bulk-delete','ghost','trash')}${btn('取消','ref-project-bulk-cancel','outline')}</div>`:`<div class="ref-project-tabs" role="tablist" aria-label="项目"><button role="tab" aria-selected="${referenceLibrary.tab==='mine'}" class="${referenceLibrary.tab==='mine'?'active':''}" data-action="ref-project-tab:mine">我的项目</button><button role="tab" aria-selected="${referenceLibrary.tab==='team'}" class="${referenceLibrary.tab==='team'?'active':''}" data-action="ref-project-tab:team">团队项目</button></div><div class="ref-project-filters"><button data-action="ref-project-filter-menu" aria-label="类型">${{all:'全部类型',projects:'仅项目',folders:'仅文件夹'}[referenceLibrary.filter]}${I('down')}</button><button data-action="ref-project-sort-menu" aria-label="排序方式">${{modified:'按最近修改',created:'按创建日期',size:'按文件大小'}[referenceLibrary.sort]}${I('down')}</button><span class="top-spacer"></span><input id="ref-project-search" type="search" placeholder="搜索项目" aria-label="搜索项目" value="${esc(referenceLibrary.query)}">${btn('批量管理','ref-project-bulk','ghost','check')}${btn('回收站','ref-project-trash','ghost','trash')}${btn('新建文件夹','ref-folder','outline','folder')}</div>`;
 return `<main class="ref-project-page"><div class="ref-project-toolbar">${controls}</div>${folder?`<div class="ref-folder-breadcrumb"><button data-action="ref-project-folder-root">我的项目</button>${I('chev')}<strong>${esc(folder.name)}</strong></div>`:''}${referenceLibrary.tab==='team'?'<div class="ref-library-empty"><p>尚未连接团队空间</p><small>本地 Demo 的项目保存在当前浏览器</small></div>':referenceProjectCards(true)}</main>`;
}
home=function(){return referenceSection==='projects'?referenceLibraryPage():referenceProjectsHome()};
function referenceCloseProjectMenu(restore=false){const m=referenceProjectMenu;referenceProjectMenu=null;document.getElementById('ref-project-menu')?.remove();if(restore&&m?.opener?.isConnected)m.opener.focus({preventScroll:true})}
function referenceOpenProjectMenu(id){const p=referenceProjectById(id);if(!p)return;const opener=document.querySelector(`[data-action="ref-project-menu:${id}"]`);referenceShowProjectMenu('更多',`${[['details','查看详情','file'],['rename','重命名','edit'],['move','移动至','folder'],['pin',p.meta.pinned?'取消置顶':'置顶','pin'],['delete','删除','trash']].map(([action,label,icon])=>`<button role="menuitem" data-action="ref-project-${action}:${id}" class="${action==='delete'?'danger':''}">${I(icon)}${label}</button>`).join('')}`,opener)}
function referenceShowProjectMenu(label,html,opener){
 referenceCloseProjectMenu();const el=document.createElement('div');el.id='ref-project-menu';el.className='ref-project-popup';el.setAttribute('role','menu');el.setAttribute('aria-label',label);el.innerHTML=html;document.body.append(el);referenceProjectMenu={opener};const a=opener?.getBoundingClientRect()||{left:20,bottom:80,top:60};const r=el.getBoundingClientRect();el.style.left=Math.min(Math.max(12,a.left),innerWidth-r.width-12)+'px';el.style.top=(a.bottom+r.height+8<=innerHeight-12?a.bottom+6:Math.max(12,a.top-r.height-6))+'px';el.querySelector('button')?.focus({preventScroll:true});
}
function referenceProjectForm(kind,ids=[]){
 referenceCloseProjectMenu();referenceProjectEdit={kind,ids};const item=ids[0]&&referenceProjectById(ids[0]);
 const moving=kind==='move',title=moving?'移动至':kind==='folder'?'新建文件夹':'重命名';
 const body=moving?`<div class="ref-folder-list" role="radiogroup" aria-label="目标文件夹"><label><input type="radio" name="ref-destination" value="" checked>我的项目</label>${S.referenceFolders.filter(f=>!f.deletedAt&&!ids.includes(f.id)).map(f=>`<label><input type="radio" name="ref-destination" value="${f.id}">${I('folder')}${esc(f.name)}</label>`).join('')}</div>`:`<label class="field"><input id="ref-project-name-input" aria-label="${kind==='folder'?'请输入文件夹名称':'项目名称'}" placeholder="${kind==='folder'?'请输入文件夹名称':'输入名称'}" value="${kind==='rename'?esc(item.name):''}" maxlength="100"></label>`;
 const root=showDialog(title,body+'<p class="ref-project-error" id="ref-project-error" hidden></p>',`${btn('取消','close-modal','outline')}${btn(moving?'移动':'确认','ref-project-form-save','primary')}`);root.querySelector('.dialog').classList.add('ref-project-dialog');root.querySelector('input')?.focus();
}
function referenceSaveProjectForm(){
 const edit=referenceProjectEdit;if(!edit)return;
 const error=document.getElementById('ref-project-error');const fail=message=>{error.hidden=false;error.textContent=message};
 if(edit.kind==='move'){
  const folder=document.querySelector('input[name="ref-destination"]:checked')?.value||null;
  for(const id of edit.ids){const p=referenceProjectById(id);if(p){if(p.kind==='folder'&&folder!==null){fail('文件夹暂不支持嵌套');return}p.meta.folder=folder}}
 }else{
  const name=document.getElementById('ref-project-name-input').value.trim();if(!name){fail('请输入名称');return}
  if(edit.kind==='folder'){
   if(S.referenceFolders.some(f=>!f.deletedAt&&f.name===name&&f.folder===referenceLibrary.folder)){fail('此处已有同名文件夹');return}
   S.referenceFolders.push({id:'folder-'+studioRandomUUID(),name,folder:referenceLibrary.folder,createdAt:new Date().toISOString(),modifiedAt:new Date().toISOString(),sequence:Date.now(),pinned:false,deletedAt:null});
  }else{
   const p=referenceProjectById(edit.ids[0]);if(!p)return;
   if(p.kind==='project'){
    if(name!==p.name&&S.projectDrafts[name]){fail('已有同名项目，请换一个名称');return}
    if(name!==p.name){const old=p.name;S.projectDrafts[name]=S.projectDrafts[old];S.projectDrafts[name].project=name;delete S.projectDrafts[old];S.referenceProjectMeta[name]=S.referenceProjectMeta[old];delete S.referenceProjectMeta[old];if(S.project===old)S.project=name}
   }else p.meta.name=name;
  }
 }
 closeDialog();render();persist();toast(edit.kind==='move'?'已移动':edit.kind==='folder'?'已新建文件夹':'名称已保存');
}
function referenceTrashDialog(){
 const items=[...S.referenceFolders.map(referenceFolderItem),...referenceAllProjects()].filter(p=>p.meta.deletedAt);
 const root=showDialog('回收站',`<p class="ref-trash-note">已删除项目仍保留配置和历史，可以恢复。</p><div class="ref-trash-list">${items.map(p=>`<div><span>${I(p.kind==='folder'?'folder':'file')}<strong>${esc(p.name)}</strong></span>${btn('恢复','ref-project-restore:'+p.id,'outline')}</div>`).join('')||'<p class="ref-library-empty">回收站是空的</p>'}</div>`,btn('关闭','close-modal','outline'));root.querySelector('.dialog').classList.add('ref-project-dialog');
}
function referenceDeleteProjects(ids){
 const time=new Date().toISOString();for(const id of ids){const item=referenceProjectById(id);if(item)item.meta.deletedAt=time}
 referenceLibrary.selected=[];referenceCloseProjectMenu();render();persist();toast('已移至回收站，可以恢复');
}
function referenceLibraryRenderPreservingSearch(){const input=document.getElementById('ref-project-search'),focused=document.activeElement===input,start=input?.selectionStart;render();const next=document.getElementById('ref-project-search');if(focused){next?.focus({preventScroll:true});next?.setSelectionRange(start,start)}}
handleAction=function(action){
 const [key,...args]=action.split(':'),value=args.join(':');
 if(key==='ref-rename'){const p=referenceAllProjects().find(p=>p.name===S.project);if(p)referenceProjectForm('rename',[p.id]);return}
 if(key==='ref-new'){const folder=referenceLibrary.folder;referenceProjectsAction(action);rememberProject();const meta=S.referenceProjectMeta[S.project];meta.folder=folder;meta.createdAt=new Date().toISOString();persist();return}
 if(key==='ref-project-open'){
  const p=referenceProjectById(value);if(!p)return;if(p.kind==='folder'){referenceLibrary.folder=p.id;referenceLibrary.query='';render()}else{referenceCloseProjectMenu();referenceProjectsAction('resume-project:'+p.name)}return;
 }
 if(key==='ref-project-menu'){referenceOpenProjectMenu(value);return}
 if(key==='ref-project-details'){
  const p=referenceProjectById(value);if(!p)return;referenceCloseProjectMenu();const counts={image:0,video:0,audio:0};p.draft?.nodes.forEach(n=>{const k=mediaKind(n);if(k in counts)counts[k]+=n.candidates?.filter(c=>c.createdAt).length||0});showDialog('画布详情',`<h3 class="ref-project-detail-title">${esc(p.name)}</h3><div class="ref-project-stats">${[['生成图片数量',counts.image],['生成视频数量',counts.video],['生成3D数量',0],['生成音频数量',counts.audio]].map(([label,count])=>`<div><span>${label}</span><strong>${count}</strong></div>`).join('')}</div><p class="ref-project-cost">本地示例，不产生真实消耗</p>`,btn('关闭','close-modal','outline'));return;
 }
 if(key==='ref-folder'){referenceProjectForm('folder');return}
 if(key==='ref-project-rename'){referenceProjectForm('rename',[value]);return}
 if(key==='ref-project-form-save'){referenceSaveProjectForm();return}
 if(key==='ref-project-move'){referenceProjectForm('move',[value]);return}
 if(key==='ref-project-pin'){const p=referenceProjectById(value);if(p)p.meta.pinned=!p.meta.pinned;referenceCloseProjectMenu();render();persist();return}
 if(key==='ref-project-delete'){referenceDeleteProjects([value]);return}
 if(key==='ref-project-restore'){const p=referenceProjectById(value);if(p){p.meta.deletedAt=null;const folder=S.referenceFolders.find(f=>f.id===p.meta.folder);if(folder?.deletedAt)p.meta.folder=null}persist();referenceTrashDialog();render();return}
 if(key==='ref-project-trash'){referenceTrashDialog();return}
 if(key==='ref-project-folder-root'){referenceLibrary.folder=null;referenceLibrary.query='';render();return}
 if(key==='ref-project-tab'){referenceLibrary.tab=value;referenceLibrary.folder=null;referenceLibrary.bulk=false;referenceLibrary.selected=[];render();return}
 if(key==='ref-project-filter-menu'){
  const opener=document.querySelector('[data-action="ref-project-filter-menu"]');referenceShowProjectMenu('类型',[['all','全部类型'],['projects','仅项目'],['folders','仅文件夹']].map(([v,l])=>`<button role="menuitemradio" aria-checked="${referenceLibrary.filter===v}" data-action="ref-project-filter:${v}">${l}${referenceLibrary.filter===v?I('check'):''}</button>`).join(''),opener);return;
 }
 if(key==='ref-project-sort-menu'){
  referenceShowProjectMenu('排序方式',`<p>排序方式</p>${[['modified','按最近修改'],['created','按创建日期'],['size','按文件大小']].map(([v,l])=>`<button role="menuitemradio" aria-checked="${referenceLibrary.sort===v}" data-action="ref-project-sort:${v}">${l}${referenceLibrary.sort===v?I('check'):''}</button>`).join('')}<p>顺序</p>${[['desc','最新优先'],['asc','最早优先']].map(([v,l])=>`<button role="menuitemradio" aria-checked="${referenceLibrary.order===v}" data-action="ref-project-order:${v}">${l}${referenceLibrary.order===v?I('check'):''}</button>`).join('')}`,document.querySelector('[data-action="ref-project-sort-menu"]'));return;
 }
 if(['ref-project-filter','ref-project-sort','ref-project-order'].includes(key)){referenceLibrary[key.split('-').at(-1)]=value;referenceCloseProjectMenu();render();return}
 if(key==='ref-project-bulk'){referenceLibrary.bulk=true;referenceLibrary.selected=[];render();return}
 if(key==='ref-project-bulk-cancel'){referenceLibrary.bulk=false;referenceLibrary.selected=[];render();return}
 if(key==='ref-project-select'){referenceLibrary.selected=referenceLibrary.selected.includes(value)?referenceLibrary.selected.filter(id=>id!==value):[...referenceLibrary.selected,value];render();return}
 if(key==='ref-project-select-all'){const ids=referenceLibraryItems().map(p=>p.id);referenceLibrary.selected=ids.every(id=>referenceLibrary.selected.includes(id))?[]:ids;render();return}
 if(key==='ref-project-bulk-delete'){if(referenceLibrary.selected.length)referenceDeleteProjects(referenceLibrary.selected);return}
 if(key==='ref-project-bulk-move'){if(referenceLibrary.selected.length)referenceProjectForm('move',referenceLibrary.selected);return}
 if(key==='ref-project-bulk-pin'){referenceLibrary.selected.forEach(id=>{const p=referenceProjectById(id);if(p)p.meta.pinned=true});referenceLibrary.selected=[];render();persist();toast('已置顶所选项目');return}
 if(key==='ref-copy-team'){showDialog('复制到团队','<p>本地 Demo 尚未连接团队空间，项目保留在当前浏览器。</p>',btn('关闭','close-modal','outline'));return}
 if(referenceProjectMenu)referenceCloseProjectMenu();
 referenceProjectsAction(action);
};
document.addEventListener('input',event=>{if(event.target.id==='ref-project-search'){referenceLibrary.query=event.target.value;referenceLibraryRenderPreservingSearch()}});
document.addEventListener('change',event=>{if(event.target.matches('[data-ref-project-check]'))handleAction('ref-project-select:'+event.target.dataset.refProjectCheck)});
document.addEventListener('pointerdown',event=>{if(referenceProjectMenu&&!event.target.closest('#ref-project-menu,[data-action^="ref-project-menu:"],[data-action="ref-project-filter-menu"],[data-action="ref-project-sort-menu"]'))referenceCloseProjectMenu()},true);
document.addEventListener('keydown',event=>{if(referenceProjectMenu&&event.key==='Escape'){referenceCloseProjectMenu(true);event.preventDefault();event.stopImmediatePropagation()}else if(referenceProjectMenu&&['ArrowDown','ArrowUp'].includes(event.key)){const buttons=[...document.querySelectorAll('#ref-project-menu button')];const index=buttons.indexOf(document.activeElement),offset=event.key==='ArrowDown'?1:-1;buttons[(index+offset+buttons.length)%buttons.length]?.focus();event.preventDefault()}},true);
window.addEventListener('resize',()=>referenceCloseProjectMenu());
referenceEnsureProjectMeta();
render();
