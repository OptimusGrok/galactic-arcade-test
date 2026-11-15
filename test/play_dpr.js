/* v234: inside the arcade play iframe, devicePixelRatio is capped to the quality tier
   (low=1, mid=1.25, high=2), so cabinet games don't paint at the phone's raw 2–3× DPR. */
const { open } = require('./lib');

(async () => {
  let ok = true;
  const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };

  for (const tier of ['low', 'mid', 'high']) {
    const cap = tier === 'low' ? 1 : tier === 'mid' ? 1.25 : 2;
    const o = await open({
      phone: true, w: 390, h: 700, dsf: 3,   // raw DPR 3, well above every cap
      init: new Function(`try { localStorage.setItem('galacticarcade.tier', ${JSON.stringify(tier)}); localStorage.setItem('neonarcade.mute', '1'); } catch (e) {} window.__noAdapt = 1;`)
    });
    const { page, close } = o;
    const boot = await page.evaluate(() => ({ tier: window.__arcade.tier.name, raw: window.devicePixelRatio }));
    chk(boot.tier === tier, tier + ': arcade booted at forced ' + tier + ' (got ' + boot.tier + ')');
    chk(boot.raw === 3, tier + ': host still sees raw dpr 3 (got ' + boot.raw + ')');

    await page.evaluate(() => {
      const P = window.__arcade.play;
      document.body.classList.add('upright');
      const t = document.getElementById('turnHint'); if (t) t.classList.remove('on');
      P.start(P.machines.claw);
    });
    await page.waitForFunction(() => {
      const f = document.getElementById('game');
      try { return !!(f && f.contentWindow && f.contentWindow.__gaPlayDpr); } catch (e) { return false; }
    }, null, { timeout: 40000 });

    const g = await page.evaluate(() => {
      const f = document.getElementById('game'), w = f.contentWindow;
      let src = '';
      try { src = f.getAttribute('src') || ''; } catch (e) {}
      return {
        dpr: w.devicePixelRatio,
        playDpr: w.__gaPlayDpr,
        playTier: w.__gaPlayTier,
        raw: w.__gaPlayDprRaw,
        src,
        cv: w.document.querySelector('canvas') && { w: w.document.querySelector('canvas').width, css: w.innerWidth }
      };
    });
    console.log(tier, JSON.stringify(g));
    chk(g.playTier === tier, tier + ': iframe __gaPlayTier is ' + tier + ' (got ' + g.playTier + ')');
    chk(g.dpr === cap && g.playDpr === cap, tier + ': iframe dpr capped to ' + cap + ' (got dpr=' + g.dpr + ' playDpr=' + g.playDpr + ')');
    chk(g.raw === 3, tier + ': raw dpr recorded as 3 (got ' + g.raw + ')');
    chk(/[?&]tier=/.test(g.src) && g.src.indexOf('tier=' + tier) >= 0, tier + ': play URL carries tier=' + tier + ' (' + g.src + ')');
    if (g.cv && g.cv.css) {
      // claw canvas backing store uses the capped dpr
      const expected = Math.round(g.cv.css * cap);
      chk(Math.abs(g.cv.w - expected) <= 1, tier + ': claw canvas width ' + g.cv.w + ' matches css ' + g.cv.css + ' × ' + cap);
    }
    await page.evaluate(() => { try { window.__arcade.play.exit('x'); } catch (e) {} });
    await close();
  }
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
