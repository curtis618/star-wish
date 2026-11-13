// 紀念品與星願圖片的共用工具
let list = null;
const blobUrls = new Map();

export async function loadSouvenirs() {
  if (!list) {
    const res = await fetch(new URL('../../data/souvenirs.json', import.meta.url));
    list = await res.json();
  }
  return list;
}

export const souvenirIconUrl = (icon) => new URL(`../../assets/souvenirs/${icon}`, import.meta.url).href;

export async function getSouvenir(id) {
  return (await loadSouvenirs()).find((s) => s.id === id) || null;
}

/** 星願的縮圖網址（上傳的圖片 → blob URL；預設紀念品 → SVG） */
export async function wishImageUrl(wish) {
  if (wish.kind === 'upload' && wish.image) {
    if (!blobUrls.has(wish.id)) blobUrls.set(wish.id, URL.createObjectURL(wish.image));
    return blobUrls.get(wish.id);
  }
  const s = await getSouvenir(wish.souvenirId);
  return s ? souvenirIconUrl(s.icon) : '';
}

/** 星願的顯示名稱 */
export async function wishTitle(wish) {
  if (wish.kind === 'upload') return '我的照片';
  const s = await getSouvenir(wish.souvenirId);
  return s ? s.name : '紀念品';
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
