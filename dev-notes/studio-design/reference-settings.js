/* Live-reference parameter panels. Committed options and unconfirmed genre edits have separate owners. */
'use strict';
const referenceSettingsAction=handleAction;
let referenceSettingsPanel=null;
const referenceEpisodePresets=[1,5,10,30,60,80,100];
S.referenceStyleFavorites ||= [];
S.referenceStyleRecent ||= [];
S.referenceAdaptation ||= {mode:'rewrite',episodes:1};
const referenceAdaptationModes=[['rewrite','剧本改写','基于原稿调整人物、情节与结局。'],['continue','剧本续写','延续原稿，继续创作后续剧情。'],['overseas','剧本出海','']];
function referenceOption(key,label){
 if(key==='genre'&&S.referenceDrama==='adapt')key='adaptation';
 const title={genre:'题材设定',adaptation:'改编设定',style:'风格',ratio:'比例',episodes:'集数'}[key];
 if(key==='style')label='风格';
 if(key==='adaptation')label='改编设定 · '+({rewrite:'改写',continue:'续写',overseas:'剧本出海'})[S.referenceAdaptation.mode]+(S.referenceAdaptation.mode==='overseas'?'':' · '+S.referenceAdaptation.episodes+' 集');
 return `<button class="ref-setting-trigger" data-ref-setting="${key}" data-action="ref-open-setting:${key}" aria-label="${title}" aria-expanded="${referenceSettingsPanel?.kind===key}">${key==='episodes'?'':I({genre:'layers',adaptation:'sliders',style:'theme',ratio:'ratio'}[key])}<span>${esc(label)}</span>${I('down')}</button>`;
}
function referenceCloseSettings(restoreFocus=true){
 const panel=referenceSettingsPanel;referenceSettingsPanel=null;document.getElementById('ref-settings-panel')?.remove();
 if(panel){document.querySelector(`[data-ref-setting="${panel.kind}"]`)?.setAttribute('aria-expanded','false');if(restoreFocus)document.querySelector(`[data-ref-setting="${panel.kind}"]`)?.focus({preventScroll:true})}
}
function referencePositionSettings(){
 const panel=document.getElementById('ref-settings-panel'),state=referenceSettingsPanel;if(!panel||!state)return;
 const anchor=document.querySelector(`[data-ref-setting="${state.kind}"]`);if(!anchor){referenceCloseSettings(false);return}
 const a=anchor.getBoundingClientRect(),r=panel.getBoundingClientRect(),edge=12;
 const x=state.kind==='style'?(innerWidth-r.width)/2:state.kind==='genre'?a.left-96:a.left;
 const above=a.top-r.height-12,below=a.bottom+10;
 const y=above>=edge?above:below+r.height<=innerHeight-edge?below:Math.max(edge,Math.min(above,innerHeight-r.height-edge));
 panel.style.left=Math.max(edge,Math.min(x,innerWidth-r.width-edge))+'px';panel.style.top=y+'px';
}
function referenceOpenSettings(kind,nodeId=null){
 if(referenceSettingsPanel?.kind===kind){referenceCloseSettings();return}
 referenceCloseSettings(false);
 referenceSettingsPanel={kind,nodeId,project:S.project,genreTab:'main',main:S.referenceOptions.genreMain||S.referenceOptions.genre||'默认题材',blend:S.referenceOptions.genreBlend||'',styleTab:'square',category:'全部',query:'',styleLimit:20};
 if(!referenceSettingCatalog.genre.some(g=>g.name===referenceSettingsPanel.main))referenceSettingsPanel.main='默认题材';
 referenceDrawSettings();
}
function referenceGenrePanel(){
 const p=referenceSettingsPanel,blend=p.genreTab==='blend',current=blend?p.blend:p.main;
 const list=referenceSettingCatalog.genre.filter(g=>!blend||(g.name!=='默认题材'&&g.name!==p.main));
 return `<header class="ref-setting-header"><h2 class="ref-visually-hidden">题材设定</h2><div role="group" aria-label="题材设定"><button class="${!blend?'active':''}" data-action="ref-genre-tab:main" aria-pressed="${!blend}">主题材</button><button class="${blend?'active':''}" data-action="ref-genre-tab:blend" aria-pressed="${blend}" ${p.main==='默认题材'?'disabled':''}>融合题材</button></div>${iconBtn('关闭','ref-close-setting','close')}</header><div class="ref-genre-grid" role="radiogroup" aria-label="${blend?'融合题材（可选）':'主题材'}">${list.map((g,i)=>`<button role="radio" aria-checked="${g.name===current}" aria-label="${esc(g.name)}" data-action="ref-genre-pick:${referenceSettingCatalog.genre.indexOf(g)}"><span><img src="${g.image}" alt="">${g.name===current?`<i>${I('check')}</i>`:''}</span><strong>${esc(g.name)}</strong></button>`).join('')}</div><footer class="ref-setting-footer"><span class="ref-genre-selection">${esc(p.main)}${p.blend?`<button data-action="ref-genre-clear-blend" aria-label="移除融合题材">${I('close')}</button><span>${esc(p.blend)}</span>`:''}</span>${p.main!=='默认题材'&&!p.blend?`<button class="ref-add-blend" data-action="ref-genre-tab:blend">${I('plus')}${blend?'选择第二种题材':'添加融合题材'}</button>`:p.main==='默认题材'?'<button class="ref-add-blend" disabled>先选主题材</button>':'<small>双题材融合</small>'}<span class="top-spacer"></span><button class="ref-setting-confirm" data-action="ref-genre-confirm">确认</button></footer>`;
}
function referenceStyleCategory(name){return referenceSettingCatalog.style.find(g=>g.name===name)?.categories||[]}
function referenceStylePanel(){
 const p=referenceSettingsPanel;
 return `<header class="ref-setting-header ref-style-header"><div role="tablist" aria-label="风格来源">${[['square','风格广场'],['own','我的风格'],['favorites','我的收藏'],['recent','最近使用']].map(([key,label])=>`<button role="tab" aria-selected="${p.styleTab===key}" class="${p.styleTab===key?'active':''}" data-action="ref-style-tab:${key}">${label}</button>`).join('')}</div>${iconBtn('关闭','ref-close-setting','close')}</header><div class="ref-style-filters"><div>${['全部','真人风格','2D风格','3D风格'].map(v=>`<button aria-pressed="${p.category===v}" data-action="ref-style-category:${v}" class="${p.category===v?'active':''}">${v}</button>`).join('')}</div><label>${I('search')}<input aria-label="搜索风格名称" placeholder="搜索风格名称" value="${esc(p.query)}" data-ref-style-search></label></div><div class="ref-style-grid" id="ref-style-results">${referenceStyleResults()}</div>`;
}
function referenceStyleResults(){
 const p=referenceSettingsPanel;
 let list=referenceSettingCatalog.style;
 if(p.styleTab==='own')list=[];
 if(p.styleTab==='favorites')list=list.filter(g=>S.referenceStyleFavorites.includes(g.name));
 if(p.styleTab==='recent')list=S.referenceStyleRecent.map(name=>list.find(g=>g.name===name)).filter(Boolean);
 list=list.filter(g=>(p.category==='全部'||referenceStyleCategory(g.name).includes(p.category))&&g.name.toLowerCase().includes(p.query.toLowerCase()));
 return list.length?list.slice(0,p.styleLimit).map(g=>{const index=referenceSettingCatalog.style.indexOf(g),fav=S.referenceStyleFavorites.includes(g.name);return `<div class="ref-style-card"><button class="ref-style-choose" data-action="ref-style-pick:${index}" aria-label="${esc(g.name)}"><img src="${g.image}" alt=""><strong>${esc(g.name)}</strong></button><button class="ref-style-favorite" aria-label="${fav?'取消收藏':'收藏'} ${esc(g.name)}" aria-pressed="${fav}" data-action="ref-style-favorite:${index}">${I(fav?'check':'star')}</button></div>`}).join(''):`<div class="ref-settings-empty">${I('image')}<p>${p.styleTab==='own'?'还没有自定义风格':p.styleTab==='favorites'?'还没有收藏风格':p.styleTab==='recent'?'还没有使用过的风格':'没有找到匹配的风格'}</p></div>`;
}
function referenceRatioPanel(){const labels=[['默认比例','默认比例'],['9:16','9:16（竖屏）'],['16:9','16:9（横屏）'],['21:9','21:9（电影宽屏）'],['3:4','3:4'],['4:3','4:3'],['1:1','1:1']];return labels.map(([value,label])=>`<button data-action="ref-ratio-pick:${value}" aria-pressed="${S.referenceOptions.ratio===value}"><span class="ref-ratio-outline" style="--ratio:${value==='默认比例'?'1':value.replace(':','/')} " aria-hidden="true"></span><span>${label}</span>${S.referenceOptions.ratio===value?I('check'):''}</button>`).join('')}
function referenceEpisodePanel(){const production=S.referenceDrama==='produce',selected=production?(S.referenceProductionEpisodes||'默认·待分析'):S.referenceOptions.episodes,current=parseInt(selected)||0;return `<h2 class="ref-visually-hidden">选择集数</h2><div role="radiogroup" aria-label="集数">${production?`<button role="radio" aria-checked="${!current}" data-action="ref-episodes-pick:auto"><span>默认·待分析</span>${!current?I('check'):''}</button>`:''}${referenceEpisodePresets.map(n=>`<button role="radio" aria-checked="${current===n}" data-action="ref-episodes-pick:${n}"><span>${String(n).padStart(2,'0')} 集</span>${current===n?I('check'):''}</button>`).join('')}</div><form id="ref-custom-episodes"><label><input type="number" min="1" max="100" step="1" aria-label="自定义集数" placeholder="自定义" required><span>集</span></label><button aria-label="应用集数" type="submit" disabled>${I('check')}</button></form>`}
function referenceAdaptationPanel(){const a=S.referenceAdaptation;const mode=referenceAdaptationModes.find(m=>m[0]===a.mode);return `<header class="ref-setting-header"><h2>改编设定</h2>${iconBtn('关闭','ref-close-setting','close')}</header><div class="ref-adaptation-body"><div class="ref-adaptation-modes" role="radiogroup" aria-label="改编方式">${referenceAdaptationModes.map(([k,label])=>`<button role="radio" aria-checked="${a.mode===k}" class="${a.mode===k?'active':''}" data-action="ref-adaptation-mode:${k}">${label}</button>`).join('')}</div>${a.mode==='overseas'?'':`<p>${mode[2]}</p><div class="ref-adaptation-count-label"><span>${a.mode==='continue'?'续写新增集数':'改写后总集数'}</span><small>1–100 集</small></div><div class="ref-adaptation-presets">${[12,24,36,60].map(n=>`<button data-action="ref-adaptation-count:${n}" class="${a.episodes===n?'active':''}">${n} 集</button>`).join('')}</div><div class="ref-adaptation-counter"><span>自定义</span><button data-action="ref-adaptation-step:-1" aria-label="减少一集" ${a.episodes<=1?'disabled':''}>${I('minus')}</button><input type="number" min="1" max="100" aria-label="${a.mode==='continue'?'续写新增集数':'改写后总集数'}" value="${a.episodes}" data-ref-adaptation-count><span>集</span><button data-action="ref-adaptation-step:1" aria-label="增加一集" ${a.episodes>=100?'disabled':''}>${I('plus')}</button></div>`}</div>`}
function referenceDrawSettings(){
 const state=referenceSettingsPanel;if(!state)return;
 const existing=document.getElementById('ref-settings-panel');const panel=existing||document.createElement('section');panel.id='ref-settings-panel';panel.className='ref-settings-panel ref-settings-'+state.kind;panel.setAttribute('role','dialog');panel.setAttribute('aria-label',({genre:'题材设定',style:'风格库',ratio:'比例',episodes:'选择集数',adaptation:'改编设定'})[state.kind]);
 panel.innerHTML=({genre:referenceGenrePanel,style:referenceStylePanel,ratio:referenceRatioPanel,episodes:referenceEpisodePanel,adaptation:referenceAdaptationPanel})[state.kind]();
 if(!existing)document.body.append(panel);
 document.querySelector(`[data-ref-setting="${state.kind}"]`)?.setAttribute('aria-expanded','true');referencePositionSettings();
}
function referenceCommitOption(key,value){const context=referenceSettingsPanel;if(key==='style'&&context?.nodeId){const node=nodeById(context.nodeId),style=referenceSettingCatalog.style.find(item=>item.name===value);referenceCloseSettings(false);if(!node||context.project!==S.project||!style)return;referenceSaveNodeStyle(S,node.id,style);refreshCanvasCreation();save();document.querySelector('.canvas-style-trigger')?.focus({preventScroll:true});return;}referenceCloseSettings(false);S.referenceOptions[key]=value;render();save();document.querySelector(`[data-ref-setting="${key}"]`)?.focus({preventScroll:true})}
handleAction=function(action){
 const [key,...args]=action.split(':'),value=args.join(':');
 if(key==='ref-node-style'){const node=canvasCreationNode();if(node&&mediaKind(node)==='image')referenceOpenSettings('style',node.id);return}
 if(key==='ref-node-style-remove'){const node=canvasCreationNode();if(node){referenceSaveNodeStyle(S,node.id,null);refreshCanvasCreation();save();}return}
 if(key==='ref-open-setting'){referenceOpenSettings(value);return}
 if(key==='ref-close-setting'){referenceCloseSettings();return}
 if(key==='ref-genre-tab'){if(value==='blend'&&referenceSettingsPanel.main==='默认题材')return;referenceSettingsPanel.genreTab=value;referenceDrawSettings();return}
 if(key==='ref-genre-pick'){const name=referenceSettingCatalog.genre[Number(value)]?.name;if(!name)return;const p=referenceSettingsPanel;if(p.genreTab==='main'){p.main=name;if(name==='默认题材'||name===p.blend)p.blend=''}else p.blend=name;referenceDrawSettings();return}
 if(key==='ref-genre-clear-blend'){referenceSettingsPanel.blend='';referenceDrawSettings();return}
 if(key==='ref-genre-confirm'){const p=referenceSettingsPanel;S.referenceOptions.genreMain=p.main;S.referenceOptions.genreBlend=p.blend;referenceCommitOption('genre',p.main+(p.blend?' × '+p.blend:''));return}
 if(key==='ref-style-tab'||key==='ref-style-category'){referenceSettingsPanel[key==='ref-style-tab'?'styleTab':'category']=value;referenceSettingsPanel.styleLimit=20;referenceDrawSettings();return}
 if(key==='ref-style-favorite'){const name=referenceSettingCatalog.style[Number(value)]?.name;if(!name)return;S.referenceStyleFavorites=S.referenceStyleFavorites.includes(name)?S.referenceStyleFavorites.filter(n=>n!==name):[...S.referenceStyleFavorites,name];const scroll=document.querySelector('#ref-style-results').scrollTop;referenceDrawSettings();document.querySelector('#ref-style-results').scrollTop=scroll;save();return}
 if(key==='ref-style-pick'){const name=referenceSettingCatalog.style[Number(value)]?.name;if(!name)return;S.referenceStyleRecent=[name,...S.referenceStyleRecent.filter(n=>n!==name)].slice(0,20);referenceCommitOption('style',name);return}
 if(key==='ref-style-remove'){S.referenceOptions.style='风格';render();save();return}
 if(key==='ref-ratio-pick'){referenceCommitOption('ratio',value);return}
 if(key==='ref-episodes-pick'){if(S.referenceDrama==='produce'){const n=Number(value);if(value!=='auto'&&(!Number.isInteger(n)||n<1||n>100))return;referenceCloseSettings(false);S.referenceProductionEpisodes=value==='auto'?'默认·待分析':n+' 集';render();save();return}const n=Number(value);if(!Number.isInteger(n)||n<1||n>100)return;referenceCommitOption('episodes',n+' 集');return}
 if(key==='ref-adaptation-mode'){S.referenceAdaptation.mode=value;referenceDrawSettings();referenceUpdateAdaptationLabel();save();return}
 if(key==='ref-adaptation-count'||key==='ref-adaptation-step'){const n=key==='ref-adaptation-count'?Number(value):S.referenceAdaptation.episodes+Number(value);S.referenceAdaptation.episodes=Math.max(1,Math.min(100,n));referenceDrawSettings();referenceUpdateAdaptationLabel();save();return}
 if(key==='ref-start'){const reviewScript=S.referenceMode==='drama'&&['write','adapt','produce'].includes(S.referenceDrama);const spec={...S.referenceOptions,...(S.referenceDrama==='produce'?{episodes:S.referenceProductionEpisodes||'默认·待分析'}:{}),adaptation:structuredClone(S.referenceAdaptation),mode:S.referenceDrama};referenceCloseSettings(false);referenceSettingsAction(action);S.referenceCreationSpec=spec;const script=studioScriptNode();if(script)studioSeriesInitialize(script,parseInt(spec.episodes)||1);render();save();if(reviewScript&&script)openScriptWorkbench(script.id);return}
 if(referenceSettingsPanel&&key!=='ref-open-setting')referenceCloseSettings(false);
 referenceSettingsAction(action);
};
function referenceUpdateAdaptationLabel(){const a=S.referenceAdaptation,span=document.querySelector('[data-ref-setting="adaptation"] span');if(span)span.textContent='改编设定 · '+({rewrite:'改写',continue:'续写',overseas:'剧本出海'})[a.mode]+(a.mode==='overseas'?'':' · '+a.episodes+' 集')}
document.addEventListener('pointerdown',event=>{if(referenceSettingsPanel&&!event.target.closest('#ref-settings-panel,[data-ref-setting]'))referenceCloseSettings(false)},true);
document.addEventListener('keydown',event=>{if(referenceSettingsPanel&&event.key==='Escape'){referenceCloseSettings();event.preventDefault();event.stopImmediatePropagation()}},true);
document.addEventListener('input',event=>{
 if(event.target.matches('[data-ref-style-search]')){referenceSettingsPanel.query=event.target.value;referenceSettingsPanel.styleLimit=20;document.getElementById('ref-style-results').innerHTML=referenceStyleResults()}
 if(event.target.closest('#ref-custom-episodes'))document.querySelector('#ref-custom-episodes button').disabled=!event.target.value||!event.target.checkValidity();
 if(event.target.matches('[data-ref-adaptation-count]')){const n=Number(event.target.value);if(Number.isInteger(n)&&n>=1&&n<=100){S.referenceAdaptation.episodes=n;referenceUpdateAdaptationLabel();save()}}
});
document.addEventListener('submit',event=>{if(event.target.id==='ref-custom-episodes'){event.preventDefault();const input=event.target.querySelector('input');if(input.reportValidity()&&input.value)handleAction('ref-episodes-pick:'+input.value)}});
window.addEventListener('resize',referencePositionSettings);
document.addEventListener('scroll',event=>{if(referenceSettingsPanel&&!event.target.closest?.('#ref-settings-panel'))referencePositionSettings()},true);
const referenceSettingsHome=home;
home=function(){let html=referenceSettingsHome();if(S.referenceMode==='drama'&&S.referenceOptions.style&&S.referenceOptions.style!=='风格'){html=html.replace(/(<textarea id="idea-input"[\s\S]*?<\/textarea>)/,`<div class="ref-composer-writing"><div class="ref-selected-style"><span>${esc(S.referenceOptions.style)}</span>${iconBtn('移除风格','ref-style-remove','close')}</div>$1</div>`)}return html};
render();

document.addEventListener('scroll',event=>{const grid=event.target;if(!referenceSettingsPanel||grid.id!=='ref-style-results'||grid.scrollHeight-grid.scrollTop-grid.clientHeight>80)return;const old=referenceSettingsPanel.styleLimit;if(old>=referenceSettingCatalog.style.length)return;referenceSettingsPanel.styleLimit=old+20;const top=grid.scrollTop;grid.innerHTML=referenceStyleResults();grid.scrollTop=top},true);

document.addEventListener('keydown',event=>{
 if(!referenceSettingsPanel||event.key!=='Tab')return;
 const panel=document.getElementById('ref-settings-panel'),controls=[...panel.querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&el.getClientRects().length),index=controls.indexOf(document.activeElement);
 if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&(index===controls.length-1||index<0)){event.preventDefault();controls[0]?.focus();}
},true);
