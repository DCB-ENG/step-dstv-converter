import { StepViewer } from './viewer.js';
const $=id=>document.getElementById(id);
let viewer=null;
let worker,busy=false,ready=false,serial=0,currentText=null,mesh=null,analysis=null,view='iso';
const orientations=()=>({length_axis:$('length-axis').value,up_axis:$('up-axis').value});
const outputFields=['part-mark','quantity','grade','mode','profile','orientation-confirmed'];
const defaultFaceGuide=$('face-guide').textContent;
function eligible(){return ready&&!busy&&viewer?.available&&analysis&&$('orientation-confirmed').checked&&$('export-form').checkValidity();}
function controls(){
  for(const id of ['step-file','sample-plain','sample-holes','sample-family'])$(id).disabled=!ready||busy;
  for(const id of ['length-axis','up-axis'])$(id).disabled=!currentText||busy;
  for(const id of ['part-mark','quantity','grade','mode'])$(id).disabled=busy;
  $('orientation-confirmed').disabled=!analysis||busy||!viewer?.available;
  $('profile').disabled=!analysis||busy;
  $('export').disabled=!eligible();
  for(const id of ['viewer-fit','viewer-reset','viewer-zoom-in','viewer-zoom-out'])$(id).disabled=!mesh||!viewer?.available;
}
function invalidate(){ $('result').hidden=true;$('nc1').textContent='';controls(); }
function setBusy(on,message='Reading and checking geometry…') {busy=on;$('busy').hidden=!on;$('busy-message').textContent=message;controls();}
function status(message,kind=''){$('status').textContent=message;$('status').className='status '+kind;}
function reset(){analysis=null;mesh=null;view='iso';viewer?.clear();for(const b of document.querySelectorAll('[data-view]')){b.hidden=false;b.classList.toggle('active',b.dataset.view==='iso');}$('profile').value='';$('face-guide').textContent=defaultFaceGuide;$('orientation-confirmed').checked=false;$('hole-details').hidden=true;$('slot-details').hidden=true;$('measurements').replaceChildren();$('verification').textContent='No geometry has been verified.';invalidate();}
function startWorker(){
  worker=new Worker('./worker.js',{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='ready'){ready=true;$('engine-status').textContent='WASM ENGINE READY';controls();return;}
    if(data.id!==serial)return;
    setBusy(false);
    if(data.type==='error'){if(data.text!==undefined)currentText=data.text;if(data.mesh){mesh=data.mesh;$('empty').hidden=true;viewer?.setModel(mesh,null);}status(data.message,'error');controls();return;}
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
      showHoles(analysis.holes);showSlots();viewer?.setModel(mesh,analysis);controls();
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
function selectView(name){view=name;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b.dataset.view===name);viewer?.setView(name);}
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>selectView(button.dataset.view));
$('viewer-fit').addEventListener('click',()=>viewer?.fit());
$('viewer-reset').addEventListener('click',()=>selectView('iso'));
$('viewer-zoom-in').addEventListener('click',()=>viewer?.zoom(1.25));
$('viewer-zoom-out').addEventListener('click',()=>viewer?.zoom(1/1.25));
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
function viewerFailure(message){
  $('viewer-error').textContent=message;$('viewer-error').hidden=false;controls();
}
try {
  viewer=new StepViewer($('preview'),$('viewer-overlay'),$('viewer-caption'),viewerFailure);
}catch(error){
  viewerFailure('3D preview unavailable. Enable WebGL 2 in your browser, then reload. '+error.message);
}
startWorker();controls();
