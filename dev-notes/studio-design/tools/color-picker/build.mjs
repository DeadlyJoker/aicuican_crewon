/** Bundle the maintained color control locally, with its attribution notices. */
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const out=new URL('../../vendor/color-picker/',import.meta.url);
await mkdir(out,{recursive:true});
await build({entryPoints:[new URL('picker.js',import.meta.url).pathname],outfile:new URL('picker.js',out).pathname,bundle:true,format:'iife',platform:'browser',minify:true,legalComments:'eof'});
const root=new URL('node_modules/vanilla-colorful/',import.meta.url);
const notices=await Promise.all(['LICENSE','ACKNOWLEDGMENTS'].map(file=>readFile(new URL(file,root),'utf8')));
await writeFile(new URL('LICENSES.txt',out),'vanilla-colorful 0.7.2\n\n'+notices.join('\n\n').trimEnd()+'\n');
