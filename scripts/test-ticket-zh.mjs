import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
await import('../public/order-lib.js');
const { optionZh } = globalThis.OrderLib;
test('外語規格轉回中文（KK 11/2：出餐單據統一中文）', () => {
  assert.equal(optionZh('Temperature：Iced；Ice：No ice (small crushed ice)'), '溫度：冰；冰塊：去冰（有小碎冰）');
  assert.equal(optionZh('Temperature：Hot'), '溫度：熱');
  assert.equal(optionZh('温度：ホット'), '溫度：熱');
  assert.equal(optionZh('Noodle amount：Extra noodles；no onion'), '麵量：麵多；no onion');
  assert.equal(optionZh('溫度：熱；糖度：無糖；不要蔥'), '溫度：熱；糖度：無糖；不要蔥');
  assert.equal(optionZh(''), '');
});
test('出餐單、點餐明細、店內畫面一律中文，規格只印值', () => {
  const src = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(src, /const parts=String\(noteZh\(l\.note\)\)/);
  const slip = src.slice(src.indexOf('function orderSlipSpec'), src.indexOf('function receiptTicketSpec'));
  assert.doesNotMatch(slip, /Order Details|Table|pax|Total|Service|Thank|Please|optEn|l\.en|p\.en/);
  assert.match(slip, /noteVals\(p\)/);
  const ticket = src.slice(src.indexOf('function kitchenTicketSpec'), src.indexOf('function orderSlipSpec'));
  assert.match(ticket, /specParts\(\{cat:p\.cat,zh:p\.zh,note:p\.note\}\)/);
  // 冰／熱（溫度、冰塊）要反白大字標籤，單品與套餐內飲品都要（KK 11/2：出單紙冰熱不明顯）
  assert.match(src, /const isIceHot=p=>p\.tone==='temperature'\|\|p\.tone==='ice'/);
  assert.equal((ticket.match(/kind:'tags'/g) || []).length, 2);
  const sizes = [...ticket.matchAll(/kind:'tags'[^}]*size:(\d+)/g)].map(m => +m[1]);
  assert.ok(sizes.every(n => n >= 40), 'tags size >= 40');
  assert.match(src, /cmd\.kind==='tags'\)tags\(/);
  const html = src.slice(src.indexOf('function kitchenTicketHtml'));
  assert.match(html.slice(0, 2000), /noteVals\(p\)/);
});
test('有冰塊選項時不再印溫度「冰」（KK 11/7：去冰又寫冰）', async () => {
  const vm = await import('node:vm');
  const src = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  const pick = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
  const code = pick('const specTone=', '/* 規格只取值') + pick('const isIceHot=', 'const TABLE_STATE=');
  const ctx = { OrderLib: globalThis.OrderLib, String, RegExp };
  vm.runInNewContext(code + ';this.specParts=specParts;', ctx);
  const t = note => ctx.specParts({ cat: 'COFFEE', zh: '美式', note }).map(p => p.text).join('|');
  assert.equal(t('溫度：冰；冰塊：去冰（有小碎冰）'), ['去冰（有小碎冰）'].join('|'));
  assert.equal(t('Temperature：Iced；Ice：Less ice'), ['少冰'].join('|'));
  assert.equal(t('溫度：冰'), ['冰'].join('|'));
  assert.equal(t('溫度：熱；糖度：無糖'), ['熱', '無糖'].join('|'));
});
