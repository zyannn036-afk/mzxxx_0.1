// ============================================================
//  PENGHUNI ISTANA ARUNIKA — data NPC (murni angka & teks, tanpa THREE)
//  Dipakai oleh npcs.js (menaruh NPC) dan palace-npcs.js (memuat model VRM-nya).
//
//  Koordinat: L(x, z, y) = titik di ruang dalam istana (pusat istana = 0,0; x timur, z selatan; y = tinggi lantai).
//  Lantai 2 = F2 (6.0). Panggung singgasana = F2 + DH. Peta ruangan: lihat gambar denah di palace-layout.js.
//
//  Tiap NPC:
//    file   : model VRM 1.0 (npc/ratu.vrm, npc/putri.vrm)
//    y      : tinggi lantai tempat berdiri (NPC hanya bisa diajak bicara kalau pemain berada di lantai yang sama)
//    look   : titik yang dihadapi saat berdiri diam
//    lines  : kalimat dialog (tiap ditekan "Mengobrol" pindah ke berikutnya) — usahakan <= 120 huruf supaya muat di gelembung
//    pose   : gaya berdiri ('anggun' = tangan di depan perut, 'ceria' = tangan di sisi, sedikit mengayun)
// ============================================================
import { PALACE } from './city-layout.js';
import { F2, DH } from './palace-layout.js';

const L = (x, z, y) => ({ x: PALACE.x + x, z: PALACE.z + z, y });

export const PALACE_NPCS = [
  // ---- Balairung (lantai 2): mendampingi singgasana raja ----
  { id: 'ratu', file: 'npc/ratu.vrm', name: 'Ratu Kirana', role: 'Ratu Arunika', pose: 'anggun', ...L(3.1, -19.3, F2 + DH), look: L(0, 8, 0),
    lines: ['Selamat datang di Balairung, pahlawan. Suamiku jarang duduk di singgasana; ia lebih suka menyambut tamu di gerbang.',
            'Sudah lama kota ini tak kedatangan tamu dari balik Gerbang Batu Kuno. Kami berharap kau membawa kabar baik.',
            'Berhati-hatilah dengan Malzareth. Kalau kau turun ke lubang itu, kembalilah dengan selamat.'] },
  { id: 'putri', file: 'npc/putri.vrm', name: 'Putri Cempaka', role: 'Putri Mahkota', pose: 'ceria', ...L(-3.1, -19.3, F2 + DH), look: L(0, 8, 0),
    lines: ['Kau benar-benar melewati Hutan Besar? Aku hanya pernah melihatnya dari jendela menara!',
            'Ibunda melarangku keluar dari kota. Tapi suatu hari aku akan melihat Gerbang Batu Kuno dengan mataku sendiri.',
            'Kamarku ada di sayap timur, di sebelahnya ruang musik. Mampirlah kalau kau suka denting piano.'] },
];
