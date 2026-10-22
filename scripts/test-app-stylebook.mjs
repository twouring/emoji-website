// 會員 App Stylebook（/stylebook/app/、docs/design/app-stylebook.md）與正式 App 保持同步
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const m = read('public/m.html'), ev = read('public/m-event.js'), book = read('public/stylebook/app/app.js');
const page = read('public/stylebook/app/index.html'), doc = read('docs/design/app-stylebook.md');

const appCss = [...m.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x => x[1]).join('\n');
const eventCss = ev.match(/const CSS=`([\s\S]*?)`;/)[1];
const classesIn = css => new Set([...css.replace(/@media[^{]*\{/g, '').replace(/\{[^{}]*\}/g, '{}').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(x => x[1]));
// docs §7 例外：版位容器、啟動畫面與待刪死碼
const EXEMPT = new Set(['ef', 'first', 'host-page', 'sp', 'ev', 'rw', 'serif']);
const has = (src, c) => new RegExp(`(?<![\\w-])${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(src);

test('App 定義的每個 class 都在 stylebook 有範例（新增元件要補 GROUPS）', () => {
  const missing = [...classesIn(appCss), ...classesIn(eventCss)].filter(c => !EXEMPT.has(c) && !has(book, c));
  assert.deepEqual([...new Set(missing)], [], '請在 public/stylebook/app/app.js 的 GROUPS 補範例，或在 docs §7 說明例外');
});

test('例外清單與文件一致，且例外 class 仍存在於 App（刪掉就從清單移除）', () => {
  for (const c of EXEMPT) {
    assert.match(doc, new RegExp('`' + c + '`'), 'docs §7 缺 ' + c);
    assert.ok(classesIn(appCss).has(c) || classesIn(eventCss).has(c), c + ' 已不在 App，請從 EXEMPT 與 docs 移除');
  }
});

test('stylebook 不自帶 App 樣式：一律從 /m.html 與 /m-event.js 即時載入', () => {
  assert.match(book, /fetch\(url, \{ cache: 'no-store' \}\)/);
  assert.match(book, /\['\/m\.html', '\/m'\]/);
  assert.match(book, /fetch\('\/m-event\.js'/);
  assert.doesNotMatch(page, /\.btn\{|\.tile\{|\.pass\{|:root\{/, 'index.html 只能有 sbk-* 文件版面樣式');
  assert.match(page, /<script src="\/stylebook\/app\/app\.js"><\/script>/);
});

test('App token 與文件表格一致', () => {
  const rootDecl = appCss.match(/:root\{([^}]*)\}/)[1];
  for (const [, k, v] of rootDecl.matchAll(/(--[\w-]+):([^;]+)/g)) {
    assert.match(doc, new RegExp('`' + k + '` \\| ' + v.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `docs §2 的 ${k} 應為 ${v}`);
  }
});

test('App 不新增色碼（新顏色先改 docs §2 再放進允許清單）', () => {
  const allowed = new Set(['#06c755', '#1b1a17', '#1a1a1a', '#34a853', '#3a362e', '#3e681a', '#4285f4', '#5a5448', '#715800', '#e4e0d6', '#ea4335', '#f4f1ea', '#fbbc05', '#fbfaf6', '#ffde34', '#eaf5dc', '#eef6df', '#fee9e5', '#fff4c8', '#b3261e', '#fff', '#000', '#111', '#222']);
  for (const [f, src] of [['public/m.html', m], ['public/m-event.js', ev], ['public/m-host.js', read('public/m-host.js')]]) {
    const extra = [...new Set([...src.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![0-9a-f])/gi)].map(x => x[0].toLowerCase()))].filter(h => !allowed.has(h));
    assert.deepEqual(extra, [], f);
  }
});

test('stylebook 頁面：noindex、字級不低於 1rem、指向開發文件', () => {
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(page + book, /font-size\s*:\s*(\.\d+rem|0\.\d+rem|\d{1,2}px)/i);
  assert.match(page, /docs\/design\/app-stylebook\.md/);
  assert.match(read('docs/design/stylebook.md'), /app-stylebook\.md/, '官網 stylebook 要指向 App stylebook');
});
