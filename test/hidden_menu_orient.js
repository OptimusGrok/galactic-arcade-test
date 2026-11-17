// t901u: the hidden TICKETS / DEV menu (top-right corner taps + pattern 1-4-7-2-9-6-3-8-5)
// re-lays out in both upright and sideways. It can be opened on a portrait phone even when
// the turn-sideways screen is up. Closing it leaves the arcade / cabinets unchanged
// (turn-sideways hint returns, no whole-app rotation). NOSHOTS=1 node test/hidden_menu_orient.js
const { open } = require('./lib');
let ok = true;
const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 500) : '')); if (!c) ok = false; };
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const fitFn = () => {
  const vw = innerWidth, vh = innerHeight, bad = [];
  const box = (e) => { if (!e) return null; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const see = (sel, name) => {
    const r = box(typeof sel === 'string' ? document.querySelector(sel) : sel);
    if (!r || r.w < 8 || r.h < 8 || r.x < -2 || r.y < -2 || r.b > vh + 2 || r.r > vw + 2) bad.push({ name, r, vw, vh });
    return r;
  };
  const hint = document.getElementById('turnHint');
  const start = document.getElementById('start');
  const mid = document.elementFromPoint(vw / 2, vh / 2);
  const corner = document.getElementById('secHot');
  const cr = corner && corner.getBoundingClientRect();
  const cEl = cr ? document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2) : null;
  const rot = (el) => { if (!el) return null; for (let q = el; q && q.nodeType === 1; q = q.parentElement) { const t = getComputedStyle(q).transform; if (t && t !== 'none') { const m = new DOMMatrix(t); if (Math.abs(m.b) > 0.01 || Math.abs(m.c) > 0.01) return (q.id || q.tagName) + ' ' + t; } } return null; };
  ['#tk.on #optP', '#tkDone', '#tkNum', '#tkClip', '#tkGrid', '#tkX'].forEach(s => see(s, s));
  return {
    vw, vh, bad,
    hintOn: !!(hint && hint.classList.contains('on') && getComputedStyle(hint).display !== 'none'),
    tk: !!document.querySelector('#tk.on'),
    sec: !!document.querySelector('#sec.on'),
    secretOn: !!(start && start.classList.contains('secretOn')),
    mid: mid && (mid.id || mid.className || mid.tagName),
    inMenu: !!(mid && mid.closest && mid.closest('#tk, #sec')),
    cornerId: cEl && cEl.id,
    lock: (window.__arcade && window.__arcade.st && window.__arcade.st.orientLock) || '',
    upright: document.body.classList.contains('upright'),
    rot: rot(document.getElementById('tk')) || rot(document.body)
  };
};

(async () => {
  const o = await open({ phone: true, start: true, w: 390, h: 844, ua: ANDROID });
  const page = o.page;
  const ev = (f, a) => page.evaluate(f, a);
  await page.waitForFunction(() => window.__arcade && document.getElementById('secHot') && document.getElementById('gaIn'), null, { timeout: 90000 });
  await page.waitForTimeout(400);

  let s = await ev(fitFn);
  chk(s.hintOn && !s.tk, 'portrait start (menu closed): turn-sideways screen is still shown', s);
  chk(s.cornerId === 'secHot', 'portrait: the top-right secret corner sits above the turn-sideways screen', s);

  await ev(() => { const h = document.getElementById('secHot'), r = h.getBoundingClientRect(); for (let i = 0; i < 3; i++) h.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 30, clientY: r.top + 30 })); });
  await page.waitForTimeout(300);
  const pad = await ev(() => !!document.querySelector('#sec.on'));
  chk(pad, 'triple-tap top-right still opens the unlock pattern');
  const D = await ev(() => { const r = document.getElementById('secP').getBoundingClientRect(), o = []; for (let i = 0; i < 9; i++) o.push([r.left + r.width * (0.17 + 0.33 * (i % 3)), r.top + r.height * (0.17 + 0.33 * Math.floor(i / 3))]); return o; });
  { const p = [1, 4, 7, 2, 9, 6, 3, 8, 5].map(n => D[n - 1]); await page.mouse.move(p[0][0], p[0][1]); await page.mouse.down(); for (let k = 1; k < p.length; k++) await page.mouse.move(p[k][0], p[k][1], { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(500); }

  s = await ev(fitFn);
  chk(s.tk && s.secretOn && s.inMenu && !s.rot, 'portrait: hidden TICKETS menu is open above the turn-sideways screen, not CSS-rotated', s);
  chk(s.bad.length === 0, 'portrait: menu panel, DEV buttons and Done stay on screen', s.bad);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  s = await ev(fitFn);
  chk(s.tk && s.vw > s.vh && s.inMenu && !s.rot, 'landscape: the same menu stays open and follows the phone, not CSS-rotated', s);
  chk(s.bad.length === 0, 'landscape: menu panel, DEV buttons and Done stay on screen', s.bad);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  s = await ev(fitFn);
  chk(s.tk && s.vw < s.vh && s.bad.length === 0, 'back to portrait: menu still fits', s);

  const b = await page.locator('#tkDone').first().boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
  s = await ev(fitFn);
  chk(!s.tk && !s.secretOn && s.hintOn && !s.upright, 'closing the menu on a portrait phone restores the turn-sideways screen; arcade is not left upright', s);

  const errs = o.errors.filter(e => !/net::ERR_FAILED|Failed to load resource|supabase|AbortError|not fullscreen/i.test(e));
  chk(errs.length === 0, 'no page errors', errs.slice(0, 4));
  await o.close();
  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
