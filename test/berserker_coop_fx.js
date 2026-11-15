// t849u/v228: Thor / rage / Odin must appear on the OTHER player's screen even when typ:'fx'
// is dropped and typ:'st' is delayed (70 ms cap, relay jitter). FX ride in snapshots with a
// duration and are replayed once, including Thor lightning bolts. Also checks P2 visibility
// and movement under that lag, and the #bzDbg status line (version / role / p2on / snapAge).
// NOSHOTS=1 node test/berserker_coop_fx.js
// GA_URL=https://optimusgrok.github.io/galactic-arcade/index.html NOSHOTS=1 node test/berserker_coop_fx.js
const { open } = require('./lib');
const mock = require('./mpmock');
const { chromium } = require('/workspace/burrow-buster/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const LIVE = !!process.env.GA_URL;
const DELAY_ST = Number(process.env.FX_LAG_MS || 320);
let ok = true;
const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 700) : '')); if (!c) ok = false; };

if (!LIVE) {
  (async () => {
    const pages = [], devs = [];
    async function dev(id, name, look) {
      const o = await open({ phone: true, w: 390, h: 844 }); const p = o.page; p.setDefaultTimeout(60000);
      await p.exposeFunction('__mpRelay', m => {
        for (const q of pages) if (q !== p) q.evaluate(x => window.__mpRecv && window.__mpRecv(JSON.parse(x)), m).catch(() => {});
      });
      await p.addInitScript(([id, name, look]) => {
        window.__mpId = id;
        localStorage.setItem('galacticarcade.player', JSON.stringify(Object.assign({ name }, look)));
        localStorage.setItem('neonarcade.mute', '1');
        localStorage.setItem('neonarcade.tickets', '20');
        localStorage.setItem('neonarcade.vikingTickets', '3');
      }, [id, name, look]);
      await p.addInitScript(mock); pages.push(p); devs.push(o); await p.reload();
      await p.waitForFunction(() => window.__arcade && window.__arcade.stats.frames > 3 && window.__mp && window.__mp.state === 'on', null, { timeout: 60000 });
      return p;
    }
    const a = await dev('aaaa1111', 'Dave', { char: 'monkey', hoodie: 'navy' });
    const b = await dev('bbbb2222', 'Zed', { char: 'alien', suit: 'suitgrey' });
    for (const p of [a, b]) await p.waitForFunction(() => window.__mp.peers.size === 1, null, { timeout: 20000 }).catch(() => {});

    const cab = await a.evaluate(() => { const u = window.__arcade.berserkerCab.userData; return { f: [u.front.x, u.front.z], fc: [u.facing.x, u.facing.z] }; });
    const put = (p, back, side) => p.evaluate(([cab, back, side]) => { const m = window.__arcade.monkey, [fx, fz] = cab.f, [cx, cz] = cab.fc; m.position.set(fx - cx * back + cz * side, 0, fz - cz * back - cx * side); m.rotation.y = Math.atan2(cx, cz); }, [cab, back, side]);
    await put(a, 0.9, 1.2); await put(b, 1.2, -1.2);

    const startCab = p => p.evaluate(() => { const P = window.__arcade.play; P.start(P.machines.berserker); });
    await startCab(a); await a.waitForFunction(() => window.__arcade.play.mode === 'game', null, { timeout: 30000 });
    await startCab(b); await b.waitForFunction(() => window.__arcade.play.mode === 'game', null, { timeout: 30000 });
    for (const p of [a, b]) await p.waitForFunction(() => { const f = document.getElementById('game'); return f && f.contentWindow && f.contentWindow.__B && f.contentWindow.__bzCoop; }, null, { timeout: 60000 });

    const S = (p, fn, arg) => p.evaluate(([fn, arg]) => { const w = document.getElementById('game').contentWindow; return (new Function('B', 'C', 'w', 'arg', fn))(w.__B, w.__bzCoop, w, arg); }, [fn, arg]);
    const play = p => p.evaluate(() => { const P = window.__arcade.play; P.machines.berserker.credits = 1; P.tryPlay(); return P.sub; });

    chk(await play(a) === 'play', 'P1 spends a credit and starts a real Berserker game');
    await S(a, 'w.__B.cheat.inv = true; return w.__B.G().state;');
    await a.waitForTimeout(400);
    chk(await play(b) === 'play', 'P2 drops in while P1 is already playing');
    await S(b, 'w.__B.cheat.inv = true; return 1;');
    await b.waitForFunction(() => { const C = document.getElementById('game').contentWindow.__bzCoop; return C && C.role === 'guest' && C.snaps > 0 && C.p2on; }, null, { timeout: 20000 }).catch(() => {});
    await a.waitForFunction(() => { const C = document.getElementById('game').contentWindow.__bzCoop; return C && C.role === 'host' && C.p2on; }, null, { timeout: 12000 }).catch(() => {});
    for (const p of [a, b]) await p.waitForFunction(() => {
      const w = document.getElementById('game') && document.getElementById('game').contentWindow;
      const G = w && w.__B && w.__B.G && w.__B.G();
      return G && G.state === 'play' && !(G.warp > 0.8);
    }, null, { timeout: 12000 }).catch(() => {});
    await a.waitForTimeout(300);
    await S(a, 'C.steps(2); return 1;'); await S(b, 'C.steps(2); return 1;');

    const stA = await S(a, `const el = w.document.getElementById('bzDbg'); return { hud: C.hud(), txt: el && el.textContent, vis: el && el.style.display !== 'none', ver: C.ver || w.__GA_VER };`);
    const stB = await S(b, `const el = w.document.getElementById('bzDbg'); return { hud: C.hud(), txt: el && el.textContent, vis: el && el.style.display !== 'none', ver: C.ver || w.__GA_VER };`);
    chk(stA.vis && /v228/.test(stA.txt) && /host/.test(stA.txt) && /p2on/.test(stA.txt) && stA.hud.ver === 'v228',
      'host status line shows v228, role host, and p2on', stA);
    chk(stB.vis && /v228/.test(stB.txt) && /guest/.test(stB.txt) && /p2on/.test(stB.txt) && stB.hud.ver === 'v228',
      'guest status line shows v228, role guest, and p2on', stB);

    const paint0 = await S(a, 'return { p1: C.paintOf(1), p2: C.paintOf(2), drawn: C.drawn };');
    const paint0b = await S(b, 'return { p1: C.paintOf(1), p2: C.paintOf(2), drawn: C.drawn };');
    chk(paint0.p2 && paint0.p2.on && paint0.p2.hits > 8, 'host canvas paints P2 (pixels) before lag', paint0);
    chk(paint0b.p2 && paint0b.p2.on && paint0b.p2.hits > 8, 'guest canvas paints P2 (pixels) before lag', paint0b);

    // Drop typ:'fx' and delay typ:'st' on the guest — this is the live failure mode.
    await S(b, `C.injectLag({ dropFx: true, delaySt: ${DELAY_ST} }); return { lag: C.lagDelaySt, drop: C.lagDropFx };`);

    const x0 = (await S(a, 'return C.hud().p2.x;'));
    await S(b, 'w.eval("J.x=1;J.y=0"); C.I2.x = 1; C.I2.y = 0; C.sendInput(); C.steps(2); return 1;');
    for (let i = 0; i < 8; i++) { await S(a, 'C.steps(6); return 1;'); await S(b, 'w.eval("J.x=1;J.y=0"); C.I2.x = 1; C.I2.y = 0; C.sendInput(); C.steps(2); return 1;'); await a.waitForTimeout(70); }
    await a.waitForTimeout(DELAY_ST + 80);
    const movedA = await S(a, 'return C.hud().p2.x;');
    const movedB = await S(b, 'return C.hud().p2.x;');
    chk(movedA > x0 + 8 && movedB > x0 + 8, 'under lag, P2 still moves on both screens', { x0, movedA, movedB, DELAY_ST });
    await S(b, 'w.eval("J.x=0;J.y=0"); C.I2.x = 0; C.I2.y = 0; C.sendInput(); return 1;');

    async function fire(who, kind) {
      await S(a, 'C.fxLog = []; C.fxSent = 0; C.fxApplied = {}; return 1;');
      await S(b, 'C.fxLog = []; C.fxGot = 0; C.fxApplied = {}; C.world().bolts.length = 0; return { dropped: C.fxDropped || 0 };');
      const cmd = kind === 'thor' ? `C.forceThor(${who});` : kind === 'rage' ? `C.forceRage(${who});` : `C.forceOdin(${who});`;
      const emitted = await S(a, cmd + ' const live = (C.fxLive || []).map(e => e.typ); C.sendStateNow && C.sendStateNow(); return { live, last: C.lastFx && C.lastFx.typ, sent: C.fxSent, packed: (typeof packFx === "function") ? null : (C.fxLive || []).length };');
      await a.waitForTimeout(DELAY_ST + 220);
      await S(b, 'C.steps(2); return 1;');
      return emitted;
    }

    await S(a, `const P = C.world().P; const ens = w.__B.ens(); ens.push({ x: P.x + 30, y: P.y, r: 12, hp: 8, type: 'skeleton', dmg: 1, max: 8, face: 0, t: 0, cd: 0, flash: 0, st: 0 }); return ens.length;`);
    const emitted = await fire(1, 'thor');
    const thB = await S(b, `const bolts = C.world().bolts || [];
      const sm = bolts[0] ? C.sampleAt(bolts[0].x, bolts[0].y - 40, 28) : { hits: 0 };
      const el = w.document.getElementById('bzDbg');
      return { bolts: bolts.length, fx: (C.fxLog || []).map(e => e.typ), got: C.fxGot || 0, dropped: C.fxDropped || 0, px: sm, status: el && el.textContent, flash: w.__B.G().flash, last: C.lastFx && C.lastFx.typ };`);
    const thA = await S(a, `const bolts = C.world().bolts || []; return { bolts: bolts.length, sent: C.fxSent || 0, log: (C.fxLog || []).map(e => e.typ), liveNow: (C.fxLive || []).map(e => e.typ), last: C.lastFx && C.lastFx.typ };`);
    chk(emitted.sent > 0 && emitted.live.includes('thor') && emitted.last === 'thor', 'P1 Thor is recorded in host snapshots (fxLive)', { emitted, thA });
    chk(thB.dropped > 0, 'guest actually dropped typ:fx (one-shot never arrived)', thB);
    chk(thB.got > 0 && thB.fx.includes('thor') && (thB.bolts > 0 || thB.px.hits > 0 || thB.flash > 0),
      'P1 Thor still appears on the guest after typ:fx is dropped and typ:st is delayed', thB);
    chk(thB.status && /thor/.test(thB.status), 'guest status line mentions the Thor fx', thB.status);

    await fire(2, 'rage');
    const rgA = await S(a, 'const p2 = C.P2(); const px = p2 ? C.sampleAt(p2.x, p2.y - 4, 28) : { hits: 0 }; return { p2rage: C.hud().p2.rage, sent: C.fxSent || 0, log: (C.fxLog || []).map(e => e.typ), px };');
    const rgB = await S(b, 'const p2 = C.P2(); const px = p2 ? C.sampleAt(p2.x, p2.y - 4, 28) : { hits: 0 }; return { p2rage: C.hud().p2.rage, got: C.fxGot || 0, log: (C.fxLog || []).map(e => e.typ), px, dropped: C.fxDropped || 0 };');
    chk(rgA.p2rage > 0 && rgA.log.includes('rage') && rgA.px.hits > 8, 'P2 rage activates on the host and is painted around P2', rgA);
    chk(rgB.p2rage > 0 && rgB.log.includes('rage') && rgB.px.hits > 8, 'P2 rage is visible on the guest after typ:fx drop + delayed typ:st', rgB);

    await fire(1, 'odin');
    const odA = await S(a, 'const rv = C.world().ravens || []; const sm = rv[0] ? C.sampleAt(rv[0].x, rv[0].y, 16) : { hits: 0 }; return { n: rv.length, sent: C.fxSent || 0, log: (C.fxLog || []).map(e => e.typ), odS: w.__B.G().odS, px: sm };');
    const odB = await S(b, 'const rv = C.world().ravens || []; const sm = rv[0] ? C.sampleAt(rv[0].x, rv[0].y, 16) : { hits: 0 }; return { n: rv.length, got: C.fxGot || 0, log: (C.fxLog || []).map(e => e.typ), odS: w.__B.G().odS, px: sm };');
    chk(odA.log.includes('odin') && (odA.n > 0 || odA.odS > 0), 'P1 Odin activates on the host (ravens / timer)', odA);
    chk((odB.log.includes('odin') || odB.n > 0 || odB.odS > 0) && (odB.n === 0 || odB.px.hits > 0 || odB.odS > 0),
      'P1 Odin is seen on the guest after typ:fx drop + delayed typ:st', odB);

    const iframe = await a.evaluate(() => { const f = document.getElementById('game'); return f && f.src; });
    chk(iframe && /[?&]ga=v228\b/.test(iframe), 'cabinet iframe is cache-busted with ?ga=v228', iframe);

    for (const o of devs) await o.close();
    if (!ok) process.exit(1);
    console.log('ALL PASS');
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  // Live two-process path: real MP, inject lag on the guest after join, then force FX.
  (async () => {
    const ROOT = process.env.GA_ROOT || path.resolve(__dirname, '..');
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' };
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
    const srv = await serve();
    const url = process.env.GA_URL;
    const chromeBins = ['/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ungoogled-chromium/chrome'];
    const executablePath = chromeBins.find(f => fs.existsSync(f));
    const tag = Date.now().toString(36);
    const browsers = [];
    const VIEW = { width: 390, height: 844 };
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
      await page.goto(url, { timeout: 180000 });
      const ready = await page.waitForFunction(() => window.__arcade && window.__arcade.stats.frames > 3, null, { timeout: 120000 }).then(() => true).catch(() => false);
      if (!ready) throw new Error(name + ' arcade did not start');
      return { name, id, page, ctx, browser };
    }
    const p1 = await make('HostP1', 't849a' + tag);
    const p2 = await make('JoinP2', 't849b' + tag);
    const S = (ph, fn, arg) => ph.page.evaluate(([fn, arg]) => { const w = document.getElementById('game').contentWindow; return (new Function('B', 'C', 'w', 'arg', fn))(w.__B, w.__bzCoop, w, arg); }, [fn, arg]);
    async function waitMp(ph) {
      const on = await ph.page.waitForFunction(() => window.__mp && window.__mp.state === 'on', null, { timeout: 40000 }).then(() => true).catch(() => false);
      chk(on, ph.name + ' joins the real MP room');
    }
    await waitMp(p1); await waitMp(p2);
    async function startCab(ph) {
      await ph.page.evaluate(() => { const P = window.__arcade.play; P.start(P.machines.berserker); });
      await ph.page.waitForFunction(() => {
        const P = window.__arcade.play, f = document.getElementById('game');
        return P && P.mode === 'game' && f && f.contentWindow && f.contentWindow.__B && f.contentWindow.__bzCoop;
      }, null, { timeout: 90000 });
    }
    async function tryPlay(ph) {
      return ph.page.evaluate(() => { const P = window.__arcade.play; P.machines.berserker.credits = 1; P.tryPlay(); return P.sub; });
    }
    await startCab(p1); await startCab(p2);
    chk(await tryPlay(p1) === 'play', 'HostP1 starts');
    await S(p1, 'w.__B.cheat.inv = true; return 1;');
    await p1.page.waitForTimeout(800);
    chk(await tryPlay(p2) === 'play', 'JoinP2 joins');
    await S(p2, 'w.__B.cheat.inv = true; return 1;');
    await p2.page.waitForFunction(() => { const C = document.getElementById('game') && document.getElementById('game').contentWindow && document.getElementById('game').contentWindow.__bzCoop; return C && C.role === 'guest' && C.p2on; }, null, { timeout: 25000 }).catch(() => {});
    for (const ph of [p1, p2]) await ph.page.waitForFunction(() => {
      const w = document.getElementById('game') && document.getElementById('game').contentWindow;
      const G = w && w.__B && w.__B.G && w.__B.G();
      return G && G.state === 'play' && !(G.warp > 0.8);
    }, null, { timeout: 15000 }).catch(() => {});
    const st = await S(p2, `const el = w.document.getElementById('bzDbg'); return { txt: el && el.textContent, ver: C.ver, role: C.role, p2on: C.p2on };`);
    chk(st.role === 'guest' && st.p2on && /v228/.test(st.txt || st.ver || ''), 'live guest status line shows v228 + guest + p2on', st);
    await S(p2, `C.injectLag({ dropFx: true, delaySt: ${DELAY_ST} }); return 1;`);
    await S(p1, 'C.fxLog = []; C.fxSent = 0; return 1;');
    await S(p2, 'C.fxLog = []; C.fxGot = 0; C.world().bolts.length = 0; return 1;');
    await S(p1, 'C.forceThor(1); C.sendStateNow && C.sendStateNow(); return 1;');
    await p1.page.waitForTimeout(DELAY_ST + 280);
    const thB = await S(p2, `const bolts = C.world().bolts || []; const sm = bolts[0] ? C.sampleAt(bolts[0].x, bolts[0].y - 40, 28) : { hits: 0 }; return { bolts: bolts.length, fx: (C.fxLog || []).map(e => e.typ), got: C.fxGot || 0, dropped: C.fxDropped || 0, px: sm, flash: w.__B.G().flash };`);
    chk(thB.dropped > 0 || thB.got > 0, 'live guest either dropped typ:fx or still received an fx event', thB);
    chk(thB.fx.includes('thor') && (thB.bolts > 0 || thB.px.hits > 0 || thB.flash > 0),
      'live: P1 Thor is visible on the other screen after injected lag / typ:fx drop', thB);
    await S(p1, 'C.forceRage(2); C.sendStateNow && C.sendStateNow(); return 1;');
    await p1.page.waitForTimeout(DELAY_ST + 280);
    const rgB = await S(p2, 'const p2 = C.P2(); const px = p2 ? C.sampleAt(p2.x, p2.y - 4, 28) : { hits: 0 }; return { rage: C.hud().p2 && C.hud().p2.rage, log: (C.fxLog || []).map(e => e.typ), px };');
    chk(rgB.rage > 0 && (rgB.log.includes('rage') || rgB.px.hits > 8), 'live: P2 rage is visible on the guest after lag', rgB);
    await S(p1, 'C.forceOdin(1); C.sendStateNow && C.sendStateNow(); return 1;');
    await p1.page.waitForTimeout(DELAY_ST + 400);
    const odB = await S(p2, 'const rv = C.world().ravens || []; return { n: rv.length, log: (C.fxLog || []).map(e => e.typ), odS: w.__B.G().odS };');
    chk(odB.log.includes('odin') || odB.n > 0 || odB.odS > 0, 'live: P1 Odin is visible on the guest after lag', odB);
    for (const b of browsers) await b.close();
    srv.close();
    if (!ok) process.exit(1);
    console.log('ALL PASS');
  })().catch(e => { console.error(e); process.exit(1); });
}
