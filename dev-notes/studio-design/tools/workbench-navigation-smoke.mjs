/** Navigation preserves workbench drafts and the browser's own history entries. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-workbench-navigation.js',import.meta.url),'utf8');
function harness(){
 const state={open:true,asset:null,dirty:false,story:null,url:'https://demo.test/#canvas',closed:0,events:[],error:{textContent:''}};
 const jobs=[],listeners={};
 const context=vm.createContext({URL,queueMicrotask:job=>jobs.push(job),location:{get href(){return state.url;}},
  document:{querySelector:()=>state.open?{}:null,getElementById:()=>state.error},
  window:{addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:event=>{state.events.push(event);listeners.hashchange(event);}},
  HashChangeEvent:class{constructor(type,init){Object.assign(this,init);this.type=type;}},
  get referenceWorkbenchAssetEditor(){return state.asset;},get referenceStoryboardEdit(){return state.story;},
  referenceAssetEditorDirty:()=>state.dirty,referenceRememberWorkbenchScroll(){},referenceAssetPreview:null,
  referenceCloseVoicePicker(){},referenceCloseWorkbenchAsset(){state.asset=null;},
  closeDialog(){state.open=false;state.closed++;},toast(){},
  handleAction:action=>{if(action==='ref-sb-cancel')state.story=null;}
 });
 vm.runInContext(source,context);
 return {state,run:code=>vm.runInContext(code,context),flush(){while(jobs.length)jobs.shift()();},
  navigate(hash){const event={oldURL:state.url,newURL:'https://demo.test/'+hash,stopped:false,stopImmediatePropagation(){this.stopped=true;}};state.url=event.newURL;listeners.hashchange(event);return event;},
  unload(){const event={prevented:false,preventDefault(){this.prevented=true;}};listeners.beforeunload(event);return event;}};
}
test('read-only navigation closes the workbench without intercepting browser history',()=>{
 const h=harness();assert.equal(h.navigate('#projects').stopped,false);assert.equal(h.state.open,false);assert.equal(h.state.events.length,0);
});
test('dirty edits wait until the owning close handler completes',()=>{
 const h=harness();h.state.asset={};h.state.dirty=true;assert.equal(h.navigate('#projects').stopped,true);
 assert.equal(h.state.open,true);assert.equal(h.state.url,'https://demo.test/#projects');
 h.run('referenceCloseWorkbenchAsset()');assert.equal(h.state.open,true);h.flush();assert.equal(h.state.open,false);assert.equal(h.state.events.length,1);
});
test('forward to canvas cancels departure and clears only its own hint',()=>{
 const h=harness();h.state.asset={};h.state.dirty=true;h.navigate('#projects');h.state.error.textContent='名称不能为空';h.navigate('#canvas');
 assert.equal(h.state.error.textContent,'名称不能为空');h.run('referenceCloseWorkbenchAsset()');h.flush();assert.equal(h.state.open,true);
});
test('switching editors cannot accidentally complete a queued departure',()=>{
 const h=harness();h.state.asset={};h.state.dirty=true;h.navigate('#assets');h.run('referenceCloseWorkbenchAsset()');h.state.asset={};h.flush();assert.equal(h.state.open,true);
});
test('storyboard edits and document unloading retain existing edit protection',()=>{
 const h=harness();h.state.story={};assert.equal(h.unload().prevented,true);assert.equal(h.navigate('#projects').stopped,true);
 h.run("handleAction('ref-sb-save')");h.flush();assert.equal(h.state.open,true);
 h.run("handleAction('ref-sb-cancel')");h.flush();assert.equal(h.state.open,false);assert.equal(h.unload().prevented,false);
});
