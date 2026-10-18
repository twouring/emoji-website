import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import '../public/order-lib.js';

const O = globalThis.OrderLib;

test('AA 平均分帳以整數元分配，尾差不遺失', () => {
  assert.deepEqual(O.splitBill(1000, 3), { base: 333, remainder: 1, people: 3, total: 1000 });
  assert.deepEqual(O.splitBill(900, 3), { base: 300, remainder: 0, people: 3, total: 900 });
});

test('AA 人數限制為 2–20，金額不得為負數', () => {
  assert.throws(() => O.splitBill(100, 1));
  assert.throws(() => O.splitBill(100, 21));
  assert.throws(() => O.splitBill(-1, 2));
});

test('中英文字典涵蓋桌邊點餐與 AA 結帳核心文案', () => {
  assert.equal(O.text('zh', 'split_evenly'), '平均分攤');
  assert.equal(O.text('en', 'split_evenly'), 'Split evenly');
  assert.equal(O.text('en', 'checkout_title'), 'Pay at the counter after dining');
  assert.equal(O.text('en', 'my_items'), 'Pay my own items');
});


test('飲料規格依供應方式限制；熱飲不顯示冰塊、冷飲不提供常溫', () => {
  assert.equal(O.text('ja', 'checkout_title'), 'お食事後にカウンターで会計');
  const latte = O.optionGroups({ cat: 'COFFEE', zh: '拿鐵咖啡' }, 'zh');
  assert.deepEqual(latte.map(g => g.key), ['temperature', 'ice']);
  assert.deepEqual(O.activeOptionGroups(latte, { temperature: '熱' }).map(g => g.key), ['temperature']);
  assert.deepEqual(O.activeOptionGroups(latte, { temperature: '冰' }).map(g => g.key), ['temperature', 'ice']);
  assert.deepEqual(O.optionGroups({ cat: 'TEA', zh: '紅烏龍', note: '紅烏龍茶葉、熱水。' }, 'zh'), [], '固定熱泡茶不問糖冰');
  const sparkling = O.optionGroups({ cat: 'SPARKLING', zh: '柚子氣泡' }, 'zh');
  assert.deepEqual(sparkling.map(g => g.key), ['ice'], '氣泡飲不可調甜度');
  assert.deepEqual(sparkling.find(g => g.key === 'ice').choices, ['正常冰', '少冰', '去冰']);
  assert.deepEqual(latte.find(g => g.key === 'ice').choices, ['正常冰', '少冰', '去冰'], '所有飲品冰塊僅三選一');
  for (const l of ['en', 'ja']) assert.equal(O.optionGroups({ cat: 'COFFEE', zh: '拿鐵咖啡' }, l).find(g => g.key === 'ice').choices.length, 3);
});

test('現行完整菜單逐品檢查：麵類無飯量、固定熱飲無冰塊、冰塊依冰飲條件顯示', () => {
  const c = { window: {} }; vm.createContext(c);
  vm.runInContext(fs.readFileSync(new URL('../public/menu-data.js', import.meta.url), 'utf8'), c);
  for (const item of c.window.__MENU_SEED) {
    const groups = O.optionGroups(item, 'zh'), keys = groups.map(g => g.key), tag = `${item.venue}/${item.zh}`;
    assert.ok(!(keys.includes('rice') && keys.includes('noodle')), `${tag} 不可同時有飯量與麵量`);
    if (/麵|noodle|pasta|udon|soba|義大利/i.test([item.zh,item.en].join(' '))) assert.ok(!keys.includes('rice'), `${tag} 麵類不可有飯量`);
    if (/熱水|hot water/i.test(item.note || '')) assert.ok(!keys.includes('ice'), `${tag} 固定熱飲不可有冰塊`);
    if (keys.includes('temperature') && keys.includes('ice')) assert.deepEqual(groups.find(g => g.key === 'ice').when, { key: 'temperature', value: '冰' }, `${tag} 冰塊需受冰飲條件限制`);
  }
});

test('主食只依品名提供飯量或麵量，麵類絕不再出現飯量', () => {
  assert.deepEqual(O.optionGroups({ cat: 'JAPANESE', zh: '柚子紫蘇雞腿冷蕎麥麵' }, 'zh').map(g => g.key), ['noodle']);
  assert.deepEqual(O.optionGroups({ cat: 'MAIN', zh: '濃香味噌肉醬烏龍麵附溫泉蛋' }, 'zh').map(g => g.key), ['noodle']);
  assert.deepEqual(O.optionGroups({ cat: 'MAIN', zh: '炙燒明太子烤飯糰茶泡飯' }, 'zh').map(g => g.key), ['rice']);
  assert.deepEqual(O.optionGroups({ cat: 'MAIN', zh: '牛肉麵飯' }, 'zh').map(g => g.key), ['noodle'], '品名同時命中時麵量優先，不可同時問加飯');
  assert.deepEqual(O.optionGroups({ cat: 'MAIN', zh: '烤雞腿排' }, 'zh'), [], 'MAIN 類別本身不等於有飯');
  assert.deepEqual(O.optionGroups({ cat: 'BREAD', zh: '開放式三明治', note: '使用酸種麵包' }, 'zh'), [], '產品說明中的「麵包」不等於麵量');
});
