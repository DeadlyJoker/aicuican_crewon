/** New examples keep screenplay assets complete without migrating saved projects. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const fixture=await readFile(new URL('../series-fixture.js',import.meta.url),'utf8');
const initial=app.slice(app.indexOf('const initialNodes='),app.indexOf('let stored='));
function run(code){return JSON.parse(vm.runInNewContext(initial+'\n'+fixture+'\nJSON.stringify('+code+')',{structuredClone}));}
test('fresh drama includes both characters, both locations and the shared lamp',()=>{
 const data=run('makeStudioDramaExample()');
 assert.deepEqual(data.nodes.filter(n=>n.kind==='character').map(n=>n.id),['actor','keeper']);
 assert.deepEqual(data.nodes.filter(n=>n.kind==='scene').map(n=>n.id),['scene','crossroad']);
 assert.deepEqual(data.nodes.filter(n=>n.assetCategory==='prop').map(n=>n.id),['lamp']);
 for(const id of ['keeper','crossroad','lamp'])assert.equal(data.nodes.find(n=>n.id===id).referenceOnly,true);
 const ids=new Set(data.nodes.map(n=>n.id));
 assert.equal(ids.size,data.nodes.length);
 for(const edge of data.edges)for(const id of edge)assert.ok(ids.has(id));
 assert.ok(data.edges.some(([a,b])=>a==='keeper'&&b==='shot2'));
 assert.ok(data.edges.some(([a,b])=>a==='crossroad'&&b==='shot3'));
 assert.ok(!data.edges.some(([a,b])=>a==='scene'&&b==='shot3'));
 assert.ok(data.edges.some(([a,b])=>a==='crossroad'&&b==='shot4'));
 assert.ok(data.edges.some(([a,b])=>a==='lamp'&&b==='shot3'));
});
test('new example instances do not modify legacy fixture or each other',()=>{
 assert.equal(run('(()=>{const before=JSON.stringify(initialNodes),a=makeStudioDramaExample(),b=makeStudioDramaExample();a.nodes[0].title="changed";a.edges[0][0]="changed";return before===JSON.stringify(initialNodes)&&b.nodes[0].title!=="changed"&&b.edges[0][0]!=="changed"})()'),true);
});
test('five-episode fixture includes the street in episode one and preserves the shared graph',()=>{
 const data=run('makeStudioSeriesExample()'),series=data.nodes.find(n=>n.id==='story').scriptSeries;
 assert.equal(series.episodes.length,5);
 assert.deepEqual(series.episodes[0].assetIds,['actor','keeper','scene','crossroad','lamp']);
 assert.ok(data.edges.some(([a,b])=>a==='crossroad'&&b==='shot3'));
 assert.ok(!data.edges.some(([a,b])=>a==='scene'&&b==='shot3'));
 assert.ok(data.edges.some(([a,b])=>a==='crossroad'&&b==='shot4'));
});
test('fresh example carries authored storyboard directions without changing legacy shots',()=>{
 const data=run('makeStudioDramaExample()');
 const shots=data.nodes.find(n=>n.id==='story').scriptDocument.scenes.flatMap(s=>s.shots);
 assert.equal(shots.length,4);
 assert.equal(shots.reduce((sum,s)=>sum+s.seconds,0),30);
 for(const shot of shots)assert.ok(shot.storyboardFields.prompt.includes(shot.dialogue));
 for(const shot of shots)for(const key of ['color','blocking','lighting','performance','sound','prompt'])assert.ok(shot.storyboardFields[key].length>0);
 assert.equal(run('initialNodes.some(n=>n.storyboardFields||n.scriptDocument)'),false);
});

test('all later episode shots include authored directions and independent version snapshots',()=>{
 const data=run('makeStudioSeriesExample()'),series=data.nodes.find(n=>n.id==='story').scriptSeries;
 for(const episode of series.episodes.slice(1)){
  const shots=episode.document.scenes.flatMap(scene=>scene.shots);
  assert.equal(shots.reduce((total,shot)=>total+shot.seconds,0),episode.estimatedSeconds);
  for(const shot of shots)for(const key of ['color','blocking','lighting','performance','sound','prompt'])assert.ok(shot.storyboardFields[key].length>0,episode.number+':'+key);
  const before=episode.versions[0].scenes[0].shots[0].storyboardFields.blocking;
  episode.document.scenes[0].shots[0].storyboardFields.blocking='changed';
  assert.equal(episode.versions[0].scenes[0].shots[0].storyboardFields.blocking,before);
 }
});
