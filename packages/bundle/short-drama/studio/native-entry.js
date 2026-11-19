/* The native creation entry reuses the complete Studio UI; only execution and persistence cross the bridge. */
'use strict';
if(new URLSearchParams(location.search).get('entry')==='1'){
 document.documentElement.dataset.studioEntry='true';
 clearTimeout(saveTimer);
 save=function(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist(),200);};
 let studioEntryBusy=false,studioEntryReading=false;
 const entryKeys=['referenceCreationSpec','referenceMode','referenceDrama','referenceOptions','referenceAdaptation','referenceScriptInput','referenceEntryDrafts',
  'referenceStyleFavorites','referenceStyleRecent','referenceCustomStyles','referenceProductionEpisodes','referenceLanguage','referenceEntrySources',
  'referenceInteractiveSettings','referenceInteractiveOptions','referenceEntryCreationDrafts','referenceEntryMedia','referenceCreateKind','referenceVideoModel','referenceEntryVideo','referenceEntryImage','referenceCreationPolicy','drafts'];
 function entryStorage(){const value={};for(const key of entryKeys)if(S[key]!==undefined)value[key]=S[key];return {'crewon-studio-demo-v1':JSON.stringify(value)};}
 const oldEntry=studioNativeConfig.document.storage['crewon-studio-demo-v1'];
 let savedEntry={};try{if(oldEntry)savedEntry=JSON.parse(oldEntry);}catch(error){throw new Error('创作草稿无法读取，请保留原始数据并重试');}
 S.drafts=savedEntry.drafts||{};S.referenceEntryDrafts=savedEntry.referenceEntryDrafts||{};
 if(!oldEntry){S.drafts={};S.referenceEntryDrafts={};if(studioNativeConfig.entryDraft)referenceSetEntryInput(S,studioNativeConfig.entryDraft);}
 S.referenceEntrySources||=[];S.referenceLanguage||='zh-CN';S.referenceCustomStyles||=[];
 for(const style of S.referenceCustomStyles)if(!referenceSettingCatalog.style.some(item=>item.name===style.name))referenceSettingCatalog.style.push(style);
 persist=function(){studioNativePost('save',{storage:entryStorage()});};
 rememberProject=function(){};
 const nativeEntryHome=studioNativeEntryHome;
 home=function(){referenceSection='home';return nativeEntryHome();};
 const baseUpload=referenceUploadHtml;
 referenceUploadHtml=function(mode){
  if(mode!=='redraw')return baseUpload(mode);
  const sources=S.referenceEntrySources.filter(item=>item.kind==='video');
  return `<div class="ref-upload studio-entry-video"><div class="ref-import-actions"><button class="ref-import-primary" data-action="ref-upload">${I('upload')}选择视频</button></div>${sources.length?`<div class="studio-entry-video-list">${sources.map(item=>`<article><video controls preload="metadata" src="/api/studio-entry-source?id=${encodeURIComponent(item.id)}"></video><div><strong>${esc(item.name)}</strong><small>${Math.ceil(item.seconds)} 秒</small></div><button data-action="entry-remove-video:${item.id}" aria-label="移除 ${esc(item.name)}">${I('close')}</button></article>`).join('')}</div>`:'<p>拖入原片，保留剧情与镜头，重新生成画面</p><small>支持 MP4、MOV，可上传多集，每集最长 5 分钟</small>'}</div>`;
 };
 const languages=[['zh-CN','中文'],['en','英语'],['ja','日语'],['ko','韩语'],['es','西班牙语'],['pt','葡萄牙语']];
 function languageControl(){return `<label class="studio-entry-language"><span>输出语言</span><select aria-label="输出语言">${languages.map(([id,name])=>`<option value="${id}" ${S.referenceLanguage===id?'selected':''}>${name}</option>`).join('')}</select></label>`;}
 const baseEntryHome=home;
 home=function(){let html=baseEntryHome();
  if(S.referenceDrama==='redraw'){
   html=html.replace(/<button[^>]*data-ref-setting="episodes"[\s\S]*?<\/button>/,languageControl());
   html=html.replace(/disabled(?=\s*aria-label="开始转绘")/,'');
  }
  if(S.referenceMode==='drama'&&['adapt','write'].includes(S.referenceDrama)&&S.referenceScriptInput){
   const source=S.referenceScriptInput;
   html=html.replace('<div class="ref-input-wrap">',`<div class="ref-input-wrap"><div class="studio-entry-source-chip"><button data-action="ref-paste">${I('file')}${esc(source.name)} · ${source.text.length.toLocaleString()} 字</button><button data-action="ref-remove-script" aria-label="移除原稿">${I('close')}</button></div>`);
  }
  return html;
 };
 const originalStylePanel=referenceStylePanel,originalStyleResults=referenceStyleResults;
 referenceStylePanel=function(){let html=originalStylePanel();if(referenceSettingsPanel.styleTab==='own')html=html.replace('<div class="ref-style-grid"',`<button class="studio-entry-new-style" data-action="entry-style-new">${I('plus')}新建风格</button><div class="ref-style-grid"`);return html;};
 referenceStyleResults=function(){
  const panel=referenceSettingsPanel;if(panel.styleTab!=='own')return originalStyleResults();
  const styles=S.referenceCustomStyles.filter(item=>(panel.category==='全部'||item.categories.includes(panel.category))&&item.name.toLowerCase().includes(panel.query.toLowerCase()));
  return styles.length?styles.map(item=>`<div class="ref-style-card"><button class="ref-style-choose" data-action="ref-style-pick:${referenceSettingCatalog.style.findIndex(style=>style.name===item.name)}" aria-label="${esc(item.name)}"><img src="${esc(item.image)}" alt=""><strong>${esc(item.name)}</strong></button><button class="studio-entry-edit-style" data-action="entry-style-edit:${encodeURIComponent(item.name)}" aria-label="编辑 ${esc(item.name)}">${I('edit')}</button></div>`).join(''):'<div class="ref-settings-empty"><p>还没有自定义风格，先新建一个</p></div>';
 };
 function editEntryStyle(name){
  const existing=S.referenceCustomStyles.find(item=>item.name===name);referenceCloseSettings(false);
  const root=showDialog(existing?'编辑风格':'新建风格',`<form id="studio-custom-style"><label>风格名称<input name="name" maxlength="40" required value="${esc(existing?.name||'')}"></label><label>创作描述<textarea name="prompt" maxlength="4000" required placeholder="描述画面材质、色彩、光线与需要避免的特征…">${esc(existing?.prompt||'')}</textarea></label><label>分类<select name="category">${['真人风格','2D风格','3D风格'].map(value=>`<option ${existing?.categories.includes(value)?'selected':''}>${value}</option>`).join('')}</select></label><label>参考图（可选）<input type="file" name="image" accept=".png,.jpg,.jpeg,.webp"></label><p role="alert" id="studio-custom-style-error"></p><button class="ref-import-primary" type="submit">保存风格</button></form>`,'');
  const form=root.querySelector('form');
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(!form.reportValidity())return;
   const error=root.querySelector('[role="alert"]'),button=form.querySelector('[type="submit"]');button.disabled=true;
   try{
    const label=form.elements.name.value.trim(),prompt=form.elements.prompt.value.trim();
    if(!label||!prompt)throw new Error('请填写名称和创作描述');
    if(S.referenceCustomStyles.some(item=>item.name===label&&item!==existing)||referenceSettingCatalog.style.some(item=>item.name===label&&!S.referenceCustomStyles.includes(item)))throw new Error('该风格名称已存在');
    let image=existing?.image||'assets/stills.png',sourceId=existing?.sourceId;
    const file=form.elements.image.files?.[0];
    if(file){const response=await fetch('/api/studio-entry-source?name='+encodeURIComponent(file.name),{method:'POST',headers:{'content-type':file.type},body:file});const record=await response.json();if(!response.ok)throw new Error(record.error||'参考图保存失败');sourceId=record.id;image='/api/studio-entry-source?id='+encodeURIComponent(record.id);S.referenceEntrySources.push({id:record.id,name:record.name,kind:'style',seconds:0});}
    const value={name:label,prompt,categories:[form.elements.category.value],image,sourceId};
    if(existing){const index=S.referenceCustomStyles.indexOf(existing);S.referenceCustomStyles[index]=value;const at=referenceSettingCatalog.style.indexOf(existing);if(at>=0)referenceSettingCatalog.style[at]=value;}
    else{S.referenceCustomStyles.push(value);referenceSettingCatalog.style.push(value);}
    S.referenceOptions.style=label;S.referenceStyleRecent=[label,...S.referenceStyleRecent.filter(item=>item!==label)].slice(0,20);closeDialog();render();save();
   }catch(failure){error.textContent=failure.message||'风格保存失败';button.disabled=false;}
  });
 }
 const oldAdaptationPanel=referenceAdaptationPanel;
 referenceAdaptationPanel=function(){const html=oldAdaptationPanel();return S.referenceAdaptation.mode==='overseas'?html.slice(0,-6)+languageControl()+'</div>':html;};
 const entryRender=render;
 render=function(){entryRender();
  const start=document.querySelector('.ref-start-button');
  if(start){const redraw=S.referenceMode==='drama'&&S.referenceDrama==='redraw';start.disabled=studioEntryBusy||studioEntryReading||!referenceEntryCanStart()||(redraw?!S.referenceEntrySources.some(item=>item.kind==='video'):!referenceEntryInput(S).trim());}
  if(!document.querySelector('.studio-entry-library')){
   const button=document.createElement('button');button.className='studio-entry-library';button.setAttribute('aria-label','项目库');button.innerHTML=I('folder');button.onclick=()=>studioNativePost('overview');document.body.append(button);
  }
 };
 async function importEntryFiles(files,mediaMode=null){
  if(studioEntryBusy||studioEntryReading)return;
  studioEntryReading=true;render();
  try{
   for(const file of files){
    const response=await fetch('/api/studio-entry-source?name='+encodeURIComponent(file.name),{method:'POST',headers:{'content-type':file.type||'application/octet-stream'},body:file});
    const record=await response.json();if(!response.ok)throw new Error(record.error||'素材导入失败');
    if(record.kind==='script'){S.referenceScriptInput={text:record.text,name:record.name,source:'file',id:record.id};S.referenceEntrySources=S.referenceEntrySources.filter(item=>item.kind!=='script');}
    S.referenceEntrySources.push({id:record.id,name:record.name,kind:record.kind,seconds:record.seconds});
    if(mediaMode&&record.kind!=='script'){
     const type=record.kind==='video'?'视频':'图片',url=URL.createObjectURL(file);let metadata;
     try{metadata=await referenceCollectionProbe(file,url,type);}finally{URL.revokeObjectURL(url);}
     const frame=-Date.now();referenceInstallUpload({frame,blob:file});S.referenceEntryMedia??={};
     (S.referenceEntryMedia[mediaMode]??=[]).push({id:record.id,sourceId:record.id,frame,type,title:record.name,...metadata,createdAt:new Date().toISOString()});
    }
   }
   save();
  }catch(error){toast(error.message||'素材导入失败，原稿保持不变');}
  finally{studioEntryReading=false;render();}
 }
 referenceScriptFilePicker=function(){
  const mediaMode=referenceEntryMediaMode(),video=S.referenceMode==='drama'&&S.referenceDrama==='redraw';
  const picker=document.createElement('input');picker.type='file';picker.accept=mediaMode?'.png,.jpg,.jpeg,.webp,.mp4,.mov':video?'.mp4,.mov':'.txt,.md,.doc,.docx';picker.multiple=video||!!mediaMode;picker.hidden=true;document.body.append(picker);
  picker.onchange=()=>{const files=[...picker.files||[]];picker.remove();if(files.length)void importEntryFiles(files,mediaMode);};picker.click();
 };
 const beforeEntryAction=handleAction;
 handleAction=function(action){const [key,...args]=String(action).split(':'),value=args.join(':');
  if(studioEntryBusy&&key!=='ref-close-setting')return;
  if(key==='ref-upload'){referenceScriptFilePicker();return;}
  if(key==='entry-style-new'){editEntryStyle();return;}
  if(key==='entry-style-edit'){editEntryStyle(decodeURIComponent(value));return;}
  if(key==='entry-remove-video'){S.referenceEntrySources=S.referenceEntrySources.filter(item=>item.id!==value);render();save();return;}
  if(key==='ref-remove-script'){S.referenceEntrySources=S.referenceEntrySources.filter(item=>item.kind!=='script');}
  if(['ref-start','ref-start-confirm','start'].includes(key)){
   const brief=referenceEntryInput(S),mode=S.referenceMode==='drama'?S.referenceDrama:S.referenceMode==='create'?referenceEntryKind(S).id:'interactive',source=S.referenceMode==='drama'&&mode!=='redraw'?S.referenceScriptInput:null;
   const selectedStyle=referenceSettingCatalog.style.find(item=>item.name===S.referenceOptions.style);
   const files=S.referenceEntrySources.filter(item=>S.referenceMode!=='drama'?referenceEntryMediaItems(S.referenceMode).some(ref=>ref.sourceId===item.id):item.kind==='style'?item.id===selectedStyle?.sourceId:mode==='redraw'?item.kind==='video':item.kind==='script'&&item.id===source?.id);
   if(!referenceEntryCanStart()){toast('请先选择可用模型并补齐所需参考');return;}
   if(studioEntryReading||(mode==='redraw'?!files.length:!brief.trim())){toast(mode==='redraw'?'先导入需要转绘的视频':'先填写内容或导入剧本');return;}
   const style=referenceSettingCatalog.style.find(item=>item.name===S.referenceOptions.style);
   const options=mode==='write'?S.referenceOptions:{style:S.referenceOptions.style,ratio:S.referenceOptions.ratio};
   const spec={category:S.referenceMode,mode,options,adaptation:mode==='adapt'?S.referenceAdaptation:null,
    productionEpisodes:mode==='produce'?(S.referenceProductionEpisodes||'自动分析'):null,
    language:mode==='redraw'||(mode==='adapt'&&S.referenceAdaptation.mode==='overseas')?S.referenceLanguage:null,
    style:style?{name:style.name,categories:style.categories,prompt:style.prompt||''}:null,original:source?.text||'',
    sources:files,interactive:S.referenceInteractiveOptions||null,creation:{drafts:{[mode]:S.referenceEntryCreationDrafts?.[mode]||{}},references:referenceEntryMediaItems(S.referenceMode),kind:S.referenceCreateKind||'agent',policy:S.referenceCreationPolicy,video:S.referenceEntryVideo||null,image:S.referenceEntryImage||null,videoModel:S.referenceVideoModel||null}};
   const task={write:'根据故事需求创作剧本',adapt:({rewrite:'根据原稿和要求改写剧本',continue:'延续原稿续写后续剧情',overseas:'将原稿改编为目标语言和受众的剧本'})[S.referenceAdaptation.mode],produce:'解析完整剧本，规划分集并保存资产和分镜候选',redraw:'解析原片镜头和剧情，按风格与输出语言制定转绘方案',image:'根据创作输入和参考制作图片候选',video:'根据创作输入、模型和参考制作视频候选',audio:'根据声音输入和所选模型制作音频候选',interactive:'根据故事设置创建带分支和结局的互动剧本候选'}[mode]||'根据用户输入制定创作方案';
   const text=((mode==='produce'?source?.name:brief.trim())||files.map(item=>item.name).join('、'))+'\n\n[crewon-studio-input:v1]\n执行目标：'+task+'。先通过项目工具保存可审阅的剧本、资产或分镜候选；付费生成前使用宿主审批，不伪造生成结果。不要只在聊天里回答而不保存项目结果。\n用户确认的完整创作输入：\n'+JSON.stringify(spec);
   S.referenceCreationSpec={stylePrompt:style?.prompt||'',genre:options.genre||'默认题材',style:options.style==='风格'?'自动匹配':options.style,ratio:options.ratio,episodes:mode==='adapt'?S.referenceAdaptation.episodes:mode==='produce'?S.referenceProductionEpisodes:options.episodes};
   studioEntryBusy=true;render();studioNativePost('entry-submit',{text,storage:entryStorage(),sourceIds:files.map(item=>item.id)});return;
  }
  return beforeEntryAction(action);
 };
 document.addEventListener('dragover',event=>{if(event.target.closest('.ref-composer'))event.preventDefault();});
 document.addEventListener('drop',event=>{if(!event.target.closest('.ref-composer'))return;event.preventDefault();void importEntryFiles([...event.dataTransfer.files],referenceEntryMediaMode());});
 document.addEventListener('change',event=>{if(event.target.matches('.studio-entry-language select')){S.referenceLanguage=event.target.value;save();}});
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.data?.channel!=='crewon-studio-v1')return;
  if(event.data.type==='entry-status'){studioEntryBusy=event.data.busy;render();if(event.data.error)toast(event.data.error);}
  if(event.data.type==='error'){studioEntryBusy=false;render();}
 });
 const style=document.createElement('style');style.textContent=`
 html[data-studio-entry] .ref-header,html[data-studio-entry] .ref-recent,html[data-studio-entry] .ref-discover,html[data-studio-entry] .director-inline,html[data-studio-entry] .ref-demo-note{display:none!important}
 html[data-studio-entry] #app{min-height:100vh}html[data-studio-entry] .ref-home{min-height:100vh;box-sizing:border-box;display:grid;align-content:center;padding:40px 32px 72px}html[data-studio-entry] .ref-start{width:min(780px,100%);margin:0 auto}
 #studio-custom-style{display:grid;gap:14px;padding:8px;min-width:min(420px,80vw)}#studio-custom-style label{display:grid;gap:6px;font-size:13px}#studio-custom-style input,#studio-custom-style textarea,#studio-custom-style select{background:#222;color:#eee;border:1px solid #444;border-radius:8px;padding:8px;font:inherit}#studio-custom-style textarea{min-height:120px}.studio-entry-new-style{margin:8px 20px;width:120px;padding:6px;border:1px solid #555;border-radius:6px;background:transparent;color:inherit;cursor:pointer}.studio-entry-new-style svg,.studio-entry-edit-style svg{width:14px;height:14px}.studio-entry-edit-style{position:absolute;right:8px;top:8px;background:#222;border:0;border-radius:6px;color:#fff;padding:5px;cursor:pointer}
 .studio-entry-library{position:fixed;top:12px;right:12px;width:32px;height:28px;border:0;border-radius:6px;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}.studio-entry-library svg{width:16px;height:16px}
 .studio-entry-video-list{display:flex;gap:12px;max-height:180px;overflow:auto;margin-top:12px}.studio-entry-video-list article{display:flex;align-items:center;gap:10px;min-width:320px;position:relative}.studio-entry-video-list video{width:180px;height:102px;object-fit:contain}.studio-entry-video-list strong,.studio-entry-video-list small{display:block;font-size:12px}.studio-entry-video-list article>button{border:0;background:transparent;color:inherit;cursor:pointer}.studio-entry-video-list article>button svg{width:14px}
 .studio-entry-language{display:flex;gap:8px;align-items:center;font-size:13px;color:#aaa}.studio-entry-language select{background:#262626;color:inherit;border:0;padding:4px}.studio-entry-source-chip{position:absolute;top:8px;left:78px;right:16px;display:flex;gap:8px}.studio-entry-source-chip button{border:0;border-radius:6px;background:#333;color:#ddd;font-size:12px;padding:4px 8px;cursor:pointer}.studio-entry-source-chip svg{width:12px;height:12px}.ref-input-wrap:has(.studio-entry-source-chip) textarea{padding-top:50px}
 `;document.head.append(style);
 for(const item of Object.values(S.referenceEntryMedia||{}).flat()){fetch('/api/studio-entry-source?id='+encodeURIComponent(item.sourceId)).then(async response=>{if(!response.ok)throw new Error('创作参考恢复失败');referenceInstallUpload({frame:item.frame,blob:await response.blob()});}).catch(error=>toast(error.message));}
 window.addEventListener('pagehide',()=>persist());
 S.screen='home';referenceSection='home';render();
}
