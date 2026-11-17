// t911u: low-tier devices drop bloom and floor-mirror MSAA; mid/high keep a lighter or current look.
// NOSHOTS=1 node test/tier_fx.js
const { open } = require('./lib');
(async () => {
  let ok = true; const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const o = await open({ w: 844, h: 390 }); const p = o.page; p.setDefaultTimeout(90000);
  const q = await p.evaluate(async () => {
    const mod = await import(new URL('./tier.js', location.href).href);
    const mirrors = [];
    window.__arcade.scene.traverse(o => {
      if (o.isReflector && o.getRenderTarget) {
        const rt = o.getRenderTarget();
        mirrors.push({ name: o.name, w: rt.width, h: rt.height, samples: rt.samples || 0 });
      }
    });
    return {
      low: mod.qualityForTier('low'),
      mid: mod.qualityForTier('mid'),
      midPS: mod.qualityForTier('mid', { powerSave: true }),
      highM: mod.qualityForTier('high', { mobile: true }),
      high: mod.qualityForTier('high'),
      live: mod.tierQuality(),
      mirrors
    };
  });
  const { low, mid, midPS, highM, high, live, mirrors } = q;
  chk(low.bloom === 0 && low.post === false && low.refl === 0 && (low.mirrorSamples || 0) === 0 && (low.samples || 0) === 0, 'low: bloom off, no post, no floor-mirror MSAA');
  chk(mid.bloom <= 0.35 && (mid.mirrorSamples || 0) === 0, 'mid: reduced bloom, no mirror MSAA (bloom ' + mid.bloom + ')');
  chk((midPS.mirrorSamples || 0) === 0 && midPS.bloom <= 0.35, 'mid power-save: no mirror MSAA');
  chk(highM.bloom <= 0.4 && (highM.mirrorSamples || 0) === 0 && (highM.samples || 0) === 0, 'high mobile: slightly reduced bloom, no MSAA');
  chk(high.bloom <= 0.5 && (high.mirrorSamples || 0) <= 2 && (high.samples || 0) <= 2, 'high desktop: slight cuts, mirror MSAA <= 2');
  const liveMS = live.mirrorSamples || 0;
  const bad = mirrors.filter(m => (m.samples || 0) > liveMS && (m.w > 1 && m.h > 1));
  chk(bad.length === 0, 'live floor reflectors use Q.mirrorSamples=' + liveMS + ' ' + JSON.stringify(mirrors));
  chk(o.errors.length === 0, 'no page errors ' + o.errors.join('|'));
  await o.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + e.message); process.exit(1); });
