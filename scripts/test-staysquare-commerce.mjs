// 等等空間站：言文字會員登入、購買會籍、分區包場（KK 2026-11-04）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { STAY_ZONES, quoteZoneFee } = require('../lib/venue-fees.js');
const { normalizeEventApplication, applicationDeposit, applicationVenueText } = require('../lib/event-applications.js');
const { PLAN_PRICE_TWD } = require('../lib/plans.js');

const base = {
  community_name: '測試', contact_name: '測試', contact_email: 'a@example.test', contact_phone: '', title: '讀書會',
  description: '內容', requirements: '', consent: true, kind: 'business', venue: '3F', visibility: 'private',
  starts_at: '2099-06-20T14:00', ends_at: '2099-06-20T16:00', attendees: '10',
};

test('分區場地費＝場地說明 2026-11 版（每時段 2 小時）', () => {
  const want = { A: 1800, B: 1400, C: 1400, D: 1200, E: 600, AB: 3000, ABC: 4200, ABCD: 5200, ALL: 6400 };
  assert.deepEqual(Object.fromEntries(Object.entries(STAY_ZONES).map(([k, v]) => [k, v.fee])), want);
  assert.equal(quoteZoneFee({ zone: 'AB', slots: 2 }).fee_twd, 6000);
  assert.equal(quoteZoneFee({ zone: 'E', slots: 1, member: true }).fee_twd, 0, 'E 會議室會員免費');
  assert.equal(quoteZoneFee({ zone: 'E', slots: 1 }).fee_twd, 600);
  assert.ok(quoteZoneFee({ zone: 'toString', slots: 1 }).error);
  assert.ok(quoteZoneFee({ zone: 'A', slots: 0 }).error);
  assert.ok(quoteZoneFee({ zone: 'D', slots: 1, attendees: 11 }).error, 'D 區至多 10 人');
});

test('分區包場申請：整點、2 小時倍數、人數上限、只限 3F 包場', () => {
  const v = normalizeEventApplication({ ...base, zone: 'ABC', ends_at: '2099-06-20T18:00', attendees: '40' }).value;
  assert.equal(v.zone, 'ABC');
  assert.equal(applicationDeposit(v), 8400);
  assert.equal(applicationVenueText(v), '等等空間共享活動區｜A+B+C');
  assert.equal(applicationDeposit(normalizeEventApplication({ ...base, zone: 'E', attendees: '4' }).value, { member: true }), 0);
  assert.match(normalizeEventApplication({ ...base, zone: 'A', ends_at: '2099-06-20T15:00' }).error, /2 小時/);
  assert.match(normalizeEventApplication({ ...base, zone: 'A', starts_at: '2099-06-20T14:30', ends_at: '2099-06-20T16:30' }).error, /整點/);
  assert.match(normalizeEventApplication({ ...base, zone: 'A', attendees: '16' }).error, /至多 15 人/);
  assert.ok(normalizeEventApplication({ ...base, zone: 'A', venue: '2F', attendees: '5' }).error);
  assert.ok(normalizeEventApplication({ ...base, zone: 'A', visibility: 'public', registration_mode: 'native' }).error);
  assert.ok(normalizeEventApplication({ ...base, zone: 'Z' }).error);
  assert.equal(normalizeEventApplication(base).value.zone, undefined, '沒帶 zone 走原本級距');
});

const server = fs.readFileSync('server.js', 'utf8');
test('server：子品牌站可登入回跳、結帳回到等等空間站、會員摘要 API', () => {
  assert.match(server, /SSO_BASE, \.\.\.Object\.keys\(BRAND_HOSTS\)\.map/, '品牌站（含 staysquare）在登入導回白名單');
  assert.match(server, /app\.get\('\/api\/me\/summary', auth, requireDb/);
  assert.match(server, /brandReturnBase\(req\.body\) \|\| APP_BASE/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS zone TEXT/);
});

for (const dir of ['', 'en/', 'ja/']) {
  test(`等等空間 ${dir || 'zh/'}：登入、購買、包場表單價格與後端一致`, () => {
    // CIC 式多頁（KK 11/8）：每頁都載登入對話框與腳本；會籍購買在 /membership、包場表單在 /venue
    for (const page of ['', '-about', '-spaces', '-membership', '-venue', '-access']) {
      const any = fs.readFileSync(`public/brand-sites/${dir}stay-square${page}.html`, 'utf8');
      assert.ok(any.includes('<script src="/sso-client.js" defer></script>\n<script src="/brand-sites/stay-square-shop.js" defer></script>'), page + ' 先載 SSO 再載購買腳本');
      assert.ok(any.includes('id="sq-login"') && any.includes('data-sq-flash'), page + ' 登入對話框與提示');
    }
    let html = fs.readFileSync(`public/brand-sites/${dir}stay-square-membership.html`, 'utf8');
    assert.ok(html.includes('data-sq-login') && html.includes('id="member"'));
    for (const plan of ['day_4h', 'day_12h', 'month', 'quarter', 'year', 'year_promo']) {
      const m = html.match(new RegExp(`data-plan="${plan}"[^>]*>[^<]*NT\\$([\\d,]+)<`));
      assert.ok(m, plan);
      assert.equal(Number(m[1].replace(/,/g, '')), PLAN_PRICE_TWD[plan], plan + ' 價格');
    }
    html = fs.readFileSync(`public/brand-sites/${dir}stay-square-venue.html`, 'utf8');
    for (const [zone, z] of Object.entries(STAY_ZONES)) {
      assert.ok(html.includes(`value="${zone}" data-fee="${z.fee}" data-max="${z.max}"`), zone);
    }
    assert.ok(html.includes('id="sq-book-form"') && html.includes('name="consent"'));
    assert.ok(!html.includes('/events?apply=1'), '包場改在本站預約');
  });
}

test('前端只在本站存 token、結帳帶 return_host', () => {
  const js = fs.readFileSync('public/brand-sites/stay-square-shop.js', 'utf8');
  assert.match(js, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/, '取得 token 後從網址移除');
  assert.match(js, /\/api\/me\/plans\/checkout', \{ plan: plan, return_host: location\.hostname/);
  assert.match(js, /deposit\/checkout', \{ return_host: location\.hostname/);
  assert.match(js, /\/api\/me\/plans\/verify/);
  assert.match(js, /SSO\.silent\(KEY\)/, '沒 token 先向 SSO 靜默取');
  assert.match(js, /SSO && ssoOk \? SSO\.wrap\(u\) : u/, '登入鈕經 SSO callback；SSO 連不上退回本站登入');
  assert.ok(!/innerHTML/.test(js), '不用 innerHTML 塞使用者資料');
});
