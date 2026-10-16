# emoji.tw 活動頁重設計：平台觀察與轉換率 UX 研究

調查日期：2026-10-16。Accupass、KKTIX、Luma、Meetup 均以 web_extract + curl（手機 UA）實際抓取公開頁面觀察；瀏覽器未綁定，無截圖。

## 1. Accupass 與 KKTIX 實際觀察

**Accupass（詳情頁 /event/<id>）**
- 版面：標題 → 收藏數／瀏覽數 → 主辦頭像（可點）→ 日期＋「Add To Calendar」（Google Calendar 連結）→ 地址（Google Maps 連結＋捷運站）→「Offline Event：報名後用 App 出示票券」→ 活動介紹 → 地圖 → 相似活動。[3]
- CTA 按鈕狀態機：Register Now / Sold Out / Closed / Under Review / Coming soon；主辦可掛「Organizer verified by ACCUPASS」徽章。[3]
- 分享：手機版 share drawer 只有「Copy link」；頁面上沒有 LINE 分享鈕，LINE 只出現在頁尾「Ask ACCUPASS」官方帳號。[3]
- 報名步數：須先註冊／登入 → 立即報名 → 選票種＋張數 → 填報名資料 → 付款 → 到 App 或網頁「我的票券」取 QR code，約 5–6 步、不免登入。[30][31]
- 台灣在地要素：信用卡、ATM、超商、LINE Pay、街口付款[32]；代開電子發票每張 15 元[28]；免費活動零手續費，付費票 5%＋10 元，付費活動需 2 個工作天審核。[29]

**KKTIX（<org>.kktix.cc/events/<slug>）**
- 版面：長文描述 → 票種表格（票種／售票期間／價格，含 schema.org Offer 的 InStock/OutOfStock）→ 「下一步」按鈕（桌機在票表下方，手機另有 `mobi-only` 固定按鈕）→ 「120 報名人」名單（可顯示／隱藏）→ FB Like + Tweet 分享列，無 LINE。[4][5]
- 報名五步：下一步 → 選票種張數＋勾選條款 → 限時填表 → 結帳 → 完成。[25]
- 免登入：依活動設定；未登入訂單票券 QR 寄到 Email，日後註冊同 Email 自動歸戶；註冊的好處是「報名資料預填」。[24][26]
- 社會證明：報名人數＋姓名列表是標配。[4][5]
- 台灣慣例：早鳥／學生／團體／企業票分層；「報帳需買企業票種」；退票委託 KKTIX、收 10% 手續費、活動前 10 天不退，直接寫在頁面。[4][5]

**Luma（對照）**
- 參加者免帳號，姓名＋Email 即可報名；已登入自動預填；候補名單、「Register to See Address」。[36][38][9]
- 主辦可開啟 guest list 作社會證明（顯示人數＋少數頭像）。[51]
- 台灣主辦自行用中文補上「退票與票券轉讓」、「報名須知」段落，退款政策為結構化欄位。[7]

## 2. 台灣科技社群實際用哪些平台

- **Meetup.com**：Taipei WordPress Meetup（10 月兩場就辦在言文字，「低消一杯飲料」入場，22 人報名、群組評分 4.8）。[6][43][54] 痛點：主辦月費 US$29.99 起、報名需完整帳號、介面有廣告、RSVP 不具約束常放鳥。[47][48]
- **KKTIX**：sciwork 每月 scisprint 與年會、PyCon TW 皆用 KKTIX 組織頁。[5][4] 痛點：退票 10%、頁面樣式老舊、分享只有 FB/X。
- **Accupass**：Taiwan Startup Stadium（2021）、數位遊牧台灣（2024，含 IG 留言領折扣碼、揪團票）。[49][45] 痛點：需登入、審核、發票另計。[29][28]
- **Luma**：2025 起明顯成為台北 AI／新創社群主流——Taipei Entrepreneurs Hub Demo Day（+225）、Meet Taipei 2026 免費票、Claude Code Meetup（200+）、數位遊牧台灣 2025 也轉用 Luma。[8][52][9][46] r/taiwan 使用者：「選擇少但品質高、排版清楚」。[39] 痛點：付費票 5% 平台費＋Stripe、英文介面與支付方式不一定合台灣、沒有社群頁、無原生重複活動。[33][34][48]
- **Facebook 社團／IG／Threads／LINE**：只能貼連結，報名一律導到上述平台或官網 → emoji.tw 自建 /events 的價值在於「分享連結落地頁＋免登入報名」。

## 3. 轉換率 UX 研究（可引用）

- **免登入 guest checkout**：19% 使用者因強制建帳號放棄；47% 網站 guest 選項不夠顯眼，等於沒提供。[10][11]
- **表單欄位數**：平均結帳 11.3 欄，多數只需 8 欄；欄位數比步驟數更影響完成率。[12] Eventbrite：3 欄表單加到 4 欄完成率掉 5%。[20]
- **CTA 位置／載入速度**：CTA 放首屏；載入延遲 1 秒轉換掉 7–10%，加快 500ms 可提升約 3%。[21]
- **視覺**：82% 參加者偏好有現場氛圍照的報名頁，有影片的列表轉換高 10%。[20]
- **社會證明**：NN/g 提醒要實測、不要盲加[16]；CXL 眼動研究：有照片的推薦語記憶度顯著較高，logo 與數字不易被記住。[17]
- **稀缺／倒數**：NN/g：只用真實的稀缺，假的會毀信任，須 A/B 測。[15] CXL 案例：一行真實的截止文字（非時鐘）營收 +27.1%；學術實驗顯示倒數鐘本身無顯著提升。[19][18]
- **Sticky CTA**：Baymard 建議長頁面用固定摘要＋主按鈕；固定按鈕要留白、避免滿版。[13][14]
- **價格透明**：39% 因額外費用放棄結帳。[10]
- **信任訊號／退費政策**：Accupass 的主辦認證徽章[3]、KKTIX 在頁面直接寫退票規則[5]、Luma 的結構化退款政策[7]，都是台灣使用者已習慣看到的。

## 4. 分享技術做法

- **LINE**：`https://social-plugins.line.me/lineit/share?url=<encoded>&text=<encoded>`，可用官方按鈕或自訂圖示；另有分享次數 API。[23]
- **Web Share API**：`navigator.share({title, text, url})`，需 HTTPS 與使用者手勢，桌機部分瀏覽器不支援 → 先 `if (navigator.share)` 再 fallback 到連結列。[22]
- **Threads**：`https://www.threads.net/intent/post?text=<文字+網址>`，無獨立 url 參數，網址放文字末行會自動展開預覽。[40]
- **Facebook**：`https://www.facebook.com/sharer/sharer.php?u=<encoded>`。[50]
- **Instagram**：網頁無分享 API；Stories 只有 iOS/Android deep link（`instagram-stories://share`）且需裝 App。[41][42] 替代：產生 1080×1920 限動圖（含 QR code）供下載、Web Share 的 `files` 傳圖、複製連結；Luma 即用「Share Event Poster＋QR code」。[37]
- 共通：每頁 `og:image` 1200×630（KKTIX、Luma 皆有），LINE/FB/Threads 預覽才好看。[4][7]

## 可直接借鏡的 8 個設計決策

1. **免登入報名**：姓名＋Email 即可，手機選填，報名後再提供「建帳號／加 LINE」；標籤明寫「免註冊」。[36][11]
2. **表單 ≤5 欄**，分票種用條件欄位；需報帳者再勾「開立統編發票」。[12][20]
3. **手機固定底部 CTA**（票價＋「報名」），狀態機沿用 Accupass：報名／候補／額滿／已結束。[3][13]
4. **票種表格化**：票名、價格、售票期間、剩餘，InStock/OutOfStock 寫進 schema.org Event/Offer。[4][5]
5. **社會證明真實化**：顯示「已報名 N 人」＋頭像或社群 logo，可關閉；首屏放現場照。[51][17][20]
6. **只用真實稀缺**：「剩 N 席」「早鳥至 10/31」來自真資料，不放假倒數。[15][19]
7. **分享列順序：LINE → 複製連結 → Threads → FB → IG 限動圖下載**，手機先呼叫 Web Share。[23][22][40]
8. **信任區塊固定模板**：地址＋捷運＋Google Maps、Add to Calendar、退費／轉讓規則、主辦與場地介紹，三語一致。[3][7][5]
## Sources

[3] https://www.accupass.com/event/2610121445021259770481
[4] https://pycontw.kktix.cc/events/2026-individual
[5] https://sciwork.kktix.cc/events/conference2026
[6] https://www.meetup.com/taipei-wordpress/events/316808850
[7] https://luma.com/zr1k4qa5
[8] https://luma.com/discover/taipei/ai
[9] https://luma.com/znau3s6w?locale=zh-TW
[10] https://baymard.com/blog/checkout-flow-ux-optimization
[11] https://baymard.com/research-articles/make-guest-checkout-prominent
[12] https://baymard.com/research-articles/checkout-flow-average-form-fields
[13] https://baymard.com/research-articles/responsive-upscaling
[14] https://baymard.com/blog/ecommerce-ux-best-practices
[15] https://www.nngroup.com/articles/scarcity-principle-ux
[16] https://www.nngroup.com/articles/social-proof-ux
[17] https://cxl.com/blog/social-proof
[18] https://cxl.com/blog/creating-urgency
[19] https://cleancommit.io/blog/do-countdown-timers-work
[20] https://www.eventbrite.com/blog/event-registration-form-template-ds00
[21] https://www.eventbrite.com/blog/wp-content/uploads/2024/06/Master-Marketing-Guide.pdf
[22] https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
[23] https://developers.line.biz/en/docs/line-social-plugins/install-guide/using-line-share-buttons
[24] https://support.kktix.com/hc/zh-tw/articles/22446261556505
[25] https://support.kktix.com/hc/zh-tw/articles/23055347123993
[26] https://support.kktix.com/hc/zh-tw/articles/22196025699481
[28] https://blog.accupass.com/accupass-organizer-faq.html
[29] https://blog.accupass.com/accupass-guide.html
[30] https://accupass.uservoice.com/knowledgebase/articles/871296
[31] https://accupass.uservoice.com/knowledgebase/articles/150617
[32] https://campaign.accupass.com/advanced-services/accupass-online.html
[33] https://jasperhung.dev/posts/luma-event-page-design
[34] https://luma.com/pricing?locale=zh-TW
[36] https://help.luma.com/p/event-registration-process
[37] https://help.luma.com/p/promote-your-event
[38] https://help.luma.com/p/waitlist
[39] https://www.reddit.com/r/taiwan/comments/1vl73wt/what_do_people_use_to_find_out_about_new_and
[40] https://u2l.ai/tools/threads-share-link-generator
[41] https://gist.github.com/jameschapman2c/65eff9f54a2d350b17a6ce5127b9fe42
[42] https://developers.facebook.com/docs/sharing/sharing-to-stories
[43] https://www.meetup.com/taipei-wordpress
[45] https://www.accupass.com/event/2412040849571853528973
[46] https://luma.com/6aonx3cz
[47] https://nexspark.org/journal/meetup-alternatives
[48] https://the-playground.fr/en/blog/meetup-vs-luma-vs-the-playground
[49] https://www.accupass.com/event/2108050347404014902000
[50] https://stackoverflow.com/questions/9120539/facebook-share-link-without-javascript
[51] https://help.luma.com/p/event-guest-list
[52] https://luma.com/meet-eiby
[54] https://www.meetup.com/find/tw--taipei/technology
