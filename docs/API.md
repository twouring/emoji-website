# API 目錄

言文字｜台灣人才聚落 — 後台與前台 REST API 全清單。供 AI agent 管理資料使用。

> **本檔由 `scripts/test-api-docs.mjs` 強制與 `server.js` 同步。**
> 新增或刪除 `/api/*` 端點卻沒更新本檔，`npm test` 會失敗。請勿手動放寬該測試。

Base URL：`https://www.emoji.tw`（本地：`http://localhost:8080`）
所有請求與回應皆為 JSON（檔案上傳除外，用 `multipart/form-data`）。

## 認證

三種身分，都走 `Authorization: Bearer <token>`：

| 身分 | 憑證 | 用途 |
|---|---|---|
| AI agent | `ADMIN_API_KEY` 環境變數的值 | 管理全部後台資料（等同超級管理員） |
| 會員／管理員 | Google 登入後簽發的 token | 網站前台與後台 UI |
| 門禁裝置 | `ACCESS_DOOR_SECRET` 的值 | 只能打 `/api/access/scan` |

AI agent 用法：

```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" https://www.emoji.tw/api/state
```

金鑰產生：`openssl rand -hex 32`，設在 Zeabur 環境變數 `ADMIN_API_KEY`。
少於 24 字元會被忽略（視同未設定）。要撤銷就換一組新的並重啟。

**注意事項**

- 金鑰＝超級管理員，可指派管理員、發點數、改所有內容。只存在環境變數，絕不可寫進前端或 commit。
- agent 身分沒有綁定會員（`sub` 為 null），因此所有 `/api/me/*` 與報名類端點會回 403。這是刻意的。
- agent 發放點數時，`point_ledger.actor` 記為 `agent`。
- 會員 token 有效七天；每次請求以資料庫目前的管理員權限為準。部署本次修正後，舊版無期限 token 須重新登入。
- OAuth state 有效十分鐘，使用 HttpOnly、SameSite=Lax cookie 綁定發起登入的瀏覽器，不能作為 API token。

## 慣例

- **Upsert**：`events`、`updates`、`social/posts` 的 POST 帶 `id` 就是更新，不帶就是新增。沒有 PATCH 動詞。
- **時間**：社群貼文的排程時間以台北時間（UTC+8）讀寫，格式 `YYYY-MM-DDTHH:mm`。
- **錯誤**：非 2xx 一律回 `{ "error": "中文訊息" }`。DB 未就緒回 503。

## 公開端點（免認證）

### GET /api/health
服務健康檢查。回 `{ ok, db, dbConfigured }`。

### GET /api/public
公開唯讀資料，無個資：`{ raised, updates, events, content }`。活動只含「報名中」且公開的項目。
`content` 僅回首頁公告、菜單及空間文案／圖片白名單；IG token 與內部排程資料不會傳至瀏覽器。

### GET /api/events
可用 `?lang=zh|en|ja` 取得名稱、說明與地點的對應語系；未填翻譯沿用中文。公開列表包含預告與報名中。
公開活動列表。未登入只回 `visibility=public`；有效會員帶 Bearer token 時另回 `visibility=members`，皆限「預告／報名中」並包含已成立報名數。

### GET /api/events/:slug
支援同樣的 `?lang=zh|en|ja`；回傳包含 `translations`。
活動詳情。公開、私人與會員限定活動皆可由直接連結讀取；私人活動不列入清單，會員限定活動只列入有效會員的清單。帶有效 Bearer token 時一併回自己的報名、付款與簽到狀態，以及只屬於目前帳號的 `viewer: {name,email}`，供報名表預填。公開活動的有效報名另回 `referral_token`；帶有效 `ref` 查詢參數時回 `referred_by`，前台可顯示邀請人。私人與會員限定活動不啟用個人轉介追蹤。

### GET /api/points/packs
點數方案定價表。回 `{ price_twd, packs }`。

### GET /api/venue/schedule
未來 90 天已排定的場地時段與公開活動，回 `{ bookings: [{ venue, kind, starts_at, ends_at }], events: [{ title, slug, location, starts_at, ends_at }] }`。`bookings` 只含審核通過的申請時段，不含申請人資料；供申請表與行事曆顯示「已排定」。快取 5 分鐘。

### POST /api/checkout
所有結帳、活動付款、點數購買、退款與 webhook 都必須使用 Stripe「Emoji 言文字」帳號 `acct_1Ts2y95NXMKDsl40`。

建立 Stripe 結帳（購買創始會籍）。body：`{ lang }`。回 `{ url }`。未設 `STRIPE_SECRET_KEY` 或 DB 未就緒時回 503；超過 `SALE_END`（預設 2026-12-31）回 410。已付款與有效結帳保留名額合計達 `MAX_PARTICIPANTS`（預設 100）回 409。新 checkout 保留 30 分鐘；以 Postgres 交易鎖序列化所有 instance 的名額盤點與建立。

### GET /api/checkout/verify
付款成功頁驗證。query：`s`（Stripe checkout session id）。向 Stripe 確認 `payment_status=paid` 且為創始會員商品，回 `{ paid }`。

### POST /api/access/verify
驗證進出 QR token 是否有效。body：`{ token }`。回 `{ ok, claims }`。

### POST /api/stripe/webhook
Stripe 活動與點數付款 webhook。只接受 `STRIPE_WEBHOOK_SECRET` 驗證成功的原始 request body；處理 `checkout.session.completed`、`checkout.session.async_payment_succeeded` 與 `checkout.session.expired`。點數與活動皆驗證訂單、帳號、session、TWD 幣別及金額快照；重送不會重複核銷或入點。

## 登入

### GET /auth/google
導向 Google OAuth。query：`redirect`（須為白名單來源）。

### GET /auth/google/callback
Google 授權回呼，簽發會員 token 並導回。

## 主要讀取端點

### GET /api/state
**agent 讀取後台資料的主要入口。** 需認證。管理員身分回傳全部：

```
{ role: 'admin', super, me, bond: { target_amount, raised },
  users[], commitments[], entitlements[], events[], content{}, updates[] }
```

`users[]` 每筆含 `access_active`、`access_summary`、`points_balance`。
會員身分則只回自己的資料（`me`、`commitments`、`access`、`points`、`point_orders`、報名中活動）。
綁定會員的管理員另有本人 `access`、`points`、`point_orders`；會員及管理員皆有本人尚在處理的 `point_refunds`，供退款重試使用。

## 後台管理（需管理員或 agent 金鑰）

### GET /api/admin/event-applications
讀取場地申請（含 `kind` 社群／企業與 `venue` 二樓／三樓）及聯絡資料，回 `{ applications }`。僅管理員可讀，不會加入公開活動清單。

### POST /api/admin/event-applications/:id/review
審核待審申請。body：`{ status: "approved" | "rejected", review_note, expected_status: "pending" }`，回 `{ ok, application }`。回覆必填、最多 2000 字，申請人可見。不存在回 404；已審核或其他管理員先完成時回 409，不覆蓋既有結果。保存審核者與時間。審核通過不會自動保留場地、收費或建立／發布活動；檔期、費用與合作條件仍須書面確認。

### GET /api/admin/logs
後台操作紀錄，`?limit=`（預設 200、最多 500），回 `{ logs: [{ id, actor, method, path, summary, status, created_at }] }`。所有 `/api/admin/*` 的成功寫入（POST／DELETE）由中介層自動記錄，`summary` 為請求欄位摘要（略過含 token／secret／password／key 的欄位）。

### POST /api/admin/updates
新增或更新最新消息。body：`{ id?, title, content, type, date }`。
`type` 限：`月報`｜`季報`｜`重大事項`｜`活動通知`｜`財務摘要`（不合法則存為 `重大事項`）。
帶 `id` 為更新，找不到回 404。回 `{ ok, id }`。

### DELETE /api/admin/updates/:id
刪除最新消息。

### POST /api/admin/events
新增或更新活動。body：`{ id?, slug?, title, description, location, starts_at, ends_at, capacity, price_twd, visibility, status, translations? }`。
`visibility` 限 `public`｜`private`｜`members`；`status` 限 `草稿`｜`預告`｜`報名中`｜`已結束`；票價與名額為 0 以上整數。帶 `id` 為更新，回 `{ ok, id, slug }`。

`translations` 為 `zh/en/ja` 物件；一般欄位為 `title/description/location`，專屬頁純文字欄位見 `public/event-fields.js`。每欄最多 10000 字，不接受 HTML 執行；未傳 translations 的舊 API 更新會保留既有翻譯。中文基本欄位以頂層值為準。預告可公開但不能報名；百鬼夜行首次 migration 以預告建立，後續啟動不覆寫後台編輯。

### DELETE /api/admin/events/:id
百鬼夜行專屬活動禁止刪除，請改為草稿或已結束。其他活動可刪除沒有任何報名紀錄的活動。已有報名時回 409，應改為「已結束」以保留付款與簽到稽核。

### GET /api/admin/events/:id/regs
該場活動的報名名單，含聯絡、票券狀態、應付／已付、付款與簽到時間。回 `{ regs }`。

### GET /api/admin/events/:id/check-in
本活動負責人、共同管理者、平台管理員或已授權的簽到人員讀取現場工作台。回活動名稱與狀態、預設掃描模式、鎖定狀態、可接受票種及來賓資料；簽到人員不能以此端點下載 CSV、編輯活動、傳送通知或變更報名狀態。受限票種在每位來賓的 `can_checkin` 明示，實際寫入仍由後端再次驗證。

### POST /api/admin/events/:id/check-in
掃描或人工簽到。body 擇一：`{ token }`（活動票 QR 內容）或 `{ registration_id, attendee_id? }`。只接受已成立且未退款的票券；重掃回 `duplicate: true`。簽到人員若被限制票種，其他票種回 403。

### DELETE /api/admin/events/:id/check-in/:registrationId
取消一筆活動簽到，保留報名與付款紀錄。

### POST /api/admin/events/:id/regs/:registrationId/refund
對已成立的付費票執行 Stripe 全額退款並立即使票券失效。以 registration id 作 Stripe idempotency key，重送不會重複退款。

### POST /api/admin/content
寫入網站內容（key-value，含菜單 `menu` 與空間文案）。body：`{ key, value }`。
永遠是 upsert。讀取請走 `/api/state` 或 `/api/public` 的 `content`。

### GET /api/admin/social/posts
全部 IG／X 貼文規劃。回 `{ posts }`。

### POST /api/admin/social/posts
新增或更新社群貼文。帶 `id` 為更新。body 主要欄位：

- `platform`：`ig`｜`x`
- `post_type`：IG 限 `carousel`｜`image`；X 限 `text`｜`image`
- `status`：`draft`｜`ready`｜`scheduled`｜`published`｜`archived`
- `title`（必填）、`caption`、`caption_en`、`caption_ja`、`hashtags`
- `pages[]`（X 平台會強制清空）、`images[]`、`metrics{}`
- `scheduled_at`、`published_at`：台北時間 `YYYY-MM-DDTHH:mm`
- `external_url`（限 http/https）、`series`、`phase`、`cta`、`audience`、`notes`

### DELETE /api/admin/social/posts/:id
刪除貼文。刪除種子貼文（`sp_seed_*`）會寫入墓碑，避免下次部署復活。

### POST /api/admin/social/:id/publish-ig
立即發布單篇 IG 貼文（不等排程）。成功回 `{ ok, url, images }`；失敗把錯誤寫回貼文 `notes` 並回 502。

### GET /api/admin/ig/status
IG 自動發文系統狀態：token 有無、AI key 有無、未來排程、錯誤與逾期清單、素材庫統計。

### POST /api/admin/ig/compose
手動觸發 AI 補產（正常由每週日 cron 執行）。回 `{ ok, made }`；需 `ANTHROPIC_API_KEY`。

### GET /api/admin/ig/assets
素材庫清單（最新 100 筆）。回 `{ assets }`。

### POST /api/admin/ig/assets
登記素材：body `{ url, note }`。`url` 限 `/uploads/social/` 路徑或 https；`note` 必填（AI 產文要呼應照片內容）。

### POST /api/admin/x/compose
X 貼文 AI 起草：body `{ topic }`，回 `{ ok, draft: { title, caption, caption_ja } }`。
沿用 IG 補產的品牌鐵律與禁用字守門；需 `ANTHROPIC_API_KEY`，未設回 502。

### GET /api/admin/ads/campaigns
廣告投放紀錄列表。回 `{ campaigns }`（日期為 `YYYY-MM-DD` 字串）。

### POST /api/admin/ads/campaigns
新增或更新投放紀錄。帶 `id` 為更新。body 欄位：

- `layer`：`awareness`｜`retarget`｜`action`（三層廣告結構）
- `status`：`planned`｜`running`｜`done`
- `start_date`、`end_date`：`YYYY-MM-DD`；結束日不可早於開始日
- `budget`、`spent`：NT 整數（負值歸零）
- `post_id`：關聯的 social_posts id（選填，須存在）
- `metrics{}`（如 `reach`、`clicks`）、`notes`

### DELETE /api/admin/ads/campaigns/:id
刪除投放紀錄。

### POST /api/admin/upload/social
上傳貼文圖片。`multipart/form-data`，欄位名 `file`，限 5MB 影像。回 `{ url }`。

### POST /api/admin/upload/space
上傳空間介紹圖片。同上限制。回 `{ url }`。

### POST /api/admin/ig/assets/upload
素材檔案直傳：multipart `file`＋`note`（素材說明必填）→ MinIO `assets/`（未設 S3 則落 `/uploads/social/`）→ 登記 `ig_assets`。回 `{ ok, id, url }`。

### POST /api/admin/upload/menu
上傳菜單品項圖片（multipart `file`，≤5MB，jpeg/png/webp）。有設 S3 時存 MinIO `assets/menu-*`，否則落 `/uploads/menu/`。回 `{ url }`。

### POST /api/admin/commitments/:id/confirm
確認參與款項入帳：`payment_status` → 已付款、`membership_status` → 已啟用、
使用者 `status` → 已參與，並建立創始會員權益與贈點。

### POST /api/admin/entitlements
建立會員權益。body：`{ user_id, plan, ... }`。

### POST /api/admin/points/grants
發放點數。body：`{ user_id, amount, note（必填）, expires_at? }`。預設一年後到期。

### GET /api/admin/users/:id/points
指定會員的點數餘額與批次明細。

### POST /api/admin/points/orders/:id/fulfill
手動完成點數訂單（Stripe webhook 失敗時的補救）。

### POST /api/admin/users/:id/admin
指派或取消管理員。body：`{ admin: boolean }`。**限超級管理員或 agent 金鑰。**

## 會員端點（agent 一律 403）

以下需綁定會員身分，agent 金鑰打會得到 403。

### GET /api/me/access-qr
取得 45 秒有效的進出 QR token。

### GET /api/me/points
自己的點數餘額與批次。

### POST /api/me/points/redeem
以點數兌換服務。body：`{ service: "shower" | "laundry" | "capsule" | "entertainment", hours? }`；淋浴 70 點／次、頂樓洗脫烘 50 點／次、膠囊席與交誼廳各 100 點／小時（`hours` 必填）。須持有效會籍。

### POST /api/me/points/orders
建立點數加值訂單（走 Stripe）。

### POST /api/me/points/orders/:id/fulfill
完成自己的點數訂單。session 必須與原訂單、會員、方案、TWD 幣別及應付金額全部吻合，不能套用其他已付款 checkout。

### POST /api/me/points/refunds
點數退款。body：`{ point_order_id, principal_points }`。先持久化扣點與 pending 退款紀錄，再對 Stripe 退款；中斷時回 502 及 `refund_id`。同訂單有 pending 紀錄時，再次送出只重試原紀錄與金額。Stripe 明確失敗或取消時交易回補原點數與贈點，回 409 及 `refund_id`；僅 succeeded 標示完成。

### POST /api/me/profile
更新自己的姓名與電話。body：`{ name, phone? }`（姓名 1–80 字、電話 40 字以內），回 `{ ok, me }`。Email 由 Google 登入決定，不可改。

### POST /api/me/plans/checkout
線上購買一般會籍。body：`{ plan: "day_4h" | "day_12h" | "month" | "quarter" | "year", lang? }`，回 `{ url }`（Stripe Checkout）。牌價：200／500／4,000／10,000／35,000。付款完成後由 webhook 或 `/api/me/plans/verify` 建立 entitlement（`source: "stripe"`，以 session id 去重）並依方案贈點；會籍於首次進場啟用，7 天未進場自動起算。未設 Stripe 回 503。

### POST /api/me/plans/verify
結帳導回時驗證並開通。body：`{ session_id }`，回 `{ ok, already, plan }`；session 不屬於本人回 404、未付款回 402。與 webhook 重複執行不會重複開通。

### POST /api/commitments
送出參與（創始會籍）申請。Email 必須為目前已驗證的 Google 登入信箱，此表單不會更動登入身分。

### POST /api/event-applications
登入帳號提出場地申請（社群活動或企業包場），不需付費會籍；agent 金鑰沒有申請人身分，回 403。

body：`{ request_id, kind?, venue?, community_name, contact_name, contact_email, contact_phone?, title, description, starts_at, ends_at, attendees, requirements?, consent: true }`。

- `kind`：`community`（社群活動，預設）或 `business`（企業／團隊／客戶包場）。`venue`：`2F`（二樓交誼廳／交誼廳）或 `3F`（三樓共享空間）；社群活動固定為 `3F`，企業包場必填。

- `request_id`：前端產生的 UUID；相同帳號與識別碼重試只會保存一次。同內容回原申請（200），不同內容回 409；新申請回 201。回應為 `{ ok, application }`。
- 名稱長度上限：社群 120、聯絡人 80、Email 254、電話 40、活動名稱 160；活動內容 5000、需求 2000 字。電話與需求可留空，其餘必填；Email 必須有效。
- `starts_at`／`ends_at`：台灣時間 `YYYY-MM-DDTHH:mm`，必須是真實日期、開始晚於現在、結束晚於開始。回應日期為 ISO 8601。
- `attendees`：1–10000 整數，僅是預估人數，不代表場地容納量或核准人數。
- 需明確同意須知，保存同意時間；伺服器固定初始狀態為 `pending`，忽略自訂審核與申請人欄位。
- 每帳號每小時最多新增 10 筆，超過回 429；同筆重試不佔額度。資料庫未就緒回 503，不回報成功。

### GET /api/me/event-applications
讀取登入帳號自己的申請，回 `{ applications }`，包含申請內容、`id`、`status`（`pending`／`approved`／`rejected`）、`review_note`、`created_at` 與 `reviewed_at`。不接受指定其他使用者，agent 金鑰回 403；不在公開 API 提供申請或聯絡資料。

### POST /api/events/:id/register
報名活動。新來賓不需先登入，body 需傳 `{ name,email,lang? }`；啟用姓名拆分時改傳 `{ first_name,last_name,email,lang? }`。有效 Bearer token 會綁定目前帳號並忽略 body 的 Email。團體報名可傳 `quantity`（1–1000，且不得超過活動／票種剩餘名額）與 `additional_attendees`（不含第一位購買者）；未提供的參加者先沿用購買者資料，之後可逐張轉票。舊版等長 `attendees` 仍相容。免費票立即成立；付費票建立或沿用未過期的 Stripe Checkout，回 `{ url }`。付費活動未設定 `STRIPE_WEBHOOK_SECRET` 時 fail closed 回 503。

### DELETE /api/events/:id/register
取消免費且尚未簽到的報名。付費票須由後台退款，不可直接取消。

### POST /api/events/checkout/verify
付款回站補查。body：`{ session_id }`；登入結帳須符合目前帳號，免登入結帳須由 Stripe Session metadata 明確標記為訪客報名，才會呼叫同一個冪等核銷流程。webhook 仍是可靠核銷主路徑。

### GET /api/events/:id/ticket
取得自己的活動票券簽章 token。只對已成立且未退款的報名簽發；簽到時仍會查資料庫狀態。

## 門禁端點

### POST /api/access/scan
掃描進出 QR，開門並惰性啟用權益。需 `ACCESS_DOOR_SECRET`。
以 `(entitlement_id, token_iat)` 冪等，重掃回 `duplicate: true`。

## 目前沒有 API 的操作

刻意不提供，不是遺漏：

- **改 `users.status` / `can_view`**：`status` 由 `/api/admin/commitments/:id/confirm` 流程驅動，手改會與 commitment 狀態不一致；`can_view` 目前沒有任何邏輯讀取。
- **改／刪 entitlements**：後台 UI 也沒有，需要時再開。
- **刪 users、刪 commitments**：涉及金流與權益，一律走人工。

## 外部活動主與主辦團隊（2026-09-07）

活動主入口 `/organizer/events` 沿用 Google 登入與活動編輯器。平台授權的活動主可建立活動；僅被加入共同管理者的帳號只可管理受邀活動。每次請求重新查核資料庫權限，不能靠舊 token 保留撤銷後的權限。

### GET /api/organizer/state
僅回自己的／受邀共同管理的活動、本人姓名與 Email，以及 `can_create_events`。不包含其他會員、金流、點數、設定或其他主辦人的活動。未授權回 403。

### POST /api/admin/users/:id/organizer
平台管理員授予或取消建立活動資格，body `{ organizer: boolean }`。對象須先使用 Google 登入本站；不授予平台管理權限。

### GET /api/admin/events/:id/hosts
平台管理員／本活動負責人／共同管理者可讀主辦團隊。回 `{ owner, hosts, tickets, checkin }`；owner 為平台指定的主要負責人；hosts 有 `name,email,is_visible,can_manage,can_checkin,checkin_ticket_ids`，checkin 為預設掃描模式與鎖定狀態。

### POST /api/admin/events/:id/hosts
同上權限。body `{ name,email,is_visible,can_manage,can_checkin,checkin_ticket_ids? }`，依 Email 新增或更新；姓名最多 120 字，Email 最多 254 字。公開列名、共同管理與僅簽到權限分開設定；`checkin_ticket_ids` 只能引用本活動票種，空陣列代表全部票種。可預先加入尚未登入者，對方使用相同 Google 已驗證 Email 登入後取得權限。此操作不寄信、不建立會員、不授予建立其他活動的資格。

### POST /api/admin/events/:id/check-in/settings
活動管理者設定現場預設模式。body `{ mode: "standard"|"express", locked: boolean }`；locked 僅限制簽到人員切換模式，活動負責人與共同管理者仍可切換自己的工作台模式。

### DELETE /api/admin/events/:id/hosts
同上權限。body `{ email }` 移除共同主辦人；不能藉此移除主要負責人。移除後同一個 token 下次請求即失去該場權限。

既有建立／更新、刪除、讀名單、簽到及取消簽到端點，均允許本活動負責人／共同管理者；他場 ID 回 404。退款仍限平台管理員。管理員更新活動可傳 `owner_id` 指定已授權活動主，外部請求不能變更主要負責人。公開 API 僅含公開主辦人名稱 `host_names`，不包含團隊 Email 或管理權設定。

### POST /api/admin/events/:id/duplicate

活動管理者且具建立權限可將可管理活動複製為草稿。可傳 `visibility: public|private|members` 與 `times: [{starts_at,ends_at}]`，一次建立 1–30 場；省略 `times` 時保留單場舊介面。回傳 `{ok,id,slug,events}`。

活動名稱、多語內容、票種及售票期間、報名表、頁面、主辦團隊、簽到模式與設定都會複製；新活動一律為草稿，優惠碼到期日會清空。來賓、付款、通知及操作紀錄不複製。

### POST /api/admin/events/:id/registration-settings

活動管理者設定 `requires_approval`、`waitlist`、`group_registration`、`split_name` 布林值、`payment_approval`（`after_approval`／`authorize`）及可空白的 `opens_at`、`closes_at` ISO 時間。`split_name=true` 時，單人報名必須分開填寫名與姓，並以來賓語系的姓名順序保存於該場票券。免費及付費票支援待審核與候補；付費票可選核准後 24 小時內付款，或先做信用卡預授權、核准後才請款。

平台管理員可一併設定 `tax: {enabled,name,rate_bps}`；`rate_bps` 為整數基點（500 代表 5%）。因活動款項由言文字統一收取，外部活動主不可修改稅金。稅額於優惠折抵後以 TWD 四捨五入，報名與加購訂單各自保存當次稅名、稅率、未稅金額、稅額與含稅總額快照。

### POST /api/admin/events/:id/regs/:registrationId/status

活動管理者核准或拒絕待審核／候補報名，`status` 為 `registered` 或 `declined`。核准時交易鎖定活動並重新驗證名額，未核准不能取得票券。

### GET /api/admin/events/:id/activity

活動管理者讀取最近 500 筆報名審核／候補操作紀錄。

### GET /api/admin/events/:id/payments

平台管理員或該活動管理者可取得該活動付費報名、已收款、Stripe 付款與退款識別碼，以及結算摘要與結算台帳。`collector` 為言文字；每筆含稅交易回傳成交當下的 `tax_snapshot`，`settlement_summary` 分開列出累計已收、成功退款、待結算、已結算、淨收與尚可安排金額。系統不自行推算分潤或手續費，也不代替法定報稅或發票流程。

### POST /api/admin/events/:id/settlements

僅平台管理員可建立待結算紀錄。body：`{ amount_twd, due_on, note? }`。金額為正整數 TWD，且不可超過扣除成功退款、待結算及已結算後的尚可安排金額；`due_on` 為有效的 `YYYY-MM-DD`。建立紀錄不代表款項已撥出。

### PATCH /api/admin/events/:id/settlements/:settlementId

僅平台管理員可將待結算紀錄更新為 `{ status: "paid", reference }` 或 `{ status: "cancelled" }`。已撥款必須填可追溯的交易參考；已撥款與已取消紀錄不可再次修改，並保留在活動操作紀錄中。

### POST /api/admin/events/:id/questions

活動管理者設定 `questions` 陣列（最多 30 題）。問題含 id、type、label、required、options（選擇題）、translations（en/ja 題目）。`terms` 類型可設定內嵌三語安全富文字或 HTTPS 外部連結、閱讀後才能同意，以及同意時要求文字簽名。報名送出 `answers` 物件，以問題 id 為鍵；後端驗證必填、選項、條款閱讀及簽名並保存題目快照，名單 API 的 answers 可讀取歷史答案。

### POST /api/admin/events/:id/tickets

活動管理者設定 tickets 陣列（最多 30 種）：id、name、description、price_twd、capacity、active、opens_at、closes_at。自訂票種活動報名須送 ticket_id；後端依票種計價並鎖定活動驗證票種及全場名額，報名保存票種快照。

現場簽到權限：主辦團隊可設定 `can_checkin`，不授予名單、金流或活動編輯權。簽到人員使用 `/event-checkin.html?event=<活動 id>`；驗票與取消簽到端點每次查驗該活動權限，移除後立即失效。

### GET /api/events/:slug/calendar.ics

非草稿活動可下載 RFC 5545 行事曆；時間為 UTC，文字跳脫與 UTF-8 折行。可帶 `lang=zh|en|ja`，隱藏地點不寫入檔案。

### GET /api/events/:slug/calendar/google

非草稿且未取消、有有效起訖時間的活動，重新導向 Google Calendar 預填表單，由參加者自行確認儲存。支援 `lang=zh|en|ja`，使用 UTC 時間與台灣時區；隱藏地點與私密會議連結不公開。取消或無有效時間回傳 409。

### POST /api/events/:id/view

紀錄一次活動詳情頁瀏覽，body 可含 source、campaign，各最多 120 字；依台灣日期彙總，不收集 IP。

### GET /api/admin/events/:id/insights

活動管理者查詢 `days=1|7|30|90`（1 為台灣日期的今天，其餘包含今天） 的每日來源瀏覽次數與目前報名／簽到累計；不代表不重複訪客。

### GET /api/admin/events/:id/messages

查看本活動通知草稿與逐收件人處理紀錄，configured 指示寄信服務設定。

### POST /api/admin/events/:id/messages

儲存草稿：subject、body、audience（registered／pending_approval／waitlisted／approved／checked_in）。

### POST /api/admin/events/:id/messages/:messageId/schedule

確認寄送：可傳 send_at，未傳為立即。須已設定 Resend；快照當下分眾收件人，背景工作每分鐘發送。寄信服務接受不等於送達，重試超過 23 小時轉人工核對。

### POST /api/admin/events/:id/messages/:messageId/cancel

取消尚未處理的通知；已處理或服務已接受的郵件不能撤回。

### GET /api/admin/events/:id/regs/:registrationId/history

查閱取消／退款／逾期後重新報名之前的完整快照。票款查詢亦包含歷史付款，避免重新報名覆蓋帳務。重新報名會更換 QR 票券版本，舊 QR 永久失效。

### POST /api/admin/events/:id/details

設定 mode（offline／online／hybrid）、cover_url、online_url、contact_email、hide_location。公開 API、HTML metadata 與 ICS 不提供受保護地點／會議網址；有效報名者才可取得。

### POST /api/admin/events/:id/cancel

傳入公開 reason，關閉 Stripe 待付款結帳並解除預授權後取消活動；可傳 `notify` 排入取消通知。平台管理員可傳 `refund_paid: true`，從言文字統一收款帳戶將原始票與加購票的剩餘可退款金額逐筆原路退回，沿用退款台帳與冪等鍵；外部活動主無權啟動統一收款退款。取消後禁止報名與票券簽到。

### POST /api/events/:id/ticket-options

提供 unlock_code 取得可選票種。公開回應不含解鎖碼；隱藏票種報名需同時送 ticket_id、unlock_code。票種可設定 flexible_price 與 minimum_twd，報名送 amount_twd；後端驗證最低金額，固定票價忽略自訂金額。

### POST /api/admin/events/:id/guests/import

匯入 guests（name、email），每批 1–500 位；status 可為 invited、registered（僅免費票）、pending_approval、waitlisted。可指定 ticket_id 及 unlock_code。使用交易鎖檢查名額，不足時整批回滾；重複報名預設跳過。傳入 `update_existing: true` 且指定票種時，只更新既有報名的原始票種，不覆寫姓名、報名狀態、票款、退款或加購／贈票。

新增受邀來賓時可傳 `send_invites: true` 與 `language: zh|en|ja`。邀請只排給本次新增者；重複 Email 會略過且不重寄。受邀者自行報名時免除活動或票種審核，但仍須完成必填問題、名額檢查與付費。寄信服務未設定時整批回傳 503，且不新增來賓或建立寄送佇列。

### PATCH /api/admin/events/:id/regs/:registrationId/ticket

傳入 `ticket_id` 變更一筆報名的原始票種；原始團體票一起變更，加購／贈票不變。已收／已退金額與付款紀錄不變，不觸發收款；變更後提升票券版本，使舊 QR 失效。活動取消、報名失效、已簽到、票款／退款處理中或目標票種名額不足時拒絕變更。

### GET /api/admin/events/:id/coupons
### POST /api/admin/events/:id/coupons

活動管理者查看／儲存 coupons 陣列（最多 100）：code、type（percent／fixed）、value、max_uses（0 不限）、active、expires_at。

### POST /api/events/:id/quote

依 `ticket_id`、`unlock_code`、`amount_twd`、`coupon_code`、`quantity` 試算。回傳 `base_twd`、`discount_twd`、`tax_twd`、`tax_name` 與含稅 `price_twd`；稅額在優惠折抵後計算。報價不保留名額；實際報名重新鎖定活動驗證優惠次數，保存折扣與稅金快照，核准後付款沿用已核准金額。

### POST /api/events/:id/feedback

已結束活動的有效報名者可送出 rating（1–5）與 comment（最多 5000 字）；每人一份，可更新。

### GET /api/admin/events/:id/feedback

活動管理者查看評分與文字回饋；不向公眾提供來賓回饋。

多人購票：報名可傳 quantity（1–1000，且不得超過活動／票種剩餘名額）及 `additional_attendees` 陣列（name、email，不含第一位購買者），第一張票使用報名人的姓名與 Email；未提供的參加者先沿用購買者資料，之後可逐張轉票。舊版等長 attendees 仍相容。所有票屬同一票種，容量依票數扣除；優惠碼固定折抵以整筆報名計算。每位參加者有獨立 QR，ticket API 同時回傳 tickets 陣列，購買者可查看各人票券。簽到可傳 attendee_id 或掃描個人 QR；取消簽到以 attendee_id 查詢參數指定。部分人已簽到時不能自行取消整筆報名。

### PATCH /api/events/:id/attendees/:attendeeId

已登入購買者修改自己有效報名、尚未簽到的個人票，body `{name,email}`。活動需仍開放。每次修改會更換該票識別碼，舊 QR 立即失效，其他同訂單票不變。付款與取消權仍屬購買者，不會自動寄信。不存在／他人票回 404，已簽到或活動關閉回 409。

部分與分次退款：`POST /api/admin/events/:id/regs/:registrationId/refund` 可傳 `{amount_twd,request_id}`，金額為整數 TWD，request_id 為 16–80 字元唯一識別碼。同一次重試必須沿用識別碼及金額。僅平台管理員可執行，待處理退款也占用可退額度；部分退款保留票券，全額待處理暫停票券，全額成功後失效。逐筆 `event_refunds` 保存金額與服務商狀態，webhook 向 Stripe 回讀最新狀態以處理亂序通知。

活動操作紀錄支援 `?before=<id>` 游標，每頁最多 100 筆，回傳 `next`。包含活動資訊、票種、優惠碼、報名設定、題目、團隊、簽到、轉票與退款異動；歷史未記錄的操作不會回填。

### POST /api/auth/email/start

一次性 Email 登入。body `{name,email,redirect,lang}`，redirect 限允許官網來源。驗證姓名／Email；每 IP 每分鐘 10 次、每信箱每分鐘 1 次及每小時 6 次。登入碼只有 SHA-256 雜湊存入資料庫，有效 20 分鐘。缺寄信服務回 503，絕不假裝已寄出。

### POST /api/auth/email/verify

body `{code}`，原子消耗一次性登入碼，回傳 `{token,redirect}`。已使用／過期／無效回 400。連結以 fragment 攜帶登入碼，確認按鈕才兌換，避免郵件預覽機器人消耗。帳號依已驗證信箱沿用，不接受請求指定角色；每次 API 授權仍以資料庫角色為準。測試以隔離資料庫建立一次性碼，未寄送真實郵件。

### POST /api/email/webhook

Resend／Svix 簽章端點，需 `RESEND_WEBHOOK_SECRET`。以原始 body、`svix-id`、`svix-timestamp` 驗證 HMAC-SHA256，時間容忍 5 分鐘，事件 ID 去重。保存寄出／送達／延遲／退信／申訴／失敗／開啟／點擊事件，透過寄信服務 ID 關聯活動通知，亂序到達不會被本機「已接受」狀態覆蓋。未設定回 503，簽章錯誤回 400。開啟／點擊追蹤仍須服務商啟用。

### GET /api/events/:id/receipt

僅付款購買者取得自己目前報名的 Stripe 付款收據網址，後端向 Stripe 讀取 PaymentIntent 的 latest_charge.receipt_url。無付款或尚未產生回 404；受讓者無法取得購買者收據。此為付款收據，不代表台灣統一發票或已開立稅務憑證。

### GET /api/events/:id/guests

主辦人啟用公開名單時，回傳最多 100 個已同意公開的有效參加者姓名，不含 Email 或票券。未開啟或草稿回 404。

### PATCH /api/events/:id/profile

body `{visible:boolean}`，已登入者僅能修改符合自己已驗證 Email 的有效票券公開姓名設定。轉票會重設為不公開，避免沿用原參加者同意。

### POST /api/admin/events/:id/cover

活動擁有者／共同管理者上傳封面，multipart `file`，PNG／JPEG／WebP，最多 5 MB；驗證檔頭及副檔名、使用伺服器生成檔名。沿用既有 S3 儲存，未設定時存 `uploads/events/`。成功後同步寫入 event_details.cover_url 與活動操作紀錄。跨活動拒絕，不開放一般參加者上傳。

### GET /api/events/:id/orders

購買者讀取目前報名版本的加購訂單，不含解鎖碼。每筆保留自己的票種、數量、含稅價格、`tax_snapshot` 與付款狀態。

### POST /api/events/:id/additional-tickets

有效報名購買者加購 1–1000 張票，且不得超過活動／票種剩餘名額；body `{ticket_id,quantity,unlock_code,amount_twd,lang}`。不接受需審核票種或優惠碼。原始票與加購訂單分開保存，容量同時包含有效票與保留中的加購；若活動已設定稅金，加購總額與訂單稅金快照使用相同稅率。免費直接成立，付費由 Stripe 回站／webhook 冪等核銷後才新增個人 QR。未完成加購可續付，不會覆蓋原票。

### POST /api/admin/events/:id/orders/:orderId/refund

僅平台管理員退款加購訂單，body `{amount_twd,request_id}`；支援部分／分次及冪等重試。全額成功只刪除這筆加購的有效票並釋出相同人數，原始票保留。原票退款前須先處理付費加購，避免付款仍有效卻失去整組票。

`GET /api/events/:id/receipt?order=<orderId>` 可取得自己特定加購訂單的 Stripe 收據。

### DELETE /api/events/:id/orders/:orderId
購買者取消自己的免費加購訂單。交易內鎖定活動、報名與訂單；拒絕已簽到或付費票。僅撤銷該加購 QR、釋出該筆人數，原票券保留。重複取消回傳成功，不重複扣人數。

### GET /api/admin/events/:id/regs/:registrationId/timeline
活動管理者查詢單一來賓操作及郵件歷程。返回 registration、最多 200 筆 activity 與 100 筆 mail（含服務商事件）；跨活動與跨主辦人隔離。不把 accepted 當作已送達。

報名設定新增 `group_registration` 布林值，關閉後禁止多人初次報名與加購；既有票券保留。來賓 status 更新支援 registered、pending_approval、waitlisted、declined，並可設定 `notify` 與最多 5000 字的 `message`。通知與狀態寫入同一交易；未設定寄信服務時 notify=true 返回 503。已簽到、付款處理中或待退款的報名須先處理原流程。

### POST /api/admin/events/:id/regs/:registrationId/tickets
活動管理者免費贈票，body: ticket_id、quantity（1–10）。有效報名及剩餘名額檢查、鎖定容量、獨立 0 元贈票訂單與操作紀錄。不請款、不更改來賓帳號資料。

### DELETE /api/admin/events/:id/regs/:registrationId/tickets/:attendeeId
活動管理者移除單張未簽到的有效票券，至少保留一張。只減少有效票數及撤銷 QR，不退款；既有付款／退款紀錄保留。加購訂單保留原金額，quantity 表示剩餘有效張數。

### PATCH /api/admin/events/:id/messages/:messageId
編輯未發布的活動通知草稿。body: subject、body、audiences（registered、pending_approval、waitlisted、approved、checked_in、invited 可複選）、ticket_ids（空陣列表示全部票種）。受邀者不能限制票種。保留舊版 audience 單一狀態輸入相容性。

### GET /api/admin/events/:id/messages/:messageId/preview
預覽目前符合狀態與票種的購買者收件名單及總數，與排程使用同一篩選規則；不寄信。

### POST /api/admin/events/:id/messages/:messageId/publish
只發布草稿至活動頁，不寄信。僅符合目前狀態及票種的登入來賓可見，草稿／未到排程時間／取消的公告不可見。

### GET /api/events/:id/messages
登入來賓取得當前可見的最近 100 則活動公告。轉票受讓人只能讀取自己票種適用的公告；狀態切換後立即重新判斷，不沿用過往收件資格。

報名設定另支援 `feedback: {enabled, delay_hours, subject, body}`。delay_hours 為活動結束後 0–168 小時；自訂主旨或內容留白時使用來賓中／英／日語系預設。需有結束時間與寄信服務。每筆有效報名最多建立一封邀請；寄送前再次檢查啟用狀態、報名及是否已填回饋。活動提醒停用後，尚未送出的提醒也會取消。

### GET /api/events/:id/notification-settings
登入參加者或轉票受讓人讀取自己對此活動的通知偏好。返回 settings: blasts、reminders、feedback，預設皆開啟。不允許其他主辦人代查。

### PUT /api/events/:id/notification-settings
儲存自己的活動公告郵件、活動前提醒及活動後回饋邀請開關，三個欄位皆須布林值。寄送 worker 在每次發送前重新檢查偏好；尚未寄出的通知會取消。報名／付款／票券狀態通知不受影響，已寄出郵件無法撤回，前台公告保持可讀。

### POST /api/events/unsubscribe
免登入退訂單一活動的單一非必要通知類型。body: token、action（preview 或 unsubscribe）。token 以服務端 HMAC 綁定既有郵件識別碼，不含明文 Email，不接受任意活動／帳號指定；preview 僅回傳活動名與類型，不修改偏好。unsubscribe 只關閉該類型，重試冪等，不允許重新訂閱或取消必要票券通知。網頁連結把 token 放在 fragment，開啟後移除，需使用者明確按下確認才寫入，避免郵件掃描預覽誤退訂。

### 活動富文字內容
### GET /api/admin/events/:id/content

活動管理者讀取三語富文字與純文字內容。
### POST /api/admin/events/:id/content/preview

活動管理者傳入 `{html}`，取得伺服器清理後的 HTML，不儲存。貼上操作可另外傳入 `pasted_text`（字串、最多 100000 字）；若全文為單一支援的 HTTPS 影片網址，沿用影片白名單轉為嵌入。其他內容保留原 HTML 並清理，不會自動嵌入任意網站。
### PUT /api/admin/events/:id/content

活動管理者傳入 `{lang,html,text}`（zh/en/ja），儲存該語言並同步純文字摘要。HTML 上限 100000 字，純文字上限 10000 字；僅容許指定格式與 HTTPS 媒體，影片限 YouTube privacy-enhanced、Vimeo、Loom 嵌入網址。一般活動編輯若改變說明，會移除該語言舊富文字，避免內容不同步。

### POST /api/admin/events/:id/content/upload

活動管理者以 multipart `file` 上傳一個檔案。圖片限 PNG/JPEG/WebP 且最多 5 MB；PDF 最多 10 MB，驗證宣告格式與檔頭／結尾。回傳 `{url,type,name,size}`，主辦人插入內容並儲存後才會出現在活動頁。沿用 S3，未設定時使用本機 uploads/events；PDF 強制下載。檔案連結為公開素材，不可用於私密參加者文件。此格式檢查不是防毒掃描。

活動通知新增／修改可傳入 `body_html`（最多 100000 字）。伺服器白名單清理後保存，預覽與活動公告 API 均回傳此欄位。省略 HTML 且純文字未變時保留原格式；純文字改變時清除舊 HTML，明確傳入空字串則改回純文字。排程將 HTML 一併複製至每份寄送紀錄，郵件將上傳相對路徑轉成網站絕對網址、影片轉成連結，並保留純文字替代內容與退訂連結。

活動報名連結支援 `tt`（或 `ticket_id`）、`coupon`（或 `coupon_code`）、`unlock_code`：只預填與查價，不會自動送出報名。指定票種不存在或未開賣時選第一個可用票種，隱藏票仍須通過伺服器解鎖驗證。報名 `attribution` 支援 source/campaign/referral/medium/content/term/gclid/fbclid/li_fat_id，僅保存字串且各欄上限 256 字；核准後付款保留原報名來源。

### GET /api/admin/events/:id/embed

活動管理者讀取嵌入網站來源 `{origins:[]}`。

### PUT /api/admin/events/:id/embed

活動管理者傳入 `{origins:["https://example.com"]}`。最多 10 個精確來源，不接受萬用字元、路徑、帳密或非 HTTPS；本機測試站額外允許 HTTP loopback。空陣列停用嵌入。僅 `/embed/events/:slug` 與對應 en/ja 路徑以 CSP frame-ancestors 允許這些來源，其餘網站頁面保持 SAMEORIGIN。草稿與未啟用嵌入的活動回 404。

### GET /api/auth/session

以現有 Bearer session 驗證登入，回傳 `{authenticated:true,user_id}`，不回傳 session token 或完整帳號資料。供嵌入登入分頁與 iframe 驗證回傳的登入狀態。

活動／加購付費報名回應新增 `session_id`，加購另回傳 `order_id`。`POST /api/events/checkout/verify` 額外回傳 `status` 與 `order_status`；登入付款限定 Checkout 所屬帳號，免登入付款限定該 Stripe Session 自己的不可猜識別碼與訪客 metadata。嵌入頁在付款連結建立後，每 15 秒確認一次、最多 10 分鐘，並保留手動更新；不因外部網站 postMessage 就宣告付款成功。

活動公開姓名名單：`GET /api/events/:id/guests?after=<上一頁 next>` 回傳 `{guests:[{name}],next:string|null}`，每頁最多 100 個不同公開姓名。僅活動已開啟名單、有效報名且票券選擇公開姓名才列出；不提供 Email 或票券識別碼。`next:null` 表示沒有下一頁。

### POST /api/events/:id/join-online

已登入且有效報名的購買者或有效票券受讓人取得主辦人設定的 HTTPS 線上活動連結，回傳 `{url}`。草稿、預告、取消或無有效報名回傳 404；無有效連結回傳 409。按使用者累計點擊次數與首次／最近點擊時間，不記錄 IP。

活動數據 `GET /api/admin/events/:id/insights` 新增 `online: {participants, clicks}`，為全活動累計點擊連結的帳號數與次數，不受瀏覽期間篩選，不代表實際會議出席。

取消活動端點另接受 `notify: boolean`，預設 false。選擇通知但未設定寄信服務時回傳 503，不更動活動。啟用時，取消與取消通知佇列在同一筆交易提交，收件人為已報名／待付款／待審核／核准待付款／候補／請款處理中的購買者，以及有效已報名票券受讓人；依 Email 去重。回傳 `notifications_queued` 不代表已送達。取消通知屬必要狀態通知，不受公告退訂影響；不會自動退款。

取消活動可附 `reason_translations: {en, ja}`，兩欄選填、各最多 1000 字。活動頁與取消郵件依語系套用，空白翻譯沿用 `reason`。

活動數據另回傳 `registrations: [{day, bookings, self_service_bookings, registered, self_service_registered, self_service_checked_in}]`：以台灣日期依目前報名紀錄建立日彙總。`bookings` 包含後台匯入，`self_service_*` 只計前台自行報名；有效與簽到人數採查詢當下狀態，不是當日歷史快照，也不另計獨立加購筆數。範圍沿用 `days`。
