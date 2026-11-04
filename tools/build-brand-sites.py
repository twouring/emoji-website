#!/usr/bin/env python3
"""產生子品牌獨立站 public/brand-sites/{,en/,ja/}{at-cafe,3am,stay-square,rest-book}.html（三語）。
網域：atcafe.emoji.tw／3am.emoji.tw／staysquare.emoji.tw／restbook.emoji.tw（server.js BRAND_HOSTS 依 host 分流）；
語系路徑：中文 /、英文 /en、日文 /ja。
原則（KK 2026-11-03）：每站只完整介紹自己的品牌，不放姊妹品牌區塊、不互導；母品牌只在頁尾法律行出現一次（CIS：母品牌至少出現一次）。
識別依 cis.emoji.tw/brands；菜單（data-menu）與空間文案（data-md／data-image）由 lib/public-render.renderSpace 依語系伺服器端填入。
英日文案以 www.emoji.tw 的 /en、/ja 子品牌頁與 cis.emoji.tw 的詞彙為準（Hub rate／ハブ価格、late-night diner & bistro…）。
改內容改這支再重跑：python3 tools/build-brand-sites.py"""
import html, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'brand-sites'
footer = (ROOT / 'views/partials/footer-zh.html').read_text(encoding='utf-8')
TEL = re.search(r'href="(tel:[^"]+)">([^<]+)<', footer)
assert TEL, 'footer-zh.html 找不到電話'
TEL_HREF, TEL_TEXT = TEL.group(1), TEL.group(2)

WWW = 'https://www.emoji.tw'
APP = 'https://app.emoji.tw/'
MAP = 'https://maps.app.goo.gl/aFdoEB3RhweCqLbQ9'
LANGS = ['zh', 'en', 'ja']
HTML_LANG = {'zh': 'zh-Hant', 'en': 'en', 'ja': 'ja'}
OG_LOCALE = {'zh': 'zh_TW', 'en': 'en_US', 'ja': 'ja_JP'}
PARENT = {'zh': '言文字｜台灣人才聚落', 'en': 'emoji — Taiwan Talent Hub', 'ja': '言文字｜台湾タレントハブ'}
COMPANY = {'zh': '言文字股份有限公司 統一編號 93537055', 'en': 'emoji Co., Ltd. · Tax ID 93537055', 'ja': '言文字股份有限公司 統一番号 93537055'}
ADDRESS = {'zh': '台北市中正區重慶南路一段 11 號', 'en': 'No. 11, Sec. 1, Chongqing S. Rd., Zhongzheng Dist., Taipei', 'ja': '台北市中正区重慶南路一段11号'}
MAP_HL = {'zh': 'zh-TW', 'en': 'en', 'ja': 'ja'}
LANG_NAME = {'zh': '中文', 'en': 'English', 'ja': '日本語'}

BRANDS = {
    'at-cafe': dict(host='atcafe.emoji.tw', zh='在咖啡', en='at cafe', color='#984C37', ig='emoji.atcafe',
                    alt={'zh': '在咖啡 at cafe 標誌', 'en': 'at cafe logo', 'ja': '在咖啡 at cafe ロゴ'}, venue='CAFE', schema='CafeOrCoffeeShop'),
    '3am': dict(host='3am.emoji.tw', zh='三點水', en='3AM', color='#6B8FAB', ig='emoji.3am',
                alt={'zh': '三點水 3AM Bistro 標誌', 'en': '3AM Bistro logo', 'ja': '三點水 3AM Bistro ロゴ'}, venue='BAR', schema='BarOrPub'),
    'stay-square': dict(host='staysquare.emoji.tw', zh='等等空間', en='Stay Square', color='#2B4064', ig='emoji.staysquare',
                        alt={'zh': '等等空間 Stay Square 標誌', 'en': 'Stay Square logo', 'ja': '等等空間 Stay Square ロゴ'}, venue=None, schema=None),
    # 2026-11-04 KK：2F 自等等空間分出；會員方案不含；日文同中文；IG 帳號未定（ig=None 不顯示）；標誌為暫用文字標誌（tools/build-rest-book-logo.py）
    'rest-book': dict(host='restbook.emoji.tw', zh='約書旅', en='Rest Book', color='#5A4632', ig=None,
                      alt={'zh': '約書旅 Rest Book 標誌', 'en': 'Rest Book logo', 'ja': '約書旅 Rest Book ロゴ'}, venue=None, schema=None),
}
e = html.escape
L = 'zh'  # 目前產生中的語系（build() 設定）


def t(zh, en, ja):
    return {'zh': zh, 'en': en, 'ja': ja}[L]


def www(path):
    """官網連結依語系加前綴（/reserve → /en/reserve）。"""
    return WWW + ('' if L == 'zh' else '/' + L) + path


def app_url():
    return APP if L == 'zh' else APP + '?lang=' + L


def page_url(host, lang):
    return f'https://{host}/' + ('' if lang == 'zh' else lang)


def lang_switch(host, cls=''):
    links = ''.join(
        f'<a href="{page_url(host, l)}" hreflang="{HTML_LANG[l]}" lang="{HTML_LANG[l]}"{" aria-current=\"page\"" if l == L else ""}>{LANG_NAME[l]}</a>'
        for l in LANGS)
    return f'<nav class="lang-switch bs-lang{cls}" aria-label="{t("語言", "Language", "言語を切り替え")}">{links}</nav>'


def sec_h2(hid, zh, en, ja):
    """區塊標題：主標＋拉丁副標；英文頁不重複。"""
    sub = '' if L == 'en' else f'<span class="en">{e(en)}</span>'
    return f'<h2 id="{hid}">{e(t(zh, en, ja))}{sub}</h2>'


FONTS_DEFAULT = 'family=Cormorant+Garamond:wght@500;600&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@500;700'
# 在咖啡：標題與內文同一家無襯線（Noto Sans TC），拉丁數字 Outfit
FONTS_CAFE = 'family=Noto+Sans+TC:wght@400;500;700&family=Outfit:wght@400;500;600'


def head(slug, title, desc):
    b = BRANDS[slug]
    url = page_url(b['host'], L)
    root = f"https://{b['host']}/"
    cafe = slug == 'at-cafe'
    extra_css = {'3am': '\n<link rel="stylesheet" href="/brand-sites/3am-dark-room.css">',
                 'rest-book': '\n<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">\n<link rel="stylesheet" href="/brand-sites/rest-book.css">'}.get(slug, '')
    if cafe:  # 在咖啡專用樣式＋首圖預載＋js 旗標（捲動淡入）
        extra_css = ('\n<link rel="stylesheet" href="/brand-sites/at-cafe.css">'
                     '\n<link rel="preload" as="image" href="/brand-sites/assets/atcafe/matcha-800.webp" '
                     'imagesrcset="/brand-sites/assets/atcafe/matcha-800.webp 643w, /brand-sites/assets/atcafe/matcha-1400.webp 1125w" imagesizes="(max-width: 760px) 100vw, 44vw">'
                     '\n<script>document.documentElement.classList.add("js")</script>')
    fonts = FONTS_CAFE if cafe else FONTS_DEFAULT
    og_img = 'brand-sites/assets/atcafe/matcha-1400.webp' if cafe else f'brand-sites/assets/{slug}-avatar.webp'
    ld = ''
    if b['schema']:
        ld = ('<script type="application/ld+json">{"@context":"https://schema.org","@type":"%s","name":"%s %s",'
              '"url":"%s","image":"%sbrand-sites/assets/%s-logo.webp","telephone":"%s","sameAs":["https://www.instagram.com/%s"],'
              '"address":{"@type":"PostalAddress","streetAddress":"%s","addressLocality":"%s","addressCountry":"TW"},'
              '"parentOrganization":{"@type":"Organization","name":"%s","url":"%s/"}}</script>\n'
              % (b['schema'], b['zh'], b['en'], root, root, slug, TEL_HREF[4:], b['ig'], ADDRESS[L], t('台北市', 'Taipei', '台北市'), PARENT[L], WWW))
    alts = ''.join(f'<link rel="alternate" hreflang="{HTML_LANG[l]}" href="{page_url(b["host"], l)}">\n' for l in LANGS)
    alts += f'<link rel="alternate" hreflang="x-default" href="{root}">\n'
    return f'''<!DOCTYPE html>
<html lang="{HTML_LANG[L]}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="{b['color']}">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
{alts}<link rel="icon" href="/brand-sites/assets/{slug}-avatar.webp" type="image/webp">
<link rel="apple-touch-icon" href="/brand-sites/assets/{slug}-avatar.webp">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{b['zh']} {b['en']}">
<meta property="og:locale" content="{OG_LOCALE[L]}">
<meta property="og:image" content="{root}{og_img}">
<meta name="twitter:card" content="{'summary_large_image' if cafe else 'summary'}">
{ld}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?{fonts}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/space-dir.css">
<link rel="stylesheet" href="/brand-sites/brand.css">{extra_css}
</head>
<body class="bs bs--{slug}">
<a href="#content" class="skip-link">{t('跳至主要內容', 'Skip to main content', '本文へスキップ')}</a>
'''


def header(slug, nav):
    b = BRANDS[slug]
    links = ''.join(f'<a href="{h}">{x}</a>' for x, h in nav[:-1])
    x, h = nav[-1]
    home = t(f'{b["zh"]} {b["en"]} 首頁', f'{b["en"]} home', f'{b["zh"]} {b["en"]} ホーム')
    return f'''<header class="bs-head"><div class="wrap bs-head__in">
  <a class="bs-head__logo" href="{page_url(b['host'], L)}" aria-label="{e(home)}"><img src="/brand-sites/assets/{slug}-logo-h.webp" alt="{e(b['alt'][L])}" decoding="async"></a>
  <nav class="bs-head__nav" aria-label="{t('主選單', 'Main navigation', 'メインナビゲーション')}">{links}<a class="bs-btn" href="{h}">{x}</a></nav>
  {lang_switch(b['host'])}
</div></header>
'''


def visit(hours_rows, slug):
    rows = ''.join(f'<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>' for k, v in hours_rows)
    b = BRANDS[slug]
    ig_row = f'<div><dt>Instagram</dt><dd><a href="https://www.instagram.com/{b["ig"]}" target="_blank" rel="noopener">@{b["ig"]}</a></dd></div>' if b['ig'] else ''
    near = t('台北車站站前地下街 Z10 出口斜對面', 'Diagonally across from Exit Z10, Taipei Main Station underground mall', '台北駅地下街 Z10 出口の斜め向かい')
    small = t('台北車站站前地下街 Z10 出口斜對面；捷運、台鐵、高鐵都在步行範圍內。',
              'Diagonally across from Exit Z10 of the Taipei Main Station underground mall; MRT, TRA and HSR are all within walking distance.',
              '台北駅地下街 Z10 出口の斜め向かい。MRT、台鉄、高鉄はいずれも徒歩圏内です。')
    return f'''<section class="bs-alt" id="visit" aria-labelledby="visit-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('visit-h', '怎麼來', 'Visit', 'アクセス')}<p>{e(near)}</p></div>
  <div class="bs-visit">
    <div>
      <address>{e(ADDRESS[L])}<small>{e(small)}</small></address>
      <dl>{rows}<div><dt>{t('電話', 'Phone', '電話')}</dt><dd><a href="{TEL_HREF}">{e(TEL_TEXT)}</a></dd></div><div><dt>Email</dt><dd><a href="mailto:us@emoji.tw">us@emoji.tw</a></dd></div>{ig_row}</dl>
      <div class="bs-hero__actions"><a class="bs-btn bs-btn--line" href="{MAP}" target="_blank" rel="noopener">{t('Google 地圖', 'Google Maps', 'Google マップ')}</a><a class="bs-btn bs-btn--line" href="{www('/access')}">{t('交通與抵達方式', 'Directions', 'アクセス・行き方')}</a></div>
    </div>
    <iframe class="bs-map" src="https://www.google.com/maps?q=25.046198,121.51342&amp;hl={MAP_HL[L]}&amp;z=17&amp;output=embed" title="{e(b['zh'])} {e(b['en'])} {t('地圖位置', 'map location', '地図')}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
  </div>
</div></section>
'''


def faq(items):
    return '<div class="bs-faq">' + ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in items) + '</div>'


def footer_html(slug, dock):
    b = BRANDS[slug]
    dock_html = ''.join(f'<a class="bs-btn{" bs-btn--line" if i else ""}" href="{h}">{x}</a>' for i, (x, h) in enumerate(dock))
    legal = f'© 2026 {b["zh"]} {b["en"]} · {COMPANY[L]} · {PARENT[L]}'
    ig_li = f'<li><a href="https://www.instagram.com/{b["ig"]}" target="_blank" rel="noopener">Instagram @{b["ig"]}</a></li>' if b['ig'] else ''
    return f'''<footer class="bs-foot"><div class="wrap">
  <div class="bs-foot__grid">
    <div class="bs-foot__brand"><img src="/brand-sites/assets/{slug}-logo.webp" alt="{e(b['alt'][L])}" loading="lazy" decoding="async"></div>
    <div><h4>{t('聯絡', 'Contact', 'お問い合わせ')}</h4><ul><li>{e(ADDRESS[L])}</li><li><a href="{TEL_HREF}">{e(TEL_TEXT)}</a></li><li><a href="mailto:us@emoji.tw">us@emoji.tw</a></li>{ig_li}</ul></div>
    <div><h4>{t('更多', 'More', 'その他')}</h4><ul><li><a href="{www('/reserve')}">{t('線上訂位', 'Reservations', 'オンライン予約')}</a></li><li><a href="{app_url()}">{t('會員 App', 'Member app', '会員アプリ')}</a></li><li><a href="{www('/terms')}">{t('服務條款', 'Terms', '利用規約')}</a></li><li><a href="{www('/privacy')}">{t('隱私權政策', 'Privacy', 'プライバシー')}</a></li><li><a href="{www('/refund')}">{t('退費政策', 'Refunds', '返金ポリシー')}</a></li></ul></div>
  </div>
  <div class="bs-foot__bottom"><p class="bs-foot__legal">{e(legal)}</p>{lang_switch(b['host'], ' bs-lang--foot')}</div>
</div></footer>
<nav class="bs-dock" aria-label="{t('快速動作', 'Quick actions', 'クイック操作')}">{dock_html}</nav>
<script>(function(){{var d=document.querySelector('.bs-dock'),h=document.querySelector('.bs-hero');if(!d||!h||!('IntersectionObserver' in window))return;new IntersectionObserver(function(e){{d.classList.toggle('is-on',!e[0].isIntersecting)}}).observe(h)}})()</script>
</body>
</html>
'''


def facts(rows):
    return '<dl class="bs-facts">' + ''.join(f'<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>' for k, v in rows) + '</dl>'


def points(items, show_number=True):
    return '<ol class="bs-points">' + ''.join(
        f'<li>{("<span class=\"n\" aria-hidden=\"true\">" + str(i).zfill(2) + "</span>") if show_number else ""}<div><b>{e(x)}</b><span>{e(d)}</span></div></li>'
        for i, (x, d) in enumerate(items, 1)) + '</ol>'


def story(hid, zh_t, en_t, ja_t, paras):
    body = ''.join(f'<p>{e(t(*p))}</p>' for p in paras)
    return f'''<section class="bs-story" aria-labelledby="{hid}"><div class="wrap bs-story__in">
  <div class="bs-sec__head bs-sec__head--plain">{sec_h2(hid, zh_t, en_t, ja_t)}</div>
  <div class="bs-story__body">{body}</div>
</div></section>
'''


# ---------------------------------------------------------------- 在咖啡
# 2026-11 改版（taste-skill 規則）：真實店內照與試菜照（public/brand-sites/assets/atcafe/）、無襯線標題、
# 每區不同版型（分割 hero／時間軸／餐點拼貼／空間相片組／菜單／FAQ／交通）、捲動淡入（尊重 prefers-reduced-motion）。
# 照片來源：IG素材/2026-11月/在咖啡短影音_素材（4K 原片抽格）、IG素材/260823_試菜/美化。
ATC = '/brand-sites/assets/atcafe/'
ATC_SIZES = {'matcha': (643, 1125, 1400, 800), 'pour': (514, 804, 1000, 640), 'records': (900, 1600, 1600, 900),
             'moji-wall': (514, 804, 1000, 640), 'player': (514, 804, 1000, 640), 'seats': (900, 1600, 1600, 900),
             'toast': (560, 900, 900, 560), 'croissant': (560, 900, 900, 560), 'pudding': (560, 900, 900, 560),
             'bagel': (560, 900, 900, 560)}
ATC_RATIO = {'matcha': (1125, 1400), 'pour': (804, 1000), 'records': (1600, 1067), 'moji-wall': (804, 1000),
             'player': (804, 1000), 'seats': (1600, 1067), 'toast': (900, 900), 'croissant': (900, 900),
             'pudding': (900, 900), 'bagel': (900, 900)}  # seats（座位）偏暗未採用


def atc_img(name, alt, sizes, eager=False):
    small_w, big_w, big, small = ATC_SIZES[name]
    w, h = ATC_RATIO[name]
    load = 'fetchpriority="high" decoding="async"' if eager else 'loading="lazy" decoding="async"'
    return (f'<img src="{ATC}{name}-{small}.webp" srcset="{ATC}{name}-{small}.webp {small_w}w, {ATC}{name}-{big}.webp {big_w}w" '
            f'sizes="{sizes}" width="{w}" height="{h}" alt="{e(alt)}" {load}>')


def page_cafe():
    s = 'at-cafe'
    reserve = www('/reserve')
    book = t('訂位', 'Book a table', '予約する')
    see_menu = t('查看菜單', 'View menu', 'メニューを見る')
    out = head(s, t('在咖啡 at cafe｜台北車站旁的日式簡餐與工作咖啡',
                    '在咖啡 at cafe | Japanese set meals and working coffee by Taipei Main Station',
                    '在咖啡 at cafe｜台北駅そばの定食とワーキングコーヒー'),
               t('在咖啡（at cafe）是台北車站旁的日式簡餐與工作咖啡，08:00–17:00。早餐、午餐、下午的咖啡，或約人碰面，不需會員。台北車站站前地下街 Z10 出口斜對面。',
                 'at cafe: Japanese set meals and working coffee by Taipei Main Station, 08:00–17:00. Breakfast, lunch, an afternoon coffee or a meeting, no membership needed. Diagonally across from Exit Z10.',
                 '在咖啡（at cafe）は台北駅そばの日本式の定食とワーキングコーヒー。08:00–17:00。朝食、ランチ、午後のコーヒー、待ち合わせに。会員登録不要。台北駅地下街 Z10 出口の斜め向かい。'))
    out += header(s, [(t('一天', 'A day', '一日'), '#day'), (t('餐點', 'Food', '料理'), '#food'), (t('空間', 'The room', '店内'), '#room'),
                      (t('菜單', 'Menu', 'メニュー'), '#menu'), (t('怎麼來', 'Visit', 'アクセス'), '#visit'), (book, reserve)])

    # —— Hero：左文字、右兩張實拍（主圖＋錯位小圖） ——
    out += f'''<main id="content">
<section class="bs-hero atc-hero"><div class="wrap atc-hero__grid">
  <div class="atc-hero__copy">
    <h1>在咖啡<span class="en">at cafe</span></h1>
    <p class="atc-hero__lede">{t('台北車站旁的日式簡餐與工作咖啡。<span class="nb">一人一杯飲料，</span><span class="nb">就可以坐下來。</span>',
                                 'Japanese set meals and working coffee by Taipei Main Station. One drink each, and the table is yours.',
                                 '台北駅そばの定食とワーキングコーヒー。ドリンク一杯で、席に着けます。')}</p>
    <p class="atc-hero__open"><b>08:00–17:00</b><span>{t('每日營業 · 16:30 最後點餐', 'Open daily · last orders 16:30', '毎日営業 · ラストオーダー 16:30')}</span></p>
    <div class="atc-hero__actions"><a class="bs-btn" href="#menu">{see_menu}</a><a class="bs-btn bs-btn--line" href="{reserve}">{book}</a></div>
  </div>
  <div class="atc-hero__media">
    <figure class="atc-hero__main">{atc_img('matcha', t('吧檯上的冰抹茶拿鐵', 'An iced matcha latte on the counter', 'カウンターのアイス抹茶ラテ'), '(max-width: 760px) 100vw, 44vw', eager=True)}</figure>
    <figure class="atc-hero__sub">{atc_img('croissant', t('明太子美式炒蛋可頌', 'Mentaiko Scrambled Egg Croissant', '明太子スクランブルエッグのクロワッサン'), '(max-width: 760px) 40vw, 18vw', eager=True)}</figure>
  </div>
</div></section>
'''

    # —— 一天：時間軸（四個時刻） ——
    day = [('08:00', t('第一杯拿鐵。趕車的人從外帶窗口拿了就走。', 'The first latte. Commuters grab it from the takeaway window and go.', '最初のラテ。急ぐ人はテイクアウト窓口で受け取って、そのまま駅へ。')),
           ('10:30', t('有人打開筆電，點了一個鹽烤雞腿昆布飯糰，說只待一下。', 'Someone opens a laptop, orders a salt-grilled chicken and kombu onigiri, and says it’s just for a bit.', 'ノートパソコンを開いた人が、塩焼きチキンと昆布のおにぎりを注文。「少しだけ」と言って。')),
           ('13:00', t('他還在。旁邊那桌也在遠端工作。', 'Still here. The next table is working remotely too.', 'まだいます。隣の席もリモートワーク。')),
           ('16:30', t('最後點餐。17:00 打烊。', 'Last orders. We close at 17:00.', 'ラストオーダー。17:00 閉店。'))]
    steps = ''.join(f'<li class="reveal"><time>{h}</time><p>{e(x)}</p></li>' for h, x in day)
    out += f'''<section class="atc-day" id="day" aria-labelledby="day-h"><div class="wrap">
  {sec_h2('day-h', '在咖啡的一天', 'A day here', '在咖啡の一日')}
  <ol class="atc-day__list">{steps}</ol>
</div></section>
'''

    # —— 餐點：非對稱拼貼（4 張試菜照＋1 格文字） ——
    dish = lambda name, zh, en, ja, cls: (f'<figure class="atc-dish {cls} reveal">{atc_img(name, t(zh, en, ja), "(max-width: 760px) 100vw, 33vw")}'
                                          f'<figcaption>{e(t(zh, en, ja))}</figcaption></figure>')
    out += f'''<section class="bs-alt atc-food" id="food" aria-labelledby="food-h"><div class="wrap">
  {sec_h2('food-h', '白天吃什麼', 'What we serve', '昼の料理')}
  <div class="atc-food__grid">
    {dish('toast', '奶油松露野菇炒蛋開放式三明治', 'Truffle Mushroom & Egg Open Sandwich', 'トリュフバターきのこ玉子のオープンサンド', 'atc-dish--lg')}
    {dish('pour', '抹茶拿鐵', 'Matcha Latte', '抹茶ラテ', '')}
    {dish('bagel', '柚子胡椒雞腿貝果', 'Yuzu Kosho Chicken Bagel', '柚子胡椒チキンのベーグル', '')}
    {dish('pudding', '自製布丁（下午茶套餐）', 'House pudding (Tea Time Set)', '自家製プリン（ティータイムセット）', '')}
    <div class="atc-food__note reveal"><p>{t('開放式三明治、貝果、飯糰、冷蕎麥麵；自製布丁、巴斯克與可麗露。咖啡、茶與氣泡飲。',
                                            'Open sandwiches, bagels, onigiri and cold soba; house pudding, Basque cheesecake and canelé. Coffee, tea and sparkling drinks.',
                                            'オープンサンド、ベーグル、おにぎり、冷たいそば。自家製プリン、バスクチーズケーキ、カヌレ。コーヒー、お茶、スパークリングドリンク。')}</p>
      <a class="atc-link" href="#menu">{see_menu}</a></div>
  </div>
  <p class="atc-food__src">{t('照片為試菜實拍，實際擺盤以現場為準。', 'Photos are from our tasting session; plating may vary.', '写真は試食会のものです。盛り付けは異なる場合があります。')}</p>
</div></section>
'''

    # —— 空間：寬幅照＋三張直幅＋故事 ——
    story_p = ''.join(f'<p>{e(t(*p))}</p>' for p in [
        ('在咖啡開在台北車站旁一棟民國 58 年的老屋裡。白天是明亮的日式簡餐與咖啡，設有外帶窗口；約 25 坪、內用 32 席、一張長吧檯。',
         'at cafe sits in a 1969 house by Taipei Main Station. By day it is a bright room for Japanese set meals and coffee, with a takeaway window: about 25 ping, 32 seats and a long counter.',
         '在咖啡は、台北駅そばの 1969 年築の古い建物にあります。昼は明るい定食とコーヒーの店で、テイクアウト窓口もあります。約 25 坪、32 席、ロングカウンター。'),
        ('牆上有一整面黑膠，也藏了一隻大象 moji。台北車站每天有很多人經過；我們的目標很小，讓其中一個人坐下來，把這杯喝完。',
         'There is a wall of vinyl, and an elephant named moji hiding on another. A great many people pass Taipei Main Station every day; our goal is small: get one of them to sit down and finish the cup.',
         '壁一面のレコードと、どこかに隠れた象の moji。台北駅を通る人はとても多い。私たちの目標は小さくて、そのうちの一人に座って一杯を飲み終えてもらうこと。'),
    ])
    out += f'''<section class="atc-room" id="room" aria-labelledby="room-h"><div class="wrap">
  <div class="atc-room__grid">
    <div class="atc-room__copy reveal">{sec_h2('room-h', '空間', 'The room', '店内')}{story_p}</div>
    <figure class="atc-room__tall reveal">{atc_img('moji-wall', t('牆上的 moji 線條插畫', 'moji line drawings on the wall', '壁に飾られた moji の線画'), '(max-width: 760px) 50vw, 22vw')}</figure>
    <figure class="atc-room__tall atc-room__tall--low reveal">{atc_img('player', t('門口的播放器造型看板', 'The music-player sign by the door', '入口の音楽プレーヤー風サイン'), '(max-width: 760px) 50vw, 22vw')}</figure>
  </div>
  <figure class="atc-room__wide reveal">{atc_img('records', t('整面黑膠唱片牆', 'The vinyl record wall', 'レコードの壁'), '(max-width: 1240px) 100vw, 1200px')}</figure>
</div></section>
'''

    # —— 菜單（伺服器端填入） ——
    out += f'''<section class="bs-alt bs-menu atc-menu" id="menu" aria-labelledby="menu-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('menu-h', '菜單', 'Menu', 'メニュー')}<p>{t('價格含稅', 'Prices include tax', '価格は税込')}</p></div>
  <div data-menu="CAFE"></div>
  <div class="bs-menu__cta"><a class="bs-btn" href="{reserve}">{book}</a></div>
</div></section>

<section id="faq" class="atc-faq" aria-labelledby="faq-h"><div class="wrap atc-faq__in">
  {sec_h2('faq-h', '常見問題', 'FAQ', 'よくある質問')}
  {faq([(t('需要會員才能進來嗎？', 'Do I need a membership?', '会員でないと入れませんか？'),
         t('不需要。在咖啡對所有訪客開放，一人一杯飲料就能入座。', 'No. at cafe is open to everyone; one drink per person and you can take a seat.', 'いいえ。在咖啡はどなたでも利用でき、お一人一杯のドリンクで席に着けます。')),
        (t('可以帶電腦工作嗎？', 'Can I work here on my laptop?', 'パソコンで仕事をしてもいいですか？'),
         t('可以。白天的座位歡迎工作；一人一杯飲料就能坐。', 'Yes. The daytime seats welcome work; one drink per person and the seat is yours.', 'はい。昼の席は仕事にお使いいただけます。お一人一杯のドリンクで席に着けます。')),
        (t('可以外帶嗎？', 'Is takeaway available?', 'テイクアウトはできますか？'),
         t('可以。飲品與餐點都能外帶，趕時間的人從外帶窗口拿了就走。', 'Yes. Drinks and food are available to go; grab them from the takeaway window.', 'はい。ドリンクも料理もテイクアウトでき、急ぐ方はテイクアウト窓口で受け取れます。')),
        (t('怎麼訂位？', 'How do I book?', '予約はどうすればいいですか？'),
         t('請用線上訂位；也歡迎直接來。', 'Use the online reservation page; walk-ins are welcome too.', 'オンライン予約をご利用ください。直接のご来店も歓迎です。'))])}
</div></section>
'''
    out += visit([(t('營業時間', 'Hours', '営業時間'), t('每日 08:00–17:00', 'Daily 08:00–17:00', '毎日 08:00–17:00')),
                  (t('最後點餐', 'Last orders', 'ラストオーダー'), '16:30')], s)
    out += '</main>\n'
    out += footer_html(s, [(see_menu, '#menu'), (book, reserve)])
    # 捲動淡入：IntersectionObserver（不用 scroll 事件）；未支援或減少動態時直接顯示
    out = out.replace('</body>', '<script>(function(){var r=document.querySelectorAll(".reveal");if(!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches){r.forEach(function(x){x.classList.add("is-in")});return}var o=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add("is-in");o.unobserve(x.target)}})},{rootMargin:"0px 0px -8% 0px",threshold:.12});r.forEach(function(x){o.observe(x)})})()</script>\n</body>')
    return out


# ---------------------------------------------------------------- 三點水
def page_3am():
    s = '3am'
    reserve = www('/reserve')
    out = head(s, t('三點水 3AM｜台北車站旁的深夜食堂與餐酒館',
                    '三點水 3AM | Late-night diner and bistro by Taipei Main Station',
                    '三點水 3AM｜台北駅そばの深夜食堂・ビストロ'),
               t('三點水（3AM）是台北車站旁的深夜食堂與餐酒館，17:00–翌日 03:00。晚餐、宵夜、餐食佐酒，有人服務到凌晨三點，不需會員。台北車站站前地下街 Z10 出口斜對面。',
                 '3AM is the late-night diner and bistro by Taipei Main Station, 17:00–03:00 next day. Dinner, late-night food and meals with drinks, staffed until 3 a.m. No membership needed. Diagonally across from Exit Z10.',
                 '三點水（3AM）は台北駅そばの深夜食堂・ビストロ。17:00–翌03:00。夕食、夜食、お酒に合う料理を、深夜3時までスタッフが対応します。会員登録不要。台北駅地下街 Z10 出口の斜め向かい。'))
    out += header(s, [(t('介紹', 'About', '紹介'), '#about'), (t('菜單', 'Menu', 'メニュー'), '#menu'), (t('用餐須知', 'Before you come', 'ご利用案内'), '#policy'), (t('怎麼來', 'Visit', 'アクセス'), '#visit'), (t('訂位', 'Reserve', '予約'), reserve)])
    out += f'''<main id="content">
<section class="bs-hero bs-hero--night"><div class="wrap bs-hero__grid">
  <div class="bs-hero__copy">
    <h1>{t('醒著，就來。', 'Still awake? Come in.', '起きているなら、どうぞ。')}<span class="en">三點水 3AM</span></h1>
    <p class="bs-hero__lede">{t('台北車站旁的深夜食堂與餐酒館。晚餐、宵夜、餐食佐酒，營業到凌晨三點。', 'A late-night diner and bistro by Taipei Main Station. Dinner, late-night food and drinks until 3 a.m.', '台北駅そばの深夜食堂・ビストロ。夕食、夜食、お酒に合う料理を深夜3時まで。')}</p>
    <div class="bs-hero__actions"><a class="bs-btn" href="{reserve}">{t('訂一張桌', 'Book a table', '予約する')}</a><a class="bs-text-link" href="#menu">{t('先看菜單', 'See the menu', 'メニューを見る')}</a></div>
  </div>
  <figure class="bs-hero__photo bs-hero__photo--main"><img src="/brand-sites/assets/3am/exterior-night.png" alt="{t('三點水夜間燈箱', '3AM at night', '夜の三點水')}" width="540" height="960" decoding="async" fetchpriority="high"></figure>
  <figure class="bs-hero__photo bs-hero__photo--small"><img src="/brand-sites/assets/3am/sake-shelf.png" alt="{t('三點水酒架', '3AM sake shelf', '三點水の酒棚')}" width="540" height="960" decoding="async"></figure>
  <p class="bs-hero__meta"><b>17:00–03:00</b><span>{t('每天 · 台北車站 Z10 出口斜對面', 'Daily · across from Exit Z10', '毎日 · Z10出口の斜め向かい')}</span></p>
</div></section>

<section id="about" aria-labelledby="about-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('about-h', '入夜之後', 'After dark', '日が暮れてから')}</div>
  {facts([(t('用途', 'Use', '用途'), t('晚餐、深夜熱食與餐食佐酒', 'Dinner, late-night hot food and meals with drinks', '夕食、深夜の温かい食事、お酒に合う料理')),
          (t('時段', 'Hours', '営業時間'), t('17:00–翌日 03:00', '17:00–03:00 next day', '17:00–翌03:00')),
          (t('使用資格', 'Access', '利用条件'), t('所有訪客，不需會員', 'Open to everyone; no membership required', 'どなたでも利用可。会員登録不要')),
          (t('費用', 'Price', '料金'), t('依菜單；分一般價與聚落價', 'See menu; standard and Hub rates', 'メニュー参照。通常価格とハブ価格'))])}
  <div class="bs-feat bs-feat--gap">
    <figure class="bs-feat__moji"><img src="/brand-sites/assets/moji-night.svg" alt="" width="200" height="200" loading="lazy"><figcaption>{t('moji · 入夜', 'moji · after dark', 'moji · 夜')}</figcaption></figure>
    {points([(t('晚餐', 'Dinner', '夕食'),
              t('下班、下車，直接在台北車站旁吃一頓熱的。冷熱前菜、炸物、燒烤與麵食。', 'Off work or off the train: a hot meal right by Taipei Main Station. Cold and hot starters, fried dishes, grills and noodles.', '仕事帰り、電車を降りてすぐ。台北駅のそばで温かい一食を。冷・温前菜、揚げ物、グリル、麺。')),
             (t('宵夜', 'Late night', '夜食'),
              t('過了午夜還在營業，有人服務到凌晨三點。', 'Still open past midnight, staffed until 3 a.m.', '深夜 0 時を過ぎても営業。深夜 3 時までスタッフが対応します。')),
             (t('餐食佐酒', 'Meals with drinks', '食事とお酒'),
              t('以餐為主、酒為輔：啤酒、清酒與調酒。一個人坐吧檯，或幾個人一桌都行。', 'Food first, drinks alongside: beer, sake and cocktails. A seat at the counter on your own, or a table with friends.', '料理が主役、お酒は添えて。ビール、日本酒、カクテル。ひとりでカウンターでも、数人でテーブルでも。'))], False)}
  </div>
</div></section>
'''
    out += story('story-h', '關於三點水', 'About 3AM', '三點水について', [
        ('三點水開在台北車站旁一棟民國 58 年的老屋裡。入夜燈光轉暖，長吧檯與桌席成為深夜食堂與餐酒館，有人服務到凌晨三點。',
         '3AM sits in a 1969 house by Taipei Main Station. After dark the lights warm up and the long counter and tables become a late-night diner and bistro, staffed until 3 a.m.',
         '三點水は、台北駅そばの 1969 年築の古い建物にあります。日が暮れると灯りが暖かくなり、ロングカウンターとテーブル席は深夜食堂・ビストロに。深夜 3 時までスタッフが対応します。'),
        ('名字取自「三點水」這個部首，也是我們打烊的時間。晚班下班、末班車下車、或只是還不想回家的人，這裡有熱的食物和一杯酒。',
         'The name is the Chinese radical for “water”, written with three strokes, and it is also our closing hour. For late shifts, last trains, or anyone not quite ready to go home: hot food and a drink.',
         '名前は「氵（さんずい）」という部首から。閉店時刻でもあります。遅番帰り、終電を降りた人、まだ帰りたくない人に、温かい料理と一杯を。'),
        ('菜單價格含稅，分一般價與聚落價；聚落價給已加入聚落的會員。不需會員也能來。未滿十八歲禁止飲酒；禁止酒駕。',
         'Menu prices include tax, with a standard rate and a Hub rate for Hub members. No membership is needed to visit. No alcohol under 18; don’t drink and drive.',
         'メニュー価格は税込で、通常価格とハブ価格があります。会員でなくてもご利用いただけます。18 歳未満の飲酒は禁止。飲酒運転は禁止です。'),
    ])
    out += f'''<section class="bs-gallery" aria-labelledby="gallery-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('gallery-h', '今晚，坐哪裡？', 'Find your seat tonight', '今夜、どこに座る？')}<p>{t('長吧檯、黑膠、桌上的一盞燈。', 'A long counter, records and a light on the table.', '長いカウンター、レコード、テーブルの灯り。')}</p></div>
  <div class="bs-gallery__grid">
    <figure><img src="/brand-sites/assets/3am/vinyl-room.png" alt="{t('三點水黑膠牆與桌席', 'Records and tables at 3AM', '三點水のレコード壁とテーブル席')}" width="540" height="960" loading="lazy"><figcaption>{t('一個人坐下來也剛好', 'A good seat for one', 'ひとりにも、ちょうどいい席')}</figcaption></figure>
    <figure><img src="/brand-sites/assets/3am/table-light.png" alt="{t('三點水木桌上的小燈', 'A table light at 3AM', '三點水のテーブルランプ')}" width="540" height="960" loading="lazy"><figcaption>{t('讓晚餐慢一點', 'Let dinner take its time', '夕食を、少しゆっくり')}</figcaption></figure>
  </div>
</div></section>

<section class="bs-alt bs-menu" id="menu" aria-labelledby="menu-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('menu-h', '菜單', 'Menu', 'メニュー')}<p>{t('價格含稅；聚落價限已加入聚落者', 'Prices include tax; Hub rates are for Hub members', '価格は税込。ハブ価格はハブ参加者のみ')}</p></div>
  <div data-menu="BAR"></div>
</div></section>

<section id="policy" aria-labelledby="policy-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('policy-h', '用餐須知', 'Before you come', 'ご利用案内')}</div>
  {facts([(t('低消（2026/11/1 起）', 'Minimum spend (from 1 Nov 2026)', '最低ご利用額（2026/11/1 から）'), t('每人平日 NT$300、週六日 NT$600', 'NT$300 per person on weekdays, NT$600 on weekends', 'お一人様 平日 NT$300・土日 NT$600')),
          (t('服務費（2026/11/1 起）', 'Service charge (from 1 Nov 2026)', 'サービス料（2026/11/1 から）'), t('內用另加 10%；外帶不收', '10% for dine-in; none for takeaway', '店内飲食は 10%。お持ち帰りは不要')),
          (t('酒類', 'Alcohol', 'アルコール'), t('未滿十八歲禁止飲酒；禁止酒駕', 'No alcohol under 18; don’t drink and drive', '18 歳未満の飲酒は禁止。飲酒運転は禁止')),
          (t('結帳', 'Payment', 'お会計'), t('用餐完到櫃檯結帳', 'Pay at the counter after your meal', 'お食事の後、カウンターでお会計'))])}
  {faq([(t('需要會員嗎？', 'Do I need a membership?', '会員でないと入れませんか？'),
         t('不需要。三點水對所有訪客開放。', 'No. 3AM is open to everyone.', 'いいえ。三點水はどなたでも利用できます。')),
        (t('一個人可以來嗎？', 'Can I come alone?', 'ひとりでも大丈夫ですか？'),
         t('可以，吧檯很適合一個人。', 'Yes, the counter is made for it.', 'はい。カウンターはおひとりにぴったりです。')),
        (t('只喝酒不吃東西可以嗎？', 'Can I just have drinks?', 'お酒だけでもいいですか？'),
         t('可以，但有每人低消；以餐為主、酒為輔是我們的定位。', 'Yes, within the per-person minimum spend; food first, drinks alongside is what we do.', 'はい。お一人様の最低ご利用額があります。料理が主役、お酒は添えてが私たちの形です。')),
        (t('怎麼訂位？', 'How do I book?', '予約はどうすればいいですか？'),
         t('請用線上訂位；也歡迎直接來。', 'Use the online reservation page; walk-ins are welcome too.', 'オンライン予約をご利用ください。直接のご来店も歓迎です。'))])}
  <div class="bs-menu__cta"><a class="bs-btn" href="{reserve}">{t('立即訂位', 'Book a table', '席を予約')}</a></div>
</div></section>
'''
    out += visit([(t('營業時間', 'Hours', '営業時間'), t('每日 17:00–翌日 03:00', 'Daily 17:00–03:00 next day', '毎日 17:00–翌03:00')),
                  (t('最後點餐', 'Last orders', 'ラストオーダー'), t('以現場公告為準', 'As posted on site', '店内の案内に準じます'))], s)
    out += '</main>\n'
    out += footer_html(s, [(t('訂位', 'Book', '予約'), reserve), (t('查看菜單', 'View menu', 'メニュー'), '#menu')])
    return out


# ---------------------------------------------------------------- 等等空間
def page_stay():
    s = 'stay-square'
    app = app_url()
    apply = www('/events?apply=1#ev-apply')
    out = head(s, t('等等空間 Stay Square｜台北車站旁的共享工作與會議空間',
                    'Stay Square | Shared work and meeting space by Taipei Main Station',
                    '等等空間 Stay Square｜台北駅そばの共有ワーク・ミーティングスペース'),
               t('等等空間（Stay Square）是台北車站旁的會員共享工作與會議空間。自助吧、會議室、電話亭與工作區都包含在方案內；單日 4 小時 NT$200 起。',
                 'Stay Square is a members’ shared work and meeting space by Taipei Main Station. The self-serve bar, meeting room, phone booth and work areas are included; day passes start at NT$200 for 4 hours.',
                 '等等空間（Stay Square）は台北駅そばの会員向け共有ワーク・ミーティングスペース。セルフサービスバー、会議室、電話ブース、ワークエリアはすべてプランに含まれ、1日4時間 NT$200からです。'))
    out += header(s, [(t('空間', 'Spaces', 'スペース'), '#spaces'), (t('使用方式', 'How it works', '利用方法'), '#use'), (t('會員方案', 'Membership', '会員プラン'), '#plans'), (t('包場', 'Venue hire', '貸切'), '#venue'), (t('加入會員', 'Join', '会員になる'), app)])
    out += f'''<main id="content" class="sq">
<section class="sq-hero" id="top"><div class="sq-copy">
  <div class="sq-topline"><a href="#spaces" class="sq-toplink">{t('空間', 'Spaces', 'スペース')}</a><img src="/brand-sites/assets/stay-square-logo-h.webp" alt="{e(BRANDS[s]['alt'][L])}"><a href="#venue" class="sq-toplink">{t('包場', 'Venue hire', '貸切')}</a></div>
  <div class="sq-hero__body">
    <h1>{t('等一下，\n也能好好工作。', 'Stay a while.\nWork well.', '少し待つ時間も、\n心地よく働く。')}</h1>
    <p>{t('在台北車站旁，給會員一張可以長時間坐下來的桌子。工作、開會、打電話、喝一杯咖啡；下一段行程之前，先在這裡待著。', 'By Taipei Main Station, a table for members to settle into. Work, meet, take a call, make a coffee — stay here before the next thing begins.', '台北駅のそばで、会員がじっくり座れる一つのテーブルを。仕事、会議、電話、コーヒー。次の予定まで、ここで過ごせます。')}</p>
    <a class="sq-action" href="#plans">{t('查看會員方案', 'See memberships', '会員プランを見る')}</a>
  </div>
  <p class="sq-note">{t('共享工作與會議空間｜台北車站 Z10 出口斜對面', 'Shared work and meeting space · across from Taipei Main Station Exit Z10', '共有ワーク・ミーティングスペース｜台北駅 Z10 出口の斜め向かい')}</p>
</div><div class="sq-stage" aria-label="{t('等等空間規劃示意', 'Stay Square concept renderings', 'Stay Square 完成イメージ')}">
  <img class="is-active" src="/brand-sites/assets/stay/roof.webp" alt="{t('挑高共享工作空間規劃示意', 'High-ceiling shared workspace, concept rendering', '吹き抜けの共有ワークスペース、完成イメージ')}" width="1600" height="966" fetchpriority="high">
  <img src="/brand-sites/assets/stay/window.webp" alt="" width="1600" height="966">
  <img src="/brand-sites/assets/stay/bar.webp" alt="" width="1594" height="991">
  <div class="sq-stage__caption"><span>{t('規劃示意', 'Concept rendering', '完成イメージ')}</span><span>{t('24 小時', '24 hours', '24時間')}</span></div>
</div></section>

<section class="sq-intro" id="spaces"><div class="sq-reading">
  <h2>{t('一個等待的地方，\n也是一個工作的地方。', 'A place to wait,\nand a place to work.', '待つ場所であり、\n働く場所でもある。')}</h2>
  <p>{t('「等等」是等一下的意思。轉乘之間、兩個會議之間、下班到末班車之間，等一下不必找地方消磨。把電腦打開，讓事情往前。', '“等等” means “just a moment.” Between transfers, meetings, work and the last train, a little time does not have to be spent killing time. Open the laptop and move something forward.', '「等等」は「ちょっと待って」の意味。乗り換えの間、会議と会議の間、仕事終わりから終電まで。少しの時間を持て余さず、PCを開いて前に進める場所です。')}</p>
  <p>{t('長桌、靠窗座位、和室、四人會議室與電話亭，讓同一段下午容得下不同的工作方式。咖啡、茶飲與零食在自助吧，包含在有效會籍裡。', 'Long tables, window seats, a tatami room, a four-person meeting room and phone booths make room for different ways of working through the same afternoon. Coffee, tea and snacks at the self-serve bar are included with a valid membership.', 'ロングテーブル、窓際席、和室、4人用会議室、電話ブース。同じ午後にも異なる働き方を受け止めます。セルフサービスバーのコーヒー、茶、軽食は有効な会員資格に含まれます。')}</p>
  <p>{t('單日使用適合一段空檔；月、季與年會籍給常在台北車站周邊工作的人。', 'A day pass works for a gap in the day; monthly, quarterly and annual memberships are for those who work around Taipei Main Station often.', '1日利用はちょっとした空き時間に。月・四半期・年会員は台北駅周辺でよく働く人のために。')}</p>
</div><figure class="sq-inline-photo"><img src="/brand-sites/assets/stay/long-table.webp" alt="{t('長桌共享工作區規劃示意', 'Long-table shared work area, concept rendering', 'ロングテーブルの共有ワークエリア、完成イメージ')}" width="1600" height="969" loading="lazy"><figcaption>{t('規劃示意', 'Concept rendering', '完成イメージ')}</figcaption></figure></section>

<section class="sq-collection" aria-labelledby="space-list"><div class="sq-collection__head"><h2 id="space-list">{t('今天，\n你需要哪一種座位？', 'What kind of seat\ndo you need today?', '今日、\nどんな席が必要ですか？')}</h2><p>{t('所有區域都在有效會籍內；依現場情況使用。', 'All areas are included with a valid membership and available according to on-site conditions.', 'すべてのエリアは有効な会員資格に含まれ、現地の状況に応じて利用できます。')}</p></div>
  <div class="sq-places">
    <article><img src="/brand-sites/assets/stay/roof.webp" alt="{t('共享工作區規劃示意', 'Shared workspace, concept rendering', '共有ワークスペース、完成イメージ')}" width="1600" height="966" loading="lazy"><div><h3>{t('共享工作區', 'Shared work area', '共有ワークエリア')}</h3><p>{t('挑高、長桌、靠窗座位。適合把一段工作拉長。', 'High ceilings, long tables and window seats for a longer stretch of work.', '吹き抜け、ロングテーブル、窓際席。まとまった作業時間に。')}</p></div></article>
    <article><img src="/brand-sites/assets/stay/window.webp" alt="{t('榻榻米與投影空間規劃示意', 'Tatami and projection area, concept rendering', '畳と投影スペース、完成イメージ')}" width="1600" height="966" loading="lazy"><div><h3>{t('和室與投影', 'Tatami and projection', '和室と投影')}</h3><p>{t('小組討論、分享、一起把畫面看清楚。', 'For small-group discussion, sharing and seeing the work together.', '小グループの議論、共有、画面を一緒に見るために。')}</p><div class="md-content" data-md="3"></div></div></article>
    <article><img src="/brand-sites/assets/stay/meeting.webp" alt="{t('四人會議室規劃示意', 'Four-person meeting room, concept rendering', '4人用会議室、完成イメージ')}" width="1593" height="988" loading="lazy"><div><h3>{t('會議室與電話亭', 'Meeting room and phone booth', '会議室と電話ブース')}</h3><p>{t('預約會議、重要通話，讓聲音留在該留的地方。', 'Reserve a meeting or take an important call, keeping sound where it belongs.', '会議の予約や大切な通話に。音をあるべき場所に。')}</p></div></article>
    <article><img src="/brand-sites/assets/stay/bar.webp" alt="{t('自助吧規劃示意', 'Self-serve bar, concept rendering', 'セルフサービスバー、完成イメージ')}" width="1594" height="991" loading="lazy"><div><h3>{t('自助吧', 'Self-serve bar', 'セルフサービスバー')}</h3><p>{t('咖啡、茶飲、零食。工作中間，自己補一杯。', 'Coffee, tea and snacks. Help yourself between tasks.', 'コーヒー、お茶、軽食。作業の合間にどうぞ。')}</p></div></article>
  </div></section>

<section class="sq-use" id="use"><div><h2>{t('把時間\n留給正在做的事。', 'Keep your time\nfor what you are doing.', '時間を\nいま取り組むことへ。')}</h2><p>{t('進場後選一個位置；需要安靜時去電話亭，需要一起工作時去長桌或和室。會議室可預約。', 'Choose a seat when you arrive. Use a phone booth when you need quiet; choose the long table or tatami room when you need to work together. The meeting room can be reserved.', '入場後、好きな席を選んでください。静かに話したい時は電話ブースへ。一緒に働くならロングテーブルか和室へ。会議室は予約できます。')}</p></div><ol><li><b>{t('加入或選擇方案', 'Join or choose a plan', '会員になる・プランを選ぶ')}</b><span>{t('單日、月、季或年會籍。', 'Day, monthly, quarterly or annual.', '1日・月・四半期・年会員。')}</span></li><li><b>{t('進場後開始使用', 'Enter and settle in', '入場して利用開始')}</b><span>{t('有效會籍可使用工作區與設施。', 'A valid membership includes work areas and facilities.', '有効な会員資格でワークエリアと設備を利用できます。')}</span></li><li><b>{t('把空檔用完再走', 'Leave when you are ready', '準備ができたら出発')}</b><span>{t('下一段行程以前，讓這裡接住你。', 'Let this place hold the time before your next stop.', '次の予定まで、ここで過ごせます。')}</span></li></ol></section>

<section class="sq-plans" id="plans"><article class="sq-plan sq-plan--day"><h2>{t('單日使用', 'Day pass', '1日利用')}</h2><p>{t('給轉乘、短時工作或半天會議。', 'For a transfer, short work session or half-day meeting.', '乗り換え、短時間の作業、半日の会議に。')}</p><strong>NT$200</strong><span>{t('4 小時起｜超時每小時 NT$100', 'from 4 hours · NT$100 per extra hour', '4時間から｜延長は1時間 NT$100')}</span><a href="{app}">{t('在會員 App 購買', 'Buy in the member app', '会員アプリで購入')}</a></article><article class="sq-plan sq-plan--member"><h2>{t('常用會籍', 'Regular membership', '継続会員')}</h2><p>{t('給把台北車站周邊當工作據點的人。', 'For people who use Taipei Main Station as a work base.', '台北駅周辺を仕事の拠点にする人へ。')}</p><strong>NT$4,000</strong><span>{t('月會員｜季 NT$10,000｜年 NT$35,000', 'monthly · quarterly NT$10,000 · annual NT$35,000', '月会員｜四半期 NT$10,000｜年 NT$35,000')}</span><a href="{app}">{t('在會員 App 加入', 'Join in the member app', '会員アプリで加入')}</a></article></section>

<section class="sq-venue" id="venue"><div><h2>{t('把一段時間，\n留給一群人。', 'Give a stretch of time\nto a group.', 'ある時間を、\n一つの集まりへ。')}</h2><p>{t('講座、工作坊、團隊討論或社群聚會，可申請使用不同區域或整體空間。每個時段兩小時；未租用區域仍保留給會員。', 'For talks, workshops, team sessions or community gatherings, apply for an area or the whole space. Each slot is two hours; areas not hired remain for members.', '講座、ワークショップ、チームの話し合い、コミュニティの集まりに。エリア単位または全体の利用を申請できます。1枠は2時間。利用されないエリアは会員のために残ります。')}</p><a class="sq-action sq-action--light" href="{apply}">{t('申請活動或包場', 'Apply for an event or venue hire', 'イベント・貸切を申請')}</a></div><figure><img src="/brand-sites/assets/stay/loft.webp" alt="{t('活動與交流空間規劃示意', 'Event and social space, concept rendering', 'イベント・交流スペース、完成イメージ')}" width="1594" height="987" loading="lazy"><figcaption>{t('規劃示意', 'Concept rendering', '完成イメージ')}</figcaption></figure></section>

<section class="sq-faq" aria-labelledby="faq-h"><h2 id="faq-h">{t('常見問題', 'Questions', 'よくある質問')}</h2><div><p><b>{t('會員方案包含哪些空間？', 'What does membership include?', '会員プランには何が含まれますか？')}</b> {t('有效會籍可使用共享工作區、會議室、電話亭與自助吧；依現場使用規則與預約狀況為準。', 'A valid membership includes shared work areas, the meeting room, phone booth and self-serve bar, subject to on-site rules and reservations.', '有効な会員資格で共有ワークエリア、会議室、電話ブース、セルフサービスバーを利用できます。現地のルールと予約状況に従います。')}</p><p><b>{t('非會員可以包場嗎？', 'Can non-members hire the venue?', '非会員でも貸切できますか？')}</b> {t('可以。請填活動或包場申請，送出不代表保留場地，將由團隊確認。', 'Yes. Submit an event or venue-hire application. Submission does not reserve the space; our team will confirm it.', 'はい。イベント・貸切申請を送ってください。送信だけでは予約確定にならず、チームが確認します。')}</p><p><b>{t('可以使用多久？', 'How long can I use it?', 'どれくらい利用できますか？')}</b> {t('單日方案依購買時數使用；常用會籍依方案有效期間。實際開放時間以現場公告為準。', 'Day passes follow the time purchased; regular memberships follow their validity. Actual opening times follow on-site notices.', '1日プランは購入時間内、継続会員は有効期間内で利用できます。実際の利用時間は現地の案内に従います。')}</p></div></section>

<section class="sq-contact"><p>{t('想談包場、合作或會員方案，寫信給', 'For venue hire, partnerships or membership questions, write to', '貸切、提携、会員プランについては')}</p><a href="mailto:us@emoji.tw">us@emoji.tw</a><div><span>{e(ADDRESS[L])}</span><span><a href="https://www.instagram.com/{BRANDS[s]['ig']}" target="_blank" rel="noopener">Instagram @{BRANDS[s]['ig']}</a></span></div></section>
</main>
<script>(function(){{var stage=document.querySelector('.sq-stage'), imgs=stage&&stage.querySelectorAll('img');if(!imgs||imgs.length<2||matchMedia('(prefers-reduced-motion: reduce)').matches)return;var i=0;setInterval(function(){{imgs[i].classList.remove('is-active');i=(i+1)%imgs.length;imgs[i].classList.add('is-active')}},5600)}})()</script>\n'''
    out += footer_html(s, [(t('加入會員', 'Join', '会員になる'), app), (t('申請包場', 'Venue hire', '貸切を申請'), apply)])
    return out


# ---------------------------------------------------------------- 約書旅（2026-11-04；Taste Skill v2 direction「uneven-photographs」seed 750199525）
# 構想：兩班車之間的空檔，變成一張閱讀時刻表。互動：選「離下一班車還有多久」→ 給出怎麼用這段時間（無 JS 時全部列出）。
# 圖片：Wikimedia Commons 公有領域／CC 授權（頁尾標註來源）＋本案 2F 規劃示意；統一暖墨單色處理。
RB_IMG = {
    'station': ('/brand-sites/assets/restbook/station1930.webp', 1600, 812),
    'students': ('/brand-sites/assets/restbook/students1930.webp', 1600, 1049),
    'platform': ('/brand-sites/assets/restbook/platform.webp', 1600, 1067),
    'bookshop': ('/brand-sites/assets/restbook/bookshop.webp', 1600, 1479),
    'bookseller': ('/brand-sites/assets/restbook/bookseller.webp', 1600, 1319),
    'room': ('/assets/space/2f-concept.jpg', 1200, 743),
}


def rb_img(key, alt, cls='', lazy=True):
    src, w, h = RB_IMG[key]
    lz = ' loading="lazy"' if lazy else ''
    return f'<img class="{cls}" src="{src}" alt="{e(alt)}" width="{w}" height="{h}"{lz} decoding="async">'


def page_book():
    s = 'rest-book'
    contact = 'mailto:us@emoji.tw?subject=' + t('約書旅洽詢', 'Rest%20Book%20enquiry', '約書旅のお問い合わせ')
    out = head(s, t('約書旅 Rest Book｜台北車站旁，等車時讀一本書',
                    '約書旅 Rest Book | A book between trains, by Taipei Main Station',
                    '約書旅 Rest Book｜台北駅のそば、電車を待つ間に一冊'),
               t('約書旅（Rest Book）在台北車站 Z10 出口斜對面：書可以讀也可以買，有個人讀書席、休憩室、兩間淋浴與交誼廳。白天 1 小時 NT$200 起，夜間 22:00–08:00 NT$800 起；不含於會員方案。',
                 'Rest Book, across from Exit Z10 of Taipei Main Station: books to read or buy, personal study seats, rest rooms, two showers and a lounge. Daytime from NT$200 an hour; night (22:00–08:00) from NT$800. Not included in membership.',
                 '約書旅（Rest Book）は台北駅 Z10 出口の斜め向かい。読める・買える本、個人の読書席、休憩室、シャワー2室、ラウンジ。日中 1時間 NT$200から、夜間（22:00–08:00）NT$800から。会員プランには含まれません。'))
    out += header(s, [(t('時刻表', 'Timetable', '時刻表'), '#gap'), (t('價目', 'Prices', '料金'), '#price'), (t('這裡有什麼', 'What’s here', 'あるもの'), '#here'), (t('常見問題', 'FAQ', 'よくある質問'), '#faq'), (t('洽詢', 'Contact', 'お問い合わせ'), contact)])
    # 價目：KK 2026-11-04 定案（含稅；見 /workspace/local/約書旅/約書旅_商業模型_20261104.md）
    gaps = [
        ('60', t('1 小時', '1 hour', '1時間'), 'NT$200', t('讀完一本短篇集裡的三篇，再到交誼廳坐一下。', 'Three stories from a short collection, then a sit-down in the lounge.', '短編集から三編。そのあとラウンジでひと息。')),
        ('240', t('4 小時', '4 hours', '4時間'), 'NT$600', t('在讀書席把一本薄書讀完，休息一下、梳洗乾淨；喜歡的書就帶走。', 'Finish a slim book at a study seat, rest, freshen up, and take the book with you if you like it.', '読書席で薄い一冊を読み終え、休んで身支度。気に入った本は買って帰る。')),
        ('480', t('8 小時', '8 hours', '8時間'), 'NT$1,000', t('一整個白天：讀一段、工作一段、休息一段，帶著一本書搭下一班車。', 'A whole day: read, work, rest, and board the next train with a book in hand.', '丸一日。読んで、働いて、休んで。一冊を持って次の電車へ。')),
    ]
    picks = ''.join(f'<button type="button" class="rb-gap__pick" data-gap="{k}" aria-pressed="{"true" if i == 0 else "false"}">{e(lbl)}</button>' for i, (k, lbl, _, _) in enumerate(gaps))
    plans = ''.join(f'<li data-gap="{k}"><b>{e(lbl)} · {price}</b><span>{e(txt)}</span></li>' for k, lbl, price, txt in gaps)
    day = [(t('1 小時', '1 hour', '1時間'), 'NT$200'), (t('4 小時', '4 hours', '4時間'), 'NT$600'),
           (t('8 小時', '8 hours', '8時間'), 'NT$1,000'), (t('超時', 'Extra time', '延長'), t('每小時 NT$150', 'NT$150 per hour', '1時間 NT$150'))]
    night = [(t('週日至週四', 'Sun–Thu', '日〜木曜'), 'NT$800'), (t('週五、週六', 'Fri, Sat', '金・土曜'), 'NT$1,000')]
    dl = lambda items: '<dl>' + ''.join(f'<div><dt>{e(a)}</dt><dd>{e(b)}</dd></div>' for a, b in items) + '</dl>'
    rules = [t('超時 15 分鐘內不收費；超過 15 分鐘以 1 小時計，之後每小時同樣以 15 分鐘為界。', 'Up to 15 minutes over is free; beyond that it counts as an hour, and each further hour follows the same 15-minute rule.', '15分以内の延長は無料。15分を超えると1時間分、以降も1時間ごとに15分を境に計算します。'),
             t('23:00 後查驗證件，限 18 歲以上。', 'ID is checked after 23:00; 18 and over only.', '23:00以降は身分証を確認します。18歳以上のみ。'),
             t('書與淋浴另計；會員方案不含約書旅。', 'Books and showers are extra; Rest Book is not included in membership.', '本とシャワーは別料金。会員プランに約書旅は含まれません。')]
    rules_html = ''.join(f'<li>{e(x)}</li>' for x in rules)
    rows = [
        (t('書架', 'Shelves', '本棚'), t('現場閱讀，喜歡可購買', 'Read on site, buy what you like', 'その場で読める・買える'), t('每本另標價', 'Priced per book', '一冊ごとに価格表示')),
        (t('讀書席', 'Study seats', '読書席'), t('一人一席，安靜閱讀', 'One person, one seat, quiet', '一人一席、静かに'), t('依時段計費', 'Charged by time', '時間制')),
        (t('休憩室', 'Rest rooms', '休憩室'), t('非密閉、不可上鎖', 'Open, not lockable', '密閉なし・施錠なし'), t('依時段計費', 'Charged by time', '時間制')),
        (t('淋浴', 'Showers', 'シャワー'), t('兩間', 'Two rooms', '2室'), t('另行計費', 'Priced separately', '別料金')),
        (t('交誼廳', 'Lounge', 'ラウンジ'), t('約十人', 'About ten people', '約10名'), t('大螢幕、Switch、漫畫、桌遊', 'Big screen, Switch, manga, board games', '大型画面、Switch、マンガ、ボードゲーム')),
        (t('會員方案', 'Membership', '会員プラン'), t('約書旅不含在內', 'Rest Book is not included', '約書旅は含まれません'), t('另行計費', 'Priced separately', '別料金')),
    ]
    table = ''.join(f'<tr><th scope="row">{e(a)}</th><td>{e(b)}</td><td>{e(c)}</td></tr>' for a, b, c in rows)
    faqs = [
        (t('會員方案包含約書旅嗎？', 'Is Rest Book included in membership?', '会員プランに約書旅は含まれますか？'),
         t('不包含。約書旅另行計費：白天 1 小時 NT$200 起，夜間 NT$800 起，詳見本頁價目。', 'No. Rest Book is priced separately: daytime from NT$200 an hour, night from NT$800. See prices on this page.', 'いいえ。約書旅は別料金です。日中1時間 NT$200から、夜間 NT$800から。このページの料金をご覧ください。')),
        (t('書可以買回家嗎？', 'Can I buy the books?', '本は買えますか？'),
         t('可以。每本書的售價各自標示，到櫃檯結帳。', 'Yes. Each book carries its own price; pay at the counter.', 'はい。価格は一冊ごとに表示しています。カウンターでお会計を。')),
        (t('書架上有哪些書？', 'What kind of books are on the shelves?', 'どんな本がありますか？'),
         t('工作、創業、旅行與在台灣生活的書為主，會持續更換。', 'Mostly work, starting up, travel and life in Taiwan, and the selection changes.', '仕事、起業、旅、台湾での暮らしの本が中心で、随時入れ替わります。')),
        (t('可以淋浴嗎？要帶什麼？', 'Can I shower? What should I bring?', 'シャワーは使えますか？何が必要ですか？'),
         t('有兩間淋浴。毛巾等備品可現場加購，價格以現場公告為準。', 'There are two showers. Towels and toiletries can be bought on site; prices are posted there.', 'シャワーは2室。タオルなどの備品は現地で購入でき、料金は現地で案内しています。')),
        (t('可以過夜或住宿嗎？', 'Can I stay overnight?', '宿泊はできますか？'),
         t('約書旅是閱讀與休憩空間，不提供住宿；休憩室非密閉、不可上鎖。', 'Rest Book is a reading and rest space, not accommodation; rest rooms are open and not lockable.', '約書旅は読書と休憩のスペースで、宿泊施設ではありません。休憩室は密閉されず施錠もできません。')),
        (t('怎麼找到你們？', 'How do I find you?', '場所は？'),
         t('台北車站站前地下街 Z10 出口斜對面，重慶南路一段 11 號。', 'Diagonally across from Exit Z10 of the Taipei Main Station underground mall, No. 11, Sec. 1, Chongqing S. Rd.', '台北駅地下街 Z10 出口の斜め向かい、重慶南路一段11号。')),
    ]
    faq_html = ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in faqs)
    credit = t('圖片：台北車站與學生（約 1930，公有領域）、台北車站月台（4300streetcar，CC BY 4.0）、巴黎書店（Janko Ferlič，CC0）、書商的店（Johannes Jelgerhuis，公有領域），皆取自 Wikimedia Commons；室內為規劃示意。',
               'Pictures: Taipei Railway Station and students, c. 1930 (public domain); Taipei Main Station platform (4300streetcar, CC BY 4.0); a Paris bookshop (Janko Ferlič, CC0); The Bookshop of Pieter Meijer Warnars (Johannes Jelgerhuis, public domain); all via Wikimedia Commons. The interior is a concept rendering.',
               '画像：台北駅と学生（1930年頃、パブリックドメイン）、台北駅のホーム（4300streetcar、CC BY 4.0）、パリの書店（Janko Ferlič、CC0）、書籍商の店（Johannes Jelgerhuis、パブリックドメイン）。いずれも Wikimedia Commons。室内は完成イメージです。')
    out += f"""<main id="content" class="rb">
<section class="rb-hero" aria-labelledby="rb-title">
  <figure class="rb-hero__small">{rb_img('station', t('約 1930 年的台北車站前廣場', 'The square in front of Taipei Railway Station, c. 1930', '1930年頃の台北駅前'), lazy=False)}</figure>
  <h1 id="rb-title" class="rb-title"><span class="rb-line"><span>{t('等車，', 'A book', '電車まで、')}</span></span><span class="rb-line rb-line--step"><span>{t('讀一本書', 'between trains', '一冊の本を')}</span></span></h1>
  <figure class="rb-hero__tall">{rb_img('bookshop', t('一面放滿書的書架', 'Shelves full of books', '本でいっぱいの本棚'), lazy=False)}</figure>
  <div class="rb-hero__say">
    <p>{t('約書旅在台北車站 Z10 出口斜對面。書可以讀也可以買，還有讀書席、休憩室、淋浴與交誼廳。', 'Rest Book is across from Exit Z10 of Taipei Main Station. Books to read or buy, study seats, rest rooms, showers and a lounge.', '約書旅は台北駅 Z10 出口の斜め向かい。読める・買える本、読書席、休憩室、シャワー、ラウンジ。')}</p>
    <a class="rb-btn" href="#gap">{t('排你的空檔時間', 'Plan your gap', 'すき間の過ごし方を見る')}</a>
  </div>
</section>

<section class="rb-intro" aria-labelledby="intro-h">
  <div class="rb-intro__head">
    <h2 id="intro-h">{t('約好的，是一本書', 'The date is with a book', '待ち合わせの相手は、本')}</h2>
    <div class="rb-intro__notes">
      <p>{t('名字是「和書約好的一段旅程」。', 'The name means “a journey arranged with a book”.', '名前は「本と約束した小さな旅」。')}</p>
      <p>{t('車站每天有很多人經過；我們只想讓其中一個人坐下來，讀完一章。', 'Crowds pass the station every day; we only want one of them to sit down and finish a chapter.', '駅を通る人は多い。そのうちの一人に、座って一章を読み終えてほしい。')}</p>
    </div>
  </div>
  <figure class="rb-intro__wide">{rb_img('platform', t('台北車站的月台', 'A platform at Taipei Main Station', '台北駅のホーム'))}</figure>
</section>

<section class="rb-gap" id="gap" aria-labelledby="gap-h">
  <div class="rb-gap__head">
    <h2 id="gap-h">{t('你的空檔時刻表', 'Your timetable for the gap', 'すき間の時刻表')}</h2>
    <p>{t('選一個時間，看看這段空檔可以怎麼過。', 'Pick a time and see how the gap could go.', '時間を選ぶと、すき間の過ごし方が見られます。')}</p>
  </div>
  <div class="rb-gap__body">
    <div class="rb-gap__picks" role="group" aria-label="{t('離下一班車還有多久', 'Time until your train', '次の電車までの時間')}">{picks}</div>
    <ul class="rb-gap__plans" aria-live="polite">{plans}</ul>
  </div>
  <figure class="rb-gap__photo">{rb_img('students', t('約 1930 年，台北車站前的學生', 'Students in front of Taipei Railway Station, 1930s', '1930年代、台北駅前の学生たち'))}</figure>
</section>

<section class="rb-run" aria-labelledby="run-h">
  <div class="rb-run__side">
    <h2 id="run-h">{t('書架、讀書席與休憩', 'Shelves, seats and rest', '本棚、読書席、休憩')}</h2>
    <a href="#here">{t('看這裡有什麼', 'See what’s here', 'あるものを見る')}</a>
  </div>
  <div class="rb-run__frames">
    <figure>{rb_img('bookseller', t('十八世紀荷蘭書商的店（畫作）', 'An eighteenth-century Dutch bookshop (painting)', '18世紀オランダの書籍商の店（絵画）'))}<figcaption><span>{t('書商的店', 'A bookshop', '書籍商の店')}</span><span>{t('畫作', 'Painting', '絵画')}</span></figcaption></figure>
    <figure class="rb-run__lift">{rb_img('room', t('約書旅閱讀與休憩空間規劃示意', 'Rest Book reading and rest area, concept rendering', '約書旅の読書・休憩エリアの完成イメージ'))}<figcaption><span>{t('約書旅', 'Rest Book', '約書旅')}</span><span>{t('規劃示意', 'Concept rendering', '完成イメージ')}</span></figcaption></figure>
    <figure>{rb_img('bookshop', t('一面放滿書的書架', 'Shelves full of books', '本でいっぱいの本棚'))}<figcaption><span>{t('書架', 'Shelves', '本棚')}</span><span>{t('參考', 'Reference', '参考')}</span></figcaption></figure>
  </div>
</section>

<section class="rb-price" id="price" aria-labelledby="price-h">
  <h2 id="price-h">{t('價目', 'Prices', '料金')}</h2>
  <p class="rb-price__lede">{t('讀書席與休憩室同價，以完整小時計費。價格含稅。', 'Study seats and rest rooms cost the same, charged by the full hour. Prices include tax.', '読書席と休憩室は同じ料金で、1時間単位の計算です。税込。')}</p>
  <div class="rb-price__grid">
    <div class="rb-price__block"><h3>{t('白天', 'Daytime', '日中')}<span>08:00–22:00</span></h3>{dl(day)}</div>
    <div class="rb-price__block rb-price__block--night"><h3>{t('夜間', 'Night', '夜間')}<span>22:00–08:00</span></h3>{dl(night)}</div>
  </div>
  <ul class="rb-price__rules">{rules_html}</ul>
</section>

<section class="rb-here" id="here" aria-labelledby="here-h">
  <h2 id="here-h">{t('這裡有什麼，怎麼收費', 'What’s here, and what it costs', 'あるものと料金')}</h2>
  <div class="rb-here__grid">
    <figure>{rb_img('station', t('約 1930 年的台北車站前廣場', 'The square in front of Taipei Railway Station, c. 1930', '1930年頃の台北駅前'))}</figure>
    <table class="rb-table"><caption>{t('約書旅的設施', 'Rest Book facilities', '約書旅の設備')}</caption><tbody>{table}</tbody></table>
  </div>
</section>

<section class="rb-faq" id="faq" aria-labelledby="faq-h">
  <h2 id="faq-h">{t('出發前想知道的', 'Before you come', '来る前に')}</h2>
  <div class="rb-faq__list">{faq_html}</div>
</section>

<section class="rb-contact" aria-label="{t('洽詢', 'Contact', 'お問い合わせ')}">
  <p class="rb-contact__say">{t('想找某一本書、想寄賣、或想在這裡辦讀書會，寫信給我們。', 'Looking for a title, want to consign books, or hold a reading group here? Write to us.', '探している本、委託販売、読書会の相談は、メールでどうぞ。')}</p>
  <figure>{rb_img('room', t('約書旅規劃示意', 'Rest Book, concept rendering', '約書旅の完成イメージ'))}</figure>
  <div class="rb-contact__links">
    <b>{t('怎麼聯絡？', 'How to reach us', '連絡先')}</b>
    <a href="{contact}">us@emoji.tw</a>
    <a href="{MAP}" target="_blank" rel="noopener">{t('Google 地圖', 'Google Maps', 'Google マップ')}</a>
    <span>{e(ADDRESS[L])}</span>
  </div>
</section>
<p class="rb-credit">{e(credit)}</p>
</main>
<script>(function(){{var r=document.documentElement;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)r.classList.add('rb-anim');
var p=document.querySelectorAll('.rb-gap__pick'),l=document.querySelectorAll('.rb-gap__plans li');function show(k){{p.forEach(function(b){{b.setAttribute('aria-pressed',b.dataset.gap===k?'true':'false')}});l.forEach(function(x){{x.hidden=x.dataset.gap!==k}})}}
if(p.length){{r.classList.add('rb-js');p.forEach(function(b){{b.addEventListener('click',function(){{show(b.dataset.gap)}})}});show('60')}}
if(!('IntersectionObserver' in window))return;var io=new IntersectionObserver(function(es){{es.forEach(function(x){{if(x.isIntersecting){{x.target.classList.add('is-in');io.unobserve(x.target)}}}})}},{{rootMargin:'0px 0px -10% 0px'}});document.querySelectorAll('.rb section').forEach(function(x){{io.observe(x)}})}})()</script>
"""
    out += footer_html(s, [(t('價目', 'Prices', '料金'), '#price'), (t('洽詢', 'Contact', 'お問い合わせ'), contact)])
    return out


def build():
    global L
    for L in LANGS:
        d = OUT if L == 'zh' else OUT / L
        d.mkdir(parents=True, exist_ok=True)
        for slug, fn in (('at-cafe', page_cafe), ('3am', page_3am), ('stay-square', page_stay), ('rest-book', page_book)):
            (d / f'{slug}.html').write_text(fn(), encoding='utf-8')
            print('wrote', d / f'{slug}.html')


build()
