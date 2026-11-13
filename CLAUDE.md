# CLAUDE.md：星願 Star Wish

> 給 Claude Code 和協作者的專案規則。Claude Code 每次開啟這個專案都會自動讀取這份文件。
> **修改或新增任何東西之前，請完整讀完這份文件。** 規則有衝突時，以這份文件為準。

---

## 1. 專案是什麼

**星願**是一個互動網站。世界觀如下：

- 太空中**每 30 分鐘**會發射一顆立方衛星（CubeSat），發射場固定在**國立中央大學**（桃園中壢）。
- 每顆衛星的酬載艙分成固定數量的**格子**，每一格可以放一件「紀念品」。
- 玩家不用登入，就能**上傳自己的圖片**或**選擇系統預設的紀念品**，寫一句願望，選一顆即將發射的衛星和格子放進去。
- 發射前 10 秒，畫面會切換成全螢幕的**發射動畫**（倒數 → 火箭從中大升空 → 入軌）。
- 衛星發射後，玩家可以在 **3D 地球**上追蹤它現在飛到哪裡。

**語氣**：浪漫，再帶一點科學感。文案像寫給朋友的卡片，數據（高度、速度、軌道週期）要正確。
**介面語言**：繁體中文（台灣用語）。衛星編號、單位、數字用英文和阿拉伯數字。

---

## 2. 技術限制（必須遵守）

| 項目 | 規則 |
|---|---|
| 架構 | 純靜態網站：HTML + CSS + 原生 ES Modules。**不用建置工具、不用框架、不用 npm** |
| 3D | Three.js，版本**固定 `0.160.0`**，只透過各頁 `<head>` 的 importmap 從 jsDelivr 載入 |
| 外部資源 | 只允許 jsDelivr（Three.js）和 Google Fonts。其他資源都放進 repo |
| 路徑 | **一律用相對路徑**（`css/base.css`、`new URL('../../x', import.meta.url)`）。網站會部署在 GitHub Pages 子路徑 `/<repo>/`，開頭是 `/` 的路徑會壞掉 |
| 資料 | 頁面只能透過 `js/core/store.js` 匯出的 `store` 讀寫資料，不可以直接碰 IndexedDB 或 localStorage（例外：`quality.js` 的畫質偏好） |
| 後端 | 目前沒有後端。不可以加任何需要金鑰的服務（升級方式見 §7.4） |
| 預覽 | 必須透過本機伺服器開啟（`python -m http.server 8000`），直接雙擊 HTML 時 fetch 和 ES Modules 會失敗 |

---

## 3. 資料夾結構與命名

```
HW1113-week9/
├── CLAUDE.md / README.md
├── index.html            首頁：3D 地球 + 在軌衛星 + 下一班倒數
├── launch.html           放入星願（3 步驟）
├── track.html            追蹤單顆衛星（?sat=SW-YYYYMMDD-HHMM）
├── my-wishes.html        我的星願列表（不載 Three.js）
├── about.html            CubeSat 知識與專案說明（不載 Three.js）
├── LICENSE               保留所有權利（不可刪改，見 §9）
├── css/
│   ├── base.css          設計 token、全站版型、頁首
│   ├── components.css    元件：glass、btn、hud、card、badge、toast、發射覆蓋層…
│   └── <page>.css        只有單一頁面用到的樣式（launch.css、track.css）
├── js/
│   ├── core/             純邏輯，不碰 DOM、不 import three
│   │   ├── schedule.js   發射時刻表（slot ↔ 時間 ↔ 衛星）⚠️ 含不可變規則
│   │   ├── orbit.js      軌道數學（位置、星下點、太陽方向、座標轉換）
│   │   ├── regions.js    經緯度 → 地區名稱
│   │   └── store.js      資料層介面（目前 = IndexedDB）
│   ├── three/            3D 模組，只有 3D 頁面會載入
│   │   ├── quality.js    畫質分級（所有 3D 參數的唯一來源）
│   │   ├── scene.js      createStage()：renderer、相機、星空、loop、省電
│   │   ├── earth.js      createEarth()：地球 shader + 大氣
│   │   ├── swarm.js      createSwarm()：所有衛星光點 + 軌道環
│   │   ├── cubesat.js    createCubeSat(type)：程式化 CubeSat 模型 + addStudioLights()
│   │   ├── package.js    createPackage(img)：禮物盒包裹（裝填動畫用）
│   │   └── launch-sequence.js  createLaunchDirector()：發射動畫；createSiteMarker()：中大標記
│   ├── ui/               共用 DOM 元件：nav.js、format.js、souvenir.js（紀念品圖片與名稱）
│   └── pages/            每個 HTML 對應一個入口：<page-id>.js
├── data/
│   ├── satellite-types.json   衛星型號與發射輪替
│   └── souvenirs.json         預設紀念品
├── assets/
│   ├── textures/         地球貼圖（WebP）
│   ├── souvenirs/        預設紀念品圖示（SVG）
│   └── favicon.svg
└── templates/page.html   新頁面模板
```

**命名規則**
- 檔名一律用 kebab-case 英文：`my-wishes.html`、`wish-bottle.svg`。
- 每個 `xxx.html` 只載入一支 `js/pages/xxx.js`，頁面邏輯寫在那裡。被兩個以上頁面用到的程式碼，要搬進 `core/`、`three/` 或 `ui/`。
- JS 用 camelCase，常數用 UPPER_SNAKE_CASE。CSS class 用 kebab-case，不用 BEM 雙底線。
- 資料 id（紀念品、衛星型號）用小寫 kebab-case，或像 `3U` 這樣的型號字串，**一旦發布就不可以改名**，因為舊的星願用 id 參照它們。

---

## 4. 視覺風格

**關鍵字**：深空、星光、精密儀器、玻璃 HUD。

- **顏色**：只用 `css/base.css` 裡 `:root` 定義的 token，**不可以在其他地方寫死色碼**（3D shader 和 SVG 圖示例外，但要用同一組色值）。
  - 背景 `--bg #03050c`，主文字 `--ink`，次要文字 `--ink-2`／`--muted`
  - 星光金 `--gold #ffcc66`：「我的」東西、主要按鈕、強調
  - 冷藍 `--blue #7fd0ff`：其他衛星、連結、資訊
  - 紫 `--violet`：只用在 6U 等特殊型號
- **字體**：內文 Noto Sans TC。數字、編號、倒數用 Space Grotesk，套用 `.num` class（等寬數字）。
- **面板**：浮在 3D 上的資訊用 `.glass`。低階裝置會自動加上 `body.lite`，關掉 `backdrop-filter`。
- **按鈕**：主要行動用 `.btn.btn-primary`（每個畫面最多一個），其他用 `.btn`。
- **圓角**：小 8px、一般 14px、面板 22px，按鈕全圓角。
- **動畫**：用 `--ease`（`cubic-bezier(.22,1,.36,1)`）。UI 動畫 160～320ms。每個動畫都要能被 `prefers-reduced-motion` 關掉，base.css 已全域處理，3D 自轉則要另外檢查 `prefersReducedMotion()`。
- **手機**：最窄支援 360px，左右留白用 `--gutter`，不可以出現水平捲軸。可點擊的區域至少 40px。
- **手機上的 3D 頁面**：資訊面板做成底部抽屜（可收合），並用 `camera.setViewOffset()` 把畫面中心移到面板上方的可見區域（參考 `track.js` 的 `updateViewOffset()`），主角（衛星）不可以被面板蓋住。

---

## 5. 核心系統

### 5.1 發射時刻表（`js/core/schedule.js`）
- `slot = floor((t - EPOCH) / 30 分鐘)`，slot `s` 在 `EPOCH + s × 30min` 發射。
- 衛星編號 `SW-YYYYMMDD-HHMM` 使用**台北時間**的發射時刻，可以和 slot 互相轉換（`satId` ↔ `parseSatId`）。
- `getSatellite(slot)` 是**純函式**，同一個 slot 永遠得到相同的衛星（型號、名稱、軌道參數）。所有人在任何裝置上看到的都一樣，所以不需要伺服器。
- 每條軌道都由 `withLaunchTime(sat, t)` 算出：發射時刻 `t` 時軌道剛好經過 `LAUNCH_SITE`（中大），入軌點在下游 `ASCENT_DEG`（15°，約 1,700 km）。重播動畫時，傳入假的發射時刻就能得到一條「現在從中大起飛」的軌道。
- 網址加 `?t=分鐘數` 可以平移時間（除錯用），所有時間都要用 `now()`，**不要直接用 `Date.now()`**。

### 5.2 軌道（`js/core/orbit.js`）
- 圓形低軌道，高度 420～580 km，週期由 `T = 2π√(a³/μ)` 計算（約 93～96 分鐘）。
- 衛星位置在慣性座標（ECI）計算，地球依格林威治恆星時（GMST）旋轉，所以星下點會往西漂移，跟真實衛星一樣。
- 3D 場景 **1 單位 = 1000 km**。座標轉換只能用 `toScene()`（ECI `(x,y,z)` → Three `(x, z, -y)`）。

### 5.3 發射動畫（`js/three/launch-sequence.js`）
- `createLaunchDirector({ stage, controls })` 回傳 `{ play(sat, { nowMs, replay?, onDone? }), skip(), active }`。
- 時間軸：倒數（鏡頭飛到台灣）→ 升空 7 秒（代表真實約 9 分鐘）→ 入軌分離 1.4 秒 → 鏡頭拉回 3.2 秒。
- 頁面的 render loop 在 `director.active` 為 true 時**不可以**呼叫 `controls.update()`，否則會搶走鏡頭。
- 自動播放條件：距離發射 ≤ 10.5 秒、分頁在前景、同一班只播一次。`prefers-reduced-motion` 時只顯示文字。
- **重播只限已發射的衛星**：還沒到發射時刻的衛星，重播按鈕必須停用（`disabled`），點擊處理函式也要再檢查 `isLaunched()`。首頁的重播固定播「最近一顆已發射」的衛星。

### 5.4 裝填動畫（`launch.js` + `package.js`）
- 先 `store.saveWish()` 成功，**才**播放動畫（避免動畫播完卻存檔失敗）。
- 時間軸約 4.9 秒：衛星轉正 → 包裹出現 → 綁緞帶 → 艙門打開 → 飛進格子 → 格子點亮 → 艙門關上 → 衛星轉一圈。

### 5.5 資料層（`js/core/store.js`）
介面和 `Wish` 格式寫在檔案開頭的註解，那份註解就是規格。修改介面時，要同步更新註解和這份文件。

---

## 6. ⚠️ 不可變規則（改了會讓舊資料錯亂）

以下項目會決定「哪個星願在哪顆衛星上」，**絕對不可以修改**：

1. `schedule.js` 的 `EPOCH`、`SLOT_MS`、`TZ_MS`、`STAR_NAMES`（不能改內容、順序或長度）、`INCLINATIONS`、`LAUNCH_SITE`、`ASCENT_DEG`、`withLaunchTime()` 的公式，以及 `getSatellite()` 裡呼叫 `r()` 的順序和次數。
2. `satellite-types.json` 裡**已經生效的** `rotation` 時代（`fromSlot` ≤ 目前 slot 的那些）。
3. 已發布的紀念品 id、衛星型號 id。
4. `store.js` 的資料庫名稱和 `simulatedOthers()` 的亂數規則。

真的要變更時，用「新增」取代「修改」：例如新增一個 `fromSlot` 在未來的 rotation 時代（見 §7.2）。

---

## 7. 擴充 SOP

### 7.1 新增預設紀念品
1. 畫一個 SVG 放到 `assets/souvenirs/<id>.svg`：
   - `viewBox="0 0 64 64"`，線條風格，`stroke-width` 2～2.5，圓角端點
   - 主色只用 `#ffcc66`（金）、`#7fd0ff`（藍）、`#c79bff`（紫）、`#e9eefc`（白），背景透明
   - 檔案小於 4 KB，不嵌入點陣圖
2. 在 `data/souvenirs.json` 的陣列**最後面**加一筆：
   ```json
   { "id": "paper-crane", "name": "紙鶴", "icon": "paper-crane.svg", "story": "一句 30 字內的小故事" }
   ```
   `id` 和檔名相同。`story` 要符合 §1 的語氣。
3. 不用改任何 JS，launch 頁會自動讀取。

### 7.2 新增衛星型號
1. 在 `data/satellite-types.json` 的 `types` 加一個型號，欄位如下：

   | 欄位 | 說明 |
   |---|---|
   | `name` | 中文代號，兩個字，「星」開頭 |
   | `label` | 例如 `12U 立方衛星` |
   | `units` | `[寬, 深, 高]`，單位是 U（10 cm），會直接決定 3D 模型大小 |
   | `massKg` | 參考真實 CubeSat 規格（每 U 約 1.33 kg） |
   | `cells` | 酬載格數，必須等於 `grid[0] × grid[1]` |
   | `grid` | `[欄, 列]`，launch 頁格子圖的排法 |
   | `panels` | 展開式太陽能板片數（0、2、4） |
   | `antennas` | 天線根數（0～4） |
   | `accent` | 代表色，從 §4 的 token 選 |

2. 要讓它開始發射：在 `rotation` **新增**一個時代，`fromSlot` 必須是**未來**的 slot（目前 slot + 48 以上，也就是至少一天後），**不可以修改舊時代**。
3. `cubesat.js` 會依照 `units`、`panels`、`antennas` 自動生成模型，不需要改程式。

### 7.3 新增頁面
1. 一般頁面：複製 `templates/page.html` 到根目錄，依照檔案開頭的說明替換。3D 頁面：參考 `index.html` 的 `<head>`（importmap）和 `.stage` 結構。
2. 建立 `js/pages/<page-id>.js`，第一行呼叫 `renderNav('<page-id>')`。
   - 每個主要頁面都要有「＋ 放入新的星願」入口（連到 `launch.html`，有指定衛星時用 `launch.html?sat=<衛星編號>`）。
3. 要出現在導覽列的話，在 `js/ui/nav.js` 的 `NAV` 加一筆。
4. 用到時刻表的頁面，要先 `await initSchedule()`。

### 7.4 資料層升級成雲端（例如 Supabase）
1. 在 `store.js` 新增 `class CloudStore`，實作和 `LocalStore` 完全相同的五個方法和回傳格式。
2. `getSlotOccupancy()` 的 `others` 改成回傳真實的其他玩家資料，移除模擬資料。
3. 最後只改一行：`export const store = new CloudStore()`。頁面程式不需要任何修改。
4. 金鑰只能用公開的 anon key，並且要設定資料列權限（RLS）。

### 7.5 擴充紀錄（讓重複使用看得見）
這套規則的目的，是讓之後任何人或 AI 都能用同一個方式繼續擴充。所以每次擴充都要留下紀錄：
1. **一次擴充一個 commit**，訊息開頭寫明依據的章節，例如：`依 CLAUDE.md §7.1：新增紀念品「流星」`。
2. 在 README 的「擴充紀錄」表格最後加一列：日期、依據章節、內容、改了哪些檔案。
3. **遇到 §7 還沒涵蓋的擴充類型**（例如新增語言、新增成就系統），先在 §7 補上一節新的 SOP（步驟、欄位格式、要改的檔案），經使用者同意後，再照這份新 SOP 實作。不可以跳過 SOP 直接改程式。
4. 如果某次擴充需要修改 SOP 以外的程式，代表 SOP 寫得不夠完整，要一併修正對應的 SOP，讓下一次不用再改程式。

---

## 8. 效能規則（每個人的裝置都要順）

目標：中階手機、內顯筆電維持 60fps（低階 30fps），**首頁首次載入小於 2 MB**。

**一定要做**
- 3D 參數（pixelRatio、貼圖解析度、星星數、球體段數、fps 上限）**只能從 `quality.js` 的 `TIERS` 取**。新增參數也要放進三個等級裡。
- 用 `createStage()` 建立 3D，它已經處理好：pixelRatio 上限 1.5、自動降級、分頁隱藏時暫停、離開頁面時 dispose。
- 很多個相同的東西要合併成單一 draw call（參考 `swarm.js`：所有衛星 = 1 個 Points + 1 個 LineSegments）。
- 會動的東西節流更新：衛星位置 10Hz，HUD 文字 1Hz（用 `setInterval`，不放在 render loop）。
- 新的 geometry 和 material 盡量共用。移除物件時要 `dispose()`。
- 不需要 3D 的頁面**不可以**載入 Three.js（`my-wishes`、`about`），背景用 `body.starry` 的 CSS 星空。

**禁止**
- 不能用後製效果（EffectComposer、bloom、SSAO）。光暈用 shader 或 additive sprite 假裝。
- 不能用 glTF 或 FBX 等外部模型檔，CubeSat 一律程式化生成。
- 不能在 render loop 裡 `new` 物件（Vector3、Color 等要事先建立好重複使用）。
- 不能每幀操作 DOM 或觸發排版。
- 不能用影片背景或大型 GIF。

**檔案大小上限**

| 類型 | 上限 |
|---|---|
| 單張貼圖 | 300 KB（WebP，最大 2048 px） |
| 紀念品 SVG | 4 KB |
| 使用者上傳圖片（壓縮後） | 最長邊 512 px，WebP（`compressImage()` 已處理） |
| 單支 JS 模組 | 30 KB（未壓縮） |

---

## 9. AI 工作守則

1. **先讀後改**：修改前，先讀相關檔案和這份文件的對應章節。
2. **小步修改**：一次只做一件事。不要順手重構不相關的程式碼。
3. **沿用現有的模組**：格式化用 `ui/format.js`，時間用 `now()`，座標用 `toScene()`，不要重複寫一份。
4. **先在本機確認，再部署**：`python -m http.server 8000`，打開頁面檢查 console 沒有錯誤，並用手機寬度（375px）看過，才可以 commit 或 push。**沒有經過使用者同意，不要 push 或部署。**
5. **文件同步**：新增檔案、資料欄位或規則時，要更新這份 CLAUDE.md 對應的章節，以及 README。
6. **授權**：本專案保留所有權利（見 `LICENSE`）。不可以刪除或修改 `LICENSE`、README 的「授權」章節，也不可以加入任何開源授權條款。新增第三方素材時，必須是允許這種用法的授權，並登記在 `LICENSE` 的第三方素材清單和 `about.html` 的素材來源。
7. **不確定時先問**：會影響 §6 不可變規則、資料格式或整體風格的改動，要先問使用者。

### 完成前的檢查清單
- [ ] 本機伺服器打開所有受影響的頁面，console 沒有錯誤或警告
- [ ] 375px 寬度沒有水平捲軸，按鈕可以點
- [ ] 3D 頁面：DevTools 用 CPU 4× 節流仍然可以操作，Network 首頁小於 2 MB
- [ ] 沒有寫死的色碼、絕對路徑或 `Date.now()`（除了 store 的 createdAt）
- [ ] 沒有違反 §6 不可變規則
- [ ] CLAUDE.md 和 README 已經同步
- [ ] 如果是擴充：commit 訊息有寫依據的 §7 章節，README「擴充紀錄」已經加一列
