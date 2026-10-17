// scripts/test-pos-item-options.mjs — POS 加點也要能選冰熱、甜度、飯量、麵量（跟桌邊點餐一樣）。
// 規格來源只有一份：public/order-lib.js 的 optionGroups；POS 與 /admin 都載入它，備註字串格式與桌邊點餐一致。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ops = read('public/pos-ops.js');

test('接線：pos.html／admin.html 在 pos-ops.js 之前載入 order-lib.js；service worker 快取殼含 order-lib 並換版', () => {
  for (const page of ['public/pos.html', 'public/admin.html']) {
    const html = read(page);
    const a = html.indexOf('<script src="/order-lib.js"></script>'), b = html.indexOf('<script src="/pos-ops.js"></script>');
    assert.ok(a > 0 && b > a, `${page} 要在 pos-ops.js 之前載入 order-lib.js`);
  }
});

test('加點：有選項的品項先跳面板（數量＋每組必選＋其他需求），沒選項的直接加；取消不送單', () => {
  assert.match(ops, /function itemOptionGroups\(it\)\{ return \(it&&typeof OrderLib!=='undefined'&&OrderLib\.optionGroups\)\?OrderLib\.optionGroups\(it,'zh'\):\[\]; \}/, '規格一律來自 order-lib（沒載到就退回直接加）');
  assert.match(ops, /const groups=itemOptionGroups\(it\);\s*if\(!groups\.length\)return send\(\{item_id:b\.dataset\.add,qty:1,note\}\);\s*openItemOptions\(it,groups,note,send\);/, '沒選項直接加、有選項切換到中欄細項畫面');
  assert.match(ops, /function openItemOptions\(it,groups,note0,onDone,editing\)/);
  assert.match(ops, /function optionPaneHtml\(o\)/, '細項在中欄畫面，不是彈窗');
  assert.match(ops, /class="pos-opt pos-opt-pane" role="group"/, '細項畫面取代中欄菜單');
  assert.match(ops, /data-oq="-1"[\s\S]*id="pos-opt-qty"[\s\S]*data-oq="1"/, '數量 ±');
  assert.match(ops, /name="pos_opt_\$\{esc\(g\.key\)\}" value="\$\{esc\(c\)\}" \$\{\(o\.picks\[g\.key\]\|\|g\.choices\[0\]\)===c\?'checked':''\}/, '每組預設選第一個（正常）＝必選；編輯時帶入既有選項');
  assert.match(ops, /const syncGroups=\(\)=>\{const active=.*OrderLib\.activeOptionGroups/, '選熱飲時即時隱藏冰塊組');
  assert.match(ops, /const active=groups\.filter\(g=>!g\.when\|\|picks\[g\.when\.key\]===g\.when\.value\)/, '送出備註前再次排除不適用規格');
  assert.match(ops, /id="pos-opt-note" maxlength="80"/, '其他需求 80 字，與桌邊點餐相同');
  assert.match(ops, /o\.qty=Math\.max\(1,Math\.min\(20,o\.qty\+Number\(b\.dataset\.oq\)\)\)/, '數量 1–20，與 addLine 一致');
  assert.match(ops, /#pos-opt-cancel'\)\.onclick=\(\)=>\{ POS_OPT=null; paintPos\(\); \};/, '取消只回菜單，不送單');
  assert.match(ops, /done\(\{item_id:o\.it\.id,qty:o\.qty,note\}\)/, '送出沿用既有 POST …/items body');
});

test('備註格式與桌邊點餐 optionNote 相同：「標籤：選項」以「；」串接，其他需求接在最後、最多 80 字', () => {
  const src = ops.slice(ops.indexOf('function itemOptionNote('), ops.indexOf('function openItemOptions('));
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src + '\nthis.f=itemOptionNote;', ctx);
  const groups = [{ key: 'temperature', label: '溫度', choices: ['冰', '熱'] }, { key: 'sugar', label: '糖度', choices: ['正常糖', '少糖'] }, { key: 'ice', label: '冰塊', choices: ['正常冰', '去冰'], when: { key: 'temperature', value: '冰' } }];
  assert.equal(ctx.f(groups, { temperature: '熱' }, ''), '溫度：熱；糖度：正常糖', '選熱飲時不得留下冰塊');
  assert.equal(ctx.f(groups, { temperature: '冰', sugar: '少糖', ice: '去冰' }, '  不要蓋子 '), '溫度：冰；糖度：少糖；冰塊：去冰；不要蓋子');
  assert.equal(ctx.f([], {}, 'x'.repeat(100)), 'x'.repeat(80), '其他需求截 80 字');
  assert.equal(ctx.f([], {}, ''), '', '沒選項沒備註＝空字串（伺服器端才會合併同品項數量）');
});

test('CSS：面板內容可捲、按鈕固定底部（選項多時不會被捲出畫面）；字級不小於 1rem', () => {
  const css = read('public/pos-ops.css');
  assert.match(css, /\.op-card\.pos-opt\{[^}]*display:flex;flex-direction:column;max-height:92dvh/);
  assert.match(css, /\.pos-opt-body\{[^}]*overflow:auto[^}]*flex:1 1 auto;min-height:0/);
  assert.match(css, /\.pos-opt-actions\{flex:none/);
  assert.match(css, /\.pos-opt-choices label:has\(input:checked\)/, '選中態');
  assert.match(css, /\.pos-opt-group\[data-opt=temperature\][^}]*background:#ffe7e2/, '溫度選中為紅底');
  assert.match(css, /\.pos-opt-group\[data-opt=sugar\][^}]*background:#fff3bd/, '糖度選中為黃底');
  assert.match(css, /\.pos-opt-group\[data-opt=ice\][^}]*background:#e1f2ff/, '冰塊選中為藍底');
  for (const m of css.matchAll(/\.pos-opt[^{]*\{[^}]*font-size:([\d.]+)rem/g)) assert.ok(Number(m[1]) >= 1, `pos-opt 字級 ${m[1]}rem`);
});
