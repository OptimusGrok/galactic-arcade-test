// t893u: room-2 / shop heavy textures stream in on approach and evict after leaving;
// Strike and Ghost demo iframes detach when far and reattach when near.
const { open } = require('./lib');

(async () => {
  const o = await open({ w: 844, h: 390 });
  const { page, errors, close } = o;
  let ok = true;
  const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m, x != null ? JSON.stringify(x) : ''); if (!c) ok = false; };

  await page.evaluate(() => { window.__gaStreamHold = 800; });

  const snap = () => page.evaluate(() => {
    const A = window.__arcade, S = window.__gaStream || {}, shop = window.__shop;
    const find = name => { let m = null; if (A.scene) A.scene.traverse(o => { if (o.name === name) m = o; }); return m; };
    const tex = name => {
      const m = find(name), map = m && m.material && m.material.map;
      const img = map && (map.image || (map.source && map.source.data));
      return { hasMap: !!map, w: (img && (img.width || img.videoWidth)) || 0, h: (img && (img.height || img.videoHeight)) || 0 };
    };
    const ds = A.dsCab && A.dsCab.getObjectByName('screen');
    const dsMap = ds && ds.material && ds.material.map;
    const dsImg = dsMap && (dsMap.image || (dsMap.source && dsMap.source.data));
    const mir = A.room2 && A.room2.userData && A.room2.userData.mirror;
    const rt = mir && mir.getRenderTarget && mir.getRenderTarget();
    const iframe = d => ({ ready: !!(d && d.ready), connected: !!(d && d.iframe && d.iframe.isConnected), src: (d && d.iframe && (d.iframe.getAttribute('src') || d.iframe.src || '')) || '' });
    return {
      stream: { shop: S.shop, room2: S.room2, strikeDemo: S.strikeDemo, ghostDemo: S.ghostDemo, wantShop: S.wantShop, wantRoom2: S.wantRoom2 },
      shopGpu: !!(shop && shop.gpu && shop.gpu.on),
      r2Gpu: !!(A.dsCab && A.dsCab.userData && A.dsCab.userData.gpu && A.dsCab.userData.gpu.on),
      mural: tex('muralLeft'), shelf: tex('shelfBoxes'), labels: tex('priceLabels'), title: tex('muralTitle'),
      ds: { hasMap: !!dsMap, w: (dsImg && dsImg.width) || 0, gpu: !!(A.dsCab && A.dsCab.userData && A.dsCab.userData.gpu && A.dsCab.userData.gpu.on) },
      mirror2: rt ? { w: rt.width, h: rt.height } : null,
      strike: iframe(A.demo), ghost: iframe(A.ghostDemo),
      pos: { x: +A.monkey.position.x.toFixed(2), z: +A.monkey.position.z.toFixed(2) }
    };
  });

  const put = (x, z, wait = 400) => page.evaluate(([x, z]) => {
    const A = window.__arcade; A.monkey.position.set(x, 0, z); A.st.vel.set(0, 0, 0);
  }, [x, z]).then(() => page.waitForTimeout(wait));

  // shop idle-loads after the first frames, then should evict at spawn (0, 5)
  await page.waitForTimeout(1500);
  let r = await snap();
  console.log('spawn', JSON.stringify(r));
  chk(!r.shopGpu && r.stream.shop === 'off' && !r.mural.hasMap && !r.shelf.hasMap && !r.title.hasMap, 'at spawn, shop heavy textures are evicted (placeholder colours)', { shop: r.stream.shop, mural: r.mural, shelf: r.shelf, title: r.title });
  chk(!r.r2Gpu && r.stream.room2 === 'off' && !r.ds.hasMap && r.mirror2 && r.mirror2.w <= 1, 'at spawn, room 2 / Dead Signal GPU is evicted', { room2: r.stream.room2, ds: r.ds, mirror2: r.mirror2 });
  chk(!r.strike.ready && !r.strike.connected, 'Strike demo iframe is detached at spawn', r.strike);
  chk(!r.ghost.ready && !r.ghost.connected, 'Ghost demo iframe is detached at spawn', r.ghost);

  // approach the hallway / north door: room 2 should load early
  await put(0, -10, 800);
  r = await snap();
  console.log('hallway', JSON.stringify(r));
  chk(r.stream.wantRoom2 && r.r2Gpu && r.ds.hasMap && r.ds.w >= 256 && r.mirror2 && r.mirror2.w > 1, 'near the doorway, room 2 / Dead Signal textures are on the GPU', { stream: r.stream, ds: r.ds, mirror2: r.mirror2 });

  // back to the south of room 1, wait the hold, evict room 2
  await put(0, 8, 1400);
  r = await snap();
  console.log('back-south', JSON.stringify(r));
  chk(!r.r2Gpu && r.stream.room2 === 'off' && !r.ds.hasMap && r.mirror2 && r.mirror2.w <= 1, 'after leaving room 2 and waiting, those textures evict again', { stream: r.stream, ds: r.ds, mirror2: r.mirror2 });

  // approach the teleporter pad: shop murals / shelves / labels load early
  await put(-9, -9, 800);
  r = await snap();
  console.log('near-pad', JSON.stringify(r));
  chk(r.stream.wantShop && r.shopGpu && r.mural.hasMap && r.mural.w >= 512 && r.shelf.hasMap && r.labels.hasMap, 'near the teleporter, shop murals and shelf/price canvases are on the GPU', { stream: r.stream, mural: r.mural, shelf: r.shelf, labels: r.labels, title: r.title });

  // walk back to spawn (clear of the pad and the room-2 doorway) and evict
  await put(0, 5, 2000);
  r = await snap();
  console.log('far-se', JSON.stringify(r));
  chk(!r.shopGpu && r.stream.shop === 'off' && !r.mural.hasMap && !r.shelf.hasMap, 'after leaving the shop pad and waiting, shop textures evict to placeholders', { stream: r.stream, mural: r.mural, shelf: r.shelf });

  // walk up to Strike: demo iframe reattaches
  await put(-8, -8, 2000);
  r = await snap();
  console.log('near-strike', JSON.stringify(r));
  chk(r.stream.strikeDemo === 'on' && (r.strike.ready || r.strike.connected || /strike-demo/.test(r.strike.src)), 'Strike demo iframe reattaches when the player is near', { stream: r.stream, strike: r.strike });

  // go to room 2 centre: demos detach after the hold
  const z2 = await page.evaluate(() => window.__arcade.Z2);
  await put(0, z2, 2000);
  r = await snap();
  console.log('room2', JSON.stringify(r));
  chk(r.r2Gpu && r.ds.hasMap, 'in room 2, Dead Signal art is on the GPU', r.ds);
  chk(r.stream.strikeDemo === 'off' && !r.strike.ready && !/strike-demo/.test(r.strike.src || ''), 'in room 2, the Strike demo iframe has detached', r.strike);
  chk(r.stream.ghostDemo === 'off' && !r.ghost.ready, 'in room 2, the Ghost demo iframe has detached', r.ghost);

  chk(errors.filter(e => !/Failed to load|supabase|net::/i.test(e)).length === 0, 'no page errors', errors);
  await close();
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
