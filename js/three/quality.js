// 畫質分級。所有 3D 參數都從這裡取，不要在頁面裡寫死。
// 強制指定：網址加 ?q=low | mid | high

export const TIERS = {
  low: { pixelRatio: 1, maxPixelRatio: 1, texture: '1k', stars: 400, earthSeg: [48, 24], fpsCap: 30, antialias: false },
  mid: { pixelRatio: 1.25, maxPixelRatio: 1.25, texture: '2k', stars: 900, earthSeg: [64, 32], fpsCap: 60, antialias: false },
  high: { pixelRatio: 1.5, maxPixelRatio: 1.5, texture: '2k', stars: 1500, earthSeg: [96, 48], fpsCap: 60, antialias: true },
};

export function detectTier() {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced && TIERS[forced]) return forced;
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (mem <= 2 || cores <= 2) return 'low';
  if (coarse || mem <= 4 || cores <= 4) return 'mid';
  return 'high';
}

export function tierSettings(tier) {
  const s = { ...TIERS[tier] };
  s.pixelRatio = Math.min(window.devicePixelRatio || 1, s.maxPixelRatio);
  return s;
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
