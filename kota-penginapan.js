import * as THREE from 'three';

// ============================================================
//  INTERIOR PENGINAPAN KOTA DUNGEON — ruang umum kayu hangat (lantai atas): meja resepsionis dengan Ratri si pemilik penginapan (bisa diajak bicara),
//  perapian menyala, meja makan dengan dua bangku, rak kunci, permadani di dekat pintu, dan TANGGA TURUN di dinding kiri menuju
//  tiga KAMAR SEDERHANA DI BAWAH TANAH (lorong batu + kamar 1-3, masing-masing berisi satu kasur, peti, dan lilin).
//  Karena game.js menjaga y pemain = 0 di dalam interior, lantai bawah tanah dibangun di area lokal yang terpisah (z = BZ = 20 dari pusat ruang umum),
//  dan pindah lantai dilakukan di collide(): melangkah ke lubang tangga / kaki tangga = layar memudar sebentar, pemain (dan Isabel) dipindah ke lantai lain.
//  Tidak ada perubahan di game.js; API tetap sama.
//  (Bukan Penginapan Karavan di Kota Kekaisaran; itu punya game.js sendiri: world.inn.)
//  API SAMA dengan interior Pandai Besi / Toko Ramuan supaya game.js memakainya dengan pola yang sama:
//    { group, name, icon, hint, spawn{x,z,face}, show(v), collide(pos, r), clipCam(playerPos, camPos), nearSpot(x, z), nearExit(x, z), inside(x, z), update(dt, t, x, z) }
//  Ruangan dibangun di luar peta (LODGE_ORIGIN) supaya tidak bertumpuk dengan dunia luar; hanya terlihat saat show(true).
//  Ukuran / tata letak: lihat bagian "TATA LETAK" (koordinat lokal: pusat ruangan = (0, 0), pintu di sisi +z).
// ============================================================
export const LODGE_ORIGIN = { x: 7600, z: -7800 };   // geser bila perlu (harus jauh dari area dunia dan dari ruangan lain: guild, pandai besi, toko ramuan)
const LIGHT_SCALE = (+THREE.REVISION >= 155) ? 1 : 0.35;   // three r155+ memakai satuan cahaya fisik; ubah angka ini bila ruangan terlalu gelap / terang

const W = 9, D = 7, H = 3.5;   // lebar (x), kedalaman (z), tinggi ruangan
const DOOR_W = 1.7, DOOR_H = 2.4;
const NPC_POS = { x: 2.2, z: -2.8 };   // Ratri berdiri di balik meja resepsionis
const SPOT = { id: 'lodge', short: 'Ratri', name: 'Ratri — Pemilik Penginapan' };

// ---- lantai bawah tanah (koordinat lokal; pusat ruang umum = (0, 0)) ----
const BZ = 20, H2 = 2.6, DOOR_H2 = 2.1, DOOR_W2 = 1.1;                 // BZ = pusat lantai bawah tanah di sumbu z; H2 = tinggi langit-langit bawah tanah
const BX0 = -8.0, BX1 = 5.8, BZ0 = BZ - 4.2, BZ1 = BZ + 1.8, WALLZ = BZ - 0.6;   // batas lantai bawah tanah; WALLZ = dinding pemisah lorong / kamar
const ROOM_X = [-3.85, 0, 3.85];                                       // pusat kamar 1-3 (di sisi -z lorong)
const HOLE = { x0: -4.2, x1: -2.9, z0: 0.5, z1: 2.7 };                  // lubang tangga turun di ruang umum (dinding kiri)
const STAIR_UP_X = -6.0;                                                // lorong bawah tanah: lx < ini = naik tangga ke ruang umum
const ARRIVE_UP = { x: -5.3, z: BZ + 0.6 };                             // muncul di lorong setelah turun
const ARRIVE_LOBBY = { x: -3.55, z: -0.35 };                            // muncul di ruang umum setelah naik
const levelOf = lz => (lz > 10 ? 1 : 0);                                // 0 = ruang umum, 1 = bawah tanah

export function buildLodgeInterior() {
  const OX = LODGE_ORIGIN.x, OZ = LODGE_ORIGIN.z;
  const group = new THREE.Group(); group.name = 'kota-penginapan'; group.position.set(OX, 0, OZ); group.visible = false;
  const S = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, ...extra });
  const mat = {
    wall: S(0x9a8766), wood: S(0x7a5732), woodD: S(0x4a3322), beam: S(0x3d2a1a), stone: S(0x6c675b), stoneD: S(0x4b473f), iron: S(0x3a3b42, { metalness: 0.5, roughness: 0.55 }),
    gold: S(0xe6bd4a, { metalness: 0.5, roughness: 0.45 }), skin: S(0xe0b088), hair: S(0x3a2616), black: S(0x15120f), linen: S(0xe8dcc0), dress: S(0x9a4a3a), apron: S(0xe8dcb8),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ff, emissive: 0xffe0a8, emissiveIntensity: 1.1, roughness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb81c, emissiveIntensity: 1.3, roughness: 0.6, flatShading: true }),
    coal: new THREE.MeshStandardMaterial({ color: 0x401a08, emissive: 0xff5a10, emissiveIntensity: 1.3, roughness: 0.8, flatShading: true }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 }),
  };
  const add = (geo, m, x, y, z, parent = group, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); parent.add(k); return k; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (a, b, h, n = 10) => new THREE.CylinderGeometry(a, b, h, n);

  // ---------- tekstur papan lantai + lingkaran cahaya pintu ----------
  const planks = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { const g = 80 + (Math.random() * 26 | 0); x.fillStyle = `rgb(${g + 26},${g + 8},${g - 16})`; x.fillRect(0, i * 32, 256, 32); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, i * 32, 256, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 3, D / 3); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const glowT = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 3, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, 'rgba(255,236,150,0.8)'); g.addColorStop(0.8, 'rgba(255,190,60,0.4)'); g.addColorStop(1, 'rgba(255,190,60,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  // ---------- ruangan: lantai, langit-langit, dinding, pintu ----------
  const plankMat = (w, d) => { const t = planks.clone(); t.needsUpdate = true; t.repeat.set(w / 3, d / 3); return new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); };
  const floorPiece = (x0, x1, z0, z1) => add(box(x1 - x0, 0.4, z1 - z0), plankMat(x1 - x0, z1 - z0), (x0 + x1) / 2, -0.19, (z0 + z1) / 2);   // permukaan lantai di y = 0.01
  { const FX0 = -W / 2 - 0.5, FX1 = W / 2 + 0.5, FZ0 = -D / 2 - 0.5, FZ1 = D / 2 + 0.5;   // lantai dipotong supaya ada lubang tangga
    floorPiece(FX0, FX1, FZ0, HOLE.z0); floorPiece(FX0, FX1, HOLE.z1, FZ1); floorPiece(FX0, HOLE.x0, HOLE.z0, HOLE.z1); floorPiece(HOLE.x1, FX1, HOLE.z0, HOLE.z1); }
  add(box(W + 1, 0.3, D + 1), mat.woodD, 0, H + 0.15, 0);   // langit-langit
  for (const z of [-2.2, 0, 2.2]) add(box(W, 0.26, 0.28), mat.beam, 0, H - 0.13, z);   // balok melintang
  add(box(W + 0.6, H, 0.3), mat.wall, 0, H / 2, -D / 2 - 0.15);   // dinding belakang
  for (const s of [-1, 1]) add(box(0.3, H, D + 0.6), mat.wall, s * (W / 2 + 0.15), H / 2, 0);   // dinding kiri & kanan
  { const sw = (W - DOOR_W) / 2;   // dinding depan + ambang pintu
    for (const s of [-1, 1]) add(box(sw, H, 0.3), mat.wall, s * (DOOR_W / 2 + sw / 2), H / 2, D / 2 + 0.15);
    add(box(DOOR_W + 0.2, H - DOOR_H, 0.3), mat.wall, 0, DOOR_H + (H - DOOR_H) / 2, D / 2 + 0.15);
    for (const s of [-1, 1]) add(box(0.14, DOOR_H, 0.2), mat.beam, s * (DOOR_W / 2 + 0.07), DOOR_H / 2, D / 2 - 0.05);
    add(box(DOOR_W + 0.28, 0.14, 0.2), mat.beam, 0, DOOR_H + 0.07, D / 2 - 0.05);
    add(box(DOOR_W - 0.05, DOOR_H - 0.05, 0.1), mat.wood, 0, DOOR_H / 2, D / 2 + 0.02);   // daun pintu (tertutup)
    add(new THREE.SphereGeometry(0.06, 8, 6), mat.gold, 0.5, 1.1, D / 2 - 0.1);   // gagang
  }
  for (const [x, z] of [[-W / 2 + 0.1, -D / 2 + 0.1], [W / 2 - 0.1, -D / 2 + 0.1], [-W / 2 + 0.1, D / 2 - 0.1], [W / 2 - 0.1, D / 2 - 0.1]]) add(box(0.24, H, 0.24), mat.beam, x, H / 2, z);   // tiang sudut
  // jendela di dinding kanan (cahaya hangat)
  { const z = 0.9; add(box(0.08, 0.9, 1.0), mat.glass, W / 2 - 0.04, 2.0, z); for (const y of [1.55, 2.45]) add(box(0.12, 0.08, 1.1), mat.beam, W / 2 - 0.05, y, z); add(box(0.12, 0.9, 0.08), mat.beam, W / 2 - 0.05, 2.0, z); }

  // ---------- perapian (dinding belakang, kiri) ----------
  const FP = { x: -2.7, z: -D / 2 + 0.45 };
  add(box(2.2, 1.0, 0.9), mat.stone, FP.x, 0.5, FP.z); add(box(2.3, 0.1, 1.0), mat.stoneD, FP.x, 1.05, FP.z);   // dasar + papan atas
  add(box(1.5, 0.22, 0.5), mat.coal, FP.x, 0.45, FP.z + 0.08);   // bara
  add(box(2.0, 1.6, 0.4), mat.stone, FP.x, 1.9, FP.z - 0.25); add(box(0.8, H - 2.7, 0.7), mat.stone, FP.x, 2.7 + (H - 2.7) / 2, FP.z - 0.15);   // dinding belakang + cerobong
  const flames = []; for (const dx of [-0.4, 0, 0.4]) { const f = add(new THREE.ConeGeometry(0.18, 0.6, 6), mat.flame, FP.x + dx, 0.75, FP.z + 0.1); f.userData.ph = Math.random() * 6; flames.push(f); }
  const fireLight = new THREE.PointLight(0xff9a40, 12 * LIGHT_SCALE, 11, 2); fireLight.position.set(FP.x, 1.5, FP.z + 1.0); group.add(fireLight);

  // ---------- tangga turun ke kamar bawah tanah (dinding kiri): lubang, anak tangga menurun ke arah +z, pagar, lentera ----------
  { const hw = HOLE.x1 - HOLE.x0, hd = HOLE.z1 - HOLE.z0, hx = (HOLE.x0 + HOLE.x1) / 2;
    for (const x of [HOLE.x0 + 0.05, HOLE.x1 - 0.05]) add(box(0.1, 2.4, hd), mat.stoneD, x, -1.2, (HOLE.z0 + HOLE.z1) / 2);   // dinding lubang
    add(box(hw, 2.4, 0.1), mat.stoneD, hx, -1.2, HOLE.z1 - 0.05);   // dinding ujung
    add(box(hw, 0.1, hd), S(0x14110e), hx, -2.4, (HOLE.z0 + HOLE.z1) / 2);   // dasar gelap
    for (let k = 0; k < 6; k++) { const top = -0.3 - 0.34 * k; add(box(hw - 0.2, top + 2.4, 0.36), k % 2 ? mat.woodD : mat.wood, hx, (top - 2.4) / 2, HOLE.z0 + 0.2 + 0.36 * k); }   // 6 anak tangga menurun
    for (const x of [HOLE.x0 - 0.06, HOLE.x1 + 0.06]) add(box(0.12, 0.06, hd + 0.24), mat.beam, x, 0.04, (HOLE.z0 + HOLE.z1) / 2);   // bingkai kayu kiri & kanan
    add(box(hw + 0.24, 0.06, 0.12), mat.beam, hx, 0.04, HOLE.z1 + 0.06);
    for (const z of [HOLE.z0, HOLE.z1]) add(cyl(0.05, 0.05, 0.9, 6), mat.beam, HOLE.x1 + 0.06, 0.45, z); add(box(0.07, 0.07, hd), mat.beam, HOLE.x1 + 0.06, 0.9, (HOLE.z0 + HOLE.z1) / 2);   // pagar sisi kanan
    add(new THREE.SphereGeometry(0.12, 8, 6), mat.lamp, hx, -0.9, HOLE.z1 - 0.25); }   // lentera kecil di dasar tangga (cahaya hangat dari bawah) }
  { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');   // papan petunjuk di dinding kiri
    x.fillStyle = '#5a3e24'; x.fillRect(0, 0, 256, 96); x.strokeStyle = '#2a1a0c'; x.lineWidth = 6; x.strokeRect(3, 3, 250, 90); x.fillStyle = '#f0dcae'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center';
    x.fillText('KAMAR 1 - 3', 128, 40); x.fillText('\u2193 bawah tanah', 128, 74);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    add(box(1.1, 0.42, 0.05), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), -W / 2 + 0.03, 2.0, 1.6, group, 0, Math.PI / 2, 0); }

  // ---------- meja resepsionis + rak kunci ----------
  const CNT = { x0: 0.6, x1: 3.9, z0: -2.2, z1: -1.45 };
  const cx = (CNT.x0 + CNT.x1) / 2, cz = (CNT.z0 + CNT.z1) / 2;
  add(box(CNT.x1 - CNT.x0, 1.0, CNT.z1 - CNT.z0 - 0.1), mat.wood, cx, 0.5, cz); add(box(CNT.x1 - CNT.x0 + 0.2, 0.1, CNT.z1 - CNT.z0 + 0.2), mat.woodD, cx, 1.05, cz);
  for (let i = 0; i < 4; i++) add(box(0.72, 0.78, 0.04), mat.woodD, CNT.x0 + 0.45 + i * 0.85, 0.5, CNT.z1 - 0.03);   // panel papan depan meja
  add(box(0.45, 0.03, 0.32), S(0xe8dcb8), 1.3, 1.12, cz); add(cyl(0.015, 0.015, 0.3, 4), mat.black, 1.45, 1.2, cz, group, 0, 0, 0.9);   // buku tamu + pena
  add(cyl(0.1, 0.08, 0.2, 8), mat.gold, 3.3, 1.2, cz);   // bel meja
  add(box(1.6, 0.9, 0.08), mat.woodD, 2.3, 2.0, -D / 2 + 0.04);   // papan rak kunci di dinding belakang
  for (let i = 0; i < 6; i++) { const x = 1.7 + (i % 3) * 0.6, y = 2.2 - Math.floor(i / 3) * 0.4; add(cyl(0.015, 0.015, 0.1, 4), mat.iron, x, y, -D / 2 + 0.12, group, Math.PI / 2); add(box(0.08, 0.14, 0.02), mat.gold, x, y - 0.1, -D / 2 + 0.14); }   // kait + kunci kamar

  // ---------- meja makan + dua bangku (kanan depan) ----------
  const TABLE = { x: 2.9, z: 1.6 };
  add(cyl(0.7, 0.7, 0.08, 12), mat.wood, TABLE.x, 0.85, TABLE.z); add(cyl(0.08, 0.1, 0.85, 6), mat.woodD, TABLE.x, 0.42, TABLE.z);
  for (const a of [0.6, 3.74]) { add(cyl(0.22, 0.22, 0.45, 8), mat.woodD, TABLE.x + Math.cos(a) * 1.05, 0.22, TABLE.z + Math.sin(a) * 1.05); }   // dua bangku bundar
  add(cyl(0.07, 0.06, 0.12, 8), mat.iron, TABLE.x - 0.2, 0.95, TABLE.z + 0.1); add(cyl(0.07, 0.06, 0.12, 8), mat.iron, TABLE.x + 0.25, 0.95, TABLE.z - 0.2);   // dua cangkir
  add(cyl(0.2, 0.17, 0.08, 10), mat.apron, TABLE.x + 0.05, 0.93, TABLE.z + 0.35);   // piring roti

  // ---------- permadani + lingkaran cahaya keluar ----------
  add(box(2.2, 0.02, 2.8), S(0x6a3a2a), 0.3, 0.02, 1.7); add(box(1.9, 0.025, 2.5), S(0x8a4a34), 0.3, 0.025, 1.7);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowT, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, 0.05, D / 2 - 0.55); group.add(glow);

  // ---------- lampu gantung ----------
  for (const [x, z] of [[0.6, 0.4], [-2.4, 1.0]]) {
    add(cyl(0.012, 0.012, 0.6, 4), mat.iron, x, H - 0.3, z); add(new THREE.SphereGeometry(0.16, 8, 6), mat.lamp, x, H - 0.7, z);
    const l = new THREE.PointLight(0xffc880, 8 * LIGHT_SCALE, 10, 2); l.position.set(x, H - 0.8, z); group.add(l);
  }

  // ---------- Ratri, pemilik penginapan (model sederhana dari kotak & bola; berdiri di balik meja, menghadap pintu) ----------
  const npc = new THREE.Group(); npc.position.set(NPC_POS.x, 0, NPC_POS.z); group.add(npc);
  for (const s of [-1, 1]) { add(box(0.2, 0.75, 0.24), mat.woodD, s * 0.13, 0.38, 0, npc); add(box(0.24, 0.12, 0.32), mat.black, s * 0.13, 0.06, 0.04, npc); }
  const body = new THREE.Group(); body.position.y = 0.75; npc.add(body);
  add(box(0.62, 0.78, 0.36), mat.dress, 0, 0.39, 0, body); add(box(0.56, 0.52, 0.05), mat.apron, 0, 0.3, 0.2, body);   // gaun merah bata + celemek krem
  const head = new THREE.Group(); head.position.set(0, 1.05, 0); body.add(head);
  add(new THREE.SphereGeometry(0.21, 12, 10), mat.skin, 0, 0, 0, head); add(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat.hair, 0, 0.03, -0.02, head); add(new THREE.SphereGeometry(0.16, 8, 6), mat.hair, 0, 0.2, -0.12, head);   // rambut + sanggul
  for (const s of [-1, 1]) add(box(0.05, 0.05, 0.03), mat.black, s * 0.08, 0.04, 0.2, head);
  const armL = new THREE.Group(); armL.position.set(-0.4, 0.7, 0); body.add(armL); add(box(0.16, 0.6, 0.16), mat.skin, 0, -0.3, 0, armL);
  const armR = new THREE.Group(); armR.position.set(0.4, 0.7, 0); body.add(armR); add(box(0.16, 0.6, 0.16), mat.skin, 0, -0.3, 0, armR);
  add(box(0.1, 0.14, 0.02), mat.gold, 0, -0.62, 0.12, armR);   // kunci kamar di tangan kanan
  armR.rotation.x = -0.8;

  // ======================================================================
  //  LANTAI BAWAH TANAH: lorong batu (z = BZ) + tiga kamar sederhana di sisi -z lorong; tangga naik di ujung barat lorong
  // ======================================================================
  const stoneW = S(0x5b564c), stoneF = S(0x4a463e), stoneRug = S(0x7a2f2a), bClay = S(0x8a7a5a);
  const wallY = (x0, x1, z0, z1, y0, y1, m = stoneW) => add(box(x1 - x0, y1 - y0, z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  // lantai, langit-langit, dinding luar
  wallY(BX0 - 0.3, BX1 + 0.3, BZ0 - 0.3, BZ1 + 0.3, -0.4, 0.01, stoneF);
  wallY(BX0 - 0.3, BX1 + 0.3, BZ0 - 0.3, BZ1 + 0.3, H2, H2 + 0.3, mat.woodD);
  wallY(BX0 - 0.3, BX1 + 0.3, BZ0 - 0.3, BZ0, 0, H2); wallY(BX0 - 0.3, BX1 + 0.3, BZ1, BZ1 + 0.3, 0, H2);   // utara & selatan
  wallY(BX0 - 0.3, BX0, BZ0, BZ1, 0, H2); wallY(BX1, BX1 + 0.3, BZ0, BZ1, 0, H2);                         // barat & timur
  wallY(BX0, -5.8, BZ0, WALLZ + 0.1, 0, H2);                                                              // blok batu di barat laut (kamar 1 dibatasi di sini)
  for (const x of [-1.9, 1.9]) wallY(x - 0.1, x + 0.1, BZ0, WALLZ + 0.1, 0, H2);                          // sekat antar kamar
  { const xs = [-5.8, ...ROOM_X.flatMap(x => [x - DOOR_W2 / 2, x + DOOR_W2 / 2]), 5.8];                    // dinding lorong | kamar, dengan tiga ambang pintu
    for (let i = 0; i < xs.length; i += 2) wallY(xs[i], xs[i + 1], WALLZ - 0.1, WALLZ + 0.1, 0, H2);
    ROOM_X.forEach((xr, i) => {
      wallY(xr - DOOR_W2 / 2, xr + DOOR_W2 / 2, WALLZ - 0.1, WALLZ + 0.1, DOOR_H2, H2);                    // ambang atas
      for (const s of [-1, 1]) add(box(0.1, DOOR_H2, 0.26), mat.beam, xr + s * (DOOR_W2 / 2 + 0.05), DOOR_H2 / 2, WALLZ);   // kusen
      add(box(DOOR_W2 + 0.3, 0.1, 0.26), mat.beam, xr, DOOR_H2 + 0.05, WALLZ);
      const hinge = new THREE.Group(); hinge.position.set(xr - DOOR_W2 / 2 + 0.02, 0, WALLZ - 0.1); hinge.rotation.y = 1.25; group.add(hinge);   // daun pintu terbuka ke dalam kamar
      add(box(DOOR_W2 - 0.1, DOOR_H2 - 0.1, 0.06), mat.wood, (DOOR_W2 - 0.1) / 2, DOOR_H2 / 2, 0, hinge); add(new THREE.SphereGeometry(0.04, 6, 5), mat.gold, DOOR_W2 - 0.2, 1.0, 0.05, hinge);
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');   // papan nomor kamar
      x.fillStyle = '#4a3220'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#e6bd4a'; x.lineWidth = 4; x.strokeRect(4, 4, 56, 56); x.fillStyle = '#f0dcae'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.fillText(String(i + 1), 32, 46);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      add(box(0.3, 0.3, 0.03), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), xr, DOOR_H2 + 0.28, WALLZ + 0.14);
    });
  }
  for (const x of [-7.2, -3.4, 0.4, 4.2]) add(box(0.2, 0.2, BZ1 - WALLZ), mat.beam, x, H2 - 0.1, (BZ1 + WALLZ) / 2);   // balok langit-langit lorong
  add(box(9.4, 0.02, 1.0), stoneRug, -0.1, 0.02, BZ + 0.6);   // karpet panjang di lorong
  // tangga naik di ujung barat lorong (lima anak tangga ke lubang langit-langit; cahaya hangat dari atas)
  for (let k = 0; k < 5; k++) add(box(0.4, 0.5 * (k + 1), 2.2), k % 2 ? mat.woodD : mat.wood, -6.95 - 0.4 * k, 0.25 * (k + 1), BZ + 0.6);
  add(box(0.04, 0.9, 1.6), mat.lamp, BX0 + 0.04, 2.1, BZ + 0.6);   // celah cahaya di atas tangga
  // lorong: lentera dinding + tong
  const corridorLamps = [[-2.6, BZ1 - 0.15], [3.0, BZ1 - 0.15]];
  for (const [x, z] of corridorLamps) {
    add(box(0.05, 0.3, 0.05), mat.iron, x, 2.05, z + 0.08); add(new THREE.SphereGeometry(0.13, 8, 6), mat.lamp, x, 1.85, z);
    const l = new THREE.PointLight(0xffc880, 4.5 * LIGHT_SCALE, 7, 2); l.position.set(x, 1.8, z - 0.5); group.add(l);
  }
  for (const [x, z] of [[5.3, BZ + 1.35], [4.65, BZ + 1.45]]) { add(cyl(0.3, 0.33, 0.8, 10), mat.woodD, x, 0.4, z); add(cyl(0.31, 0.31, 0.04, 10), mat.iron, x, 0.55, z); }
  // tiga kamar: kasur (kepala ke dinding utara), peti, meja kecil + lilin, permadani, lampu
  const BLANKET2 = [0x9a3a3a, 0x3a5a9a, 0x3a7a4a];
  ROOM_X.forEach((xr, i) => {
    const zb = BZ0 + 1.15;
    wallY(xr - 1.75, xr + 1.75, zb + 1.1 - 3.2 + 0.0, BZ - 0.7, 0.01, 0.03, S(0x7a5732));   // lantai papan kayu (di atas lantai batu)
    add(box(1.0, 0.32, 2.0), mat.wood, xr, 0.26, zb); add(box(1.0, 0.7, 0.1), mat.woodD, xr, 0.5, BZ0 + 0.1);   // rangka + papan kepala
    add(box(0.9, 0.2, 1.86), mat.linen, xr, 0.5, zb); add(box(0.6, 0.12, 0.4), mat.linen, xr, 0.66, BZ0 + 0.5);   // kasur + bantal
    add(box(0.94, 0.1, 1.1), S(BLANKET2[i]), xr, 0.65, zb + 0.45);   // selimut
    add(box(0.42, 0.5, 0.42), mat.woodD, xr + 0.95, 0.25, BZ0 + 0.35);   // meja kecil di samping kasur
    add(cyl(0.04, 0.04, 0.14, 6), mat.linen, xr + 0.95, 0.57, BZ0 + 0.35); add(new THREE.SphereGeometry(0.035, 6, 5), mat.lamp, xr + 0.95, 0.68, BZ0 + 0.35);   // lilin
    add(box(0.7, 0.4, 0.42), mat.wood, xr - 1.3, 0.2, BZ0 + 0.4); add(box(0.72, 0.06, 0.44), mat.iron, xr - 1.3, 0.42, BZ0 + 0.4);   // peti pakaian
    add(box(1.0, 0.02, 1.3), S(0x8a4a34), xr, 0.04, BZ0 + 2.75);   // permadani kecil
    add(cyl(0.2, 0.2, 0.4, 8), mat.woodD, xr + 1.2, 0.2, BZ0 + 2.2);   // bangku
    add(box(0.6, 0.05, 0.05), mat.wood, xr - 1.0, 1.7, BZ0 + 0.04); for (const dx of [-0.2, 0.2]) add(cyl(0.02, 0.02, 0.1, 4), mat.iron, xr - 1.0 + dx, 1.62, BZ0 + 0.1, group, Math.PI / 2);   // palang gantung baju
    const rl = new THREE.PointLight(0xffb865, 3.2 * LIGHT_SCALE, 6, 2); rl.position.set(xr, 1.9, BZ0 + 1.9); group.add(rl);
    add(cyl(0.012, 0.012, 0.5, 4), mat.iron, xr, H2 - 0.25, BZ0 + 1.9); add(new THREE.SphereGeometry(0.11, 8, 6), mat.lamp, xr, H2 - 0.6, BZ0 + 1.9);   // lampu gantung
  });

  // ---------- tabrakan (koordinat lokal): kotak [x0, x1, z0, z1], per lantai ----------
  const boxesA = [
    [CNT.x0 - 0.1, CNT.x1 + 0.1, CNT.z0 - 0.1, CNT.z1 + 0.1],   // meja resepsionis
    [FP.x - 1.2, FP.x + 1.2, FP.z - 0.6, FP.z + 0.6],   // perapian
    [TABLE.x - 0.8, TABLE.x + 0.8, TABLE.z - 0.8, TABLE.z + 0.8],   // meja makan (bangku di dalam jangkauan ini)
    [HOLE.x1 - 0.02, HOLE.x1 + 0.12, HOLE.z0, HOLE.z1],   // pagar sisi kanan lubang tangga (sisi lain terbuka sebagai jalan turun)
  ];
  const boxesB = [
    [BX0, -5.8, BZ0, WALLZ + 0.1],   // blok batu barat laut
    [-2.0, -1.8, BZ0, WALLZ + 0.1], [1.8, 2.0, BZ0, WALLZ + 0.1],   // sekat antar kamar
    [BX0, -6.75, WALLZ + 0.1, BZ1],   // tangga naik (padat; pemicu naik ada di STAIR_UP_X)
    [4.3, 5.8, BZ + 1.0, BZ1],   // tong
  ];
  { const xs = [-5.8, ...ROOM_X.flatMap(x => [x - DOOR_W2 / 2, x + DOOR_W2 / 2]), 5.8];   // dinding lorong | kamar dengan ambang pintu
    for (let i = 0; i < xs.length; i += 2) boxesB.push([xs[i], xs[i + 1], WALLZ - 0.1, WALLZ + 0.1]); }
  ROOM_X.forEach(xr => boxesB.push(   // perabot kamar
    [xr - 0.5, xr + 0.5, BZ0, BZ0 + 2.15],   // kasur
    [xr + 0.74, xr + 1.16, BZ0 + 0.14, BZ0 + 0.56],   // meja kecil
    [xr - 1.65, xr - 0.95, BZ0 + 0.19, BZ0 + 0.61],   // peti
    [xr + 1.0, xr + 1.4, BZ0 + 2.0, BZ0 + 2.4]));   // bangku
  const LV = [
    { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, boxes: boxesA, npc: true },
    { x0: BX0, x1: BX1, z0: BZ0, z1: BZ1, boxes: boxesB, npc: false },
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const resolve = (lx, lz, r, L) => {   // dinding + perabot: posisi dijepit ke dalam lantai lalu didorong keluar dari kotak-kotak perabot
    const bx0 = L.x0 + r + 0.1, bx1 = L.x1 - r - 0.1, bz0 = L.z0 + r + 0.1, bz1 = L.z1 - r - 0.1;
    lx = clamp(lx, bx0, bx1); lz = clamp(lz, bz0, bz1);
    for (let pass = 0; pass < 3; pass++) {
      for (const b of L.boxes) {
        const qx = clamp(lx, b[0], b[1]), qz = clamp(lz, b[2], b[3]), dx = lx - qx, dz = lz - qz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-5) { lx = qx + dx / d * r; lz = qz + dz / d * r; }
        else { const o = [lx - b[0], b[1] - lx, lz - b[2], b[3] - lz], m = Math.min(...o), k = o.indexOf(m); if (k === 0) lx = b[0] - r; else if (k === 1) lx = b[1] + r; else if (k === 2) lz = b[2] - r; else lz = b[3] + r; }
      }
      if (L.npc) {   // Ratri sendiri (lingkaran)
        const dx = lx - NPC_POS.x, dz = lz - NPC_POS.z, d = Math.hypot(dx, dz), R = r + 0.4;
        if (d < R) { if (d > 1e-5) { lx = NPC_POS.x + dx / d * R; lz = NPC_POS.z + dz / d * R; } else lz = NPC_POS.z + R; }
      }
      lx = clamp(lx, bx0, bx1); lz = clamp(lz, bz0, bz1);
    }
    return [lx, lz];
  };

  // ---------- pindah lantai (dipicu di collide; game.js tidak perlu tahu) ----------
  let lastPx = OX, lastPz = OZ + D / 2 - 2.2, playerLvl = 0;   // posisi pemain terakhir (dari update) & lantainya; dipakai membedakan pemain dari Isabel
  let busy = false, pendingTo = null, pinX = 0, pinZ = 0;
  const $f = () => (typeof document !== 'undefined' ? document.getElementById('fade') : null);
  const toast = m => { const e = typeof document !== 'undefined' ? document.getElementById('msg') : null; if (e) { e.textContent = m; setTimeout(() => { if (e.textContent === m) e.textContent = ''; }, 2600); } };
  function startMove(to, px, pz) {   // layar memudar, lalu collide berikutnya memindahkan pemain
    busy = true; pendingTo = null; pinX = px; pinZ = pz;
    const f = $f(); if (f) { f.style.transition = 'opacity .3s'; f.style.opacity = 1; }
    setTimeout(() => { pendingTo = to; }, 330);
  }
  function finishMove(pos) {   // dipanggil dari collide saat fade penuh
    const to = pendingTo, A = to === 1 ? ARRIVE_UP : ARRIVE_LOBBY;
    pos.x = OX + A.x; pos.z = OZ + A.z; lastPx = pos.x; lastPz = pos.z; playerLvl = to; pendingTo = null;
    toast(to === 1 ? '🛏️ Kamar Bawah Tanah\nKamar 1, 2, dan 3 ada di sisi kiri-kanan lorong' : '🛏️ Penginapan');
    const f = $f(); if (f) { f.style.transition = 'opacity .45s'; f.style.opacity = 0; }
    busy = false;   // pemain langsung bebas bergerak; layar memudar kembali sambil jalan
  }

  const spawn = { x: OX, z: OZ + D / 2 - 2.2, face: Math.PI };   // di dalam pintu, menghadap ke dalam ruangan (-z)
  return {
    group, name: 'Penginapan', icon: '🛏️', hint: 'Bicaralah dengan Ratri untuk menginap dan memulihkan tenaga\nTangga di sisi kiri menuju 3 kamar bawah tanah\nMelangkahlah ke pintu untuk keluar', spawn,
    show(v) { group.visible = !!v; if (v) { lastPx = spawn.x; lastPz = spawn.z; playerLvl = 0; } if (busy) { const f = $f(); if (f) f.style.opacity = 0; } busy = false; pendingTo = null; },
    inside(x, z) { const lx = x - OX, lz = z - OZ; return (Math.abs(lx) < W / 2 + 0.6 && Math.abs(lz) < D / 2 + 0.6) || (lx > BX0 - 0.6 && lx < BX1 + 0.6 && lz > BZ0 - 0.6 && lz < BZ1 + 0.6); },
    nearExit(x, z) { const lx = x - OX, lz = z - OZ; return levelOf(lz) === 0 && lz > D / 2 - 1.0 && Math.abs(lx) < 1.3; },
    nearSpot(x, z) { return Math.hypot(x - OX - NPC_POS.x, z - OZ - NPC_POS.z) < 2.4 ? SPOT : null; },
    collide(pos, r) {
      let lx = pos.x - OX, lz = pos.z - OZ;
      const lvl = levelOf(lz), isPlayer = Math.hypot(pos.x - lastPx, pos.z - lastPz) < 1.2;
      if (busy && isPlayer) {   // sedang pindah lantai: pemain tertahan sampai layar gelap, lalu dipindah
        if (pendingTo !== null) { finishMove(pos); return; }
        pos.x = pinX; pos.z = pinZ; return;
      }
      if (!busy && !isPlayer && lvl !== playerLvl) {   // Isabel (atau siapa pun selain pemain) masih di lantai lain: ia muncul di dekat tangga lantai pemain
        const A = playerLvl === 1 ? ARRIVE_UP : ARRIVE_LOBBY; lx = A.x + 0.5; lz = A.z + (playerLvl === 1 ? 0.5 : 0.6);
      }
      const L = LV[levelOf(lz)];
      [lx, lz] = resolve(lx, lz, r, L);
      pos.x = OX + lx; pos.z = OZ + lz;
      if (!busy && isPlayer) {   // pemicu tangga
        if (L === LV[0] && lx > HOLE.x0 + 0.05 && lx < HOLE.x1 - 0.05 && lz > HOLE.z0 + 0.1 && lz < HOLE.z1 - 0.1) startMove(1, pos.x, pos.z);
        else if (L === LV[1] && lx < STAIR_UP_X && lz > WALLZ + 0.2) startMove(0, pos.x, pos.z);
      }
    },
    clipCam(pp, cp) {
      // Kamera TIDAK boleh digeser menyamping: game.js memakai camYaw untuk arah WASD, jadi arah pemain -> kamera harus tetap sesuai camYaw.
      // Karena itu kamera ditarik mendekat ke pemain di sepanjang garis yang sama sampai masuk batas ruangan (bukan dijepit per sumbu).
      const plz = pp.z - OZ, plx = pp.x - OX;
      const fit = (x0, x1, z0, z1, ymin, ymax) => {
        x0 = Math.min(x0, pp.x); x1 = Math.max(x1, pp.x); z0 = Math.min(z0, pp.z); z1 = Math.max(z1, pp.z);   // pemain selalu dianggap di dalam batas
        const dx = cp.x - pp.x, dz = cp.z - pp.z; let k = 1;
        if (dx > 1e-6) k = Math.min(k, (x1 - pp.x) / dx); else if (dx < -1e-6) k = Math.min(k, (x0 - pp.x) / dx);
        if (dz > 1e-6) k = Math.min(k, (z1 - pp.z) / dz); else if (dz < -1e-6) k = Math.min(k, (z0 - pp.z) / dz);
        k = clamp(k, 0, 1); cp.x = pp.x + dx * k; cp.z = pp.z + dz * k;
        const d = Math.hypot(cp.x - pp.x, cp.z - pp.z);
        cp.y = clamp(cp.y + (d < 1.6 ? (1.6 - d) * 1.2 : 0), ymin, ymax);   // sangat dekat = naik sedikit supaya pemain tetap terlihat dari atas
      };
      if (levelOf(plz) === 0) {
        if (Math.hypot(cp.x - pp.x, cp.z - pp.z) > 9) cp.set(pp.x, 2.2, pp.z + 3.2);   // baru pindah lantai: kamera langsung di dekat pemain, tidak menyapu dari lantai lain
        fit(OX - W / 2 + 0.4, OX + W / 2 - 0.4, OZ - D / 2 + 0.4, OZ + D / 2 - 0.4, 0.6, H - 0.35);
      } else {
        if (Math.hypot(cp.x - pp.x, cp.z - pp.z) > 9) cp.set(pp.x, 1.9, pp.z + 1.0);
        const inRoom = plz < WALLZ, ri = inRoom ? ROOM_X.reduce((b, x, k) => (Math.abs(plx - x) < Math.abs(plx - ROOM_X[b]) ? k : b), 0) : -1;
        if (inRoom) fit(OX + ROOM_X[ri] - 1.75, OX + ROOM_X[ri] + 1.75, OZ + BZ0 + 0.3, OZ + WALLZ - 0.3, 0.6, H2 - 0.3);   // di dalam kamar tempat pemain berada
        else fit(OX + BX0 + 0.4, OX + BX1 - 0.4, OZ + WALLZ + 0.3, OZ + BZ1 - 0.3, 0.6, H2 - 0.3);   // di lorong
      }
    },
    update(dt, t, px, pz) {   // api perapian berkedip, Ratri menoleh ke pemain
      if (!busy) { lastPx = px; lastPz = pz; playerLvl = levelOf(pz - OZ); }
      fireLight.intensity = (11 + Math.sin(t * 8) * 1.4 + Math.sin(t * 21 + 1) * 1.0) * LIGHT_SCALE;
      for (const f of flames) { const k = 0.85 + 0.25 * Math.sin(t * 8 + f.userData.ph) + 0.1 * Math.sin(t * 19 + f.userData.ph * 2); f.scale.set(1, k, 1); f.position.y = 0.55 + 0.3 * k; }
      armR.rotation.x = -0.8 + Math.sin(t * 1.3) * 0.07; body.position.y = 0.75 + Math.sin(t * 1.5) * 0.008;
      const ty = playerLvl === 0 ? Math.atan2(px - OX - NPC_POS.x, pz - OZ - NPC_POS.z) : 0, cur = head.rotation.y; head.rotation.y = cur + (clamp(ty, -0.9, 0.9) - cur) * Math.min(1, dt * 4);
    },
  };
}
