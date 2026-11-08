// ============================================================
//  KOTA KEKAISARAN — data tata letak (murni angka, tanpa THREE)
//  Kota berbentuk SEGI LIMA beraturan di ujung Ladang Sawah Gemah Ripah, dikelilingi tembok dengan 5 gerbang, 5 distrik,
//  jalan lingkar, dan istana di tengahnya (istana kekaisaran berdiri di tapaknya).
//  Tahap sekarang: tembok + 5 gerbang + jalan + Distrik 1 (Military Quarter) + Distrik 2 (Merchant Quarter) + Distrik 3 (Noble Quarter) + Distrik 4 (Academy Quarter) + Distrik 5 (Administration Quarter) lengkap TANPA NPC. Kelima distrik sudah dibangun.
//  Dipakai oleh kekaisaran.js (isi kota), world.js (chunk), forest-layout.js (batas dunia) dan game.js (pesan masuk).
//
//  KERANGKA KOORDINAT KOTA (lokal): x = ke depan (searah jalan ladang, "utara" di gambar denah), z = ke kanan (sisi kanan saat menghadap timur = "timur" di gambar).
//  Titik (0,0) = pusat istana. Gerbang Utama ada di sisi belakang (x = -APOTHEM), menghadap jalan ladang; puncak segi lima (Distrik 1) ada di ujung depan (x = +R).
//  Sudut φ diukur dari sumbu +x ke arah +z. Distrik k berpusat pada titik sudut ke-k: φ = k·72° (Distrik 1 = 0°, 2 = 72°, 3 = 144°, 4 = 216°, 5 = 288°).
//  Gerbang & jalan radial ada di tengah sisi: φ = (k + 0.5)·72°.
// ============================================================
import { SAWAH_LEN, sroadAt, KEKAISARAN } from './sawah-layout.js';

export const EMPIRE = { name: KEKAISARAN.name, R: 180 };          // R = jari-jari lingkaran luar (titik sudut) segi lima
const D2R = Math.PI / 180;
export const R = EMPIRE.R;
export const APOTHEM = R * Math.cos(36 * D2R);                    // jarak pusat -> tengah sisi (≈145,6 m)
export const SIDE = 2 * R * Math.sin(36 * D2R);                   // panjang tiap sisi tembok (≈211 m)
export const WALL = { t: 3.8, h: 9.5, towerR: 5.6, towerH: 16 };  // tembok: tebal, tinggi; menara di tiap titik sudut
export const RING = { r: 66, w: 9 };                              // jalan lingkar mengelilingi istana
export const PLAZA_R = 58;                                        // lantai batu di dalam jalan lingkar (halaman istana)
export const PALACE_SITE = { r: 36 };                             // tapak istana (Istana Kekaisaran)
export const ROAD_W = 9;                                          // lebar jalan radial ke gerbang samping
export const AVENUE_W = 15;                                       // lebar jalan raya Gerbang Utama -> istana
export const GATES = [   // gerbang di tengah sisi k (sisi k = antara titik sudut k dan k+1)
  { k: 0, id: 'timur-laut', name: 'Gerbang Timur Laut', gap: 8,  open: false },
  { k: 1, id: 'timur',      name: 'Gerbang Timur',      gap: 8,  open: false },
  { k: 2, id: 'utama',      name: 'Gerbang Utama',      gap: 11, open: true  },
  { k: 3, id: 'barat',      name: 'Gerbang Barat',      gap: 8,  open: false },
  { k: 4, id: 'barat-laut', name: 'Gerbang Barat Laut', gap: 8,  open: true  },   // dibuka: lorong bebas (tanpa daun pintu & tabrakan); di luarnya terbentang Dataran Barat Laut (NW_PLAIN)
].map(g => { const psi = (g.k + 0.5) * 72 * D2R; return { ...g, psi, x: APOTHEM * Math.cos(psi), z: APOTHEM * Math.sin(psi) }; });

export const DISTRICTS = [
  { n: 1, id: 'militer',    name: 'Distrik 1', sub: 'Military Quarter',       built: true  },
  { n: 2, id: 'pedagang',   name: 'Distrik 2', sub: 'Merchant Quarter',       built: true  },
  { n: 3, id: 'bangsawan',  name: 'Distrik 3', sub: 'Noble Quarter',          built: true  },
  { n: 4, id: 'akademi',    name: 'Distrik 4', sub: 'Academy Quarter',        built: true  },
  { n: 5, id: 'administrasi', name: 'Distrik 5', sub: 'Administration Quarter', built: true  },
];
export const VERTS = [0, 1, 2, 3, 4].map(k => ({ x: R * Math.cos(k * 72 * D2R), z: R * Math.sin(k * 72 * D2R) }));

// ---------- Penempatan di dunia ----------
// Jalan ladang berakhir di E; Gerbang Utama ada 24 m di depannya, pusat kota APOTHEM di depan gerbang.
const E = sroadAt(SAWAH_LEN), FWD = { x: E.tx, z: E.tz }, RGT = { x: -E.tz, z: E.tx };
export const GATE_OFFSET = 24;
export const EMPIRE_C = { x: E.x + FWD.x * (GATE_OFFSET + APOTHEM), z: E.z + FWD.z * (GATE_OFFSET + APOTHEM) };
export const EMPIRE_YAW = Math.atan2(-FWD.z, FWD.x);               // rotation.y grup kota: sumbu-x lokal = ke depan, sumbu-z lokal = ke kanan
export const EMPIRE_E = { x: E.x, z: E.z, tx: E.tx, tz: E.tz };    // ujung jalan ladang
export const toWorld = (lx, lz) => ({ x: EMPIRE_C.x + FWD.x * lx + RGT.x * lz, z: EMPIRE_C.z + FWD.z * lx + RGT.z * lz });
export const toLocal = (x, z) => { const dx = x - EMPIRE_C.x, dz = z - EMPIRE_C.z; return { x: dx * FWD.x + dz * FWD.z, z: dx * RGT.x + dz * RGT.z }; };
export const MAIN_GATE_WORLD = (() => { const g = GATES[2], p = toWorld(g.x, g.z); return { x: p.x, z: p.z, tx: FWD.x, tz: FWD.z }; })();

// ---------- Area jelajah (lingkaran, dunia) ----------
// Lingkaran pusat memuat hampir seluruh segi lima; lingkaran kecil mengisi sudut-sudutnya; koridor dari ujung ladang sampai Gerbang Utama.
export const KEKAISARAN_CIRCLES = [];
{
  const inset = WALL.t / 2 + 0.5;
  const add = (lx, lz, r) => { const p = toWorld(lx, lz); KEKAISARAN_CIRCLES.push({ x: p.x, z: p.z, r }); };
  add(0, 0, APOTHEM - inset);
  for (let k = 0; k < 5; k++) {
    const a = k * 72 * D2R;
    for (const d of [104, 128, 150]) add(d * Math.cos(a), d * Math.sin(a), APOTHEM - d * Math.cos(36 * D2R) - inset);
  }
  for (const s of [-34, -20, -8]) { const p = sroadAt(SAWAH_LEN + s); KEKAISARAN_CIRCLES.push({ x: p.x, z: p.z, r: 20 }); }   // koridor (menyambung dengan lingkaran ujung ladang)
  { const g = GATES[2], p = toWorld(g.x, g.z); KEKAISARAN_CIRCLES.push({ x: p.x, z: p.z, r: 12 }); }
  { const g = GATES[2], p = toWorld(g.x - GATE_OFFSET / 2, g.z); KEKAISARAN_CIRCLES.push({ x: p.x, z: p.z, r: 14 }); }
}
export const KEKAISARAN_CITY_CIRCLES = KEKAISARAN_CIRCLES.slice();   // lingkaran kota saja (tanpa dataran): dipakai chunk 'kekaisaran' di world.js
// ---------- DATARAN BARAT LAUT: hamparan datar sejauh 400 m di luar Gerbang Barat Laut (k = 4, φ = -36°) ----------
//  Jarak d diukur dari pusat istana searah sumbu gerbang; gerbang ada di d = APOTHEM, ujung dataran di d = APOTHEM + len. Lebar total = 2·halfW.
export const NW_PLAIN = { len: 400, halfW: 55, step: 28, psi: GATES[4].psi };
export const NW_PLAIN_CIRCLES = [];
{
  const u = { x: Math.cos(NW_PLAIN.psi), z: Math.sin(NW_PLAIN.psi) }, r = NW_PLAIN.halfW + 4;   // lingkaran r = halfW + 4 yang saling tumpang-tindih menutup pita selebar 2·halfW tanpa celah
  const d0 = APOTHEM + 10, d1 = APOTHEM + NW_PLAIN.len - r, n = Math.ceil((d1 - d0) / NW_PLAIN.step);
  const nrm = { x: -u.z, z: u.x }, add = (d, off, rr) => { const p = toWorld(u.x * d + nrm.x * off, u.z * d + nrm.z * off); NW_PLAIN_CIRCLES.push({ x: p.x, z: p.z, r: rr }); };
  for (let i = 0; i <= n; i++) add(d0 + (d1 - d0) * i / n, 0, r);
  for (let off = -NW_PLAIN.halfW + 4; off <= NW_PLAIN.halfW - 4 + 0.01; off += 22) add(APOTHEM + NW_PLAIN.len - 34, off, 34);   // baris lingkaran kecil di ujung supaya ujung dataran rata (tidak membulat)
}
KEKAISARAN_CIRCLES.push(...NW_PLAIN_CIRCLES);   // ikut area jelajah (batas dunia / kekaisaranDist); chunk-nya sendiri: 'dataran-bl' di world.js (area muat terpisah dari kota)
// koordinat sumbu dataran dari titik dunia: d = jarak searah gerbang (dari pusat istana), off = geser ke samping sumbu
export function nwPlainAxis(x, z) {
  const p = toLocal(x, z), c = Math.cos(NW_PLAIN.psi), s = Math.sin(NW_PLAIN.psi);
  return { d: p.x * c + p.z * s, off: -p.x * s + p.z * c };
}
export function inNwPlain(x, z, m = 0) {   // titik dunia ada di dalam dataran (m > 0 = diperlebar m meter, untuk histeresis pesan)
  const a = nwPlainAxis(x, z);
  return a.d > APOTHEM + 3 - m && a.d < APOTHEM + NW_PLAIN.len + m && Math.abs(a.off) < NW_PLAIN.halfW + m;
}
// ---------- KOTA DUNGEON: kota kecil di ujung Padang Rumput Barat Laut (melanjutkan sumbu padang; chunk 'kota-dungeon') ----------
//  d0 = ujung padang; kota membentang len m ke depan selebar 2·halfW; setelah kota tebing menyempit jadi Lembah Bebatuan; Gerbang Dungeon (portal) ada di ujung lembah, d = gateD. Di belakang gerbang tidak bisa dijelajahi.
export const NW_TOWN = { d0: APOTHEM + NW_PLAIN.len, len: 480, halfW: 92, gateD: APOTHEM + NW_PLAIN.len + 455, valley: { a: 140, b: 210, halfW: 24 } };   // valley: Lembah Bebatuan — tebing mulai menyempit di d0 + a, selebar 2·halfW mulai d0 + b, berujung di Gerbang Dungeon (gateD)
export const NW_TOWN_CIRCLES = [];
{
  const u = { x: Math.cos(NW_PLAIN.psi), z: Math.sin(NW_PLAIN.psi) }, nrm = { x: -u.z, z: u.x };
  for (let i = 0; i < 6; i++) for (let off = -60; off <= 60; off += 30) {   // kisi lingkaran r = 32 jarak 30 m: menutup pita selebar ±92 tanpa celah
    const d = NW_TOWN.d0 + 22 + 30 * i, p = toWorld(u.x * d + nrm.x * off, u.z * d + nrm.z * off);
    NW_TOWN_CIRCLES.push({ x: p.x, z: p.z, r: 32 });
  }
  for (let d = NW_TOWN.d0 + 196; d <= NW_TOWN.gateD + 6; d += 18) { const p = toWorld(u.x * d, u.z * d); NW_TOWN_CIRCLES.push({ x: p.x, z: p.z, r: 40 }); }   // koridor Lembah Bebatuan sampai Gerbang Dungeon (r = 40 supaya relung gerbang samping ikut terjangkau; batas sempitnya dijaga tabrakan tebing di kota-dungeon.js)
}
KEKAISARAN_CIRCLES.push(...NW_TOWN_CIRCLES);   // ikut area jelajah (batas dunia / kekaisaranDist); chunk-nya sendiri: 'kota-dungeon' di world.js
export function inNwTown(x, z, m = 0) {   // titik dunia ada di dalam kota dungeon (m > 0 = diperlebar m meter, untuk histeresis pesan)
  const a = nwPlainAxis(x, z);
  return a.d > NW_TOWN.d0 + 4 - m && a.d < NW_TOWN.d0 + NW_TOWN.len + m && Math.abs(a.off) < NW_TOWN.halfW + m;
}
export function nwAxisToWorld(d, off = 0) {   // koordinat sumbu (d, off) kota/padang barat laut -> titik dunia
  const c = Math.cos(NW_PLAIN.psi), s = Math.sin(NW_PLAIN.psi);
  return toWorld(c * d - s * off, s * d + c * off);
}
export function kekaisaranDist(x, z) {   // negatif = di dalam area jelajah kota
  let m = Infinity;
  for (let i = 0; i < KEKAISARAN_CIRCLES.length; i++) { const c = KEKAISARAN_CIRCLES[i], d = Math.hypot(x - c.x, z - c.z) - c.r; if (d < m) m = d; }
  return m;
}
// apakah titik dunia berada di dalam tembok (segi lima)
export function insideWalls(x, z, inset = 0) {
  const p = toLocal(x, z); return insidePoly(p.x, p.z, inset);
}
export function insidePoly(lx, lz, inset = 0) {
  for (let k = 0; k < 5; k++) { const psi = (k + 0.5) * 72 * D2R; if (lx * Math.cos(psi) + lz * Math.sin(psi) > APOTHEM - inset) return false; }
  return true;
}
// nomor distrik (1..5) tempat titik dunia berada; 0 = halaman istana / jalan lingkar; -1 = di luar tembok
export function districtAt(x, z) {
  const p = toLocal(x, z); if (!insidePoly(p.x, p.z, 0)) return -1;
  if (Math.hypot(p.x, p.z) < RING.r + RING.w / 2 + 1) return 0;
  let a = Math.atan2(p.z, p.x) / D2R; if (a < 0) a += 360;
  return (Math.round(a / 72) % 5) + 1;
}

// ============================================================
//  DISTRIK 1 — MILITARY QUARTER (kerangka lokal)
//  Wilayah: baji antara jalan radial Gerbang Barat Laut (φ = -36°) dan Gerbang Timur Laut (φ = +36°), dari jalan lingkar sampai tembok.
// ============================================================
const T36 = Math.tan(36 * D2R);
// jarak (m) titik ke garis tengah jalan radial φ (tanda: + = sisi searah +z dari garis)
const radialSigned = (x, z, deg) => { const a = deg * D2R; return -x * Math.sin(a) + z * Math.cos(a); };
// titik (x,z) lokal ada di wilayah dalam Distrik 1 dengan jarak aman `m` dari jalan radial, jalan lingkar, dan tembok?
export function inD1(x, z, m = 0) {
  if (!insidePoly(x, z, WALL.t / 2 + 0.4 + m)) return false;
  if (Math.hypot(x, z) < RING.r + RING.w / 2 + m) return false;
  if (radialSigned(x, z, 36) > -(ROAD_W / 2 + m)) return false;      // sisi NE jalan radial +36°
  if (radialSigned(x, z, -36) < (ROAD_W / 2 + m)) return false;      // sisi NW jalan radial -36°
  return true;
}

export const D1 = {
  avenue: { w: 11, x0: RING.r, x1: 150 },                            // jalan utama dari jalan lingkar ke lapangan apel (di sumbu x)
  parade: { x: 120, z: 0, w: 36, d: 56 },                            // lapangan apel (batu): w = panjang searah x, d = lebar searah z
  canal:  { x0: 78, x1: 99, off: 7.4, w: 1.5 },                      // dua saluran air di tepi jalan utama (z = ±off), jembatan batu di tengahnya
  hq:     { id: 'markas', kind: 'hq', name: 'Markas Komando', x: 157, z: 0, w: 26, d: 12, face: Math.PI },
  buildings: [
    { id: 'barak-1', kind: 'barracks', name: 'Barak Pasukan I',   x: 106, z: -50, w: 22, d: 11, face:  Math.PI / 2 },
    { id: 'barak-2', kind: 'barracks', name: 'Barak Pasukan II',  x: 106, z:  50, w: 22, d: 11, face: -Math.PI / 2 },
    { id: 'barak-3', kind: 'barracks', name: 'Barak Pasukan III', x: 130, z: -40, w: 20, d: 11, face:  Math.PI / 2 },
    { id: 'barak-4', kind: 'barracks', name: 'Barak Pasukan IV',  x: 130, z:  40, w: 20, d: 11, face: -Math.PI / 2 },
    { id: 'gudang',  kind: 'armory',   name: 'Gudang Senjata',    x: 146, z:  24, w: 12, d: 9,  face: Math.PI },
    { id: 'kandang', kind: 'stable',   name: 'Kandang Kuda',      x: 146, z: -24, w: 12, d: 9,  face: Math.PI },
    { id: 'tempa',   kind: 'smithy',   name: 'Pandai Besi',       x: 112, z: -62, w: 9,  d: 8,  face:  Math.PI / 2 },
    { id: 'perwira', kind: 'officers', name: 'Rumah Perwira',     x: 112, z:  62, w: 14, d: 9,  face: -Math.PI / 2 },
  ],
  yards: [   // lapangan terbuka berpagar (tanpa atap): latihan pedang & memanah
    { id: 'latihan', kind: 'training', name: 'Lapangan Latihan', x: 85, z: -35, w: 17, d: 17 },
    { id: 'panah',   kind: 'archery',  name: 'Lapangan Panah',   x: 85, z:  35, w: 17, d: 17 },
  ],
  posts: [   // pos jaga bundar di pintu masuk distrik
    { x: 80, z: -14, r: 2.8 }, { x: 80, z: 14, r: 2.8 },
  ],
};
// semua jejak bangunan (untuk uji tabrakan & tabrakan pemain): persegi berputar {x,z,w,d,face} atau lingkaran {x,z,r}
export const D1_FOOTPRINTS = [
  { ...D1.hq }, ...D1.buildings, ...D1.yards.map(y => ({ ...y, face: 0, yard: true })),
  ...D1.posts.map(p => ({ x: p.x, z: p.z, r: p.r })),
];
// sudut-sudut persegi berputar: depan bangunan = arah `face` (sudut dari +x ke +z), lebar w tegak lurus arah depan, kedalaman d searah depan
export function rectCorners(f, pad = 0) {
  const fx = Math.cos(f.face || 0), fz = Math.sin(f.face || 0), sx = -fz, sz = fx, hw = f.w / 2 + pad, hd = f.d / 2 + pad;
  // catatan: untuk bangunan w = sisi panjang (lebar fasad). Untuk lapangan (face 0) w = searah x, d = searah z.
  if (f.yard) return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [f.x + a * hw, f.z + b * hd]);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [f.x + sx * a * hw + fx * b * hd, f.z + sz * a * hw + fz * b * hd]);
}
// titik lokal (x,z) berada di dalam / dekat jejak bangunan apa pun di Distrik 1 (pad = jarak aman)
export function d1Blocked(x, z, pad = 0) {
  for (const f of D1_FOOTPRINTS) {
    if (f.r) { if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return true; continue; }
    const fx = Math.cos(f.face || 0), fz = Math.sin(f.face || 0), dx = x - f.x, dz = z - f.z;
    if (f.yard) { if (Math.abs(dx) < f.w / 2 + pad && Math.abs(dz) < f.d / 2 + pad) return true; continue; }
    const along = dx * -fz + dz * fx, front = dx * fx + dz * fz;   // along = sepanjang fasad (lebar), front = searah depan
    if (Math.abs(along) < f.w / 2 + pad && Math.abs(front) < f.d / 2 + pad) return true;
  }
  const p = D1.parade; if (Math.abs(x - p.x) < p.w / 2 + pad && Math.abs(z - p.z) < p.d / 2 + pad) return true;
  if (x < D1.avenue.x1 + pad && Math.abs(z) < D1.avenue.w / 2 + 3.5 + pad) return true;   // jalan utama + saluran
  return false;
}

// ============================================================
//  DISTRIK 2 — MERCHANT QUARTER (kerangka lokal)
//  Wilayah: baji antara jalan radial Gerbang Timur Laut (φ = 36°) dan Gerbang Timur (φ = 108°), dari jalan lingkar sampai tembok.
//  Koordinat distrik (u, v): u = menjauhi istana sepanjang sumbu 72° (puncak segi lima), v = ke samping (+v = searah φ yang lebih besar).
// ============================================================
const A2 = 72 * D2R, E2 = { x: Math.cos(A2), z: Math.sin(A2) }, N2 = { x: -Math.sin(A2), z: Math.cos(A2) };
export const d2p = (u, v) => ({ x: u * E2.x + v * N2.x, z: u * E2.z + v * N2.z });                       // (u,v) distrik -> lokal kota
export const d2Face = (du, dv) => { const x = du * E2.x + dv * N2.x, z = du * E2.z + dv * N2.z; return Math.atan2(z, x); };   // arah (du,dv) -> sudut face lokal kota
// titik (x,z) lokal ada di wilayah dalam Distrik 2 dengan jarak aman `m` dari jalan radial, jalan lingkar, dan tembok?
export function inD2(x, z, m = 0) {
  if (!insidePoly(x, z, WALL.t / 2 + 0.4 + m)) return false;
  if (Math.hypot(x, z) < RING.r + RING.w / 2 + m) return false;
  if (radialSigned(x, z, 36) < ROAD_W / 2 + m) return false;         // sisi SE jalan radial +36°
  if (radialSigned(x, z, 108) > -(ROAD_W / 2 + m)) return false;     // sisi NE jalan radial +108°
  return true;
}
const PL = { u: 112, r: 19 };    // alun-alun pasar bundar
export const D2 = {
  avenue: { w: 11, u0: RING.r, u1: 152 },                                        // jalan utama: jalan lingkar -> alun-alun -> Balai Serikat
  plaza:  { u: PL.u, v: 0, r: PL.r },                                            // alun-alun pasar (lantai batu berwarna), air mancur di tengah
  fountain: { u: PL.u, v: 0, r: 3.4 },
  stalls: { n: 12, r: 13.6, skip: [0, 6] },                                      // kios pasar beratap kain bergaris, melingkar; indeks 0 & 6 = pintu jalan utama
  // bangunan: (u, v) pusat, w = lebar fasad, d = kedalaman, to = [du, dv] arah depan (menghadap)
  buildings: [
    { id: 'balai',    kind: 'guild',     name: 'Balai Serikat Pedagang', u: 153, v: 0,   w: 24, d: 12, to: [-1, 0] },
    { id: 'bank',     kind: 'bank',      name: 'Bank Kekaisaran',        u: 133, v: -41, w: 15, d: 10, to: [-0.5, 1] },
    { id: 'timbang',  kind: 'scale',     name: 'Rumah Timbang',          u: 133, v: 41,  w: 14, d: 9,  to: [-0.5, -1] },
    { id: 'penginapan', kind: 'inn',     name: 'Penginapan Karavan',     u: 95,  v: -48, w: 16, d: 10, to: [0, 1] },
    { id: 'kedai',    kind: 'tavern',    name: 'Kedai Gelas Emas',       u: 95,  v: 48,  w: 15, d: 9,  to: [0, -1] },
    { id: 'gudang-1', kind: 'warehouse', name: 'Gudang Dagang I',        u: 116, v: -56, w: 20, d: 11, to: [0, 1] },
    { id: 'gudang-2', kind: 'warehouse', name: 'Gudang Dagang II',       u: 116, v: 56,  w: 20, d: 11, to: [0, -1] },
  ],
  shopRing: { r: 31, angles: [-145, -110, -70, -38, 38, 70, 110, 145], w: 11, d: 9 },   // toko berderet mengelilingi alun-alun, menghadap pusat
  shopNames: ['Toko Kain', 'Toko Rempah', 'Apotek', 'Toko Keramik', 'Toko Roti', 'Toko Perhiasan', 'Toko Buku', 'Toko Sepatu'],
};
D2.shops = D2.shopRing.angles.map((deg, i) => {
  const a = deg * D2R, u = PL.u + D2.shopRing.r * Math.cos(a), v = D2.shopRing.r * Math.sin(a);
  return { id: 'toko-' + (i + 1), kind: 'shop', name: D2.shopNames[i], u, v, w: D2.shopRing.w, d: D2.shopRing.d, to: [PL.u - u, -v] };
});
for (const b of [...D2.buildings, ...D2.shops]) { const p = d2p(b.u, b.v); b.x = p.x; b.z = p.z; b.face = d2Face(b.to[0], b.to[1]); }
export const D2_FOOTPRINTS = [...D2.buildings, ...D2.shops].map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, face: b.face }));
// titik lokal (x,z) berada di dalam / dekat jejak bangunan, alun-alun, atau jalan utama Distrik 2 (pad = jarak aman)
export function d2Blocked(x, z, pad = 0) {
  for (const f of D2_FOOTPRINTS) {
    const fx = Math.cos(f.face), fz = Math.sin(f.face), dx = x - f.x, dz = z - f.z;
    const along = dx * -fz + dz * fx, front = dx * fx + dz * fz;
    if (Math.abs(along) < f.w / 2 + pad && Math.abs(front) < f.d / 2 + pad) return true;
  }
  const pc = d2p(PL.u, 0); if (Math.hypot(x - pc.x, z - pc.z) < PL.r + 1.5 + pad) return true;
  // jalan utama (u0 .. u1) selebar avenue + tepi
  const dx = x * E2.x + z * E2.z, dv = x * N2.x + z * N2.z; if (dx > D2.avenue.u0 - 2 && dx < D2.avenue.u1 + 4 && Math.abs(dv) < D2.avenue.w / 2 + 2 + pad) return true;
  return false;
}

// ============================================================
//  DISTRIK 3 — NOBLE QUARTER (kerangka lokal)
//  Wilayah: baji antara jalan radial Gerbang Timur (φ = 108°) dan Gerbang Barat (φ = 180°), dari jalan lingkar sampai tembok.
//  Koordinat distrik (u, v): u = menjauhi istana sepanjang sumbu 144°, v = ke samping (+v = searah φ yang lebih besar).
// ============================================================
const A3 = 144 * D2R, E3 = { x: Math.cos(A3), z: Math.sin(A3) }, N3 = { x: -Math.sin(A3), z: Math.cos(A3) };
export const d3p = (u, v) => ({ x: u * E3.x + v * N3.x, z: u * E3.z + v * N3.z });
export const d3Face = (du, dv) => Math.atan2(du * E3.z + dv * N3.z, du * E3.x + dv * N3.x);
export function inD3(x, z, m = 0) {
  if (!insidePoly(x, z, WALL.t / 2 + 0.4 + m)) return false;
  if (Math.hypot(x, z) < RING.r + RING.w / 2 + m) return false;
  if (radialSigned(x, z, 108) < ROAD_W / 2 + m) return false;
  if (radialSigned(x, z, 180) > -(ROAD_W / 2 + m)) return false;
  return true;
}
export const D3 = {
  avenue: { w: 11, u0: RING.r, u1: 150 },
  garden: { u: 108, v: 0, r: 18, hedgeR: 14.2 },                                  // taman formal bundar: pagar tanaman berpintu 4, petak bunga, air mancur
  buildings: [
    { id: 'adipati',  kind: 'manor',   name: 'Kediaman Adipati',   u: 152, v: 0,   w: 26, d: 13, to: [-1, 0], grand: true },
    { id: 'kapel',    kind: 'chapel',  name: 'Kapel Keluarga',     u: 122, v: -57, w: 10, d: 14, to: [-0.3, 1] },
    { id: 'rumahkaca', kind: 'conserv', name: 'Rumah Kaca',        u: 120, v: 57,  w: 14, d: 9,  to: [-0.3, -1] },
  ],
  ring: { r: 40, angles: [-132, -90, -50, 50, 90, 132], w: 16, d: 10 },           // enam kediaman bangsawan mengelilingi taman
  names: ['Kediaman Baron', 'Kediaman Viscount', 'Kediaman Graf', 'Kediaman Marquis', 'Kediaman Countess', 'Kediaman Duke'],
};
D3.mansions = D3.ring.angles.map((deg, i) => {
  const a = deg * D2R, u = D3.garden.u + D3.ring.r * Math.cos(a), v = D3.ring.r * Math.sin(a);
  return { id: 'kediaman-' + (i + 1), kind: 'manor', name: D3.names[i], u, v, w: D3.ring.w, d: D3.ring.d, to: [D3.garden.u - u, -v], variant: i % 3 };
});
for (const b of [...D3.buildings, ...D3.mansions]) { const p = d3p(b.u, b.v); b.x = p.x; b.z = p.z; b.face = d3Face(b.to[0], b.to[1]); }
export const D3_FOOTPRINTS = [...D3.buildings, ...D3.mansions].map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, face: b.face }));
export function d3Blocked(x, z, pad = 0) {
  for (const f of D3_FOOTPRINTS) {
    const fx = Math.cos(f.face), fz = Math.sin(f.face), dx = x - f.x, dz = z - f.z;
    const along = dx * -fz + dz * fx, front = dx * fx + dz * fz;
    if (Math.abs(along) < f.w / 2 + pad && Math.abs(front) < f.d / 2 + pad) return true;
  }
  const gc = d3p(D3.garden.u, 0); if (Math.hypot(x - gc.x, z - gc.z) < D3.garden.r + 1.5 + pad) return true;
  const du = x * E3.x + z * E3.z, dv = x * N3.x + z * N3.z; if (du > D3.avenue.u0 - 2 && du < D3.avenue.u1 + 4 && Math.abs(dv) < D3.avenue.w / 2 + 2 + pad) return true;
  return false;
}

// ============================================================
//  DISTRIK 4 — ACADEMY QUARTER (kerangka lokal)
//  Wilayah: baji antara jalan radial Gerbang Barat (φ = 180°) dan Gerbang Barat Laut (φ = 252°), dari jalan lingkar sampai tembok.
//  Koordinat distrik (u, v): u = menjauhi istana sepanjang sumbu 216°, v = ke samping (+v = searah φ yang lebih besar).
// ============================================================
const A4 = 216 * D2R, E4 = { x: Math.cos(A4), z: Math.sin(A4) }, N4 = { x: -Math.sin(A4), z: Math.cos(A4) };
export const d4p = (u, v) => ({ x: u * E4.x + v * N4.x, z: u * E4.z + v * N4.z });
export const d4Face = (du, dv) => Math.atan2(du * E4.z + dv * N4.z, du * E4.x + dv * N4.x);
export function inD4(x, z, m = 0) {
  if (!insidePoly(x, z, WALL.t / 2 + 0.4 + m)) return false;
  if (Math.hypot(x, z) < RING.r + RING.w / 2 + m) return false;
  if (radialSigned(x, z, 180) < ROAD_W / 2 + m) return false;
  if (radialSigned(x, z, 252) > -(ROAD_W / 2 + m)) return false;
  return true;
}
export const D4 = {
  avenue: { w: 11, u0: RING.r, u1: 150 },
  plaza: { u: 108, v: 0, r: 18 },                                                  // alun-alun lingkaran sihir (kristal melayang di tengah)
  buildings: [
    { id: 'aula',       kind: 'hall',   name: 'Aula Akademi',        u: 152, v: 0,   w: 26, d: 13, to: [-1, 0] },
    { id: 'menara',     kind: 'tower',  name: 'Menara Penyihir',     u: 122, v: -57, w: 10, d: 14, to: [-0.3, 1] },
    { id: 'observatorium', kind: 'obs', name: 'Observatorium',       u: 120, v: 57,  w: 14, d: 9,  to: [-0.3, -1] },
  ],
  ring: { r: 40, angles: [-132, -90, -50, 50, 90, 132], w: 16, d: 10 },
  names: ['Asrama Putra', 'Perpustakaan Agung', 'Ruang Kuliah', 'Laboratorium Alkimia', 'Asrama Putri', 'Balai Rektor'],
  kinds: ['dorm', 'library', 'lecture', 'lab', 'dorm', 'rector'],
};
D4.halls = D4.ring.angles.map((deg, i) => {
  const a = deg * D2R, u = D4.plaza.u + D4.ring.r * Math.cos(a), v = D4.ring.r * Math.sin(a);
  return { id: 'akd-' + (i + 1), kind: D4.kinds[i], name: D4.names[i], u, v, w: D4.ring.w, d: D4.ring.d, to: [D4.plaza.u - u, -v] };
});
for (const b of [...D4.buildings, ...D4.halls]) { const p = d4p(b.u, b.v); b.x = p.x; b.z = p.z; b.face = d4Face(b.to[0], b.to[1]); }
export const D4_FOOTPRINTS = [...D4.buildings, ...D4.halls].map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, face: b.face }));
export function d4Blocked(x, z, pad = 0) {
  for (const f of D4_FOOTPRINTS) {
    const fx = Math.cos(f.face), fz = Math.sin(f.face), dx = x - f.x, dz = z - f.z;
    const along = dx * -fz + dz * fx, front = dx * fx + dz * fz;
    if (Math.abs(along) < f.w / 2 + pad && Math.abs(front) < f.d / 2 + pad) return true;
  }
  const pc = d4p(D4.plaza.u, 0); if (Math.hypot(x - pc.x, z - pc.z) < D4.plaza.r + 1.5 + pad) return true;
  const du = x * E4.x + z * E4.z, dv = x * N4.x + z * N4.z; if (du > D4.avenue.u0 - 2 && du < D4.avenue.u1 + 4 && Math.abs(dv) < D4.avenue.w / 2 + 2 + pad) return true;
  return false;
}

// ============================================================
//  DISTRIK 5 — ADMINISTRATION QUARTER (kerangka lokal)
//  Wilayah: baji antara jalan radial Gerbang Barat Laut (φ = 252°) dan Gerbang Timur Laut/Distrik 1 (φ = 324°), dari jalan lingkar sampai tembok.
//  Koordinat distrik (u, v): u = menjauhi istana sepanjang sumbu 288°, v = ke samping (+v = searah φ yang lebih besar).
// ============================================================
const A5 = 288 * D2R, E5 = { x: Math.cos(A5), z: Math.sin(A5) }, N5 = { x: -Math.sin(A5), z: Math.cos(A5) };
export const d5p = (u, v) => ({ x: u * E5.x + v * N5.x, z: u * E5.z + v * N5.z });
export const d5Face = (du, dv) => Math.atan2(du * E5.z + dv * N5.z, du * E5.x + dv * N5.x);
export function inD5(x, z, m = 0) {
  if (!insidePoly(x, z, WALL.t / 2 + 0.4 + m)) return false;
  if (Math.hypot(x, z) < RING.r + RING.w / 2 + m) return false;
  if (radialSigned(x, z, 252) < ROAD_W / 2 + m) return false;
  if (radialSigned(x, z, 324) > -(ROAD_W / 2 + m)) return false;
  return true;
}
export const D5 = {
  avenue: { w: 11, u0: RING.r, u1: 150 },
  plaza: { u: 108, v: 0, r: 18, colR: 15.4 },                                       // alun-alun sipil: kolonade 16 tiang berpintu 4, tugu di tengah
  buildings: [
    { id: 'balai',   kind: 'ministry', name: 'Balai Kekaisaran',    u: 152, v: 0,   w: 26, d: 13, to: [-1, 0] },
    { id: 'menara-jam', kind: 'clock', name: 'Menara Jam',          u: 122, v: -57, w: 10, d: 14, to: [-0.3, 1] },
    { id: 'kesehatan', kind: 'clinic', name: 'Balai Kesehatan',     u: 120, v: 57,  w: 14, d: 9,  to: [-0.3, -1] },
  ],
  ring: { r: 40, angles: [-132, -90, -50, 50, 90, 132], w: 16, d: 10 },
  names: ['Kantor Perbendaharaan', 'Arsip Kekaisaran', 'Balai Pencatatan', 'Pengadilan Agung', 'Kantor Pos Kekaisaran', 'Kantor Pengawas'],
  kinds: ['treasury', 'archive', 'registry', 'court', 'post', 'office'],
};
D5.halls = D5.ring.angles.map((deg, i) => {
  const a = deg * D2R, u = D5.plaza.u + D5.ring.r * Math.cos(a), v = D5.ring.r * Math.sin(a);
  return { id: 'adm-' + (i + 1), kind: D5.kinds[i], name: D5.names[i], u, v, w: D5.ring.w, d: D5.ring.d, to: [D5.plaza.u - u, -v] };
});
for (const b of [...D5.buildings, ...D5.halls]) { const p = d5p(b.u, b.v); b.x = p.x; b.z = p.z; b.face = d5Face(b.to[0], b.to[1]); }
export const D5_FOOTPRINTS = [...D5.buildings, ...D5.halls].map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, face: b.face }));
export function d5Blocked(x, z, pad = 0) {
  for (const f of D5_FOOTPRINTS) {
    const fx = Math.cos(f.face), fz = Math.sin(f.face), dx = x - f.x, dz = z - f.z;
    const along = dx * -fz + dz * fx, front = dx * fx + dz * fz;
    if (Math.abs(along) < f.w / 2 + pad && Math.abs(front) < f.d / 2 + pad) return true;
  }
  const pc = d5p(D5.plaza.u, 0); if (Math.hypot(x - pc.x, z - pc.z) < D5.plaza.r + 1.5 + pad) return true;
  const du = x * E5.x + z * E5.z, dv = x * N5.x + z * N5.z; if (du > D5.avenue.u0 - 2 && du < D5.avenue.u1 + 4 && Math.abs(dv) < D5.avenue.w / 2 + 2 + pad) return true;
  return false;
}
