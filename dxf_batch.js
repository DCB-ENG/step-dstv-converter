export function partMark(prefix,index){
  if(!Number.isInteger(index)||index<0||index>=16)throw Error('Invalid part index.');
  if(!/^[A-Za-z0-9_-]{1,66}$/.test(prefix))throw Error('Use a part-mark prefix of 1–66 letters, numbers, underscores or hyphens.');
  return prefix+'_P'+String(index+1).padStart(2,'0');
}
export class DxfPartReview{
  constructor(){this.clear();}
  clear(){this.parts=[];this.groups=[];this.combineIdentical=false;this.activePart=0;this.confirmed=new Set();}
  get assembly(){return this.parts.some(p=>p.source_type==='step-assembly');}
  setParts(parts,groups=parts.map((_,i)=>[i])){
    if(!Array.isArray(parts)||parts.length>16||parts.some((p,i)=>p.index!==i||(p.source_type==='step-assembly'?(!p.analysis&&!p.error):(!p.analysis||p.drawing_bounds_mm?.length!==4))))throw Error('Invalid detected-part list. Recheck the DXF.');
    const indices=groups.flat();if(indices.length!==parts.length||new Set(indices).size!==parts.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=parts.length)||groups.some(g=>!Array.isArray(g)||!g.length))throw Error('Invalid identical-part groups. Recheck the DXF.');
    this.clear();this.parts=parts;this.groups=groups.map(g=>[...g]);
  }
  select(index){if(!Number.isInteger(index)||index<0||index>=this.parts.length)throw Error('Invalid part selection.');this.activePart=index;}
  confirm(checked){if(this.parts.length>1){if(checked)this.confirmed.add(this.activePart);else this.confirmed.delete(this.activePart);}}
  options(common,index=this.activePart){
    if(this.parts.length<2)return common;
    if(!this.parts[index])throw Error('Invalid part selection.');
    if(this.parts[index].error)throw Error('This member is unsupported: '+this.parts[index].error);
    return {...common,part_mark:partMark(common.part_mark,index),profile:this.parts[index].analysis.suggested_profile};
  }
  allOptions(common){
    if(this.parts.some(p=>p.error))throw Error('Complete ZIP is blocked: one or more assembly members are unsupported. Supported members can be downloaded individually.');
    if(this.parts.length<2||this.confirmed.size!==this.parts.length)throw Error('Review and confirm the origin and direction of every part.');
    if(common.markings?.length)throw Error('Turn off markings for ZIP export, or download marked parts individually.');
    if(this.combineIdentical&&(!Number.isInteger(common.quantity)||common.quantity<1||this.groups.some(g=>common.quantity*g.length>9999)))throw Error('Combined quantity must be 1–9999. Reduce the number of drawing sets or keep separate.');
    return this.parts.map((_,index)=>this.options({...common,orientation_confirmed:true,markings:[]},index));
  }
}
