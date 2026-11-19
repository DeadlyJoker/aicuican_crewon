/* Homepage discovery searches the local examples already available in the Demo. */
'use strict';
function referenceFilterInspiration(items,query){
 const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
 return items.filter(item=>item.key!=='blank'&&terms.every(term=>normalize(item.name+' '+(item.description||'')).includes(term)));
}
function referenceInspirationDirectory(category=S.referenceDiscover||0){
 if(category===1)return typeof referenceSkillCatalog==='undefined'?[]:referenceSkillCatalog.map(item=>({...item,key:item.id,skill:true}));
 if(category===3)return typeof referenceWorkflowTemplates==='function'?referenceWorkflowTemplates().map(item=>({...item,key:item.id,workflow:true})):[];
 return studioExamples.filter(item=>item.key!=='blank'&&item.key!=='previs');
}
function referenceInspirationHtml(){
 const query=S.referenceInspirationSearch||'',category=S.referenceDiscover||0,items=referenceFilterInspiration(referenceInspirationDirectory(category),query);
 const noun=['作品示例','技能','同款示例','工作流'][category]||'作品示例';
 const cards=items.map(item=>`<button ${item.workflow?`data-inspiration-workflow="${esc(item.id)}"`:item.skill?`data-inspiration-skill="${esc(item.id)}"`:`data-action="ref-example:${esc(item.key)}"`} title="${item.workflow?'查看模板内容':item.skill?'查看技能详情':'从示例新建副本'}"><span class="still frame${item.frame}">${item.cover?`<img src="${esc(item.cover)}" alt="">`: ''}</span><strong>${esc(item.name)}</strong>${category?`<small class="ref-inspiration-description">${esc(item.description||'')}</small>`:''}</button>`).join('');
 if(!items.length)return `<div class="ref-inspiration-empty"><p role="status">${query.trim()?'没有匹配的本地'+noun:category===1?'本地技能目录尚未接入':'暂无本地'+noun}</p>${query.trim()?'<button data-action="ref-inspiration-clear">清空搜索</button>':''}</div>`;
 return cards+`<p class="ref-inspiration-status" role="status">${query.trim()?'找到 ':''}${items.length} 个本地${noun}${category===3?' · 查看不会添加节点或执行生成':''}</p>`;
}
function referenceRefreshInspiration(){
 const results=document.getElementById('ref-inspiration-results');if(results)results.innerHTML=referenceInspirationHtml();
}
document.addEventListener('input',event=>{
 if(!event.target.matches('.ref-discover input[aria-label="搜索灵感"]'))return;
 S.referenceInspirationSearch=event.target.value;referenceRefreshInspiration();save();
});
document.addEventListener('click',event=>{
 const clear=event.target.closest('[data-action="ref-inspiration-clear"]');if(!clear)return;
 event.preventDefault();event.stopImmediatePropagation();S.referenceInspirationSearch='';
 const field=document.querySelector('.ref-discover input[aria-label="搜索灵感"]');
 if(field){field.value='';field.focus({preventScroll:true});}referenceRefreshInspiration();save();
},true);

// Template cards inspect the shared catalog without applying it to a hidden project.
document.addEventListener('click',event=>{
 const card=event.target.closest('[data-inspiration-workflow]');if(!card)return;
 event.preventDefault();event.stopImmediatePropagation();
 const template=referenceWorkflowTemplates().find(item=>item.id===card.dataset.inspirationWorkflow);if(!template)return;
 showDialog(template.name,`<div class="ref-inspiration-template"><p>${esc(template.description||'')}</p><p class="ref-inspiration-template-meta">${template.nodes.length} 个节点 · ${template.edges.length} 条连线 · 本地模板</p><ol>${template.nodes.map(node=>`<li><strong>${esc(node.title)}</strong><small>${esc(node.prompt||'等待输入内容')}</small></li>`).join('')}</ol><p class="ref-inspiration-template-note">从模板新建独立画布，原项目保留；不会启动生成。</p></div>`,btn('关闭','close-modal','outline')+`<button class="button primary" data-inspiration-use="${esc(template.id)}">使用此工作流</button>`);
},true);

/** Prepare an independent editable graph before switching the active project. */
function referenceEmptyProjectDraft(name){return {...makeStudioExample('blank'),project:name,nodes:[],edges:[],clips:[],history:[],versions:{},approved:false,videoReady:false,revision:1,pan:{x:0,y:0},zoom:1,layoutBase:[],nodeDrafts:{},canvasUndo:[],canvasRedo:[],spent:0,referenceProjectEdit:null,referenceCreationSpec:null,referenceSourceScript:null,referenceCanvasViews:[],referenceGroupNames:{},referenceGroups:null,referenceTagCatalog:null,referenceBoard:null};}
function referencePrepareWorkflowProject(template,prefix,name,createdAt){
 const project=referenceEmptyProjectDraft(name);
 const result=referenceImportWorkflow(project,template,prefix,{x:96,y:100});if(!result.ok)return result;
 project.history=[{type:'workflow-import',templateId:template.id,templateName:template.name,createdAt}];
 return {ok:true,project};
}
/** Failed local persistence leaves the previous project and template preview intact. */
function referenceCommitWorkflowProject(state,project,sequence,remember,write){
 const previous=structuredClone(state);
 try{remember();Object.assign(state,project,{projectSequence:sequence,screen:'canvas',goal:'blank',view:'canvas',scene:'all',timeline:false,selected:null,panel:null,toolCategory:0});remember();write();return {ok:true};}
 catch(error){for(const key of Object.keys(state))delete state[key];Object.assign(state,previous);return {ok:false,error:'新画布未保存，请检查浏览器存储空间后重试'};}
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-inspiration-use]');if(!button||S.screen!=='home')return;
 event.preventDefault();event.stopImmediatePropagation();const template=referenceWorkflowTemplates().find(item=>item.id===button.dataset.inspirationUse);if(!template){toast('模板已不存在，请关闭预览后重新选择');return;}
 let sequence=S.projectSequence||0,name;do{name=template.name+' · 草稿 '+(++sequence);}while(S.projectDrafts[name]);
 const prepared=referencePrepareWorkflowProject(template,studioScriptId('workflow'),name,new Date().toISOString());if(!prepared.ok){toast(prepared.error);return;}
 const committed=referenceCommitWorkflowProject(S,prepared.project,sequence,rememberProject,persist);if(!committed.ok){toast(committed.error);return;}
 closeDialog();location.hash='canvas';render();fitCanvas(false);toast('已从模板新建画布，尚未生成');
},true);
