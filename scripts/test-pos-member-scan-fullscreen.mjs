import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');

test('掃會員：全螢幕彈窗、點了直接開相機、會員卡 QR 保留大小寫', () => {
  const fn = ops.slice(ops.indexOf('function pickMemberCard('), ops.indexOf('function syncInvoiceBadge'));
  assert.ok(fn.length > 0);
  assert.match(fn, /ov\.className='pos-scan-full'/);
  assert.match(fn, /pos-scan-full-frame--qr/);
  assert.doesNotMatch(fn, /pickOverlay\(/, '不再用小彈窗');
  assert.doesNotMatch(fn, /pos-card-scan/, '不需要再按「掃描」才開相機');
  assert.match(fn, /startInvoiceScan\(video,v=>done\(v\),\{raw:true\}\)/);
  assert.match(fn, /document\.removeEventListener\('keydown',esc_\)/);
  assert.match(css, /\.pos-scan-full-frame--qr\{/);
});

test('背景重繪不關掉全螢幕掃描的相機', () => {
  assert.match(ops, /if\(mode!=='mobile'&&!document\.querySelector\?\.\('\.pos-scan-full'\)\)stopPosInvoiceScanner\(\);/);
});

test('pickMemberCard 真的跑得起來：自訂標題／提示不能和函式內變數撞名（KK 11/17 掃碼進出沒反應）', async () => {
  const vm = await import('node:vm');
  const fn = ops.slice(ops.indexOf('function pickMemberCard('), ops.indexOf('function syncInvoiceBadge'));
  const el = () => ({ setAttribute(){}, querySelector: () => el(), addEventListener(){}, remove(){}, focus(){}, set onclick(v){}, set onkeydown(v){}, set innerHTML(v){ this._h = v; }, get innerHTML(){ return this._h; }, value: '' });
  let body;
  const ctx = vm.createContext({ document: { createElement: () => { const e = el(); body = e; return e; }, body: { appendChild(){} }, addEventListener(){}, removeEventListener(){} }, startInvoiceScan: async () => true, stopPosInvoiceScanner(){}, posScanField: x => x, toast(){}, setTimeout, Promise });
  vm.runInContext(fn + ';globalThis.p=pickMemberCard;', ctx);
  assert.doesNotThrow(() => ctx.p({ title: '掃會員卡確認進出', hint: '提示<b>' }));
  assert.match(body.innerHTML, /提示&lt;b&gt;/);
  assert.doesNotThrow(() => ctx.p());
});
