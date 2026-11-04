'use strict';
const crypto = require('crypto');

const SESSION_TTL_MS = 7 * 86400_000;
const OAUTH_TTL_MS = 10 * 60_000;
// SSO（sso.emoji.tw）：.emoji.tw 共用的登入 cookie 只放 {sub}，30 天，每次換 token 時順延
const SSO_TTL_MS = 30 * 86400_000;
const ttlOf = purpose => purpose === 'oauth' ? OAUTH_TTL_MS : purpose === 'sso' ? SSO_TTL_MS : SESSION_TTL_MS;
const PUBLIC_CONTENT_KEYS = [
  'home_notice', 'menu', 'yan_rewards', 'ordering_pause', 'space_hero_image',
  ...[1, 2, 3, 4].flatMap(n => ['', '_zh', '_en', '_ja', '_image'].map(s => `space_${n}f${s}`)),
];

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signToken(payload, secret, { purpose = 'session', now = Date.now() } = {}) {
  const ttl = ttlOf(purpose);
  const body = Buffer.from(JSON.stringify({ ...payload, purpose, iat: now, exp: now + ttl })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function verifyToken(token, secret, { purpose = 'session', now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0])) return null;
  const [body, sig] = parts;
  if (!safeEqual(sig, crypto.createHmac('sha256', secret).update(body).digest('base64url'))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const ttl = ttlOf(purpose);
    if (!p || p.purpose !== purpose || !Number.isFinite(p.iat) || !Number.isFinite(p.exp) ||
        p.iat > now || p.exp <= now || p.exp <= p.iat || p.exp - p.iat > ttl) return null;
    if (purpose === 'session' && (typeof p.sub !== 'string' || !p.sub ||
        !['admin', 'participant', 'invited'].includes(p.role))) return null;
    return p;
  } catch { return null; }
}

// KK 2026-11-05：不做頻率限制（店內共用對外 IP，會誤擋「操作過於頻繁」）。保留簽名讓路由不用改。
function rateLimit() {
  return (_req, _res, next) => next();
}

module.exports = { SSO_TTL_MS, safeEqual, signToken, verifyToken, PUBLIC_CONTENT_KEYS, rateLimit };
