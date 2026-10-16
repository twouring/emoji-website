#!/usr/bin/env python3
"""導覽真相來源為 views/partials/header-*.html — 本腳本為 legacy 備援，勿與 partial 脫節。
統一導覽列產生器：全站共用「計畫/Programs」下拉（三計畫）＋ CIS 連結。
處理全部頁（不存在者略過）；替換 <header class="site-nav" id="nav">...</header>（含 <!--NAV--> 佔位）。
可重複執行（idempotent）。"""
import re, os

PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

PROGRAMS = [('partner', '/partner'), ('startup', '/startup')]

L = {
 # CIS 定案品牌名：zh「言文字｜台灣人才聚落」／en「emoji — Taiwan Talent Hub」／ja「言文字｜台湾タレントハブ」
 'zh': dict(base='', about='關於聚落', floors='消費方式', space='空間介紹', proglabel='聚落計畫',
   brand='企業識別', member='會員登入', member_authed='會員專區', cta='追蹤我們', ltop='中文', mopen='開啟選單', mclose='關閉選單',
   baria='言文字｜台灣人才聚落 首頁', bsub='台灣人才聚落',
   prog={'partner':'社群合作','startup':'新創支援（探索）'}),
 'en': dict(base='/en', about='About', floors='SYSTEM', space='Space', proglabel='Programs',
   brand='Brand', member='Member login', member_authed='Member area', cta='Follow us', ltop='English', mopen='Open menu', mclose='Close menu',
   baria='emoji — Taiwan Talent Hub home', bsub='emoji — Taiwan Talent Hub',
   prog={'partner':'Community Collaboration','startup':'Startup Support (Exploratory)'}),
 'ja': dict(base='/ja', about='ハブについて', floors='システム', space='スペース', proglabel='プログラム',
   brand='ブランド', member='会員ログイン', member_authed='会員エリア', cta='フォローする', ltop='日本語', mopen='メニューを開く', mclose='メニューを閉じる',
   baria='言文字｜台湾タレントハブ ホーム', bsub='台湾タレントハブ',
   prog={'partner':'コミュニティ連携','startup':'スタートアップ支援（探索）'}),
}
LANG_ORDER = [('zh','中文'),('en','English'),('ja','日本語')]
LANGARIA = {'zh':'切換語言', 'en':'Change language', 'ja':'言語を切り替え'}

def hreflang(lc): return 'zh-Hant' if lc=='zh' else lc

def page_href(base, slug):
    return (base + slug) if base else slug

def lang_target(lc, ptype):
    b = L[lc]['base']
    if ptype == 'main': return b + '/'
    if ptype == 'cis': return (b + '/cis/') if b else '/cis/'
    if ptype in ('about', 'system', 'space', 'member'):
        return page_href(b, '/' + ptype)
    return b + dict(PROGRAMS)[ptype]

def build(lang, ptype):
    d = L[lang]; base = d['base']; home = base + '/'
    about_href = page_href(base, '/about')
    system_href = page_href(base, '/system')
    space_href = page_href(base, '/space')
    member_href = page_href(base, '/member')
    # 計畫下拉
    prog_items = []
    for key, pth in PROGRAMS:
        ac = ' aria-current="page"' if ptype==key else ''
        prog_items.append(f'          <a href="{base}{pth}"{ac}>{d["prog"][key]}</a>')
    prog_items = '\n'.join(prog_items)
    about_ac = ' aria-current="page"' if ptype=='about' else ''
    system_ac = ' aria-current="page"' if ptype=='system' else ''
    space_ac = ' aria-current="page"' if ptype=='space' else ''
    brand_ac = ' aria-current="page"' if ptype=='cis' else ''
    brand_href = (base + '/cis/') if base else '/cis/'
    # 語言下拉（目標：主頁→各語系首頁；計畫／CIS 頁→各語系同頁）
    litems = []
    for lc, label in LANG_ORDER:
        tgt = lang_target(lc, ptype)
        ac = ' aria-current="page"' if lc==lang else ''
        litems.append(f'          <a href="{tgt}" hreflang="{hreflang(lc)}" lang="{hreflang(lc)}"{ac}>{label}</a>')
    litems = '\n'.join(litems)
    return f'''<header class="site-nav" id="nav">
  <div class="site-nav__inner">
    <a class="brand" href="{home}" aria-label="{d['baria']}">
      <b>言文字</b><span>{d['bsub']}</span>
    </a>
    <nav class="site-nav__links" id="navLinks" aria-label="{d['proglabel']}">
      <a href="{about_href}"{about_ac}>{d['about']}</a>
      <a href="{system_href}"{system_ac}>{d['floors']}</a>
      <a href="{space_href}"{space_ac}>{d['space']}</a>
      <div class="site-nav__dd">
        <button type="button" class="site-nav__dd-top" aria-haspopup="true" aria-expanded="false">{d['proglabel']} <svg class="site-nav__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="site-nav__menu">
{prog_items}
        </div>
      </div>
      <a href="{brand_href}"{brand_ac}>{d['brand']}</a>
      <a href="{member_href}" id="navMember" data-label-authed="{d['member_authed']}">{d['member']}</a>
      <div class="site-nav__dd site-nav__lang">
        <button type="button" class="site-nav__dd-top" aria-haspopup="true" aria-expanded="false" aria-label="{LANGARIA[lang]}">
          <svg class="site-nav__globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><ellipse cx="12" cy="12" rx="4" ry="9"/></svg>
          <span class="site-nav__lang-label">{d['ltop']}</span>
          <svg class="site-nav__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="site-nav__menu">
{litems}
        </div>
      </div>
      <a href="https://www.instagram.com/emoji0701" target="_blank" rel="noopener" class="btn">{d['cta']}</a>
    </nav>
    <button class="site-nav__toggle" id="navToggle" aria-label="{d['mopen']}" data-label-open="{d['mopen']}" data-label-close="{d['mclose']}" aria-controls="navLinks" aria-expanded="false">☰</button>
  </div>
</header>'''

FILES = {
 'index.html': ('zh','main'), 'en/index.html': ('en','main'), 'ja/index.html': ('ja','main'),
 'about.html': ('zh','about'), 'en/about.html': ('en','about'), 'ja/about.html': ('ja','about'),
 'system.html': ('zh','system'), 'en/system.html': ('en','system'), 'ja/system.html': ('ja','system'),
 'space.html': ('zh','space'), 'en/space.html': ('en','space'), 'ja/space.html': ('ja','space'),

 'partner/index.html': ('zh','partner'), 'en/partner/index.html': ('en','partner'), 'ja/partner/index.html': ('ja','partner'),
 'startup/index.html': ('zh','startup'), 'en/startup/index.html': ('en','startup'), 'ja/startup/index.html': ('ja','startup'),
 'cis/index.html': ('zh','cis'), 'en/cis/index.html': ('en','cis'), 'ja/cis/index.html': ('ja','cis'),
 'member.html': ('zh','member'), 'en/member.html': ('en','member'), 'ja/member.html': ('ja','member'),
}

if __name__ == '__main__':
    done, skip = [], []
    for rel,(lang,ptype) in FILES.items():
        path = os.path.join(PUB, rel)
        if not os.path.exists(path): skip.append(rel); continue
        html = open(path, encoding='utf-8').read()
        nav = build(lang, ptype)
        html2, n = re.subn(r'<header class="site-nav" id="nav">.*?</header>', lambda m: nav, html, count=1, flags=re.S)
        if n == 0:
            skip.append(rel + ' (無 site-nav header)'); continue
        open(path,'w',encoding='utf-8').write(html2)
        done.append(rel)
    print('✓ 已更新導覽：', ', '.join(done) or '(無)')
    if skip: print('· 略過：', ', '.join(skip))
