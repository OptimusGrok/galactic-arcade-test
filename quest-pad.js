// t856u / v237: Meta Quest Browser exposes Touch controllers as Gamepads, but maps
// the thumbsticks to wheel / pinch-zoom on a 2D page, so the player never moves.
// Shared helper used by the arcade shell (main.js) and every play copy (via watch-shim.js).
(function (root) {
  'use strict';
  var DEAD = 0.18;
  var cssOn = false, wheelOn = false, loopOn = false, keysOn = {};

  function isQuest() {
    if (root.__gaForceQuest) return true;
    try {
      var ua = navigator.userAgent || '';
      return /OculusBrowser/i.test(ua) || /\bQuest\b/i.test(ua);
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

  function read() {
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
      // A lone pair (either 0/1 or 2/3) still counts as a stick so one controller can move the player.
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
        if (pressed(gp, 0) || pressed(gp, 4)) fire = true; // trigger, A / X
        if (pressed(gp, 1) || pressed(gp, 5)) fly = true;  // squeeze, B / Y
        if (pressed(gp, 3)) zoom = true;                   // thumbstick click
      } else {
        if (pressed(gp, 0) || pressed(gp, 2) || pressed(gp, 6) || pressed(gp, 7)) fire = true; // A, X, LT, RT
        if (pressed(gp, 1) || pressed(gp, 5)) fly = true;  // B, RB
        if (pressed(gp, 3) || pressed(gp, 4)) zoom = true; // Y, LB
      }
    }
    for (j = 0; j < unhanded.length; j++) {
      if (!move.mag) move = unhanded[j];
      else if (!look.mag) look = unhanded[j];
    }
    return { move: move, look: look, fire: fire, fly: fly, zoom: zoom, n: pads.length };
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
      s.textContent = 'html,body{overscroll-behavior:none;touch-action:none}';
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
    ensureViewport();
  }

  function applyWheelBlock() {
    if (wheelOn) return;
    wheelOn = true;
    // Capture-phase so a Quest thumbstick-as-wheel cannot zoom the page or the arcade camera.
    // Pinch-to-zoom on real touch gestures is left alone (this is wheel only).
    addEventListener('wheel', function (e) {
      if (!isQuest()) return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false, capture: true });
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
    var s = { move: { x: 0, y: 0, mag: 0 }, look: { x: 0, y: 0, mag: 0 }, fire: false, fly: false, zoom: false, n: 0 };
    if (isQuest()) {
      s = read();
      if (isPlayFrame()) applyPlay(s);
    } else if (prevBtn.fire || prevBtn.fly || prevBtn.zoom || keysOn.KeyW || keysOn.KeyA || keysOn.KeyS || keysOn.KeyD || keysOn.Space) {
      applyPlay({ move: { x: 0, y: 0, mag: 0 }, fire: false, fly: false, zoom: false });
    }
    api.last = s;
    if (typeof api.onFrame === 'function') {
      try { api.onFrame(s); } catch (e) {}
    }
    requestAnimationFrame(tick);
  }

  function start() {
    applyCss();
    applyWheelBlock();
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
    last: null,
    onFrame: null
  };

  if (isQuest()) start();
  else {
    // A test (or a late UA) can set __gaForceQuest and call start(); also listen in case the flag is set later.
    try {
      addEventListener('gamepadconnected', function () { if (isQuest()) start(); });
    } catch (e) {}
  }
})(window);
