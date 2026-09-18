/* 言文字後台 · IG 貼文產生器
   左填右看，即時預覽，純前端匯出 PNG（方形 1080×1080 / 直式 1080×1350）。
   沿用 CIS token（/style.css 的 --ink/--paper/--accent…）與已載入的明體/黑體字型。
   狀態模型為 category／variant；本版提供 01–06 共十八個版型。 */
'use strict';
(function () {
  if (!window.IGStudioLib) {
    throw new Error('[ig-studio] 需先載入 /ig-studio-lib.js（window.IGStudioLib 未定義）');
  }
  const Lib = window.IGStudioLib;
  const H = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => (window.toast ? window.toast(m) : alert(m));
  const DIMS = { portrait: { w: 1080, h: 1350 }, square: { w: 1080, h: 1080 } };

  const TYPE_KEYS = { '01': 'product', '02': 'event', '03': 'quote', '04': 'hours', '05': 'menu', '06': 'brand' };
  const currentTypeKey = () => TYPE_KEYS[state.category] || 'product';

  // ---- 狀態（預設帶示範內容，避免空白預覽） ----
  const state = {
    category: '01', variant: 'a', format: 'portrait',
    dark: false, showEn: true, showMember: true, hl: true,
    photo: '',                 // dataURL
    handle: '@emoji0701', place: '重慶南路',
    // product
    p_eyebrow: '本週精選',
    p_zh: '美式咖啡', p_en: 'AMERICANO', p_note: '', p_desc: '深烘豆現萃，醇厚回甘。',
    p_unit: '單杯', p_price: 170, p_emo: 150,
    p_menuId: '', p_alcohol: false,
    // event
    e_title: '七月社群沙龍', e_dateBig: '07.19', e_weekday: 'SAT · 週六',
    e_when: '19:30 – 21:00', e_place: '言文字三樓',
    e_desc: '一晚，把台灣做事的人聚在一起。自由入場，飲品另計。',
    e_capacity: '20 位', e_signup: '需報名',
    // quote
    q_text: '把日常，留一點空。', q_sub: '來坐坐。', q_by: '言文字',
    // hours (04)
    hoursRows: '在咖啡｜08:00–17:00　三點水｜17:00–27:00',
    note: '白天在咖啡、晚上三點水，深夜食堂到凌晨三點。',
    dayTitle: '日 · 咖啡', dayHours: '08:00 – 17:00', dayDesc: '手沖、甜點與一張安靜的桌。',
    nightTitle: '夜 · 酒', nightHours: '17:00 – 27:00', nightDesc: '調酒、微醺與慢下來的對話。',
    address: '中正區重慶南路一段 11 號', mrt: '台北車站 · Z10 出口', booking: '私訊 @emoji0701',
    // menu (05)
    menuTitle: '菜單',
    menuRows: '冷萃 佛手柑｜180\n焙茶 拿鐵｜160\n手沖 單品｜200\n今日甜點｜140',
    coffeeRows: '冷萃 佛手柑｜180\n焙茶 拿鐵｜160',
    alcoholRows: '威士忌 Highball｜260\n季節 特調｜300',
    m_menuIds: [],
    // brand (06)
    openingLine: '言文字，開門了。', openingDate: '2026 · 11',
    openingDesc: '不只是咖啡廳——台灣人才聚落。白天在咖啡、晚上三點水，把日常留一點空。',
    manifesto: '不只是咖啡廳——\n台灣人才聚落。\n讓你平常不會遇到的人，\n在台北車站旁相遇。',
    en: 'words, left for people.',
    comingTitle: 'Coming\nsoon.', comingSub: '2026 年 11 月　台北車站見。',
  };

  const MENU = () => (window.MENU_DATA || []);

  function menuSelectedItems() {
    return (state.m_menuIds || []).map(id => MENU().find(m => m.id === id)).filter(Boolean);
  }

  function currentNeedsAlcohol() {
    if (state.category === '01') return !!state.p_alcohol;
    if (state.category === '05') {
      const { menuLayoutNeedsAlcohol } = Lib;
      return menuLayoutNeedsAlcohol(state.variant,
        menuSelectedItems(),
        Lib.parsePipeRows(state.alcoholRows, ['zh', 'price']),
        !!state.p_alcohol,
      );
    }
    return false;
  }

  // ---- 樣式（後台工具鏡 + 貼文本體 .igp） ----
  function injectCSS() {
    if (document.getElementById('ig-studio-css')) return;
    const css = `
    .ig-wrap{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:24px;align-items:start}
    @media(max-width:900px){.ig-wrap{grid-template-columns:minmax(0,1fr)}}
    .ig-form{min-width:0}
    .ig-form label{font-size:.82rem;color:var(--muted);display:flex;flex-direction:column;gap:.3em;margin-bottom:12px}
    .ig-form input,.ig-form select,.ig-form textarea{font:inherit;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink)}
    .ig-form textarea{min-height:60px;resize:vertical}
    .ig-seg{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
    .ig-seg button{all:unset;cursor:pointer;padding:.5em .9em;border:1px solid var(--line);border-radius:8px;font-size:.85rem;color:var(--ink-soft)}
    .ig-seg button.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    .ig-toggles{display:flex;flex-wrap:wrap;gap:10px 16px;margin:6px 0 14px}
    .ig-toggles label{flex-direction:row;align-items:center;gap:.4em;color:var(--ink-soft);margin:0}
    .ig-drop{border:1px dashed var(--line);border-radius:10px;padding:14px;text-align:center;color:var(--muted);font-size:.85rem;cursor:pointer;background:var(--paper)}
    .ig-drop.over{outline:2px dashed var(--accent);outline-offset:-6px}
    .ig-drop.has{color:var(--ink-soft);border-style:solid}
    .ig-hint{font-size:.78rem;color:var(--muted);background:var(--paper-deep);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:12px;line-height:1.5}
    .ig-hint--warn{border-color:var(--accent);color:var(--ink-soft)}
    .ig-previewbox{min-width:0;max-width:100%;overflow:hidden;background:var(--paper-deep);border:1px solid var(--line);border-radius:var(--radius);padding:22px;display:flex;flex-direction:column;align-items:center;gap:16px}
    .ig-stage-wrap{width:100%;max-width:460px;min-width:0;overflow:hidden;display:flex;justify-content:center}
    .ig-stage{overflow:hidden;box-shadow:var(--shadow);background:#fff;max-width:100%}
    .ig-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}

    /* ===== 貼文本體 — 以 1080 畫布為單位 ===== */
    .igp{--ig-yellow:#FFDE34;position:relative;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;
      background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;}
    .igp.dark{background:#16150F;color:#F4F1EA;}
    .igp *{box-sizing:border-box;margin:0;}
    .igp-layout{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;}
    .igp-photo{width:100%;flex:none;background-size:cover;background-position:center;background-repeat:no-repeat;background-color:#E7E1D5;}
    .igp.dark .igp-photo{background-color:#26231D;}
    .igp-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:76px 92px 80px;}
    .igp-body--alcohol{padding-top:48px;padding-bottom:40px;}
    .igp-eyebrow{font-size:22px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:16px;}
    .igp.dark .igp-eyebrow{color:#B7B0A2;}
    .igp-eyebrow::before{content:"";width:14px;height:14px;background:var(--ig-yellow);transform:rotate(45deg);flex:none;}
    .igp-eyebrow--plain::before{display:none;}
    .igp-h2{font-family:var(--serif);font-weight:500;line-height:1.06;letter-spacing:.02em;margin-top:32px;}
    /* 關鍵字整塊黃底（螢光筆）：字色固定墨色，深色版型上也可讀；跨行時每行各自成塊 */
    .igp .hl{background:var(--ig-yellow);color:#1B1A17;padding:.04em .12em;box-decoration-break:clone;-webkit-box-decoration-break:clone;}
    .igp-en{font-family:"Cormorant Garamond",var(--serif);font-style:italic;font-size:36px;color:var(--muted);margin-top:14px;}
    .igp.dark .igp-en{color:#B7B0A2;}
    .igp-note{font-size:24px;color:var(--muted);margin-top:12px;letter-spacing:.02em;}
    .igp-desc{font-size:28px;line-height:1.68;color:var(--ink-soft);margin-top:26px;max-width:760px;}
    .igp.dark .igp-desc{color:#D6D0C4;}
    .igp-spacer{margin-top:auto;}
    .igp-price-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:34px;}
    .igp-price-label{font-size:20px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);}
    .igp-price{font-family:"Cormorant Garamond",var(--serif);font-size:74px;line-height:.9;font-variant-numeric:tabular-nums;}
    .igp-price sup{font-size:.4em;vertical-align:.8em;color:var(--muted);margin-right:4px;}
    .igp-member{display:flex;align-items:baseline;justify-content:flex-end;gap:12px;margin-top:14px;font-size:24px;color:var(--muted);}
    .igp-member b{color:var(--ink);font-weight:600;}.igp.dark .igp-member b{color:#F4F1EA;}
    .igp-member .tag{font-size:18px;letter-spacing:.14em;background:var(--ig-yellow);color:#1B1A17;padding:.1em .6em;border-radius:999px;}
    .igp-foot{display:flex;align-items:baseline;justify-content:space-between;gap:24px;margin-top:34px;padding-top:26px;border-top:1px solid rgba(27,26,23,.14);}
    .igp.dark .igp-foot{border-top-color:rgba(244,241,234,.18);}
    .igp-brand{font-family:var(--serif);font-size:28px;letter-spacing:.06em;}
    .igp-handle{font-size:18px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);text-align:right;}
    .igp-photo-square{align-self:flex-start;}
    .igp-photo-frame{border:1px solid rgba(244,241,234,.34);padding:16px;margin-top:34px;}
    .igp-photo-frame .igp-photo{height:100%;}
    .igp-event-date{font-family:"Cormorant Garamond",var(--serif);font-size:196px;line-height:.86;letter-spacing:-.01em;font-variant-numeric:tabular-nums;margin-top:40px;}
    .igp-event-weekday{font-size:24px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);margin-top:16px;}
    .igp-meta{margin-top:auto;display:flex;flex-direction:column;}
    .igp-meta .r,.igp-info-row{display:flex;align-items:baseline;gap:20px;padding:15px 0;border-top:1px solid rgba(27,26,23,.14);font-size:30px;}
    .igp.dark .igp-meta .r,.igp.dark .igp-info-row{border-top-color:rgba(244,241,234,.18);}
    .igp-meta .lbl,.igp-info-row .lbl{font-size:18px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);min-width:104px;}
    .igp-meta .val,.igp-info-row .val{margin-left:auto;text-align:right;}
    .igp-info-frame{border:1px solid rgba(27,26,23,.24);padding:6px 34px;margin-top:38px;}
    .igp.dark .igp-info-frame{border-color:rgba(244,241,234,.32);}
    .igp-info-frame .igp-info-row:first-child{border-top:0;}
    .igp-quote{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:96px;}
    .igp-quote .mk{font-family:var(--serif);font-size:150px;line-height:.6;color:var(--ig-yellow);}
    .igp-quote .tx{font-family:var(--serif);font-weight:500;line-height:1.24;letter-spacing:.02em;text-wrap:balance;}
    .igp-quote .sb{font-family:var(--serif);font-size:48px;color:var(--muted);margin-top:26px;}
    .igp.dark .igp-quote .sb{color:#B7B0A2;}
    .igp-quote .by{font-size:22px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-top:40px;}
    .igp-quote-photo{position:relative;background-color:#E7E1D5;background-size:cover;background-position:center;}
    .igp.dark .igp-quote-photo{background-color:#26231D;}
    .igp-photo-scrim{position:absolute;inset:0;background:rgba(14,13,10,.62);}
    .igp-overlay-copy{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;padding:96px;color:#F4F1EA;}
    .igp-overlay-copy .igp-desc,.igp-overlay-copy .igp-handle{color:#E2DCD0;}
    .igp-overlay-copy .igp-foot{margin-top:auto;border-top-color:rgba(244,241,234,.3);}
    .igp-alcohol{flex:none;display:flex;flex-direction:column;justify-content:center;padding:0 48px;box-sizing:border-box;
      background:#1B1A17;color:#F4F1EA;font-family:var(--sans);font-size:22px;letter-spacing:.08em;gap:8px;text-align:center;}
    .igp.dark .igp-alcohol{background:#0E0D0A;}
    .igp-hours-title{font-family:var(--serif);font-weight:500;line-height:1.06;letter-spacing:.02em;margin-top:24px;}
    .igp-hours-list{margin-top:56px;}
    .igp-hours-row{display:flex;align-items:baseline;gap:16px;padding:22px 0;border-top:1px solid rgba(27,26,23,.14);font-size:30px;}
    .igp-hours-row:last-child{border-bottom:1px solid rgba(27,26,23,.14);}
    .igp.dark .igp-hours-row{border-top-color:rgba(244,241,234,.18);}
    .igp.dark .igp-hours-row:last-child{border-bottom-color:rgba(244,241,234,.18);}
    .igp-hours-day{min-width:220px;font-family:var(--serif);}
    .igp-hours-time{margin-left:auto;font-family:"Cormorant Garamond",var(--serif);font-size:34px;font-variant-numeric:tabular-nums;}
    .igp-hours-note{font-size:24px;line-height:1.7;color:var(--ink-soft);margin-top:34px;}
    .igp-dark .igp-hours-note{color:#D6D0C4;}
    .igp-dual{margin-top:52px;display:flex;flex-direction:column;gap:34px;}
    .igp-dual-card{border:1px solid rgba(27,26,23,.2);padding:38px 40px;}
    .igp-dual-card--night{background:#1B1A17;color:#F4F1EA;border-color:transparent;}
    .igp-dual-head{display:flex;align-items:baseline;gap:16px;}
    .igp-dual-title{font-family:var(--serif);font-weight:500;font-size:52px;letter-spacing:.02em;}
    .igp-dual-hours{margin-left:auto;font-family:"Cormorant Garamond",var(--serif);font-size:30px;font-variant-numeric:tabular-nums;color:var(--muted);}
    .igp-dual-card--night .igp-dual-hours{color:var(--ig-yellow);}
    .igp-dual-desc{font-size:23px;line-height:1.66;color:var(--ink-soft);margin-top:18px;}
    .igp-dual-card--night .igp-dual-desc{color:#B7B0A2;}
    .igp-loc-title{font-family:var(--serif);font-weight:500;line-height:1.1;letter-spacing:.02em;margin-top:28px;font-size:78px;}
    .igp-loc-row{display:flex;align-items:baseline;gap:16px;padding:22px 0;border-top:1px solid rgba(244,241,234,.18);font-size:30px;}
    .igp-loc-row:last-child{border-bottom:1px solid rgba(244,241,234,.18);}
    .igp-loc-lbl{font-size:17px;letter-spacing:.24em;text-transform:uppercase;color:#B7B0A2;min-width:130px;}
    .igp-loc-val{margin-left:auto;text-align:right;}
    .igp-loc-val--accent{color:var(--ig-yellow);}
    .igp-menu-list{margin-top:52px;display:flex;flex-direction:column;gap:30px;}
    .igp-menu-row{display:flex;align-items:baseline;gap:14px;font-size:32px;}
    .igp-menu-dots{flex:1;border-bottom:1px dotted rgba(27,26,23,.3);transform:translateY(-8px);}
    .igp.dark .igp-menu-dots{border-bottom-color:rgba(244,241,234,.3);}
    .igp-menu-price{font-family:"Cormorant Garamond",var(--serif);font-size:34px;font-variant-numeric:tabular-nums;}
    .igp-menu-section{margin-top:44px;}
    .igp-menu-section:first-of-type{margin-top:44px;}
    .igp-menu-section-head{display:flex;align-items:center;gap:14px;}
    .igp-menu-section-head .dot{width:11px;height:11px;background:var(--ig-yellow);transform:rotate(45deg);flex:none;}
    .igp-menu-section-head .dot--dark{background:#1B1A17;}
    .igp.dark .igp-menu-section-head .dot--dark{background:var(--ig-yellow);}
    .igp-menu-section-title{font-family:var(--serif);font-weight:500;font-size:40px;letter-spacing:.04em;}
    .igp-menu-items{margin-top:22px;display:flex;flex-direction:column;gap:16px;}
    .igp-menu-item{display:flex;align-items:baseline;justify-content:space-between;gap:14px;font-size:28px;}
    .igp-menu-item .p{font-family:"Cormorant Garamond",var(--serif);font-size:30px;font-variant-numeric:tabular-nums;}
    .igp-sig-price{font-family:"Cormorant Garamond",var(--serif);font-size:60px;line-height:1;color:var(--ig-yellow);font-variant-numeric:tabular-nums;}
    .igp-sig-price sup{font-size:.42em;vertical-align:.7em;margin-right:2px;}
    .igp-sig-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:26px;}
    .igp-photo-placeholder{background:var(--ig-yellow);}
    .igp-opening-line{font-family:var(--serif);font-weight:500;line-height:1.08;letter-spacing:.02em;}
    .igp-opening-date{margin-top:44px;font-family:"Cormorant Garamond",var(--serif);font-size:80px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums;}
    .igp.dark .igp-opening-date{color:#F4F1EA;}
    .igp-opening-desc{font-size:26px;line-height:1.7;color:var(--ink-soft);margin-top:26px;}
    .igp-manifesto{font-family:var(--serif);font-weight:500;line-height:1.28;letter-spacing:.03em;white-space:pre-line;text-wrap:balance;}
    .igp-coming-title{font-family:"Cormorant Garamond",var(--serif);font-size:132px;line-height:1.02;letter-spacing:.01em;}
    .igp-coming-sub{font-family:var(--serif);font-size:42px;line-height:1.5;color:#B7B0A2;margin-top:40px;}

    /* ===== 09 系列：線條 icon ===== */
    .igp-pageno{position:absolute;top:82px;right:92px;z-index:2;font-size:20px;letter-spacing:.26em;
      color:var(--muted);font-variant-numeric:lining-nums tabular-nums;}
    .igp.dark .igp-pageno{color:#B7B0A2;}
    .igp9-wrap{position:relative;}
    .igp9-wrap>.igp7-pad{position:relative;z-index:1;}
    .igp9-clip{position:absolute;inset:0;overflow:hidden;z-index:0;pointer-events:none;}
    .igp9-bg{position:absolute;right:-170px;top:-100px;width:820px;height:820px;
      color:rgba(27,26,23,.07);}
    .igp.dark .igp9-bg{color:rgba(244,241,234,.09);}
    .igp9-bg--soft{width:660px;height:660px;right:-130px;top:-70px;}
    .igp9-hero{position:relative;margin:auto 0 46px;color:var(--ink);}
    .igp.dark .igp9-hero{color:#F4F1EA;}
    .igp9-hero svg{width:100%;height:100%;display:block;}
    .igp9-acc{position:absolute;right:-16px;top:-10px;width:24px;height:24px;background:var(--ig-yellow);transform:rotate(45deg);}
    .igp9-title{font-family:var(--serif);font-weight:700;line-height:1.22;letter-spacing:.02em;}
    .igp9-sub{font-size:30px;line-height:1.7;color:var(--ink-soft);margin-top:36px;margin-bottom:auto;}
    .igp.dark .igp9-sub{color:#D6D0C4;}
    .igp9b-list{display:flex;flex-direction:column;}
    .igp9b-item{display:flex;align-items:center;gap:32px;padding:42px 0;border-top:1px solid rgba(27,26,23,.16);}
    .igp9b-item:first-child{border-top:2px solid var(--ink);}
    .igp.dark .igp9b-item{border-top-color:rgba(244,241,234,.2);}
    .igp9b-ic{width:74px;height:74px;flex:none;color:var(--ink);}
    .igp.dark .igp9b-ic{color:#F4F1EA;}
    .igp9b-item:first-child .igp9b-ic{color:#1B1A17;background:var(--ig-yellow);border-radius:8px;padding:10px;box-sizing:border-box;}
    .igp9b-t{font-family:var(--serif);line-height:1.4;font-weight:500;}
    /* ===== 07/08 系列（2026-08 新版型：行銷結構化，CIS 新構圖） ===== */
    .igp7-pad{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:88px 92px 76px;}
    .igp7-tag{font-size:21px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:14px;}
    .igp7-tag::before{content:"";width:26px;height:8px;background:var(--ig-yellow);flex:none;}
    .igp.dark .igp7-tag{color:#B7B0A2;}
    /* 07a Hook 大字報：一句話撐全場，黃色筆刷條收底 */
    .igp7a-hook{font-family:var(--serif);font-weight:700;line-height:1.22;letter-spacing:.02em;margin:auto 0 0;}
    .igp7a-bar{width:148px;height:22px;background:var(--ig-yellow);margin-top:46px;}
    .igp7a-sub{font-size:30px;line-height:1.7;color:var(--ink-soft);margin-top:42px;margin-bottom:auto;}
    /* 07b 編輯部條列：大序號 + 細線分隔 */
    .igp7b-head{font-family:var(--serif);font-weight:700;line-height:1.14;margin-top:40px;}
    .igp7b-list{display:flex;flex-direction:column;}
    .igp7b-item{display:flex;align-items:baseline;gap:34px;padding:52px 0;border-top:1px solid rgba(27,26,23,.16);}
    .igp7b-item:first-child{border-top:2px solid var(--ink);}
    .igp7b-num{font-family:"Cormorant Garamond",var(--serif);font-size:64px;line-height:1;color:var(--muted);font-variant-numeric:tabular-nums;flex:none;}
    .igp7b-txt{font-family:var(--serif);font-size:40px;line-height:1.42;font-weight:500;}
    .igp7b-item:nth-child(1) .igp7b-num{color:var(--ink);}
    .igp7b-item:nth-child(1) .igp7b-txt .k{background:var(--ig-yellow);padding:.03em .1em;box-decoration-break:clone;-webkit-box-decoration-break:clone;}
    /* 07c 對話卡：墨底問答，黃色引導線 */
    .igp7c-q{font-family:var(--serif);font-weight:700;line-height:1.3;letter-spacing:.02em;color:#F4F1EA;margin-top:auto;}
    .igp7c-lead{display:flex;align-items:center;gap:22px;margin:52px 0;}
    .igp7c-lead .ln{flex:none;width:96px;height:2px;background:var(--ig-yellow);}
    .igp7c-lead .lb{font-size:20px;letter-spacing:.3em;text-transform:uppercase;color:var(--ig-yellow);}
    .igp7c-a{font-family:var(--serif);font-size:46px;line-height:1.6;font-weight:500;color:#D6D0C4;margin-bottom:auto;}
    /* 08a 雜誌封面：全幅照 + 底部漸層 + 疊字 */
    .igp8a{position:relative;flex:1;min-height:0;background-size:cover;background-position:center;background-color:#26231D;}
    .igp8a-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,13,10,.18) 34%,rgba(14,13,10,.82) 100%);}
    .igp8a-copy{position:absolute;inset:0;display:flex;flex-direction:column;padding:84px 92px 72px;color:#F4F1EA;}
    .igp8a-eyebrow{font-size:21px;letter-spacing:.3em;text-transform:uppercase;color:var(--ig-yellow);display:flex;align-items:center;gap:14px;}
    .igp8a-eyebrow::before{content:"";width:26px;height:8px;background:var(--ig-yellow);flex:none;}
    .igp8a-title{font-family:var(--serif);font-weight:700;line-height:1.24;letter-spacing:.02em;margin-top:auto;text-shadow:0 2px 22px rgba(14,13,10,.4);}
    .igp8a-copy .igp-foot{border-top-color:rgba(244,241,234,.32);}
    .igp8a-copy .igp-handle{color:#D6D0C4;}
    /* 08b 數字看板：巨大數字 + 黃色方塊裁切 */
    .igp8b-stage{margin:auto 0;}
    .igp8b-numwrap{position:relative;display:inline-block;}
    .igp8b-block{position:absolute;left:-28px;bottom:-2px;width:210px;height:140px;background:var(--ig-yellow);}
    .igp8b-num{position:relative;font-family:"Cormorant Garamond",var(--serif);font-size:288px;line-height:.92;letter-spacing:-.01em;font-variant-numeric:lining-nums tabular-nums;}
    .igp8b-label{font-family:var(--serif);font-size:46px;font-weight:700;letter-spacing:.06em;margin-top:34px;position:relative;}
    .igp8b-desc{font-size:29px;line-height:1.7;color:var(--ink-soft);margin-top:26px;max-width:760px;}
    /* 08c 檔期卡：墨底 save-the-date */
    .igp8c-top{font-size:21px;letter-spacing:.42em;text-transform:uppercase;color:#B7B0A2;text-align:center;margin-top:26px;}
    .igp8c-date{font-family:"Cormorant Garamond",var(--serif);font-size:238px;line-height:1;color:#F4F1EA;text-align:center;margin-top:auto;font-variant-numeric:lining-nums tabular-nums;}
    .igp8c-rule{width:120px;height:3px;background:var(--ig-yellow);margin:52px auto;}
    .igp8c-name{font-family:var(--serif);font-size:66px;font-weight:700;letter-spacing:.08em;color:#F4F1EA;text-align:center;}
    .igp8c-meta{font-size:27px;letter-spacing:.08em;color:#B7B0A2;text-align:center;margin:34px 0 auto;line-height:1.8;}
    `;
    const s = document.createElement('style'); s.id = 'ig-studio-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- 貼文 HTML ----
  const hl = t => state.hl ? `<span class="hl">${H(t)}</span>` : H(t);
  const foot = () => `<div class="igp-foot"><span class="igp-brand">言文字</span><span class="igp-handle">${H(state.place)} · ${H(state.handle)}</span></div>`;
  const photo = (height, className = '', extraStyle = '', placeholder = false) => {
    if (placeholder && !state.photo) {
      return `<div class="igp-photo igp-photo-placeholder${className ? ` ${className}` : ''}" style='height:${height}px;${extraStyle}'></div>`;
    }
    return `<div class="igp-photo${className ? ` ${className}` : ''}" style='height:${height}px;${extraStyle}${state.photo ? `background-image:url("${state.photo}")` : ''}'></div>`;
  };
  const productCopy = () => `
    ${state.showEn && state.p_en ? `<div class="igp-en">${H(state.p_en)}</div>` : ''}
    ${state.p_note ? `<div class="igp-note">${H(state.p_note)}</div>` : ''}
    ${state.p_desc ? `<p class="igp-desc">${H(state.p_desc)}</p>` : ''}`;
  const productPrice = () => `<div class="igp-price-row">
      <span class="igp-price-label">${H(state.p_unit)}</span>
      <span class="igp-price"><sup>$</sup>${H(state.p_price)}</span>
    </div>
    ${state.showMember && state.p_emo ? `<div class="igp-member"><span class="tag">會員</span><span>會員價</span><b><sup style="font-size:.5em">$</sup>${H(state.p_emo)}</b></div>` : ''}`;

  function render01a() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const photoH = needsAlcohol ? (sq ? 160 : 320) : (sq ? 350 : 620);
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="01a">
      ${photo(photoH)}
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}">
        ${state.p_eyebrow ? `<div class="igp-eyebrow">${H(state.p_eyebrow)}</div>` : ''}
        <h2 class="igp-h2" style="font-size:${sq ? 76 : 88}px">${hl(state.p_zh)}</h2>
        ${productCopy()}
        <div class="igp-spacer"></div>
        ${productPrice()}
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render01b() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const photoH = needsAlcohol ? (sq ? 150 : 240) : (sq ? 300 : 420);
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="01b">
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}">
        ${state.p_eyebrow ? `<div class="igp-eyebrow">${H(state.p_eyebrow)}</div>` : ''}
        <h2 class="igp-h2" style="font-size:${sq ? 78 : 96}px">${H(state.p_zh)}</h2>
        ${productCopy()}
        ${photo(photoH, 'igp-photo-square', `width:${photoH}px;margin-top:${needsAlcohol ? 24 : 42}px;`)}
        <div class="igp-spacer"></div>
        ${productPrice()}
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render01c() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const photoH = needsAlcohol ? (sq ? 140 : 230) : (sq ? 280 : 440);
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="01c">
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}">
        ${state.p_eyebrow ? `<div class="igp-eyebrow">${H(state.p_eyebrow)}</div>` : ''}
        <h2 class="igp-h2" style="font-size:${sq ? 68 : 84}px">${H(state.p_zh)}</h2>
        ${state.showEn && state.p_en ? `<div class="igp-en">${H(state.p_en)}</div>` : ''}
        ${state.p_note ? `<div class="igp-note">${H(state.p_note)}</div>` : ''}
        <div class="igp-photo-frame" style="width:${sq ? 420 : 540}px;height:${photoH + 32}px">${photo(photoH)}</div>
        ${state.p_desc ? `<p class="igp-desc">${H(state.p_desc)}</p>` : ''}
        <div class="igp-spacer"></div>
        ${productPrice()}
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render02a() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="02a">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Event · 活動預告</div>
        <div class="igp-event-date" style="font-size:${sq ? 160 : 196}px">${H(state.e_dateBig)}</div>
        <div class="igp-event-weekday">${hl(state.e_weekday)}</div>
        <h2 class="igp-h2" style="font-size:${sq ? 68 : 82}px">${H(state.e_title)}</h2>
        ${state.e_desc ? `<p class="igp-desc">${H(state.e_desc)}</p>` : ''}
        ${state.en ? `<div class="igp-en" style="font-size:${sq ? 26 : 30}px;margin-top:16px">${H(state.en)}</div>` : ''}
        <div class="igp-meta">
          <div class="r"><span class="lbl">時間</span><span class="val">${H(state.e_when)}</span></div>
          <div class="r"><span class="lbl">地點</span><span class="val">${H(state.e_place)}</span></div>
          <div class="r"><span class="lbl">名額</span><span class="val">${H(state.e_capacity)} · ${H(state.e_signup)}</span></div>
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render02b() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="02b">
      <div class="igp-body">
        <div class="igp-eyebrow">Weekend · 週末</div>
        <h2 class="igp-h2" style="font-size:${sq ? 72 : 92}px">${H(state.e_title)}</h2>
        ${state.e_desc ? `<p class="igp-desc">${H(state.e_desc)}</p>` : ''}
        <div class="igp-info-frame">
          <div class="igp-info-row"><span class="lbl">日期</span><span class="val">${H(state.e_dateBig)}　${H(state.e_weekday)}</span></div>
          <div class="igp-info-row"><span class="lbl">時間</span><span class="val">${H(state.e_when)}</span></div>
          <div class="igp-info-row"><span class="lbl">地點</span><span class="val">${H(state.e_place)}</span></div>
          <div class="igp-info-row"><span class="lbl">報名</span><span class="val">${H(state.e_capacity)} · ${H(state.e_signup)}</span></div>
        </div>
        ${photo(sq ? 160 : 250, '', 'margin-top:34px;')}
        <div class="igp-spacer"></div>
        ${foot()}
      </div>
    </div>`;
  }

  function render02c() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="02c">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Live · 週末現場</div>
        <h2 class="igp-h2" style="font-size:${sq ? 68 : 82}px">${H(state.e_title)}</h2>
        <div class="igp-event-date" style="font-size:${sq ? 104 : 128}px">${hl(state.e_dateBig)}</div>
        <div class="igp-event-weekday">${H(state.e_weekday)}</div>
        ${state.e_desc ? `<p class="igp-desc">${H(state.e_desc)}</p>` : ''}
        ${photo(sq ? 170 : 280, '', 'margin-top:32px;')}
        <div class="igp-meta">
          <div class="r"><span class="lbl">時間</span><span class="val">${H(state.e_when)}</span></div>
          <div class="r"><span class="lbl">地點</span><span class="val">${H(state.e_place)}</span></div>
          <div class="r"><span class="lbl">名額</span><span class="val">${H(state.e_capacity)} · ${H(state.e_signup)}</span></div>
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render03a() {
    const sq = state.format === 'square';
    const eyebrow = state.q_by && state.q_by !== '言文字' ? state.q_by : 'Words · 一句';
    return `<div class="igp-layout" data-layout="03a">
      <div class="igp-quote">
        <div class="igp-eyebrow">${H(eyebrow)}</div>
        <div style="margin:auto 0"><div class="mk">“</div>
          <div class="tx" style="font-size:${fitWrap(state.q_text, 124, sq)}px">${H(state.q_text)}</div>
          ${state.q_sub ? `<div class="sb" style="font-size:${fitSize(state.q_sub, 46, sq)}px">${H(state.q_sub)}</div>` : ''}
          ${state.en ? `<div class="igp-en" style="font-size:${sq ? 26 : 30}px;margin-top:22px">${H(state.en)}</div>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render03b() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="03b">
      <div class="igp-quote">
        <div class="igp-eyebrow igp-eyebrow--plain">${H(state.q_by && state.q_by !== '言文字' ? state.q_by : 'A Note · 夜的字')}</div>
        <div style="margin:auto 0">
          <div class="mk">「</div>
          <div class="tx" style="font-size:${fitWrap(state.q_text, 112, sq)}px">${H(state.q_text)}</div>
          ${state.q_sub ? `<div class="sb" style="font-size:${fitSize(state.q_sub, 44, sq)}px">— ${H(state.q_sub)} —</div>` : ''}
          ${state.en ? `<div class="igp-en" style="font-size:${sq ? 26 : 30}px;margin-top:22px">${H(state.en)}</div>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render03c() {
    const sq = state.format === 'square';
    const bg = state.photo ? `background-image:url("${state.photo}")` : '';
    return `<div class="igp-layout igp-quote-photo" data-layout="03c" style='${bg}'>
      <div class="igp-photo-scrim"></div>
      <div class="igp-overlay-copy">
        <div class="igp-eyebrow igp-eyebrow--plain">Words · 留下片刻</div>
        <div style="margin:auto 0">
          <h2 class="igp-h2" style="font-size:${sq ? 68 : 80}px">${H(state.q_text)}</h2>
          ${state.q_sub ? `<p class="igp-desc">${H(state.q_sub)}</p>` : ''}
          ${state.q_by ? `<div class="by" style="margin-top:32px;font-size:22px;letter-spacing:.22em">${H(state.q_by)}</div>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render04a() {
    const sq = state.format === 'square';
    const rows = Lib.parsePipeRows(state.hoursRows, ['day', 'time']);
    const rowHtml = rows.map((r, i) => `<div class="igp-hours-row">
        <span class="igp-hours-day">${H(r.day)}</span>
        <span class="igp-hours-time">${H(r.time)}</span>
      </div>`).join('');
    return `<div class="igp-layout" data-layout="04a">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Opening Hours</div>
        <h2 class="igp-hours-title" style="font-size:${sq ? 72 : 84}px">營業時間</h2>
        <div class="igp-hours-list">${rowHtml}</div>
        ${state.note ? `<p class="igp-hours-note">${hl(state.note)}</p>` : ''}
        <div class="igp-spacer"></div>
        ${foot()}
      </div>
    </div>`;
  }

  function render04b() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="04b">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Two Faces · 一日兩種</div>
        <div class="igp-dual">
          <div class="igp-dual-card">
            <div class="igp-dual-head">
              <span class="igp-dual-title" style="font-size:${sq ? 44 : 52}px">${H(state.dayTitle)}</span>
              <span class="igp-dual-hours">${H(state.dayHours)}</span>
            </div>
            ${state.dayDesc ? `<p class="igp-dual-desc">${H(state.dayDesc)}</p>` : ''}
          </div>
          <div class="igp-dual-card igp-dual-card--night">
            <div class="igp-dual-head">
              <span class="igp-dual-title" style="font-size:${sq ? 44 : 52}px">${H(state.nightTitle)}</span>
              <span class="igp-dual-hours">${H(state.nightHours)}</span>
            </div>
            ${state.nightDesc ? `<p class="igp-dual-desc">${H(state.nightDesc)}</p>` : ''}
          </div>
        </div>
        <div class="igp-spacer"></div>
        ${foot()}
      </div>
    </div>`;
  }

  function render04c() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="04c">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Find Us · 怎麼來</div>
        <h2 class="igp-loc-title" style="font-size:${sq ? 64 : 78}px">來坐坐</h2>
        <div style="margin-top:52px">
          <div class="igp-loc-row"><span class="igp-loc-lbl">地址</span><span class="igp-loc-val">${H(state.address)}</span></div>
          <div class="igp-loc-row"><span class="igp-loc-lbl">捷運</span><span class="igp-loc-val">${H(state.mrt)}</span></div>
          <div class="igp-loc-row"><span class="igp-loc-lbl">訂位</span><span class="igp-loc-val igp-loc-val--accent">${H(state.booking)}</span></div>
        </div>
        <div class="igp-spacer"></div>
        ${foot()}
      </div>
    </div>`;
  }

  function menuRowsFor05a() {
    const selected = menuSelectedItems();
    if (selected.length) return selected.map(m => ({ zh: m.zh, price: m.price }));
    return Lib.parsePipeRows(state.menuRows, ['zh', 'price']);
  }

  function render05a() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const rows = menuRowsFor05a();
    const rowHtml = rows.map(r => `<div class="igp-menu-row">
        <span>${H(r.zh)}</span>
        <span class="igp-menu-dots"></span>
        <span class="igp-menu-price">${H(r.price)}</span>
      </div>`).join('');
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="05a">
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}">
        <div class="igp-eyebrow igp-eyebrow--plain">Coffee · 日間咖啡</div>
        <h2 class="igp-h2" style="font-size:${sq ? 68 : 80}px">${H(state.menuTitle)}</h2>
        <div class="igp-menu-list">${rowHtml}</div>
        <div class="igp-spacer"></div>
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render05b() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const coffee = Lib.parsePipeRows(state.coffeeRows, ['zh', 'price']);
    const alcohol = Lib.parsePipeRows(state.alcoholRows, ['zh', 'price']);
    const itemRow = r => `<div class="igp-menu-item"><span>${H(r.zh)}</span><span class="p">${H(r.price)}</span></div>`;
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="05b">
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}" style="padding-top:${sq ? 72 : 88}px">
        <div class="igp-eyebrow igp-eyebrow--plain">Day &amp; Night · 一單兩面</div>
        <div class="igp-menu-section">
          <div class="igp-menu-section-head"><span class="dot"></span><span class="igp-menu-section-title" style="font-size:${sq ? 34 : 40}px">咖啡</span></div>
          <div class="igp-menu-items">${coffee.map(itemRow).join('')}</div>
        </div>
        <div class="igp-menu-section">
          <div class="igp-menu-section-head"><span class="dot dot--dark"></span><span class="igp-menu-section-title" style="font-size:${sq ? 34 : 40}px">夜間 · 酒</span></div>
          <div class="igp-menu-items">${alcohol.map(itemRow).join('')}</div>
        </div>
        <div class="igp-spacer"></div>
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render05c() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const photoH = needsAlcohol ? (sq ? 280 : 420) : (sq ? 320 : 600);
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="05c">
      ${photo(photoH, '', '', true)}
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}" style="padding-top:${sq ? 48 : 64}px;padding-bottom:${sq ? 60 : 76}px">
        <div class="igp-eyebrow igp-eyebrow--plain">Signature · 招牌</div>
        <div class="igp-sig-row">
          <div>
            <h2 class="igp-h2" style="font-size:${sq ? 54 : 66}px;margin:0">${H(state.p_zh)}</h2>
            ${state.showEn && state.p_en ? `<div class="igp-en" style="font-size:${sq ? 26 : 30}px;margin-top:12px">${H(state.p_en)}</div>` : ''}
          </div>
          <span class="igp-sig-price"><sup>$</sup>${H(state.p_price)}</span>
        </div>
        <div class="igp-spacer"></div>
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render06a() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="06a">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Grand Opening · 開幕</div>
        <div style="margin:auto 0">
          <div class="igp-opening-line" style="font-size:${sq ? 96 : 118}px">${hl(state.openingLine)}</div>
          <div class="igp-opening-date" style="font-size:${sq ? 64 : 80}px">${H(state.openingDate)}</div>
          ${state.openingDesc ? `<p class="igp-opening-desc">${H(state.openingDesc)}</p>` : ''}
          ${state.en ? `<div class="igp-en" style="font-size:${sq ? 26 : 30}px;margin-top:20px">${H(state.en)}</div>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render06b() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="06b">
      <div class="igp-body">
        <div class="igp-eyebrow">Brand · 品牌理念</div>
        <div style="margin:auto 0">
          <div class="igp-manifesto" style="font-size:${fitWrap(state.manifesto, 104, sq)}px">${H(state.manifesto)}</div>
          ${state.en ? `<p class="igp-en" style="font-size:${sq ? 28 : 32}px;margin-top:36px">${H(state.en)}</p>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render06c() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="06c">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Coming Soon · 即將</div>
        <div style="margin:auto 0">
          <h2 class="igp-coming-title" style="font-size:${fitSize(state.comingTitle, 132, sq)}px">${H(state.comingTitle)}</h2>
          ${state.comingSub ? `<p class="igp-coming-sub" style="font-size:${sq ? 36 : 42}px">${hl(state.comingSub)}</p>` : ''}
          ${state.en ? `<div class="igp-en" style="font-size:${sq ? 26 : 30}px;margin-top:20px">${H(state.en)}</div>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  /* ===== 09 系列：線條 icon（Outline）風 —— 依貼文內容選 icon ===== */
  // 手繪 48×48 線條 icon；stroke currentColor，色彩隨亮暗版型自動切換
  const ICONS = {
    coffee: '<path d="M10 18h22v9a11 11 0 0 1-22 0z"/><path d="M32 20h4a5 5 0 0 1 0 10h-4"/><path d="M16 7c0 3-2 3-2 6M24 7c0 3-2 3-2 6"/><path d="M12 40h20"/>',
    moon: '<path d="M28 6a17 17 0 1 0 14 26A15 15 0 0 1 28 6z"/><path d="M38 8l1.2 2.8L42 12l-2.8 1.2L38 16l-1.2-2.8L34 12l2.8-1.2z"/>',
    book: '<path d="M24 13c-4-3-10-4-16-3v25c6-1 12 0 16 3 4-3 10-4 16-3V10c-6-1-12 0-16 3z"/><path d="M24 13v25"/>',
    beam: '<path d="M6 34L24 13l18 21"/><path d="M12 27h24"/><path d="M24 13v21"/><path d="M6 34h36"/>',
    people: '<circle cx="16" cy="15" r="5"/><path d="M6 38a10 9 0 0 1 20-2"/><circle cx="33" cy="19" r="5"/><path d="M24 40a10 9 0 0 1 18-4"/>',
    pin: '<path d="M24 5a12 12 0 0 1 12 12c0 9-12 26-12 26S12 26 12 17A12 12 0 0 1 24 5z"/><circle cx="24" cy="17" r="4"/>',
    clock: '<circle cx="24" cy="24" r="17"/><path d="M24 13v11l8 5"/>',
    sparkle: '<path d="M22 6l3.5 11L37 20.5 25.5 24 22 35l-3.5-11L7 20.5 18.5 17z"/><path d="M38 30l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>',
    gift: '<path d="M8 15h32v7H8z"/><path d="M11 22h26v18H11z"/><path d="M24 15v25"/><path d="M24 15c-6-8-14-3-9 0M24 15c6-8 14-3 9 0"/>',
    drink: '<path d="M9 9h30"/><path d="M9 9l15 16 15-16"/><path d="M24 25v13"/><path d="M17 38h14"/><path d="M15 15h18"/>',
    rest: '<path d="M10 32v-8a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v8"/><path d="M6 32h36v5H6z"/><path d="M9 37v4M39 37v4"/>',
    floors: '<path d="M13 40V8h22v32"/><path d="M13 18h22M13 29h22"/><path d="M8 40h32"/><path d="M21 40v-5h6v5"/>',
    calendar: '<rect x="7" y="11" width="34" height="29" rx="3"/><path d="M7 19h34"/><path d="M15 7v8M33 7v8"/><path d="M18 30l4 4 8-9"/>',
    heart: '<path d="M24 40C11 31 7 22 13 16c4-4 9-2 11 2 2-4 7-6 11-2 6 6 2 15-11 24z"/>',
  };
  const iconSvg = (name, cls, sw) => `<svg class="${cls || ''}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="${sw || 2.6}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.sparkle}</svg>`;

  function render09a() {
    const sq = state.format === 'square';
    return `<div class="igp-layout igp9-wrap" data-layout="09a">
      <span class="igp9-clip">${iconSvg(state.icon, 'igp9-bg', 1.6)}</span>
      <div class="igp7-pad">
        <div class="igp7-tag">${H(state.icon_tag || 'ICON · 圖說')}</div>
        <h2 class="igp9-title" style="margin-top:auto;font-size:${fitSize(state.icon_title, 104, sq)}px">${br(state.icon_title)}</h2>
        ${state.icon_sub ? `<p class="igp9-sub" style="font-size:${sq ? 27 : 30}px">${H(state.icon_sub)}</p>` : '<div style="margin-bottom:auto"></div>'}
        ${foot()}
      </div>
    </div>`;
  }

  function render09b() {
    const sq = state.format === 'square';
    const items = [[state.li1_icon, state.li1_text], [state.li2_icon, state.li2_text], [state.li3_icon, state.li3_text]].filter(x => x[1]);
    return `<div class="igp-layout igp9-wrap" data-layout="09b">
      <span class="igp9-clip">${iconSvg(state.li1_icon, 'igp9-bg igp9-bg--soft', 1.6)}</span>
      <div class="igp7-pad">
        <div class="igp7-tag">${H(state.icon_tag || 'GUIDE · 圖說')}</div>
        <h2 class="igp7b-head" style="font-size:${fitSize(state.icon_heading, 92, sq)}px">${H(state.icon_heading)}</h2>
        <div style="flex:1"></div>
        <div class="igp9b-list">
          ${items.map(([ic, t]) => `<div class="igp9b-item">${iconSvg(ic, 'igp9b-ic')}<span class="igp9b-t" style="font-size:${sq ? 34 : 40}px">${H(t)}</span></div>`).join('')}
        </div>
        <div style="flex:1"></div>
        ${foot()}
      </div>
    </div>`;
  }

  function render09c() {
    const sq = state.format === 'square';
    return `<div class="igp-layout igp9-wrap" data-layout="09c">
      <span class="igp9-clip">${iconSvg(state.icon, 'igp9-bg', 1.6)}</span>
      <div class="igp7-pad">
        <div class="igp7-tag" style="color:#B7B0A2">${H(state.icon_tag || 'ICON · 圖說')}</div>
        <h2 class="igp9-title" style="margin-top:auto;font-size:${fitSize(state.icon_title, 104, sq)}px">${br(state.icon_title)}</h2>
        ${state.icon_sub ? `<p class="igp9-sub" style="font-size:${sq ? 27 : 30}px">${H(state.icon_sub)}</p>` : '<div style="margin-bottom:auto"></div>'}
        ${foot()}
      </div>
    </div>`;
  }

  /* ===== 07/08 系列（2026-08 行銷版型：Hook／條列／問答／封面／數字／檔期） ===== */
  // 字級自適應：以最長行字數縮放（配合文字長短，避免溢版與空洞）
  const fitSize = (text, base, sq) => {
    const L = Math.max(...String(text || '').split('\n').map(l => l.trim().length), 1);
    const size = L > 13 ? base * 0.62 : L > 10 ? base * 0.78 : L > 8 ? base * 0.88 : base;
    return Math.round(sq ? size * 0.86 : size);
  };
  // 03／06b 大字：允許自動折成兩行，字級由「兩行可容納的字數」反推（版面內寬 888px，襯線中文字寬≈1.05em）
  // 有手動 \n：每行各自單行放下；沒有：整段最多兩行（CSS text-wrap:balance 讓兩行等長，避免孤字）
  const fitWrap = (text, base, sq) => {
    const t = String(text || '');
    const L = Math.max(...t.split('\n').map(l => l.trim().length), 1);
    const lines = t.includes('\n') ? 1 : 2;
    const size = Math.min(base, Math.floor(888 * lines / (L * 1.05)));
    return Math.round(sq ? size * 0.86 : size);
  };
  const br = t => H(t).replace(/\n/g, '<br>');   // 大字欄位支援 \n 手動斷行

  function render07a() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="07a">
      <div class="igp7-pad">
        <div class="igp7-tag">WORDS · 一句</div>
        <h2 class="igp7a-hook" style="font-size:${fitSize(state.hook, 116, sq)}px">${br(state.hook)}</h2>
        <div class="igp7a-bar"></div>
        ${state.sub ? `<p class="igp7a-sub" style="font-size:${sq ? 27 : 30}px">${H(state.sub)}</p>` : '<div style="margin-bottom:auto"></div>'}
        ${foot()}
      </div>
    </div>`;
  }

  function render07b() {
    const sq = state.format === 'square';
    const items = [state.item1, state.item2, state.item3].filter(Boolean);
    return `<div class="igp-layout" data-layout="07b">
      <div class="igp7-pad">
        <div class="igp7-tag">GUIDE · 怎麼用</div>
        <h2 class="igp7b-head" style="font-size:${fitSize(state.heading, 92, sq)}px">${H(state.heading)}</h2>
        <div style="flex:1"></div>
        <div class="igp7b-list">
          ${items.map((t, idx) => `<div class="igp7b-item">
            <span class="igp7b-num">0${idx + 1}</span>
            <span class="igp7b-txt" style="font-size:${sq ? 34 : 40}px">${idx === 0 ? `<span class="k">${H(t)}</span>` : H(t)}</span>
          </div>`).join('')}
        </div>
        <div style="flex:1"></div>
        ${foot()}
      </div>
    </div>`;
  }

  function render07c() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="07c">
      <div class="igp7-pad">
        <div class="igp7-tag" style="color:#B7B0A2">TALK · 問與答</div>
        <h2 class="igp7c-q" style="font-size:${fitSize(state.question, 96, sq)}px">${br(state.question)}</h2>
        <div class="igp7c-lead"><span class="ln"></span><span class="lb">言文字的答案</span></div>
        <p class="igp7c-a" style="font-size:${sq ? 40 : 46}px">${H(state.answer)}</p>
        ${foot()}
      </div>
    </div>`;
  }

  function render08a() {
    const sq = state.format === 'square';
    const bg = state.photo ? `background-image:url("${state.photo}")` : '';
    return `<div class="igp-layout" data-layout="08a">
      <div class="igp8a" style='${bg}'>
        <div class="igp8a-scrim"></div>
        <div class="igp8a-copy">
          <div class="igp8a-eyebrow">${H(state.cover_eyebrow || 'ON SITE · 現場')}</div>
          <h2 class="igp8a-title" style="font-size:${fitSize(state.cover_title, 104, sq)}px">${br(state.cover_title)}</h2>
          ${foot()}
        </div>
      </div>
    </div>`;
  }

  function render08b() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="08b">
      <div class="igp7-pad">
        <div class="igp7-tag">NUMBER · 數字</div>
        <div class="igp8b-stage">
          <div class="igp8b-numwrap">
            <div class="igp8b-block"></div>
            <div class="igp8b-num" style="font-size:${sq ? 232 : 288}px">${H(state.big_number)}</div>
          </div>
          <div class="igp8b-label" style="font-size:${sq ? 40 : 46}px">${H(state.number_label)}</div>
          ${state.number_desc ? `<p class="igp8b-desc" style="font-size:${sq ? 26 : 29}px">${H(state.number_desc)}</p>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render08c() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="08c">
      <div class="igp7-pad">
        <div class="igp8c-top">Save the date</div>
        <div class="igp8c-date" style="font-size:${sq ? 192 : 238}px">${H(state.event_date)}</div>
        <div class="igp8c-rule"></div>
        <div class="igp8c-name" style="font-size:${fitSize(state.event_name, 66, sq)}px">${H(state.event_name)}</div>
        ${state.event_meta ? `<div class="igp8c-meta" style="font-size:${sq ? 24 : 27}px">${H(state.event_meta).replace(/\n/g, '<br>')}</div>` : '<div style="margin-bottom:auto"></div>'}
        ${foot()}
      </div>
    </div>`;
  }

  const LAYOUTS = {
    '01': {
      a: { label: '全幅照片 · 底部資訊', forceDark: false, render: render01a },
      b: { label: '文字主體 · 方形照片', forceDark: false, render: render01b },
      c: { label: '深色 · 框線照片', forceDark: true, render: render01c },
    },
    '02': {
      a: { label: '大日期 · 編排', forceDark: false, render: render02a },
      b: { label: '海報式 · 框線資訊', forceDark: false, render: render02b },
      c: { label: '深色海報 · 反白', forceDark: true, render: render02c },
    },
    '03': {
      a: { label: '留白 · 大字金句', forceDark: false, render: render03a },
      b: { label: '深色 · 引號金句', forceDark: true, render: render03b },
      c: { label: '照片 · 金句疊字', forceDark: false, render: render03c },
    },
    '04': {
      a: { label: '一週時間表', forceDark: false, render: render04a },
      b: { label: '日／夜 · 雙模式', forceDark: false, render: render04b },
      c: { label: '深色 · 地點交通', forceDark: true, render: render04c },
    },
    '05': {
      a: { label: '價目 · 點線引導', forceDark: false, render: render05a },
      b: { label: '分類 · 咖啡／酒', forceDark: false, render: render05b },
      c: { label: '深色 · 招牌單品', forceDark: true, render: render05c },
    },
    '06': {
      a: { label: '開幕 · 大日期', forceDark: false, render: render06a },
      b: { label: '品牌理念 · 標語', forceDark: false, render: render06b },
      c: { label: '深色 · Coming soon', forceDark: true, render: render06c },
    },
    '07': {
      a: { label: 'Hook 大字報', forceDark: false, render: render07a },
      b: { label: '編輯部條列', forceDark: false, render: render07b },
      c: { label: '深色 · 對話卡', forceDark: true, render: render07c },
    },
    '08': {
      a: { label: '雜誌封面 · 照片疊字', forceDark: false, render: render08a },
      b: { label: '數字看板', forceDark: false, render: render08b },
      c: { label: '深色 · 檔期卡', forceDark: true, render: render08c },
    },
    '09': {
      a: { label: 'Icon 主視覺 · 線條', forceDark: false, render: render09a },
      b: { label: 'Icon 條列 · 線條', forceDark: false, render: render09b },
      c: { label: '深色 · Icon 卡', forceDark: true, render: render09c },
    },
  };
  const currentLayout = () => LAYOUTS[state.category][state.variant];

  function postInner() {
    return currentLayout().render();
  }

  function postNode() {
    const { w, h } = DIMS[state.format];
    const root = document.createElement('div');
    root.className = 'igp' + (state.dark ? ' dark' : '');
    root.style.width = w + 'px'; root.style.height = h + 'px';
    const pageNo = Number(state.__total) > 1 && !(state.category === '08' && state.variant === 'a')
      ? `<div class="igp-pageno">${String(state.__page).padStart(2, '0')} ／ ${String(state.__total).padStart(2, '0')}</div>` : '';
    root.innerHTML = postInner() + pageNo;
    return root;
  }

  // ---- 程式化渲染 API（社群經營後台用） ----
  // 內容性欄位：spec 未提供時一律留白，避免示範內容外漏到正式貼文。
  const SPEC_TEXT_FIELDS = [
    'photo', 'p_eyebrow', 'p_zh', 'p_en', 'p_note', 'p_desc', 'p_unit', 'p_price', 'p_emo',
    'e_title', 'e_dateBig', 'e_weekday', 'e_when', 'e_place', 'e_desc', 'e_capacity', 'e_signup',
    'q_text', 'q_sub', 'q_by',
    'hoursRows', 'note', 'dayTitle', 'dayHours', 'dayDesc', 'nightTitle', 'nightHours', 'nightDesc',
    'menuTitle', 'menuRows', 'coffeeRows', 'alcoholRows',
    'openingLine', 'openingDate', 'openingDesc', 'manifesto', 'en', 'comingTitle', 'comingSub',
    // 07/08 系列
    'hook', 'sub', 'heading', 'item1', 'item2', 'item3', 'question', 'answer',
    'cover_title', 'cover_eyebrow', 'big_number', 'number_label', 'number_desc',
    'event_date', 'event_name', 'event_meta',
    // 09 系列
    'icon', 'icon_tag', 'icon_title', 'icon_sub', 'icon_heading',
    'li1_icon', 'li1_text', 'li2_icon', 'li2_text', 'li3_icon', 'li3_text',
  ];
  const STATE_DEFAULTS = Object.assign({}, state);

  // 以 spec（{category,variant,format,dark,hl,…欄位}）渲染單頁節點；渲染後還原編輯器狀態。
  function renderSpec(spec) {
    injectCSS();
    const s = spec || {};
    const saved = Object.assign({}, state);
    const category = LAYOUTS[s.category] ? s.category : '03';
    const variant = LAYOUTS[category][s.variant] ? s.variant : 'a';
    Object.assign(state, STATE_DEFAULTS);
    state.__page = 0; state.__total = 0;
    for (const k of SPEC_TEXT_FIELDS) state[k] = '';
    state.m_menuIds = [];
    state.p_alcohol = false;
    Object.assign(state, s, { category, variant });
    // photo 會內插進單引號 style 屬性（H() 不跳脫單引號）：僅接受 data:image/、站內 /uploads/
    // 或 https URL（MinIO 物件儲存；禁止引號與空白防注入），其餘一律清空
    if (state.photo && !/^(data:image\/|\/uploads\/|https:\/\/[^'"\s]+$)/.test(String(state.photo))) state.photo = '';
    state.format = DIMS[s.format] ? s.format : 'portrait';
    state.hl = s.hl !== false;
    state.dark = LAYOUTS[category][variant].forceDark || !!s.dark;
    try { return postNode(); }
    finally { Object.assign(state, saved); }
  }

  function listLayouts() {
    const out = [];
    for (const cat of Object.keys(LAYOUTS)) {
      for (const v of Object.keys(LAYOUTS[cat])) {
        out.push({ id: cat + v, category: cat, variant: v, label: LAYOUTS[cat][v].label, dark: LAYOUTS[cat][v].forceDark });
      }
    }
    return out;
  }

  // 以 spec 匯出 PNG；沿用 download() 的守門（字型就緒、溢出檢查、酒精警語帶高度）。
  async function exportSpecPng(spec, filename) {
    if (typeof htmlToImage === 'undefined') throw new Error('匯出元件未載入');
    const fmt = spec && DIMS[spec.format] ? spec.format : 'portrait';
    const { w, h } = DIMS[fmt];
    const node = renderSpec(spec);
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;';
    holder.appendChild(node);
    document.body.appendChild(holder);
    try {
      const band = node.querySelector('.igp-alcohol');
      if (spec && spec.p_alcohol && !band) throw new Error('酒精飲品缺少法定警語，已阻止匯出');
      if (band && band.getBoundingClientRect().height + 0.5 < h * 0.1) throw new Error('酒精飲品缺少法定警語，已阻止匯出');
      await document.fonts.ready;
      const overflow = [node, ...node.querySelectorAll('.igp-body,.igp-quote,.igp-overlay-copy,.igp-layout')]
        .some(el => Lib.contentOverflows(el.scrollHeight, el.clientHeight, el.scrollWidth, el.clientWidth));
      if (overflow) throw new Error('內容超出版面，請縮短文字或移除照片');
      const url = await htmlToImage.toPng(node, { width: w, height: h, pixelRatio: 1, skipFonts: true });
      const a = document.createElement('a');
      a.href = url; a.download = filename || Lib.buildDownloadName('貼文', fmt); a.click();
      return url;
    } finally { holder.remove(); }
  }

  // ---- 表單 ----
  const F = {
    product: () => `
      <p class="ig-hint">菜單價格尚未核定，僅供內部預覽，勿直接對外發布。</p>
      <label>從菜單帶入
        <select data-menu>${['<option value="">— 手動輸入 —</option>']
          .concat(MENU().map(m => `<option value="${H(m.id)}" ${m.id === state.p_menuId ? 'selected' : ''}>${H(m.cat)}｜${H(m.zh)} $${H(m.price)}${m.published ? '' : '（未發布）'}${m.alcohol ? '　🔞' : ''}</option>`)).join('')}</select></label>
      <label>小標<input data-k="p_eyebrow" value="${H(state.p_eyebrow)}"></label>
      <label>品名（中）<input data-k="p_zh" value="${H(state.p_zh)}"></label>
      <label>品名（英）<input data-k="p_en" value="${H(state.p_en)}"></label>
      <label>備註 / 口味<input data-k="p_note" value="${H(state.p_note)}" placeholder="例：黑糖 / 焦糖"></label>
      <label>說明<textarea data-k="p_desc">${H(state.p_desc)}</textarea></label>
      <div class="ig-seg" style="gap:12px">
        <label style="flex:1">單位<input data-k="p_unit" value="${H(state.p_unit)}"></label>
        <label style="flex:1">原價<input data-k="p_price" type="number" value="${H(state.p_price)}"></label>
        <label style="flex:1">會員價<input data-k="p_emo" type="number" value="${H(state.p_emo)}"></label>
      </div>
      <label style="flex-direction:row;align-items:center;gap:.4em"><input type="checkbox" data-k="p_alcohol" ${state.p_alcohol ? 'checked' : ''}> 含酒精（人工標記，匯出將自動附加警語）</label>
      ${state.p_alcohol ? '<p class="ig-hint ig-hint--warn">已標記酒精飲品：匯出將自動附加法定警語，且無法在缺少警語時匯出。</p>' : ''}`,
    event: () => `
      <label>活動標題<input data-k="e_title" value="${H(state.e_title)}"></label>
      <div class="ig-seg" style="gap:12px">
        <label style="flex:1">大日期<input data-k="e_dateBig" value="${H(state.e_dateBig)}" placeholder="例：08.09"></label>
        <label style="flex:1">星期<input data-k="e_weekday" value="${H(state.e_weekday)}" placeholder="例：SAT · 週六"></label>
      </div>
      <label>時間<input data-k="e_when" value="${H(state.e_when)}" placeholder="例：19:00 – 21:30"></label>
      <label>地點<input data-k="e_place" value="${H(state.e_place)}"></label>
      <label>說明<textarea data-k="e_desc">${H(state.e_desc)}</textarea></label>
      <div class="ig-seg" style="gap:12px">
        <label style="flex:1">名額<input data-k="e_capacity" value="${H(state.e_capacity)}"></label>
        <label style="flex:1">報名<input data-k="e_signup" value="${H(state.e_signup)}"></label>
      </div>`,
    quote: () => `
      <label>主文（金句）<textarea data-k="q_text">${H(state.q_text)}</textarea></label>
      <label>副題<input data-k="q_sub" value="${H(state.q_sub)}"></label>
      <label>署名<input data-k="q_by" value="${H(state.q_by)}"></label>`,
    hours: () => `
      <label>營業列（一行一列，欄位以 ｜ 或 | 分隔：星期｜時間）
        <textarea data-k="hoursRows">${H(state.hoursRows)}</textarea></label>
      <label>備註<textarea data-k="note">${H(state.note)}</textarea></label>
      <p class="ig-hint">4B 日／夜雙模式欄位</p>
      <label>日間標題<input data-k="dayTitle" value="${H(state.dayTitle)}"></label>
      <label>日間時間<input data-k="dayHours" value="${H(state.dayHours)}"></label>
      <label>日間說明<textarea data-k="dayDesc">${H(state.dayDesc)}</textarea></label>
      <label>夜間標題<input data-k="nightTitle" value="${H(state.nightTitle)}"></label>
      <label>夜間時間<input data-k="nightHours" value="${H(state.nightHours)}"></label>
      <label>夜間說明<textarea data-k="nightDesc">${H(state.nightDesc)}</textarea></label>
      <p class="ig-hint">4C 地點交通欄位</p>
      <label>地址<input data-k="address" value="${H(state.address)}"></label>
      <label>捷運<input data-k="mrt" value="${H(state.mrt)}"></label>
      <label>訂位<input data-k="booking" value="${H(state.booking)}"></label>`,
    menu: () => `
      <p class="ig-hint">菜單價格尚未核定，僅供內部預覽，勿直接對外發布。</p>
      <label>從菜單多選（5A）
        <select data-menu-multi multiple size="6">${MENU().map(m =>
          `<option value="${H(m.id)}" ${state.m_menuIds.includes(m.id) ? 'selected' : ''}>${H(m.cat)}｜${H(m.zh)} $${H(m.price)}${m.published ? '' : '（未發布）'}${m.alcohol ? '　🔞' : ''}</option>`
        ).join('')}</select></label>
      <label>菜單標題<input data-k="menuTitle" value="${H(state.menuTitle)}"></label>
      <label>手動品項列（一行一列，欄位以 ｜ 或 | 分隔：品名｜價格）
        <textarea data-k="menuRows">${H(state.menuRows)}</textarea></label>
      <label>咖啡列（5B）
        <textarea data-k="coffeeRows">${H(state.coffeeRows)}</textarea></label>
      <label>酒類列（5B，有內容將觸發警語）
        <textarea data-k="alcoholRows">${H(state.alcoholRows)}</textarea></label>
      <p class="ig-hint">5C 招牌單品欄位</p>
      <label>品名（中）<input data-k="p_zh" value="${H(state.p_zh)}"></label>
      <label>品名（英）<input data-k="p_en" value="${H(state.p_en)}"></label>
      <label>原價<input data-k="p_price" type="number" value="${H(state.p_price)}"></label>
      <label style="flex-direction:row;align-items:center;gap:.4em"><input type="checkbox" data-k="p_alcohol" ${state.p_alcohol ? 'checked' : ''}> 含酒精（5C 招牌，匯出將自動附加警語）</label>
      ${state.p_alcohol ? '<p class="ig-hint ig-hint--warn">已標記酒精飲品：匯出將自動附加法定警語，且無法在缺少警語時匯出。</p>' : ''}`,
    brand: () => `
      <label>開幕主句（6A）<textarea data-k="openingLine">${H(state.openingLine)}</textarea></label>
      <label>開幕日期<input data-k="openingDate" value="${H(state.openingDate)}"></label>
      <label>開幕說明<textarea data-k="openingDesc">${H(state.openingDesc)}</textarea></label>
      <label>品牌理念（6B，可換行）<textarea data-k="manifesto">${H(state.manifesto)}</textarea></label>
      <label>英文標語<input data-k="en" value="${H(state.en)}"></label>
      <label>Coming 主標（6C）<textarea data-k="comingTitle">${H(state.comingTitle)}</textarea></label>
      <label>Coming 副標<textarea data-k="comingSub">${H(state.comingSub)}</textarea></label>`,
  };

  let root, stage, downloading = false;

  function loadMenuItem(id) {
    const m = MENU().find(m => m.id === id);
    state.p_menuId = m ? m.id : '';
    state.p_alcohol = Lib.itemNeedsAlcoholBand(m);
    if (m) Object.assign(state, { p_zh: m.zh, p_en: m.en, p_note: m.note || '', p_price: m.price, p_emo: m.emo });
  }

  function refreshMenu() {
    if (state.p_menuId) loadMenuItem(state.p_menuId);
    state.m_menuIds = state.m_menuIds.filter(id => MENU().some(m => m.id === id));
    if (!root) return;
    const type = currentTypeKey();
    if (type === 'product' || type === 'menu') { renderForm(); renderPreview(); }
  }
  window.addEventListener('tth:menu-data', refreshMenu);

  function renderForm() {
    const box = root.querySelector('#ig-fields');
    box.innerHTML = F[currentTypeKey()]();
    // 值變更 → 只更新預覽（不重繪表單，保留游標）
    box.querySelectorAll('input[data-k]:not([type="checkbox"]), textarea[data-k]').forEach(inp => inp.addEventListener('input', e => {
      const k = e.target.dataset.k;
      state[k] = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
      renderPreview();
    }));
    box.querySelectorAll('input[data-k][type="checkbox"]').forEach(cb => cb.addEventListener('change', e => {
      state[e.target.dataset.k] = e.target.checked;
      renderForm(); renderPreview();
    }));
    const menu = box.querySelector('[data-menu]');
    if (menu) menu.addEventListener('change', e => {
      loadMenuItem(e.target.value);
      renderForm(); renderPreview();
    });
    const menuMulti = box.querySelector('[data-menu-multi]');
    if (menuMulti) menuMulti.addEventListener('change', e => {
      state.m_menuIds = [...e.target.selectedOptions].map(o => o.value);
      renderPreview();
    });
  }

  function sizeStage() {
    if (!stage) return;
    const parent = stage.parentElement;
    const { w, h } = DIMS[state.format];
    const scale = Lib.computePreviewScale(parent ? parent.clientWidth : 0, w);
    if (scale == null) return;
    if (!(scale > 0) || !isFinite(scale)) return;
    stage.style.width = w * scale + 'px';
    stage.style.height = h * scale + 'px';
    const node = stage.firstElementChild;
    if (node) {
      node.style.width = w + 'px';
      node.style.height = h + 'px';
      node.style.transformOrigin = 'top left';
      node.style.transform = `scale(${scale})`;
    }
  }

  function renderPreview() {
    stage.innerHTML = '';
    stage.appendChild(postNode());
    sizeStage();
  }

  async function download() {
    const btn = root.querySelector('#ig-dl');
    if (!btn || btn.disabled || downloading) return;
    if (typeof htmlToImage === 'undefined') return toast('匯出元件未載入');

    const needsAlcohol = currentNeedsAlcohol();
    const { w, h } = DIMS[state.format];
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;';
    const node = postNode();
    holder.appendChild(node);
    document.body.appendChild(holder);

    if (needsAlcohol) {
      const band = node.querySelector('.igp-alcohol');
      const minH = h * 0.1;
      if (!band || band.getBoundingClientRect().height + 0.5 < minH) {
        holder.remove();
        toast('酒精飲品缺少法定警語，已阻止匯出');
        return;
      }
    }

    const typeKey = currentTypeKey();
    const title = typeKey === 'product' ? state.p_zh
      : typeKey === 'event' ? state.e_title
      : typeKey === 'quote' ? '金句'
      : typeKey === 'hours' ? '營業時間'
      : typeKey === 'menu' ? (state.menuTitle || '菜單')
      : (state.openingLine || '品牌');
    const prevText = btn.textContent;
    downloading = true;
    btn.disabled = true;
    btn.textContent = '匯出中…';
    try {
      await document.fonts.ready;
      const overflow = [node, ...node.querySelectorAll('.igp-body,.igp-quote,.igp-overlay-copy,.igp-layout')]
        .some(el => Lib.contentOverflows(el.scrollHeight, el.clientHeight, el.scrollWidth, el.clientWidth));
      if (overflow) {
        toast('內容超出版面，請縮短文字或移除照片');
        return;
      }
      // ponytail: skipFonts —— 不內嵌 CJK 字型（Noto Serif/Sans TC 各數 MB，內嵌會掛住 45s+）。
      // 匯出時瀏覽器以已載入／系統字型繪製；升級路徑：要保證跨機明體保真，改自架 woff2 subset 傳入 fontEmbedCSS。
      const url = await htmlToImage.toPng(node, { width: w, height: h, pixelRatio: 1, skipFonts: true });
      const a = document.createElement('a');
      a.href = url; a.download = Lib.buildDownloadName(title, state.format); a.click();
      toast('已下載 PNG');
    } catch (e) { toast('匯出失敗：' + e.message); }
    finally {
      downloading = false;
      btn.disabled = false;
      btn.textContent = prevText;
      holder.remove();
    }
  }

  function readPhoto(file) {
    if (!file) return;
    if (!Lib.isAllowedPhotoType(file.type)) return toast('僅支援 JPEG／PNG／WebP 格式');
    if (file.size > Lib.PHOTO_MAX_BYTES) return toast('照片請小於 5MB');
    const r = new FileReader();
    r.onerror = r.onabort = () => toast('照片讀取失敗');
    r.onload = () => { state.photo = r.result; root.querySelector('#ig-drop').classList.add('has'); root.querySelector('#ig-drop-t').textContent = '已選照片 · 點此更換'; renderPreview(); };
    r.readAsDataURL(file);
  }

  function syncLayoutControls() {
    if (currentLayout().forceDark) state.dark = true;
    root.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('on', b.dataset.category === state.category));
    root.querySelectorAll('[data-variant]').forEach(b => {
      b.classList.toggle('on', b.dataset.variant === state.variant);
      b.textContent = `${b.dataset.variant.toUpperCase()} · ${LAYOUTS[state.category][b.dataset.variant].label}`;
    });
    const dark = root.querySelector('[data-t="dark"]');
    dark.checked = state.dark;
    dark.disabled = currentLayout().forceDark;
  }

  function shell() {
    return `<div class="ig-wrap">
        <div class="ig-form">
        <div class="ig-seg" id="ig-type">
          <button data-category="01" class="${currentTypeKey() === 'product' ? 'on' : ''}">01 單品／價目</button>
          <button data-category="02" class="${currentTypeKey() === 'event' ? 'on' : ''}">02 活動預告</button>
          <button data-category="03" class="${currentTypeKey() === 'quote' ? 'on' : ''}">03 金句／字</button>
          <button data-category="04" class="${currentTypeKey() === 'hours' ? 'on' : ''}">04 營業資訊</button>
          <button data-category="05" class="${currentTypeKey() === 'menu' ? 'on' : ''}">05 菜單</button>
          <button data-category="06" class="${currentTypeKey() === 'brand' ? 'on' : ''}">06 品牌／開幕</button>
        </div>
        <div class="ig-seg" id="ig-variant">
          <button data-variant="a" class="${state.variant === 'a' ? 'on' : ''}">A · ${H(LAYOUTS[state.category].a.label)}</button>
          <button data-variant="b" class="${state.variant === 'b' ? 'on' : ''}">B · ${H(LAYOUTS[state.category].b.label)}</button>
          <button data-variant="c" class="${state.variant === 'c' ? 'on' : ''}">C · ${H(LAYOUTS[state.category].c.label)}</button>
        </div>
        <div class="ig-seg" id="ig-format">
          <button data-fmt="portrait" class="${state.format === 'portrait' ? 'on' : ''}">直式 1080×1350</button>
          <button data-fmt="square" class="${state.format === 'square' ? 'on' : ''}">方形 1080×1080</button>
        </div>
        <div class="ig-toggles">
          <label><input type="checkbox" data-t="dark"${state.dark ? ' checked' : ''}${currentLayout().forceDark ? ' disabled' : ''}> 暗底</label>
          <label><input type="checkbox" data-t="showEn"${state.showEn ? ' checked' : ''}> 顯示英文</label>
          <label><input type="checkbox" data-t="showMember"${state.showMember ? ' checked' : ''}> 顯示會員價</label>
          <label><input type="checkbox" data-t="hl"${state.hl ? ' checked' : ''}> 標題重點</label>
        </div>
        <div id="ig-fields"></div>
        <div class="ig-drop" id="ig-drop"><span id="ig-drop-t">上傳照片 · 點此或拖曳</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" id="ig-file" hidden></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <label style="flex:1;margin:0">IG 帳號<input data-k2="handle" value="${H(state.handle)}"></label>
          <label style="flex:1;margin:0">地點<input data-k2="place" value="${H(state.place)}"></label>
        </div>
      </div>
      <div class="ig-previewbox">
        <div class="ig-stage-wrap"><div class="ig-stage" id="ig-stage"></div></div>
        <div class="ig-actions">
          <button class="btn btn--solid btn-sm" id="ig-dl">下載 PNG</button>
        </div>
        <p id="ig-cap" style="color:var(--muted);font-size:.8rem;margin:0">預覽為縮小顯示，下載為實際 ${DIMS[state.format].w}×${DIMS[state.format].h} 像素。</p>
      </div>
    </div>`;
  }

  function mount(host) {
    injectCSS();
    root = host;
    host.innerHTML = shell();
    stage = host.querySelector('#ig-stage');

    host.querySelectorAll('[data-category]').forEach(b => b.onclick = () => {
      state.category = b.dataset.category;
      syncLayoutControls();
      renderForm(); renderPreview();
    });
    host.querySelectorAll('[data-variant]').forEach(b => b.onclick = () => {
      state.variant = b.dataset.variant;
      syncLayoutControls();
      renderForm(); renderPreview();
    });
    host.querySelectorAll('#ig-format button').forEach(b => b.onclick = () => {
      state.format = b.dataset.fmt;
      host.querySelectorAll('#ig-format button').forEach(x => x.classList.toggle('on', x === b));
      host.querySelector('#ig-cap').textContent = `預覽為縮小顯示，下載為實際 ${DIMS[state.format].w}×${DIMS[state.format].h} 像素。`;
      renderPreview();
    });
    host.querySelectorAll('[data-t]').forEach(c => c.onchange = e => {
      state[e.target.dataset.t] = e.target.checked;
      renderPreview();
    });
    host.querySelectorAll('[data-k2]').forEach(inp => inp.oninput = e => { state[e.target.dataset.k2] = e.target.value; renderPreview(); });

    const drop = host.querySelector('#ig-drop'), file = host.querySelector('#ig-file');
    drop.onclick = () => file.click();
    file.onchange = e => readPhoto(e.target.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); readPhoto(e.dataTransfer.files[0]); };

    host.querySelector('#ig-dl').onclick = download;

    syncLayoutControls(); renderForm(); renderPreview();
    if (!mount._resize) { mount._resize = true; window.addEventListener('resize', () => stage && sizeStage()); }
  }

  window.IGStudio = { mount, resize: sizeStage, renderSpec, listLayouts, exportSpecPng };
})();
