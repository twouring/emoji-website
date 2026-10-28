'use strict';
(function (global) {
  const VENUES = ['CAFE', 'BAR'];
  // 順序＝前台分組順序（餐點在前、飲品在後，依 2026-10-07 定稿菜單）；ALCOHOL／FOOD／SNACK 保留給舊資料相容
  const CATS = [
    'COMBO',
    'SALAD', 'BREAD', 'JAPANESE', 'DESSERT',
    'COLD_APP', 'HOT_APP', 'FRIED', 'GRILL', 'MAIN', 'SOUP',
    'COFFEE', 'BEVERAGE', 'TEA', 'SPARKLING',
    'SAKE', 'LIQUEUR', 'WINE', 'BEER', 'BOTTLE', 'ALCOHOL',
    'FOOD', 'SNACK', 'OTHER',
  ];
  const ALCOHOL_CATS = ['ALCOHOL', 'SAKE', 'LIQUEUR', 'WINE', 'BEER', 'BOTTLE'];
  const VENUE_LABEL = {
    CAFE: { zh: '在咖啡', en: 'at cafe', ja: '在咖啡' },
    BAR: { zh: '三點水', en: '3AM', ja: '三點水' },
  };
  const CAT_LABEL = {
    COMBO: { zh: '套餐', en: 'Set', ja: 'セット' },
    COFFEE: { zh: '咖啡', en: 'Coffee', ja: 'コーヒー' },
    TEA: { zh: '茶', en: 'Tea', ja: 'お茶' },
    BEVERAGE: { zh: '非咖啡', en: 'Non-Coffee', ja: 'ノンコーヒー' },
    SPARKLING: { zh: '氣泡飲', en: 'Sparkling', ja: 'スパークリング' },
    SAKE: { zh: '清酒', en: 'Sake', ja: '日本酒' },
    LIQUEUR: { zh: '果實酒', en: 'Fruit Liqueur', ja: '果実酒' },
    WINE: { zh: '甜白葡萄酒', en: 'Sweet White Wine', ja: '甘口白ワイン' },
    BEER: { zh: '啤酒', en: 'Beer', ja: 'ビール' },
    BOTTLE: { zh: '整瓶', en: 'Bottle', ja: 'ボトル' },
    ALCOHOL: { zh: '酒精飲品', en: 'Alcohol', ja: 'アルコール' },
    SALAD: { zh: '沙拉／優格', en: 'Salad & Yogurt', ja: 'サラダ・ヨーグルト' },
    BREAD: { zh: '麵包主食', en: 'Bread', ja: 'パン' },
    JAPANESE: { zh: '日式主食', en: 'Japanese', ja: '和食' },
    DESSERT: { zh: '甜點', en: 'Dessert', ja: 'デザート' },
    COLD_APP: { zh: '冷前菜', en: 'Cold Starters', ja: '冷前菜' },
    HOT_APP: { zh: '熱前菜', en: 'Hot Starters', ja: '温前菜' },
    FRIED: { zh: '炸物', en: 'Fried', ja: '揚げ物' },
    GRILL: { zh: '烤物', en: 'Grilled', ja: '焼き物' },
    MAIN: { zh: '主食', en: 'Mains', ja: '主食' },
    SOUP: { zh: '湯品', en: 'Soup', ja: 'スープ' },
    FOOD: { zh: '餐點', en: 'Food', ja: 'フード' },
    SNACK: { zh: '點心', en: 'Snack', ja: 'おやつ' },
    OTHER: { zh: '其他', en: 'Other', ja: 'その他' },
  };
  /* 當下營業品牌（台北時間，UTC+8 無日光節約）：08:00–17:00 在咖啡、17:00–翌日 03:00 三點水、其餘 null。
   * ponytail：只看整點時段，不處理最後加點（16:30／02:00）；要擋再加分鐘判斷。 */
  function activeVenue(now) {
    const h = (new Date(now ?? Date.now()).getUTCHours() + 8) % 24;
    return h >= 8 && h < 17 ? 'CAFE' : (h >= 17 || h < 3) ? 'BAR' : null;
  }
  /* 掃碼點餐時段（台北時間）：與 POS 的 activeVenue 分開——
   *   08:00–16:00 在咖啡（餐點＋飲品）、16:00–16:30 在咖啡只剩飲品；
   *   16:30 起換三點水菜單，02:00 後只剩酒水、02:30 後停止點餐，到 08:00 在咖啡開門。
   * 回 { venue, food, drink }；非點餐時段 venue＝null。飲品／酒水＝BAR_CATS（吧檯出），其餘（含套餐）算餐點。 */
  function orderWindow(now) {
    const d = new Date(now ?? Date.now()), m = ((d.getUTCHours() + 8) % 24) * 60 + d.getUTCMinutes();
    if (m >= 480 && m < 960) return { venue: 'CAFE', food: true, drink: true };
    if (m >= 960 && m < 990) return { venue: 'CAFE', food: false, drink: true };
    if (m >= 990 || m < 120) return { venue: 'BAR', food: true, drink: true };
    if (m < 150) return { venue: 'BAR', food: false, drink: true };
    return { venue: null, food: false, drink: false };
  }
  function orderableInWindow(item, w) {
    if (!item || !w || !w.venue || item.venue !== w.venue) return false;
    return BAR_CATS.includes(item.cat) ? w.drink : w.food;
  }
  /* 營業日：三點水營業到翌日 03:00，凌晨的單算前一天；以台北時間減 3 小時取日期（估清、日結都用這個） */
  function businessDay(now) {
    return new Date((now == null ? Date.now() : +new Date(now)) + (8 - 3) * 3600e3).toISOString().slice(0, 10);
  }
  /* 三點水服務費與低消（10/19 員工大會 K3；KK 會後確認 11/1 起實施）。POS 畫面與伺服器結帳共用這一份。
   * - 服務費：三點水內用品項外加 10%，以折扣後金額按比例計、四捨五入到元；在咖啡、外帶不收。
   * - 低消：三點水每人平日 300、假日（營業日週六、週日）600；POS 只提醒差額，不自動補收。
   * 生效日看營業日（凌晨 03:00 前的單算前一天）。 */
  const BAR_POLICY_FROM = '2026-11-01';
  const SERVICE_RATE = 0.1;
  const MIN_SPEND = { weekday: 300, weekend: 600 };
  function barPolicyActive(now) { return businessDay(now) >= BAR_POLICY_FROM; }
  function minSpendOf(people, now) {
    const n = Math.floor(Number(people));
    if (!barPolicyActive(now) || !(n >= 1)) return null;
    const dow = new Date(businessDay(now) + 'T12:00:00Z').getUTCDay();
    const per = dow === 0 || dow === 6 ? MIN_SPEND.weekend : MIN_SPEND.weekday;
    return { per, people: n, total: per * n, weekend: per === MIN_SPEND.weekend };
  }
  /* lines：這次要結的行（price 已是實收單價）；discount：整單折扣金額。force＝不看生效日（作廢品項時重算已收的單） */
  function serviceCharge(lines, opts) {
    const o = opts || {};
    if (o.takeout || (!o.force && !barPolicyActive(o.now))) return null;
    const goods = (lines || []).filter(l => l && !l.credit_of && !l.prepay && !l.cancelled && !l.tip);   // 打賞是代收給表演者，不算服務費
    const total = ls => ls.reduce((a, l) => a + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
    const gross = total(goods), bar = total(goods.filter(l => l.venue === 'BAR'));
    if (!(bar > 0) || !(gross > 0)) return null;
    const base = Math.round(bar * Math.max(0, gross - (Number(o.discount) || 0)) / gross);
    const amount = Math.round(base * SERVICE_RATE);
    return amount > 0 ? { rate: SERVICE_RATE, base, amount } : null;
  }
  /* 出餐站：飲品／酒水在吧檯，其餘進廚房 */
  const BAR_CATS = ['COFFEE', 'TEA', 'BEVERAGE', 'SPARKLING', 'SAKE', 'LIQUEUR', 'WINE', 'BEER', 'BOTTLE', 'ALCOHOL'];
  function stationOf(item) { return BAR_CATS.includes(item && item.cat) ? 'bar' : 'kitchen'; }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const dateOrEmpty = v => (DATE_RE.test(String(v || '')) ? String(v) : '');
  const uid = () => 'm_' + Math.random().toString(36).slice(2, 10);
  const STOCK_MAX = 9999;
  const stockOrNull = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(STOCK_MAX, Math.floor(Number(v)))));

  // 會員價：品項有填 emo（>0）就用它；空白／0＝原價九折（四捨五入）。現場輸入金額的品項（custom_price）不打折。
  const MEMBER_RATE = 0.9;
  function memberPrice(item, base) {
    if (!item) return 0;
    const price = Number.isFinite(Number(base)) && base !== undefined && base !== null ? Number(base) : Number(item.price);
    if (item.custom_price === true) return price;
    const emo = Number(item.emo);
    if (Number.isFinite(emo) && emo > 0) return emo;
    return Math.round(price * MEMBER_RATE);
  }

  function coerceAlcohol(item) {
    if (ALCOHOL_CATS.includes(item.cat)) return true;
    if (item.note && String(item.note).includes('含酒精')) return true;
    return !!item.alcohol;
  }

  /* 套餐內容：[{key,label,choices:[{zh,add}]}]；choices 以菜單品名（zh）對應同店品項，add＝該選項加價。
   * 例：[{key:'main',label:'主餐',choices:[{zh:'原味貝果',add:0}]},{key:'drink',label:'飲品',choices:[{zh:'美式咖啡',add:0}]}] */
  function normalizeCombo(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 6).map((s, i) => {
      const choices = (Array.isArray(s && s.choices) ? s.choices : []).slice(0, 12).map(c => {
        const zh = String(typeof c === 'string' ? c : (c && c.zh) || '').trim();
        const add = Math.max(0, Math.min(1000, Math.round(Number(c && c.add)) || 0));
        const id = String((c && c.id) || '').trim().slice(0, 40);
        return zh || id ? (id ? { id, zh, add } : { zh, add }) : null;
      }).filter(Boolean);
      const label = String((s && s.label) || '').trim().slice(0, 12);
      return label && choices.length ? { key: String((s && s.key) || 's' + (i + 1)).replace(/[^a-z0-9_]/gi, '').slice(0, 12) || 's' + (i + 1), label, choices } : null;
    }).filter(Boolean);
  }

  /* 套餐選項對應菜單品項：有 id 先用 id（品項改名也不脫鉤），沒有才用品名；只找同店、非套餐的品項 */
  function comboTarget(choice, items, venue) {
    const pool = (items || []).filter(x => x.venue === venue && x.cat !== 'COMBO');
    return (choice.id && pool.find(x => x.id === choice.id)) || pool.find(x => x.zh === choice.zh) || null;
  }
  /* 把選項的 id 補齊、品名同步成菜單現名（後台存檔、開機回填時用）；回傳是否有改 */
  function linkCombo(item, items) {
    let changed = false;
    for (const s of item.combo || []) for (const c of s.choices) {
      const m = comboTarget(c, items, item.venue);
      if (m && (c.id !== m.id || c.zh !== m.zh)) { c.id = m.id; c.zh = m.zh; changed = true; }
    }
    return changed;
  }

  /* 後台用文字編輯套餐：每行一個選擇欄「主餐：原味貝果、無花果核桃蜂蜜奶油貝果+70」（+數字＝加價） */
  function comboToText(combo) {
    return normalizeCombo(combo).map(s => s.label + '：' + s.choices.map(c => c.zh + (c.add ? '+' + c.add : '')).join('、')).join('\n');
  }
  function comboFromText(text) {
    return normalizeCombo(String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
      const k = l.search(/[：:]/);
      const choices = (k < 0 ? '' : l.slice(k + 1)).split(/[、,，]/).map(x => x.trim()).filter(Boolean).map(x => {
        const m = x.match(/^(.*?)\s*\+\s*(\d+)$/);
        return m ? { zh: m[1].trim(), add: Number(m[2]) } : { zh: x, add: 0 };
      });
      return { key: ['main', 'drink', 'side', 's4', 's5', 's6'][i], label: k < 0 ? l : l.slice(0, k).trim(), choices };
    }));
  }

  function normalizeItem(raw) {
    const cat = CATS.includes(raw.cat) ? raw.cat : 'FOOD';
    const venue = VENUES.includes(raw.venue) ? raw.venue : 'CAFE';
    const price = Number(raw.price); const emo = Number(raw.emo);
    return {
      id: raw.id || uid(),
      venue,
      cat,
      zh: String(raw.zh || '').trim(),
      en: String(raw.en || '').trim(),
      ja: String(raw.ja || '').trim(),
      price: Number.isFinite(price) ? price : 0,
      emo: Number.isFinite(emo) ? emo : 0,
      points: Math.max(0, Math.min(100000, Math.floor(Number(raw.points)) || 0)),   // 兌換所需點數；0＝不開放點數兌換（餐飲或服務品項都可設）
      note: String(raw.note || '').trim(),
      note_ja: String(raw.note_ja || '').trim(),
      note_en: String(raw.note_en || '').trim(),
      image: String(raw.image || '').trim(),
      combo: cat === 'COMBO' ? normalizeCombo(raw.combo) : [],   // 套餐內容（只有 COMBO 類別有效）
      alcohol: coerceAlcohol({ ...raw, cat }),
      published: raw.published === true,
      custom_price: raw.custom_price === true,   // 現場輸入金額（例：其他／客製需求），POS 加點時另外問價
      // 只在 POS／後台加點看得到，不會出現在客人掃碼點餐的菜單；custom_price 一律強制視為 pos_only，
      // 避免客人端 /api/orders/:id/items 的 price 欄位被塞進一個本該由伺服器端信任的覆寫價。
      pos_only: raw.custom_price === true || raw.pos_only === true,
      sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : 0,
      sold_out: dateOrEmpty(raw.sold_out),               // 估清：記營業日，隔天自動恢復
      stock_day: dateOrEmpty(raw.stock_day),             // 剩餘份數：只在這個營業日有效（隔天 03:00 自動失效＝不限量）
      stock_left: stockOrNull(raw.stock_left),           // 剩幾份（null＝不限量）；送單扣、扣到 0＝售完
      available_from: dateOrEmpty(raw.available_from),   // 特餐排程：只在這段營業日可點（含）
      available_to: dateOrEmpty(raw.available_to),
    };
  }
  /* 可點：已發布、今天沒估清、在供應期間內（給 /order 與櫃檯用；官網菜單仍用 publishedOnly） */
  /* 今天剩幾份：有設且是今天營業日才算，否則 null（不限量） */
  function stockLeft(item, now) {
    return item && item.stock_day && item.stock_day === businessDay(now) && Number.isInteger(item.stock_left) ? item.stock_left : null;
  }
  function soldOutToday(item, now) { return (!!item.sold_out && item.sold_out === businessDay(now)) || stockLeft(item, now) === 0; }
  /* ctx.posOnly=true 時才把 pos_only 品項算進可點範圍（POS／後台代客加點用）；
   * 客人掃碼點餐（/order）與任何沒傳 ctx 的呼叫，一律看不到 pos_only 品項。 */
  function isOrderable(item, now, ctx) {
    if (!item.published || soldOutToday(item, now)) return false;
    if (item.pos_only && !(ctx && ctx.posOnly)) return false;
    const day = businessDay(now);
    if (item.available_from && day < item.available_from) return false;
    if (item.available_to && day > item.available_to) return false;
    return true;
  }
  function orderableOnly(doc, now, ctx) { return (doc.items || []).filter(it => isOrderable(it, now, ctx)); }

  function parseMenuDoc(value) {
    if (!value || !String(value).trim()) return { version: 1, updated_at: null, items: [] };
    try {
      const j = JSON.parse(value);
      const items = Array.isArray(j.items) ? j.items.map(normalizeItem) : [];
      return { version: Number(j.version) || 1, updated_at: j.updated_at || null, items };
    } catch {
      return { version: 1, updated_at: null, items: [] };
    }
  }

  function validateDoc(doc) {
    if (!doc || !Array.isArray(doc.items)) return { ok: false, error: '格式錯誤' };
    if (JSON.stringify(doc).length > 500000) return { ok: false, error: '菜單資料過大' };
    for (const it of doc.items) {
      if (!it.zh) return { ok: false, error: '品名（中）必填' };
      if (!VENUES.includes(it.venue)) return { ok: false, error: '店別無效' };
      if (!CATS.includes(it.cat)) return { ok: false, error: '分類無效' };
      if (!(it.price >= 0) || !(it.emo >= 0)) return { ok: false, error: '價格無效' };
      if (it.cat === 'COMBO' && !(Array.isArray(it.combo) && it.combo.length)) return { ok: false, error: '套餐要有內容（至少一個選擇欄）：' + it.zh };
      if (it.image && !/^(\/uploads\/|https:\/\/)/.test(it.image)) return { ok: false, error: '圖片網址須為 /uploads/ 路徑或 https URL：' + it.zh };
    }
    return { ok: true };
  }

  function touch(doc) {
    return { ...doc, version: doc.version || 1, updated_at: new Date().toISOString(), items: doc.items.slice() };
  }

  function upsertItem(doc, raw) {
    const item = normalizeItem(raw);
    const next = touch(doc);
    const i = next.items.findIndex(x => x.id === item.id);
    if (i >= 0) next.items[i] = item; else next.items.push(item);
    return next;
  }

  function removeItem(doc, id) {
    const next = touch(doc);
    next.items = next.items.filter(x => x.id !== id);
    return next;
  }

  /* 對外可見（官網菜單頁、IG）：已發布且非 POS 限定；pos_only 品項（例：其他）只在 POS／後台加點出現 */
  function publishedOnly(doc) {
    return (doc.items || []).filter(x => x.published && !x.pos_only);
  }

  function fromSeedRows(rows) {
    const items = (rows || []).map((r, i) => normalizeItem({
      ...r,
      published: false,
      sort: (i + 1) * 10,
      alcohol: r.alcohol === true || ALCOHOL_CATS.includes(r.cat) || (r.note && String(r.note).includes('含酒精')),
    }));
    return touch({ version: 1, items });
  }

  function stringifyDoc(doc) {
    return JSON.stringify(doc);
  }

  function sortItems(items) {
    return items.slice().sort((a, b) => {
      const va = VENUES.indexOf(a.venue) - VENUES.indexOf(b.venue);
      if (va !== 0) return va;
      const ca = CATS.indexOf(a.cat) - CATS.indexOf(b.cat);
      if (ca !== 0) return ca;
      return (a.sort - b.sort) || a.zh.localeCompare(b.zh, 'zh-Hant');
    });
  }

  /* ---- 前台 HTML（space 頁三語共用） ---- */
  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = n => 'NT$' + Number(n || 0).toLocaleString('zh-TW');
  const REGULAR_LABEL = { zh: '一般價', en: 'Regular', ja: '一般価格' };
  const MEMBER_LABEL = { zh: '聚落價', en: 'Hub rate', ja: 'ハブ価格' };
  const pick = (label, lang) => label[lang] || label.zh;

  function groupBy(items, key) {
    const map = {}; const order = [];
    items.forEach(it => { if (!map[it[key]]) { map[it[key]] = []; order.push(it[key]); } map[it[key]].push(it); });
    return order.map(k => [k, map[k]]);
  }

  function renderItem(item, lang) {
    const mp = memberPrice(item);
    const showOrig = mp > 0 && mp < item.price;
    const priceHtml = showOrig
      ? '<span class="now">' + pick(MEMBER_LABEL, lang) + ' ' + money(mp) + '</span><span class="orig">' + pick(REGULAR_LABEL, lang) + ' ' + money(item.price) + '</span>'
      : '<span class="now">' + money(item.price) + '</span>';
    return '<li class="menu-item' + (item.image ? ' menu-item--img' : '') + '">' +
      (item.image ? '<img class="menu-item__img" src="' + esc(item.image) + '" alt="' + esc(item.zh) + '" loading="lazy">' : '') +
      '<div class="menu-item__names">' +
      '<span class="menu-item__zh">' + esc(lang === 'ja' && item.ja ? item.ja : item.zh) + '</span>' +
      (lang === 'ja' ? (item.ja ? '<span class="menu-item__en">' + esc(item.zh) + '</span>' : '') : (item.en ? '<span class="menu-item__en">' + esc(item.en) + '</span>' : '')) +
      (function (n) { return n ? '<div class="menu-item__note">' + esc(n) + '</div>' : ''; })(lang === 'ja' && item.note_ja ? item.note_ja : lang === 'en' && item.note_en ? item.note_en : item.note) +
      (item.cat === 'COMBO' && item.combo && item.combo.length ? '<div class="menu-item__note">' + item.combo.map(function (s) { return esc(s.label + '：' + s.choices.map(function (c) { return c.zh + (c.add ? '（+' + c.add + '）' : ''); }).join(' / ')); }).join('<br>') + '</div>' : '') +
      '</div><div class="menu-item__price">' + priceHtml + '</div></li>';
  }

  function renderGroup(cat, items, lang) {
    const label = CAT_LABEL[cat] || { zh: cat, en: '', ja: cat };
    const sub = lang === 'zh' ? label.en : '';
    return '<section class="menu-group"><div class="menu-group__head">' +
      '<h3 class="menu-group__zh">' + esc(pick(label, lang)) + '</h3>' +
      (sub ? '<span class="menu-group__en">' + esc(sub) + '</span>' : '') +
      '</div><ul class="menu-list">' + items.map(it => renderItem(it, lang)).join('') + '</ul></section>';
  }

  // items 須已 sortItems；依店別（在咖啡／三點水）再依分類分組
  function renderMenuHtml(items, lang, emptyText) {
    lang = lang || 'zh';
    if (!items || !items.length) return '<p class="menu-empty">' + esc(emptyText || '') + '</p>';
    let html = groupBy(items, 'venue').map(([venue, list]) => {
      const label = VENUE_LABEL[venue] || { zh: venue, en: '' };
      const title = lang === 'en' ? label.en : label.zh;
      const sub = lang === 'en' ? label.zh : label.en;
      return '<section class="menu-venue" id="menu-' + venue.toLowerCase() + '"><h2 class="menu-venue__title">' +
        esc(title) + '<span class="menu-venue__sub">' + esc(sub) + '</span></h2>' +
        groupBy(list, 'cat').map(([cat, l]) => renderGroup(cat, l, lang)).join('') + '</section>';
    }).join('');
    if (items.some(it => memberPrice(it) > 0 && memberPrice(it) < it.price)) {
      const N = {
        zh: '聚落價限已加入聚落者享有。加入方式：購買等等空間會員方案或單日會員。',
        en: 'Hub rates are for Hub members only. Join by buying a Stay Square membership plan or a day pass.',
        ja: 'ハブ価格は、ハブに参加された方のみ。等等空間の会員プランまたは1日会員の購入で参加できます。',
      };
      html += '<p class="menu-notice">' + esc(pick(N, lang)) + '</p>';
    }
    if (items.some(it => it.venue === 'BAR') && barPolicyActive()) {
      const B = {
        zh: '三點水低消每人平日 NT$300、假日 NT$600，另加 10% 服務費（外帶不收）。',
        en: '3AM minimum spend: NT$300 per person on weekdays, NT$600 on weekends, plus a 10% service charge (not for takeout).',
        ja: '三點水（3AM）は最低ご利用額 平日お一人様 NT$300・週末 NT$600、別途サービス料 10%（お持ち帰りは除く）。',
      };
      html += '<p class="menu-notice">' + esc(pick(B, lang)) + '</p>';
    }
    if (items.some(it => it.alcohol)) {
      html += '<p class="menu-notice">未滿十八歲禁止飲酒。禁止酒駕。 / No alcohol under 18. Don\'t drink and drive.</p>';
    }
    return html;
  }

  global.MenuLib = {
    CATS, VENUES, CAT_LABEL, VENUE_LABEL, BAR_CATS, MEMBER_RATE, BAR_POLICY_FROM, SERVICE_RATE, MIN_SPEND, barPolicyActive, minSpendOf, serviceCharge, memberPrice, activeVenue, orderWindow, orderableInWindow, businessDay, stationOf, uid, normalizeItem, parseMenuDoc, validateDoc,
    normalizeCombo, comboTarget, linkCombo, comboToText, comboFromText, upsertItem, removeItem, publishedOnly, orderableOnly, isOrderable, soldOutToday, stockLeft, STOCK_MAX, fromSeedRows, stringifyDoc, sortItems, touch, renderMenuHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
