// ============================================================
//  PINTU PENJAGA & GOLEM — data tata letak (murni angka, tanpa THREE)
//  Pintu batu di dinding keliling sisi timur Reruntuhan Kuno (ruins.js). Melangkah ke dalam lorongnya -> layar memudar -> arena golem (game.js).
//  Koordinat (a, b) = "bingkai sungai" (a = searah jalan di jembatan / timur, b = ke selatan), sama seperti RUINS di meadow-layout.js.
//  Dipakai oleh ruins.js (membangun pintu), game.js (pemicu masuk, titik keluar, bos) dan golem.js.
// ============================================================
import { RUINS, RIVER_FRAME as F, toRiverWorld } from './meadow-layout.js';

const dirW = (da, db) => ({ x: F.tx * da - F.tz * db, z: F.tz * da + F.tx * db });   // arah lokal (a, b) -> arah dunia
export const DOOR_WALL_R = 22.5;                                                       // jari-jari dinding keliling reruntuhan (sama dengan WR di ruins.js)

export const RUINS_DOOR = {
  name: 'Pintu Penjaga',
  a: RUINS.a + DOOR_WALL_R, b: RUINS.b,                    // pusat bingkai pintu (bingkai sungai); pintu menghadap barat (ke tengah reruntuhan)
  seg: 6,                                                  // nomor potongan dinding keliling yang diganti pintu (ruins.js: ang = (i + 0.5) / 26 * 2pi -> i = 6 tepat di timur)
  trigger: { ...toRiverWorld(RUINS.a + DOOR_WALL_R + 1.9, RUINS.b), r: 1.1 },   // melangkah ke titik ini (di dalam lorong) = masuk arena
  near: { ...toRiverWorld(RUINS.a + DOOR_WALL_R, RUINS.b), r: 15 },             // mendekat -> pintu terbuka & pesan peringatan
  out: { ...toRiverWorld(RUINS.a + DOOR_WALL_R - 3.6, RUINS.b), face: Math.atan2(dirW(-1, 0).x, dirW(-1, 0).z) },   // titik muncul setelah keluar arena (di depan pintu, menghadap ke dalam reruntuhan)
};
// keadaan pintu yang dibagi antara game.js (menulis: jarak pemain) dan ruins.js (membaca: animasi daun pintu). 0 = tertutup, 1 = terbuka.
export const DOOR_FX = { open: 0 };

// Bos
export const GOLEM = {
  name: 'Tharok, Golem Penjaga Reruntuhan',
  hp: 520, r: 2.2, speed: 2.4,
  spawn: { x: 0, z: -9.5 }, player: { x: 0, z: 6.5 },      // posisi awal di arena (golem menghadap +z, pemain menghadap -z)
};
export const GOLEM_WAVES = ['golem'];
