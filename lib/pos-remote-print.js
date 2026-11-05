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
module.exports = { clean, enqueue, pending, claim, report, cancel, status, ID_RE, MAX_IMAGE, MAX_AGE_MIN };
