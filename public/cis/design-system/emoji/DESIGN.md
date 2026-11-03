---
name: "言文字｜台灣人才聚落 · emoji — Taiwan Talent Hub"
category: Brands
surface: web
colors:
  background: "#FBFAF6"
  surface: "#FFFFFF"
  foreground: "#1B1A17"
  muted: "#6B6558"
  border: "#E4E0D6"
  accent: "#1B1A17"
  accent-secondary: "#FFDE34"
  ink-surface: "#16150F"
  paper-alt: "#F4F1EA"
---

# 言文字｜台灣人才聚落 · emoji — Taiwan Talent Hub Design System

> Category: Brands
> Surface: web, social, deck, print, signage
> Owner: 言文字股份有限公司 Emoji Co., Ltd. · CIS v1.2 · Logo 2026 · moji Edition 01 (2026-08-26) · https://www.emoji.tw/cis/
> Yohaku 余白 as structure: warm ink on warm paper, Mincho display, classical Latin serif, sans body, and one yellow hit per view. "真正的余白，是很清楚要說什麼，所以不必說太多。"

## Brand and voice

- 言文字 is the talent hub by Taipei Main Station (台北車站旁的人才聚落). Ground floor is a light-meal cafe by day and a late-night diner by night; upper floors are member shared space.
- Fixed name forms. Separator is the full-width `｜`, never a dash, in Chinese and Japanese.
  - 中文：`言文字｜台灣人才聚落`
  - English: `emoji — Taiwan Talent Hub` — brand word always lowercase `emoji`, em dash. Only the legal entity is capitalised: `Emoji Co., Ltd.` "emoji" means the pictograph: a sign that gives text warmth.
  - 日本語：`言文字｜台湾タレントハブ`
- Sub-brands, fixed spelling: `在咖啡（at cafe）` daytime cafe, `三點水（3AM）` late-night diner / bistro, `等等空間（Stay Square）` member coworking space, `約書旅（Rest Book）` member reading and rest (brand color #687C70 mist moss; order: at cafe, 3AM, Stay Square, Rest Book). Sub-brands never replace the parent name. Retired and forbidden: "Emoji Cafe & Bar", "Member Plaza", "Talent Lounge". 三點水 is never called a bar, 酒吧 or izakaya.
- The romanisation of 言文字 is never written. The English name is `emoji`; Instagram is `@emoji0701`.
- Slogan, fixed: `讓你平常不會遇到的人，在台北車站旁相遇。` Keep 「你」, keep the word order, keep the final 。
- Brand essence: `台北車站旁的人才聚落` / "The talent hub by Taipei Main Station" / 「台北駅そばのタレントハブ」.
- Voice: yohaku. Short sentences, few adjectives, no exclamation marks. Bilingual pairs use `中文 · English` with a middle dot. Always 「余白」, never 「留白」 as the brand term. Taiwan Traditional Chinese only.
- Contact on every carrier: `us@emoji.tw` · `https://www.emoji.tw` · IG `@emoji0701` · `+886 921 102 067` · 臺北市中正區重慶南路一段 11 號.

## Colour

Ink and paper form the neutral axis. Yellow is the only accent.

| Role | Name | HEX | Token |
| --- | --- | --- | --- |
| Text, logo, actions | Ink · 墨 | `#1B1A17` | `--fg` / `--accent` / `--emoji-ink` |
| Page | Paper · 紙 | `#FBFAF6` | `--bg` / `--emoji-paper` |
| The one hit | Accent · 黃 | `#FFDE34` | `--emoji-yellow` |
| Footer, ink bands | Ink surface | `#16150F` | `--emoji-ink-surface` |
| Body copy | Ink soft | `#3A362E` | `--fg-2` |
| Labels, captions | Muted | `#6B6558` | `--muted` |
| Alternate band | Paper alt | `#F4F1EA` | `--surface-warm` |
| Dividers | Hairline | `#E4E0D6` | `--border` |
| Cards | Card | `#FFFFFF` | `--surface` |
| Inside logo files only | Logo fill | `#231815` | `--emoji-logo-fill` |

- **The yellow rule.** At most one yellow hit per view, under about 1% of the area. Yellow is always a ground and ink always sits on it: a marker underline behind two or three words, one small badge, `::selection`, moji's eye. It is a highlight, not a wash. Never a button fill, never a section background, never text colour, never a gradient. `--emoji-yellow-strong` `#F2CB00` is only the hover state of that same hit.
- **Actions are ink.** `--accent` is ink with paper text. The primary button is an ink pill; the secondary is a hairline outline. If a view has a yellow-underlined headline, its buttons stay ink so the count of yellow stays at one.
- On ink surfaces text is `--emoji-on-ink` `#EDE9E0`, secondary `--emoji-on-ink-soft` `#B7B0A2`; logos switch to the `*-reverse` files; yellow keeps its value.
- Status colours (`--success` `#3F6B3A`, `--warn` `#8A5A00`, `--danger` `#A3352B`) are for UI state text and thin borders only, never fills, never marketing.
- Contrast on paper (WCAG, measured): ink 16.7, ink soft 11.5, muted 5.5, success 6.0, warn 5.7, danger 6.5; ink on yellow 13.1; on-ink text on ink surface 15.1. Muted is not used under 12px.
- No pure black, no pure white page, no second accent, no tinted backgrounds beyond the tokens.

## Typography

| Role | Face | Token | Use |
| --- | --- | --- | --- |
| Display | Noto Serif TC 500 / 700 / 900 | `--font-display` | Headlines, names, pull quotes. Tracking `0.06em`, leading 1.25 |
| Latin and numerals | Cormorant Garamond 500 / 600 / 500 italic | `--emoji-font-latin` | English names, kickers, section numbers, prices, dates |
| Body and UI | Noto Sans TC 300 / 400 / 500 / 700 | `--font-body` | Running text 16px, leading 1.9; UI labels 12px uppercase tracked `0.18em` |

- Each face keeps its role; do not set body copy in serif or headlines in sans.
- Scale: 12 / 14 / 16 / 18 / 22 / 30 / 42 / 64. Running text never under 16px; 12px is for labels only.
- Headlines are short and may break by hand after a comma: `余白，` / `就是識別。` The highlighted words carry the yellow underline.
- The logo is outlined vector, not live type. Never re-set it in Noto Serif.
- Google Fonts: `Cormorant+Garamond:ital,wght@0,500;0,600;1,500`, `Noto+Sans+TC:wght@300;400;500;700`, `Noto+Serif+TC:wght@500;700;900`.

## Layout, radius and elevation

- Leave the space first, then place the ink. Every view keeps one clearly empty region; on phones the empty region survives (reduce content before reducing margins).
- Container 1120px; gutters 40 / 28 / 20. Section rhythm 120 / 88 / 64. Asymmetric two-column heads (number + title left, lede right) over centred stacks.
- Section heads carry a Cormorant numeral (`01`, `02` …) and a `中文 · English` title.
- Hairlines (`1px --border`) separate; boxes are rare. Cards are white on paper with a hairline and `--radius-md` 12px; chips and small controls 4px; pills 999px.
- Elevation: flat or hairline ring by default; `--elev-raised` is one soft paper shadow for a lifted card. No glow, glass, neumorphism or 3D.

## Logo and lockups

Files in `assets/logo/` (SVG + PNG). Pick the file that fits; never assemble a lockup.

| File | Use |
| --- | --- |
| `emoji-h.svg` | **Primary horizontal lockup** 言文字｜台灣人才聚落 + English |
| `emoji-v.svg` | Primary vertical lockup |
| `emoji-h-reverse.svg` / `emoji-v-reverse.svg` | Paper-coloured, for ink grounds |
| `emoji-brand-h.svg` / `emoji-brand-v.svg` | Parent brand 言文字 + emoji without the descriptor |
| `emoji-h-zh.svg` / `emoji-en.svg` | Chinese-only / English-only horizontal |
| `emoji-mark.svg` / `emoji-mark-reverse.svg` | Single-character mark 「言」 |
| `favicon.svg`, `logo.png`, `og-cover.jpg` | Favicon (言, transparent), Apple touch 512², OG 1200×630 |

- Clear space: at least ¼ of the character height on all sides. Squeezing the logo squeezes the voice.
- Grounds: paper, white, paper alt, or ink (reverse files). Never on photographs without a calm area, never on yellow.
- Do not stretch, recolour, rotate, outline, shadow, decorate or place on a busy ground.

## moji — the elephant

Files in `assets/moji/`. moji is the building's earliest regular, not a mascot. The name is only `moji`: lowercase, same face as `emoji` (emoji minus e; もじ = 文字). No Chinese name.

- Story: 言 → 文 → 字 → 象. Character line 「象，是最早的表情符號。」; sub-line 「言之有象 — words become worlds」. It never replaces the slogan.
- Family: `moji-mark` front mark (two speech-bubble ears, a comma trunk, one yellow eye) · `moji-seal` oracle-bone 象 for stamps and seals · `moji-side` side view that leaves the frame, for stairs and wayfinding · `moji-footprint` four toes, one yellow · `moji-punctuation` the trunk as comma, question mark, quotes, bubble. `*-reverse` files for ink grounds.
- States follow the floors: `moji-coffee` 1F day, `moji-night` 1F night, `moji-rest` 2F, `moji-remote` 3F working, `moji-meet` 3F events (two trunks touch; that point is the view's yellow).
- Line: stroke 8 at viewBox 200, stroke 10 under 40px, round caps and joins. Ink line on paper; paper line on ink; yellow unchanged.
- moji's yellow dot counts as the view's one yellow hit. Eye, meeting point or one toe, never two at once.
- Never: realistic skin or shading, cartoon blush or big eyes, a white-filled body (white elephant), tusks or ivory, Thai or Indian ornament.
- Event vocabulary: 象聚 · 象談 · 夜象 · 行象 · 印象 · 想像室 · 萬象牆 · 大象在房間.

## Components

Recipes live in `components.html`.

- **Page shell**: paper page, hairline sticky header with the `emoji-mark` 言 at 32–36px (full lockups need 120px+ width to stay legible), ink-surface footer with the reverse lockup, `moji-mark-reverse` and the contact line.
- **Hero**: Cormorant kicker (uppercase, tracked), Noto Serif headline with one `.hl` yellow underline, 16–18px lede in ink soft, meta row of hairline-separated facts.
- **Section head**: numeral + `中文 · English` title + lede.
- **Buttons**: primary ink pill, secondary hairline pill, text link with underline offset 3px. Height 44px+. Hover darkens or fills; no movement beyond 1px.
- **Badge**: 12px tracked label in a hairline pill. One yellow badge is allowed only if nothing else on the view is yellow.
- **Card**: white, hairline, 12px radius, generous padding (24–32px). Title in serif, body in sans.
- **Form**: label above field, 1px hairline field on white, ink focus ring, helper text in muted, error in `--danger` with text, not colour alone.
- **Table / list**: hairline rows, no zebra, numerals in Cormorant.
- **Notice / table sign**: moji speaks in a calm sentence. 「這一席，有人正在休息。」

## Motion

Slow and small. Reveal is opacity plus an 8px rise over 420ms, once. Hover is a colour change over 160ms. Respect `prefers-reduced-motion`. No parallax, bounce, confetti or looping decoration.

## Checklist before publishing

1. Is yellow there only once, as a ground with ink on it?
2. Is the logo unmodified, with its clear space, reverse file on ink?
3. Is the primary lockup 人才聚落, not any retired name?
4. Does the phone layout still hold yohaku?
5. Serif for titles, sans for body, Cormorant for Latin and numerals?
6. Short sentences, few adjectives, no exclamation marks?
7. Full-width `｜` in the name; lowercase `emoji`; lowercase `moji`?
8. moji drawn with three elements and one yellow dot?

## Do's and don'ts

- Do keep one empty region per view. Do use hairlines before boxes. Do let numerals and Latin sit in Cormorant.
- Don't add colours, gradients, glows, emoji glyphs as decoration, stock icons in mixed styles, or exclamation marks.
- Don't write Simplified Chinese or mainland terms. Don't write the romanised pronunciation of 言文字 anywhere.
