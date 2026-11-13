import * as THREE from './vendor/three/three.module.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';

export function facePoint(analysis,face,x,q){
  const guide=analysis.working_faces.find(g=>g.face===face);
  if(!guide||!guide.q_direction)throw new Error('Missing verified face coordinate frame');
  return guide.origin.map((v,i)=>v+(i===0?(guide.x_reversed?-x:x):0)+guide.q_direction[i]*q);
}
export function tubeProfilePoints(analysis,contour){
  return contour.points_mm.map(([x,q])=>facePoint(analysis,contour.face,x,q));
}

export function textBoxPoints(mark) {
  const a=mark.angle_deg*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  const {x_mm:x,q_mm:q,reserved_width_mm:w,height_mm:h}=mark;
  return [[x,q],[x+c*w,q+s*w],[x+c*w-s*h,q+s*w+c*h],[x-s*h,q+c*h]];
}

// Invert the same verified face basis used to draw markings, including angle U.
export function faceCoordinates(analysis,face,point) {
  const o=new THREE.Vector3(...facePoint(analysis,face,0,0));
  const x=new THREE.Vector3(...facePoint(analysis,face,1,0)).sub(o);
  const q=new THREE.Vector3(...facePoint(analysis,face,0,1)).sub(o);
  const d=point.clone().sub(o);
  return [d.dot(x)/x.lengthSq(),d.dot(q)/q.lengthSq()];
}

function disposeObject(object) {
  object.geometry.dispose(); object.material.map?.dispose(); object.material.dispose();
}

function textTexture(mark) {
  const canvas=document.createElement('canvas');
  const ratio=mark.reserved_width_mm/mark.height_mm;
  canvas.width=Math.min(2048,Math.max(64,Math.round(256*ratio)));
  canvas.height=Math.min(2048,Math.max(64,Math.round(canvas.width/ratio)));
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(10, 25, 40, 0.45)'; ctx.fillRect(0,0,canvas.width,canvas.height);
  let size=canvas.height*0.8;
  ctx.font=`600 ${size}px monospace`;
  size*=Math.min(1,canvas.width*0.94/Math.max(ctx.measureText(mark.text).width,1));
  ctx.font=`600 ${size}px monospace`;ctx.fillStyle='#ecf5ff';ctx.textBaseline='middle';
  ctx.fillText(mark.text,canvas.width*0.03,canvas.height/2);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

// Camera state is display-only. Never rotate the imported mesh or the NC1 frame.
export function viewFrame(view, analysis) {
  const guide = analysis?.working_faces.find(face => face.face === view);
  const piece=analysis?.coordinate_system;
  if(piece&&view!=='iso'){
    const neg=v=>v.map(x=>-x);
    const frames={v:{direction:piece.z,up:piece.y},h:{direction:neg(piece.z),up:piece.y},o:{direction:piece.y,up:neg(piece.z)},u:{direction:neg(piece.y),up:piece.z}};
    return {...frames[view],guide};
  }
  const side = guide?.view ?? view;
  const frames = {
    iso: { direction: [1, -1.6, 1], up: [0, 0, 1] },
    v: { direction: [0, -1, 0], up: [0, 0, 1] },
    h: { direction: [0, 1, 0], up: [0, 0, 1] },
    o: { direction: [0, 0, 1], up: [0, 1, 0] },
    u: { direction: [0, 0, -1], up: [0, -1, 0] },
  };
  return { ...frames[side], guide };
}

export function fitHeight(bounds, quaternion, aspect) {
  const inverse = quaternion.clone().invert();
  const size = bounds.max.map((value, i) => value - bounds.min[i]);
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    const point = new THREE.Vector3(x * size[0], y * size[1], z * size[2]).applyQuaternion(inverse);
    lo[0] = Math.min(lo[0], point.x); hi[0] = Math.max(hi[0], point.x);
    lo[1] = Math.min(lo[1], point.y); hi[1] = Math.max(hi[1], point.y);
  }
  return Math.max(hi[1] - lo[1], (hi[0] - lo[0]) / aspect, 0.001) * 1.22;
}

export function originGuide(bounds, analysis, view) {
  const guide = analysis?.working_faces.find(face => face.face === view)
    ?? analysis?.working_faces.find(face => face.machining);
  const origin = guide?.origin ?? bounds.min;
  const reversed = guide?.x_reversed ?? false;
  return { origin, end: [reversed ? bounds.min[0] : bounds.max[0], origin[1], origin[2]], reversed };
}

export class StepViewer {
  constructor(canvas, overlay, caption, onFailure, onMarkingMove) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.caption = caption;
    this.available = true;
    this.view = 'iso';
    this.mesh = null;
    this.baseHeight = 1;
    this.onMarkingMove = onMarkingMove;
    this.markingEditable = true;
    this.markingDrag = null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x11161c, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x536171, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1, -2, 3); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6dfe9, 1.2);
    fill.position.set(-2, 1, -1); this.scene.add(fill);
    this.model = new THREE.Group(); this.scene.add(this.model);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.endMarkingDrag(); this.available = false; this.controls?.dispose();
      onFailure('The 3D preview stopped. Reload the page to restore the viewer.');
    });
    canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
    // Capture a marking before OrbitControls can start orbiting or panning.
    canvas.addEventListener('pointerdown', event => this.startMarkingDrag(event), true);
    canvas.addEventListener('pointermove', event => this.moveMarkingDrag(event), true);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])
      canvas.addEventListener(type, event => this.endMarkingDrag(event), true);
    canvas.addEventListener('keydown', event => {
      if (!this.mesh || !this.available) return;
      if (['+', '=', '-', 'Home'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'Home') this.fit(); else this.zoom(event.key === '-' ? 1 / 1.25 : 1.25);
      }
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }

  clear() {
    this.endMarkingDrag();
    this.controls?.dispose(); this.controls = null;
    for (const child of [...this.model.children]) {
      disposeObject(child); this.model.remove(child);
    }
    this.mesh = null; this.analysis = null; this.arrow = null; this.tags = []; this.overlay.replaceChildren();
    this.caption.textContent = ''; this.render();
  }

  setModel(mesh, analysis) {
    this.clear();
    if (!this.available) return;
    this.mesh = mesh; this.analysis = analysis;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions.flat(), 3));
    geometry.setIndex(mesh.triangles.flat());
    geometry.computeVertexNormals();
    this.model.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0xb9c3cf, roughness: 0.55, metalness: 0.22, flatShading: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    })));
    this.model.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28),
      new THREE.LineBasicMaterial({ color: 0x8190a2, transparent: true, opacity: 0.45 })));
    if(analysis?.tube_end_profiles){
      for(const contour of analysis.ak_contours){
        const f=contour.face;
        const points=tubeProfilePoints(analysis,contour).map(p=>new THREE.Vector3(...p));
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({color:0xff8a2b,depthTest:false}));
        line.userData.profileFace=f;line.renderOrder=10;this.model.add(line);
      }
    }
    this.setView('iso');
  }

  setMarkings(marks) {
    for(const child of [...this.model.children])if(child.userData.markingFace){disposeObject(child);this.model.remove(child);}
    if(!this.analysis)return;
    for(const mark of marks){
      let points=[];
      if(mark.kind==='text'){
        if(!(mark.reserved_width_mm>0&&mark.height_mm>0))continue;
        points=textBoxPoints(mark);points.push(points[0]);
      }else{
        for(let i=0;i<mark.points_mm.length-1;i++){
          const a=mark.points_mm[i],b=mark.points_mm[i+1],r=mark.radii_mm[i],dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);points.push(a);
          if(r&&d>0&&d<=2*Math.abs(r)){
            const h=Math.sqrt(Math.max(0,r*r-d*d/4))*Math.sign(r),c=[(a[0]+b[0])/2-dy/d*h,(a[1]+b[1])/2+dx/d*h],start=Math.atan2(a[1]-c[1],a[0]-c[0]),sweep=2*Math.asin(Math.min(1,d/(2*Math.abs(r))))*Math.sign(r),n=Math.max(2,Math.ceil(Math.abs(sweep)*24/Math.PI));
            for(let j=1;j<n;j++)points.push([c[0]+Math.abs(r)*Math.cos(start+sweep*j/n),c[1]+Math.abs(r)*Math.sin(start+sweep*j/n)]);
          }
        }points.push(mark.points_mm.at(-1));
      }
      if(points.some(p=>!p||p.some(x=>!Number.isFinite(x)))||!this.analysis.working_faces.some(f=>f.face===mark.face&&f.machining))continue;
      const world=points.map(p=>new THREE.Vector3(...facePoint(this.analysis,mark.face,p[0],p[1])));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(world),new THREE.LineBasicMaterial({color:mark.kind==='text'?0x7fc6ff:0xffbd70,depthTest:false}));
      line.userData.markingFace=mark.face;line.renderOrder=12;line.visible=this.view==='iso'||this.view===mark.face;this.model.add(line);
      if(mark.kind==='text'){
        const geometry=new THREE.BufferGeometry().setFromPoints(world.slice(0,4));
        geometry.setIndex([0,1,2,0,2,3]);
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
        const text=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:textTexture(mark),transparent:true,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
        text.userData.markingFace=mark.face;text.userData.textMark={...mark};
        text.renderOrder=11;text.visible=line.visible;this.model.add(text);
      }
    }this.render();
  }

  setMarkingEditable(editable) {
    this.markingEditable=editable;
    if(!editable){this.endMarkingDrag();this.canvas.style.cursor='';}
  }

  markingRay(event) {
    const rect=this.canvas.getBoundingClientRect();
    const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
    this.camera.updateMatrixWorld();this.model.updateMatrixWorld(true);
    const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);return ray;
  }

  markingHit(event) {
    if(!this.analysis||!this.markingEditable||!this.onMarkingMove||!this.available)return null;
    return this.markingRay(event).intersectObjects(this.model.children.filter(c=>c.visible&&c.userData.textMark),false)[0]??null;
  }

  startMarkingDrag(event) {
    if(this.markingDrag||event.button!==0||event.shiftKey||event.ctrlKey||event.metaKey)return;
    const hit=this.markingHit(event);if(!hit)return;
    const mark=hit.object.userData.textMark;
    const origin=new THREE.Vector3(...facePoint(this.analysis,mark.face,0,0));
    const x=new THREE.Vector3(...facePoint(this.analysis,mark.face,1,0)).sub(origin);
    const q=new THREE.Vector3(...facePoint(this.analysis,mark.face,0,1)).sub(origin);
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(x.cross(q).normalize(),origin);
    if(Math.abs(this.markingRay(event).ray.direction.dot(plane.normal))<1e-6)return;
    event.preventDefault();event.stopImmediatePropagation();this.canvas.focus({preventScroll:true});
    this.markingDrag={pointerId:event.pointerId,mark,plane,start:faceCoordinates(this.analysis,mark.face,hit.point)};
    this.controls.enabled=false;this.canvas.setPointerCapture(event.pointerId);this.canvas.style.cursor='grabbing';
  }

  moveMarkingDrag(event) {
    const drag=this.markingDrag;
    if(!drag){this.canvas.style.cursor=this.markingHit(event)?'grab':'';return;}
    if(event.pointerId!==drag.pointerId)return;
    event.preventDefault();event.stopImmediatePropagation();
    const point=this.markingRay(event).ray.intersectPlane(drag.plane,new THREE.Vector3());if(!point)return;
    const [x,q]=faceCoordinates(this.analysis,drag.mark.face,point);
    this.onMarkingMove({x_mm:Number((drag.mark.x_mm+x-drag.start[0]).toFixed(2)),q_mm:Number((drag.mark.q_mm+q-drag.start[1]).toFixed(2))});
  }

  endMarkingDrag(event) {
    const drag=this.markingDrag;if(!drag||(event&&event.pointerId!==drag.pointerId))return;
    event?.preventDefault();event?.stopImmediatePropagation();
    this.markingDrag=null;if(this.controls)this.controls.enabled=true;
    if(this.canvas.hasPointerCapture(drag.pointerId))this.canvas.releasePointerCapture(drag.pointerId);
    this.canvas.style.cursor='';
  }

  setView(view) {
    if (!this.mesh || !this.available) return;
    this.endMarkingDrag();
    this.view = view;
    for(const child of this.model.children)if(child.userData.profileFace)child.visible=child.userData.profileFace===view;
    for(const child of this.model.children)if(child.userData.markingFace)child.visible=view==='iso'||child.userData.markingFace===view;
    const frame = viewFrame(view, this.analysis);
    this.controls?.dispose();
    this.camera.up.fromArray(frame.up);
    const center = this.center(), distance = this.radius() * 3;
    this.camera.position.copy(center).add(new THREE.Vector3(...frame.direction).normalize().multiplyScalar(distance));
    this.camera.lookAt(center);
    // Recreate controls when snapping: OrbitControls caches the camera's up axis.
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(center);
    this.controls.enableRotate = view === 'iso';
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.minZoom = 0.1; this.controls.maxZoom = 100;
    this.controls.listenToKeyEvents(this.canvas);
    this.controls.addEventListener('change', () => this.render());
    this.controls.update();
    this.caption.textContent = view === 'iso'
      ? '3D · orbit / pan / zoom'
      : `${view.toUpperCase()} FACE · viewed from outside · pan / zoom`;
    this.buildGuides(); this.fit();
  }

  center() { return new THREE.Vector3(...this.mesh.bounds.min.map((value, i) => (value + this.mesh.bounds.max[i]) / 2)); }
  radius() { return Math.max(new THREE.Vector3(...this.mesh.bounds.max).sub(new THREE.Vector3(...this.mesh.bounds.min)).length() / 2, 0.001); }

  fit() {
    if (!this.mesh || !this.available) return;
    // Read the current canvas size after a review layout changes its height.
    this.resize();
    const offset = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(this.center());
    this.camera.position.copy(this.controls.target).add(offset.multiplyScalar(this.radius() * 3));
    this.camera.near = this.radius() * 0.001; this.camera.far = this.radius() * 8;
    this.camera.zoom = 1;
    this.camera.lookAt(this.controls.target); this.camera.updateMatrixWorld();
    this.baseHeight = fitHeight(this.mesh.bounds, this.camera.quaternion, this.width / this.height);
    this.resize(); this.controls.update(); this.render();
  }

  zoom(factor) {
    if (!this.mesh || !this.available) return;
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, this.controls.minZoom, this.controls.maxZoom);
    this.camera.updateProjectionMatrix(); this.controls.update(); this.render();
  }

  resize() {
    this.width = Math.max(this.canvas.clientWidth, 1); this.height = Math.max(this.canvas.clientHeight, 1);
    this.renderer.setSize(this.width, this.height, false);
    const halfHeight = this.baseHeight / 2, halfWidth = halfHeight * this.width / this.height;
    this.camera.left = -halfWidth; this.camera.right = halfWidth;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix(); this.render();
  }

  buildGuides() {
    this.overlay.replaceChildren(); this.tags = []; this.arrow = null;
    // An imported display mesh has no verified DSTV origin or working faces.
    if (!this.analysis) return;
    const faces = this.analysis.working_faces;
    for (const face of faces.filter(face => this.view === 'iso' ? face.machining : face.face === this.view)) {
      const label = document.createElement('span'); label.className = 'face-tag'; label.textContent = face.face;
      this.overlay.append(label); this.tags.push({ label, point: face.point });
    }
    const ns = 'http://www.w3.org/2000/svg';
    this.arrow = document.createElementNS(ns, 'svg');
    this.arrow.classList.add('origin-arrow');
    this.arrow.innerHTML = '<defs><marker id="origin-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><line marker-end="url(#origin-arrowhead)"/><circle r="4"/>';
    this.overlay.append(this.arrow);
    this.originLabel = document.createElement('span'); this.originLabel.className = 'origin-label';
    this.originLabel.textContent = 'DSTV X = 0'; this.overlay.append(this.originLabel);
    this.endLabel = document.createElement('span'); this.endLabel.className = 'origin-label';
    this.endLabel.textContent = originGuide(this.mesh.bounds, this.analysis, this.view).reversed ? 'X+ (L − model X)' : 'X+';
    this.overlay.append(this.endLabel);
  }

  project(point) {
    const p = new THREE.Vector3(...point).project(this.camera);
    return { x: (p.x + 1) * this.width / 2, y: (1 - p.y) * this.height / 2, visible: p.z >= -1 && p.z <= 1 };
  }

  place(label, point, dy = 0) {
    label.hidden = !point.visible;
    label.style.left = `${point.x}px`; label.style.top = `${point.y + dy}px`;
  }

  render() {
    if (!this.available) return;
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    if (!this.mesh || !this.arrow) return;
    for (const tag of this.tags) this.place(tag.label, this.project(tag.point));
    const guide = originGuide(this.mesh.bounds, this.analysis, this.view);
    const a = this.project(guide.origin), b = this.project(guide.end);
    this.arrow.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.arrow.style.display = a.visible && b.visible ? '' : 'none';
    const line = this.arrow.querySelector('line');
    for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })) line.setAttribute(key, value);
    const circle = this.arrow.querySelector('circle'); circle.setAttribute('cx', a.x); circle.setAttribute('cy', a.y);
    this.place(this.originLabel, a, 18); this.place(this.endLabel, b, 18);
  }
}
