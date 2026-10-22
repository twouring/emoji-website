// LINE 登入沒給信箱的會員：App 補綁 Email（驗證碼寄信、票券綁定帳號、已存在信箱則合併到原帳號）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');
const route = name => { const i = server.indexOf(`app.post('/api/me/email/${name}'`); assert.ok(i > 0, name); return server.slice(i, server.indexOf('\n}));', i)); };

test('start: member only, rate limited, refuses accounts that already have email, mails a 6-digit code', () => {
  const s = route('start');
  assert.match(s, /auth, requireDb, rateLimit\(/);
  assert.match(s, /if \(!req\.auth\.sub\) return res\.status\(403\)/);
  assert.match(s, /if \(me\.email\) return res\.status\(409\)/);
  assert.match(s, /crypto\.randomInt\(0, 1000000\)/);
  assert.match(s, /purpose: 'email-bind'/);
  assert.doesNotMatch(s, /json\(\{[^}]*code[,}]/, '驗證碼不能回給前端');
});
test('verify: ticket must belong to caller, code checked in constant time, merge goes through mergeBlocker + audit row', () => {
  const v = route('verify');
  assert.match(v, /t\.sub !== req\.auth\.sub/);
  assert.match(v, /safeEqual\(t\.h, emailBindHash\(t\.sub, t\.email, code\)\)/);
  assert.match(v, /pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)/);
  assert.match(v, /memberMerge\.mergeBlocker\(owner, me\)/);
  assert.match(v, /memberMerge\.mergeMembers\(client, owner, me\)/);
  assert.match(v, /INSERT INTO pos_member_merges/);
  assert.match(v, /token: await memberSessionToken\(keep\)/);
});
test('app: email-less members see bind form; new session token replaces old one', () => {
  assert.match(app, /!editing&&!m\.email\?`<section class="sec" id="eb">/);
  assert.match(app, /post\('\/api\/me\/email\/start'/);
  assert.match(app, /post\('\/api\/me\/email\/verify'/);
  assert.match(app, /localStorage\.setItem\(KEY,d\.token\)/);
  for (const l of ['ebBind:', 'ebSend:', 'ebCode:', 'ebMerged:']) assert.equal(app.split(l + "'").length - 1, 3, l);
});
