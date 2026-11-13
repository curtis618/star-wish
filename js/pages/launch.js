// 放入星願：選紀念品 → 選衛星和格子 → 封裝裝填動畫
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderNav } from '../ui/nav.js';
import { countdown, clock, escapeHtml, toast } from '../ui/format.js';
import { loadSouvenirs, souvenirIconUrl, loadImage } from '../ui/souvenir.js';
import { initSchedule, now, upcomingSatellites, isBookable, parseSatId, getSatellite } from '../core/schedule.js';
import { store, compressImage, WISH_MAX_CHARS } from '../core/store.js';
import { createStage } from '../three/scene.js';
import { createCubeSat, addStudioLights } from '../three/cubesat.js';
import { createPackage } from '../three/package.js';
import { glowTexture } from '../three/launch-sequence.js';
import { prefersReducedMotion } from '../three/quality.js';

renderNav('launch');
await initSchedule();

// ---------------- 狀態 ----------------
const state = {
  step: 1,
  kind: null, // 'preset' | 'upload'
  souvenir: null,
  uploadBlob: null,
  uploadUrl: null,
  sat: null,
  occ: { mine: [], others: [] },
  cell: null,
  busy: false,
};
const $ = (id) => document.getElementById(id);

// ---------------- 3D 預覽 ----------------
const stage = createStage($('sat-view'), { fov: 35, near: 0.05, far: 3000 });
if (stage.tier === 'low') document.body.classList.add('lite');
const { scene, camera, renderer } = stage;
await addStudioLights(scene, renderer);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = false;
controls.autoRotate = !prefersReducedMotion();
controls.autoRotateSpeed = 1.2;

let model = null;
let modelType = null;
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffcc66, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
scene.add(glow);

/** 依模型大小與畫面比例算出能完整入鏡的距離 */
function camDist() {
  const half = Math.tan((camera.fov * Math.PI) / 360);
  return (model.size.span * 0.6) / half / Math.min(1, camera.aspect) + 0.5;
}
function frameCamera() {
  const d = camDist();
  camera.position.set(d * 0.55, d * 0.28, d * 0.8);
  controls.target.set(0, 0, 0);
  controls.update();
}

function showModel(sat) {
  if (modelType !== sat.typeId) {
    if (model) { scene.remove(model.group); model.dispose(); }
    model = createCubeSat(sat.type);
    scene.add(model.group);
    modelType = sat.typeId;
    frameCamera();
  }
  $('vc-name').textContent = sat.name;
  $('vc-id').textContent = sat.id;
  $('vc-meta').textContent = `${sat.type.label} · ${sat.type.cells} 格 · ${clock(sat.launchTime)} 發射`;
  paintModelCells();
}

function paintModelCells() {
  if (!model || !state.sat) return;
  for (let i = 0; i < model.cells.length; i++) {
    const st = state.occ.mine.includes(i) ? 'mine' : state.occ.others.includes(i) ? 'other' : i === state.cell ? 'selected' : 'empty';
    model.setCellState(i, st);
  }
}

let anim = null; // 封裝動畫進行中
stage.onTick((dt, ts) => {
  model && model.update(ts);
  if (anim) anim.tick(dt);
  else controls.update();
});
stage.start();

// ---------------- 步驟切換 ----------------
function goStep(n) {
  state.step = n;
  for (const id of ['step-1', 'step-2', 'step-3', 'step-done']) $(id).hidden = true;
  $(n === 'done' ? 'step-done' : `step-${n}`).hidden = false;
  document.querySelectorAll('.stepper li').forEach((li) => {
    const s = Number(li.dataset.step);
    li.classList.toggle('active', s === n);
    li.classList.toggle('done', n === 'done' || s < n);
  });
  if (n === 2) renderSatList();
  if (n === 3) renderSummary();
  if (innerWidth < 860) document.querySelector('.steps').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.back))));

// ---------------- 步驟 1：紀念品 ----------------
const souvenirs = await loadSouvenirs();
const grid = $('souvenir-grid');
for (const s of souvenirs) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card selectable souvenir';
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = `<span class="sv-img"><img src="${souvenirIconUrl(s.icon)}" alt="" loading="lazy" /></span><b>${escapeHtml(s.name)}</b><small>${escapeHtml(s.story)}</small>`;
  btn.addEventListener('click', () => pickSouvenir('preset', s, btn));
  grid.append(btn);
}

function pickSouvenir(kind, s, el) {
  state.kind = kind;
  state.souvenir = s;
  grid.querySelectorAll('.souvenir').forEach((c) => c.setAttribute('aria-pressed', String(c === el)));
  $('to-2').disabled = false;
}

$('upload-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('請選擇圖片檔');
  try {
    const blob = await compressImage(file);
    if (state.uploadUrl) URL.revokeObjectURL(state.uploadUrl);
    state.uploadBlob = blob;
    state.uploadUrl = URL.createObjectURL(blob);
    $('upload-preview').innerHTML = `<img src="${state.uploadUrl}" alt="上傳的照片預覽" />`;
    $('upload-card').classList.add('has-image');
    $('upload-card').querySelector('b').textContent = '我的照片';
    $('upload-card').querySelector('small').textContent = `已壓縮 ${(blob.size / 1024).toFixed(0)} KB・點一下更換`;
    pickSouvenir('upload', null, $('upload-card'));
  } catch {
    toast('這張圖片讀不出來，換一張試試');
  }
});

const $wish = $('wish-text');
$wish.addEventListener('input', () => ($('wish-count').textContent = `${$wish.value.length}/${WISH_MAX_CHARS}`));
$('to-2').addEventListener('click', () => goStep(2));

// ---------------- 步驟 2：衛星與格子 ----------------
const preferSlot = parseSatId(new URLSearchParams(location.search).get('sat'));
let satCards = [];

async function renderSatList() {
  const t = now();
  const sats = upcomingSatellites(t);
  if (preferSlot !== null && isBookable(preferSlot, t) && !sats.some((s) => s.slot === preferSlot)) sats.unshift(getSatellite(preferSlot));
  const list = $('sat-list');
  list.innerHTML = '';
  satCards = [];
  for (const sat of sats) {
    const occ = await store.getSlotOccupancy(sat.slot, sat.type.cells, t);
    const free = sat.type.cells - occ.mine.length - occ.others.length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card selectable sat-card';
    btn.disabled = free <= 0;
    btn.setAttribute('aria-pressed', String(state.sat && state.sat.slot === sat.slot));
    btn.innerHTML = `
      <span class="sat-type" style="color:${sat.type.accent}">${sat.typeId}</span>
      <span class="sc-name">${escapeHtml(sat.name)} <span class="num muted" style="font-weight:400;font-size:13px">${sat.id}</span></span>
      <span class="sc-right"><span class="sc-cd" data-cd="${sat.slot}">${countdown(sat.launchTime - t)}</span>
        <span class="seat-bar"><i style="width:${(free / sat.type.cells) * 100}%"></i></span>
        <small class="muted">${free > 0 ? `剩 ${free}/${sat.type.cells} 格` : '已滿'}</small></span>
      <span class="sc-sub">${escapeHtml(sat.type.label)} · ${clock(sat.launchTime)} 發射 · 高度 ${sat.altKm} km</span>`;
    btn.addEventListener('click', () => selectSat(sat, btn));
    list.append(btn);
    satCards.push({ sat, btn });
  }
  const first = (state.sat && satCards.find((c) => c.sat.slot === state.sat.slot)) ||
    (preferSlot !== null && satCards.find((c) => c.sat.slot === preferSlot && !c.btn.disabled)) ||
    satCards.find((c) => !c.btn.disabled);
  if (first) selectSat(first.sat, first.btn, true);
}

async function selectSat(sat, btn, keepCell = false) {
  const changed = !state.sat || state.sat.slot !== sat.slot;
  state.sat = sat;
  state.occ = await store.getSlotOccupancy(sat.slot, sat.type.cells);
  if (changed || !keepCell) state.cell = null;
  if (state.cell !== null && (state.occ.mine.includes(state.cell) || state.occ.others.includes(state.cell))) state.cell = null;
  satCards.forEach((c) => c.btn.setAttribute('aria-pressed', String(c.btn === btn)));
  showModel(sat);
  renderCells();
}

function renderCells() {
  const sat = state.sat;
  const [cols] = sat.type.grid;
  const cg = $('cell-grid');
  cg.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  cg.style.maxWidth = `${cols * 84}px`;
  cg.innerHTML = '';
  for (let i = 0; i < sat.type.cells; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    b.textContent = i + 1;
    const mine = state.occ.mine.includes(i), other = state.occ.others.includes(i);
    if (mine) { b.classList.add('mine'); b.disabled = true; b.title = '你已經放了星願'; }
    else if (other) { b.classList.add('other'); b.disabled = true; b.title = '其他旅人的星願'; }
    if (i === state.cell) b.classList.add('selected');
    b.setAttribute('aria-label', `第 ${i + 1} 格${mine ? '（我的）' : other ? '（已占用）' : ''}`);
    b.addEventListener('click', () => {
      state.cell = i;
      renderCells();
      paintModelCells();
    });
    cg.append(b);
  }
  $('cell-hint').textContent = `${sat.type.label}・${sat.type.grid[0]} × ${sat.type.grid[1]}`;
  $('to-3').disabled = state.cell === null;
}
$('to-3').addEventListener('click', () => goStep(3));

// 每秒更新倒數；選中的衛星過了裝填時間要提醒
setInterval(() => {
  const t = now();
  document.querySelectorAll('[data-cd]').forEach((el) => {
    const sat = getSatellite(Number(el.dataset.cd));
    el.textContent = countdown(sat.launchTime - t);
  });
  if (state.sat && !isBookable(state.sat.slot, t) && !state.busy && state.step !== 'done') {
    toast(`${state.sat.name} 已停止裝填，幫你換下一班`);
    state.sat = null;
    state.cell = null;
    if (state.step === 2 || state.step === 3) goStep(2);
  }
}, 1000);

// ---------------- 步驟 3：確認 ----------------
function thumbUrl() {
  return state.kind === 'upload' ? state.uploadUrl : souvenirIconUrl(state.souvenir.icon);
}
function renderSummary() {
  const sat = state.sat;
  $('summary').innerHTML = `
    <img src="${thumbUrl()}" alt="" />
    <div>
      <p class="wish">${$wish.value.trim() ? `「${escapeHtml($wish.value.trim())}」` : '<span class="muted">（沒有寫願望，也很好）</span>'}</p>
      <dl>
        <dt>紀念品</dt><dd>${state.kind === 'upload' ? '我的照片' : escapeHtml(state.souvenir.name)}</dd>
        <dt>衛星</dt><dd>${escapeHtml(sat.name)} <span class="num muted">${sat.id}</span></dd>
        <dt>發射</dt><dd>${clock(sat.launchTime)}（${escapeHtml(sat.type.label)}）</dd>
        <dt>格子</dt><dd>第 ${state.cell + 1} 格</dd>
        ${$('wish-signer').value.trim() ? `<dt>署名</dt><dd>${escapeHtml($('wish-signer').value.trim())}</dd>` : ''}
      </dl>
    </div>`;
}

$('do-load').addEventListener('click', async () => {
  if (state.busy) return;
  const sat = state.sat;
  if (!isBookable(sat.slot, now())) { toast('這班已經停止裝填了'); return goStep(2); }
  state.busy = true;
  $('do-load').disabled = true;
  try {
    const wish = await store.saveWish({
      slot: sat.slot,
      cell: state.cell,
      kind: state.kind,
      souvenirId: state.souvenir && state.souvenir.id,
      image: state.uploadBlob,
      text: $wish.value.trim(),
      signer: $('wish-signer').value.trim(),
    });
    const img = await loadImage(thumbUrl()).catch(() => null);
    await playPackAnimation(img, state.cell);
    state.occ = await store.getSlotOccupancy(sat.slot, sat.type.cells);
    paintModelCells();
    $('done-msg').innerHTML = `你的星願已經裝進 <b class="gold">${escapeHtml(sat.name)}</b> 第 ${wish.cell + 1} 格，將在 <b class="num">${clock(sat.launchTime)}</b> 從國立中央大學升空。`;
    $('done-track').href = `track.html?sat=${sat.id}`;
    goStep('done');
  } catch (err) {
    toast(err.message || '裝填失敗，請再試一次');
  } finally {
    state.busy = false;
    $('do-load').disabled = false;
  }
});

$('done-again').addEventListener('click', () => {
  state.cell = null;
  goStep(1);
});

// ---------------- 封裝裝填動畫 ----------------
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

function playPackAnimation(img, cellIndex) {
  return new Promise((resolve) => {
    if (prefersReducedMotion()) { model.setCellState(cellIndex, 'mine'); return resolve(); }
    const PKG = 0.5;
    const pkg = createPackage(img, PKG);
    scene.add(pkg.group);
    const camFrom = camera.position.clone();
    const d = camDist();
    const camTo = new THREE.Vector3(d * 0.18, d * 0.12, d * 0.98);
    const rotFrom = model.group.rotation.y % (Math.PI * 2);
    const start = new THREE.Vector3(), ctrl = new THREE.Vector3(), end = new THREE.Vector3(), tmp = new THREE.Vector3();
    const cell = model.cells[cellIndex];
    const finalScale = cell.size / PKG;
    const t0 = performance.now();
    let t = 0, cellLit = false;
    controls.enabled = false;

    anim = {
      tick() {
        t = (performance.now() - t0) / 1000; // 用真實時間，低幀率時動畫長度不變
        // 0–0.8 鏡頭轉到正面、衛星轉正、包裹出現
        const k0 = ease(seg(t, 0, 0.8));
        camera.position.lerpVectors(camFrom, camTo, k0);
        camera.lookAt(0, 0, 0);
        model.group.rotation.y = rotFrom * (1 - k0);
        start.copy(camera.position).multiplyScalar(0.42).add(tmp.set(0, model.size.H * 0.1, 0));
        // 0.3–1.0 包裹浮現、旋轉
        const kIn = ease(seg(t, 0.3, 1.0));
        // 0.9–1.9 綁緞帶
        pkg.setWrap(seg(t, 0.9, 1.9));
        // 1.6–2.1 艙門打開
        model.setHatch(ease(seg(t, 1.6, 2.1)) * (1 - ease(seg(t, 3.3, 3.8))));
        // 2.1–3.1 飛進格子
        const kf = ease(seg(t, 2.1, 3.1));
        model.cellWorldPosition(cellIndex, end);
        ctrl.copy(start).lerp(end, 0.5).add(tmp.set(0, model.size.H * 0.35, 0));
        if (kf <= 0) pkg.group.position.copy(start);
        else {
          // 二次貝茲曲線
          const a = (1 - kf) * (1 - kf), b = 2 * (1 - kf) * kf, c = kf * kf;
          pkg.group.position.set(
            a * start.x + b * ctrl.x + c * end.x,
            a * start.y + b * ctrl.y + c * end.y,
            a * start.z + b * ctrl.z + c * end.z,
          );
        }
        pkg.group.scale.setScalar(Math.max(0.001, kIn * (1 + (finalScale - 1) * kf)));
        pkg.group.rotation.set(0.35 * (1 - kf), t * 1.6 * (1 - kf), 0.15 * (1 - kf));
        // 3.1 格子點亮
        if (t >= 3.1 && !cellLit) {
          cellLit = true;
          pkg.group.visible = false;
          model.setCellState(cellIndex, 'mine');
          glow.position.copy(end);
        }
        const kg = seg(t, 3.1, 3.9);
        glow.material.opacity = cellLit ? Math.sin(kg * Math.PI) : 0;
        glow.scale.setScalar(0.3 + kg * 1.6);
        // 3.9–4.8 衛星轉一圈
        model.group.rotation.y = t > 3.9 ? ease(seg(t, 3.9, 4.8)) * Math.PI * 2 : model.group.rotation.y;
        if (t > 4.9) {
          anim = null;
          scene.remove(pkg.group);
          pkg.dispose();
          model.group.rotation.y = 0;
          glow.material.opacity = 0;
          controls.enabled = true;
          controls.update();
          resolve();
        }
      },
    };
  });
}

// 一進來先顯示下一班衛星
showModel(upcomingSatellites(now())[0]);
