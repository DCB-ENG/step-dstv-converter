// Identity uses verified local analytic contours, never meshes, area, bounds or
// rounded NC1 alone. Translation is already removed by the native batch reader.
// This epsilon only absorbs floating point noise; it is not a machining allowance.
export const IDENTITY_EPS_MM=1e-7;
const EPS=IDENTITY_EPS_MM/4,TAU=2*Math.PI;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const vector=p=>Array.isArray(p)&&p.length===2&&p.every(finite);
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const distance=(a,b)=>Math.hypot(...sub(a,b));
function intervals(start,sweep){const a=((sweep<0?start+sweep:start)%TAU+TAU)%TAU,b=a+Math.abs(sweep);return b<=TAU?[[a,b]]:[[a,TAU],[0,b-TAU]];}
function covered(lo,hi,spans,eps){
  spans=spans.filter(([a,b])=>b>lo&&a<hi).map(([a,b])=>[Math.max(a,lo),Math.min(b,hi)]).sort((a,b)=>a[0]-b[0]);
  let end=lo;for(const [a,b]of spans){if(a>end+eps)return false;end=Math.max(end,b);}return end>=hi-eps;
}
function contour(loop,origin){
  if(!Array.isArray(loop?.segs)||!loop.segs.length||loop.segs.length>512)return null;
  const result=[];
  for(const s of loop.segs){
    if(s.type==='line'&&vector(s.a)&&vector(s.b)&&distance(s.a,s.b)>EPS)result.push({type:'line',a:sub(s.a,origin),b:sub(s.b,origin)});
    else if(s.type==='arc'&&vector(s.center)&&[s.radius,s.start,s.sweep].every(finite)&&s.radius>EPS&&Math.abs(s.sweep)>0&&Math.abs(s.sweep)<=TAU+1e-12)result.push({...s,center:sub(s.center,origin)});
    else return null;
  }
  return result;
}
function accounted(s,targets){
  if(s.type==='line'){
    const v=sub(s.b,s.a),length=Math.hypot(...v),dir=v.map(n=>n/length),spans=[];
    for(const t of targets){if(t.type!=='line')continue;const a=sub(t.a,s.a),b=sub(t.b,s.a);if(Math.abs(a[0]*dir[1]-a[1]*dir[0])>EPS||Math.abs(b[0]*dir[1]-b[1]*dir[0])>EPS)continue;const x=dot(a,dir),y=dot(b,dir);spans.push([Math.min(x,y),Math.max(x,y)]);}
    return covered(0,length,spans,EPS);
  }
  const spans=targets.filter(t=>t.type==='arc'&&distance(t.center,s.center)<=EPS&&Math.abs(t.radius-s.radius)<=EPS).flatMap(t=>intervals(t.start,t.sweep));
  return intervals(s.start,s.sweep).every(([a,b])=>covered(a,b,spans,EPS/s.radius));
}
function sameContour(a,b){return a&&b&&a.every(s=>accounted(s,b))&&b.every(s=>accounted(s,a));}
function geometry(analysis){
  const p=analysis?.plate;
  if(analysis?.family!=='PLATE'||typeof analysis.suggested_profile!=='string'||!analysis.suggested_profile||!p||!Array.isArray(p.origin)||p.origin.length!==3||!p.origin.every(finite)||![p.thickness_mm,analysis.length_mm,analysis.height_mm].every(finite)||p.thickness_mm<=0||analysis.length_mm<=0||analysis.height_mm<=0||!Array.isArray(p.region?.holes)||p.region.holes.length>32)return null;
  const origin=[p.origin[0],p.origin[2]],outer=contour(p.region.outer,origin),holes=p.region.holes.map(h=>contour(h,origin));
  if(!outer||holes.some(h=>!h))return null;
  return {outer,holes,thickness:p.thickness_mm,length:analysis.length_mm,height:analysis.height_mm,profile:analysis.suggested_profile};
}
export function identicalPlates(a,b){
  a=geometry(a);b=geometry(b);
  if(!a||!b||a.profile!==b.profile||['thickness','length','height'].some(k=>Math.abs(a[k]-b[k])>EPS)||a.holes.length!==b.holes.length||!sameContour(a.outer,b.outer))return false;
  const used=new Set();
  for(const hole of a.holes){const index=b.holes.findIndex((other,i)=>!used.has(i)&&sameContour(hole,other));if(index<0)return false;used.add(index);}return true;
}
export function identicalPartGroups(parts){
  if(!Array.isArray(parts)||!parts.length||parts.length>16)throw Error('Check a bounded DXF batch first.');
  const groups=[];
  for(let i=0;i<parts.length;i++){
    // Complete-link matching prevents tolerance chaining through a representative.
    const group=groups.find(g=>g.every(j=>identicalPlates(parts[i].analysis,parts[j].analysis)));
    if(group)group.push(i);else groups.push([i]);
  }
  return groups;
}
export function groupedRequests(options,groups){
  if(!Array.isArray(options)||!options.length||options.length>16||!Array.isArray(groups))throw Error('Invalid part quantities.');
  const seen=new Set(),names=new Set();
  for(const option of options){
    if(!option.orientation_confirmed)throw Error('Confirm the origin and direction of every part.');
    if(option.markings?.length)throw Error('Combined and ZIP exports require markings off. Export marked parts separately.');
    if(!Number.isInteger(option.quantity)||option.quantity<1||option.quantity>9999)throw Error('Each part quantity must be 1–9999.');
    if(!/^[A-Za-z0-9_-]{1,70}$/.test(option.part_mark)||names.has(option.part_mark.toLowerCase()))throw Error('Every part needs a unique valid mark.');
    names.add(option.part_mark.toLowerCase());
  }
  const jobs=groups.map(indices=>{
    if(!Array.isArray(indices)||!indices.length)throw Error('Invalid identical-part group.');
    let total=0,first;
    for(const index of indices){
      if(!Number.isInteger(index)||index<0||index>=options.length||seen.has(index))throw Error('Every part must occur in exactly one output group.');
      seen.add(index);const option=options[index];first??=option;
      if(['profile','grade','mode'].some(key=>first[key]!==option[key])||Boolean(first.shaped_holes)!==Boolean(option.shaped_holes))throw Error('Different job details cannot be combined. Keep the parts separate.');
      total+=option.quantity;
    }
    if(total>9999)throw Error('Combined quantity exceeds 9999. Reduce the number of drawing sets or keep separate.');
    return {indices:[...indices],options:{...first,quantity:total}};
  });
  if(seen.size!==options.length)throw Error('Every detected part must be included.');return jobs;
}
export function exportBatchFiles(batch,options,combine=false){
  // Read current retained solids again. A UI identity label never authorises merging.
  const parts=JSON.parse(batch.parts());
  if(options?.length!==parts.length)throw Error('Check the complete DXF batch first.');
  const groups=combine?identicalPartGroups(parts):parts.map((_,i)=>[i]);
  return groupedRequests(options,groups).map(job=>{
    let text;
    for(const index of job.indices){
      const candidate=batch.export_part(index,JSON.stringify(job.options));
      if(text!==undefined&&candidate!==text)throw Error('Matching parts produced different verified NC1 records. Keep them separate.');
      text=candidate;
    }
    return {filename:job.options.part_mark+'.nc1',text,quantity:job.options.quantity,members:job.indices};
  });
}
