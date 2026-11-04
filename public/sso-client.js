/* 言文字單一登入（sso.emoji.tw）前端共用：app／admin／pos／order（各品牌站點餐）都載入這支。
   - EmojiSSO.silent(tokenKey)：本站沒有 token 時，先到 sso.emoji.tw/authorize?prompt=none 靜默取一張（已在別站登入就免再登入）；
     回來帶 #token=（交給原本的 #token 讀取流程）或 #sso=none（沒登入，照常顯示登入畫面）。回傳 true＝正在跳轉，呼叫端先停。
   - EmojiSSO.wrap(back)：登入鈕的 redirect 包一層 sso.emoji.tw/callback，登入完成會同時記住 SSO，再回到 back。
   - EmojiSSO.login(back)：直接前往 SSO 登入（已登入就立刻帶 token 回來）。
   - EmojiSSO.logout(back)：全站登出（清 SSO），回到 back；SSO 未啟用時回 false。
   只在 *.emoji.tw 正式網域啟用；本機開發與主畫面 App（standalone，iOS 與 Safari 不共用 cookie）一律不啟用，維持原本各站自己的登入。
   sso.emoji.tw 連不上（DNS 未生效等）時自動停用，不影響原本登入。 */
(function (g) {
  var BASE = 'https://sso.emoji.tw', TRY = 'sso_tried', DOWN = 'sso_down';
  function standalone() { try { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches; } catch (e) { return false; } }
  var host = String(location.hostname || '').toLowerCase();
  var on = /(^|\.)emoji\.tw$/.test(host) && host !== 'sso.emoji.tw' && location.protocol === 'https:' && !standalone();
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function clean(u) { return String(u || location.href).split('#')[0]; }
  function hashHas(k) { return new URLSearchParams(location.hash.slice(1)).has(k); }
  // #sso=none 處理完就從網址拿掉，避免重新整理時誤判
  if (hashHas('sso')) { ss(TRY, String(Date.now())); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  // 先確認 sso.emoji.tw 連得上（2.5 秒內），失敗就本分頁停用 SSO
  function reachable() {
    if (ss(DOWN)) return Promise.resolve(false);
    var c = typeof AbortController === 'function' ? new AbortController() : null, t = c && setTimeout(function () { c.abort(); }, 2500);
    return fetch(BASE + '/api/health', { mode: 'no-cors', cache: 'no-store', signal: c ? c.signal : undefined })
      .then(function () { return true; }, function () { ss(DOWN, '1'); return false; })
      .then(function (ok) { if (t) clearTimeout(t); return ok; });
  }
  function authorize(back, silent) {
    var lang = (document.documentElement.lang || '').slice(0, 2);
    return BASE + '/authorize?' + (silent ? 'prompt=none&' : '') + (lang === 'en' || lang === 'ja' ? 'lang=' + lang + '&' : '') + 'redirect=' + encodeURIComponent(clean(back));
  }
  g.EmojiSSO = {
    enabled: on, base: BASE,
    // 本站已有 token、剛從 SSO 回來（#token／#sso）、這個分頁 5 分鐘內試過，都不再跳
    silent: function (tokenKey) {
      if (!on || hashHas('token') || hashHas('sso')) return Promise.resolve(false);
      try { if (localStorage.getItem(tokenKey)) return Promise.resolve(false); } catch (e) { return Promise.resolve(false); }
      var t = +ss(TRY) || 0; if (Date.now() - t < 5 * 60 * 1000) return Promise.resolve(false);
      return reachable().then(function (ok) {
        if (!ok) return false;
        ss(TRY, String(Date.now())); location.replace(authorize(location.href, true)); return true;
      });
    },
    wrap: function (back) { return on && !ss(DOWN) ? BASE + '/callback?r=' + encodeURIComponent(clean(back)) : clean(back); },
    login: function (back) { if (!on) return false; ss(TRY, null); location.href = authorize(back || location.href, false); return true; },
    loginUrl: function (back) { return on ? authorize(back || location.href, false) : ''; },
    // 回傳 false＝SSO 未啟用，呼叫端照原本方式登出（例如重新整理）。
    // 已登入的頁面從沒跑過 silent()，不知道 SSO 通不通：先探測，連不上就直接回 back（本站 token 呼叫端已清），不跳到打不開的 sso.emoji.tw
    logout: function (back) {
      ss(TRY, String(Date.now()));
      if (!on || ss(DOWN)) return false;
      var dest = clean(back);
      reachable().then(function (ok) { location.replace(ok ? BASE + '/logout?redirect=' + encodeURIComponent(dest) : dest); });
      return true;
    },
  };
})(window);
