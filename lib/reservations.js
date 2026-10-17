'use strict';
/* at cafe / 3AM 訂位（/reserve、/en/reserve、/ja/reserve）：固定 30 分鐘時段、店別由時段推得、送出即成立並保留 10 分鐘。
 * 三語：錯誤訊息與客人確認信依 body.lang（zh｜en｜ja）；店家通知信一律中文。
 * ponytail: 純函式、無 DB；排程釋位與後台列表要做時再擴。 */

const HOLD_MINUTES = 10;
const LANGS = ['zh', 'en', 'ja'];
const PHONE_DISPLAY = '+886-921-102-067';
const MAP_URL = 'https://maps.app.goo.gl/aFdoEB3RhweCqLbQ9';
const pad = n => String(n).padStart(2, '0');
const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

// 在咖啡 08:00–16:30、三點水 17:00–23:30 與 00:00–02:30（視為該日清晨）
const SLOTS = (() => {
  const out = new Map();
  const add = (from, to, brand) => { for (let m = from; m < to; m += 30) out.set(hhmm(m), brand); };
  add(8 * 60, 17 * 60, '在咖啡'); add(17 * 60, 24 * 60, '三點水'); add(0, 3 * 60, '三點水');
  return out;
})();

const MESSAGES = {
  zh: {
    date: '請選擇訂位日期。', pastDate: '訂位日期不能早於今天。', range: '目前僅接受 120 天內的訂位。',
    slot: '請點選一個時段。', pastSlot: '這個時段已經過了，請改選稍晚的時段或其他日期。',
    party: '請選擇正確人數。', name: '請填寫姓名或稱呼。', phone: '請填寫可聯繫的手機號碼。',
    email: '請填寫正確的 Email，確認信會寄到這裡。',
    closed: '這個時段目前不開放訂位，請改選其他時段或日期。',
  },
  en: {
    date: 'Please choose a date.', pastDate: 'The date cannot be in the past.', range: 'We take bookings up to 120 days ahead.',
    slot: 'Please choose a time slot.', pastSlot: 'That slot has already passed. Please pick a later slot or another day.',
    party: 'Please choose the number of guests.', name: 'Please enter your name.', phone: 'Please enter a phone number we can reach you on.',
    email: 'Please enter a valid email. Your confirmation goes there.',
    closed: 'Bookings are not open for that slot. Please pick another slot or day.',
  },
  ja: {
    date: '日付を選んでください。', pastDate: '過去の日付は選べません。', range: 'ご予約は120日先まで受け付けています。',
    slot: '時間枠を選んでください。', pastSlot: 'その枠は終了しています。別の枠か別の日をお選びください。',
    party: '人数を選んでください。', name: 'お名前を入力してください。', phone: '連絡のつく電話番号を入力してください。',
    email: '確認メールをお送りするため、正しいメールアドレスを入力してください。',
    closed: 'その枠は現在ご予約を受け付けていません。別の枠か別の日をお選びください。',
  },
};

const VENUE = {
  zh: { '在咖啡': '在咖啡 at cafe', '三點水': '三點水 3AM' },
  en: { '在咖啡': 'at cafe (café)', '三點水': '3AM (bistro)' },
  ja: { '在咖啡': '在咖啡 at cafe（カフェ）', '三點水': '三點水 3AM（ビストロ）' },
};
const ADDRESS = {
  zh: '台北市中正區重慶南路一段 11 號（台北車站 Z10 出口斜對面）',
  en: 'No. 11, Sec. 1, Chongqing S. Rd., Zhongzheng Dist., Taipei (diagonally across from Taipei Main Station underground mall Exit Z10)',
  ja: '台北市中正区重慶南路一段11号（台北駅地下街 Z10 出口の斜め向かい）',
};

function taipeiNowParts(now = new Date()) {
  const o = {};
  for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, minutes: Number(o.hour === '24' ? 0 : o.hour) * 60 + Number(o.minute) };
}

const pickLang = value => { const l = String(value || '').toLowerCase().slice(0, 2); return LANGS.includes(l) ? l : 'zh'; };

/* staff:true＝櫃檯替客人登記（電話訂位）：Email 可留空、不擋「30 分鐘內的時段」（客人剛打來說馬上到也能登） */
/* staff：櫃檯登記（Email 可空、不擋 30 分鐘內）；member：會員 App 訂位（已登入，Email 可空、其餘同客人端） */
function normalizeReservation(body = {}, now = new Date(), { staff = false, member = false, hours = null } = {}) {
  const lang = pickLang(body.lang);
  const t = MESSAGES[lang];
  const bad = key => Object.assign(new Error(t[key]), { status: 400, code: key });
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const partySize = Number(body.party_size);
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const phone = String(body.phone || '').trim().replace(/\s+/g, ' ');
  const email = String(body.email || '').trim().toLowerCase();
  const note = String(body.note || '').trim().slice(0, 500);
  const source = String(body.source || '').trim().slice(0, 200);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('date');
  const today = taipeiNowParts(now);
  const day = new Date(date + 'T00:00:00+08:00');
  if (!Number.isFinite(+day) || date < today.date) throw bad('pastDate');
  if (+day > +now + 120 * 86400e3) throw bad('range');
  const period = SLOTS.get(time);
  if (!period) throw bad('slot');
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  if (date === today.date && minutes <= today.minutes + 30 && !staff) throw bad('pastSlot');
  if (!staff && hours && !require('./reservation-hours').isOpen(hours, date, time)) throw bad('closed');
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) throw bad('party');
  if (!name || name.length > 80) throw bad('name');
  if (!/^[0-9+()\-\s]{8,32}$/.test(phone)) throw bad('phone');
  if (!((staff || member) && !email) && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw bad('email');
  return { date, time, period, partySize, name, phone, email, note, source, lang };
}

const holdUntil = time => hhmm((Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + HOLD_MINUTES) % 1440);

function staffMail(r, requestId, origin) {
  return `新訂位 ${requestId}（已成立）\n\n日期：${r.date}\n時間：${r.time}（${r.period}）\n人數：${r.partySize}\n姓名：${r.name}\n手機：${r.phone}\nEmail：${r.email}\n語言：${r.lang || 'zh'}\n備註：${r.note || '—'}\n來源：${r.source || 'direct'}\n座位保留至：${holdUntil(r.time)}\n\n此信由 ${origin}/reserve 送出。`;
}

function guestSubject(r) {
  const lang = pickLang(r.lang);
  if (lang === 'en') return `[emoji] Booking confirmed ${r.date} ${r.time} · ${r.partySize} guest${r.partySize === 1 ? '' : 's'}`;
  if (lang === 'ja') return `[言文字] ご予約確認 ${r.date} ${r.time}｜${r.partySize}名`;
  return `[言文字] 訂位確認 ${r.date} ${r.time}｜${r.partySize} 位`;
}

function guestMail(r, requestId) {
  const lang = pickLang(r.lang);
  const venue = VENUE[lang][r.period] || r.period;
  const hold = holdUntil(r.time);
  if (lang === 'en') {
    return `Hi ${r.name},\n\nYour table is booked.\n\nBooking no.: ${requestId}\nDate: ${r.date}\nTime: ${r.time}\nVenue: ${venue} — 言文字 Taiwan Talent Hub\nGuests: ${r.partySize}\nAddress: ${ADDRESS.en}\nMap: ${MAP_URL}\n\nWe hold your table until ${hold} (${HOLD_MINUTES} minutes after your booking time); after that it may be released to walk-in guests. Running late or need to cancel? Call ${PHONE_DISPLAY}.\n\n言文字｜Taiwan Talent Hub`;
  }
  if (lang === 'ja') {
    return `${r.name} 様\n\nご予約が確定しました。\n\n予約番号：${requestId}\n日付：${r.date}\n時間：${r.time}\n店舗：${venue}｜言文字 台湾タレントハブ\n人数：${r.partySize}名\n住所：${ADDRESS.ja}\n地図：${MAP_URL}\n\nお席は ${hold}（予約時間の${HOLD_MINUTES}分後）まで確保します。それ以降は当日のお客様にご案内する場合があります。遅れる場合やキャンセルは ${PHONE_DISPLAY} までお電話ください。\n\n言文字｜台湾タレントハブ`;
  }
  return `${r.name} 您好，\n\n您的訂位已成立。\n\n訂位編號：${requestId}\n日期：${r.date}\n時間：${r.time}\n店別：${venue}\n人數：${r.partySize} 位\n地點：${ADDRESS.zh}\n地圖：${MAP_URL}\n\n座位保留至 ${hold}（預約時間後 ${HOLD_MINUTES} 分鐘），逾時將釋出給現場客人。若會遲到或需取消，請直接來電 ${PHONE_DISPLAY}。\n\n言文字｜台灣人才聚落`;
}

/* 訂位編號：MMDD-NN（台北時間的當天第 NN 筆），舊編號 R261015-51FC 不動 */
function requestIdPrefix(now = new Date()) {
  const p = new Date(now.getTime() + 8 * 3600000).toISOString();
  return p.slice(5, 7) + p.slice(8, 10);
}
function requestId(now, seq) {
  return requestIdPrefix(now) + '-' + String(Math.max(1, Number(seq) || 1)).padStart(2, '0');
}

module.exports = { requestIdPrefix, requestId, HOLD_MINUTES, LANGS, SLOTS, MESSAGES, taipeiNowParts, pickLang, normalizeReservation, holdUntil, staffMail, guestSubject, guestMail };
