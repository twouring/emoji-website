// 會員登入後自動跳 app.emoji.tw、並引導安裝 PWA
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const m = read('public/m.html');
const installKind = vm.runInNewContext(m.slice(m.indexOf('function installKind'), m.indexOf('/* install-end */')) + '\ninstallKind');
const base = { standalone: false, dismissedAt: 0, now: 1e12, hasPrompt: false, ios: false, inApp: false };

test('安裝引導：已安裝不顯示；7 天內按過「稍後」不顯示；之後再顯示', () => {
  assert.equal(installKind({ ...base, hasPrompt: true, standalone: true }), null);
  assert.equal(installKind({ ...base, hasPrompt: true, dismissedAt: 1e12 - 6 * 864e5 }), null);
  assert.equal(installKind({ ...base, hasPrompt: true, dismissedAt: 1e12 - 8 * 864e5 }), 'prompt');
});
test('安裝引導：Android／桌面用系統安裝視窗，iOS 教學，LINE 等內建瀏覽器要先換瀏覽器', () => {
  assert.equal(installKind({ ...base, hasPrompt: true }), 'prompt');
  assert.equal(installKind({ ...base, ios: true }), 'ios');
  assert.equal(installKind({ ...base, ios: true, inApp: true }), 'inapp');
  assert.equal(installKind({ ...base, hasPrompt: true, inApp: true }), 'inapp');
  assert.equal(installKind(base), null, '不支援也沒有安裝事件就不打擾');
});

function memberPage(page = 'public/member.html') {
  const h = read(page);
  return h.slice(h.indexOf('  const APP_URL'), h.indexOf('/* app-handoff-end */'));
}
async function go({ page, search = '', host = 'www.emoji.tw', lang = 'zh', data = { role: 'participant' }, reach = true, store = {} } = {}) {
  const calls = { replaced: null, fetched: 0 };
  const ctx = {
    LANG: lang, token: 'tok en/1', URLSearchParams, AbortController, setTimeout, clearTimeout, encodeURIComponent,
    location: { hostname: host, search, replace: u => { calls.replaced = u; } },
    sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    fetch: async () => { calls.fetched++; if (!reach) throw new Error('unreachable'); return {}; },
  };
  const out = await vm.runInNewContext(memberPage(page) + '\nmaybeGoApp(data)', { ...ctx, data });
  return { out, ...calls, store };
}

for (const page of ['public/member.html', 'public/en/member.html', 'public/ja/member.html']) {
  test(`${page}：中文網址才跳轉；en／ja 頁不跳`, async () => {
    const r = await go({ page, lang: page.includes('/en/') ? 'en' : page.includes('/ja/') ? 'ja' : 'zh' });
    assert.equal(r.out, page === 'public/member.html');
  });
}
test('登入後一般會員：探測到 app 可連線就帶 token 跳轉（token 走 fragment 並編碼）', async () => {
  const r = await go();
  assert.equal(r.out, true);
  assert.equal(r.replaced, 'https://app.emoji.tw/#token=tok%20en%2F1');
});
test('app 子站連不到（DNS／憑證未就緒）就留在網頁版，不把會員送進打不開的網站', async () => {
  const r = await go({ reach: false });
  assert.equal(r.out, false); assert.equal(r.replaced, null);
});
test('管理員、活動主辦、付款返回、?web=1 都不跳；?web=1 之後同一分頁也記住不跳', async () => {
  assert.equal((await go({ data: { role: 'admin' } })).out, false);
  assert.equal((await go({ data: { role: 'participant', organizer: true } })).out, false);
  assert.equal((await go({ search: '?plan_paid=1&s=cs_x' })).out, false);
  const store = {};
  const web = await go({ search: '?web=1', store });
  assert.equal(web.out, false); assert.equal(store.tth_web, '1');
  assert.equal((await go({ store })).out, false, '已選擇網頁版就不再跳');
});
test('本機與其他網域不跳轉', async () => {
  assert.equal((await go({ host: '127.0.0.1' })).out, false);
  assert.equal((await go({ host: 'app.emoji.tw' })).out, false);
});
test('app 的「完整會員專區」連結帶 web=1，避免來回跳；跳轉發生在 renderMember 之前', () => {
  assert.match(m, /\/member\?web=1/);
  for (const f of ['public/member.html', 'public/en/member.html', 'public/ja/member.html']) {
    const h = read(f);
    assert.ok(h.indexOf('await maybeGoApp(data)') > 0 && h.indexOf('await maybeGoApp(data)') < h.indexOf('      renderMember(data);\n    } catch'), f);
  }
});
test('app 子站收到 #token= 後存起並清掉網址（沿用既有行為）；service worker 版本已更新', () => {
  assert.match(m, /hash\.get\('token'\)/);
  assert.match(read('public/m-sw.js'), /VERSION = 'm-v([3-9]|\d{2,})'/);
});
