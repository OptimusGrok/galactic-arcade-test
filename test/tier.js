// t854u / v231: low-end GPU tier — auto-detect, caps, no composer/demos, context-loss reload, no floor-swap leak.
const { open } = require('./lib');

(async () => {
  let ok = true;
  const chk = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
  const sessions = [];
  const run = async (opts = {}) => {
    const s = await open(opts);
    sessions.push(s);
    return s;
  };
  const mem = page => page.evaluate(() => window.__arcade.mem());
  const wait = (page, ms) => page.waitForTimeout(ms);

  // ---- default desktop: not low (SwiftShader is not treated as weak) ----
  {
    const { page, errors, close } = await run({ w: 800, h: 450 });
    await page.evaluate(() => { window.__noAdapt = 1; });
    const info = await page.evaluate(() => {
      const T = window.__gaTier, A = window.__arcade, M = A.mem();
      return { name: T.name, why: T.why, software: T.software, gpu: T.gpu, dpr: M.dpr, post: M.post, cabDemos: M.cabDemos, composer: !!(A.renderer && /* composer via mem.post */ M.post), mem: M };
    });
    console.log('desktop', JSON.stringify({ name: info.name, why: info.why, dpr: info.dpr, post: info.post, texMB: info.mem.texMB, rtMB: info.mem.rtMB, lightsOn: info.mem.lightsOn, iframes: info.mem.iframes, iframeSrc: info.mem.iframeSrc, jsMB: info.mem.jsMB, drawingBuffer: info.mem.drawingBuffer }));
    chk(info.name !== 'low', 'default desktop is not low, got ' + info.name + ' ' + JSON.stringify(info.why));
    chk(info.dpr <= 2, 'default desktop dpr is capped, got ' + info.dpr);
    chk(info.post === true, 'default desktop uses post-processing');
    chk(errors.length === 0, 'no page errors ' + errors.join(' | '));
    await close();
  }

  // ---- default phone: mid (not low), power-save dpr cap still 1.25 ----
  {
    const { page, errors, close } = await run({ phone: true, w: 390, h: 700 });
    await page.evaluate(() => { window.__noAdapt = 1; });
    const info = await page.evaluate(() => {
      const T = window.__gaTier, P = window.__powerSave, M = window.__arcade.mem();
      return { name: T.name, why: T.why, on: !!(P && P.on), dpr: M.dpr, post: M.post, mem: M };
    });
    console.log('phone', JSON.stringify({ name: info.name, why: info.why, on: info.on, dpr: info.dpr, post: info.post, texMB: info.mem.texMB, rtMB: info.mem.rtMB, lightsOn: info.mem.lightsOn, jsMB: info.mem.jsMB }));
    chk(info.name === 'mid', 'default phone is mid, got ' + info.name + ' ' + JSON.stringify(info.why));
    chk(info.on, 'phone power-save still on by default');
    chk(info.dpr <= 1.251, 'phone dpr still clamped to 1.25, got ' + info.dpr);
    chk(info.post === true, 'mid phone still has (cheap) post');
    chk(errors.length === 0, 'no page errors ' + errors.join(' | '));
    await close();
  }

  // ---- auto-detect low from deviceMemory=2 ----
  {
    const { page, errors, close } = await run({
      phone: true, w: 390, h: 700,
      init: () => {
        try { Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 2 }); } catch (e) {}
        try { Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => 4 }); } catch (e) {}
      }
    });
    await page.evaluate(() => { window.__noAdapt = 1; });
    await wait(page, 600);
    const info = await page.evaluate(() => {
      const T = window.__gaTier, M = window.__arcade.mem();
      return { name: T.name, why: T.why, dpr: M.dpr, post: M.post, cabDemos: M.cabDemos, mem: M, composerObj: !!(window.__arcade && window.__arcade.mem().post) };
    });
    console.log('auto-low', JSON.stringify({ name: info.name, why: info.why, dpr: info.dpr, post: info.post, texMB: info.mem.texMB, rtMB: info.mem.rtMB, lightsOn: info.mem.lightsOn, iframes: info.mem.iframes, iframeSrc: info.mem.iframeSrc, jsMB: info.mem.jsMB, drawingBuffer: info.mem.drawingBuffer }));
    chk(info.name === 'low', 'deviceMemory=2 auto-detects low, got ' + info.name + ' ' + JSON.stringify(info.why));
    chk(info.dpr <= 1, 'low tier dpr is <= 1, got ' + info.dpr);
    chk(info.post === false, 'low tier has no composer / post');
    chk(info.cabDemos === false, 'low tier cabDemos off');
    const demoSrc = (info.mem.iframeSrc || []).filter(s => s && /strike-demo|ghost-demo/.test(s) && s !== 'about:blank');
    chk(demoSrc.length === 0, 'low tier did not attach live demo iframes ' + JSON.stringify(info.mem.iframeSrc));
    chk(info.mem.rtMB < 2, 'low tier render-target memory is tiny, got ' + info.mem.rtMB + ' MB');
    chk(errors.length === 0, 'no page errors ' + errors.join(' | '));
    await close();
  }

  // ---- forced ? via localStorage ----
  {
    const { page, close } = await run({
      w: 800, h: 450,
      init: () => { try { localStorage.setItem('galacticarcade.tier', 'low'); } catch (e) {} }
    });
    await page.evaluate(() => { window.__noAdapt = 1; });
    await wait(page, 400);
    const info = await page.evaluate(() => window.__arcade.mem());
    console.log('forced-low', JSON.stringify({ tier: info.tier, why: info.why, dpr: info.dpr, post: info.post, texMB: info.texMB, rtMB: info.rtMB, lightsOn: info.lightsOn, jsMB: info.jsMB }));
    chk(info.tier === 'low', 'localStorage galacticarcade.tier=low forces low');
    chk(info.post === false, 'forced low has no post');
    await close();
  }

  // ---- floor/wall swap does not grow GPU textures ----
  {
    const { page, close } = await run({ w: 800, h: 450, randomRoom: true });
    await page.evaluate(() => { window.__noAdapt = 1; });
    const before = await mem(page);
    await page.evaluate(() => {
      const RR = window.__arcade.randomRoom;
      for (let i = 0; i < 8; i++) RR.tick();
    });
    const after = await mem(page);
    console.log('floor-swap', JSON.stringify({ before: { texN: before.texN, infoTex: before.info && before.info.tex, texMB: before.texMB }, after: { texN: after.texN, infoTex: after.info && after.info.tex, texMB: after.texMB } }));
    chk(after.texN <= before.texN + 2, 'floor/wall swap does not grow walked textures ' + before.texN + ' -> ' + after.texN);
    chk((after.info && after.info.tex) <= ((before.info && before.info.tex) || 0) + 4, 'renderer.info textures do not grow on swap ' + (before.info && before.info.tex) + ' -> ' + (after.info && after.info.tex));
    await close();
  }

  // ---- context loss: overlay, persist low, reload at low ----
  {
    const { page, errors, close } = await run({ w: 800, h: 450 });
    await page.evaluate(() => { window.__noAdapt = 1; });
    const beforeName = await page.evaluate(() => window.__gaTier.name);
    chk(beforeName !== 'low', 'context-loss fixture starts above low, got ' + beforeName);
    await page.evaluate(() => {
      const gl = window.__arcade.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) throw new Error('WEBGL_lose_context missing');
      ext.loseContext();
    });
    const shown = await page.waitForFunction(() => {
      const el = document.getElementById('glLost');
      return !!(el && !el.hidden && (el.classList.contains('on') || true));
    }, null, { timeout: 4000 }).then(() => true).catch(() => false);
    chk(shown, 'context-loss overlay is shown');
    const persisted = await page.evaluate(() => localStorage.getItem('galacticarcade.tier'));
    chk(persisted === 'low', 'context-loss persists galacticarcade.tier=low, got ' + persisted);
    await page.waitForFunction(() => window.__arcade && window.__gaTier && window.__gaTier.name === 'low' && window.__arcade.stats.frames > 3, null, { timeout: 60000 });
    const after = await page.evaluate(() => ({ name: window.__gaTier.name, post: window.__arcade.mem().post, dpr: window.__arcade.mem().dpr, why: window.__gaTier.why }));
    console.log('after-loss', JSON.stringify(after));
    chk(after.name === 'low' && after.post === false, 'reload after context-loss boots the low tier ' + JSON.stringify(after));
    const serious = errors.filter(e => !/context lost|WebGL|CONTEXT_LOST|webglcontextlost/i.test(e));
    chk(serious.length === 0, 'no unexpected page errors after context-loss ' + serious.join(' | '));
    await close();
  }

  // ---- forced high still has composer on desktop ----
  {
    const { page, close } = await run({
      w: 800, h: 450,
      init: () => { try { localStorage.setItem('galacticarcade.tier', 'high'); } catch (e) {} }
    });
    const info = await page.evaluate(() => window.__arcade.mem());
    console.log('forced-high', JSON.stringify({ tier: info.tier, post: info.post, dpr: info.dpr, rtMB: info.rtMB, rtN: info.rtN }));
    chk(info.tier === 'high' && info.post === true, 'forced high still has composer');
    await close();
  }

  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FAIL exception ' + (e.stack || e.message)); process.exit(1); });
