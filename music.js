// Room 1 background music: "Neon Nights" (105 BPM, 32-bar seamless loop, 1612800 samples @ 22.05 kHz mono)  // t930u: was stereo 44.1 kHz / 3225600, decoded with WebAudio and
// looped on exact sample points (encoder padding trimmed). Plays in room 1, the hallway and room 2 without a break (t244), while a cabinet
// is zoomed in / played, on the start screen, when the tab is hidden, or when MUSIC is off in Options ('neonarcade.music' = '0').
// t911u: keep only the currently playing decoded AudioBuffer. When the room track is fully stopped (cabinet loop, a game,
// start screen, hidden tab, MUSIC off) for a short hold, drop the decoded buffer and decode again on demand from a re-fetch.
// t930u: drop the compressed ArrayBuffer as soon as decode finishes (saves ~1 MB); a later load re-fetches (HTTP cache).
(function () {
  var N = 1612800, SR = 22050, VOL = 0.42, KEY = 'neonarcade.music', HOLD = 1000;
  var M = window.__music = { loaded: false, playing: false, gain: 0, target: 0, on: true, loopStart: 0, loopEnd: 0, len: 0, src: '', hasBuf: false, rawBytes: 0, freed: 0, decodes: 0 };
  try { M.on = localStorage.getItem(KEY) !== '0'; } catch (e) {}
  var ac = null, g = null, node = null, loading = false, buf = null, silentSince = 0;
  function pickSrc() { return 'audio/neon_nights.m4a'; }   // t930u: one format (AAC, Safari-safe); the stereo opus copy is gone
  function ctx() { if (!ac) { ac = window.__unlockAC || new (window.AudioContext || window.webkitAudioContext)(); window.__unlockAC = ac; } return ac; }
  function dropDecoded() {
    if (node) { try { node.stop(); } catch (e) {} try { node.disconnect(); } catch (e) {} node = null; }
    buf = null; M.hasBuf = false; M.loaded = false; M.playing = false; M.freed = (M.freed || 0) + 1;
  }
  function startNode(b) {
    if (!g) { g = ctx().createGain(); g.gain.value = 0; g.connect(ctx().destination); }
    if (node) { try { node.stop(); } catch (e) {} try { node.disconnect(); } catch (e) {} }
    node = ctx().createBufferSource(); node.buffer = b; node.loop = true; node.loopStart = M.loopStart; node.loopEnd = M.loopEnd; node.connect(g); node.start(0, M.loopStart);
    M.t0 = ctx().currentTime; M.loaded = true; M.playing = true; M.hasBuf = true;
  }
  function decodeRaw(ab) {
    return new Promise(function (ok, no) { ctx().decodeAudioData(ab, ok, no); });
  }
  function prepare(b) {
    // Encoder padding is a short prefix. Scale the classic 1024/2112-sample delays to the
    // decoded rate, or if the leftover is a short pad of any size, treat all of it as lead
    // so a 22.05 kHz file decoded at 48 kHz still loops on the 32-bar boundary.
    var expect = Math.round(N * b.sampleRate / SR), extra = b.length - expect, lead = 0, scale = b.sampleRate / SR;
    [2112, 1024].forEach(function (n) { var s = Math.round(n * scale); if (Math.abs(extra - s) <= 8) lead = s; });
    if (!lead && extra > 0 && extra < b.sampleRate * 0.25) lead = extra;
    M.len = b.length; M.sr = b.sampleRate; M.ch = b.numberOfChannels; M.loopStart = lead / b.sampleRate; M.loopEnd = M.loopStart + N / SR;
    buf = b; M.hasBuf = true; M.decodes = (M.decodes || 0) + 1;
  }
  function load() {
    if (loading) return; loading = true;
    ctx();
    if (!g) { g = ac.createGain(); g.gain.value = 0; g.connect(ac.destination); }
    var go = function (ab) {
      M.rawBytes = ab.byteLength;
      return decodeRaw(ab).then(function (b) { M.rawBytes = 0; prepare(b); startNode(b); loading = false; });
    };
    M.src = M.src || pickSrc();
    fetch(M.src).then(function (r) { return r.arrayBuffer(); }).then(go).catch(function (e) { M.err = String(e); loading = false; });
  }
  M.setOn = function (on) { M.on = !!on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} tick(); };
  M.pos = function () { return (M.loaded && ac && node) ? ((ac.currentTime - M.t0) % (M.loopEnd - M.loopStart)) : 0; };
  M.free = dropDecoded;
  function tick() {
    var S = window.__start, A = window.__arcade, onStart = !!document.getElementById('start') && !(S && S.dismissed);
    var want = 0;
    if (M.on && !onStart && !document.hidden && A && A.play) {
      var z = A.monkey.position.z, R = window.__mp && window.__mp.roomOf, k = R && R(A.monkey.position) === 'white' ? Math.max(0, Math.min(1, (z + 12 + 2.5) / 3)) : 1;
      want = A.play.mode === 'walk' ? VOL * k : 0;
    }
    if (window.__pa && window.__pa.playing) want *= 0.3;
    if (window.__cabMusic) want *= 1 - window.__cabMusic.duck;
    M.target = want; M.room1 = want > 0;
    if (want > 0.02) {
      silentSince = 0;
      if (S && S.dismissed && !M.hasBuf && !loading) load();
    } else if ((M.hasBuf || node) && (!onStart || document.hidden || (M.on === false))) {
      // hold before freeing so a brief cabinet walk-by does not thrash decode
      silentSince = silentSince || performance.now();
      if (performance.now() - silentSince >= HOLD) dropDecoded();
    }
    if (g && ac) { if (ac.state === 'suspended' && want > 0) ac.resume(); g.gain.setTargetAtTime(want, ac.currentTime, want > M.gain ? 0.5 : 0.25); M.gain = g.gain.value; }
  }
  setInterval(tick, 120); document.addEventListener('visibilitychange', tick);
})();
