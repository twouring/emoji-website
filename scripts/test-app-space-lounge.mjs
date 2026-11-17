// 會員 App「共享空間」「貴賓室」分頁 × 等等空間／約書旅 POS 掃碼進出（KK 11/17）
// 真 SQL 流程在 scripts/smoke-space-scan-lounge-sql.mjs（需 PGLITE_MODULE_PATH）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../lib/pos-space.js');
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const m = read('public/m.html'), srv = read('server.js'), pos = read('public/pos-space.js');

test('App：會籍分頁改名共享空間；新增貴賓室分頁（三語）', () => {
  assert.match(m, /data-tab="plan"[\s\S]{0,400}data-i="tabPlan">共享空間</);
  assert.match(m, /data-tab="lounge"[\s\S]{0,700}data-i="tabLounge">貴賓室</);
  assert.match(m, /grid-template-columns:repeat\(6,1fr\)/, '底部六個分頁');
  for (const k of ["tabPlan:'共享空間'", "tabLounge:'貴賓室'", "tabLounge:'Lounge'", "tabLounge:'ラウンジ'", "plan:'共享空間'"]) assert.ok(m.includes(k), k);
  assert.doesNotMatch(m, /tabPlan:'會籍'|>會籍</, '分頁不再叫會籍');
  assert.match(m, /\(\{home,book,plan,lounge,events,me\}\)\[tab\]\(\)/);
  assert.match(m, /\['plan','lounge','events'\]\.includes\(tab\)/, '訪客也能看貴賓室方案');
  assert.match(m, /post\('\/api\/me\/lounge\/checkout'/); assert.match(m, /post\('\/api\/me\/lounge\/verify'/);
  assert.match(m, /if\(b\.k==='rest'\)acts\.push\(\['lounge'/, '約書旅品牌頁有貴賓室方案入口');
});

test('線上可購買方案：約書旅、有價格、限時；超時與包場不賣', () => {
  const items = [
    { id: 'a', venue: 'REST', cat: 'LOUNGE', published: true, space_role: 'plan', space_minutes: 240, price: 450 },
    { id: 'b', venue: 'REST', cat: 'LOUNGE', published: true, space_role: 'overtime', price: 100 },
    { id: 'c', venue: 'REST', cat: 'LOUNGE', published: true, price: 3000 },
    { id: 'd', venue: 'STAY', cat: 'SPACE', published: true, space_role: 'plan', space_minutes: 240, price: 200 },
    { id: 'e', venue: 'REST', cat: 'QUIET', published: false, space_role: 'plan', space_minutes: 60, price: 250 },
    { id: 'f', venue: 'REST', cat: 'QUIET', published: true, space_role: 'plan', space_minutes: 0, price: 0 },
  ];
  assert.deepEqual(S.onlinePlans(items).map(x => x.id), ['a']);
});

test('線上已付未到：卡片狀態 ready、不算在場人數', () => {
  const cfg = S.normalizeSettings('', 'REST');
  const s = { table_no: 'E01', items: [{ line: 'l', space_role: 'plan', space_minutes: 240, price: 450, qty: 1, order_id: 'to_1', zh: 'x' }], space: { headcount: 1, in_at: null, prepaid: true, online: true, member_name: '小美' } };
  const v = S.view(s, cfg);
  assert.equal(v.state, 'ready'); assert.equal(v.prepaid, true); assert.equal(v.member, '小美');
  assert.equal(S.occupancy([s]), 0);
  assert.equal(S.occupancy([{ ...s, space: { ...s.space, in_at: new Date().toISOString() } }]), 1);
  assert.equal(S.view({ ...s, space: { headcount: 1, in_at: null } }, cfg).state, 'unpaid', '一般入場單未收款不變');
});

test('會籍狀態與電話遮罩', () => {
  const now = new Date('2026-11-17T00:00:00Z');
  assert.equal(S.entitlementState({ plan: 'month', activated_at: null }, now), 'pending');
  assert.equal(S.entitlementState({ plan: 'month', activated_at: now, starts_at: '2026-11-01', ends_at: '2026-12-01' }, now), 'active');
  assert.equal(S.entitlementState({ plan: 'month', activated_at: now, starts_at: '2026-10-01', ends_at: '2026-11-01' }, now), 'expired');
  assert.equal(S.maskPhone('+886912345678'), '0912***678'); assert.equal(S.maskPhone(''), '');
});

test('server：貴賓室購買冪等、掃碼進出、會員清單、線上已付不可清單', () => {
  assert.match(srv, /await fulfillLoungeCheckout\(event\.data\.object\);/, 'webhook 接上');
  assert.match(srv, /async function fulfillLoungeCheckout\(session\)[\s\S]{0,900}payer->>'stripe_session'=\$1/, '以 stripe session 去重');
  assert.match(srv, /metadata: \{ kind: 'lounge', item_id: it\.id, price: String\(it\.price\), user_id: req\.auth\.sub \}/);
  for (const r of ["app.post('/api/admin/orders/space/scan'", "app.post('/api/admin/orders/space/enter'", "app.post('/api/admin/orders/sessions/:id/space/checkin'", "app.get('/api/admin/orders/space/members'", "app.get('/api/me/lounge'", "app.post('/api/me/lounge/checkout'", "app.post('/api/me/lounge/verify'", "app.get('/api/lounge/plans'"]) assert.ok(srv.includes(r), r);
  assert.match(srv, /space\.prepaid===true&&!session\.space\.in_at\)return res\.status\(409\)/, '線上已付未到不能清單');
  assert.match(srv, /UPDATE entitlements SET activated_at=\$2,starts_at=\$2,ends_at=\$3 WHERE id=\$1 AND activated_at IS NULL/, '掃碼入場啟用會籍');
  assert.match(srv, /posSpace\.maskPhone\(/, '會員清單電話遮罩');
});

test('進出統一用會員卡 QR：App 不再有獨立進出 QR，門禁與 POS 只認會員卡（KK 11/17）', () => {
  assert.doesNotMatch(m, /\/api\/me\/access-qr|openQr\('access'\)|access-open|qrKind/);
  assert.doesNotMatch(srv, /app\.get\('\/api\/me\/access-qr'/);
  assert.match(srv, /function memberCardOf\(token\)[\s\S]{0,200}p\.plan === 'yan-card'/);
  const scan = srv.slice(srv.indexOf("app.post('/api/access/scan'"), srv.indexOf("app.post('/api/access/scan'") + 400);
  assert.match(scan, /memberCardOf\(/);
  const pscan = srv.slice(srv.indexOf("app.post('/api/admin/orders/space/scan'"), srv.indexOf("app.post('/api/admin/orders/space/scan'") + 600);
  assert.match(pscan, /memberCardOf\(/);
  for (const f of ['public/pos-space.js', 'public/brand-sites/stay-square-shop.js', 'tools/build-brand-sites.py', 'tools/build-legal-pages.py', 'public/terms.html']) assert.doesNotMatch(read(f), /進出 QR|入退室 QR|入退館 QR|entry QR|Entry QR/, f);
});

test('等等空間官網付款要入 POS 帳：單日開線上已付入場單，月季年入查單（KK 11/17）', () => {
  assert.equal(S.STAY_PLAN_ITEMS.day_4h, 'm_stay_space_entry_4_hours');
  assert.equal(S.STAY_PLAN_ITEMS.day_12h, 'm_stay_space_entry_12_hours');
  assert.match(srv, /async function ensureOnlineSpaceOrder\(/);
  assert.match(srv, /async function stayPlanLines\(/);
  assert.match(srv, /online_plan_pos_v1/, '已付未入帳的會籍開機補 POS 單');
  assert.match(srv, /prepaid: built.prepaid/);
});

test('約書旅官網可線上購買，付款走貴賓室入帳', () => {
  const rb = read('public/brand-sites/rest-book.html');
  assert.match(rb, /data-rb-buy/);
  assert.match(rb, /brand-sites\/rest-book-shop\.js/);
  assert.match(read('public/brand-sites/rest-book-shop.js'), /\/api\/me\/lounge\/checkout/);
  assert.match(srv, /brandReturnBase\(req\.body\) \|\| APP_BASE \+ '\/'\}\?lounge_paid=1/);
});

test('POS：入場管理有掃碼進出、等等空間有會員清單、線上已付可入場', () => {
  assert.match(pos, /id="sp-scan">掃碼進出</);
  assert.match(pos, /SCOPE === 'STAY' \? '<button type="button" class="btn btn--ghost" id="sp-members">會員<\/button>'/);
  assert.match(pos, /pickMemberCard\(\{ title: '掃會員卡確認進出'/);
  assert.match(pos, /title: '確認入場'/); assert.match(pos, /title: '確認離場'/);
  assert.match(pos, /api\('\/admin\/orders\/space\/scan'/); assert.match(pos, /api\('\/admin\/orders\/space\/enter'/); assert.match(pos, /\/space\/checkin'/); assert.match(pos, /api\('\/admin\/orders\/space\/members'\)/);
  assert.match(pos, /ready: \['sp-ready', '線上已付'\]/);
  assert.match(read('public/pos-space.css'), /\.sp-ready\{/);
});
