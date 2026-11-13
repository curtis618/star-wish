// 發射動畫導演：全畫面倒數 → 從國立中央大學升空 → 入軌 → 鏡頭拉回全球。
// 用法：const director = createLaunchDirector({ stage, controls }); director.play(sat)
// 播放期間頁面不要呼叫 controls.update()（用 director.active 判斷）。
import * as THREE from 'three';
import { eciAtU, toScene, R_EARTH, SCENE_SCALE, meanMotion, semiMajor } from '../core/orbit.js';
import { LAUNCH_SITE } from '../core/schedule.js';
import { prefersReducedMotion } from './quality.js';
import { escapeHtml } from '../ui/format.js';

const ASCENT_S = 7; // 升空動畫秒數（代表真實約 9 分鐘的爬升）
const SEP_S = 1.4; // 入軌、分離
const PULL_S = 3.2; // 鏡頭拉回
const REAL_ASCENT_S = 540;
const DOWNRANGE_KM = 1670;
const MAX_PARTICLES = 360;

let glowTex = null;
/** 共用的柔光貼圖（放射漸層） */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const sprite = (color, scale) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(scale);
  return s;
};

/** 發射場標記（掛在地球上，跟著地球自轉） */
export function createSiteMarker(globe) {
  const la = (LAUNCH_SITE.lat * Math.PI) / 180, lo = (LAUNCH_SITE.lon * Math.PI) / 180;
  const r = R_EARTH * SCENE_SCALE * 1.002;
  const p = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(r);
  const group = new THREE.Group();
  group.position.copy(p);
  const dot = sprite(0xffcc66, 0.12);
  group.add(dot);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.075, 40),
    new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  ring.lookAt(p.clone().multiplyScalar(2));
  group.add(ring);
  globe.add(group);
  return {
    group,
    update(ts) {
      const k = (ts / 1600) % 1;
      ring.scale.setScalar(1 + k * 2.2);
      ring.material.opacity = 1 - k;
    },
    worldPosition: (target = new THREE.Vector3()) => group.getWorldPosition(target),
  };
}

function buildRocket() {
  const g = new THREE.Group();
  const L = 0.16, r = 0.013;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.5, metalness: 0.1, emissive: 0x334455, emissiveIntensity: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffcc66, metalness: 0.8, roughness: 0.3, emissive: 0x553300, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L * 0.75, 12), white);
  body.position.y = L * 0.375;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, L * 0.06, 12), dark);
  band.position.y = L * 0.5;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(r, L * 0.25, 12), gold);
  nose.position.y = L * 0.875;
  g.add(body, band, nose);
  const finGeo = new THREE.BoxGeometry(r * 0.25, L * 0.14, r * 1.6);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(finGeo, dark);
    const a = (i * Math.PI) / 2;
    f.position.set(Math.cos(a) * r * 1.3, L * 0.07, Math.sin(a) * r * 1.3);
    f.rotation.y = -a;
    g.add(f);
  }
  const flame = sprite(0xffa040, 0.16);
  flame.position.y = -0.05;
  const core = sprite(0xffffff, 0.035);
  core.position.y = -0.008;
  g.add(flame, core);
  // 火箭沒有燈光時也看得到：加一盞跟著走的小燈
  const light = new THREE.PointLight(0xffb060, 2, 0.6);
  light.position.y = -0.02;
  g.add(light);
  return { group: g, flame, core };
}

function buildParticles() {
  const pos = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('life', new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: window.devicePixelRatio || 1 } },
    vertexShader: /* glsl */ `
      attribute float life; varying float vL; uniform float uPx;
      void main(){
        vL = life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (2.0 + (1.0 - life) * 7.0) * uPx * (1.2 / -mv.z) * 10.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vL;
      void main(){
        if (vL <= 0.0) discard;
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d) * vL;
        vec3 hot = vec3(1.0, 0.85, 0.5), mid = vec3(1.0, 0.45, 0.15), smoke = vec3(0.35, 0.38, 0.45);
        vec3 c = vL > 0.6 ? mix(mid, hot, (vL - 0.6) / 0.4) : mix(smoke, mid, vL / 0.6);
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const vel = new Float32Array(MAX_PARTICLES * 3);
  let head = 0;
  return {
    points,
    emit(p, spread, n) {
      for (let i = 0; i < n; i++) {
        const k = head;
        head = (head + 1) % MAX_PARTICLES;
        pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        vel[k * 3] = (Math.random() - 0.5) * spread;
        vel[k * 3 + 1] = (Math.random() - 0.5) * spread;
        vel[k * 3 + 2] = (Math.random() - 0.5) * spread;
        life[k] = 1;
      }
    },
    step(dt) {
      for (let k = 0; k < MAX_PARTICLES; k++) {
        if (life[k] <= 0) continue;
        life[k] -= dt / 1.4;
        pos[k * 3] += vel[k * 3] * dt;
        pos[k * 3 + 1] += vel[k * 3 + 1] * dt;
        pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.life.needsUpdate = true;
    },
    clear() { life.fill(0); geo.attributes.life.needsUpdate = true; },
  };
}

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const altEase = (s) => 1 - Math.pow(1 - s, 2.4);
const rangeEase = (s) => Math.pow(s, 1.7);

/**
 * @param {{ stage: ReturnType<import('./scene.js').createStage>, controls: any, globalDistance?: number }} opts
 */
export function createLaunchDirector({ stage, controls, globalDistance = 22 }) {
  const { scene, camera } = stage;
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const rocket = buildRocket();
  const particles = buildParticles();
  const flash = sprite(0xfff2cc, 0.01);
  const satDot = sprite(0xffcc66, 0.16);
  const PATH_N = 160;
  const trailPos = new Float32Array(PATH_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  trail.frustumCulled = false;
  root.add(rocket.group, particles.points, flash, satDot, trail);
  root.add(new THREE.HemisphereLight(0xdfe8ff, 0x332211, 1.6)); // 只在播放時生效

  // 預先配置，render loop 裡不 new
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), look = new THREE.Vector3(), lookSmooth = new THREE.Vector3();
  const site = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3();
  const camFrom = new THREE.Vector3(), camPre = new THREE.Vector3(), camAscent = new THREE.Vector3(), camGlobal = new THREE.Vector3();
  const tail = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), p = {};

  let st = null; // 播放狀態
  let overlay = null;
  let off = null;

  function pathPoint(s, out) {
    const u = st.sat.uSite + (st.uEnd - st.sat.uSite) * rangeEase(s);
    const r = R_EARTH + st.sat.altKm * altEase(s);
    eciAtU(st.sat, u, p);
    const k = r / semiMajor(st.sat);
    p.x *= k; p.y *= k; p.z *= k;
    return toScene(p, out);
  }

  /** 方向與距離分開內插，鏡頭不會穿過地球 */
  function sphericalLerp(a, b, t, out) {
    const ra = a.length(), rb = b.length();
    v.copy(a).normalize();
    v2.copy(b).normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(v.dot(v2), -1, 1));
    if (ang < 1e-4) out.copy(v2);
    else {
      const s0 = Math.sin((1 - t) * ang) / Math.sin(ang), s1 = Math.sin(t * ang) / Math.sin(ang);
      out.copy(v).multiplyScalar(s0).addScaledVector(v2, s1);
    }
    return out.multiplyScalar(ra + (rb - ra) * t);
  }

  function buildOverlay(sat, countdown) {
    overlay = document.createElement('div');
    overlay.className = 'launch-overlay';
    overlay.innerHTML = `
      <div class="lo-bar lo-top"></div><div class="lo-bar lo-bottom"></div>
      <div class="lo-info">
        <div class="lo-head">
          <span class="badge badge-live">LIVE</span>
          ${st.replay ? '<span class="badge">重播</span>' : ''}
          <b>${escapeHtml(sat.name)}</b><span class="num">${sat.id}</span><span>${escapeHtml(sat.type.label)}</span>
        </div>
        <div class="lo-site">發射場　${LAUNCH_SITE.name}（${LAUNCH_SITE.place}）</div>
      </div>
      <div class="lo-count num" aria-live="assertive">${countdown > 0 ? countdown : ''}</div>
      <div class="lo-msg"></div>
      <div class="lo-tele num">
        <div><span>任務時間</span><b data-k="t">T-00:${String(countdown).padStart(2, '0')}</b></div>
        <div><span>高度</span><b data-k="alt">0 km</b></div>
        <div><span>速度</span><b data-k="v">0.0 km/s</b></div>
        <div><span>航程</span><b data-k="d">0 km</b></div>
      </div>
      <button class="btn btn-sm lo-skip">跳過 ✕</button>`;
    overlay.querySelector('.lo-skip').onclick = () => finish(true);
    document.body.append(overlay);
    st.el = {
      count: overlay.querySelector('.lo-count'),
      msg: overlay.querySelector('.lo-msg'),
      t: overlay.querySelector('[data-k="t"]'),
      alt: overlay.querySelector('[data-k="alt"]'),
      v: overlay.querySelector('[data-k="v"]'),
      d: overlay.querySelector('[data-k="d"]'),
    };
    document.body.classList.add('launching');
    requestAnimationFrame(() => overlay.classList.add('on'));
  }

  function setupGeometry() {
    const sat = st.sat;
    st.uEnd = sat.u0 + meanMotion(sat) * ASCENT_S;
    for (let i = 0; i < PATH_N; i++) {
      pathPoint(i / (PATH_N - 1), v);
      trailPos.set([v.x, v.y, v.z], i * 3);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.setDrawRange(0, 0);
    pathPoint(0, site);
    up.copy(site).normalize();
    pathPoint(1, v);
    fwd.copy(v).sub(site).projectOnPlane(up).normalize();
    side.crossVectors(up, fwd).normalize();
    camPre.copy(site).addScaledVector(up, 1.5).addScaledVector(fwd, -1.7).addScaledVector(side, 1.3);
    pathPoint(0.55, v);
    camAscent.copy(v).addScaledVector(up, 1.8).addScaledVector(fwd, -1.2).addScaledVector(side, 2.8);
    pathPoint(1, v);
    camGlobal.copy(v).normalize().multiplyScalar(globalDistance);
    camFrom.copy(camera.position);
    lookSmooth.set(0, 0, 0);
  }

  function tick(dt) {
    if (!st) return;
    const tau = (performance.now() - st.t0) / 1000; // 相對點火時刻（秒）；負數 = 倒數中
    const el = st.el;

    if (tau < 0) {
      // ---- 倒數：鏡頭飛到台灣 ----
      const k = easeInOut(clamp01((tau + st.countdown) / Math.min(4, st.countdown)));
      sphericalLerp(camFrom, camPre, k, camera.position);
      look.set(0, 0, 0).lerp(site, k);
      camera.lookAt(look);
      const n = Math.ceil(-tau);
      if (st.lastCount !== n) {
        st.lastCount = n;
        el.count.textContent = n;
        el.count.classList.remove('tick');
        void el.count.offsetWidth;
        el.count.classList.add('tick');
        el.t.textContent = `T-00:${String(n).padStart(2, '0')}`;
      }
      rocket.group.position.copy(site);
      rocket.group.quaternion.setFromUnitVectors(Y, up);
      rocket.flame.visible = rocket.core.visible = false;
      return;
    }

    if (!st.ignited) {
      st.ignited = true;
      lookSmooth.copy(site); // 鏡頭從發射場開始追火箭
      el.count.textContent = '';
      el.msg.textContent = '點火升空！';
      el.msg.className = 'lo-msg show';
    }

    if (tau < ASCENT_S) {
      // ---- 升空 ----
      const s = Math.pow(tau / ASCENT_S, 1.25);
      pathPoint(s, rocket.group.position);
      pathPoint(Math.min(1, s + 0.01), v);
      v.sub(rocket.group.position).normalize();
      rocket.group.quaternion.setFromUnitVectors(Y, v);
      rocket.flame.visible = rocket.core.visible = true;
      rocket.flame.scale.setScalar(0.14 + Math.random() * 0.05 + s * 0.06);
      tail.copy(v).multiplyScalar(-0.02).add(rocket.group.position);
      particles.emit(tail, 0.03 + (1 - s) * 0.08, s < 0.15 ? 5 : 3);
      trailGeo.setDrawRange(0, Math.max(2, Math.floor(s * (PATH_N - 1)) + 1));
      // 鏡頭
      const k = easeInOut(clamp01(tau / ASCENT_S));
      camera.position.copy(camPre).lerp(camAscent, k);
      lookSmooth.lerp(rocket.group.position, Math.min(1, dt * 4 + (tau < 0.1 ? 1 : 0)));
      camera.lookAt(lookSmooth);
      if (tau > 1.6 && el.msg.textContent === '點火升空！') el.msg.className = 'lo-msg';
      if (!st.lastTele || tau - st.lastTele > 0.1) {
        st.lastTele = tau;
        const mt = Math.round(s * REAL_ASCENT_S);
        el.t.textContent = `T+${String(Math.floor(mt / 60)).padStart(2, '0')}:${String(mt % 60).padStart(2, '0')}`;
        el.alt.textContent = `${Math.round(st.sat.altKm * altEase(s))} km`;
        el.v.textContent = `${(7.6 * Math.pow(s, 0.8)).toFixed(1)} km/s`;
        el.d.textContent = `${Math.round(DOWNRANGE_KM * rangeEase(s)).toLocaleString()} km`;
      }
    } else if (tau < ASCENT_S + SEP_S) {
      // ---- 入軌、分離 ----
      const k = (tau - ASCENT_S) / SEP_S;
      if (!st.separated) {
        st.separated = true;
        rocket.group.visible = false;
        pathPoint(1, satDot.position);
        flash.position.copy(satDot.position);
        satDot.visible = true;
        el.msg.innerHTML = `<b>${escapeHtml(st.sat.name)}</b> 入軌成功 ✦`;
        el.msg.className = 'lo-msg show';
        el.alt.textContent = `${st.sat.altKm} km`;
        el.v.textContent = '7.6 km/s';
        el.d.textContent = `${DOWNRANGE_KM.toLocaleString()} km`;
        el.t.textContent = `T+${String(REAL_ASCENT_S / 60).padStart(2, '0')}:00`;
      }
      flash.scale.setScalar(0.05 + k * 0.9);
      flash.material.opacity = 1 - k;
      camera.lookAt(lookSmooth.lerp(satDot.position, Math.min(1, dt * 3)));
    } else if (tau < ASCENT_S + SEP_S + PULL_S) {
      // ---- 拉回全球視角 ----
      const k = easeInOut((tau - ASCENT_S - SEP_S) / PULL_S);
      if (!st.pullFrom) st.pullFrom = camera.position.clone();
      sphericalLerp(st.pullFrom, camGlobal, k, camera.position);
      look.copy(satDot.position).lerp(v.set(0, 0, 0), k);
      camera.lookAt(look);
      satDot.scale.setScalar(0.16 + k * 0.2);
      if (k > 0.5) { overlay.classList.remove('on'); document.body.classList.remove('launching'); }
    } else {
      finish(false);
      return;
    }
    particles.step(dt);
  }

  function finish(skipped) {
    if (!st) return;
    const cb = st.onDone;
    off && off();
    off = null;
    root.visible = false;
    particles.clear();
    document.body.classList.remove('launching');
    if (overlay) { const o = overlay; o.classList.remove('on'); setTimeout(() => o.remove(), 500); overlay = null; }
    if (skipped && camGlobal.lengthSq() > 0) camera.position.copy(camGlobal);
    camera.lookAt(0, 0, 0);
    if (controls) { controls.target.set(0, 0, 0); controls.enabled = true; controls.update(); }
    st = null;
    cb && cb({ skipped });
  }

  /**
   * @param {object} sat 衛星（launchTime = 點火時刻）
   * @param {{ nowMs: number, replay?: boolean, onDone?: Function }} opts  nowMs = schedule.now()
   */
  function play(sat, opts) {
    if (st) finish(true);
    const lead = Math.max(1000, sat.launchTime - opts.nowMs); // 距離點火的毫秒數
    st = { sat, countdown: Math.ceil(lead / 1000), replay: !!opts.replay, onDone: opts.onDone, t0: performance.now() + lead };
    if (prefersReducedMotion()) {
      // 減少動態：只顯示文字
      buildOverlay(sat, 0);
      st.el.msg.innerHTML = `<b>${escapeHtml(sat.name)}</b> 從${LAUNCH_SITE.name}升空，已入軌 ✦`;
      st.el.msg.className = 'lo-msg show';
      setTimeout(() => finish(false), 3200);
      return;
    }
    setupGeometry();
    rocket.group.visible = true;
    satDot.visible = false;
    flash.material.opacity = 0;
    root.visible = true;
    if (controls) controls.enabled = false;
    buildOverlay(sat, st.countdown);
    off = stage.onTick(tick);
  }

  return {
    play,
    skip: () => finish(true),
    get active() { return !!st; },
  };
}

