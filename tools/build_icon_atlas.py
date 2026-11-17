#!/usr/bin/env python3
"""Build tex/icons_atlas.webp (1024, 4x256 cells, pad 12) to match neonsigns.js layout."""
from pathlib import Path
from PIL import Image
KEYS = ['strike', 'ghost', 'cyber', 'orc', 'pip', 'berserker', 'monkey', 'nova', 'blaster', 'bb', 'rockfall', 'skytower', 'roadster', 'claw']
C, PAD = 256, 12
inner = C - 2 * PAD
ROOT = Path(__file__).resolve().parents[1]
atlas = Image.new('RGBA', (C * 4, C * 4), (0, 0, 0, 0))
for k in KEYS:
    if k == 'claw':
        continue
    fp = ROOT / 'tex' / 'icons' / f'{k}.webp'
    if not fp.exists():
        print('missing', fp)
        continue
    im = Image.open(fp).convert('RGBA')
    i = KEYS.index(k)
    x, y = (i % 4) * C, (i // 4) * C
    r = im.width / im.height if im.height else 1
    dw = inner / r if r >= 1 else inner
    dh = inner if r >= 1 else inner * r
    im2 = im.resize((max(1, round(dw)), max(1, round(dh))), Image.Resampling.LANCZOS)
    px = x + PAD + (inner - im2.width) // 2
    py = y + PAD + (inner - im2.height) // 2
    atlas.paste(im2, (px, py), im2)
out = ROOT / 'tex' / 'icons_atlas.webp'
atlas.save(out, 'WEBP', quality=90, method=6)
print('wrote', out, out.stat().st_size, atlas.size)
