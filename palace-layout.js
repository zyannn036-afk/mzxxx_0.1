// ============================================================
//  INTERIOR ISTANA ARUNIKA — data tata letak & fisika (murni angka, tanpa THREE)
//  Dipakai oleh palace.js (membangun tampilan), world.js (tabrakan) dan game.js (tinggi lantai & kamera).
//
//  Koordinat lokal: pusat istana = (0,0). x ke kanan (timur), z ke depan (selatan). Pintu masuk di ujung +z, singgasana di ujung -z.
//
//  LANTAI 1 (y = 0)                                   LANTAI 2 (y = F2)
//   z=-23 ┌────┬────┬───────────────┬────┬────┐        ┌────┬────┬───────────────┬────┬────┐
//         │Gdg │    │  Aula         │    │Hrt │        │    │    │   Balairung   │    │    │
//         │ .. │Lor │  Perjamuan    │Lor │ .. │        │ .. │Lor │  (singgasana) │Lor │ .. │
//    z=5  │    │ong │───────────────│ong │    │        │    │ong │───────┬ ┬─────│ong │    │
//         │ .. │    │  Aula Masuk   │    │ .. │        │ .. │    │ void  │T│ void│    │ .. │
//   z=23  └────┴────┴──────[pintu]──┴────┴────┘        └────┴────┴───────┴─┴─────┴────┴────┘
//  Tangga besar (T): x -3..3, naik ke utara dari z=17 (y=0) sampai z=5 (y=F2), keluar tepat di depan balairung.
//  Aula masuk dua lantai tingginya (kosong di atas tangga); sisinya dipagari dinding penuh.
// ============================================================
export const HW = 20, HL = 23;                 // setengah lebar & setengah panjang bangunan (dinding luar)
export const F2 = 6.0, SLAB = 0.4, H1 = F2 - SLAB, ROOF = 13;   // lantai 2, tebal pelat, tinggi langit-langit lantai 1, tinggi atap
export const T = 0.6;                          // tebal dinding
export const DOOR_H = 3.9, DOOR_W = 2.8;       // pintu biasa
export const MAIN_DOOR = { x: 0, w: 4.2, h: 4.6 };   // pintu utama (daun ganda, tertutup): menutup bukaan dinding selatan supaya dunia luar tidak terlihat
export const DH = 0.2;                         // tinggi panggung singgasana
export const STAIR = { x: 3, zTop: 5, zBot: 17, n: 30 };         // tangga besar (lebar 6)
export const VOID = { x0: -8, x1: 8, z0: 5, z1: HL };            // aula masuk: kosong setinggi dua lantai
export const DAIS = { x0: -5.8, x1: 5.8, z0: -HL, z1: -16.8 };  // panggung singgasana (lantai 2)
export const THRONE = { x: 0, z: -20.4 };

// ruang samping: [z0, z1, pusat pintu]; sisi timur x 12..20, sisi barat x -20..-12
export const SIDE_ROOMS = [[8, 23, 15.5], [-4, 8, 2], [-14, -4, -9], [-23, -14, -18.5]];
const RD = SIDE_ROOMS.map(r => [r[2], DOOR_W]);

// dinding: axis 'H' = memanjang sepanjang x di z = at; 'V' = memanjang sepanjang z di x = at. d1/d2 = pintu di lantai 1 / 2: [pusat, lebar, tinggi?]
export const WALLS = [
  { axis: 'H', at: -HL, a: -HW, b: HW, k: 'out' },
  { axis: 'H', at: HL, a: -HW, b: HW, k: 'out', d1: [[MAIN_DOOR.x, MAIN_DOOR.w, MAIN_DOOR.h]] },   // pintu utama (lantai 1)
  { axis: 'V', at: -HW, a: -HL, b: HL, k: 'out' },
  { axis: 'V', at: HW, a: -HL, b: HL, k: 'out' },
  // dinding aula <-> lorong, satu dinding utuh per sisi. Bagian selatan (z > 5) = aula masuk (pintu lantai 1 saja; di lantai 2 sisi ini tertutup),
  // bagian utara (z < 5) = aula perjamuan (lantai 1) / balairung (lantai 2).
  { axis: 'V', at: -8, a: -HL, b: HL, d1: [[-15, 3], [-3, 3], [19, 3.2]], d2: [[-7, 3.2, 4.4]] },
  { axis: 'V', at: 8, a: -HL, b: HL, d1: [[-15, 3], [-3, 3], [19, 3.2]], d2: [[-7, 3.2, 4.4]] },
  // balairung: dinding selatan dengan bukaan lebar untuk tangga (lantai 2). tg = bagian pelat lantai (trim) yang dilewati tangga: dikosongkan supaya tidak berimpit dengan anak tangga teratas
  { axis: 'H', at: 5, a: -8, b: 8, d2: [[0, 6.4, 5.4]], tg: [-STAIR.x - 0.3, STAIR.x + 0.3] },
  // lorong <-> ruang samping
  { axis: 'V', at: -12, a: -HL, b: HL, d1: RD, d2: RD },
  { axis: 'V', at: 12, a: -HL, b: HL, d1: RD, d2: RD },
  // sekat antar ruang samping
  ...[8, -4, -14].flatMap(z => [{ axis: 'H', at: z, a: 12, b: HW }, { axis: 'H', at: z, a: -HW, b: -12 }]),
];

// bagian dinding yang padat (di luar pintu) sepanjang sumbunya, untuk lantai tertentu. Ujung diperpanjang T/2 supaya sudut menutup rapat.
export function solids(w, lvl) {
  const ds = ((lvl === 1 ? w.d1 : w.d2) || []).map(d => [d[0] - d[1] / 2, d[0] + d[1] / 2]).sort((p, q) => p[0] - q[0]);
  const out = []; let cur = w.a - T / 2;
  for (const [c0, c1] of ds) { if (c0 > cur) out.push([cur, c0]); cur = c1; }
  if (cur < w.b + T / 2) out.push([cur, w.b + T / 2]);
  return out;
}
export const wallRect = (w, s0, s1) => w.axis === 'H'
  ? { x0: s0, x1: s1, z0: w.at - T / 2, z1: w.at + T / 2 }
  : { x0: w.at - T / 2, x1: w.at + T / 2, z0: s0, z1: s1 };

// pagar tangga (dua sisi) — berlaku di semua lantai (lvl 0)
const RAILS = [-1, 1].map(s => ({ x0: s > 0 ? STAIR.x + 0.02 : -STAIR.x - 0.22, x1: s > 0 ? STAIR.x + 0.22 : -STAIR.x - 0.02, z0: STAIR.zTop, z1: STAIR.zBot + 0.2, lvl: 0 }));

// semua kotak tabrakan dinding & pagar: { x0,x1,z0,z1,lvl } (lvl 1 / 2 / 0 = semua lantai)
export const WALL_RECTS = [];
for (const w of WALLS) for (const lvl of [1, 2]) for (const [s0, s1] of solids(w, lvl)) WALL_RECTS.push({ ...wallRect(w, s0, s1), lvl });
WALL_RECTS.push(...RAILS);
WALL_RECTS.push({ x0: MAIN_DOOR.x - MAIN_DOOR.w / 2, x1: MAIN_DOOR.x + MAIN_DOOR.w / 2, z0: HL - T / 2, z1: HL + T / 2, lvl: 1 });   // daun pintu utama (tertutup): menahan pemain & kamera

// ---------- Lantai & tinggi ----------
export const levelOf = y => (y > 2.9 ? 2 : 1);
const clamp01 = x => Math.min(1, Math.max(0, x));
// tinggi permukaan tempat berdiri di (x, z) (lokal). y = tinggi sekarang (untuk tahu sedang di lantai berapa)
export function groundY(x, z, y) {
  if (Math.abs(x) < STAIR.x + 0.2 && z > STAIR.zTop && z < STAIR.zBot) return F2 * (STAIR.zBot - z) / (STAIR.zBot - STAIR.zTop);   // di tangga: landai
  if (levelOf(y) !== 2) return 0;
  const d = Math.min(x - DAIS.x0, DAIS.x1 - x, DAIS.z1 - z);                                                                     // panggung singgasana: naik landai di tepinya
  return F2 + (d > 0 ? DH * clamp01(d / 0.5) : 0);
}
// tinggi langit-langit di titik (x, z) untuk lantai lvl (membatasi kamera)
export const ceilAt = (x, z, lvl) => lvl === 2 ? ROOF : (x > VOID.x0 && x < VOID.x1 && z > VOID.z0 ? ROOF : H1);

// ---------- Nama area (pesan saat berpindah ruangan) ----------
const SN = ['Gudang Istana', 'Ruang Jaga', 'Ruang Tamu', 'Ruang Harta'];    // lantai 1, sisi barat (z kecil -> besar dibalik di bawah)
export const ROOM_NAMES = {
  1: { E: ['Dapur Istana', 'Ruang Makan', 'Ruang Jaga', 'Gudang Istana'], W: ['Perpustakaan', 'Ruang Senjata', 'Ruang Tamu', 'Ruang Harta'] },
  2: { E: ['Kamar Putri', 'Ruang Musik', 'Ruang Rapat', 'Ruang Pakaian'], W: ['Kamar Ratu', 'Ruang Doa', 'Ruang Tamu Kerajaan', 'Ruang Juru Tulis'] },
};
export function areaAt(x, z, y) {
  const lvl = levelOf(y);
  if (Math.abs(x) < STAIR.x + 0.2 && z > STAIR.zTop && z < STAIR.zBot) return 'Tangga Agung';
  const ax = Math.abs(x);
  if (ax < 8) {
    if (z > 5) return lvl === 1 ? 'Aula Masuk' : 'Tangga Agung';
    return lvl === 1 ? 'Aula Perjamuan' : 'Balairung — Singgasana Raja';
  }
  if (ax < 12) return (x < 0 ? 'Lorong Barat' : 'Lorong Timur') + (lvl === 2 ? ' · Lantai 2' : '');
  const i = SIDE_ROOMS.findIndex(r => z >= r[0] && z < r[1]);
  return i < 0 ? '' : ROOM_NAMES[lvl][x > 0 ? 'E' : 'W'][i];
}

// ---------- Tabrakan: lingkaran (dari properti & NPC) + kotak (dinding, meja besar, dll.) ----------
// Semua dalam koordinat lokal. lvl: 1 / 2 / 0 (semua). Dipakai oleh palace.js (palace.collide) dan diuji terpisah.
export function pushCircle(pos, r, c) {            // dorong lingkaran pemain (pos, r) keluar dari lingkaran c
  const dx = pos.x - c.x, dz = pos.z - c.z, min = r + c.r, l2 = dx * dx + dz * dz;
  if (l2 >= min * min) return;
  const l = Math.sqrt(l2) || 1e-4; pos.x = c.x + dx / l * min; pos.z = c.z + dz / l * min;
}
export function pushRect(pos, r, b) {              // dorong lingkaran pemain keluar dari kotak b
  const cx = Math.min(b.x1, Math.max(b.x0, pos.x)), cz = Math.min(b.z1, Math.max(b.z0, pos.z));
  const dx = pos.x - cx, dz = pos.z - cz, l2 = dx * dx + dz * dz;
  if (l2 >= r * r) return;
  if (l2 > 1e-10) { const l = Math.sqrt(l2); pos.x = cx + dx / l * r; pos.z = cz + dz / l * r; return; }
  // titik pusat sudah di dalam kotak: keluar lewat sisi terdekat
  const dl = pos.x - b.x0, dr = b.x1 - pos.x, dt = pos.z - b.z0, db = b.z1 - pos.z, m = Math.min(dl, dr, dt, db);
  if (m === dl) pos.x = b.x0 - r; else if (m === dr) pos.x = b.x1 + r; else if (m === dt) pos.z = b.z0 - r; else pos.z = b.z1 + r;
}
// sinar kamera: dari (ox,oz) ke (tx,tz) — fraksi 0..1 sebelum menabrak kotak (diperlebar m). 1 = bebas.
export function rayRect(ox, oz, tx, tz, b, m) {
  const dx = tx - ox, dz = tz - oz; let t0 = 0, t1 = 1;
  for (const [o, d, lo, hi] of [[ox, dx, b.x0 - m, b.x1 + m], [oz, dz, b.z0 - m, b.z1 + m]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return 1; continue; }
    let a = (lo - o) / d, c = (hi - o) / d; if (a > c) { const s = a; a = c; c = s; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return 1;
  }
  return t0 > 0 ? t0 : 1;   // t0 = 0 -> titik awal sudah di dalam kotak yang diperlebar: abaikan (jangan menjepit kamera ke pemain)
}

// apakah titik (pos sepanjang sumbu dinding) jatuh di bukaan pintu / bingkainya pada dinding w untuk lantai lvl? pad = jarak aman tambahan
export function nearDoor(w, pos, lvl, pad = 0.5) {
  return ((lvl === 1 ? w.d1 : w.d2) || []).some(d => Math.abs(pos - d[0]) < d[1] / 2 + 0.24 + pad);
}
