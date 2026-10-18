// scripts/test-upload-parts-limit.mjs
// busboy 在第 N 個 part 讀完就觸發 partsLimit，所以 parts:1 連單一檔案也會回「Too many parts」。
// 單檔上傳端點（fields:0, files:1）的 parts 至少要 2。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('multer parts limit is never 1 (busboy rejects even a single file)', () => {
  const limits = [...src.matchAll(/parts\s*:\s*(\d+)/g)].map(m => Number(m[1]));
  assert.ok(limits.length > 0);
  for (const n of limits) assert.ok(n >= 2, `parts:${n} rejects a single-file upload`);
});

test('menu image upload accepts one file', () => {
  assert.match(src, /const menuUpload = multer\(.*parts:\s*2 \}/);
});
