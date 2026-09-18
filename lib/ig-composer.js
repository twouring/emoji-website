'use strict';
/* AI 補產器：每週檢查未來 7 天 IG 排程，不足（預設 3 則）以 Claude API 補滿。
   策略依據：10_品牌與對外溝通/IG發文策略_2026Q4.md（2026-08-17 grilling 定案）。
   - 題材僅 03 金句／04 營業資訊／06 品牌（01/05 待菜價核定、02 活動永遠人工）
   - 素材優先：ig_assets 有未用素材 → 03c 照片疊字；否則純文字版型輪替
   - 04 版型事實欄位硬編（時段／地址不給 AI 編）；caption 一律三語（中→日→英）
   - 產出過 checkBanned＋checkStyle 守門，不過重試；直接 status='scheduled'（無人審已定案）
   依賴注入 { q }，同 ig-publisher。 */

const { checkBanned, checkStyle } = require('./ig-publisher');
const crypto = require('crypto');

const WEEKLY_TARGET = () => Number(process.env.IG_WEEKLY_TARGET || 3);
const AI_MODEL = () => process.env.IG_AI_MODEL || 'claude-sonnet-5';
const MAX_RETRY = 3;

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

const ICON_LIST = 'coffee(咖啡)、moon(夜/凌晨)、book(看書)、beam(挑高木樑/三樓)、people(相遇)、pin(地點/Z10)、clock(時間)、sparkle(亮點)、gift(節慶禮物)、drink(調酒)、rest(休憩/二樓)、floors(三層樓)、calendar(檔期)、heart(感謝)';

// AI 可用版型（07/08 行銷系列＋09 線條 icon）；fixed 欄位硬編、ai 欄位由模型產生
const LAYOUT_SPECS = {
  '09a': { category: '09', variant: 'a', kind: '線條 icon 主視覺（icon 呼應內容）', ai: { icon: `依內容從清單擇一（只寫英文代號）：${ICON_LIST}`, icon_tag: '眉標，8 字內（如：夜 · 凌晨三點）', icon_title: '大標，12 字內', icon_sub: '副句一行，18 字內' }, fixed: {} },
  '09b': { category: '09', variant: 'b', kind: '線條 icon 條列（三點各配 icon）', ai: { icon_tag: '眉標，8 字內', icon_heading: '大標，10 字內', li1_icon: `條列1 icon 代號（清單：${ICON_LIST}）`, li1_text: '條列1，14 字內', li2_icon: '條列2 icon 代號', li2_text: '條列2，14 字內', li3_icon: '條列3 icon 代號', li3_text: '條列3，14 字內' }, fixed: {} },
  '09c': { category: '09', variant: 'c', kind: '深色線條 icon 卡（夜間調性）', ai: { icon: `icon 代號（清單：${ICON_LIST}）`, icon_tag: '眉標，8 字內', icon_title: '大標，12 字內', icon_sub: '副句，18 字內' }, fixed: {} },
  '07a': { category: '07', variant: 'a', kind: 'Hook 大字報（一句話停住滑動）', ai: { hook: 'Hook 主句，12 字內，觀點或金句，要讓人停下來', sub: '支撐句一行，18 字內' }, fixed: {} },
  '07b': { category: '07', variant: 'b', kind: '編輯部條列（大標＋三條列）', ai: { heading: '大標，10 字內', item1: '條列 1（最重要，會上黃底），14 字內', item2: '條列 2，14 字內', item3: '條列 3，14 字內' }, fixed: {} },
  '07c': { category: '07', variant: 'c', kind: '對話卡（受眾痛點問句＋品牌答句）', ai: { question: '25–35 歲上班族的真實痛點問句，16 字內', answer: '言文字的答句，誠實不油，20 字內' }, fixed: {} },
  '08a': { category: '08', variant: 'a', kind: '雜誌封面（照片疊字，需素材）', ai: { cover_eyebrow: '眉標，8 字內（如：三樓 · 工事中）', cover_title: '封面大標，12 字內，呼應照片' }, fixed: {} },
  '08b': { category: '08', variant: 'b', kind: '數字看板（一個數字當主角）', ai: { big_number: '數字本體（如 03:00、24hr、11.01），6 字內', number_label: '數字的意義一句，12 字內', number_desc: '補充說明，26 字內' }, fixed: {} },
};

// 輪替順序（素材優先 → 08a；其餘依序輪替避免連續同型）
const ROTATION = ['09a', '07a', '09b', '07c', '08b', '07b', '09c'];

function pickLayout(recentLayouts, hasAsset) {
  if (hasAsset) return '08a';
  for (const l of ROTATION) if (!recentLayouts.includes(l)) return l;
  return ROTATION[0];
}

// ---- Claude API（直接 fetch，不引 SDK） ----
async function askClaude(system, user) {
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) throw new Error('未設定 ANTHROPIC_API_KEY，AI 補產停用');
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

function systemPrompt(todayStr) {
  return `你是「${BRAND.name}」的 IG 文案主筆。位置：${BRAND.address}（${BRAND.mrt}）。
營業：${BRAND.hours}。空間：${BRAND.floors}。時程：${BRAND.nodes}。
今天是 ${todayStr}。目前階段：${milestone(todayStr)}。

鐵律：
1. 內容必須對應目前階段的真實狀態，絕不超前或虛構進度（真實性是品牌核心資產）。
2. 嚴禁任何住宿類表述（住宿、床位、過夜、hotel、宿泊、ホテル…）；床位一律稱「席位」；二樓口徑＝「24 小時看書休憩」。
2-1. 品牌英文名一律「emoji」、IG 帳號一律「@emoji0701」；嚴禁出現「yanwenzi」任何形式。
2-2. 子品牌固定寫法（中文名＋括號英文，英文 caption 可寫 at cafe／3AM／Stay Square）：一樓白天「在咖啡（at cafe）」輕食咖啡；一樓夜間「三點水（3AM）」對外稱「深夜食堂／餐酒館」（英文 late-night eatery & bistro）；二、三樓「等等空間（Stay Square）」會員共享空間。嚴禁自稱「酒吧」「bar」「Cafe & Bar」「Emoji Cafe & Bar」「Member Plaza」「Talent Lounge」（「吧檯」「酒水」可用）。
2-3. Slogan 一律「讓你平常不會遇到的人，在台北車站旁相遇。」不省略「你」、不改語序。
3. 不用 AI 味用語（賦能、沉浸式、一站式、無縫、極致、快來、別錯過、讓我們一起、delve、unleash、elevate、seamless…）。
4. 表情符號整篇合計最多 2 個，可以完全不用。
5. 語氣：內斂、誠實、短句、像人寫的。不油、不喊口號、不硬銷。參考調性：「把日常，留一點空。」「我們把開了三年的店收起來，搬到重慶南路。」
6. 不提任何價格數字（菜單價格尚未核定）。
7. caption 三語都要寫，日文與英文是道地的在地化改寫，不是逐字翻譯。

只輸出一個 JSON 物件，不要 code fence、不要任何其他文字。`;
}

function userPrompt(spec, recentTitles, assetNote) {
  const aiFields = Object.entries(spec.ai).map(([k, d]) => `  "${k}": "${d}"`).join(',\n');
  return `任務：產生一篇 IG 貼文，版型「${spec.kind}」。
${assetNote ? `照片素材說明：${assetNote}（文字要呼應照片內容）。\n` : ''}近期已排貼文標題（避免主題重複）：${recentTitles.join('、') || '（無）'}

輸出 JSON 格式：
{
${aiFields},
  "title": "後台管理用標題，15 字內，格式：AI｜主題",
  "caption": "中文 caption，3–6 行，行間可空行",
  "caption_ja": "日文 caption，同等內容的在地化改寫",
  "caption_en": "英文 caption，同等內容的在地化改寫",
  "hashtags": "#言文字 #台灣人才聚落 開頭，合計 5–8 個 hashtag，空格分隔"
}`;
}

// ---- 排程日：未來 7 天內未佔用的日子，避開週四主軸；19:00 台北時間 ----
async function pickSlots(deps, count) {
  const taken = (await deps.q(
    `SELECT to_char(scheduled_at AT TIME ZONE 'Asia/Taipei','YYYY-MM-DD') AS d FROM social_posts
     WHERE platform='ig' AND status IN ('scheduled','publishing','published')
       AND scheduled_at BETWEEN now() AND now() + interval '7 days'`,
  )).rows.map(r => r.d);
  const now = new Date(Date.now() + 8 * 3600 * 1000);   // 台北今天
  const slots = [];
  const prefer = [2, 6, 0, 3, 5, 1];                     // 二六日三五一；避開週四(4)主軸
  for (let i = 1; i <= 7 && slots.length < count; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const ds = d.toISOString().slice(0, 10);
    if (d.getUTCDay() === 4 || taken.includes(ds)) continue;
    slots.push({ date: ds, dow: d.getUTCDay() });
  }
  slots.sort((a, b) => prefer.indexOf(a.dow) - prefer.indexOf(b.dow));
  return slots.slice(0, count).map(s => new Date(`${s.date}T19:00:00+08:00`));
}

// ---- 主流程：檢查缺額 → 逐篇產生（守門重試）→ 排入 ----
async function composeWeek(deps) {
  const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const existing = Number((await deps.q(
    `SELECT count(*) AS n FROM social_posts WHERE platform='ig' AND status IN ('scheduled','publishing','published')
     AND scheduled_at BETWEEN now() AND now() + interval '7 days'`,
  )).rows[0].n);
  const need = Math.max(0, WEEKLY_TARGET() - existing);
  if (!need) { console.log(`[ig-compose] 未來 7 天已有 ${existing} 篇，不需補產`); return []; }

  const recent = (await deps.q(
    `SELECT title, pages FROM social_posts WHERE platform='ig' ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 10`,
  )).rows;
  const recentTitles = recent.map(r => r.title);
  const recentLayouts = recent.flatMap(r => (Array.isArray(r.pages) ? r.pages : []))
    .map(p => (p.layout || `${p.category || ''}${p.variant || ''}`));

  const slots = await pickSlots(deps, need);
  const made = [];
  for (const at of slots) {
    // 素材優先：取最舊未用素材
    const asset = (await deps.q(`SELECT * FROM ig_assets WHERE used_by='' ORDER BY created_at LIMIT 1`)).rows[0] || null;
    const lid = pickLayout(recentLayouts.concat(made.map(m => m.layout)), !!asset);
    const spec = LAYOUT_SPECS[lid];

    let post = null, lastErr = '';
    for (let t = 0; t < MAX_RETRY && !post; t++) {
      try {
        const out = await askClaude(systemPrompt(todayStr),
          userPrompt(spec, recentTitles, asset ? asset.note : '') + (lastErr ? `\n\n上次產出未過檢查：${lastErr}。請修正。` : ''));
        const fields = Object.assign({}, spec.fixed);
        for (const k of Object.keys(spec.ai)) fields[k] = String(out[k] || '').trim();
        if (Object.values(fields).some(v => v === '')) throw new Error('欄位缺漏');
        if (asset) fields.photo = asset.url;
        const candidate = {
          title: String(out.title || '').slice(0, 40) || `AI｜${spec.kind}`,
          caption: String(out.caption || ''), caption_ja: String(out.caption_ja || ''), caption_en: String(out.caption_en || ''),
          hashtags: String(out.hashtags || ''),
          pages: [Object.assign({ category: spec.category, variant: spec.variant, format: 'portrait' }, fields)],
        };
        const bad = checkBanned(candidate), style = checkStyle(candidate);
        if (bad.length) throw new Error(`禁用字：${bad.join('、')}`);
        if (style.length) throw new Error(style.join('；'));
        post = candidate;
      } catch (e) { lastErr = e.message; console.warn(`[ig-compose] 第 ${t + 1} 次產出失敗：${e.message}`); }
    }
    if (!post) { console.error(`[ig-compose] ${lid} 連續 ${MAX_RETRY} 次未過守門，本篇放棄`); continue; }

    const id = 'sp_ai_' + crypto.randomBytes(6).toString('hex');
    await deps.q(
      `INSERT INTO social_posts (id,platform,post_type,status,title,caption,caption_en,caption_ja,hashtags,pages,images,scheduled_at,notes)
       VALUES ($1,'ig','image','scheduled',$2,$3,$4,$5,$6,$7,'[]',$8,$9)`,
      [id, post.title, post.caption, post.caption_en, post.caption_ja, post.hashtags,
        JSON.stringify(post.pages), at, `[ig-compose] ${AI_MODEL()} 產生於 ${todayStr}${asset ? `；素材 ${asset.id}` : ''}`],
    );
    if (asset) await deps.q(`UPDATE ig_assets SET used_by=$2 WHERE id=$1`, [asset.id, id]);
    console.log(`[ig-compose] 已排入 ${id}「${post.title}」→ ${at.toISOString()}${asset ? '（帶素材）' : ''}`);
    made.push({ id, layout: lid, at });
  }
  return made;
}

module.exports = { composeWeek, milestone, pickLayout, LAYOUT_SPECS, BRAND, askClaude };
