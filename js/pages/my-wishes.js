// 我的星願：列出本機的星願，顯示每顆衛星的即時狀態（不載入 Three.js）
import { renderNav } from '../ui/nav.js';
import { countdown, dateTime, escapeHtml, toast } from '../ui/format.js';
import { wishImageUrl, wishTitle } from '../ui/souvenir.js';
import { initSchedule, now, getSatellite, isLaunched } from '../core/schedule.js';
import { geodetic, orbitsCompleted } from '../core/orbit.js';
import { regionName } from '../core/regions.js';
import { store } from '../core/store.js';

renderNav('my-wishes');
await initSchedule();
const grid = document.getElementById('wish-grid');

async function render() {
  const wishes = await store.listWishes();
  grid.innerHTML = '';
  const launched = wishes.filter((w) => isLaunched(w.slot, now())).length;
  document.getElementById('wish-summary').textContent = wishes.length
    ? `共 ${wishes.length} 份星願・${launched} 份已在軌道上・${wishes.length - launched} 份等待發射`
    : '你放進衛星的每一份心意，都會出現在這裡。';

  for (const w of wishes) {
    const sat = getSatellite(w.slot);
    const card = document.createElement('article');
    card.className = 'card wish-card';
    card.innerHTML = `
      <div class="wc-top">
        <img src="${await wishImageUrl(w)}" alt="" />
        <div>
          <p class="wc-text">${w.text ? `「${escapeHtml(w.text)}」` : escapeHtml(await wishTitle(w))}</p>
          ${w.signer ? `<div class="wc-sign">— ${escapeHtml(w.signer)}</div>` : ''}
        </div>
      </div>
      <div class="wc-sat">
        <span class="badge" data-status="${w.id}">—</span>
        <b>${escapeHtml(sat.name)}</b><span class="num muted">${sat.id}</span><span class="muted">第 ${w.cell + 1} 格</span>
      </div>
      <div class="wc-live num" data-live="${w.id}"></div>
      <div class="wc-actions">
        <a class="btn btn-sm" href="track.html?sat=${sat.id}&wish=${encodeURIComponent(w.id)}">追蹤 →</a>
        <button class="btn btn-sm" data-del="${w.id}" aria-label="刪除這份星願">刪除</button>
      </div>`;
    card.dataset.slot = w.slot;
    grid.append(card);
  }

  const add = document.createElement('a');
  add.className = 'card selectable add-card';
  add.href = 'launch.html';
  add.innerHTML = `<div><b>＋</b>放入新的星願</div>`;
  grid.append(add);
  tick();
}

function tick() {
  const t = now();
  grid.querySelectorAll('.wish-card').forEach((card) => {
    const sat = getSatellite(Number(card.dataset.slot));
    const badge = card.querySelector('[data-status]');
    const live = card.querySelector('[data-live]');
    if (isLaunched(sat.slot, t)) {
      badge.className = 'badge badge-live';
      badge.textContent = '在軌';
      const g = geodetic(sat, t);
      live.textContent = `正在飛越 ${regionName(g.lat, g.lon)}・已繞地球 ${orbitsCompleted(sat, t)} 圈・高度 ${sat.altKm} km`;
    } else {
      badge.className = 'badge badge-wait';
      badge.textContent = '待發射';
      live.textContent = `${dateTime(sat.launchTime)} 發射・倒數 ${countdown(sat.launchTime - t)}`;
    }
  });
}
setInterval(tick, 1000);

// 刪除：按兩次確認（不用 confirm 對話框）
grid.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  if (!btn.classList.contains('btn-danger-confirm')) {
    btn.classList.add('btn-danger-confirm');
    btn.textContent = '確定刪除？';
    setTimeout(() => { btn.classList.remove('btn-danger-confirm'); btn.textContent = '刪除'; }, 3000);
    return;
  }
  await store.deleteWish(btn.dataset.del);
  toast('已刪除這份星願');
  render();
});

render();
