import numpy as np, sys
from PIL import Image
# python3 card_atlas.py <renders dir with forest-x-card-*.png> <atlas png from leaf_atlas.py> <out dir>
S=sys.argv[1].rstrip('/')+'/'
OUT=sys.argv[3]
leaf=np.asarray(Image.open(sys.argv[2]).convert('RGBA')).astype(float)
lh=leaf[:, leaf.shape[1]//4:]
target=lh[...,:3][lh[...,3]>128].mean(axis=0)
def pad(a):
    rgb=a[...,:3].copy(); have=a[...,3]>8
    mean=rgb[have].mean(axis=0) if have.any() else np.zeros(3)
    for _ in range(8):
        acc=np.zeros_like(rgb); cnt=np.zeros(have.shape)
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                sh=np.roll(np.roll(rgb*have[...,None],dy,0),dx,1); sc=np.roll(np.roll(have,dy,0),dx,1)
                acc+=sh; cnt+=sc
        new=(~have)&(cnt>0)
        rgb[new]=acc[new]/cnt[new][:,None]; have=have|new
    rgb[~have]=mean
    return np.concatenate([rgb,a[...,3:4]],-1)
for t in 'abcdef':
    tiles=[]
    for row in (0,1):
        for k in ('0','1','2','top'):
            tiles.append(np.asarray(Image.open(f'{S}forest-{t}-card-{row}-{k}.png').convert('RGBA')).astype(float))
    # Flat-lit renders come out dark: bring the leaves up to the atlas's own colour.
    allop=np.concatenate([x[...,:3][x[...,3]>128] for x in tiles])
    gain=np.clip(target/np.maximum(allop.mean(axis=0),1),1,4)*0.92
    atlas=np.zeros((1024,2048,4))
    for i,x in enumerate(tiles):
        x=x.copy(); x[...,:3]=np.clip(x[...,:3]*gain,0,255); x=pad(x)
        oy=(i//4)*512; ox=(i%4)*512
        atlas[oy:oy+512,ox:ox+512]=x
    Image.fromarray(atlas.astype(np.uint8),'RGBA').save(f'{OUT}/{t}-cards.webp',quality=88,lossless=False,exact=True)
    print(t, gain.round(2))
