// Run: node scripts/check-stylebook.mjs [optional screenshot path]
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ headless: true, ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : { channel: 'chrome' }) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  // Verify fallback typography without relying on external font services.
  page.on('request', req => req.url().startsWith('http://127.0.0.1:') ? req.continue() : req.abort());
  const url = `http://127.0.0.1:${server.address().port}/stylebook/`;
  for (const width of [320, 390, 768, 1180, 1440]) {
    await page.setViewport({ width, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle0' });
    for (const fontSize of ['16px', '32px']) {
      await page.evaluate(size => { document.documentElement.style.fontSize = size; }, fontSize);
      const result = await page.evaluate(() => {
        const doc = document.documentElement;
        const controls = [...document.querySelectorAll('.ui-button')].filter(el => el.getClientRects().length);
        return {
          overflow: doc.scrollWidth - doc.clientWidth,
          small: controls.filter(el => el.getBoundingClientRect().height < 44 || el.getBoundingClientRect().width < 44).map(el => el.textContent),
          clipped: [...document.querySelectorAll('.ui-card,.ui-button,.ui-notice,.ui-code')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className),
          brokenImages: [...document.images].filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
        };
      });
      assert.ok(result.overflow <= 1, `${width}/${fontSize}: page overflow ${result.overflow}`);
      assert.deepEqual(result.small, [], `${width}/${fontSize}: small controls`);
      assert.deepEqual(result.clipped, [], `${width}/${fontSize}: clipped content`);
      assert.deepEqual(result.brokenImages, [], 'missing brand image');
    }
    console.log(`PASS ${width}px / 100% + 200% text / offline fonts`);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '16px'; });
  const source = await readFile(path.join(root, 'style.css'), 'utf8');
  const cis = await readFile(new URL('../../10_品牌與對外溝通/言文字CIS.html', import.meta.url), 'utf8').catch(() => null);
  // The website can also be checked outside the parent workspace.
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['ink','ink-soft','muted','paper','card','ink-surface','on-ink','on-ink-soft','accent','on-accent'].map(key => [key, style.getPropertyValue('--' + key).trim()]));
  });
  for (const [key, value] of Object.entries(colors)) {
    assert.ok(source.includes(`--${key}:${value}`), `token drift: ${key}`);
    if (cis) assert.ok(cis.includes(`--${key}:${value}`), `CIS drift: ${key}`);
  }
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const [foreground, background] of [['ink','paper'],['ink-soft','paper'],['muted','paper'],['muted','card'],['on-ink','ink-surface'],['on-ink-soft','ink-surface'],['on-accent','accent']]) {
    const values = [luminance(colors[foreground]), luminance(colors[background])].sort((a,b) => b-a);
    assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, `contrast: ${foreground}/${background}`);
  }
  await page.click('[data-notice]');
  assert.match(await page.$eval('#action-status', el => el.textContent), /已完成/);
  await page.click('#demo-form button[type=submit]');
  assert.equal(await page.$eval('#form-status', el => el.textContent), '尚未驗證。');
  await page.type('#name', '測試使用者');
  await page.type('#email', 'test@example.com');
  await page.click('#demo-form button[type=submit]');
  assert.match(await page.$eval('#form-status', el => el.textContent), /驗證完成/);
  await page.click('#demo-form button[type=reset]');
  assert.equal(await page.$eval('#name', el => el.value), '');
  await page.click('#open-dialog');
  assert.equal(await page.$eval('#demo-dialog', el => el.open), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.closest('dialog')?.id), 'demo-dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#demo-dialog', el => el.open), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'open-dialog');
  await page.click('#open-dialog');
  await page.$eval('#demo-dialog [value=confirm]', button => button.click());
  await page.waitForFunction(() => document.getElementById('action-status').textContent.includes('已確認'));
  assert.match(await page.$eval('#action-status', el => el.textContent), /已確認/);
  await page.focus('#patterns summary');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#patterns details', el => el.open), true);
  assert.equal(await page.$eval('#patterns summary', el => getComputedStyle(el).outlineStyle), 'solid');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  assert.equal(await page.$eval('.ui-button', el => getComputedStyle(el).transitionDuration), '0s');
  assert.deepEqual(errors, []);
  if (process.argv[2]) {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.screenshot({ path: process.argv[2], fullPage: true });
  }
  console.log('PASS tokens, contrast, states, native validation, reset, dialog focus/Escape, accordion keyboard, reduced motion');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
