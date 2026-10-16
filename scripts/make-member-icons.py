#!/usr/bin/env python3
"""會員 PWA 圖示：言字標置中、紙底、無角標。uv run --with pillow python3 scripts/make-member-icons.py"""
from pathlib import Path
from PIL import Image
PUB = Path(__file__).resolve().parent.parent / 'public'
PAPER = (251, 250, 246)
logo = Image.open(PUB / 'logo.png').convert('RGBA')
def make(size, scale):
    c = Image.new('RGBA', (size, size), PAPER + (255,))
    s = round(size * scale)
    i = logo.resize((s, s), Image.LANCZOS)
    c.alpha_composite(i, ((size - s) // 2, (size - s) // 2))
    return c.convert('RGB')
make(512, .78).save(PUB / 'm-icon-512.png', optimize=True)
make(192, .78).save(PUB / 'm-icon-192.png', optimize=True)
make(180, .78).save(PUB / 'm-icon-180.png', optimize=True)
make(512, .56).save(PUB / 'm-icon-maskable-512.png', optimize=True)
