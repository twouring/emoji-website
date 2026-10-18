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
const base = [mk('原味貝果', 'BREAD', 80), mk('無花果核桃蜂蜜奶油貝果', 'BREAD', 150), mk('美式咖啡', 'COFFEE', 150), mk('拿鐵咖啡', 'COFFEE', 180), mk('柚子氣泡', 'SPARKLING', 160),
  mk('海苔馬告豬肉時雨煮飯糰', 'JAPANESE', 220), mk('鹽烤雞腿昆布飯糰', 'JAPANESE', 240), mk('奶油松露野菇炒蛋開放式三明治', 'BREAD', 300), mk('燻鮭魚酪梨蒔蘿奶油開放式三明治', 'BREAD', 320),
  mk('明太子美式炒蛋可頌', 'BREAD', 320), mk('自製布丁・鹹鮮奶油', 'DESSERT', 120), mk('巴斯克蛋糕', 'DESSERT', 100), mk('藍莓起司蛋糕', 'DESSERT', 100)];
const items = base.slice(); comboBackfill(items);
const menu = new Map(items.map(i => [i.id, i]));
const combo = zh => items.find(i => i.zh === zh);

test('回填：四個套餐、內容都對得到菜單品項；做兩次不重複', () => {
  assert.equal(COMBOS.length, 4);
  assert.equal(comboBackfill(items), 0);
  for (const c of COMBOS) for (const s of c.combo) for (const ch of s.choices) assert.ok(base.some(b => b.zh === ch.zh), c.zh + ' → ' + ch.zh);
  assert.deepEqual(COMBOS.map(c => c.zh), ['貝果套餐', '飯糰套餐', '早午餐套餐', '下午茶套餐']);
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
  assert.equal(main.choices.join('|'), '原味貝果|無花果核桃蜂蜜奶油貝果（+50）');
  assert.equal(drink.choices.join('|'), '美式咖啡|拿鐵咖啡（+30）|柚子氣泡');
  const picks = { main: main.choices[0], drink: drink.choices[0] };
  g.filter(x => !x.combo).forEach(x => { picks[x.key] = x.choices[0]; });
  const act = () => O.activeOptionGroups(g, picks).filter(x => x.sub).map(x => x.label);
  assert.ok(act().some(l => l.startsWith('美式咖啡・溫度')));
  assert.ok(act().some(l => l.startsWith('美式咖啡・冰塊')), '美式預設冰 → 有冰塊');
  assert.ok(!act().some(l => l.startsWith('拿鐵咖啡')));
  picks.drink = drink.choices[1];
  assert.ok(act().some(l => l.startsWith('拿鐵咖啡・糖度')));
  picks.drink = drink.choices[2];
  assert.deepEqual(act().filter(l => l.startsWith('柚子氣泡')).length, 1, '氣泡只有冰塊');
});
test('comboPayload：只送選中品項的規格，出餐單才不會混進別杯的選項', () => {
  const g = O.comboGroups(combo('貝果套餐'), items, 'zh'), picks = {};
  g.forEach(x => { picks[x.key] = x.choices[0]; });
  picks.drink = '拿鐵咖啡（+30）';
  picks.drink__1__temperature = '熱';
  const p = O.comboPayload(g, picks);
  assert.equal(p.main.zh, '原味貝果');
  assert.equal(p.drink.zh, '拿鐵咖啡');
  assert.match(p.drink.note, /溫度：熱/);
  assert.match(p.drink.note, /糖度：正常糖/);
  assert.doesNotMatch(p.drink.note, /冰塊/, '熱飲不問冰塊');
});
test('菜單：COMBO 要有內容；文字編輯來回一致', () => {
  const M = (() => { const w = {}; vm.runInNewContext(fs.readFileSync(new URL('../public/menu-lib.js', import.meta.url), 'utf8'), { window: w, console }); return w.MenuLib; })();
  assert.equal(M.validateDoc({ items: [{ zh: '空套餐', venue: 'CAFE', cat: 'COMBO', price: 100, emo: 0, combo: [] }] }).ok, false);
  const c = combo('早午餐套餐');
  assert.equal(JSON.stringify(M.comboFromText(M.comboToText(c.combo))), JSON.stringify(c.combo));
  assert.equal(M.normalizeItem({ zh: 'x', cat: 'BREAD', combo: c.combo }).combo.length, 0, '非套餐類別不留 combo');
});
