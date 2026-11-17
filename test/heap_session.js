// t882u / v249: JS heap must stay bounded over a long walk + open/close session
// (rooms, Strike, Chess × 10). node test/heap_session.js
const { open } = require('./lib');
const N = 10;
let ok = true;
const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 500) : '')); if (!c) ok = false; };

(async () => {
  const o = await open({ w: 844, h: 390 }), page = o.page, cdp = await page.context().newCDPSession(page);
  page.setDefaultTimeout(90000);
  await page.evaluate(() => { const s = document.getElementById('start'); if (s) s.remove(); if (window.__start) window.__start.dismissed = true; });
  await page.waitForFunction(() => window.__arcade && window.__arcade.play && window.__arcade.stats.frames > 10, null, { timeout: 90000 });
  await page.evaluate(() => Promise.resolve(window.__arcade.shopReady).catch(() => {}));
  await page.waitForFunction(() => window.__chess, null, { timeout: 90000 });

  const gc = async () => {
    try { await cdp.send('HeapProfiler.enable'); } catch (e) {}
    for (let i = 0; i < 3; i++) {
      try { await cdp.send('HeapProfiler.collectGarbage'); } catch (e) {}
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  const snap = async (tag) => {
    await gc();
    const s = await page.evaluate((tag) => {
      const A = window.__arcade, r = A.renderer;
      const geos = new Set(), mats = new Set(), texs = new Set();
      let meshes = 0;
      A.scene.traverse(o => {
        if (!o.isMesh) return;
        meshes++;
        if (o.geometry) geos.add(o.geometry);
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m) {
          mats.add(m);
          for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) texs.add(v); }
        }
      });
      const mem = performance.memory || null;
      return {
        tag, frames: A.stats.frames,
        iframes: document.querySelectorAll('iframe').length,
        game: !!document.getElementById('game'),
        chessFr: document.querySelectorAll('#chessOv iframe').length,
        poolFr: document.querySelectorAll('#poolOv iframe').length,
        meshes, geos: geos.size, mats: mats.size, texs: texs.size,
        rinfo: r ? { tex: r.info.memory.textures, geo: r.info.memory.geometries, prog: (r.info.programs || []).length } : null,
        usedMb: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(2) : null,
        said: (window.__grokVisit && window.__grokVisit.said && window.__grokVisit.said.length) || 0
      };
    }, tag);
    let metrics = null;
    try { await cdp.send('Performance.enable'); metrics = await cdp.send('Performance.getMetrics'); } catch (e) {}
    if (metrics && metrics.metrics) {
      const used = metrics.metrics.find(m => m.name === 'JSHeapUsedSize');
      s.cdpMb = used ? +(used.value / 1048576).toFixed(2) : null;
    }
    console.log('SNAP ' + JSON.stringify(s));
    return s;
  };

  const walk = async () => {
    await page.evaluate(() => {
      const A = window.__arcade, pos = [
        [0, 0, 5], [6, 0, 4], [-6, 0, 4], [-8, 0, -6], [0, 0, -10],
        [0, 0, A.Z2 || -26], [4, 0, (A.Z2 || -26) + 4], [0, 0, 5], [80, 0, 0], [0, 0, 5]
      ];
      for (const [x, y, z] of pos) { A.monkey.position.set(x, y, z); A.st.vel.set(0, 0, 0); for (let i = 0; i < 12; i++) A.step(1 / 60); }
    });
  };

  const openCloseStrike = async () => {
    await page.evaluate(() => { const P = window.__arcade.play; P.start(P.machines.strike); });
    await page.waitForFunction(() => { const P = window.__arcade.play; return P.mode === 'game' && document.getElementById('bExit') && document.getElementById('bExit').style.display === 'block'; }, null, { timeout: 90000 });
    await page.evaluate(() => { const P = window.__arcade.play; P.machines.strike.credits = 1; P.tryPlay(); });
    await page.waitForTimeout(350);
    await page.evaluate(() => window.__arcade.play.exit('heap'));
    await page.waitForFunction(() => window.__arcade.play.mode === 'walk' && !document.getElementById('game'), null, { timeout: 30000 });
  };

  const openCloseChess = async () => {
    await page.waitForFunction(() => {
      const A = window.__arcade, C = window.__chess;
      C.fast = true;
      const WX = (window.__tp && window.__tp.whiteRoom && window.__tp.whiteRoom.position.x) || 80;
      A.monkey.position.set(WX + C.TX - 1.0, 0, C.TZ);
      A.st.vel.set(0, 0, 0); if (A.st.fly) A.st.fly.air = false; A.st.jump = null;
      A.step(1 / 60);
      return C.gstate === 'home' && C.state === 'idle' && C.near;
    }, null, { timeout: 30000 });
    await page.evaluate(() => window.__chess.play());
    await page.waitForFunction(() => window.__chess.open && window.__chess.frame, null, { timeout: 60000 });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__chess.leave('heap'));
    await page.waitForFunction(() => window.__chess.state === 'idle' && !window.__chess.frame, null, { timeout: 30000 });
  };

  const cycle = async (n) => {
    const times = { strike: 0, chess: 0, err: [] };
    for (let i = 0; i < n; i++) {
      try { await openCloseStrike(); times.strike++; } catch (e) { times.err.push('strike' + i + ':' + e.message); }
      try { await openCloseChess(); times.chess++; } catch (e) { times.err.push('chess' + i + ':' + e.message); }
    }
    return times;
  };

  await walk();
  // warmup: first visit compiles shop / cabinet shaders and uploads their GPU resources
  const warm = await cycle(1);
  chk(warm.strike === 1 && warm.chess === 1 && !warm.err.length, 'warmup opened and closed Strike and Chess once', warm);
  const before = await snap('after-warmup');

  const times = await cycle(N);
  chk(times.strike === N && times.chess === N && !times.err.length, 'opened and closed Strike and Chess ' + N + ' times', times);
  await walk();
  await page.waitForTimeout(1500);
  const after = await snap('after-session');

  const dCdp = (before.cdpMb != null && after.cdpMb != null) ? +(after.cdpMb - before.cdpMb).toFixed(2) : null;
  const dUsed = (before.usedMb != null && after.usedMb != null) ? +(after.usedMb - before.usedMb).toFixed(2) : null;
  const growth = { dCdp, dUsed, dIframes: after.iframes - before.iframes, dMeshes: after.meshes - before.meshes, dGeos: after.geos - before.geos, dMats: after.mats - before.mats, dRgeo: after.rinfo.geo - before.rinfo.geo, dRtex: after.rinfo.tex - before.rinfo.tex, dProg: after.rinfo.prog - before.rinfo.prog };
  console.log('GROWTH ' + JSON.stringify(growth));

  chk(after.iframes === before.iframes && !after.game && after.chessFr === 0, 'no leftover play/chess iframes (count back to baseline)', { before: before.iframes, after: after.iframes, game: after.game, chessFr: after.chessFr });
  chk(Math.abs(after.meshes - before.meshes) <= 8 && Math.abs(after.geos - before.geos) <= 8, 'scene mesh/geometry counts stay flat', { before: [before.meshes, before.geos], after: [after.meshes, after.geos] });
  // After warmup, JS heap growth over 10 more open/close cycles should stay modest (AudioContexts / WebGL / detached iframes used to add tens of MB).
  const heap = dCdp != null ? dCdp : dUsed;
  chk(heap != null && heap < 20, 'JS heap growth after warmup stays under 20 MB over 10 Strike+Chess cycles', { heap, dCdp, dUsed });
  chk((after.said || 0) <= 80, 'Grok said-log is capped', { said: after.said });

  await o.close();
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message + '\n' + e.stack); process.exit(1); });
