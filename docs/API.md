# API 目錄

言文字｜台灣人才聚落 — 後台與前台 REST API 全清單。供 AI agent 管理資料使用。

> **本檔由 `scripts/test-api-docs.mjs` 強制與 `server.js` 同步。**
> 新增或刪除 `/api/*` 端點卻沒更新本檔，`npm test` 會失敗。請勿手動放寬該測試。

Base URL：`https://www.emoji.tw`（本地：`http://localhost:8080`）
所有請求與回應皆為 JSON（檔案上傳除外，用 `multipart/form-data`）。

## LINE 會員票券與用餐回饋

### POST /api/me/line-link

會員 Bearer session 啟動 LINE 帳號綁定；body 無欄位，不接受客戶端指定會員 ID。回 `{url}`（LINE OAuth 授權網址），並設定 HttpOnly / SameSite=Lax 的短效 state cookie。前端須於同一瀏覽器轉往 `url`。callback 只綁定經驗證 session 的會員，已綁定他人時回 409，不自動解除既有綁定。未登入 401，LINE Login 未設定 503。成功後會員可接收尚有效活動的 Flex 票券；會員頁有三語綁定按鈕。此端點不是付款 API。

### GET /api/line/qr/:token.png

LINE Flex 票券圖片（image/png），使用現有活動 `event-ticket` HMAC token；不含姓名／Email／電話。無效／過期 400，報名未成立、退款、取消、舊版本或無效加購票 404。每次產圖前查實際 `event_regs` / `event_attendees` / `event_ticket_orders` 狀態；`Cache-Control: no-store`、`Referrer-Policy: no-referrer`。QR 內容直接是既有核銷 token，沿用既有管理員核銷端點，不新增公開核銷。圖片 URL 是 bearer credential，不應記錄完整路徑／分享給他人。部署與排程規則見 [LINE 完整整合](LINE-COMPLETION.md)。

## POS 出餐單列印時機

### GET /api/admin/orders/kitchen-print-jobs

管理員／餐飲操作人員取得尚未領取的出餐單工作（支援 `venue`；整張單須屬於可操作品牌）。送單工作身分固定；領取前依最新桌號、品項、數量與備註刷新，移除已取消／已出餐／已結束內容。未先送單的線上先付款品項於付款入帳時建工作；POS 櫃檯加點須按「送出點餐／列印出餐單」，收款端點不建立出餐工作。不回補新版部署前的舊單，避免重新出單；新版已持久化的未領取工作即使清桌仍保留。回 `{jobs:[{id,table_no,items,amount,placed_at,status}]}`。同一 `ticket` 即使分帳、付款或換桌仍只建立一次；未送單購物車不列印。

### POST /api/admin/orders/kitchen-print-jobs/:id/claim

領取一張工作，body `{operator_id?}`。伺服器驗證品牌所有權並以原子 `UPDATE ... WHERE claimed_at IS NULL` 跨裝置／重新整理去重，記錄 actor、操作人員與時間。回 `{ok:true,claimed:true,job}` 或 `{ok:true,claimed:false}`，無權限／不存在回 404。遇到硬體失敗會暫停本機後續領取；結帳頁狀態列顯示「自動出單運行中」／「這台未自動出單」／「自動出單已暫停」；只在暫停時顯示「恢復自動出單」，按下需再確認已檢查紙張並補印，恢復不重印結果不明的那張。領取只代表嘗試列印，不是實體紙張成功；不自動釋放或重試，逾時／失敗須檢查紙張後用既有出餐／查單按鈕明確補印。只有連接印表機的 Star webPRNT Browser 自動輪詢（每 5 秒，與分頁無關）；一般瀏覽器不領取。Star Browser 必須保持開啟、前景且網路可用，背景休眠無法保證即時。

### POST /api/admin/orders/sessions/:id/place

櫃檯點餐完成後送出整桌尚未送出的未付款品項（body `{}`），建立 ticket 與列印工作但不收款；混合品牌須完整管理權限。回共用 session 格式；無待送品項回 400。結帳回呼只列印發票與收據明細，不重印出餐單；未先送單而直接付款的先結後做訂單仍由工作佇列補印一次。

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

- 金鑰＝超級管理員，可指派管理員、改所有內容。只存在環境變數，絕不可寫進前端或 commit。
- agent 身分沒有綁定會員（`sub` 為 null），因此所有 `/api/me/*` 與報名類端點會回 403。這是刻意的。
- 會員 token 有效七天；每次請求以資料庫目前的管理員權限為準。部署本次修正後，舊版無期限 token 須重新登入。
- OAuth state 有效十分鐘，使用 HttpOnly、SameSite=Lax cookie 綁定發起登入的瀏覽器，不能作為 API token。

## 慣例

- **Upsert**：`events`、`updates`、`social/posts` 的 POST 帶 `id` 就是更新，不帶就是新增。沒有 PATCH 動詞。
- **時間**：社群貼文的排程時間以台北時間（UTC+8）讀寫，格式 `YYYY-MM-DDTHH:mm`。
- **錯誤**：非 2xx 一律回 `{ "error": "中文訊息" }`。DB 未就緒回 503。

## 公開端點（免認證）

### POST /api/auth/admin/password
後台 Email／密碼登入（`admin.emoji.tw` 與官網 API 皆可用），免 Bearer。body：`{ email, password }`。Email 會去除前後空白並轉小寫；密碼保留原樣。僅 `users.is_admin=true` 且已設定密碼的唯一帳號可登入；不依特定 Email 自動授權。成功回 `{ token }`（七天 session，`Cache-Control: no-store`），每次請求仍由 `sessionAuth` 重查 DB 的管理員與品牌權限。帳號不存在、密碼錯誤、非管理員、重複 Email 一律 `401 { error: "Email 或密碼錯誤。" }`。Postgres 共用固定 15 分鐘視窗：每 Email 10 次、每 IP 40 次（跨服務與副本共用），超過回 429 與 `Retry-After: 900`；另有程序內 IP 限流。登入不會建立帳號、不寄信、不記錄密碼。

### POST /api/admin/users/password
**僅超級管理員**（含 `ADMIN_API_KEY`）可建立／更新管理員密碼。後台 UI：admin.emoji.tw「權限管理」最上方的「新增帳號」表單（超管才看得到）即呼叫本端點，填 Email、密碼（至少 8 字）、選填姓名與品牌勾選；對方不必先用 Google 登入過，Email 已存在時表單會先確認再重設密碼與品牌範圍。body：`{ email, password, admin: true, brands: [], name?: string }`。`admin:true` 與 `brands` 必須明確提供；`brands:[]` 表示不限制品牌（DB `is_admin=true, admin_brand=NULL`），也可指定 `["CAFE"]`／`["BAR"]`／兩者。這是一般管理員，不授予 `super`，不修改 `SUPER_ADMIN_EMAIL`；本端點拒絕替既有超級管理員 Email 設密碼。密碼至少 8 個字元且至多 1024 UTF-8 bytes；使用 Node crypto 非同步 scrypt（N=32768,r=8,p=1、16-byte 隨機 salt、64-byte key）儲存 `users.admin_password_hash`，不存明文、不回傳 hash。既有 Email 更新密碼；新 Email 建立 users；交易與 Email advisory lock 防重複建立，重複舊資料回 409。成功 `{ ok:true, user:{ id,email,admin:true,brands } }`；錯誤參數 400、未登入 401、非超管 403。每程序 IP 每分鐘 10 次。重設密碼不會撤銷已發出的 session；撤銷管理員須移除 DB 的 is_admin。

操作範例（密碼只從隱藏輸入讀入，不放 shell history、命令列參數、檔案或 git；`ADMIN_API_KEY` 由既有授權環境提供）：
```bash
python3 - <<'PY'
import getpass, json, os, urllib.request
payload = {'email':'us@emoji.tw', 'password':getpass.getpass('新管理員密碼：'), 'admin':True, 'brands':[], 'name':'言文字管理員'}
request = urllib.request.Request('https://admin.emoji.tw/api/admin/users/password',
    data=json.dumps(payload).encode(), method='POST',
    headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['ADMIN_API_KEY']})
with urllib.request.urlopen(request) as response:
    print(response.read().decode())
PY
```
建立後以 `/api/auth/admin/password` 取得 token，再讀 `/api/state` 確認 `role:"admin"`、`super:false`、`brands:null`。實際帳號與密碼由操作者另行設定，部署本身不會建立任何預設帳密。

### GET /api/health
服務健康檢查。回 `{ ok, db, dbConfigured }`。

### POST /api/reservations
1F 訂位（`/reserve`、`/en/reserve`、`/ja/reserve` 頁面送出；免登入，放 Google Maps／官方 LINE 連結）。body：`{ lang?: 'zh'|'en'|'ja', date: 'YYYY-MM-DD', time: 'HH:MM', party_size, name, phone, email, note?, source? }`；`lang` 決定錯誤訊息與客人確認信的語言（預設 `zh`；店家通知信一律中文）。`time` 只接受固定 30 分鐘時段：在咖啡 `08:00`–`16:30`、三點水 `17:00`–`23:30` 與 `00:00`–`02:30`（視為該日清晨），店別由時段推得、不由前端傳入。日期須為台北今天起 120 天內；當天已過（含 30 分鐘緩衝）的時段拒絕。`party_size` 1–50，`phone` 8–32 字元數字／符號，`email` 必填（確認信收件），`note` 截 500 字。送出即成立訂位：寫入 `dining_reservations`（狀態 `confirmed`，含 `lang`），寄確認信給訂位人（座位保留至預約時間後 10 分鐘，逾時釋出）並通知 `NOTIFY_EMAIL`（信末附後台「訂位」分頁連結）；寄信失敗只記 log，不影響訂位成立。成功回 `201 { ok, request_id, period, hold_until, hold_minutes }`（`period` 為「在咖啡」或「三點水」）。每 IP 每小時 30 次。店內後續（排桌、取消並寄婉拒信、已到／未到）見 `GET/POST /api/admin/reservations`。

### GET /api/auth/methods
公開。回 `{line:boolean}`，表示 LINE 登入是否已設定；登入頁據此決定是否顯示「使用 LINE 登入」。

### GET /api/public
公開唯讀資料，無個資：`{ raised, updates, events, content }`。活動只含「報名中」且公開的項目。
`content` 僅回首頁公告、菜單及空間文案／圖片白名單；IG token 與內部排程資料不會傳至瀏覽器。
官網首頁與空間／子品牌頁（`/`、`/space`、`/at-cafe`、`/3am`、`/stay-square` 三語）已改由伺服器端用同一份資料渲染（`lib/public-render.js`，記憶體快取 60 秒，回應 `Cache-Control: public, max-age=60`；帶 `utm_source` 時 `no-store`），不再於瀏覽器端呼叫此端點；本端點保留給桌邊點餐（`/order`）等其他用途。`/sitemap.xml` 亦為動態：靜態清單加上公開活動頁三語網址。

### GET /api/orders/config
桌邊點餐前端設定：`{ tappay: { app_id, app_key, env } | null, vapid_public_key }`。TapPay 未設定時 `tappay` 為 null，前端顯示「請至櫃檯結帳」。

### GET /api/orders/pause
客人端輪詢用：`{ venue, paused }`。`paused` 為 null（可點）或店家在後台設定的暫停文案（例「今日最後點餐 22:30」）。設定存於 `site_content.ordering_pause`，依店別分開。

### GET /api/orders/table
掃桌上 QR 進入：query `t`（桌號）、`k`（簽章，由後台產生 QR 時附上）。回這桌目前的場 `{ id, table, status, items[], orders[], total_unpaid }`；沒有或上一組客人已全部取餐（或 4 小時無動靜）則自動開新的一桌。簽章錯誤回 403。

### GET /api/orders/:id
同桌購物車現況（供輪詢）。query `g`＝自己的 guest 識別碼，回應以 `mine` 標記自己的行（不外露他人識別碼）。`items[]` 每行含 `line, zh, price, qty, by, mine, order_id`；`order_id` 非空＝已付款。`orders[]` 為出餐單 `{ id, amount, status: paid|ready|done, lines[] }`。

### GET /api/orders/:id/live
同桌購物車即時同步（Server-Sent Events）。query `g` 同上。連上先推一則 `event: session`（內容同 `GET /api/orders/:id`），之後同桌任何異動（別人加點／移除、送單、出餐、櫃檯收款、作廢、清桌）由 Postgres 觸發器 `pg_notify` → server `LISTEN` 即刻再推一則；每 25 秒送註解行當心跳，斷線由瀏覽器依 `retry: 2000` 自動重連。沒有 EventSource 的環境請改輪詢 `GET /api/orders/:id`。

### POST /api/orders/:id/items
加菜。body：`{ item_id, qty(1–20), by(稱呼), guest(前端隨機識別碼), note? }`。價格以菜單當下售價快照，不信任前端金額。回更新後的場。只接受目前營業品牌、已發布、未估清且在供應期間內的品項（否則 400）；店家暫停點餐時回 `423` 並帶暫停文案。

### DELETE /api/orders/:id/items/:line
移除自己加的未付款品項。body：`{ guest }`。他人品項回 403，已付款或已送出的回 409（送出後請洽櫃檯作廢）。

### POST /api/orders/:id/place
送出點餐：把這桌購物車裡還沒送出的品項一起送進出餐看板（**不結帳**，用餐完再到櫃檯結）。body：`{ guest }`。同一次送出的品項共用一個 `ticket`，並標 `placed_at`；看板按「已出餐」後標 `served_at`。沒有待送出的品項回 400；店家暫停點餐時回 423。回更新後的場（`items[]` 多 `ticket, placed_at, served_at`）。

### POST /api/orders/:id/pay-request
客人手機按「通知櫃檯我要結帳」：body `{ guest, name, scope: all|mine, lines?[] }`。`lines` 空＝全桌未付品項；指定＝只付那些（只付我的）。所有品項都須已「送出點餐」（否則 409）。每個 `guest` 只留最新一筆（再送＝覆蓋），每桌最多 20 筆。存在 `table_sessions.pay_requests`；POS 桌況（`GET /api/admin/orders` 的 `sessions[].pay_requests`）會列出來，櫃檯一點就把那幾項勾好收款；品項結掉後自動從需求裡剔除、空了整筆消失。回更新後的場，多 `pay_request: { scope, lines, at } | null`（只回自己那筆）。每分鐘 20 次限流。

### DELETE /api/orders/:id/pay-request
客人取消自己的結帳需求。body `{ guest }`。回更新後的場。

### POST /api/orders/:id/pay
TapPay Pay by Prime 結帳。body：`{ prime, lines?[], name, phone?, email? }`。`lines` 空＝付全桌未付品項，指定＝只付那些（例如只付自己的）。伺服器重算金額；成功後建立出餐單並鎖定品項，回 `{ ok, order_id, amount, session }`。TapPay 拒絕回 402。每分鐘 10 次限流。

### POST /api/orders/:id/push
付款後訂閱取餐推播（不登入）。body：`{ order_id, subscription }`（Push API `PushSubscription.toJSON()`）。每張出餐單最多 5 個裝置。

### GET /api/events
可用 `?lang=zh|en|ja` 取得名稱、說明與地點的對應語系；未填翻譯沿用中文。公開列表包含預告與報名中。
公開活動列表。未登入只回 `visibility=public`；有效會員帶 Bearer token 時另回 `visibility=members`，皆限「預告／報名中」並包含已成立報名數。

### GET /api/events/calendar.ics
整站公開活動的訂閱日曆（`text/calendar`，多個 `VEVENT`，`X-WR-CALNAME`），供 Google／Apple 行事曆「以 URL 訂閱」。只含 `visibility=public`、非私人時段（`registration_mode<>'closed'`）的預告／報名中活動；沒有開始時間的活動略過。支援 `?lang=zh|en|ja`。快取 5 分鐘。

### GET /api/events/:slug
支援同樣的 `?lang=zh|en|ja`；回傳包含 `translations`。
活動詳情。公開、私人與會員限定活動皆可由直接連結讀取；私人活動不列入清單，會員限定活動只列入有效會員的清單。帶有效 Bearer token 時一併回自己的報名、付款與簽到狀態，以及只屬於目前帳號的 `viewer: {name,email}`，供報名表預填。公開活動的有效報名另回 `referral_token`；帶有效 `ref` 查詢參數時回 `referred_by`，前台可顯示邀請人。私人與會員限定活動不啟用個人轉介追蹤。

### GET /api/venue/schedule
未來 90 天已排定的場地時段與公開活動，回 `{ bookings: [{ venue, kind, starts_at, ends_at }], events: [{ title, slug, location, starts_at, ends_at, venues }] }`。`venues` 為該活動佔用的空間代碼（`1F`／`2F`／`3F`／`4F`）：由場地申請轉成的活動用申請的空間，其餘由 `location` 文字推斷，寫不出樓層視為全棟。`bookings` 只含審核通過的申請時段，不含申請人資料；供申請表與行事曆顯示「已排定」。快取 5 分鐘。

### Stripe 帳號
所有結帳、活動付款、退款與 webhook 都必須使用 Stripe「Emoji 言文字」帳號 `acct_1Ts2y95NXMKDsl40`。

### POST /api/access/verify
驗證進出 QR token 是否有效。body：`{ token }`。回 `{ ok, claims }`。

### POST /api/stripe/webhook
Stripe 活動與會籍付款 webhook。只接受 `STRIPE_WEBHOOK_SECRET` 驗證成功的原始 request body；處理 `checkout.session.completed`、`checkout.session.async_payment_succeeded` 與 `checkout.session.expired`。活動與會籍皆驗證訂單、帳號、session、TWD 幣別及金額快照；重送不會重複核銷。

## 登入

### GET /auth/google
導向 Google OAuth。query：`redirect`（須為白名單來源；未帶時導回會員 App `https://app.emoji.tw/`）。

### GET /auth/google/callback
Google 授權回呼，簽發會員 token 並導回。

## 主要讀取端點

### GET /api/state
**agent 讀取後台資料的主要入口。** 需認證。管理員身分回傳全部：

```
{ role: 'admin', super, me, bond: { target_amount, raised },
  users[], commitments[], entitlements[], events[], content{}, updates[], payment_methods[] }
```

`payment_methods[]`（管理員皆可見，POS 結帳與系統設定管理共用）：`[{ code, label, active, builtin }]`，現金／刷卡／LINE Pay／轉帳為 `builtin:true` 固定在前（恆 `active:true`），之後接自訂收款帳戶（`builtin:false`，見 `POST/PATCH /api/admin/payment-methods`）。結帳付款方式選項只取 `active:true` 的；停用的自訂帳戶仍會列出（`active:false`）供系統設定頁重新啟用。

`users[]` 每筆含 `access_active`、`access_summary`。
會員身分則只回自己的資料（`me`、`commitments`、`access`、報名中活動、`updates`）；query `lang=en|ja` 時活動標題／說明回對應語系（會員 App 用）。
綁定會員的管理員另有本人 `access`。

## 後台管理（需管理員或 agent 金鑰）

### GET /api/admin/event-applications
讀取場地申請（含 `kind` 社群／企業與 `venue` 二樓／三樓）及聯絡資料，回 `{ applications }`。僅管理員可讀，不會加入公開活動清單。
每筆另含 `updates`：依時間排序的進度紀錄 `[{ id, kind, message, actor, created_at, mail_state, mail_sent_at, mail_attempts, mail_error }]`。`kind` 為 `submitted`（送出）／`approved`／`rejected`／`update`（其他進度）；`mail_state` 為 `queued`（待寄）／`retry`（寄失敗、排程重試）／`sent`／`failed`（重試 10 次仍失敗）。

### POST /api/admin/event-applications/:id/review
審核待審申請。body：`{ status: "approved" | "rejected", review_note, expected_status: "pending", publish_public? }`，回 `{ ok, application, event? }`。回覆必填、最多 2000 字，申請人可見。活動在送件時已建立；審核只更新該活動的 `review_status`，通過時依 `visibility`、`registration_mode` 同一交易把它由草稿翻成對外狀態：公開 `native` 為 `報名中`、`external` 為外部連結預告、私人 `closed` 僅顯示占用時段且 API 禁止報名。舊申請未填 `visibility` 時才使用 `publish_public`：true 公開為預告，false 維持草稿由主辦人自行發布。未通過一律維持草稿不公開。回應的 `event` 只在本次有公開時回傳。私人活動訂金未付（`deposit_twd>0` 且無 `deposit_paid_at`）不可通過，回 409。不存在回 404；已審核或其他管理員先完成時回 409，不覆蓋既有結果。保存審核者與時間。審核通過仍不代表場地已保留或完成收費；檔期、費用與合作條件仍須書面確認。
審核結果通知與狀態變更在同一交易寫入進度紀錄，之後立即寄給申請人；寄失敗自動退避重試，回應的 `application.updates` 可看寄送狀態。

### POST /api/admin/event-applications/:id/updates
對申請人寄送其他進度更新（補件、檔期／費用確認、場地安排等），任何審核狀態皆可。body：`{ message }`（必填、2000 字以內），回 `{ ok, update, application }`（201）。內容會記入該申請的 `updates`，申請人登入後可見並收到 Email；不存在回 404。

### POST /api/admin/event-applications/:id/updates/:updateId/resend
重寄某一筆進度通知（`mail_state` 為 `sent`、`failed` 或 `retry` 時）。回 `{ ok, update }`；找不到或正在寄送中回 404。重寄使用新的冪等金鑰，不會被寄信服務去重。

### GET /api/admin/system-settings
僅超級管理員可讀。回傳可由後台管理的付款、電子發票／LINE Pay 對帳、寄信、登入／會議、訊息、電子票券、社群／AI、儲存與活動設定。機敏值只回「已設定／未設定」及來源，不回明文；每項另有 `live`（true＝儲存後免重啟）。另列出只能在部署環境管理的根設定。

### POST /api/admin/system-settings
僅超級管理員可寫。body：`{ key, value }` 儲存加密覆寫，或 `{ key, clear: true }` 清除覆寫並改回部署環境值。只接受白名單鍵值，機敏內容不寫入操作紀錄。回 `{ ok, restart_required }`：ezPay 電子發票（`EZPAY_INVOICE_*`）與 LINE Pay 對帳（`LINEPAY_*`）為即時設定，儲存後本服務立刻套用、另一個服務（官網／POS 與後台各一）一分鐘內重載，`restart_required:false`；其餘設定於服務重新啟動後套用。ezPay HashKey 必須 32 碼、HashIV 必須 16 碼，存檔時即驗證。

### GET /api/admin/logs
後台操作紀錄，`?limit=`（預設 200、最多 500），回 `{ logs: [{ id, actor, method, path, summary, status, created_at }] }`。所有 `/api/admin/*` 的成功寫入（POST／DELETE）由中介層自動記錄，`summary` 為請求欄位摘要（略過含 token／secret／password／key 的欄位）。

### POST /api/admin/updates
新增或更新最新消息。body：`{ id?, title, content, type, date }`。
`type` 限：`月報`｜`季報`｜`重大事項`｜`活動通知`｜`財務摘要`（不合法則存為 `重大事項`）。
帶 `id` 為更新，找不到回 404。回 `{ ok, id }`。

### DELETE /api/admin/updates/:id
刪除最新消息。

### POST /api/admin/events
新增或更新活動。body：`{ id?, slug?, title, description, location, starts_at, ends_at, capacity, price_twd, visibility, status, translations?, registration_url? }`。
`registration_url`（僅平台管理員、更新時有效）：不含帳密的 HTTP(S) 網址＝改外部報名；空字串＝改回站內報名；私人 `closed` 活動不受影響；格式錯誤回 400。
`visibility` 限 `public`｜`private`｜`members`；`status` 限 `草稿`｜`預告`｜`報名中`｜`已結束`；票價與名額為 0 以上整數。帶 `id` 為更新；若活動名稱、開始／結束時間或地點有變更，只為目前 `registered` 的來賓排入三語 Email 與瀏覽器推播，Email 附更新後 ICS。回應另含 `notice`、`critical_changes`、`notification_recipients` 與 `notification_deliveries`，未設定任何通知服務時明示尚未寄出。

網址代稱變更時保存舊網址；舊活動頁、行事曆與嵌入網址都會以 302 導向新網址並保留語言及 query。若舊代稱日後被其他活動正式使用，當前活動網址優先。

`translations` 為 `zh/en/ja` 物件；一般欄位為 `title/description/location`，專屬頁純文字欄位見 `public/event-fields.js`。每欄最多 10000 字，不接受 HTML 執行；未傳 translations 的舊 API 更新會保留既有翻譯。中文基本欄位以頂層值為準。預告可公開但不能報名；百鬼夜行首次 migration 以預告建立，後續啟動不覆寫後台編輯。

### DELETE /api/admin/events/:id
百鬼夜行專屬活動禁止刪除，請改為草稿或已結束。其他活動可刪除沒有任何報名紀錄的活動。已有報名時回 409，應改為「已結束」以保留付款與簽到稽核。

### GET /api/admin/events/:id/regs
該場活動的報名名單，含聯絡、票券狀態、應付／已付、付款與簽到時間。回 `{ regs }`。

### GET /api/admin/events/:id/check-in
本活動負責人、共同管理者、平台管理員或已授權的簽到人員讀取現場工作台。回活動名稱與狀態、預設掃描模式、鎖定狀態、可接受票種及來賓資料；簽到人員不能以此端點下載 CSV、編輯活動、傳送通知或變更報名狀態。受限票種在每位來賓的 `can_checkin` 明示，實際寫入仍由後端再次驗證。

### GET /api/admin/events/:id/check-in/lookup

活動負責人、共同管理者、平台管理員或已授權的簽到人員以 query `token=<QR 票券內容>` 唯讀查驗一張票，回傳來賓、票種、報名狀態與簽到時間，不會完成簽到。簽章、活動、票券版本、加購狀態及簽到人員票種範圍均由後端驗證；無效票回 400，舊票或未成立票回 409。活動管理名單另可匯出逐票驗票 CSV，每列含同一種 token，供外部驗票系統與預印識別證使用。

### GET /api/admin/events/:id/integration

活動管理者讀取 API 整合啟用狀態、金鑰前綴與可用端點，不回傳完整金鑰。

### POST /api/admin/events/:id/integration/key

建立或更換本活動金鑰。完整 `evk_…` 金鑰只在這次回應出現；資料庫只保存 SHA-256。更換後舊金鑰立即失效。

### DELETE /api/admin/events/:id/integration/key

立即停用本活動金鑰。

### GET /api/admin/events/:id/webhooks

活動管理者讀取最多 10 個 Webhook 端點與最近 50 筆投遞結果。簽章密鑰不會回傳。

### POST /api/admin/events/:id/webhooks

新增活動 Webhook。body：`{ url, events }`；正式環境只接受 HTTPS 公開網址，事件可選 `event.created`、`event.updated`、`event.canceled`、`guest.registered`、`guest.updated`、`guest.refunded`。回應只會顯示一次 `whsec_...` 簽章密鑰。

### PATCH /api/admin/events/:id/webhooks/:webhookId

更新 Webhook URL、事件或 `active`／`paused` 狀態。接收端回覆 HTTP 410 時也會自動暫停。

### DELETE /api/admin/events/:id/webhooks/:webhookId

刪除活動 Webhook 與其投遞紀錄。

### POST /api/admin/events/:id/webhooks/:webhookId/test

排入一筆 `webhook.test` 測試投遞。每次請求帶 `Webhook-Id`、`Webhook-Timestamp` 及 `Webhook-Signature: t=時間戳,v1=HMAC-SHA256`；接收端應驗證 `時間戳.JSON原文` 並在 5 秒內回覆 2xx。非 2xx 會在 1、2、4 分鐘後重試，最多四次投遞。

### GET /api/integrations/events/:id

以 `Authorization: Bearer evk_…` 讀取金鑰所屬活動的內容、設定、有效報名與簽到人數。

### GET /api/integrations/events/:id/check-in

以活動金鑰讀取本活動驗票名單；回應與活動簽到工作台相同，但不提供管理頁連結。

### GET /api/integrations/events/:id/check-in/lookup

以 query `token=<QR 票券內容>` 查票，不變更簽到狀態。活動、票券版本、報名與加購狀態仍由後端核對。

### POST /api/integrations/events/:id/check-in

以活動金鑰及 body `{ token }` 或 `{ registration_id, attendee_id? }` 完成簽到，沿用既有冪等與票券驗證。

### DELETE /api/integrations/events/:id/check-in/:registrationId

以活動金鑰撤銷簽到；可用 query `attendee_id` 只撤銷團體報名中的一張票。金鑰只能操作其所屬活動。

### POST /api/admin/events/:id/check-in
掃描或人工簽到。body 擇一：`{ token }`（活動票 QR 內容）或 `{ registration_id, attendee_id? }`。只接受已成立且未退款的票券；重掃回 `duplicate: true`。簽到人員若被限制票種，其他票種回 403。

### DELETE /api/admin/events/:id/check-in/:registrationId
取消一筆活動簽到，保留報名與付款紀錄。

### POST /api/admin/events/:id/regs/:registrationId/refund
對已成立的付費票執行 Stripe 全額退款並立即使票券失效。以 registration id 作 Stripe idempotency key，重送不會重複退款。

### GET /api/admin/orders
出餐看板＋桌況：`{ orders[], tickets[], sessions[], reservations{}, pause, active_venue, payment_methods[] }`。`reservations` 為今天營業日（三點水到翌日 03:00，凌晨時段算前一營業日）已排桌號、狀態 `new`／`confirmed` 的訂位，依桌號分組：`{ "A3": [{ id, time:'19:00', name, party_size, status }] }`，只給桌況格標「預約」提示用，不會自動開桌；品牌子帳號只看自己時段的。`payment_methods` 格式同 `GET /api/state`（見「收款帳戶」），POS 畫面每 15 秒輪詢這支 API 順便帶回，後台新增／改名／停用自訂收款帳戶後，已開著的 POS 不用重新整理頁面即可在下一次輪詢看到。`tickets` 為桌邊送單（客人按「送出點餐」、尚未結帳也還沒出餐）：`{ id, ticket, session_id, table_no, status:'placed', placed_at, items[], amount, stations }`，形狀比照出餐單，從桌的 `items` 現算、不另存表。`orders` 預設只回 `paid`／`ready`；`?all=1` 回最近一天全部（含 `void`）；每張單附 `stations: { bar[], kitchen[] }`（飲品酒水／餐點分站）。`sessions` 為使用中的桌：`{ id, table, unpaid, unpaid_amount, lines[](未結帳品項明細，不含 guest), mixed(含其他品牌品項), state: open|preparing|ready|idle, updated_at, pay_requests[] }`。`pay_requests` 為客人手機送出的結帳需求 `{ id, name, scope: all|mine, lines[], count, amount, at }`（只含本店別可見且仍未付的品項；見 `POST /api/orders/:id/pay-request`）。`pause` 為各店別暫停點餐設定。`?venue=` 只看單一店別；品牌子帳號只回自己品牌的單與品項。

### POST /api/admin/orders/:id/status
body `{ status: 'ready' | 'done' }`。`ready`＝出餐並推播給客人「請至櫃檯取餐」（回 `notified` 裝置數）；`done`＝已取餐。狀態不符回 409；已作廢的單回 409。

### POST /api/admin/pos/drawer-events
記錄「要求開錢櫃」並取得一次性發送資格；需要登入、管理員權限及可用資料庫。body：

```json
{ "event_key": "checkout:to_example", "kind": "checkout", "order_id": "to_example", "reason": "現金結帳", "operator_id": "st_example" }
```

- `kind` 為 `checkout | refund | manual`；`event_key` 必填、最長 200 字元；`reason` 必填（最多保存 200 字元）。有帶 `operator_id` 時須為在職且目前帳號看得到的操作人員；`manual` 必須選擇有效操作人員。
- `checkout`：`order_id` 必填，事件代碼固定 `checkout:<order_id>`，不得帶 `line`。訂單須屬於目前帳號可操作的品牌、未作廢、金額大於 0，而且 `payer.method === 'cash'` 或資料庫已存的 `payer.payments[]` 有正數現金分攤（`{method:'cash',amount}`）。現金金額一律以資料庫已存的 `payer` 判定（整單現金＝全額，混合付款＝現金那幾筆），不會從用戶端傳入的付款資料推定有現金。
- `refund`：整單固定 `refund:<order_id>`，訂單須已作廢；單項固定 `refund:<order_id>:<line>` 並帶 `line`，該行須已取消。原收款方式須為現金，且作廢交易內已保存該事件的正數現金退還意圖；僅作帳務調整的取消不能事後補送此端點來開櫃。用戶端 `cash_refund` 不作為驗證依據。
- `manual`：事件代碼用 `manual:<uuid>`（前綴後允許 8–128 個英數字、`_`、`-`），每次明確的手動操作產生新代碼；不可帶訂單或品項。

回 `{ ok:true, claimed:true|false, event_id }`。資料庫 `pos_drawer_events.event_key` 有唯一限制；只有首筆成功寫入回 `claimed:true`，重送回 `claimed:false` 與相同 `event_id`。保存登入身分 `actor`、伺服器時間、原因及操作人員 id／姓名。輸入錯誤回 400、無此訂單或跨品牌回 404、沒有合格現金交易／退還意圖回 409；資料庫失敗不會回成功資格。

**前端只能在 `claimed === true` 後送出一次硬體指令**；任何錯誤或 `claimed:false` 都不能送。稽核只代表請求曾被領取，不表示錢櫃實際開啟，也不表示已交付退款。領取後若硬體失敗，不可換交易代碼重送；檢查錢櫃後改走附原因與人員的手動開櫃。不提供自動重試，以避免重複開櫃。

### POST /api/admin/orders/:id/void
作廢已結帳的出餐單。body `{ reason, refund_cash?:boolean, operator_id? }`（`reason` 必填）。只能作廢當個營業日的單；線上刷卡（TapPay）的單須先在 TapPay 後台退款。若該單已透過 ezPay 開立電子發票，會先呼叫 ezPay 作廢成功後才把 POS 訂單標成 void（已開立但沒記到號碼時，先用 `invoice_search` 查回號碼再作廢；ezPay 端已是作廢狀態就直接同步）；未設定 ezPay 環境變數或 ezPay 作廢失敗時回 503/502，不會先作廢本地訂單。作廢後該單不計營收，品項退回這桌「未結帳」（可重結或清桌作廢）。記 `void_reason / voided_by / voided_at`。

預設只作帳務調整，不表示現金已交付。僅 `refund_cash === true` 且這張單有收現金（`payer.method === 'cash'` 全額，或混合付款 `payer.payments[]` 的現金部分；`cash_refund` 不超過實收現金）、剩餘訂單金額大於 0，才在同一筆交易保存 `payer.drawer_refunds[event_key]` 並回正數 `cash_refund`；否則為 0、不回 `event_key`。回 `{ ok:true, reason, method, cash_refund, event_key? }`，事件代碼為 `refund:<order_id>`。請在送出前明確詢問是否退還現金，再透過 drawer-events 取得開櫃資格；此回應不是退款成功的證明。交易先鎖定訂單再檢查與變更（包含 ezPay 作廢），重複／同時作廢回 409，避免重複退款意圖。

### POST /api/admin/orders/:id/pay-method
更正已結帳單的付款方式（現場人員點錯時用）。body `{ method, operator_id? }`；`method` 為內建（`cash`／`card`／`linepay`／`transfer`／`taishin`）或已啟用的自訂收款帳戶代碼。整張單改成單一付款方式（混合付款會被取代），只動 `payer`，不動金額、品項、發票。現金改其他方式會清掉 `received／change`；改成現金視為實收等於應收。每次更正附加到 `payer.method_changes[]`（`from／to／at／by／operator`，保留最近 10 筆）。限制：只能改當個營業日的單；已作廢、線上刷卡（TapPay）、部分付款（預收）單回 409；新舊方式相同回 400。回 `{ ok, payer }`。此操作不開錢櫃；日結以更正後的付款方式計算。

### POST /api/admin/orders/:id/items/:line/void
取消已結帳單裡的「單一品項」（做不出來／客人退菜），不必作廢整張單。body `{ reason, refund_cash?:boolean, operator_id? }`（`reason` 必填）。比照贈送把該行單價歸零（原價留在 `regular_price`）、`cancelled: true`、`cancel_reason`、`cancelled_at`，並從整張單 `amount` 扣掉這項小計，回 `{ ok, reason, refund, amount, method, cash_refund, event_key? }`；`refund` 不超過此次訂單實際扣減金額。限制：只能取消當個營業日的單；線上刷卡（TapPay）或已開立 ezPay 電子發票的單無法只動一項（金額對不起來），須整張作廢；這張單只剩最後一項未取消時也不行，請改用「作廢整張單」。取消後的品項仍留在單上（出餐看板顯示劃線＋取消原因），日結熱銷統計與 CSV 不再計入，但仍留下稽核紀錄。

現金退還 opt-in 規則與整單作廢相同；`cash_refund` 為此次實際扣減金額（不超過剩餘訂單金額，混合付款時也不超過實收現金），只有明確 `refund_cash:true`、這張單有收現金且金額大於 0 才回 `event_key: refund:<order_id>:<line>` 並在同一交易保存退還意圖。預設 `cash_refund:0`，純帳務調整不開櫃。整單與單項取消均使用訂單列鎖，避免同時取消覆蓋金額；已取消的品項重送回 409。

### POST /api/admin/yan/lookup
POS 查／建會員。body `{ phone }`（台灣手機）或 `{ token }`（會員卡 QR）。回 `{ ok, member:{id,name,phone}, balance }`。沒有帳號就用手機建立。品牌子帳號可用。回傳多 `active`（是否有效會籍）與 `verified`（是否以會員條碼確認身分）。POS 流程：掃會員條碼（`token`）→ 確認身分；有效會籍才套**會籍價**；點數不看會籍，掃碼確認身分後即可兌換品項與服務、兌換空間時數；只輸入手機＝只累點。會籍價＝菜單 `emo`（>0 時）否則原價九折（四捨五入），「現場輸入金額」品項不打折。註冊會員（沒有有效會籍）也能累點、兌換，只是沒有會籍價。點數**不折抵金額**。

### POST /api/admin/yan/redeem-space
POS 用點數兌換空間時數。body `{ plan: day_4h|day_12h, user_id, operator_id? }`。扣點（所需點數由後台設定，存在 `site_content.yan_rewards = {day_4h,day_12h}`，經 `POST /api/admin/content` 寫入、言文字管理員在後台「菜單」頁設定；0 或沒設＝不開放，回 400）並在同一交易發一張單日會籍（`entitlements.source='yan'`，啟用規則同購買）。點數不足回 400。回 `{ ok, plan, cost, entitlement_id, balance }`。

### POST /api/admin/orders/:id/invoice/issue
補開 ezPay 電子發票。用於結帳時 ezPay 暫時失敗或當下未設定憑證的單。body 可帶 `{ invoice }`，未帶時使用訂單內已保存的發票要求；`invoice` 格式同櫃檯結帳的 `invoice` 欄位。作廢單不能補開；已開立且有號碼則直接回原發票資料。若狀態是已開立但 `number` 空白（ezPay 回應沒解析到號碼），不會重開，而是以 `invoice_search`（自訂編號＋金額）向 ezPay 查回號碼並更新訂單，回 `{ ok, invoice, synced: true }`；查不到回 404。回 `{ ok, invoice }`。

### POST /api/admin/orders/sessions
櫃檯開桌／外帶：客人沒掃桌上 QR（走進來直接在櫃檯點）也能開一桌。body `{ table_no }` 開內用桌（英數字與 -，8 字內；該桌已開著就直接回那一桌，`created:false`），或 `{ takeout: true }` 開外帶單（自動取 `W01`–`W99` 最小空號；用完回 409）。`W01`–`W99` 保留給外帶，不能當內用桌號。可選 `operator_id`（`POST /api/admin/staff/verify` 認出的員工 id，記這桌是誰開的，查不到就忽略不擋）。回 `{ ok, id, table, created, takeout, operator? }`（新開 201）。外帶單結完帳且取餐完成後，由 `GET /api/admin/orders` 自動收掉並釋出號碼；內用桌採離場前結帳，POS 整桌結清且具整桌權限時自動清桌；`GET /api/admin/orders` 回的 `sessions[].operator` 就是開桌的員工姓名。

### POST /api/admin/orders/sessions/:id/items
櫃檯代客加菜。body `{ item_id, qty, note?, price? }`；`by` 固定「櫃檯」。可加任何已發布品項（含估清、非營業時段、僅供 POS 的 `pos_only` 品項如「其他」），但品牌子帳號不得加其他店別的品項（403）。`price` 只在該品項 `custom_price:true` 時才採信（店員現場輸入金額，0–100000 的整數；超出範圍或缺漏回 400），其餘品項一律用菜單定價、忽略 `price`。回更新後的場。

### DELETE /api/admin/orders/sessions/:id/items/:line
櫃檯逐項作廢未結帳品項。body `{ reason }`（必填）。已結帳品項回 409（請改作廢整張單）。

### PATCH /api/admin/orders/sessions/:id/items/:line
櫃檯改未結帳品項。body `{ qty? }` 改數量（1–20），或 `{ free: true, reason }` 標記贈送（單價變 0、原價留在 `regular_price`、記 `comp_reason`，日結另列贈送件數）、`{ free: false }` 取消贈送，或 `{ note }`（160 字內，空字串＝清空）補／改這個品項的特別需求備註——任何品項（不只加點當下）都能補或改備註，可與 `qty`/`free` 同時送。已結帳品項回 409；品牌子帳號只能改自己店別的品項（403）。回更新後的場。

### POST /api/admin/orders/sessions/:id/move
換桌／併桌。body `{ table_no }`。把這桌的未結帳品項與已結帳的單全部搬到目標桌：目標桌沒開就直接改桌號（換桌），已開著就接到目標桌後面並關掉來源桌（併桌）。`W01`–`W99` 外帶單號不能當目標（400）；來源或目標含其他品牌品項時品牌子帳號回 403。回 `{ ok, from, table, merged, id }`。

### DELETE /api/admin/orders/sessions/:id/pay-requests/:rid
POS 關掉某筆客人的結帳需求（客人改口或已另外處理）；品項不動。回 `{ ok, pay_requests[] }`。

### POST /api/admin/orders/sessions/:id/checkout
櫃檯收款（POS）。body `{ method: cash|card|linepay|transfer, payments?: [{ method, amount }], prepay?: 金額, member?: boolean, member_phone?, member_token?, yan_points?, lines?: [], quantities?: { 行號: 份數 }, discount?, received?, name?, note?, invoice?, operator_id? }`。`member_phone` 為台灣手機（09 開頭），沒有帳號就建立；`member_token` 為 `/api/me/card` 的會員卡 QR。有綁會員時該筆消費每滿 NT$100 累積 1 點數（預收不算），回 `yan:{earned,redeemed,balance}`。`redeem_lines` 為要用點數兌換的行號陣列（須先掃會員條碼確認身分）：該行單價變 0（原價留 `regular_price`、記 `redeem_points`），扣點＝菜單 `points`（每份）×數量，由伺服器依菜單計算、前端數字不採信；品項 `points` 為 0 回 400、餘額不足回 400。點數**只換品項與服務，不折抵金額**，應收只因該行變 0 而減少。作廢整張單會沖回該單累點與兌換扣的點。**混合付款**：`payments` 給兩筆以上（最多 6）`{ method, amount }`（每筆為已啟用的付款方式、正整數金額），合計須等於應收否則 400；此時 `payer.method='mixed'`、`payer.payments[]` 存各筆，`received`／`change` 只對現金那幾筆算，日結 `by_method` 依各筆拆到各付款方式，開錢櫃與退現金只看現金部分。只給一筆就視同該付款方式。**先收部分金額**：`prepay: n`（正整數、須小於這桌目前未結金額，否則 400）不綁品項，另開一張「部分付款」單（`payer.prepay=true`、品項一行 `prepay:true` 的「部分付款」），並在桌上留一行負數「已預收」（`credit_of`＝那張單號、不能改／作廢），下次結帳時一併勾選就自動抵扣；要取消預收請作廢那張部分付款單（會把抵扣行一起拿掉；抵扣已用在後面的結帳單時回 409，要先作廢後面那張）。預收不套會員價、不折扣。`operator_id` 是 `POST /api/admin/staff/verify` 認出的員工 id，記這筆是誰收的款（存進 `payer.operator_id/operator_name`），查不到就忽略不擋收款。`lines` 空＝全桌未結帳品項，指定＝只結那些（分帳）。`quantities` 部分結帳：指定行只結其中幾份（1 到該行數量的整數，否則 400），原行扣掉份數留在桌上，已結的份數以新行（`part_of`＝原行號）記在這張單。`member` 由伺服器依會籍判定、前端送的值不採信：只有帶 `member_token`／`member_id`（掃會員條碼確認身分）且該會員有效會籍時，才以會籍價重算。`discount` 為整單折扣：`{ type:'percent', value:1–100, reason }` 或 `{ type:'amount', value, reason }`（金額不得超過小計、原因必填），金額順序為 會員價 → 小計 → 折扣 → 應收。`received` 只在現金時用：客人給的現金（整數、不少於應收），伺服器算 `change` 找零並一起記在 `payer`。`invoice` 為 ezPay 電子發票要求，可不帶或 `{ mode:'' }` 表示不開；可帶 `{ mode:'paper' }` 紙本、`{ mode:'company', buyer_ubn, buyer_name?, buyer_email? }` 統編、`{ mode:'mobile', carrier_num }` 手機載具、`{ mode:'citizen', carrier_num }` 自然人憑證、`{ mode:'donate', love_code }` 捐贈；有折扣時發票明細會多一列負數「折扣」讓品項加總＝總額。金額由伺服器重算；成功建立出餐單（進出餐看板）並鎖定品項，回 `{ ok, order_id, amount, subtotal, discount, received, change, method, payments?, prepay, member, closed, remaining, invoice }`。內用桌整桌結清（包含零元未付品項都已結帳）且目前帳號具整桌清桌權限時，在同一交易自動關閉桌位，並將該場未取餐訂單標記 `done`；`closed:true` 表示已自動清桌。分帳仍有未付品項、超出品牌權限的混桌不自動清桌；外帶維持結清且取餐完成後釋出號碼。若 ezPay 尚未設定或暫時失敗，收款訂單仍成立，`invoice.status='failed'`，可用補開端點重試。品牌子帳號只能結自己店別的品項（403）。

### POST /api/admin/orders/sessions/:id/tickets/:ticket/serve
看板出餐（品項層級）。body `{ lines?: [] }`：給了只把那幾行標 `served_at`（部分出餐，送單留在看板、已出的行劃線），沒給＝「整筆出餐」把這張送單全部標完。全部出完的送單才從看板消失（仍未結帳，留在這桌的帳上）。沒有任何一行可標（都出過、或行不在這張送單）回 404；品牌子帳號只能出自己店別的（403）。回更新後的場。`GET /api/admin/orders` 的 `tickets[]` 多 `served`（已出幾行）、`partial`。客人手機端輪詢到自己這桌有品項新標 `served_at` 時會跳頁內通知＋提示音。結帳時若勾選的品項都已出餐，出餐單直接以 `done` 建立，不再回到看板。

### POST /api/admin/orders/sessions/:id/close
清桌：未取餐的單標記已取餐、這桌下一次掃碼開新場。**有未結帳品項時回 409**（請先結帳或逐項作廢，避免漏收）；言文字管理員可帶 body `{ force: true }` 強制清桌並作廢未結品項。

### POST /api/admin/orders/pause
暫停點餐開關（依店別）。body `{ venue: CAFE|BAR, paused: boolean, message? }`（文案 80 字內，客人掃碼會看到）。存 `site_content.ordering_pause`。回 `{ ok, pause }`。

### POST /api/admin/menu/sold-out
估清快速鍵。body `{ item_id, sold_out: boolean }`。只改該品項的 `sold_out`（記營業日），不覆蓋其他欄位；當個營業日結束（翌日 03:00）自動恢復。品牌子帳號只能估清自己店別（403）。

### GET /api/admin/orders/history
查單：某營業日全部的單（含作廢），最新在前。query `day=YYYY-MM-DD`（預設今天的營業日）、`q=`（桌號／金額／發票號碼／單號尾碼，不分大小寫）、`venue=`。每張單附 `stations`（分站明細）供重印出餐單。回 `{ day, orders[], count }`。品牌子帳號只看自己店別的單。

### GET /api/admin/sales
日結報表。query `day=YYYY-MM-DD`（營業日，預設今天；03:00 起算 24 小時）、`venue=`。回 `{ day, orders, amount, by_method{}, by_hour{}, items[]{zh,venue,qty,amount}, voided, void_amount, discount_amount, discount_count, comp_count, redeem_points, redeem_count, redeem_value, csv[][], linepay }`；`redeem_points / redeem_count / redeem_value` 為點數兌換的點數合計、單數與折抵原價合計（像折扣一樣另列，CSV 該品項標「點數兌換 N 點，折抵 NT$X」）；`amount` 為折扣後實收，`discount_amount / discount_count` 為整單折扣合計與單數，`comp_count` 為贈送件數。現金對帳走開關帳（見 `/api/admin/registers`），舊的交班結算已移除。`csv` 為每品項一列的明細（表頭：營業日、付款時間、桌號、品項、數量、單價、小計、付款方式、會員價、發票狀態、發票號碼、狀態、作廢原因），整單折扣另列一列負數讓小計欄加總＝營收，贈送品項名稱後綴「（贈送：原因）」。作廢的單不計營收。
`linepay` 為 LINE Pay 對帳：`{ configured, synced_at, pos:{count,amount}（POS 登記為 LINE Pay 的成立單）, linepay:{count,amount,refunds,refund_amount,by_method{}}（LINE Pay 商家後台同日實收，退款已扣）, diff（實收－POS 登記；>0 漏登或登成其他方式，<0 登了但沒收到）, by_venue{CAFE,BAR}（各店 `{label,pos:{count,amount},linepay:{count,amount},diff}`）, rows[]（當日每筆實收：id,type,amount,paid_at,method,card_last4,confirm_no,order_no,venue,venue_label）, csv[][] }`。LINE Pay 商家後台只有一個商店 ID、交易沒有店別欄位，所以依交易時間歸屬：以當天 `pos_registers` 的開帳～關帳時間判斷是哪一店開著（關帳到下一店開帳之間算前一本帳、第一本開帳前算第一本帳）；當天沒有開關帳紀錄才退回固定時段：台北 08:00–17:00 為在咖啡（CAFE），17:00 起到隔天凌晨為三點水（BAR）；`?venue=` 與品牌帳號的店別範圍會同時限制 POS 側與 LINE Pay 側。
`taishin` 為刷卡／台新手機付對帳（兩者同一台台新收單機、沒有實收查詢 API，手動填寫）：`{ pos:{count,amount}（POS 登記為刷卡或台新手機付的成立單，2026-10-14 決策合併；結帳畫面已合併成一個選項、代碼一律寫 taishin，但仍把歷史單據可能留著的舊 card 紀錄一起算入）, manual（還沒填過是 null；填過是 {amount,reason,filled_by,updated_at}）, diff（manual.amount－POS 登記；還沒填是 null）}`。填寫走 `POST /api/admin/sales/taishin`。

### GET /api/admin/registers
開關帳（帳本）。在咖啡（CAFE）與三點水（BAR）共用同一台 POS 與**同一個抽屜帳**：帳本仍以「品牌 × 營業日」記（營收分品牌），但同一營業日同一時間只能有一本開著——在咖啡關帳後三點水才能開帳（反之亦然）。query `day=YYYY-MM-DD`（預設今天的營業日）、`venue=`。回 `{ day, registers[], current:{CAFE, BAR}, active_venue, open_venue, handover, can_open:{CAFE,BAR}, wait:{CAFE,BAR} }`；`open_venue` 為現在開著的品牌（`null`＝沒有）、`handover` 為當日最後一本已關帳的帳 `{ id, venue, keep_cash, closed_at }`（下一本開帳預設承接其留存金）、`wait[venue]` 為該品牌要等誰關帳（空字串＝可以開）——這四個欄位看全店，不受子帳號品牌範圍過濾；`current[venue]` 為該品牌當日最後一本帳（`null`＝還沒開帳），每本含 `opening_cash, cash_sales, cash_in, cash_out, expected`（應有現金＝零用金＋現金營收＋臨時收入－臨時支出）、`moves[]`（臨時收支）、`sales{orders,amount,by_method,voided,void_amount}`、關帳後另有 `counted_cash, diff, keep_cash, take_cash, denominations, close_note, closed_at, closed_by`，以及 `report`（小結單／關帳單資料）。

### POST /api/admin/registers/open
開帳。body `{ venue:'CAFE'|'BAR', opening_cash?, denominations?:{ "1000":張數, "500":…, "100","50","10","5","1" }, note?, day? }`。零用金可直接填總額或按面額填張數（有填面額就以面額合計為準，並存成 `opening_denominations`）；0 以上整數；都沒填時承接當日上一本已關帳的留存金 `keep_cash`（沒有上一本就 400）。當日**任何品牌**還有開著的帳就回 409（共用抽屜帳：同品牌→請先關帳；另一品牌→請先把它關帳）；DB 另有部分唯一索引 `pos_registers_open_day_idx (day) WHERE closed_at IS NULL` 兜底。品牌子帳號只能開自己店別（403）。回 `{ ok, id, day, venue, opening_cash, denominations }`（201）。**結帳規則**：`POST /api/admin/orders/sessions/:id/checkout` 會檢查品項所屬品牌當日的帳——已關帳一律 409；未開帳時品牌子帳號 409、言文字管理員放行但回 `warning`。

### GET /api/admin/registers/:id
小結：不關帳，回這本帳目前的現金摘要、營收摘要、臨時收支、`counts[]`（歷次小結點驗，新到舊）、`last_count` 與 `report`（印小結單；還沒關帳時 `counted_cash/diff/counted_at` 取最近一次點驗，沒點驗過為 `null`）。

### POST /api/admin/registers/:id/count
小結點驗：核對目前抽屜現金，**不關帳**、可多次記錄。body `{ counted_cash?, denominations?:{ "1000":3, … }, note? }`，點鈔可填總額或按面額填張數；`diff = counted − expected`，差額非 0 不擋、`note` 選填；關帳後 409。回 `{ ok, id, counted_cash, expected_cash, diff, denominations, note, counted_by, report }`（201），`report` 為帶上這次點驗的小結單。

### POST /api/admin/registers/:id/cash
現金臨時收支。body `{ type:'in'|'out', amount, reason }`，金額正整數、原因必填；關帳後 409。回 `{ ok, id, type, amount, reason, expected_cash }`（201）。

### POST /api/admin/registers/:id/close
關帳。body `{ counted_cash? , denominations?:{ "1000":3, "500":1, … }, keep_cash?, note? }`：點鈔可填總額或按面額填張數（面額限 2000/1000/500/200/100/50/20/10/5/1）；`diff = counted − expected`，差額非 0 時 `note` 必填；`keep_cash` 為留在抽屜給下一班的留存金，預設＝零用金。關帳後該品牌當日不可再結帳與記臨時收支。回 `{ ok, id, counted_cash, expected_cash, diff, keep_cash, take_cash, denominations, note, report }`；`report` 為關帳單（含現金、營收、付款方式、作廢、臨時收支）。

### POST /api/admin/registers/:id/reopen
重開補單（僅超級管理員）。關帳紀錄保留，以留存金為零用金另開一本新帳接著記；當日任何品牌還有開著的帳回 409（另一品牌開著時訊息會說要先關誰）。回 `{ ok, id, day, venue, opening_cash }`（201）。

### POST /api/admin/payment-methods
新增收款帳戶（僅超級管理員）。現金／刷卡／LINE Pay／轉帳為內建付款方式，不經這支 API 管理；這裡新增的是額外的自訂收款帳戶（例如街口支付、另一組轉帳帳號），結帳時會一併出現在付款方式選項。body `{ label }`（1–20 字，必填）；`code` 由系統隨機產生，不可自訂。回 `{ ok, code, label, active:true, builtin:false }`（201）。品牌子帳號只能讀（見 `GET /api/state` 的 `payment_methods`），不能呼叫這支。

### PATCH /api/admin/payment-methods/:code
改名或停用／恢復一個自訂收款帳戶（僅超級管理員）；內建付款方式沒有對應的 `:code` 可改。body `{ label? , active? }`，兩者都可選填。停用後既有歷史單據的付款方式標籤仍可正常顯示，只是結帳時不再能選它。回 `{ ok, code, label, active, builtin:false }`。

### GET /api/admin/staff
員工名單（排班與打卡用）。員工不綁登入帳號，每位一組不重複的 4 位數識別碼，在共用平板打卡時輸入。query `venue=`。回 `{ staff[]{ id, name, venues（null＝在咖啡與三點水都可）, role, note, active, pin? }, count }`；`pin` 只有言文字管理員看得到，品牌子帳號只看到店別含自己品牌（或不限店別）的員工。停用（`active:false`）的員工排在後面。

### POST /api/admin/staff
新增員工。body `{ name, pin?, venues?:['CAFE'|'BAR'], role?, note? }`。識別碼不填由系統抽一組沒人用的（避開 0000／1234 之類）；自填須 4 位數且未被使用中的員工占用（409）。品牌子帳號只能建自己店別的員工（403）。只給 Gmail／Email 登入的管理員：平板上用四位數密碼登入的現場人員（`operator_staff_id` token）回 403，員工管理請到 admin.emoji.tw 品牌工作區「排班打卡」。回 `{ ok, id, name, pin, venues, role, active }`（201）。

### PATCH /api/admin/staff/:id
編輯員工（部分更新）。body `{ name?, pin?, venues?, role?, note?, active? }`；`active:false`＝停用（離職），識別碼釋出可給新人；重新啟用時若原識別碼已被占用回 409，請同時指定新識別碼。四位數密碼登入的現場人員回 403（同 POST）。回 `{ ok, id, name, pin?, venues, role, note, active }`。

### POST /api/admin/staff/verify
認人（不是登入）：平板已用品牌管理員帳號登入，這支只是疊一層「現在是誰在操作」，供開桌／結帳記錄經手人，記在 `table_sessions.opened_by_staff_*` 與結帳的 `payer.operator_id/operator_name`。body `{ pin }`。識別碼找不到或停用一律回 404「識別碼不正確」（不透露是否存在），子帳號只認得到自己店別的員工。每台裝置每分鐘最多 12 次（防猜碼，同打卡）。回 `{ ok, id, name }`。

### GET /api/admin/shifts
排班表。query `from=YYYY-MM-DD`（營業日，預設本週一）、`to=`（預設 from＋6 天，最多 93 天）、`venue=`、`staff_id=`。回 `{ from, to, days[], shifts[]{ id, staff_id, name, day, venue, start_time, end_time, minutes, note }, staff[]（在職員工）, csv[][] }`。三點水 17:00–03:00 這種跨日班屬開始那天的營業日。

### POST /api/admin/shifts
排一班。body `{ staff_id, day, venue:'CAFE'|'BAR', start:'HH:MM', end:'HH:MM', note? }`；`end ≤ start` 視為跨日，一班最多 16 小時；同一位員工時間重疊回 409；員工店別不含該店回 400。回 `{ ok, id, staff_id, name, day, venue, start_time, end_time, minutes, note, warnings[] }`（201）。`warnings` 是勞基法提醒（不擋，管理者自行負責）：同一天已有班、與前後班間隔不足 11 小時（第 34 條）、這週已排 5 天（第 36 條）、週正常工時超過 40 小時（第 30 條）、日工時超過 12 小時或月加班超過 46 小時（第 32 條）、這天有排休。

### POST /api/admin/shifts/auto
自動排班。body `{ from?（該週任一天，預設本週）, venue? }`。以週一起 7 天、依「人力需求」（`GET /api/admin/shifts/staffing`）把在職、店別相符、沒排休、加進去不會違反任何上述勞基法規則的員工排進去；人選先挑這週班數少的、再挑總時數少的。既有班保留並算進覆蓋人數，不會重排。回 `{ ok, from, to, added[]{ id, staff_id, name, day, venue, start_time, end_time, minutes, note:'自動排班' }, warnings[]{ day, venue, start, end, needed, filled, message } }`；`warnings` 是排不滿的時段，由管理者手動補人。

### GET /api/admin/shifts/days-off
排休清單。query `from=`（預設本週一）、`to=`（預設 from＋34 天）。回 `{ from, to, days_off[]{ id, staff_id, name, day, note } }`。

### POST /api/admin/shifts/days-off
員工填排休（不能上班的日子）。body `{ staff_id, day, note? }`；日期不可早於今天；同人同日重複填只更新備註。回 `{ ok, id, staff_id, name, day, note, warnings[] }`（201）；那天已有班時 `warnings` 提醒管理者調整。

### DELETE /api/admin/shifts/days-off/:id
取消一筆排休。回 `{ ok, id }`。

### GET /api/admin/shifts/staffing
人力需求（自動排班目標）：各店各時段要幾個人。沒設過回預設（在咖啡 08:00–17:00 一人、三點水 17:00–03:00 一人）。回 `{ staffing[]{ venue, start, end, headcount } }`。

### PUT /api/admin/shifts/staffing
整組覆寫人力需求。body `{ staffing[]{ venue, start, end, headcount:0–9 } }`，最多 20 列；品牌子帳號只能改自己店別的列（其他店別的保留）。回 `{ ok, staffing[] }`。

### DELETE /api/admin/shifts/:id
刪一班；已配對這班的出勤只解除配對、不刪。回 `{ ok, id }`。

### POST /api/admin/attendance/punch
打卡。body `{ pin, type:'in'|'out'|'break_start'|'break_end' }`，不選品牌；出勤統一記為言文字（`venue:'TTH'`）。以識別碼找人（錯誤一律回 404「識別碼不正確」，不透露是否存在）；`in` 開一筆出勤（同一人已在上班中且未超過 16 小時回 409；超過視為忘了打下班卡，照常開新的一筆並回 `forgot_out:true`），並配對當日最接近的排班算 `late_minutes`；`break_start`／`break_end` 開始／結束休息（要在班上，否則 409；重複開始或不在休息中也 409），休息段存在該筆出勤的 `breaks[]{start,end}`，結束休息未滿 30 分鐘訊息會提醒（勞基法第 35 條：連續工作 4 小時至少休息 30 分鐘）；`out` 補最近一筆未下班的 `clock_out`、算 `minutes`（＝下班－上班－休息）、`break_minutes` 與 `early_minutes`（沒上班卡回 409；休息中直接下班，休息算到下班那一刻）；整班超過 4 小時而休息未滿 30 分鐘回 `break_short:true` 並在訊息提醒管理員確認。每台裝置每分鐘最多 12 次（防猜碼）。回 `{ ok, id, action, name, day, venue:'TTH', at, shift{start,end}|null, late_minutes|early_minutes, minutes?, hours?, break_minutes?, break_short?, message }`（上班 201、其餘 200）。

### POST /api/admin/attendance/makeup
補打卡：現場人員忘了打卡，用自己的識別碼補登（和 `punch` 一樣以識別碼辨識人、錯碼回 404、每台每分鐘 12 次）。body `{ pin, clock_in?, clock_out?, break_minutes?, reason }`；不選品牌，出勤統一記為言文字。時間是 `YYYY-MM-DDTHH:MM`（一律視為台北時間，也收帶時區的 ISO）。三種：同時給 `clock_in`＋`clock_out`＝補整班（新增一筆已下班出勤，201）；只給 `clock_in`＝補上班卡（目前還在班上，201）；只給 `clock_out`＝替最近一筆沒下班的出勤補下班（沒有未下班的回 409，200）。限制：`reason` 必填（至少 2 字）；只能補已經發生（不可是未來）且 7 天內的時間；單班最長 16 小時；不能和自己既有的出勤重疊（409）；`break_minutes` 為 0 以上整數，工時＝下班－上班－休息。紀錄 `note` 為「補打卡：原因」、`edited_by` 為「補打卡：姓名」，並配對當日最近的排班算 `late_minutes`／`early_minutes`；管理員仍可在 admin 用 PATCH／DELETE 修正。四位數密碼登入的現場人員可用（比照打卡，只能動自己的紀錄）。回 `{ ok, id, mode:'both'|'in'|'out', name, day, venue:'TTH', clock_in?, clock_out, minutes, hours, break_minutes, break_short, message }`。

### GET /api/admin/attendance
出勤紀錄（打卡紀錄報表），不依品牌過濾；在咖啡與三點水帳號看到同一套言文字出勤。query `from=`／`to=`（營業日，預設最近 7 天，最多 93 天）、`staff_id=`。回 `{ from, to, rows[]{ id, staff_id, name, day, venue:'TTH', shift_id, shift_start, shift_end, clock_in, clock_out, minutes, breaks[], break_minutes, on_break, break_since, continuous_minutes, needs_break, late_minutes, early_minutes, note, edited_by }, working[]（目前還在上班中的，不限區間）, summary[]{ staff_id, name, shifts, minutes, hours, break_minutes, late, open, days }, csv[][] }`；`minutes`／`hours` 已扣休息；上班中的 `continuous_minutes` 是從上班（或上次休息結束）起連續工作幾分鐘，滿 240 分鐘 `needs_break:true`（平板「上班中」名單標紅）。`csv` 為每筆出勤一列（含休息分鐘）＋每人合計（總工時、遲到次數、未打下班卡），直接交會計算時薪。`PATCH /api/admin/attendance/:id` 另可帶 `break_minutes` 修正休息分鐘，工時跟著重算。

### PATCH /api/admin/attendance/:id
修正出勤（補打卡／忘了下班）。body `{ clock_in?, clock_out?（null＝清掉）, note? }`，ISO 時間；下班須晚於上班且一班不超過 24 小時。營業日依新的上班時間重算，記修改人。四位數密碼登入的現場人員回 403（只能在 admin 後台修正）。回 `{ ok, id, day, clock_in, clock_out, minutes, hours, note }`。

### DELETE /api/admin/attendance/:id
刪一筆誤打的出勤。四位數密碼登入的現場人員回 403。回 `{ ok, id }`。

### POST /api/admin/sales/linepay/sync
從 LINE Pay 商家後台抓實收明細寫入 `linepay_transactions`（以交易號碼 upsert）。body 可帶 `{ start, end }`（YYYY-MM-DD，最多 400 天），預設最近 7 天（退款會回補到幾天前的交易）。伺服器每日 04:30（台北）自動跑一次；未設定 `LINEPAY_MERCHANT_ID` / `LINEPAY_MERCHANT_PW` 回 503，正在同步中回 409。回 `{ ok, start, end, count }`。

### POST /api/admin/sales/taishin
台新手機付日結對帳：手動填寫當天（`day=YYYY-MM-DD`）實收總額（台新沒有實收查詢 API）。body `{ day, amount, reason? }`；`amount` 為 0 以上整數，與系統登記（POS 選「台新手機付」的成立單合計）差額非 0 時 `reason` 必填（400）。同一天重複填寫＝覆蓋（upsert），記填寫人與時間供日後查詢。回 `{ ok, day, amount, reason, diff }`。

### POST /api/admin/sales/linepay/import
歷史匯入（僅超級管理員／`ADMIN_API_KEY`）。body `{ rows: [] }`，1–500 筆，每筆為 LINE Pay 後台原始交易物件（含 `transactionSequence`）或已正規化的列（`{ id, type, amount, paid_at, method, ... }`）。回 `{ ok, count, skipped }`。

### GET /api/admin/reservations
訂位列表。query `from=YYYY-MM-DD`（預設台北今天）、`days`（1–60，預設 7）、`venue=`。回 `{ reservations[], from, days, pending, labels }`；每筆附 `venue`（08:00–16:59 歸 CAFE，其餘 BAR），品牌子帳號只看自己時段的。狀態：`new` 待確認、`confirmed` 已確認、`arrived` 已到、`no_show` 未到、`cancelled` 已取消。

### POST /api/admin/reservations
櫃檯登記訂位（電話／現場）。body 同 `POST /api/reservations`（`date`、`time`、`party_size`、`name`、`phone`、`email?`、`note?`）另可帶 `table_no?`；與客人自助訂位同一套時段與驗證，但 `email` 可留空、當天 30 分鐘內的時段也可登（客人剛打來說馬上到）。`lang` 固定 `zh`、`source` 固定 `pos`，狀態直接 `confirmed`，記 `handled_by`。有留 Email 才寄確認信。品牌子帳號只能登記自己店別時段（403）。回 `{ ok, id, request_id, venue, mailed }`（201）。

### POST /api/admin/reservations/:id/status
改訂位狀態。body `{ status, table_no?, staff_note?, notify?: boolean }`。允許的轉換：new→confirmed/cancelled；confirmed→arrived/no_show/cancelled；arrived/no_show/cancelled→confirmed（其餘 409）。改成 `confirmed` 或 `cancelled` 且客人有留 Email 時寄回覆信（含桌號與店內留言；`notify:false` 不寄）。回 `{ ok, status, mailed }`。

### PATCH /api/admin/reservations/:id
修改訂位資訊（客人來電更改日期、時間、人數、姓名、電話、Email 或備註；桌號／店內留言／狀態仍走上面的 `/status`）。body `{ date, time, party_size, name, phone, email?, note? }`，驗證規則同 `POST /api/admin/reservations`（`staff:true`：Email 可留空、不擋 30 分鐘內的時段），語言與來源沿用原紀錄。品牌子帳號只能改自己店別時段的訂位、也不能把時段改到別的店別（403）。**不會自動寄信通知客人**，需要時請自行電話聯繫，或改完用 `/status` 的「確認並通知」補寄。回 `{ ok, id, venue }`。

### GET /api/pos-devices/:id
公開（免登入）。POS 開機時查這台裝置是否已綁定，決定登入畫面要顯示四位數密碼鍵盤還是 Gmail 登入。回 `{ bound }`。

### POST /api/admin/pos-devices/bind
裝置綁定：店長（任何品牌管理員帳號皆可，不限超管）用 Gmail／Email 登入後呼叫一次，把這台裝置記成「已綁定」，之後本裝置才能用四位數密碼登入。body `{ device_id, label? }`；同一 `device_id` 重複綁定＝覆蓋（更新綁定人與時間）。回 `{ ok }`。

### GET /api/admin/pos-devices
超管專用：列出所有已綁定裝置（`device_id`、綁定人 email、標籤、綁定時間），供「裝置遺失/更換時解除綁定」使用。

### DELETE /api/admin/pos-devices/:id
超管專用：清除該裝置的綁定（iPad 遺失或更換時用）。清除後該裝置的四位數密碼登入立即失效，須重新用 Gmail 登入綁定。

### POST /api/pos-devices/:id/pin-login
公開（免登入，防猜碼：每台每分鐘 12 次）。操作人員四位數密碼登入：裝置須已綁定（管理員登入時自動綁定，不需選品牌），否則與密碼錯誤回同一則訊息（不洩漏原因）。員工須在職且已設定所屬品牌（`venues`），否則 403。品牌跟著登入的人走：單一品牌員工直接成功；雙品牌員工第一次不帶 `venue` 會回 `{ choose:true, name, brands }`（不發 token），再帶 `venue` 重送才發 token；`venue` 不在員工品牌內回 403。成功回 `{ token, name, brands }`，`brands` 永遠只有本次登入的單一品牌，token 內的 `pos_venue` 鎖定該品牌，續期亦保留。每次請求重新檢查員工在職與品牌權限；舊 token 未帶品牌時，單品牌員工沿用、雙品牌員工須重新登入。要換品牌必須登出後重登，沒有畫面切換。

### DELETE /api/admin/reservations/:id
刪除訂位（含已取消的，讓畫面不再雜亂）。軟刪除（`deleted_at`），`GET /api/admin/reservations` 一律過濾掉，保留紀錄供日後查帳；無法復原畫面（資料庫仍有紀錄）。品牌子帳號只能刪自己店別時段的訂位（404）。回 `{ ok }`。

### GET /api/admin/tables/qr
query `tables=A1,A2`（最多 100 桌，英數字與 -，8 字內）。回 `{ tables: [{ table, url }] }`，`url` 即桌上 QR 內容（含簽章，換 `APP_SECRET` 後須重印）。

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
立即發布單篇 IG 貼文（不等排程）。成功回 `{ ok, url, images, duplicate }`；IG 最近 5 則已有同文時不重發、直接標記已發（`duplicate:true`）；`media_id` 存進 `metrics`。失敗把錯誤寫回貼文 `notes` 並回 502。自動排程發佈失敗會寄信到 `NOTIFY_EMAIL`。

### GET /api/admin/ig/status
IG 自動發文系統狀態：token 有無、AI key 有無、未來排程、錯誤與逾期清單、素材庫統計、近 30 天官網導流 `utm:[{source,medium,hits}]`。

導流歸因：任何帶 `utm_source` 的 GET 到訪按日計入 `utm_hits`，並寫首次來源 cookie `src`（30 天，只存 `source|medium|campaign` 字串）；創始會員、會籍結帳把它帶進 Stripe metadata `src`。

### GET /api/admin/ig/storage
列 MinIO 物件（預設 `prefix=assets/`，可帶 `?prefix=posts/`）。回 `{ objects:[{key,size,lastModified,url}] }`，用來找未登記進 ig_assets 的原始素材。

### GET /api/admin/ig/insights
拉 IG 帳號概況（追蹤數、貼文數）與每篇已發佈貼文的成效（likes/comments/reach/saved/shares/views/total_interactions/follows/profile_visits），並寫回 `social_posts.metrics`。回 `{ account, posts }`；有 `metrics.media_id` 的貼文直查，其餘以 permalink 比對 `/me/media` 最新 50 則；`matched:false` 表示兩者都對不到（多半已從 IG 下架）。

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
使用者 `status` → 已參與，並建立創始會員權益。

### POST /api/admin/entitlements
建立會員權益。body：`{ user_id, plan, ... }`。

### POST /api/admin/users/:id/admin
指派或取消管理員，並設定後台範圍。body：`{ admin: boolean, brand?: 'CAFE'|'BAR'|'SPACE'|null }`。**限超級管理員或 agent 金鑰。**

品牌子帳號（`users.admin_brand`，逗號分隔、可同時多個品牌，如 `CAFE,BAR`；`/api/admin/state` 回 `brands` 陣列；指派用 `POST /api/admin/users/:id/admin` 的 `brands` 陣列）：空＝言文字管理員，可用全部後台；多品牌帳號的權限為各品牌聯集。後台前端分四個工作區（言文字／在咖啡／三點水／等等空間，頂欄品牌列一鍵切換）：言文字管理員全部都能進，子帳號只看得到自己的品牌工作區；`GET /api/admin/orders?venue=CAFE` 只回該店別的單（子帳號不得超出自己的品牌）。出餐單只回「整張都是自己品牌」的單；`POST /api/admin/orders/:id/status` 對別的品牌或混牌單回 404；`POST /api/admin/orders/sessions/:id/close` 遇到同桌含其他品牌品項時回 403，混桌只能由言文字管理員清桌。`CAFE`（在咖啡）／`BAR`（三點水）只能呼叫 `/api/admin/orders*`、`/api/admin/tables/qr`、`/api/admin/content`（僅 `menu`，且只能變更自己店別的品項），出餐看板只回自己店別的單；`SPACE`（等等空間）只能呼叫 `/api/admin/events*`、`/api/admin/event-applications*`、`/api/admin/entitlements`、`/api/admin/points*`、`/api/admin/upload*`。其餘後台端點回 403「此功能由言文字根帳號管理。」。`GET /api/state` 會回 `brand`，餐飲子帳號不帶會員、參與紀錄與活動資料。超級管理員不受 `admin_brand` 限制。

## 會員端點（agent 一律 403）

以下需綁定會員身分，agent 金鑰打會得到 403。

### GET /api/me/access-qr
取得 45 秒有效的進出 QR token。

### GET /api/me/yan
登入會員的點數餘額。回 `{ ok, balance, phone }`。消費每滿 NT$100 累積 1 點，隔年 4/30 到期；作廢出餐單會沖回。agent 金鑰 403。

### POST /api/me/reservations
會員 App 訂位（已登入）。body 同 `POST /api/reservations`（`date`、`time`、`party_size`、`note?`、`name?`、`phone?`、`email?`），姓名／電話／Email 沒帶就用會員資料，Email 可空（空則不寄確認信）；寫入 `dining_reservations.user_id`，`source='member-app'`。同一會員最多 5 筆未到訂位（409）。回 `{ ok, id, request_id, period, hold_until, hold_minutes }`。限 20 次／小時。agent 金鑰 403。

### GET /api/me/reservations
我的訂位（昨天起）。回 `{ ok, reservations:[{ id, request_id, reserve_date, reserve_time, period, party_size, name, phone, note, status, label, table_no, venue, can_cancel }] }`。agent 金鑰 403。

### DELETE /api/me/reservations/:id
客人自行取消自己的訂位（只限 `new`／`confirmed` 且日期未過），通知員工 LINE 群組。回 `{ ok }`；找不到或不可取消 404。agent 金鑰 403。

### GET /api/me/registrations
我的報名：已成立（`registered`）或待付款（`pending_payment`）的活動，活動結束一天內仍列出。回 `{ ok, registrations:[{ id, slug, title, location, starts_at, event_status, registration_id, status, quantity, amount_paid, checked_in_at, ticket }] }`；`ticket:true` 表示可用 `GET /api/events/:id/ticket` 取 QR。agent 金鑰 403。

### GET /api/me/pickups
預約取餐：我的預約（開著的＋一天內結束的，最多 10 筆）與可選時段。回 `{ ok, pickups:[{ id, table, pickup_at, pickup_time, note, placed, status, state, items, amount, paid }], dates:[今天,明天], slots:{ 日期:[{ time, venue }] }, prep_min }`。時段 08:00–23:45 每 15 分鐘，今天只列「現在 + 20 分鐘」之後；`state` 同 POS 桌況（open／ordered／preparing／ready）。agent 金鑰 403。

### POST /api/me/pickups
建立預約取餐。body `{ date, time, items:[{ item_id, qty(1–20), note? }], note? }`。只能今天或明天、取餐時間至少 20 分鐘後、最多 20 種 40 件；菜單依取餐時段的品牌（08:00–16:45 在咖啡、17:00–23:45 三點水）取可點品項（估清、供應期間、`pos_only` 規則同桌邊點餐），該品牌暫停點餐回 423。開一張外帶單（`table_sessions` W01–W99，`user_id`、`pickup_at`、`pickup_note`），品項先放購物車**不送單**；排程每分鐘檢查，取餐前 20 分鐘自動送單（進出餐看板、出餐單列印、`pickup_placed_at`）；到店掃會員卡結帳。同一會員最多 3 張未取（409）、號碼用完 409。通知員工 LINE 群組。回 `{ ok, pickup }`。限 20 次／小時。agent 金鑰 403。

### DELETE /api/me/pickups/:id
取消預約取餐：只限還沒自動送單（`pickup_placed_at` 空）且沒結帳的，否則 409 請聯絡店家。回 `{ ok }`。agent 金鑰 403。

### GET /api/me/rewards
會員卡「可以兌換」清單（只讀）。回 `{ ok, items:[{id,venue,zh,en,ja,points,image}], space:[{plan,zh,points}] }`：`items` 為菜單中已發布、非 POS 專用、今天未估清且 `points>0` 的品項（點數由低到高）；`space` 為後台 `yan_rewards` 設定的空間時數。實際兌換仍在櫃檯掃會員碼。agent 金鑰 403。

### GET /api/me/card
數位會員卡 QR（120 秒）。回 `{ token, exp, name, phone }`。現場 POS 掃描或報手機即可累點。agent 金鑰 403。

### POST /api/me/profile
更新自己的姓名與電話。body：`{ name, phone? }`（姓名 1–80 字、電話 40 字以內），回 `{ ok, me }`。Email 由 Google 登入決定，不可改。

### POST /api/me/plans/checkout
線上購買一般會籍。body：`{ plan: "day_4h" | "day_12h" | "month" | "quarter" | "year" | "year_promo", lang? }`，回 `{ url }`（Stripe Checkout）。牌價：200／500／4,000／10,000／35,000；`year_promo`（開幕優惠，年會員價、會籍 18 個月）35,000，至 2026-12-31 止，逾期回 410。付款完成後導回會員 App `https://app.emoji.tw/?plan_paid=1&s=<session>`（取消：`?plan_canceled=1`），由 webhook 或 `/api/me/plans/verify` 建立 entitlement（`source: "stripe"`，以 session id 去重）；會籍於首次進場啟用，7 天未進場自動起算。未設 Stripe 回 503。

### POST /api/me/plans/verify
結帳導回時驗證並開通。body：`{ session_id }`，回 `{ ok, already, plan }`；session 不屬於本人回 404、未付款回 402。與 webhook 重複執行不會重複開通。

### POST /api/commitments
送出參與（創始會籍）申請。Email 必須為目前已驗證的 Google 登入信箱，此表單不會更動登入身分。

### POST /api/event-applications
登入帳號提出場地申請（社群活動或企業包場），不需付費會籍；agent 金鑰沒有申請人身分，回 403。申請即活動：同一交易建立一場 `草稿` 活動（`events.review_status='pending'`、申請人為 `owner_id` 並加入主辦團隊），`application.event_id` 即該活動；申請人可立刻在 `/organizer/events` 準備內容，但審核通過前不能公開、改時間地點或刪除（409）。聯絡資料只存在 `event_applications`，不進 `events`。

body：`{ request_id, visibility, registration_mode, registration_url?, kind?, venue?, community_name, contact_name, contact_email, contact_phone?, title, description, starts_at, ends_at, attendees, requirements?, consent: true }`。

- `visibility`：`public` 或 `private`。公開活動必填不含帳密的 HTTP(S) `registration_url`（活動網址，最多 2000 字），伺服器固定 `registration_mode='external'`，忽略傳入的 `native`。私人強制 `closed`、清除連結，並記 `deposit_twd=1000`（訂金）。僅為重試舊草稿相容，允許省略 visibility。
- `kind`：`community`（社群活動，預設）或 `business`（企業／團隊／客戶包場）。`venue`：`3F`（三樓共享空間）、`4F`（閣樓休憩空間）、`2F`（二樓交誼廳）或 `1F`（一樓咖啡餐酒館）；社群活動固定為 `3F`，企業包場必填。

- `request_id`：前端產生的 UUID；相同帳號與識別碼重試只會保存一次。同內容回原申請（200），不同內容回 409；新申請回 201。回應為 `{ ok, application }`。
- 名稱長度上限：社群 120、聯絡人 80、Email 254、電話 40、活動名稱 160；活動內容 5000、需求 2000 字。電話與需求可留空，其餘必填；Email 必須有效。
- `starts_at`／`ends_at`：台灣時間 `YYYY-MM-DDTHH:mm`，必須是真實日期、開始晚於現在、結束晚於開始。回應日期為 ISO 8601。
- `attendees`：1–10000 整數，僅是預估人數，不代表場地容納量或核准人數。
- 需明確同意須知，保存同意時間；伺服器固定初始狀態為 `pending`，忽略自訂審核與申請人欄位。
- 申請成立時在同一交易寫入 `submitted` 進度紀錄並寄收件確認給 `contact_email`；同時通知後台 `NOTIFY_EMAIL`。之後審核結果與每次進度更新都會再寄信給申請人。
- 每帳號每小時最多新增 10 筆，超過回 429；同筆重試不佔額度。資料庫未就緒回 503，不回報成功。

### POST /api/event-applications/:id/deposit/checkout
私人活動訂金（NT$1,000）。申請人本人對尚未付訂金、未被退件的申請建立 Stripe Checkout，body：`{ lang? }`，回 `{ url }`。非本人 404；不需訂金、已付或已退件 409；未設定 Stripe 回 503。付款由 webhook（`metadata.kind='application-deposit'`）入帳，寫入 `deposit_paid_at`；金額、幣別與申請不符不入帳。退款於 Stripe 後台人工處理。

### POST /api/event-applications/deposit/verify
付款導回頁補入帳用。body：`{ session_id }`；session 須屬於目前帳號且已付款，與 webhook 同一個冪等入帳，回 `{ ok }`。未付款 402。

### GET /api/me/event-applications
讀取登入帳號自己的申請，回 `{ applications }`，包含申請內容、`id`、`status`（`pending`／`approved`／`rejected`）、`review_note`、`created_at`、`reviewed_at`，以及進度紀錄 `updates: [{ id, kind, message, created_at, mail_state, mail_sent_at }]`（不含審核者與寄信錯誤細節）。不接受指定其他使用者，agent 金鑰回 403；不在公開 API 提供申請或聯絡資料。

### POST /api/events/:id/register
報名活動。新來賓不需先登入，body 需傳 `{ name,email,lang? }`；啟用姓名拆分時改傳 `{ first_name,last_name,email,lang? }`。有效 Bearer token 會綁定目前帳號並忽略 body 的 Email。受邀者可改傳邀請連結中的 `invite_token`，後端從已鎖定的受邀紀錄取得身分、略過活動／票種審核，並在成功回覆後使同一連結失效；仍須通過問題、名額、票價、錢包與付款檢查。團體報名可傳 `quantity`（1–1000，且不得超過活動／票種剩餘名額）與 `additional_attendees`（不含第一位購買者）；未提供的參加者先沿用購買者資料，之後可逐張轉票。舊版等長 `attendees` 仍相容。啟用錢包收集時另傳 `ethereum_wallet_proof`／`solana_wallet_proof`；ERC-721 票種另傳十進位 `nft_token_id`。免費票立即成立；付費票建立或沿用未過期的 Stripe Checkout，回 `{ url }`。付費活動未設定 `STRIPE_WEBHOOK_SECRET` 時 fail closed 回 503。

### POST /api/events/:id/invitation
使用邀請連結中的短期簽章 token 預覽受邀姓名與 Email，body 為 `{ token,action:'preview' }`；婉拒時傳 `action:'decline'`。只接受綁定本活動及受邀紀錄的 token，不接受草稿或已取消活動。婉拒可安全重試，其他已完成回覆的邀請不能再次改寫。

### DELETE /api/events/:id/register
取消免費且尚未簽到的報名。付費票須由後台退款，不可直接取消。

### POST /api/events/checkout/verify
付款回站補查。body：`{ session_id }`；登入結帳須符合目前帳號，免登入結帳須由 Stripe Session metadata 明確標記為訪客報名，才會呼叫同一個冪等核銷流程。webhook 仍是可靠核銷主路徑。

### GET /api/events/:id/ticket
取得自己的活動票券簽章 token。只對已成立且未退款的報名簽發；簽到時仍會查資料庫狀態。

現場／混合活動在對應憑證完整時另回傳 `wallet.google`／`wallet.apple=true`，前台才顯示加入錢包操作。

### GET /api/events/:id/wallet/google

有效報名者將自己的現場／混合活動票券加入 Google Wallet。可用 `attendee` 指定本人可存取的逐張票券，`lang` 選擇活動語言；回傳由服務帳號 RS256 簽署的 Google Save URL。票券包含活動、日期、地點、姓名、票種及與站內驗票規則相同的 QR token。簽發後會記錄票券；活動、票種、參加者或報名狀態異動時，背景工作以 Wallet Objects API 更新或停用已加入的票券。缺 issuer／服務帳號時回 503，線上活動或無效票不產生票券。

### GET /api/events/:id/wallet/apple

有效報名者下載簽署的 Apple Wallet `.pkpass`。可用 `attendee` 與 `lang` 指定逐張票券與語言；內容與 Google Wallet 相同，回應 MIME 為 `application/vnd.apple.pkpass`。票券含 Apple 更新服務 URL 與每張票的 HMAC 認證 token。缺 Pass Type ID、Team ID、WWDR、簽署憑證或私鑰時回 503，簽署失敗回 502，不回傳未簽署檔案。

### POST /api/wallet/apple/v1/devices/:deviceId/registrations/:passTypeIdentifier/:serial

Apple Wallet 裝置登錄票券更新。以票券內的 `ApplePass {authenticationToken}` 認證，body 傳 `{ pushToken }`；首次登錄回 201，重複登錄回 200。

### DELETE /api/wallet/apple/v1/devices/:deviceId/registrations/:passTypeIdentifier/:serial

Apple Wallet 裝置取消票券更新登錄。使用同一個 `ApplePass` 認證，成功回 200。

### GET /api/wallet/apple/v1/devices/:deviceId/registrations/:passTypeIdentifier

Apple Wallet 裝置查詢 `passesUpdatedSince` 之後異動的票券序號。無異動回 204；有異動回 `{ serialNumbers, lastUpdated }`。裝置識別碼只用於查詢該裝置自行登錄的票券。

### GET /api/wallet/apple/v1/passes/:passTypeIdentifier/:serial

Apple Wallet 以 `ApplePass` 認證下載重新簽署的最新票券。支援 `If-Modified-Since`；未變更回 304，報名失效或活動取消回 410。活動異動後，背景工作以 APNs 靜默通知已登錄裝置回來取票。

### POST /api/wallet/apple/v1/log

接收 Apple Wallet 裝置診斷訊息，每分鐘最多 30 次；單次最多記錄 20 行、每行 500 字。

### POST /api/me/phone/verify/start

登入會員以 E.164 電話（例如 `+886912345678`）與 `sms`／`whatsapp` 通路向 Twilio Verify 申請驗證碼。每小時最多 5 次；未設定 Twilio 時回 503。

### POST /api/me/phone/verify/confirm

登入會員傳入同一組 `phone`、`channel` 與 4–10 位數 `code`。Twilio Verify 確認後才將電話標為已驗證並可接收活動通知。

### DELETE /api/me/phone

登入會員移除已綁定電話與驗證狀態；後續不再排入簡訊或 WhatsApp 活動通知。

### POST /api/me/push-subscriptions

登入會員登錄瀏覽器 Push API subscription。只接受 HTTPS endpoint 與完整 `auth`／`p256dh` 金鑰；未設定 VAPID 時回 503。

### DELETE /api/me/push-subscriptions

登入會員移除自己的瀏覽器推播訂閱；傳入 `{ endpoint }` 時只移除該瀏覽器，未帶 endpoint 時清除帳號的全部瀏覽器訂閱。

### POST /api/twilio/events/status

Twilio 訊息狀態 callback。以 `X-Twilio-Signature` 驗證請求，將 accepted、delivered、read、failed 或 undelivered 狀態寫回活動通知紀錄；不接受前台會員或活動主直接呼叫。

### POST /api/events/:id/crypto/challenge

已開放且啟用錢包地址收集或 Token 持有驗證時，傳入 `{chain:"ethereum"|"solana",address}` 取得 10 分鐘有效的限時簽名訊息與 token。Ethereum 使用 EIP-191 `personal_sign`；Solana 使用 Ed25519 `signMessage`。報名 body 以 `ethereum_wallet_proof`／`solana_wallet_proof` 傳入 `{token,signature}`，後端驗證後才保存公開地址。Token 票種另以 `ETHEREUM_RPC_URL` 呼叫 ERC-20 `balanceOf(address)` 或 ERC-721 `ownerOf(tokenId)`；未達門檻回 403，RPC 無法確認時停止報名。同一鏈上地址及同一 NFT 每場活動只能建立一筆報名。

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

活動主入口 `/organizer/events` 沿用活動編輯器，可用 Google 或 Email（`/event-login.html`）登入；活動管理放在官網（`www.emoji.tw`），不在後台網域：前後台拆開後 `www` 只把 `/admin` 轉到 `admin.emoji.tw`，`/organizer` 留在 `www`，後台服務上的 `/organizer` 反向轉回 `www`；主辦人若從 `/admin` 進入，前端確認 `GET /api/organizer/state` 可用後自動轉到 `/organizer` 同一路徑。沒有全域「活動主」角色：平台管理員在單場活動指定負責人（`owner_id`）或於「主辦團隊」加入可管理的 Email，該帳號即可進入並只管理那幾場；平台管理員可直接建立活動；其他人以場地申請建立（送件即建立待審草稿活動並成為負責人）。可管理者可複製自己管理的活動：非平台管理員的副本視為新的場地申請（`review_status='pending'`，同時寫入一筆申請與收件通知），須再審核才能公開。`GET /api/organizer/state` 另回本人 `applications`（含審核回覆與進度紀錄）。每次請求重新查核資料庫權限，不能靠舊 token 保留撤銷後的權限。

### GET /api/organizer/state
僅回自己的／受邀共同管理的活動、本人姓名與 Email，以及 `can_create_events`。不包含其他會員、金流、設定或其他主辦人的活動。未授權回 403。

### GET /api/admin/events/:id/hosts
平台管理員／本活動負責人／共同管理者可讀主辦團隊。回 `{ owner, hosts, tickets, checkin }`；owner 為平台指定的主要負責人；hosts 有 `name,email,is_visible,can_manage,can_checkin,checkin_ticket_ids`，checkin 為預設掃描模式與鎖定狀態。

### POST /api/admin/events/:id/hosts
同上權限。body `{ name,email,is_visible,can_manage,can_checkin,checkin_ticket_ids? }`，依 Email 新增或更新；姓名最多 120 字，Email 最多 254 字。公開列名、共同管理與僅簽到權限分開設定；`checkin_ticket_ids` 只能引用本活動票種，空陣列代表全部票種。可預先加入尚未登入者，對方使用相同 Google 已驗證 Email 登入後取得權限。首次新增且已設定 Resend 時會排入三語邀請與 ICS 行事曆附件；未設定時仍保存權限，回應以 `invitation_queued` 與 `notice` 明示未寄出。不建立會員，也不授予建立其他活動的資格。

### POST /api/admin/events/:id/check-in/settings
活動管理者設定現場預設模式。body `{ mode: "standard"|"express", locked: boolean }`；locked 僅限制簽到人員切換模式，活動負責人與共同管理者仍可切換自己的工作台模式。

### DELETE /api/admin/events/:id/hosts
同上權限。body `{ email }` 移除共同主辦人；不能藉此移除主要負責人。移除後同一個 token 下次請求即失去該場權限。

既有建立／更新、刪除、讀名單、簽到及取消簽到端點，均允許本活動負責人／共同管理者；他場 ID 回 404。退款仍限平台管理員。管理員建立／更新活動可傳 `owner_id` 指定任一既有使用者為負責人，外部請求不能變更主要負責人。公開 API 僅含公開主辦人名稱 `host_names`，不包含團隊 Email 或管理權設定。

### POST /api/admin/events/:id/duplicate

活動管理者且具建立權限可將可管理活動複製為草稿。可傳 `visibility: public|private|members` 與 `times: [{starts_at,ends_at}]`，一次建立 1–30 場；省略 `times` 時保留單場舊介面。回傳 `{ok,id,slug,events}`。

活動名稱、多語內容、票種及售票期間、報名表、頁面、主辦團隊、簽到模式與設定都會複製；新活動一律為草稿，優惠碼到期日會清空。來賓、付款、通知及操作紀錄不複製。

### POST /api/admin/events/:id/registration-settings

活動管理者設定 `requires_approval`、`waitlist`、`group_registration`、`split_name` 布林值、`payment_approval`（`after_approval`／`authorize`）、`wallet_collection:{ethereum,solana}` 及可空白的 `opens_at`、`closes_at` ISO 時間。`split_name=true` 時，單人報名必須分開填寫名與姓，並以來賓語系的姓名順序保存於該場票券。錢包收集要求參加者簽署限時訊息，驗證後的公開地址可在活動名單及 CSV 查看。免費及付費票支援待審核與候補；付費票可選核准後 24 小時內付款，或先做信用卡預授權、核准後才請款。

`email_templates` 可設定 `confirmation`、`pending`、`declined` 三類通知，各含最多 160 字的 `subject` 與最多 5000 字的 `body`。留白時依收件人的中／英／日語系使用系統預設；初次待審核或候補會自動建立狀態通知，核准與拒絕沿用同一組模板。

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

活動管理者設定 tickets 陣列（最多 30 種）：id、name、description、price_twd、capacity、active、opens_at、closes_at。可選的 `token_gate` 支援 ERC-20 `{enabled,type,contract,name,minimum,decimals}` 與 ERC-721 `{enabled,type,contract,name}`。自訂票種活動報名須送 ticket_id；後端依票種計價並鎖定活動驗證票種、Token 資格及全場名額，報名保存票種快照與已驗證錢包地址。

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

查看本活動通知草稿與逐收件人、逐通路處理紀錄。`configured` 分別指出 Email、簡訊／WhatsApp 與瀏覽器推播是否已設定。

### POST /api/admin/events/:id/messages

儲存草稿：subject、body、audience（registered／pending_approval／waitlisted／approved／checked_in）。

### POST /api/admin/events/:id/messages/:messageId/schedule

確認寄送：可傳 send_at，未傳為立即。至少須設定 Resend、Twilio 或 Web Push 之一；快照當下分眾與每位來賓已驗證、已啟用的通路，背景工作每分鐘發送。服務接受不等於送達，重試超過 23 小時轉人工核對。

### POST /api/admin/events/:id/messages/:messageId/cancel

取消尚未處理的通知；已處理或服務已接受的郵件不能撤回。

### GET /api/admin/events/:id/regs/:registrationId/history

查閱取消／退款／逾期後重新報名之前的完整快照。票款查詢亦包含歷史付款，避免重新報名覆蓋帳務。重新報名會更換 QR 票券版本，舊 QR 永久失效。

### POST /api/admin/events/:id/details

設定 mode（offline／online／hybrid）、cover_url、online_url、contact_email、hide_location。只更新這些頁面欄位，保留已建立的外部會議識別碼。公開 API、HTML metadata 與 ICS 不提供受保護地點／會議網址；有效報名者才可取得。

### GET /api/admin/events/:id/meeting

活動管理者查看自己的 Google Meet／Zoom 連接狀態，以及本活動是否已有會議、類型、建立中狀態與受保護加入網址；不回傳 OAuth token。

### POST /api/admin/events/:id/meeting/connect

以個人管理帳號取得 Google Calendar 或 Zoom OAuth 授權網址。`provider` 可為 `google-meet` 或 `zoom`，預設 Google Meet。伺服器以 HttpOnly、SameSite cookie 與限時簽章 state 保護 callback，access／refresh token 加密保存。Google 要求 `calendar.events` 與離線更新授權；Zoom scope 由 OAuth app 設定。須設定對應的 `GOOGLE_MEET_CLIENT_ID`／`GOOGLE_MEET_CLIENT_SECRET` 或 `ZOOM_CLIENT_ID`／`ZOOM_CLIENT_SECRET`，callback 分別為 `<服務自己的網址>/integrations/google-meet/callback` 與 `<服務自己的網址>/integrations/zoom/callback`（官網服務＝`PUBLIC_ORIGIN`；後台服務 `SERVICE_ROLE=admin` 時＝`ADMIN_ORIGIN`，預設 `https://admin.emoji.tw`，因為連接是從後台發起、state cookie 在後台網域）；缺設定時回 503。

### POST /api/admin/events/:id/meeting/create

建立或同步本活動的線上會議。`provider=google-meet` 時在目前管理者的 Google 主要行事曆建立專屬 Meet；以活動 ID 衍生 Calendar event ID，重試時讀回同一筆，非同步建立時回 `pending: true`。`provider=zoom` 時另傳 `kind=meeting|webinar`，建立後重試會讀回已保存的同一筆；Webinar 需 Zoom 方案與權限。完成後都將加入網址寫入受保護 `online_url`。

### DELETE /api/admin/events/:id/meeting/connection

刪除目前管理者保存的 OAuth token；query `provider` 可為 `google-meet` 或 `zoom`，預設 Google Meet。不刪除供應商端既有會議或本活動已保存的加入網址。

### POST /api/admin/events/:id/cancel

傳入公開 reason，關閉 Stripe 待付款結帳並解除預授權後取消活動；可傳 `notify` 排入取消通知。平台管理員可傳 `refund_paid: true`，從言文字統一收款帳戶將原始票與加購票的剩餘可退款金額逐筆原路退回，沿用退款台帳與冪等鍵；外部活動主無權啟動統一收款退款。取消後禁止報名與票券簽到。

### POST /api/events/:id/ticket-options

提供 unlock_code 取得可選票種。公開回應不含解鎖碼；隱藏票種報名需同時送 ticket_id、unlock_code。票種可設定 flexible_price 與 minimum_twd，報名送 amount_twd；後端驗證最低金額，固定票價忽略自訂金額。

### POST /api/admin/events/:id/guests/import

匯入 guests（name、email），每批 1–500 位；status 可為 invited、registered（僅免費票）、pending_approval、waitlisted。可指定 ticket_id 及 unlock_code。使用交易鎖檢查名額，不足時整批回滾；重複報名預設跳過。傳入 `update_existing: true` 且指定票種時，只更新既有報名的原始票種，不覆寫姓名、報名狀態、票款、退款或加購／贈票。

新增受邀來賓時可傳 `send_invites: true`、`language: zh|en|ja` 與最多 1000 字的 `message`。邀請只排給本次新增者；重複 Email 會略過且不重寄。通知依已設定的 Email、收件者已驗證的 SMS／WhatsApp 與瀏覽器推播通路排入；每則都包含不放在伺服器查詢紀錄中的簽章 fragment 連結。沒有任何可用通路時整批回滾。受邀者可由連結直接確認身分、婉拒或完成報名；報名免除活動或票種審核，但仍須完成必填問題、名額檢查與付費。

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

僅付款購買者取得自己目前報名的付款明細。query `lang=zh|en|ja` 會依活動翻譯回傳名稱與地點。回傳 `receipt`，包含活動、購買者、票種、數量、未稅金額、成交稅金快照、含稅總額、付款時間與言文字收款方；若 Stripe 可取得服務商收據，另回 `url`，否則為 `null`，不阻擋本機列印或另存 PDF。無付款回 404，受讓者無法取得購買者收據。購買者可在前台補上帳單抬頭、地址、稅務資料與備註後列印；此付款明細不代表台灣統一發票或已開立稅務憑證。

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

`GET /api/events/:id/receipt?order=<orderId>` 可取得自己特定加購訂單的相同付款明細與選配 Stripe 收據網址。

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
登入參加者或轉票受讓人讀取自己對此活動的通知偏好。返回 `settings` 的 blasts、reminders、feedback，以及各類型的 email、text、push 通路；另回已驗證電話、推播訂閱及目前可用供應商。不允許其他主辦人代查。

### PUT /api/events/:id/notification-settings
儲存自己的活動公告、活動前提醒及活動後回饋邀請開關；`channels` 可分別控制 Email、簡訊／WhatsApp、瀏覽器推播。回饋邀請只使用 Email。寄送 worker 在發送前重新檢查偏好；尚未寄出的通知會取消。報名／付款／票券狀態通知不受影響，已送交供應商的訊息無法撤回，前台公告保持可讀。

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

### POST /api/auth/renew

以現有（仍有效的）Bearer session 換一張新的 7 天 token，回 `{ token }`。給長期開著的現場平板（POS）在到期前背景續期用；身分與管理員旗標由伺服器重新查 DB 決定，被移除管理員的帳號換到的 token 不再有後台權限。agent 金鑰與已過期的 token 不能續（403／401）。

活動／加購付費報名回應新增 `session_id`，加購另回傳 `order_id`。`POST /api/events/checkout/verify` 額外回傳 `status` 與 `order_status`；登入付款限定 Checkout 所屬帳號，免登入付款限定該 Stripe Session 自己的不可猜識別碼與訪客 metadata。嵌入頁在付款連結建立後，每 15 秒確認一次、最多 10 分鐘，並保留手動更新；不因外部網站 postMessage 就宣告付款成功。

活動公開姓名名單：`GET /api/events/:id/guests?after=<上一頁 next>` 回傳 `{guests:[{name}],next:string|null}`，每頁最多 100 個不同公開姓名。僅活動已開啟名單、有效報名且票券選擇公開姓名才列出；不提供 Email 或票券識別碼。`next:null` 表示沒有下一頁。

### POST /api/events/:id/join-online

已登入且有效報名的購買者或有效票券受讓人取得主辦人設定的 HTTPS 線上活動連結，回傳 `{url}`。草稿、預告、取消或無有效報名回傳 404；無有效連結回傳 409。按使用者累計點擊次數與首次／最近點擊時間，不記錄 IP。

活動數據 `GET /api/admin/events/:id/insights` 新增 `online: {participants, clicks}`，為全活動累計點擊連結的帳號數與次數，不受瀏覽期間篩選，不代表實際會議出席。

### POST /api/events/:id/contact-host

登入使用者透過活動專屬入口聯絡活動建立者。body：`{ message }`，訊息 1–5000 字；收件 Email 不回傳前端，寄信的 Reply-To 為來賓帳號 Email，方便建立者直接回覆。同一使用者、活動與內容使用固定 idempotency key，每個 IP 每小時最多 5 次；寄信服務未設定或未接受訊息時不顯示成功。

取消活動端點另接受 `notify: boolean`，預設 false。選擇通知但未設定寄信服務時回傳 503，不更動活動。啟用時，取消與取消通知佇列在同一筆交易提交，收件人為已報名／待付款／待審核／核准待付款／候補／請款處理中的購買者，以及有效已報名票券受讓人；依 Email 去重。回傳 `notifications_queued` 不代表已送達。取消通知屬必要狀態通知，不受公告退訂影響；不會自動退款。

取消活動可附 `reason_translations: {en, ja}`，兩欄選填、各最多 1000 字。活動頁與取消郵件依語系套用，空白翻譯沿用 `reason`。

活動數據另回傳 `registrations: [{day, bookings, self_service_bookings, registered, self_service_registered, self_service_checked_in}]`：以台灣日期依目前報名紀錄建立日彙總。`bookings` 包含後台匯入，`self_service_*` 只計前台自行報名；有效與簽到人數採查詢當下狀態，不是當日歷史快照，也不另計獨立加購筆數。範圍沿用 `days`。

## LINE 官方帳號（@338ymhys）

金鑰由後台「系統設定 → LINE 官方帳號」填，存檔一分鐘內生效；沒設定時所有 LINE 功能靜默退化，不影響訂位、結帳。

### POST /api/line/webhook
LINE Messaging API webhook（原始 body 驗 `X-Line-Signature`；未設定 503、驗章失敗 401，其餘一律 200）。處理：加好友歡迎、關鍵字自動回應（Reply，免費）、訂位提醒按鈕（會到／取消）、員工群組輸入「群組ID」回報 ID。`webhookEventId` 寫入 `line_events` 去重。

### GET /auth/line
LINE Login 入口（`?resv=<簽名 token>` 為訂位完成頁帶來的綁定；`?redirect=` 為登入後導回）。帶 `bot_prompt=aggressive` 順勢加好友。

### GET /auth/line/callback
LINE Login 回呼：驗 state 與 nonce、驗 id_token，完成後綁定 `users.line_user_id`；帶 `resv` 時把 LINE 掛到該筆訂位並推確認卡，導向 `/line-linked.html`。

**POST /api/reservations 新增回應欄位**：`line_url`：已設定 LINE Login 時回傳「用 LINE 收通知」連結，否則為空字串。

### GET /api/admin/line/status
超管限定。`{ configured, login, oa_id, staff_group, webhook_url, linked, segments[], bot, quota, followers }`。

### POST /api/admin/line/broadcast
超管限定。body `{ segment, text, url?, preview? }`。`preview:true` 只回 `{ count }`；否則 multicast 並寫入 `line_broadcasts`，回 `{ sent }`。每小時 10 次。

### POST /api/admin/line/richmenu
超管限定。截圖 `/line-richmenu.html`，建立並設為預設圖文選單，回 `{ rich_menu_id }`。每小時 5 次。

排程：每天 18:00（台北）推「明天訂位」提醒卡（只掃已綁定 LINE 且尚未提醒者）。
