/** Produce an original equirectangular color grid without third-party imagery. */
import {writeFile} from 'node:fs/promises';
import {deflateSync,crc32} from 'node:zlib';
const width=2048,height=1024,colors=[[58,103,178],[186,160,47],[185,75,65],[58,151,128]];
const rows=Buffer.alloc(height*(width*3+1));
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const color=colors[Math.floor(x/512)%4],grid=x%128<3||y%128<3,horizon=Math.abs(y-height/2)<4,shade=.45+.55*(1-Math.abs(y-height/2)/(height/2));
 const pixel=grid?[235,235,235]:horizon?[255,255,255]:color.map(value=>Math.floor(value*shade));
 for(let channel=0;channel<3;channel++)rows[y*(width*3+1)+1+x*3+channel]=pixel[channel];
}
function chunk(tag,data){const name=Buffer.from(tag),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
await writeFile(new URL('panorama-calibration.png',import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]));
