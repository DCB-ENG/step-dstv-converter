// Reporting is an allowlist boundary. Never retain arbitrary error text, request
// objects, filenames, identifiers, stacks, URLs, CAD content or DOM field values.
const axes=new Set(['x','-x','y','-y','z','-z']);
const operations=new Set(['idle','engine-start','load','select-part','export','export-batch','file-read','application']);
const stages=new Set(['idle','engine-start','request','preview','recognition','geometry-check','export-check','complete','application','worker']);
const rules=[
  ['geometry-validation','ambiguous-classification',/ambiguous STEP|verifies as both/i,'More than one geometry category verified.'],
  ['geometry-validation','rounded-output-check',/rounded.{0,40}(?:mismatch|discrepancy|exceed|fail)|reconstruct.{0,60}(?:mismatch|discrepancy|exceed|fail)/i,'The reconstructed or rounded output did not pass a geometry check.'],
  ['geometry-validation','geometry-comparison',/(?:geometry|volume|boundary|solid).{0,60}(?:mismatch|discrepancy|exceeds|does not match|not match)|(?:exceeds|outside).{0,30}(?:tolerance|budget)/i,'A geometry comparison did not pass.'],
  ['unsupported-geometry','unsupported-feature',/unsupported|not supported|outside.{0,20}(?:scope|limit)|did not verify as a supported/i,'The geometry or feature is outside the supported conversion scope.'],
  ['geometry-validation','unverified-geometry',/unaccounted|unexplained|did not verify|cannot verify|not verified/i,'The geometry could not be fully verified.'],
];
export function safeFailure(error,{source='operation',code}={}){
  // Inspect only to select static labels; no matched substrings leave here.
  let message='',name='Unknown';
  try{message=typeof error==='string'?error:typeof error?.message==='string'?error.message:'';name=error?.name??message.split(':',1)[0];}catch{}
  message=message.slice(0,12000);
  const errorType=['Error','TypeError','ReferenceError','SyntaxError','RangeError','RuntimeError','URIError','EvalError'].includes(name)?name:'Unknown';
  if(source==='worker-crash'||source==='application'||['TypeError','ReferenceError','SyntaxError','RangeError','RuntimeError','URIError','EvalError'].includes(errorType))return {category:'application-crash',code:source==='worker-crash'?'worker-stopped':'application-exception',error_type:errorType,summary:source==='worker-crash'?'The geometry worker stopped or could not start.':'An application exception occurred.'};
  if(code==='ambiguous')return {category:'geometry-validation',code:'ambiguous-classification',error_type:errorType,summary:'More than one geometry category verified.'};
  for(const [category,reason,pattern,summary]of rules)if(pattern.test(message))return {category,code:reason,error_type:errorType,summary};
  return {category:'unknown',code:'unclassified',error_type:errorType,summary:'The cause is uncertain. Raw error text was omitted to protect job identifiers.'};
}
const choose=(value,allowed,fallback)=>allowed.has(value)?value:fallback;
const boundedNumber=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
export function safeSettings(settings={}){
  return {input_kind:['step','plate-dxf'].includes(settings.input_kind)?settings.input_kind:'unknown',
    length_axis:choose(settings.length_axis,axes,'unknown'),up_axis:choose(settings.up_axis,axes,'unknown'),
    mitre_tolerance_mm:boundedNumber(settings.mitre_tolerance_mm,0.002,1),square_comparison_mm:0.002,
    tube_reverse_up:settings.tube_reverse_up===true,tube_reverse_length:settings.tube_reverse_length===true,
    output_mode:['strict','procam'].includes(settings.output_mode)?settings.output_mode:'unknown'};
}
export function safeBrowser(userAgent=''){
  // Do not share full UA, platform details, custom tokens or URL information.
  for(const [name,pattern]of [['Edge',/Edg\/(\d{1,4})/],['Firefox',/Firefox\/(\d{1,4})/],['Chrome',/Chrome\/(\d{1,4})/],['Safari',/Version\/(\d{1,4}).*Safari\//]]){const match=String(userAgent).match(pattern);if(match)return `${name} ${match[1]}`;}
  return 'Unknown browser';
}
export class DiagnosticHistory{
  constructor({build='',userAgent='',now=()=>performance.now()}={}){
    this.build=/^[a-f0-9]{12}$/.test(build)?build:'development';this.browser=safeBrowser(userAgent);this.now=now;this.entries=[];this.active=null;this.lastFailure=null;
  }
  begin(operation,settings={}){
    if(this.active)this.finish('interrupted');
    this.active={operation:choose(operation,operations,'application'),stage:operation==='engine-start'?'engine-start':'request',settings:safeSettings(settings),started:this.now()};
  }
  stage(stage){if(this.active)this.active.stage=choose(stage,stages,'application');}
  failure(error,{source='operation',code,checks=[],settings}={}){
    const active=this.active??{operation:'application',stage:source==='worker-crash'?'worker':'application',settings:safeSettings(settings),started:this.now()};
    const elapsed=this.elapsed(active);
    this.lastFailure={...safeFailure(error,{source,code}),operation:active.operation,stage:active.stage,elapsed_ms:elapsed,settings:{...active.settings},
      recognition_attempt_count:Array.isArray(checks)?checks.length:0,
      recognition_attempts:(Array.isArray(checks)?checks:[]).slice(0,32).map(check=>({kind:['Section','Plate'].includes(check?.kind)?check.kind:'unknown',
        length_axis:choose(check?.orientation?.length_axis,axes,'unknown'),up_axis:choose(check?.orientation?.up_axis,axes,'unknown'),
        result:check?.error?safeFailure(check.error):{category:'unknown',code:'verified',error_type:'Unknown',summary:'Verified'}}))};
    if(!this.active)this.entries.push({...active,started:undefined,elapsed_ms:elapsed,outcome:'failure',category:this.lastFailure.category,code:this.lastFailure.code});
    this.trim();return this.lastFailure;
  }
  elapsed(active){return Math.max(0,Math.min(86400000,Math.round(this.now()-active.started)||0));}
  finish(outcome='success'){
    if(!this.active)return;
    const {started,...entry}=this.active;
    this.entries.push({...entry,elapsed_ms:this.elapsed(this.active),outcome:['success','failure','input-required','interrupted'].includes(outcome)?outcome:'failure',
      ...(outcome==='failure'&&this.lastFailure?{category:this.lastFailure.category,code:this.lastFailure.code}:{})});this.active=null;this.trim();
  }
  trim(){this.entries=this.entries.slice(-20);}
  snapshot(settings={}){
    return JSON.parse(JSON.stringify({schema_version:1,build:this.build,browser:this.browser,current_settings:safeSettings(settings),
      active_operation:this.active?{operation:this.active.operation,stage:this.active.stage,elapsed_ms:this.elapsed(this.active),settings:{...this.active.settings}}:null,
      last_failure:this.lastFailure,recent_operations:this.entries,limits:{recent_operations:20,recognition_attempts:32},
      privacy:'Automatic diagnostics contain static reason summaries only. Raw errors, stack traces, file paths/names, part marks, SI text, layer/member names, job details and file contents are omitted. Nothing is uploaded automatically.'}));
  }
}
export function formatReport({observed='unknown',description='',expected='',diagnostics}){
  const observedKind=['incorrect-preview','incorrect-nc1','conversion-failure','application-problem','unknown'].includes(observed)?observed:'unknown';
  return `SolidCraftDSTV problem report\n\nObserved problem: ${observedKind}\n\nWhat happened (user supplied):\n${String(description).slice(0,4000)}\n\nWhat I expected (user supplied):\n${String(expected).slice(0,4000)}\n\nTechnical diagnostics:\n${JSON.stringify(diagnostics,null,2)}\n\nAttachments: none included. Any STEP/DXF, NC1 or screenshots must be attached separately by the user after checking permission to share them publicly.\n`;
}
export function githubDraftUrl(){
  // Fixed text only. Never put diagnostics or user descriptions into a URL.
  const url=new URL('https://github.com/DCB-ENG/step-dstv-converter/issues/new');
  url.searchParams.set('title','Converter problem report');
  url.searchParams.set('body','Please review before submitting: this repository and its attachments are PUBLIC.\n\nPaste the reviewed report from the converter here (Copy report or Download diagnostic report). The converter does not send diagnostics in this URL or submit this issue.\n\nOptional: attach a STEP/DXF, NC1 or screenshot only if you have permission to share it publicly. Remove customer names, part marks and other confidential details first.');
  return url.href;
}
