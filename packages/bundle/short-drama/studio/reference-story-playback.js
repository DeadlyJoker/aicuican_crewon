/* Authored branching stories can be inspected without media generation or publication. */
'use strict';
let referenceStoryPlayback=null;
/** Resolve a story target without mistaking an intermediate choice for an ending. */
function referenceStoryStep(state,id){
 const node=state.nodes.find(item=>item.id===id);
 if(!node||!['choice','ending'].includes(node.kind))return {ok:false,error:'故事目标已不存在，请先检查选择连接'};
 if(node.kind==='choice'&&(!Array.isArray(node.options)||node.options.length<2))return {ok:false,error:'这个选择点至少需要两个选项'};
 return {ok:true,node,ending:node.kind==='ending'};
}
/** Only forward destinations that cannot return to this choice are offered. */
function referenceStoryTargets(state,sourceId){
 const returnsToSource=id=>{const queue=[id],seen=new Set();for(let index=0;index<queue.length;index++){const current=queue[index];if(current===sourceId)return true;if(seen.has(current))continue;seen.add(current);const node=state.nodes.find(item=>item.id===current);if(node?.kind==='choice')queue.push(...node.options.map(option=>option.target));}return false;};
 return state.nodes.filter(node=>['choice','ending'].includes(node.kind)&&node.id!==sourceId&&!returnsToSource(node.id));
}
/** Validate every edited destination before any node or connection is changed. */
function referenceValidateStoryChoice(state,id,options){
 if(options.length<2)return {ok:false,error:'至少保留两个选项'};
 const targets=new Set(referenceStoryTargets(state,id).map(node=>node.id));
 if(options.some(option=>!option.label.trim()))return {ok:false,error:'请填写每个选项的文字'};
 if(options.some(option=>!targets.has(option.target)))return {ok:false,error:'目标不存在或会形成循环，请重新选择'};
 return {ok:true};
}
choiceProperties=function(node){
 const targets=referenceStoryTargets(S,node.id);
 return `<h2 class="inspector-title">${esc(node.title)}</h2><p class="inspector-sub">选择点 · ${node.options.length} 条可编辑路径</p><label class="field">选择前的情节<textarea id="choice-text">${esc(node.text)}</textarea></label>${node.options.map((option,index)=>`<div class="choice-editor"><label class="field">选项 ${String.fromCharCode(65+index)}<input id="choice-label-${index}" value="${esc(option.label)}"></label><label class="field">进入情节<select id="choice-target-${index}">${targets.some(target=>target.id===option.target)?'':`<option value="" selected disabled>原目标不可用，请重新选择</option>`}${targets.map(target=>`<option value="${target.id}" ${option.target===target.id?'selected':''}>${target.kind==='choice'?'选择点':'结局'} · ${esc(target.title)}</option>`).join('')}</select></label></div>`).join('')}<p id="story-choice-error" role="alert" hidden></p><div class="inspector-buttons">${btn('保存故事结构','save-choice','outline','check')}${btn('试走故事','story-play','primary','play')}</div><p class="inspector-feedback">选择可以进入后续选择点或结局。保存后试走，循环目标不可选。</p>`;
};
saveStoryChoice=function(){
 const node=nodeById(S.selected);if(node?.kind!=='choice')return;
 const options=node.options.map((option,index)=>({label:document.getElementById('choice-label-'+index).value.trim(),target:document.getElementById('choice-target-'+index).value})),result=referenceValidateStoryChoice(S,node.id,options);
 if(!result.ok){const error=document.getElementById('story-choice-error');error.hidden=false;error.textContent=result.error;return;}
 const text=document.getElementById('choice-text').value;
 if(text===node.text&&JSON.stringify(options)===JSON.stringify(node.options)){toast('故事结构没有变化');return;}
 const before=referenceCaptureNodeGraph(S);node.text=text;node.options=options;S.edges=S.edges.filter(([from])=>from!==node.id).concat([...new Set(options.map(option=>option.target))].map(target=>[node.id,target]));
 studioRecordCanvasHistory(referenceNodeGraphPatch(before,referenceCaptureNodeGraph(S)));S.revision++;render();save();toast('故事结构已保存');
};
function referenceShowStoryPlayback(){
 const state=referenceStoryPlayback;if(!state||state.project!==S.project)return;
 const step=referenceStoryStep(S,state.path.at(-1));if(!step.ok){toast(step.error);return;}
 const node=step.node,scene=S.nodes.find(item=>item.kind==='image'),frame=step.ending?node.frame:scene?.frame;
 showDialog(step.ending?'故事试走 · '+node.label:'故事试走',`${frame!=null?`<div class="preview-screen"><div class="preview-picture still frame${frame}"></div><span class="preview-corner">静态故事示意</span></div>`:''}<h3 class="story-preview-title">${esc(node.title)}</h3><p>${esc(step.ending?node.description:node.text)}</p>${step.ending?'':`<div class="story-play-options">${node.options.map(option=>btn(esc(option.label),'story-play:'+option.target,'outline','arrow')).join('')}</div>`}<p class="preview-note">只试走已保存的叙事路径，不播放生成视频，不发布作品。</p>`,`<button class="button outline" data-action="story-play-back" ${state.path.length<2?'disabled':''}>上一步</button>${btn('重新开始','story-play-restart','outline')}${btn('回到画布','close-modal','primary')}`,true);
}
playStory=function(target){
 if(!target){
  const selected=nodeById(S.selected),start=selected?.kind==='choice'?selected:S.nodes.find(node=>node.kind==='choice');if(!start){toast('当前没有可试走的选择点');return;}
  referenceStoryPlayback={project:S.project,startId:start.id,path:[start.id]};
 }else{
  const state=referenceStoryPlayback;if(!state||state.project!==S.project){toast('请从故事选择点重新开始试走');return;}
  const current=nodeById(state.path.at(-1));if(current?.kind!=='choice'||!current.options.some(option=>option.target===target)){toast('这条路径已变化，请重新开始');return;}
  const next=referenceStoryStep(S,target);if(!next.ok){toast(next.error);return;}
  if(state.path.includes(target)){toast('这条故事路径形成循环，请先修改连接');return;}state.path.push(target);
 }
 referenceShowStoryPlayback();
};
const referenceStoryAction=handleAction;
handleAction=function(action){
 if(action==='story-play-back'||action==='story-play-restart'){
  const state=referenceStoryPlayback;if(!state||state.project!==S.project)return;
  if(action==='story-play-back'){if(state.path.length>1)state.path.pop();}else state.path=[state.startId];referenceShowStoryPlayback();return;
 }
 referenceStoryAction(action);
};

if(S.screen==='canvas'&&nodeById(S.selected)?.kind==='choice')render();
