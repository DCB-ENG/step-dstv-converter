// Classification uses complete WASM geometry checks, independent of filename,
// selected sample family and display camera. Both accepted categories block output.
const WORLD_FRAMES=[
  {length_axis:'x',up_axis:'z'},{length_axis:'x',up_axis:'y'},
  {length_axis:'y',up_axis:'z'},{length_axis:'y',up_axis:'x'},
  {length_axis:'z',up_axis:'y'},{length_axis:'z',up_axis:'x'},
];
const frameKey=frame=>JSON.stringify([frame.length_axis,frame.up_axis]);
const message=error=>String(error instanceof Error?error.message:error);
function detectionError(code,text,conversion){
  const error=new Error(text);error.code=code;
  if(conversion){try{error.previewMesh=JSON.parse(conversion.preview());}catch{/* Preview is optional; never establishes recognition. */}}
  return error;
}
export function verifiedKind(section,plate){
  if(section&&plate)throw detectionError('ambiguous','Ambiguous STEP: this solid verifies as both a steel section and a flat plate. No classification or NC1 export was selected.');
  if(!section&&!plate)throw detectionError('unsupported','STEP geometry did not verify as a supported steel section or flat plate.');
  return section?'section':'plate';
}
export function detectStep(text,{orientation={length_axis:'x',up_axis:'z'},detectOrientation=true,verification={mitre_tolerance_mm:0.02}}={},api){
  const verificationJson=JSON.stringify(verification);
  let section=null,sectionAnalysis=null,sectionError='',plate=null,plateAnalysis=null;
  const plateErrors=[],checks=[];
  try{
    try{
      section=api.BrowserConversion.detected_with_verification(text,verificationJson);
      sectionAnalysis=JSON.parse(section.analyze());
    }catch(error){
      sectionError=message(error);
      if(section?.recognition_diagnostics){
        try{checks.push(...JSON.parse(section.recognition_diagnostics()).map(check=>({kind:'Section',...check})));}catch{/* Keep the primary diagnostic if additional reporting fails. */}
      }
    }
    // Multiple verified in-plane orientations are one plate category. Prefer
    // the longest in-plane span as X; equal spans keep the first stable frame.
    const frames=[orientation,...WORLD_FRAMES].filter((f,i,all)=>all.findIndex(other=>frameKey(other)===frameKey(f))===i);
    for(const frame of frames){
      let candidate=null;
      try{
        candidate=api.BrowserPlate.step(text,JSON.stringify(frame));
        const analysis=JSON.parse(candidate.analyze());
        if(!plate||analysis.length_mm>plateAnalysis.length_mm+0.002){
          plate?.free();plate=candidate;plateAnalysis=analysis;candidate=null;
        }
      }catch(error){plateErrors.push(message(error));checks.push({kind:'Plate',orientation:frame,error:message(error)});}
      finally{candidate?.free();}
    }
    let kind;
    try{kind=verifiedKind(Boolean(sectionAnalysis),Boolean(plateAnalysis));}
    catch(error){
      if(error.code==='unsupported'){
        const reasons=[...new Set(plateErrors)].slice(0,3).join(' / ');
        const failure=detectionError('unsupported',checks.some(check=>check.kind==='Section')
          ?`${error.message} Review the axis checks below, then correct the working axes or the unsupported geometry.`
          :`${error.message} Section check: ${sectionError.slice(0,1600)} Plate checks: ${reasons.slice(0,1600)}`,section);
        if(checks.length)failure.recognitionChecks=checks;
        throw failure;
      }
      throw detectionError(error.code,error.message,section);
    }
    if(kind==='section'){
      plate?.free();plate=null;
      if(!detectOrientation&&frameKey(sectionAnalysis.orientation)!==frameKey(orientation)){
        section.free();section=null;
        section=api.BrowserConversion.with_verification(text,JSON.stringify(orientation),verificationJson);
        sectionAnalysis=JSON.parse(section.analyze());
      }
      const conversion=section;section=null;
      return {conversion,analysis:sectionAnalysis,kind};
    }
    section?.free();section=null;
    if(!detectOrientation&&frameKey(plateAnalysis.orientation)!==frameKey(orientation)){
      const candidate=api.BrowserPlate.step(text,JSON.stringify(orientation));
      try{const analysis=JSON.parse(candidate.analyze());plate.free();plate=candidate;plateAnalysis=analysis;}
      catch(error){candidate.free();throw error;}
    }
    const conversion=plate;plate=null;
    return {conversion,analysis:plateAnalysis,kind};
  }finally{section?.free();plate?.free();}
}
