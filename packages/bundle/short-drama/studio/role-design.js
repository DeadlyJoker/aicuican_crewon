/* Role tags are edited separately from prompt text and committed to one node. */
'use strict';
let roleDesignPanel=null;
function roleDesignSelection(d){return structuredClone(d.creationRoleDesign||{});}
function roleDesignToggle(selection,group,name){
 const values=selection[group.id]||[];
 if(!group.options.some(option=>option.name===name))return selection;
 if(!group.multiple){if(values.includes(name))delete selection[group.id];else selection[group.id]=[name];}
 else{const next=values.includes(name)?values.filter(value=>value!==name):name==='无'?['无']:[...values.filter(value=>value!=='无'),name];if(next.length)selection[group.id]=next;else delete selection[group.id];}
 return selection;
}
function roleDesignTriggerHtml(d){const count=Object.values(d.creationRoleDesign||{}).flat().length;return `<button class="role-design-trigger" data-action="role-design-open" aria-label="角色设计${count?' '+count:''}" title="角色设计">${I('user')}${count?`<span>${count}</span>`:''}</button>`;}
function roleDesignPosition(){
 const panel=document.querySelector('.role-design-panel'),trigger=document.querySelector('.role-design-trigger');if(!panel||!trigger)return;
 const r=trigger.getBoundingClientRect(),margin=12,width=Math.min(900,innerWidth-margin*2),height=Math.min(520,innerHeight-margin*2);
 panel.style.width=width+'px';panel.style.height=height+'px';panel.style.left=Math.max(margin,Math.min(innerWidth-width-margin,r.left+r.width/2-width/2))+'px';panel.style.top=Math.max(margin,Math.min(innerHeight-height-margin,r.top-height-10))+'px';
}
function roleDesignBody(){
 const p=roleDesignPanel,tab=roleDesignCatalog[p.tab],query=p.query.trim().toLocaleLowerCase();
 const groups=tab.groups.map(group=>({...group,options:group.options.filter(option=>(group.label+' '+option.name).toLocaleLowerCase().includes(query))})).filter(group=>group.options.length);
 return groups.length?groups.map(group=>`<section class="role-design-group"><h3>${esc(group.label)}</h3><div role="group" aria-label="${esc(group.label)}">${group.options.map(option=>`<button class="role-design-option" data-role-group="${esc(group.id)}" data-role-option="${esc(option.name)}" aria-label="${esc(option.name)}" aria-pressed="${(p.selection[group.id]||[]).includes(option.name)}"><span>${option.image?`<img src="${esc(option.image)}" alt="" loading="lazy" draggable="false">`:I('user')}</span><small>${esc(option.name)}</small></button>`).join('')}</div></section>`).join(''):'<p class="role-design-empty">没有匹配的标签</p>';
}
function roleDesignFooter(){
 const values=Object.entries(roleDesignPanel.selection).flatMap(([group,names])=>names.map(name=>({group,name})));
 return `<div class="role-design-selected ${roleDesignPanel.expanded?'is-expanded':''}" role="list" aria-label="已选标签">${values.map(value=>`<button data-role-remove="${esc(value.group)}" data-role-name="${esc(value.name)}" aria-label="移除 ${esc(value.name)}">${esc(value.name)}${I('close')}</button>`).join('')}</div><div class="role-design-footer-actions">${values.length?`<button data-role-expand>已选 ${values.length} 项 · ${roleDesignPanel.expanded?'收起':'展开'}</button>`:'<span></span>'}<button data-role-close>取消</button><button class="role-design-save" data-role-save>保存</button></div>`;
}
function roleDesignDraw(){
 const p=roleDesignPanel;if(!p)return;document.querySelector('.role-design-layer')?.remove();
 document.body.insertAdjacentHTML('beforeend',`<div class="role-design-layer"><section class="role-design-panel" role="dialog" aria-modal="true" aria-label="角色设计"><header><nav role="tablist" aria-label="角色设计分类">${roleDesignCatalog.map((tab,index)=>`<button role="tab" aria-selected="${p.tab===index}" tabindex="${p.tab===index?0:-1}" data-role-tab="${index}">${esc(tab.name)}</button>`).join('')}</nav><label class="role-design-search">${I('search')}<input type="search" aria-label="搜索标签" placeholder="搜索标签" value="${esc(p.query)}"></label><details class="role-design-reset"><summary aria-label="重置已选标签">重置${I('down')}</summary><div><button data-role-reset="current">重置当前分类</button><button data-role-reset="all">全部重置</button></div></details><button class="role-design-close" data-role-close aria-label="关闭角色设计">${I('close')}</button></header><div class="role-design-body" role="tabpanel">${roleDesignBody()}</div><footer>${roleDesignFooter()}</footer></section></div>`);
 roleDesignPosition();
}
function roleDesignClose(){if(!roleDesignPanel)return;document.querySelector('.role-design-layer')?.remove();roleDesignPanel=null;document.querySelector('.role-design-trigger')?.focus({preventScroll:true});}
function roleDesignOpen(){const n=canvasCreationNode();if(!n||mediaKind(n)!=='image')return;roleDesignPanel={nodeId:n.id,project:S.project,tab:0,query:'',selection:roleDesignSelection(canvasCreationDraft(n)),expanded:false};roleDesignDraw();document.querySelector('[data-role-tab="0"]').focus();}
const roleDesignAction=handleAction;
handleAction=function(action){if(action==='role-design-open'){roleDesignOpen();return;}roleDesignAction(action);};
document.addEventListener('input',event=>{if(!roleDesignPanel||!event.target.matches('.role-design-search input'))return;roleDesignPanel.query=event.target.value;document.querySelector('.role-design-body').innerHTML=roleDesignBody();});
document.addEventListener('click',event=>{
 const p=roleDesignPanel;if(!p)return;
 const target=event.target;if(target.matches('.role-design-layer')||target.closest('[data-role-close]')){roleDesignClose();return;}
 const tab=target.closest('[data-role-tab]'),option=target.closest('[data-role-option]'),remove=target.closest('[data-role-remove]'),reset=target.closest('[data-role-reset]');
 if(tab){p.tab=Number(tab.dataset.roleTab);p.query='';roleDesignDraw();document.querySelector(`[data-role-tab="${p.tab}"]`).focus();return;}
 if(option){const group=roleDesignCatalog.flatMap(tab=>tab.groups).find(group=>group.id===option.dataset.roleGroup);roleDesignToggle(p.selection,group,option.dataset.roleOption);option.closest('[role=group]').querySelectorAll('[data-role-option]').forEach(button=>button.setAttribute('aria-pressed',(p.selection[group.id]||[]).includes(button.dataset.roleOption)));document.querySelector('.role-design-panel footer').innerHTML=roleDesignFooter();return;}
 if(remove){p.selection[remove.dataset.roleRemove]=p.selection[remove.dataset.roleRemove].filter(name=>name!==remove.dataset.roleName);if(!p.selection[remove.dataset.roleRemove].length)delete p.selection[remove.dataset.roleRemove];const scroll=document.querySelector('.role-design-body').scrollTop;roleDesignDraw();document.querySelector('.role-design-body').scrollTop=scroll;return;}
 if(reset){if(reset.dataset.roleReset==='all')p.selection={};else roleDesignCatalog[p.tab].groups.forEach(group=>delete p.selection[group.id]);roleDesignDraw();return;}
 if(target.closest('[data-role-expand]')){p.expanded=!p.expanded;document.querySelector('.role-design-panel footer').innerHTML=roleDesignFooter();return;}
 if(target.closest('[data-role-save]')){if(p.project!==S.project||!nodeById(p.nodeId)){roleDesignClose();return;}const draft=S.nodeDrafts[p.nodeId]??={};draft.creationRoleDesign=structuredClone(p.selection);roleDesignClose();refreshCanvasCreation();save();document.querySelector('.role-design-trigger')?.focus({preventScroll:true});}
});
window.addEventListener('keydown',event=>{
 if(!roleDesignPanel)return;event.stopPropagation();if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();const menu=document.querySelector('.role-design-reset[open]');if(menu){menu.open=false;menu.querySelector('summary').focus();}else roleDesignClose();return;}
 if(['ArrowLeft','ArrowRight'].includes(event.key)&&event.target.matches('[data-role-tab]')){event.preventDefault();const index=(roleDesignPanel.tab+(event.key==='ArrowRight'?1:roleDesignCatalog.length-1))%roleDesignCatalog.length;roleDesignPanel.tab=index;roleDesignPanel.query='';roleDesignDraw();document.querySelector(`[data-role-tab="${index}"]`).focus();return;}
 if(event.key==='Tab'){const controls=[...document.querySelectorAll('.role-design-panel button,.role-design-panel input,.role-design-panel summary')].filter(el=>el.getClientRects().length&&!el.disabled&&el.tabIndex!==-1),at=controls.indexOf(document.activeElement);if(event.shiftKey&&at<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&at===controls.length-1){event.preventDefault();controls[0]?.focus();}}
},true);
window.addEventListener('resize',roleDesignPosition);
if(document.getElementById('viewport'))refreshCanvasCreation();
