/* Makeup selections refer to immutable presets; browsing state never enters candidate inputs. */
'use strict';
const makeupCategories=['现代·人设','古装·人设','剧情·节点','年代·风格','特效·设定','我的'];
function makeupValues(values={}){return {category:makeupCategories[0],selectedId:'',protectStyle:true,protectBackground:true,scrolls:{},...values};}
function makeupItems(custom=[]){return [...makeupCatalog,...custom];}
function makeupSelected(values,custom=[]){return makeupItems(custom).find(item=>item.id===values.selectedId)||null;}
/** Capture the selected preset version and protections without copying custom image bytes. */
function makeupSnapshot(values,custom=[]){const d=makeupValues(values),item=makeupSelected(d,custom);if(!item)throw new Error('A makeup preset must be selected');return {makeupVersion:1,presetId:item.id,presetName:item.name,presetCategory:item.category,presetVersion:item.version,protectStyle:d.protectStyle,protectBackground:d.protectBackground};}
