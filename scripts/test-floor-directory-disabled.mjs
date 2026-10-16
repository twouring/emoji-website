import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const pub = new URL('../public/', import.meta.url);

function htmlFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const file=path.join(dir,entry.name);
    return entry.isDirectory() ? htmlFiles(file) : entry.name.endsWith('.html') ? [file] : [];
  });
}

test('public HTML does not load or mount the temporarily retired 3D floor directory', () => {
  for (const file of htmlFiles(pub.pathname)) {
    const html=fs.readFileSync(file,'utf8');
    assert.doesNotMatch(html, /<script\b[^>]*src=["'][^"']*space-dir\.js|new\s+(?:window\.)?SpaceDir\s*\(|id=["']space-dir-root["']|class=["'][^"']*space-dir__viz/i, file);
  }
});

test('all three locales preserve interior concept photos, facade, CMS photo slots and server-rendered menu slots', () => {
  for (const prefix of ['', 'en/', 'ja/']) {
    for (const page of ['space','at-cafe','3am','stay-square']) {
      const html=fs.readFileSync(new URL(prefix+page+'.html',pub),'utf8');
      assert.match(html, /<link rel="stylesheet" href="\/space-dir\.css">/);
      assert.match(html, /assets\/space\/(?:[1-4]f-concept|1f-night)\.jpg/);
      if (page==='space') { assert.match(html, /facade-current\.jpg/); assert.match(html, /<figure class="hero-media" id="media-hero">/); }
      // CMS 圖片／文案／菜單改由 lib/public-render.js 在伺服器端填入：頁面只留插槽，不再載 marked／DOMPurify／menu-lib 或抓 /api/public
      assert.match(html, /<figure class="space-brand__media" data-image="(?:[1-4]|bar)">/);
      assert.match(html, page==='stay-square' ? /<div class="md-content" data-md="[2-4]"><\/div>/ : /<div data-menu="(?:CAFE|BAR)"><\/div>/);
      assert.doesNotMatch(html, /fetch\('\/api\/public'\)|\/vendor\/marked\.js|\/vendor\/purify\.min\.js|\/menu-lib\.js/);
    }
    const home=fs.readFileSync(new URL(prefix+'index.html',pub),'utf8');
    assert.match(home,/1f-concept\.jpg/);
    assert.match(home,/1f-night\.jpg/);
    assert.match(home,/3f-concept\.jpg/);
  }
  assert.ok(fs.existsSync(new URL('space-dir.js',pub)), 'keep component source for restoration');
});
