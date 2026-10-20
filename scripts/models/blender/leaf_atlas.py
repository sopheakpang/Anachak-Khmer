# PK 2026-10-20 (D159): the tree maker's atlas, leafier ("blender the leaf to look like this
# level": a stylised forest of small leaves in round, soft-shaded clumps).
#   python3 scripts/models/blender/leaf_atlas.py <out.png>
# 2048 x 1024: bark in the left quarter (it wraps round the trunk, repeats up it); the other
# three quarters are 3 x 2 leaf sprays, 512 px each. Top row: sunlit sprays (outside and top of a
# crown). Bottom row: the same in shade (inside and underneath). Each spray is a ragged round clump
# of small serrated leaves on twigs, lighter toward its top, darker at its heart.
import math
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

random.seed(17)
np.random.seed(17)
H = 1024
S = 512  # one spray


def noise(w, h, sx, sy, octaves=5):
    out = np.zeros((h, w))
    for o in range(octaves):
        f = 2**o
        n = np.random.rand(int(sy * f) + 2, int(sx * f) + 2)
        im = Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += np.asarray(im) / 255.0 / (f**0.8)
    out -= out.min()
    return out / out.max()


# --- bark: warm grey-brown, vertical fissures, a little moss low down ------------------------
BW = 512
n1 = noise(BW, H, 24, 6)
n2 = noise(BW, H, 4, 24, 4)
base = np.array([128, 112, 92]) / 255.0
dark = np.array([70, 58, 46]) / 255.0
mix = np.clip(n1**1.4 * 0.9 + n2 * 0.25, 0, 1)[..., None]
bark = base * (1 - mix * 0.6) + dark * (mix * 0.6)
fiss = (noise(BW, H, 40, 5, 3) > 0.72).astype(float)
fiss = np.asarray(Image.fromarray((fiss * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))) / 255.0
bark = bark * (1 - 0.4 * fiss[..., None])
rows = np.linspace(0, 1, H)[:, None]
moss = np.clip((noise(BW, H, 8, 8) - 0.55) * 3, 0, 1) * np.clip(rows * 1.4 - 0.3, 0, 1)
bark = bark * (1 - moss[..., None] * 0.6) + np.array([0.36, 0.46, 0.22]) * moss[..., None] * 0.6
bark_img = Image.fromarray((np.clip(bark, 0, 1) * 255).astype(np.uint8)).convert('RGBA')


# --- leaf sprays -------------------------------------------------------------------------------
def leaf_poly(cx, cy, L, ang, serr=True):
    """A pointed oval leaf with a few teeth along each edge."""
    w = L * 0.36
    up, down = [], []
    for i, t in enumerate(np.linspace(0, 1, 13)):
        y = math.sin(math.pi * t) ** 0.85 * w * (1 - 0.3 * t)
        if serr and 0 < i < 12 and i % 2:
            y *= 1.18
        up.append((t * L, y))
        down.append((t * L, -y))
    pts = up + list(reversed(down))
    ca, sa = math.cos(ang), math.sin(ang)
    return [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts]


def shade(c, k):
    return tuple(int(max(0, min(255, v * k))) for v in c)


def spray(seed, lit):
    """One clump: twigs from the foot, leaves on them, a ragged round outline."""
    rnd = random.Random(seed)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # the outline: a few overlapping lobes, so no two clumps are the same round ball
    lobes = [(S / 2, S * 0.52, S * 0.3)]
    for _ in range(rnd.randint(4, 6)):
        a = rnd.uniform(-math.pi, 0.2) if rnd.random() < 0.7 else rnd.uniform(0, math.pi)
        r = rnd.uniform(0.13, 0.2) * S
        dist = rnd.uniform(0.12, 0.2) * S
        lobes.append((S / 2 + math.cos(a) * dist, S * 0.52 + math.sin(a) * dist, r))

    def inside(x, y):
        return max(1 - math.hypot(x - lx, y - ly) / lr for lx, ly, lr in lobes)

    # twigs
    foot = (S / 2 + rnd.uniform(-20, 20), S * 0.97)
    for _ in range(9):
        lx, ly, lr = rnd.choice(lobes)
        tx, ty = lx + rnd.uniform(-0.5, 0.5) * lr, ly + rnd.uniform(-0.5, 0.5) * lr
        d.line([foot, ((foot[0] + tx) / 2 + rnd.uniform(-25, 25), (foot[1] + ty) / 2), (tx, ty)], fill=(78, 62, 44, 255), width=4)
    # leaves: back to front, darker at the heart and the foot, sunlit toward the top
    pal = [(96, 150, 52), (118, 170, 60), (78, 132, 46), (140, 184, 74), (66, 118, 42)]
    leaves = []
    while len(leaves) < 520:
        x, y = rnd.uniform(0, S), rnd.uniform(0, S)
        k = inside(x, y)
        if k <= 0:
            continue
        leaves.append((x, y, k))
    leaves.sort(key=lambda p: p[2])  # the heart first: the outer leaves lie over it
    for x, y, k in leaves:
        L = rnd.uniform(34, 52)
        # leaves point away from the clump's heart (outward and a little up), as on a twig
        a = math.atan2(y - S * 0.55, x - S / 2) + rnd.uniform(-0.7, 0.7)
        top = 1 - y / S  # 0 foot .. 1 top
        light = 0.62 + 0.38 * top + 0.25 * (1 - k)  # outer edge catches the light
        light *= rnd.uniform(0.88, 1.1)
        if not lit:
            light *= 0.74
        c = shade(rnd.choice(pal), light)
        poly = leaf_poly(x - math.cos(a) * L * 0.3, y - math.sin(a) * L * 0.3, L, a)
        d.polygon(poly, fill=c + (255,))
        # a paler sunlit half and the midrib
        tip = (x + math.cos(a) * L * 0.6, y + math.sin(a) * L * 0.6)
        d.line([(x - math.cos(a) * L * 0.25, y - math.sin(a) * L * 0.25), tip], fill=shade(c, 0.78) + (255,), width=2)
        if lit and top > 0.35:
            hl = leaf_poly(x - math.cos(a) * L * 0.2, y - math.sin(a) * L * 0.2, L * 0.6, a, serr=False)
            d.polygon(hl[: len(hl) // 2 + 1], fill=shade(c, 1.12) + (255,))
    # a soft dark heart (ambient occlusion) only where there are leaves
    arr = np.asarray(im).astype(float)
    yy, xx = np.mgrid[0:S, 0:S]
    occ = np.clip(1 - np.hypot(xx - S / 2, (yy - S * 0.6) * 1.2) / (S * 0.42), 0, 1) ** 1.5
    arr[..., :3] *= (1 - 0.32 * occ)[..., None]
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8))


atlas = Image.new('RGBA', (2048, H), (0, 0, 0, 0))
atlas.paste(bark_img, (0, 0))
for row in range(2):
    for col in range(3):
        atlas.paste(spray(100 + col, row == 0), (BW + col * S, row * S))
out = sys.argv[1] if len(sys.argv) > 1 else 'bigtree_atlas2.png'
atlas.save(out)
print('atlas', out)
