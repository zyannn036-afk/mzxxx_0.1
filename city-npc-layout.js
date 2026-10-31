// ============================================================
//  WARGA KOTA ARUNIKA — data NPC (murni angka & teks, tanpa THREE)
//  Dipakai oleh npcs.js (menaruh NPC di kota) dan city-npcs.js (memuat model FBX-nya).
//
//  Koordinat memakai sistem lokal kota seperti di city-layout.js: P(u, v), u = timur (+x dunia), v = selatan (+z dunia),
//  (0,0) = pusat alun-alun. Jalan utama: v = 0, dari Gerbang Batu Kuno (u = -56) sampai istana (u = 71).
//
//  Tiap NPC:
//    file   : 'H' = npc/Humans_Master.fbx, 'A' = npc/All_together.fbx  (lihat CITY_NPC_FILES)
//    char   : nama karakter di dalam FBX (awalan nama mesh: King, Soldier, Witch, ...)
//    weapon : 'sword' -> memegang pedang (animasi Idle_Sword).  pack: true -> menggendong ransel (hanya ada di file 'H')
//    greet  : false -> tidak melambai saat diajak bicara (mis. pengawal)
//    patrol : daftar titik jalan, dilalui bolak-balik (titik pertama = tempat berdiri awal). Tanpa patrol = berdiri diam.
//    look   : titik yang dihadapi NPC saat berdiri diam
//    lines  : kalimat dialog (tiap ditekan "Mengobrol" pindah ke kalimat berikutnya) — usahakan <= 120 huruf supaya muat di gelembung
// ============================================================
import { CITY } from './city-layout.js';

const P = (u, v) => ({ x: CITY.x + u, z: CITY.z + v });

export const CITY_NPC_FILES = { H: 'npc/Humans_Master.fbx', A: 'npc/All_together.fbx' };

export const CITY_NPCS = [
  // ---- depan istana (ujung timur jalan utama) ----
  { file: 'H', char: 'King', name: 'Raja Aditya', role: 'Raja Arunika', ...P(67.2, 0), look: P(0, 0),
    lines: ['Selamat datang di Kota Arunika, pahlawan. Gerbang Batu itu sudah lama tidak terbuka.',
            'Penyihir Malzareth di dasar lubang harus dihentikan sebelum bayangannya sampai ke kota ini.',
            'Pengawalku menjaga jalan ini. Jaga dirimu di Hutan Besar.'] },
  { file: 'A', char: 'Soldier', name: 'Kapten Bayu', role: 'Kapten Pengawal', weapon: 'sword', greet: false, ...P(69.8, -2.8), look: P(50, -2.8),
    lines: ['Berhenti sebentar! Kota ini dijaga ketat sejak monster keluar dari lubang.', 'Selama aku berdiri di sini, Sri Baginda aman.'] },
  { file: 'H', char: 'Swat', name: 'Rangga', role: 'Pengawal Istana', weapon: 'sword', greet: false, ...P(69.8, 2.8), look: P(50, 2.8),
    lines: ['Aku bertugas di depan istana siang dan malam. Jangan membuat keributan ya.', 'Kapten Bayu itu keras, tapi dialah yang paling berani di antara kami.'] },

  // ---- gerbang kota ----
  { file: 'A', char: 'Medieval', name: 'Ksatria Laras', role: 'Penjaga Gerbang', weapon: 'sword', greet: false, ...P(-50, 2.2), look: P(-70, 2.2),
    lines: ['Gerbang Batu Kuno sudah terbuka. Puluhan tahun tidak ada yang lewat sini.', 'Ikuti saja jalan utama, nanti kau sampai di alun-alun.', 'Di hutan banyak slime dan goblin liar. Bawa pedangmu.'] },

  // ---- alun-alun & katedral ----
  { file: 'A', char: 'Witch', name: 'Nyai Kemuning', role: 'Peramal', ...P(-7.2, 4.6), look: P(0, 0),
    lines: ['Hihihi... bintang berbisik tentang seorang pahlawan yang akan turun ke lubang.', 'Di dasarnya ada naga api. Apinya bukan api biasa, anak muda.'] },
  { file: 'H', char: 'Casual2', name: 'Dika', role: 'Warga', ...P(6.5, 3.5), look: P(0, 0),
    lines: ['Lonceng Katedral berbunyi tiap tengah hari. Kerasnya sampai ke ujung kota!', 'Aku mau jadi pahlawan juga kelak. Boleh belajar darimu?'] },
  { file: 'H', char: 'Beach', name: 'Bang Rendy', role: 'Pelancong', ...P(-5.5, 11), look: P(0, 17),
    lines: ['Aku dari pesisir yang jauh. Di sini adem, tidak ada ombak tapi banyak pohon!', 'Katedral itu megah sekali. Aku betah memandanginya lama-lama.'] },
  { file: 'H', char: 'Punk', name: 'Joni Gondrong', role: 'Pemuda Kota', ...P(6.5, 9), look: P(-1, 10), patrol: [P(6.5, 9), P(-1, 10.2)],
    lines: ['Yo! Rambutku keren, kan? Penjaga suka melirikku curiga.', 'Kalau mau cari ribut, cari slime di hutan sana. Jangan di sini.'] },

  // ---- Balai Kota ----
  { file: 'H', char: 'Suit', name: 'Tuan Hartono', role: 'Pejabat Balai Kota', ...P(-5.5, -9.8), look: P(-5.5, -17),
    lines: ['Balai Kota mengurus semua izin, termasuk izin berburu monster.', 'Untuk pahlawan sepertimu, urusan surat bisa kupercepat.'] },
  { file: 'A', char: 'Formal', name: 'Nona Ratri', role: 'Juru Tulis', ...P(5.5, -9.8), look: P(5.5, -17),
    lines: ['Aku mencatat setiap pahlawan yang masuk kota. Tulis namamu di sini... eh, tintaku habis.', 'Kisah kalian akan kuabadikan dalam buku sejarah Arunika.'] },

  // ---- jalan-jalan kota ----
  { file: 'H', char: 'Farmer', name: 'Pak Wiro', role: 'Petani', ...P(-27, 12), look: P(-27, 0),
    lines: ['Hasil ladangku kujual di kota ini. Pembelinya banyak, tapi jalan hutan makin berbahaya.', 'Kalau bertemu slime, jangan dekat-dekat. Lengket!'] },
  { file: 'H', char: 'Worker', name: 'Kang Asep', role: 'Tukang Bangunan', ...P(-27, -12), look: P(-27, -26), patrol: [P(-27, -12), P(-27, -26)],
    lines: ['Rumah-rumah di kota ini hampir semua aku yang bangun. Kokoh, kan?', 'Menara jam Balai Kota itu proyek terbesarku. Tidak pernah telat sedetik pun!'] },
  { file: 'H', char: 'Adventurer', name: 'Raka', role: 'Petualang', pack: true, ...P(-40, -1.8), look: P(-18, -1.8), patrol: [P(-40, -1.8), P(-18, -1.8)],
    lines: ['Aku sudah menjelajahi tiga hutan, tapi belum berani turun ke lubang dungeon itu.', 'Bekal selalu di ransel. Kamu juga jangan lupa bawa ramuan!'] },
  { file: 'H', char: 'Casual', name: 'Pak Bambang', role: 'Warga', ...P(27, -8), look: P(27, -24), patrol: [P(27, -8), P(27, -24)],
    lines: ['Alun-alun ini ramai kalau sore. Anak-anak berlarian, pedagang bersahutan.', 'Sejak gerbang terbuka, makin banyak pendatang. Kota jadi hidup lagi.'] },

  // ---- pengembara dari tempat yang jauh ----
  { file: 'H', char: 'SpaceSuit', name: 'Astro', role: 'Pengembara Aneh', ...P(12, -34), look: P(0, -34),
    lines: ['Aku datang dari tempat yang sangat jauh... lebih jauh dari awan.', 'Baju ini? Rahasia. Yang jelas, udara di sini enak sekali.'] },
  { file: 'A', char: 'SciFi', name: 'Zeta', role: 'Penjelajah Asing', ...P(-14, 34), look: P(14, 34), patrol: [P(-14, 34), P(14, 34)],
    lines: ['Kota ini tidak ada di petaku. Menarik, sangat menarik.', 'Aku sedang mengamati lubang ungu itu dari jauh. Energinya tidak wajar.'] },

  // ---- distrik baru (kota diperluas) ----
  { file: 'H', char: 'Farmer', name: 'Pak Darmo', role: 'Peternak', ...P(-27, 50), look: P(-27, 38),
    lines: ['Distrik selatan ini baru dibangun. Dulu cuma padang rumput tempat dombaku merumput.', 'Sekarang kota makin luas, tapi domba-dombaku tetap betah.'] },
  { file: 'H', char: 'Casual', name: 'Bu Lastri', role: 'Penjual Roti', ...P(27, 46), look: P(27, 30),
    lines: ['Roti hangat, roti hangat! Baru keluar dari tungku.', 'Pembeliku makin banyak sejak kota diperluas ke timur dan selatan.'] },
  { file: 'A', char: 'Medieval', name: 'Ksatria Bima', role: 'Penjaga Distrik Timur', weapon: 'sword', greet: false, ...P(55, -50), look: P(55, -30), patrol: [P(55, -50), P(55, -30)],
    lines: ['Aku berpatroli di jalan timur. Wilayah penjagaan kami kini dua kali lebih luas.', 'Kalau tersesat, ikuti jalan utama menuju istana.'] },
  { file: 'H', char: 'Worker', name: 'Mang Ujang', role: 'Tukang Kayu', ...P(36, 56), look: P(48, 56), patrol: [P(36, 56), P(48, 56)],
    lines: ['Rumah-rumah baru di distrik ini butuh kayu banyak sekali.', 'Pesananku menumpuk sampai musim hujan nanti.'] },
  { file: 'A', char: 'Formal', name: 'Tuan Wicaksono', role: 'Saudagar', ...P(55, 34), look: P(45, 34),
    lines: ['Jalan timur adalah pusat dagang baru. Kemarilah, lihat-lihat dulu.', 'Pedagang dari desa pun mulai berdatangan lewat Gerbang Batu.'] },
  { file: 'H', char: 'Beach', name: 'Kiki', role: 'Anak Pesisir', ...P(-27, -52), look: P(-27, -40),
    lines: ['Aku tersesat dua kali di kota ini. Sekarang jalannya jauh lebih banyak!', 'Katanya ada menara tinggi di sisi utara. Mau lihat bareng?'] },
];
