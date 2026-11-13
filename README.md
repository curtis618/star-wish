# 星願 Star Wish ✦

> 每 30 分鐘，一顆立方衛星從國立中央大學升空，帶著大家的紀念品和一句願望，繞著地球旅行。

**線上網站**：<https://curtis618.github.io/star-wish/>

生成式人工智慧課程 HW1113「建立自己的 AGENTS.md / CLAUDE.md」作業（本專案使用 Claude Code 開發，規則檔為 `CLAUDE.md`）。
本專案的重點不只是一個網頁，而是一套寫在 [`CLAUDE.md`](CLAUDE.md) 裡的規則，讓 AI 能用同一套方式持續擴充新內容。

---

## 功能

| 頁面 | 內容 |
|---|---|
| **星空**（`index.html`） | 3D 地球（真實日夜與城市燈光），最近 24 小時發射的星願衛星沿軌道飛行，下一班發射倒數，點衛星看資訊 |
| **放入星願**（`launch.html`） | 三個步驟：上傳照片或選預設紀念品並寫願望 → 選衛星與格子（3D CubeSat 預覽）→ 紀念品包成禮物盒、飛進酬載艙的動畫 |
| **發射動畫** | 發射前 10 秒自動播放：鏡頭飛到台灣、倒數、火箭從**國立中央大學**升空、入軌、拉回全球視角。首頁和追蹤頁都可以「重播」 |
| **追蹤**（`track.html`） | 跟隨鏡頭或全球視角，顯示高度、速度、經緯度、正在飛越的地區、已繞地圈數，以及星下點軌跡和艙內星願 |
| **我的星願**（`my-wishes.html`） | 本機所有星願的即時狀態（待發射倒數 / 在軌位置），一鍵追蹤 |
| **關於**（`about.html`） | 立方衛星小知識、玩法、素材來源 |

## 設計重點

- **不需要伺服器的發射時刻表**：衛星由時間推算（`slot = floor((t − EPOCH) / 30 分鐘)`），同一個 slot 在任何裝置上都會得到同一顆衛星，所以純靜態網站就能讓所有人看到一樣的衛星。
- **物理軌道**：圓形低地球軌道，週期由 `T = 2π√(a³/μ)` 計算；地球依格林威治恆星時自轉，所以星下點會往西漂移，跟真實衛星一樣。每條軌道都從中大上空出發。
- **程式化 3D 模型**：1U、3U、6U CubeSat 全部用程式依照 `data/satellite-types.json` 生成（導軌、太陽能板、展開式帆板、捲尺天線、相機鏡頭、星願酬載艙），沒有外部模型檔。
- **效能優先**：地球貼圖總共約 330 KB；所有衛星合併成 2 次繪製；畫質依裝置分三級並自動降級；分頁隱藏時暫停繪製；不需要 3D 的頁面不載入 Three.js。
- **資料層可替換**：目前星願存在瀏覽器的 IndexedDB。`store.js` 定義了固定的介面，之後換成雲端資料庫時，頁面程式不用改。

## 技術

純 HTML + CSS + 原生 ES Modules（不用建置、不用框架）· Three.js r160 · IndexedDB · GitHub Pages

## 在本機執行

ES Modules 和 `fetch` 需要透過 HTTP 開啟，直接雙擊 HTML 檔案會無法運作。

```bash
cd HW1113-week9
python -m http.server 8000
```

然後打開 <http://localhost:8000>。修改程式後畫面沒變的話，按 `Ctrl + Shift + R` 強制重新整理（瀏覽器會快取 JS 模組）。

**除錯用網址參數**

| 參數 | 作用 |
|---|---|
| `?t=30` | 把時間往後調 30 分鐘（可以馬上看到下一班發射） |
| `?q=low` / `mid` / `high` | 強制指定畫質等級 |
| `track.html?sat=SW-20261113-1700` | 追蹤指定的衛星 |

## 專案結構

```
├── CLAUDE.md            AI 協作規則（作業核心，Claude Code 自動讀取）
├── index.html / launch.html / track.html / my-wishes.html / about.html
├── css/                 base.css（設計 token）、components.css、各頁樣式
├── js/
│   ├── core/            時刻表、軌道數學、地區查詢、資料層（不碰 DOM、不用 three）
│   ├── three/           3D 模組：舞台、地球、衛星群、CubeSat、包裹、發射動畫、畫質
│   ├── ui/              導覽列、格式化、紀念品工具
│   └── pages/           每頁一個入口
├── data/                satellite-types.json、souvenirs.json
├── assets/              地球貼圖、紀念品 SVG、favicon
└── templates/page.html  新頁面模板
```

## 如何擴充

詳細步驟都寫在 [`CLAUDE.md` §7](CLAUDE.md)，摘要如下：

- **新增紀念品**：畫一個 SVG，在 `data/souvenirs.json` 加一筆，不用改程式。
- **新增衛星型號**：在 `data/satellite-types.json` 加型號，並新增一個未來生效的 `rotation` 時代，3D 模型會自動生成。
- **新增頁面**：複製 `templates/page.html`，在 `js/ui/nav.js` 登記。
- **改用雲端資料**：實作同樣介面的 `CloudStore`，只改 `store.js` 的一行。

## 授權

**© 2026 curtis618. All rights reserved.**

本 repository 公開僅供瀏覽與課程評閱。**未經作者書面授權，不得重製、修改、散布或用於任何衍生作品。** 詳見 [LICENSE](LICENSE)。

第三方素材依各自授權條款使用：NASA 地球貼圖（公有領域）、Three.js（MIT）、Noto Sans TC 與 Space Grotesk（SIL OFL 1.1）。
