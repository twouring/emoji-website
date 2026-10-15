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

test('all three locales preserve interior concept photos, facade, CMS photos and menu loading', () => {
  for (const prefix of ['', 'en/', 'ja/']) {
    for (const page of ['space','at-cafe','3am','stay-square']) {
      const html=fs.readFileSync(new URL(prefix+page+'.html',pub),'utf8');
      assert.match(html, /<link rel="stylesheet" href="\/space-dir\.css">/);
      assert.match(html, /assets\/space\/(?:[1-4]f-concept|1f-night)\.jpg/);
      if (page==='space') assert.match(html, /facade-current\.jpg/);
      assert.match(html, /content\.space_hero_image/);
      assert.match(html, /space_' \+ f \+ 'f_image/);
      assert.match(html, /MenuLib\.renderMenuHtml/);
    }
    const home=fs.readFileSync(new URL(prefix+'index.html',pub),'utf8');
    assert.match(home,/1f-concept\.jpg/);
    assert.match(home,/1f-night\.jpg/);
    assert.match(home,/3f-concept\.jpg/);
  }
  assert.ok(fs.existsSync(new URL('space-dir.js',pub)), 'keep component source for restoration');
});
