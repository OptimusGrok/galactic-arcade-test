/* v235: when Neon Bricks is zoomed fullscreen (zoomK > 0.85), the rest of the
   arcade (room / room2 / hall / shop / cabinets) is hidden so the playfield
   doesn't pay for a full room render. Un-zoom restores the room. */
const { open } = require('./lib');

(async () => {
  let ok = true;
  const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 400) : '')); if (!c) ok = false; };

  const o = await open({ phone: true, w: 390, h: 700, dsf: 1 });
  const { page, close } = o;
  await page.waitForFunction(() => window.__arcade && window.__neonBricks && window.__arcade.stats.frames > 3, null, { timeout: 120000 });

  const snap = () => page.evaluate(() => {
    const A = window.__arcade, nb = window.__neonBricks;
    const vis = n => !!(n && n.visible);
    return {
      playing: !!nb.playing, zoom: !!nb.zoom, zoomK: +((nb.zoomK || 0).toFixed(3)), zoomAmt: nb.zoomAmt,
      room: vis(A.room), room2: vis(A.room2), hall: vis(A.hall),
      grpParent: nb.grp && nb.grp.parent && (nb.grp.parent === A.scene ? 'scene' : nb.grp.parent === A.room ? 'room' : (nb.grp.parent.name || nb.grp.parent.type)),
      panelParent: nb.panel && nb.panel.parent && (nb.panel.parent === A.scene ? 'scene' : nb.panel.parent === A.room ? 'room' : (nb.panel.parent.name || nb.panel.parent.type)),
      grpVis: vis(nb.grp), panelVis: vis(nb.panel)
    };
  });

  const before = await snap();
  chk(before.room && !before.playing, 'before play: room is visible, not playing', before);

  await page.evaluate(() => { window.__neonBricks.start(); });
  await page.waitForTimeout(200);
  const mid = await snap();
  chk(mid.playing && mid.room && mid.grpParent === 'room', 'playing un-zoomed: room stays visible, playfield still in the window', mid);

  await page.evaluate(() => { window.__neonBricks.toggleZoom(); });
  await page.waitForFunction(() => {
    const nb = window.__neonBricks, A = window.__arcade;
    return nb.playing && nb.zoomK > 0.85 && A.room && A.room.visible === false;
  }, null, { timeout: 15000 });
  const z = await snap();
  chk(z.zoom && z.zoomK > 0.85, 'toggle ZOOM eases zoomK past 0.85', z);
  chk(!z.room && !z.room2 && !z.hall, 'zoomed: room, room2 and hall are hidden', z);
  chk(z.grpParent === 'scene' && z.panelParent === 'scene' && z.grpVis && z.panelVis, 'zoomed: playfield + panel reparented to the scene and stay visible', z);

  await page.evaluate(() => { window.__neonBricks.toggleZoom(); });
  await page.waitForFunction(() => {
    const nb = window.__neonBricks, A = window.__arcade;
    return nb.playing && nb.zoomK < 0.2 && A.room && A.room.visible === true;
  }, null, { timeout: 15000 });
  const back = await snap();
  chk(back.playing && !back.zoom && back.room, 'un-zoom: room is visible again and still playing', back);
  chk(back.grpParent === 'room' && back.panelParent === 'room', 'un-zoom: playfield + panel return to the room', back);

  await page.evaluate(() => { window.__neonBricks.stop('exit'); });
  await page.waitForTimeout(300);
  const done = await snap();
  chk(!done.playing && done.room, 'after stop: not playing, room still visible', done);

  await close();
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
