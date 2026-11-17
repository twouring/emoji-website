/* 掃描槍／實體鍵盤（KK 11/17）：中文輸入法開著也要能掃、能打 PIN；pos-keys.js 改讀實體鍵位 e.code */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const keysSrc = read('pos-keys.js'), ops = read('pos-ops.js'), html = read('pos.html'), admin = read('admin.html');

function load(extra = {}) {
  const listeners = {};
  const win = { document: { activeElement: null, querySelector: () => null }, addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, ...extra };
  win.window = win;
  const ctx = vm.createContext({ window: win, Event: class { constructor(t) { this.type = t; } }, KeyboardEvent: class {}, Date });
  vm.runInContext(keysSrc, ctx);
  return { win, listeners };
}
const key = (code, o = {}) => ({ code, key: o.key ?? 'Process', keyCode: o.keyCode ?? 229, isComposing: o.isComposing ?? true, shiftKey: !!o.shift, getModifierState: s => s === 'CapsLock' && !!o.caps, preventDefault() { this.prevented = true; }, stopPropagation() {} });
// 注音輸入法下掃描槍送來的事件：key 是 Process／注音，code 才是真的鍵
const typeString = s => [...s].map(c => {
  if (/[a-z]/.test(c)) return key('Key' + c.toUpperCase());
  if (/[A-Z]/.test(c)) return key('Key' + c, { shift: true });
  if (/[0-9]/.test(c)) return key('Digit' + c);
  const m = { '-': ['Minus'], '_': ['Minus', 1], '.': ['Period'], '/': ['Slash'], '?': ['Slash', 1], '=': ['Equal'], '&': ['Digit7', 1], ':': ['Semicolon', 1], '+': ['Equal', 1] }[c];
  return key(m[0], { shift: !!m[1] });
});

test('posKeyChar 看鍵位不看輸入法：注音模式掃會員卡 token、網址、載具都還原成英數', () => {
  const { win } = load();
  const samples = ['eyJzdWIiOiJ1XzEyMyJ9.Ab-c_D9xYz0123456789abcd', 'https://app.emoji.tw/order?s=ts_ab12&k=Z-9_x', '/ABC+123', 'AB12345678901234'];
  for (const s of samples) assert.equal(typeString(s).map(e => win.posKeyChar(e)).join(''), s);
  assert.equal(win.posKeyChar(key('KeyA', { caps: true })), 'A');
  assert.equal(win.posKeyChar(key('KeyA', { caps: true, shift: true })), 'a');
  assert.equal(win.posKeyChar(key('Numpad7')), '7');
  assert.equal(win.posKeyChar(key('Enter')), '');
  assert.equal(win.posKeyChar({ code: '', key: 'x' }), 'x', '沒有 code 的舊裝置退回 key');
  assert.equal(win.posKeyChar({ code: '', key: 'ㄅ' }), '');
  assert.equal(win.posKeyChar({ code: 'KeyV', key: 'v', metaKey: true }), '', 'Cmd+V 貼上不攔');
});

test('posDigit：注音模式數字列（1＝ㄅ）照樣是數字；Shift+數字不是', () => {
  const { win } = load();
  assert.equal(win.posDigit({ code: 'Digit1', key: 'ㄅ' }), '1');
  assert.equal(win.posDigit({ code: 'Numpad0', key: '0' }), '0');
  assert.equal(win.posDigit({ code: 'Digit1', key: '!', shiftKey: true }), '');
  assert.equal(win.posDigit({ code: 'KeyA', key: 'a' }), '');
});

function fakeInput(max = 0) {
  const h = {};
  const inp = { value: '', maxLength: max, dataset: {}, selectionStart: 0, selectionEnd: 0, spellcheck: true, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
    addEventListener(t, f) { (h[t] ||= []).push(f); }, dispatchEvent(e) { (h[e.type] || []).forEach(f => f(e)); } };
  return { inp, fire: (t, e) => (h[t] || []).forEach(f => f(e)) };
}

test('posScanField：注音開著掃描，欄位只出現英數；輸入法事後塞進來的注音被還原', () => {
  const { win } = load();
  const { inp, fire } = fakeInput(64);
  win.posScanField(inp);
  assert.equal(inp.attrs.lang, 'en');
  assert.equal(inp.spellcheck, false);
  for (const e of typeString('/AB+12.Z')) { fire('keydown', e); assert.ok(e.prevented); }
  assert.equal(inp.value, '/AB+12.Z');
  inp.value = '/AB+12.Zㄅㄆ'; fire('input', { isComposing: true });   // 輸入法搶字
  assert.equal(inp.value, '/AB+12.Z');
  fire('keydown', key('Backspace'));
  assert.equal(inp.value, '/AB+12.');
});

test('posScanField：螢幕鍵盤選字（非實體鍵）只留英數；maxlength 照守', () => {
  const { win } = load();
  const a = fakeInput(); win.posScanField(a.inp);
  a.inp.value = 'A1中文b'; a.fire('compositionend', {});
  assert.equal(a.inp.value, 'A1b');
  const b = fakeInput(3); win.posScanField(b.inp);
  for (const e of typeString('12345')) b.fire('keydown', e);
  assert.equal(b.inp.value, '123');
});

test('posScanWedge：沒焦點時快速按鍵＋Enter＝一次掃描，人手慢慢打不算', async () => {
  const got = [];
  const { win, listeners } = load();
  win.posScanWedge(v => got.push(v));
  const down = listeners.keydown[0];
  let t = 1000; const realNow = Date.now; Date.now = () => t;
  try {
    for (const e of typeString('eyJhIjoxfQ.SIGNATURE_abcdefghijklmn')) { down(e); t += 8; }
    const ent = { code: 'Enter', key: 'Enter', preventDefault() { this.p = 1; }, stopPropagation() {} };
    down(ent);
    assert.deepEqual(got, ['eyJhIjoxfQ.SIGNATURE_abcdefghijklmn']);
    assert.ok(ent.p);
    for (const e of typeString('abcd')) { down(e); t += 400; }   // 人手
    down({ code: 'Enter', key: 'Enter', preventDefault() {}, stopPropagation() {} });
    assert.equal(got.length, 1);
    win.document.activeElement = { matches: () => true };   // 焦點在輸入框＝交給欄位自己處理
    for (const e of typeString('zzzzzz')) { down(e); t += 5; }
    down({ code: 'Enter', key: 'Enter', preventDefault() {}, stopPropagation() {} });
    assert.equal(got.length, 1);
  } finally { Date.now = realNow; }
});

test('接線：所有掃碼／英數輸入框都過 posScanField，PIN 鍵盤看鍵位，結帳頁接掃描槍', () => {
  assert.ok(html.indexOf('/pos-keys.js') > 0 && html.indexOf('/pos-keys.js') < html.indexOf('/pos-ops.js'));
  assert.ok(admin.indexOf('/pos-keys.js') > 0 && admin.indexOf('/pos-keys.js') < admin.indexOf('/pos-ops.js'));
  assert.match(html, /const d = posDigit\(ev\)/);
  assert.match(html, /posScanWedge\(posWedgeScan\)/);
  assert.equal((ops.match(/inp=posScanField\(ov\.querySelector\('input'\)\)/g) || []).length, 3, '手機載具、會員卡、桌號 QR 三個全螢幕掃碼');
  assert.match(ops, /posScanField\(ov\.querySelector\('#pos-carrier-input'\)\)/);
  assert.match(ops, /posScanField\(ov\.querySelector\('\[data-code\]'\)\)/, 'LINE Pay 付款碼');
  assert.match(ops, /\[name=carrier_num\],\.pos-invoice \[name=love_code\]'\)\.forEach\(i=>posScanField\(i\)\)/);
  assert.match(read('pos-invoice-scan.js'), /posScanField\(input\)/);
  assert.match(ops, /posPadKeys\(ov,/);
  assert.match(read('pos-settings.js'), /posPadKeys\(ov,/);
  assert.match(read('pos-space.js'), /async function spaceScan\(reload, scanned\)/);
});

test('posWedgeScan：點餐 QR 跳桌、會員卡帶入選中的桌、空間情境走掃碼進出', async () => {
  const fn = ops.slice(ops.indexOf('function posCardMember('), ops.indexOf('/* 掃碼結帳（KK 11/7）'));
  const calls = [];
  const ctx = vm.createContext({ TAB: 'pos', POS_TABLE: 'A1', POS_YAN: {}, POS_MEMBER: false, POS_DATA: { sessions: [{ id: 'ts_1', table: 'A1' }, { id: 'ts_2', table: 'B2' }] },
    document: { getElementById: () => ({ dataset: {} }) }, loadPos: async () => {}, paintPos: () => calls.push('paint'), toast: m => calls.push('toast:' + m),
    posSelectTable: t => { ctx.POS_TABLE = t; calls.push('select:' + t); }, tableFromScan: (v, ss) => ss.find(s => v.includes('s=' + s.id)) || { missing: true },
    api: async (p, o) => { calls.push('api:' + o.body.token); return { member: { id: 'u1', name: '徐愷' }, active: true, balance: 3 }; },
    opsThen: async (f, done, after) => { calls.push(done(await f())); after(); }, posApplyCarrier: () => '', posSpaceOn: () => false, spaceScan: (r, v) => calls.push('space:' + v) });
  vm.runInContext(fn, ctx);
  await ctx.posWedgeScan('https://app.emoji.tw/order?s=ts_2&k=x');
  assert.ok(calls.includes('select:B2'));
  const tok = 'eyJzdWIiOiJ1XzEyMyJ9.Ab-c_D9xYz0123456789abcd';
  await ctx.posWedgeScan(tok);
  assert.ok(calls.includes('api:' + tok));
  assert.equal(ctx.POS_YAN.id, 'u1');
  ctx.posSpaceOn = () => true; await ctx.posWedgeScan(tok);
  assert.ok(calls.includes('space:' + tok));
  await ctx.posWedgeScan('ㄅㄆ123');
  assert.ok(calls.some(c => c.startsWith('toast:掃到的不是')));
});
