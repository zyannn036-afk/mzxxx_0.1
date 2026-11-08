import * as THREE from 'three';
import { RIVER_PTS, RIVER_FRAME as F, RUINS, RUINS_CIRCLES, riverEdge, meadowDist, ruinsDist } from './meadow-layout.js';
import { RUINS_DOOR, DOOR_FX } from './golem-layout.js';

// ============================================================
//  RERUNTUHAN KUNO — tempat RAHASIA di ujung hilir Sungai Bening (dibangun oleh meadow.js, di bagian padang yang memuat sungai)
//  Sungai keluar dari padang lewat celah sempit di sabuk pohon, masuk ke gerbang air batu (sebagian runtuh), lalu berakhir di kolam
//  di tengah lantai batu berlumut. Di tengah kolam berdiri tugu bercahaya; di sisi selatan ada altar dengan prasasti.
//  - Tidak ada papan / jalan menuju ke sini: pemain menemukannya dengan menyusuri sungai ke selatan (area jelajahnya: RUINS_CIRCLES).
//  - Sungai (air, tepi, tabrakan tepi air) dibuat oleh meadow.js bagian 11; di sini hanya kolam, gerbang, lantai, pilar, tembok, altar, pohon sekitar, cahaya.
//  - Memakai pengacak SENDIRI (bukan rand padang) supaya urutan acak isi padang yang lain tidak berubah.
//  Koordinat lokal grup reruntuhan = "bingkai sungai": x = a (searah jalan di jembatan), z = b (ke selatan). Titik dunia: lihat W().
//  - PINTU PENJAGA (bagian 11): pintu batu di dinding timur; daun pintunya terbuka saat pemain mendekat (DOOR_FX.open, golem-layout.js), melangkah ke lorongnya = masuk arena golem (game.js).
//  Generator: tiap `yield` = titik berhenti (ChunkManager melanjutkan di frame berikutnya).
// ============================================================
export function* buildRuinsGen(o) {
  const { colliders, tex, geo, mat, COARSE } = o;
  let seed = 0x5eed1e5 >>> 0;
  const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = (a, b) => a + rand() * (b - a);
  const W = (a, b) => ({ x: F.x + F.tx * a - F.tz * b, z: F.z + F.tz * a + F.tx * b });   // (a, b) bingkai sungai -> titik dunia
  const out = new THREE.Group(); out.name = 'reruntuhan-kuno';
  const rg = new THREE.Group(); rg.position.set(F.x, 0, F.z); rg.rotation.y = F.yaw; out.add(rg);   // isi dalam koordinat lokal (a, b)
  const wg = new THREE.Group(); out.add(wg);                                                           // isi dalam koordinat dunia (pohon, rumput, kunang-kunang)
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = rg) => { const k = new THREE.Mesh(g, m); k.position.set(x, y, z); k.castShadow = k.receiveShadow = true; parent.add(k); return k; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const solid = (a, b, r) => { const p = W(a, b); colliders.push({ x: p.x, z: p.z, r }); };
  const A = RUINS.a, B = RUINS.b, PB = RUINS.poolB, PR = RUINS.poolR, GB = RUINS.gateB, AB = RUINS.altarB;

  const stone = std(0x8d8a85), stoneD = std(0x6f6c68), stoneM = std(0x6c7a68), sand = std(0xa49f8f);
  const rune = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const canvasTex = (W2, H2, draw, repeat = false) => { const c = document.createElement('canvas'); c.width = W2; c.height = H2; draw(c.getContext('2d'), W2, H2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

  // ---------- 1) Lantai batu berlumut (dekal bundar, tepinya memudar ke tanah) + bercak lumut ----------
  const floorTex = canvasTex(512, 512, (x, W2, H2) => {
    x.fillStyle = '#5f5d52'; x.fillRect(0, 0, W2, H2);                                   // warna celah antar batu
    for (let y = 0; y < H2;) { const rh = 52 + rand() * 26; let xx = -rand() * 70;
      while (xx < W2) { const w = 56 + rand() * 54, g = (112 + rand() * 46) | 0; x.fillStyle = `rgb(${g},${g - 3},${g - 17})`; x.fillRect(xx + 2, y + 2, w - 4, rh - 4);
        for (let k = 0; k < 10; k++) { x.fillStyle = `rgba(${(g * 0.6) | 0},${(g * 0.6) | 0},${(g * 0.55) | 0},.25)`; x.fillRect(xx + 4 + rand() * (w - 10), y + 4 + rand() * (rh - 10), 2 + rand() * 4, 2 + rand() * 4); }
        xx += w; }
      y += rh; }
    for (let i = 0; i < 26; i++) { const px = rand() * W2, py = rand() * H2, rr = 14 + rand() * 38; x.save(); x.translate(px, py); x.scale(rr, rr * 0.7); x.fillStyle = `rgba(52,110,58,${0.22 + rand() * 0.25})`; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); }   // lumut
    x.strokeStyle = 'rgba(25,22,18,.55)'; x.lineWidth = 2;                               // retakan
    for (let i = 0; i < 9; i++) { let px = rand() * W2, py = rand() * H2; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (rand() - 0.5) * 60; py += (rand() - 0.2) * 40; x.lineTo(px, py); } x.stroke(); }
  }, true);
  floorTex.repeat.set(5, 5);
  { const floor = new THREE.Mesh(new THREE.CircleGeometry(RUINS.r, 56).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, transparent: true, alphaMap: tex.radialAlpha(0.88), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    floor.position.set(A, 0.02, B); floor.receiveShadow = true; rg.add(floor);
    const mm = (c, op) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: op, alphaMap: tex.radialAlpha(0.25), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const mats = [mm(0x2f6a35, 0.75), mm(0x3d7d3a, 0.65)], cg = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) { const ang = rand() * 6.283, d = R(4, RUINS.r + 3), s = R(1.6, 4.6), m = new THREE.Mesh(cg, mats[i % 2]);
      m.position.set(A + Math.sin(ang) * d, 0.022 + (i % 4) * 0.0006, B + Math.cos(ang) * d); m.scale.set(s, 1, s * R(0.6, 1)); m.rotation.y = rand() * 3; rg.add(m); }
  }
  yield;

  // ---------- 2) Kolam di ujung sungai + tugu bercahaya di tengahnya ----------
  const poolTex = canvasTex(256, 256, (x, W2, H2) => {
    const g = x.createRadialGradient(W2 / 2, H2 / 2, 4, W2 / 2, H2 / 2, W2 / 2); g.addColorStop(0, '#103f5c'); g.addColorStop(0.55, '#1f6688'); g.addColorStop(1, '#5fb0c8'); x.fillStyle = g; x.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 34; i++) { x.strokeStyle = `rgba(205,236,248,${0.1 + rand() * 0.22})`; x.lineWidth = 1 + rand() * 1.4; x.beginPath(); x.arc(W2 / 2, H2 / 2, 16 + rand() * 108, rand() * 6.3, rand() * 6.3 + 0.5 + rand() * 1.4); x.stroke(); }
  });
  poolTex.center.set(0.5, 0.5);
  mesh(new THREE.CircleGeometry(PR, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: poolTex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.94 }), A, 0.06, PB).castShadow = false;
  for (let i = 0; i < 18; i++) {                         // bibir kolam dari balok batu (terbuka di sisi utara, tempat sungai masuk)
    const ang = (i + 0.5) / 18 * Math.PI * 2; if (Math.abs(Math.abs(ang - Math.PI) ) < 0.42) continue;
    const bk = mesh(box(1.9, R(0.45, 0.7), 1.1), i % 3 ? stone : stoneM, A + Math.sin(ang) * (PR + 0.45), 0.25, PB + Math.cos(ang) * (PR + 0.45)); bk.rotation.y = ang + R(-0.06, 0.06);
  }
  { const nc = Math.ceil(2 * Math.PI * (PR + 0.5) / 1.4);   // tabrakan tepi kolam (seperti kolam padang) + tengahnya
    for (let k = 0; k < nc; k++) { const a2 = k / nc * 6.283; solid(A + Math.sin(a2) * (PR + 0.5), PB + Math.cos(a2) * (PR + 0.5), 0.9); }
    solid(A, PB, PR * 0.85); }
  mesh(new THREE.CylinderGeometry(2.0, 2.3, 0.6, 10), stoneD, A, 0.3, PB);                               // alas tugu (pulau kecil)
  const obG = new THREE.Group(); obG.position.set(A, 0.6, PB); rg.add(obG);
  mesh(new THREE.CylinderGeometry(0.28, 0.62, 4.6, 4).rotateY(Math.PI / 4), stone, 0, 2.3, 0, obG);      // tugu
  mesh(new THREE.ConeGeometry(0.3, 0.8, 4).rotateY(Math.PI / 4), stoneD, 0, 5.0, 0, obG);
  for (let i = 0; i < 4; i++) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.9), rune); ln.position.set(Math.sin(i * Math.PI / 2) * 0.33, 2.5, Math.cos(i * Math.PI / 2) * 0.33); ln.rotation.y = i * Math.PI / 2; obG.add(ln); }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.46), new THREE.MeshStandardMaterial({ color: 0x9cf0ff, emissive: 0x3fd0ff, emissiveIntensity: 1.5, roughness: 0.2, flatShading: true }));
  crystal.position.set(0, 6.1, 0); crystal.castShadow = false; obG.add(crystal);
  const poolLight = new THREE.PointLight(0x7fd8ff, 7, 26, 2); poolLight.position.set(A, 4.8, PB); rg.add(poolLight);
  yield;

  // ---------- 3) Gerbang air: dua pilar batu di kiri-kanan sungai, ambang kiri masih menggantung, kanan sudah runtuh ----------
  { const PX = 9.2;
    for (const sg of [-1, 1]) {
      const h = sg < 0 ? 7.0 : 4.3;
      mesh(box(2.8, 0.6, 2.8), stoneD, sg * PX, 0.3, GB);
      mesh(box(2.0, h, 2.0), stone, sg * PX, 0.6 + h / 2, GB);
      if (sg < 0) { mesh(box(2.5, 0.4, 2.5), stoneD, sg * PX, 0.6 + h + 0.2, GB); }
      else for (let k = 0; k < 3; k++) { const c = mesh(box(R(0.8, 1.3), R(0.5, 0.9), R(0.8, 1.3)), stone, sg * PX + R(-0.5, 0.5), 0.6 + h + R(0.1, 0.35), GB + R(-0.5, 0.5)); c.rotation.set(R(-0.3, 0.3), R(0, 3), R(-0.3, 0.3)); }   // puncak patah
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.8), rune); pl.position.set(sg * (PX - 1.02), 3.4, GB); pl.rotation.y = -sg * Math.PI / 2; rg.add(pl);   // rune di sisi dalam
      solid(sg * PX, GB, 1.5);
    }
    const lin = mesh(box(8.6, 1.2, 1.9), stoneD, -PX + 4.0, 0.6 + 7.0 + 0.4 + 0.6, GB); lin.rotation.z = 0.025;        // ambang kiri: menggantung ke arah sungai
    const lf = mesh(box(6.2, 1.1, 1.8), stoneD, 12.6, 0.55, GB + 6.4); lf.rotation.set(0.04, -0.45, 0.05);               // ambang kanan: jatuh di tanah
    solid(10.4, GB + 6.0, 1.3); solid(12.6, GB + 6.4, 1.3); solid(14.8, GB + 6.9, 1.3);
    for (const sg of [-1, 1]) for (let k = 0; k < 4; k++) { if (rand() < 0.2) continue; const h = R(0.5, 0.95), w = mesh(box(0.6, h, 2.9), k % 2 ? stone : stoneM, sg * 5.95, h / 2, GB + 3.0 + k * 3.0); w.rotation.y = R(-0.03, 0.03); }   // dinding rendah penahan tepi sungai (rapat ke air: sudah tertutup tabrakan tepi air, jadi tak perlu tabrakan sendiri)
  }
  yield;

  // ---------- 4) Pilar-pilar mengelilingi lantai (sebagian masih berdiri, sebagian patah) + tiang jatuh ----------
  { const NP = 9, PRR = 14, rubble = [];
    for (let i = 0; i < NP; i++) {
      const ang = (20 + i * 40) * Math.PI / 180; if (Math.abs(ang - Math.PI) < 0.1) continue;        // sisi utara = tempat sungai
      const a = A + Math.sin(ang) * PRR, b = B + Math.cos(ang) * PRR, standing = i % 2 === 0 || i === 3, h = standing ? R(5.2, 6.2) : R(1.2, 3.4);
      mesh(box(2.0, 0.5, 2.0), stoneD, a, 0.25, b);
      const sh = mesh(new THREE.CylinderGeometry(0.62, 0.74, h - 0.5, 10), stone, a, 0.5 + (h - 0.5) / 2, b); sh.rotation.y = rand() * 3;
      if (standing) { mesh(box(1.7, 0.35, 1.7), stoneD, a, h + 0.17, b); mesh(box(1.3, 0.3, 1.3), stone, a, h + 0.5, b); }
      else { const c = mesh(new THREE.DodecahedronGeometry(0.75, 0), stone, a + R(-0.2, 0.2), h + 0.2, b + R(-0.2, 0.2)); c.scale.set(1, R(0.4, 0.7), 1); c.rotation.set(R(0, 3), R(0, 3), R(0, 3));
        const fd = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.15, 10), stone, a + Math.sin(ang + 0.5) * 2.6, 0.7, b + Math.cos(ang + 0.5) * 2.6); fd.rotation.set(0, R(0, 3), Math.PI / 2);   // potongan tiang jatuh
        solid(a + Math.sin(ang + 0.5) * 2.6, b + Math.cos(ang + 0.5) * 2.6, 0.9); }
      solid(a, b, 1.0);
    }
    // ---------- 5) Dinding keliling yang sudah banyak runtuh (ada celah di banyak tempat) ----------
    const WR = 22.5, NS = 26, chord = 2 * Math.PI * WR / NS;
    for (let i = 0; i < NS; i++) {
      const ang = (i + 0.5) / NS * Math.PI * 2, a = A + Math.sin(ang) * WR, b = B + Math.cos(ang) * WR;
      if (rand() < 0.4 || (Math.abs(a) < 12 && b < 162) || i === RUINS_DOOR.seg) continue;                                  // celah acak; sisi utara dibiarkan terbuka (jalan masuk dari gerbang)
      const h = R(0.7, 3.3), wl = mesh(box(chord * 0.96, h, 0.9), i % 2 ? stone : stoneM, a, h / 2, b); wl.rotation.y = ang;
      for (let k = 0; k < 2; k++) { const t = R(-chord / 2.4, chord / 2.4), c = mesh(box(R(0.7, 1.4), R(0.3, 0.9), 0.8), stoneD, a + t * Math.cos(ang), h + 0.2, b - t * Math.sin(ang)); c.rotation.y = ang + R(-0.2, 0.2); c.rotation.z = R(-0.15, 0.15); }
      if (h > 0.9) { const n = Math.ceil(chord / 1.3); for (let k = 0; k < n; k++) { const t = (k / (n - 1) - 0.5) * chord * 0.9; solid(a + t * Math.cos(ang), b - t * Math.sin(ang), 0.7); } }
    }
    // ---------- 6) Puing balok berserakan ----------
    const NB = COARSE ? 28 : 46, bi = new THREE.InstancedMesh(box(1, 1, 1), std(0xffffff), NB); let n = 0;
    for (let i = 0; i < NB * 8 && n < NB; i++) {
      const ang = rand() * 6.283, d = Math.sqrt(rand()) * (RUINS.r + 1), a = A + Math.sin(ang) * d, b = B + Math.cos(ang) * d;
      if (Math.hypot(a - A, b - PB) < PR + 3 || (Math.abs(a) < 8 && b < GB + 12) || (Math.abs(a) < 8 && b > AB - 5) || Math.abs(a - 12.6) < 4 && Math.abs(b - GB - 6.4) < 4 || (a > 14 && Math.abs(b - B) < 5.5)) continue;   // (terakhir: jalan ke Pintu Penjaga bebas puing)
      const s = R(0.5, 1.4); dummy.position.set(a, s * 0.22, b); dummy.rotation.set(R(-0.2, 0.2), R(0, 6), R(-0.2, 0.2)); dummy.scale.set(s * R(1, 1.6), s * R(0.5, 0.9), s * R(0.9, 1.4)); dummy.updateMatrix();
      bi.setMatrixAt(n, dummy.matrix); const g = R(0.7, 1.1); bi.setColorAt(n, tmpC.setRGB(0.55 * g, 0.54 * g, 0.5 * g)); if (s > 0.85) solid(a, b, s * 0.8); n++;
    }
    bi.count = n; bi.castShadow = bi.receiveShadow = true; rg.add(bi);
  }
  yield;

  // ---------- 7) Altar di sisi selatan: dua undakan, prasasti, dua pedupaan api biru ----------
  const tabletTex = canvasTex(512, 768, (x, W2, H2) => {
    x.fillStyle = '#858275'; x.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(40,36,30,${rand() * 0.16})`; x.fillRect(rand() * W2, rand() * H2, 1 + rand() * 3, 1 + rand() * 3); }
    x.fillStyle = 'rgba(52,110,58,.35)'; for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(rand() * W2, H2 - rand() * 140, 30 + rand() * 60, 14 + rand() * 20, 0, 0, 7); x.fill(); }
    x.strokeStyle = '#3a362e'; x.lineWidth = 8; x.strokeRect(22, 22, W2 - 44, H2 - 44);
    x.textAlign = 'center'; x.fillStyle = '#2b2822'; x.font = 'bold 44px Georgia'; x.fillText('SUNGAI BENING', W2 / 2, 118); x.fillText('BERAKHIR DI SINI', W2 / 2, 170);
    x.fillRect(90, 204, W2 - 180, 4);
    x.font = 'italic 31px Georgia'; ['Air kembali ke asalnya,', 'ingatan kembali ke hulu.', '', 'Yang tersembunyi akan terbuka', 'bagi pengelana yang berani', 'mengikuti arus sampai ujung.'].forEach((l, i) => x.fillText(l, W2 / 2, 272 + i * 48));
    x.fillStyle = 'rgba(95,200,225,.9)'; x.font = '40px serif'; x.fillText('✦  ◈  ✦', W2 / 2, 640);
  });
  { const slab = (w, d, y, bb, m) => mesh(box(w, 0.22, d), m, 0, y, bb);
    slab(12.4, 7.2, 0.11, AB + 1.6, stoneD); slab(9.8, 5.6, 0.33, AB + 1.8, stone);
    mesh(box(3.2, 0.45, 1.3), stoneD, 0, 0.55 + 0.22, AB + 2.6);
    const frontM = new THREE.MeshStandardMaterial({ map: tabletTex, roughness: 1 });
    const tb = new THREE.Mesh(box(2.5, 3.7, 0.55), [stone, stone, stone, stone, stone, frontM]); tb.position.set(0, 0.77 + 1.85, AB + 2.6); tb.castShadow = tb.receiveShadow = true; rg.add(tb);   // sisi -z (menghadap utara) = tulisan
    const ch = mesh(box(0.9, 0.7, 0.5), stoneD, 1.0, 0.77 + 3.7 + 0.1, AB + 2.6); ch.rotation.z = -0.5;                                                                         // puncak prasasti patah
    solid(0, AB + 2.6, 1.5);
  }
  const flames = [];
  for (const sg of [-1, 1]) {
    const px = sg * 4.2, pz = AB - 0.8;
    mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.9, 8), stoneD, px, 0.45, pz); mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.4, 10), stone, px, 1.1, pz);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 7), new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.position.set(px, 1.75, pz); rg.add(fl); flames.push(fl); solid(px, pz, 0.7);
  }
  const altarLight = new THREE.PointLight(0x9fe8ff, 3.4, 16, 2); altarLight.position.set(0, 3.2, AB - 1); rg.add(altarLight);
  yield;

  // ---------- 8) Rumput liar menembus celah batu & di sepanjang tepi sungai (di luar padang, jadi tidak ada rumput dari padang) ----------
  { const grassMat = mat.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.15, 0, true), NG = COARSE ? 520 : 1150, tl = [];
    const tot = RUINS_CIRCLES.reduce((s, c) => s + c.r, 0);
    for (let i = 0; i < NG * 10 && tl.length < NG; i++) {
      let pick = rand() * tot, c = RUINS_CIRCLES[0]; for (const cc of RUINS_CIRCLES) { pick -= cc.r; if (pick <= 0) { c = cc; break; } }
      const ang = rand() * 6.283, d = Math.sqrt(rand()) * c.r, x = c.x + Math.cos(ang) * d, z = c.z + Math.sin(ang) * d;
      if (ruinsDist(x, z) > -0.8 || meadowDist(x, z) < -1.2 || riverEdge(x, z) < 1.8) continue;
      const dx = x - RUINS.x, dz = z - RUINS.z, lb = (x - F.x) * -F.tz + (z - F.z) * F.tx, la = (x - F.x) * F.tx + (z - F.z) * F.tz;
      if (Math.hypot(la - A, lb - PB) < PR + 2.4 || (Math.abs(la) < 6.5 && lb > AB - 2 && lb < AB + 5.5) || (Math.hypot(dx, dz) < RUINS.r - 1 && rand() < 0.62)) continue;   // jarang di atas lantai batu
      tl.push({ x, z, sx: R(0.9, 1.9), sy: R(0.8, 1.5), a: rand() * 6.283, r: R(0.75, 1.1), g: R(0.85, 1.12), b: R(0.7, 1.0) });
    }
    if (tl.length) { const im = new THREE.InstancedMesh(geo.grassGeo, grassMat, tl.length);
      tl.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.set(t.sx, t.sy, t.sx); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.setRGB(t.r, t.g, t.b)); });
      im.receiveShadow = true; wg.add(im); }
  }
  yield;

  // ---------- 9) Sabuk pohon di sekeliling area rahasia (di luar sabuk pohon padang; tanpa tabrakan karena pemain tak bisa keluar dari area) ----------
  { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of RUINS_CIRCLES) { x0 = Math.min(x0, c.x - c.r - 20); x1 = Math.max(x1, c.x + c.r + 20); z0 = Math.min(z0, c.z - c.r - 20); z1 = Math.max(z1, c.z + c.r + 20); }
    const trees = [], cell = 4, grid = new Map(), key = (i, j) => (i + 2000) * 5000 + (j + 2000);
    const tooClose = (x, z, d) => { const ci = Math.floor(x / cell), cj = Math.floor(z / cell), r = Math.ceil(d / cell);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const l = grid.get(key(ci + i, cj + j)); if (l) for (const t of l) if (Math.hypot(t.x - x, t.z - z) < d) return true; } return false; };
    const NT = COARSE ? 150 : 300;
    for (let i = 0; i < NT * 22 && trees.length < NT; i++) {
      if (i % 400 === 0 && i) yield;
      const x = R(x0, x1), z = R(z0, z1), rd = ruinsDist(x, z);
      if (rd < 1.8 || rd > 17 || meadowDist(x, z) < 18 || riverEdge(x, z) < 4 || tooClose(x, z, rd < 8 ? 3.4 : 4.4)) continue;
      const t = { x, z, s: R(0.95, 1.7), a: rand() * 6.283, pine: rand() < 0.4 }; trees.push(t);
      const k = key(Math.floor(x / cell), Math.floor(z / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(t);
    }
    const oakM = mat.leafMat(0.03), pineM = mat.leafMat(0.02);
    for (const pine of [false, true]) {
      const l = trees.filter(t => t.pine === pine); if (!l.length) continue;
      const trunk = new THREE.InstancedMesh(pine ? geo.trunkPine : geo.trunkOak, mat.barkMat, l.length), leaf = new THREE.InstancedMesh(pine ? geo.pineLeaf : geo.oakLeaf, pine ? pineM : oakM, l.length);
      l.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix); leaf.setMatrixAt(i, dummy.matrix);
        leaf.setColorAt(i, tmpC.setRGB(R(0.62, 0.95), R(0.78, 1.05), R(0.7, 1.05))); });   // sedikit lebih gelap & kebiruan dari padang: kesan teduh
      for (const m of [trunk, leaf]) { m.castShadow = m.receiveShadow = true; wg.add(m); }
    }
  }
  yield;


  // ---------- 11) PINTU PENJAGA: pintu batu di dinding timur menuju arena golem ----------
  // Dibangun dalam grup `dg` di titik (DA, DB) dinding keliling, dgn sumbu lokal: x = +b (selatan), z = ke tengah reruntuhan (-a). Lorong ada di z negatif (keluar dinding).
  const DA = RUINS_DOOR.a, DB = RUINS_DOOR.b, dg = new THREE.Group(); dg.position.set(DA, 0, DB); dg.rotation.y = -Math.PI / 2; rg.add(dg);
  const dsolid = (lx, lz, r) => solid(DA - lz, DB + lx, r);
  const leafTex = glow => canvasTex(256, 512, (x, W2, H2) => {   // daun pintu: ukiran rune (glow = true: hanya garis cyan di atas hitam, untuk emissiveMap)
    x.fillStyle = glow ? '#000' : '#5e5c55'; x.fillRect(0, 0, W2, H2);
    if (!glow) for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(30,28,24,${rand() * 0.18})`; x.fillRect(rand() * W2, rand() * H2, 1 + rand() * 3, 1 + rand() * 3); }
    x.strokeStyle = glow ? '#7fe8ff' : '#2a2824'; x.lineWidth = glow ? 7 : 11; x.strokeRect(18, 18, W2 - 36, H2 - 36);
    x.lineWidth = glow ? 6 : 9; x.beginPath(); x.arc(W2 / 2, 150, 62, 0, 7); x.stroke(); x.beginPath(); x.arc(W2 / 2, 150, 28, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(W2 / 2, 60); x.lineTo(W2 / 2, 450); for (let k = 0; k < 5; k++) { const y = 250 + k * 44; x.moveTo(W2 / 2 - 52, y); x.lineTo(W2 / 2, y + 22); x.lineTo(W2 / 2 + 52, y); } x.stroke();
  });
  const leafM = new THREE.MeshStandardMaterial({ map: leafTex(false), emissive: 0x7fe8ff, emissiveMap: leafTex(true), emissiveIntensity: 0.9, roughness: 1 });
  mesh(box(6.6, 0.16, 1.4), stoneD, 0, 0.08, 3.0, dg); mesh(box(5.8, 0.32, 1.4), stone, 0, 0.16, 1.9, dg); mesh(box(4.6, 0.12, 4.4), stone, 0, 0.06, -1.9, dg);   // undakan landai + lantai lorong
  for (const sg of [-1, 1]) {
    mesh(box(2.8, 0.5, 2.8), stoneD, sg * 2.9, 0.25, -0.2, dg); mesh(box(2.0, 7.0, 2.2), stone, sg * 2.9, 4.0, -0.2, dg); mesh(box(2.6, 0.4, 2.8), stoneD, sg * 2.9, 7.7, -0.2, dg);
    mesh(box(1.0, 7.9, 3.2), stoneM, sg * 2.4, 3.95, -2.2, dg);                                                                                                  // dinding lorong
    dsolid(sg * 2.9, -0.2, 1.45); dsolid(sg * 2.5, -1.7, 0.7); dsolid(sg * 2.5, -2.9, 0.7);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3.2), rune); pl.position.set(sg * 1.88, 3.8, -0.2); pl.rotation.y = -sg * Math.PI / 2; dg.add(pl);          // rune di sisi dalam pilar
    const px = sg * 5.2, pz = 1.9;                                                                                                                              // pedupaan api biru di kiri-kanan pintu
    mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.0, 8), stoneD, px, 0.5, pz, dg); mesh(new THREE.CylinderGeometry(0.6, 0.32, 0.45, 10), stone, px, 1.2, pz, dg);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.1, 7), new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.position.set(px, 1.95, pz); dg.add(fl); flames.push(fl); dsolid(px, pz, 0.75);
  }
  mesh(box(8.8, 1.5, 2.8), stoneD, 0, 8.65, -0.2, dg); mesh(box(5.8, 0.6, 3.4), stoneD, 0, 7.6, -2.0, dg);                                                     // ambang atas + atap lorong
  mesh(box(4.6, 7.4, 0.6), stoneD, 0, 3.8, -3.9, dg); dsolid(-1.2, -3.7, 0.8); dsolid(1.2, -3.7, 0.8); dsolid(0, -3.9, 0.8);                                  // dinding belakang lorong
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.2), new THREE.MeshStandardMaterial({ roughness: 1, emissive: 0x7fe8ff, emissiveIntensity: 0.25, map: canvasTex(512, 96, (x, W2, H2) => {
    x.fillStyle = '#6a675f'; x.fillRect(0, 0, W2, H2); x.strokeStyle = '#2b2822'; x.lineWidth = 6; x.strokeRect(6, 6, W2 - 12, H2 - 12);
    x.textAlign = 'center'; x.fillStyle = '#26231e'; x.font = 'bold 40px Georgia'; x.fillText('PINTU PENJAGA', W2 / 2, 46); x.font = 'italic 21px Georgia'; x.fillText('Yang melangkah masuk, hadapilah ia.', W2 / 2, 76); }) }));
  plaque.position.set(0, 8.65, 1.22); dg.add(plaque);
  const portalTex = canvasTex(256, 256, (x, W2, H2) => {   // kabut cahaya di ujung lorong
    const g = x.createRadialGradient(W2 / 2, H2 / 2, 6, W2 / 2, H2 / 2, W2 * 0.7); g.addColorStop(0, '#d8fbff'); g.addColorStop(0.35, '#3aa6c4'); g.addColorStop(1, '#04141c'); x.fillStyle = g; x.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(190,245,255,${0.08 + rand() * 0.2})`; x.lineWidth = 1 + rand() * 2; x.beginPath(); x.arc(W2 / 2, H2 / 2, 14 + rand() * 100, rand() * 6.3, rand() * 6.3 + 0.6 + rand() * 1.6); x.stroke(); }
  });
  portalTex.center.set(0.5, 0.5);
  const portalMat = new THREE.MeshBasicMaterial({ map: portalTex }), portal = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 7.2), portalMat); portal.position.set(0, 4.1, -3.55); dg.add(portal);
  const leaves = [-1, 1].map(sg => {   // daun pintu: berengsel di pilar, terbuka ke dalam lorong
    const hinge = new THREE.Group(); hinge.position.set(sg * 1.9, 0.5, -0.2); dg.add(hinge);
    const lf = new THREE.Mesh(box(1.9, 6.8, 0.45), [stone, stone, stone, stone, leafM, stoneD]); lf.position.set(-sg * 0.95, 3.4, 0); lf.castShadow = lf.receiveShadow = true; hinge.add(lf); return { hinge, sg };
  });
  const doorLight = new THREE.PointLight(0x7fe8ff, 0, 18, 2); doorLight.position.set(0, 3.6, -1.0); dg.add(doorLight);
  yield;

  // ---------- 10) Butiran cahaya biru melayang: di sekitar kolam, dan samar di sepanjang sungai sebagai petunjuk halus ----------
  const NM = COARSE ? 40 : 80, moteG = new THREE.BufferGeometry(), motePos = new Float32Array(NM * 3), seeds = [];
  const tail = RIVER_PTS.filter(p => (p.x - F.x) * -F.tz + (p.z - F.z) * F.tx > 100 && (p.x - F.x) * -F.tz + (p.z - F.z) * F.tx < GB - 4);
  for (let i = 0; i < NM; i++) {
    if (i < NM * 0.62 || !tail.length) seeds.push({ pool: true, a: rand() * 6.283, r: R(2, PR + 5), s: R(0.15, 0.4), p: rand() * 10 });
    else { const p = tail[(rand() * tail.length) | 0]; seeds.push({ pool: false, x: p.x + R(-6, 6), z: p.z + R(-6, 6), s: R(0.2, 0.5), p: rand() * 10 }); }
  }
  moteG.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteG, new THREE.PointsMaterial({ color: 0xaff2ff, size: 0.16, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); motes.frustumCulled = false; out.add(motes);
  const pc = W(A, PB);

  return {
    group: out,
    update(t) {
      rune.opacity = 0.5 + Math.sin(t * 1.3) * 0.2;
      { const o = DOOR_FX.open, e = o * o * (3 - 2 * o);   // daun Pintu Penjaga membuka mengikuti jarak pemain; cahaya lorong makin terang
        for (const l of leaves) l.hinge.rotation.y = -l.sg * 1.6 * e;
        doorLight.intensity = (0.8 + 9 * e) * (0.88 + 0.12 * Math.sin(t * 2.3)); portalMat.color.setScalar(0.3 + 0.7 * e); portalTex.rotation = t * 0.22; }
      poolLight.intensity = 6.5 + Math.sin(t * 1.3 + 1) * 1.3; altarLight.intensity = 3.2 + Math.sin(t * 1.9) * 0.6;
      crystal.position.y = 6.1 + Math.sin(t * 1.1) * 0.18; crystal.rotation.y = t * 0.8;
      poolTex.rotation = t * 0.04;
      flames.forEach((f, i) => { const k = 1 + Math.sin(t * 9 + i * 2) * 0.12 + Math.sin(t * 15 + i) * 0.08; f.scale.set(1, k, 1); });
      for (let i = 0; i < NM; i++) {
        const m = seeds[i];
        if (m.pool) { const a = m.a + t * m.s * 0.3; motePos[i * 3] = pc.x + Math.sin(a) * m.r; motePos[i * 3 + 1] = 0.5 + ((t * m.s + m.p) % 4.2); motePos[i * 3 + 2] = pc.z + Math.cos(a) * m.r; }
        else { motePos[i * 3] = m.x + Math.sin(t * 0.3 + m.p) * 1.2; motePos[i * 3 + 1] = 0.8 + Math.sin(t * m.s + m.p) * 0.5 + 0.9; motePos[i * 3 + 2] = m.z + Math.cos(t * 0.27 + m.p) * 1.2; }
      }
      moteG.attributes.position.needsUpdate = true;
    },
  };
}
