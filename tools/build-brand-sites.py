#!/usr/bin/env python3
"""產生子品牌獨立站 public/brand-sites/{at-cafe,3am,stay-square}.html。
網域：atcafe.emoji.tw／3am.emoji.tw／staysquare.emoji.tw（server.js BRAND_HOSTS 依 host 分流）。
識別依 cis.emoji.tw/brands；菜單（data-menu）與空間文案（data-md／data-image）由 lib/public-render.renderSpace 伺服器端填入。
改內容改這支再重跑：python3 tools/build-brand-sites.py"""
import html, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'brand-sites'
footer = (ROOT / 'views/partials/footer-zh.html').read_text(encoding='utf-8')
TEL = re.search(r'href="(tel:[^"]+)">([^<]+)<', footer)
assert TEL, 'footer-zh.html 找不到電話'
TEL_HREF, TEL_TEXT = TEL.group(1), TEL.group(2)

WWW = 'https://www.emoji.tw'
MAP = 'https://maps.app.goo.gl/aFdoEB3RhweCqLbQ9'
ADDRESS = '台北市中正區重慶南路一段 11 號'

BRANDS = {
    'at-cafe': dict(host='atcafe.emoji.tw', zh='在咖啡', en='at cafe', color='#984C37',
                    alt='在咖啡 at cafe 標誌', venue='CAFE', schema='CafeOrCoffeeShop'),
    '3am': dict(host='3am.emoji.tw', zh='三點水', en='3AM', color='#6B8FAB',
                alt='三點水 3AM Bistro 標誌', venue='BAR', schema='BarOrPub'),
    'stay-square': dict(host='staysquare.emoji.tw', zh='等等空間', en='Stay Square', color='#2B4064',
                        alt='等等空間 Stay Square 標誌', venue=None, schema=None),
}
ORDER = ['at-cafe', '3am', 'stay-square']
e = html.escape


def head(slug, title, desc):
    b = BRANDS[slug]
    url = f"https://{b['host']}/"
    ld = ''
    if b['schema']:
        ld = ('<script type="application/ld+json">{"@context":"https://schema.org","@type":"%s","name":"%s %s",'
              '"url":"%s","image":"%s/brand-sites/assets/%s-logo.webp","telephone":"%s",'
              '"address":{"@type":"PostalAddress","streetAddress":"%s","addressLocality":"台北市","addressCountry":"TW"},'
              '"parentOrganization":{"@type":"Organization","name":"言文字｜台灣人才聚落","url":"%s/"}}</script>\n'
              % (b['schema'], b['zh'], b['en'], url, url.rstrip('/'), slug, TEL_HREF[4:], ADDRESS, WWW))
    return f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="{b['color']}">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<link rel="icon" href="/brand-sites/assets/{slug}-avatar.webp" type="image/webp">
<link rel="apple-touch-icon" href="/brand-sites/assets/{slug}-avatar.webp">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{b['zh']} {b['en']}｜言文字｜台灣人才聚落">
<meta property="og:locale" content="zh_TW">
<meta property="og:image" content="{url}brand-sites/assets/{slug}-avatar.webp">
<meta name="twitter:card" content="summary">
{ld}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/space-dir.css">
<link rel="stylesheet" href="/brand-sites/brand.css">
</head>
<body class="bs bs--{slug}">
<a href="#content" class="skip-link">跳至主要內容</a>
'''


def header(slug, nav):
    b = BRANDS[slug]
    logo = f'/brand-sites/assets/{slug}-logo-h.webp'
    links = ''.join(f'<a href="{h}">{t}</a>' for t, h in nav[:-1])
    t, h = nav[-1]
    return f'''<header class="bs-head"><div class="wrap bs-head__in">
  <div class="bs-head__brand"><a class="bs-head__logo" href="/" aria-label="{b['zh']} {b['en']} 首頁"><img src="{logo}" alt="{e(b['alt'])}" decoding="async"></a><span class="bs-head__sep" aria-hidden="true"></span><a class="bs-head__parent" href="{WWW}/">言文字｜台灣人才聚落</a></div>
  <nav class="bs-head__nav" aria-label="主選單">{links}<a class="bs-btn" href="{h}">{t}</a></nav>
</div></header>
'''


def sisters(slug):
    cells = []
    for s in ORDER:
        b = BRANDS[s]
        cur = ' aria-current="page"' if s == slug else ''
        href = '/' if s == slug else f"https://{b['host']}/"
        cells.append(f'<a href="{href}"{cur}><img src="/brand-sites/assets/{s}-logo.webp" alt="{e(b["alt"])}" loading="lazy" decoding="async"><span>{b["zh"]}（{b["en"]}）</span></a>')
    return f'''<section class="bs-family" aria-labelledby="family-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="family-h">同一個聚落<span class="en">emoji — Taiwan Talent Hub</span></h2><p>在咖啡、三點水、等等空間，都在言文字｜台灣人才聚落。</p></div>
  <div class="bs-sisters">{''.join(cells)}</div>
</div></section>
'''


def visit(hours_rows):
    rows = ''.join(f'<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>' for k, v in hours_rows)
    return f'''<section class="bs-alt" id="visit" aria-labelledby="visit-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="visit-h">怎麼來<span class="en">Visit</span></h2><p>台北車站站前地下街 Z10 出口斜對面</p></div>
  <div class="bs-visit">
    <div>
      <address>{ADDRESS}<small>台北車站站前地下街 Z10 出口斜對面；捷運、台鐵、高鐵都在步行範圍內。</small></address>
      <dl>{rows}<div><dt>電話</dt><dd><a href="{TEL_HREF}">{e(TEL_TEXT)}</a></dd></div><div><dt>Email</dt><dd><a href="mailto:us@emoji.tw">us@emoji.tw</a></dd></div></dl>
      <div class="bs-hero__actions"><a class="bs-btn bs-btn--line" href="{MAP}" target="_blank" rel="noopener">Google 地圖</a><a class="bs-btn bs-btn--line" href="{WWW}/access">交通與抵達方式</a></div>
    </div>
    <iframe class="bs-map" src="https://www.google.com/maps?q=25.046198,121.51342&amp;hl=zh-TW&amp;z=17&amp;output=embed" title="言文字｜台灣人才聚落 地圖位置" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
  </div>
</div></section>
'''


def footer_html(slug, dock):
    b = BRANDS[slug]
    sib = ''.join(f'<li><a href="https://{BRANDS[s]["host"]}/">{BRANDS[s]["zh"]} {BRANDS[s]["en"]}</a></li>' for s in ORDER)
    dock_html = ''.join(f'<a class="bs-btn{" bs-btn--line" if i else ""}" href="{h}">{t}</a>' for i, (t, h) in enumerate(dock))
    return f'''<footer class="bs-foot"><div class="wrap">
  <div class="bs-foot__grid">
    <div class="bs-foot__parent"><a href="{WWW}/"><img src="/cis/assets/emoji-h.svg" alt="言文字｜台灣人才聚落" loading="lazy"></a><p>{b['zh']}（{b['en']}）是言文字｜台灣人才聚落營運的子品牌。讓你平常不會遇到的人，在台北車站旁相遇。</p></div>
    <div><h4>子品牌</h4><ul>{sib}</ul></div>
    <div><h4>聯絡</h4><ul><li><a href="{TEL_HREF}">{e(TEL_TEXT)}</a></li><li><a href="mailto:us@emoji.tw">us@emoji.tw</a></li><li><a href="https://www.instagram.com/emoji0701" target="_blank" rel="noopener">Instagram @emoji0701</a></li><li><a href="https://app.emoji.tw/">會員 App</a></li></ul></div>
  </div>
  <p class="bs-foot__legal">© 2026 言文字｜台灣人才聚落 · 言文字股份有限公司 統一編號 93537055 · <a href="{WWW}/terms">服務條款</a> · <a href="{WWW}/privacy">隱私權政策</a> · <a href="{WWW}/refund">退費政策</a></p>
</div></footer>
<nav class="bs-dock" aria-label="快速動作">{dock_html}</nav>
<script>(function(){{var d=document.querySelector('.bs-dock'),h=document.querySelector('.bs-hero');if(!d||!h||!('IntersectionObserver' in window))return;new IntersectionObserver(function(e){{d.classList.toggle('is-on',!e[0].isIntersecting)}}).observe(h)}})()</script>
</body>
</html>
'''


def facts(rows):
    return '<dl class="bs-facts">' + ''.join(f'<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>' for k, v in rows) + '</dl>'


def points(items):
    return '<ol class="bs-points">' + ''.join(
        f'<li><span class="n" aria-hidden="true">{i:02d}</span><div><b>{e(t)}</b><span>{e(d)}</span></div></li>'
        for i, (t, d) in enumerate(items, 1)) + '</ol>'


def page_cafe():
    s = 'at-cafe'
    reserve = f'{WWW}/reserve'
    out = head(s, '在咖啡 at cafe｜台北車站旁的日式簡餐與工作咖啡',
               '在咖啡（at cafe）是言文字白天的日式簡餐與工作咖啡，08:00–17:00。早餐、午餐、下午的咖啡，或約人碰面，不需會員。台北車站站前地下街 Z10 出口斜對面。')
    out += header(s, [('菜單', '#menu'), ('怎麼來', '#visit'), ('訂位', reserve)])
    out += f'''<main id="content">
<section class="bs-hero"><div class="wrap bs-hero__grid">
  <div>
    <span class="bs-hero__kicker">言文字 · 日式簡餐與工作咖啡</span>
    <h1>在咖啡<span class="en">at cafe</span></h1>
    <p class="bs-hero__lede">白天的日式簡餐與工作咖啡。早餐、午餐、下午的咖啡，或約人碰面。所有訪客都能來，不需會員。</p>
    <div class="bs-hero__open"><span><b>08:00–17:00</b>每日營業</span><span>台北車站 Z10 出口斜對面</span></div>
    <div class="bs-hero__actions"><a class="bs-btn" href="#menu">查看菜單</a><a class="bs-btn bs-btn--line" href="{reserve}">立即訂位</a></div>
  </div>
  <figure class="bs-hero__mark"><img src="/brand-sites/assets/at-cafe-logo.webp" alt="{BRANDS[s]['alt']}" width="624" height="595" decoding="async" fetchpriority="high"></figure>
</div></section>

<section aria-labelledby="about-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="about-h">白天在這裡<span class="en">By day</span></h2></div>
  {facts([('用途', '用餐、外帶與會客'), ('時段', '08:00–17:00'), ('使用資格', '所有訪客，不需會員'), ('費用', '依菜單；分一般價與聚落價')])}
  <div class="bs-feat bs-feat--gap">
    <figure class="bs-feat__moji"><img src="/brand-sites/assets/moji-coffee.svg" alt="" width="200" height="200" loading="lazy"><figcaption>moji · 白日咖啡</figcaption></figure>
    {points([('早餐與日式簡餐', '早上一杯咖啡、中午一份簡餐，在台北車站旁把一餐好好吃完。'),
             ('工作咖啡', '帶著電腦來，咖啡配一段專心的工作時間。'),
             ('約人碰面', '跟客戶、朋友約在車站旁，出站斜對面就到；也可以外帶。')])}
  </div>
</div></section>

<section class="bs-alt bs-menu" id="menu" aria-labelledby="menu-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="menu-h">菜單<span class="en">Menu</span></h2><p>價格含稅；聚落價限已加入聚落者</p></div>
  <div data-menu="CAFE"></div>
  <div class="bs-menu__cta"><a class="bs-btn" href="{reserve}">立即訂位</a><a class="bs-btn bs-btn--line" href="https://3am.emoji.tw/">17:00 後：三點水 3AM</a></div>
</div></section>
'''
    out += visit([('在咖啡', '08:00–17:00'), ('入夜之後', '17:00 起由三點水（3AM）接手')])
    out += sisters(s) + '</main>\n'
    out += footer_html(s, [('查看菜單', '#menu'), ('訂位', reserve)])
    return out


def page_3am():
    s = '3am'
    reserve = f'{WWW}/reserve'
    out = head(s, '三點水 3AM｜台北車站旁的深夜食堂與餐酒館',
               '三點水（3AM）是言文字夜間的深夜食堂與餐酒館，17:00–翌日 03:00。晚餐、宵夜、餐食佐酒，有人服務到凌晨三點，不需會員。台北車站站前地下街 Z10 出口斜對面。')
    out += header(s, [('菜單', '#menu'), ('用餐須知', '#policy'), ('怎麼來', '#visit'), ('訂位', reserve)])
    out += f'''<main id="content">
<section class="bs-hero bs-hero--night"><div class="wrap bs-hero__grid">
  <div>
    <span class="bs-hero__kicker">言文字 · 深夜食堂與餐酒館</span>
    <h1>三點水<span class="en">3AM Bistro</span></h1>
    <p class="bs-hero__lede">夜間的深夜食堂與餐酒館。晚餐、宵夜、餐食佐酒，有人服務到凌晨三點。</p>
    <div class="bs-hero__open"><span><b>17:00–03:00</b>每日營業（翌日 03:00）</span><span>台北車站 Z10 出口斜對面</span></div>
    <div class="bs-hero__actions"><a class="bs-btn bs-btn--line" href="#menu">查看菜單</a><a class="bs-btn" href="{reserve}">立即訂位</a></div>
  </div>
  <figure class="bs-hero__mark"><img src="/brand-sites/assets/3am-logo.webp" alt="{BRANDS[s]['alt']}" width="862" height="434" decoding="async" fetchpriority="high"></figure>
</div></section>

<section aria-labelledby="about-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="about-h">入夜之後<span class="en">After dark</span></h2></div>
  {facts([('用途', '晚餐、深夜熱食與餐食佐酒'), ('時段', '17:00–27:00（翌日 03:00）'), ('使用資格', '所有訪客，不需會員'), ('費用', '依菜單；分一般價與聚落價')])}
  <div class="bs-feat bs-feat--gap">
    <figure class="bs-feat__moji"><img src="/brand-sites/assets/moji-night.svg" alt="" width="200" height="200" loading="lazy"><figcaption>moji · 入夜</figcaption></figure>
    {points([('晚餐', '下班、下車，直接在台北車站旁吃一頓熱的。'),
             ('宵夜', '過了午夜還在營業，有人服務到凌晨三點。'),
             ('餐食佐酒', '以餐為主、酒為輔；一個人坐吧檯，或幾個人一桌都行。')])}
  </div>
</div></section>

<section class="bs-alt bs-menu" id="menu" aria-labelledby="menu-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="menu-h">菜單<span class="en">Menu</span></h2><p>價格含稅；聚落價限已加入聚落者</p></div>
  <div data-menu="BAR"></div>
</div></section>

<section id="policy" aria-labelledby="policy-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="policy-h">用餐須知<span class="en">Before you come</span></h2></div>
  {facts([('低消（2026/11/1 起）', '每人平日 NT$300、週六日 NT$600'), ('服務費（2026/11/1 起）', '內用另加 10%；外帶不收'), ('酒類', '未滿十八歲禁止飲酒；禁止酒駕'), ('結帳', '用餐完到櫃檯結帳')])}
  <div class="bs-menu__cta"><a class="bs-btn" href="{reserve}">立即訂位</a><a class="bs-btn bs-btn--line" href="https://atcafe.emoji.tw/">白天：在咖啡 at cafe</a></div>
</div></section>
'''
    out += visit([('三點水', '17:00–翌日 03:00'), ('白天', '08:00–17:00 為在咖啡（at cafe）')])
    out += sisters(s) + '</main>\n'
    out += footer_html(s, [('訂位', reserve), ('查看菜單', '#menu')])
    return out


def page_stay():
    s = 'stay-square'
    app = 'https://app.emoji.tw/'
    book = f'{WWW}/system#booking'
    out = head(s, '等等空間 Stay Square｜台北車站旁的會員休息與工作空間',
               '等等空間（Stay Square）是言文字會員的休息與工作空間：共享辦公、看書休憩、交誼與淋浴，也是講座與社群活動的場地。單日 4 小時 NT$200 起，台北車站站前地下街 Z10 出口斜對面。')
    out += header(s, [('空間', '#rooms'), ('會員方案', '#plans'), ('活動與包場', '#booking'), ('加入會員', app)])
    out += f'''<main id="content">
<section class="bs-hero bs-hero--brand"><div class="wrap bs-hero__grid">
  <div>
    <span class="bs-hero__kicker">言文字 · 會員的休息與工作空間</span>
    <h1>等等空間<span class="en">Stay Square</span></h1>
    <p class="bs-hero__lede">在台北車站旁，等一下也能好好待著。共享辦公、看書休憩、交誼與淋浴，也是講座與社群活動的場地。</p>
    <div class="bs-hero__open"><span><b>NT$200</b>單日 4 小時起</span><span>24 小時為條件式啟用</span></div>
    <div class="bs-hero__actions"><a class="bs-btn bs-btn--on" href="#plans">比較會員方案</a><a class="bs-btn bs-btn--on-line" href="{app}">在會員 App 加入</a></div>
  </div>
  <figure class="bs-hero__mark"><img src="/brand-sites/assets/stay-square-logo-white.webp" alt="{BRANDS[s]['alt']}" width="845" height="590" decoding="async" fetchpriority="high"></figure>
</div></section>

<section id="rooms" aria-labelledby="rooms-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="rooms-h">空間<span class="en">Spaces</span></h2><p>持有效會籍的會員使用；所有設備自由使用</p></div>
  <div class="bs-rooms">
    <article class="bs-room"><figure data-image="2"><img src="/assets/space/2f-concept.jpg" alt="等等空間膠囊休憩席規劃示意" width="1200" height="743" loading="lazy" decoding="async"><figcaption>規劃示意</figcaption></figure>
      <div class="bs-room__body"><h3>休息與淋浴</h3><p>看書休憩、膠囊休憩席、交誼廳與淋浴。</p><div class="md-content" data-md="2"></div></div></article>
    <article class="bs-room"><figure data-image="3"><img src="/assets/space/3f-concept.jpg" alt="等等空間共享辦公與活動空間規劃示意" width="1400" height="845" loading="lazy" decoding="async"><figcaption>規劃示意</figcaption></figure>
      <div class="bs-room__body"><h3>共享工作與活動</h3><p>共享辦公；講座、工作坊、社群交流與企業包場。約 08:00–翌日 03:00。</p><div class="md-content" data-md="3"></div></div></article>
    <article class="bs-room"><figure data-image="4"><img src="/assets/space/4f-concept.jpg" alt="等等空間洗衣區規劃示意" width="1400" height="867" loading="lazy" decoding="async"><figcaption>規劃示意</figcaption></figure>
      <div class="bs-room__body"><h3>洗衣與戶外吸菸區</h3><p>洗脫烘與戶外吸菸區，會員免費使用。</p><div class="md-content" data-md="4"></div></div></article>
  </div>
  <div class="bs-feat bs-feat--gap">
    <figure class="bs-feat__moji"><img src="/brand-sites/assets/moji-rest.svg" alt="" width="200" height="200" loading="lazy"><figcaption>moji · 休憩</figcaption></figure>
    {points([('轉乘空檔', '高鐵、台鐵、客運之間的幾個小時，有地方坐、有地方洗澡。'),
             ('工作據點', '固定在台北車站周邊工作，選月、季或年會籍。'),
             ('餐飲就在聚落裡', '白天在咖啡、晚上三點水；會員點餐享聚落價。')])}
  </div>
</div></section>

<section class="bs-alt" id="plans" aria-labelledby="plans-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="plans-h">會員方案<span class="en">Membership</span></h2><p>價格皆含稅；一次付費，不自動續約</p></div>
  <table class="bs-plans">
    <thead><tr><th scope="col">方案</th><th scope="col">價格</th><th scope="col">適合情境</th><th scope="col">包含內容</th></tr></thead>
    <tbody>
      <tr><td>單日 4 小時</td><td class="p">NT$200</td><td>轉乘空檔、半天會議或短時工作</td><td>可使用等等空間、所有設備；超時每小時 NT$100</td></tr>
      <tr><td>單日 12 小時</td><td class="p">NT$500</td><td>從白天工作到晚上</td><td>可使用等等空間、所有設備；超時每小時 NT$100</td></tr>
      <tr><td>月會員</td><td class="p">NT$4,000</td><td>一個月內常在台北車站周邊工作</td><td>等等空間通行、所有設備自由使用</td></tr>
      <tr><td>季會員</td><td class="p">NT$10,000</td><td>一季內持續使用</td><td>等等空間通行、所有設備自由使用</td></tr>
      <tr><td>年會員</td><td class="p">NT$35,000</td><td>把這裡當長期工作據點</td><td>等等空間通行、所有設備自由使用</td></tr>
    </tbody>
  </table>
  <p class="bs-note">線上購買後首次進場時啟用；也可以現場辦理。購買會員方案或單日會員，即加入聚落，在咖啡與三點水點餐享聚落價。</p>
  <div class="bs-menu__cta"><a class="bs-btn" href="{app}">在會員 App 購買</a><a class="bs-btn bs-btn--line" href="{WWW}/system#membership">完整消費方式</a></div>
</div></section>

<section id="booking" aria-labelledby="booking-h"><div class="wrap">
  <div class="bs-sec__head"><h2 id="booking-h">活動與包場<span class="en">Events &amp; venue</span></h2><p>等等空間共享活動區、等等空間交誼廳</p></div>
  {facts([('包場場地費', '1–10 人 NT$5,000／時段起，依人數計'), ('時段', '2 小時，贈前後各 30 分鐘場佈場復'), ('折抵', '場地費可全額折抵在咖啡／三點水當場餐飲'), ('公開活動', '不收場地費；參加者付 NT$150 場地茶飲費')])}
  <div class="bs-menu__cta"><a class="bs-btn" href="{WWW}/events?apply=1#ev-apply">申請活動或包場</a><a class="bs-btn bs-btn--line" href="{book}">場地費與包場價目</a></div>
</div></section>
'''
    out += visit([('等等空間', '會員使用；24 小時為條件式啟用'), ('餐飲', '在咖啡 08:00–17:00・三點水 17:00–翌日 03:00')])
    out += sisters(s) + '</main>\n'
    out += footer_html(s, [('加入會員', app), ('會員方案', '#plans')])
    return out


for slug, fn in (('at-cafe', page_cafe), ('3am', page_3am), ('stay-square', page_stay)):
    (OUT / f'{slug}.html').write_text(fn(), encoding='utf-8')
    print('wrote', OUT / f'{slug}.html')
