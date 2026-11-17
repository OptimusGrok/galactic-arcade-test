// t923u: every cabinet with a track loads, decodes, and plays once on approach
// without rapid restarts, even under CPU throttling that mimics a phone.
// NOSHOTS=1 node test/cab_music.js
const { open } = require('./lib');
(async () => {
  let ok = true; const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const o = await open({ w: 844, h: 390 }); const p = o.page; p.setDefaultTimeout(90000);
  try {
    const cdp = await p.context().newCDPSession(p);
    try { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); } catch (e) { console.log('WARN no CPU throttle', e.message); }

    await p.waitForFunction(() => window.__cabMusic && window.__arcade && window.__arcade.play, null, { timeout: 60000 });
    await p.evaluate(() => {
      window.__start = Object.assign(window.__start || {}, { dismissed: true });
      try { if (window.__pa) window.__pa.playing = false; } catch (e) {}
      try { window.__music.setOn(true); } catch (e) {}
    });

    const files = await p.evaluate(async () => {
      const T = window.__cabMusic.tracks, out = [];
      for (const k of Object.keys(T)) {
        const src = T[k].src; let status = 0, bytes = 0, dur = 0, rms = 0, err = null, peak = 0;
        try {
          const r = await fetch(src, { cache: 'no-store' });
          status = r.status;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const buf = await r.arrayBuffer(); bytes = buf.byteLength;
          const AC = window.__unlockAC || new (window.AudioContext || window.webkitAudioContext)();
          window.__unlockAC = AC; if (AC.state === 'suspended') await AC.resume();
          const a = await new Promise((ok, no) => AC.decodeAudioData(buf.slice(0), ok, no));
          dur = a.duration;
          const ch = a.getChannelData(0);
          let s = 0, pk = 0;
          for (let i = 0; i < ch.length; i++) { const v = ch[i]; s += v * v; const ab = Math.abs(v); if (ab > pk) pk = ab; }
          rms = Math.sqrt(s / ch.length); peak = pk;
        } catch (e) { err = String(e && e.message || e); }
        out.push({ k, src, status, bytes, dur: +dur.toFixed(2), rms: +rms.toFixed(5), peak: +peak.toFixed(4), err });
      }
      return out;
    });
    for (const f of files) {
      chk(f.status === 200 && f.bytes > 4000 && !f.err, f.k + ' loads (' + f.status + ' ' + f.bytes + 'B ' + (f.err || '') + ')');
      chk(f.dur >= 5, f.k + ' duration ' + f.dur + 's');
      chk(f.peak >= 0.05 && f.rms >= 0.01, f.k + ' is audible (peak ' + f.peak + ' rms ' + f.rms + ')');
    }

    const keys = files.map(f => f.k);
    const atFront = key => p.evaluate(key => {
      const A = window.__arcade, C = window.__cabMusic, u = A.play.machines[key].cab.userData, f = u.front;
      A.st.vel.set(0, 0, 0); A.monkey.position.set(f.x, 0, f.z);
      try { C.tick && C.tick(); } catch (e) {}
    }, key);
    const atSpawn = () => p.evaluate(() => { const A = window.__arcade; A.st.vel.set(0, 0, 0); A.monkey.position.set(0, 0, 4); try { window.__cabMusic.tick(); } catch (e) {} });
    const snap = () => p.evaluate(() => {
      const c = window.__cabMusic;
      return { cur: c.cur, want: c.want, starts: c.starts, loads: c.loads, bufCount: c.bufCount || 0, cached: c.cached || [], err: c.err, duck: +((c.duck || 0).toFixed(2)) };
    });

    await atSpawn();
    await p.waitForTimeout(800);
    const s0 = await snap();

    const restartBad = [];
    for (const key of keys) {
      if (!await p.evaluate(k => !!(window.__arcade.play.machines[k] && window.__arcade.play.machines[k].cab), key)) {
        chk(false, key + ' machine is in play.js'); continue;
      }
      const before = await snap();
      await atFront(key);
      try {
        await p.waitForFunction(k => window.__cabMusic.cur === k || window.__cabMusic.want === k, key, { timeout: 8000 });
        await p.waitForFunction(k => window.__cabMusic.cur === k, key, { timeout: 8000 });
      } catch (e) {
        chk(false, key + ' did not become the active source ' + JSON.stringify(await snap()));
        continue;
      }
      await p.waitForTimeout(1600); // hold window; starts must not keep climbing
      const a = await snap(), midStarts = a.starts;
      await p.waitForTimeout(1600);
      const b = await snap();
      chk(b.cur === key, key + ' stays current after approach ' + JSON.stringify(b));
      chk(b.starts === midStarts, key + ' does not restart while standing still (starts ' + midStarts + ' -> ' + b.starts + ')');
      chk(b.bufCount <= 2, key + ' cache stays small ' + b.bufCount + ' ' + (b.cached || []).join(','));
      if (b.starts !== midStarts) restartBad.push(key);
      const gained = b.starts - before.starts;
      chk(gained >= 1 && gained <= 2, key + ' starts once on approach (Δstarts=' + gained + ')');
    }

    // Handover between two different cabinets should be one start, not a burst
    await atFront('monkey');
    await p.waitForFunction(() => window.__cabMusic.cur === 'monkey', null, { timeout: 8000 });
    await p.waitForTimeout(500);
    const h0 = await snap();
    await atFront('nova');
    await p.waitForFunction(() => window.__cabMusic.cur === 'nova', null, { timeout: 8000 });
    await p.waitForTimeout(1800);
    const h1 = await snap();
    chk(h1.cur === 'nova', 'handover lands on nova ' + JSON.stringify(h1));
    chk(h1.starts - h0.starts <= 2, 'handover does not thrash (starts ' + h0.starts + ' -> ' + h1.starts + ')');
    chk(h1.bufCount <= 1, 'one-song cache after handover settles ' + h1.bufCount + ' ' + (h1.cached || []).join(','));

    await atSpawn();
    await p.waitForTimeout(1800);
    const left = await snap();
    chk(!left.cur && !left.want, 'leaving cabinets stops cabinet music ' + JSON.stringify(left));

    chk(o.errors.filter(e => !/supabase/i.test(e)).length === 0, 'no unexpected page errors ' + o.errors.slice(0, 3).join(' | '));
    if (restartBad.length) chk(false, 'restarted while still: ' + restartBad.join(','));
  } finally {
    await o.close();
  }
  console.log(ok ? 'ALL PASS' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message); process.exit(1); });
