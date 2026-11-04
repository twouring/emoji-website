// LINE 登入帶回主畫面 App（KK 11/4）＋固定 QR 重新掃碼不卡在用餐完畢
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../lib/auth-handoff.js');
const root = new URL('..', import.meta.url).pathname;
const read = f => fs.readFileSync(root + f, 'utf8');
const h = 'a'.repeat(32), now = 1_000_000;

test('handoff：未確認不交 token、確認碼錯不放行、確認後只能取一次', () => {
  const m = {};
  const c = H.put(m, h, 'enc:x', now);
  assert.match(c, /^[a-f0-9]{32}$/);
  assert.equal(H.take(m, h, now), null, '未確認');
  assert.equal(H.confirm(m, h, 'b'.repeat(32), now), false, '確認碼錯');
  assert.equal(H.confirm(m, h, c, now), true);
  assert.equal(H.take(m, h, now), 'enc:x');
  assert.equal(H.take(m, h, now), null, '只能取一次');
});
test('handoff：逾時失效、格式不符拒絕、prune 清掉過期', () => {
  const m = {};
  const c = H.put(m, h, 'enc:x', now);
  assert.equal(H.confirm(m, h, c, now + H.TTL + 1), false);
  assert.equal(H.put(m, 'xyz', 'enc:x', now), null);
  H.prune(m, now + H.TTL + 1);
  assert.deepEqual(m, {});
  assert.equal(H.code('0000' + 'f'.repeat(28)), '00');
  assert.equal(H.code('ffff' + '0'.repeat(28)), String(0xffff % 100).padStart(2, '0'));
});
test('前後端號碼算法一致', () => {
  const js = read('public/line-handoff.js');
  // 只載入 repo 內自己的 public/line-handoff.js（無外部輸入），在假的瀏覽器全域下執行取函式
  const g = {}; new Function('window', 'matchMedia', 'navigator', 'localStorage', 'document', 'crypto', js)(g, () => ({ matches: false }), {}, {}, { addEventListener() {} }, {});
  for (const x of ['0123' + h.slice(4), 'beef' + h.slice(4), 'ffff' + h.slice(4)]) assert.equal(g.LineHandoff.code(x), H.code(x));
});
test('server：/auth/line 帶 handoff 進 state；跨瀏覽器回跳且有 handoff 才暫存 token', () => {
  const s = read('server.js');
  assert.match(s, /signToken\(\{ r: redirect, n: nonce, v: resvTok, \.\.\.\(handoff \? \{ h: handoff \} : \{\}\) \}/);
  assert.match(s, /if \(crossBrowser && authHandoff\.valid\(st\.h\)\)/);
  assert.match(s, /app\.post\('\/api\/auth\/handoff\/confirm'/);
  assert.match(s, /app\.post\('\/api\/auth\/handoff',/);
  assert.match(s, /line-handoff\\\.js\$\|/, 'App 網域要放行 line-handoff.js');
  assert.doesNotMatch(read('lib/security.js').match(/PUBLIC_CONTENT_KEYS[^\]]*\]/)?.[0] || '', /auth_handoffs/);
});
test('前端：App 與點餐頁都載入並初始化 LineHandoff；App 掃碼接受在咖啡固定 QR', () => {
  const m = read('public/m.html'), o = read('public/order.html');
  assert.match(m, /<script src="\/line-handoff\.js"><\/script>/);
  assert.match(m, /LineHandoff\.init\(KEY,/);
  assert.match(o, /<script src="\/line-handoff\.js"><\/script>/);
  assert.match(o, /LineHandoff\.init\(TOKEN_KEY,/);
  assert.match(m, /'\/order\?'\+\(tb\.s\?'s='\+encodeURIComponent\(tb\.s\):'t='\+encodeURIComponent\(tb\.t\)\)/);
});
test('點餐頁：固定 QR 重新掃碼（navigate）不看結束鎖，伺服器回開著的場就清鎖', () => {
  const o = read('public/order.html');
  assert.match(o, /var FRESH_SCAN=FIXED&&NAV_TYPE==='navigate';/);
  assert.match(o, /if\(FIXED\)\{if\(FRESH_SCAN\)return '';/);
  assert.match(o, /if\(FIXED\)\{SID=s\.id;K=s\.k;if\(s\.status==='open'\)clearEnded\(\);\}/);
  assert.match(o, /function sessionClosed\(s\)\{FRESH_SCAN=false;/);
});
test('已登入會員再掃碼：只有 401 才清登入，429／暫時錯誤重試；掛桌中不顯示登入鈕（KK 11/4）', () => {
  const o = read('public/order.html'), s = read('server.js');
  assert.match(o, /if\(e\.status===401\|\|e\.status===403&&\/會員身分\/\.test\(e\.message\)\)\{try\{localStorage\.removeItem\(TOKEN_KEY\);\}catch\(x\)\{\}ME=null;renderMember\(\);if\(!NAME\)showGate\(\);return;\}/);
  assert.match(o, /setTimeout\(joinMember,1500\*JOIN_TRIES\)/);
  assert.match(o, /function joinPending\(\)\{return !ME&&!!token\(\)&&!JOIN_FAILED;\}/);
  assert.match(s, /app\.post\('\/api\/orders\/table\/member', auth, requireDb, rateLimit\(\{ max: 600,/);
});
test('稱呼關卡：沒填稱呼按「查看菜單」照略過自動命名，不可沒反應（KK 11/4）', () => {
  assert.match(read('public/order.html'), /if\(!v\)\{\$\('#name-skip'\)\.click\(\);return;\}/);
});
