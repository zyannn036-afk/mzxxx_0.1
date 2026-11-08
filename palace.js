import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALACE } from './city-layout.js';
import { HW, HL, F2, H1, ROOF, T, DOOR_H, DH, MAIN_DOOR, STAIR, DAIS, THRONE, SIDE_ROOMS, WALLS, solids, nearDoor, WALL_RECTS, groundY, levelOf, ceilAt, areaAt, pushCircle, pushRect, rayRect } from './palace-layout.js';

// ============================================================
//  Interior Istana Arunika (2 lantai). Dibangun sekali di titik jauh (PALACE.x, PALACE.z), disembunyikan sampai pemain masuk (show(true)).
//  Seluruh bentuk digabung jadi sedikit mesh (warna lewat vertex color) + 3 mesh lantai bertekstur. Tanpa lampu tambahan:
//  nyala api, kaca patri & lampu gantung memakai bahan bercahaya sendiri (tak ada kompilasi ulang shader saat pemain masuk).
//  Tabrakan TIDAK memakai daftar dunia: palace.collide() memakai kotak dinding + properti per lantai (data dinding: palace-layout.js).
//  Tata ruang & nama ruangan: lihat gambar denah di palace-layout.js.
// ============================================================
const WOOD = 0x6b4a2d, WOOD_D = 0x4a3220, WOOD_L = 0x8a6a48, STONE = 0xcfc9bb, STONE_D = 0x8d8a85, GOLD = 0xd9a93a, IRON = 0x2a2220, STEEL = 0x9aa3ad,
  RED = 0x9b2a24, CREAM = 0xe3d9c3, BRICK = 0x8a4a3a, BLUE = 0x2f4f8a, GREEN = 0x3f6a46, PURPLE = 0x6a3a7a, WALLC = 0xe4dac3, WALL_OUT = 0xcfc6ae, TRIM = 0xb8a98a;
const HP = Math.PI / 2;

// Generator: tiap `yield` = titik berhenti, supaya ChunkManager (chunks.js) bisa membangun istana bertahap tanpa menahan frame.
// Nilai kembalian generator = objek API istana (group, show, collide, ...).
export function* buildPalaceGen() {
  const group = new THREE.Group(); group.name = 'istana-dalam'; group.position.set(PALACE.x, 0, PALACE.z); group.visible = false;
  const solid = [], glow = [], flo = { stone: [], wood: [], marble: [] };
  const rects = [], circles = [], npcCircles = [];     // tabrakan properti (lokal) & NPC (koordinat dunia)
  const tmp = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  let B = null;                                         // matriks dasar benda yang sedang dibangun (null = langsung koordinat lokal istana)

  function put(list, geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv');
    m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(eu.set(rx, ry, rz)), one); g.applyMatrix4(m4);
    if (B) g.applyMatrix4(B);
    const n = g.attributes.position.count, col = new Float32Array(n * 3); tmp.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); list.push(g);
  }
  const box = (w, h, d, x, y, z, c, rx, ry, rz) => put(solid, new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
  const boxB = (w, h, d, x, yb, z, c) => box(w, h, d, x, yb + h / 2, z, c);
  const cylB = (r0, r1, h, x, yb, z, c, seg = 10) => put(solid, new THREE.CylinderGeometry(r0, r1, h, seg), c, x, yb + h / 2, z);
  const coneB = (r, h, x, yb, z, c, seg = 8) => put(solid, new THREE.ConeGeometry(r, h, seg), c, x, yb + h / 2, z);
  const ball = (r, x, y, z, c, ws = 8, hs = 6) => put(solid, new THREE.SphereGeometry(r, ws, hs), c, x, y, z);
  const flame = (x, y, z, r = 0.09) => put(glow, new THREE.SphereGeometry(r, 6, 5), 0xffb347, x, y, z);
  const glowBox = (w, h, d, x, y, z, c) => put(glow, new THREE.BoxGeometry(w, h, d), c, x, y, z);
  // benda dengan matriks sendiri: (x, y, z) = titik dasar, ry = putaran, s = skala
  function at(x, y, z, ry, fn, s = 1) {
    const prev = B, mm = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
    B = prev ? prev.clone().multiply(mm) : mm; fn(); B = prev;
  }
  // tabrakan properti
  const circC = (x, z, r, lvl = 0) => circles.push({ x, z, r, fl: lvl });
  const rectC = (x, z, w, d, ry, lvl = 0) => { const sw = Math.abs(Math.sin(ry)) > 0.5, hx = (sw ? d : w) / 2, hz = (sw ? w : d) / 2; rects.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, lvl }); };
  let seed = 20261101; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lv = y => (y > 1 ? 2 : 1);

  // ============================================================
  //  DINDING, PINTU, JENDELA
  // ============================================================
  function seg(w, s0, s1, y0, y1, c) {
    if (y1 - y0 < 0.02 || s1 - s0 < 0.02) return;
    if (w.axis === 'H') boxB(s1 - s0, y1 - y0, T, (s0 + s1) / 2, y0, w.at, c); else boxB(T, y1 - y0, s1 - s0, w.at, y0, (s0 + s1) / 2, c);
  }
  function wainscot(w, s0, s1, y0) {
    const len = s1 - s0; if (len < 0.8) return;
    for (const sd of [-1, 1]) {
      const o = sd * (T / 2 + 0.05);
      if (w.axis === 'H') { boxB(len, 1.1, 0.1, (s0 + s1) / 2, y0, w.at + o, WOOD_D); boxB(len, 0.08, 0.17, (s0 + s1) / 2, y0 + 1.1, w.at + o, WOOD); }
      else { boxB(0.1, 1.1, len, w.at + o, y0, (s0 + s1) / 2, WOOD_D); boxB(0.17, 0.08, len, w.at + o, y0 + 1.1, (s0 + s1) / 2, WOOD); }
    }
  }
  function doorFrame(w, c, dw, dh, y0) {
    // bingkai menjorok IN = 3 cm ke dalam bukaan (sisi dalam tiang & bawah lintel): kalau sebidang dengan sisi dinding (jamb) kedua permukaan beradu kedalaman (z-fighting) dan berkedip.
    const FR = w.k === 'out' ? GOLD : WOOD_D, IN = 0.03, pw = 0.24 + IN, po = dw / 2 + 0.12 - IN / 2, lh = 0.28 + IN;
    if (w.axis === 'H') { for (const sd of [-1, 1]) boxB(pw, dh, T + 0.14, c + sd * po, y0, w.at, FR); boxB(dw + 0.48, lh, T + 0.14, c, y0 + dh - IN, w.at, FR); }
    else { for (const sd of [-1, 1]) boxB(T + 0.14, dh, pw, w.at, y0, c + sd * po, FR); boxB(T + 0.14, lh, dw + 0.48, w.at, y0 + dh - IN, c, FR); }
  }
  for (const w of WALLS) {
    const col = w.k === 'out' ? WALL_OUT : WALLC;
    for (const lvl of [1, 2]) {
      const y0 = lvl === 1 ? 0 : F2, y1 = lvl === 1 ? H1 : ROOF;
      for (const [s0, s1] of solids(w, lvl)) {
        seg(w, s0, s1, y0, y1, col);
        // ujung dinding diperpanjang T/2 supaya sudut menutup; panel kayu cukup sampai permukaan dinding yang memotong (bukan sampai ujungnya, yang sebidang dengan permukaan itu)
        wainscot(w, Math.abs(s0 - (w.a - T / 2)) < 1e-6 ? s0 + T : s0, Math.abs(s1 - (w.b + T / 2)) < 1e-6 ? s1 - T : s1, y0);
      }
      for (const [c, dw, dh = DOOR_H] of (lvl === 1 ? w.d1 : w.d2) || []) { seg(w, c - dw / 2, c + dw / 2, y0 + dh, y1, col); doorFrame(w, c, dw, dh, y0); }
    }
    for (const [t0, t1] of w.tg ? [[w.a - T / 2, w.tg[0]], [w.tg[1], w.b + T / 2]] : [[w.a - T / 2, w.b + T / 2]]) seg(w, t0, t1, H1, F2, TRIM);   // tepi pelat lantai (kosong di lubang tangga)
  }
  // pintu utama: daun ganda kayu tertutup di dalam bukaan, supaya dunia luar tidak terlihat dari aula masuk (tabrakannya: palace-layout.js)
  {
    const dw = MAIN_DOOR.w, dh = MAIN_DOOR.h, zc = HL - T / 2 + 0.06, lw = dw / 2 + 0.1;        // daun: tebal 0.2, muka depan di z = HL - T/2 - 0.04 (4 cm di depan permukaan dinding)
    const zf = zc - 0.1;
    for (const sd of [-1, 1]) {
      const x = sd * lw / 2;                                                                       // daun masuk 10 cm ke dalam tiang bingkai supaya tak ada celah
      boxB(lw, dh + 0.02, 0.2, MAIN_DOOR.x + x, 0, zc, WOOD);
      for (const yb of [0.25, 2.4]) boxB(1.6, 1.95, 0.04, MAIN_DOOR.x + sd * 1.03, yb, zf - 0.02, WOOD_L);            // panel timbul
      for (const yb of [0.9, 2.3, 3.7]) {                                                          // pita besi + paku emas
        boxB(2.0, 0.14, 0.05, MAIN_DOOR.x + sd * 1.03, yb - 0.07, zf - 0.025, IRON);
        for (const u of [0.35, 0.85, 1.35, 1.85]) ball(0.06, MAIN_DOOR.x + sd * u, yb, zf - 0.06, GOLD, 6, 4);
      }
      put(solid, new THREE.TorusGeometry(0.2, 0.035, 6, 14), GOLD, MAIN_DOOR.x + sd * 0.55, 2.1, zf - 0.09);      // gelang pegangan
      ball(0.09, MAIN_DOOR.x + sd * 0.55, 2.1, zf - 0.06, GOLD, 6, 5);
    }
    boxB(0.08, dh, 0.06, MAIN_DOOR.x, 0, zf - 0.03, IRON);                                          // sambungan kedua daun
  }
  // jendela (kaca patri bercahaya) di dinding luar: normal = arah ke dalam
  function windowGlass(x, y, z, ry, ww, wh, col) {
    at(x, y, z, ry, () => {
      box(ww + 0.3, wh + 0.3, 0.1, 0, 0, 0.05, WOOD_D);
      put(glow, new THREE.PlaneGeometry(ww, wh), col, 0, 0, 0.12);
      box(0.08, wh, 0.05, 0, 0, 0.13, WOOD_D); box(ww, 0.08, 0.05, 0, 0, 0.13, WOOD_D);
    });
  }
  const GL = [0x3a6fd8, 0xd84a3a, 0xe0b33a, 0x4aa05a, 0x8a4ad8];
  for (const lvl of [1, 2]) {
    const yc = (lvl === 1 ? 0 : F2) + 2.9;
    for (const s of [-1, 1]) for (const r of SIDE_ROOMS) {
      const zc = (r[0] + r[1]) / 2, n = r[1] - r[0] > 11 ? 2 : 1;
      for (let k = 0; k < n; k++) windowGlass(s * (HW - T / 2 - 0.02), yc, zc + (n === 1 ? 0 : (k ? 3.4 : -3.4)), s > 0 ? -HP : HP, 1.5, 2.6, GL[(k + (lvl + (s > 0 ? 1 : 0) + Math.round(zc / 4)) + 10) % 5]);
    }
    for (const s of [-1, 1]) windowGlass(s * 10, yc, -HL + T / 2 + 0.02, 0, 1.7, 2.8, GL[(lvl + (s > 0 ? 0 : 2)) % 5]);          // ujung utara lorong
  }
  for (const s of [-1, 1]) for (const lvl of [1, 2]) windowGlass(s * 6.2, (lvl === 1 ? 0 : F2) + 2.9, HL - T / 2 - 0.02, Math.PI, 1.5, 2.6, GL[(s > 0 ? 1 : 3)]);   // di samping pintu utama
  for (const lvl of [1, 2]) for (const z of [-17, -9.5, -2]) for (const s of [-1, 1]) if (lvl === 2 && false) windowGlass(s * 7.9, F2 + 3, z, s > 0 ? -HP : HP, 1.2, 2.4, GL[2]);
  // aula masuk (tinggi dua lantai): jendela besar di dinding selatan atas, di atas pintu
  windowGlass(0, F2 + 3.2, HL - T / 2 - 0.02, Math.PI, 3.2, 5.0, GL[0]);
  for (const [i, c] of [[1.9, 0x8a4ad8], [1.5, 0xd84a3a], [1.1, 0xe0b33a], [0.65, 0x3a6fd8]].entries()) put(glow, new THREE.CircleGeometry(c[0], 24), c[1], 0, ROOF - 2.2, HL - T / 2 - 0.05 - i * 0.01, 0, Math.PI, 0);   // jendela mawar

  // ============================================================
  //  LANTAI, LANGIT-LANGIT, ATAP
  // ============================================================
  function floorRect(mat, x0, x1, z0, z1, y) {
    const w = x1 - x0, d = z1 - z0, g = new THREE.PlaneGeometry(w, d).rotateX(-HP).translate((x0 + x1) / 2, y, (z0 + z1) / 2), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * d / 2);   // 1 kotak tekstur = 2 m
    flo[mat].push(g.toNonIndexed());
  }
  const AREAS = [   // [x0, x1, z0, z1, bahan lantai 1, bahan lantai 2]
    [-8, 8, 5, HL, 'stone', null], [-8, 8, -HL, 5, 'marble', 'marble'],
    [8, 12, -HL, HL, 'stone', 'marble'], [-12, -8, -HL, HL, 'stone', 'marble'],
    [12, HW, -HL, HL, 'wood', 'wood'], [-HW, -12, -HL, HL, 'wood', 'wood'],
  ];
  for (const [x0, x1, z0, z1, m1, m2] of AREAS) {
    floorRect(m1, x0, x1, z0, z1, 0.01);
    if (m2) { floorRect(m2, x0, x1, z0, z1, F2 + 0.01); put(solid, new THREE.PlaneGeometry(x1 - x0, z1 - z0), WOOD_D, (x0 + x1) / 2, H1, (z0 + z1) / 2, HP, 0, 0); }   // pelat: atas = lantai 2, bawah = langit-langit lantai 1
  }
  put(solid, new THREE.PlaneGeometry(2 * HW, 2 * HL), WOOD_L, 0, ROOF, 0, HP, 0, 0);                  // atap kayu
  for (let z = -HL + 2.3; z < HL; z += 4.6) box(2 * HW, 0.5, 0.5, 0, ROOF - 0.25, z, WOOD_D);          // balok melintang
  for (const x of [-14, -7, 0, 7, 14]) box(0.5, 0.45, 2 * HL, x, ROOF - 0.22, 0, WOOD_D);              // balok memanjang
  for (const z of [-HL + 2.3, 0, HL - 2.3]) for (const x of [-HW, HW]) { /* pangkal balok */ box(0.6, 0.6, 0.6, x * 0.98, ROOF - 0.5, z, WOOD); }

  // ============================================================
  //  PERABOT & HIASAN (setiap pembuat benda mendaftarkan tabrakannya sendiri)
  // ============================================================
  function table(x, y, z, ry, w, d, lvl, h = 0.9, top = WOOD_L) {
    at(x, y, z, ry, () => { box(w, 0.08, d, 0, h - 0.04, 0, top); for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxB(0.1, h - 0.08, 0.1, sx * (w / 2 - 0.12), 0, sz * (d / 2 - 0.12), WOOD_D); });
    rectC(x, z, w, d, ry, lvl);
  }
  function chair(x, y, z, ry, c = WOOD) { at(x, y, z, ry, () => { box(0.46, 0.06, 0.46, 0, 0.46, 0, c); box(0.46, 0.55, 0.06, 0, 0.76, -0.2, c); for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxB(0.05, 0.43, 0.05, sx * 0.19, 0, sz * 0.19, WOOD_D); }); }
  function bench(x, y, z, ry, w, lvl) { at(x, y, z, ry, () => { box(w, 0.08, 0.42, 0, 0.46, 0, WOOD); for (const sx of [-1, 1]) boxB(0.08, 0.42, 0.36, sx * (w / 2 - 0.15), 0, 0, WOOD_D); }); rectC(x, z, w, 0.5, ry, lvl); }
  function bookshelf(x, y, z, ry, lvl, w = 2.4, h = 2.8) {   // menghadap +z (lokal)
    at(x, y, z, ry, () => {
      box(w, h, 0.06, 0, h / 2, -0.22, WOOD_D); for (const sx of [-1, 1]) boxB(0.08, h, 0.5, sx * (w / 2 - 0.04), 0, 0, WOOD); box(w, 0.08, 0.5, 0, h, 0, WOOD);
      const rows = Math.floor(h / 0.55);
      for (let r = 0; r < rows; r++) {
        const yb = 0.1 + r * 0.55; boxB(w - 0.1, 0.05, 0.48, 0, yb, 0, WOOD);
        let bx = -w / 2 + 0.15; while (bx < w / 2 - 0.2) { const bw = 0.08 + rnd() * 0.1, bh = 0.3 + rnd() * 0.17; boxB(bw, bh, 0.28 + rnd() * 0.08, bx + bw / 2, yb + 0.05, -0.04, [RED, BLUE, GREEN, PURPLE, 0x8a6a30, 0x3a3a46, 0xb08a4a][(rnd() * 7) | 0]); bx += bw + 0.01; }
      }
    });
    rectC(x, z, w, 0.55, ry, lvl);
  }
  function chest(x, y, z, ry, lvl, gold = false) {
    at(x, y, z, ry, () => { boxB(0.95, 0.5, 0.55, 0, 0, 0, WOOD); box(0.97, 0.18, 0.57, 0, 0.58, 0, WOOD_D); for (const sx of [-1, 1]) boxB(0.08, 0.7, 0.6, sx * 0.3, 0, 0, IRON); box(0.1, 0.12, 0.05, 0, 0.5, 0.29, GOLD);
      if (gold) { for (let i = 0; i < 7; i++) put(glow, new THREE.SphereGeometry(0.1 + rnd() * 0.05, 6, 5), 0xf2c23a, (rnd() - 0.5) * 0.7, 0.72 + rnd() * 0.06, (rnd() - 0.5) * 0.3); } });
    rectC(x, z, 0.95, 0.6, ry, lvl);
  }
  function barrel(x, y, z, lvl) { cylB(0.34, 0.34, 0.9, x, y, z, WOOD, 10); for (const h of [0.2, 0.7]) cylB(0.37, 0.37, 0.05, x, y + h, z, IRON, 10); circC(x, z, 0.42, lvl); }
  function crate(x, y, z, ry, lvl, s = 0.8) { at(x, y, z, ry, () => { boxB(s, s, s, 0, 0, 0, WOOD_L); for (const sx of [-1, 1]) boxB(0.06, s + 0.02, s + 0.02, sx * (s / 2 - 0.02), -0.01, 0, WOOD_D); }); rectC(x, z, s, s, ry, lvl); }
  function sack(x, y, z, lvl) { cylB(0.3, 0.22, 0.55, x, y, z, 0xcbb98c, 8); coneB(0.2, 0.2, x, y + 0.55, z, 0xcbb98c, 8); circC(x, z, 0.32, lvl); }
  function armor(x, y, z, ry, lvl, s = 1, spear = true) {
    at(x, y, z, ry, () => {
      boxB(0.7, 0.12, 0.7, 0, 0, 0, STONE_D); cylB(0.04, 0.04, 0.8, 0, 0.12, 0, IRON, 6);
      boxB(0.5, 0.2, 0.3, 0, 0.7, 0, STEEL); boxB(0.46, 0.55, 0.3, 0, 0.95, 0, STEEL); for (const sx of [-1, 1]) { ball(0.13, sx * 0.3, 1.45, 0, STEEL); boxB(0.12, 0.7, 0.12, sx * 0.34, 0.8, 0, STEEL); }
      ball(0.17, 0, 1.68, 0, STEEL, 8, 6); boxB(0.05, 0.1, 0.02, 0, 1.68, 0.16, IRON); coneB(0.06, 0.28, 0, 1.78, 0, RED, 6);
      if (spear) { cylB(0.025, 0.025, 2.4, 0.42, 0.1, 0.05, WOOD, 5); coneB(0.05, 0.22, 0.42, 2.5, 0.05, STEEL, 5); }
      box(0.4, 0.55, 0.05, -0.42, 1.1, 0.14, BLUE); box(0.34, 0.08, 0.06, -0.42, 1.2, 0.15, GOLD);
    }, s);
    circC(x, z, 0.5 * s, lvl);
  }
  function weaponRack(x, y, z, ry, lvl) {
    at(x, y, z, ry, () => { boxB(2.0, 0.1, 0.4, 0, 0, 0, WOOD_D); for (const sx of [-1, 1]) boxB(0.1, 1.5, 0.1, sx * 0.95, 0, 0, WOOD_D); box(2.0, 0.08, 0.1, 0, 1.45, 0, WOOD); box(2.0, 0.08, 0.1, 0, 0.9, 0, WOOD);
      for (let i = 0; i < 5; i++) { const sx = -0.75 + i * 0.375; boxB(0.06, 1.25, 0.02, sx, 0.2, 0.1, STEEL); boxB(0.2, 0.05, 0.05, sx, 0.52, 0.1, GOLD); } });
    rectC(x, z, 2.0, 0.5, ry, lvl);
  }
  function hearth(x, y, z, ry, lvl, w = 2.6, chimneyTo = H1) {   // menghadap +z (lokal): perapian/tungku bata
    at(x, y, z, ry, () => { boxB(w, 1.2, 1.0, 0, 0, 0, BRICK); boxB(w + 0.2, 0.12, 1.1, 0, 1.2, 0, STONE_D); boxB(w * 0.5, 0.8, 0.6, 0, 1.32, -0.1, BRICK); boxB(w * 0.32, chimneyTo - y - 2.1, 0.5, 0, 2.1, -0.18, BRICK);
      glowBox(w * 0.55, 0.5, 0.05, 0, 0.5, 0.5, 0xff7a1c); glowBox(w * 0.4, 0.3, 0.05, 0, 0.45, 0.52, 0xffc247); for (const sx of [-1, 1]) boxB(0.1, 0.55, 0.1, sx * w * 0.32, 0.1, 0.5, IRON); });
    rectC(x, z, w, 1.0, ry, lvl);
  }
  function cauldron(x, y, z, lvl) { ball(0.5, x, y + 0.55, z, IRON, 10, 7); put(glow, new THREE.CircleGeometry(0.4, 10), 0xc9803a, x, y + 0.86, z, -HP, 0, 0); for (const k of [0, 1, 2]) { const a = k * 2.1; boxB(0.06, 0.4, 0.06, x + Math.cos(a) * 0.4, y, z + Math.sin(a) * 0.4, IRON); } circC(x, z, 0.6, lvl); }
  function rug(x, y, z, ry, w, d, c, c2 = GOLD) { at(x, y, z, ry, () => { boxB(w, 0.03, d, 0, 0, 0, c2); boxB(w - 0.28, 0.04, d - 0.28, 0, 0, 0, c); }); }
  function column(x, y, z, h, lvl, r = 0.5) { boxB(1.3, 0.4, 1.3, x, y, z, STONE_D); cylB(r, r + 0.05, h - 0.8, x, y + 0.4, z, STONE, 12); boxB(1.2, 0.4, 1.2, x, y + h - 0.4, z, STONE_D); circC(x, z, 0.65, lvl); }
  function torch(x, y, z, ry) { at(x, y, z, ry, () => { boxB(0.12, 0.35, 0.1, 0, 0, 0.05, IRON); cylB(0.07, 0.04, 0.3, 0, 0.3, 0.16, IRON, 6); flame(0, 0.72, 0.16, 0.12); flame(0, 0.86, 0.16, 0.07); }); }
  function chandelier(x, y, z, r, chain, n = 8) {   // y = tinggi cincin; rantai ke atas
    put(solid, new THREE.TorusGeometry(r, 0.07, 6, 20), GOLD, x, y, z, HP, 0, 0); cylB(0.03, 0.03, chain, x, y, z, IRON, 5);
    box(r * 2, 0.05, 0.05, x, y, z, GOLD); box(0.05, 0.05, r * 2, x, y, z, GOLD);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r; cylB(0.05, 0.05, 0.28, cx, y + 0.05, cz, 0xf3ecd8, 6); flame(cx, y + 0.4, cz, 0.07); }
    glowBox(0.2, 0.2, 0.2, x, y - 0.1, z, 0xffd27a);
  }
  function banner(x, y, z, ry, w, h, c) { at(x, y, z, ry, () => { box(w + 0.2, 0.1, 0.1, 0, h / 2 + 0.05, 0, GOLD); box(w, h, 0.04, 0, 0, 0, c); box(w - 0.2, 0.06, 0.05, 0, h * 0.2, 0.02, GOLD); coneB(0.0001, 0.001, 0, 0, 0, c); box(0.25, 0.25, 0.05, 0, h * 0.05, 0.03, GOLD, 0, 0, Math.PI / 4); for (let i = -1; i <= 1; i++) box(0.08, 0.3, 0.04, i * w * 0.3, -h / 2 - 0.12, 0, GOLD); }); }
  function painting(x, y, z, ry, w, h, c) { at(x, y, z, ry, () => { box(w, h, 0.07, 0, 0, 0, GOLD); box(w - 0.14, h - 0.14, 0.09, 0, 0, 0, c); box(w * 0.3, h * 0.3, 0.1, -w * 0.12, h * 0.1, 0, [0x3f6a46, 0xc9a24d, 0x6b8aa8][(rnd() * 3) | 0]); }); }
  function pot(x, y, z, lvl) { cylB(0.3, 0.2, 0.5, x, y, z, 0xa8582e, 8); ball(0.38, x, y + 0.82, z, 0x3f7a3a, 7, 5); circC(x, z, 0.36, lvl); }
  function candelabra(x, y, z, lvl) { cylB(0.12, 0.2, 0.15, x, y, z, GOLD, 8); cylB(0.04, 0.04, 1.3, x, y + 0.15, z, GOLD, 6); box(0.7, 0.04, 0.04, x, y + 1.45, z, GOLD); for (const o of [-0.35, 0, 0.35]) { cylB(0.04, 0.04, 0.18, x + o, y + 1.47, z, 0xf3ecd8, 6); flame(x + o, y + 1.74, z, 0.06); } circC(x, z, 0.25, lvl); }
  function bed(x, y, z, ry, lvl, royal, c) {   // kepala di -z (lokal)
    at(x, y, z, ry, () => {
      boxB(1.6, 0.35, 2.3, 0, 0, 0, WOOD_D); boxB(1.5, 0.22, 2.15, 0, 0.35, 0.02, CREAM); boxB(1.52, 0.1, 1.3, 0, 0.55, 0.5, c); boxB(0.55, 0.14, 0.4, -0.38, 0.57, -0.8, 0xf3f0e6); boxB(0.55, 0.14, 0.4, 0.38, 0.57, -0.8, 0xf3f0e6);
      boxB(1.7, royal ? 1.9 : 1.2, 0.14, 0, 0, -1.2, WOOD); if (royal) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxB(0.1, 2.5, 0.1, sx * 0.8, 0, sz * 1.1, GOLD); box(1.75, 0.1, 2.5, 0, 2.55, 0, GOLD); for (const sx of [-1, 1]) box(0.04, 1.6, 2.2, sx * 0.86, 1.7, 0, c); }
    }); rectC(x, z, 1.8, 2.4, ry, lvl);
  }
  function wardrobe(x, y, z, ry, lvl) { at(x, y, z, ry, () => { boxB(1.5, 2.4, 0.6, 0, 0, 0, WOOD); box(0.04, 2.2, 0.04, 0, 1.2, 0.32, WOOD_D); for (const sx of [-1, 1]) { ball(0.04, sx * 0.1, 1.2, 0.34, GOLD, 5, 4); box(0.6, 1.9, 0.03, sx * 0.37, 1.2, 0.31, WOOD_L); } boxB(1.6, 0.12, 0.7, 0, 2.4, 0, WOOD_D); }); rectC(x, z, 1.5, 0.6, ry, lvl); }
  function vanity(x, y, z, ry, lvl) { at(x, y, z, ry, () => { box(1.3, 0.07, 0.55, 0, 0.78, 0, WOOD_L); boxB(0.12, 0.74, 0.5, -0.55, 0, 0, WOOD_D); boxB(0.12, 0.74, 0.5, 0.55, 0, 0, WOOD_D); box(0.8, 1.1, 0.04, 0, 1.5, -0.2, 0xbfd8e8); box(0.92, 1.22, 0.05, 0, 1.5, -0.22, GOLD); cylB(0.04, 0.04, 0.15, 0.4, 0.82, 0, 0xcfa0c0, 6); cylB(0.2, 0.2, 0.06, -0.3, 0.18, 0.75, RED, 8); cylB(0.04, 0.04, 0.4, -0.3, 0.2, 0.75, RED, 6); }); rectC(x, z, 1.3, 0.6, ry, lvl); }
  function sofa(x, y, z, ry, lvl, c = BLUE) { at(x, y, z, ry, () => { boxB(2.2, 0.45, 0.9, 0, 0.1, 0, c); boxB(2.2, 0.6, 0.25, 0, 0.5, -0.33, c); for (const sx of [-1, 1]) boxB(0.25, 0.35, 0.9, sx * 1.05, 0.5, 0, c); for (const sx of [-1, 1]) boxB(0.08, 0.1, 0.08, sx * 1.0, 0, 0.35, WOOD_D); }); rectC(x, z, 2.3, 1.0, ry, lvl); }
  function desk(x, y, z, ry, lvl) { table(x, y, z, ry, 1.6, 0.8, lvl, 0.85, WOOD); at(x, y, z, ry, () => { box(0.5, 0.02, 0.35, -0.3, 0.9, 0, 0xf3ead2); cylB(0.04, 0.04, 0.3, 0.3, 0.86, 0.1, 0xe8dcc0, 6); cylB(0.015, 0.015, 0.3, 0.55, 0.86, -0.2, 0x222222, 5); flame(0.6, 1.05, 0.2, 0.05); cylB(0.02, 0.02, 0.15, 0.6, 0.86, 0.2, 0xf3ecd8, 5); }); }
  function roundTable(x, y, z, r, lvl, chairs = 6) { cylB(0.4, 0.5, 0.8, x, y, z, WOOD_D, 10); cylB(r, r, 0.1, x, y + 0.8, z, WOOD_L, 20); cylB(r * 0.55, r * 0.55, 0.03, x, y + 0.9, z, RED, 16); circC(x, z, r, lvl);
    for (let i = 0; i < chairs; i++) { const a = i / chairs * Math.PI * 2; chair(x + Math.cos(a) * (r + 0.55), y, z + Math.sin(a) * (r + 0.55), -a - HP * 0 + Math.PI / 2 * 0 + (Math.PI / 2 + Math.PI) - Math.PI / 2 * 2 + Math.PI / 2 * 0); } }
  function piano(x, y, z, ry, lvl) { at(x, y, z, ry, () => { boxB(1.9, 0.85, 1.2, 0, 0, 0, 0x1b1b22); boxB(1.9, 0.05, 0.4, 0, 0.85, 0.3, 0xf3f0e6); box(1.9, 0.06, 0.8, 0, 1.35, -0.2, 0x1b1b22, -0.55, 0, 0); for (const sx of [-1, 1]) boxB(0.08, 0.75, 0.08, sx * 0.85, 0, 0.5, 0x1b1b22); boxB(0.9, 0.42, 0.4, 0, 0, 1.1, 0x4a3220); }); rectC(x, z, 2.0, 2.0, ry, lvl); }
  function altar(x, y, z, ry, lvl) { at(x, y, z, ry, () => { boxB(2.0, 1.0, 0.8, 0, 0, 0, STONE); boxB(2.2, 0.1, 1.0, 0, 1.0, 0, 0xf6f1e4); for (const sx of [-1, 1]) { cylB(0.05, 0.07, 0.4, sx * 0.8, 1.1, 0, GOLD, 8); flame(sx * 0.8, 1.6, 0, 0.07); } box(0.1, 0.7, 0.05, 0, 1.55, -0.1, GOLD); box(0.4, 0.1, 0.05, 0, 1.75, -0.1, GOLD); }); rectC(x, z, 2.0, 0.9, ry, lvl); }
  function stool(x, y, z) { cylB(0.2, 0.2, 0.45, x, y, z, WOOD, 8); }
  function fountain(x, y, z, lvl) { cylB(1.6, 1.8, 0.5, x, y, z, STONE, 16); put(glow, new THREE.CircleGeometry(1.45, 20), 0x6aa9d8, x, y + 0.52, z, -HP, 0, 0); cylB(0.25, 0.35, 1.3, x, y + 0.5, z, STONE_D, 10); cylB(0.7, 0.4, 0.2, x, y + 1.7, z, STONE, 12); put(glow, new THREE.CircleGeometry(0.6, 12), 0x8cc4e8, x, y + 1.92, z, -HP, 0, 0); circC(x, z, 1.85, lvl); }

  // ---- singgasana ----
  function throne() {
    const x = THRONE.x, z = THRONE.z, y = F2 + DH;
    boxB(DAIS.x1 - DAIS.x0, DH, DAIS.z1 - DAIS.z0, (DAIS.x0 + DAIS.x1) / 2, F2, (DAIS.z0 + DAIS.z1) / 2, 0x7d2a24);       // panggung
    boxB(DAIS.x1 - DAIS.x0 + 0.2, 0.06, 0.2, 0, F2 + DH, DAIS.z1 + 0.1, GOLD);
    for (const sx of [-1, 1]) boxB(0.2, 0.06, DAIS.z1 - DAIS.z0, sx * (DAIS.x1 + 0.1), F2 + DH, (DAIS.z0 + DAIS.z1) / 2, GOLD);
    at(x, y, z, 0, () => {
      boxB(2.2, 0.35, 1.6, 0, 0, 0, GOLD); boxB(1.6, 0.5, 1.3, 0, 0.35, 0.1, RED); boxB(1.9, 0.12, 1.4, 0, 0.85, 0.1, GOLD);
      boxB(2.2, 3.4, 0.35, 0, 0.35, -0.7, GOLD); boxB(1.8, 3.0, 0.38, 0, 0.55, -0.66, RED); box(2.4, 0.2, 0.4, 0, 3.8, -0.7, GOLD);
      for (const k of [-1, 0, 1]) coneB(0.2, 0.7 + (k === 0 ? 0.35 : 0), k * 0.75, 3.9, -0.7, GOLD, 5);
      ball(0.16, 0, 4.75, -0.7, 0xd84a3a, 8, 6);
      for (const sx of [-1, 1]) { boxB(0.25, 0.7, 1.3, sx * 1.0, 0.35, 0.1, GOLD); ball(0.14, sx * 1.0, 1.1, 0.7, GOLD, 7, 5); boxB(0.3, 3.4, 0.3, sx * 1.15, 0, -0.7, GOLD); ball(0.2, sx * 1.15, 3.55, -0.7, 0xf2c23a, 7, 5); }
    });
    rectC(x, z, 2.5, 1.9, 0, 2);
  }

  // ============================================================
  //  TANGGA AGUNG (lantai 1 -> 2) + pagar
  // ============================================================
  {
    const sw = STAIR.x * 2, dz = (STAIR.zBot - STAIR.zTop) / STAIR.n, rise = F2 / STAIR.n;
    for (let i = 0; i < STAIR.n; i++) {
      const z = STAIR.zBot - dz * (i + 0.5), top = rise * (i + 1);
      boxB(sw, top, dz, 0, 0, z, STONE);
      boxB(2.4, 0.03, dz, 0, top, z, RED); for (const sx of [-1, 1]) boxB(0.1, 0.035, dz, sx * 1.25, top, z, GOLD);
    }
    const len = Math.hypot(F2, STAIR.zBot - STAIR.zTop), ang = Math.atan2(F2, STAIR.zBot - STAIR.zTop);
    for (const s of [-1, 1]) {
      const rx = s * (STAIR.x + 0.12);
      box(0.16, 0.14, len, rx, F2 / 2 + 1.05, (STAIR.zBot + STAIR.zTop) / 2, WOOD_D, ang, 0, 0);
      for (let k = 1; k <= 9; k++) { const z = STAIR.zBot - (STAIR.zBot - STAIR.zTop) * k / 10, y = F2 * (STAIR.zBot - z) / (STAIR.zBot - STAIR.zTop); boxB(0.1, 1.0, 0.1, rx, y, z, WOOD); }
      boxB(0.3, 1.5, 0.3, rx, 0, STAIR.zBot + 0.1, WOOD_D); ball(0.16, rx, 1.65, STAIR.zBot + 0.1, GOLD, 7, 5);
      boxB(0.3, 1.5, 0.3, rx, F2, STAIR.zTop - 0.05, WOOD_D); ball(0.16, rx, F2 + 1.65, STAIR.zTop - 0.05, GOLD, 7, 5);
    }
  }

  yield;
  // ============================================================
  //  AULA MASUK (lantai 1, tinggi dua lantai) + Balairung/Singgasana (lantai 2) + Aula Perjamuan (lantai 1)
  // ============================================================
  // ---- aula masuk ----
  chandelier(0, ROOF - 3.2, 12, 1.9, 2.7, 10); chandelier(0, ROOF - 3.0, 20, 1.3, 2.4, 8);
  for (const s of [-1, 1]) {
    armor(s * 6.6, 0, 21.6, s > 0 ? Math.PI * 0.85 : -Math.PI * 0.85, 1, 1.35); armor(s * 6.9, 0, 9, s > 0 ? -HP : HP, 1, 1.35);
    pot(s * 6.9, 0, 14.2, 1); pot(s * 4.4, 0, 22, 1);
    banner(s * 7.62, 4.2, 14, s > 0 ? -HP : HP, 1.5, 3.0, RED);   // tidak menembus pelat lantai 2 (y = 6) banner(s * 7.62, F2 + 4.2, 12, s > 0 ? -HP : HP, 1.7, 4.0, BLUE); banner(s * 7.62, F2 + 4.2, 19, s > 0 ? -HP : HP, 1.7, 4.0, BLUE);
    torch(s * 7.62, 2.0, 7, s > 0 ? -HP : HP); torch(s * 7.62, 2.0, 21, s > 0 ? -HP : HP); torch(s * 7.62, F2 + 2.4, 9, s > 0 ? -HP : HP); torch(s * 7.62, F2 + 2.4, 17, s > 0 ? -HP : HP);
  }
  rug(0, 0.02, 20.2, 0, 3.4, 5.4, RED); painting(0, 3.6, 5.34, 0, 3.6, 2.2, 0x4a6a8a);
  // ---- balairung (lantai 2) ----
  throne();
  { const y = F2;
    for (const [i, z] of [-14, -11, -3, 0, 3].entries()) for (const s of [-1, 1]) column(s * 5.7, y, z, ROOF - F2 - 0.4, 2);
    rug(0, y + 0.02, -6, 0, 3.4, 22.6, RED); rug(0, y + DH + 0.02, -19.6, 0, 3.4, 5.6, RED);
    chandelier(0, ROOF - 3.4, -14, 1.8, 2.8, 10); chandelier(0, ROOF - 3.4, -6, 1.8, 2.8, 10); chandelier(0, ROOF - 3.4, 1, 1.4, 2.8, 8);
    // jendela kaca patri raksasa di belakang singgasana + panji-panji
    at(0, y + 4.6, -HL + T / 2 + 0.02, 0, () => { box(4.6, 7.0, 0.1, 0, 0, 0.05, WOOD_D); put(glow, new THREE.PlaneGeometry(4.2, 6.6), 0x3a6fd8, 0, 0, 0.12);
      for (const [rr, cc] of [[1.8, 0xd84a3a], [1.2, 0xe0b33a], [0.6, 0xf3ecd8]]) put(glow, new THREE.CircleGeometry(rr, 20), cc, 0, 1.4, 0.13 + (3 - rr) * 0.002);
      for (const sx of [-1, 1]) put(glow, new THREE.PlaneGeometry(0.5, 4.2), 0x8a4ad8, sx * 1.2, -1.2, 0.135); });
    for (const s of [-1, 1]) { banner(s * 3.6, y + 5.0, -HL + T / 2 + 0.1, 0, 1.4, 5.2, RED); banner(s * 6.9, y + 4.8, -HL + T / 2 + 0.1, 0, 1.3, 4.4, BLUE);
      candelabra(s * 3.5, y + DH, -17.6, 2); armor(s * 7.0, y, -20.5, s > 0 ? -HP * 1.2 : HP * 1.2, 2, 1.3);
      torch(s * 7.62, y + 2.6, -17, s > 0 ? -HP : HP); torch(s * 7.62, y + 2.6, -1.5, s > 0 ? -HP : HP);
      painting(s * 7.67, y + 3.4, -12, s > 0 ? -HP : HP, 2.4, 3.0, 0x6a4a3a); painting(s * 7.67, y + 3.4, 2, s > 0 ? -HP : HP, 2.4, 3.0, 0x3a5a6a); }
  }
  // ---- aula perjamuan (lantai 1) ----
  { for (const [i, z] of [-14, -11, -3, 0, 3].entries()) for (const s of [-1, 1]) column(s * 5.7, 0, z, H1, 1);
    rug(0, 0.02, -9, 0, 5.2, 24, RED);
    for (const s of [-1, 1]) { const x = s * 2.2; table(x, 0, -9, 0, 1.3, 15.5, 1, 0.9, WOOD_L); boxB(0.8, 0.02, 14, x, 0.9, -9, 0xf6f1e4);
      for (let z = -15.5; z <= -2.5; z += 1.6) { chair(s * 3.35, 0, z, s > 0 ? HP : -HP); chair(s * 1.05, 0, z, s > 0 ? -HP : HP); }
      for (let z = -15; z <= -3; z += 3) { cylB(0.05, 0.05, 0.3, x, 0.92, z, 0xf3ecd8, 6); flame(x, 1.32, z, 0.06); cylB(0.14, 0.14, 0.04, x - s * 0.3, 0.92, z + 1, GOLD, 8); } }
    hearth(0, 0, -HL + 1.3, 0, 1, 4.6, H1); box(3.4, 0.1, 0.1, 0, 3.0, -HL + 1.9, GOLD);
    painting(-5.2, 3.3, -HL + 0.4, 0, 2.2, 2.4, 0x5a4a6a); painting(5.2, 3.3, -HL + 0.4, 0, 2.2, 2.4, 0x6a5a3a);
    chandelier(0, H1 - 1.6, -16, 1.6, 1.6, 10); chandelier(0, H1 - 1.6, -8, 1.6, 1.6, 10); chandelier(0, H1 - 1.6, 0, 1.4, 1.6, 8);
    for (const s of [-1, 1]) { torch(s * 7.62, 2.4, -19, s > 0 ? -HP : HP); torch(s * 7.62, 2.4, -9, s > 0 ? -HP : HP); torch(s * 7.62, 2.4, 1, s > 0 ? -HP : HP); banner(s * 7.62, 3.6, -6, s > 0 ? -HP : HP, 1.2, 2.2, RED); }
  }

  yield;
  // ============================================================
  //  LORONG (barat & timur) — lantai 1 & 2: karpet, obor, lukisan, baju zirah, pot
  // ============================================================
  for (const lvl of [1, 2]) {
    const y = lvl === 1 ? 0 : F2, zs = lvl === 1 ? [-HL + 1, HL - 1] : [-HL + 1, HL - 1];
    for (const s of [-1, 1]) {
      const cx = s * 10, ins = s > 0 ? -HP : HP, outs = -ins;   // ins: menghadap ke dalam lorong dari dinding sisi aula (x = ±8) -> tidak dipakai langsung
      rug(cx, y + 0.02, 0, 0, 1.8, 43.2, lvl === 1 ? RED : PURPLE);
      const wSide = WALLS.find(w => w.axis === 'V' && w.at === s * 12), wHall = WALLS.find(w => w.axis === 'V' && w.at === s * 8);   // dinding ke ruang samping & ke aula
      for (let z = -19; z <= 19; z += 6.5) {
        if (!nearDoor(wSide, z, lvl, 0.2)) torch(s * 11.66, y + 2.5, z, s > 0 ? HP : -HP);
        if (!nearDoor(wHall, z + 3.2, lvl, 0.2)) torch(s * 8.34, y + 2.5, z + 3.2, s > 0 ? -HP : HP);
      }
      for (const z of [-13.75, -3.5, 8.75, 19.9]) painting(s * 11.67, y + 3.2, z, s > 0 ? HP : -HP, 1.4, 1.1, [0x4a6a8a, 0x6a4a3a, 0x3a5a4a, 0x7a5a2a, 0x5a4a6a][(rnd() * 5) | 0]);   // di antara pintu ruang samping (z pintu: 15.5, 2, -9, -18.5)
      armor(s * 11.2, y, -21.8, s > 0 ? Math.PI : Math.PI, lvl, 1.05); armor(s * 8.8, y, -21.8, Math.PI, lvl, 1.05);
      if (lvl === 2) { pot(s * 11.2, y, 21.7, 2); pot(s * 8.8, y, 21.7, 2); pot(s * 8.9, y, 5.9, 2); pot(s * 11.1, y, 5.9, 2); }
      else { pot(s * 11.2, y, 21.7, 1); chest(s * 8.9, y, 14.2, s > 0 ? -HP : HP, 1); }
      for (let z = -12; z <= 12; z += 12) { chandelier(cx, y + 3.9, z, 0.7, 0.9, 6); }
    }
  }

  yield;
  // ============================================================
  //  RUANGAN SAMPING (4 per sisi per lantai). Koordinat ruang: u = jarak dari dinding lorong (0..7.4), v = geser dari pusat ruang
  // ============================================================
  function furnish(lvl, s, idx) {
    const [z0, z1] = SIDE_ROOMS[idx], cz = (z0 + z1) / 2, y = lvl === 1 ? 0 : F2, depth = z1 - z0;
    const X = u => s * (12.3 + u), Z = v => cz + v, toDoor = -s * HP, toWall = s * HP;
    const key = lvl + (s > 0 ? 'E' : 'W') + idx;
    const rugR = (c, w = 3, d = 3.6) => rug(X(3.6), y + 0.02, cz, s * HP, w, d, c);
    const lamp = (u, v) => { torch(s * (HW - T / 2 - 0.02), y + 2.4, Z(v), -s * HP); };
    // ruang panjang punya 2 jendela di z = pusat ± 3,4: obor dipasang di ujung dinding (di luar bingkai jendela), bukan di atas kaca
    for (const v of depth > 11 ? [-(depth / 2 - 1), depth / 2 - 1] : [-depth / 4, depth / 4]) lamp(0, v);
    switch (key) {
      case '1E0': // Dapur
        hearth(X(7.0), y, Z(-4.8), toDoor, 1, 2.8); cauldron(X(5.6), y, Z(-4.8), 1); hearth(X(7.0), y, Z(4.8), toDoor, 1, 2.8);
        table(X(3.8), y, Z(-2.2), HP, 3.2, 1.1, 1, 0.95, WOOD_L); table(X(3.8), y, Z(3.2), HP, 3.2, 1.1, 1, 0.95, WOOD_L);
        for (let i = 0; i < 4; i++) cylB(0.12, 0.1, 0.1, X(3.8), y + 0.95, Z(-3.2 + i * 0.9), [STEEL, GOLD][i % 2], 8);
        barrel(X(1.0), y, Z(-6.2), 1); barrel(X(1.9), y, Z(-6.4), 1); crate(X(1.0), y, Z(6.0), 0, 1); sack(X(2.1), y, Z(6.3), 1); sack(X(1.6), y, Z(5.4), 1);
        for (let i = 0; i < 4; i++) { cylB(0.01, 0.01, 0.8, X(6.8), y + H1 - 0.8, Z(-6 + i * 3.4), IRON, 4); cylB(0.15, 0.12, 0.2, X(6.8), y + H1 - 1.0, Z(-6 + i * 3.4), IRON, 8); }
        break;
      case '1E1': // Ruang Makan
        rugR(RED, 5, 8); table(X(3.7), y, Z(0), HP, 6.2, 1.5, 1, 0.9, WOOD_L); boxB(0.9, 0.02, 5.6, X(3.7), y + 0.9, Z(0), 0xf6f1e4);
        for (let v = -2.4; v <= 2.4; v += 1.2) { chair(X(2.7), y, Z(v), -toDoor); chair(X(4.7), y, Z(v), toDoor); }
        for (const v of [-2, 0, 2]) { cylB(0.05, 0.05, 0.3, X(3.7), y + 0.92, Z(v), 0xf3ecd8, 6); flame(X(3.7), y + 1.32, Z(v), 0.06); }
        chair(X(3.7), y, Z(-3.7), 0); chair(X(3.7), y, Z(3.7), Math.PI);
        bookshelf(X(7.2), y, Z(-4.4), toDoor, 1, 2.0, 2.2); painting(X(7.3), y + 2.6, Z(0.0), toDoor, 2.0, 1.4, 0x5a6a4a); chest(X(0.8), y, Z(-4.8), toWall, 1);
        break;
      case '1E2': // Ruang Jaga
        weaponRack(X(7.0), y, Z(-3.2), toDoor, 1); weaponRack(X(7.0), y, Z(3.2), toDoor, 1);
        table(X(3.6), y, Z(0.2), HP, 2.6, 1.2, 1); chair(X(2.6), y, Z(0.2), -toDoor); chair(X(4.6), y, Z(0.2), toDoor); chair(X(3.6), y, Z(-1.4), 0);
        for (const v of [-3.4, 3.6]) { bed(X(1.2), y, Z(v), HP * -s, 1, false, 0x5a6a8a); }
        armor(X(6.8), y, Z(-4.2), toDoor, 1, 1, true); barrel(X(0.8), y, Z(4.0), 1);
        break;
      case '1E3': // Gudang
        for (let i = 0; i < 4; i++) crate(X(6.8 - (i % 2) * 0.1), y + (i > 1 ? 0.8 : 0), Z(-3 + (i % 2) * 0.9), 0.1 * i, 1);
        crate(X(6.6), y, Z(2.8), 0.2, 1, 1.0); crate(X(5.6), y, Z(3.3), 0.4, 1); sack(X(5.0), y, Z(-3.6), 1); sack(X(5.6), y, Z(-3.0), 1); sack(X(4.5), y, Z(-2.6), 1);
        barrel(X(2.2), y, Z(-3.6), 1); barrel(X(3.0), y, Z(-3.9), 1); barrel(X(2.6), y, Z(-3.1), 1); barrel(X(2.4), y, Z(3.6), 1);
        break;
      case '1W0': // Perpustakaan
        for (const v of [-5.7, -1.25, 1.25, 5.7]) bookshelf(X(7.15), y, Z(v), toDoor, 1);   // di antara & di luar kedua jendela (z ± 3,4)
        bookshelf(X(2.2), y, Z(-6.9), 0 * s, 1, 3.0, 2.9); bookshelf(X(5.2), y, Z(6.9), Math.PI, 1, 3.0, 2.9); bookshelf(X(2.2), y, Z(6.9), Math.PI, 1, 3.0, 2.9);
        desk(X(3.8), y, Z(-2.4), HP, 1); chair(X(2.7), y, Z(-2.4), -toDoor); desk(X(3.8), y, Z(3), HP, 1); chair(X(2.7), y, Z(3), -toDoor);
        rugR(PURPLE, 3, 3.4);
        break;
      case '1W1': // Ruang Senjata
        for (const v of [-4, -1.5, 1.5, 4]) armor(X(6.9), y, Z(v), toDoor, 1, 1.15);
        weaponRack(X(1.8), y, Z(-4.6), HP * s * -1, 1); weaponRack(X(1.8), y, Z(4.6), HP * s * -1, 1);
        table(X(4.2), y, Z(0), HP, 2.4, 1.0, 1); put(solid, new THREE.BoxGeometry(1.4, 0.04, 0.2), STEEL, X(4.2), y + 0.94, Z(-0.2), 0, HP, 0); banner(X(7.35), y + 3.2, Z(0), toDoor, 1.5, 2.2, RED);
        break;
      case '1W2': // Ruang Tamu
        rugR(RED, 4, 3.8); sofa(X(6.4), y, Z(0), toDoor, 1); sofa(X(3.6), y, Z(-3.2), HP * s * -1 + Math.PI, 1, GREEN); sofa(X(3.6), y, Z(3.2), HP * s * -1, 1, GREEN);
        table(X(3.7), y, Z(0), HP, 1.6, 0.9, 1, 0.5); candelabra(X(1.0), y, Z(-3.6), 1); candelabra(X(1.0), y, Z(3.6), 1); painting(X(7.3), y + 2.6, Z(-3.1), toDoor, 1.3, 1.6, 0x7a5a3a); painting(X(7.3), y + 2.6, Z(3.1), toDoor, 1.3, 1.6, 0x5a6a4a);
        break;
      case '1W3': // Ruang Harta
        for (const [i, v] of [-2.6, -0.4, 1.8, 3.5].entries()) chest(X(6.6 - (i % 2) * 1.6), y, Z(v - (i % 2) * 0.5), toDoor, 1, true);
        chest(X(2.2), y, Z(-3.0), HP * s * -1, 1, true); chest(X(2.2), y, Z(3.0), HP * s * -1, 1, true);
        cylB(0.5, 0.6, 1.0, X(4.2), y, Z(0), STONE, 12); ball(0.32, X(4.2), y + 1.35, Z(0), GOLD, 10, 8); circC(X(4.2), Z(0), 0.65, 1);
        glowBox(0.6, 0.02, 0.6, X(4.2), y + 1.0, Z(0), 0xffd27a); armor(X(7.0), y, Z(-3), toDoor, 1); armor(X(7.0), y, Z(3), toDoor, 1);
        break;
      case '2E0': // Kamar Putri
        bed(X(6.6), y, Z(-2.2), toDoor, 2, true, 0xd87a9a); rugR(0xb85a8a, 3.4, 4); wardrobe(X(1.2), y, Z(-5.8), toWall, 2); vanity(X(6.9), y, Z(3.6), toDoor, 2); stool(X(5.8), y, Z(3.6));
        bookshelf(X(2.6), y, Z(5.9), Math.PI, 2, 2.2, 2.4); sofa(X(3.6), y, Z(2.9), 0 * s - HP * s, 2, PURPLE); table(X(2.3), y, Z(-3.6), 0, 1.0, 0.8, 2, 0.7); painting(X(7.3), y + 3.0, Z(5.7), toDoor, 1.4, 1.8, 0x9a6a8a);
        break;
      case '2E1': // Ruang Musik
        piano(X(5.4), y, Z(-2.0), toDoor + Math.PI * 0, 2); stool(X(3.7), y, Z(-2.0)); rugR(BLUE, 4, 4.4); for (const v of [1.6, 2.8, 4]) chair(X(5.5), y, Z(v), toDoor); candelabra(X(6.9), y, Z(-4.4), 2); candelabra(X(6.9), y, Z(4.4), 2);
        painting(X(7.3), y + 2.8, Z(0.0), toDoor, 2.0, 1.4, 0x5a6a8a);
        break;
      case '2E2': // Ruang Rapat
        roundTable(X(4.0), y, Z(0), 1.7, 2, 8); painting(X(7.3), y + 5.5, Z(0), toDoor, 2.8, 1.4, 0x4a5a3a); banner(X(7.35), y + 3.4, Z(-3), toDoor, 1.1, 2.6, RED); banner(X(7.35), y + 3.4, Z(3), toDoor, 1.1, 2.6, RED);
        break;
      case '2E3': // Ruang Pakaian
        for (const v of [-3.0, -1.2, 0.6, 2.4]) wardrobe(X(7.0), y, Z(v), toDoor, 2); vanity(X(1.4), y, Z(-3.4), toWall, 2); chest(X(1.2), y, Z(3.0), toWall, 2); sofa(X(3.6), y, Z(0), HP * s * -1, 2, PURPLE);
        break;
      case '2W0': // Kamar Ratu
        bed(X(6.4), y, Z(-3.4), toDoor, 2, true, 0x6a3a7a); rugR(0x6a2a4a, 3.8, 4.4); wardrobe(X(1.2), y, Z(-6.2), toWall, 2); wardrobe(X(2.9), y, Z(-6.5), 0 * s, 2); vanity(X(6.9), y, Z(3.2), toDoor, 2); stool(X(5.8), y, Z(3.2));
        chest(X(1.0), y, Z(5.8), toWall, 2); sofa(X(3.6), y, Z(4.6), 0, 2, RED); table(X(2.6), y, Z(0.6), 0, 1.0, 0.8, 2, 0.7); painting(X(7.3), y + 3.0, Z(0.8), toDoor, 1.8, 2.2, 0x8a6a3a); candelabra(X(1.6), y, Z(-2.6), 2);
        break;
      case '2W1': // Ruang Doa
        altar(X(6.9), y, Z(0), toDoor, 2); for (const sx of [-1, 1]) for (let r = 0; r < 3; r++) bench(X(2.2 + r * 1.3), y, Z(sx * 1.9), HP * s * -1 + Math.PI / 2 * 0, 2, 2.2);
        put(glow, new THREE.CircleGeometry(1.1, 18), 0xffe9a8, X(7.35), y + 3.4, Z(0), 0, toDoor, 0); box(0.3, 2.2, 0.08, X(7.34), y + 3.4, Z(0), GOLD, 0, toDoor, 0); box(1.3, 0.3, 0.08, X(7.34), y + 3.7, Z(0), GOLD, 0, toDoor, 0);
        break;
      case '2W2': // Ruang Tamu Kerajaan
        rugR(RED, 4.4, 4.4); sofa(X(6.4), y, Z(-1.4), toDoor, 2, PURPLE); sofa(X(3.6), y, Z(2.8), HP * s * -1 + Math.PI, 2, BLUE); sofa(X(3.6), y, Z(-2.8), HP * s * -1, 2, BLUE); table(X(3.7), y, Z(0), HP, 1.4, 0.9, 2, 0.5, WOOD);
        armor(X(7.0), y, Z(4.0), toDoor, 2); armor(X(7.0), y, Z(-4.0), toDoor, 2); painting(X(7.3), y + 5.5, Z(-0.6), toDoor, 2.4, 1.4, 0x6a8a5a);
        break;
      case '2W3': // Ruang Juru Tulis
        desk(X(5.8), y, Z(-2.0), HP, 2); chair(X(4.7), y, Z(-2.0), -toDoor); desk(X(5.8), y, Z(2.2), HP, 2); chair(X(4.7), y, Z(2.2), -toDoor);
        bookshelf(X(7.15), y, Z(-3.1), toDoor, 2, 1.8, 2.6); bookshelf(X(7.15), y, Z(3.1), toDoor, 2, 1.8, 2.6); bookshelf(X(2.0), y, Z(-3.9), 0, 2, 2.2, 2.4); bookshelf(X(2.0), y, Z(3.9), Math.PI, 2, 2.2, 2.4);
        break;
    }
  }
  for (const lvl of [1, 2]) for (const s of [-1, 1]) for (let i = 0; i < SIDE_ROOMS.length; i++) { furnish(lvl, s, i); yield; }   // satu ruangan per langkah

  // ============================================================
  //  GABUNGKAN
  // ============================================================
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  yield;
  const sm = new THREE.Mesh(mergeGeometries(solid), solidMat);
  yield;
  const gm = new THREE.Mesh(mergeGeometries(glow), glowMat);
  sm.frustumCulled = gm.frustumCulled = false; group.add(sm, gm);

  const canvasTex = (draw, size = 128) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  const TEX = {
    stone: canvasTex((x, s) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const g = (i + j) % 2 ? 150 : 196; x.fillStyle = `rgb(${g + 6},${g},${g - 14})`; x.fillRect(i * s / 2, j * s / 2, s / 2, s / 2); x.strokeStyle = 'rgba(60,52,44,.55)'; x.lineWidth = 3; x.strokeRect(i * s / 2 + 1.5, j * s / 2 + 1.5, s / 2 - 3, s / 2 - 3); } }),
    wood: canvasTex((x, s) => { x.fillStyle = '#8a6238'; x.fillRect(0, 0, s, s); for (let i = 0; i < 4; i++) { const g = 100 + ((i * 53) % 40); x.fillStyle = `rgb(${g + 50},${g + 18},${g - 40})`; x.fillRect(0, i * s / 4 + 2, s, s / 4 - 4); x.strokeStyle = 'rgba(40,24,10,.7)'; x.lineWidth = 3; x.strokeRect(-2, i * s / 4, s + 4, s / 4); x.beginPath(); x.moveTo(((i * 37) % 90) + 10, i * s / 4); x.lineTo(((i * 37) % 90) + 10, (i + 1) * s / 4); x.stroke(); } }),
    marble: canvasTex((x, s) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const g = (i + j) % 2 ? 214 : 238; x.fillStyle = `rgb(${g},${g - 4},${g - 14})`; x.fillRect(i * s / 2, j * s / 2, s / 2, s / 2); x.strokeStyle = 'rgba(160,130,60,.8)'; x.lineWidth = 3; x.strokeRect(i * s / 2 + 1.5, j * s / 2 + 1.5, s / 2 - 3, s / 2 - 3); x.strokeStyle = 'rgba(120,120,130,.25)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(i * s / 2 + 8, j * s / 2 + 12); x.lineTo(i * s / 2 + 40, j * s / 2 + 44); x.stroke(); } }),
  };
  for (const k of Object.keys(flo)) {
    if (!flo[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(flo[k]), new THREE.MeshStandardMaterial({ map: TEX[k], roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.frustumCulled = false; group.add(m);
  }
  [...solid, ...glow].forEach(g => g.dispose()); Object.values(flo).forEach(a => a.forEach(g => g.dispose()));

  // ============================================================
  //  API
  // ============================================================
  const lx = x => x - PALACE.x, lz = z => z - PALACE.z;
  const api = {
    group, active: false,
    show(v) { group.visible = !!v; api.active = !!v; },
    addCircle(c, lvl = 0) { c.fl = lvl; npcCircles.push(c); },     // bulatan NPC (koordinat dunia, diperbarui NPC tiap frame)
    // dorong pemain keluar dari dinding & perabot (koordinat dunia). pos.y menentukan lantai.
    collide(pos, r) {
      const lvl = levelOf(pos.y), p = { x: lx(pos.x), z: lz(pos.z) };
      for (let it = 0; it < 2; it++) {
        for (const b of WALL_RECTS) if (!b.lvl || b.lvl === lvl) pushRect(p, r, b);
        for (const b of rects) if (!b.lvl || b.lvl === lvl) pushRect(p, r, b);
        for (const c of circles) if (!c.fl || c.fl === lvl) pushCircle(p, r, c);
      }
      pos.x = PALACE.x + p.x; pos.z = PALACE.z + p.z;
      for (const c of npcCircles) if (!c.fl || c.fl === lvl) pushCircle(pos, r, c);
    },
    groundY: (x, z, y) => groundY(lx(x), lz(z), y),      // tinggi lantai di titik dunia (x, z); y = tinggi pemain sekarang
    area: (x, z, y) => areaAt(lx(x), lz(z), y),
    // jepit posisi kamera supaya tak menembus dinding / langit-langit. from = titik pemain, to = posisi kamera yang diinginkan (diubah di tempat)
    clipCam(from, to) {
      const lvl = levelOf(from.y), ox = lx(from.x), oz = lz(from.z), tx = lx(to.x), tz = lz(to.z);
      let t = 1; for (const b of WALL_RECTS) if (!b.lvl || b.lvl === lvl) t = Math.min(t, rayRect(ox, oz, tx, tz, b, 0.3));
      if (t < 1) t = Math.max(0.12, t);
      to.x = from.x + (to.x - from.x) * t; to.z = from.z + (to.z - from.z) * t; to.y = from.y + (to.y - from.y) * t;
      const cy = Math.min(ceilAt(lx(to.x), lz(to.z), lvl) - 0.4, from.y + 3.5); if (to.y > cy) to.y = cy;   // dan tak lebih tinggi dari 3,5 m di atas lantai: lampu gantung menggantung di sekitar 4 m (lantai 1) / 9,6 m (aula tinggi)
      return to;
    },
  };
  return api;
}

// Versi sinkron (kompatibel dengan pemanggil lama): jalankan generator sampai selesai.
export function buildPalace() { const it = buildPalaceGen(); let r; while (!(r = it.next()).done); return r.value; }
