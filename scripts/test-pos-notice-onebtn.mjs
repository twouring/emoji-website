// 純提醒彈窗只留一顆「知道了」（KK 11/17：入場時間提醒兩顆都是「知道了」）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = f => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const ops = read('pos-ops.js'), space = read('pos-space.js');

test('提醒類 posConfirm 不得兩顆同字按鈕', () => {
  for (const src of [ops, space]) assert.doesNotMatch(src, /ok:\s*'知道了',\s*cancel:\s*'知道了'/);
  assert.match(space, /title: '入場時間提醒', ok: '知道了', cancel: null/);
  assert.match(ops, /title:'未送單提醒',ok:'知道了',cancel:null/);
});

test('cancel:null 只渲染確定鍵；預設仍有取消鍵', async () => {
  const body = { html: '', children: [] };
  const mk = () => {
    const ov = { className: '', parentNode: null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
      querySelector(sel) { const k = sel.slice(1, -1); return this._h.includes(k) ? (this[k] ||= {}) : null; } };
    return ov;
  };
  let last;
  const document = { createElement: () => (last = mk()), body: { appendChild(o) { o.parentNode = { removeChild() { o.parentNode = null; } }; } }, addEventListener() {}, removeEventListener() {} };
  const m = ops.match(/function posConfirm\([\s\S]*?\n\}\n/);
  const c = vm.createContext({ document, esc: String, Promise, String });
  vm.runInContext(m[0], c);
  const p1 = c.posConfirm('x', { title: 't', ok: '知道了', cancel: null });
  assert.equal(last.innerHTML.includes('data-cancel'), false);
  assert.equal((last.innerHTML.match(/知道了/g) || []).length, 1);
  last['data-ok'].onclick(); assert.equal(await p1, true);
  const p2 = c.posConfirm('y');
  assert.ok(last.innerHTML.includes('data-cancel>取消'));
  last['data-cancel'].onclick(); assert.equal(await p2, false);
  void body;
});
