// Deterministic uncompressed ZIP for validated NC1 or report files.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function header(length){const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);return {bytes,u16:(offset,n)=>view.setUint16(offset,n,true),u32:(offset,n)=>view.setUint32(offset,n,true)};}
export function nc1Zip(files){
  if(!Array.isArray(files)||!files.length||files.length>16)throw Error('ZIP requires 1–16 NC1 parts.');
  const names=new Set(),encoder=new TextEncoder();let total=0;
  const entries=files.map(file=>{
    if(!/^[A-Za-z0-9_-]{1,70}\.nc1$/.test(file.filename)||names.has(file.filename.toLowerCase()))throw Error('Unsafe or duplicate NC1 filename.');
    if(typeof file.text!=='string'||!/^[\x00-\x7f]*$/.test(file.text))throw Error('NC1 must be ASCII.');
    const data=encoder.encode(file.text);total+=data.length;
    if(data.length>1024*1024||total>16*1024*1024)throw Error('NC1 ZIP exceeds the output budget.');
    names.add(file.filename.toLowerCase());
    return {filename:file.filename,data};
  });
  return zipStored(entries);
}
// Callers supply unique, safe filenames and bound the entry count and sizes.
export function zipStored(files){
  const chunks=[],central=[],encoder=new TextEncoder();let offset=0;
  for(const {filename,data}of files){
    const name=encoder.encode(filename),crc=crc32(data),local=header(30);
    local.u32(0,0x04034b50);local.u16(4,20);local.u16(12,33);local.u32(14,crc);local.u32(18,data.length);local.u32(22,data.length);local.u16(26,name.length);
    chunks.push(local.bytes,name,data);
    const dir=header(46);dir.u32(0,0x02014b50);dir.u16(4,20);dir.u16(6,20);dir.u16(14,33);dir.u32(16,crc);dir.u32(20,data.length);dir.u32(24,data.length);dir.u16(28,name.length);dir.u32(42,offset);central.push(dir.bytes,name);offset+=30+name.length+data.length;
  }
  const centralSize=central.reduce((n,c)=>n+c.length,0),end=header(22);end.u32(0,0x06054b50);end.u16(8,files.length);end.u16(10,files.length);end.u32(12,centralSize);end.u32(16,offset);
  const output=new Uint8Array(offset+centralSize+22);let cursor=0;for(const chunk of [...chunks,...central,end.bytes]){output.set(chunk,cursor);cursor+=chunk.length;}return output;
}
