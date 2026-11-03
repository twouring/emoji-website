#!/usr/bin/env python3
"""產生子品牌獨立站 public/brand-sites/{,en/,ja/}{at-cafe,3am,stay-square}.html（三語）。
網域：atcafe.emoji.tw／3am.emoji.tw／staysquare.emoji.tw（server.js BRAND_HOSTS 依 host 分流）；
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


def head(slug, title, desc):
    b = BRANDS[slug]
    url = page_url(b['host'], L)
    root = f"https://{b['host']}/"
    extra_css = '\n<link rel="stylesheet" href="/brand-sites/3am-dark-room.css">' if slug == '3am' else ''
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
<meta property="og:image" content="{root}brand-sites/assets/{slug}-avatar.webp">
<meta name="twitter:card" content="summary">
{ld}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@500;700&display=swap" rel="stylesheet">
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
    near = t('台北車站站前地下街 Z10 出口斜對面', 'Diagonally across from Exit Z10, Taipei Main Station underground mall', '台北駅地下街 Z10 出口の斜め向かい')
    small = t('台北車站站前地下街 Z10 出口斜對面；捷運、台鐵、高鐵都在步行範圍內。',
              'Diagonally across from Exit Z10 of the Taipei Main Station underground mall; MRT, TRA and HSR are all within walking distance.',
              '台北駅地下街 Z10 出口の斜め向かい。MRT、台鉄、高鉄はいずれも徒歩圏内です。')
    return f'''<section class="bs-alt" id="visit" aria-labelledby="visit-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('visit-h', '怎麼來', 'Visit', 'アクセス')}<p>{e(near)}</p></div>
  <div class="bs-visit">
    <div>
      <address>{e(ADDRESS[L])}<small>{e(small)}</small></address>
      <dl>{rows}<div><dt>{t('電話', 'Phone', '電話')}</dt><dd><a href="{TEL_HREF}">{e(TEL_TEXT)}</a></dd></div><div><dt>Email</dt><dd><a href="mailto:us@emoji.tw">us@emoji.tw</a></dd></div><div><dt>Instagram</dt><dd><a href="https://www.instagram.com/{b['ig']}" target="_blank" rel="noopener">@{b['ig']}</a></dd></div></dl>
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
    return f'''<footer class="bs-foot"><div class="wrap">
  <div class="bs-foot__grid">
    <div class="bs-foot__brand"><img src="/brand-sites/assets/{slug}-logo.webp" alt="{e(b['alt'][L])}" loading="lazy" decoding="async"></div>
    <div><h4>{t('聯絡', 'Contact', 'お問い合わせ')}</h4><ul><li>{e(ADDRESS[L])}</li><li><a href="{TEL_HREF}">{e(TEL_TEXT)}</a></li><li><a href="mailto:us@emoji.tw">us@emoji.tw</a></li><li><a href="https://www.instagram.com/{b['ig']}" target="_blank" rel="noopener">Instagram @{b['ig']}</a></li></ul></div>
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
def page_cafe():
    s = 'at-cafe'
    reserve = www('/reserve')
    out = head(s, t('在咖啡 at cafe｜台北車站旁的日式簡餐與工作咖啡',
                    '在咖啡 at cafe | Japanese set meals and working coffee by Taipei Main Station',
                    '在咖啡 at cafe｜台北駅そばの定食とワーキングコーヒー'),
               t('在咖啡（at cafe）是台北車站旁的日式簡餐與工作咖啡，08:00–17:00。早餐、午餐、下午的咖啡，或約人碰面，不需會員。台北車站站前地下街 Z10 出口斜對面。',
                 'at cafe: Japanese set meals and working coffee by Taipei Main Station, 08:00–17:00. Breakfast, lunch, an afternoon coffee or a meeting, no membership needed. Diagonally across from Exit Z10.',
                 '在咖啡（at cafe）は台北駅そばの日本式の定食とワーキングコーヒー。08:00–17:00。朝食、ランチ、午後のコーヒー、待ち合わせに。会員登録不要。台北駅地下街 Z10 出口の斜め向かい。'))
    out += header(s, [(t('介紹', 'About', '紹介'), '#about'), (t('菜單', 'Menu', 'メニュー'), '#menu'), (t('常見問題', 'FAQ', 'よくある質問'), '#faq'), (t('怎麼來', 'Visit', 'アクセス'), '#visit'), (t('訂位', 'Reserve', '予約'), reserve)])
    out += f'''<main id="content">
<section class="bs-hero"><div class="wrap bs-hero__grid">
  <div>
    <span class="bs-hero__kicker">{t('日式簡餐與工作咖啡 · 台北車站旁', 'Japanese set meals & working coffee · by Taipei Main Station', '日本式の定食とワーキングコーヒー · 台北駅そば')}</span>
    <h1>在咖啡<span class="en">at cafe</span></h1>
    <p class="bs-hero__lede">{t('白天的日式簡餐與工作咖啡。早餐、午餐、下午的咖啡，或約人碰面。一人一杯飲料，就可以坐下來；不需會員。',
                                 'Japanese set meals and working coffee by day. Breakfast, lunch, an afternoon coffee, or a place to meet. One drink per person and the table is yours; no membership needed.',
                                 '昼の日本式の定食とワーキングコーヒー。朝食、ランチ、午後のコーヒー、待ち合わせにも。ドリンク一杯で席に着けます。会員登録は不要です。')}</p>
    <div class="bs-hero__open"><span><b>08:00–17:00</b>{t('每日營業', 'Open daily', '毎日営業')}</span><span>{t('台北車站 Z10 出口斜對面', 'Across from Taipei Main Station Exit Z10', '台北駅 Z10 出口の斜め向かい')}</span></div>
    <div class="bs-hero__actions"><a class="bs-btn" href="#menu">{t('查看菜單', 'View menu', 'メニューを見る')}</a><a class="bs-btn bs-btn--line" href="{reserve}">{t('立即訂位', 'Book a table', '席を予約')}</a></div>
  </div>
  <figure class="bs-hero__mark"><img src="/brand-sites/assets/at-cafe-logo.webp" alt="{e(BRANDS[s]['alt'][L])}" width="624" height="595" decoding="async" fetchpriority="high"></figure>
</div></section>

<section id="about" aria-labelledby="about-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('about-h', '白天在這裡', 'By day', '昼はここで')}</div>
  {facts([(t('用途', 'Use', '用途'), t('用餐、外帶與會客', 'Dining, takeaway and meetings', '飲食、テイクアウト、打ち合わせ')),
          (t('時段', 'Hours', '営業時間'), '08:00–17:00'),
          (t('使用資格', 'Access', '利用条件'), t('所有訪客，不需會員', 'Open to everyone; no membership required', 'どなたでも利用可。会員登録不要')),
          (t('費用', 'Price', '料金'), t('依菜單；分一般價與聚落價', 'See menu; standard and Hub rates', 'メニュー参照。通常価格とハブ価格'))])}
  <div class="bs-feat bs-feat--gap">
    <figure class="bs-feat__moji"><img src="/brand-sites/assets/moji-coffee.svg" alt="" width="200" height="200" loading="lazy"><figcaption>{t('moji · 白日咖啡', 'moji · daytime coffee', 'moji · 昼のコーヒー')}</figcaption></figure>
    {points([(t('早餐與日式簡餐', 'Breakfast and Japanese set meals', '朝食と日本式の定食'),
              t('開放式三明治、貝果、飯糰、冷蕎麥麵；自製布丁、巴斯克與可麗露。早上一杯咖啡、中午一份簡餐，在台北車站旁把一餐好好吃完。',
                'Open sandwiches, bagels, onigiri and cold soba; house pudding, Basque cheesecake and canelé. A coffee in the morning, a set meal at noon, right by Taipei Main Station.',
                'オープンサンド、ベーグル、おにぎり、冷たいそば。自家製プリン、バスクチーズケーキ、カヌレ。朝は一杯のコーヒー、昼は定食を、台北駅のそばで。')),
             (t('工作咖啡', 'Working coffee', 'ワーキングコーヒー'),
              t('帶著電腦來，咖啡、茶或氣泡飲，配一段專心的工作時間。座位給不趕時間的人。',
                'Bring your laptop. Coffee, tea or a sparkling drink, and a stretch of focused work. The seats are for those not in a hurry.',
                'パソコンを持ち込んで。コーヒー、お茶、スパークリングドリンクと、集中の時間を。席は急がない人のために。')),
             (t('約人碰面與外帶', 'Meetings and takeaway', '待ち合わせとテイクアウト'),
              t('跟客戶、朋友約在車站旁，出站斜對面就到。趕車的人從外帶窗口拿了就走。',
                'Meet clients or friends by the station, diagonally across from the exit. In a hurry? Grab it from the takeaway window and go.',
                '取引先や友人と駅のそばで。出口の斜め向かいです。急ぐ人はテイクアウト窓口で受け取って、そのまま。'))])}
  </div>
</div></section>
'''
    out += story('story-h', '關於在咖啡', 'About at cafe', '在咖啡について', [
        ('在咖啡開在台北車站旁一棟民國 58 年的老屋裡，白天是明亮的日式簡餐與手沖咖啡，設有外帶視窗。約 25 坪、內用 32 席、長吧檯。',
         'at cafe sits in a 1969 house by Taipei Main Station. By day it is a bright room for Japanese set meals and pour-over coffee, with a takeaway window. About 25 ping, 32 seats and a long counter.',
         '在咖啡は、台北駅そばの 1969 年築の古い建物にあります。昼は明るい日本式の定食とハンドドリップコーヒー、テイクアウト窓口もあります。約 25 坪、32 席、ロングカウンター。'),
        ('台北車站每天有很多人經過。我們的目標很小：讓其中一個人坐下來，把這杯喝完。你今天會遇到誰，我們不保證；但桌子是同一張。',
         'A great many people pass Taipei Main Station every day. Our goal is small: get one of them to sit down and finish the cup. We can’t promise who you’ll meet today, but the table is the same one.',
         '台北駅を通る人はとても多い。私たちの目標は小さくて、そのうちの一人に座って一杯を飲み終えてもらうこと。今日誰と出会うかは約束できませんが、テーブルは同じです。'),
        ('菜單價格含稅，分一般價與聚落價；聚落價給已加入聚落的會員。不需會員也能來。',
         'Menu prices include tax, with a standard rate and a Hub rate; the Hub rate is for Hub members. No membership is needed to visit.',
         'メニュー価格は税込で、通常価格とハブ価格があります。ハブ価格はハブ参加者向け。会員でなくてもご利用いただけます。'),
    ])
    out += f'''<section class="bs-alt bs-menu" id="menu" aria-labelledby="menu-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('menu-h', '菜單', 'Menu', 'メニュー')}<p>{t('價格含稅；聚落價限已加入聚落者', 'Prices include tax; Hub rates are for Hub members', '価格は税込。ハブ価格はハブ参加者のみ')}</p></div>
  <div data-menu="CAFE"></div>
  <div class="bs-menu__cta"><a class="bs-btn" href="{reserve}">{t('立即訂位', 'Book a table', '席を予約')}</a></div>
</div></section>

<section id="faq" aria-labelledby="faq-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('faq-h', '常見問題', 'FAQ', 'よくある質問')}</div>
  {faq([(t('需要會員才能進來嗎？', 'Do I need a membership?', '会員でないと入れませんか？'),
         t('不需要。在咖啡對所有訪客開放，一人一杯飲料就能入座。', 'No. at cafe is open to everyone; one drink per person and you can take a seat.', 'いいえ。在咖啡はどなたでも利用でき、お一人一杯のドリンクで席に着けます。')),
        (t('可以帶電腦工作嗎？', 'Can I work here on my laptop?', 'パソコンで仕事をしてもいいですか？'),
         t('可以。白天的座位歡迎工作；如果需要更長時間或淋浴、休憩，可詢問會員方案。', 'Yes. The daytime seats welcome work; if you need longer hours, showers or rest, ask about membership plans.', 'はい。昼の席は仕事にお使いいただけます。長時間の利用やシャワー、休憩が必要な場合は会員プランをお尋ねください。')),
        (t('可以外帶嗎？', 'Is takeaway available?', 'テイクアウトはできますか？'),
         t('可以。飲品與餐點都能外帶，趕時間的人從外帶窗口拿了就走。', 'Yes. Drinks and food are available to go; grab them from the takeaway window.', 'はい。ドリンクも料理もテイクアウトでき、急ぐ方はテイクアウト窓口で受け取れます。')),
        (t('怎麼訂位？', 'How do I book?', '予約はどうすればいいですか？'),
         t('請用線上訂位；也歡迎直接來。', 'Use the online reservation page; walk-ins are welcome too.', 'オンライン予約をご利用ください。直接のご来店も歓迎です。')),
        (t('聚落價是什麼？', 'What is the Hub rate?', 'ハブ価格とは？'),
         t('菜單上標示的會員價。購買會員方案或單日會員即加入聚落，點餐享聚落價。', 'The member price shown on the menu. Buying any membership plan or day pass makes you a Hub member.', 'メニューに表示される会員価格です。会員プランまたは1日会員の購入でハブに参加できます。'))])}
</div></section>
'''
    out += visit([(t('營業時間', 'Hours', '営業時間'), t('每日 08:00–17:00', 'Daily 08:00–17:00', '毎日 08:00–17:00')),
                  (t('最後點餐', 'Last orders', 'ラストオーダー'), t('以現場公告為準', 'As posted on site', '店内の案内に準じます'))], s)
    out += '</main>\n'
    out += footer_html(s, [(t('查看菜單', 'View menu', 'メニュー'), '#menu'), (t('訂位', 'Book', '予約'), reserve)])
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
    book = www('/system#booking')
    out = head(s, t('等等空間 Stay Square｜台北車站旁的會員休息與工作空間',
                    '等等空間 Stay Square | Members’ space for rest and work by Taipei Main Station',
                    '等等空間 Stay Square｜台北駅そばの会員向け休憩・ワークスペース'),
               t('等等空間（Stay Square）是台北車站旁的會員休息與工作空間：共享辦公、看書休憩、交誼與淋浴，也是講座與社群活動的場地。單日 4 小時 NT$200 起，台北車站站前地下街 Z10 出口斜對面。',
                 'Stay Square is the members’ space for rest and work by Taipei Main Station: coworking, reading and resting, socializing and showers, and the venue for talks and community events. Day pass from NT$200 for 4 hours. Diagonally across from Exit Z10.',
                 '等等空間（Stay Square）は台北駅そばの会員のための休憩と仕事のスペース。コワーキング、読書や休憩、交流、シャワー。講座やコミュニティイベントの会場にもなります。1日4時間 NT$200 から。台北駅地下街 Z10 出口の斜め向かい。'))
    out += header(s, [(t('空間', 'Spaces', 'スペース'), '#rooms'), (t('會員方案', 'Membership', '会員プラン'), '#plans'), (t('活動與包場', 'Events & venue', 'イベント・貸切'), '#booking'), (t('怎麼來', 'Visit', 'アクセス'), '#visit'), (t('加入會員', 'Join', '会員になる'), app)])
    concept = t('規劃示意', 'Concept rendering', '完成イメージ')
    out += f'''<main id="content">
<section class="bs-hero bs-hero--brand"><div class="wrap bs-hero__grid">
  <div>
    <span class="bs-hero__kicker">{t('會員的休息與工作空間 · 台北車站旁', 'Members’ space for rest and work · by Taipei Main Station', '会員のための休憩と仕事のスペース · 台北駅そば')}</span>
    <h1>等等空間<span class="en">Stay Square</span></h1>
    <p class="bs-hero__lede">{t('在台北車站旁，等一下也能好好待著。共享辦公、看書休憩、交誼與淋浴，也是講座與社群活動的場地。',
                                 'Right by Taipei Main Station, a good place to stay a while. Coworking, reading and resting, socializing and showers, and the venue for talks and community events.',
                                 '台北駅のそばで、ちょっとの時間も心地よく過ごせる場所。コワーキング、読書や休憩、交流、シャワー。講座やコミュニティイベントの会場にもなります。')}</p>
    <div class="bs-hero__open"><span><b>NT$200</b>{t('單日 4 小時起', 'Day pass, from 4 hours', '1日 4時間から')}</span><span>{t('24 小時為條件式啟用', '24-hour access is conditional', '24時間利用は条件付き')}</span></div>
    <div class="bs-hero__actions"><a class="bs-btn bs-btn--on" href="#plans">{t('比較會員方案', 'Compare memberships', '会員プランを比較')}</a><a class="bs-btn bs-btn--on-line" href="{app}">{t('在會員 App 加入', 'Join in the member app', '会員アプリで加入')}</a></div>
  </div>
  <figure class="bs-hero__mark"><img src="/brand-sites/assets/stay-square-logo-white.webp" alt="{e(BRANDS[s]['alt'][L])}" width="845" height="590" decoding="async" fetchpriority="high"></figure>
</div></section>

<section id="rooms" aria-labelledby="rooms-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('rooms-h', '空間', 'Spaces', 'スペース')}<p>{t('持有效會籍的會員使用；所有設備自由使用', 'For members with a valid membership; all facilities free to use', '有効な会員資格を持つ会員向け。設備はすべて自由に利用可')}</p></div>
  <div class="bs-rooms">
    <article class="bs-room"><figure data-image="2"><img src="/assets/space/2f-concept.jpg" alt="{t('等等空間膠囊休憩席規劃示意', 'Stay Square capsule rest seats, concept rendering', 'Stay Square カプセル休憩席の完成イメージ')}" width="1200" height="743" loading="lazy" decoding="async"><figcaption>{concept}</figcaption></figure>
      <div class="bs-room__body"><h3>{t('休息與淋浴', 'Rest and showers', '休憩とシャワー')}</h3><p>{t('看書休憩、膠囊休憩席、交誼廳與淋浴。', 'Reading and rest seats, capsule rest seats, social room and showers.', '読書・休憩席、カプセル休憩席、ソーシャルルーム、シャワー。')}</p><div class="md-content" data-md="2"></div></div></article>
    <article class="bs-room"><figure data-image="3"><img src="/assets/space/3f-concept.jpg" alt="{t('等等空間共享辦公與活動空間規劃示意', 'Stay Square coworking and event space, concept rendering', 'Stay Square コワーキング・イベントスペースの完成イメージ')}" width="1400" height="845" loading="lazy" decoding="async"><figcaption>{concept}</figcaption></figure>
      <div class="bs-room__body"><h3>{t('共享工作與活動', 'Coworking and events', 'コワーキングとイベント')}</h3><p>{t('共享辦公；講座、工作坊、社群交流與企業包場。約 08:00–翌日 03:00。', 'Coworking; talks, workshops, community gatherings and business private hire. About 08:00–03:00 next day.', 'コワーキング。講座、ワークショップ、交流会、企業貸切。約 08:00–翌03:00。')}</p><div class="md-content" data-md="3"></div></div></article>
    <article class="bs-room"><figure data-image="4"><img src="/assets/space/4f-concept.jpg" alt="{t('等等空間洗衣區規劃示意', 'Stay Square laundry area, concept rendering', 'Stay Square ランドリーの完成イメージ')}" width="1400" height="867" loading="lazy" decoding="async"><figcaption>{concept}</figcaption></figure>
      <div class="bs-room__body"><h3>{t('洗衣與戶外吸菸區', 'Laundry and outdoor smoking area', 'ランドリーと屋外喫煙エリア')}</h3><p>{t('洗脫烘與戶外吸菸區，會員免費使用。', 'Wash-and-dry laundry and an outdoor smoking area, free for members.', '洗濯乾燥と屋外喫煙エリア。会員は無料。')}</p><div class="md-content" data-md="4"></div></div></article>
  </div>
  <div class="bs-feat bs-feat--gap">
    <figure class="bs-feat__moji"><img src="/brand-sites/assets/moji-rest.svg" alt="" width="200" height="200" loading="lazy"><figcaption>{t('moji · 休憩', 'moji · rest', 'moji · 休憩')}</figcaption></figure>
    {points([(t('轉乘空檔', 'Transfer gaps', '乗り換えの空き時間'),
              t('高鐵、台鐵、客運之間的幾個小時，有地方坐、有地方洗澡。', 'A few hours between HSR, TRA and the bus: somewhere to sit and somewhere to shower.', '高鉄・台鉄・バスの間の数時間。座れる場所、シャワーを浴びられる場所。')),
             (t('工作據點', 'A work base', '仕事の拠点'),
              t('固定在台北車站周邊工作，選月、季或年會籍。', 'Working around Taipei Main Station regularly? Choose a monthly, quarterly or annual membership.', '台北駅周辺で定期的に働くなら、月・四半期・年会員を。')),
             (t('休息與轉換', 'Rest and reset', '休憩と切り替え'),
              t('工作告一段落，看書、使用休憩席，或到交誼廳玩 Switch、看漫畫、玩桌遊。', 'When work is done: read, take a rest seat, or unwind in the social room with Switch, manga and board games.', '仕事が一段落したら、読書や休憩席、ソーシャルルームで Switch・マンガ・ボードゲームを。'))])}
  </div>
</div></section>
'''
    out += story('story-h', '關於等等空間', 'About Stay Square', '等等空間について', [
        ('等等空間在台北車站旁一棟民國 58 年的老屋裡，老屋斜屋頂與木樑下是共享辦公與活動場，另有看書休憩、膠囊休憩席、交誼廳、淋浴與洗脫烘。',
         'Stay Square is in a 1969 house by Taipei Main Station. Under the old pitched roof and timber beams are the coworking and event space, plus reading and rest seats, capsule rest seats, a social room, showers and laundry.',
         '等等空間は、台北駅そばの 1969 年築の古い建物にあります。古い斜め屋根と木梁の下にコワーキングとイベントスペース、ほかに読書・休憩席、カプセル休憩席、ソーシャルルーム、シャワー、洗濯乾燥があります。'),
        ('「等等」是等一下的意思。轉乘之間、兩個會議之間、下班到末班車之間，等一下也能好好待著。',
         '“等等” means “just a moment”. Between transfers, between meetings, between the end of work and the last train: a good place to stay a while.',
         '「等等」は「ちょっと待って」の意味。乗り換えの間、会議と会議の間、仕事終わりから終電までの間、少しの時間を心地よく。'),
        ('會員以人臉辨識進出，席位掃 QR 自助登記計時；24 小時使用為條件式啟用。會員方案一次付費、不自動續約。',
         'Members enter by face recognition and check in at each seat by QR code; 24-hour access is conditional. Plans are one-time payments with no auto-renewal.',
         '会員は顔認証で入退室し、席ごとに QR でチェックイン。24 時間利用は条件付きです。会員プランは一回払いで自動更新はありません。'),
    ])
    out += f'''<section class="bs-alt" id="plans" aria-labelledby="plans-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('plans-h', '會員方案', 'Membership', '会員プラン')}<p>{t('價格皆含稅；一次付費，不自動續約', 'All prices include tax; one-time payment, no auto-renewal', '価格はすべて税込。一回払いで自動更新なし')}</p></div>
  <table class="bs-plans">
    <thead><tr><th scope="col">{t('方案', 'Plan', 'プラン')}</th><th scope="col">{t('價格', 'Price', '価格')}</th><th scope="col">{t('適合情境', 'Best for', 'おすすめ')}</th><th scope="col">{t('包含內容', 'Includes', '内容')}</th></tr></thead>
    <tbody>
      <tr><td>{t('單日 4 小時', 'Day pass · 4 hours', '1日 4時間')}</td><td class="p">NT$200</td><td>{t('轉乘空檔、半天會議或短時工作', 'A transfer gap, half-day meeting or short work session', '乗り換えの空き時間、半日の打ち合わせ、短時間の仕事')}</td><td>{t('可使用等等空間、所有設備；超時每小時 NT$100', 'Stay Square access and all facilities; extra time NT$100 per hour', 'Stay Squareと全設備を利用可。延長は1時間 NT$100')}</td></tr>
      <tr><td>{t('單日 12 小時', 'Day pass · 12 hours', '1日 12時間')}</td><td class="p">NT$500</td><td>{t('從白天工作到晚上', 'Working from daytime into the evening', '昼から夜までの仕事')}</td><td>{t('可使用等等空間、所有設備；超時每小時 NT$100', 'Stay Square access and all facilities; extra time NT$100 per hour', 'Stay Squareと全設備を利用可。延長は1時間 NT$100')}</td></tr>
      <tr><td>{t('月會員', 'Monthly', '月会員')}</td><td class="p">NT$4,000</td><td>{t('一個月內常在台北車站周邊工作', 'Frequent work near Taipei Main Station during one month', '台北駅周辺で1か月間よく仕事する')}</td><td>{t('等等空間通行、所有設備自由使用', 'Stay Square access; all facilities free to use', 'Stay Squareを利用可。全設備を自由に利用')}</td></tr>
      <tr><td>{t('季會員', 'Quarterly', '四半期会員')}</td><td class="p">NT$10,000</td><td>{t('一季內持續使用', 'Consistent use through one quarter', '四半期を通じた継続利用')}</td><td>{t('等等空間通行、所有設備自由使用', 'Stay Square access; all facilities free to use', 'Stay Squareを利用可。全設備を自由に利用')}</td></tr>
      <tr><td>{t('年會員', 'Annual', '年会員')}</td><td class="p">NT$35,000</td><td>{t('把這裡當長期工作據點', 'A long-term work base in Taipei', '台北での長期的な仕事拠点')}</td><td>{t('等等空間通行、所有設備自由使用', 'Stay Square access; all facilities free to use', 'Stay Squareを利用可。全設備を自由に利用')}</td></tr>
    </tbody>
  </table>
  <p class="bs-note">{t('線上購買後首次進場時啟用；也可以現場辦理。', 'Online purchases activate on your first visit; you can also sign up on site.', 'オンライン購入後、初回入場時に有効化。現地でも申し込めます。')}</p>
  <div class="bs-menu__cta"><a class="bs-btn" href="{app}">{t('在會員 App 購買', 'Buy in the member app', '会員アプリで購入')}</a><a class="bs-btn bs-btn--line" href="{www('/system#membership')}">{t('完整消費方式', 'Full pricing guide', '料金のご案内')}</a></div>
</div></section>

<section id="booking" aria-labelledby="booking-h"><div class="wrap">
  <div class="bs-sec__head">{sec_h2('booking-h', '活動與包場', 'Events & venue', 'イベント・貸切')}<p>{t('等等空間共享活動區、等等空間交誼廳', 'Stay Square shared event space and social room', 'Stay Square 共有スペースとソーシャルルーム')}</p></div>
  {facts([(t('包場場地費', 'Private hire', '貸切会場費'), t('1–10 人 NT$5,000／時段起，依人數計', 'From NT$5,000 per slot for 1–10 guests, priced by group size', '1〜10名 NT$5,000／枠から。人数により変動')),
          (t('時段', 'Slot', '時間枠'), t('2 小時，贈前後各 30 分鐘場佈場復', '2 hours, with 30 minutes before and after for setup and reset', '2時間。前後各30分の設営・撤収時間込み')),
          (t('折抵', 'Credit', '充当'), t('場地費可全額折抵當場餐飲', 'The venue fee can be used in full as same-day food and drink', '会場費は全額を当日の飲食に充当可')),
          (t('公開活動', 'Public events', '公開イベント'), t('不收場地費；參加者付 NT$150 場地茶飲費', 'No venue fee; each guest pays a NT$150 venue and tea fee', '会場費なし。参加者1名 NT$150 の会場・お茶代'))])}
  {faq([(t('怎麼加入會員？', 'How do I join?', '会員になるには？'),
         t('在會員 App 選方案線上購買，首次進場時啟用；也可以現場辦理。', 'Pick a plan in the member app and buy online; it activates on your first visit. You can also sign up on site.', '会員アプリでプランを選んでオンライン購入。初回入場時に有効化されます。現地でも申し込めます。')),
        (t('可以過夜或住宿嗎？', 'Can I stay overnight?', '宿泊はできますか？'),
         t('等等空間是看書休憩與工作空間，不提供住宿。膠囊休憩席非密閉、不可上鎖。', 'Stay Square is a reading, rest and work space, not accommodation. Capsule rest seats are open pods and not lockable.', '等等空間は読書・休憩と仕事のスペースで、宿泊施設ではありません。カプセル休憩席は密閉されず、施錠もできません。')),
        (t('24 小時都能用嗎？', 'Is it open 24 hours?', '24 時間使えますか？'),
         t('24 小時使用為條件式啟用，以現場公告為準。', '24-hour access is conditional; see notices on site.', '24 時間利用は条件付きです。現地の案内をご確認ください。')),
        (t('非會員可以辦活動嗎？', 'Can non-members host events?', '非会員でもイベントを開けますか？'),
         t('可以。社群活動與企業包場請填申請表；包場場地費可全額折抵當場餐飲。', 'Yes. Apply with the event form for community events and private hire; the venue fee can be used in full as same-day food and drink.', 'はい。コミュニティイベントや企業貸切は申請フォームからどうぞ。会場費は全額を当日の飲食に充当できます。'))])}
  <div class="bs-menu__cta"><a class="bs-btn" href="{www('/events?apply=1#ev-apply')}">{t('申請活動或包場', 'Apply for an event or private hire', 'イベント・貸切を申請')}</a><a class="bs-btn bs-btn--line" href="{book}">{t('場地費與包場價目', 'Venue fees and buyout prices', '会場費・貸切料金')}</a></div>
</div></section>
'''
    out += visit([(t('使用時間', 'Hours', '利用時間'), t('會員使用；24 小時為條件式啟用', 'Members only; 24-hour access is conditional', '会員利用。24時間利用は条件付き')),
                  (t('進出', 'Entry', '入退室'), t('人臉辨識；席位掃 QR 登記', 'Face recognition; QR check-in per seat', '顔認証。席ごとに QR でチェックイン'))], s)
    out += '</main>\n'
    out += footer_html(s, [(t('加入會員', 'Join', '会員になる'), app), (t('會員方案', 'Memberships', '会員プラン'), '#plans')])
    return out


def build():
    global L
    for L in LANGS:
        d = OUT if L == 'zh' else OUT / L
        d.mkdir(parents=True, exist_ok=True)
        for slug, fn in (('at-cafe', page_cafe), ('3am', page_3am), ('stay-square', page_stay)):
            (d / f'{slug}.html').write_text(fn(), encoding='utf-8')
            print('wrote', d / f'{slug}.html')


build()
