import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../pose-control-model.js',import.meta.url),'utf8');
function fixture(){const context=vm.createContext({});vm.runInContext(source,context);return code=>vm.runInContext(code,context);}
test('old drafts receive independent default joints without rewriting saved values',()=>{const run=fixture();run('var a=poseValues();var b=poseValues();a.joints.head[0]=9');assert.equal(run('b.joints.head[0]'),260);assert.equal(run('poseChanged(b)'),false);});
test('free movement changes only the selected joint and stays inside the preview',()=>{const run=fixture();run("var a=poseValues({locked:false});var b=poseMove(a,'leftWrist',[-200,500])");assert.equal(run('b.joints.leftWrist[0]'),20);assert.equal(run('b.joints.leftWrist[1]'),218);assert.equal(run('b.joints.leftElbow[0]'),219);assert.equal(run('a.joints.leftWrist[0]'),208);});
test('locked movement preserves all bone lengths including descendants',()=>{const run=fixture();run("var a=poseValues();var b=poseMove(a,'leftElbow',[185,65]);var lengths=d=>Object.entries(poseParents).map(([k,p])=>Math.hypot(d.joints[k][0]-d.joints[p][0],d.joints[k][1]-d.joints[p][1]));var before=lengths(a);var after=lengths(b)");assert.ok(run('before.every((v,i)=>Math.abs(v-after[i])<1e-8)'));assert.equal(run('b.joints.rightWrist[0]'),312);});
test('candidate snapshots survive later draft edits and JSON restoration',()=>{const run=fixture();run("var a=poseMove(poseValues({locked:false}),'head',[270,30]);var shot=poseSnapshot(a);a.joints.head[0]=290;var restored=poseValues(JSON.parse(JSON.stringify(shot)))");assert.equal(run('shot.joints.head[0]'),270);assert.equal(run('restored.joints.head[0]'),270);assert.equal(run('shot.poseVersion'),1);});
test('locked elbow motion rotates its wrist by the same angle instead of translating it',()=>{
 const run=fixture();run("var a=poseValues();var b=poseMove(a,'leftElbow',[185,65]);var angle=d=>Math.atan2(d.joints.leftWrist[1]-d.joints.leftElbow[1],d.joints.leftWrist[0]-d.joints.leftElbow[0])-Math.atan2(d.joints.leftElbow[1]-d.joints.leftShoulder[1],d.joints.leftElbow[0]-d.joints.leftShoulder[0]);var difference=angle(b)-angle(a)");
 assert.ok(run('Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference)))<1e-8'));
 assert.ok(run('Math.abs((b.joints.leftWrist[1]-a.joints.leftWrist[1])-(b.joints.leftElbow[1]-a.joints.leftElbow[1]))>1'));
});

test('moving the locked pelvis translates every joint by the same delta',()=>{
 const run=fixture();run("var a=poseValues();var b=poseMove(a,'hip',[300,100])");
 assert.ok(run('Object.keys(a.joints).every(k=>Math.abs(b.joints[k][0]-a.joints[k][0]-40)<1e-8&&Math.abs(b.joints[k][1]-a.joints[k][1]+6)<1e-8)'));
});
test('the locked pelvis stops before hands or feet leave the preview',()=>{
 const run=fixture();run("var a=poseValues();var right=poseMove(a,'hip',[900,106]);var down=poseMove(a,'hip',[260,900]);var up=poseMove(a,'hip',[260,-900])");
 assert.equal(run('right.joints.rightWrist[0]'),512);assert.equal(run('down.joints.leftAnkle[1]'),228);assert.equal(run('up.joints.head[1]'),4);
 assert.equal(run('right.joints.leftWrist[0]-right.joints.hip[0]'),-52);
});
test('rotating the chest moves the complete upper body while hips and legs stay fixed',()=>{
 const run=fixture();run("var a=poseValues();var b=poseMove(a,'chest',[290,70])");
 assert.ok(run("['head','neck','leftShoulder','rightShoulder','leftWrist','rightWrist'].every(k=>Math.hypot(b.joints[k][0]-a.joints[k][0],b.joints[k][1]-a.joints[k][1])>1)"));
 assert.ok(run("['hip','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle'].every(k=>b.joints[k].every((v,i)=>v===a.joints[k][i]))"));
});

test('rotating a locked branch at the preview edge keeps descendants visible without stretching',()=>{
 const run=fixture();run("var a=poseMove(poseValues(),'hip',[900,106]);var b=poseMove(a,'rightShoulder',[500,16]);var lengths=d=>Object.entries(poseParents).map(([k,p])=>Math.hypot(d.joints[k][0]-d.joints[p][0],d.joints[k][1]-d.joints[p][1]));var before=lengths(a);var after=lengths(b)");
 assert.ok(run("Object.entries(b.joints).every(([key,p])=>p[0]>=8-1e-7&&p[0]<=512+1e-7&&p[1]>=(key==='head'?4:8)-1e-7&&p[1]<=228+1e-7)"));
 assert.ok(run('before.every((v,i)=>Math.abs(v-after[i])<1e-8)'));
 assert.equal(run('b.joints.leftWrist[0]'),run('a.joints.leftWrist[0]'));
});

test('corner drags preserve a visible locked skeleton after moving it to each preview edge',()=>{
 const run=fixture();
 run("var base=poseValues();var samples=[[900,106],[-900,106],[260,-900],[260,900]];var targets=[[20,16],[500,16],[20,218],[500,218]];var valid=true;var unchanged=true;for(const target of samples){const start=poseMove(base,'hip',target);const saved=JSON.stringify(start);for(const joint of Object.keys(poseParents))for(const destination of targets){const end=poseMove(start,joint,destination);for(const [key,p]of Object.entries(end.joints))if(p[0]<8-1e-7||p[0]>512+1e-7||p[1]<(key==='head'?4:8)-1e-7||p[1]>228+1e-7)valid=false;for(const [key,parent]of Object.entries(poseParents)){const length=d=>Math.hypot(d.joints[key][0]-d.joints[parent][0],d.joints[key][1]-d.joints[parent][1]);if(Math.abs(length(start)-length(end))>1e-8)valid=false;}}if(JSON.stringify(start)!==saved)unchanged=false;}");
 assert.equal(run('valid'),true);assert.equal(run('unchanged'),true);
});

test('overlapping pelvis and hip hit areas select the closest visible joint',()=>{
 const run=fixture();assert.equal(run("poseNearestJoint(poseValues(),[260,106])"),'hip');
 assert.equal(run("poseNearestJoint(poseValues(),[271,110])"),'rightHip');assert.equal(run("poseNearestJoint(poseValues(),[249,110])"),'leftHip');
 run("var moved=poseMove(poseValues(),'hip',[300,120])");assert.equal(run("poseNearestJoint(moved,moved.joints.hip)"),'hip');
});
