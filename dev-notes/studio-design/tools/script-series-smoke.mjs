/** Keep legacy single-episode data authoritative while adding independent series reading records. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const sources=await Promise.all(['script-workbench.js','script-series.js'].map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')));
function fixture(){
 const context=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}},save(){}});
 vm.runInContext(`var S={projectKind:'drama',nodes:[{id:'story',kind:'story',title:'旧剧本',scriptDocument:{revision:3,title:'旧剧本',logline:'保留原有故事',scenes:[{id:'s1',title:'场景1',shots:[{id:'shot1',title:'镜头',action:'原有画面',dialogue:'原对白',seconds:8}]}]},scriptVersions:[{revision:2,title:'历史版',scenes:[]}],scriptDraft:{title:'未提交草稿'},candidates:[{id:'old-output'}],adoptedCandidateId:'old-output'},{id:'actor',kind:'character'},{id:'scene',kind:'scene'},{id:'lamp',kind:'image',assetCategory:'prop'}],clips:['shot1'],history:[{type:'finished',expertVersion:3}]};function nodeById(id){return S.nodes.find(n=>n.id===id)}`,context);
 for(const source of sources)vm.runInContext(source,context);
 return code=>vm.runInContext(code,context);
}
test('initializing a series retains every legacy field and projects the original episode-one owner',()=>{
 const run=fixture(),before=JSON.parse(run('JSON.stringify(nodeById("story"))'));
 run('studioSeriesInitialize(nodeById("story"),5)');
 const after=JSON.parse(run('JSON.stringify(nodeById("story"))'));delete after.scriptSeries;assert.deepEqual(after,before);
 assert.equal(run('studioSeriesEpisode(nodeById("story")).document===nodeById("story").scriptDocument'),true);
 assert.equal(run('studioSeriesEpisodes(nodeById("story")).length'),5);
});
test('unwritten requested episodes stay pending instead of copying another episode body',()=>{
 const run=fixture();run('studioSeriesInitialize(nodeById("story"),7)');
 assert.equal(run('studioSeriesEpisodeReady(studioSeriesEpisodes(nodeById("story"))[1])'),false);
 assert.equal(run('studioSeriesEpisodeText(studioSeriesEpisodes(nodeById("story"))[1]).includes("原对白")'),false);
 assert.equal(run('studioSeriesEpisodeReady(studioSeriesEpisodes(nodeById("story"))[0])'),true);
});
test('episode bodies, revisions and asset scopes remain independent after a storage round trip',()=>{
 const run=fixture();run(`studioSeriesInitialize(nodeById('story'),2);var entry=nodeById('story').scriptSeries.episodes[1];entry.document={revision:1,title:'第二集',logline:'新的事件',scenes:[{id:'s2',title:'新场景',shots:[{id:'shot2',title:'新镜头',action:'另一段画面',dialogue:'第二集独立对白',seconds:12}]}]};entry.versions=[structuredClone(entry.document)];entry.assetIds=['actor','lamp'];S=JSON.parse(JSON.stringify(S));`);
 assert.equal(run(`studioSeriesEpisodeText(studioSeriesEpisodes(nodeById('story'))[1]).includes('原对白')`),false);
 assert.equal(run(`studioSeriesEpisodeText(studioSeriesEpisodes(nodeById('story'))[0]).includes('第二集独立对白')`),false);
 assert.equal(run(`studioSeriesAssetsFor(nodeById('story'),'story-episode-2','scene').length`),0);
 assert.equal(run(`studioSeriesAssetsFor(nodeById('story'),'all','scene').length`),1);
 assert.equal(run(`studioSeriesEpisodeSeconds(studioSeriesEpisodes(nodeById('story'))[1])`),12);
 assert.equal(run(`nodeById('story').scriptVersions[0].title`),'历史版');
});
test('later primary edits are read from their original owner without rewriting extra episode versions',()=>{
 const run=fixture();run(`studioSeriesInitialize(nodeById('story'),2);var before=JSON.stringify(nodeById('story').scriptSeries.episodes[1]);nodeById('story').scriptDocument={...nodeById('story').scriptDocument,revision:4,title:'已审阅的新标题'};`);
 assert.equal(run('studioSeriesEpisodes(nodeById("story"))[0].document.revision'),4);
 assert.equal(run('JSON.stringify(nodeById("story").scriptSeries.episodes[1])'),run('before'));
 assert.equal(run('nodeById("story").scriptVersions[0].title'),'历史版');
});
