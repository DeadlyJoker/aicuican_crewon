/* Interactive-story requirements are separate from a generated or authored branch graph. */
'use strict';
const referenceInteractiveDefaults={template:'默认',shots:8,choices:2,options:2,endings:2};
const referenceInteractiveExamples=[
 {title:'逃离午夜列车',text:'一名调查员被困在午夜列车，观众需要选择相信哪位乘客，沿不同线索寻找出口。信任会带来帮助，也可能引入误导；请设计两个不同结局。'},
 {title:'毕业前的告白',text:'毕业典礼前，主角决定是否说出心意。观众通过几次日常选择影响两人的坦诚程度，让关系走向勇敢告白或温柔道别，保留两个自然的结局。'},
 {title:'沉没遗迹探险',text:'探险者进入正在下沉的遗迹，必须在救援同伴与寻找出口之间作出选择。线索影响最终路线，安排两个结局，避免无提示的必死选项。'},
];
let referenceInteractivePanel=null,referenceInteractiveExpanded=false;
function referenceInteractiveOptions(){return {...referenceInteractiveDefaults,...S.referenceInteractiveOptions};}
function referenceValidateInteractiveOptions(value){
 if(!['默认','悬疑','恋爱','古风','科幻'].includes(value.template))return {ok:false,error:'请选择有效的故事模板'};
 for(const key of ['shots','choices','options','endings'])if(!Number.isSafeInteger(value[key])||value[key]<1)return {ok:false,error:'数量请填写正整数'};
 if(value.options<2)return {ok:false,error:'每次选择至少需要两个选项'};
 if(value.choices>value.shots)return {ok:false,error:'选择点数量不能超过分镜总数'};
 return {ok:true};
}
function referenceCloseInteractiveSettings(focus=true){
 if(!referenceInteractivePanel)return;referenceInteractivePanel.remove();referenceInteractivePanel=null;
 const button=document.querySelector('[data-action="ref-interactive-settings"]');button?.setAttribute('aria-expanded','false');if(focus)button?.focus({preventScroll:true});
}
function referenceInteractiveSettings(){
 if(referenceInteractivePanel){referenceCloseInteractiveSettings();return;}
 const value=referenceInteractiveOptions(),root=document.createElement('section');root.className='ref-interactive-settings';root.setAttribute('role','dialog');root.setAttribute('aria-label','故事设置');
 root.innerHTML=`<header><h3>故事结构</h3><button data-interactive-reset>恢复默认</button></header><form><label>模板<select name="template" aria-label="故事模板">${['默认','悬疑','恋爱','古风','科幻'].map(item=>`<option ${item===value.template?'selected':''}>${item}</option>`).join('')}</select></label>${[['shots','分镜总数'],['choices','选择点数量'],['options','每次选项数'],['endings','结局数量']].map(([key,label])=>`<label>${label}<input type="number" name="${key}" aria-label="${label}" min="${key==='options'?2:1}" step="1" value="${value[key]}"></label>`).join('')}<p role="alert" hidden></p></form>`;
 document.body.append(root);referenceInteractivePanel=root;document.querySelector('[data-action="ref-interactive-settings"]').setAttribute('aria-expanded','true');referencePositionInteractiveSettings();root.querySelector('select').focus({preventScroll:true});
 root.querySelector('form').addEventListener('submit',event=>event.preventDefault());
 root.addEventListener('input',()=>{
  const form=root.querySelector('form'),next={template:form.elements.template.value,...Object.fromEntries(['shots','choices','options','endings'].map(key=>[key,form.elements[key].value===''?NaN:Number(form.elements[key].value)]))},result=referenceValidateInteractiveOptions(next),error=root.querySelector('[role=alert]');error.hidden=result.ok;error.textContent=result.error||'';
  if(result.ok){const old=S.referenceInteractiveOptions;S.referenceInteractiveOptions=next;try{persist();}catch(error){S.referenceInteractiveOptions=old;root.querySelector('[role=alert]').hidden=false;root.querySelector('[role=alert]').textContent='设置未保存，请检查本机存储空间';}}
 });
 root.querySelector('[data-interactive-reset]').addEventListener('click',()=>{S.referenceInteractiveOptions={...referenceInteractiveDefaults};save();referenceCloseInteractiveSettings(false);referenceInteractiveSettings();});
}
function referencePositionInteractiveSettings(){
 const root=referenceInteractivePanel,button=document.querySelector('[data-action="ref-interactive-settings"]');if(!root||!button)return;
 const rect=button.getBoundingClientRect(),box=root.getBoundingClientRect();root.style.left=Math.max(12,Math.min(rect.left,innerWidth-box.width-12))+'px';const above=rect.top-box.height-10,below=rect.bottom+10;root.style.top=(above>=72?above:Math.max(72,Math.min(below,innerHeight-box.height-12)))+'px';
}
const referenceInteractiveHome=home;
home=function(){
 let html=referenceInteractiveHome();if(S.referenceMode!=='interactive'||referenceSection!=='home')return html;
 html=html.replace('<h1>今天，开始</h1>','<h1>故事，从选择开始</h1>').replace('class="ref-composer "',`class="ref-composer is-interactive ${referenceInteractiveExpanded?'is-expanded':''}"`).replace('aria-label="创作内容"','aria-label="互动影游创意"').replace('描述你想创作的内容，例如：雨夜街头的一段电影镜头','描述主角、故事目标，以及观众面临的选择…');
 html=html.replace('<textarea id="idea-input"',`<button class="ref-interactive-upload" data-action="ref-upload" aria-label="添加素材">${I('plus')}<span>添加素材</span></button><textarea id="idea-input"`);
 html=html.replace('</textarea></div><footer',`</textarea><button class="ref-interactive-expand icon-btn" data-action="ref-interactive-expand" aria-label="${referenceInteractiveExpanded?'收起输入框':'展开输入框'}" aria-expanded="${referenceInteractiveExpanded}">${I('fit')}</button></div><footer`);
 html=html.replace(/<footer class="ref-composer-footer">[\s\S]*?<\/footer>/,`<footer class="ref-composer-footer"><button class="ref-setting-trigger" data-action="ref-interactive-settings" aria-expanded="${!!referenceInteractivePanel}">${I('production')}故事设置</button>${referenceOption('ratio',S.referenceOptions.ratio)}${referenceOption('style',S.referenceOptions.style)}<span class="top-spacer"></span><button class="ref-start-button" data-action="ref-start" aria-label="开始创作互动影游" ${!referenceEntryInput(S).trim()||referenceEntryReading.has('interactive')?'disabled':''}>${I('arrowup')}</button></footer>`);
 html=html.replace('</section><section class="ref-recent"',`</section><div class="ref-previs-suggestions ref-interactive-examples" role="group" aria-label="故事示例"><span>从示例开始：</span>${referenceInteractiveExamples.map((item,index)=>`<button data-action="ref-interactive-example:${index}">${item.title}</button>`).join('')}</div><section class="ref-recent"`);
 return html;
};
const referenceInteractiveAction=handleAction;
handleAction=function(action){
 if(action==='ref-interactive-settings'){referenceCloseSettings(false);referenceInteractiveSettings();return;}
 if(action==='ref-interactive-expand'){referenceInteractiveExpanded=!referenceInteractiveExpanded;render();document.querySelector('[data-action="ref-interactive-expand"]')?.focus({preventScroll:true});return;}
 if(action.startsWith('ref-interactive-example:')){const example=referenceInteractiveExamples[Number(action.split(':')[1])];if(!example)return;referenceSetEntryInput(S,example.text);render();document.getElementById('idea-input')?.focus({preventScroll:true});save();return;}
 if(action==='ref-start'&&S.referenceMode==='interactive'&&referenceInteractivePanel&&!referenceInteractivePanel.querySelector('[role=alert]').hidden){toast('请先修正故事设置');return;}
 const creating=action==='ref-start'&&S.referenceMode==='interactive',spec=creating?referenceInteractiveOptions():null;
 if(referenceInteractivePanel)referenceCloseInteractiveSettings(false);
 referenceInteractiveAction(action);
 if(creating&&S.screen==='canvas'){S.referenceCreationSpec={...S.referenceCreationSpec,interactive:structuredClone(spec)};const plan=S.nodes.find(node=>node.id==='interactive-plan');if(plan)plan.text+=`\n\n故事模板：${spec.template}\n分镜总数：${spec.shots}\n选择点：${spec.choices}\n每次选项：${spec.options}\n结局：${spec.endings}`;render();save();}
};
document.addEventListener('pointerdown',event=>{if(referenceInteractivePanel&&!event.target.closest('.ref-interactive-settings,[data-action="ref-interactive-settings"]'))referenceCloseInteractiveSettings(false);},true);
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&referenceInteractivePanel){event.preventDefault();event.stopImmediatePropagation();referenceCloseInteractiveSettings();}},true);
window.addEventListener('resize',referencePositionInteractiveSettings);

if(S.screen==='home'&&S.referenceMode==='interactive')render();
