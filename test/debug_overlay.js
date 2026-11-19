// test-v14: DEBUG toggle in start OPTIONS, the hidden tickets/dev menu, and in-game OPTIONS.
// Overlay is test-build only, persisted, also opened by ?debug=1. node test/debug_overlay.js
const { open, play } = require('./lib');
(async () => {
  const { page, errors, close } = await open({ start: true, w: 800, h: 450 });
  let ok = true; const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const ev = (f, a) => page.evaluate(f, a);
  await page.waitForFunction(() => window.__gaDebug && window.__gaDebug.ok, null, { timeout: 60000 });
  chk(await ev(() => !!(window.__GA_TEST && String(window.__GA_VER || '').indexOf('test-') === 0 && window.__gaDebug.isTestBuild())), 'test build gate is on (test- ver + __GA_TEST)');
  chk(await ev(() => window.__gaDebug.on === false && !document.getElementById('gaDbg')), 'overlay starts off (no leftover localStorage)');

  // start OPTIONS
  await ev(() => window.__startUI.openOpt(true));
  await page.waitForTimeout(200);
  const startBtn = await ev(() => {
    const b = document.getElementById('dbgStart');
    if (!b) return null;
    const cs = getComputedStyle(b), r = b.getBoundingClientRect();
    return { text: b.textContent.replace(/\s+/g, ' ').trim(), display: cs.display, w: r.width, h: r.height, vis: cs.visibility };
  });
  chk(startBtn && startBtn.display !== 'none' && startBtn.w > 8 && /DEBUG:\s*OFF/.test(startBtn.text), 'DEBUG button is on the start OPTIONS menu ' + JSON.stringify(startBtn));

  await ev(() => { const b = document.getElementById('dbgStart'); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); });
  await page.waitForTimeout(400);
  const on1 = await ev(() => {
    const d = document.getElementById('gaDbg'), cs = d && getComputedStyle(d);
    return {
      on: window.__gaDebug.on, ls: localStorage.getItem('neonarcade.debug'),
      show: !!(d && cs.display !== 'none' && cs.visibility !== 'hidden'),
      pe: cs && cs.pointerEvents, text: d && d.textContent, z: cs && cs.zIndex,
      op: cs && +parseFloat(cs.backgroundColor.split(',')[3] || '1')
    };
  });
  chk(on1.on && on1.ls === '1' && on1.show, 'tapping DEBUG turns the overlay on and saves localStorage ' + JSON.stringify({ on: on1.on, ls: on1.ls, show: on1.show }));
  chk(on1.pe === 'none', 'overlay does not take pointer events (does not block play)');
  const t = on1.text || '';
  chk(/fps/i.test(t) && /ms/i.test(t) && /worst/i.test(t), 'overlay shows FPS, frame time and worst frame');
  chk(/heap/i.test(t), 'overlay shows a heap line (or — if the browser has no performance.memory)');
  chk(/geo/i.test(t) && /tex/i.test(t) && /prog/i.test(t) && /draws/i.test(t) && /tris/i.test(t), 'overlay shows renderer.info fields');
  chk(/tier/i.test(t) && /test-v14/.test(t) && /room|shop|hallway/.test(t) && /beam/i.test(t), 'overlay shows tier, __GA_VER, room and last beam');
  chk(/none|error|unhandled|·/.test(t), 'overlay has a console-error tail');

  // hidden tickets / dev menu
  await ev(() => { window.__startUI.openOpt(false); window.__startUI.secret.openTk(true); });
  await page.waitForTimeout(200);
  const hid = await ev(() => {
    const b = document.getElementById('tkDbg');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { text: b.textContent.trim(), w: r.width, display: getComputedStyle(b).display, on: b.classList.contains('on') };
  });
  chk(hid && hid.display !== 'none' && hid.w > 8 && /DEBUG:\s*ON/.test(hid.text), 'DEBUG button is in the hidden tickets/dev menu and shows ON ' + JSON.stringify(hid));

  await ev(() => { const b = document.getElementById('tkDbg'); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); });
  await page.waitForTimeout(200);
  chk(await ev(() => window.__gaDebug.on === false && localStorage.getItem('neonarcade.debug') === '0' && (!document.getElementById('gaDbg') || getComputedStyle(document.getElementById('gaDbg')).display === 'none')), 'tapping DEBUG in the hidden menu turns the overlay off');

  // ?debug=1
  await ev(() => { const u = new URL(location.href); u.searchParams.set('debug', '1'); history.replaceState(null, '', u); window.__gaDebug.set((() => { const q = new URLSearchParams(location.search).get('debug'); return q === '1' || q === 'true' || q === 'on'; })()); });
  chk(await ev(() => window.__gaDebug.on && document.getElementById('gaDbg') && getComputedStyle(document.getElementById('gaDbg')).display !== 'none'), '?debug=1 turns the overlay on');

  // in-game OPTIONS
  await ev(() => { window.__startUI.secret.openTk(false); window.__startUI.openOpt(false); });
  await play(page, false, 'Dbg');
  await page.waitForFunction(() => window.__arcade && window.__arcade.play && window.__arcade.play.mode === 'walk', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  await ev(() => { if (window.__opts && window.__opts.show) window.__opts.show(true); });
  await page.waitForTimeout(300);
  const ig = await ev(() => {
    const b = document.getElementById('opDbg');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { text: (b.textContent || '').replace(/\s+/g, ' ').trim(), display: getComputedStyle(b).display, w: r.width, menu: !!document.querySelector('#gOpt.on') };
  });
  chk(ig && ig.menu && ig.display !== 'none' && ig.w > 8 && /DEBUG/.test(ig.text), 'DEBUG button is on the in-game OPTIONS menu ' + JSON.stringify(ig));

  chk(errors.filter(e => !/ERR_FAILED|Failed to load resource|supabase/i.test(e)).length === 0, 'no page errors ' + errors.join(' | '));
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  await close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
