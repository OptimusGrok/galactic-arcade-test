/* v235: Orc Arena (arcade copy) follows the arcade quality tier —
   low: no AA, shadows off, only a couple of point lights;
   mid: no AA, Basic shadows at 1024;
   high: AA + PCF soft 2048 (previous defaults). */
const { open } = require('./lib');

(async () => {
  let ok = true;
  const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 400) : '')); if (!c) ok = false; };

  for (const tier of ['low', 'mid', 'high']) {
    const want = {
      low:  { aa: false, shadows: false, shadowSize: 0,    maxLit: 2 },
      mid:  { aa: false, shadows: true,  shadowSize: 1024, maxLit: 99 },
      high: { aa: true,  shadows: true,  shadowSize: 2048, maxLit: 99 }
    }[tier];

    const o = await open({
      phone: true, w: 390, h: 700, dsf: 2,
      init: new Function(`try { localStorage.setItem('galacticarcade.tier', ${JSON.stringify(tier)}); localStorage.setItem('neonarcade.mute', '1'); } catch (e) {} window.__noAdapt = 1;`)
    });
    const { page, close } = o;
    const boot = await page.evaluate(() => ({ tier: window.__arcade.tier.name }));
    chk(boot.tier === tier, tier + ': arcade booted at forced ' + tier, boot);

    await page.evaluate(() => {
      const P = window.__arcade.play;
      document.body.classList.add('upright');
      const t = document.getElementById('turnHint'); if (t) t.classList.remove('on');
      P.start(P.machines.orc);
    });
    await page.waitForFunction(() => {
      const f = document.getElementById('game');
      try { return !!(f && f.contentWindow && f.contentWindow.__gaOrcGfx); } catch (e) { return false; }
    }, null, { timeout: 60000 });

    const g = await page.evaluate(() => {
      const f = document.getElementById('game'), w = f.contentWindow, gfx = w.__gaOrcGfx;
      let src = '';
      try { src = f.getAttribute('src') || ''; } catch (e) {}
      return Object.assign({ src, playTier: w.__gaPlayTier || null }, gfx);
    });
    console.log(tier, JSON.stringify(g));
    chk(g.tier === tier, tier + ': __gaOrcGfx.tier is ' + tier, g);
    chk(g.aa === want.aa && g.aaGL === want.aa, tier + ': antialias ' + want.aa, { aa: g.aa, aaGL: g.aaGL });
    chk(g.shadows === want.shadows && g.map === want.shadows, tier + ': shadows ' + want.shadows, { shadows: g.shadows, map: g.map, size: g.shadowSize });
    chk(g.shadowSize === want.shadowSize, tier + ': shadow map ' + want.shadowSize, g.shadowSize);
    chk(g.lit <= want.maxLit && g.lights > 2, tier + ': point lights trimmed (lit=' + g.lit + ' of ' + g.lights + ', max ' + want.maxLit + ')', { lit: g.lit, lights: g.lights });
    if (tier === 'low') chk(g.lit <= 2, 'low: at most 2 visible point lights', g);
    if (tier === 'high') chk(g.lit >= 2, 'high: castle fire lights stay on (lava/village extras only exist on those stages)', g);
    chk(/[?&]tier=/.test(g.src) && g.src.indexOf('tier=' + tier) >= 0, tier + ': play URL carries tier=' + tier, g.src);
    await page.evaluate(() => { try { window.__arcade.play.exit('x'); } catch (e) {} });
    await close();
  }
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
