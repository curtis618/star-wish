// 星願包裹：紀念品圖片印在禮物盒上，加緞帶與蝴蝶結。
import * as THREE from 'three';

/**
 * @param {HTMLImageElement|null} img 紀念品圖片
 * @param {number} size 邊長
 */
export function createPackage(img, size = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  // 深藍星點包裝紙
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, '#1b2350');
  grd.addColorStop(1, '#0c1030');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,214,140,0.8)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % 256, y = (i * 53 + (i % 3) * 31) % 256;
    g.beginPath(); g.arc(x, y, i % 4 === 0 ? 2.2 : 1.2, 0, Math.PI * 2); g.fill();
  }
  // 中間的紀念品圖片（白框）
  g.fillStyle = '#f4f1ea';
  g.fillRect(58, 58, 140, 140);
  if (img) {
    const s = Math.min(124 / img.width, 124 / img.height);
    const w = img.width * s, h = img.height * s;
    g.fillStyle = '#0c1030';
    g.fillRect(66, 66, 124, 124);
    g.drawImage(img, 128 - w / 2, 128 - h / 2, w, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const geos = [], mats = [];
  const keep = (x, arr) => (arr.push(x), x);
  const group = new THREE.Group();
  const boxMat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }), mats);
  const box = new THREE.Mesh(keep(new THREE.BoxGeometry(size, size, size), geos), boxMat);
  group.add(box);

  const ribbonMat = keep(new THREE.MeshStandardMaterial({ color: 0xffcc66, metalness: 0.9, roughness: 0.25, emissive: 0x442a00, emissiveIntensity: 0.6 }), mats);
  const s = size * 1.025, w = size * 0.14;
  const bandA = new THREE.Mesh(keep(new THREE.BoxGeometry(s, s, w), geos), ribbonMat);
  const bandB = new THREE.Mesh(keep(new THREE.BoxGeometry(w, s, s), geos), ribbonMat);
  group.add(bandA, bandB);

  const bow = new THREE.Group();
  const loopGeo = keep(new THREE.TorusGeometry(size * 0.16, size * 0.045, 8, 20), geos);
  [-1, 1].forEach((d) => {
    const loop = new THREE.Mesh(loopGeo, ribbonMat);
    loop.position.set(d * size * 0.15, 0, 0);
    loop.rotation.set(Math.PI / 2, d * 0.5, 0);
    loop.scale.set(1, 0.6, 1);
    bow.add(loop);
  });
  bow.position.y = size / 2 + size * 0.05;
  group.add(bow);

  /** k = 0 → 沒有緞帶；1 → 包好 */
  function setWrap(k) {
    const a = THREE.MathUtils.clamp(k * 2, 0, 1);
    const b = THREE.MathUtils.clamp(k * 2 - 0.6, 0, 1);
    const bw = THREE.MathUtils.clamp(k * 3 - 2, 0, 1);
    bandA.scale.set(1, Math.max(a, 0.001), 1);
    bandB.scale.set(1, Math.max(b, 0.001), 1);
    bandA.visible = a > 0.01;
    bandB.visible = b > 0.01;
    bow.scale.setScalar(Math.max(0.001, bw * (1 + Math.sin(bw * Math.PI) * 0.3)));
    bow.visible = bw > 0.01;
  }
  setWrap(0);

  function dispose() {
    geos.forEach((x) => x.dispose());
    mats.forEach((x) => x.dispose());
    tex.dispose();
  }
  return { group, setWrap, dispose };
}
