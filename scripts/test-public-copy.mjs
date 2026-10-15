import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
test('public venue names keep each existing booking code distinct',()=>{
  const {venueLabel,venuesOfLocation}=require('../lib/event-applications');
  for(const code of ['1F','2F','3F','4F']) {
    assert.doesNotMatch(venueLabel(code),/樓|[1-4]F/);
    assert.deepEqual(venuesOfLocation(venueLabel(code)),[code]);
  }
  assert.deepEqual(venuesOfLocation('閣樓休憩空間'),['4F']);
  assert.deepEqual(venuesOfLocation('三樓共享空間'),['3F']);
});
test('legacy CMS copy is projected without changing storage, IDs, menu or assets',()=>{
  const {publicContent, publicEventCopy, publicText}=require('../lib/public-copy');
  const raw={space_4f_zh:'頂樓洗衣，穿越三樓',space_2f_en:'Members-only floor',menu:'{"id":"1F","image":"/assets/space/1f-concept.jpg"}',space_4f_image:'/assets/space/4f-concept.jpg'};
  const out=publicContent(raw);
  assert.doesNotMatch(out.space_4f_zh,/樓/);
  assert.doesNotMatch(out.space_2f_en,/floor/);
  assert.equal(raw.space_4f_zh,'頂樓洗衣，穿越三樓');
  assert.equal(out.menu,raw.menu);assert.equal(out.space_4f_image,raw.space_4f_image);
  const ev={id:'3F',venue:'4F',slug:'3F-party',location:'三樓共享空間',description:'在二樓交誼廳交流',translations:{en:{location:'3F shared space'}},content_html:'<p>3F event</p><img src="/assets/space/3f-concept.jpg">'};
  const projected=publicEventCopy(ev);
  assert.equal(projected.id,'3F');assert.equal(projected.venue,'4F');assert.equal(projected.slug,'3F-party');
  assert.equal(projected.location,'等等空間共享活動區');assert.equal(ev.location,'三樓共享空間');
  assert.doesNotMatch(projected.translations.en.location,/3F/);
  assert.match(projected.content_html,/src="\/assets\/space\/3f-concept.jpg"/);
  assert.match(publicText('<img src="/assets/space/3f-concept.jpg" alt="三樓活動">'), /alt="等等空間活動"/);
  assert.doesNotMatch(publicText('二、三樓會員空間 / 2F and 3F / 2階・3階 / 屋上 / 屋根裏 / attic'),/樓|\dF|階|屋上|屋根裏|attic/);
});
test('public rich-content locales cannot restore legacy level copy',()=>{
  const {publicEventCopy}=require('../lib/public-copy');
  const event={id:'4F',rich_content:{zh:'<p>一樓白天是咖啡，入夜是酒；樓上是閱讀與工作。</p>',en:'<p>Coffee on the ground floor; upstairs for work.</p>',ja:'<p>1 階はコーヒー、上階は仕事。</p>'}};
  const original=JSON.stringify(event);
  const out=publicEventCopy(event);
  for(const html of Object.values(out.rich_content)) assert.doesNotMatch(html,/一樓|樓上|ground floor|upstairs|1\s*階|上階/i);
  assert.equal(JSON.stringify(event),original);
  assert.equal(out.id,'4F');
});
