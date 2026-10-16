'use strict';
/* LINE 官方帳號（@338ymhys）整合：Messaging API（push／reply／multicast／圖文選單）、LINE Login、webhook 簽章、
 * Flex 訊息（訂位確認、前一日提醒、活動票券）、關鍵字自動回應（Reply 不計費）、分眾名單、QR PNG。
 * 設定全部由後台「系統設定」即時載入（process.env），所以每個函式都在呼叫當下讀 config()，不要在模組層快取。
 * 純函式（簽章、Flex、關鍵字、分眾 SQL、PNG）無 DB、無網路，給測試 require；打 LINE 的函式可注入 fetcher。 */

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const API_BASE = () => (process.env.LINE_API_BASE || 'https://api.line.me').replace(/\/$/, '');
const DATA_API_BASE = () => (process.env.LINE_DATA_API_BASE || 'https://api-data.line.me').replace(/\/$/, '');
const LOGIN_BASE = () => (process.env.LINE_LOGIN_BASE || 'https://access.line.me').replace(/\/$/, '');
const DEFAULT_OA_ID = '@338ymhys';
const MAP_URL = 'https://maps.app.goo.gl/aFdoEB3RhweCqLbQ9';
const PHONE = '+886-921-102-067';

/* ---------- 設定 ---------- */
function config(env = process.env) {
  const token = String(env.LINE_CHANNEL_ACCESS_TOKEN || '').trim(), secret = String(env.LINE_CHANNEL_SECRET || '').trim();
  if (!token || !secret) return null;
  return { accessToken: token, channelSecret: secret, oaId: oaId(env), staffGroupId: String(env.LINE_STAFF_GROUP_ID || '').trim(), liffId: String(env.LINE_LIFF_ID || '').trim() };
}
function configured(env = process.env) { return !!config(env); }
function loginConfig(env = process.env) {
  const id = String(env.LINE_LOGIN_CHANNEL_ID || '').trim(), secret = String(env.LINE_LOGIN_CHANNEL_SECRET || '').trim();
  if (!id || !secret) return null;
  return { clientId: id, clientSecret: secret };
}
function oaId(env = process.env) { const v = String(env.LINE_OA_ID || '').trim(); return v ? (v.startsWith('@') ? v : '@' + v) : DEFAULT_OA_ID; }
const addFriendUrl = (env = process.env) => 'https://line.me/R/ti/p/' + oaId(env);

/* ---------- webhook 簽章：X-Line-Signature = base64(HMAC-SHA256(channel secret, raw body)) ---------- */
function verifySignature(rawBody, signature, channelSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !channelSecret) return false;
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Messaging API ---------- */
async function api(cfg, method, path, { body, raw, base, fetcher = fetch, retryKey } = {}) {
  const headers = { authorization: 'Bearer ' + cfg.accessToken };
  if (retryKey) headers['X-Line-Retry-Key'] = retryKey;
  let payload;
  if (raw) { headers['content-type'] = raw.type; payload = raw.body; }
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetcher((base || API_BASE()) + path, { method, headers, body: payload, signal: AbortSignal.timeout(15000) });
  const text = await res.text().catch(() => '');
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw Object.assign(Error(`LINE ${res.status}: ${json.message || json.details?.[0]?.message || text.slice(0, 200) || 'error'}`), { status: 502, line: json });
  return json;
}
const asMessages = m => (Array.isArray(m) ? m : [m]).slice(0, 5).map(x => typeof x === 'string' ? { type: 'text', text: x.slice(0, 5000) } : x);
async function push(cfg, to, messages, opts = {}) { return api(cfg, 'POST', '/v2/bot/message/push', { body: { to, messages: asMessages(messages) }, retryKey: crypto.randomUUID(), ...opts }); }
async function reply(cfg, replyToken, messages, opts = {}) { return api(cfg, 'POST', '/v2/bot/message/reply', { body: { replyToken, messages: asMessages(messages) }, ...opts }); }
/* multicast 一次最多 500 人；以送達人數計費 */
async function multicast(cfg, userIds, messages, opts = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  let sent = 0;
  for (let i = 0; i < ids.length; i += 500) { await api(cfg, 'POST', '/v2/bot/message/multicast', { body: { to: ids.slice(i, i + 500), messages: asMessages(messages) }, retryKey: crypto.randomUUID(), ...opts }); sent += Math.min(500, ids.length - i); }
  return sent;
}
async function botInfo(cfg, opts) { return api(cfg, 'GET', '/v2/bot/info', opts); }
async function quota(cfg, opts) { const [q, c] = await Promise.all([api(cfg, 'GET', '/v2/bot/message/quota', opts), api(cfg, 'GET', '/v2/bot/message/quota/consumption', opts)]); return { type: q.type, limit: q.value ?? null, used: c.totalUsage ?? 0 }; }
async function followers(cfg, opts) {
  const d = new Date(Date.now() - 86400e3).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }).replace(/-/g, '');
  const r = await api(cfg, 'GET', '/v2/bot/insight/followers?date=' + d, opts);
  return { date: d, status: r.status, followers: r.followers ?? null, targeted: r.targetedReaches ?? null, blocks: r.blocks ?? null };
}
async function profile(cfg, userId, opts) { return api(cfg, 'GET', '/v2/bot/profile/' + encodeURIComponent(userId), opts); }
async function defaultRichMenuId(cfg, opts) { try { return (await api(cfg, 'GET', '/v2/bot/user/all/richmenu', opts)).richMenuId || null; } catch (e) { if (/404/.test(e.message)) return null; throw e; } }
/* 建圖文選單：建規格 → 上傳圖片（PNG 2500×1686）→ 設為全體預設 → 刪掉舊的 */
async function publishRichMenu(cfg, spec, png, opts = {}) {
  const old = (await api(cfg, 'GET', '/v2/bot/richmenu/list', opts)).richmenus || [];
  const { richMenuId } = await api(cfg, 'POST', '/v2/bot/richmenu', { body: spec, ...opts });
  await api(cfg, 'POST', `/v2/bot/richmenu/${richMenuId}/content`, { raw: { type: 'image/png', body: png }, base: DATA_API_BASE(), ...opts });
  await api(cfg, 'POST', `/v2/bot/user/all/richmenu/${richMenuId}`, opts);
  for (const m of old) { if (m.richMenuId !== richMenuId) await api(cfg, 'DELETE', '/v2/bot/richmenu/' + m.richMenuId, opts).catch(() => {}); }
  return richMenuId;
}

/* ---------- LINE Login（OAuth 2.1 授權碼＋OpenID Connect） ---------- */
function authorizeUrl(lc, { redirectUri, state, nonce, botPrompt = 'aggressive', scope = 'profile openid email' }) {
  const p = new URLSearchParams({ response_type: 'code', client_id: lc.clientId, redirect_uri: redirectUri, state, scope, nonce, bot_prompt: botPrompt });
  return LOGIN_BASE() + '/oauth2/v2.1/authorize?' + p;
}
async function exchangeCode(lc, { code, redirectUri, nonce }, fetcher = fetch) {
  const tok = await fetcher(API_BASE() + '/oauth2/v2.1/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: lc.clientId, client_secret: lc.clientSecret }) }).then(r => r.json()).catch(() => ({}));
  if (!tok.id_token) return null;
  const v = await fetcher(API_BASE() + '/oauth2/v2.1/verify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ id_token: tok.id_token, client_id: lc.clientId, ...(nonce ? { nonce } : {}) }) }).then(r => r.json()).catch(() => ({}));
  if (typeof v.sub !== 'string' || !/^U[0-9a-f]{32}$/.test(v.sub)) return null;
  const email = typeof v.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? v.email.toLowerCase() : '';
  return { sub: v.sub, name: String(v.name || '').slice(0, 80), picture: typeof v.picture === 'string' ? v.picture : '', email, accessToken: tok.access_token || '' };
}

/* ---------- 文案（zh／en／ja） ---------- */
const pickLang = v => { const l = String(v || '').toLowerCase().slice(0, 2); return ['zh', 'en', 'ja'].includes(l) ? l : 'zh'; };
/* 依訊息文字猜語言：有假名→ja；全 ASCII→en；其餘 zh */
function guessLang(text) { const s = String(text || ''); if (/[\u3040-\u30ff]/.test(s)) return 'ja'; if (/^[\x00-\x7f]+$/.test(s)) return 'en'; return 'zh'; }
const VENUE = { zh: { '在咖啡': '在咖啡 at cafe', '三點水': '三點水 3AM' }, en: { '在咖啡': 'at cafe (café)', '三點水': '3AM (bistro)' }, ja: { '在咖啡': '在咖啡 at cafe（カフェ）', '三點水': '三點水 3AM（ビストロ）' } };
const HOURS = { zh: '在咖啡 08:00–17:00｜三點水 17:00–03:00（週一至週日）', en: 'at cafe 08:00–17:00 · 3AM 17:00–03:00, daily', ja: '在咖啡 08:00–17:00｜三點水 17:00–03:00（毎日）' };
const ADDRESS = { zh: '台北市中正區重慶南路一段 11 號（台北車站 Z10 出口斜對面）', en: 'No. 11, Sec. 1, Chongqing S. Rd., Taipei (across from Taipei Main Station Exit Z10)', ja: '台北市中正区重慶南路一段11号（台北駅 Z10 出口の斜め向かい）' };
const T = {
  zh: { confirmed: '訂位確認', reminder: '明天見', reminderBody: '提醒您明天的訂位，請按下方按鈕告訴我們會不會到。', date: '日期', time: '時間', venue: '店別', party: '人數', no: '編號', guests: n => `${n} 位`, hold: '座位保留至預約時間後 10 分鐘，逾時釋出。', map: '開地圖', cancel: '取消訂位', coming: '會準時到', willCancel: '需要取消', thanksComing: '收到，明天見！', cancelled: '已為您取消訂位。歡迎再次預約：', cancelledSubject: '訂位已取消', cantCancel: '這筆訂位目前無法由線上取消，請來電 ', alreadyDone: '這筆訂位已經結束或已取消。', ticket: '活動票券', ticketHint: '入場時出示此 QR。', eventReminder: '明天的活動', balance: n => `您目前有 ${n} 點，消費每滿 100 元累積 1 點，1 點折 1 元。`, notLinked: '尚未綁定會員。點下方連結登入後，用一張卡在所有空間累積點數。', card: '會員卡', welcome: '歡迎加入言文字｜台灣人才聚落。\n在咖啡 08–17、三點水 17–03，樓上是等等空間。\n輸入「訂位」「菜單」「活動」「點數」可以直接查詢；其他問題直接留言，吧台會回覆。', reserve: '線上訂位', menu: '菜單', events: '活動', help: '可以直接輸入：訂位、菜單、活動、營業時間、地址、Wi-Fi、點數、包場。', wifi: 'Wi-Fi：', wifiFallback: '請向吧台索取 Wi-Fi 密碼。', rent: '包場或借用等等空間活動場地，請到這裡填申請：', closed: '', newResv: '新訂位' },
  en: { confirmed: 'Booking confirmed', reminder: 'See you tomorrow', reminderBody: 'A reminder of your booking tomorrow. Tap below to let us know.', date: 'Date', time: 'Time', venue: 'Venue', party: 'Guests', no: 'No.', guests: n => `${n}`, hold: 'We hold your table for 10 minutes after the booking time.', map: 'Open map', cancel: 'Cancel booking', coming: "I'll be there", willCancel: 'Need to cancel', thanksComing: 'Got it — see you tomorrow!', cancelled: 'Your booking has been cancelled. Book again anytime: ', cancelledSubject: 'Booking cancelled', cantCancel: 'This booking can no longer be cancelled online. Please call ', alreadyDone: 'This booking has already ended or been cancelled.', ticket: 'Event ticket', ticketHint: 'Show this QR at the door.', eventReminder: 'Tomorrow at emoji', balance: n => `You have ${n} points. Every NT$100 spent earns 1 point; 1 point = NT$1.`, notLinked: 'Not linked to a member account yet. Sign in below to collect points across all spaces.', card: 'Member card', welcome: 'Welcome to 言文字 Taiwan Talent Hub.\nat cafe 08–17, 3AM 17–03, Stay Square upstairs.\nType "reserve", "menu", "events" or "points" for quick answers; anything else, just message us.', reserve: 'Book a table', menu: 'Menu', events: 'Events', help: 'Try: reserve, menu, events, hours, address, wifi, points, venue.', wifi: 'Wi-Fi: ', wifiFallback: 'Ask the bar for the Wi-Fi password.', rent: 'To book Stay Square for your event, apply here: ', closed: '', newResv: 'New booking' },
  ja: { confirmed: 'ご予約確認', reminder: '明日お待ちしています', reminderBody: '明日のご予約のリマインダーです。下のボタンでお知らせください。', date: '日付', time: '時間', venue: '店舗', party: '人数', no: '予約番号', guests: n => `${n}名`, hold: 'お席は予約時間の10分後まで確保します。', map: '地図を開く', cancel: '予約をキャンセル', coming: '予定どおり行きます', willCancel: 'キャンセルしたい', thanksComing: '承知しました。明日お待ちしています！', cancelled: 'ご予約をキャンセルしました。またのご予約をお待ちしています：', cancelledSubject: '予約キャンセル', cantCancel: 'このご予約はオンラインでキャンセルできません。お電話ください ', alreadyDone: 'このご予約はすでに終了またはキャンセルされています。', ticket: 'イベントチケット', ticketHint: '入場時にこのQRをご提示ください。', eventReminder: '明日のイベント', balance: n => `現在 ${n} ポイントです。100元ごとに1ポイント、1ポイント＝1元。`, notLinked: 'まだ会員と連携していません。下のリンクからログインしてください。', card: '会員証', welcome: '言文字｜台湾タレントハブへようこそ。\n在咖啡 08–17、三點水 17–03、上階は等等空間。\n「予約」「メニュー」「イベント」「ポイント」と送ると案内します。その他はメッセージでどうぞ。', reserve: 'オンライン予約', menu: 'メニュー', events: 'イベント', help: '「予約」「メニュー」「イベント」「営業時間」「住所」「Wi-Fi」「ポイント」「貸切」と送ってください。', wifi: 'Wi-Fi：', wifiFallback: 'Wi-Fiパスワードはカウンターでお尋ねください。', rent: '貸切・イベント会場の申請はこちら：', closed: '', newResv: '新規予約' },
};
const langPath = (origin, lang, p) => origin + (lang === 'zh' ? '' : '/' + lang) + p;

/* ---------- Flex 元件 ---------- */
const INK = '#1B1A17', PAPER = '#FBFAF6', ACCENT = '#FFDE34', MUTED = '#6B6558';
const text = (t, o = {}) => ({ type: 'text', text: String(t || ' ').slice(0, 2000), wrap: true, ...o });
const row = (label, value) => ({ type: 'box', layout: 'baseline', spacing: 'sm', contents: [text(label, { size: 'sm', color: MUTED, flex: 2 }), text(value, { size: 'sm', color: INK, flex: 5, weight: 'bold' })] });
const uriButton = (label, uri, style = 'secondary') => ({ type: 'button', style, height: 'sm', action: { type: 'uri', label: String(label).slice(0, 20), uri } });
const postbackButton = (label, data, style = 'primary', displayText) => ({ type: 'button', style, height: 'sm', color: style === 'primary' ? INK : undefined, action: { type: 'postback', label: String(label).slice(0, 20), data, ...(displayText ? { displayText } : {}) } });
function bubble({ title, subtitle, rows = [], body = [], buttons = [], hero }) {
  const b = { type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: INK, paddingAll: '16px', contents: [text('言文字', { size: 'xs', color: ACCENT, weight: 'bold' }), text(title, { size: 'lg', color: PAPER, weight: 'bold' }), ...(subtitle ? [text(subtitle, { size: 'xs', color: '#CFCABF' })] : [])] },
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px', backgroundColor: PAPER, contents: [...rows.map(([l, v]) => row(l, v)), ...body] },
  };
  if (hero) b.hero = { type: 'image', url: hero, size: 'full', aspectRatio: '1:1', aspectMode: 'fit', backgroundColor: '#FFFFFF' };
  if (buttons.length) b.footer = { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', backgroundColor: PAPER, contents: buttons };
  return b;
}
const flex = (altText, contents) => ({ type: 'flex', altText: String(altText).slice(0, 400), contents });

/* 訂位：確認卡（成立／後台確認時）與前一日提醒卡（有「會到／取消」按鈕） */
function reservationCard(r, { lang = 'zh', origin = '', kind = 'confirmed' } = {}) {
  const t = T[pickLang(lang)], l = pickLang(lang);
  const rows = [[t.date, r.date || r.reserve_date], [t.time, r.time || r.reserve_time], [t.venue, VENUE[l][r.period] || r.period], [t.party, t.guests(r.partySize ?? r.party_size)], [t.no, r.request_id || r.requestId || '']];
  if (kind === 'reminder') return flex(`${t.reminder} · ${rows[0][1]} ${rows[1][1]}`, bubble({ title: t.reminder, rows, body: [text(t.reminderBody, { size: 'sm', color: MUTED })],
    buttons: [postbackButton(t.coming, `a=resv_confirm&id=${r.id}`, 'primary', t.coming), postbackButton(t.willCancel, `a=resv_cancel&id=${r.id}`, 'secondary', t.willCancel)] }));
  return flex(`${t.confirmed} · ${rows[0][1]} ${rows[1][1]}`, bubble({ title: t.confirmed, rows, body: [text(t.hold, { size: 'xs', color: MUTED })],
    buttons: [uriButton(t.map, MAP_URL), ...(r.id ? [postbackButton(t.cancel, `a=resv_cancel&id=${r.id}`, 'secondary', t.cancel)] : [])] }));
}
/* 活動票券：QR 圖（/api/line/qr/<token>.png）＋活動資訊 */
function ticketCard({ title, starts_at, location, name, ticket_name, qrUrl, url }, lang = 'zh', kind = 'ticket') {
  const t = T[pickLang(lang)], l = pickLang(lang);
  const when = starts_at ? new Date(starts_at).toLocaleString(l === 'zh' ? 'zh-TW' : l === 'ja' ? 'ja-JP' : 'en-US', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  return flex(`${kind === 'reminder' ? t.eventReminder : t.ticket} · ${title}`, bubble({ title: kind === 'reminder' ? t.eventReminder : t.ticket, subtitle: title, hero: qrUrl,
    rows: [[t.time, when], ...(location ? [[t.venue, location]] : []), ...(name ? [[t.party, name]] : []), ...(ticket_name ? [[t.no, ticket_name]] : [])], body: [text(t.ticketHint, { size: 'xs', color: MUTED })], buttons: url ? [uriButton(l === 'zh' ? '活動頁' : l === 'ja' ? 'イベントページ' : 'Event page', url)] : [] }));
}
/* 員工群組用的純文字 */
function staffReservationText(r, requestId, { origin = '', source = 'web' } = {}) {
  return `🗓 新訂位 ${requestId}（${source === 'line' ? 'LINE' : '網站'}）\n${r.date} ${r.time}（${r.period}）\n${r.partySize} 位｜${r.name}｜${r.phone}${r.note ? '\n備註：' + r.note : ''}\n${origin}/pos/reservations`;
}
function staffRegisterText(report) {
  const v = report.venue === 'CAFE' ? '在咖啡' : '三點水', by = Object.entries(report.by_method || {}).map(([k, n]) => `${k} ${Number(n).toLocaleString('en-US')}`).join('、');
  return `🧾 ${v} ${report.day} 已關帳（${report.closed_by || ''}）\n營業額 ${Number(report.amount || 0).toLocaleString('en-US')}｜${report.orders || 0} 單${report.voided ? `｜作廢 ${report.voided}` : ''}\n${by ? by + '\n' : ''}點鈔 ${Number(report.counted_cash ?? 0).toLocaleString('en-US')}／應有 ${Number(report.expected_cash ?? 0).toLocaleString('en-US')}${report.diff ? `｜差額 ${report.diff > 0 ? '+' : ''}${report.diff}` : '｜無差額'}${report.note ? '\n' + report.note : ''}`;
}
function welcomeMessages({ origin, lang = 'zh' }) {
  const t = T[pickLang(lang)], l = pickLang(lang);
  return [text(t.welcome), flex(t.help, bubble({ title: '言文字', body: [text(t.help, { size: 'sm', color: MUTED })], buttons: [uriButton(t.reserve, langPath(origin, l, '/reserve?utm_source=line'), 'primary'), uriButton(t.events, langPath(origin, l, '/events?utm_source=line')), uriButton(t.card, origin + '/m')] }))];
}

/* ---------- 關鍵字自動回應（Reply API 免費；沒對到的不回，留給吧台真人回） ---------- */
const KEYWORDS = [
  ['hours', /營業|幾點|開到|時間|hours?|open|営業|何時/i],
  ['address', /地址|怎麼去|地圖|位置|address|map|住所|場所|行き方/i],
  ['reserve', /訂位|訂桌|預約|reserve|booking|book a|予約/i],
  ['menu', /菜單|menu|メニュー/i],
  ['events', /活動|event|イベント/i],
  ['points', /點數|會員|member|points?|ポイント|会員/i],
  ['wifi', /wi-?fi|無線|上網|密碼|internet/i],
  ['rent', /包場|場地|租借|借用|venue|rent|貸切|会場/i],
  ['help', /^(選單|幫助|說明|help|menu list|ヘルプ|\?|？)$/i],
];
function matchKeyword(textIn) { const s = String(textIn || '').trim().slice(0, 200); if (!s) return null; for (const [key, re] of KEYWORDS) if (re.test(s)) return key; return null; }
/* 回 messages[]；points 需要 ctx.balance（null＝未綁定）。ctx.wifi 為後台填的 Wi-Fi 說明 */
function keywordReply(key, ctx = {}) {
  const l = pickLang(ctx.lang), t = T[l], origin = ctx.origin || '';
  switch (key) {
    case 'hours': return [text(HOURS[l])];
    case 'address': return [text(ADDRESS[l] + '\n' + MAP_URL)];
    case 'reserve': return [flex(t.reserve, bubble({ title: t.reserve, body: [text(HOURS[l], { size: 'sm', color: MUTED })], buttons: [uriButton(t.reserve, langPath(origin, l, '/reserve?utm_source=line'), 'primary')] }))];
    case 'menu': return [flex(t.menu, bubble({ title: t.menu, buttons: [uriButton('在咖啡 at cafe', langPath(origin, l, '/at-cafe'), 'primary'), uriButton('三點水 3AM', langPath(origin, l, '/3am'))] }))];
    case 'events': return [flex(t.events, bubble({ title: t.events, buttons: [uriButton(t.events, langPath(origin, l, '/events?utm_source=line'), 'primary')] }))];
    case 'points': return [ctx.balance == null ? flex(t.card, bubble({ title: t.card, body: [text(t.notLinked, { size: 'sm', color: MUTED })], buttons: [uriButton(t.card, origin + '/m?utm_source=line', 'primary')] }))
      : flex(t.card, bubble({ title: t.card, rows: [[l === 'zh' ? '點數' : l === 'ja' ? 'ポイント' : 'Points', String(ctx.balance)]], body: [text(t.balance(ctx.balance), { size: 'sm', color: MUTED })], buttons: [uriButton(t.card, origin + '/m?utm_source=line', 'primary')] }))];
    case 'wifi': return [text(ctx.wifi ? t.wifi + ctx.wifi : t.wifiFallback)];
    case 'rent': return [text(t.rent + langPath(origin, l, '/events?apply=1#ev-apply'))];
    case 'help': return [text(t.help)];
    default: return [];
  }
}
/* postback data → {a,id} */
function parsePostback(data) { const p = new URLSearchParams(String(data || '')); const a = p.get('a') || '', id = String(p.get('id') || ''); return /^[a-z_]{1,32}$/.test(a) && /^[A-Za-z0-9_-]{0,64}$/.test(id) ? { a, id } : null; }

/* ---------- 分眾（給後台推播）：回 SQL 子句，主查詢 SELECT id,line_user_id FROM users u WHERE line_user_id IS NOT NULL AND (…) ---------- */
const ORDERED = v => `EXISTS(SELECT 1 FROM table_orders o WHERE o.user_id=u.id AND o.status IN ('paid','done') AND o.paid_at>=now()-interval '30 days' AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) l WHERE l->>'venue'='${v}'))`;
const AUDIENCES = {
  linked: { label: '所有已綁定 LINE 的會員', sql: 'TRUE' },
  cafe_only_30d: { label: '近 30 天只來過在咖啡（白天）的人', sql: `${ORDERED('CAFE')} AND NOT ${ORDERED('BAR')}` },
  bar_only_30d: { label: '近 30 天只來過三點水（晚上）的人', sql: `${ORDERED('BAR')} AND NOT ${ORDERED('CAFE')}` },
  active_30d: { label: '近 30 天有消費', sql: `EXISTS(SELECT 1 FROM table_orders o WHERE o.user_id=u.id AND o.status IN ('paid','done') AND o.paid_at>=now()-interval '30 days')` },
  dormant_60d: { label: '沉睡客（曾消費、60 天沒來）', sql: `EXISTS(SELECT 1 FROM table_orders o WHERE o.user_id=u.id AND o.status IN ('paid','done')) AND NOT EXISTS(SELECT 1 FROM table_orders o WHERE o.user_id=u.id AND o.status IN ('paid','done') AND o.paid_at>=now()-interval '60 days')` },
  never: { label: '綁定了但還沒消費過', sql: `NOT EXISTS(SELECT 1 FROM table_orders o WHERE o.user_id=u.id AND o.status IN ('paid','done'))` },
};
function audienceSql(segment) { const a = AUDIENCES[segment]; if (!a) throw Object.assign(Error('未知的分眾。'), { status: 400 }); return `SELECT u.id,u.line_user_id FROM users u WHERE u.line_user_id IS NOT NULL AND u.line_user_id<>'' AND (${a.sql})`; }
function normalizeBroadcast(body = {}) {
  const segment = String(body.segment || ''), message = String(body.text || '').trim();
  if (!AUDIENCES[segment]) throw Object.assign(Error('請選擇分眾。'), { status: 400 });
  if (!message || message.length > 1000) throw Object.assign(Error('訊息請填 1–1000 字。'), { status: 400 });
  const url = String(body.url || '').trim(); if (url && !/^https:\/\//.test(url)) throw Object.assign(Error('連結須以 https:// 開頭。'), { status: 400 });
  return { segment, text: message, url };
}

/* ---------- 圖文選單規格：2500×1686，上三下三 ---------- */
function richMenuCells(origin, { liffId = '', lang = 'zh' } = {}) {
  const member = liffId ? 'https://liff.line.me/' + liffId : origin + '/m?utm_source=line';
  return [
    { key: 'reserve', zh: '訂位', en: 'Reserve', uri: origin + '/reserve?utm_source=line' },
    { key: 'cafe', zh: '在咖啡', en: 'at cafe · 08–17', uri: origin + '/at-cafe?utm_source=line' },
    { key: 'bar', zh: '三點水', en: '3AM · 17–03', uri: origin + '/3am?utm_source=line' },
    { key: 'member', zh: '會員卡', en: 'Member · points', uri: member },
    { key: 'events', zh: '活動', en: 'Events', uri: origin + '/events?utm_source=line' },
    { key: 'space', zh: '等等空間', en: 'Stay Square', uri: origin + '/stay-square?utm_source=line' },
  ];
}
function richMenuSpec(origin, opts) {
  const cells = richMenuCells(origin, opts), W = 2500, H = 1686, cw = Math.floor(W / 3), ch = Math.floor(H / 2);
  return { size: { width: W, height: H }, selected: true, name: 'emoji-main-' + new Date().toISOString().slice(0, 10), chatBarText: '選單 Menu',
    areas: cells.map((c, i) => ({ bounds: { x: (i % 3) * cw, y: Math.floor(i / 3) * ch, width: cw, height: ch }, action: { type: 'uri', label: c.zh, uri: c.uri } })) };
}
/* 用 puppeteer 開本機 /line-richmenu.html 截圖（與 IG 自動發佈同一套 chromium） */
async function renderRichMenuPng({ port, puppeteer = require('puppeteer') }) {
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 2500, height: 1686, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/line-richmenu.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 2500, height: 1686 } });
  } finally { await browser.close(); }
}

/* ---------- QR → PNG（灰階 8-bit；給 Flex 圖片用，LINE 只吃 https 的 PNG／JPEG） ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function qrPng(content, { scale = 8, margin = 4 } = {}) {
  const QRCode = require('../public/vendor/qrcode.min.js');
  const qr = QRCode.create(String(content), { errorCorrectionLevel: 'M' }), n = qr.modules.size, data = qr.modules.data;
  const size = (n + margin * 2) * scale, stride = size + 1, raw = Buffer.alloc(stride * size, 255);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    const my = Math.floor(y / scale) - margin; if (my < 0 || my >= n) continue;
    for (let x = 0; x < size; x++) { const mx = Math.floor(x / scale) - margin; if (mx >= 0 && mx < n && data[my * n + mx]) raw[y * stride + 1 + x] = 0; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

module.exports = { DEFAULT_OA_ID, MAP_URL, PHONE, config, configured, loginConfig, oaId, addFriendUrl, verifySignature, api, push, reply, multicast, botInfo, quota, followers, profile, defaultRichMenuId, publishRichMenu,
  authorizeUrl, exchangeCode, pickLang, guessLang, T, HOURS, ADDRESS, VENUE, bubble, flex, text, reservationCard, ticketCard, staffReservationText, staffRegisterText, welcomeMessages,
  KEYWORDS, matchKeyword, keywordReply, parsePostback, AUDIENCES, audienceSql, normalizeBroadcast, richMenuCells, richMenuSpec, renderRichMenuPng, crc32, qrPng };
