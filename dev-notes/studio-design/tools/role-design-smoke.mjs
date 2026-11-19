/** Role selections remain local drafts until committed and keep immutable request copies. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../role-design.js',import.meta.url),'utf8');
function run(script){return vm.runInNewContext(source+'\n'+script,{structuredClone,handleAction(){},document:{addEventListener(){},getElementById(){return null;}},window:{addEventListener(){}}});}
test('single selection replaces a previous choice and toggles off',()=>{
 assert.equal(run("var g={id:'gender',options:[{name:'男性'},{name:'女性'}]};var s={};roleDesignToggle(s,g,'男性');roleDesignToggle(s,g,'女性');var exclusive=s.gender.join()==='女性';roleDesignToggle(s,g,'女性');exclusive&&!s.gender"),true);
});
test('none and specific accessories cannot coexist',()=>{
 const value=run("var g={id:'accessory',multiple:true,options:[{name:'无'},{name:'眼镜'},{name:'项链'}]};var s={};roleDesignToggle(s,g,'眼镜');roleDesignToggle(s,g,'项链');var paired=s.accessory.length===2;roleDesignToggle(s,g,'无');var cleared=s.accessory.join()==='无';roleDesignToggle(s,g,'眼镜');paired&&cleared&&s.accessory.join()==='眼镜'");assert.equal(value,true);
});
test('editing a copied selection does not change the saved draft',()=>{
 assert.equal(run("var d={creationRoleDesign:{gender:['女性']}};var copy=roleDesignSelection(d);copy.gender[0]='男性';d.creationRoleDesign.gender[0]==='女性'"),true);
});
const imageSource=await readFile(new URL('../reference-image.js',import.meta.url),'utf8');
test('image execution settings retain an independent copy of role tags',()=>{
 assert.equal(vm.runInNewContext(imageSource+"\nvar d={creationRoleDesign:{gender:['女性']}};var settings=referenceImageSettings(d);d.creationRoleDesign.gender[0]='男性';settings.roleDesign.gender[0]==='女性'",{structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}}),true);
});

test('node style never changes project defaults or accepted output',()=>{
 const result=vm.runInNewContext(imageSource+"\nvar state={nodes:[{id:'a',kind:'character',candidates:[{id:'v1',frame:1}]}],referenceOptions:{style:'项目风格'},nodeDrafts:{}};var style={name:'电影感',image:'local.webp'};referenceSaveNodeStyle(state,'a',style);style.name='修改来源';JSON.stringify(state)",{structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}});
 const state=JSON.parse(result);assert.equal(state.referenceOptions.style,'项目风格');assert.equal(state.nodeDrafts.a.creationStyle.name,'电影感');assert.deepEqual(state.nodes[0].candidates,[{id:'v1',frame:1}]);
});
test('removing a node style explicitly clears inherited settings without changing old snapshots',()=>{
 assert.equal(vm.runInNewContext(imageSource+"\nvar state={nodes:[{id:'a',kind:'image'}],nodeDrafts:{}};referenceSaveNodeStyle(state,'a',{name:'电影感',image:'local.webp'});var captured=referenceImageSettings(state.nodeDrafts.a);referenceSaveNodeStyle(state,'a',null);captured.style.name==='电影感'&&!referenceImageSettings(state.nodeDrafts.a).style",{structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}}),true);
});
