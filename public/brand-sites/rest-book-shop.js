/* 約書旅站（restbook.emoji.tw）：線上購買計時方案（KK 11/17）。付款完成後約書旅 POS 入場管理出現「線上已付」。 */
(function () {
  'use strict';
  var KEY = 'rb_token', PENDING = 'rb_pending';
  var html = document.documentElement.lang, L = html === 'en' ? 'en' : html === 'ja' ? 'ja' : 'zh';
  var T = {
    zh: { busy: '處理中…', expired: '登入已失效，請重新登入。', fail: '暫時無法完成，請稍後再試。', paid: '付款完成。到約書旅櫃檯出示會員 App 的會員卡，掃碼入場後開始計時。', canceled: '已取消付款，沒有扣款。', buy: '線上購買' },
    en: { busy: 'Processing…', expired: 'Please sign in again.', fail: 'Something went wrong. Please try again.', paid: 'Paid. Show your member card at the Rest Book counter; the clock starts when you check in.', canceled: 'Payment cancelled.', buy: 'Buy online' },
    ja: { busy: '処理中…', expired: 'もう一度ログインしてください。', fail: '処理できませんでした。', paid: 'お支払い完了。約書旅のカウンターで会員カードを提示し、入場スキャンから計時が始まります。', canceled: 'お支払いを取り消しました。', buy: 'オンライン購入' }
  }[L];
  var ITEMS = { 'entry:60': 'm_rest_space_lounge_entry_1_hour', 'entry:240': 'm_rest_space_lounge_entry_4_hours', 'entry:480': 'm_rest_space_lounge_entry_8_hours',
    'room:60': 'm_rest_space_quiet_room_1_hour', 'room:240': 'm_rest_space_quiet_room_4_hours', 'room:480': 'm_rest_space_quiet_room_8_hours' };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  var flash = $('[data-rb-flash]');
  function say(msg, bad) { if (!flash) return; flash.textContent = msg; flash.hidden = !msg; flash.classList.toggle('is-bad', !!bad); if (msg) flash.scrollIntoView({ block: 'center' }); }
  var hash = new URLSearchParams(location.hash.slice(1)), fresh = hash.get('token');
  if (fresh) { store.set(KEY, fresh); history.replaceState(null, '', location.pathname + location.search); }
  var token = store.get(KEY);
  var SSO = window.EmojiSSO && window.EmojiSSO.enabled ? window.EmojiSSO : null, ssoOk = false;
  if (SSO) fetch(SSO.base + '/api/health', { mode: 'no-cors', cache: 'no-store' }).then(function () { ssoOk = true; }, function () {});
  function api(path, body) {
    return fetch(path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { store.set(KEY, null); token = null; }
        if (!r.ok) { var e = new Error(j.error || (r.status === 401 ? T.expired : T.fail)); e.status = r.status; throw e; }
        return j; }); });
  }
  var dlg = $('#rb-login');
  function back() { var u = location.origin + location.pathname; return SSO && ssoOk ? SSO.wrap(u) : u; }
  function openLogin(pending) {
    if (pending) store.set(PENDING, JSON.stringify(Object.assign({ at: Date.now() }, pending)));
    if (!dlg) return;
    var r = encodeURIComponent(back()), q = L === 'zh' ? '' : '&lang=' + L;
    $('[data-login=google]', dlg).href = '/auth/google?redirect=' + r;
    $('[data-login=line]', dlg).href = '/auth/line?redirect=' + r;
    $('[data-login=email]', dlg).href = '/event-login.html?redirect=' + r + q;
    dlg.showModal();
  }
  if (dlg) {
    fetch('/api/auth/methods').then(function (r) { return r.json(); }).then(function (j) { if (j && j.line) $('[data-login=line]', dlg).hidden = false; }).catch(function () {});
    $('[data-rb-close]', dlg).addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }
  function itemId() {
    var pl = $('.rb-plan'); if (!pl) return '';
    var kind = pl.querySelector('[data-g=kind] [aria-pressed=true]');
    var dur = pl.querySelector('[data-g=' + (kind && kind.dataset.k === 'room' ? 'room' : 'entry') + '] [aria-pressed=true]');
    return ITEMS[(kind && kind.dataset.k || 'entry') + ':' + (dur && dur.dataset.k || '60')] || '';
  }
  function buy(btn) {
    var id = itemId(); if (!id) return;
    if (!token) return openLogin({ item: id });
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    api('/api/me/lounge/checkout', { item_id: id, return_host: location.hostname, lang: L }).then(function (j) { location.href = j.url; }, function (e) {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
      if (e.status === 401) return openLogin({ item: id });
      say(e.message, true);
    });
  }
  var buyBtn = $('[data-rb-buy]');
  if (buyBtn) buyBtn.addEventListener('click', function () { buy(buyBtn); });
  function start() {
    var qs = new URLSearchParams(location.search), clean = false;
    var go = token ? Promise.resolve(true) : Promise.resolve(false);
    go.then(function (ok) {
      if (qs.get('lounge_paid') && qs.get('s') && token) {
        api('/api/me/lounge/verify', { session_id: qs.get('s') }).then(function () { say(T.paid); }, function (e) { say(e.message, true); });
        clean = true;
      } else if (qs.get('lounge_canceled')) { say(T.canceled); clean = true; }
      if (clean) history.replaceState(null, '', location.pathname);
      var pend = null; try { pend = JSON.parse(store.get(PENDING) || 'null'); } catch (e) {}
      if (pend && token && Date.now() - pend.at < 30 * 60e3) { store.set(PENDING, null); if (pend.item) buy(buyBtn); }
      else if (pend && Date.now() - pend.at >= 30 * 60e3) store.set(PENDING, null);
    });
  }
  (token || !SSO ? Promise.resolve(false) : SSO.silent(KEY)).then(function (going) { if (!going) start(); });
})();
