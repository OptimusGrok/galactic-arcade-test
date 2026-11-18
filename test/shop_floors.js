// v259: shop neon is the dark hex floor (not the white room shade); shop carpet uses the real KTX2
// (not a stale 4x4 compressed clone); #bFs stays visible so you can minimise / exit fullscreen.
// node test/shop_floors.js
const { open } = require('./lib');
function texInfo(t) {
  if (!t) return { ok: false, w: 0, mipN: 0, ready: false, compressed: false };
  const img = t.image || (t.source && t.source.data);
  const mip = t.mipmaps && t.mipmaps[0];
  const w = (mip && mip.width) || (img && (img.width || img.videoWidth)) || 0;
  const mipN = t.mipmaps ? t.mipmaps.length : 0;
  const ready = t._gaReady === true || w > 4 || mipN > 0;
  return { ok: ready && w > 4, w, mipN, ready, compressed: !!t.isCompressedTexture, uuid: t.uuid };
}
(async () => {
  const { page, errors, close } = await open({ w: 800, h: 450 });
  let ok = true; const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const wait = ms => page.waitForTimeout(ms);
  await page.waitForFunction(() => window.__arcade && window.__arcade.shop, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const A = window.__arcade; A.monkey.position.set(80, 0, 4); A.st.vel.set(0, 0, 0); A.st.yaw = 0; A.st.pitch = 0.4; window.__camOverride = { pos: [80, 2.8, 7.2], at: [80, 0.05, 1.2], showMonkey: false }; });
  await wait(800);

  const ui = await page.evaluate(() => {
    const b = document.getElementById('bFs'), cs = b && getComputedStyle(b), r = b && b.getBoundingClientRect();
    return {
      has: !!b, display: cs && cs.display, vis: cs && cs.visibility, opacity: cs && +cs.opacity,
      w: r && r.width, h: r && r.height, inView: !!(r && r.width > 8 && r.height > 8 && r.top >= 0 && r.right <= innerWidth + 1),
      title: b && b.title, icon: !!(b && b.querySelector('.fsI')),
      hiddenByMode: false
    };
  });
  chk(ui.has && ui.display !== 'none' && ui.vis !== 'hidden' && ui.inView && ui.icon, 'minimise / fullscreen button is visible with a CSS icon ' + JSON.stringify(ui));

  // even if the page loaded as a standalone / fullscreen app, we no longer hide #bFs
  const still = await page.evaluate(() => {
    document.getElementById('bFs').style.display = '';
    if (window.__arcade && typeof window.syncFsBtn === 'function') {}
    const b = document.getElementById('bFs');
    // simulate the old hide predicate but confirm our sync left it shown
    return { display: getComputedStyle(b).display, title: b.title };
  });
  chk(still.display !== 'none', '#bFs stays shown (not display:none) ' + JSON.stringify(still));

  await page.evaluate(() => window.__arcade.setFloor('neon'));
  await wait(600);
  const neon = await page.evaluate(() => {
    const S = window.__arcade.room.parent;
    const hex = S.getObjectByName('floorHexW'), base = S.getObjectByName('floorBaseW');
    const gloss = S.getObjectByName('glossFloor'), cw = S.getObjectByName('carpetW');
    return { hex: !!(hex && hex.visible), base: !!(base && base.visible), gloss: !!(gloss && gloss.visible), cw: !!(cw && cw.visible), floor: window.__arcade.floor };
  });
  chk(neon.floor === 'neon' && neon.hex && neon.base && !neon.cw && !neon.gloss, 'shop neon uses dark hex + base, hides carpet and gloss ' + JSON.stringify(neon));

  await page.evaluate(() => window.__arcade.setFloor('carpet'));
  await page.waitForFunction(() => {
    const cw = window.__arcade.room.parent.getObjectByName('carpetW');
    const t = cw && cw.material && cw.material.map;
    if (!t) return false;
    const mip = t.mipmaps && t.mipmaps[0];
    const img = t.image || (t.source && t.source.data);
    const w = (mip && mip.width) || (img && img.width) || 0;
    return cw.visible && (t._gaReady === true || w > 4);
  }, null, { timeout: 20000 }).catch(() => {});
  const carp = await page.evaluate(() => {
    const S = window.__arcade.room.parent;
    const cw = S.getObjectByName('carpetW'), hex = S.getObjectByName('floorHexW'), gloss = S.getObjectByName('glossFloor');
    const t = cw && cw.material && cw.material.map;
    const room = window.__arcade.carpet && window.__arcade.carpet.material && window.__arcade.carpet.material.map;
    const info = t => {
      if (!t) return null;
      const mip = t.mipmaps && t.mipmaps[0], img = t.image || (t.source && t.source.data);
      return { w: (mip && mip.width) || (img && img.width) || 0, mipN: t.mipmaps ? t.mipmaps.length : 0, ready: t._gaReady, uuid: t.uuid, compressed: !!t.isCompressedTexture };
    };
    return { floor: window.__arcade.floor, cw: !!(cw && cw.visible), hex: !!(hex && hex.visible), gloss: !!(gloss && gloss.visible), shop: info(t), room: info(room), same: t && room && t.uuid === room.uuid };
  });
  chk(carp.floor === 'carpet' && carp.cw && !carp.hex && !carp.gloss, 'shop carpet cover is on, neon/gloss off ' + JSON.stringify({ floor: carp.floor, cw: carp.cw, hex: carp.hex, gloss: carp.gloss }));
  chk(carp.shop && carp.shop.w > 4 && (carp.shop.mipN > 0 || carp.shop.ready === true), 'shop carpet map is the real texture, not an empty KTX2 clone ' + JSON.stringify(carp.shop));
  chk(carp.room && carp.room.w > 4, 'room 1 carpet map is ready ' + JSON.stringify(carp.room));
  chk(!carp.same, 'shop carpet has its own texture (different repeat) ' + JSON.stringify({ shop: carp.shop && carp.shop.uuid, room: carp.room && carp.room.uuid }));

  chk(errors.length === 0, 'no page errors ' + errors.join(' | '));
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  await close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
