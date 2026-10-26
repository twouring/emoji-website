// scripts/test-pos-ui-consistency.mjs — POS UI 元件一致性（2026-10-16 盤點後釘住）：
// 1) 觸控目標：pos-ops.css 不得出現 44px 以下的 min-height／width／height 可點元件；2) 語意色（紅／綠／琥珀）一律走 --danger／--ok／--warn token，
// 3) 確認對話框一律 posConfirm()（與 pickReason 同一張 .op-card），不再用瀏覽器原生 confirm；4) 說明文字用 .hint 變體 class，不寫行內 style；
// 5) 字級用 rem 尺度，不混 px。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const css = read('public/pos-ops.css');
const ops = read('public/pos-ops.js');
const html = read('public/pos.html');

test('觸控目標：pos-ops.css 沒有 44px 以下的可點元件（min-height／固定 width・height）', () => {
  const small = [...css.matchAll(/(?:min-height|height|width):(\d+)px/g)].map(m => Number(m[1])).filter(n => n >= 20 && n < 44);
  // 允許的非觸控尺寸：裝飾用小圓點／圖示（20–22px：PIN 圓點、操作說明的「?」）、勾選框 22–28px、.kds-count 26px、.sales-bar 36px 長條；可點元件最小 44px
  const allowed = new Set([20, 22, 24, 26, 28, 36]);
  const exact = [...css.matchAll(/\.(?:[a-z-]*(?:btn|key|del|chip|opt|item|table|cat|method|qty|tno|amt|tools|scope|nav)[a-z-]*)[^{]*\{[^}]*(?:min-height|height|width):(\d+)px/g)].map(m => Number(m[1])).filter(n => n < 44);
  assert.deepEqual(exact, [], '按鈕類選擇器出現 44px 以下尺寸');
  for (const n of small) assert.ok(allowed.has(n), `pos-ops.css 有 ${n}px 的尺寸，不在允許清單（裝飾／非按鈕）內`);
  assert.match(css, /\.btn-xs\{min-height:44px/);
  assert.match(css, /\.shift-del\{[^}]*width:44px;height:44px/);
  assert.doesNotMatch(css, /\.ops-pay \.btn-xs\{min-height:36px/);
});

test('語意色：紅／綠／琥珀只在 :root 定義一次，其餘用 var(--danger／--ok／--warn…)；規格籤分類色票除外', () => {
  const rootDecl = css.match(/:root\{[^}]*\}/)?.[0] || '';
  for (const t of ['--danger', '--danger-line', '--danger-soft', '--ok', '--ok-soft', '--warn', '--warn-ink', '--warn-line', '--warn-soft']) assert.match(rootDecl, new RegExp(`${t}:#[0-9a-f]{6}`), t);
  const body = css.replace(/:root\{[^}]*\}/, '').replace(/\.ops-spec-(temperature|sugar|ice|rice|noodle)\{[^}]*\}/g, '').replace(/\.pos-opt-group\[data-opt=[a-z]+\] label:has\(input:checked\)\{[^}]*\}/g, '');
  for (const hex of ['#b42318', '#b91c1c', '#15803d', '#2e7d32', '#1b5e2a', '#d59f00', '#7a5a00', '#f1dc9a', '#fff6dc', '#fff5f3', '#f3c6c0', '#eaf7ec', '#777', '#ddd', '#fafafa', '#d8d8d8']) assert.ok(!body.includes(hex), `pos-ops.css 還有硬編碼 ${hex}`);
  assert.doesNotMatch(html, /#b42318/, 'pos.html 的紅色要用 var(--danger)');
  assert.doesNotMatch(ops, /#ddd|background:#fff"/, 'pos-ops.js 不該有行內色碼');
});

test('確認對話框：pos-ops.js 零 confirm()，一律 posConfirm（同 .op-overlay／.op-card，主鍵在右，danger 用實心紅）', () => {
  assert.equal((ops.match(/\bconfirm\(/g) || []).length, 0, '不可再用瀏覽器 confirm');
  assert.match(ops, /function posConfirm\(message,\{title='',ok='確定',cancel='取消',danger=false\}=\{\}\)/);
  assert.match(ops, /class="op-card pos-confirm" role="alertdialog"/);
  assert.match(ops, /<button type="button" class="btn btn--ghost" data-cancel>\$\{esc\(cancel\)\}<\/button><button type="button" class="btn btn--solid\$\{danger\?' btn--danger':''\}" data-ok>\$\{esc\(ok\)\}<\/button>/, '取消在左、主鍵在右');
  assert.match(css, /\.btn\.btn--solid\.btn--danger\{background:var\(--danger\)/);
  assert.match(css, /\.pos-confirm \.op-card-actions \.btn\{flex:1;min-height:52px\}/);
  // 破壞性動作走 danger
  for (const re of [/清桌 \$\{cur\.table\}[^`]*`,\{ok:cur\.takeout\?'收掉':'清桌',danger:true\}/, /ok:'強制清桌',danger:true/, /刪除這一班？',\{ok:'刪除',danger:true\}/, /ok:'停用',danger:true/, /刪除這筆出勤？',\{ok:'刪除',danger:true\}/, /這筆訂位？刪除後不再顯示，無法復原。`,\{ok:'刪除',danger:true\}/]) assert.match(ops, re);
  // 退現金的兩顆鍵用動作字樣，不再在內文寫「確定＝／取消＝」
  assert.equal((ops.match(/\{ok:'退現金並開錢櫃',cancel:'只更正帳務'\}/g) || []).length, 2);
  assert.doesNotMatch(ops, /posConfirm\((?:`[^`]*`|'[^']*')[^)]*?(確定：|取消：|取消＝|按「確定」)/, 'posConfirm 訊息不寫「確定＝／取消＝」，按鈕本身要說明後果');
  assert.doesNotMatch(ops, /posConfirm\([^)\n]*(確定：|取消：|取消＝|按「確定」)/);
});

test('posConfirm 行為：按主鍵 resolve true、取消 resolve false；訊息換行與動態內容都經 esc；關閉後移除遮罩', async () => {
  const src = ops.slice(ops.indexOf('function posConfirm('), ops.indexOf('// 覆蓋式原因選單'));
  const made = [];
  const el = () => {
    const node = { html: '', removed: false, parentNode: { removeChild() { node.removed = true; } }, btns: {} };
    Object.defineProperty(node, 'innerHTML', { set(v) { node.html = v; }, get() { return node.html; } });
    node.querySelector = sel => node.btns[sel] || (node.btns[sel] = { onclick: null });
    return node;
  };
  const ctx = { esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), document: { createElement: () => { const n = el(); made.push(n); return n; }, body: { appendChild() {} } }, Promise };
  vm.runInNewContext(src, ctx);
  let p = ctx.posConfirm('清桌 A1？\n第二行 <b>', { ok: '清桌', danger: true });
  let ov = made.at(-1);
  assert.match(ov.html, /class="pos-confirm-msg">清桌 A1？<br>第二行 &lt;b&gt;<\/p>/);
  assert.match(ov.html, /class="btn btn--solid btn--danger" data-ok>清桌</);
  assert.doesNotMatch(ov.html, /<h2>/, '沒 title 就不畫標題');
  ov.querySelector('[data-ok]').onclick(); assert.equal(await p, true); assert.equal(ov.removed, true);
  p = ctx.posConfirm('x', { title: '標題', cancel: '返回' }); ov = made.at(-1);
  assert.match(ov.html, /<h2>標題<\/h2>/); assert.match(ov.html, /data-cancel>返回</); assert.doesNotMatch(ov.html, /btn--danger/);
  ov.querySelector('[data-cancel]').onclick(); assert.equal(await p, false);
});

test('說明文字：用 .hint--tight／--end／--row 變體，不寫 style="margin…"；表單寬欄用 .f-grow', () => {
  assert.doesNotMatch(ops, /class="hint[^"]*" style=/, 'hint 不寫行內 style');
  assert.doesNotMatch(ops, /<label style="flex:1;min-width:200px">/);
  // 兩個 class 才壓得過宿主頁排在後面的 .hint{margin…}（同權重後者勝）；量測過單 class 版本 margin 仍是 0 0 12px
  assert.match(css, /\.hint\.hint--tight\{margin:0\}\.hint\.hint--end\{margin:0 0 0 auto;font-weight:400\}\.hint\.hint--row\{flex:1 1 100%;margin:0\}\.a-form \.f-grow\{flex:1;min-width:200px\}/);
  assert.match(ops, /<div class="qr-card"><img src="\$\{img\}" alt="桌號 \$\{esc\(t\.table\)\}"><small>掃碼點餐 · 言文字<\/small><\/div>/);
});

test('字級：pos-ops.css 與 pos.html 的 font-size 用 rem／em 尺度，不混 px', () => {
  for (const [name, src] of [['pos-ops.css', css], ['pos.html', html]]) {
    const px = [...src.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => m[0]);
    assert.deepEqual(px, [], `${name} 還有 px 字級：${px.join(', ')}`);
  }
  // 輸入框：同一種邊框色（--muted，與宿主 .a-form input 一致）與 8px 圓角
  assert.doesNotMatch(css, /input\{[^}]*border:1px solid var\(--line\);border-radius:10px/);
  assert.doesNotMatch(css, /textarea\{[^}]*border-radius:10px/);
  // 面板風格一致：pos-move-box 與 op-card 同底色、同圓角、同內距
  assert.match(css, /\.pos-move-box\{background:var\(--card\);border-radius:16px;padding:24px 20px;/);
  assert.match(css, /\.op-card\{max-width:480px;width:100%;background:var\(--card\);border-radius:16px;padding:24px 20px;/);
});
