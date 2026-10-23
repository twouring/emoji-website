// ponytail: 原生 API，零相依。導覽列（滾動陰影＋手機選單）已移至共用 nav.js。
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:0, rootMargin:'0px 0px 22% 0px'});
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  // 備援：有 JS 但沒捲動（全頁截圖、連結預覽、慢網、觀察器失效）時，1.5 秒後把還沒進場的區塊全部顯示，避免整頁留白
  const revealAll = () => document.querySelectorAll('.reveal:not(.in)').forEach(el => el.classList.add('in'));
  setTimeout(revealAll, 1500);
  addEventListener('load', () => setTimeout(revealAll, 300));
