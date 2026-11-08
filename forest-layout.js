// ============================================================
//  HUTAN BESAR — data tata letak (murni angka, tanpa THREE)
//  Letaknya di sebelah timur Desa Padang Hijau. Dipakai oleh world.js (jalan, pohon, batas dunia),
//  forest.js (membangun isi hutan) dan game.js (pesan masuk hutan).
// ============================================================
import { VILLAGE } from './village-layout.js';
import { CITY, CITY_ZONES } from './city-layout.js';
import { MEADOW_CIRCLES, RUINS_CIRCLES } from './meadow-layout.js';
import { SAWAH_CIRCLES } from './sawah-layout.js';
import { KEKAISARAN_CIRCLES } from './kekaisaran-layout.js';

// pusat & radius area hutan yang bisa dijelajahi
export const FOREST = { name: 'Hutan Besar', x: 100, z: 58, radius: 56 };

// jalan utama: dari alun-alun desa -> gerbang hutan -> lapangan di tengah hutan
export const FOREST_ROAD = [[39.5, 29.2], [43.5, 28], [48, 26.4], [53, 25.2], [58.5, 25.4], [64, 28.4], [70, 33.2],
  [76, 38.8], [83, 43], [90, 47.6], [97, 52], [104, 56.5], [110, 60.5]];
// jalan cabang: ke kolam & ke lingkaran batu kuno
export const TRAIL_POND = [[88, 46.5], [86, 56], [84.5, 66], [84, 74], [84.5, 79]];
export const TRAIL_STONES = [[106, 57], [113, 52], [121, 46.5], [129, 42], [134, 40]];

// gerbang kayu di pintu masuk hutan (arah gerbang mengikuti arah jalan)
export const GATE = (() => {
  const x = 58.5, z = 25.4, dx = 64 - 53, dz = 28.4 - 25.2;
  return { x, z, yaw: Math.atan2(dx, dz) };
})();

export const CLEARING = { x: 114, z: 64, r: 9 };                 // lapangan di tengah hutan (perkemahan penjaga hutan)
export const GIANT_TREE = { x: 119, z: 68, scale: 3.4 };          // pohon tua raksasa
export const CAMP_FIRE = { x: 112, z: 62.5 };
export const POND = { x: 84.5, z: 85, r: 5 };                    // kolam
export const STONES = { x: 138, z: 38.5, r: 5.5 };                // lingkaran batu kuno

// penjaga hutan (NPC) — ditambahkan ke daftar NPCS di village-layout.js
export const FOREST_NPC = {
  name: 'Mbah Jarot', role: 'Penjaga Hutan', tex: 'brown', x: 110.6, z: 64.4, look: CAMP_FIRE,
  lines: ['Selamat datang di Hutan Besar. Jangan keluar dari jalan setapak kalau hari mulai gelap.',
    'Pohon raksasa di sana itu sudah berdiri sebelum desa ada. Katanya ia menjaga hutan ini.',
    'Ke arah barat daya ada kolam yang tenang. Ke timur laut ada batu-batu tua yang kadang bercahaya...'],
};

// ============================================================
//  PERPANJANGAN HUTAN ("Hutan Dalam") — jalan setapak lanjut ke timur dari perkemahan penjaga hutan
//  sampai Gerbang Batu Kuno di ujung. Tiga lingkaran area tambahan dirangkai berurutan.
// ============================================================
export const FOREST_EXT = [
  { x: 165, z: 52, r: 42 },
  { x: 218, z: 44, r: 40 },
  { x: 262, z: 56, r: 32 },
];
// jalan utama kedua: dari perkemahan -> jembatan -> pos istirahat -> hutan jamur -> Gerbang Batu Kuno
export const FOREST_ROAD_2 = [[110, 60.5], [113.2, 58], [119.5, 56], [126.5, 55], [133.5, 56.5], [140.5, 59], [148, 59.5], [156, 56],
  [163.5, 52.5], [171, 50.5], [178, 53.2], [182, 55.35], [187.2, 57], [192.4, 58.6], [197, 58.4], [203, 54], [211, 49], [219, 46.5], [227, 48], [235, 52], [243, 57],
  [251, 59], [259, 57.5], [266, 55], [273, 53.5], [280, 52.4]];
export const TRAIL_GROVE = [[235, 52], [235.5, 57.5], [234, 62.5], [233.4, 65.5]];   // cabang ke hutan jamur bercahaya

export const STREAM = [[190, 18], [185.5, 28], [190, 38], [185.8, 48], [187.6, 57], [189, 66], [184.5, 75], [187.5, 86]]; // sungai dangkal
export const STREAM_W = 3.2;
export const BRIDGE = { x: 187.2, z: 57, yaw: Math.atan2(16, 5), len: 7 };           // jembatan papan di atas sungai
export const REST_STOP = { sign: { x: 200.6, z: 60.4, yaw: -1.3 }, bench: { x: 206.4, z: 57.6, yaw: Math.PI }, lamp: { x: 208.6, z: 58.4 }, x: 204, z: 59, r: 6 };
export const GROVE = { x: 233, z: 68, r: 6.5 };                                      // hutan jamur bercahaya
export const ANCIENT_GATE = { x: 284, z: 52.2, yaw: Math.atan2(6, -1) };             // gerbang batu tersegel di ujung hutan

// kotak tempat pohon/semak/rumput diacak (dipakai forest.js)
export const FOREST_BOUNDS = { x0: 44, x1: 325, z0: -16, z1: 136 };

// ---------- Batas dunia ----------
// Dunia yang bisa dijelajahi = gabungan beberapa lingkaran. Dataran lama (radius LIMIT dari lubang)
// sudah dicek di game.js; di sini lingkaran tambahan: halaman luar desa + hutan.
const ZONES = [
  { x: VILLAGE.x, z: VILLAGE.z, r: 24 },   // desa + halaman luarnya
  { x: 62, z: 30, r: 10 },                 // penghubung desa -> hutan (jalan tidak boleh sempit)
  { x: FOREST.x, z: FOREST.z, r: FOREST.radius },
  ...FOREST_EXT,                           // perpanjangan hutan ke timur
];
// area yang boleh dijelajahi pemain: kalau Gerbang Batu Kuno terbuka (CITY.open), Kota Arunika ikut masuk.
// (zoneDist() di bawah sengaja tetap hanya untuk hutan/desa: dipakai menata pohon, jadi kota tidak ikut ditanami pohon hutan)
const WALK_ZONES = CITY.open ? [...ZONES, ...CITY_ZONES, ...MEADOW_CIRCLES, ...RUINS_CIRCLES, ...SAWAH_CIRCLES, ...KEKAISARAN_CIRCLES] : ZONES;   // kota terbuka -> Padang Rumput Arunika (lewat Gerbang Timur) ikut bisa dijelajahi
const FOREST_CIRCLES = [{ x: FOREST.x, z: FOREST.z, r: FOREST.radius }, ...FOREST_EXT];

// jarak ke tepi area tambahan: negatif = di dalam area, positif = di luar
export function zoneDist(x, z) {
  let m = Infinity;
  for (const c of ZONES) m = Math.min(m, Math.hypot(x - c.x, z - c.z) - c.r);
  return m;
}

// Dorong pemain kembali ke dalam dunia kalau melewati batas.
// limit = radius dataran lama (dari lubang dungeon di 0,0).
export function clampToWorld(pos, limit) {
  if (Math.hypot(pos.x, pos.z) <= limit) return;       // masih di dataran lama
  let best = null, bd = Infinity;
  for (const c of WALK_ZONES) {
    const d = Math.hypot(pos.x - c.x, pos.z - c.z) - c.r;
    if (d <= 0) return;                                  // masih di salah satu area tambahan
    if (d < bd) { bd = d; best = c; }
  }
  // di luar semua area: tarik ke tepi area terdekat (atau ke tepi dataran lama, mana yang lebih dekat)
  const dMain = Math.hypot(pos.x, pos.z) - limit;
  if (dMain < bd) { pos.setLength(limit); return; }
  const dx = pos.x - best.x, dz = pos.z - best.z, l = Math.hypot(dx, dz) || 1;
  pos.x = best.x + dx / l * best.r; pos.z = best.z + dz / l * best.r;
}

// seberapa "dalam" posisi ini di hutan: 0 = di luar, 1 = di tengah hutan (untuk kabut & cahaya)
export function forestAmount(x, z) {
  let m = Infinity; // jarak ke tepi lingkaran hutan terdekat (negatif = di dalam)
  for (const c of FOREST_CIRCLES) m = Math.min(m, Math.hypot(x - c.x, z - c.z) - c.r);
  const t = Math.min(1, Math.max(0, (6 - m) / 22));
  return t * t * (3 - 2 * t); // smoothstep: peralihan halus
}

// ============================================================
//  TEMPAT RAHASIA — persiapan "secret quest" Centaur
//  Terpencil di selatan hutan (sekitar 36 m dari jalan/jalan setapak mana pun). TIDAK ADA jalan ke sana:
//  pemain hanya bisa menemukannya dengan menjelajah bebas di antara pepohonan.
//  - forest.js  : mengosongkan pohon di sekitarnya + lingkaran batu & rune bercahaya
//  - npcs.js    : memuat npc/centaur.fbx dan menaruhnya di tengah lingkaran (bisa diajak bicara dengan E)
//  - game.js    : pesan saat pertama kali menemukannya (tersimpan), monster liar tidak masuk ke sini
// ============================================================
export const SECRET_GLADE = { x: 116, z: 96, r: 9 };
export const SECRET_QUEST = { storageKey: 'dungeon.secret.v1', id: 'centaur', stage: 0 };   // stage 0 = baru ditemukan, belum ada misi
export const SECRET_CENTAUR = {
  name: '???', role: 'Penjaga Rahasia', x: SECRET_GLADE.x, z: SECRET_GLADE.z, look: { x: 114, z: 64 },   // menghadap ke arah perkemahan
  height: 2.7, talkR: 6, tagR: 10,
  // Dialog tahap 0 (sebelum quest dimulai). Nanti tinggal ganti / tambah daftar kalimat sesuai SECRET_QUEST.stage.
  lines: [
    'Kau menemukanku tanpa mengikuti jalan setapak mana pun... Hutan ini jarang membiarkan hal itu terjadi.',
    'Aku sudah menunggu sangat lama. Tapi belum waktunya. Gerbang di ujung timur masih tertutup rapat.',
    'Kembalilah nanti, saat kau sudah lebih kuat. Dan jangan ceritakan tempat ini pada siapa pun, bahkan pada Mbah Jarot.',
  ],
};
