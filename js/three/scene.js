// 共用 3D 舞台：renderer、相機、星空、render loop、自適應畫質、省電。
import * as THREE from 'three';
import { detectTier, tierSettings } from './quality.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ fov?: number, near?: number, far?: number, tier?: string }} opts
 */
export function createStage(canvas, opts = {}) {
  const tier = opts.tier || detectTier();
  const q = tierSettings(tier);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: q.antialias,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x03050c, 1);
  let pixelRatio = q.pixelRatio;
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 40, 1, opts.near || 0.05, opts.far || 3000);

  const stars = createStarfield(q.stars);
  scene.add(stars);

  // 尺寸跟著容器
  const resize = () => {
    const el = canvas.parentElement || canvas;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);
  resize();

  // render loop
  const ticks = new Set();
  const minFrameMs = 1000 / q.fpsCap - 1;
  let running = false, raf = 0, last = 0, lastRender = 0;
  // 自適應畫質：連續掉幀就降 pixelRatio
  let acc = 0, frames = 0, budgetMs = 1000 / q.fpsCap;

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - lastRender < minFrameMs) return;
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    lastRender = ts;
    for (const fn of ticks) fn(dt, ts);
    renderer.render(scene, camera);

    acc += dt * 1000;
    frames++;
    if (frames >= 90) {
      const avg = acc / frames;
      if (avg > budgetMs * 1.45 && pixelRatio > 0.75) {
        pixelRatio = Math.max(0.75, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
        resize();
        console.info(`[星願] 偵測到掉幀（平均 ${avg.toFixed(1)}ms），畫質降到 pixelRatio ${pixelRatio}`);
      }
      acc = 0;
      frames = 0;
    }
  }

  const start = () => {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  // 分頁隱藏時暫停，省電
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  function dispose() {
    stop();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    scene.traverse((o) => {
      o.geometry && o.geometry.dispose();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => mm.dispose());
    });
    renderer.dispose();
  }
  window.addEventListener('pagehide', dispose, { once: true });

  return {
    THREE, renderer, scene, camera, tier, quality: q,
    onTick: (fn) => (ticks.add(fn), () => ticks.delete(fn)),
    start, stop, dispose, resize,
  };
}

function createStarfield(count) {
  const r = 1200;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
    const b = 0.55 + Math.random() * 0.45;
    const warm = Math.random();
    col.set([b, b * (0.9 + warm * 0.1), b * (0.85 + (1 - warm) * 0.15)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.name = 'stars';
  return p;
}
