// CIS 搬遷（KK 2026-11-04）：cis.emoji.tw 整站併入 www.emoji.tw/cis；子品牌 CIS 綁在各自網站的 /cis。
// 頁面由 tools/build-cis-brands.py 產生（public/{,en/,ja/}cis/brands/），素材只放一份在 public/cis/brands/assets。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const server = fs.readFileSync('server.js', 'utf8');
const HOSTS = { 'at-cafe': 'atcafe.emoji.tw', '3am': '3am.emoji.tw', 'stay-square': 'staysquare.emoji.tw', 'rest-book': 'restbook.emoji.tw' };
const SLUGS = Object.keys(HOSTS);
const LANGS = { '': 'zh-Hant', 'en/': 'en', 'ja/': 'ja' };
const url = (slug, pre) => HOSTS[slug] ? `https://${HOSTS[slug]}/${pre}cis` : `https://www.emoji.tw/${pre}cis/brands/${slug}/`;

test('server：子品牌網站 /cis 提供自己的 CIS；官網舊路徑 301 到子品牌網站', () => {
  assert.match(server, /path\.join\(PUB, cisM\[1\] \|\| '', 'cis', 'brands', slug, 'index\.html'\)/);
  assert.match(server, /`\$\{pre\}\/cis\/brands\/\$\{slug\}`/);
  assert.match(server, /res\.redirect\(301, `https:\/\/\$\{host\}\$\{pre\}\/cis`\)/);
  assert.match(server, /BRAND_HOST_OWN = [^\n]*cis\\\/\(assets\|brands\\\/assets\|logo\|moji\)/);
});

for (const [pre, lang] of Object.entries(LANGS)) {
  test(`${lang}：子品牌總覽與四個子品牌頁`, () => {
    const index = fs.readFileSync(`public/${pre}cis/brands/index.html`, 'utf8');
    assert.ok(index.includes(`<html lang="${lang}">`));
    assert.equal((index.match(/class="brand"/g) || []).length, 4);
    const order = ['at-cafe', '3am', 'stay-square', 'rest-book'].map(s => index.indexOf(`href="${url(s, pre)}"`));
    assert.ok(order.every(i => i > 0) && order.every((v, i) => !i || v > order[i - 1]), '順序：在咖啡、三點水、等等空間、約書旅');
    for (const slug of SLUGS) {
      const html = fs.readFileSync(`public/${pre}cis/brands/${slug}/index.html`, 'utf8');
      assert.ok(html.includes(`<link rel="canonical" href="${url(slug, pre)}">`), slug + ' canonical');
      for (const p of Object.keys(LANGS)) assert.ok(html.includes(`href="${url(slug, p)}"`), slug + ' hreflang ' + p);
      for (const other of SLUGS.filter(s => s !== slug)) assert.ok(!html.includes(`/${other}/`) && !(HOSTS[other] && html.includes(HOSTS[other])), `${slug} 不連到 ${other}`);
      assert.ok(!html.includes('cis.emoji.tw'), 'cis.emoji.tw 已停用');
      for (const m of html.matchAll(/(?:src|href)="(\/cis\/[^"#]+)"/g)) {
        assert.ok(fs.existsSync(path.join('public', decodeURIComponent(m[1]))), `${slug}：${m[1]} 不存在`);
      }
    }
  });
}

test('約書旅：霧苔綠、手冊與標誌包；日文名同中文', () => {
  const zh = fs.readFileSync('public/cis/brands/rest-book/index.html', 'utf8');
  const ja = fs.readFileSync('public/ja/cis/brands/rest-book/index.html', 'utf8');
  assert.ok(zh.includes('#687C70') && zh.includes('約書旅（Rest Book）'));
  assert.ok(ja.includes('<h1>約書旅<span class="latin">Rest Book</span></h1>'));
  const src = fs.readdirSync('public/cis/brands/assets/rest-book/source');
  assert.ok(src.some(f => f.endsWith('.pdf')) && src.some(f => f.endsWith('.zip')));
});

test('官網 CIS 主頁三語都列四個子品牌，子品牌卡連到各自網站的 /cis', () => {
  for (const pre of Object.keys(LANGS)) {
    const html = fs.readFileSync(`public/${pre}cis/index.html`, 'utf8');
    assert.ok(html.includes('cis-names--4'));
    for (const slug of SLUGS) assert.ok(html.includes(`href="${url(slug, pre)}"`), pre + slug);
    assert.ok(!html.includes('cis.emoji.tw/'), pre + ' 不再連 cis.emoji.tw');
  }
});
