# 言文字會員 App Stylebook v1.1

更新：2026-10-22（v1.1：全 App 依本規範清理）。適用：會員 App app.emoji.tw（`public/m.html`）、活動報名頁 `/e/<slug>`（`public/m-event.js`）、主辦工作台 `/host`（`public/m-host.js`）。官網、後台與嵌入介面請看 `docs/design/stylebook.md`（`ui-*` 元件）；兩套不要混用。

- 展示頁：`https://www.emoji.tw/stylebook/app/`（本機 `npm run dev` 後開 `/stylebook/app/`）。
- 展示頁不複製 CSS：`public/stylebook/app/app.js` 執行時讀 `/m.html` 的 `<style>` 和 `m-event.js` 的 `CSS` 常數，所以畫面永遠等於正式 App。
- 測試 `scripts/test-app-stylebook.mjs` 會檢查：App 定義的每個 class 都要在展示頁出現（或在本文件 §7 的例外清單）、App 沒有新增色碼、展示頁沒有自帶 App 樣式。

## 1. 開發流程

1. 先到展示頁找現成元件，複製「HTML」區的標記，換成 `esc()` 過的資料。
2. 現成元件不夠用：先改 `m.html` 的 `<style>`（活動報名改 `m-event.js` 的 `CSS`），再到 `app.js` 的 `GROUPS` 加一筆範例與規則，最後跑 `npm test`。只改 App 不補範例，測試會失敗。
3. 改了 App 殼（`m.html`、`m-event.js`、`m-host.js`）要把 `public/m-sw.js` 的 `VERSION` 加一，否則已安裝的 App 會繼續用舊快取。

## 2. 基礎 token

App 自己的 `:root`（在 `m.html`），名稱比官網短，不要引用官網的 `--ink-soft`、`--paper-alt`。

| Token | 值 | 用途 |
|---|---|---|
| `--ink` | #1B1A17 | 標題、主要操作、墨底 |
| `--soft` | #3A362E | 內文、說明 |
| `--muted` | #5A5448 | 次要文字（比官網 #6B6558 深一階，維持小畫面對比） |
| `--paper` | #FBFAF6 | 頁底 |
| `--alt` | #F4F1EA | 次要底、停用欄位 |
| `--line` | #E4E0D6 | 分隔線、卡片框 |
| `--card` | #fff | 卡片底 |
| `--accent` | #FFDE34 | 唯一的黃，只當底色 |
| `--tab` | 64px | 底部分頁列高度 |

規則：

- 新程式只用 `var(--token)`，不寫色碼。目前允許的固定色只有：LINE 綠 #06C755、Google 標誌四色、錯誤紅 #B3261E、主辦狀態膠囊與掃描結果的淡綠／淡黃／淡紅。要加新語意色，先改本表。
- 黃色每個畫面只出現一處主要強調（`.show`、`.pill.on`、`.tag`、`.host-action.primary` 都算）。主辦工作台的 `.host-action.primary` 固定給「簽到」。
- 深色底（相機框、掃描畫面）用 `var(--ink)`，不另寫 #000／#111。
- 字級最小 1rem，含 small、按鈕、標籤（`test-member-pwa`、`test-login-screen` 會擋）。標題用 Noto Serif TC 700；點數、金額大字用 Cormorant Garamond＋`tabular-nums`。
- 觸控區最小 44×44px；主要按鈕 52px；登入與出示卡片 56px。
- 圓角：欄位 12px、按鈕 14px、卡片 16px、會員卡 22px、膠囊 999px。不用陰影做層次（會員卡除外）。

## 3. 版面骨架

| 元件 | 用法 |
|---|---|
| `.wrap`（`#app`） | 所有分頁渲染進 `#app`；最寬 480px。body 已預留底部分頁與安全區，不要自己加 padding-bottom。 |
| `.hello` | 每頁第一個元素：左 h1（可加 small），右標誌或一顆次要按鈕。 |
| `.sec` | 頁內段落：`section.sec > h2`。內容空時放 `.empty`，不要整段拿掉。 |
| `nav.tabs` | 固定五格，不加第六格。目前分頁用 `aria-current="true"`。登入、活動報名、主辦頁要 `tabs.hidden=true`。 |
| `.pg` | 第二層畫面一律 `.pg` 從右推入，並用 `pushPg(el)` 取得 `close()`，返回鍵／手勢／‹ 都能關。不要自己做 modal 或疊 z-index。 |
| `.ov`／`.scanov` | 出示 QR 用既有 `#ov`（`openQr()`）；掃描頁 `.pg.scanov.center`，關閉時一定停相機。 |
| `.sticky`／`.mev-bar`／`.host-sticky` | 長表單的送出鍵。一個畫面只放一個固定操作。 |

## 4. 元件速查

| 類別 | class | 何時用 |
|---|---|---|
| 主要按鈕 | `.btn.solid` | 區塊內唯一主要操作 |
| 次要按鈕 | `.btn` | 其他操作；兩顆並排用 `.btn2` |
| 黃鍵 | `.show` | 只給「出示會員卡」 |
| 文字按鈕 | `.quiet`、`.later` | 取消、稍後、返回；破壞性操作先 `confirm()` |
| 卡內小按鈕 | `.rwb` | 兌換等卡片內操作 |
| 登入方式 | `.login .way`（`.google`、`.line`、`.email`） | 只在登入頁 |
| 快捷格 | `.quick` | 三個入口，多了改 `.btn` 清單 |
| 會員卡 | `.pass` | 只在首頁 |
| 資訊卡 | `.tile`（`.meta`、`.act`） | 清單項目預設卡片；整張可點用 `a.tile`，裡面不再放按鈕 |
| 面板 | `.panel`（`.eyebrow`、`.status`、`.bar`、`.meta`） | 會籍、權限等狀態 |
| 開關狀態 | `.chip .dot(.on)` | 文字要寫清楚，不只靠圓點 |
| 活動卡 | `.ecard`（`.cv`、`.bd`、`.meta2`、`.foot`、`.price`） | 活動列表 |
| 兌換卡 | `.rgrid .rcard`（`.ph`、`.nm`、`.pt`、`.need`、`.lock`） | 點數兌換 |
| 安裝提示 | `.install`（`.irow`） | 加到主畫面 |
| 欄位列 | `.row`、`.row.view` | 唯讀「標籤：值」 |
| 方案列 | `.plan`、`.plan.promo` | 會籍方案；價格讀 `PLAN_PRICES` |
| 動態列 | `.upd`、`.upd.mute` | 公告、通知 |
| 品項列 | `.cat`、`.mi`（`.nm`、`.q`） | 點餐；數量 0 時減號 disabled |
| 欄位 | `.field`（登入、我的、報名、主辦）、`.fld`（預約） | label 包 input／select／textarea；設 autocomplete、inputmode、maxlength |
| 勾選列 | `.chk` | label 包 checkbox／radio，整列 44px；全 App 通用，不放進 `.field` |
| 套餐選擇 | `.mi .q button.pick` | 點餐套餐的「選擇內容」膠囊鍵 |
| 單選 | `.seg`（`.two`）、`.slots`、`.lang` | 選中用 `aria-pressed="true"`，不用 class |
| 報名專用 | `.mev` 內的 `.tk(.off)`、`.req`、`.facts`、`.desc`、`.sum`、`.cover`、`.alert`、`.ok`、`.note` | 只在 `.mev` 內生效 |
| 狀態標籤 | `.pill`、`.pill.on`、`.tag` | 一般狀態／已確認／強調 |
| 空狀態 | `.empty` | 0 筆、載入中；API 失敗要另外寫原因 |
| 說明 | `.hint`、`.ghost`、`.nb`、`.note` | 區塊下方說明；`.nb` 讓短詞不斷行 |
| 離線 | `.offline` | 頁首，說明顯示的是快取資料 |
| 吐司 | `.toast`（`toast()`） | 操作結果；關鍵結果頁面上也要留狀態 |
| 主辦 | `.host-*`、`.guest-*`、`.scan-frame`、`.scan-result(.good/.bad)` | 只在 `/host` |

每個元件的範例標記與細部規則以展示頁為準。

## 5. 互動與寫法

- 所有來自 API 或使用者的字串一律經過 `esc()` 再放進樣板（測試會檢查 `esc(me.name`、`esc(e.title)`）。
- 送出：點下立即 `disabled`，`finally` 恢復；錯誤用 `toast(x.message)`。伺服器仍要防重。
- 選取狀態用 `aria-pressed`／`aria-current`，不要用 `.active` 之類的 class。
- 不寫 inline style（`test-app-stylebook` 會擋）；唯一允許的是 `.bar > i` 的動態寬度。間距已內建：連續 `.btn` 相隔 8px，`.field`／`.fld`／`.chk` 後的按鈕相隔 16px；`.hello` 內的 `.btn`／`.quiet` 自動寬度自動。
- 顯示／隱藏用 `hidden` 屬性，不改 `style.display`。
- 不用 inline 事件（`onclick="…"`），一律在 JS 綁定。
- `<button>` 一律寫 `type`（表單送出 `submit`，其他 `button`）；文字欄位一律設 `maxlength`，並依內容設 `autocomplete`、`inputmode`（測試會擋）。
- 三語：文字放進 `T`（zh／en／ja）對照表，不在樣板寫死中文。主辦頁（`m-host.js`）目前只有中文。
- 動畫要能被 `prefers-reduced-motion` 關掉。
- 圖片給寬高或 `aspect-ratio`；裝飾圖 `alt=""`。

## 6. 驗收

1. `npm test`（含 `test-app-stylebook`、`test-member-pwa`、`test-login-screen`、`test-public-typography`）。
2. `node scripts/check-app-stylebook.mjs`：用本機 Chrome 開展示頁，檢查 320／375／390／430／1180px 下無橫向溢位、按鈕 ≥44px、App 樣式確實載入、所有文字與底色對比 ≥3:1（LINE 登入鈕依 LINE 官方規範白字綠底，列為唯一例外）。需要 Chrome（或設定 `PUPPETEER_EXECUTABLE_PATH`）。
3. 真正上線的畫面仍要在 iPhone 實機（加到主畫面）看一次：安全區、鍵盤彈出、返回手勢。

## 7. 例外清單

展示頁不收錄、測試也放行的 class：

| class | 原因 |
|---|---|
| `ef`、`first` | 登入頁 Email 表單與「第一次使用」說明的版位，跟 `.login` 一起使用 |
| `host-page` | 主辦頁外層容器 |
| `sp` | 啟動畫面 `#splash` |
