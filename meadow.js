import * as THREE from 'three';
import { cityDist } from './city-layout.js';
import { buildDusun } from './dusun.js';
import { DUSUN, D_CLEAR } from './meadow-village-layout.js';
import { IMPERIAL, PERBATASAN, MEADOW_PTS, MEADOW_LEN, MEADOW_CIRCLES, MEADOW_SEG_X, MEADOW_SPOTS, RIVER, RIVER_PTS, RIVER_BRIDGE, RUINS, riverEdge, meadowDist, ruinsDist, roadAt } from './meadow-layout.js';
import { buildRuinsGen } from './ruins.js';
import { SAWAH, SAWAH_LEN, sawahDist } from './sawah-layout.js';

// ============================================================
//  Membangun satu BAGIAN Padang Rumput Arunika (dipanggil dari world.js, satu chunk per bagian — lihat MEADOW_SEG_X).
//  Isinya: bercak warna tanah, jalan tanah berkelok, ribuan rumput tinggi yang bergoyang, ladang bunga, sabuk pohon di tepi padang,
//  rumpun pohon & pohon tunggal, semak, batu, bukit jauh, kolam, Sungai Bening + jembatan kayunya (di bagian yang memuat titik silang sungai),
//  papan petunjuk jarak, pos istirahat, dan (di bagian terakhir) gerbang perbatasan kayu yang sudah terbuka menuju Ladang Sawah Gemah Ripah (sawah.js).
//  RAHASIA: di ujung hilir Sungai Bening ada Reruntuhan Kuno (ruins.js) yang hanya bisa ditemukan dengan menyusuri sungai ke selatan, lewat celah di sabuk pohon.
//  Generator: tiap `yield` = titik berhenti (ChunkManager melanjutkannya di frame berikutnya, jadi tidak ada frame yang tersendat).
//  Objek-objek banyak dibagi per "petak" (InstancedMesh per sel) supaya kamera hanya menggambar yang terlihat.
// ============================================================
export function* buildMeadowGen(o) {
  const { seg, colliders, rand, COARSE, geo, mat, tex, ribbon, jitter, prep } = o;
  const X0 = MEADOW_SEG_X[seg], X1 = MEADOW_SEG_X[seg + 1], LEN_F = (X1 - X0) / 250;   // LEN_F: skala jumlah benda terhadap panjang bagian
  const R = (a, b) => a + rand() * (b - a);
  const group = new THREE.Group(); group.name = 'padang-' + (seg + 1);
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const k = new THREE.Mesh(g, m); k.position.set(x, y, z); k.castShadow = k.receiveShadow = true; parent.add(k); return k; };
  const inSeg = x => x >= X0 && x < X1;

  // batas kotak area jelajah di bagian ini (+ margin untuk sabuk pohon)
  let zmin = Infinity, zmax = -Infinity;
  for (const c of MEADOW_CIRCLES) if (c.x + c.r > X0 - 30 && c.x - c.r < X1 + 30) { zmin = Math.min(zmin, c.z - c.r - 30); zmax = Math.max(zmax, c.z + c.r + 30); }
  const RX = () => R(X0, X1), RZ = () => R(zmin, zmax);
  // jalan di sekitar bagian ini (titik rapat) — jarak ke jalan
  const rpts = MEADOW_PTS.filter(p => p.x > X0 - 70 && p.x < X1 + 70);
  const roadD = (x, z) => { let m = 1e9; for (let i = 0; i < rpts.length; i++) { const d = Math.hypot(x - rpts[i].x, z - rpts[i].z); if (d < m) m = d; } return m; };
  const side = (s, sd, off) => { const p = roadAt(s); return { x: p.x - p.tz * sd * off, z: p.z + p.tx * sd * off, tx: p.tx, tz: p.tz, s }; };   // titik di samping jalan (sd = -1 utara/kiri, +1 selatan/kanan)

  // tempat khusus yang bebas dari rumput tinggi / pohon (x, z, r)
  const features = [];
  const restP = MEADOW_SPOTS.rest; features.push({ x: restP.x, z: restP.z, r: 10 });
  for (const f of D_CLEAR) features.push(f);                                          // Dusun Ilalang + jalan masukannya bebas rumput / pohon / bunga / batu
  const ponds = MEADOW_SPOTS.ponds.map(d => { const p = side(d.s, d.side, d.off); return { ...p, r: d.r }; });
  for (const p of ponds) features.push({ x: p.x, z: p.z, r: p.r + 4.5 });
  const nearFeature = (x, z, pad = 0) => { for (const f of features) if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return true; if (x > IMPERIAL.x - 90 && sawahDist(x, z) < pad + 4) return true; return riverEdge(x, z) < pad + RIVER.mud + 1; };   // sungai + tepi lumpurnya juga tempat khusus; mulut Ladang Sawah di balik gerbang padang juga bebas pohon / rumput
  // pagar perbatasan (garis tegak lurus jalan): koordinat (a: sepanjang jalan, b: menyamping)
  const PB = PERBATASAN, pbn = { x: -PB.tz, z: PB.tx }, pbHas = IMPERIAL.open ? false : true;
  const pbAB = (x, z) => ({ a: (x - PB.x) * PB.tx + (z - PB.z) * PB.tz, b: (x - PB.x) * pbn.x + (z - PB.z) * pbn.z });
  const onFence = (x, z, pad) => { if (!pbHas) return false; const { a, b } = pbAB(x, z); return Math.abs(a) < pad && Math.abs(b) < PB.half + 2; };
  const outsideCity = (x, z) => cityDist(x, z) > 5;                                    // di luar jalan/tembok kota

  // ---------- 1) Bercak warna tanah (supaya hamparan tidak terlihat seragam) ----------
  { const alpha = tex.radialAlpha(0.25), pm = (c, op) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: op, alphaMap: alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mats = [pm(0x3f8a30, 0.5), pm(0x7ec04a, 0.5), pm(0x5aa03a, 0.5), pm(0xb2c85c, 0.34)], lists = [[], [], [], []], pg = new THREE.CircleGeometry(1, 24);
    const N = Math.round((COARSE ? 34 : 64) * LEN_F);
    for (let i = 0, n = 0; n < N && i < N * 12; i++) {
      if (i % 350 === 0 && i) yield;
      const x = RX(), z = RZ(); if (meadowDist(x, z) > 4 || !outsideCity(x, z)) continue;
      const s = R(7, 22); dummy.position.set(x, 0.011 + (n % 4) * 0.0008, z); dummy.rotation.set(-Math.PI / 2, 0, rand() * 3); dummy.scale.set(s, s * R(0.55, 1), 1); dummy.updateMatrix();
      lists[n % 4].push(dummy.matrix.clone()); n++;
    }
    lists.forEach((l, k) => { if (!l.length) return; const im = new THREE.InstancedMesh(pg, mats[k], l.length); l.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; group.add(im); });
  }
  yield;

  // ---------- 2) Jalan tanah berkelok + tepi jalan yang terinjak + kerikil ----------
  { let i0 = -1, i1 = -1; MEADOW_PTS.forEach((p, i) => { if (p.x >= X0 && p.x <= X1) { if (i0 < 0) i0 = i; i1 = i; } });
    if (i0 >= 0) {
      i0 = Math.max(0, i0 - (seg ? 1 : 0)); i1 = Math.min(MEADOW_PTS.length - 1, i1 + 1);
      const pts = MEADOW_PTS.slice(i0, i1 + 1);
      const rm = (map, extra) => new THREE.MeshStandardMaterial({ map, roughness: 1, transparent: true, alphaMap: tex.edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra });
      const verge = mesh(ribbon(pts, 8.4, 3.2), rm(null, { color: 0x8c8a48, opacity: 0.45 }), 0, 0.012, 0); verge.castShadow = false;   // tepi rumput terinjak
      const road = mesh(ribbon(pts, 4.6, 3.2), rm(tex.dirt), 0, 0.017, 0); road.castShadow = false;
      // kerikil kecil di tepi jalan
      const pebG = jitter(prep(new THREE.DodecahedronGeometry(1, 0)), 0.2), pebN = Math.round((COARSE ? 70 : 150) * LEN_F);
      const peb = new THREE.InstancedMesh(pebG, std(0x8d8a85), pebN); let pn = 0;
      for (let k = 0; k < pebN * 3 && pn < pebN; k++) {
        const p = pts[(rand() * (pts.length - 1)) | 0], q = pts[Math.min(pts.length - 1, (pts.indexOf(p)) + 1)], l = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = -(q.z - p.z) / l, nz = (q.x - p.x) / l, off = R(-3.4, 3.4);
        if (Math.abs(off) < 1.5 || riverEdge(p.x + nx * off, p.z + nz * off) < 1.5) continue;   // kerikil jangan menyembul di air sungai
        const sc = R(0.07, 0.2); dummy.position.set(p.x + nx * off, sc * 0.3, p.z + nz * off); dummy.rotation.set(R(0, 3), R(0, 6), R(0, 3)); dummy.scale.set(sc * R(1, 1.5), sc * 0.6, sc * R(1, 1.5)); dummy.updateMatrix();
        peb.setMatrixAt(pn, dummy.matrix); const g = R(0.7, 1.15); peb.setColorAt(pn, tmpC.setRGB(g, g, g * 0.97)); pn++;
      }
      peb.count = pn; peb.receiveShadow = true; peb.frustumCulled = false; group.add(peb);
    }
  }
  yield;

  // ---------- 3) Rumput tinggi (satu InstancedMesh per petak 40 m: kamera hanya menggambar yang terlihat) ----------
  { const grassMat = mat.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.15, 0, true);
    const CELL = 40, cells = new Map(), N = Math.round((COARSE ? 5600 : 11500) * LEN_F);
    for (let i = 0, n = 0; n < N && i < N * 5; i++) {
      if (i % 350 === 0 && i) yield;   // jeda: sampling ribuan titik tidak boleh menahan satu frame pun
      const x = RX(), z = RZ(); if (meadowDist(x, z) > -1.2 || !outsideCity(x, z)) continue;
      const rd = roadD(x, z); if (rd < 1.9 || nearFeature(x, z, 0.5) || onFence(x, z, 2.6)) continue;
      const trample = rd < 4 ? 0.5 + 0.5 * (rd - 1.9) / 2.1 : 1;                               // dekat jalan: rumput lebih pendek
      const warm = Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 + 0.4) > 0.3 ? 1 : 0;        // sebagian hamparan lebih kekuningan
      const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); let c = cells.get(k); if (!c) cells.set(k, c = []);
      c.push({ x, z, sx: R(0.9, 1.9), sy: R(0.8, 1.5) * trample, a: rand() * 6.283, r: R(0.75, 1.1) * (warm ? 1.2 : 1), g: R(0.85, 1.12) * (warm ? 1.0 : 1), b: R(0.7, 1.0) * (warm ? 0.8 : 1) }); n++;
    }
    let cn = 0;
    for (const c of cells.values()) {
      const im = new THREE.InstancedMesh(geo.grassGeo, grassMat, c.length);
      c.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.set(t.sx, t.sy, t.sx); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.setRGB(t.r, t.g, t.b)); });
      im.receiveShadow = true; group.add(im); if ((++cn % 2) === 0) yield;
    }
  }
  yield;

  // ---------- 4) Ladang bunga (rumpun berwarna) ----------
  { const NF = Math.round((COARSE ? 300 : 700) * LEN_F), cols = [0xffffff, 0xffd93b, 0xff7aa8, 0xb48cff, 0xff6b4a, 0x6ec6ff];
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.018, 0.4, 4).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ color: 0x3f8a2a, roughness: 1 }), NF);
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0).translate(0, 0.42, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), NF);
    let n = 0;
    const put = (x, z, col) => {
      if (n >= NF) return; const sc = R(1.3, 2.4);
      dummy.position.set(x, 0, z); dummy.rotation.set(R(-0.15, 0.15), 0, R(-0.15, 0.15)); dummy.scale.setScalar(sc); dummy.updateMatrix();
      stems.setMatrixAt(n, dummy.matrix); heads.setMatrixAt(n, dummy.matrix); heads.setColorAt(n, tmpC.setHex(col)); n++;
    };
    const ok = (x, z) => meadowDist(x, z) < -3 && outsideCity(x, z) && roadD(x, z) > 2.2 && !nearFeature(x, z, 0.5) && !onFence(x, z, 3);
    for (let i = 0, cl = 0; cl < Math.round(24 * LEN_F) * (COARSE ? 0.6 : 1) && i < 400; i++) {   // rumpun
      const cx = RX(), cz = RZ(); if (!ok(cx, cz)) continue; cl++;
      const col = cols[(rand() * cols.length) | 0], m = (R(14, 28) | 0), rad = R(2, 4.2);
      for (let k = 0; k < m; k++) { const a = rand() * 6.283, d = rad * Math.sqrt(rand()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (ok(x, z)) put(x, z, rand() < 0.82 ? col : cols[(rand() * cols.length) | 0]); }
    }
    for (let i = 0; i < NF * 6 && n < NF; i++) { if (i % 350 === 0 && i) yield; const x = RX(), z = RZ(); if (ok(x, z)) put(x, z, cols[(rand() * cols.length) | 0]); }   // sisanya tersebar
    stems.count = heads.count = n; stems.frustumCulled = heads.frustumCulled = false; stems.receiveShadow = true; group.add(stems, heads);
  }
  yield;

  // ---------- 5) Pohon: sabuk di tepi padang, rumpun, pohon tunggal ----------
  const trees = [], bushes = [], tcell = 4, tgrid = new Map(), tk = (cx, cz) => (cx + 2000) * 5000 + (cz + 2000);
  const tooClose = (x, z, d) => { const cx = Math.floor(x / tcell), cz = Math.floor(z / tcell), r = Math.ceil(d / tcell);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const l = tgrid.get(tk(cx + i, cz + j)); if (l) for (const t of l) if (Math.hypot(t.x - x, t.z - z) < d) return true; } return false; };
  const addTree = (x, z, s, far, minD) => {
    if (tooClose(x, z, minD)) return false;
    const t = { x, z, s, a: rand() * 6.283, pine: rand() < (far ? 0.55 : 0.28), far }; trees.push(t);
    const k = tk(Math.floor(x / tcell), Math.floor(z / tcell)); (tgrid.get(k) || tgrid.set(k, []).get(k)).push(t);
    if (!far) colliders.push({ x, z, r: 0.34 * s }); return true;
  };
  { // sabuk pohon: 1.5 .. ±22 m di luar tepi padang (tak terjangkau pemain, jadi tanpa collider)
    const depth = COARSE ? 14 : 22, N = Math.round((COARSE ? 340 : 760) * LEN_F);
    for (let i = 0, n = 0; n < N && i < N * 14; i++) {
      const x = RX(), z = RZ(), md = meadowDist(x, z); if (md < 1.6 || md > depth) continue;
      if (!outsideCity(x, z) || onFence(x, z, 2.2) || nearFeature(x, z, 0)) continue;
      if (addTree(x, z, R(0.95, 1.6), true, md < 7 ? 3.4 : 4.4)) n++;
      if (i % 300 === 0 && i) yield;
    }
    yield;
    // rumpun & pohon tunggal di dalam padang (dengan collider)
    const free = (x, z, md, rd) => meadowDist(x, z) < -md && roadD(x, z) > rd && outsideCity(x, z) && !nearFeature(x, z, 2) && !onFence(x, z, 12);
    for (let i = 0, cl = 0; cl < Math.round((COARSE ? 6 : 12) * LEN_F) && i < 300; i++) {
      const cx = RX(), cz = RZ(); if (!free(cx, cz, 14, 10)) continue; cl++;
      const m = (R(3, 7) | 0), rad = R(3, 6);
      for (let k = 0; k < m; k++) { const a = rand() * 6.283, d = rad * Math.sqrt(rand()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (free(x, z, 5, 7)) addTree(x, z, R(0.9, 1.6), false, 3.2); }
    }
    for (let i = 0, n = 0; n < Math.round((COARSE ? 6 : 12) * LEN_F) && i < 300; i++) { const x = RX(), z = RZ(); if (free(x, z, 14, 9) && addTree(x, z, R(1.6, 2.3), false, 7)) n++; }
    // semak di sepanjang tepi dalam (3..12 m dari tepi) — tidak menutupi jalan
    for (let i = 0, n = 0; n < Math.round((COARSE ? 40 : 90) * LEN_F) && i < 2000; i++) {
      if (i % 350 === 0 && i) yield;
      const x = RX(), z = RZ(), md = meadowDist(x, z); if (md > -2.5 || md < -12 || !outsideCity(x, z) || roadD(x, z) < 8 || nearFeature(x, z, 1) || onFence(x, z, 6)) continue;
      bushes.push({ x, z, s: R(0.8, 1.7), a: rand() * 6 }); n++;
    }
  }
  yield;
  { // pohon -> InstancedMesh per petak 48 m (sama seperti pohon hutan)
    const TC = 48, cellOf = t => Math.floor(t.x / TC) + ',' + Math.floor(t.z / TC), oakM = mat.leafMat(0.03), pineM = mat.leafMat(0.02); let cn = 0;
    for (const pine of [false, true]) {
      const cells = new Map();
      for (const t of trees) if (t.pine === pine && (!t.far || ruinsDist(t.x, t.z) > 3)) { const k = cellOf(t); (cells.get(k) || cells.set(k, []).get(k)).push(t); }   // celah di sabuk pohon tempat sungai keluar ke Reruntuhan Kuno (rahasia)
      for (const l of cells.values()) {
        const trunk = new THREE.InstancedMesh(pine ? geo.trunkPine : geo.trunkOak, mat.barkMat, l.length), leaf = new THREE.InstancedMesh(pine ? geo.pineLeaf : geo.oakLeaf, pine ? pineM : oakM, l.length);
        l.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix); leaf.setMatrixAt(i, dummy.matrix);
          leaf.setColorAt(i, tmpC.setRGB(R(0.8, 1.15), R(0.88, 1.12), R(0.75, 1.1))); });
        for (const m of [trunk, leaf]) { m.castShadow = m.receiveShadow = true; group.add(m); }
        if ((++cn % 3) === 0) yield;
      }
    }
    if (bushes.length) {
      const bg = jitter(prep(new THREE.IcosahedronGeometry(1, 1)), 0.25), bm = new THREE.InstancedMesh(bg, std(0xffffff), bushes.length);
      bushes.forEach((b, i) => { dummy.position.set(b.x, 0.45 * b.s, b.z); dummy.rotation.set(0, b.a, 0); dummy.scale.set(b.s * 1.1, b.s * 0.75, b.s * 1.1); dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix);
        bm.setColorAt(i, tmpC.setHSL(R(0.25, 0.32), R(0.45, 0.6), R(0.2, 0.3))); if (b.s > 1.2) colliders.push({ x: b.x, z: b.z, r: b.s * 0.8 }); });
      bm.castShadow = bm.receiveShadow = true; group.add(bm);
    }
  }
  yield;

  // ---------- 6) Batu besar ----------
  { const rg = jitter(prep(new THREE.DodecahedronGeometry(1, 0)), 0.18), N = Math.round((COARSE ? 10 : 20) * LEN_F), rm = new THREE.InstancedMesh(rg, std(0x8a8a8e), N); let n = 0;
    for (let i = 0; i < N * 30 && n < N; i++) {
      if (i % 350 === 0 && i) yield;
      const x = RX(), z = RZ(); if (meadowDist(x, z) > -3 || !outsideCity(x, z) || roadD(x, z) < 4.5 || nearFeature(x, z, 1) || onFence(x, z, 5)) continue;
      const s = R(0.45, 1.5); dummy.position.set(x, s * 0.2, z); dummy.rotation.set(R(0, 3), R(0, 6), R(0, 3)); dummy.scale.set(s * R(1, 1.4), s * R(0.6, 0.95), s * R(1, 1.4)); dummy.updateMatrix();
      rm.setMatrixAt(n, dummy.matrix); const g = R(0.75, 1.15); rm.setColorAt(n, tmpC.setRGB(g, g, g * R(0.95, 1.05)));
      if (s > 0.8) colliders.push({ x, z, r: s * 1.0 }); n++;
    }
    rm.count = n; rm.castShadow = rm.receiveShadow = true; group.add(rm);
  }

  // ---------- 7) Bukit-bukit jauh di balik sabuk pohon (memberi kedalaman; tertutup kabut) ----------
  { const hg = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm = [std(0x5d9c4c), std(0x6aa955)];
    for (let i = 0, n = 0; n < (COARSE ? 4 : 8) && i < 120; i++) {
      const p = roadAt(R(Math.max(0, MEADOW_PTS.find(q => q.x >= X0).s), MEADOW_PTS.slice().reverse().find(q => q.x <= X1).s)), sd = rand() < 0.5 ? -1 : 1, off = R(100, 175), s = R(26, 44), sx = s * R(1, 1.6);
      const x = p.x - p.tz * sd * off, z = p.z + p.tx * sd * off; if (!inSeg(x) || meadowDist(x, z) < sx * 1.1 + 8 || cityDist(x, z) < sx * 1.1 + 12 || ruinsDist(x, z) < sx * 1.1 + 12 || (x > IMPERIAL.x - 200 && sawahDist(x, z) < sx * 1.1 + 12)) continue;
      const h = new THREE.Mesh(hg, hm[n % 2]); h.scale.set(sx, R(10, 24), s); h.position.set(x, -1, z); h.rotation.y = rand() * 6; h.receiveShadow = true; group.add(h); n++;
    }
  }
  yield;

  // ---------- 8) Kolam ----------
  for (const p of ponds) {
    if (!inSeg(p.x)) continue;
    const shore = new THREE.Mesh(new THREE.CircleGeometry(p.r + 1.5, 36).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8b7a52, roughness: 1, transparent: true, opacity: 0.85, alphaMap: tex.radialAlpha(0.7), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    shore.position.set(p.x, 0.02, p.z); shore.receiveShadow = true; group.add(shore);
    const water = new THREE.Mesh(new THREE.CircleGeometry(p.r, 36).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4aa3c8, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    water.position.set(p.x, 0.05, p.z); water.receiveShadow = true; group.add(water);
    const nc = Math.ceil(2 * Math.PI * (p.r + 0.4) / 1.5);                                  // lingkaran tabrakan di tepi air
    for (let k = 0; k < nc; k++) { const a = k / nc * 6.283; colliders.push({ x: p.x + Math.cos(a) * (p.r + 0.4), z: p.z + Math.sin(a) * (p.r + 0.4), r: 0.9 }); }
    colliders.push({ x: p.x, z: p.z, r: p.r * 0.85 });
    const rg = new THREE.CylinderGeometry(0.025, 0.03, 1.5, 4).translate(0, 0.75, 0), tg = new THREE.CylinderGeometry(0.06, 0.06, 0.28, 6).translate(0, 1.55, 0), NR = 46;
    const reeds = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0x5f8a34, roughness: 1 }), NR), tops = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0x6b4a2d, roughness: 1 }), NR);
    for (let k = 0; k < NR; k++) { const a = rand() * 6.283, d = p.r + R(-0.4, 1.1); dummy.position.set(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d); dummy.rotation.set(R(-0.12, 0.12), 0, R(-0.12, 0.12)); dummy.scale.setScalar(R(0.7, 1.3)); dummy.updateMatrix(); reeds.setMatrixAt(k, dummy.matrix); tops.setMatrixAt(k, dummy.matrix); }
    reeds.frustumCulled = tops.frustumCulled = false; group.add(reeds, tops);
    const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.4, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 1, side: THREE.DoubleSide }), 9);
    for (let k = 0; k < 9; k++) { const a = rand() * 6.283, d = Math.sqrt(rand()) * (p.r - 1); dummy.position.set(p.x + Math.cos(a) * d, 0.07, p.z + Math.sin(a) * d); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.setScalar(R(0.7, 1.3)); dummy.updateMatrix(); pads.setMatrixAt(k, dummy.matrix); }
    group.add(pads);
  }

  // ---------- 9) Papan petunjuk jarak (tiap ±125 m) ----------
  const woodMat = std(0x8b6338), timber = std(0x5b3d22), stoneMat = std(0x8d8a85), lanternMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa83a, emissiveIntensity: 0.9, roughness: 0.6, flatShading: true });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function signTex(rows, W = 512, H = 256) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#8b6338'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(60,35,15,${Math.random() * 0.22})`; x.fillRect(0, Math.random() * H, W, 1 + Math.random() * 2); }
    x.strokeStyle = '#4a2f18'; x.lineWidth = 12; x.strokeRect(6, 6, W - 12, H - 12);
    const rh = (H - 12) / rows.length; x.textBaseline = 'middle'; x.textAlign = 'left';
    rows.forEach((r, i) => {
      const cy = 6 + rh * (i + 0.5); x.fillStyle = '#f3e3bd';
      if (r.arrow) { const d = r.arrow, ax = d > 0 ? W - 62 : 62; x.beginPath(); x.moveTo(ax + 30 * d, cy); x.lineTo(ax - 14 * d, cy - 30); x.lineTo(ax - 14 * d, cy + 30); x.closePath(); x.fill(); }
      const x0 = r.arrow < 0 ? 118 : 34, tw = W - 34 - (r.arrow ? 118 : 34); let sz = r.sub ? 46 : 52;
      x.font = `bold ${sz}px Georgia`; while (x.measureText(r.text).width > tw && sz > 18) { sz -= 2; x.font = `bold ${sz}px Georgia`; }
      x.fillText(r.text, x0, r.sub ? cy - 22 : cy); if (r.sub) { x.fillStyle = '#e3c98a'; x.font = 'bold 34px Georgia'; x.fillText(r.sub, x0, cy + 26); }
      if (i < rows.length - 1) { x.fillStyle = 'rgba(60,35,15,.6)'; x.fillRect(22, 6 + rh * (i + 1) - 2, W - 44, 4); }
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  // papan menghadap titik (fx, fz); rows digambar dengan panah yang sudah dikoreksi arah baca. dir: arah menuju Kota Kekaisaran = +tangen jalan
  function signPost(x, z, fx, fz, rowsFn, scale = 1, w = 2.0, h = 1.0) {
    const yaw = Math.atan2(fx - x, fz - z), east = Math.cos(yaw) * roadAt(Math.max(0, roadDistS(x, z))).tx - Math.sin(yaw) * roadAt(Math.max(0, roadDistS(x, z))).tz > 0 ? 1 : -1;   // +1: arah ke Kekaisaran ada di sisi kanan papan
    const front = new THREE.MeshStandardMaterial({ map: signTex(rowsFn(east)), roughness: 1 });
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; g.scale.setScalar(scale); group.add(g);
    const post = mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 8), timber, 0, 1.15, 0, g);
    const board = new THREE.Mesh(box(w, h, 0.1), [woodMat, woodMat, woodMat, woodMat, front, woodMat]); board.position.set(0, 1.95, 0.08); board.castShadow = true; g.add(board);
    mesh(box(w + 0.2, 0.08, 0.16), timber, 0, 1.95 + h / 2 + 0.05, 0.08, g);
    colliders.push({ x, z, r: 0.28 });
  }
  const roadDistS = (x, z) => { let m = 1e9, s = 0; for (let i = 0; i < rpts.length; i++) { const d = Math.hypot(x - rpts[i].x, z - rpts[i].z); if (d < m) { m = d; s = rpts[i].s; } } return s; };
  { const E = MEADOW_SPOTS.signEvery;
    if (seg === 0) signPost(...(() => { const p = side(14, 1, 4.2), q = roadAt(14); return [p.x, p.z, q.x, q.z]; })(), e => [{ text: 'PADANG ARUNIKA', sub: 'Hamparan rumput ke timur', arrow: 0 }, { text: 'KOTA KEKAISARAN', sub: Math.round((MEADOW_LEN + SAWAH_LEN) / 10) * 10 + ' m', arrow: e }]);
    for (let s = E, k = 0; s < MEADOW_LEN - 60; s += E, k++) {
      const p = roadAt(s); if (!inSeg(p.x) || Math.abs(s - restP.s) < 26 || Math.abs(s - RIVER.s) < 22) continue;   // jangan di pos istirahat / jembatan
      let sd = k % 2 ? -1 : 1, q = side(s, sd, 4.0); if (nearFeature(q.x, q.z, 1)) { sd = -sd; q = side(s, sd, 4.0); }
      signPost(q.x, q.z, p.x, p.z, e => [{ text: 'KOTA KEKAISARAN', sub: Math.round((MEADOW_LEN + SAWAH_LEN - s) / 10) * 10 + ' m', arrow: e }, { text: 'KOTA ARUNIKA', sub: Math.round(s / 10) * 10 + ' m', arrow: -e }]);
    }
  }

  // ---------- 10) Pos istirahat di tengah jalan ----------
  if (inSeg(restP.x)) {
    const lamp = (x, z) => { mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.5, 6), timber, x, 1.25, z); mesh(box(0.3, 0.38, 0.3), lanternMat, x, 2.65, z).castShadow = false; mesh(box(0.42, 0.08, 0.42), timber, x, 2.88, z); colliders.push({ x, z, r: 0.22 }); };
    for (const sd of [-1, 1]) {   // dua bangku menghadap jalan
      const p = side(restP.s, sd, 4.6), yaw = Math.atan2(restP.x - p.x, restP.z - p.z), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = yaw; group.add(g);
      mesh(box(1.9, 0.12, 0.55), woodMat, 0, 0.52, 0, g); mesh(box(1.9, 0.5, 0.08), woodMat, 0, 0.9, -0.24, g);
      for (const lx of [-0.8, 0.8]) mesh(box(0.1, 0.5, 0.45), timber, lx, 0.25, 0, g);
      for (const o of [-0.6, 0.6]) colliders.push({ x: p.x + Math.cos(yaw) * o, z: p.z - Math.sin(yaw) * o, r: 0.5 });
      const l = side(restP.s + 5, sd, 6.4); lamp(l.x, l.z);
    }
    const n = side(restP.s - 6, 1, 7.5); { const barrelM = std(0x7a5230), hayM = std(0xd8b958);
      for (const [dx, dz] of [[0, 0], [0.9, 0.5]]) { mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.85, 10), barrelM, n.x + dx, 0.43, n.z + dz); colliders.push({ x: n.x + dx, z: n.z + dz, r: 0.5 }); }
      for (const [dx, dz, ry] of [[-1.8, 0.3, 0.3], [-1.9, 1.5, 1.2]]) { const b = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.95, 12), hayM, n.x + dx, 0.62, n.z + dz); b.rotation.set(Math.PI / 2, 0, ry); colliders.push({ x: n.x + dx, z: n.z + dz, r: 0.75 }); } }
    { const q = side(restP.s + 9, -1, 5.2); signPost(q.x, q.z, restP.x, restP.z, () => [{ text: 'POS ISTIRAHAT', sub: 'Duduklah, perjalanan masih jauh', arrow: 0 }], 1, 2.0, 0.55); }
  }

  // ---------- 11) Sungai Bening: air mengalir, tepi lumpur, batu & alang-alang, jembatan kayu tempat jalan tanah menyeberang ----------
  // Sungai & jembatan dibangun oleh bagian yang memuat titik-titiknya (di tata letak sekarang: satu bagian saja). Tepi air ditutup collider rapat,
  // jadi pemain/benda tak bisa masuk ke air: satu-satunya jalan ke seberang = jembatan. (Air datar di y ≈ 0,05 seperti kolam; tanah dasar tidak dilubangi.)
  let animate = null;   // dipanggil world.js tiap frame saat bagian ini tampil (air mengalir)
  { let r0 = -1, r1 = -1; RIVER_PTS.forEach((p, i) => { if (inSeg(p.x)) { if (r0 < 0) r0 = i; r1 = i; } });
    if (r0 >= 0) {
      const hw = RIVER.w / 2, BR = RIVER_BRIDGE;
      const a0 = Math.max(0, r0 - 1), a1 = Math.min(RIVER_PTS.length - 1, r1 + 1), pts = RIVER_PTS.slice(a0, a1 + 1);   // +1 titik di tiap sisi: pita antar-bagian tersambung
      const own = pts.slice(r0 - a0, r1 - a0 + 1);                                                                         // titik milik bagian ini (hiasan tepi tidak dobel di bagian tetangga)
      const bw = (lx, lz) => ({ x: BR.x + BR.tx * lz + BR.tz * lx, z: BR.z + BR.tz * lz - BR.tx * lx });                    // titik lokal jembatan (lx menyamping, lz sepanjang jalan) -> dunia
      const nearBridge = (x, z, pad) => { const dx = x - BR.x, dz = z - BR.z; return Math.abs(dx * BR.tx + dz * BR.tz) < BR.len / 2 + pad && Math.abs(dx * BR.tz - dz * BR.tx) < BR.w / 2 + pad; };
      const norm = (arr, i) => { const a = arr[Math.max(0, i - 1)], b = arr[Math.min(arr.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: -dz / l, z: dx / l }; };   // tegak lurus arah alir
      const strip = (w, y, vRep) => {   // pita datar selebar tetap mengikuti sungai (u = 0..1 melintang sungai, v = sepanjang aliran)
        const pos = [], nor = [], uv = [], idx = []; let len = 0;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          if (i) len += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
          pos.push(p.x - dz * w / 2, y, p.z + dx * w / 2, p.x + dz * w / 2, y, p.z - dx * w / 2); nor.push(0, 1, 0, 0, 1, 0); uv.push(0, len / vRep, 1, len / vRep);
          if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
      };
      const flowTex = (W, H, draw) => { const c = document.createElement('canvas'); c.width = W; c.height = H; draw(c.getContext('2d'), W, H); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
      const waterTex = flowTex(128, 256, (x, W, H) => {   // tengah sungai lebih dalam (gelap), tepinya dangkal (terang), riak memanjang searah aliran
        const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#79bfca'); g.addColorStop(0.16, '#4a98b4'); g.addColorStop(0.5, '#1f6688'); g.addColorStop(0.84, '#4a98b4'); g.addColorStop(1, '#79bfca');
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) { const px = W * (0.1 + rand() * 0.8), py = rand() * H, l = 16 + rand() * 40; x.strokeStyle = `rgba(205,236,248,${0.1 + rand() * 0.2})`; x.lineWidth = 1 + rand() * 1.5;
          for (const oy of [-H, 0, H]) { x.beginPath(); x.moveTo(px, py + oy); x.quadraticCurveTo(px + (rand() - 0.5) * 8, py + oy + l / 2, px + (rand() - 0.5) * 4, py + oy + l); x.stroke(); } }
      });
      const glintTex = flowTex(128, 256, (x, W, H) => {   // kilau putih tipis di lapisan kedua, mengalir lebih cepat dari air (memberi kesan kedalaman)
        for (let i = 0; i < 26; i++) { const px = rand() * W, py = rand() * H, l = 8 + rand() * 22; x.strokeStyle = `rgba(255,255,255,${0.35 + rand() * 0.45})`; x.lineWidth = 1 + rand() * 1.2;
          for (const oy of [-H, 0, H]) { x.beginPath(); x.moveTo(px, py + oy); x.lineTo(px + (rand() - 0.5) * 5, py + oy + l); x.stroke(); } }
      });
      // tepi lumpur (di bawah jalan: y lebih rendah dari jalan 0,017) -> air -> kilau
      const mud = mesh(ribbon(pts, RIVER.w + 2 * RIVER.mud + 1, 3.2), new THREE.MeshStandardMaterial({ map: tex.dirt, color: 0xc4b48f, roughness: 1, transparent: true, alphaMap: tex.edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0, 0.0145, 0); mud.castShadow = false;
      // air & kilau SENGAJA tanpa polygonOffset: world.js fixDecals() memajukan semua material "decal" (transparan + depthWrite:false + polygonOffset) ke urutan gambar paling awal,
      // padahal kilau harus tergambar SETELAH air. Cukup dipisah tinggi (tanah 0 < tepi lumpur 0,0145 < jalan 0,017 < air 0,055 < kilau 0,07 < daun teratai 0,085).
      const water = new THREE.Mesh(strip(RIVER.w, 0.055, 9), new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.93 }));
      water.receiveShadow = true; group.add(water);
      const glint = new THREE.Mesh(strip(RIVER.w * 0.9, 0.07, 7), new THREE.MeshStandardMaterial({ map: glintTex, roughness: 0.3, transparent: true, opacity: 0.7, depthWrite: false }));
      group.add(glint);
      animate = t => { waterTex.offset.y = -t * 0.1; glintTex.offset.y = -t * 0.22; };
      yield;

      // batu-batu kecil di tepi air
      { const rg = jitter(prep(new THREE.DodecahedronGeometry(1, 0)), 0.18), rl = [];
        own.forEach((p, i) => { const n = norm(own, i); for (const sd of [-1, 1]) { if (rand() < 0.45) continue; const off = hw + R(0.1, 1.2), x = p.x + n.x * sd * off, z = p.z + n.z * sd * off; if (!nearBridge(x, z, 1.5)) rl.push({ x, z, s: R(0.22, 0.65) }); } });
        if (rl.length) { const im = new THREE.InstancedMesh(rg, std(0x8a8a8e), rl.length);
          rl.forEach((r, i) => { dummy.position.set(r.x, r.s * 0.2, r.z); dummy.rotation.set(R(0, 3), R(0, 6), R(0, 3)); dummy.scale.set(r.s * R(1, 1.4), r.s * R(0.6, 0.95), r.s * R(1, 1.4)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); const g = R(0.75, 1.15); im.setColorAt(i, tmpC.setRGB(g, g, g * R(0.95, 1.05))); });
          im.castShadow = im.receiveShadow = true; group.add(im); }
      }
      // alang-alang (rumpun 2-4 batang) di kedua tepi
      { const rl = [];
        own.forEach((p, i) => { if (i % 2) return; const n = norm(own, i); for (const sd of [-1, 1]) { if (rand() < 0.5) continue; const k = 2 + ((rand() * 3) | 0);
          for (let j = 0; j < k; j++) { const off = hw + R(-0.5, 1.1), t = R(-0.8, 0.8), x = p.x + n.x * sd * off + n.z * t, z = p.z + n.z * sd * off - n.x * t; if (!nearBridge(x, z, 1.5)) rl.push({ x, z }); } } });
        if (rl.length) {
          const rg = new THREE.CylinderGeometry(0.025, 0.03, 1.5, 4).translate(0, 0.75, 0), tg = new THREE.CylinderGeometry(0.06, 0.06, 0.28, 6).translate(0, 1.55, 0);
          const reeds = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0x5f8a34, roughness: 1 }), rl.length), tops = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0x6b4a2d, roughness: 1 }), rl.length);
          rl.forEach((r, i) => { dummy.position.set(r.x, 0, r.z); dummy.rotation.set(R(-0.12, 0.12), 0, R(-0.12, 0.12)); dummy.scale.setScalar(R(0.7, 1.3)); dummy.updateMatrix(); reeds.setMatrixAt(i, dummy.matrix); tops.setMatrixAt(i, dummy.matrix); });
          reeds.frustumCulled = tops.frustumCulled = false; group.add(reeds, tops); }
      }
      // daun teratai
      { const pl = [];
        for (let k = 0; k < 18; k++) { const i = (rand() * own.length) | 0, n = norm(own, i), off = (rand() < 0.5 ? -1 : 1) * R(2.2, hw - 0.8), x = own[i].x + n.x * off, z = own[i].z + n.z * off; if (!nearBridge(x, z, 1.5)) pl.push({ x, z }); }
        if (pl.length) { const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 1, side: THREE.DoubleSide }), pl.length);
          pl.forEach((q, i) => { dummy.position.set(q.x, 0.085, q.z); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.setScalar(R(0.7, 1.4)); dummy.updateMatrix(); pads.setMatrixAt(i, dummy.matrix); });
          group.add(pads); }
      }
      // tabrakan di tepi air: lingkaran rapat (≤ 1,4 m) di sepanjang kedua tepi. Di sekitar jembatan dilubangi, lalu ditutup lagi oleh "sumbat" di samping pagar jembatan.
      for (const sd of [-1, 1]) {
        const line = pts.map((p, i) => { const n = norm(pts, i); return { x: p.x + n.x * sd * (hw - 0.2), z: p.z + n.z * sd * (hw - 0.2) }; });
        for (let i = 0; i < line.length; i++) {
          const a = line[i], b = line[i + 1] || a, k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.4)), last = i === line.length - 1;
          for (let j = 0; j < (last ? 1 : k); j++) { const x = a.x + (b.x - a.x) * j / k, z = a.z + (b.z - a.z) * j / k; if (!nearBridge(x, z, 0.9)) colliders.push({ x, z, r: 0.9 }); }
        }
      }
      if (inSeg(BR.x)) for (const sv of [-1, 1]) for (const sl of [-1, 1]) colliders.push({ ...bw(sv * (BR.w / 2 + 0.9), sl * (hw - 0.2)), r: 0.9 });
      yield;

      // ----- jembatan kayu (di titik silang, searah jalan): lantai papan, pagar + tiang lentera di keempat sudut -----
      if (inSeg(BR.x)) {
        const L = BR.len, W = BR.w, bg = new THREE.Group(); bg.position.set(BR.x, 0, BR.z); bg.rotation.y = BR.yaw; group.add(bg);
        const nP = Math.round(L / 0.46), planks = new THREE.InstancedMesh(box(W, 0.1, 0.42), std(0xffffff), nP);
        for (let i = 0; i < nP; i++) { dummy.position.set(0, 0.11, -L / 2 + 0.23 + i * 0.46); dummy.rotation.set(0, R(-0.012, 0.012), 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); planks.setMatrixAt(i, dummy.matrix); planks.setColorAt(i, tmpC.setHex(0x8b6338).multiplyScalar(R(0.78, 1.1))); }
        planks.castShadow = planks.receiveShadow = true; bg.add(planks);
        const postG = new THREE.CylinderGeometry(0.09, 0.11, 1.35, 6), nPost = Math.round(L / 2.2);
        for (const sx of [-1, 1]) {
          const rx = sx * (W / 2 + 0.1);
          mesh(box(0.3, 0.22, L), timber, sx * (W / 2 - 0.6), 0, 0, bg);                                                   // balok penyangga di bawah lantai
          mesh(box(0.14, 0.14, L + 0.2), timber, rx, 1.0, 0, bg); mesh(box(0.1, 0.1, L + 0.2), timber, rx, 0.58, 0, bg);    // dua palang pagar
          for (let i = 0; i <= nPost; i++) mesh(postG, timber, rx, 0.55, -L / 2 + i * L / nPost, bg);
          for (let lz = -L / 2; lz <= L / 2 + 0.01; lz += 0.5) colliders.push({ ...bw(rx, lz), r: 0.24 });                   // pagar: tidak bisa melompat ke sungai dari jembatan
          for (const sz of [-1, 1]) {                                                                                      // tiang lentera di sudut
            const lz = sz * (L / 2);
            mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.3, 6), timber, rx, 1.15, lz, bg); mesh(box(0.3, 0.38, 0.3), lanternMat, rx, 2.45, lz, bg).castShadow = false; mesh(box(0.42, 0.08, 0.42), timber, rx, 2.7, lz, bg);
          }
        }
      }
      // papan nama di sisi barat jembatan (arah datang dari kota)
      { const q = side(Math.max(0, RIVER.s - 15), 1, 4.8), p = roadAt(Math.max(0, RIVER.s - 15)); if (inSeg(q.x)) signPost(q.x, q.z, p.x, p.z, () => [{ text: RIVER.name.toUpperCase(), sub: 'Seberangi lewat jembatan kayu', arrow: 0 }], 1, 2.0, 0.55); }
    }
  }
  yield;

  // ---------- 12) Gerbang perbatasan padang -> Ladang Sawah Gemah Ripah (SUDAH TERBUKA: daun pintu terayun ke luar, celahnya bebas dilewati) ----------
  if (pbHas && inSeg(PB.x)) {
    const E = (b, a = 0) => ({ x: PB.x + PB.tx * a + pbn.x * b, z: PB.z + PB.tz * a + pbn.z * b });   // titik di garis pagar (b menyamping, a maju-mundur)
    const gateB = PB.gap + 2.0, beamYaw = Math.atan2(-pbn.z, pbn.x), logBase = std(0x6b4a2d), logVar = std(0x5b3d22);
    // pagar kayu runcing: batang tegak berjajar, kecuali di pintu & menara
    const logs = []; for (let b = -PB.half; b <= PB.half; b += 0.95) { if (Math.abs(b) < gateB + 1.9) continue; logs.push(b); }
    const lg = new THREE.CylinderGeometry(0.4, 0.45, 1, 7).translate(0, 0.5, 0), tg = new THREE.ConeGeometry(0.4, 0.9, 7).translate(0, 0.45, 0);
    const lm = new THREE.InstancedMesh(lg, logBase, logs.length), tm = new THREE.InstancedMesh(tg, logVar, logs.length);
    logs.forEach((b, i) => { const p = E(b + R(-0.05, 0.05)), H = 3.3 + 0.45 * Math.sin(b * 1.3) + R(-0.15, 0.15);
      dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(1, H, 1); dummy.updateMatrix(); lm.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, H, p.z); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); tm.setMatrixAt(i, dummy.matrix);
      const g = R(0.8, 1.15); lm.setColorAt(i, tmpC.setRGB(g, g * 0.95, g * 0.9)); });
    lm.castShadow = tm.castShadow = lm.receiveShadow = tm.receiveShadow = true; group.add(lm, tm);
    for (const sg of [-1, 1]) {   // dua balok melintang di sisi dalam (barat) pagar
      const from = gateB + 2, to = PB.half, mid = sg * (from + to) / 2, p = E(mid, -0.5);
      for (const y of [1.1, 2.3]) { const bm = mesh(box(to - from, 0.18, 0.22), timber, p.x, y, p.z); bm.rotation.y = beamYaw; } }
    // menara jaga batu di kiri-kanan pintu
    for (const sg of [-1, 1]) {
      const p = E(sg * gateB), tg2 = new THREE.Group(); tg2.position.set(p.x, 0, p.z); tg2.rotation.y = PB.yaw; group.add(tg2);
      mesh(box(3.6, 8, 3.6), stoneMat, 0, 4, 0, tg2); mesh(box(4.2, 0.4, 4.2), std(0x6f6c68), 0, 8.2, 0, tg2);
      const roof = mesh(new THREE.ConeGeometry(3.3, 3.4, 4).rotateY(Math.PI / 4), std(0x7b3b2a), 0, 10.1, 0, tg2); roof.castShadow = true;
      mesh(new THREE.ConeGeometry(0.1, 1.2, 6), std(0xe0b33a), 0, 12.4, 0, tg2);
      const wm = mesh(new THREE.PlaneGeometry(0.8, 1.6), lanternMat, 0, 5.4, -1.84, tg2); wm.rotation.y = Math.PI; wm.castShadow = false;   // jendela menyala menghadap pengelana (barat)
      const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6), timber, 1.1, 10.4, 1.1, tg2), flag = mesh(box(0.06, 1.3, 1.9), std(0xa8301f), 1.1, 11.6, 0.1, tg2); flag.castShadow = false; void pole;
    }
    // pintu gerbang ganda yang tertutup + balok atas
    for (const sg of [-1, 1]) { const p = E(sg * PB.gap, PB.gap / 2 + 0.2), d = mesh(box(PB.gap, 4.6, 0.32), std(0x4f3420), p.x, 2.3, p.z); d.rotation.y = PB.yaw + Math.PI / 2;   // daun pintu terbuka: engsel di tiang, daun memanjang ke arah ladang
      for (const y of [0.9, 2.3, 3.7]) { const band = mesh(box(PB.gap + 0.05, 0.16, 0.38), std(0x2a2220), p.x, y, p.z); band.rotation.y = PB.yaw + Math.PI / 2; } }
    { const p = E(0), lt = mesh(box(2 * gateB + 1.0, 1.0, 1.0), timber, p.x, 5.1, p.z); lt.rotation.y = beamYaw;
      const em = mesh(box(1.8, 1.0, 0.1), std(0xe0b33a), p.x - PB.tx * 0.6, 5.1, p.z - PB.tz * 0.6); em.rotation.y = PB.yaw; }
    // tabrakan: pagar & menara tetap padat, tetapi celah pintu terbuka (pemain lewat ke Ladang Sawah)
    for (let b = -PB.half; b <= PB.half; b += 1.2) { if (Math.abs(b) < PB.gap + 0.4) continue; const p = E(b); colliders.push({ x: p.x, z: p.z, r: 0.85 }); }   // celah pintu dibiarkan kosong
    for (const sg of [-1, 1]) { const p = E(sg * gateB); colliders.push({ x: p.x, z: p.z, r: 2.2 }); }
    // papan pengumuman & dua lampu di depan gerbang (sisi barat)
    { const q = { x: PB.x - PB.tx * 7 + pbn.x * 6.2, z: PB.z - PB.tz * 7 + pbn.z * 6.2 }; signPost(q.x, q.z, q.x - PB.tx * 10, q.z - PB.tz * 10, e => [{ text: SAWAH.name.toUpperCase(), sub: 'Gerbang padang telah dibuka', arrow: e }, { text: IMPERIAL.name.toUpperCase(), sub: Math.round(SAWAH_LEN / 10) * 10 + ' m', arrow: e }], 1.15, 2.4, 1.2); }
    for (const sg of [-1, 1]) { const p = E(sg * 5.2, -6); mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.5, 6), timber, p.x, 1.25, p.z); mesh(box(0.3, 0.38, 0.3), lanternMat, p.x, 2.65, p.z).castShadow = false; colliders.push({ x: p.x, z: p.z, r: 0.22 }); }
  }
  yield;

  // ---------- 13) Dusun Ilalang: desa kecil di sisi selatan jalan (bagian padang yang memuat pusat dusun) ----------
  let dusunUpd = null;
  if (inSeg(DUSUN.x)) { const d = buildDusun({ colliders, ribbon, tex }); group.add(d.group); dusunUpd = d.update; }
  yield;

  // ---------- 14) Reruntuhan Kuno (RAHASIA) di ujung hilir Sungai Bening: dibangun oleh bagian padang yang memuat pusatnya (lihat ruins.js) ----------
  let ruinsUpd = null;
  if (inSeg(RUINS.x)) { const gen = buildRuinsGen({ colliders, tex, geo, mat, COARSE }); let r; while (!(r = gen.next()).done) yield; group.add(r.value.group); ruinsUpd = r.value.update; }
  yield;

  return { group, update: (animate || dusunUpd || ruinsUpd) ? (t => { if (animate) animate(t); if (dusunUpd) dusunUpd(t); if (ruinsUpd) ruinsUpd(t); }) : null };   // update(t): animasi aliran sungai & reruntuhan (null bila bagian ini tidak memuat keduanya)
}

export function buildMeadow(opts) { const it = buildMeadowGen(opts); let r; while (!(r = it.next()).done); return r.value; }
