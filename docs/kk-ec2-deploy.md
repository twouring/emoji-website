# emoji-website 部署到 kk-ec2（refactor/kk 變更說明）

日期：2026-11-14　分支：`refactor/kk`　看板：t_18fcd53e（後續部署驗證 t_e8e55c29）

## 結論

`refactor/kk` 的 emoji-website 現在可以用 AI GO Hosted App 單機管線（deployd-single）部署成 kk-ec2 副本。四個入口（www／裸網域／pos／app）和後台的網域全部改由環境變數決定，不再寫死 `*.emoji.tw`。`CRON_MODE=off` 會關掉所有排程與收款同步。正式站不設這些變數時，行為與原本相同（有測試鎖住）。

## 目前架構與 kk-ec2 的差異

| 項目 | 正式站（Cloud Run） | kk-ec2（deployd-single） | 本次處理 |
|---|---|---|---|
| 建置 | GitHub Actions → Cloud Build，同一個 image 部署 emoji-website 與 emoji-admin | 上傳原始碼 tgz → kk-ec2 本機 `docker build`（必須自帶 Dockerfile、聽 8080） | Dockerfile 原樣可用（`node:22-slim`＋chromium，`EXPOSE 8080`，`node bootstrap.js`），不用改 |
| 網域 | www／emoji.tw／pos／app／admin 各自 domain mapping 到同一個服務 | 只自動產生 `<slug>.deploy.43-213-238-222.nip.io` 一個 Caddy 片段 | 程式改成全部讀 env；其餘子網域要手動加 Caddy 片段（見下） |
| 裸網域轉址 | `emoji.tw` → `https://www.emoji.tw`（寫死） | 副本要轉去副本的 www | 新增 `APEX_HOSTS`、`APEX_REDIRECT_ORIGIN` |
| POS 舊網址 `/pos` | 轉 `https://` + `POS_HOSTS[0]`（寫死 https） | 同左，但要能指定 | 新增 `POS_ORIGIN`（預設不變） |
| 前端判斷 App 網域 | `m.html` 寫死 `app.emoji.tw`，官網寫死 `https://www.emoji.tw` | 子網域不同 | 改用子網域前綴 `app.` 推出 `www.`（與 `order.html`、`pos.html` 既有寫法一致） |
| 找碴圖片（後台） | `pos-bugs.js` 寫死 `https://www.emoji.tw` | 同上 | 改用 `admin.` → `www.` |
| 高管總覽的 POS 連結 | `lib/exec-board.js` 預設 `https://pos.emoji.tw` | 同上 | 由 server 傳入 `POS_BASE` |
| 排程 | 程序內 node-cron 或 `CRON_MODE=scheduler` | 副本不可對外發送（重複寄信／推播／IG 發文／LINE Pay、中信對帳） | 新增 `CRON_MODE=off`：在收款同步迴圈與所有排程之前 return，`/internal/cron/*` 一律 404 |
| 資料庫 | Cloud SQL（`DATABASE_URL`） | 副本資料庫 | **未改**：仍直連 Postgres（見「未處理」） |
| 上傳檔 | `uploads/` 本機＋MinIO（IG） | 容器內，重新部署就消失 | **未改**（見「未處理」） |

## 改了哪些檔

- `server.js`
  - `CRON_OFF`（`CRON_MODE=off`）：`boot()` 在 `for (const w of PAY_WATCHERS)`、node-cron、`CRON_SCHEDULER` 之前 return。
  - `APEX_HOSTS`／`APEX_REDIRECT_ORIGIN`：裸網域 308 轉址可設定；預設仍是 `emoji.tw` → `https://www.emoji.tw`。
  - `POS_BASE`（`POS_ORIGIN`，預設 `https://<POS_HOSTS[0]>`）：`/pos`、`/pos/*`、`/pos.html` 轉址與高管總覽 POS 連結共用。
- `public/m.html`：`ON_APP` 改用 `/^app\./`，`SITE` 由 `location.origin` 把 `//app.` 換成 `//www.`。
- `public/pos-bugs.js`：後台找碴圖片網址由 `//admin.` 換成 `//www.`。
- 新增 `kk-ec2.env.example`：副本環境變數範本（只有網域與模式，不含任何機敏值）。
- 新增 `scripts/test-kk-ec2-hosts.mjs`：6 支測試（四入口、跨站轉址留在副本網域、Google callback、CRON_MODE=off、正式站預設不變、前端不寫死）。
- 新增 `scripts/kk-ec2-run-local.sh`：用範本 env 在本機啟動真行程。
- 新增 `scripts/kk-ec2-smoke.sh`：四入口煙霧測試（本機用 Host 標頭；給 https 網址時打真網域）。

## 已驗證（本機）

- `node --test scripts/test-*.mjs`：1576 支，1568 pass、0 fail、8 skipped。改動前的基準是 1570 支，1562 pass、0 fail。
- `npm ci --omit=dev`：用同一份 lockfile 安裝成功，和 Dockerfile 的安裝步驟相同。
- 真行程＋真 Postgres 18：`scripts/kk-ec2-run-local.sh` 啟動，migrate 與 seed 完成，log 有 `[boot] CRON_MODE=off`，沒有 LINE Pay、IG 排程啟用訊息。`scripts/kk-ec2-smoke.sh` 10 項全部 ok，結果 `SMOKE_OK`：
  - www `/`、`/en` 200，`/api/health` 200
  - 裸網域 `/events?x=1` 308 → `https://www.<D>/events?x=1`
  - pos `/` 與 `/atcafe` 200（品牌選擇頁）；www `/pos` 302 → `https://pos.<D>/`
  - app `/` 200（會員 PWA）；app `/events` 302 → `https://www.<D>/events`；app `/api/health` 200（`db:true`）

**沒驗到的**：本機沒有 Docker daemon，`docker build` 沒有實跑。Dockerfile 沒改，實際建置在 kk-ec2 由 deployd-single 執行，留給 t_e8e55c29 驗證。

## kk-ec2 部署步驟（給 t_e8e55c29）

以 slug `emoji` 為例，網域 `D=emoji.deploy.43-213-238-222.nip.io`。

1. 打包：`tar czf emoji-website.tgz --exclude=.git --exclude=node_modules --exclude=uploads .`
2. 註冊（先不部署）：`POST /api/v1/hosted-apps`，帶 `{"name":"emoji-website","slug":"emoji","visibility":"public","create_deployment":false}`。
3. 環境變數：先 `GET /runtime-settings`，合併 `kk-ec2.env.example` 的鍵再 `PUT`。PUT 是全量替換，漏列的鍵會被刪掉。機敏值放 `env_sensitive`：`APP_SECRET`、`PII_KEY` 用副本專用新值，`DATABASE_URL` 指副本庫，**不可指正式 Cloud SQL**。金流、寄信、推播、IG 金鑰一律不設。
4. 部署：`hosted-single/hosted-deploy.sh emoji-website emoji emoji-website.tgz <app_id>`，看 `/deployments/{id}` 到 ready。
5. 子網域：deployd-single 只寫 `ha-emoji.caddy`（裸網域 `D`）。www／pos／app／admin 要另加片段，放 `/opt/platform/out/caddy/hosted/ha-emoji-subs.caddy`，再 `docker exec platform-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`。容器名照 `ha-emoji.caddy` 裡 `reverse_proxy` 那行，格式是 `ha-<app_id hex>`。片段不要寫 `http://` scheme，否則不會走 HTTPS：
   ```
   www.emoji.deploy.43-213-238-222.nip.io, pos.emoji.deploy.43-213-238-222.nip.io, app.emoji.deploy.43-213-238-222.nip.io, admin.emoji.deploy.43-213-238-222.nip.io {
   	reverse_proxy ha-<app_id hex>:8080
   }
   ```
   重新部署時，deployd-single 只會改寫 `ha-emoji.caddy`，這個額外片段會留著。容器名不變，所以片段不必改。
6. 驗證：`scripts/kk-ec2-smoke.sh https://www.emoji.deploy.43-213-238-222.nip.io emoji.deploy.43-213-238-222.nip.io`，看到 `SMOKE_OK` 才算過。另外確認容器 log 有 `[boot] CRON_MODE=off`。

admin.emoji.tw 若要在 kk-ec2 另開一個服務：同一份原始碼另建一個 Hosted App，env 加 `SERVICE_ROLE=admin`。不開也行，上面的片段已經把 admin 子網域導進同一個容器，由官網服務代管。

## 未處理（要 KK 決定）

1. **資料層**：網站仍直連 Postgres，共 84 張表、1,090 句查詢。之前定的「唯一走 AI GO 資料中心窗口」要等平台的 query DSL 與 atomic batch 上線才做得了，估約 366 子代理小時（`/workspace/local/aigo-aws-deploy/hosted-single/website-migration-plan.md`）。所以這次副本要接自己的 `DATABASE_URL`：kk-ec2 Postgres 另建一個庫，從 Cloud SQL 匯出後匯入。這和「唯一走資料中心」的決定不一致，部署前請 KK 確認可以先這樣做副本。
2. **上傳檔**：程式仍寫 `/src/uploads/`，沒有改走 AI GO 檔案儲存。`persistent_disk` 掛的是 `/data`，不是這個目錄，所以副本每次重新部署，上傳檔都會清空。驗證頁面與登入不受影響。
3. **SSO**：`sso-client.js` 只在 `*.emoji.tw` 啟用，副本網域自動停用，各站維持自己的登入。這是預期行為，不影響使用。
4. **Google 登入**：副本要能登入，得在 Google OAuth 用戶端加 `https://www.<D>/auth/google/callback`，或者副本先不設 `GOOGLE_CLIENT_ID`。
