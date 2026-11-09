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
  // LINE accepted this retry key previously (e.g. worker crashed after HTTP success).
  if (retryKey && res.status === 409 && res.headers?.get('x-line-accepted-request-id')) return { accepted:true };
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
async function webhookInfo(cfg, opts) { return api(cfg, 'GET', '/v2/bot/channel/webhook/endpoint', opts); }
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
const HOURS = { zh: '在咖啡 08:00–17:00｜三點水 17:00–03:00（週一至週日）｜等等空間、約書旅 24 小時', en: 'at cafe 08:00–17:00 · 3AM 17:00–03:00, daily · Stay Square and Rest Book 24 hours', ja: '在咖啡 08:00–17:00｜三點水 17:00–03:00（毎日）｜等等空間・約書旅 24時間' };
/* 低消與服務費：與官網子品牌頁（tools/build-brand-sites.py）同一套對外口徑；三點水以營業日計（週五晚過 00:00 仍算週五） */
const MINSPEND = {
  zh: '低消與服務費\n・在咖啡 08:00–17:00：平日每人一杯飲料；週六日每人低消 NT$300，不收服務費。\n・三點水 17:00–03:00：每人低消週日至週四 NT$300、週五週六 NT$600；內用另加 10% 服務費，外帶不收。',
  en: 'Minimum spend & service charge\n· at cafe 08:00–17:00: one drink per person on weekdays; NT$300 per person on weekends. No service charge.\n· 3AM 17:00–03:00: NT$300 per person Sun–Thu, NT$600 Fri–Sat; 10% service charge for dine-in, none for takeout.',
  ja: '最低ご利用額とサービス料\n・在咖啡 08:00–17:00：平日はお一人様1ドリンク、土日はお一人様 NT$300。サービス料なし。\n・三點水 17:00–03:00：お一人様 日〜木 NT$300・金土 NT$600。店内飲食は10%のサービス料、テイクアウトはなし。',
};
const ADDRESS = { zh: '台北市中正區重慶南路一段 11 號（台北車站 Z10 出口斜對面）', en: 'No. 11, Sec. 1, Chongqing S. Rd., Taipei (across from Taipei Main Station Exit Z10)', ja: '台北市中正区重慶南路一段11号（台北駅 Z10 出口の斜め向かい）' };
const T = {
  zh: { confirmed: '訂位確認', reminder: '明天見', reminderBody: '提醒您明天的訂位，請按下方按鈕告訴我們會不會到。', date: '日期', time: '時間', venue: '店別', party: '人數', no: '編號', guests: n => `${n} 位`, hold: '座位保留至預約時間後 10 分鐘，逾時釋出。', map: '開地圖', cancel: '取消訂位', coming: '會準時到', willCancel: '需要取消', thanksComing: '收到，明天見！', cancelled: '已為您取消訂位。歡迎再次預約：', cancelledSubject: '訂位已取消', cantCancel: '這筆訂位目前無法由線上取消，請來電 ', alreadyDone: '這筆訂位已經結束或已取消。', ticket: '活動票券', ticketHint: '入場時出示此 QR。', eventReminder: '明天的活動', balance: n => `您目前有 ${n} 點。消費每滿 100 元得 1 點，1 點可兌換 NT$10 的餐飲。`, notLinked: '尚未綁定會員。點下方連結登入後，用一張卡在所有空間累積點數。', card: '會員卡', welcome: '歡迎加入言文字｜台灣人才聚落。\n在咖啡 08–17、三點水 17–03，等等空間與約書旅 24 小時開著。\n輸入「現在」看哪裡開著；「訂位」「菜單」「活動」「點數」直接查詢；其他問題直接留言，吧台會回覆。', reserve: '線上訂位', menu: '菜單', events: '活動', help: '可以直接輸入：現在、訂位、菜單、活動、營業時間、低消、地址、Wi-Fi、點數、包場、喜好。', wifi: 'Wi-Fi：', wifiFallback: '請向吧台索取 Wi-Fi 密碼。', rent: '包場或借用等等空間活動場地，請到這裡填申請：', closed: '', newResv: '新訂位' },
  en: { confirmed: 'Booking confirmed', reminder: 'See you tomorrow', reminderBody: 'A reminder of your booking tomorrow. Tap below to let us know.', date: 'Date', time: 'Time', venue: 'Venue', party: 'Guests', no: 'No.', guests: n => `${n}`, hold: 'We hold your table for 10 minutes after the booking time.', map: 'Open map', cancel: 'Cancel booking', coming: "I'll be there", willCancel: 'Need to cancel', thanksComing: 'Got it — see you tomorrow!', cancelled: 'Your booking has been cancelled. Book again anytime: ', cancelledSubject: 'Booking cancelled', cantCancel: 'This booking can no longer be cancelled online. Please call ', alreadyDone: 'This booking has already ended or been cancelled.', ticket: 'Event ticket', ticketHint: 'Show this QR at the door.', eventReminder: 'Tomorrow at emoji', balance: n => `You have ${n} points. Earn 1 point per NT$100; 1 point redeems NT$10 of food or drinks.`, notLinked: 'Not linked to a member account yet. Sign in below to collect points across all spaces.', card: 'Member card', welcome: 'Welcome to 言文字 Taiwan Talent Hub.\nat cafe 08–17, 3AM 17–03; Stay Square and Rest Book are open 24 hours.\nType "now" to see what is open, or "reserve", "menu", "events", "points"; anything else, just message us.', reserve: 'Book a table', menu: 'Menu', events: 'Events', help: 'Try: now, reserve, menu, events, hours, minimum, address, wifi, points, venue, preferences.', wifi: 'Wi-Fi: ', wifiFallback: 'Ask the bar for the Wi-Fi password.', rent: 'To book Stay Square for your event, apply here: ', closed: '', newResv: 'New booking' },
  ja: { confirmed: 'ご予約確認', reminder: '明日お待ちしています', reminderBody: '明日のご予約のリマインダーです。下のボタンでお知らせください。', date: '日付', time: '時間', venue: '店舗', party: '人数', no: '予約番号', guests: n => `${n}名`, hold: 'お席は予約時間の10分後まで確保します。', map: '地図を開く', cancel: '予約をキャンセル', coming: '予定どおり行きます', willCancel: 'キャンセルしたい', thanksComing: '承知しました。明日お待ちしています！', cancelled: 'ご予約をキャンセルしました。またのご予約をお待ちしています：', cancelledSubject: '予約キャンセル', cantCancel: 'このご予約はオンラインでキャンセルできません。お電話ください ', alreadyDone: 'このご予約はすでに終了またはキャンセルされています。', ticket: 'イベントチケット', ticketHint: '入場時にこのQRをご提示ください。', eventReminder: '明日のイベント', balance: n => `現在 ${n} ポイントです。100元ごとに1ポイント。1ポイントでNT$10分の飲食と交換できます。`, notLinked: 'まだ会員と連携していません。下のリンクからログインしてください。', card: '会員証', welcome: '言文字｜台湾タレントハブへようこそ。\n在咖啡 08–17、三點水 17–03、等等空間と約書旅は24時間。\n「今」と送ると営業中の場所を案内します。「予約」「メニュー」「イベント」「ポイント」もどうぞ。その他はメッセージでどうぞ。', reserve: 'オンライン予約', menu: 'メニュー', events: 'イベント', help: '「今」「予約」「メニュー」「イベント」「営業時間」「最低料金」「住所」「Wi-Fi」「ポイント」「貸切」「好み」と送ってください。', wifi: 'Wi-Fi：', wifiFallback: 'Wi-Fiパスワードはカウンターでお尋ねください。', rent: '貸切・イベント会場の申請はこちら：', closed: '', newResv: '新規予約' },
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
function reviewCard(url, lang = 'zh') {
  let parsed; try { parsed = new URL(url); } catch { /* rejected below */ }
  if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw Object.assign(Error('評論連結必須是完整 HTTPS URL（https://，不可含帳密）。'),{status:400});
  const l = pickLang(lang), copy = {
    zh: ['謝謝您的來訪', '歡迎分享這次用餐的真實感受，您的回饋能幫助我們持續改善。', '分享用餐體驗'],
    en: ['Thank you for visiting', 'Share your honest dining experience. Your feedback helps us improve.', 'Share your visit'],
    ja: ['ご来店ありがとうございました', 'お食事の率直なご感想をお聞かせください。今後の改善に役立てます。', '感想を共有する'],
  }[l];
  return flex(copy[0], bubble({ title: copy[0], body: [text(copy[1])], buttons: [uriButton(copy[2], parsed.href)] }));
}
/* 員工群組用的純文字 */
function staffReservationText(r, requestId, { origin = '', source = 'web' } = {}) {
  return `🗓 新訂位 ${requestId}（${source === 'line' ? 'LINE' : '網站'}）\n${r.date} ${r.time}（${r.period}）\n${r.partySize} 位｜${r.name}｜${r.phone}${r.note ? '\n備註：' + r.note : ''}\n${origin}/pos/reservations`;
}
function staffRegisterText(report) {
  const v = ({ CAFE: '在咖啡', BAR: '三點水', STAY: '等等空間', REST: '約書旅' })[report.venue] || report.venue, by = Object.entries(report.by_method || {}).map(([k, n]) => `${k} ${Number(n).toLocaleString('en-US')}`).join('、');
  return `🧾 ${v} ${report.day} 已關帳（${report.closed_by || ''}）\n營業額 ${Number(report.amount || 0).toLocaleString('en-US')}｜${report.orders || 0} 單${report.voided ? `｜作廢 ${report.voided}` : ''}\n${by ? by + '\n' : ''}點鈔 ${Number(report.counted_cash ?? 0).toLocaleString('en-US')}／應有 ${Number(report.expected_cash ?? 0).toLocaleString('en-US')}${report.diff ? `｜差額 ${report.diff > 0 ? '+' : ''}${report.diff}` : '｜無差額'}${report.note ? '\n' + report.note : ''}`;
}
function welcomeMessages({ origin, lang = 'zh', ...opts }) {
  const t = T[pickLang(lang)], l = pickLang(lang);
  return [text(t.welcome), hubCard({ lang: l, now: opts.now })];
}

/* ---------- 聚落：四個品牌、24 小時都有去處（文案與時段同官網首頁 public/index.html「進駐品牌」） ---------- */
const HUB = [
  { k: 'cafe', color: '#984C37', on: '#FFFFFF', open: m => m >= 480 && m < 1020, opens: '08:00', url: 'https://atcafe.emoji.tw/',
    name: { zh: '在咖啡', en: 'at cafe', ja: '在咖啡' }, kind: { zh: '日式簡餐與工作咖啡', en: 'Japanese set meals & working coffee', ja: '和定食とワーキングコーヒー' },
    hours: { zh: '08:00–17:00', en: '08:00–17:00', ja: '08:00–17:00' },
    copy: { zh: '早晨的手沖，午間的日式定食。約人碰面、等車的空檔，都從一杯咖啡開始。', en: 'Pour-over in the morning, a Japanese set meal at noon. Meetings and the wait for a train both start with a cup of coffee.', ja: '朝はハンドドリップ、昼は和の定食。打ち合わせも、電車までの待ち時間も、一杯のコーヒーから。' } },
  { k: 'bar', color: '#6B8FAB', on: '#1B1A17', open: m => m >= 1020 || m < 180, opens: '17:00', url: 'https://3am.emoji.tw/',
    name: { zh: '三點水', en: '3AM', ja: '三點水' }, kind: { zh: '深夜食堂與餐酒館', en: 'Late-night diner & bistro', ja: '深夜食堂・ビストロ' },
    hours: { zh: '17:00–翌日 03:00', en: '17:00–03:00', ja: '17:00–翌03:00' },
    copy: { zh: '醒著，就來。入夜後的熱食與一杯酒，陪晚歸的人到凌晨三點。', en: 'Awake? Come in. Hot food and a drink after dark, for night owls until 3 a.m.', ja: '起きているなら、どうぞ。夜の温かいごはんと一杯を、深夜3時まで。' } },
  { k: 'stay', color: '#2B4064', on: '#FFFFFF', open: () => true, url: 'https://staysquare.emoji.tw/',
    name: { zh: '等等空間', en: 'Stay Square', ja: '等等空間' }, kind: { zh: '共享工作空間', en: 'Coworking space', ja: 'コワーキングスペース' },
    hours: { zh: '24 小時', en: '24 hours', ja: '24時間' },
    copy: { zh: '工作區、會議室、電話亭與榻榻米區。專心做事、和夥伴開會、辦一場講座。', en: 'Desks, meeting rooms, phone booths and a tatami corner — for focused work, team meetings and talks.', ja: 'ワークエリア、会議室、電話ブース、畳スペース。集中作業にも、打ち合わせにも、講座にも。' } },
  { k: 'rest', color: '#5A4632', on: '#FFFFFF', open: () => true, url: 'https://restbook.emoji.tw/',
    name: { zh: '約書旅', en: 'Rest Book', ja: '約書旅' }, kind: { zh: '閱讀與休息', en: 'Reading & rest', ja: '読書と休憩' },
    hours: { zh: '24 小時', en: '24 hours', ja: '24時間' },
    copy: { zh: '書可以讀，也可以帶走。等車的空檔讀幾頁、沖個澡，休息好了再出發。', en: 'Read a book here or take it home. A few pages and a shower between trains, then back on the road.', ja: '本は読むことも、持ち帰ることも。電車の合間に数ページ、シャワーでひと息ついて、また出発。' } },
];
const HUB_T = {
  zh: { title: '從早上八點，到凌晨三點以後。', body: '白天的咖啡、入夜的食堂、整天開著的工作與閱讀空間，輪流點亮這個街區。', now: '現在開著', open: '現在營業中', opensAt: (t, tmr) => `${tmr ? '明天' : '今天'} ${t} 開門`, visit: '認識', where: '台北車站 Z10 出口斜對面', alt: '言文字聚落：現在哪裡開著' },
  en: { title: 'From 8 a.m. to past 3 a.m.', body: 'Coffee by day, a diner after dark, and work and reading spaces that stay open take turns lighting up the block.', now: 'Open now', open: 'Open now', opensAt: (t, tmr) => `Opens ${tmr ? 'tomorrow' : 'today'} at ${t}`, visit: 'Visit', where: 'Across from Taipei Main Station Exit Z10', alt: 'emoji: what is open now' },
  ja: { title: '朝8時から、深夜3時過ぎまで。', body: '昼のコーヒー、夜の食堂、一日中開いているワークと読書の空間が、交代でこの街区を灯します。', now: '営業中', open: '営業中', opensAt: (t, tmr) => `${tmr ? '明日' : '本日'} ${t} から`, visit: '見る', where: '台北駅 Z10 出口の斜め向かい', alt: '言文字：いま開いている場所' },
};
/* 台北時間的分鐘數（0–1439） */
const toMin = hhmm => { const [h, mm] = String(hhmm).split(':').map(Number); return h * 60 + mm; };
function taipeiMinutes(now = new Date()) { const d = new Date(+now + 8 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
const visitLabel = (l, name) => l === 'ja' ? `${name}を見る` : l === 'en' ? `Visit ${name}` : `認識${name}`;
const withUtm = (url, campaign) => url + (url.includes('?') ? '&' : '?') + 'utm_source=line&utm_campaign=' + campaign;
function hubCard({ lang = 'zh', now = new Date() } = {}) {
  const l = pickLang(lang), h = HUB_T[l], m = taipeiMinutes(now);
  const openNames = HUB.filter(b => b.open(m)).map(b => b.name[l]).join(l === 'en' ? ', ' : '、');
  const intro = { type: 'bubble', size: 'kilo',
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '18px', backgroundColor: INK, contents: [
      text('言文字｜台灣人才聚落', { size: 'xs', color: ACCENT, weight: 'bold' }), text(h.title, { size: 'lg', color: PAPER, weight: 'bold' }),
      text(h.body, { size: 'sm', color: '#CFCABF' }), { type: 'separator', color: '#3A3833' },
      text(h.now, { size: 'xs', color: ACCENT }), text(openNames, { size: 'sm', color: PAPER, weight: 'bold' }), text(h.where, { size: 'xs', color: '#CFCABF' })] } };
  const card = b => { const isOpen = b.open(m);
    return { type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', backgroundColor: b.color, paddingAll: '16px', contents: [text(b.kind[l], { size: 'xs', color: b.on }), text(b.name[l] + (l === 'zh' || l === 'ja' ? ' ' + b.name.en : ''), { size: 'lg', weight: 'bold', color: b.on })] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px', backgroundColor: PAPER, contents: [
        text(isOpen ? '● ' + h.open : '○ ' + h.opensAt(b.opens, m >= toMin(b.opens)), { size: 'sm', weight: 'bold', color: INK }),
        text(b.hours[l], { size: 'sm', color: '#4A453C' }), text(b.copy[l], { size: 'sm', color: INK })] },
      footer: { type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: PAPER, contents: [uriButton(visitLabel(l, b.name[l]), withUtm(b.url + (l === 'zh' ? '' : l), 'hub'), 'secondary')] } }; };
  /* 先放現在開著的，再放其他；同組維持官網順序 */
  const order = [...HUB.filter(b => b.open(m) && !['stay', 'rest'].includes(b.k)), ...HUB.filter(b => ['stay', 'rest'].includes(b.k)), ...HUB.filter(b => !b.open(m))];
  return flex(h.alt, { type: 'carousel', contents: [intro, ...order.map(card)] });
}

/* ---------- 加好友問卷：怎麼認識我們、想在這裡做什麼 → line_profiles 標籤 → 分眾邀請 ---------- */
/* 來源 key 與 POS 結帳調查（lib/table-orders.js SOURCE_OPTIONS）一致，方便合併統計 */
const SURVEY_SOURCES = [
  ['walk', { zh: '路過看到', en: 'Walked by', ja: '通りがかり' }], ['friend', { zh: '朋友介紹', en: 'A friend', ja: '友人の紹介' }],
  ['ig', { zh: 'Instagram', en: 'Instagram', ja: 'Instagram' }], ['threads', { zh: 'Threads', en: 'Threads', ja: 'Threads' }],
  ['google', { zh: 'Google 搜尋／地圖', en: 'Google / Maps', ja: 'Google・マップ' }], ['event', { zh: '參加活動', en: 'An event', ja: 'イベント' }],
  ['other', { zh: '其他', en: 'Other', ja: 'その他' }],
];
const SURVEY_INTERESTS = [
  ['cafe', { zh: '白天喝咖啡、吃飯', en: 'Coffee & lunch', ja: '昼のコーヒー・食事' }], ['bar', { zh: '晚上吃飯、喝一杯', en: 'Dinner & a drink', ja: '夜ごはん・一杯' }],
  ['work', { zh: '工作、開會', en: 'Work & meetings', ja: '仕事・打ち合わせ' }], ['rest', { zh: '看書、休息、沖澡', en: 'Read, rest, shower', ja: '読書・休憩・シャワー' }],
  ['events', { zh: '參加活動、認識人', en: 'Events & people', ja: 'イベント・出会い' }], ['host', { zh: '辦活動、包場', en: 'Host an event', ja: 'イベント開催・貸切' }],
];
const SOURCE_KEYS = new Set(SURVEY_SOURCES.map(([k]) => k)), INTEREST_KEYS = new Set(SURVEY_INTERESTS.map(([k]) => k));
const SURVEY_T = {
  zh: { q1: '想先問兩個問題，之後只傳你會用到的消息。\n你是怎麼認識言文字的？', q2: '謝謝。你想在言文字做什麼？可以選不只一個。', more: '記下了。還有嗎？', doneBtn: '就這些', none: '先不用通知',
    done: '好，之後有適合你的時段或活動，會傳訊息給你。想改的話，輸入「喜好」重新選。', optout: '好，不會主動傳邀請給你。想收的話，輸入「喜好」重新選。', foot: '不想收到這類訊息？輸入「喜好」改選項。' },
  en: { q1: 'Two quick questions, so we only send what you would use.\nHow did you hear about emoji?', q2: 'Thanks. What would you like to do here? Pick as many as you like.', more: 'Noted. Anything else?', doneBtn: "That's all", none: 'No messages, thanks',
    done: 'Got it. We will message you when something fits. Type "preferences" to change.', optout: 'Got it, no invitations. Type "preferences" any time to change.', foot: 'Type "preferences" to change what you get.' },
  ja: { q1: '2つだけ質問させてください。必要な案内だけをお送りします。\n言文字をどこで知りましたか？', q2: 'ありがとうございます。言文字で何をしたいですか？複数選べます。', more: '承知しました。ほかにもありますか？', doneBtn: '以上です', none: '通知は不要',
    done: '承知しました。合いそうな時間やイベントがあればお知らせします。「好み」と送ると選び直せます。', optout: '承知しました。ご案内はお送りしません。「好み」と送るといつでも変更できます。', foot: 'このトークで「好み」と送ると、受け取る内容を変更できます。' },
};
const qr = (label, data) => ({ type: 'action', action: { type: 'postback', label: String(label).slice(0, 20), data, displayText: String(label).slice(0, 300) } });
function surveySourceQuestion(lang = 'zh') { const l = pickLang(lang); return { type: 'text', text: SURVEY_T[l].q1, quickReply: { items: SURVEY_SOURCES.map(([k, v]) => qr(v[l], `a=src&id=${k}`)) } }; }
function surveyInterestQuestion(lang = 'zh', chosen = []) {
  const l = pickLang(lang), t = SURVEY_T[l], left = SURVEY_INTERESTS.filter(([k]) => !chosen.includes(k));
  const items = left.map(([k, v]) => qr(v[l], `a=int&id=${k}`));
  items.push(chosen.length ? qr(t.doneBtn, 'a=int_done') : qr(t.none, 'a=int_none'));
  return { type: 'text', text: chosen.length ? t.more : t.q2, quickReply: { items } };
}

/* ---------- 不定時邀請：依標籤與時段挑一則（Push 計費，頻率與額度由 line-service 控） ---------- */
/* 台北時間幾點跑哪些邀請；同一人一次只收一則，依順序取第一個符合的標籤。events 只有近 7 天有公開活動時才用 */
const INVITE_SLOTS = { 11: ['events', 'cafe'], 14: ['events', 'work', 'rest'], 18: ['events', 'bar'] };
const INVITE_T = {
  cafe: { zh: ['中午在台北車站附近嗎', '在咖啡的日式定食，配一杯手沖。開到 17:00。'], en: ['Near Taipei Main Station at noon?', 'A Japanese set meal and a pour-over at at cafe. Open until 17:00.'], ja: ['お昼、台北駅の近くにいますか', '在咖啡の和定食とハンドドリップ。17:00まで。'] },
  work: { zh: ['下午需要一張桌子嗎', '等等空間 24 小時開著：工作區、會議室、電話亭。單日 4 小時 NT$200 起。'], en: ['Need a desk this afternoon?', 'Stay Square is open 24 hours: desks, meeting rooms, phone booths. Day passes from NT$200 for 4 hours.'], ja: ['午後、作業できる机が必要ですか', '等等空間は24時間営業。ワークエリア、会議室、電話ブース。1日パスは4時間 NT$200から。'] },
  rest: { zh: ['等車的空檔', '約書旅 24 小時開著。讀幾頁書、沖個澡，休息好了再出發。白天 1 小時 NT$200 起。'], en: ['Time before your train?', 'Rest Book is open 24 hours. Read a few pages, take a shower, then back on the road. Daytime from NT$200 an hour.'], ja: ['電車までの時間に、ひと息', '約書旅は24時間営業。数ページ読んで、シャワーでひと息。日中は1時間 NT$200から。'] },
  bar: { zh: ['下班了嗎', '三點水 17:00 開門。熱食與一杯酒，到凌晨三點。'], en: ['Done for the day?', '3AM opens at 17:00. Hot food and a drink, until 3 a.m.'], ja: ['お疲れさまです', '三點水は17:00から翌3:00まで。温かいごはんとお酒をどうぞ。'] },
  events: { zh: ['這週在等等空間'], en: ['This week at Stay Square'], ja: ['今週の等等空間'] },
};
const INVITE_BRAND = { cafe: 'cafe', work: 'stay', rest: 'rest', bar: 'bar', events: 'stay' };
function inviteMessage(kind, { lang = 'zh', origin = '', event = null } = {}) {
  const l = pickLang(lang), b = HUB.find(x => x.k === INVITE_BRAND[kind]), [title, body] = INVITE_T[kind][l], camp = 'invite_' + kind;
  if (!b) throw Object.assign(Error('未知的邀請類型。'), { status: 400 });
  const site = withUtm(b.url + (l === 'zh' ? '' : l), camp), reserve = withUtm(langPath(origin, l, '/reserve'), camp);
  let rows = [text(body || '', { size: 'sm', color: INK })], buttons = [uriButton(visitLabel(l, b.name[l]), site, 'primary')];
  if (kind === 'events') {
    if (!event) throw Object.assign(Error('沒有活動可邀請。'), { status: 409 });
    const when = new Date(event.starts_at).toLocaleString(l === 'zh' ? 'zh-TW' : l === 'ja' ? 'ja-JP' : 'en-US', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    rows = [text(event.title, { size: 'md', weight: 'bold', color: INK }), text(when, { size: 'sm', color: MUTED })];
    buttons = [uriButton(l === 'zh' ? '看活動' : l === 'ja' ? 'イベントを見る' : 'See the event', withUtm(langPath(origin, l, '/events/' + encodeURIComponent(event.slug)), camp), 'primary')];
  }
  if (kind === 'cafe' || kind === 'bar') buttons.push(uriButton(T[l].reserve, reserve));
  const bub = { type: 'bubble', size: 'kilo',
    header: { type: 'box', layout: 'vertical', backgroundColor: b.color, paddingAll: '16px', contents: [text(b.name[l], { size: 'xs', color: b.on }), text(title, { size: 'lg', weight: 'bold', color: b.on })] },
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px', backgroundColor: PAPER, contents: [...rows, text(SURVEY_T[l].foot, { size: 'xs', color: '#4A453C' })] },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', backgroundColor: PAPER, contents: buttons } };
  return flex(kind === 'events' ? `${title}：${event.title}` : `${title}｜${b.name[l]}`, bub);
}
/* 這個時段每個人該收哪一則：依 slot 順序取第一個符合的標籤；events 需要有活動 */
function pickInvite(hour, interests = [], { hasEvent = false } = {}) {
  for (const k of INVITE_SLOTS[hour] || []) { if (k === 'events' && !hasEvent) continue; if (interests.includes(k)) return k; }
  return null;
}

/* ---------- 關鍵字自動回應（Reply API 免費；沒對到的不回，留給吧台真人回） ---------- */
const KEYWORDS = [
  ['hub', /^(現在|聚落|去哪|現在去哪|哪裡有開|now|open now|where now|今|今どこ)[?？]?$|現在.{0,6}(開|去哪)|哪裡.{0,4}開著|what'?s open|今.{0,4}(開いて|営業中)/i],
  ['prefs', /^(喜好|偏好|問卷|改選項|preferences?|survey|好み|アンケート)$/i],
  ['minspend', /低消|最低消費|服務費|一杯飲料|minimum|min\.? ?spend|service (fee|charge)|cover charge|最低料金|最低利用|サービス料|チャージ/i],
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
    case 'hub': return [hubCard({ lang: l, now: ctx.now })];
    case 'hours': return [text(HOURS[l])];
    case 'minspend': return [text(MINSPEND[l])];
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
/* 問卷標籤分眾（line_profiles，不必是會員；已封鎖或選「先不用通知」的人不列） */
AUDIENCES.surveyed = { label: '填過問卷的好友', from: 'profiles', sql: 'p.answered_at IS NOT NULL' };
for (const [k, v] of SURVEY_INTERESTS) AUDIENCES['want_' + k] = { label: '想' + v.zh + '的好友', from: 'profiles', sql: `'${k}'=ANY(p.interests)` };
function audienceSql(segment) { const a = AUDIENCES[segment]; if (!a) throw Object.assign(Error('未知的分眾。'), { status: 400 });
  if (a.from === 'profiles') return `SELECT NULL AS id,p.line_user_id FROM line_profiles p WHERE p.unfollowed_at IS NULL AND NOT p.opted_out AND (${a.sql})`;
  return `SELECT u.id,u.line_user_id FROM users u WHERE u.line_user_id IS NOT NULL AND u.line_user_id<>'' AND (${a.sql})`; }
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
    { key: 'cafe', zh: '在咖啡', en: 'at cafe · 08–17', uri: withUtm('https://atcafe.emoji.tw/', 'richmenu') },
    { key: 'bar', zh: '三點水', en: '3AM · 17–03', uri: withUtm('https://3am.emoji.tw/', 'richmenu') },
    { key: 'stay', zh: '等等空間', en: 'Stay Square · 24h', uri: withUtm('https://staysquare.emoji.tw/', 'richmenu') },
    { key: 'rest', zh: '約書旅', en: 'Rest Book · 24h', uri: withUtm('https://restbook.emoji.tw/', 'richmenu') },
    { key: 'reserve', zh: '訂位', en: 'Reserve', uri: origin + '/reserve?utm_source=line' },
    { key: 'events', zh: '活動', en: 'Events', uri: origin + '/events?utm_source=line' },
    { key: 'member', zh: '會員卡', en: 'Member card', uri: member },
  ];
}
function richMenuSpec(origin, opts) {
  /* 上排四個品牌（聚落、24 小時都有去處）各 625 寬；下排訂位／活動／會員卡各 833 寬。與 public/line-richmenu.html 同格線 */
  const cells = richMenuCells(origin, opts), W = 2500, H = 1686, ch = Math.floor(H / 2);
  const box = i => i < 4 ? { x: i * 625, y: 0, width: 625, height: ch } : { x: (i - 4) * 833, y: ch, width: i === 6 ? W - 2 * 833 : 833, height: H - ch };
  return { size: { width: W, height: H }, selected: true, name: 'emoji-hub-' + new Date().toISOString().slice(0, 10), chatBarText: '選單 Menu',
    areas: cells.map((c, i) => ({ bounds: box(i), action: { type: 'uri', label: c.zh, uri: c.uri } })) };
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

module.exports = { webhookInfo, HUB, HUB_T, taipeiMinutes, hubCard, SURVEY_SOURCES, SURVEY_INTERESTS, SOURCE_KEYS, INTEREST_KEYS, SURVEY_T, surveySourceQuestion, surveyInterestQuestion, INVITE_SLOTS, INVITE_T, inviteMessage, pickInvite, MINSPEND, DEFAULT_OA_ID, MAP_URL, PHONE, config, configured, loginConfig, oaId, addFriendUrl, verifySignature, api, push, reply, multicast, botInfo, quota, followers, profile, defaultRichMenuId, publishRichMenu,
  authorizeUrl, exchangeCode, pickLang, guessLang, T, HOURS, ADDRESS, VENUE, bubble, flex, text, reservationCard, ticketCard, reviewCard, staffReservationText, staffRegisterText, welcomeMessages,
  KEYWORDS, matchKeyword, keywordReply, parsePostback, AUDIENCES, audienceSql, normalizeBroadcast, richMenuCells, richMenuSpec, renderRichMenuPng, crc32, qrPng };
