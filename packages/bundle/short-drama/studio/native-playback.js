/* Keep decoded media alive across cuts; captions never own video elements. */
'use strict';
class StudioEditPlayback {
 constructor(surface){
  this.surface=surface;this.layer=surface.querySelector('.native-edit-media');this.buffer=surface.querySelector('canvas');this.captions=surface.querySelector('.native-edit-captions');
  this.buffer.hidden=true;this.players=new Map();this.displayed=[];this.closed=false;this.editor=null;this.time=0;this.playing=false;this.captionKey='';
 }
 obtain(clip){
  const source=studioCutClipMedia(clip);if(!source)return null;
  let entry=this.players.get(clip.id);
  if(entry&&entry.url!==source.url){this.release(entry);this.players.delete(clip.id);entry=null;}
  if(entry)return entry;
  const media=document.createElement(clip.kind==='audio'?'audio':'video');
  media.className=clip.kind==='audio'?'native-cut-voice':'native-cut-player native-edit-layer';media.preload='auto';media.playsInline=true;media.muted=true;media.style.visibility='hidden';
  entry={id:clip.id,url:source.url,media,clip,target:clip.sourceIn,ready:false,ticket:0,frame:null,failed:false,playGeneration:0};
  const decoded=()=>this.decoded(entry);
  entry.loaded=()=>{if(Math.abs(media.currentTime-entry.target)>0.0001){this.seek(entry,entry.target);}else decoded();};
  entry.decoded=decoded;entry.error=()=>{entry.failed=true;if(entry.active&&this.playing)this.fail();};
  media.addEventListener('loadeddata',entry.loaded);media.addEventListener('seeked',decoded);media.addEventListener('error',entry.error);
  this.players.set(clip.id,entry);this.layer.append(media);media.src=source.url;media.load();return entry;
 }
 decoded(entry){
  if(this.closed||entry.media.seeking||entry.media.readyState<2)return;
  const ticket=entry.ticket;
  const accept=()=>{if(this.closed||entry.ticket!==ticket||entry.media.seeking)return;entry.ready=true;this.present();};
  if(entry.media.requestVideoFrameCallback&&entry.clip.kind==='video')entry.frame=entry.media.requestVideoFrameCallback(accept);
  // A paused element may already have presented this frame before the callback was registered.
  requestAnimationFrame(()=>{if(entry.media.readyState>=2&&!entry.media.seeking)accept();});
 }
 seek(entry,target){
  entry.target=target;entry.ready=false;entry.ticket++;entry.playGeneration++;entry.media.pause();
  if(entry.frame!==null&&entry.media.cancelVideoFrameCallback)entry.media.cancelVideoFrameCallback(entry.frame);
  entry.frame=null;
  if(entry.media.readyState>=1){entry.media.currentTime=target;if(!entry.media.seeking)this.decoded(entry);}
 }
 remember(){
  const visible=this.displayed.map(id=>this.players.get(id)).filter(entry=>entry?.media.style.visibility==='visible'&&entry.media.readyState>=2);
  const canvas=this.buffer,context=canvas.getContext('2d');if(!context||!visible.length)return;
  const width=Math.max(1,Math.round(this.surface.clientWidth)),height=Math.max(1,Math.round(this.surface.clientHeight));
  canvas.width=width;canvas.height=height;context.fillStyle='#000';context.fillRect(0,0,width,height);
  for(const entry of visible){const clip=entry.clip,rect=clip.nativeTransform||{x:0,y:0,width:1,height:1};
   const fit=Math.min(rect.width*width/entry.media.videoWidth,rect.height*height/entry.media.videoHeight),w=entry.media.videoWidth*fit,h=entry.media.videoHeight*fit;
   context.globalAlpha=clip.opacity/100;
   try{context.drawImage(entry.media,rect.x*width+(rect.width*width-w)/2,rect.y*height+(rect.height*height-h)/2,w,h);}catch(error){console.warn('Studio preview frame could not be retained',error);}
  }
  context.globalAlpha=1;canvas.hidden=false;
 }
 sync(editor,time,playing){
  if(playing&&!this.playing)for(const [id,entry]of this.players)if(entry.failed){this.release(entry);this.players.delete(id);}
  this.editor=editor;this.time=time;this.playing=playing;
  const active=studioEditVisible(editor,time),desired=active.filter(clip=>clip.kind==='video'||clip.kind==='audio');
  const wanted=new Set(desired.map(clip=>clip.id));
  for(const track of editor.nativeTracks){const next=editor.clips.filter(clip=>clip.track===track.id&&!clip.pending&&clip.kind!=='text'&&clip.start>time).sort((a,b)=>a.start-b.start)[0];if(next){wanted.add(next.id);this.obtain(next);}}
  for(const clip of desired){const entry=this.obtain(clip);if(!entry)continue;entry.clip=clip;const target=clip.sourceIn+time-clip.start;
   if(!playing||!entry.active||Math.abs(entry.media.currentTime-target)>.25){if(Math.abs(entry.target-target)>0.0001||!entry.ready){if(this.displayed.includes(entry.id))this.remember();this.seek(entry,target);}}
  }
  if(playing&&desired.some(clip=>this.players.get(clip.id)?.failed)){this.fail();return false;}
  const ready=desired.every(clip=>this.players.get(clip.id)?.ready);
  this.present();
  for(const [id,entry]of this.players){if(!wanted.has(id)&&!this.displayed.includes(id)){this.release(entry);this.players.delete(id);}}
  return ready;
 }
 present(){
  if(this.closed||!this.editor||!this.surface.isConnected)return;
  const editor=this.editor,active=studioEditVisible(editor,this.time),videos=active.filter(clip=>clip.kind==='video'),media=active.filter(clip=>clip.kind!=='text');
  const ready=media.every(clip=>this.players.get(clip.id)?.ready);
  const ids=videos.map(clip=>clip.id);
  if(!ready)this.remember();
  for(const entry of this.players.values()){
   const clip=active.find(item=>item.id===entry.id),track=clip&&editor.nativeTracks.find(row=>row.id===clip.track);
   const audible=!!clip&&ready&&this.playing;
   entry.active=!!clip;
   if(clip?.kind==='video'){const rect=clip.nativeTransform||{x:0,y:0,width:1,height:1};Object.assign(entry.media.style,{left:rect.x*100+'%',top:rect.y*100+'%',width:rect.width*100+'%',height:rect.height*100+'%',opacity:clip.opacity/100,zIndex:String(editor.nativeTracks.findIndex(row=>row.id===clip.track)+1)});}
   entry.media.style.visibility=clip?.kind==='video'&&ready?'visible':'hidden';
   studioEditSetGain(entry.media,audible&&!track.muted?clip.volume/100:0);
   if(audible){if(entry.media.paused){const generation=++entry.playGeneration;entry.media.play().catch(()=>{if(!this.closed&&this.playing&&entry.playGeneration===generation){entry.failed=true;this.fail();}});}}else{entry.playGeneration++;entry.media.pause();}
  }
  if(ready){this.displayed=ids;this.buffer.hidden=true;const context=this.buffer.getContext('2d');context?.clearRect(0,0,this.buffer.width,this.buffer.height);}
  const captions=active.filter(clip=>clip.kind==='text').map(clip=>clip.text||''),key=JSON.stringify(captions);
  if(key!==this.captionKey){this.captionKey=key;this.captions.replaceChildren(...captions.map(text=>{const item=document.createElement('div');item.className='native-edit-caption';item.textContent=text;return item;}));}
 }
 pause(){this.playing=false;for(const entry of this.players.values()){entry.playGeneration++;entry.media.pause();}}
 fail(){this.pause();referenceCutStop();toast(studioEditCopy().playbackFailed);}
 release(entry){
  entry.ticket++;entry.playGeneration++;if(entry.frame!==null&&entry.media.cancelVideoFrameCallback)entry.media.cancelVideoFrameCallback(entry.frame);
  entry.media.pause();entry.media.removeEventListener('loadeddata',entry.loaded);entry.media.removeEventListener('seeked',entry.decoded);entry.media.removeEventListener('error',entry.error);
  studioEditReleaseGain(entry.media);entry.media.removeAttribute('src');entry.media.load();entry.media.remove();
 }
 dispose(){if(this.closed)return;this.closed=true;for(const entry of this.players.values())this.release(entry);this.players.clear();}
}
