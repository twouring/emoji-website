import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const zip = new URL('../public/downloads/emoji-pos-escpos-bridge.zip', import.meta.url);

test('POS settings download package contains the full cross-platform ESC/POS bridge', () => {
  assert.ok(fs.statSync(zip).size > 1000, '安裝包不可為空');
  const list = execFileSync('unzip', ['-Z1', zip.pathname], { encoding: 'utf8' });
  for (const expected of ['tools/escpos-bridge/service.js', 'tools/escpos-bridge/config.example.json', 'tools/escpos-bridge/start-macos.command', 'tools/escpos-bridge/start-windows.cmd', 'tools/escpos-bridge/raw-print.ps1', 'tools/escpos-bridge/README.md']) assert.match(list, new RegExp('^' + expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'));
  execFileSync('unzip', ['-t', zip.pathname], { stdio: 'pipe' });
});
