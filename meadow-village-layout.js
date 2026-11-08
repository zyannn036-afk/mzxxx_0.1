// ============================================================
//  DUSUN ILALANG — desa kecil di Padang Rumput Arunika (data tata letak, murni angka, tanpa THREE)
//  Letaknya di sisi selatan jalan tanah padang, ±290 m dari Gerbang Timur kota (antara kolam pertama dan Sungai Bening).
//  Dipakai oleh meadow.js (membangun dusun + membersihkan rumput), npcs.js (penempatan warga) dan game.js (pesan masuk dusun).
//
//  Koordinat lokal V(a, b): a = searah jalan (timur), b = ke selatan (tegak lurus jalan), (0,0) = alun-alun dusun.
//  Dusun ikut miring mengikuti arah jalan di titik itu, jadi tata letaknya selalu sejajar dengan jalan.
// ============================================================
import { roadAt } from './meadow-layout.js';
import { footprintCircles, doorPoint } from './village-layout.js';
export { footprintCircles, doorPoint };

const ROAD_S = 292, OFF = 24;                         // titik di jalan tempat jalan masuk bercabang, dan jarak pusat dusun dari jalan
const rp = roadAt(ROAD_S);
export const DUSUN = { name: 'Dusun Ilalang', x: rp.x - rp.tz * OFF, z: rp.z + rp.tx * OFF, radius: 16, roadS: ROAD_S, tx: rp.tx, tz: rp.tz };
export const dusunYaw = -Math.atan2(rp.tz, rp.tx);    // rotation.y yang membuat sumbu-x lokal sejajar jalan
// titik lokal (a, b) -> dunia
export const V = (a, b) => ({ x: DUSUN.x + rp.tx * a - rp.tz * b, z: DUSUN.z + rp.tz * a + rp.tx * b });
const faceCenter = p => Math.atan2(DUSUN.x - p.x, DUSUN.z - p.z);   // sisi depan (+z lokal rumah) menghadap alun-alun

// kind: 'hip' = atap limas, 'gable' = atap pelana, 'barn' = lumbung
export const D_HOUSES = [
  { id: 'a', ...V(-8.5, -4.5), w: 4.6, d: 3.8, kind: 'hip',   wall: 0xe3d3ae, roof: 0xa8472e },
  { id: 'b', ...V(8, -5.5),    w: 4.2, d: 3.6, kind: 'gable', wall: 0xdccaa0, roof: 0xc7a24d },
  { id: 'c', ...V(10.5, 5),    w: 4.0, d: 4.2, kind: 'hip',   wall: 0xe8dcc0, roof: 0x8a3b2c },
  { id: 'd', ...V(-9.5, 5.5),  w: 4.8, d: 3.8, kind: 'gable', wall: 0xdccaa0, roof: 0xa8472e },
  { id: 'e', ...V(0.5, 11.5),  w: 6.2, d: 4.4, kind: 'barn',  wall: 0xa8744a, roof: 0x7b3b2a },
].map(h => ({ ...h, yaw: faceCenter(h) }));

export const D_PLAZA_R = 4.4;
export const D_WELL = { ...V(0, 0), r: 1.1 };
export const D_PLOT = { ...V(-12.8, -0.3), w: 3.6, d: 4.0 };                 // kebun sayur (sejajar jalan)
export const D_HAYSTACKS = [V(-9.5, 11.5), V(-6.8, 13.4)];
export const D_BARRELS = [V(4.3, 6.6), V(5.1, 7.4), V(-3.9, -6.8), V(-3.1, -7.4)];
export const D_CRATES = [V(5.6, -7.9), V(6.5, -8.2)];
export const D_LAMPS = [V(3.6, -2.6), V(-3.6, 2.8), V(2.4, -12.5)];
// papan nama di tepi jalan, menghadap barat (ke pengelana yang datang dari kota), panah menunjuk ke selatan = ke kanan
export const D_SIGN = { ...V(3.5, -21), yaw: Math.atan2(-rp.tx, -rp.tz) };
// kandang kambing & domba di tepi timur dusun (sejajar jalan). Pintu di sisi barat (menghadap alun-alun).
export const D_PEN = { ...V(19.5, 1), w: 9, d: 7 };
// jalan masuk dari jalan padang ke alun-alun (titik lokal)
export const D_ENTRANCE = [V(0, -22), V(1.3, -17), V(-0.7, -11), V(0, -6.5), V(0, -D_PLAZA_R + 1)];

// titik-titik yang harus bebas rumput / pohon / bunga / batu (dipakai meadow.js sebagai "tempat khusus"): pusat + jalan masuk
export const D_CLEAR = [{ x: DUSUN.x, z: DUSUN.z, r: DUSUN.radius + 2 }, { x: D_PEN.x, z: D_PEN.z, r: 8 }];
for (let i = 0; i < D_ENTRANCE.length - 1; i++) {
  const p = D_ENTRANCE[i], q = D_ENTRANCE[i + 1], n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 3));
  for (let k = 0; k < n; k++) D_CLEAR.push({ x: p.x + (q.x - p.x) * k / n, z: p.z + (q.z - p.z) * k / n, r: 2.2 });
}

// Warga dusun. tex = warna tekstur Peasant (green / yellow / blue / brown); patrol = titik jalan bolak-balik; scale < 1 = anak kecil
export const DUSUN_NPCS = [
  { name: 'Pak Wiryo', role: 'Petani', tex: 'green', ...V(-10.3, -0.3), look: D_PLOT,
    lines: ['Sayurku tumbuh subur di padang ini. Tanahnya gembur sekali.', 'Kalau mau ke Sungai Bening, ikuti jalan tanah ke timur. Ada jembatan kayu di sana.'] },
  { name: 'Mbok Sinah', role: 'Warga', tex: 'brown', ...V(2.6, 2.4), look: V(0, 0),
    lines: ['Sumur dusun ini tak pernah kering, bahkan di musim kemarau.', 'Minumlah dulu, perjalanan ke timur masih jauh.'] },
  { name: 'Kang Parto', role: 'Penggembala', tex: 'yellow', ...V(2.4, -3.4), look: V(0, 0),
    patrol: [V(2.4, -3.4), V(3.2, 2.2), V(-2.2, 3.4)],
    lines: ['Kambing dan dombaku kubiarkan merumput di kandang timur. Embek semua, ribut tiap pagi!', 'Dengar-dengar jalan ke Kota Kekaisaran masih ditutup. Entah kapan dibuka.'] },
  { name: 'Adi', role: 'Anak Dusun', tex: 'blue', ...V(5.8, 1.6), look: V(10.5, 5), scale: 0.72,
    lines: ['Kak pendekar! Aku suka berlari di rumput tinggi, tapi ibu melarang jauh-jauh.', 'Di kolam dekat jalan ada banyak katak, lho!'] },
];
