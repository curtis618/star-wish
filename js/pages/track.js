// 追蹤單顆衛星：跟隨鏡頭 / 全球視角、星下點軌跡、艙內星願
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderNav } from '../ui/nav.js';
import { countdown, dateTime, latLon, escapeHtml, toast } from '../ui/format.js';
import { wishImageUrl, wishTitle } from '../ui/souvenir.js';
import {
  initSchedule, now, parseSatId, getSatellite, lastLaunchedSlot, isLaunched, isBookable, withLaunchTime,
} from '../core/schedule.js';
import { eciAt, eciAtU, geodetic, gmst, toScene, speedKms, periodMin, orbitsCompleted, R_EARTH, SCENE_SCALE } from '../core/orbit.js';
import { regionName } from '../core/regions.js';
import { store } from '../core/store.js';
import { createStage } from '../three/scene.js';
import { createEarth } from '../three/earth.js';
import { createCubeSat, addStudioLights } from '../three/cubesat.js';
import { createLaunchDirector, createSiteMarker, glowTexture } from '../three/launch-sequence.js';

renderNav('');
await initSchedule();
const $ = (id) => document.getElementById(id);

// ---------------- 決定要追蹤哪一顆 ----------------
const params = new URLSearchParams(location.search);
const wishes = await store.listWishes();
let slot = parseSatId(params.get('sat'));
if (slot === null) slot = wishes.length ? wishes[0].slot : lastLaunchedSlot(now());
const sat = getSatellite(slot);
const highlightWish = params.get('wish');
document.title = `${sat.name} ${sat.id}｜星願`;

// ---------------- 3D ----------------
const canvas = $('scene');
const stage = createStage(canvas, { near: 0.01 });
if (stage.tier === 'low') document.body.classList.add('lite');
const { scene, camera, renderer } = stage;
const lights = await addStudioLights(scene, renderer);
lights.rim.intensity = 0.4;

const earth = createEarth({
  quality: stage.quality,
  onProgress: (a, b) => {
    $('loader-bar').style.width = `${(a / b) * 100}%`;
    if (a === b) setTimeout(() => $('loader').classList.add('done'), 250);
  },
});
scene.add(earth.group);
setTimeout(() => $('loader').classList.add('done'), 4000);
const siteMarker = createSiteMarker(earth.globe);

// 衛星模型（放大顯示，真實大小在這個比例下看不到）
const model = createCubeSat(sat.type);
const MODEL_SIZE = 0.07;
model.group.scale.setScalar(MODEL_SIZE / Math.max(model.size.H, model.size.W + 1));
scene.add(model.group);
const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffcc66, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
const beacon = new THREE.Sprite(glowMat);
beacon.scale.setScalar(0.12);
scene.add(beacon);

// 軌道環（慣性座標）
const RING_N = 180;
const ringPos = new Float32Array(RING_N * 3);
const p = {}, v = new THREE.Vector3();
for (let i = 0; i < RING_N; i++) {
  toScene(eciAtU(sat, (i / RING_N) * Math.PI * 2, p), v);
  ringPos.set([v.x, v.y, v.z], i * 3);
}
const ringGeo = new THREE.BufferGeometry();
ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
const ring = new THREE.LineLoop(ringGeo, new THREE.LineDashedMaterial({ color: 0xffcc66, transparent: true, opacity: 0.55, dashSize: 0.12, gapSize: 0.08, depthWrite: false }));
ring.computeLineDistances();
scene.add(ring);

// 星下點軌跡（掛在地球上，前後各 45 分鐘）
const GT_N = 91;
const gtPos = new Float32Array(GT_N * 3);
const gtCol = new Float32Array(GT_N * 3);
const gtGeo = new THREE.BufferGeometry();
gtGeo.setAttribute('position', new THREE.BufferAttribute(gtPos, 3));
gtGeo.setAttribute('color', new THREE.BufferAttribute(gtCol, 3));
const groundTrack = new THREE.Line(gtGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
earth.globe.add(groundTrack);
const R_GT = R_EARTH * SCENE_SCALE * 1.004;
function updateGroundTrack(t) {
  for (let i = 0; i < GT_N; i++) {
    const ti = t + (i - 45) * 60000;
    if (ti < sat.launchTime) gtCol.set([0, 0, 0], i * 3);
    const e = eciAt(sat, Math.max(ti, sat.launchTime), p);
    const th = -gmst(ti);
    const x = e.x * Math.cos(th) - e.y * Math.sin(th), y = e.x * Math.sin(th) + e.y * Math.cos(th);
    const r = Math.hypot(x, y, e.z);
    toScene({ x: x / r, y: y / r, z: e.z / r }, v, R_GT);
    gtPos.set([v.x, v.y, v.z], i * 3);
    if (ti >= sat.launchTime) {
      const k = i <= 45 ? 0.25 + (i / 45) * 0.45 : 0.85;
      gtCol.set([1 * k, 0.8 * k, 0.4 * k], i * 3);
    }
  }
  gtGeo.attributes.position.needsUpdate = true;
  gtGeo.attributes.color.needsUpdate = true;
  gtGeo.computeBoundingSphere();
}
updateGroundTrack(now());
setInterval(() => updateGroundTrack(now()), 20000);

// ---------------- 鏡頭 ----------------
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.rotateSpeed = 0.5;
const director = createLaunchDirector({ stage, controls });

const satPos = new THREE.Vector3(), prevPos = new THREE.Vector3(), vel = new THREE.Vector3(), radial = new THREE.Vector3();
const q = new THREE.Quaternion(), offset = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
const basis = new THREE.Matrix4();
let mode = 'global';

function satState(t) {
  toScene(eciAt(sat, t, p), satPos);
  toScene(eciAt(sat, t + 1000, p), vel).sub(satPos).normalize();
  radial.copy(satPos).normalize();
}

function setMode(m) {
  if (m === 'follow' && !isLaunched(sat.slot, now())) { toast('衛星還沒發射，先用全球視角看看'); m = 'global'; }
  mode = m;
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  const t = now();
  satState(t);
  if (m === 'follow') {
    const side = tmpA.crossVectors(vel, radial).normalize();
    const k = innerWidth <= 720 ? 1.7 : 1; // 手機畫面窄，鏡頭拉遠一點才裝得下帆板
    camera.position.copy(satPos).addScaledVector(vel, -0.32 * k).addScaledVector(radial, 0.14 * k).addScaledVector(side, 0.3 * k);
    controls.target.copy(satPos);
    controls.minDistance = 0.08;
    controls.maxDistance = 3;
    prevPos.copy(satPos);
  } else {
    const dir = isLaunched(sat.slot, t) ? satPos.clone().normalize() : siteMarker.worldPosition(tmpA).normalize();
    camera.position.copy(dir.multiplyScalar(20));
    controls.target.set(0, 0, 0);
    controls.minDistance = 9;
    controls.maxDistance = 45;
  }
  controls.update();
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

stage.onTick((dt, ts) => {
  const t = now();
  earth.update(t);
  siteMarker.update(ts);
  lights.sun.position.copy(earth.sunDir).multiplyScalar(10);
  const launched = isLaunched(sat.slot, t);
  model.group.visible = beacon.visible = launched;
  if (launched) {
    satState(t);
    model.group.position.copy(satPos);
    // 模型姿態：+Y 朝外太空、+Z（酬載艙）朝飛行方向
    tmpB.crossVectors(radial, vel).normalize();
    tmpA.crossVectors(tmpB, radial).normalize();
    basis.makeBasis(tmpB, radial, tmpA);
    model.group.quaternion.setFromRotationMatrix(basis);
    beacon.position.copy(satPos);
    beacon.scale.setScalar(mode === 'follow' ? 0.04 : 0.14);
    if (mode === 'follow' && !director.active) {
      // 相機跟著衛星平移，並隨軌道一起轉，保持相對視角
      q.setFromUnitVectors(tmpA.copy(prevPos).normalize(), tmpB.copy(satPos).normalize());
      offset.copy(camera.position).sub(prevPos).applyQuaternion(q);
      camera.position.copy(satPos).add(offset);
      controls.target.copy(satPos);
      prevPos.copy(satPos);
    }
  }
  if (!director.active) controls.update();
});
stage.start();

// ---------------- HUD ----------------
$('t-name').textContent = sat.name;
$('t-id').textContent = sat.id;
$('t-meta').textContent = `${sat.type.label} · ${dateTime(sat.launchTime)} 發射 · 傾角 ${((sat.inc * 180) / Math.PI).toFixed(1)}°`;
$('t-period').textContent = `${periodMin(sat).toFixed(1)} 分`;
$('t-v').textContent = `${speedKms(sat).toFixed(2)} km/s`;
$('t-alt').textContent = `${sat.altKm} km`;

let playedLaunch = false;
let wasLaunched = isLaunched(sat.slot, now());
function updateHud() {
  const t = now();
  const launched = isLaunched(sat.slot, t);
  const status = $('t-status');
  // 還沒真的發射的衛星不能重播
  const rp = $('t-replay');
  rp.disabled = !launched;
  rp.title = launched ? '' : '衛星發射後才能重播';
  if (launched) {
    status.className = 'badge badge-live';
    status.textContent = '在軌';
    $('t-wait').hidden = true;
    $('t-tele').hidden = false;
    const g = geodetic(sat, t);
    $('t-ll').textContent = latLon(g.lat, g.lon);
    $('t-region').textContent = regionName(g.lat, g.lon);
    $('t-orbits').textContent = `${orbitsCompleted(sat, t)} 圈`;
    if (!wasLaunched) { wasLaunched = true; if (!director.active) setMode('follow'); }
  } else {
    status.className = 'badge badge-wait';
    status.textContent = isBookable(sat.slot, t) ? '裝填中' : '準備發射';
    $('t-wait').hidden = false;
    $('t-tele').hidden = true;
    const lead = sat.launchTime - t;
    $('t-cd').textContent = countdown(lead);
    if (lead <= 10500 && lead > 1000 && !playedLaunch && !document.hidden) {
      playedLaunch = true;
      director.play(sat, { nowMs: t, onDone: () => setMode('follow') });
    }
  }
  // 這顆還能裝填就直接帶入，否則到一般的放入星願頁
  $('t-add').href = isBookable(sat.slot, t) ? `launch.html?sat=${sat.id}` : 'launch.html';
}
updateHud();
setInterval(updateHud, 1000);

// 艙內星願
async function renderPayload() {
  const mine = wishes.filter((w) => w.slot === sat.slot);
  const occ = await store.getSlotOccupancy(sat.slot, sat.type.cells);
  const list = $('t-payload');
  list.innerHTML = '';
  if (!mine.length) list.innerHTML = '<span class="muted" style="font-size:14px">這顆衛星上還沒有你的星願</span>';
  for (const w of mine) {
    const el = document.createElement('div');
    el.className = `payload-item${w.id === highlightWish ? ' hl' : ''}`;
    el.innerHTML = `<img src="${await wishImageUrl(w)}" alt="" /><span>第 ${w.cell + 1} 格・${escapeHtml(w.text || (await wishTitle(w)))}</span>`;
    list.append(el);
  }
  $('t-others').textContent = `另外還有 ${occ.others.length} 份其他旅人的星願・共 ${sat.type.cells} 格`;
}
renderPayload();

// 重播發射
$('t-replay').addEventListener('click', () => {
  const t = now();
  if (!isLaunched(sat.slot, t)) return toast('衛星發射後才能重播');
  const before = mode;
  director.play(withLaunchTime(sat, t + 5000), { nowMs: t, replay: true, onDone: () => setMode(before) });
});

// ---------------- 手機：讓衛星出現在面板上方的可見區域 ----------------
const hudEl = $('t-hud');
const switchEl = document.querySelector('.view-switch');
function updateViewOffset() {
  const W = innerWidth, H = innerHeight;
  if (W > 720) { camera.clearViewOffset(); return; }
  const top = switchEl.getBoundingClientRect().bottom;
  const bottom = hudEl.getBoundingClientRect().top;
  const center = (top + bottom) / 2;
  camera.setViewOffset(W, H, 0, H / 2 - center, W, H); // 把畫面中心往上平移
}
new ResizeObserver(updateViewOffset).observe(hudEl);
addEventListener('resize', updateViewOffset);
$('t-toggle').addEventListener('click', () => {
  const collapsed = hudEl.classList.toggle('collapsed');
  $('t-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('t-toggle').textContent = collapsed ? '展開 ▴' : '收合 ▾';
});
updateViewOffset();

earth.update(now()); // 先轉好地球，發射場位置才正確
setMode(isLaunched(sat.slot, now()) ? 'follow' : 'global');
