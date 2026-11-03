#!/usr/bin/env python3
"""約書旅 Rest Book 暫用文字標誌（2026-11-04）。正式 CIS 標誌完成後替換同名檔即可。
輸出 public/brand-sites/assets/rest-book-{logo,logo-h,logo-white,avatar}.webp
用法：/workspace/local/.qrvenv/bin/python tools/build-rest-book-logo.py <NotoSerifTC.ttf>"""
import sys, pathlib
from PIL import Image, ImageDraw, ImageFont

FONT = sys.argv[1]
OUT = pathlib.Path(__file__).resolve().parent.parent / 'public/brand-sites/assets'
BRAND = (90, 70, 50, 255)   # #5A4632 墨褐
LAT = '/workspace/local/10_品牌與對外溝通/字型/fonts_dl/NotoSerifTC%5Bwght%5D.ttf'


def font(size, wght):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([wght])
    except Exception:
        pass
    return f


def book(d, x, y, s, col):
    """翻開的書：兩頁弧線＋書脊"""
    w = s
    d.line([(x, y + s * .18), (x + w * .5, y + s * .3), (x + w, y + s * .18)], fill=col, width=max(3, int(s * .06)), joint='curve')
    d.line([(x, y + s * .62), (x + w * .5, y + s * .74), (x + w, y + s * .62)], fill=col, width=max(3, int(s * .06)), joint='curve')
    d.line([(x, y + s * .18), (x, y + s * .62)], fill=col, width=max(3, int(s * .06)))
    d.line([(x + w, y + s * .18), (x + w, y + s * .62)], fill=col, width=max(3, int(s * .06)))
    d.line([(x + w * .5, y + s * .3), (x + w * .5, y + s * .74)], fill=col, width=max(3, int(s * .06)))


def stacked(col, path):
    W, H = 900, 640
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    book(d, W / 2 - 70, 30, 140, col)
    zh = font(200, 700); en = font(76, 500)
    d.text((W / 2, 340), '約書旅', font=zh, fill=col, anchor='mm')
    d.text((W / 2, 545), 'Rest Book', font=en, fill=col, anchor='mm')
    im.crop(im.getbbox()).save(path, 'WEBP', quality=92); print('wrote', path)


def horizontal(col, path):
    # 頁首用：書本＋「約書旅／Rest Book」兩行，比例約 3:1（與其他子品牌橫式標誌相近，320px 不撐破頁首）
    W, H = 760, 280
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    book(d, 10, 50, 170, col)
    d.text((215, 105), '約書旅', font=font(150, 700), fill=col, anchor='lm')
    d.text((222, 225), 'Rest Book', font=font(64, 500), fill=col, anchor='lm')
    im.crop(im.getbbox()).save(path, 'WEBP', quality=92); print('wrote', path)


def avatar(path):
    S = 900
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse([0, 0, S - 1, S - 1], fill=BRAND)
    white = (255, 255, 255, 255)
    book(d, S / 2 - 110, 150, 220, white)
    d.text((S / 2, 560), '約書旅', font=font(190, 700), fill=white, anchor='mm')
    im.save(path, 'WEBP', quality=92); print('wrote', path)


stacked(BRAND, OUT / 'rest-book-logo.webp')
stacked((255, 255, 255, 255), OUT / 'rest-book-logo-white.webp')
horizontal(BRAND, OUT / 'rest-book-logo-h.webp')
avatar(OUT / 'rest-book-avatar.webp')
