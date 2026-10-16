import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { resolvePublicHtml, composeLayout, sendPage } = require('../lib/layout');
const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('public HTML resolution cannot read sibling directories', () => {
  assert.equal(resolvePublicHtml(path.join(root, 'public'), '/../views/partials/header-zh.html'), null);
  assert.equal(resolvePublicHtml(path.join(root, 'public'), '/startup/../../views/partials/header-en.html'), null);
  assert.ok(resolvePublicHtml(path.join(root, 'public'), '/en/startup').endsWith('en/startup/index.html'));
  const html = composeLayout('<!--SITE_HEADER-->', '/events/\"><img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&quot;&gt;&lt;img/);
});

test('production HTML is read once per file; development keeps live edits', () => {
  const env = process.env.NODE_ENV;
  const original = fs.readFileSync;
  const filename = path.join(root, 'public/about.html');
  let reads = 0;
  const res = { type() { return this; }, send(html) { assert.match(html, /site-nav/); } };
  fs.readFileSync = function (file, ...args) {
    if (file === filename) reads++;
    return original.call(this, file, ...args);
  };
  try {
    process.env.NODE_ENV = 'production';
    sendPage(res, filename, '/about');
    sendPage(res, filename, '/about');
    assert.equal(reads, 1);
    process.env.NODE_ENV = 'development';
    sendPage(res, filename, '/about');
    sendPage(res, filename, '/about');
    assert.equal(reads, 3);
  } finally {
    fs.readFileSync = original;
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
  }
});

function eventContext(lang = 'zh', storageBlocked = false) {
  const values = new Map([['tth_name', 'Old user']]);
  let cleanURL;
  const context = vm.createContext({
    URLSearchParams,
    location: { pathname: (lang === 'zh' ? '' : '/' + lang) + '/events/demo', hash: '#token=test-token', search: '?paid=1&s=test-session' },
    history: { replaceState(_a, _b, url) { cleanURL = url; } },
    localStorage: {
      setItem(k, v) { if (storageBlocked) throw new Error('blocked'); values.set(k, v); },
      getItem(k) { return values.get(k); },
      removeItem(k) { values.delete(k); },
    },
    document: { body:{dataset:{}}, getElementById() { return {}; }, querySelectorAll() { return []; } },
  });
  const code = [...read('public/events.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(code.replace(/main\(\);\s*$/, ''), context);
  return { context, values, cleanURL };
}

test('event OAuth callback works in all locales and preserves payment verification query', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const { context, values, cleanURL } = eventContext(lang);
    assert.equal(values.get('tth_token'), 'test-token');
    assert.equal(values.has('tth_name'), false);
    assert.match(cleanURL, /\?paid=1&s=test-session$/);
    assert.doesNotMatch(cleanURL, /token=/);
    assert.match(vm.runInContext("actionFor({ status: '報名中', capacity: 0 })", context), /id="ev-register"/);
    for (const status of ['已結束', '草稿']) {
      assert.match(vm.runInContext(`actionFor({ status: ${JSON.stringify(status)}, capacity: 0 })`, context), /disabled/);
    }
    assert.match(vm.runInContext("actionFor({ status: '已結束', registered: true })", context), /id="ev-ticket"/);
  }
  assert.match(vm.runInContext("actionFor({ status: '報名中', capacity: 0 })", eventContext('zh', true).context), /id="ev-register"/);
});

test('space markdown passes parsed HTML to the sanitizer and fails closed without it', () => {
  const raw = '<img src=x onerror=alert(1)>';
  const md = {};
  const window = {
    marked: { parse(value) { assert.equal(value, raw); return raw; } },
    DOMPurify: { sanitize(value, options) { assert.equal(value, raw); assert.equal(options.USE_PROFILES.html, true); return '<img src="x">'; } },
  };
  vm.runInNewContext(read('public/space-dir.js'), { window });
  const dir = Object.create(window.SpaceDir.prototype);
  Object.assign(dir, { t: { names: { 1: '1F' } }, lang: 'zh', content: { space_1f_zh: raw }, panel: {
    querySelector(selector) { return selector === '[data-panel-md]' ? md : null; }, setAttribute() {},
  } });
  dir._paintPanel(1);
  assert.equal(md.innerHTML, '<img src="x">');
  delete window.DOMPurify;
  dir._paintPanel(1);
  assert.equal(md.textContent, raw);
  for (const file of ['space.html', 'en/space.html', 'ja/space.html']) {
    const html = read('public/' + file);
    assert.doesNotMatch(html, /<script[^>]*src="https:\/\//);
    // 空間文案改在伺服器端 marked → sanitize-html（lib/public-render.js）；頁面不再載瀏覽器端 marked／DOMPurify
    assert.doesNotMatch(html, /\/vendor\/marked\.js|\/vendor\/purify\.min\.js|function fillMd\(/);
    assert.doesNotMatch(html, /<script[^>]*src="\/space-dir\.js"/);
  }
});

test('opening the same space hash twice does not collapse its floor', () => {
  const context = { window: {}, location: { hash: '#menu' } };
  vm.runInNewContext(read('public/space-dir.js'), context);
  const dir = Object.create(context.window.SpaceDir.prototype);
  const selections = [];
  dir.active = null;
  dir.select = floor => { selections.push(floor); dir.active = floor; };
  dir.openFromHash();
  dir.openFromHash();
  context.location.hash = '';
  dir.openFromHash();
  assert.deepEqual(selections, [1, null]);
});

test('closing mobile navigation resets dropdown state and returns Escape focus', () => {
  function element() {
    const classes = new Set();
    return {
      dataset: {}, listeners: {}, attrs: {},
      classList: { add(v) { classes.add(v); }, remove(v) { classes.delete(v); }, contains(v) { return classes.has(v); }, toggle(v, on) { if (on) classes.add(v); else classes.delete(v); } },
      setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.listeners[k] = fn; }, focus() { this.focused = true; },
    };
  }
  const toggle = element(), links = element(), dropdown = element(), button = element();
  dropdown.querySelector = () => button;
  button.closest = () => dropdown;
  button.tagName = 'BUTTON';
  const document = {
    listeners: {},
    getElementById(id) { return ({ navToggle: toggle, navLinks: links })[id] || null; },
    querySelectorAll(selector) { return selector === '.site-nav__dd-top' ? [button] : dropdown.classList.contains('open') ? [dropdown] : []; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
  };
  vm.runInNewContext(read('public/nav.js'), { document, window: { matchMedia: () => ({ matches: true }) } });
  toggle.listeners.click();
  button.listeners.click({ preventDefault() {} });
  assert.equal(button.attrs['aria-expanded'], 'true');
  document.listeners.keydown({ key: 'Escape' });
  assert.equal(button.attrs['aria-expanded'], 'false');
  assert.equal(toggle.attrs['aria-expanded'], 'false');
  assert.equal(toggle.focused, true);
});

test('CIS copy reports success only after writing; denial or missing API offers manual HEX copy', async () => {
  for (const prefix of ['', 'en/', 'ja/']) {
    const html = read('public/' + prefix + 'cis/index.html');
    const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
    for (const mode of ['success', 'denied', 'missing']) {
      const classes = new Set(['is-copied']);
      const writes = [], prompts = [], timers = [];
      let click;
      const button = {
        getAttribute: () => '#1B1A17',
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
        addEventListener(_name, handler) { click = handler; },
      };
      vm.runInNewContext(code, {
        document: { querySelectorAll: selector => selector === '.cis-swatch' ? [button] : [] },
        IntersectionObserver: class { observe() {} },
        navigator: mode === 'missing' ? {} : { clipboard: { async writeText(value) {
          if (mode === 'denied') throw new Error('NotAllowedError');
          writes.push(value);
        } } },
        window: { prompt: (message, value) => prompts.push({ message, value }) },
        setTimeout: fn => timers.push(fn),
      });
      const result = click();
      assert.equal(classes.has('is-copied'), false, 'clear stale success before awaiting clipboard');
      await result;
      assert.equal(classes.has('is-copied'), mode === 'success', prefix + mode);
      assert.deepEqual(writes, mode === 'success' ? ['#1B1A17'] : []);
      assert.equal(prompts.length, mode === 'success' ? 0 : 1);
      if (prompts.length) {
        assert.equal(prompts[0].value, '#1B1A17');
        assert.match(prompts[0].message, /手動|manually/);
      }
      for (const timer of timers) timer();
      assert.equal(classes.has('is-copied'), false);
    }
  }
});
