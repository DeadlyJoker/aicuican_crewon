/* Series metadata projects the original script as episode one; legacy outputs and histories keep their owners. */
'use strict';
function studioSeriesAssets(){return S.nodes.filter(n=>['character','scene'].includes(n.kind)||n.assetCategory==='prop')}
function studioSeriesCategory(n){return n.assetCategory==='prop'?'prop':n.kind==='scene'?'scene':'character'}
function ensureStudioSeries(n){
 const doc=ensureStudioScript(n);if(!doc)return null;
 if(!n.scriptSeries){
  const seconds=doc.scenes.flatMap(s=>s.shots).reduce((sum,s)=>sum+(Number(s.seconds)||0),0);
  n.scriptSeries={version:1,title:doc.title,logline:doc.logline,setting:doc.logline,targetSeconds:{min:Math.max(30,seconds),max:Math.max(60,seconds)},stage:'script',episodes:[{id:n.id+'-episode-1',number:1,primary:true,assetIds:studioSeriesAssets().map(a=>a.id),outline:{event:doc.logline,conflict:'',hook:''}}]};
 }
 return n.scriptSeries;
}
function studioSeriesInitialize(n,count){
 const series=ensureStudioSeries(n);if(!series)return;
 const total=Number.isInteger(count)&&count>=1&&count<=100?count:1;
 for(let number=series.episodes.length+1;number<=total;number++)series.episodes.push({id:n.id+'-episode-'+number,number,primary:false,assetIds:[],document:{revision:1,title:'第 '+number+' 集',logline:'',scenes:[]},versions:[],outline:{event:'',conflict:'',hook:''}});
 return series;
}
function studioSeriesEpisode(n,id){
 const series=ensureStudioSeries(n);if(!series)return null;
 const entry=series.episodes.find(e=>e.id===id)||series.episodes[0];
 return {...entry,document:entry.primary?ensureStudioScript(n):entry.document,versions:entry.primary?n.scriptVersions:entry.versions};
}
function studioSeriesEpisodes(n){return ensureStudioSeries(n).episodes.map(e=>studioSeriesEpisode(n,e.id))}
function studioSeriesEpisodeReady(episode){return !!episode&&(!!episode.document.legacyText?.trim()||episode.document.scenes.some(s=>s.shots.length>0))}
function studioSeriesEpisodeSeconds(episode){return episode.estimatedSeconds||episode.document.scenes.flatMap(s=>s.shots).reduce((total,s)=>total+(Number(s.seconds)||0),0)}
function studioSeriesEpisodeText(episode){
 const doc=episode.document;
 return ['第 '+episode.number+' 集：'+doc.title,doc.logline||'',doc.legacyText||'',...doc.scenes.flatMap((scene,index)=>['【'+episode.number+'-'+(index+1)+'｜'+scene.title+'】',...scene.shots.flatMap(shot=>[shot.action?'（'+shot.action+'）':'',shot.dialogue||''])])].filter(Boolean).join('\n\n');
}
function studioSeriesAssetsFor(n,scope='all',category){
 const series=ensureStudioSeries(n),episode=scope==='all'?null:studioSeriesEpisode(n,scope);
 const ids=episode?episode.assetIds:series.sharedAssetIds||[...new Set(series.episodes.flatMap(e=>e.assetIds))];
 return studioSeriesAssets().filter(a=>ids.includes(a.id)&&(!category||studioSeriesCategory(a)===category));
}
