/** Document imports decode text only and reject unreadable or oversized inputs before staging. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../reference-text-import.js',import.meta.url),'utf8');
const context=vm.createContext({TextDecoder,document:{addEventListener(){}}});vm.runInContext(source,context);
const read=(file,extract=()=>{throw new Error('unexpected DOCX parse');})=>context.referenceReadTextDocument(file,extract);
const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
test('text imports normalize encoding and line endings while preserving markup as text',async()=>{
 const text='<script>alert(1)</script>\r\n角色：林晚';assert.equal(await read(file('story.md',new TextEncoder().encode(text))),text.replace('\r\n','\n'));
 assert.equal(await read(file('story.txt',[255,254,0x41,0,13,0,10,0,0x42,0])),'A\nB');
});
test('DOCX delegates to the maintained extractor and validates the resulting text',async()=>{
 assert.equal(await read(file('story.docx',[1,2,3]),async bytes=>{assert.equal(bytes.byteLength,3);return '第一场\r\n雨夜';}),'第一场\n雨夜');
 await assert.rejects(read(file('empty.docx',[1]),async()=>''),/没有可导入/);
});
test('unsupported binary malformed and oversized documents do not become text drafts',async()=>{
 await assert.rejects(read(file('movie.mp4',[1])),/文字文件/);
 await assert.rejects(read(file('data.txt',[0,1])),/可读取的文字/);
 await assert.rejects(read(file('bad.txt',[255,255])),TypeError);
 await assert.rejects(read({name:'large.txt',size:2*1024*1024,arrayBuffer(){throw new Error('must reject first');}}),/1 MB/);
 await assert.rejects(read(file('large.docx',[1]),async()=> 'a'.repeat(100001)),/10 万字/);
});

test('maintained editor conversion preserves single and paragraph line breaks',async()=>{
 const {fromText}=await import('./text-editor/editor.js');
 for(const text of ['第一行\n第二行','第一段\n\n第二段\n','甲\n\n\n\n乙','<script>只读文字</script>'])assert.equal(fromText(text).text,text);
});
