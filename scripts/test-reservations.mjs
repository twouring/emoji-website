import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const reservations = require(path.join(root, 'lib/reservations.js'));
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/reserve.html'), 'utf8');
const htmlEn = fs.readFileSync(path.join(root, 'public/en/reserve.html'), 'utf8');
const htmlJa = fs.readFileSync(path.join(root, 'public/ja/reserve.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/reserve.js'), 'utf8');

test('reservation page is mobile-first: tap-only slots and party size, no free-text time', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.emoji\.tw\/reserve">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/);
  assert.match(html, /<form id="reserveForm"/);
  assert.match(html, /name="date" type="date"/);
  assert.match(html, /id="slotGroups" role="radiogroup"/);
  assert.doesNotMatch(html, /type="time"/, '時段改為點選，不再有時間輸入框');
  assert.doesNotMatch(html, /<select name="party_size"/, '人數改為點選，不再用下拉');
  for (const n of [1, 2, 3, 4, 5, 6]) assert.match(html, new RegExp(`<input type="radio" name="party_size" value="${n}" required>`));
  assert.match(html, /name="phone" type="tel" inputmode="tel" autocomplete="tel"/);
  assert.match(html, /name="email" type="email"/);
  assert.match(html, /保留至預約時間後 10 分鐘/);
  assert.doesNotMatch(html, /訂位申請/, '送出即成立訂位，不再稱申請');
  // 消費者視角：不放店家內部資訊與重複說明
  assert.doesNotMatch(html, /RESERVATION|at cafe|3AM/, '不放英文內部標籤');
  assert.doesNotMatch(html, /class="(notice|lead|quick|fine)"/, '表單前後不放長段說明');
  assert.doesNotMatch(html, /class="required"/, '全部必填就不標星號，只標「備註（選填）」');
  assert.match(html, /備註（選填）/);
  assert.doesNotMatch(html, /身分證|信用卡|回官網首頁|再訂一筆/);
});

test('reservation page ships in all three site locales with hreflang and the same form', () => {
  const pages = [
    ['zh', html, 'zh-Hant', 'https://www.emoji.tw/reserve', /線上訂位/],
    ['en', htmlEn, 'en', 'https://www.emoji.tw/en/reserve', /Book a table/],
    ['ja', htmlJa, 'ja', 'https://www.emoji.tw/ja/reserve', /オンライン予約/],
  ];
  for (const [lang, page, htmlLang, canonical, h1] of pages) {
    assert.match(page, new RegExp(`<html lang="${htmlLang}">`), lang);
    assert.ok(page.includes(`<link rel="canonical" href="${canonical}">`), `${lang} canonical`);
    assert.match(page, /hreflang="zh-Hant" href="https:\/\/www\.emoji\.tw\/reserve"/, lang);
    assert.match(page, /hreflang="en" href="https:\/\/www\.emoji\.tw\/en\/reserve"/, lang);
    assert.match(page, /hreflang="ja" href="https:\/\/www\.emoji\.tw\/ja\/reserve"/, lang);
    assert.match(page, /hreflang="x-default" href="https:\/\/www\.emoji\.tw\/reserve"/, lang);
    assert.match(page, h1, lang);
    assert.match(page, /<!--SITE_HEADER-->/, lang);
    assert.match(page, /<script defer src="\/reserve\.js"><\/script>/, lang);
    assert.equal((page.match(/name="party_size"/g) || []).length, 6, `${lang} party chips`);
    assert.match(page, /tel:\+886921102067/, lang);
  }
  // 英文頁：表單與成功畫面不殘留中文 UI 文案（品牌名除外）
  const enBody = htmlEn.replace(/<head>[\s\S]*?<\/head>/, '');
  const leftovers = (enBody.match(/[\u4e00-\u9fff]+/g) || []).filter(w => !/^(在咖啡|三點水|言文字)$/.test(w));
  assert.deepEqual(leftovers, [], 'en page must not leak Chinese UI copy');
  assert.match(htmlEn, /placeholder="\+886 912 345 678"/, '外國人手機欄位提示國碼');
  assert.match(htmlJa, /placeholder="\+81 90 1234 5678"/);
  assert.match(htmlEn, /For 7 or more, please call/);
  assert.match(htmlJa, /7名以上はお電話で/);
  // 只有中文入口頁依瀏覽器語言自動導向；站內連過來或本次已導過不再跳
  assert.match(html, /location\.pathname!=='\/reserve'/);
  assert.match(html, /document\.referrer\.indexOf\(location\.origin\+'\/'\)===0\)return/);
  assert.match(html, /sessionStorage\.getItem\('reserve_lang_auto'\)/);
  assert.match(html, /\/\^ja\/\.test\(l\)\?'\/ja\/reserve':\(l&&!\/\^zh\/\.test\(l\)\?'\/en\/reserve':''\)/);
  assert.match(html, /location\.replace\(to\+location\.search\+location\.hash\)/, '保留 utm 參數');
  assert.doesNotMatch(htmlEn, /reserve_lang_auto/);
  assert.doesNotMatch(htmlJa, /reserve_lang_auto/);
  // 實際執行導向腳本：模擬各種瀏覽器語言與來源
  const redirectScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('reserve_lang_auto'));
  assert.ok(redirectScript, 'inline redirect script present');
  const run = ({ languages, language, referrer = '', path = '/reserve', stored = null, search = '', hash = '' }) => {
    const store = new Map(stored ? [['reserve_lang_auto', stored]] : []);
    const replaced = [];
    vm.runInNewContext(redirectScript, {
      location: { pathname: path, origin: 'https://www.emoji.tw', search, hash, replace: to => replaced.push(to) },
      document: { referrer },
      navigator: { languages, language },
      sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    });
    return replaced[0] || null;
  };
  assert.equal(run({ languages: ['en-US', 'en'], language: 'en-US' }), '/en/reserve', '英文瀏覽器直接開 → 英文頁');
  assert.equal(run({ languages: ['ja-JP'], language: 'ja-JP' }), '/ja/reserve', '日文瀏覽器 → 日文頁');
  assert.equal(run({ languages: ['fr-FR'], language: 'fr-FR' }), '/en/reserve', '其他外語 → 英文頁');
  assert.equal(run({ languages: ['zh-TW', 'en'], language: 'zh-TW' }), null, '中文瀏覽器不跳');
  assert.equal(run({ languages: ['zh-Hant-TW'], language: 'zh-Hant-TW' }), null);
  assert.equal(run({ languages: undefined, language: '' }), null, '沒語言資訊不跳');
  assert.equal(run({ languages: ['en-US'], language: 'en-US', referrer: 'https://www.emoji.tw/about' }), null, '站內連過來不跳（使用者自己選的語系）');
  assert.equal(run({ languages: ['en-US'], language: 'en-US', referrer: 'https://www.google.com/maps' }), '/en/reserve', 'Google Maps 來的照跳');
  assert.equal(run({ languages: ['en-US'], language: 'en-US', stored: '1' }), null, '本次已導過（例如手動切回中文）不再跳');
  assert.equal(run({ languages: ['en-US'], language: 'en-US', search: '?utm_source=line', hash: '#x' }), '/en/reserve?utm_source=line#x', '保留查詢參數');
  assert.equal(run({ languages: ['en-US'], language: 'en-US', path: '/en/reserve' }), null, '只在中文入口頁作用');
  assert.match(fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8'), /https:\/\/www\.emoji\.tw\/en\/reserve[\s\S]*https:\/\/www\.emoji\.tw\/ja\/reserve/);
});

test('reservation frontend follows <html lang>, renders 30-minute slots per brand and posts JSON safely', () => {
  assert.match(js, /document\.documentElement\.lang/);
  assert.match(js, /zh:\{cafe:'在咖啡',bar:'三點水'/);
  assert.match(js, /en:\{cafe:'at cafe',bar:'3AM'/);
  assert.match(js, /ja:\{cafe:'在咖啡 at cafe',bar:'三點水 3AM'/);
  assert.match(js, /lang:LANG/, '送出帶 lang 讓後端回同語言錯誤與確認信');
  assert.match(js, /slots\(8\*60,17\*60\)/);
  assert.match(js, /slots\(17\*60,24\*60\)\.concat\(slots\(0,3\*60\)\)/);
  assert.match(js, /timeZone:'Asia\/Taipei'/);
  assert.match(js, /input\.disabled=true/, '今天已過的時段要鎖住');
  assert.match(js, /fetch\('\/api\/reservations'/);
  assert.match(js, /method:'POST'/);
  assert.match(js, /email:val\('email'\)/);
  assert.match(js, /HOLD_MINUTES=10/);
  assert.match(js, /summary\.textContent=''/);
  assert.match(js, /document\.createTextNode/);
  assert.doesNotMatch(js, /innerHTML/);
});

test('reservation API confirms immediately, stores email and lang, mails guest in their language', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS dining_reservations/);
  assert.match(server, /email TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /lang TEXT NOT NULL DEFAULT 'zh'/);
  assert.match(server, /ALTER TABLE dining_reservations ADD COLUMN IF NOT EXISTS email/);
  assert.match(server, /ALTER TABLE dining_reservations ADD COLUMN IF NOT EXISTS lang/);
  assert.match(server, /CREATE INDEX IF NOT EXISTS dining_reservations_date_idx/);
  assert.match(server, /app\.post\('\/api\/reservations', rateLimit\(\{ max: 30, windowMs: 3600000 \}\), requireDb, wrap/);
  assert.match(server, /reservations\.normalizeReservation\(req\.body\)/);
  assert.match(server, /r\.email, r\.lang, r\.note, r\.source, 'confirmed'\]/);
  assert.match(server, /sendMailQuietly\(\{ to: r\.email, subject: reservations\.guestSubject\(r\), text: reservations\.guestMail\(r, requestId\)/);
  assert.match(server, /sendMailQuietly\(\{ to: NOTIFY_EMAIL, subject: `\[訂位\]/);
  assert.match(server, /hold_until: reservations\.holdUntil\(r\.time\), hold_minutes: reservations\.HOLD_MINUTES/);
});

test('reservation slots: fixed 30-minute grid, brand derived from time, past slots rejected', () => {
  const { SLOTS, normalizeReservation, holdUntil, HOLD_MINUTES } = reservations;
  assert.equal(HOLD_MINUTES, 10);
  assert.equal(SLOTS.size, 18 + 14 + 6);
  assert.equal(SLOTS.get('08:00'), '在咖啡');
  assert.equal(SLOTS.get('16:30'), '在咖啡');
  assert.equal(SLOTS.get('17:00'), '三點水');
  assert.equal(SLOTS.get('23:30'), '三點水');
  assert.equal(SLOTS.get('02:30'), '三點水');
  assert.equal(SLOTS.get('03:00'), undefined);
  assert.equal(SLOTS.get('07:30'), undefined);
  assert.equal(holdUntil('19:00'), '19:10');
  assert.equal(holdUntil('23:30'), '23:40');
  assert.equal(holdUntil('02:30'), '02:40');

  const now = new Date('2026-10-11T12:00:00+08:00');
  const base = { date: '2026-10-12', time: '19:00', party_size: 2, name: '王小姐', phone: '0912-345-678', email: 'Guest@Example.com' };
  const ok = normalizeReservation(base, now);
  assert.equal(ok.period, '三點水');
  assert.equal(ok.email, 'guest@example.com');
  assert.equal(ok.lang, 'zh', '未帶 lang 預設中文');
  assert.throws(() => normalizeReservation({ ...base, time: '19:15' }, now), /時段/);
  assert.throws(() => normalizeReservation({ ...base, time: '07:30' }, now), /時段/);
  assert.throws(() => normalizeReservation({ ...base, date: '2026-10-11', time: '12:00' }, now), /已經過了/);
  assert.throws(() => normalizeReservation({ ...base, date: '2026-10-11', time: '12:30' }, now), /已經過了/);
  assert.equal(normalizeReservation({ ...base, date: '2026-10-11', time: '13:00' }, now).period, '在咖啡');
  assert.throws(() => normalizeReservation({ ...base, date: '2026-10-10' }, now), /早於今天/);
  assert.throws(() => normalizeReservation({ ...base, date: '2027-03-01' }, now), /120 天/);
  assert.throws(() => normalizeReservation({ ...base, email: 'nope' }, now), /Email/);
  assert.throws(() => normalizeReservation({ ...base, party_size: 0 }, now), /人數/);
  assert.throws(() => normalizeReservation({ ...base, party_size: 51 }, now), /人數/);
  assert.throws(() => normalizeReservation({ ...base, phone: '123' }, now), /手機/);
});

test('reservation errors and guest confirmation follow the visitor language; staff mail stays Chinese', () => {
  const { normalizeReservation, guestMail, guestSubject, staffMail, pickLang, MESSAGES } = reservations;
  assert.equal(pickLang('en-US'), 'en');
  assert.equal(pickLang('ja'), 'ja');
  assert.equal(pickLang('zh-Hant'), 'zh');
  assert.equal(pickLang('fr'), 'zh', '未支援語言退回中文');
  for (const lang of ['zh', 'en', 'ja']) assert.deepEqual(Object.keys(MESSAGES[lang]).sort(), Object.keys(MESSAGES.zh).sort(), `${lang} message keys`);

  const now = new Date('2026-10-11T12:00:00+08:00');
  const base = { date: '2026-10-12', time: '19:00', party_size: 2, name: 'Alex', phone: '+44 7700 900123', email: 'alex@example.com' };
  assert.throws(() => normalizeReservation({ ...base, lang: 'en', time: '19:15' }, now), /Please choose a time slot/);
  assert.throws(() => normalizeReservation({ ...base, lang: 'en', email: 'nope' }, now), /valid email/);
  assert.throws(() => normalizeReservation({ ...base, lang: 'ja', time: '19:15' }, now), /時間枠を選んでください/);
  assert.throws(() => normalizeReservation({ ...base, lang: 'ja', date: '2026-10-11', time: '12:00' }, now), /その枠は終了しています/);
  assert.equal(normalizeReservation({ ...base, lang: 'en' }, now).phone, '+44 7700 900123', '國際電話格式可通過');

  const en = normalizeReservation({ ...base, lang: 'en' }, now);
  const enMail = guestMail(en, 'R261011-AB12');
  assert.match(guestSubject(en), /^\[emoji\] Booking confirmed 2026-10-12 19:00 · 2 guests$/);
  assert.match(enMail, /Your table is booked/);
  assert.match(enMail, /3AM \(bar\), 1F/);
  assert.match(enMail, /Chongqing S\. Rd\./);
  assert.match(enMail, /until 19:10 \(10 minutes after your booking time\)/);
  assert.match(enMail, /R261011-AB12/);
  assert.doesNotMatch(enMail.replace(/言文字/g, ''), /[\u4e00-\u9fff]/, 'English mail must not contain Chinese copy');

  const ja = normalizeReservation({ ...base, lang: 'ja', time: '10:00' }, now);
  assert.match(guestSubject(ja), /ご予約確認 2026-10-12 10:00｜2名/);
  const jaMail = guestMail(ja, 'R261011-AB12');
  assert.match(jaMail, /ご予約が確定しました/);
  assert.match(jaMail, /在咖啡 at cafe（カフェ・1F）/);
  assert.match(jaMail, /10:10（予約時間の10分後）/);

  const zh = normalizeReservation({ ...base, lang: 'zh' }, now);
  assert.match(guestSubject(zh), /訂位確認 2026-10-12 19:00｜2 位/);
  assert.match(guestMail(zh, 'R1'), /座位保留至 19:10（預約時間後 10 分鐘）/);

  const staff = staffMail(en, 'R261011-AB12', 'https://www.emoji.tw');
  assert.match(staff, /新訂位 R261011-AB12（已成立）/);
  assert.match(staff, /語言：en/);
  assert.match(staff, /alex@example\.com/);
  assert.match(staff, /https:\/\/www\.emoji\.tw\/reserve/);
});
