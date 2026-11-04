#!/usr/bin/env python3
"""首頁「聚落」區塊產生器（2026-11-04 v2，KK 裁示）。

官網只呈現聚落：不寫任何消費方式（價格、會員方案、低消、場地費），
像商場或遊樂園的官網那樣介紹進駐品牌，把人導到各品牌自己的官網。
日系質感：大量留白、明體、細線、方角；配色照 CIS（紙、墨；黃只當底色、每屏至多一次；
子品牌色只用在品牌標誌與色條，不和母品牌黃並置）。

產出：public/{,en/,ja/}index.html 從 `<!-- HUB:START` 到最新消息區塊之前全部重寫
（舊的活動場地／新創／FAQ 區塊一併移除），並改寫 <head> 的 title／description／OG／Twitter，
JSON-LD 移除 Offer 與含價格的 FAQPage、加上四個子品牌 subOrganization。
改文案改這支再重跑，勿手改 HTML。公開頁只寫品牌不寫樓層（test-brand-copy 鎖定）。
"""
import json, pathlib, re, sys
from html import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public'
A = '/cis/brands/assets'

# 子品牌固定順序（CIS）：在咖啡、三點水、等等空間、約書旅；start／end 為 0–32 時（27＝翌日 03:00）
BRANDS = [
    dict(id='cafe', slug='at-cafe', host='atcafe.emoji.tw', no='01', color='#984C37', zh='在咖啡', latin='at cafe',
         img='/assets/space/1f-concept.jpg', w=1200, h=746, start=8, end=17),
    dict(id='bar', slug='3am', host='3am.emoji.tw', no='02', color='#6B8FAB', zh='三點水', latin='3AM',
         img='/assets/space/1f-night.jpg', w=1400, h=867, start=17, end=27),
    dict(id='stay', slug='stay-square', host='staysquare.emoji.tw', no='03', color='#2B4064', zh='等等空間', latin='Stay Square',
         img='/assets/space/3f-concept.jpg', w=1400, h=845, start=8, end=27),
    dict(id='book', slug='rest-book', host='restbook.emoji.tw', no='04', color='#687C70', zh='約書旅', latin='Rest Book',
         img='/assets/space/2f-concept.jpg', w=1200, h=743, start=8, end=32),
]

T = {
 'zh': dict(
  site='', hours_label='時間',
  kw='台灣人才聚落,Taiwan Talent Hub,emoji hub,言文字,在咖啡,三點水,等等空間,約書旅,at cafe,3AM,Stay Square,Rest Book,台北車站,中正區,台北咖啡,日式簡餐,台北深夜食堂,台北深夜餐酒館,共享工作空間,書店,社群活動,數位遊牧,遠端工作,新創,台灣數位遊牧者協會,TDNA',
  title='言文字｜台灣人才聚落 Taiwan Talent Hub — 台北車站旁的品牌聚落',
  desc='言文字｜台灣人才聚落在台北車站 Z10 出口斜對面。在咖啡、三點水、等等空間、約書旅四個品牌各自經營、比鄰而居：咖啡、深夜食堂、共享工作、閱讀與休息，還有社群活動與新創支援。',
  og_alt='言文字｜台北車站旁的人才聚落',
  ld_desc='言文字｜台灣人才聚落位於台北車站 Z10 出口斜對面，由在咖啡（at cafe）、三點水（3AM）、等等空間（Stay Square）與約書旅（Rest Book）四個品牌組成；咖啡、深夜食堂、共享工作、閱讀與休息各自經營、比鄰而居，並有社群活動與新創支援。',
  brand='<span class="keep">言文字｜台灣人才聚落</span> <span class="keep">Taiwan Talent Hub</span>',
  tate='台北車站前　人才聚落',
  h1='台北車站旁，<span class="keep">一座<span class="swash">人才聚落</span>。</span>',
  lead='咖啡館、深夜食堂、共享工作空間與書店，各自獨立經營，聚在同一個街區。從早上八點到深夜，工程師、設計師、創業者與旅居台灣的人，在這裡進進出出。',
  dir_label='聚落案內', dir_sub='Directory',
  loc='台北市中正區重慶南路一段 11 號・台北車站 Z10 出口斜對面', access=('/access', '怎麼走'),
  roles={'cafe': '日式簡餐與工作咖啡', 'bar': '深夜食堂與餐酒館', 'stay': '共享工作空間', 'book': '閱讀與休息'},
  hours={'cafe': '08:00–17:00', 'bar': '17:00–翌日 03:00', 'stay': '約 08:00–翌日 03:00', 'book': '全天'},
  copy={'cafe': '早晨的手沖，午間的日式定食。約人碰面、等車的空檔，都從一杯咖啡開始。',
        'bar': '醒著，就來。入夜後的熱食與一杯酒，陪晚歸的人到凌晨三點。',
        'stay': '工作區、會議室、電話亭與榻榻米區。專心做事、和夥伴開會、辦一場講座。',
        'book': '書可以讀，也可以帶走。等車的空檔讀幾頁、沖個澡，休息好了再出發。'},
  go='前往{name}官網', img_tag='示意圖',
  ten_eye='進駐品牌', ten_h='四個品牌，<span class="keep">各自經營，</span><span class="keep">比鄰而居。</span>',
  ten_p='每個品牌都有自己的官網，菜單、營業資訊與預約請到各品牌網站查看。',
  day_eye='聚落的一日', day_h='從早上八點，<span class="keep">到凌晨三點以後。</span>',
  day_p='白天的咖啡、入夜的食堂、整天開著的工作與閱讀空間，輪流點亮這個街區。',
  tz='台北時間',
  idea_eye='聚落理念', idea_h='人才聚在一起，<span class="keep">事情才會發生。</span>',
  steps=[('相遇', '用餐、看書、工作時，坐在旁邊的可能是工程師、設計師、創業者或遠端工作者。'),
         ('合作', '社群小聚、講座與工作坊，讓剛認識的人有理由再聊一次。'),
         ('創業', '需要在台北落腳、找場域驗證或顧問時，聚落是第一站。')],
  more_eye='聚落裡的事', more_h='不只是店家，<span class="keep">也是一個社群。</span>',
  more=[('/events', '活動', 'Events', '講座、工作坊與社群小聚，在聚落裡輪番登場。'),
        ('/startup', '新創支援', 'Startup', '公司落地、場域驗證與顧問輔導，從這裡開始。'),
        ('/about', '關於聚落', 'About', '我們為什麼把不同的事業放在一起。')],
 ),
 'en': dict(
  site='/en', hours_label='Hours',
  kw='Taiwan Talent Hub,emoji hub,at cafe,3AM,Stay Square,Rest Book,Taipei Main Station,cafe Taipei,late-night diner Taipei,coworking Taipei,bookshop Taipei,community events Taipei,digital nomad Taiwan,remote work Taipei,startup community Taipei,TDNA',
  title='emoji — Taiwan Talent Hub | A hub of brands by Taipei Main Station',
  desc='emoji — Taiwan Talent Hub sits across from Exit Z10 of Taipei Main Station. Four independently run brands side by side — at cafe, 3AM, Stay Square and Rest Book — plus community events and startup support.',
  og_alt='emoji — a talent hub by Taipei Main Station',
  ld_desc='emoji — Taiwan Talent Hub sits across from Exit Z10 of Taipei Main Station. It is a hub of four independently run brands — at cafe, 3AM, Stay Square and Rest Book — for coffee, late-night food, coworking, and reading and rest, with community events and startup support.',
  brand='emoji — Taiwan Talent Hub',
  tate='',
  h1='A hub of talent, <span class="keep">right by</span> <span class="keep"><span class="swash">Taipei Main Station</span>.</span>',
  lead='A café, a late-night diner, a coworking space and a bookshop, each run on its own, gathered on one block. From eight in the morning until late at night, engineers, designers, founders and people living in Taiwan come and go.',
  dir_label='Directory', dir_sub='',
  loc='No. 11, Sec. 1, Chongqing S. Rd · across from Exit Z10, Taipei Main Station', access=('/en/access', 'Directions'),
  roles={'cafe': 'Japanese set meals & working coffee', 'bar': 'Late-night diner & bistro', 'stay': 'Coworking space', 'book': 'Reading & rest'},
  hours={'cafe': '08:00–17:00', 'bar': '17:00–03:00', 'stay': 'approx. 08:00–03:00', 'book': 'All day'},
  copy={'cafe': 'Pour-over in the morning, a Japanese set meal at noon. Meetings and the wait for a train both start with a cup of coffee.',
        'bar': 'Awake? Come in. Hot food and a drink after dark, for night owls until 3 a.m.',
        'stay': 'Desks, meeting rooms, phone booths and a tatami corner — for focused work, team meetings and talks.',
        'book': 'Read a book here or take it home. A few pages and a shower between trains, then back on the road.'},
  go='Visit {name}', img_tag='Rendering',
  ten_eye='Brands', ten_h='Four brands, <span class="keep">side by side.</span>',
  ten_p='Each brand has its own website. Menus, opening details and bookings are on each brand’s site.',
  day_eye='A day at the hub', day_h='From 8 a.m. <span class="keep">to past 3 a.m.</span>',
  day_p='Coffee by day, a diner after dark, and work and reading spaces that stay open take turns lighting up the block.',
  tz='Taipei time',
  idea_eye='Our idea', idea_h='Things happen <span class="keep">when talent gathers.</span>',
  steps=[('Meet', 'Over a meal, a book or a laptop, the person next to you may be an engineer, designer, founder or remote worker.'),
         ('Collaborate', 'Meetups, talks and workshops give new acquaintances a reason to talk again.'),
         ('Build', 'Settling in Taipei, testing a product or looking for advice? The hub is your first stop.')],
  more_eye='Around the hub', more_h='More than shops — <span class="keep">a community.</span>',
  more=[('/en/events', 'Events', '', 'Talks, workshops and community meetups take turns at the hub.'),
        ('/en/startup', 'Startup support', '', 'Landing in Taipei, field tests and advice start here.'),
        ('/en/about', 'About the hub', '', 'Why we put different businesses under one idea.')],
 ),
 'ja': dict(
  site='/ja', hours_label='営業',
  kw='台湾タレントハブ,Taiwan Talent Hub,emoji hub,在咖啡,三點水,等等空間,約書旅,at cafe,3AM,Stay Square,Rest Book,台北駅,台北 カフェ,深夜食堂 台北,台北 コワーキング,台北 本屋,コミュニティ 台北,デジタルノマド 台湾,リモートワーク 台北,スタートアップ 台北,TDNA',
  title='言文字｜台湾タレントハブ — 台北駅そばのブランドの集落',
  desc='言文字｜台湾タレントハブは台北駅Z10出口の斜め向かい。在咖啡、三點水、等等空間、約書旅の4ブランドがそれぞれ独立して営み、隣り合っています。コミュニティイベントやスタートアップ支援も。',
  og_alt='言文字｜台北駅そばの人材の集落',
  ld_desc='言文字｜台湾タレントハブは台北駅Z10出口の斜め向かいにある、在咖啡（at cafe）、三點水（3AM）、等等空間（Stay Square）、約書旅（Rest Book）の4ブランドからなる集落です。コーヒー、深夜食堂、コワーキング、読書と休憩をそれぞれが営み、コミュニティイベントやスタートアップ支援も行っています。',
  brand='言文字｜台湾タレントハブ',
  tate='台北駅前　人材の集落',
  h1='台北駅のそばに、<span class="keep">ひとつの<span class="swash">集落</span>を。</span>',
  lead='喫茶、深夜食堂、コワーキング、そして本屋。それぞれが独立して営み、ひとつの街区に集まっています。朝八時から深夜まで、エンジニア、デザイナー、起業家、台湾に暮らす人たちが行き交います。',
  dir_label='集落案内', dir_sub='Directory',
  loc='台北市中正区重慶南路一段11号・台北駅Z10出口の斜め向かい', access=('/ja/access', '行き方'),
  roles={'cafe': '和定食とワーキングコーヒー', 'bar': '深夜食堂・ビストロ', 'stay': 'コワーキングスペース', 'book': '読書と休憩'},
  hours={'cafe': '08:00〜17:00', 'bar': '17:00〜翌03:00', 'stay': '約 08:00〜翌03:00', 'book': '終日'},
  copy={'cafe': '朝はハンドドリップ、昼は和の定食。打ち合わせも、電車までの待ち時間も、一杯のコーヒーから。',
        'bar': '起きているなら、どうぞ。夜の温かいごはんと一杯を、深夜3時まで。',
        'stay': 'ワークエリア、会議室、電話ブース、畳スペース。集中作業にも、打ち合わせにも、講座にも。',
        'book': '本は読むことも、持ち帰ることも。電車の合間に数ページ、シャワーでひと息ついて、また出発。'},
  go='{name}の公式サイトへ', img_tag='イメージ',
  ten_eye='入居ブランド', ten_h='4つのブランドが、<span class="keep">隣り合って営む。</span>',
  ten_p='各ブランドにそれぞれの公式サイトがあります。メニュー、営業情報、ご予約は各サイトでご確認ください。',
  day_eye='集落の一日', day_h='朝八時から、<span class="keep">深夜三時のその先まで。</span>',
  day_p='昼の喫茶、夜の食堂、一日中ひらいている仕事と読書の場所が、かわるがわる街区に灯をともします。',
  tz='台北時間',
  idea_eye='コンセプト', idea_h='人が集まれば、<span class="keep">何かが始まる。</span>',
  steps=[('出会う', '食事や読書、仕事の隣にいるのは、エンジニア、デザイナー、起業家、リモートワーカーかもしれません。'),
         ('協働する', '集まり、講座、ワークショップが、出会った人ともう一度話すきっかけになります。'),
         ('起業する', '台北での拠点、実証の場、相談相手を探すなら、ここが最初の一歩です。')],
  more_eye='集落のこと', more_h='お店の集まりであり、<span class="keep">ひとつのコミュニティ。</span>',
  more=[('/ja/events', 'イベント', 'Events', '講座、ワークショップ、コミュニティの集まりが、かわるがわる開かれます。'),
        ('/ja/startup', 'スタートアップ支援', 'Startup', '台北での立ち上げ、実証、相談はここから。'),
        ('/ja/about', '集落について', 'About', '異なる事業をひとつの場所に集めた理由。')],
 ),
}

ARROW = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 17 17 7M9 7h8v8"/></svg>'
AXIS = ((0, '08'), (4, '12'), (9, '17'), (14, '22'), (19, '03'), (24, '08'))


def brand_url(b, t):
    return f'https://{b["host"]}{t["site"]}'


def directory(t):
    rows = ''.join(
        f'<li><a href="#brand-{b["id"]}" style="--brand:{b["color"]}"><span class="vl-dir__no">{b["no"]}</span>'
        f'<i aria-hidden="true"></i><b>{b["zh"]}<span lang="en">{b["latin"]}</span></b><small>{t["roles"][b["id"]]}</small></a></li>'
        for b in BRANDS)
    sub = f'<span lang="en">{t["dir_sub"]}</span>' if t['dir_sub'] else ''
    return (f'<nav class="vl-dir" aria-label="{t["dir_label"]}"><p class="vl-dir__label">{t["dir_label"]}{sub}</p>'
            f'<ol>{rows}</ol></nav>')


def card(b, t, lang, i):
    load = 'decoding="async" fetchpriority="high"' if i == 0 else 'loading="lazy" decoding="async"'
    n = b['latin'] if lang == 'en' else b['zh']
    url = brand_url(b, t)
    return (f'      <article class="vl-brand reveal" id="brand-{b["id"]}" style="--brand:{b["color"]}">\n'
            f'        <a class="vl-brand__media" href="{url}" tabindex="-1" aria-hidden="true"><img src="{b["img"]}" alt="" width="{b["w"]}" height="{b["h"]}" {load}><span class="vl-brand__tag">{t["img_tag"]}</span></a>\n'
            f'        <div class="vl-brand__body"><img class="vl-brand__logo" src="{A}/{b["slug"]}/preview/logo-01.webp" alt="{b["zh"]} {b["latin"]}" loading="lazy" decoding="async">'
            f'<p class="vl-brand__meta"><span class="vl-brand__no">{b["no"]}</span><span>{t["roles"][b["id"]]}</span></p>'
            f'<h3>{b["zh"]}<span lang="en">{b["latin"]}</span></h3><p class="vl-brand__copy">{t["copy"][b["id"]]}</p>'
            f'<dl><dt>{t["hours_label"]}</dt><dd>{t["hours"][b["id"]]}</dd></dl>'
            f'<a class="vl-brand__go" href="{url}" data-cta="home-brand-{b["id"]}"><span>{t["go"].format(name=n)}<small>{b["host"]}</small></span>{ARROW}</a></div>\n'
            f'      </article>\n')


def day(t):
    ticks = ''.join(f'<span style="--h:{h}">{a}</span>' for h, a in AXIS)
    rows = ''.join(
        f'<li style="--brand:{b["color"]};--s:{b["start"] - 8};--e:{b["end"] - 8}"><b>{b["zh"]}<span lang="en">{b["latin"]}</span></b>'
        f'<span class="vl-day__track" aria-hidden="true"><i></i></span><small>{t["hours"][b["id"]]}</small></li>'
        for b in BRANDS)
    return (f'<div class="vl-day reveal"><div class="vl-day__axis" aria-hidden="true">{ticks}</div><ol>{rows}</ol>'
            f'<p class="vl-day__tz">{t["tz"]}</p></div>')


def block(t, lang):
    steps = ''.join(f'<li><b>{a}</b><span>{b}</span></li>' for a, b in t['steps'])
    more = ''.join(f'<a class="vl-more__item" href="{h}">' + (f'<span class="vl-more__en" lang="en">{e}</span>' if e else '')
                   + f'<b>{a}</b><span>{d}</span>{ARROW}</a>' for h, a, e, d in t['more'])
    cards = ''.join(card(b, t, lang, i) for i, b in enumerate(BRANDS))
    tate = f'<p class="vl-tate" aria-hidden="true">{t["tate"]}</p>\n    ' if t['tate'] else ''
    eye = lambda s: f'<span class="vl-eye">{s}</span>'
    return f'''<!-- HUB:START 由 tools/build-home-hub.py 產生，勿手改 -->
<!-- ===== HERO：聚落 ===== -->
<section class="vl-hero" id="top">
  <div class="wrap vl-hero__grid">
    {tate}<div class="vl-hero__copy">
      <p class="vl-hero__brand">{t["brand"]}</p>
      <h1>{t["h1"]}</h1>
      <p class="vl-hero__lead">{t["lead"]}</p>
      <p class="vl-hero__loc"><span>{t["loc"]}</span><a href="{t["access"][0]}">{t["access"][1]} →</a></p>
    </div>
    {directory(t)}
  </div>
</section>

<!--FEATURED_EVENT-->
<!-- ===== 進駐品牌 ===== -->
<section class="vl-tenants" id="brands">
  <div class="wrap">
    <div class="vl-head reveal">{eye(t["ten_eye"])}<h2>{t["ten_h"]}</h2><p>{t["ten_p"]}</p></div>
    <div class="vl-brands">
{cards}    </div>
  </div>
</section>

<!-- ===== 聚落的一日 ===== -->
<section class="vl-dayband" id="day">
  <div class="wrap">
    <div class="vl-head reveal">{eye(t["day_eye"])}<h2>{t["day_h"]}</h2><p>{t["day_p"]}</p></div>
    {day(t)}
  </div>
</section>

<!-- ===== 聚落理念 ===== -->
<section class="vl-idea" id="idea">
  <div class="wrap">
    <div class="vl-head reveal">{eye(t["idea_eye"])}<h2>{t["idea_h"]}</h2></div>
    <ol class="vl-idea__steps reveal">{steps}</ol>
  </div>
</section>

<!-- ===== 聚落裡的事 ===== -->
<section class="vl-more" id="community">
  <div class="wrap">
    <div class="vl-head reveal">{eye(t["more_eye"])}<h2>{t["more_h"]}</h2></div>
    <div class="vl-more__grid reveal">{more}</div>
  </div>
</section>
<!-- HUB:END -->

'''


def head_meta(s, t):
    def sub(pattern, value):
        nonlocal s
        s, n = re.subn(pattern, lambda m: m.group(1) + escape(value, quote=True) + m.group(2), s, count=1)
        assert n == 1, pattern
    sub(r'(<title>)[^<]*(</title>)', t['title'])
    sub(r'(<meta name="keywords" content=")[^"]*(")', t['kw'])
    sub(r'(<meta name="description" content=")[^"]*(")', t['desc'])
    sub(r'(<meta property="og:title" content=")[^"]*(")', t['title'])
    sub(r'(<meta property="og:description" content=")[^"]*(")', t['desc'])
    sub(r'(<meta property="og:image:alt" content=")[^"]*(")', t['og_alt'])
    sub(r'(<meta name="twitter:title" content=")[^"]*(")', t['title'])
    sub(r'(<meta name="twitter:description" content=")[^"]*(")', t['desc'])
    return s


def json_ld(s, t):
    m = re.search(r'(<script type="application/ld\+json">)(.*?)(</script>)', s, flags=re.S)
    data = json.loads(m.group(2))
    graph = []
    for node in data['@graph']:
        if node.get('@type') == 'FAQPage':
            continue  # 舊 FAQ 含價格與會籍；官網不再寫消費方式
        for k in ('makesOffer', 'priceRange', 'currenciesAccepted'):
            node.pop(k, None)
        if 'description' in node:
            node['description'] = t['ld_desc']
        if 'Organization' in (node.get('@type') or []):
            node['subOrganization'] = [{'@type': 'LocalBusiness', 'name': f'{b["zh"]} {b["latin"]}', 'url': brand_url(b, t)} for b in BRANDS]
        if 'dateModified' in node:
            node['dateModified'] = '2026-11-04'
        graph.append(node)
    data['@graph'] = graph
    return s[:m.start(2)] + '\n' + json.dumps(data, ensure_ascii=False, indent=2) + '\n' + s[m.end(2):]


def main():
    for lang, rel in (('zh', 'index.html'), ('en', 'en/index.html'), ('ja', 'ja/index.html')):
        p = ROOT / rel
        s = p.read_text(encoding='utf-8')
        t = T[lang]
        a = s.index('<!-- HUB:START')
        news = s.index('<section id="news"')
        b = s.rindex('<!-- =====', a, news)          # 最新消息區塊的註解
        cta = s.find('<!-- ===== CTA', a, news)        # en／ja 留有空的 CTA 註解
        if cta != -1:
            b = min(b, cta)
        s = s[:a] + block(t, lang) + s[b:]
        s = head_meta(s, t)
        s = json_ld(s, t)
        if '/hub.css' not in s:
            s = s.replace('<link rel="stylesheet" href="/nav.css">', '<link rel="stylesheet" href="/nav.css">\n<link rel="stylesheet" href="/hub.css">', 1)
        p.write_text(s, encoding='utf-8')
        print('ok', rel)


if __name__ == '__main__':
    sys.exit(main())
