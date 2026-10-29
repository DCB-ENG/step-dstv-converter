import init,{BrowserConversion,browser_profile_sample} from './pkg/step_dstv_core.js';
let conversion=null;
await init();
self.postMessage({type:'ready'});
self.onmessage=({data})=>{
  const {id,type}=data;
  let loadedText;
  let loadedMesh;
  try{
    if(type==='load'){
      conversion?.free();conversion=null;
      const text=data.sample!==undefined?browser_profile_sample(data.family??'RHS',data.sample):data.text;
      loadedText=text;
      conversion=data.detectOrientation?BrowserConversion.detected(text):new BrowserConversion(text,JSON.stringify(data.orientation));
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
