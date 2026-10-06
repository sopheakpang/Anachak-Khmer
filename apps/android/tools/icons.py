"""Draw the Android app icon and splash screens for Khmer Kingdoms (D72).

A Preah Ko-style brick prasat (stepped tiers and a lotus finial) in gold before a rising
sun, on deep laterite red. Run: python3 apps/android/tools/icons.py (needs Pillow).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RES = Path(__file__).resolve().parents[1] / 'android/app/src/main/res'
# The iPhone web app's icons (D73): Home Screen icon, manifest icons.
WEB = Path(__file__).resolve().parents[3] / 'apps/game/public-mobile/icons'
BG = (122, 34, 18)
BG2 = (70, 16, 8)
GOLD = (241, 205, 120)
GOLD_DARK = (190, 140, 60)
SUN = (255, 170, 60)


def tower(size: int, scale: float = 0.62) -> Image.Image:
    """The emblem on transparent ground, centred, filling `scale` of the square."""
    S = 1024
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = S / 2
    # Rising sun behind the tower.
    d.ellipse((cx - 300, 300, cx + 300, 900), fill=SUN + (255,))
    # Platform (two steps) and the tower's body.
    d.rectangle((cx - 360, 820, cx + 360, 880), fill=GOLD_DARK + (255,))
    d.rectangle((cx - 300, 760, cx + 300, 820), fill=GOLD + (255,))
    d.rectangle((cx - 170, 470, cx + 170, 760), fill=GOLD + (255,))
    d.rectangle((cx - 70, 560, cx + 70, 760), fill=BG2 + (255,))  # doorway
    d.polygon([(cx - 70, 560), (cx, 505), (cx + 70, 560)], fill=BG2 + (255,))
    # Tiers diminishing upward (Preah Ko's brick storeys), each with a cornice.
    y = 470
    w = 190
    for _ in range(4):
        d.rectangle((cx - w - 14, y - 18, cx + w + 14, y), fill=GOLD_DARK + (255,))
        h = 70
        d.rectangle((cx - w + 20, y - 18 - h, cx + w - 20, y - 18), fill=GOLD + (255,))
        y = y - 18 - h
        w = int(w * 0.74)
    # Lotus finial.
    d.polygon([(cx - 40, y), (cx, y - 110), (cx + 40, y)], fill=GOLD + (255,))
    d.ellipse((cx - 14, y - 140, cx + 14, y - 112), fill=GOLD + (255,))
    im = im.resize((int(size * scale), int(size * scale)), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return out


def background(w: int, h: int) -> Image.Image:
    im = Image.new('RGBA', (w, h), BG + (255,))
    glow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(glow).ellipse((w * 0.1, h * 0.05, w * 0.9, h * 0.95), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(min(w, h) / 6))
    dark = Image.new('RGBA', (w, h), BG2 + (255,))
    return Image.composite(im, dark, glow)


def web_icons() -> None:
    """Square, opaque icons: iOS rounds the corners itself; 'maskable' keeps the emblem in the safe zone."""
    WEB.mkdir(parents=True, exist_ok=True)
    for name, size, scale in [
        ('apple-touch-icon.png', 180, 0.8),
        ('icon-192.png', 192, 0.8),
        ('icon-512.png', 512, 0.8),
        ('icon-maskable-512.png', 512, 0.62),
    ]:
        big = background(size * 4, size * 4)
        big.alpha_composite(tower(size * 4, scale))
        big.resize((size, size), Image.LANCZOS).convert('RGB').save(WEB / name)


def main() -> None:
    web_icons()
    # Adaptive icon foreground (108 dp, emblem inside the 66 dp safe zone) and background.
    for folder, fg, legacy in [
        ('mdpi', 108, 48),
        ('hdpi', 162, 72),
        ('xhdpi', 216, 96),
        ('xxhdpi', 324, 144),
        ('xxxhdpi', 432, 192),
    ]:
        tower(fg, 0.56).save(RES / f'mipmap-{folder}/ic_launcher_foreground.png')
        full = background(legacy * 4, legacy * 4)
        full.alpha_composite(tower(legacy * 4, 0.8))
        full = full.resize((legacy, legacy), Image.LANCZOS)
        mask = Image.new('L', (legacy, legacy), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, legacy - 1, legacy - 1), radius=legacy // 5, fill=255)
        sq = Image.new('RGBA', (legacy, legacy), (0, 0, 0, 0))
        sq.paste(full, (0, 0), mask)
        sq.save(RES / f'mipmap-{folder}/ic_launcher.png')
        mask = Image.new('L', (legacy, legacy), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, legacy - 1, legacy - 1), fill=255)
        rd = Image.new('RGBA', (legacy, legacy), (0, 0, 0, 0))
        rd.paste(full, (0, 0), mask)
        rd.save(RES / f'mipmap-{folder}/ic_launcher_round.png')
    (RES / 'values/ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">#{BG[0]:02X}{BG[1]:02X}{BG[2]:02X}</color>\n</resources>\n'
    )
    # Splash screens: the emblem and the developer's credit (config/credits.json).
    font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
    for f in sorted(RES.glob('drawable*/splash.png')):
        w, h = Image.open(f).size
        im = background(w, h)
        s = int(min(w, h) * 0.6)
        em = tower(s, 0.95)
        im.alpha_composite(em, ((w - s) // 2, int(h * 0.42 - s / 2)))
        try:
            font = ImageFont.truetype(font_path, max(12, int(min(w, h) * 0.05)))
            d = ImageDraw.Draw(im)
            text = 'Khmer Kingdoms'
            tw = d.textlength(text, font=font)
            d.text(((w - tw) / 2, h * 0.76), text, font=font, fill=GOLD + (255,))
            small = ImageFont.truetype(font_path, max(10, int(min(w, h) * 0.032)))
            text = 'Developed by Mr. Sopheak Pang'
            tw = d.textlength(text, font=small)
            d.text(((w - tw) / 2, h * 0.86), text, font=small, fill=(255, 240, 210, 255))
        except OSError:
            pass
        im.convert('RGB').save(f)


if __name__ == '__main__':
    main()
