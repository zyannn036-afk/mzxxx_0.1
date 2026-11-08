import * as THREE from 'three';
import { loadCityHumans } from './city-npcs.js';
import { CITY_NPCS, CITY_NPC_FILES } from './city-npc-layout.js';
import { toWorld, toLocal, d2p, d3p, d4p, d5p } from './kekaisaran-layout.js';
import { loadVillagers } from './desa-npcs.js';
import { loadKnights } from './kekaisaran-ksatria.js';
import { loadMerchantGlb } from './kekaisaran-pedagang-glb.js';

// ============================================================
//  WARGA KOTA KEKAISARAN — dikelompokkan PER DISTRIK
//  NPC yang dipakai SAMA dengan Kota Arunika (model/rangka/animasi dari city-npcs.js, data karakter dari city-npc-layout.js, dipilih lewat nama).
//  Posisi = KOORDINAT LOKAL KOTA KEKAISARAN (x = ke depan / arah jalan ladang, z = ke kanan, pusat istana = 0,0); yaw 0 = menghadap +z kota.
//
//  CARA KERJA (hemat frame):
//   1. Tiap distrik punya lingkup bola otomatis (dihitung dari titik-titik wargamu). Model warga satu distrik BARU dimuat
//      saat pemain mendekati distrik itu (bukan semuanya sekaligus di awal), dimuat dari yang terdekat dulu.
//   2. Distrik yang jauh dilepas dari scene (bukan sekadar visible=false: objek tak-terlihat tetap dilewati updateMatrixWorld
//      tiap frame, 79 tulang x tiap NPC). Saat pemain kembali, grup dipasang lagi tanpa memuat ulang.
//   3. Di dalam distrik: NPC di luar layar / > FAR m juga dilepas dari pivotnya (alasan yang sama), tidak dianimasikan.
//   4. Animasi bertingkat: < NEAR tiap frame, < MID 20x/detik, lebih jauh 8x/detik, dan tiap NPC punya fase acak
//      supaya tidak semuanya diperbarui di frame yang sama (itu penyebab lonjakan/spike).
//   5. Bayangan hanya untuk NPC dekat (dengan histeresis, tidak berkedip). Jarak dihitung dari posisi dunia yang di-cache.
//   6. Pemain di dalam istana (player.indoor) = semua warga halaman disembunyikan.
//  Yang berdiri diam: idle + collider (dibuat sinkron saat chunk dibangun via col()). Yang berpatroli: bolak-balik dua titik, tanpa collider.
//  7. INTERAKSI: warga dalam jangkauan (TALK_R) bisa diajak bicara lewat tombol "Mengobrol": warga menoleh ke pemain (yang berpatroli berhenti),
//     melambai (karakter kota), gelembung dialog muncul, tekan lagi = kalimat berikutnya, tutup sendiri bila pemain menjauh / 8 dtk diam.
//     Hemat: hanya SATU sprite label nama & SATU sprite gelembung untuk seluruh kota (dipakai bergantian, dibuat saat pertama diperlukan).
//     Penyambung ke game: export citizenTalk / citizenCanTalk / citizenTalkName (dipanggil dari world.js, lihat catatan di bawah).
// ============================================================

const NEAR = 24, MID = 40, FAR = 60;                 // jarak animasi penuh / sedang / batas tampil (m)
const HZ_MID = 20, HZ_FAR = 8;                       // laju update animasi di tingkat sedang / jauh
const SHADOW_ON = 22, SHADOW_OFF = 28;               // bayangan menyala < 22 m, mati > 28 m (histeresis)
const SPAWN_MARGIN = 90;                             // model distrik dimuat saat pemain < radius distrik + 90 m
const HIDE_EXTRA = 12;                               // histeresis melepas/memasang grup distrik
const BOOT_DELAY = 3;                                // detik: beri waktu dunia selesai memuat sebelum warga mana pun dimuat
const COL_R = 0.5, WALK_SPEED = 1.1;
const TALK_R = 4.4, TAG_R = 16, TALK_TIMEOUT = 8;     // jangkauan bicara, jangkauan label nama (m), detik tanpa ditekan -> gelembung menutup

const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere();
const byName = n => { const d = CITY_NPCS.find(q => q.name === n); if (!d) console.warn('NPC kota tidak ditemukan:', n); return d; };

// ---------- DATA: warga per distrik ----------
// Koordinat distrik (u, v) = kerangka tiap distrik di kekaisaran-layout.js (u = menjauhi istana, v = ke samping); dikonversi ke lokal kota lewat d2p..d5p.
// Distrik 1 memakai koordinat lokal kota langsung. Semua titik sudah dicek: di dalam wilayah distrik, >= 5 m dari jejak bangunan (beranda/dekor),
// >= 2,5 m dari lampu, air mancur, bangku, kios, tiang bendera, patung & tiang kolonade, dan di luar zona penanaman pohon acak.
// Format entri: [nama NPC di city-npc-layout.js, x, z, yaw, (patroli: titik tujuan {x,z})]  — yaw 0 = menghadap +z lokal kota.
const lok = (x, z) => ({ x, z });
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
// dua warga berhadapan, berpusat di (u,v), terpisah 2*(du,dv)
function duo(conv, [a, b], u, v, du, dv) {
  const p = conv(u - du, v - dv), q = conv(u + du, v + dv);
  return [[a, p.x, p.z, face(p.x, p.z, q.x, q.z)], [b, q.x, q.z, face(q.x, q.z, p.x, p.z)]];
}
// tiga (atau lebih) warga melingkar menghadap pusat (u,v)
function cluster(conv, names, u, v, r = 0.9, a0 = Math.PI / 2) {
  const c = conv(u, v);
  return names.map((n, i) => { const a = a0 + i * 2 * Math.PI / names.length, p = conv(u + r * Math.cos(a), v + r * Math.sin(a)); return [n, p.x, p.z, face(p.x, p.z, c.x, c.z)]; });
}
const P = (d, r, th) => [d + r * Math.cos(th * Math.PI / 180), r * Math.sin(th * Math.PI / 180)];   // titik polar (r, sudut) di sekitar pusat alun-alun (u = d, v = 0)

// ---------- Warga DESA baru (model peasant, ringan) — karakter khusus Kota Kekaisaran, tidak bergantung pada file layout desa ----------
// tex: green | blue | brown | yellow (kaos peasant). lines = kalimat dialog (belum tersambung ke tombol "Mengobrol").
const WARGA_DESA = [
  { name: 'Pak Darto',   role: 'Petani',            tex: 'green',  lines: ['Hasil panen kami diantar ke barak tiap minggu.', 'Tanah di ladang sawah subur tahun ini.'] },
  { name: 'Kang Joko',   role: 'Kuli Panggul',      tex: 'brown',  lines: ['Karung gandum ini berat sekali, tapi upahnya lumayan.', 'Kalau mau ke gudang, lewat sini saja.'] },
  { name: 'Bu Lastri',   role: 'Penjual Sayur',     tex: 'yellow', lines: ['Sayur segar dari ladang, langsung dipetik pagi tadi!', 'Pasar paling ramai di sore hari.'] },
  { name: 'Mas Aryo',    role: 'Pedagang Keliling', tex: 'blue',   lines: ['Aku keliling dari desa ke desa membawa kabar dan barang.', 'Kota ini jauh lebih besar dari yang kubayangkan.'] },
  { name: 'Yu Tini',     role: 'Penjahit',          tex: 'yellow', lines: ['Para bangsawan selalu minta jahitan yang rumit.', 'Benang emas mahal, tapi mereka mau bayar.'] },
  { name: 'Pak Harjo',   role: 'Tukang Kayu',       tex: 'brown',  lines: ['Aku baru memperbaiki pintu kediaman di sana.', 'Kayu jati paling awet untuk bangunan besar.'] },
  { name: 'Le Bagas',    role: 'Murid Magang',      tex: 'green',  lines: ['Aku magang di akademi, tugasnya membawa buku-buku.', 'Katanya suatu hari aku boleh belajar sihir.'] },
  { name: 'Mbok Sumi',   role: 'Penjual Jamu',      tex: 'blue',   lines: ['Jamu buatanku bikin badan segar lagi.', 'Para sarjana akademi sering beli jamu penjernih pikiran.'] },
  { name: 'Mbak Wulan',  role: 'Penenun',           tex: 'yellow', lines: ['Kain-kain ini untuk seragam para pegawai balai.', 'Kantor-kantor di sini tak pernah sepi.'] },
  { name: 'Pak Slamet',  role: 'Penggembala',       tex: 'brown',  lines: ['Dombaku tersesat sampai ke alun-alun, haha.', 'Di kota rumput susah dicari.'] },
].map(d => ({ ...d, scale: 1, desa: true }));
const byDesa = n => WARGA_DESA.find(d => d.name === n);

// ---------- Pedagang berangka GLB (rigged_character_low_poly.glb & low_poly_adventurer.glb, dimuat oleh kekaisaran-pedagang-glb.js) ----------
// Model berangka tanpa animasi: pose berdiri, napas, & lambaian dibuat saat runtime. height = tinggi di dunia (m).
const PEDAGANG_GLB = [
  { name: 'Juragan Baskara', role: 'Saudagar Rempah', model: 'rigged_character_low_poly.glb', rig: 'mixamo', height: 1.75, lines: ['Rempah langsung dari pelabuhan timur, Tuan! Cium sendiri aromanya.', 'Balai Serikat Pedagang di ujung jalan ini yang menentukan harga di seluruh kota.', 'Simpan koinmu di Bank Kekaisaran, jangan di saku. Pencopet pasar itu cekatan.'] },
  { name: 'Kang Gandewa', role: 'Pedagang Penjelajah', model: 'low_poly_adventurer.glb', rig: 'rigify', height: 1.75, lines: ['Aku baru pulang dari hutan dan reruntuhan jauh di barat. Lihat peta-peta ini, semuanya kugambar sendiri.', 'Pedang, kapak, dan ransel ini sudah menemaniku ke mana-mana. Dagangan paling berharga ya ceritanya.', 'Mau membeli benda aneh dari tempat yang belum pernah kau lihat? Tanya saja, jangan malu.'] },
  { name: 'Dimas Nugraha', role: 'Pengusaha Muda', model: 'low_poly_boy.glb', rig: 'static', height: 1.5, lines: ['Aku baru setahun membuka usaha, dan Balai Serikat sudah memanggilku rapat.', 'Modal kecil, mimpi besar. Begitu caraku memulai di pasar ini.', 'Kalau punya ide dagangan bagus, ceritakan padaku. Siapa tahu kita bisa berserikat.'] },
  // ---- petualang yang berkeliling kota (berpatroli, lihat jalan() di bawah) ----
  // penyihir: berangka Rigify, pose bawaan sudah wajar (tangan kiri memegang tongkat) -> pose: 'natural'. Dua lainnya tanpa tulang (rig 'static'). Bila ada model yang berjalan menyamping / mundur, isi yawOff (rad, mis. Math.PI).
  { name: 'Ki Sanggana', role: 'Penyihir Pengelana', model: 'low_poly_mage_rigged_free.glb', rig: 'rigify', pose: 'natural', height: 1.75, lines: ['Aku menyusuri jalan-jalan kota ini sambil mencatat aliran sihir di tiap distrik.', 'Tongkat ini lebih tua dari dinding barak itu. Jangan dipegang, ya.', 'Pengelana yang baik tidak pernah buru-buru. Jalan pelan, lihat banyak.'] },
  { name: 'Elwin Berkacamata', role: 'Penyihir Elf Cendekia', model: 'low_poly_elf_mage_with_glasses_fantasy_pack.glb', rig: 'static', height: 1.7, lines: ['Kacamata ini buatan sendiri. Huruf-huruf kuno jadi terbaca jelas.', 'Aku sedang menghitung berapa langkah dari gerbang sampai ke istana. Jangan ajak bicara dulu, aku hampir lupa hitunganku!', 'Perpustakaan akademi menyimpan gulungan yang umurnya lebih panjang dari umur kekaisaran.'] },
  { name: 'Rangga Panah Senyap', role: 'Pemanah Petualang', model: 'low_poly_archer_fantasy_pack.glb', rig: 'static', height: 1.75, lines: ['Aku mencari kabar tentang buruan langka di hutan barat. Ada yang pernah melihatnya?', 'Busurku sudah menemaniku melewati tiga hutan dan satu rawa. Anak panahnya? Yang itu sering hilang.', 'Kota ramai begini membuat telingaku pegal. Aku lebih betah mendengar daun di hutan.'] },
].map(d => ({ ...d, scale: 1, glb: true }));
const byGlb = n => PEDAGANG_GLB.find(d => d.name === n);

// ---------- Ksatria & prajurit Distrik 1 (model FBX / GLB dari folder prajurit/, dimuat oleh kekaisaran-ksatria.js) ----------
// model = kunci di PRAJURIT_MODELS (kekaisaran-istana-layout.js): 'ksatria' (rangka, ringan) | 'kapten' | 'ksatriawati'. Tidak punya animasi jalan: berdiri jaga (gerak napas halus), jadi tidak dipakai untuk patroli.
const KSATRIA = [
  { name: 'Prajurit Bayu',     role: 'Penjaga Gerbang Distrik', model: 'ksatria', lines: ['Berhenti sebentar, Tuan. Ini Distrik Militer.', 'Lapangan apel ada di ujung jalan ini, markas komando di belakangnya.'] },
  { name: 'Ksatriawati Sekar', role: 'Penjaga Gerbang Distrik', model: 'ksatriawati', lines: ['Selamat datang di Military Quarter. Jaga sikap di dekat barak, ya.', 'Latihan pedang dan panah dimulai sejak fajar.'] },
  { name: 'Prajurit Cakra',    role: 'Penjaga Markas',          model: 'ksatria', lines: ['Hanya perwira yang boleh masuk Markas Komando.', 'Aku sudah berjaga di sini sejak matahari terbit.'] },
  { name: 'Prajurit Dharma',   role: 'Penjaga Markas',          model: 'ksatria', lines: ['Panji-panji di lapangan apel dikibarkan tiap pagi.', 'Gudang senjata dijaga ketat, jangan coba-coba mendekat.'] },
  { name: 'Kapten Wiratama',   role: 'Kapten Garnisun',         model: 'kapten',  lines: ['Pasukan! Tegak! Aku tidak mau melihat satu pun bahu yang miring.', 'Kekaisaran dijaga oleh disiplin, bukan hanya oleh tembok.', 'Kalau mau bergabung, temui aku setelah apel sore.'] },
  { name: 'Prajurit Eko',      role: 'Prajurit Garnisun',       model: 'ksatria', lines: ['Siap, Kapten! ...eh, maaf, Tuan, aku sedang berbaris.', 'Kapten memang keras, tapi beliau selalu membela anak buahnya.'] },
  { name: 'Prajurit Gilang',   role: 'Prajurit Garnisun',       model: 'ksatria', lines: ['Perisaiku baru ditempa di Pandai Besi sana.', 'Latihan pagi ini berat sekali, kakiku masih pegal.'] },
  { name: 'Prajurit Hadi',     role: 'Prajurit Garnisun',       model: 'ksatria', lines: ['Jangan bicara terlalu keras, Kapten bisa mendengar.', 'Makan siang di barak lumayan, asal kebagian.'] },
].map(d => ({ ...d, scale: 1, ksatria: true }));
const byKsatria = n => KSATRIA.find(d => d.name === n);

// satu warga di (u,v) distrik 2, menghadap kios pasar pada sudut `faceDeg` (sudut kios = k * 30°, jari-jari 13,6 dari pusat alun-alun), atau menghadap titik [u, v] bila faceDeg berupa larik
function pedagangGlb(name, u, v, faceDeg) {
  const p = d2p(u, v), a = (Array.isArray(faceDeg) ? 0 : faceDeg) * Math.PI / 180, t = Array.isArray(faceDeg) ? d2p(faceDeg[0], faceDeg[1]) : d2p(112 + 13.6 * Math.cos(a), 13.6 * Math.sin(a));
  return [name, p.x, p.z, face(p.x, p.z, t.x, t.z)];
}

// petualang yang berjalan bolak-balik antara dua titik (koordinat distrik (u,v) lewat conv = lok / d2p / d3p / ...), mulai dari titik pertama dan menghadap titik kedua. Berpatroli = tanpa collider.
function jalan(name, conv, a, b) { const p = conv(...a), q = conv(...b); return [name, p.x, p.z, face(p.x, p.z, q.x, q.z), { x: q.x, z: q.z }]; }

export const WARGA_DISTRIK = [
  {
    id: 'militer', name: 'Distrik 1 — Military Quarter',
    citizens: [
      ...duo(lok, ['Ksatria Laras', 'Astro'], 124, -15.6, 0, 0.8),                       // dua prajurit berjaga di lapangan apel
      ['Pak Bambang', 106, 20, Math.PI / 2, { x: 134, z: 20 }],                           // berpatroli pelan di sisi lapangan apel
      ['Kang Asep', 118.6, -29.5, 0],                                                     // tukang di jalan batu menuju Pandai Besi
      ...duo(lok, ['Pak Darto', 'Kang Joko'], 112, -19.2, 0, 0.8),                                      // dua warga desa di sisi lapangan apel
      // ---- ksatria & prajurit (model dari folder prajurit/); titik sudah dicek: di dalam Distrik 1, >= 5 m dari bangunan, >= 2,5 m dari lampu / bendera / patung / warga lain ----
      ['Prajurit Bayu', 77, -4.2, face(77, -4.2, 85, 0)], ['Ksatriawati Sekar', 77, 4.2, face(77, 4.2, 85, 0)],   // pos jaga di pintu masuk distrik, menghadap jalan utama
      ['Prajurit Cakra', 145.5, -3.4, face(145.5, -3.4, 137, 0)], ['Prajurit Dharma', 145.5, 3.4, face(145.5, 3.4, 137, 0)],   // penjaga Markas Komando, menghadap lapangan apel
      jalan('Ki Sanggana', lok, [106, 24], [134, 24]),                                                  // penyihir pengelana berjalan di sisi lapangan apel (sejajar jalur Pak Bambang, 4 m di sampingnya)
      ['Kapten Wiratama', 119, 11, 0],                                                                       // kapten memeriksa barisan (menghadap +z)
      ['Prajurit Eko', 115.5, 14.5, face(115.5, 14.5, 119, 11)], ['Prajurit Gilang', 119, 14.5, Math.PI], ['Prajurit Hadi', 122.5, 14.5, face(122.5, 14.5, 119, 11)],   // tiga prajurit berbaris menghadap kapten
    ],
  },
  {
    id: 'pedagang', name: 'Distrik 2 — Merchant Quarter',
    citizens: [
      ...cluster(d2p, ['Tuan Wicaksono', 'Zeta', 'Nyai Kemuning'], ...P(112, 9.8, 15)),   // bertiga di alun-alun pasar, di antara air mancur & kios
      ...duo(d2p, ['Bu Lastri', 'Mas Aryo'], ...P(112, 9.8, 195), 0.65, 0),                            // dua warga desa berbelanja di sisi seberang alun-alun
      pedagangGlb('Dimas Nugraha', ...P(112, 9.8, 105), [153, 0]),                                      // pengusaha muda (model GLB tanpa tulang) di antara kios 90° & 120°, menghadap Balai Serikat Pedagang
      pedagangGlb('Kang Gandewa', ...P(112, 9.8, 285), 300),                                            // pedagang penjelajah (model GLB) di antara kios 270° & 300°, menghadap kios 300°
      jalan('Rangga Panah Senyap', d2p, P(112, 9.8, 225), P(112, 9.8, 255)),                         // pemanah berjalan menyusuri alun-alun, di depan kios 240°
      pedagangGlb('Juragan Baskara', ...P(112, 9.8, 75), 60),                                           // saudagar (model GLB) di antara kios pukul 60° & 90°, menghadap kios 60°
    ],
  },
  {
    id: 'bangsawan', name: 'Distrik 3 — Noble Quarter',
    citizens: [
      jalan('Elwin Berkacamata', d3p, [122, -3.5], [134.6, -3.5]),                                     // penyihir elf menyusuri jalan utama menuju Kediaman Adipati
      ...duo(d3p, ['Raka', 'Joni Gondrong'], 134.6, 0, 0, 0.65),                         // di jalan utama menuju Kediaman Adipati
      ...duo(d3p, ['Yu Tini', 'Pak Harjo'], 108, 22.3, 0.65, 0),                                      // dua warga desa di pinggir taman formal
    ],
  },
  {
    id: 'akademi', name: 'Distrik 4 — Academy Quarter',
    citizens: [
      ...duo(d4p, ['Dika', 'Bang Rendy'], 108, 22.3, 0.65, 0),                            // di pinggir alun-alun lingkaran sihir
      ...duo(d4p, ['Le Bagas', 'Mbok Sumi'], 108, -22.3, 0.65, 0),                                     // dua warga desa di sisi seberang alun-alun
    ],
  },
  {
    id: 'administrasi', name: 'Distrik 5 — Administration Quarter',
    citizens: [
      ...cluster(d5p, ['Tuan Hartono', 'Nona Ratri', 'Pak Wiro'], 108, 22.3),            // di depan kolonade alun-alun sipil
      ...duo(d5p, ['Mbak Wulan', 'Pak Slamet'], 108, -22.3, 0.65, 0),                                     // dua warga desa mengurus keperluan di sisi seberang
    ],
  },
];
export const CITIZENS = WARGA_DISTRIK.flatMap(d => d.citizens);   // kompatibilitas dengan kode lama

// ---------- sprite label & gelembung (sama dengan npcs.js) ----------
function roundRect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
function makeSprite(w, h, sw, sh) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  spr.scale.set(sw, sh, 1); spr.center.set(0.5, 0); spr.renderOrder = 5;
  return { spr, c, ctx: c.getContext('2d'), tex };
}
function drawTag(t, name, role) {
  const { ctx: x, c } = t; x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(20,14,22,.72)'; roundRect(x, 6, 6, c.width - 12, c.height - 12, 26); x.fill();
  x.strokeStyle = '#6b5a3a'; x.lineWidth = 4; x.stroke();
  x.textAlign = 'center'; x.fillStyle = '#f3e3bd'; x.font = 'bold 46px Georgia'; x.fillText(name, c.width / 2, 58);
  x.fillStyle = '#c9b78a'; x.font = '30px Georgia'; x.fillText(role || '', c.width / 2, 98); t.tex.needsUpdate = true;
}
function drawBubble(t, name, text) {
  const { ctx: x, c } = t; x.clearRect(0, 0, c.width, c.height);
  x.font = '30px Georgia'; const maxW = c.width - 70, words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const test = cur ? cur + ' ' + w : w; if (x.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  lines.push(cur);
  const bh = 78 + lines.length * 38, oy = c.height - bh - 36;
  x.fillStyle = 'rgba(250,244,226,.96)'; roundRect(x, 8, oy, c.width - 16, bh, 24); x.fill(); x.strokeStyle = '#6b5a3a'; x.lineWidth = 5; x.stroke();
  x.beginPath(); x.moveTo(c.width / 2 - 16, oy + bh - 2); x.lineTo(c.width / 2, oy + bh + 26); x.lineTo(c.width / 2 + 16, oy + bh - 2); x.closePath(); x.fillStyle = 'rgba(250,244,226,.96)'; x.fill();
  x.textAlign = 'left'; x.fillStyle = '#8a3b2c'; x.font = 'bold 30px Georgia'; x.fillText(name, 36, oy + 46);
  x.fillStyle = '#3a2a18'; x.font = '30px Georgia'; lines.forEach((l, i) => x.fillText(l, 36, oy + 88 + i * 38)); t.tex.needsUpdate = true;
}

// ---------- penyambung ke world.js (satu sistem warga aktif per game) ----------
let active = null;
export const citizenTalk = () => active ? active.talk() : false;
export const citizenCanTalk = () => !!active && active.canTalk();
export const citizenTalkName = () => active ? active.talkName() : '';

const angDiff = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

// parent = grup `city`, col(lx, lz, r) = pembuat collider dari kekaisaran.js, player = { x, z, cam, indoor? } (dunia). Mengembalikan { update(t), talk(), canTalk(), talkName() }.
export function buildCitizens({ parent, col, player }) {
  const districts = [];
  for (const dd of WARGA_DISTRIK) {
    const defs = [], pts = [];
    for (const [name, x, z, yaw, to] of dd.citizens) {
      const d = byGlb(name) || byKsatria(name) || byDesa(name) || byName(name); if (!d) continue;
      const w = toWorld(x, z);
      defs.push({ ...d, x, z, yaw, wx: w.x, wz: w.z, look: null, patrol: to ? [{ x, z }, to] : null });
      pts.push([x, z]); if (to) pts.push([to.x, to.z]); else col(x, z, COL_R);   // yang diam: collider sekarang
    }
    if (!defs.length) continue;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const r = Math.max(...pts.map(p => Math.hypot(p[0] - cx, p[1] - cz))) + 3, wc = toWorld(cx, cz);
    const group = new THREE.Group(); group.name = 'warga-' + dd.id;
    districts.push({ id: dd.id, defs, group, r, wx: wc.x, wz: wc.z, spawned: false, attached: false, people: [] });
  }

  // fade() menyalakan aksi tujuan dan mematikan aksi asal sendiri (three.js menonaktifkan aksi yang bobotnya sudah 0)
  const fade = (from, to) => { to.reset().setEffectiveWeight(1).play(); from.crossFadeTo(to, 0.3, false); };

  function spawn(D) {
    D.spawned = true;
    D.defs.sort((a, b) => Math.hypot(a.wx - player.x, a.wz - player.z) - Math.hypot(b.wx - player.x, b.wz - player.z));   // terdekat dimuat dulu
    const onNpc = (def, n) => {
      const pivot = new THREE.Group(); pivot.position.set(def.x, 0, def.z); pivot.rotation.y = def.yaw; pivot.add(n.holder); D.group.add(pivot);
      n.idle.play(); n.idle.time = Math.random() * n.idle.getClip().duration; n.mixer.update(0);   // pose awal (bukan T-pose)
      const meshes = []; n.holder.traverse(o => { if (o.isMesh) meshes.push(o); });
      D.people.push({ def, n, pivot, meshes, on: true, shadow: true, wx: def.wx, wz: def.wz,
        acc: Math.random() / HZ_FAR, jit: 0.85 + Math.random() * 0.3,           // fase & interval acak: update tersebar antar-frame
        yaw: def.yaw, i: 1, wait: 2 + Math.random() * 3, walking: false,
        talking: false, talkT: 0, line: 0, greetT: 0, nearF: -1, turned: false });
    };
    console.info(`Warga ${D.id}: ${D.defs.filter(d => !d.desa && !d.ksatria && !d.glb).length} karakter kota + ${D.defs.filter(d => d.desa).length} warga desa + ${D.defs.filter(d => d.ksatria).length} ksatria + ${D.defs.filter(d => d.glb).length} pedagang GLB dijadwalkan`);
    loadCityHumans(CITY_NPC_FILES, D.defs.filter(d => !d.desa && !d.ksatria && !d.glb), onNpc);   // karakter manusia kota (FBX besar)
    loadKnights(D.defs.filter(d => d.ksatria), onNpc);                                  // ksatria & prajurit (FBX / GLB ringan, folder prajurit/)
    loadMerchantGlb(D.defs.filter(d => d.glb), onNpc);                                   // pedagang berangka GLB (Distrik 2)
    loadVillagers(D.defs.filter(d => d.desa), onNpc);                     // warga desa (peasant, ringan)
  }

  function patrol(p, dt) {
    const n = p.n, pts = p.def.patrol, pos = p.pivot.position;
    if (!p.walking) {
      p.wait -= dt;
      if (p.wait <= 0) { p.walking = true; fade(n.idle, n.walk); }
      return;
    }
    const tg = pts[p.i], dx = tg.x - pos.x, dz = tg.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { p.i = 1 - p.i; p.walking = false; p.wait = 3 + Math.random() * 3; fade(n.walk, n.idle); return; }
    const st = Math.min(d, WALK_SPEED * dt); pos.x += dx / d * st; pos.z += dz / d * st;
    p.yaw += angDiff(p.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 6); p.pivot.rotation.y = p.yaw;
    const w = toWorld(pos.x, pos.z); p.wx = w.x; p.wz = w.z;   // cache posisi dunia (hanya NPC yang bergerak)
  }

  // ---------- interaksi (dialog) ----------
  const ui = new THREE.Group(); ui.name = 'warga-ui'; parent.add(ui);
  let tagS = null, bubS = null, tagFor = '', cur = null, target = null, frameId = 0;
  const ensureUI = () => { if (tagS) return; tagS = makeSprite(512, 128, 2.2, 0.55); bubS = makeSprite(640, 300, 3.4, 3.4 * 300 / 640); tagS.spr.visible = bubS.spr.visible = false; ui.add(tagS.spr, bubS.spr); };
  const linesOf = p => (p.def.lines && p.def.lines.length) ? p.def.lines : ['...'];
  function closeTalk() {
    if (!cur) return; const p = cur; cur = null; p.talking = false; if (bubS) bubS.spr.visible = false;
    if (p.def.patrol) p.wait = Math.max(p.wait, 1.5);   // patroli lanjut sebentar lagi
  }
  function startTalk(p) {
    const n = p.n; p.talking = true; p.line = 0; p.talkT = 0; cur = p;
    if (p.walking) { p.walking = false; fade(n.walk, n.idle); }                      // yang berpatroli berhenti dulu
    else if (n.greet && n.greetDur > 0) { p.greetT = n.greetDur; fade(n.idle, n.greet); }   // karakter kota melambai
    p.wait = Math.max(p.wait, 3);
  }
  function talk() {
    const p = target; if (!p) return false;
    ensureUI();
    if (cur !== p) { closeTalk(); startTalk(p); } else p.line = (p.line + 1) % linesOf(p).length;
    p.talkT = 0; drawBubble(bubS, p.def.name, linesOf(p)[p.line]); bubS.spr.visible = true; tagS.spr.visible = false; return true;
  }

  let last = null, age = 0;
  const api = {
    talk, canTalk: () => !!target, talkName: () => target ? target.def.name : '',
    update(t) {
      const dt = last === null ? 0 : Math.min(0.1, Math.max(0, t - last)); last = t;
      target = null;
      if (!player || (age += dt) < BOOT_DELAY) return;
      const cam = player.cam, indoor = !!player.indoor; frameId++;
      if (cam) { _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); }
      let bestD = Infinity, tagP = null, tagD = Infinity;

      for (const D of districts) {
        const dD = Math.hypot(D.wx - player.x, D.wz - player.z);
        if (!D.spawned && dD < D.r + SPAWN_MARGIN) spawn(D);
        // pasang / lepas seluruh grup distrik dari scene (histeresis)
        const show = !indoor && dD < D.r + FAR + (D.attached ? HIDE_EXTRA : 0);
        if (show !== D.attached) { D.attached = show; if (show) parent.add(D.group); else parent.remove(D.group); }
        if (!D.attached) continue;

        for (const p of D.people) {
          const dx = p.wx - player.x, dz = p.wz - player.z, d = Math.sqrt(dx * dx + dz * dz);
          const near = d < (p.def.talkR || TALK_R);
          let vis = d < FAR;
          if (vis && cam && !near && !p.talking) { _sp.center.set(p.wx, 0.95, p.wz); _sp.radius = 1.8; vis = _fr.intersectsSphere(_sp); }   // yang dekat / sedang diajak bicara selalu tampil
          if (vis !== p.on) { p.on = vis; if (vis) p.pivot.add(p.n.holder); else p.pivot.remove(p.n.holder); }   // dilepas = tidak dilewati updateMatrixWorld & render
          if (!vis) continue;

          if (near) { p.nearF = frameId; if (d < bestD) { bestD = d; target = p; } }
          if (d < (p.def.tagR || TAG_R) && d < tagD) { tagD = d; tagP = p; }

          const sh = p.shadow ? d < SHADOW_OFF : d < SHADOW_ON;
          if (sh !== p.shadow) { p.shadow = sh; for (const m of p.meshes) m.castShadow = sh; }

          p.acc += dt;
          const iv = d < NEAR ? 0 : (d < MID ? 1 / HZ_MID : 1 / HZ_FAR) * p.jit;
          if (p.acc < iv) continue;
          const step = Math.min(0.1, p.acc); p.acc = 0;
          if (p.def.patrol && !p.talking) patrol(p, step);
          if (p.talking) {                                                   // menoleh ke pemain
            const pl = toLocal(player.x, player.z), pos = p.pivot.position;
            p.yaw += angDiff(p.yaw, Math.atan2(pl.x - pos.x, pl.z - pos.z)) * Math.min(1, step * 6); p.pivot.rotation.y = p.yaw; p.turned = true;
          } else if (p.turned && !p.def.patrol) {                            // kembali ke arah semula
            const k = angDiff(p.yaw, p.def.yaw);
            if (Math.abs(k) < 0.01) { p.yaw = p.def.yaw; p.turned = false; } else p.yaw += k * Math.min(1, step * 3);
            p.pivot.rotation.y = p.yaw;
          }
          if (p.greetT > 0 && (p.greetT -= step) <= 0) fade(p.n.greet, p.n.idle);   // lambaian selesai
          p.n.mixer.update(step);
        }
      }

      // obrolan: tutup bila pemain menjauh / terlalu lama diam
      if (cur && (cur.nearF !== frameId || (cur.talkT += dt) > TALK_TIMEOUT)) closeTalk();
      // label nama untuk warga terdekat (bukan yang sedang bicara) & gelembung di atas yang sedang bicara
      const tp = tagP && !tagP.talking ? tagP : null;
      if (tp) { ensureUI(); if (tagFor !== tp.def.name) { tagFor = tp.def.name; drawTag(tagS, tp.def.name, tp.def.role); } tagS.spr.position.set(tp.pivot.position.x, tp.n.headY + 0.2, tp.pivot.position.z); tagS.spr.visible = true; }
      else if (tagS) tagS.spr.visible = false;
      if (cur && bubS) bubS.spr.position.set(cur.pivot.position.x, cur.n.headY + 0.3, cur.pivot.position.z);
    }
  };
  active = api;
  return api;
}
