'use strict';
const { quoteVenueFee, MEMBER_VENUES } = require('./venue-fees');

/** 不含帳密的 HTTP(S) 網址（2000 字內）→ 正規化字串；否則回 ''。 */
function safeHttpUrl(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 2000) return '';
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

// 空間（代碼 → 中文名）；前台表單、通知信與檔期 API 共用。4F 保留給既有資料與檔期判斷，會員申請只開放 MEMBER_VENUES。
const VENUES = { '3F': '等等空間共享活動區', '4F': '等等空間休憩區', '2F': '等等空間交誼廳', '1F': '在咖啡／三點水餐飲空間' };
const venueLabel = code => VENUES[code] || VENUES['3F'];
/** 活動地點文字 → 佔用的空間代碼。
 *  ponytail: 由地點文字推斷；寫不出樓層（例如只填地址的全棟活動）視為佔用全部空間。要精確就替 events 加 venues 欄位。 */
function venuesOfLocation(location) {
  const text = String(location || ''), hit = [];
  for (const [code, re] of [['1F', /一樓|1\s*F|1\s*樓|咖啡餐酒館|在咖啡／三點水餐飲空間/i], ['2F', /二樓|2\s*F|2\s*樓|交誼廳/i], ['3F', /三樓|3\s*F|3\s*樓|等等空間共享活動區/i], ['4F', /閣樓|四樓|4\s*F|4\s*樓|等等空間休憩區/i]])
    if (re.test(text)) hit.push(code);
  return hit.length ? hit : Object.keys(VENUES);
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
  // 申請類型：社群／企業都從一樓、二樓交誼廳、三樓選一（四樓不開放會員申請）；社群活動未選時預設三樓，企業包場必選。
  const kind = body.kind == null || body.kind === '' ? 'community' : body.kind;
  if (!['community', 'business'].includes(kind)) return { error: '申請類型不正確。' };
  value.kind = kind;
  if (kind === 'community' && (body.venue == null || body.venue === '')) value.venue = '3F';
  else {
    if (!MEMBER_VENUES.includes(body.venue)) return { error: kind === 'community' ? '請選擇一樓、二樓交誼廳或三樓。' : '請選擇包場空間。' };
    value.venue = body.venue;
  }
  // 空間人數上限（二樓 ≤10、一樓 ≤50）；三樓不設硬上限，超過 60 人只提示。
  const capacity = quoteVenueFee({ venue: value.venue, visibility: 'public', attendees: value.attendees });
  if (capacity.error) return { error: capacity.error };
  // 舊版已送出的草稿維持原驗證結果；新表單明確選擇公開方式。
  if (body.visibility !== undefined) {
    if (!['public', 'private'].includes(body.visibility)) return { error: '請選擇公開或私人活動。' };
    value.visibility = body.visibility;
    // 公開活動：言文字售票（native，不需外部網址）或外部售票（external，附 https/http 報名網址）。
    // 未指定售票方式時沿用舊表單行為＝外部售票。私人活動不開放報名（closed），改收場地費。
    if (body.visibility === 'private') value.registration_mode = 'closed';
    else {
      const mode = body.registration_mode == null || body.registration_mode === '' ? 'external' : body.registration_mode;
      if (!['native', 'external'].includes(mode)) return { error: '請選擇透過言文字售票或前往其他售票平台。' };
      value.registration_mode = mode;
    }
    value.registration_url = '';
    if (value.registration_mode === 'external') {
      value.registration_url = safeHttpUrl(body.registration_url);
      if (!value.registration_url) return { error: '外部售票請附上有效的 HTTP 或 HTTPS 報名網址。' };
    }
    // 參加者退票政策（言文字售票）：accept＝活動前 8 日前可自行退票（預設），none＝不可退、可轉票。
    const policy = body.refund_policy == null || body.refund_policy === '' ? 'accept' : body.refund_policy;
    if (!['accept', 'none'].includes(policy)) return { error: '退票政策只可選接受退票或不接受退票。' };
    value.refund_policy = policy;
  }
  // 匯入來源網址（選填）
  if (body.source_url != null && body.source_url !== '') {
    value.source_url = safeHttpUrl(body.source_url);
    if (!value.source_url) return { error: '來源網址須為有效的 HTTP 或 HTTPS 網址。' };
  }
  if (body.consent !== true) return { error: '請先閱讀並同意申請須知與資料使用說明。' };
  return { value };
}

/** 送件時主辦人應付的場地費（新台幣，存 event_applications.deposit_twd）：
 *  私人活動＝依空間與人數的場地費（取代舊訂金 NT$1,000），付款後才可審核通過；
 *  公開活動送件時為 0：言文字售票由參加者每張票付 150；外部售票在審核通過時才設定 150×預估人數（見 approvalVenueFee）。 */
function applicationDeposit(a) {
  if (!a || a.visibility !== 'private') return 0;
  const quote = quoteVenueFee({ venue: a.venue || '3F', visibility: 'private', attendees: Number(a.attendees) });
  return quote.error ? 0 : quote.fee_twd;
}
/** 公開外部售票：審核通過後主辦人依預估人數先付的場地茶飲費；其餘為 0。 */
function approvalVenueFee(a) {
  if (!a || a.visibility !== 'public' || a.registration_mode !== 'external') return 0;
  const quote = quoteVenueFee({ venue: a.venue || '3F', visibility: 'public', attendees: Number(a.attendees), registration_mode: 'external' });
  return quote.error ? 0 : quote.fee_twd;
}

module.exports = { VENUES, MEMBER_VENUES, venueLabel, venuesOfLocation, normalizeEventApplication, safeHttpUrl, applicationDeposit, approvalVenueFee };
