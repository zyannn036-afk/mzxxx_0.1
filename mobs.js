// ============================================================
//  MONSTER HUTAN — model & animasi slime dan goblin (murni bentuk dasar three.js, tanpa file model)
//  Dipakai game.js: build*() membuat model, *Pose() dipanggil tiap frame untuk menganimasikannya.
//  Arah depan monster = +z (sama seperti musuh lain di game.js).
// ============================================================
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, emissive: 0x000000, ...extra });
const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

// ---------- geometri bersama (dibuat sekali) ----------
const G = {
  slime: (() => { // kubah agar dasarnya rata: separuh bawah bola dipipihkan
    const g = new THREE.SphereGeometry(0.72, 20, 14), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.22);
    g.computeVertexNormals(); return g;
  })(),
  ball: new THREE.SphereGeometry(1, 12, 10),
  cyl: (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r0, r1, h, s),
  cone: (r, h, s = 6) => new THREE.ConeGeometry(r, h, s),
};
const EYE_WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff }), EYE_BLACK = new THREE.MeshBasicMaterial({ color: 0x14121a });
const EYE_GOBLIN = new THREE.MeshBasicMaterial({ color: 0xffd23a });
const WOOD = std(0x6b4a2b), TOOTH = std(0xe9e2c8);

// ============================================================
//  SLIME — gumpalan jeli yang melompat
// ============================================================
const SLIME_PAL = [
  { c: 0x56d65f, core: 0x2c9a3a, w: 6 },   // hijau (paling sering)
  { c: 0x4ea8ff, core: 0x2a62c9, w: 3 },   // biru
  { c: 0xff7ab8, core: 0xc03a80, w: 1 },   // merah muda (jarang)
];
export function buildSlime() {
  let roll = rnd(0, 10), pal = SLIME_PAL[0];
  for (const p of SLIME_PAL) { if ((roll -= p.w) <= 0) { pal = p; break; } }
  const size = rnd(0.9, 1.15);
  const g = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  rig.scale.setScalar(size); g.add(rig); rig.add(body);
  const mat = new THREE.MeshStandardMaterial({ color: pal.c, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.84, emissive: 0x000000 });
  const coreMat = new THREE.MeshStandardMaterial({ color: pal.core, roughness: 0.6, emissive: 0x000000 });
  add(body, G.slime, mat, 0, 0.16, 0);                                      // badan jeli
  add(body, G.ball, coreMat, 0.12, 0.36, -0.12).scale.setScalar(0.2);       // inti gelap di dalam jeli
  for (const s of [-1, 1]) {                                                // mata
    add(body, G.ball, EYE_WHITE, s * 0.25, 0.56, 0.52).scale.set(0.13, 0.15, 0.1);
    add(body, G.ball, EYE_BLACK, s * 0.26, 0.56, 0.6).scale.set(0.065, 0.085, 0.05);
  }
  add(body, G.ball, EYE_BLACK, 0, 0.36, 0.67).scale.set(0.11, 0.045, 0.04);  // mulut
  const hl = add(body, G.ball, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), -0.3, 0.78, 0.2); hl.scale.set(0.12, 0.07, 0.08); hl.castShadow = false;
  return { g, body, mat, mats: [mat, coreMat], r: 0.72 * size, h: 0.95 * size + 0.35, col: pal.c, hp: Math.round(30 * size) };
}
// e.ph: fase lompatan 0..1 (0-0.4 di udara, 0.4-0.55 mendarat, lalu diam, 0.88+ berjongkok); e.wind: aba-aba serangan
export function slimePose(e, dt) {
  const b = e.body; let sy = 1, sx = 1, y = 0;
  if (e.wind > 0) { const p = Math.min(1, (1 - e.wind / e.windMax) * 1.6); sy = 1 - 0.4 * p; sx = 1 + 0.24 * p; }   // menekuk sebelum menerjang
  else {
    const ph = e.ph;
    if (ph < 0.4) { const s = Math.sin(Math.PI * ph / 0.4); y = s * e.hopH; sy = 1 + 0.24 * s; sx = 1 - 0.1 * s; }
    else if (ph < 0.55) { const s = 1 - (ph - 0.4) / 0.15; sy = 1 - 0.32 * s; sx = 1 + 0.18 * s; }
    else if (ph > 0.88) { const s = (ph - 0.88) / 0.12; sy = 1 - 0.2 * s; sx = 1 + 0.09 * s; }
    else { const w = Math.sin(e.t * 3.2) * 0.035; sy = 1 + w; sx = 1 - w * 0.5; }
  }
  if (e.sw > 0) { e.sw -= dt; sy *= 1.15; sx *= 0.92; }   // meregang sesaat saat menghantam
  b.scale.set(sx, sy, sx); b.position.y = y;
}

// ============================================================
//  GOBLIN — kecil, bungkuk, membawa gada kayu
// ============================================================
const SKINS = [0x6ea83c, 0x7bb34a, 0x5f9a3a, 0x86a842];
export function buildGoblin() {
  const skin = std(pick(SKINS)), cloth = std(pick([0x5b3d24, 0x6a2f2a, 0x3f4a2a]));
  const g = new THREE.Group(), rig = new THREE.Group(); rig.scale.setScalar(0.85); g.add(rig);
  const P = { rig };
  const leg = x => { const p = new THREE.Group(); p.position.set(x, 0.62, 0); rig.add(p); add(p, G.cyl(0.1, 0.12, 0.6), skin, 0, -0.3, 0); add(p, new THREE.BoxGeometry(0.2, 0.1, 0.32), cloth, 0, -0.58, 0.07); return p; };
  P.legL = leg(-0.16); P.legR = leg(0.16);
  const torso = new THREE.Group(); torso.position.set(0, 0.62, 0); torso.rotation.x = 0.2; rig.add(torso); P.torso = torso;
  add(torso, G.cyl(0.2, 0.27, 0.62, 7), skin, 0, 0.31, 0);                  // badan
  add(torso, G.cyl(0.28, 0.33, 0.3, 8), cloth, 0, 0.08, 0);                 // cawat / rok kain
  add(torso, G.cyl(0.215, 0.215, 0.08, 8), WOOD, 0, 0.26, 0);               // ikat pinggang
  const head = new THREE.Group(); head.position.set(0, 0.84, 0.1); torso.add(head);
  add(head, G.ball, skin).scale.set(0.26, 0.23, 0.25);                       // kepala
  add(head, G.cone(0.06, 0.2), skin, 0, -0.02, 0.27).rotation.x = Math.PI / 2; // hidung
  for (const s of [-1, 1]) {
    const ear = add(head, G.cone(0.08, 0.42, 5), skin, s * 0.3, 0.06, -0.02); ear.rotation.z = -s * 1.35; ear.rotation.x = -0.2; // telinga runcing
    add(head, G.ball, EYE_GOBLIN, s * 0.1, 0.06, 0.2).scale.setScalar(0.05);
    add(head, G.cone(0.025, 0.08, 4), TOOTH, s * 0.06, -0.12, 0.2).rotation.x = Math.PI;                                          // taring
  }
  const arm = x => { const p = new THREE.Group(); p.position.set(x, 0.56, 0); torso.add(p); add(p, G.cyl(0.065, 0.075, 0.55), skin, 0, -0.27, 0); return p; };
  P.armL = arm(-0.33); P.armR = arm(0.33);
  const club = new THREE.Group(); club.position.set(0, -0.55, 0.02); P.armR.add(club);   // gada: ikut arah lengan kanan
  add(club, G.cyl(0.05, 0.085, 0.7, 6), WOOD, 0, -0.28, 0);
  add(club, G.ball, WOOD, 0, -0.66, 0).scale.set(0.16, 0.2, 0.16);
  for (const [x, z] of [[0.13, 0], [-0.13, 0], [0, 0.13]]) add(club, G.cone(0.03, 0.1, 4), TOOTH, x, -0.66, z).rotation.set(z ? 1.57 : 0, 0, x ? -Math.sign(x) * 1.57 : 0); // paku
  return { g, body: rig, parts: P, mat: skin, mats: [skin, cloth], r: 0.55, h: 1.75, col: 0x8fd04a, hp: 45 };
}
// e.wk: fase langkah, e.mv: kecepatan jalan saat ini, e.wind/e.windMax: aba-aba pukulan, e.sw: sisa waktu ayunan
export function goblinPose(e, dt) {
  const p = e.parts, moving = e.mv > 0.1, k = Math.min(1, dt * 14);
  e.wk += dt * (moving ? 3 + e.mv * 2.2 : 0);
  const s = moving ? Math.sin(e.wk) : 0;
  const to = (o, v, kk = k) => { o.rotation.x += (v - o.rotation.x) * kk; };
  to(p.legL, s * 0.8); to(p.legR, -s * 0.8); to(p.armL, -s * 0.7);
  let at, lean = 0.2;
  if (e.wind > 0) { const q = 1 - e.wind / e.windMax; at = -0.4 - 2.3 * q; lean = 0.2 - 0.45 * q; }     // gada diangkat tinggi, badan condong ke belakang
  else if (e.sw > 0) { e.sw -= dt; at = -0.1; lean = 0.55; }                                            // menghantam ke depan
  else at = -0.55 + s * 0.5;
  to(p.armR, at, Math.min(1, dt * (e.sw > 0 ? 35 : 16))); to(p.torso, lean, Math.min(1, dt * 14));
  p.rig.position.y = moving ? Math.abs(Math.sin(e.wk)) * 0.05 : Math.sin(e.t * 2) * 0.012;
}

// ============================================================
//  Bar darah kecil di atas kepala monster (muncul setelah terkena serangan)
// ============================================================
const BAR_BG = new THREE.PlaneGeometry(1, 0.17), BAR_FILL = (() => { const g = new THREE.PlaneGeometry(1, 0.1); g.translate(0.5, 0, 0); return g; })();
const barMat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide });
const BAR_BG_M = barMat(0x000000, 0.55), BAR_FILL_M = barMat(0xe8423a, 0.95);
export function makeBar(h, w = 1.1) {
  const g = new THREE.Group(); g.position.y = h; g.visible = false;
  const bg = new THREE.Mesh(BAR_BG, BAR_BG_M); bg.scale.x = w + 0.1; bg.renderOrder = 998;
  const fill = new THREE.Mesh(BAR_FILL, BAR_FILL_M); fill.position.set(-w / 2, 0, 0.002); fill.scale.x = w; fill.renderOrder = 999;
  g.add(bg, fill);
  return { g, fill, w };
}
