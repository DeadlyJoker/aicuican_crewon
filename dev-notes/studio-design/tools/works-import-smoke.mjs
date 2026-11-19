/** Batch copies retain source versions and undo as one graph operation. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const graph=await readFile(new URL('../reference-node-commands.js',import.meta.url),'utf8');
const vault=await readFile(new URL('../reference-asset-vault.js',import.meta.url),'utf8');
const history=await readFile(new URL('../reference-result-history.js',import.meta.url),'utf8');
const works=await readFile(new URL('../reference-works-import.js',import.meta.url),'utf8');
function fixture(){
 const c=vm.createContext({structuredClone});
 const extract=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end));
 vm.runInContext(graph.slice(0,graph.indexOf('function referenceNodeCommandResult('))+extract(vault,'function referenceVaultImportSize(','function referenceVaultVisibleItems(')+extract(history,'function referenceResultEntries(','function referenceMoveResultRecords(')+extract(works,'function referenceImportWorkBatch(','function referenceWorksImportGrid('),c);
 vm.runInContext(`var state={project:'来源',nodes:[{id:'source',kind:'image',title:'取景图',x:10,y:20,w:200,h:240,candidates:[{id:'v3',number:3,frame:7,prompt:'原提示词'},{id:'v4',number:4,frame:8,prompt:'新提示词'}]}],edges:[],nodeDrafts:{},versions:{}};var keys=referenceResultEntries(state).map(item=>item.key);var seq=0;var newId=()=> 'copy-'+(++seq);`,c);return code=>vm.runInContext(code,c);
}
test('batch captures source versions and leaves originals independent',()=>{
 const r=fixture();r("var original=JSON.stringify(state.nodes[0]);var result=referenceImportWorkBatch(state,keys,'op',newId);");assert.equal(r('result.ok'),true);assert.equal(r('result.ids.length'),2);assert.equal(r('JSON.stringify(state.nodes[0])'),r('original'));assert.equal(r('state.nodes[1].candidates[0].sourceHistory.number'),3);assert.equal(r('state.nodes[2].candidates[0].sourceHistory.candidateId'),'v4');
});
test('duplicate confirmation adds nothing and undo restores the whole batch',()=>{
 const r=fixture();r("var before=JSON.stringify(state);var first=referenceImportWorkBatch(state,keys,'op',newId);var after=JSON.stringify(state);var second=referenceImportWorkBatch(state,keys,'op',newId);");assert.equal(r('second.changed'),false);assert.equal(r('JSON.stringify(state)'),r('after'));r('var undo=referenceRestoreNodeGraph(state,first.entry.after,first.entry.before);');assert.equal(r('undo.ok'),true);assert.equal(r('JSON.stringify(state)'),r('before'));
});
test('missing results and duplicate output ids reject the entire batch',()=>{
 const r=fixture();r("var before=JSON.stringify(state);var missing=referenceImportWorkBatch(state,[...keys,'removed'],'op',newId);var collision=referenceImportWorkBatch(state,keys,'op',()=> 'collision');");assert.equal(r('missing.ok'),false);assert.equal(r('collision.ok'),false);assert.equal(r('JSON.stringify(state)'),r('before'));
});
