import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = ['index','space','system','at-cafe','3am','stay-square','access','about','member','events','fellow/index','cis/index','startup/index'];
const floors = /(?:[一二三四五]樓|二、三樓|二三樓|樓層|閣樓|頂樓|樓上|[1-5]F\b|[1-5]階|屋上|屋根裏|上階|フロア|\b(?:floors?|rooftop|attic|upstairs|three-story|three-storey)\b)/i;
test('machine-readable public descriptions have no levels', () => {
  for (const file of ['public/llms.txt','public/llms-full.txt','public/feed.xml',...fs.readdirSync('public/ai').filter(f=>f.endsWith('.json')).map(f=>'public/ai/'+f)]) {
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),floors,file);
  }
});
test('consumption pages separate both dining brands from Stay Square fees',()=>{
  for(const locale of ['', 'en/', 'ja/']) {
    const html=fs.readFileSync(`public/${locale}system.html`,'utf8');
    for(const id of ['cafe','bar','membership','facilities','booking']) assert.ok(html.includes(`id="${id}"`));
    for(const price of ['NT$200','NT$500','NT$4,000','NT$10,000','NT$35,000','NT$20,000']) assert.ok(html.includes(price),`${locale}: ${price}`);
    assert.ok(html.indexOf('id="cafe"')<html.indexOf('id="membership"'));
    assert.ok(html.indexOf('id="bar"')<html.indexOf('id="membership"'));
  }
});
for (const locale of ['', 'en/', 'ja/']) {
  test(`${locale || 'zh/'} public pages describe brands, not levels`, () => {
    const violations = [];
    for (const page of pages) {
      const path = `public/${locale}${page}.html`;
      if (!fs.existsSync(path)) continue;
      const html = fs.readFileSync(path,'utf8').replace(/<!--[^]*?-->|<style\b[^]*?<\/style>|<script\b(?![^>]*application\/ld\+json)[^]*?<\/script>/gi,'');
      const copy = html.replace(/<[^>]*>/g, tag => [...tag.matchAll(/(?:alt|title|content|aria-label)="([^"]*)"/g)].map(m=>m[1]).join(' '));
      const match = copy.match(floors);
      if (match) violations.push(`${path}: ${match[0]}`);
    }
    assert.deepEqual(violations, []);
  });
}
