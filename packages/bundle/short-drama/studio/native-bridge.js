/* Native host owns project data; this frame only presents the retained Studio interface. */
'use strict';
let studioNativeConfig=null,studioNativeWritable=false,studioNativeStatusConnected=true;
const studioNativeValues=new Map();
const studioStorage={
 getItem:key=>studioNativeValues.get(String(key))??null,
 setItem(key,value){studioNativeValues.set(String(key),String(value));if(studioNativeWritable)studioNativePost('save',{storage:Object.fromEntries(studioNativeValues)});},
 removeItem(key){studioNativeValues.delete(String(key));if(studioNativeWritable)studioNativePost('save',{storage:Object.fromEntries(studioNativeValues)});},
};
function studioNativePost(type,payload={}){parent.postMessage({channel:'crewon-studio-v1',type,...payload},location.origin==='null'?'*':location.origin);}
let studioNativeInitialize;
const studioNativeBoot=new Promise(resolve=>{studioNativeInitialize=resolve;});
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!=='crewon-studio-v1')return;
 const value=event.data;
 if(value.type==='connect')studioNativePost('ready');
 if(value.type==='initialize'&&!studioNativeConfig){studioNativeConfig=value.value;for(const [key,item]of Object.entries(value.value.document.storage))studioNativeValues.set(key,item);studioNativeInitialize();}
 if(value.type==='refresh'&&studioNativeWritable){const next=value.value;if(next.project?.id===studioNativeConfig.project?.id&&next.production?.revision<studioNativeConfig.production?.revision)next.production=studioNativeConfig.production;studioNativeConfig=next;studioNativeApplyProject(false);}
 if(value.type==='production-update'&&studioNativeConfig){if(value.projectId&&value.projectId!==studioNativeConfig.project?.id||value.production.revision<studioNativeConfig.production.revision)return;const changed=!studioNativeStatusConnected||JSON.stringify(studioNativeConfig.production)!==JSON.stringify(value.production);studioNativeStatusConnected=true;studioNativeConfig.production=value.production;if(changed&&studioNativeWritable)studioNativeApplyProject(false);}
 if(value.type==='production-unavailable'){studioNativeStatusConnected=false;if(studioNativeWritable)render();}
 if(value.type==='flush'&&studioNativeWritable){rememberProject();persist();studioNativePost('flushed');}
 if(value.type==='agent-idle'&&studioNativeWritable){studioNativePendingRequests.clear();render();if(typeof studioNativeRefreshAssetWorkbench==='function')studioNativeRefreshAssetWorkbench();}
 if(value.type==='error'&&typeof toast==='function'){if(studioNativeWritable){studioNativePendingRequests.clear();render();if(typeof studioNativeRefreshAssetWorkbench==='function')studioNativeRefreshAssetWorkbench();}toast(value.message);}
});
studioNativePost('ready');
/* The retained original-store interface uses the native archive; no browser database is authoritative. */
async function studioNativeMediaDatabase(){
 return {transaction(){
  let complete,error,scheduled=false;const operations=[];
  const tx={set oncomplete(value){complete=value;schedule();},set onerror(value){error=value;},set onabort(value){error=value;},objectStore(){return {
   getAll(){const request={};Promise.resolve().then(async()=>{
    if(!studioNativeConfig.project){request.result=[];request.onsuccess?.();return;}
    const response=await fetch('/api/studio-originals?projectId='+encodeURIComponent(studioNativeConfig.project.id));if(!response.ok)throw new Error('共享素材读取失败');
    const records=await response.json();request.result=await Promise.all(records.map(async item=>{const file=await fetch(item.url);if(!file.ok)throw new Error('素材原件不可读取');return {...item,blob:await file.blob()};}));request.onsuccess?.();
   }).catch(()=>request.onerror?.());return request;},
   put(record){store(record);},add(record){store(record);},delete(){/* Unreferenced originals remain recoverable on the Host. */}
  };}};
  function store(record){operations.push((async()=>{
   if(!studioNativeConfig.project)throw new Error('先新建或打开项目，再导入素材');
   const query=new URLSearchParams({projectId:studioNativeConfig.project.id,frame:String(record.frame),name:record.name||''});
   const response=await fetch('/api/studio-originals/upload?'+query,{method:'POST',headers:{'content-type':record.blob.type},body:record.blob});if(!response.ok)throw new Error('共享素材保存失败');
  })());}
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>Promise.all(operations).then(()=>complete?.(),()=>error?.()));}
  return tx;
 }};
}
