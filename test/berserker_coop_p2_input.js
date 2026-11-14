// t847u/v227: two-process real-touch regression for the Berserker guest-stick mapping.
// On the P2 / guest screen the joystick was driving P1 while P2 drifted. This test uses two
// separate Chromium processes (real __mpLive relay), real pointer events on #joy, both join
// orders, and checks on BOTH screens: the guest's own Viking moves in the stick direction,
// P1 stays put; the reverse for host input; P2 does not drift with no input.
// NOSHOTS=1 node test/berserker_coop_p2_input.js
// GA_URL=https://optimusgrok.github.io/galactic-arcade/index.html NOSHOTS=1 node test/berserker_coop_p2_input.js
const { chromium } = require('/workspace/burrow-buster/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.GA_ROOT || path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };
const VIEW = { width: 390, height: 844 };
const DELAY_MS = Number(process.env.JOIN_DELAY_MS || 12000);
let ok = true;
const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 900) : '')); if (!c) ok = false; };

function serve() {
  return new Promise(r => {
    const s = http.createServer((q, res) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
    });
    s.listen(0, () => r(s));
  });
}

(async () => {
  const srv = await serve();
  const url = process.env.GA_URL || `http://localhost:${srv.address().port}/index.html`;
  const chromeBins = ['/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ungoogled-chromium/chrome'];
  const executablePath = chromeBins.find(f => fs.existsSync(f));
  const tag = Date.now().toString(36);
  const browsers = [];

  async function make(name, id) {
    const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    browsers.push(browser);
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(({ name, id }) => {
      window.__skipStart = 1; window.__noUnloadWarn = 1; window.__noRandomRoom = 1;
      window.__mpLive = true; window.__mpId = id;
      try {
        localStorage.setItem('galacticarcade.player', JSON.stringify({ name, char: name === 'HostP1' ? 'monkey' : 'alien', hoodie: 'navy', suit: 'suitgrey' }));
        localStorage.setItem('neonarcade.mpId', id);
        localStorage.setItem('neonarcade.mpName', name);
        localStorage.setItem('neonarcade.mute', '1');
        localStorage.setItem('neonarcade.tickets', '20');
        localStorage.setItem('neonarcade.vikingTickets', '3');
      } catch (e) {}
    }, { name, id });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
    await page.goto(url, { timeout: 180000 });
    const ready = await page.waitForFunction(() => window.__arcade && window.__arcade.stats.frames > 3, null, { timeout: 120000 }).then(() => true).catch(() => false);
    if (!ready) throw new Error(name + ' arcade did not start');
    return { name, id, page, ctx, browser, errors };
  }

  const p1 = await make('HostP1', 't847a' + tag);
  const p2 = await make('JoinP2', 't847b' + tag);

  async function waitMp(ph) {
    const on = await ph.page.waitForFunction(() => window.__mp && window.__mp.state === 'on', null, { timeout: 40000 }).then(() => true).catch(() => false);
    const st = await ph.page.evaluate(() => window.__mp && { state: window.__mp.state, reason: window.__mp.reason, count: window.__mp.count, id: window.__mp.id });
    chk(on && st && st.state === 'on', ph.name + ' joins the real MP room', st);
    return on;
  }
  await waitMp(p1); await waitMp(p2);

  async function startCab(ph) {
    await ph.page.evaluate(() => { const P = window.__arcade.play; P.start(P.machines.berserker); });
    await ph.page.waitForFunction(() => {
      const P = window.__arcade.play, f = document.getElementById('game');
      return P && P.mode === 'game' && P.sub === 'demo' && f && f.classList.contains('on') && f.contentWindow && f.contentWindow.__B && f.contentWindow.__bzCoop;
    }, null, { timeout: 90000 });
  }
  async function tryPlay(ph) {
    await ph.page.evaluate(() => { const P = window.__arcade.play; P.tickets.total = 20; P.machines.berserker.credits = 1; P.tryPlay(); });
    chk(await ph.page.evaluate(() => window.__arcade.play.sub) === 'play', ph.name + ' starts a credited Berserker game');
    await ph.page.evaluate(() => { try { document.getElementById('game').contentWindow.__B.cheat.inv = true; } catch (e) {} });
  }
  const net = ph => ph.page.evaluate(() => {
    const f = document.getElementById('game'), w = f && f.contentWindow, C = w && w.__bzCoop, M = window.__mp, G = w && w.__B && w.__B.G && w.__B.G();
    const h = C && C.hud && C.hud();
    let J = null, I2 = null;
    try { const W = C && C.world && C.world(); J = W && W.J && { x: +W.J.x, y: +W.J.y, id: W.J.id }; I2 = C.I2 && { x: +C.I2.x, y: +C.I2.y, tx: C.I2.tx, ty: C.I2.ty }; } catch (e) {}
    return {
      role: C && C.role, slot: C && C.slot, p2on: C && C.p2on, locked: C && C.locked, stoleHost: !!(C && C.stoleHost),
      snaps: C && C.snaps, ins: C && C.ins, snapAge: C && C.snapAge, typ: C && C.typ,
      state: G && G.state, warp: G && +((G.warp || 0).toFixed(2)), inP2: !!(C && C.inP2),
      p1: h && h.p1, p2: h && h.p2, J, I2
    };
  });
  async function waitIntro(ph) {
    await ph.page.waitForFunction(() => {
      const w = document.getElementById('game') && document.getElementById('game').contentWindow;
      return w && w.__B && w.__B.G && w.__B.G().state === 'play';
    }, null, { timeout: 15000 }).catch(() => {});
  }
  async function waitPlay(ph) {
    await ph.page.waitForFunction(() => {
      const w = document.getElementById('game') && document.getElementById('game').contentWindow;
      const G = w && w.__B && w.__B.G && w.__B.G();
      return G && G.state === 'play' && !(G.warp > 0.05);
    }, null, { timeout: 12000 }).catch(() => {});
  }
  async function quietWorld(ph) {
    // freeze waves so knockback cannot masquerade as stick mapping / drift
    await ph.page.evaluate(() => {
      const w = document.getElementById('game').contentWindow;
      try { w.__B.ens().splice(0, w.__B.ens().length); } catch (e) {}
      try { const G = w.__B.G(); G.spawnT = 9999; G.wS = 999; } catch (e) {}
    });
  }
  async function holdJoy(ph, dir) {
    return ph.page.evaluate(dir => {
      const f = document.getElementById('game'), w = f && f.contentWindow, doc = f && f.contentDocument;
      const joy = doc && doc.getElementById('joy');
      if (!joy) return { ok: false, why: 'no #joy' };
      if (joy.classList.contains('off')) return { ok: false, why: 'joy off', state: w.__B && w.__B.G && w.__B.G().state };
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const tx = cx + (dir.x || 0) * r.width * 0.42, ty = cy + (dir.y || 0) * r.height * 0.42;
      const fire = (type, x, y) => {
        const ev = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 17, pointerType: 'touch', clientX: x, clientY: y, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, view: w, isPrimary: true });
        joy.dispatchEvent(ev);
      };
      fire('pointerdown', cx, cy);
      fire('pointermove', tx, ty);
      w.__joyHold = setInterval(() => fire('pointermove', tx, ty), 32);
      const J = w.__bzCoop && w.__bzCoop.world && w.__bzCoop.world().J;
      return { ok: true, J: J && { x: +J.x.toFixed(3), y: +J.y.toFixed(3) } };
    }, dir);
  }
  async function releaseJoy(ph) {
    await ph.page.evaluate(() => {
      const f = document.getElementById('game'), w = f && f.contentWindow, doc = f && f.contentDocument;
      const joy = doc && doc.getElementById('joy');
      try { if (w.__joyHold) clearInterval(w.__joyHold); w.__joyHold = 0; } catch (e) {}
      if (!joy) return;
      const r = joy.getBoundingClientRect();
      const ev = new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 17, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, buttons: 0, view: w, isPrimary: true });
      joy.dispatchEvent(ev);
    });
  }
  function delta(a, b) { return { dx: (b.x || 0) - (a.x || 0), dy: (b.y || 0) - (a.y || 0), d: Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0)) }; }
  async function holdAndMeasure(driver, observer, dir, holdMs) {
    await quietWorld(driver); if (observer) await quietWorld(observer);
    const beforeD = await net(driver), beforeO = observer ? await net(observer) : null;
    const held = await holdJoy(driver, dir);
    await driver.page.waitForTimeout(holdMs || 1600);
    const afterD = await net(driver), afterO = observer ? await net(observer) : null;
    await releaseJoy(driver);
    await driver.page.waitForTimeout(250);
    return {
      held, beforeD, afterD, beforeO, afterO,
      dP1: { self: delta(beforeD.p1 || {}, afterD.p1 || {}), obs: afterO ? delta(beforeO.p1 || {}, afterO.p1 || {}) : null },
      dP2: { self: delta(beforeD.p2 || {}, afterD.p2 || {}), obs: afterO ? delta(beforeO.p2 || {}, afterO.p2 || {}) : null }
    };
  }
  function along(del, dir) { return (del.dx * (dir.x || 0)) + (del.dy * (dir.y || 0)); }

  async function exitCab(ph) {
    await ph.page.evaluate(() => { try { window.__arcade.play.exit('x'); } catch (e) {} });
    await ph.page.waitForFunction(() => window.__arcade.play.mode === 'walk' && !document.getElementById('game'), null, { timeout: 120000 }).catch(() => {});
    await ph.page.waitForTimeout(400);
  }

  async function runMapping(label, hostPh, guestPh) {
    const a0 = await net(hostPh), b0 = await net(guestPh);
    console.log(label + ' host', JSON.stringify({ role: a0.role, slot: a0.slot, p2on: a0.p2on, stoleHost: a0.stoleHost, inP2: a0.inP2, p1: a0.p1, p2: a0.p2 }).slice(0, 700));
    console.log(label + ' guest', JSON.stringify({ role: b0.role, slot: b0.slot, p2on: b0.p2on, stoleHost: b0.stoleHost, snaps: b0.snaps, snapAge: b0.snapAge, p1: b0.p1, p2: b0.p2 }).slice(0, 700));
    chk(a0.role === 'host' && a0.p2on && a0.p2 && a0.p2.alive, label + ': host still hosts with P2 in the game', a0);
    chk(b0.role === 'guest' && b0.p2on && b0.snaps > 0 && !b0.stoleHost, label + ': the late/P2 phone is a guest (did not steal the sim)', b0);
    chk(a0.role !== b0.role, label + ': the two phones are not both host', { a: a0.role, b: b0.role });

    await waitPlay(hostPh); await waitPlay(guestPh);
    await hostPh.page.waitForTimeout(400);
    await quietWorld(hostPh); await quietWorld(guestPh);

    const idle0H = await net(hostPh), idle0G = await net(guestPh);
    await guestPh.page.waitForTimeout(1500);
    const idle1H = await net(hostPh), idle1G = await net(guestPh);
    const driftH = delta(idle0H.p2 || {}, idle1H.p2 || {}), driftG = delta(idle0G.p2 || {}, idle1G.p2 || {});
    const driftP1H = delta(idle0H.p1 || {}, idle1H.p1 || {});
    chk(driftH.d < 16 && driftG.d < 16, label + ': P2 does not drift with no input', { driftH, driftG, driftP1H, idle0H: idle0H.p2, idle1H: idle1H.p2 });

    const right = { x: 1, y: 0 };
    const gMove = await holdAndMeasure(guestPh, hostPh, right, 1600);
    console.log(label + ' guest stick', JSON.stringify({ held: gMove.held, dP2: gMove.dP2, dP1: gMove.dP1, roleG: gMove.afterD.role, roleH: gMove.afterO && gMove.afterO.role, J: gMove.afterD.J, I2: gMove.afterO && gMove.afterO.I2, stole: [gMove.afterD.stoleHost, gMove.afterO && gMove.afterO.stoleHost] }).slice(0, 900));
    chk(gMove.held && gMove.held.ok && gMove.held.J && Math.abs(gMove.held.J.x) > 0.2, label + ': guest #joy accepted a real pointer press and J.x is held right', gMove.held);
    chk(along(gMove.dP2.self, right) > 40 && gMove.dP2.self.d > 40, label + ': guest screen shows the guest Viking (P2) moving in the stick direction', gMove.dP2.self);
    chk(along(gMove.dP2.obs, right) > 40 && gMove.dP2.obs.d > 40, label + ': host screen shows P2 moving in the guest stick direction', gMove.dP2.obs);
    chk(gMove.dP1.self.d < 24 && gMove.dP1.obs.d < 24, label + ': P1 stays put on both screens while the guest stick is held', { self: gMove.dP1.self, obs: gMove.dP1.obs });
    chk(gMove.afterD.role === 'guest' && gMove.afterO.role === 'host', label + ': roles stay host/guest while the guest stick is held', { g: gMove.afterD.role, h: gMove.afterO.role, stole: gMove.afterD.stoleHost });

    await guestPh.page.waitForTimeout(400);
    const down = { x: 0, y: 1 };
    const hMove = await holdAndMeasure(hostPh, guestPh, down, 1600);
    console.log(label + ' host stick', JSON.stringify({ held: hMove.held, dP1: hMove.dP1, dP2: hMove.dP2 }).slice(0, 800));
    chk(hMove.held && hMove.held.ok && hMove.held.J && Math.abs(hMove.held.J.y) > 0.2, label + ': host #joy accepted a real pointer press and J.y is held down', hMove.held);
    chk(along(hMove.dP1.self, down) > 40 && hMove.dP1.self.d > 40, label + ': host screen shows P1 moving in the host stick direction', hMove.dP1.self);
    chk(along(hMove.dP1.obs, down) > 40 && hMove.dP1.obs.d > 40, label + ': guest screen shows P1 moving in the host stick direction', hMove.dP1.obs);
    chk(hMove.dP2.self.d < 24 && hMove.dP2.obs.d < 24, label + ': P2 stays put on both screens while the host stick is held', { self: hMove.dP2.self, obs: hMove.dP2.obs });
  }

  // ---- case A: HostP1 starts, waits, JoinP2 joins (typical P2-screen late joiner) ----
  await startCab(p1);
  await tryPlay(p1);
  await waitIntro(p1);
  await p1.page.waitForTimeout(DELAY_MS);
  await startCab(p2);
  await tryPlay(p2);
  await p1.page.waitForFunction(() => { const C = document.getElementById('game').contentWindow.__bzCoop; return C && C.role === 'host' && C.p2on; }, null, { timeout: 20000 }).catch(() => {});
  await p2.page.waitForFunction(() => { const C = document.getElementById('game').contentWindow.__bzCoop; return C && C.role === 'guest' && C.snaps > 0 && C.p2on; }, null, { timeout: 20000 }).catch(() => {});
  await p2.page.waitForTimeout(2000);
  await runMapping('A P2 joins after P1', p1, p2);
  await exitCab(p1); await exitCab(p2);

  // ---- case B: JoinP2 starts first, HostP1 joins after DELAY (first starter hosts) ----
  await startCab(p2);
  await tryPlay(p2);
  await waitIntro(p2);
  await p2.page.waitForTimeout(DELAY_MS);
  await startCab(p1);
  await tryPlay(p1);
  await p2.page.waitForFunction(() => { const C = document.getElementById('game').contentWindow.__bzCoop; return C && ((C.role === 'host' && C.p2on) || (C.role === 'guest' && C.snaps > 0)); }, null, { timeout: 20000 }).catch(() => {});
  await p1.page.waitForFunction(() => { const C = document.getElementById('game').contentWindow.__bzCoop; return C && ((C.role === 'host' && C.p2on) || (C.role === 'guest' && C.snaps > 0)); }, null, { timeout: 20000 }).catch(() => {});
  await p1.page.waitForTimeout(2000);
  const bFirst = await net(p2), bLate = await net(p1);
  chk(bFirst.role === 'host' && bLate.role === 'guest', 'B the first starter hosts, the late phone is guest', { first: bFirst.role, late: bLate.role, firstSlot: bFirst.slot, lateSlot: bLate.slot });
  await runMapping('B HostP1 joins after JoinP2', p2, p1);

  const realErr = (p1.errors.concat(p2.errors)).filter(e => !/Failed to load resource|net::ERR_FAILED|net::ERR_ABORTED/i.test(e));
  chk(realErr.length === 0, 'no page errors ' + realErr.join(' | '));

  await p1.ctx.close().catch(() => {}); await p2.ctx.close().catch(() => {});
  for (const br of browsers) await br.close().catch(() => {});
  srv.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message + '\n' + e.stack); process.exit(1); });
