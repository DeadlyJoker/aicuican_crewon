/* Load classic scripts in dependency order and contain an incomplete startup. */
(() => {
 'use strict';
 let current=null;
 window.addEventListener('error',event=>{
  if(current&&event.filename===current.url)current.error=new Error(event.message);
 });
 function showFailure(src,error){
  document.querySelector('[data-studio-startup]')?.remove();document.getElementById('studio-loading')?.remove();
  const panel=document.createElement('section');panel.dataset.studioStartup='failed';panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','studio-startup-title');
  panel.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#151515;color:#eee;display:grid;place-content:center;padding:24px;font:14px/1.6 system-ui;text-align:center';
  const title=document.createElement('h1');title.id='studio-startup-title';title.textContent='页面未能完整加载';title.style.cssText='font-size:20px;font-weight:500;margin:0 0 12px';
  const message=document.createElement('p');message.textContent='请刷新重试。此操作不会清除已保存的草稿。';
  const details=document.createElement('details');details.style.cssText='max-width:560px;text-align:left;color:#aaa;margin:8px 0 20px;overflow-wrap:anywhere';
  const summary=document.createElement('summary');summary.textContent='查看详情';const description=document.createElement('p');description.textContent=`${src.split('/').at(-1)}：${error.message}`;details.append(summary,description);
  const retry=document.createElement('button');retry.textContent='刷新重试';retry.style.cssText='justify-self:center;border:1px solid #555;background:#eee;color:#111;border-radius:8px;padding:8px 18px;font:inherit;cursor:pointer';retry.onclick=()=>location.reload();
  panel.append(title,message,details,retry);document.body.append(panel);retry.focus();
 }
 function load(src){return new Promise((resolve,reject)=>{
  const script=document.createElement('script'),url=new URL(src,location.href).href;current={url,error:null};script.src=url;script.async=false;
  script.onload=()=>{const error=current?.error;current=null;error?reject(error):resolve();};
  script.onerror=()=>{current=null;reject(new Error('脚本请求失败'));};
  document.body.append(script);
 });}
 async function start(){
  const entries=[...document.querySelectorAll('script[data-studio-src]')];
  for(const entry of entries){const src=entry.dataset.studioSrc;try{await load(src);}catch(error){showFailure(src,error instanceof Error?error:new Error(String(error)));return;}}
  document.documentElement.dataset.studioReady='true';document.getElementById('studio-loading')?.remove();
 }
 start();
})();
