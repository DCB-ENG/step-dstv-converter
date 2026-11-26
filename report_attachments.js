// Explicit local report attachments. This module never sends data or changes
// geometry. Original File bytes are kept separate from automatic diagnostics.
import {zipStored} from './nc1_zip.js?build=8d3b837c0a41';
export const MAX_SOURCE_BYTES=10*1024*1024,MAX_SCREENSHOT_BYTES=8*1024*1024;
export function sourceFilename(file){
  const extension=String(file?.name??'').match(/\.(step|stp|dxf|nc1)$/i)?.[1].toLowerCase();
  if(!extension||!Number.isInteger(file.size)||file.size<0||file.size>MAX_SOURCE_BYTES)throw Error('Choose a STEP, DXF or NC1 file up to 10 MiB.');
  return `source.${extension}`;
}
export function reportZip(files){
  if(!Array.isArray(files)||!files.length||files.length>3)throw Error('Report ZIP requires 1–3 files.');
  const names=new Set();let total=0;
  for(const {filename,data}of files){
    const role=filename.startsWith('source.')?'source':filename;
    if(!/^(solidcraft-diagnostic-report\.txt|screenshot\.png|source\.(step|stp|dxf|nc1))$/.test(filename)||names.has(role)||!(data instanceof Uint8Array))throw Error('Invalid report attachment.');
    const limit=filename.startsWith('source.')?MAX_SOURCE_BYTES:filename==='screenshot.png'?MAX_SCREENSHOT_BYTES:1024*1024;
    if(data.length>limit||(total+=data.length)>20*1024*1024)throw Error('Report attachments exceed the local ZIP limit.');
    names.add(role);
  }
  return zipStored(files);
}
const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.size<=MAX_SCREENSHOT_BYTES?resolve(blob):reject(Error('Screenshot could not be saved within 8 MiB.')),'image/png'));
async function imageFrom(blob){
  const url=URL.createObjectURL(blob),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('The image could not be read.'));image.src=url;});return image;}
  finally{URL.revokeObjectURL(url);}
}
export async function screenshotFile(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file?.type)||file.size>MAX_SCREENSHOT_BYTES)throw Error('Choose a PNG, JPEG or WebP screenshot up to 8 MiB.');
  const image=await imageFrom(file);
  if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>16000000)throw Error('Screenshot exceeds 16 million pixels.');
  const scale=Math.min(1,1920/image.naturalWidth,1080/image.naturalHeight),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return png(canvas);
}
function drawGuides(ctx,model,x,y,width){
  const overlay=document.getElementById('viewer-overlay');if(!overlay)return;
  const scale=width/(model.clientWidth||model.width);
  const point=label=>[x+parseFloat(label.style.left)*scale,y+parseFloat(label.style.top)*scale];
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  for(const label of overlay.querySelectorAll('.face-tag')){
    if(label.hidden)continue;const [px,py]=point(label);if(!Number.isFinite(px+py))continue;
    ctx.fillStyle='#f58b32';ctx.beginPath();ctx.arc(px,py,11*scale,0,2*Math.PI);ctx.fill();ctx.fillStyle='#101216';ctx.font=`600 ${12*scale}px sans-serif`;ctx.fillText(label.textContent,px,py);
  }
  const arrow=overlay.querySelector('.origin-arrow');
  if(arrow&&arrow.style.display!=='none'){
    const line=arrow.querySelector('line');
    if(line){
      const a=[x+Number(line.getAttribute('x1'))*scale,y+Number(line.getAttribute('y1'))*scale],b=[x+Number(line.getAttribute('x2'))*scale,y+Number(line.getAttribute('y2'))*scale];
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      if(Number.isFinite(length)&&length>1e-6){
        const ux=dx/length,uy=dy/length,tip=9*scale;ctx.strokeStyle='#f58b32';ctx.fillStyle='#f58b32';ctx.lineWidth=1.4*scale;
        ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.beginPath();ctx.arc(...a,3*scale,0,2*Math.PI);ctx.fill();
        ctx.beginPath();ctx.moveTo(...b);ctx.lineTo(b[0]-tip*ux+tip*.4*uy,b[1]-tip*uy-tip*.4*ux);ctx.lineTo(b[0]-tip*ux-tip*.4*uy,b[1]-tip*uy+tip*.4*ux);ctx.closePath();ctx.fill();
      }
    }
  }
  ctx.fillStyle='#f0b060';ctx.font=`${10*scale}px monospace`;
  for(const label of overlay.querySelectorAll('.origin-label')){if(label.hidden)continue;const [px,py]=point(label);if(Number.isFinite(px+py))ctx.fillText(label.textContent,px,py);}
  ctx.restore();
}
export async function capturePreview(prepare=()=>{}){
  const $=id=>document.getElementById(id),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=860;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Screenshot capture is unavailable in this browser.');
  ctx.fillStyle='#11161c';ctx.fillRect(0,0,1200,860);ctx.fillStyle='#eef1f4';ctx.font='600 22px sans-serif';ctx.fillText('SolidCraftDSTV · converter preview',24,34);
  ctx.font='15px sans-serif';ctx.fillText(($('file-name')?.textContent??'No file selected').slice(0,140),24,64);
  prepare(); // Render WebGL and copy synchronously before its buffer is cleared.
  const svg=$('dxf-preview'),model=$('preview');
  if(svg&&!svg.hasAttribute('hidden')&&svg.getAttribute('viewBox')){
    const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width','1152');clone.setAttribute('height','600');clone.removeAttribute('hidden');
    const originals=svg.querySelectorAll('path'),copies=clone.querySelectorAll('path');
    originals.forEach((path,i)=>{const style=getComputedStyle(path);for(const name of ['fill','stroke','stroke-width','vector-effect','opacity'])copies[i].setAttribute(name,style.getPropertyValue(name));});
    const image=await imageFrom(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));ctx.drawImage(image,24,88,1152,600);
  }else if(model&&!model.hidden&&model.width&&model.height){
    const scale=Math.min(1152/model.width,600/model.height),w=model.width*scale,h=model.height*scale,x=24+(1152-w)/2,y=88+(600-h)/2;
    ctx.drawImage(model,x,y,w,h);drawGuides(ctx,model,x,y,w);
  }
  const lines=[$('status')?.textContent,$('viewer-caption')?.textContent,$('viewer-error')?.hidden?'':$('viewer-error')?.textContent,
    ...['step-preview-note','dxf-preview-note'].map(id=>$(id)?.hidden?'':$(id)?.textContent)].filter(Boolean);
  ctx.fillStyle='#f0b060';ctx.font='16px sans-serif';let y=718;
  for(const text of lines){for(const line of String(text).match(/.{1,125}(?:\s|$)|.{1,125}/g)??[]){if(y>840)break;ctx.fillText(line.trim(),24,y);y+=23;}if(y>840)break;}
  return png(canvas);
}
