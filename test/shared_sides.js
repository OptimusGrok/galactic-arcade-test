// t911u: left and right cabinet side panels share one texture (UV-mirrored in geometry).
// Picture assets load as KTX2/Basis when the GPU can transcode, else the original image.
// NOSHOTS=1 node test/shared_sides.js
const { open } = require('./lib');
(async () => {
  let ok = true; const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const o = await open({ w: 844, h: 390 }); const p = o.page; p.setDefaultTimeout(90000);
  await p.waitForFunction(() => window.__arcade && window.__arcade.play && window.__arcade.stats.frames > 10, null, { timeout: 60000 });
  // give picture / ktx2 loads a moment
  await p.waitForTimeout(2000);
  const info = await p.evaluate(() => {
    const A = window.__arcade, T = A.THREE, machines = A.play.machines;
    const rows = [];
    let shared = 0, split = 0, ktxMaps = 0, imgMaps = 0, missing = [];
    for (const k of Object.keys(machines)) {
      const cab = machines[k] && machines[k].cab; if (!cab) continue;
      const L = cab.getObjectByName('sideArtL') || cab.getObjectByName('sidePanelL');
      const R = cab.getObjectByName('sideArtR') || cab.getObjectByName('sidePanelR');
      if (!L || !R) { missing.push(k); continue; }
      const lm = L.material && L.material.map, rm = R.material && R.material.map;
      const same = !!(lm && rm && lm === rm);
      const compressed = !!(lm && lm.isCompressedTexture);
      const src = lm && ((lm.source && lm.source.data && (lm.source.data.src || '')) || (lm.image && lm.image.src) || '');
      if (same) shared++; else split++;
      if (compressed) ktxMaps++; else if (lm) imgMaps++;
      rows.push({ k, same, sameMat: L.material === R.material, compressed, w: (lm && (lm.image && (lm.image.width || (lm.mipmaps && lm.mipmaps[0] && lm.mipmaps[0].width))) || (lm && lm.source && lm.source.data && lm.source.data.width) || 0), hasMap: !!lm });
    }
    const mural = [];
    A.scene.traverse(o => {
      if (!o.isMesh) return;
      const mat = o.material && (Array.isArray(o.material) ? o.material[0] : o.material);
      const map = mat && mat.map; if (!map) return;
      if (/mural|shop_title|neon_signs|carpet|viking|ds_screen|icons_atlas/i.test(o.name + ' ' + (map.name || ''))) {
        mural.push({ name: o.name, compressed: !!map.isCompressedTexture });
      }
    });
    return { shared, split, ktxMaps, imgMaps, missing, rows, ktxOk: !!(window.__arcade && true), frames: A.stats.frames };
  });
  chk(info.split === 0 && info.shared >= 8, 'every cabinet with side art shares one texture L/R (shared ' + info.shared + ', split ' + info.split + ', missing ' + (info.missing || []).join(',') + ')');
  const noMap = (info.rows || []).filter(r => !r.hasMap);
  chk(noMap.length === 0, 'side maps assigned ' + JSON.stringify(noMap));
  // KTX2 is best-effort: if the transcoder ran, at least file-based sides should be compressed.
  const fileCabs = (info.rows || []).filter(r => /monkey|berserker|nova|orc|pip|rockfall|cyber|roadster/.test(r.k));
  const fileKtx = fileCabs.filter(r => r.compressed).length;
  if (fileKtx === 0) {
    console.log('NOTE no compressed side textures in this GPU (fallback images in use); file cabs ' + fileCabs.length);
  } else {
    chk(fileKtx >= 4, 'file-based cabinet sides loaded as KTX2/Basis (' + fileKtx + '/' + fileCabs.length + ')');
  }
  chk(o.errors.filter(e => !/KTX2 failed/.test(e)).length === 0, 'no unexpected page errors ' + o.errors.join('|'));
  console.log('rows', JSON.stringify(info.rows));
  await o.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message); process.exit(1); });
