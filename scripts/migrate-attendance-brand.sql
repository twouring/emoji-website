-- 僅在備份、人工確認歸屬並獲正式資料遷移授權後執行。
-- 預設 ROLLBACK；先看候選與未能判定筆數，不能把未知的 TTH 硬歸到任一品牌。
BEGIN;
CREATE TEMP TABLE attendance_brand_candidates ON COMMIT DROP AS
SELECT a.id, a.venue AS old_venue,
       CASE
         WHEN s.venue IN ('CAFE','BAR','STAY','REST') THEN s.venue
         WHEN trim(p.venues) IN ('CAFE','BAR','STAY','REST') THEN trim(p.venues)
         ELSE NULL
       END AS new_venue,
       CASE WHEN s.venue IN ('CAFE','BAR','STAY','REST') THEN 'shift'
            WHEN trim(p.venues) IN ('CAFE','BAR','STAY','REST') THEN 'single-staff-brand'
            ELSE 'manual-review' END AS reason
FROM pos_attendance a
JOIN pos_staff p ON p.id=a.staff_id
LEFT JOIN pos_shifts s ON s.id=a.shift_id
WHERE a.venue='TTH';
SELECT reason, coalesce(new_venue,'UNRESOLVED') AS new_venue, count(*) AS rows
FROM attendance_brand_candidates GROUP BY reason,new_venue ORDER BY reason,new_venue;
-- 匯出這批 ID 作人工作業；來源不明的紀錄絕不自動改寫。
SELECT id, reason FROM attendance_brand_candidates WHERE new_venue IS NULL ORDER BY id;
UPDATE pos_attendance a SET venue=c.new_venue
FROM attendance_brand_candidates c WHERE a.id=c.id AND a.venue='TTH' AND c.new_venue IS NOT NULL;
SELECT count(*) AS would_remain_tth FROM pos_attendance WHERE venue='TTH';
ROLLBACK;
