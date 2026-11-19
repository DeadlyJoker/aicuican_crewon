/* Visible rhTV menu choices; execution remains the Demo's existing candidate simulation. */
'use strict';
const referenceStoryboardMenuItems=[
 {label:'多机位九宫格',icon:'grid'},
 {label:'剧情推演四宫格',icon:'grid'},
 {label:'25宫格连贯分镜',icon:'grid'},
 {label:'电影级光影校正',icon:'sun',children:['主光','辅光','逆光/轮廓光','发丝光','侧光','边缘光','顶光','底光','眼神光','明暗对比法','伦勃朗布光','蝴蝶光','环形光','二分光','高调光','平光']},
 {label:'角色三视图生成',icon:'user'},
 {label:'画面推演 - 3秒后',icon:'history'},
 {label:'画面推演 - 5秒前',icon:'history'},
 {label:'运镜控制',icon:'camera-control',children:['推镜头','拉镜头','摇镜头','移镜头','跟镜头','固定镜头','环拍镜头','弧线运动镜头']},
 {label:'情绪重塑',icon:'user',children:['生气','微笑','思考','疑惑','吓到','偷窥','邪恶','哭泣']},
 {label:'深度视差（空间维补）',icon:'image'},
 {label:'动态场效（意境增强）',icon:'spark',children:['雨天','雪天','沙尘','丁达尔效应','余烬','荧光浮游生物效果']},
];
/** Keep group names in stored selections so future duplicate leaf names remain distinct. */
function referenceStoryboardChoice(group,label){return group.children?group.label+' · '+label:label;}
function referenceStoryboardChoices(){return referenceStoryboardMenuItems.flatMap(group=>group.children?group.children.map(label=>referenceStoryboardChoice(group,label)):[group.label]);}
function referenceStoryboardOptions(selected){return referenceStoryboardMenuItems.map(group=>{
 const option=label=>{const value=referenceStoryboardChoice(group,label);return `<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;};
 return group.children?`<optgroup label="${esc(group.label)}">${group.children.map(option).join('')}</optgroup>`:option(group.label);
}).join('');}
function referenceStoryboardMenuHtml(){return `<details class="canvas-tool-menu reference-storyboard-menu"><summary role="button" aria-label="分镜大师">${I('film')}分镜大师${I('down')}</summary><div role="menu" aria-label="分镜大师">${referenceStoryboardMenuItems.map((group,index)=>`<button class="button ghost" role="menuitem" ${group.children?`data-storyboard-group="${index}" aria-haspopup="menu" aria-expanded="false"`:`data-action="canvas-creation-tool:${esc(group.label)}"`}>${I(group.icon)}<span>${esc(group.label)}</span>${group.children?I('chev'):''}</button>`).join('')}</div></details>`;}
