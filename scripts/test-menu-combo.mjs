import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../lib/table-orders.js');
const { COMBOS, comboBackfill } = require('../lib/menu-combos.js');
const win = {};
vm.runInNewContext(fs.readFileSync(new URL('../public/order-lib.js', import.meta.url), 'utf8'), { window: win, console });
const O = win.OrderLib;

const mk = (zh, cat, price) => ({ id: 'i_' + zh, venue: 'CAFE', cat, zh, en: '', ja: '', price, published: true, note: '' });
const base = [mk('原味貝果', 'BREAD', 80), mk('無花果核桃蜂蜜奶油貝果', 'BREAD', 150), mk('美式咖啡', 'COFFEE', 150), mk('拿鐵咖啡', 'COFFEE', 180), { ...mk('柚子氣泡', 'SPARKLING', 160), id: 'm_3x1e32pd' }, { ...mk('莓果氣泡', 'SPARKLING', 160), id: 'm_ev482pfl' }, { ...mk('鳳梨氣泡', 'SPARKLING', 160), id: 'm_i3w9zd36' },
  mk('海苔馬告豬肉時雨煮飯糰', 'JAPANESE', 220), mk('鹽烤雞腿昆布飯糰', 'JAPANESE', 240), mk('奶油松露野菇炒蛋開放式三明治', 'BREAD', 300), mk('燻鮭魚酪梨蒔蘿奶油開放式三明治', 'BREAD', 320),
  mk('明太子美式炒蛋可頌', 'BREAD', 320), mk('自製布丁・鹹鮮奶油', 'DESSERT', 120), { ...mk('柚香紫蘇雞腿冷蕎麥麵', 'JAPANESE', 320), id: 'm_8qx9kqre' }, mk('巴斯克蛋糕', 'DESSERT', 100), mk('藍莓起司蛋糕', 'DESSERT', 100)];
const items = base.slice(); comboBackfill(items);
const menu = new Map(items.map(i => [i.id, i]));
const combo = zh => items.find(i => i.zh === zh);

test('回填：四個套餐、內容都對得到菜單品項；做兩次不重複', () => {
  assert.equal(COMBOS.length, 5);
  assert.equal(comboBackfill(items), 0);
  for (const c of COMBOS) for (const s of c.combo) for (const ch of s.choices) assert.ok(base.some(b => b.zh === ch.zh && (!ch.id || b.id === ch.id)), c.zh + ' → ' + ch.zh);
  assert.deepEqual(COMBOS.map(c => c.zh), ['貝果套餐', '飯糰套餐', '早午餐套餐', '麵套餐', '下午茶套餐']);
});
test('加點套餐：沒選內容 400；選到不在套餐內的 400；價格＝套餐價＋伺服器算的加價', () => {
  const it = combo('貝果套餐');
  assert.throws(() => T.posAddLine([], menu, { item_id: it.id, qty: 1 }), /還沒選/);
  assert.throws(() => T.posAddLine([], menu, { item_id: it.id, qty: 1, combo: { main: { zh: '巴斯克蛋糕' }, drink: { zh: '美式咖啡' } } }), /還沒選/);
  const out = T.posAddLine([], menu, { item_id: it.id, qty: 2, combo: { main: { zh: '無花果核桃蜂蜜奶油貝果', note: '' }, drink: { zh: '拿鐵咖啡', note: '溫度：熱；糖度：半糖' } }, price: 1 });
  assert.equal(out[0].price, 200 + 50 + 30);
  assert.equal(out[0].qty, 2);
  assert.equal(out[0].parts.map(p => p.slot + ':' + p.zh).join('|'), '貝果:無花果核桃蜂蜜奶油貝果|飲品:拿鐵咖啡');
  assert.equal(out[0].parts[1].note, '溫度：熱；糖度：半糖');
});
test('同一套餐不同內容不合併成同一行', () => {
  const it = combo('飯糰套餐'), pick = d => ({ main: { zh: '鹽烤雞腿昆布飯糰' }, drink: { zh: d } });
  let r = T.posAddLine([], menu, { item_id: it.id, qty: 1, combo: pick('美式咖啡') });
  r = T.posAddLine(r, menu, { item_id: it.id, qty: 1, combo: pick('柚子氣泡') });
  assert.equal(r.length, 2);
});
test('選項今天供應不了（估清／下架）就擋下', () => {
  const m2 = new Map(menu); m2.delete('i_美式咖啡');
  assert.throws(() => T.posAddLine([], m2, { item_id: combo('貝果套餐').id, qty: 1, combo: { main: { zh: '原味貝果' }, drink: { zh: '美式咖啡' } } }), /無法供應/);
});
test('套餐不套聚落價', () => {
  const [l] = T.posAddLine([], menu, { item_id: combo('貝果套餐').id, qty: 1, combo: { main: { zh: '原味貝果' }, drink: { zh: '美式咖啡' } } });
  assert.equal(T.applyMemberPrice([l], menu)[0].price, 200);
});
test('comboGroups：每欄一組單選；選到的品項帶出自己的規格，切換選項時顯示／隱藏', () => {
  const g = O.comboGroups(combo('貝果套餐'), items, 'zh');
  const main = g.find(x => x.key === 'main'), drink = g.find(x => x.key === 'drink');
  assert.equal(main.choices.join('|'), '原味貝果|無花果核桃蜂蜜奶油貝果 (+50)');
  assert.equal(drink.choices.join('|'), '美式咖啡|拿鐵咖啡 (+30)|柚子氣泡|莓果氣泡|鳳梨氣泡');
  const picks = { main: main.choices[0], drink: drink.choices[0] };
  g.filter(x => !x.combo).forEach(x => { picks[x.key] = x.choices[0]; });
  const act = () => O.activeOptionGroups(g, picks).filter(x => x.sub).map(x => x.label);
  assert.ok(act().some(l => l.startsWith('美式咖啡・溫度')));
  assert.ok(act().some(l => l.startsWith('美式咖啡・冰塊')), '美式預設冰 → 有冰塊');
  assert.ok(!act().some(l => l.startsWith('拿鐵咖啡')));
  picks.drink = drink.choices[1];
  assert.ok(act().some(l => l.startsWith('拿鐵咖啡・溫度')));
  assert.ok(!act().some(l => /糖度/.test(l)), '全店已不問糖度');
  picks.drink = drink.choices[2];
  assert.deepEqual(act().filter(l => l.startsWith('柚子氣泡')).length, 1, '氣泡只有冰塊');
});
test('comboPayload：只送選中品項的規格，出餐單才不會混進別杯的選項', () => {
  const g = O.comboGroups(combo('貝果套餐'), items, 'zh'), picks = {};
  g.forEach(x => { picks[x.key] = x.choices[0]; });
  picks.drink = '拿鐵咖啡 (+30)';
  picks.drink__1__temperature = '熱';
  const p = O.comboPayload(g, picks);
  assert.equal(p.main.zh, '原味貝果');
  assert.equal(p.drink.zh, '拿鐵咖啡');
  assert.match(p.drink.note, /溫度：熱/);
  assert.doesNotMatch(p.drink.note, /糖度/);
  assert.doesNotMatch(p.drink.note, /冰塊/, '熱飲不問冰塊');
});
test('菜單：COMBO 要有內容；文字編輯來回一致', () => {
  const M = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(new URL('../public/menu-lib.js', import.meta.url), 'utf8'), { window: w, console }); return w.MenuLib; })();
  assert.equal(M.validateDoc({ items: [{ zh: '空套餐', venue: 'CAFE', cat: 'COMBO', price: 100, emo: 0, combo: [] }] }).ok, false);
  const c = combo('早午餐套餐');
  const strip = x => JSON.stringify(x.map(sl => ({ ...sl, choices: sl.choices.map(({ id, ...r }) => r) })));
  assert.equal(strip(M.comboFromText(M.comboToText(c.combo))), strip(c.combo), '文字格式不存 id，存檔時由 linkCombo 補回');
  assert.equal(M.normalizeItem({ zh: 'x', cat: 'BREAD', combo: c.combo }).combo.length, 0, '非套餐類別不留 combo');
});

test('客人掃碼點套餐（addLine）：同樣要選內容、加價由伺服器算，且 pos_only 的套餐客人點不到', () => {
  const GUEST = 'abcdefgh12';
  const it = combo('貝果套餐');
  const open = items.map(x => (x.cat === 'COMBO' ? { ...x, pos_only: false } : x));
  const m = new Map(open.filter(x => !x.pos_only).map(x => [x.id, x]));
  assert.throws(() => T.addLine([], m, { item_id: it.id, qty: 1, guest: GUEST }), /還沒選/);
  const out = T.addLine([], m, { item_id: it.id, qty: 1, guest: GUEST, price: 1, combo: { main: { zh: '原味貝果' }, drink: { zh: '拿鐵咖啡', note: '溫度：熱' } } });
  assert.equal(out[0].price, 230);
  assert.equal(out[0].parts.length, 2);
  const closed = T.menuIndex(JSON.stringify({ version: 1, items: items.map(x => ({ ...x, published: true })) }), 'CAFE');
  assert.equal([...closed.values()].some(x => x.cat === 'COMBO'), false, 'pos_only 套餐不在客人可點清單');
});
test('comboOpen：只開放內建四個、只做一次的資料轉換；後台新增的自訂套餐不動', () => {
  const { comboOpen } = require('../lib/menu-combos.js');
  const list = items.map(x => ({ ...x }));
  list.push({ id: 'm_custom', cat: 'COMBO', pos_only: true, zh: '自訂套餐', venue: 'CAFE' });
  assert.equal(comboOpen(list), 5);
  assert.equal(list.find(x => x.id === 'm_custom').pos_only, true);
  assert.equal(comboOpen(list), 0);
});
test('英日文：套餐欄名與選項名依語言顯示，送出仍用中文品名', () => {
  const withEn = items.map(x => (x.zh === '美式咖啡' ? { ...x, en: 'Americano', ja: 'アメリカーノ' } : x));
  const g = O.comboGroups(combo('貝果套餐'), withEn, 'en');
  assert.equal(g.find(x => x.key === 'main').label, 'Bagel');
  assert.equal(g.find(x => x.key === 'drink').label, 'Drink');
  assert.match(g.find(x => x.key === 'drink').choices[0], /^Americano/);
  const picks = {}; g.forEach(x => { picks[x.key] = x.choices[0]; });
  assert.equal(O.comboPayload(g, picks).drink.zh, '美式咖啡');
});
test('官網菜單：套餐列出內容', () => {
  const M = (() => { const w = {}; vm.runInContext; vm.runInNewContext(fs.readFileSync(new URL('../public/menu-lib.js', import.meta.url), 'utf8'), { window: w, console }); return w.MenuLib; })();
  const html = M.renderMenuHtml([M.normalizeItem(combo('貝果套餐'))], 'zh', '');
  assert.match(html, /貝果：原味貝果 \/ 無花果核桃蜂蜜奶油貝果（\+50）/);
  assert.match(html, /飲品：美式咖啡 \/ 拿鐵咖啡（\+30）/);
});
test('order.html 接線：套餐走 comboGroups／送 combo，購物車列出內容', () => {
  const h = fs.readFileSync(new URL('../public/order.html', import.meta.url), 'utf8');
  assert.match(h, /it\.cat==='COMBO'\?OrderLib\.comboGroups\(it,MENU,LANG\)/);
  assert.match(h, /Object\.assign\(\{item_id:CURRENT_ITEM\.id[^\n]*\},comboBody\(\)\)/);
  assert.match(h, /partsLines\(l\)/);
});

test('麵套餐：冷蕎麥麵＋飲品，選了麵會帶出「麵量」規格，價 400', () => {
  const it = combo('麵套餐');
  assert.equal(it.price, 400);
  const g = O.comboGroups(it, items, 'zh');
  assert.equal(g.find(x => x.key === 'main').label, '麵');
  const picks = {}; g.forEach(x => { picks[x.key] = x.choices[0]; });
  assert.ok(O.activeOptionGroups(g, picks).some(x => x.sub && /麵量/.test(x.label)), '要問麵量');
  const [l] = T.posAddLine([], menu, { item_id: it.id, qty: 1, combo: { main: { zh: '柚香紫蘇雞腿冷蕎麥麵', note: '麵量：少麵' }, drink: { zh: '美式咖啡' } } });
  assert.equal(l.price, 400);
  assert.equal(l.parts[0].note, '麵量：少麵');
  assert.equal(win.OrderLib.slotLabel('麵', 'en'), 'Noodles');
});
test('預約取餐：後端收 combo 並由 addLine 驗證；App 有選內容頁、送 combo、卡片列內容；SW 快取 order-lib', () => {
  const P = require('../lib/pickup.js');
  const now = new Date('2026-10-19T09:00:00+08:00');
  const body = { date: '2026-10-19', time: '12:00', items: [{ item_id: combo('貝果套餐').id, qty: 2, combo: { main: { zh: '原味貝果' }, drink: { zh: '拿鐵咖啡', note: '溫度：熱\x07' }, junk: 5 } }] };
  const p = P.normalizePickup(body, now);
  assert.equal(p.items[0].combo.drink.note, '溫度：熱', '控制字元要清掉');
  assert.equal(p.items[0].combo.junk.zh, '', '不認得的欄位不會變成有效選擇');
  const [l] = T.addLine([], menu, { item_id: p.items[0].item_id, qty: p.items[0].qty, guest: 'app12345678', combo: p.items[0].combo, price: 1 });
  assert.equal(l.price, 230);
  assert.equal(l.qty, 2);
  assert.throws(() => T.addLine([], menu, { item_id: p.items[0].item_id, qty: 1, guest: 'app12345678', combo: { main: { zh: '原味貝果' } } }), /還沒選/);
  const m = fs.readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');
  assert.match(m, /<script src="\/order-lib\.js"><\/script>/);
  assert.match(m, /function openComboPicker\(/);
  assert.match(m, /concat\(\(PK\.combos\|\|\[\]\)\.map\(c=>\(\{item_id:c\.id,qty:c\.qty,combo:c\.combo\}\)\)\)/);
  assert.doesNotMatch(m, /it\.cat!=='COMBO'/, '預約取餐不再排除套餐');
  assert.match(fs.readFileSync(new URL('../public/m-sw.js', import.meta.url), 'utf8'), /'\/order-lib\.js'/);
  assert.match(fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8'), /combo: x\.combo/);
});

test('麵套餐只放在咖啡既有麵食；選項以 id 對應，品項改名套餐仍點得到', () => {
  const noodles = base.filter(b => b.venue === 'CAFE' && /麵/.test(b.zh)).map(b => b.id);
  const it = combo('麵套餐');
  assert.ok(it.combo[0].choices.every(c => noodles.includes(c.id)), '麵欄只能是在咖啡既有麵食');
  const renamed = items.map(x => (x.id === 'm_8qx9kqre' ? { ...x, zh: '柚香紫蘇雞腿冷蕎麥麵（新名）' } : x));
  const m2 = new Map(renamed.map(i => [i.id, i]));
  const g = O.comboGroups(renamed.find(x => x.zh === '麵套餐'), renamed, 'zh');
  assert.match(g.find(x => x.key === 'main').choices[0], /新名/);
  const picks = {}; g.forEach(x => { picks[x.key] = x.choices[0]; });
  const pay = O.comboPayload(g, picks);
  assert.equal(pay.main.id, 'm_8qx9kqre');
  const [l] = T.posAddLine([], m2, { item_id: it.id, qty: 1, combo: pay });
  assert.match(l.parts[0].zh, /新名/);
});
test('comboRelink：舊資料（選項是改名前的品名、沒有 id）補上 id 並同步現名；做第二次不再變動', () => {
  const { comboRelink } = require('../lib/menu-combos.js');
  const list = items.map(x => JSON.parse(JSON.stringify(x)));
  const nd = list.find(x => x.id === 'm_cafe_combo_9');
  nd.combo[0].choices = [{ zh: '柚子紫蘇雞腿冷蕎麥麵', add: 0 }];
  list.find(x => x.id === 'm_cafe_combo_5').combo[1].choices.forEach(c => { delete c.id; });
  assert.ok(comboRelink(list) >= 2);
  assert.deepEqual([nd.combo[0].choices[0].id, nd.combo[0].choices[0].zh], ['m_8qx9kqre', '柚香紫蘇雞腿冷蕎麥麵']);
  assert.equal(list.find(x => x.id === 'm_cafe_combo_5').combo[1].choices[0].id, 'i_美式咖啡');
  assert.equal(comboRelink(list), 0);
});

test('三點水麵套餐：只用三點水既有麵食與氣泡飲（不含酒、不跨店），一次性回填不重複', () => {
  const { BAR_COMBO, barComboBackfill } = require('../lib/menu-combos.js');
  const bar = (id, zh, cat, price) => ({ id, venue: 'BAR', cat, zh, en: '', ja: '', price, published: true, note: '' });
  const list = items.concat([bar('m_1lm1cdk3', '醬香野菇蕎麥麵附溫泉蛋', 'MAIN', 240), bar('m_hrfhc7os', '濃香味噌肉醬烏龍麵附溫泉蛋', 'MAIN', 320),
    bar('m_og0f6mpb', '柚子氣泡', 'SPARKLING', 160), bar('m_usmhblkt', '莓果氣泡', 'SPARKLING', 160), bar('m_tskeoazr', '鳳梨氣泡', 'SPARKLING', 160)]);
  assert.equal(barComboBackfill(list), 1);
  assert.equal(barComboBackfill(list), 0);
  const it = list.find(x => x.venue === 'BAR' && x.cat === 'COMBO');
  assert.equal(it.zh, '麵套餐');
  assert.ok(it.combo[0].choices.every(c => /麵/.test(c.zh)), '麵欄只有麵食');
  const m = new Map(list.map(i => [i.id, i]));
  const [a] = T.posAddLine([], m, { item_id: it.id, qty: 1, combo: { main: { id: 'm_1lm1cdk3' }, drink: { id: 'm_usmhblkt' } } });
  assert.equal(a.price, 360);
  assert.ok(a.price < 240 + 160);
  const [b] = T.posAddLine([], m, { item_id: it.id, qty: 1, combo: { main: { id: 'm_hrfhc7os' }, drink: { id: 'm_og0f6mpb' } } });
  assert.equal(b.price, 420);
  assert.ok(b.price < 320 + 160);
  assert.throws(() => T.posAddLine([], m, { item_id: it.id, qty: 1, combo: { main: { id: 'm_8qx9kqre' }, drink: { id: 'm_og0f6mpb' } } }), /還沒選/, '在咖啡的麵不能點進三點水套餐');
  const g = O.comboGroups(it, list, 'zh');
  assert.ok(g.find(x => x.key === 'main').choices.length === 2);
  assert.equal(BAR_COMBO.venue, 'BAR');
});

test('在咖啡套餐飲品有三款氣泡飲；舊資料只有柚子氣泡的一次性補齊，做第二次不變', () => {
  const { comboAddSparkling } = require('../lib/menu-combos.js');
  for (const c of COMBOS) assert.deepEqual(c.combo.find(s => s.key === 'drink').choices.filter(x => /氣泡/.test(x.zh)).map(x => x.zh), ['柚子氣泡', '莓果氣泡', '鳳梨氣泡'], c.zh);
  const list = items.map(x => JSON.parse(JSON.stringify(x)));
  list.filter(x => x.cat === 'COMBO').forEach(x => { const d = x.combo.find(s => s.key === 'drink'); d.choices = d.choices.filter(c => !/莓果|鳳梨/.test(c.zh)); });
  assert.equal(comboAddSparkling(list), 5);
  assert.equal(comboAddSparkling(list), 0);
  const d = list.find(x => x.zh === '麵套餐' && x.venue === 'CAFE').combo.find(s => s.key === 'drink');
  assert.deepEqual(d.choices.map(c => c.zh), ['美式咖啡', '拿鐵咖啡', '柚子氣泡', '莓果氣泡', '鳳梨氣泡']);
});
