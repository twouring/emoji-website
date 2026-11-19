'use strict';
/* 資料中樞（KK 2026-11-19）：admin.emoji.tw 是五個品牌社群、廣告、商務開發、KOC 資料的唯一來源；
   所有自動化由 Hermes 執行，Hermes 只透過這組 API 讀寫，不在本機另存一份。
   - social_posts 加 brand／account（IG 四帳號＋Threads）；social_interactions（私訊、回覆紀錄）；social_metrics（每日成效快照）
   - ad_campaigns 加 brand／external_id（Meta 廣告投放）；outreach_leads 加 brand／pipeline／email／ext_key（BD、KOC）
   - automation_jobs：Hermes 與官網排程的最後執行狀態（後台「自動化」頁） */

const BRANDS = Object.freeze({ TTH: '言文字', CAFE: '在咖啡', BAR: '三點水', STAY: '等等空間', REST: '約書旅' });
const ACCOUNTS = Object.freeze({ emoji0701: 'TTH', 'emoji.atcafe': 'CAFE', 'emoji.3am': 'BAR', 'emoji.staysquare': 'STAY', 'emoji.restbook': 'REST' });
const MAIN_ACCOUNTS = ['', 'emoji0701'];   // 官網 ig-publish 只發言文字主帳（版型渲染貼文）；門市帳號由 Hermes 發
const PIPELINES = ['coupon', 'bd', 'koc'];
const INTERACTION_KINDS = ['dm', 'reply', 'comment'];
const INTERACTION_STATUS = ['replied', 'skipped', 'human', 'failed', 'draft'];
const MEDIA_MAX = 30 * 1024 * 1024;   // Cloud Run 請求上限 32MB
const MEDIA_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4' };

const s = (v, n) => String(v ?? '').trim().slice(0, n);
const bad = msg => Object.assign(new Error(msg), { status: 400 });
const brandOf = (b, account) => {
  const v = s(b, 8).toUpperCase() || ACCOUNTS[s(account, 60)] || 'TTH';
  if (!BRANDS[v]) throw bad('品牌無效（TTH／CAFE／BAR／STAY／REST）。');
  return v;
};
const day = v => { const d = s(v, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw bad('日期格式應為 YYYY-MM-DD。'); return d; };
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = b => (Array.isArray(b) ? b : Array.isArray(b?.items) ? b.items : [b]).slice(0, 500);

/* 檔頭判斷實際格式，不信用戶端宣告 */
function sniffMedia(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return 'video/mp4';
  return null;
}

async function init(q) {
  await q(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'TTH'`);
  await q(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS account TEXT NOT NULL DEFAULT ''`);
  await q(`CREATE INDEX IF NOT EXISTS social_posts_account_idx ON social_posts(account, status, scheduled_at)`);
  await q(`CREATE TABLE IF NOT EXISTS social_interactions (
    id TEXT PRIMARY KEY, brand TEXT NOT NULL DEFAULT 'TTH', platform TEXT NOT NULL, account TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'dm', external_id TEXT NOT NULL, counterpart TEXT NOT NULL DEFAULT '', inbound TEXT NOT NULL DEFAULT '',
    reply TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'replied', url TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS social_interactions_ext_idx ON social_interactions(platform, account, external_id)`);
  await q(`CREATE INDEX IF NOT EXISTS social_interactions_at_idx ON social_interactions(at DESC)`);
  await q(`CREATE TABLE IF NOT EXISTS social_metrics (
    day DATE NOT NULL, platform TEXT NOT NULL, account TEXT NOT NULL, brand TEXT NOT NULL DEFAULT 'TTH',
    followers INT, media_count INT, reach INT, views INT, data JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (day, platform, account))`);
  await q(`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'TTH'`);
  await q(`ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS external_id TEXT`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS ad_campaigns_ext_idx ON ad_campaigns(external_id) WHERE external_id IS NOT NULL`);
  await q(`ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'TTH'`);
  await q(`ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS pipeline TEXT NOT NULL DEFAULT 'coupon'`);
  await q(`ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS ext_key TEXT`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS outreach_leads_ext_idx ON outreach_leads(brand, pipeline, ext_key) WHERE ext_key IS NOT NULL`);
  await q(`CREATE TABLE IF NOT EXISTS automation_jobs (
    name TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT 'hermes', label TEXT NOT NULL DEFAULT '', schedule TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT true, last_run_at TIMESTAMPTZ, last_status TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT '',
    next_run_at TIMESTAMPTZ, runs INT NOT NULL DEFAULT 0, failures INT NOT NULL DEFAULT 0, meta JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS cron_ticks (minute TIMESTAMPTZ PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

/* 同一分鐘只分派一次（Hermes 補送或重送都不會重複寄信）。回 true＝這分鐘第一次 */
async function claimTick(q, at) {
  const minute = new Date(Math.floor(at.getTime() / 60000) * 60000);
  const r = await q(`INSERT INTO cron_ticks(minute) VALUES($1) ON CONFLICT DO NOTHING RETURNING minute`, [minute]);
  if (Math.random() < 0.01) await q(`DELETE FROM cron_ticks WHERE minute < now() - interval '3 days'`);
  return r.rows.length > 0;
}

/* 官網排程每次執行結果寫進 automation_jobs（source=website） */
async function recordWebsiteRuns(q, results, schedule = []) {
  for (const r of results) {
    if (!r || r.status === 'skipped' || r.status === 'unknown') continue;
    const cron = schedule.filter(x => x.job === r.job).map(x => x.cron).join('、');
    const failed = r.status === 'error';
    await q(`INSERT INTO automation_jobs(name,source,label,schedule,enabled,last_run_at,last_status,last_error,runs,failures,updated_at)
      VALUES($1,'website',$2,$3,$4,now(),$5,$6,1,$7,now())
      ON CONFLICT(name) DO UPDATE SET schedule=EXCLUDED.schedule,enabled=EXCLUDED.enabled,last_run_at=now(),last_status=EXCLUDED.last_status,
        last_error=CASE WHEN EXCLUDED.last_status='error' THEN EXCLUDED.last_error ELSE automation_jobs.last_error END,
        runs=automation_jobs.runs+1,failures=automation_jobs.failures+EXCLUDED.failures,updated_at=now()`,
    ['website:' + r.job, r.job, cron, r.status !== 'disabled', r.status, s(r.error, 300), failed ? 1 : 0]);
  }
}

function register(app, { auth, adminOnly, requireDb, wrap: wrapApp, q, uid, igPublisher, multer }) {
  const base = [auth, adminOnly, requireDb];
  // 輸入錯誤（status 4xx）照原訊息回，其餘交給 server.js 的 wrap
  const wrap = fn => wrapApp(async (req, res) => { try { await fn(req, res); } catch (e) { if (e && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error: e.message }); throw e; } });
  const send = (res, e) => res.status(e.status || 500).json({ error: e.message });

  // 媒體上傳（圖片、Reels 影片）→ /ig-media/assets/hub-*，IG 可直接抓
  const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: MEDIA_MAX, files: 1, fields: 2, parts: 4 } });
  app.post('/api/admin/hub/media', ...base, (req, res) => {
    up.single('file')(req, res, async err => {
      if (err) return res.status(400).json({ error: err.message });
      try {
        const f = req.file;
        if (!f) return res.status(400).json({ error: 'file required' });
        const mime = sniffMedia(f.buffer.subarray(0, 12));
        if (!mime) return res.status(400).json({ error: '只接受 JPEG、PNG、WebP 圖片或 MP4 影片。' });
        const name = `hub-${Date.now().toString(36)}-${require('node:crypto').randomBytes(4).toString('hex')}${MEDIA_MIME[mime]}`;
        const url = await igPublisher.uploadAsset(f.buffer, name, mime);
        if (!url) return res.status(503).json({ error: '物件儲存未設定。' });
        res.json({ ok: true, url, mime, size: f.size });
      } catch (e) { send(res, e); }
    });
  });

  // 貼文局部更新（發佈器用）：可帶 expect_status 做樂觀鎖（scheduled → publishing 搶單）
  app.patch('/api/admin/hub/posts/:id', ...base, wrap(async (req, res) => {
    const b = req.body || {};
    const sets = [], vals = [req.params.id];
    const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.status !== undefined) { if (!['draft', 'ready', 'scheduled', 'publishing', 'published', 'error', 'archived'].includes(b.status)) throw bad('狀態無效。'); add('status', b.status); }
    if (b.external_url !== undefined) { const u = s(b.external_url, 500); if (u && !/^https?:\/\//.test(u)) throw bad('連結僅接受 http(s)。'); add('external_url', u); }
    if (b.published_at !== undefined) add('published_at', b.published_at ? new Date(b.published_at) : null);
    if (b.scheduled_at !== undefined) add('scheduled_at', b.scheduled_at ? new Date(String(b.scheduled_at).replace(' ', 'T').slice(0, 16) + ':00+08:00') : null);
    if (b.images !== undefined) add('images', JSON.stringify(Array.isArray(b.images) ? b.images : []));
    if (b.metrics !== undefined) { vals.push(JSON.stringify(obj(b.metrics))); sets.push(`metrics=metrics||$${vals.length}::jsonb`); }
    if (b.note) { vals.push(s(b.note, 500)); sets.push(`notes=left(concat($${vals.length}::text, E'\\n', notes), 2000)`); }
    if (!sets.length) throw bad('沒有要更新的欄位。');
    let where = 'id=$1';
    if (b.expect_status) { vals.push(String(b.expect_status)); where += ` AND status=$${vals.length}`; }
    const r = await q(`UPDATE social_posts SET ${sets.join(',')},updated_at=now() WHERE ${where} RETURNING id,status`, vals);
    if (!r.rows[0]) return res.status(409).json({ error: '貼文不存在或狀態已變更。' });
    res.json({ ok: true, ...r.rows[0] });
  }));

  // 互動紀錄（私訊、Threads 回覆、留言）：以 (platform, account, external_id) 去重，重送只更新狀態
  app.get('/api/admin/hub/interactions', ...base, wrap(async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const vals = [days]; let w = `at > now() - ($1||' days')::interval`;
    for (const k of ['platform', 'account', 'brand', 'status', 'kind']) if (req.query[k]) { vals.push(String(req.query[k])); w += ` AND ${k}=$${vals.length}`; }
    const rows = (await q(`SELECT id,brand,platform,account,kind,external_id,counterpart,inbound,reply,status,url,note,at FROM social_interactions WHERE ${w} ORDER BY at DESC LIMIT 1000`, vals)).rows;
    res.json({ interactions: rows });
  }));
  app.post('/api/admin/hub/interactions', ...base, wrap(async (req, res) => {
    let n = 0;
    for (const b of list(req.body)) {
      const platform = s(b.platform, 20), ext = s(b.external_id, 200), kind = s(b.kind, 20) || 'dm', status = s(b.status, 20) || 'replied';
      if (!['ig', 'threads'].includes(platform)) throw bad('platform 限 ig／threads。');
      if (!ext) throw bad('external_id 必填。');
      if (!INTERACTION_KINDS.includes(kind)) throw bad('kind 無效。');
      if (!INTERACTION_STATUS.includes(status)) throw bad('status 無效。');
      const account = s(b.account, 60), brand = brandOf(b.brand, account);
      await q(`INSERT INTO social_interactions(id,brand,platform,account,kind,external_id,counterpart,inbound,reply,status,url,note,at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::timestamptz,now()))
        ON CONFLICT(platform,account,external_id) DO UPDATE SET status=EXCLUDED.status,reply=CASE WHEN EXCLUDED.reply<>'' THEN EXCLUDED.reply ELSE social_interactions.reply END,
          url=CASE WHEN EXCLUDED.url<>'' THEN EXCLUDED.url ELSE social_interactions.url END,note=EXCLUDED.note`,
      [uid('si_'), brand, platform, account, kind, ext, s(b.counterpart, 120), s(b.inbound, 2000), s(b.reply, 2000), status, s(b.url, 500), s(b.note, 500), b.at || null]);
      n++;
    }
    res.json({ ok: true, count: n });
  }));

  // 每日成效快照
  app.get('/api/admin/hub/metrics', ...base, wrap(async (req, res) => {
    const days = Math.min(400, Math.max(1, Number(req.query.days) || 30));
    res.json({ metrics: (await q(`SELECT to_char(day,'YYYY-MM-DD') AS day,platform,account,brand,followers,media_count,reach,views,data FROM social_metrics
      WHERE day > (now() AT TIME ZONE 'Asia/Taipei')::date - $1::int ORDER BY day DESC, account`, [days])).rows });
  }));
  app.post('/api/admin/hub/metrics', ...base, wrap(async (req, res) => {
    let n = 0;
    for (const b of list(req.body)) {
      const platform = s(b.platform, 20) || 'ig', account = s(b.account, 60);
      if (!account) throw bad('account 必填。');
      const int = v => (v === null || v === undefined || v === '' ? null : Math.round(Number(v)) || 0);
      await q(`INSERT INTO social_metrics(day,platform,account,brand,followers,media_count,reach,views,data,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
        ON CONFLICT(day,platform,account) DO UPDATE SET followers=EXCLUDED.followers,media_count=EXCLUDED.media_count,reach=EXCLUDED.reach,views=EXCLUDED.views,data=EXCLUDED.data,updated_at=now()`,
      [day(b.day), platform, account, brandOf(b.brand, account), int(b.followers), int(b.media_count), int(b.reach), int(b.views), JSON.stringify(obj(b.data))]);
      n++;
    }
    res.json({ ok: true, count: n });
  }));

  // Meta 廣告：以 external_id（廣告 id）upsert
  app.post('/api/admin/hub/ads', ...base, wrap(async (req, res) => {
    let n = 0;
    for (const b of list(req.body)) {
      const ext = s(b.external_id, 80); if (!ext) throw bad('external_id 必填。');
      const status = ['planned', 'running', 'done'].includes(b.status) ? b.status : 'running';
      const d = v => (v ? day(v) : null);
      await q(`INSERT INTO ad_campaigns(id,brand,external_id,layer,status,start_date,end_date,budget,spent,metrics,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(external_id) WHERE external_id IS NOT NULL DO UPDATE SET status=EXCLUDED.status,end_date=EXCLUDED.end_date,budget=EXCLUDED.budget,spent=EXCLUDED.spent,
          metrics=ad_campaigns.metrics||EXCLUDED.metrics,notes=EXCLUDED.notes,updated_at=now()`,
      [uid('adc_'), brandOf(b.brand), ext, ['awareness', 'retarget', 'action'].includes(b.layer) ? b.layer : 'awareness', status, d(b.start_date), d(b.end_date),
        Math.max(0, Math.round(Number(b.budget) || 0)), Math.max(0, Math.round(Number(b.spent) || 0)), JSON.stringify(obj(b.metrics)), s(b.notes, 2000)]);
      n++;
    }
    res.json({ ok: true, count: n });
  }));

  // BD／KOC 名單：以 (brand, pipeline, ext_key) upsert；ext_key 用 Email 或 IG 帳號
  const STAGES = ['待開發', '已聯絡', '洽談中', '已合作', '暫不合作'];
  app.get('/api/admin/hub/leads', ...base, wrap(async (req, res) => {
    const vals = []; let w = 'true';
    for (const k of ['brand', 'pipeline', 'stage']) if (req.query[k]) { vals.push(String(req.query[k])); w += ` AND ${k}=$${vals.length}`; }
    res.json({ leads: (await q(`SELECT id,brand,pipeline,ext_key,name,email,category,stage,phone,website,contact_person,next_action,to_char(next_action_date,'YYYY-MM-DD') AS next_action_date,source,note,updated_at
      FROM outreach_leads WHERE ${w} ORDER BY updated_at DESC LIMIT 5000`, vals)).rows });
  }));
  app.post('/api/admin/hub/leads', ...base, wrap(async (req, res) => {
    let n = 0;
    for (const b of list(req.body)) {
      const pipeline = s(b.pipeline, 10); if (!PIPELINES.includes(pipeline)) throw bad('pipeline 限 coupon／bd／koc。');
      const ext = s(b.ext_key, 200).toLowerCase(), name = s(b.name, 120) || ext; if (!ext) throw bad('ext_key 必填。');
      const stage = s(b.stage, 20) || '已聯絡'; if (!STAGES.includes(stage)) throw bad('階段無效。');
      const nd = b.next_action_date ? day(b.next_action_date) : null;
      await q(`INSERT INTO outreach_leads(id,brand,pipeline,ext_key,name,email,category,stage,phone,website,contact_person,next_action,next_action_date,source,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'hermes')
        ON CONFLICT(brand,pipeline,ext_key) WHERE ext_key IS NOT NULL DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,stage=EXCLUDED.stage,
          next_action=EXCLUDED.next_action,next_action_date=EXCLUDED.next_action_date,note=EXCLUDED.note,updated_at=now()`,
      [uid('ol_'), brandOf(b.brand), pipeline, ext, name, s(b.email, 200), s(b.category, 20) || '其他', stage, s(b.phone, 60), s(b.website, 300),
        s(b.contact_person, 80), s(b.next_action, 200), nd, s(b.source, 200), s(b.note, 2000)]);
      n++;
    }
    res.json({ ok: true, count: n });
  }));

  // 自動化總表：Hermes 每 15 分鐘回報自己的排程；官網排程由 /internal/cron 寫入
  app.get('/api/admin/hub/automation', ...base, wrap(async (_req, res) => {
    const jobs = (await q(`SELECT name,source,label,schedule,enabled,last_run_at,last_status,last_error,next_run_at,runs,failures,meta,updated_at FROM automation_jobs ORDER BY source,label`)).rows;
    const tick = (await q(`SELECT max(minute) AS last FROM cron_ticks`)).rows[0];
    res.json({ jobs, last_tick: tick && tick.last });
  }));
  app.post('/api/admin/hub/automation', ...base, wrap(async (req, res) => {
    const items = list(req.body), names = [];
    for (const b of items) {
      const name = s(b.name, 120); if (!name || name.startsWith('website:')) throw bad('name 無效。');
      names.push(name);
      await q(`INSERT INTO automation_jobs(name,source,label,schedule,enabled,last_run_at,last_status,last_error,next_run_at,meta,updated_at)
        VALUES($1,'hermes',$2,$3,$4,$5,$6,$7,$8,$9,now())
        ON CONFLICT(name) DO UPDATE SET label=EXCLUDED.label,schedule=EXCLUDED.schedule,enabled=EXCLUDED.enabled,last_run_at=EXCLUDED.last_run_at,
          last_status=EXCLUDED.last_status,last_error=EXCLUDED.last_error,next_run_at=EXCLUDED.next_run_at,meta=EXCLUDED.meta,updated_at=now()`,
      [name, s(b.label, 120), s(b.schedule, 60), b.enabled !== false, b.last_run_at || null, s(b.last_status, 40), s(b.last_error, 500), b.next_run_at || null, JSON.stringify(obj(b.meta))]);
    }
    // 整份回報（replace:true）時，Hermes 已刪除的任務一併移除
    if (req.body && req.body.replace === true) await q(`DELETE FROM automation_jobs WHERE source='hermes' AND NOT (name = ANY($1::text[]))`, [names]);
    res.json({ ok: true, count: names.length });
  }));

  // 五品牌總覽：給週報與後台首頁讀
  app.get('/api/admin/hub/overview', ...base, wrap(async (_req, res) => {
    const by = async sql => Object.fromEntries((await q(sql)).rows.map(r => [r.brand, r]));
    const posts = await by(`SELECT brand,count(*) FILTER (WHERE status='scheduled')::int AS scheduled,count(*) FILTER (WHERE status='published' AND published_at>now()-interval '7 days')::int AS published_7d,
      count(*) FILTER (WHERE status='error')::int AS errors FROM social_posts GROUP BY brand`);
    const inter = await by(`SELECT brand,count(*) FILTER (WHERE status='replied')::int AS replied_7d,count(*) FILTER (WHERE status='human')::int AS human_7d FROM social_interactions WHERE at>now()-interval '7 days' GROUP BY brand`);
    const ads = await by(`SELECT brand,count(*) FILTER (WHERE status='running')::int AS running,coalesce(sum(spent),0)::int AS spent FROM ad_campaigns GROUP BY brand`);
    const leads = await by(`SELECT brand,count(*) FILTER (WHERE stage NOT IN ('已合作','暫不合作'))::int AS open,count(*) FILTER (WHERE stage='已合作')::int AS won FROM outreach_leads GROUP BY brand`);
    const metrics = (await q(`SELECT DISTINCT ON (platform,account) platform,account,brand,followers,media_count,to_char(day,'YYYY-MM-DD') AS day FROM social_metrics ORDER BY platform,account,day DESC`)).rows;
    res.json({ brands: Object.entries(BRANDS).map(([code, name]) => ({ code, name, posts: posts[code] || {}, interactions: inter[code] || {}, ads: ads[code] || {}, leads: leads[code] || {},
      accounts: metrics.filter(m => m.brand === code) })) });
  }));
}

module.exports = { BRANDS, ACCOUNTS, MAIN_ACCOUNTS, PIPELINES, sniffMedia, init, claimTick, recordWebsiteRuns, register };
