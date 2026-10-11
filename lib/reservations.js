'use strict';
/* 1F 訂位（/reserve）：固定 30 分鐘時段、店別由時段推得、送出即成立並保留 10 分鐘。
 * ponytail: 純函式、無 DB；排程釋位與後台列表要做時再擴。 */

const HOLD_MINUTES = 10;
const pad = n => String(n).padStart(2, '0');
const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

// 在咖啡 08:00–16:30、三點水 17:00–23:30 與 00:00–02:30（視為該日清晨）
const SLOTS = (() => {
  const out = new Map();
  const add = (from, to, brand) => { for (let m = from; m < to; m += 30) out.set(hhmm(m), brand); };
  add(8 * 60, 17 * 60, '在咖啡'); add(17 * 60, 24 * 60, '三點水'); add(0, 3 * 60, '三點水');
  return out;
})();

function taipeiNowParts(now = new Date()) {
  const o = {};
  for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, minutes: Number(o.hour === '24' ? 0 : o.hour) * 60 + Number(o.minute) };
}

const bad = message => Object.assign(new Error(message), { status: 400 });

function normalizeReservation(body = {}, now = new Date()) {
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const partySize = Number(body.party_size);
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const phone = String(body.phone || '').trim().replace(/\s+/g, ' ');
  const email = String(body.email || '').trim().toLowerCase();
  const note = String(body.note || '').trim().slice(0, 500);
  const source = String(body.source || '').trim().slice(0, 200);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('請選擇訂位日期。');
  const today = taipeiNowParts(now);
  const day = new Date(date + 'T00:00:00+08:00');
  if (!Number.isFinite(+day) || date < today.date) throw bad('訂位日期不能早於今天。');
  if (+day > +now + 120 * 86400e3) throw bad('目前僅接受 120 天內的訂位。');
  const period = SLOTS.get(time);
  if (!period) throw bad('請點選一個時段。');
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  if (date === today.date && minutes <= today.minutes + 30) throw bad('這個時段已經過了，請改選稍晚的時段或其他日期。');
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) throw bad('請選擇正確人數。');
  if (!name || name.length > 80) throw bad('請填寫姓名或稱呼。');
  if (!/^[0-9+()\-\s]{8,32}$/.test(phone)) throw bad('請填寫可聯繫的手機號碼。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw bad('請填寫正確的 Email，確認信會寄到這裡。');
  return { date, time, period, partySize, name, phone, email, note, source };
}

const holdUntil = time => hhmm((Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + HOLD_MINUTES) % 1440);

function staffMail(r, requestId, origin) {
  return `新訂位 ${requestId}（已成立）\n\n日期：${r.date}\n時間：${r.time}（${r.period}）\n人數：${r.partySize}\n姓名：${r.name}\n手機：${r.phone}\nEmail：${r.email}\n備註：${r.note || '—'}\n來源：${r.source || 'direct'}\n座位保留至：${holdUntil(r.time)}\n\n此信由 ${origin}/reserve 送出。`;
}

function guestMail(r, requestId) {
  return `${r.name} 您好，\n\n您的訂位已成立。\n\n訂位編號：${requestId}\n日期：${r.date}\n時間：${r.time}\n店別：${r.period}（1F）\n人數：${r.partySize} 位\n地點：台北市中正區重慶南路一段 11 號（台北車站 Z10 出口斜對面）\n地圖：https://maps.app.goo.gl/aFdoEB3RhweCqLbQ9\n\n座位保留至 ${holdUntil(r.time)}（預約時間後 ${HOLD_MINUTES} 分鐘），逾時將釋出給現場客人。若會遲到或需取消，請直接來電 +886-921-102-067。\n\n言文字｜台灣人才聚落`;
}

module.exports = { HOLD_MINUTES, SLOTS, taipeiNowParts, normalizeReservation, holdUntil, staffMail, guestMail };
