// scripts/build-ctbc-captcha.mjs <樣本目錄> — 由已標註驗證碼（檔名 NNN_1234.img）重建 lib/ctbc-captcha.json，並做雙折交叉驗證。
// 用 Chrome 解 JPEG（與正式站一樣是 canvas 取 RGBA），避免解碼器差異。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');
const C = require('../lib/ctbc-captcha.js');

const dir = process.argv[2];
if (!dir) { console.error('用法：node scripts/build-ctbc-captcha.mjs <樣本目錄>'); process.exit(1); }
const files = fs.readdirSync(dir).filter(f => /^\d+_\d{4}\.img$/.test(f)).sort();
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
const samples = [];
for (const f of files) {
  const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
  const rgba = await page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return Array.from(x.getImageData(0, 0, c.width, c.height).data);
  }, 'data:image/jpeg;base64,' + b64);
  samples.push({ label: f.split('_')[1].slice(0, 4), rgba });
}
await browser.close();

const score = (train, test) => { const T = C.buildTemplates(train); return test.filter(s => C.solve(s.rgba, 60, 30, T) === s.label).length; };
const a = samples.filter((_, i) => i % 2 === 0), b = samples.filter((_, i) => i % 2 === 1);
console.log(`交叉驗證：${score(a, b)}/${b.length}、${score(b, a)}/${a.length}`);
const T = C.buildTemplates(samples);
fs.writeFileSync(new URL('../lib/ctbc-captcha.json', import.meta.url), JSON.stringify(T) + '\n');
console.log('寫入 lib/ctbc-captcha.json：', Object.keys(T).join(''), '自我驗證', samples.filter(s => C.solve(s.rgba, 60, 30, T) === s.label).length, '/', samples.length);
