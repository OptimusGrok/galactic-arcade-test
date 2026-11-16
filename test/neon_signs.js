// t773u / t850u: neon name signs + icons; claw icon is two-sided and animates; Orc Attack has a detailed orc. node test/neon_signs.js
// ceiling band / other signs, facing into the room; it is compiled by the warm-up (no new program at entry). node test/neon_signs.js
const { open } = require('./lib');
let ok = true; const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 400) : '')); if (!c) ok = false; };
(async () => {
  const o = await open({ w: 640, h: 360 }), page = o.page, { errors } = o;
  await page.waitForFunction(() => window.__arcade && window.__neonSigns && window.__arcade.stats.frames > 3 && window.__neonSigns.material.map.image && window.__neonSigns.material.map.image.width, null, { timeout: 120000 });
  const r = await page.evaluate(() => { const A = window.__arcade, S = window.__neonSigns, out = { left: [] };
    for (const m of ['medieval', 'current', 'viking', 'portals']) { A.setWalls(m); [A.room, A.room2, A.hall].forEach(R => R.traverse(o => { if (/^ledge|gothic|wallBand(Pink|Amber)/.test(o.name)) out.left.push(m + ':' + o.name); })); }
    A.setWalls('medieval');
    out.signs = S.userData.signs; out.icons = (S.userData.icons || (window.__neonIcons && window.__neonIcons.userData.icons) || []); out.iconMesh = 0; out.meshes = 0; window.__arcade.room.parent.traverse(o => { if (o.name === 'neonSigns') out.meshes++; if (o.name === 'neonIcons') out.iconMesh++; });
    out.map = !!S.material.map && S.material.map.image.width; out.src = S.material.map.image.src || ''; out.k = S.userData.k; out.transparent = S.material.transparent; out.depthWrite = S.material.depthWrite;
    out.featured = Object.keys(A.featured || {}).length; return out; });
  chk(r.left.length === 0, 'no wall shelf / ledge bands / stained-glass windows in any walls mode (both rooms + hallway)', r.left);
  const S = r.signs, keys = S.map(s => s.key);
  const want = ['strike', 'berserker', 'monkey', 'ghost', 'orc', 'nova', 'cyber', 'blaster', 'pip', 'bb', 'rockfall', 'skytower', 'roadster', 'claw'];
  chk(want.every(k => keys.includes(k)) && S.length === want.length && r.meshes === 1, 'one neon sign per machine (' + S.length + '; DEAD SIGNAL keeps its own station sign), all in ONE mesh', keys);
  const T = Object.fromEntries(S.map(s => [s.key, s.title]));
  chk(T.strike === 'STRIKE' && T.ghost === 'GHOST 256' && T.cyber === 'CYBERCITY' && T.rockfall === 'ROCKFALL RUSH' && T.skytower === 'SKY TOWER' && T.monkey === 'MONKEY CROSSING', 'real game titles', T);
  chk(new Set(S.map(s => s.color)).size >= 12, 'a colour per game', S.map(s => s.color));
  const wall = S.filter(s => s.key !== 'claw');
  chk(wall.every(s => Math.max(Math.abs(s.pos[0]), Math.abs(s.pos[2])) > 11.9 && Math.max(Math.abs(s.pos[0]), Math.abs(s.pos[2])) < 12), 'wall signs sit flat on the wall', wall.map(s => s.pos));
  chk(wall.every(s => { const n = s.normal, p = s.pos; return (Math.abs(p[0]) > 11.9 ? -Math.sign(p[0]) === n[0] : -Math.sign(p[2]) === n[2]); }), 'each faces out from its wall into the room');
  chk(S.every(s => s.pos[1] - s.h / 2 > s.cabTop + 0.05) && S.every(s => s.top < 6.0), 'above its machine, below the cyan band (6.2) and ceiling', S.map(s => [s.key, s.cabTop, s.top]));
  chk(S.every(s => s.h >= 0.3 && s.w <= 3.7) && S.filter(s => s.key !== 'claw').reduce((a, s) => a + s.w * s.h, 0) / (S.length - 1) > 1.25 * 1.55, 't775u: ~25%+ bigger than v188 (mean area), readable, narrower than the 4 m slot', S.map(s => [s.key, s.w, s.h]));
  let overlap = []; for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) { const a = S[i], b = S[j];
    if (Math.abs(a.pos[1] - b.pos[1]) < (a.h + b.h) / 2 && a.normal.join() === b.normal.join() && Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]) < (a.w + b.w) / 2) overlap.push([a.key, b.key]); }
  chk(overlap.length === 0, 'no two signs overlap', overlap);
  chk(r.transparent && !r.depthWrite && r.map === 1024 && /tex\/neon_signs\.webp/.test(r.src), 'styled atlas texture (tex/neon_signs.webp), transparent, no depth write', { map: r.map, src: r.src });
  chk(r.k <= 0.65, 't782u: dimmer than t775u (colour x' + r.k + ', was 0.85 / v188 1.3)');
  const I = r.icons || [];
  chk(r.iconMesh === 1 && I.length === S.length && want.every(k => I.some(i => i.key === k)), 'v216: one neon icon per machine, all in ONE extra mesh', { n: I.length, keys: I.map(i => i.key), meshes: r.iconMesh });
  chk(I.every(i => i.top < 6.2 && i.top >= 5.95 && i.h >= 0.9 && i.w >= 0.28), 'v223: each icon is much bigger and nearly reaches the ceiling (small gap under the cyan band at 6.2)', I.map(i => [i.key, i.top, i.h, i.w]));
  chk(I.every(i => { const s = S.find(s => s.key === i.key); return s && Math.abs(i.pos[0] - s.pos[0]) < 0.03 && Math.abs(i.pos[2] - s.pos[2]) < 0.03 && i.bottom >= s.top - 0.02 && i.bottom <= s.top + 0.22; }), 'v223: each icon is centred just above its name sign', I.map(i => [i.key, i.pos, i.bottom, (S.find(s => s.key === i.key) || {}).top]));
  let iOverlap = [];
  for (let i = 0; i < I.length; i++) for (let j = i + 1; j < I.length; j++) {
    const a = I[i], b = I[j], sa = S.find(s => s.key === a.key), sb = S.find(s => s.key === b.key);
    if (!sa || !sb || sa.normal.join() !== sb.normal.join()) continue;
    if (Math.abs(a.pos[1] - b.pos[1]) < (a.h + b.h) / 2 && Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]) < (a.w + b.w) / 2) iOverlap.push([a.key, b.key]);
  }
  chk(iOverlap.length === 0, 'v223: no two icons overlap their neighbours', iOverlap);
  const winHit = I.filter(i => {
    const alongX = Math.abs(i.pos[0]) < 11.5; // north/south walls have |z|≈12, extent along x
    const edge = alongX ? Math.abs(i.pos[0]) + i.w / 2 : Math.abs(i.pos[2]) + i.w / 2;
    return edge > 11.85; // would reach the east/west window (or wall end) plane at |HALF|=12
  }).map(i => [i.key, i.pos, i.w]);
  chk(winHit.length === 0, 'v223: icons stay clear of the window walls', winHit);
  // t850u / v229: claw icon is visible from both sides and its prongs open/close
  const claw = await page.evaluate(() => {
    const S = window.__neonSigns, c = window.__neonClawIcon || (S && S.userData && S.userData.claw);
    if (!c) return { ok: false };
    const THREE = window.__arcade.THREE;
    const tick = S.userData.tick;
    const samples = [];
    for (const t of [0, 0.9, 1.8, 2.7, 3.6]) { tick(t); samples.push({ t, open: +c.userData.open.toFixed(3), frame: c.userData.frame }); }
    return {
      ok: true, name: c.name, side: c.material && c.material.side, frontSide: THREE && c.material && c.material.side === THREE.FrontSide,
      depthWrite: c.material && c.material.depthWrite, frustumCulled: c.frustumCulled, frames: c.userData.frames, period: c.userData.period,
      samples, parent: c.parent && c.parent.name
    };
  });
  chk(claw.ok && claw.name === 'neonClawIcon' && claw.frontSide && claw.depthWrite === false && claw.frustumCulled === false,
    't850u: claw neon icon is a two-plane FrontSide mesh with no depth write', claw);
  const opens = (claw.samples || []).map(s => s.open);
  const frames = (claw.samples || []).map(s => s.frame);
  chk(claw.period >= 3 && claw.period <= 5 && claw.frames >= 6 && Math.max(...opens) - Math.min(...opens) > 0.6 && new Set(frames).size >= 3,
    't850u: claw prongs open and close on a smooth multi-second loop', claw.samples);
  const vis = await page.evaluate(async () => {
    const A = window.__arcade, S = window.__neonSigns;
    const ic = (S.userData.icons || []).find(i => i.key === 'claw');
    if (!ic) return { ok: false };
    const sample = async (pos, at) => {
      window.__camOverride = { pos, at, showMonkey: false, bloom: 0.25 };
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const v = new A.THREE.Vector3(ic.pos[0], ic.pos[1], ic.pos[2]).project(A.camera);
      const w = A.renderer.domElement.width, h = A.renderer.domElement.height;
      const x = Math.round((v.x * 0.5 + 0.5) * w), y = Math.round((v.y * 0.5 + 0.5) * h);
      const gl = A.renderer.getContext();
      // sample a 5x5 neighbourhood around the projected icon (readPixels origin is bottom-left)
      const span = 5, buf = new Uint8Array(span * span * 4);
      const rx = Math.max(0, Math.min(w - span, x - 2)), ry = Math.max(0, Math.min(h - span, y - 2));
      gl.readPixels(rx, ry, span, span, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let pink = 0, maxR = 0, maxB = 0;
      for (let i = 0; i < buf.length; i += 4) {
        const R = buf[i], G = buf[i + 1], B = buf[i + 2];
        if (R > G + 20 && B > G && R > 40) pink++;
        if (R > maxR) maxR = R; if (B > maxB) maxB = B;
      }
      return { ndc: [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)], inView: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z > 0 && v.z < 1, pink, maxR, maxB, xy: [x, y] };
    };
    // front of the claw (normal +Z, sign faces +Z) and the far side looking back
    const front = await sample([ic.pos[0], 1.7, ic.pos[2] + 7], [ic.pos[0], ic.pos[1], ic.pos[2]]);
    const back = await sample([ic.pos[0], 1.7, ic.pos[2] - 7], [ic.pos[0], ic.pos[1], ic.pos[2]]);
    window.__camOverride = null;
    return { pos: ic.pos, front, back };
  });
  chk(vis.front && vis.front.inView && vis.front.pink > 0, 't850u: claw neon is visible from the front of the machine', vis.front);
  chk(vis.back && vis.back.inView && vis.back.pink > 0, 't850u: claw neon is visible from the far side of the room', vis.back);
  // t850u: "CLAW MACHINE" must read left-to-right from BOTH sides. Playwright screenshots
  // (not gl.readPixels — the composer target is not the default framebuffer) are cropped to
  // the projected sign and compared to the atlas crop vs a horizontally flipped crop.
  const letteringMeta = await page.evaluate(() => {
    const S = window.__neonSigns;
    const sign = (S.userData.signs || []).find(s => s.key === 'claw');
    if (!sign) return null;
    const n = sign.normal, dist = 2.2;
    return {
      sign,
      front: [sign.pos[0] + n[0] * dist, sign.pos[1], sign.pos[2] + n[2] * dist],
      back: [sign.pos[0] - n[0] * dist, sign.pos[1], sign.pos[2] - n[2] * dist],
      at: [sign.pos[0], sign.pos[1], sign.pos[2]]
    };
  });
  const letteringSample = async (camPos) => {
    await page.evaluate(({ pos, at }) => {
      window.__camOverride = { pos, at, showMonkey: false, bloom: 0 };
    }, { pos: camPos, at: letteringMeta.at });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    const shot = await page.screenshot({ type: 'png' });
    return page.evaluate(async ({ b64, sign }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
      const A = window.__arcade, S = window.__neonSigns, THREE = A.THREE;
      const R = { x: 512, y: 1234, w: 512, h: 71 }; // neon_atlas.js claw rect
      const atlasCv = document.createElement('canvas'); atlasCv.width = R.w; atlasCv.height = R.h;
      atlasCv.getContext('2d').drawImage(S.material.map.image, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
      const ad = atlasCv.getContext('2d').getImageData(0, 0, R.w, R.h).data;
      const N = 64;
      const profileFrom = (data, w, h, isAtlas) => {
        // column occupancy of pink letter pixels; 8% inset drops the symmetric end stars
        const bins = new Float32Array(N);
        const x0 = Math.floor(w * 0.08), x1 = Math.ceil(w * 0.92);
        const span = Math.max(1, x1 - x0);
        for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if ((isAtlas && a <= 40) || r <= 70 || r <= g + 15 || b <= g) continue;
          bins[Math.min(N - 1, Math.floor((x - x0) / span * N))]++;
        }
        let m = 0; for (let i = 0; i < N; i++) m += bins[i]; m /= N;
        let s2 = 0; for (let i = 0; i < N; i++) s2 += (bins[i] - m) * (bins[i] - m);
        const s = Math.sqrt(s2 / N) || 1;
        for (let i = 0; i < N; i++) bins[i] = (bins[i] - m) / s;
        return bins;
      };
      const corr = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i] * b[i]; return n / a.length; };
      const atlas = profileFrom(ad, R.w, R.h, true);
      const flipped = new Float32Array(N); for (let i = 0; i < N; i++) flipped[i] = atlas[N - 1 - i];
      const p = new THREE.Vector3(...sign.pos);
      const nrm = new THREE.Vector3(...sign.normal);
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, nrm).normalize();
      const hw = sign.w / 2, hh = sign.h / 2, inset = 0.92;
      const W = img.width, H = img.height;
      const scr = [
        p.clone().addScaledVector(right, -hw * inset).addScaledVector(up, hh * inset),
        p.clone().addScaledVector(right, hw * inset).addScaledVector(up, hh * inset),
        p.clone().addScaledVector(right, hw * inset).addScaledVector(up, -hh * inset),
        p.clone().addScaledVector(right, -hw * inset).addScaledVector(up, -hh * inset)
      ].map(c => {
        const v = c.project(A.camera);
        return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, inView: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z > 0 && v.z < 1 };
      });
      const xs = scr.map(s => s.x), ys = scr.map(s => s.y);
      const minX = Math.max(0, Math.floor(Math.min(...xs))), maxX = Math.min(W - 1, Math.ceil(Math.max(...xs)));
      const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(H - 1, Math.ceil(Math.max(...ys)));
      const rw = maxX - minX + 1, rh = maxY - minY + 1;
      if (rw < 16 || rh < 4) return { ok: false, reason: 'too small', rw, rh };
      const cv = document.createElement('canvas'); cv.width = rw; cv.height = rh;
      cv.getContext('2d').drawImage(img, minX, minY, rw, rh, 0, 0, rw, rh);
      const rend = profileFrom(cv.getContext('2d').getImageData(0, 0, rw, rh).data, rw, rh, false);
      const cA = corr(rend, atlas), cF = corr(rend, flipped);
      return { ok: true, corrAtlas: +cA.toFixed(3), corrFlip: +cF.toFixed(3), ltr: cA > 0.08 && cA > cF + 0.15, rw, rh, inView: scr.every(s => s.inView) };
    }, { b64: shot.toString('base64'), sign: letteringMeta.sign });
  };
  const lettering = letteringMeta ? { ok: true, front: await letteringSample(letteringMeta.front), back: await letteringSample(letteringMeta.back) } : { ok: false };
  await page.evaluate(() => { window.__camOverride = null; });
  chk(lettering.ok && lettering.front && lettering.front.ltr && lettering.front.inView,
    't850u: CLAW MACHINE lettering reads left-to-right from the front', lettering.front);
  chk(lettering.ok && lettering.back && lettering.back.ltr && lettering.back.inView,
    't850u: CLAW MACHINE lettering reads left-to-right from the far side (not mirrored)', lettering.back);
  // t850u: Chromium's GPU 2D path cache can stamp the previous atlas cell's fill into a detailed icon
  const leak = await page.evaluate(() => {
    const icons = window.__neonIcons;
    if (!icons || !icons.material || !icons.material.map) return { ok: false };
    const img = icons.material.map.image;
    const keys = ['strike', 'ghost', 'cyber', 'orc', 'pip', 'berserker', 'monkey', 'nova', 'blaster', 'bb', 'rockfall', 'skytower', 'roadster', 'claw'];
    const S = img.width / 4, COLS = 4;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d');
    const count = (key, rgb) => {
      const i = keys.indexOf(key);
      g.clearRect(0, 0, S, S);
      g.drawImage(img, (i % COLS) * S, (i / COLS | 0) * S, S, S, 0, 0, S, S);
      const a = g.getImageData(0, 0, S, S).data;
      let n = 0;
      for (let j = 0; j < a.length; j += 4) if (a[j + 3] > 30 && a[j] === rgb[0] && a[j + 1] === rgb[1] && a[j + 2] === rgb[2]) n++;
      return n;
    };
    return { ok: true, orcHasCyber: count('orc', [255, 63, 208]), vikingHasPip: count('berserker', [255, 122, 217]) };
  });
  chk(leak.ok && leak.orcHasCyber === 0, 't850u: orc icon is not stained with Cybercity pink', leak);
  chk(leak.ok && leak.vikingHasPip === 0, 't850u: viking icon is not stained with the previous icon colour', leak);
  chk(errors.length === 0, 'no page errors', errors);
  await o.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message); process.exit(1); });
