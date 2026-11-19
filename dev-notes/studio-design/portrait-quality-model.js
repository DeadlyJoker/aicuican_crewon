/* Observed portrait-quality choices; execution snapshots contain parameters, not UI state. */
'use strict';
const portraitQualityGroups=[
 ['sceneLight','场景光氛',['清晨柔光','正午日光','黄昏暖光','夜间低照']],
 ['blend','人景融合',['边缘贴合','自然融合','人物突出','光色匹配']],
 ['faceLight','面部光感',['柔和过渡','自然均衡','轮廓立体','光影聚焦']],
 ['cleanup','瑕疵修饰',['轻度净肤','自然净肤','加强净肤','深度净肤']],
 ['skinTexture','皮肤质感',['柔和哑光','自然质感','细腻肌理','水润光泽']],
 ['skinTone','肤色调节',['肤色提亮','自然肤色','气色红润','冷暖平衡']],
 ['imageTexture','画面质感',['温和柔焦','标准清晰','清晰增强','锐利质感']],
];
/** Resolve an explicitly created preset, leaving older ordinary image drafts unchanged. */
function portraitQualityValues(draft){
 if(!draft)return null;
 return {enabled:draft.enabled!==false,...Object.fromEntries(portraitQualityGroups.map(([key,,choices],index)=>[key,draft[key]===undefined?(index?choices[1]:''):choices.includes(draft[key])?draft[key]:'']))};
}
/** Toggle one option without modifying another category or the caller's draft. */
function portraitQualityChoose(draft,key,value){
 const group=portraitQualityGroups.find(g=>g[0]===key);if(!group||!group[2].includes(value))return portraitQualityValues(draft);
 const current=portraitQualityValues(draft);return {...current,[key]:current[key]===value?'':value};
}
/** Capture selected parameters and user instructions independently of subsequent edits. */
function portraitQualityExecution(draft,instruction=''){
 const values=portraitQualityValues(draft);if(!values?.enabled)return null;
 const settings={qualityVersion:1,...Object.fromEntries(portraitQualityGroups.map(([key])=>[key,values[key]]))};
 const selected=portraitQualityGroups.filter(([key])=>values[key]).map(([key,label])=>label+'：'+values[key]);
 return {name:'人像质感调节',settings,prompt:['人像质感调节',...selected,instruction.trim()].filter(Boolean).join('\n')};
}
