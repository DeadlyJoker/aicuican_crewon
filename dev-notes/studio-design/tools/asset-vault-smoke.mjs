import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const sources=await Promise.all(['reference-group-model.js','reference-node-commands.js','reference-asset-vault.js'].map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')));
function fixture(){const ctx=vm.createContext({structuredClone,document:{addEventListener(){}},window:{addEventListener(){}},handleAction(){},home(){},location:{hash:""},referenceRunNodeCommand(){},studioAdoptedCandidate:n=>n.candidates.find(c=>c.id===n.adoptedCandidateId)});vm.runInContext("var S={project:'A',nodes:[{id:'source',kind:'image',title:'原图',candidates:[{id:'v1',number:1,frame:2,prompt:'old',sourceReferences:[]}],adoptedCandidateId:'v1'}],edges:[],nodeDrafts:{},versions:{},layoutBase:[]}",ctx);for(const source of sources)vm.runInContext(source,ctx);return code=>vm.runInContext(code,ctx);}
test('saved assets retain an adopted version independently across project changes',()=>{const run=fixture();run("referenceVaultCreateFolder(S,'folder','角色参考','角色');var captured=referenceVaultCapture(S,S.nodes[0]);S.nodes[0].candidates[0].prompt='new';var saved=referenceVaultSave(S,'asset','folder',captured);S.project='B'");assert.equal(run('saved.ok'),true);assert.equal(run('saved.item.candidate.prompt'),'old');assert.equal(run('saved.item.project'),'A');assert.equal(run('referenceVaultData(S).items.length'),1);run("var duplicate=referenceVaultSave(S,'second','folder',captured)");assert.equal(run('duplicate.duplicate'),true);assert.equal(run('referenceVaultData(S).items.length'),1);});
test('invalid folders and duplicate folder names do not create assets',()=>{const run=fixture();run("referenceVaultCreateFolder(S,'folder','角色参考','角色')");assert.equal(run("referenceVaultCreateFolder(S,'other','角色参考','角色').ok"),false);assert.equal(run("referenceVaultSave(S,'x','missing',referenceVaultCapture(S,S.nodes[0])).ok"),false);assert.equal(run('referenceVaultData(S).items.length'),0);});
test('import creates an independent copy and graph undo preserves the library',()=>{const run=fixture();run("referenceVaultCreateFolder(S,'folder','角色参考','角色');var saved=referenceVaultSave(S,'asset','folder',referenceVaultCapture(S,S.nodes[0]));var result=referenceVaultImport(S,saved.item,'copy',{x:400,y:200});S.nodes[1].candidates[0].prompt='edited'");assert.equal(run('saved.item.candidate.prompt'),'old');run("S.nodes[1].candidates[0].prompt='old'");assert.equal(run('referenceRestoreNodeGraph(S,result.entry.after,result.entry.before).ok'),true);assert.equal(run('S.nodes.length'),1);assert.equal(run('referenceVaultData(S).items.length'),1);});
test('library search matches folder names or saved asset names and respects category',()=>{const run=fixture();run("referenceVaultCreateFolder(S,'folder','角色参考','角色');referenceVaultSave(S,'asset','folder',referenceVaultCapture(S,S.nodes[0]));referenceVaultPanel.query='原图'");assert.equal(run('referenceVaultVisibleFolders().length'),1);run("referenceVaultPanel.category='场景'");assert.equal(run('referenceVaultVisibleFolders().length'),0);run("referenceVaultPanel.category='全部';referenceVaultPanel.query='角色参考'");assert.equal(run('referenceVaultVisibleFolders().length'),1);});

test('history imports retain image dimensions and legacy records use the shared card size',()=>{const run=fixture();run("var result=referenceVaultImport(S,{kind:'image',title:'宽图',canvasSize:{width:420,height:476},candidate:{id:'v1',number:1,frame:2}},'copy',{x:800,y:200})");assert.equal(run('S.nodes[1].w'),420);assert.equal(run('S.nodes[1].h'),476);assert.equal(run("referenceVaultImportSize({kind:'character'}).width"),380);assert.equal(run("referenceVaultImportSize({kind:'character'}).height"),436);});
test('collection import records collection origin separately from saved assets',()=>{
 const run=fixture();run("var item={id:'c1',kind:'image',title:'采集图',collectionSource:{itemId:'c1',name:'采集图'},candidate:{id:'original',number:1,frame:2}};var result=referenceVaultImport(S,item,'copy',{x:400,y:200})");
 assert.equal(run('result.ok'),true);assert.equal(run("S.nodes[1].candidates[0].collectionSource.itemId"),'c1');assert.equal(run("S.nodes[1].candidates[0].savedAsset"),undefined);
 run("S.nodes[1].candidates[0].collectionSource.name='copy changed'");assert.equal(run('item.collectionSource.name'),'采集图');
});
test('media import retains duration and local file descriptor for restoration',()=>{
 const run=fixture();run("var result=referenceVaultImport(S,{kind:'video',title:'视频',collectionSource:{itemId:'c1'},candidate:{id:'v1',number:1,frame:-10,localMedia:{frame:-10,type:'视频',duration:2}}},'copy',{x:400,y:200})");
 assert.equal(run('S.nodes[1].seconds'),2);assert.equal(run('JSON.parse(JSON.stringify(S)).nodes[1].candidates[0].localMedia.frame'),-10);
});
test('refreshing a save form does not open an unsolicited asset drawer',()=>{
 const run=fixture();run("S.screen='canvas';document.querySelector=()=>null;var drawn=0;referenceVaultRender=()=>drawn++;referenceVaultRefresh()");assert.equal(run('drawn'),0);
 run("document.querySelector=()=>({});referenceVaultRefresh()");assert.equal(run('drawn'),1);
});

test('selection captures only adopted outputs and keeps independent versions',()=>{
 const r=fixture();r("S.nodes.push({id:'pending',kind:'image',title:'未制作',candidates:[],adoptedCandidateId:null});var captured=referenceVaultCaptureSelection(S,['source','pending','source','missing']);S.nodes[0].candidates[0].prompt='changed';");
 assert.equal(r('captured.length'),1);assert.equal(r('captured[0].candidate.prompt'),'old');
});
test('batch save is atomic and repeated confirmed versions are deduplicated',()=>{
 const r=fixture();r("referenceVaultCreateFolder(S,'folder','人物','角色');var captures=referenceVaultCaptureSelection(S,['source']);captures.push({...structuredClone(captures[0]),nodeId:'another',title:'第二张'});var counter=0;var first=referenceVaultSaveBatch(S,'folder',captures,()=> 'asset-'+(++counter));var again=referenceVaultSaveBatch(S,'folder',captures,()=> 'asset-'+(++counter));");
 assert.equal(r('first.added'),2);assert.equal(r('again.added'),0);assert.equal(r('referenceVaultData(S).items.length'),2);
 r("var before=JSON.stringify(S.referenceAssetVault);var failed=referenceVaultSaveBatch(S,'folder',[{...captures[0],nodeId:'third'},{...captures[0],nodeId:'fourth'}],()=> 'collision');");
 assert.equal(r('failed.ok'),false);assert.equal(r('JSON.stringify(S.referenceAssetVault)===before'),true);
});
test('batch save rejects invalid destination without a partial library update',()=>{
 const r=fixture();r("referenceVaultCreateFolder(S,'folder','人物','角色');var before=JSON.stringify(S.referenceAssetVault);var failed=referenceVaultSaveBatch(S,'missing',referenceVaultCaptureSelection(S,['source']),()=> 'saved');");
 assert.equal(r('failed.ok'),false);assert.equal(r('JSON.stringify(S.referenceAssetVault)===before'),true);
});
