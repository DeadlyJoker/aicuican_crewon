/** Saved-image reuse must consume retained snapshots, not the latest source node. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-workbench-library.js',import.meta.url),'utf8');
function fixture(){const context=vm.createContext({structuredClone,handleAction(){},document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(source,context);return text=>vm.runInContext(text,context);}
test('saved entries retain image version and independent origin metadata',()=>{
 const r=fixture();r("var saved={referenceAssetVault:{folders:[{id:'f',category:'角色'}],items:[{id:'a',folderId:'f',project:'old',nodeId:'actor',title:'雨衣',kind:'character',candidate:{id:'v2',number:2,frame:3,prompt:'旧描述'}}]}};var before=JSON.stringify(saved);var entries=referenceSavedImageLibraryEntries(saved);");
 assert.equal(r('entries[0].candidate.number'),2);assert.equal(r('entries[0].description'),'旧描述');assert.equal(r('entries[0].category'),'character');
 assert.equal(r('entries[0].candidate.savedAsset.assetId'),'a');
 r("entries[0].candidate.frame=5");assert.equal(r('JSON.stringify(saved)'),r('before'));
 assert.equal(r('Object.hasOwn(entries[0],\'voicePreset\')'),false);
});
test('audio and video records stay out of an image replacement picker',()=>{
 const r=fixture();assert.equal(r("referenceSavedImageLibraryEntries({referenceAssetVault:{folders:[],items:[{id:'a',kind:'audio',candidate:{frame:0}},{id:'v',kind:'video',candidate:{frame:1}}]}}).length"),0);
 assert.equal(r('referenceSavedImageLibraryEntries({}).length'),0);
});
test('the saved source uses existing category and description search',()=>{
 const r=fixture();r("var S={referenceAssetVault:{folders:[{id:'f',category:'道具'}],items:[{id:'a',folderId:'f',title:'旧灯',kind:'image',candidate:{id:'v1',frame:0,prompt:'暖光灯具'}}]}};var referenceWorkbenchAssetEditor={category:'prop'};referenceWorkbenchLibrary={tab:'saved',type:'asset',query:'暖光'};");
 assert.equal(r('referenceLibraryEntries().length'),1);
 r("referenceWorkbenchAssetEditor.category='character'");assert.equal(r('referenceLibraryEntries().length'),0);
 r("referenceWorkbenchLibrary.type='image'");assert.equal(r('referenceLibraryEntries().length'),1);
});

test('retained asset metadata takes precedence over an imported image with no prompt',()=>{
 const r=fixture();r("var state={referenceAssetVault:{folders:[],items:[{id:'a',title:'角色',kind:'character',description:'已保存的角色描述',voicePreset:{id:'voice',name:'原音色'},candidate:{id:'imported',number:1,frame:2,prompt:''}}]}};var record=referenceSavedImageLibraryEntries(state)[0];");
 assert.equal(r('record.description'),'已保存的角色描述');assert.equal(r('record.voicePreset.name'),'原音色');
 r("record.voicePreset.name='编辑后的名称'");assert.equal(r('state.referenceAssetVault.items[0].voicePreset.name'),'原音色');
});
