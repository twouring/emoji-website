# Emoji POS VIGI Windows Bridge

將店內的 VIGI NVR4032H 影像放入 POS「設定 → 監視器」。NVR 只由 Windows 主機經店內網路讀取；POS 永遠不會拿到 NVR 的 IP、RTSP URL 或帳密。

## 架構

```
VIGI NVR (192.168.50.2, RTSP) → Windows bridge (MediaMTX, 127.0.0.1:8888) → Tailscale Serve (HTTPS) → POS iframe
```

橋接使用 **Channel-Zero**：NVR 已合成的多鏡頭格狀畫面，RTSP 為 `live/0/1/avm`。不會讓 POS 每個畫面各拉一路攝影機。

對外走 **Tailscale**：只有登入同一個 Tailscale 帳號的裝置（店內 iPad、外出的手機）看得到，不需要 Cloudflare、不搬 DNS、不開任何對外埠。POS 經 Tailscale 用低延遲 HLS，延遲要現場實測。

（也支援 Cloudflare Tunnel：`-TunnelToken` 給值就會裝 cloudflared；但 emoji.tw 的 DNS 在 Gandi，Cloudflare 免費方案不能替非 Cloudflare 託管的網域建 Public Hostname，預設不走這條。）

## 先決條件

1. 一台會長期開機、與 NVR 同一店內網路的 64-bit Windows 主機（建議列印站）。
2. NVR Web 管理頁（https://192.168.50.2）：
   - **Settings → Network → Network Service → RTSP(S)**：RTSP 開啟、埠號 554、RTSPS／SRTP 關閉。
   - **Settings → System → Basic Settings → Channel-Zero**：啟用。沒開的話 `live/0/1/avm` 不會有畫面。

## 安裝

1. 下載 `https://pos.emoji.tw/downloads/EmojiPOSVigiBridgeSetup.ps1`。
2. 以系統管理員 PowerShell 執行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
C:\Users\<你>\Downloads\EmojiPOSVigiBridgeSetup.ps1
```

程式會問 NVR 使用者名稱與密碼（密碼不會顯示），下載固定版 MediaMTX 1.21.3 到 `C:\ProgramData\EmojiPOS\vigi-bridge`（目錄只限 SYSTEM／Administrators 讀取），寫 `mediamtx.yml`，註冊開機自動啟動的工作排程 `EmojiPOS-VigiBridge`，並立刻啟動。結尾會說 mediamtx 有沒有跑起來。

3. 在 Windows 本機瀏覽器開 `http://127.0.0.1:8888/channel-zero/`，應出現多鏡頭畫面。**沒畫面就先不要往下做**（見下方排錯）。

4. 安裝 Tailscale（https://tailscale.com/download/windows），用你的 Google 帳號登入，然後在系統管理員 PowerShell 執行：

```powershell
tailscale serve --bg 8888
```

第一次會要你到網頁啟用 HTTPS 憑證，照做後再跑一次。它會印出 `https://<機器名>.<tailnet>.ts.net/`。

5. iPad 與手機裝 Tailscale App、登入同一帳號。

6. POS「設定 → 監視器」填：

```
https://<機器名>.<tailnet>.ts.net/channel-zero/
```

每台 POS 裝置各填一次；網址只存在該台瀏覽器本機，沒有登入資料。

## 排錯

- `127.0.0.1 拒絕連線`＝mediamtx 沒在跑。看 `C:\ProgramData\EmojiPOS\vigi-bridge\mediamtx.err.log`（啟動錯誤）與 `mediamtx.log`。`Get-Process mediamtx` 應該要有結果；沒有就 `schtasks /Run /TN EmojiPOS-VigiBridge` 再看 log。
- 頁面開得了但黑畫面：看 `mediamtx.log` 有沒有 `401`（NVR 帳密錯）、`404`／`not found`（Channel-Zero 沒啟用或 RTSP 沒開）、`timeout`（Windows 連不到 192.168.50.2）。
- 重新安裝直接再跑一次安裝程式即可，會覆寫設定並重啟。

不要把 NVR 554、80、443 或 8443 對外做 port forwarding。
