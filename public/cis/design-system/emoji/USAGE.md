# emoji Usage

Package guide for OpenDesign agents building 言文字｜台灣人才聚落 (emoji — Taiwan Talent Hub) artifacts: web pages, IG posts, decks, menus, table signs, print and signage.

## Read Order

1. Read this file for the package contract.
2. Read `DESIGN.md` for the CIS v1.2 rules: fixed names, the yellow rule, the three typefaces, logo files, moji, components and the publishing checklist.
3. Paste the whole `:root` block from `tokens.css` into the first `<style>` of the artifact before writing component CSS. Copy the two dark blocks only for UI that people open at night; leave them out for print and social images.
4. Load Google Fonts: `Noto Serif TC` (500/700/900), `Cormorant Garamond` (500/600/500 italic), `Noto Sans TC` (300/400/500/700).
5. Reuse the recipes in `components.html` (page shell, hero with one highlight, section head, buttons, badge, cards, form, table, moji notice, ink footer) before inventing controls.
6. Pick the logo from `assets/logo/` and moji from `assets/moji/`. Use `*-reverse` files on ink. Never assemble, redraw or recolour them.
7. Open `preview/` pages for a visual check.

## Design Highlights

- Visual style: quiet editorial. Warm paper, warm ink, hairlines, large empty regions, numbered sections with `中文 · English` titles.
- Colour stance: ink `#1B1A17` and paper `#FBFAF6` do all the work. Yellow `#FFDE34` appears once per view, as a ground with ink on top. Actions are ink, not yellow.
- Type: Noto Serif TC for display, Cormorant Garamond for Latin and numerals, Noto Sans TC for body at 16px / 1.9.
- Character: moji, a line-drawn elephant made of two speech-bubble ears, a comma trunk and one yellow eye.

## Do

- Keep every schema token name intact; brand values are added only through `--emoji-*`.
- Count the yellow before finishing: headline underline, badge, moji's eye and `::selection` all count; the total per view is one (selection excepted).
- Write names exactly: `言文字｜台灣人才聚落`, `emoji — Taiwan Talent Hub`, `言文字｜台湾タレントハブ`, `在咖啡（at cafe）`, `三點水（3AM）`, `等等空間（Stay Square）`, `約書旅（Rest Book）`, `moji`.
- Keep running text at 16px or larger and keep one empty region on every view, phones included.
- Write in Taiwan Traditional Chinese, short sentences, no exclamation marks.

## Avoid

- No yellow buttons, yellow sections, yellow text, gradients, glows, glass or 3D.
- No new colours. No pure black or pure white pages.
- No retired names ("Emoji Cafe & Bar", "Member Plaza", "Talent Lounge"); never call 三點水 a bar, 酒吧 or izakaya.
- Never write the romanised pronunciation of 言文字; the English name is `emoji`.
- Never stretch, recolour, rotate, outline or decorate the logo; never give moji tusks, a white body, blush, shading or ethnic ornament.
- No Simplified Chinese characters or mainland terms.
