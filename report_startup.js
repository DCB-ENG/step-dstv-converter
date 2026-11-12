// Runs before module fetching. Keep only bounded static types, never events,
// messages, resource URLs, filenames, stacks or document content.
(()=>{
  const failures=[];
  const capture=event=>{
    const name=event.error?.name;
    failures.push(['Error','TypeError','ReferenceError','SyntaxError','RangeError','RuntimeError'].includes(name)?name:'Unknown');
    if(failures.length>20)failures.shift();
  };
  window.addEventListener('error',capture,true);
  window.__takeConverterStartupFailures=()=>{
    window.removeEventListener('error',capture,true);
    delete window.__takeConverterStartupFailures;
    return failures;
  };
})();
