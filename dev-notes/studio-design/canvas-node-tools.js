/* Node-specific media tools are interactive previews; they do not process media. */
'use strict';
let canvasActiveTool=null;
const canvasToolNames={lighting:'打光',angle:'角度',person:'人物调节',elements:'编辑元素',storyboard:'分镜大师'};
const canvasToolDefaults={elements:{mode:'默认'},storyboard:{preset:'剧情推演四宫格'},lighting:{view:'perspective',direction:'前方',azimuth:0,elevation:0,intensity:30,color:'#ffffff'},angle:{rotation:0,tilt:0,scale:100},person:{tab:'情绪',emotion:'自然',gaze:'正前方',mouth:'自然',strength:50}};
function canvasToolValues(n,type){const values={...canvasToolDefaults[type],...n.creationPreferences?.toolDrafts?.[type],...S.nodeDrafts[n.id]?.toolDrafts?.[type]};if(type==='storyboard'&&values.preset==='25 宫格分镜')values.preset='25宫格连贯分镜';return values;}
function storeCanvasToolValue(n,type,key,value){const d=S.nodeDrafts[n.id]??={};d.toolDrafts??={};d.toolDrafts[type]??={};d.toolDrafts[type][key]=value;save();}
function canvasToolRange(label,key,min,max,value,unit){return `<label class="tool-range"><span>${label}<output data-tool-output="${key}">${value}${unit}</output></span><input type="range" aria-label="${label}" data-tool-value="${key}" data-unit="${unit}" min="${min}" max="${max}" value="${value}"></label>`;}
/** Project the reference controls without rewriting older signed angles or percent zoom. */
function canvasAngleView(values){return {rotation:values.rotation>=0&&values.rotation<=360?values.rotation:((values.rotation%360)+360)%360,tilt:values.tilt,zoom:values.scale/20};}
/** Keep keyboard and drag changes in the same camera ranges as the visible controls. */
function canvasAngleAdjustment(values,rotationDelta,tiltDelta){const view=canvasAngleView(values);return {rotation:((view.rotation+rotationDelta)%360+360)%360,tilt:Math.max(-30,Math.min(60,view.tilt+tiltDelta))};}
function canvasAngleRange(label,key,min,max,value,unit,step=1){return `<label class="angle-control-row"><span>${label}</span><input type="range" aria-label="${label}" data-tool-value="${key}" data-unit="${unit}" ${key==='scale'?'data-tool-factor="20"':''} min="${min}" max="${max}" step="${step}" value="${value}"><output data-tool-output="${key}">${key==='scale'?Number(value).toFixed(1):value}${unit}</output></label>`;}
function canvasToolChoices(n,type,key,values){const d=canvasToolValues(n,type);return `<div class="tool-choice-grid">${values.map(value=>`<button class="button ghost ${d[key]===value?'active':''}" data-action="canvas-tool-choice:${key}:${value}" aria-pressed="${d[key]===value}">${value}</button>`).join('')}</div>`;}
const canvasElementModes=['默认','Dola-Seedream-5.0-Pro-图层拆分'];
const canvasStoryboardPresets={...Object.fromEntries(referenceStoryboardChoices().map(label=>[label,'当前选择：'+label])), '多机位九宫格':'同一场景，探索九个机位','剧情推演四宫格':'四幅连续画面，推演情节变化','25宫格连贯分镜':'二十五幅画面，规划连续分镜'};
function canvasCompactToolHtml(n,type){
 const d=canvasToolValues(n,type),story=type==='storyboard';
 const setting=story?`<select aria-label="创作方式" data-tool-value="preset">${referenceStoryboardOptions(d.preset)}</select>`:`<select class="compact-tool-mode" aria-label="图层拆分模型" data-tool-value="mode" title="${esc(d.mode)}">${canvasElementModes.map(mode=>`<option value="${esc(mode)}" ${d.mode===mode?'selected':''}>${esc(mode)}</option>`).join('')}</select>`;
 const description=story?canvasStoryboardPresets[d.preset]:'分层抠图并修复背景';
 return `<section class="canvas-creation compact-tool-panel" aria-label="${canvasToolNames[type]}面板" data-creation-node="${n.id}">${iconBtn('关闭工具，返回提示词','canvas-tool-close','close')}<span class="compact-tool-name">${canvasToolNames[type]}</span>${setting}<span class="compact-tool-description">${description}</span><span class="compact-tool-demo">示例</span><button class="creation-submit" aria-label="生成示例候选" data-action="canvas-creation-submit">${I('arrowup')}</button></section>`;
}
function canvasNodeToolHtml(n){
 const type=canvasActiveTool.type;if(type==='elements'||type==='storyboard')return canvasCompactToolHtml(n,type);
 const d=canvasToolValues(n,type),adopted=studioAdoptedCandidate(n),frame=adopted?.frame??n.frame??0;
 const photo=`<div class="tool-photo still frame${frame}"></div>`;
 let preview='',controls='';
 if(type==='lighting'){
  preview=`<div class="lighting-view-toggle" role="group" aria-label="打光预览视图">${[['perspective','透视'],['front','正面']].map(([view,label])=>`<button aria-pressed="${d.view===view}" data-action="canvas-tool-choice:view:${view}">${label}</button>`).join('')}</div><div class="lighting-preview" data-light-view="${d.view}"><div class="lighting-sphere"><span class="lighting-equator"></span><span class="lighting-meridian"></span>${photo}<div class="lighting-glow"></div><span class="light-position"></span></div><span class="tool-preview-caption">布光位置示意</span></div>`;
  controls=`<span class="tool-field-title">主光源</span>${canvasToolChoices(n,type,'direction',['左侧','顶部','右侧','前方','底部','后方'])}<span class="tool-field-title lighting-global">全局</span>${canvasToolRange('水平环绕','azimuth',0,360,(d.azimuth+360)%360,'°')}${canvasToolRange('高度','elevation',-90,90,d.elevation,'°')}${canvasToolRange('强度','intensity',0,100,d.intensity,'%')}<label class="tool-color"><span>灯光颜色</span><span class="tool-color-picker" style="--tool-color:${esc(d.color)}"><i aria-hidden="true"></i><span aria-hidden="true">HEX</span><output data-tool-output="color">${d.color.toUpperCase()}</output><input type="color" aria-label="灯光颜色" data-tool-value="color" value="${d.color}"></span></label>`;
 }else if(type==='angle'){
  const view=canvasAngleView(d);
  preview=`<div class="angle-preview" tabindex="0" role="slider" aria-label="拖动调整角度" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${view.rotation}"><div class="angle-cube">${['front','back','left','right','top','bottom'].map((face,index)=>`<span class="angle-cube-face face-${face}">${index===0?I('image'):['F','B','L','R','U','D'][index]}</span>`).join('')}</div></div><div class="angle-reset">${btn('重置','canvas-tool-reset','ghost','rotate')}</div>`;
  controls=`${canvasAngleRange('旋转','rotation',0,360,view.rotation,'°')}${canvasAngleRange('倾斜','tilt',Math.min(-30,view.tilt),60,view.tilt,'°')}${canvasAngleRange('缩放','scale',0,10,view.zoom,'',.1)}<div class="angle-execute"><small>方块示意 · 不计费</small><button class="creation-submit" aria-label="生成示例候选" data-action="canvas-creation-submit">${I('arrowup')}</button></div>`;
 }else{
  const key=({情绪:'emotion',视线:'gaze',嘴巴:'mouth'})[d.tab],choices=({情绪:['自然','开心','难过','惊讶','思考','严肃'],视线:['正前方','向左','向右','向上','向下'],嘴巴:['自然','闭合','微笑','张开']})[d.tab];
  preview=`<div class="person-preview">${photo}<span class="person-preview-marker">${esc(d.emotion)} · ${esc(d.gaze)} · ${esc(d.mouth)}</span><span class="tool-preview-caption">原图参考 · 未生成表情</span></div>`;
  controls=`<div class="tool-person-tabs" role="tablist" aria-label="人物调节分类">${['情绪','视线','嘴巴'].map(tab=>`<button role="tab" aria-selected="${tab===d.tab}" data-action="canvas-tool-choice:tab:${tab}">${tab}</button>`).join('')}</div><span class="tool-field-title">${d.tab==='情绪'?'情绪表达':d.tab==='视线'?'视线方向':'嘴巴形态'}</span>${canvasToolChoices(n,type,key,choices)}${canvasToolRange('调节强度','strength',0,100,d.strength,'%')}<p class="tool-help">保留身份、服装和背景；此处仅选择调节参数</p>`;
 }
 if(type==='angle')return `<section class="canvas-creation node-tool-panel ref-angle-panel" aria-label="角度面板" data-creation-node="${n.id}"><header class="node-tool-header"><strong>拖拽方块调整角度</strong>${iconBtn('关闭工具，返回提示词','canvas-tool-close','close')}</header><div class="node-tool-body"><div class="tool-preview">${preview}</div><div class="node-tool-controls">${controls}</div></div></section>`;
 if(type==='lighting')return `<section class="canvas-creation node-tool-panel ref-lighting-panel" aria-label="打光面板" data-creation-node="${n.id}">${iconBtn('关闭工具，返回提示词','canvas-tool-close','close')}<div class="node-tool-body"><div class="tool-preview">${preview}<div class="lighting-reset">${btn('重置','canvas-tool-reset','ghost','rotate')}</div></div><div class="node-tool-controls">${controls}<div class="lighting-execute"><small>交互示意 · 不计费</small><button class="creation-submit" aria-label="生成示例候选" data-action="canvas-creation-submit">${I('arrowup')}</button></div></div></div></section>`;
 return `<section class="canvas-creation node-tool-panel" aria-label="${canvasToolNames[type]}面板" data-creation-node="${n.id}"><header class="node-tool-header"><div><strong>${canvasToolNames[type]}</strong><span>${esc(n.title)}</span></div>${iconBtn('关闭工具，返回提示词','canvas-tool-close','close')}</header><div class="node-tool-body"><div class="tool-preview">${preview}</div><div class="node-tool-controls">${controls}</div></div><footer class="node-tool-footer">${btn('重置','canvas-tool-reset','ghost','rotate')}<span>交互示意 · 不处理原图</span>${btn('生成示例候选','canvas-creation-submit','primary','spark')}</footer></section>`;
}
function syncCanvasToolPreview(){
 const n=canvasCreationNode(),panel=document.querySelector('.canvas-creation');if(!n||!panel||canvasActiveTool?.nodeId!==n.id)return;
 const type=canvasActiveTool.type,d=canvasToolValues(n,type);
 document.querySelectorAll('[data-action^="canvas-tool-open:"]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.action==='canvas-tool-open:'+type?'true':'false'));
 if(type==='lighting'){
  const x=50+Math.sin(d.azimuth*Math.PI/180)*42,y=50-d.elevation/90*42;
  panel.style.setProperty('--light-x',x+'%');panel.style.setProperty('--light-y',y+'%');panel.style.setProperty('--light-color',d.color);panel.style.setProperty('--light-strength',d.intensity/100);
 }else if(type==='angle'){
  panel.querySelector('.angle-cube').style.transform=`rotateX(${-d.tilt}deg) rotateY(${d.rotation}deg) scale(${d.scale/100})`;
  panel.querySelector('.angle-preview').setAttribute('aria-valuenow',canvasAngleView(d).rotation);
 }
 panel.querySelector('.tool-color-picker')?.style.setProperty('--tool-color',d.color);
 panel.querySelectorAll('[data-tool-output]').forEach(el=>{const key=el.dataset.toolOutput;el.textContent=key==='color'?d.color.toUpperCase():(type==='angle'?(key==='scale'?canvasAngleView(d).zoom.toFixed(1):canvasAngleView(d)[key]):type==='lighting'&&key==='azimuth'?(d[key]+360)%360:d[key])+(panel.querySelector(`[data-tool-value="${key}"]`)?.dataset.unit||'');});
}
function canvasToolExecution(n){
 const type=canvasActiveTool.type,settings=structuredClone(canvasToolValues(n,type));
 const description=type==='elements'?'分层抠图并修复背景':type==='storyboard'?settings.preset:type==='lighting'?`主光源${settings.direction}，水平${settings.azimuth}°，高度${settings.elevation}°，强度${settings.intensity}%，颜色${settings.color}`:type==='angle'?`旋转${settings.rotation}°，倾斜${settings.tilt}°，缩放${settings.scale}%`:`情绪${settings.emotion}，视线${settings.gaze}，嘴巴${settings.mouth}，强度${settings.strength}%`;
 return {name:canvasToolNames[type],settings,prompt:`${canvasToolNames[type]} · ${n.title}：${description}。保留当前画面的其他内容。`};
}
function handleCanvasNodeToolAction(action){
 const [key,...parts]=action.split(':');if(!key.startsWith('canvas-tool-'))return false;
 const n=canvasCreationNode();if(!n)return true;
 if(key==='canvas-tool-open'){
  const type=parts[0];if(!Object.hasOwn(canvasToolDefaults,type))return true;
  if(canvasActiveTool?.nodeId===n.id&&canvasActiveTool.type===type){canvasActiveTool=null;refreshCanvasCreation();document.getElementById('canvas-creation-prompt')?.focus({preventScroll:true});return true;}
  canvasActiveTool={nodeId:n.id,type};document.querySelectorAll('.canvas-tool-menu[open]').forEach(el=>el.open=false);refreshCanvasCreation();frameCanvasNodeControls();document.querySelector('[data-action="canvas-tool-close"]')?.focus({preventScroll:true});
 }else if(key==='canvas-tool-close'){canvasActiveTool=null;refreshCanvasCreation();document.getElementById('canvas-creation-prompt')?.focus({preventScroll:true});}
 else if(canvasActiveTool?.nodeId===n.id){
  const type=canvasActiveTool.type;
  if(key==='canvas-tool-reset'){const d=S.nodeDrafts[n.id]??={};d.toolDrafts??={};d.toolDrafts[type]={...canvasToolDefaults[type]};save();refreshCanvasCreation();}
  if(key==='canvas-tool-choice'){
   const [field,value]=parts;storeCanvasToolValue(n,type,field,value);
   if(type==='lighting'&&field==='direction'){const mapping={左侧:[-90,0],右侧:[90,0],顶部:[0,70],底部:[0,-70],前方:[0,0],后方:[180,0]};const [azimuth,elevation]=mapping[value];storeCanvasToolValue(n,type,'azimuth',azimuth);storeCanvasToolValue(n,type,'elevation',elevation);}
   refreshCanvasCreation();
  }
 }
 return true;
}
document.addEventListener('input',event=>{
 if(!event.target.dataset.toolValue)return;const n=canvasCreationNode();if(!n||canvasActiveTool?.nodeId!==n.id)return;
 if(event.target.dataset.toolValue==='mode')event.target.title=event.target.value;
 storeCanvasToolValue(n,canvasActiveTool.type,event.target.dataset.toolValue,['color','select-one'].includes(event.target.type)?event.target.value:Number(event.target.value)*Number(event.target.dataset.toolFactor||1));if(canvasActiveTool.type==='storyboard')document.querySelector('.compact-tool-description').textContent=canvasStoryboardPresets[event.target.value];else syncCanvasToolPreview();
});
let canvasAngleDrag=null;
document.addEventListener('pointerdown',event=>{
 const plane=event.target.closest('.angle-preview');if(!plane||event.button!==0)return;
 const n=canvasCreationNode(),d=canvasToolValues(n,'angle');canvasAngleDrag={nodeId:n.id,x:event.clientX,y:event.clientY,rotation:d.rotation,tilt:d.tilt,scale:d.scale};plane.setPointerCapture(event.pointerId);event.preventDefault();
});
document.addEventListener('pointermove',event=>{
 if(!canvasAngleDrag)return;const n=canvasCreationNode();if(n?.id!==canvasAngleDrag.nodeId){canvasAngleDrag=null;return;}
 const adjusted=canvasAngleAdjustment(canvasAngleDrag,Math.round((event.clientX-canvasAngleDrag.x)*.7),Math.round(-(event.clientY-canvasAngleDrag.y)*.5)),{rotation,tilt}=adjusted;
 storeCanvasToolValue(n,'angle','rotation',rotation);storeCanvasToolValue(n,'angle','tilt',tilt);document.querySelectorAll('[data-tool-value]').forEach(el=>{if(el.dataset.toolValue==='rotation')el.value=rotation;if(el.dataset.toolValue==='tilt')el.value=tilt;});syncCanvasToolPreview();
});
document.addEventListener('pointerup',()=>{canvasAngleDrag=null;});
document.addEventListener('pointercancel',()=>{canvasAngleDrag=null;});
document.addEventListener('lostpointercapture',()=>{canvasAngleDrag=null;});
document.addEventListener('keydown',event=>{
 if(!event.target.matches('.angle-preview')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
 const n=canvasCreationNode(),d=canvasToolValues(n,'angle'),key=['ArrowLeft','ArrowRight'].includes(event.key)?'rotation':'tilt',step=['ArrowLeft','ArrowDown'].includes(event.key)?-5:5;
 storeCanvasToolValue(n,'angle',key,canvasAngleAdjustment(d,key==='rotation'?step:0,key==='tilt'?step:0)[key]);const input=document.querySelector(`[data-tool-value="${key}"]`);input.value=canvasToolValues(n,'angle')[key];syncCanvasToolPreview();event.preventDefault();
});
