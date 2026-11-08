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
    # 2026-11-04 KK：2F 自等等空間分出；官網不提會員方案（含頁尾會員 App、FAQ、價目附註）；日文同中文；IG 帳號未定（ig=None 不顯示）；標誌為暫用文字標誌（tools/build-rest-book-logo.py）
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
    extra_css = {'3am': '\n<link rel="preload" as="image" href="/brand-sites/assets/3am/clam-soup-1800.webp" media="(min-width: 761px)">\n<link rel="stylesheet" href="/brand-sites/3am-dark-room.css">',
                 'stay-square': '\n<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500' + ('&family=Noto+Sans+JP:wght@300;400;500' if L == 'ja' else '') + '&display=swap" rel="stylesheet">\n<link rel="stylesheet" href="/brand-sites/stay-square.css">',
                 'rest-book': '\n<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=' + ('Shippori+Mincho:wght@400;500;600' if L == 'ja' else 'Noto+Serif+TC:wght@400;500;600') + '&display=swap" rel="stylesheet">\n<link rel="stylesheet" href="/brand-sites/rest-book.css">'}.get(slug, '')
    if cafe:  # 在咖啡專用樣式＋首圖預載＋js 旗標（捲動淡入）
        extra_css = ('\n<link rel="stylesheet" href="/brand-sites/at-cafe.css">'
                     '\n<link rel="preload" as="image" href="/brand-sites/assets/atcafe/matcha-800.webp" '
                     'imagesrcset="/brand-sites/assets/atcafe/matcha-800.webp 643w, /brand-sites/assets/atcafe/matcha-1400.webp 1125w" imagesizes="(max-width: 760px) 100vw, 44vw">'
                     '\n<script>document.documentElement.classList.add("js")</script>')
    fonts = FONTS_CAFE if cafe else FONTS_DEFAULT
    og_img = 'brand-sites/assets/atcafe/matcha-1400.webp' if cafe else 'brand-sites/assets/3am/clam-soup-1800.webp' if slug == '3am' else f'brand-sites/assets/{slug}-avatar.webp'
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
<meta name="twitter:card" content="{'summary_large_image' if cafe or slug == '3am' else 'summary'}">
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
    <div><h4>{t('更多', 'More', 'その他')}</h4><ul><li><a href="{www('/reserve')}">{t('線上訂位', 'Reservations', 'オンライン予約')}</a></li>{'' if slug == 'rest-book' else f'<li><a href="{app_url()}">' + t('會員 App', 'Member app', '会員アプリ') + '</a></li>'}<li><a href="{www('/terms')}">{t('服務條款', 'Terms', '利用規約')}</a></li><li><a href="{www('/privacy')}">{t('隱私權政策', 'Privacy', 'プライバシー')}</a></li><li><a href="{www('/refund')}">{t('退費政策', 'Refunds', '返金ポリシー')}</a></li></ul></div>
  </div>
  <div class="bs-foot__bottom"><p class="bs-foot__legal">{e(legal)}</p>{lang_switch(b['host'], ' bs-lang--foot')}</div>
</div></footer>
<nav class="bs-dock" aria-label="{t('快速動作', 'Quick actions', 'クイック操作')}">{dock_html}</nav>
<script>(function(){{var n=document.querySelector('.bs-head');if(!n)return;function f(){{n.classList.toggle('is-scrolled',scrollY>8)}}addEventListener('scroll',f,{{passive:true}});f()}})()</script>
<script>(function(){{var d=document.querySelector('.bs-dock'),h=document.querySelector('.bs-hero,.sq-hero');if(!d||!h||!('IntersectionObserver' in window))return;new IntersectionObserver(function(e){{d.classList.toggle('is-on',!e[0].isIntersecting)}}).observe(h)}})()</script>
<script>(function(){{var m=document.querySelector('[data-menu]'),g=m&&m.querySelectorAll('.menu-group');if(!g||g.length<4)return;var n=document.createElement('nav');n.className='bs-menu__jump';n.setAttribute('aria-label','{t('菜單分類', 'Menu sections', 'メニューの分類')}');g.forEach(function(s,i){{var h=s.querySelector('.menu-group__zh');if(!h)return;s.id=s.id||'menu-g'+i;var a=document.createElement('a');a.href='#'+s.id;a.textContent=h.textContent;n.appendChild(a)}});m.parentNode.insertBefore(n,m)}})()</script>
<script>(function(){{if(!matchMedia('(max-width: 640px)').matches)return;var more='{t('看完整說明', 'Show details', '詳しく見る')}';document.querySelectorAll('[data-menu] .menu-item').forEach(function(it){{var ns=it.querySelectorAll('.menu-item__note');if(!ns.length)return;var lh=parseFloat(getComputedStyle(ns[0]).lineHeight)||24,long=ns.length>1||ns[0].offsetHeight>lh*2+4;if(!long)return;it.classList.add('is-clamp');var b=document.createElement('button');b.type='button';b.className='menu-item__more';b.textContent=more;b.setAttribute('aria-expanded','false');it.appendChild(b);it.addEventListener('click',function(e){{if(e.target.closest('a'))return;it.classList.add('is-open');b.setAttribute('aria-expanded','true')}})}})}})()</script>
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
    photo_label = t(f'放大查看：{alt}', f'View larger: {alt}', f'拡大して見る：{alt}')
    return (f'<img src="{ATC}{name}-{small}.webp" srcset="{ATC}{name}-{small}.webp {small_w}w, {ATC}{name}-{big}.webp {big_w}w" '
            f'sizes="{sizes}" width="{w}" height="{h}" alt="{e(alt)}" data-atc-photo tabindex="0" role="button" aria-label="{e(photo_label)}" {load}>')


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
    <p class="atc-hero__lede">{t('台北車站旁的日式簡餐與工作咖啡。<span class="nb">平日每人一杯飲料；</span><span class="nb">週六日每人低消 NT$300。</span>',
                                 'Japanese set meals and working coffee by Taipei Main Station. Weekdays: one drink each; weekends: NT$300 minimum per person.',
                                 '台北駅そばの定食とワーキングコーヒー。平日はお一人様1ドリンク、土日はお一人様 NT$300 から。')}</p>
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
         t('不需要。在咖啡對所有訪客開放；平日每人一杯飲料，週六日每人低消 NT$300。', 'No. at cafe is open to everyone. On weekdays, one drink per person; on weekends, NT$300 minimum spend per person.', 'いいえ。在咖啡はどなたでも利用でき、平日はお一人様1ドリンク、土日はお一人様 NT$300 からです。')),
        (t('可以帶電腦工作嗎？', 'Can I work here on my laptop?', 'パソコンで仕事をしてもいいですか？'),
         t('可以。白天的座位歡迎工作；平日每人一杯飲料，週六日每人低消 NT$300。', 'Yes. The daytime seats welcome work. On weekdays, one drink per person; on weekends, NT$300 minimum spend per person.', 'はい。昼の席は仕事にお使いいただけます。平日はお一人様1ドリンク、土日はお一人様 NT$300 からです。')),
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
    out = out.replace('</body>', '''<script>(function(){var d=document.createElement("dialog"),lang=document.documentElement.lang,close=lang==="ja"?"閉じる":lang==="en"?"Close":"關閉",caption=lang==="ja"?"写真を閉じる":lang==="en"?"Close photo":"關閉照片",last;d.className="atc-lightbox";d.innerHTML='<figure class="atc-lightbox__frame"><img alt=""><button class="atc-lightbox__close" type="button" aria-label="'+close+'">×</button><figcaption class="atc-lightbox__caption"></figcaption></figure>';var img=d.querySelector("img"),cap=d.querySelector("figcaption");document.body.appendChild(d);function open(el){last=el;var sources=(el.getAttribute("srcset")||"").split(",");img.src=sources.length?sources[sources.length-1].trim().split(/\\s+/)[0]:(el.currentSrc||el.src);img.alt=el.alt;cap.textContent=el.alt;d.showModal()}function closeDialog(){d.close();if(last)last.focus()}document.addEventListener("click",function(e){var el=e.target.closest("img[data-atc-photo]");if(el)open(el)});document.addEventListener("keydown",function(e){var el=e.target.closest("img[data-atc-photo]");if(el&&(e.key==="Enter"||e.key===" ")){e.preventDefault();open(el)}});d.querySelector("button").addEventListener("click",closeDialog);d.addEventListener("click",function(e){if(e.target===d)closeDialog()});d.addEventListener("close",function(){if(last)last.focus()})})()</script>
<script>(function(){var r=document.querySelectorAll(".reveal");if(!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches){r.forEach(function(x){x.classList.add("is-in")});return}var o=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add("is-in");o.unobserve(x.target)}})},{rootMargin:"0px 0px -8% 0px",threshold:.12});r.forEach(function(x){o.observe(x)})})()</script>
</body>''')
    return out


# ---------------------------------------------------------------- 三點水
# 三點水 2026-11-04 改版（KK：更像餐酒館、主打餐點照片與藝文感）：影棚餐點照（影棚攝影-xxx.jpg → webp 兩尺寸），
# 說明採展牌式（品名＋類別），品名須與現行菜單一致。
TAM = '/brand-sites/assets/3am/'
TAM_PLATES = [  # (檔名, 小寬, 大寬, 大圖寬, 大圖高, 版位, 品名 zh/en/ja, 類別 zh/en/ja)
    ('tomato', 960, 1800, 1800, 1200, 'wide', ('酸甜梅漬焙茶番茄', 'Plum-Pickled Tomato, Hojicha', '梅漬けトマト（ほうじ茶風味）'), ('冷前菜', 'Cold starter', '冷前菜')),
    ('karaage', 720, 1200, 1200, 1800, 'tall', ('酥炸唐揚雞淋川味美乃滋', 'Karaage, Sichuan Mayo', '唐揚げ 四川風マヨネーズ'), ('炸物', 'Fried', '揚げ物')),
    ('salmon', 720, 1200, 1200, 1800, 'tall', ('柚香鮭魚冷盤', 'Yuzu Salmon Crudo', '柚子香るサーモンのカルパッチョ'), ('冷前菜', 'Cold starter', '冷前菜')),
    ('shrimp', 720, 1200, 1200, 1800, 'tall', ('馬告鳳尾蝦阿根廷醬', 'Maqaw Shrimp, Chimichurri', '馬告風味の車海老 チミチュリソース'), ('烤物', 'Grilled', '焼き物')),
    ('soba', 720, 1200, 1200, 1800, 'tall', ('醬香野菇蕎麥麵附溫泉蛋', 'Soy Mushroom Soba, Onsen Egg', '醤油きのこそば（温泉卵付き）'), ('主食', 'Mains', '主食')),
    ('broccoli', 960, 1800, 1800, 1200, 'half', ('白味噌優格炙烤花椰菜', 'Charred Broccoli, White Miso Yogurt', 'ブロッコリーの炙り焼き（白味噌ヨーグルト）'), ('熱前菜', 'Hot starter', '温前菜')),
    ('curry', 960, 1800, 1800, 1200, 'half', ('太陽蛋番茄雞肉乾咖哩飯', 'Tomato Chicken Dry Curry, Sunny-Side Egg', 'トマトチキンのドライカレー 目玉焼き添え'), ('主食', 'Mains', '主食')),
]


def tam_plate(name, sw, bw, w, h, slot, dish, kind):
    sizes = {'wide': '(max-width: 760px) 100vw, 60vw', 'half': '(max-width: 760px) 100vw, 46vw'}.get(slot, '(max-width: 760px) 50vw, 32vw')
    return (f'<figure class="tam-plate tam-plate--{slot}"><div class="tam-plate__img"><img src="{TAM}{name}-{sw}.webp" '
            f'srcset="{TAM}{name}-{sw}.webp {sw}w, {TAM}{name}-{bw}.webp {bw}w" sizes="{sizes}" width="{w}" height="{h}" '
            f'alt="{e(t(*dish))}" loading="lazy" decoding="async"></div>'
            f'<figcaption><b>{e(t(*dish))}</b><span>{e(t(*kind))}</span></figcaption></figure>')


def page_3am():
    s = '3am'
    reserve = www('/reserve')
    out = head(s, t('三點水 3AM｜台北車站旁的深夜食堂與餐酒館',
                    '三點水 3AM | Late-night diner and bistro by Taipei Main Station',
                    '三點水 3AM｜台北駅そばの深夜食堂・ビストロ'),
               t('三點水（3AM）是台北車站旁的深夜食堂與餐酒館，17:00–翌日 03:00。晚餐、宵夜、餐食佐酒，有人服務到凌晨三點，不需會員。台北車站站前地下街 Z10 出口斜對面。',
                 '3AM is the late-night diner and bistro by Taipei Main Station, 17:00–03:00 next day. Dinner, late-night food and meals with drinks, staffed until 3 a.m. No membership needed. Diagonally across from Exit Z10.',
                 '三點水（3AM）は台北駅そばの深夜食堂・ビストロ。17:00–翌03:00。夕食、夜食、お酒に合う料理を、深夜3時までスタッフが対応します。会員登録不要。台北駅地下街 Z10 出口の斜め向かい。'))
    out += header(s, [(t('料理', 'Food', '料理'), '#food'), (t('菜單', 'Menu', 'メニュー'), '#menu'), (t('用餐須知', 'Before you come', 'ご利用案内'), '#policy'), (t('怎麼來', 'Visit', 'アクセス'), '#visit'), (t('訂位', 'Reserve', '予約'), reserve)])
    plates = ''.join(tam_plate(*p) for p in TAM_PLATES)
    out += f'''<main id="content">
<section class="bs-hero tam-hero">
  <picture class="tam-hero__photo">
    <source media="(max-width: 760px)" srcset="{TAM}table-720.webp 720w, {TAM}table-1200.webp 1200w" sizes="100vw" width="1200" height="1788">
    <img src="{TAM}clam-soup-1800.webp" srcset="{TAM}clam-soup-960.webp 960w, {TAM}clam-soup-1800.webp 1800w" sizes="100vw" width="1800" height="1200" alt="{t('三點水的蛤蜊料理與一杯酒', 'A clam dish and a glass at 3AM', '三點水のあさり料理と一杯')}" fetchpriority="high" decoding="async">
  </picture>
  <div class="wrap tam-hero__in">
    <div class="tam-hero__copy">
      <h1>{t('醒著，就來。', 'Still awake? Come in.', '起きているなら、どうぞ。')}<span class="en">三點水 3AM Bistro</span></h1>
      <p class="bs-hero__lede">{t('台北車站旁的深夜餐酒館。日式 fusion 料理配一杯清酒或梅酒，營業到凌晨三點。', 'A late-night bistro by Taipei Main Station. Japanese fusion plates with sake or umeshu, until 3 a.m.', '台北駅そばの深夜ビストロ。和のフュージョン料理に日本酒や梅酒を一杯。深夜3時まで。')}</p>
      <div class="bs-hero__actions"><a class="bs-btn" href="{reserve}">{t('訂一張桌', 'Book a table', '予約する')}</a><a class="bs-text-link" href="#food">{t('看今晚的料理', 'See tonight’s plates', '今夜の料理を見る')}</a></div>
    </div>
    <p class="bs-hero__meta"><b>17:00–03:00</b><span>{t('每天 · 台北車站 Z10 出口斜對面', 'Daily · across from Exit Z10', '毎日 · Z10出口の斜め向かい')}</span></p>
  </div>
</section>

<section class="tam-food" id="food" aria-labelledby="food-h"><div class="wrap">
  <div class="tam-food__head">{sec_h2('food-h', '今晚的盤子', 'Tonight’s plates', '今夜の皿')}<p>{t('以餐為主、酒為輔。冷熱前菜、炸物、燒烤與麵飯，每一盤都配得上一杯酒。', 'Food first, drinks alongside. Cold and hot starters, fried and grilled plates, noodles and rice, each one made to sit next to a glass.', '料理が主役、お酒は添えて。冷・温前菜、揚げ物、焼き物、麺とご飯。どの皿も一杯に合うように。')}</p></div>
  <div class="tam-plates">{plates}</div>
  <div class="tam-food__cta"><a class="bs-btn" href="#menu">{t('看完整菜單', 'See the full menu', 'メニューをすべて見る')}</a></div>
</div></section>

'''
    out += f'''<section id="about" aria-labelledby="about-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('about-h', '入夜之後', 'After dark', '日が暮れてから')}</div>
  {facts([(t('用途', 'Use', '用途'), t('晚餐、深夜熱食與餐食佐酒', 'Dinner, late-night hot food and meals with drinks', '夕食、深夜の温かい食事、お酒に合う料理')),
          (t('時段', 'Hours', '営業時間'), t('17:00–翌日 03:00', '17:00–03:00 next day', '17:00–翌03:00')),
          (t('使用資格', 'Access', '利用条件'), t('所有訪客，不需會員', 'Open to everyone; no membership required', 'どなたでも利用可。会員登録不要')),
          (t('費用', 'Price', '料金'), t('依菜單', 'See menu', 'メニュー参照'))])}
  <div class="bs-feat bs-feat--gap">
    <figure class="bs-feat__moji"><img src="/brand-sites/assets/moji-night.svg" alt="" width="200" height="200" loading="lazy"><figcaption>{t('moji · 入夜', 'moji · after dark', 'moji · 夜')}</figcaption></figure>
    {points([(t('晚餐', 'Dinner', '夕食'),
              t('下班、下車，直接在台北車站旁吃一頓熱的。冷熱前菜、炸物、燒烤與麵食。', 'Off work or off the train: a hot meal right by Taipei Main Station. Cold and hot starters, fried dishes, grills and noodles.', '仕事帰り、電車を降りてすぐ。台北駅のそばで温かい一食を。冷・温前菜、揚げ物、グリル、麺。')),
             (t('宵夜', 'Late night', '夜食'),
              t('過了午夜還在營業，有人服務到凌晨三點。', 'Still open past midnight, staffed until 3 a.m.', '深夜 0 時を過ぎても営業。深夜 3 時までスタッフが対応します。')),
             (t('餐食佐酒', 'Meals with drinks', '食事とお酒'),
              t('以餐為主、酒為輔：啤酒、清酒與果實酒。一個人坐吧檯，或幾個人一桌都行。', 'Food first, drinks alongside: beer, sake and fruit liqueurs. A seat at the counter on your own, or a table with friends.', '料理が主役、お酒は添えて。ビール、日本酒、果実酒。ひとりでカウンターでも、数人でテーブルでも。'))], False)}
  </div>
</div></section>
'''
    body = ''.join(f'<p>{e(t(*p))}</p>' for p in [
        ('三點水開在台北車站旁一棟民國 58 年的老屋裡。入夜燈光轉暖，長吧檯與桌席成為深夜食堂與餐酒館，有人服務到凌晨三點。',
         '3AM sits in a 1969 house by Taipei Main Station. After dark the lights warm up and the long counter and tables become a late-night diner and bistro, staffed until 3 a.m.',
         '三點水は、台北駅そばの 1969 年築の古い建物にあります。日が暮れると灯りが暖かくなり、ロングカウンターとテーブル席は深夜食堂・ビストロに。深夜 3 時までスタッフが対応します。'),
        ('名字取自「三點水」這個部首，也是我們打烊的時間。晚班下班、末班車下車、或只是還不想回家的人，這裡有熱的食物和一杯酒。',
         'The name is the Chinese radical for “water”, written with three strokes, and it is also our closing hour. For late shifts, last trains, or anyone not quite ready to go home: hot food and a drink.',
         '名前は「氵（さんずい）」という部首から。閉店時刻でもあります。遅番帰り、終電を降りた人、まだ帰りたくない人に、温かい料理と一杯を。'),
        ('菜單價格含稅。不需會員也能來。未滿十八歲禁止飲酒；禁止酒駕。',
         'Menu prices include tax. No membership is needed to visit. No alcohol under 18; don’t drink and drive.',
         'メニュー価格は税込です。会員でなくてもご利用いただけます。18 歳未満の飲酒は禁止。飲酒運転は禁止です。'),
    ])
    out += f'''<section class="bs-story tam-story" aria-labelledby="story-h"><div class="wrap tam-story__in">
  <figure class="tam-story__photo"><picture><source media="(max-width: 760px)" srcset="{TAM}clam-soup-960.webp 960w, {TAM}clam-soup-1800.webp 1800w" sizes="100vw" width="1800" height="1200"><img src="{TAM}table-720.webp" srcset="{TAM}table-720.webp 720w, {TAM}table-1200.webp 1200w" sizes="(max-width: 760px) 100vw, 42vw" width="1200" height="1788" alt="{t('三點水一桌料理與兩杯酒', 'A full table of plates and two glasses at 3AM', '三點水の料理が並ぶテーブルと二杯のグラス')}" loading="lazy" decoding="async"></picture></figure>
  <div class="tam-story__text"><div class="bs-sec__head bs-sec__head--plain">{sec_h2('story-h', '關於三點水', 'About 3AM', '三點水について')}</div><div class="bs-story__body">{body}</div></div>
</div></section>
'''
    out += f'''<section class="bs-gallery" aria-labelledby="gallery-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('gallery-h', '今晚，坐哪裡？', 'Find your seat tonight', '今夜、どこに座る？')}<p>{t('長吧檯、黑膠、桌上的一盞燈。', 'A long counter, records and a light on the table.', '長いカウンター、レコード、テーブルの灯り。')}</p></div>
  <div class="bs-gallery__grid">
    <figure><img src="/brand-sites/assets/3am/vinyl-room.png" alt="{t('三點水黑膠牆與桌席', 'Records and tables at 3AM', '三點水のレコード壁とテーブル席')}" width="540" height="960" loading="lazy"><figcaption>{t('一個人坐下來也剛好', 'A good seat for one', 'ひとりにも、ちょうどいい席')}</figcaption></figure>
    <figure><img src="/brand-sites/assets/3am/table-light.png" alt="{t('三點水木桌上的小燈', 'A table light at 3AM', '三點水のテーブルランプ')}" width="540" height="960" loading="lazy"><figcaption>{t('讓晚餐慢一點', 'Let dinner take its time', '夕食を、少しゆっくり')}</figcaption></figure>
  </div>
</div></section>

<section class="bs-alt bs-menu" id="menu" aria-labelledby="menu-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('menu-h', '菜單', 'Menu', 'メニュー')}<p>{t('價格含稅', 'Prices include tax', '価格は税込')}</p></div>
  <div data-menu="BAR"></div>
</div></section>

<section id="policy" aria-labelledby="policy-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('policy-h', '用餐須知', 'Before you come', 'ご利用案内')}</div>
  {facts([(t('低消（2026/11/1 起）', 'Minimum spend (from 1 Nov 2026)', '最低ご利用額（2026/11/1 から）'), t('每人週日至週四 NT$300、週五週六 NT$600', 'NT$300 per person Sun–Thu, NT$600 on Fri–Sat', 'お一人様 日〜木 NT$300・金土 NT$600')),
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
# 包場場地費：KK 2026-11-04 核准 11/01 分區版（1 時段＝2 小時；包場享在咖啡／三點水餐飲 9\u00a0折，不與會員折扣併用）。
# 人數只寫有桌椅人數（上限以消防與使用執照核定為準）；換場費、清潔費、取消規則待核准，不寫。
SQ_ZONES = [
    ('A', ('靠窗、大投影幕', 'Window side, large screen', '窓際・大型スクリーン'), '10–15', 'NT$1,800'),
    ('B', ('投影幕', 'Projector screen', 'スクリーン'), '10–15', 'NT$1,400'),
    ('C', ('投影幕', 'Projector screen', 'スクリーン'), '10–15', 'NT$1,400'),
    ('D', ('榻榻米、小投影幕', 'Tatami, small screen', '畳・小型スクリーン'), '≤10', 'NT$1,200'),
    ('E', ('四人會議室、電視（會員免費）', 'Four-seat meeting room with TV (free for members)', '4名用会議室・テレビ（会員は無料）'), '4', 'NT$600'),
]
SQ_COMBOS = [('A+B', '20–30', 'NT$3,000'), ('A+B+C', '30–45', 'NT$4,200'), ('A+B+C+D', '40–55', 'NT$5,200')]


def sq_rates():
    per = t('人', ' people', '名')
    rows = ''.join(f'<tr><th scope="row">{z}</th><td>{e(t(*d))}</td><td>{n}{per}</td><td>{p}</td></tr>' for z, d, n, p in SQ_ZONES)
    rows += ''.join(f'<tr><th scope="row">{z}</th><td>{t("組合", "Combined", "組合せ")}</td><td>{n}{per}</td><td>{p}</td></tr>' for z, n, p in SQ_COMBOS)
    rows += f'<tr><th scope="row">{t("全區", "Whole space", "全体")}</th><td>{t("A–E 與電話亭", "A–E and phone booth", "A–E と電話ブース")}</td><td>44–59{per}</td><td>NT$6,400</td></tr>'
    notes = [t('價格以每時段（2 小時）計，含投影或螢幕、Wi-Fi 與自助吧基本飲品；不因人數加價。', 'Prices are per two-hour slot and include the screen, Wi-Fi and basic drinks from the self-serve bar; no per-person charge.', '料金は1枠（2時間）ごと。スクリーン、Wi-Fi、セルフサービスバーの基本ドリンク込み。人数による追加料金はありません。'),
             t('包場享在咖啡、三點水餐飲 9\u00a0折，不與會員折扣併用。', 'Hirers get 10% off food and drinks at at cafe and 3AM, not combined with member discounts.', '貸切利用者は在咖啡・三點水の飲食が10%オフ（会員割引との併用不可）。'),
             t('平日 09:00–18:00 只開放單區與 A+B；三區以上與全區限平日 18:00 後與假日。', 'Weekdays 09:00–18:00: single areas and A+B only. Three or more areas, or the whole space, on weekday evenings after 18:00 and weekends.', '平日 09:00–18:00 は単独エリアと A+B のみ。3エリア以上・全体は平日18:00以降と休日。'),
             t('人數為有桌椅的人數，實際上限以場地核定為準。', 'Capacities are seated with tables; the actual limit follows the approved occupancy.', '人数はテーブル・椅子ありの目安。上限は認可された収容人数に従います。')]
    return (f'<table class="sq-rates"><caption>{t("包場場地費（每時段 2 小時）", "Venue hire fees (per two-hour slot)", "貸切料金（1枠2時間）")}</caption>'
            f'<thead><tr><th scope="col">{t("區域", "Area", "エリア")}</th><th scope="col">{t("特色", "Features", "特徴")}</th><th scope="col">{t("人數", "Seats", "人数")}</th><th scope="col">{t("場地費", "Fee", "料金")}</th></tr></thead>'
            f'<tbody>{rows}</tbody></table><ul class="sq-rates__notes">' + ''.join(f'<li>{e(x)}</li>' for x in notes) + '</ul>')



def sq_label(n, en):
    """蔦屋式章節小標：編號＋拉丁字（KK 2026-11-04 日系質感改版）。"""
    num = f'<span>{n}</span>' if n else ''
    return f'<p class="sq-label">{num}{e(en)}</p>'


def sq_sechead(n, en, hid, h2, lead=''):
    lead_html = f'<p class="sq-sechead__lead">{e(lead)}</p>' if lead else ''
    return f'<div class="sq-sechead"><div>{sq_label(n, en)}<h2 id="{hid}">{e(h2)}</h2></div>{lead_html}</div>'


def page_stay():
    s = 'stay-square'
    out = head(s, t('等等空間 Stay Square｜台北車站旁的共享工作與會議空間',
                    'Stay Square | Shared work and meeting space by Taipei Main Station',
                    '等等空間 Stay Square｜台北駅そばの共有ワーク・ミーティングスペース'),
               t('等等空間（Stay Square）是台北車站旁的會員共享工作與會議空間。自助吧、會議室、電話亭與工作區都包含在方案內；單日 4 小時 NT$200 起。',
                 'Stay Square is a members’ shared work and meeting space by Taipei Main Station. The self-serve bar, meeting room, phone booth and work areas are included; day passes start at NT$200 for 4 hours.',
                 '等等空間（Stay Square）は台北駅そばの会員向け共有ワーク・ミーティングスペース。セルフサービスバー、会議室、電話ブース、ワークエリアはすべてプランに含まれ、1日4時間 NT$200からです。'))
    out += header(s, [(t('空間', 'Spaces', 'スペース'), '#spaces'), (t('使用方式', 'How it works', '利用方法'), '#use'), (t('會員方案', 'Membership', '会員プラン'), '#plans'), (t('包場', 'Venue hire', '貸切'), '#venue'), (t('會員登入', 'Sign in', 'ログイン'), '#member')])
    concept = t('規劃示意', 'Concept rendering', '完成イメージ')
    idx = [('01', 'Concept', t('理念', 'Concept', 'コンセプト'), '#concept'), ('02', 'Spaces', t('空間', 'Spaces', 'スペース'), '#spaces'),
           ('03', 'How it works', t('使用方式', 'How it works', '利用方法'), '#use'), ('04', 'Membership', t('會員方案', 'Membership', '会員プラン'), '#plans'),
           ('05', 'Venue hire', t('包場', 'Venue hire', '貸切'), '#venue'), ('06', 'Information', t('資訊', 'Information', 'インフォメーション'), '#info')]
    idx_html = ''.join(f'<li><a href="{h}"><span class="sq-index__n">{n}</span><span class="sq-index__en">{en}</span>' + ('' if L == 'en' else f'<span class="sq-index__t">{e(x)}</span>') + '</a></li>' for n, en, x, h in idx)
    places = [
        ('roof', 'Work', t('共享工作區', 'Shared work area', '共有ワークエリア'), t('挑高、長桌、靠窗座位。適合把一段工作拉長。', 'High ceilings, long tables and window seats for a longer stretch of work.', '吹き抜け、ロングテーブル、窓際席。まとまった作業時間に。'),
         t('共享工作區規劃示意', 'Shared workspace, concept rendering', '共有ワークスペース、完成イメージ'), (1600, 966), ''),
        ('window', 'Tatami', t('和室與投影', 'Tatami and projection', '和室と投影'), t('小組討論、分享、一起把畫面看清楚。', 'For small-group discussion, sharing and seeing the work together.', '小グループの議論、共有、画面を一緒に見るために。'),
         t('榻榻米與投影空間規劃示意', 'Tatami and projection area, concept rendering', '畳と投影スペース、完成イメージ'), (1600, 966), '<div class="md-content" data-md="3"></div>'),
        ('meeting', 'Meeting', t('會議室與電話亭', 'Meeting room and phone booth', '会議室と電話ブース'), t('預約會議、重要通話，讓聲音留在該留的地方。', 'Reserve a meeting or take an important call, keeping sound where it belongs.', '会議の予約や大切な通話に。音をあるべき場所に。'),
         t('四人會議室規劃示意', 'Four-person meeting room, concept rendering', '4人用会議室、完成イメージ'), (1593, 988), ''),
        ('bar', 'Bar', t('自助吧', 'Self-serve bar', 'セルフサービスバー'), t('咖啡、茶飲、零食。工作中間，自己補一杯。', 'Coffee, tea and snacks. Help yourself between tasks.', 'コーヒー、お茶、軽食。作業の合間にどうぞ。'),
         t('自助吧規劃示意', 'Self-serve bar, concept rendering', 'セルフサービスバー、完成イメージ'), (1594, 991), ''),
    ]
    places_html = ''.join(f'<article><figure><img src="/brand-sites/assets/stay/{k}.webp" alt="{e(alt)}" width="{w}" height="{h}" loading="lazy" decoding="async"></figure><p class="sq-label">{lab}</p><h3>{e(h3)}</h3><p>{e(txt)}</p>{md}</article>'
                          for k, lab, h3, txt, alt, (w, h), md in places)
    steps = [(t('加入或選擇方案', 'Join or choose a plan', '会員になる・プランを選ぶ'), t('單日、月、季或年會籍。', 'Day, monthly, quarterly or annual.', '1日・月・四半期・年会員。')),
             (t('進場後開始使用', 'Enter and settle in', '入場して利用開始'), t('有效會籍可使用工作區與設施。', 'A valid membership includes work areas and facilities.', '有効な会員資格でワークエリアと設備を利用できます。')),
             (t('把空檔用完再走', 'Leave when you are ready', '準備ができたら出発'), t('下一段行程以前，讓這裡接住你。', 'Let this place hold the time before your next stop.', '次の予定まで、ここで過ごせます。'))]
    steps_html = ''.join(f'<li><span class="sq-step__n">Step {i:02d}</span><b>{e(a)}</b><span>{e(b)}</span></li>' for i, (a, b) in enumerate(steps, 1))
    faqs = [(t('會員方案包含哪些空間？', 'What does membership include?', '会員プランには何が含まれますか？'), t('有效會籍可使用共享工作區、會議室、電話亭與自助吧；依現場使用規則與預約狀況為準。', 'A valid membership includes shared work areas, the meeting room, phone booth and self-serve bar, subject to on-site rules and reservations.', '有効な会員資格で共有ワークエリア、会議室、電話ブース、セルフサービスバーを利用できます。現地のルールと予約状況に従います。')),
            (t('非會員可以包場嗎？', 'Can non-members hire the venue?', '非会員でも貸切できますか？'), t('可以。用言文字帳號登入就能預約，不需要會籍；付款後由團隊確認檔期，無法安排時全額退費。', 'Yes. Sign in with an emoji account to book; no membership is needed. We confirm the booking after payment and refund in full if we cannot host it.', 'はい。言文字アカウントでログインすれば会員資格なしで予約できます。お支払い後に日程を確定し、お受けできない場合は全額返金します。')),
            (t('可以使用多久？', 'How long can I use it?', 'どれくらい利用できますか？'), t('單日方案依購買時數使用；常用會籍依方案有效期間。實際開放時間以現場公告為準。', 'Day passes follow the time purchased; regular memberships follow their validity. Actual opening times follow on-site notices.', '1日プランは購入時間内、継続会員は有効期間内で利用できます。実際の利用時間は現地の案内に従います。'))]
    faq_html = ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in faqs)
    ig = BRANDS[s]['ig']
    info = [(t('地址', 'Address', '住所'), e(ADDRESS[L])),
            (t('交通', 'Access', 'アクセス'), e(t('台北車站站前地下街 Z10 出口斜對面；捷運、台鐵、高鐵都在步行範圍內。', 'Diagonally across from Exit Z10 of the Taipei Main Station underground mall; MRT, TRA and HSR are all within walking distance.', '台北駅地下街 Z10 出口の斜め向かい。MRT、台鉄、高鉄はいずれも徒歩圏内です。'))),
            (t('洽詢', 'Contact', 'お問い合わせ'), f'<a href="mailto:us@emoji.tw">us@emoji.tw</a><br>{e(t("包場、合作與會員方案", "Venue hire, partnerships and membership", "貸切・提携・会員プラン"))}'),
            ('Instagram', f'<a href="https://www.instagram.com/{ig}" target="_blank" rel="noopener">@{ig}</a>')]
    info_html = ''.join(f'<div><dt>{a}</dt><dd>{b}</dd></div>' for a, b in info)
    out += f'''<main id="content" class="sq">
<section class="sq-hero" id="top" aria-labelledby="sq-title">
  <figure class="sq-hero__photo"><img src="/brand-sites/assets/stay/roof.webp" alt="{t('挑高共享工作空間規劃示意', 'High-ceiling shared workspace, concept rendering', '吹き抜けの共有ワークスペース、完成イメージ')}" width="1600" height="966" fetchpriority="high"><figcaption>{concept}</figcaption></figure>
  <div class="sq-hero__copy">
    <div>{sq_label('', 'Stay Square — Taipei Main Station')}<h1 id="sq-title">{t('等一下，\n也能好好工作。', 'Stay a while.\nWork well.', '少し待つ時間も、\n心地よく働く。')}</h1></div>
    <div class="sq-hero__side">
      <p>{t('在台北車站旁，給會員一張可以長時間坐下來的桌子。工作、開會、打電話、喝一杯咖啡；下一段行程之前，先在這裡待著。', 'By Taipei Main Station, a table for members to settle into. Work, meet, take a call, make a coffee — stay here before the next thing begins.', '台北駅のそばで、会員がじっくり座れる一つのテーブルを。仕事、会議、電話、コーヒー。次の予定まで、ここで過ごせます。')}</p>
      <div class="sq-acts"><a class="sq-action" href="#plans">{t('查看會員方案', 'See memberships', '会員プランを見る')}</a><a class="sq-more" href="#venue">{t('包場', 'Venue hire', '貸切')}</a></div>
    </div>
  </div>
</section>

<nav class="sq-index" aria-label="{t('目次', 'Contents', '目次')}"><ol>{idx_html}</ol></nav>

<section class="sq-concept" id="concept" aria-labelledby="concept-h">
  <div class="sq-concept__text">{sq_label('01', 'Concept')}<h2 id="concept-h">{t('一個等待的地方，\n也是一個工作的地方。', 'A place to wait,\nand a place to work.', '待つ場所であり、\n働く場所でもある。')}</h2></div>
  <div class="sq-concept__body">
    <p class="sq-concept__lead">{t('「等等」是等一下的意思。轉乘之間、兩個會議之間、下班到末班車之間，等一下不必找地方消磨。把電腦打開，讓事情往前。', '“等等” means “just a moment.” Between transfers, meetings, work and the last train, a little time does not have to be spent killing time. Open the laptop and move something forward.', '「等等」は「ちょっと待って」の意味。乗り換えの間、会議と会議の間、仕事終わりから終電まで。少しの時間を持て余さず、PCを開いて前に進める場所です。')}</p>
    <p>{t('長桌、靠窗座位、和室、四人會議室與電話亭，讓同一段下午容得下不同的工作方式。咖啡、茶飲與零食在自助吧，包含在有效會籍裡。', 'Long tables, window seats, a tatami room, a four-person meeting room and phone booths make room for different ways of working through the same afternoon. Coffee, tea and snacks at the self-serve bar are included with a valid membership.', 'ロングテーブル、窓際席、和室、4人用会議室、電話ブース。同じ午後にも異なる働き方を受け止めます。セルフサービスバーのコーヒー、茶、軽食は有効な会員資格に含まれます。')}</p>
    <p>{t('單日使用適合一段空檔；月、季與年會籍給常在台北車站周邊工作的人。', 'A day pass works for a gap in the day; monthly, quarterly and annual memberships are for those who work around Taipei Main Station often.', '1日利用はちょっとした空き時間に。月・四半期・年会員は台北駅周辺でよく働く人のために。')}</p>
  </div>
  <figure class="sq-concept__photo"><img src="/brand-sites/assets/stay/long-table.webp" alt="{t('長桌共享工作區規劃示意', 'Long-table shared work area, concept rendering', 'ロングテーブルの共有ワークエリア、完成イメージ')}" width="1600" height="969" loading="lazy" decoding="async"><figcaption>{concept}</figcaption></figure>
</section>

<section class="sq-spaces" id="spaces" aria-labelledby="space-list">
  {sq_sechead('02', 'Spaces', 'space-list', t('今天，你需要哪一種座位？', 'What kind of seat do you need today?', '今日、どんな席が必要ですか？'), t('所有區域都在有效會籍內；依現場情況使用。圖為規劃示意。', 'All areas are included with a valid membership and available according to on-site conditions. Images are concept renderings.', 'すべてのエリアは有効な会員資格に含まれ、現地の状況に応じて利用できます。画像は完成イメージです。'))}
  <div class="sq-places">{places_html}</div>
</section>

<section class="sq-use" id="use" aria-labelledby="use-h">
  {sq_sechead('03', 'How it works', 'use-h', t('把時間留給正在做的事。', 'Keep your time for what you are doing.', '時間を、いま取り組むことへ。'), t('進場後選一個位置；需要安靜時去電話亭，需要一起工作時去長桌或和室。會議室可預約。', 'Choose a seat when you arrive. Use a phone booth when you need quiet; choose the long table or tatami room when you need to work together. The meeting room can be reserved.', '入場後、好きな席を選んでください。静かに話したい時は電話ブースへ。一緒に働くならロングテーブルか和室へ。会議室は予約できます。'))}
  <ol class="sq-steps">{steps_html}</ol>
</section>

<section class="sq-plans" id="plans" aria-labelledby="plans-h">
  {sq_sechead('04', 'Membership', 'plans-h', t('會員方案', 'Membership', '会員プラン'), t('價格皆含稅。會籍啟用與進出 QR 在會員 App。', 'All prices include tax. Activation and the entry QR code live in the member app.', '価格はすべて税込。開始手続きと入退室 QR は会員アプリで。'))}
  <div class="sq-plans__grid">
    <article class="sq-plan">{sq_label('', 'Day pass')}<h3>{t('單日使用', 'Day pass', '1日利用')}</h3><p>{t('給轉乘、短時工作或半天會議。', 'For a transfer, short work session or half-day meeting.', '乗り換え、短時間の作業、半日の会議に。')}</p><strong>NT$200</strong><span class="sq-plan__note">{t('4 小時起｜超時每小時 NT$100', 'from 4 hours · NT$100 per extra hour', '4時間から｜延長は1時間 NT$100')}</span>{sq_buy([('day_4h', t('4 小時', '4 hours', '4時間'), 200), ('day_12h', t('12 小時', '12 hours', '12時間'), 500)])}</article>
    <article class="sq-plan">{sq_label('', 'Membership')}<h3>{t('常用會籍', 'Regular membership', '継続会員')}</h3><p>{t('給把台北車站周邊當工作據點的人。', 'For people who use Taipei Main Station as a work base.', '台北駅周辺を仕事の拠点にする人へ。')}</p><strong>NT$4,000</strong><span class="sq-plan__note">{t('月會員｜季 NT$10,000｜年 NT$35,000', 'monthly · quarterly NT$10,000 · annual NT$35,000', '月会員｜四半期 NT$10,000｜年 NT$35,000')}</span>{sq_buy([('month', t('月會員', 'Monthly', '月会員'), 4000), ('quarter', t('季會員', 'Quarterly', '四半期会員'), 10000), ('year', t('年會員｜12 個月', 'Annual · 12 months', '年会員｜12か月'), 35000), ('year_promo', t('開幕優惠｜18 個月', 'Opening offer · 18 months', 'オープン特典｜18か月'), 35000)])}</article>
  </div>
</section>
{sq_member()}

<section class="sq-venue" id="venue" aria-labelledby="venue-h">
  {sq_sechead('05', 'Venue hire', 'venue-h', t('把一段時間，留給一群人。', 'Give a stretch of time to a group.', 'ある時間を、一つの集まりへ。'), t('講座、工作坊、團隊討論或社群聚會，可依區域或整體空間包場。每個時段兩小時；未租用區域仍保留給會員。', 'For talks, workshops, team sessions or community gatherings, hire an area or the whole space. Each slot is two hours; areas not hired remain for members.', '講座、ワークショップ、チームの話し合い、コミュニティの集まりに。エリア単位または全体で貸切できます。1枠は2時間。利用されないエリアは会員のために残ります。'))}
  <div class="sq-venue__grid">
    <div>{sq_rates()}<a class="sq-action" href="#book">{t('預約包場', 'Book the venue', '貸切を予約')}</a></div>
    <figure><img src="/brand-sites/assets/stay/loft.webp" alt="{t('活動與交流空間規劃示意', 'Event and social space, concept rendering', 'イベント・交流スペース、完成イメージ')}" width="1594" height="987" loading="lazy" decoding="async"><figcaption>{concept}</figcaption></figure>
  </div>
</section>
{sq_book()}

<section class="sq-faq" aria-labelledby="faq-h">
  {sq_sechead('', 'Q&amp;A'.replace('&amp;', '&'), 'faq-h', t('常見問題', 'Questions', 'よくある質問'))}
  <div class="sq-faq__list">{faq_html}</div>
</section>

<section class="sq-info" id="info" aria-labelledby="info-h">
  {sq_sechead('06', 'Information', 'info-h', t('資訊', 'Information', 'インフォメーション'))}
  <div class="sq-info__grid"><dl>{info_html}</dl><div class="sq-acts"><a class="sq-action sq-action--line" href="{MAP}" target="_blank" rel="noopener">{t('Google 地圖', 'Google Maps', 'Google マップ')}</a><a class="sq-more" href="{www('/access')}">{t('交通與抵達方式', 'Directions', 'アクセス・行き方')}</a></div></div>
</section>
</main>
'''
    out += footer_html(s, [(t('加入會員', 'Join', '会員になる'), '#plans'), (t('預約包場', 'Book the venue', '貸切を予約'), '#book')])
    out = out.replace('</body>', sq_login() + '<script src="/sso-client.js" defer></script>\n<script src="/brand-sites/stay-square-shop.js" defer></script>\n</body>')
    return out


# ---------------------------------------------------------------- 等等空間：言文字會員登入、購買會籍、分區包場（KK 2026-11-04）
# 價格與 lib/plans.js、lib/venue-fees.js STAY_ZONES 一致（test-brand-sites 有比對）；互動在 public/brand-sites/stay-square-shop.js。
SQ_BOOK_ZONES = [  # (代碼, 中, 英, 日, 場地費／時段, 有桌椅上限, 會員免費)
    ('A', 'A 靠窗區・大投影幕', 'Zone A · window, large screen', 'Aエリア・窓側、大型スクリーン', 1800, 15, False),
    ('B', 'B 區・投影幕', 'Zone B · projector', 'Bエリア・プロジェクター', 1400, 15, False),
    ('C', 'C 區・投影幕', 'Zone C · projector', 'Cエリア・プロジェクター', 1400, 15, False),
    ('D', 'D 榻榻米區・投影幕', 'Zone D · tatami, projector', 'Dエリア・畳、プロジェクター', 1200, 10, False),
    ('E', 'E 會議室・電視', 'Room E · meeting room, TV', 'E会議室・テレビ', 600, 4, True),
    ('AB', 'A+B', 'Zones A+B', 'A+B', 3000, 30, False),
    ('ABC', 'A+B+C', 'Zones A+B+C', 'A+B+C', 4200, 45, False),
    ('ABCD', 'A+B+C+D', 'Zones A+B+C+D', 'A+B+C+D', 5200, 55, False),
    ('ALL', '整體空間（A–E＋電話亭）', 'Whole space (A–E + phone booth)', '全体（A〜E＋電話ブース）', 6400, 59, False),
]


def sq_buy(items):
    out = []
    for p, name, price in items:
        until = ' data-until="2026-12-31"' if p == 'year_promo' else ''
        out.append(f'<li><span>{e(name)}</span><button type="button" class="sq-buy" data-plan="{p}"{until}>{t("購買", "Buy", "購入")} NT${price:,}</button></li>')
    return '<ul class="sq-buylist">' + ''.join(out) + '</ul>'


def sq_member():
    intro = t('等等空間使用言文字會員帳號。登入後可在這裡購買會籍、預約包場；會籍啟用與進出 QR 在會員 App。',
              'Stay Square uses your emoji member account. Sign in to buy a plan or book the venue here; activation and the entry QR code live in the member app.',
              '等等空間は言文字の会員アカウントを使います。ログインするとここで会員プランの購入と貸切の予約ができます。開始手続きと入退室 QR は会員アプリで。')
    return (f'<section class="sq-member" id="member" aria-labelledby="member-h"><div class="sq-member__in">'
            f'{sq_label("", "Member")}<h2 id="member-h">{t("言文字會員", "emoji membership", "言文字会員")}</h2>'
            f'<div data-sq-out><p>{e(intro)}</p><button type="button" class="sq-action" data-sq-login>{t("會員登入", "Sign in", "ログイン")}</button></div>'
            f'<div data-sq-in hidden><p data-sq-who></p><p data-sq-plan></p><div class="sq-member__acts">'
            f'<a class="sq-action" href="{app_url()}">{t("開啟會員 App", "Open the member app", "会員アプリを開く")}</a>'
            f'<button type="button" class="sq-linkbtn" data-sq-logout>{t("登出", "Sign out", "ログアウト")}</button></div></div>'
            f'<p class="sq-flash" data-sq-flash role="status" aria-live="polite" hidden></p>'
            f'</div></section>')


def sq_book():
    def lbl(zh, en, ja):
        return e(t(zh, en, ja))

    opts = []
    for code, zh, en, ja, fee, mx, free in SQ_BOOK_ZONES:
        name = t(zh, en, ja)
        price = t(f'NT${fee:,}／時段', f'NT${fee:,} per slot', f'NT${fee:,}／枠')
        if free:
            price += t('，會員免費', ', free for members', '、会員無料')
        cap = t(f'至多 {mx} 人', f'up to {mx}', f'最大{mx}名')
        mf = ' data-member-free' if free else ''
        opts.append(f'<option value="{code}" data-fee="{fee}" data-max="{mx}" data-name="{e(name)}"{mf}>{e(name)}｜{e(price)}｜{e(cap)}</option>')
        note = ('<br>' + e(t('會員免費', 'free for members', '会員無料'))) if free else ''
    starts = ''.join(f'<option value="{h:02d}:00"{" selected" if h == 14 else ""}>{h:02d}:00</option>' for h in range(8, 24))
    slots = ''.join(f'<option value="{n}">{e(t(f"{n} 個時段（{n * 2} 小時）", f"{n} slot{"s" if n > 1 else ""} ({n * 2} hours)", f"{n}枠（{n * 2}時間）"))}</option>' for n in range(1, 5))
    intro = t('選區域、日期與時段，登入言文字會員後送出並付款；價目見上方包場場地費。付款後由團隊確認檔期。',
              'Pick an area, date and slots, sign in with your emoji account, then submit and pay. Fees are listed above; we confirm the booking after payment.',
              'エリア・日付・枠を選び、言文字会員でログインして送信・お支払いへ。料金は上の表のとおりです。お支払い後に日程を確定します。')
    agree_tail = t('。付款後由團隊確認檔期；無法安排時全額退費。', '. We confirm the booking after payment; if we cannot host it, you get a full refund.',
                   '。お支払い後に日程を確定します。お受けできない場合は全額返金します。')
    sep = t('、', ' and ', '、')
    return f'''<section class="sq-book" id="book" aria-labelledby="book-h"><div class="sq-book__head">
  {sq_label('', 'Booking')}<h2 id="book-h">{lbl('包場預約', 'Book the venue', '貸切の予約')}</h2>
  <p>{e(intro)}</p>
</div>
<form id="sq-book-form" class="sq-form" novalidate>
  <label>{lbl('區域', 'Area', 'エリア')}<select name="zone" required>{''.join(opts)}</select></label>
  <div class="sq-form__row">
    <label>{lbl('日期', 'Date', '日付')}<input type="date" name="date" required></label>
    <label>{lbl('開始', 'Start', '開始')}<select name="start" required>{starts}</select></label>
    <label>{lbl('時段數', 'Slots', '枠数')}<select name="slots" required>{slots}</select></label>
    <label>{lbl('人數', 'People', '人数')}<input type="number" name="attendees" min="1" max="15" inputmode="numeric" required></label>
  </div>
  <p class="sq-total" data-sq-total aria-live="polite"></p>
  <label>{lbl('活動名稱', 'Event name', 'イベント名')}<input name="title" maxlength="160" required></label>
  <label>{lbl('活動內容', 'What you will do', '内容')}<textarea name="description" rows="3" maxlength="5000" required></textarea></label>
  <label>{lbl('設備或其他需求（選填）', 'Equipment or other needs (optional)', '機材・その他のご要望（任意）')}<textarea name="requirements" rows="2" maxlength="2000"></textarea></label>
  <div class="sq-form__row">
    <label>{lbl('聯絡人', 'Contact name', 'ご担当者')}<input name="contact_name" maxlength="80" autocomplete="name" required></label>
    <label>Email<input type="email" name="contact_email" maxlength="254" autocomplete="email" required></label>
    <label>{lbl('電話（選填）', 'Phone (optional)', '電話（任意）')}<input type="tel" name="contact_phone" maxlength="40" autocomplete="tel" inputmode="tel"></label>
    <label>{lbl('公司或團體（選填）', 'Company or group (optional)', '会社・団体（任意）')}<input name="community_name" maxlength="120" autocomplete="organization"></label>
  </div>
  <label class="sq-check"><input type="checkbox" name="consent" required><span>{lbl('我已閱讀並同意', 'I agree to the', '次に同意します：')} <a href="{www('/terms')}">{lbl('服務條款', 'Terms', '利用規約')}</a>{sep}<a href="{www('/refund')}">{lbl('退費政策', 'Refund policy', '返金ポリシー')}</a>{e(agree_tail)}</span></label>
  <button type="submit" class="sq-action">{lbl('送出並付款', 'Submit and pay', '送信して支払う')}</button>
</form>
<div class="sq-apps" data-sq-apps hidden><h3>{lbl('我的包場申請', 'My venue bookings', '貸切の申請状況')}</h3><ul></ul></div>
</section>'''


def sq_login():
    intro = t('用同一個言文字帳號，會籍、包場與會員 App 都會同步。', 'One emoji account for plans, venue bookings and the member app.',
              '一つの言文字アカウントで、会員プラン、貸切、会員アプリが連動します。')
    return (f'<dialog class="sq-login" id="sq-login" aria-labelledby="sq-login-h"><h2 id="sq-login-h">{t("登入言文字會員", "Sign in to emoji", "言文字にログイン")}</h2>'
            f'<p>{e(intro)}</p>'
            f'<a class="sq-action" data-login="google" href="/auth/google">{t("使用 Google 登入", "Continue with Google", "Google でログイン")}</a>'
            f'<a class="sq-action sq-action--line" data-login="line" href="/auth/line" hidden>{t("使用 LINE 登入", "Continue with LINE", "LINE でログイン")}</a>'
            f'<a class="sq-linkbtn" data-login="email" href="/event-login.html">{t("使用 Email 登入", "Sign in with email", "メールでログイン")}</a>'
            f'<button type="button" class="sq-login__close" data-sq-close aria-label="{t("關閉", "Close", "閉じる")}">×</button></dialog>\n')


# ---------------------------------------------------------------- 約書旅（2026-11-04 改版：ui-ux-pro-max「日系質感書店」— 紙與墨、明朝體、直排標題、細線、目次與奧付）
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
               t('約書旅（Rest Book）是你在台北車站旁的貴賓室，就在 Z10 出口斜對面：書可以讀也可以買，有個人讀書席、靜讀室、兩間淋浴與交誼廳。白天 1 小時 NT$200 起，夜間 22:00–08:00 NT$800 起。',
                 'Rest Book is your lounge by Taipei Main Station, across from Exit Z10: books to read or buy, personal study seats, quiet rooms, two showers and a lounge. Daytime from NT$200 an hour; night (22:00–08:00) from NT$800.',
                 '約書旅（Rest Book）は台北駅のそばの、あなたのラウンジ。Z10 出口の斜め向かい。読める・買える本、個人の読書席、静読室、シャワー2室、ラウンジ。日中 1時間 NT$200から、夜間（22:00–08:00）NT$800から。'))
    out += header(s, [(t('時刻表', 'Timetable', '時刻表'), '#gap'), (t('價目', 'Prices', '料金'), '#price'), (t('包場', 'Lounge hire', '貸切'), '#hire'), (t('這裡有什麼', 'What’s here', 'あるもの'), '#here'), (t('常見問題', 'FAQ', 'よくある質問'), '#faq'), (t('洽詢', 'Contact', 'お問い合わせ'), contact)])
    # 價目：KK 2026-11-04 定案（含稅；見 /workspace/local/約書旅/約書旅_商業模型_20261104.md）
    gaps = [
        ('60', t('1 小時', '1 hour', '1時間'), 'NT$200', t('讀完一本短篇集裡的三篇，再到交誼廳坐一下。', 'Three stories from a short collection, then a sit-down in the lounge.', '短編集から三編。そのあとラウンジでひと息。')),
        ('240', t('4 小時', '4 hours', '4時間'), 'NT$600', t('在讀書席把一本薄書讀完，放空一下、梳洗乾淨；喜歡的書就帶走。', 'Finish a slim book at a study seat, pause, freshen up, and take the book with you if you like it.', '読書席で薄い一冊を読み終え、ひと息ついて身支度。気に入った本は買って帰る。')),
        ('480', t('8 小時', '8 hours', '8時間'), 'NT$1,000', t('一整個白天：讀一段、工作一段、放空一段，帶著一本書搭下一班車。', 'A whole day: read, work, unwind, and board the next train with a book in hand.', '丸一日。読んで、働いて、ひと息ついて。一冊を持って次の電車へ。')),
    ]
    picks = ''.join(f'<button type="button" class="rb-gap__pick" data-gap="{k}" aria-pressed="{"true" if i == 0 else "false"}">{e(lbl)}</button>' for i, (k, lbl, _, _) in enumerate(gaps))
    plans = ''.join(f'<li data-gap="{k}"><b>{e(lbl)} · {price}</b><span>{e(txt)}</span></li>' for k, lbl, price, txt in gaps)
    day = [(t('1 小時', '1 hour', '1時間'), 'NT$200'), (t('4 小時', '4 hours', '4時間'), 'NT$600'),
           (t('8 小時', '8 hours', '8時間'), 'NT$1,000'), (t('超時每小時', 'Each extra hour', '延長 1時間ごと'), 'NT$150')]
    night = [(t('週日至週四', 'Sun–Thu', '日〜木曜'), 'NT$800'), (t('週五、週六', 'Fri, Sat', '金・土曜'), 'NT$1,000')]
    dl = lambda items: '<dl>' + ''.join(f'<div><dt>{e(a)}</dt><dd>{e(b)}</dd></div>' for a, b in items) + '</dl>'
    rules = [t('超時 15 分鐘內不收費，超過 15 分鐘以 1 小時計；之後每小時同樣以 15 分鐘為界。', 'Up to 15 minutes over is free; beyond that it counts as an hour, and each further hour follows the same 15-minute rule.', '15分以内の延長は無料。15分を超えると1時間分、以降も1時間ごとに15分を境に計算します。'),
             t('23:00 後查驗證件，限 18 歲以上。', 'ID is checked after 23:00; 18 and over only.', '23:00以降は身分証を確認します。18歳以上のみ。'),
             t('書與淋浴另計。', 'Books and showers are extra.', '本とシャワーは別料金。')]
    rules_html = ''.join(f'<li>{e(x)}</li>' for x in rules)
    # 交誼廳包場：KK 2026-11-04 核准每時段 NT$2,000（11/01 提案 §4.1）；平日 18:00 後與假日；週二 me2 時段不出租。
    hire_rows = [(t('平日 18:00 後、假日', 'Weekday evenings after 18:00, weekends', '平日18:00以降・休日'), 'NT$2,000'), (t('有桌椅人數', 'Seated', '着席人数'), t('約 10 人', 'About 10', '約10名'))]
    hire_rules = ''.join(f'<li>{e(x)}</li>' for x in [
        t('平日、假日同價；平日白天與每週二 19:00–21:00（週二小聚）不出租。', 'Same price on weekdays and weekends. Not available on weekday daytimes or Tuesdays 19:00–21:00 (our weekly meetup).', '平日・休日同料金。平日の日中と毎週火曜 19:00–21:00（週例の集まり）は貸切不可。'),
        t('只租交誼廳；讀書席、靜讀室與淋浴不含在內。擴音使用到 22:00。', 'The lounge only; study seats, quiet rooms and showers are not included. Amplified sound until 22:00.', 'ラウンジのみ。読書席、静読室、シャワーは含まれません。音響の使用は22:00まで。'),
        t('包場享在咖啡、三點水餐飲 9\u00a0折。', '10% off food and drinks at at cafe and 3AM.', '在咖啡・三點水の飲食が10%オフ。')])
    hire_mail = 'mailto:us@emoji.tw?subject=' + t('約書旅交誼廳包場', 'Rest%20Book%20lounge%20hire', '約書旅ラウンジ貸切')
    rows = [
        (t('書架', 'Shelves', '本棚'), t('現場閱讀，喜歡可購買', 'Read on site, buy what you like', 'その場で読める・買える'), t('每本另標價', 'Priced per book', '一冊ごとに価格表示')),
        (t('讀書席', 'Study seats', '読書席'), t('一人一席，安靜閱讀', 'One person, one seat, quiet', '一人一席、静かに'), t('依時段計費', 'Charged by time', '時間制')),
        (t('靜讀室', 'Quiet rooms', '静読室'), t('非密閉、不可上鎖', 'Open, not lockable', '密閉なし・施錠なし'), t('依時段計費', 'Charged by time', '時間制')),
        (t('淋浴', 'Showers', 'シャワー'), t('兩間', 'Two rooms', '2室'), t('另行計費', 'Priced separately', '別料金')),
        (t('交誼廳', 'Lounge', 'ラウンジ'), t('約十人', 'About ten people', '約10名'), t('大螢幕、Switch、漫畫、桌遊', 'Big screen, Switch, manga, board games', '大型画面、Switch、マンガ、ボードゲーム')),
    ]
    table = ''.join(f'<tr><th scope="row">{e(a)}</th><td>{e(b)}</td><td>{e(c)}</td></tr>' for a, b, c in rows)
    faqs = [
        (t('書可以買回家嗎？', 'Can I buy the books?', '本は買えますか？'),
         t('可以。每本書的售價各自標示，到櫃檯結帳。', 'Yes. Each book carries its own price; pay at the counter.', 'はい。価格は一冊ごとに表示しています。カウンターでお会計を。')),
        (t('書架上有哪些書？', 'What kind of books are on the shelves?', 'どんな本がありますか？'),
         t('工作、創業、旅行與在台灣生活的書為主，會持續更換。', 'Mostly work, starting up, travel and life in Taiwan, and the selection changes.', '仕事、起業、旅、台湾での暮らしの本が中心で、随時入れ替わります。')),
        (t('可以淋浴嗎？要帶什麼？', 'Can I shower? What should I bring?', 'シャワーは使えますか？何が必要ですか？'),
         t('有兩間淋浴。毛巾等備品可現場加購，價格以現場公告為準。', 'There are two showers. Towels and toiletries can be bought on site; prices are posted there.', 'シャワーは2室。タオルなどの備品は現地で購入でき、料金は現地で案内しています。')),
        (t('可以過夜或住宿嗎？', 'Can I stay overnight?', '宿泊はできますか？'),
         t('約書旅是閱讀空間，不提供住宿；靜讀室非密閉、不可上鎖。', 'Rest Book is a reading space, not accommodation; quiet rooms are open and not lockable.', '約書旅は読書のためのスペースで、宿泊施設ではありません。静読室は密閉されず施錠もできません。')),
        (t('是車站的貴賓室嗎？拿車票可以進嗎？', 'Is this a station lounge? Does my ticket get me in?', '駅のラウンジですか？乗車券で入れますか？'),
         t('不是。約書旅是獨立經營的閱讀空間，不在車站內，和台鐵、高鐵、捷運都沒有關係；車票不能折抵，依價目付費使用。', 'No. Rest Book is an independent reading space outside the station, not affiliated with TRA, HSR or the MRT. Tickets are not accepted; use is paid per the price list.', 'いいえ。約書旅は駅の外にある独立した読書スペースで、台鉄・高鉄・MRT とは関係ありません。乗車券は使えず、料金表に沿ってお支払いいただきます。')),
        (t('怎麼找到你們？', 'How do I find you?', '場所は？'),
         t('台北車站站前地下街 Z10 出口斜對面，重慶南路一段 11 號。', 'Diagonally across from Exit Z10 of the Taipei Main Station underground mall, No. 11, Sec. 1, Chongqing S. Rd.', '台北駅地下街 Z10 出口の斜め向かい、重慶南路一段11号。')),
    ]
    faq_html = ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in faqs)
    credit = t('圖片：台北車站與學生（約 1930，公有領域）、台北車站月台（4300streetcar，CC BY 4.0）、巴黎書店（Janko Ferlič，CC0）、書商的店（Johannes Jelgerhuis，公有領域），皆取自 Wikimedia Commons；室內為規劃示意。',
               'Pictures: Taipei Railway Station and students, c. 1930 (public domain); Taipei Main Station platform (4300streetcar, CC BY 4.0); a Paris bookshop (Janko Ferlič, CC0); The Bookshop of Pieter Meijer Warnars (Johannes Jelgerhuis, public domain); all via Wikimedia Commons. The interior is a concept rendering.',
               '画像：台北駅と学生（1930年頃、パブリックドメイン）、台北駅のホーム（4300streetcar、CC BY 4.0）、パリの書店（Janko Ferlič、CC0）、書籍商の店（Johannes Jelgerhuis、パブリックドメイン）。いずれも Wikimedia Commons。室内は完成イメージです。')
    def kick(n, zh, en, ja):  # 書店的章節標示：一　時刻表／01 Timetable
        num = f'{n:02d}' if L == 'en' else '一二三四五六七八九'[n - 1]
        return f'<p class="rb-kicker" aria-hidden="true"><span>{num}</span>{e(t(zh, en, ja))}</p>'

    toc = [('#gap', t('空檔時刻表', 'Timetable', 'すき間の時刻表')), ('#price', t('價目', 'Prices', '料金')), ('#hire', t('交誼廳包場', 'Lounge hire', 'ラウンジ貸切')),
           ('#here', t('這裡有什麼', 'What’s here', 'あるもの')), ('#faq', t('常見問題', 'FAQ', 'よくある質問'))]
    toc_html = ''.join(f'<li><a href="{h}"><span>{e(x)}</span></a></li>' for h, x in toc)
    out += f"""<main id="content" class="rb">
<section class="rb-hero" aria-labelledby="rb-title">
  <h1 id="rb-title" class="rb-title"><span class="rb-line">{t('等車，', 'A book', '電車まで、')}</span><span class="rb-line rb-line--step">{t('讀一本書', 'between trains', '一冊の本を')}</span></h1>
  <figure class="rb-hero__photo">{rb_img('bookshop', t('一面放滿書的書架', 'Shelves full of books', '本でいっぱいの本棚'), lazy=False)}<figcaption>{t('書架　參考', 'Shelves — reference', '本棚　参考')}</figcaption></figure>
  <div class="rb-hero__say">
    <p class="rb-hero__where">{t('台北車站　Z10 出口斜對面', 'Taipei Main Station · across from Exit Z10', '台北駅　Z10 出口の斜め向かい')}</p>
    <p>{t('你在台北車站旁的貴賓室。', 'Your lounge by Taipei Main Station.', '台北駅のそばの、あなたのラウンジ。')}</p>
    <p>{t('約書旅在台北車站 Z10 出口斜對面。書可以讀也可以買，還有讀書席、靜讀室、淋浴與交誼廳。', 'Rest Book is across from Exit Z10 of Taipei Main Station. Books to read or buy, study seats, quiet rooms, showers and a lounge.', '約書旅は台北駅 Z10 出口の斜め向かい。読める・買える本、読書席、静読室、シャワー、ラウンジ。')}</p>
    <a class="rb-btn" href="#gap">{t('排你的空檔時間', 'Plan your gap', 'すき間の過ごし方を見る')}</a>
    <nav class="rb-toc" aria-label="{t('目次', 'Contents', '目次')}"><p class="rb-toc__h" aria-hidden="true">{t('目次', 'Contents', '目次')}</p><ol>{toc_html}</ol></nav>
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
  <figure class="rb-intro__wide">{rb_img('platform', t('台北車站的月台', 'A platform at Taipei Main Station', '台北駅のホーム'))}<figcaption>{t('台北車站的月台', 'A platform at Taipei Main Station', '台北駅のホーム')}</figcaption></figure>
</section>

<section class="rb-gap" id="gap" aria-labelledby="gap-h">
  <div class="rb-gap__head">
    {kick(1, '時刻表', 'Timetable', '時刻表')}
    <h2 id="gap-h">{t('你的空檔時刻表', 'Your timetable for the gap', 'すき間の時刻表')}</h2>
    <p>{t('選一個時間，看看這段空檔可以怎麼過。', 'Pick a time and see how the gap could go.', '時間を選ぶと、すき間の過ごし方が見られます。')}</p>
  </div>
  <div class="rb-gap__body">
    <div class="rb-gap__picks" role="group" aria-label="{t('離下一班車還有多久', 'Time until your train', '次の電車までの時間')}">{picks}</div>
    <ul class="rb-gap__plans" aria-live="polite">{plans}</ul>
  </div>
  <figure class="rb-gap__photo">{rb_img('students', t('約 1930 年，台北車站前的學生', 'Students in front of Taipei Railway Station, 1930s', '1930年代、台北駅前の学生たち'))}<figcaption>{t('台北車站前的學生，約 1930 年', 'Students at Taipei Railway Station, c. 1930', '台北駅前の学生、1930年頃')}</figcaption></figure>
</section>

<section class="rb-run" aria-labelledby="run-h">
  <div class="rb-run__side">
    {kick(2, '書架', 'Shelves', '本棚')}
    <h2 id="run-h">{t('書架、讀書席與靜讀室', 'Shelves, seats and quiet', '本棚、読書席、静読室')}</h2>
    <a href="#here">{t('看這裡有什麼', 'See what’s here', 'あるものを見る')}</a>
  </div>
  <div class="rb-run__frames">
    <figure>{rb_img('bookseller', t('十八世紀荷蘭書商的店（畫作）', 'An eighteenth-century Dutch bookshop (painting)', '18世紀オランダの書籍商の店（絵画）'))}<figcaption><span>{t('書商的店', 'A bookshop', '書籍商の店')}</span><span>{t('畫作', 'Painting', '絵画')}</span></figcaption></figure>
    <figure class="rb-run__lift">{rb_img('room', t('約書旅閱讀空間規劃示意', 'Rest Book reading area, concept rendering', '約書旅の読書エリアの完成イメージ'))}<figcaption><span>{t('約書旅', 'Rest Book', '約書旅')}</span><span>{t('規劃示意', 'Concept rendering', '完成イメージ')}</span></figcaption></figure>
    <figure>{rb_img('station', t('約 1930 年的台北車站前廣場', 'The square in front of Taipei Railway Station, c. 1930', '1930年頃の台北駅前'))}<figcaption><span>{t('台北車站前', 'Taipei Station', '台北駅前')}</span><span>{t('約 1930 年', 'c. 1930', '1930年頃')}</span></figcaption></figure>
  </div>
</section>

<section class="rb-price" id="price" aria-labelledby="price-h">
  {kick(3, '價目', 'Prices', '料金')}
  <h2 id="price-h">{t('價目', 'Prices', '料金')}</h2>
  <p class="rb-price__lede">{t('以下為空間使用費，讀書席與靜讀室同價，以完整小時計費。價格含稅。', 'Space-use fees below; study seats and quiet rooms cost the same, charged by the full hour. Prices include tax.', '以下はスペース利用料です。読書席と静読室は同じ料金で、1時間単位の計算です。税込。')}</p>
  <div class="rb-price__grid">
    <div class="rb-price__block"><h3>{t('白天', 'Daytime', '日中')}<span>08:00–22:00</span></h3>{dl(day)}</div>
    <div class="rb-price__block rb-price__block--night"><h3>{t('夜間', 'Night', '夜間')}<span>22:00–08:00</span></h3>{dl(night)}</div>
  </div>
  <ul class="rb-price__rules">{rules_html}</ul>
</section>

<section class="rb-hire" id="hire" aria-labelledby="hire-h">
  <div class="rb-hire__head">
    {kick(4, '包場', 'Lounge hire', '貸切')}
    <h2 id="hire-h">{t('交誼廳包場', 'Hire the lounge', 'ラウンジの貸切')}</h2>
    <p class="rb-price__lede">{t('約十人的小廳，有 100 吋大螢幕、環繞音響、Switch 與桌遊。生日、球賽或演唱會直播、讀書會都合適。', 'A small room for about ten, with a 100-inch screen, surround sound, Switch and board games. Good for birthdays, match or concert screenings, and reading groups.', '約10名の小さな部屋。100インチの大型画面、サラウンド音響、Switch、ボードゲーム。誕生日、試合やライブの観賞、読書会に。')}</p>
    <a class="rb-btn" href="{hire_mail}">{t('來信預約包場', 'Email to book', 'メールで予約')}</a>
  </div>
  <div class="rb-hire__body">
    <div class="rb-price__block"><h3>{t('場地費', 'Fee', '料金')}<span>{t('每時段 2 小時', 'per 2-hour slot', '1枠2時間')}</span></h3>{dl(hire_rows)}</div>
    <ul class="rb-price__rules">{hire_rules}</ul>
  </div>
</section>

<section class="rb-here" id="here" aria-labelledby="here-h">
  {kick(5, '設施', 'Facilities', '設備')}
  <h2 id="here-h">{t('這裡有什麼，怎麼收費', 'What’s here, and what it costs', 'あるものと料金')}</h2>
  <table class="rb-table"><caption>{t('約書旅的設施', 'Rest Book facilities', '約書旅の設備')}</caption><tbody>{table}</tbody></table>
</section>

<section class="rb-faq" id="faq" aria-labelledby="faq-h">
  <div class="rb-faq__head">
    {kick(6, '問答', 'FAQ', '問答')}
    <h2 id="faq-h">{t('出發前想知道的', 'Before you come', '来る前に')}</h2>
  </div>
  <div class="rb-faq__list">{faq_html}</div>
</section>

<section class="rb-contact" aria-labelledby="contact-h">
  <div class="rb-contact__say">
    <h2 id="contact-h">{t('洽詢', 'Contact', 'お問い合わせ')}</h2>
    <p>{t('想找某一本書、想寄賣、或想在這裡辦讀書會，寫信給我們。', 'Looking for a title, want to consign books, or hold a reading group here? Write to us.', '探している本、委託販売、読書会の相談は、メールでどうぞ。')}</p>
  </div>
  <dl class="rb-colophon">
    <div><dt>{t('店名', 'Name', '店名')}</dt><dd>約書旅 Rest Book</dd></div>
    <div><dt>{t('所在', 'Address', '所在地')}</dt><dd>{e(ADDRESS[L])}</dd></div>
    <div><dt>{t('來信', 'Email', 'メール')}</dt><dd><a href="{contact}">us@emoji.tw</a></dd></div>
    <div><dt>{t('地圖', 'Map', '地図')}</dt><dd><a href="{MAP}" target="_blank" rel="noopener">{t('Google 地圖', 'Google Maps', 'Google マップ')}</a></dd></div>
  </dl>
</section>
<p class="rb-credit">{e(credit)}</p>
</main>
<script>(function(){{var r=document.documentElement;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)r.classList.add('rb-anim');
var p=document.querySelectorAll('.rb-gap__pick'),l=document.querySelectorAll('.rb-gap__plans li');function show(k){{p.forEach(function(b){{b.setAttribute('aria-pressed',b.dataset.gap===k?'true':'false')}});l.forEach(function(x){{x.hidden=x.dataset.gap!==k}})}}
if(p.length){{r.classList.add('rb-js');p.forEach(function(b){{b.addEventListener('click',function(){{show(b.dataset.gap)}})}});show('60')}}
if(!('IntersectionObserver' in window))return;var io=new IntersectionObserver(function(es){{es.forEach(function(x){{if(x.isIntersecting){{x.target.classList.add('is-in');io.unobserve(x.target)}}}})}},{{rootMargin:'0px 0px -8% 0px'}});document.querySelectorAll('.rb section').forEach(function(x){{io.observe(x)}})}})()</script>
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
