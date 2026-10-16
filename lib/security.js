'use strict';
const crypto = require('crypto');

const SESSION_TTL_MS = 7 * 86400_000;
const OAUTH_TTL_MS = 10 * 60_000;
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
  const ttl = purpose === 'oauth' ? OAUTH_TTL_MS : SESSION_TTL_MS;
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
    const ttl = purpose === 'oauth' ? OAUTH_TTL_MS : SESSION_TTL_MS;
    if (!p || p.purpose !== purpose || !Number.isFinite(p.iat) || !Number.isFinite(p.exp) ||
        p.iat > now || p.exp <= now || p.exp <= p.iat || p.exp - p.iat > ttl) return null;
    if (purpose === 'session' && (typeof p.sub !== 'string' || !p.sub ||
        !['admin', 'participant', 'invited'].includes(p.role))) return null;
    return p;
  } catch { return null; }
}

// ponytail: 每個 Node 程序獨立限流；多副本部署時改用代理層共享限流。
function rateLimit({ max = 60, windowMs = 60_000, now = Date.now } = {}) {
  const buckets = new Map();
  let sweptAt = 0;
  return (req, res, next) => {
    const time = now();
    if (time - sweptAt >= windowMs) {
      for (const [key, entry] of buckets) if (entry.until <= time) buckets.delete(key);
      sweptAt = time;
    }
    const key = req.ip || req.socket.remoteAddress;
    let entry = buckets.get(key);
    if (!entry || entry.until <= time) {
      if (buckets.size >= 10_000) return res.status(429).json({ error: '請稍後再試。' });
      buckets.set(key, entry = { count: 0, until: time + windowMs });
    }
    if (++entry.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - time) / 1000))));
      return res.status(429).json({ error: '操作過於頻繁，請稍後再試。' });
    }
    next();
  };
}

module.exports = { safeEqual, signToken, verifyToken, PUBLIC_CONTENT_KEYS, rateLimit };
