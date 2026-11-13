import {DiagnosticHistory,formatReport,githubDraftUrl} from './report_diagnostics.js?build=74b578752c51';
const $=id=>document.getElementById(id);
const failureButton=document.createElement('button');failureButton.id='report-failure';failureButton.type='button';failureButton.className='button quiet report-failure';failureButton.textContent='Report this problem';failureButton.hidden=true;$('status').after(failureButton);
const history=new DiagnosticHistory({build:$('report-panel').dataset.build,userAgent:navigator.userAgent});
let settings=()=>({}),snapshot=null,returnFocus=null;
const notice=text=>{$('report-feedback').textContent=text;};
function refreshPreview(){
  $('report-preview').value=formatReport({observed:$('report-observed').value,description:$('report-description').value,expected:$('report-expected').value,diagnostics:snapshot});
  notice('Review the text below before copying, downloading or opening GitHub.');
}
function open(){
  snapshot=history.snapshot(settings());refreshPreview();
  if(!$('report-panel').open){returnFocus=document.activeElement;$('report-panel').showModal();}
}
export const reporting={
  settings(reader){settings=reader;},begin(operation){history.begin(operation,settings());},stage(stage){history.stage(stage);},finish(outcome){history.finish(outcome);},
  failure(error,options={}){
    history.failure(error,{settings:settings(),...options});$('report-failure').hidden=false;
    if(options.source==='application'){$('status').textContent='An application error occurred. You can report it here.';$('status').className='status error';}
  },
};
for(const id of ['report-problem','report-failure'])$(id).addEventListener('click',open);
$('report-close').addEventListener('click',()=>$('report-panel').close());
$('report-panel').addEventListener('close',()=>returnFocus?.focus());
$('report-refresh').addEventListener('click',()=>{snapshot=history.snapshot(settings());refreshPreview();});
for(const id of ['report-observed','report-description','report-expected'])$(id).addEventListener('input',refreshPreview);
$('report-copy').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('report-preview').value);notice('Report copied. Review it again wherever you paste it.');}
  catch{$('report-preview').focus();$('report-preview').select();notice('Clipboard unavailable. The report is selected; use your browser’s Copy command or download it.');}
});
$('report-download').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([$('report-preview').value],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='solidcraft-diagnostic-report.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  notice('Diagnostic report downloaded locally. No files or diagnostics were uploaded.');
});
$('report-github').addEventListener('click',()=>{
  // Navigate synchronously from the gesture; clipboard failure cannot block the draft.
  window.open(githubDraftUrl(),'_blank','noopener,noreferrer');
  navigator.clipboard?.writeText($('report-preview').value).then(()=>notice('Report copied. Paste it into the GitHub draft, review, then submit it yourself. Optional attachments are public.'),()=>notice('Draft opened. Copy or download the report, then paste it into GitHub. Nothing has been submitted.'));
  notice('GitHub draft opened in a new tab. Paste the reviewed report there. Nothing has been submitted.');
});
// Independent of app.js and its imports, WASM and worker lifetime. No event
// target, filename, source URL, stack or DOM content is recorded.
window.addEventListener('error',event=>reporting.failure(event.error??event.message,{source:'application'}),true);
window.addEventListener('unhandledrejection',event=>reporting.failure(event.reason,{source:'application'}));
for(const name of window.__takeConverterStartupFailures?.()??[])reporting.failure({name},{source:'application'});
