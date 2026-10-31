import * as THREE from 'three';
import { VILLAGE } from './village-layout.js';
import { CITY, cityDist } from './city-layout.js';
import { SECRET_GLADE, FOREST, GATE, CLEARING, GIANT_TREE, CAMP_FIRE, POND, STONES, TRAIL_STONES, zoneDist,
  FOREST_ROAD_2, TRAIL_GROVE, STREAM, STREAM_W, BRIDGE, REST_STOP, GROVE, ANCIENT_GATE, FOREST_BOUNDS } from './forest-layout.js';

// ============================================================
//  Membangun isi Hutan Besar (dipanggil dari world.js).
//  Isinya: ribuan pohon (dibagi per "petak" supaya kamera hanya menggambar yang terlihat),
//  gerbang masuk, perkemahan + pondok penjaga hutan, pohon raksasa, kolam, lingkaran batu kuno,
//  jamur, semak, batang pohon tumbang, dan butiran cahaya melayang.
// ============================================================
export function buildForest(o) {
  const { colliders, rand, existing, roadPts, COARSE, LIMIT, geo, mat, tex, jitter, prep } = o;
  const R = (a, b) => a + rand() * (b - a);
  const g = new THREE.Group(); g.name = 'hutan';
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const mesh = (geom, material, x = 0, y = 0, z = 0, parent = g) => {
    const m = new THREE.Mesh(geom, material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const dist = (x, z, c) => Math.hypot(x - c.x, z - c.z);
  const nearRoad = (x, z, pad) => { for (let i = 0; i < roadPts.length; i++) if (Math.hypot(x - roadPts[i].x, z - roadPts[i].z) < pad) return true; return false; };
  // tempat-tempat khusus yang harus bebas dari pohon / semak
  const B = FOREST_BOUNDS, RX = () => R(B.x0, B.x1), RZ = () => R(B.z0, B.z1);   // kotak acak (sudah diperluas ke timur)
  // sungai: titik-titik rapat sepanjang alirannya (supaya pohon/semak tidak tumbuh di air)
  const streamCurve = new THREE.CatmullRomCurve3(STREAM.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const streamPts = streamCurve.getSpacedPoints(Math.round(streamCurve.getLength() / 1.5));
  const nearStream = (x, z, pad) => { for (const p of streamPts) if (Math.hypot(x - p.x, z - p.z) < STREAM_W / 2 + pad) return true; return false; };
  const featureBlocked = (x, z, pad = 0) =>
    dist(x, z, CLEARING) < CLEARING.r + 2 + pad || dist(x, z, POND) < POND.r + 4 + pad ||
    dist(x, z, STONES) < STONES.r + 3 + pad || dist(x, z, GATE) < 5 + pad ||
    dist(x, z, REST_STOP) < REST_STOP.r + pad || dist(x, z, GROVE) < GROVE.r + 2 + pad ||
    dist(x, z, ANCIENT_GATE) < 17 + pad || cityDist(x, z) < 8 + pad ||   // kota (di timur gerbang) bebas pohon
    dist(x, z, SECRET_GLADE) < SECRET_GLADE.r + 2.5 + pad || nearStream(x, z, 2.6 + pad) ||
    Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < 7 + pad;
  const stoneMat = std(0x8d8a85), timber = std(0x5b3d22), logMat = std(0x6b4a2d);
  const rockGeo = jitter(prep(new THREE.DodecahedronGeometry(1, 0)), 0.18);

  // ---------- Bercak tanah gelap & serasah daun (supaya lantai hutan tidak polos) ----------
  { const alpha = tex.radialAlpha(0.25), pm = (c, op) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: op, alphaMap: alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mats = [pm(0x244f23, 0.62), pm(0x2d5f2a, 0.55), pm(0x6b5a30, 0.5)], pg = new THREE.CircleGeometry(1, 24);
    for (let i = 0, n = 0; n < (COARSE ? 44 : 90) && i < 1400; i++) {
      const x = RX(), z = RZ(); if (zoneDist(x, z) > -2 || Math.hypot(x, z) < LIMIT) continue;
      const m = new THREE.Mesh(pg, mats[n % 3]), s = R(6, 14); n++;
      m.rotation.x = -Math.PI / 2; m.scale.set(s, s * R(0.6, 1), 1); m.rotation.z = rand() * 3; m.position.set(x, 0.012, z); m.receiveShadow = true; g.add(m);
    }
  }

  // ---------- Pohon ----------
  // dataran lama sudah punya pohon sendiri (daftar "existing"); di sini kita tambah pohon hanya di area hutan
  const trees = [], cell = 4, grid = new Map(), ck = (cx, cz) => (cx + 200) * 1000 + (cz + 200);
  const addGrid = t => { const k = ck(Math.floor(t.x / cell), Math.floor(t.z / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(t); };
  existing.forEach(addGrid);
  const tooClose = (x, z, d) => { // cek pohon lain yang terlalu dekat (pakai grid supaya cepat)
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get(ck(cx + i, cz + j)); if (l) for (const t of l) if (Math.hypot(t.x - x, t.z - z) < d) return true; }
    return false;
  };
  const tryTree = (x, z, minD, far) => {
    if (Math.hypot(x, z) < LIMIT - 8) return false;                 // area dataran lama
    if (dist(x, z, VILLAGE) < VILLAGE.radius + 3) return false;     // jangan menimpa desa
    if (tooClose(x, z, minD) || featureBlocked(x, z) || nearRoad(x, z, far ? 1.8 : 2.8)) return false;
    const big = !far && rand() < 0.12; // sesekali pohon besar
    const t = { x, z, s: R(0.9, 1.55) * (big ? 1.35 : 1), a: rand() * 6.283, pine: rand() < (far ? 0.6 : 0.45), far };
    trees.push(t); addGrid(t); return true;
  };
  const TI = COARSE ? 480 : 940, TA = COARSE ? 260 : 500, TB = COARSE ? 195 : 390;   // jumlah ikut bertambah mengikuti luas hutan
  for (let n1 = 0, n2 = 0, n3 = 0, tries = 0; tries < 160000 && (n1 < TI || n2 < TA || n3 < TB); tries++) {
    const x = RX(), z = RZ(), zd = zoneDist(x, z);
    if (zd < -1.5) { if (n1 < TI && tryTree(x, z, 3.3, false)) n1++; }          // dalam hutan: ada tabrakan
    else if (zd < 8) { if (n2 < TA && tryTree(x, z, 2.4, true)) n2++; }         // tepi hutan: rapat, jadi "tembok"
    else if (zd < 30) { if (n3 < TB && tryTree(x, z, 3.2, true)) n3++; }        // hutan jauh
  }
  // kelompokkan pohon per petak 56x56 -> satu InstancedMesh per petak
  const CH = 56, buckets = new Map();
  for (const t of trees) { const k = (t.pine ? 'p' : 'o') + (t.far ? 'f' : 'n') + Math.floor(t.x / CH) + ',' + Math.floor(t.z / CH); (buckets.get(k) || buckets.set(k, []).get(k)).push(t); }
  const oakMat = mat.leafMat(0.03), pineMat = mat.leafMat(0.02);
  for (const list of buckets.values()) {
    const pine = list[0].pine, far = list[0].far;
    const mk = (geom, m) => { const im = new THREE.InstancedMesh(geom, m, list.length); im.castShadow = !far; im.receiveShadow = true; g.add(im); return im; };
    const trunk = mk(pine ? geo.trunkPine : geo.trunkOak, mat.barkMat), leaf = mk(pine ? geo.pineLeaf : geo.oakLeaf, pine ? pineMat : oakMat);
    list.forEach((t, i) => {
      dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix); leaf.setMatrixAt(i, dummy.matrix);
      leaf.setColorAt(i, tmpC.setRGB(R(0.6, 0.95), R(0.72, 1.0), R(0.6, 0.95))); // daun lebih gelap = suasana hutan lebat
      if (!t.far) colliders.push({ x: t.x, z: t.z, r: 0.34 * t.s });
    });
  }

  // ---------- Gerbang kayu di pintu masuk hutan ----------
  { const s = new THREE.Group(); s.position.set(GATE.x, 0, GATE.z); s.rotation.y = GATE.yaw; g.add(s);
    const signTex = tex.canvasTex(512, (x, n) => {
      x.fillStyle = '#6f4d2a'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(40,25,10,${Math.random() * 0.25})`; x.fillRect(0, Math.random() * n, n, 1 + Math.random() * 3); }
      x.strokeStyle = '#3a2412'; x.lineWidth = 18; x.strokeRect(9, 9, n - 18, n - 18);
      x.fillStyle = '#e9d9a8'; x.textAlign = 'center'; x.font = 'bold 120px Georgia'; x.fillText('HUTAN', n / 2, 215); x.fillText('BESAR', n / 2, 365);
      x.font = 'bold 60px Georgia'; x.fillText('▶', n / 2, 460);
    });
    const lantern = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb040, emissiveIntensity: 1.3 });
    for (const sx of [-1, 1]) {
      mesh(new THREE.CylinderGeometry(0.2, 0.27, 4.4, 8), timber, sx * 2.3, 2.2, 0, s);
      mesh(box(0.34, 0.42, 0.34), lantern, sx * 2.3, 3.45, 0.32, s);
      const lx = GATE.x + Math.cos(GATE.yaw) * sx * 2.3, lz = GATE.z - Math.sin(GATE.yaw) * sx * 2.3; colliders.push({ x: lx, z: lz, r: 0.34 });
    }
    mesh(box(5.4, 0.32, 0.36), timber, 0, 4.25, 0, s);
    mesh(box(5.0, 0.2, 0.28), timber, 0, 3.85, 0, s);
    for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), timber, sx * 1.1, 3.4, 0, s);
    mesh(new THREE.BoxGeometry(2.6, 1.3, 0.12), new THREE.MeshStandardMaterial({ map: signTex, roughness: 1 }), 0, 2.75, 0, s);
  }

  // ---------- Pohon tua raksasa di tengah lapangan ----------
  { const sc = GIANT_TREE.scale, gt = new THREE.Group(); gt.position.set(GIANT_TREE.x, 0, GIANT_TREE.z); gt.scale.setScalar(sc); g.add(gt);
    mesh(geo.trunkOak, mat.barkMat, 0, 0, 0, gt); mesh(geo.oakLeaf, mat.leafMat(0.012), 0, 0, 0, gt);
    for (let i = 0; i < 7; i++) { // akar besar menjalar di tanah
      const a = (i / 7) * 6.283 + R(-0.2, 0.2), rg = new THREE.ConeGeometry(0.17, 1.1, 6).translate(0, 0.55, 0);
      const r = mesh(rg, mat.barkMat, Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3, gt); r.rotation.set(0, -a, -1.9); r.scale.set(1, R(0.9, 1.3), 1);
    }
    colliders.push({ x: GIANT_TREE.x, z: GIANT_TREE.z, r: 1.55 });
  }

  // ---------- Perkemahan: api unggun, tempat duduk, tumpukan kayu, tunggul + kapak ----------
  const fire = new THREE.Group(); fire.position.set(CAMP_FIRE.x, 0, CAMP_FIRE.z); g.add(fire);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; mesh(new THREE.DodecahedronGeometry(0.2, 0), stoneMat, Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7, fire); }
  for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6).rotateZ(Math.PI / 2.4), logMat, 0, 0.22, 0, fire); l.rotation.y = i * 1.05; }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 7), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, fog: false })); flame.position.y = 0.6; fire.add(flame);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xffd36a, fog: false })); flame2.position.y = 0.5; fire.add(flame2);
  const fireLight = new THREE.PointLight(0xff9a4a, 7, 11, 2); fireLight.position.y = 1.0; fire.add(fireLight);
  for (let i = 0; i < 3; i++) { const a = 0.6 + i * 2.1, seat = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.3, 7).rotateZ(Math.PI / 2), logMat, Math.cos(a) * 2.2, 0.22, Math.sin(a) * 2.2, fire); seat.rotation.y = -a + Math.PI / 2; }
  colliders.push({ x: CAMP_FIRE.x, z: CAMP_FIRE.z, r: 0.75 });
  { const px = 118, pz = 60.5, pile = new THREE.Group(); pile.position.set(px, 0, pz); pile.rotation.y = 0.4; g.add(pile); // tumpukan kayu bakar (3 + 2 + 1 batang)
    const logGeo = new THREE.CylinderGeometry(0.17, 0.17, 1.7, 7).rotateZ(Math.PI / 2);
    [[-0.7, 0.17], [0, 0.17], [0.7, 0.17], [-0.35, 0.5], [0.35, 0.5], [0, 0.83]].forEach(([z, y]) => mesh(logGeo, logMat, 0, y, z, pile));
    colliders.push({ x: px, z: pz, r: 1.0 });
  }
  { const sx = 115.4, sz = 59.6, st = new THREE.Group(); st.position.set(sx, 0, sz); g.add(st); // tunggul tempat membelah kayu + kapak
    mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.55, 9), std(0x7a5a38), 0, 0.275, 0, st);
    mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 9), std(0xcaa46a), 0, 0.56, 0, st);
    const axe = new THREE.Group(); axe.position.set(0.05, 0.58, 0); axe.rotation.set(0.15, 0.6, 1.2); st.add(axe);
    mesh(box(0.06, 0.75, 0.06), timber, 0, 0.3, 0, axe); mesh(box(0.28, 0.16, 0.04), std(0x3a3a40), 0.1, 0.62, 0, axe);
    colliders.push({ x: sx, z: sz, r: 0.5 });
  }

  // ---------- Pondok penjaga hutan ----------
  { const hx = 108, hz = 69.5, hw = 4.2, hd = 3.4, yaw = Math.atan2(CAMP_FIRE.x - hx, CAMP_FIRE.z - hz);
    const h = new THREE.Group(); h.position.set(hx, 0, hz); h.rotation.y = yaw; g.add(h);
    const wood = std(0x8a6038), roofM = std(0x5f6e34), glass = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa83a, emissiveIntensity: 0.55, roughness: 0.6 });
    mesh(box(hw + 0.3, 0.3, hd + 0.3), stoneMat, 0, 0.15, 0, h);
    mesh(box(hw, 2.3, hd), wood, 0, 1.45, 0, h);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(0.2, 2.3, 0.2), timber, sx * hw / 2, 1.45, sz * hd / 2, h);
    const th = Math.atan2(1.5, hd / 2 + 0.5), L = Math.hypot(hd / 2 + 0.5, 1.5);   // atap pelana dari dua papan miring
    for (const sg of [-1, 1]) { const r = mesh(box(hw + 0.9, 0.16, L), roofM, 0, 3.35, sg * (hd / 2 + 0.5) / 2, h); r.rotation.x = sg * th; }
    const tri = new THREE.Shape(); tri.moveTo(-hd / 2, 0); tri.lineTo(hd / 2, 0); tri.lineTo(0, 1.5); tri.closePath(); // segitiga penutup sisi atap
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06).rotateY(Math.PI / 2);
    for (const sx of [-1, 1]) mesh(triGeo, wood, sx * hw / 2, 2.6, 0, h);
    mesh(box(0.95, 1.75, 0.12), std(0x5a3a22), 0, 1.18, hd / 2 + 0.04, h);       // pintu
    mesh(box(0.75, 0.75, 0.1), glass, 1.3, 1.7, hd / 2 + 0.03, h);              // jendela menyala
    mesh(box(0.5, 1.4, 0.5), stoneMat, -1.2, 3.5, -0.6, h);                      // cerobong
    for (const lx of [-0.55, 0.55]) colliders.push({ x: hx + Math.cos(yaw) * lx, z: hz - Math.sin(yaw) * lx, r: hd / 2 + 0.1 });
  }

  // ---------- Kolam ----------
  { const p = new THREE.Group(); p.position.set(POND.x, 0, POND.z); g.add(p);
    const mud = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 2.4, 32), new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1, transparent: true, alphaMap: tex.radialAlpha((POND.r + 0.8) / (POND.r + 2.4)), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mud.rotation.x = -Math.PI / 2; mud.position.y = 0.02; mud.receiveShadow = true; p.add(mud);
    const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 32), new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.07; p.add(water);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283 + R(-0.15, 0.15), s = R(0.35, 0.75), m = mesh(rockGeo, stoneMat, Math.cos(a) * (POND.r + R(0.2, 0.9)), s * 0.2, Math.sin(a) * (POND.r + R(0.2, 0.9)), p); m.scale.set(s * 1.2, s * 0.7, s); m.rotation.y = rand() * 6; }
    const pad = std(0x4f9c39);
    for (let i = 0; i < 9; i++) { const a = rand() * 6.283, d = R(0.8, POND.r - 1), m = new THREE.Mesh(new THREE.CircleGeometry(R(0.3, 0.5), 10), pad); m.rotation.x = -Math.PI / 2; m.position.set(Math.cos(a) * d, 0.085, Math.sin(a) * d); p.add(m); if (i % 3 === 0) mesh(new THREE.IcosahedronGeometry(0.1, 0), std(0xff9ac0), m.position.x, 0.12, m.position.z, p); }
    const NR = 36, reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 1.4, 4).translate(0, 0.7, 0), mat.swayMat(new THREE.MeshStandardMaterial({ color: 0x6a9a3a, roughness: 1 }), 0.1, 0.2), NR);
    for (let i = 0; i < NR; i++) { const a = rand() * 6.283, d = POND.r + R(0.3, 1.5); dummy.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); dummy.rotation.set(R(-0.12, 0.12), 0, R(-0.12, 0.12)); dummy.scale.set(1, R(0.7, 1.4), 1); dummy.updateMatrix(); reeds.setMatrixAt(i, dummy.matrix); }
    reeds.frustumCulled = false; p.add(reeds);
    colliders.push({ x: POND.x, z: POND.z, r: POND.r + 0.15 });
  }

  // ---------- Lingkaran batu kuno (batu tengah bercahaya) ----------
  const runeMat = new THREE.MeshBasicMaterial({ color: 0x66ffee, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  { const s = new THREE.Group(); s.position.set(STONES.x, 0, STONES.z); g.add(s);
    const last = TRAIL_STONES[TRAIL_STONES.length - 1], a0 = Math.atan2(last[1] - STONES.z, last[0] - STONES.x); // arah jalan masuk: bagian ini dikosongkan
    const stoneG = std(0x7d7f84, { color: 0x7d7f84 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.283; if (Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0))) < 0.45) continue;
      const h = R(2.4, 3.6), m = mesh(box(R(0.8, 1.1), h, R(0.6, 0.9)), stoneG, Math.cos(a) * STONES.r, h / 2 - 0.15, Math.sin(a) * STONES.r, s);
      m.rotation.set(R(-0.08, 0.08), -a + R(-0.2, 0.2), R(-0.08, 0.08));
      colliders.push({ x: STONES.x + Math.cos(a) * STONES.r, z: STONES.z + Math.sin(a) * STONES.r, r: 0.65 });
    }
    mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.5, 8), stoneG, 0, 0.25, 0, s);
    const rune = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.5, 40), runeMat); rune.rotation.x = -Math.PI / 2; rune.position.y = 0.05; s.add(rune);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), runeMat); orb.position.y = 1.4; s.add(orb);
    colliders.push({ x: STONES.x, z: STONES.z, r: 1.5 });
  }

  // ---------- Jamur (berkelompok) ----------
  { const NM = COARSE ? 80 : 160, capCols = [0xd83a2f, 0xd83a2f, 0xe8892a, 0xc9a56a, 0xb35cd6];
    const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.06, 0.28, 6).translate(0, 0.14, 0), std(0xe9e1c8), NM);
    const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.28, 0), std(0xffffff), NM);
    let n = 0;
    for (let tries = 0; n < NM && tries < 5000; tries++) {
      const cx = RX(), cz = RZ(); if (zoneDist(cx, cz) > -3 || Math.hypot(cx, cz) < LIMIT || dist(cx, cz, VILLAGE) < VILLAGE.radius + 2 || nearRoad(cx, cz, 1.5) || featureBlocked(cx, cz, -1)) continue;
      const k = 3 + (rand() * 3 | 0), col = capCols[(rand() * capCols.length) | 0];
      for (let i = 0; i < k && n < NM; i++, n++) {
        dummy.position.set(cx + R(-0.6, 0.6), 0, cz + R(-0.6, 0.6)); dummy.rotation.set(R(-0.15, 0.15), rand() * 6, R(-0.15, 0.15)); dummy.scale.setScalar(R(0.6, 1.5)); dummy.updateMatrix();
        stem.setMatrixAt(n, dummy.matrix); cap.setMatrixAt(n, dummy.matrix); cap.setColorAt(n, tmpC.setHex(col));
      }
    }
    stem.count = cap.count = n; stem.castShadow = cap.castShadow = false; stem.frustumCulled = cap.frustumCulled = false; g.add(stem, cap);
  }

  // ---------- Semak ----------
  { const NB = COARSE ? 125 : 270, bg = jitter(prep(new THREE.IcosahedronGeometry(0.75, 1)), 0.18).translate(0, 0.45, 0);
    const bush = new THREE.InstancedMesh(bg, std(0xffffff), NB); let n = 0;
    for (let tries = 0; n < NB && tries < NB * 10; tries++) {
      const x = RX(), z = RZ(); if (zoneDist(x, z) > -2 || Math.hypot(x, z) < LIMIT || dist(x, z, VILLAGE) < VILLAGE.radius + 2 || nearRoad(x, z, 1.8) || featureBlocked(x, z)) continue;
      dummy.position.set(x, 0, z); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(R(0.8, 1.6), R(0.7, 1.3), R(0.8, 1.6)); dummy.updateMatrix();
      bush.setMatrixAt(n, dummy.matrix); bush.setColorAt(n, tmpC.setRGB(R(0.18, 0.34), R(0.4, 0.58), R(0.16, 0.3))); n++;
    }
    bush.count = n; bush.receiveShadow = true; bush.frustumCulled = false; g.add(bush);
  }

  // ---------- Rumput tinggi / pakis di lantai hutan ----------
  { const NG = COARSE ? 2200 : 4700;
    const gm = new THREE.InstancedMesh(geo.grassGeo, mat.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.14, 0, true), NG);
    gm.receiveShadow = true; gm.frustumCulled = false; let n = 0;
    for (let tries = 0; n < NG && tries < NG * 10; tries++) {
      const x = RX(), z = RZ();
      if (zoneDist(x, z) > -1 || Math.hypot(x, z) < LIMIT * 1.04 + 1 || dist(x, z, VILLAGE) < VILLAGE.radius + 1 || nearRoad(x, z, 1.2) || featureBlocked(x, z, -1)) continue; // (dataran lama sudah punya rumput sendiri)
      dummy.position.set(x, 0, z); dummy.rotation.set(0, rand() * 6.283, 0); dummy.scale.set(R(0.9, 1.9), R(0.8, 1.9), R(0.9, 1.9)); dummy.updateMatrix();
      gm.setMatrixAt(n, dummy.matrix); gm.setColorAt(n, tmpC.setRGB(R(0.5, 0.85), R(0.7, 1.0), R(0.45, 0.8))); n++;
    }
    gm.count = n; g.add(gm);
  }

  // ---------- Batang pohon tumbang ----------
  for (let i = 0, n = 0; n < (COARSE ? 10 : 21) && i < 1500; i++) {
    const x = RX(), z = RZ(); if (zoneDist(x, z) > -4 || Math.hypot(x, z) < LIMIT || dist(x, z, VILLAGE) < VILLAGE.radius + 2 || nearRoad(x, z, 2.4) || featureBlocked(x, z)) continue;
    const len = R(2.6, 4.6), a = rand() * Math.PI; n++;
    const m = mesh(new THREE.CylinderGeometry(0.3, 0.34, len, 8).rotateZ(Math.PI / 2), logMat, x, 0.3, z); m.rotation.y = a;
    for (const k of [-len / 3, 0, len / 3]) colliders.push({ x: x + Math.cos(a) * k, z: z - Math.sin(a) * k, r: 0.38 });
  }

  // ---------- Bukit jauh di belakang hutan (tertutup kabut) ----------
  { const hillGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat = new THREE.MeshStandardMaterial({ color: 0x4f8f44, roughness: 1, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * 6.283 + R(-0.2, 0.2), d = R(150, 185), x = 190 + Math.cos(a) * d * 1.25, z = 56 + Math.sin(a) * d * 0.7;
      if (Math.hypot(x, z) < 165 || zoneDist(x, z) < 38 || cityDist(x, z) < 75) continue; // hanya di sisi yang jauh dari dataran lama & di luar hutan
      const h = new THREE.Mesh(hillGeo, hillMat), s = R(26, 42); h.scale.set(s * R(1, 1.6), R(12, 24), s); h.position.set(x, -1, z); h.rotation.y = rand() * 6; g.add(h);
    }
  }

  // ============================================================
  //  PERPANJANGAN HUTAN: sungai + jembatan, pos istirahat, lentera, hutan jamur bercahaya, Gerbang Batu Kuno
  // ============================================================
  const toWorld = (o, lx, lz, yaw) => ({ x: o.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z: o.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz }); // titik lokal -> dunia
  const textTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const strip = (pts, w, y) => { // pita datar mengikuti titik-titik (untuk air & tepi lumpur)
    const pos = [], nor = [], uv = [], idx = []; let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (i) len += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      pos.push(p.x - dz * w / 2, y, p.z + dx * w / 2, p.x + dz * w / 2, y, p.z - dx * w / 2); nor.push(0, 1, 0, 0, 1, 0); uv.push(0, len / 6, 1, len / 6);
      if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geom.setIndex(idx); return geom;
  };
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb040, emissiveIntensity: 1.3 });
  const woodA = std(0x8a6038), woodB = std(0x7a5430);
  const lampPost = (x, z) => { mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.5, 6), timber, x, 1.25, z); mesh(box(0.3, 0.38, 0.3), lanternMat, x, 2.65, z); mesh(box(0.42, 0.08, 0.42), timber, x, 2.88, z); colliders.push({ x, z, r: 0.2 }); };

  // ---------- Sungai dangkal (airnya mengalir pelan) ----------
  const waterTex = textTex(128, 128, (x, w, h) => {
    x.fillStyle = '#2f7391'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 28; i++) { const px = Math.random() * w, py = Math.random() * h, l = 10 + Math.random() * 24; x.strokeStyle = `rgba(205,238,250,${0.14 + Math.random() * 0.22})`; x.lineWidth = 1.5;
      for (const oy of [-h, 0, h]) { x.beginPath(); x.moveTo(px, py + oy); x.lineTo(px + (Math.random() - 0.5) * 3, py + oy + l); x.stroke(); } }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  { const mud = new THREE.Mesh(strip(streamPts, STREAM_W + 1.4, 0.025), new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); mud.receiveShadow = true; g.add(mud);
    const water = new THREE.Mesh(strip(streamPts, STREAM_W, 0.055), new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 })); water.receiveShadow = true; g.add(water);
    // batu-batu di tepi sungai (dilewati dekat jembatan) + batu besar di ujung aliran
    const nB = streamPts.length, bankRocks = new THREE.InstancedMesh(rockGeo, stoneMat, nB * 2); let rn = 0;
    streamPts.forEach((p, i) => {
      if (Math.hypot(p.x - BRIDGE.x, p.z - BRIDGE.z) < 5.5) return;
      const q = streamPts[Math.min(nB - 1, i + 1)], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
      for (const sd of [-1, 1]) { if (rand() < 0.35) continue; const off = STREAM_W / 2 + R(0.2, 0.9), s = R(0.22, 0.5);
        dummy.position.set(p.x - dz / l * sd * off, s * 0.18, p.z + dx / l * sd * off); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(s * 1.3, s * 0.7, s); dummy.updateMatrix(); bankRocks.setMatrixAt(rn++, dummy.matrix); }
    });
    bankRocks.count = rn; bankRocks.castShadow = false; bankRocks.receiveShadow = true; bankRocks.frustumCulled = false; g.add(bankRocks);
    for (const e of [streamPts[0], streamPts[nB - 1]]) for (let i = 0; i < 4; i++) { const s = R(0.8, 1.5), m = mesh(rockGeo, stoneMat, e.x + R(-2, 2), s * 0.3, e.z + R(-2, 2)); m.scale.set(s, s * 0.8, s); m.rotation.y = rand() * 6; colliders.push({ x: m.position.x, z: m.position.z, r: s * 0.8 }); }
  }

  // ---------- Jembatan papan di atas sungai ----------
  { const b = new THREE.Group(); b.position.set(BRIDGE.x, 0, BRIDGE.z); b.rotation.y = BRIDGE.yaw; g.add(b);
    const L = BRIDGE.len, W = 2.9, plank = box(W, 0.07, 0.42), nP = Math.round(L / 0.46);
    for (let i = 0; i < nP; i++) mesh(plank, i % 2 ? woodA : woodB, 0, 0.06, -L / 2 + 0.23 + i * 0.46, b);
    for (const sx of [-1, 1]) {
      const rx = sx * (W / 2 + 0.1);
      mesh(box(0.14, 0.14, L + 0.2), timber, rx, 0.95, 0, b); mesh(box(0.1, 0.1, L + 0.2), timber, rx, 0.55, 0, b);
      for (let i = 0; i <= 5; i++) mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.05, 6), timber, rx, 0.52, -L / 2 + i * L / 5, b);
      for (let lz = -L / 2; lz <= L / 2 + 0.01; lz += 0.5) colliders.push({ ...toWorld(BRIDGE, rx, lz, BRIDGE.yaw), r: 0.24 }); // pagar jembatan: tidak bisa lompat ke sungai dari jembatan
    }
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.1, 0.11, 1.5, 6), timber, sx * (W / 2 + 0.1), 0.75, sz * (L / 2 + 0.1), b);
  }

  // ---------- Pos istirahat: papan penunjuk, bangku, lentera ----------
  { const sg = REST_STOP.sign, s = new THREE.Group(); s.position.set(sg.x, 0, sg.z); s.rotation.y = sg.yaw; g.add(s);
    mesh(box(0.22, 2.9, 0.22), timber, 0, 1.45, 0, s);
    const board = (text, y, col) => { const t = textTex(512, 112, (x, w, h) => { x.fillStyle = '#6f4d2a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(40,25,10,${Math.random() * 0.22})`; x.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2); }
        x.strokeStyle = '#3a2412'; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8); x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; let f = 52; x.font = `bold ${f}px Georgia`; while (x.measureText(text).width > w - 40) x.font = `bold ${f -= 2}px Georgia`; x.fillText(text, w / 2, h / 2 + 3); });
      mesh(box(2.3, 0.5, 0.08), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), 0, y, 0.15, s); };
    board('◀ Desa Padang Hijau', 2.45, '#e9d9a8'); board(CITY.open ? CITY.name + ' ▶' : 'Gerbang Batu Kuno ▶', 1.85, '#9fe8d8'); board('Pos Istirahat', 1.25, '#e9d9a8');
    colliders.push({ x: sg.x, z: sg.z, r: 0.3 });
    const bn = REST_STOP.bench, bg = new THREE.Group(); bg.position.set(bn.x, 0, bn.z); bg.rotation.y = bn.yaw; g.add(bg);
    mesh(box(1.9, 0.12, 0.55), woodA, 0, 0.5, 0, bg); mesh(box(1.9, 0.5, 0.1), woodB, 0, 0.9, -0.25, bg);
    for (const sx of [-0.8, 0.8]) mesh(box(0.12, 0.5, 0.5), timber, sx, 0.25, 0, bg);
    for (const k of [-0.6, 0.6]) colliders.push({ ...toWorld(bn, k, 0, bn.yaw), r: 0.45 });
    lampPost(REST_STOP.lamp.x, REST_STOP.lamp.z);
  }

  // ---------- Lentera di tepi jalan (penanda arah, bergantian kiri-kanan) ----------
  { const rc = new THREE.CatmullRomCurve3(FOREST_ROAD_2.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    for (let i = 1; i <= 9; i++) { const u = i / 10, p = rc.getPointAt(u), q = rc.getPointAt(Math.min(1, u + 0.01)), dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, sd = i % 2 ? 1 : -1;
      const x = p.x - dz / l * sd * 2.3, z = p.z + dx / l * sd * 2.3;
      if (Math.hypot(x - REST_STOP.lamp.x, z - REST_STOP.lamp.z) < 14 || Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < 8) continue; // jangan menumpuk dengan pos istirahat / jembatan
      lampPost(x, z); }
  }

  // ---------- Hutan jamur bercahaya ----------
  const glowCaps = [];
  { const gg = new THREE.Group(); gg.position.set(GROVE.x, 0, GROVE.z); g.add(gg);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(GROVE.r + 1.5, 32), new THREE.MeshBasicMaterial({ color: 0x55ffd0, transparent: true, opacity: 0.22, alphaMap: tex.radialAlpha(0.1), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; gg.add(glow);
    const palette = [[0x38f5c8, 0x14b894], [0xb06bff, 0x7a35d6], [0x5ec8ff, 0x2a8fd0]], stemM = std(0xe6e0d0);
    for (let i = 0, n = 0; n < 17 && i < 400; i++) {
      const a = rand() * 6.283, d = R(1.8, GROVE.r - 0.3), lx = Math.cos(a) * d, lz = Math.sin(a) * d, wx = GROVE.x + lx, wz = GROVE.z + lz;
      if (TRAIL_GROVE.some(([tx, tz]) => Math.hypot(wx - tx, wz - tz) < 2.1)) continue;
      const [col, em] = palette[n % 3], sc = R(0.7, 2.0); n++;
      const capM = new THREE.MeshStandardMaterial({ color: col, emissive: em, emissiveIntensity: 1.4, roughness: 0.6, flatShading: true }); glowCaps.push({ m: capM, ph: rand() * 6.283, base: R(1.0, 1.6) });
      const m = new THREE.Group(); m.position.set(lx, 0, lz); m.scale.setScalar(sc); m.rotation.set(R(-0.1, 0.1), rand() * 6, R(-0.1, 0.1)); gg.add(m);
      mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.7, 7), stemM, 0, 0.35, 0, m);
      mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capM, 0, 0.68, 0, m).castShadow = false;
      if (sc > 1.3) colliders.push({ x: wx, z: wz, r: 0.18 * sc });
    }
  }

  // ---------- Gerbang Batu Kuno (tersegel) di ujung hutan ----------
  const AG = ANCIENT_GATE, gateFlames = [];
  const gateGlow = new THREE.MeshBasicMaterial({ color: 0x66ffee, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const portalMat = new THREE.MeshBasicMaterial({ color: 0x44e8d4, transparent: true, opacity: 0.3, alphaMap: tex.radialAlpha(0.15), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  { const s = new THREE.Group(); s.position.set(AG.x, 0, AG.z); s.rotation.y = AG.yaw; g.add(s);
    const rock = std(0x6c6e73), rock2 = std(0x7d7f84), moss = std(0x4e7a3a);
    for (const sx of [-1, 1]) {
      const px = sx * 3.4;
      mesh(box(2.1, 0.7, 2.1), rock2, px, 0.35, 0, s); mesh(box(1.6, 6.6, 1.6), rock, px, 3.9, 0, s); mesh(box(2.0, 0.55, 2.0), rock2, px, 7.4, 0, s);
      for (const fz of [-1, 1]) { mesh(box(0.14, 3.6, 0.05), gateGlow, px, 3.9, fz * 0.83, s); for (const ry of [2.0, 3.2, 4.4, 5.6]) mesh(box(0.7, 0.12, 0.05), gateGlow, px, ry, fz * 0.83, s); } // ukiran rune
      mesh(box(1.1, 0.7, 0.1), moss, px, 1.0, 0.82, s); mesh(box(0.9, 0.5, 0.1), moss, px + 0.2, 6.8, -0.82, s);
      colliders.push({ ...toWorld(AG, px, 0, AG.yaw), r: 1.15 });
      const bx = sx * 5.6, bz = 1.4, bw = new THREE.Group(); bw.position.set(bx, 0, bz); s.add(bw); // pembakaran api di kedua sisi
      mesh(new THREE.CylinderGeometry(0.5, 0.35, 0.8, 8), rock2, 0, 0.4, 0, bw);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 7), new THREE.MeshBasicMaterial({ color: 0x66ffee, transparent: true, opacity: 0.85, fog: false })); fl.position.y = 1.15; bw.add(fl); gateFlames.push(fl);
      colliders.push({ ...toWorld(AG, bx, bz, AG.yaw), r: 0.55 });
    }
    mesh(box(9.6, 1.2, 1.9), rock, 0, 8.2, 0, s); mesh(box(2.2, 1.0, 2.0), rock2, 0, 9.3, 0, s); mesh(box(5.0, 0.12, 0.05), gateGlow, 0, 8.2, 0.97, s);
    if (!CITY.open) { const portal = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 7.6), portalMat); portal.position.y = 3.9; s.add(portal); }   // selubung segel (hilang kalau gerbang terbuka)
    if (!CITY.open) for (let x = -2.8; x <= 2.81; x += 0.7) colliders.push({ ...toWorld(AG, x, 0, AG.yaw), r: 0.5 }); // segel: bagian tengah gerbang tertutup
    for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) { // tembok reruntuhan di kiri-kanan gerbang
      const h = Math.max(0.5, 2.3 - i * 0.2 + R(-0.5, 0.4)), lx = sx * (5.0 + i * 1.05);
      const m = mesh(box(1.15, h, R(0.9, 1.3)), i % 2 ? rock : rock2, lx, h / 2, R(-0.1, 0.1), s); m.rotation.set(R(-0.05, 0.05), R(-0.12, 0.12), R(-0.06, 0.06));
      if (i % 3 === 1) mesh(box(1.0, 0.18, 1.0), moss, lx, h + 0.05, 0, s);
      colliders.push({ ...toWorld(AG, lx, 0, AG.yaw), r: 0.72 });
    }
    // prasasti di depan gerbang
    const tab = textTex(256, 256, (x, w, h) => { x.fillStyle = '#7d7f84'; x.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      x.fillStyle = '#25322f'; x.textAlign = 'center'; x.font = 'bold 34px Georgia'; (CITY.open ? ['GERBANG', 'KUNO', '—', 'Menuju', CITY.name] : ['GERBANG', 'TERSEGEL', '—', 'Belum tiba', 'saatnya']).forEach((t, i) => x.fillText(t, w / 2, 62 + i * 44)); });
    const tb = mesh(box(1.8, 2.0, 0.3), new THREE.MeshStandardMaterial({ map: tab, roughness: 1, flatShading: true }), -3.4, 1.0, -4.4, s); tb.rotation.y = 0.5; tb.rotation.z = 0.04; // di samping jalan, menghadap pengunjung
    colliders.push({ ...toWorld(AG, -3.4, -4.4, AG.yaw), r: 0.85 });
  }

  // ---------- Butiran cahaya melayang (di sekitar jalan setapak) ----------
  const NF = COARSE ? 75 : 170, fPos = new Float32Array(NF * 3), fCol = new Float32Array(NF * 3), fBase = [];
  for (let i = 0; i < NF; i++) { const p = roadPts[(rand() * roadPts.length) | 0]; fBase.push({ x: p.x + R(-7, 7), y: R(0.6, 3.2), z: p.z + R(-7, 7), ph: rand() * 6.283 }); }
  const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  const motes = new THREE.Points(fGeo, new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  motes.frustumCulled = false; g.add(motes);

  // ---------- Tempat rahasia centaur: tanah berlumut, lingkaran batu berdiri & rune bercahaya, partikel melayang ----------
  const SG = SECRET_GLADE, sec = new THREE.Group(); sec.position.set(SG.x, 0, SG.z); g.add(sec);
  const secRune = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  { const moss = new THREE.Mesh(new THREE.CircleGeometry(SG.r + 1.5, 40), new THREE.MeshStandardMaterial({ color: 0x2e6b3a, roughness: 1, transparent: true, opacity: 0.92, alphaMap: tex.radialAlpha(0.7), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    moss.rotation.x = -Math.PI / 2; moss.position.y = 0.014; moss.receiveShadow = true; sec.add(moss);
    for (const [r0, r1] of [[3.5, 3.66], [2.2, 2.3], [5.2, 5.28]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), secRune); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; sec.add(ring); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, ln = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.3), secRune); ln.rotation.x = -Math.PI / 2; ln.rotation.z = -a; ln.position.set(Math.sin(a) * 2.85, 0.03, Math.cos(a) * 2.85); sec.add(ln); } // garis rune antar cincin
    const mossy = std(0x6c7a68), SN = 7;
    for (let i = 0; i < SN; i++) {                                              // batu berdiri melingkar (ada celah, jadi bisa dimasuki dari mana saja)
      const a = (i / SN) * Math.PI * 2 + R(-0.12, 0.12), rr = SG.r - 1.6, h = R(2.2, 3.4), x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      const st = mesh(box(0.95, h, 0.55), mossy, x, h / 2 - 0.1, z, sec); st.rotation.y = a + R(-0.15, 0.15); st.rotation.z = R(-0.07, 0.07);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.9), secRune); gl.position.set(0, h * 0.1, -0.285); gl.rotation.y = Math.PI; st.add(gl);    // rune di sisi dalam batu
      colliders.push({ x: SG.x + x, z: SG.z + z, r: 0.6 });
    }
  }
  const secLight = new THREE.PointLight(0x7fd8ff, 6, 18, 2); secLight.position.set(0, 3.6, 0); sec.add(secLight);
  const NM = COARSE ? 28 : 50, moteG = new THREE.BufferGeometry(), motePos = new Float32Array(NM * 3), moteSeed = Array.from({ length: NM }, () => ({ a: rand() * 6.283, r: R(1.5, SG.r - 2), s: R(0.15, 0.4), p: rand() * 10 }));
  moteG.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  sec.add(Object.assign(new THREE.Points(moteG, new THREE.PointsMaterial({ color: 0xaff2ff, size: 0.16, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })), { frustumCulled: false }));

  return {
    group: g,
    update(t) {
      secRune.opacity = 0.5 + Math.sin(t * 1.3) * 0.2; secLight.intensity = 5.5 + Math.sin(t * 1.3 + 1) * 1.2; // rune berdenyut pelan
      for (let i = 0; i < NM; i++) { const m = moteSeed[i], a = m.a + t * m.s * 0.3; motePos[i * 3] = Math.sin(a) * m.r; motePos[i * 3 + 1] = 0.4 + ((t * m.s + m.p) % 4); motePos[i * 3 + 2] = Math.cos(a) * m.r; }
      moteG.attributes.position.needsUpdate = true;
      const f = 1 + Math.sin(t * 11) * 0.12 + Math.sin(t * 17.3) * 0.08; // api unggun berkedip
      flame.scale.set(1 + Math.sin(t * 9) * 0.1, f, 1 + Math.cos(t * 8) * 0.1); flame2.scale.y = 1 + Math.sin(t * 13 + 1) * 0.18;
      fireLight.intensity = 7 + Math.sin(t * 9) * 1.3 + Math.sin(t * 23) * 0.8;
      runeMat.opacity = 0.42 + Math.sin(t * 1.6) * 0.16; // batu kuno berdenyut
      for (let i = 0; i < NF; i++) {
        const b = fBase[i], v = Math.pow(Math.max(0, Math.sin(t * 1.3 + b.ph * 3)), 2) * 0.9 + 0.1;
        fPos[i * 3] = b.x + Math.sin(t * 0.37 + b.ph) * 1.2; fPos[i * 3 + 1] = b.y + Math.sin(t * 0.9 + b.ph) * 0.35; fPos[i * 3 + 2] = b.z + Math.cos(t * 0.31 + b.ph * 1.3) * 1.2;
        fCol[i * 3] = 1.0 * v; fCol[i * 3 + 1] = 0.93 * v; fCol[i * 3 + 2] = 0.6 * v;
      }
      fGeo.attributes.position.needsUpdate = true; fGeo.attributes.color.needsUpdate = true;
      waterTex.offset.y = -t * 0.1;                                                          // sungai mengalir
      for (const c of glowCaps) c.m.emissiveIntensity = c.base + Math.sin(t * 1.4 + c.ph) * 0.5; // jamur berdenyut
      gateGlow.opacity = 0.42 + Math.sin(t * 1.5) * 0.16; portalMat.opacity = 0.26 + Math.sin(t * 0.9) * 0.08; // gerbang & selubungnya
      gateFlames.forEach((f, i) => f.scale.set(1 + Math.sin(t * 8 + i) * 0.1, 1 + Math.sin(t * 10.5 + i * 2) * 0.22, 1));
    },
  };
}
