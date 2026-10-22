import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const P = require('../lib/partners.js');
const R = require('../lib/public-render.js');
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('所屬信箱：完整 Email 與 @網域，小寫去重；只填網域補 @', () => {
  assert.deepEqual(P.normalizeEmails('A@x.com\n@Y.org, z.tw a@x.com').value, ['a@x.com', '@y.org', '@z.tw']);
  assert.match(P.normalizeEmails('not-an-email').error, /格式不正確/);
});

test('信箱比對：完整相符或網域相符，不吃子字串', () => {
  const list = ['kk@dna.org.tw', '@twouring.com'];
  assert.equal(P.emailMatches(list, 'KK@dna.org.tw'), true);
  assert.equal(P.emailMatches(list, 'us@twouring.com'), true);
  assert.equal(P.emailMatches(list, 'us@eviltwouring.com'), false);
  assert.equal(P.emailMatches(list, 'other@dna.org.tw'), false);
  assert.equal(P.emailMatches(list, ''), false);
});

test('夥伴表單驗證：名稱必填、網址與 Logo 只收安全網址', () => {
  assert.match(P.normalizePartnerInput({}).error, /名稱/);
  assert.match(P.normalizePartnerInput({ name: 'A', url: 'javascript:alert(1)' }).error, /網址/);
  assert.match(P.normalizePartnerInput({ name: 'A', logo_url: 'http://x.com/a.png' }).error, /Logo/);
  const ok = P.normalizePartnerInput({ name: 'TDNA', url: 'https://dna.org.tw', logo_url: '/uploads/space/a.png', emails: ['@dna.org.tw'], visible: false, sort: '3' }).value;
  assert.equal(ok.visible, false); assert.equal(ok.sort, 3); assert.deepEqual(ok.emails, ['@dna.org.tw']);
});

test('徽章等級：1／3／6／10 場升級，未參加沒有徽章', () => {
  assert.equal(P.levelFor(0).level, 0);
  assert.deepEqual([1, 2, 3, 5, 6, 9, 10, 30].map(n => P.levelFor(n).level), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(P.levelFor(4).to_next, 2);
  assert.equal(P.levelFor(12).next_level, null);
  const badges = P.buildBadges([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [{ partner_id: 'a', count: 1 }, { partner_id: 'b', count: 6 }, { partner_id: 'gone', count: 9 }]);
  assert.deepEqual(badges.map(b => [b.partner_id, b.level]), [['b', 3], ['a', 1]]);
  assert.equal(badges[0].partner_name, 'B');
});

test('公開夥伴不外露所屬信箱', () => {
  assert.equal('emails' in P.publicPartner({ id: 'a', name: 'A', emails: ['x@y.z'] }), false);
});

test('官網首頁三語都有夥伴區塊，有資料才顯示並跳脫輸出', () => {
  for (const f of ['public/index.html', 'public/en/index.html', 'public/ja/index.html']) {
    const html = read(f);
    assert.match(html, /<section id="our-partners" hidden/);
    assert.equal(R.renderHome(html, { partners: [] }, 'zh').includes('<section id="our-partners" hidden'), true);
    const out = R.renderHome(html, { partners: [{ name: 'A<b>', url: 'https://a.tw', logo_url: '/uploads/space/a.png' }] }, 'zh');
    assert.match(out, /<section id="our-partners" style/);
    assert.match(out, /A&lt;b&gt;/);
    assert.match(out, /href="https:\/\/a\.tw" target="_blank" rel="noopener noreferrer"/);
  }
});

test('後台、App、API 都接上合作夥伴', () => {
  const admin = read('public/admin.html'), server = read('server.js'), host = read('public/m-host.js'), app = read('public/m.html');
  assert.match(admin, /\{ id:'partners',\s+label:'合作夥伴', render:tabPartners \}/);
  assert.match(admin, /id="ev-partner"/);
  assert.match(server, /app\.post\('\/api\/admin\/events\/:id\/partner'/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS partner_id TEXT REFERENCES partners\(id\) ON DELETE SET NULL/);
  assert.match(host, /function uxPartner\(/);
  assert.match(app, /function badgesSec\(/);
});
