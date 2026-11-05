'use strict';
/* 遠端列印（KK 11/5）：POP10CI 只有 USB、不支援 CloudPRNT，伺服器無法直接送到 mPOP。
   沒接 mPOP 的裝置（手機、另一台 iPad）把要印的點陣圖（PNG data URL，384 點寬）／開錢櫃指令排進佇列，
   接著 mPOP 的 Star webPRNT Browser（列印站）每 5 秒領取並列印，再回報結果。
   共用 pos_kitchen_print_jobs 表（id 前綴 rp_），不另開表；只領 10 分鐘內的工作，避免很久以後突然出紙。 */
const MAX_IMAGE = 240000;          // base64 字元上限（約 180KB PNG），要在全域 express.json 256kb 之內；58mm 黑白單據實測遠小於此
const MAX_AGE_MIN = 10;
const ID_RE = /^rp_[a-z0-9]{16}$/;
function clean(body, venue, actor) {
  const b = body || {};
  const image = b.image == null || b.image === '' ? null : String(b.image);
  if (image && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE)) return { error: '列印圖檔格式不正確或太大。' };
  const drawer = b.drawer === true;
  if (!image && !drawer) return { error: '沒有要列印的內容。' };
  if (!venue) return { error: '請指定品牌。' };
  const label = String(b.label || '').replace(/[\u0000-\u001f]/g, '').slice(0, 60);
  return { job: { kind: 'remote', venue, image, drawer, label, from: String(actor || '').slice(0, 120) } };
}
const publicJob = (id, row) => ({ id, state: row.job.result || (row.claimed_at ? 'claimed' : 'queued'), label: row.job.label || '', error: row.job.error || '' });
async function enqueue(query, id, job) {
  await query('INSERT INTO pos_kitchen_print_jobs(id,job) VALUES($1,$2)', [id, JSON.stringify(job)]);
}
async function pending(query, venue) {
  const rows = (await query(`SELECT id,job FROM pos_kitchen_print_jobs WHERE id LIKE 'rp\\_%' AND claimed_at IS NULL AND job->>'venue'=$1 AND created_at>now()-($2||' minutes')::interval ORDER BY created_at,id`, [venue, String(MAX_AGE_MIN)])).rows;
  return rows.map(r => ({ id: r.id, ...r.job }));
}
async function claim(query, id, venue, actor) {
  const r = (await query(`UPDATE pos_kitchen_print_jobs SET claimed_at=now(),actor=$3 WHERE id=$1 AND claimed_at IS NULL AND job->>'venue'=$2 AND created_at>now()-($4||' minutes')::interval RETURNING job`, [id, venue, actor, String(MAX_AGE_MIN)])).rows[0];
  return r ? { claimed: true, job: { id, ...r.job } } : { claimed: false };
}
// 列印站回報結果；只能回報一次（result 未設定時）
async function report(query, id, venue, ok, error) {
  const r = (await query(`UPDATE pos_kitchen_print_jobs SET job=job||jsonb_build_object('result',$3::text,'error',$4::text,'image',NULL) WHERE id=$1 AND job->>'venue'=$2 AND claimed_at IS NOT NULL AND NOT (job ? 'result') RETURNING id`, [id, venue, ok ? 'printed' : 'failed', String(error || '').slice(0, 200)])).rows[0];
  return !!r;
}
// 送出端等不到列印站就取消，避免列印站之後才上線、突然出一張沒人在等的單
async function cancel(query, id, venue) {
  const r = (await query(`UPDATE pos_kitchen_print_jobs SET claimed_at=now(),actor='cancelled',job=job||'{"result":"cancelled","image":null}'::jsonb WHERE id=$1 AND job->>'venue'=$2 AND claimed_at IS NULL RETURNING id`, [id, venue])).rows[0];
  return !!r;
}
async function status(query, id, venue) {
  const row = (await query(`SELECT job,claimed_at FROM pos_kitchen_print_jobs WHERE id=$1 AND job->>'venue'=$2`, [id, venue])).rows[0];
  return row ? publicJob(id, row) : null;
}
/* 列印站（KK 11/5）：每個品牌同時只有一台接 mPOP 的裝置（site_content `print_station:<VENUE>`）。
   只有列印站領出餐單與遠端工作；其他裝置（含別台 Star Browser）一律送到列印站，不因自己沒接 mPOP 視為斷線。
   列印站每 5 秒心跳（帶 mPOP 連線狀態）；20 秒沒心跳顯示離線。沒有列印站時，第一台實際連上 mPOP 的 Star Browser 自動成為列印站；
   列印站離線也不自動換人，換台要在新裝置按「改由這台列印」（force）。 */
const STATION_STALE_MS = 20000;
const stationKey = v => 'print_station:' + v;
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
function stationView(raw, now = Date.now()) {
  let s = null; try { s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
  if (!s || !s.device) return null;
  const at = Date.parse(s.at) || 0;
  return { device: s.device, name: s.name || '', since: s.since || '', by: s.by || '', at: s.at || '', online: now - at < STATION_STALE_MS, link: s.link !== false, reason: s.reason || '' };
}
async function getStation(query, venue) {
  return stationView((await query('SELECT value FROM site_content WHERE key=$1', [stationKey(venue)])).rows[0]?.value);
}
// 心跳／接手：force＝明確接手；沒有列印站時只有 mPOP 實際連上（link）才自動接手。回 {station, mine}
async function beat(query, venue, { device, name, link, reason, force = false, actor = '' }) {
  device = String(device || '').trim().slice(0, 80);
  if (!device) return { error: '缺少裝置代碼。' };
  const cur = await getStation(query, venue);
  const mine = cur && cur.device === device;
  if (!mine && !force && (cur || !link)) return { station: cur, mine: false };
  const now = new Date().toISOString();
  const val = { device, name: cleanName(name) || cur?.name || '', at: now, link: !!link, reason: link ? '' : String(reason || '').slice(0, 60), since: mine ? cur.since : now, by: mine ? cur.by : String(actor || '').slice(0, 120) };
  // 條件式寫入：只有目前是自己、沒有人、或 force 才寫，避免兩台同時自動接手
  const r = await query(`INSERT INTO site_content(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()
    WHERE $4::boolean OR COALESCE((site_content.value::jsonb)->>'device','') IN ($3,'') RETURNING value`, [stationKey(venue), JSON.stringify(val), device, !!force]);
  const station = r.rows[0] ? stationView(r.rows[0].value) : await getStation(query, venue);
  return { station, mine: station?.device === device };
}
module.exports = { STATION_STALE_MS, stationView, getStation, beat, clean, enqueue, pending, claim, report, cancel, status, ID_RE, MAX_IMAGE, MAX_AGE_MIN };
