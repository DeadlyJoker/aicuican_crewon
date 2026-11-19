/* Reference canvas presentation retains the existing node and candidate owners. */
'use strict';
const referenceBaseNodeHtml=nodeHtml;
/** Render image assets with a floating name and one compact footer. */
nodeHtml=function(value){
 if(value.kind==='story'){
  const n=nodeDisplay(value),selected=S.selected===n.id;
  return `<article class="node ref-script-node ${selected?'selected':''}" tabindex="0" data-node="${n.id}" aria-label="故事与剧本 · ${esc(n.title)}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px"><header data-drag="${n.id}"><strong>剧本</strong></header>${scriptNodeBody(n)}<button class="port in" data-port-in="${n.id}" aria-label="连接到${esc(n.title)}"></button><button class="port out" data-port-out="${n.id}" aria-label="从${esc(n.title)}开始连线"></button></article>`;
 }
 if(['video','voice','audio'].includes(value.kind)&&value.referenceOnly){
  const n=nodeDisplay(value),sound=n.kind!=='video',glyph=sound?'audio-media':'video-media';
  return `<article class="node ref-media-node ref-empty-media ${sound?'ref-empty-audio':'ref-empty-video'} ${S.selected===n.id?'selected':''}" tabindex="0" data-node="${n.id}" aria-label="${esc((sound?'音频':'视频')+' · '+n.title)}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px"><header class="ref-node-name" data-drag="${n.id}">${I(glyph)}<span>${esc(n.title)}</span></header><div class="ref-empty-media-body">${I(glyph)}${sound?'':'<span>选中节点后在下方配置并生成</span>'}</div>${canvasNodeReferenceShortcuts(n)}<button class="port in" data-port-in="${n.id}" aria-label="连接到${esc(n.title)}"></button><button class="port out ${connecting===n.id?'connecting':''}" data-port-out="${n.id}" aria-label="从${esc(n.title)}开始连线"></button></article>`;
 }
 if(!['character','scene','image'].includes(value.kind))return referenceBaseNodeHtml(value);
 const n=nodeDisplay(value),selected=S.selected===n.id;
 const users=S.edges.filter(([from,to])=>from===n.id&&['shot','video'].includes(nodeById(to)?.kind)).map(([,to])=>nodeById(to));
 const shots=users.length?users.map(item=>S.clips.includes(item.id)?String(S.clips.indexOf(item.id)+1).padStart(2,'0'):item.title).join('、'):'—';
 const derived=n.derivedOperation==='portrait-quality';
 const preview=n.referenceOnly?`<div class="node-media pending-media">${I(kindIcon[n.kind]||'image')}<span>${derived?'选中节点后在下方配置并生成':'尚未制作'}</span></div>`:`<div class="node-media still frame${Number(n.frame)||0}" role="img" aria-label="${esc(n.title)}"></div>`;
 const versions=ensureCandidateHistory(n);
 return `<article class="node ref-media-node ${derived?'portrait-quality-node '+(n.referenceOnly?'quality-empty':''):''} ${selected?'selected':''}" tabindex="0" data-node="${n.id}" aria-label="${esc(n.label+' · '+n.title)}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px"><header class="ref-node-name" data-drag="${n.id}">${esc(n.title)}</header>${preview}${derived?'':`<footer class="ref-node-footer"><div class="ref-node-caption"><strong>${esc(n.title)}</strong><small title="${esc('分镜：'+shots)}">分镜：${esc(shots)}</small></div><div class="ref-node-actions">${versions.length?iconBtn('查看版本','versions:'+n.id,'history'):''}${iconBtn('编辑','edit-node:'+n.id,'settings')}</div></footer>`}${canvasNodeReferenceShortcuts(n)}<button class="port in" data-port-in="${n.id}" aria-label="连接到${esc(n.title)}"></button><button class="port out ${connecting===n.id?'connecting':''}" data-port-out="${n.id}" aria-label="从${esc(n.title)}开始连线"></button></article>`;
};
window.addEventListener('resize',()=>{if(canvasCreationNode())frameCanvasNodeControls();});
render();

/** A fresh demo follows the reference's left-to-right asset groups without moving any saved project. */
function referenceArrangeNewDrama(){
 if(S.projectKind!=='drama')return;
 const script=studioScriptNode();if(script)Object.assign(script,{x:80,y:160,w:420,h:280});
 let column=600;
 const groups=[S.nodes.filter(n=>n.kind==='character'),S.nodes.filter(n=>n.kind==='scene'),S.nodes.filter(n=>n.assetCategory==='prop'),S.nodes.filter(n=>['shot','video'].includes(n.kind)),S.nodes.filter(n=>n.kind==='final')];
 for(const nodes of groups){
  if(!nodes.length)continue;
  const columns=Math.min(nodes.length>4?3:2,nodes.length);
  nodes.forEach((n,i)=>Object.assign(n,{x:column+(i%columns)*460,y:160+Math.floor(i/columns)*560,w:380,h:['character','scene','image'].includes(n.kind)?436:380}));
  column+=columns*460+80;
 }
 S.layoutBase=S.nodes.map(n=>({id:n.id,x:n.x,y:n.y}));
}
