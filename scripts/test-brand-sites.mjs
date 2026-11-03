// 子品牌獨立站（atcafe／3am／staysquare.emoji.tw）：網域分流、三語、CIS 規則（cis.emoji.tw/brands）
// 原則（KK 2026-11-03）：每站只介紹自己的品牌：不放姊妹品牌區塊、不互導其他子網域；母品牌只在頁尾法律行出現。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { renderSpace } = require('../lib/public-render.js');

const SITES = { 'at-cafe': ['atcafe.emoji.tw', '#984C37', 'CAFE'], '3am': ['3am.emoji.tw', '#6B8FAB', 'BAR'], 'stay-square': ['staysquare.emoji.tw', '#2B4064', null], 'rest-book': ['restbook.emoji.tw', '#5A4632', null] };
const LANGS = { zh: ['', 'zh-Hant', 'zh_TW'], en: ['en/', 'en', 'en_US'], ja: ['ja/', 'ja', 'ja_JP'] };
const floors = /[一二三四五]樓|樓上|樓下|樓層|[1-5]F\b|\bfloor\b|階/i;
const stay = /住宿|過夜|入住|旅館|床位|hotel|hostel|overnight|accommodation|宿泊|ホテル|ベッド/i;
const server = fs.readFileSync('server.js', 'utf8');
const text = html => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ');
const read = (lang, slug) => fs.readFileSync(`public/brand-sites/${LANGS[lang][0]}${slug}.html`, 'utf8');

test('server 依 host 分流三個子品牌站，三語路徑，模板原檔不在官網直接提供', () => {
  for (const [slug, [host]] of Object.entries(SITES)) assert.match(server, new RegExp(`'${host.replace(/\./g, '\\.')}': '${slug}'`));
  assert.match(server, /path\.join\(PUB, 'brand-sites', lang === 'zh' \? '' : lang, slug \+ '\.html'\)/);
  assert.match(server, /publicRender\.renderSpace\(html, snapshot, lang, slug\)/);
  assert.match(server, /\^\\\/brand-sites\\\/\(at-cafe\|3am\|stay-square\|rest-book\)/);
});

for (const [slug, [host, color, venue]] of Object.entries(SITES)) {
  for (const [lang, [, htmlLang, ogLocale]] of Object.entries(LANGS)) {
    const others = Object.entries(SITES).filter(([s]) => s !== slug).map(([, [h]]) => h);
    test(`${slug}/${lang}：三語、CIS 與單一品牌規則`, () => {
      const html = read(lang, slug);
      const body = text(html);
      const url = `https://${host}/${lang === 'zh' ? '' : lang}`;
      assert.ok(html.includes(`<html lang="${htmlLang}">`));
      assert.ok(html.includes(`<link rel="canonical" href="${url}">`), 'canonical');
      for (const [l, [, hl]] of Object.entries(LANGS)) assert.ok(html.includes(`hreflang="${hl}" href="https://${host}/${l === 'zh' ? '' : l}"`), 'hreflang ' + l);
      assert.ok(html.includes(`hreflang="x-default" href="https://${host}/"`));
      assert.ok(html.includes(`og:locale" content="${ogLocale}"`));
      assert.equal((html.match(/class="lang-switch bs-lang/g) || []).length, 2, '頁首與頁尾各一個語言切換');
      assert.ok(html.includes(`hreflang="${htmlLang}" lang="${htmlLang}" aria-current="page"`), '目前語系標 aria-current');
      assert.ok(html.includes(`content="${color}"`), 'theme-color 用品牌色');
      assert.ok(!/FFDE34/i.test(html), '黃屬母品牌');
      assert.ok(!html.includes('/cis/assets/emoji-h.svg'), '不放母品牌標誌');
      assert.ok(/言文字股份有限公司|emoji Co\., Ltd\./.test(body), '公司名稱');
      const parent = { zh: '言文字｜台灣人才聚落', en: 'emoji — Taiwan Talent Hub', ja: '言文字｜台湾タレントハブ' }[lang];
      assert.equal(body.split(parent).length - 1, 1, '母品牌名稱只在頁尾法律行出現一次');
      for (const h of others) assert.ok(!html.includes(h), `不連到其他子品牌 ${h}`);
      assert.ok(!html.includes('bs-sisters'), '沒有姊妹品牌區塊');
      assert.doesNotMatch(body, floors, '不寫樓層');
      assert.doesNotMatch(body.replace(/不提供住宿|not accommodation|宿泊施設ではありません|過夜或住宿|stay overnight|宿泊はできますか/g, ''), stay, '不寫住宿');
      if (slug === 'stay-square') assert.doesNotMatch(body, /淋浴|交誼廳|膠囊|休憩席|shower|capsule|social room|シャワー|カプセル|ソーシャルルーム|約書旅|Rest Book/i, '等等空間只含 3F 以上（KK 2026-11-04），不寫 2F／約書旅設施');
      assert.ok(!/style="/.test(html));
      if (venue) assert.ok(html.includes(`<div data-menu="${venue}"></div>`));
      if (slug === '3am') assert.ok(/未滿十八歲|under 18|18 歳未満/.test(body), '三點水必附飲酒警語');
      if (lang === 'en') {
        const han = body.replace(/在咖啡|三點水|等等空間|約書旅|言文字股份有限公司|統一編號|台北市中正區重慶南路一段 11 號|言文字 App|中文|日本語/g, '').match(/[\u4e00-\u9fff]{3,}/g) || [];
        assert.deepEqual(han, [], '英文頁殘留中文：' + han.join('、'));
      }
    });
  }
}

test('菜單由 renderSpace 伺服器端依語系填入，只放該店品項', () => {
  const menu = JSON.stringify({ items: [
    { id: 'c1', venue: 'CAFE', cat: 'COFFEE', zh: '美式咖啡', en: 'Americano', price: 100, published: true },
    { id: 'b1', venue: 'BAR', cat: 'FOOD', zh: '深夜拉麵', en: 'Late ramen', price: 300, published: true },
  ] });
  const cafe = renderSpace(read('zh', 'at-cafe'), { content: { menu } }, 'zh', 'at-cafe');
  assert.ok(cafe.includes('美式咖啡') && !cafe.includes('深夜拉麵'));
  const bar = renderSpace(read('en', '3am'), { content: { menu } }, 'en', '3am');
  assert.ok(bar.includes('Late ramen') && !bar.includes('Americano'));
});

test('在咖啡站：引用的實拍照與樣式檔都存在、三語同一組照片、圖片都有 alt 與尺寸', () => {
  const sets = Object.keys(LANGS).map(lang => {
    const html = read(lang, 'at-cafe');
    assert.ok(html.includes('href="/brand-sites/at-cafe.css"'));
    const imgs = html.match(/<img [^>]*>/g) || [];
    for (const tag of imgs) {
      assert.match(tag, /alt="/, 'img 缺 alt：' + tag.slice(0, 80));
      if (tag.includes('/atcafe/')) assert.match(tag, /width="\d+" height="\d+"/, 'img 缺尺寸：' + tag.slice(0, 80));
    }
    const refs = [...new Set((html.match(/\/brand-sites\/assets\/atcafe\/[\w-]+\.webp/g) || []))].sort();
    assert.ok(refs.length >= 10, '至少 10 張在咖啡照片');
    for (const r of refs) assert.ok(fs.existsSync('public' + r), '缺檔 ' + r);
    return refs.join();
  });
  assert.ok(sets.every(x => x === sets[0]), '三語引用同一組照片');
  assert.ok(fs.existsSync('public/brand-sites/at-cafe.css'));
});
