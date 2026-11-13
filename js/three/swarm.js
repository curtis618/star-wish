// 衛星群：所有衛星用「一個 Points + 一個 LineSegments」畫完（2 個 draw call）。
// 位置每 100ms 更新一次（衛星 0.1 秒只移動約 0.76 km，肉眼看不出差別）。
import * as THREE from 'three';
import { eciAt, eciAtU, toScene } from '../core/orbit.js';

const COLOR_OTHER = new THREE.Color('#7fd0ff');
const COLOR_MINE = new THREE.Color('#ffcc66');
const COLOR_NEW = new THREE.Color('#ffffff');
const RING_SEG = 96;
const UPDATE_MS = 100;

/**
 * @param {Array} sats 由 schedule.getSatellite() 產生的衛星
 * @param {{ mine?: Set<number>, ringsFor?: (sat)=>boolean }} opts
 */
export function createSwarm(sats, opts = {}) {
  const mine = opts.mine || new Set();
  const group = new THREE.Group();
  group.name = 'swarm';
  const n = sats.length;

  // ---- 光點 ----
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: window.devicePixelRatio || 1 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute vec3 color; varying vec3 vC; uniform float uPx;
      void main(){
        vC = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPx * (170.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = smoothstep(0.35, 0.0, d);
        float halo = smoothstep(1.0, 0.0, d) * 0.45;
        float a = core + halo;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC * (0.6 + core), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // ---- 軌道環 ----
  const ringSats = sats.filter((s) => (opts.ringsFor ? opts.ringsFor(s) : true));
  const rPos = new Float32Array(ringSats.length * RING_SEG * 2 * 3);
  const rCol = new Float32Array(ringSats.length * RING_SEG * 2 * 3);
  const p = {}, v = new THREE.Vector3(), v2 = new THREE.Vector3();
  ringSats.forEach((sat, k) => {
    const c = mine.has(sat.slot) ? COLOR_MINE.clone().multiplyScalar(0.45) : COLOR_OTHER.clone().multiplyScalar(0.075);
    for (let i = 0; i < RING_SEG; i++) {
      toScene(eciAtU(sat, (i / RING_SEG) * Math.PI * 2, p), v);
      toScene(eciAtU(sat, ((i + 1) / RING_SEG) * Math.PI * 2, p), v2);
      const o = (k * RING_SEG + i) * 6;
      rPos.set([v.x, v.y, v.z, v2.x, v2.y, v2.z], o);
      rCol.set([c.r, c.g, c.b, c.r, c.g, c.b], o);
    }
  });
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  rGeo.setAttribute('color', new THREE.BufferAttribute(rCol, 3));
  const rings = new THREE.LineSegments(
    rGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(rings);

  let lastUpdate = -Infinity;
  const newestSlot = sats.length ? Math.max(...sats.map((s) => s.slot)) : -1;

  function update(t, force = false) {
    if (!force && t - lastUpdate < UPDATE_MS) return;
    lastUpdate = t;
    for (let i = 0; i < n; i++) {
      const sat = sats[i];
      toScene(eciAt(sat, t, p), v);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      const isMine = mine.has(sat.slot);
      const isNew = sat.slot === newestSlot;
      const c = isMine ? COLOR_MINE : isNew ? COLOR_NEW : COLOR_OTHER;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = isMine ? 3.4 : isNew ? 3.0 + Math.sin(t / 300) * 0.8 : 2.0;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }

  /** 螢幕座標挑選最近的衛星（比 raycast 便宜，只有幾十顆） */
  function pick(clientX, clientY, camera, canvas, maxPx = 22) {
    const rect = canvas.getBoundingClientRect();
    let best = null, bestD = maxPx;
    for (let i = 0; i < n; i++) {
      v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      // 被地球擋住的不算
      const toCam = v2.copy(camera.position).sub(v);
      if (v.dot(toCam) < 0 && v.length() < 7.2) continue;
      v.project(camera);
      if (v.z > 1) continue;
      const x = rect.left + ((v.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(x - clientX, y - clientY);
      if (d < bestD) { bestD = d; best = sats[i]; }
    }
    return best;
  }

  return { group, update, pick };
}
