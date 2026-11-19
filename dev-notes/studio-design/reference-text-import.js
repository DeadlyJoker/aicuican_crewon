/* Imported documents become recoverable text drafts; completion owns the canvas edit. */
'use strict';
const referenceTextImportExtensions=new Set(['txt','md','markdown','csv','tsv','json','jsonl','srt','vtt','log','xml','html','htm','docx']);
const referenceTextImportAttempts=new Map();
/** Read textual documents without interpreting their markup or running embedded content. */
async function referenceReadTextDocument(file,extractDocx){
 const extension=file.name.split('.').at(-1).toLowerCase();
 if(!referenceTextImportExtensions.has(extension))throw new Error('请选择文字文件或 DOCX 文档');
 if(file.size>(extension==='docx'?8:1)*1024*1024)throw new Error(extension==='docx'?'DOCX 文档不能超过 8 MB':'文字文件不能超过 1 MB');
 const bytes=new Uint8Array(await file.arrayBuffer());let text;
 if(extension==='docx')text=await extractDocx(bytes.buffer);
 else{const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}
 text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(text.includes('\0'))throw new Error('文件不是可读取的文字，请另存为 UTF-8 后重试');
 if(text.length>100000)throw new Error('正文不能超过 10 万字，请拆分文件后导入');
 if(!text.trim())throw new Error('文档没有可导入的正文');
 return text;
}
function referenceTextImportVersion(id){const node=nodeById(id);return JSON.stringify([node?.text,node?.richText,S.nodeDrafts[id]?.textEditor]);}
async function referenceImportTextDocument(id,file){
 const node=nodeById(id);if(!node||!referenceNodeEditable(node)||!['text','note'].includes(node.kind))return;
 const project=S.project,before=referenceTextImportVersion(id),attempt=Symbol();referenceTextImportAttempts.set(id,attempt);
 const button=document.querySelector(`[data-text-import="${id}"]`);if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
 try{
  const text=await referenceReadTextDocument(file,async buffer=>{const {extractDocx}=await import('./vendor/text-editor/import-docx.js?v=mammoth-1.13.0');return extractDocx(buffer);});
  if(referenceTextImportAttempts.get(id)!==attempt)return;
  if(S.project!==project||!nodeById(id)||referenceTextImportVersion(id)!==before||referenceTextEditor){toast('编辑状态已变化，原内容保持不变，请重新导入');return;}
  const payload=CrewONRichText.fromText(text);if(payload.text.length>100000)throw new Error('正文不能超过 10 万字，请拆分文件后导入');(S.nodeDrafts[id]??={}).textEditor={version:1,...payload};
  referenceTextOpen(id);
  try{persist();referenceTextMessage('已导入 '+file.name+' · 完成编辑后提交正文');}catch(error){referenceTextMessage('文件已读入当前窗口，保存失败，请复制正文后重试',true);}
 }catch(error){if(referenceTextImportAttempts.get(id)===attempt)toast(error instanceof TypeError?'文件编码或格式无法读取，请检查后重试':error.message||'文档无法读取，原正文保持不变');}
 finally{if(referenceTextImportAttempts.get(id)===attempt){referenceTextImportAttempts.delete(id);const current=document.querySelector(`[data-text-import="${id}"]`);if(current){current.disabled=false;current.removeAttribute('aria-busy');}}}
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-text-import]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();button.parentElement.querySelector('input[type=file]').click();},true);
document.addEventListener('change',event=>{const input=event.target;if(!input.matches('[data-text-import-file]'))return;const file=input.files[0];input.value='';if(file)void referenceImportTextDocument(input.dataset.textImportFile,file);});
