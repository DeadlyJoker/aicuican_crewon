/** Opening independent tool surfaces must not refit the user's canvas camera. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../canvas-creation.js',import.meta.url),'utf8');
const start=source.indexOf('function frameCanvasNodeControls(){'),end=source.indexOf("document.addEventListener('toggle'",start),frame=source.slice(start,end);
for(const type of ['node-tool-panel','compact-tool-panel','appearance-panel','ref-face-panel','makeup-panel','pose-panel'])test(`${type} fits the panel without changing pan, zoom or saving a camera move`,()=>{
 const S={selected:'image',pan:{x:127,y:17},zoom:.9},before=JSON.stringify(S);let positioned=0;
 const panel={matches:selector=>selector.split(',').includes('.'+type)},context=vm.createContext({S,document:{getElementById:()=>({}),querySelector:selector=>selector==='.canvas-creation'?panel:{}},canvasCreationNode:()=>({id:'image'}),positionCanvasNodeOverlays(){positioned++;},applyCamera(){throw Error('camera changed');},save(){throw Error('camera saved');}});
 vm.runInContext(frame,context);context.frameCanvasNodeControls();assert.equal(JSON.stringify(S),before);assert.equal(positioned,1);
});
