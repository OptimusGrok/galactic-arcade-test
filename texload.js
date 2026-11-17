// t911u: load picture assets as locally-vendored KTX2/Basis when the GPU can transcode them,
// falling back to the original jpg/webp/png. Identical URLs share one Texture.
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { capCabSideTexture, capLoadedTexture, flagTex, skipMips } from './tier.js';

import { KTX2 as KTX2_MAP } from './tex_ktx2.js';

const shared = new Map();
let _ktx = null, _ktxOk = false;

export function ktx2For(url) {
  if (!url || /\.ktx2(\?|$)/i.test(url)) return url;
  const path = String(url).replace(/[?#].*$/, '');
  const m = path.match(/((?:tex|img)\/[A-Za-z0-9_./-]+)$/);
  const rel = m ? m[1] : null;
  if (rel && KTX2_MAP[rel]) return KTX2_MAP[rel];
  return null;
}

export function initTexLoader(renderer, THREE) {
  try {
    _ktx = new KTX2Loader().setTranscoderPath('vendor/basis/').detectSupport(renderer);
    const cfg = (_ktx && _ktx.workerConfig) || {};
    _ktxOk = !!(cfg.astcSupported || cfg.etc1Supported || cfg.etc2Supported || cfg.dxtSupported || cfg.bptcSupported || cfg.pvrtcSupported);
    if (!_ktxOk) { try { _ktx.dispose && _ktx.dispose(); } catch (e) {} _ktx = null; }
  } catch (e) { _ktx = null; _ktxOk = false; }
  return _ktxOk;
}

export function texReady() { return Promise.resolve(_ktxOk); }
export function ktxSupported() { return _ktxOk; }
export function ktxLoader() { return _ktx; }

function isReady(t) {
  if (!t) return false;
  if (t.isCompressedTexture) {
    const m = t.mipmaps;
    return !!(m && m.length && (m[0].data || m[0].width > 4 || (m[0].data && m[0].data.length)));
  }
  return !!(t.image && (t.image.width || t.image.videoWidth || t.image.mipmaps));
}

function applyFlags(t, THREE, opt) {
  if (!t) return t;
  const isKtx = !!(t.isCompressedTexture);
  if (opt && opt.colorSpace != null) t.colorSpace = opt.colorSpace;
  else if (THREE && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  if (isKtx) {
    t.generateMipmaps = false;
    t.flipY = false;
    flagTex(t, THREE);
    if (opt && opt.mips === false) skipMips(t, THREE);
    return t;
  }
  if (opt && opt.side) return capCabSideTexture(t, THREE);
  return capLoadedTexture(t, THREE, opt && (opt.max || opt.mips === false) ? { max: opt.max, mips: opt.mips } : undefined);
}

function applyWrap(t, opt) {
  if (!t || !opt) return t;
  if (opt.wrapS) t.wrapS = opt.wrapS;
  if (opt.wrapT) t.wrapT = opt.wrapT;
  if (opt.repeat) {
    if (opt.repeat.x != null) t.repeat.set(opt.repeat.x, opt.repeat.y != null ? opt.repeat.y : opt.repeat.x);
    else if (typeof opt.repeat === 'number') t.repeat.set(opt.repeat, opt.repeat);
  }
  if (opt.offset) t.offset.set(opt.offset.x || 0, opt.offset.y || 0);
  if (opt.flipY != null) t.flipY = opt.flipY;
  return t;
}

function retargetMaps(from, to) {
  const roots = [];
  const A = typeof window !== 'undefined' ? window.__arcade : null;
  if (A && A.scene) roots.push(A.scene);
  if (A && A.shop && A.shop.group) roots.push(A.shop.group);
  for (const root of roots) {
    if (!root || !root.traverse) continue;
    root.traverse(o => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (!m) continue;
        for (const slot of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) {
          if (m[slot] === from) { m[slot] = to; m.needsUpdate = true; }
        }
      }
    });
  }
}

function fillCompressed(dst, src, THREE, opt) {
  dst.mipmaps = src.mipmaps && src.mipmaps.length ? src.mipmaps : (src.image && src.image.mipmaps) || [];
  dst.image = src.image;
  if (src.format != null) dst.format = src.format;
  if (src.type != null) dst.type = src.type;
  if (src.minFilter != null) dst.minFilter = src.minFilter;
  if (src.magFilter != null) dst.magFilter = src.magFilter;
  dst.generateMipmaps = false;
  dst.flipY = false;
  if (src.premultiplyAlpha != null) dst.premultiplyAlpha = src.premultiplyAlpha;
  if (src.colorSpace != null) dst.colorSpace = src.colorSpace;
  dst.needsUpdate = true;
  applyFlags(dst, THREE, opt);
  applyWrap(dst, opt);
  return dst;
}

// Returns a Texture immediately. The same url always yields the same object so cabinet sides can share it.
export function loadPicture(THREE, url, opt = {}) {
  const key = (opt.shareKey || url.split('?')[0]) + (opt.side ? '#side' : '') + (opt.max ? '#m' + opt.max : '');
  if (!opt.noShare && shared.has(key)) {
    const prev = shared.get(key);
    if (opt.onLoad) {
      if (isReady(prev)) { try { opt.onLoad(prev); } catch (e) {} }
      else (prev._gaWait || (prev._gaWait = [])).push(opt.onLoad);
    }
    return prev;
  }
  const finish = t => {
    applyFlags(t, THREE, opt);
    applyWrap(t, opt);
    const wait = t._gaWait || [];
    t._gaWait = [];
    for (const fn of wait) { try { fn(t); } catch (e) {} }
    if (opt.onLoad) { try { opt.onLoad(t); } catch (e) {} }
  };
  const ktx = (_ktxOk && _ktx && ktx2For(url)) || null;
  let tex;
  if (ktx) {
    // KTX2Loader.load() does not return a Texture; keep a CompressedTexture stub so
    // materials assigned before transcode finishes keep a stable identity.
    tex = new THREE.CompressedTexture([], 4, 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.flipY = false;
    if (THREE.LinearFilter) tex.minFilter = THREE.LinearFilter;
    flagTex(tex, THREE);
    applyWrap(tex, opt);
    _ktx.load(ktx, loaded => {
      fillCompressed(tex, loaded, THREE, opt);
      finish(tex);
    }, undefined, () => {
      const fb = new THREE.TextureLoader().load(url, imgTex => {
        applyFlags(imgTex, THREE, opt);
        applyWrap(imgTex, opt);
        if (!opt.noShare) shared.set(key, imgTex);
        retargetMaps(tex, imgTex);
        const wait = tex._gaWait || [];
        imgTex._gaWait = wait;
        tex._gaWait = [];
        finish(imgTex);
      });
      console.warn('KTX2 failed, fallback image loaded separately', url);
    });
  } else {
    tex = new THREE.TextureLoader().load(url, finish);
    if (tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
      flagTex(tex, THREE);
      applyWrap(tex, opt);
    }
  }
  if (!opt.noShare && tex) shared.set(key, tex);
  return tex;
}

export function sharedTextures() { return shared; }
