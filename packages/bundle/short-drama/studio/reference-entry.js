/* Screenplay import uses the same local modal host and persists only confirmed source text. */
'use strict';
function referenceUploadHtml(mode){
 if(mode==='redraw')return `<div class="ref-upload"><button class="ref-import-primary" data-action="ref-upload">${I('plus')}上传视频</button><p>拖入原片，保留剧情与镜头，重新生成画面</p><small>支持 MP4、MOV，可上传多集，每集最长 5 分钟</small></div>`;
 const source=S.referenceScriptInput;
 return `<div class="ref-upload ${source?'has-script':''}">${source?`<div class="ref-imported-script"><button class="ref-script-source" data-action="ref-paste">${I('file')}<span><strong>${esc(source.name||'已粘贴的剧本')}</strong><small>${source.text.length.toLocaleString()} 字 · 点击查看原文</small></span></button>${iconBtn('移除剧本','ref-remove-script','close')}<div class="ref-script-source-actions"><button data-action="ref-upload">重新上传</button><button data-action="ref-paste">粘贴剧本</button></div></div>`:`<div class="ref-import-actions"><button class="ref-import-primary" data-action="ref-upload">${I('plus')}上传剧本</button><button data-action="ref-paste">${I('file')}粘贴剧本</button></div><p>自动分析剧情并规划分集</p><small>支持 TXT、DOC、DOCX、MD，最多 15 万字</small>`}</div>`;
}
function referencePasteDialog(){
 const text=S.referenceScriptInput?.text||'';
 const root=showDialog('粘贴剧本文案',`<p>粘贴完整原稿作为参考，改写和续写要求可在输入框中单独填写。</p><textarea id="ref-script-paste" aria-label="剧本原文" aria-describedby="ref-script-error" placeholder="在此粘贴剧本内容…">${esc(text)}</textarea><p id="ref-script-error" class="ref-script-error" hidden></p>`,`<span id="ref-script-count" role="status">${text.length.toLocaleString()} / 150,000 字</span><span class="top-spacer"></span><button data-action="close-modal">取消</button><button class="ref-import-primary" data-action="ref-import" ${referenceValidateScript(text).ok?'':'disabled'}>导入剧本</button>`);
 root.querySelector('.dialog').classList.add('ref-paste-dialog');root.querySelector('textarea').focus({preventScroll:true});
}
function referenceImportPastedScript(){
 const field=document.getElementById('ref-script-paste'),result=referenceValidateScript(field.value);
 if(!result.ok){referenceScriptError(result.error);return}
 S.referenceScriptInput={text:result.text,name:'已粘贴的剧本',source:'paste'};closeDialog();render();save();
}
function referenceScriptError(message){
 const error=document.getElementById('ref-script-error');if(error){error.hidden=false;error.textContent=message;document.getElementById('ref-script-paste')?.setAttribute('aria-invalid','true')}
}
function referenceScriptFilePicker(){
 let picker=document.getElementById('ref-script-file');
 if(!picker){picker=document.createElement('input');picker.type='file';picker.id='ref-script-file';picker.accept='.txt,.md,.doc,.docx';picker.hidden=true;document.body.append(picker);picker.addEventListener('change',referenceReadScriptFile)}
 picker.value='';picker.click();
}
async function referenceReadScriptFile(event){
 const file=event.target.files?.[0];if(!file)return;
 if(!/\.(txt|md)$/i.test(file.name)){toast('当前 Demo 支持 TXT、MD；Word 文档请复制正文后粘贴');return}
 if(file.size>4*1024*1024){toast('文件过大，请缩短到 150,000 字以内');return}
 let text;try{text=await file.text()}catch(error){toast('无法读取文件，请重试或粘贴剧本');return}
 const result=referenceValidateScript(text);if(!result.ok){toast(result.error);return}
 S.referenceScriptInput={text:result.text,name:file.name,source:'file'};render();save();
}
document.addEventListener('input',event=>{
 if(event.target.id!=='ref-script-paste')return;
 const field=event.target,result=referenceValidateScript(field.value),count=document.getElementById('ref-script-count');
 count.textContent=field.value.length.toLocaleString()+' / 150,000 字';
 document.querySelector('[data-action="ref-import"]').disabled=!result.ok;
 if(field.value.length>referenceScriptLimit)referenceScriptError(result.error);
 else{document.getElementById('ref-script-error').hidden=true;field.setAttribute('aria-invalid','false')}
});
