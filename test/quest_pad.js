/* t856u / v237 + t857u / v238: Quest thumbsticks must move the player.
   v237 reads getGamepads(); v238 also translates stick-as-wheel (deltaY
   forward/back, deltaX strafe) because 2D Quest Browser often exposes no
   gamepads. Wheel must not zoom. Play copies get the same helper. ?qdbg=1
   shows the last input source. */
const { open } = require('./lib');

const QUEST_UA = 'Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/36.0.0.0.0 Chrome/122.0.6261.132 Mobile Safari/537.36';

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

  const o = await open({ phone: true, w: 1280, h: 720, ua: QUEST_UA, init: initPads });
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
    A.monkey.position.set(0, 0, 5); st.yaw = 0; st.vel.set(0, 0, 0); st.joy.on = false;
    const d0 = st.dist;
    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: -80, deltaMode: 0, ctrlKey: true, bubbles: true, cancelable: true }));
    }
    const r = Q.read();
    A.applyQuestPad(1 / 60);
    for (let i = 0; i < 30; i++) A.step(1 / 60);
    return { source: r.source, on: st.joy.on, z: +A.monkey.position.z.toFixed(3), dist: st.dist, d0, ctrl: !!(r.wheel && r.wheel.ctrl) };
  });
  chk(wheelCtrl.ctrl && !wheelCtrl.on && wheelCtrl.z > 4.9 && wheelCtrl.dist === wheelCtrl.d0, 'ctrl+wheel (pinch) does not walk or zoom', wheelCtrl);

  const dbg = await page.evaluate(() => {
    const Q = window.__gaQuestPad;
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: -40, deltaMode: 0, bubbles: true, cancelable: true }));
    Q.showDebug(true);
    const el = document.getElementById('gaQdbg');
    const text = el ? el.textContent : '';
    const r = Q.read();
    return { has: !!el, text: (text || '').slice(0, 240), source: r.source, n: r.n };
  });
  chk(dbg.has && /src wheel/.test(dbg.text) && /gamepads/.test(dbg.text) && /keys/.test(dbg.text), '?qdbg overlay shows wheel / gamepads / keys', dbg);

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
