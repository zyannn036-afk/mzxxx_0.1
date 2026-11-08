import * as THREE from 'three';

// ============================================================
//  INTERIOR PANDAI BESI (Kota Dungeon) — ruangan SEDERHANA: satu ruang berdinding kayu & batu, tungku menyala, landasan, tong air,
//  batu asah, meja jaga dengan Borin si pandai besi (bisa diajak bicara), rak senjata + perisai, patung zirah, permadani di dekat pintu.
//  API sama dengan interior Balai Petualang (kota-guild.js) supaya game.js bisa memakainya dengan pola yang sama:
//    { group, name, icon, hint, spawn{x,z,face}, show(v), collide(pos, r), clipCam(playerPos, camPos), nearSpot(x, z), nearExit(x, z), inside(x, z), update(dt, t, x, z) }
//  Ruangan dibangun di luar peta (SMITH_ORIGIN) supaya tidak bertumpuk dengan dunia luar; hanya terlihat saat show(true).
//  Ukuran / tata letak ada di bagian "TATA LETAK" (koordinat lokal: pusat ruangan = (0, 0), pintu di sisi +z).
// ============================================================
export const SMITH_ORIGIN = { x: 7400, z: -7400 };   // geser bila perlu (harus jauh dari area dunia yang bisa dijelajahi)
const LIGHT_SCALE = (+THREE.REVISION >= 155) ? 1 : 0.35;   // three r155+ memakai satuan cahaya fisik; ubah angka ini bila ruangan terlalu gelap / terang

const W = 10, D = 8, H = 3.8;   // lebar (x), kedalaman (z), tinggi ruangan
const DOOR_W = 1.7, DOOR_H = 2.4;
const NPC_POS = { x: 2.9, z: -0.9 };
const SPOT = { id: 'smith', short: 'Borin', name: 'Borin — Pandai Besi' };

export function buildSmithInterior() {
  const OX = SMITH_ORIGIN.x, OZ = SMITH_ORIGIN.z;
  const group = new THREE.Group(); group.name = 'kota-pandai-besi'; group.position.set(OX, 0, OZ); group.visible = false;
  const S = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, ...extra });
  const mat = {
    wall: S(0x8a7b62), stone: S(0x6c675b), stoneD: S(0x4b473f), wood: S(0x7a5732), woodD: S(0x4a3322), beam: S(0x3d2a1a), leather: S(0x3a2616),
    iron: S(0x3a3b42, { metalness: 0.55, roughness: 0.55 }), steel: S(0xb9bfc9, { metalness: 0.7, roughness: 0.35 }), gold: S(0xe6bd4a, { metalness: 0.5, roughness: 0.45 }),
    cloth: S(0x8a2c24), skin: S(0xd9a77a), hair: S(0x6b4a2a), water: S(0x3a6a8a, { roughness: 0.2 }), black: S(0x15120f),
    coal: new THREE.MeshStandardMaterial({ color: 0x401a08, emissive: 0xff5a10, emissiveIntensity: 1.4, roughness: 0.8, flatShading: true }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ff, emissive: 0xffe0a8, emissiveIntensity: 1.1, roughness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb81c, emissiveIntensity: 1.3, roughness: 0.6, flatShading: true }),
  };
  const add = (geo, m, x, y, z, parent = group, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); parent.add(k); return k; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (a, b, h, n = 10) => new THREE.CylinderGeometry(a, b, h, n);

  // ---------- tekstur papan lantai + lingkaran cahaya pintu ----------
  const planks = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { const g = 78 + (Math.random() * 26 | 0); x.fillStyle = `rgb(${g + 26},${g + 8},${g - 16})`; x.fillRect(0, i * 32, 256, 32); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, i * 32, 256, 2); const o = (Math.random() * 200) | 0; x.fillRect(o, i * 32, 2, 32); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 3, D / 3); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const glowT = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 3, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, 'rgba(255,236,150,0.8)'); g.addColorStop(0.8, 'rgba(255,190,60,0.4)'); g.addColorStop(1, 'rgba(255,190,60,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  // ---------- ruangan: lantai, langit-langit, dinding, balok kayu ----------
  add(box(W + 1, 0.4, D + 1), new THREE.MeshStandardMaterial({ map: planks, roughness: 1 }), 0, -0.19, 0);   // permukaan lantai di y = 0.01
  add(box(W + 1, 0.3, D + 1), mat.woodD, 0, H + 0.15, 0);   // langit-langit
  for (const z of [-2.6, 0, 2.6]) add(box(W, 0.28, 0.3), mat.beam, 0, H - 0.14, z);   // balok melintang
  add(box(W + 0.6, H, 0.3), mat.wall, 0, H / 2, -D / 2 - 0.15);   // dinding belakang
  for (const s of [-1, 1]) add(box(0.3, H, D + 0.6), mat.wall, s * (W / 2 + 0.15), H / 2, 0);   // dinding kiri & kanan
  { const sw = (W - DOOR_W) / 2;   // dinding depan + ambang pintu
    for (const s of [-1, 1]) add(box(sw, H, 0.3), mat.wall, s * (DOOR_W / 2 + sw / 2), H / 2, D / 2 + 0.15);
    add(box(DOOR_W + 0.2, H - DOOR_H, 0.3), mat.wall, 0, DOOR_H + (H - DOOR_H) / 2, D / 2 + 0.15);
    for (const s of [-1, 1]) add(box(0.14, DOOR_H, 0.2), mat.beam, s * (DOOR_W / 2 + 0.07), DOOR_H / 2, D / 2 - 0.05);
    add(box(DOOR_W + 0.28, 0.14, 0.2), mat.beam, 0, DOOR_H + 0.07, D / 2 - 0.05);
    add(box(DOOR_W - 0.05, DOOR_H - 0.05, 0.1), mat.wood, 0, DOOR_H / 2, D / 2 + 0.02);   // daun pintu (tertutup)
    for (const y of [0.5, 1.2, 1.9]) add(box(DOOR_W - 0.05, 0.1, 0.13), mat.iron, 0, y, D / 2 - 0.02);   // palang besi
    add(new THREE.SphereGeometry(0.06, 8, 6), mat.gold, 0.55, 1.1, D / 2 - 0.1);   // gagang
  }
  for (const [x, z] of [[-W / 2 + 0.1, -D / 2 + 0.1], [W / 2 - 0.1, -D / 2 + 0.1], [-W / 2 + 0.1, D / 2 - 0.1], [W / 2 - 0.1, D / 2 - 0.1]]) add(box(0.25, H, 0.25), mat.beam, x, H / 2, z);   // tiang sudut
  add(box(W, 0.12, 0.1), mat.stoneD, 0, 0.06, -D / 2 + 0.02);   // lis dinding bawah (belakang)
  // jendela di dinding kiri (cahaya hangat siang)
  for (const z of [-1.8, 1.4]) { add(box(0.08, 0.9, 1.0), mat.glass, -W / 2 + 0.04, 2.1, z); add(box(0.12, 0.08, 1.1), mat.beam, -W / 2 + 0.05, 2.6, z); add(box(0.12, 0.08, 1.1), mat.beam, -W / 2 + 0.05, 1.6, z); add(box(0.12, 1.0, 0.08), mat.beam, -W / 2 + 0.05, 2.1, z); }

  // ---------- tungku tempa (dinding belakang, kiri) ----------
  const FORGE = { x: -3.2, z: -3.25 };
  add(box(2.8, 1.1, 1.3), mat.stone, FORGE.x, 0.55, FORGE.z);
  add(box(2.9, 0.12, 1.4), mat.stoneD, FORGE.x, 1.14, FORGE.z);
  add(box(2.0, 0.22, 0.8), mat.coal, FORGE.x, 1.22, FORGE.z + 0.05);   // bara
  add(box(2.0, 1.5, 0.5), mat.stone, FORGE.x, 1.95, FORGE.z - 0.4);   // dinding belakang tungku
  add(box(2.4, 0.5, 0.9), mat.stoneD, FORGE.x, 2.75, FORGE.z - 0.15);   // tudung asap
  add(box(0.9, H - 2.9, 0.8), mat.stone, FORGE.x, 2.9 + (H - 2.9) / 2, FORGE.z - 0.25);   // cerobong
  const flames = [];
  for (const dx of [-0.55, 0, 0.5]) { const f = add(new THREE.ConeGeometry(0.2, 0.7, 6), mat.flame, FORGE.x + dx, 1.62, FORGE.z + 0.05); f.userData.ph = Math.random() * 6; flames.push(f); }
  add(box(0.8, 0.18, 0.5), mat.woodD, FORGE.x + 2.0, 0.55, FORGE.z + 0.1); add(box(0.1, 0.5, 0.4), mat.woodD, FORGE.x + 1.8, 0.35, FORGE.z + 0.1);   // alat tiup (sederhana)
  add(cyl(0.05, 0.05, 0.9, 6), mat.iron, FORGE.x - 1.3, 1.2, FORGE.z + 0.75, group, 0, 0, 0.25);   // penjepit tergantung
  const forgeLight = new THREE.PointLight(0xff8a30, 16 * LIGHT_SCALE, 13, 2); forgeLight.position.set(FORGE.x, 1.8, FORGE.z + 0.8); group.add(forgeLight);

  // ---------- landasan di atas tunggul ----------
  const ANVIL = { x: -0.5, z: -1.7 };
  add(cyl(0.4, 0.46, 0.7, 10), mat.woodD, ANVIL.x, 0.35, ANVIL.z);
  add(box(0.74, 0.22, 0.42), mat.iron, ANVIL.x, 0.81, ANVIL.z); add(box(0.4, 0.28, 0.3), mat.iron, ANVIL.x, 1.04, ANVIL.z); add(box(1.0, 0.2, 0.44), mat.iron, ANVIL.x, 1.26, ANVIL.z);
  add(new THREE.ConeGeometry(0.2, 0.55, 6), mat.iron, ANVIL.x + 0.76, 1.26, ANVIL.z, group, 0, 0, -Math.PI / 2);   // tanduk landasan
  add(box(0.5, 0.03, 0.3), mat.coal, ANVIL.x - 0.1, 1.37, ANVIL.z);   // besi membara di atas landasan
  add(cyl(0.025, 0.025, 0.5, 6), mat.wood, ANVIL.x + 0.5, 1.45, ANVIL.z + 0.45, group, 0, 0, Math.PI / 2); add(box(0.14, 0.12, 0.12), mat.iron, ANVIL.x + 0.27, 1.45, ANVIL.z + 0.45);   // palu tergeletak

  // ---------- tong air pendingin ----------
  const BARREL = { x: -4.2, z: -0.4 };
  add(cyl(0.45, 0.4, 0.95, 12), mat.wood, BARREL.x, 0.47, BARREL.z); add(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 12), mat.water, BARREL.x, 0.93, BARREL.z);
  for (const y of [0.22, 0.7]) add(new THREE.TorusGeometry(0.44, 0.03, 5, 14), mat.iron, BARREL.x, y, BARREL.z, group, Math.PI / 2);
  // rak ingot di dinding kiri
  for (const y of [1.35, 1.95]) { add(box(0.35, 0.07, 1.8), mat.wood, -W / 2 + 0.2, y, -1.2); for (let i = 0; i < 4; i++) add(box(0.22, 0.12, 0.34), i % 3 === 2 ? mat.gold : mat.steel, -W / 2 + 0.2, y + 0.1, -1.8 + i * 0.45); }

  // ---------- batu asah (kiri depan) ----------
  const GRIND = { x: -4.2, z: 1.6 };
  add(box(0.1, 0.9, 0.7), mat.woodD, GRIND.x, 0.45, GRIND.z - 0.35); add(box(0.1, 0.9, 0.7), mat.woodD, GRIND.x, 0.45, GRIND.z + 0.35);
  add(cyl(0.45, 0.45, 0.14, 16), mat.stoneD, GRIND.x, 0.95, GRIND.z, group, 0, 0, Math.PI / 2);
  add(box(0.5, 0.06, 0.5), mat.wood, GRIND.x + 0.45, 0.5, GRIND.z);

  // ---------- meja jaga + barang dagangan ----------
  const CNT = { x0: 0.9, x1: 4.5, z0: -0.15, z1: 0.75 };
  add(box(CNT.x1 - CNT.x0, 1.0, CNT.z1 - CNT.z0 - 0.1), mat.wood, (CNT.x0 + CNT.x1) / 2, 0.5, (CNT.z0 + CNT.z1) / 2); add(box(CNT.x1 - CNT.x0 + 0.2, 0.1, CNT.z1 - CNT.z0 + 0.2), mat.woodD, (CNT.x0 + CNT.x1) / 2, 1.05, (CNT.z0 + CNT.z1) / 2);
  for (let i = 0; i < 4; i++) add(box(0.7, 0.8, 0.04), mat.woodD, CNT.x0 + 0.5 + i * 0.85, 0.5, CNT.z1 - 0.03);   // panel papan depan meja
  const topY = 1.1, cz = (CNT.z0 + CNT.z1) / 2;
  for (const [x, a] of [[1.5, 0.3], [2.1, -0.2]]) { add(box(0.07, 0.03, 0.55), mat.steel, x, topY + 0.02, cz, group, 0, a); add(box(0.09, 0.03, 0.14), mat.leather, x + Math.sin(a) * 0.34, topY + 0.02, cz + Math.cos(a) * 0.34, group, 0, a); }   // dua belati
  add(new THREE.SphereGeometry(0.22, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat.steel, 3.3, topY, cz);   // helm
  add(box(0.34, 0.05, 0.05), mat.steel, 3.3, topY + 0.1, cz + 0.2);
  add(new THREE.SphereGeometry(0.14, 8, 6), mat.cloth, 4.0, topY + 0.1, cz + 0.05);   // kantong koin

  // ---------- rak senjata (dinding belakang, kanan) + perisai (dinding kanan) ----------
  add(box(3.0, 1.3, 0.1), mat.woodD, 3.0, 2.0, -D / 2 + 0.05);
  for (const [i, x] of [[0, 1.9], [1, 2.45], [2, 3.0], [3, 3.55]]) { const h = 0.9 + (i % 2) * 0.15; add(box(0.1, h, 0.03), mat.steel, x, 2.0, -D / 2 + 0.13); add(box(0.36, 0.06, 0.06), mat.gold, x, 2.0 - h / 2, -D / 2 + 0.13); add(box(0.07, 0.24, 0.07), mat.leather, x, 2.0 - h / 2 - 0.15, -D / 2 + 0.13); }   // 4 pedang
  add(cyl(0.025, 0.025, 1.6, 6), mat.wood, 4.2, 1.9, -D / 2 + 0.14); add(new THREE.ConeGeometry(0.07, 0.3, 5), mat.steel, 4.2, 2.8, -D / 2 + 0.14);   // tombak
  add(box(0.5, 0.3, 0.05), mat.steel, 4.6, 1.5, -D / 2 + 0.14);
  for (const z of [-2.6, -1.4]) { add(cyl(0.4, 0.4, 0.07, 14), mat.cloth, W / 2 - 0.1, 2.0, z, group, 0, 0, Math.PI / 2); add(new THREE.SphereGeometry(0.1, 8, 6), mat.gold, W / 2 - 0.15, 2.0, z); }   // dua perisai bundar
  add(box(0.1, 0.1, 1.0), mat.beam, W / 2 - 0.08, 1.2, -2.0);   // palang gantung

  // ---------- patung zirah (kanan depan) ----------
  const ARM = { x: 4.1, z: 2.8 };
  add(cyl(0.05, 0.05, 1.0, 6), mat.wood, ARM.x, 0.5, ARM.z); add(box(0.5, 0.06, 0.5), mat.woodD, ARM.x, 0.03, ARM.z);
  add(box(0.6, 0.65, 0.34), mat.steel, ARM.x, 1.3, ARM.z); add(new THREE.SphereGeometry(0.2, 10, 8), mat.steel, ARM.x, 1.82, ARM.z); add(box(0.3, 0.05, 0.08), mat.black, ARM.x, 1.82, ARM.z + 0.17);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.17, 8, 6), mat.steel, ARM.x + s * 0.4, 1.55, ARM.z);

  // ---------- permadani + lingkaran cahaya keluar ----------
  add(box(2.4, 0.02, 3.0), S(0x7a2a22), 0, 0.02, 1.9); add(box(2.1, 0.025, 2.7), S(0x9a3a2c), 0, 0.025, 1.9);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowT, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, 0.05, D / 2 - 0.6); group.add(glow);

  // ---------- lampu gantung ----------
  for (const [x, z] of [[0.3, 0.8], [3.0, -2.0]]) {
    add(cyl(0.012, 0.012, 0.7, 4), mat.iron, x, H - 0.35, z); add(new THREE.SphereGeometry(0.17, 8, 6), mat.lamp, x, H - 0.8, z);
    const l = new THREE.PointLight(0xffc070, 9 * LIGHT_SCALE, 11, 2); l.position.set(x, H - 0.9, z); group.add(l);
  }

  // ---------- Borin, pandai besi (model sederhana dari kotak & bola; berdiri di balik meja, menghadap pintu) ----------
  const npc = new THREE.Group(); npc.position.set(NPC_POS.x, 0, NPC_POS.z); group.add(npc);
  for (const s of [-1, 1]) { add(box(0.22, 0.8, 0.26), mat.woodD, s * 0.15, 0.4, 0, npc); add(box(0.26, 0.14, 0.34), mat.black, s * 0.15, 0.07, 0.04, npc); }
  const body = new THREE.Group(); body.position.y = 0.8; npc.add(body);
  add(box(0.7, 0.78, 0.4), S(0x8a4b2d), 0, 0.39, 0, body); add(box(0.64, 0.66, 0.06), mat.leather, 0, 0.36, 0.22, body);   // baju + celemek kulit
  const head = new THREE.Group(); head.position.set(0, 1.05, 0); body.add(head);
  add(new THREE.SphereGeometry(0.22, 12, 10), mat.skin, 0, 0, 0, head); add(box(0.4, 0.26, 0.14), mat.hair, 0, -0.16, 0.14, head); add(box(0.34, 0.06, 0.08), mat.hair, 0, 0.0, 0.2, head);   // jenggot + kumis
  add(box(0.42, 0.1, 0.42), mat.cloth, 0, 0.17, 0, head);   // ikat kepala merah
  for (const s of [-1, 1]) add(box(0.05, 0.05, 0.03), mat.black, s * 0.08, 0.06, 0.21, head);
  add(box(0.06, 0.08, 0.06), mat.skin, 0, 0.0, 0.23, head);
  const armL = new THREE.Group(); armL.position.set(-0.45, 0.72, 0); body.add(armL); add(box(0.18, 0.62, 0.18), S(0xd9a77a), 0, -0.31, 0, armL);
  const armR = new THREE.Group(); armR.position.set(0.45, 0.72, 0); body.add(armR); add(box(0.18, 0.62, 0.18), S(0xd9a77a), 0, -0.31, 0, armR);
  add(cyl(0.03, 0.03, 0.5, 6), mat.wood, 0, -0.62, 0.2, armR, Math.PI / 2); add(box(0.14, 0.14, 0.2), mat.iron, 0, -0.62, 0.45, armR);   // palu di tangan kanan
  armR.rotation.x = -0.6;

  // ---------- tabrakan (koordinat lokal): kotak [x0, x1, z0, z1] ----------
  const boxes = [
    [FORGE.x - 1.5, FORGE.x + 2.3, FORGE.z - 0.7, FORGE.z + 0.7],   // tungku + alat tiup
    [ANVIL.x - 0.6, ANVIL.x + 0.55, ANVIL.z - 0.4, ANVIL.z + 0.4],
    [BARREL.x - 0.5, BARREL.x + 0.5, BARREL.z - 0.5, BARREL.z + 0.5],
    [GRIND.x - 0.5, GRIND.x + 0.8, GRIND.z - 0.7, GRIND.z + 0.7],
    [CNT.x0 - 0.1, CNT.x1 + 0.1, CNT.z0 - 0.1, CNT.z1 + 0.1],   // meja jaga
    [ARM.x - 0.4, ARM.x + 0.4, ARM.z - 0.35, ARM.z + 0.35],   // patung zirah
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const spawn = { x: OX, z: OZ + D / 2 - 2.4, face: Math.PI };   // di dalam pintu, menghadap ke dalam ruangan (-z)
  return {
    group, name: 'Pandai Besi', icon: '⚒️', hint: 'Bicaralah dengan Borin untuk menempa equipment\nMelangkahlah ke pintu untuk keluar', spawn,
    show(v) { group.visible = !!v; },
    inside(x, z) { const lx = x - OX, lz = z - OZ; return Math.abs(lx) < W / 2 + 0.6 && Math.abs(lz) < D / 2 + 0.6; },
    nearExit(x, z) { const lx = x - OX, lz = z - OZ; return lz > D / 2 - 1.0 && Math.abs(lx) < 1.3; },
    nearSpot(x, z) { return Math.hypot(x - OX - NPC_POS.x, z - OZ - NPC_POS.z) < 2.4 ? SPOT : null; },
    collide(pos, r) {   // dinding + perabot: posisi dijepit ke dalam ruangan lalu didorong keluar dari kotak-kotak perabot
      let lx = clamp(pos.x - OX, -W / 2 + r + 0.1, W / 2 - r - 0.1), lz = clamp(pos.z - OZ, -D / 2 + r + 0.1, D / 2 - r - 0.1);
      const npx = NPC_POS.x, npz = NPC_POS.z;
      for (let pass = 0; pass < 2; pass++) {
        for (const b of boxes) {
          const cx = clamp(lx, b[0], b[1]), cz = clamp(lz, b[2], b[3]), dx = lx - cx, dz = lz - cz, d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d > 1e-5) { lx = cx + dx / d * r; lz = cz + dz / d * r; }
          else { const o = [lx - b[0], b[1] - lx, lz - b[2], b[3] - lz], m = Math.min(...o), k = o.indexOf(m); if (k === 0) lx = b[0] - r; else if (k === 1) lx = b[1] + r; else if (k === 2) lz = b[2] - r; else lz = b[3] + r; }
        }
        const dx = lx - npx, dz = lz - npz, d = Math.hypot(dx, dz), R = r + 0.4;   // Borin sendiri (lingkaran)
        if (d < R) { if (d > 1e-5) { lx = npx + dx / d * R; lz = npz + dz / d * R; } else lz = npz + R; }
        lx = clamp(lx, -W / 2 + r + 0.1, W / 2 - r - 0.1); lz = clamp(lz, -D / 2 + r + 0.1, D / 2 - r - 0.1);
      }
      pos.x = OX + lx; pos.z = OZ + lz;
    },
    clipCam(pp, cp) { cp.x = clamp(cp.x, OX - W / 2 + 0.4, OX + W / 2 - 0.4); cp.z = clamp(cp.z, OZ - D / 2 + 0.4, OZ + D / 2 - 0.4); cp.y = clamp(cp.y, 0.6, H - 0.35); },
    update(dt, t, px, pz) {   // api tungku berkedip, Borin menempa pelan & menoleh ke pemain
      forgeLight.intensity = (14 + Math.sin(t * 9) * 1.6 + Math.sin(t * 23 + 1) * 1.1) * LIGHT_SCALE;
      for (const f of flames) { const k = 0.85 + 0.25 * Math.sin(t * 8 + f.userData.ph) + 0.1 * Math.sin(t * 19 + f.userData.ph * 2); f.scale.set(1, k, 1); f.position.y = 1.5 + 0.35 * k; }
      const hit = Math.pow(Math.max(0, Math.sin(t * 2.6)), 3);
      armR.rotation.x = -1.35 + 1.0 * hit; body.position.y = 0.8 + Math.sin(t * 1.6) * 0.008;
      const ty = Math.atan2(px - OX - NPC_POS.x, pz - OZ - NPC_POS.z), cur = head.rotation.y; head.rotation.y = cur + (clamp(ty, -0.9, 0.9) - cur) * Math.min(1, dt * 4);
    },
  };
}
