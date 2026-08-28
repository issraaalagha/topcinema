#!/usr/bin/env python3
"""Crop the FreeWatch logo professionally and generate the full icon set."""
import os
from PIL import Image, ImageDraw, ImageOps

SRC = r"C:\Users\pdpsa\.zcode\cli\image-cache\sess_26aca783-f99c-48e5-b8f1-8e6fe6ecbcc9\image-a28b95da2eda61dbde9c2b80ef353874.png"
OUT = r"D:\host\htdocs\topcinemaa\apps\web\public"

img = Image.open(SRC).convert("RGB")
W, H = img.size
print(f"source: {W}x{H}")

# ── 1. Locate the white rounded card (pixels differ from gray backdrop) ──
bg = img.getpixel((2, 2))
px = img.load()
min_x, min_y, max_x, max_y = W, H, 0, 0
for y in range(0, H, 2):
    for x in range(0, W, 2):
        r, g, b = px[x, y]
        if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 30:
            if x < min_x: min_x = x
            if y < min_y: min_y = y
            if x > max_x: max_x = x
            if y > max_y: max_y = y
print(f"card bbox: ({min_x},{min_y}) -> ({max_x},{max_y})")

card = img.crop((min_x, min_y, max_x + 1, max_y + 1))

# ── 2. Eye-only mark: dark strokes bbox in the upper 70% of the card ──
cw, ch = card.size
cpx = card.load()
ex0, ey0, ex1, ey1 = cw, ch, 0, 0
for y in range(0, int(ch * 0.72)):
    for x in range(cw):
        r, g, b = cpx[x, y]
        if (0.299 * r + 0.587 * g + 0.114 * b) < 130:  # dark stroke
            if x < ex0: ex0 = x
            if y < ey0: ey0 = y
            if x > ex1: ex1 = x
            if y > ey1: ey1 = y
print(f"eye bbox: ({ex0},{ey0}) -> ({ex1},{ey1})")

# square crop around eye, padded, inside the white card
eye_w, eye_h = ex1 - ex0, ey1 - ey0
side = int(max(eye_w, eye_h) * 1.45)
cx = (ex0 + ex1) // 2
cy = (ey0 + ey1) // 2
sx = max(0, min(cw - side, cx - side // 2))
sy = max(0, min(ch - side, cy - side // 2))
mark = card.crop((sx, sy, min(cw, sx + side), min(ch, sy + side)))

def rounded(im, radius_ratio=0.22):
    size = im.size[0]
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size, size], radius=int(size * radius_ratio), fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out

def save_png(im, name, size=None):
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(OUT, "icons", name), "PNG")
    print("saved", name, im.size)

# ── 3. Emit the icon set ──
os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)

# Header mark (eye tile, rounded)
save_png(rounded(mark), "logo-mark.png", 256)
save_png(rounded(mark), "logo-mark-64.png", 64)

# Full brand card (eye + freewatch.uk)
full_round = rounded(card.resize((512, 512), Image.LANCZOS), 0.18)
save_png(full_round, "logo-full.png", 512)

# PWA icons (full brand)
save_png(full_round.copy(), "icon-512.png", 512)
save_png(full_round.copy(), "icon-192.png", 192)

# Maskable: brand card at 78% on brand-dark background
mk = Image.new("RGB", (512, 512), (11, 13, 18))
inner = full_round.copy().resize((400, 400), Image.LANCZOS)
mk.paste(inner, (56, 56), inner)
mk.save(os.path.join(OUT, "icons", "icon-maskable-512.png"), "PNG")
print("saved icon-maskable-512.png")

# Apple touch (no transparency per Apple, solid card on dark)
at = Image.new("RGB", (180, 180), (11, 13, 18))
inner180 = card.resize((160, 160), Image.LANCZOS)
at.paste(inner180, (10, 10))
at.save(os.path.join(OUT, "icons", "apple-touch-icon.png"), "PNG")
print("saved apple-touch-icon.png")

# Favicon: eye mark multi-size .ico
fav_src = rounded(mark, 0.28)
fav_src.save(
    os.path.join(OUT, "favicon.ico"),
    sizes=[(16, 16), (32, 32), (48, 48)],
)
print("saved favicon.ico")
print("DONE")
