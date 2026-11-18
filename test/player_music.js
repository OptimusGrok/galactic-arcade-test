// Start-screen music (player.js): silent until the first gesture, then a looping AudioBufferSourceNode with trimmed loop points;
// fades out and stops on PLAY; not playing in-game.
const { open } = require('./lib');
(async () => { let o; for (let i = 0; ; i++) { try { o = await open({ phone: true, start: true, w: 412, h: 915, supa: r => r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }) }); break; } catch (e) { if (i > 3) throw e; console.log('retry open'); } }
  const { page, errors } = o; let ok = true; const chk = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? ' ' + JSON.stringify(x) : '')); if (!c) ok = false; };
  const M = () => page.evaluate(() => { const m = window.__gaPlayer.music; return { playing: m.playing, starts: m.starts, stops: m.stops, loop: !!(m.src && m.src.loop), ls: m.loopStart, le: m.loopEnd, len: m.len, lead: m.lead, hasBuf: !!m.buf, gain: m.g ? +m.g.gain.value.toFixed(3) : null, ac: m.ac && m.ac.state, err: m.err }; });
  await page.waitForTimeout(1500);
  let m = await M(); chk(!m.playing && m.starts === 0, 'no music before any gesture', m);
  const t = await page.evaluate(() => { const b = document.getElementById('gaT').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.touchscreen.tap(t[0], t[1]);
  await page.waitForFunction(() => window.__gaPlayer.music.playing, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500);
  m = await M(); chk(m.playing && m.loop && m.starts === 1 && Math.abs((m.le - m.ls) - 1568000 / 44100) < 0.001 && m.gain > 0.3 && m.gain <= 0.5, 'a tap starts a looping buffer source, loop = exactly 16 bars, moderate gain', m);
  chk(!(await page.evaluate(() => window.__start.dismissed)), 'the tap did not start the game');
  // Phone headless build often does not focus #gaIn from a tap + keyboard.type, and a touch tap can miss #gaGo.
  await page.evaluate(() => { const inp = document.getElementById('gaIn'); inp.value = 'Dave'; inp.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForSelector('#gaGo:not([hidden])', { timeout: 20000 });
  await page.evaluate(() => document.getElementById('gaGo').click());
  await page.waitForFunction(() => window.__start && window.__start.dismissed, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  m = await M(); chk(!m.playing && m.stops === 1 && m.gain === null && !m.hasBuf, 'PLAY fades out, stops the start music, and frees its decoded buffer', m);
  chk(await page.evaluate(() => window.__start.dismissed), 'game started');
  await page.waitForTimeout(1500); m = await M(); chk(!m.playing && m.starts === 1, 'still silent in-game', m);
  chk(errors.length === 0, 'no page errors', errors); await o.close(); process.exit(ok ? 0 : 1); })();
