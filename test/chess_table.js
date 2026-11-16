// Chess table in the GROK SHOP (Dave via Arcade): big table + 2 chairs between the ACCESSORIES island and the pool tables, no overlap.
// Walk up -> ♟ PLAY CHESS -> the player sits, shop Grok walks over from the counter and sits opposite, the camera zooms onto the board and
// chess-play/index.html (arcade copy of Chess: medieval pieces, battles, robot hand, vs computer) opens; ✕ / Esc -> the player stands up, Grok
// walks back to the counter. Phone landscape emulator. NOSHOTS=1 skips screenshots. node test/chess_table.js
const { open } = require('./lib');
const fs = require('fs');
(async () => {
  const { page, errors, requests, close } = await open({ phone: true, w: 844, h: 390 }); let ok = true;
  const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const SH = process.env.NOSHOTS ? 0 : 1;
  const shot = async path => { if (!SH) return; if (fs.existsSync(path)) { console.log('skip existing shot ' + path); return; } await page.screenshot({ path }); console.log('shot ' + path); };
  const ev = (f, a) => page.evaluate(f, a);
  const frames = async n => { const f0 = await ev(() => window.__arcade.stats.frames); await page.waitForFunction(([f, n]) => window.__arcade.stats.frames > f + n, [f0, n], { timeout: 60000 }).catch(() => {}); };
  const center = async sel => ev(s => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
  await page.waitForFunction(() => window.__chess && window.__shop && window.__pool && window.__arcade, null, { timeout: 60000 });
  // ---- layout: between the wardrobe island and the pool tables, clear of both, far from the pad ----
  const g = await ev(() => { const C = window.__chess, S = window.__shop, t = S.G.getObjectByName('chessTable'), W = window.__tp.whiteRoom.position.x, P = window.__tp.PAD2, wd = S.wardrobe, pl = window.__pool;
    const parts = ['chessBoard', 'chessPiecesWhite', 'chessPiecesBlack', 'chessBody', 'chessCushions', 'chessChrome', 'chessNeon', 'chessLamp', 'chessSign'].filter(n => t.getObjectByName(n));
    const THREE = window.__arcade.THREE, bb = new THREE.Box3().setFromObject(t); bb.min.x -= W; bb.max.x -= W;
    const poolX0 = pl.PX - 0.78 - 0.16, wardX1 = wd.x + 0.08;
    return { parts, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, poolX0, wardX1, poolZ: [pl.PZ, pl.PZ2], wardZ: [wd.z - wd.w, wd.z + wd.w], padD: Math.hypot(W + C.TX - P.x, C.TZ - P.z),
      iframes: document.querySelectorAll('#chessOv iframe').length, obst: C.obst.length }; });
  console.log(JSON.stringify(g));
  chk(g.parts.length === 9, 'table, board, both piece sets, chairs, neon, lamp and sign built ' + g.parts.join(','));
  chk(g.x0 > g.wardX1 + 2 && g.x1 < g.poolX0 - 2, 'sits between the ACCESSORIES island and the pool tables with >2 m walkways each side');
  chk(g.z0 > g.wardZ[0] - 1 && g.z1 < 14 - 1 && g.padD > 10, 'level with the island / pool tables, away from the pad and the title wall');
  chk(g.iframes === 0, 'chess game not loaded until PLAY (lazy)');
  // ---- walk up: button ----
  await ev(() => { const A = window.__arcade, W = window.__tp.whiteRoom.position.x, C = window.__chess; A.monkey.position.set(W + C.TX - 0.4, 0, C.TZ - 1.9); A.st.vel.set(0, 0, 0);
  });
  await frames(4);   // shop.js resets the camera yaw once on arrival in the room; aim it after that
  await ev(() => { const A = window.__arcade; A.st.yaw = Math.PI + 0.5; A.st.face = A.st.yaw + Math.PI; A.st.pitch = 0.36; A.st.dist = 5.2; A.st.camInit = false; });
  await page.waitForFunction(() => !!document.querySelector('#chessBtn.on'), null, { timeout: 30000 }).catch(() => {});
  await frames(4); await page.waitForTimeout(1200);
  const b0 = await ev(() => ({ btn: !!document.querySelector('#chessBtn.on'), txt: document.getElementById('chessBtn').textContent, pool: !!document.querySelector('#poolBtn.on,#poolBtn2.on'), ward: !!document.querySelector('#wardBtn.on'), shop: !!document.querySelector('#shopBtn.on') }));
  chk(b0.btn && /PLAY CHESS/.test(b0.txt) && !b0.pool && !b0.ward && !b0.shop, 'PLAY CHESS appears next to the table (and no other prompt) ' + JSON.stringify(b0));
  await shot((process.env.SHOTDIR || '/workspace/shots') + '/chess_table_room.png');
  // ---- solid ----
  const sol = await ev(() => { const A = window.__arcade, W = window.__tp.whiteRoom.position.x, C = window.__chess, p0 = A.monkey.position.clone();
    A.monkey.position.set(W + C.TX, 0, C.TZ); window.__shop.update(1 / 60); const r = [A.monkey.position.x - W - C.TX, A.monkey.position.z - C.TZ]; A.monkey.position.copy(p0); window.__shop.update(1 / 60); return r; });
  chk(Math.abs(sol[0]) > 0.7 || Math.abs(sol[1]) > 0.7, 'table is solid ' + JSON.stringify(sol));
  // ---- PLAY: player sits, Grok walks over (fast test speed) and sits opposite ----
  const home = await ev(() => { const r = window.__shop.grok; return [r.position.x, r.position.z, r.rotation.y]; });
  await ev(() => { window.__chess.fast = true; window.__chess.hold = 'both'; });
  let [x, y] = await center('#chessBtn'); await page.touchscreen.tap(x, y);
  const s1 = await ev(() => ({ st: window.__chess.state, g: window.__chess.gstate, seated: window.__arcade.st.seated, x: !!document.querySelector('#chessX.on') }));
  chk(s1.st !== 'idle' && s1.seated === 'chess' && s1.g === 'out' && s1.x, 'PLAY: player heads for the chair, Grok leaves the counter, ✕ shown ' + JSON.stringify(s1));
  const walk = await page.waitForFunction(() => { const C = window.__chess, r = window.__shop.grok; (window.__gpath = window.__gpath || []).push([r.position.x, r.position.z]); return C.state === 'both' && C.gstate === 'seated' ? window.__gpath : null; }, null, { timeout: 60000, polling: 50 }).then(h => h.jsonValue()).catch(() => null);
  chk(!!walk && walk.length > 3, 'Grok walked over in steps (' + (walk ? walk.length : 0) + ' samples) and sat down');
  await page.waitForTimeout(300); await frames(3);
  const s2 = await ev(() => { const A = window.__arcade, W = window.__tp.whiteRoom.position.x, C = window.__chess, r = window.__shop.grok, u = A.monkey.userData;
    return { p: [A.monkey.position.x - W - C.TX, A.monkey.position.z - C.TZ], face: A.st.face, hips: u.hips.position.y, knee: u.legs[0].knee.rotation.x, g: [r.position.x - C.TX, r.position.z - C.TZ], gyaw: r.rotation.y, gHip: window.__shop.grok.children.filter(c => c.isGroup)[0].rotation.x,
      shopBtn: !!document.querySelector('#shopBtn.on'), chessBtn: !!document.querySelector('#chessBtn.on') }; });
  console.log(JSON.stringify(s2));
  chk(Math.abs(s2.p[0] + 1.16) < 0.05 && Math.abs(s2.p[1]) < 0.05 && Math.abs(s2.face - Math.PI / 2) < 0.05 && s2.hips < 0.6 && s2.knee > 1.2, 'player sits in the west chair facing the board');
  chk(Math.abs(s2.g[0] - 1.16) < 0.05 && Math.abs(s2.g[1]) < 0.05 && Math.abs(s2.gyaw + Math.PI / 2) < 0.1 && s2.gHip < -1.2, 'Grok sits in the opposite chair facing the player');
  chk(!s2.shopBtn && !s2.chessBtn, 'no SHOP / PLAY CHESS buttons while Grok is at the table');
  await shot((process.env.SHOTDIR || '/workspace/shots') + '/chess_both_seated.png');
  // ---- zoom onto the board, then the game ----
  await ev(() => { window.__chess.hold = 'zoom'; });
  await page.waitForFunction(() => window.__chess.state === 'zoom', null, { timeout: 30000 });
  await page.waitForTimeout(800); await frames(3);
  const z = await ev(() => { const A = window.__arcade, C = window.__chess, W = window.__tp.whiteRoom.position.x, c = A.camera.position, d = new A.THREE.Vector3(); A.camera.getWorldDirection(d);
    return { cx: c.x - W - C.TX, cy: c.y, cz: c.z - C.TZ, dy: d.y, ov: document.getElementById('chessOv').classList.contains('on') }; });
  chk(Math.abs(z.cx) < 1 && z.cy > 1.2 && z.cy < 2.2 && z.dy < -0.7 && !z.ov, 'camera zoomed in over the board, looking down ' + JSON.stringify(z));
  await shot((process.env.SHOTDIR || '/workspace/shots') + '/chess_zoom_board.png');
  await ev(() => { window.__chess.hold = null; });
  await page.waitForFunction(() => window.__chess.state === 'game' && window.__chess.open, null, { timeout: 30000 });
  const okG = await page.waitForFunction(() => { try { const d = window.__chess.frame.contentDocument, w = window.__chess.frame.contentWindow; return d && d.readyState === 'complete' && d.title === 'Chess' && d.querySelectorAll('.sq').length === 64 && w.chessApp; } catch (e) { return false; } }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  const ov = await ev(() => { const f = window.__chess.frame, r = f.getBoundingClientRect(), d = f.contentDocument, x = document.getElementById('chessX').getBoundingClientRect();
    return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, src: f.src, cv: window.__arcade.renderer.domElement.style.visibility, mode: d.getElementById('mode').value, robot: d.getElementById('robot').value, battles: d.getElementById('battles').value,
      pieces: d.querySelectorAll('.sq svg.pc, .sq .pc').length, x: [x.left, x.top, x.width], xTop: document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2).id }; });
  console.log(JSON.stringify(ov));
  chk(okG && ov.w === ov.iw && ov.h === ov.ih && /chess-play\/index\.html$/.test(ov.src) && ov.cv === 'hidden', 'chess opens full-screen over the zoomed board');
  chk(ov.mode === 'hvc' && ov.robot === 'on' && ov.battles === 'on' && ov.pieces >= 32, 'same game: vs computer, robot hand + battles on, 32 pieces');
  chk(ov.x[0] <= 8 && ov.x[1] <= 8 && ov.x[2] >= 36 && ov.xTop === 'chessX', 'close ✕ tight in the top-left and on top');
  // play e2-e4; the computer answers (robot hand)
  const fr = page.frameLocator('#chessOv iframe');
  await fr.locator('.sq[data-sq="20"]').tap(); await fr.locator('.sq[data-sq="52"]').tap();
  const reply = await page.waitForFunction(() => { const w = window.__chess.frame.contentWindow; return w.chessApp.pos.ply >= 2 && !w.chessApp.thinking ? w.chessApp.sans.slice(0, 2) : null; }, null, { timeout: 60000 }).then(h => h.jsonValue()).catch(() => null);
  chk(!!reply && reply[0] === 'e4', 'e2-e4 played and the computer answered ' + JSON.stringify(reply));
  await page.waitForTimeout(2500);
  await shot((process.env.SHOTDIR || '/workspace/shots') + '/chess_game_open.png');
  // Dave t874u: the game options sit UNDER the board, nothing overlaps, all fits on screen, ✕ clear
  const layout = async tag => { const L = await ev(() => { const d = window.__chess.frame.contentDocument, w = window.__chess.frame.contentWindow, R = s => { const b = d.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      return { vw: w.innerWidth, vh: w.innerHeight, frame: R('#frame'), bot: R('#barBottom'), panel: R('aside.panel'), cap: R('#barTop'), newBtn: R('#newBtn'), set: R('#settings summary'), sh: d.documentElement.scrollHeight }; });
    const inV = r => r.l >= 0 && r.t >= 0 && r.r <= L.vw + 0.5 && r.b <= L.vh + 0.5, clearX = r => r.l > 44 || r.t > 44;
    chk(L.panel.t >= L.bot.b - 0.5 && L.panel.t >= L.frame.b && inV(L.frame) && inV(L.panel) && inV(L.newBtn) && inV(L.set) && clearX(L.frame) && clearX(L.cap) && clearX(L.panel) && L.sh <= L.vh + 1,
      tag + ': options under the board, board + options fully on screen, ✕ clear ' + JSON.stringify(L)); };
  await layout('landscape phone');
  await shot((process.env.SHOTDIR || '/workspace/shots') + '/chess_options_bottom.png');
  const keys = await ev(() => { const w = window.__chess.frame.contentWindow; return Object.keys(w.localStorage).filter(k => /chess/.test(k)); });
  chk(keys.length && keys.every(k => k.startsWith('arcade_chess.')), 'arcade copy saves under its own keys ' + keys.join(','));
  // ---- ✕: game closes, camera pulls back, player stands, Grok walks home ----
  [x, y] = await center('#chessX'); await page.touchscreen.tap(x, y);
  await page.waitForFunction(() => window.__chess.state === 'idle', null, { timeout: 30000 }).catch(() => {});
  const c1 = await ev(() => ({ st: window.__chess.state, open: window.__chess.open, fr: document.querySelectorAll('#chessOv iframe').length, ov: document.getElementById('chessOv').classList.contains('on'), cv: window.__arcade.renderer.domElement.style.visibility, seated: window.__arcade.st.seated, x: !!document.querySelector('#chessX.on'), hips: window.__arcade.monkey.userData.hips.position.y }));
  chk(c1.st === 'idle' && !c1.open && c1.fr === 0 && !c1.ov && c1.cv === '' && !c1.seated && !c1.x && Math.abs(c1.hips - 0.8) < 0.05, '✕ closes the game, the player stands up ' + JSON.stringify(c1));
  const back = await page.waitForFunction(() => window.__chess.gstate === 'home', null, { timeout: 60000 }).then(() => true).catch(() => false);
  const gh = await ev(() => { const r = window.__shop.grok; return [r.position.x, r.position.z, r.rotation.y]; });
  chk(back && Math.hypot(gh[0] - home[0], gh[1] - home[1]) < 0.05 && Math.abs(gh[2] - home[2]) < 0.05, 'Grok walked back behind his counter ' + JSON.stringify([home, gh]));
  const mv = await ev(() => { const A = window.__arcade, p0 = A.monkey.position.clone(); A.keys.KeyW = true; for (let i = 0; i < 60; i++) A.step(1 / 60); A.keys.KeyW = false; return A.monkey.position.distanceTo(p0); });
  chk(mv > 1, 'player walks again ' + mv.toFixed(2));
  // ---- Esc while Grok is still on his way: everything resets ----
  await ev(() => { const A = window.__arcade, W = window.__tp.whiteRoom.position.x, C = window.__chess; A.monkey.position.set(W + C.TX - 2.2, 0, C.TZ); A.st.vel.set(0, 0, 0); C.fast = false; });
  await page.waitForFunction(() => !!document.querySelector('#chessBtn.on'), null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__chess.state === 'wait', null, { timeout: 30000 }).catch(() => {});
  const w1 = await ev(() => ({ st: window.__chess.state, g: window.__chess.gstate }));
  await page.keyboard.press('Escape');
  await ev(() => { window.__chess.fast = true; });
  await page.waitForFunction(() => window.__chess.state === 'idle' && window.__chess.gstate === 'home', null, { timeout: 60000 }).catch(() => {});
  const e1 = await ev(() => ({ st: window.__chess.state, g: window.__chess.gstate, seated: window.__arcade.st.seated, fr: document.querySelectorAll('#chessOv iframe').length, opens: window.__chess.opens }));
  chk(w1.st === 'wait' && w1.g === 'out' && e1.st === 'idle' && e1.g === 'home' && !e1.seated && e1.fr === 0, 'E sits down, Esc while Grok walks over cancels cleanly ' + JSON.stringify([w1, e1]));
  // ---- portrait phone: ✕ reachable over the open game, no turn-sideways screen ----
  await page.setViewportSize({ width: 390, height: 780 });
  await ev(() => { const A = window.__arcade, W = window.__tp.whiteRoom.position.x, C = window.__chess; A.monkey.position.set(W + C.TX - 2.2, 0, C.TZ); A.st.vel.set(0, 0, 0); C.fast = true; });
  await page.waitForFunction(() => !!document.querySelector('#chessBtn.on'), null, { timeout: 30000 }).catch(() => {});
  await ev(() => window.__chess.play());
  await page.waitForFunction(() => window.__chess.state === 'game', null, { timeout: 60000 }).catch(() => {});
  const pt = await ev(() => { const x = document.getElementById('chessX').getBoundingClientRect(); return { st: window.__chess.state, x: [x.left, x.top], top: document.elementFromPoint(x.left + 19, x.top + 19).id, turn: document.getElementById('turnHint') ? document.getElementById('turnHint').classList.contains('on') : false }; });
  chk(pt.st === 'game' && pt.x[0] <= 8 && pt.top === 'chessX' && !pt.turn, 'portrait phone: game open, ✕ on top, no turn-sideways ' + JSON.stringify(pt));
  await page.waitForFunction(() => { try { return window.__chess.frame.contentDocument.querySelectorAll('.sq').length === 64; } catch (e) { return false; } }, null, { timeout: 60000 }).catch(() => {});
  await layout('portrait phone');
  await page.setViewportSize({ width: 820, height: 1180 }); await page.waitForTimeout(400); await layout('iPad portrait');
  await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(400); await layout('PC');
  await page.setViewportSize({ width: 390, height: 780 }); await page.waitForTimeout(300);
  await ev(() => window.__chess.leave('test'));
  await page.waitForFunction(() => window.__chess.state === 'idle' && window.__chess.gstate === 'home', null, { timeout: 60000 }).catch(() => {});
  const home0 = process.env.GA_URL ? new URL(process.env.GA_URL).origin : 'http://localhost';   // live run: the site's own origin
  const off = requests.filter(u => !u.startsWith(home0) && !/^(http:\/\/localhost|data:|blob:|about:)/.test(u) && !/supabase/i.test(u));
  chk(off.length === 0, 'no off-site requests ' + off.slice(0, 3).join(' '));
  const errs = errors;
  chk(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await close(); process.exit(ok ? 0 : 1);
})();
