# 言文字前端 Stylebook v1.0

更新：2026-09-07。適用：主站、中英日文頁、活動、會員、Fellow、後台與嵌入介面。這是 CIS 的前端實作延伸；品牌定義以 `10_品牌與對外溝通/言文字CIS.html` 與 `00_專案治理與營運/母檔/07_對外口徑母檔.md` 為準。新增工程規則不得反向改寫品牌。

## 01 使用與責任

- 展示頁：`/stylebook/`。可重用元件：`/stylebook/components.css`，依序載入 `/style.css`、元件 CSS、頁面 CSS。
- `public/style.css` 是既有網站的基礎 token 來源。元件 CSS 直接引用它，不複製色碼；`--ui-*` 僅補間距與控制尺寸。`ui-` 為 opt-in 命名空間，包在 `.ui-scope` 裡使用。
- 新頁面與新元件遵循本規範。舊頁面以本文件末尾的接軌表逐頁處理；本次展示頁通過檢查不代表所有既有頁面已遷移或驗收。
- 禁止在局部頁面重定義 `--ink`、`--paper`、`--accent`、字型及 `.ui-button` 等共用語意。版型例外以頁面前綴 class 實作，附原因、負責頁面及回歸測試。
- 正式內容的價格、時間、地址、名稱仍讀母檔／API。本展示全部為介面示例，不構成販售方案或營運承諾。

## 02 品牌與素材

余白：以空間、紙階、細線組織資訊；不用裝飾陰影或漸層堆層次。每個可視畫面至多一處主動的黃色強調；多個主要操作以墨底處理，只有當前首要操作可用黃底。焦點、選取文字與既有插畫內黃點不另外擴增成大面積色塊。

使用 `/cis/assets/` 的正式向量標誌及 moji，不以打字重建 logo、不變形、不任意改 fill，不重繪、不套濾鏡。標誌向量原墨色 `#231815` 與 UI 墨 `#1B1A17` 角色不同。墨底使用正式 reverse 版本。安全距離、最小尺寸、lockup 比例照 CIS「標誌」章節；素材本身留白不得裁掉。照片必須標示實景或示意，替代文字描述用途，裝飾圖用空 alt。

## 03 色彩與語意

| Token | 值 | 使用 |
|---|---|---|
| --ink | #1B1A17 | 標題、主要操作、焦點 |
| --ink-soft | #3A362E | 內文 |
| --muted | #6B6558 | 次要文字，不用透明度降低 |
| --paper | #FBFAF6 | 頁底 |
| --paper-alt | #F4F1EA | 次要區塊 |
| --paper-deep | #ECE8DE | 停用背景、表格層次 |
| --card | #FFFFFF | 卡片 |
| --line | #E4E0D6 | 裝飾分隔，不能單獨辨認輸入框 |
| --ink-surface | #16150F | 深色面 |
| --on-ink | #EDE9E0 | 深色面文字 |
| --on-ink-soft | #B7B0A2 | 深色面次要文字 |
| --accent | #FFDE34 | 唯一黃，只當底色 |
| --accent-strong | #F2CB00 | 黃底 hover |
| --accent-soft | #FFF3BF | CIS 淡黃變體，仍占強調額度 |
| --on-accent | #1B1A17 | 黃底文字 |

一般文字對比驗收目標至少 4.5:1；互動邊界／焦點至少 3:1。錯誤、成功、警示、資訊用「錯誤：」「完成：」「注意：」「說明：」與文字說清楚，不能只靠顏色。錯誤欄位加粗邊線及 `aria-invalid`，提供修正方法。現有業務頁語意色須逐頁檢查，不能宣稱已統一。

## 04 字體與排印

| 角色 | 規格 |
|---|---|
| 中文／日文標題 | Noto Serif TC，後備 serif，500；日文缺字交由系統後備，不壓縮字形 |
| 拉丁展示／數字 | Cormorant Garamond，後備 Noto Serif TC／serif；只用於展示，不用於表單密集數據 |
| 內文與 UI | Noto Sans TC，後備 system-ui、PingFang TC、Microsoft JhengHei、sans-serif |
| H1 | clamp(2rem, 5.4vw, 4.1rem)，行高 1.28，500 |
| H2 | clamp(1.7rem, 3.4vw, 2.6rem)，行高 1.32，500 |
| H3 | 1.35rem，行高 1.45，500 |
| 內文／按鈕／標籤／註解 | 至少 1rem；內文行高 1.7–1.9，按鈕 1.5 |
| 資料數字 | UI 無襯線＋tabular-nums；數值靠尾端對齊 |

根字級不固定成縮小值。不可用 transform:scale、zoom 或 vw-only 字級塞進畫面。長標題自然換行，不以固定高度或 line-clamp 隱藏重要資訊。內文寬度上限 65ch。字體載入失敗時，後備字體也必須能換行；不得等字體載入才顯示內容。每頁設定正確 lang；中英日文不共用強制換行位置。公開頁既有 16px 下限檢查維持，後台舊小字是待遷移差異。

## 05 尺寸、格線與防跑版

| 項目 | 規則 |
|---|---|
| 間距 | 4、8、12、16、24、32、48、64px，以 --ui-space-* 引用 |
| 頁面容器 | max-width:1180px，width:100%，置中 |
| 頁面側邊 | >560px 為 24px；≤560px 為 18px |
| 區段 | clamp(48px,7vw,88px)，不要固定 section 高度 |
| 卡片 | gap 24px；內距 24px，≤560px 時 20px；圓角 12px |
| 控制元件 | 最小 44×44 CSS px；padding 10px 20px，圓角 4px；高度允許隨內容增長 |
| 欄位／圖像 | width:100%、min-width:0、border-box |
| 自動格線 | repeat(auto-fit,minmax(min(100%,280px),1fr))，依可用空間折欄 |
| 層級 | 既有主站導覽 z-index:50；略過連結 100；對話框採 native dialog top layer，勿競賽疊 z-index |

Flex/Grid 子項設 min-width:0；橫排動作允許 flex-wrap。字串使用 overflow-wrap:anywhere，不靠全站 overflow-x:hidden 掩蓋溢位。照片宣告 width/height 或 aspect-ratio，照片可 object-fit:cover，logo 用 contain。不要用 100vw 作內容寬度。資訊表可以局部橫向捲動，容器須可鍵盤聚焦、具可讀名稱；整頁不能橫向溢位。嵌入頁依容器寬度測試，不依裝置名稱猜寬度。

既有主站使用 880px 導覽折疊、860px hero、900／620px journey-card 等斷點；這些不是本次重設項目。新元件優先 intrinsic grid，只在 560px 微調邊距／卡片操作，不另造一套裝置斷點。

## 06 元件合約

| 元件 | Class／原生元素 | 必要行為與邊界 |
|---|---|---|
| 按鈕 | .ui-button；secondary／accent | 用 button 觸發、a 導航；hover/active/focus/disabled/busy；長文字換行；每組一個主動作 |
| 文字連結 | .ui-link | 常態底線；鍵盤焦點可見；不使用 href="#" 假裝操作 |
| 表單欄位 | .ui-field | label/for、hint 的 aria-describedby；required 與可見必填；錯誤 aria-invalid，保留已填資料 |
| 多行／選單／日期／檔案 | textarea/select/input | 沿用原生控制，不自製日期器；長檔名及選項不得撐寬頁面 |
| Checkbox／Radio | .ui-check、fieldset/legend | label 可點、群組有名稱；單選同 name；不以 div 模擬 |
| 卡片 | .ui-card、.ui-card__actions | 內容可增高，操作置底；避免巢狀可點連結；空圖片仍保留版位 |
| 狀態徽章 | .ui-badge | 明確文字；不能只顯示圓點；非互動不加 tabindex |
| 提示／錯誤 | .ui-notice | 重要新錯誤使用 role=alert；一般完成用 role=status；初始靜態範例不大量朗讀 |
| 載入／空／失敗 | .ui-notice＋progress | 載入標明等待；空態說下一步；失敗保留重試與原資料；不可把 0 筆當失敗 |
| 表格／排序／頁碼 | .ui-table-wrap/.ui-table | caption、th scope；aria-sort 只放目前排序欄；頁碼 aria-current=page；每頁筆數改變回有效頁 |
| 導覽／頁籤 | .ui-nav | 導航用連結＋aria-current；同頁段落直接 anchor；若做 tabs 必須另實作方向鍵、tablist/tab/tabpanel 合約 |
| 麵包屑 | nav aria-label | 有序階層，當前頁 aria-current=page，分隔符不當文字朗讀 |
| 手機選單 | 既有 nav.css／導覽腳本 | 沿用既有開關；aria-expanded 同步，Escape 收合，開啟時內容不可超出可捲動高度 |
| Accordion | details/summary、.ui-details | 原生鍵盤開關；內文不鎖高度；需要互斥時另定業務行為 |
| Modal | dialog、.ui-dialog | showModal()，有標題 aria-labelledby、關閉鈕；Escape、焦點圈限與回復；內容超高可捲動 |
| Toast | .ui-notice role=status | 不奪焦點；關鍵訊息保留於頁面，不只短暫浮現 |
| Tooltip | 優先可見說明文字 | 不把必填或錯誤藏在 hover；若必要，focus 也可開、Escape 可關、可指向提示內容 |
| 圖像／moji | .ui-media、正式 SVG | 定義比例與 alt；圖片缺失不移除尺寸；僅示例圖使用 contain |
| 金額／票券／點數／QR | 既有業務元件 | 文字與狀態依 API；金額包含幣別；QR 保留安靜區與文字備援，不美化成不可掃描 |

新提交動作：點擊後立即 disabled＋aria-busy=true，顯示「處理中…」；finally 回復；伺服器仍需防重與驗證。本 stylebook 的互動僅本機示範，不傳送資料。可存取性不只由 CSS 解決，元件接入時仍需驗證業務 JavaScript。

## 07 實作範例

```html
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/stylebook/components.css">
<main class="ui-scope">
  <div class="ui-shell ui-grid">
    <article class="ui-card">
      <h3>清楚的任務標題</h3>
      <p>內容允許增加與換行。</p>
      <div class="ui-card__actions">
        <button class="ui-button" type="button">執行操作</button>
      </div>
    </article>
  </div>
</main>
```

## 08 現有元件接軌表

| 領域／檔案 | 既有實作 | 接軌方式與限制 |
|---|---|---|
| public/style.css | .wrap、.btn、.journey-card、.entry、.faq 等 | 保留現有 API；新增頁用 ui-*。逐元件加入長文、disabled、焦點檢查後才替換，勿全站搜尋取代 |
| views/partials、public/nav.css | 三語共用導覽／頁尾 | 繼續透過 lib/layout.js 組裝；本展示使用文件內導覽，並未替換正式導覽 |
| public/about.css、system.css、space-dir.css | 敘事、系統介紹、樓層圖 | 保留版型；樓層圖的互動座標另做專用驗收，不套通用卡片格線 |
| public/fellow/styles.css、founding.css | --paper-card、--folio、--display、--r 等別名 | 分別對照 --card、--ink-surface、--latin、--radius-sm；尚未移除原 token，不能混載後假設已統一 |
| public/member.html、access.html | 頁內會員／門禁 UI | 先接按鈕、欄位與狀態，保留登入、權限、QR 行為；三語各測 |
| public/events.html、event-application.html | ev-*、申請欄位／表單 | 活動卡、票種、報名、長問題與錯誤依合約接軌；不動報名資料契約 |
| public/event-themes.css、halloween-2026.css | 活動主題覆寫 | 屬既有活動例外，不當成共用品牌基準；必須頁面作用域隔離 |
| public/event-rich.css、event-embed* | 編輯內容與嵌入 | 富文字邊界保留 sanitizer；320px 容器內檢查圖片／連結／表格，不修改外部宿主 |
| public/admin.html | a-*、13px 按鈕與局部 .btn 覆寫 | 是待接軌差異；新元件用 16px、44px，舊後台不以本次展示驗收代替 |
| public/startup/startup.css | 獨立方案版型 | 延用 CIS 字色；依自有版型驗收，不直接刪除局部 CSS |
| quote-dashboard | 獨立子專案 | 本次未改動，採用前需在該 repo 引入相同 token 與規則，不能靠相對路徑跨 repo 依賴 |

## 09 驗收與維護

1. 執行 `node scripts/check-stylebook.mjs`：需已安裝 Chrome（或設定 PUPPETEER_EXECUTABLE_PATH）；啟動僅供測試的靜態服務，用既有 Puppeteer 檢查 320／390／768／1180／1440px、字體離線、兩倍文字、長中英日文、焦點、dialog、表單、錯誤、圖片、CSS token 與對比。
2. 執行 `node --test scripts/test-public-typography.mjs`，維持現有公開字級規範。執行專案 `npm test`，失敗需區分既有工作與此次變更。
3. 真正採用到業務頁時，補測三語、空／大量資料、API 失敗、慢載入、鍵盤順序、200% 瀏覽器縮放與真機觸控。測試文字放大不等於完整瀏覽器縮放／螢幕閱讀器驗收。
4. 款式變更先改 CIS／母檔（如涉及品牌事實），再改 token、元件、展示與直接下游；禁止只修展示頁。檢查母檔 README 的下游清單；純工程規範不改價格、時程或印刷品。
5. 完成前執行根目錄 `python3 00_專案治理與營運/母檔/check_consistency.py`。本次未部署；本地通過不是正式站驗收。

防跑版門檻：整頁 scrollWidth 不超過 clientWidth（容許 1px 小數差）；長文不截斷；各格無重疊；操作可聚焦且不被遮住；僅資料表／程式區可局部捲動；重要內容不能只存在圖片或 hover。

### 本次驗收紀錄（2026-09-07）

- Stylebook：5 種寬度 × 100%／200% 文字、外部字體封鎖時，整頁無橫向溢位、卡片文字無水平截斷、按鈕至少 44px、素材無缺圖。
- token 與 CIS 一致；指定前景／背景組合對比、表單必填及重填、操作回饋、dialog 焦點回復／Escape／確認、details 鍵盤、減少動畫檢查通過。
- 桌面完整頁截圖已目視檢查；自動測試使用本機 Chrome。
- 專案測試：286 passed、0 failed、3 skipped；跳過項目不視為通過。
- 母檔一致性：0 筆殘留。未部署，未宣稱既有全部業務頁已完成元件遷移。
