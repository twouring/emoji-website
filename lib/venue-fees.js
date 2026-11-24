'use strict';
/* 會員活動場地費、代收金流手續費、撥款日與取消退費規則（產品規格 v2 §4.6–§4.8，KK 2026-10-22 定案）。
 * 全部是純函式，金額單位為新台幣元（整數）；日期一律以台北日曆日計算。 */

const PUBLIC_PER_PERSON_TWD = 150;          // 公開活動：每人場地茶飲費（附茶飲一杯）
const FEE_RATE = 0.1;                        // 代收金流手續費 10%（含 Stripe 刷卡費）
const SLOT_HOURS = 2;                        // 1 時段＝2 小時
const CAPACITY_WARNING = 60;                 // 等等空間共享活動區超過 60 人：提示需言文字確認容量（不擋送出）
const ATTENDEE_REFUND_MIN_DAYS = 8;          // 參加者可自行退票：活動開始前 8 日（含）以前
const HOST_CANCEL_FREE_MIN_DAYS = 8;         // 主辦人取消公開活動：前 8 日以前免收手續費
const PAYOUT_BUSINESS_DAYS = 10;             // 撥款：活動結束隔天起算第 10 個工作日

// 等等空間共享活動區依人數級距；41 人以上改每人 500。超時費依序對應五個級距。
const THIRD_FLOOR_TIERS = [
  { max: 10, fee: 5000, overtime: 2000, tier: '1-10' },
  { max: 20, fee: 10000, overtime: 3000, tier: '11-20' },
  { max: 30, fee: 15000, overtime: 4000, tier: '21-30' },
  { max: 40, fee: 20000, overtime: 5000, tier: '31-40' },
  { max: Infinity, perPerson: 500, overtime: 6000, tier: '41+' },
];
const FLAT_VENUES = {
  '2F': { fee: 10000, max: 10, overtime: 3000, tooMany: '等等空間交誼廳至多 10 人，請改選等等空間共享活動區。' },
  '1F': { fee: 30000, max: 50, overtime: 10000, tooMany: '在咖啡／三點水餐飲空間包場至多 50 人。' },
};
const STAY_ZONE_HIRE = '等等空間包場請到 staysquare.emoji.tw/#venue 選區域與時段（A 區 NT$1,800 起／時段）。';
const REST_BOOK_HIRE = '交誼廳屬約書旅，包場請到 restbook.emoji.tw 線上預約付款。';
// 4F 不開放會員申請；2F 交誼廳歸約書旅（KK 11/17：包場放約書旅站，不走活動申請）
const MEMBER_VENUES = ['1F', '3F'];

/* 等等空間分區包場（場地說明 2026-11 版，KK 2026-11-01 核准加價版）：每時段 2 小時、不因人數加價；
 * max＝有桌椅人數上限（撤桌椅另議）。E 會議室會員免費。staysquare.emoji.tw 包場表單送 zone。 */
const STAY_ZONES = {
  A: { fee: 1800, max: 15, zh: 'A 靠窗區', en: 'Zone A (window)', ja: 'Aエリア（窓側）' },
  B: { fee: 1400, max: 15, zh: 'B 區', en: 'Zone B', ja: 'Bエリア' },
  C: { fee: 1400, max: 15, zh: 'C 區', en: 'Zone C', ja: 'Cエリア' },
  D: { fee: 1200, max: 10, zh: 'D 榻榻米區', en: 'Zone D (tatami)', ja: 'Dエリア（畳）' },
  E: { fee: 600, max: 4, memberFree: true, zh: 'E 會議室', en: 'Room E (meeting room)', ja: 'E会議室' },
  AB: { fee: 3000, max: 30, zh: 'A+B', en: 'Zones A+B', ja: 'A+B' },
  ABC: { fee: 4200, max: 45, zh: 'A+B+C', en: 'Zones A+B+C', ja: 'A+B+C' },
  ABCD: { fee: 5200, max: 55, zh: 'A+B+C+D', en: 'Zones A+B+C+D', ja: 'A+B+C+D' },
  ALL: { fee: 6400, max: 59, zh: '整體空間（A–E＋電話亭）', en: 'Whole space (A–E + phone booth)', ja: '全体（A〜E＋電話ブース）' },
};
const ZONE_MAX_SLOTS = 6;
/* 四個品牌站的線上付費包場（KK 2026-11-17）：等等空間分區（3F）＋約書旅交誼廳（2F，KK 11/24 改每時段 3 小時 NT$5,000（原 11/04 每 2 小時 NT$2,000），
 * KK 11/24 起 24 小時都可包場）＋在咖啡／三點水餐飲空間（1F，規格 v2 §4.6 每時段 NT$30,000、至多 50 人）。
 * brand＝顯示與 Stripe 品名用；venue＝佔用空間代碼（1F 通過時會關閉該時段訂位）。 */
const HIRE_ZONES = {
  ...Object.fromEntries(Object.entries(STAY_ZONES).map(([k, z]) => [k, { ...z, venue: '3F', brand: '等等空間' }])),
  LOUNGE: { fee: 5000, hours: 3, max: 10, venue: '2F', brand: '約書旅', restBook: true, zh: '約書旅交誼廳', en: 'Rest Book lounge', ja: '約書旅ラウンジ' },
  CAFE: { fee: 30000, max: 50, venue: '1F', brand: '在咖啡', zh: '在咖啡 at cafe 包場', en: 'at cafe buyout', ja: '在咖啡 貸切' },
  BAR: { fee: 30000, max: 50, venue: '1F', brand: '三點水', zh: '三點水 3AM 包場', en: '3AM buyout', ja: '三點水 貸切' },
};
/** 該區一個時段幾小時（KK 11/24：約書旅交誼廳 3 小時 NT$5,000，其餘 2 小時）。 */
const zoneSlotHours = zone => (hireZone(zone) && hireZone(zone).hours) || SLOT_HOURS;
const hireZone = zone => Object.prototype.hasOwnProperty.call(HIRE_ZONES, zone) ? HIRE_ZONES[zone] : null;
/** 約書旅交誼廳出租時段：KK 11/24 起 24 小時都可包場，不再限平日 18:00 後與週二小聚；保留函式給呼叫端，永遠回 null。 */
function restBookHireError() { return null; }

/** 分區包場費：zone 單價 × 時段數；E 會議室會員免費。 */
function quoteZoneFee({ zone, slots, attendees, member = false } = {}) {
  const z = hireZone(zone);
  if (!z) return { error: '請選擇包場區域。' };
  if (!isInt(slots) || slots < 1 || slots > ZONE_MAX_SLOTS) return { error: `時段數必須是 1 至 ${ZONE_MAX_SLOTS}。` };
  if (attendees != null && (!isInt(attendees) || attendees < 1 || attendees > z.max)) return { error: z.venue === '3F' ? `${z.zh}有桌椅至多 ${z.max} 人；需要撤桌椅請來信 us@emoji.tw。` : `${z.zh}至多 ${z.max} 人。` };
  const unit = z.memberFree && member ? 0 : z.fee;
  return { zone, venue: z.venue, brand: z.brand, label: z.zh, slots, slot_hours: zoneSlotHours(zone), unit_twd: unit, fee_twd: unit * slots, max: z.max, member_free: !!(z.memberFree && member) };
}

/* 台灣放假日（週一至週五的國定假日與補假；週六日另計）。
 * 來源：行政院人事行政總處「政府行政機關辦公日曆表」
 *   - 115 年（2026）：行政院 114 年 6 月 13 日院授人培字第 11430248312 號函，總放假日 120 日（104 個週末＋下列 16 日）。
 *   - 116 年（2027）：人事總處 115 年 5 月 21 日新聞稿 https://www.dgpa.gov.tw/information?uid=82&pid=12983 ，總放假日 121 日（104 個週末＋下列 17 日）。
 * 兩年都沒有週六補行上班日。⚠ 每年 6 月左右人事總處公告次年辦公日曆表後，請在這裡補上次年清單；
 * 清單外的年份只排除週六日（撥款日可能早於實際工作日，需人工確認）。 */
const TW_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-27',
  '2026-04-03', '2026-04-06', '2026-05-01', '2026-06-19', '2026-09-25', '2026-09-28', '2026-10-09',
  '2026-10-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-02-04', '2027-02-05', '2027-02-08', '2027-02-09', '2027-02-10', '2027-03-01',
  '2027-04-05', '2027-04-06', '2027-04-30', '2027-06-09', '2027-09-15', '2027-09-28', '2027-10-11',
  '2027-10-25', '2027-12-24', '2027-12-31',
]);
const HOLIDAY_YEARS = [2026, 2027];

const isInt = n => Number.isSafeInteger(n);

/** 場地費試算。fee_twd＝主辦人要付給言文字的金額；公開言文字售票由參加者每張票付 per_person_twd，主辦人付 0。 */
function quoteVenueFee({ venue, visibility, attendees, registration_mode } = {}) {
  const n = typeof attendees === 'string' && /^\d+$/.test(attendees) ? Number(attendees) : attendees;
  const base = { venue: venue || null, visibility: visibility || null, attendees: isInt(n) ? n : null,
    registration_mode: null, fee_twd: 0, per_person_twd: 0, overtime_per_hour_twd: 0, slot_hours: SLOT_HOURS, tier: null, payer: null, due: null };
  if (!['public', 'private'].includes(visibility)) return { ...base, error: '請選擇公開或包場活動。' };
  if (venue === '2F') return { ...base, error: REST_BOOK_HIRE };
  if (!MEMBER_VENUES.includes(venue)) return { ...base, error: '請選擇在咖啡／三點水餐飲空間或等等空間共享活動區。' };
  if (!isInt(n) || n < 1 || n > 10000) return { ...base, error: '預估人數必須是 1 至 10000 的整數。' };
  const flat = FLAT_VENUES[venue];
  if (flat && n > flat.max) return { ...base, error: flat.tooMany };
  const warning = venue === '3F' && n > CAPACITY_WARNING ? '等等空間共享活動區超過 60 人，需由言文字確認場地容量。' : undefined;
  if (visibility === 'public') {
    const mode = registration_mode === 'native' ? 'native' : 'external';
    const out = { ...base, registration_mode: mode, per_person_twd: PUBLIC_PER_PERSON_TWD, tier: 'public',
      // 言文字售票：每張票加一行場地茶飲費，參加者結帳時付；外部售票：審核通過後主辦人依預估人數先付。
      fee_twd: mode === 'native' ? 0 : PUBLIC_PER_PERSON_TWD * n,
      payer: mode === 'native' ? 'attendee' : 'organizer', due: mode === 'native' ? 'checkout' : 'approval' };
    return warning ? { ...out, warning } : out;
  }
  // 等等空間包場一律分區計價（STAY_ZONES，KK 11/04 核准）：未選區域不再套人數級距（KK 11/17）
  if (venue === '3F') return { ...base, error: STAY_ZONE_HIRE };
  let out;
  if (flat) out = { ...base, fee_twd: flat.fee, overtime_per_hour_twd: flat.overtime, tier: venue };
  else {
    const t = THIRD_FLOOR_TIERS.find(row => n <= row.max);
    out = { ...base, fee_twd: t.perPerson ? t.perPerson * n : t.fee, per_person_twd: t.perPerson || 0, overtime_per_hour_twd: t.overtime, tier: t.tier };
  }
  out = { ...out, registration_mode: 'closed', payer: 'organizer', due: 'submission' };
  return warning ? { ...out, warning } : out;
}

/** 會員活動（review_status 非 NULL）、公開、言文字售票 → 每張票加收場地茶飲費；平台自建活動不加收。 */
function attendeeVenueFeePerTicket(event) {
  return event && event.review_status != null && event.visibility === 'public' && event.registration_mode === 'native' ? PUBLIC_PER_PERSON_TWD : 0;
}

/** Date／ISO 字串／'YYYY-MM-DD' → 台北日期 'YYYY-MM-DD' */
function taipeiDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(+d)) throw new Error('日期格式不正確。');
  return new Date(+d + 8 * 3600e3).toISOString().slice(0, 10);
}
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
function isTaiwanBusinessDay(ymd) {
  const day = new Date(ymd + 'T00:00:00Z').getUTCDay();
  return day !== 0 && day !== 6 && !TW_HOLIDAYS.has(ymd);
}
/** 活動結束日隔天起算第 n 個工作日（隔天若是工作日即為第 1 個）。回 'YYYY-MM-DD'。 */
function taiwanBusinessDayAfter(endDate, n = PAYOUT_BUSINESS_DAYS) {
  if (!isInt(n) || n < 1) throw new Error('工作日數必須是正整數。');
  let d = taipeiDate(endDate), count = 0;
  while (count < n) { d = addDays(d, 1); if (isTaiwanBusinessDay(d)) count++; }
  return d;
}
/** 活動日（台北）與現在（台北）相差幾個日曆日；不含活動當日。活動當天＝0，已過去為負數。 */
function daysBefore(now, startsAt) {
  return Math.round((Date.parse(taipeiDate(startsAt) + 'T00:00:00Z') - Date.parse(taipeiDate(now) + 'T00:00:00Z')) / 86400e3);
}

/** 撥款＝（票價實收 − 已退票價）× 90%，無條件捨去到元。gross 若含場地茶飲費／稅金，帶 venueFees／taxes 先扣掉。 */
function settlementAmount({ gross = 0, refunded = 0, venueFees = 0, taxes = 0 } = {}) {
  const base = Math.max(0, gross - venueFees - taxes - refunded);
  return Math.floor(base * (1 - FEE_RATE) + 1e-9);
}

/** 包場活動場地費（或外部售票預付的茶飲費）取消退費比例：審核未通過／不可抗力全退；14 日前全退、8–13 日退 50%、7 日內不退。 */
function privateRefundRatio(days, { rejected = false, forceMajeure = false } = {}) {
  if (rejected || forceMajeure) return 1;
  if (!Number.isFinite(days)) return 0;
  if (days >= 14) return 1;
  if (days >= 8) return 0.5;
  return 0;
}
const privateRefundAmount = (fee, days, opts) => Math.round(fee * privateRefundRatio(days, opts));

/** 參加者自行退票：policy='accept' 且活動開始前 8 日（含）以前才可退；票價扣 10% 手續費，場地茶飲費全退。 */
function attendeeRefund({ ticketPrice = 0, venueFee = 0, daysBefore: days, policy = 'accept' } = {}) {
  if (policy === 'none') return { allowed: false, reason: 'policy', refund_twd: 0, fee_twd: 0 };
  if (!Number.isFinite(days) || days < ATTENDEE_REFUND_MIN_DAYS) return { allowed: false, reason: 'window', refund_twd: 0, fee_twd: 0 };
  const ticket = Math.max(0, ticketPrice), fee = Math.round(ticket * FEE_RATE);
  return { allowed: true, refund_twd: ticket - fee + Math.max(0, venueFee), fee_twd: fee };
}

/** 主辦人取消公開活動的手續費扣款：活動前 7 日內取消＝已售票款 10%；8 日前或不可抗力免收。 */
function hostCancellationCharge({ ticketGross = 0, daysBefore: days, forceMajeure = false } = {}) {
  if (forceMajeure || !Number.isFinite(days) || days >= HOST_CANCEL_FREE_MIN_DAYS) return 0;
  return Math.round(Math.max(0, ticketGross) * FEE_RATE);
}

module.exports = {
  PUBLIC_PER_PERSON_TWD, FEE_RATE, SLOT_HOURS, CAPACITY_WARNING, ATTENDEE_REFUND_MIN_DAYS, PAYOUT_BUSINESS_DAYS,
  MEMBER_VENUES, STAY_ZONE_HIRE, REST_BOOK_HIRE, STAY_ZONES, HIRE_ZONES, hireZone, zoneSlotHours, restBookHireError, ZONE_MAX_SLOTS, quoteZoneFee, THIRD_FLOOR_TIERS, FLAT_VENUES, TW_HOLIDAYS, HOLIDAY_YEARS,
  quoteVenueFee, attendeeVenueFeePerTicket, taipeiDate, isTaiwanBusinessDay, taiwanBusinessDayAfter, daysBefore,
  settlementAmount, privateRefundRatio, privateRefundAmount, attendeeRefund, hostCancellationCharge,
};
