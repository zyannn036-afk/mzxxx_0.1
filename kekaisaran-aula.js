import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { toWorld, toLocal } from './kekaisaran-layout.js';
import { FLOOR_Y, AULA_RECTS, AULA_BRIDGES, AULA_CIRCLES, DAIS, THRONE, COLS, WINDOWS_X, KNIGHT_X, KNIGHT_Z, BRAZIER, CHANDELIERS, SIDE_DOOR, ROOM_X, DEWAN, PERPUS, F2, F2_ROOMS, F2_DOOR, F2_RECTS, F2_BRIDGES, F2_WALLS, F2_CIRCLES, stairH, DAPUR, KAMAR, KAMAR_RECT, KAMAR_FURN, KAMAR_CIRCLES, KAMAR_SPAWN, roomDoorAt, inKamarExit, PRAJURIT, PRAJURIT_MODELS } from './kekaisaran-istana-layout.js';

// ============================================================
//  ISTANA KEKAISARAN — INTERIOR LANTAI 1: AULA RAJA
//  Dibangun di dalam badan istana (lihat kekaisaran-istana-layout.js). Semua mesh hidup di grup yang TERSEMBUNYI sampai pemain masuk
//  (tidak ada biaya render dari luar). Pencahayaan (default, ringan untuk Android): TANPA lampu titik. world.js mengubah cahaya langit jadi hangat
//  & meredupkan matahari saat pemain di dalam (lihat `dim`), lalu bercak cahaya hangat (glow) di lantai meniru sinar lampu gantung / perapian / takhta.
//  Nyala api, lilin & jendela memakai bahan tanpa bayangan (MeshBasicMaterial).
//  Saklar USE_POINT_LIGHTS = true menambah 3 lampu titik sungguhan (lebih berdimensi, tetapi SEMUA bahan dunia luar ikut menghitung 3 lampu
//  tambahan -> lebih berat di HP). Jika dinyalakan, coba dulu di perangkat target.
//
//  Ruangan: Serambi Agung, Aula Raja, Ruang Dewan (kiri) & Perpustakaan Kerajaan (kanan, lewat pintu lengkung di dinding samping aula).
//  API: { group, show(v), ready, update(t), collide(pos, r), groundY(x, z, y), area(x, z, y), clipCam(from, to), inRoom(), doorAt(x, z, y), roomExit(x, z), enterRoom(id), leaveRoom() }
//  collide / clipCam mengubah vektor yang diberikan (dunia); groundY mengembalikan tinggi lantai (dunia).
// ============================================================
const PI = Math.PI;
// ---- pengaturan cahaya (ubah di sini bila terlalu terang / gelap) ----
const USE_POINT_LIGHTS = false;
const LIGHT = { chand: 210, throne: 70, dist: 30, color: 0xffd7a0 };
// Ratu (ratuu.vrm, VRoid VRM 1.0, ber-tulang humanoid J_Bip_*, tinggi ±1,7 m; satuan meter -> skala 1; hadap +z, kiri = +x). Dimuat saat pertama kali pemain masuk aula, lalu diberi pose duduk lewat kode (aim / rotW). Tulang digerakkan langsung (tanpa vrm.update) sehingga pose statis.
// hipX / hipY = posisi sendi pinggul ratu relatif singgasana (x searah punggung singgasana, y dari lantai panggung); glow = kecerahan sendiri agar tidak gelap di dalam aula (0 = mati).
// Pencahayaan ratu (bahan MToon): glow = kecerahan sendiri (hangat, dikali tint); shadeWarm = seberapa hangat/terang sisi gelap toon (0..1); rim = cahaya tepi hangat dari lampu singgasana (rimPower makin besar = tepi makin tipis; rim: 0x000000 = mati);
// shadow = kegelapan bayangan palsu di singgasana (0 = tanpa bayangan, 1 = normal, 1,5 = lebih pekat).
const QUEEN = { file: 'ratuu.vrm', hipX: 0.27, hipY: 0.97 + 0.095, glow: 0.22, tint: 0xffe2b8, shadeWarm: 0.25, rim: 0xffbf70, rimPower: 3.5, shadow: 1 };

// Putri Isabel (isabel.vrm, VRoid VRM 1.0, kerangka J_Bip_* sama dengan ratu): berdiri di panggung, di sebelah singgasana ratu. Dimuat bersama ratu saat pemain pertama kali masuk aula; pose berdiri dibuat lewat kode.
// dx / z = posisi kaki relatif singgasana (dx searah punggung singgasana; z negatif = sisi kanan ratu, sisi yang jauh dari kamera sorotan ratu); yaw = menoleh ke arah ratu (rad, 0 = lurus menghadap pintu); scale = ukuran (1 = ukuran asli model);
// smile / smileActive = senyum saat ratu duduk / saat ratu berdiri & berjalan (0..1); glow, tint, shadeWarm, rim, rimPower, shadow: sama seperti QUEEN.
// Pengaturan animasi bicara Isabel (ubah angkanya bila terlalu besar / kecil): mouthMax = lebar mulut maks (0..1); jaw = rahang ikut turun saat huruf i/u/e/o; nod = sudut angguk kepala (radian, 0.07 = +-4 derajat); tilt = sudut miring kepala; blinkTalk / blinkIdle = selang kedip (detik) saat bicara / diam.
const ISABEL_BED_LIFT = 0.13;   // Isabel berbaring: badan diangkat sekian meter di atas titik kasur supaya kepalanya bertumpu di atas bantal (naikkan bila masih tembus, turunkan bila melayang)
const ISABEL_FX = { blush: 0.75, shySad: 0.55, shyMouth: 0.22, shyBrow: 0.0, turn: 0.9, mouthMax: 1, jaw: 0.45, nod: 0.07, tilt: 0.05, gaze: 0.06, blinkTalk: [1.8, 4.2], blinkIdle: [2.6, 6.2] };
const ISABEL = { file: 'isabel.vrm', pajamaFile: 'isabel_baju_tidur_penginapan.vrm', dx: -0.1, z: -1.75, yaw: 0.35, scale: 1, smile: 0.4, smileActive: 0.7, glow: 0.22, tint: 0xffe2b8, shadeWarm: 0.25, rim: 0xffbf70, rimPower: 3.5, shadow: 0.9, radius: 0.45 };
// Isabel menemani pemain (ajak jalan bareng; hanya di dalam istana: aula, galeri lantai 2 & kamar). Ia berjalan menyusuri JEJAK langkah pemain (bukan garis lurus), jadi tangga, pintu & sudut dinding otomatis terlewati.
// gap = jarak (m) di belakang pemain saat ikut; start = mulai berjalan bila tertinggal lebih dari gap + start; vmin / vmax = kecepatan jalan / maks. (m/s); ramp = makin jauh tertinggal makin cepat (m/s per m);
// stride0 / stride1 = panjang 1 siklus langkah jalan / lari (m); run0 / run1 = kecepatan mulai / penuh pose lari; step = jarak antar titik jejak (m); tele = tertinggal sejauh ini (m) -> langsung muncul di jejak dekat pemain;
// jump = pemain berpindah sejauh ini dalam 1 frame (teleport / mulai ulang) -> Isabel muncul di sisinya; glowOut = cahaya sendiri Isabel di luar ruangan (di aula: ISABEL.glow);
// near = jarak maks. pemain-Isabel agar tombol "Ajak" muncul (m); radius = lebar badan Isabel untuk tabrakan dinding / perabot.
const IFOLLOW = { gap: 1.6, start: 0.35, vmin: 1.5, vmax: 9.8, ramp: 3, stride0: 1.3, stride1: 2.4, run0: 2.2, run1: 4.2, step: 0.3, tele: 16, jump: 8, glowOut: 0.05, near: 2.4, radius: 0.35 };
// Prajurit penjaga (model FBX; daftar & posisi di PRAJURIT / PRAJURIT_MODELS pada kekaisaran-istana-layout.js).
// glow / tint = cahaya sendiri hangat supaya tidak gelap di dalam aula (0 = mati); radius = lebar badan untuk tabrakan; breathe = ayunan napas tulang punggung (rad; 0 = diam); bob = naik-turun badan (m).
const GUARD = { glow: 0.22, tint: 0xffe2b8, radius: 0.5, breathe: 0.012, bob: 0.008 };
export function buildAulaRaja({ hide = [] } = {}) {   // hide: bagian luar istana yang menjorok ke dalam (disembunyikan selama pemain di dalam)
  const root = new THREE.Group(); root.name = 'aula-raja-root';
  const group = new THREE.Group(); group.name = 'aula-raja'; group.visible = false; root.add(group);
  const Y = FLOOR_Y, WT = 0.4;                                                          // WT = tebal dinding dalam (di bawah 0,5 agar tidak berimpit dengan dinding luar)
  const aula = AULA_RECTS[1], serambi = AULA_RECTS[0], H = aula.h, HS = serambi.h;

  // ---------- Tekstur (canvas) ----------
  const ctex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const rep = (t, u, v) => { const k = t.clone(); k.repeat.set(u, v); k.needsUpdate = true; return k; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const marble = ctex(256, 256, (x, s) => {   // 2 x 2 petak marmer krem & kelabu hangat (1 petak = 2 m)
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const dark = (r + c) % 2; const g = dark ? 150 + rnd(0, 14) : 226 + rnd(0, 12); x.fillStyle = `rgb(${g},${g - 6},${g - 16})`; x.fillRect(c * 128, r * 128, 128, 128);
      x.strokeStyle = dark ? 'rgba(70,60,50,.25)' : 'rgba(150,130,110,.28)'; x.lineWidth = 1; for (let i = 0; i < 6; i++) { x.beginPath(); let px = c * 128 + rnd(0, 128), py = r * 128; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += rnd(-14, 14); py += rnd(14, 28); x.lineTo(px, py); } x.stroke(); } }
    x.strokeStyle = 'rgba(60,50,40,.6)'; x.lineWidth = 2; x.strokeRect(1, 1, s - 2, s - 2); x.beginPath(); x.moveTo(128, 0); x.lineTo(128, s); x.moveTo(0, 128); x.lineTo(s, 128); x.stroke(); });
  const stone = ctex(256, 256, (x, s) => {    // balok batu kapur hangat
    x.fillStyle = '#9c9483'; x.fillRect(0, 0, s, s); for (let r = 0; r < 8; r++) { const off = (r % 2) * 32; for (let c = -1; c < 4; c++) { const g = 206 + rnd(0, 24); x.fillStyle = `rgb(${g},${g - 8},${g - 24})`; x.fillRect(c * 64 + off + 1.5, r * 32 + 1.5, 61, 29); } }
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(80,70,55,${rnd(0.03, 0.1)})`; x.fillRect(rnd(0, s), rnd(0, s), rnd(1, 3), rnd(1, 3)); } });
  const woodT = ctex(128, 128, (x, s) => { x.fillStyle = '#4a2f1a'; x.fillRect(0, 0, s, s); for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(${rnd(20, 60) | 0},${rnd(10, 30) | 0},5,${rnd(0.15, 0.4)})`; x.fillRect(0, rnd(0, s), s, rnd(1, 3)); } });
  const ceilT = ctex(128, 128, (x, s) => { x.fillStyle = '#1f2a55'; x.fillRect(0, 0, s, s); x.strokeStyle = '#d9b24a'; x.lineWidth = 3; x.strokeRect(6, 6, s - 12, s - 12); x.lineWidth = 1.2; x.strokeRect(14, 14, s - 28, s - 28); x.fillStyle = '#d9b24a'; x.beginPath(); x.arc(s / 2, s / 2, 7, 0, 7); x.fill(); });
  const carpetT = ctex(256, 256, (x, s) => {   // karpet merah: u = sepanjang jalur, v = melintang (bingkai emas di tepi v)
    x.fillStyle = '#8d1d2a'; x.fillRect(0, 0, s, s); x.fillStyle = '#d9b24a'; x.fillRect(0, 10, s, 8); x.fillRect(0, s - 18, s, 8); x.fillRect(0, 26, s, 3); x.fillRect(0, s - 29, s, 3);
    x.strokeStyle = 'rgba(217,178,74,.75)'; x.lineWidth = 3; for (let c = 0; c < 2; c++) { const cx = 64 + c * 128; x.beginPath(); x.moveTo(cx, 60); x.lineTo(cx + 40, 128); x.lineTo(cx, 196); x.lineTo(cx - 40, 128); x.closePath(); x.stroke(); x.beginPath(); x.arc(cx, 128, 9, 0, 7); x.stroke(); }
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${rnd(0.03, 0.1)})`; x.fillRect(rnd(0, s), rnd(0, s), 2, 2); } });
  const bannerT = ctex(128, 256, (x, w, h) => {   // panji kerajaan: ungu tua, bingkai emas, mahkota
    x.fillStyle = '#4a2a78'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d9b24a'; x.lineWidth = 6; x.strokeRect(5, 5, w - 10, h - 10); x.lineWidth = 2; x.strokeRect(14, 14, w - 28, h - 28);
    x.fillStyle = '#d9b24a'; const cx = w / 2, cy = h * 0.4, L = 30; x.beginPath(); x.moveTo(cx - L, cy + L * .6); x.lineTo(cx - L, cy - L * .2); x.lineTo(cx - L * .5, cy + L * .15); x.lineTo(cx, cy - L * .6); x.lineTo(cx + L * .5, cy + L * .15); x.lineTo(cx + L, cy - L * .2); x.lineTo(cx + L, cy + L * .6); x.closePath(); x.fill();
    x.fillRect(cx - L, cy + L * .7, L * 2, 7); x.beginPath(); x.moveTo(cx, h - 20); x.lineTo(cx + 14, h - 60); x.lineTo(cx - 14, h - 60); x.closePath(); x.fill(); });
  const tapT = ctex(256, 320, (x, w, h) => {      // permadani besar di belakang singgasana
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5b2f8c'); g.addColorStop(1, '#2a1650'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#d9b24a'; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16); x.lineWidth = 2.5; x.strokeRect(22, 22, w - 44, h - 44);
    x.fillStyle = '#d9b24a'; x.beginPath(); x.arc(w / 2, h * 0.42, 74, 0, 7); x.fill(); x.fillStyle = '#2a1650'; x.beginPath(); x.arc(w / 2, h * 0.42, 64, 0, 7); x.fill();
    x.fillStyle = '#d9b24a'; const cx = w / 2, cy = h * 0.42, L = 44; x.beginPath(); x.moveTo(cx - L, cy + L * .6); x.lineTo(cx - L, cy - L * .25); x.lineTo(cx - L * .5, cy + L * .1); x.lineTo(cx, cy - L * .7); x.lineTo(cx + L * .5, cy + L * .1); x.lineTo(cx + L, cy - L * .25); x.lineTo(cx + L, cy + L * .6); x.closePath(); x.fill(); x.fillRect(cx - L, cy + L * .72, L * 2, 9);
    for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(40 + i * 22, h - 60); x.lineTo(51 + i * 22, h - 34); x.lineTo(62 + i * 22, h - 60); x.closePath(); x.fill(); } });
  const plaqueT = ctex(1024, 128, (x, w, h) => { x.fillStyle = '#1a2348'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d9b24a'; x.lineWidth = 8; x.strokeRect(5, 5, w - 10, h - 10); x.fillStyle = '#f1d27a'; x.font = 'bold 76px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✦  AULA RAJA  ✦', w / 2, h / 2 + 4); });
  const shaftT = ctex(32, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,240,200,0.55)'); g.addColorStop(1, 'rgba(255,240,200,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); const gx = x.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,0.9)'); gx.addColorStop(0.3, 'rgba(0,0,0,0)'); gx.addColorStop(0.7, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,0.9)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = gx; x.fillRect(0, 0, w, h); });

  // ---------- Bahan ----------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const wallTex = (u, v) => new THREE.MeshStandardMaterial({ map: rep(stone, u, v), color: 0xf0e8d6, roughness: 0.95 });
  const Mt = {
    wall: wallTex(1, 1), gold: std(0xd9b24a, { roughness: 0.35, metalness: 0.65 }), goldDim: std(0xb8923a, { roughness: 0.5, metalness: 0.5 }), steel: std(0x8c93a0, { roughness: 0.4, metalness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ map: woodT, color: 0xffffff, roughness: 0.7 }), stonePlain: std(0xcfc6b0), stoneDark: std(0x8b8473), velvet: std(0x9a1f2e, { roughness: 1 }), cream: std(0xf2e8cf, { roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ map: rep(ceilT, 6, 7), color: 0xffffff, roughness: 1 }), plume: std(0xb8322a, { roughness: 1 }), iron: std(0x2f2f35, { roughness: 0.6, metalness: 0.4 }),
    window: new THREE.MeshBasicMaterial({ color: 0xcfe2ff, fog: false }), flame: new THREE.MeshBasicMaterial({ color: 0xffc060, fog: false }),
    shaft: new THREE.MeshBasicMaterial({ map: shaftT, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  };
  const bannerM = new THREE.MeshStandardMaterial({ map: bannerT, roughness: 1, side: THREE.DoubleSide });
  const tapM = new THREE.MeshStandardMaterial({ map: tapT, roughness: 1 });

  // ---------- Pembantu geometri ----------
  const box = (w, h, d, ts = 0) => {   // ts > 0: UV tiap sisi diskalakan (1 ulangan tekstur = ts meter)
    const g = new THREE.BoxGeometry(w, h, d); if (!ts) return g; const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / ts, uv.getY(k) * dims[f][1] / ts); } return g; };
  const cyl = (a, b, h, n = 10) => new THREE.CylinderGeometry(a, b, h, n);
  const add = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const archShape = (hw, hy) => { const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, hy); s.absarc(0, hy, hw, 0, PI, false); s.lineTo(-hw, 0); return s; };
  // dinding datar dengan lekuk pintu lengkung di tepi bawah (lekuk jadi bagian garis luar, bukan lubang -> triangulasi aman); dibuat di bidang XY, tebal ke +z
  const wallWithArch = (w, h, hw, hy, mat, dx = 0, depth = WT) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(dx - hw, 0); s.lineTo(dx - hw, hy); s.absarc(dx, hy, hw, PI, 0, true); s.lineTo(dx + hw, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
    return new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), mat); };
  const wallExtM = new THREE.MeshStandardMaterial({ map: rep(stone, 1 / 3.2, 1 / 3.2), color: 0xf0e8d6, roughness: 0.95 });

  // ---------- Lantai, karpet, langit-langit ----------
  const floorMat = (u, v) => new THREE.MeshStandardMaterial({ map: rep(marble, u, v), roughness: 0.32, metalness: 0.08 });
  const plane = (w, d, mat, x, y, z, flip = false) => { const m = add(new THREE.PlaneGeometry(w, d).rotateX(flip ? PI / 2 : -PI / 2), mat, x, y, z); return m; };
  plane(25, 33, floorMat(25 / 4, 33 / 4), 2, Y, 0);                                    // aula: x -10,5…14,5
  plane(5.5, 9, floorMat(5.5 / 4, 9 / 4), -13.25, Y, 0);                               // serambi: x -16…-10,5
  plane(25, 33, Mt.ceiling, 2, Y + H, 0, true); plane(5.5, 9, Mt.ceiling, -13.25, Y + HS, 0, true);
  { const L = 8.0 + 15.9, carpet = new THREE.MeshStandardMaterial({ map: rep(carpetT, L / 4, 1), roughness: 1 });   // dari ujung serambi sampai kaki panggung
    add(new THREE.PlaneGeometry(L, 4).rotateX(-PI / 2), carpet, (-15.9 + 8.0) / 2, Y + 0.015, 0); }

  // ---------- Dinding ----------
  const wallBox = (cx, cz, sx, sz, h) => add(box(sx, h, sz, 3.2), Mt.wall, cx, Y + h / 2, cz);
  for (const s of [-1, 1]) { const m = wallWithArch(25.8, H, SIDE_DOOR.hw, SIDE_DOOR.hy, wallExtM, s * (SIDE_DOOR.x - 2), WT); m.position.set(2, Y, s * 16.5); if (s < 0) m.rotation.y = PI; group.add(m); }   // dinding samping aula (z = ±16,5) + pintu ke sayap
  { const dz = DAPUR.doorZ, a0 = dz - 2.0, a1 = dz + 2.0, zS = -16.9, zN = 16.9;   // dinding belakang aula (x = 14,5), berlekuk pintu lengkung ke Dapur Istana di z = 13,6
    wallBox(14.5 + WT / 2, (zS + a0) / 2, WT, a0 - zS, H); wallBox(14.5 + WT / 2, (a1 + zN) / 2, WT, zN - a1, H);
    const m = wallWithArch(4.0, H, DAPUR.doorHW, DAPUR.doorHY, wallExtM, 0, WT); m.rotation.y = PI / 2; m.position.set(14.5, Y, dz); group.add(m); }                                           // dinding belakang aula (x = 14,5)
  for (const s of [-1, 1]) wallBox(-13.25, s * (4.5 + WT / 2), 5.5 + 0.4, WT, HS);      // dinding samping serambi (z = ±4,5)
  { // dinding depan aula (x = -10,5) dengan ambang lengkung ke serambi
    const m = wallWithArch(33, H, 4.5, 3.0, Mt.wall); m.rotation.y = -PI / 2; m.position.set(-10.5, Y, 0); group.add(m);    // ekstrusi ke +z lokal -> diputar agar tebal ke arah -x (menjauhi ruangan)
    m.material = new THREE.MeshStandardMaterial({ map: rep(stone, 1 / 3.2, 1 / 3.2), color: 0xf0e8d6, roughness: 0.95 }); }
  { // dinding depan serambi (x = -16) dengan lubang pintu agung (lebar 6,4 setinggi 5,6 + lengkung)
    const m = wallWithArch(9, HS, 3.2, 5.6, Mt.wall); m.rotation.y = -PI / 2; m.position.set(-16.0, Y, 0); group.add(m);
    m.material = new THREE.MeshStandardMaterial({ map: rep(stone, 1 / 3.2, 1 / 3.2), color: 0xf0e8d6, roughness: 0.95 }); }
  // lis dinding: panel kayu di bawah (wainscot), pita emas, kornis
  const trim = (cx, cz, sx, sz, y, h, mat, out = 0.12) => add(box(sx, h, sz), mat, cx, Y + y, cz);
  for (const s of [-1, 1]) {
    for (const [cx, len] of [[(-10.5 + SIDE_DOOR.x - SIDE_DOOR.hw) / 2, SIDE_DOOR.x - SIDE_DOOR.hw + 10.5], [(SIDE_DOOR.x + SIDE_DOOR.hw + 14.5) / 2, 14.5 - SIDE_DOOR.x - SIDE_DOOR.hw]]) { trim(cx, s * (16.5 - 0.07), len, 0.14, 1.2, 2.4, Mt.wood); trim(cx, s * (16.5 - 0.1), len, 0.2, 2.45, 0.14, Mt.gold); }
    trim(2, s * (16.5 - 0.18), 25, 0.36, H - 0.2, 0.4, Mt.stoneDark); }
  trim(14.5 - 0.07, 0, 0.14, 33, 1.2, 2.4, Mt.wood); trim(14.5 - 0.1, 0, 0.2, 33, 2.45, 0.14, Mt.gold); trim(14.5 - 0.18, 0, 0.36, 33, H - 0.2, 0.4, Mt.stoneDark);
  for (const s of [-1, 1]) { trim(-10.5 + 0.07, s * 10.5, 0.14, 12, 1.2, 2.4, Mt.wood); trim(-10.5 + 0.1, s * 10.5, 0.2, 12, 2.45, 0.14, Mt.gold); }
  trim(-10.5 + 0.18, 0, 0.36, 33, H - 0.2, 0.4, Mt.stoneDark);
  // bingkai emas ambang lengkung ke serambi
  { const arch = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.16, 8, 28, PI), Mt.gold); arch.rotation.y = PI / 2; arch.position.set(-10.45, Y + 3.0, 0); group.add(arch);
    for (const s of [-1, 1]) add(box(0.3, 3.0, 0.32), Mt.gold, -10.45, Y + 1.5, s * 4.5); }
  { const m = add(new THREE.PlaneGeometry(7.4, 0.925), new THREE.MeshStandardMaterial({ map: plaqueT, roughness: 0.8 }), -10.3, Y + 9.3, 0); m.rotation.y = PI / 2; }   // papan nama di atas ambang
  // pintu agung (tampak dalam): bingkai emas di lubang + daun pintu kayu yang terbuka ke luar (di samping lubang)
  { const door = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.14, 8, 24, PI), Mt.gold); door.rotation.y = PI / 2; door.position.set(-15.95, Y + 5.6, 0); group.add(door);
    for (const s of [-1, 1]) { add(box(0.3, 5.6, 0.3), Mt.gold, -15.95, Y + 2.8, s * 3.2); add(box(0.28, 5.6, 0.9), Mt.wood, -15.7, Y + 2.8, s * 4.05); add(box(0.32, 0.18, 0.9), Mt.iron, -15.68, Y + 1.5, s * 4.05); add(box(0.32, 0.18, 0.9), Mt.iron, -15.68, Y + 4.2, s * 4.05); } }

  // ---------- Balok langit-langit ----------
  for (const x of [-8, -3, 2, 7, 12]) add(box(0.6, 0.7, 33), Mt.wood, x, Y + H - 0.35, 0);
  for (const z of [-8.5, 0, 8.5]) add(box(25, 0.5, 0.6), Mt.wood, 2, Y + H - 0.25, z);
  add(box(0.6, 0.6, 9), Mt.wood, -13.25, Y + HS - 0.3, 0); for (const x of [-15, -12, -10.8]) add(box(0.5, 0.5, 9), Mt.wood, x, Y + HS - 0.25, 0);

  // ---------- Tiang (2 baris x 4) ----------
  for (const x of COLS.xs) for (const s of [-1, 1]) {
    const z = s * COLS.z, h = H - 0.9; add(box(1.7, 0.5, 1.7), Mt.stonePlain, x, Y + 0.25, z); add(cyl(COLS.r * 0.9, COLS.r, h - 1.3, 14), Mt.stonePlain, x, Y + 0.5 + (h - 1.3) / 2, z);
    add(cyl(COLS.r * 1.12, COLS.r * 0.95, 0.35, 14), Mt.gold, x, Y + 0.5 + 0.17, z); add(cyl(COLS.r * 1.25, COLS.r * 0.9, 0.5, 14), Mt.gold, x, Y + h - 0.55, z); add(box(1.9, 0.4, 1.9), Mt.stonePlain, x, Y + h - 0.12, z);
  }
  // balok melintang di atas tiang
  for (const s of [-1, 1]) add(box(25, 0.55, 0.9), Mt.stonePlain, 2, Y + H - 0.62, s * COLS.z);

  // ---------- Jendela lengkung + berkas cahaya ----------
  for (const s of [-1, 1]) for (const x of WINDOWS_X) {
    const z = s * (16.5 - 0.02), g = new THREE.Group(); g.position.set(x, Y + 3.7, z); g.rotation.y = s > 0 ? PI : 0; group.add(g);   // menghadap ke dalam
    add(new THREE.ShapeGeometry(archShape(1.0, 3.8)), Mt.window, 0, 0, 0, g);
    for (const e of [-1, 1]) add(box(0.14, 3.8, 0.12), Mt.stoneDark, e * 1.0, 1.9, 0.03, g); add(box(2.1, 0.14, 0.12), Mt.stoneDark, 0, 0.0, 0.03, g); add(box(2.1, 0.12, 0.12), Mt.stoneDark, 0, 2.5, 0.03, g); add(box(0.1, 4.8, 0.1), Mt.stoneDark, 0, 2.4, 0.04, g);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 6, 16, PI), Mt.gold); arch.position.set(0, 3.8, 0.04); g.add(arch);
    { const sg = new THREE.Group(); sg.position.set(x, Y + 4.9, s * 14.5); sg.rotation.x = s * 0.45; group.add(sg);   // atas di jendela, bawah lebih dekat ke tengah
      add(new THREE.PlaneGeometry(2.0, 8), Mt.shaft, 0, 0, 0, sg); add(new THREE.PlaneGeometry(2.0, 8), Mt.shaft, 0, 0, 0, sg).rotation.y = PI / 2; }
  }

  // ---------- Panji, patung ksatria, obor di dinding samping ----------
  const banner = (x, y, z, w, h, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; group.add(g); add(new THREE.PlaneGeometry(w, h), bannerM, 0, 0, 0, g); add(cyl(0.05, 0.05, w + 0.5, 6), Mt.gold, 0, h / 2 + 0.05, 0.02, g).rotation.z = PI / 2; return g; };
  const flameGeo = new THREE.ConeGeometry(0.11, 0.34, 6), flames = [];
  const torch = (x, y, z, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; group.add(g); add(box(0.12, 0.5, 0.12), Mt.iron, 0, 0, 0, g); add(cyl(0.12, 0.07, 0.22, 8), Mt.iron, 0, 0.3, 0.12, g); const f = add(flameGeo, Mt.flame, 0, 0.55, 0.12, g); flames.push(f); };
  const knight = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, Y, z); g.rotation.y = ry; group.add(g);
    add(box(1.2, 0.5, 1.2), Mt.stonePlain, 0, 0.25, 0, g); add(box(1.0, 0.12, 1.0), Mt.gold, 0, 0.56, 0, g);
    for (const e of [-1, 1]) { add(cyl(0.11, 0.13, 0.9, 7), Mt.steel, e * 0.17, 1.05, 0, g); add(box(0.2, 0.1, 0.32), Mt.steel, e * 0.17, 0.62, 0.07, g); }
    add(cyl(0.3, 0.26, 0.95, 9), Mt.steel, 0, 1.95, 0, g); add(box(0.62, 0.14, 0.38), Mt.gold, 0, 1.45, 0, g); add(cyl(0.31, 0.31, 0.1, 9), Mt.gold, 0, 2.2, 0, g);
    for (const e of [-1, 1]) { add(new THREE.SphereGeometry(0.17, 8, 6), Mt.steel, e * 0.4, 2.3, 0, g); add(cyl(0.07, 0.07, 0.8, 6), Mt.steel, e * 0.42, 1.8, 0, g); }
    add(new THREE.SphereGeometry(0.22, 10, 8), Mt.steel, 0, 2.62, 0, g); add(box(0.3, 0.05, 0.05), Mt.iron, 0, 2.62, 0.2, g); add(new THREE.ConeGeometry(0.07, 0.4, 6), Mt.plume, 0, 2.95, -0.05, g);
    add(cyl(0.028, 0.028, 3.4, 5), Mt.wood, 0.5, 2.2, 0.05, g); add(new THREE.ConeGeometry(0.07, 0.3, 5), Mt.gold, 0.5, 3.95, 0.05, g);   // tombak
    const sh = add(cyl(0.34, 0.34, 0.06, 12), Mt.velvet, -0.5, 1.8, 0.22, g); sh.rotation.x = PI / 2; sh.rotation.z = 0.2; add(cyl(0.36, 0.36, 0.05, 12), Mt.gold, -0.5, 1.8, 0.2, g).rotation.x = PI / 2;
  };
  for (const s of [-1, 1]) {
    for (const x of KNIGHT_X) { knight(x, s * KNIGHT_Z, s > 0 ? PI : 0); banner(x, Y + 7.8, s * (16.5 - 0.05), 1.6, 4.4, s > 0 ? PI : 0); }
    for (const x of [-9, 12.5]) torch(x, Y + 3.4, s * (16.5 - 0.2), s > 0 ? PI : 0);
  }
  for (const s of [-1, 1]) { banner(-10.4, Y + 7.3, s * 8.6, 1.8, 5.6, PI / 2); banner(-10.4, Y + 7.3, s * 13.8, 1.8, 5.6, PI / 2); torch(-10.3, Y + 3.2, s * 6.2, PI / 2); torch(-10.3, Y + 3.2, s * 11.2, PI / 2); }

  // ---------- Dinding belakang: permadani, tiang takhta, pintu semu ----------
  { const t = add(new THREE.PlaneGeometry(8, 10), tapM, 14.26, Y + 6.4, 0); /* x 14,26 (bukan 14,3): sisi depan pita emas lis dinding ada di x = 14,3 (y 2,38-2,52) -> berimpit dengan permadani = berkedip */ t.rotation.y = -PI / 2; add(box(0.14, 0.2, 8.6), Mt.gold, 14.3, Y + 11.5, 0); add(box(0.12, 0.2, 8.6), Mt.gold, 14.3, Y + 1.4, 0); }
  for (const s of [-1, 1]) { add(box(0.4, 10.4, 0.9), Mt.stonePlain, 14.25, Y + 5.6, s * 4.6); add(cyl(0.45, 0.5, 0.5, 10), Mt.gold, 14.1, Y + 10.8, s * 4.6); add(box(0.4, 0.5, 1.1), Mt.gold, 14.25, Y + 0.25, s * 4.6);
    const d = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape(1.5, 3.2), { depth: 0.2, bevelEnabled: false }), Mt.wood); d.rotation.y = -PI / 2; d.position.set(14.5 - 0.02, Y, s * 11.6); group.add(d); d.visible = s < 0;   // pintu semu (sisi kanan diganti pintu ke Dapur Istana) (ruang lain: menyusul)
    const dr = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.1, 6, 16, PI), Mt.gold); dr.rotation.y = -PI / 2; dr.position.set(14.2, Y + 3.2, s * 11.6); group.add(dr); dr.visible = s < 0;
    for (const e of [-1, 1]) add(box(0.14, 3.2, 0.14), Mt.gold, 14.2, Y + 1.6, s * 11.6 + e * 1.7).visible = s < 0;
    torch(14.2, Y + 3.6, s * 8.6, -PI / 2); if (s < 0) { torch(14.2, Y + 3.6, s * 14.4, -PI / 2); banner(14.3, Y + 7.6, s * 13.2, 1.6, 5.0, -PI / 2); } else banner(14.3, Y + 8.6, 8.6 + 0.0, 1.6, 5.0, -PI / 2); }

  // ---------- Panggung singgasana ----------
  for (let i = 0; i < DAIS.steps; i++) {   // anak tangga batu + karpet di atasnya
    const h = DAIS.stepH * (i + 1), x0 = DAIS.x0 + i * DAIS.treadD, cx = x0 + DAIS.treadD / 2;
    add(box(DAIS.treadD, h, DAIS.z * 2), Mt.stonePlain, cx, Y + h / 2, 0); add(box(DAIS.treadD + 0.04, 0.05, DAIS.z * 2 + 0.06), Mt.gold, cx, Y + h - 0.02, 0);
    add(box(DAIS.treadD - 0.02, 0.03, 4), new THREE.MeshStandardMaterial({ map: rep(carpetT, 0.25, 1), roughness: 1 }), cx, Y + h + 0.012, 0); }
  { const pw = DAIS.x1 - DAIS.platX0, cx = DAIS.platX0 + pw / 2; add(box(pw, DAIS.top, DAIS.z * 2), Mt.stonePlain, cx, Y + DAIS.top / 2, 0); add(box(pw + 0.04, 0.06, DAIS.z * 2 + 0.06), Mt.gold, cx, Y + DAIS.top - 0.02, 0);
    add(new THREE.PlaneGeometry(pw - 0.2, 4).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: rep(carpetT, (pw - 0.2) / 4, 1), roughness: 1 }), cx - 0.1, Y + DAIS.top + 0.015, 0); }
  { // singgasana
    const g = new THREE.Group(); g.position.set(THRONE.x, Y + DAIS.top, THRONE.z); group.add(g);
    // dudukan dangkal (0,8 m) supaya orang duduk bisa bersandar & kakinya turun ke injakan kaki (ratu duduk di sini)
    add(box(2.6, 0.2, 2.2), Mt.gold, 0, 0.1, 0, g); add(box(0.95, 0.6, 1.5), Mt.goldDim, 0.475, 0.5, 0, g); add(box(0.83, 0.18, 1.3), Mt.velvet, 0.385, 0.88, 0.0, g);
    add(box(0.35, 4.4, 1.9), Mt.gold, 0.85, 2.4, 0, g); add(box(0.2, 3.6, 1.5), Mt.velvet, 0.68, 2.2, 0, g);
    for (const s of [-1, 1]) { add(box(1.2, 0.22, 0.28), Mt.gold, 0.15, 1.35, s * 0.95, g); add(box(0.3, 0.7, 0.3), Mt.gold, -0.35, 1.0, s * 0.95, g); }
    const top = add(new THREE.ConeGeometry(0.28, 0.9, 5), Mt.gold, 0.85, 4.95, 0, g); void top; for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.2, 0.7, 5), Mt.gold, 0.85, 4.65, s * 0.8, g);
    add(new THREE.SphereGeometry(0.3, 12, 8), Mt.gold, 0.85, 4.55, 0, g).scale.set(1, 1, 2.2); add(box(0.6, 0.1, 1.0), Mt.gold, -0.27, 0.05, 0, g); add(box(0.46, 0.325, 0.86), Mt.goldDim, -0.27, 0.2625, 0, g); add(box(0.5, 0.1, 0.9), Mt.velvet, -0.27, 0.475, 0, g);   // injakan kaki (puncak 0,525 m)
    const gem = add(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a4a }), 0.65, 3.2, 0, g); void gem; }

  // ---------- Ratu duduk di singgasana ----------
  const queenG = new THREE.Group(); queenG.name = 'ratu'; group.add(queenG);
  // Bayangan ratu: bayangan palsu (bercak gelap lembut) - lebih ringan untuk Android daripada lampu bayangan sungguhan, dan tetap menempelkan ratu ke singgasana.
  // Ada 4 bercak: bawah paha (dudukan), alas kaki, lantai singgasana di bawah kaki, dan lantai panggung (bercak sandaran dibuang: berimpit dengan beludru sandaran sehingga berkedip).
  { const blobT = ctex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    blobT.wrapS = blobT.wrapT = THREE.ClampToEdgeWrapping;
    const sg = new THREE.Group(); sg.name = 'bayangan-ratu'; sg.position.set(THRONE.x, Y + DAIS.top, THRONE.z); group.add(sg);   // kerangka sama dengan singgasana (x+ = ke arah sandaran)
    const blob = (w, h, op, x, y, z, wall = false) => { const m = add(new THREE.PlaneGeometry(w, h).rotateX(wall ? 0 : -PI / 2).rotateY(wall ? -PI / 2 : 0), new THREE.MeshBasicMaterial({ map: blobT, transparent: true, opacity: Math.min(1, op * QUEEN.shadow), depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), x, y, z, sg); m.renderOrder = 5; return m; };
    if (QUEEN.shadow > 0) {
      blob(1.0, 0.95, 0.42, 0.40, 0.975, 0);      // di bawah paha / pinggul, di atas bantal dudukan (puncak 0,97)
      blob(0.7, 0.8, 0.40, -0.27, 0.53, 0);       // di bawah kaki, di atas injakan kaki (puncak 0,525)
      blob(1.9, 1.5, 0.30, -0.05, 0.205, 0);      // lantai dasar singgasana di bawah ratu & injakan (puncak 0,2)
      blob(3.4, 2.8, 0.20, 0.2, 0.012, 0);        // panggung di sekeliling singgasana
    } }
  let QR = null;   // kumpulan pose animasi ratu (duduk / berdiri / berjalan), diisi seatQueen
  let queenState = 0;   // 0 belum dimuat, 1 sedang memuat, 2 siap, -1 gagal
  const seatQueen = gltf => {
    const vrm = gltf.userData.vrm; if (!vrm) throw new Error('bukan berkas VRM');
    VRMUtils.rotateVRM0(vrm);   // VRM 0.x menghadap -z -> putar ke +z (VRM 1.0 sudah +z, tidak diubah)
    const fbx = vrm.scene;
    const V = (x, y, z) => new THREE.Vector3(x, y, z), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    queenG.add(fbx);
    queenG.position.set(THRONE.x + QUEEN.hipX, Y + DAIS.top + QUEEN.hipY, THRONE.z); queenG.rotation.y = -PI / 2;   // menghadap -x (ke pintu), sama seperti singgasana
    queenG.updateMatrixWorld(true);
    const bone = n => fbx.getObjectByName(n), wp = b => b.getWorldPosition(V(0, 0, 0));
    const rotW = (b, dq) => { b.getWorldQuaternion(qa); qa.premultiply(dq); b.parent.getWorldQuaternion(qb); b.quaternion.copy(qb.invert().multiply(qa)); b.updateMatrixWorld(true); };   // putar tulang di sumbu DUNIA (tidak bergantung orientasi tulang)
    const aim = (n, c, t) => { const b = bone(n), k = bone(c); if (!b || !k) return; const cur = wp(k).sub(wp(b)).normalize(); rotW(b, new THREE.Quaternion().setFromUnitVectors(cur, t.clone().transformDirection(queenG.matrixWorld))); };   // t = arah target di kerangka ratu (x kiri, y atas, z depan)
    const roll = (n, c, deg) => { const b = bone(n), k = bone(c); if (!b || !k) return; rotW(b, new THREE.Quaternion().setFromAxisAngle(wp(k).sub(wp(b)).normalize(), deg * PI / 180)); };
    // ---- Kerangka animasi ratu (berdiri / berjalan / duduk kembali): kumpulan rotasi lokal 10 tulang (kaki & lengan) untuk tiap pose, dibuat SEKALI di sini lewat aim();
    //      saat animasi tinggal slerp antar-pose (murah, tanpa hitung dunia per frame). ----
    const ANIM = [];
    for (const S of ['L', 'R']) for (const n of ['UpperLeg', 'LowerLeg', 'Foot', 'UpperArm', 'LowerArm']) { const b = bone(`J_Bip_${S}_${n}`); if (b) ANIM.push(b); }
    const snap = () => ANIM.map(b => b.quaternion.clone()), load = set => { for (let i = 0; i < ANIM.length; i++) ANIM[i].quaternion.copy(set[i]); fbx.updateMatrixWorld(true); };
    const restSet = snap();
    // jari menekuk (sendi 1/2/3, derajat) supaya kedua tangan saling menggenggam / jarinya terjalin; sumbu tekuk = sumbu Z lokal tulang jari (berlawanan untuk kiri/kanan). Dipasang SEKALI & tetap, jadi semua pose model ini harus dihitung dengan tekukan yang sama.
    const CURLS = { L: [4.37, 68.19, 17.25], R: [19.32, 64.82, 53.3] };   // jari saat menggenggam (duduk / berdiri)
    const CURL_WALK = [15, 22, 12];   // jari rileks saat berjalan (kedua tangan sama)
    const FING = []; for (const [s, S] of [[1, 'L'], [-1, 'R']]) for (const f of ['Index', 'Middle', 'Ring', 'Little']) for (let j = 0; j < 3; j++) { const b = bone(`J_Bip_${S}_${f}${j + 1}`); if (b) FING.push({ b, s, S, j }); }
    const fRest = FING.map(o => o.b.quaternion.clone());
    const fQ = (o, deg) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, -o.s), deg * PI / 180);
    FING.forEach(o => o.b.quaternion.multiply(fQ(o, CURLS[o.S][o.j])));
    const fClasp = FING.map(o => o.b.quaternion.clone()), fRelax = FING.map((o, i) => fRest[i].clone().multiply(fQ(o, CURL_WALK[o.j])));
    const qFing = w => { for (let i = 0; i < FING.length; i++) FING[i].b.quaternion.copy(fClasp[i]).slerp(fRelax[i], w); };   // w: 0 = menggenggam, 1 = jari rileks (jalan)
    // lengan per sisi [lengan-atas x, lengan-atas z, lengan-bawah x, y, z, roll(derajat)]; kiri & kanan sengaja tidak simetris (tangan kiri di atas tangan kanan) supaya tangan tidak saling menembus
    const QSEAT = { L: [0.33, 0.49, 0.57, 0.02, 0.74, -27.46], R: [0.31, 0.35, 0.38, -0.11, 0.78, 12.78] };
    const QSTAND = { L: [0.36, 0.53, 0.7, 0.73, 0.76, -38.48], R: [0.34, 0.47, 0.58, 0.61, 0.76, -5.24] };
    // lengan saat BERJALAN (berayun biasa): lengan atas keluar ax, lengan bawah keluar fx, siku menekuk el (rad), ayun maju-mundur +-amp (rad). Nilai dipilih supaya tangan tidak menembus gaun (jarak >= ~4 mm).
    const QWALK = { ax: 0.45, fx: 0.2, el: 1.0, amp: 0.22 };
    for (const [s, S] of [[1, 'L'], [-1, 'R']]) {   // pose duduk: paha ke depan, betis turun, kaki di injakan, lengan di pangkuan
      aim(`J_Bip_${S}_UpperLeg`, `J_Bip_${S}_LowerLeg`, V(0.10 * s, -0.02, 1)); aim(`J_Bip_${S}_LowerLeg`, `J_Bip_${S}_Foot`, V(0.03 * s, -1, 0.10)); aim(`J_Bip_${S}_Foot`, `J_Bip_${S}_ToeBase`, V(0, -0.55, 1));
      { const A = QSEAT[S]; aim(`J_Bip_${S}_UpperArm`, `J_Bip_${S}_LowerArm`, V(A[0] * s, -1, A[1])); aim(`J_Bip_${S}_LowerArm`, `J_Bip_${S}_Hand`, V(-A[2] * s, -A[3], A[4])); roll(`J_Bip_${S}_LowerArm`, `J_Bip_${S}_Hand`, A[5] * s); }   // kedua tangan saling menggenggam di depan perut, di atas pangkuan (dulu tangan tenggelam ke dalam gaun)
    }
    // sendi pinggul tepat di titik duduk
    const hip = wp(bone('J_Bip_L_UpperLeg')).add(wp(bone('J_Bip_R_UpperLeg'))).multiplyScalar(0.5); fbx.position.sub(queenG.worldToLocal(hip)); queenG.updateMatrixWorld(true);
    const seatSet = snap();
    if (ANIM.length === 10) try {
      const poseAim = spec => {   // mulai dari pose T asli, arahkan paha / betis / kaki / lengan sesuai spec(S, s)
        load(restSet);
        for (const [s, S] of [[1, 'L'], [-1, 'R']]) { const p = spec(S, s);
          aim(`J_Bip_${S}_UpperLeg`, `J_Bip_${S}_LowerLeg`, p.l[0]); aim(`J_Bip_${S}_LowerLeg`, `J_Bip_${S}_Foot`, p.l[1]); aim(`J_Bip_${S}_Foot`, `J_Bip_${S}_ToeBase`, p.l[2]);
          aim(`J_Bip_${S}_UpperArm`, `J_Bip_${S}_LowerArm`, p.a[0]); aim(`J_Bip_${S}_LowerArm`, `J_Bip_${S}_Hand`, p.a[1]); roll(`J_Bip_${S}_LowerArm`, `J_Bip_${S}_Hand`, p.r); }
        return snap(); };
      // sudut (rad, + = ke depan, dari garis lurus ke bawah): paha kiri, betis kiri, paha kanan, betis kanan, ayun lengan kiri, ayun lengan kanan
      const mk = (tL, sL, tR, sR, aL, aR, walking) => poseAim((S, s) => { const t = S === 'L' ? tL : tR, k = S === 'L' ? sL : sR, c = (S === 'L' ? aL : aR) * QWALK.amp / 0.28;
        const A = QSTAND[S]; return { l: [V(0.03 * s, -Math.cos(t), Math.sin(t)), V(0, -Math.cos(k), Math.sin(k)), V(0, -0.35, 1)], a: walking ? [V(QWALK.ax * s, -Math.cos(c), Math.sin(c)), V(QWALK.fx * s, -Math.cos(c + QWALK.el), Math.sin(c + QWALK.el))] : [V(A[0] * s, -1, A[1]), V(-A[2] * s, -A[3], A[4])], r: walking ? 0 : A[5] * s }; });   // berdiri (walking = false): kedua tangan menggenggam di depan perut; berjalan (walking = true): lengan berayun biasa (lihat QWALK)
      const standSet = mk(0, 0, 0, 0, 0, 0);
      const walk = [mk(0.40, 0.12, -0.35, -0.55, -0.28, 0.28, true),    // A: kaki kiri di depan
                    mk(-0.12, -0.05, 0.12, -0.75, 0, 0, true),           // lewat: kaki kanan terayun (lutut menekuk)
                    mk(-0.35, -0.55, 0.40, 0.12, 0.28, -0.28, true),     // B: kaki kanan di depan
                    mk(0.12, -0.75, -0.12, -0.05, 0, 0, true)];          // lewat: kaki kiri terayun
      load(standSet);
      const hipW = wp(bone('J_Bip_L_UpperLeg')).add(wp(bone('J_Bip_R_UpperLeg'))).multiplyScalar(0.5);
      const standH = hipW.y - Math.min(wp(bone('J_Bip_L_Foot')).y, wp(bone('J_Bip_R_Foot')).y) + 0.075;   // tinggi pinggul saat berdiri (telapak ~7,5 cm di bawah sendi kaki)
      QR = { ANIM, seatSet, standSet, walk, standH, tmp: standSet.map(q => q.clone()), qFing };
    } catch (e) { QR = null; console.warn('Animasi jalan ratu gagal disiapkan:', e); }
    load(seatSet);
    const tint = new THREE.Color(QUEEN.tint), rimC = new THREE.Color(QUEEN.rim);
    fbx.traverse(o => {
      if (o.isLight) { o.visible = false; return; }
      if (!o.isMesh) return;
      o.frustumCulled = false;   // bounding sphere dihitung dari pose awal (T-pose)
      for (const m of [].concat(o.material)) {   // bahan MToon: jangan ubah side / alphaMode (garis tepi & alpha sudah diatur VRM)
        if (m.map) m.map.anisotropy = 4;
        if (!m.isOutline) {
          if (m.emissive) { m.emissiveMap = QUEEN.glow > 0 ? m.map : null; m.emissive.copy(tint).multiplyScalar(QUEEN.glow); }   // cahaya sendiri hangat (cocok dengan lampu aula)
          if (m.shadeColorFactor) m.shadeColorFactor.lerp(tint, QUEEN.shadeWarm);                                              // sisi teduh toon lebih hangat & tidak terlalu gelap
          if (m.parametricRimColorFactor) { m.parametricRimColorFactor.copy(rimC); m.parametricRimFresnelPowerFactor = QUEEN.rimPower; m.parametricRimLiftFactor = 0.05; }   // cahaya tepi hangat: memisahkan ratu dari sandaran gelap
        }
        m.needsUpdate = true;
      }
    });
    qAnim = makeQueenAnim(vrm);   // kedip mulai setelah ratu diberi pose duduk
  };
  // ---------- Kedip ratu ----------
  // Hanya kedip (lewat expressionManager 'blink'); vrm.update TIDAK dipanggil karena ia menimpa pose duduk. Selang 2,4-5,8 detik, sesekali dua kali berturut-turut.
  // Ekspresi ratu berubah mengikuti tahap geraknya. fun = senyum lembut (preset 'relaxed' = Fcl_ALL_Fun), joy = senyum hangat dengan mata melengkung (preset 'happy' = Fcl_ALL_Joy; dipakai tipis saja karena memejamkan mata). Nilai 0..1; rate = kecepatan beralih.
  //  duduk: senyum tipis -> berdiri: mulai tersenyum -> berjalan: makin lebar mengikuti jarak ke pemain (walk0 -> walk1) -> tiba / berbicara: senyum hangat + mata melengkung (joyTalk) -> kembali ke singgasana: senyum mereda ke idle
  const QUEEN_SMILE = { idle: 0.45, rise: 0.55, walk0: 0.5, walk1: 0.9, talk: 0.85, joyTalk: 0.3, back: 0.6, rate: 3 };
  const _qsm = { fun: 0, joy: 0 };
  const qSmileTarget = (st, p, talking) => {
    const S = QUEEN_SMILE; let fun = S.idle, joy = 0;
    if (st === 'rising') fun = S.rise;
    else if (st === 'out' || st === 'arrive') fun = S.walk0 + (S.walk1 - S.walk0) * p;
    else if (st === 'wait') { fun = S.talk; joy = S.joyTalk; }
    else if (st === 'turn1' || st === 'back' || st === 'arrive2' || st === 'turn2') fun = S.back;
    if (talking && st === 'wait') joy = S.joyTalk;
    _qsm.fun = fun; _qsm.joy = joy; return _qsm;
  };
  let qAnim = null;
  const makeQueenAnim = vrm => {
    const A = { em: vrm.expressionManager || null };
    A.reset = () => { A.t0 = null; A.last = 0; A.blinkAt = 1.5; A.blinkT = -1; A.blinkV = 0; A.talk = false; A.mouthV = 0; };
    A.reset(); A.funV = 0; A.joyV = 0; return A; };   // funV / joyV tidak ikut reset: senyum tetap menyambung mulus (tanpa lompat) saat aula dibuka lagi
  const stepQueen = t => {
    const A = qAnim; if (!A || !A.em) return;
    if (A.t0 === null) { A.t0 = t; A.last = t; }
    const dt = Math.min(0.05, Math.max(0, t - A.last)); A.last = t; const T = t - A.t0; let dirty = false;
    if (A.blinkT < 0 && T >= A.blinkAt) { A.blinkT = 0; A.blinkAt = T + (Math.random() < 0.15 ? 0.45 : rnd(2.4, 5.8)); }
    let v = 0; if (A.blinkT >= 0) { A.blinkT += dt; const k = A.blinkT / 0.2; if (k >= 1) A.blinkT = -1; else v = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; }
    if (v !== A.blinkV) { A.blinkV = v; A.em.setValue('blink', v); dirty = true; }
    // mulut membuka-menutup saat ratu berbicara (A.talk diatur game.js lewat queenTalk)
    const mt = A.talk ? 0.18 + 0.32 * Math.abs(Math.sin(T * 8.5)) * (0.65 + 0.35 * Math.sin(T * 2.7)) : 0;
    const mv = A.mouthV + (mt - A.mouthV) * (1 - Math.exp(-dt * 16));
    if (Math.abs(mv - A.mouthV) > 0.004 || (mt === 0 && A.mouthV !== 0 && mv < 0.01)) { A.mouthV = mt === 0 && mv < 0.01 ? 0 : mv; A.em.setValue('aa', A.mouthV); dirty = true; }
    // senyum berubah sesuai tahap gerak (lihat QUEEN_SMILE): fun = 'relaxed', joy = 'happy'
    const pr = qEase((QSEAT_X - queenG.position.x) / (QSEAT_X - QSTOP)), tg = qSmileTarget(QW.st, pr, A.talk), kk = 1 - Math.exp(-dt * QUEEN_SMILE.rate);
    const fv = A.funV + (tg.fun - A.funV) * kk, jv = A.joyV + (tg.joy - A.joyV) * kk;
    if (Math.abs(fv - A.funV) > 0.003) { A.funV = fv; A.em.setValue('relaxed', fv); dirty = true; }
    if (Math.abs(jv - A.joyV) > 0.003) { A.joyV = jv; A.em.setValue('happy', jv); dirty = true; }
    if (dirty) A.em.update();
  };
  const loadQueen = () => {
    if (queenState) return; queenState = 1;
    new GLTFLoader().register(pl => new VRMLoaderPlugin(pl)).load(QUEEN.file, gltf => { try { seatQueen(gltf); queenState = 2; } catch (e) { queenState = -1; console.warn('Ratu gagal diberi pose:', e); } }, undefined, e => { queenState = -1; console.warn(QUEEN.file + ' gagal dimuat:', e); });
  };

  // ---------- Putri Isabel berdiri di sebelah singgasana ----------
  const isabelG = new THREE.Group(); isabelG.name = 'isabel'; group.add(isabelG);
  isabelG.scale.setScalar(ISABEL.scale);
  isabelG.position.set(THRONE.x + ISABEL.dx, Y + DAIS.top, THRONE.z + ISABEL.z); isabelG.rotation.y = -PI / 2 + ISABEL.yaw;   // menghadap ke pintu, sedikit menoleh ke ratu
  if (!AULA_CIRCLES.some(c => c.isabel)) AULA_CIRCLES.push({ x: THRONE.x + ISABEL.dx, z: THRONE.z + ISABEL.z, r: ISABEL.radius, isabel: true });   // tabrakan: pemain tidak tembus Isabel
  if (!F2_CIRCLES.some(c => c.isabel)) F2_CIRCLES.push({ x: 1e5, z: 1e5, r: ISABEL.radius, isabel: true });   // sama untuk lantai 2 (aktif hanya bila Isabel menunggu di lantai 2)
  const iC1 = AULA_CIRCLES.find(c => c.isabel), iC2 = F2_CIRCLES.find(c => c.isabel);
  let iShadow = null;
  if (ISABEL.shadow > 0) {   // bayangan palsu di lantai panggung tepat di bawah kakinya
    const bt = ctex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    bt.wrapS = bt.wrapT = THREE.ClampToEdgeWrapping;
    const m = add(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: bt, transparent: true, opacity: Math.min(1, 0.38 * ISABEL.shadow), depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), THRONE.x + ISABEL.dx, Y + DAIS.top + 0.014, THRONE.z + ISABEL.z); m.renderOrder = 5; iShadow = m;
  }
  let iLastT = null;   // waktu frame sebelumnya (untuk menghitung dt di update)
  let isabelState = 0, iAnim = null, IR = null, iMats = [], iEnv = null;   // iMats = bahan Isabel (untuk cahaya sendiri di luar); iEnv = { parent, push(x, z, r), ground(x, z) } dari game.js untuk dunia luar   // 0 belum dimuat, 1 memuat, 2 siap, -1 gagal
  const iSkins = {}; let iSkinKey = 'normal';   // skin Isabel: normal (gaun istana) / pajama (baju tidur, dipakai di Penginapan Karavan); tiap skin = { fbx, IR, A } (model, set pose, animasi wajah)
  const seatIsabel = (gltf, key = 'normal') => {
    const vrm = gltf.userData.vrm; if (!vrm) throw new Error('bukan berkas VRM');
    VRMUtils.rotateVRM0(vrm);
    const fbx = vrm.scene, V = (x, y, z) => new THREE.Vector3(x, y, z), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    isabelG.add(fbx); isabelG.updateMatrixWorld(true);
    const keep = { IR, A: iAnim }; if (key !== iSkinKey) fbx.visible = false;   // skin yang belum dipakai: disembunyikan, dan IR / iAnim milik skin aktif dikembalikan di akhir
    const bone = n => fbx.getObjectByName(n), wp = b => b.getWorldPosition(V(0, 0, 0));
    const rotW = (b, dq) => { b.getWorldQuaternion(qa); qa.premultiply(dq); b.parent.getWorldQuaternion(qb); b.quaternion.copy(qb.invert().multiply(qa)); b.updateMatrixWorld(true); };
    const aim = (n, c, t) => { const b = bone(n), k = bone(c); if (!b || !k) return; const cur = wp(k).sub(wp(b)).normalize(); rotW(b, new THREE.Quaternion().setFromUnitVectors(cur, t.clone().transformDirection(isabelG.matrixWorld))); };   // t = arah target di kerangka Isabel (x kiri, y atas, z depan)
    const roll = (n, c, deg) => { const b = bone(n), k = bone(c); if (!b || !k) return; rotW(b, new THREE.Quaternion().setFromAxisAngle(wp(k).sub(wp(b)).normalize(), deg * PI / 180)); };
    const ANIM = [];   // 10 tulang (kaki & lengan) yang digerakkan; set rotasi dibuat SEKALI di sini, saat animasi tinggal slerp (seperti ratu)
    for (const S of ['L', 'R']) for (const n of ['UpperLeg', 'LowerLeg', 'Foot', 'UpperArm', 'LowerArm']) { const b = bone(`J_Bip_${S}_${n}`); if (b) ANIM.push(b); }
    const snap = () => ANIM.map(b => b.quaternion.clone()), load = set => { for (let i = 0; i < ANIM.length; i++) ANIM[i].quaternion.copy(set[i]); fbx.updateMatrixWorld(true); };
    const restSet = snap();
    // jari menekuk (sendi 1/2/3, derajat) supaya kedua tangan saling menggenggam / jarinya terjalin; sumbu tekuk = sumbu Z lokal tulang jari (berlawanan untuk kiri/kanan). Dipasang SEKALI & tetap, jadi semua pose model ini harus dihitung dengan tekukan yang sama.
    const CURLS = { L: [16.68, 46.04, 25.11], R: [13.06, 5.43, 45.99] };
    for (const [s, S] of [[1, 'L'], [-1, 'R']]) for (const f of ['Index', 'Middle', 'Ring', 'Little']) CURLS[S].forEach((deg, j) => { const b = bone(`J_Bip_${S}_${f}${j + 1}`); if (b) b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, -s), deg * PI / 180)); });
    // lengan per sisi [lengan-atas x, lengan-atas z, lengan-bawah x, y, z, roll(derajat)]; kiri & kanan sengaja tidak simetris (tangan kiri di atas tangan kanan) supaya tangan tidak saling menembus
    const IARM = { L: [0.27, 0.39, 0.35, 0.46, 0.84, -46.79], R: [0.16, 0.46, 0.35, 0.24, 0.54, 2.62] };
    for (const [s, S] of [[1, 'L'], [-1, 'R']]) {   // pose berdiri anggun: kaki lurus, lengan turun, kedua tangan bertemu di depan perut
      aim(`J_Bip_${S}_UpperLeg`, `J_Bip_${S}_LowerLeg`, V(0.03 * s, -1, 0.02)); aim(`J_Bip_${S}_LowerLeg`, `J_Bip_${S}_Foot`, V(0.01 * s, -1, 0)); aim(`J_Bip_${S}_Foot`, `J_Bip_${S}_ToeBase`, V(0, -0.35, 1));
      // lengan: kedua tangan saling menggenggam di depan perut (jari terjalin). Nilai dihitung dari geometri isabel.vrm: tangan tidak menembus rok / korset (jarak >= ~6 mm). Bila diubah, cek lagi dari depan & samping.
      { const A = IARM[S]; aim(`J_Bip_${S}_UpperArm`, `J_Bip_${S}_LowerArm`, V(A[0] * s, -1, A[1])); aim(`J_Bip_${S}_LowerArm`, `J_Bip_${S}_Hand`, V(-A[2] * s, -A[3], A[4])); roll(`J_Bip_${S}_LowerArm`, `J_Bip_${S}_Hand`, A[5] * s); }
    }
    isabelG.updateMatrixWorld(true);
    const idleSet = snap();
    if (ANIM.length === 10) try {
      const poseAim = spec => {
        load(restSet);
        for (const [s, S] of [[1, 'L'], [-1, 'R']]) { const p = spec(S, s);
          aim(`J_Bip_${S}_UpperLeg`, `J_Bip_${S}_LowerLeg`, p.l[0]); aim(`J_Bip_${S}_LowerLeg`, `J_Bip_${S}_Foot`, p.l[1]); aim(`J_Bip_${S}_Foot`, `J_Bip_${S}_ToeBase`, p.l[2]);
          /* lengan TIDAK diayun saat jalan / lari: tetap pose berdiri (di atas rok). Ayunan lengan di sisi badan menembus rok yang lebar, jadi lengan disalin dari idleSet di bawah. */ }
        for (const k of [3, 4, 8, 9]) ANIM[k].quaternion.copy(idleSet[k]);   // indeks ANIM: 0-4 = kiri (paha, betis, telapak, lengan atas, lengan bawah), 5-9 = kanan
        return snap(); };
      // sudut (rad, + = ke depan dari garis lurus ke bawah): paha kiri, betis kiri, paha kanan, betis kanan, ayun lengan kiri, ayun lengan kanan, tekuk siku
      const mk = (tL, sL, tR, sR, aL, aR, el) => poseAim((S, s) => { const t = S === 'L' ? tL : tR, k = S === 'L' ? sL : sR, c = S === 'L' ? aL : aR;
        return { l: [V(0.03 * s, -Math.cos(t), Math.sin(t)), V(0, -Math.cos(k), Math.sin(k)), V(0, -0.35, 1)], a: [V(0.12 * s, -Math.cos(c), Math.sin(c)), V(0.03 * s, -Math.cos(c + el), Math.sin(c + el))] }; });
      const walk = [mk(0.40, 0.12, -0.35, -0.55, -0.20, 0.20, 0.30), mk(-0.12, -0.05, 0.12, -0.75, 0, 0, 0.30), mk(-0.35, -0.55, 0.40, 0.12, 0.20, -0.20, 0.30), mk(0.12, -0.75, -0.12, -0.05, 0, 0, 0.30)];   // ayun lengan kecil (putri anggun)
      const run = [mk(0.80, 0.30, -0.55, -1.30, -0.70, 0.70, 1.0), mk(-0.10, -0.25, 0.25, -1.45, 0, 0, 0.9), mk(-0.55, -1.30, 0.80, 0.30, 0.70, -0.70, 1.0), mk(0.25, -1.45, -0.10, -0.25, 0, 0, 0.9)];
      IR = { ANIM, idleSet, walk, run, tmp: idleSet.map(q => q.clone()), tmp2: idleSet.map(q => q.clone()) };
    } catch (e) { IR = null; console.warn('Animasi jalan Isabel gagal disiapkan:', e); }
    load(idleSet); isabelG.updateMatrixWorld(true);
    // telapak kaki tepat di lantai panggung & pinggul di atas titik berdiri (telapak ~7,5 cm di bawah sendi kaki, seperti ratu)
    const loc = b => isabelG.worldToLocal(wp(b)), minFoot = Math.min(loc(bone('J_Bip_L_Foot')).y, loc(bone('J_Bip_R_Foot')).y), hipL = loc(bone('J_Bip_C_Hips'));
    fbx.position.set(-hipL.x, -(minFoot - 0.075), -hipL.z); isabelG.updateMatrixWorld(true);
    const tint = new THREE.Color(ISABEL.tint), rimC = new THREE.Color(ISABEL.rim);
    const blushMats = [];   // bahan kulit wajah: warnanya digeser ke merah muda saat Isabel tersipu (isabelBlush)
    fbx.traverse(o => {
      if (o.isLight) { o.visible = false; return; }
      if (!o.isMesh) return;
      o.frustumCulled = false;
      for (const m of [].concat(o.material)) {   // pencahayaan sama seperti ratu (lihat QUEEN)
        if (m.map) m.map.anisotropy = 4;
        if (!m.isOutline) {
          if (m.emissive) { m.emissiveMap = ISABEL.glow > 0 ? m.map : null; m.emissive.copy(tint).multiplyScalar(ISABEL.glow); iMats.push(m); }
          if (m.shadeColorFactor) m.shadeColorFactor.lerp(tint, ISABEL.shadeWarm);
          if (m.parametricRimColorFactor) { m.parametricRimColorFactor.copy(rimC); m.parametricRimFresnelPowerFactor = ISABEL.rimPower; m.parametricRimLiftFactor = 0.05; }
          if (m.color && /Face_\d+_SKIN/i.test(m.name || '')) blushMats.push({ m, c: m.color.clone(), s: m.shadeColorFactor ? m.shadeColorFactor.clone() : null });
        }
        m.needsUpdate = true;
      }
    });
    const A = { em: vrm.expressionManager || null };
    // Tulang leher & kepala: dipakai untuk gerakan kepala kecil (mengangguk / miring) saat berbicara. Posisi awalnya disimpan supaya bisa kembali.
    A.neck = bone('J_Bip_C_Neck'); A.head = bone('J_Bip_C_Head');
    A.neckRest = A.neck ? A.neck.quaternion.clone() : null; A.headRest = A.head ? A.head.quaternion.clone() : null;
    A.eyeL = bone('J_Adj_L_FaceEye'); A.eyeR = bone('J_Adj_R_FaceEye');   // tulang bola mata: digerakkan sedikit supaya tatapan hidup
    A.eyeLRest = A.eyeL ? A.eyeL.quaternion.clone() : null; A.eyeRRest = A.eyeR ? A.eyeR.quaternion.clone() : null;
    A.has = n => !!(A.em && A.em.getExpression && A.em.getExpression(n));   // cek: apakah model punya ekspresi ini? (supaya tidak error)
    A.reset = () => {
      A.T = 0; A.blinkAt = 2.2; A.blinkT = -1; A.blinkV = 0;
      A.mouth = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };   // nilai mulut sekarang (0..1) untuk tiap bentuk huruf hidup
      A.seq = []; A.seqI = 0; A.seqT = 0; A.seqLen = 0;   // urutan bentuk mulut dari teks yang sedang diucapkan
      A.turn = 0; A.gx = 0; A.gy = 0; A.gtx = 0; A.gty = 0; A.gazeNext = 0; A.nodP = 0; A.nodNext = 0; A.tiltT = 0; A.tiltV = 0; A.wasTalk = false;
    };
    A.reset(); A.smileV = 0; A.blushMats = blushMats; A.blushV = 0; A.blushApplied = 0; A.shyV = 0; A.shyApplied = 0; iAnim = A;
    iSkins[key] = { fbx, IR, A };
    if (key !== iSkinKey) { IR = keep.IR; iAnim = keep.A; } else fbx.visible = true;
  };
  // ---------- Bicara natural: bentuk mulut dibuat dari HURUF pada kalimat ----------
  // Tiap huruf hidup (a, i, u, e, o) = satu bentuk mulut. Huruf mati = mulut menutup sedikit. Spasi = jeda pendek, tanda baca = jeda lebih panjang.
  // Hasilnya: [{ v: nama bentuk mulut | null, amp: seberapa lebar (0..1), d: lama (detik) }, ...]
  const VOWEL = { a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh' };
  const makeMouthSeq = (text, totalSec) => {
    const out = [];
    for (const ch of String(text).toLowerCase()) {
      if (VOWEL[ch]) out.push({ v: VOWEL[ch], amp: rnd(0.6, 1), d: 1 });          // huruf hidup: mulut terbuka
      else if (/[a-z]/.test(ch)) { if (out.length && out[out.length - 1].v) out.push({ v: null, amp: 0.15, d: 0.35 }); }   // huruf mati: mulut hampir menutup (hanya setelah huruf hidup)
      else if (/[,;:]/.test(ch)) out.push({ v: null, amp: 0, d: 3 });                 // koma: jeda sebentar
      else if (/[.!?…]/.test(ch)) out.push({ v: null, amp: 0, d: 6 });                // titik: jeda panjang
      else if (ch === ' ') out.push({ v: null, amp: 0, d: 0.6 });                     // spasi: jeda antar kata
    }
    const sum = out.reduce((a, o) => a + o.d, 0) || 1;
    for (const o of out) o.d = o.d / sum * totalSec;   // bagi rata supaya seluruh kalimat pas dengan lama bicara
    return out;
  };
  // kedip acak + senyum lembut + bicara + kepala bergerak halus. vrm.update tidak dipanggil (pose statis).
  // dt = selisih waktu antar frame (detik). Dipanggil dari update() saat di dalam aula, dan dari isabelUpdate() saat Isabel di luar.
  const stepIsabel = dt => {
    const A = iAnim; if (!A || !A.em) return;
    dt = Math.min(0.05, Math.max(0, dt)); A.T += dt; const T = A.T; let dirty = false;
    IS.talk = Math.max(0, IS.talk - dt);   // waktu bicara berkurang tiap frame; 0 = selesai bicara
    const talking = IS.talk > 0;
    // --- 1) KEDIP: lebih sering saat bicara; kelopak menutup cepat lalu membuka sedikit lebih lambat ---
    if (A.blinkT < 0 && T >= A.blinkAt) { A.blinkT = 0; A.blinkAt = T + (Math.random() < 0.15 ? 0.45 : (talking ? rnd(...ISABEL_FX.blinkTalk) : rnd(...ISABEL_FX.blinkIdle))); }
    let v = 0;
    if (A.blinkT >= 0) { A.blinkT += dt; const k = A.blinkT / 0.22; if (k >= 1) A.blinkT = -1; else v = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65; v = v * v * (3 - 2 * v); }   // v*v*(3-2v) = penghalus supaya tidak patah-patah
    v = Math.max(v, IS.kiss || 0);   // mata terpejam saat dicium
    if (v !== A.blinkV) { A.blinkV = v; A.em.setValue('blink', v); dirty = true; }
    // --- 2) MULUT: mulai urutan baru bila game menyuruh bicara (isabelSpeak), lalu putar satu per satu ---
    if (IS.speakReq) { A.seq = makeMouthSeq(IS.speakReq.text, IS.speakReq.sec); A.seqI = 0; A.seqT = 0; IS.speakReq = null; }
    let cur = null;
    if (A.seqI < A.seq.length) {
      let o = A.seq[A.seqI]; A.seqT += dt;
      while (A.seqT >= o.d && A.seqI < A.seq.length - 1) { A.seqT -= o.d; o = A.seq[++A.seqI]; }
      if (A.seqT >= o.d) A.seqI = A.seq.length; else cur = o;
    }
    const target = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    const shyK = A.shyV || 0;   // ekspresi malu / gugup (lihat isabelShy)
    if (cur && cur.v) { target[cur.v] = ISABEL_FX.mouthMax * cur.amp; if (cur.v !== 'aa') target.aa = ISABEL_FX.jaw * cur.amp; }   // huruf i/u/e/o: rahang ikut turun sedikit (aa) supaya bukaan mulut terlihat
    else if (!cur && talking) target.aa = 0.3 + 0.4 * Math.abs(Math.sin(T * 8));   // cadangan: bila tanpa teks, mulut bergerak biasa
    else if (cur) target.aa = cur.amp * 0.25;                            // huruf mati: celah kecil
    if (shyK > 0.001 && !cur && !(IS.kiss > 0.05)) target.oh = Math.max(target.oh, ISABEL_FX.shyMouth * shyK);   // mulut sedikit terbuka bulat saat gugup (tidak sedang bicara)
    const km = 1 - Math.exp(-dt * 22);   // kecepatan mulut mengikuti target (halus, tidak loncat)
    for (const n in target) {
      const nv = A.mouth[n] + (target[n] - A.mouth[n]) * km, vv = nv < 0.01 && target[n] === 0 ? 0 : nv;
      if (Math.abs(vv - A.mouth[n]) > 0.003 || (vv === 0 && A.mouth[n] !== 0)) { A.mouth[n] = vv; if (A.has(n)) A.em.setValue(n, vv); dirty = true; }
    }
    // --- 3) SENYUM: sedikit lebih lebar saat berbicara ---
    const base = (QW.st === 'seated' && IS.mode !== 'follow') ? ISABEL.smile : ISABEL.smileActive;
    const tg = (base + (talking ? 0.12 : 0)) * (1 - 0.85 * shyK), sv = A.smileV + (tg - A.smileV) * (1 - Math.exp(-dt * 2.5));
    if (Math.abs(sv - A.smileV) > 0.003) { A.smileV = sv; A.em.setValue('relaxed', sv); dirty = true; }
    // --- 3b) BLUSH: wajah memerah halus mengikuti IS.blush (0..1, diatur game.js lewat isabelBlush)
    { const bt = IS.blush || 0; A.blushV += (bt - A.blushV) * (1 - Math.exp(-dt * 2.5)); if (Math.abs(bt - A.blushV) < 0.004) A.blushV = bt;
      if (A.blushV !== A.blushApplied && A.blushMats) { A.blushApplied = A.blushV; const f = A.blushV * ISABEL_FX.blush; for (const o of A.blushMats) { o.m.color.copy(o.c).lerp(BLUSH_C, f); if (o.s) o.m.shadeColorFactor.copy(o.s).lerp(BLUSH_S, f); } } }
    { const st = IS.shy || 0; A.shyV += (st - A.shyV) * (1 - Math.exp(-dt * 4)); if (Math.abs(st - A.shyV) < 0.004) A.shyV = st;   // SEDIH-MALU: alis menurun & mata sedikit cemas (preset 'sad'), halus
      if (A.shyV !== A.shyApplied) { A.shyApplied = A.shyV; if (A.has('sad')) A.em.setValue('sad', A.shyV * ISABEL_FX.shySad); dirty = true; } }
    if (dirty) A.em.update();
    // --- 4) KEPALA: saat bicara mengangguk kecil mengikuti ritme kalimat & sedikit miring; saat diam kembali tegak ---
    if (A.head && A.headRest) {
      if (talking) { if (T >= A.nodNext) { A.nodP = 1; A.nodNext = T + rnd(0.7, 1.6); A.tiltT = rnd(-ISABEL_FX.tilt, ISABEL_FX.tilt); } }   // angguk baru tiap 0.7-1.6 detik
      A.nodP = Math.max(0, A.nodP - dt * 2.2);                       // angguk memudar
      A.tiltV += (A.tiltT - A.tiltV) * (1 - Math.exp(-dt * 3));      // miring halus ke target
      if (!talking) A.tiltT = 0;
      const nod = Math.sin(A.nodP * PI) * ISABEL_FX.nod * (talking ? 1 : 0);
      // toleh ke pemain (berbaring berdampingan, IS.look 0..1): kepala + leher berputar di sumbu tegak; pemain ada di sisi kanan Isabel (lokal -x), terbalik bila badannya diputar 180 derajat (IS.flip)
      const lt = -(IS.flip ? -1 : 1) * (IS.look || 0) * ISABEL_FX.turn; A.turn += (lt - A.turn) * (1 - Math.exp(-dt * 3));
      const qx = _qNod.setFromAxisAngle(_axX, nod), qz = _qTilt.setFromAxisAngle(_axZ, A.tiltV), qy = _qTurn.setFromAxisAngle(_axY, A.turn * 0.6);
      A.head.quaternion.copy(A.headRest).multiply(qy).multiply(qx).multiply(qz);
      if (A.neck && A.neckRest) A.neck.quaternion.copy(A.neckRest).multiply(_qTurn.setFromAxisAngle(_axY, A.turn * 0.4)).multiply(_qNod.setFromAxisAngle(_axX, nod * 0.4));   // leher ikut sedikit
    }
    // --- 5) MATA: tiap 1-3 detik bola mata melirik sedikit ke titik lain (lebih sering saat bicara), bergerak cepat lalu diam ---
    if (A.eyeL && A.eyeLRest && A.eyeR && A.eyeRRest) {
      if (T >= A.gazeNext) { A.gazeNext = T + (talking ? rnd(0.8, 2.2) : rnd(1.5, 3.5)); const g = ISABEL_FX.gaze; A.gtx = rnd(-g, g); A.gty = rnd(-g * 0.5, g * 0.5); if (Math.random() < 0.35) { A.gtx = 0; A.gty = 0; } }   // kadang kembali menatap lurus
      const ke = 1 - Math.exp(-dt * 14); A.gx += (A.gtx - A.gx) * ke; A.gy += (A.gty - A.gy) * ke;
      const qy = _qNod.setFromAxisAngle(_axY, A.gx), qx = _qTilt.setFromAxisAngle(_axX, A.gy);
      A.eyeL.quaternion.copy(A.eyeLRest).multiply(qy).multiply(qx); A.eyeR.quaternion.copy(A.eyeRRest).multiply(qy).multiply(qx);
    }
  };
  const BLUSH_C = new THREE.Color(1, 0.55, 0.6), BLUSH_S = new THREE.Color(0.9, 0.4, 0.45);   // warna kulit saat blush penuh (terang & bayangan); kekuatan = ISABEL_FX.blush
  const _qTurn = new THREE.Quaternion(), _qNod = new THREE.Quaternion(), _qTilt = new THREE.Quaternion(), _axX = new THREE.Vector3(1, 0, 0), _axZ = new THREE.Vector3(0, 0, 1), _axY = new THREE.Vector3(0, 1, 0);
  let isabelPjState = 0;   // skin baju tidur Isabel: 0 belum dimuat, 1 memuat, 2 siap, -1 gagal (tetap pakai gaun)
  const loadIsabelPajama = () => {   // dimuat di latar saat Isabel mulai ikut pemain (kemungkinan besar ikut ke penginapan)
    if (isabelPjState) return; isabelPjState = 1;
    new GLTFLoader().register(pl => new VRMLoaderPlugin(pl)).load(ISABEL.pajamaFile, gltf => {
      const k = { IR, A: iAnim };
      try { seatIsabel(gltf, 'pajama'); isabelPjState = 2; } catch (e) { IR = k.IR; iAnim = k.A; isabelPjState = -1; console.warn('Baju tidur Isabel gagal diberi pose:', e); }
    }, undefined, e => { isabelPjState = -1; console.warn(ISABEL.pajamaFile + ' gagal dimuat:', e); });
    console.info('Memuat skin baju tidur Isabel…');
  };
  const loadIsabel = () => {
    if (isabelState) return; isabelState = 1;
    new GLTFLoader().register(pl => new VRMLoaderPlugin(pl)).load(ISABEL.file, gltf => { try { seatIsabel(gltf); isabelState = 2; loadIsabelPajama(); } catch (e) { isabelState = -1; console.warn('Isabel gagal diberi pose:', e); } }, undefined, e => { isabelState = -1; console.warn(ISABEL.file + ' gagal dimuat:', e); });
  };

  // ---------- Perapian di kiri-kanan jalur karpet ----------
  const flameMat = Mt.flame, braziers = [];
  for (const s of [-1, 1]) { const g = new THREE.Group(); g.position.set(BRAZIER.x, Y, s * BRAZIER.z); group.add(g);
    add(cyl(0.45, 0.6, 0.35, 10), Mt.stonePlain, 0, 0.18, 0, g); add(cyl(0.16, 0.22, 1.0, 8), Mt.iron, 0, 0.85, 0, g); add(cyl(0.7, 0.4, 0.45, 12), Mt.iron, 0, 1.55, 0, g);
    const f = add(new THREE.ConeGeometry(0.4, 1.0, 7), flameMat, 0, 2.05, 0, g); braziers.push(f); }

  // ---------- Lampu gantung: cincin emas, rantai, lilin & nyala memakai InstancedMesh ----------
  const nCand = 12, candGeo = cyl(0.06, 0.06, 0.32, 6), flGeo = new THREE.SphereGeometry(0.085, 6, 5), candles = [], flameI = [];
  const chand = (c, hh) => {
    const gy = Y + hh - 2.6; add(cyl(0.03, 0.03, 2.4, 5), Mt.iron, c.x, gy + 1.5, c.z);
    const ring = add(new THREE.TorusGeometry(1.5, 0.07, 6, 28), Mt.gold, c.x, gy, c.z); ring.rotation.x = PI / 2; const r2 = add(new THREE.TorusGeometry(0.8, 0.06, 6, 20), Mt.gold, c.x, gy + 0.35, c.z); r2.rotation.x = PI / 2;
    for (let k = 0; k < 4; k++) { const a = k * PI / 2, sp = add(cyl(0.02, 0.02, 1.0, 4), Mt.gold, c.x + Math.cos(a) * 0.75, gy + 0.17, c.z + Math.sin(a) * 0.75); sp.rotation.z = Math.PI / 2; sp.rotation.y = -a; }
    add(new THREE.SphereGeometry(0.22, 10, 8), Mt.gold, c.x, gy - 0.35, c.z);
    for (let k = 0; k < nCand; k++) { const a = k / nCand * PI * 2; candles.push([c.x + Math.cos(a) * 1.5, gy + 0.2, c.z + Math.sin(a) * 1.5]); flameI.push([c.x + Math.cos(a) * 1.5, gy + 0.46, c.z + Math.sin(a) * 1.5]); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2 + 0.3; candles.push([c.x + Math.cos(a) * 0.8, gy + 0.55, c.z + Math.sin(a) * 0.8]); flameI.push([c.x + Math.cos(a) * 0.8, gy + 0.8, c.z + Math.sin(a) * 0.8]); } };
  for (const c of CHANDELIERS) chand(c, H);

  // ======================================================================
  //  SAYAP: RUANG DEWAN (kiri, z negatif) & PERPUSTAKAAN KERAJAAN (kanan, z positif). Pintu lengkung di dinding samping aula (x = SIDE_DOOR.x).
  // ======================================================================
  const RH = 10.4, rx0 = ROOM_X.x0, rx1 = ROOM_X.x1, rxc = ROOM_X.xc, rw = rx1 - rx0, RD = 11;
  const mkCarpet = base => ctex(256, 256, (x, sz) => { x.fillStyle = base; x.fillRect(0, 0, sz, sz); x.fillStyle = '#d9b24a'; x.fillRect(0, 10, sz, 8); x.fillRect(0, sz - 18, sz, 8); x.fillRect(0, 26, sz, 3); x.fillRect(0, sz - 29, sz, 3);
    x.strokeStyle = 'rgba(217,178,74,.7)'; x.lineWidth = 3; for (let c = 0; c < 2; c++) { const cx = 64 + c * 128; x.beginPath(); x.moveTo(cx, 60); x.lineTo(cx + 40, 128); x.lineTo(cx, 196); x.lineTo(cx - 40, 128); x.closePath(); x.stroke(); } });
  const blueCarpT = mkCarpet('#27408b');
  const mapT = ctex(512, 320, (x, w, h) => {   // peta Kota Kekaisaran (segi lima, 5 distrik, istana di tengah)
    x.fillStyle = '#d8c28a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(120,90,40,${rnd(0.02, 0.08)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(1, 4), rnd(1, 4)); }
    x.strokeStyle = '#5b3d22'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16); x.lineWidth = 2; x.strokeRect(18, 18, w - 36, h - 36);
    const cx = w / 2, cy = h / 2 + 14, R = 112, v = k => [cx + R * Math.sin(k * 2 * PI / 5), cy - R * Math.cos(k * 2 * PI / 5)];
    x.fillStyle = 'rgba(120,150,90,.35)'; x.beginPath(); for (let k = 0; k < 5; k++) { const [a, b] = v(k); k ? x.lineTo(a, b) : x.moveTo(a, b); } x.closePath(); x.fill(); x.strokeStyle = '#4a2a1a'; x.lineWidth = 5; x.stroke();
    x.lineWidth = 2; for (let k = 0; k < 5; k++) { const [a, b] = v(k); x.beginPath(); x.moveTo(cx, cy); x.lineTo(a, b); x.stroke(); }
    x.beginPath(); x.arc(cx, cy, 38, 0, 7); x.stroke(); x.fillStyle = '#b8322a'; x.beginPath(); x.arc(cx, cy, 11, 0, 7); x.fill();
    x.fillStyle = '#3a2412'; x.font = 'bold 16px serif'; x.textAlign = 'center'; for (let k = 0; k < 5; k++) { const [a, b] = v(k); x.fillText(String(k + 1), cx + (a - cx) * 1.2, cy + (b - cy) * 1.2 + 5); }
    x.font = 'bold 26px serif'; x.fillText('KOTA KEKAISARAN', cx, 52); x.font = 'italic 14px serif'; x.fillText('Lima Distrik · Satu Mahkota', cx, 74); });
  const globeT = ctex(128, 64, (x, w, h) => { x.fillStyle = '#2f6fb0'; x.fillRect(0, 0, w, h); x.fillStyle = '#5a9a4a'; for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(rnd(0, w), rnd(10, h - 10), rnd(8, 20), rnd(5, 11), rnd(0, 3), 0, 7); x.fill(); } });
  const mkBooks = () => ctex(256, 256, (x, w, h) => {   // rak buku: 5 papan, tiap papan penuh punggung buku warna-warni
    x.fillStyle = '#3b2414'; x.fillRect(0, 0, w, h); const cols = ['#7a1f2b', '#1f3a7a', '#2f6a3a', '#8a6a2a', '#5a2a6a', '#a8742a', '#2a5a6a', '#6a2a1a'];
    for (let r = 0; r < 5; r++) { let px = 5; const top = r * 51 + 6; while (px < w - 8) { const bw = rnd(7, 15), bh = rnd(32, 44); x.fillStyle = cols[(Math.random() * cols.length) | 0]; x.fillRect(px, top + (44 - bh) + 2, bw, bh); x.fillStyle = 'rgba(217,178,74,.7)'; x.fillRect(px + 1, top + (44 - bh) + 8, bw - 2, 2); px += bw + 1; } x.fillStyle = '#5a3a20'; x.fillRect(0, top + 46, w, 5); } });
  const bookMs = [mkBooks(), mkBooks()].map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  const woodRoughM = Mt.wood, velvetBlue = std(0x27408b, { roughness: 1 });
  const archWin = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, Y + 3.4, z); g.rotation.y = ry; group.add(g);
    add(new THREE.ShapeGeometry(archShape(1.0, 3.4)), Mt.window, 0, 0, 0, g);
    for (const e of [-1, 1]) add(box(0.14, 3.4, 0.12), Mt.stoneDark, e * 1.0, 1.7, 0.03, g); add(box(2.1, 0.14, 0.12), Mt.stoneDark, 0, 0, 0.03, g); add(box(2.1, 0.12, 0.12), Mt.stoneDark, 0, 2.2, 0.03, g); add(box(0.1, 4.4, 0.1), Mt.stoneDark, 0, 2.2, 0.04, g);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 6, 16, PI), Mt.gold); arch.position.set(0, 3.4, 0.04); g.add(arch); };
  const chair = (x, z, ry, big = false) => {
    const g = new THREE.Group(); g.position.set(x, Y, z); g.rotation.y = ry; group.add(g);   // menghadap +z lokal; sandaran di belakang (-z)
    add(box(0.56, 0.1, 0.56), Mt.velvet, 0, 0.52, 0, g); add(box(0.6, 0.06, 0.6), Mt.wood, 0, 0.45, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.06, 0.45, 0.06), Mt.wood, sx * 0.25, 0.22, sz * 0.25, g);
    const bh = big ? 1.5 : 0.85; add(box(0.6, bh, 0.07), Mt.wood, 0, 0.5 + bh / 2, -0.27, g); add(box(0.46, bh - 0.2, 0.04), Mt.velvet, 0, 0.5 + bh / 2, -0.22, g);
    if (big) { add(box(0.7, 0.08, 0.1), Mt.gold, 0, 0.5 + bh, -0.27, g); add(new THREE.ConeGeometry(0.1, 0.3, 5), Mt.gold, 0, 0.5 + bh + 0.2, -0.27, g); } };
  const candlestick = (x, y, z) => { add(cyl(0.05, 0.08, 0.3, 6), Mt.gold, x, y + 0.15, z); add(cyl(0.035, 0.035, 0.18, 6), Mt.cream, x, y + 0.39, z); const f = add(flameGeo, Mt.flame, x, y + 0.58, z); f.scale.set(0.6, 0.7, 0.6); flames.push(f); };
  const frame = (x, y, z, w, h, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; group.add(g); for (const e of [-1, 1]) { add(box(w + 0.3, 0.16, 0.12), Mt.gold, 0, e * (h / 2 + 0.08), 0, g); add(box(0.16, h, 0.12), Mt.gold, e * (w / 2 + 0.08), 0, 0, g); } };
  const doorFrame = (z, ry) => { const g = new THREE.Group(); g.position.set(SIDE_DOOR.x, Y, z); g.rotation.y = ry; group.add(g); const a = new THREE.Mesh(new THREE.TorusGeometry(SIDE_DOOR.hw, 0.14, 8, 22, PI), Mt.gold); a.position.set(0, SIDE_DOOR.hy, 0); g.add(a); for (const e of [-1, 1]) add(box(0.28, SIDE_DOOR.hy, 0.3), Mt.gold, e * SIDE_DOOR.hw, SIDE_DOOR.hy / 2, 0, g); };
  const doorSill = (s) => add(box(SIDE_DOOR.hw * 2, 0.02, 1.4), Mt.gold, SIDE_DOOR.x, Y + 0.012, s * 17.0);

  for (const s of [-1, 1]) {
    const zc = s * 23, zo = s * 28.5, zh = s * 17.5;
    plane(rw, RD, floorMat(rw / 4, RD / 4), rxc, Y, zc); plane(rw, RD, Mt.ceiling, rxc, Y + RH, zc, true);
    // dinding: luar, dua ujung, dan sisi aula (tebal 0,6 agar rapat dengan dinding aula; lubang pintu lengkung)
    add(box(rw + 0.8, RH, WT, 3.2), Mt.wall, rxc, Y + RH / 2, s * (28.5 + WT / 2));
    add(box(WT, RH, RD + 0.8, 3.2), Mt.wall, rx0 - WT / 2, Y + RH / 2, zc); add(box(WT, RH, RD + 0.8, 3.2), Mt.wall, rx1 + WT / 2, Y + RH / 2, zc);
    { const m = wallWithArch(rw + 0.8, RH, SIDE_DOOR.hw, SIDE_DOOR.hy, wallExtM, s * (SIDE_DOOR.x - rxc), 0.6); m.position.set(rxc, Y, s * 16.9); if (s < 0) m.rotation.y = PI; group.add(m); }
    // panel kayu + pita emas + kornis di tiap dinding dalam
    const wains = (cx, cz, sx, sz) => { add(box(sx, 2.4, sz), Mt.wood, cx, Y + 1.2, cz); add(box(sx > sz ? sx : 0.2, 0.14, sx > sz ? 0.2 : sz), Mt.gold, cx, Y + 2.45, cz); };
    wains(rxc, s * (28.5 - 0.07), rw, 0.14); wains(rx0 + 0.07, zc, 0.14, RD); wains(rx1 - 0.07, zc, 0.14, RD);
    for (const [cx, len] of [[(rx0 + SIDE_DOOR.x - SIDE_DOOR.hw) / 2, SIDE_DOOR.x - SIDE_DOOR.hw - rx0], [(SIDE_DOOR.x + SIDE_DOOR.hw + rx1) / 2, rx1 - SIDE_DOOR.x - SIDE_DOOR.hw]]) wains(cx, s * (17.5 + 0.07), len, 0.14);
    add(box(rw, 0.4, 0.36), Mt.stoneDark, rxc, Y + RH - 0.2, s * (28.5 - 0.18)); add(box(0.36, 0.4, RD), Mt.stoneDark, rx0 + 0.18, Y + RH - 0.2, zc); add(box(0.36, 0.4, RD), Mt.stoneDark, rx1 - 0.18, Y + RH - 0.2, zc); add(box(rw, 0.4, 0.36), Mt.stoneDark, rxc, Y + RH - 0.2, s * (17.5 + 0.18));
    for (const x of [0, rxc, 10.3]) add(box(0.5, 0.6, RD), Mt.wood, x, Y + RH - 0.3, zc); add(box(rw, 0.4, 0.5), Mt.wood, rxc, Y + RH - 0.2, zc);
    // pintu lengkung dari kedua sisi (bingkai emas) + ambang
    doorFrame(s * 16.42, s > 0 ? PI : 0); doorFrame(s * 17.42, s > 0 ? 0 : PI); doorSill(s);
    // lampu gantung, obor, panji
    chand({ x: rxc, z: zc }, RH);
    for (const dz of [-3.6, 3.6]) { torch(rx0 + 0.25, Y + 3.4, zc + dz, PI / 2); torch(rx1 - 0.25, Y + 3.4, zc + dz, -PI / 2); }
    for (const x of [-0.5, 10.7]) torch(x, Y + 3.4, s * (17.5 + 0.25), s > 0 ? 0 : PI);
    banner(rx0 + 0.06, Y + 6.8, zc, 1.8, 4.4, PI / 2);
  }

  // ---------- RUANG DEWAN (kiri) ----------
  { const s = -1, zc = DEWAN.zc;
    archWin(rxc - 4.6, s * (28.5 - 0.02), 0); archWin(rxc + 4.6, s * (28.5 - 0.02), 0);   // jendela di kiri-kanan peta
    { const m = add(new THREE.PlaneGeometry(7.2, 4.5), new THREE.MeshStandardMaterial({ map: mapT, roughness: 0.9 }), rxc, Y + 5.6, s * (28.5 - 0.06)); void m; frame(rxc, Y + 5.6, s * (28.5 - 0.1), 7.2, 4.5, 0); }
    add(new THREE.PlaneGeometry(11.5, 5.4).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: rep(carpetT, 11.5 / 4, 1), roughness: 1 }), rxc, Y + 0.015, zc);   // karpet di bawah meja
    const T = DEWAN.table, ty = Y + 1.0;
    add(box(T.len, 0.16, T.w), Mt.wood, T.x, ty, zc); add(box(T.len + 0.12, 0.05, T.w + 0.12), Mt.gold, T.x, ty - 0.1, zc); add(box(T.len - 1.2, 0.015, 0.7), velvetBlue, T.x, ty + 0.09, zc);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.28, 0.95, 0.28), Mt.wood, T.x + sx * (T.len / 2 - 0.4), Y + 0.47, zc + sz * (T.w / 2 - 0.3));
    for (const dx of [-2.4, 0, 2.4]) candlestick(T.x + dx, ty + 0.09, zc);
    for (const dx of [-1.2, 1.2]) { add(box(0.7, 0.02, 0.5), Mt.cream, T.x + dx, ty + 0.1, zc + 0.5).rotation.y = dx * 0.1; add(box(0.5, 0.02, 0.4), Mt.cream, T.x + dx * 1.7, ty + 0.1, zc - 0.55).rotation.y = -dx * 0.12; }
    DEWAN.chairs.forEach((c, i) => chair(c.x, c.z, c.ry, i >= DEWAN.chairs.length - 2));
    { // perapian di dinding ujung (x = 13,5): menghadap -x
      const g = new THREE.Group(); g.position.set(DEWAN.fireplace.x, Y, DEWAN.fireplace.z); g.rotation.y = -PI / 2; group.add(g);
      add(box(3.4, 0.3, 1.2), Mt.stonePlain, 0, 0.15, 0.4, g); for (const e of [-1, 1]) add(box(0.55, 2.6, 0.95), Mt.stonePlain, e * 1.3, 1.6, 0.3, g);
      add(box(3.2, 0.6, 0.95), Mt.stonePlain, 0, 3.0, 0.3, g); add(box(3.7, 0.14, 1.2), Mt.stoneDark, 0, 3.4, 0.4, g); add(box(2.4, RH - 3.4, 0.6), Mt.stonePlain, 0, 3.4 + (RH - 3.4) / 2, 0.1, g);
      add(box(2.1, 2.3, 0.15), Mt.iron, 0, 1.5, 0.0, g);
      for (const e of [-1, 1]) { const lg = add(cyl(0.14, 0.14, 1.5, 7), Mt.wood, e * 0.2, 0.42, 0.45, g); lg.rotation.z = PI / 2 + e * 0.2; }
      for (const [fx, sc] of [[-0.45, 0.8], [0, 1.15], [0.45, 0.85]]) { const f = add(new THREE.ConeGeometry(0.34, 1.0, 7), Mt.flame, fx, 0.95, 0.4, g); f.scale.set(sc, sc, sc); braziers.push(f); }
      add(new THREE.PlaneGeometry(1.5, 2.3), bannerM, 0, 5.3, 0.42, g); }
  }

  // ---------- PERPUSTAKAAN KERAJAAN (kanan) ----------
  { const s = 1, zc = PERPUS.zc;
    archWin(rxc, s * (28.5 - 0.02), PI);
    const unit = (x, z, ry, mi) => { const g = new THREE.Group(); g.position.set(x, Y, z); g.rotation.y = ry; group.add(g);   // satu unit rak lebar 2 m, menghadap +z lokal
      add(box(2.0, 4.9, 0.6), Mt.wood, 0, 2.45, -0.3, g); add(new THREE.PlaneGeometry(1.84, 4.5), bookMs[mi], 0, 2.4, 0.005, g); for (const e of [-1, 1]) add(box(0.08, 4.9, 0.64), Mt.goldDim, e * 1.0, 2.45, -0.3, g); add(box(2.1, 0.14, 0.7), Mt.gold, 0, 4.95, -0.3, g); };
    let k = 0; for (const x0 of [-2.9, 7.2]) for (let i = 0; i < 3; i++) unit(x0 + 1 + i * 2, s * 28.5, PI, (k++) % 2);                                  // dinding luar (jendela di tengah)
    for (let i = 0; i < 5; i++) { unit(rx0, zc - 5 + 1 + i * 2, PI / 2, (k++) % 2); unit(rx1, zc - 5 + 1 + i * 2, -PI / 2, (k++) % 2); }               // kedua dinding ujung
    add(new THREE.PlaneGeometry(14.5, 5.2).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: rep(blueCarpT, 14.5 / 4, 1), roughness: 1 }), rxc + 1.2, Y + 0.015, 22.2);
    for (const t of PERPUS.tables) {
      add(box(2.6, 0.12, 1.3), Mt.wood, t.x, Y + 0.95, t.z); add(box(2.7, 0.05, 1.4), Mt.gold, t.x, Y + 0.87, t.z); for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.14, 0.92, 0.14), Mt.wood, t.x + sx * 1.15, Y + 0.46, t.z + sz * 0.5);
      candlestick(t.x, Y + 1.01, t.z); for (const [dx, c] of [[-0.8, 0x7a1f2b], [0.7, 0x1f3a7a]]) add(box(0.4, 0.07, 0.3), std(c), t.x + dx, Y + 1.04, t.z + 0.1).rotation.y = dx * 0.3; add(box(0.5, 0.025, 0.36), Mt.cream, t.x + 0.1, Y + 1.03, t.z - 0.3);
      for (const dx of [-0.7, 0.7]) { chair(t.x + dx, t.z + 1.05, PI); chair(t.x + dx, t.z - 1.05, 0); } }
    { const g = PERPUS.globe; add(cyl(0.45, 0.55, 0.12, 12), Mt.wood, g.x, Y + 0.06, g.z); add(cyl(0.1, 0.12, 0.9, 8), Mt.wood, g.x, Y + 0.55, g.z);
      const ring = add(new THREE.TorusGeometry(0.66, 0.035, 6, 24), Mt.gold, g.x, Y + 1.35, g.z); ring.rotation.y = 0.5; ring.rotation.x = 0.3;
      add(new THREE.SphereGeometry(0.55, 20, 14), new THREE.MeshStandardMaterial({ map: globeT, roughness: 0.6 }), g.x, Y + 1.35, g.z); }
    { const lad = new THREE.Group(); lad.position.set(0.3, Y, 28.5 - 0.95); lad.rotation.x = -0.18; group.add(lad); for (const e of [-1, 1]) add(box(0.07, 4.3, 0.07), Mt.wood, e * 0.32, 2.15, 0, lad); for (let i = 0; i < 9; i++) add(box(0.64, 0.05, 0.06), Mt.wood, 0, 0.4 + i * 0.46, 0, lad); }
  }
  // cahaya hangat tambahan di bawah lampu gantung & perapian ruang sayap (digambar di bawah, di blok glow)
  { const im = new THREE.InstancedMesh(candGeo, Mt.cream, candles.length), fm = new THREE.InstancedMesh(flGeo, Mt.flame, flameI.length), d = new THREE.Object3D();
    candles.forEach((p, i) => { d.position.set(p[0], p[1], p[2]); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); flameI.forEach((p, i) => { d.position.set(p[0], p[1], p[2]); d.scale.set(1, 1.5, 1); d.updateMatrix(); fm.setMatrixAt(i, d.matrix); }); group.add(im, fm); }


  // ======================================================================
  //  LANTAI 2: galeri berpagar di kedua sisi aula (z = ±9,65 … ±16,5) + 5 kamar tidur; dua tangga lurus di bagian depan aula (data: kekaisaran-istana-layout.js, F2_*).
  //  Semua tinggi di grup U relatif terhadap lantai atas (U.position.y = F2.h).
  // ======================================================================
  const Y2 = Y + F2.h, U = new THREE.Group(); U.position.y = F2.h; group.add(U);
  const au = (geo, mat, x, y, z, p = U) => add(geo, mat, x, Y + y, z, p);
  const plaster = std(0xe9dcc0, { roughness: 0.95 }), linen = std(0xf0e8d8, { roughness: 1 });
  const roomFloor = (w, d) => new THREE.MeshStandardMaterial({ map: rep(woodT, w / 1.2, d / 1.2), color: 0xc89a6a, roughness: 0.6 });
  const roomCeil = (w, d) => new THREE.MeshStandardMaterial({ map: rep(ceilT, w / 2.5, d / 2.5), roughness: 1 });
  const candle = (p, x, y, z) => { au(cyl(0.05, 0.08, 0.3, 6), Mt.gold, x, y + 0.15, z, p); au(cyl(0.035, 0.035, 0.18, 6), Mt.cream, x, y + 0.39, z, p); const f = au(flameGeo, Mt.flame, x, y + 0.58, z, p); f.scale.set(0.6, 0.7, 0.6); flames.push(f); };
  const as = (geo, mat, x, y, z) => add(geo, mat, x, Y + y, z, group);   // sama seperti au, tetapi y relatif LANTAI 1 (tangga naik dari lantai 1, bukan dari lantai atas)
  const slabL = F2.x1 - F2.x0, slabCx = (F2.x0 + F2.x1) / 2;
  for (const s of [-1, 1]) {
    const zc = s * (F2.rail + 16.5) / 2, zl = 16.5 - F2.rail;
    au(box(slabL, F2.slabT, zl), Mt.stonePlain, slabCx, -F2.slabT / 2, zc); au(box(slabL, 0.16, 0.24), Mt.gold, slabCx, -0.1, s * F2.rail);
    plane(slabL, F2.wallZ - F2.rail, floorMat(slabL / 4, (F2.wallZ - F2.rail) / 4), slabCx, Y2 + 0.006, s * (F2.rail + F2.wallZ) / 2);
    // pagar balustrade di sisi aula
    au(box(slabL, 0.1, 0.18), Mt.gold, slabCx, 1.05, s * F2.rail); au(box(slabL, 0.08, 0.1), Mt.goldDim, slabCx, 0.2, s * F2.rail);
    for (let x = F2.x0 + 0.3; x < F2.x1; x += 0.8) au(cyl(0.04, 0.05, 1.0, 6), Mt.gold, x, 0.55, s * F2.rail);
    // tangga BERBELOK (L): lari bawah menghadap tengah aula (sepanjang z) -> bordes -> lari atas sepanjang +x ke galeri. Balok padat per anak tangga + karpet; pagar miring.
    const sc = s * (F2.sz0 + F2.sz1) / 2, sw = F2.sz1 - F2.sz0, lw = F2.lx1 - F2.lx0, lcx = (F2.lx0 + F2.lx1) / 2, R = F2.rise;
    for (let k = 0; k < F2.n1 - 1; k++) { const h = (k + 1) * R, z = s * (F2.foot + (k + 0.5) * F2.run1); as(box(lw, h, F2.run1), Mt.stonePlain, lcx, h / 2, z); as(box(1.3, 0.025, F2.run1 * 0.96), Mt.velvet, lcx, h + 0.012, z); }   // lari bawah
    { const h = F2.n1 * R; as(box(lw, h, sw), Mt.stonePlain, lcx, h / 2, sc); as(box(1.5, 0.025, 1.5), Mt.velvet, lcx, h + 0.012, sc); }                                                                              // bordes
    for (let j = 0; j < F2.n2; j++) { const h = (F2.n1 + j + 1) * R, x = F2.lx1 + (j + 0.5) * F2.run2; as(box(F2.run2, h, sw), Mt.stonePlain, x, h / 2, sc); as(box(F2.run2 * 0.96, 0.025, 1.3), Mt.velvet, x, h + 0.012, sc); }   // lari atas
    // pagar miring: lari bawah (di x = lx0 & lx1), lari atas (di |z| = sz0 & sz1), pagar datar di sisi luar bordes
    { const dz = (F2.n1 - 1) * F2.run1, dy = (F2.n1 - 1) * R, ang = Math.atan2(dy, dz), len = Math.hypot(dy, dz), mz = s * (F2.foot + F2.sz0) / 2, my = (0.5 * R + (F2.n1 - 0.5) * R) / 2 + 1.0;
      for (const xx of [F2.lx0 + 0.05, F2.lx1 - 0.05]) { as(box(0.14, 0.1, len), Mt.gold, xx, my, mz).rotation.x = -s * ang;
        for (let k = 1; k < F2.n1 - 1; k += 3) as(cyl(0.035, 0.04, 1.0, 6), Mt.gold, xx, (k + 1) * R + 0.5, s * (F2.foot + (k + 0.5) * F2.run1)); } }
    { const dx = F2.stairX1 - F2.lx1, dy = F2.n2 * R, ang = Math.atan2(dy, dx), len = Math.hypot(dy, dx), mx = (F2.lx1 + F2.stairX1) / 2, my = ((F2.n1 + 0.5) * R + (F2.steps + 0.5) * R) / 2 + 1.0;
      for (const e of [F2.sz0, F2.sz1]) { const zz = s * (e + (e === F2.sz0 ? 0.05 : -0.05)); as(box(len, 0.1, 0.14), Mt.gold, mx, my, zz).rotation.z = ang;
        for (let j = 1; j < F2.n2; j += 3) as(cyl(0.035, 0.04, 1.0, 6), Mt.gold, F2.lx1 + (j + 0.5) * F2.run2, (F2.n1 + j + 1) * R + 0.5, zz); } }
    { const hb = F2.n1 * R, zz = s * (F2.sz1 - 0.05); as(box(lw, 0.1, 0.14), Mt.gold, lcx, hb + 1.0, zz);
      for (let x = F2.lx0 + 0.3; x < F2.lx1; x += 0.6) as(cyl(0.035, 0.04, 1.0, 6), Mt.gold, x, hb + 0.5, zz); }
    for (const [px, pz] of [[F2.lx0 + 0.15, F2.foot - 0.1], [F2.lx1 - 0.15, F2.foot - 0.1]]) as(box(0.3, 1.4, 0.3), Mt.gold, px, 0.7, s * pz);                      // tiang kaki tangga
    for (const px of [F2.lx0 + 0.15, F2.lx1 - 0.1]) as(box(0.26, 1.3, 0.26), Mt.gold, px, F2.n1 * R + 0.65, s * (F2.sz1 - 0.1));                                       // tiang sudut bordes
    banner(-9.2, Y + 8.4, s * (16.5 - 0.06), 1.5, 4.0, s > 0 ? PI : 0);
  }
  // ---- dinding depan galeri (z = ±12): UTUH dari lantai atas sampai langit-langit aula (tanpa sekat / celah), dengan pintu kamar yang selalu TERTUTUP.
  //      Melangkah ke depan pintu = layar memudar & pindah ke ruang kamar yang lebar & terpisah (lihat RUANG KAMAR di bawah).
  { const WH2 = H - F2.h, hw = F2_DOOR.hw, dh = F2_DOOR.h;
    for (const s of [-1, 1]) {
      const zf = s * F2.wallZ, zg = s * (F2.wallZ - F2.wallT / 2), sd = s > 0 ? PI : 0;   // zg = muka dinding di sisi galeri; sd = putaran agar papan menghadap galeri
      au(box(slabL, F2.ceil, F2.wallT), plaster, slabCx, F2.ceil / 2, zf);
      // dinding ujung barat (x = x0, dari dinding depan galeri sampai dinding luar z = ±16,5): menutup rongga di belakang dinding galeri dan terlihat dari tangga; naik sampai langit-langit
      { const cl = 16.5 - F2.wallZ + 0.1, cz = s * (F2.wallZ + 16.5) / 2; au(box(F2.wallT, WH2, cl, 3.2), Mt.wall, F2.x0 - F2.wallT / 2, WH2 / 2, cz); au(box(F2.wallT + 0.1, 0.16, cl), Mt.gold, F2.x0 - F2.wallT / 2, 0.08, cz); }
      au(box(slabL, WH2 - F2.ceil, F2.wallT, 3.2), Mt.wall, slabCx, F2.ceil + (WH2 - F2.ceil) / 2, zf);
      au(box(slabL, 0.2, 0.5), Mt.stoneDark, slabCx, F2.ceil, s * (F2.wallZ - 0.1));      // kornis pemisah plester / batu
      au(box(slabL - 0.2, 1.1, 0.06), Mt.wood, slabCx, 0.55, zg - s * 0.03); au(box(slabL - 0.2, 0.1, 0.1), Mt.gold, slabCx, 1.12, zg - s * 0.05);   // wainscot kayu + pita emas
      for (const r of F2_ROOMS.filter(q => q.s === s)) {
        const cx = r.cx, dz = zg - s * 0.1;                                                  // daun pintu menempel di muka dinding (sisi galeri)
        for (const e of [-1, 1]) {
          au(box(hw - 0.04, dh - 0.05, 0.1), Mt.wood, cx + e * hw / 2, (dh - 0.05) / 2, dz);                                          // daun pintu (ganda, tertutup)
          au(box(hw - 0.4, dh - 0.7, 0.05), std(r.color, { roughness: 0.8 }), cx + e * hw / 2, dh / 2, dz - s * 0.06);                // panel berwarna kamar
          au(box(hw - 0.3, 0.06, 0.07), Mt.gold, cx + e * hw / 2, dh / 2 + (dh - 0.7) / 2 + 0.04, dz - s * 0.07); au(box(hw - 0.3, 0.06, 0.07), Mt.gold, cx + e * hw / 2, dh / 2 - (dh - 0.7) / 2 - 0.04, dz - s * 0.07);
          au(new THREE.SphereGeometry(0.07, 8, 6), Mt.gold, cx + e * 0.14, 1.1, dz - s * 0.1);                                        // gagang
        }
        for (const e of [-1, 1]) au(box(0.24, dh, 0.3), Mt.gold, cx + e * (hw + 0.08), dh / 2, zg - s * 0.1);                         // bingkai emas
        au(box(hw * 2 + 0.6, 0.26, 0.3), Mt.gold, cx, dh + 0.13, zg - s * 0.1);
        const pt = ctex(512, 96, (x, ww, hh) => { x.fillStyle = '#1a2348'; x.fillRect(0, 0, ww, hh); x.strokeStyle = '#d9b24a'; x.lineWidth = 6; x.strokeRect(4, 4, ww - 8, hh - 8); x.fillStyle = '#f1d27a'; x.font = 'bold 48px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(r.name.toUpperCase(), ww / 2, hh / 2 + 3); });
        { const m = au(new THREE.PlaneGeometry(2.0, 0.375), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.8 }), cx, dh + 0.75, zg - s * 0.02); m.rotation.y = sd; }
        torch(r.x1 - 0.9, Y2 + 2.4, s * (F2.wallZ - 0.32), s > 0 ? PI : 0);
      }
    } }
  // bercak cahaya hangat di lantai galeri
  { const wT = ctex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,214,140,0.6)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
    const wM = new THREE.MeshBasicMaterial({ map: wT, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const s of [-1, 1]) add(new THREE.PlaneGeometry(14, 3.4).rotateX(-PI / 2), wM, 6, Y2 + 0.04, s * 10.8); }

  // ======================================================================
  //  RUANG KAMAR (lebar, terpisah): kelima kamar memakai ruang yang sama di bawah tanah istana (lantai di Y + KAMAR.dy); hanya satu yang dibangun & tampil pada satu waktu
  //  (dibangun saat pertama kali dimasuki). Masuk lewat pintu tertutup di galeri (enterRoom), keluar lewat pintu tertutup di dinding barat kamar (leaveRoom).
  //  Perabot: KAMAR_FURN (kekaisaran-istana-layout.js). Semua tinggi perabot dihitung dari lantai kamar (grup perabot berada di y = KY, TANPA menambah Y lagi).
  // ======================================================================
  const KR = KAMAR_RECT, KY = Y + KAMAR.dy, KH = KAMAR.h, kcx = KAMAR.cx, kcz = KAMAR.cz, kdHW = KAMAR.doorHW, kdH = KAMAR.doorH, KW = KAMAR.W, KD = KAMAR.D;
  const roomById = Object.fromEntries(F2_ROOMS.map(r => [r.id, r])), roomGroups = {}; let curRoom = null, mainKids = [];
  const faceLocal = (dx, dz) => { const a = toWorld(0, 0), b = toWorld(dx, dz); return Math.atan2(b.x - a.x, b.z - a.z); };   // sudut hadap pemain untuk arah (dx, dz) di koordinat lokal kota
  const roomGlowM = (() => { const t = ctex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,214,140,0.6)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); })();
  const buildRoom = r => {
    const g = new THREE.Group(); g.name = 'kamar-' + r.id; g.visible = false; group.add(g);
    const R = (geo, mat, x, y, z, p = g) => add(geo, mat, x, KY + y, z, p);   // y relatif lantai kamar
    const wallC = new THREE.Color(r.color).lerp(new THREE.Color(0xf3ead6), 0.78), wallM = new THREE.MeshStandardMaterial({ map: stone, color: wallC, roughness: 0.95 });
    const rc = (p, x, y, z) => { add(cyl(0.05, 0.08, 0.3, 6), Mt.gold, x, y + 0.15, z, p); add(cyl(0.035, 0.035, 0.18, 6), Mt.cream, x, y + 0.39, z, p); const f = add(flameGeo, Mt.flame, x, y + 0.58, z, p); f.scale.set(0.6, 0.7, 0.6); flames.push(f); };
    // lantai & langit-langit
    R(new THREE.PlaneGeometry(KW, KD).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: rep(woodT, KW / 1.2, KD / 1.2), color: 0xc89a6a, roughness: 0.6 }), kcx, 0.006, kcz);
    R(new THREE.PlaneGeometry(KW, KD).rotateX(PI / 2), new THREE.MeshStandardMaterial({ map: rep(ceilT, KW / 2.5, KD / 2.5), roughness: 1 }), kcx, KH, kcz);
    // dinding: utara, selatan, timur utuh; barat berlubang pintu (lubang ditutup daun pintu yang selalu tertutup)
    const T = 0.4, hD = KD / 2, pz = (hD - kdHW) / 2;
    R(box(KW + 2 * T, KH, T, 3.2), wallM, kcx, KH / 2, KR.z0 - T / 2); R(box(KW + 2 * T, KH, T, 3.2), wallM, kcx, KH / 2, KR.z1 + T / 2); R(box(T, KH, KD, 3.2), wallM, KR.x1 + T / 2, KH / 2, kcz);
    for (const e of [-1, 1]) R(box(T, KH, hD - kdHW, 3.2), wallM, KR.x0 - T / 2, KH / 2, kcz + e * (kdHW + pz));
    R(box(T, KH - kdH, 2 * kdHW, 3.2), wallM, KR.x0 - T / 2, kdH + (KH - kdH) / 2, kcz);
    // wainscot kayu, pita emas & kornis di keempat dinding (dinding barat dipotong di bagian pintu)
    for (const sz of [-1, 1]) { const zz = sz < 0 ? KR.z0 : KR.z1;
      R(box(KW, 1.1, 0.06), Mt.wood, kcx, 0.55, zz - sz * 0.03); R(box(KW, 0.1, 0.1), Mt.gold, kcx, 1.12, zz - sz * 0.05); R(box(KW, 0.3, 0.3), Mt.stoneDark, kcx, KH - 0.15, zz - sz * 0.15); }
    R(box(0.06, 1.1, KD), Mt.wood, KR.x1 - 0.03, 0.55, kcz); R(box(0.1, 0.1, KD), Mt.gold, KR.x1 - 0.05, 1.12, kcz); R(box(0.3, 0.3, KD), Mt.stoneDark, KR.x1 - 0.15, KH - 0.15, kcz);
    for (const e of [-1, 1]) { const len = hD - kdHW - 0.3, zc2 = kcz + e * (kdHW + 0.3 + len / 2); R(box(0.06, 1.1, len), Mt.wood, KR.x0 + 0.03, 0.55, zc2); R(box(0.1, 0.1, len), Mt.gold, KR.x0 + 0.05, 1.12, zc2); }
    R(box(0.3, 0.3, KD), Mt.stoneDark, KR.x0 + 0.15, KH - 0.15, kcz);
    // pintu keluar (tertutup terus): bingkai emas, daun ganda berpanel warna kamar, papan nama di atasnya
    for (const e of [-1, 1]) R(box(0.3, kdH, 0.26), Mt.gold, KR.x0 + 0.1, kdH / 2, kcz + e * (kdHW + 0.1));
    R(box(0.3, 0.26, 2 * kdHW + 0.5), Mt.gold, KR.x0 + 0.1, kdH + 0.13, kcz);
    for (const e of [-1, 1]) {
      R(box(0.12, kdH - 0.05, kdHW - 0.04), Mt.wood, KR.x0 + 0.12, (kdH - 0.05) / 2, kcz + e * kdHW / 2);
      R(box(0.06, kdH - 0.7, kdHW - 0.45), std(r.color, { roughness: 0.8 }), KR.x0 + 0.2, kdH / 2, kcz + e * kdHW / 2);
      R(new THREE.SphereGeometry(0.07, 8, 6), Mt.gold, KR.x0 + 0.24, 1.1, kcz + e * 0.18);
    }
    { const pt = ctex(512, 96, (x, ww, hh) => { x.fillStyle = '#1a2348'; x.fillRect(0, 0, ww, hh); x.strokeStyle = '#d9b24a'; x.lineWidth = 6; x.strokeRect(4, 4, ww - 8, hh - 8); x.fillStyle = '#f1d27a'; x.font = 'bold 44px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('KELUAR · GALERI', ww / 2, hh / 2 + 3); });
      const m = R(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.8 }), KR.x0 + 0.04, kdH + 0.8, kcz); m.rotation.y = PI / 2; }
    // jendela lengkung di dinding utara & selatan
    const window2 = (x, z, ry) => { const wg = new THREE.Group(); wg.position.set(x, KY + 1.3, z); wg.rotation.y = ry; g.add(wg);
      add(new THREE.ShapeGeometry(archShape(0.7, 1.6)), Mt.window, 0, 0, 0, wg); for (const e of [-1, 1]) add(box(0.1, 1.6, 0.1), Mt.stoneDark, e * 0.7, 0.8, 0.03, wg);
      add(box(0.1, 2.3, 0.1), Mt.stoneDark, 0, 1.15, 0.04, wg); add(box(1.5, 0.1, 0.1), Mt.stoneDark, 0, 0, 0.03, wg); add(new THREE.TorusGeometry(0.7, 0.07, 6, 14, PI), Mt.gold, 0, 1.6, 0.04, wg); };
    window2(6.0, KR.z0 + 0.04, 0); window2(3.0, KR.z1 - 0.04, PI); window2(6.5, KR.z1 - 0.04, PI); window2(-1.5, KR.z1 - 0.04, PI);
    // permadani besar di atas tempat tidur (dinding timur) + dua panji di dinding barat
    R(new THREE.PlaneGeometry(2.4, 3.0), tapM, KR.x1 - 0.035, 3.3, kcz).rotation.y = -PI / 2;
    for (const e of [-1, 1]) { R(new THREE.PlaneGeometry(1.0, 2.5), bannerM, KR.x0 + 0.04, 3.0, kcz + e * 3.9).rotation.y = PI / 2; R(cyl(0.04, 0.04, 1.4, 6), Mt.gold, KR.x0 + 0.06, 4.28, kcz + e * 3.9).rotation.x = PI / 2; }
    // lampu gantung di tengah ruangan + 4 lampu dinding
    { const cx = kcx + 1.0; R(cyl(0.02, 0.02, 1.4, 5), Mt.iron, cx, KH - 0.7, kcz); R(new THREE.TorusGeometry(0.9, 0.04, 6, 24), Mt.gold, cx, KH - 1.4, kcz).rotation.x = PI / 2;
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2, px = cx + Math.cos(a) * 0.9, pz2 = kcz + Math.sin(a) * 0.9; R(cyl(0.035, 0.035, 0.2, 6), Mt.cream, px, KH - 1.28, pz2); const f = R(flameGeo, Mt.flame, px, KH - 1.04, pz2); f.scale.set(0.7, 0.8, 0.7); flames.push(f); } }
    const sconce = (x, y, z, ry) => { const sg = new THREE.Group(); sg.position.set(x, KY + y, z); sg.rotation.y = ry; g.add(sg); add(box(0.12, 0.5, 0.12), Mt.iron, 0, 0, 0, sg); add(cyl(0.12, 0.07, 0.22, 8), Mt.iron, 0, 0.3, 0.12, sg); const f = add(flameGeo, Mt.flame, 0, 0.58, 0.12, sg); flames.push(f); };
    sconce(KR.x0 + 0.1, 2.6, kcz - 2.4, PI / 2); sconce(KR.x0 + 0.1, 2.6, kcz + 2.4, PI / 2); sconce(KR.x1 - 0.1, 2.6, kcz - 3.4, -PI / 2); sconce(KR.x1 - 0.1, 2.6, kcz + 3.4, -PI / 2);
    // bercak cahaya hangat di lantai
    R(new THREE.PlaneGeometry(11, 9).rotateX(-PI / 2), roomGlowM, kcx + 1.2, 0.04, kcz); R(new THREE.PlaneGeometry(6, 6).rotateX(-PI / 2), roomGlowM, KR.x1 - 1.6, 0.04, kcz);
    // perabot (grup perabot di y = KY; semua tinggi di dalamnya dihitung dari lantai)
    const bedC = std(r.color, { roughness: 1 }), sofaC = std(r.color, { roughness: 1 }), rugM = new THREE.MeshStandardMaterial({ map: rep(r.s < 0 ? carpetT : blueCarpT, 0.7 * 7 / 2.6, 0.7 * 4.6 / 2.2), roughness: 1 });
    const bookM = [0x7a1f2b, 0x1f3a7a, 0x2f6a3a, 0x8a6a2a, 0x4a2a78].map(c => std(c, { roughness: 1 }));
    for (const f of KAMAR_FURN) {
      const fg = new THREE.Group(); fg.position.set(f.x, KY, f.z); fg.rotation.y = f.ry; g.add(fg);
      if (f.k === 'bed') {
        for (const e of [-1, 1]) for (const z of [-1, 1]) add(box(0.12, 0.15, 0.12), Mt.wood, e * 0.78, 0.075, z * 1.0, fg);   // kaki kasur (menapak lantai)
        add(box(1.7, 0.3, 2.2), Mt.wood, 0, 0.3, 0, fg); add(box(1.6, 0.22, 2.1), linen, 0, 0.56, 0, fg); add(box(1.64, 0.1, 1.3), bedC, 0, 0.7, 0.4, fg);
        for (const e of [-0.4, 0.4]) add(box(0.6, 0.14, 0.4), Mt.cream, e, 0.74, -0.75, fg);
        add(box(1.8, 1.3, 0.1), Mt.wood, 0, 0.95, -1.1, fg); add(box(1.9, 0.1, 0.14), Mt.gold, 0, 1.65, -1.1, fg); add(box(1.7, 0.4, 0.08), Mt.wood, 0, 0.5, 1.1, fg);
        for (const e of [-1, 1]) for (const z of [-1, 1]) add(box(0.08, 2.3, 0.08), Mt.gold, e * 0.86, 1.15, z * 1.08, fg);
        add(box(1.8, 0.06, 2.3), bedC, 0, 2.3, 0, fg);
      } else if (f.k === 'night') { add(box(0.5, 0.6, 0.5), Mt.wood, 0, 0.3, 0, fg); add(box(0.54, 0.05, 0.54), Mt.gold, 0, 0.62, 0, fg); rc(fg, 0, 0.64, 0);
      } else if (f.k === 'ward') { add(box(1.1, 2.3, 0.6), Mt.wood, 0, 1.15, 0, fg); add(box(1.2, 0.1, 0.7), Mt.gold, 0, 2.35, 0, fg); add(box(0.02, 2.0, 0.02), Mt.iron, 0, 1.15, 0.31, fg); for (const e of [-0.12, 0.12]) add(box(0.05, 0.2, 0.04), Mt.gold, e * 1.5, 1.1, 0.32, fg);
      } else if (f.k === 'shelf') {
        add(box(2.2, 2.4, 0.08), Mt.wood, 0, 1.2, -0.18, fg); for (const e of [-1, 1]) add(box(0.08, 2.4, 0.45), Mt.wood, e * 1.06, 1.2, 0, fg); add(box(2.3, 0.08, 0.5), Mt.gold, 0, 2.42, 0, fg);
        for (let i = 0; i < 4; i++) { add(box(2.2, 0.05, 0.45), Mt.wood, 0, 0.08 + i * 0.6, 0, fg);
          for (let j = 0; j < 9; j++) { const hh = 0.3 + ((i * 7 + j * 3) % 5) * 0.04; add(box(0.12, hh, 0.28), bookM[(i + j * 2) % 5], -0.9 + j * 0.22, 0.105 + i * 0.6 + hh / 2, 0.02, fg); } }
      } else if (f.k === 'sofa') { add(box(2.1, 0.25, 0.95), Mt.wood, 0, 0.2, 0, fg); add(box(1.8, 0.25, 0.8), sofaC, 0, 0.45, 0.05, fg); add(box(2.1, 0.7, 0.2), sofaC, 0, 0.75, -0.38, fg); for (const e of [-1, 1]) add(box(0.2, 0.5, 0.9), sofaC, e * 1.0, 0.5, 0, fg);
      } else if (f.k === 'tablec') { add(cyl(0.5, 0.5, 0.06, 14), Mt.wood, 0, 0.75, 0, fg); add(cyl(0.08, 0.12, 0.72, 8), Mt.wood, 0, 0.38, 0, fg); add(cyl(0.35, 0.4, 0.05, 12), Mt.wood, 0, 0.03, 0, fg); rc(fg, 0, 0.78, 0);
      } else if (f.k === 'table') { add(box(1.2, 0.08, 0.6), Mt.wood, 0, 0.8, 0, fg); for (const e of [-1, 1]) for (const z of [-1, 1]) add(box(0.07, 0.78, 0.07), Mt.wood, e * 0.54, 0.4, z * 0.24, fg); rc(fg, -0.3, 0.84, 0); add(box(0.4, 0.05, 0.3), std(0x7a1f2b), 0.3, 0.86, 0.05, fg);
      } else if (f.k === 'chair') { add(box(0.56, 0.1, 0.56), Mt.velvet, 0, 0.52, 0, fg); add(box(0.6, 0.06, 0.6), Mt.wood, 0, 0.45, 0, fg); for (const e of [-1, 1]) for (const z of [-1, 1]) add(box(0.06, 0.45, 0.06), Mt.wood, e * 0.25, 0.22, z * 0.25, fg); add(box(0.6, 0.85, 0.07), Mt.wood, 0, 0.95, -0.27, fg);
      } else if (f.k === 'rug') { add(new THREE.PlaneGeometry(f.w, f.d).rotateX(-PI / 2), rugM, 0, 0.03, 0, fg); }
    }
    return g;
  };

  // ======================================================================
  //  DAPUR ISTANA (lantai 1): di belakang aula, sisi kanan. Pintu lengkung di dinding belakang aula (z = 13,6). Dinding dibuat dari tanah (tidak ada celah di bawah lantai).
  //  Isi: meja olah panjang berhias periuk & roti, meja dapur + bak cuci + rak toples di dinding utara, tungku batu bata berasap & cerobong di dinding timur,
  //  tong & karung di dinding selatan, rak panci gantung, jendela & obor.
  // ======================================================================
  { const D = DAPUR, w = D.x1 - D.x0, d = D.z1 - D.z0, cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2, K = D.h, WH = Y + K;
    const kStone = new THREE.MeshStandardMaterial({ map: rep(stone, w / 2.5, d / 2.5), color: 0xb4a490, roughness: 0.9 }), brick = std(0x8a3a2a, { roughness: 1 }), pot = std(0x5a5a62, { roughness: 0.4, metalness: 0.6 }), copper = std(0xb06a3a, { roughness: 0.4, metalness: 0.7 });
    add(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2), kStone, cx, Y, cz);
    add(new THREE.PlaneGeometry(w, d).rotateX(PI / 2), new THREE.MeshStandardMaterial({ map: rep(woodT, w / 2, d / 2), color: 0x9a7a5a, roughness: 0.9 }), cx, Y + K, cz);
    const kw = (x, z, sx, sz) => add(box(sx, WH, sz, 3.2), Mt.wall, x, WH / 2, z);
    kw(D.x1 + WT / 2, cz, WT, d + WT * 2); kw(cx, D.z0 - WT / 2, w, WT); kw(cx, D.z1 + WT / 2, w, WT);
    for (let x = D.x0 + 1.6; x < D.x1; x += 3.2) add(box(0.4, 0.5, d), Mt.wood, x, Y + K - 0.25, cz);                       // balok langit-langit
    // pintu: bingkai emas di sisi dapur + papan nama di sisi aula
    { const a = new THREE.Mesh(new THREE.TorusGeometry(D.doorHW, 0.12, 8, 22, PI), Mt.gold); a.rotation.y = PI / 2; a.position.set(D.x0 + 0.02, Y + D.doorHY, D.doorZ); group.add(a); for (const e of [-1, 1]) add(box(0.3, D.doorHY, 0.26), Mt.gold, D.x0 + 0.02, Y + D.doorHY / 2, D.doorZ + e * D.doorHW);
      const pt = ctex(512, 96, (x, ww, hh) => { x.fillStyle = '#1a2348'; x.fillRect(0, 0, ww, hh); x.strokeStyle = '#d9b24a'; x.lineWidth = 6; x.strokeRect(4, 4, ww - 8, hh - 8); x.fillStyle = '#f1d27a'; x.font = 'bold 50px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('DAPUR ISTANA', ww / 2, hh / 2 + 3); });
      add(new THREE.PlaneGeometry(3.0, 0.56), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.8 }), 14.3, Y + 5.3, D.doorZ).rotation.y = -PI / 2;
      const a2 = new THREE.Mesh(new THREE.TorusGeometry(D.doorHW + 0.15, 0.12, 8, 22, PI), Mt.gold); a2.rotation.y = -PI / 2; a2.position.set(14.45, Y + D.doorHY, D.doorZ); group.add(a2); for (const e of [-1, 1]) add(box(0.3, D.doorHY, 0.26), Mt.gold, 14.45, Y + D.doorHY / 2, D.doorZ + e * (D.doorHW + 0.15)); }
    // meja olah panjang di tengah
    { const T = D.table, ty = Y + 0.95;
      add(box(T.len, 0.12, T.w), Mt.wood, T.x, ty, T.z); add(box(T.len + 0.1, 0.05, T.w + 0.1), Mt.gold, T.x, ty - 0.1, T.z);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.2, 0.9, 0.2), Mt.wood, T.x + sx * (T.len / 2 - 0.3), Y + 0.45, T.z + sz * (T.w / 2 - 0.2));
      add(box(T.len - 0.4, 0.06, 0.12), Mt.wood, T.x, Y + 0.25, T.z);
      for (const [dx, dz, r, h] of [[-1.1, 0.15, 0.22, 0.28], [-0.5, -0.2, 0.17, 0.2], [1.2, 0.1, 0.25, 0.32]]) { add(cyl(r, r * 0.9, h, 10), pot, T.x + dx, ty + 0.06 + h / 2, T.z + dz); add(cyl(r * 1.05, r * 1.05, 0.04, 10), copper, T.x + dx, ty + 0.08 + h, T.z + dz); }
      add(box(0.7, 0.05, 0.4), Mt.cream, T.x + 0.3, ty + 0.09, T.z - 0.15); for (const dx of [-0.1, 0.25, 0.6]) { const b = add(new THREE.SphereGeometry(0.16, 8, 6), std(0xc99a5a), T.x + dx, ty + 0.2, T.z + 0.25); b.scale.set(1.5, 0.7, 0.9); }
      candle(group, T.x - 0.1, ty + 0.06, T.z - 0.35); }
    // meja dapur di dinding utara + bak cuci + rak toples
    { const C = D.counter, cl = C.x1 - C.x0, ccx = (C.x0 + C.x1) / 2, cz0 = D.z0 + C.depth / 2;
      add(box(cl, 0.9, C.depth), Mt.wood, ccx, Y + 0.45, cz0); add(box(cl + 0.1, 0.08, C.depth + 0.1), Mt.stoneDark, ccx, Y + 0.94, cz0);
      add(box(1.2, 0.05, 0.5), std(0x2a3a4a, { roughness: 0.3, metalness: 0.5 }), C.x0 + 1.6, Y + 0.98, cz0); add(cyl(0.03, 0.03, 0.5, 6), Mt.gold, C.x0 + 1.6, Y + 1.2, D.z0 + 0.15);   // bak cuci & keran
      for (const dx of [-0.3, 0.8]) { add(cyl(0.2, 0.17, 0.3, 10), pot, C.x0 + 3.6 + dx * 2, Y + 1.13, cz0); }
      for (const y of [1.9, 2.7]) { add(box(cl, 0.06, 0.32), Mt.wood, ccx, Y + y, D.z0 + 0.16);
        for (let x = C.x0 + 0.3; x < C.x1; x += 0.55) { const hh = 0.22 + (Math.sin(x * 7.3 + y) + 1) * 0.08; add(cyl(0.1, 0.1, hh, 8), std([0x7a4a2a, 0xa88a4a, 0x4a6a3a, 0x8a3a2a][Math.floor(x * 3 + y) & 3] || 0x7a4a2a), x, Y + y + 0.03 + hh / 2, D.z0 + 0.16); } } }
    // tungku batu bata + cerobong di dinding timur (menghadap -x)
    { const O = D.oven, g = new THREE.Group(); g.position.set(O.x, Y, O.z); g.rotation.y = -PI / 2; group.add(g);
      add(box(3.0, 1.5, 1.7), brick, 0, 0.75, -0.0, g); add(box(3.2, 0.14, 1.9), Mt.stoneDark, 0, 1.55, 0, g);
      add(box(1.3, 0.8, 0.12), Mt.iron, 0, 0.7, 0.86, g); add(box(1.0, 0.55, 0.12), new THREE.MeshBasicMaterial({ color: 0x2a0a00 }), 0, 0.68, 0.9, g);
      const f = add(new THREE.ConeGeometry(0.28, 0.6, 7), Mt.flame, 0, 0.55, 0.92, g); braziers.push(f);
      add(cyl(0.6, 1.0, K - 1.6, 4).rotateY(PI / 4), brick, 0, 1.6 + (K - 1.6) / 2, 0, g);   // cerobong menyempit ke langit-langit
      for (const e of [-1, 1]) { add(box(0.4, 0.5, 0.4), brick, e * 1.0, 1.85, 0.4, g); add(cyl(0.22, 0.2, 0.3, 10), copper, e * 0.8, 1.85, 0.2, g); }
      for (const e of [-1, 0, 1]) add(cyl(0.02, 0.02, 0.9, 5), Mt.iron, e * 0.75, 1.0 + 0.0, 1.1, g).rotation.x = PI / 2; }
    // tong & karung di dinding selatan
    for (const b of D.barrels) { add(cyl(0.5, 0.45, 1.0, 12), Mt.wood, b.x, Y + 0.5, b.z); for (const y of [0.25, 0.75]) add(cyl(0.52, 0.52, 0.06, 12), Mt.iron, b.x, Y + y, b.z); add(cyl(0.45, 0.45, 0.03, 12), Mt.stoneDark, b.x, Y + 1.0, b.z); }
    for (const [x, z] of [[20.6, 16.4], [21.4, 16.3], [21.0, 15.8]]) { const sk = add(new THREE.SphereGeometry(0.4, 8, 6), std(0xc8b48a, { roughness: 1 }), x, Y + 0.3, z); sk.scale.set(1, 0.9, 0.8); }
    for (const y of [1.9, 2.8]) add(box(7.0, 0.06, 0.32), Mt.wood, 21.0, Y + y, D.z1 - 0.16);
    for (let x = 17.8; x < 24.0; x += 0.5) for (const y of [1.9, 2.8]) add(cyl(0.09, 0.09, 0.25, 8), std(0x7a4a2a), x, Y + y + 0.15, D.z1 - 0.16);
    // rak panci gantung di atas meja
    { const T = D.table; add(box(3.4, 0.08, 0.4), Mt.iron, T.x, Y + 3.8, T.z); for (const e of [-1, 1]) add(cyl(0.02, 0.02, K - 3.8, 4), Mt.iron, T.x + e * 1.6, Y + 3.8 + (K - 3.8) / 2, T.z);
      for (let i = 0; i < 5; i++) { const x = T.x - 1.4 + i * 0.7; add(cyl(0.01, 0.01, 0.3, 4), Mt.iron, x, Y + 3.6, T.z); add(cyl(0.2, 0.18, 0.12, 10), i % 2 ? copper : pot, x, Y + 3.38, T.z); } }
    // jendela & obor
    const kwin = (x, z, ry) => { const g = new THREE.Group(); g.position.set(x, Y + 2.4, z); g.rotation.y = ry; group.add(g); add(new THREE.ShapeGeometry(archShape(0.55, 1.5)), Mt.window, 0, 0, 0, g); for (const e of [-1, 1]) add(box(0.1, 1.5, 0.1), Mt.stoneDark, e * 0.55, 0.75, 0.03, g); add(box(0.1, 2.1, 0.1), Mt.stoneDark, 0, 1.05, 0.04, g); add(box(1.2, 0.1, 0.1), Mt.stoneDark, 0, 0.9, 0.03, g); add(new THREE.TorusGeometry(0.55, 0.06, 6, 14, PI), Mt.gold, 0, 1.5, 0.04, g); };
    for (const z of [12.3, 15.4]) kwin(D.x1 - 0.02, z, -PI / 2); for (const x of [17.0, 20.0, 22.4]) kwin(x, D.z1 - 0.02, PI);
    torch(D.x0 + 0.3, Y + 3.0, 12.0, PI / 2); torch(D.x0 + 0.3, Y + 3.0, 15.2, PI / 2); torch(cx, Y + 3.0, D.z0 + 0.25, 0); torch(D.x1 - 0.3, Y + 3.0, 11.6, -PI / 2);
    { const gT = ctex(64, 64, (x, ww, hh) => { const gr = x.createRadialGradient(ww / 2, hh / 2, 0, ww / 2, hh / 2, ww / 2); gr.addColorStop(0, 'rgba(255,190,110,0.65)'); gr.addColorStop(1, 'rgba(255,150,70,0)'); x.fillStyle = gr; x.fillRect(0, 0, ww, hh); });
      const gM = new THREE.MeshBasicMaterial({ map: gT, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      add(new THREE.PlaneGeometry(6, 5).rotateX(-PI / 2), gM, D.oven.x - 1.6, Y + 0.04, D.oven.z); add(new THREE.PlaneGeometry(8, 5).rotateX(-PI / 2), gM, D.table.x, Y + 0.04, D.table.z); }
  }

  // ---------- Lampu titik (opsional; lihat USE_POINT_LIGHTS). Di luar grup tersembunyi agar jumlah lampu tetap -> tidak ada kompilasi ulang shader saat masuk ----------
  const lights = [];
  if (USE_POINT_LIGHTS) {
    const L1 = new THREE.PointLight(LIGHT.color, 0, LIGHT.dist, 2), L2 = new THREE.PointLight(LIGHT.color, 0, LIGHT.dist, 2), L3 = new THREE.PointLight(0xffc880, 0, 18, 2);
    L1.position.set(CHANDELIERS[0].x, Y + H - 3.2, 0); L2.position.set(CHANDELIERS[1].x, Y + H - 3.2, 0); L3.position.set(THRONE.x - 2.5, Y + DAIS.top + 3.5, 0);
    root.add(L1, L2, L3); lights.push([L1, LIGHT.chand], [L2, LIGHT.chand], [L3, LIGHT.throne]);
  }
  // ---------- Bercak cahaya hangat di lantai (tambahan, tanpa biaya lampu): gradasi radial aditif ----------
  { const glowT = ctex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,214,140,0.65)'); g.addColorStop(0.5, 'rgba(255,190,110,0.22)'); g.addColorStop(1, 'rgba(255,170,90,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    const glowM = new THREE.MeshBasicMaterial({ map: glowT, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const glow = (x, z, d, op = 1) => { const m = add(new THREE.PlaneGeometry(d, d).rotateX(-PI / 2), glowM, x, Y + 0.035, z); if (op !== 1) m.scale.set(op, 1, op); return m; };
    for (const c of CHANDELIERS.slice(0, 2)) glow(c.x, c.z, 15);            // di bawah dua lampu gantung (yang ketiga berada di atas panggung)
    glow(BRAZIER.x, BRAZIER.z, 6); glow(BRAZIER.x, -BRAZIER.z, 6);          // perapian
    { const m = add(new THREE.PlaneGeometry(11, 11).rotateX(-PI / 2), glowM, 12.2, Y + DAIS.top + 0.05, 0); void m; }   // di atas panggung singgasana
    for (const s of [-1, 1]) glow(rxc, s * 23, 13);                              // di bawah lampu gantung kedua ruang sayap
    glow(DEWAN.fireplace.x - 1.6, DEWAN.fireplace.z, 6);                           // di depan perapian Ruang Dewan
  }
  let shown = false, last = null;   // last = posisi lokal terakhir setelah tabrakan (dipakai aturan tepi panggung)

  // ---------- Tabrakan & tinggi lantai (semua dihitung di koordinat lokal kota) ----------
  const inRect = (r, x, z, m) => x >= r.x0 + m && x <= r.x1 - m && z >= r.z0 + m && z <= r.z1 - m;
  const LOW = [...AULA_RECTS, ...AULA_BRIDGES], UPR = [...F2_RECTS, ...F2_BRIDGES];   // kotak lantai 1 / lantai 2 (up = pemain di lantai atas)
  const inside = (x, z, m, up = false) => (up ? UPR : LOW).some(r => inRect(r, x, z, m));
  const nearest = (x, z, m, up = false) => {   // titik terdekat di dalam gabungan kotak yang dikecilkan m
    let bx = x, bz = z, bd = Infinity; for (const r of (up ? UPR : LOW)) {
      const x0 = r.x0 + m, x1 = r.x1 - m, z0 = r.z0 + m, z1 = r.z1 - m; if (x0 > x1 || z0 > z1) continue;
      const cx = Math.min(Math.max(x, x0), x1), cz = Math.min(Math.max(z, z0), z1), d = (cx - x) * (cx - x) + (cz - z) * (cz - z); if (d < bd) { bd = d; bx = cx; bz = cz; } }
    return [bx, bz]; };
  const isUp = y => y > Y + F2.up;
  const pushRect = (x, z, rc, r) => {   // dorong titik keluar dari kotak yang dibesarkan r (sisi terdekat)
    const x0 = rc.x0 - r, x1 = rc.x1 + r, z0 = rc.z0 - r, z1 = rc.z1 + r; if (x <= x0 || x >= x1 || z <= z0 || z >= z1) return [x, z];
    const d = [x - x0, x1 - x, z - z0, z1 - z], m = Math.min(...d), i = d.indexOf(m); return i === 0 ? [x0, z] : i === 1 ? [x1, z] : i === 2 ? [x, z0] : [x, z1]; };
  const rectAt = (x, z) => AULA_RECTS.find(r => inRect(r, x, z, -0.2)) || aula;
  const stepY = (x, z) => {   // tinggi relatif panggung di titik (x, z); 0 di luar panggung
    if (Math.abs(z) > DAIS.z || x < DAIS.x0) return 0;
    if (x >= DAIS.platX0) return DAIS.top;
    const t = x - DAIS.x0, i = Math.min(DAIS.steps - 1, Math.floor(t)), f = t - i, k = Math.min(1, f / 0.35), s = k * k * (3 - 2 * k); return DAIS.stepH * (i + s); };

  // ---------- Prajurit penjaga istana (FBX) ----------
  // Tiap model dimuat SEKALI (templat), lalu dikloning per prajurit (SkeletonUtils.clone: rangka terpisah, geometri & tekstur dipakai bersama). Ukuran model dinormalkan otomatis
  // ke PRAJURIT_MODELS[id].h dan kaki diletakkan di lantai. Model tanpa klip animasi: berdiri jaga dengan gerak napas halus lewat kode.
  const guardG = new THREE.Group(); guardG.name = 'prajurit'; group.add(guardG);
  const guards = [], gTpl = {};   // gTpl[id] = { st: 0 belum | 1 memuat | 2 siap | -1 gagal, root }
  const prepGuard = (obj, spec) => {
    const holder = new THREE.Group(); holder.add(obj); holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true), h = box.max.y - box.min.y;
    if (!(h > 1e-4) || !isFinite(h)) throw new Error('ukuran model tidak valid');
    obj.scale.multiplyScalar(spec.h / h); holder.updateMatrixWorld(true);
    box.setFromObject(holder, true); const c = box.getCenter(new THREE.Vector3());
    obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y; holder.updateMatrixWorld(true);   // tengah di sumbu, telapak di y = 0
    holder.traverse(o => {
      if (!o.isMesh) return; o.castShadow = o.receiveShadow = false; if (o.isSkinnedMesh) o.frustumCulled = false;   // batas FBX berkulit sering salah -> jangan sampai menghilang
      for (const m of [].concat(o.material)) {
        if (!m) continue;
        if (m.map) {
          if (spec.pixel) { m.map.magFilter = m.map.minFilter = THREE.NearestFilter; m.map.generateMipmaps = false; m.map.needsUpdate = true; }   // palet warna: tanpa blur
          if ('emissive' in m) m.emissiveMap = m.map;
        }
        if ('emissive' in m) { if (m.map) m.emissive.setHex(GUARD.tint); else if (m.color) m.emissive.copy(m.color); m.emissiveIntensity = GUARD.glow; }   // bertekstur: glow hangat; polos: glow sewarna bahan
        if (spec.double) m.side = THREE.DoubleSide;                                   // jubah / bulu berupa bidang tipis
        if (/feather|bulu/i.test((m.name || '') + ' ' + ((m.map && m.map.name) || ''))) { m.transparent = true; m.alphaTest = 0.4; m.depthWrite = true; }
        m.needsUpdate = true;
      }
    });
    return holder;
  };
  const placeGuard = (def, tpl, spec) => {
    const m = cloneSkinned(tpl.root), pivot = new THREE.Group();
    pivot.position.set(def.x, Y + (def.y || 0), def.z); pivot.rotation.y = def.yaw + (spec.yaw || 0); pivot.add(m); guardG.add(pivot);
    const sp = m.getObjectByName('Spine2') || m.getObjectByName('Spine1');
    guards.push({ m, sp, sx: sp ? sp.rotation.x : 0, ph: Math.random() * 6.283 });
    AULA_CIRCLES.push({ x: def.x, z: def.z, r: GUARD.radius });                       // tabrakan hanya untuk prajurit yang benar-benar muncul
  };
  const loadGuardModel = id => {
    const t = gTpl[id] || (gTpl[id] = { st: 0 }); if (t.st) return; t.st = 1;
    const spec = PRAJURIT_MODELS[id], mgr = new THREE.LoadingManager();
    // rujukan tekstur di dalam FBX sering berupa jalur Windows / nama berbeda: ambil nama berkasnya saja, spasi -> garis bawah, arahkan ke folder tekstur model
    mgr.setURLModifier(u => {
      if (!/\.(png|jpe?g|webp)(\?.*)?$/i.test(u) || /^(data|blob):/i.test(u)) return u;
      let f = u.split(/[\\/]/).pop().split('?')[0]; try { f = decodeURIComponent(f); } catch (e) { }
      return spec.tex + encodeURIComponent(f.replace(/ /g, '_'));
    });
    const done = obj => {
      try { t.root = prepGuard(obj, spec); t.st = 2; for (const d of PRAJURIT) if (d.model === id) placeGuard(d, t, spec); }
      catch (e) { t.st = -1; console.warn('Prajurit ' + id + ' gagal dipasang:', e); }
    }, fail = e => { t.st = -1; console.warn(spec.file + ' gagal dimuat:', e); };
    if (/\.(glb|gltf)$/i.test(spec.file)) new GLTFLoader(mgr).load(spec.file, g => done(g.scene), undefined, fail);   // GLB: tekstur sudah tertanam, jauh lebih cepat diurai daripada FBX
    else new FBXLoader(mgr).load(spec.file, done, undefined, fail);
  };
  const loadGuards = inside => { for (const id in PRAJURIT_MODELS) if (inside || !PRAJURIT_MODELS[id].lazy) loadGuardModel(id); };   // model "lazy" baru diunduh saat pemain masuk aula
  const stepGuards = t => { for (const g of guards) { const s = Math.sin(t * 1.6 + g.ph); if (g.sp && GUARD.breathe) g.sp.rotation.x = g.sx + GUARD.breathe * s; g.m.position.y = GUARD.bob * (0.5 + 0.5 * s); } };

  loadIsabel();   // Isabel ikut diunduh di latar bersama ratu
  loadQueen();   // mulai mengunduh ratu begitu kota dibangun (asinkron), supaya sudah siap saat pemain tiba di singgasana
  loadGuards(false);   // prajurit ringan ikut diunduh di latar; yang lebih berat menunggu pemain masuk aula

  const SHOT_K = [   // kunci kamera sorotan ratu: [jarak ke depan singgasana, geser samping, tinggi kamera, titik lihat x, titik lihat y]  (tinggi dari lantai panggung)
    [2.3, 0.45, 0.35, 0.10, 0.40],    // dari bawah: kaki ratu
    [2.5, 0.35, 0.40, 0.15, 1.20],    // tetap rendah, pandangan naik ke badan
    [3.2, 0.10, 3.40, 0.30, 0.90],    // dari atas: tinggi, menunduk ke ratu
    [1.4, -0.15, 1.50, 0.35, 1.62]];  // muka ratu, close-up
  const _qs = new Float64Array(5), _shot = { cam: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } };
  // Sorotan ratu berjalan (queenWalkShot): dist0/dist1 = jarak kamera di depan ratu saat mulai / tiba (m); side0/side1 = geser ke samping (m, supaya pemain yang berlutut tidak menghalangi); camH / lookH = tinggi kamera / titik pandang di atas pinggul ratu (m); lead = titik pandang sedikit mendahului langkah ratu (m)
  const QWALK_SHOT = { dist0: 2.5, dist1: 1.55, side0: 1.0, side1: 0.6, camH: 0.62, lookH: 0.68, lead: 0.1 };
  const _wshot = { cam: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } };
  const KNEEL_SPOT = { x: DAIS.x0 - 1.3, z: THRONE.z }, KNEEL_ZONE = 2.2;   // titik berlutut = 1,3 m sebelum tangga (ubah angka 1.3 untuk maju / mundur); KNEEL_ZONE = jarak maks. dari titik itu agar tombol Berlutut muncul
  // ---------- Ratu berdiri dari singgasana, berjalan menuruni tangga menghampiri pemain yang berlutut, lalu kembali duduk ----------
  // Alur (dipanggil game.js): queenCome() -> berdiri -> berjalan sampai QSTOP di depan pemain -> menunggu (queenArrived()) -> queenLeave() -> berbalik, berjalan kembali, berbalik, duduk.
  const QMOVE = { speed: 0.9, stride: 1.3, rise: 1.5, sit: 1.6, turn: 0.9, arrive: 0.5 };   // m/s, panjang 1 siklus langkah (m), detik: berdiri / duduk / berbalik / berhenti
  const QSTOP = KNEEL_SPOT.x + 1.8;                  // tempat ratu berhenti (pinggul): di anak tangga pertama, ~1,1 m di depan pemain yang berlutut
  const QSTAND_X = THRONE.x - 0.25, QSEAT_X = THRONE.x + QUEEN.hipX;   // QSTAND_X = berdiri di atas injakan kaki singgasana
  const QW = { st: 'seated', t: 0, x: QSEAT_X, ph: 0, w: 0, rot: -PI / 2, last: null };
  const qEase = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
  const qSm = (a0, b0, v) => qEase((v - a0) / (b0 - a0));
  const qFloor = x => {   // tinggi lantai (relatif Y) di jalur ratu (z = 0): tangga panggung + dasar singgasana (0,2) + injakan kaki (0,525)
    const bx0 = THRONE.x - 1.3, fx0 = THRONE.x - 0.57, fx1 = THRONE.x + 0.03;
    return stepY(x, 0) + Math.max(0.2 * qSm(bx0 - 0.2, bx0 + 0.1, x), 0.525 * qSm(fx0 - 0.2, fx0 + 0.1, x) * (1 - qSm(fx1 - 0.1, fx1 + 0.2, x)));
  };
  const qSeatY = () => Y + DAIS.top + QUEEN.hipY;
  const qBlend = (A, B, t) => { const n = QR.ANIM.length; for (let i = 0; i < n; i++) QR.ANIM[i].quaternion.copy(A[i]).slerp(B[i], t);
    QR.qFing(B === QR.tmp ? t : A === QR.tmp ? 1 - t : 0); };   // jari ikut: menggenggam saat diam / duduk, rileks saat berjalan (tmp = pose jalan)
  const qWalkTmp = ph => { const u = ph * 4, i = Math.floor(u) % 4, f = qEase(u - Math.floor(u)), W = QR.walk, A = W[i], B = W[(i + 1) % 4]; for (let k = 0; k < QR.tmp.length; k++) QR.tmp[k].copy(A[k]).slerp(B[k], f); };
  const qPlace = (x, bob, rot) => { queenG.position.set(x, Y + qFloor(x) + QR.standH + bob, THRONE.z); queenG.rotation.y = rot; };
  const qBob = ph => -0.06 * (0.5 + 0.5 * Math.cos(Math.PI * 4 * ph));   // pinggul turun saat dua kaki menapak, naik saat kaki melintas
  const qReset = () => {
    QW.st = 'seated'; QW.t = 0; QW.x = QSEAT_X; QW.ph = 0; QW.w = 0; QW.rot = -PI / 2; QW.last = null;
    if (QR) { for (let i = 0; i < QR.ANIM.length; i++) QR.ANIM[i].quaternion.copy(QR.seatSet[i]); QR.qFing(0); queenG.position.set(QSEAT_X, qSeatY(), THRONE.z); queenG.rotation.y = -PI / 2; }
  };
  const qGo = (dt, dir, tx) => {   // berjalan menuju tx (dir -1 = ke -x / turun, +1 = ke +x / naik); true bila sampai
    const rem = Math.abs(tx - QW.x); QW.t += dt;
    const v = Math.max(0.15, QMOVE.speed * Math.min(1, QW.t / 0.7, rem / 0.9 + 0.1)), step = Math.min(rem, v * dt);
    QW.x += dir * step; QW.ph = (QW.ph + step / QMOVE.stride) % 1; QW.w = Math.min(1, QW.t / 0.5);
    qWalkTmp(QW.ph); qBlend(QR.standSet, QR.tmp, QW.w); qPlace(QW.x, qBob(QW.ph) * QW.w, QW.rot);
    return rem - step < 0.003;
  };
  const qSettle = u => { qWalkTmp(QW.ph); qBlend(QR.tmp, QR.standSet, qEase(u)); qPlace(QW.x, qBob(QW.ph) * (1 - qEase(u)), QW.rot); };   // berhenti: kaki merapat
  const qStep = t => {
    if (QW.last === null) QW.last = t; const dt = Math.min(0.05, Math.max(0, t - QW.last)); QW.last = t;
    const s = QW.st; if (s === 'seated' || s === 'wait' || !QR) return;
    if (s === 'rising') {
      QW.t += dt; const u = QW.t / QMOVE.rise, e = qEase(u), x = QSEAT_X + (QSTAND_X - QSEAT_X) * qEase((u - 0.3) / 0.7);
      qBlend(QR.seatSet, QR.standSet, e);
      queenG.position.set(x, qSeatY() + (Y + qFloor(x) + QR.standH - qSeatY()) * e, THRONE.z); queenG.rotation.y = -PI / 2;
      if (u >= 1) { QW.st = 'out'; QW.t = 0; QW.x = QSTAND_X; QW.ph = 0; QW.w = 0; }
    } else if (s === 'out') { if (qGo(dt, -1, QSTOP)) { QW.st = 'arrive'; QW.t = 0; QW.rot = -PI / 2; } }
    else if (s === 'arrive' || s === 'arrive2') {
      QW.t += dt; qSettle(QW.t / QMOVE.arrive);
      if (QW.t >= QMOVE.arrive) { qBlend(QR.standSet, QR.standSet, 0); if (s === 'arrive') { QW.st = 'wait'; QW.t = 0; } else { QW.st = 'turn2'; QW.t = 0; } }
    } else if (s === 'turn1' || s === 'turn2') {
      QW.t += dt; const e = qEase(QW.t / QMOVE.turn); QW.rot = s === 'turn1' ? -PI / 2 + PI * e : PI / 2 - PI * e;
      qBlend(QR.standSet, QR.standSet, 0); qPlace(QW.x, 0, QW.rot);
      if (QW.t >= QMOVE.turn) { if (s === 'turn1') { QW.st = 'back'; QW.t = 0; QW.ph = 0; QW.w = 0; QW.rot = PI / 2; } else { QW.st = 'sitting'; QW.t = 0; QW.rot = -PI / 2; } }
    } else if (s === 'back') { if (qGo(dt, 1, QSTAND_X)) { QW.st = 'arrive2'; QW.t = 0; } }
    else if (s === 'sitting') {
      QW.t += dt; const u = QW.t / QMOVE.sit, e = qEase(u), x = QSTAND_X + (QSEAT_X - QSTAND_X) * qEase(u / 0.7), y0 = Y + qFloor(QSTAND_X) + QR.standH;
      qBlend(QR.standSet, QR.seatSet, e);
      queenG.position.set(x, y0 + (qSeatY() - y0) * qEase((u - 0.2) / 0.8), THRONE.z); queenG.rotation.y = -PI / 2;
      if (u >= 1) qReset();
    }
  };

  // ---------- Isabel menemani pemain: ajak jalan bareng ----------
  // Alur (dipanggil game.js): isabelNear() -> tombol "Ajak Isabel" -> isabelToggle() -> ia mengikuti jejak pemain (isabelUpdate tiap frame) -> isabelToggle() lagi = suruh menunggu.
  // mode: 'home' = berdiri di panggung (pose awal), 'follow' = ikut, 'stay' = menunggu di tempat. Keluar dari istana -> Isabel kembali ke panggung. Semua posisi di koordinat LOKAL kota.
  const IS = { mode: 'home', x: THRONE.x + ISABEL.dx, z: THRONE.z + ISABEL.z, y: Y + DAIS.top, rot: -PI / 2 + ISABEL.yaw, v: 0, w: 0, run: 0, ph: 0, moving: false, stuck: 0, talk: 0, room: null, trail: [], lx: 0, lz: 0 };
  // IS.out = Isabel berada di dunia luar: koordinat DUNIA, induknya world.group (lewat iEnv.parent), tabrakan & tinggi tanah dari game.js. Selain itu ia di dalam grup aula (koordinat lokal kota).
  IS.out = false; IS.chat = false; IS.speakReq = null;   // chat = sedang mengobrol dengan pemain (Isabel menoleh ke pemain & mulutnya bergerak)
  const iCan = () => isabelState === 2 && !!IR && (IS.out ? !shown : shown && IS.room === curRoom);
  const iVis = () => { const v = IS.out ? !shown : shown && IS.room === curRoom; isabelG.visible = v; if (iShadow) iShadow.visible = v; };   // di luar: tersembunyi selama pemain di dalam aula
  const iP = (wx, wz) => IS.out ? { x: wx, z: wz } : toLocal(wx, wz);
  const iPushA = (x, z, up, r) => IS.out ? iEnv.push(x, z, r) : iPush(x, z, up, r);
  const iGroundA = (x, z, y) => IS.out ? iEnv.ground(x, z) : iGround(x, z, y);
  const _ihv = new THREE.Vector3();   // dipakai isabelLie (posisi kepala Isabel)
  const iTint = new THREE.Color(ISABEL.tint);
  const iLook = out => { for (const m of iMats) m.emissive.copy(iTint).multiplyScalar(out ? IFOLLOW.glowOut : ISABEL.glow); };   // di luar sudah terang: cahaya sendiri dikurangi
  const iReparent = parent => { if (isabelG.parent !== parent) { parent.add(isabelG); if (iShadow) parent.add(iShadow); } };
  const iSetCircles = () => {   // tabrakan untuk pemain: aktif hanya saat Isabel berdiri diam (di panggung / menunggu); saat ikut, pemain boleh menembusnya agar tidak tersangkut
    const solid = IS.mode !== 'follow' && !IS.room && !IS.out, up = isUp(IS.y);
    iC1.x = solid && !up ? IS.x : 1e5; iC1.z = solid && !up ? IS.z : 1e5; iC2.x = solid && up ? IS.x : 1e5; iC2.z = solid && up ? IS.z : 1e5; };
  const iGround = (x, z, y) => { if (IS.room) return KY; const sh = stairH(x, z); if (sh !== null) return Y + sh; return isUp(y) ? Y2 : Y + stepY(x, z); };
  const iPush = (x, z, up, r) => {   // tabrakan Isabel: sama seperti collide() pemain, tetapi di koordinat lokal & tanpa lingkaran Isabel sendiri
    const cl = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    if (IS.room) { const K = KAMAR_RECT; x = cl(x, K.x0 + r, K.x1 - r); z = cl(z, K.z0 + r, K.z1 - r);
      for (const c of KAMAR_CIRCLES) { const dx = x - c.x, dz = z - c.z, min = c.r + r, d2 = dx * dx + dz * dz; if (d2 >= min * min) continue; const d = Math.sqrt(d2) || 1e-4; x = c.x + dx / d * min; z = c.z + dz / d * min; }
      return [cl(x, K.x0 + r, K.x1 - r), cl(z, K.z0 + r, K.z1 - r)]; }
    if (!inside(x, z, r, up)) [x, z] = nearest(x, z, r, up);
    if (!up) for (const w of F2_WALLS) [x, z] = pushRect(x, z, w, r);
    for (const c of (up ? F2_CIRCLES : AULA_CIRCLES)) { if (c.isabel) continue; const dx = x - c.x, dz = z - c.z, min = c.r + r, d2 = dx * dx + dz * dz; if (d2 >= min * min) continue; const d = Math.sqrt(d2) || 1e-4; x = c.x + dx / d * min; z = c.z + dz / d * min; }
    if (!inside(x, z, r, up)) [x, z] = nearest(x, z, r, up);
    if (!up && x >= DAIS.x0) { const az = Math.abs(z), lo = DAIS.z - r, hi = DAIS.z + r; if (az > lo && az < hi) { z = (z < 0 ? -1 : 1) * (Math.abs(IS.z) < DAIS.z ? lo : hi); } }   // tepi samping panggung: naik / turun hanya lewat tangga depan
    return [x, z]; };
  const iPlace = bob => { isabelG.position.set(IS.x, IS.y + bob, IS.z); isabelG.rotation.y = IS.rot; if (iShadow) iShadow.position.set(IS.x, IS.y + 0.014, IS.z); };
  const iAng = (a, b) => { let d = b - a; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return d; };
  const iPose = () => {   // berdiri anggun (IS.w = 0) <-> jalan <-> lari (IS.run), sesuai fase langkah IS.ph
    const W = IR.walk, R = IR.run, u = IS.ph * 4, i = Math.floor(u) % 4, f = qEase(u - Math.floor(u)), j = (i + 1) % 4, n = IR.ANIM.length;
    for (let k = 0; k < n; k++) {
      IR.tmp[k].copy(W[i][k]).slerp(W[j][k], f);
      if (IS.run > 0.001) { IR.tmp2[k].copy(R[i][k]).slerp(R[j][k], f); IR.tmp[k].slerp(IR.tmp2[k], IS.run); }
      IR.ANIM[k].quaternion.copy(IR.idleSet[k]).slerp(IR.tmp[k], IS.w); } };
  const iGoHome = () => {   // kembali ke panggung, pose berdiri awal
    iReparent(group); iLook(false); IS.out = false; IS.mode = 'home'; IS.trail.length = 0; IS.x = THRONE.x + ISABEL.dx; IS.z = THRONE.z + ISABEL.z; IS.y = Y + DAIS.top; IS.rot = -PI / 2 + ISABEL.yaw;
    IS.v = IS.w = IS.run = IS.ph = 0; IS.moving = false; IS.stuck = 0; IS.room = null; IS.talk = 0;
    if (IR) for (let k = 0; k < IR.ANIM.length; k++) IR.ANIM[k].quaternion.copy(IR.idleSet[k]);
    iPlace(0); iSetCircles(); iVis(); };
  const iBeside = (px, pz, fx, fz) => {   // Isabel muncul di sisi pemain (kanan-belakang), jejak dibersihkan; (fx, fz) = arah hadap pemain
    const [x, z] = iPushA(px - fz * 1.1 - fx * 0.3, pz + fx * 1.1 - fz * 0.3, !IS.out && !IS.room && isUp(IS.y), IFOLLOW.radius);
    IS.x = x; IS.z = z; IS.y = iGroundA(x, z, IS.y); IS.lx = px; IS.lz = pz; IS.trail.length = 0; IS.v = 0; IS.moving = false; IS.stuck = 0; IS.rot = Math.atan2(fx, fz); iPlace(0); iSetCircles(); iVis(); };
  const iWarp = sp => {   // pemain pindah ruang (masuk / keluar kamar) saat Isabel ikut
    if (IS.mode !== 'follow' || !IR) { iVis(); return; }
    const a0 = toLocal(sp.x, sp.z), b0 = toLocal(sp.x + Math.sin(sp.face), sp.z + Math.cos(sp.face)), fl = Math.hypot(b0.x - a0.x, b0.z - a0.z) || 1;
    IS.room = curRoom; IS.y = sp.y; iBeside(a0.x, a0.z, (b0.x - a0.x) / fl, (b0.z - a0.z) / fl); };
  const iTurn = (p, dt) => {   // di panggung: menoleh ke pemain saat mengobrol, lalu kembali ke arah semula
    const tg = IS.chat ? Math.atan2(p.x - IS.x, p.z - IS.z) : -PI / 2 + ISABEL.yaw, d = iAng(IS.rot, tg);
    if (Math.abs(d) < 0.002) return; IS.rot += d * (1 - Math.exp(-dt * 4)); isabelG.rotation.y = IS.rot; };
  const iPause = () => {   // tidak bisa ikut (masuk gereja / istana lain / arena): menunggu di tempat
    if (IS.mode !== 'follow') return;
    IS.mode = 'stay'; IS.trail.length = 0; IS.v = 0; IS.w = 0; IS.moving = false; if (IR) iPose(); iPlace(0); iSetCircles(); };
  const iFollow = (p, dt) => {
    const F = IFOLLOW, tr = IS.trail, up = !IS.out && !IS.room && isUp(IS.y);
    if (Math.hypot(p.x - IS.lx, p.z - IS.lz) > F.jump) { iBeside(p.x, p.z, Math.sin(IS.rot), Math.cos(IS.rot)); return; }   // pemain berpindah tiba-tiba (mis. mulai ulang)
    if (Math.hypot(p.x - IS.lx, p.z - IS.lz) >= F.step) { tr.push({ x: p.x, z: p.z }); IS.lx = p.x; IS.lz = p.z; }   // rekam jejak pemain
    let gap = 0, cx = IS.x, cz = IS.z;   // panjang jalur dari Isabel menyusuri jejak sampai pemain
    for (const q of tr) { gap += Math.hypot(q.x - cx, q.z - cz); cx = q.x; cz = q.z; }
    gap += Math.hypot(p.x - cx, p.z - cz);
    if (gap > F.tele) {   // tertinggal jauh (mis. pemain berlari kencang): langsung muncul di jejak, sekitar gap + 1 m di belakang pemain
      while (tr.length > 1 && gap > F.gap + 1) { const q = tr.shift(); gap -= Math.hypot(q.x - IS.x, q.z - IS.z); IS.x = q.x; IS.z = q.z; } }
    const over = gap - F.gap;
    if (IS.moving) { if (over < 0.05) IS.moving = false; } else if (over > F.start) IS.moving = true;
    const target = IS.moving ? Math.min(F.vmax, F.vmin + over * F.ramp) : 0;
    IS.v += (target - IS.v) * (1 - Math.exp(-dt * 7)); if (!IS.moving && IS.v < 0.03) IS.v = 0;
    const ox = IS.x, oz = IS.z, want = Math.min(IS.v * dt, Math.max(0, over)); let m = want, hx = 0, hz = 0;
    while (m > 1e-5) {
      const q = tr.length ? tr[0] : p, dx = q.x - IS.x, dz = q.z - IS.z, d = Math.hypot(dx, dz);
      if (d < 1e-4) { if (tr.length) { tr.shift(); continue; } break; }
      const s = Math.min(m, d); IS.x += dx / d * s; IS.z += dz / d * s; hx = dx / d; hz = dz / d; m -= s;
      if (s >= d - 1e-4 && tr.length) tr.shift(); }
    [IS.x, IS.z] = iPushA(IS.x, IS.z, up, F.radius);
    IS.y = iGroundA(IS.x, IS.z, IS.y);
    const moved = Math.hypot(IS.x - ox, IS.z - oz);
    if (want > 0.002 && moved < want * 0.25) { IS.stuck += dt; if (IS.stuck > 1.2) { IS.stuck = 0; if (tr.length) { const q = tr.shift(); IS.x = q.x; IS.z = q.z; } } } else IS.stuck = 0;   // tersangkut: loncat ke titik jejak berikutnya
    if (moved > 1e-4 && (hx || hz)) IS.rot += iAng(IS.rot, Math.atan2(hx, hz)) * (1 - Math.exp(-dt * 10));   // menghadap arah jalan
    else if (IS.v < 0.1) { const dx = p.x - IS.x, dz = p.z - IS.z; if (dx * dx + dz * dz > 0.25) IS.rot += iAng(IS.rot, Math.atan2(dx, dz)) * (1 - Math.exp(-dt * 4)); }   // berhenti: menoleh ke pemain
    const rt = Math.min(1, Math.max(0, (IS.v - F.run0) / (F.run1 - F.run0))); IS.run += (rt - IS.run) * (1 - Math.exp(-dt * 6));
    IS.w += ((IS.v > 0.08 ? 1 : 0) - IS.w) * (1 - Math.exp(-dt * 8)); if (IS.w < 0.002) IS.w = 0;
    IS.ph = (IS.ph + moved / ((F.stride0 + (F.stride1 - F.stride0) * IS.run) * Math.max(1, IS.v / F.run1))) % 1;   // makin kencang, langkah makin panjang (bukan makin cepat berganti)
    iPose(); iPlace(qBob(IS.ph) * IS.w * (1 + 0.8 * IS.run)); };
  const iIdle = (p, dt) => {   // menunggu: kaki merapat kembali, lalu menoleh ke pemain bila dekat
    IS.v = 0;
    if (IS.w > 0) { IS.w = Math.max(0, IS.w - dt * 2.5); iPose(); iPlace(qBob(IS.ph) * IS.w); }
    if (IS.mode === 'stay' && (IS.out || IS.room === curRoom)) { const dx = p.x - IS.x, dz = p.z - IS.z, d2 = dx * dx + dz * dz;
      if (d2 > 0.25 && d2 < 36) { IS.rot += iAng(IS.rot, Math.atan2(dx, dz)) * (1 - Math.exp(-dt * 3)); isabelG.rotation.y = IS.rot; } } };
  mainKids = group.children.slice().filter(c => c !== isabelG && c !== iShadow);   // Isabel (& bayangannya) diatur sendiri lewat iVis(): ia bisa ikut pemain ke kamar   // semua isi aula, galeri & dapur (disembunyikan selama pemain di ruang kamar; ruang kamar dibangun belakangan, tidak termasuk)

  return {
    group: root, ready: true,
    // ---- sorotan kamera ke ratu saat pemain masuk: k 0..1, dari kaki naik ke wajah (kamera merendah di depan panggung lalu mundur & naik pelan). Koordinat dunia. ----
    queenPos() { if (queenState !== 2) return null; const v = new THREE.Vector3(); queenG.getWorldPosition(v); return { x: v.x, y: v.y, z: v.z }; },   // titik pinggul ratu (dunia)
    queenNear(wx, wz, y) {   // pemain di LANTAI aula tepat sebelum tangga singgasana (radius KNEEL_ZONE dari titik berlutut, belum menginjak tangga) -> boleh menghadap / membungkuk
      if (queenState !== 2 || !shown || curRoom || isUp(y === undefined ? 0 : y)) return false;
      if (QW.st !== 'seated') return false;   // ratu sedang berdiri / berjalan: belum bisa menghadap lagi
      const p = toLocal(wx, wz); return p.x < DAIS.x0 + 0.15 && Math.hypot(p.x - KNEEL_SPOT.x, p.z - KNEEL_SPOT.z) < KNEEL_ZONE; },
    queenCome() { if (queenState !== 2 || !QR || QW.st !== 'seated') return false; QW.st = 'rising'; QW.t = 0; return true; },   // ratu berdiri & berjalan menghampiri pemain (false = tidak bisa: langsung bicara dari singgasana)
    queenArrived: () => QW.st === 'wait',   // ratu sudah berhenti di depan pemain
    queenLeave() { if (QW.st === 'wait') { QW.st = 'turn1'; QW.t = 0; QW.rot = -PI / 2; } },   // selesai bicara: ratu berbalik, kembali ke singgasana & duduk
    queenBusy: () => QW.st !== 'seated',
    kneelSpot() { const w = toWorld(KNEEL_SPOT.x, KNEEL_SPOT.z); return { x: w.x, z: w.z }; },   // titik berlutut (dunia): di lantai, di tengah karpet, tepat sebelum anak tangga pertama
    queenTalk(on) { if (qAnim) qAnim.talk = !!on; },   // mulut ratu bergerak saat berbicara
    queenReady: () => queenState,   // 2 = siap, 1 = masih memuat, -1 / 0 = gagal / belum dimulai
    queenShot(k) {   // 4 kunci, dilewati mulus (Catmull-Rom): 0 kaki (rendah) -> 1 merangkak ke atas dari bawah -> 2 tinggi di atas menunduk ke ratu -> 3 turun, close-up wajah
      // OPTIMASI: tanpa alokasi per frame (array / objek dipakai ulang) supaya tidak memicu garbage-collector yang membuat sorotan patah-patah di HP
      const e = k * k * (3 - 2 * k), P0 = Y + DAIS.top, X = THRONE.x;
      const u = e * 3, n = Math.min(2, Math.floor(u)), f = u - n, f2 = f * f, f3 = f2 * f;
      const a = SHOT_K[Math.max(0, n - 1)], b = SHOT_K[n], c = SHOT_K[n + 1], d = SHOT_K[Math.min(3, n + 2)];
      for (let i = 0; i < 5; i++) _qs[i] = 0.5 * ((2 * b[i]) + (-a[i] + c[i]) * f + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * f2 + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * f3);
      const cw = toWorld(X - _qs[0], _qs[1]), lw = toWorld(X + _qs[3], 0);
      _shot.cam.x = cw.x; _shot.cam.y = P0 + _qs[2]; _shot.cam.z = cw.z; _shot.look.x = lw.x; _shot.look.y = P0 + _qs[4]; _shot.look.z = lw.z;
      return _shot;
    },
    queenWalkShot() {   // sorotan SAAT ratu berjalan menghampiri pemain: kamera di depan ratu (sisi pintu), agak ke samping, setinggi dada; mengikuti ratu & makin dekat saat ia mendekat. null = ratu belum siap. Koordinat dunia.
      if (queenState !== 2 || !QR) return null;
      const W = QWALK_SHOT, qx = queenG.position.x, qy = queenG.position.y, qz = queenG.position.z;
      const p = qEase((QSEAT_X - qx) / (QSEAT_X - QSTOP));   // 0 = masih di singgasana, 1 = sampai di depan pemain
      const d = W.dist0 + (W.dist1 - W.dist0) * p, side = W.side0 + (W.side1 - W.side0) * p;
      const cw = toWorld(qx - d, qz + side), lw = toWorld(qx - W.lead, qz);
      _wshot.cam.x = cw.x; _wshot.cam.y = qy + W.camH; _wshot.cam.z = cw.z;
      _wshot.look.x = lw.x; _wshot.look.y = qy + W.lookH; _wshot.look.z = lw.z;
      return _wshot;
    },
    // ---- Isabel menemani pemain ----
    isabelMode: () => IS.mode,   // 'home' | 'follow' | 'stay'
    isabelNear(wx, wz, y) {   // pemain cukup dekat (& selantai) dengan Isabel yang diam / berhenti -> tombol Ajak / Suruh menunggu
      if (!iCan()) return false;
      if (Math.abs((y === undefined ? 0 : y) - IS.y) > 1.3) return false;
      const p = iP(wx, wz); if (Math.hypot(p.x - IS.x, p.z - IS.z) > IFOLLOW.near) return false;
      return IS.mode !== 'follow' || IS.v < 0.3; },
    isabelToggle(wx, wz) {   // ajak ikut <-> suruh menunggu; kembalikan mode baru ('follow' | 'stay'), null bila tidak bisa
      if (!iCan()) return null;
      IS.trail.length = 0; IS.talk = 1.8; IS.v = 0; IS.moving = false; IS.stuck = 0;
      if (IS.mode === 'follow') IS.mode = 'stay'; else { const p = iP(wx, wz); IS.mode = 'follow'; IS.lx = p.x; IS.lz = p.z; loadIsabelPajama(); }
      iSetCircles(); return IS.mode; },
    isabelUpdate(wx, wz, dt, env) {   // tiap frame saat pemain di dunia (luar / dalam istana): Isabel mengikuti jejak pemain / menunggu
      if (env) iEnv = env;
      if (!shown && IS.out && iAnim && isabelState === 2) stepIsabel(dt);   // di luar aula update() tidak dipanggil, jadi kedip & bicara dijalankan dari sini
      if (IS.sleep || IS.hold) { IS.v = 0; return; }   // sedang tidur bersama pemain: tidak mengikuti / berjalan (diatur isabelLie dari game.js)
      if (IS.mode === 'follow' && IS.out === shown) { if (IS.out) iPause(); else iGoHome(); return; }   // ruang tidak sama dengan pemain (mis. mulai ulang): berhenti / pulang
      if (!iCan()) return;
      dt = Math.min(0.05, Math.max(0, dt)); const p = iP(wx, wz);
      if (IS.mode === 'follow') iFollow(p, dt); else if (IS.mode === 'stay') iIdle(p, dt); else iTurn(p, dt); },
    isabelPos() {   // posisi Isabel (dunia) atau null bila tidak terlihat / belum siap
      if (!iCan()) return null; if (IS.out) return { x: IS.x, y: IS.y, z: IS.z, rot: IS.rot };
      const w = toWorld(IS.x, IS.z); return { x: w.x, y: IS.y, z: w.z }; },
    isabelHead(v) { if (!iCan() || !iAnim || !iAnim.head) return false; iAnim.head.getWorldPosition(v); return true; },   // posisi dunia kepala Isabel (skin aktif) ke vektor v; false bila belum siap (dipakai kamera tidur bersama)
    isabelLook(t) { IS.look = Math.max(0, Math.min(1, t || 0)); },   // 0..1: Isabel menoleh ke pemain (dipakai saat berbaring berdampingan di kasur)
    isabelHold(on) { IS.hold = !!on; if (on) { IS.v = 0; IS.w = 0; IS.run = 0; IS.moving = false; IS.trail.length = 0; if (IR) iPose(); iPlace(0); } },   // berdiri diam (dipeluk dari belakang); saat dilepas, Isabel kembali mengikuti pemain
    isabelKiss(v) { IS.kiss = Math.max(0, Math.min(1, v || 0)); },   // 0..1: Isabel memejamkan mata saat dicium
    isabelShy(v) { IS.shy = Math.max(0, Math.min(1, v || 0)); },   // 0..1: ekspresi malu / gugup (alis turun cemas, mulut kecil terbuka) saat dipeluk
    isabelBlush(v) { IS.blush = Math.max(0, Math.min(1, v || 0)); },   // 0..1: wajah Isabel memerah (tersipu), dihaluskan di stepIsabel
    isabelChat(on) { IS.chat = !!on; if (!on) { IS.talk = 0; IS.speakReq = null; if (iAnim) iAnim.seqI = iAnim.seq.length; } },   // selesai mengobrol: mulut ikut berhenti   // mulai / selesai mengobrol
    isabelSpeak(sec, text) { IS.talk = Math.max(0, sec); if (text) IS.speakReq = { text, sec: Math.max(0.3, sec) }; },   // text (opsional): mulut mengikuti huruf pada kalimat           // mulut Isabel bergerak sekian detik (saat ia mengucapkan satu kalimat)
    isabelLie(a, x, y, z, face, hx, hz) {   // tidur bersama pemain di kasur penginapan: a = 0..1 (0 = berdiri lagi / selesai), (x, y, z) = titik di kasur (dunia), face = arah badan (kepala -> kaki); (hx, hz) = titik dunia tempat KEPALA Isabel harus berada (di samping kepala pemain): badannya digeser otomatis supaya kepalanya tepat di situ
      if (!IR) return;
      if (!(a > 0)) { IS.look = 0; IS.blush = 0; IS.shy = 0; IS.kiss = 0; IS.sleep = false; IS.flip = false; IS.flipChk = false; isabelG.rotation.x = 0; isabelG.rotation.order = 'XYZ'; iVis(); return; }
      if (!IS.sleep) { IS.sleep = true; IS.flip = false; IS.flipChk = false; IS.v = 0; IS.w = 0; IS.run = 0; IS.moving = false; IS.trail.length = 0; iPose(); isabelG.rotation.order = 'YXZ'; iSetCircles(); }
      const lay = () => { IS.x = x; IS.y = y; IS.z = z; IS.rot = face + (IS.flip ? PI : 0); iPlace(0); isabelG.rotation.x = -PI / 2 * a; isabelG.position.y += ISABEL_BED_LIFT * a; };
      lay(); if (iShadow) iShadow.visible = false;
      if (hx !== undefined && iAnim && iAnim.head) {
        isabelG.updateMatrixWorld(true); iAnim.head.getWorldPosition(_ihv);
        if (a > 0.4 && !IS.flipChk) {   // sekali per tidur: bila kepalanya jatuh di sisi KAKI kasur (badan terbalik), putar 180 derajat
          IS.flipChk = true;
          if ((_ihv.x - IS.x) * Math.sin(face) + (_ihv.z - IS.z) * Math.cos(face) > 0.3) { IS.flip = true; console.warn('Isabel berbaring terbalik; diputar 180 derajat otomatis.'); lay(); isabelG.updateMatrixWorld(true); iAnim.head.getWorldPosition(_ihv); }
        }
        isabelG.position.x += (hx - _ihv.x) * a; isabelG.position.z += (hz - _ihv.z) * a;   // kepala Isabel tepat di samping kepala pemain
        isabelG.updateMatrixWorld(true);
      } },
    isabelSkin(key) {   // ganti skin Isabel ('normal' | 'pajama'); false bila skin itu belum siap / sudah dipakai. Aman dipanggil tiap frame.
      const v = iSkins[key]; if (!v || key === iSkinKey) return false;
      for (const k in iSkins) iSkins[k].fbx.visible = k === key;
      iSkinKey = key; IR = v.IR; iAnim = v.A; if (iAnim) iAnim.reset(); if (IR) iPose(); return true; },
    isabelPause() { iPause(); },   // pemain masuk tempat yang tidak bisa dimasuki Isabel (gereja / istana lain / arena): ia menunggu di tempat
    isabelExit(sp, env) {   // pemain keluar aula (sp = titik muncul di luar, dunia): Isabel yang sedang ikut keluar bersamanya
      if (env) iEnv = env;
      if (IS.mode !== 'follow' || !IR || IS.out || !iEnv) return;
      iReparent(iEnv.parent); iLook(true); IS.out = true; IS.room = null; IS.y = iEnv.ground(sp.x, sp.z);
      iBeside(sp.x, sp.z, Math.sin(sp.face), Math.cos(sp.face)); },
    isabelWarp(sp, env, force) {   // pemain pindah ke dalam / keluar bangunan lain di dunia luar (Penginapan Karavan & kamarnya): Isabel muncul di sisi pemain (sp = titik muncul pemain, dunia: x, y, z, face)
      if (env) iEnv = env;         // aturan tabrakan & lantai tempat baru (env.push menjepit Isabel ke dalam ruangan / mendorongnya keluar dari dinding)
      if (!IR || !IS.out || !iEnv || (IS.mode !== 'follow' && !force)) return;   // hanya Isabel yang ikut (force = juga yang menunggu, mis. tertinggal di dalam saat pemain keluar)
      IS.room = null; IS.y = sp.y !== undefined ? sp.y : iEnv.ground(sp.x, sp.z);
      iBeside(sp.x, sp.z, Math.sin(sp.face), Math.cos(sp.face)); },
    isabelEnter(sp) {   // pemain masuk aula (sp = titik muncul di dalam, dunia): Isabel yang ikut masuk bersamanya; yang menunggu di luar kembali ke singgasana
      if (!IS.out) return;
      if (IS.mode !== 'follow' || !IR) { iGoHome(); return; }
      iReparent(group); iLook(false); IS.out = false; IS.room = null; iWarp(sp); },
    isabelObj: () => isabelState === 2 ? isabelG : null,   // objek Isabel (pemanasan shader & tekstur di game.js)
    queenObj: () => queenState === 2 ? queenG : null,   // objek ratu (untuk pemanasan shader & tekstur di game.js)
    dim: USE_POINT_LIGHTS ? 0.5 : 0.22,   // seberapa banyak world.js meredupkan cahaya langit di dalam (0 = tidak, 1 = gelap); tanpa lampu titik harus tetap terang
    show(v) { if (!v && !(IS.mode === 'follow' && !IS.out)) { if (!IS.out) iGoHome(); }   // yang sedang ikut tidak dikembalikan: ia dipindah ke luar oleh isabelExit()
       if (v) { loadQueen(); loadIsabel(); loadGuards(true); } if (qAnim) qAnim.reset(); if (iAnim) iAnim.reset(); qReset(); shown = v; last = null; curRoom = null; for (const c of mainKids) c.visible = true; for (const k in roomGroups) roomGroups[k].visible = false; group.visible = v; for (const o of hide) o.visible = !v; for (const [l, b] of lights) l.intensity = v ? b : 0; iVis(); },
    // ---- kamar-kamar lantai 2: pintu tertutup di galeri -> ruang kamar lebar terpisah ----
    inRoom: () => curRoom,
    doorAt(wx, wz, y) { if (curRoom || !isUp(y === undefined ? 0 : y)) return null; const p = toLocal(wx, wz), r = roomDoorAt(p.x, p.z); return r ? r.id : null; },
    roomExit(wx, wz) { if (!curRoom) return false; const p = toLocal(wx, wz); return inKamarExit(p.x, p.z); },
    enterRoom(id) {   // dipanggil game.js saat layar gelap: kembalikan titik muncul (dunia) di dalam pintu kamar
      const r = roomById[id]; if (!r) return null;
      if (!roomGroups[id]) roomGroups[id] = buildRoom(r);
      curRoom = id; for (const k in roomGroups) roomGroups[k].visible = k === id; for (const c of mainKids) c.visible = false; last = null;
      const w = toWorld(KAMAR_SPAWN.x, KAMAR_SPAWN.z), sp = { x: w.x, z: w.z, y: KY, face: faceLocal(1, 0), name: r.name }; iWarp(sp); return sp;
    },
    leaveRoom() {     // keluar kamar: muncul di galeri tepat di depan pintu kamar tadi, menghadap menjauhi pintu
      const r = roomById[curRoom] || F2_ROOMS[0]; curRoom = null; for (const k in roomGroups) roomGroups[k].visible = false; for (const c of mainKids) c.visible = true; last = null;
      const w = toWorld(r.cx, r.s * (F2.wallZ - 1.6)), sp = { x: w.x, z: w.z, y: Y2, face: faceLocal(0, -r.s), name: 'Galeri Lantai 2' }; iWarp(sp); return sp;
    },
    update(t) {
      if (!shown) return;
      if (qAnim && queenState === 2) stepQueen(t);
      if (guards.length && !curRoom) stepGuards(t);   // napas prajurit penjaga
      if (iAnim && isabelState === 2) { stepIsabel(iLastT === null ? 0 : t - iLastT); iLastT = t; }   // kedip, bicara & kepala Isabel (di dalam aula)
      if (queenState === 2) qStep(t);                 // ratu berdiri / berjalan / duduk
      const f = 0.86 + 0.1 * Math.sin(t * 11) + 0.05 * Math.sin(t * 17.3 + 1); Mt.flame.color.setRGB(1, 0.66 + 0.1 * f, 0.22 + 0.1 * f);
      for (let i = 0; i < flames.length; i++) { const s = 0.9 + 0.2 * Math.sin(t * 9 + i * 1.7); flames[i].scale.set(s, 0.9 + 0.25 * Math.sin(t * 12 + i), s); }
      for (let i = 0; i < braziers.length; i++) { const s = 1 + 0.12 * Math.sin(t * 8 + i * 2); braziers[i].scale.set(s, 1 + 0.2 * Math.sin(t * 10 + i * 3), s); }
      if (lights.length) { lights[0][0].intensity = LIGHT.chand * (0.96 + 0.05 * Math.sin(t * 7.1)); lights[1][0].intensity = LIGHT.chand * (0.96 + 0.05 * Math.sin(t * 6.3 + 2)); lights[2][0].intensity = LIGHT.throne * (0.95 + 0.06 * Math.sin(t * 9.2 + 1)); }
    },
    collide(pos, r) {
      if (curRoom) {   // di dalam ruang kamar: hanya dinding kamar & perabotnya
        const q = toLocal(pos.x, pos.z), cl = (v, a, b) => Math.min(Math.max(v, a), b), K = KAMAR_RECT; let x = cl(q.x, K.x0 + r, K.x1 - r), z = cl(q.z, K.z0 + r, K.z1 - r);
        for (const c of KAMAR_CIRCLES) { const dx = x - c.x, dz = z - c.z, min = c.r + r, d2 = dx * dx + dz * dz; if (d2 >= min * min) continue; const d = Math.sqrt(d2) || 1e-4; x = c.x + dx / d * min; z = c.z + dz / d * min; }
        x = cl(x, K.x0 + r, K.x1 - r); z = cl(z, K.z0 + r, K.z1 - r); const w = toWorld(x, z); pos.x = w.x; pos.z = w.z; return;
      }
      const up = isUp(pos.y), p = toLocal(pos.x, pos.z); let x = p.x, z = p.z;
      if (!inside(x, z, r, up)) [x, z] = nearest(x, z, r, up);
      if (!up) for (const w of F2_WALLS) [x, z] = pushRect(x, z, w, r);   // pagar tangga: naik hanya dari kaki tangga
      for (const c of (up ? F2_CIRCLES : AULA_CIRCLES)) { const dx = x - c.x, dz = z - c.z, min = c.r + r, d2 = dx * dx + dz * dz; if (d2 >= min * min) continue; const d = Math.sqrt(d2) || 1e-4; x = c.x + dx / d * min; z = c.z + dz / d * min; }
      if (!inside(x, z, r, up)) [x, z] = nearest(x, z, r, up);
      // tepi samping panggung: naik / turun hanya lewat tangga depan. Sisi ditentukan dari posisi SEBELUMNYA (bukan dari posisi sekarang),
      // jadi lonjakan besar dalam satu frame (lag, berguling) tidak bisa menembus tepi.
      if (!up && x >= DAIS.x0) { const az = Math.abs(z), lo = DAIS.z - r, hi = DAIS.z + r;
        if (az > lo && az < hi) { const wasOn = last ? Math.abs(last.z) < DAIS.z : az < DAIS.z; z = (z < 0 ? -1 : 1) * (wasOn ? lo : hi); } }
      last = { x, z };
      const w = toWorld(x, z); pos.x = w.x; pos.z = w.z;
    },
    groundY(wx, wz, y) { if (curRoom) return KY; const p = toLocal(wx, wz); const sh = stairH(p.x, p.z); if (sh !== null) return Y + sh; return isUp(y === undefined ? 0 : y) ? Y2 : Y + stepY(p.x, p.z); },
    area(wx, wz, y) { if (curRoom) return roomById[curRoom].name; const p = toLocal(wx, wz); if (y !== undefined && isUp(y)) { const u = F2_RECTS.find(q => inRect(q, p.x, p.z, -0.2)); return u ? u.name : 'Galeri Lantai 2'; }
      const r = rectAt(p.x, p.z); if (r.id === 'aula' && p.x >= DAIS.x0 && Math.abs(p.z) <= DAIS.z) return 'Singgasana Kekaisaran'; return r.name; },
    clipCam(from, to) {   // kamera tidak boleh menembus dinding / langit-langit / lantai
      if (curRoom) {   // di dalam kamar: kamera tetap di dalam kotak ruangan
        const q = toLocal(to.x, to.z), cl = (v, a, b) => Math.min(Math.max(v, a), b), K = KAMAR_RECT, w = toWorld(cl(q.x, K.x0 + 0.4, K.x1 - 0.4), cl(q.z, K.z0 + 0.4, K.z1 - 0.4));
        to.x = w.x; to.z = w.z; to.y = Math.min(Math.max(to.y, KY + 0.35), KY + KAMAR.h - 0.4); return to;
      }
      const up = isUp(from.y), f = toLocal(from.x, from.z); let q = toLocal(to.x, to.z);
      { // telusuri dari pemain ke arah kamera dengan langkah 0,25 m: berhenti di dinding PERTAMA (pencarian biner bisa melompati dinding ke ruang sebelah)
        const dx = q.x - f.x, dz = q.z - f.z, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25)); let lo = 0, hi = -1;
        for (let i = 1; i <= n; i++) { const t = i / n; if (inside(f.x + dx * t, f.z + dz * t, 0.4, up)) lo = t; else { hi = t; break; } }
        if (hi >= 0) { for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (inside(f.x + dx * m, f.z + dz * m, 0.4, up)) lo = m; else hi = m; } q = { x: f.x + dx * lo, z: f.z + dz * lo }; } }
      const r = rectAt(q.x, q.z), w = toWorld(q.x, q.z); to.x = w.x; to.z = w.z;
      const room = up && F2_RECTS.some(u => ['ratu', 'raja', 'putri', 'tamu', 'pangeran'].includes(u.id) && inRect(u, q.x, q.z, -0.3));
      let lo2 = up ? Y2 + 0.35 : Y + 0.35, hi2 = room ? Y2 + F2.ceil - 0.4 : Y + r.h - 0.4;
      if (!up && q.x >= F2.x0 - 0.3 && Math.abs(q.z) >= F2.rail - 0.3) hi2 = Math.min(hi2, Y + F2.h - 0.7);   // di bawah pelat galeri
      to.y = Math.min(Math.max(to.y, lo2), hi2); return to;
    },
  };
}
