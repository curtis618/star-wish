// 資料層。頁面只能透過這裡匯出的 `store` 讀寫資料。
// 介面（升級成雲端時，新的實作必須提供同樣的方法與回傳格式）：
//
//   saveWish(input)              → Promise<Wish>
//   listWishes()                 → Promise<Wish[]>（新到舊）
//   getWish(id)                  → Promise<Wish|null>
//   deleteWish(id)               → Promise<void>
//   getSlotOccupancy(slot, cells, t?) → Promise<{ mine: number[], others: number[] }>
//
// Wish = {
//   id, createdAt, slot, satId, cell,
//   kind: 'preset' | 'upload',
//   souvenirId?: string,        // kind = preset
//   image?: Blob,               // kind = upload（已壓縮的 WebP，≤ 512px）
//   text: string,               // 願望，≤ 60 字
//   signer: string,             // 署名，可空白
// }

import { rng, launchTime, satId, now } from './schedule.js';

const DB_NAME = 'star-wish';
const DB_VER = 1;
const STORE = 'wishes';
export const WISH_MAX_CHARS = 60;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('slot', 'slot');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

/** 其他玩家的模擬占用：每一格有固定的「被訂走時刻」，越接近發射越滿 */
function simulatedOthers(slot, cells, t) {
  const r = rng(slot * 40503 + 12345);
  const launch = launchTime(slot);
  const out = [];
  for (let i = 0; i < cells; i++) {
    const willFill = r() < 0.62;
    const fillAt = launch - r() * 6 * 3600 * 1000;
    if (willFill && t >= fillAt) out.push(i);
  }
  return out;
}

class LocalStore {
  constructor() {
    this._db = null;
  }
  async db() {
    if (!this._db) this._db = await openDb();
    return this._db;
  }

  async saveWish(input) {
    const { slot, cell } = input;
    const occ = await this.getSlotOccupancy(slot, Infinity);
    if (occ.mine.includes(cell)) throw new Error('這一格已經放了你的星願');
    const wish = {
      id: (crypto.randomUUID && crypto.randomUUID()) || `w${Date.now()}${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      slot,
      satId: satId(slot),
      cell,
      kind: input.kind,
      souvenirId: input.kind === 'preset' ? input.souvenirId : undefined,
      image: input.kind === 'upload' ? input.image : undefined,
      text: String(input.text || '').slice(0, WISH_MAX_CHARS),
      signer: String(input.signer || '').slice(0, 20),
    };
    const db = await this.db();
    await tx(db, 'readwrite', (os) => os.put(wish));
    return wish;
  }

  async listWishes() {
    const db = await this.db();
    const all = await tx(db, 'readonly', (os) => os.getAll());
    return (all || []).sort((a, b) => b.createdAt - a.createdAt);
  }

  async getWish(id) {
    const db = await this.db();
    return (await tx(db, 'readonly', (os) => os.get(id))) || null;
  }

  async deleteWish(id) {
    const db = await this.db();
    await tx(db, 'readwrite', (os) => os.delete(id));
  }

  async getSlotOccupancy(slot, cells, t = now()) {
    const db = await this.db();
    const mineWishes = (await tx(db, 'readonly', (os) => os.index('slot').getAll(slot))) || [];
    const mine = mineWishes.map((w) => w.cell);
    const others = Number.isFinite(cells) ? simulatedOthers(slot, cells, t).filter((c) => !mine.includes(c)) : [];
    return { mine, others };
  }
}

export const store = new LocalStore();

/** 上傳圖片前端壓縮：最長邊 512px、WebP，回傳 Blob */
export async function compressImage(file, maxSide = 512, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', quality));
}
