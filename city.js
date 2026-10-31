import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, PLAZA, STREETS, PAVE_RECTS, BUILDINGS, streetRect, toWorld } from './city-layout.js';

// ============================================================
//  Membangun Kota Arunika (dipanggil dari world.js). HANYA bangunan + lantai jalan batu.
//  Semua bagian bangunan digabung jadi beberapa mesh besar (warna lewat vertex color), dibagi 4 kuadran
//  supaya kamera hanya menggambar yang terlihat -> puluhan bangunan tetap ringan, juga di HP.
//  Gaya sama dengan desa: low-poly, flat shading, rangka kayu, atap limas / pelana.
// ============================================================
const STONE = 0x8d8a85, STONE_L = 0xb9b4a8, STONE_D = 0x6f6c68, DOOR = 0x5a3a22, DARK = 0x2a2220, SLATE = 0x4a5868, COPPER = 0x5f9a86, GOLD = 0xe0b33a;
const HALF_PI = Math.PI / 2;

export function buildCity({ colliders, COARSE = false }) {
  const group = new THREE.Group(); group.name = 'kota';
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa83a, emissiveIntensity: 0.55, roughness: 0.6, flatShading: true });

  // ---------- Penampung geometri: [kuadran][bahan] ----------
  const buckets = new Map();                                            // sel grid 36 m -> { solid, glass } (kota luas: hanya sel yang terlihat digambar)
  const bucketOf = b => { const k = Math.floor((b.u + 64) / 36) + ',' + Math.floor((b.v + 72) / 36); if (!buckets.has(k)) buckets.set(k, { solid: [], glass: [] }); return buckets.get(k); };
  let cur = null;                                                       // konteks bangunan yang sedang dibangun
  const tmpC = new THREE.Color(), q = new THREE.Quaternion(), eu = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), lm = new THREE.Matrix4();
  function put(geo, color, mat, x, y, z, rx = 0, ry = 0, rz = 0) {   // geo -> posisi/rotasi lokal -> matriks bangunan -> penampung
    const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv');
    lm.compose(new THREE.Vector3(x, y, z), q.setFromEuler(eu.set(rx, ry, rz)), one); g.applyMatrix4(lm); g.applyMatrix4(cur.m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3); tmpC.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); cur.bucket[mat].push(g);
  }
  // bentuk dasar (y = tengah / dasar sesuai nama)
  const box = (w, h, d, x, y, z, c, rx, ry, rz) => put(new THREE.BoxGeometry(w, h, d), c, 'solid', x, y, z, rx, ry, rz);
  const boxB = (w, h, d, x, yb, z, c) => box(w, h, d, x, yb + h / 2, z, c);
  const cylB = (r0, r1, h, x, yb, z, c, seg = 10) => put(new THREE.CylinderGeometry(r0, r1, h, seg), c, 'solid', x, yb + h / 2, z);
  const coneB = (r, h, x, yb, z, c, seg = 10) => put(new THREE.ConeGeometry(r, h, seg), c, 'solid', x, yb + h / 2, z);
  function gableGeo(span, len, rh, oh) {                                // atap pelana: bubungan sepanjang sumbu z
    const hs = span / 2 + oh, L = len + 2 * oh, s = new THREE.Shape(); s.moveTo(-hs, 0); s.lineTo(hs, 0); s.lineTo(0, rh); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }).translate(0, 0, -L / 2);
  }
  const gableX = (w, d, rh, oh, x, y, z, c) => put(gableGeo(d, w, rh, oh).rotateY(HALF_PI), c, 'solid', x, y, z);   // bubungan sepanjang x (lebar bangunan)
  const gableZ = (span, len, rh, oh, x, y, z, c) => put(gableGeo(span, len, rh, oh), c, 'solid', x, y, z);          // bubungan sepanjang z
  function hip(w, d, rh, oh, x, y, z, c) {                              // atap limas (4 sisi)
    const g = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4); g.scale((w / 2 + oh) / 0.7071, rh, (d / 2 + oh) / 0.7071); g.translate(0, rh / 2, 0);
    put(g, c, 'solid', x, y, z);
  }
  // jendela: bingkai kayu + kaca menyala. side: 0 depan(+z), 1 belakang, 2 kanan(+x), 3 kiri(-x); pos = geser sepanjang dinding
  function windowAt(w, d, side, pos, yc, ww, wh, trim, oz = 0) {
    const hx = w / 2, hz = d / 2, [px, pz, ry] = side === 0 ? [pos, hz, 0] : side === 1 ? [pos, -hz, Math.PI] : side === 2 ? [hx, pos, HALF_PI] : [-hx, pos, -HALF_PI];
    const nx = Math.sin(ry), nz = Math.cos(ry), qz = pz + oz;
    put(new THREE.PlaneGeometry(ww + 0.26, wh + 0.26), trim, 'solid', px + nx * 0.012, yc, qz + nz * 0.012, 0, ry, 0);
    put(new THREE.PlaneGeometry(ww, wh), 0xffffff, 'glass', px + nx * 0.026, yc, qz + nz * 0.026, 0, ry, 0);
  }
  function windowRow(w, d, side, yc, ww, wh, trim, skipMid = 0, step = 2.4, oz = 0) {
    const L = side < 2 ? w : d, n = Math.max(1, Math.floor((L - 1) / step)), sp = L / n;
    for (let k = 0; k < n; k++) { const pos = (k - (n - 1) / 2) * sp; if (skipMid && Math.abs(pos) < skipMid) continue; windowAt(w, d, side, pos, yc, ww, wh, trim, oz); }
  }
  const sides = COARSE ? [0] : [0, 1, 2, 3];
  const crenel = (w, d, y, c, step = 1.5, oz = 0) => {                          // gigi-gigi benteng di tepi atap datar
    for (let x = -w / 2 + 0.4; x <= w / 2 - 0.39; x += step) for (const z of [-d / 2 + 0.4, d / 2 - 0.4]) boxB(0.7, 0.9, 0.7, x, y, z + oz, c);
    for (let z = -d / 2 + 0.4 + step; z < d / 2 - 0.4 - 0.2; z += step) for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) boxB(0.7, 0.9, 0.7, x, y, z + oz, c);
  };

  // ---------- Rumah, toko, penginapan, aula, menara ----------
  function house(b) {
    const { w, d, floors, trim } = b, PL = 0.45, fh = b.kind === 'hall' ? 4.4 : b.kind === 'tower' ? 3.0 : 2.8, H = PL + floors * fh, tower = b.kind === 'tower';
    boxB(w + 0.3, PL, d + 0.3, 0, 0, 0, STONE);
    for (let f = 0; f < floors; f++) {
      boxB(w, fh, d, 0, PL + f * fh, 0, f === 0 && b.stoneBase ? STONE_L : b.wall);
      boxB(w + 0.14, 0.16, d + 0.14, 0, PL + (f + 1) * fh - 0.16, 0, trim);          // balok antar lantai
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxB(0.22, H - PL, 0.22, sx * w / 2, PL, sz * d / 2, trim);   // tiang sudut
    let rh;
    if (b.roofKind === 'gable') { rh = Math.min(3.0, d * 0.42 + 0.4); gableX(w, d, rh, 0.45, 0, H, 0, b.roof); }
    else { rh = tower ? w * 1.15 : 1.7 + (b.seed % 5) * 0.12; hip(w, d, rh, tower ? 0.35 : 0.45, 0, H, 0, b.roof); }
    if (!tower) boxB(0.7, rh + 0.9, 0.7, w * 0.27, H, -d * 0.18, STONE_D);          // cerobong
    else { boxB(w + 0.5, 0.25, d + 0.5, 0, H - 0.25, 0, STONE_D); }
    // pintu depan (+z lokal)
    const dw = b.kind === 'inn' || b.kind === 'hall' ? 1.9 : 1.0, fz = d / 2;
    boxB(dw, 2.05, 0.14, 0, PL, fz + 0.02, DOOR); boxB(dw + 0.4, 0.14, 0.2, 0, PL + 2.05, fz + 0.04, trim); boxB(dw + 0.5, 0.14, 0.55, 0, 0, fz + 0.3, STONE);
    if (b.kind === 'shop') box(w * 0.7, 0.1, 1.4, 0, PL + 2.55, fz + 0.62, b.awning, 0.28, 0, 0);   // kanopi toko
    // jendela
    const sk = dw / 2 + 0.7;
    for (let f = 0; f < floors; f++) {
      const yc = PL + f * fh + fh * (b.kind === 'hall' ? 0.62 : 0.58), ww = tower ? 0.7 : 0.8, wh = b.kind === 'hall' ? 1.5 : 1.0;
      for (const s of sides) windowRow(w, d, s, yc, ww, wh, trim, s === 0 && f === 0 ? sk : 0, tower ? 2.2 : 2.4);
    }
    if (b.kind === 'inn') { boxB(1.5, 0.6, 0.12, w * 0.32, PL + 2.55, fz + 0.4, trim); }  // papan penginapan
    return [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  }

  // ---------- Balai Kota + menara jam ----------
  function townhall(b) {
    const { w, d } = b, PL = 0.6, fh = 3.7, H = PL + 2 * fh, WALL = 0xd8cba8, TRIM = 0x5b3d22;
    boxB(w + 0.6, PL, d + 0.6, 0, 0, 0, STONE);
    for (let f = 0; f < 2; f++) { boxB(w, fh, d, 0, PL + f * fh, 0, f === 0 ? STONE_L : WALL); boxB(w + 0.2, 0.2, d + 0.2, 0, PL + (f + 1) * fh - 0.2, 0, TRIM); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxB(0.4, H - PL, 0.4, sx * w / 2, PL, sz * d / 2, STONE_D);
    gableX(w, d, 4.6, 0.6, 0, H, 0, 0x8a3b2c);
    for (const x of [-6.5, 6.5]) boxB(0.9, 6.5, 0.9, x, H, -1.5, STONE_D);          // cerobong
    // menara jam di tengah depan
    const tw = 5, tz = d / 2 - tw / 2 + 0.6, TH = 17;
    boxB(tw, TH, tw, 0, PL, tz, WALL); boxB(tw + 0.3, 0.3, tw + 0.3, 0, PL + TH - 0.3, tz, STONE_D); boxB(tw + 0.3, 0.3, tw + 0.3, 0, H, tz, STONE_D);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxB(0.35, TH - 0.4, 0.35, sx * tw / 2, PL, tz + sz * tw / 2, STONE_D);
    hip(tw, tw, 6.5, 0.5, 0, PL + TH, tz, COPPER); coneB(0.12, 2.2, 0, PL + TH + 6.5, tz, GOLD, 6);
    const cy = PL + TH - 3.4;                                                       // jam di empat sisi
    for (let k = 0; k < 4; k++) {
      const ry = k * HALF_PI, nx = Math.sin(ry), nz = Math.cos(ry), off = tw / 2 + 0.08;
      put(new THREE.CylinderGeometry(1.3, 1.3, 0.14, 20).rotateX(HALF_PI), 0xf3ead2, 'solid', nx * off, cy, tz + nz * off, 0, ry, 0);
      put(new THREE.BoxGeometry(0.1, 0.95, 0.06), DARK, 'solid', nx * (off + 0.09), cy + 0.35, tz + nz * (off + 0.09), 0, ry, 0);
      put(new THREE.BoxGeometry(0.7, 0.1, 0.06), DARK, 'solid', nx * (off + 0.09) + Math.cos(ry) * 0.3, cy, tz + nz * (off + 0.09) - Math.sin(ry) * 0.3, 0, ry, 0);
      if (!COARSE || k === 0) put(new THREE.PlaneGeometry(0.9, 1.6), 0xffffff, 'glass', nx * (tw / 2 + 0.03), PL + TH - 8.3, tz + nz * (tw / 2 + 0.03), 0, ry, 0);
    }
    // serambi depan: tangga, pintu besar, atap tiang
    const fz = d / 2;
    boxB(2.4, 3.3, 0.16, 0, PL, fz + 0.04, DOOR); boxB(2.9, 0.2, 0.22, 0, PL + 3.3, fz + 0.06, TRIM);
    for (let i = 0; i < 3; i++) { const dp = 2.4 - 0.7 * i; boxB(8.4 - 0.8 * i, (i + 1) * 0.2, dp, 0, 0, fz + dp / 2, STONE_L); }   // tiga anak tangga naik ke pintu
    boxB(9.6, 0.35, 2.4, 0, PL + 4.2, fz + 1.4, 0xa8472e);
    for (const x of [-3.6, -1.8, 1.8, 3.6]) cylB(0.3, 0.34, 3.7, x, PL + 0.05, 6.5, STONE_L, 8);
    // jendela besar
    for (const f of [0, 1]) for (const x of [-8.4, -6.2, 6.2, 8.4]) windowAt(w, d, 0, x, PL + f * fh + 2.0, 0.95, 1.5, TRIM);
    for (const s of (COARSE ? [] : [1, 2, 3])) windowRow(w, d, s, PL + fh * 1.5 + 0.2, 0.9, 1.4, TRIM, 0, 3);
    return null;
  }

  // ---------- Katedral ----------
  function cathedral(b) {
    const WALL = 0xcfc9bb, TRIM = 0xb0aa9b, ROOF = SLATE;
    boxB(12.6, 0.5, 18, 0, 0, 0, STONE);
    // nave tengah (z -5 .. 2.5) + serambi samping + apse bulat di belakang
    boxB(7, 9, 7.5, 0, 0.5, -1.25, WALL); gableZ(7, 7.5, 3.2, 0.4, 0, 9.5, -1.25, ROOF);
    for (const sx of [-1, 1]) { boxB(2.6, 5.5, 7.5, sx * 4.8, 0.5, -1.25, WALL); gableZ(2.6, 7.5, 1.3, 0.3, sx * 4.8, 6, -1.25, ROOF); }
    cylB(3.5, 3.5, 9, 0, 0.5, -5, WALL, 12); coneB(4.0, 4.6, 0, 9.5, -5, ROOF, 12);
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) boxB(0.45, 5.2, 0.7, sx * 6.25, 0.5, -4 + i * 2.3, TRIM);   // penopang
    // menara lonceng di depan + menara runcing
    const tz = 5.5;
    boxB(6, 15, 6, 0, 0.5, tz, WALL); boxB(6.4, 0.4, 6.4, 0, 15.1, tz, TRIM);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxB(0.7, 15, 0.7, sx * 3, 0.5, tz + sz * 3, TRIM);
    boxB(4.6, 4.8, 4.6, 0, 15.5, tz, WALL); boxB(5.0, 0.35, 5.0, 0, 20.3, tz, TRIM);
    coneB(3.3, 11, 0, 20.65, tz, ROOF, 8); coneB(0.18, 3, 0, 31.6, tz, GOLD, 6); box(0.12, 1.5, 0.12, 0, 35.3, tz, GOLD); box(0.8, 0.12, 0.12, 0, 35.6, tz, GOLD);
    for (let k = 0; k < 4; k++) { const ry = k * HALF_PI, nx = Math.sin(ry), nz = Math.cos(ry);   // lubang lonceng di empat sisi
      box(1.3, 2.6, 0.12, nx * 2.33, 17.8, tz + nz * 2.33, DARK, 0, ry, 0); }
    // pintu besar, jendela mawar & jendela tinggi
    const fz = tz + 3;
    boxB(2.6, 4.2, 0.18, 0, 0.5, fz + 0.04, DOOR); boxB(3.2, 0.3, 0.3, 0, 4.7, fz + 0.06, TRIM);
    for (let i = 0; i < 3; i++) { const dp = 1.5 - 0.4 * i; boxB(4.6 - 0.5 * i, (i + 1) * 0.1667, dp, 0, 0, fz + dp / 2, STONE_L); }   // anak tangga
    put(new THREE.CircleGeometry(1.35, 16), 0xffffff, 'glass', 0, 9.4, fz + 0.05);
    for (const sx of [-1, 1]) put(new THREE.PlaneGeometry(0.9, 3.4), 0xffffff, 'glass', sx * 1.9, 11.5, fz + 0.05);
    const sidesC = COARSE ? [2] : [2, 3];
    for (const sd of sidesC) { const nx = sd === 2 ? 1 : -1, ry = sd === 2 ? HALF_PI : -HALF_PI;
      for (let i = 0; i < 3; i++) put(new THREE.PlaneGeometry(0.9, 2.6), 0xffffff, 'glass', nx * 3.53, 7.7, -3.9 + i * 2.6, 0, ry, 0);               // jendela atas nave
      for (let i = 0; i < 3; i++) put(new THREE.PlaneGeometry(0.9, 2.4), 0xffffff, 'glass', nx * 6.13, 3.2, -3.4 + i * 2.6, 0, ry, 0); }
    return null;
  }

  // ---------- Istana ----------
  function castle(b) {
    const WALL = 0xb8b2a3, TRIM = 0x8a8478, MW = 26, MD = 16, MZ = -1.5, MH = 12;      // blok utama: lebar 26, dalam 16, tengah z=-1.5
    boxB(MW + 0.6, 0.6, MD + 0.6, 0, 0, MZ, STONE_D);
    boxB(MW, MH, MD, 0, 0.6, MZ, WALL); boxB(MW + 0.5, 0.45, MD + 0.5, 0, 0.6 + MH - 0.45, MZ, TRIM); boxB(MW + 0.3, 0.3, MD + 0.3, 0, 4.6, MZ, TRIM);
    crenel(MW + 0.2, MD + 0.2, 0.6 + MH, TRIM, 1.6, MZ);
    // menara penjaga bulat di empat sudut (atap kerucut berwarna)
    for (const [cx, cz] of [[-13, -9.5], [13, -9.5], [-13, 6.5], [13, 6.5]]) {
      cylB(3.2, 3.4, 17, cx, 0, cz, WALL, 14); cylB(3.6, 3.6, 0.5, cx, 16.2, cz, TRIM, 14); coneB(4.3, 6.5, cx, 17, cz, 0x7b3b2a, 14); coneB(0.1, 1.6, cx, 23.4, cz, GOLD, 6);
      for (let k = 0; k < 4; k++) { const a = k * HALF_PI + 0.4; put(new THREE.PlaneGeometry(0.7, 1.4), 0xffffff, 'glass', cx + Math.sin(a) * 3.25, 12.5, cz + Math.cos(a) * 3.25, 0, a, 0); }
    }
    // donjon (menara pusat) di atas blok utama
    boxB(11, 8, 9, 0, 0.6 + MH, -3.5, 0xc4beaf); boxB(11.4, 0.4, 9.4, 0, 0.6 + MH + 8, -3.5, TRIM); hip(11, 9, 5.2, 0.5, 0, 0.6 + MH + 8.4, -3.5, 0x3d4a5c);
    cylB(0.07, 0.07, 3.4, 0, 0.6 + MH + 13.6, -3.5, TRIM, 5); box(1.8, 1.0, 0.05, 0.9, 0.6 + MH + 16.2, -3.5, 0xa8301f);
    for (const x of [-3.3, 0, 3.3]) put(new THREE.PlaneGeometry(0.9, 1.6), 0xffffff, 'glass', x, 0.6 + MH + 4, -3.5 + 4.53);
    // gerbang (gatehouse) di depan
    const gz = 8;
    boxB(7.4, 14, 3.2, 0, 0.6, gz, WALL); boxB(8.0, 0.5, 3.8, 0, 14.6 - 0.5, gz, TRIM); crenel(8.0, 3.8, 14.6, TRIM, 1.5, gz);
    boxB(3.4, 4.8, 0.2, 0, 0.6, gz + 1.62, DARK); boxB(4.0, 0.35, 0.35, 0, 5.4, gz + 1.65, TRIM); for (const x of [-1.5, -0.5, 0.5, 1.5]) boxB(0.08, 4.8, 0.06, x, 0.6, gz + 1.76, STONE_D);
    for (const sx of [-1, 1]) { box(1.5, 4.2, 0.08, sx * 2.45, 9.4, gz + 1.65, 0xa8301f); put(new THREE.PlaneGeometry(0.8, 1.5), 0xffffff, 'glass', sx * 2.45, 12.4, gz + 1.65); }
    // jendela di dinding depan, belakang & samping blok utama
    for (const y of [4.2, 8.6]) for (const x of [-8, -5.5, 5.5, 8]) windowAt(MW, MD, 0, x, y, 0.9, 1.5, TRIM, MZ);
    for (const s of (COARSE ? [] : [1])) for (const y of [4.2, 8.6]) windowRow(MW, MD, s, y, 0.9, 1.5, TRIM, 0, 3.6, MZ);
    return null;
  }

  // ---------- Bangun semuanya ----------
  const FNS = { townhall, cathedral, castle };
  for (const b of BUILDINGS) {
    const w = toWorld(b, 0, 0), m = new THREE.Matrix4().compose(new THREE.Vector3(w.x, 0, w.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.yaw, 0)), one);
    cur = { m, bucket: bucketOf(b) };
    (FNS[b.kind] || house)(b);
    // tabrakan: lingkaran-lingkaran kecil sepanjang tepi dalam setiap jejak bangunan (pemain tidak tembus dinding, tapi tidak "melayang" jauh dari dinding)
    for (const r of b.rects) {
      const i = 1.0, mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
      const x0 = r.x1 - r.x0 > 2 * i ? r.x0 + i : mx, x1 = r.x1 - r.x0 > 2 * i ? r.x1 - i : mx, z0 = r.z1 - r.z0 > 2 * i ? r.z0 + i : mz, z1 = r.z1 - r.z0 > 2 * i ? r.z1 - i : mz;
      const edge = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.8)); for (let k = 0; k < n; k++) { const p = toWorld(b, ax + (bx - ax) * k / n, az + (bz - az) * k / n); colliders.push({ x: p.x, z: p.z, r: 0.9 }); } };
      edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
    }
    for (const c of b.circles) { const p = toWorld(b, c.x, c.z); colliders.push({ x: p.x, z: p.z, r: c.r }); }
  }
  buckets.forEach(bk => {
    for (const [key, mat] of [['solid', solidMat], ['glass', glassMat]]) {
      if (!bk[key].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(bk[key]), mat); mesh.castShadow = key === 'solid'; mesh.receiveShadow = true; group.add(mesh);
      bk[key].forEach(g => g.dispose());
    }
  });

  // ---------- Lantai jalan batu: satu bidang bertekstur (peta jalan digambar di canvas, tepinya halus) ----------
  { const PX = 8, U0 = -60, U1 = 100, V0 = -70, V1 = 70, W = (U1 - U0) * PX, Hh = (V1 - V0) * PX;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const cob = mk(W, Hh), cx = cob.getContext('2d'); let seed = 1337; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    cx.fillStyle = '#6f6a62'; cx.fillRect(0, 0, W, Hh);                              // celah antar batu
    for (let y = 0, row = 0; y < Hh; y += 5, row++) { const hh = 4; for (let x = -(row % 2) * 4; x < W; ) { const ww = 3.5 + rr() * 5, g = 128 + rr() * 52 | 0; cx.fillStyle = `rgb(${g + 8},${g + 2},${g - 12})`; cx.fillRect(x + 0.5, y + 0.5, ww - 1, hh); x += ww; } }
    const mask = mk(W, Hh), mx = mask.getContext('2d'); mx.fillStyle = '#000';
    const P = (u, v) => [(u - U0) * PX, (v - V0) * PX];
    for (const s of STREETS) { const r = streetRect(s), [a, b] = P(r.u0, r.v0), [c, d] = P(r.u1, r.v1); mx.fillRect(a, b, c - a, d - b); }
    for (const r of PAVE_RECTS) { const [a, b] = P(r.u0, r.v0), [c, d] = P(r.u1, r.v1); mx.fillRect(a, b, c - a, d - b); }
    { const [a, b] = P(PLAZA.u, PLAZA.v); mx.beginPath(); mx.arc(a, b, PLAZA.r * PX, 0, 7); mx.fill(); }
    cx.globalCompositeOperation = 'destination-in'; cx.drawImage(mask, 0, 0);
    const tex = new THREE.CanvasTexture(cob); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(U1 - U0, V1 - V0).rotateX(-HALF_PI),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    floor.position.set(CITY.x + (U0 + U1) / 2, 0.03, CITY.z + (V0 + V1) / 2); floor.receiveShadow = true;
    floor.renderOrder = -5;   // lantai transparan HARUS digambar paling awal; kalau tidak, urutan jarak membuatnya menimpa efek skill (aura/cincin) yang digambar sebelumnya
    group.add(floor);
  }

  return { group };
}
