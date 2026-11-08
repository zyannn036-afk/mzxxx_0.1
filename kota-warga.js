// ============================================================
//  KOTA-WARGA.JS — nama + percakapan semua NPC di Kota Dungeon
//  File ini HANYA berisi data (teks). Tidak ada kode 3D di sini.
//
//  CARA MENAMBAH / MENGUBAH NPC:
//    1. Tiap NPC punya "id" (kunci di tabel WARGA di bawah), misalnya 'darto'.
//    2. id yang sama dipakai di kota-dungeon.js saat NPC dipasang (addNpc / knightPD / npcWalkPlan).
//    3. Isi tiap NPC:
//         nama  = nama yang tampil di atas kepala & di kotak dialog
//         peran = pekerjaan / julukan
//         ikon  = emoji di kotak dialog
//         sapa  = kalimat pertama saat diajak bicara
//         kabar = jawaban untuk pilihan "Apa kabar?"
//         rumor = jawaban untuk pilihan "Ada rumor apa di kota ini?"  (berisi cerita Kaelen)
//         topik = (opsional) pilihan tambahan: [{ t: 'teks tombol', a: 'jawaban' }]
//
//  INTI CERITA (semua orang di kota tahu):
//    - Petualang tertinggi pun paling jauh hanya sampai bos Dungeon Api.
//    - Bos dungeon lain belum pernah disentuh siapa pun.
//    - Kecuali bos Dungeon Es: satu-satunya yang pernah mengalahkannya adalah Kaelen (satu-satunya petualang Rank S).
//    - Kemenangan itu harus dibayar dengan nyawa temannya.
//    - Kaelen malu: zirahnya gagal melindungi temannya, jadi ia menutupnya dengan kardus.
//    - Tapi pengalaman tempurnya tidak diragukan.
// ============================================================

export const WARGA = {
  // ---------- Jalan masuk kota (dekat gerbang) ----------
  darto: {
    nama: 'Darto', peran: 'Petualang Rank D', ikon: '🗡️',
    sapa: 'Oh, halo! Maaf, aku lagi seru ngobrol sama Wulan. Kamu pendatang baru, ya?',
    kabar: 'Baik-baik saja. Kemarin aku pulang dari Gua Kristal, lutut gemetar tapi kantong penuh pecahan kristal.',
    rumor: 'Kami berdua lagi debat soal ini: katanya petualang paling hebat pun cuma pernah sampai bos Dungeon Api. Wulan bilang itu memalukan, aku bilang itu sudah paling jauh!',
  },
  wulan: {
    nama: 'Wulan', peran: 'Petualang Rank D', ikon: '🏹',
    sapa: 'Hai! Darto ini suka sekali memotong ceritaku. Ada yang bisa kubantu?',
    kabar: 'Capek, tapi senang. Aku sedang menabung untuk beli perisai baru dari Borin.',
    rumor: 'Kata orang, bos dungeon selain Api tidak pernah disentuh siapa pun. Kecuali bos Dungeon Es, yang hanya pernah dikalahkan satu orang: Kaelen, si pendekar kardus di alun-alun.',
  },
  hasan: {
    nama: 'Hasan', peran: 'Veteran Guild', ikon: '🛡️',
    sapa: 'Hmm? Santai saja, Nak. Aku sudah terlalu tua untuk terkejut.',
    kabar: 'Pinggangku sakit tiap hujan, tapi telingaku masih tajam. Aku tahu semua kabar di kota ini.',
    rumor: 'Puluhan tahun aku di lembah ini. Petualang terbaik pun paling jauh sampai di depan bos Dungeon Api. Itu batasnya. Hanya Kaelen yang pernah menembus Dungeon Es, dan harganya mahal sekali.',
  },
  sekar: {
    nama: 'Sekar', peran: 'Pemburu Kristal', ikon: '💎',
    sapa: 'Selamat datang di Kota Dungeon! Hati-hati di jalan, banyak yang buru-buru.',
    kabar: 'Aku mengumpulkan serpihan kristal untuk dijual ke penempa. Lumayan buat makan seminggu.',
    rumor: 'Sudah lihat pria berzirah kardus di alun-alun? Jangan ditertawakan. Itu Kaelen, satu-satunya petualang Rank S yang pernah mengalahkan bos dungeon.',
  },
  bram: {
    nama: 'Bram', peran: 'Murid Pandai Besi', ikon: '🔨',
    sapa: 'Awas, jangan terlalu dekat toko. Percikan api Borin suka loncat ke mana-mana!',
    kabar: 'Aku mengangkut arang sejak subuh. Borin bilang itu latihan, tapi kurasa dia cuma malas.',
    rumor: 'Borin pernah menawari Kaelen zirah baja baru, gratis. Ditolak. Kata Kaelen, ia belum pantas memakai zirah lagi. Borin sampai diam seharian.',
  },
  jaka: {
    nama: 'Jaka', peran: 'Petugas Obor Kota', ikon: '🔥',
    sapa: 'Obor harus menyala sampai pagi. Kalau padam, lembah terasa jauh lebih seram.',
    kabar: 'Tugasku gampang: isi minyak, bersihkan jelaga. Tapi pemandangan ke arah lembah dari sini paling bagus.',
    rumor: 'Dari sini mulut lembah kelihatan. Orang bilang Dungeon Api itu batas petualang biasa. Yang pernah melewatinya cuma Kaelen, saat ia menang di Dungeon Es.',
  },

  // ---------- Alun-alun ----------
  tarno: {
    nama: 'Tarno', peran: 'Pemandu Petualang Baru', ikon: '🧭',
    sapa: 'Pendatang baru? Aku pemandu kota. Kalau tersesat, tanya saja. Gratis, kok.',
    kabar: 'Ramai seperti biasa. Alun-alun ini hampir tidak pernah sepi.',
    rumor: 'Pemandu wajib hafal ceritanya: bos Dungeon Es dikalahkan Kaelen, dan harganya nyawa sahabatnya. Makanya pada pemula aku selalu bilang, jangan sok jagoan.',
    topik: [{ t: 'Apa itu obelisk di tengah alun-alun?', a: 'Obelisk kristal kuning. Katanya ia menyala pertama kali saat dungeon pertama dibuka. Entah benar atau tidak, yang jelas cantik waktu malam.' }],
  },
  rukmini: {
    nama: 'Rukmini', peran: 'Penghibur Keliling', ikon: '🎶',
    sapa: 'Mau dengar lagu? Sayang kecapiku sedang disetel.',
    kabar: 'Penontonku kebanyakan petualang yang mau tenang sebelum turun ke dungeon. Mereka penonton paling jujur.',
    rumor: 'Aku pernah mau membuat lagu tentang Kaelen. Dia memintaku berhenti. Katanya, jangan menyanyikan kemenangan yang membuat seseorang kehilangan sahabat.',
  },
  bonar: {
    nama: 'Bonar', peran: 'Peziarah Obelisk', ikon: '🙏',
    sapa: 'Sssh... obelisk ini berdenyut paling tenang kalau tidak ada yang berisik.',
    kabar: 'Aku berdoa di sini setiap hari untuk para petualang yang tidak pulang.',
    rumor: 'Banyak petualang berdoa di sini sebelum masuk dungeon. Kata mereka, yang terkuat pun mentok di bos Dungeon Api. Hanya Kaelen yang pernah menang di Dungeon Es. Ia sering berdiri di sini lama sekali.',
  },
  sumi: {
    nama: 'Sumi', peran: 'Tamu Penginapan', ikon: '🛏️',
    sapa: 'Aku sedang menunggu kamar kosong. Ratri, pemilik penginapan ini, selalu penuh tamunya.',
    kabar: 'Capek sekali sepulang dari dungeon. Yang kuinginkan cuma kasur dan sup hangat.',
    rumor: 'Kata Ratri, Kaelen sering menginap di kamar paling pojok. Pagi-pagi, kardus zirahnya selalu ia rapikan sendiri. Dengar-dengar ia jarang tidur nyenyak sejak kehilangan sahabatnya di Dungeon Es.',
  },
  lestari: {
    nama: 'Lestari', peran: 'Pelanggan Toko Ramuan', ikon: '🧪',
    sapa: 'Ssst, antreannya panjang. Dewi di dalam toko itu terlalu populer.',
    kabar: 'Aku menunggu ramuan hijau. Stoknya selalu cepat habis kalau petualang baru datang.',
    rumor: 'Kaelen langganan Dewi. Anehnya, ia selalu membeli ramuan untuk orang lain, tidak pernah untuk dirinya sendiri. Mungkin itu caranya menebus kesalahan.',
  },
  ayu: {
    nama: 'Ayu', peran: 'Petualang Rank C', ikon: '🗡️',
    sapa: 'Eh, ada tamu. Kami sedang istirahat sebentar.',
    kabar: 'Luka kecil sudah biasa. Yang penting pulang dengan selamat.',
    rumor: 'Kami pernah ikut rombongan ke Dungeon Api. Sampai di depan ruang bosnya saja kami semua mundur, panasnya tidak masuk akal. Padahal Kaelen melewati yang lebih parah di Es.',
  },
  gilang: {
    nama: 'Gilang', peran: 'Petualang Rank C', ikon: '⚔️',
    sapa: 'Hei. Kalau mau bergabung ngobrol, silakan.',
    kabar: 'Aku sedang berlatih tahan napas untuk Dungeon Es. Sulit sekali, ternyata.',
    rumor: 'Jangan percaya orang yang bilang Kaelen itu pengecut. Ia menghadapi bos Dungeon Es bersama sahabatnya. Hanya satu yang pulang, dan bosnya tumbang.',
  },
  wiryo: {
    nama: 'Pak Wiryo', peran: 'Pengawas Tambang Kristal', ikon: '⛏️',
    sapa: 'Hm, kau bukan pekerja tambang. Ada urusan apa?',
    kabar: 'Kristal tahun ini lebih sedikit. Dungeon seperti sedang menahan napas.',
    rumor: 'Soal zirah kardus Kaelen, semua orang tahu sebabnya. Yang perlu kau tahu: pengalaman tempurnya tidak ada yang menyamai di kota ini. Jangan remehkan.',
  },
  sundari: {
    nama: 'Nyai Sundari', peran: 'Tabib Kota', ikon: '💚',
    sapa: 'Mendekatlah, Nak. Ada yang terluka?',
    kabar: 'Luka petualang sembuh dengan ramuan dan tidur. Yang susah disembuhkan itu luka di dalam.',
    rumor: 'Akulah yang merawat Kaelen sepulang dari Dungeon Es. Luka di badannya sembuh dalam sebulan. Luka karena kehilangan sahabatnya... belum juga.',
  },

  // ---------- Penjaga gerbang dungeon di lembah ----------
  ferdi: {
    nama: 'Ferdi', peran: 'Pemburu Gua Kristal', ikon: '💎',
    sapa: 'Gerbang Kristal ramah untuk pemula, tapi jangan lengah.',
    kabar: 'Setiap hari aku periksa gerbang ini. Kristalnya berdenyut makin kuat belakangan.',
    rumor: 'Gua Kristal itu tempat pemula. Orang hebat pindah ke Dungeon Api, lalu mentok di bosnya. Di atas itu, hanya Kaelen yang pernah menang.',
  },
  gita: {
    nama: 'Gita', peran: 'Penjelajah Dungeon Batu', ikon: '⛰️',
    sapa: 'Gerbang Batu itu berat, seberat palu yang kubawa.',
    kabar: 'Tanganku pegal. Dinding dungeon Batu membuat senjata cepat tumpul.',
    rumor: 'Bos dungeon ini belum pernah disentuh siapa pun, termasuk aku. Katanya cuma satu orang yang pernah mengalahkan bos dungeon di lembah ini: Kaelen.',
  },
  reza: {
    nama: 'Reza', peran: 'Petualang Rank B', ikon: '🔥',
    sapa: 'Dekat Gerbang Api itu hangat. Terlalu hangat, malah.',
    kabar: 'Aku sedang memulihkan diri. Dua kali ke dalam, dua kali pula keluar dengan jubah gosong.',
    rumor: 'Dua kali aku sampai di depan ruang bos Dungeon Api, dua kali pula aku mundur. Itu batas kami yang Rank B ke atas. Konon cuma Kaelen yang pernah melewati batas itu.',
  },
  melati: {
    nama: 'Melati', peran: 'Pengintai Dungeon Es', ikon: '❄️',
    sapa: 'Dingin, ya? Gerbang Es memang begini sepanjang tahun.',
    kabar: 'Aku mencatat suhu gerbang setiap pagi. Makin lama makin dingin.',
    rumor: 'Bos Dungeon Es tidak pernah didekati orang, kecuali Kaelen. Ia keluar dari sana dengan wajah yang tidak pernah sama lagi.',
  },

  // ---------- Warga yang berjalan di jalan utama ----------
  hendra: {
    nama: 'Hendra', peran: 'Peronda Kota', ikon: '🏮',
    sapa: 'Sedang meronda. Kalau ada keributan, bilang padaku.',
    kabar: 'Kota ini aman. Yang berbahaya ada di dalam lembah, bukan di jalanan.',
    rumor: 'Dalam ronda, kudengar cerita yang sama dari semua orang: petualang terbaik mentok di bos Dungeon Api. Kaelen satu-satunya yang menang melawan bos dungeon, dan ia rela kehilangan segalanya untuk itu.',
  },
  maya: {
    nama: 'Maya', peran: 'Kurir Guild', ikon: '📜',
    sapa: 'Maaf, aku buru-buru mengantar surat ke guild!',
    kabar: 'Kakiku pegal. Tapi surat harus sampai sebelum matahari terbenam.',
    rumor: 'Sambil jalan kudengar: dungeon lain bosnya tidak pernah ada yang menyentuh. Hanya Kaelen yang menumbangkan satu, di Dungeon Es. Sahabatnya tidak ikut pulang.',
  },
  joni: {
    nama: 'Joni', peran: 'Pemuda Kota', ikon: '🧑',
    sapa: 'Halo! Aku lagi jalan-jalan, tidak ada kerjaan.',
    kabar: 'Aku mau jadi petualang, tapi ibuku bilang tunggu sampai umurku cukup.',
    rumor: 'Dulu aku sempat mentertawakan zirah kardus Kaelen. Ayahku langsung menjewerku dan menceritakan semuanya. Sejak itu aku malu.',
  },
  intan: {
    nama: 'Intan', peran: 'Pedagang Keliling', ikon: '🎒',
    sapa: 'Dagangan murah, kualitas jujur! Eh, tapi hari ini aku sedang menjajakan cerita.',
    kabar: 'Dagangan laris di kota ini. Petualang selalu butuh tali dan obor.',
    rumor: 'Di mana pun aku berdagang, orang bertanya soal Kaelen: si Rank S berzirah kardus. Aku selalu menjawab sama: pengalamannya tak diragukan, dan ia lebih terluka daripada kelihatannya.',
  },

  // ---------- Prajurit penjaga (model ksatria Kekaisaran) ----------
  bima: {
    nama: 'Prajurit Bima', peran: 'Penjaga Gerbang Kota', ikon: '🛡️',
    sapa: 'Selamat datang di Kota Dungeon. Jangan membuat keributan di dalam gerbang.',
    kabar: 'Tugas jaga sepanjang hari. Membosankan, tapi lebih baik daripada turun ke dungeon.',
    rumor: 'Semua yang lewat gerbang ini bertanya soal Kaelen. Jawabanku: ia satu-satunya Rank S yang menang melawan bos, dan ia berhak dihormati.',
  },
  laras: {
    nama: 'Ksatriawati Laras', peran: 'Penjaga Gerbang Kota', ikon: '🛡️',
    sapa: 'Berhenti sebentar, pendatang. Selamat datang di kota kami.',
    kabar: 'Hari yang tenang. Semoga besok juga.',
    rumor: 'Kalau kau melihat pria berzirah kardus di alun-alun, jangan menertawakannya. Itu Kaelen. Ia pernah menumbangkan bos dungeon, dan ia tahu persis harga yang harus dibayar.',
  },
  rangga: {
    nama: 'Kapten Rangga', peran: 'Kapten Penjaga Kota', ikon: '⭐',
    sapa: 'Kapten Rangga, penjaga kota. Ada yang ingin kau laporkan?',
    kabar: 'Kota aman, prajurit disiplin. Aku tak minta lebih.',
    rumor: 'Dengar baik-baik: petualang terbaik hanya sampai bos Dungeon Api. Bos lainnya belum tersentuh, kecuali bos Dungeon Es yang dikalahkan Kaelen dengan mengorbankan sahabatnya. Aku sendiri tidak pernah meragukan kemampuannya, dan tidak ada prajuritku yang berani.',
  },
  surya: {
    nama: 'Prajurit Surya', peran: 'Penjaga Alun-alun', ikon: '🛡️',
    sapa: 'Alun-alun ini kujaga. Silakan lewat, tapi jangan merusak apa pun.',
    kabar: 'Dari sini aku bisa melihat Kaelen berdiri berjam-jam. Aku tidak berani mendekat.',
    rumor: 'Sudah tiga tahun aku jaga di sini dan cerita Kaelen belum berubah: ia menang di Dungeon Es, sahabatnya gugur, dan zirahnya ia tutup kardus karena malu.',
  },
  wira: {
    nama: 'Prajurit Wira', peran: 'Penjaga Gerbang Dungeon', ikon: '🛡️',
    sapa: 'Gerbang Dungeon Cahaya. Pastikan perlengkapanmu cukup sebelum masuk.',
    kabar: 'Dari sini aku sering melihat petualang masuk. Yang keluar lebih sedikit dari yang masuk.',
    rumor: 'Bos Dungeon Cahaya belum pernah disentuh siapa pun. Begitu juga Kegelapan. Hanya satu bos yang pernah tumbang oleh petualang: bos Dungeon Es, oleh Kaelen.',
  },
  sari: {
    nama: 'Ksatriawati Sari', peran: 'Penjaga Gerbang Dungeon', ikon: '🛡️',
    sapa: 'Berhenti, petualang. Sudah daftar ke guild?',
    kabar: 'Sedikit lelah, tapi aman. Semoga tidak ada yang terluka hari ini.',
    rumor: 'Aku selalu mengingatkan petualang muda: jangan sampai kau pulang sendirian. Itulah pelajaran dari Kaelen, yang menang melawan bos Dungeon Es tapi kehilangan sahabatnya.',
  },
};

// ---------- Cerita tambahan dari tokoh yang dialognya ada di game.js (Mira, Garrick, Borin) ----------
export const CERITA = {
  mira: 'Hampir semua anggota guild pernah bercerita padaku. Intinya: petualang terbaik kita paling jauh hanya sampai bos Dungeon Api, dan bos lainnya belum pernah disentuh. Satu-satunya yang pernah mengalahkan bos, yaitu bos Dungeon Es, adalah Kaelen, petualang Rank S kita. Sayang sahabatnya tidak pulang bersamanya.',
  garrickKaelen: 'Aku yang menandatangani laporan malam itu. Kaelen turun ke Dungeon Es bersama sahabatnya. Bosnya tumbang, tapi hanya satu dari mereka yang kembali. Sejak itu zirahnya ia tutup kardus. Katanya malu memakai zirah yang gagal melindungi temannya. Tapi dengar, Nak: pengalaman tempurnya tak perlu diragukan. Aku pernah melihatnya bertarung sendiri, dan itu bukan sesuatu yang bisa diajarkan.',
  garrickTerkuat: 'Peringkat tertinggi di lembah ini cuma sampai di depan bos Dungeon Api. Lebih dari itu tidak ada yang berani. Dungeon lain bosnya tidak pernah disentuh. Kecuali Es, tentu saja, yang hanya pernah jatuh di tangan Kaelen, satu-satunya Rank S yang pernah kukenal.',
  ratri: 'Selamat datang di Penginapan Kota Dungeon! Kasur bersih, sup panas, dan perapian yang tak pernah padam. Mau menginap semalam?',
  ratriKamar: 'Kamarnya ada tiga, sederhana saja, di bawah tanah. Turun lewat tangga di sisi kiri ruangan ini. Dindingnya batu, jadi sejuk dan sunyi. Petualang yang pulang dari dungeon biasanya tidur seperti batu, lalu pagi harinya bangun dengan tenaga baru.',
  ratriKaelen: 'Kaelen sering menginap, selalu di kamar paling pojok. Pagi-pagi ia merapikan kardus zirahnya sendiri sebelum keluar. Semua orang di sini tahu alasannya, jadi tak ada yang berani bertanya. Orang yang pernah kehilangan sahabat seperti itu butuh tempat yang tenang, jadi kubiarkan perapiannya tetap menyala untuknya.',
  ratriRumor: 'Banyak tamu bercerita di sini. Katanya petualang terbaik hanya sampai bos Dungeon Api. Bos lain tak pernah disentuh, kecuali bos Dungeon Es oleh Kaelen. Harganya nyawa sahabatnya. Aku selalu bilang pada tamu muda: tidur yang cukup, dan pulanglah bersama temanmu.',
  dewi: 'Selamat datang di Toko Ramuan! Merah untuk memulihkan tenaga, hijau untuk menawar racun, biru untuk menahan dingin, ungu... sebaiknya jangan tanya.',
  dewiKaelen: 'Kaelen langgananku, sudah bertahun-tahun. Ia selalu membeli ramuan untuk petualang lain, tidak pernah untuk dirinya sendiri. Katanya dulu ia terlambat membawa ramuan untuk sahabatnya. Sejak itu, ia tak mau lagi terlambat untuk siapa pun.',
  dewiDungeon: 'Bawa ramuan merah banyak-banyak, dan ramuan biru kalau mau ke Dungeon Es. Petualang terbaik pun mentok di bos Dungeon Api, jadi jangan sombong. Yang pulang selamat itu yang membawa persediaan cukup.',
  borinKaelen: 'Kaelen? Aku sudah tawarkan zirah baja baru berkali-kali, gratis. Selalu ditolak. Zirahnya sendiri masih utuh, kardusnya itu yang menutupi. Katanya malu. Aku sudah bilang, zirah tidak pernah gagal, yang gagal itu keadaannya. Tapi orang keras kepala tak bisa dibujuk dengan baja.',
};

// ---------- Percakapan Kaelen (pendekar kardus di alun-alun). Pilihan "Aku menantangmu duel" ada di game.js ----------
export const KAELEN_TALK = {
  sapa: 'Hm. Kau mau bicara denganku? Kalau mau menantang, bilang saja. Kalau mau menertawakan kardusku, sudah terlalu banyak yang melakukannya.',
  siapa: 'Kaelen. Papan guild menyebutku Rank S. Peringkat itu hanya angka, Nak. Semua orang di kota ini sudah tahu ceritaku, jadi aku tak perlu berpura-pura.',
  kardus: 'Zirahku masih ada di dalam sana, kututupi kardus. Aku malu memakainya setelah gagal melindungi temanku. Zirah yang tak mampu menyelamatkan siapa pun tak pantas dipamerkan. Tapi jangan salah, kardus ini tidak mengurangi kemampuanku sedikit pun.',
  es: 'Kami turun berdua ke Dungeon Es. Bosnya tumbang, tapi temanku tidak bisa kembali. Orang menyebutnya kemenangan. Aku menyebutnya harga yang terlalu mahal. Hanya itu yang mau kuceritakan.',
};
