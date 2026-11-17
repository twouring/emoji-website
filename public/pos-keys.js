/* 實體鍵盤／掃描槍（KK 11/17）
   iPad 開著中文（注音）輸入法時，掃描槍（HID 鍵盤）送來的按鍵會被組成注音／中文字，會員卡 QR、載具、點餐網址全壞；
   注音的數字列也不是數字（1＝ㄅ），PIN 鍵盤用 e.key 判斷會收不到。網頁不能切換系統輸入法，
   所以一律改讀實體鍵位 e.code（不受輸入法影響），自己組成英數字串＝效果等同「掃描時自動切英文」。
   - posKeyChar(e)：e.code＋Shift／CapsLock → 美式鍵盤字元；不是可列印鍵回 ''
   - posDigit(e)：PIN 鍵盤用，數字列與數字鍵盤都認
   - posScanField(input)：掃碼／英數欄位接管實體鍵盤，輸入法開著也只會輸入英數；螢幕鍵盤或貼上的內容只留英數符號
   - posScanWedge(onScan)：沒有焦點在輸入框時，連續快速按鍵＋Enter＝一次掃描；全螢幕掃碼視窗開著就填進視窗並送出，
     其他時候交給 onScan(字串)（結帳頁：點餐 QR 跳桌、會員卡帶入會員、空間情境掃碼進出） */
(function (g) {
  const SHIFT = { Digit1: '!', Digit2: '@', Digit3: '#', Digit4: '$', Digit5: '%', Digit6: '^', Digit7: '&', Digit8: '*', Digit9: '(', Digit0: ')',
    Minus: '_', Equal: '+', BracketLeft: '{', BracketRight: '}', Backslash: '|', Semicolon: ':', Quote: '"', Comma: '<', Period: '>', Slash: '?', Backquote: '~' };
  const PLAIN = { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', Space: ' ',
    NumpadDecimal: '.', NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/' };
  function posKeyChar(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey) return '';
    const code = e.code || '', shift = !!e.shiftKey;
    let m = /^Key([A-Z])$/.exec(code);
    if (m) { const caps = !!(e.getModifierState && e.getModifierState('CapsLock')); return shift !== caps ? m[1] : m[1].toLowerCase(); }
    m = /^Digit([0-9])$/.exec(code);
    if (m) return shift ? SHIFT[code] : m[1];
    m = /^Numpad([0-9])$/.exec(code);
    if (m) return m[1];
    if (shift && SHIFT[code]) return SHIFT[code];
    if (PLAIN[code] !== undefined) return PLAIN[code];
    // 沒有 code（部分藍牙掃描槍／舊瀏覽器）：只收單一可列印 ASCII
    if (!code && typeof e.key === 'string' && /^[\x20-\x7e]$/.test(e.key)) return e.key;
    return '';
  }
  function posDigit(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey) return '';
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
    if (m && !(e.shiftKey && /^Digit/.test(e.code))) return m[1];
    return !e.code && /^[0-9]$/.test(e.key || '') ? e.key : '';
  }
  const ASCII = v => String(v || '').replace(/[^\x20-\x7e]/g, '');
  function posScanField(inp) {
    if (!inp || inp.dataset.scanField) return inp;
    inp.dataset.scanField = '1';
    inp.setAttribute('lang', 'en'); inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('autocomplete', 'off'); inp.spellcheck = false;
    let buf = inp.value, at = 0;
    const put = (v, caret) => { buf = v; inp.value = v; try { inp.setSelectionRange(caret, caret); } catch (_) {} };
    inp.addEventListener('keydown', e => {
      const ime = e.isComposing || e.keyCode === 229;
      if (!ime) buf = inp.value;   // 相機掃到、程式改值後以畫面為準
      const s = Math.min(inp.selectionStart ?? buf.length, buf.length), t = Math.min(inp.selectionEnd ?? s, buf.length);
      if (e.code === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); at = Date.now();
        if (s !== t) put(buf.slice(0, s) + buf.slice(t), s); else if (s > 0) put(buf.slice(0, s - 1) + buf.slice(s), s - 1);
        return;
      }
      const c = posKeyChar(e); if (!c) return;
      e.preventDefault(); at = Date.now();
      const max = inp.maxLength > 0 ? inp.maxLength : Infinity;
      if (buf.length - (t - s) + 1 > max) return;
      put(buf.slice(0, s) + c + buf.slice(t), s + 1);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);
    const settle = e => {
      if (Date.now() - at < 400) { if (inp.value !== buf) put(buf, buf.length); return; }   // 輸入法搶到的字：還原成鍵位組出的英數
      if (e && e.isComposing) return;                                                       // 螢幕鍵盤選字中，等選完
      const v = ASCII(inp.value); if (v !== inp.value) put(v, v.length); else buf = v;
    };
    inp.addEventListener('input', settle);
    inp.addEventListener('compositionend', () => settle());
    return inp;
  }
  const EDITABLE = 'input,textarea,select,[contenteditable=""],[contenteditable="true"]';
  function posScanWedge(onScan, { gap = 120, avg = 60, min = 4 } = {}) {
    if (g.__posScanWedge) return; g.__posScanWedge = 1;
    let buf = '', first = 0, last = 0;
    const reset = () => { buf = ''; first = last = 0; };
    g.addEventListener('keydown', e => {
      const a = g.document.activeElement;
      if (a && a.matches && a.matches(EDITABLE)) return reset();
      const now = Date.now();
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter') {
        const fast = buf.length >= min && now - last < gap && (last - first) / Math.max(1, buf.length - 1) < avg;
        const v = buf; reset();
        if (!fast) return;
        const full = g.document.querySelector('.pos-scan-full');
        if (full) { const inp = full.querySelector('input'), ok = full.querySelector('[data-ok]'); if (inp && ok) { e.preventDefault(); e.stopPropagation(); inp.value = v; ok.click(); } return; }
        if (g.document.querySelector('.op-overlay,.pos-move-ov')) return;   // 其他彈窗（PIN、確認、選人數…）不搶
        e.preventDefault(); e.stopPropagation();
        onScan && onScan(v);
        return;
      }
      const c = posKeyChar(e); if (!c) return;
      if (!buf || now - last > gap) { buf = ''; first = now; }
      buf += c; last = now;
    }, true);
  }
  Object.assign(g, { posKeyChar, posDigit, posScanField, posScanWedge });
  if (typeof module !== 'undefined') module.exports = { posKeyChar, posDigit, posScanField, posScanWedge };
})(typeof window !== 'undefined' ? window : globalThis);
