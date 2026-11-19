/* Appearance choices are node-local inputs, independent of reusable character definitions. */
'use strict';
const appearanceChoices={
 age:[['幼年','child','character-child-cutout-v2.webp'],['青年','young','character-cutout.webp'],['老年','older','character-older-cutout.webp']],
 skin:[['自然肤色','natural'],['小麦色','wheat'],['冷白皮','cool-white']],
 hair:[['光头','bald'],['小平头','crew-cut'],['波波头','bob'],['马尾辫','ponytail'],['长发','long-hair'],['微分碎盖','textured-crop'],['法式卷发','french-curl'],['双马尾','twin-tails']],
 body:[['纤瘦','slim','body-young-natural-crew-cut-slim-cutout.webp'],['正常','normal','body-young-natural-crew-cut-normal-cutout.webp'],['肥胖','heavy','body-young-natural-crew-cut-heavy-cutout.webp']]
};
const appearanceLabels={age:'年龄',skin:'肤色',hair:'发型',body:'体态'};
/** Normalize saved choices without rewriting the source draft. */
function appearanceValues(values={}){const d={protectStyle:true,protectBackground:true,expanded:'hair',...values};for(const key of Object.keys(appearanceChoices))if(!appearanceChoices[key].some(([label])=>label===d[key]))d[key]='';return d;}
/** Persist only requested appearance edits, excluding accordion state. */
function appearanceSnapshot(values){const d=appearanceValues(values);return {appearanceVersion:1,age:d.age,skin:d.skin,hair:d.hair,body:d.body,protectStyle:d.protectStyle,protectBackground:d.protectBackground};}
function appearanceChanged(values){const d=appearanceValues(values);return Object.keys(appearanceChoices).some(key=>d[key]);}
/** Resolve the observed preview for the effective choices; unselected fields keep reference defaults. */
function appearancePreview(values){
 const d=appearanceValues(values),key=[d.age||'青年',d.skin||'自然肤色',d.hair||'小平头',d.body].join('|');
 const file=appearancePreviewCatalog[key];if(!file)throw new Error('Missing observed appearance preview: '+key);
 return {file};
}
