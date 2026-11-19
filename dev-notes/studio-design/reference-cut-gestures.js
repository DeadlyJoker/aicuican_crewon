/* Drag previews stay in the DOM; only a confirmed release changes the saved timeline. */
'use strict';
let referenceCutDrag=null,referenceCutClickUntil=0;
function referenceCutGesturePaint(owner){if(referenceCutView)referenceCutPaint();else render();}
function referenceCutGestureCleanup(){
 const state=referenceCutDrag;if(!state)return;referenceCutDrag=null;cancelAnimationFrame(state.frame);
 state.ghost?.remove();state.origin?.remove();state.guide?.remove();state.extraRow?.remove();state.group?.classList.remove('is-drag-source');document.body.classList.remove('ref-cut-gesture-active');
 try{state.capture.releasePointerCapture(state.pointerId);}catch(error){/* The browser may already have released this pointer on cancellation. */}
}
function referenceCutCancelGesture(){const state=referenceCutDrag;if(!state)return;referenceCutClickUntil=performance.now()+250;referenceCutGestureCleanup();referenceCutGesturePaint(state.owner);}
function referenceCutGestureTrack(state,point){
 const r=state.scroll.getBoundingClientRect();if(point.clientX<r.left||point.clientX>r.right||point.clientY<r.top+25||point.clientY>r.bottom)return null;
 return [...state.tracks.querySelectorAll('[data-cut-track]')].find(row=>{const box=row.getBoundingClientRect();return point.clientY>=box.top&&point.clientY<=box.bottom;})||null;
}
function referenceCutBeginPreview(state){
 if(state.moved)return;state.moved=true;document.body.classList.add('ref-cut-gesture-active');state.group?.classList.add('is-drag-source');
 if(state.adding&&!state.tracks.querySelector(`[data-cut-track-kind="${referenceCutTrackKind(state.clip)}"]`)){
  const kind=referenceCutTrackKind(state.clip),row=document.createElement('div');row.className='ref-cut-track ref-cut-temporary-track';row.dataset.cutTrack=kind;row.dataset.cutTrackKind=kind;row.innerHTML=`<div class="ref-cut-track-label">${I(kind==='text'?'text':kind==='audio'?'audio-media':'film')}<span>${kind==='text'?'文本':kind==='audio'?'声音':'画面'}</span></div>`;
  const first=state.tracks.querySelector('[data-cut-track]');if(kind==='text'&&first)state.tracks.insertBefore(row,first);else state.tracks.append(row);state.extraRow=row;
 }
 const ghost=document.createElement('div');ghost.className='ref-cut-drag-ghost';ghost.innerHTML=`${state.clip.kind==='text'||state.clip.pending?'':`<span class="ref-cut-ghost-image still frame${state.clip.frame}"></span>`}<div><strong>${esc(state.clip.kind==='text'?state.clip.text:state.clip.name)}</strong><small></small></div>`;state.tracks.append(ghost);state.ghost=ghost;const initialRow=state.tracks.querySelector(`[data-cut-track-kind="${referenceCutTrackKind(state.clip)}"]`);ghost.style.left=180+state.clip.start*state.px+'px';ghost.style.top=(initialRow?.offsetTop||30)+6+'px';ghost.style.width=Math.max(32,state.clip.duration*state.px)+'px';ghost.style.height=state.clip.kind==='text'?'24px':'50px';
 const guide=document.createElement('div');guide.className='ref-cut-drop-guide';guide.hidden=true;state.tracks.append(guide);state.guide=guide;
 if(state.group){const origin=document.createElement('div');origin.className='ref-cut-drag-origin';origin.style.left=180+state.clip.start*state.px+'px';origin.style.top=state.group.parentElement.offsetTop+6+'px';origin.style.width=Math.max(32,state.clip.duration*state.px)+'px';origin.style.height=state.group.offsetHeight+'px';state.tracks.append(origin);state.origin=origin;}
}
function referenceCutPreviewGesture(point){
 const state=referenceCutDrag;if(!state)return;state.last=point;
 if(!state.moved&&Math.abs(point.clientX-state.x)+Math.abs(point.clientY-state.y)<4)return;
 referenceCutBeginPreview(state);const row=referenceCutGestureTrack(state,point);
 if(!row||row.dataset.cutTrackKind!==referenceCutTrackKind(state.clip)){
  state.valid=false;state.ghost.classList.add('is-invalid');state.ghost.querySelector('small').textContent='拖到同类轨道内放置';state.guide.hidden=true;return;
 }
 const scroll=state.scroll.getBoundingClientRect(),start=(point.clientX-scroll.left+state.scroll.scrollLeft-180)/state.px-state.grab;
 const spec=state.mode==='move'?{mode:'move',track:row.dataset.cutTrack,start,snap:!point.altKey,threshold:8/state.px}:{mode:state.mode,delta:(point.clientX-state.x+state.scroll.scrollLeft-state.scrollLeft)/state.px,snap:!point.altKey,threshold:8/state.px};
 const base=state.adding?{...state.editor,clips:[...state.editor.clips,state.clip]}:state.editor,preview=referenceCutGesturePreview(base,state.clip.id,spec);
 state.spec=spec;state.valid=preview.ok;if(!preview.ok){state.ghost.classList.add('is-invalid');state.ghost.querySelector('small').textContent=preview.error;return;}
 state.preview=preview;state.ghost.classList.remove('is-invalid');const clip=preview.clip;
 state.ghost.style.left=180+clip.start*state.px+'px';state.ghost.style.top=row.offsetTop+(clip.kind==='text'?10:6)+'px';state.ghost.style.width=Math.max(32,clip.duration*state.px)+'px';state.ghost.style.height=clip.kind==='text'?'24px':'50px';
 state.ghost.querySelector('small').textContent=(state.mode==='move'?(preview.inserted?'插入':'移动'):state.mode==='start'?'裁剪入点':'裁剪出点')+' · '+referenceCutClock(clip.start)+' → '+referenceCutClock(clip.start+clip.duration);
 state.guide.hidden=preview.guide===null;if(preview.guide!==null)state.guide.style.left=180+preview.guide*state.px+'px';
 for(const next of preview.clips){if(next.id===clip.id)continue;const group=state.tracks.querySelector(`[data-cut-clip="${next.id}"]`);if(group)group.style.left=180+next.start*state.px+'px';}
 state.tracks.style.width=Math.max(state.width,180+(Math.max(referenceCutDuration(state.editor),clip.start+clip.duration)+2)*state.px)+'px';
}
function referenceCutGestureScroll(){
 const state=referenceCutDrag;if(!state?.moved)return;const r=state.scroll.getBoundingClientRect(),point=state.last;if(!point)return;
 const before=state.scroll.scrollLeft,vertical=state.scroll.scrollTop;
 if(point.clientY>=r.top&&point.clientY<=r.bottom){if(point.clientX>r.right-26)state.scroll.scrollLeft+=12;else if(point.clientX<r.left+190)state.scroll.scrollLeft-=12;if(point.clientY>r.bottom-20)state.scroll.scrollTop+=8;else if(point.clientY<r.top+36)state.scroll.scrollTop-=8;}
 if(state.scroll.scrollLeft!==before||state.scroll.scrollTop!==vertical)referenceCutPreviewGesture(point);
 state.frame=requestAnimationFrame(referenceCutGestureScroll);
}
function referenceCutStartGesture(event){
 if(event.button!==0||referenceCutDrag||referenceCutView?.exportOpen)return;
 const group=event.target.closest('[data-cut-clip]'),edge=event.target.closest('[data-cut-edge]'),asset=event.target.closest('[data-cut-add]'),text=event.target.closest('[data-cut-action="add-text"]');
 if(!group&&!asset&&!text)return;const owner=group?referenceCutEventOwner(group):referenceCutOwner();if(!owner)return;
 const root=group?.closest('.ref-cut-workbench,.ref-edit-node')||document.querySelector('.ref-cut-workbench'),timeline=root?.querySelector('.ref-cut-timeline'),scroll=timeline?.querySelector('.ref-cut-track-scroll'),tracks=scroll?.querySelector('.ref-cut-tracks'),ruler=tracks?.querySelector('[data-cut-ruler]');if(!ruler)return;
 const editor=referenceCutRead(owner),px=Number(ruler.dataset.cutPx);let clip;
 if(group)clip=editor.clips.find(c=>c.id===group.dataset.cutClip);
 else if(asset){const n=nodeById(asset.dataset.cutAdd),output=studioAdoptedCandidate(n);if(!output)return;clip=referenceCutSourceClip(n,output,studioScriptId('clip'));}
 else clip={id:studioScriptId('text'),kind:'text',track:'text',name:'默认文本',text:'Default text',start:0,duration:5,sourceIn:0,sourceDuration:5,fontSize:36,scale:100,opacity:100,x:0,y:0,rotation:0};
 if(!clip)return;if(!referenceCutView){S.selected=owner.id;S.panel=null;}referenceCutStop();event.preventDefault();event.stopImmediatePropagation();const capture=edge||event.target.closest('button')||group;
 referenceCutDrag={owner,editor,baseline:JSON.stringify(referenceCutContent(editor)),clip:structuredClone(clip),group,capture,pointerId:event.pointerId,scroll,tracks,px,width:tracks.offsetWidth,scrollLeft:scroll.scrollLeft,x:event.clientX,y:event.clientY,mode:edge?.dataset.cutEdge||'move',adding:!group,moved:false,valid:false,grab:group?(event.clientX-group.getBoundingClientRect().left)/px:clip.duration/2,frame:0,last:null};
 capture.setPointerCapture(event.pointerId);
}
window.addEventListener('pointerdown',referenceCutStartGesture,true);
window.addEventListener('pointermove',event=>{
 const state=referenceCutDrag;if(!state||state.pointerId!==event.pointerId)return;event.preventDefault();event.stopImmediatePropagation();referenceCutPreviewGesture({clientX:event.clientX,clientY:event.clientY,altKey:event.altKey});if(state.moved&&!state.frame)state.frame=requestAnimationFrame(referenceCutGestureScroll);
},true);
window.addEventListener('pointerup',event=>{
 const state=referenceCutDrag;if(!state||state.pointerId!==event.pointerId)return;event.preventDefault();event.stopImmediatePropagation();if(state.moved)referenceCutPreviewGesture({clientX:event.clientX,clientY:event.clientY,altKey:event.altKey});referenceCutClickUntil=performance.now()+250;
 const unchanged=JSON.stringify(referenceCutContent(referenceCutRead(state.owner)))===state.baseline;referenceCutGestureCleanup();
 if(!unchanged){referenceCutGesturePaint(state.owner);toast('草稿已发生其他变化，本次拖动未提交');return;}
 if(!state.moved){if(state.adding)referenceCutCommit(state.owner,{type:'add',clip:state.clip});else{state.owner.editor??=referenceCutEmpty();state.owner.editor.selected=state.clip.id;if(referenceCutView)referenceCutView.propertiesOpen=true;referenceCutGesturePaint(state.owner);save();}return;}
 if(!state.valid){referenceCutGesturePaint(state.owner);toast('未放入有效轨道，原片段保留');return;}
 const command=state.adding?{type:'add-at',clip:state.clip,spec:state.spec}:{type:'gesture',id:state.clip.id,spec:state.spec},result=referenceCutApply(state.owner,command);
 if(!result.ok){referenceCutGesturePaint(state.owner);toast(result.error);return;}
 if(result.changed)S.revision++;referenceCutGesturePaint(state.owner);save();if(result.changed)toast(state.adding?'已将素材加入时间线':state.mode==='move'?'已移动片段，可撤销':'已裁剪片段，可撤销');
},true);
window.addEventListener('click',event=>{if(event.detail&&performance.now()<referenceCutClickUntil&&event.target.closest('[data-cut-select],[data-cut-edge],[data-cut-add],[data-cut-action="add-text"]')){event.preventDefault();event.stopImmediatePropagation();}},true);
window.addEventListener('pointercancel',referenceCutCancelGesture,true);
window.addEventListener('blur',referenceCutCancelGesture);
window.addEventListener('resize',referenceCutCancelGesture);
window.addEventListener('keydown',event=>{
 if(referenceCutDrag&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCutCancelGesture();return;}
 const group=event.target.closest('[data-cut-clip]'),edge=event.target.closest('[data-cut-edge]');if(!group||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
 const owner=referenceCutEventOwner(group),editor=referenceCutRead(owner),clip=editor.clips.find(c=>c.id===group.dataset.cutClip);if(!clip)return;
 event.preventDefault();event.stopImmediatePropagation();const delta=(event.key==='ArrowRight'?1:-1)*(event.shiftKey?10:1)/30,spec=edge?{mode:edge.dataset.cutEdge,delta,snap:false}:{mode:'move',start:clip.start+delta,track:clip.track,snap:false};
 const result=referenceCutApply(owner,{type:'gesture',id:clip.id,spec});if(!result.ok){toast(result.error);return;}if(result.changed)S.revision++;referenceCutGesturePaint(owner);save();document.querySelector(`[data-cut-clip="${clip.id}"] ${edge?'[data-cut-edge="'+edge.dataset.cutEdge+'"]':'[data-cut-select]'}`)?.focus({preventScroll:true});
},true);
