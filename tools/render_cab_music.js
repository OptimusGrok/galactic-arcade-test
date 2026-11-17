#!/usr/bin/env node
// Render each arcade copy's real music to audio/cab_<key>.mp3 (repo copies only; never edits standalones).
// Usage: node tools/render_cab_music.js [keys...]
const { chromium } = require('/workspace/burrow-buster/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'audio');
const SECS = 16;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
function serve() {
  return new Promise(r => {
    const s = http.createServer((q, res) => {
      let p = decodeURIComponent((q.url || '/').split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
    });
    s.listen(0, () => r(s));
  });
}
const TAP = () => {
  const rec = { samples: [], sr: 0, peak: 0, hooked: 0, ctx: [] };
  window.__rec = rec;
  const Orig = window.AudioContext || window.webkitAudioContext;
  if (!Orig || Orig.__cabTap) return;
  function hook(ctx) {
    if (!ctx || ctx.__tapped) return ctx;
    ctx.__tapped = true; rec.hooked++; rec.sr = ctx.sampleRate;
    const slot = { peak: 0, samples: [], sr: ctx.sampleRate, skip: !!ctx.__cabDummy };
    rec.ctx.push(slot);
    const sp = ctx.createScriptProcessor(4096, 2, 2), mute = ctx.createGain();
    // A true 0 gain can let Chrome skip the ScriptProcessor; keep a tiny output so chunks arrive.
    mute.gain.value = 0.0001; sp.connect(mute); mute.connect(ctx.destination);
    sp.onaudioprocess = ev => {
      if (slot.skip) return;
      const L = ev.inputBuffer.getChannelData(0), R = ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : L;
      const n = L.length, m = new Float32Array(n);
      let peak = 0;
      for (let i = 0; i < n; i++) { const v = 0.5 * (L[i] + R[i]); m[i] = v; const a = Math.abs(v); if (a > peak) peak = a; }
      if (peak > slot.peak) slot.peak = peak;
      if (peak > rec.peak) rec.peak = peak;
      slot.samples.push(m);
    };
    const proto = AudioNode.prototype;
    if (!proto.__cabTap) {
      proto.__cabTap = true;
      const conn = proto.connect;
      proto.connect = function (dest) {
        const ret = conn.apply(this, arguments);
        try { if (dest === this.context.destination && this !== sp && this !== mute) conn.call(this, sp); } catch (e) {}
        return ret;
      };
    }
    return ctx;
  }
  class TapAC extends Orig { constructor(...a) { super(...a); hook(this); } }
  TapAC.__cabTap = true;
  window.AudioContext = window.webkitAudioContext = TapAC;
};
const GAMES = {
  monkey: { url: 'monkey-play/index.html', start: () => { if (typeof au === 'function') au(); } },
  nova: { url: 'nova-play/index.html', start: () => {
    const Audio = window.NV && window.NV.Audio, Music = window.NV && window.NV.Music;
    if (Audio && Audio.init) Audio.init();
    if (Music) { Music.forceOn = true; try { window.NV.start({}); } catch (e) {} Music.sync(); }
  } },
  orc: { url: 'orc-play/index.html', start: () => {
    try { if (window.__TD && window.__TD.begin) window.__TD.begin(false); } catch (e) {}
  } },
  ghost: { url: 'ghost-play/index.html', start: () => {
    const g = window.__ghost; if (g && g.startGame) g.startGame(1); else if (typeof startGame === 'function') startGame(1);
  } },
  ds: { url: 'ds-play/index.html', start: () => {
    if (typeof auInit === 'function') auInit();
    const L = (window.G && (window.G.L || window.G.level)) || { drone: [80, 200] };
    if (typeof ambientStart === 'function') ambientStart(L);
  } },
  pip: { url: 'pip-play/index.html', start: () => {
    const p = window.__pip; if (p && p.start) { try { p.start(); } catch (e) {} }
  } },
  bb: { url: 'bb-play/index.html', start: () => {
    if (typeof audioUnlock === 'function') audioUnlock();
    if (typeof Audio !== 'undefined' && Audio.init) try { Audio.init(); } catch (e) {}
    if (typeof Music !== 'undefined' && Music.tick) {
      if (window.__bbMus) clearInterval(window.__bbMus);
      window.__bbMus = setInterval(() => { try { Music.tick(); } catch (e) {} }, 140);
    }
  } },
  cyber: { url: 'cybercity-play/index.html', start: () => {
    if (window.Audio8) { try { Audio8.init(); Audio8.setMuted && Audio8.setMuted(false); Audio8.play && Audio8.play('title'); } catch (e) {} }
  } },
  skytower: { url: 'sky-tower-play/index.html', start: () => {
    const S = window.__skySnd; if (!S) return;
    try { S.unlock && S.unlock(); S.start && S.start(); if (S.wanted === false) S.wanted = true; S.tick && S.tick(0.3); } catch (e) {}
  } },
  blaster: { url: 'blaster-play/index.html', start: () => { /* SFX only — probe anyway */ if (typeof ac === 'function') ac(); } },
  claw: { url: 'claw-play/index.html', start: () => { if (typeof unlock === 'function') unlock(); } },
  rockfall: { url: 'rockfall-play/index.html', start: () => { /* SFX only */ } },
  roadster: { url: 'mr-play/index.html', start: () => { if (typeof audio === 'function') audio(); } },
};
function pcmToWav(samples, sr) {
  let n = 0; for (const s of samples) n += s.length;
  const pcm = Buffer.alloc(n * 2);
  let o = 0, peak = 1e-6;
  for (const s of samples) for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > peak) peak = a; }
  const gain = peak > 1e-4 ? Math.min(0.95 / peak, 4) : 1;
  for (const s of samples) for (let i = 0; i < s.length; i++) {
    let v = Math.max(-1, Math.min(1, s[i] * gain));
    pcm.writeInt16LE((v * 32767) | 0, o); o += 2;
  }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(sr, 24); hdr.writeUInt32LE(sr * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  return { wav: Buffer.concat([hdr, pcm]), n, peak, sr, gain };
}
// Chiptune cabinet loops have short notes and rests. Treat hops within 350 ms of a
// note as voiced, then keep the longest (or loudest 12 s) stretch.
function trimVoiced(chunks, sr, minSec = 6) {
  const flat = [];
  for (const c of chunks) for (let i = 0; i < c.length; i++) flat.push(c[i]);
  if (flat.length / sr < minSec) return null;
  const hop = Math.max(1, Math.round(sr * 0.05));
  const rms = [];
  for (let i = 0; i < flat.length; i += hop) {
    let s = 0, n = 0;
    for (let j = i; j < i + hop && j < flat.length; j++) { s += flat[j] * flat[j]; n++; }
    rms.push(n ? Math.sqrt(s / n) : 0);
  }
  const pad = Math.max(1, Math.round(0.35 / 0.05));
  const ok = rms.map(() => false);
  for (let i = 0; i < rms.length; i++) if (rms[i] > 0.003) {
    for (let k = Math.max(0, i - pad); k <= Math.min(rms.length - 1, i + pad); k++) ok[k] = true;
  }
  let bestA = 0, bestB = 0, a = 0;
  for (let i = 0; i <= ok.length; i++) {
    if (ok[i]) { if (!ok[i - 1]) a = i; }
    else if (i && ok[i - 1]) { if (i - a > bestB - bestA) { bestA = a; bestB = i; } }
  }
  let start = bestA * hop, end = Math.min(flat.length, bestB * hop);
  if ((end - start) / sr < minSec) {
    // Fall back to the loudest 12 s window so a sparse hook still becomes a loop.
    const win = Math.min(flat.length, Math.round(sr * 12));
    let bestS = 0, bestE = 0, best = -1, acc = 0, i0 = 0, accN = 0;
    for (let i = 0; i < flat.length; i++) {
      acc += flat[i] * flat[i]; accN++;
      if (i - i0 + 1 > win) { acc -= flat[i0] * flat[i0]; accN--; i0++; }
      if (i - i0 + 1 >= win && acc / accN > best) { best = acc / accN; bestS = i0; bestE = i + 1; }
    }
    if (best < 0.00001) return null;
    start = bestS; end = bestE;
  }
  if ((end - start) / sr < minSec) return null;
  return { chunks: [Float32Array.from(flat.slice(start, end))], sr };
}

async function recOne(browser, base, key, spec) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(TAP);
  await page.goto(base + spec.url, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.mouse.click(400, 300);
  await page.keyboard.press('Enter');
  await page.evaluate(async () => {
    try {
      if (window.__unlockAC) await window.__unlockAC.resume();
      else {
        const a = window.AudioContext ? new window.AudioContext() : null;
        if (a) { a.__cabDummy = true; window.__unlockAC = a; await a.resume(); }
      }
    } catch (e) {}
    const b = [...document.querySelectorAll('button, .start, #start, #play, #go')].find(el => /start|play|begin|ok/i.test((el.textContent||el.id||'')));
    if (b) try { b.click(); } catch (e) {}
  });
  await page.evaluate(spec.start);
  // Wait until the game is actually making sound, then keep SECS of audio.
  try {
    await page.waitForFunction(() => window.__rec && window.__rec.peak > 0.02, null, { timeout: 8000 });
  } catch (e) {}
  await page.evaluate(() => {
    const r = window.__rec; if (!r) return;
    (r.ctx || []).forEach(s => { s.samples = []; s.peak = 0; });
    r.samples = []; r.peak = 0;
  });
  await page.waitForTimeout(SECS * 1000 + 200);
  const dump = await page.evaluate(() => {
    const r = window.__rec || { samples: [], sr: 0, peak: 0, hooked: 0, ctx: [] };
    const slots = (r.ctx || []).filter(s => !s.skip);
    let best = slots[0] || { samples: [], sr: r.sr, peak: 0 };
    for (const s of slots) if ((s.peak || 0) > (best.peak || 0)) best = s;
    return { sr: best.sr || r.sr, peak: best.peak || r.peak, hooked: r.hooked, chunks: (best.samples || []).length, data: best.samples || [], ctxPeaks: slots.map(s => +s.peak.toFixed(4)) };
  });
  await ctx.close();
  const chunks = (dump.data || []).map(a => Float32Array.from(a));
  const info = { key, hooked: dump.hooked, peak: +(+dump.peak || 0).toFixed(4), chunks: dump.chunks, sr: dump.sr, errors: errors.slice(0, 5) };
  if (!chunks.length || dump.peak < 0.002) { info.ok = false; info.reason = 'silent or no audio (peak ' + dump.peak + ')'; return info; }
  const trimmed = trimVoiced(chunks, dump.sr || 44100);
  if (!trimmed) { info.ok = false; info.reason = 'no continuous voiced stretch'; return info; }
  const { wav, n, peak, sr } = pcmToWav(trimmed.chunks, trimmed.sr);
  const wavPath = path.join('/tmp', 'cab_' + key + '.wav');
  const mp3Path = path.join(OUT, 'cab_' + key + '.mp3');
  fs.writeFileSync(wavPath, wav);
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-ac', '1', '-ar', '22050', '-b:a', '48k', mp3Path], { encoding: 'utf8' });
  if (ff.status !== 0) { info.ok = false; info.reason = 'ffmpeg ' + (ff.stderr || ff.stdout); return info; }
  const st = fs.statSync(mp3Path);
  info.ok = true; info.samples = n; info.rate = sr; info.out = 'audio/cab_' + key + '.mp3'; info.bytes = st.size; info.sec = +(n / sr).toFixed(2);
  return info;
}
(async () => {
  const want = process.argv.slice(2);
  const keys = want.length ? want : Object.keys(GAMES);
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const chromeBins = ['/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ungoogled-chromium/chrome'];
  const executablePath = chromeBins.find(f => fs.existsSync(f));
  const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const out = [];
  try {
    for (const k of keys) {
      if (!GAMES[k]) { console.log('skip unknown', k); continue; }
      process.stdout.write('RECORD ' + k + ' ... ');
      try {
        const info = await recOne(browser, base, k, GAMES[k]);
        out.push(info);
        console.log(JSON.stringify(info));
      } catch (e) {
        const info = { key: k, ok: false, reason: String(e) }; out.push(info); console.log(JSON.stringify(info));
      }
    }
  } finally { await browser.close(); srv.close(); }
  fs.writeFileSync('/tmp/cab_music_render.json', JSON.stringify(out, null, 2));
  const ok = out.filter(x => x.ok).map(x => x.key);
  const no = out.filter(x => !x.ok).map(x => x.key + ':' + (x.reason || '?'));
  console.log('OK', ok.join(',') || '(none)', 'FAIL', no.join(',') || '(none)');
  process.exit(out.some(x => !x.ok && !/silent/.test(x.reason || '')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
