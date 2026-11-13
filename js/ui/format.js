// 顯示格式化（全站統一）
const TZ_MS = 8 * 3600 * 1000;
const p2 = (n) => String(n).padStart(2, '0');

/** 毫秒 → 'mm:ss' 或 'h:mm:ss' */
export function countdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${p2(m)}:${p2(sec)}` : `${p2(m)}:${p2(sec)}`;
}

/** 時間戳 → 台北時間 'HH:MM' */
export function clock(t) {
  const d = new Date(t + TZ_MS);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** 時間戳 → 台北時間 'M/D HH:MM' */
export function dateTime(t) {
  const d = new Date(t + TZ_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${clock(t)}`;
}

export function latLon(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
