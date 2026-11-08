import * as THREE from 'three';

// ============================================================
//  INTERIOR TOKO RAMUAN (Kota Dungeon) — ruangan SEDERHANA: satu ruang kayu hangat, meja jaga dengan Dewi si penjual ramuan (bisa diajak bicara),
//  rak botol ramuan warna-warni di dinding belakang & kiri, kuali hijau mendidih, peti & meja ramuan, rempah gantung, permadani di dekat pintu.
//  API SAMA dengan interior Pandai Besi (kota-pandai-besi.js) supaya game.js memakainya dengan pola yang sama:
//    { group, name, icon, hint, spawn{x,z,face}, show(v), collide(pos, r), clipCam(playerPos, camPos), nearSpot(x, z), nearExit(x, z), inside(x, z), update(dt, t, x, z) }
//  Ruangan dibangun di luar peta (POTION_ORIGIN) supaya tidak bertumpuk dengan dunia luar; hanya terlihat saat show(true).
//  Ukuran / tata letak: lihat bagian "TATA LETAK" (koordinat lokal: pusat ruangan = (0, 0), pintu di sisi +z).
// ============================================================
export const POTION_ORIGIN = { x: 7600, z: -7600 };   // geser bila perlu (harus jauh dari area dunia dan dari ruangan lain: guild, pandai besi)
const LIGHT_SCALE = (+THREE.REVISION >= 155) ? 1 : 0.35;   // three r155+ memakai satuan cahaya fisik; ubah angka ini bila ruangan terlalu gelap / terang

const W = 8, D = 6.5, H = 3.4;   // lebar (x), kedalaman (z), tinggi ruangan
const DOOR_W = 1.6, DOOR_H = 2.3;
const NPC_POS = { x: 0.2, z: -1.75 };   // Dewi berdiri di balik meja jaga
const SPOT = { id: 'potion', short: 'Dewi', name: 'Dewi — Penjual Ramuan' };

export function buildPotionInterior() {
  const OX = POTION_ORIGIN.x, OZ = POTION_ORIGIN.z;
  const group = new THREE.Group(); group.name = 'kota-toko-ramuan'; group.position.set(OX, 0, OZ); group.visible = false;
  const S = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, ...extra });
  const mat = {
    wall: S(0x9a8766), wood: S(0x7a5732), woodD: S(0x4a3322), beam: S(0x3d2a1a), stone: S(0x6c675b), iron: S(0x3a3b42, { metalness: 0.5, roughness: 0.55 }),
    gold: S(0xe6bd4a, { metalness: 0.5, roughness: 0.45 }), cloth: S(0x2f6b3a), skin: S(0xe0b088), hair: S(0x5a3a22), black: S(0x15120f), cork: S(0xb08a55),
    leaf: S(0x4f8a3a), herb: S(0x7a8f3a), herbD: S(0x8a6a3a),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ff, emissive: 0xffe0a8, emissiveIntensity: 1.1, roughness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb81c, emissiveIntensity: 1.3, roughness: 0.6, flatShading: true }),
    brew: new THREE.MeshStandardMaterial({ color: 0x3fd070, emissive: 0x20c050, emissiveIntensity: 1.1, roughness: 0.3 }),
    coal: new THREE.MeshStandardMaterial({ color: 0x401a08, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.8, flatShading: true }),
  };
  // botol ramuan: tiap warna punya bahan sedikit berpendar
  const potionMat = c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, roughness: 0.25, transparent: true, opacity: 0.92 });
  const COLORS = [0xe0343a, 0x3fd070, 0x3a8cff, 0xb050ff, 0xffc030].map(potionMat);   // merah (pemulih), hijau, biru, ungu, emas
  const add = (geo, m, x, y, z, parent = group, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); parent.add(k); return k; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (a, b, h, n = 10) => new THREE.CylinderGeometry(a, b, h, n);
  const bottle = (x, y, z, ci, parent = group) => {   // satu botol: badan + leher + gabus
    add(cyl(0.07, 0.08, 0.2, 8), COLORS[ci % COLORS.length], x, y + 0.1, z, parent); add(cyl(0.03, 0.04, 0.1, 6), COLORS[ci % COLORS.length], x, y + 0.25, z, parent); add(cyl(0.03, 0.03, 0.04, 6), mat.cork, x, y + 0.32, z, parent);
  };

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
  add(box(W + 1, 0.4, D + 1), new THREE.MeshStandardMaterial({ map: planks, roughness: 1 }), 0, -0.19, 0);   // permukaan lantai di y = 0.01
  add(box(W + 1, 0.3, D + 1), mat.woodD, 0, H + 0.15, 0);   // langit-langit
  for (const z of [-2.0, 0, 2.0]) add(box(W, 0.26, 0.28), mat.beam, 0, H - 0.13, z);   // balok melintang
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
  { const z = 0.6; add(box(0.08, 0.9, 1.0), mat.glass, W / 2 - 0.04, 2.0, z); for (const y of [1.55, 2.45]) add(box(0.12, 0.08, 1.1), mat.beam, W / 2 - 0.05, y, z); add(box(0.12, 0.9, 0.08), mat.beam, W / 2 - 0.05, 2.0, z); }

  // ---------- rak botol: dinding belakang (kiri & kanan meja jaga) + dinding kiri ----------
  const shelf = (x, y, z, len, alongX) => add(alongX ? box(len, 0.06, 0.4) : box(0.4, 0.06, len), mat.wood, x, y, z);
  for (const y of [1.0, 1.6, 2.2]) {
    shelf(-2.5, y, -D / 2 + 0.2, 2.2, true); shelf(2.7, y, -D / 2 + 0.2, 1.6, true);   // belakang
    let i = 0; for (let x = -3.45; x <= -1.55; x += 0.38) bottle(x, y + 0.03, -D / 2 + 0.2, i++ + Math.round(y * 3));
    i = 0; for (let x = 2.1; x <= 3.3; x += 0.38) bottle(x, y + 0.03, -D / 2 + 0.2, i++ + Math.round(y * 5));
  }
  for (const y of [1.2, 1.9]) { shelf(-W / 2 + 0.2, y, 0.6, 2.2, false); let i = 0; for (let z = -0.4; z <= 1.6; z += 0.4) bottle(-W / 2 + 0.2, y + 0.03, z, i++ + Math.round(y * 4)); }   // dinding kiri
  add(box(0.06, 1.5, 0.06), mat.beam, -1.15, 1.6, -D / 2 + 0.2);   // tiang pemisah rak

  // ---------- meja jaga + barang di atasnya ----------
  const CNT = { x0: -2.2, x1: 2.6, z0: -1.0, z1: -0.25 };
  const cx = (CNT.x0 + CNT.x1) / 2, cz = (CNT.z0 + CNT.z1) / 2;
  add(box(CNT.x1 - CNT.x0, 1.0, CNT.z1 - CNT.z0 - 0.1), mat.wood, cx, 0.5, cz); add(box(CNT.x1 - CNT.x0 + 0.2, 0.1, CNT.z1 - CNT.z0 + 0.2), mat.woodD, cx, 1.05, cz);
  for (let i = 0; i < 5; i++) add(box(0.8, 0.78, 0.04), mat.woodD, CNT.x0 + 0.5 + i * 0.95, 0.5, CNT.z1 - 0.03);   // panel papan depan meja
  const topY = 1.1;
  bottle(-1.4, topY, cz, 0); bottle(-1.1, topY, cz, 0); bottle(-0.8, topY, cz + 0.05, 1);   // deretan botol dagangan
  add(box(0.5, 0.04, 0.35), mat.cork, 1.4, topY + 0.02, cz); add(box(0.4, 0.02, 0.28), S(0xe8dcb8), 1.4, topY + 0.05, cz);   // papan harga / kertas
  add(new THREE.SphereGeometry(0.14, 8, 6), mat.cloth, 2.1, topY + 0.1, cz);   // kantong

  // ---------- kuali hijau mendidih (belakang kiri) ----------
  const POT = { x: -3.0, z: -2.3 };
  add(cyl(0.55, 0.45, 0.14, 10), mat.coal, POT.x, 0.1, POT.z);   // bara di bawah
  for (const a of [0, 2.1, 4.2]) add(cyl(0.05, 0.05, 0.5, 5), mat.iron, POT.x + Math.cos(a) * 0.4, 0.3, POT.z + Math.sin(a) * 0.4);   // kaki kuali
  add(new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), mat.iron, POT.x, 0.85, POT.z).scale.y = 0.9;
  const brew = add(new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2), mat.brew, POT.x, 1.02, POT.z);
  add(new THREE.TorusGeometry(0.5, 0.05, 6, 16), mat.iron, POT.x, 1.04, POT.z, group, Math.PI / 2);   // bibir kuali
  add(cyl(0.025, 0.025, 1.0, 6), mat.wood, POT.x + 0.15, 1.35, POT.z, group, 0, 0, 0.4);   // sendok kayu
  const bubbles = []; for (let i = 0; i < 4; i++) { const b = add(new THREE.SphereGeometry(0.07, 6, 5), mat.brew, POT.x + (i - 1.5) * 0.15, 1.05, POT.z + ((i % 2) - 0.5) * 0.2); b.userData.ph = i * 1.7; bubbles.push(b); }
  const potLight = new THREE.PointLight(0x40e080, 7 * LIGHT_SCALE, 7, 2); potLight.position.set(POT.x, 1.5, POT.z + 0.4); group.add(potLight);

  // ---------- peti + meja rempah (kanan) ----------
  const CRATE = { x: 3.05, z: -2.3 };
  add(box(0.9, 0.8, 0.9), mat.wood, CRATE.x, 0.4, CRATE.z); add(box(0.94, 0.07, 0.94), mat.iron, CRATE.x, 0.7, CRATE.z); add(box(0.6, 0.55, 0.6), mat.woodD, CRATE.x - 0.1, 1.07, CRATE.z + 0.05);
  const TABLE = { x: 2.9, z: 1.5 };
  add(box(1.3, 0.08, 0.8), mat.wood, TABLE.x, 0.85, TABLE.z); for (const sx of [-0.55, 0.55]) for (const sz of [-0.3, 0.3]) add(box(0.08, 0.85, 0.08), mat.woodD, TABLE.x + sx, 0.42, TABLE.z + sz);
  for (const [i, x] of [[0, -0.4], [1, 0], [2, 0.4]]) { add(cyl(0.14, 0.1, 0.18, 8), mat.herbD, TABLE.x + x, 0.98, TABLE.z); add(new THREE.SphereGeometry(0.13, 7, 5), i === 1 ? mat.herb : mat.leaf, TABLE.x + x, 1.12, TABLE.z).scale.y = 0.7; }   // pot tanaman obat

  // ---------- rempah & akar gantung di balok langit-langit ----------
  for (const [x, z] of [[-1.5, 0.2], [0.2, 2.0], [1.9, 0.1], [-2.8, 2.0]]) {
    add(cyl(0.01, 0.01, 0.5, 4), mat.beam, x, H - 0.5, z); add(new THREE.ConeGeometry(0.14, 0.45, 6), mat.herb, x, H - 0.85, z, group, Math.PI);   // seikat daun terbalik
  }

  // ---------- permadani + lingkaran cahaya keluar ----------
  add(box(2.2, 0.02, 2.6), S(0x2f5a3a), 0, 0.02, 1.6); add(box(1.9, 0.025, 2.3), S(0x3f7a4a), 0, 0.025, 1.6);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowT, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, 0.05, D / 2 - 0.55); group.add(glow);

  // ---------- lampu gantung ----------
  for (const [x, z] of [[0.4, 0.4], [-2.2, -1.2]]) {
    add(cyl(0.012, 0.012, 0.6, 4), mat.iron, x, H - 0.3, z); add(new THREE.SphereGeometry(0.16, 8, 6), mat.lamp, x, H - 0.7, z);
    const l = new THREE.PointLight(0xffc880, 8 * LIGHT_SCALE, 10, 2); l.position.set(x, H - 0.8, z); group.add(l);
  }

  // ---------- Dewi, penjual ramuan (model sederhana dari kotak & bola; berdiri di balik meja, menghadap pintu) ----------
  const npc = new THREE.Group(); npc.position.set(NPC_POS.x, 0, NPC_POS.z); group.add(npc);
  for (const s of [-1, 1]) { add(box(0.2, 0.75, 0.24), mat.woodD, s * 0.13, 0.38, 0, npc); add(box(0.24, 0.12, 0.32), mat.black, s * 0.13, 0.06, 0.04, npc); }
  const body = new THREE.Group(); body.position.y = 0.75; npc.add(body);
  add(box(0.62, 0.78, 0.36), mat.cloth, 0, 0.39, 0, body); add(box(0.56, 0.5, 0.05), S(0xe8dcb8), 0, 0.3, 0.2, body);   // gaun hijau + celemek krem
  const head = new THREE.Group(); head.position.set(0, 1.05, 0); body.add(head);
  add(new THREE.SphereGeometry(0.21, 12, 10), mat.skin, 0, 0, 0, head); add(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat.hair, 0, 0.03, -0.02, head); add(box(0.4, 0.4, 0.14), mat.hair, 0, -0.18, -0.14, head);   // rambut + ikatan belakang
  add(box(0.5, 0.05, 0.5), mat.leaf, 0, 0.2, 0, head);   // ikat kepala daun
  for (const s of [-1, 1]) add(box(0.05, 0.05, 0.03), mat.black, s * 0.08, 0.04, 0.2, head);
  const armL = new THREE.Group(); armL.position.set(-0.4, 0.7, 0); body.add(armL); add(box(0.16, 0.6, 0.16), mat.skin, 0, -0.3, 0, armL);
  const armR = new THREE.Group(); armR.position.set(0.4, 0.7, 0); body.add(armR); add(box(0.16, 0.6, 0.16), mat.skin, 0, -0.3, 0, armR);
  bottle(0, -0.78, 0.2, 0, armR);   // botol merah di tangan kanan
  armR.rotation.x = -0.9;

  // ---------- tabrakan (koordinat lokal): kotak [x0, x1, z0, z1] ----------
  const boxes = [
    [CNT.x0 - 0.1, CNT.x1 + 0.1, CNT.z0 - 0.1, CNT.z1 + 0.1],   // meja jaga
    [POT.x - 0.65, POT.x + 0.65, POT.z - 0.65, POT.z + 0.65],   // kuali
    [CRATE.x - 0.5, CRATE.x + 0.5, CRATE.z - 0.5, CRATE.z + 0.5],   // peti
    [TABLE.x - 0.7, TABLE.x + 0.7, TABLE.z - 0.45, TABLE.z + 0.45],   // meja rempah
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const spawn = { x: OX, z: OZ + D / 2 - 2.2, face: Math.PI };   // di dalam pintu, menghadap ke dalam ruangan (-z)
  return {
    group, name: 'Toko Ramuan', icon: '🧪', hint: 'Bicaralah dengan Dewi, si penjual ramuan\nMelangkahlah ke pintu untuk keluar', spawn,
    show(v) { group.visible = !!v; },
    inside(x, z) { const lx = x - OX, lz = z - OZ; return Math.abs(lx) < W / 2 + 0.6 && Math.abs(lz) < D / 2 + 0.6; },
    nearExit(x, z) { const lx = x - OX, lz = z - OZ; return lz > D / 2 - 1.0 && Math.abs(lx) < 1.3; },
    nearSpot(x, z) { return Math.hypot(x - OX - NPC_POS.x, z - OZ - NPC_POS.z) < 2.4 ? SPOT : null; },
    collide(pos, r) {   // dinding + perabot: posisi dijepit ke dalam ruangan lalu didorong keluar dari kotak-kotak perabot
      let lx = clamp(pos.x - OX, -W / 2 + r + 0.1, W / 2 - r - 0.1), lz = clamp(pos.z - OZ, -D / 2 + r + 0.1, D / 2 - r - 0.1);
      const npx = NPC_POS.x, npz = NPC_POS.z;
      for (let pass = 0; pass < 2; pass++) {
        for (const b of boxes) {
          const qx = clamp(lx, b[0], b[1]), qz = clamp(lz, b[2], b[3]), dx = lx - qx, dz = lz - qz, d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d > 1e-5) { lx = qx + dx / d * r; lz = qz + dz / d * r; }
          else { const o = [lx - b[0], b[1] - lx, lz - b[2], b[3] - lz], m = Math.min(...o), k = o.indexOf(m); if (k === 0) lx = b[0] - r; else if (k === 1) lx = b[1] + r; else if (k === 2) lz = b[2] - r; else lz = b[3] + r; }
        }
        const dx = lx - npx, dz = lz - npz, d = Math.hypot(dx, dz), R = r + 0.4;   // Dewi sendiri (lingkaran)
        if (d < R) { if (d > 1e-5) { lx = npx + dx / d * R; lz = npz + dz / d * R; } else lz = npz + R; }
        lx = clamp(lx, -W / 2 + r + 0.1, W / 2 - r - 0.1); lz = clamp(lz, -D / 2 + r + 0.1, D / 2 - r - 0.1);
      }
      pos.x = OX + lx; pos.z = OZ + lz;
    },
    clipCam(pp, cp) { cp.x = clamp(cp.x, OX - W / 2 + 0.4, OX + W / 2 - 0.4); cp.z = clamp(cp.z, OZ - D / 2 + 0.4, OZ + D / 2 - 0.4); cp.y = clamp(cp.y, 0.6, H - 0.35); },
    update(dt, t, px, pz) {   // kuali bergelembung, cahaya berkedip, Dewi menoleh ke pemain
      potLight.intensity = (6.5 + Math.sin(t * 5) * 0.8 + Math.sin(t * 13 + 1) * 0.5) * LIGHT_SCALE;
      brew.material.emissiveIntensity = 1.0 + 0.25 * Math.sin(t * 3);
      for (const b of bubbles) { const k = (t * 0.7 + b.userData.ph) % 1; b.position.y = 1.03 + k * 0.22; b.scale.setScalar(0.5 + k * 0.7); b.visible = k < 0.9; }
      armR.rotation.x = -0.9 + Math.sin(t * 1.4) * 0.08; body.position.y = 0.75 + Math.sin(t * 1.5) * 0.008;
      const ty = Math.atan2(px - OX - NPC_POS.x, pz - OZ - NPC_POS.z), cur = head.rotation.y; head.rotation.y = cur + (clamp(ty, -0.9, 0.9) - cur) * Math.min(1, dt * 4);
    },
  };
}
