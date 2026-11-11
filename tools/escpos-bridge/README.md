# emoji POS USB ESC/POS bridge

讓開啟 `https://pos.emoji.tw` 的同一台 Windows／macOS 主機，直接把出餐單、收據、發票證明聯與開錢櫃指令送到 USB 接上的 EPSON TM-T70II。

服務只聽 `127.0.0.1:17890`，不對區網或網際網路開放。POS 送的是點陣圖，所以中文不依賴印表機字碼表。

## 安裝

1. 在 POS 主機安裝 Node.js 22 LTS 與 EPSON TM-T70II USB 驅動，並用系統列印功能確認可列印測試頁。
2. 複製 `config.example.json` 為 `config.json`。
3. 修改：
   - `token`：使用至少 32 字元的亂數字串。
   - `printers.receipt-main.queue`：系統中的印表機名稱。macOS 用 `lpstat -p -d` 查詢；Windows 到「印表機與掃描器」複製名稱。
4. macOS 執行 `chmod +x start-macos.command` 後雙擊 `start-macos.command`；Windows 雙擊 `start-windows.cmd`。
5. 瀏覽器開 `http://127.0.0.1:17890/health`，應看到 `{"ok":true}`。
6. 開 `https://pos.emoji.tw/<店別>/settings`，填服務網址、`receipt-main` 和相同 token，按「儲存並測試列印」。

macOS 可在 Terminal 以 `lpstat -p -d` 確認 queue；Windows 的 driver 必須允許 RAW 資料。TM-T70II 的切紙與錢櫃功能由 ESC/POS 控制。

## 開機自動啟動

驗收列印後，把 macOS 的 `.command` 加進「登入項目」，或把 Windows `.cmd` 的捷徑放進 `shell:startup`。服務啟動後需保持視窗／程序執行。

## 安全與列印狀態

- token 只放主機 `config.json` 和該台瀏覽器 localStorage；不要放到 Git、後台或聊天。
- 服務僅接受 `pos.emoji.tw`／`www.emoji.tw`，且只綁 localhost。
- 同一 `jobId` 去重，網路逾時重試不會重複出單。
- `sent_to_device` 表示 Windows/macOS spooler 已收到 ESC/POS bytes，不等同紙張保證已出紙；缺紙、斷線、卡紙仍須由現場確認。
