#!/usr/bin/env python3
"""首頁「聚落入口」區塊產生器（2026-11-04）。

把 public/{,en/,ja/}index.html 中 `<!-- HUB:START -->` 到 `<!-- HUB:END -->`
（首次執行時為 HERO 到 PARTNERS 之前）替換成：理念 hero → 今天想做什麼 →
聚落理念三步 → 樓層導覽圖＋四個入口卡。改文案改這支再重跑，勿手改 HTML。
入口依母檔 07 §1（2026-11-04）：在咖啡、三點水、約書旅、等等空間。公開頁只寫品牌不寫樓層（test-brand-copy 鎖定）。
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public'

T = {
 'zh': dict(
  base='', brand='<span class="keep">言文字｜台灣人才聚落</span> <span class="keep">Taiwan Talent Hub</span>',
  h1='<em>讓你平常不會遇到的人，<span class="keep">在台北車站旁<span class="swash">相遇</span>。</span></em>',
  lead='白天喝咖啡、晚上吃宵夜，在約書旅看書休息，到等等空間工作開會。每個品牌都是一個入口，用你習慣的方式走進來，在這裡遇見下一個合作對象。',
  pickq='今天想做什麼？',
  picks=[('#gate-cafe','吃早午餐・喝咖啡'),('#gate-bar','吃宵夜・喝一杯'),('#gate-book','看書・休息一下'),('#gate-stay','工作・開會'),('/events','參加活動')],
  hours='每天 <span class="keep">在咖啡 08:00–17:00</span> <span class="keep">· 三點水 17:00–27:00</span><span class="keep">（翌日 03:00）</span>',
  loc='台北車站旁 · 重慶南路一段 11 號', access=('/access','從台北車站 Z10 出口怎麼走 →'),
  idea_eye='聚落理念', idea_h='打造<span class="keep">台灣人才</span><span class="keep">密度最高的聚落</span>',
  idea_p='人才聚在一起，事情才會發生。我們把吃飯、閱讀、工作、交流放進同一棟樓，讓不同領域的人自然碰面。',
  steps=[('相遇','用餐、看書、工作時，坐在你旁邊的可能是工程師、設計師、創業者或旅居台灣的遠端工作者。'),
         ('合作','社群小聚、講座與工作坊，讓剛認識的人有理由再聊一次。'),
         ('創業','需要據點、場域驗證或顧問時，聚落是你在台北的第一站。')],
  gates_eye='聚落地圖', gates_h='選一個入口進場', gates_p='點地圖直接跳到入口；用餐不需會員，約書旅與等等空間的使用方式請看各入口說明。',
  map_label='言文字 聚落地圖', start='你在這裡：<span class="keep">重慶南路入口</span>・台北車站 Z10 出口斜對面',
  annex=('＋','附屬設施','洗衣・吸菸區'),
  gates=[
   dict(id='cafe',cls='cafe',lv='01',time='08:00–17:00',name='在咖啡',en='at cafe',short='日式簡餐・手沖咖啡',
        img='/assets/space/1f-concept.jpg',w=1200,h=746,alt='在咖啡用餐區規劃示意',
        p='日式簡餐、手沖咖啡與外帶。約客戶碰面、等車空檔處理工作都適合，<span class="keep">不需會員</span>。',
        act=[('/reserve','線上訂位','btn btn--accent'),('/at-cafe','認識在咖啡','')]),
   dict(id='bar',cls='bar',lv='02',time='17:00–27:00',name='三點水',en='3AM',short='深夜食堂・餐酒館',
        img='/assets/space/1f-night.jpg',w=1400,h=867,alt='三點水夜間餐飲規劃示意',
        p='入夜後的深夜食堂與餐酒館，營業到<span class="keep">凌晨三點</span>。下班、散會後來吃點東西，<span class="keep">不需會員</span>。',
        act=[('/reserve','線上訂位','btn btn--solid'),('/3am','認識三點水','')]),
   dict(id='book',cls='book',lv='03',time='會員使用',name='約書旅',en='Rest Book',short='閱讀・淋浴・交誼廳',
        img='/assets/space/2f-concept.jpg',w=1200,h=743,alt='約書旅閱讀休憩空間規劃示意',
        p='書籍閱讀與購買、個人讀書空間，還有淋浴與交誼廳。工作累了上來看本書、休息一下再出發。',
        act=[('/system','看會員方案','btn btn--solid'),('/space#f2','認識約書旅','')]),
   dict(id='stay',cls='stay',lv='04',time='約 08:00–03:00',name='等等空間',en='Stay Square',short='共享空間・會議室・<span class="keep">榻榻米區</span>',
        img='/assets/space/3f-concept.jpg',w=1400,h=845,alt='等等空間共享空間與會議室規劃示意',
        p='挑高六米的共享空間、會議室、電話亭與<span class="keep">榻榻米區</span>。專心工作、開會、辦講座或包場都在這裡。',
        act=[('/system','看會員方案','btn btn--solid'),('/stay-square','認識等等空間',''),('/system#booking','場地與包場價目','')]),
  ],
  img_tag='示意圖'),
 'en': dict(
  base='/en', brand='emoji — Taiwan Talent Hub',
  h1='<em>Meet the people you wouldn\'t normally meet, right by <span class="swash">Taipei Main Station</span>.</em>',
  lead='Coffee by day, late-night food after dark, reading and rest at Rest Book, work and meetings at Stay Square. Every brand is a gate — come in your own way, and meet your next collaborator here.',
  pickq='What would you like to do today?',
  picks=[('#gate-cafe','Brunch & coffee'),('#gate-bar','Late-night bites & drinks'),('#gate-book','Read & recharge'),('#gate-stay','Work & meet'),('/en/events','Join an event')],
  hours='Daily · <span class="keep">at cafe 08:00–17:00</span> <span class="keep">· 3AM 17:00–03:00</span>',
  loc='By Taipei Main Station · No. 11 Chongqing S. Rd.', access=('/en/access','Directions from Exit Z10 →'),
  idea_eye='Our idea', idea_h='Taiwan\'s densest hub of talent',
  idea_p='Things happen when talented people gather. We put eating, reading, working and meeting under one roof so people from different fields cross paths naturally.',
  steps=[('Meet','Over a meal, a book or a laptop, the person next to you may be an engineer, designer, founder or remote worker based in Taiwan.'),
         ('Collaborate','Community meetups, talks and workshops give new acquaintances a reason to talk again.'),
         ('Build','Need a base, a test bed or advice? The hub is your first stop in Taipei.')],
  gates_eye='Hub map', gates_h='Pick a gate to enter', gates_p='Tap the map to jump to a gate. Dining needs no membership; see each gate for how to use Rest Book and Stay Square.',
  map_label='emoji hub map', start='You are here: Chongqing S. Rd. entrance, across from Exit Z10',
  annex=('＋','Annex','Laundry · smoking area'),
  gates=[
   dict(id='cafe',cls='cafe',lv='01',time='08:00–17:00',name='在咖啡',en='at cafe',short='Japanese set meals · pour-over',
        img='/assets/space/1f-concept.jpg',w=1200,h=746,alt='at cafe dining area · concept rendering',
        p='Japanese-style set meals, pour-over coffee and takeaway. Good for client meetings or work between trains. No membership needed.',
        act=[('/en/reserve','Book a table','btn btn--accent'),('/en/at-cafe','About at cafe','')]),
   dict(id='bar',cls='bar',lv='02',time='17:00–03:00',name='三點水',en='3AM',short='Late-night kitchen & bar',
        img='/assets/space/1f-night.jpg',w=1400,h=867,alt='3AM at night · concept rendering',
        p='A late-night kitchen and bistro open until 3 a.m. Drop in after work or a meeting. No membership needed.',
        act=[('/en/reserve','Book a table','btn btn--solid'),('/en/3am','About 3AM','')]),
   dict(id='book',cls='book',lv='03',time='Members',name='約書旅',en='Rest Book',short='Reading · showers · lounge',
        img='/assets/space/2f-concept.jpg',w=1200,h=743,alt='Rest Book reading and rest area · concept rendering',
        p='Read or buy books, settle into a personal study seat, and use the showers and lounge. Take a break here before heading back out.',
        act=[('/en/system','See passes','btn btn--solid'),('/en/space#f2','About Rest Book','')]),
   dict(id='stay',cls='stay',lv='04',time='approx. 08:00–03:00',name='等等空間',en='Stay Square',short='Coworking · meeting rooms · tatami',
        img='/assets/space/3f-concept.jpg',w=1400,h=845,alt='Stay Square coworking and meeting rooms · concept rendering',
        p='A six-metre-high coworking space with meeting rooms, phone booths and a tatami corner — for focused work, meetings, talks and private events.',
        act=[('/en/system','See passes','btn btn--solid'),('/en/stay-square','About Stay Square',''),('/en/system#booking','Venue & buyout prices','')]),
  ],
  img_tag='Rendering'),
 'ja': dict(
  base='/ja', brand='言文字｜台湾タレントハブ',
  h1='<em>普段は出会えない人と、<span class="keep"><span class="swash">台北駅のそば</span>で出会う。</span></em>',
  lead='昼はコーヒー、夜は深夜ごはん。約書旅で本を読んでひと休み、等等空間で仕事や打ち合わせ。どのブランドも入口です。好きな入り方で、次の仕事仲間に出会ってください。',
  pickq='今日は何をしますか？',
  picks=[('#gate-cafe','ブランチ・コーヒー'),('#gate-bar','夜ごはん・一杯'),('#gate-book','読書・ひと休み'),('#gate-stay','仕事・打ち合わせ'),('/ja/events','イベントに参加')],
  hours='毎日 <span class="keep">在咖啡 08:00〜17:00</span> <span class="keep">· 三點水 17:00〜27:00</span><span class="keep">（翌03:00）</span>',
  loc='台北駅そば · 重慶南路一段11号', access=('/ja/access','台北駅Z10出口からの行き方 →'),
  idea_eye='コンセプト', idea_h='<span class="keep">台湾で最も</span><span class="keep">人材密度の高い拠点へ</span>',
  idea_p='人が集まれば、何かが始まる。食事・読書・仕事・交流をひとつの建物にまとめ、分野の違う人が自然に出会える場所をつくります。',
  steps=[('出会う','食事や読書、仕事の隣席にいるのは、エンジニア、デザイナー、起業家、台湾に滞在するリモートワーカーかもしれません。'),
         ('協働する','コミュニティの集まり、講座やワークショップが、出会った人ともう一度話すきっかけになります。'),
         ('起業する','拠点、実証の場、相談相手が必要なら、ここが台北での最初の一歩です。')],
  gates_eye='ハブマップ', gates_h='入口を選んでください', gates_p='マップを押すと各入口へ移動します。飲食は会員登録不要。約書旅・等等空間の利用方法は各入口をご覧ください。',
  map_label='言文字 ハブマップ', start='現在地：重慶南路側入口・台北駅Z10出口の斜め向かい',
  annex=('＋','付属設備','ランドリー・喫煙所'),
  gates=[
   dict(id='cafe',cls='cafe',lv='01',time='08:00〜17:00',name='在咖啡',en='at cafe',short='和定食・ハンドドリップ',
        img='/assets/space/1f-concept.jpg',w=1200,h=746,alt='在咖啡の飲食エリアの完成イメージ',
        p='和風の定食、ハンドドリップコーヒー、テイクアウト。打ち合わせや乗り換えの合間の作業に。会員登録不要。',
        act=[('/ja/reserve','席を予約','btn btn--accent'),('/ja/at-cafe','在咖啡について','')]),
   dict(id='bar',cls='bar',lv='02',time='17:00〜27:00',name='三點水',en='3AM',short='深夜食堂・ビストロ',
        img='/assets/space/1f-night.jpg',w=1400,h=867,alt='三點水の夜の完成イメージ',
        p='夜から深夜3時まで営業する深夜食堂・ビストロ。仕事帰りや打ち合わせの後に。会員登録不要。',
        act=[('/ja/reserve','席を予約','btn btn--solid'),('/ja/3am','三點水について','')]),
   dict(id='book',cls='book',lv='03',time='会員利用',name='約書旅',en='Rest Book',short='読書・シャワー・ラウンジ',
        img='/assets/space/2f-concept.jpg',w=1200,h=743,alt='約書旅の読書・休憩エリアの完成イメージ',
        p='本を読む・買う、個人の読書席、シャワーとラウンジ。仕事に疲れたら、ここで一冊読んでひと休み。',
        act=[('/ja/system','会員プランを見る','btn btn--solid'),('/ja/space#f2','約書旅について','')]),
   dict(id='stay',cls='stay',lv='04',time='約 08:00〜03:00',name='等等空間',en='Stay Square',short='コワーキング・会議室・畳',
        img='/assets/space/3f-concept.jpg',w=1400,h=845,alt='等等空間のコワーキング・会議室の完成イメージ',
        p='天井高6メートルのコワーキング、会議室、電話ブース、畳スペース。集中作業、会議、講座、貸切に。',
        act=[('/ja/system','会員プランを見る','btn btn--solid'),('/ja/stay-square','等等空間について',''),('/ja/system#booking','会場・貸切料金','')]),
  ],
  img_tag='イメージ'),
}

PIN = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>'


def gate_html(g, t, i):
    acts = ''.join(f'<a href="{h}"{" class=%s" % chr(34) + c + chr(34) if c else ""}>{l}</a>' for h, l, c in g['act'])
    load = 'decoding="async" fetchpriority="high"' if i == 0 else 'loading="lazy" decoding="async"'
    return (f'      <article class="gate gate--{g["cls"]} reveal" id="gate-{g["id"]}">\n'
            f'        <a class="gate__media" href="{g["act"][1][0]}" tabindex="-1" aria-hidden="true"><img src="{g["img"]}" alt="{g["alt"]}" width="{g["w"]}" height="{g["h"]}" {load}><span class="gate__tag">{t["img_tag"]}</span></a>\n'
            f'        <div class="gate__body"><p class="gate__no"><span class="gate__num">GATE <b>{g["lv"]}</b></span><span>{g["time"]}</span></p>'
            f'<span class="gate__moji" aria-hidden="true"></span><h3>{g["name"]}<span class="en">{g["en"]}</span></h3><p>{g["p"]}</p><div class="gate__actions">{acts}</div></div>\n'
            f'      </article>\n')


def map_html(t):
    g = {x['id']: x for x in t['gates']}
    def item(x):
        return f'<a class="f-{x["cls"]}" href="#gate-{x["id"]}"><span class="hub-map__lv">{x["lv"]}</span><b>{x["name"]} {x["en"]}</b><small>{x["short"]}</small></a>'
    an = t['annex']
    rows = [
        f'<li><span class="hub-map__annex"><span class="hub-map__lv">{an[0]}</span><b>{an[1]}</b><small>{an[2]}</small></span></li>',
        f'<li>{item(g["stay"])}</li>',
        f'<li>{item(g["book"])}</li>',
        f'<li>{item(g["bar"])}</li>',
        f'<li>{item(g["cafe"])}</li>',
    ]
    return (f'      <div class="hub-map" role="navigation" aria-label="{t["map_label"]}"><ol class="hub-map__list">\n        ' + '\n        '.join(rows)
            + f'\n      </ol><p class="hub-map__start"><i aria-hidden="true"></i><span>{t["start"]}</span></p></div>\n')


def block(t):
    picks = ''.join(f'<a href="{h}">{l}</a>' for h, l in t['picks'])
    steps = ''.join(f'<li><b>{a}</b><span>{b}</span></li>' for a, b in t['steps'])
    gates = ''.join(gate_html(g, t, i) for i, g in enumerate(t['gates']))
    return f'''<!-- HUB:START 由 tools/build-home-hub.py 產生，勿手改 -->
<!-- ===== HERO：聚落入口 ===== -->
<section class="hub-hero" id="top">
  <div class="wrap">
    <p class="hub-hero__brand">{t["brand"]}</p>
    <h1>{t["h1"]}</h1>
    <p class="lead">{t["lead"]}</p>
    <nav class="hub-pick" aria-label="{t["pickq"]}"><span class="hub-pick__q">{t["pickq"]}</span>{picks}</nav>
    <div class="hero__meta">
      <div class="hero__badges">
        <span class="hero__soon"><span class="dot" aria-hidden="true"></span><span>{t["hours"]}</span></span>
        <span class="hero__loc">{PIN}{t["loc"]}</span>
      </div>
      <p class="hero__note"><a href="{t["access"][0]}">{t["access"][1]}</a></p>
    </div>
  </div>
</section>

<!--FEATURED_EVENT-->
<!-- ===== 聚落理念 ===== -->
<section class="hub-idea" id="idea">
  <div class="wrap">
    <div class="sec-head reveal">
      <span class="eyebrow">{t["idea_eye"]}</span>
      <h2>{t["idea_h"]}</h2>
      <p>{t["idea_p"]}</p>
    </div>
    <ol class="hub-idea__steps reveal">{steps}</ol>
  </div>
</section>

<!-- ===== 入口（樓層導覽） ===== -->
<section class="hub-gates" id="floors">
  <div class="wrap">
    <div class="sec-head reveal">
      <span class="eyebrow">{t["gates_eye"]}</span>
      <h2>{t["gates_h"]}</h2>
      <p>{t["gates_p"]}</p>
    </div>
    <div class="hub-layout">
{map_html(t)}      <div class="gate-grid">
{gates}      </div>
    </div>
  </div>
</section>
<!-- HUB:END -->

'''


def main():
    for lang, rel in (('zh', 'index.html'), ('en', 'en/index.html'), ('ja', 'ja/index.html')):
        p = ROOT / rel
        s = p.read_text(encoding='utf-8')
        if '<!-- HUB:START' in s:
            s = re.sub(r'<!-- HUB:START.*?<!-- HUB:END -->\n\n', lambda _: block(T[lang]), s, count=1, flags=re.S)
        else:
            a = s.index('<!-- ===== HERO ===== -->')
            b = s.index('<!-- ===== PARTNERS ===== -->')
            s = s[:a] + block(T[lang]) + s[b:]
        if '/hub.css' not in s:
            s = s.replace('<link rel="stylesheet" href="/nav.css">', '<link rel="stylesheet" href="/nav.css">\n<link rel="stylesheet" href="/hub.css">', 1)
        p.write_text(s, encoding='utf-8')
        print('ok', rel)


if __name__ == '__main__':
    sys.exit(main())
