# Cloud Scheduler 觸發排程（CRON_MODE=scheduler）

目的：emoji-website 改成依請求計費（`--no-cpu-throttling` 拿掉、`minScale=0`）後，程序內的 node-cron／setInterval
在閒置時拿不到 CPU、縮到 0 時完全不跑。改由 Cloud Scheduler 每分鐘打 HTTP 端點觸發。

## 開關

| 環境變數 | 服務 | 說明 |
|---|---|---|
| `CRON_MODE=scheduler` | emoji-website、emoji-admin | 程序內不啟動任何排程，也不掛 60 秒系統設定重載計時器；改為請求進來時距上次載入逾 60 秒才 lazy 重載。未設定＝原本行為。 |
| `CRON_SECRET` | emoji-website | 至少 32 字元（`openssl rand -hex 32`），建議放 Secret Manager。未設定或太短時 `/internal/cron/*` 一律 404，**排程不會執行**（開機 log 有 `[warn]`）。 |
| `CRON_WEBHOOK_BUDGET_MS`（選填） | emoji-website | 每次觸發處理活動 webhook 佇列的時間上限，預設 50000，最多 55000。 |

`SERVICE_ROLE=admin`（後台）與 `RAILWAY_ENVIRONMENT`（Railway 備援）照舊不跑排程，端點也一律 404。

## 端點

`POST /internal/cron/:job`，header `X-Cron-Secret: <CRON_SECRET>`（sha256 後 `timingSafeEqual` 比對）。

- `tick`：依 `X-CloudScheduler-ScheduleTime`（偏離現在逾 15 分鐘或缺少時用現在）換算台北時間，跑該分鐘到期的全部 job。**建議只建這一個 job。**
- `minute`／`five-minute`：群組。
- 單一 job：`event-webhooks`、`wallet-sync`、`authorization-expiry`、`event-mail`、`line-delivery`、`pickup`、
  `linepay-recent`、`ig-publish`、`ig-token-refresh`、`linepay-daily`、`membership-reminders`、`line-reminders`（手動補跑用）。

等全部工作做完才回應（回應後 CPU 會被限制）。回應 200 + `{ ok, at, results:[{job,status,…}] }`；
`status` 為 `ok`／`error`／`disabled`（整合未設定）／`skipped`（`running` 本機正在跑、`locked` 其他執行個體正在跑）。
job 失敗仍回 200（與原本一樣不自動重試，錯誤進 log；IG 失敗照舊寄告警信），避免 Cloud Scheduler 重試造成重複寄信／發文。
DB 未就緒回 503（Cloud Scheduler 會依重試設定重試）。

跨執行個體防重入：HTTP 觸發時另取 `cron_leases` 表的租約（migrate 自動建表），租約過期時間依 job 120–900 秒，
執行個體中途死掉時最多卡到租約過期。LINE Pay 兩個對帳 job 共用同一把租約。

## Cloud Scheduler job

```bash
gcloud scheduler jobs create http emoji-cron-tick \
  --project emoji0701 --location asia-east1 \
  --schedule '* * * * *' --time-zone 'Asia/Taipei' \
  --http-method POST --uri 'https://<emoji-website 服務網址>/internal/cron/tick' \
  --headers 'X-Cron-Secret=<CRON_SECRET>' \
  --attempt-deadline 180s --max-retry-attempts 0
```

`--max-retry-attempts 0`：一分鐘後下一次 tick 就會補上；每日 job（04:10、04:30、09:00、18:00）若那一分鐘失敗不會自動補跑，
需看 log 或手動 `POST /internal/cron/<job>`。

## 切換步驟（建議順序）

1. 部署本分支（main 合併後 CI 自動部署），兩個服務此時都還沒設 `CRON_MODE`，行為與原本相同。
2. emoji-website 設 `CRON_SECRET`（不設 `CRON_MODE`）→ 端點仍 404，確認無誤。
3. 建 Cloud Scheduler job（先 `--paused` 也可）。
4. emoji-website、emoji-admin 同時設 `CRON_MODE=scheduler`、恢復 Scheduler job；確認 log 出現 `[boot] CRON_MODE=scheduler`，
   手動 `gcloud scheduler jobs run emoji-cron-tick` 看回應。
5. 觀察一兩天後再把 emoji-website 改 `--cpu-throttling`（依請求計費）與 `--min-instances 0`。

回復：拿掉 `CRON_MODE`（重新部署修訂版）並暫停 Scheduler job，即回到程序內排程。

## 已知影響

- **桌邊點餐 SSE（`/api/orders/:id/live`）**：長連線本身就是一個進行中的請求，依請求計費時連線期間有 CPU，
  `lib/table-live.js` 的 25 秒心跳與 LISTEN 照常運作；沒有任何連線時執行個體可以縮到 0，沒有影響。
  Cloud Run 請求逾時（預設 300 秒）到了會斷線，瀏覽器依 `retry:` 自動重連，與現在相同。
  執行個體會因長連線而維持在線（計費），但這是有客人在用時才會發生。
- 冷啟動：minScale=0 時第一個請求（包括 Scheduler tick）要等 migrate 與啟動；每分鐘的 tick 實際上會讓執行個體大多時間保持溫熱。
- 依請求計費下每分鐘 tick 一次仍會計費（每次通常數百毫秒～數秒；LINE Pay 對帳用 puppeteer 最久）。
