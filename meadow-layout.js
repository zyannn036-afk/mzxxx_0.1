// ============================================================
//  PADANG RUMPUT ARUNIKA — data tata letak (murni angka, tanpa THREE)
//  Hamparan rumput hijau yang panjang di sebelah timur Kota Arunika. Mulai dari Gerbang Timur kota (city-layout.js: EAST_GATE),
//  lalu jalan tanah berkelok ke timur sepanjang ±1.600 m (melewati Sungai Bening dan jembatan kayunya), dan (nanti) berujung di Kota Kekaisaran.
//  Dipakai oleh meadow.js (membangun isi padang), world.js (chunk), forest-layout.js (batas dunia) dan game.js (pesan masuk padang).
//
//  Dunia tetap satu hamparan: area jelajahnya = rantai lingkaran di sepanjang jalan (koridor selebar ±85 m),
//  di tepinya tumbuh sabuk pohon supaya batas tak kasat mata itu terlihat seperti tepi hutan.
// ============================================================
import { CITY, EAST_GATE } from './city-layout.js';

export const MEADOW = { name: 'Padang Rumput Arunika' };

const GZ = CITY.z + EAST_GATE.v;                 // z tengah Gerbang Timur kota (world)
const GX = CITY.x + 100;                         // tepi timur lantai batu kota: jalan tanah mulai dari sini

// Ujung Padang Rumput = gerbang perbatasan kayu (di meadow.js sekarang TERBUKA) menuju Ladang Sawah Gemah Ripah (sawah-layout.js).
// Kota Kekaisaran (BELUM dibangun) sekarang ada di ujung ladang sawah: lihat KEKAISARAN di sawah-layout.js (open: false -> gerbangnya masih tertutup).
// (IMPERIAL.x/z tetap dipakai sebagai titik ujung jalan padang = titik awal jalan ladang sawah.)
export const IMPERIAL = { name: 'Kota Kekaisaran', open: false, x: GX + 1570, z: GZ + 58 };

// titik kendali jalan (world). Kurva S yang landai dan panjang: naik ke tenggara, turun lagi, naik, turun ke utara, lalu naik pelan menuju Kota Kekaisaran.
// (Sampai GX + 690 sama seperti semula; sesudahnya ditambah ±880 m.)
export const MEADOW_ROAD = [
  [GX, GZ], [GX + 40, GZ + 2], [GX + 90, GZ + 10], [GX + 150, GZ + 24], [GX + 210, GZ + 36], [GX + 270, GZ + 40], [GX + 330, GZ + 34],
  [GX + 390, GZ + 22], [GX + 450, GZ + 12], [GX + 510, GZ + 10], [GX + 570, GZ + 18], [GX + 630, GZ + 30], [GX + 690, GZ + 40],
  [GX + 750, GZ + 46], [GX + 815, GZ + 48], [GX + 880, GZ + 42], [GX + 945, GZ + 30], [GX + 1010, GZ + 16], [GX + 1075, GZ + 4],
  [GX + 1140, GZ - 4], [GX + 1205, GZ - 4], [GX + 1270, GZ + 6], [GX + 1335, GZ + 20], [GX + 1400, GZ + 36], [GX + 1465, GZ + 50],
  [GX + 1520, GZ + 56], [IMPERIAL.x, IMPERIAL.z],
];

// Catmull-Rom 2D -> titik rapat (±6 m)
export function smooth(pts, per) {
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t, f = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push({ x: f(0), z: f(1) });
    }
  }
  const l = pts[n - 1]; out.push({ x: l[0], z: l[1] });
  let s = 0; out.forEach((p, i) => { if (i) s += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z); p.s = s; });   // s = jarak sepanjang jalan dari gerbang kota
  return out;
}
export const MEADOW_PTS = smooth(MEADOW_ROAD, 12);
export const MEADOW_LEN = MEADOW_PTS[MEADOW_PTS.length - 1].s;
// titik di jalan pada jarak s (interpolasi)
export function roadAt(s) {
  const P = MEADOW_PTS; s = Math.min(MEADOW_LEN, Math.max(0, s));
  let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], t = (s - a.s) / ((b.s - a.s) || 1), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  return { x: a.x + dx * t, z: a.z + dz * t, tx: dx / l, tz: dz / l, s };
}

// ---------- Area jelajah ----------
// Lingkaran tiap ±24 m sepanjang jalan, jari-jari 36..48 m (tepinya sengaja bergelombang supaya tidak terlihat seperti koridor lurus).
// Berhenti sebelum ujung; ujungnya ditutup lingkaran kecil + pagar perbatasan (lihat PERBATASAN di bawah).
export const MEADOW_CIRCLES = [];
for (let s = 0, i = 0; s < MEADOW_LEN - 64; s += 24, i++) { const p = roadAt(s); MEADOW_CIRCLES.push({ x: p.x, z: p.z, r: 42 + 6 * Math.sin(i * 1.7) + 2 * Math.sin(i * 0.5) }); }
{ const p = roadAt(MEADOW_LEN - 34); MEADOW_CIRCLES.push({ x: p.x, z: p.z, r: 34 }); }   // penutup ujung

// Pagar / gerbang perbatasan di ujung jalan: garis tegak lurus jalan di s = MEADOW_LEN - 8, selebar ±PERBATASAN.half dari jalan.
export const PERBATASAN = (() => { const p = roadAt(MEADOW_LEN - 8); return { x: p.x, z: p.z, tx: p.tx, tz: p.tz, yaw: Math.atan2(p.tx, p.tz), half: 34, gap: 3.2 }; })();   // gap = setengah lebar pintu gerbang

// jarak ke tepi padang: negatif = di dalam
export function meadowDist(x, z) {
  let m = Infinity;
  for (let i = 0; i < MEADOW_CIRCLES.length; i++) { const c = MEADOW_CIRCLES[i], d = Math.hypot(x - c.x, z - c.z) - c.r; if (d < m) m = d; }
  return m;
}
// jarak ke garis tengah jalan (m) dan posisi sepanjang jalan (s) titik terdekat
export function roadDist(x, z) {
  let m = Infinity, s = 0; const P = MEADOW_PTS;
  for (let i = 0; i < P.length; i++) { const d = Math.hypot(x - P[i].x, z - P[i].z); if (d < m) { m = d; s = P[i].s; } }
  return { d: m, s };
}

// ---------- Sungai Bening ----------
// Sungai lebar yang memotong padang dari utara ke selatan sambil berkelok. Satu-satunya jalan ke seberang = jembatan kayu tempat jalan tanah lewat
// (tepi air ditutup collider di meadow.js). Bentuk alirannya ditulis dalam "bingkai jalan" di titik silang: a = searah jalan, b = tegak lurus jalan (+ = selatan),
// jadi di jembatan sungai selalu tegak lurus jalan, ke mana pun jalan itu menghadap. Aliran: dari utara (b negatif) ke selatan.
export const RIVER = { name: 'Sungai Bening', s: 430, w: 10, mud: 1.6 };   // s = jarak titik silang dari gerbang kota (m sepanjang jalan), w = lebar air, mud = lebar tepi lumpur di tiap sisi
const RIVER_SHAPE = [[22, -122], [30, -98], [22, -74], [6, -52], [-8, -32], [-1.5, -12], [0, 0], [1.5, 12], [10, 32], [24, 54], [30, 78], [20, 102], [4, 124], [1, 138], [0, 148], [0, 162]];   // [a, b]  (ekor terakhir: sungai berujung di Reruntuhan Kuno, lihat RUINS di bawah)
const RC = roadAt(RIVER.s), RN = { x: -RC.tz, z: RC.tx };                    // RC = titik silang di jalan, RN = arah "selatan" tegak lurus jalan
// titik-titik rapat (±1,5 m) di sepanjang aliran. Hulu (utara) dipotong sampai ±24 m di luar tepi padang (sisanya tertutup sabuk pohon / bukit);
// hilir (selatan) TIDAK dipotong: sungai terus mengalir keluar padang lewat celah di sabuk pohon sampai ke Reruntuhan Kuno (rahasia).
export const RIVER_PTS = (() => {
  const all = smooth(RIVER_SHAPE.map(([a, b]) => [RC.x + RC.tx * a + RN.x * b, RC.z + RC.tz * a + RN.z * b]), 16);
  let c = 0, best = Infinity; all.forEach((p, i) => { const d = Math.hypot(p.x - RC.x, p.z - RC.z); if (d < best) { best = d; c = i; } });
  let i0 = c;
  while (i0 > 0 && meadowDist(all[i0].x, all[i0].z) < 24) i0--;
  return all.slice(i0);
})();
// jembatan kayu: berpusat di titik silang, memanjang searah jalan. len = panjang (tepi ke tepi, melewati lumpur), w = lebar lantai
export const RIVER_BRIDGE = { x: RC.x, z: RC.z, tx: RC.tx, tz: RC.tz, yaw: Math.atan2(RC.tx, RC.tz), len: RIVER.w + 2 * (RIVER.mud + 1.6), w: 4.8 };
const RB = (() => {   // kotak pembatas sungai (+ margin) supaya riverEdge() murah untuk titik yang jauh dari sungai
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of RIVER_PTS) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const m = RIVER.w / 2 + 30; return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
})();
// jarak ke tepi air terdekat (m): negatif = di dalam air. Untuk titik yang jauh dari sungai (> ±30 m dari kotaknya) nilainya cuma "besar" (99), bukan jarak sebenarnya.
export function riverEdge(x, z) {
  if (x < RB.x0 || x > RB.x1 || z < RB.z0 || z > RB.z1) return 99;
  let m = Infinity; for (let i = 0; i < RIVER_PTS.length; i++) { const p = RIVER_PTS[i], d = Math.hypot(x - p.x, z - p.z); if (d < m) m = d; }
  return m - RIVER.w / 2;
}

// ---------- Reruntuhan Kuno (RAHASIA) ----------
// Di ujung hilir Sungai Bening: sungai keluar dari padang lewat celah sempit di sabuk pohon sebelah selatan, lalu masuk ke gerbang air batu
// dan berakhir di kolam di tengah reruntuhan. TIDAK ADA papan / jalan menuju ke sana: pemain menemukannya dengan menyusuri sungai ke selatan.
// Semua koordinat memakai "bingkai sungai" yang sama dengan RIVER_SHAPE: a = searah jalan di jembatan (timur), b = tegak lurus jalan ke selatan.
export const RIVER_FRAME = { x: RC.x, z: RC.z, tx: RC.tx, tz: RC.tz, yaw: Math.atan2(RN.x, RN.z) };   // group.position = (x, 0, z), group.rotation.y = yaw -> koordinat lokal (a, b) = (x, z) lokal
export const toRiverWorld = (a, b) => ({ x: RC.x + RC.tx * a + RN.x * b, z: RC.z + RC.tz * a + RN.z * b });
export const RUINS = {
  name: 'Reruntuhan Kuno', storageKey: 'dungeon.ruins.v1',
  a: 0, b: 168, r: 20,            // pusat & jari-jari lantai batu (bingkai sungai)
  gateB: 146, poolB: 164, poolR: 7.4, altarB: 184,
  ...toRiverWorld(0, 168),        // x, z dunia (pusat lantai batu)
};
// area jelajah rahasia: rantai lingkaran di sepanjang sungai dari tepi padang ke selatan (± 11 m dari sungai: kedua tepi bisa dilalui) + halaman reruntuhan
export const RUINS_CIRCLES = (() => {
  const out = []; let last = null;
  for (const p of RIVER_PTS) {
    if ((p.x - RC.x) * RN.x + (p.z - RC.z) * RN.z < 0) continue;   // hanya hilir (selatan titik silang); hulu di utara tetap tertutup
    if (meadowDist(p.x, p.z) < -10) continue;
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 7) continue;
    out.push({ x: p.x, z: p.z, r: 11 }); last = p;
  }
  const g = toRiverWorld(0, RUINS.gateB + 4); out.push({ x: g.x, z: g.z, r: 14 });
  out.push({ x: RUINS.x, z: RUINS.z, r: RUINS.r + 7 });
  return out;
})();
// jarak ke tepi area rahasia: negatif = di dalam
export function ruinsDist(x, z) {
  let m = Infinity;
  for (let i = 0; i < RUINS_CIRCLES.length; i++) { const c = RUINS_CIRCLES[i], d = Math.hypot(x - c.x, z - c.z) - c.r; if (d < m) m = d; }
  return m;
}

// Padang dibangun dalam beberapa chunk (urut dari kota, ±260 m per bagian; bagian terakhir sedikit lebih panjang): batas x tiap bagian.
// Tiap chunk hanya digambar saat pemain cukup dekat. Sungai & jembatan dimiliki chunk yang memuat titik silangnya (lihat meadow.js).
export const MEADOW_SEG_X = (() => { const END = IMPERIAL.x + 60, xs = [GX]; while (xs[xs.length - 1] + 260 * 1.4 < END) xs.push(xs[xs.length - 1] + 260); xs.push(END); return xs; })();

// Titik-titik khusus (dipakai meadow.js & bisa dipakai misi nanti)
export const MEADOW_SPOTS = {
  rest: roadAt(MEADOW_LEN * 0.5),     // pos istirahat di tengah perjalanan
  signEvery: 125,                     // papan petunjuk tiap sekian m sepanjang jalan
  ponds: [{ s: 170, side: -1, off: 24, r: 7 }, { s: 560, side: 1, off: 26, r: 8.5 }, { s: 1040, side: -1, off: 24, r: 7.5 }, { s: 1330, side: 1, off: 26, r: 8.5 }],   // kolam: s = jarak sepanjang jalan, side = sisi (-1 kiri/utara, 1 kanan/selatan), off = jarak dari jalan
};
