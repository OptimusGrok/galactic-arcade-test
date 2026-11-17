// t883u: Ghost 256 and Strike cabinet screens show a live/attract demo when the player walks up,
// and those screens are as wide as the neighbouring 4:3 / 16:9 cabinets.
const { open } = require('./lib');
(async () => {
  const o = await open({ w: 844, h: 390 });
  const { page, errors, close } = o;
  let ok = true;
  const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m, x != null ? JSON.stringify(x) : ''); if (!c) ok = false; };

  // t893u: demos attach when the player (or camera) is near, so walk up / force before waiting for ready.
  await page.evaluate(() => {
    const A = window.__arcade;
    window.__forceDemo = 1;
    if (A && A.strikeCab && A.strikeCab.userData && A.strikeCab.userData.front) {
      const f = A.strikeCab.userData.front, n = A.strikeCab.userData.inward || { x: 0, z: 1 };
      A.monkey.position.set(f.x + (n.x || 0) * 2.4, 0, f.z + (n.z || 0) * 2.4);
    }
  });
  await page.waitForFunction(() => {
    const A = window.__arcade;
    return A && ((A.demo && (A.demo.ready || A.demo.err)) && (A.ghostDemo && (A.ghostDemo.ready || A.ghostDemo.err)));
  }, null, { timeout: 60000 });

  const sizes = await page.evaluate(() => {
    const A = window.__arcade, T = A.THREE;
    const along = cab => {
      const s = cab.getObjectByName('screen'), b = new T.Box3().setFromObject(s).getSize(new T.Vector3());
      const wall = cab.userData.wall;
      return { w: +((wall === 'west' || wall === 'east') ? b.z : b.x).toFixed(3), h: +b.y.toFixed(3), wall };
    };
    return {
      strike: along(A.strikeCab), ghost: along(A.ghostCab),
      nova: along(A.novaCab), orc: along(A.orcCab),
      berserker: along(A.berserkerCab), monkey: along(A.monkeyCab),
      sErr: A.demo.err, gErr: A.ghostDemo.err, sReady: A.demo.ready, gReady: A.ghostDemo.ready
    };
  });
  chk(!sizes.sErr && sizes.sReady, 'Strike demo attached', sizes);
  chk(!sizes.gErr && sizes.gReady, 'Ghost demo attached', { err: sizes.gErr, ready: sizes.gReady });
  chk(sizes.strike.w >= 0.55 && Math.abs(sizes.strike.w - sizes.nova.w) < 0.15,
    'Strike screen is about as wide as Nova (not a skinny portrait tube)', sizes);
  chk(sizes.ghost.w >= 0.55 && Math.abs(sizes.ghost.w - sizes.orc.w) < 0.15,
    'Ghost screen is about as wide as Orc (not a skinny portrait tube)', sizes);

  const sample = async (which) => page.evaluate((which) => {
    const A = window.__arcade;
    const cab = which === 'strike' ? A.strikeCab : A.ghostCab;
    const D = which === 'strike' ? A.demo : A.ghostDemo;
    const front = cab.userData.front || cab.userData.centre;
    const inward = cab.userData.inward || { x: 0, z: 1 };
    A.monkey.position.set(front.x + (inward.x || 0) * 2.4, 0, front.z + (inward.z || 0) * 2.4);
    A.st.fp = false; A.st.camInit = false; A.st.pitch = 0.12;
    const face = Math.atan2(-(inward.x || 0), -(inward.z || 0));
    A.st.yaw = face; A.st.face = face;
    window.__forceDemo = 1;
    const tex = cab.userData.crt && cab.userData.crt.uniforms.map.value;
    const img = tex && (tex.image || (tex.source && tex.source.data));
    const read = (src) => {
      if (!src || !src.width) return { none: 1 };
      const c = document.createElement('canvas'); c.width = 64; c.height = 48;
      const g = c.getContext('2d'); try { g.drawImage(src, 0, 0, 64, 48); } catch (e) { return { err: String(e), w: src.width, h: src.height }; }
      const d = g.getImageData(0, 0, 64, 48).data;
      let sum = 0, nz = 0, n = 64 * 48;
      for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; sum += v; if (v > 18) nz++; }
      return { w: src.width, h: src.height, mean: +(sum / n / 3).toFixed(2), nz, frac: +(nz / n).toFixed(3) };
    };
    return { ready: D.ready, frames: D.frames, running: D.running, err: D.err, view: read(D.view || (cab.userData && cab.userData.view)), map: read(img) };
  }, which);

  // one sample immediately after walking up (placeholder or first blit should already be non-blank)
  let s0 = await sample('strike');
  let g0 = await sample('ghost');
  // let a few demo ticks land
  await page.waitForFunction(() => window.__arcade.demo.frames > 8 && window.__arcade.ghostDemo.frames > 8, null, { timeout: 15000 });
  const s1 = await sample('strike');
  const g1 = await sample('ghost');

  const lit = (p) => p && !p.none && !p.err && p.nz > 80 && p.mean > 4;
  chk(lit(s0.view) || lit(s0.map) || lit(s1.view) || lit(s1.map),
    'Strike screen shows non-blank demo pixels when the player is near', { s0, s1 });
  chk(lit(g0.view) || lit(g0.map) || lit(g1.view) || lit(g1.map),
    'Ghost screen shows non-blank demo pixels when the player is near', { g0, g1 });
  chk(s1.ready && s1.frames > 8 && !s1.err, 'Strike demo is running after walking up', s1);
  chk(g1.ready && g1.frames > 8 && !g1.err, 'Ghost demo is running after walking up', g1);
  chk((s1.view && s1.view.w > s1.view.h * 0.9) || (s1.map && s1.map.w > s1.map.h * 0.9),
    'Strike demo is cropped onto a wide (landscape) screen texture', { view: s1.view, map: s1.map });
  chk((g1.view && g1.view.w > g1.view.h * 0.9) || (g1.map && g1.map.w > g1.map.h * 0.9),
    'Ghost demo is cropped onto a wide (landscape) screen texture', { view: g1.view, map: g1.map });

  const errs = errors.filter(e => !/net::ERR_FAILED|Failed to load resource|supabase/i.test(e));
  chk(errs.length === 0, 'no page errors', errs.slice(0, 4));
  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  await close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
