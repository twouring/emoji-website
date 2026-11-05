// POS 相機掃碼解析度與辨識區（KK 11/6：手機載具要貼很近才掃得到）
// 1) getUserMedia 一定要帶 ideal 1920×1080：iOS Safari 沒指定就給 640×480，Code 39 要占畫面 45% 寬才解得出來
// 2) 用本站 zxing-wasm 實際解「同一張載具條碼占畫面不同比例」證明解析度差距
// 3) 全螢幕掃描只解黃框附近（scanRoi），座標從螢幕換回相機影格
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ops = fs.readFileSync(new URL('../public/pos-ops.js', import.meta.url), 'utf8');
const lookup = fs.readFileSync(new URL('../public/pos-invoice-scan.js', import.meta.url), 'utf8');

test('兩套掃描器開相機都要求 1080p（ideal，不支援自動降）＋後鏡頭', () => {
  assert.match(ops, /getUserMedia\(\{video:\{facingMode:\{ideal:'environment'\},width:\{ideal:1920\},height:\{ideal:1080\}\}\}\)/);
  assert.match(lookup, /getUserMedia\(\{ audio: false, video: \{ facingMode: \{ ideal: 'environment' \}, width: \{ ideal: 1920 \}, height: \{ ideal: 1080 \} \} \}\)/);
  assert.doesNotMatch(ops, /width:\{exact/, 'exact 會在不支援的裝置丟 OverconstrainedError，只能用 ideal');
  assert.match(ops, /focusMode:'continuous'/, '連續對焦，近距離拍手機螢幕不失焦');
  assert.match(ops, /const roi=scanRoi\(video,w,h\);/);
  assert.match(ops, /ctx\.drawImage\(video,roi\.x,roi\.y,roi\.w,roi\.h,0,0,roi\.w,roi\.h\)/, 'zxing 只解 ROI');
});

// 手機載具 Code 39（narrow 1／wide 3），畫在 W×H 灰階影格置中、寬度占 frac，加一次 3px 橫向模糊模擬拍手機螢幕
const CODE39 = { '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','*':'nwnnwnwnn' };
function frame(W, H, text, frac) {
  const m = []; for (const ch of '*' + text + '*') { for (const e of CODE39[ch]) m.push(e === 'w' ? 3 : 1); m.push(1); } m.pop();
  const total = m.reduce((a, b) => a + b, 0), bw = W * frac, px = bw / total, bh = Math.round(bw * 0.3), x0 = (W - bw) / 2, y0 = Math.round((H - bh) / 2);
  const g = new Float32Array(W * H).fill(235);
  let x = x0, bar = true;
  for (const w of m) {
    if (bar) for (let y = y0; y < y0 + bh; y++) for (let xx = Math.floor(x); xx < x + w * px; xx++) { const cov = Math.min(xx + 1, x + w * px) - Math.max(xx, x); if (cov > 0) g[y * W + xx] = g[y * W + xx] * (1 - cov) + 20 * cov; }
    x += w * px; bar = !bar;
  }
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    let s = 0, n = 0; for (let dx = -1; dx <= 1; dx++) { const X = xx + dx; if (X < 0 || X >= W) continue; s += g[y * W + X]; n++; }
    const v = Math.round(s / n), i = (y * W + xx) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: W, height: H, data };
}
function zxing() {
  const context = { console, WebAssembly, TextDecoder, TextEncoder, Uint8Array, Uint8ClampedArray, ArrayBuffer, URL, fetch, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../public/vendor/zxing-reader.js', import.meta.url), 'utf8'), context);
  context.ZXingWASM.prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(new URL('../public/vendor/zxing_reader.wasm', import.meta.url)) } });
  return img => context.ZXingWASM.readBarcodes(img, { formats: ['Code39Std'], textMode: 'Plain', maxNumberOfSymbols: 1 }).then(r => r[0]?.text || '');
}

test('真 zxing-wasm：載具條碼占畫面 28% 寬時 640×480 解不出、1080p 解得出（這就是「要貼很近」的原因）', async () => {
  const read = zxing();
  assert.equal(await read(frame(640, 480, '/ABC+123', 0.45)), '/ABC+123', '640×480 貼近（45%）可解');
  assert.equal(await read(frame(640, 480, '/ABC+123', 0.28)), '', '640×480 拉遠到 28% 就解不出');
  assert.equal(await read(frame(1280, 720, '/ABC+123', 0.28)), '/ABC+123');
  assert.equal(await read(frame(1920, 1080, '/ABC+123', 0.28)), '/ABC+123');
  assert.equal(await read(frame(1920, 1080, '/ABC+123', 0.18)), '/ABC+123', '1080p 拉遠到 18% 仍可解');
});

test('scanRoi：全螢幕 cover 影像把黃框座標換回影格；沒有框就解整張；框太小退回整張', () => {
  const src = ops.match(/function scanRoi\(video,w,h\)\{[\s\S]*?\n\}/)[0];
  const c = vm.createContext({});
  vm.runInContext(src + ';this.f=scanRoi;', c);
  // 影格 1920×1080、螢幕上 video 顯示 390×600（cover：s=600/1080≈0.5556，左右各裁 (1066.7-390)/2）
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
  const frame = { getBoundingClientRect: () => rect(39, 210, 312, 180) };
  const video = { parentElement: { querySelector: sel => sel === '.pos-scan-full-frame' ? frame : null }, getBoundingClientRect: () => rect(0, 0, 390, 600) };
  const roi = c.f(video, 1920, 1080);
  assert.ok(roi.x > 0 && roi.y > 0 && roi.x + roi.w <= 1920 && roi.y + roi.h <= 1080, JSON.stringify(roi));
  // 框 312×180 螢幕 px ＋ 左右各 30% 餘裕＝499×288 螢幕 px → 影格約 899×518
  assert.ok(roi.w >= 880 && roi.w <= 920, 'ROI 寬 ' + roi.w);
  assert.ok(roi.h >= 500 && roi.h <= 540, 'ROI 高 ' + roi.h);
  // 框在螢幕水平置中 → ROI 在影格也置中
  assert.ok(Math.abs((roi.x + roi.w / 2) - 960) < 4, 'ROI 水平中心 ' + (roi.x + roi.w / 2));
  // vm 另一個 context 的物件原型不同，strict deepEqual 會失敗，比 JSON
  const full = JSON.stringify({ x: 0, y: 0, w: 1920, h: 1080 });
  assert.equal(JSON.stringify(c.f({ parentElement: { querySelector: () => null }, getBoundingClientRect: () => rect(0, 0, 390, 600) }, 1920, 1080)), full, '沒有框＝整張');
  const tiny = { parentElement: { querySelector: () => ({ getBoundingClientRect: () => rect(190, 290, 10, 10) }) }, getBoundingClientRect: () => rect(0, 0, 390, 600) };
  assert.equal(JSON.stringify(c.f(tiny, 1920, 1080)), full, '框太小退回整張');
});
