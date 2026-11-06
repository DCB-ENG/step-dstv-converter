// Read-only drawing inspection. Nothing here establishes cutting geometry or
// supplies entities, dimensions, units or approval to the NC1 writer.
const TAU=2*Math.PI;
const number=value=>{if(value===undefined||!String(value).trim())throw Error('Missing coordinate');const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1e9)throw Error('Invalid or excessive coordinate');return n;};
const point=(x,y)=>[number(x),number(y)];
const xy=p=>`${p[0]} ${-p[1]}`;
export function previewArc(a,b,bulge){
  const dx=b[0]-a[0],dy=b[1]-a[1],chord=Math.hypot(dx,dy);
  if(chord<1e-12||Math.abs(bulge)<1e-12)throw Error('Degenerate bulged edge');
  const k=(1-bulge*bulge)/(4*bulge),center=[(a[0]+b[0])/2-dy*k,(a[1]+b[1])/2+dx*k];
  const radius=chord*(1+bulge*bulge)/(4*Math.abs(bulge));
  if(!Number.isFinite(radius)||radius>1e12)throw Error('Excessive arc radius');
  return {center,radius,start:Math.atan2(a[1]-center[1],a[0]-center[0]),sweep:4*Math.atan(bulge)};
}
function arcExtrema({center,radius,start,sweep}){
  const at=t=>[center[0]+radius*Math.cos(t),center[1]+radius*Math.sin(t)];
  const points=[at(start),at(start+sweep)];
  for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
    const travel=((sweep>0?angle-start:start-angle)%TAU+TAU)%TAU;
    if(travel<=Math.abs(sweep)+1e-10)points.push(at(angle));
  }
  return points;
}
function shape(type,fields){
  const get=(code,fallback)=>fields.find(p=>p[0]===code)?.[1]??fallback;
  if([210,220,230].some((code,i)=>number(get(code,i===2?1:0))!==(i===2?1:0)))throw Error('Non-default extrusion is not drawn');
  let path='',points=[];
  if(type==='LINE'){
    const a=point(get(10),get(20)),b=point(get(11),get(21));points=[a,b];path=`M ${xy(a)} L ${xy(b)}`;
  }else if(type==='CIRCLE'||type==='ARC'){
    const center=point(get(10),get(20)),radius=number(get(40));if(radius<=0)throw Error('Non-positive radius');
    if(type==='CIRCLE'){
      points=[[center[0]-radius,center[1]-radius],[center[0]+radius,center[1]+radius]];
      path=`M ${xy([center[0]+radius,center[1]])} a ${radius} ${radius} 0 1 0 ${-2*radius} 0 a ${radius} ${radius} 0 1 0 ${2*radius} 0`;
    }else{
      const start=number(get(50))*Math.PI/180,end=number(get(51))*Math.PI/180;
      const sweep=((end-start)%TAU+TAU)%TAU;if(sweep<1e-12)throw Error('Ambiguous zero/full arc');
      points=arcExtrema({center,radius,start,sweep});
      path=`M ${xy(points[0])} A ${radius} ${radius} 0 ${Number(sweep>Math.PI)} 0 ${xy(points[1])}`;
    }
  }else if(type==='LWPOLYLINE'){
    const vertices=[];let vertex;
    for(const [code,value]of fields){
      if(code===10){if(vertices.length>=4096)throw Error('Too many polyline vertices');vertex=[number(value),undefined,0];vertices.push(vertex);}
      else if(code===20){if(!vertex||vertex[1]!==undefined)throw Error('Invalid polyline coordinates');vertex[1]=number(value);}
      else if(code===42){if(!vertex)throw Error('Bulge without vertex');vertex[2]=number(value);}
    }
    if(vertices.length<2||vertices.some(v=>v[1]===undefined)||number(get(90))!==vertices.length)throw Error('Invalid polyline vertex count');
    const closed=(number(get(70,0))&1)!==0;
    points=vertices.map(v=>v.slice(0,2));path=`M ${xy(vertices[0])}`;
    for(let i=0;i<vertices.length-(closed?0:1);i++){
      const a=vertices[i],b=vertices[(i+1)%vertices.length];
      if(a[2]){const arc=previewArc(a,b,a[2]);points.push(...arcExtrema(arc));path+=` A ${arc.radius} ${arc.radius} 0 ${Number(Math.abs(arc.sweep)>Math.PI)} ${Number(arc.sweep<0)} ${xy(b)}`;}
      else path+=` L ${xy(b)}`;
    }
    if(closed)path+=' Z';
  }else return null;
  return {path,bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};
}
export function parseDxfPreview(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>2*1024*1024)throw Error('DXF preview limit is 2 MiB');
  if(text.startsWith('AutoCAD Binary DXF'))throw Error('Binary DXF preview is unsupported');
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);while(lines.at(-1)==='')lines.pop();
  if(lines.length%2||lines.length>400000)throw Error('Incomplete or excessive DXF group data');
  const pairs=[];
  for(let i=0;i<lines.length;i+=2){if(!/^\s*\d+\s*$/.test(lines[i]))throw Error('Invalid DXF group code');pairs.push([Number(lines[i]),lines[i+1].trim()]);}
  let start=-1,end=-1,units=null;
  for(let i=0;i<pairs.length;i++){
    if(pairs[i][0]===9&&pairs[i][1]==='$INSUNITS'&&pairs[i+1]?.[0]===70)units=Number(pairs[i+1][1]);
    if(pairs[i][0]===0&&pairs[i][1]==='SECTION'&&pairs[i+1]?.[0]===2&&pairs[i+1][1]==='ENTITIES'){
      if(start!==-1)throw Error('Multiple ENTITIES sections');start=i+2;
      for(let j=start;j<pairs.length;j++)if(pairs[j][0]===0&&pairs[j][1]==='ENDSEC'){end=j;break;}
    }
  }
  if(start<0||end<start||!pairs.some(p=>p[0]===0&&p[1]==='EOF'))throw Error('Missing or incomplete DXF ENTITIES section / EOF');
  const entities=[],layers=new Map(),warnings=[];let entityCount=0,omitted=0,annotations=0;
  for(let i=start;i<end;){
    if(pairs[i][0]!==0)throw Error('Entity record has no type');
    const type=pairs[i++][1],fields=[];while(i<end&&pairs[i][0]!==0)fields.push(pairs[i++]);
    if(++entityCount>20000)throw Error('DXF preview limit is 20,000 entities');
    const layer=fields.find(p=>p[0]===8)?.[1]??'0';
    if(!layers.has(layer))layers.set(layer,{name:layer,total:0,drawn:0,omitted:0,types:{}});
    const summary=layers.get(layer);summary.total++;summary.types[type]=(summary.types[type]??0)+1;
    let geometry;
    try{geometry=shape(type,fields);}catch(error){if(warnings.length<8)warnings.push(`${type} on ${layer}: ${error.message}`);}
    if(geometry){entities.push({type,layer,...geometry});summary.drawn++;}
    else{summary.omitted++;omitted++;if(['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(type))annotations++;}
  }
  const bounds=entities.length?[Math.min(...entities.map(e=>e.bounds[0])),Math.min(...entities.map(e=>e.bounds[1])),Math.max(...entities.map(e=>e.bounds[2])),Math.max(...entities.map(e=>e.bounds[3]))]:null;
  return {entities,layers:[...layers.values()],bounds,entityCount,omitted,annotations,warnings,declaredUnits:units===4?'mm':units===1?'inch':null};
}

const SVG='http://www.w3.org/2000/svg';
export class DxfDrawingPreview{
  constructor(svg){
    this.svg=svg;this.drawing=null;this.view=null;this.drag=null;
    svg.addEventListener('wheel',event=>{if(!this.view)return;event.preventDefault();this.zoom(event.deltaY<0?1.2:1/1.2);},{passive:false});
    svg.addEventListener('pointerdown',event=>{if(!this.view)return;svg.focus({preventScroll:true});svg.setPointerCapture(event.pointerId);this.drag=[event.clientX,event.clientY,...this.view];});
    svg.addEventListener('pointermove',event=>{if(!this.drag)return;const rect=svg.getBoundingClientRect(),[x,y,vx,vy,w,h]=this.drag;const scale=Math.max(w/rect.width,h/rect.height);this.view=[vx-(event.clientX-x)*scale,vy-(event.clientY-y)*scale,w,h];this.apply();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,()=>this.drag=null);
    svg.addEventListener('keydown',event=>{if(!this.view)return;if(['Home','+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();if(event.key==='Home')this.fit();else if(['+','=','-'].includes(event.key))this.zoom(event.key==='-'?1/1.25:1.25);else{this.view[0]+=({'ArrowLeft':-1,'ArrowRight':1}[event.key]??0)*this.view[2]*.08;this.view[1]+=({'ArrowUp':-1,'ArrowDown':1}[event.key]??0)*this.view[3]*.08;this.apply();}}});
  }
  clear(){this.drawing=null;this.view=null;this.svg.replaceChildren();}
  setDrawing(drawing,selected=[]){
    this.drawing=drawing;this.svg.replaceChildren();
    for(const entity of drawing.entities){const path=document.createElementNS(SVG,'path');path.setAttribute('d',entity.path);path.setAttribute('class',selected.length?(selected.includes(entity.layer)?'cut-layer':'other-layer'):'drawing-layer');const title=document.createElementNS(SVG,'title');title.textContent=`${entity.layer} · ${entity.type}`;path.append(title);this.svg.append(path);}
    this.fit();
  }
  setPartLabels(parts,units,active,onSelect){
    const k=units==='inch'?25.4:1;
    for(const part of parts){
      const [x0,y0,x1,y1]=part.drawing_bounds_mm.map(v=>v/k),size=Math.max(x1-x0,y1-y0)*.12;
      const group=document.createElementNS(SVG,'g');group.setAttribute('class','part-map-target'+(part.index===active?' active':''));group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',part.name);
      const rect=document.createElementNS(SVG,'rect');for(const [key,value]of Object.entries({x:x0,y:-y1,width:x1-x0,height:y1-y0}))rect.setAttribute(key,value);
      const text=document.createElementNS(SVG,'text');text.setAttribute('x',(x0+x1)/2);text.setAttribute('y',-(y0+y1)/2);text.setAttribute('font-size',size);text.setAttribute('text-anchor','middle');text.textContent=String(part.index+1);group.append(rect,text);
      group.addEventListener('pointerdown',e=>e.stopPropagation());group.addEventListener('click',()=>onSelect(part.index));group.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelect(part.index);}});this.svg.append(group);
    }
  }
  fit(){if(!this.drawing?.bounds)return;const [x0,y0,x1,y1]=this.drawing.bounds,w=Math.max(x1-x0,.01),h=Math.max(y1-y0,.01),pad=Math.max(w,h)*.08;this.view=[x0-pad,-y1-pad,w+2*pad,h+2*pad];this.apply();}
  zoom(factor){if(!this.view)return;const [x,y,w,h]=this.view,newW=w/factor,newH=h/factor;if(newW<1e-6||newW>1e12)return;this.view=[x+(w-newW)/2,y+(h-newH)/2,newW,newH];this.apply();}
  apply(){if(this.view)this.svg.setAttribute('viewBox',this.view.join(' '));}
}
