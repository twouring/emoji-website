/* LINE 登入帶回主畫面 App（KK 11/4，server lib/auth-handoff.js）：只在主畫面 App（standalone）啟用。
   iOS 主畫面 App 按 LINE 登入會跳 LINE App，回跳網址被開在 Safari，token 進不了 App。
   這裡在按下 LINE 登入時產生 handoff（只存本機）帶進 /auth/line；Safari 頁核對號碼後按確認，
   App 回前景輪詢 POST /api/auth/handoff 取回 token。m.html 與 order.html 共用：LineHandoff.init(tokenKey, onToken)。 */
(function (g) {
  var KEY = 'm_line_handoff', TTL = 10 * 60 * 1000, timer = null, onTok = null, tokKey = 'tth_token', busy = false;
  function standalone() { try { return ['standalone', 'fullscreen', 'minimal-ui'].some(function (m) { return matchMedia('(display-mode: ' + m + ')').matches; }) || navigator.standalone === true; } catch (e) { return false; } }
  function stop() { if (timer) { clearInterval(timer); timer = null; } var el = document.getElementById('line-handoff-bar'); if (el) el.remove(); }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} stop(); }
  function read() { try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && /^[a-f0-9]{32}$/.test(v.h) && Date.now() - v.at < TTL) return v; } catch (e) {} clear(); return null; }
  // 兩位數核對號碼，與伺服器 authHandoff.code 同算法
  function code(h) { var n = parseInt(String(h).slice(0, 4), 16) % 100; return (n < 10 ? '0' : '') + n; }
  function pending() { var v = read(); return v ? code(v.h) : ''; }
  function start() { var b = new Uint8Array(16); crypto.getRandomValues(b); var h = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); try { localStorage.setItem(KEY, JSON.stringify({ h: h, at: Date.now() })); } catch (e) {} return h; }
  function tick() {
    var v = read(); if (!v) return stop(); if (document.hidden || busy) return; busy = true;
    fetch('/api/auth/handoff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ h: v.h }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.token) { try { localStorage.setItem(tokKey, d.token); } catch (e) {} clear(); if (onTok) onTok(d.token); } })
      .catch(function () {}).then(function () { busy = false; });
  }
  // App 回前景時顯示核對號碼（Safari 頁會請使用者比對這個號碼再按確認）
  function banner() {
    var v = read(), el = document.getElementById('line-handoff-bar');
    if (!v) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'line-handoff-bar'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:9999;background:#1B1A17;color:#fff;border-radius:14px;padding:12px 16px;font-size:1rem;line-height:1.5;font-family:system-ui,-apple-system,"PingFang TC",sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
      document.body.appendChild(el); }
    el.innerHTML = 'LINE 登入中・核對號碼 <b style="font-size:1.4rem;letter-spacing:.15em;color:#FFDE34">' + code(v.h) + '</b><br>在 LINE／Safari 頁確認號碼相同後，回到這裡即可。<span style="display:block;opacity:.75">Signing in with LINE · code ' + code(v.h) + '</span>';
  }
  function watch() { banner(); if (!read() || timer) return; tick(); timer = setInterval(function () { tick(); banner(); }, 2500); }
  function init(tokenKey, cb) {
    tokKey = tokenKey || tokKey; onTok = cb;
    if (!standalone()) return;
    // LINE 登入鈕（m.html #line-login、order.html .sso.line）都是 <a href="/auth/line?redirect=…">：加上 handoff 再走
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href*="/auth/line?"]'); if (!a) return;
      e.preventDefault(); var u = new URL(a.getAttribute('href'), location.href);
      u.searchParams.set('handoff', start()); watch(); location.href = u.toString();
    }, true);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { watch(); tick(); } });
    watch();
  }
  g.LineHandoff = { init: init, pending: pending, code: code, clear: clear, standalone: standalone };
})(window);
