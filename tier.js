// t854u / v231: low-end GPU tier. Cheap phones were crashing (coloured streaks =
// WebGL context loss / GPU memory exhaustion). Detect a weak device, cap pixel
// ratio and post-processing, skip live cabinet-demo iframes, and reload at the
// lower tier if the context is lost.
export const TIER_KEY = 'galacticarcade.tier';

const WEAK_GPU = /Mali-4|Mali-T[67]|Mali-G[3-5][0-9](?![6-9])|Adreno \(TM\) [2-5]\d{2}|Adreno [2-5]\d{2}|PowerVR|VideoCore|GC\d{3,4}/i;
const SOFTWARE_GL = /SwiftShader|llvmpipe|Microsoft Basic Render|softpipe/i;

export function isSoftwareGL(gpu) { return SOFTWARE_GL.test(gpu || ''); }

export function probeGPU() {
  const out = { renderer: '', maxTex: 0 };
  let gl = null, lose = null;
  try {
    const c = document.createElement('canvas');
    gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: false }) || c.getContext('experimental-webgl');
    if (!gl) return out;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    out.renderer = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '') || gl.getParameter(gl.RENDERER) || '';
    out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    lose = gl.getExtension('WEBGL_lose_context');
  } catch (e) {}
  try { if (lose) lose.loseContext(); } catch (e) {}
  return out;
}

function forcedTier() {
  try {
    const q = new URLSearchParams(location.search).get('tier');
    if (q === 'low' || q === 'mid' || q === 'high') return q;
  } catch (e) {}
  try {
    const s = localStorage.getItem(TIER_KEY);
    if (s === 'low' || s === 'mid' || s === 'high') return s;
  } catch (e) {}
  return null;
}

export function detectTier(opt = {}) {
  const forced = forcedTier();
  const gpu = opt.renderer || '';
  const maxTex = opt.maxTex || 0;
  const mem = (typeof navigator.deviceMemory === 'number') ? navigator.deviceMemory : null;
  const cores = navigator.hardwareConcurrency || 8;
  const mobile = !!opt.mobile;
  const why = [];
  let name = 'high';
  if (forced) { why.push('forced:' + forced); name = forced; }
  else if (mem != null && mem <= 2) { name = 'low'; why.push('deviceMemory=' + mem); }
  else if (mem != null && mem <= 4 && cores <= 4) { name = 'low'; why.push('deviceMemory=' + mem + ',cores=' + cores); }
  else if (maxTex && maxTex <= 2048) { name = 'low'; why.push('MAX_TEXTURE_SIZE=' + maxTex); }
  else if (WEAK_GPU.test(gpu) && (mem == null || mem <= 4)) { name = 'low'; why.push('gpu=' + gpu); }
  else if (mobile && cores <= 2) { name = 'low'; why.push('mobile,cores=' + cores); }
  else if (mobile && mem != null && mem <= 4) { name = 'mid'; why.push('mobile,deviceMemory=' + mem); }
  else if (mobile) { name = 'mid'; why.push('mobile'); }
  else { name = 'high'; why.push('desktop'); }
  return { name, why, gpu, maxTex, mem, cores, mobile, software: isSoftwareGL(gpu), forced: !!forced };
}

export function qualityForTier(tier, { mobile = false, powerSave = false } = {}) {
  // t854u / v232: texMax = longest image edge after downsample; cabScale shrinks cabinet canvases;
  // mips off saves ~33% GPU memory; shopCell is the prize-atlas cell (atlas is 16x16 cells).
  if (tier === 'low') return { dpr: 1, refl: 0, bloom: 0, post: false, samples: 0, mirrorSamples: 0, cabDemos: false, aniso: 1, fps: 30, warm: false, windowQ: 0.28, rtFloat: false, texMax: 384, cabScale: 0.5, mips: false, shopCell: 64, shopLab: 0.5, nbW: 256, nbH: 320, previewDpr: 1, stone: 256 };
  if (tier === 'mid' && powerSave) return { dpr: 1.25, refl: 0.22, bloom: 0.28, post: true, samples: 0, mirrorSamples: 0, cabDemos: true, aniso: 2, fps: 30, warm: true, windowQ: 0.5, rtFloat: false, texMax: 640, cabScale: 0.75, mips: true, shopCell: 96, shopLab: 0.75, nbW: 384, nbH: 480, previewDpr: 1.25, stone: 512 };
  if (tier === 'mid') return { dpr: 1.5, refl: 0.28, bloom: 0.28, post: true, samples: 0, mirrorSamples: 0, cabDemos: true, aniso: 4, fps: 60, warm: true, windowQ: 0.75, rtFloat: false, texMax: 768, cabScale: 0.75, mips: true, shopCell: 96, shopLab: 0.75, nbW: 384, nbH: 480, previewDpr: 1.25, stone: 512 };
  if (powerSave) return { dpr: mobile ? 1.25 : 1.5, refl: mobile ? 0.22 : 0.35, bloom: 0.28, post: true, samples: 0, mirrorSamples: 0, cabDemos: true, aniso: 4, fps: 30, warm: true, windowQ: 0.75, rtFloat: false, texMax: 768, cabScale: 0.85, mips: true, shopCell: 128, shopLab: 1, nbW: 512, nbH: 640, previewDpr: 1.25, stone: 512 };
  if (mobile) return { dpr: 1.5, refl: 0.35, bloom: 0.35, post: true, samples: 0, mirrorSamples: 0, cabDemos: true, aniso: 4, fps: 60, warm: true, windowQ: 0.75, rtFloat: false, texMax: 0, cabScale: 1, mips: true, shopCell: 128, shopLab: 1, nbW: 512, nbH: 640, previewDpr: 1.5, stone: 1024 };
  return { dpr: 2, refl: 0.5, bloom: 0.5, post: true, samples: 2, mirrorSamples: 2, cabDemos: true, aniso: 8, fps: 60, warm: true, windowQ: 1, rtFloat: true, texMax: 0, cabScale: 1, mips: true, shopCell: 128, shopLab: 1, nbW: 512, nbH: 640, previewDpr: 1.5, stone: 1024 };
}

export function tierQuality() {
  try { return (typeof window !== 'undefined' && window.__gaTier && window.__gaTier.quality) || {}; } catch (e) { return {}; }
}

export function scaleWH(w, h, scale = 1, max = 0) {
  let ww = Math.max(1, Math.round(w * (scale || 1))), hh = Math.max(1, Math.round(h * (scale || 1)));
  if (max && Math.max(ww, hh) > max) {
    const s = max / Math.max(ww, hh);
    ww = Math.max(1, Math.round(ww * s)); hh = Math.max(1, Math.round(hh * s));
  }
  return [ww, hh];
}

export function cabWH(w, h) {
  const q = tierQuality();
  return scaleWH(w, h, q.cabScale == null ? 1 : q.cabScale, 0);
}

export function flagTex(t, THREE) {
  if (!t) return t;
  const q = tierQuality();
  if (q.mips === false) {
    t.generateMipmaps = false;
    if (THREE && THREE.LinearFilter) t.minFilter = THREE.LinearFilter;
  }
  if (q.aniso != null) t.anisotropy = q.aniso;
  return t;
}

// Turn off mipmaps without changing magFilter (pixel-art sides can keep Nearest).
export function skipMips(t, THREE) {
  if (!t) return t;
  t.generateMipmaps = false;
  if (THREE && THREE.LinearFilter) {
    const near = THREE.NearestFilter && (t.magFilter === THREE.NearestFilter || t.minFilter === THREE.NearestFilter
      || t.minFilter === THREE.NearestMipmapNearestFilter || t.minFilter === THREE.NearestMipmapLinearFilter);
    t.minFilter = near ? THREE.NearestFilter : THREE.LinearFilter;
  }
  return t;
}

// Downsample a loaded image texture to quality.texMax (or opt.max) and apply mip/aniso flags.
// opt = { max, mips: false } overrides the current tier for a specific texture.
export function capLoadedTexture(t, THREE, opt) {
  if (!t) return t;
  const q = tierQuality();
  const img = t.image;
  const iw = img && (img.width || img.videoWidth) || 0;
  const ih = img && (img.height || img.videoHeight) || 0;
  const max = (opt && opt.max) || q.texMax || 0;
  if (max && iw && ih && Math.max(iw, ih) > max) {
    try {
      const [w, h] = scaleWH(iw, ih, 1, max);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      t.image = c; t.needsUpdate = true;
    } catch (e) {}
  }
  flagTex(t, THREE);
  if (opt && opt.mips === false) skipMips(t, THREE);
  return t;
}

// Cabinet side art: cap the long edge at 512 (typically 256x512) and skip mipmaps.
// 12 cabs x two 512x1024 sides with mips was ~51-85 MB; this lands near 12 MB.
export function capCabSideTexture(t, THREE) {
  return capLoadedTexture(t, THREE, { max: 512, mips: false });
}

// t893u: toggle heavy maps / reflectors on the GPU. Off keeps placeholder colours and shrinks
// render targets to 1x1; on restores the maps (needsUpdate re-uploads) and the RT size.
// Texture.dispose() frees the WebGL texture but leaves the image/canvas so a later on() can re-upload.
export function bindStreamGpu(root, opt = {}) {
  const minEdge = opt.minEdge == null ? 512 : opt.minEdge;
  const names = opt.names ? new Set(opt.names) : null;
  const also = opt.alsoNames ? new Set(opt.alsoNames) : null;
  const colors = Object.assign({
    muralLeft: 0x3a2430, muralRight: 0x3a2430, muralSide: 0x2e2030, muralSide2: 0x2e2030,
    muralTop: 0x2a1828, muralTitle: 0x241828, shelfBoxes: 0xc4a070, priceLabels: 0x1e3378,
    grokShopSign: 0x0e1638, screen: 0x0a0814
  }, opt.colors || {});
  const texSize = t => {
    if (!t) return 0;
    if (t.isWebGLRenderTarget) return Math.max(t.width || 0, t.height || 0);
    const img = t.image || (t.source && t.source.data);
    return Math.max((img && (img.width || img.videoWidth)) || 0, (img && (img.height || img.videoHeight)) || 0);
  };
  const items = [];
  root.traverse(o => {
    if (o && typeof o.getRenderTarget === 'function') {
      const rt = o.getRenderTarget();
      if (rt && Math.max(rt.width || 0, rt.height || 0) >= 64) items.push({ kind: 'rt', rt, w: rt.width, h: rt.height, name: o.name });
      return;
    }
    if (!o || !o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const slot of ['map', 'emissiveMap']) {
        const t = mat[slot]; if (!t || t.isWebGLRenderTarget) continue;
        const sz = texSize(t);
        if (names && !names.has(o.name)) continue;
        // include allow-listed meshes even before TextureLoader has set image width (else murals/DS never evict)
        if (!names && sz < minEdge && !(also && also.has(o.name))) continue;
        items.push({ kind: 'map', mat, slot, tex: t, name: o.name, color: colors[o.name] || 0x1a1220, orig: mat.color ? mat.color.getHex() : 0xffffff });
      }
    }
  });
  const api = {
    on: true,
    items,
    set(on) {
      on = !!on;
      if (on === api.on) return api;
      api.on = on;
      for (const it of items) {
        try {
          if (it.kind === 'rt') { it.rt.setSize(on ? it.w : 1, on ? it.h : 1); continue; }
          if (on) {
            it.mat[it.slot] = it.tex;
            if (it.slot === 'map' && it.mat.color) it.mat.color.setHex(it.orig || 0xffffff);
            it.tex.needsUpdate = true; it.mat.needsUpdate = true;
          } else {
            it.mat[it.slot] = null;
            if (it.slot === 'map' && it.mat.color) it.mat.color.setHex(it.color);
            it.mat.needsUpdate = true;
            try { it.tex.dispose(); } catch (e) {}
          }
        } catch (e) {}
      }
      return api;
    }
  };
  return api;
}

export function persistTier(name) {
  try { if (name) localStorage.setItem(TIER_KEY, name); else localStorage.removeItem(TIER_KEY); } catch (e) {}
}

export function installContextLossHandler(canvas, { onLost, onRestored } = {}) {
  if (!canvas || canvas.__gaCtxLoss) return;
  canvas.__gaCtxLoss = true;
  canvas.addEventListener('webglcontextlost', ev => {
    try { ev.preventDefault(); } catch (e) {}
    persistTier('low');
    try { if (onLost) onLost(ev); } catch (e) {}
    const el = document.getElementById('glLost');
    if (el) { el.hidden = false; el.classList.add('on'); }
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 700);
  });
  canvas.addEventListener('webglcontextrestored', ev => { try { if (onRestored) onRestored(ev); } catch (e) {} });
}

export function memSnapshot({ THREE, renderer, scene, composer, extras = {} } = {}) {
  const T = THREE, r = renderer, gl = r && r.getContext();
  const seen = new Set();
  let texBytes = 0, texN = 0, rtBytes = 0, rtN = 0, geoN = 0, geoBytes = 0;
  const bppOf = typ => (T && (typ === T.HalfFloatType || typ === T.FloatType)) ? 8 : 4;
  const addTex = t => {
    if (!t || seen.has(t)) return; seen.add(t);
    const img = t.image;
    const w = (img && (img.width || img.videoWidth)) || t.image && t.image.data && t.source && 0 || (img && img.data ? Math.sqrt(img.data.length / 4) : 0) || 0;
    const h = (img && (img.height || img.videoHeight)) || w;
    const ww = (typeof w === 'number' && isFinite(w)) ? w : 0;
    const hh = (typeof h === 'number' && isFinite(h)) ? h : 0;
    const k = t.generateMipmaps ? 4 / 3 : 1;
    texBytes += ww * hh * bppOf(t.type) * k; texN++;
  };
  const addRT = rt => {
    if (!rt || seen.has(rt)) return; seen.add(rt);
    const w = rt.width || 0, h = rt.height || 0;
    const typ = rt.texture && rt.texture.type;
    const samples = rt.samples || 0;
    rtBytes += w * h * bppOf(typ) * (samples ? samples + 1 : 1); rtN++;
    if (rt.texture) seen.add(rt.texture);
  };
  if (scene) scene.traverse(o => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m) {
      for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) addTex(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) addTex(u.value);
    }
    if (o.isReflector && o.getRenderTarget) addRT(o.getRenderTarget());
    if (o.geometry) {
      geoN++;
      const a = o.geometry.attributes; for (const k in a) if (a[k] && a[k].array) geoBytes += a[k].array.byteLength;
      if (o.geometry.index && o.geometry.index.array) geoBytes += o.geometry.index.array.byteLength;
    }
  });
  if (composer) {
    if (composer.readBuffer) addRT(composer.readBuffer);
    if (composer.writeBuffer) addRT(composer.writeBuffer);
    if (composer.renderTarget1) addRT(composer.renderTarget1);
    if (composer.renderTarget2) addRT(composer.renderTarget2);
    try {
      for (const p of composer.passes || []) {
        if (p.renderTargets) for (const t of p.renderTargets) addRT(t);
        if (p.renderTargetX) addRT(p.renderTargetX);
        if (p.renderTargetY) addRT(p.renderTargetY);
      }
    } catch (e) {}
  }
  const canvases = [...document.querySelectorAll('canvas')].map(c => ({ id: c.id, w: c.width, h: c.height, bytes: c.width * c.height * 4 }));
  const iframes = [...document.querySelectorAll('iframe')].map(f => ({ src: f.getAttribute('src'), connected: f.isConnected }));
  let lights = 0, lightsOn = 0;
  if (scene) scene.traverse(o => { if (o.isLight) { lights++; if (o.visible && o.intensity > 0) lightsOn++; } });
  const mem = (typeof performance !== 'undefined' && performance.memory) || null;
  const dpr = r ? r.getPixelRatio() : 0;
  const dbw = gl ? gl.drawingBufferWidth : 0, dbh = gl ? gl.drawingBufferHeight : 0;
  return Object.assign({
    dpr, drawingBuffer: [dbw, dbh],
    maxTex: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0,
    info: r ? { tex: r.info.memory.textures, geo: r.info.memory.geometries, prog: (r.info.programs || []).length, calls: r.info.render.calls, tris: r.info.render.triangles } : null,
    texMB: +(texBytes / 1e6).toFixed(2), texN,
    rtMB: +(rtBytes / 1e6).toFixed(2), rtN,
    geoMB: +(geoBytes / 1e6).toFixed(2), geoN,
    lights, lightsOn,
    canvasMB: +(canvases.reduce((s, c) => s + c.bytes, 0) / 1e6).toFixed(2), canvases: canvases.length,
    iframes: iframes.length, iframeSrc: iframes.map(i => i.src),
    jsMB: mem ? +(mem.usedJSHeapSize / 1e6).toFixed(1) : null,
    audio: document.querySelectorAll('audio').length
  }, extras);
}

export function ensureLostOverlay() {
  if (document.getElementById('glLost')) return;
  const el = document.createElement('div');
  el.id = 'glLost'; el.hidden = true; el.setAttribute('role', 'alert');
  el.innerHTML = '<b>GRAPHICS RESET</b><span>This device ran out of graphics memory. Reloading a lighter version so the arcade can keep running.</span>';
  document.body.appendChild(el);
}
