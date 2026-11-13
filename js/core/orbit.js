// 軌道計算（純數學，不依賴 Three.js，任何頁面都能用）
// 圓形低軌道 + 地球自轉。單位：km、秒、弧度。

export const MU = 398600.4418; // 地球重力參數 km^3/s^2
export const R_EARTH = 6371; // km
export const SCENE_SCALE = 1 / 1000; // 3D 場景中 1 單位 = 1000 km

export const semiMajor = (sat) => R_EARTH + sat.altKm;
export const meanMotion = (sat) => Math.sqrt(MU / semiMajor(sat) ** 3); // rad/s
export const periodMin = (sat) => (2 * Math.PI) / meanMotion(sat) / 60;
export const speedKms = (sat) => Math.sqrt(MU / semiMajor(sat));

/** 緯度幅角 u（從升交點量起的角度） */
export const argLat = (sat, t) => sat.u0 + meanMotion(sat) * ((t - sat.launchTime) / 1000);

export function orbitsCompleted(sat, t) {
  if (t < sat.launchTime) return 0;
  return Math.floor((meanMotion(sat) * (t - sat.launchTime)) / 1000 / (2 * Math.PI));
}

/** 慣性座標（ECI）位置，寫入 out = {x,y,z}，單位 km */
export function eciAt(sat, t, out = {}) {
  return eciAtU(sat, argLat(sat, t), out);
}

export function eciAtU(sat, u, out = {}) {
  const a = semiMajor(sat);
  const cO = Math.cos(sat.raan), sO = Math.sin(sat.raan);
  const cu = Math.cos(u), su = Math.sin(u);
  const ci = Math.cos(sat.inc), si = Math.sin(sat.inc);
  out.x = a * (cO * cu - sO * su * ci);
  out.y = a * (sO * cu + cO * su * ci);
  out.z = a * (su * si);
  return out;
}

/** 格林威治恆星時（弧度） */
export function gmst(t) {
  const jd = t / 86400000 + 2440587.5;
  const deg = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
  return ((((deg % 360) + 360) % 360) * Math.PI) / 180;
}

/** 星下點：{lat, lon}（度） */
export function geodetic(sat, t) {
  const p = eciAt(sat, t);
  const r = Math.hypot(p.x, p.y, p.z);
  const lat = Math.asin(p.z / r);
  let lon = Math.atan2(p.y, p.x) - gmst(t);
  lon = ((lon + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

/** 太陽方向（ECI 單位向量，簡化公式，精度約 1°） */
export function sunDirEci(t) {
  const n = t / 86400000 + 2440587.5 - 2451545.0;
  const L = ((280.46 + 0.9856474 * n) * Math.PI) / 180;
  const g = ((357.528 + 0.9856003 * n) * Math.PI) / 180;
  const lam = L + ((1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const eps = (23.439 * Math.PI) / 180;
  return { x: Math.cos(lam), y: Math.cos(eps) * Math.sin(lam), z: Math.sin(eps) * Math.sin(lam) };
}

/** ECI(x,y,z) → Three.js 座標（y 朝上）：(x, z, -y) * scale，寫入有 set() 的物件 */
export function toScene(p, target, scale = SCENE_SCALE) {
  return target.set(p.x * scale, p.z * scale, -p.y * scale);
}
