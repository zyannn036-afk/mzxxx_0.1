import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ============================================================
//  LYRA — anggota party (ASSASSIN, memegang belati) yang bisa direkrut di Balai Petualang (model: lyra.vrm, VRoid / VRM 1.0)
//  Alur:
//    1. Lyra berdiri di Balai Petualang (kota-guild.js memanggil lyra.placeInGuild). Bicara dengannya (E) -> "Bergabunglah dengan party-ku!" = direkrut.
//    2. Setelah direkrut ia ikut ke mana pun pemain pergi: dunia luar, kota, interior (guild, penginapan, dll.), dungeon, dan arena.
//       Ia berjalan DI SAMPING pemain (bukan di belakang) dan otomatis muncul di sisi pemain setelah pindah tempat.
//    3. Dalam pertempuran ia melesat ke musuh di dekat pemain, menebas dengan belati (kombo 3 serangan: tebas, tebas balik, tusukan penutup),
//       lalu berpencar mengitari musuh (pindah posisi ke sisi/belakang musuh) dan menyerang lagi tanpa kembali ke pemain. Ia baru kembali ke sisi pemain setelah tidak ada musuh di dekat pemain. Ada peluang critical. Pemulihan HP (peninggalan versi penyihir) dimatikan secara bawaan: LYRA.heal.enabled.
//    3b. SKILL "Tarian Bayangan" (mirip Dash Petir skill 5 Louis, tanpa petir): Lyra mengisi sebentar, memanggil bayangan dirinya (clone), lalu semuanya
//        menerjang lurus MENEMBUS musuh berkali-kali berturut-turut; tiap musuh yang ditembus terkena tusukan beruntun. Clone hanya mewarisi 25% atribut serang Lyra.
//        Dipakai otomatis saat bertarung (ada jeda). Semua angka di LYRA.skill. Hook opsional env.dashLen(x,z,dx,dz,L) menjepit jarak terjang (arena / dinding dungeon).
//    3b2. SKILL "Belati Kilat": Lyra melempar belati ke musuh terkuat, langsung teleport ke belakangnya, lalu petir PINK menyambar musuh itu (+ splash ke sekitarnya). Semua angka di LYRA.blade.
//  3c. DARAH (HP) Lyra: bar HP melayang di atas kepalanya (muncul saat terluka). Ia terluka bila musuh menyapunya (game.js memanggil lyra.hurtNear di serangan jarak dekat)
//        atau saat serangan mengenai pemain di dekatnya (lyra.onPlayerHurt: sebagian damage ikut mengenainya). Kebal sebentar setelah terkena, kebal saat Tarian Bayangan.
//        HP habis -> TUMBANG (terbaring) lalu bangkit sendiri setelah LYRA.life.downT detik dengan setengah HP. HP pulih pelan bila lama tidak terkena.
//    4. Bicara lagi dengannya (E) -> "Tunggu di sini dulu" = keluar dari party; ia TETAP berdiri di tempat itu (tidak kembali ke guild) dan bisa diajak lagi (E) kapan saja. Posisinya tersimpan (waitAt).
//  4b. DODGE: Lyra membaca area peringatan skill bos (lingkaran, garis, proyektil) dan mundur keluar sebelum mendarat; bila lengah ia terkena damage (LYRA.dodge).
//  5. AGGRO: musuh biasa, monster hutan & BOS bisa mendeteksi Lyra dan mengejar/menyerangnya; sasaran = yang paling banyak memberi damage (LYRA.aggro). Logikanya di game.js (enemyTargetsLyra).
//  Status rekrut tersimpan di localStorage (SAVE_KEY). game.js memasang lyra.bind({...}) sekali; semua angka yang bisa diatur ada di LYRA di bawah.
// ============================================================
export const LYRA = {
  file: 'lyra.vrm', name: 'Lyra', role: 'Assassin', icon: '🗡️',
  side: 1.3,                                     // jarak ke SAMPING pemain saat berjalan/diam (m). Positif = sisi kanan pemain, negatif = sisi kiri
  back: 0.15,                                    // sedikit ke belakang dari garis sejajar pemain (m); 0 = tepat sejajar
  maxSpeed: 11,                                  // kecepatan lari tertinggi saat menyusul pemain (m/s)
  talkRange: 2.8,                                // jarak maksimal agar bisa diajak bicara (m)
  attack: {
    range: 18,                                   // jarak musuh dari PEMAIN agar Lyra menyerangnya (m). Ia tetap mengejar sampai range + 4 sebelum menyerah
    reach: 0.9,                                  // jarak berdiri dari tepi musuh saat menebas (m)
    dashSpeed: 16,                               // kecepatan melesat ke musuh (m/s)
    swing: 0.5,                                  // durasi satu serangan (detik)
    combo: 3,                                    // jumlah serangan per kombo (tebas, tebas balik, tusukan)
    cd: 0.6,                                     // jeda sebelum menyerang lagi setelah semua musuh habis & ia sudah kembali (detik)
    gapMin: 0.3, gapMax: 0.7,                    // jeda antar kombo SAAT BERTARUNG: ia berpindah mengitari musuh (detik), TIDAK kembali ke pemain
    dmgMin: 9, dmgMax: 14,                       // damage per serangan; dikalikan pengali pedang pemain oleh hurtEnemy
    finisher: 1.4,                               // pengali damage serangan terakhir (tusukan)
    crit: 0.2, critMul: 2,                       // peluang & pengali critical
    color: 0xff5a78, force: 4,                   // warna percikan & dorongan musuh
  },
  skill: {   // "Tarian Bayangan": terjang menembus beruntun + clone
    enabled: true, name: 'Tarian Bayangan',
    cd: 16,                                      // jeda skill (detik), dihitung setelah skill selesai
    charge: 0.45,                                // lama mengisi (clone muncul di akhir isi)
    rounds: 5,                                   // jumlah terjang beruntun
    wind: 0.1, rec: 0.14,                        // aba-aba sebelum tiap terjang & jeda singkat sesudahnya (detik)
    speed: 46, over: 4,                          // kecepatan terjang (m/s) & seberapa jauh melewati musuh (m)
    hitR: 1.2,                                   // kelonggaran kena (ditambah radius musuh)
    stabs: 3, stabGap: 0.07,                     // tusukan beruntun per musuh yang ditembus & jedanya (detik)
    dmgMin: 16, dmgMax: 22, finisher: 1.3,       // damage per tusukan (dikali pengali pedang oleh hurtEnemy); tusukan terakhir dikali finisher
    force: 10,                                   // dorongan musuh pada tusukan terakhir
    color: 0xff5a78, core: 0xffd9e4,             // warna jejak bilah
    clone: { count: 3, inherit: 0.25 },          // jumlah clone & bagian atribut serang Lyra yang diwarisi (0.25 = 25%: damage & peluang critical; kecepatan & gerak tetap sama)
  },
  blade: {   // "Belati Kilat": melempar belati ke target -> teleport ke belakang target -> sambaran petir PINK menghantam target (+ area sekitarnya)
    enabled: true, name: 'Belati Kilat',
    cd: 12,                                      // jeda skill (detik), dihitung setelah skill selesai
    minDist: 3, range: 18,                       // jarak target dari Lyra (m): terlalu dekat = tidak dipakai; terlalu jauh = tidak dipakai. Target = musuh ber-HP terbanyak (bos diutamakan)
    wind: 0.28, speed: 48,                       // aba-aba sebelum melempar (detik) & kecepatan belati terbang (m/s)
    throwDmgMin: 14, throwDmgMax: 20,            // damage lemparan belati (dikali pengali pedang oleh hurtEnemy)
    reach: 1.1,                                  // jarak muncul dari tepi target setelah teleport (m); ia muncul DI BELAKANG target
    charge: 0.5,                                 // lama mengumpulkan petir setelah teleport; lingkaran peringatan pink muncul di bawah target
    rec: 0.45,                                   // jeda sesudah sambaran (detik)
    rad: 3.2,                                    // radius sambaran petir (m); semua musuh di dalamnya terkena
    dmgMin: 45, dmgMax: 60, splash: 0.6,         // damage sambaran pada target; musuh lain di area terkena splash × damage ini. Peluang & pengali critical sama dengan serangan biasa
    force: 8,                                    // dorongan pada target
    height: 22,                                  // tinggi awal petir di langit
    color: 0xff4fd0, core: 0xffe6fa,             // warna petir (pink) & inti
    invuln: true,                                // kebal selama skill berlangsung
    sfx: { teleport: 'dash', strike: 'strike', tVol: 1, sVol: 1, tShake: 0.5, sShake: 0.85 },   // suara & guncangan layar SAMA dengan skill Dash Petir Louis: teleport = petir_menerjang.mp3, sambaran = petir_menyambar.mp3 (nama kunci di ptSnd game.js)
  },
  life: {   // darah (HP) Lyra
    alwaysShow: true,                            // true = bar HP selalu terlihat di atas kepala Lyra; false = hanya muncul saat terluka
    max: 100,                                    // HP maksimal (HP pemain = 100)
    share: 0.5, shareRange: 3.5,                 // saat pemain terkena serangan & Lyra ada dalam shareRange (m), ia ikut menerima share × damage
    inv: 0.5,                                    // kebal sesaat setelah terkena (detik)
    regen: 3, regenDelay: 5,                     // pulih regen HP/detik setelah regenDelay detik tidak terkena
    downT: 12, reviveFrac: 0.5,                  // lama tumbang (detik) & HP saat bangkit (bagian dari max)
  },
  aggro: {   // MUSUH BISA MENDETEKSI & MENYERANG LYRA (musuh biasa & monster hutan; bos tetap mengincar pemain)
    enabled: true,                               // false = semua musuh hanya mengincar pemain (perilaku lama)
    detect: 8,                                   // musuh yang belum pernah dipukul mengincar Lyra bila ia lebih dekat dari pemain & berjarak < detect (m)
    weight: 1.5,                                 // pengali "ancaman" damage Lyra (>1 = musuh lebih mudah berpaling ke Lyra dibanding ke pemain)
    decay: 5,                                    // ancaman memudar sebesar ini per detik (musuh lupa siapa yang memukul bila lama tidak dipukul)
    hyst: 1.25,                                  // musuh baru ganti sasaran bila ancaman lawan > ancaman sasaran sekarang × hyst (supaya tidak bolak-balik)
    bosses: true,                                // true = BOS juga bisa mengincar Lyra: seluruh skill bos (dibidik, dikejar, dipukulkan) diarahkan ke Lyra seperti ke pemain
    bossDetect: 14,                              // jarak deteksi bos terhadap Lyra (m), mirip `detect` untuk musuh biasa
    bossLock: 3,                                 // bos tidak berganti sasaran lebih sering dari ini (detik), supaya rangkaian skill tidak berpindah di tengah jalan
  },
  dodge: {   // MENGHINDARI SKILL BOS: Lyra membaca area peringatan / proyektil bos lalu mundur keluar dari area sebelum serangan mendarat
    enabled: true,
    look: 1.6,                                   // area dianggap ancaman bila sisa waktu sebelum mendarat <= look (detik)
    pad: 0.9,                                    // jarak aman dari tepi area saat memilih titik mundur (m)
    react: [0.12, 0.3],                          // waktu reaksi acak sebelum mulai mundur (detik) — supaya tidak terasa sempurna
    chance: 0.9,                                 // peluang ia menyadari ancaman (0.9 = sesekali lengah & terkena); setelah terkena ia langsung sadar
    speed: 15,                                   // kecepatan mundur (m/s)
    rest: 0.25,                                  // jeda singkat setelah mundur sebelum menyerang lagi (detik)
    dmgMul: 1,                                   // damage area skill bos ke Lyra = damage ke pemain × angka ini (1 = Lyra diperlakukan sama seperti pemain; HP-nya pun sama)
  },
  heal: { enabled: false, below: 0.45, amount: 0.25, cd: 30 },   // opsional: pulihkan 25% HP maks bila HP pemain < 45% (mati secara bawaan)
  face: { happy: 0 },   // 0 = wajah netral & mulut tertutup saat tidak bicara; naikkan (mis. 0.15) bila ingin sedikit senyum — tapi pada model VRoid ini bisa ikut membuat mulut terbuka
  mouth: { cps: 14, open: 0.8, openRate: 18, closeRate: 34 },   // gerak mulut saat bicara (disesuaikan huruf vokal teks): cps = kecepatan ucap (huruf/detik), open = bukaan mulut maksimal 0..1; huruf m/b/p & spasi/tanda baca = mulut menutup (mingkem); closeRate > openRate = menutup lebih cepat
  weapon: { file: 'short_sword.glb', length: 0.8, gripAt: 0.13, throwScale: 1 },   // senjata: model short_sword.glb (taruh sejajar lyra.vrm). length = panjang total di tangan (m), gripAt = posisi genggaman dari ujung gagang (0..1 dari panjang), throwScale = pengali ukuran saat dilempar (Belati Kilat). Bila file gagal dimuat, dipakai belati bawaan.
  dagger: { sheathDelay: 2.5 },   // (nama 'dagger' dipertahankan: waktu senjata disembunyikan saat tidak bertarung)   // belati disembunyikan saat tidak bertarung; dihunus begitu menyerang / memakai skill, disarungkan lagi setelah sekian detik tanpa pertempuran (0 = langsung)
  home: { x: -3.4, z: 3.0, rot: Math.PI * 0.75 },   // posisi berdiri di Balai Petualang (koordinat lokal ruangan guild)
};

// KEPRIBADIAN: Lyra itu jahil, usil, menyebalkan, percaya diri, suka menggoda & meledek (nada sarkastis) — BUKAN assassin dingin / pendiam. Ia pengguna petir juga, dan penasaran dengan petir Louis
// (sesekali bertanya asal-usulnya, kagum tapi tetap dengan gaya mengejek). Kepribadian ini harus tetap terasa di setiap kalimat baru yang ditambahkan.
export const LYRA_TALK = {   // semua kalimat Lyra ada di sini
  sapa: 'Oh? Jadi ini petualang yang dibicarakan semua orang? Hmm... lebih pendek dari bayanganku. Hihi, bercanda! Aku Lyra, assassin paling keren yang pernah kamu temui. Lagi cari rekan buat jalan bareng, dan kamu... yah, lumayan lah buat dicoba.',
  siapa: 'Namaku Lyra! Assassin, pengguna petir, dan satu-satunya orang di guild ini yang tidak membosankan. Dulu aku kerja sendirian, tapi ternyata jadi keren tanpa ada yang melihat itu kurang seru. Jadi? Mau jalan bareng aku, atau mau terus berdiri bengong di situ?',
  bladeCast: 'Belati Kilat!',
  skill: 'Mau tahu rahasia dapurku? Aku cepat, lincah, dan hobi bikin musuh pusing. Aku bisa melesat sebelum mereka sempat berkedip, melempar belati, lalu berteleport ke sana dan... DUAR, petir turun dari langit. Kalau lagi mau pamer, kupanggil tiga bayanganku sekaligus buat menusuk mereka dari segala arah. Bayangannya cuma punya seperempat kekuatanku sih, tapi mereka sama menyebalkannya denganku. Hehe.',
  skillCast: 'Tarian Bayangan!',
  tumbang: 'Lyra tumbang!',
  bangkit: 'Hehe, kaget ya? Aku tidak semudah itu dikalahkan. Ayo lanjut!',
  gabung: 'Yes! Keputusan bagus, Louis. Mulai sekarang aku di sampingmu, jadi jangan sampai kesandung ya, aku malas menolong. Hehe. Kalau ada yang perlu dihabisi, bilang saja.',
  sapaTunggu: 'Oh, sudah balik? Lama banget. Aku sampai hampir tertidur di sini, tahu. Jadi, mau jalan lagi atau cuma mau lihat wajah cantikku?',
  gabungLagi: 'Nah, begitu dong! Aku sudah bosan menunggu. Ayo, jangan sampai aku yang harus menarikmu.',
  ngobrolTunggu: 'Perasaanku? Bosan setengah mati. Kalau kamu pergi lebih lama lagi, mungkin aku mulai menggambar kumis di patung-patung sekitar sini. Hehe.',
  sapaParty: 'Hm? Kangen ya? Atau kamu cuma butuh teman ngobrol karena dunia ini sepi tanpa aku?',
  ngobrol: 'Perasaanku? Bosan, dan itu salahmu: kamu jarang sekali ketemu musuh yang pantas dihajar. Tenang, selama aku di sampingmu tidak ada yang bisa mendekat dari sisi ini. Dari sisi satunya... itu urusanmu. Hihi.',
  petir: 'Hei, Louis. Petirmu itu dapat dari mana sih? Jangan salah paham, aku juga pengguna petir dan jelas lebih jago. Cuma... caramu mengeluarkannya itu beda. Kasar, tapi ada sesuatu yang bikin aku penasaran. Jadi siapa yang mengajarimu? Atau kamu cuma kebetulan tersambar? Hihi.',
  tantang: 'Oh, berani menantangku? Boleh. Tapi sebelum itu, pamerkan petirmu sekali lagi dong. Aku mau lihat dari dekat. Bukan karena kagum ya! Aku cuma mau tahu seberapa jauh bedanya dengan punyaku. Hehe.',
  pisah: 'Hah, ditinggal di sini? Baiklah, baiklah. Aku tunggu di sini. Jangan lama-lama ya. Aku gampang bosan, dan kalau bosan... aku suka iseng.',
  heal: 'Diam dulu, jangan banyak gerak. Nanti kuledek habis-habisan setelah ini.',
};

const SAVE_KEY = 'luis-party-lyra';
const readRaw = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { return {}; } };
const readSave = () => !!readRaw().recruited;
const readWait = () => { const w = readRaw().wait; return w && Number.isFinite(w.x) && Number.isFinite(w.z) && typeof w.ctx === 'string' ? { x: w.x, y: Number.isFinite(w.y) ? w.y : 0, z: w.z, rot: Number.isFinite(w.rot) ? w.rot : 0, ctx: w.ctx } : null; };   // tempat ia menunggu (koordinat dunia + konteks lokasi)
const writeSave = (v, w) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ recruited: !!v, wait: w || null })); } catch (e) { /* abaikan */ } };

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- keadaan ----------
const root = new THREE.Group(); root.name = 'lyra-party'; root.visible = false;
let vrm = null, B = null, loading = false, failed = false, env = null, guildGroup = null, recruited = readSave(), waitAt = readSave() ? null : readWait();   // waitAt = { x, y, z, rot, ctx } bila Lyra disuruh menunggu di suatu tempat (bukan di guild)
// atk: null | { e: musuh, phase: 'dash' | 'combo', hit: nomor serangan, u: progres serangan 0..1, dealt: sudah mengenai? }
const S = { say: null, spk: 0, vis: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }, armT: 0, drawn: 0, grip: 0, talk: false, mode: 'guild', ctx: '', moving: false, speed: 0, ph: 0, t: 0, cd: 1, healCd: 0, atk: null, dg: null, dgSeen: false, dgWait: 0, dgBlind: false, sk: null, skCd: 5, bkCd: 9, ev: [], hp: 100, down: false, downT: 0, lie: 0, inv: 0, flinch: 0, hpShow: 0, regenT: 0, hpKey: '', blinkT: rnd(2, 5), blink: 0, headYaw: 0, fa: 0, lastY: 0 };
let tag = null, hpBar = null;

const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

// ---------- efek sederhana & kejadian tertunda ----------
const fxs = [];   // { t, life, upd(k), end() }
function addFx(life, upd, end) { fxs.push({ t: 0, life, upd, end }); }
function tickFx(dt) { for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i]; f.t += dt; const k = f.t / f.life; if (k >= 1) { if (f.end) f.end(); fxs.splice(i, 1); } else f.upd(k); } }
function tickEv(dt) { for (let i = S.ev.length - 1; i >= 0; i--) { const v = S.ev[i]; v.t -= dt; if (v.t <= 0) { S.ev.splice(i, 1); v.fn(); } } }
function flash(pos, color, size, life) {   // bola cahaya yang membesar lalu memudar
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.position.copy(pos); m.renderOrder = 29; env.scene.add(m);
  addFx(life, k => { m.scale.setScalar(size * (0.4 + 0.9 * k)); m.material.opacity = 1 - k; }, () => { m.removeFromParent(); m.material.dispose(); });
}
function streak(a, b, color, core) {   // jejak bilah panjang di lantai sepanjang terjangan (dua bidang bersilang, aditif)
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz); if (len < 0.2) return;
  const g = new THREE.Group(), mats = [];
  for (const [rotX, col, w, o] of [[-Math.PI / 2, color, 0.5, 0.75], [0, core, 0.22, 0.9]]) {
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.rotation.x = rotX; m.scale.set(len, w, 1); g.add(m); mats.push([mat, o, m, w]);
  }
  g.position.set((a.x + b.x) / 2, 0.95, (a.z + b.z) / 2); g.rotation.y = Math.atan2(-dz, dx); g.renderOrder = 28; env.scene.add(g);
  addFx(0.35, k => { for (const [mat, o, m, w] of mats) { mat.opacity = o * (1 - k); m.scale.y = w * (1 - 0.7 * k); } }, () => { g.removeFromParent(); for (const [mat, , m] of mats) { mat.dispose(); m.geometry.dispose(); } });
}

function makeTag() {   // papan nama melayang di atas kepala (hanya tampil saat Lyra menunggu di guild)
  const c = document.createElement('canvas'); c.width = 384; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = 'rgba(30,18,10,.82)'; x.beginPath(); if (x.roundRect) x.roundRect(4, 4, 376, 88, 16); else x.rect(4, 4, 376, 88); x.fill(); x.strokeStyle = '#d9b24a'; x.lineWidth = 3; x.stroke();
  x.textAlign = 'center'; x.fillStyle = '#ffe9a8'; x.font = 'bold 34px Georgia, serif'; x.fillText(LYRA.name, 192, 46); x.fillStyle = '#d8c9a0'; x.font = '22px Georgia, serif'; x.fillText(LYRA.role, 192, 76);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); s.scale.set(2.2, 0.55, 1); s.position.y = 2.2; return s;
}

function makeHpBar() {   // bar darah melayang di atas kepala
  const c = document.createElement('canvas'); c.width = 192; c.height = 40;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, fog: false })); sp.scale.set(1.5, 0.32, 1); sp.position.y = 2.0; sp.renderOrder = 40; sp.userData.c = c; sp.visible = false; return sp;
}
function drawHp() {   // gambar ulang hanya bila nilainya berubah
  if (!hpBar) return;
  const L = LYRA.life, f = clamp(S.hp / L.max, 0, 1), key = S.down ? 'd' + Math.ceil(S.downT) : String(Math.ceil(S.hp));
  if (key === S.hpKey) return; S.hpKey = key;
  const c = hpBar.userData.c, x = c.getContext('2d'); x.clearRect(0, 0, 192, 40);
  x.fillStyle = 'rgba(20,10,14,.85)'; x.beginPath(); if (x.roundRect) x.roundRect(2, 8, 188, 24, 10); else x.rect(2, 8, 188, 24); x.fill();
  if (f > 0) { const g = x.createLinearGradient(0, 0, 192, 0); g.addColorStop(0, f > 0.35 ? '#ff7a95' : '#ff3b3b'); g.addColorStop(1, f > 0.35 ? '#ff2f5f' : '#b01818'); x.fillStyle = g; x.beginPath(); if (x.roundRect) x.roundRect(6, 12, 180 * f, 16, 7); else x.rect(6, 12, 180 * f, 16); x.fill(); }
  x.strokeStyle = '#e8c9d2'; x.lineWidth = 2; x.beginPath(); if (x.roundRect) x.roundRect(2, 8, 188, 24, 10); else x.rect(2, 8, 188, 24); x.stroke();
  x.textAlign = 'center'; x.font = 'bold 17px Georgia, serif'; x.fillStyle = '#fff'; x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 3;
  const txt = S.down ? 'Tumbang ' + Math.ceil(S.downT) + 's' : Math.ceil(S.hp) + ' / ' + L.max; x.strokeText(txt, 96, 26); x.fillText(txt, 96, 26);
  hpBar.material.map.needsUpdate = true;
}
function resetLife() { S.dg = null; S.dgSeen = false; S.hp = LYRA.life.max; S.down = false; S.downT = 0; S.lie = 0; S.inv = 0; S.flinch = 0; S.hpShow = 0; S.hpKey = ''; if (hpBar) hpBar.visible = false; if (vrm) vrm.scene.rotation.x = 0; }
function hurtLyra(n) {   // true bila benar-benar terkena
  const L = LYRA.life;
  if (!recruited || S.mode !== 'party' || !env || !vrm || !root.visible || S.down || S.inv > 0 || (S.sk && S.sk.imm !== false)) return false;
  n = Math.max(1, Math.round(n)); S.hp = Math.max(0, S.hp - n); S.inv = L.inv; S.flinch = 1; S.dgSeen = true; S.dgBlind = false; S.dgWait = 0;   // terkena = langsung sadar & mundur S.hpShow = 4; S.regenT = L.regenDelay;
  env.fx(new THREE.Vector3(root.position.x, root.position.y + 1.2, root.position.z), 0xff3030, 8, 5);
  if (S.hp <= 0) { S.down = true; S.downT = L.downT; S.atk = null; S.dg = null; cancelSkill(); S.speed = 0; S.moving = false; env.toast(LYRA.icon + ' ' + LYRA.name + ': ' + LYRA_TALK.tumbang + ' (bangkit dalam ' + L.downT + ' dtk)', 2600); }
  drawHp(); return true;
}
function reviveLyra() {
  S.down = false; S.hp = Math.round(LYRA.life.max * LYRA.life.reviveFrac); S.inv = 1.5; S.hpShow = 3; S.regenT = LYRA.life.regenDelay; S.hpKey = ''; drawHp();
  env.fx(new THREE.Vector3(root.position.x, root.position.y + 1, root.position.z), 0xffd0e0, 16, 5);
  env.toast(LYRA.icon + ' ' + LYRA.name + ': “' + LYRA_TALK.bangkit + '”', 2400);
}
function applyLie(dt, target) {   // terbaring saat tumbang, bangkit saat pulih
  S.lie += (target - S.lie) * Math.min(1, dt * 6); if (Math.abs(S.lie - target) < 0.002) S.lie = target;
  vrm.scene.rotation.x = -1.5 * S.lie; vrm.scene.position.y += 0.18 * S.lie;
}

// ---------- belati (dibuat dari bentuk dasar, dipasang di tangan kanan) ----------
// Sumbu lokal tangan (pose-T): genggaman memanjang searah Z, bilah mengarah ke +Z (depan) dari sisi ibu jari.
function makeDagger() {
  const g = new THREE.Group(); g.name = 'lyra-dagger';
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: 0.9, roughness: 0.22 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2b1b2e, roughness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc19a3c, metalness: 0.8, roughness: 0.35 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.frustumCulled = false; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.0125, 0.0125, 0.115, 10).rotateX(Math.PI / 2), grip, 0, 0, 0);           // gagang
  add(new THREE.SphereGeometry(0.019, 10, 8), gold, 0, 0, -0.062);                                          // pangkal gagang
  add(new THREE.BoxGeometry(0.014, 0.062, 0.014), gold, 0, 0, 0.064);                                       // pelindung
  add(new THREE.CylinderGeometry(0.002, 0.017, 0.26, 4).rotateX(Math.PI / 2).scale(0.28, 1, 1), steel, 0, 0, 0.2);   // bilah (ujung ke +Z)
  return g;
}

// Model pedang pendek: "Short Sword" oleh gracehuynh (Sketchfab, CC-BY-4.0 — https://sketchfab.com/3d-models/short-sword-acf9a1521b7f4695bc6f6ae0755ce82d). Wajib mencantumkan kredit ini di game.
// Model aslinya tegak (ujung bilah ke +Y, pelindung melebar di X, tebal di Z). Ditata ke konvensi tangan: bilah ke +Z, pelindung di sumbu Y, sisi datar bilah menghadap +-X; pusat genggaman di titik asal.
let swordProto = null, swordTried = false;
function loadSword() {
  if (swordProto || swordTried) return; swordTried = true;
  new GLTFLoader().load(LYRA.weapon.file, gltf => {
    const m = gltf.scene; m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m), len = box.max.y - box.min.y; if (!(len > 0)) return;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.userData.keep = true; } });   // keep = geometri & material dipakai bersama (jangan di-dispose saat belati lemparan dibuang)
    m.position.set(-(box.min.x + box.max.x) / 2, -(box.min.y + len * LYRA.weapon.gripAt), -(box.min.z + box.max.z) / 2);
    const pivot = new THREE.Group(); pivot.add(m); pivot.scale.setScalar(LYRA.weapon.length / len);
    const w = new THREE.Group(); w.name = 'lyra-sword'; w.add(pivot);
    w.setRotationFromMatrix(new THREE.Matrix4().set(0, 0, 1, 0,  1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 0, 1));   // (x, y, z) model -> (z, x, y) tangan: Y(bilah) -> +Z, X(pelindung) -> Y, Z(tebal) -> X
    swordProto = w; swapWeapon();
  }, undefined, () => console.warn(LYRA.weapon.file + ' gagal dimuat — Lyra memakai belati bawaan'));
}
function makeWeapon() { return swordProto ? swordProto.clone(true) : makeDagger(); }
function swapWeapon() {   // pedang selesai dimuat setelah Lyra: ganti isi genggaman
  if (!B || !B.dagger) return;
  for (const c of [...B.dagger.children]) { B.dagger.remove(c); c.traverse(o => { if (o.userData.keep) return; if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  B.dagger.add(makeWeapon());
}

function load() {
  loadSword();
  if (vrm || loading || failed) return; loading = true;
  new GLTFLoader().register(p => new VRMLoaderPlugin(p)).load(LYRA.file, gltf => {
    const v = gltf.userData.vrm; if (!v) { failed = true; loading = false; console.warn(LYRA.file + ' bukan model VRM — Lyra tidak ditampilkan'); return; }
    VRMUtils.rotateVRM0(v);   // VRM 0.x dihadapkan ke +Z; VRM 1.0 (seperti lyra.vrm) sudah menghadap +Z
    v.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const h = v.humanoid, b = n => h.getNormalizedBoneNode(n);
    B = { hips: b('hips'), spine: b('spine'), chest: b('chest'), neck: b('neck'), head: b('head'), lUA: b('leftUpperArm'), rUA: b('rightUpperArm'), lLA: b('leftLowerArm'), rLA: b('rightLowerArm'),
      lUL: b('leftUpperLeg'), rUL: b('rightUpperLeg'), lLL: b('leftLowerLeg'), rLL: b('rightLowerLeg'), lH: b('leftHand'), rH: b('rightHand') };
    // genggam belati: jari tangan kanan menekuk, belati dipasang di tulang tangan kanan
    if (B.rH) {
      v.scene.updateMatrixWorld(true);
      const hp = v.scene.worldToLocal(B.rH.getWorldPosition(new THREE.Vector3())), sx = Math.sign(hp.x) || -1;   // sisi kanan model = -X pada VRM menghadap +Z
      B.fing = { sx, list: ['Index', 'Middle', 'Ring', 'Little'].map(f => [b('right' + f + 'Proximal'), b('right' + f + 'Intermediate'), b('right' + f + 'Distal')]), thumb: b('rightThumbProximal') };   // jari menggenggam hanya saat belati dihunus (lihat animate)
      const dg = new THREE.Group(); dg.name = 'lyra-weapon'; dg.add(makeWeapon()); dg.position.set(sx * 0.068, -0.022, 0.0);   // isi diganti pedang saat model selesai dimuat (swapWeapon)
      const hold = new THREE.Group(); hold.name = 'lyra-dagger-holder'; hold.visible = false; hold.add(dg); B.rH.add(hold); B.dagger = dg; B.holder = hold;   // holder = disembunyikan saat tidak bertarung; dg.visible dipakai skill Belati Kilat (belati terlempar)
    }
    if (v.expressionManager) console.info('[Lyra] ekspresi VRM:', Object.keys(v.expressionManager.expressionMap || {}).join(', '));   // untuk memeriksa nama ekspresi mulut bila ada yang tidak bereaksi
    vrm = v; root.add(v.scene); loading = false;
    if (!tag) { tag = makeTag(); root.add(tag); } tag.visible = S.mode === 'guild';
    if (!hpBar) { hpBar = makeHpBar(); root.add(hpBar); }
  }, undefined, () => { failed = true; loading = false; console.warn(LYRA.file + ' gagal dimuat — Lyra tidak ditampilkan'); });
}

function attachGuild() {   // Lyra menunggu di Balai Petualang
  root.removeFromParent(); S.atk = null; cancelSkill(); resetLife(); S.mode = 'guild';
  if (tag) tag.visible = true;
  if (!guildGroup) { root.visible = false; return; }
  guildGroup.add(root); root.position.set(LYRA.home.x, 0, LYRA.home.z); root.rotation.y = LYRA.home.rot; root.visible = true;
}
function attachWait() {   // Lyra menunggu di tempat ia ditinggalkan (tampil hanya bila pemain berada di konteks lokasi yang sama)
  root.removeFromParent(); S.mode = 'wait'; S.ctx = ''; S.atk = null; cancelSkill(); resetLife(); if (tag) tag.visible = false;
  if (env) env.scene.add(root);
  if (waitAt) { root.position.set(waitAt.x, waitAt.y, waitAt.z); root.rotation.y = waitAt.rot; }
  root.visible = false;
}
function waitTick(dt) {
  if (!env || !waitAt) return;
  const st = env.state(), show = (st === 'world' || st === 'play' || st === 'lose') && env.ctx() === waitAt.ctx;
  root.visible = show; if (!show) return;
  S.t += dt; S.speed = 0; S.moving = false;
  const pp = env.playerPos(), d = Math.hypot(pp.x - root.position.x, pp.z - root.position.z);
  if (d < 8) root.rotation.y += wrap(Math.atan2(pp.x - root.position.x, pp.z - root.position.z) - root.rotation.y) * Math.min(1, dt * 4);   // menoleh ke pemain bila dekat
  animate(dt, 0, 0); vrm.update(dt);
}
function attachParty() {   // Lyra ikut pemain (anak langsung scene; posisi = koordinat dunia)
  root.removeFromParent(); S.mode = 'party'; S.ctx = ''; S.atk = null; cancelSkill(); resetLife(); if (tag) tag.visible = false;
  if (env) env.scene.add(root); root.visible = false;
}

// ---------- pose (tulang VRM ternormalisasi; lengan diturunkan dari pose-T) ----------
// Tiap pose lengan kanan: [UpperArm.x, UpperArm.y, UpperArm.z, LowerArm.y, putaran badan]
const ARM = {
  ready: [-0.45, 0.0, 1.0, 0.95, 0.0],     // siaga: belati di depan pinggang
  windA: [-0.25, -0.3, 0.85, 1.1, -0.5],   // tebas 1: tarik ke belakang-luar
  cutA:  [-1.35, 0.5, 0.45, 0.15, 0.55],   //          tebas ke depan-dalam
  windB: [-0.9, 0.5, 0.25, 0.9, 0.4],      // tebas 2 (balik): tarik ke dalam
  cutB:  [-0.5, -0.4, 1.0, 0.2, -0.5],     //          tebas ke luar
  windS: [-0.3, 0.0, 1.2, 1.5, -0.3],      // tusukan: tarik siku ke belakang
  stab:  [-1.45, 0.2, 0.35, 0.05, 0.2],    //          tusuk lurus ke depan
};
ARM.throwW = [-0.4, -0.5, 1.0, 1.4, -0.7];   // lempar belati: tarik ke belakang bahu
ARM.throwT = [-1.5, 0.1, 0.4, 0.05, 0.5];    //                 lengan terjulur ke depan
ARM.idle = [0.0, 0.0, 1.15, 0.2, 0.0];       // santai (belati disarungkan): lengan kanan turun alami di sisi badan, seperti lengan kiri
ARM.raise = [-2.35, 0.2, 0.3, 0.3, 0.0];     // kumpulkan petir: belati diangkat tinggi
const COMBO_KEYS = [['windA', 'cutA'], ['windB', 'cutB'], ['windS', 'stab']];
const cur = [0, 0, 0, 0, 0];   // pose lengan kanan yang sedang dituju (dihaluskan)

function pose(b, x, y, z, k) { if (!b) return; const r = b.rotation; r.x += (x - r.x) * k; r.y += (y - r.y) * k; r.z += (z - r.z) * k; }
function animate(dt, spd, headYaw) {
  const k = 1 - Math.exp(-dt * 12), t = S.t, A = spd;
  // belati: dihunus saat bertarung (menyerang / skill / menghindar bos), disarungkan lagi LYRA.dagger.sheathDelay detik setelah selesai
  const fighting = !!(S.atk || S.sk || S.dg); if (fighting) S.armT = LYRA.dagger.sheathDelay; else S.armT -= dt;
  const armed = (fighting || S.armT > 0) && !S.down && S.mode === 'party';
  S.drawn += ((armed ? 1 : 0) - S.drawn) * Math.min(1, dt * 14); S.grip += ((armed ? 1 : 0.12) - S.grip) * Math.min(1, dt * 10);
  if (B.holder) { B.holder.visible = S.drawn > 0.02; B.holder.scale.setScalar(Math.max(0.001, S.drawn)); }
  if (B.fing) { const F = B.fing, g = S.grip; for (const [p, i, d] of F.list) { if (p) p.rotation.z = -F.sx * 1.15 * g; if (i) i.rotation.z = -F.sx * 1.3 * g; if (d) d.rotation.z = -F.sx * 0.8 * g; } if (F.thumb) F.thumb.rotation.y = F.sx * 0.3 * g; }
  S.ph += dt * (4 + 6 * spd) * (spd > 0.02 ? 1 : 0.0);   // fase langkah hanya maju saat berjalan
  const s = Math.sin(S.ph), c = Math.cos(S.ph);
  const breath = Math.sin(t * 1.7) * 0.012;
  // pose lengan kanan (belati)
  const a = S.atk; let target = armed ? ARM.ready : ARM.idle, lean = 0, guard = 0;
  const sk = S.sk;
  if (sk && sk.kind === 'blade') { guard = 1; target = sk.ph === 'wind' ? ARM.throwW : (sk.ph === 'throw' || sk.ph === 'blink') ? ARM.throwT : sk.ph === 'charge' ? ARM.raise : ARM.ready; lean = sk.ph === 'wind' ? 0.2 : sk.ph === 'throw' ? 0.35 : sk.ph === 'charge' ? -0.08 : 0.15; }
  else if (sk) { guard = 1; target = sk.ph === 'rec' ? ARM.ready : sk.ph === 'dash' ? ARM.stab : ARM.windS; lean = sk.ph === 'dash' ? 0.5 : sk.ph === 'rec' ? 0.15 : 0.3; }   // skill: membungkuk, tusukan lurus saat menerjang
  else if (a) {
    guard = 1;
    if (a.phase === 'dash') lean = 0.3;
    else if (a.phase === 'gap') lean = 0.2;
    else { const pair = COMBO_KEYS[a.hit % COMBO_KEYS.length]; target = ARM[a.u < 0.4 ? pair[0] : pair[1]]; lean = 0.12; }
  } else if (S.dg) lean = 0.28;   // mundur menghindar: badan condong
  const walkSwing = (a || sk) ? 0 : A * (armed ? 1 : 1.4);   // saat menyerang lengan kanan tidak mengayun
  for (let i = 0; i < 5; i++) cur[i] += (target[i] - cur[i]) * k;
  const tw = cur[4];
  pose(B.lUL, -s * 0.62 * A, 0, 0, k); pose(B.rUL, s * 0.62 * A, 0, 0, k);
  pose(B.lLL, (0.04 + 0.8 * Math.max(0, c)) * A, 0, 0, k); pose(B.rLL, (0.04 + 0.8 * Math.max(0, -c)) * A, 0, 0, k);
  // lengan kiri: mengayun biasa, mengangkat sedikit sebagai penjaga saat menyerang
  pose(B.lUA, s * 0.5 * A - 0.4 * guard, 0, -1.15 + breath * 2 + 0.3 * guard, k);
  pose(B.lLA, 0, -0.2 - 0.3 * A - 0.6 * guard, 0, k);
  // lengan kanan: siaga + ayunan kecil, atau pose serangan
  b3(cur, s, walkSwing, breath);
  pose(B.hips, 0, s * 0.1 * A + tw * 0.3, 0, k); pose(B.spine, 0.04 * A + breath + lean + 0.25 * S.flinch, -s * 0.08 * A + tw * 0.7, 0, k); pose(B.chest, breath * 1.5, 0, 0, k);
  pose(B.neck, 0, headYaw * 0.4 - tw * 0.2, 0, k); pose(B.head, 0.02 * Math.sin(t * 0.8) + 0.03 * S.spk * Math.sin(t * 6.5), headYaw * 0.5 - tw * 0.2, 0, k);
  vrm.scene.position.y = Math.abs(c) * 0.035 * A;   // hentakan naik-turun kecil saat berjalan
  const em = vrm.expressionManager;
  if (em) {
    S.blinkT -= dt; if (S.blinkT <= 0) { S.blink = 1; S.blinkT = rnd(2.5, 5.5); }
    if (S.blink > 0) { S.blink = Math.max(0, S.blink - dt * 7); em.setValue('blink', Math.sin(S.blink * Math.PI)); } else em.setValue('blink', 0);
    em.setValue('happy', S.atk ? 0 : LYRA.face.happy * (S.mode === 'party' ? 1 : 0.5));   // ekspresi 'happy' VRoid biasanya ikut membuka mulut -> bawaan 0 supaya mulut menutup rapat saat diam
    // mulut: vokal a/i/u/e/o -> bentuk mulut aa/ih/ou/ee/oh (huruf lain = setengah terbuka, spasi & tanda baca = menutup), berjalan sepanjang teks yang sedang diucapkan
    const M = LYRA.mouth, tg = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }; let sp = 0;
    if (S.say) {
      S.say.t += dt; const i = Math.floor(S.say.t * M.cps);
      if (i >= S.say.text.length) S.say = null;
      else {
        const ch = S.say.text[i].toLowerCase(), v = VOWEL[ch]; sp = 1;
        if (v) { S.say.last = v; tg[v] = M.open * (0.75 + 0.25 * Math.sin(S.say.t * 23)); }
        else if (ch === 'm' || ch === 'b' || ch === 'p') { /* bibir menutup: semua bentuk 0 */ }
        else if (ch === 'f' || ch === 'v') tg[S.say.last] = M.open * 0.1;
        else if (ch >= 'a' && ch <= 'z') tg[S.say.last] = M.open * 0.25;
      }
    }
    S.spk += (sp - S.spk) * Math.min(1, dt * 8);
    for (const key in tg) { S.vis[key] += (tg[key] - S.vis[key]) * Math.min(1, dt * (tg[key] < S.vis[key] ? M.closeRate : M.openRate)); em.setValue(key, S.vis[key]); }   // menutup lebih cepat daripada membuka supaya mingkem terlihat
  }
}
function b3(p, s, swing, breath) {   // terapkan pose lengan kanan (sudah dihaluskan di `cur`, jadi k = 1)
  pose(B.rUA, p[0] - s * 0.35 * swing, p[1], p[2] - breath * 2, 1);
  pose(B.rLA, 0, p[3] + 0.2 * swing, 0, 1);
}

const VOWEL = { a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh' };
const _v = new THREE.Vector3();
function guildIdle(dt) {   // Lyra menunggu di guild: menoleh ke pemain bila dekat
  S.t += dt;
  let yaw = LYRA.home.rot, head = 0;
  if (env) {
    root.getWorldPosition(_v); const pp = env.playerPos(), d = Math.hypot(pp.x - _v.x, pp.z - _v.z);
    if (d < 8) { yaw = Math.atan2(pp.x - _v.x, pp.z - _v.z); }
  }
  root.rotation.y += wrap(yaw - root.rotation.y) * Math.min(1, dt * 4);
  animate(dt, 0, head);
}

// titik di SAMPING pemain (side: + = kanan pemain), sedikit ke belakang (back)
function sidePoint(pp, y) {
  const f = S.fa;
  return { x: pp.x - Math.cos(f) * LYRA.side - Math.sin(f) * LYRA.back, y, z: pp.z + Math.sin(f) * LYRA.side - Math.cos(f) * LYRA.back };
}

function warp(pp, y, ctx) {   // muncul di samping pemain (setelah pindah tempat / terlalu jauh)
  S.fa = env.face(); S.lastY = y;
  const p = sidePoint(pp, y);
  root.position.set(p.x, p.y, p.z); root.rotation.y = env.face();
  S.ctx = ctx; S.moving = false; S.speed = 0; S.atk = null; S.dg = null; S.dgSeen = false; S.cd = 1; cancelSkill();
}

function pickTarget(pp, skip) {   // musuh (dalam jangkauan pemain) terdekat dengan LYRA; `skip` = musuh yang baru diserang, dihindari bila ada musuh lain (supaya ia berpencar)
  const A = LYRA.attack; let best = null, bd = 1e9;
  for (const e of env.enemies()) {
    if (!e || e.dying || e.kaelen || !(e.hp > 0) || !e.g) continue;
    if (e === skip) continue;
    const dp = Math.hypot(e.g.position.x - pp.x, e.g.position.z - pp.z); if (dp > A.range) continue;
    const dl = Math.hypot(e.g.position.x - root.position.x, e.g.position.z - root.position.z);
    if (dl < bd) { bd = dl; best = e; }
  }
  return best || (skip && targetOk(skip, pp) ? skip : null);
}
function targetOk(e, pp) {
  return !!e && !!e.g && !e.dying && e.hp > 0 && env.enemies().includes(e) && Math.hypot(e.g.position.x - pp.x, e.g.position.z - pp.z) < LYRA.attack.range + 4;
}

function slash(e) {   // saat bilah mengenai: kerusakan + percikan
  const A = LYRA.attack, a = S.atk;
  const dir = new THREE.Vector3(e.g.position.x - root.position.x, 0, e.g.position.z - root.position.z); if (dir.lengthSq() > 1e-6) dir.normalize(); else dir.set(0, 0, 1);
  const crit = Math.random() < A.crit;
  let dmg = rnd(A.dmgMin, A.dmgMax); if (a.hit === A.combo - 1) dmg *= A.finisher; if (crit) dmg *= A.critMul;
  env.hit(e, Math.round(dmg), dir, A.force);
  env.fx(new THREE.Vector3(e.g.position.x, e.g.position.y + (e.r > 1.5 ? 1.5 : 1.1), e.g.position.z), crit ? 0xffe070 : A.color, crit ? 16 : 8, crit ? 6 : 4);
}

// ---------- clone bayangan: salinan model Lyra (geometri & material dibagi) yang menyalin pose Lyra tiap frame ----------
const clones = [];
function makeClone() {
  const sc = SkeletonUtils.clone(vrm.scene), g = new THREE.Group(), src = [], dst = [];
  const walk = (o, a) => { a.push(o); for (const c of o.children) walk(c, a); };
  walk(vrm.scene, src); walk(sc, dst);
  g.add(sc); g.visible = false; env.scene.add(g);
  return { g, src, dst };
}
function ensureClones(n) { while (clones.length < n) clones.push(makeClone()); }
function syncClones() {
  for (const cl of clones) {
    if (!cl.g.visible) continue;
    for (let i = 0; i < cl.src.length; i++) {
      const a = cl.src[i], b = cl.dst[i];
      b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale);
      if (a.morphTargetInfluences && b.morphTargetInfluences) for (let j = 0; j < a.morphTargetInfluences.length; j++) b.morphTargetInfluences[j] = a.morphTargetInfluences[j];
    }
  }
}
function showClone(cl, show) {   // muncul / lenyap dengan kepulan cahaya
  if (cl.g.visible === show) return;
  if (show) { cl.g.visible = true; cl.g.scale.setScalar(0.05); addFx(0.25, k => cl.g.scale.setScalar(0.05 + 0.95 * k), () => cl.g.scale.setScalar(1)); }
  else addFx(0.2, k => cl.g.scale.setScalar(1 - 0.95 * k), () => { cl.g.visible = false; cl.g.scale.setScalar(1); });
  flash(new THREE.Vector3(cl.g.position.x, cl.g.position.y + 1, cl.g.position.z), LYRA.skill.color, 3.2, 0.35);
}

// ---------- skill: Tarian Bayangan ----------
// S.sk = { ph: 'charge' | 'wind' | 'dash' | 'rec', t, round, windT, dashT, runners: [Lyra, clone, ...] }
// runner = { g (root / grup clone), cl, mul (pewarisan atribut), e (target), last, S, dir, L, dur, hit, active }
const _sv = new THREE.Vector3();
function cancelSkill() {
  if (!S.sk) return;
  const sk = S.sk; S.sk = null;
  if (sk.kind === 'blade') { disposeProj(sk); removeWarn(sk); if (B && B.dagger) B.dagger.visible = true; S.bkCd = LYRA.blade.cd; }
  else { for (const cl of clones) if (cl.g.visible) showClone(cl, false); S.skCd = LYRA.skill.cd; }
}
function startSkill(pp) {
  const K = LYRA.skill;
  S.atk = null; S.speed *= 0.3; S.moving = false;
  S.sk = { ph: 'charge', t: 0, round: 0, windT: K.wind, dashT: 0.3, runners: [{ g: root, cl: null, mul: 1, e: null, last: null, S: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), L: 0, dur: 0.3, hit: new Set(), active: false }] };
  env.toast(LYRA.icon + ' ' + LYRA.name + ': “' + LYRA_TALK.skillCast + '”', 1800);
  flash(new THREE.Vector3(root.position.x, root.position.y + 0.9, root.position.z), K.color, 4, 0.5);
}
function endSkill() { const K = LYRA.skill; cancelSkill(); S.skCd = K.cd; S.bkCd = Math.max(S.bkCd, 2); S.cd = Math.max(S.cd, 0.5); }
function skillPick(pos, pp, used, last) {   // musuh terdekat dari `pos`; usahakan beda dengan runner lain & target sebelumnya
  const A = LYRA.attack; let best = null, bd = 1e9, pass;
  for (pass = 0; pass < 3 && !best; pass++) {
    for (const e of env.enemies()) {
      if (!e || e.dying || e.kaelen || !(e.hp > 0) || !e.g) continue;
      if (Math.hypot(e.g.position.x - pp.x, e.g.position.z - pp.z) > A.range + 4) continue;
      if (pass === 0 && (used.has(e) || e === last)) continue;
      if (pass === 1 && used.has(e)) continue;
      const d = Math.hypot(e.g.position.x - pos.x, e.g.position.z - pos.z); if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}
function skillRound(pp) {   // pilih target tiap runner, lalu aba-aba
  const K = LYRA.skill, sk = S.sk, used = new Set();
  for (const r of sk.runners) { r.e = skillPick(r.g.position, pp, used, r.last); r.active = !!r.e; if (r.e) used.add(r.e); }
  if (!sk.runners[0].active) { endSkill(); return; }   // tidak ada musuh lagi
  sk.ph = 'wind'; sk.t = 0; sk.windT = sk.round === 0 ? K.wind + 0.06 : K.wind;
}
function skillBeginDash() {
  const K = LYRA.skill, sk = S.sk; let maxDur = 0.2;
  for (const r of sk.runners) {
    if (!r.active) continue;
    if (!r.e || !r.e.g || r.e.dying || !(r.e.hp > 0)) { r.active = false; continue; }
    const S0 = r.S.set(r.g.position.x, 0, r.g.position.z), dir = r.dir.set(r.e.g.position.x - S0.x, 0, r.e.g.position.z - S0.z), dl = dir.length();
    if (dl < 1e-3) dir.set(Math.sin(r.g.rotation.y), 0, Math.cos(r.g.rotation.y)); else dir.divideScalar(dl);
    let L = Math.max(4, dl + r.e.r + K.over);
    if (env.dashLen) L = Math.max(0.5, env.dashLen(S0.x, S0.z, dir.x, dir.z, L));   // arena / dinding dungeon
    r.L = L; r.dur = Math.min(0.6, Math.max(0.22, L / K.speed)); r.hit.clear(); r.last = r.e; maxDur = Math.max(maxDur, r.dur);
    r.g.rotation.y = Math.atan2(dir.x, dir.z);
    const a = new THREE.Vector3(S0.x, 0, S0.z), b = new THREE.Vector3(S0.x + dir.x * L, 0, S0.z + dir.z * L);
    streak(a, b, K.color, K.core); flash(new THREE.Vector3(S0.x, r.g.position.y + 1, S0.z), K.core, 2.6, 0.25);
  }
  sk.ph = 'dash'; sk.t = 0; sk.dashT = maxDur;
}
function skillStab(r, o, dir, last) {   // satu tusukan; Lyra penuh, clone hanya `mul` (25%) dari damage & peluang critical
  const K = LYRA.skill, A = LYRA.attack;
  if (!o || !o.g || o.dying || !(o.hp > 0) || !env.enemies().includes(o)) return;
  const crit = Math.random() < A.crit * r.mul;
  let dmg = rnd(K.dmgMin, K.dmgMax) * r.mul; if (last) dmg *= K.finisher; if (crit) dmg *= A.critMul;
  env.hit(o, Math.max(1, Math.round(dmg)), dir.clone(), last ? K.force : 0);
  env.fx(new THREE.Vector3(o.g.position.x, o.g.position.y + (o.r > 1.5 ? 1.5 : 1.1), o.g.position.z), crit ? 0xffe070 : K.color, crit ? 14 : 7, crit ? 6 : 4);
}
function skillPierce(r, o) {   // musuh tertembus garis terjang: tusukan beruntun
  const K = LYRA.skill; r.hit.add(o);
  for (let k = 0; k < K.stabs; k++) { const last = k === K.stabs - 1, dir = r.dir.clone(); S.ev.push({ t: k * K.stabGap, fn: () => skillStab(r, o, dir, last) }); }
  flash(new THREE.Vector3(o.g.position.x, o.g.position.y + 1.1, o.g.position.z), K.core, 2.4 + o.r, 0.3);
}
function updateSkill(dt, pp, py) {
  const K = LYRA.skill, sk = S.sk, lr = sk.runners[0], gy = Math.min(1, dt * 10);
  sk.t += dt;
  for (const r of sk.runners) r.g.position.y += (py - r.g.position.y) * gy;
  if (sk.ph === 'charge') {
    S.speed += (0 - S.speed) * Math.min(1, dt * 10);
    if (sk.t >= K.charge) {   // clone muncul di kiri-kanan Lyra
      ensureClones(K.clone.count);
      const f = root.rotation.y, rx = -Math.cos(f), rz = Math.sin(f);   // vektor "kanan" Lyra
      for (let i = 0; i < K.clone.count; i++) {
        const cl = clones[i], side = (i % 2 ? -1 : 1) * (1.3 + Math.floor(i / 2) * 1.2);
        cl.g.position.set(root.position.x + rx * side, py, root.position.z + rz * side); cl.g.rotation.y = f; showClone(cl, true);
        sk.runners.push({ g: cl.g, cl, mul: K.clone.inherit, e: null, last: null, S: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), L: 0, dur: 0.3, hit: new Set(), active: false });
      }
      skillRound(pp);
    }
  } else if (sk.ph === 'wind') {
    S.speed += (0 - S.speed) * Math.min(1, dt * 10);
    for (const r of sk.runners) if (r.active && r.e && r.e.g) { const h = Math.atan2(r.e.g.position.x - r.g.position.x, r.e.g.position.z - r.g.position.z); r.g.rotation.y += wrap(h - r.g.rotation.y) * Math.min(1, dt * 20); }
    if (sk.t >= sk.windT) skillBeginDash();
  } else if (sk.ph === 'dash') {
    S.speed = 12;
    for (const r of sk.runners) {
      if (!r.active) continue;
      const u = Math.min(1, sk.t / r.dur), s1 = r.L * (1 - Math.pow(1 - u, 2)), px = r.g.position.x, pz = r.g.position.z;
      const nx = r.S.x + r.dir.x * s1, nz = r.S.z + r.dir.z * s1;
      r.g.position.x = nx; r.g.position.z = nz;
      const dx = nx - px, dz = nz - pz, l2 = dx * dx + dz * dz;
      for (const o of env.enemies()) {   // diperiksa sepanjang ruas supaya tidak tembus karena terlalu cepat
        if (!o || o.dying || o.kaelen || !(o.hp > 0) || !o.g || r.hit.has(o)) continue;
        const t = l2 > 1e-6 ? clamp(((o.g.position.x - px) * dx + (o.g.position.z - pz) * dz) / l2, 0, 1) : 0;
        if (Math.hypot(o.g.position.x - (px + dx * t), o.g.position.z - (pz + dz * t)) < o.r + K.hitR) skillPierce(r, o);
      }
      if (Math.random() < 0.6) flash(new THREE.Vector3(nx, r.g.position.y + rnd(0.4, 1.5), nz), K.color, 1.1, 0.25);
    }
    if (sk.t >= sk.dashT) { sk.ph = 'rec'; sk.t = 0; }
  } else {   // rec: jeda singkat lalu terjang berikutnya (beruntun)
    S.speed += (0 - S.speed) * Math.min(1, dt * 8);
    if (sk.t >= K.rec) { sk.round++; if (sk.round >= K.rounds) { endSkill(); return null; } skillRound(pp); }
  }
  return lr.g.rotation.y;
}

// ---------- skill 2: Belati Kilat (lempar belati -> teleport ke belakang target -> sambaran petir pink) ----------
// S.sk = { kind: 'blade', ph: 'wind' | 'throw' | 'blink' | 'charge' | 'rec', t, e (target), sx/sz (posisi target terakhir), er (radius), u (arah Lyra -> target), proj (belati terbang), warn (lingkaran peringatan), imm }
const _up = new THREE.Vector3(0, 1, 0), _fw = new THREE.Vector3(0, 0, 1), _bv = new THREE.Vector3(), BOLT_UNIT = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
function bolt(x, z, color, core, H) {   // petir bergerigi dari langit ke (x, z): lapisan luar pink + inti putih-pink + beberapa cabang kecil
  const g = new THREE.Group(), mk = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), mp = mk(color), mc = mk(core);
  const seg = (a, b, w) => {
    const dir = b.clone().sub(a), len = dir.length(); if (len < 1e-3) return; dir.divideScalar(len);
    for (const [mat, k] of [[mp, 1], [mc, 0.38]]) { const m = new THREE.Mesh(BOLT_UNIT, mat); m.position.copy(a).addScaledVector(dir, len / 2); m.quaternion.setFromUnitVectors(_up, dir); m.scale.set(w * k, len, w * k); m.frustumCulled = false; m.renderOrder = 30; g.add(m); }
  };
  const n = 10, pts = [];
  for (let i = 0; i <= n; i++) { const k = i / n, j = i === n ? 0 : 1.2 * (1 - k * 0.6); pts.push(new THREE.Vector3(x + rnd(-j, j), H * (1 - k), z + rnd(-j, j))); }
  for (let i = 0; i < n; i++) seg(pts[i], pts[i + 1], 0.28);
  for (let f = 0; f < 3; f++) { let a = pts[2 + Math.floor(Math.random() * 6)].clone(); const ang = rnd(0, 6.28); for (let i = 0; i < 3; i++) { const b = a.clone().add(new THREE.Vector3(Math.cos(ang) * rnd(0.8, 1.6), -rnd(1.2, 2.4), Math.sin(ang) * rnd(0.8, 1.6))); if (b.y < 0.1) b.y = 0.1; seg(a, b, 0.14); a = b; } }
  env.scene.add(g);
  addFx(0.5, k => { const f = (1 - k) * (0.75 + 0.25 * Math.sin(k * 70)); mp.opacity = 0.85 * f; mc.opacity = f; }, () => { g.removeFromParent(); mp.dispose(); mc.dispose(); });
}
function groundRing(x, z, r, color, life) {   // cincin kejut di lantai: membesar lalu memudar
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, S.lastY + 0.08, z); m.renderOrder = 28; env.scene.add(m);
  addFx(life, k => { m.scale.setScalar(Math.max(0.05, r * (0.3 + 0.9 * k))); mat.opacity = 0.9 * (1 - k); }, () => { m.removeFromParent(); m.geometry.dispose(); mat.dispose(); });
}
function makeWarn(sk, color, r) {   // lingkaran peringatan pink di bawah target selama mengumpulkan petir (lingkaran dalam membesar = hitung mundur)
  const mk = o => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), mk(0.7)), disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mk(0.25));
  for (const m of [ring, disc]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 27; m.frustumCulled = false; env.scene.add(m); }
  ring.scale.setScalar(r); sk.warn = { ring, disc };
}
function removeWarn(sk) { const w = sk.warn; if (!w) return; for (const m of [w.ring, w.disc]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } sk.warn = null; }
function disposeProj(sk) {
  const p = sk.proj; if (!p) return; p.removeFromParent();
  p.traverse(o => { if (o.userData.keep) return; if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });   // bagian pedang berbagi geometri/material dengan yang di tangan: jangan dibuang
  sk.proj = null;
}
function bladePick(pp) {   // target lemparan: musuh ber-HP terbanyak (bos diutamakan) dalam jangkauan pemain & dalam jarak lempar dari Lyra
  const A = LYRA.attack, K = LYRA.blade; let best = null, bh = -1;
  for (const e of env.enemies()) {
    if (!e || e.dying || e.kaelen || !(e.hp > 0) || !e.g) continue;
    if (Math.hypot(e.g.position.x - pp.x, e.g.position.z - pp.z) > A.range) continue;
    const d = Math.hypot(e.g.position.x - root.position.x, e.g.position.z - root.position.z); if (d < K.minDist || d > K.range) continue;
    const w = e.hp + (e.boss ? 1e6 : 0); if (w > bh) { bh = w; best = e; }
  }
  return best;
}
function startBlade(e) {
  const K = LYRA.blade;
  S.atk = null; S.speed *= 0.3; S.moving = false;
  S.sk = { kind: 'blade', ph: 'wind', t: 0, e, sx: e.g.position.x, sz: e.g.position.z, er: e.r || 1, u: null, proj: null, warn: null, imm: K.invuln };
  env.toast(LYRA.icon + ' ' + LYRA.name + ': “' + LYRA_TALK.bladeCast + '”', 1800);
  flash(new THREE.Vector3(root.position.x, root.position.y + 0.9, root.position.z), K.color, 3, 0.4);
}
function endBlade() { const K = LYRA.blade; cancelSkill(); S.bkCd = K.cd; S.skCd = Math.max(S.skCd, 2); S.cd = Math.max(S.cd, 0.5); }
function throwDagger(sk) {   // belati terlepas dari tangan kanan: terbang lurus ke dada target sambil berputar
  const K = LYRA.blade, hp = new THREE.Vector3();
  if (B && B.rH) B.rH.getWorldPosition(hp); else hp.set(root.position.x, root.position.y + 1.1, root.position.z);
  const g = new THREE.Group(), d = makeWeapon(); d.scale.setScalar(swordProto ? LYRA.weapon.throwScale : 1.8); g.add(d);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: K.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); glow.scale.set(1.1, 1.1, 1); glow.position.z = 0.2; g.add(glow);
  g.position.copy(hp); g.renderOrder = 29; env.scene.add(g); sk.proj = g;
  if (B && B.dagger) B.dagger.visible = false;
  flash(hp, K.core, 1.6, 0.25);
}
function daggerHit(sk, alive) {   // belati mengenai target: damage kecil, lalu Lyra langsung berteleport ke belakang target
  const K = LYRA.blade, e = sk.e, p = sk.proj, pos = p ? p.position.clone() : new THREE.Vector3(sk.sx, 1, sk.sz);
  const ux = sk.sx - root.position.x, uz = sk.sz - root.position.z, ul = Math.hypot(ux, uz) || 1; sk.u = { x: ux / ul, z: uz / ul };
  if (alive) env.hit(e, Math.max(1, Math.round(rnd(K.throwDmgMin, K.throwDmgMax))), new THREE.Vector3(sk.u.x, 0, sk.u.z), 2);
  env.fx(pos, K.color, 12, 6); flash(pos, K.core, 2.2, 0.3);
  disposeProj(sk);
  // teleport: muncul di belakang target (garis Lyra -> target diperpanjang); bila terhalang dinding / tepi arena, di depan target
  const off = sk.er + K.reach; let dest = null;
  for (const sg of [1, -1]) {
    let x = sk.sx + sk.u.x * off * sg, z = sk.sz + sk.u.z * off * sg;
    if (env.clamp) { const c = env.clamp(x, z); if (!c || Math.hypot(c.x - x, c.z - z) > 0.4) continue; x = c.x; z = c.z; }
    dest = { x, z }; break;
  }
  const from = { x: root.position.x, z: root.position.z };
  flash(new THREE.Vector3(from.x, root.position.y + 1, from.z), K.color, 3.4, 0.35); env.fx(new THREE.Vector3(from.x, root.position.y + 1, from.z), K.color, 10, 5);
  if (dest) { streak(from, dest, K.color, K.core); root.position.x = dest.x; root.position.z = dest.z; }
  root.rotation.y = Math.atan2(sk.sx - root.position.x, sk.sz - root.position.z);
  const ap = new THREE.Vector3(root.position.x, root.position.y + 1, root.position.z);
  flash(ap, K.core, 3.6, 0.35); env.fx(ap, K.color, 14, 6);
  if (B && B.dagger) B.dagger.visible = true;   // belati kembali ke tangannya
  if (K.sfx) { if (env.sfx && K.sfx.teleport) env.sfx(K.sfx.teleport, K.sfx.tVol); if (env.shake) env.shake(K.sfx.tShake); }   // suara teleport = suara terjang Dash Petir Louis
  sk.ph = 'blink'; sk.t = 0;
}
function boltStrike(sk) {   // petir pink menyambar titik target; semua musuh dalam radius terkena (target utama damage penuh, lainnya × splash)
  const K = LYRA.blade, A = LYRA.attack, x = sk.sx, z = sk.sz, pos = new THREE.Vector3(x, 0.4, z);
  bolt(x, z, K.color, K.core, K.height); groundRing(x, z, K.rad, K.color, 0.5); groundRing(x, z, K.rad * 0.55, K.core, 0.35);
  flash(new THREE.Vector3(x, 1.2, z), K.core, K.rad * 2.4, 0.45); flash(new THREE.Vector3(x, 6, z), K.color, 5, 0.3);
  env.fx(pos, K.color, 30, 9); env.fx(pos, K.core, 16, 12);
  if (K.sfx) { if (env.sfx && K.sfx.strike) env.sfx(K.sfx.strike, K.sfx.sVol); if (env.shake) env.shake(K.sfx.sShake); }   // suara & guncangan sambaran = sambaran petir Louis
  for (const o of [...env.enemies()]) {
    if (!o || o.dying || o.kaelen || !(o.hp > 0) || !o.g) continue;
    const dx = o.g.position.x - x, dz = o.g.position.z - z; if (Math.hypot(dx, dz) > K.rad + (o.r || 1)) continue;
    const main = o === sk.e, crit = Math.random() < A.crit;
    let dmg = rnd(K.dmgMin, K.dmgMax) * (main ? 1 : K.splash); if (crit) dmg *= A.critMul;
    const dir = new THREE.Vector3(dx, 0, dz); if (dir.lengthSq() > 1e-6) dir.normalize(); else dir.set(0, 0, 1);
    env.hit(o, Math.max(1, Math.round(dmg)), dir, main ? K.force : K.force * 0.5);
    env.fx(new THREE.Vector3(o.g.position.x, o.g.position.y + (o.r > 1.5 ? 1.5 : 1.1), o.g.position.z), crit ? 0xffe070 : K.color, crit ? 16 : 9, crit ? 6 : 4);
  }
}
function updateBlade(dt, pp, py) {
  const K = LYRA.blade, sk = S.sk, e = sk.e; sk.t += dt;
  root.position.y += (py - root.position.y) * Math.min(1, dt * 10);
  S.speed += (0 - S.speed) * Math.min(1, dt * 10);
  const alive = !!e && !!e.g && !e.dying && e.hp > 0 && env.enemies().includes(e);
  if (alive) { sk.sx = e.g.position.x; sk.sz = e.g.position.z; sk.er = e.r || 1; }
  if (sk.ph === 'wind') {
    if (!alive) { endBlade(); return null; }
    if (sk.t >= K.wind) { sk.ph = 'throw'; sk.t = 0; throwDagger(sk); }
  } else if (sk.ph === 'throw') {
    const p = sk.proj; if (!p) { endBlade(); return null; }
    const ty = alive ? e.g.position.y + (sk.er > 1.5 ? 1.4 : 1.0) : p.position.y;
    _bv.set(sk.sx - p.position.x, ty - p.position.y, sk.sz - p.position.z); const dl = _bv.length(), m = K.speed * dt;
    if (dl <= m + 0.3 + sk.er * 0.4 || sk.t > 1.5) daggerHit(sk, alive);
    else {
      _bv.divideScalar(dl); p.position.addScaledVector(_bv, m); p.quaternion.setFromUnitVectors(_fw, _bv); p.children[0].rotation.z += dt * 28;
      if (Math.random() < 0.8) flash(p.position, K.color, 0.9, 0.25);
    }
  } else if (sk.ph === 'blink') {
    if (sk.t >= 0.12) { sk.ph = 'charge'; sk.t = 0; makeWarn(sk, K.color, K.rad); }
  } else if (sk.ph === 'charge') {
    const w = sk.warn, u = clamp(sk.t / K.charge, 0, 1);
    if (w) { for (const m of [w.ring, w.disc]) m.position.set(sk.sx, S.lastY + 0.07, sk.sz); w.disc.scale.setScalar(Math.max(0.01, K.rad * u)); w.ring.material.opacity = 0.4 + 0.3 * Math.sin(sk.t * (14 + 14 * u)); w.disc.material.opacity = 0.18 + 0.2 * u; }
    if (Math.random() < 0.5) flash(new THREE.Vector3(root.position.x, root.position.y + rnd(1.2, 2.2), root.position.z), K.color, 0.9, 0.25);
    if (sk.t >= K.charge) { removeWarn(sk); boltStrike(sk); sk.ph = 'rec'; sk.t = 0; }
  } else {   // rec
    if (sk.t >= K.rec) { endBlade(); return null; }
  }
  return Math.atan2(sk.sx - root.position.x, sk.sz - root.position.z);
}

// ---------- menghindari skill bos ----------
// zona dari game.js (env.dangers): { x, z, r, t } lingkaran (t = sisa detik sebelum mendarat) atau { seg: true, x, z, dx, dz, len, r, t } jalur lurus (garis bayangan, proyektil)
function inZone(q, x, z, pad) {
  if (q.seg) { const hl = q.len / 2, al = clamp((x - q.x) * q.dx + (z - q.z) * q.dz, -hl, hl); return Math.hypot(x - (q.x + q.dx * al), z - (q.z + q.dz * al)) < q.r + pad; }
  return Math.hypot(x - q.x, z - q.z) < q.r + pad;
}
function unsafeAt(x, z, zones, pad, look) { for (const q of zones) if (q.t <= look && inZone(q, x, z, pad)) return true; return false; }
function pickEscape(zones, pp) {   // titik terdekat yang aman (di dalam arena, di luar semua area bahaya), condong tetap dekat pemain
  const D = LYRA.dodge, ox = root.position.x, oz = root.position.z; let best = null, bs = 1e9, fb = null, fs = 1e9;
  for (const r of [3, 5, 7.5, 10]) for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + rnd(-0.1, 0.1); let x = ox + Math.sin(a) * r, z = oz + Math.cos(a) * r;
    if (env.clamp) { const c = env.clamp(x, z); if (!c || Math.hypot(c.x - x, c.z - z) > 0.3) continue; x = c.x; z = c.z; }
    const sc = r + 0.35 * Math.hypot(x - pp.x, z - pp.z);
    if (!unsafeAt(x, z, zones, D.pad, D.look + 0.6)) { if (sc < bs) { bs = sc; best = { x, z }; } }
    else { let m = 0; for (const q of zones) if (!q.seg) m = Math.max(m, q.r + D.pad - Math.hypot(x - q.x, z - q.z)); const s2 = m * 10 + sc; if (s2 < fs) { fs = s2; fb = { x, z }; } }
  }
  return best || fb;
}

function tickParty(dt) {
  const st = env.state(), show = st === 'world' || st === 'play' || st === 'lose';
  if (!show) { root.visible = false; S.ctx = ''; S.atk = null; cancelSkill(); return; }
  const pp = env.playerPos(), ctx = env.ctx();
  const fy = env.footY(), py = fy == null ? S.lastY : fy; S.lastY = py;
  S.fa += wrap(env.face() - S.fa) * Math.min(1, dt * 3);   // arah hadap pemain dihaluskan supaya posisi samping tidak bergetar
  if (!root.visible || ctx !== S.ctx || Math.hypot(root.position.x - pp.x, root.position.z - pp.z) > Math.max(14, LYRA.attack.range + 8)) warp(pp, py, ctx);   // terlalu jauh dari pemain: muncul lagi di samping
  root.visible = true;
  const alive = st !== 'lose', A = LYRA.attack, LF = LYRA.life;
  S.inv -= dt; S.flinch = Math.max(0, S.flinch - dt * 5); S.hpShow -= dt;
  if (S.down) {   // tumbang: terbaring di tempat, bangkit setelah downT
    S.downT -= dt; S.speed = 0; S.moving = false; root.position.y += (py - root.position.y) * Math.min(1, dt * 10);
    if (S.downT <= 0) reviveLyra();
    animate(dt, 0, 0); applyLie(dt, S.down ? 1 : 0); drawHp(); if (hpBar) hpBar.visible = true; return;
  }
  if (S.hp < LF.max) { S.regenT -= dt; if (S.regenT <= 0) { S.hp = Math.min(LF.max, S.hp + LF.regen * dt); drawHp(); } }
  if (hpBar) { hpBar.visible = LF.alwaysShow || S.hp < LF.max || S.hpShow > 0; drawHp(); }
  let faceTo = null;
  S.cd -= dt; S.healCd -= dt;
  const fightOk = alive && !env.noCombat();

  // --- menghindari skill bos: bila berdiri di area peringatan / jalur proyektil, mundur keluar ---
  const DG = LYRA.dodge, zones = (DG.enabled && fightOk && env.dangers) ? env.dangers() : null;
  if (S.dg && (!zones || S.sk)) S.dg = null;
  if (zones && zones.length) {
    if (!S.sk && !S.dg) {
      if (unsafeAt(root.position.x, root.position.z, zones, 0.2, DG.look)) {
        if (!S.dgSeen) { S.dgSeen = true; S.dgWait = rnd(DG.react[0], DG.react[1]); S.dgBlind = Math.random() > DG.chance; }
        S.dgWait -= dt;
        if (S.dgWait <= 0 && !S.dgBlind) {
          const p = pickEscape(zones, pp);
          if (p) { S.dg = { x: p.x, z: p.z, t: 1.8 }; S.atk = null; S.cd = Math.max(S.cd, DG.rest); S.moving = false; env.fx(new THREE.Vector3(root.position.x, root.position.y + 0.9, root.position.z), 0xffd9e4, 6, 3); }
        }
      } else S.dgSeen = false;
    }
  } else S.dgSeen = false;

  // --- pilih / lepaskan target ---
  if (S.atk && !fightOk) { S.atk = null; S.cd = Math.max(S.cd, 0.4); }
  else if (S.atk && !targetOk(S.atk.e, pp)) {   // target hilang/mati: langsung cari musuh lain, jangan kembali dulu
    const e = pickTarget(pp);
    if (e) { S.atk.e = e; S.atk.phase = 'dash'; S.atk.hit = 0; S.atk.u = 0; S.atk.dealt = false; }
    else { S.atk = null; S.cd = A.cd; }
  }
  if (!S.atk && !S.dg && fightOk && S.cd <= 0) {
    const e = pickTarget(pp);
    if (e) { S.atk = { e, phase: 'dash', hit: 0, u: 0, dealt: false }; env.fx(new THREE.Vector3(root.position.x, root.position.y + 1, root.position.z), A.color, 6, 3); }
  }

  // --- skill: Tarian Bayangan (terjang menembus beruntun + clone) ---
  S.skCd -= dt; S.bkCd -= dt;
  if (S.sk && !fightOk) cancelSkill();
  if (!S.sk && !S.dg && LYRA.skill.enabled && fightOk && S.skCd <= 0 && pickTarget(pp)) startSkill(pp);
  if (!S.sk && !S.dg && LYRA.blade.enabled && fightOk && S.bkCd <= 0) { const bt = bladePick(pp); if (bt) startBlade(bt); }

  if (S.sk) {
    faceTo = S.sk.kind === 'blade' ? updateBlade(dt, pp, py) : updateSkill(dt, pp, py);
  } else if (S.dg) {
    // --- mundur menghindari skill bos ---
    const g = S.dg, dx = g.x - root.position.x, dz = g.z - root.position.z, d = Math.hypot(dx, dz); g.t -= dt; S.moving = false;
    if (d > 0.3) {
      const m = Math.min(DG.speed * dt, d); root.position.x += dx / d * m; root.position.z += dz / d * m; faceTo = Math.atan2(dx, dz);
      S.speed += (DG.speed - S.speed) * Math.min(1, dt * 10);
    } else S.speed += (0 - S.speed) * Math.min(1, dt * 12);
    root.position.y += (py - root.position.y) * Math.min(1, dt * 10);
    if (d <= 0.3 || g.t <= 0) { S.dg = null; S.cd = Math.max(S.cd, DG.rest); }
  } else if (S.atk) {
    // --- menyerang: melesat ke musuh lalu kombo belati ---
    const a = S.atk, e = a.e, dx = e.g.position.x - root.position.x, dz = e.g.position.z - root.position.z, d = Math.hypot(dx, dz), reach = e.r + A.reach;
    faceTo = Math.atan2(dx, dz); S.moving = false;
    if (a.phase === 'combo' && d > reach + 1.2) { a.phase = 'dash'; a.u = 0; a.dealt = false; }
    if (a.phase === 'gap') {   // berpencar: pindah ke sisi/belakang musuh berikutnya, lalu serang lagi
      a.wait -= dt;
      const fx = e.g.position.x + Math.sin(a.ang) * (reach + 0.4), fz = e.g.position.z + Math.cos(a.ang) * (reach + 0.4), gx = fx - root.position.x, gz = fz - root.position.z, gd = Math.hypot(gx, gz);
      if (gd > 0.25) { const m = Math.min(A.dashSpeed * 0.7 * dt, gd); root.position.x += gx / gd * m; root.position.z += gz / gd * m; S.speed += (A.dashSpeed * 0.5 - S.speed) * Math.min(1, dt * 10); }
      else S.speed += (0 - S.speed) * Math.min(1, dt * 12);
      if (a.wait <= 0) { a.phase = 'dash'; a.hit = 0; a.u = 0; a.dealt = false; }
    }
    if (a.phase === 'dash') {
      if (d > reach) { const m = Math.min(A.dashSpeed * dt, d - reach); root.position.x += dx / d * m; root.position.z += dz / d * m; S.speed += (A.dashSpeed - S.speed) * Math.min(1, dt * 10); }
      else { a.phase = 'combo'; a.u = 0; a.dealt = false; }
    }
    if (a.phase === 'combo') {
      S.speed += (0 - S.speed) * Math.min(1, dt * 12);
      a.u += dt / A.swing;
      if (!a.dealt && a.u >= 0.45) { a.dealt = true; slash(e); }
      if (a.u >= 1) { a.hit++; a.u = 0; a.dealt = false; if (a.hit >= A.combo) {   // kombo selesai: tetap di medan, pilih musuh berikutnya & posisi mengitari (jauh dari pemain)
        const n = pickTarget(pp, e) || e; a.e = n; a.phase = 'gap'; a.wait = rnd(A.gapMin, A.gapMax);
        a.ang = Math.atan2(n.g.position.x - pp.x, n.g.position.z - pp.z) + (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.4);
      } }
    }
    root.position.y += (py - root.position.y) * Math.min(1, dt * 10);
  } else {
    // --- berjalan di samping pemain ---
    let tp = sidePoint(pp, py);
    if (zones && zones.length && unsafeAt(tp.x, tp.z, zones, 0.3, DG.look + 0.5)) tp = { x: root.position.x, y: tp.y, z: root.position.z };   // titik di samping pemain sedang jadi area bahaya: tunggu di tempat
    const dx = tp.x - root.position.x, dz = tp.z - root.position.z, dt2 = Math.hypot(dx, dz);
    if (alive) { if (!S.moving && dt2 > 0.55) S.moving = true; else if (S.moving && dt2 < 0.25) S.moving = false; } else S.moving = false;
    const v = S.moving ? clamp(dt2 * 5, 1.2, LYRA.maxSpeed) : 0;
    S.speed += (v - S.speed) * Math.min(1, dt * 8);
    if (S.speed > 0.15 && dt2 > 1e-4) { const m = Math.min(S.speed * dt, dt2); root.position.x += dx / dt2 * m; root.position.z += dz / dt2 * m; faceTo = Math.atan2(dx, dz); }
    root.position.y += (tp.y - root.position.y) * Math.min(1, dt * 10);
    // jangan menumpuk di badan pemain
    { const ox = root.position.x - pp.x, oz = root.position.z - pp.z, od = Math.hypot(ox, oz);
      if (od < 0.8) { const ang = od > 1e-4 ? Math.atan2(ox, oz) : S.fa + Math.PI / 2, pushK = (0.8 - od) * Math.min(1, dt * 6); root.position.x += Math.sin(ang) * pushK; root.position.z += Math.cos(ang) * pushK; } }
    // (opsional) pulihkan pemain
    if (LYRA.heal.enabled && fightOk && S.healCd <= 0 && env.hpFrac() > 0 && env.hpFrac() < LYRA.heal.below && env.heal(LYRA.heal.amount)) {
      S.healCd = LYRA.heal.cd; env.fx(new THREE.Vector3(pp.x, pp.y + 1.2, pp.z), 0x6dff9c, 18, 4); env.toast(LYRA.icon + ' ' + LYRA.name + ': “' + LYRA_TALK.heal + '”', 2600);
    }
  }

  // --- arah hadap & kepala ---
  let head = 0;
  const dpl = Math.hypot(pp.x - root.position.x, pp.z - root.position.z);
  if (S.talk && !S.atk && !S.sk && !S.dg && S.speed < 0.6) faceTo = Math.atan2(pp.x - root.position.x, pp.z - root.position.z);   // sedang diajak bicara: menghadap pemain
  else if (faceTo == null) faceTo = S.speed < 0.3 ? S.fa : null;   // diam di samping: menghadap ke arah yang sama dengan pemain (siaga ke depan)
  if (faceTo != null) root.rotation.y += wrap(faceTo - root.rotation.y) * Math.min(1, dt * 9);
  if (!S.atk && !S.sk && S.speed < 0.3 && dpl < 5) head = clamp(wrap(Math.atan2(pp.x - root.position.x, pp.z - root.position.z) - root.rotation.y), -0.9, 0.9) * 0.6;
  S.headYaw += (head - S.headYaw) * Math.min(1, dt * 6);
  animate(dt, clamp(S.speed / 5.5, 0, 1.1), S.headYaw); applyLie(dt, 0);
}

// ---------- antarmuka untuk game.js & kota-guild.js ----------
export const lyra = {
  get recruited() { return recruited; },
  get loaded() { return !!vrm; },
  bind(e) {   // dipanggil sekali oleh game.js: { sfx(key, vol), shake(v), scene, state(), ctx(), playerPos(), footY(), face(), enemies(), hit(e,dmg,dir,force), fx(pos,color,n,speed), toast(msg,ms), hpFrac(), heal(frac)->bool, noCombat() }
    env = e; if (recruited) { attachParty(); setTimeout(load, 2500); } else if (waitAt) { attachWait(); setTimeout(load, 2500); }   // sudah direkrut di sesi sebelumnya: muat model di latar & langsung ikut
  },
  placeInGuild(group) { guildGroup = group; load(); if (!recruited && !waitAt) attachGuild(); },   // (bila ia disuruh menunggu di tempat lain, ia tidak kembali ke guild)   // dipanggil kota-guild.js saat interior dibangun
  recruit() { if (recruited) return; recruited = true; waitAt = null; writeSave(true, null); load(); attachParty(); },
  dismiss() {   // keluar dari party: menunggu DI TEMPAT ia berdiri sekarang (kembali ke guild hanya bila posisinya tak diketahui)
    if (!recruited) return; recruited = false;
    waitAt = env && root.visible ? { x: root.position.x, y: root.position.y, z: root.position.z, rot: root.rotation.y, ctx: env.ctx() } : null;
    writeSave(false, waitAt); if (waitAt) attachWait(); else attachGuild();
  },
  get waiting() { return !recruited && S.mode === 'wait'; },
  get hp() { return S.hp; }, get maxHp() { return LYRA.life.max; }, get down() { return S.down; },
  get targetable() { return !!(recruited && env && vrm && S.mode === 'party' && root.visible && !S.down); },   // bisa dijadikan sasaran musuh? (direkrut, tampil, tidak tumbang)
  get pos() { return root.position; },   // posisi dunia Lyra (dipakai game.js agar musuh mengejarnya)
  onPlayerHurt(n) {   // dipanggil game.js tiap pemain benar-benar terkena serangan: bila Lyra di dekatnya, sebagian damage ikut mengenainya
    if (!recruited || !env || S.mode !== 'party' || !root.visible) return;
    const pp = env.playerPos(); if (Math.hypot(pp.x - root.position.x, pp.z - root.position.z) <= LYRA.life.shareRange) hurtLyra(n * LYRA.life.share);
  },
  hurtNear(x, z, reach, n) {   // dipanggil game.js saat serangan jarak dekat musuh mendarat di titik (x, z): Lyra terkena bila berada dalam jangkauan
    if (!recruited || !env || S.mode !== 'party' || !root.visible) return false;
    return Math.hypot(root.position.x - x, root.position.z - z) < reach && hurtLyra(n);
  },
  hurt(n) { return hurtLyra(n); },   // pukulan langsung (dipakai game.js saat bos sedang membidik Lyra sebagai pengganti pemain); true bila benar-benar terkena
  hurtArea(x, z, r, n) {   // skill bos (lingkaran) mendarat di (x, z) berjari-jari r: Lyra terkena bila di dalamnya
    if (!recruited || !env || S.mode !== 'party' || !root.visible) return false;
    return Math.hypot(root.position.x - x, root.position.z - z) < r + 0.3 && hurtLyra(n * LYRA.dodge.dmgMul);
  },
  hurtSeg(x, z, dx, dz, len, w, n) {   // skill bos berbentuk jalur lurus (pusat x,z; arah dx,dz; panjang len; setengah lebar w)
    if (!recruited || !env || S.mode !== 'party' || !root.visible) return false;
    return inZone({ seg: true, x, z, dx, dz, len, r: w }, root.position.x, root.position.z, 0.3) && hurtLyra(n * LYRA.dodge.dmgMul);
  },
  get talking() { return S.talk; },
  setTalk(v) { S.talk = !!v; if (!v) S.say = null; },
  say(text) { S.say = text ? { text: String(text), t: 0, last: 'aa' } : null; },   // game.js: teks yang sedang diucapkan (mulut bergerak sepanjang teks); null = diam   // game.js: true saat dialog Lyra terbuka (ia menghadap pemain & kamera menyorot wajahnya), false saat dialog ditutup
  headPos(out) {   // posisi dunia kepala Lyra (untuk kamera sorotan wajah); null bila belum dimuat / tidak tampil
    if (!vrm || !B || !B.head || !root.visible) return null;
    vrm.scene.updateMatrixWorld(true); return B.head.getWorldPosition(out);
  },
  near() { if (!vrm || !root.visible || !env || !((recruited && S.mode === 'party') || (!recruited && S.mode === 'wait'))) return false; const pp = env.playerPos(); return Math.hypot(pp.x - root.position.x, pp.z - root.position.z) < LYRA.talkRange; },
  tick(dt) {
    if (!vrm || !(dt > 0)) return;
    if (!recruited && S.mode === 'wait') { waitTick(dt); return; }
    if (!recruited) { if (root.visible && guildGroup && guildGroup.visible) { guildIdle(dt); vrm.update(dt); } return; }
    if (!env) return;
    S.t += dt; tickFx(dt); tickEv(dt); tickParty(dt); if (root.visible) vrm.update(dt); syncClones();
  },
};
