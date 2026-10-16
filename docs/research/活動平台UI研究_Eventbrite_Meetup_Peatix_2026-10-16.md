# 活動平台列表頁／詳情頁 UI/UX 研究（Eventbrite・Meetup・Peatix）

日期：2026-10-16　用途：emoji.tw `/events` 與 `/events/<slug>` 重新設計
方法：以 curl／web_extract 實際抓取公開頁面 HTML、`__NEXT_DATA__`、Peatix `get_view_data` 與 `/search/events` JSON、三家官方 Help Center；非憑印象。

樣本：
- Eventbrite：`/d/taiwan--taipei/events/`、`/e/portfolio-night-2026-taipei-tickets-1995718241985`、`/e/taipei-tech-mixer-...-1987409348862`
- Meetup：`/find/tw--taipei/technology/`、`/taipei-dbt-meetup/events/316380997/`、`/ai-engineers-in-taiwan/events/316661456/`
- Peatix：`/event/5203632/view`（+ `get_view_data`）、`/search/events?q=meetup&country=JP`、Help 文件

---

## Eventbrite

**版面**
- 列表：不依日期分組，改用策展區塊（熱門／今日／免費）。卡片順序：封面（2:1，建議 2160×1080，搜尋縮圖另裁正方形並指定焦點）→ 標題 → 日期（`Tue, Jun 16 • 6:00 PM`；系列活動顯示 `Thursday • 9:30 PM + 28 more`）→ 場地名 → 價格（`Free`／`Starts at $X`，部分「Check ticket price on event」）→ 愛心 Save＋Share。狀態標籤：`Almost full`、`Going fast`、`Sales end soon`、`Just added`、`Popular`、`Promoted`。篩選：Date／Price／Category／Format／Language。
- 詳情：頂部封面輪播（最多 5 張），封面角落疊 `Sales end soon`。標題下方為主辦人列：頭像＋`By {org}`＋`1.8k followers · 210 events · 9y hosting · 14.9k total attendees`＋Follow。接著「Part of the … collection」、地點（錨點）、日期時間。內文 Overview 預設折疊 `Read more`。固定區塊順序：Good to know（Highlights：時長、In person、年齡、停車、開門時間；Refund Policy：`Refunds up to 7 days before event`／`No refunds`）→ Location（地址＋「How do you want to get there?」Driving／Transit／Biking／Walking 深連結＋靜態地圖 `Show map`）→ FAQ 手風琴（輸出 FAQPage schema）→ Agenda／Lineup（選用）→ Tags → Organized by 卡（Contact／Follow）→ Report → More events from {org} → You might also like → SEO 連結。
- 票務 CTA：`conversion-bar` 固定列（桌機置底亦置底），內容為「狀態＋日期＋按鈕」：`Sold out · Tue, Oct 20 • 5 PM · Join Waitlist`、`Free · Get tickets`、未開賣顯示 `Remind me`→`Reminder set!`。點擊開啟結帳 modal：票種列表＋數量下拉、`Early bird` 標籤、`Few tickets left`、預設 20 分鐘保留倒數。免登入，只需姓名＋Email；官方宣稱 3–4 步。

**轉換功能**
- 稀缺：`Almost full`／`Going fast`／`Few tickets left`／`Sales end soon`、早鳥標籤、結帳倒數。
- 社會證明：主辦人 followers／events／hosting 年數／total attendees、`Liked by N people`。
- 分享：Facebook、Messenger、LinkedIn、Twitter、WhatsApp、Email、Copy URL、「Share a flyer」。
- 候補 `Join Waitlist`、提醒 `Remind me`、追蹤主辦人、Collection（系列）、多場次 `{date} and N more`、相似活動兩區塊。
- 成功頁：`Take me to my tickets`、加入 Apple／Google Wallet、確認信。

**手機版**
- 底部固定 conversion bar（價格＋CTA）隨捲動常駐；封面輪播；Overview 折疊；App 內影片自動播放。

---

## Meetup

**版面**
- 列表：頂部篩選列：Any day（Starting soon／Today／Tomorrow／This week／This weekend／Next week／Custom）、Any type（Online／In person）、Distance、Category 橫向 chips、規模（1-9／10-20／20-50／50-100／100+ attendees）、Reset。城市首頁分「最熱門」「今日」「本週末」區塊＋「What brings you to Meetup today?」意圖入口（交友／Networking／運動／戶外）。卡片：封面 `aspect-[127/68]`（≈16:9）→ 標題 → `Thu, Oct 22 · 7:00 PM GMT+8`（系列：`Every Sat · Oct 10`）→ `by {group}` → 群組評分 `4.8` → 頭像堆疊＋`28 attendees` → `Hybrid`／`Online` 標籤 → `{n} seats left`／`Waitlist` → Save／Share。免費不標示，付費在標題或卡片顯示價格。
- 詳情：兩欄。左：標題、`Hosted by Allen W. and 3 others`（頭像、Super Organizer 徽章）、群組名、16:9 封面、Details（主辦人自行在內文寫 Agenda）、Attendees（人數＋頭像格，連到 `/attendees/`）、Photos、Related topics、Report、You may also like。右：`lg:sticky` 資訊卡：`This is a hybrid event`／日期＋時區／`Every week on Saturday`／場地名＋地址＋地圖連結／`Online event – Link visible for attendees`／`Event chat – Attend to join…`／主 CTA `Attend event`。
- 報名：需 Meetup 帳號並加入群組；Attend → RSVP modal（Hybrid 可選線上／實體、可帶 guests）；底部 `Edit RSVP`。候補模式 AUTO／MANUAL／OFF，`maxTickets`。

**轉換功能**
- `{n} seats left`、Waitlist、`goingCount` 人數＋頭像、群組評分、Super Organizer、活動後評分。
- Event chat（報名後才能進）作為報名誘因；系列活動 `Every week on…`；相似活動；Save 收藏。
- Meetup+ 付費會員享候補優先。
- 官方數據：改版手機探索頁後 RSVP +20%。

**手機版**
- `EventStickyFooter`：底部固定列＝Share＋Attend；右欄資訊卡移到標題下方；分享含 `Share this event`。

---

## Peatix

**版面**
- 列表：`/search` 為 Vue SPA，資料來自 `/search/events` JSON（`numFound`＋卡片陣列）。卡片欄位：封面（1840×900≈2:1）→ 標題 → `Tue, 6:30 PM (31 days)`（相對天數）→ `At {venue} {address}` → 主辦人暱稱；`boost_flg` 推廣標記、`user_is_watching` 收藏。卡片資料無價格欄位。篩選：國家、`tag_ids` 類別、日期預設（feature.peatix.com 的「今日／明日／週末／下週」策展頁）。
- 詳情：全幅封面 → 標題 → 日期（`Oct 28, 2026 Wed 7:00 PM – 9:00 PM JST`）→ 場地名＋地址＋Google Maps embed → 標籤 → 內文 HTML → 票券區（每票種：名稱、價格、`salesEnds`、`seatsMax`／`seatsSold`／`seatsAvailable`，整體 `cutoff`；售完時 body 加 `event-sold_out`、狀態 `SOLD OUT`）→ 主辦群組（logo、`numFollowers`、Follow）→ 聯絡主辦人表單（需登入）→ 相關活動。主辦人可選是否顯示參加人數／名單。
- 報名流程：Get Ticket → 選票種＋數量＋付款方式（卡／超商 ATM／PayPal／銀行轉帳，各有截止日）→ **必須建立帳號**（Email 或 Google／Apple）→ 付款 → 姓名 Email＋「Become a follower」勾選＋可轉讓票給朋友 → 完成頁。超商付款達 7 步。

**轉換功能**
- 追蹤群組（Follow → 「Thanks for following!」modal，新活動 Email 通知）；結帳時預設勾選追蹤。
- 票轉讓給朋友、折扣碼、多元付款、`luwakScore` 內部熱度。
- 分享：Facebook、Twitter；加入行事曆；收藏（需登入）。
- 定期開催（recurring）功能：同一頁管理多場次。

**手機版**
- 強推 App（QR 票、Combini 付款）；Help 聲明「非智慧型手機無法申請」。頁面主體由 Vue 於客戶端渲染；是否有底部固定 CTA 本次未能以靜態抓取驗證。

---

## 可直接借鏡的 10 個設計決策

1. 底部固定「狀態＋日期＋CTA」轉換列，售完自動變 `Join Waitlist`、未開賣變 `Remind me`。（Eventbrite）
2. 標題正下方放主辦人信任列：頭像＋追蹤數＋活動數＋累計參加人數＋Follow。（Eventbrite）
3. 固定「Good to know」區塊：時長／實體或線上／退費政策，放在內文之後、地點之前。（Eventbrite）
4. 地點區附 Driving／Transit／Walking 深連結，而非只嵌地圖。（Eventbrite）
5. 詳情頁右欄 sticky 資訊卡（日期、時區、週期、場地、CTA），手機版收成底部列。（Meetup）
6. 列表卡片顯示頭像堆疊＋`N attendees`＋`{n} seats left`，用人臉做社會證明。（Meetup）
7. 列表篩選用「Starting soon／Today／This weekend／Next week」時間預設＋Online／In person 切換。（Meetup）
8. 報名後解鎖「Event chat」或參加者名單，把社群價值變成報名誘因。（Meetup）
9. 票種卡顯示 `seatsSold/seatsMax` 與售票截止時間，整體與各票種分別設 cutoff。（Peatix）
10. 結帳時預設勾選「追蹤主辦人」，並允許票券轉讓給朋友，擴大二次觸及。（Peatix）

反向教訓：Peatix 強制註冊才能報名、超商付款 7 步；Eventbrite 免登入＋3–4 步為業界基準。
