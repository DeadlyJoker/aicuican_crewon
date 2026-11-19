/* Face controls project legacy inputs into independent local editing drafts. */
'use strict';
const faceControlTabs={情绪:'情绪控制',视线:'视线方向',嘴巴:'嘴巴形态'};
const faceGazeChoices=[['左上','up-left'],['上方','up'],['右上','up-right'],['左侧','left'],['正视','center'],['右侧','right'],['左下','down-left'],['下方','down'],['右下','down-right']];
const faceMouthChoices=[['单侧嗤笑','side-smile'],['大笑','laugh'],['嘟嘴','purse'],['歪嘴','pout'],['微笑','smile'],['瘪嘴','flat'],['咬嘴唇','bite'],['张嘴','open'],['嘴角下垂','down']];
const faceEmotionPresets=[['激动委屈',-.65,.8],['想笑却忍住',.5,.1],['委屈瘪嘴',-.65,-.5],['开心',1,0],['亢奋',.7,1],['低落',0,-1],['难过',-1,0],['平静',0,0],['惊讶',.2,.8],['沉思',-.3,-.4],['释然',.6,-.2],['紧张',-.4,.65]];
function faceControlValues(values){
 const points=({开心:[1,0],难过:[-1,0],惊讶:[.2,.8],思考:[-.3,-.4],严肃:[-.3,.4]})[values.emotion]||[0,0];
 return {...values,emotionX:values.emotionX??points[0],emotionY:values.emotionY??points[1],gaze:({'正前方':'正视','向左':'左侧','向右':'右侧','向上':'上方','向下':'下方'})[values.gaze]||values.gaze||'正视',mouth:({'自然':'微笑','闭合':'瘪嘴','张开':'张嘴'})[values.mouth]||values.mouth||'微笑',protectStyle:values.protectStyle!==false,protectBackground:values.protectBackground!==false};
}
function faceEmotionPoint(x,y){return {emotionX:Math.max(-1,Math.min(1,x)),emotionY:Math.max(-1,Math.min(1,y))};}
function faceEmotionName(x,y){if(Math.abs(x)+Math.abs(y)<.15)return '平静';const preset=faceEmotionPresets.find(([,px,py])=>px===x&&py===y);if(preset)return preset[0];return Math.abs(x)>=Math.abs(y)?(x>0?'开心':'难过'):(y>0?'亢奋':'低落');}
/** Blend adjacent observed study frames; no original media is transformed. */
function faceEmotionLayers(x,y){
 const point=faceEmotionPoint(x,y),gx=Math.abs(point.emotionX)*2,gy=Math.abs(point.emotionY)*2,x0=Math.floor(gx),y0=Math.floor(gy),dx=gx-x0,dy=gy-y0;
 const quadrant=(x<0?'sad':'happy')+'-'+(y<0?'low':'excited'),weights=new Map();
 for(const [ix,iy,w] of [[x0,y0,(1-dx)*(1-dy)],[Math.min(2,x0+1),y0,dx*(1-dy)],[x0,Math.min(2,y0+1),(1-dx)*dy],[Math.min(2,x0+1),Math.min(2,y0+1),dx*dy]]){
  if(w<=0)continue;const file=ix===0&&iy===0?'neutral.png':quadrant+'-source-'+(1+iy*3+ix)+'.png';weights.set(file,(weights.get(file)||0)+w);
 }
 return [...weights].map(([file,weight])=>({file,weight}));
}
/** Candidate input excludes local undo and temporary comparison state. */
function faceControlSnapshot(values){const d=faceControlValues(values);return {faceVersion:1,emotionX:d.emotionX,emotionY:d.emotionY,emotion:faceEmotionName(d.emotionX,d.emotionY),gaze:d.gaze,mouth:d.mouth,strength:d.strength,protectStyle:d.protectStyle,protectBackground:d.protectBackground};}
function faceControlChanged(values){const d=faceControlValues(values);return Math.abs(d.emotionX)+Math.abs(d.emotionY)>.01||d.gaze!=='正视'||d.mouth!=='微笑';}

/** Undo is scoped to one control category; other requested edits stay intact. */
function faceCategorySnapshot(values,tab){const d=faceControlValues(values);return tab==='视线'?{gaze:d.gaze}:tab==='嘴巴'?{mouth:d.mouth}:{emotionX:d.emotionX,emotionY:d.emotionY,emotion:d.emotion};}
function faceUndoStack(values,tab='情绪'){return values.faceHistory?.[tab]||(tab==='情绪'&&Array.isArray(values.faceUndo)?values.faceUndo.map(entry=>faceCategorySnapshot(entry,'情绪')):[]);}
