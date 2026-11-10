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
  { k: 0, id: 'timur-laut', name: 'Gerbang Timur Laut', gap: 8,  open: true  },   // dibuka: lorong bebas (tanpa daun pintu & tabrakan); di luarnya terbentang Padang Rumput Timur Laut (NE_PLAIN)
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
// ---------- PADANG RUMPUT TIMUR LAUT: hamparan datar sejauh 500 m di luar Gerbang Timur Laut (k = 0, φ = +36°) ----------
//  Cara kerjanya sama dengan Dataran Barat Laut di atas: d = jarak dari pusat istana searah sumbu gerbang (gerbang di d = APOTHEM, ujung padang di d = APOTHEM + len).
export const NE_PLAIN = { len: 500, halfW: 60, step: 30, psi: GATES[0].psi };
export const NE_PLAIN_CIRCLES = [];
{
  const u = { x: Math.cos(NE_PLAIN.psi), z: Math.sin(NE_PLAIN.psi) }, r = NE_PLAIN.halfW + 4;   // lingkaran r = halfW + 4 yang saling tumpang-tindih menutup pita selebar 2·halfW tanpa celah
  const d0 = APOTHEM + 10, d1 = APOTHEM + NE_PLAIN.len - r, n = Math.ceil((d1 - d0) / NE_PLAIN.step);
  const nrm = { x: -u.z, z: u.x }, add = (d, off, rr) => { const p = toWorld(u.x * d + nrm.x * off, u.z * d + nrm.z * off); NE_PLAIN_CIRCLES.push({ x: p.x, z: p.z, r: rr }); };
  for (let i = 0; i <= n; i++) add(d0 + (d1 - d0) * i / n, 0, r);
  for (let off = -NE_PLAIN.halfW + 4; off <= NE_PLAIN.halfW - 4 + 0.01; off += 22) add(APOTHEM + NE_PLAIN.len - 34, off, 34);   // baris lingkaran kecil di ujung supaya ujung padang rata
}
KEKAISARAN_CIRCLES.push(...NE_PLAIN_CIRCLES);   // ikut area jelajah (batas dunia / kekaisaranDist); chunk-nya sendiri: 'dataran-tl' di world.js
export function nePlainAxis(x, z) {   // koordinat sumbu padang dari titik dunia: d = jarak searah gerbang, off = geser ke samping sumbu
  const p = toLocal(x, z), c = Math.cos(NE_PLAIN.psi), s = Math.sin(NE_PLAIN.psi);
  return { d: p.x * c + p.z * s, off: -p.x * s + p.z * c };
}
export function inNePlain(x, z, m = 0) {   // titik dunia ada di dalam padang (m > 0 = diperlebar m meter, untuk histeresis pesan)
  const a = nePlainAxis(x, z);
  return a.d > APOTHEM + 3 - m && a.d < APOTHEM + NE_PLAIN.len + m && Math.abs(a.off) < NE_PLAIN.halfW + m;
}
export function neAxisToWorld(d, off = 0) {   // koordinat sumbu (d, off) padang timur laut -> titik dunia
  const c = Math.cos(NE_PLAIN.psi), s = Math.sin(NE_PLAIN.psi);
  return toWorld(c * d - s * off, s * d + c * off);
}
// ---------- GUNUNG PENDAKIAN (kiri) & GUNUNG SEBERANG (kanan) — Pegunungan Timur Laut: dua gunung di kedua sisi padang timur laut yang bisa didaki lewat jalan setapak melingkar ----------
//  Tinggi tanah dihitung dari rumus di sini (bukan dari mesh), jadi dipakai bersama oleh pembangun mesh (kekaisaran-dataran-tl.js) dan oleh game.js (tinggi pijakan pemain).
//  Koordinat sumbu gunung: (xa, ya) = (d - M.d, off - M.off) pada sumbu padang timur laut; pusat gunung di (0, 0). M = NE_MTN (kiri, side -1) atau NE_MTN2 (kanan, side +1).
//  Jalan setapak: spiral dari kaki gunung (r0, di sisi yang menghadap padang; tersambung ke jalan padang lewat jalan cabang) berputar naik sampai tepi dataran puncak (r1).
const mkMtn = c => { c.TH = c.turns * 2 * Math.PI; c.DR = (c.r1 - c.r0) / c.TH; return c; };   // TH: total sudut putaran jalan setapak; DR: perubahan radius per radian (negatif: makin ke dalam makin naik)
export const NE_MTN = mkMtn({ Rb: 75, Hm: 60, W: 2.2, turns: 1.25, r0: 77, r1: 12, th0: Math.PI / 2, d: APOTHEM + 300, off: -(NE_PLAIN.halfW + 75 + 2), topR: 13.5, side: -1 });   // Rb: jari-jari kaki, Hm: tinggi puncak, W: setengah lebar jalan setapak
export const NE_MTN2 = mkMtn({ Rb: 80, Hm: 90, W: 2.2, turns: 1.9, r0: 82, r1: 13, th0: -Math.PI / 2, d: APOTHEM + 300, off: NE_PLAIN.halfW + 80 + 2, topR: 14.5, side: 1 });   // Gunung Seberang: di sisi kanan, lebih tinggi & lebih lebar; jalan setapak mulai dari sisi yang menghadap padang
export const NE_MTN3 = mkMtn({ Rb: 100, Hm: 128, W: 2.2, turns: 2.2, r0: 102, r1: 14, th0: Math.PI, d: APOTHEM + NE_PLAIN.len + 100 + 6, off: 0, topR: 15, side: 0, axial: true });   // Gunung Agung: di UJUNG padang, tepat di sumbu jalan padang (axial). Jalan padang diteruskan lurus ke kakinya, lalu jalan setapak berkelok naik (th0 = π: awal jalan menghadap padang)
export const NE_MTNS = [NE_MTN, NE_MTN2, NE_MTN3];
// ---------- PUNGGUNGAN LANGIT: punggungan gunung memanjang di belakang Gunung Agung, dengan jalan tanah berkelok di puncaknya ----------
//  Dimulai dari "kepala" (dataran puncak bundar, setinggi puncak Agung) 190 m di belakang pusat Gunung Agung (dihubungkan Jembatan Langit), lalu memanjang L m searah sumbu padang.
//  Koordinat punggungan: t = jarak sepanjang sumbu (d - head.d), lat = geser tegak lurus dari garis tengah punggungan. Garis tengah berkelok (neRidgeSpine), lebar puncak berubah-ubah (ada "mesa" yang melebar),
//  tinggi puncak turun bertahap lewat tiga undakan landai, dan di kiri-kanannya tebing berundak (3 tingkat) turun ke tanah. Jalan tanah berkelok di atas puncak (neRidgeRoadLat).
//  Seperti gunung lain, tinggi tanah dihitung dari rumus di sini (bukan dari mesh) supaya mesh (kekaisaran-dataran-tl.js) & tinggi pijakan pemain (game.js) selalu sama.
const rSst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const NE_RIDGE = {
  name: 'Punggungan Langit', L: 640, flatR: 20, Wc: 56, tiers: 3, roadHW: 2.4, roadAmp: 4.2, fenceIn: 1.6,
  head: { d: NE_MTN3.d + 190, off: 0, Rb: 70, Hm: NE_MTN3.Hm },   // "gunung semu" untuk ujung jembatan: dataran puncak rata berjari-jari 0,2·Rb = 14 m + sambungan ke punggungan; tingginya sama dengan puncak Agung (jembatan datar)
  barrierD: NE_MTN3.d + 112, barrierHalf: 18,                      // pagar tabrakan melintang di koridor jembatan (di tanah) supaya pemain di tanah tidak bisa "memanjat" tebing dari bawah jembatan
};
NE_RIDGE.d0 = NE_RIDGE.head.d; NE_RIDGE.Hs = NE_MTN3.Hm;
const RG = NE_RIDGE, TAU = Math.PI * 2, rClamp = t => Math.min(RG.L, Math.max(0, t));
export const neRidgeSpine = t => rSst(0, 90, t) * (20 * Math.sin(TAU * t / 300 + 0.6) + 7 * Math.sin(TAU * t / 125 + 2.1));   // geser samping garis tengah (m): lurus di kepala, lalu berkelok
const spineSlope = t => neRidgeSpine(t + 0.5) - neRidgeSpine(t - 0.5);
const rBump = (t, c, s, a) => a * Math.exp(-(((t - c) / s) ** 2));
export const neRidgeHW0 = t => 16 + 3.5 * Math.sin(TAU * t / 140 + 1.1) + rBump(t, 150, 38, 9) + rBump(t, 345, 40, 10) + rBump(t, 520, 36, 8) + rBump(t, RG.L - 20, 34, 11);   // setengah lebar puncak (3 mesa lebar + tanjung pandang di ujung)
export const neRidgeHW = (t, sd) => neRidgeHW0(t) + (1.3 * Math.sin(0.17 * t + 2.3 * sd) + 0.9 * Math.sin(0.43 * t + 5.1 * sd)) * rSst(0, 40, t);   // tepi kiri (sd = -1) / kanan (+1) dibuat tidak lurus
export const neRidgeTop = t => { const c = rClamp(t); return RG.Hs - 7 * rSst(150, 195, c) - 8 * rSst(340, 385, c) - 6 * rSst(505, 545, c) + 2.2 * Math.sin(TAU * c / 170 + 0.7) * rSst(0, 60, c); };   // tinggi dataran puncak
export const neRidgeRoadLat = t => RG.roadAmp * Math.sin(TAU * t / 90 + 0.5) * rSst(0, 30, t) * (1 - rSst(RG.L - 60, RG.L - 25, t));   // jalan berkelok di atas puncak (geser dari garis tengah), lurus di kepala & di tanjung ujung
export const NE_RIDGE_PLAZA_T = RG.L - 18;                                                                                         // pusat halaman batu di tanjung ujung
export function neRidgeLat(d, off) { const t = d - RG.d0, c = rClamp(t), sl = spineSlope(c); return { t, lat: (off - neRidgeSpine(c)) / Math.sqrt(1 + sl * sl) }; }   // koordinat punggungan dari koordinat sumbu padang
export function neRidgeToAxis(t, lat = 0) { const c = rClamp(t), sl = spineSlope(c); return { d: RG.d0 + t, off: neRidgeSpine(c) + lat * Math.sqrt(1 + sl * sl) }; }   // kebalikannya
export function neRidgeH(d, off) {   // tinggi tanah punggungan di (d, off) sumbu padang; 0 di luar punggungan
  const t = d - RG.d0; if (t < -RG.flatR - RG.Wc - 4 || t > RG.L + RG.Wc + 40 || Math.abs(off) > 150) return 0;
  const c = rClamp(t), q = neRidgeLat(d, off), alat = Math.abs(q.lat), sd = q.lat < 0 ? -1 : 1, hw = neRidgeHW(c, sd), ht = neRidgeTop(c);
  const eR = Math.hypot(t - c, Math.max(0, alat - hw)), eD = Math.max(0, Math.hypot(d - RG.head.d, off) - RG.flatR), e = Math.min(eR, eD);   // e = jarak dari tepi dataran puncak (kepala bundar digabung dengan punggungan)
  if (e <= 0) return ht;
  const Wc = RG.Wc + 8 * Math.sin(c / 53 + 1), u = e / Wc; if (u >= 1) return 0;
  const n = RG.tiers, x = (1 - u) * n, k = Math.floor(x), base = ht * (k + rSst(0.62, 1, x - k)) / n;   // tiap tingkat: ledge datar lalu tebing curam (sama seperti mesa berundak gunung lain)
  const nz = (Math.sin(d * 0.19 + off * 0.11) * Math.cos(off * 0.17 - d * 0.07) + 0.5 * Math.sin(d * 0.41 + off * 0.37)) * 2.4 * rSst(0.5, 6, e) * (1 - rSst(0.8, 1, u));   // tebing bergerigi
  return Math.min(ht, Math.max(0, base + nz));
}
export function neRidgeZone(x, z, m = 0) {   // 0 = bukan di puncak punggungan; 1 = di puncak punggungan; 2 = di tanjung ujung  (m > 0 = diperlebar, untuk histeresis pesan)
  const a = nePlainAxis(x, z), h = neRidgeH(a.d, a.off); if (h < RG.Hs - 32 - (m ? 6 : 0)) return 0;
  return a.d - RG.d0 > RG.L - 45 ? 2 : 1;
}
// ---------- JEMBATAN LANGIT: jalan kayu yang menghubungkan ketiga puncak (segitiga: Pendakian—Seberang—Agung—Pendakian) ----------
//  Dek lurus dari tepi dataran puncak A ke tepi dataran puncak B (koordinat sumbu padang: d, off), tingginya naik/turun linear dari Hm A ke Hm B.
//  Tabrakan game ini 2D, jadi pemain yang berdiri DI ATAS dek (y >= tinggi dek - 2,5) dianggap "di jembatan": tabrakan dunia dilewati & pemain dijepit ke lebar dek (neBridgeClamp);
//  pemain di tanah (y rendah) di bawah jembatan tidak terpengaruh sama sekali.
export const NE_BRIDGE_HW = 2.6;   // setengah lebar dek
export const NE_BRIDGES = [];
{
  const mk = (A, B) => {
    const dd = B.d - A.d, oo = B.off - A.off, D = Math.hypot(dd, oo), ux = dd / D, uy = oo / D, rA = A.Rb * 0.2 - 1.5, rB = B.Rb * 0.2 - 1.5;   // 0,2·Rb = jari-jari dataran puncak yang rata
    NE_BRIDGES.push({ A, B, d0: A.d + ux * rA, o0: A.off + uy * rA, ux, uy, L: D - rA - rB, h0: A.Hm, h1: B.Hm, hw: NE_BRIDGE_HW });
  };
  mk(NE_MTN, NE_MTN2); mk(NE_MTN, NE_MTN3); mk(NE_MTN2, NE_MTN3); mk(NE_MTN3, NE_RIDGE.head);   // jembatan terakhir: dari puncak Gunung Agung ke kepala Punggungan Langit
}
export const neBridgeDeckH = (b, s) => b.h0 + (b.h1 - b.h0) * (s / b.L);
export const neBridgeLocal = (b, d, off) => { const px = d - b.d0, py = off - b.o0; return { s: px * b.ux + py * b.uy, lat: -px * b.uy + py * b.ux }; };   // s: jarak sepanjang dek; lat: geser ke samping dari garis tengah
export function neBridgeAt(x, z, y) {   // jembatan yang sedang diinjak di titik dunia (x, z) pada ketinggian y; null bila tidak ada
  const a = nePlainAxis(x, z);
  for (const b of NE_BRIDGES) {
    const q = neBridgeLocal(b, a.d, a.off); if (q.s < 0 || q.s > b.L || Math.abs(q.lat) > b.hw + 0.3) continue;
    const h = neBridgeDeckH(b, q.s); if (y >= h - 2.5) return { b, s: q.s, lat: q.lat, h };
  }
  return null;
}
export function neBridgeClamp(pos) {   // true bila pemain berada di atas dek (tabrakan dunia dilewati); sekaligus menjepit pemain di dalam pagar dek
  const br = neBridgeAt(pos.x, pos.z, pos.y); if (!br || br.s < 1.5 || br.s > br.b.L - 1.5) return false;   // 1,5 m di tiap ujung: tabrakan biasa (celah cincin tepi puncak)
  const lim = br.b.hw - 0.55;
  if (Math.abs(br.lat) > lim) {
    const k = (br.lat > 0 ? lim : -lim) - br.lat, a = nePlainAxis(pos.x, pos.z), p0 = neAxisToWorld(a.d, a.off), p1 = neAxisToWorld(a.d - br.b.uy * k, a.off + br.b.ux * k);
    pos.x += p1.x - p0.x; pos.z += p1.z - p0.z;
  }
  return true;
}
export const NE_MTN_TH = NE_MTN.TH, NE_MTN_DR = NE_MTN.DR;                    // (tetap diekspor untuk Gunung Pendakian)
export const neMtnRs = (th, M = NE_MTN) => M.r0 + M.DR * (th - M.th0);          // radius jalan setapak pada sudut th
const mtnSstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mtnProfileSmooth = (r, M) => { const t = Math.min(1, Math.max(0, 1 - r / M.Rb)), p = t * t * (3 - 2 * t); return M.Hm * Math.min(1, p / 0.92); };   // kerucut halus: dipakai HANYA untuk ketinggian jalan setapak (tanjakan landai yang bisa dilalui)
const mtnTiers = M => Math.max(3, Math.round(M.Hm / 16));   // jumlah undakan (tier): ±16 m per tingkat
//  Bentuk gunung bergaya low-poly "mesa berundak": dataran hijau datar bertingkat-tingkat dipisahkan tebing curam, tepi tebingnya tidak bulat sempurna (berkelok mengikuti sudut `ang`).
//  Dataran puncak (r < 0,2·Rb) tetap rata di Hm persis seperti sebelumnya, jadi tugu/bendera/pesan puncak & tabrakannya tidak berubah.
const mtnProfile = (r, M, ang = 0) => {
  const fade = mtnSstep(M.Rb * 0.2, M.Rb * 0.5, r), ph = M.d * 0.37;   // kelokan tepi tebing menghilang di dekat puncak supaya dataran puncak tetap bulat & rata
  const wob = (0.10 * Math.sin(3 * ang + ph) + 0.06 * Math.sin(7 * ang + 2 * ph) + 0.04 * Math.sin(13 * ang + 3 * ph)) * fade;
  const u = Math.min(1, Math.max(0, (1 - r * (1 + wob) / M.Rb) / 0.8)), n = mtnTiers(M), x = u * n, k = Math.floor(x), f = x - k;
  return M.Hm * (k + mtnSstep(0.7, 1, f)) / n;   // tiap tingkat: datar (f < 0,7) lalu tebing curam (f 0,7..1); kontinu di batas tingkat & mencapai Hm di puncak
};
export function neMtnTrail(xa, ya, M = NE_MTN) {   // jarak tegak lurus ke garis tengah jalan setapak (perp) & sudut (th) titik terdekat pada jalan itu
  const r = Math.hypot(xa, ya), best = { perp: Infinity, th: M.th0 };
  if (r < 9) return best;   // di dataran puncak tidak ada pengaruh jalan setapak
  const ang = Math.atan2(ya, xa), cosB = r / Math.hypot(r, M.DR);   // cosB: jalan agak miring terhadap arah keliling, jadi jarak radial dikoreksi
  for (let k = -2; k <= 3; k++) {
    const th = ang + 2 * Math.PI * k; if (th < M.th0 || th > M.th0 + M.TH) continue;
    const gap = Math.abs(r - neMtnRs(th, M)); if (gap > 14) continue;
    const perp = gap * cosB; if (perp < best.perp) { best.perp = perp; best.th = th; }
  }
  return best;
}
export function neMtnHAxis(xa, ya, M = NE_MTN) {   // tinggi tanah gunung M di (xa, ya); 0 di luar kaki gunung
  const r = Math.hypot(xa, ya); if (r >= M.Rb) return 0;
  const t = 1 - r / M.Rb, base = mtnProfile(r, M, Math.atan2(ya, xa)), wN = Math.min(1, t * 5) * (1 - mtnSstep(0.7, 0.85, t));   // wN: gelombang kecil hanya di lereng (kaki & puncak tetap rata)
  const nz = (Math.sin(xa * 0.11 + 1.3) * Math.cos(ya * 0.09) + 0.5 * Math.sin(xa * 0.23 + ya * 0.17)) * M.Hm * 0.014 * wN;   // dataran bertingkat dibuat hampir rata (gelombang diperkecil)
  const tr = neMtnTrail(xa, ya, M); if (tr.perp > M.W + 5) return Math.max(0, base + nz);
  const w = 1 - mtnSstep(M.W + 1.2, M.W + 5, tr.perp);   // w = 1 di badan jalan (dipotong rata di lereng), memudar ke lereng asli
  return (base + nz) * (1 - w) + mtnProfileSmooth(neMtnRs(tr.th, M), M) * w;   // jalan setapak tetap mengikuti kerucut halus: naik terus menembus/menyusuri tebing seperti jalan batu
}
export function neMtnH(x, z, y) {   // tinggi tanah gunung di titik dunia (0 jauh dari gunung); y (opsional) = tinggi pemain: bila ia di atas dek jembatan, tinggi dek dipakai
  const a = nePlainAxis(x, z); let h = 0;
  for (const M of NE_MTNS) {
    const xa = a.d - M.d, ya = a.off - M.off;
    if (Math.abs(xa) >= M.Rb || Math.abs(ya) >= M.Rb) continue;
    h = Math.max(h, neMtnHAxis(xa, ya, M));
  }
  h = Math.max(h, neRidgeH(a.d, a.off));   // Punggungan Langit (di belakang Gunung Agung)
  h = Math.max(h, neDescH(a.d, a.off));   // Jalur Turun Lembah Salju (di ujung Punggungan Langit)
  if (y !== undefined) { const br = neBridgeAt(x, z, y); if (br && br.h > h) h = br.h; }
  return h;
}
export function neMtnTopWhich(x, z, m = 0) {   // 0 = bukan di dataran puncak; 1 = puncak Gunung Pendakian (kiri); 2 = puncak Gunung Seberang (kanan); 3 = puncak Gunung Agung (ujung padang)  (m > 0 = diperlebar m meter, untuk histeresis pesan)
  const a = nePlainAxis(x, z);
  for (let i = 0; i < NE_MTNS.length; i++) { const M = NE_MTNS[i]; if (Math.hypot(a.d - M.d, a.off - M.off) < M.topR + m) return i + 1; }
  return 0;
}
export function neMtnTop(x, z, m = 0) { return neMtnTopWhich(x, z, m) > 0; }   // titik dunia ada di dataran puncak salah satu gunung
export const NE_MTN_CIRCLES = [];
{
  const add = (d, off, r) => { const p = neAxisToWorld(d, off); NE_MTN_CIRCLES.push({ x: p.x, z: p.z, r }); };
  for (const M of NE_MTNS) {
    add(M.d, M.off, M.Rb + 6);   // seluruh gunung
    if (M.axial) { add(APOTHEM + NE_PLAIN.len, 0, 14); add(APOTHEM + NE_PLAIN.len + 6, 0, 14); }   // sambungan jalan padang -> kaki Gunung Agung
    else add(M.d, M.side * 58, 8);    // sambungan ke padang (jalan cabang)
  }
  for (const b of NE_BRIDGES) for (let s = 0; s <= b.L; s += 22) add(b.d0 + b.ux * s, b.o0 + b.uy * s, b.hw + 11);   // koridor jembatan ikut area jelajah (pemain di dek tidak terdorong balik) & ikut memuat chunk
}
export const NE_RIDGE_CIRCLES = [];   // area jelajah punggungan: lingkaran-lingkaran sempit mengikuti puncaknya (pemain tidak bisa ke tanah di bawahnya)
{
  const add = (d, off, r) => { const p = neAxisToWorld(d, off); NE_RIDGE_CIRCLES.push({ x: p.x, z: p.z, r }); };
  add(NE_RIDGE.head.d, 0, 34);
  for (let t = 0; t <= NE_RIDGE.L; t += 20) { const a = neRidgeToAxis(t, 0); add(a.d, a.off, neRidgeHW0(t) + 11); }
  { const a = neRidgeToAxis(NE_RIDGE.L, 0); add(a.d, a.off, neRidgeHW0(NE_RIDGE.L) + 12); }
}
// ---------- JALUR TURUN LEMBAH SALJU: jalan tanah berkelok (switchback) yang menuruni tebing berundak dari ujung Punggungan Langit (Tanjung Pandang) sampai lembah bersalju + sungai beku + jembatan kayu ----------
//  Kerangka: titik asal = pusat halaman batu tanjung (t = NE_RIDGE_PLAZA_T), sumbu s = lurus ke depan (searah sumbu padang, melewati tepi ujung punggungan di s = edgeS), u = geser samping.
//  Garis tengah jalan = rangkaian lurus + belokan (kura-kura): masuk lurus, belok 90° ke leg 0, lalu leg melintang bolak-balik dihubungkan belokan U (jari-jari R), belok keluar & lurus ke lembah.
//  Tinggi jalan turun merata (±0,17) dari tinggi ujung punggungan sampai 0 di lembah. Tinggi TANAH = "rata-rata lunak" tinggi titik-titik jalan terdekat (jadi tiap leg berdiri di ledge datar, di antara leg ada tebing),
//  lalu di luar "pinggang" jalan tanah turun bertingkat (3 undakan) ke dasar seperti tebing punggungan. Rumus dipakai bersama mesh (kekaisaran-dataran-tl.js) & tinggi pijakan pemain (game.js).
export const NE_DESC = (() => {
  const RGL = NE_RIDGE.L, tP = NE_RIDGE_PLAZA_T;
  const D = { name: 'Jalur Turun Lembah Salju', roadHW: 2.6, R: 17, U: 26, nLegs: 6, entry: 26, dLedge: 19, Wc: 45, tau: 1.8, step: 2, edgeS: RGL - tP, aFlat: 24, sZero: 262, sR: 300, riverW: 9, valleyS: 322, valleyR: 56, forestS: 450, forestR: 165, d_p: NE_RIDGE.d0 + tP, off_p: neRidgeSpine(tP) };
  D.H0 = neRidgeTop(tP); D.H1 = neRidgeTop(RGL);
  const pts = []; let s = 0, u = 0, th = 0, a = 0;
  const push = () => pts.push({ s, u, a, h: 0 });
  const straight = len => { const n = Math.max(1, Math.round(len / D.step)), dl = len / n; for (let i = 0; i < n; i++) { s += Math.cos(th) * dl; u += Math.sin(th) * dl; a += dl; push(); } };
  const turn = (dang, R) => { const sg = Math.sign(dang), n = Math.max(2, Math.round(Math.abs(dang) * R / D.step)), cx = s + sg * R * -Math.sin(th), cy = u + sg * R * Math.cos(th), th0 = th; for (let i = 1; i <= n; i++) { th = th0 + dang * i / n; s = cx + sg * R * Math.sin(th); u = cy - sg * R * Math.cos(th); a += Math.abs(dang) * R / n; push(); } };
  push(); straight(D.entry); turn(Math.PI / 2, D.R); straight(D.U - D.R);        // masuk lurus -> belok ke leg 0 (u: R -> U)
  for (let k = 1; k < D.nLegs; k++) { turn(k % 2 ? -Math.PI : Math.PI, D.R); straight(2 * D.U); }   // belokan U + leg melintang bolak-balik (u: ±U)
  turn(Math.PI / 2, D.R); D.sExit = s; D.aExit = a; straight(530 - s);            // belok keluar, lurus ke lembah & masuk dalam hutan salju (sampai s = 530; hutan diperluas jadi jari-jari 165 m)
  D.sEnd = s; D.uEnd = u; D.aEnd = a;
  D.aZero = pts.find(p => p.s >= D.sZero - 0.01 && p.a >= D.aExit).a;              // jalan mencapai tinggi 0 di sini
  for (const p of pts) p.h = p.a < D.aFlat ? neRidgeTop(tP + p.a) : D.H1 * (1 - Math.min(1, (p.a - D.aFlat) / (D.aZero - D.aFlat)));
  D.pts = pts;
  {   // CABANG JALAN KEDUA di Hutan Salju: lepas dari jalan utama di s = forestS - 40, melengkung ke satu sisi (u bertambah) lalu lurus ke sarang kedua di dalam hutan
    const u0 = D.uEnd, P0 = [D.forestS - 40, u0], P1 = [D.forestS - 5, u0], P2 = [D.forestS + 30, u0 + 8], P3 = [D.forestS + 55, u0 + 38], E = [D.forestS + 95, u0 + 90];
    const br = [], bz = t => { const m = 1 - t; return [m * m * m * P0[0] + 3 * m * m * t * P1[0] + 3 * m * t * t * P2[0] + t * t * t * P3[0], m * m * m * P0[1] + 3 * m * m * t * P1[1] + 3 * m * t * t * P2[1] + t * t * t * P3[1]]; };
    for (let i = 0; i <= 60; i++) { const q = bz(i / 60); br.push({ s: q[0], u: q[1], h: 0 }); }
    const L = Math.hypot(E[0] - P3[0], E[1] - P3[1]), n = Math.round(L / D.step); for (let i = 1; i <= n; i++) br.push({ s: P3[0] + (E[0] - P3[0]) * i / n, u: P3[1] + (E[1] - P3[1]) * i / n, h: 0 });
    D.branch = br; D.branchEnd = br[br.length - 1]; D.branchS0 = P0[0];
  }
  D.edgeLat = neRidgeLat(D.d_p + D.edgeS, D.off_p).lat;   // posisi lat (kerangka punggungan) tempat jalan menyeberangi tepi ujung punggungan: pagar tepi ujung dibuka di sini
  return D;
})();
export const NE_DRAGON_NEST = (() => {   // SARANG NAGA: tanah bulat kosong (tanpa pohon & batu) di ujung cabang jalan Hutan Salju; hanya area kosong, nagamya belum ada. Kerangka (s, u) jalur turun.
  const D = NE_DESC, B = D.branch, E = D.branchEnd, Q = B[B.length - 6], L = Math.hypot(E.s - Q.s, E.u - Q.u), dir = { s: (E.s - Q.s) / L, u: (E.u - Q.u) / L }, R = 20;
  return { name: 'Sarang Naga', s: E.s + dir.s * 12, u: E.u + dir.u * 12, R, dir };   // pusat 12 m di depan ujung jalan; jari-jari 20 m (masih di dalam lingkaran jelajah Hutan Salju)
})();
export const neDragonNestKeep = (s, u, pad = 0) => Math.hypot(s - NE_DRAGON_NEST.s, u - NE_DRAGON_NEST.u) < NE_DRAGON_NEST.R + pad;   // titik (s, u) ada di sarang naga (+ pad m): pohon & batu dihilangkan
export const NE_YETI_SPOTS = (() => {   // titik sarang Yeti (musuh) di Hutan Salju, dalam kerangka jalur turun (s, u): dipakai game.js (muncul) & kekaisaran-dataran-tl.js (pohon menjauhi titik ini)
  const D = NE_DESC, out = [], u0 = D.uEnd, sEld = Math.min(D.sEnd + 14, D.forestS + D.forestR - 25);
  out.push({ s: sEld, u: u0, elder: true }, { s: sEld - 14, u: u0 + 13 }, { s: sEld - 14, u: u0 - 13 }, { s: D.valleyS + 50, u: u0 + 14 }, { s: D.valleyS + 74, u: u0 - 15 });   // Yeti Tua di ujung jalan + 2 pengawal + 2 di mulut hutan
  { const E = D.branchEnd, N = NE_DRAGON_NEST, d = N.dir, nx = -d.u, ny = d.s; out.push({ s: E.s - d.s * 30 + nx * 9, u: E.u - d.u * 30 + ny * 9 }, { s: E.s - d.s * 30 - nx * 9, u: E.u - d.u * 30 - ny * 9 }, { s: E.s - d.s * 48, u: E.u - d.u * 48 }); }   // sarang kedua: pengawal di sisi jalan cabang, sebelum sarang naga (area kosong di ujung jalan dikosongkan)
  for (let i = 0; i < 15; i++) {   // sisanya tersebar merata (spiral sudut emas) di dalam hutan, menjauhi jalan
    const ang = i * 2.399963 + 0.7, rr = (D.forestR - 22) * Math.sqrt((i + 0.6) / 15.4), s = D.forestS + Math.cos(ang) * rr, u = u0 + Math.sin(ang) * rr;
    if (s < D.valleyS + 80 || (Math.abs(u - u0) < 10 && s < D.sEnd + 6)) continue; if (D.branch.some(b => Math.hypot(b.s - s, b.u - u) < 10) || neDragonNestKeep(s, u, 8)) continue; out.push({ s, u });
  }
  return out;
})();
export const neDescRoadH = a => { const P = NE_DESC.pts; if (a <= 0) return P[0].h; if (a >= P[P.length - 1].a) return P[P.length - 1].h; let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].a <= a) lo = m; else hi = m; } const t = (a - P[lo].a) / (P[hi].a - P[lo].a); return P[lo].h + (P[hi].h - P[lo].h) * t; };   // tinggi jalan pada jarak busur a
export function neDescDist(s, u) {   // jarak (m) ke garis tengah jalan + indeks titik terdekat
  const P = NE_DESC.pts; let best = 1e18, bi = 0;
  for (let i = 0; i < P.length; i++) { const dx = P[i].s - s, dy = P[i].u - u, q = dx * dx + dy * dy; if (q < best) { best = q; bi = i; } }
  const B = NE_DESC.branch;   // cabang jalan di Hutan Salju ikut dihitung (pohon & batu menjauhi kedua jalan)
  if (B && s > NE_DESC.branchS0 - 30) for (let i = 0; i < B.length; i++) { const dx = B[i].s - s, dy = B[i].u - u, q = dx * dx + dy * dy; if (q < best) best = q; }
  return { d: Math.sqrt(best), i: bi };
}
export function neDescHsu(s, u) {   // tinggi tanah jalur turun di (s, u) kerangka jalur; 0 di luar
  const D = NE_DESC, P = D.pts, n = P.length;
  if (s < D.edgeS - 2 || s > D.sEnd + 60 || Math.abs(u) > 43 + D.dLedge + D.Wc + 2) return 0;
  let dm = 1e18; const d2 = neDescHsu._d2 || (neDescHsu._d2 = new Float64Array(n));
  for (let i = 0; i < n; i++) { const dx = P[i].s - s, dy = P[i].u - u, q = dx * dx + dy * dy; d2[i] = q; if (q < dm) dm = q; }
  dm = Math.sqrt(dm); let sw = 0, sh = 0;
  for (let i = 0; i < n; i++) { const dd = Math.sqrt(d2[i]) - dm; if (dd > 10) continue; const w = Math.exp(-dd / D.tau); sw += w; sh += w * P[i].h; }
  let h = sh / sw;
  const e = Math.max(0, dm - D.dLedge), uu = e / D.Wc;
  if (uu >= 1) return 0;
  const nz = (Math.sin(s * 0.19 + u * 0.11) * Math.cos(u * 0.17 - s * 0.07) + 0.5 * Math.sin(s * 0.41 + u * 0.37)) * 1.5 * rSst(D.roadHW + 2.5, D.roadHW + 7, dm) * Math.min(1, h / 4);   // tebing bergerigi (jalan & ledge dekat jalan tetap rata)
  if (uu > 0) { const x = (1 - uu) * 3, k = Math.floor(x); h *= (k + rSst(0.62, 1, x - k)) / 3; }   // di luar pinggang jalan: turun bertingkat (3 undakan) ke tanah
  return Math.max(0, h + nz);
}
export const neDescH = (d, off) => neDescHsu(d - NE_DESC.d_p, off - NE_DESC.off_p);   // dari koordinat sumbu padang
export const neDescToAxis = (s, u) => ({ d: NE_DESC.d_p + s, off: NE_DESC.off_p + u });
export const neDescRiverS = u => NE_DESC.sR + 3.2 * Math.sin(0.09 * (u - NE_DESC.uEnd)) + 1.8 * Math.sin(0.23 * (u - NE_DESC.uEnd));   // s garis tengah sungai beku di lateral u (tepat s = sR di jembatan)
export function neDescZone(x, z, m = 0) {   // 0 = bukan di jalur turun; 1 = di jalan menuruni tebing; 2 = di lembah salju; 3 = di Hutan Salju (m > 0 = diperlebar, untuk histeresis pesan)
  const D = NE_DESC, a = nePlainAxis(x, z), s = a.d - D.d_p, u = a.off - D.off_p;
  if (s < D.edgeS - m || s > Math.max(D.sEnd + 70, D.forestS + D.forestR + 15) + m || Math.abs(u) > Math.max(140, Math.abs(D.uEnd) + D.forestR + 15) + m) return 0;   // batas ikut membesar bersama Hutan Salju
  if (Math.hypot(s - D.valleyS, u - D.uEnd) < D.valleyR - 6 + m) return 2;
  if (Math.hypot(s - D.forestS, u - D.uEnd) < D.forestR - 8 + m) return 3;   // Hutan Salju
  if (s > D.edgeS + 6 - m && neDescDist(s, u).d < 7 + m) return 1;
  return 0;
}
export const NE_DESC_CIRCLES = [];   // area jelajah: lingkaran sempit mengikuti jalan (pemain tidak bisa turun lewat tebing) + hamparan lembah
{
  const add = (s, u, r) => { const q = neDescToAxis(s, u), p = neAxisToWorld(q.d, q.off); NE_DESC_CIRCLES.push({ x: p.x, z: p.z, r }); };
  const P = NE_DESC.pts;
  for (let i = 0; i < P.length; i += 2) add(P[i].s, P[i].u, NE_DESC.roadHW + 1.0);   // jalan selebar 2·2,6 m; pagar kayu di ±3,1 m
  add(P[P.length - 1].s, P[P.length - 1].u, NE_DESC.roadHW + 1.0);
  add(NE_DESC.valleyS, NE_DESC.uEnd, NE_DESC.valleyR);   // lembah salju (di sekitar sungai & jembatan)
  add(NE_DESC.forestS, NE_DESC.uEnd, NE_DESC.forestR);   // Hutan Salju (di seberang jembatan)
}
NE_MTN_CIRCLES.push(...NE_DESC_CIRCLES);
// ---------- DESA SALJU HENING: desa kecil bersalju di SISI KANAN lembah (+u), di luar jangkauan monster ----------
//  Kerangka (s, u) sama dengan Jalur Turun (kanan = +u). Letaknya jauh di luar lingkaran Lembah Salju & Hutan Salju (zona 2 / 3): Yeti & Golem Es dikurung di zona itu (neDescZone < 2 -> tidak boleh melangkah),
//  jadi mereka tidak pernah bisa sampai ke sini. game.js menambah pengaman kedua (neVillageZone): monster tidak mau masuk / mengejar ke dalam desa & tidak muncul di dekatnya.
//  Jalan tanah bercabang dari jalan lembah (sebelum sungai beku), melengkung ke kanan di sisi hulu sungai (sungai berakhir di u ≈ 75), sampai gerbang pagar desa. Rumus dipakai bersama mesh (kekaisaran-dataran-tl.js) & game.js.
export const NE_VILLAGE = (() => {
  const V = { name: 'Desa Salju Hening', s: 296, u: 125, R: 31, fenceR: 29.5, gateAng: -Math.PI / 2, gateHW: 4.2, plazaR: 8.5, pathHW: 5.5 };   // gateAng: arah gerbang dari pusat desa (sudut dari +s ke +u): -π/2 = menghadap jalan (arah -u)
  const ctl = [[284, -43], [284, -24], [285.5, -4], [287, 18], [289, 42], [292, 66], [295, 86], [296, 98], [296, 111]], pts = [];   // titik kendali jalan: dari jalan lembah (u = -43) ke tengah desa
  for (let i = 0; i < ctl.length - 1; i++) {   // Catmull-Rom: jalan melengkung halus
    const p0 = ctl[Math.max(0, i - 1)], p1 = ctl[i], p2 = ctl[i + 1], p3 = ctl[Math.min(ctl.length - 1, i + 2)], n = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3));
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); pts.push({ s: f(p0[0], p1[0], p2[0], p3[0]), u: f(p0[1], p1[1], p2[1], p3[1]) }); }
  }
  pts.push({ s: ctl[ctl.length - 1][0], u: ctl[ctl.length - 1][1] });
  V.path = pts;
  return V;
})();
export function neVillageZone(x, z, m = 0) {   // titik dunia ada di dalam desa (m > 0 = diperlebar m meter: dipakai game.js sebagai sabuk pengaman monster & histeresis pesan)
  const a = nePlainAxis(x, z), V = NE_VILLAGE;
  return Math.hypot(a.d - NE_DESC.d_p - V.s, a.off - NE_DESC.off_p - V.u) < V.R + m;
}
export function neVillageKeep(x, z, pad = 0) {   // titik dunia ada di desa / koridor jalan desa: pohon & batu lembah dihilangkan dari sini (jalan & desa harus lapang)
  const a = nePlainAxis(x, z), s = a.d - NE_DESC.d_p, u = a.off - NE_DESC.off_p, V = NE_VILLAGE;
  if (Math.hypot(s - V.s, u - V.u) < V.R + 8 + pad) return true;
  if (s < V.s - V.R - 20 - pad || s > V.s + V.R + 20 + pad || u < -60 - pad || u > V.u + V.R + 20 + pad) return false;
  for (let i = 0; i < V.path.length; i++) if (Math.hypot(s - V.path[i].s, u - V.path[i].u) < 6.5 + pad) return true;
  return false;
}
export const NE_VILLAGE_CIRCLES = [];   // area jelajah: lingkaran desa + koridor jalan dari jalan lembah (pemain tidak bisa menyimpang ke tempat lain)
{
  const add = (s, u, r) => { const q = neDescToAxis(s, u), p = neAxisToWorld(q.d, q.off); NE_VILLAGE_CIRCLES.push({ x: p.x, z: p.z, r }); };
  const V = NE_VILLAGE; add(V.s, V.u, V.R + 0.5);
  for (let i = 0; i < V.path.length; i += 2) add(V.path[i].s, V.path[i].u, V.pathHW);
  const L = V.path[V.path.length - 1]; add(L.s, L.u, V.pathHW);
}
NE_MTN_CIRCLES.push(...NE_VILLAGE_CIRCLES);   // ikut area jelajah & ikut memuat chunk 'dataran-tl'
NE_MTN_CIRCLES.push(...NE_RIDGE_CIRCLES);
KEKAISARAN_CIRCLES.push(...NE_MTN_CIRCLES);   // ikut area jelajah (batas dunia / kekaisaranDist); chunk-nya sama dengan padang timur laut ('dataran-tl')
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
