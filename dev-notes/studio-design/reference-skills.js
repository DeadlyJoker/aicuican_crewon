/* Curated local skill briefs reproduce discovery and handoff, not remote skill execution. */
'use strict';
const referenceSkillCatalog=[
 {id:'city-walk',cover:'assets/reference-study/skills/city-walk.jpg',version:1,name:'电影感城市漫步',type:'视频',frame:4,description:'把城市路线整理成有节奏的旅行镜头。',use:'旅行记录、城市探索和目的地短片。',input:'提供城市、路线、目标时长和已有照片；补充希望保留的人物与氛围。',output:'镜头顺序、转场建议、运镜说明和可编辑的视频提示词。',prompt:'请帮我设计一段城市漫步短片。先确认城市、路线、时长与已有素材，再整理镜头和转场；制作前让我确认。'},
 {id:'food-asmr',cover:'assets/reference-study/skills/food-asmr.png',version:1,name:'沉浸式美食短片',type:'视频',frame:3,description:'围绕制作动作、食物质感和环境声音编排镜头。',use:'料理过程、美食探店和产品展示。',input:'提供食物、制作步骤、参考照片、目标时长与声音偏好。',output:'动作分镜、特写安排、声音清单和制作提示词。',prompt:'请帮我策划一段沉浸式美食短片。先确认食物、制作动作、时长与可用素材，再给出画面及声音安排。'},
 {id:'cafe-portrait',cover:'assets/reference-study/skills/cafe-portrait.png',version:1,name:'自然咖啡馆人像',type:'图片',frame:1,description:'围绕人物参考、自然动作和窗边光线准备人像方案。',use:'生活方式人像、角色氛围照和社交封面。',input:'提供人物参考、场景与服装要求，以及希望保留的身份特征。',output:'构图、动作、光线建议和可编辑的图片提示词。',prompt:'请帮我准备一组自然咖啡馆人像。先确认人物参考、服装、构图和光线，保持人物身份一致。'},
 {id:'script-adaptation',cover:'assets/reference-study/skills/script-adaptation.png',version:1,name:'剧本受众改编',type:'文本',frame:0,description:'保留故事主线，针对目标受众调整表达。',use:'短剧本地化、跨文化改编和对白修订。',input:'提供原剧本、目标地区和受众，说明必须保留的事实与角色关系。',output:'改编要点、差异说明和可供复核的剧本草稿。',prompt:'请帮我面向目标受众改编剧本。先确认原稿、地区、受众及必须保留的事实，再给出改编方向，确认后修改。'}
];
function referenceAssistantSkill(state){return state.referenceAssistantSkills?.[referenceAssistantDraftKey(state)]||null;}
function referenceOpenSkillDetail(id){
 const skill=referenceSkillCatalog.find(item=>item.id===id);if(!skill)return;
 const root=showDialog('创作技能',`<div class="ref-skill-hero"><div><small>${esc(skill.type)} · 本地技能样例</small><h2>${esc(skill.name)}</h2><p>${esc(skill.description)}</p><button class="button primary" data-skill-use="${skill.id}">添加到对话</button></div><figure><img class="ref-skill-detail-cover" src="${esc(skill.cover)}" alt="${esc(skill.name)}对照封面"><figcaption>原站对照封面 · 本地交互示例</figcaption></figure></div><section class="ref-skill-intro" aria-label="技能简介"><h3>简介</h3><dl>${[['使用场景',skill.use],['如何使用',skill.input],['预期产出',skill.output]].map(([label,text])=>`<div><dt>${label}</dt><dd>${esc(text)}</dd></div>`).join('')}</dl></section>`, '',true);
 root.querySelector('.dialog').classList.add('ref-skill-detail-dialog');
}
function referenceLaunchSkill(id){
 const skill=referenceSkillCatalog.find(item=>item.id===id);if(!skill||S.screen!=='home')return;
 let sequence=S.projectSequence||0,name;do{name=skill.name+' · 草稿 '+(++sequence);}while(S.projectDrafts[name]);
 const project=referenceEmptyProjectDraft(name);
 const remember=()=>{rememberProject();if(S.project===name){S.referenceAssistantSkills??={};S.referenceAssistantSkills[referenceAssistantDraftKey(S)]=structuredClone(skill);referenceSetAssistantDraft(S,skill.prompt);}};
 const result=referenceCommitWorkflowProject(S,project,sequence,remember,()=>{S.panel='director';persist();});
 if(!result.ok){toast(result.error);return;}
 closeDialog();location.hash='canvas';render();document.querySelector('#director-form textarea')?.focus({preventScroll:true});
}
const referenceSkillInspector=inspectorHtml;
inspectorHtml=function(){const html=referenceSkillInspector(),skill=referenceAssistantSkill(S);return S.panel==='director'&&skill?html.replace('<div class="ref-assistant-composer-context">',`<div class="ref-assistant-skill"><span>${I('spark')}${esc(skill.name)}</span><button type="button" data-skill-remove aria-label="移除技能 ${esc(skill.name)}">${I('close')}</button></div><div class="ref-assistant-composer-context">`):html;};
const referenceSkillDirection=referenceAssistantDirectionEntry;
referenceAssistantDirectionEntry=function(state,text,createdAt){const entry=referenceSkillDirection(state,text,createdAt),skill=referenceAssistantSkill(state);return skill?{...entry,skill:structuredClone(skill)}:entry;};
document.addEventListener('click',event=>{
 const detail=event.target.closest('[data-inspiration-skill]'),use=event.target.closest('[data-skill-use]'),remove=event.target.closest('[data-skill-remove]');if(!detail&&!use&&!remove)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(detail)referenceOpenSkillDetail(detail.dataset.inspirationSkill);
 else if(use)referenceLaunchSkill(use.dataset.skillUse);
 else{delete S.referenceAssistantSkills[referenceAssistantDraftKey(S)];render();save();document.querySelector('#director-form textarea')?.focus({preventScroll:true});}
},true);
referenceRefreshInspiration();
if(S.screen==='canvas'&&S.panel==='director')render();
