// 各品牌 POS 登入狀態不共享（KK 11/4）：同網域分頁共用 localStorage，所以 token key 依網址品牌分開
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const pos = fs.readFileSync(new URL('../public/pos.html', import.meta.url), 'utf8');
const src = pos.slice(pos.indexOf('const POS_VENUE_BASE'), pos.indexOf('const TABS = ['));
function keyFor(pathname, store) {
  const meta = { content: '' }, brand = { href: '', setAttribute() {}, querySelector: () => ({ textContent: '' }) };
  const ctx = { location: { pathname }, BRAND_LABEL: { CAFE: '在咖啡', BAR: '三點水', STAY: '等等空間', REST: '約書旅' },
    document: { documentElement: { dataset: {} }, querySelector: () => meta, getElementById: () => brand, title: '' },
    localStorage: { removeItem: k => store.delete(k) } };
  vm.runInNewContext(src + ';this.k=KEY;', ctx);
  return ctx.k;
}
test('四個品牌各一把 key、首頁另一把；舊的共用 tth_token 會被清掉', () => {
  const store = new Map([['tth_token', 'old'], ['tth_name', 'x'], ['tth_pos_token_cafe', 'c']]);
  const keys = ['/atcafe', '/3am/sales', '/staysquare', '/restbook/table/A1', '/'].map(p => keyFor(p, store));
  assert.deepEqual(keys, ['tth_pos_token_cafe', 'tth_pos_token_bar', 'tth_pos_token_stay', 'tth_pos_token_rest', 'tth_pos_token_home']);
  assert.equal(store.has('tth_token'), false); assert.equal(store.has('tth_name'), false);
  assert.equal(store.get('tth_pos_token_cafe'), 'c', '別的品牌的登入不動');
});
test('pos.html 不再讀寫共用的 tth_token；首頁不依 token 自動跳品牌', () => {
  assert.doesNotMatch(pos, /setItem\('tth_token'|getItem\('tth_token'|const KEY = 'tth_token'/);
  assert.doesNotMatch(pos, /operator_staff_id && POS_VENUE_BASE/);
  assert.doesNotMatch(pos, /EmojiSSO\.silent\(/, '不可靜默登入，否則跨品牌分頁自動登入');
  for (const m of pos.matchAll(/localStorage\.(set|get|remove)Item\(([^,)]+)/g)) if (/token/i.test(m[2])) assert.match(m[2], /^KEY$|'tth_token'/, m[0]);
});
