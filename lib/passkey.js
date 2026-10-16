'use strict';
// WebAuthn（passkey／Touch ID／Face ID）驗證：純函式、不連 DB、不需額外套件。
// 只支援 attestation "none"（平台驗證器不需要證明），演算法 ES256（-7）與 RS256（-257）。
const crypto = require('crypto');

const sha256 = b => crypto.createHash('sha256').update(b).digest();
const b64u = b => Buffer.from(b).toString('base64url');

// 最小 CBOR 解碼器（WebAuthn 只用到整數、位元組、字串、陣列、map、布林／null）
function cborDecode(buf) {
  let o = 0;
  function item(depth) {
    if (depth > 8 || o >= buf.length) throw new Error('cbor');
    const ib = buf[o++], major = ib >> 5, ai = ib & 31;
    let n;
    if (ai < 24) n = ai;
    else if (ai === 24) { n = buf[o]; o += 1; }
    else if (ai === 25) { n = buf.readUInt16BE(o); o += 2; }
    else if (ai === 26) { n = buf.readUInt32BE(o); o += 4; }
    else if (major === 7) n = 0;
    else throw new Error('cbor');
    switch (major) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: { if (o + n > buf.length) throw new Error('cbor'); const v = buf.subarray(o, o + n); o += n; return Buffer.from(v); }
      case 3: { if (o + n > buf.length) throw new Error('cbor'); const v = buf.subarray(o, o + n).toString('utf8'); o += n; return v; }
      case 4: { if (n > 256) throw new Error('cbor'); const a = []; for (let i = 0; i < n; i++) a.push(item(depth + 1)); return a; }
      case 5: { if (n > 256) throw new Error('cbor'); const m = new Map(); for (let i = 0; i < n; i++) { const k = item(depth + 1); m.set(k, item(depth + 1)); } return m; }
      case 7: return ai === 20 ? false : ai === 21 ? true : null;
      default: throw new Error('cbor');
    }
  }
  const v = item(0);
  return { value: v, length: o };
}

// COSE 公鑰 → { kty… } JWK（只收 ES256 / RS256）
function coseToJwk(cose) {
  const kty = cose.get(1), alg = cose.get(3);
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    const x = cose.get(-2), y = cose.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) throw new Error('key');
    return { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y), alg: 'ES256' };
  }
  if (kty === 3 && alg === -257) {
    const n = cose.get(-1), e = cose.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 128) throw new Error('key');
    return { kty: 'RSA', n: b64u(n), e: b64u(e), alg: 'RS256' };
  }
  throw new Error('不支援的金鑰演算法');
}

function parseAuthData(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 37) throw new Error('authData');
  const flags = buf[32];
  const out = { rpIdHash: buf.subarray(0, 32), up: !!(flags & 1), uv: !!(flags & 4), at: !!(flags & 64), counter: buf.readUInt32BE(33), rest: buf.subarray(37) };
  return out;
}

function checkClient(clientDataJSON, type, expect) {
  let c;
  try { c = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')); } catch { throw new Error('clientData'); }
  if (!c || c.type !== type) throw new Error('type');
  if (typeof c.challenge !== 'string' || c.challenge !== expect.challenge) throw new Error('challenge');
  if (typeof c.origin !== 'string' || !expect.origins.includes(c.origin)) throw new Error('origin');
  let host; try { host = new URL(c.origin).hostname; } catch { throw new Error('origin'); }
  if (host !== expect.rpId) throw new Error('origin');
  return c;
}

// 註冊：回 { credentialId, jwk, counter, transports }
function verifyRegistration({ credential, challenge, rpId, origins }) {
  try {
    const r = credential && credential.response;
    if (!r || typeof r.clientDataJSON !== 'string' || typeof r.attestationObject !== 'string') throw new Error('body');
    checkClient(r.clientDataJSON, 'webauthn.create', { challenge, rpId, origins });
    const att = cborDecode(Buffer.from(r.attestationObject, 'base64url')).value;
    const ad = parseAuthData(att.get('authData'));
    if (!ad.rpIdHash.equals(sha256(rpId))) throw new Error('rp');
    if (!ad.up || !ad.uv) throw new Error('uv');
    if (!ad.at || ad.rest.length < 18) throw new Error('at');
    const idLen = ad.rest.readUInt16BE(16);
    if (idLen < 16 || idLen > 1023 || ad.rest.length < 18 + idLen) throw new Error('id');
    const credId = ad.rest.subarray(18, 18 + idLen);
    const cose = cborDecode(ad.rest.subarray(18 + idLen)).value;
    if (!(cose instanceof Map)) throw new Error('key');
    const credentialId = b64u(credId);
    if (typeof credential.id === 'string' && credential.id !== credentialId) throw new Error('id');
    const transports = Array.isArray(r.transports) ? r.transports.filter(t => ['internal', 'hybrid', 'usb', 'nfc', 'ble'].includes(t)) : [];
    return { credentialId, jwk: coseToJwk(cose), counter: ad.counter, transports };
  } catch (e) {
    throw Object.assign(new Error('Passkey 驗證失敗。'), { code: 'PASSKEY_INVALID', detail: e.message });
  }
}

// 登入：stored = { jwk, counter }；回 { counter }
function verifyAssertion({ credential, challenge, rpId, origins, stored }) {
  try {
    const r = credential && credential.response;
    if (!r || typeof r.clientDataJSON !== 'string' || typeof r.authenticatorData !== 'string' || typeof r.signature !== 'string') throw new Error('body');
    checkClient(r.clientDataJSON, 'webauthn.get', { challenge, rpId, origins });
    const adBuf = Buffer.from(r.authenticatorData, 'base64url');
    const ad = parseAuthData(adBuf);
    if (!ad.rpIdHash.equals(sha256(rpId))) throw new Error('rp');
    if (!ad.up || !ad.uv) throw new Error('uv');
    const signed = Buffer.concat([adBuf, sha256(Buffer.from(r.clientDataJSON, 'base64url'))]);
    const key = crypto.createPublicKey({ key: stored.jwk, format: 'jwk' });
    if (!crypto.verify('sha256', signed, key, Buffer.from(r.signature, 'base64url'))) throw new Error('sig');
    // 計數器：有支援的驗證器必須遞增（iCloud 鑰匙圈固定回 0，不檢查）
    if ((ad.counter || stored.counter) && ad.counter <= stored.counter) throw new Error('counter');
    return { counter: ad.counter };
  } catch (e) {
    throw Object.assign(new Error('Passkey 驗證失敗。'), { code: 'PASSKEY_INVALID', detail: e.message });
  }
}

function registrationOptions({ rpId, rpName, user, challenge, exclude }) {
  return {
    challenge, rp: { id: rpId, name: rpName },
    user: { id: b64u(Buffer.from(user.id)), name: user.name, displayName: user.displayName },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    attestation: 'none', timeout: 60000,
    excludeCredentials: (exclude || []).map(id => ({ type: 'public-key', id })),
  };
}

function authenticationOptions({ rpId, challenge }) {
  return { challenge, rpId, userVerification: 'required', timeout: 60000, allowCredentials: [] };
}

module.exports = { cborDecode, coseToJwk, verifyRegistration, verifyAssertion, registrationOptions, authenticationOptions };
