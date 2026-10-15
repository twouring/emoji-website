'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const validPassword = value => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 1024;
async function hashPassword(password) {
  if (!validPassword(password)) throw new Error('密碼須至少 8 個字元，且不可超過 1024 bytes。');
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, OPTIONS);
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}
// Missing accounts perform the same expensive operation; parameters are fixed, never trusted from stored input.
async function verifyPassword(password, encoded) {
  const match = typeof encoded === 'string' && /^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  const bounded = typeof password === 'string' && Buffer.byteLength(password, 'utf8') <= 1024;
  const key = await scrypt(bounded ? password : '', match ? match[1] : '0'.repeat(32), 64, OPTIONS);
  return !!(bounded && match && crypto.timingSafeEqual(key, Buffer.from(match[2], 'hex')));
}
module.exports = { hashPassword, verifyPassword, validPassword };
