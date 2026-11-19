/** Copy the pinned upstream viewer and its license without including example photographs. */
import {copyFile,mkdir,readFile} from 'node:fs/promises';
const root=new URL('../../vendor/panorama/',import.meta.url);
const upstream=new URL('./node_modules/pannellum/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('package.json',upstream),'utf8'));
if(manifest.version!=='2.5.7')throw new Error('Unexpected panorama dependency version');
await mkdir(root,{recursive:true});
for(const [from,to] of [['build/pannellum.js','pannellum.js'],['build/pannellum.css','pannellum.css'],['COPYING','COPYING']])await copyFile(new URL(from,upstream),new URL(to,root));
