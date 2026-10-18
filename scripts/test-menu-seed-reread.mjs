import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('async function seedMenuContent()'), src.indexOf('let rows;', src.indexOf('async function seedMenuContent()')));
test('seedMenuContent：每段一次性回填都重新讀菜單，不用啟動時的舊 content.menu（否則後一段會把前一段的結果蓋回去）', () => {
  const stale = body.split('\n').filter(l => /JSON\.parse\(content\.menu\)/.test(l));
  // 只有第一段（兌換點數）可以用啟動時讀到的內容；其餘都要 readContent()
  assert.ok(stale.length <= 1, '舊 content.menu 只能第一段用，其餘要重新讀：\n' + stale.join('\n'));
  assert.match(body, /menu_combo_open_v2/);
});
