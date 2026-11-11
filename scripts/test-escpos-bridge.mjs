import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const service = path.join(root, 'tools/escpos-bridge/service.js');
let child, dir, base;

async function waitFor(url) {
  let last;
  for (let i = 0; i < 40; i++) { try { const r = await fetch(url); if (r.ok) return r; last = Error(String(r.status)); } catch (e) { last = e; } await new Promise(r => setTimeout(r, 50)); }
  throw last;
}
test.before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'emoji-escpos-'));
  const port = 19000 + Math.floor(Math.random() * 1000);
  await writeFile(path.join(dir, 'config.json'), JSON.stringify({ host: '127.0.0.1', port, token: 'test-token-32-characters-long-abcdef', allowedOrigins: ['https://pos.emoji.tw'], printers: { 'receipt-main': { name: 'Test printer', queue: 'NoSuchPrinter' } } }));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [service], { env: { ...process.env, ESCPOS_CONFIG: path.join(dir, 'config.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitFor(base + '/health');
});
test.after(async () => { child?.kill(); await rm(dir, { recursive: true, force: true }); });
test('bridge only exposes health without authorization', async () => {
  const r = await fetch(base + '/health'); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
  assert.equal((await fetch(base + '/printers')).status, 401);
});
test('bridge enforces origin and token, and returns configured printer IDs', async () => {
  const denied = await fetch(base + '/printers', { headers: { Origin: 'https://evil.example', Authorization: 'Bearer test-token-32-characters-long-abcdef' } }); assert.equal(denied.status, 403);
  const r = await fetch(base + '/printers', { headers: { Origin: 'https://pos.emoji.tw', Authorization: 'Bearer test-token-32-characters-long-abcdef' } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), 'https://pos.emoji.tw'); assert.deepEqual((await r.json()).printers, [{ id: 'receipt-main', name: 'Test printer' }]);
});
test('bridge validates a job and does not claim unsupported host printing succeeded', async () => {
  const r = await fetch(base + '/print-jobs', { method: 'POST', headers: { Origin: 'https://pos.emoji.tw', 'Content-Type': 'application/json', Authorization: 'Bearer test-token-32-characters-long-abcdef' }, body: JSON.stringify({ jobId: 'receipt-1', printerId: 'receipt-main', raster: { width: 8, height: 1, data: 'AA==' }, cut: true }) });
  assert.equal(r.status, 502); const job = await r.json(); assert.equal(job.status, 'failed'); assert.match(job.error, /不支援的作業系統/);
  const again = await fetch(base + '/print-jobs/receipt-1', { headers: { Authorization: 'Bearer test-token-32-characters-long-abcdef' } }); assert.equal((await again.json()).status, 'failed');
});
