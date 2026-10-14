'use strict';
(function (global) {
  const VENUES = ['CAFE', 'BAR'];
  // 順序＝前台分組順序（餐點在前、飲品在後，依 2026-10-07 定稿菜單）；ALCOHOL／FOOD／SNACK 保留給舊資料相容
  const CATS = [
    'SALAD', 'BREAD', 'JAPANESE', 'DESSERT',
    'COLD_APP', 'HOT_APP', 'FRIED', 'GRILL', 'MAIN', 'SOUP',
    'COFFEE', 'BEVERAGE', 'TEA', 'SPARKLING',
    'SAKE', 'LIQUEUR', 'WINE', 'ALCOHOL',
    'FOOD', 'SNACK', 'OTHER',
  ];
  const ALCOHOL_CATS = ['ALCOHOL', 'SAKE', 'LIQUEUR', 'WINE'];
  const VENUE_LABEL = {
    CAFE: { zh: '在咖啡', en: 'at cafe', ja: '在咖啡' },
    BAR: { zh: '三點水', en: '3AM', ja: '三點水' },
  };
  const CAT_LABEL = {
    COFFEE: { zh: '咖啡', en: 'Coffee', ja: 'コーヒー' },
    TEA: { zh: '茶', en: 'Tea', ja: 'お茶' },
    BEVERAGE: { zh: '非咖啡', en: 'Non-Coffee', ja: 'ノンコーヒー' },
    SPARKLING: { zh: '氣泡飲', en: 'Sparkling', ja: 'スパークリング' },
    SAKE: { zh: '清酒', en: 'Sake', ja: '日本酒' },
    LIQUEUR: { zh: '果實酒', en: 'Fruit Liqueur', ja: '果実酒' },
    WINE: { zh: '甜白葡萄酒', en: 'Sweet White Wine', ja: '甘口白ワイン' },
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
  /* 營業日：三點水營業到翌日 03:00，凌晨的單算前一天；以台北時間減 3 小時取日期（估清、日結都用這個） */
  function businessDay(now) {
    return new Date((now == null ? Date.now() : +new Date(now)) + (8 - 3) * 3600e3).toISOString().slice(0, 10);
  }
  /* 出餐站：飲品／酒水在吧檯，其餘進廚房 */
  const BAR_CATS = ['COFFEE', 'TEA', 'BEVERAGE', 'SPARKLING', 'SAKE', 'LIQUEUR', 'WINE', 'ALCOHOL'];
  function stationOf(item) { return BAR_CATS.includes(item && item.cat) ? 'bar' : 'kitchen'; }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const dateOrEmpty = v => (DATE_RE.test(String(v || '')) ? String(v) : '');
  const uid = () => 'm_' + Math.random().toString(36).slice(2, 10);

  function coerceAlcohol(item) {
    if (ALCOHOL_CATS.includes(item.cat)) return true;
    if (item.note && String(item.note).includes('含酒精')) return true;
    return !!item.alcohol;
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
      price: Number.isFinite(price) ? price : 0,
      emo: Number.isFinite(emo) ? emo : 0,
      note: String(raw.note || '').trim(),
      image: String(raw.image || '').trim(),
      alcohol: coerceAlcohol({ ...raw, cat }),
      published: raw.published === true,
      custom_price: raw.custom_price === true,   // 現場輸入金額（例：其他／客製需求），POS 加點時另外問價
      // 只在 POS／後台加點看得到，不會出現在客人掃碼點餐的菜單；custom_price 一律強制視為 pos_only，
      // 避免客人端 /api/orders/:id/items 的 price 欄位被塞進一個本該由伺服器端信任的覆寫價。
      pos_only: raw.custom_price === true || raw.pos_only === true,
      sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : 0,
      sold_out: dateOrEmpty(raw.sold_out),               // 估清：記營業日，隔天自動恢復
      available_from: dateOrEmpty(raw.available_from),   // 特餐排程：只在這段營業日可點（含）
      available_to: dateOrEmpty(raw.available_to),
    };
  }
  /* 可點：已發布、今天沒估清、在供應期間內（給 /order 與櫃檯用；官網菜單仍用 publishedOnly） */
  function soldOutToday(item, now) { return !!item.sold_out && item.sold_out === businessDay(now); }
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
  const MEMBER_LABEL = { zh: '會員價', en: 'Member', ja: '会員価格' };
  const pick = (label, lang) => label[lang] || label.zh;

  function groupBy(items, key) {
    const map = {}; const order = [];
    items.forEach(it => { if (!map[it[key]]) { map[it[key]] = []; order.push(it[key]); } map[it[key]].push(it); });
    return order.map(k => [k, map[k]]);
  }

  function renderItem(item, lang) {
    const showOrig = item.emo > 0 && item.emo !== item.price;
    const priceHtml = showOrig
      ? '<span class="now">' + pick(MEMBER_LABEL, lang) + ' ' + money(item.emo) + '</span><span class="orig">' + pick(REGULAR_LABEL, lang) + ' ' + money(item.price) + '</span>'
      : '<span class="now">' + money(item.price) + '</span>';
    return '<li class="menu-item' + (item.image ? ' menu-item--img' : '') + '">' +
      (item.image ? '<img class="menu-item__img" src="' + esc(item.image) + '" alt="' + esc(item.zh) + '" loading="lazy">' : '') +
      '<div class="menu-item__names">' +
      '<span class="menu-item__zh">' + esc(item.zh) + '</span>' +
      (item.en ? '<span class="menu-item__en">' + esc(item.en) + '</span>' : '') +
      (item.note ? '<div class="menu-item__note">' + esc(item.note) + '</div>' : '') +
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
    if (items.some(it => it.alcohol)) {
      html += '<p class="menu-notice">未滿十八歲禁止飲酒。禁止酒駕。 / No alcohol under 18. Don\'t drink and drive.</p>';
    }
    return html;
  }

  global.MenuLib = {
    CATS, VENUES, CAT_LABEL, VENUE_LABEL, BAR_CATS, activeVenue, businessDay, stationOf, uid, normalizeItem, parseMenuDoc, validateDoc,
    upsertItem, removeItem, publishedOnly, orderableOnly, isOrderable, soldOutToday, fromSeedRows, stringifyDoc, sortItems, touch, renderMenuHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
