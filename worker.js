import init,{BrowserConversion,BrowserPlate,browser_plate_sample,browser_profile_sample} from './pkg/step_dstv_core.js?build=f9745385c5e9';
let conversion=null;
await init({module_or_path:new URL('./pkg/step_dstv_core_bg.wasm?build=f9745385c5e9',import.meta.url)});
self.postMessage({type:'ready',build:'f9745385c5e9'});
self.onmessage=({data})=>{
  const {id,type}=data;
  let loadedText;
  let loadedMesh;
  try{
    if(type==='load'){
      conversion?.free();conversion=null;
      const plate=data.inputKind!=='section';
      const text=data.sample!==undefined?(plate?browser_plate_sample(data.family,data.inputKind==='plate-dxf'):browser_profile_sample(data.family??'RHS',data.sample)):data.text;
      loadedText=text;
      const verification=JSON.stringify({mitre_tolerance_mm:data.mitreToleranceMm??0.02});
      conversion=plate?(data.inputKind==='plate-dxf'?BrowserPlate.dxf(text,JSON.stringify(data.dxfOptions)):BrowserPlate.step(text,JSON.stringify(data.orientation))):(data.detectOrientation?BrowserConversion.detected_with_verification(text,verification):BrowserConversion.with_verification(text,JSON.stringify(data.orientation),verification));
      if(data.tubeReverseLength||data.tubeReverseUp){if(plate)throw Error('Tube face/end selection does not apply to plates.');conversion.reorient_tube(Boolean(data.tubeReverseLength),Boolean(data.tubeReverseUp));}
      const mesh=JSON.parse(conversion.preview());
      loadedMesh=mesh;
      const analysis=JSON.parse(conversion.analyze());
      self.postMessage({id,type:'loaded',analysis,mesh,text:data.sample!==undefined?text:undefined});
    }else if(type==='export'){
      if(!conversion)throw new Error('Load and analyse a supported STEP file first.');
      self.postMessage({id,type:'exported',text:conversion.export_nc1(JSON.stringify(data.options)),filename:data.options.part_mark+'.nc1'});
    }else throw new Error('Unknown converter request.');
  }catch(error){
    if(type==='load'){conversion?.free();conversion=null;}
    self.postMessage({id,type:'error',message:String(error),text:loadedText,mesh:loadedMesh});
  }
};
