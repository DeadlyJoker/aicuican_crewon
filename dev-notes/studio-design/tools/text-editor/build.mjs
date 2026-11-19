/** Bundle the maintained editor for the standalone, offline-capable design Demo. */
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
const out=new URL('../../vendor/text-editor/',import.meta.url);
await mkdir(out,{recursive:true});
await build({entryPoints:[new URL('editor.js',import.meta.url).pathname],outfile:new URL('editor.js',out).pathname,bundle:true,format:'iife',globalName:'CrewONRichText',platform:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
await build({entryPoints:[new URL('import-docx.js',import.meta.url).pathname],outfile:new URL('import-docx.js',out).pathname,bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'eof'});
const store=new URL('node_modules/.pnpm/',import.meta.url),licenses=[];
for(const folder of await readdir(store)){
 if(!folder.includes('@')||folder.startsWith('@esbuild+'))continue;
 const name=folder.slice(0,folder.lastIndexOf('@')).replace('+','/'),root=new URL(folder+'/node_modules/'+name+'/',store),pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
 if(pkg.name==='esbuild'||pkg.name.startsWith('@types/'))continue;
 const files=(await readdir(root)).filter(file=>/^(?:licen[sc]e|copying)/i.test(file));
 if(!files.length)files.push('README.md');
 const notices=await Promise.all(files.map(file=>readFile(new URL(file,root),'utf8')));
 licenses.push(pkg.name+' '+pkg.version+' ('+pkg.license+')\n\n'+notices.join('\n\n'));

}
await writeFile(new URL('LICENSES.txt',out),licenses.join('\n\n---\n\n')+'\n');
