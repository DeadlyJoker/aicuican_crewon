/* Explicit mention completion is staged in the existing storyboard edit form. */
'use strict';
let referenceStoryboardCompletion=null;
/** Match only the current unselected mention, excluding email addresses and prior lines. */
function referenceStoryboardMentionQuery(value,caret,end=caret){
 if(caret!==end)return null;
 const prefix=value.slice(0,caret),match=/(?:^|[^A-Za-z0-9_@])@([^\s@]*)$/u.exec(prefix);
 return match?{start:caret-match[1].length-1,end:caret,query:match[1]}:null;
}
function referenceCloseStoryboardCompletion(){const state=referenceStoryboardCompletion;if(state){state.menu.remove();for(const name of ['aria-controls','aria-activedescendant','aria-autocomplete'])state.input.removeAttribute(name);}referenceStoryboardCompletion=null;}
function referenceChooseStoryboardMention(index){
 const state=referenceStoryboardCompletion,asset=state?.assets[index];if(!asset||!state.input.isConnected)return;
 const input=state.input,range=referenceStoryboardMentionQuery(input.value,input.selectionStart,input.selectionEnd);
 if(!range||range.start!==state.start||range.end!==state.end){referenceCloseStoryboardCompletion();return;}
 input.setRangeText('@'+asset.title+(/\s/.test(input.value[state.end]||'')?'':' '),state.start,state.end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));referenceCloseStoryboardCompletion();input.focus({preventScroll:true});
}
function referenceUpdateStoryboardCompletion(input){
 referenceCloseStoryboardCompletion();if(!referenceStoryboardEdit)return;
 const range=referenceStoryboardMentionQuery(input.value,input.selectionStart,input.selectionEnd);if(!range)return;
 const {start,end,query}=range;
 const assets=studioSeriesAssetsFor(nodeById(referenceWorkbench.nodeId),'all').filter(a=>a.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const menu=document.createElement('div');menu.className='ref-sb-mention-menu';menu.id='ref-sb-mention-options';menu.setAttribute('role','listbox');menu.setAttribute('aria-label','引用素材');
 menu.innerHTML=assets.map((a,index)=>{const c=studioAdoptedCandidate(a);return `<button role="option" id="ref-sb-mention-option-${index}" aria-selected="${index===0}" data-sb-mention-option="${index}"><span class="${c&&!a.referenceOnly?'still frame'+c.frame:''}"></span><strong>${esc('@'+a.title)}</strong><small>${a.kind==='character'?'角色':a.kind==='scene'?'场景':'道具'} · ${c&&!a.referenceOnly?'v'+c.number:'暂无参考图'}</small></button>`}).join('')||'<p role="status">没有匹配的素材</p>';
 document.getElementById('modal-root').append(menu);
 referenceStoryboardCompletion={menu,input,assets,start,end,index:0};input.setAttribute('aria-controls',menu.id);input.setAttribute('aria-autocomplete','list');if(assets.length)input.setAttribute('aria-activedescendant','ref-sb-mention-option-0');
 referencePositionStoryboardCompletion();
}
/** Follow text-area growth and owner scrolling without dismissing a pending keyboard choice. */
function referencePositionStoryboardCompletion(){
 const state=referenceStoryboardCompletion;if(!state)return;
 const {menu,input}=state,r=input.getBoundingClientRect();
 if(!input.isConnected||r.bottom<0||r.top>innerHeight){referenceCloseStoryboardCompletion();return;}
 const width=Math.min(Math.max(r.width,240),320,innerWidth-24),below=innerHeight-r.bottom-12,above=r.top-12,height=Math.min(240,Math.max(80,below,above));
 menu.style.width=width+'px';menu.style.maxHeight=height+'px';menu.style.left=Math.max(12,Math.min(innerWidth-width-12,r.left))+'px';
 menu.style.top=Math.max(12,Math.min(innerHeight-menu.offsetHeight-12,below>=menu.offsetHeight?r.bottom+4:r.top-menu.offsetHeight-4))+'px';
}
document.addEventListener('input',event=>{if(!event.isComposing&&event.target.matches('[data-sb-field],[data-sb-group-prompt]'))referenceUpdateStoryboardCompletion(event.target);});
document.addEventListener('compositionstart',event=>{if(event.target.matches('[data-sb-field],[data-sb-group-prompt]'))referenceCloseStoryboardCompletion();});
document.addEventListener('compositionend',event=>{if(event.target.matches('[data-sb-field],[data-sb-group-prompt]'))referenceUpdateStoryboardCompletion(event.target);});
document.addEventListener('keyup',event=>{if(!event.isComposing&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)&&event.target.matches('[data-sb-field],[data-sb-group-prompt]'))referenceUpdateStoryboardCompletion(event.target);});
document.addEventListener('click',event=>{const option=event.target.closest('[data-sb-mention-option]');if(option){event.preventDefault();event.stopImmediatePropagation();referenceChooseStoryboardMention(Number(option.dataset.sbMentionOption));}else if(!event.target.closest('.ref-sb-mention-menu')&&!event.target.matches('[data-sb-field],[data-sb-group-prompt]'))referenceCloseStoryboardCompletion();},true);
window.addEventListener('keydown',event=>{
 const state=referenceStoryboardCompletion;if(!state)return;
 if(event.isComposing||event.key==='Process')return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();referenceCloseStoryboardCompletion();return;}
 if(event.key==='Tab'){referenceCloseStoryboardCompletion();return;}
 if(['ArrowDown','ArrowUp','Enter'].includes(event.key)){
  event.preventDefault();event.stopImmediatePropagation();if(!state.assets.length)return;
  if(event.key==='Enter'){referenceChooseStoryboardMention(state.index);return;}
  state.index=(state.index+(event.key==='ArrowDown'?1:state.assets.length-1))%state.assets.length;
  state.input.setAttribute('aria-activedescendant','ref-sb-mention-option-'+state.index);
  state.menu.querySelectorAll('[role=option]').forEach((option,index)=>{option.setAttribute('aria-selected',String(index===state.index));if(index===state.index){const top=option.offsetTop,bottom=top+option.offsetHeight;if(top<state.menu.scrollTop)state.menu.scrollTop=top;else if(bottom>state.menu.scrollTop+state.menu.clientHeight)state.menu.scrollTop=bottom-state.menu.clientHeight;}});
 }
},true);
window.addEventListener('resize',referenceCloseStoryboardCompletion);
document.addEventListener('scroll',event=>{if(referenceStoryboardCompletion&&!referenceStoryboardCompletion.menu.contains(event.target))referencePositionStoryboardCompletion();},true);
