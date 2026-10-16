// 會員 App 登入畫面：Google／LINE／Email 三種方式；Touch ID／Face ID（Passkey）已移除
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const m = read('public/m.html'), s = read('server.js'), api = read('docs/API.md');

test('登入畫面只有三種方式：Google、LINE（依 /api/auth/methods 顯示）、Email', () => {
  assert.match(m, /<a class="way google" href="\/auth\/google\?redirect=\$\{r\}">/);
  assert.match(m, /<a class="way line" id="line-login" hidden href="\/auth\/line\?redirect=\$\{r\}">/);
  assert.match(m, /<button type="button" class="way email" id="email-login">/);
  assert.match(m, /fetch\('\/api\/auth\/methods'\)/);
  assert.equal((m.match(/class="way /g) || []).length, 3, '恰好三個登入按鈕');
  for (const k of ['google', 'line', 'mail']) assert.match(m, new RegExp(`${k}:'<svg`), k + ' 圖示');
});

test('Email 登入：App 內填姓名＋Email，直接呼叫 /api/auth/email/start 並帶 redirect／lang；成功後顯示已寄出', () => {
  assert.match(m, /<form class="ef" id="ef" hidden>/);
  assert.match(m, /<input name="name" required maxlength="120" autocomplete="name">/);
  assert.match(m, /<input name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email">/);
  assert.match(m, /fetch\('\/api\/auth\/email\/start',\{method:'POST',headers:\{'content-type':'application\/json'\},body:JSON\.stringify\(\{name,email,redirect:back,lang:LANG\}\)/);
  assert.match(m, /T\.emailSentTo\(email\)/);
  assert.doesNotMatch(m, /event-login\.html/, 'App 不再跳去官網 Email 登入頁');
  // 後端：登入連結導回 redirect（app.emoji.tw 在 safeRedirect 白名單內）
  assert.match(s, /app\.post\('\/api\/auth\/email\/start'/);
  assert.match(s, /const redirect=safeRedirect\(req\.body\?\.redirect\)\|\|DEFAULT_MEMBER_URL/);
});

test('三語文案齊全', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const i = m.indexOf(`\n    ${lang}:{locale:'`); assert.ok(i > 0, lang);
    const block = m.slice(i, m.indexOf('installLabel:', i));
    for (const k of ['google:', 'lineLogin:', 'email:', 'emailSend:', 'emailSent:', 'emailSentTo:', 'emailFail:', 'firstTime:', 'needName:']) assert.ok(block.includes(k), lang + ' ' + k);
  }
});

test('Touch ID／Face ID（Passkey）全數移除：前端、後端路由、lib、API 文件', () => {
  for (const f of [m, s, api]) {
    assert.doesNotMatch(f, /Touch ID|Face ID|passkey|Passkey|PublicKeyCredential|navigator\.credentials/i);
  }
  assert.ok(!fs.existsSync(new URL('../lib/passkey.js', import.meta.url)));
  assert.doesNotMatch(m, /m_noauto|PK_FLAG|pksec/);
});

test('按鈕尺寸符合 mobile 標準（≥ 56px），字級不低於 1rem', () => {
  assert.match(m, /\.login \.way\{[^}]*min-height:56px/);
  assert.doesNotMatch(m, /font-size\s*:\s*(\.\d+rem|0\.\d+rem|\d{1,2}px)/i);
});
