// 規格 v2 §4.1：報名移到會員 App（app.emoji.tw/e/<slug>），官網只展示活動。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const server = read('server.js'), events = read('public/events.html'), m = read('public/m.html'), sw = read('public/m-sw.js'), mailer = read('lib/event-mailer.js');
const MEvent = require('../public/m-event.js');

test('App 網域放行 /e/<slug> 與 m-event.js，且 /e/:slug 回 m.html', () => {
  const re = new RegExp(server.match(/const APP_HOST_OWN = \/(.+)\/;/)[1]);
  for (const ok of ['/e/demo', '/e/demo/', '/host', '/host/e_1', '/m-event.js']) assert.ok(re.test(ok) || ok === '/m-event.js', ok);
  assert.ok(!re.test('/e/demo/extra'));
  assert.ok(!re.test('/events/demo'), '官網活動頁不在 App 網域重複提供');
  assert.match(server, /app\.get\('\/e\/:slug'/);
  assert.match(sw, /'\/m-event\.js'/);
  assert.match(m, /<script src="\/m-event\.js"><\/script>/);
});

test('Stripe 報名與加購付款回傳 App，邀請／確認／異動／取消信連到 App', () => {
  assert.match(server, /success_url: appEventUrl\(ev\.slug, req\.body\?\.lang, 'result=paid&s=\{CHECKOUT_SESSION_ID\}'\)/);
  assert.match(server, /success_url:appEventUrl\(event\.slug,/);
  for (const fn of ['queueEventInvitation', 'queueEventUpdate', 'queueCancellation', 'registrationMail'])
    assert.ok(new RegExp(`${fn}\\([^)]*origin:APP_BASE|${fn}\\([^;]*APP_BASE`).test(server), fn + ' 使用 APP_BASE');
  assert.match(mailer, /\/e\//);
});

test('官網活動頁不再內建原生報名，CTA 連到 App 並原樣帶參數與 #invite', () => {
  assert.match(events, /function inApp\(e\)/);
  assert.match(events, /if\(inApp\(e\)\)return '';/, 'formFields 對 App 活動不輸出欄位');
  assert.match(events, /if\(inApp\(e\)\)return appAction\(e\);/);
  assert.match(events, /hasRegistrationParams\(location\.search,callbackHash\.get\('invite'\)\)/);
  assert.match(events, /href="https:\/\/app\.emoji\.tw\/host"/);
  const code = [...events.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const start = code.indexOf('const APP_FORWARD_KEYS'), end = code.indexOf('const appUrlFor');
  const c = vm.createContext({ URLSearchParams, encodeURIComponent });
  vm.runInContext(code.slice(start, end), c);
  const url = c.appEventUrl('demo', '?tt=t1&unlock_code=X&coupon=C&utm_source=ig&ref=R&foo=bar', 'inv1', { lang: 'en', host: 'www.emoji.tw', origin: 'https://www.emoji.tw' });
  const u = new URL(url);
  assert.equal(u.origin, 'https://app.emoji.tw');
  assert.equal(u.pathname, '/e/demo');
  for (const [k, v] of [['tt', 't1'], ['unlock_code', 'X'], ['coupon', 'C'], ['utm_source', 'ig'], ['ref', 'R'], ['lang', 'en']]) assert.equal(u.searchParams.get(k), v);
  assert.equal(u.searchParams.has('foo'), false);
  assert.equal(u.hash, '#invite=inv1');
  assert.equal(new URL(c.appEventUrl('d', '', '', { host: 'localhost', origin: 'http://localhost:3000' })).origin, 'http://localhost:3000', '本機同源');
  assert.equal(c.hasRegistrationParams('?tt=1', ''), true);
  assert.equal(c.hasRegistrationParams('?utm_source=x', ''), false);
  assert.equal(c.hasRegistrationParams('', 'inv'), true);
  assert.equal(c.needsWallet({ registration_settings: { wallet_collection: { ethereum: true } } }), true);
  assert.equal(c.inApp({ registration_mode: 'native', registration_settings: {} }), true);
  assert.equal(c.inApp({ registration_mode: 'external' }), false);
});

test('App 報名頁純函式：路徑、場地茶飲費、合計、按鈕金額、報名 body', () => {
  assert.equal(MEvent.slugFromPath('/e/demo'), 'demo');
  assert.equal(MEvent.slugFromPath('/e/%E6%B4%BB%E5%8B%95'), '活動');
  assert.equal(MEvent.slugFromPath('/events/demo'), null);
  const member = { review_status: 'approved', visibility: 'public', registration_mode: 'native', registration_settings: {}, price_twd: 0 };
  const platform = { ...member, review_status: null };
  assert.equal(MEvent.venueFeePerTicket(member), 150);
  assert.equal(MEvent.venueFeePerTicket(platform), 0, '平台自辦活動不收');
  assert.equal(MEvent.venueFeePerTicket({ ...member, registration_mode: 'external' }), 0);
  assert.equal(MEvent.orderTotal(member, { price_twd: 300 }, 1), 450, '規格 §8 第 18 條：票價 300 結帳 450');
  assert.equal(MEvent.orderTotal(member, { price_twd: 0 }, 2), 300, '免費票仍收茶飲費');
  assert.equal(MEvent.orderTotal(platform, { price_twd: 300 }, 2), 600);
  const T = MEvent.L.zh;
  assert.equal(MEvent.primaryLabel(member, { price_twd: 300 }, 450, T), '前往付款 · NT$450');
  assert.equal(MEvent.primaryLabel(platform, { price_twd: 0 }, 0, T), '立即報名');
  const form = new Map([['quantity', '2'], ['name', 'A'], ['email', 'a@x.tw'], ['ticket_id', 't1'], ['q1', 'hi']]);
  const body = MEvent.buildRegisterBody({ registration_settings: { questions: [{ id: 'q1', type: 'short' }, { id: 'q2', type: 'multiple' }] } }, k => form.get(k), () => ['x'], { lang: 'zh', attribution: { source: 'ig' }, inviteToken: '' });
  assert.equal(body.quantity, 2); assert.equal(body.ticket_id, 't1'); assert.equal(body.answers.q1, 'hi'); assert.deepEqual(body.answers.q2, ['x']); assert.equal(body.invite_token, undefined);
  for (const l of ['zh', 'en', 'ja']) assert.ok(MEvent.L[l].pay && MEvent.L[l].refundConfirm && MEvent.L[l].venue, l);
});

test('m.html：/e/<slug> 在 login() 前分流，訪客可報名', () => {
  assert.match(m, /if\(eventPath\(\)\)\{if\(token\(\)\)/);
  assert.match(m, /else if\(!token\(\)\)login\(\);else load\(\);/);
});

test('報名完成（免費、訪客、付款回傳）一律進結果頁，不留在表單', () => {
  const ev = read('public/m-event.js');
  assert.match(ev, /function renderResult\(e,status,guest\)/);
  assert.match(ev, /if\(result\)return renderResult\(e,result\);/);
  assert.match(ev, /if\(out\.guest\)\{[^}]*return renderResult\(e,e\.registration_status,true\);\}/);
  assert.match(ev, /result=out\.status\|\|'registered';await load\(\);/);
  assert.match(ev, /result=v\.paid\|\|v\.status==='registered'\?'paid':'checking'/);
  for (const k of ['backEvent', 'home']) for (const l of ['zh', 'en', 'ja']) assert.ok(MEvent.L[l][k], l + '.' + k);
});

test('App 報名頁：優惠碼不摺疊、有「套用」鈕打 /quote，合計顯示原價／折抵／折扣後金額', () => {
  const ev = read('public/m-event.js');
  assert.match(ev, /id="mev-coupon"/);
  assert.match(ev, /id="mev-apply"/);
  assert.doesNotMatch(ev, /<details\$\{coupon\?' open':''\}>/, '優惠碼不要收在 details 裡');
  assert.match(ev, /api\('\/events\/'\+e\.id\+'\/quote'/);
  assert.match(ev, /T\.orig/);
  assert.match(ev, /T\.discount/);
});
