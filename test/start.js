// Start screen (player.js): character creator over the room on load; PLAY hidden until a name is typed; taps elsewhere and keys never
// reach the game; typing a name + PLAY (or Enter in the box) dismisses it, unlocks audio, saves the name; nothing leaks into a cabinet.
// Usage: node test/start.js [phone]
const { open, play } = require('./lib');
const fs = require('fs');
const QUEST_UA = 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/36.0.0.0.0 Chrome/122.0.6261.132 VR Safari/537.36';
const ARG = process.argv[2];
const PH = ARG === 'phone';
const QUEST = ARG === 'quest' || process.env.GA_QUEST === '1';
const sfx = PH ? '_phone' : QUEST ? '_quest' : '';
(async () => {
  const supa = r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });   // no real network
  const o = await open(QUEST ? { phone: true, w: 1280, h: 720, ua: QUEST_UA, start: true, supa }
    : PH ? { phone: true, start: true, supa }
    : { start: true, w: 1280, h: 720, supa }); const { page, errors } = o;
  let ok = true; const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 500) : '')); if (!c) ok = false; };
  const S = () => page.evaluate(() => { const A = window.__arcade, P = A.play, el = document.getElementById('start'), g = document.getElementById('gaP'), go = document.getElementById('gaGo');
    return { exists: !!el, ga: !!g && g.isConnected && g.getBoundingClientRect().width > 100, go: !!go && !go.hidden, st: window.__start, pos: [A.monkey.position.x, A.monkey.position.z].map(v => +v.toFixed(3)), face: +A.st.face.toFixed(3),
      cs: P.machines.strike.credits, cg: P.machines.ghost.credits, t: P.tickets.total, mode: P.mode, name: (JSON.parse(localStorage.getItem('galacticarcade.player') || '{}')).name || '', vw: innerWidth, vh: innerHeight }; });
  await page.evaluate(() => localStorage.removeItem('galacticarcade.player')); await page.reload(); await page.waitForFunction(() => window.__arcade && window.__arcade.stats.frames > 3, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const A = window.__arcade, u = A.strikeCab.userData; window.__noAdapt = 1; A.st.fp = false; A.st.vel.set(0, 0, 0); A.monkey.position.set(u.front.x, 0, u.front.z); A.st.face = Math.atan2(u.facing.x, u.facing.z); });
  await page.waitForTimeout(700);
  const a = await S();
  chk(a.exists && a.ga && a.st.shown && !a.st.dismissed, 'start screen shows on load, room running behind it');
  chk(!a.go && a.name === '', 'no name yet: PLAY hidden ("Type your name to play")');
  const acc = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#gaP .gaRow')].map(r => r.dataset.k);
    const who = [...document.querySelectorAll('#gaWho .gaWho')].map(b => [b.dataset.v, b.classList.contains('sel')]);
    const whoH = document.getElementById('gaWhoH');
    return { rows, who, whoH: whoH && whoH.textContent.trim(), name: !!document.getElementById('gaIn'), play: !!document.getElementById('gaGo') };
  });
  chk(acc.rows.length === 0, 'start screen has no accessories rows ' + JSON.stringify(acc));
  chk(acc.who.length === 2 && acc.who[0][0] === 'monkey' && acc.who[1][0] === 'alien' && acc.whoH === 'SELECT PLAYER' && acc.name && acc.play,
    'start screen is player select plus name/PLAY ' + JSON.stringify(acc));
  chk(await page.title() === 'Galactic Arcade', 'page title is Galactic Arcade');

  const layers = await page.evaluate(() => {
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const hit = el => {
      if (!el) return { wrap: 'missing' };
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return { wrap: 'hidden' };
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!top) return { wrap: 'none' };
      const wrap = top.closest('#gaT, #gaIn, #gaGo, #gaHint, #gaCv, #gaStage, #gaP, #start, #gaQscroll, body > canvas');
      return { id: top.id || '', tag: top.tagName, wrap: (wrap && (wrap.id || wrap.tagName)) || top.tagName };
    };
    const start = document.getElementById('start');
    const cv = document.getElementById('gaCv');
    const cs = cv && getComputedStyle(cv);
    const room = document.querySelector('body > canvas');
    const sent = document.getElementById('gaQscroll');
    return {
      vw: innerWidth, vh: innerHeight,
      start: box(start), startZ: start && getComputedStyle(start).zIndex,
      cv: box(cv), cvPos: cs && cs.position,
      hitTitle: hit(document.getElementById('gaT')),
      hitIn: hit(document.getElementById('gaIn')),
      scroll: { x: scrollX, y: scrollY },
      overflow: getComputedStyle(document.documentElement).overflow,
      sentPE: sent && getComputedStyle(sent).pointerEvents,
      spacer: !!document.getElementById('gaQspacer'),
      roomZ: room && getComputedStyle(room).zIndex,
      quest: !!(window.__gaQuestPad && window.__gaQuestPad.isQuest && window.__gaQuestPad.isQuest())
    };
  });
  const startOnScreen = layers.start && Math.abs(layers.start.x) < 4 && Math.abs(layers.start.y) < 4 && layers.start.w > layers.vw * 0.95 && layers.start.h > layers.vh * 0.95;
  const cvNotFull = !layers.cv || (layers.cv.w < layers.vw * 0.92 && layers.cv.h < layers.vh * 0.92);
  const titleOk = /^(gaT|gaP)$/.test(layers.hitTitle.wrap) || layers.hitTitle.wrap === 'gaT';
  const inOk = layers.hitIn.wrap === 'gaIn' || layers.hitIn.id === 'gaIn';
  chk(startOnScreen && layers.scroll.x === 0 && layers.scroll.y === 0, 'start screen covers the viewport and the page is not scrolled', layers);
  chk(cvNotFull && layers.cvPos !== 'fixed' && titleOk && inOk, 'preview player canvas does not cover the start menu or steal the name field', layers);
  if (QUEST) {
    chk(layers.quest && /hidden/.test(layers.overflow) && !layers.spacer && (layers.sentPE === 'none' || layers.sentPE == null) && String(layers.startZ) === '100', 'Quest start UI stays on top; sentinel is pointer-events none and does not change layout', layers);
  }
  if (process.env.GA_SHOT) {
    if (fs.existsSync(process.env.GA_SHOT)) { console.log('REFUSING to overwrite ' + process.env.GA_SHOT); process.exit(1); }
    await page.screenshot({ path: process.env.GA_SHOT });
    console.log('WROTE ' + process.env.GA_SHOT);
  }
  if (!process.env.NOSHOTS && !process.env.GA_SHOT) await page.screenshot({ path: 'shots/start' + sfx + '.png' });
  // taps off the controls and keys do nothing
  for (const [x, y] of [[0.5, 0.05], [0.03, 0.5], [0.97, 0.97]]) { if (PH) await page.touchscreen.tap(a.vw * x, a.vh * y); else await page.mouse.click(a.vw * x, a.vh * y); }
  if (!PH) { await page.keyboard.press('KeyE'); await page.keyboard.press('Enter'); await page.keyboard.press('Space'); }
  await page.waitForTimeout(600);
  let b = await S();
  chk(b.exists && !b.st.dismissed && b.mode === 'walk' && b.cs === a.cs && b.t === a.t, 'taps elsewhere / keys with no name do not start or reach the game');
  // type a name: keys go into the box, not the game
  await page.evaluate(() => { window.__arcade.st.beamed = true; });   // keep them at the cabinet; first-Play beam-in is covered elsewhere
  if (QUEST) {
    await page.evaluate(() => { const i = document.getElementById('gaIn'); if (i) { i.value = 'Astro'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
    await page.waitForSelector('#gaGo:not([hidden])', { timeout: 8000 });
    const hitGo = await page.evaluate(() => {
      const el = document.getElementById('gaGo');
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const wrap = top && top.closest('#gaGo, #gaCv, #gaQscroll, body > canvas, #start');
      return { wrap: wrap && (wrap.id || wrap.tagName), id: top && top.id, tag: top && top.tagName, w: r.width, h: r.height };
    });
    chk(hitGo.wrap === 'gaGo' && hitGo.w > 20 && hitGo.h > 10, 'PLAY is on top and hittable under the Quest UA', hitGo);
    // revert the typed name so play() can fill it cleanly
    await page.evaluate(() => { const i = document.getElementById('gaIn'); if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); } });
  }
  await play(page, PH || QUEST, 'Astro');
  b = await S();
  chk(!b.exists && b.st.dismissed && b.st.audio, 'name + PLAY dismisses it (' + b.st.how + '), audio unlocked');
  chk(b.name === 'Astro', 'name saved to galacticarcade.player (' + b.name + ')');
  chk(JSON.stringify(b.pos) === JSON.stringify(a.pos) && b.face === a.face, 'typing (W/A/S/D in a name too) did not move the monkey ' + JSON.stringify({ a: a.pos, af: a.face, b: b.pos, bf: b.face }));
  chk(b.cs === a.cs && b.cg === a.cg && b.t === a.t && b.mode === 'walk', 'no credit or ticket changed, no zoom started');
  if (PH || QUEST) {
    await page.waitForSelector('#bPlay', { state: 'visible', timeout: 8000 });
    await page.locator('#bPlay').click({ timeout: 8000 });
    await page.waitForFunction(() => window.__arcade && window.__arcade.play && window.__arcade.play.mode === 'zoomIn', null, { timeout: 8000 }).catch(() => {});
  } else {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  }
  { const s1 = await S(); chk(s1.mode === 'zoomIn' || s1.mode === 'game', 'after the start screen, PLAY works normally', s1); }
  // reload: name remembered, PLAY shown straight away; Enter in the box starts (desktop)
  await page.reload(); await page.waitForFunction(() => window.__arcade && window.__arcade.stats.frames > 3, null, { timeout: 60000 }); await page.waitForTimeout(1000);
  if (PH || QUEST) await page.tap('#gaT'); else await page.click('#gaT');
  await page.waitForSelector('#gaGo:not([hidden])', { timeout: 8000 });   // PLAY appears 2 s after a touch (player.js); wait for it, don't assume 2500ms is enough under load
  b = await S(); chk(b.exists && b.go && await page.evaluate(() => document.getElementById('gaIn').value) === 'Astro', 'after reload the name is filled in and PLAY is shown');
  if (!PH && !QUEST) { await page.click('#gaIn'); await page.keyboard.press('Enter'); await page.waitForFunction(() => !document.getElementById('start') && window.__start && window.__start.dismissed, null, { timeout: 8000 }); b = await S(); chk(!b.exists && b.st.dismissed && b.mode === 'walk', 'Enter in the name box starts, and the key is not used by the game'); }
  chk(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await o.close(); process.exit(ok ? 0 : 1);
})();
