// ============================================================
//  KOTA ARUNIKA — data tata letak (murni angka, tanpa THREE)
//  Letaknya di sebelah timur Gerbang Batu Kuno, di ujung Hutan Besar. Hanya BANGUNAN (dan jalan batu sebagai lantai):
//  belum ada warga, monster, perabot, atau misi. Dipakai oleh city.js (membangun), forest-layout.js (batas dunia),
//  forest.js (gerbang & pohon tidak menimpa kota) dan game.js (pesan masuk kota).
//
//  Koordinat lokal kota (u, v): u = arah timur (+x dunia), v = arah selatan (+z dunia), (0,0) = pusat alun-alun.
//  yaw bangunan: 0 = depan menghadap +v (selatan), PI = utara, PI/2 = timur (+u), -PI/2 = barat (-u).
// ============================================================

// open: true  -> Gerbang Batu Kuno terbuka dan kota bisa dimasuki.
// open: false -> gerbang tersegel seperti semula (kota tetap terlihat dari balik gerbang, tapi tidak bisa dimasuki).
export const CITY = { name: 'Kota Arunika', x: 340, z: 52, radius: 70, open: true };   // radius: hanya untuk jarak muat NPC; batas kota sebenarnya = CITY_CIRCLES di bawah

// area yang bisa dijelajahi: corong di belakang gerbang (gerbang ada di x=284) + lingkaran kota
// ---------- Interior Katedral ----------
// Ruang dalam katedral dibangun terpisah (church.js) di titik jauh di luar peta; pemain "dipindahkan" ke sana lewat pintu depan katedral.
// Koordinat ruang dalam: x ke kanan, z ke depan; pintu keluar di ujung +z (selatan), altar di ujung -z (utara).
// Titik muncul pemain saat game dimulai: di jalan utama sebelah barat alun-alun, menghadap timur (ke alun-alun & istana).
export const CITY_SPAWN = { x: CITY.x - 16, z: CITY.z, face: Math.PI / 2 };

export const CHURCH = {
  name: 'Katedral Arunika',
  x: CITY.x, z: CITY.z + 220,                                          // pusat ruang dalam
  w: 14, l: 26, h: 11,                                                 // lebar (x), panjang (z), tinggi
  door: { x: CITY.x, z: CITY.z + 13, r: 1.7 },                        // di depan pintu katedral (luar): melangkah ke sini = masuk
  outSpawn: { x: CITY.x, z: CITY.z + 9.6, face: Math.PI },            // muncul di alun-alun saat keluar, menghadap alun-alun
  inSpawn: { x: CITY.x, z: CITY.z + 220 + 9.4, face: Math.PI },       // muncul di dalam, menghadap altar
  exit: { x: CITY.x, z: CITY.z + 220 + 12.2, r: 1.4 },                // di depan pintu dalam: melangkah ke sini = keluar
};

// ---------- Interior Istana ----------
// Sama seperti katedral: ruang dalam dibangun terpisah (palace.js) di titik jauh di luar peta, pemain "dipindahkan" lewat gerbang istana.
// Tata ruang (2 lantai, lorong, tangga agung, balairung/singgasana) ada di palace-layout.js. Koordinat ruang dalam: pusat istana = (x, z),
// pintu masuk di ujung +z (selatan), singgasana di ujung -z (utara), lantai 2 di y = 6.
// Istana luar (BUILDINGS: 'castle', u = 80.5, v = 0, yaw = -PI/2) menghadap barat (-x dunia); gerbangnya (gatehouse) berada di sisi barat itu.
const CASTLE_GATE_X = CITY.x + 80.5 - 10.1;                           // depan gerbang istana (luar), tepat di muka gatehouse
const PALACE_C = { x: CITY.x, z: CITY.z + 330 };                      // pusat ruang dalam (di selatan katedral, jauh di luar peta)
export const PALACE = {
  name: 'Istana Arunika',
  x: PALACE_C.x, z: PALACE_C.z,
  door: { x: CASTLE_GATE_X, z: CITY.z, r: 1.6 },                      // melangkah ke sini (di depan gerbang) = masuk
  outSpawn: { x: CASTLE_GATE_X - 2.0, z: CITY.z, face: -Math.PI / 2 },   // muncul di depan istana saat keluar, menghadap barat (ke jalan utama)
  inSpawn: { x: PALACE_C.x, z: PALACE_C.z + 19.2, face: Math.PI },        // muncul di aula masuk, menghadap ke tangga & singgasana
  exit: { x: PALACE_C.x, z: PALACE_C.z + 22.0, r: 1.3 },                  // di ambang pintu utama dalam: melangkah ke sini = keluar
  radius: 32,                                                          // lingkaran area jelajah (menutup seluruh bangunan 40 x 46)
};

// Kota diperluas (u: -56 .. ~93, v: -64 .. 64). Area jelajah = kumpulan lingkaran yang menutup seluruh kota (grid 3 x 3),
// supaya sisi barat tidak bocor melewati Gerbang Batu Kuno (lingkaran paling barat berhenti di u ≈ -58).
export const CITY_CIRCLES = [];
for (const u of [-20, 26, 68]) for (const v of [-44, 0, 44]) CITY_CIRCLES.push({ x: CITY.x + u, z: CITY.z + v, r: 38 });
// jarak ke tepi kota: negatif = di dalam kota, positif = di luar
export const cityDist = (x, z) => { let m = Infinity; for (const c of CITY_CIRCLES) m = Math.min(m, Math.hypot(x - c.x, z - c.z) - c.r); return m; };
export const CITY_ZONES = [{ x: 292, z: 52, r: 9 }, ...CITY_CIRCLES, { x: CHURCH.x, z: CHURCH.z, r: 19 }, { x: PALACE.x, z: PALACE.z, r: PALACE.radius }];

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const PLAZA = { u: 0, v: 0, r: 10 };

// ---------- Gerbang Timur ----------
// Pintu keluar kota ke Padang Rumput (lihat meadow-layout.js). Dibuat di tembok timur (u = 97), di antara istana (v -13..13) dan menara v = 34.
// v = titik tengah gerbang, half = setengah lebar celah tembok. Jalan timur menyambung dari jalan u = 55 sampai keluar tembok.
export const EAST_GATE = { v: 20, half: 7, u: 97 };
export const EAST_ROAD = { u0: 55, u1: 100, v0: EAST_GATE.v, v1: EAST_GATE.v, w: 6 };

// jalan batu lurus (sejajar sumbu). Horizontal: v0 === v1; vertikal: u0 === u1. w = lebar.
export const STREETS = [
  { u0: -56, u1: 71, v0: 0, v1: 0, w: 7 },        // jalan utama: dari Gerbang Batu Kuno -> alun-alun -> istana (diperpanjang ke timur)
  { u0: -27, u1: -27, v0: -62, v1: 62, w: 5 },
  { u0: 27, u1: 27, v0: -62, v1: 62, w: 5 },
  { u0: 55, u1: 55, v0: -62, v1: 62, w: 5 },      // jalan baru di distrik timur
  { u0: -45, u1: 64, v0: -34, v1: -34, w: 5 },
  { u0: -45, u1: 64, v0: 34, v1: 34, w: 5 },
  { u0: -45, u1: 64, v0: -56, v1: -56, w: 5 },    // jalan baru di distrik utara
  { u0: -45, u1: 64, v0: 56, v1: 56, w: 5 },      // jalan baru di distrik selatan
];
// halaman berlantai batu di depan Balai Kota & Katedral
export const PAVE_RECTS = [
  { u0: -11, u1: 11, v0: -14.5, v1: -8 },
  { u0: -8, u1: 8, v0: 8, v1: 13.5 },
];
export const streetRect = s => s.v0 === s.v1
  ? { u0: s.u0, u1: s.u1, v0: s.v0 - s.w / 2, v1: s.v0 + s.w / 2 }
  : { u0: s.u0 - s.w / 2, u1: s.u0 + s.w / 2, v0: s.v0, v1: s.v1 };

// kotak pembatas (sumbu dunia) sebuah bangunan; yaw hanya kelipatan 90 derajat
export function aabb(b) {
  const sw = Math.abs(Math.sin(b.yaw)) > 0.5, hx = (sw ? b.d : b.w) / 2, hz = (sw ? b.w : b.d) / 2;
  return { u0: b.u - hx, u1: b.u + hx, v0: b.v - hz, v1: b.v + hz };
}
// titik lokal bangunan (lx, lz) -> koordinat dunia
export const toWorld = (b, lx, lz) => ({
  x: CITY.x + b.u + Math.cos(b.yaw) * lx + Math.sin(b.yaw) * lz,
  z: CITY.z + b.v - Math.sin(b.yaw) * lx + Math.cos(b.yaw) * lz,
});

// ---------- Bangunan khusus ----------
// rects/circles = jejak tabrakan dalam koordinat lokal bangunan (x ke kanan, z ke depan)
const SPECIALS = [
  { kind: 'townhall', u: 0, v: -19, w: 20, d: 10, yaw: 0,                                   // Balai Kota + menara jam, menghadap alun-alun
    rects: [{ x0: -10, x1: 10, z0: -5, z1: 5 }], circles: [-3.6, -1.8, 1.8, 3.6].map(x => ({ x, z: 6.5, r: 0.5 })) },
  { kind: 'cathedral', u: 0, v: 21.5, w: 12, d: 17, yaw: Math.PI,                           // Katedral + menara lonceng, menghadap alun-alun
    rects: [{ x0: -6, x1: 6, z0: -5, z1: 8.5 }, { x0: -3.5, x1: 3.5, z0: -8.5, z1: -5 }], circles: [] },
  { kind: 'castle', u: 80.5, v: 0, w: 26, d: 19, yaw: -Math.PI / 2,                         // Istana di ujung jalan utama (digeser ke timur saat kota diperluas), menghadap barat
    rects: [{ x0: -13, x1: 13, z0: -9.5, z1: 6.5 }, { x0: -3.5, x1: 3.5, z0: 6.5, z1: 9.5 }],
    circles: [[-13, -9.5], [13, -9.5], [-13, 6.5], [13, 6.5]].map(([x, z]) => ({ x, z, r: 3.3 })) },
];

// ---------- Rumah-rumah (dibuat acak tapi tetap sama setiap kali: seed tetap) ----------
const WALLS = [0xe3d3ae, 0xdccaa0, 0xe8dcc0, 0xd9c7a0, 0xe0c9a6, 0xd8b89a, 0xcfc8b6, 0xbfcbd0, 0xe6d6b2];
const ROOFS = [0xa8472e, 0x8a3b2c, 0x7b3b2a, 0xc7a24d, 0x5f6e7a, 0x3d4a5c, 0x9a5a3a, 0x6b7f4a];
const TRIMS = [0x5b3d22, 0x6b4a2d, 0x3f2a18];
const AWNINGS = [0xb8352a, 0x2f5f8a, 0x3f7a4a, 0xc9892a];

function generate() {
  const rnd = mulberry32(5112026), R = (a, b) => a + rnd() * (b - a), pick = a => a[(rnd() * a.length) | 0];
  const placed = [];
  const add = b => { b.rects = b.rects || [{ x0: -b.w / 2, x1: b.w / 2, z0: -b.d / 2, z1: b.d / 2 }]; b.circles = b.circles || []; b.box = aabb(b); placed.push(b); };
  const hit = (a, c, m) => a.u0 < c.u1 + m && a.u1 > c.u0 - m && a.v0 < c.v1 + m && a.v1 > c.v0 - m;
  const free = b => {
    const a = b.box || aabb(b);
    if (a.u0 < -52 || a.u1 > 92 || a.v0 < -64 || a.v1 > 64) return false;                  // batas kota (persegi panjang)
    for (const s of STREETS) if (hit(a, streetRect(s), 0.5)) return false;
    for (const r of PAVE_RECTS) if (hit(a, r, 0.5)) return false;
    if (Math.hypot(clamp(0, a.u0, a.u1), clamp(0, a.v0, a.v1)) < PLAZA.r + 0.8) return false;
    for (const o of placed) if (hit(a, o.box, 0.7)) return false;
    return true;
  };
  const kindOf = () => { const t = rnd(); return t < 0.6 ? 'town' : t < 0.78 ? 'shop' : t < 0.84 ? 'inn' : t < 0.93 ? 'hall' : 'tower'; };
  const make = kind => {
    const p = { kind, wall: pick(WALLS), roof: pick(ROOFS), trim: pick(TRIMS), stoneBase: rnd() < 0.4, seed: (rnd() * 1e6) | 0, awning: pick(AWNINGS) };
    if (kind === 'town') { p.w = R(4.6, 7); p.d = R(5, 7.5); p.floors = rnd() < 0.62 ? 2 : 3; p.roofKind = rnd() < 0.7 ? 'gable' : 'hip'; }
    else if (kind === 'shop') { p.w = R(5.5, 8); p.d = R(5.5, 7.5); p.floors = 2; p.roofKind = rnd() < 0.5 ? 'gable' : 'hip'; }
    else if (kind === 'inn') { p.w = R(9, 11.5); p.d = R(7, 8); p.floors = rnd() < 0.5 ? 2 : 3; p.roofKind = 'gable'; }
    else if (kind === 'hall') { p.w = R(10, 14); p.d = R(6, 7.5); p.floors = 1; p.roofKind = 'gable'; }
    else { p.w = p.d = R(4, 5.2); p.floors = rnd() < 0.5 ? 4 : 5; p.roofKind = 'hip'; p.stoneBase = true; }
    return p;
  };

  SPECIALS.forEach(s => add({ ...s }));

  // 1) deretan rumah di kiri-kanan tiap jalan, menghadap jalan
  for (const s of STREETS) {
    const horiz = s.v0 === s.v1, a0 = horiz ? s.u0 : s.v0, a1 = horiz ? s.u1 : s.v1, hw = s.w / 2;
    for (const side of [-1, 1]) {
      let c = a0 + 1.5;
      while (c < a1 - 3) {
        const p = make(kindOf());
        if (c + p.w > a1 - 1) break;
        const off = hw + 0.6 + p.d / 2, mid = c + p.w / 2;
        const b = horiz ? { ...p, u: mid, v: s.v0 + side * off, yaw: side > 0 ? Math.PI : 0 }
                        : { ...p, u: s.u0 + side * off, v: mid, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
        if (free(b)) { add(b); c += p.w + R(0.3, 1.0); } else c += 1.3;
      }
    }
  }
  // 2) isi sisa lahan di dalam blok: menghadap jalan terdekat
  for (let i = 0, n = 0; i < 14000 && n < 420; i++) {
    const u = -52 + rnd() * 144, v = -64 + rnd() * 128;
    let bd = 1e9, du = 0, dv = 0;
    for (const s of STREETS) {
      const cu = clamp(u, Math.min(s.u0, s.u1), Math.max(s.u0, s.u1)), cv = clamp(v, Math.min(s.v0, s.v1), Math.max(s.v0, s.v1)), d = Math.hypot(u - cu, v - cv);
      if (d < bd) { bd = d; du = cu - u; dv = cv - v; }
    }
    const p = make(kindOf()), yaw = Math.abs(du) > Math.abs(dv) ? (du > 0 ? Math.PI / 2 : -Math.PI / 2) : (dv > 0 ? 0 : Math.PI);
    const b = { ...p, u, v, yaw };
    if (free(b)) { add(b); n++; }
  }
  // Jalan timur + halaman depan Gerbang Timur harus bebas. Penyaringan dilakukan SETELAH semua rumah ditaruh (bukan di free()),
  // supaya urutan angka acak tidak bergeser dan letak rumah-rumah lain tetap persis sama.
  const clearRects = [streetRect(EAST_ROAD), { u0: 80, u1: 100, v0: EAST_GATE.v - 7, v1: EAST_GATE.v + 7 }];
  const special = new Set(SPECIALS.map(b => b.kind));   // Balai Kota, Katedral, Istana tidak pernah dibuang
  return placed.filter(b => special.has(b.kind) || !clearRects.some(r => hit(b.box, r, 1.2)));
}

export const BUILDINGS = generate();
