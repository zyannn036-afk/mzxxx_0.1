import * as THREE from 'three';

// ============================================================
//  PENGINAPAN KARAVAN — ruang dalam (Distrik 2, Merchant Quarter)
//  Ruangannya KECIL: hanya satu ruang umum di dalam badan bangunan (16 x 10 m), tidak ada lantai 2.
//  Isi: ruang umum kecil (perapian, meja, meja resepsionis dengan BUKU TAMU = tempat save game nanti)
//  + 3 PINTU KAMAR di dinding kiri. Pintunya tertutup: melangkah ke pintu = layar memudar & pemain PINDAH ke kamar
//  yang luas (kamar dibangun terpisah, tinggi di atas bangunan, jadi ukurannya tidak dibatasi bangunan 16 x 10 m).
//
//  Cara kerjanya (sama seperti gereja & aula):
//   - ruangan dibangun SEKALI di dalam grup bangunan `g` dan disembunyikan (room.visible = false)
//   - saat pemain masuk: show(true) -> ruangan muncul, kotak tembok luar disembunyikan
//   - pemain dipindah (layar memudar) ke dalam; tabrakan & kamera diurus di file ini (collide, clipCam)
//   - masuk / keluar dipicu di game.js (fungsi innGo)
//
//  Koordinat di file ini = koordinat BANGUNAN (lokal):
//    x = sepanjang fasad (kiri-kanan), z = ke depan (pintu ada di z = +D/2), y = tinggi.
//  Fungsi toW() / toL() mengubahnya ke / dari koordinat DUNIA (yang dipakai pemain).
// ============================================================

export const INN_NAME = 'Penginapan Karavan';

export function buildPenginapan({ b, g, wall, toWorld, toLocal, M, std, ctex, box, cyl, plaque, mbanner }) {
  const W = b.w, D = b.d;
  const FY = 0.72;                       // tinggi lantai dalam (permukaan alas batu = 0.7)
  const CY = FY + 3.7;                   // tinggi langit-langit
  const CH = CY - FY;                    // tinggi ruangan (lantai -> langit-langit)
  const IX = W / 2 - 0.5, IZ = D / 2 - 0.5;   // setengah ukuran ruang dalam (sampai sisi dalam dinding)
  const cl = (v, a, c) => Math.max(a, Math.min(c, v));

  // ---------- Pengubah koordinat: bangunan <-> dunia ----------
  const sf = Math.sin(b.face), cf = Math.cos(b.face);
  const toW = (lx, lz) => toWorld(b.x + sf * lx + cf * lz, b.z - cf * lx + sf * lz);   // bangunan -> dunia
  const toL = (wx, wz) => { const c = toLocal(wx, wz), dx = c.x - b.x, dz = c.z - b.z; return { x: sf * dx - cf * dz, z: cf * dx + sf * dz }; };   // dunia -> bangunan
  const heading = (x0, z0, x1, z1) => { const a = toW(x0, z0), c = toW(x1, z1); return Math.atan2(c.x - a.x, c.z - a.z); };   // arah hadap pemain (dunia)

  // ---------- Grup ruangan (tersembunyi dulu) ----------
  const room = new THREE.Group(); room.name = 'penginapan-dalam'; room.visible = false; g.add(room);
  const m = (geo, mat, x = 0, y = 0, z = 0, parent = room) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); parent.add(k); return k; };   // tanpa bayangan (ringan)
  const flames = [];                     // api yang berkedip
  const boxes = [], discs = [];          // bentuk tabrakan: kotak {x0,x1,z0,z1} & lingkaran {x,z,r}

  // ---------- Bahan ----------
  const plankDraw = (x, s) => {
    x.fillStyle = '#7a5530'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) { const v = 110 + Math.random() * 45 | 0; x.fillStyle = `rgb(${v},${v * 0.72 | 0},${v * 0.44 | 0})`; x.fillRect(0, i * 16 + 1, s, 14); }
  };
  const plank = ctex(128, plankDraw);
  plank.repeat.set(W / 3, D / 3);
  const floorMat = new THREE.MeshStandardMaterial({ map: plank, roughness: 1 });
  const rugTex = ctex(128, (x, s) => {
    x.fillStyle = '#8c2a22'; x.fillRect(0, 0, s, s); x.strokeStyle = '#e0b24a'; x.lineWidth = 6; x.strokeRect(8, 8, s - 16, s - 16);
    x.strokeStyle = '#2f5a8a'; x.lineWidth = 4; x.strokeRect(20, 20, s - 40, s - 40);
    x.fillStyle = '#e0b24a'; x.beginPath(); x.moveTo(s / 2, 36); x.lineTo(s - 36, s / 2); x.lineTo(s / 2, s - 36); x.lineTo(36, s / 2); x.closePath(); x.fill();
  });
  const rugMat = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // ---------- Lantai, dinding, langit-langit ----------
  m(box(2 * IX, 0.04, 2 * IZ), floorMat, 0, FY - 0.02, 0);
  { // 4 dinding dalam (tebal 0.5, sisi luarnya pas dengan tembok luar yang disembunyikan)
    const sh = CY + 0.25 - 0.7, sy = 0.7 + sh / 2;
    m(box(W, sh, 0.5), M.plaster, 0, sy, D / 2 - 0.25); m(box(W, sh, 0.5), M.plaster, 0, sy, -D / 2 + 0.25);
    m(box(0.5, sh, D), M.plaster, -W / 2 + 0.25, sy, 0); m(box(0.5, sh, D), M.plaster, W / 2 - 0.25, sy, 0);
    for (const e of [-1, 1]) {           // papan kayu di bagian bawah dinding + pita atasnya
      m(box(2 * IX, 1.1, 0.1), M.wood, 0, FY + 0.55, e * (IZ - 0.05)); m(box(2 * IX, 0.08, 0.14), M.timber, 0, FY + 1.12, e * (IZ - 0.07));
      m(box(0.1, 1.1, 2 * IZ), M.wood, e * (IX - 0.05), FY + 0.55, 0); m(box(0.14, 0.08, 2 * IZ), M.timber, e * (IX - 0.07), FY + 1.12, 0);
    }
  }
  m(box(W - 0.2, 0.25, D - 0.2), M.woodDark, 0, CY + 0.125, 0);      // langit-langit
  for (let i = 0; i <= 6; i++) m(box(0.28, 0.3, 2 * IZ), M.timber, -IX + i * (2 * IX / 6), CY - 0.15, 0);   // balok melintang
  m(box(2 * IX, 0.26, 0.3), M.timber, 0, CY - 0.13, 0);              // balok utama

  // ---------- Pintu (sisi dalam) ----------
  m(box(2.0, 2.8, 0.1), M.woodDark, 0, FY + 1.4, IZ - 0.14);
  for (const s of [-1, 1]) m(box(0.2, 3.0, 0.14), M.timber, s * 1.1, FY + 1.5, IZ - 0.1);
  m(box(2.4, 0.2, 0.14), M.timber, 0, FY + 2.9, IZ - 0.1);
  for (const y of [0.9, 2.0]) m(box(2.0, 0.1, 0.04), M.iron, 0, FY + y, IZ - 0.2);
  m(new THREE.TorusGeometry(0.1, 0.02, 6, 12), M.iron, 0.6, FY + 1.3, IZ - 0.21);
  plaque(room, 'KELUAR', null, 0, FY + 3.3, IZ - 0.03, 1.6, 0.4, Math.PI);
  m(new THREE.PlaneGeometry(1.8, 1.0).rotateX(-Math.PI / 2), std(0x5a3a22), 0, FY + 0.012, IZ - 0.8);   // keset pintu

  // ---------- Jendela & panji ----------
  const win = (x, y, z, ry, parent = room) => {         // ry = arah hadap ke dalam ruangan
    const gr = new THREE.Group(); gr.position.set(x, y, z); gr.rotation.y = ry; parent.add(gr);
    m(new THREE.PlaneGeometry(1.1, 1.3), M.window, 0, 0, 0.015, gr);
    m(box(1.4, 0.12, 0.18), M.timber, 0, -0.7, 0.03, gr); m(box(1.4, 0.12, 0.12), M.timber, 0, 0.7, 0.03, gr);
    for (const s of [-1, 1]) m(box(0.1, 1.4, 0.12), M.timber, s * 0.65, 0, 0.03, gr);
    m(box(0.06, 1.3, 0.08), M.timber, 0, 0, 0.04, gr); m(box(1.1, 0.06, 0.08), M.timber, 0, 0, 0.04, gr);
  };
  const wy = FY + 2.0;
  win(-IX + 2.9, wy, IZ, Math.PI); win(-IX, wy, 0, Math.PI / 2); win(IX, wy, 0.2, -Math.PI / 2);
  win(-IX + 2.3, wy, -IZ, 0); win(IX - 2.9, wy, -IZ, 0);
  mbanner(room, -2.4, FY + 2.2, IZ - 0.05, 0.9, 2.0, Math.PI);

  // ---------- Perapian (dinding belakang, tengah) ----------
  m(box(3.6, 0.12, 1.5), M.plinth, 0, FY + 0.06, -IZ + 0.75);
  for (const s of [-1, 1]) m(box(0.7, 2.4, 1.0), M.plinth, s * 1.35, FY + 1.2, -IZ + 0.5);
  m(box(3.4, 0.6, 1.0), M.plinth, 0, FY + 2.7, -IZ + 0.5); m(box(2.4, 0.7, 0.8), M.plinth, 0, FY + 3.35, -IZ + 0.4);
  m(box(2.0, 2.3, 0.1), M.iron, 0, FY + 1.2, -IZ + 0.06);
  for (const z of [0.4, 0.65]) m(cyl(0.12, 0.12, 1.3, 6), M.woodDark, 0, FY + 0.22, -IZ + z).rotation.z = Math.PI / 2;   // kayu bakar
  for (const [x, s] of [[-0.35, 0.8], [0, 1.1], [0.35, 0.7]]) { const f = m(new THREE.ConeGeometry(0.28, 0.8, 6), M.glow, x, FY + 0.6, -IZ + 0.5); f.scale.setScalar(s); flames.push(f); }
  boxes.push({ x0: -1.8, x1: 1.8, z0: -IZ, z1: -IZ + 1.1 });
  m(new THREE.PlaneGeometry(4.2, 2.4).rotateX(-Math.PI / 2), rugMat, 0, FY + 0.015, -IZ + 2.9);   // karpet

  // ---------- Kursi dekat api ----------
  const chair = (x, z, ry) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; room.add(c);
    m(box(0.9, 0.5, 0.9), M.wood, 0, FY + 0.25, 0, c); m(box(0.76, 0.14, 0.76), std(0x8c2a22), 0, FY + 0.57, 0.02, c);
    m(box(0.9, 0.9, 0.15), M.woodDark, 0, FY + 0.95, -0.4, c);
    for (const s of [-1, 1]) m(box(0.12, 0.35, 0.8), M.woodDark, s * 0.46, FY + 0.65, 0, c);
    boxes.push({ x0: x - 0.55, x1: x + 0.55, z0: z - 0.55, z1: z + 0.55 });
  };
  chair(-1.9, -IZ + 3.3, Math.PI); chair(1.9, -IZ + 3.3, Math.PI);   // agak ke depan supaya jalan ke pintu Kamar 1 (kiri belakang) tetap lega

  // ---------- Sekat kiri + 3 PINTU KAMAR (tertutup) ----------
  // Ruang umum dibatasi sekat di x = PX. Di sekat ada 3 pintu kayu tertutup; kalau pemain melangkah ke pintu, game.js memanggil
  // enterRoom(i) (layar memudar, pemain pindah ke kamar i yang luas, lihat makeRoom di bawah).
  const PX = -IX + 4.6, RD = 2 * IZ / 3;
  const roomZ = [0, 1, 2].map(i => -IZ + RD * (i + 0.5));   // posisi z tiap pintu kamar
  m(box(0.2, CH, 2 * IZ), M.plaster, PX, FY + CH / 2, 0); boxes.push({ x0: PX - 0.1, x1: PX + 0.1, z0: -IZ, z1: IZ });
  m(box(0.1, 1.1, 2 * IZ), M.wood, PX + 0.15, FY + 0.55, 0); m(box(0.14, 0.08, 2 * IZ), M.timber, PX + 0.17, FY + 1.12, 0);
  roomZ.forEach((dz, i) => {
    m(box(0.1, 2.5, 1.2), M.woodDark, PX + 0.23, FY + 1.25, dz);                                  // daun pintu (tertutup)
    for (const e of [-1, 1]) m(box(0.2, 2.65, 0.14), M.timber, PX + 0.2, FY + 1.32, dz + e * 0.67);  // tiang pintu
    m(box(0.2, 0.16, 1.5), M.timber, PX + 0.2, FY + 2.57, dz);                                    // ambang atas
    for (const y of [0.8, 1.8]) m(box(0.04, 0.1, 1.2), M.iron, PX + 0.29, FY + y, dz);             // palang besi
    m(new THREE.TorusGeometry(0.09, 0.02, 6, 12), M.iron, PX + 0.3, FY + 1.2, dz + 0.4).rotation.y = Math.PI / 2;   // gagang
    plaque(room, 'KAMAR ' + (i + 1), null, PX + 0.14, FY + 3.2, dz, 1.2, 0.3, Math.PI / 2);        // nomor kamar (menghadap ruang umum)
  });

  // ---------- Meja bundar + bangku ----------
  const table = (x, z, r, n, a0) => {
    m(cyl(r, r, 0.1, 14), M.wood, x, FY + 0.95, z); m(cyl(0.14, 0.22, 0.92, 8), M.woodDark, x, FY + 0.46, z);
    for (let i = 0; i < n; i++) {
      const a = a0 + i * 2 * Math.PI / n, sx = x + Math.cos(a) * (r + 0.45), sz = z + Math.sin(a) * (r + 0.45);
      m(cyl(0.3, 0.28, 0.1, 8), M.wood, sx, FY + 0.5, sz); m(cyl(0.07, 0.09, 0.5, 6), M.woodDark, sx, FY + 0.25, sz);
      m(cyl(0.09, 0.08, 0.16, 8), std(0xb5683a), x + Math.cos(a) * r * 0.55, FY + 1.08, z + Math.sin(a) * r * 0.55);   // gelas
    }
    m(cyl(0.05, 0.05, 0.2, 6), std(0xf3ead0), x, FY + 1.1, z); m(new THREE.ConeGeometry(0.05, 0.12, 5), M.glow, x, FY + 1.26, z);   // lilin
    discs.push({ x, z, r: r + 0.75 });
  };
  table(IX - 3.0, -IZ + 2.1, 1.0, 3, 0);

  // ---------- Tong & peti di sudut belakang kanan ----------
  for (const [x, z] of [[IX - 0.6, -IZ + 0.5], [IX - 1.4, -IZ + 0.45]]) {
    m(cyl(0.4, 0.36, 0.85, 10), M.wood, x, FY + 0.425, z); for (const y of [0.2, 0.65]) m(cyl(0.41, 0.41, 0.06, 10), M.iron, x, FY + y, z);
    discs.push({ x, z, r: 0.5 });
  }
  m(box(0.9, 0.8, 0.9), M.wood, IX - 0.55, FY + 0.4, -IZ + 1.6); m(box(0.82, 0.05, 0.82), M.woodDark, IX - 0.55, FY + 0.82, -IZ + 1.6); discs.push({ x: IX - 0.55, z: -IZ + 1.6, r: 0.65 });

  // ---------- Meja resepsionis (kanan depan) + BUKU TAMU = tempat save ----------
  const cx0 = IX - 4.9, cz0 = IZ - 2.4, cz1 = IZ - 1.4, CT = FY + 1.1;   // CT = permukaan meja
  m(box(4.9, 1.0, 1.0), M.wood, (cx0 + IX) / 2, FY + 0.5, (cz0 + cz1) / 2); m(box(5.1, 0.1, 1.2), M.woodDark, (cx0 + IX) / 2, FY + 1.05, (cz0 + cz1) / 2);
  for (let i = 0; i < 5; i++) m(box(0.12, 1.0, 0.06), M.timber, cx0 + 0.3 + i * 1.1, FY + 0.5, cz0 - 0.02);
  boxes.push({ x0: cx0, x1: IX, z0: cz0 - 0.05, z1: cz1 + 0.15 });
  m(box(0.2, 0.3, 0.2), M.lantern, IX - 0.9, CT + 0.15, IZ - 1.9);
  m(box(2.4, 1.3, 0.08), M.woodDark, IX - 2.3, FY + 2.0, IZ - 0.04);   // papan kunci kamar
  for (let i = 0; i < 8; i++) m(new THREE.SphereGeometry(0.05, 6, 4), M.gold, IX - 3.2 + (i % 4) * 0.6 + 0.2, FY + 1.7 + Math.floor(i / 4) * 0.5, IZ - 0.1);
  plaque(room, 'RESEPSIONIS', 'Buku Tamu', IX - 2.3, FY + 3.0, IZ - 0.03, 2.8, 0.7, Math.PI);
  const bx = IX - 3.9, bz = IZ - 1.9;    // posisi buku tamu di atas meja
  m(cyl(0.06, 0.08, 0.18, 6), M.woodDark, bx, CT + 0.09, bz);
  for (const [y, mat, sx, sz] of [[0.2, M.woodDark, 0.62, 0.46], [0.23, std(0x1f5a3a), 0.56, 0.4], [0.26, std(0xf3ead0), 0.5, 0.34]]) m(box(sx, 0.03, sz), mat, bx, CT + y, bz).rotation.x = -0.3;
  const orb = m(new THREE.SphereGeometry(0.09, 10, 8), M.lantern, bx, CT + 0.8, bz), orbY = orb.position.y;   // bola cahaya kecil = penanda tempat simpan
  const SAVE = { x: bx, z: IZ - 2.95, r: 1.5 };                          // titik berdiri di depan buku tamu
  const ring = m(new THREE.RingGeometry(0.45, 0.62, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), SAVE.x, FY + 0.02, SAVE.z);

  // ---------- Lampu gantung ----------
  for (const [x, z] of [[-2.6, 0.4], [3.2, -0.4], [0, 2.4]]) {
    m(cyl(0.015, 0.015, 0.8, 4), M.iron, x, CY - 0.4, z); m(box(0.38, 0.06, 0.38), M.timber, x, CY - 0.72, z); m(box(0.3, 0.42, 0.3), M.lantern, x, CY - 0.95, z);
  }

  // ============================================================
  //  KAMAR TAMU (3 buah, LUAS): dibangun terpisah, 80 m di atas bangunan, hanya tampil saat pemain di dalamnya.
  //  Koordinat kamar: pusat kamar = (0, 0), pintu di dinding depan (z = +hz). Lantai kamar ada di y = RY.
  // ============================================================
  const RY = 80;
  const BED_LIE_Y = 0.81;   // tinggi akar badan pemain saat berbaring (di atas lantai kamar); naikkan bila badan / kepala tembus kasur-bantal, turunkan bila melayang
  function makeRoom(def) {
    const { name, w, d, wallColor, blanket, kind } = def;
    const hx = w / 2, hz = d / 2, H = 3.8;
    const rg = new THREE.Group(); rg.position.set(0, RY, 0); rg.visible = false; g.add(rg);
    const mm = (geo, mat, x = 0, y = 0, z = 0, p = rg) => m(geo, mat, x, y, z, p);   // y relatif terhadap lantai kamar
    const bxs = [], dcs = [], fl = [], beds = [];   // beds: kasur yang bisa ditiduri (diisi oleh bedZ)
    const wm = std(wallColor);

    // lantai, dinding, langit-langit
    const pt = ctex(128, plankDraw); pt.repeat.set(w / 3, d / 3);
    mm(box(w, 0.04, d), new THREE.MeshStandardMaterial({ map: pt, roughness: 1 }), 0, -0.02, 0);
    for (const e of [-1, 1]) {
      mm(box(w + 0.6, H + 0.3, 0.3), wm, 0, H / 2, e * (hz + 0.15)); mm(box(0.3, H + 0.3, d), wm, e * (hx + 0.15), H / 2, 0);
      mm(box(w, 1.1, 0.1), M.wood, 0, 0.55, e * (hz - 0.05)); mm(box(w, 0.08, 0.14), M.timber, 0, 1.12, e * (hz - 0.07));
      mm(box(0.1, 1.1, d), M.wood, e * (hx - 0.05), 0.55, 0); mm(box(0.14, 0.08, d), M.timber, e * (hx - 0.07), 1.12, 0);
    }
    mm(box(w + 0.6, 0.25, d + 0.6), M.woodDark, 0, H + 0.125, 0);
    const nb = Math.round(w / 1.8); for (let i = 0; i <= nb; i++) mm(box(0.28, 0.3, d), M.timber, -hx + i * w / nb, H - 0.15, 0);
    mm(box(w, 0.26, 0.3), M.timber, 0, H - 0.13, 0);

    // pintu keluar (dinding depan, tengah)
    mm(box(2.0, 2.8, 0.1), M.woodDark, 0, 1.4, hz - 0.14);
    for (const e of [-1, 1]) mm(box(0.2, 3.0, 0.14), M.timber, e * 1.1, 1.5, hz - 0.1);
    mm(box(2.4, 0.2, 0.14), M.timber, 0, 2.9, hz - 0.1);
    for (const y of [0.9, 2.0]) mm(box(2.0, 0.1, 0.04), M.iron, 0, y, hz - 0.2);
    mm(new THREE.TorusGeometry(0.1, 0.02, 6, 12), M.iron, 0.6, 1.3, hz - 0.21);
    plaque(rg, 'KELUAR', null, 0, 3.3, hz - 0.03, 1.6, 0.4, Math.PI);
    mm(new THREE.PlaneGeometry(1.8, 1.0).rotateX(-Math.PI / 2), std(0x5a3a22), 0, 0.012, hz - 0.8);

    // ---- perabot (tiap fungsi juga mendaftarkan bentuk tabrakannya ke bxs / dcs) ----
    const rug = (cx, cz, rw, rd) => mm(new THREE.PlaneGeometry(rw, rd).rotateX(-Math.PI / 2), rugMat, cx, 0.015, cz);
    const hang = (x, z) => { mm(cyl(0.015, 0.015, 0.8, 4), M.iron, x, H - 0.4, z); mm(box(0.38, 0.06, 0.38), M.timber, x, H - 0.72, z); mm(box(0.3, 0.42, 0.3), M.lantern, x, H - 0.95, z); };
    const candle = (x, y, z) => { mm(cyl(0.05, 0.05, 0.2, 6), std(0xf3ead0), x, y + 0.1, z); mm(new THREE.ConeGeometry(0.05, 0.12, 5), M.glow, x, y + 0.26, z); };
    const bedZ = (x, bw, color) => {     // kepala tempat tidur di dinding belakang
      const z = -hz + 1.4;
      mm(box(bw, 0.45, 2.8), M.wood, x, 0.225, z); mm(box(bw - 0.2, 0.25, 2.5), std(0xe9e2c8), x, 0.575, z);
      mm(box(bw - 0.18, 0.28, 1.5), std(color), x, 0.64, z + 0.45);
      for (const e of (bw > 2.2 ? [-1, 1] : [0])) mm(box(bw > 2.2 ? 0.8 : 1.5, 0.08, 0.5), std(0xf3ead0), x + e * (bw / 4), 0.74, z - 0.95);   // bantal tipis (puncak y = 0.78): kepala pemain & Isabel (berdampingan, +-0.4 m dari tengah) bertumpu di atasnya, tidak tembus; kasur 1 baris bantal selebar 1.5 m
      mm(box(bw, 1.0, 0.14), M.woodDark, x, 0.7, -hz + 0.07); mm(box(bw, 0.4, 0.12), M.woodDark, x, 0.4, z + 1.4);
      bxs.push({ x0: x - bw / 2, x1: x + bw / 2, z0: -hz, z1: -hz + 2.8 });
      const cover = mm(box(bw - 0.4, 0.12, 1.25), std(color), x, 1.08, -hz + 1.62); cover.visible = false;   // selimut yang menutupi badan pemain saat tidur
      beds.push({ x, bw, cover });
    };
    const stand = (x, z) => { mm(box(0.5, 0.6, 0.5), M.wood, x, 0.3, z); candle(x, 0.6, z); bxs.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }); };
    const chest = (x, z) => { mm(box(1.3, 0.55, 0.6), M.wood, x, 0.275, z); mm(box(1.34, 0.08, 0.64), M.iron, x, 0.58, z); bxs.push({ x0: x - 0.7, x1: x + 0.7, z0: z - 0.35, z1: z + 0.35 }); };
    const table = (x, z, r, n, a0) => {
      mm(cyl(r, r, 0.1, 14), M.wood, x, 0.95, z); mm(cyl(0.14, 0.22, 0.92, 8), M.woodDark, x, 0.46, z);
      for (let i = 0; i < n; i++) {
        const a = a0 + i * 2 * Math.PI / n, sx = x + Math.cos(a) * (r + 0.45), sz = z + Math.sin(a) * (r + 0.45);
        mm(cyl(0.3, 0.28, 0.1, 8), M.wood, sx, 0.5, sz); mm(cyl(0.07, 0.09, 0.5, 6), M.woodDark, sx, 0.25, sz);
        mm(cyl(0.09, 0.08, 0.16, 8), std(0xb5683a), x + Math.cos(a) * r * 0.55, 1.08, z + Math.sin(a) * r * 0.55);
      }
      candle(x, 1.0, z); dcs.push({ x, z, r: r + 0.75 });
    };
    const armchair = (x, z, ry) => {
      const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; rg.add(c);
      mm(box(0.9, 0.5, 0.9), M.wood, 0, 0.25, 0, c); mm(box(0.76, 0.14, 0.76), std(0x8c2a22), 0, 0.57, 0.02, c); mm(box(0.9, 0.9, 0.15), M.woodDark, 0, 0.95, -0.4, c);
      for (const e of [-1, 1]) mm(box(0.12, 0.35, 0.8), M.woodDark, e * 0.46, 0.65, 0, c);
      bxs.push({ x0: x - 0.55, x1: x + 0.55, z0: z - 0.55, z1: z + 0.55 });
    };
    const wardrobe = (x, z) => {         // lemari di dinding kanan, pintunya menghadap ke kiri (-x)
      mm(box(0.7, 2.4, 1.6), M.wood, x, 1.2, z); mm(box(0.8, 0.12, 1.7), M.woodDark, x, 2.46, z); mm(box(0.03, 2.2, 0.05), M.woodDark, x - 0.36, 1.2, z);
      for (const e of [-1, 1]) mm(new THREE.SphereGeometry(0.04, 6, 4), M.gold, x - 0.38, 1.2, z + e * 0.12);
      bxs.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.85, z1: z + 0.85 });
    };
    const hearth = x => {                // perapian kecil di dinding belakang
      mm(box(2.8, 0.12, 1.2), M.plinth, x, 0.06, -hz + 0.6);
      for (const e of [-1, 1]) mm(box(0.5, 2.2, 0.8), M.plinth, x + e * 0.95, 1.1, -hz + 0.4);
      mm(box(2.4, 0.5, 0.8), M.plinth, x, 2.45, -hz + 0.4); mm(box(1.8, 1.1, 0.6), M.plinth, x, 3.25, -hz + 0.3); mm(box(1.4, 2.0, 0.1), M.iron, x, 1.1, -hz + 0.06);
      for (const z of [0.35, 0.6]) mm(cyl(0.11, 0.11, 1.0, 6), M.woodDark, x, 0.2, -hz + z).rotation.z = Math.PI / 2;
      for (const [dx, sc] of [[-0.3, 0.7], [0, 1.0], [0.3, 0.65]]) { const f = mm(new THREE.ConeGeometry(0.25, 0.7, 6), M.glow, x + dx, 0.55, -hz + 0.45); f.scale.setScalar(sc); fl.push(f); }
      bxs.push({ x0: x - 1.4, x1: x + 1.4, z0: -hz, z1: -hz + 1.2 });
    };
    const shelf = x => {                 // rak buku di dinding belakang
      mm(box(2.4, 2.2, 0.4), M.woodDark, x, 1.1, -hz + 0.2);
      for (const y of [0.5, 1.0, 1.5, 2.0]) {
        mm(box(2.3, 0.05, 0.38), M.wood, x, y, -hz + 0.2);
        for (let k = 0; k < 8; k++) mm(box(0.18, 0.34, 0.26), std([0x8c2a22, 0x2f5a8a, 0x3a7a4a, 0xb08a2e][(k + y * 4 | 0) % 4]), x - 1.0 + k * 0.29, y + 0.2, -hz + 0.22);
      }
      bxs.push({ x0: x - 1.2, x1: x + 1.2, z0: -hz, z1: -hz + 0.45 });
    };
    const desk = (x, z) => {             // meja tulis di dinding kanan + kursi
      mm(box(0.8, 0.08, 1.6), M.wood, x, 0.95, z); for (const a of [-1, 1]) for (const b2 of [-1, 1]) mm(box(0.08, 0.92, 0.08), M.woodDark, x + a * 0.34, 0.46, z + b2 * 0.74);
      mm(box(0.4, 0.05, 0.3), std(0x1f5a3a), x, 1.01, z - 0.4); mm(box(0.2, 0.3, 0.2), M.lantern, x + 0.15, 1.15, z + 0.4);
      bxs.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.85, z1: z + 0.85 }); armchair(x - 1.2, z, Math.PI / 2);
    };

    // ---- isi tiap kamar ----
    const wy2 = 1.9;
    if (kind === 'basic') {              // Kamar 1: sederhana — satu tempat tidur, meja kecil
      bedZ(-hx + 1.2, 1.8, blanket); stand(-hx + 2.5, -hz + 0.35); chest(-hx + 1.2, -hz + 3.2); table(2.3, -1.0, 0.7, 2, 0.6);
      rug(0.4, 0.2, 3.2, 2.2); hang(0, -0.3);
      win(2.0, wy2, -hz, 0, rg); win(hx, wy2, -0.6, -Math.PI / 2, rg); win(-hx, wy2, 0.5, Math.PI / 2, rg);
    } else if (kind === 'family') {      // Kamar 2: keluarga — dua tempat tidur, perapian, lemari, meja
      bedZ(-hx + 1.2, 1.8, blanket); bedZ(-hx + 3.5, 1.8, blanket); chest(-hx + 1.2, -hz + 3.3); chest(-hx + 3.5, -hz + 3.3); hearth(2.4); wardrobe(hx - 0.4, -hz + 2.9); table(2.3, 0.9, 0.9, 3, 0.4);
      rug(0.5, 0.7, 3.4, 2.4); hang(-1.5, 0.5); hang(2.0, 0);
      win(-hx + 2.4, wy2, -hz, 0, rg); win(hx, wy2, 0.8, -Math.PI / 2, rg); win(-hx, wy2, 0.5, Math.PI / 2, rg);
    } else {                             // Kamar 3: utama — tempat tidur besar berkelambu, rak buku, meja tulis, perapian, kursi
      bedZ(-hx + 2.0, 2.6, blanket); stand(-hx + 4.1, -hz + 0.35); stand(-hx + 0.3, -hz + 0.35); chest(-hx + 2.0, -hz + 3.3);
      for (const a of [-1, 1]) for (const z of [-hz + 0.15, -hz + 2.65]) mm(cyl(0.06, 0.06, 2.4, 6), M.timber, -hx + 2.0 + a * 1.3, 1.2, z);   // tiang kelambu
      mm(box(2.7, 0.06, 2.8), std(0x8a3a8f), -hx + 2.0, 2.42, -hz + 1.4);
      shelf(0.6); hearth(3.2); desk(hx - 0.6, 0.6); armchair(2.2, -1.5, Math.PI); armchair(4.0, -1.5, Math.PI); table(-2.2, 1.3, 0.8, 2, 0.8);
      rug(2.8, -0.8, 3.8, 2.6); hang(-1.0, -0.5); hang(3.0, 0.5);
      win(-hx + 2.0, wy2, -hz + 0.01, 0, rg); win(-hx, wy2, 0.3, Math.PI / 2, rg); win(hx, wy2, -1.8, -Math.PI / 2, rg);
      mbanner(rg, -2.6, 2.1, hz - 0.05, 0.9, 2.0, Math.PI); mbanner(rg, 2.6, 2.1, hz - 0.05, 0.9, 2.0, Math.PI);
    }
    // ---- titik tidur tiap kasur: badan berbaring terlentang, kepala di bantal; titik bangun = tempat kosong di samping / kaki kasur ----
    const free = (x, z, r = 0.5) => {
      if (Math.abs(x) > hx - r || Math.abs(z) > hz - r) return false;
      for (const s of bxs) { const dx = x - cl(x, s.x0, s.x1), dz = z - cl(z, s.z0, s.z1); if (dx * dx + dz * dz < r * r) return false; }
      for (const c of dcs) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
      return true;
    };
    const bedSpots = beds.map(bd => {
      const feet = toW(bd.x, -hz + 2.1);                                             // telapak kaki pemain (akar model); kepala jatuh di bantal (-hz + 0.45)
      const cands = [[bd.x + bd.bw / 2 + 0.75, -hz + 1.9], [bd.x - bd.bw / 2 - 0.75, -hz + 1.9], [bd.x + bd.bw / 2 + 0.75, -hz + 3.6], [bd.x - bd.bw / 2 - 0.75, -hz + 3.6], [bd.x, -hz + 4.3], [bd.x, -hz + 4.8]];
      const c = cands.find(p => free(p[0], p[1])) || [0, hz - 2.2], out = toW(c[0], c[1]);
      return { lx: bd.x, bw: bd.bw, x: feet.x, z: feet.z, y: RY + BED_LIE_Y, face: heading(bd.x, -hz + 0.45, bd.x, -hz + 2.1),
        out: { x: out.x, z: out.z, y: RY, face: heading(c[0], c[1], 0, 0) }, cover: () => {} };   // selimut yang menutupi badan saat tidur DIHILANGKAN (mesh tetap tersembunyi); ganti jadi `v => { bd.cover.visible = v; }` untuk mengaktifkannya lagi
    });
    const update = t => fl.forEach((f, i) => f.scale.set(1 + 0.08 * Math.sin(t * 9 + i), 1 + 0.2 * Math.sin(t * 7 + i * 2), 1 + 0.08 * Math.sin(t * 9 + i)));
    return { group: rg, name, hx, hz, H, boxes: bxs, discs: dcs, bedSpots, update, exit: { x: 0, z: hz - 0.5, r: 0.9 },
      spawn: { ...toW(0, hz - 1.6), face: heading(0, hz - 1.6, 0, -hz) } };
  }
  const rooms = [
    makeRoom({ name: 'Kamar 1 — Kamar Sederhana', w: 8, d: 6, wallColor: 0xe2d9c0, blanket: 0x2f6fb0, kind: 'basic' }),
    makeRoom({ name: 'Kamar 2 — Kamar Keluarga', w: 9, d: 7, wallColor: 0xd9c9a8, blanket: 0x3a8a4a, kind: 'family' }),
    makeRoom({ name: 'Kamar 3 — Kamar Utama', w: 10, d: 7.5, wallColor: 0xcfd3e0, blanket: 0x8c2a22, kind: 'suite' }),
  ];
  let cur = null;                        // kamar yang sedang dimasuki pemain (null = di ruang umum, 0..2 = kamar)

  // ============================================================
  //  Tabrakan, kamera, pemicu pintu (semuanya dalam koordinat bangunan lalu diubah ke dunia)
  // ============================================================
  const DOOR_OUT = { x: 0, z: D / 2 + 1.4, r: 1.0 };   // pemicu masuk bangunan (di depan pintu, luar)
  const DOOR_IN = { x: 0, z: IZ - 0.55, r: 1.0 };      // pemicu keluar bangunan (di depan pintu, dalam)
  const near = (wx, wz, p) => { const l = toL(wx, wz); return Math.hypot(l.x - p.x, l.z - p.z) < p.r; };
  const spawn = {
    in: { ...toW(0, 2.2), face: heading(0, 2.2, 0, -1) },                         // muncul di dalam, menghadap ke ruangan
    out: { ...toW(0, D / 2 + 3.4), face: heading(0, D / 2 + 3.4, 0, D / 2 + 8) },   // muncul di luar, di luar jangkauan pemicu masuk (supaya tidak masuk lagi)
  };
  const roomDoor = i => ({ x: PX + 0.65, z: roomZ[i], r: 0.65 });                 // pemicu pintu kamar i (di ruang umum)
  const backSpawn = roomZ.map(dz => ({ ...toW(PX + 1.9, dz), face: heading(PX + 1.9, dz, PX + 3, dz) }));   // muncul di ruang umum saat keluar kamar (menghadap ke ruangan)
  const area = () => cur === null ? { boxes, discs, hx: IX, hz: IZ } : rooms[cur];   // ruang yang sedang ditempati (untuk tabrakan & kamera)

  function collide(pos, r) {   // dorong pemain keluar dari dinding & perabot
    const A = area(), p = toL(pos.x, pos.z); let x = p.x, z = p.z;
    for (const s of A.boxes) {
      const qx = cl(x, s.x0, s.x1), qz = cl(z, s.z0, s.z1), dx = x - qx, dz = z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const k = r / Math.sqrt(d2); x = qx + dx * k; z = qz + dz * k; }
      else { const a = [x - s.x0, s.x1 - x, z - s.z0, s.z1 - z], mn = Math.min(...a); if (mn === a[0]) x = s.x0 - r; else if (mn === a[1]) x = s.x1 + r; else if (mn === a[2]) z = s.z0 - r; else z = s.z1 + r; }
    }
    for (const c of A.discs) {
      const dx = x - c.x, dz = z - c.z, l = Math.hypot(dx, dz), min = c.r + r;
      if (l >= min) continue;
      if (l > 1e-6) { x = c.x + dx / l * min; z = c.z + dz / l * min; } else x = c.x + min;
    }
    x = cl(x, -A.hx + r, A.hx - r); z = cl(z, -A.hz + r, A.hz - r);   // tidak keluar dari dinding
    const w = toW(x, z); pos.x = w.x; pos.z = w.z;
  }
  function clipCam(from, to) {   // kamera tetap di dalam ruangan (tidak menembus dinding / langit-langit)
    const A = area(), p = toL(to.x, to.z), x = cl(p.x, -A.hx + 0.4, A.hx - 0.4), z = cl(p.z, -A.hz + 0.4, A.hz - 0.4);
    if (x !== p.x || z !== p.z) { const w = toW(x, z); to.x = w.x; to.z = w.z; }
    const fy = cur === null ? FY : RY; to.y = cl(to.y, fy + 0.5, fy + (cur === null ? 3.7 : rooms[cur].H) - 0.3); return to;
  }
  const update = t => {          // api berkedip, bola cahaya naik-turun (hanya ruang yang tampil)
    if (cur !== null) { rooms[cur].update(t); return; }
    if (!room.visible) return;
    flames.forEach((f, i) => f.scale.set(1 + 0.08 * Math.sin(t * 9 + i), 1 + 0.2 * Math.sin(t * 7 + i * 2), 1 + 0.08 * Math.sin(t * 9 + i)));
    orb.position.y = orbY + Math.sin(t * 2) * 0.06; ring.material.opacity = 0.35 + 0.15 * Math.sin(t * 3);
  };

  return {
    name: INN_NAME, group: room, dim: 0.35, spawn, update, collide, clipCam,
    show(v) { cur = null; room.visible = v; for (const r of rooms) r.group.visible = false; if (wall) wall.visible = !v; },   // dalam: tampilkan ruang umum, sembunyikan kotak tembok luar
    groundY: () => cur === null ? FY : RY,
    inside: (wx, wz) => { const l = toL(wx, wz); return Math.abs(l.x) <= W / 2 && Math.abs(l.z) <= D / 2; },   // titik dunia di dalam telapak bangunan (dipakai world.inn.inside -> Isabel muncul di depan pintu bila tertinggal di dalam)
    nearDoor: (wx, wz) => near(wx, wz, DOOR_OUT), nearExit: (wx, wz) => cur === null && near(wx, wz, DOOR_IN), nearSave: (wx, wz) => cur === null && near(wx, wz, SAVE),
    inRoom: () => cur,                                                                   // null = di ruang umum, 0..2 = nomor kamar - 1
    doorAt: (wx, wz) => { if (cur !== null) return null; for (let i = 0; i < 3; i++) if (near(wx, wz, roomDoor(i))) return i; return null; },   // pemain di depan pintu kamar i (ruang umum)
    bedAt: (wx, wz) => {                                                                 // kasur terdekat bila pemain berdiri di dekatnya (di kamar), selain itu null -> { x, y, z, face, out, cover(v) }
      if (cur === null) return null;
      const A = rooms[cur], l = toL(wx, wz); let best = null, bd = 1e9;
      for (const s of A.bedSpots) {
        if (l.x < s.lx - s.bw / 2 - 1.0 || l.x > s.lx + s.bw / 2 + 1.0 || l.z > -A.hz + 3.8) continue;
        const d = Math.hypot(l.x - s.lx, l.z - (-A.hz + 1.4)); if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    roomExit: (wx, wz) => cur !== null && near(wx, wz, rooms[cur].exit),                 // pemain di depan pintu keluar kamar
    enterRoom(i) { cur = i; room.visible = false; for (const r of rooms) r.group.visible = false; rooms[i].group.visible = true; return { ...rooms[i].spawn, y: RY, name: rooms[i].name }; },
    leaveRoom() { const i = cur; if (i === null) return null; rooms[i].group.visible = false; cur = null; room.visible = true; return { ...backSpawn[i], y: FY, name: INN_NAME }; },
  };
}
