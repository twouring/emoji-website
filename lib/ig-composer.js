'use strict';
/* X 貼文 AI 起草共用：品牌事實、施工里程碑、Claude API 呼叫。
   IG 雲端補產器已移除（2026-09-27：ANTHROPIC_API_KEY 從未設定，改由 Claude Code 本機產文，見 scripts/ig-local-fill.mjs）。 */

const AI_MODEL = () => process.env.IG_AI_MODEL || 'claude-sonnet-5';

// ---- 品牌事實（AI 不得自行編造，一律以此為準） ----
const BRAND = {
  name: '言文字｜台灣人才聚落',
  handle: '@emoji0701',
  place: '重慶南路',
  address: '中正區重慶南路一段 11 號',
  mrt: '台北車站 · Z10 出口',
  hours: '在咖啡（at cafe）08:00–17:00、三點水（3AM）17:00–27:00',
  floors: '一樓白天在咖啡（at cafe）輕食咖啡、晚上三點水（3AM）深夜食堂餐酒館；二、三樓等等空間（Stay Square）會員 24 小時看書休憩與共享辦公活動',
  nodes: '10/13 試營運、11/1 正式開幕',
};

// 施工里程碑（內容鐵律：敘事不得超前實際進度）
// 依 20_空間設計與工程/施工時程/260817_施工時程總表_日曆整理.md：
// 7/31 施工進場 → 8 月拆除／水電 → 9 月鐵工木作系統櫃油漆 → 10/2–9 搬家具 → 10/13 試營運 → 11/1 開幕
function milestone(dateStr) {
  if (dateStr < '2026-08-31') return '拆除與水電施工中（7/31 進場，8 月拆除／打除／水電配管）：可講工地實錄、拆除發現、管線與取捨，不得說木作或裝潢已完成';
  if (dateStr < '2026-09-15') return '鐵工與木作施工中（8/31 起鐵工、9/6 起木作、9/8 起系統櫃）：可講結構成形、木作進度，不得說已完工';
  if (dateStr < '2026-10-02') return '油漆與設備收尾（9/15 起油漆、廚具進場）：可講快完工的樣子與期待，不得說已開幕';
  if (dateStr < '2026-10-13') return '家具進場搬遷（10/2–9），試營運倒數：可預告 10/13 試營運';
  if (dateStr < '2026-11-01') return '試營運（10/13 起，刻意低調）：誠實敘事「量能有限、邊開邊修」，不衝導流';
  return '正式營運（11/1 開幕後）：主軸「店裡的人」、營運日常與節慶檔期';
}

// ---- Claude API（直接 fetch，不引 SDK） ----
async function askClaude(system, user) {
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) throw new Error('未設定 ANTHROPIC_API_KEY，AI 起草停用');
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const r = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL(), max_tokens: 1500, system, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Claude API：${JSON.stringify(j.error || j)}`);
  const text = (j.content && j.content[0] && j.content[0].text) || '';
  const m = text.match(/\{[\s\S]*\}/);           // 容忍模型偶帶前後語或 code fence
  if (!m) throw new Error('AI 回應不含 JSON');
  return JSON.parse(m[0]);
}

module.exports = { milestone, BRAND, askClaude };
