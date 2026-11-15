/* v236: Roadster step-in and Dead Signal headset tweens run on the wall clock, not
   50ms-capped frame counts. On a slow GPU they used to take 30–60s (and the 45s
   enter-demo wait failed, leaving the cabinet stuck in prep/zoomIn). Also, X / exit
   must cancel a mid-tween instead of being a no-op. */
const { open } = require('./lib');

(async () => {
  let ok = true;
  const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 400) : '')); if (!c) ok = false; };

  const o = await open({ w: 1280, h: 720 });
  const { page, close } = o;
  await page.evaluate(() => { try { localStorage.setItem('neonarcade.tickets', '99'); } catch (e) {} });

  const start = key => page.evaluate(k => {
    const P = window.__arcade.play;
    document.body.classList.add('upright');
    const t = document.getElementById('turnHint'); if (t) t.classList.remove('on');
    P.machines[k].credits = Math.max(P.machines[k].credits, 1);
    const t0 = performance.now();
    P.start(P.machines[k]);
    return { mode: P.mode, t0 };
  }, key);

  const waitMode = (pred, ms) => page.waitForFunction(pred, null, { timeout: ms }).then(() => true).catch(() => false);
  const snap = () => page.evaluate(() => {
    const P = window.__arcade.play;
    return { mode: P.mode, sub: P.sub, t: P.t, cur: P.cur && P.cur.key, has: !!document.getElementById('game') };
  });

  // --- Roadster: prep 1.8s + zoomIn 1.6s should reach demo in well under 8s ---
  const r0 = await start('roadster');
  chk(r0.mode === 'prep', 'Roadster starts in the step-in prep', r0);
  const rOk = await waitMode(() => window.__arcade.play.mode === 'game' && window.__arcade.play.sub === 'demo', 8000);
  const r1 = await snap();
  chk(rOk && r1.mode === 'game' && r1.sub === 'demo', 'Roadster reaches the demo within 8s wall clock (was 30–60s when frame-counted)', r1);
  await page.evaluate(() => { try { window.__arcade.play.exit('x'); } catch (e) {} });
  const rBack = await waitMode(() => window.__arcade.play.mode === 'walk' && !document.getElementById('game'), 8000);
  chk(rBack, 'Roadster exit returns to walk within 8s', await snap());

  // --- Dead Signal: prep 2.6s + zoomIn 1.6s ---
  const d0 = await start('ds');
  chk(d0.mode === 'prep', 'Dead Signal starts in the headset prep', d0);
  const dOk = await waitMode(() => window.__arcade.play.mode === 'game' && window.__arcade.play.sub === 'demo', 8000);
  const d1 = await snap();
  chk(dOk && d1.mode === 'game' && d1.sub === 'demo', 'Dead Signal reaches the demo within 8s wall clock', d1);
  await page.evaluate(() => { try { window.__arcade.play.exit('x'); } catch (e) {} });
  // zoomOut 1.4s + post 1.9s
  const dBack = await waitMode(() => window.__arcade.play.mode === 'walk' && !document.getElementById('game'), 8000);
  chk(dBack, 'Dead Signal exit (zoom out + headset off) returns to walk within 8s', await snap());

  // --- mid-prep cancel used to be a no-op (exit only accepted mode==='game') ---
  await start('roadster');
  await waitMode(() => window.__arcade.play.mode === 'prep' && window.__arcade.play.t > 0.15, 4000);
  const mid = await snap();
  chk(mid.mode === 'prep', 'back in Roadster prep so we can cancel it', mid);
  const cancelled = await page.evaluate(() => {
    const P = window.__arcade.play;
    const before = P.mode;
    P.exit('x');
    return { before, after: P.mode };
  });
  chk(cancelled.before === 'prep' && cancelled.after === 'zoomOut', 'exit() during prep actually starts zoom-out (was a no-op)', cancelled);
  const cBack = await waitMode(() => window.__arcade.play.mode === 'walk', 8000);
  chk(cBack, 'canceling mid-prep returns to walk', await snap());

  await close();
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
