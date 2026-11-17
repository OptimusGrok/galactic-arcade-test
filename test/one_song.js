// t911u: only one decoded music buffer at a time. Room track is freed after a cabinet takes over
// (1s hold) and is decoded again on demand from the compact arraybuffer. Cabinet cache stays at 1.
// NOSHOTS=1 node test/one_song.js
const { open } = require('./lib');
(async () => {
  let ok = true; const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const o = await open({ w: 844, h: 390 }); const p = o.page; p.setDefaultTimeout(90000);
  await p.waitForFunction(() => window.__music && window.__cabMusic && window.__arcade && window.__arcade.play, null, { timeout: 60000 });
  await p.evaluate(() => { window.__start = Object.assign(window.__start || {}, { dismissed: true }); if (window.__pa) window.__pa.playing = false; window.__music.setOn(true); });
  const snap = () => p.evaluate(() => {
    const m = window.__music, c = window.__cabMusic;
    return { hasBuf: !!m.hasBuf, loaded: !!m.loaded, rawBytes: m.rawBytes || 0, freed: m.freed || 0, decodes: m.decodes || 0, target: +m.target.toFixed(3), err: m.err || null, cab: c.cur, want: c.want, duck: +c.duck.toFixed(2), bufCount: c.bufCount || 0, cached: c.cached || [] };
  });
  const atFront = key => p.evaluate(key => {
    const A = window.__arcade, u = A.play.machines[key].cab.userData, f = u.front;
    A.st.vel.set(0, 0, 0); A.monkey.position.set(f.x, 0, f.z);
  }, key);
  const at = (x, z) => p.evaluate(([x, z]) => { const A = window.__arcade; A.st.vel.set(0, 0, 0); A.monkey.position.set(x, 0, z); }, [x, z]);

  await at(0, 4);
  await p.waitForFunction(() => window.__music.hasBuf || window.__music.err, null, { timeout: 30000 });
  let a = await snap();
  chk(a.hasBuf && a.rawBytes > 1000 && !a.err, 'room track decoded, compact arraybuffer kept ' + JSON.stringify(a));
  const dec0 = a.decodes, freed0 = a.freed;

  await atFront('monkey');
  await p.waitForFunction(() => window.__cabMusic.cur === 'monkey' || window.__cabMusic.want === 'monkey', null, { timeout: 15000 });
  // cabinet decode + duck ramp + HOLD 1000; wait for the free rather than a fixed 1.6s
  await p.waitForFunction(() => !window.__music.hasBuf || window.__music.err, null, { timeout: 6000 });
  a = await snap();
  chk(!a.hasBuf, 'room decoded buffer freed after cabinet takes over (hold 1s) ' + JSON.stringify(a));
  chk(a.freed > freed0, 'room free counter incremented');
  chk(a.bufCount <= 1, 'at most one cabinet AudioBuffer cached ' + a.bufCount + ' ' + (a.cached || []).join(','));
  chk(a.cab === 'monkey' || a.want === 'monkey', 'monkey cabinet loop is the current song');

  await at(0, 4);
  await p.waitForFunction(() => window.__music.hasBuf || window.__music.err, null, { timeout: 20000 });
  await p.waitForTimeout(2200); // cabinet fade + evictIdle
  a = await snap();
  chk(a.hasBuf && a.decodes > dec0 && !a.err, 'room track re-decoded on demand after leaving the cabinet ' + JSON.stringify(a));
  chk(a.bufCount <= 1, 'cabinet cache still <= 1 after leaving ' + JSON.stringify(a));

  await atFront('ghost');
  await p.waitForTimeout(2000);
  const mid = await snap();
  await atFront('nova');
  await p.waitForTimeout(2000);
  a = await snap();
  chk(mid.bufCount <= 1 && a.bufCount <= 1, 'switching cabinets keeps a single decoded buffer (mid ' + mid.bufCount + ' after ' + a.bufCount + ' cached=' + (a.cached || []).join(',') + ')');
  chk(a.cab === 'nova' || a.want === 'nova' || a.cached.indexOf('nova') >= 0, 'nova is the active/cached cabinet track');

  chk(o.errors.length === 0, 'no page errors ' + o.errors.join('|'));
  await o.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message); process.exit(1); });
