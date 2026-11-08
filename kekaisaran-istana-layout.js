// ============================================================
//  ISTANA KEKAISARAN — INTERIOR LANTAI 1: AULA RAJA (data tata letak; murni angka, tanpa THREE)
//  Interior ini ada DI DALAM badan istana yang sudah berdiri (aula utama 34 x 26 m + menara gerbang di depannya):
//  pemain masuk lewat pintu agung di portico, layar memudar, lalu pemain dipindah ke dalam (sama seperti Katedral & Istana Arunika).
//  Dinding luar tetap milik kekaisaran.js; dinding dalam dibangun kekaisaran-aula.js (sedikit menjorok ke dalam agar tidak saling tumpang).
//
//  Koordinat = lokal kota (x ke depan / searah jalan ladang, z ke kanan; pusat istana = (0,0)). Istana menghadap Gerbang Utama (-x).
//    menara gerbang (serambi): x -16.5…-7.5, z -7…7        aula utama: x -11…15, z -17…17        (ruang takhta berkubah di belakang: x 15…25, belum dibuka)
//  Dipakai oleh kekaisaran-aula.js (isi ruangan + tabrakan), world.js (API) dan game.js (pintu masuk / keluar).
//  Tahap sekarang: HANYA Aula Raja (lantai 1). Ruangan lain & lantai 2 menyusul: tambahkan kotak baru di AULA_RECTS.
// ============================================================
import { toWorld, toLocal } from './kekaisaran-layout.js';
const PI = Math.PI;

export const AULA_NAME = 'Aula Raja';
export const FLOOR_Y = 0.72;                       // tinggi lantai dalam (tepat di atas lantai alas istana yang setinggi 0,7)

// ---------- Ruangan (kotak dalam koordinat lokal kota). h = tinggi langit-langit dari lantai ----------
export const AULA_RECTS = [
  { id: 'serambi', name: 'Serambi Agung', x0: -16.0, x1: -10.5, z0: -4.5,  z1: 4.5,  h: 9.6  },   // di dalam menara gerbang
  { id: 'aula',    name: 'Aula Raja',     x0: -10.5, x1: 14.5,  z0: -16.5, z1: 16.5, h: 12.4 },
  // sayap kiri (-z) & kanan (+z) dari arah pintu masuk; dindingnya mulai x = -3,2 agar bebas dari menara sudut sayap
  { id: 'dewan',        name: 'Ruang Dewan',            x0: -3.2, x1: 13.5, z0: -28.5, z1: -17.5, h: 10.4 },
  { id: 'perpustakaan', name: 'Perpustakaan Kerajaan',  x0: -3.2, x1: 13.5, z0: 17.5,  z1: 28.5,  h: 10.4 },
];
export const SIDE_DOOR = { x: 4.5, hw: 1.8, hy: 3.2 };                  // pintu lengkung aula -> sayap (di dinding samping aula, z = ±16,5)
export const ROOM_X = { x0: -3.2, x1: 13.5, xc: 5.15 };
// jembatan antar-ruangan (hanya untuk tabrakan; menutup celah 2 x radius pemain di ambang lengkung)
export const AULA_BRIDGES = [{ x0: -11.6, x1: -9.4, z0: -4.5, z1: 4.5 }];
for (const s of [-1, 1]) { const a = 15.4, b = 18.6; AULA_BRIDGES.push({ x0: SIDE_DOOR.x - SIDE_DOOR.hw, x1: SIDE_DOOR.x + SIDE_DOOR.hw, z0: s > 0 ? a : -b, z1: s > 0 ? b : -a }); }   // terowongan pintu sayap

// ---------- Panggung singgasana: 3 anak tangga (tiap 1 m dalam, 0,4 m tinggi) lalu pelataran setinggi 1,2 m ----------
export const DAIS = { x0: 8.0, x1: 14.5, z: 6.5, steps: 3, treadD: 1.0, stepH: 0.4 };
DAIS.top = DAIS.steps * DAIS.stepH;                // 1,2
DAIS.platX0 = DAIS.x0 + DAIS.steps * DAIS.treadD;  // 11
export const THRONE = { x: 13.2, z: 0 };           // singgasana menghadap -x (ke pintu)

// ---------- Perabot (dipakai bersama oleh pembangun & tabrakan) ----------
export const COLS = { xs: [-7, -2, 3, 8], z: 8.5, r: 0.7, cr: 0.95 };          // 2 baris tiang: z = ±8,5
export const WINDOWS_X = [-7.5, -1.5, 10.5];                                       // jendela lengkung di kedua dinding samping
export const KNIGHT_X = [-4.5, 1.5, 7.5, 13.0];                                  // patung ksatria di kaki kedua dinding samping
export const KNIGHT_Z = 15.5;
export const BRAZIER = { x: 5.5, z: 4.4 };                                       // dua perapian di kiri-kanan jalur karpet
export const CHANDELIERS = [{ x: -4, z: 0 }, { x: 3.5, z: 0 }, { x: 11, z: 0 }]; // tiga lampu gantung di sumbu tengah

// ---------- Ruang Dewan (kiri, z negatif): meja rapat panjang + 10 kursi, peta kota di dinding luar, perapian di dinding ujung ----------
export const DEWAN = { zc: -23, table: { x: ROOM_X.xc, len: 8.0, w: 2.2 }, fireplace: { x: 13.5, z: -23 } };
DEWAN.chairs = [];
for (const dx of [-3, -1, 1, 3]) for (const sd of [-1, 1]) DEWAN.chairs.push({ x: ROOM_X.xc + dx, z: DEWAN.zc + sd * 1.75, ry: sd > 0 ? PI : 0 });   // menghadap meja
DEWAN.chairs.push({ x: ROOM_X.xc - 4.9, z: DEWAN.zc, ry: PI / 2 }, { x: ROOM_X.xc + 4.9, z: DEWAN.zc, ry: -PI / 2 });                            // kursi kepala di kedua ujung
// ---------- Perpustakaan Kerajaan (kanan, z positif): rak buku di dinding, 2 meja baca, bola dunia ----------
export const PERPUS = { zc: 23, tables: [{ x: 1.8, z: 22.2 }, { x: 8.4, z: 22.2 }], globe: { x: 11.6, z: 25.2 } };

// ---------- Lingkaran tabrakan (lokal kota) ----------
export const AULA_CIRCLES = [];
for (const x of COLS.xs) for (const s of [-1, 1]) AULA_CIRCLES.push({ x, z: s * COLS.z, r: COLS.cr });
for (const x of KNIGHT_X) for (const s of [-1, 1]) AULA_CIRCLES.push({ x, z: s * KNIGHT_Z, r: 0.75 });
for (const s of [-1, 1]) AULA_CIRCLES.push({ x: BRAZIER.x, z: s * BRAZIER.z, r: 0.7 });
for (const x of [2.0, 3.6, ROOM_X.xc, 6.7, 8.3]) AULA_CIRCLES.push({ x, z: DEWAN.zc, r: 1.25 });                       // meja rapat
for (const c of DEWAN.chairs) AULA_CIRCLES.push({ x: c.x, z: c.z, r: 0.4 });
AULA_CIRCLES.push({ x: DEWAN.fireplace.x - 0.3, z: DEWAN.fireplace.z, r: 1.2 });                                          // perapian
for (const t of PERPUS.tables) for (const dx of [-0.6, 0.6]) AULA_CIRCLES.push({ x: t.x + dx, z: t.z, r: 0.95 });         // meja baca
AULA_CIRCLES.push({ x: PERPUS.globe.x, z: PERPUS.globe.z, r: 0.85 });
for (const dz of [-0.55, 0.55]) AULA_CIRCLES.push({ x: THRONE.x + 0.4, z: dz, r: 1.0 });   // singgasana
// (tepi samping panggung bukan lingkaran: lihat aturan jalur di collide() kekaisaran-aula.js; naik ke panggung hanya lewat tangga depan)

// ---------- Pintu & titik pindah (dunia) ----------
export const AULA = {
  name: AULA_NAME,
  door: (() => { const p = toWorld(-17.8, 0); return { x: p.x, z: p.z, r: 2.2 }; })(),   // di portico, tepat di depan pintu agung
  spawnIn: (() => { const p = toWorld(-12.8, 0), a = toWorld(0, 0), b = toWorld(1, 0); return { x: p.x, z: p.z, face: Math.atan2(b.x - a.x, b.z - a.z) }; })(),    // di serambi, menghadap ke dalam (+x kota)
  spawnOut: (() => { const p = toWorld(-22.6, 0), a = toWorld(0, 0), b = toWorld(1, 0); return { x: p.x, z: p.z, face: Math.atan2(a.x - b.x, a.z - b.z) }; })(),  // di atas tangga luar, menghadap Gerbang Utama
};
// pemain di ujung serambi (dekat pintu agung) = keluar
export const inAulaExit = (x, z) => { const p = toLocal(x, z); return p.x < -15.0 && Math.abs(p.z) < 3.8; };

// ============================================================
//  LANTAI 2: galeri melingkar di sisi aula (lorong terbuka ke ruang aula, berpagar) + 5 kamar tidur di belakangnya.
//  Dua tangga berbelok (bentuk L; kiri & kanan, di bagian depan aula) naik ke galeri. Lantai atas = FLOOR_Y + F2.h.
//  Tabrakan: pemain dianggap di lantai atas bila y > FLOOR_Y + F2.up (lihat kekaisaran-aula.js).
// ============================================================
export const F2 = {
  h: 5.0, slabT: 0.4, ceil: 4.4, up: 1.5,        // tinggi lantai atas, tebal pelat, tinggi kamar, batas y "di lantai atas"
  x0: -2.0, x1: 14.5,                            // galeri & kamar membentang di x ini (di kedua sisi aula, z = ±9,65 … ±16,5)
  rail: 9.65, wallZ: 12.0, wallT: 0.3,           // pagar di sisi aula; dinding depan kamar di z = ±12
  // TANGGA BERBELOK (bentuk L, tiap sisi): kaki tangga menghadap ke tengah aula (arah z), naik n1 anak tangga sampai BORDES (anak tangga ke-n1, lebar penuh),
  // lalu berbelok 90° dan lari lurus sepanjang +x (n2 anak tangga) masuk ke galeri. Sebelumnya tangga satu garis lurus yang kakinya menempel dinding depan aula.
  lx0: -10.2, lx1: -8.2,                         // lebar lari bawah & bordes di x (lari bawah + bordes = lx0 … lx1)
  stairX0: -10.2, stairX1: -2.0, sz0: 9.65, sz1: 11.85, steps: 26, n1: 8, run1: 0.30,   // sz0…sz1 = bordes & lari atas (|z|); lari bawah di |z| = foot … sz0
};
F2.rise = F2.h / F2.steps; F2.n2 = F2.steps - F2.n1; F2.run2 = (F2.stairX1 - F2.lx1) / F2.n2;
F2.foot = F2.sz0 - (F2.n1 - 1) * F2.run1;        // |z| kaki tangga (di tengah aula, menghadap sumbu karpet)
// tinggi tangga (relatif lantai 1) di (x, z) lokal; null bila di luar tangga. Naik mulus tepat sebelum tepi tiap anak tangga.
const smooth = f => { const k = Math.min(1, f / 0.35); return k * k * (3 - 2 * k); };
export const stairH = (x, z) => {
  const az = Math.abs(z);
  if (x >= F2.lx0 && x <= F2.lx1 && az >= F2.foot && az <= F2.sz1) {            // lari bawah (n1-1 anak tangga) + bordes (tinggi n1 * rise)
    const u = az - F2.foot, i = Math.min(F2.n1 - 1, Math.floor(u / F2.run1)); return F2.rise * (i + smooth((u - i * F2.run1) / F2.run1)); }
  if (x > F2.lx1 && x <= F2.stairX1 && az >= F2.sz0 && az <= F2.sz1) {          // lari atas sepanjang +x sampai galeri
    const t = (x - F2.lx1) / F2.run2, i = Math.min(F2.n2 - 1, Math.floor(t)); return F2.rise * (F2.n1 + i + smooth(t - i)); }
  return null;
};
// kamar: s = sisi (−1 kiri, +1 kanan). Tiap kamar punya PINTU TERTUTUP di dinding depan galeri (z = ±12), tepat di x = cx.
// Melangkah ke pintu = layar memudar & pemain dipindah ke ruang kamar yang lebar & terpisah (lihat KAMAR di bawah), sama seperti masuk ke istana.
// Dinding galeri utuh (tidak ada sekat / celah pintu yang menghalangi jalan).
const mkRoom = (id, name, s, x0, x1, c) => ({ id, name, s, x0, x1, cx: (x0 + x1) / 2, color: c });
export const F2_ROOMS = [
  mkRoom('ratu',    'Kamar Ratu',    -1, -2.0, 4.0,  0x7a2a5a),
  mkRoom('raja',    'Kamar Raja',    -1, 4.0, 14.5,  0x9a1f2e),
  mkRoom('pangeran','Kamar Pangeran', 1, -2.0, 4.0,  0x1f3a7a),
  mkRoom('putri',   'Kamar Putri',    1, 4.0, 9.25,  0x8a4a8a),
  mkRoom('tamu',    'Kamar Tamu',     1, 9.25, 14.5, 0x2f6a3a),
];
export const F2_DOOR = { hw: 0.9, h: 2.9 };
// kotak yang bisa dilalui di lantai atas (lokal kota)
export const F2_RECTS = [];
export const F2_BRIDGES = [];
export const F2_WALLS = [];    // dinding tipis "pagar tangga" yang hanya berlaku bagi pemain di lantai bawah (agar tidak naik dari samping)
for (const s of [-1, 1]) {
  const a = s > 0 ? F2.rail : -F2.wallZ + F2.wallT / 2, b = s > 0 ? F2.wallZ - F2.wallT / 2 : -F2.rail;
  F2_RECTS.push({ id: 'galeri' + s, name: 'Galeri Lantai 2', x0: F2.x0, x1: F2.x1 - 0.1, z0: a, z1: b });
  const zr = (a, b) => s > 0 ? { z0: a, z1: b } : { z0: -b, z1: -a };   // rentang |z| -> z bertanda untuk sisi s
  F2_RECTS.push({ id: 'tangga' + s, name: 'Tangga Lantai 2', x0: F2.lx0, x1: F2.x0 + 1.5, ...zr(F2.sz0, F2.sz1) });                  // bordes + lari atas
  F2_RECTS.push({ id: 'tanggaA' + s, name: 'Tangga Lantai 2', x0: F2.lx0, x1: F2.lx1, ...zr(F2.foot, F2.sz0) });                    // lari bawah (dipakai saat pemain sudah > batas 'lantai atas')
  F2_BRIDGES.push({ x0: F2.lx0, x1: F2.lx1, ...zr(F2.sz0 - 1.0, F2.sz0 + 1.0) });   // jembatan di sambungan lari bawah - bordes (menutup celah 2 x radius pemain antar-kotak)
  // pagar tangga (hanya berlaku di lantai bawah, agar tidak bisa naik dari samping): 0,9 m pertama lari bawah boleh dimasuki dari samping (undakan masih rendah)
  F2_WALLS.push({ x0: F2.lx1 + 0.1, x1: F2.lx1 + 0.3, ...zr(F2.foot + 0.9, F2.sz0 + 0.1) },                                         // sisi timur lari bawah
    { x0: F2.lx1 + 0.1, x1: F2.stairX1, ...zr(F2.sz0 - 0.3, F2.sz0 - 0.1) },                                                          // sisi aula lari atas
    { x0: F2.lx0, x1: F2.stairX1, ...zr(F2.sz1 + 0.1, F2.sz1 + 0.3) },                                                                // sisi dinding luar (bordes & lari atas)
    { x0: F2.stairX1 - 0.2, x1: F2.stairX1, ...zr(F2.sz0, F2.sz1) });                                                                 // ujung atas (jangan naik dari bawah galeri)
}
// pintu kamar di dinding galeri: pemain di lantai atas yang berdiri di depan daun pintu (dalam ±1 m dari dinding)
export const roomDoorAt = (x, z) => F2_ROOMS.find(r => r.s * z > F2.wallZ - 1.0 && Math.abs(x - r.cx) < F2_DOOR.hw + 0.1) || null;
export const F2_FURN = [];                   // (perabot kamar kini di KAMAR_FURN)
export const F2_CIRCLES = [];

// ============================================================
//  RUANG KAMAR (lebar, terpisah): setiap kamar adalah satu ruangan besar yang dibangun di bawah tanah istana (lantai di FLOOR_Y + KAMAR.dy),
//  pada koordinat lokal yang sama untuk kelima kamar (hanya satu yang tampil pada satu waktu). Masuk lewat pintu tertutup di galeri,
//  keluar lewat pintu tertutup di dinding barat kamar (x = x0). Tabrakan kamar memakai KAMAR_RECT + KAMAR_CIRCLES saja.
// ============================================================
export const KAMAR = { W: 18, D: 13, h: 5.6, dy: -40, cx: 5, cz: 0, doorHW: 1.1, doorH: 3.2 };
export const KAMAR_RECT = { x0: KAMAR.cx - KAMAR.W / 2, x1: KAMAR.cx + KAMAR.W / 2, z0: KAMAR.cz - KAMAR.D / 2, z1: KAMAR.cz + KAMAR.D / 2 };
export const KAMAR_SPAWN = { x: KAMAR_RECT.x0 + 2.6, z: KAMAR.cz };                       // muncul di dalam pintu, menghadap +x (ke tempat tidur)
export const inKamarExit = (x, z) => x < KAMAR_RECT.x0 + 1.05 && Math.abs(z - KAMAR.cz) < KAMAR.doorHW + 0.3;
// perabot: k = bed | night | ward | shelf | sofa | tablec | table | chair | rug ; ry = putaran (sumbu y); rug punya w, d
const { x0: KX0, x1: KX1, z0: KZ0, z1: KZ1 } = KAMAR_RECT;
export const KAMAR_FURN = [
  { k: 'bed', x: KX1 - 1.4, z: 0, ry: -PI / 2 },
  { k: 'night', x: KX1 - 0.5, z: -1.45, ry: -PI / 2 }, { k: 'night', x: KX1 - 0.5, z: 1.45, ry: -PI / 2 },
  { k: 'ward', x: KX1 - 5.2, z: KZ0 + 0.32, ry: 0 }, { k: 'ward', x: KX1 - 3.9, z: KZ0 + 0.32, ry: 0 },
  { k: 'ward', x: KX1 - 5.2, z: KZ1 - 0.32, ry: PI }, { k: 'ward', x: KX1 - 3.9, z: KZ1 - 0.32, ry: PI },
  { k: 'shelf', x: 2.5, z: KZ0 + 0.26, ry: 0 },
  { k: 'sofa', x: -0.6, z: KZ0 + 0.55, ry: 0 }, { k: 'tablec', x: -0.6, z: KZ0 + 2.1, ry: 0 },
  { k: 'table', x: 3.0, z: KZ1 - 0.4, ry: 0 }, { k: 'chair', x: 3.0, z: KZ1 - 1.35, ry: 0 },
  { k: 'rug', x: 6.8, z: 0, ry: 0, w: 7.0, d: 4.6 },
];
export const KAMAR_CIRCLES = [];
for (const f of KAMAR_FURN) {
  const ax = Math.cos(f.ry), az = -Math.sin(f.ry), lx = Math.sin(f.ry), lz = Math.cos(f.ry);   // sumbu lebar (x lokal) & sumbu panjang (z lokal) perabot di dunia lokal
  const c = (d, along, r) => KAMAR_CIRCLES.push({ x: f.x + (along === 'w' ? ax : lx) * d, z: f.z + (along === 'w' ? az : lz) * d, r });
  if (f.k === 'bed') for (const d of [-0.55, 0.55]) c(d, 'l', 0.85);
  else if (f.k === 'night') c(0, 'w', 0.4);
  else if (f.k === 'ward') for (const d of [-0.5, 0.5]) c(d, 'w', 0.6);
  else if (f.k === 'shelf') for (const d of [-0.7, 0.7]) c(d, 'w', 0.55);
  else if (f.k === 'sofa') for (const d of [-0.6, 0.6]) c(d, 'w', 0.65);
  else if (f.k === 'tablec') c(0, 'w', 0.55);
  else if (f.k === 'table') c(0, 'w', 0.75);
  else if (f.k === 'chair') c(0, 'w', 0.35);
}

// ============================================================
//  DAPUR ISTANA (lantai 1): ruang di belakang aula, di sisi kanan (+z), lewat pintu lengkung di dinding belakang aula (x = 14,5, z = 13,6).
//  Menggantikan pintu semu kanan di dinding belakang. Dipakai kekaisaran-aula.js (isi ruangan) & tabrakan (AULA_RECTS / AULA_BRIDGES / AULA_CIRCLES).
// ============================================================
export const DAPUR = {
  name: 'Dapur Istana', x0: 14.9, x1: 24.3, z0: 10.9, z1: 16.9, h: 6.0, doorZ: 13.6, doorHW: 1.5, doorHY: 3.2,
  table: { x: 20.4, z: 13.9, len: 3.2, w: 1.2 }, counter: { x0: 16.1, x1: 23.7, depth: 0.7 }, oven: { x: 23.4, z: 13.9 },
  barrels: [{ x: 15.9, z: 16.1 }, { x: 17.0, z: 16.1 }],
};
AULA_RECTS.push({ id: 'dapur', name: DAPUR.name, x0: DAPUR.x0, x1: DAPUR.x1, z0: DAPUR.z0, z1: DAPUR.z1, h: DAPUR.h });
AULA_BRIDGES.push({ x0: 13.4, x1: 16.0, z0: DAPUR.doorZ - DAPUR.doorHW, z1: DAPUR.doorZ + DAPUR.doorHW });   // terowongan pintu (menutup celah di ambang)
for (let x = DAPUR.table.x - 1.0; x <= DAPUR.table.x + 1.01; x += 1.0) AULA_CIRCLES.push({ x, z: DAPUR.table.z, r: 0.85 });                      // meja olah
for (let x = DAPUR.counter.x0 + 0.4; x <= DAPUR.counter.x1; x += 0.9) AULA_CIRCLES.push({ x, z: DAPUR.z0 + DAPUR.counter.depth / 2, r: 0.55 });  // meja dapur di dinding utara
for (const dz of [-1.0, 0, 1.0]) AULA_CIRCLES.push({ x: DAPUR.oven.x, z: DAPUR.oven.z + dz, r: 0.9 });                                         // tungku batu bata
for (const b of DAPUR.barrels) AULA_CIRCLES.push({ x: b.x, z: b.z, r: 0.55 });

// ============================================================
//  PRAJURIT ISTANA (penjaga Aula Raja, lantai 1): model FBX dimuat & dipasang oleh kekaisaran-aula.js.
//  PRAJURIT_MODELS: file = berkas FBX, tex = folder tekstur (nama tekstur dicocokkan otomatis dari rujukan di dalam FBX), h = tinggi akhir (m; model
//  otomatis diskalakan & diletakkan tepat di lantai), yaw = putaran tambahan bila model aslinya tidak menghadap +z (mis. Math.PI), pixel = tekstur palet (tanpa blur),
//  lazy = baru diunduh saat pemain pertama kali masuk aula (bukan saat kota dibangun) -> untuk model yang lebih berat.
//  PRAJURIT: x / z = koordinat lokal kota, y = tinggi di atas lantai aula (panggung = DAIS.top), yaw = arah hadap (0 = +z, PI/2 = +x, -PI/2 = -x; pakai faceTo untuk menghadap sebuah titik).
//  Tiap prajurit yang berhasil dimuat otomatis mendapat lingkaran tabrakan (r = 0,5) di aula.
// ============================================================
export const PRAJURIT_MODELS = {
  ksatria:     { file: 'prajurit/ksatria/ksatria.fbx',         tex: 'prajurit/ksatria/textures/',     h: 1.85, yaw: 0, pixel: true },
  kapten:      { file: 'prajurit/kapten/kapten.glb',           tex: 'prajurit/kapten/textures/',      h: 1.95, yaw: 0, lazy: true, double: true },
  ksatriawati: { file: 'prajurit/ksatriawati/ksatriawati.fbx', tex: 'prajurit/ksatriawati/textures/', h: 1.75, yaw: 0, lazy: true, double: true },
};
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
export const PRAJURIT = [
  // gerbang aula: dua prajurit berjaga di kiri-kanan karpet, menghadap ke dalam aula
  { name: 'Prajurit Gerbang', model: 'ksatria', x: -8.6, z: -3.4, y: 0, yaw: faceTo(-8.6, -3.4, -3.6, 0) },
  { name: 'Prajurit Gerbang', model: 'ksatria', x: -8.6, z:  3.4, y: 0, yaw: faceTo(-8.6,  3.4, -3.6, 0) },
  // tengah aula: barisan kehormatan di sepanjang jalur karpet
  { name: 'Prajurit Aula',    model: 'ksatria', x: -3.5, z: -3.4, y: 0, yaw: faceTo(-3.5, -3.4, -3.5, 0) },
  { name: 'Prajurit Aula',    model: 'ksatria', x: -3.5, z:  3.4, y: 0, yaw: faceTo(-3.5,  3.4, -3.5, 0) },
  // kaki panggung: kapten & ksatriawati, menghadap pintu agung
  { name: 'Kapten Pengawal',  model: 'kapten',      x: 6.6, z: -3.1, y: 0, yaw: faceTo(6.6, -3.1, 2.6, 0) },
  { name: 'Ksatriawati',      model: 'ksatriawati', x: 6.6, z:  3.1, y: 0, yaw: faceTo(6.6,  3.1, 2.6, 0) },
  // pelataran singgasana: dua pengawal raja
  { name: 'Pengawal Takhta',  model: 'ksatria', x: 12.0, z: -4.6, y: DAIS.top, yaw: faceTo(12.0, -4.6, 9.0, 0) },
  { name: 'Pengawal Takhta',  model: 'ksatria', x: 12.0, z:  4.6, y: DAIS.top, yaw: faceTo(12.0,  4.6, 9.0, 0) },
];
