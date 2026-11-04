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
  constructor(canvas, overlay, caption, onFailure) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.caption = caption;
    this.available = true;
    this.view = 'iso';
    this.mesh = null;
    this.baseHeight = 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0xeff2ed, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x607767, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1, -2, 3); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd7e7df, 1.2);
    fill.position.set(-2, 1, -1); this.scene.add(fill);
    this.model = new THREE.Group(); this.scene.add(this.model);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.available = false; this.controls?.dispose();
      onFailure('The 3D preview stopped. Reload the page to restore the viewer.');
    });
    canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
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
    this.controls?.dispose(); this.controls = null;
    for (const child of [...this.model.children]) {
      child.geometry.dispose(); child.material.dispose(); this.model.remove(child);
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
      color: 0xa0b9ad, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    })));
    this.model.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28),
      new THREE.LineBasicMaterial({ color: 0x5c7d70, transparent: true, opacity: 0.45 })));
    if(analysis?.tube_end_profiles){
      for(const contour of analysis.ak_contours){
        const f=contour.face;
        const points=tubeProfilePoints(analysis,contour).map(p=>new THREE.Vector3(...p));
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({color:0xd67743,depthTest:false}));
        line.userData.profileFace=f;line.renderOrder=10;this.model.add(line);
      }
    }
    this.setView('iso');
  }

  setView(view) {
    if (!this.mesh || !this.available) return;
    this.view = view;
    for(const child of this.model.children)if(child.userData.profileFace)child.visible=child.userData.profileFace===view;
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
    this.overlay.replaceChildren(); this.tags = [];
    const faces = this.analysis?.working_faces ?? [];
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
