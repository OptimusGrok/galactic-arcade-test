/* t856u / v237 + t857u / v238 + t858u / v239 + t859u / v240 + t864u / v241: Quest thumbsticks must move the player.
   v237 reads getGamepads(); v238 translates stick-as-wheel; v239 also catches
   document/sentinel scroll (Quest's official 2D mapping), ctrl+wheel and
   visualViewport scale (browser zoom), gesturestart/change, two-finger pinch,
   keys, and re-polls gamepads after the first user gesture. Camera zoom stays
   off. Play copies get the same helper. ?qdbg=1 shows UA, scale, pads, counts. */
const { open } = require('./lib');

const QUEST_UA = 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/36.0.0.0.0 Chrome/122.0.6261.132 VR Safari/537.36';

function initPads() {
  function btn() { return { pressed: false, touched: false, value: 0 }; }
  function pad(id, index) {
    return {
      id: id, index: index, connected: true, mapping: 'xr-standard',
      axes: [0, 0, 0, 0],
      buttons: [btn(), btn(), btn(), btn(), btn(), btn(), btn(), btn()],
      timestamp: 0
    };
  }
  window.__gaMockPads = [pad('Oculus Touch (Left)', 0), pad('Oculus Touch (Right)', 1)];
  navigator.getGamepads = function () { return window.__gaMockPads; };
}

(async () => {
  let ok = true;
  const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 400) : '')); if (!c) ok = false; };

  const o = await open({ w: 1280, h: 720, ua: QUEST_UA, init: initPads });
  const { page, errors, close } = o;

  const detected = await page.evaluate(() => {
    const Q = window.__gaQuestPad;
    return { has: !!Q, quest: !!(Q && Q.isQuest && Q.isQuest()), play: !!(Q && Q.isPlayFrame && Q.isPlayFrame()), arcade: !!window.__arcade && !!window.__arcade.applyQuestPad };
  });
  chk(detected.has && detected.quest && !detected.play && detected.arcade, 'Quest UA is detected in the arcade shell (not a play frame)', detected);

  // --- left stick (xr-standard axes 2/3) walks forward ---
  const walk = await page.evaluate(() => {
    const A = window.__arcade, st = A.st;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.pitch = 0.28; st.vel.set(0, 0, 0); st.joy.on = false;
    window.__gaMockPads[0].axes = [0, 0, 0, -1];
    window.__gaMockPads[1].axes = [0, 0, 0, 0];
    A.applyQuestPad(1 / 60);
    const joy = { on: st.joy.on, x: +st.joy.x.toFixed(3), y: +st.joy.y.toFixed(3), vmax: st.joy.vmax };
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return { x: +A.monkey.position.x.toFixed(3), z: +A.monkey.position.z.toFixed(3), joy };
  });
  chk(walk.joy.on && walk.joy.y < -0.9 && walk.z < 4.2, 'left thumbstick (axes 2/3) moves the player forward', walk);

  // --- fallback: axes 0/1 when 2/3 are unused ---
  const walk01 = await page.evaluate(() => {
    const A = window.__arcade, st = A.st;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.vel.set(0, 0, 0);
    window.__gaMockPads[0].axes = [0, -1, 0, 0];
    window.__gaMockPads[1].axes = [0, 0, 0, 0];
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return { z: +A.monkey.position.z.toFixed(3), on: st.joy.on, y: +st.joy.y.toFixed(3) };
  });
  chk(walk01.on && walk01.y < -0.9 && walk01.z < 4.2, 'left stick also reads axes 0/1 when 2/3 are idle', walk01);

  // --- release stops ---
  const stop = await page.evaluate(() => {
    const A = window.__arcade, st = A.st;
    window.__gaMockPads[0].axes = [0, 0, 0, 0];
    A.applyQuestPad(1 / 60);
    st.vel.set(0, 0, 0);
    const z0 = A.monkey.position.z;
    for (let i = 0; i < 20; i++) A.step(1 / 60);
    return { on: st.joy.on, dz: +(A.monkey.position.z - z0).toFixed(3) };
  });
  chk(!stop.on && Math.abs(stop.dz) < 0.05, 'releasing the stick stops the player', stop);

  // --- right stick turns the camera ---
  const cam = await page.evaluate(() => {
    const A = window.__arcade, st = A.st;
    st.yaw = 0; st.pitch = 0.28;
    window.__gaMockPads[0].axes = [0, 0, 0, 0];
    window.__gaMockPads[1].axes = [0, 0, 1, 0];
    for (let i = 0; i < 10; i++) A.applyQuestPad(1 / 60);
    const yaw = +st.yaw.toFixed(3);
    window.__gaMockPads[1].axes = [0, 0, 0, 0];
    A.applyQuestPad(1 / 60);
    return { yaw };
  });
  chk(cam.yaw < -0.3, 'right thumbstick turns the camera', cam);

  // --- wheel (Quest stick-as-wheel) does not change camera distance ---
  const wheel = await page.evaluate(() => {
    const A = window.__arcade;
    const d0 = A.st.dist;
    const ev = new WheelEvent('wheel', { deltaY: 800, bubbles: true, cancelable: true });
    const ev2 = new WheelEvent('wheel', { deltaY: 800, bubbles: true, cancelable: true });
    const blocked = !A.renderer.domElement.dispatchEvent(ev);
    const blockedWin = !window.dispatchEvent(ev2);
    return { d0, d1: A.st.dist, prevented: ev.defaultPrevented, blocked, blockedWin, preventedWin: ev2.defaultPrevented };
  });
  chk(wheel.d0 === wheel.d1 && wheel.prevented, 'wheel events on Quest do not zoom the camera', wheel);

  // --- buttons: trigger / A = FIRE, squeeze / B = FLY, stick click = ZOOM ---
  const btns = await page.evaluate(() => {
    const A = window.__arcade, st = A.st;
    const set = (pad, i, on) => { const b = window.__gaMockPads[pad].buttons[i]; b.pressed = on; b.value = on ? 1 : 0; };
    set(1, 0, true); // right trigger
    A.applyQuestPad(1 / 60);
    const fire = !!(window.__gaQuestPad.last && window.__gaQuestPad.last.fire);
    set(1, 0, false); set(0, 1, true); // left squeeze
    A.applyQuestPad(1 / 60);
    const fly = !!(st.fly.hold && window.__gaQuestPad.last.fly);
    set(0, 1, false); set(1, 3, true); // right stick click
    A.applyQuestPad(1 / 60);
    const zoom = !!(A.zoomHold.on && window.__gaQuestPad.last.zoom);
    set(1, 3, false);
    A.applyQuestPad(1 / 60);
    return { fire, fly, zoom, zoomAfter: A.zoomHold.on, flyAfter: !!st.fly.hold };
  });
  chk(btns.fire && btns.fly && btns.zoom && !btns.zoomAfter && !btns.flyAfter, 'triggers / A FIRE, squeeze / B FLY, stick-click ZOOM, and they release', btns);

  // The zoom-block probe above fires deltaY=800 wheels; let analog hist / fade clear.
  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  // --- t857u: with no gamepad axes, wheel deltas become the joystick ---
  const zeroPads = () => page.evaluate(() => {
    (window.__gaMockPads || []).forEach(p => { p.axes = [0, 0, 0, 0]; p.buttons.forEach(b => { b.pressed = false; b.value = 0; }); });
  });
  await zeroPads();

  const wheelWalk = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true }));
    }
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    const joy = { on: st.joy.on, x: +st.joy.x.toFixed(3), y: +st.joy.y.toFixed(3), source: r.source, dy: r.wheel && r.wheel.dy };
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return { x: +A.monkey.position.x.toFixed(3), z: +A.monkey.position.z.toFixed(3), joy, dist: +st.dist.toFixed(3) };
  });
  chk(wheelWalk.joy.source === 'wheel' && wheelWalk.joy.on && wheelWalk.joy.y < -0.5 && wheelWalk.z < 4.2, 'wheel deltaY (no gamepad) moves the player forward and does not zoom', wheelWalk);

  const wheelStrafe = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.vel.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 80, deltaY: 0, deltaMode: 0, bubbles: true, cancelable: true }));
    }
    A.applyQuestPad(1 / 60);
    const r = Q.read();
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return { x: +A.monkey.position.x.toFixed(3), z: +A.monkey.position.z.toFixed(3), source: r.source, joyX: +st.joy.x.toFixed(3) };
  });
  chk(wheelStrafe.source === 'wheel' && wheelStrafe.joyX > 0.5 && wheelStrafe.x > 0.6, 'wheel deltaX strafes the player', wheelStrafe);

  const wheelDecay = await page.evaluate(async () => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    const t0 = performance.now();
    while (performance.now() - t0 < 280) { /* wait past 130ms hold + 80ms fade */ }
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    return { source: r.source, mag: +(r.move && r.move.mag || 0).toFixed(3), on: st.joy.on };
  });
  chk(wheelDecay.source !== 'wheel' && !wheelDecay.on && wheelDecay.mag < 0.1, 'wheel stick decays to zero ~200ms after the last event', wheelDecay);

  const wheelCtrl = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.pitch = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const d0 = st.dist;
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, ctrlKey: true, bubbles: true, cancelable: true }));
    }
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 30; i++) A.step(1 / 60);
    return {
      source: r.source, on: st.joy.on, z: +A.monkey.position.z.toFixed(3),
      dist: st.dist, d0, ctrl: !!(r.wheel && r.wheel.ctrl),
      lookY: r.look && +((r.look.y) || 0).toFixed(3),
      pitch: +st.pitch.toFixed(4), yaw: +st.yaw.toFixed(4),
      chan: r.chan, mode: r.wheel && r.wheel.mode
    };
  });
  chk(wheelCtrl.ctrl && wheelCtrl.source === 'wheel' && !wheelCtrl.on && Math.abs(wheelCtrl.z - 5) < 0.05 && wheelCtrl.dist === wheelCtrl.d0 && wheelCtrl.lookY < -0.3 && wheelCtrl.pitch !== 0, 'ctrl+wheel (browser pinch / page zoom) looks and does not walk or camera-zoom', wheelCtrl);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  // t864u / v241: Dave's Quest 3 overlay (in game, left stick held):
  // wheel=238 dx=-37.5 dy=0 age="-", src none, move 0, touch=134, gamepads 0.
  // The controller ray keeps firing pointermove (pointerType "touch") which used
  // to latch lastDrag and skip ingest.
  const rayDx = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const d0 = st.dist;
    for (let i = 0; i < 8; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 200 + i, clientY: 200, buttons: 0, isPrimary: true
      }));
    }
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: -37.5, deltaY: 0, deltaMode: 0, bubbles: true, cancelable: true }));
    }
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return {
      source: r.source, age: r.wheel && r.wheel.age, ua: /OculusBrowser/.test(r.ua) && /Quest 3/.test(r.ua) && /VR Safari/.test(r.ua),
      x: +A.monkey.position.x.toFixed(3), z: +A.monkey.position.z.toFixed(3),
      on: st.joy.on, joyX: +st.joy.x.toFixed(3), joyY: +st.joy.y.toFixed(3),
      dist: st.dist, d0, dx: r.wheel && r.wheel.dx, dy: r.wheel && r.wheel.dy
    };
  });
  chk(rayDx.ua && rayDx.source === 'wheel' && rayDx.age != null && rayDx.on && rayDx.joyX < -0.3 && rayDx.x < -0.3 && rayDx.dist === rayDx.d0,
    'Quest-ray pointermove + deltaX-only wheel strafes and records age', rayDx);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const rayDy = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 210, clientY: 200 + i, buttons: 0, isPrimary: true
      }));
    }
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true }));
    }
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return { source: r.source, age: r.wheel && r.wheel.age, on: st.joy.on, y: +st.joy.y.toFixed(3), z: +A.monkey.position.z.toFixed(3) };
  });
  chk(rayDy.source === 'wheel' && rayDy.age != null && rayDy.on && rayDy.y < -0.5 && rayDy.z < 4.2,
    'Quest-ray hover + deltaY-only wheel walks forward', rayDy);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const staleDrag = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const ev = (type, extra) => window.dispatchEvent(new PointerEvent(type, Object.assign({
      bubbles: true, cancelable: true, pointerId: 2, pointerType: 'mouse', isPrimary: true, clientX: 100, clientY: 100
    }, extra)));
    ev('pointerdown', { buttons: 1, button: 0 });
    ev('pointermove', { buttons: 1, button: 0, clientX: 130, clientY: 120 });
    ev('pointerup', { buttons: 0, button: 0, clientX: 130, clientY: 120 });
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true }));
    }
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    return { source: r.source, age: r.wheel && r.wheel.age, on: st.joy.on, y: +st.joy.y.toFixed(3) };
  });
  chk(staleDrag.source === 'wheel' && staleDrag.age != null && staleDrag.on && staleDrag.y < -0.5,
    'pointerup clears a stale drag so the next wheel still walks', staleDrag);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const pinchThenWheel = await page.evaluate(() => {
    const Q = window.__gaQuestPad;
    const fire = (type, touches) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', { value: touches });
      window.dispatchEvent(ev);
    };
    const two = [{ identifier: 1, clientX: 100, clientY: 100 }, { identifier: 2, clientX: 180, clientY: 100 }];
    fire('touchstart', two);
    fire('touchmove', two);
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true }));
    const mid = Q.read();
    fire('touchend', []);
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true }));
    const after = Q.read();
    return {
      midSrc: mid.source, midY: mid.move && +((mid.move.y) || 0).toFixed(3),
      afterSrc: after.source, afterY: after.move && +((after.move.y) || 0).toFixed(3)
    };
  });
  chk(pinchThenWheel.midSrc !== 'wheel' && pinchThenWheel.afterSrc === 'wheel' && pinchThenWheel.afterY < -0.3,
    'wheel is ignored only while a real two-finger pinch is active', pinchThenWheel);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const startGate = await page.evaluate(() => {
    const Q = window.__gaQuestPad;
    const el = document.createElement('div');
    el.id = 'start';
    el.style.cssText = 'position:fixed;inset:0;z-index:100;background:#010101';
    document.body.appendChild(el);
    window.__start = Object.assign(window.__start || {}, { shown: true, dismissed: false });
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true }));
    const blocked = Q.read();
    el.classList.add('out');
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    window.__start.dismissed = true;
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true }));
    const after = Q.read();
    el.remove();
    return { blockedSrc: blocked.source, afterSrc: after.source, afterY: after.move && +((after.move.y) || 0).toFixed(3) };
  });
  chk(startGate.blockedSrc !== 'wheel' && startGate.afterSrc === 'wheel' && startGate.afterY < -0.3,
    'start-screen gate uses #start visibility and clears once it is dismissed', startGate);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const analogRate = await page.evaluate(async () => {
    const Q = window.__gaQuestPad;
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -37.5, deltaMode: 0, bubbles: true, cancelable: true }));
    const sparse = Q.read();
    await new Promise(r => setTimeout(r, 280));
    for (let i = 0; i < 8; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -37.5, deltaMode: 0, bubbles: true, cancelable: true }));
    }
    const burst = Q.read();
    return {
      sparseMag: +(sparse.move && sparse.move.mag || 0).toFixed(3),
      burstMag: +(burst.move && burst.move.mag || 0).toFixed(3),
      sparseRate: sparse.wheel && sparse.wheel.rate,
      burstRate: burst.wheel && burst.wheel.rate,
      burstY: +(burst.move && burst.move.y || 0).toFixed(3)
    };
  });
  chk(analogRate.burstMag > analogRate.sparseMag + 0.25 && analogRate.burstMag > 0.75 && analogRate.burstY < -0.5,
    'analog walk: a burst of 37.5-step wheels is faster than a single sparse tick', analogRate);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const lookToggle = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.pitch = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const d0 = st.dist;
    Q.setLookStick(true);
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 40, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true, clientX: 220, clientY: 180 }));
    }
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 20; i++) A.step(1 / 60);
    const out = {
      stick: r.lookStick, source: r.source, on: st.joy.on,
      z: +A.monkey.position.z.toFixed(3), dist: st.dist, d0,
      lookX: r.look && +((r.look.x) || 0).toFixed(3),
      lookY: r.look && +((r.look.y) || 0).toFixed(3),
      yaw: +st.yaw.toFixed(4), pitch: +st.pitch.toFixed(4),
      btn: !!(document.getElementById('gaQlook'))
    };
    Q.setLookStick(false);
    return out;
  });
  chk(lookToggle.stick && lookToggle.btn && !lookToggle.on && Math.abs(lookToggle.z - 5) < 0.05 && lookToggle.dist === lookToggle.d0 && (lookToggle.lookX > 0.2 || lookToggle.lookY < -0.2) && (lookToggle.yaw !== 0 || lookToggle.pitch !== 0),
    'STICK LOOK toggle routes plain wheel to camera look without walking', lookToggle);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const scrollWalk = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const sent = document.getElementById('gaQscroll');
    const spacer = document.getElementById('gaQspacer');
    if (!sent) return { missing: true };
    const mid = sent.scrollTop;
    sent.scrollTop = mid - 80;
    let r = Q.read();
    if (r.source !== 'scroll') sent.dispatchEvent(new Event('scroll', { bubbles: true }));
    r = Q.read();
    A.applyQuestPad(1 / 60);
    const joy = { on: st.joy.on, x: +st.joy.x.toFixed(3), y: +st.joy.y.toFixed(3), source: r.source };
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return {
      hasSent: !!sent, hasSpacer: !!spacer, mid, overflow: getComputedStyle(document.documentElement).overflow,
      x: +A.monkey.position.x.toFixed(3), z: +A.monkey.position.z.toFixed(3),
      joy, dist: +st.dist.toFixed(3), recentred: Math.abs(sent.scrollTop - mid) < 2,
      counts: r.counts && r.counts.scroll
    };
  });
  chk(scrollWalk.hasSent && !scrollWalk.hasSpacer && /hidden/.test(scrollWalk.overflow) && scrollWalk.joy.source === 'scroll' && scrollWalk.joy.on && scrollWalk.joy.y < -0.3 && scrollWalk.z < 4.2 && scrollWalk.recentred, 'scroll sentinel turns offset into forward and recentres without a page spacer', scrollWalk);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const vvScale = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.pitch = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const d0 = st.dist;
    const vv = window.visualViewport;
    let hooked = false;
    try {
      Object.defineProperty(vv, 'scale', { configurable: true, get() { return 1.25; } });
      hooked = true;
    } catch (e) {}
    if (vv && hooked) vv.dispatchEvent(new Event('resize'));
    else Q.ingestLook('vvscale', 0, -1);
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return {
      hooked, source: r.source, scale: r.scale, on: st.joy.on,
      lookY: r.look && +((r.look.y) || 0).toFixed(3),
      pitch: +st.pitch.toFixed(4),
      z: +A.monkey.position.z.toFixed(3), dist: st.dist, d0,
      vvR: r.counts && r.counts.vvresize
    };
  });
  chk(vvScale.source === 'vvscale' && !vvScale.on && Math.abs(vvScale.z - 5) < 0.05 && vvScale.dist === vvScale.d0 && vvScale.lookY < -0.3 && vvScale.pitch !== 0, 'visualViewport scale-up looks and does not walk or camera-zoom', vvScale);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const gest = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.pitch = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const d0 = st.dist;
    const fire = (type, scale) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'scale', { value: scale });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const blockedStart = fire('gesturestart', 1);
    const blockedChange = fire('gesturechange', 1.3);
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    return {
      blockedStart, blockedChange, source: r.source, on: st.joy.on,
      lookY: r.look && +((r.look.y) || 0).toFixed(3),
      pitch: +st.pitch.toFixed(4),
      z: +A.monkey.position.z.toFixed(3), dist: st.dist, d0, gest: r.counts && r.counts.gesture
    };
  });
  chk(gest.source === 'gesture' && !gest.on && Math.abs(gest.z - 5) < 0.05 && gest.dist === gest.d0 && gest.lookY < -0.3 && gest.pitch !== 0 && gest.gest >= 2, 'gesturechange scale-up looks and does not walk or camera-zoom', gest);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const pinch = await page.evaluate(() => {
    const A = window.__arcade, st = A.st, Q = window.__gaQuestPad;
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.pitch = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const d0 = st.dist;
    const fire = (type, pts) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', { value: (pts || []).map((p, i) => ({ identifier: i + 1, clientX: p.x, clientY: p.y })) });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    fire('touchstart', [{ x: 100, y: 100 }, { x: 180, y: 100 }]);
    const blocked = fire('touchmove', [{ x: 100, y: 100 }, { x: 280, y: 100 }]);
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 45; i++) A.step(1 / 60);
    fire('touchend', []);
    return {
      blocked, source: r.source, on: st.joy.on,
      lookY: r.look && +((r.look.y) || 0).toFixed(3),
      pitch: +st.pitch.toFixed(4),
      z: +A.monkey.position.z.toFixed(3), dist: st.dist, d0,
      pinch: r.counts && r.counts.pinch, touch: r.counts && r.counts.touch
    };
  });
  chk(pinch.source === 'pinch' && !pinch.on && Math.abs(pinch.z - 5) < 0.05 && pinch.dist === pinch.d0 && pinch.lookY < -0.3 && pinch.pitch !== 0 && pinch.pinch >= 1, 'two-finger pinch-out looks and does not walk or camera-zoom', pinch);

  await page.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const keyIn = await page.evaluate(() => {
    const Q = window.__gaQuestPad;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true, cancelable: true }));
    const r = Q.read();
    return { source: r.source, keys: r.keys, unlocked: r.unlocked, keyCount: r.counts && r.counts.key };
  });
  chk(keyIn.source === 'key' && keyIn.keys.indexOf('ArrowUp') >= 0 && keyIn.unlocked && keyIn.keyCount >= 1, 'ArrowUp is logged as key input and unlocks gamepad polling', keyIn);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true, cancelable: true })));

  const dbg = await page.evaluate(() => {
    const Q = window.__gaQuestPad;
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', clientX: 321, clientY: 210, buttons: 0 }));
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: -40, deltaMode: 0, bubbles: true, cancelable: true, clientX: 321, clientY: 210 }));
    Q.showDebug(true);
    const el = document.getElementById('gaQdbg');
    const text = el ? el.textContent : '';
    const r = Q.read();
    return { has: !!el, text: (text || ''), source: r.source, n: r.n, scale: r.scale, pads: r.pads, ua: r.ua, counts: r.counts, wheel: r.wheel };
  });
  chk(dbg.has
    && /GA Quest dbg v242/.test(dbg.text)
    && /UA /.test(dbg.text) && /OculusBrowser|Quest/.test(dbg.text)
    && /src wheel/.test(dbg.text)
    && /mode=0/.test(dbg.text) && /rate=/.test(dbg.text)
    && /ptr id=7/.test(dbg.text) && /type=touch/.test(dbg.text)
    && /xy=321,210/.test(dbg.text)
    && /stick=WALK/.test(dbg.text)
    && /vv\.scale=/.test(dbg.text) && /dpr=/.test(dbg.text)
    && /gamepads/.test(dbg.text) && /Oculus Touch/.test(dbg.text)
    && /keys /.test(dbg.text)
    && /counts wheel=/.test(dbg.text) && /scroll=/.test(dbg.text)
    && /vvR=/.test(dbg.text) && /gest=/.test(dbg.text) && /pinch=/.test(dbg.text)
    && /start=/.test(dbg.text) && /pinch=/.test(dbg.text) && /xr inline=/.test(dbg.text), '?qdbg overlay shows v242 per-event rate, mode, pointer, and clientXY', { text: dbg.text.slice(0, 900), n: dbg.n, scale: dbg.scale, pads: dbg.pads, counts: dbg.counts, wheel: dbg.wheel });

  // --- play copy: left stick synthesizes WASD; wheel is also blocked ---
  // Resolve against the arcade page path so this works on GitHub Pages
  // (/galactic-arcade/index.html) as well as a local root-served checkout.
  const playUrl = new URL('monkey-play/index.html', page.url()).href;
  const playPage = await page.context().newPage();
  await playPage.goto(playUrl, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await playPage.waitForFunction(() => window.__gaQuestPad && window.__gaQuestPad.isQuest && window.__gaQuestPad.isQuest(), null, { timeout: 20000 });
  const playInfo = await playPage.evaluate(() => ({ play: window.__gaQuestPad.isPlayFrame(), quest: window.__gaQuestPad.isQuest() }));
  chk(playInfo.play && playInfo.quest, 'play copy loads quest-pad and sees itself as a play frame', playInfo);

  await playPage.evaluate(() => {
    // addInitScript was registered on the arcade page, not this one
    if (!window.__gaMockPads) {
      function btn() { return { pressed: false, touched: false, value: 0 }; }
      function pad(id, index) {
        return { id: id, index: index, connected: true, mapping: 'xr-standard', axes: [0, 0, 0, 0], buttons: [btn(), btn(), btn(), btn(), btn(), btn(), btn(), btn()], timestamp: 0 };
      }
      window.__gaMockPads = [pad('Oculus Touch (Left)', 0), pad('Oculus Touch (Right)', 1)];
      navigator.getGamepads = function () { return window.__gaMockPads; };
    }
    window.__gaKeys = {};
    document.addEventListener('keydown', e => { window.__gaKeys[e.code] = 1; });
    document.addEventListener('keyup', e => { window.__gaKeys[e.code] = 0; });
    window.__gaMockPads[0].axes = [0, 0, 0, -1];
  });
  const keyOk = await playPage.waitForFunction(() => window.__gaKeys && window.__gaKeys.KeyW === 1, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const keys = await playPage.evaluate(() => window.__gaKeys);
  chk(keyOk && keys.KeyW === 1, 'left stick in a play copy synthesizes KeyW (forward)', keys);

  const playWheel = await playPage.evaluate(() => {
    const ev = new WheelEvent('wheel', { deltaY: 800, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented };
  });
  chk(playWheel.prevented, 'wheel events are also blocked inside a play copy', playWheel);

  await playPage.evaluate(() => { window.__gaMockPads[0].axes = [0, 0, 0, 0]; });
  const keyUp = await playPage.waitForFunction(() => window.__gaKeys && window.__gaKeys.KeyW === 0, null, { timeout: 8000 }).then(() => true).catch(() => false);
  chk(keyUp, 'releasing the play-copy stick releases KeyW');

  // The zoom-block probe above fires deltaY=800 wheels; let analog hist / fade clear.
  await playPage.evaluate(() => new Promise(r => setTimeout(r, 280)));

  const playImm = await playPage.evaluate(() => {
    if (window.__gaMockPads) {
      window.__gaMockPads[0].axes = [0, 0, 0, 0];
      window.__gaMockPads[1].axes = [0, 0, 0, 0];
    }
    window.__gaKeys = {};
    const evs = [];
    for (let i = 0; i < 4; i++) {
      const ev = new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      evs.push(ev.defaultPrevented);
    }
    const r = window.__gaQuestPad.read();
    return { prevented: evs, source: r.source, y: r.move && +r.move.y.toFixed(3), wheel: r.wheel, play: window.__gaQuestPad.isPlayFrame() };
  });
  chk(playImm.source === 'wheel' && playImm.y < -0.3, 'play copy read() treats wheel as move immediately', playImm);
  const playWheelKey = await playPage.waitForFunction(() => window.__gaKeys && window.__gaKeys.KeyW === 1, null, { timeout: 4000 }).then(() => true).catch(() => false);
  const playWheelMove = await playPage.evaluate(() => ({ keys: window.__gaKeys, source: window.__gaQuestPad.read().source }));
  chk(playWheelKey && playWheelMove.keys.KeyW === 1 && playWheelMove.source === 'wheel', 'wheel in a play copy synthesizes KeyW', playWheelMove);

  chk(errors.length === 0, 'no page errors ' + errors.join('|'));
  await playPage.close();
  await close();
  console.log(ok ? 'ALL OK' : 'SOME FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
