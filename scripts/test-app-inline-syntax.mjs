import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// 14120a6 合併時吃掉一個 }，會員 App 整頁無法啟動；鎖住所有內嵌腳本都能解析
for (const file of ['public/m.html', 'public/pos.html', 'public/admin.html']) {
  test(`${file} 內嵌腳本可解析`, () => {
    const html = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    const re = /<script(?![^>]*\bsrc=)(?![^>]*type="(?:application\/ld\+json|module)")[^>]*>([\s\S]*?)<\/script>/g;
    let m, n = 0;
    while ((m = re.exec(html))) { n++; assert.doesNotThrow(() => new vm.Script('(function(){' + m[1] + '\n})'), `${file} 第 ${n} 段`); }
    assert.ok(n > 0);
  });
}

test('會員 App：/api/state 的 badges 帶進 data（徽章區才有資料）', () => {
  const html = fs.readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');
  assert.match(html, /data=\{me:s\.me,badges:s\.badges\|\|\[\]/);
});
