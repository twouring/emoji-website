"""Generate the sub-brand CIS pages in 中文 / English / 日本語 (moved from cis.emoji.tw, 2026-11-04).

Run: python3 -I tools/build-cis-brands.py
Writes public/{,en/,ja/}cis/brands/index.html (www.emoji.tw/cis/brands/) and
public/{,en/,ja/}cis/brands/<slug>/index.html. A sub-brand with its own site is served at
https://<host>/cis, /en/cis, /ja/cis (server.js, BRAND_HOSTS); www.emoji.tw/cis/brands/<slug>/ 301s there.
Assets live once in public/cis/brands/assets/<slug>/; all page links are absolute so the same file works on any host.
Copy: a localized field is a dict {"zh":…, "en":…, "ja":…}; shared template strings live in T.
"""
from html import escape
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "public"
ASSETS = PUB / "cis" / "brands" / "assets"
WWW = "https://www.emoji.tw/"
A = "/cis/brands/assets"  # absolute asset base, valid on www and on every sub-brand host
# Sub-brands with their own site: CIS lives at https://<host>/cis
HOSTS = {"at-cafe": "atcafe.emoji.tw", "3am": "3am.emoji.tw", "stay-square": "staysquare.emoji.tw", "rest-book": "restbook.emoji.tw"}
UPDATED = "2026-11-04"
LANGS = ("zh", "en", "ja")
HTML_LANG = {"zh": "zh-Hant", "en": "en", "ja": "ja"}
OG_LOCALE = {"zh": "zh_TW", "en": "en_US", "ja": "ja_JP"}
PREFIX = {"zh": "", "en": "en/", "ja": "ja/"}  # URL prefix of each language, relative to the site root
SWITCH = (("zh", "中文"), ("en", "English"), ("ja", "日本語"))

BRANDS = [
    {
        "slug": "at-cafe", "no": "01", "zh": "在咖啡", "latin": "at cafe", "logo_latin": "at café",
        "nav": {"zh": "在咖啡", "en": "at cafe", "ja": "在咖啡"},
        "role": {"zh": "日式簡餐與工作咖啡", "en": "Japanese set meals and working coffee", "ja": "日本式の定食とワーキングコーヒー"},
        "hours": {"zh": "08:00–17:00", "en": "08:00–17:00", "ja": "08:00–17:00"},
        "who": {"zh": "所有訪客，不需會員", "en": "All visitors, no membership needed", "ja": "どなたでも。会員登録は不要"},
        "site": {"zh": "https://atcafe.emoji.tw/", "en": "https://atcafe.emoji.tw/en", "ja": "https://atcafe.emoji.tw/ja"},
        "lede": {
            "zh": "白天的日式簡餐與工作咖啡。早餐、午餐、下午的咖啡，或約人碰面。",
            "en": "The daytime café for Japanese set meals and working coffee. Breakfast, lunch, an afternoon coffee, or a place to meet.",
            "ja": "昼の日本式の定食とワーキングコーヒー。朝食、ランチ、午後のコーヒー、待ち合わせにも。",
        },
        "mark": {
            "zh": "@ 形圖形標、at café 英文字標與「在咖啡」中文字標。英文字標帶重音 é，屬於標誌造型；內文寫法固定為 at cafe。",
            "en": "An @-shaped symbol, the “at café” English wordmark and the “在咖啡” Chinese wordmark. The accented é belongs to the logo lettering; in running text always write at cafe.",
            "ja": "@ 形のシンボル、at café の英字ロゴタイプ、「在咖啡」の漢字ロゴタイプで構成します。アクセント付きの é はロゴの造形で、本文では常に at cafe と表記します。",
        },
        "color": "#984C37", "rgb": "152 76 55",
        "color_name": {"zh": "磚紅 · Terracotta", "en": "Terracotta", "ja": "テラコッタ · Terracotta"},
        "moji": ("moji-coffee.svg", {
            "zh": ("白日咖啡", "象群在水邊相遇。杯套、餐墊、桌牌。"),
            "en": ("Daytime coffee", "Elephants meeting at the water’s edge. Cup sleeves, placemats, table signs."),
            "ja": ("昼のコーヒー", "水辺で出会う象たち。カップスリーブ、ランチョンマット、卓上サイン。"),
        }),
        "primary": 1, "horizontal": 4,
        "logos": {
            "zh": ["圖形標＋英文＋中文 · 直式主標", "圖形標＋英文", "英文＋中文", "圖形標＋英文 · 橫式", "英文主標＋中文"],
            "en": ["Symbol + English + Chinese · vertical primary", "Symbol + English", "English + Chinese", "Symbol + English · horizontal", "English primary + Chinese"],
            "ja": ["シンボル＋英字＋漢字 · 縦型メイン", "シンボル＋英字", "英字＋漢字", "シンボル＋英字 · 横型", "英字メイン＋漢字"],
        },
        "avatars": {
            "zh": ["完整組合", "圖形標＋英文", "中文主標", "英文主標", "橫式"],
            "en": ["Full set", "Symbol + English", "Chinese primary", "English primary", "Horizontal"],
            "ja": ["フルセット", "シンボル＋英字", "漢字メイン", "英字メイン", "横型"],
        },
    },
    {
        "slug": "3am", "no": "02", "zh": "三點水", "latin": "3AM", "logo_latin": "3am… Bistro",
        "nav": {"zh": "三點水", "en": "3AM", "ja": "三點水"},
        "role": {"zh": "深夜食堂與餐酒館", "en": "Late-night diner & bistro", "ja": "深夜食堂・ビストロ"},
        "hours": {"zh": "17:00–27:00", "en": "17:00–03:00 next day", "ja": "17:00–27:00"},
        "who": {"zh": "所有訪客，不需會員", "en": "All visitors, no membership needed", "ja": "どなたでも。会員登録は不要"},
        "site": {"zh": "https://3am.emoji.tw/", "en": "https://3am.emoji.tw/en", "ja": "https://3am.emoji.tw/ja"},
        "lede": {
            "zh": "夜間的深夜食堂與餐酒館。晚餐、宵夜、餐食佐酒，有人服務到凌晨三點。",
            "en": "The late-night diner & bistro for the evening. Dinner, late-night food and meals with drinks, staffed until 3 a.m.",
            "ja": "夜の深夜食堂・ビストロ。夕食、夜食、お酒に合う料理。深夜3時までスタッフが対応します。",
        },
        "mark": {
            "zh": "手寫斜體 3am… 字標，搭配 Bistro、直排「三點水」與連續圓形圖形標。標誌裡的 3am 小寫是字標造型；內文寫法固定為 3AM。",
            "en": "A handwritten italic “3am…” wordmark with “Bistro”, a vertical “三點水” and a symbol of linked circles. The lowercase 3am is part of the lettering; in running text always write 3AM.",
            "ja": "手書きイタリックの 3am… ロゴタイプに、Bistro、縦組みの「三點水」、連なる円のシンボルを組み合わせます。ロゴの小文字 3am は造形で、本文では常に 3AM と表記します。",
        },
        "color": "#6B8FAB", "rgb": "107 143 171",
        "color_name": {"zh": "夜藍灰 · Dusk Blue", "en": "Dusk Blue", "ja": "ダスクブルー · Dusk Blue"},
        "moji": ("moji-night.svg", {
            "zh": ("入夜", "深夜旅人。酒單、杯墊。眼睛半閉，話變少。"),
            "en": ("Nightfall", "The late-night traveler. Drink lists, coasters. Eyes half closed, fewer words."),
            "ja": ("夜更け", "深夜の旅人。ドリンクメニュー、コースター。目は半分閉じて、口数は少なめ。"),
        }),
        "primary": 1, "horizontal": 4,
        "logos": {
            "zh": ["3am＋Bistro · 主標", "Bistro 右上＋三點水下置", "Bistro 右上＋圖形標下置", "三點水＋Bistro 右上", "三點水＋Bistro＋圖形標"],
            "en": ["3am + Bistro · primary", "Bistro top right + 三點水 below", "Bistro top right + symbol below", "三點水 + Bistro top right", "三點水 + Bistro + symbol"],
            "ja": ["3am＋Bistro · メイン", "Bistro 右上＋三點水を下に", "Bistro 右上＋シンボルを下に", "三點水＋Bistro 右上", "三點水＋Bistro＋シンボル"],
        },
        "avatars": {
            "zh": ["3am＋Bistro", "Bistro 右上＋三點水", "Bistro 右上＋圖形標", "三點水＋Bistro", "三點水＋Bistro＋圖形標"],
            "en": ["3am + Bistro", "Bistro top right + 三點水", "Bistro top right + symbol", "三點水 + Bistro", "三點水 + Bistro + symbol"],
            "ja": ["3am＋Bistro", "Bistro 右上＋三點水", "Bistro 右上＋シンボル", "三點水＋Bistro", "三點水＋Bistro＋シンボル"],
        },
    },
    {
        "slug": "stay-square", "no": "03", "zh": "等等空間", "latin": "Stay Square", "logo_latin": "stay square",
        "nav": {"zh": "等等空間", "en": "Stay Square", "ja": "等等空間"},
        "role": {"zh": "會員的共享工作空間", "en": "Members’ coworking space", "ja": "会員向けのコワーキングスペース"},
        "hours": {"zh": "24 小時", "en": "24 hours", "ja": "24時間"},
        "who": {"zh": "持有效會籍的會員；活動與包場另行申請", "en": "Members with a valid membership; events and private hire by application",
                "ja": "有効な会員資格をお持ちの会員。イベントと貸切は別途申請"},
        "site": {"zh": "https://staysquare.emoji.tw/", "en": "https://staysquare.emoji.tw/en", "ja": "https://staysquare.emoji.tw/ja"},
        "lede": {
            "zh": "會員的共享工作空間。共享辦公、會議室與電話亭，也是講座與社群活動的場地。",
            "en": "The members’ coworking space. Shared desks, meeting rooms and phone booths — and the venue for talks and community events.",
            "ja": "会員のためのコワーキングスペース。共有デスク、会議室、電話ブース。講座やコミュニティイベントの会場にもなります。",
        },
        "mark": {
            "zh": "圓角方框內兩道斜線的圖形標（等一下的停頓），搭配手寫 stay square 英文字標、雙橫線與「等等空間」中文字標。標誌裡的小寫是字標造型；內文寫法固定為 Stay Square。",
            "en": "A rounded square holding two diagonal strokes — the pause of “just a moment” — with a handwritten “stay square” wordmark, a double rule and the “等等空間” Chinese wordmark. The lowercase is part of the lettering; in running text always write Stay Square.",
            "ja": "角丸の四角に2本の斜線を入れたシンボル（「ちょっと待って」の間）に、手書きの stay square 英字ロゴタイプ、二重線、「等等空間」の漢字ロゴタイプを組み合わせます。ロゴの小文字は造形で、本文では常に Stay Square と表記します。",
        },
        "color": "#2B4064", "rgb": "43 64 100",
        "color_name": {"zh": "深藍 · Navy", "en": "Navy", "ja": "ネイビー · Navy"},
        "moji": ("moji-remote.svg", {
            "zh": ("遠端", "遠端通話中。會議室名、電話亭、專注中門牌。"),
            "en": ("Remote", "On a remote call. Meeting room names, phone booths, “focusing” door signs."),
            "ja": ("リモート", "リモート通話中。会議室名、電話ブース、「集中中」のドアサイン。"),
        }),
        "primary": 1, "horizontal": 5,
        "logos": {
            "zh": ["圖形標＋英文＋中文 · 直式主標", "圖形標＋英文", "英文＋中文", "中文主標＋英文", "圖形標＋英中 · 橫式"],
            "en": ["Symbol + English + Chinese · vertical primary", "Symbol + English", "English + Chinese", "Chinese primary + English", "Symbol + English & Chinese · horizontal"],
            "ja": ["シンボル＋英字＋漢字 · 縦型メイン", "シンボル＋英字", "英字＋漢字", "漢字メイン＋英字", "シンボル＋英字・漢字 · 横型"],
        },
        "avatars": {
            "zh": ["完整組合", "圖形標＋英文", "英文＋中文", "橫式", "中文主標"],
            "en": ["Full set", "Symbol + English", "English + Chinese", "Horizontal", "Chinese primary"],
            "ja": ["フルセット", "シンボル＋英字", "英字＋漢字", "横型", "漢字メイン"],
        },
    },
    {
        "slug": "rest-book", "no": "04", "zh": "約書旅", "latin": "Rest Book", "logo_latin": "Rest Book",
        "nav": {"zh": "約書旅", "en": "Rest Book", "ja": "約書旅"},
        "role": {"zh": "貴賓室與閱讀", "en": "Lounge and reading", "ja": "ラウンジと読書"},
        "hours": {"zh": "24 小時，同一套價目", "en": "24 hours, one price list", "ja": "24時間、同一料金"},
        "who": {"zh": "不需會員；按時段付空間使用費", "en": "No membership needed; a space-use fee by time", "ja": "会員不要。時間ごとのスペース利用料"},
        "site": {"zh": "https://restbook.emoji.tw/", "en": "https://restbook.emoji.tw/en", "ja": "https://restbook.emoji.tw/ja"},
        "lede": {
            "zh": "書頁之間，歇一會。你在台北車站旁的貴賓室：看書、買書、手沖咖啡與零食飲料吧、淋浴、交誼廳，另有個人靜讀室。",
            "en": "A pause between pages. Your lounge by Taipei Main Station: books to read or buy, pour-over coffee and a snack bar, showers and a lounge, with quiet rooms to add.",
            "ja": "ページのあいだで、ひと休み。台北駅のそばの、あなたのラウンジ。本を読む・買う、ハンドドリップとスナックバー、シャワー、ラウンジ、そして静読室。",
        },
        "mark": {
            "zh": "山丘般的書頁包住「～」的圖形標（透空，跟隨背景色），搭配 Rest Book 手寫英文字標與節制斷筆的「約書旅」中文字標，由上而下為圖形 → 英文 → 中文。字標皆為外框定稿，內文寫法固定為 Rest Book（R、B 大寫，中間一個空格）。",
            "en": "A symbol of hill-like pages holding a “～” (open, it takes the background color), with the handwritten Rest Book wordmark and the “約書旅” Chinese wordmark with a few deliberate stroke breaks, stacked symbol → English → Chinese. Both wordmarks are outlined artwork; in running text always write Rest Book (capital R and B, one space).",
            "ja": "山なりのページが「～」を包むシンボル（抜きで背景色に従う）に、手書きの Rest Book 英字ロゴタイプと、控えめな筆の切れを持つ「約書旅」の漢字ロゴタイプを、シンボル → 英字 → 漢字の順に組みます。ロゴタイプはアウトライン化済みで、本文では常に Rest Book（R と B は大文字、間にスペース1つ）と表記します。",
        },
        "color": "#687C70", "rgb": "104 124 112",
        "color_name": {"zh": "霧苔綠 · Mist Moss", "en": "Mist Moss", "ja": "ミストモス · Mist Moss"},
        "moji": ("moji-rest.svg", {
            "zh": ("休憩", "站著也能睡。席位牌、淋浴間標示、安靜區標示。"),
            "en": ("Rest", "Able to nap even standing up. Seat cards, shower signs, quiet-area signs."),
            "ja": ("ひと休み", "立ったままでも眠れる。座席札、シャワー室の表示、静かなエリアの表示。"),
        }),
        "primary": 1, "horizontal": 2,
        "logos": {
            "zh": ["直式主標 · 霧苔綠", "橫式標誌", "圖形＋中文", "單獨圖形", "直式主標 · 暖墨單色"],
            "en": ["Vertical primary · Mist Moss", "Horizontal", "Symbol + Chinese", "Symbol only", "Vertical primary · ink"],
            "ja": ["縦型メイン · ミストモス", "横型", "シンボル＋漢字", "シンボルのみ", "縦型メイン · 墨一色"],
        },
        "avatars": {
            "zh": ["圖形＋中文", "單獨圖形", "直式主標"],
            "en": ["Symbol + Chinese", "Symbol only", "Vertical primary"],
            "ja": ["シンボル＋漢字", "シンボルのみ", "縦型メイン"],
        },
        # Rest Book ships a finished CIS manual, not a preliminary Illustrator file: its own usage/source copy.
        "usage_p": {
            "zh": "約書旅依《約書旅 Rest Book 品牌識別手冊 CIS 1.0》（2026-11-04）。以下為摘要，完整規範見原始檔。",
            "en": "Rest Book follows the Rest Book brand identity manual, CIS 1.0 (2026-11-04). This is a summary; see the source files for the full rules.",
            "ja": "約書旅は『約書旅 Rest Book ブランドアイデンティティ・マニュアル CIS 1.0』（2026-11-04）に従います。以下は要約で、詳細は元データを参照してください。",
        },
        "rules": {
            "zh": [
                ("維持原比例", "不拉伸、壓扁、傾斜，不加陰影、描邊、漸層或立體效果。"),
                ("三種配色", "霧苔綠、暖墨單色、紙白反白（放在霧苔綠或暖墨實色底）。書頁與「～」的透空區不填白。"),
                ("安全距離", "四周至少保留 x＝「約」字高的 ½；單獨圖形四周至少保留其高度的 ¼。"),
                ("最小尺寸", "直式主標 240 px／40 mm、橫式 320 px／55 mm、圖形＋中文 160 px／28 mm、單獨圖形 32 px／8 mm。再小就換圖形版。"),
                ("不重打字標", "手寫英文與斷筆中文是外框定稿，不補筆、不填斷口、不用字型重打。"),
                ("不借母品牌黃", "不放黃底、不混用其他品牌色，也不跨在嘈雜照片上。"),
            ],
            "en": [
                ("Keep the proportions", "Do not stretch, squash or slant it. No shadows, outlines, gradients or 3D effects."),
                ("Three color versions", "Mist Moss, ink, and paper-white knockout (on solid Mist Moss or ink). Never fill the open areas of the pages and “～”."),
                ("Clear space", "At least x on every side, where x is half the height of “約”. The symbol alone needs ¼ of its height."),
                ("Minimum size", "Vertical 240 px / 40 mm, horizontal 320 px / 55 mm, symbol + Chinese 160 px / 28 mm, symbol only 32 px / 8 mm. Smaller than that, switch to the symbol."),
                ("Never retype the wordmarks", "The handwritten English and the broken-stroke Chinese are outlined artwork. Do not add strokes, close the breaks or retype them in a font."),
                ("No master-brand yellow", "Never on a yellow background, never mixed with other brand colors, never across a busy photo."),
            ],
            "ja": [
                ("比率を変えない", "伸ばす、つぶす、傾けることはしません。影、フチ取り、グラデーション、立体効果も付けません。"),
                ("配色は3種類", "ミストモス、墨一色、紙白の白抜き（ミストモスか墨のベタ地の上）。ページと「～」の抜きは白で埋めません。"),
                ("余白", "周囲に x 以上（x＝「約」の字高の ½）。シンボル単体は高さの ¼ 以上。"),
                ("最小サイズ", "縦型 240 px／40 mm、横型 320 px／55 mm、シンボル＋漢字 160 px／28 mm、シンボルのみ 32 px／8 mm。これより小さいときはシンボル版に。"),
                ("ロゴタイプを打ち直さない", "手書きの英字と筆の切れのある漢字はアウトライン化済み。筆を足す、切れを埋める、フォントで打ち直すことはしません。"),
                ("マスターブランドの黄色を使わない", "黄色の地に置かず、ほかのブランドカラーと混ぜず、騒がしい写真の上にも置きません。"),
            ],
        },
        "color_note": {
            "zh": "HEX／RGB 為螢幕基準；CMYK 約 16 · 0 · 10 · 51 為通用換算參考，未指定 Pantone。霧苔綠對紙白對比 4.27 : 1，用於標誌、圖形與大字，不作小字正文。印刷前請輸出商依紙材打樣。",
            "en": "HEX / RGB are the screen reference; CMYK approx. 16 · 0 · 10 · 51 is a generic conversion, and no Pantone is specified. Mist Moss on paper is 4.27 : 1 — use it for the logo, graphics and large type, not small body text. Proof with the printer on the actual stock before printing.",
            "ja": "HEX／RGB は画面用の基準値です。CMYK 約 16 · 0 · 10 · 51 は一般的な換算の参考値で、Pantone の指定はありません。ミストモスと紙色のコントラストは 4.27 : 1 で、ロゴ、図形、大きな文字に使い、小さな本文には使いません。印刷前に用紙に合わせて色校正してください。",
        },
        "sources": [
            ("約書旅-RestBook-CIS手冊-1.0-20261104.pdf", {"zh": "PDF · 品牌識別手冊 28 頁（MI／BI／VI、規格與製作）", "en": "PDF · 28-page brand identity manual (MI / BI / VI, specs and production)", "ja": "PDF · ブランドアイデンティティ・マニュアル 28ページ（MI／BI／VI、仕様と制作）"}),
            ("約書旅-RestBook-logos-1.0-20261104.zip", {"zh": "ZIP · 六種組合 × 霧苔綠／暖墨／紙白反白，SVG、透明 PNG、向量 PDF", "en": "ZIP · six configurations × Mist Moss / ink / paper knockout as SVG, transparent PNG and vector PDF", "ja": "ZIP · 6種の組み合わせ × ミストモス／墨／紙白抜き。SVG、透過 PNG、ベクター PDF"}),
        ],
        "source_p": {
            "zh": "品牌識別手冊與標誌向量檔。印刷、改尺寸或做新應用，先從 SVG／PDF 開始，不截圖、不重打字標。",
            "en": "The brand identity manual and the logo vector files. For print, resizing or new applications start from the SVG / PDF; never screenshot or retype the wordmarks.",
            "ja": "ブランドアイデンティティ・マニュアルとロゴのベクターデータ。印刷、サイズ変更、新しい用途には SVG／PDF から始め、スクリーンショットやロゴタイプの打ち直しはしません。",
        },
        "dl": {"zh": "下載", "en": "Download", "ja": "ダウンロード"},
    },
]

MASTER = {"zh": "言文字｜台灣人才聚落", "en": "emoji — Taiwan Talent Hub", "ja": "言文字｜台湾タレントハブ"}

# Template strings. {zh}/{latin} etc. are filled with str.format.
T = {
    "zh": {
        "site": "言文字 CIS", "brands": "子品牌", "nav_label": "子品牌", "logo_alt": "言文字",
        "foot": "子品牌識別 · 更新", "master_cis": "母品牌 CIS",
        "title": "{zh} {latin} · 子品牌識別 · 言文字 CIS",
        "desc": "{zh}（{latin}）品牌識別：名稱寫法、標誌、品牌色、社群頭像、使用原則與 Illustrator 原始檔。言文字｜台灣人才聚落子品牌。",
        "facts": ("業態", "時段", "對象"), "links": ("官網介紹頁", "標誌", "原始檔"), "primary_alt": "{zh} 主標誌",
        "s_name": "名稱 · Naming", "s_name_p": "對內對外寫法固定。中英並置用全形括號或間隔點。",
        "n_zh": "中文", "n_zh_p": "不加引號、不加「店」等字尾。",
        "n_en": "English", "n_en_p": "內文寫法固定。標誌上的「{logo_latin}」是字標造型，不用來排內文。",
        "n_pair": "並置", "n_pair_b": "{zh}（{latin}）", "n_pair_p": "標題或卡片也可寫「{zh} {latin}」。",
        "n_master": "與母品牌", "n_master_b": "{zh} · {master}",
        "n_master_p": "子品牌不取代母品牌。對外文件、名片、招牌與官網，母品牌名稱或標誌至少出現一次；兩個標誌並列時以 1px 線或余白分開，不得組成新的 lockup。",
        "s_logo": "標誌 · Logo", "primary": "主標誌", "primary_p": "版面允許時優先使用 LOGO 0{n}。",
        "narrow": "窄幅版面", "narrow_p": "橫幅、招牌、頁首等扁長空間使用 LOGO 0{n}。",
        "dl_png": "下載 PNG", "logo_note": "預覽為壓縮圖；「下載 PNG」為原始透明底檔，寬約 4500 px。",
        "s_color": "色彩 · Color",
        "s_color_p": "每個子品牌只有一個品牌色，搭配母品牌的紙與墨。言文字的黃（#FFDE34）屬於母品牌，不用在子品牌標誌與品牌色面上。",
        "c_brand": "品牌色：標誌、頭像底色、小面積色塊", "paper": "紙 · Paper", "paper_p": "版面底色", "ink": "墨 · Ink", "ink_p": "內文與標題",
        "color_note": "品牌色由設計方輸出的 PNG 取樣，用於螢幕。原始檔未附 CMYK 與 Pantone，印刷前請以 AI 原始檔打樣確認。",
        "s_avatar": "社群頭像 · Avatar", "s_avatar_p": "品牌色底反白，正方形 4500 px。Instagram、Facebook、LINE 與 Google 商家的圓形裁切都放得下。",
        "s_usage": "使用原則 · Usage", "s_usage_p": "子品牌標誌目前是設計方的初步可用版本（2026-10-12）。以下規則先比照母品牌 CIS，正式版定案後更新。",
        "rules": [
            ("維持原比例", "不拉寬、壓扁、傾斜，不加描邊、陰影或漸層。"),
            ("不改色", "只用品牌色、白色反白與墨色三種。其他配色要先定案。"),
            ("留白", "標誌四周至少保留字標高度 ¼ 的空白。"),
            ("安靜的底", "放在紙色、白色或品牌色底上；照片上只放在乾淨、低對比的區域。"),
            ("不自行重組", "不拆開圖形標與字標重排，也不用字型重打字標。需要新的組合請找設計方。"),
            ("頭像用正方形檔", "社群頭像一律用 04 的正方形檔，不把透明底標誌自行疊上色塊。"),
        ],
        "moji_label": "角色 moji · {state}", "moji_p": "{zh}的店內物件可以用 moji 的這個狀態；moji 用墨色線，不換成品牌色。",
        "s_source": "原始檔 · Source", "s_source_p": "Adobe Illustrator，10 個 1080 × 1080 pt 畫板（PDF 相容，可用 Acrobat 預覽）。印刷、改尺寸或輸出其他格式從這份開始。",
        "source_meta": "Illustrator · 透明底標誌 5 款＋正方形頭像 5 款", "dl_ai": "下載 AI", "others": "其他子品牌",
        # index
        "i_title": "子品牌 · 在咖啡、三點水、等等空間、約書旅 · 言文字 CIS",
        "i_desc": "言文字｜台灣人才聚落的四個子品牌：在咖啡（at cafe）、三點水（3AM）、等等空間（Stay Square）、約書旅（Rest Book）。名稱、標誌、品牌色、社群頭像與原始檔。",
        "i_eyebrow": "Brand architecture · 子品牌", "i_h1": "一個聚落，四個子品牌",
        "i_lede": "言文字｜台灣人才聚落是母品牌。在咖啡、三點水、等等空間與約書旅是在聚落裡營運的子品牌，各有自己的標誌與品牌色，共用母品牌的紙、墨與余白。",
        "i_master_label": "母品牌 · Master brand", "i_master_sub": "emoji — Taiwan Talent Hub · 余白、名稱、標誌、色彩、字體與角色 moji",
        "i_brand_alt": "{zh} 標誌", "i_common": "共同規則", "i_common_p": "子品牌一起出現時，照這張表寫，照這個順序排。",
        "i_th": ("子品牌", "內文寫法", "標誌字標", "品牌色", "業態"),
        "i_rules": [
            ("排序固定", "在咖啡、三點水、等等空間、約書旅。標誌並列時同高、等距，不分大小。"),
            ("母品牌在上", "和言文字標誌一起出現時，言文字在上或在左，子品牌在下或在右。"),
            ("黃屬於母品牌", "#FFDE34 只出現在言文字的版面；子品牌各用自己的品牌色。"),
            ("用品牌，不用位置", "對外介紹以品牌與功能稱呼，不以所在位置稱呼。"),
        ],
    },
    "en": {
        "site": "emoji CIS", "brands": "Sub-brands", "nav_label": "Sub-brands", "logo_alt": "emoji",
        "foot": "Sub-brand identity · Updated", "master_cis": "Master brand CIS",
        "title": "{latin} ({zh}) · Sub-brand identity · emoji CIS",
        "desc": "Brand identity for {latin} ({zh}): naming, logo, brand color, social avatars, usage rules and the Illustrator source file. A sub-brand of emoji — Taiwan Talent Hub.",
        "facts": ("Concept", "Hours", "Who"), "links": ("Official page", "Logo", "Source file"), "primary_alt": "{latin} primary logo",
        "s_name": "Naming", "s_name_p": "Write the name the same way everywhere. When pairing Chinese and English, use parentheses or a middle dot.",
        "n_zh": "Chinese", "n_zh_p": "No quotation marks and no suffix such as “store”.",
        "n_en": "English", "n_en_p": "Fixed spelling for running text. The “{logo_latin}” on the logo is lettering, not a way to set text.",
        "n_pair": "Paired", "n_pair_b": "{zh} ({latin})", "n_pair_p": "Titles and cards may also use “{zh} {latin}”.",
        "n_master": "With the master brand", "n_master_b": "{latin} · {master}",
        "n_master_p": "A sub-brand never replaces the master brand. Documents, business cards, signage and the website show the master brand name or logo at least once. When the two logos sit side by side, separate them with a 1px rule or white space; never merge them into a new lockup.",
        "s_logo": "Logo", "primary": "Primary logo", "primary_p": "Use LOGO 0{n} whenever the layout allows.",
        "narrow": "Wide, short layouts", "narrow_p": "Use LOGO 0{n} for banners, signs, page headers and other long, low spaces.",
        "dl_png": "Download PNG", "logo_note": "Previews are compressed. “Download PNG” gives the original transparent file, about 4500 px wide.",
        "s_color": "Color",
        "s_color_p": "Each sub-brand has exactly one brand color, paired with the master brand’s paper and ink. The emoji yellow (#FFDE34) belongs to the master brand and is never used in sub-brand logos or brand color fields.",
        "c_brand": "Brand color: logo, avatar background, small color blocks", "paper": "Paper", "paper_p": "Page background", "ink": "Ink", "ink_p": "Body text and headings",
        "color_note": "Brand colors are sampled from the designer’s PNG exports and are for screens. The source files include no CMYK or Pantone values; proof from the AI source before printing.",
        "s_avatar": "Social avatar", "s_avatar_p": "White on the brand color, 4500 px square. Fits the circular crop on Instagram, Facebook, LINE and Google Business Profile.",
        "s_usage": "Usage", "s_usage_p": "The sub-brand logos are the designer’s preliminary working version (2026-10-12). Until the final version is approved, these rules follow the master brand CIS.",
        "rules": [
            ("Keep the proportions", "Do not stretch, squash or slant it. No outlines, shadows or gradients."),
            ("Keep the colors", "Only the brand color, white knockout and ink. Any other color scheme needs approval first."),
            ("Clear space", "Leave at least ¼ of the wordmark height clear on every side."),
            ("A quiet background", "Place it on paper, white or the brand color. On photos, only over clean, low-contrast areas."),
            ("No rearranging", "Do not split the symbol from the wordmark, and do not retype the wordmark in a font. Ask the designer for new combinations."),
            ("Square files for avatars", "Always use the square files in 04 for social avatars; do not drop the transparent logo onto a color block yourself."),
        ],
        "moji_label": "Character moji · {state}", "moji_p": "In-store items at {latin} can use this moji pose. moji is always drawn in ink, never in the brand color.",
        "s_source": "Source file", "s_source_p": "Adobe Illustrator, 10 artboards at 1080 × 1080 pt (PDF-compatible, previews in Acrobat). Start here for print, resizing or other formats.",
        "source_meta": "Illustrator · 5 transparent logos + 5 square avatars", "dl_ai": "Download AI", "others": "Other sub-brands",
        "i_title": "Sub-brands · at cafe, 3AM, Stay Square, Rest Book · emoji CIS",
        "i_desc": "The four sub-brands of emoji — Taiwan Talent Hub: at cafe (在咖啡), 3AM (三點水), Stay Square (等等空間) and Rest Book (約書旅). Naming, logos, brand colors, social avatars and source files.",
        "i_eyebrow": "Brand architecture", "i_h1": "One hub, four sub-brands",
        "i_lede": "emoji — Taiwan Talent Hub is the master brand. at cafe, 3AM, Stay Square and Rest Book are the sub-brands that run inside the hub. Each has its own logo and brand color, and all share the master brand’s paper, ink and white space.",
        "i_master_label": "Master brand", "i_master_sub": "言文字｜台灣人才聚落 · white space, naming, logo, color, type and the moji character",
        "i_brand_alt": "{latin} logo", "i_common": "Shared rules", "i_common_p": "When the sub-brands appear together, write them as in this table and keep this order.",
        "i_th": ("Sub-brand", "In running text", "Logo lettering", "Brand color", "Concept"),
        "i_rules": [
            ("Fixed order", "at cafe, 3AM, Stay Square, Rest Book. Side by side, the logos share one height and equal spacing — none is bigger."),
            ("Master brand first", "With the emoji logo, emoji goes on top or on the left; the sub-brand goes below or on the right."),
            ("Yellow is the master brand’s", "#FFDE34 appears only in emoji layouts. Each sub-brand uses its own brand color."),
            ("Brands, not locations", "Describe each place by its brand and function, never by its position in the building."),
        ],
    },
    "ja": {
        "site": "言文字 CIS", "brands": "サブブランド", "nav_label": "サブブランド", "logo_alt": "言文字",
        "foot": "サブブランド・アイデンティティ · 更新", "master_cis": "マスターブランド CIS",
        "title": "{zh} {latin} · サブブランド・アイデンティティ · 言文字 CIS",
        "desc": "{zh}（{latin}）のブランドアイデンティティ：名称表記、ロゴ、ブランドカラー、SNS アイコン、使用ルール、Illustrator 元データ。言文字｜台湾タレントハブのサブブランドです。",
        "facts": ("業態", "時間", "対象"), "links": ("公式紹介ページ", "ロゴ", "元データ"), "primary_alt": "{zh} メインロゴ",
        "s_name": "名称 · Naming", "s_name_p": "表記は社内外で統一します。漢字と英字を並べるときは全角括弧か中黒を使います。",
        "n_zh": "中国語", "n_zh_p": "かぎ括弧で囲まず、「店」などの語尾も付けません。",
        "n_en": "English", "n_en_p": "本文の表記はこれで固定です。ロゴ上の「{logo_latin}」はロゴタイプの造形で、本文には使いません。",
        "n_pair": "併記", "n_pair_b": "{zh}（{latin}）", "n_pair_p": "見出しやカードでは「{zh} {latin}」とも書けます。",
        "n_master": "マスターブランドとの関係", "n_master_b": "{zh} · {master}",
        "n_master_p": "サブブランドはマスターブランドに代わるものではありません。対外文書、名刺、看板、公式サイトには、マスターブランドの名称かロゴを少なくとも一度入れます。2つのロゴを並べるときは 1px の線か余白で区切り、新しいロックアップは作りません。",
        "s_logo": "ロゴ · Logo", "primary": "メインロゴ", "primary_p": "レイアウトが許す限り LOGO 0{n} を優先します。",
        "narrow": "横長のレイアウト", "narrow_p": "バナー、看板、ページヘッダーなど横長のスペースには LOGO 0{n} を使います。",
        "dl_png": "PNG をダウンロード", "logo_note": "プレビューは圧縮画像です。「PNG をダウンロード」は透過背景の元データで、幅は約 4500 px です。",
        "s_color": "カラー · Color",
        "s_color_p": "サブブランドのブランドカラーは各1色で、マスターブランドの紙色と墨色と組み合わせます。言文字の黄色（#FFDE34）はマスターブランド専用で、サブブランドのロゴやカラー面には使いません。",
        "c_brand": "ブランドカラー：ロゴ、アイコン背景、小面積の色面", "paper": "紙 · Paper", "paper_p": "背景色", "ink": "墨 · Ink", "ink_p": "本文と見出し",
        "color_note": "ブランドカラーはデザイナー書き出しの PNG から取った画面用の値です。元データに CMYK と Pantone の指定はないため、印刷前に AI 元データで色校正してください。",
        "s_avatar": "SNS アイコン · Avatar", "s_avatar_p": "ブランドカラー地に白抜き、4500 px の正方形。Instagram、Facebook、LINE、Google ビジネスプロフィールの円形トリミングにも収まります。",
        "s_usage": "使用ルール · Usage", "s_usage_p": "サブブランドのロゴは、現在デザイナーによる暫定版（2026-10-12）です。正式版が決まるまで、以下のルールはマスターブランドの CIS に準じます。",
        "rules": [
            ("比率を変えない", "横に伸ばす、つぶす、傾けることはしません。フチ取り、影、グラデーションも付けません。"),
            ("色を変えない", "使うのはブランドカラー、白抜き、墨色の3つだけ。ほかの配色は事前に決定が必要です。"),
            ("余白", "ロゴの周囲には、ロゴタイプの高さの ¼ 以上の余白を確保します。"),
            ("静かな背景", "紙色、白、ブランドカラーの上に置きます。写真の上では、すっきりした低コントラストの部分にだけ置きます。"),
            ("組み替えない", "シンボルとロゴタイプを分けて並べ替えたり、フォントで打ち直したりしません。新しい組み合わせはデザイナーに依頼します。"),
            ("アイコンは正方形データで", "SNS アイコンには必ず 04 の正方形データを使い、透過ロゴを色面に自分で重ねません。"),
        ],
        "moji_label": "キャラクター moji · {state}", "moji_p": "{zh}の店内アイテムには、moji のこのポーズを使えます。moji は墨色の線で描き、ブランドカラーには変えません。",
        "s_source": "元データ · Source", "s_source_p": "Adobe Illustrator、1080 × 1080 pt のアートボード10枚（PDF 互換で Acrobat でもプレビュー可）。印刷、サイズ変更、ほかの形式への書き出しはこのデータから。",
        "source_meta": "Illustrator · 透過ロゴ5種＋正方形アイコン5種", "dl_ai": "AI をダウンロード", "others": "ほかのサブブランド",
        "i_title": "サブブランド · 在咖啡、三點水、等等空間、約書旅 · 言文字 CIS",
        "i_desc": "言文字｜台湾タレントハブの4つのサブブランド、在咖啡（at cafe）、三點水（3AM）、等等空間（Stay Square）、約書旅（Rest Book）。名称、ロゴ、ブランドカラー、SNS アイコン、元データ。",
        "i_eyebrow": "Brand architecture · サブブランド", "i_h1": "ひとつのハブに、4つのサブブランド",
        "i_lede": "言文字｜台湾タレントハブがマスターブランドです。在咖啡、三點水、等等空間、約書旅はハブの中で運営するサブブランドで、それぞれ独自のロゴとブランドカラーを持ち、マスターブランドの紙色、墨色、余白を共有します。",
        "i_master_label": "マスターブランド · Master brand", "i_master_sub": "emoji — Taiwan Talent Hub · 余白、名称、ロゴ、カラー、書体、キャラクター moji",
        "i_brand_alt": "{zh} ロゴ", "i_common": "共通ルール", "i_common_p": "サブブランドを一緒に出すときは、この表のとおりに書き、この順番で並べます。",
        "i_th": ("サブブランド", "本文の表記", "ロゴの文字", "ブランドカラー", "業態"),
        "i_rules": [
            ("順番は固定", "在咖啡、三點水、等等空間、約書旅の順。ロゴを並べるときは同じ高さ・等間隔にし、大小をつけません。"),
            ("マスターブランドが先", "言文字のロゴと一緒に出すときは、言文字を上か左、サブブランドを下か右に置きます。"),
            ("黄色はマスターブランドのもの", "#FFDE34 は言文字の紙面にだけ使います。サブブランドはそれぞれのブランドカラーを使います。"),
            ("場所ではなくブランドで", "対外的な紹介はブランド名と機能で呼び、建物内の位置は書きません。"),
        ],
    },
}

FONT_FAMILIES = {
    "zh": "family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@500;700",
    "en": "family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@500;700",
    "ja": "family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Noto+Sans+JP:wght@300;400;500;700&family=Noto+Serif+JP:wght@500;700",
}


def fonts(lang):
    return ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
            f'<link href="https://fonts.googleapis.com/css2?{FONT_FAMILIES[lang]}&display=swap" rel="stylesheet">')


def u(path):
    return quote(path, safe="/.-_")


def files(slug, kind):
    return sorted(p.name for p in (ASSETS / slug / kind).iterdir() if not p.name.startswith("."))


def name(b, lang):
    """How a brand is called in body copy: Chinese name on zh/ja pages, the English name on en pages."""
    return b["latin"] if lang == "en" else b["zh"]


def master_url(lang):
    return f"{WWW}{PREFIX[lang]}cis/"


def index_url(lang):
    return f"{WWW}{PREFIX[lang]}cis/brands/"


def brand_url(slug, lang):
    if slug in HOSTS:
        return f"https://{HOSTS[slug]}/{PREFIX[lang]}cis"
    return f"{WWW}{PREFIX[lang]}cis/brands/{slug}/"


def lang_switch(lang, urls):
    links = "".join(f'<a href="{urls[l]}" hreflang="{HTML_LANG[l]}" lang="{HTML_LANG[l]}"{" aria-current=\"page\"" if l == lang else ""}>{label}</a>'
                    for l, label in SWITCH)
    return f'<nav class="lang-switch" aria-label="Language">{links}</nav>'


def head(lang, title, desc, urls, extra=""):
    canonical = urls[lang]
    alts = "".join(f'<link rel="alternate" hreflang="{HTML_LANG[l]}" href="{urls[l]}">' for l in LANGS)
    alts += f'<link rel="alternate" hreflang="x-default" href="{urls["zh"]}">'
    return (f'<!doctype html><html lang="{HTML_LANG[lang]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(title)}</title><meta name="description" content="{escape(desc)}"><link rel="canonical" href="{canonical}">{alts}'
            f'<meta property="og:type" content="website"><meta property="og:url" content="{canonical}"><meta property="og:locale" content="{OG_LOCALE[lang]}">'
            f'<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(desc)}">'
            f'<link rel="icon" href="/cis/logo/favicon.svg" type="image/svg+xml">{fonts(lang)}<link rel="stylesheet" href="/cis/brands/styles.css">{extra}</head>')


def topbar(lang, urls, current):
    """Index page lists every sub-brand. A sub-brand page lives on that brand's own site, so it links only to
    itself and back to the CIS on www, never to sister brands (KK 2026-11-03: each brand site introduces only itself)."""
    t = T[lang]
    links = [("brands", index_url(lang), t["brands"])]
    links += [(b["slug"], brand_url(b["slug"], lang), b["nav"][lang]) for b in BRANDS if current == "brands" or b["slug"] == current]
    nav = "".join(f'<a href="{h}"{" aria-current=\"page\"" if k == current else ""}>{x}</a>' for k, h, x in links)
    return (f'<header class="top"><div class="wrap"><a class="home" href="{master_url(lang)}"><img src="/cis/logo/emoji-mark.svg" alt="" width="22" height="22">{t["site"]}</a>'
            f'<nav class="nav" aria-label="{t["nav_label"]}">{nav}</nav>{lang_switch(lang, urls)}</div></header>')


def footer(lang):
    t = T[lang]
    return (f'<footer class="foot"><div class="wrap"><span>{MASTER[lang]} · {t["foot"]} {UPDATED}</span>'
            f'<span><a href="{master_url(lang)}">{t["master_cis"]}</a> · <a href="{index_url(lang)}">{t["brands"]}</a> · us@emoji.tw</span></div></footer>')


def asset_card(lang, slug, kind, i, src, label, solid):
    preview = f"{A}/{slug}/preview/{kind}-0{i}.webp"
    orig = f"{A}/{slug}/{kind}/{u(src)}"
    cls = "card__art card__art--solid" if solid else "card__art card__art--check"
    return (f'<figure class="card"><div class="{cls}"><img src="{preview}" alt="{escape(label)}" loading="lazy"></div>'
            f'<figcaption><span><i>{kind.upper()} 0{i}</i><b>{escape(label)}</b></span><a class="dl" href="{orig}" download>{T[lang]["dl_png"]}</a></figcaption></figure>')


def brand_page(b, lang):
    t, s = T[lang], b["slug"]
    urls = {l: brand_url(s, l) for l in LANGS}
    logos, avatars = files(s, "logo"), files(s, "avatar")
    f = dict(zh=b["zh"], latin=b["latin"], logo_latin=b["logo_latin"], master=MASTER[lang], name=name(b, lang))
    p = [head(lang, t["title"].format(**f), t["desc"].format(**f), urls, f'<style>:root{{--brand:{b["color"]}}}</style>'),
         "<body>", topbar(lang, urls, s), "<main>"]
    facts = "".join(f'<div><dt>{k}</dt><dd>{v}</dd></div>' for k, v in zip(t["facts"], (b["role"][lang], b["hours"][lang], b["who"][lang])))
    l1, l2, l3 = t["links"]
    p.append(
        f'<section class="hero"><div class="wrap hero__grid"><div>'
        f'<p class="eyebrow">Sub-brand {b["no"]} · {MASTER[lang]}</p>'
        f'<h1>{b["zh"]}<span class="latin">{b["latin"]}</span></h1><p class="lede">{b["lede"][lang]}</p>'
        f'<dl class="facts">{facts}</dl>'
        f'<p class="hero__links"><a href="{b["site"][lang]}">{l1}</a><a href="#logo">{l2}</a><a href="#source">{l3}</a></p></div>'
        f'<div class="hero__art"><img src="{A}/{s}/preview/logo-0{b["primary"]}.webp" alt="{escape(t["primary_alt"].format(**f))}"></div></div></section>')
    # 01 名稱
    p.append(
        f'<section class="sec" id="name"><div class="wrap"><header class="sec__head"><span class="num">01</span><h2>{t["s_name"]}</h2>'
        f'<p>{t["s_name_p"]}</p></header><div class="names">'
        f'<div class="name"><span class="label">{t["n_zh"]}</span><b>{b["zh"]}</b><p>{t["n_zh_p"]}</p></div>'
        f'<div class="name"><span class="label">{t["n_en"]}</span><b class="latin">{b["latin"]}</b><p>{t["n_en_p"].format(**f)}</p></div>'
        f'<div class="name"><span class="label">{t["n_pair"]}</span><b>{t["n_pair_b"].format(**f)}</b><p>{t["n_pair_p"].format(**f)}</p></div>'
        f'<div class="name name--wide"><span class="label">{t["n_master"]}</span><b>{t["n_master_b"].format(**f)}</b>'
        f'<p>{t["n_master_p"]}</p></div>'
        f'</div></div></section>')
    # 02 標誌
    cards = "".join(asset_card(lang, s, "logo", i, fn, lab, False) for i, (fn, lab) in enumerate(zip(logos, b["logos"][lang]), 1))
    p.append(
        f'<section class="sec" id="logo"><div class="wrap"><header class="sec__head"><span class="num">02</span><h2>{t["s_logo"]}</h2>'
        f'<p>{b["mark"][lang]}</p></header>'
        f'<div class="pair"><div class="pair__item"><span class="label">{t["primary"]}</span><p>{t["primary_p"].format(n=b["primary"])}</p></div>'
        f'<div class="pair__item"><span class="label">{t["narrow"]}</span><p>{t["narrow_p"].format(n=b["horizontal"])}</p></div></div>'
        f'<div class="grid grid--logo">{cards}</div><p class="note">{t["logo_note"]}</p></div></section>')
    # 03 色彩
    p.append(
        f'<section class="sec" id="color"><div class="wrap"><header class="sec__head"><span class="num">03</span><h2>{t["s_color"]}</h2>'
        f'<p>{t["s_color_p"]}</p></header>'
        f'<div class="swatches"><div class="sw sw--brand"><div class="sw__chip"></div><div class="sw__meta"><b>{b["color_name"][lang]}</b><code>{b["color"]}</code><span>RGB {b["rgb"]}</span><span>{t["c_brand"]}</span></div></div>'
        f'<div class="sw"><div class="sw__chip" style="background:#FBFAF6;border-bottom:1px solid var(--line)"></div><div class="sw__meta"><b>{t["paper"]}</b><code>#FBFAF6</code><span>RGB 251 250 246</span><span>{t["paper_p"]}</span></div></div>'
        f'<div class="sw"><div class="sw__chip" style="background:#1B1A17"></div><div class="sw__meta"><b>{t["ink"]}</b><code>#1B1A17</code><span>RGB 27 26 23</span><span>{t["ink_p"]}</span></div></div></div>'
        f'<p class="note">{b["color_note"][lang] if "color_note" in b else t["color_note"]}</p></div></section>')
    # 04 頭像
    cards = "".join(asset_card(lang, s, "avatar", i, fn, lab, True) for i, (fn, lab) in enumerate(zip(avatars, b["avatars"][lang]), 1))
    p.append(
        f'<section class="sec" id="avatar"><div class="wrap"><header class="sec__head"><span class="num">04</span><h2>{t["s_avatar"]}</h2>'
        f'<p>{t["s_avatar_p"]}</p></header>'
        f'<div class="grid grid--3" style="--cols:{len(avatars)}">{cards}</div></div></section>')
    # 05 使用原則
    svg, mj = b["moji"][0], b["moji"][1][lang]
    rr = "".join(f'<div class="rule"><b>{x}</b><p>{d}</p></div>' for x, d in (b["rules"][lang] if "rules" in b else t["rules"]))
    p.append(
        f'<section class="sec" id="usage"><div class="wrap"><header class="sec__head"><span class="num">05</span><h2>{t["s_usage"]}</h2>'
        f'<p>{b["usage_p"][lang] if "usage_p" in b else t["s_usage_p"]}</p></header>'
        f'<div class="rules">{rr}</div>'
        f'<div class="moji"><img src="/cis/moji/assets/{svg}" alt="moji · {mj[0]}" width="120" height="120"><div><span class="label">{t["moji_label"].format(state=mj[0])}</span>'
        f'<p>{mj[1]}{" " if lang == "en" else ""}{t["moji_p"].format(**f)}</p></div></div></div></section>')
    # 06 原始檔
    if "sources" in b:
        srcs = [(fn, meta[lang], b["dl"][lang]) for fn, meta in b["sources"]]
    else:
        srcs = [(files(s, "source")[0], t["source_meta"], t["dl_ai"])]
    links = "".join(f'<a class="source" href="{A}/{s}/source/{u(fn)}" download><span><b>{escape(fn)}</b><span>{meta}</span></span><em>{dl}</em></a>' for fn, meta, dl in srcs)
    p.append(
        f'<section class="sec" id="source"><div class="wrap"><header class="sec__head"><span class="num">06</span><h2>{t["s_source"]}</h2>'
        f'<p>{b["source_p"][lang] if "source_p" in b else t["s_source_p"]}</p></header>'
        f'{links}</div></section>')
    p += ["</main>", footer(lang), "</body></html>"]
    return "".join(p)


def index_page(lang):
    t = T[lang]
    urls = {l: index_url(l) for l in LANGS}
    p = [head(lang, t["i_title"], t["i_desc"], urls), "<body>", topbar(lang, urls, "brands"), "<main>"]
    p.append(f'<section class="hero hero--index"><div class="wrap"><p class="eyebrow">{t["i_eyebrow"]}</p>'
             f'<h1>{t["i_h1"]}</h1><p class="lede">{t["i_lede"]}</p></div></section>')
    master_logo = "emoji-en.svg" if lang == "en" else "emoji-h.svg"
    p.append(f'<section class="sec sec--tight"><div class="wrap"><a class="parent" href="{master_url(lang)}"><img src="/cis/logo/{master_logo}" alt="{MASTER[lang]}"><span><span class="label">{t["i_master_label"]}</span>'
             f'<b>{MASTER[lang]}</b><span>{t["i_master_sub"]}</span></span><em>{t["master_cis"]}</em></a>'
             f'<div class="tree" aria-hidden="true">{"<i></i>" * len(BRANDS)}</div><div class="brands">')
    for b in BRANDS:
        f = dict(zh=b["zh"], latin=b["latin"])
        p.append(f'<a class="brand" href="{brand_url(b["slug"], lang)}" style="--brand:{b["color"]}"><div class="brand__art"><img src="{A}/{b["slug"]}/preview/logo-0{b["primary"]}.webp" alt="{escape(t["i_brand_alt"].format(**f))}"></div>'
                 f'<div class="brand__copy"><span class="label">Sub-brand {b["no"]}</span><h2>{b["zh"]} <span class="latin">{b["latin"]}</span></h2>'
                 f'<p>{b["role"][lang]} · {b["hours"][lang]}</p><span class="brand__color"><i></i>{b["color"]}</span></div></a>')
    p.append('</div></div></section>')
    pair = "{zh}（{latin}）" if lang != "en" else "{latin} ({zh})"
    rows = "".join(f'<tr><th>{b["nav"][lang]}</th><td>{pair.format(zh=b["zh"], latin=b["latin"])}</td><td class="latin">{b["logo_latin"]}</td><td><i style="background:{b["color"]}"></i>{b["color"]}</td><td>{b["role"][lang]}</td></tr>' for b in BRANDS)
    th = "".join(f"<th>{x}</th>" for x in t["i_th"])
    rr = "".join(f'<div class="rule"><b>{x}</b><p>{d}</p></div>' for x, d in t["i_rules"])
    p.append(f'<section class="sec"><div class="wrap"><header class="sec__head"><span class="num">—</span><h2>{t["i_common"]}</h2>'
             f'<p>{t["i_common_p"]}</p></header>'
             f'<div class="table"><table><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table></div>'
             f'<div class="rules rules--2">{rr}</div></div></section>')
    p += ["</main>", footer(lang), "</body></html>"]
    return "".join(p)


if __name__ == "__main__":
    n = 0
    for lang in LANGS:
        out = PUB / PREFIX[lang] / "cis" / "brands"
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(index_page(lang), encoding="utf-8"); n += 1
        for b in BRANDS:
            d = out / b["slug"]
            d.mkdir(exist_ok=True)
            (d / "index.html").write_text(brand_page(b, lang), encoding="utf-8"); n += 1
    print("wrote", n, "pages (zh-Hant / en / ja)")
