# LINE Pay API 收款＋Add friends

## 本次交付與既有收款盤點

- 新入口：POS／後台「結帳」→ 選桌 → **LINE Pay API 收款＋加好友** →「掃客人付款碼（API 實收）」；預設停用，畫面直接顯示缺少的設定與商家權限。
- 原「LINE Pay」付款方式與「收款」按鈕仍為**手動記帳**，不會自動改成扣款。既有 `lib/linepay.js` 的 Puppeteer 商家中心登入／下載交易、日結對帳完全保留，不拿帳密呼叫付款 API。
- 信用卡／TapPay、Stripe 活動與會員購買維持原流程。新增付款鎖定時，該桌舊手動收款與客人 TapPay 入口都先擋下，避免同一帳單重複付款。
- 新付款僅支援「整桌未結品項、儲存的原價、單一 LINE Pay tender」。不支援分帳、部分份數、會員價、會員累點／兌點、整單折扣或混合付款；前端選了會提示，後端也拒絕相關參數。不另收前端金額。既有贈送與預收抵扣行以已儲存價格計算。
- 沒有對真實客人扣款，也沒有發出 sandbox 交易；付款成功／拒絕等驗證均使用明確的合成 provider 替身。

## 官方 API 依據與版本限制

查核官方文件（2026-10-16）：

1. [Offline v2 payment request](https://developers-pay.line.me/offline-api-v2/request-payment)：`POST /v2/payments/oneTimeKeys/pay`，`capture:true`，台灣 oneTimeKey 18 碼、有效 5 分鐘；官方範例明列 `extras.addFriends:[{type:'LINE_AT',idList:['@aaa']}]`。讀取 timeout 至少 40 秒；此實作為 45 秒。
2. [Offline v2 check payment status](https://developers-pay.line.me/offline-api-v2/check-payment-status)：`GET /v2/payments/orders/{orderId}/check`，讀取 timeout 至少 20 秒；此實作為 25 秒。僅 `COMPLETE` 且 orderId、transactionId、payInfo 總額吻合才記實收。`FAIL` 才釋放；其他狀態、查無、網路錯誤繼續鎖住。
3. [Offline v2](https://developers-pay.line.me/offline-api-v2)：商家中心 **My Page** 的 Channel ID／Channel secret，與商家登入帳密、Messaging API、LINE Login 各自獨立。官方提醒 EPI 改用 v2.4／v4，推薦 v4 HMAC。
4. [官方繁體中文整合指南 v1.1.2](https://pay.line.me/file/guidebook/technicallinking/LINE_Pay_Integration_Guide_for_Merchant-v1.1.2-TW.pdf)：`extras.addFriends` 的 `idList` 必須是**已在商家中心完成註冊**的官方帳號清單。
5. [v2.4 payment request](https://developers-pay.line.me/offline-api-v2_4/request-payment) 與 [v4 payment request](https://developers-pay.line.me/offline-api-v4/request-payment)：v2.4 使用 `extras`、v4 使用 `options`／`packages`，本次查核的展開參數表並未列出 Add friends。因此**沒有把 v2 的欄位硬塞進 v2.4／v4，也沒有宣稱 v3/v4 已支援**。

**啟用條件**：LINE Pay 必須確認此商家仍可用 **Offline v2、非 EPI** 收款，並完成 `@338ymhys` 關聯。這不是程式可以代替商家簽約的權限。若 LINE Pay 僅開放 EPI／v2.4／v4，先不要開啟；最小追加需求是取得官方針對該版 Add friends 的支援規格與商家權限確認，再實作該版，不猜欄位。

Add friends 是付款時的邀請／客人選擇，**不是強制加好友**；付款成功不等於已加好友。這裡不會寫入虛構的好友狀態。

## 設定與上線前必要事項

超管登入後台 → 系統設定 → **LINE Pay API 收款（非商家對帳）**：

| 鍵 | 用途 |
| --- | --- |
| `LINEPAY_OFFLINE_ENABLED` | `0` 停用（預設）；確認商家、設備與作業程序後才設 `1` |
| `LINEPAY_OFFLINE_ENV` | 明確填 `production`／`sandbox`，不推測；sandbox **禁止**沖銷正式 POS 帳單，UI 與 prepare/pay 都會阻擋 |
| `LINEPAY_OFFLINE_CHANNEL_ID` | 付款 API Channel ID（6–20 碼數字），非商家帳號、非 LINE Login ID |
| `LINEPAY_OFFLINE_CHANNEL_SECRET` | 該環境付款 API secret，後台加密存放，不回讀明文 |
| `LINEPAY_OFFLINE_V2_APPROVED` | 確認 LINE Pay 核准 v2 非 EPI 收款與商家中心關聯 `@338ymhys` 後才填 `1` |

這五項為 live 設定，不須重部署；另一個服務依現有一分鐘重載機制同步。現有 `LINEPAY_MERCHANT_ID/PW` 仍只供對帳；不能挪用。請勿在對話／日誌貼 Channel secret。

啟用前：

- 部署新程式並讓啟動 migration 建立 `linepay_payments`、唯一索引、兩個保護 trigger；DB 使用者需要相應 DDL 權限。先在隔離資料庫驗證 schema。
- 商家提供 production Channel 憑證及 LINE Pay 的 v2 收款許可／OA 關聯確認；本次沒有尋找或讀取其他工作階段憑證。
- 現場用該 iPad／Star webPRNT Browser 驗相機權限、18 碼 Code128／QR；沿用站內 ZXing WASM，另提供掃描槍／輸入欄位。此環境的合成瀏覽器測試不代表真機可掃。
- 確認員工已開帳，選對桌、清掉不支援的優惠／分帳。付款碼確認後會另外顯示**伺服器報價**並要求明確「送出實際扣款」。不會因選到舊 LINE Pay 付款方式自動扣款。
- 確認 LINE Pay 商家中心的退款與客服權限、負責對帳管理員。未建置自動退款 API；異常狀態不可擅自解除鎖定。

## 持久狀態、重送與未知結果

- `prepared`：伺服器已算好金額／驗帳本、操作人員、整桌品牌權限／驗發票欄位，已儲存原帳單快照。此時尚未呼叫 LINE Pay，可以取消。
- `unknown`：在呼叫外部 API **之前先提交**送出意圖。oneTimeKey 僅留在請求記憶體、不寫 DB／日誌／localStorage。此狀態重送 pay **絕不再呼叫付款**；只允許用原意圖查詢。
- `settled`：LINE Pay 成功回應／查詢 `COMPLETE`，實收總額符合報價；交易 ID 先轉字串，避免 19 位數超出 JS 精度。建立 `table_orders`、標已付品項、自動清桌及 terminal 狀態同一 DB transaction，失敗全部 rollback，可再查原交易補齊，不能重扣。
- `failed`：明確拒絕（例如餘額不足）或官方查詢 `FAIL`。沒有實收訂單、解除帳單鎖。重送同意圖也不重扣；新的收款必須再次建立明確新意圖。
- `review`：回應金額／識別不符、帳單快照不符。停止自動處理，保留鎖定；管理員核對實際付款，必要時向 LINE Pay 辦理退款。不得假裝實收成功或自動退款。
- `cancelled`：只允許尚未送出的 `prepared`；timeout／實收後不能用取消釋放。

同一 session 同時只有一個 active 意圖（DB 部分唯一索引）；prepare/pay/check/cancel 都鎖 `table_sessions` row，跨平板、重整、並行請求也以持久狀態判斷。DB trigger 阻擋 active 意圖期間改品項、換桌／併桌、清桌、結帳等變更；舊手動／TapPay 路徑另在外部付款之前明確擋下。其他平板從 `GET /api/admin/orders` 讀回該意圖，只能續查原交易。

新收款開關關閉後仍可用原環境／Channel 查詢未完成交易；不可在還有未完成交易時清掉或改成另一組 Channel／環境。若已改，恢復原組再查。查詢結果沒有資料／timeout **不是未扣款證明**，保持鎖定並請管理員向 LINE Pay 核對。

發票在結帳 COMMIT 後只由首次完成的請求觸發；重送不重開。若服務恰好在 COMMIT 後中斷，付款仍成立，從「查單」補開發票／補印收據明細，不能重跑付款。列印失敗同樣只重印。此 MVP 不做持久發票 outbox；沿用既有補開路徑。

## 退款／人工異常處理

API 訂單在 `payer` 留 `linepay_payment`、`linepay_transaction`、`linepay_environment`。業務邏輯在外部發票作廢前就擋下手動作廢／取消品項，DB trigger 另擋改金額、品項、付款資料或狀態改 void（一般出餐 paid→ready→done 不受影響）。**不能把帳務作廢當作 LINE Pay 已退款**。

退款與 review 目前需指定管理員依官方商家中心／LINE Pay 支援核對原 `linepay_payments.id`（就是 provider orderId）、交易 ID、環境、金額；先取得付款／退款的確定證據，再以受審查的窄範圍帳務修正，同步確認發票。沒有提供可任意 unlock 的按鈕或 API。若商家需要經常退單，上線前應追加具有同等持久冪等／未知結果查詢的退款流程；本次收款功能不假稱包含該流程。

## 可重現驗證

```sh
npm test
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite node scripts/verify-linepay-postgres.mjs
node scripts/verify-linepay-browser.mjs
```

- 單元與狀態機：成功、拒絕、timeout、相同意圖重送、併發、unknown 查詢恢復、FAIL／PROCESSING、錯金額、預設停用、機敏設定、品牌驗權。
- 真實 Express middleware：匿名 401、CAFE 可達但未啟用 503、原交易可查、BAR 跨品牌 404、SPACE 403；網路被替身禁止。
- PGlite PostgreSQL 引擎：migration 重跑、session freeze、active unique index、完整結帳 SQL、timeout 復原、19 位交易 ID、禁止把 API 訂單手動作廢。
- 本機 headless Chrome：載入真正 POS JS，操作新 UI，核對 disabled／未知查詢／明確扣款確認與取消；所有 API 使用合成資料，沒有真實 LINE Pay／客人／印表機操作。
