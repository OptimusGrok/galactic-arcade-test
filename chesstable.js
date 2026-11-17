// CHESS TABLE (Dave via Arcade): a big, stylish chess table + two high-back chairs in the GROK SHOP, on the open floor between the
// ACCESSORIES island and the pool tables. Walk up -> ♟ PLAY CHESS. The player sits in the near (west) chair, the shopkeeper Grok
// walks over from the counter and sits opposite, the camera zooms down onto the board and the arcade copy of Chess
// (chess-play/index.html, built from https://optimusgrok.github.io/chess/ by tools_build_chess_play.py: same medieval pieces,
// capture battles and robot hand, vs the computer) opens over it. ✕ / Esc: camera pulls back, the player stands up and Grok walks
// back to his counter. The game copy is only loaded on PLAY (low-memory phones never pay for it). Free to play.
// Setup is called from shop.js with the shop's own Grok clerk; everything is shop-local (the shop group sits at whiteRoom.x).
export const CHESS = { TX: 6.6, TZ: 8.2, TOP: 0.64, HALF: 0.8, SEAT: 0.35, CHAIR: 1.07, SIT: 1.16 };

export function setupChessTable(o) {
  const { THREE, mergeGeometries, flagTex, G, WXp, grok, home, st, camera } = o;
  const getMonkey = o.getMonkey, clearKeys = o.clearKeys || (() => {});
  const { TX, TZ, TOP, HALF, SEAT, CHAIR, SIT } = CHESS;
  const tbl = new THREE.Group(); tbl.name = 'chessTable'; tbl.position.set(TX, 0, TZ); G.add(tbl);
  // ---------- build (shop-local, table centre = origin; player side = -x, Grok side = +x; a-file at -z) ----------
  const tex = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; try { flagTex && flagTex(t, THREE); } catch (e) {} return t; };
  const col = (g, c) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const box = (w, h, d, x, y, z, c) => col(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
  const cyl = (rt, rb, h, x, y, z, c, seg = 24) => col(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), c);
  const NAVY = 0x0e1638, GLOSS = 0x0b0e1a, CHROME = 0xd6dbe2, VELVET = 0x6a1f9a, VELVET2 = 0x4a1470;
  const body = [], chrome = [], neonC = [], neonP = [], cush = [];
  // table: thick glossy black top with a bevelled navy apron, chrome pedestal on a wide navy base, neon trims
  body.push(box(2 * HALF, 0.06, 2 * HALF, 0, TOP - 0.03, 0, GLOSS), box(2 * HALF - 0.08, 0.1, 2 * HALF - 0.08, 0, TOP - 0.11, 0, NAVY));
  chrome.push(cyl(0.09, 0.11, TOP - 0.2, 0, (TOP - 0.16) / 2 + 0.04, 0, CHROME), cyl(0.2, 0.12, 0.05, 0, TOP - 0.185, 0, CHROME));
  body.push(cyl(0.5, 0.56, 0.06, 0, 0.03, 0, NAVY, 32));
  for (const s of [-1, 1]) { neonC.push(new THREE.BoxGeometry(2 * HALF + 0.02, 0.018, 0.018).translate(0, TOP - 0.035, s * (HALF + 0.004)), new THREE.BoxGeometry(0.018, 0.018, 2 * HALF + 0.02).translate(s * (HALF + 0.004), TOP - 0.035, 0)); }
  neonP.push(new THREE.TorusGeometry(0.57, 0.012, 6, 48).rotateX(Math.PI / 2).translate(0, 0.03, 0));
  // board: walnut frame + 8x8 squares in the Chess game's colours (#f0dab5 / #b3845f), rank 1 nearest the player
  const BS = 1.2, SQ = BS / 8, BY = TOP + 0.026;   // board surface just above the frame (frame top = TOP + 0.024)
  body.push(box(BS + 0.1, 0.024, BS + 0.1, 0, TOP + 0.012, 0, 0x4a2c18));
  const bT = tex(512, 512, (g, w) => { const s = w / 8; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f0dab5' : '#b3845f'; g.fillRect(i * s, j * s, s, s); }
    g.strokeStyle = 'rgba(40,20,8,.6)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, w - 3); });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BS, BS).rotateX(-Math.PI / 2).translate(0, BY + 0.0015, 0), new THREE.MeshStandardMaterial({ map: bT, roughness: 0.35, metalness: 0.05 }));
  board.name = 'chessBoard'; tbl.add(board);
  // pieces: turned lathe silhouettes, one merged mesh per side (start position)
  const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const BASE = [[0, 0], [0.42, 0], [0.42, 0.08], [0.36, 0.12], [0.3, 0.16]];
  const PROF = {
    p: BASE.concat([[0.17, 0.3], [0.14, 0.5], [0.24, 0.56], [0.13, 0.6], [0.2, 0.7], [0.22, 0.8], [0.18, 0.9], [0.08, 0.96], [0, 0.97]]),
    r: BASE.concat([[0.24, 0.3], [0.22, 0.75], [0.32, 0.8], [0.32, 1.0], [0.24, 1.0], [0.24, 0.94], [0, 0.94]]),
    b: BASE.concat([[0.17, 0.35], [0.13, 0.75], [0.26, 0.8], [0.13, 0.85], [0.2, 0.98], [0.2, 1.08], [0.12, 1.2], [0.05, 1.27], [0.07, 1.31], [0, 1.34]]),
    q: BASE.concat([[0.19, 0.35], [0.14, 0.95], [0.3, 1.0], [0.16, 1.05], [0.24, 1.25], [0.3, 1.32], [0.18, 1.34], [0.08, 1.42], [0, 1.44]]),
    k: BASE.concat([[0.2, 0.35], [0.15, 1.0], [0.31, 1.05], [0.17, 1.1], [0.24, 1.32], [0.28, 1.4], [0, 1.42]]),
    n: BASE.concat([[0.2, 0.3], [0.2, 0.45], [0, 0.46]]) };
  const UNIT = SQ * 0.85;   // base 0.84 units -> ~70% of a square; king ~0.2 m tall (tournament proportions)
  function piece(type) { const g = [lathe(PROF[type])];
    if (type === 'k') g.push(new THREE.BoxGeometry(0.07, 0.34, 0.07).translate(0, 1.6, 0), new THREE.BoxGeometry(0.24, 0.07, 0.07).translate(0, 1.62, 0));
    if (type === 'n') { g.push(new THREE.BoxGeometry(0.3, 0.62, 0.36).rotateX(0.15).translate(0, 0.75, -0.03), new THREE.BoxGeometry(0.26, 0.26, 0.48).rotateX(0.45).translate(0, 1.02, 0.14), new THREE.BoxGeometry(0.1, 0.14, 0.06).translate(0, 1.22, -0.08)); }
    return mergeGeometries(g.map(x => { x = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal') x.deleteAttribute(k); return x; })); }
  const proto = {}; for (const t of 'prnbqk') proto[t] = piece(t);
  const sqPos = (rank, file) => [(rank - 3.5) * SQ, (file - 3.5) * SQ];   // rank along +x (away from the player), file along +z (a..h)
  const BACK = 'rnbqkbnr', side = { w: [], b: [] };
  for (const c of ['w', 'b']) for (let f = 0; f < 8; f++) for (const [r, t] of c === 'w' ? [[0, BACK[f]], [1, 'p']] : [[7, BACK[f]], [6, 'p']]) {
    const [x, z] = sqPos(r, f), g = proto[t].clone(); g.scale(UNIT, UNIT, UNIT); if (t === 'n') g.rotateY(c === 'w' ? Math.PI / 2 : -Math.PI / 2); g.translate(x, BY + 0.003, z); side[c].push(g); }
  const pW = new THREE.Mesh(mergeGeometries(side.w), new THREE.MeshStandardMaterial({ color: 0xf3e8d0, roughness: 0.3, metalness: 0.05, emissive: 0x2a2620 }));
  const pB = new THREE.Mesh(mergeGeometries(side.b), new THREE.MeshStandardMaterial({ color: 0x23232b, roughness: 0.25, metalness: 0.25, emissive: 0x0a0a12 }));
  pW.name = 'chessPiecesWhite'; pB.name = 'chessPiecesBlack'; tbl.add(pW, pB);
  // two high-back lounge chairs (navy shell, purple velvet, chrome legs, cyan neon down the back); built facing +x, the far one mirrored
  function chair(sx) {   // sx = -1: player chair at -x facing +x; +1: Grok's chair at +x facing -x
    const cx = sx * CHAIR, back = cx + sx * 0.28, P = (x, y, z) => [cx + sx * x, y, z];
    body.push(box(0.56, 0.08, 0.6, ...P(0.02, SEAT - 0.06, 0), NAVY));
    cush.push(box(0.52, 0.06, 0.56, ...P(0.02, SEAT - 0.01, 0), VELVET));
    body.push(box(0.08, 0.95, 0.6, back, SEAT + 0.42, 0, NAVY)); cush.push(box(0.05, 0.78, 0.5, back - sx * 0.055, SEAT + 0.42, 0, VELVET2));
    body.push(col(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 20, 1, false, 0, Math.PI).rotateY(-Math.PI / 2).rotateZ(Math.PI / 2).scale(1, 1, 1).translate(back, SEAT + 0.9, 0), NAVY));
    for (const s of [-1, 1]) { body.push(box(0.5, 0.2, 0.06, ...P(0.0, SEAT + 0.12, s * 0.31), NAVY)); neonC.push(new THREE.BoxGeometry(0.5, 0.016, 0.016).translate(...P(0.0, SEAT + 0.225, s * 0.335)));
      neonC.push(new THREE.BoxGeometry(0.016, 0.9, 0.016).translate(back + sx * 0.045, SEAT + 0.43, s * 0.3)); }
    neonP.push(new THREE.TorusGeometry(0.3, 0.012, 6, 20, Math.PI).rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2).translate(back + sx * 0.045, SEAT + 0.9, 0));
    for (const [a, b] of [[-0.22, -0.24], [-0.22, 0.24], [0.24, -0.24], [0.24, 0.24]]) chrome.push(cyl(0.022, 0.016, SEAT - 0.1, ...P(a, (SEAT - 0.1) / 2, b), CHROME, 10));
  }
  chair(-1); chair(1);
  const vc = (L, m, name) => { const x = new THREE.Mesh(mergeGeometries(L), m); x.name = name; tbl.add(x); return x; };
  vc(body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.3, emissive: 0x05060c }), 'chessBody');
  vc(cush, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissive: 0x14041c }), 'chessCushions');
  vc(chrome, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.9 }), 'chessChrome');
  const nm = (L) => mergeGeometries(L.map(g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }));
  tbl.add(Object.assign(new THREE.Mesh(nm(neonC), new THREE.MeshBasicMaterial({ color: 0x5ff4ff, toneMapped: false })), { name: 'chessNeon' }));
  tbl.add(Object.assign(new THREE.Mesh(nm(neonP), new THREE.MeshBasicMaterial({ color: 0xc04dff, toneMapped: false })), { name: 'chessNeonPurple' }));
  // pendant lamp + neon CHESS sign hanging above (same family as the ACCESSORIES sign / pool lamps)
  { const lamp = new THREE.Mesh(nm([new THREE.CylinderGeometry(0.42, 0.5, 0.1, 28).translate(0, 2.35, 0), new THREE.CylinderGeometry(0.01, 0.01, 0.75, 6).translate(0, 2.77, 0)]), new THREE.MeshStandardMaterial({ color: 0x0e1638, roughness: 0.3, metalness: 0.4, emissive: 0x060a20 }));
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 28).rotateX(Math.PI / 2).translate(0, 2.298, 0), new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.014, 6, 40).rotateX(Math.PI / 2).translate(0, 2.3, 0), new THREE.MeshBasicMaterial({ color: 0x5ff4ff, toneMapped: false }));
    lamp.name = 'chessLamp'; glow.name = 'chessLampGlow'; ring.name = 'chessLampRing'; tbl.add(lamp, glow, ring);
    const sT = tex(512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '900 64px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const gr = g.createLinearGradient(80, 0, w - 80, 0); ['#00e5ff', '#7a5cff', '#ff4fd8'].forEach((c, i) => gr.addColorStop(i / 2, c));
      const t = '\u265E CHESS \u265A'; g.shadowColor = '#ff4fd8'; g.shadowBlur = 24; g.lineWidth = 11; g.strokeStyle = gr; g.strokeText(t, w / 2, h / 2); g.shadowColor = '#00e5ff'; g.shadowBlur = 10; g.lineWidth = 4; g.strokeText(t, w / 2, h / 2); g.shadowBlur = 0; g.lineWidth = 1.6; g.strokeStyle = '#fff'; g.strokeText(t, w / 2, h / 2); });
    const sm = new THREE.MeshBasicMaterial({ map: sT, transparent: true, depthWrite: false, toneMapped: false });
    for (const ry of [-Math.PI / 2, Math.PI / 2]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), sm); s.rotation.y = ry; s.position.set(ry < 0 ? -0.02 : 0.02, 3.0, 0); s.name = 'chessSign'; tbl.add(s); } }
  const OBST = [{ x0: TX - CHAIR - 0.36, x1: TX + CHAIR + 0.36, z0: TZ - 0.36, z1: TZ + 0.36 }, { x0: TX - HALF, x1: TX + HALF, z0: TZ - HALF, z1: TZ + HALF }];

  // ---------- UI ----------
  const css = document.createElement('style'); css.textContent =
    '#chessBtn{position:fixed;left:50%;bottom:calc(max(22px,env(safe-area-inset-bottom)) + 6px);transform:translateX(-50%);z-index:24;display:none;min-width:150px;height:58px;padding:0 26px;border-radius:29px;border:3px solid #c04dff;background:#1a0626e8;color:#f6e8ff;font:900 20px/1 "Courier New",monospace;letter-spacing:.12em;box-shadow:0 0 16px #c04dffaa,inset 0 0 12px #c04dff55;text-shadow:0 0 8px #c04dff;cursor:pointer;touch-action:none;white-space:nowrap}#chessBtn.on{display:block}#chessBtn:active{transform:translateX(-50%) scale(.95)}' +
    '#chessOv{position:fixed;inset:0;z-index:60;display:none;background:#0f1218}#chessOv.on{display:block;animation:chIn .35s ease-out}@keyframes chIn{from{opacity:0}to{opacity:1}}#chessOv iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
    '#chessX{position:fixed;top:max(4px,env(safe-area-inset-top));left:max(4px,env(safe-area-inset-left));z-index:61;width:38px;height:38px;border-radius:50%;border:1px solid #fff5;background:#000a;color:#fff;font:700 18px system-ui;cursor:pointer;touch-action:manipulation;padding:0;display:none;line-height:1}#chessX.on{display:block}';
  document.head.appendChild(css);
  const btn = document.createElement('button'); btn.id = 'chessBtn'; btn.textContent = '\u265F PLAY CHESS'; document.body.appendChild(btn);
  const ov = document.createElement('div'); ov.id = 'chessOv'; document.body.appendChild(ov);
  const bx = document.createElement('button'); bx.id = 'chessX'; bx.setAttribute('aria-label', 'Close'); bx.textContent = '\u2715'; document.body.appendChild(bx);
  const SRC = new URL('./chess-play/index.html', import.meta.url).href;
  const stop = e => e.stopPropagation();
  for (const el of [btn, ov, bx]) { el.addEventListener('pointerdown', stop); el.addEventListener('touchstart', stop, { passive: true }); }
  btn.addEventListener('pointerup', e => { e.stopPropagation(); play(); }); btn.addEventListener('click', e => { e.stopPropagation(); play(); });
  bx.addEventListener('pointerup', e => { e.stopPropagation(); }); bx.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); leave('x'); });   // on click, like pool's ✕

  // ---------- state ----------
  // idle -> sit (player walks to the chair, sits) -> wait (Grok walks over) -> gsit (Grok sits) -> zoom -> game -> unzoom -> (player stands, free) ; Grok: back -> home
  const api = { state: 'idle', gstate: 'home', near: false, open: false, opens: 0, closes: 0, frame: null, src: SRC, hold: null,   /* hold: tests / screenshots park the sequence at 'both' or 'zoom' */ TX, TZ, obst: OBST, group: tbl, btn, fast: false, t: 0, gt: 0 };
  const V = (x, y, z) => new THREE.Vector3(x, y, z), W = (x, y, z) => V(WXp + TX + x, y, TZ + z);
  // t876u: both sit into their chair FROM THE SIDE: step up beside the chair (clear of its arm, SIDE m along z), face the board,
  // then slide sideways into the seat while bending at the hips and knees; standing up is the exact reverse.
  const SIDE = 0.64; let pSide = -1;   // the player uses whichever side of the chair they came from
  const P_SEAT = () => W(-SIT, 0, 0), P_STAND = () => W(-SIT, 0, pSide * SIDE);
  const G_SEAT = V(TX + SIT, 0, TZ), G_STAND = V(TX + SIT, 0, TZ - SIDE);   // Grok comes in on the north side (his route's side)
  // Grok's walk from behind the counter (out through its open east side) to the far chair. Shop-local points.
  const route = () => [V(home.x + 2.4, 0, home.z + 0.35), V(TX + SIT + 1.0, 0, TZ - 2.4), G_STAND.clone()];
  const camOver = () => ({ pos: W(-1.75, 1.85, 2.15), at: W(0.15, 0.7, -0.15) });
  const camBoard = () => ({ pos: W(-0.78, TOP + 1.02, 0), at: W(0.08, TOP, 0) });
  const sm = k => k * k * (3 - 2 * k), lerpA = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  let pFrom = null, pFace0 = 0, cam0 = { pos: V(0, 0, 0), at: V(0, 0, 0) }, camT = null, legs = [], walkI = 0, walkFrom = V(0, 0, 0), walkLen = 0, walkD = 0, gYaw0 = 0, gPos0 = V(0, 0, 0);
  const atNow = () => { const d = new THREE.Vector3(); camera.getWorldDirection(d); return camera.position.clone().addScaledVector(d, 3); };
  function camTo(to, dur) { cam0 = { pos: camera.position.clone(), at: camT ? camT.cur.clone() : atNow() }; camT = { to, dur, t: 0, cur: cam0.at.clone() }; }
  function camStep(dt) { if (!camT) return; camT.t = Math.min(1, camT.t + dt / camT.dur); const k = sm(camT.t);
    camera.position.lerpVectors(cam0.pos, camT.to.pos, k); camT.cur.lerpVectors(cam0.at, camT.to.at, k); camera.lookAt(camT.cur); }
  const locked = () => api.state !== 'idle';
  api.upright = 0; const upright = on => { api.upright = on ? 1 : 0; api.orients = (api.orients || 0) + 1; try { window.__orient && window.__orient(!!on); } catch (e) {} };
  function play() {
    if (api.state !== 'idle' || api.gstate !== 'home' || !api.near) return false;
    const m = getMonkey(); if (!m) return false;
    api.opens++; api.state = 'sit'; api.t = 0; btn.classList.remove('on'); bx.classList.add('on'); clearKeys();
    pFrom = m.position.clone(); pFace0 = st.face; pSide = (pFrom.z - TZ) > 0 ? 1 : -1; st.seated = 'chess'; st.vel.set(0, 0, 0);
    try { if (st.fly) { st.fly.air = false; st.fly.thrust = false; st.fly.hold = false; st.fly.vy = 0; } st.jump = null; } catch (e) {}
    camTo(camOver(), api.fast ? 0.2 : 1.1);
    // t876u: the phone stays SIDEWAYS while everyone sits down and the camera zooms in; it turns upright the moment the game appears
    // (showFrame). Android only locks orientation in fullscreen and only enters fullscreen from a user gesture, so (re)enter fullscreen
    // here inside the PLAY tap; the later portrait lock then needs no gesture. iOS (no lock): the upright fallback also switches at game start.
    try { window.__fsNow && window.__fsNow(); } catch (e) {}
    api.gstate = 'out'; walkI = -1; gPos0.copy(grok.root.position); gYaw0 = grok.root.rotation.y; nextLeg(); return true; }
  function leave(why) {
    if (api.state === 'idle' || api.state === 'unzoom') return false;
    api.lastExit = why || 'x'; closeFrame(); if (api.upright) upright(false);   // back to the side view inside the ✕ / Esc gesture (never turned upright before the game: nothing to undo)
    api.state = 'unzoom'; api.t = 0; bx.classList.remove('on'); camTo(camOver(), api.fast ? 0.2 : 1.0); return true; }
  function openFrame() { if (api.frame) return; const f = api.frame = document.createElement('iframe'); f.src = SRC; f.title = 'Chess'; f.allow = 'autoplay'; ov.appendChild(f);
    f.addEventListener('load', () => { if (api.frame !== f) return; try { f.contentWindow.addEventListener('keydown', e => { if (e.code === 'Escape') { e.preventDefault(); leave('esc'); } }, true); } catch (e) {} }, { once: true }); }
  function showFrame() { api.open = true; ov.classList.add('on'); if (!api.upright) upright(true);   // t876u: rotate upright just as the game starts try { api.frame && api.frame.contentWindow.focus(); } catch (e) {}
    const cv = window.__arcade && window.__arcade.renderer && window.__arcade.renderer.domElement; if (cv) cv.style.visibility = 'hidden'; try { window.__updateTurn && window.__updateTurn(); } catch (e) {} }
  function closeFrame() { const was = api.open || !!api.frame; api.open = false; ov.classList.remove('on'); const f = api.frame; api.frame = null;
    if (f) { try { if (f.contentWindow && f.contentWindow.__gaRelease) f.contentWindow.__gaRelease(); } catch (e) {} try { f.src = 'about:blank'; } catch (e) {} f.remove(); }   // t882u: release WebGL/audio before unload
    const cv = window.__arcade && window.__arcade.renderer && window.__arcade.renderer.domElement; if (cv) cv.style.visibility = '';
    if (was) api.closes++; clearKeys(); try { window.focus(); } catch (e) {} try { window.__updateTurn && window.__updateTurn(); } catch (e) {} }
  addEventListener('keydown', e => {
    if (api.state !== 'idle') { if (e.code === 'Escape') { leave('esc'); e.preventDefault(); } if (api.state !== 'unzoom') e.stopImmediatePropagation(); return; }
    if (api.near && (e.code === 'KeyE' || e.code === 'Enter') && btn.classList.contains('on')) { play(); e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  // ---------- poses ----------
  const ga = grok.arms, gl = grok.legs || [], gh = grok.head;
  function grokRest() { for (const L of gl) { L.hip.rotation.x = 0; L.thigh.rotation.x = 0; if (L.shin) L.shin.rotation.x = 0; }
    for (const a of ga) { a.sh.rotation.set(-0.1, 0, a.sd * 0.14); a.el.rotation.set(-1.0, 0, 0); } grok.root.rotation.x = 0; grok.root.rotation.z = 0; grok.root.position.y = 0; }
  function grokSit(k, t) {   // k 0..1 into the seat
    const r = grok.root; r.position.y = 0; r.rotation.x = 0; r.rotation.z = 0;
    for (const L of gl) { L.hip.rotation.x = -1.45 * k; L.thigh.rotation.x = 0; if (L.shin) L.shin.rotation.x = 1.45 * k; }
    for (const a of ga) { a.sh.rotation.x = -0.1 - 0.75 * k; a.sh.rotation.z = a.sd * (0.14 + 0.1 * k); a.el.rotation.x = -1.0 + 0.35 * k + Math.sin(t * 1.3 + a.sd) * 0.04 * k; }
    gh.rotation.x = 0.3 * k + Math.sin(t * 0.9) * 0.03; gh.rotation.y = Math.sin(t * 0.37) * 0.25 * k; }
  function grokLean(a) { grok.root.rotation.x = a; }   // lean the body forward while lowering / rising (weight over the knees)
  function grokWalk(gait, stride) { const r = grok.root;
    r.position.y = Math.abs(Math.sin(gait)) * 0.028 * stride; r.rotation.z = Math.sin(gait) * 0.03 * stride; r.rotation.x = -Math.abs(Math.sin(gait)) * 0.02 * stride;
    for (const L of gl) { const ph = gait + (L.sd > 0 ? 0 : Math.PI); L.hip.rotation.x = Math.sin(ph) * 0.55 * stride; L.thigh.rotation.x = Math.max(0, -Math.sin(ph)) * 0.35 * stride; if (L.shin) L.shin.rotation.x = 0; }
    ga[0].sh.rotation.x = Math.sin(gait + Math.PI) * 0.55 * stride; ga[1].sh.rotation.x = Math.sin(gait) * 0.55 * stride; ga[0].sh.rotation.z = -0.12; ga[1].sh.rotation.z = 0.12;
    ga[0].el.rotation.x = -0.55 - Math.max(0, Math.sin(gait + Math.PI)) * 0.35; ga[1].el.rotation.x = -0.55 - Math.max(0, Math.sin(gait)) * 0.35; gh.rotation.x = 0; gh.rotation.y *= 0.9; }
  function playerSit(m, k) {   // k 0..1 from standing to seated; called after main.js's own walk animation each frame
    const u = m.userData; if (!u || !u.hips) return;
    u.hips.position.y = 0.8 - 0.3 * k; u.torso.rotation.set(0.05 + 0.1 * k, 0, 0); if (u.neck) u.neck.rotation.x = 0.12 * k; if (u.head) u.head.rotation.y = 0;
    u.legs.forEach(l => { l.leg.rotation.set(-1.5 * k, 0, 0); l.knee.rotation.x = 1.45 * k; });
    u.arms.forEach(a => { a.sh.rotation.x = -0.95 * k; a.sh.rotation.z = 0.22 * a.sd * k; a.el.rotation.x = -0.6 * k; });
    try { const I = window.__neonPlayer && window.__neonPlayer.idle; if (I) { I.t = 0; I.wP = 0; I.wF = 0; } if (u.phone) u.phone.visible = false; } catch (e) {} }
  function walkLegs(m, ph) { const u = m.userData; if (!u || !u.legs) return; const w = Math.sin(ph) * 0.5; u.hips.position.y = 0.8;
    u.legs.forEach((l, i) => { l.leg.rotation.set(i ? -w : w, 0, 0); l.knee.rotation.x = Math.abs(w) * 0.6; }); u.arms.forEach((a, i) => { a.sh.rotation.x = i ? w * 0.7 : -w * 0.7; a.el.rotation.x = -0.3; }); }
  function nextLeg() { const pts = api.gstate === 'out' ? route() : route().reverse().slice(1).concat([V(home.x, 0, home.z)]);
    walkI++; if (walkI >= pts.length) return false; walkFrom.copy(grok.root.position); walkFrom.y = 0; api._to = pts[walkI]; walkLen = walkFrom.distanceTo(api._to); walkD = 0; return true; }

  // ---------- per frame (shop.update, after main.js's step: overrides the player's pose + the camera while seated) ----------
  api.update = (dt, m, opts = {}) => {
    api.t += dt; api.gt += dt; const t = api.gt, fast = api.fast;
    // Grok
    const r = grok.root, SPD = fast ? 8 : 1.6;
    if (api.gstate === 'out' || api.gstate === 'back') {
      walkD = Math.min(walkLen, walkD + SPD * dt); const k = walkLen > 0 ? walkD / walkLen : 1, to = api._to;
      r.position.set(walkFrom.x + (to.x - walkFrom.x) * k, 0, walkFrom.z + (to.z - walkFrom.z) * k);
      const want = Math.atan2(to.x - walkFrom.x, to.z - walkFrom.z); r.rotation.y = lerpA(r.rotation.y, want, Math.min(1, dt * 7));
      grokWalk(api.gt * 5.4, 1);
      if (k >= 1 && !nextLeg()) { grokRest(); if (api.gstate === 'out') { api.gstate = 'sitting'; api.gsit = 0; gPos0.copy(r.position); gYaw0 = r.rotation.y; }
        else { api.gstate = 'turn'; api.gsit = 0; gYaw0 = r.rotation.y; } } }
    else if (api.gstate === 'sitting' || api.gstate === 'seated') {
      if (api.gstate === 'sitting') api.gsit = Math.min(api.hold === 'gsit' ? 0.6 : 1, api.gsit + dt / (fast ? 0.2 : 1.6));   /* hold 'gsit': tests park him mid-sit */
      const p = api.gstate === 'seated' ? 1 : api.gsit, kT = sm(Math.min(1, p / 0.3)), q = Math.max(0, (p - 0.25) / 0.75);   // turn to face the board beside the chair, then
      r.position.lerpVectors(gPos0, G_SEAT, sm(Math.min(1, q * 1.1))); r.rotation.y = lerpA(gYaw0, -Math.PI / 2, kT);           // side-step into the seat while lowering
      grokSit(sm(Math.max(0, Math.min(1, (q - 0.08) / 0.92))), t); grokLean(Math.sin(Math.PI * Math.min(1, q)) * 0.22);
      api.gside = Math.abs(r.position.z - TZ);
      if (api.gstate === 'sitting' && api.gsit >= 1) { api.gstate = 'seated'; grokLean(0); }
      if (api.gstate === 'seated' && (api.state === 'idle' || (api.state === 'unzoom' && api.standG))) { api.gstate = 'standing'; api.gsit = 1; } }   // player left (or never waited): Grok gets up too
    else if (api.gstate === 'standing') {
      api.gsit = Math.max(0, api.gsit - dt / (fast ? 0.2 : 1.2)); const q = api.gsit;   // reverse: rise and side-step out beside the chair
      r.position.lerpVectors(G_STAND, G_SEAT, sm(Math.min(1, q * 1.15))); r.rotation.y = -Math.PI / 2;
      grokSit(sm(Math.max(0, Math.min(1, (q - 0.08) / 0.92))), t); grokLean(Math.sin(Math.PI * q) * 0.22); api.gside = Math.abs(r.position.z - TZ);
      if (api.gsit <= 0) { grokRest(); api.gstate = 'back'; walkI = -1; nextLeg(); } }
    else if (api.gstate === 'turn') { api.gsit = Math.min(1, api.gsit + dt / 0.5); r.rotation.y = lerpA(gYaw0, home.yaw, sm(api.gsit)); r.position.set(home.x, 0, home.z);
      if (api.gsit >= 1) { grokRest(); gh.rotation.set(0, 0, 0); api.gstate = 'home'; api.homes = (api.homes || 0) + 1; } }
    // player
    if (!m) return;
    if (api.state === 'idle') { const lx = m.position.x - WXp, lz = m.position.z;
      const dx = Math.max(0, Math.abs(lx - TX) - CHAIR - 0.36), dz = Math.max(0, Math.abs(lz - TZ) - 0.75); api.dist = Math.hypot(dx, dz);
      api.near = !opts.busy && api.gstate === 'home' && api.dist < 1.25 && !(st.fly && st.fly.air) && !st.jump && !st.seated;
      btn.classList.toggle('on', api.near); return; }
    st.vel.set(0, 0, 0); st.speed = 0; st.play = 0; m.visible = true;
    const seat = P_SEAT(), stand = P_STAND(), FACE = Math.PI / 2;
    if (api.state === 'sit') { const D1 = fast ? 0.15 : Math.max(0.5, Math.min(1.4, pFrom.distanceTo(stand) / 2.2)), D2 = fast ? 0.2 : 1.1;
      if (api.t < D1) { const k = sm(api.t / D1); m.position.lerpVectors(pFrom, stand, k); m.position.y = 0; st.face = lerpA(pFace0, Math.atan2(stand.x - pFrom.x, stand.z - pFrom.z) || FACE, Math.min(1, k * 3)); if (k > 0.7) st.face = lerpA(st.face, FACE, (k - 0.7) / 0.3); walkLegs(m, api.t * 9); }
      else { const q = Math.min(1, (api.t - D1) / D2); m.position.lerpVectors(stand, seat, sm(Math.min(1, q * 1.1))); m.position.y = 0; st.face = FACE; playerSit(m, sm(Math.max(0, (q - 0.08) / 0.92))); if (q >= 1) { api.state = 'wait'; api.t = 0; } } }
    else if (api.state === 'wait') { m.position.copy(seat); st.face = FACE; playerSit(m, 1);
      if (api.gstate === 'seated') { api.state = 'both'; api.t = 0; } }
    else if (api.state === 'both') { m.position.copy(seat); st.face = FACE; playerSit(m, 1); if (api.t > (fast ? 0.1 : 0.9) && api.hold !== 'both') { api.state = 'zoom'; api.t = 0; openFrame(); camTo(camBoard(), fast ? 0.2 : 1.5); } }
    else if (api.state === 'zoom') { m.position.copy(seat); st.face = FACE; playerSit(m, 1); if (camT && camT.t >= 1 && api.hold !== 'zoom') { api.state = 'game'; api.t = 0; showFrame(); } }
    else if (api.state === 'game') { m.position.copy(seat); st.face = FACE; playerSit(m, 1); }
    else if (api.state === 'unzoom') { const D = fast ? 0.2 : 1.0, S = fast ? 0.2 : 1.0;
      if (api.t < D) { m.position.copy(seat); playerSit(m, 1); }
      else { const q = Math.min(1, (api.t - D) / S), r1 = 1 - q;   // reverse of the sit: rise, side-step out beside the chair
        m.position.lerpVectors(stand, seat, sm(Math.min(1, r1 * 1.1))); playerSit(m, sm(Math.max(0, (r1 - 0.08) / 0.92))); api.standG = true;
        if (q >= 1) { api.state = 'idle'; st.seated = null; camT = null; api.standG = false; if (api.gstate === 'seated') { api.gstate = 'standing'; api.gsit = 1; }
          const u = m.userData; if (u && u.hips) u.hips.position.y = 0.8; st.yaw = -Math.PI / 2; st.pitch = 0.3; st.lookT = st.t; clearKeys(); return; } }
      st.face = FACE; }
    m.rotation.y = st.face;
    if (api.state !== 'sit' || api.t > 0) camStep(dt);
  };
  api.play = play; api.leave = leave; api.locked = locked;
  Object.defineProperty(api, 'borrowed', { get: () => api.gstate !== 'home' });
  return api;
}
