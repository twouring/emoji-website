// lib/venue-fees.js：場地費、手續費、撥款日、取消退費（規格 v2 §4.6–§4.8、§8 第 18–24 條）
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../lib/venue-fees.js');
const { taxPrice } = require('../lib/event-tickets.js');
const priv = (venue, attendees) => F.quoteVenueFee({ venue, visibility: 'private', attendees });

test('§8-20 私人活動：三樓級距、41 人以上每人 500、超時費對應級距', () => {
  assert.deepEqual([1, 10, 11, 20, 21, 25, 30, 31, 40].map(n => priv('3F', n).fee_twd),
    [5000, 5000, 10000, 10000, 15000, 15000, 15000, 20000, 20000]);
  assert.equal(priv('3F', 25).fee_twd, 15000, '25 人＝三樓 15,000');
  assert.equal(priv('3F', 41).fee_twd, 20500);
  assert.equal(priv('3F', 50).fee_twd, 25000);
  assert.deepEqual([5, 15, 25, 35, 45].map(n => priv('3F', n).overtime_per_hour_twd), [2000, 3000, 4000, 5000, 6000]);
  assert.equal(priv('3F', 41).per_person_twd, 500);
  assert.equal(priv('3F', 25).slot_hours, 2);
  assert.equal(priv('3F', 25).payer, 'organizer');
});

test('§8-20 三樓不設硬上限：61 人出現容量提示但可送出；60 人不提示', () => {
  const q = priv('3F', 61);
  assert.equal(q.error, undefined);
  assert.equal(q.fee_twd, 30500);
  assert.match(q.warning, /60 人/);
  assert.equal(priv('3F', 60).warning, undefined);
});

test('§8-20 二樓至多 10 人（11 人不能送出）；一樓至多 50 人（51 人不能送出）', () => {
  assert.equal(priv('2F', 10).fee_twd, 10000);
  assert.equal(priv('2F', 10).overtime_per_hour_twd, 3000);
  assert.match(priv('2F', 11).error, /等等空間共享活動區/);
  assert.equal(priv('1F', 50).fee_twd, 30000);
  assert.equal(priv('1F', 1).fee_twd, 30000);
  assert.equal(priv('1F', 50).overtime_per_hour_twd, 10000);
  assert.ok(priv('1F', 51).error);
  // 公開活動同樣受空間人數上限限制
  assert.ok(F.quoteVenueFee({ venue: '2F', visibility: 'public', attendees: 11, registration_mode: 'native' }).error);
});

test('四樓與不合法輸入一律回錯誤', () => {
  for (const input of [{ venue: '4F', visibility: 'private', attendees: 5 }, { venue: '3F', visibility: 'secret', attendees: 5 },
    { venue: '3F', visibility: 'private', attendees: 0 }, { venue: '3F', visibility: 'private', attendees: 1.5 },
    { venue: '3F', visibility: 'private', attendees: '1e2' }, { venue: '3F', visibility: 'private', attendees: 10001 }, {}, undefined])
    assert.ok(F.quoteVenueFee(input).error, JSON.stringify(input));
  assert.equal(F.quoteVenueFee({ venue: '3F', visibility: 'private', attendees: '25' }).fee_twd, 15000, '查詢字串數字可接受');
});

test('公開活動：言文字售票由參加者每張付 150；外部售票主辦人審核通過後付 150×預估人數', () => {
  const native = F.quoteVenueFee({ venue: '3F', visibility: 'public', attendees: 30, registration_mode: 'native' });
  assert.deepEqual([native.fee_twd, native.per_person_twd, native.payer, native.due], [0, 150, 'attendee', 'checkout']);
  const external = F.quoteVenueFee({ venue: '3F', visibility: 'public', attendees: 30, registration_mode: 'external' });
  assert.deepEqual([external.fee_twd, external.payer, external.due], [4500, 'organizer', 'approval']);
  assert.equal(F.quoteVenueFee({ venue: '1F', visibility: 'public', attendees: 20 }).registration_mode, 'external', '未指定視為外部');
});

test('§8-18 票價 300 的公開言文字售票活動：參加者結帳 450、明細兩行；平台自建活動不加收', () => {
  const member = { review_status: 'approved', visibility: 'public', registration_mode: 'native' };
  const fee = F.attendeeVenueFeePerTicket(member);
  assert.equal(fee, 150);
  assert.equal(300 + fee, 450);
  assert.equal(F.attendeeVenueFeePerTicket({ ...member, review_status: null }), 0, '平台自建（review_status NULL）');
  assert.equal(F.attendeeVenueFeePerTicket({ ...member, registration_mode: 'external' }), 0);
  assert.equal(F.attendeeVenueFeePerTicket({ ...member, visibility: 'members' }), 0);
  assert.equal(F.attendeeVenueFeePerTicket(null), 0);
  // 稅金只算在票價上，不含茶飲費
  assert.equal(taxPrice({ enabled: true, name: '稅', rate_bps: 500 }, 300).price + fee, 465);
});

test('§8-19 撥款日：活動結束日隔天起算第 10 個工作日，跨國定假日', () => {
  // 2026-10-22（四）結束：10/23 起算，10/24-25 週末、10/26 光復節補假 → 第 10 個工作日是 11/6（五）
  assert.equal(F.taiwanBusinessDayAfter('2026-10-22'), '2026-11-06');
  // 沒有假日的對照：2026-11-02（一）結束 → 11/16（一）
  assert.equal(F.taiwanBusinessDayAfter('2026-11-02'), '2026-11-16');
  // 跨春節：2026-02-12（四）結束 → 2/13、2/23-27 中 2/27 和平紀念日補假、3/2-… → 3/6
  assert.equal(F.taiwanBusinessDayAfter('2026-02-12'), '2026-03-06');
  // 跨年與 2027 春節：2027-02-01（一）結束 → 2/2、2/3、2/11、2/12、2/15-19、2/22 → 2/22
  assert.equal(F.taiwanBusinessDayAfter('2027-02-01'), '2027-02-22');
  // 台北時區：UTC 2026-10-22T17:00Z＝台北 10/23 凌晨，以台北日期計
  assert.equal(F.taiwanBusinessDayAfter(new Date('2026-10-22T17:00:00Z')), F.taiwanBusinessDayAfter('2026-10-23'));
  assert.equal(F.taiwanBusinessDayAfter('2026-10-22', 1), '2026-10-23');
  assert.equal(F.isTaiwanBusinessDay('2026-10-26'), false);
  assert.equal(F.isTaiwanBusinessDay('2026-10-24'), false);
  assert.equal(F.isTaiwanBusinessDay('2026-10-27'), true);
  assert.throws(() => F.taiwanBusinessDayAfter('2026-10-22', 0));
});

test('假日清單與人事總處公告的總放假日數一致（2026＝120、2027＝121）', () => {
  for (const [year, total] of [[2026, 120], [2027, 121]]) {
    let off = 0;
    for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86400e3)
      if (!F.isTaiwanBusinessDay(new Date(t).toISOString().slice(0, 10))) off++;
    assert.equal(off, total, String(year));
  }
  for (const d of F.TW_HOLIDAYS) assert.ok(![0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay()), d + ' 不該是週末');
});

test('§8-19 撥款金額＝（票價實收－已退款）×90%，不含場地茶飲費與稅金', () => {
  assert.equal(F.settlementAmount({ gross: 3000, refunded: 0 }), 2700);
  assert.equal(F.settlementAmount({ gross: 3000, refunded: 300 }), 2430);
  assert.equal(F.settlementAmount({ gross: 4500, venueFees: 1500, refunded: 0 }), 2700, '450×10 張扣掉茶飲費');
  assert.equal(F.settlementAmount({ gross: 3150, taxes: 150 }), 2700);
  assert.equal(F.settlementAmount({ gross: 333 }), 299, '無條件捨去到元');
  assert.equal(F.settlementAmount({ gross: 100, refunded: 200 }), 0);
});

test('§8-22 參加者退票：活動前 9 日退 300＋150 退 420；前 8 日可退；前 7 日不可退；不接受退票不可退', () => {
  assert.deepEqual(F.attendeeRefund({ ticketPrice: 300, venueFee: 150, daysBefore: 9 }), { allowed: true, refund_twd: 420, fee_twd: 30 });
  assert.equal(F.attendeeRefund({ ticketPrice: 300, venueFee: 150, daysBefore: 8 }).allowed, true);
  assert.deepEqual(F.attendeeRefund({ ticketPrice: 300, venueFee: 150, daysBefore: 7 }), { allowed: false, reason: 'window', refund_twd: 0, fee_twd: 0 });
  assert.equal(F.attendeeRefund({ ticketPrice: 300, venueFee: 150, daysBefore: 30, policy: 'none' }).allowed, false);
  assert.equal(F.attendeeRefund({ ticketPrice: 0, venueFee: 150, daysBefore: 10 }).refund_twd, 150, '免費票只退茶飲費');
});

test('§8-24 私人場地費取消：14 日前全退、10 日前退 50%、7 日內不退；未通過與不可抗力全退', () => {
  assert.deepEqual([30, 14, 13, 10, 8, 7, 0].map(d => F.privateRefundRatio(d)), [1, 1, 0.5, 0.5, 0.5, 0, 0]);
  assert.equal(F.privateRefundAmount(15000, 10), 7500);
  assert.equal(F.privateRefundAmount(15000, 14), 15000);
  assert.equal(F.privateRefundAmount(15000, 3), 0);
  assert.equal(F.privateRefundRatio(3, { rejected: true }), 1);
  assert.equal(F.privateRefundRatio(3, { forceMajeure: true }), 1);
});

test('§8-23 主辦人活動前 5 日取消：手續費扣款＝已售票款 10%；8 日前免收；不可抗力免收', () => {
  assert.equal(F.hostCancellationCharge({ ticketGross: 3000, daysBefore: 5 }), 300);
  assert.equal(F.hostCancellationCharge({ ticketGross: 3000, daysBefore: 7 }), 300);
  assert.equal(F.hostCancellationCharge({ ticketGross: 3000, daysBefore: 8 }), 0);
  assert.equal(F.hostCancellationCharge({ ticketGross: 3000, daysBefore: 5, forceMajeure: true }), 0);
});

test('daysBefore 以台北日曆日計算、不含活動當日', () => {
  assert.equal(F.daysBefore('2026-10-22T09:00:00+08:00', '2026-10-31T19:00:00+08:00'), 9);
  assert.equal(F.daysBefore('2026-10-22T23:30:00+08:00', '2026-10-23T00:30:00+08:00'), 1);
  assert.equal(F.daysBefore('2026-10-22T09:00:00+08:00', '2026-10-22T19:00:00+08:00'), 0);
  assert.equal(F.daysBefore(new Date('2026-10-22T16:30:00Z'), '2026-10-31T19:00:00+08:00'), 8, 'UTC 16:30＝台北隔日 00:30');
});

test('一樓包場關閉訂位：活動時段以台北 30 分鐘格從可訂位清單移除，凌晨歸前一天、其他日期不受影響', () => {
  const hours = require('../lib/reservation-hours.js');
  const { cfg, closed } = hours.closeRange({}, '2026-11-01T19:10:00+08:00', '2026-11-02T01:00:00+08:00');
  assert.deepEqual(closed['2026-11-01'], ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30', '00:00', '00:30']);
  assert.equal(hours.isOpen(cfg, '2026-11-01', '18:30'), true);
  assert.equal(hours.isOpen(cfg, '2026-11-01', '20:00'), false);
  assert.equal(hours.isOpen(cfg, '2026-11-01', '01:00'), true);
  assert.equal(hours.isOpen(cfg, '2026-11-02', '20:00'), true);
  // 已關閉的時段不重複列出；既有每週設定被尊重
  const again = hours.closeRange(cfg, '2026-11-01T20:00:00+08:00', '2026-11-01T21:00:00+08:00');
  assert.deepEqual(again.closed, {});
  assert.deepEqual(hours.closeRange({}, 'bad', 'bad').closed, {});
});
