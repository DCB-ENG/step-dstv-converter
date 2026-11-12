import { StepViewer } from './viewer.js?build=c28d2b169b98';
import { DxfPartReview } from './dxf_batch.js?build=c28d2b169b98';
import { nc1Zip } from './nc1_zip.js?build=c28d2b169b98';
import { DxfDrawingPreview } from './dxf_preview.js?build=c28d2b169b98';
import { NC1_OUTPUT_MODE, partMarkFromFilename } from './export_details.js?build=c28d2b169b98';
import { reporting } from './problem_report.js?build=c28d2b169b98';
const BUILD='c28d2b169b98';
const $=id=>document.getElementById(id);
let viewer=null,drawingPreview=null,stepPreviewActive=false;
const selectedCutLayers=new Set();
const partReview=new DxfPartReview();
const partMapView=new DxfDrawingPreview($('dxf-part-map'));
const drawingView=new DxfDrawingPreview($('dxf-preview'));
let worker,busy=false,ready=false,serial=0,currentText=null,mesh=null,analysis=null,view='iso';
const orientations=()=>({length_axis:$('length-axis').value,up_axis:$('up-axis').value});
reporting.settings(()=>({input_kind:$('input-kind').value,...orientations(),mitre_tolerance_mm:Number($('mitre-tolerance').value),tube_reverse_up:$('tube-reverse-up').checked,tube_reverse_length:$('tube-reverse-length').checked,output_mode:NC1_OUTPUT_MODE}));
function sendRequest(request){reporting.begin(request.type);reporting.stage(request.type.startsWith('export')?'export-check':'geometry-check');worker.postMessage(request);}
const outputFields=['part-mark','quantity','grade','grade-custom','profile','orientation-confirmed'];
const markingFields=['si-enabled','si-use-part-mark','si-face','si-text','si-x','si-q','si-angle','si-height','si-width','si-font-confirmed','pu-enabled','pu-face','pu-stroke','pu-points','shaped-holes'];
function resetSiTextLink(){$('si-use-part-mark').checked=true;$('si-text').value='';$('si-font-confirmed').checked=false;}
function syncSiText(){
  let changed=false;
  if($('si-use-part-mark').checked){
    let mark='';try{mark=partReview.options({part_mark:$('part-mark').value}).part_mark;}catch{}
    if($('si-text').value!==mark){$('si-text').value=mark;$('si-font-confirmed').checked=false;changed=true;}
  }
  const text=$('si-text').value;
  $('si-text').setCustomValidity($('si-enabled').checked&&(!text.trim()||!/^[\x20-\x7e]{1,40}$/.test(text))?'SI text needs 1–40 printable characters. Shorten the part mark or enter different SI text.':'');
  if(changed)updateMarkingPreview();
}
function markingRequest(requireFont=false){
  const number=id=>{const v=Number($(id).value);if(!$(id).value.trim()||!Number.isFinite(v))throw new Error('Enter finite marking coordinates and dimensions.');return v;};
  const markings=[];
  if($('si-enabled').checked){
    if(!$('si-text').checkValidity())throw new Error($('si-text').validationMessage);
    if(requireFont&&!$('si-font-confirmed').checked)throw new Error('Confirm that the machine font fits the reserved SI text box.');
    markings.push({kind:'text',face:$('si-face').value,text:$('si-text').value,x_mm:number('si-x'),q_mm:number('si-q'),angle_deg:number('si-angle'),height_mm:number('si-height'),reserved_width_mm:number('si-width')});
  }
  if($('pu-enabled').checked){
    const rows=$('pu-points').value.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split(',').map(v=>v.trim()));
    if(rows.length<4||rows.some(r=>r.length!==3||r.some(v=>!v||!Number.isFinite(Number(v)))))throw new Error('PU needs at least four lines of X, q, signed radius, including the repeated closing point.');
    markings.push({kind:'powder',face:$('pu-face').value,points_mm:rows.map(r=>[Number(r[0]),Number(r[1])]),radii_mm:rows.map(r=>Number(r[2])),stroke_mm:number('pu-stroke')});
  }
  return {markings,shaped_holes:$('shaped-holes').checked};
}
function updateMarkingPreview(){
  $('si-fields').hidden=!$('si-enabled').checked;$('pu-fields').hidden=!$('pu-enabled').checked;
  try{viewer?.setMarkings(markingRequest().markings);$('marking-error').textContent='';}catch(e){viewer?.setMarkings([]);$('marking-error').textContent=e.message;}
}
const defaultFaceGuide=$('face-guide').textContent;
const defaultViewerHelp=$('viewer-help').textContent;
const sampleLabel=()=>({ASSEMBLY:'assembly',EA_HALF_TOE:'EA half-thickness toe',RHS_MAPPING:'RHS coordinate check',CUT_RHS:'RHS machining',CUT_PFC:'PFC machining',CUT_UA:'angle machining',CUT_I:'I machining',MITRE_WEB:'mitred I (web)',MITRE_FLANGE:'mitred I (flange)',MITRE_COMPOUND_START:'compound I (start)',MITRE_COMPOUND_BOTH:'compound I (both ends)',COPE_SINGLE:'single end cope',COPE_ROUND:'rounded end cope',COPE_DOUBLE:'copes at both ends'}[$('sample-family').value]??$('sample-family').value);
const inputKind=()=>$('input-kind').value;
const dxfOptions=()=>({units:$('dxf-units').value,cutting_layers:[...selectedCutLayers],thickness_mm:Number($('plate-thickness').value)});
function eligible(){return ready&&!busy&&viewer?.available&&analysis&&$('mitre-tolerance').checkValidity()&&(!analysis.mitres||analysis.mitres.comparison_mm===Number($('mitre-tolerance').value))&&$('orientation-confirmed').checked&&$('export-form').checkValidity();}
function controls(){
  syncSiText();
  const customGrade=$('grade').value==='__custom__';
  $('grade-custom-field').hidden=!customGrade;$('grade-custom').required=customGrade;$('grade-custom').disabled=!customGrade||busy;
  const multiple=partReview.parts.length>1;
  const assembly=partReview.assembly;
  $('part-kind-label').textContent=assembly?'STEP assembly member':'Detected DXF part';
  $('assembly-note').hidden=!assembly;
  $('dxf-part-map').toggleAttribute('hidden',assembly);
  $('dxf-layout-note').hidden=assembly;
  $('assembly-member-detail').hidden=!assembly;
  $('assembly-member-detail').textContent=assembly?partReview.parts.map(p=>`${p.name}: ${p.error?'BLOCKED · '+p.error:p.analysis.family+' · verified'}${p.path?.length?' · '+p.path.join(' / '):''}`).join('\n'):'';
  document.querySelector('.workspace').classList.toggle('batch-mode',multiple);
  document.querySelector('.workspace').classList.toggle('compound-mode',Boolean(analysis?.mitres?.compound_ends?.some(Boolean)));
  const matching=partReview.groups.filter(g=>g.length>1),combined=multiple&&partReview.combineIdentical;
  $('dxf-identical').hidden=assembly||!multiple||!matching.length;$('dxf-grouping').disabled=busy;$('dxf-grouping').value=combined?'combined':'separate';
  $('dxf-identical-notice').textContent=matching.length===1?`${matching[0].length} identical unmarked parts detected: ${matching[0].map(i=>partReview.parts[i].name).join(', ')}.`:`${matching.length} sets of identical unmarked parts detected.`;
  const outputGroups=combined?partReview.groups:partReview.parts.map((_,i)=>[i]),copies=Number($('quantity').value);
  $('dxf-group-summary').textContent=outputGroups.map(g=>`${partReview.parts[g[0]]?.name}: quantity ${copies*g.length}${combined?` (${g.length} occurrence${g.length===1?'':'s'} × ${copies} drawing set${copies===1?'':'s'})`:''}`).join(' · ');
  $('quantity-label').textContent=combined?'Drawing sets':multiple?'Quantity per part':'Quantity';
  $('export').hidden=combined;
  $('export-batch').textContent=combined?(outputGroups.length===1?'Download combined NC1 ↓':'Download grouped NC1 ZIP ↓'):'Download all parts ZIP ↓';
  $('dxf-parts').hidden=!multiple;$('dxf-part-select').disabled=busy;
  $('part-mark-label').textContent=multiple?'Part mark prefix':'Part mark';$('part-mark').maxLength=multiple?66:70;$('profile').readOnly=multiple;
  $('export-batch').hidden=!multiple;$('batch-export-status').hidden=!multiple;
  let batchReady=false,batchMessage='';
  if(multiple){try{partReview.allOptions(exportRequest());batchReady=Boolean(analysis)&&$('export-form').checkValidity();batchMessage=combined?`${outputGroups.length} unmarked NC1 file${outputGroups.length===1?'':'s'} with detected quantities. Every occurrence will be rechecked.`:'Every part is confirmed. ZIP exports one unmarked NC1 per part.';}catch(e){batchMessage=e.message;}}
  $('batch-export-status').textContent=batchMessage;$('export-batch').disabled=!ready||busy||!viewer?.available||!batchReady;
  for(const [i,option]of [...$('dxf-part-select').options].entries())option.textContent=partReview.parts[i]?.name+(partReview.parts[i]?.error?' · BLOCKED':partReview.confirmed.has(i)?' · confirmed':'');
  let selectedFilename='';if(multiple){try{selectedFilename=' · '+partReview.options({part_mark:$('part-mark').value},combined?partReview.groups.find(g=>g.includes(partReview.activePart))[0]:partReview.activePart).part_mark+'.nc1';}catch{selectedFilename=partReview.parts[partReview.activePart]?.error?' · NC1 blocked for this member':' · enter a valid part-mark prefix';}}
  $('dxf-part-progress').textContent=`${partReview.confirmed.size} / ${partReview.parts.length} part origins confirmed${selectedFilename}`;

  const rawDrawing=inputKind()==='plate-dxf'&&!analysis&&drawingPreview;
  $('viewer-help').textContent=rawDrawing?'DXF drawing only · drag to pan, scroll or use +/− to zoom, Home or Fit to show all outlines. Coordinates are in drawing units; this view is not checked cutting geometry.':defaultViewerHelp;
  $('viewer-reset').textContent=rawDrawing?'Reset drawing':'Reset 3D';
  for(const id of ['input-kind','dxf-units','plate-thickness'])$(id).disabled=!ready||busy;
  for(const box of $('cut-layer-options').querySelectorAll('input'))box.disabled=!ready||busy;
  for(const id of ['step-file','replace-file','sample-plain','sample-holes','sample-family'])$(id).disabled=!ready||busy;
  for(const id of ['length-axis','up-axis'])$(id).disabled=!currentText||busy||inputKind()==='plate-dxf'||Boolean(analysis?.source_frame)||assembly;
  for(const id of ['tube-reverse-up','tube-reverse-length'])$(id).disabled=busy||!analysis?.tube_end_profiles||assembly;
  for(const id of ['part-mark','quantity','grade'])$(id).disabled=busy;
  $('mitre-tolerance').disabled=!ready||busy||inputKind()==='plate-dxf'||analysis?.family==='PLATE'||Boolean(analysis?.end_copes?.length)||Boolean(analysis?.tube_end_profiles)||Boolean(analysis?.section_cuts)||assembly;
  $('recheck-tolerance').disabled=!ready||busy||!currentText||!$('mitre-tolerance').checkValidity()||assembly;
  $('check-dxf').disabled=!ready||busy||!currentText||inputKind()!=='plate-dxf';
  $('orientation-confirmed').disabled=!analysis||busy||!viewer?.available;
  $('profile').disabled=!analysis||busy;
  for(const id of markingFields)$(id).disabled=!analysis||busy;
  $('shaped-holes').closest('label').hidden=analysis?.family!=='PLATE';
  $('export').disabled=!eligible();
  for(const id of ['viewer-fit','viewer-reset','viewer-zoom-in','viewer-zoom-out'])$(id).disabled=!drawingPreview?.bounds&&(!mesh||!viewer?.available);
}
function invalidate(){ $('result').hidden=true;$('nc1').textContent='';controls(); }
function setBusy(on,message='Reading and checking geometry…',blocking=true) {busy=on;$('busy').hidden=!on||!blocking;$('busy-message').textContent=message;controls();}
function recognitionDetails(checks=[]){
  const panel=$('recognition-details'),list=$('recognition-checks');
  list.replaceChildren();panel.hidden=!checks.length;panel.open=false;
  for(const check of checks){
    const row=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p');
    const axis=value=>value.startsWith('-')?value.toUpperCase():'+'+value.toUpperCase();
    title.textContent=`${check.kind} · length ${axis(check.orientation.length_axis)}, up ${axis(check.orientation.up_axis)}`;
    detail.textContent=check.error??'Verified';row.append(title,detail);list.append(row);
  }
}
function status(message,kind='',reported=false){$('status').textContent=message;$('status').className='status '+kind;if(kind==='error'&&!reported)reporting.failure(message);}
function reset({keepDrawing=false,keepParts=false}={}){stepPreviewActive=false;$('step-preview-note').hidden=true;recognitionDetails();if(!keepParts){partReview.clear();partMapView.clear();$('dxf-part-select').replaceChildren();}const retained=keepDrawing?drawingPreview:null;drawingPreview=null;drawingView.clear();$('drop-zone').classList.remove('drawing-mode');$('dxf-preview').toggleAttribute('hidden',true);$('preview').hidden=false;$('dxf-preview-note').hidden=true;$('dxf-layers').hidden=true;$('empty').hidden=false;$('input-detection').hidden=true;$('input-detection').textContent='';for(const id of ['si-enabled','pu-enabled','si-font-confirmed'])$(id).checked=false;$('si-fields').hidden=true;$('pu-fields').hidden=true;$('marking-error').textContent='';analysis=null;mesh=null;view='iso';viewer?.clear();for(const b of document.querySelectorAll('[data-view]')){b.hidden=false;b.classList.toggle('active',b.dataset.view==='iso');}$('profile').value='';$('face-guide').textContent=defaultFaceGuide;$('orientation-confirmed').checked=false;$('hole-details').hidden=true;$('slot-details').hidden=true;$('cope-details').hidden=true;$('tube-orientation').hidden=true;$('coordinate-details').hidden=true;$('measurements').replaceChildren();$('verification').textContent='No geometry has been verified.';if(retained)showDrawing(retained);invalidate();}
function showDrawing(drawing){
  drawingPreview=drawing;$('drop-zone').classList.add('drawing-mode');
  $('preview').hidden=true;$('viewer-error').hidden=true;$('empty').hidden=true;
  $('dxf-preview').toggleAttribute('hidden',false);$('dxf-preview-note').hidden=false;
  for(const b of document.querySelectorAll('[data-view]'))b.hidden=true;
  const shown=drawing?.entities.length??0,omitted=drawing?.omitted??0;
  $('dxf-preview-note').textContent=`DXF DRAWING ONLY · NOT CHECKED · ${shown} outline entities shown${omitted?`, ${omitted} entities not drawn (see layer list)`:''}. Confirm units, thickness and cutting layers before checking. NC1 export is disabled.`;
  $('dxf-layer-summary').replaceChildren();$('dxf-layers').hidden=!drawing;
  showCutLayerChoices(drawing);

  if(drawing?.bounds)drawingView.setDrawing(drawing,dxfOptions().cutting_layers);
  const table=document.createElement('table');
  const rows=[['Layer','Entities','Preview'],...(drawing?.layers??[]).map(layer=>[layer.name,Object.entries(layer.types).map(([type,count])=>`${type}: ${count}`).join(', '),`${layer.drawn} shown / ${layer.omitted} omitted`])];
  for(const [i,row]of rows.entries()){const tr=document.createElement('tr');for(const value of row){const td=document.createElement(i?'td':'th');td.textContent=value;tr.append(td);}table.append(tr);}$('dxf-layer-summary').append(table);
  if(drawing?.warnings.length){const p=document.createElement('p');p.className='hint';p.textContent=drawing.warnings.join(' · ');$('dxf-layer-summary').append(p);}
  if(!drawing?.bounds){$('empty').hidden=false;$('empty').querySelector('h2').textContent='No DXF outlines to display';$('empty').querySelector('p').textContent='See the import message for details. You can replace the drawing or run the geometry check with explicit settings.';return;}
  $('input-detection').hidden=false;$('input-detection').textContent=`DXF drawing preview · ${drawing.declaredUnits?'declares '+drawing.declaredUnits+'; confirm below':'units unconfirmed'}`;
  if(!analysis){$('measurements').replaceChildren();const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent='Drawing span (drawing units)';dd.textContent=(drawing.bounds[2]-drawing.bounds[0]).toFixed(3)+' × '+(drawing.bounds[3]-drawing.bounds[1]).toFixed(3);row.append(dt,dd);$('measurements').append(row);}
}
function showCutLayerChoices(drawing){
  const layers=drawing?.layers??[];
  for(const name of selectedCutLayers)if(!layers.some(layer=>layer.name===name))selectedCutLayers.delete(name);
  $('cut-layer-options').replaceChildren();
  if(!layers.length){const p=document.createElement('p');p.className='hint';p.textContent='No drawing layers are available. Load a readable DXF to choose cutting layers.';$('cut-layer-options').append(p);}
  for(const layer of layers){
    const label=document.createElement('label');label.className='cut-layer-option';
    const box=document.createElement('input');box.type='checkbox';box.value=layer.name;box.checked=selectedCutLayers.has(layer.name);box.setAttribute('aria-label','Cut layer '+layer.name);box.disabled=!ready||busy;
    const description=document.createElement('span'),name=document.createElement('strong'),coverage=document.createElement('small');
    name.textContent=layer.name;coverage.textContent=Object.entries(layer.types).map(([type,count])=>`${type}: ${count}`).join(', ')+(layer.omitted?` · ${layer.omitted} not drawn`:'');description.append(name,coverage);label.append(box,description);
    box.addEventListener('change',()=>{const focused=document.activeElement===box;if(box.checked)selectedCutLayers.add(layer.name);else selectedCutLayers.delete(layer.name);inputSettingsChanged();if(focused)[...$('cut-layer-options').querySelectorAll('input')].find(input=>input.value===layer.name)?.focus({preventScroll:true});});
    $('cut-layer-options').append(label);
  }
  const count=selectedCutLayers.size;
  $('cut-layer-selection').textContent=count?`${count} cutting layer${count===1?'':'s'} selected${count>16?' · maximum 16':''}.`:'No cutting layers selected.';
}
function inputSettingsChanged(){resetTubeSelection();$('dxf-fields').hidden=inputKind()!=='plate-dxf';reset({keepDrawing:inputKind()==='plate-dxf'});status(inputKind()==='plate-dxf'?'DXF settings changed · drawing is not checked. Choose Check DXF & build plate.':'Input settings changed · Apply & recheck, or choose a file/sample.');controls();}
function showDxfParts(data){
  if(data.parts!==undefined)partReview.setParts(data.parts,data.identicalGroups);
  if(partReview.parts.length<2)return;
  partReview.select(data.activePart??0);
  $('dxf-part-select').replaceChildren();
  for(const part of partReview.parts){const option=document.createElement('option');option.value=part.index;option.textContent=part.name;$('dxf-part-select').append(option);}
  $('dxf-part-select').value=String(partReview.activePart);
  $('orientation-confirmed').checked=partReview.confirmed.has(partReview.activePart);
  if(drawingPreview){partMapView.setDrawing(drawingPreview,[...selectedCutLayers]);partMapView.setPartLabels(partReview.parts,$('dxf-units').value,partReview.activePart,selectDxfPart);}
}
function selectDxfPart(index){
  if(busy||index===partReview.activePart)return;
  resetSiTextLink();
  partReview.select(index);resetTubeSelection();reset({keepDrawing:true,keepParts:true});
  setBusy(true,'Opening the selected part…');sendRequest({id:++serial,type:'select-part',index});
}
function exportRequest(requireFont=false){return {part_mark:$('part-mark').value,grade:$('grade').value==='__custom__'?$('grade-custom').value.trim():$('grade').value,quantity:Number($('quantity').value),profile:$('profile').value,mode:NC1_OUTPUT_MODE,orientation_confirmed:$('orientation-confirmed').checked,...markingRequest(requireFont)};}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function resetTubeSelection(){for(const id of ['tube-reverse-up','tube-reverse-length'])$(id).checked=false;}
function startWorker(){
  reporting.begin('engine-start');
  worker=new Worker('./worker.js?build='+BUILD,{type:'module'});
  worker.onmessage=({data})=>{
    if(data.type==='ready'){if(data.build!==BUILD){status('Converter build mismatch · reload this page before converting.','error');reporting.finish('failure');return;}reporting.stage('complete');reporting.finish();ready=true;$('engine-status').textContent='WASM ENGINE READY · '+BUILD;controls();return;}
    if(data.id!==serial)return;
    if(['step-preview','dxf-preview'].includes(data.type)){reporting.stage('preview');if(data.previewError)reporting.failure(data.previewError);if(data.type==='dxf-preview'&&!data.pending)reporting.finish(data.previewError?'failure':'success');}
    if(data.type==='step-progress')reporting.stage('recognition');
    if(['error','part-blocked'].includes(data.type)){
      reporting.failure({message:data.message,name:data.errorName},{code:data.errorCode,checks:data.recognitionChecks});reporting.finish('failure');
    }else if(data.type==='input-required')reporting.finish('input-required');
    else if(['loaded','exported','batch-exported'].includes(data.type)){reporting.stage('complete');reporting.finish();}
    if(data.type==='step-preview'){
      if(data.text!==undefined)currentText=data.text;
      analysis=null;stepPreviewActive=Boolean(data.mesh);
      $('orientation-confirmed').checked=false;$('profile').value='';
      $('step-preview-note').hidden=false;
      $('step-preview-note').textContent=data.mesh?'Preview only · geometry checks are still running. Details and NC1 export stay locked.'+(data.warnings?.length?' Import warnings: '+data.warnings.join('; '):''):data.message;
      $('step-preview-note').dataset.pending='true';
      $('input-detection').hidden=false;$('input-detection').textContent='STEP preview · not verified';
      $('verification').textContent='This is a display mesh. Supported geometry, working faces and NC1 eligibility have not been verified.';
      if(data.mesh){mesh=data.mesh;$('empty').hidden=true;for(const b of document.querySelectorAll('[data-view]'))b.hidden=b.dataset.view!=='iso';}
      setBusy(true,data.message,!data.mesh);
      if(data.mesh)viewer?.setModel(mesh,null);
      status(data.message);controls();return;
    }
    if(data.type==='step-progress'){status(data.message);return;}
    if(data.type==='dxf-preview'){if(data.text!==undefined)currentText=data.text;showDrawing(data.drawing);setBusy(Boolean(data.pending));status(data.message,data.drawing?.bounds?'':'error');controls();return;}
    setBusy(false);
    if(data.type==='input-required'){if(data.text!==undefined)currentText=data.text;status(data.message);controls();return;}
    if(data.type==='error'){$('step-preview-note').dataset.pending='false';if(stepPreviewActive){$('step-preview-note').dataset.pending='false';$('step-preview-note').textContent='Preview only · geometry checks failed. NC1 export is unavailable.';}recognitionDetails(data.recognitionChecks);if(data.clearParts)partReview.clear();if(data.text!==undefined)currentText=data.text;if(data.mesh){mesh=data.mesh;$('empty').hidden=true;viewer?.setModel(mesh,null);}status(data.message,'error',true);controls();return;}
    if(data.type==='part-blocked'){
      $('step-preview-note').dataset.pending='false';
      showDxfParts(data);analysis=null;if(!stepPreviewActive){mesh=null;viewer?.clear();$('empty').hidden=false;}else{$('step-preview-note').dataset.pending='false';$('step-preview-note').textContent='Assembly preview only · this member cannot be converted. Select another listed member to review.';}$('empty').querySelector('h2').textContent='Member cannot be converted';$('empty').querySelector('p').textContent='This occurrence is listed but blocked. Select another member to review its geometry.';status(data.message,'error',true);controls();return;
    }
    if(data.type==='loaded'){
      stepPreviewActive=false;$('step-preview-note').hidden=true;
      $('drop-zone').classList.remove('drawing-mode');$('dxf-preview').toggleAttribute('hidden',true);$('preview').hidden=false;$('dxf-preview-note').hidden=true;
      $('measurements').replaceChildren();
      analysis=data.analysis;mesh=data.mesh;if(data.text!==undefined)currentText=data.text;$('input-detection').hidden=false;$('input-detection').textContent=inputKind()==='plate-dxf'?'DXF plate outlines':data.detectedKind==='plate'?'STEP detected as flat plate':'STEP detected as steel section';
      $('tube-orientation').hidden=!analysis.tube_end_profiles;showCoordinateFrames();
      $('length-axis').value=analysis.orientation.length_axis;$('up-axis').value=analysis.orientation.up_axis;
      $('empty').hidden=true;$('profile').value=analysis.suggested_profile;
      const mm=x=>Number(x).toLocaleString(undefined,{maximumFractionDigits:3})+' mm';
      const tube=['RHS','SHS'].includes(analysis.family),channel=analysis.family==='PFC',isection=analysis.family==='I';
      const fields=[['Section',analysis.family+' · '+mm(analysis.height_mm)+' × '+mm(analysis.width_mm)],['Length',mm(analysis.length_mm)],[channel||isection?'Flange / web':tube?'Wall':'Leg thickness',channel||isection?mm(analysis.wall_mm)+' / '+mm(analysis.web_mm):mm(analysis.wall_mm)],[tube?'Outside radius':isection?'Root radius':'Root / toe radius',tube?mm(analysis.outer_radius_mm):isection?mm(analysis.inner_radius_mm):mm(analysis.inner_radius_mm)+' / '+mm(analysis.toe_radius_mm)],['Round holes',String(analysis.holes.length)],['Edge slots',String(analysis.edge_slots.length)]];
      if(analysis.section_sampling)fields.push(['Stock sections',`${analysis.section_sampling.matching} / ${analysis.section_sampling.divisions} agree`]);
      if(analysis.family==='PLATE')fields.splice(0,fields.length,['Plate face',mm(analysis.length_mm)+' × '+mm(analysis.height_mm)],['Thickness',mm(analysis.wall_mm)],['Round through-holes',String(analysis.holes.length)],['Internal through-contours',String(analysis.internal_contours)]);
      if(analysis.section_cuts){fields.push(['Internal through-cuts',String(analysis.section_cuts.faces.reduce((n,f)=>n+f.region.holes.length,0))],['Notched faces',analysis.section_cuts.faces.filter(f=>f.external_changed).map(f=>f.face.toUpperCase()).join(' / ')||'None']);}
      if(analysis.end_copes?.length)fields.push(['End copes',String(analysis.end_copes.length)]);
      if(analysis.tube_end_profiles){fields.push(['Cutting outlines','4 · H / U / V / O'],['Profile allowance','0.25 mm · ProCAM']);}
      if(analysis.mitres){
        fields[1][0]='Overall finished length';
        const angles=analysis.mitres.angles_deg.map(x=>(Math.abs(x)<0.0005?0:x).toFixed(3)+'°');
        fields.push(['Start · web / flange',angles[0]+' / '+angles[2]],['End · web / flange',angles[1]+' / '+angles[3]],['Minimum length along X',mm(analysis.mitres.minimum_generator_length_mm)],['Comparison tolerance',String(analysis.mitres.comparison_mm)+' mm']);
        if(analysis.mitres.root_trim)fields.push(['STEP root-trim allowance','≤ '+analysis.mitres.root_trim.allowance_mm+' mm']);
        if(analysis.mitres.compound_ends?.some(Boolean))fields.push(['Compound ends',analysis.mitres.compound_ends.map((yes,i)=>yes?(i?'End':'Start'):null).filter(Boolean).join(' / ')],['3D tilt · start / end',analysis.mitres.inclinations_deg.map(v=>v.toFixed(3)+'°').join(' / ')]);
      }
      for(const [label,value]of fields){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('measurements').append(row);}
      status(analysis.mitres&&analysis.mitres.comparison_mm!==0.02?`Geometry accounted for at ${analysis.mitres.comparison_mm} mm · ready for your orientation check`:'Geometry accounted for · ready for your orientation check','success');$('verification').textContent=analysis.verification;
      $('face-guide').textContent=tube?'X starts at the near end. v/h are −Y/+Y; o/u are +Z/−Z. V/H q rises from the bottom; O/U q runs from the back toward the front. All four faces share X=0.':isection?'I-section: V is the −Y web; H is its back for review only. O/U are the top/bottom flanges. Web coordinates rise from the bottom; both flange coordinates run from +Y toward −Y. X starts at the same member end on all three working faces.':channel?'V is the inside web; O/U are the flanges. H is the web back for review. DSTV X may run opposite the aligned model X to keep the piece frame right-handed; review the coordinate table.':'V is the inside of the longer leg; U is the outside of the second leg. Both use one right-handed DSTV piece frame. Review the explicit face origins and X/q directions below.';
      if(analysis.mitres)$('face-guide').textContent+=' Mitres: X=0 is the nearest finished point, shared by all faces. Review both cut directions. No kerf or trim allowance is added.';
      if(analysis.mitres?.compound_ends?.some(Boolean))$('face-guide').textContent+=' Compound end: both web and flange angles describe one plane. The 3D tilt combines both slopes and is limited to 65° from square; it is not a machine setup angle. Use the 3D view and each working-face view to check the same cut.';
      if(analysis.end_copes?.length)$('face-guide').textContent+=' End copes: X=0 stays at the retained square web end. Flange outlines can start beyond that nominal origin. The coordinate table shows each back-wall X and web-floor q. Cope checks use fixed 0.002 mm comparison; the mitre control does not change it. No kerf or automatic relief is added.';
      if(analysis.family==='PLATE')$('face-guide').textContent='Plate V is the face toward −Y. NC1 X/q start at the minimum X/up of the enclosing rectangle. X increases right, q increases up in the face-on V view. No kerf is added. Check this origin and cutting direction. Camera movement does not change coordinates. Plate checks use a fixed 0.002 mm total budget; the mitre control applies to I-sections only.';
      if(analysis.source_frame){const vec=p=>'('+p.map(v=>Number(v.toFixed(6))).join(', ')+')';$('face-guide').textContent+=' Stock-aligned preview. Original STEP length vector '+vec(analysis.source_frame.length)+'; up vector '+vec(analysis.source_frame.up)+'. Measured stock axes stay aligned; use the tube face/end choices above to change the working frame.';}
      if(analysis.tube_end_profiles)$('face-guide').textContent+=' ProCAM four-face exterior profiles: X=0 is the nearest retained exterior point, shared by all faces. Corner envelopes are included; opposite faces keep the same q direction. The orange outline on a face view is its NC1 cutting envelope. End-wall bevel angles are not encoded. Strict output is blocked. No kerf or stock allowance is added.';
      if(analysis.section_cuts)$('face-guide').textContent+=' Flat-wall openings/notches: intact square stock end, 400 mm body diagonal maximum, total 0.002 mm verification. The mitre allowance does not relax these checks.';
      for(const b of document.querySelectorAll('[data-view]'))b.hidden=b.dataset.view!=='iso'&&!analysis.working_faces.some(f=>f.face===b.dataset.view);
      for(const id of ['si-face','pu-face']){$(id).replaceChildren();for(const f of analysis.working_faces.filter(f=>f.machining)){const opt=document.createElement('option');opt.value=f.face;opt.textContent=f.face.toUpperCase();$(id).append(opt);}}
      showDxfParts(data);
      controls();
      showHoles(analysis.holes);showSlots();showCopes();viewer?.setModel(mesh,analysis);updateMarkingPreview();if(analysis.family==='PLATE'||analysis.end_copes?.length||analysis.tube_end_profiles)selectView('v');controls();
    }else if(data.type==='batch-exported'){
      try{
        if(data.combined&&data.files.length===1){const file=data.files[0];downloadBlob(new Blob([file.text],{type:'text/plain;charset=us-ascii'}),file.filename);$('nc1').textContent=file.text;$('result').hidden=false;status(`Combined NC1 downloaded · quantity ${file.quantity}. Every matching occurrence was rechecked. ProCAM/machine validation remains separate.`,'success');}
        else{downloadBlob(new Blob([nc1Zip(data.files)],{type:'application/zip'}),$('part-mark').value+'_parts.zip');status(`${data.files.length} independently verified NC1 files downloaded${data.combined?' with detected quantities':''}. ProCAM/machine validation remains separate.`,'success');}
      }catch(error){status(error.message,'error');}
    }else if(data.type==='exported'){
      $('nc1').textContent=data.text;$('result').hidden=false;
      const url=URL.createObjectURL(new Blob([data.text],{type:'text/plain;charset=us-ascii'}));
      const link=document.createElement('a');link.href=url;link.download=data.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      status(`NC1 generated from the current solid${analysis.mitres?' at '+analysis.mitres.comparison_mm+' mm comparison tolerance':''}. ProCAM/machine validation remains separate.`,'success');
    }
  };
  worker.onerror=stopWorker;worker.onmessageerror=stopWorker;
}
function stopWorker(event){
  reporting.failure(event?.message,{source:'worker-crash'});reporting.finish('failure');
  ready=false;analysis=null;$('step-preview-note').dataset.pending='false';setBusy(false);status('The geometry worker stopped. Reload this page before trying another file.','error',true);$('engine-status').textContent='ENGINE STOPPED';worker?.terminate();
}
function load(text,{sample,name,detectOrientation=false,checkDxf=false}={}){
  if(!ready||busy)return;
  if(sample!==undefined)resetSiTextLink();
  if(!$('mitre-tolerance').reportValidity())return;
  toleranceHadAnalysis=false;
  reset();$('empty').querySelector('h2').textContent='Bring in a member or plate';$('empty').querySelector('p').textContent='Drop a STEP for automatic detection, or a DXF outline. DXF needs units, cutting layers and thickness before checking.';if(text!==undefined)currentText=text;else if(sample!==undefined)currentText=null;
  $('file-name').textContent=name??$('file-name').textContent;
  $('source-note').textContent=sample!==undefined?($('sample-family').value.startsWith('MITRE_')?'Synthetic sharp-root I mitres · custom dimensions, not a catalogue UB/UC.':'Analytic sample · synthetic geometry, not an uploaded job.'):'Local file · not uploaded or stored by this converter.';
  setBusy(true,inputKind()==='plate-dxf'?(checkDxf?'Checking DXF cutting geometry…':'Reading DXF drawing…'):'Reading and checking geometry…');status(inputKind()==='plate-dxf'?(checkDxf?'Checking the selected DXF cutting layers…':'Loading DXF drawing preview · no geometry checks yet…'):'Reading STEP surfaces and verifying stock/cut geometry…');
  sendRequest({id:++serial,type:'load',checkDxf,text:currentText,sample,family:$('sample-family').value,inputKind:inputKind(),dxfOptions:dxfOptions(),orientation:orientations(),detectOrientation,tubeReverseLength:$('tube-reverse-length').checked,tubeReverseUp:$('tube-reverse-up').checked,mitreToleranceMm:Number($('mitre-tolerance').value)});
}
async function fileInput(file){
  if(!file||busy)return;
  reporting.begin('file-read');
  selectedCutLayers.clear();showCutLayerChoices(null);
  if(!/\.(step|stp|dxf)$/i.test(file.name)||file.size>10*1024*1024){reset();currentText=null;status('Choose a .step, .stp or .dxf file up to 10 MiB (DXF core limit 2 MiB).','error');reporting.finish('failure');controls();return;}
  resetSiTextLink();$('part-mark').value=partMarkFromFilename(file.name);
  $('part-mark-hint').textContent='Taken from the file name. Edit it if needed.';
  if(/\.dxf$/i.test(file.name)){$('input-kind').value='plate-dxf';$('dxf-fields').hidden=false;}
  else {$('input-kind').value='step';$('dxf-fields').hidden=true;}
  try {resetTubeSelection();$('length-axis').value='x';$('up-axis').value='z';const text=await file.text();reporting.finish();load(text,{name:file.name,detectOrientation:true});}catch(error){reporting.failure(error);reporting.finish('failure');reset();currentText=null;status(String(error),'error',true);controls();}
}
$('step-file').addEventListener('change',event=>fileInput(event.target.files[0]));
$('replace-file').addEventListener('click',()=>$('step-file').click());
for(const [id,holes]of [['sample-plain',false],['sample-holes',true]])$(id).addEventListener('click',()=>{$('part-mark').value=partMarkFromFilename(sampleLabel()+'_SAMPLE');$('part-mark-hint').textContent='Sample part mark. Edit it if needed.';selectedCutLayers.clear();showCutLayerChoices(null);resetTubeSelection();$('length-axis').value='x';$('up-axis').value='z';const plate=$('sample-family').value.startsWith('PLATE_');if(plate){if(inputKind()!=='plate-dxf')$('input-kind').value='step';$('length-axis').value='x';$('up-axis').value='z';}else $('input-kind').value='step';$('dxf-fields').hidden=inputKind()!=='plate-dxf';load(undefined,{sample:holes,detectOrientation:true,name:`Analytic ${sampleLabel()} sample`});});
for(const id of ['input-kind','dxf-units','plate-thickness'])$(id).addEventListener('input',inputSettingsChanged);
$('sample-family').addEventListener('change',()=>{const cut=$('sample-family').value.startsWith('CUT_'),assembly=$('sample-family').value==='ASSEMBLY';for(const [id,label]of [['sample-plain','Plain'],['sample-holes','Drilled']]){$(id).hidden=cut&&id==='sample-holes';$(id).textContent=assembly?(id==='sample-plain'?'Assembly sample ↗':'Assembly with unsupported pin ↗'):cut?`Load ${sampleLabel()} sample ↗`:`${label} ${sampleLabel()} sample ↗`;}});
for(const id of ['length-axis','up-axis'])$(id).addEventListener('change',()=>load(currentText));
for(const id of ['tube-reverse-up','tube-reverse-length'])$(id).addEventListener('change',()=>load(currentText,{detectOrientation:true}));
let toleranceHadAnalysis=false;
$('mitre-tolerance').addEventListener('input',()=>{
  toleranceHadAnalysis=toleranceHadAnalysis||Boolean(analysis);
  const retainedMesh=mesh;reset();
  if(retainedMesh){mesh=retainedMesh;viewer?.setModel(mesh,null);}
  status('Tolerance changed · apply and recheck before exporting.');
  $('verification').textContent='The selected tolerance has not been verified against this solid.';controls();
});
$('check-dxf').addEventListener('click',()=>load(currentText,{checkDxf:true}));
$('recheck-tolerance').addEventListener('click',()=>{load(currentText,{checkDxf:inputKind()==='plate-dxf',detectOrientation:!toleranceHadAnalysis});toleranceHadAnalysis=false;});
for(const id of outputFields)$(id).addEventListener('input',()=>{if(id==='orientation-confirmed')partReview.confirm($('orientation-confirmed').checked);invalidate();if(id==='part-mark')updateMarkingPreview();});
for(const id of markingFields)$(id).addEventListener('input',()=>{if(id==='si-text')$('si-use-part-mark').checked=false;if(['si-text','si-use-part-mark','si-height','si-width'].includes(id))$('si-font-confirmed').checked=false;invalidate();updateMarkingPreview();});
$('dxf-grouping').addEventListener('change',()=>{partReview.combineIdentical=$('dxf-grouping').value==='combined';invalidate();});
$('dxf-part-select').addEventListener('change',()=>selectDxfPart(Number($('dxf-part-select').value)));
$('export-form').addEventListener('submit',event=>{event.preventDefault();if(partReview.combineIdentical||!eligible())return;let options;try{options=partReview.options(exportRequest(true));}catch(e){status(e.message,'error');return;}setBusy(true,'Rechecking the current solid and generating NC1…');sendRequest({id:++serial,type:'export',options});});
$('export-batch').addEventListener('click',()=>{if($('export-batch').disabled)return;let options;try{options=partReview.allOptions(exportRequest());}catch(e){status(e.message,'error');return;}setBusy(true,'Rechecking every part and preparing the NC1 ZIP…');sendRequest({id:++serial,type:'export-batch',options,combineIdentical:partReview.combineIdentical});});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('nc1').textContent);$('copy').textContent='Copied';}catch{$('copy').textContent='Select text to copy';}});
function selectView(name){view=name;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b.dataset.view===name);viewer?.setView(name);}
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>selectView(button.dataset.view));
$('viewer-fit').addEventListener('click',()=>drawingPreview&&!analysis?drawingView.fit():viewer?.fit());
$('viewer-reset').addEventListener('click',()=>drawingPreview&&!analysis?drawingView.fit():selectView('iso'));
$('viewer-zoom-in').addEventListener('click',()=>drawingPreview&&!analysis?drawingView.zoom(1.25):viewer?.zoom(1.25));
$('viewer-zoom-out').addEventListener('click',()=>drawingPreview&&!analysis?drawingView.zoom(1/1.25):viewer?.zoom(1/1.25));
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
    const x=(s.left_mm+s.right_mm)/2;const reversed=analysis.working_faces.find(g=>g.face===s.face)?.x_reversed;
    const gap=(s.right_mm-s.left_mm-2*s.radius_mm)/2;
    const width=s.face==='u'?analysis.width_mm:analysis.height_mm;
    return [s.face,reversed?analysis.length_mm-x:x,s.right_mm-s.left_mm,width-s.center_y_mm+Math.sqrt(s.radius_mm*s.radius_mm-gap*gap),s.radius_mm];
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
function showCoordinateFrames(){
  $('coordinate-details').hidden=false;$('coordinate-table').replaceChildren();
  const vec=p=>'('+p.map(v=>Math.abs(v)<1e-8?'0':Number(v.toFixed(3))).join(', ')+')';
  const rows=[['Face','Model point at X=0, q=0 (mm)','X+ in model','q+ in model'],
    ...analysis.working_faces.filter(g=>g.machining).map(g=>[g.face.toUpperCase(),vec(g.origin),vec([g.x_reversed?-1:1,0,0]),vec(g.q_direction)])];
  const table=document.createElement('table');
  for(const [i,row]of rows.entries()){const tr=document.createElement('tr');for(const value of row){const td=document.createElement(i?'td':'th');td.textContent=value;tr.append(td);}table.append(tr);}
  $('coordinate-table').append(table);
}
function viewerFailure(message){
  reporting.failure(message);
  $('viewer-error').textContent=message;$('viewer-error').hidden=false;controls();
}
try {
  viewer=new StepViewer($('preview'),$('viewer-overlay'),$('viewer-caption'),viewerFailure);
}catch(error){
  viewerFailure('3D preview unavailable. Enable WebGL 2 in your browser, then reload. '+error.message);
}
try{startWorker();}catch(error){stopWorker(error);}controls();
