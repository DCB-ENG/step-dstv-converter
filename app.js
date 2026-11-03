import { StepViewer } from './viewer.js';
const $=id=>document.getElementById(id);
let viewer=null;
let worker,busy=false,ready=false,serial=0,currentText=null,mesh=null,analysis=null,view='iso';
const orientations=()=>({length_axis:$('length-axis').value,up_axis:$('up-axis').value});
const outputFields=['part-mark','quantity','grade','mode','profile','orientation-confirmed'];
const defaultFaceGuide=$('face-guide').textContent;
const sampleLabel=()=>({MITRE_WEB:'mitred I (web)',MITRE_FLANGE:'mitred I (flange)',COPE_SINGLE:'single end cope',COPE_ROUND:'rounded end cope',COPE_DOUBLE:'copes at both ends'}[$('sample-family').value]??$('sample-family').value);
const inputKind=()=>$('input-kind').value;
const dxfOptions=()=>({units:$('dxf-units').value,cutting_layer:$('cutting-layer').value,thickness_mm:Number($('plate-thickness').value)});
function eligible(){return ready&&!busy&&viewer?.available&&analysis&&$('mitre-tolerance').checkValidity()&&(!analysis.mitres||analysis.mitres.comparison_mm===Number($('mitre-tolerance').value))&&$('orientation-confirmed').checked&&$('export-form').checkValidity();}
function controls(){
  for(const id of ['input-kind','dxf-units','plate-thickness','cutting-layer'])$(id).disabled=!ready||busy;
  for(const id of ['step-file','sample-plain','sample-holes','sample-family'])$(id).disabled=!ready||busy;
  for(const id of ['length-axis','up-axis'])$(id).disabled=!currentText||busy||inputKind()==='plate-dxf';
  for(const id of ['part-mark','quantity','grade','mode'])$(id).disabled=busy;
  $('mitre-tolerance').disabled=!ready||busy||inputKind()!=='section'||Boolean(analysis?.end_copes?.length);
  $('recheck-tolerance').disabled=!ready||busy||!currentText||!$('mitre-tolerance').checkValidity();
  $('orientation-confirmed').disabled=!analysis||busy||!viewer?.available;
  $('profile').disabled=!analysis||busy;
  $('export').disabled=!eligible();
  for(const id of ['viewer-fit','viewer-reset','viewer-zoom-in','viewer-zoom-out'])$(id).disabled=!mesh||!viewer?.available;
}
function invalidate(){ $('result').hidden=true;$('nc1').textContent='';controls(); }
function setBusy(on,message='Reading and checking geometry…') {busy=on;$('busy').hidden=!on;$('busy-message').textContent=message;controls();}
function status(message,kind=''){$('status').textContent=message;$('status').className='status '+kind;}
function reset(){analysis=null;mesh=null;view='iso';viewer?.clear();for(const b of document.querySelectorAll('[data-view]')){b.hidden=false;b.classList.toggle('active',b.dataset.view==='iso');}$('profile').value='';$('face-guide').textContent=defaultFaceGuide;$('orientation-confirmed').checked=false;$('hole-details').hidden=true;$('slot-details').hidden=true;$('cope-details').hidden=true;$('measurements').replaceChildren();$('verification').textContent='No geometry has been verified.';invalidate();}
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
      const tube=['RHS','SHS'].includes(analysis.family),channel=analysis.family==='PFC',isection=analysis.family==='I';
      const fields=[['Section',analysis.family+' · '+mm(analysis.height_mm)+' × '+mm(analysis.width_mm)],['Length',mm(analysis.length_mm)],[channel||isection?'Flange / web':tube?'Wall':'Leg thickness',channel||isection?mm(analysis.wall_mm)+' / '+mm(analysis.web_mm):mm(analysis.wall_mm)],[tube?'Outside radius':isection?'Root radius':'Root / toe radius',tube?mm(analysis.outer_radius_mm):isection?mm(analysis.inner_radius_mm):mm(analysis.inner_radius_mm)+' / '+mm(analysis.toe_radius_mm)],['Round holes',String(analysis.holes.length)],['Edge slots',String(analysis.edge_slots.length)]];
      if(analysis.family==='PLATE')fields.splice(0,fields.length,['Plate face',mm(analysis.length_mm)+' × '+mm(analysis.height_mm)],['Thickness',mm(analysis.wall_mm)],['Round through-holes',String(analysis.holes.length)],['Internal through-contours',String(analysis.internal_contours)]);
      if(analysis.end_copes?.length)fields.push(['End copes',String(analysis.end_copes.length)]);
      if(analysis.mitres){
        fields[1][0]='Overall finished length';
        const angles=analysis.mitres.angles_deg.map(x=>(Math.abs(x)<0.0005?0:x).toFixed(3)+'°');
        fields.push(['Start · web / flange',angles[0]+' / '+angles[2]],['End · web / flange',angles[1]+' / '+angles[3]],['Minimum length along X',mm(analysis.mitres.minimum_generator_length_mm)],['Comparison tolerance',String(analysis.mitres.comparison_mm)+' mm']);
      }
      for(const [label,value]of fields){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('measurements').append(row);}
      status(analysis.mitres&&analysis.mitres.comparison_mm!==0.02?`Geometry accounted for at ${analysis.mitres.comparison_mm} mm · ready for your orientation check`:'Geometry accounted for · ready for your orientation check','success');$('verification').textContent=analysis.verification;
      $('face-guide').textContent=tube?'X starts at the near end. v/h are −Y/+Y; o/u are +Z/−Z. Opposite tube faces keep the same transverse direction.':isection?'I-section: V is the −Y web; H is its back for review only. O/U are the top/bottom flanges. Web coordinates rise from the bottom; both flange coordinates run from +Y toward −Y. X starts at the same member end on all three working faces.':channel?'V is the inside web; O/U are the flanges. H is the web back for review, not a machining face. Views and origins follow the detected web orientation.':'V is the vertical (longer) leg; U is the horizontal leg. Transverse coordinates start at the detected heel. U-face DSTV X = length − model X. Review both legs.';
      if(analysis.mitres)$('face-guide').textContent+=' Mitres: X=0 is the nearest finished point, shared by all faces. Review both cut directions. No kerf or trim allowance is added.';
      if(analysis.end_copes?.length)$('face-guide').textContent+=' End copes: X=0 stays at the retained square web end. Flange outlines can start beyond that nominal origin. The coordinate table shows each back-wall X and web-floor q. Cope checks use fixed 0.002 mm comparison; the mitre control does not change it. No kerf or automatic relief is added.';
      if(analysis.family==='PLATE')$('face-guide').textContent='Plate V is the face toward −Y. NC1 X/q start at the minimum X/up of the enclosing rectangle. X increases right, q increases up in the face-on V view. No kerf is added. Check this origin and cutting direction. Camera movement does not change coordinates. Plate checks use a fixed 0.002 mm total budget; the mitre control applies to I-sections only.';
      for(const b of document.querySelectorAll('[data-view]'))b.hidden=b.dataset.view!=='iso'&&!analysis.working_faces.some(f=>f.face===b.dataset.view);
      showHoles(analysis.holes);showSlots();showCopes();viewer?.setModel(mesh,analysis);if(analysis.family==='PLATE'||analysis.end_copes?.length)selectView('v');controls();
    }else if(data.type==='exported'){
      $('nc1').textContent=data.text;$('result').hidden=false;
      const url=URL.createObjectURL(new Blob([data.text],{type:'text/plain;charset=us-ascii'}));
      const link=document.createElement('a');link.href=url;link.download=data.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      status(`NC1 generated from the current solid${analysis.mitres?' at '+analysis.mitres.comparison_mm+' mm comparison tolerance':''}. ProCAM/machine validation remains separate.`,'success');
    }
  };
  worker.onerror=event=>{ready=false;analysis=null;setBusy(false);status('The geometry worker stopped. Reload this page before trying another file. '+event.message,'error');$('engine-status').textContent='ENGINE STOPPED';};
}
function load(text,{sample,name,detectOrientation=false}={}){
  if(!ready||busy)return;
  if(!$('mitre-tolerance').reportValidity())return;
  toleranceHadAnalysis=false;
  reset();if(text!==undefined)currentText=text;else if(sample!==undefined)currentText=null;
  $('file-name').textContent=name??$('file-name').textContent;
  $('source-note').textContent=sample!==undefined?($('sample-family').value.startsWith('MITRE_')?'Synthetic sharp-root I mitres · custom dimensions, not a catalogue UB/UC.':'Analytic sample · synthetic geometry, not an uploaded job.'):'Local file · not uploaded or stored by this converter.';
  setBusy(true);status('Reading STEP surfaces and verifying stock/cut geometry…');
  worker.postMessage({id:++serial,type:'load',text:currentText,sample,family:$('sample-family').value,inputKind:inputKind(),dxfOptions:dxfOptions(),orientation:orientations(),detectOrientation,mitreToleranceMm:Number($('mitre-tolerance').value)});
}
async function fileInput(file){
  if(!file||busy)return;
  if(!/\.(step|stp|dxf)$/i.test(file.name)||file.size>10*1024*1024){reset();currentText=null;status('Choose a .step, .stp or .dxf file up to 10 MiB (DXF core limit 2 MiB).','error');controls();return;}
  if(/\.dxf$/i.test(file.name)){$('input-kind').value='plate-dxf';$('dxf-fields').hidden=false;}
  else if(inputKind()==='plate-dxf'){$('input-kind').value='plate-step';$('dxf-fields').hidden=true;}
  try {$('length-axis').value='x';$('up-axis').value='z';load(await file.text(),{name:file.name,detectOrientation:true});}catch(error){reset();currentText=null;status(String(error),'error');controls();}
}
$('step-file').addEventListener('change',event=>fileInput(event.target.files[0]));
for(const [id,holes]of [['sample-plain',false],['sample-holes',true]])$(id).addEventListener('click',()=>{const plate=$('sample-family').value.startsWith('PLATE_');if(plate){if(inputKind()!=='plate-dxf')$('input-kind').value='plate-step';$('length-axis').value='x';$('up-axis').value='z';}else $('input-kind').value='section';$('dxf-fields').hidden=inputKind()!=='plate-dxf';load(undefined,{sample:holes,name:`Analytic ${sampleLabel()} sample`});});
for(const id of ['input-kind','dxf-units','plate-thickness','cutting-layer'])$(id).addEventListener('input',()=>{$('dxf-fields').hidden=inputKind()!=='plate-dxf';reset();status('Input settings changed · Apply & recheck, or choose a file/sample.');controls();});
$('sample-family').addEventListener('change',()=>{for(const [id,label]of [['sample-plain','Plain'],['sample-holes','Drilled']])$(id).textContent=`${label} ${sampleLabel()} sample ↗`;});
for(const id of ['length-axis','up-axis'])$(id).addEventListener('change',()=>load(currentText));
let toleranceHadAnalysis=false;
$('mitre-tolerance').addEventListener('input',()=>{
  toleranceHadAnalysis=toleranceHadAnalysis||Boolean(analysis);
  const retainedMesh=mesh;reset();
  if(retainedMesh){mesh=retainedMesh;viewer?.setModel(mesh,null);}
  status('Tolerance changed · apply and recheck before exporting.');
  $('verification').textContent='The selected tolerance has not been verified against this solid.';controls();
});
$('recheck-tolerance').addEventListener('click',()=>{load(currentText,{detectOrientation:!toleranceHadAnalysis});toleranceHadAnalysis=false;});
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
function showCopes(){
  const copes=analysis.end_copes??[];$('cope-details').hidden=!copes.length;$('copes').replaceChildren();if(!copes.length)return;
  const rows=copes.map(c=>[c.end,c.face,c.length_mm,c.depth_mm,c.relief_radius_mm,c.end==='start'?c.length_mm:analysis.length_mm-c.length_mm,c.face==='o'?analysis.height_mm-c.depth_mm:c.depth_mm]);
  const table=document.createElement('table');
  for(const row of [['End','Flange','Setback (mm)','Depth (mm)','Relief R (mm)','Back-wall X (mm)','Web-floor q (mm)'],...rows]){const tr=document.createElement('tr');for(const value of row){const td=document.createElement(table.childElementCount?'td':'th');td.textContent=typeof value==='number'?value.toFixed(3):value;tr.append(td);}table.append(tr);}$('copes').append(table);
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
