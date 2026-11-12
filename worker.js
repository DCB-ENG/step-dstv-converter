import init,{BrowserConversion,BrowserPlate,BrowserPlateBatch,BrowserStepAssembly,browser_assembly_sample,browser_step_preview,browser_plate_sample,browser_profile_sample} from './pkg/step_dstv_core.js?build=c28d2b169b98';
import {detectStep} from './step_detection.js?build=c28d2b169b98';
import {parseDxfPreview} from './dxf_preview.js?build=c28d2b169b98';
import {identicalPartGroups,exportBatchFiles} from './identical_parts.js?build=c28d2b169b98';
let conversion=null,batch=null,parts=[],activePart=0,batchKind=null;
function clearConversion(){conversion?.free();conversion=null;batch=null;parts=[];activePart=0;batchKind=null;}
await init({module_or_path:new URL('./pkg/step_dstv_core_bg.wasm?build=c28d2b169b98',import.meta.url)});
self.postMessage({type:'ready',build:'c28d2b169b98'});
self.onmessage=({data})=>{
  const {id,type}=data;
  let loadedText;
  let loadedMesh;
  try{
    if(type==='load'){
      clearConversion();
      if(!['step','plate-dxf'].includes(data.inputKind))throw Error('Choose STEP automatic detection or DXF plate outlines.');
      const dxf=data.inputKind==='plate-dxf';
      const samplePlate=String(data.family).startsWith('PLATE_');
      if(dxf&&data.sample!==undefined&&!samplePlate)throw Error('Choose a plate sample for the DXF path.');
      const text=data.sample!==undefined?(data.family==='ASSEMBLY'?browser_assembly_sample(data.sample):samplePlate?browser_plate_sample(data.family,dxf):browser_profile_sample(data.family??'RHS',data.sample)):data.text;
      loadedText=text;
      let analysis,detectedKind;
      if(dxf){
        let drawing=null,previewError='';
        try{drawing=parseDxfPreview(text);}catch(error){previewError=String(error);}
        const check=data.checkDxf===true;
        self.postMessage({id,type:'dxf-preview',drawing,text:loadedText,pending:check,previewError,message:previewError?`DXF preview unavailable: ${previewError}. No geometry has been checked.`:'DXF drawing loaded · not checked. Confirm units, thickness and cutting layers, then choose Check DXF.'});
        if(!check)return;
        const options=data.dxfOptions;
        const layers=options?.cutting_layers??(options?.cutting_layer?[options.cutting_layer]:[]);
        if(!['mm','inch'].includes(options?.units)||!Number.isFinite(options?.thickness_mm)||options.thickness_mm<0.1||options.thickness_mm>200||!layers.length||layers.length>16||layers.some(layer=>typeof layer!=='string'||!layer.trim())){
          self.postMessage({id,type:'input-required',text:loadedText,message:'DXF is not checked. Confirm units, plate thickness and cutting layers, then choose Check DXF.'});return;
        }
        batchKind="dxf";batch=BrowserPlateBatch.dxf(text,JSON.stringify(options));
        // Install ownership before any later method can throw.
        conversion={free:()=>batch?.free(),analyze:()=>batch.analyze_part(activePart),preview:()=>batch.preview_part(activePart),export_nc1:options=>batch.export_part(activePart,options)};
        parts=JSON.parse(batch.parts());
        if(parts.length===1){conversion.free();batch=null;parts=[];conversion=BrowserPlate.dxf(text,JSON.stringify(options));}
        analysis=JSON.parse(conversion.analyze());detectedKind='plate';
      }
      else{
        try{
          const preview=JSON.parse(browser_step_preview(text));
          loadedMesh=preview.mesh;
          self.postMessage({id,type:'step-preview',...preview,text:loadedText,message:'STEP preview ready · checking member details…'});
        }catch(error){
          self.postMessage({id,type:'step-preview',mesh:null,text:loadedText,previewError:String(error),message:`STEP preview unavailable: ${String(error)}. Continuing geometry checks…`});
        }
        const progress=message=>self.postMessage({id,type:'step-progress',message});
        progress('Checking STEP occurrences and supported geometry…');
        batchKind='step';batch=BrowserStepAssembly.step(text,JSON.stringify({mitre_tolerance_mm:data.mitreToleranceMm??0.02}));
        if(batch){
        conversion={free:()=>batch?.free(),analyze:()=>batch.analyze_part(activePart),preview:()=>batch.preview_part(activePart),export_nc1:options=>batch.export_part(activePart,options)};
        parts=JSON.parse(batch.parts());
          activePart=0;
          if(parts[0].error){self.postMessage({id,type:'part-blocked',parts,activePart,message:parts[0].error});return;}
          analysis=JSON.parse(conversion.analyze());detectedKind=parts[0].kind;
        }else{
        conversion=null;batch=null;batchKind=null;parts=[];
        const selected=detectStep(text,{orientation:data.orientation,detectOrientation:data.detectOrientation,verification:{mitre_tolerance_mm:data.mitreToleranceMm??0.02},onProgress:progress},{BrowserConversion,BrowserPlate});
        conversion=selected.conversion;analysis=selected.analysis;detectedKind=selected.kind;
        }
      }
      if((data.tubeReverseLength||data.tubeReverseUp)&&batchKind==='step')throw Error('Assembly members use their detected part frame.');
      if(data.tubeReverseLength||data.tubeReverseUp){if(detectedKind==='plate')throw Error('Tube face/end selection does not apply to plates.');conversion.reorient_tube(Boolean(data.tubeReverseLength),Boolean(data.tubeReverseUp));analysis=JSON.parse(conversion.analyze());}
      const mesh=JSON.parse(conversion.preview());
      loadedMesh=mesh;
      self.postMessage({id,type:'loaded',analysis,mesh,detectedKind,parts,identicalGroups:parts.length>1?(batchKind==='step'?parts.map((_,i)=>[i]):identicalPartGroups(parts)):[],activePart,text:data.sample!==undefined?text:undefined});
    }else if(type==='select-part'){
      if(!batch||!Number.isInteger(data.index)||data.index<0||data.index>=parts.length)throw Error('Choose a detected part.');
      activePart=data.index;
      if(parts[activePart].error){self.postMessage({id,type:'part-blocked',activePart,message:parts[activePart].error});return;}
      self.postMessage({id,type:'loaded',analysis:JSON.parse(conversion.analyze()),mesh:JSON.parse(conversion.preview()),detectedKind:batchKind==='step'?parts[activePart].kind:'plate',activePart});
    }else if(type==='export-batch'){
      if(!batch||!Array.isArray(data.options)||data.options.length!==parts.length)throw Error('Check the complete batch first.');
      if(batchKind==='step'&&data.combineIdentical)throw Error('Assembly occurrences stay separate; grouping is not supported.');
      const files=exportBatchFiles(batch,data.options,data.combineIdentical===true);
      self.postMessage({id,type:'batch-exported',files,combined:data.combineIdentical===true});
    }else if(type==='export'){
      if(!conversion)throw new Error('Load and analyse a supported STEP file first.');
      self.postMessage({id,type:'exported',text:conversion.export_nc1(JSON.stringify(data.options)),filename:data.options.part_mark+'.nc1'});
    }else throw new Error('Unknown converter request.');
  }catch(error){
    if(type==='load'||type==='select-part'){clearConversion();}
    self.postMessage({id,type:'error',clearParts:type==='select-part',message:String(error),errorName:error?.name,errorCode:error?.code,recognitionChecks:error?.recognitionChecks,text:loadedText,mesh:loadedMesh??error?.previewMesh});
  }
};
