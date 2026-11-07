// 在咖啡低消（KK 11/7）也要出現在會員 App 品牌頁
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const m = fs.readFileSync(new URL('../public/m.html', import.meta.url), 'utf8');
test('會員 App 在咖啡品牌頁顯示低消（數字取自 MenuLib）', () => {
  assert.equal((m.match(/bCafeRule:e=>/g) || []).length, 3, '中英日三語');
  assert.match(m, /b\.k==='cafe'&&window\.MenuLib&&MenuLib\.cafePolicyActive&&MenuLib\.cafePolicyActive\(\)\?T\.bCafeRule\(MenuLib\.CAFE_MIN_SPEND\)/);
});
