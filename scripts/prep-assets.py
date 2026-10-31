"""Derive web assets from brand/ originals. Run once; outputs are committed under src/assets/.
Premultiplied-alpha resize is used because the transparent PNG stores pure black RGB in every
alpha=0 pixel (IHDR colortype 6, 3,070,322 of 4,000,000 pixels), which would halo on plain resize."""
import numpy as np
from PIL import Image
from scipy import ndimage
SRC = r'brand/LOGO SKYVE PNG...png'
im = Image.open(SRC).convert('RGBA')
a = np.array(im)
alpha = a[..., 3]
ys, xs = np.where(alpha > 200)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
side0 = max(x1 - x0, y1 - y0) + 12
cx0, cy0 = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx0 - side0 // 2, cy0 - side0 // 2, cx0 - side0 // 2 + side0, cy0 - side0 // 2 + side0)
crop = im.crop(box)

def premul_resize(img, size):
    f = np.array(img).astype(np.float64) / 255.0
    f[..., :3] *= f[..., 3:4]
    chans = [np.array(Image.fromarray(f[..., i].astype(np.float32), mode='F').resize((size, size), Image.LANCZOS)) for i in range(4)]
    o = np.stack(chans, -1)
    al = np.clip(o[..., 3:4], 0, 1)
    rgb = np.where(al > 1e-6, o[..., :3] / np.maximum(al, 1e-6), 0)
    out = np.concatenate([np.clip(rgb, 0, 1), al], -1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')

for name, s in [('logo-640.png', 640), ('logo-192.png', 192), ('apple-touch-icon.png', 180)]:
    premul_resize(crop, s).save('src/assets/' + name, optimize=True)

# favicon: trace circle and bars from the real pixel grid of the 2000px asset
rgb = a[..., :3].astype(int)
green = (alpha > 200) & (rgb[..., 1] > 140) & (rgb[..., 0] < 120)
lab, n = ndimage.label(green)
bars = []
for i, sl in enumerate(ndimage.find_objects(lab)):
    m = lab[sl] == i + 1
    if m.sum() > 500:
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        bars.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop, tuple(int(v) for v in rgb[int(cy), int(cx)])))
bars.sort()
side = max(x1 - x0, y1 - y0)
k = 32.0 / side
ox, oy = cx0 - side / 2, cy0 - side / 2
R = lambda v: round(v, 2)
parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
         '<circle cx="16" cy="16" r="16" fill="#%02x%02x%02x"/>' % tuple(rgb[515, 788])]
for (bx0, by0, bx1, by1, c) in bars:
    w = (bx1 - bx0) * k
    parts.append('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="#%02x%02x%02x"/>' % (R((bx0 - ox) * k), R((by0 - oy) * k), R(w), R((by1 - by0) * k), R(w / 2), *c))
parts.append('</svg>')
open('src/assets/favicon.svg', 'w').write('\n'.join(parts) + '\n')
print('bars', bars, 'box', box)

# palette provenance: snapped to real pixel coords
import glob, os
from sklearn.cluster import KMeans
def snap(path, k=8):
    I = np.array(Image.open(path).convert('RGBA')); H, W = I.shape[:2]
    flat = I.reshape(-1, 4); sel = np.where(flat[:, 3] > 128)[0]
    sub = sel[np.random.RandomState(1).choice(len(sel), min(150000, len(sel)), replace=False)]
    km = KMeans(k, n_init=3, random_state=1).fit(flat[sub, :3])
    cnt = np.bincount(km.labels_)
    for ci in np.argsort(-cnt):
        d = ((flat[sub, :3] - km.cluster_centers_[ci]) ** 2).sum(1); j = sub[d.argmin()]
        print('%s %5.1f%% #%02x%02x%02x @(%d,%d)' % (os.path.basename(path), 100 * cnt[ci] / len(sub), *flat[j, :3], j % W, j // W))
snap(SRC)
snap('reference/SKYVE 1.jpg.jpeg')
snap(r'brand/LOGO SKYVE PNG.png')
