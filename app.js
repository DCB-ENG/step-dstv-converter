const $=id=>document.getElementById(id);
let worker,busy=false,ready=false,serial=0,currentText=null,mesh=null,analysis=null,view='iso';
const orientations=()=>({length_axis:$('length-axis').value,up_axis:$('up-axis').value});
const outputFields=['part-mark','quantity','grade','mode','profile','orientation-confirmed'];
const defaultFaceGuide=$('face-guide').textContent;
function eligible(){return ready&&!busy&&analysis&&$('orientation-confirmed').checked&&$('export-form').checkValidity();}
function controls(){
  for(const id of ['step-file','sample-plain','sample-holes','sample-family'])$(id).disabled=!ready||busy;
  for(const id of ['length-axis','up-axis'])$(id).disabled=!currentText||busy;
  for(const id of ['part-mark','quantity','grade','mode'])$(id).disabled=busy;
  $('orientation-confirmed').disabled=!analysis||busy;
  $('profile').disabled=!analysis||busy;
  $('export').disabled=!eligible();
}
function invalidate(){ $('result').hidden=true;$('nc1').textContent='';controls(); }
function setBusy(on,message='Reading and checking geometry…') {busy=on;$('busy').hidden=!on;$('busy-message').textContent=message;controls();}
function status(message,kind=''){$('status').textContent=message;$('status').className='status '+kind;}
function reset(){analysis=null;mesh=null;view='iso';for(const b of document.querySelectorAll('[data-view]')){b.hidden=false;b.classList.toggle('active',b.dataset.view==='iso');}$('profile').value='';$('face-guide').textContent=defaultFaceGuide;$('orientation-confirmed').checked=false;$('hole-details').hidden=true;$('slot-details').hidden=true;$('measurements').replaceChildren();$('verification').textContent='No geometry has been verified.';invalidate();draw();}
function startWorker(){
  worker=new Worker('./worker.js',{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='ready'){ready=true;$('engine-status').textContent='WASM ENGINE READY';controls();return;}
    if(data.id!==serial)return;
    setBusy(false);
    if(data.type==='error'){if(data.text!==undefined)currentText=data.text;if(data.mesh){mesh=data.mesh;$('empty').hidden=true;draw();}status(data.message,'error');controls();return;}
    if(data.type==='loaded'){
      analysis=data.analysis;mesh=data.mesh;if(data.text!==undefined)currentText=data.text;
      $('length-axis').value=analysis.orientation.length_axis;$('up-axis').value=analysis.orientation.up_axis;
      $('empty').hidden=true;$('profile').value=analysis.suggested_profile;
      const mm=x=>Number(x).toLocaleString(undefined,{maximumFractionDigits:3})+' mm';
      const tube=['RHS','SHS'].includes(analysis.family),channel=analysis.family==='PFC';
      const fields=[['Section',analysis.family+' · '+mm(analysis.height_mm)+' × '+mm(analysis.width_mm)],['Length',mm(analysis.length_mm)],[channel?'Flange / web':tube?'Wall':'Leg thickness',channel?mm(analysis.wall_mm)+' / '+mm(analysis.web_mm):mm(analysis.wall_mm)],[tube?'Outside radius':'Root / toe radius',tube?mm(analysis.outer_radius_mm):mm(analysis.inner_radius_mm)+' / '+mm(analysis.toe_radius_mm)],['Round holes',String(analysis.holes.length)],['Edge slots',String(analysis.edge_slots.length)]];
      for(const [label,value]of fields){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('measurements').append(row);}
      status('Geometry accounted for · ready for your orientation check','success');$('verification').textContent=analysis.verification;
      $('face-guide').textContent=tube?'X starts at the near end. v/h are −Y/+Y; o/u are +Z/−Z. Opposite tube faces keep the same transverse direction.':channel?'V is the inside web; O/U are the flanges. H is the web back for review, not a machining face. Views and origins follow the detected web orientation.':'V is the vertical (longer) leg; U is the horizontal leg. Transverse coordinates start at the detected heel. U-face DSTV X = length − model X. Review both legs.';
      for(const b of document.querySelectorAll('[data-view]'))b.hidden=b.dataset.view!=='iso'&&!analysis.working_faces.some(f=>f.face===b.dataset.view);
      showHoles(analysis.holes);showSlots();draw();controls();
    }else if(data.type==='exported'){
      $('nc1').textContent=data.text;$('result').hidden=false;
      const url=URL.createObjectURL(new Blob([data.text],{type:'text/plain;charset=us-ascii'}));
      const link=document.createElement('a');link.href=url;link.download=data.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      status('NC1 generated from the current solid. ProCAM/machine validation remains separate.','success');
    }
  };
  worker.onerror=event=>{ready=false;analysis=null;setBusy(false);status('The geometry worker stopped. Reload this page before trying another file. '+event.message,'error');$('engine-status').textContent='ENGINE STOPPED';};
}
function load(text,{sample,name,detectOrientation=false}={}){
  if(!ready||busy)return;
  reset();if(text!==undefined)currentText=text;else if(sample!==undefined)currentText=null;
  $('file-name').textContent=name??$('file-name').textContent;
  $('source-note').textContent=sample!==undefined?'Analytic sample · synthetic geometry, not an uploaded job.':'Local STEP file · not uploaded or stored by this converter.';
  setBusy(true);status('Reading STEP surfaces and verifying stock/cut geometry…');
  worker.postMessage({id:++serial,type:'load',text:currentText,sample,family:$('sample-family').value,orientation:orientations(),detectOrientation});
}
async function fileInput(file){
  if(!file||busy)return;
  if(!/\.(step|stp)$/i.test(file.name)||file.size>10*1024*1024){reset();currentText=null;status('Choose a .step or .stp file up to 10 MiB.','error');controls();return;}
  try {$('length-axis').value='x';$('up-axis').value='z';load(await file.text(),{name:file.name,detectOrientation:true});}catch(error){reset();currentText=null;status(String(error),'error');controls();}
}
$('step-file').addEventListener('change',event=>fileInput(event.target.files[0]));
for(const [id,holes]of [['sample-plain',false],['sample-holes',true]])$(id).addEventListener('click',()=>load(undefined,{sample:holes,name:`Analytic ${$('sample-family').value} · ${holes?'round-hole sample':'plain stock'}`}));
$('sample-family').addEventListener('change',()=>{for(const [id,label]of [['sample-plain','Plain'],['sample-holes','Drilled']])$(id).textContent=`${label} ${$('sample-family').value} sample ↗`;});
for(const id of ['length-axis','up-axis'])$(id).addEventListener('change',()=>load(currentText));
for(const id of outputFields)$(id).addEventListener('input',invalidate);
$('export-form').addEventListener('submit',event=>{event.preventDefault();if(!eligible())return;setBusy(true,'Rechecking the current solid and generating NC1…');worker.postMessage({id:++serial,type:'export',options:{part_mark:$('part-mark').value,grade:$('grade').value,quantity:Number($('quantity').value),profile:$('profile').value,mode:$('mode').value,orientation_confirmed:$('orientation-confirmed').checked}});});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('nc1').textContent);$('copy').textContent='Copied';}catch{$('copy').textContent='Select text to copy';}});
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{view=button.dataset.view;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b===button);draw();});
for(const event of ['dragenter','dragover'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();if(ready&&!busy)$('drop-zone').classList.add('dragging');});
for(const event of ['dragleave','drop'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.remove('dragging');if(event==='drop'&&ready&&!busy)fileInput(e.dataTransfer.files[0]);});
function showHoles(holes){
  $('hole-details').hidden=!holes.length;$('holes').replaceChildren();if(!holes.length)return;
  const table=document.createElement('table');
  for(const row of [['Face','X from start (mm)','Y across face (mm)','Diameter (mm)'],...holes.map(h=>[h.face,h.x_mm.toFixed(3),h.y_mm.toFixed(3),h.diameter_mm.toFixed(3)])]){
    const tr=document.createElement('tr');for(const value of row){const td=document.createElement(table.childElementCount?'td':'th');td.textContent=value;tr.append(td);}table.append(tr);
  }$('holes').append(table);
}
function showSlots(){
  const slots=analysis.edge_slots;
  $('slot-details').hidden=!slots.length;$('slots').replaceChildren();
  if(!slots.length)return;
  const rows=slots.map(s=>{
    const x=(s.left_mm+s.right_mm)/2;
    const gap=(s.right_mm-s.left_mm-2*s.radius_mm)/2;
    const width=s.face==='u'?analysis.width_mm:analysis.height_mm;
    return [s.face,s.face==='u'?analysis.length_mm-x:x,s.right_mm-s.left_mm,width-s.center_y_mm+Math.sqrt(s.radius_mm*s.radius_mm-gap*gap),s.radius_mm];
  }).sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]);
  const table=document.createElement('table');
  for(const row of [['Face','DSTV X centre (mm)','Opening width (mm)','Depth from edge (mm)','Root radius (mm)'],...rows.map(r=>r.map(v=>typeof v==='number'?v.toFixed(3):v))]){
    const tr=document.createElement('tr');for(const value of row){const td=document.createElement(table.childElementCount?'td':'th');td.textContent=value;tr.append(td);}table.append(tr);
  }$('slots').append(table);
}
function draw(){
  const canvas=$('preview'),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const W=rect.width,H=rect.height;
  ctx.strokeStyle='#e1e7dc';ctx.lineWidth=1;for(let x=0;x<W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  if(!mesh)return;
  const p=mesh.positions;
  const guide=analysis?.working_faces.find(f=>f.face===view),camera=guide?.view??view;
  const project=v=>camera==='iso'?[.83*v[0]+.56*v[1],-.24*v[0]+.36*v[1]-.9*v[2],-.5*v[0]+.75*v[1]+.43*v[2]]:camera==='v'?[v[0],-v[2],-v[1]]:camera==='h'?[-v[0],-v[2],v[1]]:camera==='o'?[v[0],v[1],v[2]]:[v[0],-v[1],-v[2]];
  const pts=p.map(project),lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
  for(const point of pts){for(let i=0;i<2;i++){lo[i]=Math.min(lo[i],point[i]);hi[i]=Math.max(hi[i],point[i]);}}
  const scale=Math.min((W-85)/(hi[0]-lo[0]||1),(H-100)/(hi[1]-lo[1]||1));
  const screen=v=>[(v[0]-(lo[0]+hi[0])/2)*scale+W/2,(v[1]-(lo[1]+hi[1])/2)*scale+H/2];
  const tris=mesh.triangles.map(t=>({t,z:t.reduce((s,i)=>s+pts[i][2],0)/3})).sort((a,b)=>a.z-b.z);
  for(const {t}of tris){const a=p[t[0]],b=p[t[1]],c=p[t[2]],u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;const light=Math.abs((n[0]*.25+n[1]*-.45+n[2]*.85)/len),shade=Math.round(137+light*65);ctx.fillStyle=`rgb(${shade-16},${shade+5},${shade-7})`;ctx.beginPath();t.forEach((i,k)=>{const s=screen(pts[i]);k?ctx.lineTo(...s):ctx.moveTo(...s);});ctx.closePath();ctx.fill();}
  // Face labels and origin are positioned in the same normalized frame as the analyser.
  const {min,max}=mesh.bounds,mid=min.map((v,i)=>(v+max[i])/2);
  const tags=analysis?analysis.working_faces.filter(f=>view!=='iso'||f.machining).map(f=>[f.face,f.point]):[['v',[mid[0],min[1]-4,mid[2]]],['h',[mid[0],max[1]+4,mid[2]]],['o',[mid[0],mid[1],max[2]+4]],['u',[mid[0],mid[1],min[2]-4]]];
  ctx.font='bold 11px monospace';ctx.textAlign='center';
  for(const [name,pos]of tags){if(view!=='iso'&&view!==name)continue;const s=screen(project(pos));ctx.fillStyle='#284b36';ctx.beginPath();ctx.arc(...s,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f2f7ef';ctx.fillText(name,s[0],s[1]+4);}
  const frame=guide??analysis?.working_faces.find(f=>f.machining),reversed=guide?.x_reversed??false,zero=frame?.origin??[min[0],min[1],min[2]];
  const origin=screen(project(zero)),end=screen(project([reversed?min[0]:max[0],zero[1],zero[2]])),angle=Math.atan2(end[1]-origin[1],end[0]-origin[0]);ctx.fillStyle='#cd7847';ctx.strokeStyle='#cd7847';ctx.beginPath();ctx.moveTo(...origin);ctx.lineTo(...end);ctx.stroke();ctx.beginPath();ctx.moveTo(...end);ctx.lineTo(end[0]-9*Math.cos(angle-.4),end[1]-9*Math.sin(angle-.4));ctx.lineTo(end[0]-9*Math.cos(angle+.4),end[1]-9*Math.sin(angle+.4));ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(...origin,4,0,Math.PI*2);ctx.fill();ctx.textAlign='left';ctx.font='10px monospace';ctx.fillText('DSTV X = 0',Math.max(10,Math.min(origin[0]+8,W-90)),origin[1]+15);ctx.fillText(reversed?'X+ (L-model X)':'X+',end[0]+5,end[1]+15);
  ctx.fillStyle='#647d68';ctx.fillText(view==='iso'?'NORMALIZED MEMBER · MILLIMETRES':`${view} FACE · VIEWED FROM OUTSIDE`,20,H-20);
}
new ResizeObserver(draw).observe($('drop-zone'));
startWorker();draw();
