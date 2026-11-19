/* Embedded Studio consumes the host's resolved theme; standalone previews keep their own selector. */
'use strict';
let studioNativeDark=false;
let studioWallpaperVideo=null;
function studioNativeWallpaper(){
 const target=document.querySelector('.canvas-viewport');
 const source=document.body.style.getPropertyValue('--dsw-wallpaper-video').trim();
 if(!source||!/^\/appearance-media\/[a-f0-9]{64}\.(mp4|webm)$/.test(source)){
  if(studioWallpaperVideo){studioWallpaperVideo.pause();studioWallpaperVideo.remove();studioWallpaperVideo=null;}return;
 }
 if(!target)return;
 if(!studioWallpaperVideo||studioWallpaperVideo.getAttribute('src')!==source){
  if(studioWallpaperVideo){studioWallpaperVideo.pause();studioWallpaperVideo.remove();}
  studioWallpaperVideo=document.createElement('video');studioWallpaperVideo.className='crewon-wallpaper-video';
  studioWallpaperVideo.muted=true;studioWallpaperVideo.loop=true;studioWallpaperVideo.playsInline=true;studioWallpaperVideo.autoplay=true;studioWallpaperVideo.src=source;studioWallpaperVideo.setAttribute('aria-hidden','true');
 }
 if(studioWallpaperVideo.parentElement!==target)target.prepend(studioWallpaperVideo);
}
function studioNativeApplyTheme(){
 if(parent===window)return;
 const dark=studioNativeDark;
 document.documentElement.dataset.studioNative='true';
 document.documentElement.dataset.theme=dark?'dark':'light';
 document.body.toggleAttribute('data-ds-dark-theme',dark);
}
function studioNativeReadTheme(){
 const source=parent.document.body,colors=parent.getComputedStyle(source);
 studioNativeDark=source.hasAttribute('data-ds-dark-theme');
 studioNativeApplyTheme();
 for(let index=0;index<colors.length;index++){
  const key=colors[index];
  if((key.startsWith('--dsw-')||key.startsWith('--we-'))&&document.body.style.getPropertyValue(key)!==colors.getPropertyValue(key))document.body.style.setProperty(key,colors.getPropertyValue(key));
 }
 studioNativeWallpaper();
}
if(parent!==window){
 studioNativeReadTheme();
 let pending=0;
 const update=()=>{if(!pending)pending=requestAnimationFrame(()=>{pending=0;studioNativeReadTheme();});};
 const observer=new MutationObserver(update);
 observer.observe(parent.document.documentElement,{attributes:true});
 observer.observe(parent.document.body,{attributes:true});
 observer.observe(parent.document.head,{subtree:true,childList:true,attributes:true,characterData:true});
 const localObserver=new MutationObserver(studioNativeWallpaper);localObserver.observe(document.body,{childList:true,subtree:true});
 const scheme=parent.matchMedia('(prefers-color-scheme: dark)');
 scheme.addEventListener('change',update);
 window.addEventListener('pagehide',()=>{observer.disconnect();localObserver.disconnect();if(studioWallpaperVideo)studioWallpaperVideo.pause();scheme.removeEventListener('change',update);cancelAnimationFrame(pending);},{once:true});
}
