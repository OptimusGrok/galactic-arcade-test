// t869u / v243: wall pictures lazy-load Arcade's painted tex/icons/<key>.webp art
// (same cell layout and brightness as the VR edition). Canvas icons are the fallback;
// the claw stays the two-sided animated mesh. node test/painted_icons.js
const fs = require('fs');
const { open } = require('./lib');
let ok = true;
const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 400) : '')); if (!c) ok = false; };
const SHOT = '/workspace/shots/v243-painted-cabinet-signs.png';
const WANT = ['strike', 'ghost', 'cyber', 'orc', 'pip', 'berserker', 'monkey', 'nova', 'blaster', 'bb', 'rockfall', 'skytower', 'roadster'];

(async () => {
  const o = await open({ w: 960, h: 540 }), page = o.page, { errors } = o;
  await page.waitForFunction(() => window.__arcade && window.__neonIcons && window.__neonIcons.material && window.__neonIcons.material.map, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__gaPaintedIcons && window.__gaPaintedIcons.done, null, { timeout: 20000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const st = window.__gaPaintedIcons || {}, icons = window.__neonIcons, map = icons && icons.material && icons.material.map, img = map && map.image;
    let webpHits = 0;
    try { webpHits = performance.getEntriesByType('resource').filter(e => /tex\/icons\//.test(e.name)).length; } catch (e) {}
    const keys = ((icons && icons.userData && icons.userData.icons) || []).map(i => i.key);
    const KEYS = ['strike', 'ghost', 'cyber', 'orc', 'pip', 'berserker', 'monkey', 'nova', 'blaster', 'bb', 'rockfall', 'skytower', 'roadster', 'claw'];
    let opaque = [];
    if (img && img.getContext && st.cell) {
      const g = img.getContext('2d'), C = st.cell;
      opaque = KEYS.filter(k => k !== 'claw').map(k => {
        const i = KEYS.indexOf(k), d = g.getImageData((i % 4) * C, Math.floor(i / 4) * C, C, C).data;
        let n = 0; for (let j = 3; j < d.length; j += 16) if (d[j] > 200) n++;
        return n / (d.length / 16);
      });
    }
    const claw = window.__neonClawIcon;
    return {
      st, keys, webpHits, opaque, atlas: img ? img.width : 0,
      k: icons && icons.material && icons.material.color ? +icons.material.color.r.toFixed(3) : 0,
      canvas: !!(img && typeof img.getContext === 'function'),
      claw: !!(claw && claw.name === 'neonClawIcon'), clawW: claw && claw.userData && claw.userData.w,
      clawFrames: claw && claw.userData && claw.userData.frames
    };
  });
  chk(WANT.every(k => r.keys.includes(k)), 'all 13 wall icon slots are present', r.keys);
  chk(r.st.done && r.st.loaded && r.st.loaded.length === 13 && !(r.st.failed && r.st.failed.length) && r.atlas === 1024 && r.st.cell === 256,
    'painted webps lazy-loaded into a 1024 px atlas (canvas was the fallback)', r.st);
  chk(r.k >= 0.8, 'painted art uses the same slight brightness as VR (x' + r.k + ')', { k: r.k });
  chk(r.webpHits === 13, 'all 13 tex/icons/*.webp were requested (not precached as a requirement)', { webpHits: r.webpHits });
  chk(r.opaque.length === 13 && r.opaque.every(v => v > 0.12), 'every painted cell has solid art (min ' + (r.opaque.length ? Math.min(...r.opaque).toFixed(2) : '-') + ')', r.opaque);
  chk(r.claw && r.clawFrames >= 6, 'claw is still the two-sided animated mesh (not a painted webp)', { claw: r.claw, frames: r.clawFrames, w: r.clawW });
  const moved = await page.evaluate(() => {
    const c = window.__neonClawIcon, S = window.__neonSigns; if (!c || !S || !S.userData.tick) return { ok: false };
    const a = c.userData.frame; S.userData.tick(1.8); const b = c.userData.frame; return { ok: true, a, b, open: c.userData.open };
  });
  chk(moved.ok && moved.a !== moved.b, 'claw prongs still animate', moved);

  await page.evaluate(() => {
    const hide = id => { const el = document.getElementById(id); if (el) { el.style.display = 'none'; el.hidden = true; } };
    hide('start'); hide('gaCv'); hide('gaQlook'); hide('gaQsetup');
    try { window.__start = Object.assign(window.__start || {}, { shown: false, dismissed: true }); } catch (e) {}
    const icons = (window.__neonIcons && window.__neonIcons.userData && window.__neonIcons.userData.icons) || [];
    const target = icons.find(i => i.key === 'berserker') || icons[0]; if (!target) return;
    const p = target.pos, alongX = Math.abs(p[0]) < 11.5, inward = alongX ? -Math.sign(p[2] || 1) : -Math.sign(p[0] || 1);
    const x = alongX ? p[0] : p[0] + inward * 7, z = alongX ? p[2] + inward * 7 : p[2];
    if (window.__arcade && window.__arcade.monkey) window.__arcade.monkey.visible = false;
    window.__camOverride = { pos: [x, 3.4, z], at: [p[0], p[1] - 0.2, p[2]], showMonkey: false, bloom: 0.2 };
  });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  if (!fs.existsSync(SHOT)) {
    await page.screenshot({ path: SHOT, type: 'png' });
    chk(fs.existsSync(SHOT) && fs.statSync(SHOT).size > 8000, 'wrote a new 2D painted-signs shot to ' + SHOT, { bytes: fs.existsSync(SHOT) ? fs.statSync(SHOT).size : 0 });
  } else {
    chk(true, 'left existing shot alone: ' + SHOT);
  }
  chk(errors.length === 0, 'no page errors', errors.slice(0, 3));
  await o.close();
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message + '\n' + e.stack); process.exit(1); });
