// Passkey（WebAuthn）：用軟體驗證器產生真實的註冊／登入回應，驗 lib/passkey.js
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pk = require('../lib/passkey.js');
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest();
const b64u = b => Buffer.from(b).toString('base64url');
const RP = 'app.emoji.tw', ORIGIN = 'https://app.emoji.tw';

function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === 'string') { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('x');
}
function head(m, n) { if (n < 24) return Buffer.from([m << 5 | n]); if (n < 256) return Buffer.from([m << 5 | 24, n]); const b = Buffer.alloc(3); b[0] = m << 5 | 25; b.writeUInt16BE(n, 1); return b; }
const counterBuf = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

function authenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }), credId = crypto.randomBytes(32);
  const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  return {
    credId, privateKey,
    register(challenge, o = {}) {
      const ad = Buffer.concat([sha(o.rp || RP), Buffer.from([o.flags ?? 0x45]), counterBuf(0), Buffer.alloc(16), Buffer.from([credId.length >> 8, credId.length & 255]), credId, cbor(cose)]);
      const cd = JSON.stringify({ type: 'webauthn.create', challenge, origin: o.origin || ORIGIN });
      return { id: b64u(credId), response: { clientDataJSON: b64u(cd), attestationObject: b64u(cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', ad]]))), transports: ['internal'] } };
    },
    login(challenge, counter, o = {}) {
      const ad = Buffer.concat([sha(o.rp || RP), Buffer.from([o.flags ?? 0x05]), counterBuf(counter)]);
      const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: o.origin || ORIGIN }));
      const sig = crypto.sign('sha256', Buffer.concat([ad, sha(cd)]), privateKey);
      return { id: b64u(credId), response: { clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(sig) } };
    },
  };
}
const ctx = c => ({ challenge: c, rpId: RP, origins: [ORIGIN] });

test('註冊：取出憑證 ID 與公鑰，再用同一把鑰匙登入成功', () => {
  const a = authenticator(), ch = 'chal-1';
  const reg = pk.verifyRegistration({ credential: a.register(ch), ...ctx(ch) });
  assert.equal(reg.credentialId, b64u(a.credId)); assert.equal(reg.jwk.kty, 'EC');
  const out = pk.verifyAssertion({ credential: a.login('chal-2', 5), ...ctx('chal-2'), stored: { jwk: reg.jwk, counter: 0 } });
  assert.equal(out.counter, 5);
});

test('登入：challenge、origin、rpId、簽章、旗標、計數器任一不對都拒絕', () => {
  const a = authenticator(), reg = pk.verifyRegistration({ credential: a.register('c'), ...ctx('c') });
  const stored = { jwk: reg.jwk, counter: 3 };
  const bad = (cred, c = 'x', s = stored) => assert.throws(() => pk.verifyAssertion({ credential: cred, ...ctx(c), stored: s }), { code: 'PASSKEY_INVALID' });
  bad(a.login('x', 4), 'other');
  bad(a.login('x', 4, { origin: 'https://evil.example' }));
  bad(a.login('x', 4, { rp: 'evil.example' }));
  bad(a.login('x', 4, { flags: 0x01 })); // 沒有生物辨識
  bad(a.login('x', 3)); // 計數器沒遞增（複製的驗證器）
  const other = authenticator(); // 別人的鑰匙簽
  bad(other.login('x', 4));
  const t = a.login('x', 4); t.response.signature = b64u(Buffer.alloc(70)); bad(t);
  pk.verifyAssertion({ credential: a.login('x', 4), ...ctx('x'), stored }); // 正常
  pk.verifyAssertion({ credential: a.login('x', 0), ...ctx('x'), stored: { jwk: reg.jwk, counter: 0 } }); // iCloud 鑰匙圈計數器恆為 0
});

test('註冊：拒絕錯 challenge／origin／rp／沒生物辨識', () => {
  const a = authenticator();
  for (const [cred, c] of [[a.register('c'), 'zzz'], [a.register('c', { origin: 'https://evil.example' }), 'c'], [a.register('c', { rp: 'evil.example' }), 'c'], [a.register('c', { flags: 0x41 }), 'c']])
    assert.throws(() => pk.verifyRegistration({ credential: cred, ...ctx(c) }), { code: 'PASSKEY_INVALID' });
  assert.throws(() => pk.verifyRegistration({ credential: {}, ...ctx('c') }), { code: 'PASSKEY_INVALID' });
});

test('options：平台驗證器＋必須生物辨識；登入不指定帳號', () => {
  const o = pk.registrationOptions({ rpId: RP, rpName: 'x', user: { id: 'u1', name: 'a@b', displayName: 'A' }, challenge: 'c', exclude: ['id1'] });
  assert.equal(o.authenticatorSelection.authenticatorAttachment, 'platform'); assert.equal(o.authenticatorSelection.userVerification, 'required');
  assert.equal(o.excludeCredentials.length, 1); assert.equal(o.attestation, 'none');
  const l = pk.authenticationOptions({ rpId: RP, challenge: 'c' });
  assert.deepEqual(l.allowCredentials, []); assert.equal(l.userVerification, 'required');
});

test('伺服器與前端接線', () => {
  const s = read('server.js'), m = read('public/m.html'), api = read('docs/API.md');
  for (const r of ['/api/passkey/register/options', '/api/passkey/register/verify', '/api/passkey/login/options', '/api/passkey/login/verify']) assert.ok(s.includes(`'${r}'`), r);
  assert.match(s, /CREATE TABLE IF NOT EXISTS passkeys/);
  assert.match(s, /passkeyOnly/);
  assert.match(m, /navigator\.credentials\.get/); assert.match(m, /navigator\.credentials\.create/);
  assert.match(m, /isUserVerifyingPlatformAuthenticatorAvailable/);
  assert.match(api, /POST \/api\/passkey\/login\/verify/);
});

test('快速註冊：端點、名字上限、驗證後才建帳號、前端表單', () => {
  const s = read('server.js'), m = read('public/m.html');
  assert.ok(s.includes("'/api/passkey/signup/options'") && s.includes("'/api/passkey/signup/verify'"));
  assert.match(s, /pk-signup/);
  const v = s.slice(s.indexOf("'/api/passkey/signup/verify'"));
  assert.ok(v.indexOf('verifyRegistration') < v.indexOf('INSERT INTO users'), '先驗證再建帳號');
  assert.match(m, /pkSignup/); assert.match(m, /快速註冊/);
});
