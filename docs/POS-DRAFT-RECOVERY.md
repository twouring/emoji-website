# POS 草稿整理（2026-10-17）

基準：`origin/main` 的 `d64bdc3`；最後會再 rebase 最新 `origin/main`。只於 detached worktree `finish-pos-ops` 整理，不 push，不修改或刪除原草稿。

## 備份

`/workspace/spaces/_archive/pos-finish-20261017/<worktree>/`（2026-10-17 自 `/workspace/local/_archive/` 整批搬至 Spaces）保存 HEAD、porcelain v2 狀態、tracked / unstaged / staged binary patches、完整 index 原檔與 stages 清單、所有修改及未追蹤檔案 tar。`pos-table-print/stages/{1,2,3}/public/pos-ops.js` 保留 UU 三方內容。未追蹤 `node_modules` 是 symlink，tar 保留連結本身，不展開第三方套件。

## 草稿去向

- **pos-analytics（HEAD 51a63ac）**：尚未在 main。移植純函式、API、POS 分頁接線；補上原草稿完全沒有的銷量／客群畫面、日期區間與 CSV。修正凌晨時區換日造成預設日期少一天、無效日期、`pg` Date 型別、新會員誤計，以及品牌 middleware 未放行。單數定義為付款單數（含預收／分攤），不是人流；品項小計不分攤整單折扣。保留現有日結帳務與對帳流程。
- **table-drag（HEAD 362e360）**：main 已有拖拉「順序」，但 dirty diff 想做自由座標平面圖，尚未交付。移植座標版；保留 main 最新簡化桌卡、品項圖片、三欄結帳與分帳功能，未帶回舊桌卡明細或停用控制。補上舊排序資料讀取、舊 POST order 相容、輸入驗證、編輯中輪詢保護、遠端座標變動重畫、額外桌位預設位置上限，以及窄螢幕格子備援。自由座標允許操作人員自行擺放（包含重疊），不宣稱有碰撞避讓。
- **pos-table-print（HEAD 8000bb6）**：UU 是重播舊分帳變更時，與桌號 QR／開桌按鈕改版相撞。dirty 中平均分攤、手機結帳需求、人數、預收單與重置等有效內容均已在 `bd6b3c8`；桌邊列印在 `f788563`、合併送單列印在 `6ecd332`，都已在 main。不移植此草稿，避免恢復已移除的混合付款按鈕、舊開桌／暫停點餐位置及舊版版面。不處理原 UU index。

## 驗證範圍

- Node 全套 regression suite；analytics 純函式／實際 handler SQL 邊界與品牌範圍測試；layout parser／多桌位置測試。
- Chromium loopback、合成且明確為測試資料：拖拉、儲存 payload、輪詢不抹掉未存座標、舊排序、窄螢幕備援、預設位置不重疊、兩個分析面板、品名 HTML escaping。腳本、log、截圖在備份目錄。
- 未連正式資料庫、未寫正式資料、未開立發票、未送硬體列印；實體 iPad／mPOP 不在本次驗證範圍。
