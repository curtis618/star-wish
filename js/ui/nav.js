// 共用頁首。新增頁面時，在 NAV 加一筆即可（track.html 這類「從別頁點進去」的頁面不放）。
export const NAV = [
  { id: 'index', href: 'index.html', label: '星空' },
  { id: 'launch', href: 'launch.html', label: '放入星願' },
  { id: 'my-wishes', href: 'my-wishes.html', label: '我的星願' },
  { id: 'about', href: 'about.html', label: '關於' },
];

export const LOGO_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe2a3"/><stop offset="1" stop-color="#ff9f5a"/></linearGradient></defs>
  <ellipse cx="16" cy="16" rx="14" ry="5.2" fill="none" stroke="#7fd0ff" stroke-opacity=".7" stroke-width="1.2" transform="rotate(-24 16 16)"/>
  <path d="M16 6.5l2.3 6.2 6.2 2.3-6.2 2.3L16 23.5l-2.3-6.2-6.2-2.3 6.2-2.3z" fill="url(#lg)"/>
</svg>`;

/** @param {string} current 目前頁面 id（與 NAV.id 對應） */
export function renderNav(current) {
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <a class="brand" href="index.html" aria-label="星願首頁">${LOGO_SVG}<span>星願</span><small>STAR WISH</small></a>
    <button class="nav-toggle" aria-label="開啟選單" aria-expanded="false">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <nav class="nav" aria-label="主選單">
      ${NAV.map((n) => `<a href="${n.href}"${n.id === current ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}
    </nav>`;
  document.body.prepend(header);
  const btn = header.querySelector('.nav-toggle');
  const nav = header.querySelector('.nav');
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
}
