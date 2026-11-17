// t928u: the painted BLASTER title on the cabinet-body marquee must fit at every cabScale
// (low 0.5 / mid 0.75 / high 1). 1984 sits below the letters, not over them. NOSHOTS=1 skips shots.
// node test/blaster_marquee.js
const fs = require('fs');
const DIR = process.env.SHOTDIR || '/workspace/ga-v255-shots';
(async () => {
  let ok = true;
  const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const tiers = ['low', 'mid', 'high'];
  async function runTier(tier) {
    const http = require('http'), fs = require('fs'), path = require('path');
    const { chromium } = require('/workspace/burrow-buster/node_modules/playwright');
    const ROOT = process.env.GA_ROOT || path.resolve(__dirname, '..');
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.ktx2': 'application/octet-stream', '.wasm': 'application/wasm' };
    const srv = process.env.GA_URL ? null : await new Promise(r => { const s = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); }); s.listen(0, () => r(s)); });
    const chromeBins = ['/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ungoogled-chromium/chrome'];
    const executablePath = chromeBins.find(f => fs.existsSync(f));
    const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await ctx.route(/supabase/i, r => r.abort());
    await page.addInitScript(() => { window.__skipStart = 1; window.__noUnloadWarn = 1; window.__noRandomRoom = 1; });
    const base = process.env.GA_URL || `http://localhost:${srv.address().port}/index.html`;
    const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'tier=' + tier;
    await page.goto(url, { timeout: 180000 });
    for (let i = 0; i < 6; i++) {
      try { await page.waitForFunction(() => window.__arcade && window.__arcade.stats.frames > 3, null, { timeout: 60000 }); break; }
      catch (e) { if (i === 5 || !/Execution context was destroyed|frame was detached/i.test(String(e))) throw e; }
    }
    await page.evaluate(() => Promise.all([window.__arcade.shopReady, window.__arcade.windowsReady].filter(Boolean).map(p => Promise.resolve(p))));
    const ev = (f, a) => page.evaluate(f, a);
    const frames = async n => { const f0 = await ev(() => window.__arcade.stats.frames); await page.waitForFunction(([f, n]) => window.__arcade.stats.frames > f + n, [f0, n], { timeout: 60000 }).catch(() => {}); };
    await frames(6);
    const info = await ev(() => {
      const A = window.__arcade, cab = A.blasterCab, mq = cab.getObjectByName('marquee');
      const map = mq && mq.material && mq.material.map, img = map && map.image;
      const w = img && (img.width || 0), h = img && (img.height || 0);
      let art = null;
      if (img && img.getContext) {
        const g = img.getContext('2d'), d = g.getImageData(0, 0, w, h).data;
        let minX = w, minY = h, maxX = 0, maxY = 0, yMinX = w, yMinY = h, yMaxX = 0, yMaxY = 0, yCount = 0;
        // First pass: yellow pixel-letter cells (not stars).
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4, r = d[i], g2 = d[i + 1], b = d[i + 2];
          const yellow = r > 180 && g2 > 140 && b < 80 && r + g2 > b * 4;
          if (yellow) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
        }
        // Year: pale cyan '1984' in the lower half, centre 60% — ignore side accent bars and title glow.
        const y0 = (minX <= maxX ? maxY + 1 : Math.floor(h * 0.5));
        for (let y = y0; y < h; y++) for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x++) {
          const i = (y * w + x) * 4, r = d[i], g2 = d[i + 1], b = d[i + 2];
          const year = r > 140 && g2 > 180 && b > 180 && b >= r && g2 >= r;
          if (year) { yCount++; if (x < yMinX) yMinX = x; if (y < yMinY) yMinY = y; if (x > yMaxX) yMaxX = x; if (y > yMaxY) yMaxY = y; }
        }
        art = { w, h, yellow: minX <= maxX ? { minX, minY, maxX, maxY } : null, year: yCount ? { minX: yMinX, minY: yMinY, maxX: yMaxX, maxY: yMaxY, n: yCount } : null };
      }
      const THREE = A.THREE;
      cab.updateMatrixWorld(true);
      const mid = new THREE.Vector3();
      new THREE.Box3().setFromObject(mq).getCenter(mid);
      const inward = cab.userData.inward.clone().normalize();
      const pos = mid.clone().addScaledVector(inward, 1.15).add(new THREE.Vector3(0, 0.12, 0));
      window.__camOverride = { pos: [pos.x, pos.y, pos.z], at: [mid.x, mid.y, mid.z], showMonkey: false };
      return {
        ver: window.__GA_VER, tier: window.__gaTier && window.__gaTier.name,
        cabScale: window.__gaTier && window.__gaTier.quality && window.__gaTier.quality.cabScale,
        hasMap: !!(map && img), src: !!(map && map.source && map.source.data), art
      };
    });
    await frames(5);
    await page.waitForTimeout(250);
    if (!process.env.NOSHOTS) {
      fs.mkdirSync(DIR, { recursive: true });
      const pathShot = DIR + '/blaster_marquee_' + tier + '.png';
      if (!fs.existsSync(pathShot)) { await page.screenshot({ path: pathShot }); console.log('shot ' + pathShot); }
    }
    console.log(JSON.stringify(info));
    const a = info.art;
    chk(info.hasMap && a && a.w > 0, tier + ': marquee is a canvas texture ' + JSON.stringify({ w: a && a.w, h: a && a.h, cabScale: info.cabScale, ver: info.ver }));
    if (a && a.yellow && a.year) {
      const padX = a.w * 0.08, padY = a.h * 0.04;
      chk(a.yellow.minX >= padX && a.yellow.maxX <= a.w - padX, tier + ': BLASTER has side margin ' + JSON.stringify(a));
      chk(a.yellow.minY >= padY && a.yellow.maxY <= a.h - padY, tier + ': BLASTER has vertical margin ' + JSON.stringify(a));
      chk(a.year.minY >= a.yellow.maxY + 1, tier + ': 1984 is below BLASTER, not overlapping ' + JSON.stringify(a));
      chk((a.yellow.maxX - a.yellow.minX) <= a.w * 0.80, tier + ': BLASTER is not edge-to-edge ' + JSON.stringify(a));
    } else {
      chk(false, tier + ': could not find yellow title / cyan 1984 pixels ' + JSON.stringify(a));
    }
    await browser.close(); if (srv) srv.close();
    return info;
  }
  for (const tier of tiers) await runTier(tier);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
