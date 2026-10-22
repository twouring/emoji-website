/* 全站共用導覽列行為：滾動陰影、手機漢堡選單、下拉 Esc 收合。會員登入態一律在會員 App（app.emoji.tw），官網不讀 token。
   桌機下拉以 CSS hover/focus-within 處理，本檔僅補行為層。零相依。 */
(function () {
  'use strict';
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  function closeDropdown(dd) {
    dd.classList.remove('open');
    var button = dd.querySelector('.site-nav__dd-top');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  if (nav) {
    addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', scrollY > 8);
    }, { passive: true });
  }

  if (toggle && links) {
    var setMenu = function (open) {
      links.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open
        ? (toggle.dataset.labelClose || 'Close menu')
        : (toggle.dataset.labelOpen || 'Open menu'));
      toggle.textContent = open ? '✕' : '☰';
      if (!open) document.querySelectorAll('.site-nav__dd.open').forEach(closeDropdown);
    };
    toggle.addEventListener('click', function () {
      setMenu(!links.classList.contains('open'));
    });
    // 點選單內連結後收合
    links.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a && !a.classList.contains('site-nav__dd-top')) setMenu(false);  // 下拉頂層連結只展開，不收合整個選單
    });
    // Esc 關閉手機選單並收合下拉
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var wasOpen = links.classList.contains('open');
        setMenu(false);
        if (wasOpen) toggle.focus();
        else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
    });
  }

  // 下拉：觸控／窄螢幕改「點擊展開」（桌機可 hover 者交給 CSS，不攔截）
  var touchLike = window.matchMedia('(hover:none), (max-width:1000px)');
  document.querySelectorAll('.site-nav__dd-top').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (!touchLike.matches) return;              // 桌機：hover 顯示，放行預設行為
      var dd = btn.closest('.site-nav__dd');
      if (!dd) return;
      e.preventDefault();  // 頂層為連結時亦只展開；首項即為該頁
      var willOpen = !dd.classList.contains('open');
      document.querySelectorAll('.site-nav__dd.open').forEach(function (o) { if (o !== dd) closeDropdown(o); });
      dd.classList.toggle('open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });
  });
  // 手機底部常駐列：訂位頁、活動頁已有自己的主要按鈕就不疊第二條；捲過首屏才出現
  var mBar = document.getElementById('mBar');
  if (mBar) {
    if (document.getElementById('reserveForm') || document.querySelector('.ev-cta-bar') || /\/(?:events|reserve|halloween-2026)(?:\/|$)/.test(location.pathname)) {
      mBar.parentNode.removeChild(mBar);
    } else {
      document.body.classList.add('has-m-bar');
      // 菜單鍵：17:00 前連在咖啡、17:00 起連三點水（台北時間）
      var menuLink = mBar.querySelector('[data-menu-day]');
      try {
        var h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', hour12: false }).format(new Date())) % 24;
        if (menuLink && (h >= 17 || h < 3)) menuLink.setAttribute('href', menuLink.getAttribute('data-menu-night'));
      } catch (e) {}
      var showBar = function () { mBar.classList.toggle('show', scrollY > 240); };
      addEventListener('scroll', showBar, { passive: true });
      showBar();
    }
  }

  // 菜單照片載入失敗：拿掉破圖框，品項改走純文字版面
  function dropBroken(img) {
    var li = img.closest('.menu-item');
    if (li) li.classList.remove('menu-item--img');
    img.parentNode && img.parentNode.removeChild(img);
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('menu-item__img')) dropBroken(t);
  }, true);
  document.querySelectorAll('img.menu-item__img').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) dropBroken(img);
  });

  // 菜單分類跳轉列：分類 ≥ 3 才產生，手機上不必一路滑過整份菜單
  document.querySelectorAll('.space-menu').forEach(function (menu, mi) {
    var groups = menu.querySelectorAll('.menu-group');
    if (groups.length < 3) return;
    var bar = document.createElement('nav');
    bar.className = 'menu-jump';
    bar.setAttribute('aria-label', (document.documentElement.lang || '').indexOf('en') === 0 ? 'Menu sections' : (document.documentElement.lang || '').indexOf('ja') === 0 ? 'メニューの分類' : '菜單分類');
    groups.forEach(function (g, i) {
      var h = g.querySelector('.menu-group__zh');
      if (!h) return;
      if (!g.id) g.id = 'menu-sec-' + mi + '-' + i;
      var a = document.createElement('a');
      a.href = '#' + g.id;
      a.textContent = h.textContent;
      bar.appendChild(a);
    });
    var first = groups[0];
    first.parentNode.insertBefore(bar, first);
  });

  // 點擊下拉以外處收合（桌機點擊模式或觸控）
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.site-nav__dd')) {
      document.querySelectorAll('.site-nav__dd.open').forEach(closeDropdown);
    }
  });
})();
