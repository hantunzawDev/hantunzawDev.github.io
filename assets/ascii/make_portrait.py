import sys, json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont
from collections import deque

src, outdir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(float) / 255
H, W, _ = a.shape
lum = 0.2126*a[...,0] + 0.7152*a[...,1] + 0.0722*a[...,2]
mx, mn = a.max(2), a.min(2)
sat = (mx - mn) / (mx + 1e-6)

# background: low-saturation gray, flood-filled from the top/left/right borders
bglike = (sat < 0.16) & (lum > 0.17)
small = 4
bs = Image.fromarray((bglike*255).astype(np.uint8)).resize((W//small, H//small), Image.BILINEAR)
b = np.asarray(bs) > 127
h, w = b.shape
seen = np.zeros_like(b)
q = deque()
for x in range(w):
    if b[0, x]: q.append((0, x))
for y in range(h):
    for x in (0, w-1):
        if b[y, x]: q.append((y, x))
while q:
    y, x = q.popleft()
    if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not b[y, x]: continue
    seen[y, x] = True
    q.extend(((y+1, x), (y-1, x), (y, x+1), (y, x-1)))
bgm = Image.fromarray((seen*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(5))
bgm = np.asarray(bgm.resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3))) / 255
subject = 1 - bgm

# tone: lift shadows so hair/hoodie folds still read; keep face contrast
t = lum.copy()
# local contrast boost
blur = np.asarray(Image.fromarray((t*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(40))) / 255
t = np.clip(t + 1.8*(t - blur), 0, 1)
sv = t[subject > 0.5]
lo, hi = np.percentile(sv, 3), np.percentile(sv, 99.5)
t = np.clip((t - lo) / (hi - lo), 0, 1) ** 0.95
Image.fromarray((t*subject*255).astype(np.uint8)).save(f"{outdir}/tone.png")

RAMP = " .:-=+*#%@"
RAMP = " .'`^,:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"[::-1][::-1]
RAMP = " .,:;-~=+*o%#&@"

def render(cols, crop, aspect=0.5, edge_q=0.86):
    x0, y0, x1, y1 = crop
    cw = (x1 - x0) / cols
    rows = int(round((y1 - y0) / (cw / aspect)))
    S = 4  # supersample for edges
    G = Image.fromarray((lum*255).astype(np.uint8)).crop(crop).resize((cols*S, rows*S), Image.LANCZOS)
    g = np.asarray(G.filter(ImageFilter.GaussianBlur(1.2))).astype(float) / 255
    gx = np.zeros_like(g); gy = np.zeros_like(g)
    gx[:, 1:-1] = g[:, 2:] - g[:, :-2]
    gy[1:-1, :] = g[2:, :] - g[:-2, :]
    mag = np.hypot(gx, gy)
    T = Image.fromarray((t*255).astype(np.uint8)).crop(crop).resize((cols, rows), Image.LANCZOS)
    M = Image.fromarray((subject*255).astype(np.uint8)).crop(crop).resize((cols, rows), Image.BILINEAR)
    T = np.asarray(T) / 255; M = np.asarray(M) / 255
    # per-cell edge strength + dominant direction
    mc = mag.reshape(rows, S, cols, S).mean((1, 3))
    gxc = (gx * mag).reshape(rows, S, cols, S).sum((1, 3))
    gyc = (gy * mag).reshape(rows, S, cols, S).sum((1, 3))
    inside = M > 0.5
    thr = np.quantile(mc[inside], edge_q) if inside.any() else 1
    lines = []
    for r in range(rows):
        s = ""
        for c in range(cols):
            if not inside[r, c]: s += " "; continue
            if mc[r, c] > thr:
                ang = (np.degrees(np.arctan2(gyc[r, c], gxc[r, c])) + 180) % 180  # gradient dir
                # edge runs perpendicular to the gradient
                if ang < 22.5 or ang >= 157.5: ch = "|"
                elif ang < 67.5: ch = "\\"
                elif ang < 112.5: ch = "_" if T[r, c] < 0.5 else "-"
                else: ch = "/"
                s += ch; continue
            v = T[r, c]
            if v < 0.07: s += " "; continue
            i = int(v * (len(RAMP) - 1) + 0.5)
            s += RAMP[max(1, i)]
        lines.append(s.rstrip())
    while lines and not lines[-1]: lines.pop()
    return lines

def preview(lines, path):
    try: f = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 14)
    except Exception: f = ImageFont.load_default()
    cw, ch = 8.4, 16.8
    width = int(max(len(l) for l in lines) * cw) + 20
    img = Image.new("RGB", (width, int(len(lines)*ch) + 20), (10, 12, 8))
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lines): d.text((10, 10 + i*ch), l, font=f, fill=(198, 244, 50))
    img.save(path)
    img.resize((img.width//2, img.height//2), Image.LANCZOS).save(path.replace('.png','-half.png'))

crop = (230, 60, 930, 1060)   # head and shoulders
out = {}
for name, cols in (("lg", 96), ("md", 72), ("sm", 48)):
    L = render(cols, crop)
    out[name] = "\n".join(L)
    preview(L, f"{outdir}/preview-{name}.png")
    print(name, cols, "x", len(L))
json.dump(out, open(f"{outdir}/portrait.json", "w"))
