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
  assert.match(src, /return String\(noteZh\(l\.note\)\)/);
  const slip = src.slice(src.indexOf('function orderSlipSpec'), src.indexOf('function receiptTicketSpec'));
  assert.doesNotMatch(slip, /Order Details|Table|pax|Total|Service|Thank|Please|optEn|l\.en|p\.en/);
  assert.match(slip, /noteVals\(p\)/);
  const ticket = src.slice(src.indexOf('function kitchenTicketSpec'), src.indexOf('function orderSlipSpec'));
  assert.match(ticket, /noteVals\(p\)/);
  const html = src.slice(src.indexOf('function kitchenTicketHtml'));
  assert.match(html.slice(0, 2000), /noteVals\(p\)/);
});
