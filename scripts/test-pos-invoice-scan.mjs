import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const sourcePath = new URL('../public/pos-invoice-scan.js', import.meta.url);
function load(extra = {}) {
  const context = { window: {}, ...extra };
  vm.createContext(context);
  if (fs.existsSync(sourcePath)) vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context);
  return context.window.PosInvoiceScan;
}

test('Taiwan Code39 strips only its exact period and random-number envelope', () => {
  const { parse } = load();
  assert.equal(parse('115AB123456781234'), 'AB12345678');
  assert.equal(parse('115AB123456781234EXTRA'), null);
  assert.equal(parse('prefixAB12345678suffix'), null);
});

const leftQr = 'AB123456781151016123400000064000000640000000012345678abcdefghijklmnopqrstuv==:**********:1:1:1:商品:1:100';
test('left QR validates the fixed header instead of matching an arbitrary invoice prefix', () => {
  const { parse } = load();
  assert.equal(parse(leftQr), 'AB12345678');
  for (const raw of [null, 123, '', 'ab12345678', 'AB12345678junk', 'XAB12345678', leftQr.replace('1151016', '1151316'), leftQr.replace('00000064', 'zzzzzzzz'), 'https://example.com/AB12345678']) {
    assert.equal(parse(raw), null, String(raw));
  }
});

function uiEnvironment(extra = {}) {
  const nodes = [];
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.style = {}; this.value = ''; nodes.push(this); }
    append(...children) { this.children.push(...children); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    removeEventListener(type) { delete this.listeners[type]; }
    remove() { this.removed = true; }
    focus() { this.focused = true; }
    select() {}
    async play() {}
    getContext() { return { drawImage() {}, getImageData() { return { frame: true }; } }; }
  }
  const document = new Element('document');
  document.body = new Element('body');
  document.activeElement = new Element('previous');
  document.createElement = tag => new Element(tag);
  const api = load({ document, navigator: {}, ...extra });
  return { api, nodes, document, find: tag => nodes.find(n => n.tagName === tag) };
}

test('unsupported camera keeps focused hardware input; Enter accepts valid invoice once and closes', async () => {
  const env = uiEnvironment();
  assert.equal(typeof env.api.open, 'function');
  const scanned = [], closed = [];
  const controller = await env.api.open({ onScan: value => scanned.push(value), onClose: () => closed.push(true) });
  const input = env.find('input');
  assert.equal(input.focused, true);
  assert.match(env.nodes.find(n => n.role === 'status').textContent, /不支援.*掃描槍/);
  input.value = 'not an invoice';
  env.find('form').listeners.submit({ preventDefault() {} });
  assert.equal(scanned.length, 0);
  input.value = 'AB12345678';
  env.find('form').listeners.submit({ preventDefault() {} });
  controller.close();
  assert.deepEqual(scanned, ['AB12345678']);
  assert.equal(closed.length, 1);
  assert.equal(env.nodes.find(n => n.role === 'dialog').removed, true);
});

test('native camera decodes valid invoice, ignores other barcodes, stops all tracks before callback', async () => {
  let stopped = 0, tick, options, calls = 0;
  const env = uiEnvironment({
    window: { BarcodeDetector: class {
      constructor(value) { options = value; }
      async detect() { return ++calls === 1 ? [{ rawValue: 'garbage' }] : [{ rawValue: '115AB123456781234' }]; }
    } },
    navigator: { mediaDevices: { async getUserMedia(constraints) {
      assert.equal(constraints.video.facingMode.ideal, 'environment');
      return { getTracks: () => [{ stop() { stopped++; } }, { stop() { stopped++; } }] };
    } } },
    setTimeout(fn) { tick = fn; return 1; }, clearTimeout() { tick = null; }
  });
  const scanned = [];
  const controller = await env.api.open({ onScan: number => { assert.equal(stopped, 2); scanned.push(number); } });
  await controller.ready;
  assert.deepEqual(Array.from(options.formats), ['code_39', 'qr_code']);
  assert.equal(env.find('video').playsinline, '');
  await tick();
  assert.deepEqual(scanned, []);
  await tick();
  assert.deepEqual(scanned, ['AB12345678']);
  assert.equal(env.find('video').srcObject, null);
  assert.equal(tick, null);
});

test('Safari uses existing same-origin ZXing WASM with standard Code39 and QR', async () => {
  let prepared, readOptions, stopped = false, tick;
  const env = uiEnvironment({
    window: { ZXingWASM: {
      prepareZXingModule(options) { prepared = options; },
      async readBarcodes(image, options) { readOptions = options; assert.equal(image.frame, true); return [{ text: leftQr }]; }
    } },
    navigator: { mediaDevices: { async getUserMedia() { return { getTracks: () => [{ stop() { stopped = true; } }] }; } } },
    setTimeout(fn) { tick = fn; return 1; }, clearTimeout() {}
  });
  const scanned = [];
  const controller = await env.api.open({ onScan: value => scanned.push(value) });
  await controller.ready;
  assert.ok(prepared, 'existing ZXing must be prepared');
  assert.equal(prepared.overrides.locateFile('reader.wasm', 'https://cdn.invalid/'), '/vendor/zxing_reader.wasm');
  env.find('video').videoWidth = 640;
  env.find('video').videoHeight = 480;
  await tick();
  assert.deepEqual(Array.from(readOptions.formats), ['Code39Std', 'QRCode']);
  assert.equal(stopped, true);
  assert.deepEqual(scanned, ['AB12345678']);
});

test('19-character invoice Code39 with ROC year-month period is accepted', () => {
  const { parse } = load();
  assert.equal(parse('11510AB123456781234'), 'AB12345678');
  assert.equal(parse('1151AB123456781234'), null);
  assert.equal(parse('AB12345678\nGARBAGE'), null);
});

test('Escape and global close clean up dialogs and allow safe navigation', async () => {
  const env = uiEnvironment();
  let closed = 0;
  await env.api.open({ onClose: () => closed++ });
  assert.equal(typeof env.api.close, 'function');
  env.document.listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, 1);
  await env.api.open({ onClose: () => closed++ });
  env.api.close();
  env.api.close();
  assert.equal(closed, 2);
  assert.equal(env.document.listeners.keydown, undefined);
});

test('camera permission denial remains recoverable with hardware scanner', async () => {
  const env = uiEnvironment({
    window: { BarcodeDetector: class {} },
    navigator: { mediaDevices: { async getUserMedia() { throw new Error('Permission denied'); } } }
  });
  const controller = await env.api.open();
  await controller.ready;
  assert.match(env.nodes.find(n => n.role === 'status').textContent, /權限.*掃描槍/);
  assert.equal(env.find('input').focused, true);
  controller.close();
});

test('camera granted after dialog closes is immediately stopped', async () => {
  let grant, stopped = 0;
  const env = uiEnvironment({
    window: { BarcodeDetector: class {} },
    navigator: { mediaDevices: { getUserMedia() { return new Promise(resolve => { grant = resolve; }); } } }
  });
  const controller = await env.api.open();
  controller.close();
  grant({ getTracks: () => [{ stop() { stopped++; } }] });
  await controller.ready;
  assert.equal(stopped, 1);
  assert.equal(env.find('video').srcObject, null);
});

test('bundled real ZXing WASM decodes invoice QR image without any external library', async () => {
  const QRCode = createRequire(import.meta.url)('../public/vendor/qrcode.min.js');
  const modules = QRCode.create(leftQr, { errorCorrectionLevel: 'M' }).modules;
  const scale = 5, quiet = 4, width = (modules.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (!modules.get(y, x)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = (((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 0;
    }
  }
  const context = { console, WebAssembly, TextDecoder, TextEncoder, Uint8Array, Uint8ClampedArray, ArrayBuffer, URL, fetch, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../public/vendor/zxing-reader.js', import.meta.url), 'utf8'), context);
  context.ZXingWASM.prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(new URL('../public/vendor/zxing_reader.wasm', import.meta.url)) } });
  const results = await context.ZXingWASM.readBarcodes({ width, height: width, data }, { formats: ['Code39Std', 'QRCode'], textMode: 'Plain' });
  assert.equal(results[0]?.text, leftQr);
  assert.equal(load().parse(results[0].text), 'AB12345678');
});

test('plain invoice number is returned exactly, allowing scanner line endings', () => {
  const api = load();
  assert.equal(typeof api?.parse, 'function', 'PosInvoiceScan.parse must exist');
  assert.equal(api.parse('AB12345678'), 'AB12345678');
  assert.equal(api.parse(' AB12345678\r\n'), 'AB12345678');
});
