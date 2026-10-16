# 活動平台列表頁／詳情頁 UI/UX 研究（Luma・Partiful・Posh）

日期：2026-10-16　用途：emoji.tw `/events` 與 `/events/<slug>` 重新設計
方法：實際抓取並解析各平台公開頁的 HTML／CSS／`__NEXT_DATA__`（Luma：lu.ma/taipei、兩個台北活動頁、Calendar 頁、style-guide；Partiful：explore/nyc、公開活動頁；Posh：explore、兩個活動頁），補以官方 Help Center／Changelog。瀏覽器未綁定，按鈕高度與字級只引用 CSS 可直接讀到的值。本檔為子代理原始報告遺失後依其摘要重建的精簡版。

## Luma
- **版面**：列表依日期分組＋左側時間軸；封面 1:1；桌機固定 330px 左欄（封面＋主辦＋地點），右欄內容；≤650px 單欄。詳情頁報名卡直接放在日期／地點下方，不在側欄。
- **轉換**：免登入（姓名＋Email）、報名後 .ics 自動進行事曆、候補、「Register to See Address」、個人 referral link、主辦可開 guest list（人數＋少數頭像）作社會證明。`og:image` 是另產的 800×420 社群圖，不是封面原圖。
- **手機**：無底部固定 CTA；報名卡隨內容捲動。

## Partiful
- **版面**：策展分區列表，卡片顯示「N Interested」；詳情頁單欄＋主題動畫背景。
- **轉換**：RSVP 三步（Going → 手機號 → OTP）；Guest List 分「Going／Interested／Maybe」三指標；`og:image` 直接用直式海報。
- **手機**：RSVP 鈕 `sticky bottom`，疊在 88px BottomNav 之上。

## Posh (posh.vip)
- **版面**：列表卡片帶價格＋場地；詳情頁深色主題、海報 `md:sticky` 置左。
- **轉換**：票種階梯＋售完自動接棒下一階、「Display Spots Available」剩餘名額開關、Waitlist；Kickback 推薦分潤、Link Drops（限定連結票）、Meta pixel／CAPI；主辦卡顯示「N events／N attendees」。
- **手機**：底部 `sticky` 全幅 CTA 捲動後淡入。

## 可直接借鏡的 10 個設計決策
1. 列表依日期分組、卡片左側放日期塊，掃讀靠日期而不是靠標題。（Luma）
2. 報名表放在日期／地點正下方，不要先讀完整內文才看到。（Luma）
3. 免登入：姓名＋Email 即可，已登入自動預填。（Luma）
4. 報名完成立即給 .ics 與個人邀請連結，把參加者變成推廣者。（Luma）
5. Guest list 作社會證明，但由主辦決定是否公開。（Luma／Partiful）
6. 「Interested／Going」兩段式承諾，降低第一步門檻。（Partiful）
7. 手機底部固定 CTA，捲動內文時常駐。（Partiful／Posh）
8. 票種階梯售完自動接棒、剩餘名額可顯示但可關閉。（Posh）
9. 主辦人卡顯示過往場次與累計參加人數，建立信任。（Posh）
10. 社群分享圖另做（不是直接丟封面），確保 1.91:1 或直式海報在各平台預覽正確。（Luma／Partiful）
