import init,{BrowserConversion,BrowserPlate,BrowserPlateBatch,browser_plate_sample,browser_profile_sample} from './pkg/step_dstv_core.js?build=d18dbed1d638';
import {detectStep} from './step_detection.js?build=d18dbed1d638';
import {parseDxfPreview} from './dxf_preview.js?build=d18dbed1d638';
import {identicalPartGroups,exportBatchFiles} from './identical_parts.js?build=d18dbed1d638';
let conversion=null,batch=null,parts=[],activePart=0;
function clearConversion(){conversion?.free();conversion=null;batch=null;parts=[];activePart=0;}
await init({module_or_path:new URL('./pkg/step_dstv_core_bg.wasm?build=d18dbed1d638',import.meta.url)});
self.postMessage({type:'ready',build:'d18dbed1d638'});
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
      const text=data.sample!==undefined?(samplePlate?browser_plate_sample(data.family,dxf):browser_profile_sample(data.family??'RHS',data.sample)):data.text;
      loadedText=text;
      let analysis,detectedKind;
      if(dxf){
        let drawing=null,previewError='';
        try{drawing=parseDxfPreview(text);}catch(error){previewError=String(error);}
        const check=data.checkDxf===true;
        self.postMessage({id,type:'dxf-preview',drawing,text:loadedText,pending:check,message:previewError?`DXF preview unavailable: ${previewError}. No geometry has been checked.`:'DXF drawing loaded · not checked. Confirm units, thickness and cutting layers, then choose Check DXF.'});
        if(!check)return;
        const options=data.dxfOptions;
        const layers=options?.cutting_layers??(options?.cutting_layer?[options.cutting_layer]:[]);
        if(!['mm','inch'].includes(options?.units)||!Number.isFinite(options?.thickness_mm)||options.thickness_mm<0.1||options.thickness_mm>200||!layers.length||layers.length>16||layers.some(layer=>typeof layer!=='string'||!layer.trim())){
          self.postMessage({id,type:'input-required',text:loadedText,message:'DXF is not checked. Confirm units, plate thickness and cutting layers, then choose Check DXF.'});return;
        }
        batch=BrowserPlateBatch.dxf(text,JSON.stringify(options));
        // Install ownership before any later method can throw.
        conversion={free:()=>batch?.free(),analyze:()=>batch.analyze_part(activePart),preview:()=>batch.preview_part(activePart),export_nc1:options=>batch.export_part(activePart,options)};
        parts=JSON.parse(batch.parts());
        if(parts.length===1){conversion.free();batch=null;parts=[];conversion=BrowserPlate.dxf(text,JSON.stringify(options));}
        analysis=JSON.parse(conversion.analyze());detectedKind='plate';
      }
      else{
        const selected=detectStep(text,{orientation:data.orientation,detectOrientation:data.detectOrientation,verification:{mitre_tolerance_mm:data.mitreToleranceMm??0.02}},{BrowserConversion,BrowserPlate});
        conversion=selected.conversion;analysis=selected.analysis;detectedKind=selected.kind;
      }
      if(data.tubeReverseLength||data.tubeReverseUp){if(detectedKind==='plate')throw Error('Tube face/end selection does not apply to plates.');conversion.reorient_tube(Boolean(data.tubeReverseLength),Boolean(data.tubeReverseUp));analysis=JSON.parse(conversion.analyze());}
      const mesh=JSON.parse(conversion.preview());
      loadedMesh=mesh;
      self.postMessage({id,type:'loaded',analysis,mesh,detectedKind,parts,identicalGroups:parts.length>1?identicalPartGroups(parts):[],activePart,text:data.sample!==undefined?text:undefined});
    }else if(type==='select-part'){
      if(!batch||!Number.isInteger(data.index)||data.index<0||data.index>=parts.length)throw Error('Choose a detected DXF part.');
      activePart=data.index;
      self.postMessage({id,type:'loaded',analysis:JSON.parse(conversion.analyze()),mesh:JSON.parse(conversion.preview()),detectedKind:'plate',activePart});
    }else if(type==='export-batch'){
      if(!batch||!Array.isArray(data.options)||data.options.length!==parts.length)throw Error('Check the complete DXF batch first.');
      const files=exportBatchFiles(batch,data.options,data.combineIdentical===true);
      self.postMessage({id,type:'batch-exported',files,combined:data.combineIdentical===true});
    }else if(type==='export'){
      if(!conversion)throw new Error('Load and analyse a supported STEP file first.');
      self.postMessage({id,type:'exported',text:conversion.export_nc1(JSON.stringify(data.options)),filename:data.options.part_mark+'.nc1'});
    }else throw new Error('Unknown converter request.');
  }catch(error){
    if(type==='load'||type==='select-part'){clearConversion();}
    self.postMessage({id,type:'error',clearParts:type==='select-part',message:String(error),text:loadedText,mesh:loadedMesh??error?.previewMesh});
  }
};
