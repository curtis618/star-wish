// 首頁：3D 地球 + 在軌星願衛星 + 下一班發射倒數
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderNav } from '../ui/nav.js';
import { countdown, clock, escapeHtml } from '../ui/format.js';
import {
  initSchedule, now, visibleSatellites, getSatellite, nextSlot, lastLaunchedSlot, launchTime, withLaunchTime,
} from '../core/schedule.js';
import { gmst, geodetic } from '../core/orbit.js';
import { regionName } from '../core/regions.js';
import { store } from '../core/store.js';
import { createStage } from '../three/scene.js';
import { createEarth } from '../three/earth.js';
import { createSwarm } from '../three/swarm.js';
import { prefersReducedMotion } from '../three/quality.js';
import { createLaunchDirector, createSiteMarker } from '../three/launch-sequence.js';

renderNav('index');
await initSchedule();

const canvas = document.getElementById('scene');
const stage = createStage(canvas);
if (stage.tier === 'low') document.body.classList.add('lite');
const { scene, camera } = stage;

// ---- 地球 ----
const bar = document.getElementById('loader-bar');
const earth = createEarth({
  quality: stage.quality,
  onProgress: (a, b) => {
    bar.style.width = `${(a / b) * 100}%`;
    if (a === b) setTimeout(() => document.getElementById('loader').classList.add('done'), 250);
  },
});
scene.add(earth.group);
const siteMarker = createSiteMarker(earth.globe);
setTimeout(() => document.getElementById('loader').classList.add('done'), 4000); // 保險

// ---- 相機：一開始對準台灣上空 ----
function lookAtLatLon(lat, lon, dist) {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180 + gmst(now());
  const x = Math.cos(la) * Math.cos(lo), y = Math.cos(la) * Math.sin(lo), z = Math.sin(la);
  camera.position.set(x * dist, z * dist, -y * dist);
}
lookAtLatLon(18, 121, 22);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 45;
controls.rotateSpeed = 0.5;
controls.autoRotate = !prefersReducedMotion();
controls.autoRotateSpeed = 0.25;
controls.addEventListener('start', () => (controls.autoRotate = false));

// ---- 衛星群 ----
let mySlots = new Set();
let swarm = null;
let builtFor = null;

async function rebuildSwarm() {
  const wishes = await store.listWishes();
  mySlots = new Set(wishes.map((w) => w.slot));
  const t = now();
  const sats = visibleSatellites(t);
  // 我的衛星即使超過 24 小時也要顯示
  for (const s of mySlots) if (s <= lastLaunchedSlot(t) && !sats.some((x) => x.slot === s)) sats.push(getSatellite(s));
  if (swarm) {
    scene.remove(swarm.group);
    swarm.group.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
  }
  const newest = lastLaunchedSlot(t);
  swarm = createSwarm(sats, {
    mine: mySlots,
    ringsFor: (s) => mySlots.has(s.slot) || newest - s.slot < 12, // 只畫最近 6 小時 + 我的軌道環
  });
  swarm.update(t, true);
  scene.add(swarm.group);
  builtFor = newest;
  document.getElementById('stat-orbit').textContent = sats.length;
  document.getElementById('stat-mine').textContent = wishes.length;
}
await rebuildSwarm();

const director = createLaunchDirector({ stage, controls });

stage.onTick((dt, ts) => {
  const t = now();
  earth.update(t);
  swarm && swarm.update(t);
  siteMarker.update(ts);
  if (!director.active) controls.update();
});
stage.start();

// ---- HUD：每秒更新一次（不放在 render loop 裡） ----
const $cd = document.getElementById('countdown');
const $name = document.getElementById('next-name');
const $id = document.getElementById('next-id');
const $meta = document.getElementById('next-meta');
let metaFor = null;

async function updateHud() {
  const t = now();
  const ns = nextSlot(t);
  $cd.textContent = countdown(launchTime(ns) - t);
  if (metaFor !== ns) {
    metaFor = ns;
    const sat = getSatellite(ns);
    const occ = await store.getSlotOccupancy(ns, sat.type.cells);
    const used = occ.mine.length + occ.others.length;
    $name.textContent = `${sat.name}`;
    $id.textContent = ` ${sat.id}`;
    $meta.textContent = `${sat.type.label} · ${clock(sat.launchTime)} 發射 · 剩 ${sat.type.cells - used}/${sat.type.cells} 格`;
  }
  if (lastLaunchedSlot(t) !== builtFor) rebuildSwarm();
  // 發射前 10 秒自動播放發射動畫（分頁要在前景）
  const lead = launchTime(ns) - t;
  if (lead <= 10500 && lead > 1000 && playedFor !== ns && !document.hidden) {
    playedFor = ns;
    pop && pop.remove();
    director.play(getSatellite(ns), { nowMs: t });
  }
}
let playedFor = null;
updateHud();
setInterval(updateHud, 1000);

// 重播上一班發射（用一條「現在起飛」的假軌道，從中大出發）
document.getElementById('replay').addEventListener('click', () => {
  const t = now();
  const sat = getSatellite(lastLaunchedSlot(t));
  pop && pop.remove();
  director.play(withLaunchTime(sat, t + 5000), { nowMs: t, replay: true });
});

// ---- 點衛星顯示資訊 ----
let pop = null;
let downAt = null;
canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return; // 拖曳不算點擊
  const sat = swarm && swarm.pick(e.clientX, e.clientY, camera, canvas);
  pop && pop.remove();
  pop = null;
  if (!sat) return;
  const t = now();
  const g = geodetic(sat, t);
  pop = document.createElement('div');
  pop.className = 'sat-pop glass';
  pop.style.left = `${Math.min(Math.max(e.clientX, 130), innerWidth - 130)}px`;
  pop.style.top = `${Math.max(e.clientY, 200)}px`;
  pop.innerHTML = `
    <button class="close" aria-label="關閉">×</button>
    <h4>${escapeHtml(sat.name)} ${mySlots.has(sat.slot) ? '<span class="badge badge-wait">我的星願</span>' : ''}</h4>
    <div class="num">${sat.id} · ${sat.type.label}</div>
    <div style="font-size:14px;margin:8px 0 10px">高度 <b class="num">${sat.altKm}</b> km · 飛越 <b>${regionName(g.lat, g.lon)}</b></div>
    <a class="btn btn-sm" href="track.html?sat=${sat.id}">追蹤這顆衛星 →</a>`;
  pop.querySelector('.close').onclick = () => { pop.remove(); pop = null; };
  document.body.append(pop);
});
