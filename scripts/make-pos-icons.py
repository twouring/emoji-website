#!/usr/bin/env python3
"""產生 POS PWA 圖示：以 public/logo.png（言字標）為底，右下角加「POS」角標。
用法：uv run --with pillow python3 scripts/make-pos-icons.py
輸出：public/pos-icon-180.png（iOS）、pos-icon-192.png、pos-icon-512.png、pos-icon-maskable-512.png
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
INK, ACCENT, PAPER = (27, 26, 23), (255, 222, 52), (251, 250, 246)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def base(size=512):
    logo = Image.open(PUB / 'logo.png').convert('RGBA')
    canvas = Image.new('RGBA', (size, size), PAPER + (255,))
    # 言字縮小並往左上靠，右下留給角標（不互相遮蓋）
    inner = logo.resize((round(size * 0.82), round(size * 0.82)), Image.LANCZOS)
    off = round(size * 0.04)
    canvas.alpha_composite(inner, (off, off))
    d = ImageDraw.Draw(canvas)
    pad = round(size * 0.06)
    w, h = round(size * 0.36), round(size * 0.17)
    x1, y1 = size - pad, size - pad
    x0, y0 = x1 - w, y1 - h
    d.rounded_rectangle((x0, y0, x1, y1), radius=round(h * 0.3), fill=INK + (255,))
    font = ImageFont.truetype(FONT, round(h * 0.62))
    tw = d.textlength('POS', font=font)
    d.text((x0 + (w - tw) / 2, y0 + h * 0.17), 'POS', font=font, fill=ACCENT + (255,))
    return canvas


def maskable(size=512):
    # Android maskable：安全區是中央直徑 80% 的圓。整張圖縮到 56% 置中，角標最遠角距中心約 0.35×size，圓內留有餘裕
    full = base(size)
    inner = full.resize((round(size * 0.56), round(size * 0.56)), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), PAPER + (255,))
    off = (size - inner.width) // 2
    canvas.alpha_composite(inner, (off, off))
    return canvas


def main():
    full = base(512)
    full.convert('RGB').save(PUB / 'pos-icon-512.png', optimize=True)
    full.resize((192, 192), Image.LANCZOS).convert('RGB').save(PUB / 'pos-icon-192.png', optimize=True)
    full.resize((180, 180), Image.LANCZOS).convert('RGB').save(PUB / 'pos-icon-180.png', optimize=True)
    maskable(512).convert('RGB').save(PUB / 'pos-icon-maskable-512.png', optimize=True)
    for name in ['pos-icon-512.png', 'pos-icon-192.png', 'pos-icon-180.png', 'pos-icon-maskable-512.png']:
        print(name, (PUB / name).stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
