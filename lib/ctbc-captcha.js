/* 中信 mPOS 商店管理平台登入驗證碼：60×30 JPEG、4 位數字、每位數字位置固定（四個欄位帶）。
 * 不引入 OCR 套件：在無頭瀏覽器把 <img> 畫到 canvas 取 RGBA，這裡切出四格、去雜點、裁邊縮成 10×14，
 * 與 ctbc-captcha.json 的十個數字平均模板比距離（模板由 160 張已標註樣本建立，交叉驗證 80/80 全對）。 */
'use strict';

const SLOTS = [[5, 18], [17, 29], [28, 41], [40, 53]];
const GW = 10, GH = 14, Y0 = 3, Y1 = 24;

function inkMask(rgba, w, h) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    m[i] = (mx - mn > 60 || mx < 110) ? 1 : 0;
  }
  return m;
}

/* 一格數字 → 長度 140 的 0..1 向量 */
function glyph(m, w, x0, x1) {
  const sw = x1 - x0, sh = Y1 - Y0;
  const at = (x, y) => (x < 0 || y < 0 || x >= sw || y >= sh) ? 0 : m[(Y0 + y) * w + x0 + x];
  const sub = new Uint8Array(sw * sh);
  let minX = sw, maxX = -1, minY = sh, maxY = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    if (!at(x, y)) continue;
    let nb = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy)) nb++;
    if (nb < 2) continue;   // 去掉孤立雜點
    sub[y * sw + x] = 1;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const out = new Array(GW * GH).fill(0);
  if (maxX < 0) return out;
  const bw = maxX - minX + 1, bh = maxY - minY + 1, S = 4;
  for (let ty = 0; ty < GH; ty++) for (let tx = 0; tx < GW; tx++) {
    let s = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const sx = Math.min(bw - 1, Math.floor((tx + (i + 0.5) / S) * bw / GW));
      const sy = Math.min(bh - 1, Math.floor((ty + (j + 0.5) / S) * bh / GH));
      s += sub[(minY + sy) * sw + minX + sx];
    }
    out[ty * GW + tx] = s / (S * S);
  }
  return out;
}

function glyphs(rgba, w, h) {
  const m = inkMask(rgba, w, h);
  return SLOTS.map(([a, b]) => glyph(m, w, a, b));
}

let TEMPLATES = null;
function templates() {
  if (!TEMPLATES) TEMPLATES = require('./ctbc-captcha.json');
  return TEMPLATES;
}

function classify(g, T = templates()) {
  let best = '', bestD = Infinity;
  for (const [d, t] of Object.entries(T)) {
    let s = 0;
    for (let i = 0; i < t.length; i++) { const x = t[i] - g[i]; s += x * x; }
    if (s < bestD) { bestD = s; best = d; }
  }
  return best;
}

/* rgba：Uint8ClampedArray／陣列（canvas getImageData 的 data） */
function solve(rgba, w = 60, h = 30, T) {
  return glyphs(rgba, w, h).map(g => classify(g, T)).join('');
}

function buildTemplates(samples) {
  const acc = {};
  for (const { label, rgba, w = 60, h = 30 } of samples) {
    glyphs(rgba, w, h).forEach((g, i) => { (acc[label[i]] ||= []).push(g); });
  }
  const T = {};
  for (const d of Object.keys(acc).sort()) {
    const list = acc[d];
    T[d] = list[0].map((_, k) => Math.round(list.reduce((a, g) => a + g[k], 0) / list.length * 1000) / 1000);
  }
  return T;
}

module.exports = { SLOTS, inkMask, glyph, glyphs, classify, solve, buildTemplates };
