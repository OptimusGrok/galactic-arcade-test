// t856u / v237: Meta Quest Browser maps thumbsticks to wheel / pinch-zoom on a 2D page.
// t857u / v238: in ordinary 2D page mode Quest often does NOT expose controllers through
// navigator.getGamepads() (those only appear inside a WebXR session). The sticks arrive
// as wheel events (deltaY up/down, deltaX left/right). Translate those into joystick
// input, keep the gamepad path, and surface a ?qdbg=1 overlay so we can see what Quest sends.
// Shared helper: arcade shell (main.js) and every play copy (via watch-shim.js).
(function (root) {
  'use strict';
  var DEAD = 0.18;
  var WHEEL_SCALE = 80;
  var WHEEL_HOLD = 150;
  var WHEEL_FADE = 80;
  var cssOn = false, wheelOn = false, loopOn = false, keyListenOn = false, keysOn = {};
  var lastDrag = 0;
  var wheelX = 0, wheelY = 0, lastWheel = 0, lastWheelDx = 0, lastWheelDy = 0, lastWheelCtrl = false;
  var heldKeys = Object.create(null);
  var lastKey = '';
  var dbgEl = null, dbgOn = false;

  function isQuest() {
    if (root.__gaForceQuest) return true;
    try {
      var ua = navigator.userAgent || '';
      return /OculusBrowser/i.test(ua) || /\bQuest\b/i.test(ua);
    } catch (e) { return false; }
  }

  function wantDebug() {
    if (root.__gaQuestDbg) return true;
    try {
      var q = String(location.search || '') + String(location.hash || '');
      return /[?&#]qdbg=1(?:&|$)/.test(q);
    } catch (e) { return false; }
  }

  function padList() {
    var raw = [], i, gp;
    try {
      gp = (navigator.getGamepads && navigator.getGamepads()) || [];
      for (i = 0; i < gp.length; i++) if (gp[i] && gp[i].connected !== false) raw.push(gp[i]);
    } catch (e) {}
    return raw;
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

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function wheelStick() {
    if (!lastWheel) return { x: 0, y: 0, mag: 0 };
    var age = performance.now() - lastWheel;
    var k = 1;
    if (age > WHEEL_HOLD) k = Math.max(0, 1 - (age - WHEEL_HOLD) / WHEEL_FADE);
    if (k <= 0) return { x: 0, y: 0, mag: 0 };
    var x = wheelX * k, y = wheelY * k;
    return { x: x, y: y, mag: Math.hypot(x, y) };
  }

  function keyList() {
    var out = [], k;
    for (k in heldKeys) if (heldKeys[k]) out.push(k);
    out.sort();
    return out;
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
      // xr-standard: the thumbstick is axes 2/3; 0/1 is a touchpad. Standard dual-stick: 0/1 left, 2/3 right.
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
    var w = wheelStick();
    var keys = keyList();
    var move = pads.move, look = pads.look, source = 'none';
    if (move.mag) source = 'gamepad';
    else if (w.mag) { move = w; source = 'wheel'; }
    else if (keys.length) source = 'key';
    return {
      move: move, look: look,
      fire: pads.fire, fly: pads.fly, zoom: pads.zoom,
      n: pads.n, source: source, keys: keys,
      wheel: {
        dx: lastWheelDx, dy: lastWheelDy,
        age: lastWheel ? +(performance.now() - lastWheel).toFixed(0) : null,
        x: w.x, y: w.y, ctrl: lastWheelCtrl
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
      s.textContent = 'html,body{overscroll-behavior:none;touch-action:none}'
        + '#gaQdbg{position:fixed;top:max(4px,env(safe-area-inset-top));left:max(4px,env(safe-area-inset-left));z-index:2147483000;pointer-events:none;background:#000c;color:#9ff;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:6px 8px;border:1px solid #0ff6;border-radius:6px;white-space:pre;max-width:min(92vw,360px)}';
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
    dbgEl.textContent = 'GA Quest dbg'
      + '\nsrc ' + (s.source || 'none')
      + '\nwheel dx=' + (w.dx == null ? '-' : (+w.dx).toFixed(1))
      + ' dy=' + (w.dy == null ? '-' : (+w.dy).toFixed(1))
      + ' age=' + (w.age == null ? '-' : w.age + 'ms')
      + (w.ctrl ? ' CTRL' : '')
      + '\nmove x=' + (mv.x || 0).toFixed(2) + ' y=' + (mv.y || 0).toFixed(2)
      + ' look x=' + (lk.x || 0).toFixed(2) + ' y=' + (lk.y || 0).toFixed(2)
      + '\ngamepads ' + (s.n || 0)
      + '\nkeys ' + ((s.keys && s.keys.length) ? s.keys.join(',') : '-');
  }

  function onWheel(e) {
    if (!isQuest()) return;
    if (e.cancelable) e.preventDefault();
    lastWheelCtrl = !!(e.ctrlKey || e.metaKey);
    lastWheelDx = e.deltaX || 0;
    lastWheelDy = e.deltaY || 0;
    // ctrl/meta + wheel is browser pinch-zoom: block it, but do not walk.
    if (lastWheelCtrl) return;
    // A real finger/mouse drag (not a stale pointerdown) is already steering.
    if (lastDrag && performance.now() - lastDrag < 100) return;
    var dx = lastWheelDx, dy = lastWheelDy;
    if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
    else if (e.deltaMode === 2) { dx *= 80; dy *= 80; }
    var nx = clamp(dx / WHEEL_SCALE, -1, 1);
    var ny = clamp(dy / WHEEL_SCALE, -1, 1);
    var mag = Math.hypot(nx, ny);
    if (mag > 1) { nx /= mag; ny /= mag; mag = 1; }
    // Smooth toward this tick so a held stick (repeating wheel events) walks steadily.
    wheelX = clamp(wheelX * 0.35 + nx * 0.65, -1, 1);
    wheelY = clamp(wheelY * 0.35 + ny * 0.65, -1, 1);
    lastWheel = performance.now();
    // Don't wait for a later rAF: a heavy play copy can hitch past the 130ms hold.
    if (isPlayFrame()) applyPlay(read());
  }

  function applyWheelBlock() {
    if (wheelOn) return;
    wheelOn = true;
    addEventListener('wheel', onWheel, { passive: false, capture: true });
    var drag = function (e) {
      if (!e) return;
      if (e.type === 'touchmove' || (e.buttons && e.buttons !== 0) || e.pointerType === 'touch') lastDrag = performance.now();
    };
    addEventListener('pointermove', drag, true);
    addEventListener('touchmove', drag, true);
  }

  function listenKeys() {
    if (keyListenOn) return;
    keyListenOn = true;
    var moveCodes = /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|KeyW|KeyA|KeyS|KeyD|Space|ShiftLeft|ShiftRight)$/;
    addEventListener('keydown', function (e) {
      if (!e || !e.code) return;
      heldKeys[e.code] = 1;
      if (moveCodes.test(e.code)) lastKey = e.code;
    }, true);
    addEventListener('keyup', function (e) {
      if (!e || !e.code) return;
      delete heldKeys[e.code];
    }, true);
    addEventListener('blur', function () { heldKeys = Object.create(null); }, false);
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
    var s = { move: { x: 0, y: 0, mag: 0 }, look: { x: 0, y: 0, mag: 0 }, fire: false, fly: false, zoom: false, n: 0, source: 'none', keys: [], wheel: {} };
    if (isQuest()) {
      s = read();
      if (isPlayFrame()) applyPlay(s);
    } else if (prevBtn.fire || prevBtn.fly || prevBtn.zoom || keysOn.KeyW || keysOn.KeyA || keysOn.KeyS || keysOn.KeyD || keysOn.Space) {
      applyPlay({ move: { x: 0, y: 0, mag: 0 }, fire: false, fly: false, zoom: false });
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
    applyWheelBlock();
    listenKeys();
    if (wantDebug()) showDebug(true);
    if (!loopOn) requestAnimationFrame(tick);
    return api;
  }

  var api = root.__gaQuestPad = {
    DEAD: DEAD,
    isQuest: isQuest,
    read: read,
    start: start,
    applyWheelBlock: applyWheelBlock,
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
