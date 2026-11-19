// Test-link only debug overlay. installDebug() is a no-op unless this is a test build
// (__GA_TEST or __GA_VER starting with "test-"), so a merge to main stays hidden.
const KEY = 'neonarcade.debug';
const WINDOW_MS = 3000;

export function isTestBuild() {
  try {
    if (window.__GA_TEST) return true;
    const v = String(window.__GA_VER || '');
    if (v.indexOf('test-') === 0) return true;
  } catch (e) {}
  return false;
}

export function installDebug() {
  if (!isTestBuild() || (typeof window !== 'undefined' && window.__gaDebug && window.__gaDebug.ok)) return window.__gaDebug || { ok: false };

  const errs = [];
  const hookErr = msg => {
    const s = String(msg == null ? '' : msg).replace(/\s+/g, ' ').trim().slice(0, 180);
    if (!s) return;
    if (errs.length && errs[errs.length - 1] === s) return;
    errs.push(s);
    if (errs.length > 6) errs.shift();
  };
  const _err = console.error;
  console.error = function () {
    try { hookErr(['error:', ...arguments].join(' ')); } catch (e) {}
    return _err.apply(console, arguments);
  };
  addEventListener('error', e => hookErr((e.message || e.error || 'error') + (e.filename ? ' @' + String(e.filename).split('/').pop() : '')));
  addEventListener('unhandledrejection', e => {
    const r = e.reason;
    hookErr('unhandled: ' + (r && (r.message || r.stack || r) || 'promise'));
  });

  let on = false, timer = 0, ov = null, nSamp = 0;
  const tSamp = new Float64Array(180), gSamp = new Float32Array(180);
  let lastInfo = null;

  function wantOn() {
    try {
      const q = new URLSearchParams(location.search).get('debug');
      if (q === '1' || q === 'true' || q === 'on') return true;
      if (q === '0' || q === 'false' || q === 'off') return false;
    } catch (e) {}
    try { return localStorage.getItem(KEY) === '1'; } catch (e) {}
    return false;
  }
  function persist(v) {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {}
  }

  function rendererInfo() {
    return window.__arcade && window.__arcade.renderer && window.__arcade.renderer.info;
  }
  function snapInfo() {
    try {
      const info = rendererInfo();
      if (!info) return;
      lastInfo = {
        geo: info.memory && info.memory.geometries,
        tex: info.memory && info.memory.textures,
        prog: info.programs ? info.programs.length : '—',
        calls: info.render && info.render.calls,
        tris: info.render && info.render.triangles
      };
      // composer does several render()s; keep autoReset off while we are open, then reset for the next frame
      if (info.reset) info.reset();
    } catch (e) {}
  }
  function frame(gap) {
    if (!on) return;
    const now = performance.now();
    const i = nSamp % 180;
    tSamp[i] = now;
    gSamp[i] = gap;
    nSamp++;
    snapInfo();
  }

  function worstAndFps(now) {
    const from = now - WINDOW_MS;
    let max = 0, n1 = 0, sum = 0, seen = 0;
    const n = Math.min(nSamp, 180);
    const start = nSamp - n;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % 180;
      if (tSamp[i] < from) continue;
      const g = gSamp[i];
      if (g > max) max = g;
      seen++;
      if (tSamp[i] >= now - 1000) { n1++; sum += g; }
    }
    const avg = n1 ? sum / n1 : 0;
    return { fps: n1, avg, worst: max, n: seen };
  }

  function roomName() {
    const A = window.__arcade;
    if (!A) return '—';
    if (A.shop && A.shop.open) {
      /* hologram open still counts as shop */
    }
    const p = A.camera && A.camera.position;
    const m = A.monkey && A.monkey.position;
    const x = p ? p.x : (m ? m.x : 0), z = p ? p.z : (m ? m.z : 0);
    const WX = 80, HALF = 12, HALL_L = 5;
    if (x > WX / 2) return 'shop';
    if (z < -HALF - HALL_L) return 'room 2';
    if (z < -HALF) return 'hallway';
    return 'room 1';
  }

  function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }

  function paint() {
    if (!on || !ov) return;
    const A = window.__arcade, now = performance.now();
    const f = worstAndFps(now);
    const st = A && A.stats;
    const gap = st && st.gapAvg != null ? st.gapAvg : f.avg;
    const fps = f.fps || (gap > 0 ? Math.round(1000 / gap) : 0);
    const frameMs = f.avg || gap || 0;
    const worst = f.worst || (st && st.gapMax) || 0;
    const tier = A && A.tier && A.tier.name || '—';
    const ver = window.__GA_VER || '—';
    const room = roomName();
    const tp = A && (A.tp || window.__tp);
    const beam = tp && tp.lastBeamMs != null ? tp.lastBeamMs + ' ms' : '—';
    let heap = '—';
    try {
      const m = performance.memory;
      if (m && m.usedJSHeapSize) heap = mb(m.usedJSHeapSize) + (m.jsHeapSizeLimit ? ' / ' + mb(m.jsHeapSizeLimit) : '');
    } catch (e) {}
    if (!lastInfo) snapInfo();
    const geo = lastInfo && lastInfo.geo != null ? lastInfo.geo : '—';
    const tex = lastInfo && lastInfo.tex != null ? lastInfo.tex : '—';
    const prog = lastInfo && lastInfo.prog != null ? lastInfo.prog : '—';
    const calls = lastInfo && lastInfo.calls != null ? lastInfo.calls : '—';
    const tris = lastInfo && lastInfo.tris != null ? lastInfo.tris : '—';
    const err = errs.length ? errs.map(s => '· ' + s).join('\n') : '· none';
    ov.textContent = 'DEBUG  ' + ver
      + '\n' + fps + ' fps   ' + frameMs.toFixed(1) + ' ms   worst ' + worst.toFixed(1) + ' ms /3s'
      + '\nheap ' + heap
      + '\ngeo ' + geo + '  tex ' + tex + '  prog ' + prog
      + '\ndraws ' + calls + '  tris ' + tris
      + '\ntier ' + tier + '   ' + room
      + '\nlast beam ' + beam
      + '\n' + err;
  }

  function ensureOv() {
    if (ov) return ov;
    ov = document.createElement('pre');
    ov.id = 'gaDbg';
    ov.setAttribute('aria-hidden', 'true');
    Object.assign(ov.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '22',
      margin: '0', padding: '6px 8px', maxWidth: 'min(52vw, 280px)', maxHeight: '42vh',
      overflow: 'auto', pointerEvents: 'none',
      background: 'rgba(6, 2, 16, 0.72)', color: '#d8fbff',
      border: '1px solid rgba(0, 229, 255, 0.35)', borderRadius: '8px',
      font: '600 10px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      textShadow: '0 0 6px #00e5ff55', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      boxShadow: '0 0 12px rgba(0, 180, 255, 0.18)'
    });
    document.body.appendChild(ov);
    return ov;
  }

  function setTimer(v) {
    if (v && !timer) timer = setInterval(paint, 250);
    if (!v && timer) { clearInterval(timer); timer = 0; }
  }

  function set(v) {
    v = !!v;
    on = v;
    persist(v);
    try {
      const info = rendererInfo();
      if (info) {
        if (v) info.autoReset = false;
        else { info.autoReset = true; if (info.reset) info.reset(); }
      }
    } catch (e) {}
    if (v) { ensureOv(); ov.style.display = 'block'; nSamp = 0; lastInfo = null; setTimer(true); paint(); }
    else { setTimer(false); if (ov) ov.style.display = 'none'; }
    syncButtons();
    return on;
  }
  function toggle() { return set(!on); }

  function styleBtn(el, kind) {
    if (!el) return;
    const onNow = on;
    if (kind === 'tk') {
      el.textContent = 'DEBUG: ' + (onNow ? 'ON' : 'OFF');
      el.classList.toggle('on', onNow);
    } else if (kind === 'op') {
      el.innerHTML = 'DEBUG: <span>' + (onNow ? 'ON' : 'OFF') + '</span>';
      el.classList.toggle('sel', onNow);
    } else {
      const st = el.querySelector('span') || el;
      if (el.querySelector('span')) { el.querySelector('span').textContent = onNow ? 'ON' : 'OFF'; }
      else el.textContent = 'DEBUG: ' + (onNow ? 'ON' : 'OFF');
      el.classList.toggle('sel', onNow);
    }
    el.setAttribute('aria-pressed', onNow ? 'true' : 'false');
    el.style.display = '';
  }

  function mk(tag, id, cls, html) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement(tag);
    el.id = id;
    if (cls) el.className = cls;
    el.type = 'button';
    el.innerHTML = html;
    return el;
  }

  function place() {
    const start = document.getElementById('coolBtn');
    if (start && !document.getElementById('dbgStart')) {
      const b = mk('button', 'dbgStart', 'flT', 'DEBUG: <span id="dbgSt">OFF</span>');
      b.style.cssText = 'display:block;margin:10px auto 0;width:min(100%,300px)';
      start.insertAdjacentElement('afterend', b);
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggle(); });
    }
    const grid = document.getElementById('tkGrid');
    if (grid && !document.getElementById('tkDbg')) {
      const b = mk('button', 'tkDbg', 'tkB tkT', 'DEBUG: OFF');
      b.dataset.debug = '1';
      grid.parentNode.appendChild(b);
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggle(); });
    }
    const cool = document.getElementById('opCool');
    if (cool && !document.getElementById('opDbg')) {
      const b = mk('button', 'opDbg', 'opB', 'DEBUG: <span>OFF</span>');
      cool.insertAdjacentElement('afterend', b);
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggle(); });
    }
    syncButtons();
  }
  function syncButtons() {
    styleBtn(document.getElementById('dbgStart'), 'start');
    styleBtn(document.getElementById('tkDbg'), 'tk');
    styleBtn(document.getElementById('opDbg'), 'op');
  }

  let placeT = 0;
  function tickPlace() {
    place();
    if (document.getElementById('dbgStart') && document.getElementById('tkDbg') && document.getElementById('opDbg')) {
      if (placeT) { clearInterval(placeT); placeT = 0; }
    }
  }
  const api = { ok: true, isTest: true, isTestBuild, get on() { return on; }, set, toggle, frame, syncButtons, place, errors: errs, key: KEY };
  window.__gaDebug = api;
  tickPlace();
  placeT = setInterval(tickPlace, 500);
  set(wantOn());
  return api;
}
