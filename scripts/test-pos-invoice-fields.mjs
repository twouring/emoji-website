// POS 結帳發票：紙本／統編／手機載具／自然人憑證／捐贈 各自的輸入框只在點選對應類型後才出現；
// 手機載具額外支援相機掃描條碼寫回 carrier_num。純字串掃描 pos-ops.js 原始碼（跟 test-pos-pwa.mjs 同作法），
// 不需要真的跑瀏覽器/jsdom。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/pos-ops.css', import.meta.url), 'utf8');

test('發票欄位：每個類型各自的輸入框用 data-inv-modes 標記，預設都在，點選對應類型才由 JS 顯示', () => {
  assert.match(ops, /data-inv-modes="company"[^>]*>[^<]*<input name="buyer_ubn"/);
  assert.match(ops, /data-inv-modes="mobile,citizen"/);
  assert.match(ops, /data-inv-modes="donate"[^>]*>[^<]*<input name="love_code"/);
  assert.match(ops, /data-inv-modes="paper,company"[^>]*>[^<]*<input name="buyer_name"/);
  // buyer_email／comment 在任何一種發票類型下都該出現（都含 paper,company,mobile,citizen,donate）
  assert.match(ops, /data-inv-modes="paper,company,mobile,citizen,donate"[^>]*>[^<]*<input name="buyer_email"/);
  assert.match(ops, /data-inv-modes="paper,company,mobile,citizen,donate"[^>]*>[^<]*<input name="comment"/);
});

test('updateInvoiceFields() 依目前選的發票類型切換每列 hidden，初次畫面與切換類型時都會呼叫', () => {
  assert.match(ops, /function updateInvoiceFields\(host\)\{/);
  assert.match(ops, /el\.hidden=!el\.dataset\.invModes\.split\(','\)\.includes\(mode\)/);
  // 面板畫出來先套用一次（避免一開始全部欄位都顯示）
  assert.match(ops, /updateInvoiceFields\(host\);\s*\n\s*host\.querySelectorAll\('input\[name=pos-invoice\]'\)/);
  // 切換發票類型時也要重新套用
  assert.match(ops, /r\.onchange=\(\)=>\{[^}]*updateInvoiceFields\(host\);\}/);
});

test('手機載具專屬相機掃描鍵：用 BarcodeDetector 掃條碼寫回 carrier_num；不支援的瀏覽器要有提示', () => {
  assert.match(ops, /id="pos-invoice-scan"[^>]*data-inv-modes="mobile"/);
  assert.match(ops, /new BarcodeDetector\(\{formats:\['code_39','code_128','qr_code'\]\}\)/);
  assert.match(ops, /此瀏覽器不支援相機掃碼，請直接輸入手機條碼/);
  assert.match(ops, /carrierIn\.value=raw\.trim\(\)\.toUpperCase\(\)/);
});

test('切換畫面／離開手機載具模式要停止相機，不留下背景串流', () => {
  assert.match(ops, /function stopPosInvoiceScanner\(\)\{/);
  assert.match(ops, /function paintPos\(\)\{\s*\n\s*const host=document\.getElementById\('pos-body'\),d=POS_DATA;if\(!host\|\|!d\)return;\s*\n\s*stopPosInvoiceScanner\(\);/);
  assert.match(ops, /if\(mode!=='mobile'\)stopPosInvoiceScanner\(\);/);
});

test('CSS：隱藏列真的不佔版面，手機條碼輸入框與掃描鍵同一列', () => {
  assert.match(css, /\.pos-inv-row\[hidden\]\{display:none\}/);
  assert.match(css, /\.pos-inv-scan-row\{display:flex/);
});
