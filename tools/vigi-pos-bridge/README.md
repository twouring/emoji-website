# Emoji POS VIGI Windows Bridge

將店內的 VIGI NVR4032H 影像放入 POS「設定 → 監視器」。NVR 只由 Windows 主機經店內網路讀取；POS 永遠不會拿到 NVR 的 IP、RTSP URL 或帳密。

## 架構

```
VIGI NVR (192.168.50.2, RTSP) → Windows bridge (MediaMTX) → Cloudflare Tunnel (HTTPS) → POS iframe
```

橋接使用 **Channel-Zero**：NVR 已合成的多鏡頭格狀畫面，RTSP 為 `live/0/1/avm`。不會讓 POS 每個畫面各拉一路攝影機。

MediaMTX 同時開啟 WebRTC（店內受管裝置可用）與低延遲 HLS。Cloudflare Tunnel 不轉送 WebRTC 的 UDP 媒體資料，因此 POS 經 Tunnel 會自動使用 HLS；這是可用且安全的路徑，典型延遲約 2–5 秒。若要壓到約 0.5–2 秒，POS iPad 與 Windows 都要在同一個 Tailscale tailnet，將 POS bridge 改指向 Windows 的 Tailscale HTTPS WebRTC 位址。

## 先決條件

1. 找一台會長期開機、與 NVR 同一店內網路的 64-bit Windows 主機（建議列印站）。
2. Cloudflare Zero Trust 建立 **Named Tunnel**，並建立 Public Hostname，例如 `cctv.emoji.tw`：
   - Service type：HTTP
   - URL：`http://127.0.0.1:8888`
   - 停用快取／Cache Everything 規則。
   - 在 **Access → Applications** 對此 hostname 建 Self-hosted application，政策只允許店內對外固定 IP；若沒有固定 IP，改要求指定的 Google 帳號登入。不要建立 Everyone／Bypass 政策。
3. 從 Tunnel 詳細頁複製 token。這個 token 只存 Windows 的 `C:\ProgramData\EmojiPOS\vigi-bridge`，不是 NVR 密碼。
4. NVR Web 管理頁：**Settings → Network → Network Service → RTSP(S)**，確認 RTSP 開啟、埠號 554、SRTP 關閉。

## 安裝

以系統管理員 PowerShell 執行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\EmojiPOSVigiBridgeSetup.ps1 -TunnelToken '貼上 Cloudflare Tunnel token'
```

安裝程式會安全地詢問 NVR 帳號與密碼，下載固定版 MediaMTX 與 cloudflared，建立只限 `SYSTEM`／`Administrators` 讀取的安裝目錄，並註冊開機自動啟動工作。

完成後，在 `https://pos.emoji.tw/<店別>/cctv` 開啟「設定 → 監視器」，貼上：

```
https://cctv.emoji.tw/channel-zero/
```

（以實際 Public Hostname 取代 `cctv.emoji.tw`。）每台 POS 要各自填一次；網址只存在該台裝置瀏覽器本機，沒有登入資料。

## 驗證與維護

- Windows 本機：開 `http://127.0.0.1:8888/channel-zero/`，應出現影像。
- POS：開監視器頁，應顯示 Channel-Zero 多鏡頭畫面。
- 開機後：工作排程器的 `EmojiPOS-VigiBridge` 狀態應是 Running。
- 若沒有畫面：先確認 RTSP 開啟、NVR 仍是 `192.168.50.2`、Windows 可連 NVR；再看 Cloudflare Tunnel 是否 Healthy。

不要把 NVR 554、80、443 或 8443 對外做 port forwarding。
