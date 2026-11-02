import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
await import('../public/order-lib.js');
const { optionZh } = globalThis.OrderLib;
test('外語規格轉回中文（出餐單統一中文）', () => {
  assert.equal(optionZh('Temperature：Iced；Ice：No ice (small crushed ice)'), '溫度：冰；冰塊：去冰（有小碎冰）');
  assert.equal(optionZh('温度：ホット'), '溫度：熱');
  assert.equal(optionZh('Noodle amount：Extra noodles；no onion'), '麵量：麵多；no onion');
  assert.equal(optionZh('溫度：熱；糖度：無糖；不要蔥'), '溫度：熱；糖度：無糖；不要蔥');
  assert.equal(optionZh(''), '');
});
test('出餐單／店內畫面用中文、點餐明細保留客人語系', () => {
  const src = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
  assert.match(src, /return String\(keep\?\(l\.note\|\|''\):noteZh\(l\.note\)\)/);
  const slip = src.slice(src.indexOf('function orderSlipSpec'), src.indexOf('function receiptTicketSpec'));
  assert.match(slip, /specParts\(l,true\)/);
  const ticket = src.slice(src.indexOf('function kitchenTicketSpec'), src.indexOf('function orderSlipSpec'));
  assert.match(ticket, /noteZh\(p\.note\)/);
  const html = src.slice(src.indexOf('function kitchenTicketHtml'));
  assert.match(html.slice(0, 2000), /noteZh\(p\.note\)/);
});
