// 發射時刻表：完全由時間推算，不需要伺服器。
import { gmst } from './orbit.js';
// ⚠️ EPOCH、SLOT_MS、STAR_NAMES、亂數種子規則都「不可修改」——
//    改了會讓所有已存在的星願對不到原本的衛星。見 CLAUDE.md「不可變規則」。

export const SLOT_MINUTES = 30;
export const SLOT_MS = SLOT_MINUTES * 60 * 1000;
export const EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0); // slot 0 的發射時刻
const TZ_MS = 8 * 3600 * 1000; // 衛星編號使用台北時間
export const VISIBLE_HOURS = 24; // 首頁顯示最近幾小時發射的衛星
export const BOOKING_AHEAD = 6; // 可預約的未來班次數
export const BOOKING_CLOSE_MS = 60 * 1000; // 發射前 60 秒停止裝填

/** 發射場：國立中央大學（桃園市中壢區） */
export const LAUNCH_SITE = Object.freeze({ name: '國立中央大學', place: '桃園．中壢', lat: 24.9682, lon: 121.1955 });
/** 入軌點在發射場下游幾度（約 1,700 km，接近真實火箭的爬升航程） */
export const ASCENT_DEG = 15;

const STAR_NAMES = Object.freeze([
  '天樞', '天璇', '天璣', '天權', '玉衡', '開陽', '搖光', '織女', '河鼓', '北落',
  '心宿', '參宿', '角宿', '軒轅', '南門', '老人', '天狼', '畢宿', '昴宿', '輦道',
  '天津', '紫微', '太微', '天市', '軫宿', '箕宿', '斗宿', '虛宿', '危宿', '奎宿',
]);

// 時間偏移（除錯用）：?t=90 代表把時間往後調 90 分鐘
const offsetMin = Number(new URLSearchParams(location.search).get('t') || 0) || 0;
export const now = () => Date.now() + offsetMin * 60000;

let typesData = null;

/** 每個頁面一開始都要 await 一次 */
export async function initSchedule() {
  if (typesData) return typesData;
  const res = await fetch(new URL('../../data/satellite-types.json', import.meta.url));
  typesData = await res.json();
  return typesData;
}

export function getTypes() {
  if (!typesData) throw new Error('請先 await initSchedule()');
  return typesData.types;
}

// mulberry32：固定種子的偽亂數
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const slotAt = (t) => Math.floor((t - EPOCH) / SLOT_MS);
export const launchTime = (slot) => EPOCH + slot * SLOT_MS;
/** 最近一顆已發射的 slot */
export const lastLaunchedSlot = (t = now()) => slotAt(t);
export const nextSlot = (t = now()) => slotAt(t) + 1;
export const isLaunched = (slot, t = now()) => t >= launchTime(slot);
export const isBookable = (slot, t = now()) => launchTime(slot) - t > BOOKING_CLOSE_MS;

export function satId(slot) {
  const d = new Date(launchTime(slot) + TZ_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `SW-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/** 'SW-20261113-1630' → slot；格式錯誤回傳 null */
export function parseSatId(id) {
  const m = /^SW-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(String(id || '').trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - TZ_MS;
  if ((t - EPOCH) % SLOT_MS !== 0) return null;
  return slotAt(t);
}

function typeForSlot(slot) {
  const eras = typesData.rotation.filter((e) => slot >= e.fromSlot);
  const era = eras[eras.length - 1] || typesData.rotation[0];
  const idx = ((slot - era.fromSlot) % era.pattern.length + era.pattern.length) % era.pattern.length;
  return era.pattern[idx];
}

const INCLINATIONS = [51.6, 97.4, 53.0, 45.0, 65.0, 97.6];
const cache = new Map();

/** 取得某班次的衛星（純函式，相同 slot 永遠得到相同結果） */
export function getSatellite(slot) {
  if (cache.has(slot)) return cache.get(slot);
  const r = rng(slot * 2654435761 + 7);
  const typeId = typeForSlot(slot);
  const type = getTypes()[typeId];
  const incDeg = INCLINATIONS[Math.floor(r() * INCLINATIONS.length)] + (r() - 0.5);
  const altKm = Math.round(420 + r() * 160);
  const descending = r() < 0.5; // 往東北（升軌）或往東南（降軌）飛
  const sat = Object.freeze(withLaunchTime({
    slot,
    id: satId(slot),
    name: STAR_NAMES[((slot % STAR_NAMES.length) + STAR_NAMES.length) % STAR_NAMES.length] + '號',
    typeId,
    type,
    altKm,
    inc: (incDeg * Math.PI) / 180,
    descending,
  }, launchTime(slot)));
  cache.set(slot, sat);
  return sat;
}

/**
 * 依發射時刻算出「從發射場出發」的軌道（raan、u0）。
 * 也用在重播發射：傳入假的發射時刻，就能得到一條同樣從中大起飛的軌道。
 */
export function withLaunchTime(sat, t) {
  const rad = Math.PI / 180;
  const phi = LAUNCH_SITE.lat * rad;
  const alpha = LAUNCH_SITE.lon * rad + gmst(t); // 發射場在慣性座標的經度
  const s = Math.max(-1, Math.min(1, Math.sin(phi) / Math.sin(sat.inc)));
  let uSite = Math.asin(s);
  if (sat.descending) uSite = Math.PI - uSite;
  const raan = alpha - Math.atan2(Math.cos(sat.inc) * Math.sin(uSite), Math.cos(uSite));
  return { ...sat, launchTime: t, raan, uSite, u0: uSite + ASCENT_DEG * rad };
}

/** 首頁要畫的在軌衛星 */
export function visibleSatellites(t = now()) {
  const last = lastLaunchedSlot(t);
  const n = (VISIBLE_HOURS * 60) / SLOT_MINUTES;
  const list = [];
  for (let s = last - n + 1; s <= last; s++) list.push(getSatellite(s));
  return list;
}

/** 可預約的未來班次 */
export function upcomingSatellites(t = now()) {
  const list = [];
  let s = nextSlot(t);
  while (list.length < BOOKING_AHEAD) {
    if (isBookable(s, t)) list.push(getSatellite(s));
    s++;
  }
  return list;
}
