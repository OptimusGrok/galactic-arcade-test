#!/usr/bin/env python3
"""Convert arcade picture assets (tex/*) to KTX2/UASTC. Cabinet sides are capped at 512 (no mips).
Requires toktx (KTX-Software) on PATH, or TOKTX / TOKTX_LIB env vars. WebP is rasterized to PNG first.
"""
import json, os, subprocess, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOKTX = os.environ.get('TOKTX', 'toktx')
env = os.environ.copy()
if os.environ.get('TOKTX_LIB'):
    env['LD_LIBRARY_PATH'] = os.environ['TOKTX_LIB'] + ':' + env.get('LD_LIBRARY_PATH', '')
tmp = Path('/tmp/ktx-in'); tmp.mkdir(exist_ok=True)

SIDES = {p.name for p in (ROOT/'tex').glob('*_side.*')}
# 3D picture assets only (not CSS thumbs in img/, not unused mockups)
SKIP = {'rf_cabinet_mockup.jpg', 'spq_cabinet_mockup.jpg'}
MIPS = {'carpet.webp', 'viking_walls.jpg', 'space_nebula.webp'}

def fit(w, h, maxe):
    if max(w, h) <= maxe:
        return w, h
    if w >= h:
        nw, nh = maxe, max(1, round(h * maxe / w))
    else:
        nh, nw = maxe, max(1, round(w * maxe / h))
    return max(4, (nw + 3) // 4 * 4), max(4, (nh + 3) // 4 * 4)

manifest = {}
ok = fail = 0
out_dir = ROOT / 'tex' / 'ktx2'; out_dir.mkdir(parents=True, exist_ok=True)
srcs = sorted([p for p in list((ROOT/'tex').glob('*.jpg')) + list((ROOT/'tex').glob('*.webp')) if p.name not in SKIP and not p.name.endswith('_cabinet_mockup.jpg')])
# include icons atlas
atlas = ROOT/'tex'/'icons_atlas.webp'
if atlas.exists() and atlas not in srcs:
    srcs.append(atlas)
for src in srcs:
    rel = src.relative_to(ROOT).as_posix()
    im = Image.open(src)
    if im.mode not in ('RGB', 'RGBA', 'L'):
        im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
    is_side = src.name in SIDES or src.name.endswith('_side.jpg') or src.name.endswith('_side.webp')
    if is_side:
        w, h = fit(*im.size, 512)
        if (w, h) != im.size:
            im = im.resize((w, h), Image.Resampling.LANCZOS)
    # UASTC requires multiples of 4; pad (don't stretch) so art stays sharp
    nw, nh = (im.width + 3) // 4 * 4, (im.height + 3) // 4 * 4
    if (nw, nh) != im.size:
        canvas = Image.new(im.mode, (nw, nh), (0, 0, 0, 0) if im.mode == 'RGBA' else (0, 0, 0))
        canvas.paste(im, (0, 0))
        im = canvas
    png = tmp / (src.stem + '.png')
    im.save(png, 'PNG')
    out = out_dir / (src.stem + '.ktx2')
    cmd = [TOKTX, '--t2', '--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '1',
           '--zcmp', '18', '--assign_oetf', 'srgb', '--nowarn']
    if src.name in MIPS:
        cmd.append('--genmipmap')
    cmd += [str(out), str(png)]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode:
        print('FAIL', rel, r.stderr[-400:] or r.stdout[-400:]); fail += 1; continue
    manifest[rel] = out.relative_to(ROOT).as_posix()
    ok += 1
    print(f'  {rel} -> {out.relative_to(ROOT)}  {src.stat().st_size} -> {out.stat().st_size}')

js = 'export const KTX2 = {\n' + ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v)}' for k, v in sorted(manifest.items())) + '\n};\n'
(ROOT/'tex_ktx2.js').write_text(js)
(out_dir/'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('OK', ok, 'FAIL', fail)
sys.exit(1 if fail else 0)
