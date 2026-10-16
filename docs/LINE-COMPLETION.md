# LINE 活動票券、用餐回饋與 LINE Pay 範圍

## 上線設定

- 沿用後台「系統設定 → LINE 官方帳號」的 Messaging API secret / access token、LINE Login channel ID / secret；Login channel 與 Messaging API channel 必須屬於同一 Provider，才能對上使用者 ID。會員須加官方帳號好友且未封鎖，LINE 才能投遞。未設定 Messaging API 時不建立工作、不阻擋報名或結帳。
- LINE Login callback：`https://www.emoji.tw/auth/line/callback`（以實際 PUBLIC_ORIGIN 為準）；會員頁新增「綁定 LINE・接收活動票券」，由已登入會員啟動，state 同時鎖定會員與瀏覽器。已綁定其他會員／LINE 時回 409，不可自動拆綁或搶綁。
- `EVENT_QR_SECRET`（或既有 `ACCESS_QR_SECRET`）必須設定，沿用既有活動簽章密鑰，不另造核銷系統。此設定沿用現有啟動時載入方式。沒有 QR 密鑰時票券工作暫停，不影響報名。
- 評論：後台填入 `LINE_REVIEW_URL` 才會排程邀請，完整 HTTPS URL、不可含帳密；留空不送。沿用即時載入，不用重新部署。
- 部署啟動 migration 建立 `line_deliveries` 與 due index。排程每分鐘跑一次，只在官網排程服務跑；admin / Railway 備援不跑。Cloud Run 排程依賴既有常駐 CPU／執行個體政策；若整個服務 scale-to-zero／休眠，恢復後才補處理，評論超過72h不補送。

## 活動票券

- 免費報名成立、Stripe 實際付款完成與 capture 完成後，都沿用 `notifyRegistration` 的成功路徑排入 LINE 工作，與 Email 的 `confirmation_queued` 無關。每分鐘掃描可補回綁定後的有效票券、加購付款／審核成立、暫時資料庫故障；不會向 pending_payment / pending_approval 的報名發有效票。
- **首次部署會補送所有已綁定會員尚有效的未來實體活動票券**。線上活動不發入場 QR。多人票每位 attendee 一張（個別核銷），加購票只有該加購單 registered 才發。
- 工作唯一鍵：`ticket:<attendee 或單人 registration id>:<ticket_version>`。改票升版本會送新版，同版本不重送。取消、退款、舊版、失效加購於送出前重新查驗；圖片讀取也會再次驗證 DB 狀態。
- Flex 的 QR PNG 內容就是既有 `event-ticket` HMAC token：包含不透明 ID、版本、時效，不放姓名、電話或 Email。既有 `/api/admin/events/:id/check-in` / integration 核銷會驗證同一張票。圖片不核銷、不改狀態，不存在公開核銷端點。
- PNG 回應 no-store / no-referrer；URL 與 QR 都是 bearer credential，請勿分享。反向代理／CDN／監控的 request log 應遮蔽 `/api/line/qr/*` 尾段，不應記錄完整 token。

## 用餐後評論邀請

- 只採用實際 `table_orders.status='done'` 且金額大於0、綁定會員的完成消費；不是只看預約日期，也不會把取消訂位視為已用餐。未綁會員的現金／匿名客無法判斷 LINE 身分，不會亂送。
- 以 `done_at`（舊單為 null 才 fallback `paid_at`）計算，完成 **24–72 小時**內才可送；至少延遲24h，超過72h不補送。資料庫時鐘計算，台北營業日去重。
- 同會員同台北日只邀請一次，避免同桌拆帳重複。排程建立工作與實際投遞前都查狀態；作廢、取消／不再 done、0元、超過72h或解除綁定就跳過。
- 文案中立邀請真實體驗，不篩選滿意客、不誘導五星；卡片 builder 提供中／英／日三語。消費單沒有會員語言偏好欄位，目前用繁體中文，不憑空猜語言。

## 多執行個體與失敗行為

- 單一 `WITH ... FOR UPDATE SKIP LOCKED ... UPDATE ... RETURNING` 原子領取，2分鐘租約，attempt 條件保護狀態更新；HTTP 不持有來源訂單交易，避免拖住結帳。
- 每個工作持久保存同一個 UUID `X-Line-Retry-Key`。API 成功後 worker 崩潰也使用同 key 重試；只有帶 `x-line-accepted-request-id` 的409才視為先前已接受。不是假定任何409成功。
- 失敗每10分鐘重試，最多12次；首次嘗試23h後停止，避免超過 LINE 的24h retry-key 保證而重送。工作保留 `sent` / `skipped` / `failed` 與分類錯誤，人工處理不得直接換 key 重送結果不明的工作。
- outbox 不存訊息本文、QR token、收件人姓名／Email／電話；錯誤紀錄只含分類，不印 provider response 或例外 message（可能含個資／token）。quiet 仍留下 `operation_failed`，不默默吞掉錯誤。新增通知故障不改報名／付款結果。
- 可用 `SELECT kind,state,count(*) FROM line_deliveries GROUP BY kind,state` 觀察佇列；`last_error='delivery_failed'` 代表需查 token 權限／好友關係／額度，`retry_exhausted` 不應自動改回 pending。

## LINE 取消訂位與 POS

- 沿用同一 `dining_reservations`，LINE 取消直接原子 UPDATE 此表，不另設 LINE 訂位表，不用等同步程序。
- UPDATE 再驗綁定 LINE、未刪除、new / confirmed、日期未過；無權、已取消、已到店、no_show 拒絕。重送取消不重複成功。
- POS 的 `GET /api/admin/reservations` 讀同表，下次重新整理／既有輪詢即顯示 cancelled（非新增即時 WebSocket）。測試以 PostgreSQL 引擎取消後實際呼叫 POS HTTP API 驗證。

## LINE Pay 加好友：已在現有 QR 商家後台完成綁定

父代理已透過使用者登入的 LINE Pay 商家中心完成「管理基本資訊 → 綁定 LINE 官方帳號 → 輸入 `@338ymhys` → 設定 → 確認」。頁面先顯示「套用成功」、再顯示「儲存成功」；重新讀取帳戶資訊後，已列出：

- 官方帳號：`@338ymhys`
- 狀態：`UNVERIFIED`
- 名稱：`言文字 Emoji｜咖啡．酒吧．共享空間`

商家頁面明確說明「付款完成後新增 LINE@ 好友」，且設定會即時套用付款頁面。因此現有商家 QR 付款已完成所需的加好友邀請設定，**不需要為這項需求新增 Offline 扣款 API**。`UNVERIFIED` 為頁面回讀的原始狀態，不冒稱已通過認證。

**已驗證範圍**：商家設定成功且重新讀取仍有綁定資料。**尚未驗證**：真實客人付款後的畫面與加入好友結果；沒有對客人扣款或建立試交易。是否加入好友由客人自行選擇，不等於已完成會員綁定。

既有 `lib/linepay.js` 商家對帳與 POS「LINE Pay」手動記帳保持原本用途；不因上述商家設定而自動向客人扣款。另行開發的 Offline API 功能目前僅保留在未推送的工作分支草稿，停止擴充，不列為本次啟用或部署項目。

以下僅保留供未來另案評估的 API 版本查核資料，**不代表本次 QR 付款需要或已呼叫這些 API**。

官方已驗證的 `extras.addFriends` 是 object array（不是裸字串陣列），例如：

```json
{
  "extras": {
    "addFriends": [
      { "type": "LINE_AT", "idList": ["@338ymhys"] }
    ]
  }
}
```

`idList` 的官方帳號須先在 LINE Pay 商家中心註冊／關聯；不是填入任何帳號就能生效。Offline v2 request 僅存在本地草稿，沒有推送、部署或送出實際交易。若未來另案需要 Online v3 或 Offline v2.4／v4，應先取得該版支援規格，不能把舊版 extras 直接套用。現有 QR 商家付款的邀請已透過後台綁定設定，不依賴這份程式草稿。

官方來源（查證於2026-10-16）：

1. [LINE Pay 整合指南 v1.1.2，Extra fields / extras.addFriends](https://pay.line.me/file/guidebook/technicallinking/LINE_Pay_Integration_Guide_for_Merchant-v1.1.2-TW.pdf)：object[]、`type: LINE_AT`、`idList`、需商家中心註冊的官方帳號。
2. [Offline v2 Payment request](https://developers-pay.line.me/offline-api-v2/request-payment)：`POST /v2/payments/oneTimeKeys/pay` 的 extras 示例。
3. [Online v3 付款請求](https://developers-pay.line.me/zh/online-api-v3/request-payment)：`POST /v3/payments/request` 使用 options / packages / redirectUrls，不能以舊版範例捏造。
4. [Messaging API retry key](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)：持久 retry key、24h有效期與409 accepted request。

## 驗證方式

```sh
npm test
# 額外執行 PostgreSQL 引擎（WASM PGlite）整合測試，不依賴正式資料庫、無對客推播：
npm install --prefix .tmp/line-test-tools --no-audit --no-fund @electric-sql/pglite
PGLITE_MODULE="$PWD/.tmp/line-test-tools/node_modules/@electric-sql/pglite" \
  node --test scripts/verify-line-delivery-postgres.mjs
```

一般測試涵蓋無設定退化、三語卡片、固定retry key、409確認、個資遮蔽、會員 state/cookie 綁定、衝突、取消權限與精確 API 文件。額外 PGlite 測試執行實際 PostgreSQL SQL、雙 worker 領取、租約回收、多人／加購／新版票、24–72h／作廢／去重、QR HTTP PNG與取消／舊版／退款拒絕、LINE取消後POS查詢。PGlite 是單連線 PostgreSQL 引擎；雙 worker 測試驗證原子 SQL 領取行為，不宣稱已對正式多程序 PostgreSQL 做壓力測試。所有 LINE HTTP 都是 fetcher stub，未向客人發送測試訊息。
