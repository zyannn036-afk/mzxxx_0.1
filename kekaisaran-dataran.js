import * as THREE from 'three';
import { APOTHEM, ROAD_W, GATES, EMPIRE_C, EMPIRE_YAW, NW_PLAIN, toWorld } from './kekaisaran-layout.js';
import { loadVillagers } from './desa-npcs.js';

// ============================================================
//  PADANG RUMPUT BARAT LAUT — chunk TERPISAH dari Kota Kekaisaran (dipanggil dari world.js: id 'dataran-bl').
//  Hamparan padang rumput sejauh 400 m di luar Gerbang Barat Laut: rumput tinggi bergoyang ditiup angin, rumpun bunga liar,
//  bercak warna rumput, 3 DESA (rumah-rumah warga, sumur, lampu, papan nama; lihat VILLAGES_BL), pohon jarang, HUTAN lebat di kiri-kanan & ujung padang, apron batu + jalan tanah, lampu, papan nama & tiang jarak tiap 100 m.
//  Tata letak (lingkaran jelajah, ukuran) ada di kekaisaran-layout.js (NW_PLAIN, NW_PLAIN_CIRCLES). Tanah dasar milik dunia (global).
//  Dibangun ringan & bertahap: tiap `yield` = titik berhenti (ChunkManager melanjutkannya di frame berikutnya).
//  Kerangka koordinat lokal sama dengan kota: grup `plain` berada di pusat istana & diputar EMPIRE_YAW; collider dimasukkan ke koordinat DUNIA lewat toWorld().
// ============================================================
export const VILLAGES_BL = [   // 3 desa kecil di tepi jalan padang; d = jarak dari pusat istana searah gerbang (sumbu padang)
  { name: 'Dusun Rumput Wangi', d: APOTHEM + 135, sub: 'Dusun rumah jerami', style: 'jerami' },
  { name: 'Dusun Bunga Liar',   d: APOTHEM + 225, sub: 'Dusun pondok bunga', style: 'bunga' },
  { name: 'Dusun Batas Hutan',  d: APOTHEM + 305, sub: 'Dusun pondok kayu', style: 'kayu' },
];

// Warga 3 dusun di padang. v = indeks VILLAGES_BL, dd = geser sepanjang jalan dari pusat dusun, off = geser ke samping jalan,
// tex = green | blue | brown | yellow, face = arah hadap (rad, kerangka lokal padang), scale = tinggi relatif
export const WARGA_BL = [
  { id: 'darto', name: 'Pak Darto', role: 'Petani Jerami', v: 0, dd: -12, off: 4.5, face: 1.6, tex: 'yellow', scale: 1,
    sapa: 'Eh, ada petualang lewat! Jerami tahun ini emas semua, lihat saja atap-atap itu.',
    kabar: 'Baik-baik saja. Cuma burung-burung makin nakal, hobinya mencuri biji.',
    rumor: 'Katanya makin jauh ke barat, makin sering terdengar auman dari Lembah Bebatuan.',
    topik: [{ t: '🌾 Kenapa atapnya dari jerami?', a: 'Dingin di malam hari, sejuk di siang hari, dan murah. Cuma harus diganti tiap dua tahun.' }] },
  { id: 'sari', name: 'Bu Sari', role: 'Penjaga Sumur', v: 0, dd: 3, off: -4.5, face: -1.6, tex: 'green', scale: 0.97,
    sapa: 'Haus, Nak? Air sumur kami paling jernih di seluruh padang.',
    kabar: 'Sehat, syukur. Hanya pinggangku ini yang suka protes kalau menimba.',
    rumor: 'Pedagang yang lewat bilang jalan ke kota dungeon ramai oleh petualang pemula.' },
  { id: 'rina', name: 'Rina', role: 'Penjual Bunga', v: 1, dd: -10, off: 4.5, face: 1.6, tex: 'blue', scale: 0.95,
    sapa: 'Selamat datang di Dusun Bunga Liar! Mau bunga untuk keberuntungan di dungeon?',
    kabar: 'Bunga bermekaran semua, jadi aku sibuk dari pagi sampai sore.',
    rumor: 'Ada yang melihat bunga ungu aneh tumbuh dekat pinggir hutan. Katanya mekarnya hanya saat malam.',
    topik: [{ t: '🌼 Bunga apa yang paling laku?', a: 'Yang kuning, katanya pembawa rezeki. Petualang percaya takhayul semacam itu.' }] },
  { id: 'bima', name: 'Bima', role: 'Anak Gembala', v: 1, dd: 12, off: -4.5, face: -1.6, tex: 'brown', scale: 0.8,
    sapa: 'Kakak petualang?! Keren! Pedangnya boleh kulihat?',
    kabar: 'Aku jaga domba. Kemarin satu domba hilang, ternyata tidur di balik semak.',
    rumor: 'Kata kakakku, di hutan ujung padang ada goblin. Tapi aku tidak takut... sedikit.' },
  { id: 'harun', name: 'Pak Harun', role: 'Penebang Kayu', v: 2, dd: -11, off: 4.5, face: 1.6, tex: 'brown', scale: 1.03,
    sapa: 'Hati-hati, Nak. Dusun Batas Hutan ini tempat terakhir sebelum rimba.',
    kabar: 'Kayu laku keras, soalnya kota dungeon butuh banyak balok untuk perbaikan.',
    rumor: 'Pohon-pohon di dalam sana tumbuh rapat sekali. Konon ada jalan tanah yang menembus sampai ke kota dungeon.' },
  { id: 'mawar', name: 'Mawar', role: 'Pemburu', v: 2, dd: 11, off: -4.5, face: -1.6, tex: 'green', scale: 0.98,
    sapa: 'Jejakmu bersih. Kamu bukan orang sini, ya?',
    kabar: 'Hasil buruan lumayan. Rusa makin sering turun ke padang.',
    rumor: 'Kalau mau ke kota dungeon, ikuti jalan tanah. Jangan masuk hutan kecuali kamu bawa lentera.' },
];
const live = [];   // warga padang yang aktif (dipakai desaBLNear untuk tombol E)
export const desaBLNear = (x, z, r = 2.8) => { let b = null, bd = r; for (const n of live) { if (!n.ready) continue; const d = Math.hypot(n.wx - x, n.wz - z); if (d < bd) { bd = d; b = n; } } return b ? b.def : null; };

export function* buildDataranBLGen(o) {
  const { colliders, COARSE, geo, mat, tex } = o;
  const group = new THREE.Group(); group.name = 'padang-barat-laut';
  const plain = new THREE.Group(); plain.position.set(EMPIRE_C.x, 0, EMPIRE_C.z); plain.rotation.y = EMPIRE_YAW; group.add(plain);
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const col = (lx, lz, r) => { const p = toWorld(lx, lz); colliders.push({ x: p.x, z: p.z, r }); };
  const pr = (() => { let a = 20261106; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const Rp = (a, b) => a + pr() * (b - a);

  const gN = GATES[4], ux = Math.cos(gN.psi), uz = Math.sin(gN.psi), nx = -uz, nz = ux, END = APOTHEM + NW_PLAIN.len, HW = NW_PLAIN.halfW;
  const P = (d, off = 0) => ({ x: ux * d + nx * off, z: uz * d + nz * off });   // d = jarak dari pusat istana searah gerbang, off = geser ke samping

  // ---------- Tekstur kecil (canvas) & material ----------
  const ctex = (size, draw) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const noise = (x, s, n, c0, c1, a) => { for (let i = 0; i < n; i++) { const g = c0 + Math.random() * (c1 - c0) | 0; x.fillStyle = `rgba(${g},${g - 4},${g - 12},${a})`; x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
  const cobbleT = ctex(128, (x, s) => { x.fillStyle = '#6f6a60'; x.fillRect(0, 0, s, s); for (let r = 0; r < 4; r++) for (let c = -1; c < 5; c++) { const g = 138 + Math.random() * 46 | 0; x.fillStyle = `rgb(${g},${g - 6},${g - 18})`; x.fillRect(c * 32 + (r % 2) * 16 + 1.5, r * 32 + 1.5, 29, 29); } noise(x, s, 300, 90, 200, 0.25); });
  const sandT = ctex(128, (x, s) => { x.fillStyle = '#b89e68'; x.fillRect(0, 0, s, s); noise(x, s, 700, 140, 225, 0.3); });
  const decalMat = (map, lvl) => new THREE.MeshStandardMaterial({ map, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -lvl, polygonOffsetUnits: -lvl });
  const M = { cobble: decalMat(cobbleT, 3), sand: decalMat(sandT, 2), timber: new THREE.MeshStandardMaterial({ color: 0x5b3d22, roughness: 1, flatShading: true }), wood: new THREE.MeshStandardMaterial({ color: 0x8b6338, roughness: 1, flatShading: true }),
    lantern: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa83a, emissiveIntensity: 0.9, roughness: 0.6, flatShading: true }) };
  const cyl = (a, b, h, n = 6) => new THREE.CylinderGeometry(a, b, h, n), box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const mesh = (g, m, x, y, z, parent, shadow = true) => { const k = new THREE.Mesh(g, m); k.position.set(x, y, z); k.castShadow = shadow; k.receiveShadow = true; parent.add(k); return k; };

  // ---------- Bercak warna rumput (dekal transparan; membuat hamparan tidak terlihat seragam) ----------
  {
    const patchTex = tex.radialAlpha(0.25), patchGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    const mats = [0x3f8a30, 0x6bb044, 0x5aa03a, 0x86b84a, 0xa7b24a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: 0.5, alphaMap: patchTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    const n = COARSE ? 36 : 70;
    for (let i = 0; i < n; i++) {
      const p = P(Rp(APOTHEM + 8, END - 6), Rp(-HW, HW)), s = Rp(7, 20), m = new THREE.Mesh(patchGeo, mats[i % mats.length]);
      m.position.set(p.x, 0.012, p.z); m.scale.set(s, 1, s * Rp(0.6, 1)); m.rotation.y = pr() * 6.283; m.receiveShadow = true; plain.add(m);
    }
  }
  yield;

  // ---------- Jalan (dekal datar) ----------
  function decalStrip(x0, z0, x1, z1, w, m, lvl, uvs) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, ax = -dz / l * w / 2, az = dx / l * w / 2;
    const pts = [[x0 + ax, z0 + az], [x1 + ax, z1 + az], [x1 - ax, z1 - az], [x0 - ax, z0 - az]], pos = [], uv = [];
    pts.forEach(([x, z]) => { pos.push(x, 0, z); uv.push(x * uvs, z * uvs); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const k = new THREE.Mesh(g, m); k.position.y = 0.02 + lvl * 0.004; k.receiveShadow = true; plain.add(k); return k;
  }
  const ROAD_HW = 2.5;   // setengah lebar jalan tanah
  { const a = P(APOTHEM + 3), b = P(APOTHEM + 38); decalStrip(a.x, a.z, b.x, b.z, ROAD_W, M.cobble, 3, 0.33); }   // apron batu (menyambung jalan radial yang berakhir di APOTHEM + 3)
  { const a = P(APOTHEM + 36), b = P(END - 6); decalStrip(a.x, a.z, b.x, b.z, ROAD_HW * 2, M.sand, 2, 0.3); }      // jalan tanah sampai 6 m dari ujung padang
  yield;

  // ---------- Lampu, papan nama & tiang jarak ----------
  const solids = [];   // titik terlarang untuk rumput & bunga (koordinat sumbu: d, off, radius)
  const mark = (d, off, r) => solids.push({ d, off, r });
  const lamp = (x, z) => { const l = new THREE.Group(); l.position.set(x, 0, z); plain.add(l); mesh(cyl(0.07, 0.1, 2.6), M.timber, 0, 1.3, 0, l); mesh(box(0.3, 0.38, 0.3), M.lantern, 0, 2.75, 0, l, false); mesh(box(0.44, 0.08, 0.44), M.timber, 0, 2.99, 0, l); col(x, z, 0.22); };
  for (const d of [APOTHEM + 10, APOTHEM + 24]) for (const sd of [-1, 1]) { const p = P(d, sd * (ROAD_W / 2 + 1.4)); lamp(p.x, p.z); }
  function signPost(d, off, fd, text, sub, scale = 1, w = 2.6, h = 1.2) {   // papan di (d, off) menghadap ke arah ujung padang (fd = d tujuan)
    const p = P(d, off), f = P(fd, off); mark(d, off, 1.2 * scale);
    const tx = ctex(256, (c, s) => {
      c.fillStyle = '#8b6338'; c.fillRect(0, 0, s, s); c.strokeStyle = '#4a2f18'; c.lineWidth = 8; c.strokeRect(4, 4, s - 8, s - 8); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#f3e3bd'; let fs = 56; c.font = `bold ${fs}px Georgia`; while (c.measureText(text).width > s - 30 && fs > 16) c.font = `bold ${fs -= 2}px Georgia`; c.fillText(text, s / 2, s * 0.36);
      c.fillStyle = '#e3c98a'; fs = 30; c.font = `bold ${fs}px Georgia`; while (c.measureText(sub).width > s - 30 && fs > 12) c.font = `bold ${fs -= 2}px Georgia`; c.fillText(sub, s / 2, s * 0.68);
    });
    const front = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(f.x - p.x, f.z - p.z); g.scale.setScalar(scale); plain.add(g);
    mesh(cyl(0.07, 0.09, 2.5, 8), M.timber, 0, 1.25, 0, g);
    const b = new THREE.Mesh(box(w, h, 0.1), [M.wood, M.wood, M.wood, M.wood, front, M.wood]); b.position.set(0, 2.1, 0.08); b.castShadow = true; g.add(b);
    mesh(box(w + 0.2, 0.08, 0.16), M.timber, 0, 2.1 + h / 2 + 0.05, 0.08, g); col(p.x, p.z, 0.3 * scale);
  }
  signPost(APOTHEM + 14, 8.5, APOTHEM + 60, 'PADANG RUMPUT', 'Barat Laut · 400 m', 1.15, 3.2, 1.3);
  for (const m of [100, 200, 300]) signPost(APOTHEM + m, 5.5, APOTHEM + m + 40, m + ' M', 'dari Gerbang Barat Laut', 1, 2.6, 1.2);
  signPost(END - 10, 5.5, END + 40, 'UJUNG PADANG', '400 m dari gerbang', 1.1, 3.0, 1.3);
  yield;

  // ---------- 3 DESA: rumah-rumah warga di kedua sisi jalan (tiap desa GAYA BEDA: jerami / pondok bunga / pondok kayu; instancing per bagian), sumur, lampu, papan nama ----------
  const solidFree = (d, off, pad = 0) => { for (const s of solids) if (Math.hypot(s.d - d, s.off - off) < s.r + pad) return false; return true; };
  {
    // Tiap desa punya GAYA RUMAH sendiri supaya mudah dibedakan (indeks = VILLAGES_BL):
    //  0 Rumput Wangi = RUMAH JERAMI (atap rumbia emas tebal, dinding krem berbingkai kayu, kotak lavender, tumpukan jerami)
    //  1 Bunga Liar   = PONDOK BUNGA (cat pastel warna-warni, daun jendela & atap senada, teras beratap, pagar putih, petak bunga)
    //  2 Batas Hutan  = PONDOK KAYU (dinding gelondongan bertumpuk, teras panjang, cerobong batu besar di samping, kayu bakar, tunggul)
    const STYLE = [
      { w: [6, 8.5], dep: [5, 6.5], wh: [2.7, 3.2], rh: [2.3, 2.9], wall: [0xeadfc2, 0xe2d4a8, 0xf0e6cc, 0xdccb9a], roof: [0xc8a548, 0xb89438, 0xd2b45a, 0xbf9c40] },
      { w: [5, 6.6], dep: [4.6, 5.5], wh: [3.0, 3.6], rh: [2.6, 3.3], wall: [0xf2b6c4, 0xcab8ee, 0xb4e0c8, 0xaad4f0, 0xf7e0a0], roof: [0xd94f6a, 0x7a4fb0, 0x2f9a7a, 0x3a7fc0, 0xe0a030] },
      { w: [6, 8], dep: [5, 6.4], wh: [2.7, 3.1], rh: [1.7, 2.2], wall: [0x4a3322], roof: [0x4a3a2a, 0x3f3326, 0x55422c, 0x45523a] },
    ];
    const houses = [];
    VILLAGES_BL.forEach((v, vi) => {
      const ST = STYLE[vi % STYLE.length];
      const tryHouse = (dd, off, sd) => {
        const w = Rp(ST.w[0], ST.w[1]), dep = Rp(ST.dep[0], ST.dep[1]), rad = Math.hypot(w, dep) / 2 + 0.8;
        if (!solidFree(dd, off, rad - 0.5) || houses.some(h => Math.hypot(h.d - dd, h.off - off) < h.rad + rad)) return;
        const dir = { x: -sd * nx, z: -sd * nz };   // pintu menghadap sumbu jalan
        houses.push({ d: dd, off, sd, vi, w, dep, wh: Rp(ST.wh[0], ST.wh[1]), rh: Rp(ST.rh[0], ST.rh[1]), rad, th: Math.atan2(dir.x, dir.z) + Rp(-0.12, 0.12), wc: ST.wall[(pr() * ST.wall.length) | 0], rc: ST.roof[(pr() * ST.roof.length) | 0] });
      };
      for (const sd of [-1, 1]) {
        for (const dd of [-27, -9, 9, 27]) if (pr() > 0.12) tryHouse(v.d + dd + Rp(-2, 2), sd * (11 + Rp(0, 2.5)), sd);   // baris depan (dekat jalan)
        for (const dd of [-18, 0, 18]) if (pr() < 0.7) tryHouse(v.d + dd + Rp(-2, 2), sd * (22 + Rp(0, 1.2)), sd);        // baris belakang
      }
      // sumur di tepi jalan, dua lampu, papan nama desa (menghadap ke arah ujung padang)
      const wp = P(v.d, -7), wg = new THREE.Group(); wg.position.set(wp.x, 0, wp.z); plain.add(wg);
      const stoneM = new THREE.MeshStandardMaterial({ color: 0x8a8576, roughness: 1, flatShading: true });
      mesh(cyl(1.0, 1.1, 0.9, 10), stoneM, 0, 0.45, 0, wg); mesh(cyl(0.8, 0.8, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x2f7db3, roughness: 0.2 }), 0, 0.86, 0, wg, false);
      for (const sx of [-1, 1]) mesh(box(0.12, 2.2, 0.12), M.timber, sx * 0.95, 1.1, 0, wg); mesh(box(2.5, 0.12, 1.7), M.wood, 0, 2.25, 0, wg); mesh(cyl(0.04, 0.04, 1.9, 5), M.timber, 0, 1.6, 0, wg, false).rotation.z = Math.PI / 2;
      col(wp.x, wp.z, 1.15); mark(v.d, -7, 1.7);
      { const a = P(v.d - 7, ROAD_HW + 1.8), b = P(v.d + 7, -(ROAD_HW + 1.8)); lamp(a.x, a.z); lamp(b.x, b.z); }
      signPost(v.d - 38, -5.5, v.d, v.name.toUpperCase(), v.sub || 'Rumah warga padang', 1.1, 3.2, 1.3);
    });
    const H = houses.length;
    if (H) {
      const Y = new THREE.Vector3(0, 1, 0), hm = new THREE.Matrix4(), tm = new THREE.Matrix4(), qy = new THREE.Quaternion(), q0 = new THREE.Quaternion(), qe = new THREE.Quaternion(), eu = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
      const boxB = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), boxC = new THREE.BoxGeometry(1, 1, 1);
      const roofG = (() => {   // prisma atap pelana satuan: alas 1×1 di y = 0, bubungan di y = 1 sepanjang sumbu-x
        const A = [-.5, 0, .5], B = [.5, 0, .5], C = [.5, 1, 0], D = [-.5, 1, 0], E = [-.5, 0, -.5], F = [.5, 0, -.5];
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(A, B, C, A, C, D, F, E, D, F, D, C, A, D, E, B, F, C), 3)); g.computeVertexNormals(); return g;
      })();
      const gableG = (() => { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; })();   // prisma segitiga satuan, bubungan sejajar sumbu-z
      const cylU = new THREE.CylinderGeometry(1, 1, 1, 7), coneU = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), cylB = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
      const std = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true, ...extra });
      const sr = (() => { let a = 20261109; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();   // acak terpisah untuk hiasan (tidak menggeser acak dunia)
      const flowCols = [0xe8607a, 0xf2c94a, 0xf4f0e8, 0xb06ad8, 0xff8a3a, 0x6aa8ff];
      const IM = (geo, mat, n, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; plain.add(m); return m; };
      const walls = new THREE.InstancedMesh(boxB, std(0xffffff), H), roofs = new THREE.InstancedMesh(roofG, std(0xffffff, { side: THREE.DoubleSide }), H), doors = new THREE.InstancedMesh(boxC, std(0xffffff), H),
        wins = new THREE.InstancedMesh(boxC, new THREE.MeshStandardMaterial({ color: 0x31405e, emissive: 0xffc46a, emissiveIntensity: 0.55, roughness: 0.4 }), H * 3), chim = new THREE.InstancedMesh(boxB, std(0x8a8576), H);
      const byV = VILLAGES_BL.map((_, vi) => houses.filter(h => h.vi === vi));
      const cnt = byV.map(() => 0);

      // ---------- Gaya 0: RUMAH JERAMI ----------
      const mkThatch = (n) => {
        const skirt = IM(roofG, std(0x8c6c26, { side: THREE.DoubleSide }), n), roll = IM(boxB, std(0x6a4c1c), n), found = IM(boxB, std(0x8a8576), n), studs = IM(boxB, std(0x4a3322), n * 2), beam = IM(boxB, std(0x4a3322), n),
          frame = IM(boxC, std(0x4a3322), n), step = IM(boxB, std(0x9a937e), n), fb = IM(boxB, std(0x6a4a28), n * 2), lav = IM(boxC, std(0xffffff), n * 8, false), hay = IM(coneU, std(0xd8b858), n), hayB = IM(cylB, std(0xb89838), n), ccap = IM(boxB, std(0x6a665c), n);
        return (h, k, i, put, colH) => {
          put(roofs, i, 0, h.wh, 0, h.w + 1.2, h.rh, h.dep + 1.2);
          put(skirt, k, 0, h.wh - 0.2, 0, h.w + 1.55, h.rh + 0.12, h.dep + 1.55); put(roll, k, 0, h.wh + h.rh - 0.05, 0, h.w + 1.3, 0.3, 0.55);
          put(found, k, 0, 0, 0, h.w + 0.2, 0.35, h.dep + 0.2);
          for (const [q, sx] of [[0, -1], [1, 1]]) put(studs, k * 2 + q, sx * (h.w / 2 - 0.06), 0.3, h.dep / 2 + 0.03, 0.22, h.wh - 0.3, 0.2);
          put(beam, k, 0, h.wh - 0.4, h.dep / 2 + 0.03, h.w + 0.04, 0.26, 0.2);
          put(frame, k, 0, 1.075, h.dep / 2 + 0.0, 1.5, 2.15, 0.1); put(step, k, 0, 0, h.dep / 2 + 0.4, 1.6, 0.14, 0.7);
          for (let q = 0; q < 2; q++) {
            const wx = (q ? 1 : -1) * (h.w / 2 - 1.25), wy = h.wh * 0.55;
            put(fb, k * 2 + q, wx, wy - 0.72, h.dep / 2 + 0.2, 1.0, 0.2, 0.32);
            for (let f = 0; f < 4; f++) { put(lav, (k * 2 + q) * 4 + f, wx - 0.36 + f * 0.24, wy - 0.45, h.dep / 2 + 0.2, 0.14, 0.34 + (f % 2) * 0.1, 0.14); lav.setColorAt((k * 2 + q) * 4 + f, tmpC.setHex([0xa78bd8, 0x8a6ac8, 0x6aaa4a][f % 3])); }
          }
          const hs = k % 2 ? 1 : -1, hx = hs * (h.w / 2 + 1.5), hz = h.dep / 2 - 0.7;
          put(hay, k, hx, 0.4, hz, 1.0, 1.6, 1.0); put(hayB, k, hx, 0, hz, 1.0, 0.5, 1.0); colH(hx, hz, 1.0);
          put(ccap, k, h.w * 0.28, h.wh + h.rh * 0.35 + h.rh * 0.9 + 1.0, -h.dep * 0.12, 0.95, 0.16, 0.95);
        };
      };

      // ---------- Gaya 1: PONDOK BUNGA ----------
      const fenceX = (h) => { const a = []; for (let x = -(h.w / 2 + 0.7); x <= h.w / 2 + 0.71; x += 0.34) if (Math.abs(x) > 0.95) a.push(x); return a; };
      const mkBloom = (n, list) => {
        const nf = list.reduce((s, h) => s + fenceX(h).length, 0);
        const posts = IM(boxB, std(0xf8f2e4), n * 4), belt = IM(boxB, std(0xf8f2e4), n), found = IM(boxB, std(0xb8b0a8), n), shut = IM(boxC, std(0xffffff), n * 4), fbx = IM(boxB, std(0xf8f2e4), n * 2),
          gable = IM(gableG, std(0xffffff, { side: THREE.DoubleSide }), n), pfloor = IM(boxB, std(0xa88458), n), ppost = IM(boxB, std(0xf8f2e4), n * 2), frame = IM(boxC, std(0xf8f2e4), n), step = IM(boxB, std(0xc8c0b0), n),
          pick = IM(boxB, std(0xf8f2e4), nf), rail = IM(boxB, std(0xf8f2e4), n * 4), bed = IM(boxB, std(0x5a3e24), n * 2), flw = IM(boxC, std(0xffffff), n * 18, false), stem = IM(boxB, std(0x3f8a3a), n * 2);
        let fi = 0;
        return (h, k, i, put, colH) => {
          let j = 0; for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(posts, k * 4 + j++, sx * h.w / 2, 0, sz * h.dep / 2, 0.26, h.wh, 0.26);
          put(belt, k, 0, h.wh - 0.22, 0, h.w + 0.1, 0.22, h.dep + 0.1); put(found, k, 0, 0, 0, h.w + 0.2, 0.3, h.dep + 0.2);
          doors.setColorAt(i, tmpC.setHex(h.rc)); put(frame, k, 0, 1.075, h.dep / 2 + 0.0, 1.55, 2.15, 0.1); put(step, k, 0, 0, h.dep / 2 + 0.36, 1.9, 0.14, 0.72);
          let fl = 0;
          for (let q = 0; q < 2; q++) {
            const wx = (q ? 1 : -1) * (h.w / 2 - 1.25), wy = h.wh * 0.55;
            for (const t of [-1, 1]) { put(shut, k * 4 + q * 2 + (t > 0 ? 1 : 0), wx + t * 0.68, wy, h.dep / 2 + 0.06, 0.42, 0.9, 0.06); shut.setColorAt(k * 4 + q * 2 + (t > 0 ? 1 : 0), tmpC.setHex(h.rc)); }
            put(fbx, k * 2 + q, wx, wy - 0.72, h.dep / 2 + 0.22, 1.05, 0.24, 0.34);
            for (let f = 0; f < 4; f++) { put(flw, k * 18 + fl, wx - 0.36 + f * 0.24, wy - 0.46, h.dep / 2 + 0.22, 0.16, 0.16, 0.16); flw.setColorAt(k * 18 + fl++, tmpC.setHex(flowCols[(sr() * flowCols.length) | 0])); }
          }
          // teras kecil beratap pelana (warna atap) di atas pintu
          put(gable, k, 0, 2.45, h.dep / 2 + 0.55, 2.8, 1.0, 2.0); gable.setColorAt(k, tmpC.setHex(h.rc));
          put(pfloor, k, 0, 0, h.dep / 2 + 0.75, 2.8, 0.12, 1.5);
          for (const [q, sx] of [[0, -1], [1, 1]]) { put(ppost, k * 2 + q, sx * 1.2, 0, h.dep / 2 + 1.4, 0.14, 2.45, 0.14); colH(sx * 1.2, h.dep / 2 + 1.4, 0.22); }
          // pagar putih di depan (celah di jalan masuk) + dua petak bunga
          const fz = h.dep / 2 + 2.5, xs = fenceX(h);
          xs.forEach((x, n2) => { put(pick, fi++, x, 0, fz, 0.1, 0.75 + ((n2 * 7) % 3) * 0.05, 0.06); if (n2 % 2 === 0) colH(x, fz, 0.42); });
          for (const [q, sx] of [[0, -1], [1, 1]]) {
            put(rail, k * 4 + q * 2, sx * (h.w / 2 + 0.7 + 0.95) / 2 + sx * 0.0, 0.28, fz, (h.w / 2 + 0.7 - 0.95), 0.06, 0.05);
            put(rail, k * 4 + q * 2 + 1, sx * (h.w / 2 + 0.7 + 0.95) / 2, 0.55, fz, (h.w / 2 + 0.7 - 0.95), 0.06, 0.05);
            const bx = sx * 2.5, bz = h.dep / 2 + 1.6;
            put(bed, k * 2 + q, bx, 0, bz, 1.8, 0.22, 0.9);
            for (let f = 0; f < 5; f++) { put(flw, k * 18 + fl, bx - 0.7 + f * 0.35, 0.32 + (f % 2) * 0.08, bz + (f % 2 ? 0.15 : -0.15), 0.2, 0.2, 0.2); flw.setColorAt(k * 18 + fl++, tmpC.setHex(flowCols[(sr() * flowCols.length) | 0])); }
            put(stem, k * 2 + q, bx, 0.2, bz, 1.5, 0.1, 0.4);
          }
          for (let r = fl; r < 18; r++) { put(flw, k * 18 + r, 0, -5, 0, 0, 0, 0); flw.setColorAt(k * 18 + r, tmpC.setHex(0xffffff)); }
        };
      };

      // ---------- Gaya 2: PONDOK KAYU ----------
      const nLog = h => Math.floor((h.wh - 0.3) / 0.3) + 1;
      const mkCabin = (n, list) => {
        const total = list.reduce((s, h) => s + nLog(h) * 4, 0); let base = 0; list.forEach(h => { h.logBase = base; base += nLog(h) * 4; });
        const logs = IM(cylU, std(0xffffff), total), ridge = IM(boxB, std(0x2e2216), n), frame = IM(boxC, std(0x2e2014), n), shut = IM(boxC, std(0x4a3322), n * 4), pfloor = IM(boxB, std(0x8a6a40), n), ppost = IM(boxB, std(0x4a3322), n * 2), proof = IM(boxC, std(0x3a2c1e), n),
          wood = IM(cylU, std(0x7a5732), n * 6), stump = IM(cylB, std(0x7a5732), n), srect = IM(cylB, std(0xb8946a), n), lant = IM(boxC, M.lantern, n, false), ccap = IM(boxB, std(0x4f4c46), n), step = IM(boxB, std(0x6f6a5c), n);
        const logCols = [0x7a5532, 0x6a4828, 0x8a6238];
        return (h, k, i, put, colH, putR) => {
          put(doors, i, 0, 0.95, h.dep / 2 + 0.12, 1.1, 1.9, 0.12); put(frame, k, 0, 1.05, h.dep / 2 + 0.06, 1.45, 2.1, 0.1);
          put(wins, i * 3, -(h.w / 2 - 1.25), h.wh * 0.55, h.dep / 2 + 0.12, 0.8, 0.8, 0.12); put(wins, i * 3 + 1, h.w / 2 - 1.25, h.wh * 0.55, h.dep / 2 + 0.12, 0.8, 0.8, 0.12); put(wins, i * 3 + 2, h.w / 2 + 0.1, h.wh * 0.55, 0, 0.12, 0.8, 0.8);
          for (let q = 0; q < 2; q++) for (const t of [-1, 1]) put(shut, k * 4 + q * 2 + (t > 0 ? 1 : 0), (q ? 1 : -1) * (h.w / 2 - 1.25) + t * 0.62, h.wh * 0.55, h.dep / 2 + 0.17, 0.38, 0.85, 0.06);
          // gelondongan bertumpuk (depan/belakang & kiri/kanan berselang-seling, ujungnya menjulur di sudut)
          const nl = nLog(h); let li = h.logBase;
          for (let r = 0; r < nl; r++) {
            const y = 0.17 + r * 0.3, y2 = y + 0.15;
            for (const sz of [-1, 1]) { putR(logs, li, 0, y, sz * (h.dep / 2 - 0.1), 0.17, h.w + 0.5, 0.17, 0, 0, Math.PI / 2); logs.setColorAt(li++, tmpC.setHex(logCols[(r + (sz > 0 ? 1 : 0)) % 3])); }
            for (const sx of [-1, 1]) { putR(logs, li, sx * (h.w / 2 - 0.1), y2, 0, 0.17, h.dep + 0.5, 0.17, Math.PI / 2, 0, 0); logs.setColorAt(li++, tmpC.setHex(logCols[(r + 1 + (sx > 0 ? 1 : 0)) % 3])); }
          }
          put(roofs, i, 0, h.wh + nl * 0.0, 0, h.w + 1.7, h.rh, h.dep + 1.7); put(ridge, k, 0, h.wh + h.rh - 0.02, 0, h.w + 1.8, 0.2, 0.32);
          put(chim, i, h.w / 2 + 0.6, 0, -1.3, 1.1, h.wh + h.rh * 0.8 + 0.9, 1.5); put(ccap, k, h.w / 2 + 0.6, h.wh + h.rh * 0.8 + 0.9, -1.3, 1.4, 0.2, 1.8); colH(h.w / 2 + 0.6, -1.3, 1.1);
          // teras panjang beratap miring + 2 tiang + lentera
          put(pfloor, k, 0, 0, h.dep / 2 + 1.1, h.w * 0.8, 0.2, 2.2); put(step, k, 0, 0, h.dep / 2 + 2.25, 1.8, 0.1, 0.5);
          for (const [q, sx] of [[0, -1], [1, 1]]) { put(ppost, k * 2 + q, sx * (h.w * 0.4 - 0.1), 0, h.dep / 2 + 2.0, 0.24, 2.45, 0.24); colH(sx * (h.w * 0.4 - 0.1), h.dep / 2 + 2.0, 0.3); }
          putR(proof, k, 0, 2.78, h.dep / 2 + 1.1, h.w * 0.9, 0.14, 2.8, 0.2, 0, 0); put(lant, k, 0, 2.2, h.dep / 2 + 1.9, 0.22, 0.3, 0.22);
          // kayu bakar di dinding kiri + tunggul di depan-kanan
          let wi = 0; for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) { putR(wood, k * 6 + wi++, -(h.w / 2 + 0.4) + (c - (2 - r) / 2) * 0.26, 0.13 + r * 0.23, -0.3, 0.12, 1.4, 0.12, Math.PI / 2, 0, 0); }
          colH(-(h.w / 2 + 0.45), -0.3, 0.8);
          const sx2 = h.w / 2 + 1.0, sz2 = h.dep / 2 + 0.9;
          put(stump, k, sx2, 0, sz2, 0.4, 0.45, 0.4); put(srect, k, sx2, 0.44, sz2, 0.34, 0.03, 0.34); colH(sx2, sz2, 0.45);
        };
      };

      const sty = byV.map((lst, vi) => lst.length ? [mkThatch, mkBloom, mkCabin][vi % 3](lst.length, lst) : null);
      houses.forEach((h, i) => {
        const p = P(h.d, h.off); qy.setFromAxisAngle(Y, h.th); hm.compose(v3.set(p.x, 0, p.z), qy, sc.set(1, 1, 1));
        const put = (m, idx, lx, ly, lz, sx, sy, sz) => { tm.compose(v3.set(lx, ly, lz), q0, sc.set(sx, sy, sz)); tm.premultiply(hm); m.setMatrixAt(idx, tm); };
        const putR = (m, idx, lx, ly, lz, sx, sy, sz, rx, ry, rz) => { tm.compose(v3.set(lx, ly, lz), qe.setFromEuler(eu.set(rx, ry, rz)), sc.set(sx, sy, sz)); tm.premultiply(hm); m.setMatrixAt(idx, tm); };
        const sn = Math.sin(h.th), cs = Math.cos(h.th), colH = (lx, lz, r) => col(p.x + cs * lx + sn * lz, p.z - sn * lx + cs * lz, r);   // koordinat lokal rumah -> koordinat padang (tabrakan)
        put(walls, i, 0, 0, 0, h.w, h.wh, h.dep); put(roofs, i, 0, h.wh, 0, h.w + 0.9, h.rh, h.dep + 0.9); put(doors, i, 0, 0.95, h.dep / 2 + 0.04, 1.1, 1.9, 0.12);
        put(wins, i * 3, -(h.w / 2 - 1.25), h.wh * 0.55, h.dep / 2 + 0.04, 0.8, 0.8, 0.12); put(wins, i * 3 + 1, h.w / 2 - 1.25, h.wh * 0.55, h.dep / 2 + 0.04, 0.8, 0.8, 0.12); put(wins, i * 3 + 2, h.w / 2 + 0.04, h.wh * 0.55, 0, 0.12, 0.8, 0.8);
        put(chim, i, h.w * 0.28, h.wh + h.rh * 0.35, -h.dep * 0.12, 0.7, h.rh * 0.9 + 1.0, 0.7);
        walls.setColorAt(i, tmpC.setHex(h.wc)); roofs.setColorAt(i, tmpC.setHex(h.rc)); doors.setColorAt(i, tmpC.setHex(0x4f3420));
        sty[h.vi](h, cnt[h.vi]++, i, put, colH, putR);   // detail khas desa (menimpa bagian umum di atas bila perlu)
        // tabrakan: deretan lingkaran sepanjang lebar rumah (sumbu-x lokal rumah)
        const ax = Math.cos(h.th), az = -Math.sin(h.th), r = h.dep / 2 + 0.25, L = h.w / 2 - r;
        if (L <= 0) col(p.x, p.z, Math.hypot(h.w, h.dep) / 2); else { for (let a = -L; a < L; a += r * 1.15) col(p.x + ax * a, p.z + az * a, r); col(p.x + ax * L, p.z + az * L, r); }
        mark(h.d, h.off, h.rad + (h.vi === 1 ? 2.4 : h.vi === 2 ? 1.6 : 1.2));
        { const a = P(h.d, h.sd * ROAD_HW), b = P(h.d, h.off - h.sd * (h.dep / 2 + 0.5)); decalStrip(a.x, a.z, b.x, b.z, 1.5, M.sand, 2, 0.3); }   // jalan setapak dari jalan ke pintu
      });
      for (const m of [walls, roofs, doors, wins, chim]) { m.castShadow = m !== wins && m !== doors; m.receiveShadow = true; m.frustumCulled = false; plain.add(m); }
    }
  }
  yield;

  // ---------- Pohon: pohon jarang di padang + HUTAN lebat (pita di kiri-kanan padang & tembok hutan di ujung; jalan tanah masuk ke hutan, jalur selebar 16 m dibiarkan terbuka) ----------
  const FOREST_EDGE = 30, FOREST_END = END - 50;                                  // hutan kiri-kanan mulai dari |off| > 30; hutan ujung mulai dari 50 m sebelum ujung padang
  const c01 = v => Math.max(0, Math.min(1, v));
  const forestDens = (d, off) => Math.max(d > APOTHEM + 40 ? c01((Math.abs(off) - FOREST_EDGE) / 8 + 0.45) : 0, Math.abs(off) > 8 ? c01((d - FOREST_END) / 8 + 0.45) : 0);   // 0..1, tepi hutan bergerigi
  const oaks = [], pines = [];
  for (let d = APOTHEM + 30; d < FOREST_END - 8; d += 17) for (const sd of [-1, 1]) {   // pohon jarang di padang terbuka
    if (pr() > 0.3) continue;
    const dd = d + Rp(-6, 6), off = sd * Rp(14, FOREST_EDGE - 4);
    if (oaks.some(t => Math.hypot(t.d - dd, t.off - off) < 14) || !solidFree(dd, off, 2)) continue;
    oaks.push({ d: dd, off, s: Rp(0.7, 1.05), a: pr() * 6.283 }); mark(dd, off, 1.3);
  }
  {
    const cell = COARSE ? 6 : 4.2;   // jarak petak rapat: ±1 pohon per petak (tajuk saling tumpang-tindih)
    for (let d = APOTHEM + 40; d < END - 1; d += cell) for (let off = -HW; off < HW; off += cell) {
      const dd = d + Rp(0, cell), oo = off + Rp(0, cell);
      if (Math.abs(oo) > HW - 1 || dd > END - 1 || pr() > forestDens(dd, oo) * 1.15 || !solidFree(dd, oo, 0.5)) continue;
      (pr() < 0.45 ? pines : oaks).push({ d: dd, off: oo, s: Rp(0.95, 1.7), a: pr() * 6.283 });
    }
    // semak belukar di lantai hutan (tajuk ek diperkecil, tanpa batang; tidak diberi collider supaya jalan tidak tersangkut)
    const bl = geo.oakLeaf; bl.computeBoundingBox(); const by = bl.boundingBox.min.y, bushes = [], nB = COARSE ? 260 : 620;
    for (let tries = 0; bushes.length < nB && tries < nB * 8; tries++) {
      const dd = Rp(APOTHEM + 40, END - 1), oo = Rp(-HW + 1, HW - 1);
      if (pr() > forestDens(dd, oo) - 0.1 || !solidFree(dd, oo, 0.3)) continue;
      bushes.push({ d: dd, off: oo, s: Rp(0.28, 0.5), a: pr() * 6.283 });
    }
    if (bushes.length) {
      const bm = new THREE.InstancedMesh(bl, mat.leafMat(0.02), bushes.length);
      bushes.forEach((t, i) => { const p = P(t.d, t.off); dummy.position.set(p.x, -by * t.s - 0.1, p.z); dummy.rotation.set(0, t.a, 0); dummy.scale.set(t.s * 1.3, t.s, t.s * 1.3); dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix); bm.setColorAt(i, tmpC.setRGB(Rp(0.55, 0.85), Rp(0.75, 1.0), Rp(0.5, 0.8))); });
      bm.castShadow = false; bm.receiveShadow = true; plain.add(bm);
    }
  }
  function addTrees(list, trunkGeo, leafGeo) {
    if (!list.length) return;
    const nT = list.length, tr = new THREE.InstancedMesh(trunkGeo, mat.barkMat, nT), lf = new THREE.InstancedMesh(leafGeo, mat.leafMat(0.03), nT);
    list.forEach((t, i) => { const p = P(t.d, t.off); dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix); lf.setMatrixAt(i, dummy.matrix); lf.setColorAt(i, tmpC.setRGB(Rp(0.8, 1.1), Rp(0.9, 1.1), Rp(0.8, 1.05))); col(p.x, p.z, 0.34 * t.s); });
    tr.castShadow = lf.castShadow = true; tr.receiveShadow = lf.receiveShadow = true; plain.add(tr, lf);
  }
  addTrees(oaks, geo.trunkOak, geo.oakLeaf);
  yield;
  addTrees(pines, geo.trunkPine, geo.pineLeaf);
  yield;

  // ---------- Rumput (bergoyang tertiup angin; sebaran berpetak-acak supaya merata sepanjang padang) ----------
  const free = (d, off, pad = 0) => {   // titik bebas dari jalan, apron, papan, lampu & pohon?
    if (d < APOTHEM + 38 && Math.abs(off) < ROAD_W / 2 + 0.8 + pad) return false;
    if (Math.abs(off) < ROAD_HW + 0.7 + pad) return false;
    for (const s of solids) if (Math.hypot(s.d - d, s.off - off) < s.r + pad) return false;
    return true;
  };
  {
    const cell = COARSE ? 4.4 : 3.2, gm = mat.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.14, 0, true);
    const cap = Math.ceil((NW_PLAIN.len / cell) * (2 * HW / cell) * 2.2), grass = new THREE.InstancedMesh(geo.grassGeo, gm, cap);
    let n = 0;
    for (let d = APOTHEM + 6; d < END - 1; d += cell) for (let off = -HW; off < HW; off += cell) {
      const reps = pr() < 0.45 ? 2 : 1;
      for (let k = 0; k < reps && n < cap; k++) {
        const dd = d + Rp(0, cell), oo = off + Rp(0, cell); if (oo > HW || dd > END || !free(dd, oo) || (forestDens(dd, oo) > 0.5 && pr() < 0.65)) continue;   // lantai hutan: rumput lebih jarang
        const p = P(dd, oo), tall = pr() < 0.3;   // sebagian rumpun lebih tinggi
        dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, pr() * 6.283, 0); dummy.scale.set(Rp(1.0, 2.0), tall ? Rp(1.5, 2.3) : Rp(0.9, 1.5), Rp(1.0, 2.0)); dummy.updateMatrix();
        grass.setMatrixAt(n, dummy.matrix); grass.setColorAt(n, tmpC.setRGB(Rp(0.75, 1.1), Rp(0.88, 1.15), Rp(0.65, 1.0))); n++;
      }
    }
    grass.count = n; grass.receiveShadow = true; grass.frustumCulled = false; plain.add(grass);
  }
  yield;

  // ---------- Bunga liar (berumpun: tiap rumpun satu-dua warna) ----------
  {
    const cols = [0xffffff, 0xffd93b, 0xff7aa8, 0xb48cff, 0xff6b4a, 0x6fb8ff], clusters = COARSE ? 22 : 44, cap = clusters * 26;
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.018, 0.4, 4).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ color: 0x3f8a2a, roughness: 1 }), cap);
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0).translate(0, 0.42, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), cap);
    let n = 0;
    for (let c = 0; c < clusters; c++) {
      const cd = Rp(APOTHEM + 14, FOREST_END - 6), co = Rp(-FOREST_EDGE + 4, FOREST_EDGE - 4), c1 = cols[(pr() * cols.length) | 0], c2 = pr() < 0.5 ? c1 : cols[(pr() * cols.length) | 0], m = 10 + (pr() * 14 | 0);
      for (let i = 0; i < m && n < cap; i++) {
        const a = pr() * 6.283, r = Rp(0.3, 4.2) * Math.sqrt(pr()), dd = cd + Math.cos(a) * r, oo = co + Math.sin(a) * r;
        if (Math.abs(oo) > HW || dd > END - 1 || !free(dd, oo, 0.3)) continue;
        const p = P(dd, oo); dummy.position.set(p.x, 0, p.z); dummy.rotation.set(Rp(-0.15, 0.15), 0, Rp(-0.15, 0.15)); dummy.scale.setScalar(Rp(0.8, 1.5)); dummy.updateMatrix();
        stems.setMatrixAt(n, dummy.matrix); heads.setMatrixAt(n, dummy.matrix); heads.setColorAt(n, tmpC.setHex(pr() < 0.7 ? c1 : c2)); n++;
      }
    }
    stems.count = heads.count = n; stems.receiveShadow = true; stems.frustumCulled = heads.frustumCulled = false; plain.add(stems, heads);
  }
  yield;

  // ---------- Warga dusun (model dimuat malas lewat desa-npcs.js) ----------
  live.length = 0;
  const npcs = WARGA_BL.map(def => {
    const v = VILLAGES_BL[def.v], p = P(v.d + def.dd, def.off), w = toWorld(p.x, p.z), g = new THREE.Group();
    g.position.set(p.x, 0, p.z); g.rotation.y = def.face || 0; g.visible = false; plain.add(g); col(p.x, p.z, 0.45);
    const n = { def, g, wx: w.x, wz: w.z, ready: false, mixer: null }; live.push(n); return n;
  });
  loadVillagers(WARGA_BL, (def, r) => { const n = npcs.find(q => q.def === def); n.g.add(r.holder); n.mixer = r.mixer; r.idle.play(); n.ready = true; n.g.visible = true; });
  function update(dt, pp) {
    for (const n of npcs) {
      if (!n.ready) continue;
      const dx = pp.x - n.wx, dz = pp.z - n.wz, d = Math.hypot(dx, dz);
      n.g.visible = d < 90; if (!n.g.visible) continue;
      if (d < 70) n.mixer.update(dt);
      if (d < 7) { let df = Math.atan2(dx, dz) - EMPIRE_YAW - n.g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); n.g.rotation.y += df * Math.min(1, dt * 5); }   // menoleh ke pemain
    }
  }
  return { group, update };
}
