// 子品牌獨立站（atcafe／3am／staysquare.emoji.tw）：網域分流與 CIS 規則（cis.emoji.tw/brands）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { renderSpace } = require('../lib/public-render.js');

const SITES = { 'at-cafe': ['atcafe.emoji.tw', '#984C37', 'CAFE'], '3am': ['3am.emoji.tw', '#6B8FAB', 'BAR'], 'stay-square': ['staysquare.emoji.tw', '#2B4064', null] };
const floors = /[一二三四五]樓|樓上|樓下|樓層|[1-5]F\b/;
const server = fs.readFileSync('server.js', 'utf8');

test('server 依 host 分流三個子品牌站，模板原檔不在官網直接提供', () => {
  for (const [slug, [host]] of Object.entries(SITES)) assert.match(server, new RegExp(`'${host.replace(/\./g, '\\.')}': '${slug}'`));
  assert.match(server, /path\.join\(PUB, 'brand-sites', slug \+ '\.html'\)/);
  assert.match(server, /publicRender\.renderSpace\(html, snapshot, 'zh', slug\)/);
  assert.match(server, /\^\\\/brand-sites\\\/\(at-cafe\|3am\|stay-square\)/);
});

for (const [slug, [host, color, venue]] of Object.entries(SITES)) {
  test(`${slug}：CIS 規則（品牌色、無母品牌黃、母品牌出現、不寫樓層、排序固定）`, () => {
    const html = fs.readFileSync(`public/brand-sites/${slug}.html`, 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="https://${host}/">`));
    assert.ok(html.includes(`content="${color}"`), 'theme-color 用品牌色');
    assert.ok(!/FFDE34/i.test(html), '黃屬母品牌');
    assert.ok(html.includes('言文字｜台灣人才聚落'), '母品牌至少出現一次');
    assert.ok(html.includes('/cis/assets/emoji-h.svg'));
    assert.doesNotMatch(html.replace(/<[^>]*>/g, ' '), floors);
    const row = html.slice(html.indexOf('class="bs-sisters"'));
    const order = ['at-cafe', '3am', 'stay-square'].map(s => row.indexOf(`brand-sites/assets/${s}-logo.webp`));
    assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], '在咖啡、三點水、等等空間');
    assert.ok(!/style="/.test(html));
    if (venue) assert.ok(html.includes(`<div data-menu="${venue}"></div>`));
  });
}

test('菜單由 renderSpace 伺服器端填入，只放該店品項', () => {
  const menu = JSON.stringify({ items: [
    { id: 'c1', venue: 'CAFE', cat: 'COFFEE', zh: '美式咖啡', price: 100, published: true },
    { id: 'b1', venue: 'BAR', cat: 'FOOD', zh: '深夜拉麵', price: 300, published: true },
  ] });
  const cafe = renderSpace(fs.readFileSync('public/brand-sites/at-cafe.html', 'utf8'), { content: { menu } }, 'zh', 'at-cafe');
  assert.ok(cafe.includes('美式咖啡') && !cafe.includes('深夜拉麵'));
  const bar = renderSpace(fs.readFileSync('public/brand-sites/3am.html', 'utf8'), { content: { menu } }, 'zh', '3am');
  assert.ok(bar.includes('深夜拉麵') && !bar.includes('美式咖啡'));
});
