import {DiagnosticHistory,formatReport,githubDraftUrl} from './report_diagnostics.js?build=8d3b837c0a41';
import {sourceFilename,reportZip,capturePreview,screenshotFile} from './report_attachments.js?build=8d3b837c0a41';
const $=id=>document.getElementById(id);
const failureButton=document.createElement('button');failureButton.id='report-failure';failureButton.type='button';failureButton.className='button quiet report-failure';failureButton.textContent='Report this problem';failureButton.hidden=true;$('status').after(failureButton);
const history=new DiagnosticHistory({build:$('report-panel').dataset.build,userAgent:navigator.userAgent});
let settings=()=>({}),snapshot=null,returnFocus=null;
let loadedSource=null,source=null,screenshot=null,screenshotUrl=null,prepareScreenshot=()=>{},attachmentGeneration=0;
const notice=text=>{$('report-feedback').textContent=text;};
function attachmentList(){
  const files=[];
  if(source&&$('report-include-source').checked)files.push({filename:sourceFilename(source),description:`Original file ${JSON.stringify(source.name)} (${source.size} bytes)`});
  if(screenshot&&$('report-include-screenshot').checked)files.push({filename:'screenshot.png',description:`Reviewed screenshot (${screenshot.size} bytes)`});
  return files;
}
function clearScreenshot(){
  attachmentGeneration++;screenshot=null;if(screenshotUrl)URL.revokeObjectURL(screenshotUrl);screenshotUrl=null;
  $('report-capture').disabled=false;
  $('report-screenshot-preview').removeAttribute('src');$('report-screenshot-preview').hidden=true;
  $('report-include-screenshot').checked=false;$('report-include-screenshot').disabled=true;$('report-remove-screenshot').hidden=true;
}
function selectSource(file,include=false){
  source=file;
  $('report-include-source').checked=Boolean(source)&&include;
  $('report-include-source').disabled=!source;
  $('report-source-detail').textContent=source
    ?`${source.name} · ${source.size.toLocaleString()} bytes · original file contents`
    :'Choose a STEP, DXF or NC1 file, or load a STEP/DXF in the converter.';
  $('report-use-loaded').hidden=!loadedSource||source===loadedSource;
  if(snapshot)refreshPreview();
}
function sourceChanged(file){
  try{sourceFilename(file);loadedSource=file;}catch{loadedSource=null;}
  clearScreenshot();
  selectSource(loadedSource);
}
function refreshPreview(){
  $('report-preview').value=formatReport({observed:$('report-observed').value,description:$('report-description').value,expected:$('report-expected').value,diagnostics:snapshot,attachments:attachmentList()});
  notice('Review the text below before copying, downloading or opening GitHub.');
}
function open(){
  snapshot=history.snapshot(settings());refreshPreview();
  if(!$('report-panel').open){returnFocus=document.activeElement;$('report-panel').showModal();}
}
export const reporting={
  sourceFile:sourceChanged,prepareScreenshot(renderer){prepareScreenshot=renderer;},
  settings(reader){settings=reader;},begin(operation){history.begin(operation,settings());},stage(stage){history.stage(stage);},finish(outcome){history.finish(outcome);},
  failure(error,options={}){
    history.failure(error,{settings:settings(),...options});$('report-failure').hidden=false;
    if(options.source==='application'){$('status').textContent='An application error occurred. You can report it here.';$('status').className='status error';}
  },
};
sourceChanged(null);
for(const id of ['report-problem','report-failure'])$(id).addEventListener('click',open);
$('report-close').addEventListener('click',()=>$('report-panel').close());
$('report-panel').addEventListener('close',()=>{clearScreenshot();selectSource(loadedSource);returnFocus?.focus();});
$('report-refresh').addEventListener('click',()=>{snapshot=history.snapshot(settings());refreshPreview();});
for(const id of ['report-observed','report-description','report-expected'])$(id).addEventListener('input',refreshPreview);
for(const id of ['report-include-source','report-include-screenshot'])$(id).addEventListener('change',refreshPreview);
$('report-choose-source').addEventListener('click',()=>$('report-source-file').click());
$('report-source-file').addEventListener('change',event=>{
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file)return;
  try{sourceFilename(file);selectSource(file,true);}catch(error){notice(error.message);}
});
$('report-use-loaded').addEventListener('click',()=>selectSource(loadedSource,true));
$('report-remove-screenshot').addEventListener('click',()=>{clearScreenshot();refreshPreview();});
async function takeScreenshot(reader){
  clearScreenshot();const generation=attachmentGeneration;$('report-capture').disabled=true;refreshPreview();
  try{
    const blob=await reader();if(generation!==attachmentGeneration)return;
    if(screenshotUrl)URL.revokeObjectURL(screenshotUrl);screenshot=blob;screenshotUrl=URL.createObjectURL(blob);
    $('report-screenshot-preview').src=screenshotUrl;$('report-screenshot-preview').hidden=false;
    $('report-include-screenshot').disabled=false;$('report-include-screenshot').checked=true;$('report-remove-screenshot').hidden=false;
    refreshPreview();notice('Screenshot ready. Review the image below; uncheck it to exclude it from the ZIP.');
  }catch{if(generation===attachmentGeneration)notice('Screenshot unavailable. Choose a saved PNG, JPEG or WebP screenshot up to 8 MiB, or download the text report.');}
  finally{if(generation===attachmentGeneration)$('report-capture').disabled=false;}
}
$('report-capture').addEventListener('click',()=>takeScreenshot(()=>capturePreview(prepareScreenshot)));
$('report-choose-screenshot').addEventListener('click',()=>$('report-screenshot-file').click());
$('report-screenshot-file').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)return takeScreenshot(()=>screenshotFile(file));});
$('report-zip').addEventListener('click',async()=>{
  // Freeze selected files and report together before any asynchronous reads.
  const text=$('report-preview').value,file=$('report-include-source').checked?source:null,picture=$('report-include-screenshot').checked?screenshot:null;
  $('report-zip').disabled=true;
  try{
    const files=[{filename:'solidcraft-diagnostic-report.txt',data:new TextEncoder().encode(text)}];
    if(file)files.push({filename:sourceFilename(file),data:new Uint8Array(await file.arrayBuffer())});
    if(picture)files.push({filename:'screenshot.png',data:new Uint8Array(await picture.arrayBuffer())});
    download(new Blob([reportZip(files)],{type:'application/zip'}),'solidcraft-problem-report.zip');
    notice('Report ZIP downloaded. To share it, open the GitHub draft and attach the ZIP.');
  }catch{notice('The report ZIP could not be saved. Try again or download the diagnostic text report.');}
  finally{$('report-zip').disabled=false;}
});
$('report-copy').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('report-preview').value);notice('Report copied. Review it again wherever you paste it.');}
  catch{$('report-preview').focus();$('report-preview').select();notice('Clipboard unavailable. The report is selected; use your browser’s Copy command or download it.');}
});
$('report-download').addEventListener('click',()=>{
  download(new Blob([$('report-preview').value],{type:'text/plain;charset=utf-8'}),'solidcraft-diagnostic-report.txt');
  notice('Diagnostic report downloaded locally. No files or diagnostics were uploaded.');
});
function download(blob,filename){
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('report-github').addEventListener('click',()=>{
  // Navigate synchronously from the gesture; clipboard failure cannot block the draft.
  window.open(githubDraftUrl(),'_blank','noopener,noreferrer');
  navigator.clipboard?.writeText($('report-preview').value).then(()=>notice('Report copied. Paste it into the GitHub draft and attach the reviewed ZIP if you want to share the files.'),()=>notice('Draft opened. Copy or download the report, then paste it into GitHub. Attach the reviewed ZIP to include the files.'));
  notice('GitHub draft opened. Paste the reviewed report and attach the ZIP there.');
});
// Independent of app.js and its imports, WASM and worker lifetime. No event
// target, filename, source URL, stack or DOM content is recorded.
window.addEventListener('error',event=>reporting.failure(event.error??event.message,{source:'application'}),true);
window.addEventListener('unhandledrejection',event=>reporting.failure(event.reason,{source:'application'}));
for(const name of window.__takeConverterStartupFailures?.()??[])reporting.failure({name},{source:'application'});
