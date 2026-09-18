'use strict';

/** 不含帳密的 HTTP(S) 網址（2000 字內）→ 正規化字串；否則回 ''。 */
function safeHttpUrl(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 2000) return '';
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function normalizeEventApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '申請資料格式不正確。' };
  const fields = {
    community_name: [120, '社群名稱'], contact_name: [80, '聯絡人'],
    contact_email: [254, 'Email'], contact_phone: [40, '電話', true],
    title: [160, '活動名稱'], description: [5000, '活動內容'],
    requirements: [2000, '場地與設備需求', true],
  };
  const value = {};
  for (const [key, [max, label, optional]] of Object.entries(fields)) {
    const raw = body[key] ?? '';
    if (typeof raw !== 'string' || raw.includes('\0')) return { error: `${label}格式不正確。` };
    const text = raw.trim();
    if (!text && !optional) return { error: `請填寫${label}。` };
    if (text.length > max) return { error: `${label}請勿超過 ${max} 字。` };
    value[key] = text;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact_email)) return { error: '請填寫有效的 Email。' };
  for (const key of ['starts_at', 'ends_at']) {
    const raw = body[key];
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))
      return { error: '請填寫完整的開始與結束時間（台灣時間）。' };
    const date = new Date(`${raw}:00+08:00`);
    if (!Number.isFinite(+date) || new Date(+date + 8 * 3600000).toISOString().slice(0, 16) !== raw)
      return { error: '活動日期或時間不正確。' };
    value[key] = date.toISOString();
  }
  if (value.ends_at <= value.starts_at) return { error: '結束時間必須晚於開始時間。' };
  if (!['number', 'string'].includes(typeof body.attendees) || !/^\d+$/.test(String(body.attendees)))
    return { error: '預估人數必須是 1 至 10000 的整數。' };
  value.attendees = Number(body.attendees);
  if (!Number.isInteger(value.attendees) || value.attendees < 1 || value.attendees > 10000)
    return { error: '預估人數必須是 1 至 10000 的整數。' };
  // 申請類型：社群活動固定三樓；企業包場可選交誼廳或三樓共享空間
  const kind = body.kind == null || body.kind === '' ? 'community' : body.kind;
  if (!['community', 'business'].includes(kind)) return { error: '申請類型不正確。' };
  value.kind = kind;
  if (kind === 'community') value.venue = '3F';
  else {
    if (!['2F', '3F'].includes(body.venue)) return { error: '請選擇包場空間：二樓交誼廳或三樓共享空間。' };
    value.venue = body.venue;
  }
  // 舊版已送出的草稿維持原驗證結果；新表單明確選擇公開方式。
  if (body.visibility !== undefined) {
    if (!['public', 'private'].includes(body.visibility)) return { error: '請選擇公開或私人活動。' };
    value.visibility = body.visibility;
    // 外部申請：公開活動一律附活動網址（報名在主辦方自己的頁面）；私人活動不開放報名，改收訂金。
    value.registration_mode = body.visibility === 'private' ? 'closed' : 'external';
    value.registration_url = '';
    if (value.registration_mode === 'external') {
      value.registration_url = safeHttpUrl(body.registration_url);
      if (!value.registration_url) return { error: '公開活動請附上有效的 HTTP 或 HTTPS 活動網址。' };
    }
  }
  if (body.consent !== true) return { error: '請先閱讀並同意申請須知與資料使用說明。' };
  return { value };
}

// 私人活動送件後收取的訂金（新台幣）
const PRIVATE_EVENT_DEPOSIT_TWD = 1000;
const applicationDeposit = a => a && a.visibility === 'private' ? PRIVATE_EVENT_DEPOSIT_TWD : 0;

module.exports = { normalizeEventApplication, safeHttpUrl, applicationDeposit, PRIVATE_EVENT_DEPOSIT_TWD };
