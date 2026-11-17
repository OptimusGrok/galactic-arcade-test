// Galactic Arcade - cabinet music (drop-in kit; built by the Chief for Arcade to wire in).
// ONE player for both cases, so demo music and proximity music can never double up:
//   * walk mode: the nearest cabinet within RADIUS of the monkey plays its loop; the room track ducks (via __cabMusic.duck)
//   * cabinet DEMO view (play.mode 'game', sub 'demo'): that cabinet's loop plays (the game copies' demos are silent)
//   * playing a game, zooming, start screen, tab hidden, MUSIC off (window.__music.on === false): silent
// Crossfade: the next track is fetched + decoded first, then both ramps overlap for FADE s so a walk-up never goes silent
// and never restarts mid-note. Only one song is heard; the outgoing buffer is freed after its fade. MAX_CACHE stays 1 once settled (t911u / t923u).
// Room music hook: music.js multiplies its target by (1 - window.__cabMusic.duck)  (see INTEGRATION.md).
(function () {
  var VOL = 0.38, FADE = 0.6, RADIUS = 2.8, HYST = 0.5, MAX_CACHE = 1, BASE = '';
  // t771u/t916u: tracks are the games' own music, recorded from the arcade copies in-repo (tools/render_cab_music.js).
  // strike = stage-1 loop from strike-play's engine; berserker = its title_music.m4a. Blaster, claw, roadster and
  // rockfall have no BGM in the copies (SFX / engine only), so those three keep the kit loops; rockfall stays silent.
  // exact loop lengths (samples at `rate`) skip mp3 encoder padding like music.js does.
  var TRACKS = {
    strike: { src: 'audio/cab_strike.mp3', samples: 1638813, rate: 22050 }, monkey: { src: 'audio/cab_monkey.mp3', samples: 355560, rate: 22050 },
    nova: { src: 'audio/cab_nova.mp3', samples: 357443, rate: 22050 }, cyber: { src: 'audio/cab_cyber.mp3', samples: 357443, rate: 22050 },
    orc: { src: 'audio/cab_orc.mp3', samples: 357443, rate: 22050 }, ghost: { src: 'audio/cab_ghost.mp3', samples: 357443, rate: 22050 },
    roadster: { src: 'audio/cab_roadster.mp3', samples: 294000, rate: 22050 }, ds: { src: 'audio/cab_ds.mp3', samples: 353678, rate: 22050 },
    blaster: { src: 'audio/cab_blaster.mp3', samples: 264600, rate: 22050 }, pip: { src: 'audio/cab_pip.mp3', samples: 291060, rate: 22050 },
    claw: { src: 'audio/cab_claw.mp3', samples: 384873, rate: 22050 }, bb: { src: 'audio/cab_bb.mp3', samples: 357443, rate: 22050 },
    skytower: { src: 'audio/cab_skytower.mp3', samples: 355560, rate: 22050 },
    berserker: { src: 'berserker-play/title_music.m4a', vol: 0.3 }
  };
  var C = window.__cabMusic = { tracks: TRACKS, want: null, cur: null, duck: 0, fades: 0, loads: 0, starts: 0, maxSources: 0, radius: RADIUS, err: null };
  var ac = null, out = null, node = null, ng = null, curKey = null, cache = {}, order = [], pending = {}, pos = null, lastNear = null, live = 0;
  var pendingKey = null, switchId = 0, holdUntil = 0, HOLD = 1400, STICK = 0.7;
  function ctx() { if (!ac) { ac = window.__unlockAC || new (window.AudioContext || window.webkitAudioContext)(); window.__unlockAC = ac; if (ac.state === 'suspended') ac.resume(); out = ac.createGain(); out.gain.value = 1; out.connect(ac.destination); } return ac; }
  function remember(k, buf) {
    cache[k] = buf; if (order.indexOf(k) < 0) order.push(k);
    // Keep the playing and incoming buffers; evict everything else so we stay at one song after handover.
    var keep = {}; keep[curKey] = 1; keep[C.want] = 1; keep[pendingKey] = 1; keep[k] = 1;
    var next = [];
    for (var i = 0; i < order.length; i++) { var o = order[i]; if (keep[o] && next.indexOf(o) < 0) next.push(o); else if (!keep[o]) delete cache[o]; }
    order = next;
  }
  function evictKey(k) {
    if (!k || k === curKey || k === C.want || k === pendingKey) return;
    delete cache[k]; var i = order.indexOf(k); if (i >= 0) order.splice(i, 1);
  }
  function load(k) {
    if (cache[k]) return Promise.resolve(cache[k]); if (pending[k]) return pending[k]; var t = TRACKS[k]; if (!t) return Promise.reject('no track ' + k);
    C.loads++;
    return pending[k] = fetch(BASE + t.src).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.src);
        return r.arrayBuffer();
      }).then(function (b) { return new Promise(function (ok, no) { ctx().decodeAudioData(b, ok, no); }); })
      .then(function (buf) { delete pending[k]; remember(k, buf); return buf; })
      .catch(function (e) { delete pending[k]; C.err = String(e && e.message || e); throw e; });
  }
  function fadeOutNode(n, g, oldKey) {
    if (!n || !g) return;
    var t = ctx().currentTime; try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + FADE); } catch (e) {}
    C.fades++;
    setTimeout(function () { try { n.stop(); } catch (e) {} try { n.disconnect(); g.disconnect(); } catch (e) {} live = Math.max(0, live - 1); evictKey(oldKey); }, FADE * 1000 + 40);
  }
  function fadeOut() {
    if (!node) { curKey = null; C.cur = null; return; }
    var n = node, g = ng, oldKey = curKey;
    node = null; ng = null; curKey = null; C.cur = null;
    fadeOutNode(n, g, oldKey);
  }
  function fadeIn(k, buf) {
    var t = TRACKS[k], a = ctx(), n = a.createBufferSource(), g = a.createGain(); n.buffer = buf; n.loop = true;
    if (t.samples) { var len = t.samples * buf.sampleRate / t.rate, extra = buf.length - len, lead = extra >= 1105 ? Math.min(extra, 1105) : 0;   // 529+576 (mp3 priming)
      var start = lead / buf.sampleRate, end = start + len / buf.sampleRate;
      if (end > 0 && end <= buf.duration + 1e-4) { n.loopStart = start; n.loopEnd = Math.min(end, buf.duration); } }
    g.gain.value = 0; n.connect(g); g.connect(out);
    if (a.state === 'suspended') a.resume();
    n.start(0, n.loopStart || 0); var now = a.currentTime; g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(t.vol || VOL, now + FADE);
    node = n; ng = g; curKey = k; C.cur = k; C.starts++; C.fades++; live++; C.maxSources = Math.max(C.maxSources, live);
  }
  function apply(k) {
    if (k && k === curKey && node) { pendingKey = null; return; }
    if (k && k === pendingKey) return;
    if (!k) { pendingKey = null; switchId++; if (node) fadeOut(); return; }
    pendingKey = k; var id = ++switchId;
    load(k).then(function (buf) {
      if (id !== switchId || C.want !== k) return;
      if (k === curKey && node) { pendingKey = null; return; }
      var oldN = node, oldG = ng, oldKey = curKey;
      node = null; ng = null;  // fadeIn assigns the new source; old is faded in parallel (no silence gap)
      fadeIn(k, buf); pendingKey = null;
      if (oldN) fadeOutNode(oldN, oldG, oldKey);
    }).catch(function () { if (id === switchId) pendingKey = null; });
  }
  // cabinet positions (stand-in-front point) per play.js machine key; cabinets never move, so this is built once
  function positions(A) {
    if (pos) return pos; var P = A.play, M = P && P.machines; if (!M) return null; pos = [];
    for (var k in M) { var c = M[k].cab; if (!c || !TRACKS[k]) continue; var u = c.userData || {}, p = u.front ? { x: u.front.x, z: u.front.z } : (function () { var v = new A.THREE.Vector3(); c.getWorldPosition(v); return { x: v.x, z: v.z }; })();
      pos.push({ k: k, x: p.x, z: p.z }); if (k === 'roadster' && u.frontR) pos.push({ k: k, x: u.frontR.x, z: u.frontR.z }); }
    return pos;
  }
  C.setPositions = function (list) { pos = list; };   // [{k,x,z}] override (tests / other rooms)
  C.nearest = function (x, z) {
    var best = null, bd = Infinity, lastD = Infinity;
    (pos || []).forEach(function (p) { var d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.k; } if (lastNear && p.k === lastNear && d < lastD) lastD = d; });
    // Stay on the current cabinet while the player is still in its (radius + hysteresis) so
    // walking a tight row does not retrigger fade/decode every few hundred ms.
    if (lastNear && lastD <= RADIUS + HYST) {
      if (best && best !== lastNear && bd < lastD - STICK) return best;
      return lastNear;
    }
    var r = RADIUS + (best && best === lastNear ? HYST : 0);
    return bd <= r ? best : null;
  };
  function wanted() {
    var A = window.__arcade, S = window.__start, M = window.__music;
    if (!A || !A.play || document.hidden || (M && M.on === false) || (document.getElementById('start') && !(S && S.dismissed))) return null;
    var P = A.play;
    if (P.mode === 'game') return P.sub === 'demo' && P.cur && TRACKS[P.cur.key] ? P.cur.key : null;
    if (P.mode !== 'walk' || !positions(A)) return null;
    var m = A.monkey.position, k = C.nearest(m.x, m.z);
    var now = performance.now();
    if (k && lastNear && k !== lastNear && now < holdUntil) {
      var stay = Infinity;
      (pos || []).forEach(function (p) { if (p.k === lastNear) stay = Math.min(stay, Math.hypot(p.x - m.x, p.z - m.z)); });
      if (stay <= RADIUS + HYST) k = lastNear;   // min play time, unless we've left the last cabinet
    }
    if (k && k !== lastNear) holdUntil = now + HOLD;
    lastNear = k; return k;
  }
  var idleSince = 0;
  function evictIdle() {
    Object.keys(cache).forEach(function (key) { evictKey(key); });
    if (!curKey && !C.want && !pendingKey) { cache = {}; order = []; }
  }
  function tick() {
    var k = null; try { k = wanted(); } catch (e) { C.err = String(e); }
    C.want = k; apply(k);
    C.bufCount = Object.keys(cache).length; C.cached = Object.keys(cache);
    // duck the room track while a cabinet loop is (or is about to be) playing in walk mode; in game mode music.js is already at 0
    var target = k ? 1 : 0; C.duck += (target - C.duck) * 0.5; if (C.duck < 0.01) C.duck = 0; if (C.duck > 0.99) C.duck = 1;
    if (!k && !curKey) { idleSince = idleSince || performance.now(); if (performance.now() - idleSince > 1000) evictIdle(); }
    else idleSince = 0;
  }
  C.tick = tick; setInterval(tick, 120); document.addEventListener('visibilitychange', tick);
})();
