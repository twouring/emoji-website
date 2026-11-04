/* 等等空間站（staysquare.emoji.tw）：言文字會員登入、購買會籍、分區包場（KK 2026-11-04）。
   登入走言文字單一登入（/sso-client.js，sso.emoji.tw）：沒 token 先靜默取；登入鈕經 SSO callback（Google／LINE／Email）帶 #token= 回本站。
   SSO 未啟用（本機、主畫面 App、連不上）時退回本站 /auth/*。token 只存在本站 localStorage。
   API 走同網域 /api（子品牌站放行 /api/）。購買會籍＝/api/me/plans/checkout；包場＝/api/event-applications（zone）＋場地費結帳。 */
(function () {
  'use strict';
  var KEY = 'sq_token', PENDING = 'sq_pending';
  var html = document.documentElement.lang, L = html === 'en' ? 'en' : html === 'ja' ? 'ja' : 'zh';
  var T = {
    zh: { hi: '已登入：', member: '有效會籍：', none: '目前沒有有效會籍。', pending: '待啟用：', until: '至 ', logout: '登出',
      busy: '處理中…', expired: '登入已失效，請重新登入。', fail: '暫時無法完成，請稍後再試或來信 us@emoji.tw。',
      paid: '付款完成。會籍會在第一次以會員 App 進出 QR 進場時啟用；7 天內未進場將自動啟用。', canceled: '已取消付款，沒有扣款。',
      depPaid: '場地費已付款。團隊確認檔期後會以 Email 通知；無法安排時全額退費。', sent: '已送出申請，團隊確認後會以 Email 通知。',
      saved: '已登入，請確認內容後按「送出並付款」。', total: '場地費合計', free: '會員免費（以送出時會籍為準）', slot: '時段',
      pay: '送出並付款', submit: '送出申請', loginFirst: '送出前請先登入言文字會員。', apps: '我的包場申請',
      st: { pending: '待確認', approved: '已確認', rejected: '未通過' }, unpaid: '尚未付款', payNow: '付款', paidTag: '已付款', freeTag: '免場地費', ppl: ' 人',
      endsNext: '（隔天）' },
    en: { hi: 'Signed in: ', member: 'Active plan: ', none: 'No active membership.', pending: 'Not yet activated: ', until: 'until ', logout: 'Sign out',
      busy: 'Processing…', expired: 'Your sign-in has expired. Please sign in again.', fail: 'Something went wrong. Please try again or email us@emoji.tw.',
      paid: 'Payment complete. Your plan starts the first time you enter with the member app QR code, or automatically after 7 days.', canceled: 'Payment cancelled. You have not been charged.',
      depPaid: 'Venue fee paid. We will confirm the booking by email; if we cannot host it, you get a full refund.', sent: 'Request sent. We will confirm by email.',
      saved: 'You are signed in. Check the details and select “Submit and pay”.', total: 'Venue fee', free: 'Free for members (checked on submission)', slot: 'slot',
      pay: 'Submit and pay', submit: 'Submit request', loginFirst: 'Please sign in with your emoji account first.', apps: 'My venue bookings',
      st: { pending: 'Awaiting confirmation', approved: 'Confirmed', rejected: 'Declined' }, unpaid: 'Unpaid', payNow: 'Pay', paidTag: 'Paid', freeTag: 'No venue fee', ppl: ' people',
      endsNext: ' (next day)' },
    ja: { hi: 'ログイン中：', member: '有効なプラン：', none: '有効な会員資格はありません。', pending: '未開始：', until: '〜', logout: 'ログアウト',
      busy: '処理中…', expired: 'ログインの有効期限が切れました。もう一度ログインしてください。', fail: '処理できませんでした。時間をおいて再度お試しいただくか、us@emoji.tw までご連絡ください。',
      paid: 'お支払いが完了しました。会員アプリの入退室 QR で初めて入場した時点で開始し、7 日以内に入場がない場合は自動で開始します。', canceled: 'お支払いを取り消しました。請求は発生していません。',
      depPaid: '会場費のお支払いが完了しました。日程を確認のうえメールでご連絡します。お受けできない場合は全額返金します。', sent: '申請を送信しました。確認後メールでご連絡します。',
      saved: 'ログインしました。内容を確認して「送信して支払う」を押してください。', total: '会場費合計', free: '会員は無料（送信時の会員資格で判定）', slot: '枠',
      pay: '送信して支払う', submit: '申請を送信', loginFirst: '送信する前に言文字会員でログインしてください。', apps: '貸切の申請状況',
      st: { pending: '確認中', approved: '確定', rejected: '不可' }, unpaid: '未払い', payNow: '支払う', paidTag: '支払い済み', freeTag: '会場費なし', ppl: '名',
      endsNext: '（翌日）' },
  }[L];
  var PLAN = {
    zh: { day_4h: '單日 4 小時', day_12h: '單日 12 小時', month: '月會員', quarter: '季會員', year: '年會員', year_promo: '開幕優惠 年會員 18 個月', founding: '創始會員' },
    en: { day_4h: 'Day pass · 4 hrs', day_12h: 'Day pass · 12 hrs', month: 'Monthly', quarter: 'Quarterly', year: 'Annual', year_promo: 'Opening offer · Annual 18 months', founding: 'Founding Member' },
    ja: { day_4h: '1日 4時間', day_12h: '1日 12時間', month: '月会員', quarter: '四半期会員', year: '年会員', year_promo: 'オープン特典 年会員18か月', founding: '創始会員' },
  }[L];
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  var flash = $('[data-sq-flash]');
  function say(msg, bad) { if (!flash) return; flash.textContent = msg; flash.hidden = !msg; flash.classList.toggle('is-bad', !!bad); if (msg) flash.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  function money(n) { return 'NT$' + Number(n).toLocaleString('en-US'); }
  function day(iso) { var d = new Date(+new Date(iso) + 8 * 3600e3); return d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); }
  function hm(iso) { var d = new Date(+new Date(iso) + 8 * 3600e3); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); }

  // 登入回跳：#token= 存起來並從網址移除
  var hash = new URLSearchParams(location.hash.slice(1)), fresh = hash.get('token');
  if (fresh) { store.set(KEY, fresh); history.replaceState(null, '', location.pathname + location.search); }
  var token = store.get(KEY);
  var SSO = window.EmojiSSO && window.EmojiSSO.enabled ? window.EmojiSSO : null, ssoOk = false;
  // 確認 sso.emoji.tw 連得上才把登入／登出交給 SSO（DNS 未生效時退回本站 /auth/*，不讓登入鈕失效）
  if (SSO) fetch(SSO.base + '/api/health', { mode: 'no-cors', cache: 'no-store' }).then(function () { ssoOk = true; }, function () {});

  function api(path, body) {
    return fetch(path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { store.set(KEY, null); token = null; render(null); }
        if (!r.ok) { var e = new Error(j.error || (r.status === 401 ? T.expired : T.fail)); e.status = r.status; throw e; }
        return j; }); });
  }

  // ---- 登入對話框 ----
  var dlg = $('#sq-login'), opener = null;
  function back() { var u = location.origin + location.pathname; return SSO && ssoOk ? SSO.wrap(u) : u; }
  function openLogin(pending) {
    if (pending) store.set(PENDING, JSON.stringify(Object.assign({ at: Date.now() }, pending)));
    if (!dlg) return;
    var r = encodeURIComponent(back()), q = L === 'zh' ? '' : '&lang=' + L;
    $('[data-login=google]', dlg).href = '/auth/google?redirect=' + r;
    $('[data-login=line]', dlg).href = '/auth/line?redirect=' + r;
    $('[data-login=email]', dlg).href = '/event-login.html?redirect=' + r + q;
    opener = document.activeElement; dlg.showModal();
  }
  if (dlg) {
    fetch('/api/auth/methods').then(function (r) { return r.json(); }).then(function (j) { if (j && j.line) $('[data-login=line]', dlg).hidden = false; }).catch(function () {});
    $('[data-sq-close]', dlg).addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { if (opener && opener.focus) opener.focus(); });
  }
  $$('[data-sq-login]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); openLogin(); }); });
  $$('[data-sq-logout]').forEach(function (b) { b.addEventListener('click', function () { store.set(KEY, null); token = null; if (SSO && ssoOk && SSO.logout(location.origin + location.pathname)) return; render(null); }); });

  // ---- 會員狀態 ----
  function render(me) {
    $$('[data-sq-out]').forEach(function (x) { x.hidden = !!me; });
    $$('[data-sq-in]').forEach(function (x) { x.hidden = !me; });
    var who = $('[data-sq-who]'), plan = $('[data-sq-plan]');
    if (!me) return;
    if (who) who.textContent = T.hi + (me.name || me.email);
    if (plan) {
      var act = me.plans.map(function (p) { return (PLAN[p.plan] || p.plan) + (p.ends_at ? ' ' + T.until + day(p.ends_at) : ''); });
      var pen = me.pending.map(function (p) { return PLAN[p.plan] || p.plan; });
      plan.textContent = (act.length ? T.member + act.join('、') : T.none) + (pen.length ? '　' + T.pending + pen.join('、') : '');
    }
    var f = $('#sq-book-form');
    if (f) { if (!f.contact_name.value) f.contact_name.value = me.name || ''; if (!f.contact_email.value) f.contact_email.value = me.email || ''; }
  }
  function loadMe() {
    if (!token) { render(null); return Promise.resolve(null); }
    return api('/api/me/summary').then(function (me) { render(me); loadApps(); return me; }, function () { render(null); return null; });
  }

  // ---- 購買會籍 ----
  function buy(plan, btn) {
    if (!token) return openLogin({ kind: 'plan', plan: plan });
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    api('/api/me/plans/checkout', { plan: plan, return_host: location.hostname, lang: L }).then(function (j) { location.href = j.url; }, function (e) {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
      if (e.status === 401) return openLogin({ kind: 'plan', plan: plan });
      say(e.message, true);
    });
  }
  $$('[data-plan]').forEach(function (b) {
    var until = b.getAttribute('data-until');
    if (until && new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) > until) { b.closest('li').hidden = true; return; }
    b.addEventListener('click', function () { buy(b.getAttribute('data-plan'), b); });
  });

  // ---- 包場預約 ----
  var form = $('#sq-book-form');
  function fmtLocal(ms) { var d = new Date(ms + 8 * 3600e3); return d.toISOString().slice(0, 16); }
  function slotTimes() {
    if (!form || !form.date.value || !form.start.value) return null;
    var start = Date.parse(form.date.value + 'T' + form.start.value + ':00+08:00');
    if (!isFinite(start)) return null;
    var end = start + Number(form.slots.value) * 2 * 3600e3;
    return { starts_at: fmtLocal(start), ends_at: fmtLocal(end), nextDay: fmtLocal(end).slice(0, 10) !== form.date.value };
  }
  function quote() {
    if (!form) return;
    var opt = form.zone.selectedOptions[0], out = $('[data-sq-total]'), n = Number(form.slots.value) || 1;
    var fee = Number(opt && opt.getAttribute('data-fee')) || 0, free = opt && opt.hasAttribute('data-member-free');
    var max = Number(opt && opt.getAttribute('data-max')) || 0, t = slotTimes();
    form.attendees.max = max || '';
    if (out) out.textContent = T.total + '　' + money(fee * n) + '（' + money(fee) + ' × ' + n + ' ' + T.slot + '）' + (free ? '　' + T.free : '') +
      (t ? '　' + form.start.value + '–' + t.ends_at.slice(11) + (t.nextDay ? T.endsNext : '') : '');
  }
  function draft() { var o = {}; $$('input,select,textarea', form).forEach(function (x) { if (x.name) o[x.name] = x.type === 'checkbox' ? x.checked : x.value; }); return o; }
  function restore(o) { Object.keys(o || {}).forEach(function (k) { var x = form.elements[k]; if (!x) return; if (x.type === 'checkbox') x.checked = o[k] === true; else x.value = o[k]; }); quote(); }
  function payDeposit(id, btn) {
    return api('/api/event-applications/' + encodeURIComponent(id) + '/deposit/checkout', { return_host: location.hostname, lang: L }).then(function (j) { location.href = j.url; }, function (e) { if (btn) btn.disabled = false; say(e.message, true); });
  }
  if (form) {
    var today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    form.date.min = today;
    ['zone', 'slots', 'date', 'start'].forEach(function (k) { form.elements[k].addEventListener('change', quote); });
    quote();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (!token) { say(T.loginFirst, true); return openLogin({ kind: 'book', draft: draft() }); }
      var t = slotTimes(), btn = $('button[type=submit]', form);
      if (!t) return;
      btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      var rid = form.getAttribute('data-request') || (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function (c) { return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16); }));
      form.setAttribute('data-request', rid);
      api('/api/event-applications', {
        request_id: rid, kind: 'business', venue: '3F', visibility: 'private', zone: form.zone.value,
        starts_at: t.starts_at, ends_at: t.ends_at, attendees: String(form.attendees.value),
        community_name: form.community_name.value.trim() || form.contact_name.value.trim(), contact_name: form.contact_name.value, contact_email: form.contact_email.value,
        contact_phone: form.contact_phone.value, title: form.title.value, description: form.description.value, requirements: form.requirements.value, consent: form.consent.checked,
      }).then(function (j) {
        var a = j.application;
        if (a.deposit_twd > 0 && !a.deposit_paid_at) return payDeposit(a.id, btn);
        btn.disabled = false; btn.removeAttribute('aria-busy'); form.reset(); form.removeAttribute('data-request'); quote(); say(T.sent); loadApps();
      }, function (e) {
        btn.disabled = false; btn.removeAttribute('aria-busy');
        if (e.status === 401) return openLogin({ kind: 'book', draft: draft() });
        say(e.message, true);
      });
    });
  }
  function loadApps() {
    var box = $('[data-sq-apps]');
    if (!box || !token) return;
    api('/api/me/event-applications').then(function (j) {
      var list = (j.applications || []).filter(function (a) { return a.zone; });
      box.hidden = !list.length;
      var ul = $('ul', box); ul.textContent = '';
      list.forEach(function (a) {
        var li = document.createElement('li'), info = document.createElement('div'), h = document.createElement('b'), p = document.createElement('span');
        h.textContent = a.title;
        p.textContent = day(a.starts_at) + ' ' + hm(a.starts_at) + '–' + hm(a.ends_at) + '｜' + (zoneName(a.zone)) + '｜' + a.attendees + T.ppl + '｜' + (T.st[a.status] || a.status) +
          (a.deposit_twd > 0 ? '｜' + money(a.deposit_twd) + ' ' + (a.deposit_paid_at ? T.paidTag : T.unpaid) : '｜' + T.freeTag);
        info.appendChild(h); info.appendChild(p); li.appendChild(info);
        if (a.deposit_twd > 0 && !a.deposit_paid_at && a.status !== 'rejected') {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'sq-buy'; b.textContent = T.payNow;
          b.addEventListener('click', function () { b.disabled = true; payDeposit(a.id, b); }); li.appendChild(b);
        }
        ul.appendChild(li);
      });
    }).catch(function () {});
  }
  function zoneName(z) { var o = form && form.querySelector('option[value="' + z + '"]'); return o ? o.getAttribute('data-name') : z; }

  // ---- 付款回跳與登入後接續 ----
  var qs = new URLSearchParams(location.search), clean = false;
  // 單一登入：本站還沒 token 時先向 sso.emoji.tw 靜默取（在 App 或其他言文字網站登入過就自動帶入）；正在跳轉就先停
  (token || !SSO ? Promise.resolve(false) : SSO.silent(KEY)).then(function (going) { if (!going) start(); });
  function start() { loadMe().then(function (me) {
    if (qs.get('plan_paid') && qs.get('s') && me) {
      api('/api/me/plans/verify', { session_id: qs.get('s') }).then(function () { say(T.paid); loadMe(); }, function (e) { say(e.message, true); });
      clean = true;
    } else if (qs.get('plan_canceled') || qs.get('deposit_canceled')) { say(T.canceled); clean = true; }
    if (qs.get('deposit_paid') && me) {
      api('/api/event-applications/deposit/verify', { session_id: qs.get('deposit_paid') }).then(function () { say(T.depPaid); loadApps(); }, function (e) { say(e.message, true); });
      clean = true;
    }
    if (clean) history.replaceState(null, '', location.pathname);
    var pend = null; try { pend = JSON.parse(store.get(PENDING) || 'null'); } catch (e) {}
    if (pend && me && Date.now() - pend.at < 30 * 60e3) {
      store.set(PENDING, null);
      if (pend.kind === 'plan') buy(pend.plan);
      else if (pend.kind === 'book' && form) { restore(pend.draft); $('#book').scrollIntoView(); say(T.saved); }
    } else if (pend && Date.now() - pend.at >= 30 * 60e3) store.set(PENDING, null);
  }); }
})();
