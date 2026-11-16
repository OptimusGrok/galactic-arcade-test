// t856u / v237 + t857u / v238 + t858u / v239 + t859u / v240 + t864u / v241: Quest 2D thumbstick support.
// Research (Meta Browser specs, Meta input mappings, WebXR issues #995/#1347, Chromium wheel routing):
//  - In 2D Quest Browser the thumbstick is a SCROLL device (like a mouse wheel), not a Gamepad.
//    XR controllers are typically exposed via getGamepads() only inside a WebXR session.
//  - Desktop mode is the default; meta viewport tags (user-scalable=no) are IGNORED, so the
//    "zoom in/out" Dave saw is likely browser pinch-zoom (visualViewport.scale) or page zoom
//    (devicePixelRatio), not the arcade camera. Chromium can turn an unconsumed wheel into
//    EventAction kPageZoom when nothing is scrollable. This page used overflow:hidden, so
//    there was no scroll target.
//  - wheel may never reach JS (compositor scroll / only first event cancelable). A scrollable
//    sentinel + visualViewport/gesture/pinch/key fallbacks are needed.
//  - v240: do NOT make html/body overflow:scroll or inject a 300vw spacer — that recentres
//    the document and can slide position:fixed #start off-screen. Do NOT style all canvases
//    as fullscreen (that blew #gaCv, the start-screen player preview, over the PLAY button).
//    Isolated #gaQscroll sentinel only; pin only the room canvas (body > canvas) behind #start.
//  - v241 (Dave's Quest 3 ?qdbg=1 photo): wheel events ARRIVE (count + last dx/dy) but src stays
//    none, move stays 0, age stays "-". Cause: the controller ray fires pointermove/touch
//    (pointerType "touch") continuously, so lastDrag never goes stale and onWheel returns
//    before ingest(). On Quest, wheel always drives movement unless a real 2-finger pinch is
//    happening right now. Start-screen gate checks #start visibility directly.
//  - An "Enter VR controls" WebXR session is NOT added: immersive-vr would leave the 2D arcade,
//    and Dave's overlay confirms getGamepads()=0 in 2D even though xr vr=true. Flag support
//    in ?qdbg=1 instead.
(function (root) {
  'use strict';
  var DEAD = 0.18;
  var AXIS_SCALE = 80;
  var HOLD = 150;
  var FADE = 80;
  var cssOn = false, listenOn = false, loopOn = false, keyListenOn = false, keysOn = {};
  var lastDrag = 0, lastWheelEvt = 0, lastIngestAt = 0, lastIngestSrc = 'none', touchCount = 0, lastTouchAt = 0;
  var virtX = 0, virtY = 0;
  var lastWheelDx = 0, lastWheelDy = 0, lastWheelCtrl = false;
  var heldKeys = Object.create(null);
  var dbgEl = null, dbgOn = false, unlocked = false, recentring = false;
  var sentinel = null, midSX = 0, midSY = 0;
  var lastScale = 1, lastVvX = 0, lastVvY = 0, pinchDist0 = 0, gestureScale0 = 1;
  var lastWheelStamp = 0;
  var counts = { wheel: 0, mousewheel: 0, scroll: 0, vvresize: 0, vvscroll: 0, gesture: 0, touch: 0, pinch: 0, key: 0, gamepad: 0, pointer: 0 };
  var xrInfo = { inline: null, 'immersive-vr': null, 'immersive-ar': null };

  function isQuest() {
    if (root.__gaForceQuest) return true;
    try {
      var ua = navigator.userAgent || '';
      return /OculusBrowser/i.test(ua) || /\bQuest\b/i.test(ua);
    } catch (e) { return false; }
  }

  function startUp() {
    // v241: trust whether #start is actually on screen, not only __start.shown
    // (that flag can lag or stick after dismiss / skipStart / the .out fade).
    try {
      var el = document.getElementById('start');
      if (!el || !el.isConnected) return false;
      if (window.__start && window.__start.dismissed) return false;
      if (el.classList && el.classList.contains('out')) return false;
      var r = el.getBoundingClientRect && el.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return false;
      var cs = root.getComputedStyle ? root.getComputedStyle(el) : null;
      if (cs) {
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (cs.pointerEvents === 'none') return false;
        if (parseFloat(cs.opacity) === 0) return false;
      }
      return true;
    } catch (e) {}
    return false;
  }

  function fromStartUI(e) {
    if (!startUp()) return false;
    var t = e && e.target;
    try {
      if (t && t.closest && t.closest('#start, #gaP, #opt, #turnHint, #homeQ')) return true;
    } catch (err) {}
    return false;
  }

  function pinchNow() { return touchCount >= 2 && lastTouchAt && (performance.now() - lastTouchAt) < 200; }

  function wantDebug() {
    if (root.__gaQuestDbg) return true;
    try {
      var q = String(location.search || '') + String(location.hash || '');
      return /[?&#]qdbg=1(?:&|$)/.test(q);
    } catch (e) { return false; }
  }

  function bump(k) { counts[k] = (counts[k] || 0) + 1; }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function padList() {
    var raw = [], i, gp;
    try {
      gp = (navigator.getGamepads && navigator.getGamepads()) || [];
      for (i = 0; i < gp.length; i++) if (gp[i] && gp[i].connected !== false) raw.push(gp[i]);
    } catch (e) {}
    return raw;
  }

  function padIds() {
    return padList().map(function (g) { return (g.index != null ? g.index + ':' : '') + (g.id || '?') + (g.mapping ? '(' + g.mapping + ')' : ''); });
  }

  function handOf(gp) {
    var id = String((gp && gp.id) || '');
    var h = (gp && (gp.hand || gp.handedness)) || '';
    if (/right/i.test(id) || h === 'right') return 'right';
    if (/left/i.test(id) || h === 'left') return 'left';
    return '';
  }

  function pair(axes, i) {
    var x = +axes[i] || 0, y = +axes[i + 1] || 0;
    if (!isFinite(x)) x = 0;
    if (!isFinite(y)) y = 0;
    return { x: x, y: y, mag: Math.hypot(x, y) };
  }

  function live(s) {
    if (!s || s.mag < DEAD) return { x: 0, y: 0, mag: 0 };
    return s;
  }

  function pressed(gp, i) {
    var b = gp.buttons && gp.buttons[i];
    if (!b) return false;
    return !!(b.pressed || (typeof b.value === 'number' && b.value >= 0.5));
  }

  function virtStick() {
    if (!lastIngestAt) return { x: 0, y: 0, mag: 0 };
    var age = performance.now() - lastIngestAt;
    var k = 1;
    if (age > HOLD) k = Math.max(0, 1 - (age - HOLD) / FADE);
    if (k <= 0) return { x: 0, y: 0, mag: 0 };
    var x = virtX * k, y = virtY * k;
    return { x: x, y: y, mag: Math.hypot(x, y) };
  }

  function keyList() {
    var out = [], k;
    for (k in heldKeys) if (heldKeys[k]) out.push(k);
    out.sort();
    return out;
  }

  function ingest(source, nx, ny) {
    nx = clamp(+nx || 0, -1, 1);
    ny = clamp(+ny || 0, -1, 1);
    var mag = Math.hypot(nx, ny);
    if (mag > 1) { nx /= mag; ny /= mag; }
    virtX = clamp(virtX * 0.35 + nx * 0.65, -1, 1);
    virtY = clamp(virtY * 0.35 + ny * 0.65, -1, 1);
    lastIngestAt = performance.now();
    lastIngestSrc = source || 'virt';
    if (isPlayFrame()) applyPlay(read());
    return virtStick();
  }

  function readPads() {
    var pads = padList();
    var move = { x: 0, y: 0, mag: 0 }, look = { x: 0, y: 0, mag: 0 };
    var fire = false, fly = false, zoom = false, unhanded = [], i, j, gp, axes, s01, s23, stick, alt, hand, mapping;
    for (i = 0; i < pads.length; i++) {
      gp = pads[i];
      axes = gp.axes || [];
      s01 = live(pair(axes, 0));
      s23 = live(pair(axes, 2));
      mapping = gp.mapping || '';
      if (mapping === 'xr-standard') {
        stick = s23.mag ? s23 : s01;
        alt = { x: 0, y: 0, mag: 0 };
      } else if (s01.mag && s23.mag) {
        stick = s01; alt = s23;
      } else {
        stick = s01.mag ? s01 : s23;
        alt = { x: 0, y: 0, mag: 0 };
      }
      hand = handOf(gp);
      if (hand === 'right') {
        if (stick.mag) look = stick;
      } else if (hand === 'left') {
        if (stick.mag) move = stick;
        if (alt.mag) look = alt;
      } else if (s01.mag && s23.mag && mapping !== 'xr-standard') {
        move = s01; look = s23;
      } else if (stick.mag) {
        unhanded.push(stick);
      }
      if (mapping === 'xr-standard') {
        if (pressed(gp, 0) || pressed(gp, 4)) fire = true;
        if (pressed(gp, 1) || pressed(gp, 5)) fly = true;
        if (pressed(gp, 3)) zoom = true;
      } else {
        if (pressed(gp, 0) || pressed(gp, 2) || pressed(gp, 6) || pressed(gp, 7)) fire = true;
        if (pressed(gp, 1) || pressed(gp, 5)) fly = true;
        if (pressed(gp, 3) || pressed(gp, 4)) zoom = true;
      }
    }
    for (j = 0; j < unhanded.length; j++) {
      if (!move.mag) move = unhanded[j];
      else if (!look.mag) look = unhanded[j];
    }
    return { move: move, look: look, fire: fire, fly: fly, zoom: zoom, n: pads.length };
  }

  function read() {
    var pads = readPads();
    var v = virtStick();
    var keys = keyList();
    var move = pads.move, look = pads.look, source = 'none';
    if (move.mag) source = 'gamepad';
    else if (v.mag) { move = v; source = lastIngestSrc || 'virt'; }
    else if (keys.length) source = 'key';
    var vv = root.visualViewport;
    return {
      move: move, look: look,
      fire: pads.fire, fly: pads.fly, zoom: pads.zoom,
      n: pads.n, source: source, keys: keys, counts: counts, unlocked: unlocked,
      pads: padIds(),
      ua: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
      scale: vv ? vv.scale : 1,
      dpr: root.devicePixelRatio || 1,
      xr: xrInfo,
      wheel: {
        dx: lastWheelDx, dy: lastWheelDy,
        age: lastIngestAt ? +(performance.now() - lastIngestAt).toFixed(0) : null,
        x: v.x, y: v.y, ctrl: lastWheelCtrl
      }
    };
  }

  function ensureViewport() {
    try {
      var m = document.querySelector('meta[name="viewport"]');
      if (!m) {
        m = document.createElement('meta');
        m.setAttribute('name', 'viewport');
        m.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
        (document.head || document.documentElement).appendChild(m);
      } else if (!/user-scalable\s*=\s*no/i.test(m.getAttribute('content') || '')) {
        m.setAttribute('content', (m.getAttribute('content') || '') + ',maximum-scale=1,user-scalable=no');
      }
    } catch (e) {}
  }

  function applyCss() {
    if (cssOn) return;
    cssOn = true;
    try {
      var s = document.createElement('style');
      s.setAttribute('data-ga-quest', '1');
      // Never unlock document overflow or inflate the layout: position:fixed #start / HUD would
      // scroll off, and a blanket canvas rule made #gaCv (start preview) cover PLAY.
      s.textContent = 'html.gaQuest,html.gaQuest body{overflow:hidden!important;overscroll-behavior:none!important}'
        + 'html.gaQuest body>canvas,html.gaQuest canvas.gaQuestRoom{position:fixed!important;inset:0;width:100%!important;height:100%!important;z-index:0}'
        + 'html.gaQuest #start{z-index:100!important}'
        + '#gaQscroll{position:fixed;inset:0;overflow:scroll;z-index:0;pointer-events:none;opacity:0;overscroll-behavior:auto}'
        + '#gaQdbg{position:fixed;top:max(4px,env(safe-area-inset-top));left:max(4px,env(safe-area-inset-left));z-index:2147483000;pointer-events:none;background:#000c;color:#9ff;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:6px 8px;border:1px solid #0ff6;border-radius:6px;white-space:pre;max-width:min(96vw,420px)}';
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
    ensureViewport();
  }

  function showDebug(on) {
    dbgOn = on !== false;
    if (!dbgOn) {
      if (dbgEl && dbgEl.parentNode) dbgEl.parentNode.removeChild(dbgEl);
      dbgEl = null;
      return;
    }
    applyCss();
    if (!dbgEl) {
      dbgEl = document.createElement('div');
      dbgEl.id = 'gaQdbg';
      (document.body || document.documentElement).appendChild(dbgEl);
    }
    renderDebug(read());
  }

  function renderDebug(s) {
    if (!dbgOn) return;
    if (!dbgEl) showDebug(true);
    if (!dbgEl) return;
    s = s || api.last || {};
    var w = s.wheel || {};
    var mv = s.move || {};
    var lk = s.look || {};
    var c = s.counts || counts;
    var ua = (s.ua || '').slice(0, 180);
    var xr = s.xr || {};
    dbgEl.textContent = 'GA Quest dbg v241'
      + '\nUA ' + (ua || '-')
      + '\nsrc ' + (s.source || 'none')
      + ' unlocked=' + (s.unlocked ? '1' : '0')
      + '\nwheel dx=' + (w.dx == null ? '-' : (+w.dx).toFixed(1))
      + ' dy=' + (w.dy == null ? '-' : (+w.dy).toFixed(1))
      + ' age=' + (w.age == null ? '-' : w.age + 'ms')
      + (w.ctrl ? ' CTRL' : '')
      + '\nmove x=' + (mv.x || 0).toFixed(2) + ' y=' + (mv.y || 0).toFixed(2)
      + ' look x=' + (lk.x || 0).toFixed(2) + ' y=' + (lk.y || 0).toFixed(2)
      + '\nvv.scale=' + (s.scale == null ? '-' : (+s.scale).toFixed(3))
      + ' dpr=' + (s.dpr == null ? '-' : (+s.dpr).toFixed(3))
      + '\ngamepads ' + (s.n || 0) + ' ' + ((s.pads && s.pads.length) ? s.pads.join(' | ') : '-')
      + '\nkeys ' + ((s.keys && s.keys.length) ? s.keys.join(',') : '-')
      + '\nstart=' + (startUp() ? '1' : '0')
      + ' pinch=' + (pinchNow() ? '1' : '0')
      + ' drag=' + (lastDrag ? Math.round(performance.now() - lastDrag) + 'ms' : '0')
      + '\ncounts wheel=' + (c.wheel || 0)
      + ' mousewheel=' + (c.mousewheel || 0)
      + ' scroll=' + (c.scroll || 0)
      + ' vvR=' + (c.vvresize || 0)
      + ' vvS=' + (c.vvscroll || 0)
      + ' gest=' + (c.gesture || 0)
      + ' pinch=' + (c.pinch || 0)
      + ' touch=' + (c.touch || 0)
      + ' key=' + (c.key || 0)
      + ' gp=' + (c.gamepad || 0)
      + '\nxr inline=' + xr.inline + ' vr=' + xr['immersive-vr'] + ' ar=' + xr['immersive-ar'];
  }

  function deltaToAxis(dx, dy, mode) {
    if (mode === 1) { dx *= 16; dy *= 16; }
    else if (mode === 2) { dx *= 80; dy *= 80; }
    return { x: clamp(dx / AXIS_SCALE, -1, 1), y: clamp(dy / AXIS_SCALE, -1, 1) };
  }

  function onWheel(e) {
    var stamp = e.timeStamp || performance.now();
    if (stamp && stamp === lastWheelStamp) return;
    lastWheelStamp = stamp;
    bump(e.type === 'mousewheel' || e.type === 'DOMMouseScroll' ? 'mousewheel' : 'wheel');
    if (e.cancelable) e.preventDefault();
    lastWheelCtrl = !!(e.ctrlKey || e.metaKey);
    lastWheelDx = (e.deltaX != null ? e.deltaX : (e.wheelDeltaX != null ? -e.wheelDeltaX : 0)) || 0;
    lastWheelDy = (e.deltaY != null ? e.deltaY : (e.wheelDelta != null ? -e.wheelDelta : 0)) || 0;
    lastWheelEvt = performance.now();
    // v239: ctrl/meta+wheel is how Chromium pinch/page-zoom often arrives. That is the stick
    // in desktop-mode Quest, not a user pinch — map it to movement and keep the camera still.
    // v241: the Quest controller ray emits pointer/touch continuously, which used to look
    // like an endless drag and skipped ingest (src none, age "-", move 0). On Quest, wheel
    // always becomes movement unless a real two-finger pinch is happening right now.
    if (startUp()) return;
    if (pinchNow()) return;
    if (!isQuest() && lastDrag && performance.now() - lastDrag < 100) return;
    var a = deltaToAxis(lastWheelDx, lastWheelDy, e.deltaMode || 0);
    ingest('wheel', a.x, a.y);
  }

  function recen() {
    recentring = true;
    try {
      if (sentinel) { sentinel.scrollLeft = midSX; sentinel.scrollTop = midSY; }
      var se = document.scrollingElement || document.documentElement;
      if (se && (se.scrollLeft || se.scrollTop)) { se.scrollLeft = 0; se.scrollTop = 0; }
    } catch (e) {}
    recentring = false;
  }

  var lastScrollStamp = 0;
  function onScroll(e) {
    var stamp = e.timeStamp || performance.now();
    if (stamp && stamp === lastScrollStamp) return;
    lastScrollStamp = stamp;
    bump('scroll');
    if (recentring) return;
    if (startUp()) { recen(); return; }
    if (performance.now() - lastWheelEvt < 50) { recen(); return; }
    if (pinchNow()) { recen(); return; }
    if (!isQuest() && lastDrag && performance.now() - lastDrag < 100) { recen(); return; }
    var isSent = sentinel && (e.target === sentinel);
    if (!isSent) { recen(); return; }
    var dx = (sentinel.scrollLeft || 0) - midSX, dy = (sentinel.scrollTop || 0) - midSY;
    recen();
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    var a = deltaToAxis(dx, dy, 0);
    ingest('scroll', a.x, a.y);
  }

  function onVV(kind) {
    bump(kind === 'scroll' ? 'vvscroll' : 'vvresize');
    var vv = root.visualViewport; if (!vv) return;
    var scale = vv.scale || 1;
    var x = vv.offsetLeft || 0, y = vv.offsetTop || 0;
    var dScale = scale - lastScale;
    var dx = x - lastVvX, dy = y - lastVvY;
    lastScale = scale; lastVvX = x; lastVvY = y;
    if (startUp()) return;
    if (performance.now() - lastWheelEvt < 50) return;
    if (pinchNow()) return;
    if (!isQuest() && lastDrag && performance.now() - lastDrag < 100) return;
    // Zoom in (scale up) -> forward (negative joy.y), matching "stick up zooms in".
    if (Math.abs(dScale) > 0.001) ingest('vvscale', 0, -clamp(dScale * 8, -1, 1));
    else if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) ingest('vvscroll', clamp(dx / AXIS_SCALE, -1, 1), clamp(dy / AXIS_SCALE, -1, 1));
  }

  function onGesture(e) {
    bump('gesture');
    if (e.cancelable) e.preventDefault();
    if (startUp() || fromStartUI(e)) return;
    if (e.type === 'gesturestart') { gestureScale0 = e.scale || 1; return; }
    var sc = e.scale || 1;
    var d = sc - (e.type === 'gestureend' ? sc : gestureScale0);
    if (e.type === 'gesturechange') gestureScale0 = sc;
    if (Math.abs(d) > 0.01) ingest('gesture', 0, -clamp(d * 4, -1, 1));
  }

  function touchDist(ev) {
    if (!ev || !ev.touches || ev.touches.length < 2) return 0;
    var a = ev.touches[0], b = ev.touches[1];
    return Math.hypot((a.clientX || 0) - (b.clientX || 0), (a.clientY || 0) - (b.clientY || 0));
  }

  function onTouch(e) {
    bump('touch');
    lastTouchAt = performance.now();
    var n = (e.touches && e.touches.length) || 0;
    touchCount = n;
    if (n < 2) lastDrag = 0;
    if (n >= 2) {
      var d = touchDist(e);
      if (e.type === 'touchstart' || !pinchDist0) { pinchDist0 = d; return; }
      var dd = d - pinchDist0;
      pinchDist0 = d;
      if (Math.abs(dd) > 2) {
        bump('pinch');
        if (e.cancelable) e.preventDefault();
        if (startUp() || fromStartUI(e)) return;
        ingest('pinch', 0, -clamp(dd / 80, -1, 1));
      }
    } else {
      pinchDist0 = 0;
    }
  }

  function attachWheel(el) {
    if (!el || !el.addEventListener) return;
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    el.addEventListener('mousewheel', onWheel, { passive: false, capture: true });
  }

  function installScrollCatcher() {
    try { document.documentElement.classList.add('gaQuest'); } catch (e) {}
    if (!document.body) return;
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.id = 'gaQscroll';
      sentinel.setAttribute('aria-hidden', 'true');
      var inner = document.createElement('div');
      inner.style.cssText = 'width:300%;height:300%';
      sentinel.appendChild(inner);
      document.body.appendChild(sentinel);
    }
    midSX = Math.floor((sentinel.scrollWidth - sentinel.clientWidth) / 2);
    midSY = Math.floor((sentinel.scrollHeight - sentinel.clientHeight) / 2);
    recen();
  }

  function unlockPads() {
    if (unlocked) return;
    unlocked = true;
    try { navigator.getGamepads && navigator.getGamepads(); } catch (e) {}
  }

  function applyListeners() {
    if (listenOn) return;
    listenOn = true;
    attachWheel(root);
    attachWheel(document);
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    var vv = root.visualViewport;
    if (vv) {
      try { lastScale = vv.scale || 1; lastVvX = vv.offsetLeft || 0; lastVvY = vv.offsetTop || 0; } catch (e) {}
      vv.addEventListener('resize', function () { onVV('resize'); });
      vv.addEventListener('scroll', function () { onVV('scroll'); });
    }
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
      addEventListener(t, onGesture, { capture: true, passive: false });
    });
    addEventListener('touchstart', onTouch, { capture: true, passive: false });
    addEventListener('touchmove', onTouch, { capture: true, passive: false });
    addEventListener('touchend', onTouch, { capture: true, passive: false });
    addEventListener('pointermove', function (e) {
      if (!e) return;
      // Only a pressed-button move is a real drag. The Quest ray reports pointerType
      // "touch" (or a hovering "mouse") continuously and must not latch lastDrag.
      if (e.buttons) lastDrag = performance.now();
    }, true);
    ['pointerup', 'pointercancel', 'mouseup'].forEach(function (t) {
      addEventListener(t, function () { lastDrag = 0; }, true);
    });
    ['pointerdown', 'mousedown', 'click', 'touchstart', 'keydown'].forEach(function (t) {
      addEventListener(t, function () { if (t !== 'keydown') bump('pointer'); unlockPads(); }, true);
    });
    addEventListener('gamepadconnected', function () { bump('gamepad'); unlockPads(); });
  }

  function listenKeys() {
    if (keyListenOn) return;
    keyListenOn = true;
    var moveCodes = /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|KeyW|KeyA|KeyS|KeyD|Space|ShiftLeft|ShiftRight)$/;
    addEventListener('keydown', function (e) {
      if (!e || !e.code) return;
      bump('key');
      heldKeys[e.code] = 1;
      if (moveCodes.test(e.code) && !keysOn[e.code]) {
        // Native arrow/WASD already move the arcade; still record source for ?qdbg=1.
        lastIngestSrc = lastIngestSrc === 'none' || !virtStick().mag ? 'key' : lastIngestSrc;
      }
    }, true);
    addEventListener('keyup', function (e) {
      if (!e || !e.code) return;
      delete heldKeys[e.code];
    }, true);
    addEventListener('blur', function () { heldKeys = Object.create(null); }, false);
  }

  function probeXR() {
    try {
      var xr = navigator.xr;
      if (!xr || !xr.isSessionSupported) return;
      ['inline', 'immersive-vr', 'immersive-ar'].forEach(function (m) {
        xr.isSessionSupported(m).then(function (ok) { xrInfo[m] = !!ok; }).catch(function () { xrInfo[m] = false; });
      });
    } catch (e) {}
  }

  function isPlayFrame() {
    try { if (window.frameElement && window.frameElement.id === 'game') return true; } catch (e) {}
    try {
      var p = location.pathname || '';
      if (/-play\//.test(p) || /sky-tower-play/.test(p)) return true;
    } catch (e2) {}
    return false;
  }

  function keyName(code) {
    return ({ KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: ' ' })[code] || code;
  }

  function setKey(code, on) {
    on = !!on;
    if (!!keysOn[code] === on) return;
    keysOn[code] = on;
    try {
      var ev = new KeyboardEvent(on ? 'keydown' : 'keyup', { code: code, key: keyName(code), bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
    } catch (e) {}
  }

  function pressSel(sel, on) {
    var el;
    try { el = document.querySelector(sel); } catch (e) { return; }
    if (!el) return;
    try {
      var typ = on ? 'pointerdown' : 'pointerup';
      el.dispatchEvent(new PointerEvent(typ, { bubbles: true, cancelable: true, pointerId: 97, isPrimary: true, button: 0, buttons: on ? 1 : 0 }));
    } catch (e) {}
  }

  var prevBtn = { fire: false, fly: false, zoom: false };

  function applyPlay(s) {
    var mx = (s.move && s.move.x) || 0, my = (s.move && s.move.y) || 0;
    setKey('KeyA', mx < -0.35);
    setKey('KeyD', mx > 0.35);
    setKey('KeyW', my < -0.35);
    setKey('KeyS', my > 0.35);
    if (s.fire !== prevBtn.fire) {
      prevBtn.fire = !!s.fire;
      setKey('Space', prevBtn.fire);
      pressSel('#bFire, #fire, button[aria-label*="Fire" i], button[aria-label*="FIRE" i]', prevBtn.fire);
    }
    if (s.fly !== prevBtn.fly) {
      prevBtn.fly = !!s.fly;
      pressSel('#bFly, #fly, button[aria-label*="Fly" i], button[aria-label*="FLY" i]', prevBtn.fly);
    }
    if (s.zoom !== prevBtn.zoom) {
      prevBtn.zoom = !!s.zoom;
      pressSel('#bZoom, #zoom, button[aria-label*="Zoom" i], button[aria-label*="ZOOM" i]', prevBtn.zoom);
    }
  }

  function tick() {
    loopOn = true;
    var s;
    if (isQuest()) {
      if (!sentinel && document.body) installScrollCatcher();
      var cv = document.querySelector('canvas');
      if (cv && !cv.__gaQWheel) { cv.__gaQWheel = 1; try { cv.classList.add('gaQuestRoom'); } catch (e) {} attachWheel(cv); }
      s = read();
      if (isPlayFrame()) applyPlay(s);
    } else {
      s = { move: { x: 0, y: 0, mag: 0 }, look: { x: 0, y: 0, mag: 0 }, fire: false, fly: false, zoom: false, n: 0, source: 'none', keys: [], wheel: {}, counts: counts };
      if (prevBtn.fire || prevBtn.fly || prevBtn.zoom || keysOn.KeyW || keysOn.KeyA || keysOn.KeyS || keysOn.KeyD || keysOn.Space) {
        applyPlay({ move: { x: 0, y: 0, mag: 0 }, fire: false, fly: false, zoom: false });
      }
    }
    api.last = s;
    if (dbgOn) renderDebug(s);
    if (typeof api.onFrame === 'function') {
      try { api.onFrame(s); } catch (e) {}
    }
    requestAnimationFrame(tick);
  }

  function start() {
    applyCss();
    applyListeners();
    listenKeys();
    probeXR();
    if (document.body) installScrollCatcher();
    else document.addEventListener('DOMContentLoaded', installScrollCatcher);
    if (wantDebug()) showDebug(true);
    if (!loopOn) requestAnimationFrame(tick);
    return api;
  }

  var api = root.__gaQuestPad = {
    DEAD: DEAD,
    isQuest: isQuest,
    read: read,
    start: start,
    ingest: ingest,
    applyWheelBlock: applyListeners,
    applyCss: applyCss,
    isPlayFrame: isPlayFrame,
    showDebug: showDebug,
    last: null,
    onFrame: null
  };

  if (isQuest() || wantDebug()) start();
  else {
    try {
      addEventListener('gamepadconnected', function () { if (isQuest()) start(); });
    } catch (e) {}
  }
})(window);
