/* Pose coordinates are independent of the canvas camera and copied into candidates. */
'use strict';
const poseDefaults={head:[260,25],neck:[260,45],chest:[260,76],hip:[260,106],leftShoulder:[237,52],rightShoulder:[283,52],leftElbow:[219,84],rightElbow:[301,84],leftWrist:[208,116],rightWrist:[312,116],leftHip:[249,110],rightHip:[271,110],leftKnee:[244,149],rightKnee:[276,149],leftAnkle:[242,194],rightAnkle:[278,194]};
const poseParents={head:'neck',neck:'chest',chest:'hip',leftShoulder:'neck',rightShoulder:'neck',leftElbow:'leftShoulder',rightElbow:'rightShoulder',leftWrist:'leftElbow',rightWrist:'rightElbow',leftHip:'hip',rightHip:'hip',leftKnee:'leftHip',rightKnee:'rightHip',leftAnkle:'leftKnee',rightAnkle:'rightKnee'};
const poseLabels={head:'头部',neck:'颈部',chest:'胸部',hip:'骨盆',leftShoulder:'左肩',rightShoulder:'右肩',leftElbow:'左肘',rightElbow:'右肘',leftWrist:'左腕',rightWrist:'右腕',leftHip:'左髋',rightHip:'右髋',leftKnee:'左膝',rightKnee:'右膝',leftAnkle:'左踝',rightAnkle:'右踝'};
function poseValues(raw={}){const joints={};for(const [key,point]of Object.entries(poseDefaults)){const saved=raw.joints?.[key];joints[key]=Array.isArray(saved)&&saved.length===2&&saved.every(Number.isFinite)?saved.slice():point.slice();}return {joints,locked:raw.locked!==false,protectStyle:raw.protectStyle!==false,protectBackground:raw.protectBackground!==false};}
/** Resolve overlapping hit areas by distance to the joint center, not SVG paint order. */
function poseNearestJoint(raw,point){
 const entries=Object.entries(poseValues(raw).joints);let nearest=entries[0][0],distance=Infinity;
 for(const [key,p]of entries){const next=Math.hypot(p[0]-point[0],p[1]-point[1]);if(next<distance){nearest=key;distance=next;}}
 return nearest;
}
/** Move one joint; locked branches rotate about their parent without stretching or leaving the preview. */
function poseMove(raw,key,target){
 const d=poseValues(raw);if(!Object.hasOwn(d.joints,key))return d;
 const old=d.joints[key],parent=d.joints[poseParents[key]];
 let point=[Math.max(20,Math.min(500,target[0])),Math.max(16,Math.min(218,target[1]))],angle=0;
 if(d.locked&&!parent){
  const points=Object.entries(d.joints);
  const limit=(axis,delta)=>{const low=Math.max(...points.map(([joint,p])=>(axis===0?8:joint==='head'?4:8)-p[axis])),high=Math.min(...points.map(([,p])=>(axis===0?512:228)-p[axis]));return low<=high?Math.max(low,Math.min(high,delta)):0;};
  point=[old[0]+limit(0,target[0]-old[0]),old[1]+limit(1,target[1]-old[1])];
 }
 if(d.locked&&parent){
  const radius=Math.hypot(old[0]-parent[0],old[1]-parent[1]),dx=point[0]-parent[0],dy=point[1]-parent[1],length=Math.hypot(dx,dy);
  if(length<.001)return d;
  point=[parent[0]+dx/length*radius,parent[1]+dy/length*radius];
  const requested=Math.atan2(dy,dx)-Math.atan2(old[1]-parent[1],old[0]-parent[0]);
  angle=Math.atan2(Math.sin(requested),Math.cos(requested));
  const moving=[key];for(let i=0;i<moving.length;i++)for(const [child,owner]of Object.entries(poseParents))if(owner===moving[i])moving.push(child);
  const rotate=(p,a)=>[parent[0]+(p[0]-parent[0])*Math.cos(a)-(p[1]-parent[1])*Math.sin(a),parent[1]+(p[0]-parent[0])*Math.sin(a)+(p[1]-parent[1])*Math.cos(a)];
  const fits=a=>moving.every(joint=>{const p=rotate(d.joints[joint],a);return p[0]>=8&&p[0]<=512&&p[1]>=(joint==='head'?4:8)&&p[1]<=228;});
  if(!fits(angle)){
   if(!fits(0))return d;
   let low=0,high=1;for(let i=0;i<32;i++){const fraction=(low+high)/2;if(fits(angle*fraction))low=fraction;else high=fraction;}
   angle*=low;point=rotate(old,angle);
  }
 }
 const delta=[point[0]-old[0],point[1]-old[1]];d.joints[key]=point;
 if(d.locked){
  const moveChildren=parentKey=>{for(const [child,parentKeyOfChild]of Object.entries(poseParents)){
   if(parentKeyOfChild!==parentKey)continue;
   const p=d.joints[child];
   d.joints[child]=parent?[parent[0]+(p[0]-parent[0])*Math.cos(angle)-(p[1]-parent[1])*Math.sin(angle),parent[1]+(p[0]-parent[0])*Math.sin(angle)+(p[1]-parent[1])*Math.cos(angle)]:p.map((v,i)=>v+delta[i]);
   moveChildren(child);
  }};moveChildren(key);
 }
 return d;
}
function poseSnapshot(raw){return {poseVersion:1,...poseValues(raw)};}
function poseChanged(raw){const d=poseValues(raw);return Object.keys(poseDefaults).some(key=>d.joints[key].some((v,i)=>Math.abs(v-poseDefaults[key][i])>.01));}
