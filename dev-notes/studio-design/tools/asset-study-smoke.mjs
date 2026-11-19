/** The visual reference project imports only the observed images and keeps empty assets empty. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const source=await readFile(new URL('../asset-study-fixture.js',import.meta.url),'utf8');
function fixture(){return JSON.parse(vm.runInNewContext(source+'\nJSON.stringify(makeStudioAssetStudy())'));}
test('reference project keeps imported images distinct from ungenerated variants',()=>{
 const data=fixture(),nodes=data.nodes,ids=new Set(nodes.map(n=>n.id));
 assert.equal(ids.size,30);
 assert.equal(nodes.filter(n=>n.kind==='character').length,13);
 assert.equal(nodes.filter(n=>n.kind==='scene').length,10);
 assert.equal(nodes.filter(n=>n.assetCategory==='prop').length,6);
 assert.equal(nodes.filter(n=>n.candidates?.length).length,2);
 for(const n of nodes.filter(n=>n.variantOf)){assert.ok(ids.has(n.variantOf));assert.equal(n.referenceOnly,true);assert.deepEqual(n.candidates,[]);}
 for(const [from,to] of data.edges){assert.ok(ids.has(from));assert.ok(ids.has(to));}
 assert.match(nodes[0].scriptDocument.legacyText,/未复制原项目剧本/);
});
test('reference project instances do not share mutable asset or episode data',()=>{
 const a=fixture(),b=fixture();a.nodes[1].title='changed';a.nodes[0].scriptSeries.sharedAssetIds.length=0;
 assert.equal(b.nodes[1].title,'林彻');assert.equal(b.nodes[0].scriptSeries.sharedAssetIds.length,29);
});
