/* 點歌快速選：歌手、歌曲用點的（客人端 order.html 與 POS pos-songs.js 共用）。
 * 點了就把關鍵字帶進搜尋框並搜 YouTube；伺服器同關鍵字快取 30 分鐘，固定字串常會命中快取、不重扣額度。
 * 新增歌手或歌曲直接改下面清單；歌曲格式 [歌名, 歌手]。 */
(function (root) {
  var ARTISTS = [
    ['m', ['周杰倫', '林俊傑', '陳奕迅', '李榮浩', '周興哲', '韋禮安', '盧廣仲', '蕭敬騰', '林宥嘉', '張學友', '王力宏', '陶喆']],
    ['f', ['蔡依林', '田馥甄', '鄧紫棋', '張惠妹', '孫燕姿', '梁靜茹', '楊丞琳', 'A-Lin', '徐佳瑩', '王心凌', '艾怡良', '莫文蔚']],
    ['band', ['五月天', '告五人', '蘇打綠', '動力火車', '八三夭', '草東沒有派對', '落日飛車', '美秀集團', '理想混蛋', '麋先生']],
    ['taigi', ['伍佰', '江蕙', '茄子蛋', '陳雷', '蕭煌奇', '黃乙玲', '施文彬', '葉啟田']],
    ['jk', ['YOASOBI', '米津玄師', 'Official髭男dism', 'Aimer', 'BTS', 'BLACKPINK', 'IU', 'TWICE', 'NewJeans', 'aespa']],
    ['west', ['Taylor Swift', 'Ed Sheeran', 'Bruno Mars', 'Coldplay', 'Adele', 'Maroon 5', 'Billie Eilish', 'Justin Bieber', 'Queen', 'The Weeknd']]
  ];
  var SONGS = [
    ['ktv', [['小幸運', '田馥甄'], ['告白氣球', '周杰倫'], ['晴天', '周杰倫'], ['稻香', '周杰倫'], ['倔強', '五月天'], ['突然好想你', '五月天'], ['修煉愛情', '林俊傑'], ['江南', '林俊傑'], ['十年', '陳奕迅'], ['光年之外', '鄧紫棋'], ['日不落', '蔡依林'], ['愛你', '王心凌'], ['好不容易', '告五人'], ['披星戴月的想你', '告五人'], ['那些年', '胡夏'], ['慢慢喜歡你', '莫文蔚']]],
    ['duet', [['屋頂', '周杰倫 溫嵐'], ['小酒窩', '林俊傑 蔡卓妍'], ['今天你要嫁給我', '陶喆 蔡依林'], ['廣島之戀', '莫文蔚 張洪量'], ['因為愛情', '陳奕迅 王菲'], ['不得不愛', '潘瑋柏 弦子']]],
    ['taigi', [['浪子回頭', '茄子蛋'], ['浪流連', '茄子蛋'], ['你是我的花朵', '伍佰'], ['家後', '江蕙'], ['酒後的心聲', '江蕙'], ['愛拼才會贏', '葉啟田'], ['舊情綿綿', '洪一峰'], ['世界第一等', '劉德華']]],
    ['foreign', [['APT.', 'ROSÉ Bruno Mars'], ['Shape of You', 'Ed Sheeran'], ['Perfect', 'Ed Sheeran'], ['Uptown Funk', 'Bruno Mars'], ['Someone Like You', 'Adele'], ['Bohemian Rhapsody', 'Queen'], ['Dynamite', 'BTS'], ['Lemon', '米津玄師'], ['夜に駆ける', 'YOASOBI']]]
  ];
  var L = {
    zh: { artist: '選歌手', song: '選歌', m: '華語男歌手', f: '華語女歌手', band: '樂團／團體', taigi: '台語', jk: '日韓', west: '西洋', ktv: 'KTV 必點', duet: '對唱', foreign: '外文歌', back: '‹ 回到選歌手／選歌', hint: '點一下就幫你搜尋，也可以直接打字。' },
    en: { artist: 'Artists', song: 'Songs', m: 'Mandopop (male)', f: 'Mandopop (female)', band: 'Bands', taigi: 'Taiwanese', jk: 'J-pop / K-pop', west: 'Western', ktv: 'KTV favorites', duet: 'Duets', foreign: 'English & more', back: '‹ Back to quick picks', hint: 'Tap to search, or type above.' },
    ja: { artist: '歌手から', song: '曲から', m: '華語・男性', f: '華語・女性', band: 'バンド／グループ', taigi: '台湾語', jk: 'J-POP／K-POP', west: '洋楽', ktv: 'カラオケ定番', duet: 'デュエット', foreign: '外国語の曲', back: '‹ クイック選択に戻る', hint: 'タップで検索、または入力してください。' }
  };
  function t(lang, k) { return (L[lang] || L.zh)[k] || L.zh[k]; }
  function find(list, g) { for (var i = 0; i < list.length; i++) if (list[i][0] === g) return list[i]; return list[0]; }
  /* st = { mode:'artist'|'song', group } ；回傳 HTML，按鈕用 data-pick-mode／data-pick-group／data-pick-q */
  function html(st, lang, esc) {
    var mode = st.mode === 'song' ? 'song' : 'artist', groups = mode === 'song' ? SONGS : ARTISTS, cur = find(groups, st.group);
    var seg = ['artist', 'song'].map(function (m) { return '<button type="button" aria-pressed="' + (m === mode) + '" data-pick-mode="' + m + '">' + esc(t(lang, m)) + '</button>'; }).join('');
    var tabs = groups.map(function (g) { return '<button type="button" aria-pressed="' + (g[0] === cur[0]) + '" data-pick-group="' + g[0] + '">' + esc(t(lang, g[0])) + '</button>'; }).join('');
    var chips = cur[1].map(function (x) {
      return mode === 'song'
        ? '<button type="button" class="pick-song" data-pick-q="' + esc(x[0] + ' ' + x[1]) + '"><b>' + esc(x[0]) + '</b><small>' + esc(x[1]) + '</small></button>'
        : '<button type="button" data-pick-q="' + esc(x) + '">' + esc(x) + '</button>';
    }).join('');
    return '<div class="song-picks"><div class="pick-seg">' + seg + '</div><div class="pick-groups">' + tabs + '</div><div class="pick-chips' + (mode === 'song' ? ' is-song' : '') + '">' + chips + '</div><p class="pick-hint">' + esc(t(lang, 'hint')) + '</p></div>';
  }
  function back(lang, esc) { return '<button type="button" class="pick-back" data-pick-back>' + esc(t(lang, 'back')) + '</button>'; }
  /* 點擊處理：回傳 {q} 代表要搜尋、{back:true} 回快速選、true 代表只改了分組要重畫、null 代表不是快速選按鈕 */
  function click(target, st) {
    var b = target.closest && target.closest('[data-pick-mode],[data-pick-group],[data-pick-q],[data-pick-back]'); if (!b) return null;
    if (b.hasAttribute('data-pick-back')) return { back: true };
    if (b.dataset.pickQ) return { q: b.dataset.pickQ };
    if (b.dataset.pickMode) { if (st.mode !== b.dataset.pickMode) { st.mode = b.dataset.pickMode; st.group = ''; } return true; }
    st.group = b.dataset.pickGroup; return true;
  }
  root.SongPicks = { ARTISTS: ARTISTS, SONGS: SONGS, html: html, back: back, click: click };
})(typeof window !== 'undefined' ? window : globalThis);
