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
  <div class="sq-stage__caption"><span>{t('規劃示意', 'Concept rendering', '完成イメージ')}</span><span>08:00–03:00</span></div>
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


def build():
    global L
    for L in LANGS:
        d = OUT if L == 'zh' else OUT / L
        d.mkdir(parents=True, exist_ok=True)
        for slug, fn in (('at-cafe', page_cafe), ('3am', page_3am), ('stay-square', page_stay)):
            (d / f'{slug}.html').write_text(fn(), encoding='utf-8')
            print('wrote', d / f'{slug}.html')


build()
