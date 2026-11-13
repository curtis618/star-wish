// 關於頁：衛星型號表直接讀 satellite-types.json，新增型號時自動出現
import { renderNav } from '../ui/nav.js';
import { initSchedule, getTypes } from '../core/schedule.js';
import { escapeHtml } from '../ui/format.js';

renderNav('about');
await initSchedule();

const rows = Object.entries(getTypes()).map(([id, t]) => `
  <tr>
    <td><b style="color:${t.accent}">${escapeHtml(t.name)}</b> <span class="num muted">${id}</span></td>
    <td class="num">${t.units.map((u) => u * 10).join(' × ')} cm</td>
    <td class="num">${t.cells} 格</td>
    <td>${escapeHtml(t.description)}</td>
  </tr>`);
document.getElementById('type-table').innerHTML = rows.join('');
