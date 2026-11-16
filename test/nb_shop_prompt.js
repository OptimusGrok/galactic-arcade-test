// t878u / v247: PLAY NEON BRICKS must only appear in front of room 1's east window, not in the
// Grok shop (or room 2 / the hallway). The old near-check was a half-space (x > HALF-4.2, |z| < 2.4)
// that leaked into the shop at WX=80, where the shelves and checkout sit around z=-2.
// node test/nb_shop_prompt.js
const { open } = require('./lib');
let ok = true;
const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 500) : '')); if (!c) ok = false; };

(async () => {
  const o = await open({ w: 640, h: 360 }), page = o.page, { errors } = o;
  await page.waitForFunction(() => window.__arcade && window.__neonBricks && window.__arcade.stats.frames > 3, null, { timeout: 120000 });

  const probe = async (x, z, label) => {
    await page.evaluate(([x, z]) => {
      const A = window.__arcade;
      A.monkey.position.set(x, 0, z);
      if (A.st.vel && A.st.vel.set) A.st.vel.set(0, 0, 0);
      A.st.play = 0;
    }, [x, z]);
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const A = window.__arcade, nb = window.__neonBricks;
      const on = el => { if (!el) return false; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.classList.contains('on') && r.width > 0; };
      return {
        x: +A.monkey.position.x.toFixed(2), z: +A.monkey.position.z.toFixed(2),
        near: !!nb.near, playBtn: on(document.getElementById('nbPlay')),
        cab: A.nearCab && A.nearCab.name || null,
        cabUI: on(document.getElementById('playUI')),
        shop: on(document.getElementById('shopBtn')),
        chess: on(document.getElementById('chessBtn')),
        pool: on(document.getElementById('poolBtn')) || on(document.getElementById('poolBtn2')),
        ward: on(document.getElementById('wardBtn')),
        golf: on(document.getElementById('golfBtn')) || !!(window.__golf && window.__golf.popShown)
      };
    });
  };

  const atWindow = await probe(9.6, 0.2, 'window');
  chk(atWindow.near && atWindow.playBtn && !atWindow.cabUI, 'PLAY NEON BRICKS still appears at the east window', atWindow);

  // Dave's report: standing in the shop in front of the plush/toy shelves and Grok's counter,
  // near the left wall with the orc mural. Shop is at WX=80; back wall / counter sit around z=-2.
  await page.evaluate(async () => { if (window.__arcade.loadShop) await window.__arcade.loadShop(); });
  await page.waitForFunction(() => window.__shop && window.__shop.G, null, { timeout: 60000 }).catch(() => {});

  const WX = await page.evaluate(() => (window.__tp && window.__tp.whiteRoom && window.__tp.whiteRoom.position.x) || 80);
  const shopSpots = [
    [WX - 8, -1.8, 'in front of the prize shelves, near the left mural (Dave)'],
    [WX + 3.2, -0.4, 'in front of the Grok shop counter'],
    [WX, 0, 'shop centre (same z as the Neon Bricks window)'],
    [WX - 5, -1.95, 'at the candy stand'],
    [WX + 10, -2.0, 'near the right mural / back wall']
  ];
  for (const [x, z, label] of shopSpots) {
    const r = await probe(x, z, label);
    chk(r.x > 40 && !r.near && !r.playBtn && !r.cabUI,
      'no Neon Bricks or cabinet PLAY prompt ' + label, r);
  }

  const hall = await page.evaluate(() => ({ HALF: 12, HALL_L: window.__arcade.HALL_L, Z2: window.__arcade.Z2 }));
  const elsewhere = [
    [0, -(hall.HALF + hall.HALL_L / 2), 'in the hallway to room 2'],
    [0, hall.Z2, 'in the centre of room 2'],
    [-9, 0, 'at the west wall (ORC / CYBER side, opposite the window)']
  ];
  for (const [x, z, label] of elsewhere) {
    const r = await probe(x, z, label);
    chk(!r.near && !r.playBtn, 'no Neon Bricks prompt ' + label, r);
  }

  chk(errors.length === 0, 'no page errors', errors.slice(0, 3));
  await o.close();
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message + '\n' + e.stack); process.exit(1); });
