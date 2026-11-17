// t879u / v248: on a portrait phone (390x844) the Strike cabinet copy must show the BOMB
// control on-screen, including in co-op (Dave: the co-op HUD skipped the solo touch
// buttons and put the bomb count under the home indicator). node test/strike_bomb_phone.js
const { open } = require('./lib');
const fs = require('fs');
let ok = true;
const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 500) : '')); if (!c) ok = false; };
const SHOT = '/workspace/shots/strike_bomb_phone_v248.png';

(async () => {
  const W = 390, H = 844, o = await open({ phone: true, w: W, h: H }), page = o.page;
  page.setDefaultTimeout(60000);
  await page.evaluate(() => { const s = document.getElementById('start'); if (s) s.remove(); if (window.__start) window.__start.dismissed = true; });
  await page.evaluate(() => {
    const F = window.__F = { el: null, log: [], cur: 'natural', pend: null, delay: {} }, so = screen.orientation, D = document;
    Object.defineProperty(Document.prototype, 'fullscreenElement', { get() { return F.el; }, configurable: true });
    D.documentElement.requestFullscreen = function () { F.log.push('fs'); return new Promise(r => setTimeout(() => { if (!F.el) { F.el = D.documentElement; D.dispatchEvent(new Event('fullscreenchange')); } r(); }, 30)); };
    const abort = () => { if (F.pend) { const p = F.pend; F.pend = null; p.rej(new DOMException('aborted', 'AbortError')); } };
    so.lock = k => { F.log.push('lock:' + k); if (!F.el) return Promise.reject(new DOMException('not fullscreen', 'SecurityError')); abort();
      return new Promise((res, rej) => { const me = { rej }; F.pend = me; setTimeout(() => { if (F.pend !== me) return; F.pend = null; F.cur = k; F.log.push('=>' + k); res(); }, F.delay[k] || 20); }); };
    so.unlock = () => { F.log.push('unlock'); abort(); F.cur = 'natural'; };
    window.__wantWide && window.__wantWide();
  });
  await page.waitForTimeout(400);
  await page.waitForFunction(() => window.__arcade && window.__arcade.play && window.__arcade.play.mode === 'walk', null, { timeout: 60000 });
  await page.evaluate(() => { const P = window.__arcade.play; P.start(P.machines.strike); });
  await page.waitForFunction(() => { const P = window.__arcade.play; return P.mode === 'game' && document.getElementById('bExit') && document.getElementById('bExit').style.display === 'block'; }, null, { timeout: 90000 });
  await page.evaluate(() => { const P = window.__arcade.play; P.machines.strike.credits = 1; P.tryPlay(); });
  await page.waitForFunction(() => { const f = document.getElementById('game'); return f && f.contentWindow && f.contentWindow.STRIKE && f.contentWindow.STRIKE.G && f.contentWindow.STRIKE.G.scene === 'play'; }, null, { timeout: 90000 });
  await page.waitForTimeout(400);

  const probe = async (label) => page.evaluate(([vw, vh, label]) => {
    const f = document.getElementById('game'), w = f.contentWindow, S = w.STRIKE, C = w.__strikeCoop, cv = w.document.getElementById('c');
    S.Input.touchMode = true;
    if (S.G.bombs < 1) S.G.bombs = 3;
    try { S.steps(2); } catch (e) {}
    try { S.render(); } catch (e) {}
    const r = cv.getBoundingClientRect(), WW = 270, HH = w.Function('return H')(), SS = w.Function('return S')();
    if (cv.height !== HH * SS) { w.dispatchEvent(new Event('resize')); }
    try { S.render(); } catch (e) {}
    const btn = { x: WW - 30, y: HH - 52, r: 21 };
    const kx = r.width / WW, ky = r.height / HH;
    const box = { x: r.left + btn.x * kx, y: r.top + btn.y * ky, rad: btn.r * kx };
    const pad = 8;
    const onScreen = box.x - box.rad >= -1 && box.x + box.rad <= vw + 1 && box.y - box.rad >= pad && box.y + box.rad <= vh - pad;
    // sample the button ring on the game canvas (green #40ff80 stroke)
    const g = cv.getContext('2d'), sx = (cv.width / WW), sy = (cv.height / HH);
    const ring = (ang) => {
      const px = Math.round((btn.x + Math.cos(ang) * (btn.r - 1)) * sx), py = Math.round((btn.y + Math.sin(ang) * (btn.r - 1)) * sy);
      const d = g.getImageData(Math.max(0, px), Math.max(0, py), 1, 1).data;
      return { px, py, r: d[0], g: d[1], b: d[2] };
    };
    const samples = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map(ring);
    const green = samples.filter(s => s.g > s.r + 20 && s.g > 80 && s.b > 40);
    const X = document.getElementById('bExit'), tix = document.getElementById('tix');
    const overlap = (el) => {
      if (!el) return false; const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (cs.display === 'none' || !b.width) return false;
      const dx = Math.abs((b.left + b.width / 2) - box.x), dy = Math.abs((b.top + b.height / 2) - box.y);
      return dx < (b.width / 2 + box.rad) && dy < (b.height / 2 + box.rad);
    };
    return {
      label, scene: S.G.scene, bombs: S.G.bombs, touch: !!S.Input.touchMode,
      coop: !!(C && C.p2on), role: C && C.role, H: HH,
      box: { x: +box.x.toFixed(1), y: +box.y.toFixed(1), rad: +box.rad.toFixed(1) }, canvas: [cv.width, cv.height], S: SS,
      onScreen, green: green.length, samples,
      covered: overlap(X) || overlap(tix),
      upright: document.body.classList.contains('upright'),
      inner: [w.innerWidth, w.innerHeight]
    };
  }, [W, H, label]);

  const solo = await probe('solo');
  chk(solo.upright && solo.inner[0] === W && solo.inner[1] === H, 'Strike is upright full-screen at 390x844', solo);
  chk(solo.touch && solo.bombs > 0, 'touch mode is on and the player has bombs', solo);
  chk(solo.onScreen && !solo.covered && solo.green >= 2, 'solo: BOMB button is visible and on-screen (not under close/tickets)', solo);

  await page.evaluate(() => {
    const w = document.getElementById('game').contentWindow, C = w.__strikeCoop, S = w.STRIKE;
    S.Input.touchMode = true;
    C.p2on = true; C.role = 'host';
    if (C.G2 && (C.G2.bombs | 0) < 1) C.G2.bombs = 3;
    try { C.resetP2 && C.resetP2(); } catch (e) {}
    C.p2on = true; C.role = 'host';
    try { S.steps(3); } catch (e) {}
  });
  await page.waitForTimeout(200);
  const coop = await probe('coop');
  chk(coop.coop && coop.role === 'host', 'co-op HUD is active (the path Dave was on)', coop);
  chk(coop.onScreen && !coop.covered && coop.green >= 2, 'co-op: BOMB button is visible and on-screen at 390x844 upright', coop);

  // Prefer a page shot (close X + tickets + game). A just-resized iframe canvas can come
  // out black in this headless Chrome, so fall back to the canvas bitmap if needed.
  await page.evaluate(() => {
    const w = document.getElementById('game').contentWindow;
    w.STRIKE.Input.touchMode = true;
    if (w.STRIKE.G.bombs < 1) w.STRIKE.G.bombs = 3;
    try { w.STRIKE.render(); } catch (e) {}
  });
  await page.waitForTimeout(250);
  if (!fs.existsSync(SHOT)) {
    await page.screenshot({ path: SHOT, type: 'png' });
    const pageBytes = fs.existsSync(SHOT) ? fs.statSync(SHOT).size : 0;
    const png = await page.evaluate(() => {
      const w = document.getElementById('game').contentWindow, cv = w.document.getElementById('c');
      w.STRIKE.Input.touchMode = true;
      try { w.STRIKE.render(); } catch (e) {}
      return cv.toDataURL('image/png');
    });
    const buf = Buffer.from(png.split(',')[1], 'base64');
    let usedCanvas = false;
    if (pageBytes < 80000 && buf.length > 8000) { fs.writeFileSync(SHOT, buf); usedCanvas = true; }
    const bytes = fs.statSync(SHOT).size;
    chk(bytes > 8000, 'wrote a new phone Strike bomb-control shot to ' + SHOT, { bytes, pageBytes, usedCanvas });
  } else {
    chk(true, 'left existing shot alone: ' + SHOT);
  }

  await o.close();
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message + '\n' + e.stack); process.exit(1); });
