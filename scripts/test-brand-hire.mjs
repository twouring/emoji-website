// 訂位只開放在咖啡、三點水；四個品牌站都能線上付費包場（KK 2026-11-17）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { HIRE_ZONES, quoteZoneFee, restBookHireError } = require('../lib/venue-fees.js');
const { normalizeEventApplication, applicationDeposit, applicationVenueText, venuesOfLocation } = require('../lib/event-applications.js');

const base = { community_name: 'x', contact_name: 'K', contact_email: 'k@x.tw', title: 't', description: 'd', attendees: '8', kind: 'business', visibility: 'private', consent: true };
const app = o => normalizeEventApplication({ ...base, ...o });

test('包場區域：約書旅交誼廳 2F NT$2,000、在咖啡／三點水 1F NT$30,000，等等空間分區照舊', () => {
  assert.deepEqual([HIRE_ZONES.LOUNGE.venue, HIRE_ZONES.LOUNGE.fee, HIRE_ZONES.LOUNGE.max], ['2F', 2000, 10]);
  for (const z of ['CAFE', 'BAR']) assert.deepEqual([HIRE_ZONES[z].venue, HIRE_ZONES[z].fee, HIRE_ZONES[z].max], ['1F', 30000, 50]);
  assert.equal(HIRE_ZONES.A.venue, '3F');
  assert.equal(quoteZoneFee({ zone: 'CAFE', slots: 2 }).fee_twd, 60000);
  assert.match(quoteZoneFee({ zone: 'LOUNGE', slots: 1, attendees: 11 }).error, /約書旅交誼廳至多 10 人/);
});

test('申請：zone 決定空間與場地費；venue 不一致擋下', () => {
  const lounge = app({ zone: 'LOUNGE', starts_at: '2099-06-20T14:00', ends_at: '2099-06-20T16:00' }).value; // 週六
  assert.equal(lounge.venue, '2F'); assert.equal(applicationDeposit(lounge), 2000); assert.equal(applicationVenueText(lounge), '約書旅交誼廳');
  const cafe = app({ zone: 'CAFE', attendees: '40', starts_at: '2099-06-22T09:00', ends_at: '2099-06-22T13:00' }).value;
  assert.equal(cafe.venue, '1F'); assert.equal(applicationDeposit(cafe), 60000);
  assert.deepEqual(venuesOfLocation(applicationVenueText(cafe)), ['1F'], '活動地點要能推回 1F（檔期衝突）');
  assert.deepEqual(venuesOfLocation(applicationVenueText(app({ zone: 'BAR', starts_at: '2099-06-22T19:00', ends_at: '2099-06-22T21:00' }).value)), ['1F']);
  assert.ok(app({ zone: 'BAR', venue: '3F', starts_at: '2099-06-22T19:00', ends_at: '2099-06-22T21:00' }).error);
  assert.match(app({ zone: 'BAR', attendees: '51', starts_at: '2099-06-22T19:00', ends_at: '2099-06-22T21:00' }).error, /至多 50 人/);
  assert.ok(app({ zone: 'CAFE', visibility: 'public', registration_mode: 'native', starts_at: '2099-06-22T09:00', ends_at: '2099-06-22T11:00' }).error, '只限包場');
});

test('約書旅交誼廳：平日白天與週二 19–21 不出租', () => {
  assert.match(restBookHireError('2099-06-22T06:00:00.000Z', '2099-06-22T08:00:00.000Z'), /平日只接 18:00 後/); // 週一 14:00
  assert.equal(restBookHireError('2099-06-22T10:00:00.000Z', '2099-06-22T12:00:00.000Z'), null);                // 週一 18:00
  assert.match(restBookHireError('2099-06-23T10:00:00.000Z', '2099-06-23T12:00:00.000Z'), /週二小聚/);          // 週二 18–20
  assert.equal(restBookHireError('2099-06-23T13:00:00.000Z', '2099-06-23T15:00:00.000Z'), null);                // 週二 21–23
  assert.equal(restBookHireError('2099-06-20T02:00:00.000Z', '2099-06-20T04:00:00.000Z'), null);                // 週六 10:00
});

for (const dir of ['', 'en/', 'ja/']) {
  test(`${dir || 'zh/'}品牌站：在咖啡、三點水、約書旅都有付費包場表單，訂位連結只在在咖啡、三點水`, () => {
    for (const [slug, zone] of [['at-cafe', 'CAFE'], ['3am', 'BAR'], ['rest-book', 'LOUNGE']]) {
      const html = fs.readFileSync(`public/brand-sites/${dir}${slug}.html`, 'utf8');
      const z = HIRE_ZONES[zone];
      assert.ok(html.includes(`value="${zone}" data-fee="${z.fee}" data-max="${z.max}"`), slug + ' 價格與後端一致');
      assert.ok(html.includes('id="sq-book-form"') && html.includes('id="sq-login"') && html.includes('/brand-sites/stay-square-shop.js'), slug);
      assert.ok(html.includes('data-sq-lazy') && html.includes('/brand-sites/hire.css'), slug + ' 不在進站時跳 SSO');
      assert.equal(html.includes('/reserve"'), slug !== 'rest-book', slug + ' 訂位連結');
      assert.ok(!html.includes('mailto:us@emoji.tw?subject=約書旅交誼廳包場'), '包場不再寄信');
    }
  });
}

test('官網：訂位頁標明只開放在咖啡、三點水，並連到四個品牌的包場', () => {
  for (const f of ['public/reserve.html', 'public/en/reserve.html', 'public/ja/reserve.html']) {
    const html = fs.readFileSync(f, 'utf8');
    assert.ok(html.includes('class="hint reserve-scope"'), f);
    for (const u of ['staysquare.emoji.tw', 'restbook.emoji.tw', 'atcafe.emoji.tw', '3am.emoji.tw']) assert.ok(html.includes(u), f + ' ' + u);
  }
  const js = fs.readFileSync('public/brand-sites/stay-square-shop.js', 'utf8');
  assert.match(js, /request_id: rid, kind: 'business', visibility: 'private', zone: form\.zone\.value/, '空間由 zone 決定，不寫死 3F');
  assert.match(js, /data-sq-lazy/);
});
