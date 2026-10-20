# PK 2026-10-20 (D162): four wild animals stood in with a near cousin's model (D153). Their
# Meshy texture recoloured so each reads as itself; the mesh, rig and walk clip are untouched.
#   banteng  ← kouprey: chestnut coat, the white stockings and rump kept white
#   serow    ← muntjac: dark charcoal-grey coat, pale parts greyed
#   moonBear ← bear (the sun bear): the tan chest patch turned cream-white (the "moon")
#   cloudedLeopard ← leopard: greyer, cooler ground, darker blotches
#   python3 scripts/models/recolor_animals.py <in.png> <out.png> <kind>
import sys
import numpy as np
from PIL import Image

src, dst, kind = sys.argv[1:4]
im = Image.open(src).convert('RGBA')
a = np.asarray(im).astype(np.float32) / 255.0
rgb, alpha = a[..., :3], a[..., 3:]
lum = (rgb @ np.array([0.299, 0.587, 0.114]))[..., None]
mx, mn = rgb.max(-1, keepdims=True), rgb.min(-1, keepdims=True)
sat = (mx - mn) / np.maximum(mx, 1e-4)


def ramp(t, stops):
    """Colour along stops [(t, (r, g, b))] by t (0..1)."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape[:-1] + (3,), np.float32)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        k = np.clip((t - t0) / max(t1 - t0, 1e-4), 0, 1)
        inside = (t >= t0) & (t <= t1)
        col = np.array(c0) * (1 - k) + np.array(c1) * k
        out = np.where(inside, col, out)
    return out


if kind == 'banteng':
    out = ramp(lum / 0.7, [(0, (0.1, 0.045, 0.025)), (0.35, (0.27, 0.11, 0.05)), (0.7, (0.45, 0.2, 0.09)), (0.85, (0.72, 0.56, 0.42)), (1.0, (0.94, 0.92, 0.88))])
elif kind == 'serow':
    out = ramp(lum / 0.75, [(0, (0.06, 0.06, 0.06)), (0.4, (0.16, 0.15, 0.14)), (0.75, (0.3, 0.28, 0.26)), (1.0, (0.62, 0.6, 0.56))])
elif kind == 'moonBear':
    # warm, light pixels (the chest patch, the muzzle) → cream; the black coat stays.
    warm = np.clip((rgb[..., :1] - rgb[..., 2:3]) * 3, 0, 1) * np.clip((lum - 0.18) * 4, 0, 1)
    out = rgb * (1 - warm) + np.array((0.92, 0.9, 0.84)) * warm
elif kind == 'cloudedLeopard':
    grey = lum * np.array((1.05, 0.98, 0.85))
    out = rgb * 0.35 + grey * 0.65
    out = np.where(lum < 0.22, out * 0.55, out)  # darker blotches
else:
    raise SystemExit('unknown kind ' + kind)
res = np.concatenate([np.clip(out, 0, 1), alpha], -1)
Image.fromarray((res * 255).astype(np.uint8), 'RGBA').save(dst)
print('recoloured', kind, dst)
