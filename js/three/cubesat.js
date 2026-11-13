// 程式化 CubeSat 模型。依照 satellite-types.json 的 units / grid / panels / antennas 自動生成。
// 座標：1 單位 = 1U（10 cm）。Y 軸 = 長軸，+Z 面 = 星願酬載艙（格子在這一面）。
import * as THREE from 'three';

let S = null; // 所有模型共用的貼圖與材質

function shared() {
  if (S) return S;
  // 太陽能電池貼圖（每 1U 一格 = 2×2 片電池）
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa3b2';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x = 3 + i * 64, y = 3 + j * 64, s = 58;
    const grd = g.createLinearGradient(x, y, x + s, y + s);
    grd.addColorStop(0, '#1b2f66');
    grd.addColorStop(1, '#0a1534');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x + 6, y); g.lineTo(x + s - 6, y); g.lineTo(x + s, y + 6); g.lineTo(x + s, y + s - 6);
    g.lineTo(x + s - 6, y + s); g.lineTo(x + 6, y + s); g.lineTo(x, y + s - 6); g.lineTo(x, y + 6);
    g.fill();
    g.strokeStyle = 'rgba(180,200,240,0.18)';
    g.lineWidth = 1;
    for (let k = 4; k < s; k += 5) { g.beginPath(); g.moveTo(x + 2, y + k); g.lineTo(x + s - 2, y + k); g.stroke(); }
    g.strokeStyle = 'rgba(230,200,140,0.55)';
    g.lineWidth = 2;
    [0.33, 0.66].forEach((f) => { g.beginPath(); g.moveTo(x + s * f, y + 2); g.lineTo(x + s * f, y + s - 2); g.stroke(); });
  }
  const solar = new THREE.CanvasTexture(c);
  solar.colorSpace = THREE.SRGBColorSpace;
  solar.wrapS = solar.wrapT = THREE.RepeatWrapping;
  solar.anisotropy = 4;

  const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: 0.7, ...o });
  S = {
    solar,
    solarMats: new Map(),
    alu: std({ color: 0xc9ced8, metalness: 0.85, roughness: 0.32 }),
    aluDark: std({ color: 0x5b6474, metalness: 0.7, roughness: 0.45 }),
    gold: std({ color: 0xd9a441, metalness: 1, roughness: 0.3 }),
    black: std({ color: 0x0b0d12, metalness: 0.2, roughness: 0.7 }),
    ceramic: std({ color: 0xe8e4da, metalness: 0, roughness: 0.6 }),
    lens: std({ color: 0x0a1a3a, metalness: 0.3, roughness: 0.05 }),
    tape: std({ color: 0xb8bcc6, metalness: 0.9, roughness: 0.25 }),
    glass: std({ color: 0xa8dcff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false }),
    cell: {
      empty: std({ color: 0x0a1020, emissive: 0x0b1d3d, emissiveIntensity: 0.6, roughness: 0.7, envMapIntensity: 0.12 }),
      other: std({ color: 0x0c1c34, emissive: 0x2c78b8, emissiveIntensity: 0.55, roughness: 0.7, envMapIntensity: 0.12 }),
      mine: std({ color: 0x3a2a08, emissive: 0xffb43a, emissiveIntensity: 1.4, roughness: 0.5, envMapIntensity: 0.12 }),
      selected: std({ color: 0x3a3010, emissive: 0xffe2a3, emissiveIntensity: 1.2, roughness: 0.5, envMapIntensity: 0.12 }),
    },
  };
  return S;
}

function solarMat(rx, ry) {
  const key = `${rx}x${ry}`;
  const sh = shared();
  if (!sh.solarMats.has(key)) {
    const t = sh.solar.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    sh.solarMats.set(key, new THREE.MeshStandardMaterial({ map: t, metalness: 0.35, roughness: 0.32, envMapIntensity: 0.9 }));
  }
  return sh.solarMats.get(key);
}

/**
 * @param {object} type satellite-types.json 裡的一個型號
 * @returns 模型物件，見檔案最後的 return
 */
export function createCubeSat(type) {
  const sh = shared();
  const [W, D, H] = type.units;
  const [cols, rows] = type.grid;
  const group = new THREE.Group();
  group.name = `cubesat-${type.label}`;
  const geos = [];
  const box = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); geos.push(g); return g; };
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  const rail = 0.085, plate = 0.035, skin = 0.012;

  // 結構：四根導軌 + 上下端板 + 內核
  const railGeo = box(rail, H + 0.12, rail);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(railGeo, sh.alu, sx * (W / 2 - rail / 2), 0, sz * (D / 2 - rail / 2));
  const plateGeo = box(W, plate, D);
  add(plateGeo, sh.alu, 0, H / 2 - plate / 2, 0);
  add(plateGeo, sh.alu, 0, -H / 2 + plate / 2, 0);
  add(box(W - 0.03, H - 0.03, D - 0.03), sh.black);

  // 側面與背面：太陽能電池
  const sideGeo = box(skin, H - 0.1, D - 2 * rail);
  add(sideGeo, solarMat(D, H), W / 2 - skin / 2 + 0.004, 0, 0);
  add(sideGeo, solarMat(D, H), -W / 2 + skin / 2 - 0.004, 0, 0);
  add(box(W - 2 * rail, H - 0.1, skin), solarMat(W, H), 0, 0, -D / 2 + skin / 2 - 0.004);

  // 正面：星願酬載艙（金色隔熱膜 + 格子）
  add(box(W - 2 * rail, H - 0.1, skin), sh.gold, 0, 0, D / 2 - skin / 2 + 0.004);
  const bw = W - 2 * rail - 0.06, bh = H - 0.18;
  const cw = bw / cols, ch = bh / rows;
  const cellGeo = box(cw * 0.84, ch * 0.84, 0.03);
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -bw / 2 + (c + 0.5) * cw, y = bh / 2 - (r + 0.5) * ch, z = D / 2 + 0.012;
    const mesh = add(cellGeo, sh.cell.empty, x, y, z);
    cells.push({ mesh, local: new THREE.Vector3(x, y, z + 0.03), size: Math.min(cw, ch) * 0.7 });
  }

  // 艙門（玻璃 + 鋁框），左側鉸鍊
  const hatch = new THREE.Group();
  hatch.position.set(-bw / 2 - 0.025, 0, D / 2 + 0.045);
  group.add(hatch);
  const hw = bw + 0.05, hh = bh + 0.05;
  add(box(hw, hh, 0.01), sh.glass, hw / 2, 0, 0, hatch);
  const fx = box(hw, 0.025, 0.02), fy = box(0.025, hh, 0.02);
  add(fx, sh.aluDark, hw / 2, hh / 2, 0, hatch);
  add(fx, sh.aluDark, hw / 2, -hh / 2, 0, hatch);
  add(fy, sh.aluDark, 0, 0, 0, hatch);
  add(fy, sh.aluDark, hw, 0, 0, hatch);

  // 頂部：陶瓷貼片天線；底部：相機鏡頭
  add(box(Math.min(0.45, W * 0.45), 0.025, Math.min(0.45, D * 0.45)), sh.ceramic, 0, H / 2 + 0.012, 0);
  const lensBody = new THREE.CylinderGeometry(0.16, 0.18, 0.09, 24); geos.push(lensBody);
  add(lensBody, sh.black, 0, -H / 2 - 0.045, 0);
  const lensGlass = new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24); geos.push(lensGlass);
  add(lensGlass, sh.lens, 0, -H / 2 - 0.095, 0);

  // 捲尺天線（展開時從 0 長到全長）
  const antennas = [];
  const antLen = 1.3;
  const antGeo = box(antLen, 0.006, 0.03);
  const antDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].slice(0, type.antennas);
  antDirs.forEach(([dx, dz]) => {
    const pivot = new THREE.Group();
    pivot.position.set((dx * W) / 2, H / 2 + 0.02, (dz * D) / 2);
    pivot.rotation.y = Math.atan2(-dz, dx);
    const m = add(antGeo, sh.tape, antLen / 2, 0, 0, pivot);
    group.add(pivot);
    antennas.push({ pivot, mesh: m });
  });

  // 展開式太陽能板：每側 panels/2 片，手風琴式折疊在側面
  const wings = [];
  const perSide = type.panels / 2;
  const panelGeo = box(D, H * 0.96, 0.014);
  const panelMats = [sh.aluDark, sh.aluDark, sh.aluDark, sh.aluDark, solarMat(D, H), solarMat(D, H)];
  for (const side of [1, -1]) {
    let parent = group;
    for (let k = 0; k < perSide; k++) {
      const pivot = new THREE.Group();
      if (k === 0) pivot.position.set(side * (W / 2 + 0.025), 0, -D / 2);
      else pivot.position.set(side * D, 0, 0);
      parent.add(pivot);
      add(panelGeo, panelMats, side * (D / 2), 0, 0, pivot);
      wings.push({ pivot, side, k });
      parent = pivot;
    }
  }

  function setDeploy(k) {
    for (const w of wings) {
      if (w.k === 0) w.pivot.rotation.y = -w.side * (1 - k) * (Math.PI / 2);
      else w.pivot.rotation.y = w.side * (1 - k) * Math.PI;
    }
    for (const a of antennas) a.pivot.scale.x = 0.04 + 0.96 * k;
  }
  function setHatch(k) { hatch.rotation.y = -k * 1.75; }
  function setCellState(i, state) { if (cells[i]) cells[i].mesh.material = sh.cell[state] || sh.cell.empty; }
  function update(ts) {
    sh.cell.selected.emissiveIntensity = 0.9 + Math.sin(ts / 220) * 0.6;
  }
  function cellWorldPosition(i, target = new THREE.Vector3()) {
    group.updateMatrixWorld(true);
    return target.copy(cells[i].local).applyMatrix4(group.matrixWorld);
  }
  function dispose() { geos.forEach((g) => g.dispose()); }

  setDeploy(1);
  setHatch(0);
  /** 整體尺寸（U），給相機取景用 */
  const size = { W, D, H, span: Math.max(H + 0.2, W + (perSide ? 2 * D * perSide : 0), W + (type.antennas ? 2 * antLen : 0)) };
  return { group, cells, size, setDeploy, setHatch, setCellState, cellWorldPosition, update, dispose };
}

/** 給 3D 頁面用的標準燈光 + 環境反射（只需呼叫一次） */
export async function addStudioLights(scene, renderer) {
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(5, 6, 4);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7fb6ff, 1.2);
  rim.position.set(-6, 2, -5);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9cc4ff, 0x10131c, 0.5));
  return { sun, rim };
}
