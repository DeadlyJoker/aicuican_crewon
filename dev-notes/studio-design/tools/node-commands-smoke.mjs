/** Node commands preserve accepted media and scope undo to the edited entries. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const sources=await Promise.all(['reference-group-model.js','reference-node-commands.js','canvas-links.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
function fixture(){
 const ctx=vm.createContext({structuredClone,document:{addEventListener(){},querySelector(){return null;}},window:{addEventListener(){}}});
 vm.runInContext(`var S={project:'A',nodes:[{id:'a',kind:'character',title:'人物',x:10,y:20,w:100,h:100,candidates:[{id:'v1',sourceReferences:[{sourceId:'old',sourceTitle:'旧输入'}]}],adoptedCandidateId:'v1'},{id:'b',kind:'video',title:'片段',x:200,y:20,w:100,h:100,assetReferences:[{sourceId:'a',sourceTitle:'人物',candidateId:'v1'}],candidates:[{id:'bv',sourceReferences:[{sourceId:'a',sourceTitle:'人物'}]}]},{id:'c',kind:'text',title:'说明',x:400,y:20,w:100,h:100}],edges:[['a','b'],['b','c']],nodeDrafts:{a:{prompt:'人物草稿'},b:{prompt:'片段草稿',providerParams:{duration:'5'}}},versions:{a:2,b:3},clips:['b'],layoutBase:[{id:'a',x:10,y:20},{id:'b',x:200,y:20}],canvasUndo:[],canvasRedo:[],revision:0};function nodeById(id){return S.nodes.find(n=>n.id===id)}`,ctx);
 for(const source of sources)vm.runInContext(source,ctx);
 return code=>vm.runInContext(code,ctx);
}
test('duplicate retains independent accepted output, draft and incoming links, without downstream links',()=>{
 const run=fixture();run("var original=JSON.stringify(nodeById('b'));var result=referenceDuplicateCanvasNode(S,'b','copy',{x:600,y:30});");
 assert.equal(run('result.ok'),true);assert.equal(run("JSON.stringify(nodeById('b'))"),run('original'));
 assert.equal(run("JSON.stringify(S.edges)"),'[["a","b"],["b","c"],["a","copy"]]');
 assert.equal(run("nodeById('copy').title"),'片段');assert.equal(run("S.nodeDrafts.copy.providerParams.duration"),'5');
 run("nodeById('copy').candidates[0].id='independent';S.nodeDrafts.copy.providerParams.duration='10'");
 assert.equal(run("nodeById('b').candidates[0].id"),'bv');assert.equal(run("S.nodeDrafts.b.providerParams.duration"),'5');
});
test('duplicate materializes older groups and leaves new copy outside the source group',()=>{
 const run=fixture();run("referenceDuplicateCanvasNode(S,'a','copy',{x:600,y:20})");
 assert.equal(run('JSON.stringify(referenceReadGroups(S))'),'[{"id":"character","name":"角色组","nodeIds":["a"]}]');
 assert.equal(run("nodeById('copy').adoptedCandidateId"),'v1');
});
test('rename updates live reference labels but retains all historical input snapshots',()=>{
 const run=fixture();run("var result=referenceRenameCanvasNode(S,'a','  新名字  ')");
 assert.equal(run("nodeById('b').assetReferences[0].sourceTitle"),'新名字');
 assert.equal(run("nodeById('b').candidates[0].sourceReferences[0].sourceTitle"),'人物');
 assert.equal(run("referenceRenameCanvasNode(S,'a',' ').changed"),false);
});
test('delete and storage-roundtrip undo restore node, draft, memberships and edges in order',()=>{
 const run=fixture();run("var original=JSON.stringify(S);var result=referenceDeleteCanvasNode(S,'a');studioRecordCanvasHistory(result.entry);S=JSON.parse(JSON.stringify(S));");
 assert.equal(run("nodeById('b').assetReferences.length"),0);assert.equal(run("nodeById('b').candidates[0].sourceReferences[0].sourceId"),'a');
 assert.equal(run('studioReplayCanvasHistory().ok'),true);
 for(const key of ['nodes','edges','nodeDrafts','versions','clips','layoutBase'])assert.deepEqual(JSON.parse(run(`JSON.stringify(S.${key})`)),JSON.parse(run(`JSON.stringify(JSON.parse(original).${key})`)));
 assert.equal(run('studioReplayCanvasHistory(true).ok'),true);assert.equal(run("nodeById('a')===undefined"),true);
});
test('undo keeps unrelated later edits and redo restores the same copied version',()=>{
 const run=fixture();run("var result=referenceDuplicateCanvasNode(S,'b','copy',{x:600,y:30});studioRecordCanvasHistory(result.entry);nodeById('c').title='后来说明'");
 assert.equal(run('studioReplayCanvasHistory().ok'),true);assert.equal(run("nodeById('c').title"),'后来说明');
 assert.equal(run('studioReplayCanvasHistory(true).ok'),true);assert.equal(run("nodeById('copy').candidates[0].id"),'bv');
});
test('conflicting updates fail atomically and retain the undo entry',()=>{
 const run=fixture();run("var result=referenceRenameCanvasNode(S,'a','新名字');studioRecordCanvasHistory(result.entry);nodeById('b').assetReferences[0].sourceTitle='其他更新';var before=JSON.stringify(S)");
 assert.equal(run('studioReplayCanvasHistory().ok'),false);assert.equal(run('JSON.stringify(S)'),run('before'));
});
test('undo cannot remove a copied node with a newer unrecorded incoming link or reference',()=>{
 for(const change of ["S.edges.push(['c','copy'])","nodeById('c').assetReferences=[{sourceId:'copy'}]"]){
  const run=fixture();run("var result=referenceDuplicateCanvasNode(S,'b','copy',{x:600,y:30});studioRecordCanvasHistory(result.entry);"+change+";var before=JSON.stringify(S)");
  assert.equal(run('studioReplayCanvasHistory().ok'),false);assert.equal(run('JSON.stringify(S)'),run('before'));
 }
});
test('internal clipboard retains snapshots, but cross-project paste drops live source links',()=>{
 const run=fixture();run("var payload=referenceCopyCanvasNode(S,'b').payload;S.project='B';var result=referencePasteCanvasNode(S,payload,'copy',{x:600,y:30})");
 assert.equal(run('result.dropped'),1);assert.equal(run("nodeById('copy').assetReferences.length"),0);assert.equal(run("nodeById('copy').candidates[0].sourceReferences[0].sourceId"),'a');
});
test('structural script-linked nodes and duplicate identifiers reject without mutation',()=>{
 const run=fixture();run("nodeById('a').scriptSourceId='script';var before=JSON.stringify(S)");
 for(const code of ["referenceDeleteCanvasNode(S,'a')","referenceRenameCanvasNode(S,'a','x')","referenceDuplicateCanvasNode(S,'a','copy',{x:0,y:0})","referenceDuplicateCanvasNode(S,'b','c',{x:0,y:0})"]){assert.equal(run(code+'.ok'),false);assert.equal(run('JSON.stringify(S)'),run('before'));}
});
test('asset deletion removes series memberships and undo restores them',()=>{
 const run=fixture();run("S.nodes.push({id:'story',kind:'story',scriptSeries:{sharedAssetIds:['a','b'],episodes:[{id:'e1',assetIds:['a']},{id:'e2',assetIds:['a','b']}]}});var original=JSON.stringify(nodeById('story'));var result=referenceDeleteCanvasNode(S,'a');studioRecordCanvasHistory(result.entry)");
 assert.equal(run("JSON.stringify(nodeById('story').scriptSeries)"),'\u007b"sharedAssetIds":["b"],"episodes":[{"id":"e1","assetIds":[]},{"id":"e2","assetIds":["b"]}]}');
 assert.equal(run('studioReplayCanvasHistory().ok'),true);assert.equal(run("JSON.stringify(nodeById('story'))"),run('original'));
});
test('undo refuses to orphan a new series reference to a copied asset',()=>{
 const run=fixture();run("var result=referenceDuplicateCanvasNode(S,'a','copy',{x:600,y:30});studioRecordCanvasHistory(result.entry);S.nodes.push({id:'story',kind:'story',scriptSeries:{episodes:[{id:'e1',assetIds:['copy']}]}});var before=JSON.stringify(S)");
 assert.equal(run('studioReplayCanvasHistory().ok'),false);assert.equal(run('JSON.stringify(S)'),run('before'));
});
test('deleting a main character keeps variants as independent assets and undo restores the relation',()=>{
 const run=fixture();run("nodeById('c').variantOf='a';var result=referenceDeleteCanvasNode(S,'a');studioRecordCanvasHistory(result.entry)");
 assert.equal(run("Object.hasOwn(nodeById('c'),'variantOf')"),false);
 assert.equal(run('studioReplayCanvasHistory().ok'),true);assert.equal(run("nodeById('c').variantOf"),'a');
});

test('confirmed assets reject deletion without altering nodes, links or snapshots',()=>{
 const run=fixture();run("S.nodes.push({id:'story',kind:'story',scriptSeries:{episodes:[],assetConfirmation:{assets:[{id:'a'}]}}});var before=JSON.stringify(S);var result=referenceDeleteCanvasNode(S,'a')");
 assert.equal(run('result.ok'),false);assert.equal(run('JSON.stringify(S)===before'),true);
 run("var copied=referenceDuplicateCanvasNode(S,'a','new-a')");assert.equal(run('copied.ok'),true);assert.equal(run("referenceConfirmedAsset(S,'new-a')"),false);
});
