/* 合作開發（飲品招待券）：名單＋開發進度 pipeline。權限＝超管，或超管授予 users.outreach_access 的言文字管理員。 */
const STAGES = ['待開發', '已聯絡', '洽談中', '已合作', '暫不合作'];
const CATEGORIES = ['商旅', '按摩養生', '補習班', '其他'];
const LOG_KINDS = ['電話', '拜訪', 'LINE', 'Email', '送券', '備註'];
const s = (v, n) => String(v ?? '').trim().slice(0, n);

function normalizeLead(b, cur = {}) {
  const pick = (k, n) => (b[k] === undefined ? (cur[k] ?? '') : s(b[k], n));
  const name = pick('name', 120);
  if (!name) throw Object.assign(new Error('請填店家名稱。'), { status: 400 });
  const category = b.category === undefined ? (cur.category || '其他') : s(b.category, 20);
  if (!CATEGORIES.includes(category)) throw Object.assign(new Error('類別無效。'), { status: 400 });
  const stage = b.stage === undefined ? (cur.stage || '待開發') : s(b.stage, 20);
  if (!STAGES.includes(stage)) throw Object.assign(new Error('階段無效。'), { status: 400 });
  const priority = b.priority === undefined ? (cur.priority || 2) : Number(b.priority);
  if (![1, 2, 3].includes(priority)) throw Object.assign(new Error('優先度無效。'), { status: 400 });
  const qty = b.coupon_qty === undefined ? (cur.coupon_qty || 0) : Math.floor(Number(b.coupon_qty));
  if (!Number.isFinite(qty) || qty < 0 || qty > 100000) throw Object.assign(new Error('招待券數量無效。'), { status: 400 });
  let nextDate = b.next_action_date === undefined ? (cur.next_action_date || null) : (s(b.next_action_date, 10) || null);
  if (nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) throw Object.assign(new Error('下次跟進日期格式應為 YYYY-MM-DD。'), { status: 400 });
  const num = (k, lo, hi, int) => {
    if (b[k] === undefined) return cur[k] ?? null;
    if (b[k] === null || b[k] === '') return null;
    const v = Number(b[k]);
    if (!Number.isFinite(v) || v < lo || v > hi) throw Object.assign(new Error(`${k} 無效。`), { status: 400 });
    return int ? Math.round(v) : v;
  };
  const score = num('score', 0, 100, true), lat = num('lat', -90, 90), lon = num('lon', -180, 180), distance_m = num('distance_m', 0, 1e6, true);
  return { name, category, stage, priority, coupon_qty: qty, next_action_date: nextDate, score, lat, lon, distance_m, fit_reason: pick('fit_reason', 300),
    address: pick('address', 200), phone: pick('phone', 60), website: pick('website', 300), contact_person: pick('contact_person', 80),
    owner: pick('owner', 80), next_action: pick('next_action', 200), source: pick('source', 200), note: pick('note', 2000) };
}

const SEED = [
  ['商旅', '台北璽愛商務旅店', '台北市中正區忠孝西路一段72號3F', '', ''],
  ['商旅', '路徒PLUS行旅－主題館', '台北市中正區忠孝西路一段80號5-12樓', '', ''],
  ['商旅', '路徒PLUS行旅－站前館', '台北市中正區南陽街附近（請核對）', '', ''],
  ['商旅', '信星青年旅館 Star Hostel', '台北市大同區華陰街50號4F', '02-2556-2015', 'http://www.starhostel.com.tw/'],
  ['商旅', '卡夫人背包客棧（台北車站青年館）', '台北市中正區館前路34號7樓', '02-2388-1666', ''],
  ['商旅', '台灣青旅膠囊旅店 Taiwan Youth Hostel', '台北車站旁（請核對）', '02-2361-3000', 'https://taiwanyh.com/tw/'],
  ['商旅', '日初青旅', '台北市中正區重慶南路一段49號9樓', '', ''],
  ['商旅', '儷客旅店－台北車站館', '', '', ''],
  ['按摩養生', '灸四喜 北車店', '台北市中正區漢口街一段35號5樓', '0903-329-760', 'https://nicemassage.com.tw/'],
  ['按摩養生', '988養生會館（重慶館）', '', '02-2370-5858', ''],
  ['按摩養生', '足強養生館（開封店）', '', '', ''],
  ['按摩養生', '足強養生館（重慶店）', '', '', ''],
  ['按摩養生', '足滿足足體養生會館 懷寧本店', '', '', ''],
  ['按摩養生', '足滿足足體養生會館 漢口二店', '', '', ''],
  ['按摩養生', '天王足體養生會館', '', '', ''],
  ['補習班', '中華數位（嵌入式系統培訓）', '台北市開封街一段2號9樓', '02-2311-7355', 'https://www.cadtc.com.tw/'],
  ['補習班', '菁英國際 台北站前校（英文／多益）', '台北市中正區館前路43號7樓', '02-2388-1155', 'https://www.online-test.com.tw/taipei-station.html'],
  ['補習班', '繁田塾', '台北市館前路43號8樓', '02-2331-2752', 'https://www.handazyuku.com.tw/'],
  ['補習班', '時代國際韓語補習班', '台北市中正區漢口街一段3號3樓', '02-2311-6600', ''],
  ['補習班', '台北新領域教育訓練中心', '台北市館前路49號4樓', '02-2388-1272', ''],
];

async function init(q, uid) {
  await q(`CREATE TABLE IF NOT EXISTS outreach_leads (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '其他', stage TEXT NOT NULL DEFAULT '待開發',
    priority INT NOT NULL DEFAULT 2, address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '',
    contact_person TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '', coupon_qty INT NOT NULL DEFAULT 0,
    next_action TEXT NOT NULL DEFAULT '', next_action_date DATE, source TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS outreach_logs (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES outreach_leads(id) ON DELETE CASCADE, actor TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '備註', content TEXT NOT NULL DEFAULT '', stage_to TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const col of ['score INT', 'lat DOUBLE PRECISION', 'lon DOUBLE PRECISION', 'distance_m INT', "fit_reason TEXT NOT NULL DEFAULT ''"])
    await q(`ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS ${col}`);
  await q(`CREATE INDEX IF NOT EXISTS outreach_logs_lead_idx ON outreach_logs(lead_id, created_at DESC)`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS outreach_access BOOLEAN NOT NULL DEFAULT false`);
  await q(`ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS seed_ref TEXT`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS outreach_leads_seed_ref_idx ON outreach_leads(seed_ref) WHERE seed_ref IS NOT NULL`);
  const n = (await q(`SELECT COUNT(*)::int AS n FROM outreach_leads`)).rows[0].n;
  if (n === 0) {
    for (const [category, name, address, phone, website] of SEED) {
      await q(`INSERT INTO outreach_leads(id,name,category,address,phone,website,source,note,created_by) VALUES($1,$2,$3,$4,$5,$6,'網路搜尋（2026-10-17 初稿）','資料來自公開網頁，聯絡前請先核對地址與電話。','system') ON CONFLICT DO NOTHING`,
        [uid('ol_'), name, category, address, phone, website]);
    }
  }
  await importSeedFile(q, uid);
}

const norm = v => String(v || '').replace(/[\s\W_]/gu, '').toLowerCase();
/* 周邊名單（lib/outreach-seed.json，OpenStreetMap 台北車站周邊 2 公里）只匯入一次（outreach_meta 記號），
   之後刪掉的名單不會被補回；以 seed_ref 與店名比對去重，跟初稿或人工新增的同名店家不重複建立。 */
async function importSeedFile(q, uid) {
  let rows;
  try { rows = require('./outreach-seed.json'); } catch { return 0; }
  const existing = (await q(`SELECT name,seed_ref FROM outreach_leads`)).rows;
  const refs = new Set(existing.map(r => r.seed_ref).filter(Boolean));
  const names = existing.map(r => norm(r.name));
  await q(`CREATE TABLE IF NOT EXISTS outreach_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  if ((await q(`SELECT 1 FROM outreach_meta WHERE key='seed_osm_20261018'`)).rows.length) return 0;
  let added = 0;
  for (const r of rows) {
    if (refs.has(r.ref)) continue;
    const k = norm(r.name);
    if (names.some(x => x && (x === k || (x.length >= 4 && k.includes(x)) || (k.length >= 4 && x.includes(k))))) continue;
    await q(`INSERT INTO outreach_leads(id,name,category,priority,address,phone,website,source,note,created_by,seed_ref) VALUES($1,$2,$3,$4,$5,$6,$7,'OpenStreetMap 台北車站周邊 2km（2026-10-18）',$8,'system',$9) ON CONFLICT DO NOTHING`,
      [uid('ol_'), r.name, r.category, r.priority, r.address, r.phone, r.website, r.note, r.ref]);
    names.push(k); added++;
  }
  await q(`INSERT INTO outreach_meta(key,value) VALUES('seed_osm_20261018',$1) ON CONFLICT DO NOTHING`, [String(added)]);
  return added;
}

function register(app, { auth, adminOnly, requireDb, wrap, q, uid, actorOf, superOnly, rateLimit }) {
  // 權限：超管，或被授予 outreach_access 的言文字管理員（品牌子帳號不開放）
  const gate = (req, res, next) => {
    if (req.auth.brands) return res.status(403).json({ error: '合作開發僅限言文字管理員。' });
    if (req.auth.super !== true && req.auth.outreach_access !== true) return res.status(403).json({ error: '你沒有「合作開發」權限，請向超級管理員申請。' });
    next();
  };
  const base = [auth, adminOnly, requireDb, gate];
  const LEAD_SEL = `id,name,category,stage,priority,address,phone,website,contact_person,owner,coupon_qty,next_action,to_char(next_action_date,'YYYY-MM-DD') AS next_action_date,source,note,score,lat,lon,distance_m,fit_reason,created_by,created_at,updated_at`;

  app.get('/api/admin/outreach', ...base, wrap(async (_req, res) => {
    const leads = (await q(`SELECT ${LEAD_SEL},(SELECT COUNT(*)::int FROM outreach_logs l WHERE l.lead_id=outreach_leads.id) AS log_count,
      (SELECT MAX(created_at) FROM outreach_logs l WHERE l.lead_id=outreach_leads.id) AS last_log_at FROM outreach_leads ORDER BY priority, score DESC NULLS LAST, distance_m NULLS LAST, updated_at DESC`)).rows;
    res.json({ stages: STAGES, categories: CATEGORIES, log_kinds: LOG_KINDS, leads });
  }));

  app.get('/api/admin/outreach/:id/logs', ...base, wrap(async (req, res) => {
    res.json({ logs: (await q(`SELECT id,actor,kind,content,stage_to,created_at FROM outreach_logs WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 200`, [req.params.id])).rows });
  }));

  app.post('/api/admin/outreach/leads', ...base, wrap(async (req, res) => {
    const b = req.body || {};
    let cur = {};
    if (b.id) {
      cur = (await q(`SELECT ${LEAD_SEL} FROM outreach_leads WHERE id=$1`, [b.id])).rows[0];
      if (!cur) return res.status(404).json({ error: '找不到這筆名單。' });
    }
    let v;
    try { v = normalizeLead(b, cur); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    const vals = [v.name, v.category, v.stage, v.priority, v.address, v.phone, v.website, v.contact_person, v.owner, v.coupon_qty, v.next_action, v.next_action_date, v.source, v.note, v.score, v.lat, v.lon, v.distance_m, v.fit_reason];
    if (b.id) {
      await q(`UPDATE outreach_leads SET name=$2,category=$3,stage=$4,priority=$5,address=$6,phone=$7,website=$8,contact_person=$9,owner=$10,coupon_qty=$11,next_action=$12,next_action_date=$13,source=$14,note=$15,score=$16,lat=$17,lon=$18,distance_m=$19,fit_reason=$20,updated_at=now() WHERE id=$1`, [b.id, ...vals]);
      if (cur.stage !== v.stage) await q(`INSERT INTO outreach_logs(id,lead_id,actor,kind,content,stage_to) VALUES($1,$2,$3,'備註',$4,$5)`, [uid('ot_'), b.id, actorOf(req.auth) || '', `階段：${cur.stage} → ${v.stage}`, v.stage]);
      return res.json({ ok: true, id: b.id });
    }
    const id = uid('ol_');
    await q(`INSERT INTO outreach_leads(id,name,category,stage,priority,address,phone,website,contact_person,owner,coupon_qty,next_action,next_action_date,source,note,score,lat,lon,distance_m,fit_reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`, [id, ...vals, actorOf(req.auth) || '']);
    res.status(201).json({ ok: true, id });
  }));

  // 登記開發狀況：一筆跟進紀錄，可同時改階段與下次跟進
  app.post('/api/admin/outreach/leads/:id/logs', ...base, wrap(async (req, res) => {
    const b = req.body || {};
    const cur = (await q(`SELECT stage FROM outreach_leads WHERE id=$1`, [req.params.id])).rows[0];
    if (!cur) return res.status(404).json({ error: '找不到這筆名單。' });
    const content = s(b.content, 2000), kind = s(b.kind, 20) || '備註';
    if (!content) return res.status(400).json({ error: '請填寫開發狀況。' });
    if (!LOG_KINDS.includes(kind)) return res.status(400).json({ error: '紀錄類型無效。' });
    const stage = b.stage ? s(b.stage, 20) : null;
    if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: '階段無效。' });
    const nd = b.next_action_date ? s(b.next_action_date, 10) : null;
    if (nd && !/^\d{4}-\d{2}-\d{2}$/.test(nd)) return res.status(400).json({ error: '下次跟進日期格式應為 YYYY-MM-DD。' });
    const qty = b.coupon_qty === undefined || b.coupon_qty === '' || b.coupon_qty === null ? null : Math.floor(Number(b.coupon_qty));
    if (qty !== null && (!Number.isFinite(qty) || qty < 0 || qty > 100000)) return res.status(400).json({ error: '招待券數量無效。' });
    await q(`INSERT INTO outreach_logs(id,lead_id,actor,kind,content,stage_to) VALUES($1,$2,$3,$4,$5,$6)`, [uid('ot_'), req.params.id, actorOf(req.auth) || '', kind, content, stage && stage !== cur.stage ? stage : null]);
    await q(`UPDATE outreach_leads SET stage=COALESCE($2,stage),next_action=CASE WHEN $3::text IS NULL THEN next_action ELSE $3 END,next_action_date=CASE WHEN $4::text IS NULL THEN next_action_date ELSE $4::date END,coupon_qty=COALESCE($5,coupon_qty),updated_at=now() WHERE id=$1`,
      [req.params.id, stage, b.next_action === undefined ? null : s(b.next_action, 200), nd, qty]);
    res.status(201).json({ ok: true });
  }));

  app.delete('/api/admin/outreach/leads/:id', ...base, superOnly, wrap(async (req, res) => {
    await q(`DELETE FROM outreach_leads WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  }));

  // 超管授予／收回權限
  app.post('/api/admin/users/:id/outreach', auth, adminOnly, superOnly, requireDb, wrap(async (req, res) => {
    const r = await q(`UPDATE users SET outreach_access=$2 WHERE id=$1 AND is_admin=true AND admin_brand IS NULL RETURNING id`, [req.params.id, req.body?.enabled === true]);
    if (!r.rows[0]) return res.status(400).json({ error: '只能授予言文字管理員（需先設為管理員，且不是品牌子帳號）。' });
    res.json({ ok: true, enabled: req.body?.enabled === true });
  }));
}

module.exports = { STAGES, CATEGORIES, LOG_KINDS, normalizeLead, init, register, importSeedFile };
