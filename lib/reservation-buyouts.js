'use strict';
/* POS 訂位分頁顯示包場（KK 11/24）：品牌站線上付費包場＝event_applications（visibility='private'）。
 * 只列已通過或已付款待審核的；未付款、已婉拒的不列。品牌歸屬：zone 優先，舊資料依樓層（1F 依開始時間分在咖啡／三點水）。 */
const { hireZone } = require('./venue-fees');
const { reservationVenue } = require('./table-orders');

const tp = ms => new Date(ms + 8 * 3600e3).toISOString();
/** 台北營業日（03:00 前算前一天）與 HH:MM。 */
function taipeiParts(at) {
  const ms = Date.parse(at), iso = tp(ms), time = iso.slice(11, 16);
  const date = time < '03:00' ? tp(ms - 86400e3).slice(0, 10) : iso.slice(0, 10);
  return { date, time };
}
function buyoutVenue(a) {
  const zone = a.zone ? String(a.zone) : '';
  if (zone === 'CAFE' || zone === 'BAR') return zone;
  if (zone === 'LOUNGE') return 'REST';
  const z = zone && hireZone(zone);
  if (z) return z.venue === '2F' ? 'REST' : z.venue === '1F' ? reservationVenue(taipeiParts(a.starts_at).time) : 'STAY';
  if (a.venue === '1F') return reservationVenue(taipeiParts(a.starts_at).time);
  return a.venue === '2F' ? 'REST' : 'STAY';
}
const listable = a => a && a.visibility === 'private' && a.status !== 'rejected' && (a.status === 'approved' || !(Number(a.deposit_twd) > 0) || !!a.deposit_paid_at);
function buyoutView(a) {
  const s = taipeiParts(a.starts_at), e = taipeiParts(a.ends_at), z = a.zone && hireZone(a.zone);
  return {
    id: a.id, kind: 'buyout', venue: buyoutVenue(a), date: s.date, start: s.time, end: e.time,
    zone: a.zone || '', place: z ? (z.venue === '3F' ? '等等空間 ' + z.zh : z.zh) : '',
    title: a.title || '', org: a.community_name || '', contact: a.contact_name || '', phone: a.contact_phone || '', email: a.contact_email || '',
    attendees: Number(a.attendees) || 0, requirements: a.requirements || '',
    status: a.status === 'approved' ? 'approved' : 'pending', paid: !!a.deposit_paid_at, fee: Number(a.deposit_twd) || 0,
  };
}
/** rows＝event_applications 原始列；venues＝品牌 POS 可看的品牌（null＝全部）。依日期、開始時間排序。 */
function buyoutsFor(rows, venues) {
  return (rows || []).filter(listable).map(buyoutView).filter(b => !venues || venues.includes(b.venue))
    .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
}
module.exports = { buyoutsFor, buyoutView, buyoutVenue, taipeiParts };
