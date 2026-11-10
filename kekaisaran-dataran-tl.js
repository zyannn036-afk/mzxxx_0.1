import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { NE_YETI_SPOTS } from './kekaisaran-layout.js';
import { APOTHEM, NE_PLAIN, NE_MTN, NE_MTN2, NE_MTN3, NE_MTNS, neMtnRs, neMtnTrail, neMtnHAxis, neMtnH, neAxisToWorld, NE_BRIDGES, neBridgeDeckH, neBridgeLocal, NE_RIDGE, NE_RIDGE_PLAZA_T, neRidgeH, neRidgeHW, neRidgeHW0, neRidgeTop, neRidgeRoadLat, neRidgeToAxis, neRidgeLat, NE_DESC, neDescHsu, neDescToAxis, neDescDist, neDescRiverS, NE_VILLAGE, neVillageKeep, NE_DRAGON_NEST, neDragonNestKeep } from './kekaisaran-layout.js';

// ======================================================================
//  PADANG RUMPUT TIMUR LAUT — hamparan 500 m di luar Gerbang Timur Laut, Kota Kekaisaran.
//  Gaya gunung: low-poly "mesa berundak" (dataran hijau bertingkat + tebing abu-ungu + air terjun, pagar kayu, pinus, awan) & puncak bersalju berfaset.
//  Isi: jalan tanah dari gerbang sampai ujung padang, rumput, bunga liar, pohon (ek & pinus),
//  batu-batu, pegunungan di kedua sisi & di ujung padang, satu Gunung Pendakian dengan jalan setapak spiral
//  sampai puncak (tinggi tanahnya dihitung di kekaisaran-layout.js), dan papan nama. Tanah hijau dasarnya sudah dari dunia (world.js).
//  + PEGUNUNGAN NAGA: punggungan gunung memanjang (640 m) di belakang Gunung Agung dengan jalan tanah berkelok di puncaknya, pagar kayu, pinus, tebing berundak & lautan awan (lihat buildRidge di bawah; rumus tinggi di kekaisaran-layout.js).
//  + JALUR TURUN LEMBAH SALJU: dari Tanjung Pandang (ujung punggungan) jalan tanah berkelok (switchback) menuruni tebing berundak, pagar kayu, pinus bersalju, sampai lembah salju dengan sungai beku & jembatan kayu (lihat buildDescent; rumus di kekaisaran-layout.js: NE_DESC / neDescHsu).
//  + DESA SALJU HENING: desa kecil di sisi kanan lembah salju, dihubungkan jalan tanah dari jalan lembah; di luar jangkauan Yeti & Golem Es (lihat buildSnowVillage; tata letak: NE_VILLAGE di kekaisaran-layout.js).
//  Dibangun sebagai chunk 'dataran-tl' (lihat world.js); dipakai seperti kekaisaran-dataran.js.
//
//  Koordinat: d = jarak searah gerbang (dari pusat istana), off = geser ke samping sumbu padang.
//  Semua objek diletakkan langsung di koordinat dunia lewat neAxisToWorld(d, off).
// ======================================================================
// ---------- Naga Dewasa di Sarang Naga (adult_dragon.glb) ----------
//  Taruh adult_dragon.glb di folder yang sama dengan adorable_yeti_snowman.glb. Kalau gagal dimuat, sarang tetap berupa tanah bulat kosong.
//  Model bertulang dengan satu klip ('cyclewalk'); di sini hanya dipakai satu pose diam (naga bertengger di sarang), menghadap jalan masuk.
const DRAGON = { file: 'adult_dragon.glb', height: 5, scale: 1.85, face: 0, clip: 0, pose: 0, flapAmp: 0.55, flapHz: 0.9, hover: 0.35, tailSway: 0.14, neckSway: 0.12, look: 0.15, openDelay: 0.4, openTime: 1.8, talkR: 12 };
//  Animasi lewat kode (klip 'cyclewalk' hanya punya 1 keyframe): flapAmp = ayunan sayap (rad) | flapHz = kepakan per detik | hover = tinggi badan naik-turun saat mengepak (m) | tailSway / neckSway = goyang ekor / leher (rad) | look = naga menoleh pelan ke kiri-kanan (rad) | openDelay / openTime = jeda & lama sayap membuka dari lipatan (detik) | talkR = jarak (m) dari pusat sarang agar pemain bisa mengajak bicara. Sayap baru membuka & mengepak setelah pemain MENANTANG (lihat globalThis.NAGA_KUNO di bawah).   // height: tinggi naga dalam meter (diukur dari kotak pembatas model; scale = ukuran cadangan bila pengukuran gagal); face: putaran-y tambahan (radian) bila model tampak menghadap arah lain; pose: detik klip yang dibekukan
let dragonPromise = null;
const loadDragon = () => dragonPromise || (dragonPromise = new Promise(res => new GLTFLoader().load(DRAGON.file, g => res(g), undefined, err => { console.warn(DRAGON.file + ' gagal dimuat — Sarang Naga tanpa naga', err); res(null); })));
export function* buildDataranTLGen(o) {
  const { colliders, COARSE, geo, mat } = o;
  // generator acak sendiri (supaya tata letak padang selalu sama setiap kali game dibuka)
  let seed = 20261109;
  const rand = o.rand || (() => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; });
  const Rn = (a, b) => a + rand() * (b - a);

  const group = new THREE.Group(); group.name = 'dataran-tl';
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();

  const D0 = APOTHEM, D1 = APOTHEM + NE_PLAIN.len, HW = NE_PLAIN.halfW;   // gerbang di D0, ujung padang di D1
  const ROAD_HW = 3.8;                                                    // setengah lebar jalan tanah
  const inRoad = (off, pad = 0) => Math.abs(off) < ROAD_HW + pad;
  const MT = NE_MTN, MT2 = NE_MTN2, MT3 = NE_MTN3, MTS = NE_MTNS, SPUR_W = MT.W;     // dua gunung: Gunung Pendakian (kiri, side -1) & Gunung Seberang (kanan, side +1); masing-masing punya jalan cabang lurus dari jalan padang di d = M.d
  const inSpur = (d, off, pad = 0) => MTS.some(M => Math.abs(d - M.d) < SPUR_W + 1.3 + pad && (M.side < 0 ? (off < -ROAD_HW + 1 && off > M.off + M.r0 - 4) : (off > ROAD_HW - 1 && off < M.off - M.r0 + 4)));

  // titik acak di padang (di luar jalan & jauh dari gerbang), dipakai untuk semua dekorasi
  const randPoint = (dMin = D0 + 16, pad = 0) => {
    for (let i = 0; i < 20; i++) {
      const d = Rn(dMin, D1 - 6), off = Rn(-HW + 4, HW - 4);
      if (!inRoad(off, pad) && !inSpur(d, off, 1)) return { d, off };
    }
    return { d: Rn(dMin, D1 - 6), off: HW - 6 };
  };

  // ---------- Jalan tanah dari gerbang ke ujung padang ----------
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x9a8863, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  {
    const a = neAxisToWorld(D0 + 2), b = neAxisToWorld(D1 - 2), L = Math.hypot(b.x - a.x, b.z - a.z);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HW * 2, L).rotateX(-Math.PI / 2), roadMat);
    road.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2); road.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); road.receiveShadow = true;
    group.add(road);
    // batu kecil di tepi jalan
    const stoneG = new THREE.DodecahedronGeometry(0.28, 0), stoneM = new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 1, flatShading: true });
    const stones = [];
    for (let d = D0 + 8; d < D1 - 6; d += 3.2) for (const sd of [-1, 1]) if (rand() < 0.55) stones.push({ d: d + Rn(-1, 1), off: sd * (ROAD_HW + Rn(0.1, 0.9)), s: Rn(0.6, 1.4) });
    const im = new THREE.InstancedMesh(stoneG, stoneM, Math.max(1, stones.length));
    stones.forEach((q, i) => { const p = neAxisToWorld(q.d, q.off); dummy.position.set(p.x, 0.1, p.z); dummy.rotation.set(rand() * 3, rand() * 6.28, rand() * 3); dummy.scale.setScalar(q.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.count = stones.length; im.receiveShadow = true; group.add(im);
  }
  yield;

  // ---------- Rumput (kerucut kecil, warna beragam) ----------
  {
    const n = COARSE ? 900 : 2800;
    const geoG = new THREE.ConeGeometry(0.14, 0.7, 4).translate(0, 0.35, 0);
    const im = new THREE.InstancedMesh(geoG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), n);
    for (let i = 0; i < n; i++) {
      const q = randPoint(D0 + 12, 0.4), p = neAxisToWorld(q.d, q.off);
      dummy.position.set(p.x, 0, p.z); dummy.rotation.set(Rn(-0.2, 0.2), rand() * 6.28, Rn(-0.2, 0.2)); dummy.scale.set(Rn(0.8, 1.6), Rn(0.7, 1.9), Rn(0.8, 1.6)); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.setRGB(Rn(0.22, 0.38), Rn(0.55, 0.78), Rn(0.18, 0.3)));
    }
    group.add(im);
  }
  yield;

  // ---------- Bunga liar (empat warna) ----------
  {
    const n = COARSE ? 250 : 800, colors = [0xffd84a, 0xf2f2f2, 0xe86a8f, 0x9a7be8];
    const geoF = new THREE.SphereGeometry(0.13, 6, 4).translate(0, 0.45, 0);
    const im = new THREE.InstancedMesh(geoF, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), n);
    for (let i = 0; i < n; i++) {
      const q = randPoint(D0 + 12, 0.6), p = neAxisToWorld(q.d, q.off);
      dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Rn(0.8, 1.5)); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.setHex(colors[(rand() * colors.length) | 0]));
    }
    group.add(im);
  }
  yield;

  // ---------- Pohon: kelompok kecil (hutan mini) + pohon sendiri-sendiri + barisan rapat di ujung padang ----------
  {
    const oaks = [], pines = [];
    const tooClose = (list, p, r) => list.some(t => Math.hypot(t.d - p.d, t.off - p.off) < r);
    const all = () => oaks.concat(pines);
    const tryAdd = (d, off, s) => {
      if (d < D0 + 18 || d > D1 - 4 || Math.abs(off) > HW - 3 || inRoad(off, 3.5) || inSpur(d, off, 4)) return;   // tidak menutup gerbang & jalan
      const p = { d, off, s, a: rand() * 6.28 };
      if (tooClose(all(), p, 5.5 * Math.max(0.7, s))) return;
      (rand() < 0.55 ? oaks : pines).push(p);
    };
    // 5 kelompok hutan kecil, sebaran sepanjang padang (bergantian kiri / kanan jalan)
    const groves = [{ d: D0 + 90, off: -34 }, { d: D0 + 170, off: 32 }, { d: D0 + 260, off: -30 }, { d: D0 + 340, off: 36 }, { d: D0 + 430, off: -26 }];
    for (const g of groves) for (let i = 0, n = COARSE ? 10 : 22; i < n; i++) { const r = Rn(2, 20), a = rand() * 6.28; tryAdd(g.d + Math.cos(a) * r, g.off + Math.sin(a) * r, Rn(0.9, 1.5)); }
    // pohon tunggal
    for (let i = 0, n = COARSE ? 18 : 45; i < n; i++) { const q = randPoint(D0 + 24, 6); tryAdd(q.d, q.off, Rn(0.8, 1.4)); }
    // barisan rapat di dekat ujung padang, kecuali di sekitar jalan (jalan tetap terbuka)
    for (let off = -HW + 4; off <= HW - 4; off += 7) { if (inRoad(off, 6)) continue; tryAdd(D1 - Rn(6, 13), off + Rn(-2, 2), Rn(1.2, 1.7)); }

    const place = (list, trunkGeo, leafGeo, tag) => {
      const n = list.length; if (!n) return;
      const tr = new THREE.InstancedMesh(trunkGeo, mat.barkMat, n), lf = new THREE.InstancedMesh(leafGeo, mat.leafMat(0.03), n);
      list.forEach((t, i) => {
        const p = neAxisToWorld(t.d, t.off);
        dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix();
        tr.setMatrixAt(i, dummy.matrix); lf.setMatrixAt(i, dummy.matrix);
        lf.setColorAt(i, tag === 'oak' ? tmpC.setRGB(Rn(0.8, 1.1), Rn(0.9, 1.1), Rn(0.8, 1.05)) : tmpC.setRGB(Rn(0.8, 1.05), Rn(0.9, 1.1), Rn(0.85, 1.1)));
        colliders.push({ x: p.x, z: p.z, r: 0.34 * t.s });
      });
      tr.castShadow = lf.castShadow = true; tr.receiveShadow = lf.receiveShadow = true;
      group.add(tr, lf);
    };
    place(oaks, geo.trunkOak, geo.oakLeaf, 'oak');
    place(pines, geo.trunkPine, geo.pineLeaf, 'pine');
  }
  yield;

  // ---------- Batu besar (dengan tabrakan) ----------
  {
    const n = COARSE ? 8 : 18, list = [];
    for (let i = 0; i < n; i++) { const q = randPoint(D0 + 30, 6); list.push({ ...q, s: Rn(0.9, 2.1) }); }
    const rockG = new THREE.DodecahedronGeometry(1, 0), rockM = new THREE.MeshStandardMaterial({ color: 0x85827a, roughness: 1, flatShading: true });
    const im = new THREE.InstancedMesh(rockG, rockM, n);
    list.forEach((q, i) => {
      const p = neAxisToWorld(q.d, q.off);
      dummy.position.set(p.x, q.s * 0.45, p.z); dummy.rotation.set(rand() * 0.6, rand() * 6.28, rand() * 0.6); dummy.scale.set(q.s * 1.2, q.s * 0.85, q.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      colliders.push({ x: p.x, z: p.z, r: q.s * 1.05 });
    });
    im.castShadow = im.receiveShadow = true; group.add(im);
  }
  yield;

  // ---------- Pegunungan: barisan gunung di kedua sisi padang + dinding gunung di ujung (satu mesh gabungan) ----------
  //  Puncak besar ada di luar tepi padang (latar), kaki bukit rendah di tepi diberi tabrakan supaya pemain tidak bisa naik / menembusnya.
  //  Di ujung padang ada celah di sekitar jalan, jadi jalan tidak buntu oleh kaki bukit.
  {
    // acak yang selalu sama untuk titik yang sama (supaya sambungan kerucut tidak retak saat digoyang)
    const hash = (x, y, z, sd) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + sd * 4.1414) * 43758.5453; return v - Math.floor(v); };
    const ramp = [[0, 0x5b8f3a], [0.14, 0x6a9244], [0.24, 0x6c6a86], [0.6, 0x85839f], [0.7, 0x9a9bb5], [0.76, 0xe8eef7], [1, 0xffffff]];   // kaki hijau -> batu abu-ungu -> salju (gaya low-poly)
    const colAt = (t, c) => { for (let i = 1; i < ramp.length; i++) if (t <= ramp[i][0]) { const a = ramp[i - 1], b = ramp[i]; c.setHex(a[1]).lerp(tmpC.setHex(b[1]), (t - a[0]) / (b[0] - a[0])); return c; } return c.setHex(0xffffff); };
    const ridgeBlock = (d, off, rb) => {   // puncak latar yang kakinya akan menimpa Pegunungan Naga / koridor jembatannya dibuang
      const t = d - NE_RIDGE.d0; if (t < -140 - rb || t > NE_RIDGE.L + 100 + rb) return false;
      return Math.abs(neRidgeLat(d, off).lat) < neRidgeHW0(Math.min(NE_RIDGE.L, Math.max(0, t))) + NE_RIDGE.Wc + 0.8 * rb;
    };
    const parts = []; let seedN = 0;
    const cone = (wx, wz, r, h, sd, sx, sz, rotY) => {   // satu kerucut berfaset: tiap segitiga punya warna sendiri (tampak low-poly), lalu diletakkan di dunia
      let g = new THREE.ConeGeometry(r, h, 8, 6, true).translate(0, h / 2, 0); const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), t = y / h;
        if (t < 0.97) { pos.setX(i, x + (hash(x, y, z, sd) - 0.5) * r * 0.6); pos.setZ(i, z + (hash(z, y, x, sd) - 0.5) * r * 0.6); }   // lereng bergerigi
        if (t > 0.05 && t < 0.95) pos.setY(i, y + (hash(y, x, z, sd + 3) - 0.5) * h * 0.12);
      }
      g = g.toNonIndexed(); const P = g.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
      for (let f = 0; f < P.count; f += 3) {
        const cy = (P.getY(f) + P.getY(f + 1) + P.getY(f + 2)) / 3, cx = (P.getX(f) + P.getX(f + 1) + P.getX(f + 2)) / 3, cz = (P.getZ(f) + P.getZ(f + 1) + P.getZ(f + 2)) / 3, hn = hash(cx, cy, cz, sd + 9);
        colAt(Math.min(1, Math.max(0, cy / h + (hn - 0.5) * 0.1)), c); const k = 0.9 + hn * 0.2; c.multiplyScalar(k);
        for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (f + v) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
      dummy.position.set(wx, -3, wz); dummy.rotation.set(0, rotY, 0); dummy.scale.set(sx, 1, sz); dummy.updateMatrix(); g.applyMatrix4(dummy.matrix);
      return g;
    };
    const blocksBridge = (d, off, r, h) => NE_BRIDGES.some(b => {   // kerucut ini menembus / menyentuh dek jembatan langit? (tinggi kerucut di titik terdekat vs tinggi dek)
      const px = d - b.d0, py = off - b.o0, sB = Math.min(b.L, Math.max(0, px * b.ux + py * b.uy)), dd = Math.hypot(px - b.ux * sB, py - b.uy * sB);
      return dd < 1.3 * r + 6 && h * (1 - Math.min(1, dd / (1.25 * r))) - 3 > neBridgeDeckH(b, sB) - 5;
    });
    const peak = (d, off, r, h, collide, clearRoad, ridgeAng, ridgeM) => {   // ridgeAng (opsional): punggungan penyambung di sekeliling kaki Gunung Pendakian, posisinya dihitung dari sudut ini
      if (ridgeAng === undefined && MTS.some(M => Math.hypot(d - M.d, off - M.off) < M.Rb * 0.8 + r * 0.6 + 2)) return;   // tempat Gunung Pendakian: tidak ada puncak latar yang menimpanya
      const sd = ++seedN * 1.7, sx = Rn(0.85, 1.35), sz = Rn(0.85, 1.35);
      if (ridgeAng !== undefined) {   // letakkan tepat di luar kaki gunung: tepi kerucut (radius maks 1,32·r·skala) berhenti di jari-jari Rb + 4 dari pusat gunung, jadi tidak menimpa lereng, jalan setapak, atau cincin jalan keliling kaki gunung
        const R1 = 1.32 * r * Math.max(sx, sz), Dd = ridgeM.Rb + 4 + R1;
        d = ridgeM.d + Dd * Math.cos(ridgeAng); off = ridgeM.off + Dd * Math.sin(ridgeAng);
        if (ridgeM.axial ? (d - R1 < D1 + 4 && Math.abs(off) - R1 < HW + 4) : (ridgeM.side < 0 ? off + R1 > -(HW + 2) : off - R1 < HW + 2)) return;   // sisi yang menghadap padang (jalan cabang & awal jalan setapak) dibiarkan terbuka
      }
      if (collide && MTS.some(M => Math.hypot(d - M.d, off - M.off) < M.Rb + 3 + 1.2 * r * Math.max(sx, sz))) return;   // kaki bukit bertabrakan tidak boleh menimpa kaki Gunung Pendakian: tadinya kerucut & tabrakannya bisa menutup awal jalan setapak
      if (clearRoad) { const need = ROAD_HW + 6 + 1.3 * r * Math.max(sx, sz); if (Math.abs(off) < need) off = (off < 0 ? -1 : 1) * need; }   // kaki bukit digeser keluar sampai kerucut (termasuk lereng yang tidak mulus) tidak menutupi jalan: lorong terlihat >= 2·(lebar jalan + 6 m), tabrakannya pun ikut menjauh
      if (blocksBridge(d, off, r * Math.max(sx, sz), h)) return;   // puncak latar yang akan menembus jembatan antar-puncak dibuang
      const w = neAxisToWorld(d, off), rotY = rand() * 6.28;
      if (ridgeAng !== undefined && ridgeBlock(d, off, 1.32 * r * Math.max(sx, sz))) return;   // (dicek SETELAH rand() di atas supaya urutan acak elemen lain tidak bergeser)
      parts.push(cone(w.x, w.z, r, h, sd, sx, sz, rotY));
      if (collide) colliders.push({ x: w.x, z: w.z, r: r * 0.62 * Math.max(sx, sz) });
      // bahu batu: puncak besar diberi satu puncak pendamping yang lebih rendah (massif), pakai hash saja supaya urutan acak lain tidak bergeser
      if (!collide && ridgeAng === undefined && h > 70 && MTS.every(M => Math.hypot(d - M.d, off - M.off) > M.Rb + r * 1.3 + 6)) {
        const ang = hash(d, off, h, 77) * 6.283, k = 0.55 + hash(off, d, r, 78) * 0.2, d2 = d + Math.cos(ang) * r * 0.75, f2 = off + Math.sin(ang) * r * 0.75, o2 = neAxisToWorld(d2, f2);
        if (!blocksBridge(d2, f2, r * k * Math.max(sx, sz), h * 0.65)) parts.push(cone(o2.x, o2.z, r * k, h * (0.5 + hash(r, h, d, 79) * 0.15), sd + 31, sx, sz, ang));
      }
    };
    const step = COARSE ? 1.6 : 1;
    for (const sd of [-1, 1]) {
      for (let d = D0 + 30; d < D1 + 40; d += 34 * step) {   // puncak besar di belakang
        peak(d + Rn(-8, 8), sd * (HW + Rn(22, 50)), Rn(34, 58), Rn(70, 150), false);
        if (rand() < 0.6) peak(d + Rn(10, 24), sd * (HW + Rn(55, 85)), Rn(40, 66), Rn(110, 180), false);   // barisan kedua yang lebih tinggi
      }
      for (let d = D0 + 30; d < D1 + 20; d += 24 * step) peak(d + Rn(-5, 5), sd * (HW + Rn(18, 26)), Rn(14, 22), Rn(22, 42), true);   // kaki bukit di tepi padang
    }
    for (const dd of [-50, 0, 50]) peak(MT.d + dd + Rn(-10, 10), MT.off - MT.Rb - Rn(40, 65), Rn(55, 75), Rn(120, 170), false);   // latar tinggi di belakang Gunung Pendakian
    for (let off = -HW - 90; off <= HW + 90; off += 36 * step) peak(D1 + Rn(25, 70), off + Rn(-6, 6), Rn(45, 70), Rn(110, 190), false);   // dinding gunung di ujung
    for (let off = -HW - 8; off <= HW + 8; off += 22 * step) if (!inRoad(off, 12)) peak(D1 + Rn(10, 16), off, Rn(16, 24), Rn(24, 40), true, true);   // kaki bukit di ujung (celah lebar di jalan)
    for (const dd of [-50, 0, 50]) peak(MT2.d + dd + Rn(-10, 10), MT2.off + MT2.Rb + Rn(40, 65), Rn(55, 75), Rn(120, 170), false);   // latar tinggi di belakang Gunung Seberang (ditaruh di akhir supaya acak elemen lain tidak bergeser)
    for (const M of MTS) for (let a = 0; a < 6.2832; a += 0.3) peak(0, 0, Rn(26 * M.Rb / 75, 38 * M.Rb / 75), Rn(M.Hm - 5, M.Hm + 25), false, false, a + Rn(-0.06, 0.06), M);   // punggungan penyambung: tiap gunung menyatu dengan barisan puncak latar di sekelilingnya (kecuali sisi menghadap padang)
    const mm = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    mm.receiveShadow = true; group.add(mm); parts.forEach(g => g.dispose());
  }
  yield;

  // ---------- Papan nama (dipakai di gerbang & di awal jalan setapak) ----------
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 1 });
  const signBoard = (lines, pos, lookAt, y = 0) => {   // sisi depan papan menghadap ke titik lookAt
    const W = 512, H = 192, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#6b4a2a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#d9b24a'; x.lineWidth = 8; x.strokeRect(8, 8, W - 16, H - 16);
    x.fillStyle = '#f3e3bd'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'bold 44px serif';
    lines.forEach((t, k) => x.fillText(t, W / 2, H / 2 + (k - (lines.length - 1) / 2) * 58));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group(); g.position.set(pos.x, y, pos.z); g.rotation.y = Math.atan2(lookAt.x - pos.x, lookAt.z - pos.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8), wood); post.position.y = 1.3; post.castShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.1), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), wood]); board.position.set(0, 2.2, 0.08); board.castShadow = true;
    g.add(post, board); group.add(g); colliders.push({ x: pos.x, z: pos.z, r: 0.3 });
  };
  signBoard(['PADANG RUMPUT', 'TIMUR LAUT'], neAxisToWorld(D0 + 26, ROAD_HW + 3.2), neAxisToWorld(D0 - 10, ROAD_HW + 3.2));   // dekat gerbang, menghadap ke gerbang (terbaca pemain yang baru keluar)
  yield;

  // ===== Awan low-poly, kabut & tekstur air terjun (dipakai kedua gunung) =====
  const clouds = [], mists = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, roughness: 1, flatShading: true, emissive: 0x6f7fa8, emissiveIntensity: 0.25 });
  const mkCloud = (x, y, z, sc, op, kind) => {   // gumpalan ikosahedron pipih; kind 1 = awan di langit, 0.85 = kabut kecil
    const parts = [], n = 5 + ((rand() * 3) | 0);
    for (let i = 0; i < n; i++) { const g = new THREE.IcosahedronGeometry(1, 0), s2 = Rn(0.6, 1.1) * (1 - Math.abs(i - n / 2) / n * 0.7); g.scale(s2 * 1.5, s2 * 0.75, s2); g.translate((i - n / 2) * 1.1, Rn(-0.1, 0.35), Rn(-0.5, 0.5)); parts.push(g); }
    const mt = op < 1 ? cloudMat.clone() : cloudMat; if (op < 1) { mt.transparent = true; mt.opacity = op; mt.depthWrite = false; }
    const m = new THREE.Mesh(mergeGeometries(parts), mt); parts.forEach(g => g.dispose());
    m.position.set(x, y, z); m.scale.setScalar(sc); m.rotation.y = rand() * 6.28; m.userData = { x, z, ph: rand() * 6.28, sp: Rn(0.03, 0.07), amp: Rn(8, 20) };
    group.add(m); return m;
  };
  const wfTex = (() => {   // pola garis air jatuh (diputar pelan lewat update)
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = 'rgba(200,232,255,0.8)'; x.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.5})`; x.fillRect(rand() * 60, rand() * 256, 2 + rand() * 4, 30 + rand() * 90); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  let tClock = 0, dragonUpd = null, flyUpd = null;   // flyUpd: gerak kawanan naga terbang di pegunungan   // dragonUpd: animasi naga di Sarang Naga (diisi setelah adult_dragon.glb termuat)

  // ===== Pembangun gunung yang bisa didaki (dipakai Gunung Pendakian di kiri & Gunung Seberang di kanan; M = NE_MTN / NE_MTN2 dari layout) =====
  function* buildMountain(M, signText, flagColor) {
  // ---------- GUNUNG PENDAKIAN: mesh tanah (dari rumus tinggi di layout) + jalan cabang + pagar tabrakan jalan setapak + hiasan puncak ----------
  {
    const axW = (xa, ya) => neAxisToWorld(M.d + xa, M.off + ya);   // koordinat gunung -> dunia
    const mtnSst = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };

    // 1) mesh tanah gunung (grid 1.25 m; hanya sel di dalam kaki gunung). Tiap segitiga diwarnai sendiri: datar = rumput cerah, curam = batu abu-ungu, jalan setapak = tanah (gaya low-poly)
    const STEP = 1.25, half = M.Rb + 3, N = Math.ceil(half * 2 / STEP), nv = (N + 1) * (N + 1);
    const pos = new Float32Array(nv * 3), XA = new Float32Array(nv), YA = new Float32Array(nv), rr = new Float32Array(nv), c = new THREE.Color();
    const trailC = new THREE.Color(0xc9a468), rockLo = new THREE.Color(0x5f5d78), rockHi = new THREE.Color(0x9a98b2), grassA = new THREE.Color(0x5fa83e), grassB = new THREE.Color(0x8cc84c), tmp2 = new THREE.Color();
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const xa = -half + i * STEP, ya = -half + j * STEP, h = neMtnHAxis(xa, ya, M), w = axW(xa, ya), k = j * (N + 1) + i;
      pos[k * 3] = w.x; pos[k * 3 + 1] = h + 0.03; pos[k * 3 + 2] = w.z; rr[k] = Math.hypot(xa, ya); XA[k] = xa; YA[k] = ya;
    }
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1;
      if (Math.max(rr[a], rr[b], rr[d], rr[e]) > M.Rb + 2.2) continue;
      idx.push(a, d, b, b, d, e);
    }
    const T = idx.length / 3, P2 = new Float32Array(T * 9), C2 = new Float32Array(T * 9), fa = new THREE.Vector3(), fb = new THREE.Vector3(), fc = new THREE.Vector3(), fd = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let t = 0; t < T; t++) {
      let cx = 0, cy = 0, hh = 0;
      for (let v = 0; v < 3; v++) { const k = idx[t * 3 + v]; P2[t * 9 + v * 3] = pos[k * 3]; P2[t * 9 + v * 3 + 1] = pos[k * 3 + 1]; P2[t * 9 + v * 3 + 2] = pos[k * 3 + 2]; cx += XA[k] / 3; cy += YA[k] / 3; hh += pos[k * 3 + 1] / 3; }
      fa.fromArray(P2, t * 9); fb.fromArray(P2, t * 9 + 3); fc.fromArray(P2, t * 9 + 6);
      fn.subVectors(fc, fb).cross(fd.subVectors(fa, fb)).normalize();
      const ny = Math.abs(fn.y), hn = hash(cx * 1.7, cy * 1.3), r = Math.hypot(cx, cy);
      c.copy(rockLo).lerp(rockHi, Math.min(1, Math.max(0, 0.2 + 0.55 * hn + 0.3 * (hh / M.Hm))));   // batu: gelap di bawah, lebih terang di atas + variasi acak per sisi
      c.lerp(tmp2.copy(grassA).lerp(grassB, hn), mtnSst(0.72, 0.9, ny));                          // dataran datar = rumput
      if (r < M.Rb) { const pw = 1 - mtnSst(M.W + 0.2, M.W + 1.2, neMtnTrail(cx, cy, M).perp); if (pw > 0) c.lerp(tmp2.copy(trailC).multiplyScalar(0.92 + hn * 0.16), pw); }   // badan jalan setapak berwarna tanah
      for (let v = 0; v < 3; v++) { C2[t * 9 + v * 3] = c.r; C2[t * 9 + v * 3 + 1] = c.g; C2[t * 9 + v * 3 + 2] = c.b; }
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(P2, 3)); mg.setAttribute('color', new THREE.BufferAttribute(C2, 3)); mg.computeVertexNormals();
    const mm = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mm.receiveShadow = true; mm.castShadow = true; group.add(mm);
    const hAt = (xa, ya) => neMtnHAxis(xa, ya, M);

    // 2) jalan cabang dari jalan padang ke awal jalan setapak (lebarnya sama dengan jalan setapak)
    {
      const a = M.axial ? neAxisToWorld(D1 - 2, 0) : neAxisToWorld(M.d, M.side * (ROAD_HW - 0.5)), b = M.axial ? neAxisToWorld(M.d - M.r0 - 1.5, 0) : neAxisToWorld(M.d, M.off - M.side * (M.r0 + 1.5)), L = Math.hypot(b.x - a.x, b.z - a.z);   // axial (Gunung Agung): jalan padang diteruskan lurus sampai awal jalan setapak
      const spur = new THREE.Mesh(new THREE.PlaneGeometry(SPUR_W * 2, L).rotateX(-Math.PI / 2), roadMat);
      spur.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2); spur.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); spur.receiveShadow = true; group.add(spur);
      if (M.axial) signBoard(signText, neAxisToWorld(M.d - M.r0 - 8, ROAD_HW + 2.2), neAxisToWorld(M.d - M.r0 - 40, ROAD_HW + 2.2));   // di tepi jalan, menghadap pemain yang datang dari padang
      else signBoard(signText, neAxisToWorld(M.d + 4.5, M.off - M.side * (M.r0 + 10)), neAxisToWorld(M.d + 4.5, M.side * 10));   // di samping jalan cabang, menghadap ke jalan padang
    }

    // 3) tabrakan: pagar di kiri-kanan jalan setapak (supaya pemain tetap di jalan), cincin di kaki gunung & di tepi dataran puncak
    const edgeR = 0.9, off = M.W + 1.0;   // lingkaran r = 0.9 tiap 1,8 m saling menyentuh, pemain (r = 0.45) tidak bisa menyelip
    for (let th = M.th0; th <= M.th0 + M.TH; ) {
      const r = neMtnRs(th, M), tx = M.DR * Math.cos(th) - r * Math.sin(th), ty = M.DR * Math.sin(th) + r * Math.cos(th), tl = Math.hypot(tx, ty), nx = -ty / tl, ny = tx / tl;
      for (const sd of [-1, 1]) { if (sd < 0 && th < M.th0 + 0.3) continue;   // sisi luar baru dipagari setelah jalan masuk ke dalam kaki gunung (jalan cabang tetap lega)
        const w = axW(r * Math.cos(th) + nx * sd * off, r * Math.sin(th) + ny * sd * off); colliders.push({ x: w.x, z: w.z, r: edgeR }); }
      th += 1.8 / Math.hypot(r, M.DR);
    }
    const nearBridge = (xa, ya) => NE_BRIDGES.some(b => (b.A === M || b.B === M) && (q => Math.abs(q.lat) < b.hw + 1.8 && q.s > -6 && q.s < b.L + 6)(neBridgeLocal(b, M.d + xa, M.off + ya)));   // dekat pangkal jembatan antar-puncak
    const ring = (R, step, cr, gapBridge) => { for (let a = 0; a < 6.2832; a += step / R) { const xa = R * Math.cos(a), ya = R * Math.sin(a); if (neMtnTrail(xa, ya, M).perp < M.W + 1.2 || (gapBridge && nearBridge(xa, ya))) continue; const w = axW(xa, ya); colliders.push({ x: w.x, z: w.z, r: cr }); } };   // celah hanya di badan jalan setapak
    ring(M.Rb - 0.5, 1.8, 1.3);   // kaki gunung: tidak bisa naik lewat lereng
    ring(M.topR + 1, 2.0, 1.2, true);   // tepi dataran puncak: tidak turun lewat lereng

    // 4) hiasan puncak: tugu batu + tiang bendera + beberapa batu
    {
      const top = M.Hm + 0.03, cm = new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 1, flatShading: true });
      const cp = axW(3.2, 0);
      for (let k = 0; k < 5; k++) { const rk = 1.0 - k * 0.15, m = new THREE.Mesh(new THREE.DodecahedronGeometry(rk, 0), cm); m.position.set(cp.x + Rn(-0.1, 0.1), top + 0.7 + k * 0.85, cp.z + Rn(-0.1, 0.1)); m.rotation.set(rand() * 3, rand() * 6, 0); m.castShadow = true; group.add(m); }
      colliders.push({ x: cp.x, z: cp.z, r: 1.2 });
      const fp = axW(-3.2, 0), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7, 8), wood); pole.position.set(fp.x, top + 3.5, fp.z); pole.castShadow = true; group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshStandardMaterial({ color: flagColor, roughness: 0.9, side: THREE.DoubleSide })); flag.position.set(fp.x + 1.1, top + 6.0, fp.z); group.add(flag);
      colliders.push({ x: fp.x, z: fp.z, r: 0.3 });
      for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.5, w = axW(Math.cos(a) * 8.5, Math.sin(a) * 8.5), sc = Rn(0.5, 0.9), m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), cm); m.position.set(w.x, top + sc * 0.3, w.z); m.scale.set(sc * 1.2, sc * 0.8, sc); m.rotation.y = rand() * 6; m.castShadow = true; group.add(m); colliders.push({ x: w.x, z: w.z, r: sc }); }
    }

    // 5) air terjun: pita air mengikuti tebing (dipilih otomatis di tebing yang jauh dari jalan setapak) + kolam & kabut di dasarnya
    const falls = [];
    {
      const psi = M.axial ? Math.PI : (M.side < 0 ? Math.PI / 2 : -Math.PI / 2);   // arah yang menghadap padang
      const offs = [0.15, -0.55, 0.85, -1.25, 1.5, -1.8, 2.2, -2.5];
      for (const o of offs) {
        if (falls.length >= (COARSE ? 2 : 3)) break;
        const an = psi + o; if (falls.some(f => Math.abs(Math.atan2(Math.sin(an - f.an), Math.cos(an - f.an))) < 0.7)) continue;
        const ca = Math.cos(an), sa = Math.sin(an), runs = []; let cur = null;
        for (let r = M.Rb - 2; r > 16; r -= 0.5) {   // pindai dari kaki ke puncak: kumpulkan bagian tebing yang curam
          const h0 = hAt(r * ca, r * sa), h1 = hAt((r - 0.5) * ca, (r - 0.5) * sa), steep = (h1 - h0) / 0.5 > 0.9;
          if (steep) { if (!cur) cur = { r0: r, h0 }; cur.r1 = r - 0.5; cur.h1 = h1; } else if (cur) { runs.push(cur); cur = null; }
        }
        const run = runs.filter(q => q.h1 - q.h0 > 7).find((q, i) => i >= 1 || runs.length < 2);
        if (!run) continue;
        let ok = true; for (let k = 0; k <= 8; k++) { const r = run.r0 + (run.r1 - run.r0) * k / 8; if (neMtnTrail(r * ca, r * sa, M).perp < M.W + 8) ok = false; }
        if (ok) falls.push({ an, run });
      }
      const wfMat = new THREE.MeshBasicMaterial({ map: wfTex, color: 0xd8f0ff, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      for (const { an, run } of falls) {
        const ca = Math.cos(an), sa = Math.sin(an), nx = -sa, ny = ca, SEG = 12, wd = 1.5, P = [], U = [], I = [];
        for (let k = 0; k <= SEG; k++) {
          const r = run.r0 + (run.r1 - run.r0) * k / SEG, h = hAt(r * ca, r * sa) + 0.2, ro = r + 0.45;   // sedikit di depan permukaan tebing
          for (const sd of [-1, 1]) { const w = axW(ro * ca + nx * sd * wd * (1 - 0.25 * k / SEG), ro * sa + ny * sd * wd * (1 - 0.25 * k / SEG)); P.push(w.x, h, w.z); U.push(sd < 0 ? 0 : 1, k / SEG * ((run.h1 - run.h0) / 6)); }
          if (k) { const q = (k - 1) * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        }
        const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); wg.setIndex(I);
        group.add(new THREE.Mesh(wg, wfMat));
        const rb = run.r0 + 3.5, wb = axW(rb * ca, rb * sa);   // kolam kecil + kabut di dasar air terjun
        const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x58b6e8, roughness: 0.3, flatShading: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
        pool.position.set(wb.x, run.h0 + 0.12, wb.z); group.add(pool);
        for (let k = 0; k < 4; k++) mists.push(mkCloud(wb.x + Rn(-3, 3), run.h0 + 1.8 + k * 0.5, wb.z + Rn(-3, 3), Rn(1.3, 2.2), 0.5, 0.85));
      }
    }

    // 6) pagar kayu di tepi jalan setapak (sisi luar/tebing penuh, sisi dalam sebagian) — tampilan saja, tabrakan tetap lingkaran di atas
    {
      const posts = [], rails = [], fo = M.W + 0.75;
      const place = (th, sd) => { const r = neMtnRs(th, M), tx = M.DR * Math.cos(th) - r * Math.sin(th), ty = M.DR * Math.sin(th) + r * Math.cos(th), tl = Math.hypot(tx, ty), nx = -ty / tl, ny = tx / tl, xa = r * Math.cos(th) + nx * sd * fo, ya = r * Math.sin(th) + ny * sd * fo, w = axW(xa, ya); return new THREE.Vector3(w.x, hAt(xa, ya) + 0.03, w.z); };
      for (const sd of [-1, 1]) {
        let prev = null;
        for (let th = M.th0 + 0.3; th <= M.th0 + M.TH - 0.2; ) {
          const gap = sd > 0 && hash(Math.floor(th * 4), M.d) < 0.5;   // sisi dalam: sebagian terbuka
          const pnt = place(th, sd);
          if (!gap) { posts.push(pnt); if (prev) rails.push([prev, pnt]); }
          prev = gap ? null : pnt; th += 2.4 / Math.hypot(neMtnRs(th, M), M.DR);
        }
      }
      const pG = new THREE.BoxGeometry(0.18, 1.15, 0.18).translate(0, 0.57, 0), rG = new THREE.BoxGeometry(1, 0.1, 0.08), fm = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 1, flatShading: true });
      const pi = new THREE.InstancedMesh(pG, fm, Math.max(1, posts.length)), ri = new THREE.InstancedMesh(rG, fm, Math.max(1, rails.length * 2)), ax = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3();
      posts.forEach((q, i) => { dummy.position.copy(q); dummy.quaternion.identity(); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pi.setMatrixAt(i, dummy.matrix); });
      rails.forEach(([q1, q2], i) => { dir.subVectors(q2, q1); const L = dir.length(); dir.normalize(); for (let k = 0; k < 2; k++) { dummy.position.set((q1.x + q2.x) / 2, (q1.y + q2.y) / 2 + 0.42 + k * 0.42, (q1.z + q2.z) / 2); dummy.quaternion.setFromUnitVectors(ax, dir); dummy.scale.set(L, 1, 1); dummy.updateMatrix(); ri.setMatrixAt(i * 2 + k, dummy.matrix); } });
      pi.count = posts.length; ri.count = rails.length * 2; pi.castShadow = ri.castShadow = true; group.add(pi, ri);
    }

    // 7) pinus di dataran bertingkat + batu (jauh dari jalan setapak & air terjun, hanya di tanah datar)
    {
      const n = COARSE ? 28 : 80, pines = [], rocks = [];
      for (let tries = 0; tries < n * 14 && pines.length + rocks.length < n * 1.35; tries++) {
        const an = Rn(0, 6.2832), r = Rn(M.topR + 8, M.Rb - 6), xa = r * Math.cos(an), ya = r * Math.sin(an), h = hAt(xa, ya);
        if (Math.abs(hAt(xa + 1.5, ya) - h) > 0.35 || Math.abs(hAt(xa, ya + 1.5) - h) > 0.35 || Math.abs(hAt(xa - 1.5, ya) - h) > 0.35 || Math.abs(hAt(xa, ya - 1.5) - h) > 0.35) continue;   // hanya di tanah datar
        if (neMtnTrail(xa, ya, M).perp < M.W + 7) continue;
        if (falls.some(f => Math.hypot(xa - Math.cos(f.an) * f.run.r0, ya - Math.sin(f.an) * f.run.r0) < 9)) continue;
        (rand() < 0.75 ? pines : rocks).push({ xa, ya, h, s: Rn(0.9, 1.8) });
      }
      if (pines.length) {
        const tr = new THREE.InstancedMesh(geo.trunkPine, mat.barkMat, pines.length), lf = new THREE.InstancedMesh(geo.pineLeaf, mat.leafMat(0.02), pines.length);
        pines.forEach((q, i) => { const w = axW(q.xa, q.ya); dummy.position.set(w.x, q.h, w.z); dummy.quaternion.identity(); dummy.rotation.set(0, rand() * 6.28, 0); dummy.scale.setScalar(q.s); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix); lf.setMatrixAt(i, dummy.matrix); lf.setColorAt(i, tmpC.setRGB(Rn(0.75, 1.0), Rn(0.9, 1.1), Rn(0.8, 1.05))); });
        tr.castShadow = lf.castShadow = true; tr.receiveShadow = lf.receiveShadow = true; group.add(tr, lf);
      }
      if (rocks.length) {
        const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8d8ba3, roughness: 1, flatShading: true }), rocks.length);
        rocks.forEach((q, i) => { const w = axW(q.xa, q.ya); dummy.position.set(w.x, q.h + q.s * 0.3, w.z); dummy.quaternion.identity(); dummy.rotation.set(rand() * 0.6, rand() * 6.28, rand() * 0.6); dummy.scale.set(q.s * 1.1, q.s * 0.75, q.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
        im.castShadow = im.receiveShadow = true; group.add(im);
      }
    }

    // 8) awan low-poly melayang di sekeliling puncak (bergoyang pelan lewat update)
    for (let k = 0, n = COARSE ? 4 : 8; k < n; k++) {
      const an = (k / n) * 6.2832 + Rn(-0.3, 0.3), r = M.Rb + Rn(20, 90), w = axW(r * Math.cos(an), r * Math.sin(an));
      clouds.push(mkCloud(w.x, M.Hm * Rn(0.55, 1.25) + Rn(10, 35), w.z, Rn(7, 13), 0.95, 1));
    }
  }
  }

  // ===== JEMBATAN LANGIT: jalan kayu antar-puncak (lihat NE_BRIDGES di layout). Dek di atas tanah; pemain di dek diatur lewat neBridgeClamp (game.js) =====
  function* buildBridges() {
    const NAMES = new Map([[MT, 'GUNUNG PENDAKIAN'], [MT2, 'GUNUNG SEBERANG'], [MT3, 'GUNUNG AGUNG'], [NE_RIDGE.head, 'PEGUNUNGAN NAGA']]);
    const ax = (b, s, lat = 0) => neAxisToWorld(b.d0 + b.ux * s - b.uy * lat, b.o0 + b.uy * s + b.ux * lat);   // titik dunia di jarak s sepanjang dek, geser lat ke samping
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a88a0, roughness: 1, flatShading: true });
    const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    const fm = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 1, flatShading: true });
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    const addCol = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    for (const b of NE_BRIDGES) {
      const p0 = ax(b, 0), p1 = ax(b, b.L), Lw = Math.hypot(p1.x - p0.x, p1.z - p0.z), hx = (p1.x - p0.x) / Lw, hz = (p1.z - p0.z) / Lw;
      const along = new THREE.Vector3(hx, (b.h1 - b.h0) / Lw, hz).normalize(), side = new THREE.Vector3(-hz, 0, hx), up = new THREE.Vector3().crossVectors(side, along).normalize();
      const basis = new THREE.Matrix4().makeBasis(along, up, side);
      const put = (g, s, lat, dy) => { const w = ax(b, s, lat); mtx.copy(basis); mtx.setPosition(w.x, neBridgeDeckH(b, s) + dy, w.z); g.applyMatrix4(mtx); return g; };   // letakkan kotak mengikuti kemiringan dek
      // 1) dek: papan melintang (warna kayu acak) + balok penopang di bawah kedua tepi
      const parts = [];
      for (let s = 0.4; s < b.L; s += 0.8) parts.push(addCol(put(new THREE.BoxGeometry(0.74, 0.14, b.hw * 2), s, 0, -0.07), col.setHex(0x9a6b3c).offsetHSL(0, 0, (rand() - 0.5) * 0.12)));
      for (let s = 0.8; s < b.L; s += 1.6) for (const sd of [-1, 1]) parts.push(addCol(put(new THREE.BoxGeometry(1.64, 0.4, 0.3), s, sd * (b.hw - 0.3), -0.34), col.setHex(0x5a3d22)));
      const deck = new THREE.Mesh(mergeGeometries(parts), deckMat); deck.castShadow = deck.receiveShadow = true; group.add(deck); parts.forEach(g => g.dispose());
      yield;
      // 2) pagar: tiang tiap 2,4 m + dua palang di kedua sisi
      const posts = [], rails = [];
      for (const sd of [-1, 1]) { let prev = null; for (let s = 0; s <= b.L + 0.01; s += 2.4) { const ss = Math.min(s, b.L), w = ax(b, ss, sd * (b.hw - 0.15)), q = new THREE.Vector3(w.x, neBridgeDeckH(b, ss), w.z); posts.push(q); if (prev) rails.push([prev, q]); prev = q; } }
      const pi = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1.15, 0.18).translate(0, 0.57, 0), fm, posts.length), ri = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.08), fm, rails.length * 2), ex = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3();
      posts.forEach((q, i) => { dummy.position.copy(q); dummy.quaternion.identity(); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pi.setMatrixAt(i, dummy.matrix); });
      rails.forEach(([q1, q2], i) => { dir.subVectors(q2, q1); const L = dir.length(); dir.normalize(); for (let k = 0; k < 2; k++) { dummy.position.set((q1.x + q2.x) / 2, (q1.y + q2.y) / 2 + 0.42 + k * 0.42, (q1.z + q2.z) / 2); dummy.quaternion.setFromUnitVectors(ex, dir); dummy.scale.set(L, 1, 1); dummy.updateMatrix(); ri.setMatrixAt(i * 2 + k, dummy.matrix); } });
      pi.castShadow = ri.castShadow = true; group.add(pi, ri);
      // 3) pilar batu ke tanah (tidak di atas padang & jalan setapak) — jembatan melayang di atas padang
      for (let s = 30; s < b.L - 30; s += 46) {
        const d = b.d0 + b.ux * s, off = b.o0 + b.uy * s, w = neAxisToWorld(d, off);
        if (d < D1 + 4 && Math.abs(off) < HW + 4) continue;
        const gy = Math.min(neMtnH(w.x, w.z), neMtnH(w.x + 1.8, w.z), neMtnH(w.x - 1.8, w.z), neMtnH(w.x, w.z + 1.8), neMtnH(w.x, w.z - 1.8)), top = neBridgeDeckH(b, s) - 0.5;
        if (top - gy < 9) continue;
        if (MTS.some(M => { const xa = d - M.d, ya = off - M.off; return Math.hypot(xa, ya) < M.Rb && neMtnTrail(xa, ya, M).perp < M.W + 7; })) continue;
        const h = top - gy + 4, pier = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.9, h, 7), pierMat); pier.position.set(w.x, gy - 4 + h / 2, w.z); pier.castShadow = pier.receiveShadow = true; group.add(pier);
        colliders.push({ x: w.x, z: w.z, r: 2.0 });
      }
      // 4) papan nama di kedua ujung (di dataran puncak, menghadap pusat puncak)
      const sA = ax(b, -3, b.hw + 2.4), lA = ax(b, -14, b.hw + 2.4), sB = ax(b, b.L + 3, -(b.hw + 2.4)), lB = ax(b, b.L + 14, -(b.hw + 2.4));
      signBoard(['JEMBATAN LANGIT', 'KE ' + NAMES.get(b.B)], sA, lA, b.h0);
      signBoard(['JEMBATAN LANGIT', 'KE ' + NAMES.get(b.A)], sB, lB, b.h1);
      yield;
    }
  }

  // ===== PEGUNUNGAN NAGA: punggungan memanjang di belakang Gunung Agung (tersambung Jembatan Langit dari puncak Agung), jalan tanah berkelok di atasnya =====
  //  Bentuk & tinggi tanah dari rumus di kekaisaran-layout.js (neRidgeH): dataran puncak berlebar berubah-ubah + tebing berundak ke kiri-kanan.
  //  Koordinat punggungan: t = jarak sepanjang punggungan (0 = pusat kepala bundar), lat = geser samping dari garis tengah (W(t, lat) -> titik dunia).
  function* buildRidge() {
    const RG = NE_RIDGE, L = RG.L, TAU2 = Math.PI * 2, clampT = t => Math.min(L, Math.max(0, t));
    const sstR = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const hsh = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
    const W = (t, lat = 0) => { const a = neRidgeToAxis(t, lat); return neAxisToWorld(a.d, a.off); };
    const topY = t => neRidgeTop(t);
    const rdLat = t => neRidgeRoadLat(t);

    // ---------- 1) mesh tanah punggungan (grid; hanya sel yang ada tanahnya). Tiap segitiga diwarnai sendiri: datar = rumput, curam = batu abu-ungu (gaya low-poly) ----------
    {
      const STEP = COARSE ? 2.4 : 1.8, dMin = RG.head.d - 90, dMax = RG.head.d + L + 70, oLim = 135;
      const NI = Math.ceil((dMax - dMin) / STEP), NJ = Math.ceil(2 * oLim / STEP), nv = (NI + 1) * (NJ + 1);
      const o0 = neAxisToWorld(dMin, -oLim), oD = neAxisToWorld(dMin + 1, -oLim), oO = neAxisToWorld(dMin, -oLim + 1);   // pemetaan sumbu -> dunia bersifat linear (rotasi + geser)
      const ux = oD.x - o0.x, uz = oD.z - o0.z, vx = oO.x - o0.x, vz = oO.z - o0.z;
      const Hh = new Float32Array(nv);
      for (let j = 0; j <= NJ; j++) {
        const off = -oLim + j * STEP;
        for (let i = 0; i <= NI; i++) Hh[j * (NI + 1) + i] = neRidgeH(dMin + i * STEP, off);
        if (j % 10 === 9) yield;
      }
      const rockLo = new THREE.Color(0x5f5d78), rockHi = new THREE.Color(0x9a98b2), grassA = new THREE.Color(0x66b03c), grassB = new THREE.Color(0x92d24e), c = new THREE.Color(), tg = new THREE.Color();
      const P = [], C = [], vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
      const vtx = (i, j) => { const d = i * STEP, o = j * STEP; return [o0.x + ux * d + vx * o, Hh[j * (NI + 1) + i] + 0.03, o0.z + uz * d + vz * o]; };
      const tri = (A, B, Cc) => {
        vA.set(...A); vB.set(...B); vC.set(...Cc); n1.subVectors(vC, vB); n2.subVectors(vA, vB); n1.cross(n2).normalize();
        const ny = Math.abs(n1.y), cx = (A[0] + B[0] + Cc[0]) / 3, cz = (A[2] + B[2] + Cc[2]) / 3, hh = (A[1] + B[1] + Cc[1]) / 3, hn = hsh(cx * 0.37, cz * 0.41);
        c.copy(rockLo).lerp(rockHi, Math.min(1, Math.max(0, 0.15 + 0.55 * hn + 0.35 * (hh / RG.Hs))));
        c.lerp(tg.copy(grassA).lerp(grassB, hn), sstR(0.72, 0.9, ny));
        c.multiplyScalar(0.94 + 0.12 * hsh(cz * 0.19, cx * 0.23));
        for (const V of [A, B, Cc]) { P.push(V[0], V[1], V[2]); C.push(c.r, c.g, c.b); }
      };
      for (let j = 0; j < NJ; j++) {
        for (let i = 0; i < NI; i++) {
          const k = j * (NI + 1) + i;
          if (Hh[k] <= 0.02 && Hh[k + 1] <= 0.02 && Hh[k + NI + 1] <= 0.02 && Hh[k + NI + 2] <= 0.02) continue;
          const a = vtx(i, j), b = vtx(i + 1, j), d = vtx(i, j + 1), e = vtx(i + 1, j + 1);
          tri(a, d, b); tri(b, d, e);
        }
        if (j % 10 === 9) yield;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      mesh.receiveShadow = true; mesh.castShadow = true; group.add(mesh);
    }
    yield;

    // ---------- 2) jalan tanah berkelok di puncak (pita mengikuti tinggi puncak) + halaman batu di tanjung ujung ----------
    const dirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    {
      const P = [], C = [], I = [], ce = new THREE.Color(0xbf9459), cm = new THREE.Color(0xdcb67a), cc = new THREE.Color();
      let k = 0;
      for (let t = -11.5; t <= NE_RIDGE_PLAZA_T + 0.01; t += 1.5) {
        const l0 = rdLat(t), y = topY(t) + 0.09, br = 0.94 + 0.12 * hsh(t * 0.31, 7.7);
        for (const [dl, col] of [[-RG.roadHW, ce], [0, cm], [RG.roadHW, ce]]) { const w = W(t, l0 + dl); P.push(w.x, y, w.z); cc.copy(col).multiplyScalar(br); C.push(cc.r, cc.g, cc.b); }
        if (k) { const q = (k - 1) * 3; I.push(q, q + 3, q + 1, q + 1, q + 3, q + 4, q + 1, q + 4, q + 2, q + 2, q + 4, q + 5); }
        k++;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
      const road = new THREE.Mesh(g, dirtMat); road.receiveShadow = true; group.add(road);
      // halaman tanjung ujung (bundar) tempat jalan berakhir
      const pc = W(NE_RIDGE_PLAZA_T, 0), pg = new THREE.CircleGeometry(8.5, 18).rotateX(-Math.PI / 2), pn = pg.attributes.position.count, pcol = new Float32Array(pn * 3);
      for (let i = 0; i < pn; i++) { cc.copy(cm).multiplyScalar(0.96 + 0.08 * hsh(i, 3.1)); pcol.set([cc.r, cc.g, cc.b], i * 3); }
      pg.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
      const plaza = new THREE.Mesh(pg, dirtMat); plaza.position.set(pc.x, topY(NE_RIDGE_PLAZA_T) + 0.1, pc.z); plaza.receiveShadow = true; group.add(plaza);
    }
    yield;

    // ---------- 3) pagar kayu di tepi tebing (tampilan) + tabrakan di tepi (pemain tidak jatuh / turun lewat tebing) ----------
    {
      const walkEdge = (sd, inset, spacing, cb) => {   // titik-titik berjarak tetap (panjang busur) menyusuri tepi puncak sisi sd, `inset` m di dalam tepi
        let acc = spacing, prev = null;
        for (let t = 0; t <= L; t += 0.25) {
          const lat = sd * (neRidgeHW(t, sd) - inset), w = W(t, lat);
          if (prev) acc += Math.hypot(w.x - prev.x, w.z - prev.z);
          if (acc >= spacing) { cb(w, t); acc = 0; }
          prev = w;
        }
      };
      const posts = [], rails = [];
      for (const sd of [-1, 1]) {
        walkEdge(sd, 0.1, 1.8, w => colliders.push({ x: w.x, z: w.z, r: 0.9 }));   // lingkaran r = 0,9 tiap 1,8 m saling menyentuh: pemain (r = 0,45) tidak bisa menyelip
        let prev = null; walkEdge(sd, RG.fenceIn, 2.4, (w, t) => { const q = new THREE.Vector3(w.x, topY(t) + 0.03, w.z); posts.push(q); if (prev) rails.push([prev, q]); prev = q; });
      }
      // tepi ujung (lurus melintang di t = L)
      { let prev = null; const a = -(neRidgeHW(L, -1) - RG.fenceIn), b = neRidgeHW(L, 1) - RG.fenceIn;
        for (let lat = a; lat <= b + 0.01; lat += 2.4) { if (Math.abs(Math.min(lat, b) - NE_DESC.edgeLat) < RG.roadHW + 1.0) { prev = null; continue; } const w = W(L - RG.fenceIn, Math.min(lat, b)), q = new THREE.Vector3(w.x, topY(L) + 0.03, w.z); posts.push(q); if (prev) rails.push([prev, q]); prev = q; }   // celah selebar jalan: pintu masuk Jalur Turun Lembah Salju
        for (let lat = -(neRidgeHW(L, -1) - 0.1); lat <= neRidgeHW(L, 1) - 0.1 + 0.01; lat += 1.8) { if (Math.abs(lat - NE_DESC.edgeLat) < RG.roadHW + 1.0) continue; const w = W(L - 0.1, lat); colliders.push({ x: w.x, z: w.z, r: 0.9 }); } }
      // tepi kepala bundar (hanya di sisi yang menghadap jurang; celah selebar dek di mulut jembatan)
      { const R0 = RG.flatR - 0.1, bb = NE_BRIDGES.find(b => b.B === RG.head), top0 = neRidgeTop(0);
        for (let a = 0; a < TAU2; a += 1.8 / R0) {
          const d = RG.head.d + R0 * Math.cos(a), off = R0 * Math.sin(a);
          if (neRidgeH(RG.head.d + (R0 + 2.6) * Math.cos(a), (R0 + 2.6) * Math.sin(a)) > top0 - 2.5) continue;   // di luar titik ini bukan jurang (sambungan ke punggungan)
          if (bb) { const q = neBridgeLocal(bb, d, off); if (Math.abs(q.lat) < bb.hw + 0.9 && q.s > bb.L - 14) continue; }
          const w = neAxisToWorld(d, off); colliders.push({ x: w.x, z: w.z, r: 0.9 });
        }
        let prev = null;   // pagar di tepi kepala (dilewati di mulut jembatan)
        for (let a = 0; a < TAU2; a += 2.4 / (R0 - RG.fenceIn)) {
          const R1 = R0 - RG.fenceIn + 0.1, d = RG.head.d + R1 * Math.cos(a), off = R1 * Math.sin(a);
          if (neRidgeH(RG.head.d + (R0 + 2.6) * Math.cos(a), (R0 + 2.6) * Math.sin(a)) > top0 - 2.5) { prev = null; continue; }
          if (bb) { const q = neBridgeLocal(bb, d, off); if (Math.abs(q.lat) < bb.hw + 0.9 && q.s > bb.L - 14) { prev = null; continue; } }
          const w = neAxisToWorld(d, off), q = new THREE.Vector3(w.x, top0 + 0.03, w.z); posts.push(q); if (prev) rails.push([prev, q]); prev = q;
        } }
      const fm = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 1, flatShading: true });
      const pi = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1.15, 0.18).translate(0, 0.57, 0), fm, Math.max(1, posts.length)), ri = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.08), fm, Math.max(1, rails.length * 2)), ax = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3();
      posts.forEach((q, i) => { dummy.position.copy(q); dummy.quaternion.identity(); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pi.setMatrixAt(i, dummy.matrix); });
      rails.forEach(([q1, q2], i) => { dir.subVectors(q2, q1); const Ll = dir.length(); if (Ll > 6) { for (let k = 0; k < 2; k++) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); ri.setMatrixAt(i * 2 + k, dummy.matrix); } return; } dir.normalize(); for (let k = 0; k < 2; k++) { dummy.position.set((q1.x + q2.x) / 2, (q1.y + q2.y) / 2 + 0.42 + k * 0.42, (q1.z + q2.z) / 2); dummy.quaternion.setFromUnitVectors(ax, dir); dummy.scale.set(Ll, 1, 1); dummy.updateMatrix(); ri.setMatrixAt(i * 2 + k, dummy.matrix); } });
      pi.count = posts.length; ri.count = rails.length * 2; pi.castShadow = ri.castShadow = true; group.add(pi, ri);

      // pagar tabrakan melintang di koridor jembatan (di TANAH, di bawah dek): pemain di tanah tidak bisa menyusup ke bawah kepala punggungan lalu "memanjat" tebingnya (tinggi pijakan mengikuti rumus tanah)
      for (let off = -RG.barrierHalf; off <= RG.barrierHalf + 0.01; off += 1.8) { const w = neAxisToWorld(RG.barrierD, off); colliders.push({ x: w.x, z: w.z, r: 1.3 }); }
    }
    yield;

    // ---------- 4) rumput, bunga, pinus, batu di dataran puncak (di luar jalan & tepi) ----------
    const hwAt = (t, lat) => neRidgeHW(t, lat < 0 ? -1 : 1);
    const topPoint = (pad, roadPad, tMin = 6, tMax = L - 8) => {   // titik acak di dataran puncak: pad dari tepi, roadPad dari tepi jalan
      for (let i = 0; i < 25; i++) {
        const t = Rn(tMin, tMax), lat = Rn(-neRidgeHW(t, -1), neRidgeHW(t, 1));
        if (Math.abs(lat) < hwAt(t, lat) - pad && Math.abs(lat - rdLat(t)) > RG.roadHW + roadPad) return { t, lat };
      }
      return null;
    };
    {
      const n = COARSE ? 450 : 1500, geoG = new THREE.ConeGeometry(0.14, 0.7, 4).translate(0, 0.35, 0);
      const im = new THREE.InstancedMesh(geoG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), n); let cnt = 0;
      for (let i = 0; i < n; i++) { const q = topPoint(1.2, 0.3, -12); if (!q) continue; const p = W(q.t, q.lat); dummy.position.set(p.x, topY(q.t), p.z); dummy.rotation.set(Rn(-0.2, 0.2), rand() * 6.28, Rn(-0.2, 0.2)); dummy.scale.set(Rn(0.8, 1.6), Rn(0.7, 1.9), Rn(0.8, 1.6)); dummy.updateMatrix(); im.setMatrixAt(cnt, dummy.matrix); im.setColorAt(cnt, tmpC.setRGB(Rn(0.25, 0.42), Rn(0.62, 0.82), Rn(0.18, 0.3))); cnt++; }
      im.count = cnt; group.add(im);
      const nf = COARSE ? 120 : 350, colors = [0xffd84a, 0xf2f2f2, 0xe86a8f, 0x9a7be8], fi = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), nf); let fc = 0;
      for (let i = 0; i < nf; i++) { const q = topPoint(1.5, 0.6, -12); if (!q) continue; const p = W(q.t, q.lat); dummy.position.set(p.x, topY(q.t), p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Rn(0.8, 1.5)); dummy.updateMatrix(); fi.setMatrixAt(fc, dummy.matrix); fi.setColorAt(fc, tmpC.setHex(colors[(rand() * colors.length) | 0])); fc++; }
      fi.count = fc; group.add(fi);
    }
    yield;
    {
      const pines = [], tooClose = (p, r) => pines.some(q => Math.hypot(q.x - p.x, q.z - p.z) < r);
      const want = COARSE ? 36 : 95;
      for (let tries = 0; tries < want * 14 && pines.length < want; tries++) {
        const edge = rand() < 0.6, t = Rn(22, L - 36); let lat;
        if (edge) { const sd = rand() < 0.5 ? -1 : 1; lat = sd * (neRidgeHW(t, sd) - Rn(2.8, 8)); } else lat = Rn(-neRidgeHW(t, -1) + 3, neRidgeHW(t, 1) - 3);
        if (Math.abs(lat - rdLat(t)) < RG.roadHW + 3.4 || Math.abs(lat) > hwAt(t, lat) - 2.6) continue;
        const s = Rn(1.0, edge ? 2.0 : 1.6), p = W(t, lat); if (tooClose(p, 4.6 * Math.max(0.8, s))) continue;
        pines.push({ x: p.x, z: p.z, y: topY(t), s, a: rand() * 6.28 });
      }
      // pinus di ledge tebing bawah (hiasan saja, tidak terjangkau pemain): hanya di tanah datar
      const ledge = [], wantL = COARSE ? 14 : 44;
      for (let tries = 0; tries < wantL * 20 && ledge.length < wantL; tries++) {
        const t = Rn(0, L), sd = rand() < 0.5 ? -1 : 1, lat = sd * (neRidgeHW(t, sd) + Rn(4, 46)), a = neRidgeToAxis(t, lat), h = neRidgeH(a.d, a.off);
        if (h < 15 || Math.abs(neRidgeH(a.d + 1.5, a.off) - h) > 0.35 || Math.abs(neRidgeH(a.d - 1.5, a.off) - h) > 0.35 || Math.abs(neRidgeH(a.d, a.off + 1.5) - h) > 0.35 || Math.abs(neRidgeH(a.d, a.off - 1.5) - h) > 0.35) continue;
        const p = neAxisToWorld(a.d, a.off); ledge.push({ x: p.x, z: p.z, y: h, s: Rn(1.2, 2.3), a: rand() * 6.28 });
      }
      const all = pines.concat(ledge), n = all.length;
      if (n) {
        const tr = new THREE.InstancedMesh(geo.trunkPine, mat.barkMat, n), lf = new THREE.InstancedMesh(geo.pineLeaf, mat.leafMat(0.02), n);
        all.forEach((q, i) => { dummy.position.set(q.x, q.y, q.z); dummy.quaternion.identity(); dummy.rotation.set(0, q.a, 0); dummy.scale.setScalar(q.s); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix); lf.setMatrixAt(i, dummy.matrix); lf.setColorAt(i, tmpC.setRGB(Rn(0.75, 1.0), Rn(0.9, 1.1), Rn(0.8, 1.05))); if (i < pines.length) colliders.push({ x: q.x, z: q.z, r: 0.34 * q.s }); });
        tr.castShadow = lf.castShadow = true; tr.receiveShadow = lf.receiveShadow = true; group.add(tr, lf);
      }
      // batu besar di puncak (dengan tabrakan) + batu kecil di ledge
      const rocks = [], wantR = COARSE ? 8 : 20;
      for (let i = 0; i < wantR; i++) { const q = topPoint(3, 4.2, 14, L - 40); if (!q) continue; const p = W(q.t, q.lat); rocks.push({ x: p.x, z: p.z, y: topY(q.t), s: Rn(0.9, 2.0), col: true }); }
      for (let i = 0; i < (COARSE ? 6 : 16); i++) { const t = Rn(0, L), sd = rand() < 0.5 ? -1 : 1, lat = sd * (neRidgeHW(t, sd) + Rn(4, 40)), a = neRidgeToAxis(t, lat), h = neRidgeH(a.d, a.off); if (h < 15) continue; const p = neAxisToWorld(a.d, a.off); rocks.push({ x: p.x, z: p.z, y: h, s: Rn(1.0, 2.4), col: false }); }
      if (rocks.length) {
        const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8d8ba3, roughness: 1, flatShading: true }), rocks.length);
        rocks.forEach((q, i) => { dummy.position.set(q.x, q.y + q.s * 0.35, q.z); dummy.quaternion.identity(); dummy.rotation.set(rand() * 0.6, rand() * 6.28, rand() * 0.6); dummy.scale.set(q.s * 1.2, q.s * 0.85, q.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); if (q.col) colliders.push({ x: q.x, z: q.z, r: q.s * 1.05 }); });
        im.castShadow = im.receiveShadow = true; group.add(im);
      }
    }
    yield;

    // ---------- 5) papan nama, tugu batu & bendera di tanjung ujung ----------
    signBoard(['PEGUNUNGAN NAGA', 'DI ATAS AWAN'], W(10, -(RG.roadHW + 5.5)), W(-30, -(RG.roadHW + 5.5)), topY(10));   // di kepala punggungan, menghadap jembatan (terbaca pemain yang baru menyeberang)
    signBoard(['UJUNG PEGUNUNGAN', 'TANJUNG PANDANG'], W(L - 32, RG.roadHW + 5), W(L - 62, RG.roadHW + 5), topY(L - 32));   // sebelum tanjung, menghadap pemain yang datang
    {
      const top = topY(L - 6) + 0.03, cm = new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 1, flatShading: true }), cp = W(L - 6, NE_DESC.edgeLat - 9);
      for (let k = 0; k < 5; k++) { const rk = 1.0 - k * 0.15, m = new THREE.Mesh(new THREE.DodecahedronGeometry(rk, 0), cm); m.position.set(cp.x + Rn(-0.1, 0.1), top + 0.7 + k * 0.85, cp.z + Rn(-0.1, 0.1)); m.rotation.set(rand() * 3, rand() * 6, 0); m.castShadow = true; group.add(m); }
      colliders.push({ x: cp.x, z: cp.z, r: 1.2 });
      const fp = W(L - 6, NE_DESC.edgeLat + 9), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7, 8), wood); pole.position.set(fp.x, top + 3.5, fp.z); pole.castShadow = true; group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshStandardMaterial({ color: 0x7b3fc7, roughness: 0.9, side: THREE.DoubleSide })); flag.position.set(fp.x + 1.1, top + 6.0, fp.z); group.add(flag);
      colliders.push({ x: fp.x, z: fp.z, r: 0.3 });
    }
    yield;

    // ---------- 6) lautan awan low-poly di kedua sisi punggungan (di bawah puncak; bergoyang pelan lewat update) + kabut tipis di ledge ----------
    {
      const stepT = COARSE ? 52 : 28;
      for (const sd of [-1, 1]) for (let t = -50; t <= L + 30; t += stepT) {
        const hw = neRidgeHW0(clampT(t)), w = W(t + Rn(-10, 10), sd * (hw + Rn(20, 70)));
        clouds.push(mkCloud(w.x, Rn(26, 72), w.z, Rn(8, 15), 1, 1));
        if (!COARSE && rand() < 0.7) { const w2 = W(t + Rn(-14, 14), sd * (hw + Rn(70, 130))); clouds.push(mkCloud(w2.x, Rn(16, 54), w2.z, Rn(10, 18), 1, 1)); }
      }
      for (let k = 0, n = COARSE ? 8 : 26; k < n; k++) {
        const t = Rn(0, L), sd = rand() < 0.5 ? -1 : 1, hw = neRidgeHW0(t), w = W(t, sd * (hw + Rn(6, 28))), ht = topY(t);
        mists.push(mkCloud(w.x, (rand() < 0.5 ? ht * 0.34 : ht * 0.67) + Rn(2, 6), w.z, Rn(2.2, 3.8), 0.5, 0.85));
      }
    }
  }

  // ===== JALUR TURUN LEMBAH SALJU: jalan tanah berkelok menuruni tebing berundak dari Tanjung Pandang (ujung Pegunungan Naga) sampai lembah bersalju =====
  //  Bentuk & tinggi tanah dari rumus di kekaisaran-layout.js (neDescHsu): tiap leg jalan berdiri di ledge datar, antar-leg ada tebing; lembah di bawah: salju, sungai beku & jembatan kayu.
  function* buildDescent() {
    const DS = NE_DESC, PT = DS.pts, NP = PT.length, TAU2 = Math.PI * 2, RHW = DS.roadHW;
    const sst = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const hsh = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
    const Pw = (s, u) => { const q = neDescToAxis(s, u); return neAxisToWorld(q.d, q.off); };
    const snowAt = (s, h) => (1 - sst(30, 75, h)) * sst(70, 150, s);   // 0 = rumput & batu (bagian atas), 1 = salju (bagian bawah)
    const vS = DS.valleyS, vU = DS.uEnd, fS = DS.forestS;
    const fExtra = Math.max(0, DS.forestR - 85);   // hutan lebih luas dari semula (85 m): tepi hamparan salju ikut dilebarkan sebesar selisihnya
    const snowDist = (s, u) => { const t = Math.min(1, Math.max(0, (s - vS) / (fS - vS))); return Math.max(0, Math.min(Math.hypot(s - (vS + (fS - vS) * t), u - vU), Math.hypot(s - fS, u - vU) - fExtra)); };   // jarak ke "lorong" salju antara pusat lembah & pusat hutan
    // FIX: hamparan salju dulu hanya di lorong lembah->hutan, jadi tanah sepanjang jalan ke Desa Salju (u > ±60) malah hijau. Sekarang koridor jalan desa + sekeliling desa ikut jadi salju penuh (40 m dari jalan/pagar), lalu memudar ke rumput.
    const VL = NE_VILLAGE, vPts = VL.path.filter((_, i) => i % 3 === 0).concat([VL.path[VL.path.length - 1]]);
    const villDist = (s, u) => { let m = Math.hypot(s - VL.s, u - VL.u) - VL.R; for (const p of vPts) { const d = Math.hypot(s - p.s, u - p.u); if (d < m) m = d; } return Math.max(0, m - 50) * 2.4; };   // 50 m pertama dari jalan/pagar = putih penuh; lebih jauh memudar cepat (di luar jangkauan pemain)
    const snowDist2 = (s, u) => s > fS ? 0 : Math.min(snowDist(s, u), villDist(s, u));   // PERBAIKAN: semua tanah SETELAH hutan (s > fS) = salju penuh, tidak memudar jadi hijau
    const SNOW_A = new THREE.Color(0xf4f8ff), SNOW_B = new THREE.Color(0xd5e3f5), GROUND_C = new THREE.Color(0x4f9c39);

    // ---------- 1) mesh tanah (grid; hanya sel yang ada tanahnya + hamparan salju di lembah). Tiap segitiga diwarnai sendiri: datar atas = rumput, curam = batu abu-ungu, bawah = salju (gaya low-poly) ----------
    {
      const STEP = COARSE ? 2.6 : 1.9, sMin = DS.edgeS - 2, sMax = Math.max(DS.sEnd + 70, DS.forestS + DS.forestR + 14), uLim = 285;   // sMax & uLim ikut Hutan Salju yang diperluas (jari-jari 85 -> 165 m)
      const NI = Math.ceil((sMax - sMin) / STEP), NJ = Math.ceil(2 * uLim / STEP), nv = (NI + 1) * (NJ + 1);
      const o0 = Pw(sMin, -uLim), oS = Pw(sMin + 1, -uLim), oU = Pw(sMin, -uLim + 1);   // pemetaan (s, u) -> dunia linear (rotasi + geser)
      const ux = oS.x - o0.x, uz = oS.z - o0.z, vx = oU.x - o0.x, vz = oU.z - o0.z;
      const Hh = new Float32Array(nv);
      for (let j = 0; j <= NJ; j++) {
        const u = -uLim + j * STEP;
        for (let i = 0; i <= NI; i++) Hh[j * (NI + 1) + i] = neDescHsu(sMin + i * STEP, u);
        if (j % 8 === 7) yield;
      }
      const rockLo = new THREE.Color(0x5f5d78), rockHi = new THREE.Color(0x9a98b2), grassA = new THREE.Color(0x66b03c), grassB = new THREE.Color(0x92d24e), c = new THREE.Color(), tg = new THREE.Color();
      const P = [], C = [], vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
      const vtx = (i, j) => { const d = i * STEP, o = j * STEP; return [o0.x + ux * d + vx * o, Hh[j * (NI + 1) + i] + 0.05, o0.z + uz * d + vz * o]; };
      const inSnowZone = (s, u) => snowDist2(s, u) < 112;
      const tri = (A, B, Cc, sC, uC) => {
        vA.set(...A); vB.set(...B); vC.set(...Cc); n1.subVectors(vC, vB); n2.subVectors(vA, vB); n1.cross(n2).normalize();
        const ny = Math.abs(n1.y), hh = (A[1] + B[1] + Cc[1]) / 3, cx = (A[0] + B[0] + Cc[0]) / 3, cz = (A[2] + B[2] + Cc[2]) / 3, hn = hsh(cx * 0.37, cz * 0.41);
        const sa = snowAt(sC, hh), sf = sa > 0.98 ? 1 : Math.min(1, Math.max(0, sa + (hn - 0.5) * 0.25));   // dasar lembah = salju 100% (tanpa bintik rumput)
        c.copy(rockLo).lerp(rockHi, Math.min(1, Math.max(0, 0.15 + 0.55 * hn + 0.35 * (hh / 110))));
        c.lerp(tg.copy(grassA).lerp(grassB, hn), sst(0.72, 0.9, ny) * (1 - sf));   // datar & di atas = rumput
        c.lerp(tg.copy(SNOW_A).lerp(SNOW_B, hn * 0.6), sf * sst(0.35, 0.7, ny));    // di bawah = salju (tebing curam tetap batu bersalju tipis)
        c.lerp(SNOW_A, sf * 0.22);
        if (hh < 0.6) { c.lerp(GROUND_C, sst(62, 108, snowDist2(sC, uC))); }   // tepi hamparan salju memudar jadi warna tanah supaya tak ada garis batas
        c.multiplyScalar(0.94 + 0.12 * hsh(cz * 0.19, cx * 0.23));
        for (const V of [A, B, Cc]) { P.push(V[0], V[1], V[2]); C.push(c.r, c.g, c.b); }
      };
      for (let j = 0; j < NJ; j++) {
        for (let i = 0; i < NI; i++) {
          const k = j * (NI + 1) + i, sC = sMin + (i + 0.5) * STEP, uC = -uLim + (j + 0.5) * STEP;
          if (Hh[k] <= 0.02 && Hh[k + 1] <= 0.02 && Hh[k + NI + 1] <= 0.02 && Hh[k + NI + 2] <= 0.02 && !inSnowZone(sC, uC)) continue;
          const a = vtx(i, j), b = vtx(i + 1, j), d = vtx(i, j + 1), e = vtx(i + 1, j + 1);
          tri(a, d, b, sC, uC); tri(b, d, e, sC, uC);
        }
        if (j % 8 === 7) yield;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      mesh.receiveShadow = true; mesh.castShadow = true; group.add(mesh); console.log('[dataran-tl] tanah salju v3: ' + (P.length / 9) + ' segitiga');
    }
    yield;

    // ---------- 1b) PERBAIKAN: hamparan SALJU PUTIH di seluruh dataran setelah Hutan Salju ----------
    //  Grid kasar (kotak 8 m; 12 m di HP) mulai dari pusat hutan (s = fS) sampai 800 m di belakang tepi hutan, lebar 900 m ke kiri-kanan. Warna tiap segitiga sedikit diacak supaya gayanya sama dengan salju di lembah.
    //  Ubah S1 (panjang) atau U1 (lebar) kalau hamparan putihnya masih kurang jauh.
    {
      const S0 = fS, S1 = fS + DS.forestR + 800, U1 = 900, ST = COARSE ? 12 : 8, Y = 0.05;
      const NI = Math.ceil((S1 - S0) / ST), NJ = Math.ceil(2 * U1 / ST);
      const o0 = Pw(S0, -U1), oS = Pw(S0 + 1, -U1), oU = Pw(S0, -U1 + 1);   // pemetaan (s, u) -> dunia, sama seperti mesh tanah di atas
      const ux = oS.x - o0.x, uz = oS.z - o0.z, vx = oU.x - o0.x, vz = oU.z - o0.z;
      const P = [], C = [], N = [], col = new THREE.Color();
      const pt = (i, j) => [o0.x + ux * i * ST + vx * j * ST, Y, o0.z + uz * i * ST + vz * j * ST];
      const addTri = (A, B, Cc) => {
        const cx = (A[0] + B[0] + Cc[0]) / 3, cz = (A[2] + B[2] + Cc[2]) / 3, hn = hsh(cx * 0.37, cz * 0.41);
        col.copy(SNOW_A).lerp(SNOW_B, hn * 0.6).multiplyScalar(0.94 + 0.12 * hsh(cz * 0.19, cx * 0.23));
        for (const V of [A, B, Cc]) { P.push(V[0], V[1], V[2]); C.push(col.r, col.g, col.b); N.push(0, 1, 0); }
      };
      for (let j = 0; j < NJ; j++) {
        for (let i = 0; i < NI; i++) { const a = pt(i, j), b = pt(i + 1, j), d = pt(i, j + 1), e = pt(i + 1, j + 1); addTri(a, d, b); addTri(b, d, e); }
        if (j % 16 === 15) yield;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      const snowPlain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));   // offset -1: mesh lembah (-2), jalan & sarang (-3, -4) tetap tampil di atasnya
      snowPlain.receiveShadow = true; group.add(snowPlain); console.log('[dataran-tl] hamparan salju setelah hutan: ' + (P.length / 9) + ' segitiga');
    }
    yield;

    // ---------- 2) jalan tanah (pita mengikuti garis tengah & tinggi jalan; tepinya makin bersalju di bagian bawah) ----------
    const dirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const nrmAt = i => { const p = PT[Math.max(0, i - 1)], q = PT[Math.min(NP - 1, i + 1)], tx = q.s - p.s, ty = q.u - p.u, ln = Math.hypot(tx, ty) || 1; return { s: -ty / ln, u: tx / ln }; };   // normal kiri garis tengah (di bidang s-u)
    {
      const P = [], C = [], I = [], ce = new THREE.Color(0xbf9459), cm = new THREE.Color(0xdcb67a), cc = new THREE.Color();
      let k = 0;
      for (let i = 0; i < NP; i++) {
        const p = PT[i]; if (p.a < 8) continue;
        const nm = nrmAt(i), y = p.h + 0.09, br = 0.94 + 0.12 * hsh(p.a * 0.31, 7.7), sf = snowAt(p.s, p.h);
        for (const [dl, col, sw] of [[-RHW, ce, 0.8], [0, cm, 0.22], [RHW, ce, 0.8]]) { const w = Pw(p.s + nm.s * dl, p.u + nm.u * dl); P.push(w.x, y, w.z); cc.copy(col).multiplyScalar(br).lerp(SNOW_A, sf * sw); C.push(cc.r, cc.g, cc.b); }
        if (k) { const q = (k - 1) * 3; I.push(q, q + 3, q + 1, q + 1, q + 3, q + 4, q + 1, q + 4, q + 2, q + 2, q + 4, q + 5); }
        k++;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
      const road = new THREE.Mesh(g, dirtMat); road.receiveShadow = true; group.add(road);
    }
    {   // cabang jalan kedua di Hutan Salju (NE_DESC.branch): pita tanah yang sama, tepinya bersalju
      const BR = DS.branch, P = [], C = [], I = [], ce = new THREE.Color(0xbf9459), cm = new THREE.Color(0xdcb67a), cc = new THREE.Color();
      for (let i = 0; i < BR.length; i++) {
        const p = BR[i], a = BR[Math.max(0, i - 1)], b = BR[Math.min(BR.length - 1, i + 1)], tx = b.s - a.s, ty = b.u - a.u, ln = Math.hypot(tx, ty) || 1, nm = { s: -ty / ln, u: tx / ln }, br = 0.94 + 0.12 * hsh(i * 0.31, 3.3);
        for (const [dl, col, sw] of [[-RHW, ce, 0.8], [0, cm, 0.22], [RHW, ce, 0.8]]) { const w = Pw(p.s + nm.s * dl, p.u + nm.u * dl); P.push(w.x, 0.09, w.z); cc.copy(col).multiplyScalar(br).lerp(SNOW_A, sw); C.push(cc.r, cc.g, cc.b); }
        if (i) { const q = (i - 1) * 3; I.push(q, q + 3, q + 1, q + 1, q + 3, q + 4, q + 1, q + 4, q + 2, q + 2, q + 4, q + 5); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
      const road2 = new THREE.Mesh(g, dirtMat); road2.receiveShadow = true; group.add(road2);
    }
    yield;

    // ---------- 3) pagar kayu di kedua tepi jalan (tampilan; pemain dijaga di jalan oleh lingkaran area jelajah) ----------
    {
      const posts = [], rails = [], FO = RHW + 0.5, aStop = (PT.find(p => p.s >= DS.sR - 14 && p.a >= DS.aExit) || PT[NP - 1]).a;
      for (const sd of [-1, 1]) {
        let acc = 1e9, prev = null, pp = null;
        for (let i = 0; i < NP; i++) {
          const p = PT[i]; if (p.a < 12 || p.a > aStop) { prev = null; pp = null; continue; }
          if (pp) acc += Math.hypot(p.s - pp.s, p.u - pp.u); pp = p;
          if (acc < 2.4) continue; acc = 0;
          const nm = nrmAt(i), w = Pw(p.s + nm.s * sd * FO, p.u + nm.u * sd * FO), q = new THREE.Vector3(w.x, p.h + 0.03, w.z); posts.push(q); if (prev) rails.push([prev, q]); prev = q;
        }
      }
      const fm = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 1, flatShading: true });
      const pi = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 1.15, 0.18).translate(0, 0.57, 0), fm, Math.max(1, posts.length)), ri = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.08), fm, Math.max(1, rails.length * 2)), ax = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3();
      posts.forEach((q, i) => { dummy.position.copy(q); dummy.quaternion.identity(); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pi.setMatrixAt(i, dummy.matrix); });
      rails.forEach(([q1, q2], i) => { dir.subVectors(q2, q1); const Ll = dir.length(); if (Ll > 6) { for (let k = 0; k < 2; k++) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); ri.setMatrixAt(i * 2 + k, dummy.matrix); } return; } dir.normalize(); for (let k = 0; k < 2; k++) { dummy.position.set((q1.x + q2.x) / 2, (q1.y + q2.y) / 2 + 0.42 + k * 0.42, (q1.z + q2.z) / 2); dummy.quaternion.setFromUnitVectors(ax, dir); dummy.scale.set(Ll, 1, 1); dummy.updateMatrix(); ri.setMatrixAt(i * 2 + k, dummy.matrix); } });
      pi.count = posts.length; ri.count = rails.length * 2; pi.castShadow = ri.castShadow = true; group.add(pi, ri);
      // corong tabrakan di kedua sisi jalan tepat setelah tepi ujung punggungan (area jelajah punggungan masih menjorok ke luar tepi): pemain tetap di jalan
      for (let i = 0; i < NP; i += 1) { const p = PT[i]; if (p.s < DS.edgeS - 1.2 || p.s > 62 || p.a < 12) continue; const nm = nrmAt(i); for (const sd of [-1, 1]) { const w = Pw(p.s + nm.s * sd * (RHW + 1.1), p.u + nm.u * sd * (RHW + 1.1)); colliders.push({ x: w.x, z: w.z, r: 0.9 }); } }
    }
    yield;

    // ---------- 4) lembah salju: sungai beku berkelok + jembatan kayu (jalan menyeberang di u = uEnd) + tabrakan tepi sungai ----------
    {
      const uLo = vU - 118, uHi = vU + 118, Wr = DS.riverW, bank = Wr / 2 + 0.7;
      // pita sungai (biru jernih, tepi es putih); menyempit di kedua ujung seperti sungai yang menghilang di kejauhan
      const P = [], C = [], I = [], water = new THREE.Color(0x58b4ea), ice = new THREE.Color(0xe4f4ff), cw = new THREE.Color(); let k = 0;
      for (let u = uLo; u <= uHi + 0.01; u += 2) {
        const sc = neDescRiverS(u), tp = sst(0, 24, u - uLo) * sst(0, 24, uHi - u), wr = Wr * (0.35 + 0.65 * tp), l = neDescRiverS(u + 1) - neDescRiverS(u - 1), ln = Math.hypot(l, 2), ns = 2 / ln, nu = -l / ln;   // normal sungai (s, u)
        for (const [dl, col, t] of [[-wr / 2 - 0.9, ice, 0], [-wr / 2, water, 0.2], [0, water, 0.5], [wr / 2, water, 0.2], [wr / 2 + 0.9, ice, 0]]) { const w = Pw(sc + ns * dl, u + nu * dl), br = 0.95 + 0.1 * hsh(u * 0.7, dl); P.push(w.x, 0.09 + (col === ice ? 0.01 : 0), w.z); cw.copy(col).multiplyScalar(br).lerp(ice, t * 0.25 * hsh(u, 3.3)); C.push(cw.r, cw.g, cw.b); }
        if (k) { const q = (k - 1) * 5; for (let m = 0; m < 4; m++) I.push(q + m, q + 5 + m, q + m + 1, q + m + 1, q + 5 + m, q + 6 + m); }
        k++;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
      const river = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.05, emissive: 0x2a6fa8, emissiveIntensity: 0.22, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      river.receiveShadow = true; group.add(river);
      // keping es putih mengapung di sungai
      { const n = COARSE ? 14 : 40, im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0xf2f9ff, roughness: 0.6, flatShading: true }), n);
        for (let i = 0; i < n; i++) { const u = Rn(uLo + 14, uHi - 14); if (Math.abs(u - vU) < 8) { dummy.scale.set(0, 0, 0); dummy.position.set(0, -10, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); continue; } const w = Pw(neDescRiverS(u) + Rn(-Wr * 0.3, Wr * 0.3), u); dummy.position.set(w.x, 0.14, w.z); dummy.rotation.set(0, rand() * 6.28, 0); dummy.scale.set(Rn(0.7, 1.6), 1, Rn(0.6, 1.3)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }
        dummy.rotation.set(0, 0, 0); im.receiveShadow = true; group.add(im); }

      // jembatan kayu lurus (searah jalan, sumbu s) di u = vU
      const bL = Wr + 8, bHW = 2.4, deckY = 0.1, deckParts = [], addCol = (g2, cl) => { const nn = g2.attributes.position.count, aa = new Float32Array(nn * 3); for (let i = 0; i < nn; i++) { aa[i * 3] = cl.r; aa[i * 3 + 1] = cl.g; aa[i * 3 + 2] = cl.b; } g2.setAttribute('color', new THREE.BufferAttribute(aa, 3)); return g2; };
      const bm = new THREE.Matrix4(), col = new THREE.Color(), bs0 = DS.sR - bL / 2;
      const bw = Pw(DS.sR, vU), bq = Pw(DS.sR + 1, vU), brot = Math.atan2(bq.x - bw.x, bq.z - bw.z);   // arah dek di dunia (sumbu s)
      const bg = new THREE.Group(); bg.position.set(bw.x, 0, bw.z); bg.rotation.y = brot;   // lokal: +z = searah s, +x = ke samping
      for (let s = 0.4; s < bL; s += 0.8) { const g2 = new THREE.BoxGeometry(bHW * 2, 0.14, 0.74); g2.translate(0, deckY, s - bL / 2); deckParts.push(addCol(g2, col.setHex(0x9a6b3c).offsetHSL(0, 0, (rand() - 0.5) * 0.12))); }
      for (let s = 0.8; s < bL; s += 1.6) for (const sd of [-1, 1]) { const g2 = new THREE.BoxGeometry(0.3, 0.4, 1.64); g2.translate(sd * (bHW - 0.3), deckY - 0.2, s - bL / 2); deckParts.push(addCol(g2, col.setHex(0x5a3d22))); }
      const deck = new THREE.Mesh(mergeGeometries(deckParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); deckParts.forEach(g2 => g2.dispose()); deck.castShadow = deck.receiveShadow = true; bg.add(deck);
      const fm = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 1, flatShading: true });
      for (const sd of [-1, 1]) {
        for (let s = 0; s <= bL + 0.01; s += 2.4) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.15, 0.18).translate(0, 0.57, 0), fm); post.position.set(sd * (bHW - 0.15), deckY, Math.min(s, bL) - bL / 2); post.castShadow = true; bg.add(post); }
        for (let r = 0; r < 2; r++) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, bL), fm); rail.position.set(sd * (bHW - 0.15), deckY + 0.42 + r * 0.42, 0); rail.castShadow = true; bg.add(rail); }
      }
      group.add(bg);
      // tabrakan: tepi sungai (tertutup, kecuali celah selebar jembatan) + pagar kiri-kanan jembatan
      for (let u = vU - 60; u <= vU + 60; u += 1.8) {
        if (Math.abs(u - vU) < bHW + 0.9) continue;
        const sc = neDescRiverS(u); for (const sd of [-1, 1]) { const w = Pw(sc + sd * bank, u); colliders.push({ x: w.x, z: w.z, r: 0.9 }); }
      }
      for (let s = bs0 + 1.5; s <= bs0 + bL - 1.5 + 0.01; s += 1.0) for (const sd of [-1, 1]) { const w = Pw(s, vU + sd * (bHW + 0.35)); colliders.push({ x: w.x, z: w.z, r: 0.6 }); }   // pagar jembatan (pemain tetap di atas dek)
    }
    yield;

    // ---------- 5) pinus, batu & rumput (salju di bagian bawah): ledge-ledge tebing (hiasan) + lembah (ada tabrakan) ----------
    {
      const snowLeafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
      const pines = [], flatAt = (s, u, h) => Math.abs(neDescHsu(s + 1.5, u) - h) < 0.4 && Math.abs(neDescHsu(s - 1.5, u) - h) < 0.4 && Math.abs(neDescHsu(s, u + 1.5) - h) < 0.4 && Math.abs(neDescHsu(s, u - 1.5) - h) < 0.4;
      const nearRiver = (s, u) => Math.abs(s - neDescRiverS(u)) < DS.riverW / 2 + 5 && Math.abs(u - vU) < 120;
      // grid ruang (sel 16 m) supaya cek jarak antar-pohon tetap cepat walau hutan jauh lebih padat; q.rad = jari-jari tambahan (Yeti) yang harus dijauhi pohon
      const CELL = 16, grid = new Map(), gAdd = q => { const k = Math.floor(q.x / CELL) * 100003 + Math.floor(q.z / CELL); const a = grid.get(k); if (a) a.push(q); else grid.set(k, [q]); };
      const tooClose = (p, r) => { const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = grid.get((cx + i) * 100003 + (cz + j)); if (a) for (const q of a) if (Math.hypot(q.x - p.x, q.z - p.z) < r + (q.rad || 0)) return true; } return false; };
      const addPine = q => { pines.push(q); gAdd(q); };

      // ---------- sarang Yeti (musuh; dibuat di game.js dari NE_YETI_SPOTS): hanya sisakan ruang kosong supaya pohon tidak menumpuk di titik itu ----------
      for (const y of NE_YETI_SPOTS) { const p = Pw(y.s, y.u); gAdd({ x: p.x, z: p.z, rad: y.elder ? 5.5 : 2.6 }); }
      // a) di ledge tebing (tidak terjangkau pemain; hanya tampilan)
      const wantL = COARSE ? 40 : 110;
      for (let tries = 0; tries < wantL * 24 && pines.length < wantL; tries++) {
        const s = Rn(DS.edgeS + 14, DS.sExit + 10), u = Rn(-92, 92), h = neDescHsu(s, u); if (h < 6) continue;
        const dd = neDescDist(s, u).d; if (dd < 6.5 || dd > DS.dLedge + 2 || !flatAt(s, u, h)) continue;
        const sc = Rn(1.0, 2.0), p = Pw(s, u); if (tooClose(p, 4.4 * Math.max(0.8, sc))) continue;
        addPine({ x: p.x, z: p.z, y: h, s: sc, a: rand() * 6.28, snow: snowAt(s, h), col: false });
        if (tries % 500 === 499) yield;
      }
      // b) di lembah (di luar jalan & sungai; dengan tabrakan)
      const wantV = COARSE ? 40 : 100, nL = pines.length;
      for (let tries = 0; tries < wantV * 24 && pines.length - nL < wantV; tries++) {
        const ang = rand() * TAU2, rr = Math.sqrt(rand()) * (DS.valleyR - 4), s = vS + Math.cos(ang) * rr, u = vU + Math.sin(ang) * rr;
        if (neDescHsu(s, u) > 0.3 || nearRiver(s, u) || neDescDist(s, u).d < RHW + 3.2) continue;
        const sc = Rn(1.1, 2.1), p = Pw(s, u); if (tooClose(p, 4.2 * Math.max(0.8, sc))) continue;
        addPine({ x: p.x, z: p.z, y: 0, s: sc, a: rand() * 6.28, snow: 1, col: true });
      }
      // c0) HUTAN SALJU: pinus bersalju rapat di seberang jembatan (dengan tabrakan; jalan tetap lapang ke dalam hutan)
      const wantF = COARSE ? 520 : 1350, nF0 = pines.length;   // 150/340 -> 520/1350: hutan diperluas (jari-jari 165 m), kerapatan sama seperti semula
      for (let tries = 0; tries < wantF * 24 && pines.length - nF0 < wantF; tries++) {
        const ang = rand() * TAU2, rr = Math.sqrt(rand()) * (DS.forestR - 3), s = fS + Math.cos(ang) * rr, u = vU + Math.sin(ang) * rr;
        if (s < vS + 22 || nearRiver(s, u) || neDescDist(s, u).d < RHW + 3.0 || neDescHsu(s, u) > 0.3 || neDragonNestKeep(s, u, 4)) continue;
        const sc = Rn(1.3, rand() < 0.12 ? 3.6 : 2.9), p = Pw(s, u); if (tooClose(p, 3.0 * Math.max(0.8, sc))) continue;   // sebagian kecil pohon raksasa
        addPine({ x: p.x, z: p.z, y: 0, s: sc, a: rand() * 6.28, snow: 1, col: true });
        if (tries % 500 === 499) yield;
      }
      for (const snowy of [false, true]) {   // pinus hijau di ledge atas; pinus bertutup salju di bagian bawah & lembah
        const list = pines.filter(q => (q.snow >= 0.5) === snowy), n = list.length; if (!n) continue;
        const tr = new THREE.InstancedMesh(geo.trunkPine, mat.barkMat, n), lf = new THREE.InstancedMesh(geo.pineLeaf, snowy ? snowLeafMat : mat.leafMat(0.02), n);
        list.forEach((q, i) => {
          const kill = neVillageKeep(q.x, q.z);   // pohon di jalan / area Desa Salju dihilangkan (acak tetap dikonsumsi supaya tata letak lain tidak bergeser)
          dummy.position.set(q.x, q.y, q.z); dummy.quaternion.identity(); dummy.rotation.set(0, q.a, 0); dummy.scale.setScalar(kill ? 0.0001 : q.s); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix); lf.setMatrixAt(i, dummy.matrix);
          lf.setColorAt(i, snowy ? tmpC.setRGB(Rn(0.9, 1.0), Rn(0.94, 1.0), 1.0) : tmpC.setRGB(Rn(0.75, 1.0), Rn(0.9, 1.1), Rn(0.8, 1.05)));
          if (q.col && !kill) colliders.push({ x: q.x, z: q.z, r: 0.34 * q.s + 0.15 });
        });
        tr.castShadow = lf.castShadow = true; tr.receiveShadow = lf.receiveShadow = true; group.add(tr, lf);
      }
      // ---------- SARANG NAGA: tanah bulat kosong (tanpa pohon & batu) di ujung cabang jalan; hanya alas tanah, belum ada naganya ----------
      {
        const N = NE_DRAGON_NEST, rings = 8, segs = 48, P = [], Cl = [], Nn = [], I = [], c = new THREE.Color(), dirt = new THREE.Color(0x6b5238), dirt2 = new THREE.Color(0x8a6b47);
        const pc = Pw(N.s, N.u);
        P.push(pc.x, 0.15, pc.z); c.copy(dirt); Cl.push(c.r, c.g, c.b, 1); Nn.push(0, 1, 0);
        for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
          const r = N.R * i / rings, a = j / segs * TAU2, w = Pw(N.s + Math.cos(a) * r, N.u + Math.sin(a) * r), hn = hsh(i * 2.3 + 0.7, j * 1.9 + 0.2), al = 1 - sst(N.R - 4, N.R, r);   // tanah penuh sampai 4 m dari tepi, lalu memudar ke salju
          c.copy(dirt).lerp(dirt2, hn * 0.7).lerp(SNOW_B, sst(N.R * 0.6, N.R, r) * 0.35); P.push(w.x, 0.15, w.z); Cl.push(c.r, c.g, c.b, al); Nn.push(0, 1, 0);
        }
        for (let j = 0; j < segs; j++) { I.push(0, 1 + j, 1 + (j + 1) % segs); }
        for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) { const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + (j + 1) % segs, c2 = 1 + i * segs + j, d2 = 1 + i * segs + (j + 1) % segs; I.push(a, c2, b, b, c2, d2); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 4)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setIndex(I);
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        m.receiveShadow = true; m.renderOrder = -7; group.add(m);
      }
      // ---------- NAGA DEWASA di tengah sarang: model diam menghadap jalan masuk (+ tabrakan badan supaya tidak bisa ditembus) ----------
      {
        const N = NE_DRAGON_NEST, c0 = Pw(N.s, N.u), c1 = Pw(N.s - N.dir.s * 10, N.u - N.dir.u * 10), yaw = Math.atan2(c1.x - c0.x, c1.z - c0.z), fx = Math.sin(yaw), fz = Math.cos(yaw);   // yaw: arah dari pusat sarang ke jalan masuk (model menghadap +z)
        const nestCols = []; for (const off of [-3.2, 0, 3.2]) { const cc = { x: c0.x + fx * off, z: c0.z + fz * off, r: 2.5 }; colliders.push(cc); nestCols.push({ cc, off }); }   // badan naga: tiga lingkaran sepanjang tubuh (disimpan: dimatikan / dipindah saat pertarungan)
        loadDragon().then(gl => {
          if (!gl) return;
          const root = SkeletonUtils.clone(gl.scene), holder = new THREE.Group();
          root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });   // frustumCulled off: kotak pembatas mesh bertulang tidak dapat diandalkan
          const mats = []; root.traverse(m => { if (m.isMesh && m.material && !Array.isArray(m.material)) { m.material = m.material.clone(); mats.push(m.material); } });   // bahan sendiri: dipakai game.js untuk kilatan saat dipukul
          if (gl.animations && gl.animations[DRAGON.clip]) { const mx = new THREE.AnimationMixer(root); mx.clipAction(gl.animations[DRAGON.clip]).play(); mx.setTime(DRAGON.pose); }   // bekukan satu pose
          root.scale.setScalar(1); root.updateMatrixWorld(true);
          let k = DRAGON.scale; try { const h0 = new THREE.Box3().setFromObject(root, true); const hh = h0.max.y - h0.min.y; if (isFinite(hh) && hh > 0.1) k = DRAGON.height / hh; } catch (err) { /* pakai scale cadangan */ }   // skala supaya tinggi naga = DRAGON.height meter
          root.scale.setScalar(k); root.updateMatrixWorld(true);
          try { const b = new THREE.Box3().setFromObject(root, true); if (isFinite(b.min.y) && b.max.y - b.min.y > 0.1) root.position.set(-(b.min.x + b.max.x) / 2, 0.12 - b.min.y, -(b.min.z + b.max.z) / 2); } catch (err) { /* tanpa pemusatan */ }   // kaki di tanah, badan di tengah sarang
          holder.add(root); holder.position.set(c0.x, 0, c0.z); holder.rotation.y = yaw + DRAGON.face; group.add(holder);
          // ---- animasi: sayap membuka dari lipatan lalu mengepak + badan naik-turun + ekor / leher bergoyang + menoleh ----
          //  Klip 'cyclewalk' membekukan sayap dalam keadaan TERLIPAT; pose diam model aslinya (rotasi simpul di gl.scene) justru terbentang. Jadi: mulai dari pose lipat → buka ke pose bentang → kepak.
          try {
            const UP = new THREE.Vector3(0, 1, 0), wp = new THREE.Vector3(), wp2 = new THREE.Vector3(), tq = new THREE.Quaternion();
            const B = n => root.getObjectByName(n), bones = [], wingAll = [], shName = sd => sd === 'L' ? 'base__asa_L_Ossos' : 'base_asa__R_Ossos';   // nama bahu kanan di model memang berbeda ejaan dari yang kiri
            for (const sd of ['L', 'R']) {   // semua tulang di bawah bahu (termasuk jari-jari selaput): simpan pose lipat (dari klip) & pose bentang (rotasi simpul asli)
              const sh = B(shName(sd)); if (!sh) { console.warn('tulang bahu tidak ditemukan: ' + shName(sd)); continue; }
              sh.traverse(b => { if (!b.isBone) return; const o = gl.scene.getObjectByName(b.name); wingAll.push({ b, fold: b.quaternion.clone(), open: o ? o.quaternion.clone() : b.quaternion.clone() }); });
            }
            for (const r of wingAll) r.b.quaternion.copy(r.open);   // sementara bentangkan dulu supaya sumbu & arah kepak dihitung dari pose terbuka
            root.updateMatrixWorld(true);
            const add = (name, axis, amp, ph, sign = 1, hz = 1) => {   // putar tulang di sekitar sumbu dunia 'axis' (diubah ke ruang induk tulang pada pose terbuka)
              const b = B(name); if (!b || !b.parent) return;
              b.parent.getWorldQuaternion(tq);
              bones.push({ b, q0: b.quaternion.clone(), ax: axis.clone().applyQuaternion(tq.clone().invert()).normalize(), amp: amp * sign, ph, hz, q: new THREE.Quaternion(), wing: hz === 1 });
            };
            const tL = B('ponta_01_asa_L_Ossos'), tR = B('ponta_01_asa_R_Ossos');
            if (tL && tR) {
              tL.getWorldPosition(wp); tR.getWorldPosition(wp2);   // bentang sayap diukur dari ujung kiri-kanan (bahu kiri & kanan berada di titik yang sama)
              const span = wp2.clone().sub(wp).setY(0).normalize(), fwd = new THREE.Vector3().crossVectors(span, UP).normalize();   // fwd = sumbu putar kepak (searah badan)
              const upSign = side => { const tip = B('ponta_01_asa_' + side + '_Ossos'), base = B(shName(side)); if (!tip || !base) return 1; tip.getWorldPosition(wp); base.getWorldPosition(wp2); return Math.sign(new THREE.Vector3().crossVectors(fwd, wp.sub(wp2)).y) || 1; };
              for (const side of ['L', 'R']) {
                const sg = upSign(side), A = DRAGON.flapAmp;
                add(shName(side), fwd, A, 0, sg);                 // bahu
                add('articulac_asa_' + side + '_Ossos', fwd, A * 0.65, -0.7, sg);   // siku (tertinggal sedikit = sayap melengkung)
                add('base_01_asa_' + side + '_Ossos', fwd, A * 0.5, -1.4, sg);      // pergelangan
                add('ponta_asa_' + side + '_Ossos', fwd, A * 0.4, -2.0, sg);        // ujung jari sayap
              }
            }
            const tail = ['calda_001_Ossos', 'calda_002_Ossos', 'calda_003_Ossos', 'calda_004_Ossos', 'calda_005_Ossos', 'calda_006_Ossos'];
            tail.forEach((n, i) => add(n, UP, DRAGON.tailSway * (0.5 + i * 0.2), -i * 0.55, 1, 0.45));   // ekor menyapu kiri-kanan seperti gelombang
            add('base_pescoco_Ossos', UP, DRAGON.neckSway, 0.4, 1, 0.3); add('pescoco_Ossos', UP, DRAGON.neckSway * 0.8, 0.9, 1, 0.3);   // leher menoleh pelan
            for (const r of wingAll) r.b.quaternion.copy(r.fold);   // kembali ke pose lipat: animasi dimulai dengan sayap menutup
            const y0 = root.position.y, yaw0 = yaw + DRAGON.face; let t = 0, tc = 0, yawNow = yaw0;   // tc = waktu sejak ditantang (sebelum itu sayap tetap terlipat)
            // Antarmuka untuk game.js (percakapan, tantangan & pertarungan). Status 'challenged' / 'defeated' dipertahankan walau chunk dibangun ulang.
            //   near(x, z, r)        → true bila pemain cukup dekat untuk bicara
            //   challenge()          → naga membentangkan sayap & mengepak, lalu memicu event 'naga-kuno-tantangan' di globalThis (game.js memulai pertarungan)
            //   beginBattle()        → game.js mengambil model (holder) untuk dijadikan musuh; tabrakan sarang dimatikan
            //   endBattle(reset, at) → model dikembalikan ke sarang: reset = true (pemain kalah / kabur) → kembali ke tempat semula & sayap menutup; false (naga kalah) → tetap di tempat jatuh (at = {x, z, yaw})
            const prev = globalThis.NAGA_KUNO, home = { x: c0.x, z: c0.z, yaw: yaw0 }, bone = n => root.getObjectByName(n);
            const ND = globalThis.NAGA_KUNO = { challenged: !!(prev && prev.challenged), defeated: !!(prev && prev.defeated), battle: false, x: c0.x, z: c0.z, yaw: yaw0, R: N.R, home, holder,
              near: (x, z, r = DRAGON.talkR) => Math.hypot(x - ND.x, z - ND.z) <= r,
              mouth: out => { const b = bone('boca_superior_Ossos') || bone('base_boca_sup_Ossos'); return b ? b.getWorldPosition(out) : null; },
              place(x, z, yw) { ND.x = x; ND.z = z; ND.yaw = yw; yawNow = yw; holder.position.set(x, 0, z); holder.rotation.set(0, yw, 0); for (const { cc, off } of nestCols) { cc.x = x + Math.sin(yw - DRAGON.face) * off; cc.z = z + Math.cos(yw - DRAGON.face) * off; cc.r = 2.5; } },
              challenge() { if (ND.challenged) return; ND.challenged = true; try { globalThis.dispatchEvent(new CustomEvent('naga-kuno-tantangan', { detail: { x: ND.x, z: ND.z } })); } catch (e) { /* abaikan */ } },
              beginBattle() { if (ND.battle) return null; ND.battle = true; for (const { cc } of nestCols) cc.r = 0.05; return { holder, mats, mouth: ND.mouth }; },   // tabrakan sarang dikecilkan (bukan 0: hindari pembagian nol di chunks.js)
              endBattle(reset, at) { if (!ND.battle) return; ND.battle = false; group.add(holder); root.position.y = y0; if (reset) { ND.challenged = false; tc = 0; ND.place(home.x, home.z, home.yaw); } else ND.place(at ? at.x : ND.x, at ? at.z : ND.z, at ? at.yaw : ND.yaw); } };
            dragonUpd = (dt, pp) => {
              t += dt; if (ND.challenged && !ND.defeated) tc += dt; else tc = Math.max(0, tc - dt * 1.2);   // dikalahkan: sayap menutup pelan
              const k = Math.min(1, Math.max(0, (tc - DRAGON.openDelay) / DRAGON.openTime)), open = k * k * (3 - 2 * k), calm = 0.5 + 0.5 * open;   // 0 = terlipat, 1 = terbentang (smoothstep)
              for (const r of wingAll) r.b.quaternion.slerpQuaternions(r.fold, r.open, open);
              const w = t * DRAGON.flapHz * Math.PI * 2, env = (0.8 + 0.2 * Math.sin(t * 0.35)) * open * open;   // kepakan makin kuat seiring sayap membuka
              for (const r of bones) {
                if (r.wing) r.q0.copy(r.b.quaternion);   // dasar gerak sayap = pose hasil membuka
                const ang = r.wing ? r.amp * (Math.sin(w + r.ph) + 0.22 * Math.sin(2 * (w + r.ph) + 0.6)) * env : r.amp * calm * Math.sin(t * r.hz * Math.PI * 2 + r.ph);   // sayap = kepak; ekor / leher = goyang pelan
                r.b.quaternion.copy(r.q0).premultiply(r.q.setFromAxisAngle(r.ax, ang));
              }
              root.position.y = y0 + DRAGON.hover * open * (ND.battle ? 0.4 : 1) * (0.5 + 0.5 * Math.sin(w - 1.2));   // badan terangkat mengikuti hentakan sayap
              if (!ND.battle) {   // (saat bertarung arah hadap diatur game.js)
                let tgt = home.yaw;   // pemain dalam jarak 30 m: naga memutar badan pelan menghadap pemain; jauh: kembali menghadap jalan masuk
                if (pp && Math.hypot(pp.x - ND.x, pp.z - ND.z) < 30) tgt = Math.atan2(pp.x - ND.x, pp.z - ND.z) + DRAGON.face;
                yawNow += (((tgt - yawNow + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 1.5);
                holder.rotation.y = yawNow + Math.sin(t * 0.4) * DRAGON.look * calm;   // + menoleh pelan ke kiri-kanan
              }
            };
          } catch (err) { console.warn('animasi naga gagal disiapkan', err); }
        });
      }
      // c) batu abu-ungu (sebagian bersalju) di ledge & lembah; yang di lembah punya tabrakan
      const rocks = [], wantR = COARSE ? 14 : 36;
      for (let tries = 0; tries < wantR * 20 && rocks.length < wantR; tries++) {
        const inV = rocks.length % 2 === 1, s = inV ? vS + Rn(-48, 48) : Rn(DS.edgeS + 14, DS.sExit), u = inV ? vU + Rn(-48, 48) : Rn(-90, 90), h = neDescHsu(s, u);
        if (inV ? (h > 0.3 || Math.hypot(s - vS, u - vU) > DS.valleyR - 4 || nearRiver(s, u)) : h < 6) continue;
        const dd = neDescDist(s, u).d; if (dd < RHW + 3.5 || (!inV && (dd > DS.dLedge + 2 || !flatAt(s, u, h)))) continue;
        const p = Pw(s, u); rocks.push({ x: p.x, z: p.z, y: h, s: Rn(0.9, 2.2), col: inV, sn: snowAt(s, h) });
      }
      for (let tries = 0, n = 0, wantRF = COARSE ? 22 : 60; tries < wantRF * 30 && n < wantRF; tries++) {   // batu bersalju tambahan di dalam Hutan Salju (dengan tabrakan)
        const ang = rand() * TAU2, rr = Math.sqrt(rand()) * (DS.forestR - 6), s = fS + Math.cos(ang) * rr, u = vU + Math.sin(ang) * rr, sz = Rn(0.9, 2.4);
        if (s < vS + 40 || nearRiver(s, u) || neDescDist(s, u).d < RHW + 3.5 + sz || neDescHsu(s, u) > 0.3 || neDragonNestKeep(s, u, 2 + sz)) continue;
        const p = Pw(s, u); if (tooClose(p, 2.4 + sz * 1.1)) continue;
        rocks.push({ x: p.x, z: p.z, y: 0, s: sz, col: true, sn: 0.9 }); gAdd({ x: p.x, z: p.z, rad: 0 }); n++;
      }
      if (rocks.length) {
        const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), rocks.length);
        rocks.forEach((q, i) => { const kill = neVillageKeep(q.x, q.z); dummy.position.set(q.x, q.y + q.s * 0.35, q.z); dummy.quaternion.identity(); dummy.rotation.set(rand() * 0.6, rand() * 6.28, rand() * 0.6); dummy.scale.set(q.s * 1.2, q.s * 0.85, q.s); if (kill) dummy.scale.setScalar(0.0001); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.setHex(0x8d8ba3).lerp(SNOW_A, q.sn * 0.55)); if (q.col && !kill) colliders.push({ x: q.x, z: q.z, r: q.s * 1.05 }); });
        im.castShadow = im.receiveShadow = true; group.add(im);
      }
      // d) rumput kecil di ledge atas (di bawah: tidak ada karena tertutup salju)
      { const nG = COARSE ? 250 : 800, im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 0.7, 4).translate(0, 0.35, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), nG); let cnt = 0;
        for (let i = 0; i < nG; i++) { const s = Rn(DS.edgeS + 4, 170), u = Rn(-60, 60), h = neDescHsu(s, u); if (h < 40 || snowAt(s, h) > 0.2) continue; const dd = neDescDist(s, u).d; if (dd < RHW + 0.6 || dd > DS.dLedge + 1) continue; const p = Pw(s, u); dummy.position.set(p.x, h, p.z); dummy.rotation.set(Rn(-0.2, 0.2), rand() * 6.28, Rn(-0.2, 0.2)); dummy.scale.set(Rn(0.8, 1.6), Rn(0.7, 1.9), Rn(0.8, 1.6)); dummy.updateMatrix(); im.setMatrixAt(cnt, dummy.matrix); im.setColorAt(cnt, tmpC.setRGB(Rn(0.25, 0.42), Rn(0.55, 0.75), Rn(0.18, 0.3))); cnt++; }
        im.count = cnt; group.add(im); }
    }
    yield;

    // ---------- 6) papan nama + lautan awan & kabut di sekitar tebing ----------
    {
      const sA = PT.find(p => p.a >= 13);
      signBoard(['JALUR TURUN', 'MENUJU LEMBAH SALJU'], Pw(sA.s, sA.u + RHW + 3.2), Pw(sA.s - 30, sA.u + RHW + 3.2), sA.h);   // di awal jalan turun, menghadap pemain yang datang dari tanjung
      const pe = PT.find(p => p.s >= DS.sR - 26 && p.a >= DS.aExit), pf = PT.find(p => p.s >= fS - 70); signBoard(['LEMBAH SALJU', 'SUNGAI BEKU'], Pw(pe.s, pe.u + RHW + 3.4), Pw(pe.s - 30, pe.u + RHW + 3.4), 0);   // sebelum jembatan, menghadap pemain yang datang
      signBoard(['HUTAN SALJU', 'HATI-HATI TERSESAT'], Pw(pf.s, pf.u + RHW + 3.4), Pw(pf.s - 30, pf.u + RHW + 3.4), 0);   // di mulut hutan, menghadap pemain yang datang dari jembatan
      { const pb = PT.find(p => p.s >= DS.branchS0 - 22); signBoard(['JALAN BERCABANG', 'HATI-HATI DI HUTAN'], Pw(pb.s, pb.u + RHW + 3.4), Pw(pb.s - 30, pb.u + RHW + 3.4), 0); }   // sebelum percabangan, menghadap pemain yang datang
      { const py = PT.find(p => p.s >= fS + 55) || PT[NP - 1]; signBoard(['SARANG YETI', 'JANGAN DIGANGGU'], Pw(py.s, py.u + RHW + 3.4), Pw(py.s - 30, py.u + RHW + 3.4), 0); }   // jauh di dalam hutan, menghadap pemain yang datang
      for (let i = 0, n = COARSE ? 8 : 22; i < n; i++) {   // awan di kiri-kanan tebing (di bawah ledge atas)
        const s = Rn(DS.edgeS + 10, DS.sExit + 40), sd = rand() < 0.5 ? -1 : 1, u = sd * Rn(60, 125), w = Pw(s, u);
        clouds.push(mkCloud(w.x, Rn(16, 70), w.z, Rn(8, 15), 1, 1));
      }
      for (let i = 0, n = COARSE ? 8 : 24; i < n; i++) {   // kabut tipis di ledge-ledge (berdenyut pelan)
        const s = Rn(DS.edgeS + 20, DS.sExit), u = Rn(-50, 50), h = neDescHsu(s, u); if (h < 14) continue;
        const w = Pw(s, u); mists.push(mkCloud(w.x, h + Rn(2, 6), w.z, Rn(2.2, 3.8), 0.5, 0.85));
      }
    }
  }

  // ===== DESA SALJU HENING: desa kecil bersalju di sisi KANAN lembah (kerangka & tata letak: NE_VILLAGE di kekaisaran-layout.js) =====
  //  Pagar kayu berpintu gerbang, alun-alun batu dengan api unggun, 8 rumah + Balai Desa melingkar mengelilingi alun-alun, lampu jalan, manusia salju, pinus bersalju, 4 obelisk es pelindung & salju turun pelan.
  //  Tanpa PointLight (jumlah lampu berubah saat chunk tampil/hilang = shader dikompilasi ulang): cahaya api unggun memakai bercak aditif di tanah. Tabrakan: lingkaran-lingkaran kecil (rumah, pagar, pohon dalam pagar).
  let villageUpd = null;
  function* buildSnowVillage() {
    const V = NE_VILLAGE;
    let vseed = 20261110;   // generator acak sendiri: tidak menggeser acak elemen lain di padang
    const vr = () => { vseed |= 0; vseed = vseed + 0x6D2B79F5 | 0; let t = Math.imul(vseed ^ vseed >>> 15, 1 | vseed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const Vn = (a, b) => a + vr() * (b - a);
    const hsh = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
    const sst = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const Pw = (s, u) => { const q = neDescToAxis(s, u); return neAxisToWorld(q.d, q.off); };
    const polar = (r, ang) => Pw(V.s + Math.cos(ang) * r, V.u + Math.sin(ang) * r);   // (jari-jari, sudut dari +s ke +u) dari pusat desa -> dunia
    const C0 = Pw(V.s, V.u), GA = V.gateAng, obe = [];   // obe: kristal obelisk (dianimasikan di villageUpd)
    const SNOW_A = new THREE.Color(0xf4f8ff), SNOW_B = new THREE.Color(0xd5e3f5), GROUND_C = new THREE.Color(0x4f9c39);

    // ---------- bahan bangunan: semua bagian berwarna digabung jadi satu mesh (S), jendela/lampu menyala jadi mesh lain (Wn) ----------
    const S = [], Wn = [], tc = new THREE.Color(), HM = new THREE.Matrix4();
    const G = (g, hex, jit = 0) => {   // non-indeks + warna vertex (supaya semua bagian bisa digabung)
      const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); n.deleteAttribute('uv'); if (!n.attributes.normal) n.computeVertexNormals();
      tc.setHex(hex); if (jit) tc.offsetHSL(0, 0, (vr() - 0.5) * jit);
      const k = n.attributes.position.count, a = new Float32Array(k * 3); for (let i = 0; i < k; i++) { a[i * 3] = tc.r; a[i * 3 + 1] = tc.g; a[i * 3 + 2] = tc.b; }
      n.setAttribute('color', new THREE.BufferAttribute(a, 3)); return n;
    };
    const loc = (list, geo, hex, jit = 0) => { const g = G(geo, hex, jit); g.applyMatrix4(HM); list.push(g); };   // HM = pose benda saat ini (putar + geser)
    const bx = (list, w, h, d, x, y, z, hex, jit = 0) => loc(list, new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex, jit);
    const gable = (L, Sp, hr) => {   // prisma atap pelana: bubungan sepanjang x, lereng ke ±z
      const a = L / 2, b = Sp / 2, v = [-a, 0, -b, -a, 0, b, -a, hr, 0, a, 0, b, a, 0, -b, a, hr, 0, -a, 0, b, a, 0, b, a, hr, 0, -a, 0, b, a, hr, 0, -a, hr, 0, a, 0, -b, -a, 0, -b, -a, hr, 0, a, 0, -b, -a, hr, 0, a, hr, 0];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
    };
    const faceCenter = p => HM.makeRotationY(Math.atan2(C0.x - p.x, C0.z - p.z)).setPosition(p.x, 0, p.z);   // sumbu +z lokal menghadap pusat desa

    // ---------- 1) tanah salju bundar (tepi memudar ke rumput) + selimut salju & jalan tanah di sepanjang jalan desa ----------
    if (false) {   // lingkaran alas desa DIHAPUS (tampil hijau); ubah false -> true untuk menampilkannya lagi
      const Rd = V.R + 40, rings = 22, segs = 56, P = [], Cl = [], N = [], I = [], c = new THREE.Color();
      for (let i = 0; i <= rings; i++) for (let j = 0; j < segs; j++) {
        const r = Rd * i / rings, a = j / segs * Math.PI * 2, w = polar(r, a), hn = hsh(i * 3.1 + 1.3, j * 1.7 + 0.4), al = 1 - sst(Rd - 12, Rd, r);   // salju penuh sampai 12 m dari tepi lingkaran, lalu memudar
        c.copy(SNOW_A).lerp(SNOW_B, hn * 0.55);
        P.push(w.x, 0.16, w.z); Cl.push(c.r, c.g, c.b, al); N.push(0, 1, 0);
      }
      for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * segs + j, b = i * segs + (j + 1) % segs, c2 = (i + 1) * segs + j, d2 = (i + 1) * segs + (j + 1) % segs; I.push(a, c2, b, b, c2, d2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 4)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.receiveShadow = true; m.renderOrder = -8; group.add(m);   // lapisan salju dinaikkan ±16 cm di atas tanah (tipis = berkedip / z-fighting dari jauh) + urutan gambar tetap
    }
    {   // pita di sepanjang jalan: selimut salju lebar (tepi transparan) + jalan tanah padat di tengahnya
      const PT = V.path.concat([{ s: 296, u: 114 }, { s: 296, u: 119 }]), n = PT.length, c = new THREE.Color();
      // FIX: selimut salju (y 0,18) menimpa sungai beku (y 0,09) di sepanjang jalan desa -> sungai tampak terputus. mk(s,u) = pengali alpha (0 di atas sungai).
      const rvMask = (s, u) => { const D = NE_DESC, uLo = D.uEnd - 118, uHi = D.uEnd + 118; if (u < uLo || u > uHi) return 1; const tp = sst(0, 24, u - uLo) * sst(0, 24, uHi - u), hw = D.riverW * (0.35 + 0.65 * tp) / 2 + 0.9; return sst(hw + 0.4, hw + 3.2, Math.abs(s - neDescRiverS(u))); };
      const ribbonMesh = (offs, als, cols, y, po, ro, mk) => {
        const P = [], Cl = [], N = [], I = [], k = offs.length;
        for (let i = 0; i < n; i++) {
          const a = PT[Math.max(0, i - 1)], b = PT[Math.min(n - 1, i + 1)], dl = Math.hypot(b.s - a.s, b.u - a.u) || 1, ts = (b.s - a.s) / dl, tu = (b.u - a.u) / dl, ns = -tu, nu = ts;
          offs.forEach((o, q) => { const ws = PT[i].s + ns * o, wu = PT[i].u + nu * o, w = Pw(ws, wu); c.setHex(cols[q]).multiplyScalar(0.96 + 0.08 * hsh(i * 0.7, q * 3.3)); P.push(w.x, y, w.z); Cl.push(c.r, c.g, c.b, als[q] * (mk ? mk(ws, wu) : 1)); N.push(0, 1, 0); });
          if (i < n - 1) for (let q = 0; q < k - 1; q++) { const a0 = i * k + q, a1 = a0 + 1, b0 = (i + 1) * k + q, b1 = b0 + 1; I.push(a0, b0, a1, a1, b0, b1); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 4)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po }));
        m.receiveShadow = true; m.renderOrder = ro; group.add(m);
      };
      const bo = [], ba = [], bc = [];   // profil selimut dirapatkan (tiap 2 m) supaya lubang di atas sungai tajam
      for (let o = -24; o <= 24.01; o += 2) { const ao = Math.abs(o); bo.push(o); ba.push(ao <= 7 ? 1 : ao <= 14 ? 1 - 0.2 * (ao - 7) / 7 : 0.8 * (1 - (ao - 14) / 10)); bc.push(ao <= 7 ? 0xf4f8ff : ao <= 14 ? 0xf0f5fc : 0xe6eef8); }
      const SHOW_VILLAGE_ROAD = false;   // jalan ke Desa Salju disembunyikan (tanah salju di bawahnya sudah putih); ubah ke true untuk menampilkannya lagi
      if (SHOW_VILLAGE_ROAD) ribbonMesh(bo, ba, bc, 0.18, -3, -7, rvMask);   // selimut salju lebar (±24 m), tepinya memudar halus ke rumput
      if (SHOW_VILLAGE_ROAD) ribbonMesh([-3, -2, 0, 2, 3], [0, 1, 1, 1, 0], [0xe8edf5, 0xd3dae5, 0xc8d0dd, 0xd3dae5, 0xe8edf5], 0.2, -4, -6);   // jalan salju padat (putih keabuan, bukan cokelat)
    }
    yield;

    // ---------- 2) alun-alun batu + api unggun + lampu jalan ----------
    HM.identity();
    const fireDisk = new THREE.CircleGeometry(V.plazaR, 28).rotateX(-Math.PI / 2).translate(C0.x, 0.26, C0.z); loc(S, fireDisk, 0x8d95a6, 0.04);
    loc(S, new THREE.RingGeometry(V.plazaR - 1.0, V.plazaR, 28).rotateX(-Math.PI / 2).translate(C0.x, 0.28, C0.z), 0x6d7585, 0.03);
    loc(S, new THREE.RingGeometry(3.2, 3.9, 24).rotateX(-Math.PI / 2).translate(C0.x, 0.28, C0.z), 0xb4bccb, 0.03);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.2, g = new THREE.DodecahedronGeometry(0.42, 0).scale(1, 0.75, 1).rotateY(vr() * 6).translate(C0.x + Math.cos(a) * 1.4, 0.3, C0.z + Math.sin(a) * 1.4); loc(S, g, 0x7d8594, 0.12); }   // lingkaran batu api unggun
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.4, g = new THREE.BoxGeometry(1.8, 0.24, 0.24).rotateZ(0.42).rotateY(a).translate(C0.x + Math.cos(a) * 0.1, 0.4, C0.z - Math.sin(a) * 0.1); loc(S, g, 0x5a3b22, 0.1); }   // kayu bakar
    colliders.push({ x: C0.x, z: C0.z, r: 1.75 });
    const lamp = (x, z) => { HM.identity(); bx(S, 0.16, 2.9, 0.16, x, 1.45, z, 0x3b2a1c); bx(S, 0.5, 0.1, 0.5, x, 3.0, z, 0x2e2e36); bx(S, 0.62, 0.1, 0.62, x, 3.42, z, 0xf4f8ff); bx(Wn, 0.34, 0.4, 0.34, x, 3.2, z, 0xffd27a); colliders.push({ x, z, r: 0.28 }); };
    for (let i = 0; i < 6; i++) { const p = polar(V.plazaR + 2.4, GA + (i + 0.5) / 6 * Math.PI * 2); lamp(p.x, p.z); }   // lampu mengitari alun-alun
    for (const sd of [-1, 1]) { const p = polar(V.fenceR - 3.2, GA + sd * 0.24); lamp(p.x, p.z); }   // dan di kiri-kanan gerbang
    // manusia salju
    for (const sd of [-1, 1]) {
      const p = polar(V.plazaR + 1.2, GA + sd * 0.95); HM.identity();
      for (const [r, y, hx] of [[0.82, 0.72, 0xf6faff], [0.6, 1.9, 0xf6faff], [0.42, 2.78, 0xf6faff]]) loc(S, new THREE.SphereGeometry(r, 8, 6).translate(p.x, y, p.z), hx, 0.04);
      const f = Math.atan2(C0.x - p.x, C0.z - p.z), fx = Math.sin(f), fz = Math.cos(f);
      loc(S, new THREE.ConeGeometry(0.1, 0.55, 5).rotateX(Math.PI / 2).rotateY(f).translate(p.x + fx * 0.5, 2.78, p.z + fz * 0.5), 0xf2762a);   // hidung wortel
      for (const e of [-1, 1]) loc(S, new THREE.SphereGeometry(0.06, 5, 4).translate(p.x + fx * 0.4 + fz * e * 0.16, 2.88, p.z + fz * 0.4 - fx * e * 0.16), 0x1d1d22);
      loc(S, new THREE.CylinderGeometry(0.26, 0.3, 0.38, 8).translate(p.x, 3.3, p.z), 0x2a2a34); loc(S, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8).translate(p.x, 3.1, p.z), 0x2a2a34);
      colliders.push({ x: p.x, z: p.z, r: 0.75 });
    }
    yield;

    // ---------- 3) rumah-rumah (8) + Balai Desa melingkar mengelilingi alun-alun ----------
    const wallCols = [0x8a5a3a, 0x9b6b45, 0x7a4f33, 0xa87a52, 0x72849a, 0x8f6a4a, 0x6e5a48, 0x9a7a5a], roofCols = [0x4a3a34, 0x3f4f68, 0x5a3d3a, 0x3a4a44];
    const house = (p, w, d, wallH, hex, roofHex, roofH, grand) => {
      faceCenter(p);
      const hr = roofH, snowSp = (d + 1.1) * 0.75, snowH = hr * 0.75;
      bx(S, w, wallH, d, 0, wallH / 2, 0, hex, 0.07);                                         // dinding kayu
      bx(S, w + 0.3, 0.38, d + 0.3, 0, 0.19, 0, 0x6a6a72, 0.05);                               // pondasi batu
      loc(S, gable(w + 1.0, d + 1.1, hr).translate(0, wallH, 0), roofHex, 0.05);               // atap
      loc(S, gable(w + 1.12, snowSp, snowH).translate(0, wallH + hr * 0.25 + 0.07, 0), 0xf6faff, 0.03);   // salju di atap (tepi bawah atap tetap kelihatan)
      bx(S, 1.15, 2.05, 0.12, 0, 1.03, d / 2 + 0.02, 0x4a2c1a); bx(S, 1.55, 0.16, 0.75, 0, 0.28, d / 2 + 0.42, 0xdfe5ee);   // pintu + undakan bersalju
      const nW = w > 11 ? 3 : w > 5.5 ? 2 : 1, wy = wallH * 0.58;
      for (let k = 0; k < nW; k++) for (const sd of [-1, 1]) {   // jendela menyala di depan (kiri-kanan pintu), pas dengan lebar rumah
        const x = sd * (1.55 + k * 2.6); if (Math.abs(x) > w / 2 - 0.7) continue;
        bx(S, 1.08, 1.08, 0.05, x, wy, d / 2 + 0.02, 0x3a2616); bx(Wn, 0.84, 0.84, 0.06, x, wy, d / 2 + 0.05, vr() < 0.5 ? 0xffd48a : 0xffbf6a); bx(S, 1.16, 0.1, 0.16, x, wy - 0.58, d / 2 + 0.06, 0xdfe5ee);
      }
      for (const sd of [-1, 1]) { bx(S, 0.05, 1.08, 1.08, sd * (w / 2 + 0.02), wy, 0, 0x3a2616); bx(Wn, 0.06, 0.84, 0.84, sd * (w / 2 + 0.05), wy, 0, 0xffc873); }   // jendela di sisi
      const Hc = hr * 0.85 + 0.55; bx(S, 0.8, Hc, 0.8, -w * 0.28, wallH + Hc / 2, -d * 0.12, 0x777783, 0.06); bx(S, 1.0, 0.14, 1.0, -w * 0.28, wallH + Hc + 0.05, -d * 0.12, 0xf6faff);   // cerobong + salju
      if (grand) {   // Balai Desa: panji biru-putih di bubungan + tiang beranda
        bx(S, 0.12, 3.4, 0.12, w / 2 - 1.3, wallH + hr + 1.3, 0, 0x3b2a1c); bx(S, 1.9, 0.95, 0.05, w / 2 - 0.3, wallH + hr + 2.5, 0, 0x2d6fd0); bx(S, 1.9, 0.2, 0.06, w / 2 - 0.3, wallH + hr + 2.5, 0, 0xffffff);
        for (const sd of [-1, 1]) bx(S, 0.3, wallH, 0.3, sd * (w / 2 - 0.8), wallH / 2, d / 2 + 1.0, 0x5a3d22);
        bx(S, w - 0.6, 0.18, 1.4, 0, wallH + 0.0, d / 2 + 0.7, 0x4a3a34); bx(S, w - 0.5, 0.1, 1.5, 0, wallH + 0.12, d / 2 + 0.7, 0xf6faff);
      }
      const ry = Math.atan2(C0.x - p.x, C0.z - p.z), cs = Math.cos(ry), sn = Math.sin(ry);   // tabrakan: kisi lingkaran r = 1,5 menutupi jejak bangunan
      const nx = Math.max(2, Math.round((w - 2.2) / 2.2) + 1), nz = Math.max(2, Math.round((d - 2.2) / 2.2) + 1);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const lx = -w / 2 + 1.1 + (w - 2.2) * i / (nx - 1), lz = -d / 2 + 1.1 + (d - 2.2) * j / (nz - 1); colliders.push({ x: p.x + lx * cs + lz * sn, z: p.z - lx * sn + lz * cs, r: 1.5 }); }
    };
    for (let k = 0; k <= 8; k++) {
      const a = GA + 0.75 + k * ((Math.PI * 2 - 1.5) / 8), grand = k === 4, r = grand ? 21.8 : 20 + Vn(-1.2, 1.2), p = polar(r, a);
      if (grand) house(p, 14, 8.5, 3.5, 0x7a5236, 0x3f4f68, 3.9, true);
      else house(p, Vn(6.4, 8.4), Vn(5.2, 6.2), Vn(2.6, 3.0), wallCols[k % wallCols.length], roofCols[(k * 3 + 1) % roofCols.length], Vn(2.2, 2.9), false);
      if (k % 3 === 0) yield;
    }
    {   // tong & peti di depan Balai Desa
      const ba = GA + Math.PI;
      for (const [off, kind] of [[-0.17, 0], [0.17, 0], [0.2, 1]]) { const p = polar(14.6 - (kind ? 0.8 : 0), ba + off); HM.identity();
        if (kind === 0) { loc(S, new THREE.CylinderGeometry(0.45, 0.5, 0.95, 8).translate(p.x, 0.48, p.z), 0x6b4a2a, 0.1); loc(S, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8).translate(p.x, 0.97, p.z), 0xf6faff); colliders.push({ x: p.x, z: p.z, r: 0.55 }); }
        else { loc(S, new THREE.BoxGeometry(0.9, 0.8, 0.9).rotateY(0.4).translate(p.x, 0.4, p.z), 0x8a6a3a, 0.1); loc(S, new THREE.BoxGeometry(0.95, 0.07, 0.95).rotateY(0.4).translate(p.x, 0.82, p.z), 0xf6faff); colliders.push({ x: p.x, z: p.z, r: 0.7 }); } }
    }
    yield;

    // ---------- 4) pagar kayu bersalju + gerbang + obelisk es pelindung ----------
    {
      const FR = V.fenceR, nSeg = Math.round(Math.PI * 2 * FR / 1.7), gap = V.gateHW / FR, inGap = a => Math.abs(wrap(a - GA)) < gap, ang = i => GA + i / nSeg * Math.PI * 2;
      for (let i = 0; i < nSeg; i++) {
        const a = ang(i), a2 = ang(i + 1), p = polar(FR, a), q = polar(FR, a2);
        if (inGap(a)) continue;
        faceCenter(p); bx(S, 0.22, 1.5, 0.22, 0, 0.75, 0, 0x6b4a2a, 0.12); bx(S, 0.34, 0.12, 0.34, 0, 1.56, 0, 0xf6faff);   // tiang + salju di ujungnya
        colliders.push({ x: p.x, z: p.z, r: 0.6 });
        if (inGap(a2)) continue;
        const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) + 0.05, th = Math.atan2(-dz, dx), mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
        HM.makeRotationY(th).setPosition(mx, 0, mz);
        bx(S, len, 0.1, 0.1, 0, 0.58, 0, 0x7a5a38, 0.1); bx(S, len, 0.1, 0.1, 0, 1.08, 0, 0x7a5a38, 0.1); bx(S, len, 0.06, 0.2, 0, 1.15, 0, 0xf6faff);   // dua palang + salju di palang atas
        colliders.push({ x: mx, z: mz, r: 0.55 });
      }
      // gerbang: dua tiang tebal + balok melintang bersalju + lampu gantung di tengah
      const gp = polar(FR, GA); faceCenter(gp);
      for (const sd of [-1, 1]) { bx(S, 0.42, 3.1, 0.42, sd * (V.gateHW + 0.1), 1.55, 0, 0x5a3d22, 0.08); bx(S, 0.6, 0.14, 0.6, sd * (V.gateHW + 0.1), 3.16, 0, 0xf6faff); }
      bx(S, V.gateHW * 2 + 1.0, 0.34, 0.34, 0, 2.95, 0, 0x6b4a2a, 0.08); bx(S, V.gateHW * 2 + 1.2, 0.12, 0.5, 0, 3.17, 0, 0xf6faff);
      bx(S, 0.05, 0.6, 0.05, 0, 2.6, 0, 0x2e2e36); bx(Wn, 0.34, 0.4, 0.34, 0, 2.3, 0, 0xffd27a);
      const cg = Math.cos(Math.atan2(C0.x - gp.x, C0.z - gp.z)), sg = Math.sin(Math.atan2(C0.x - gp.x, C0.z - gp.z));
      for (const sd of [-1, 1]) colliders.push({ x: gp.x + sd * (V.gateHW + 0.1) * cg, z: gp.z - sd * (V.gateHW + 0.1) * sg, r: 0.5 });
      yield;

      // 4 obelisk es di dalam pagar (kristal melayang, berputar pelan): penanda "area aman"
      for (const a of [GA + 1.05, GA - 1.05, GA + 2.35, GA - 2.35]) {
        const p = polar(FR - 3.2, a); HM.identity();
        loc(S, new THREE.CylinderGeometry(0.95, 1.15, 0.7, 8).translate(p.x, 0.35, p.z), 0x7d8594, 0.08); loc(S, new THREE.CylinderGeometry(0.8, 0.8, 0.1, 8).translate(p.x, 0.74, p.z), 0xf6faff);
        colliders.push({ x: p.x, z: p.z, r: 1.0 });
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(0.7, 1.7, 0.7), new THREE.MeshStandardMaterial({ color: 0xcdeeff, emissive: 0x59c8ff, emissiveIntensity: 1.25, roughness: 0.2, metalness: 0.1, flatShading: true }));
        m.position.set(p.x, 3.1, p.z); m.userData = { y0: 3.1, ph: vr() * 6.28 }; m.castShadow = true; group.add(m); obe.push(m);
      }
    }

    // ---------- 5) pinus bersalju: di dalam pagar (dengan tabrakan) + hiasan di luar (tanpa tabrakan; luar jangkauan pemain) + gundukan salju ----------
    {
      const trees = [], tooClose = (x, z, r) => { for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < r) return true; return false; };
      const obeAng = [GA + 1.05, GA - 1.05, GA + 2.35, GA - 2.35];
      for (let tries = 0, n = 0; tries < 400 && n < 16; tries++) {   // dalam pagar (r 24,8..27,6), menjauhi gerbang & obelisk
        const a = Vn(0, Math.PI * 2), r = Vn(24.8, 27.6); if (Math.abs(wrap(a - GA)) < 0.5 || Math.abs(wrap(a - GA - Math.PI)) * r < 9.5 || obeAng.some(o => Math.abs(wrap(a - o)) * r < 3.4)) continue;
        const p = polar(r, a); if (tooClose(p.x, p.z, 4)) continue; trees.push({ x: p.x, z: p.z, s: Vn(1.0, 1.6), a: vr() * 6.28, col: true }); n++;
      }
      const pathNear = (s, u) => { for (const q of V.path) if (Math.hypot(s - q.s, u - q.u) < 9) return true; return false; };
      for (let tries = 0, n = 0; tries < 900 && n < (COARSE ? 36 : 80); tries++) {   // di luar pagar
        const a = Vn(0, Math.PI * 2), r = Vn(V.R + 4, V.R + 26), s = V.s + Math.cos(a) * r, u = V.u + Math.sin(a) * r; if (pathNear(s, u)) continue;
        const p = Pw(s, u); if (tooClose(p.x, p.z, 4.6)) continue; trees.push({ x: p.x, z: p.z, s: Vn(1.2, 2.5), a: vr() * 6.28, col: false }); n++;
      }
      const snowLeaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), nT = trees.length;
      const tr = new THREE.InstancedMesh(geo.trunkPine, mat.barkMat, nT), lf = new THREE.InstancedMesh(geo.pineLeaf, snowLeaf, nT);
      trees.forEach((q, i) => { dummy.position.set(q.x, 0, q.z); dummy.quaternion.identity(); dummy.rotation.set(0, q.a, 0); dummy.scale.setScalar(q.s); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix); lf.setMatrixAt(i, dummy.matrix); lf.setColorAt(i, tmpC.setRGB(0.9 + vr() * 0.1, 0.94 + vr() * 0.06, 1.0)); if (q.col) colliders.push({ x: q.x, z: q.z, r: 0.34 * q.s + 0.15 }); });
      tr.castShadow = lf.castShadow = true; tr.receiveShadow = lf.receiveShadow = true; group.add(tr, lf);
      HM.identity();
      for (let i = 0; i < V.path.length; i += 2) for (const sd of [-1, 1]) {   // gundukan salju di kiri-kanan jalan desa (di luar koridor jalan)
        if (vr() < 0.35) continue; const q = V.path[i], off = sd * Vn(8, 17), p = Pw(q.s + off, q.u + Vn(-2, 2));
        loc(S, new THREE.SphereGeometry(1, 8, 5).scale(Vn(1.2, 2.6), Vn(0.4, 0.9), Vn(1.0, 2.2)).rotateY(vr() * 6).translate(p.x, 0, p.z), 0xeef4fb, 0.05);
      }
      for (let i = 0; i < (COARSE ? 8 : 18); i++) {   // gundukan salju di luar pagar
        const a = Vn(0, Math.PI * 2), r = Vn(V.R + 2, V.R + 20), s = V.s + Math.cos(a) * r, u = V.u + Math.sin(a) * r; if (pathNear(s, u)) continue;
        const p = Pw(s, u); loc(S, new THREE.SphereGeometry(1, 8, 5).scale(Vn(2, 4.2), Vn(0.55, 1.1), Vn(1.6, 3.4)).rotateY(vr() * 6).translate(p.x, 0, p.z), 0xeef4fb, 0.05);
      }
    }
    yield;

    // ---------- 6) gabung semua + api unggun, bercak cahaya, salju turun, papan nama ----------
    {
      const mS = new THREE.Mesh(mergeGeometries(S), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }));
      mS.castShadow = mS.receiveShadow = true; group.add(mS); S.forEach(g => g.dispose());
      const mW = new THREE.Mesh(mergeGeometries(Wn), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); group.add(mW); Wn.forEach(g => g.dispose());
      // api unggun: tiga lidah api (animasi) + bercak cahaya hangat aditif di tanah (pengganti lampu)
      const mkFlame = (r, h, hex, y) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.93, toneMapped: false, depthWrite: false })); m.position.set(C0.x, y, C0.z); group.add(m); return m; };
      const flames = [mkFlame(0.62, 1.9, 0xff8a1f, 0.35), mkFlame(0.42, 1.45, 0xffc247, 0.4), mkFlame(0.26, 1.0, 0xfff0a8, 0.45)];
      const gTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
      const glow = new THREE.Mesh(new THREE.CircleGeometry(13, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gTex, color: 0xff9a40, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      glow.position.set(C0.x, 0.3, C0.z); group.add(glow);
      // salju turun pelan di atas desa
      const NS = COARSE ? 140 : 320, sp = new Float32Array(NS * 3), sv = new Float32Array(NS), SR = 46;
      for (let i = 0; i < NS; i++) { const a = vr() * 6.28, r = Math.sqrt(vr()) * SR; sp[i * 3] = C0.x + Math.cos(a) * r; sp[i * 3 + 1] = vr() * 16; sp[i * 3 + 2] = C0.z + Math.sin(a) * r; sv[i] = 0.7 + vr() * 1.1; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const snowPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.85, depthWrite: false })); snowPts.frustumCulled = false; group.add(snowPts);
      villageUpd = dt => {
        const t = tClock, f = 0.9 + Math.sin(t * 11.3) * 0.07 + Math.sin(t * 17.9 + 1.3) * 0.05;
        flames.forEach((m, i) => { m.scale.set(1 + Math.sin(t * 9 + i) * 0.08, f * (1 + i * 0.03) + Math.sin(t * 13 + i * 2) * 0.06, 1 + Math.cos(t * 8 + i) * 0.08); m.rotation.y += dt * (1.6 + i); });
        glow.material.opacity = 0.5 + Math.sin(t * 7.1) * 0.05 + Math.sin(t * 12.7) * 0.04;
        obe.forEach(m => { m.position.y = m.userData.y0 + Math.sin(t * 1.3 + m.userData.ph) * 0.25; m.rotation.y += dt * 0.5; m.material.emissiveIntensity = 1.15 + Math.sin(t * 2 + m.userData.ph) * 0.2; });
        for (let i = 0; i < NS; i++) {
          let y = sp[i * 3 + 1] - sv[i] * dt; sp[i * 3] += Math.sin(t * 0.7 + i) * 0.35 * dt; sp[i * 3 + 2] += Math.cos(t * 0.6 + i * 1.7) * 0.3 * dt;
          if (y < 0) { y = 16; const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * SR; sp[i * 3] = C0.x + Math.cos(a) * r; sp[i * 3 + 2] = C0.z + Math.sin(a) * r; }
          sp[i * 3 + 1] = y;
        }
        sg.attributes.position.needsUpdate = true;
      };
      // papan nama: di sisi gerbang (menghadap pemain yang datang lewat jalan) + papan petunjuk di percabangan jalan lembah
      signBoard(['DESA SALJU', 'BEBAS MONSTER'], polar(V.fenceR + 1.2, GA + 0.2), polar(V.fenceR + 14, GA + 0.1));
      signBoard(['DESA SALJU', 'BELOK KANAN'], Pw(290, -36.5), Pw(260, -36.5));
    }
  }

  yield* buildMountain(MT, ['JALUR PENDAKIAN', 'MENUJU PUNCAK'], 0xc73a2a);
  yield;
  yield* buildMountain(MT2, ['JALUR PENDAKIAN', 'GUNUNG SEBERANG'], 0x2a6bc7);
  yield;
  yield* buildMountain(MT3, ['JALUR PENDAKIAN', 'GUNUNG AGUNG'], 0xe0b020);   // jalan padang diteruskan ke pegunungan di ujung padang
  yield;
  yield* buildBridges();   // jembatan langit menghubungkan ketiga puncak (+ jembatan dari puncak Agung ke Pegunungan Naga)
  yield;
  yield* buildRidge();   // Pegunungan Naga: punggungan memanjang + jalan di puncaknya
  yield;
  yield* buildDescent();   // Jalur Turun Lembah Salju: jalan berkelok menuruni tebing dari Tanjung Pandang ke lembah bersalju (sungai beku + jembatan)
  yield;
  yield* buildSnowVillage();   // Desa Salju Hening: desa aman di sisi kanan lembah (pagar, rumah, api unggun; monster tidak bisa sampai)
  yield;

  signBoard(['JALAN CABANG', 'KE GUNUNG SEBERANG'], neAxisToWorld(MT2.d - 12, ROAD_HW + 3.2), neAxisToWorld(MT2.d - 40, ROAD_HW + 3.2));   // di tepi jalan padang (sisi kanan), menghadap pemain yang datang dari gerbang
  signBoard(['JALAN TERUS', 'KE GUNUNG AGUNG'], neAxisToWorld(D1 - 40, ROAD_HW + 3.2), neAxisToWorld(D1 - 80, ROAD_HW + 3.2));   // dekat ujung jalan padang, menghadap pemain yang berjalan ke ujung
  yield;

  // ===== KAWANAN NAGA TERBANG di pegunungan (dragon_blockbench_exercise.glb): berputar di atas tiap gunung + berpatroli sepanjang Pegunungan Naga sampai ke ujungnya, sayap mengepak, warnanya beda-beda =====
  //  Taruh dragon_blockbench_exercise.glb di folder yang sama dengan adult_dragon.glb. Kalau gagal dimuat, kawanan tidak muncul (game tetap jalan).
  //  Model: sayap terbentang ±32 satuan, panjang ±27, menghadap +z. Warna: tekstur aslinya merah tua, jadi warna lain dibuat dengan MEMUTAR HUE di shader (bukan dikalikan warna).
  {
    const FLY = {
      file: 'dragon_blockbench_exercise.glb',
      perMtn: COARSE ? 2 : 4,         // jumlah naga per gunung (3 gunung)
      ridgeN: COARSE ? 8 : 20,        // jumlah naga yang berpatroli sepanjang Pegunungan Naga (makin ke ujung / Tanjung Pandang makin rapat)
      ridgeBias: 0.5,                  // < 1 = sebaran makin condong ke ujung pegunungan (1 = merata; makin kecil makin menumpuk di ujung)
      span: [12, 24],                  // lebar rentang sayap (meter): tiap naga acak di antara ini
      alt: [10, 38],                   // tinggi terbang DI ATAS puncak gunung (meter)
      speed: [9, 15],                  // kecepatan terbang (m/detik)
      flapHz: [0.45, 0.8],             // kepakan sayap per detik (bergantian mengepak & meluncur)
      flapAmp: 0.5,                    // ayunan sayap (rad)
      attackChance: 0.10,              // peluang naga menyerang pemain tiap "undian" (10%)
      alertR: 70,                      // jarak mendatar (m) naga ke pemain: di bawah ini naga melakukan undian
      cooldown: 45,                    // jeda (detik) antar undian untuk naga yang sama
      gap: 20,                         // jeda (detik) setelah satu serangan sebelum naga lain boleh menyerang (hanya satu penyerang sekaligus)
      diveSpeed: 30,                   // kecepatan turun menghampiri pemain (m/detik)
      engageDist: 11, engageH: 3.2,    // naga berhenti turun di jarak (m) & tinggi (m, dari kaki pemain) ini, lalu pertarungan dimulai (terbang rendah)
      hoverTime: 25,                   // lama naga melayang dekat pemain setelah KALAH (detik): di sini pemain bisa mencoba menjinakkannya
      talkR: 16                        // jarak (m) pemain ke naga melayang agar bisa diajak bicara / dijinakkan
    };
    // daftar warna: hue = putaran warna dari merah asli (derajat) | sat = kepekatan | br = terang-gelap
    const PALETTE = [
      { n: 'merah', hue: 0, sat: 1.2, br: 1.5 }, { n: 'jingga', hue: 28, sat: 1.3, br: 1.7 }, { n: 'emas', hue: 52, sat: 1.4, br: 1.9 },
      { n: 'hijau muda', hue: 95, sat: 1.3, br: 1.8 }, { n: 'hijau', hue: 130, sat: 1.3, br: 1.6 }, { n: 'tosca', hue: 175, sat: 1.4, br: 1.7 },
      { n: 'biru', hue: 215, sat: 1.5, br: 1.8 }, { n: 'ungu', hue: 275, sat: 1.4, br: 1.7 }, { n: 'merah muda', hue: 325, sat: 1.0, br: 2.2 },
      { n: 'putih', hue: 0, sat: 0.12, br: 2.7 }, { n: 'hitam', hue: 0, sat: 0.3, br: 0.55 }, { n: 'biru langit', hue: 195, sat: 0.9, br: 2.3 }
    ];
    const dragonMat = (src, c) => {   // salinan bahan dengan warna digeser (shader: putar hue di sekitar sumbu abu-abu)
      const m = src.clone();
      m.onBeforeCompile = sh => {
        sh.uniforms.uHue = { value: c.hue * Math.PI / 180 }; sh.uniforms.uSat = { value: c.sat }; sh.uniforms.uBr = { value: c.br };
        sh.fragmentShader = 'uniform float uHue; uniform float uSat; uniform float uBr;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          `#include <map_fragment>
          { vec3 k = vec3(0.57735); float cs = cos(uHue), sn = sin(uHue); vec3 c = diffuseColor.rgb;
            c = c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
            float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, uSat);
            diffuseColor.rgb = clamp(c * uBr, 0.0, 1.0); }`);
      };
      m.customProgramCacheKey = () => 'naga-terbang-warna';
      return m;
    };
    const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
    new GLTFLoader().load(FLY.file, gl => {
      try {
        const flock = [], mtns = [MT, MT2, MT3], slots = [], pal = PALETTE.map((c, i) => [rand(), c]).sort((x, y) => x[0] - y[0]).map(x => x[1]);   // urutan warna diacak
        const tq = new THREE.Quaternion(), _q = new THREE.Quaternion(), FWD = new THREE.Vector3(0, 0, 1);
        let ci = 0;
        for (const M of mtns) for (let i = 0; i < FLY.perMtn; i++) slots.push(M);
        for (let i = 0; i < FLY.ridgeN; i++) slots.push(null);   // null = naga Pegunungan Naga (patroli memanjang di atas punggungan)
        for (const M of slots) {
          const root = SkeletonUtils.clone(gl.scene), g = new THREE.Group(), col = pal[ci++ % pal.length];
          root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = dragonMat(o.material, col); } });   // frustumCulled off: kotak pembatas mesh bertulang tidak dapat diandalkan
          const k = Rn(FLY.span[0], FLY.span[1]) / 32;   // 32 = lebar sayap model asli
          root.scale.setScalar(k); root.position.set(0, -2.5 * k, 3.6 * k);   // titik putar di tengah badan
          g.add(root); g.updateMatrixWorld(true);
          const wings = [];   // tulang sayap: Wing1 (pangkal) & Wing2 (ujung), kiri (+x) & kanan (-x). Nama di three.js tanpa titik, jadi dicocokkan dengan regex
          root.traverse(b => { if (!b.isBone) return; const m = /^Wing([12])\.?([LR])/.exec(b.name); if (!m || !b.parent) return;
            b.parent.getWorldQuaternion(tq); wings.push({ b, q0: b.quaternion.clone(), ax: FWD.clone().applyQuaternion(tq.clone().invert()).normalize(), sg: m[2] === 'L' ? 1 : -1, amp: m[1] === '1' ? 1 : 0.7, lag: m[1] === '1' ? 0 : -0.8 }); });
          g.rotation.order = 'YXZ'; g.visible = true; group.add(g);
          if (!M) {   // naga Pegunungan Naga: orbit elips memanjang searah punggungan; pusatnya condong ke ujung (Tanjung Pandang) supaya makin ke ujung makin banyak
            const RG = NE_RIDGE, rx = Rn(45, 110), ry = Rn(12, 38), tc = Math.min(RG.L - 15, Math.max(0, RG.L * Math.pow(rand(), FLY.ridgeBias)));
            flock.push({ g, wings, M: null, tc, rx, ry, a: Rn(0, 6.2832), dir: rand() < 0.5 ? -1 : 1, w: Rn(FLY.speed[0], FLY.speed[1]) / ((rx + ry) / 2), y: Rn(FLY.alt[0] + 6, FLY.alt[1] + 8), vs: Rn(0.2, 0.4), va: Rn(2, 5), ph: Rn(0, 6.28),
              fl: Rn(FLY.flapHz[0], FLY.flapHz[1]), turn: 0, p0: new THREE.Vector3(), p1: new THREE.Vector3(), st: 0, cd: Rn(0, 20), tm: 0, hold: 0, ya: 0, pa: 0, ta: 0, col, k, ridge: true });
            continue;
          }
          const rx = M.Rb * Rn(0.55, 1.2), ry = rx * Rn(0.7, 1.3);   // orbit berbentuk elips mengelilingi gunung
          flock.push({ g, wings, M, rx, ry, cx: Rn(-0.15, 0.15) * M.Rb, cy: Rn(-0.15, 0.15) * M.Rb, a: Rn(0, 6.2832), dir: rand() < 0.5 ? -1 : 1,
            w: Rn(FLY.speed[0], FLY.speed[1]) / ((rx + ry) / 2), y: M.Hm + Rn(FLY.alt[0], FLY.alt[1]), vs: Rn(0.2, 0.4), va: Rn(2, 5), ph: Rn(0, 6.28),
            fl: Rn(FLY.flapHz[0], FLY.flapHz[1]), turn: 0, p0: new THREE.Vector3(), p1: new THREE.Vector3(), st: 0, cd: Rn(0, 20), tm: 0, hold: 0, ya: 0, pa: 0, ta: 0, col, k });
        }
        const place = (D, a, out) => {
          if (!D.M) {   // naga punggungan: t = jarak sepanjang punggungan, tinggi = tanah puncak di titik itu + ketinggian terbang
            const L = NE_RIDGE.L, t = Math.min(L, Math.max(0, D.tc + Math.cos(a) * D.rx)), ax = neRidgeToAxis(t, Math.sin(a) * D.ry), w = neAxisToWorld(ax.d, ax.off);
            out.set(w.x, neRidgeTop(t) + D.y + Math.sin(tClock * D.vs + D.ph) * D.va, w.z); return;
          }
          const q = neAxisToWorld(D.M.d + D.cx + Math.cos(a) * D.rx, D.M.off + D.cy + Math.sin(a) * D.ry); out.set(q.x, D.y + Math.sin(tClock * D.vs + D.ph) * D.va, q.z);
        };
        for (const D of flock) {   // arah belok (kiri / kanan) ditentukan sekali: dipakai untuk memiringkan badan ke dalam tikungan
          place(D, D.a, D.p0); place(D, D.a + D.dir * 0.08, D.p1); const h1 = Math.atan2(D.p1.x - D.p0.x, D.p1.z - D.p0.z);
          place(D, D.a + D.dir * 0.16, D.p0); const h2 = Math.atan2(D.p0.x - D.p1.x, D.p0.z - D.p1.z); D.turn = Math.sign(wrapA(h2 - h1)) || 1;
        }
        // ---- SERANGAN & PENJINAKAN NAGA ----
        //  Status tiap naga (D.st): 0 = mengorbit (patroli) | 1 = turun menghampiri pemain | 2 = kembali ke orbit | 3 = melayang dekat pemain setelah KALAH dalam pertarungan (bisa diajak bicara) | 4 = jinak, terbang mengiringi pemain | 5 = PERTARUNGAN (game.js memindahkan model ke musuh & mengatur posisinya; di sini hanya sayap yang mengepak)
        //  Undian serangan: naga mengorbit yang berjarak < alertR dari pemain mengundi sekali tiap 'cooldown' detik; menang bila acak < attackChance (10%). Hanya satu penyerang sekaligus.
        //  Penjinakan hanya berhasil bila globalThis.NAGA_IZIN (Naga Kuno di Hutan Salju sudah dikalahkan, diatur game.js). Naga jinak disimpan di localStorage 'naga_jinak' (nama warna).
        //  game.js: mengisi NAGA_LIAR.enabled tiap frame (false = tidak boleh menyerang: dialog, dungeon, dll.), mendengar event 'naga-liar-tempur' (detail.D = naga) lalu memanggil beginBattle(D) → pertarungan; endBattle(D, 'won' | 'giveup', at) mengembalikan model ke sini; offer() / tame() / dismiss() / hold() untuk penjinakan.
        let gapT = 0, plPos = null;
        const steer = (D, tgt, spd, dt, turnK) => {   // terbang menuju tgt dengan kecepatan spd; hadap & kemiringan hidung mengikuti arah gerak (halus)
          const p = D.g.position, dx = tgt.x - p.x, dy = tgt.y - p.y, dz = tgt.z - p.z, dist = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, spd * dt / dist), hz = Math.hypot(dx, dz);
          p.x += dx * k; p.y += dy * k; p.z += dz * k;
          if (hz > 0.5) D.ya += wrapA(Math.atan2(dx, dz) - D.ya) * Math.min(1, (turnK || 4) * dt);
          D.pa += (-Math.atan2(dy, Math.max(hz, 6)) - D.pa) * Math.min(1, 3 * dt);
          return dist;
        };
        const NL = globalThis.NAGA_LIAR = {
          enabled: false, tamed: null, flock,
          busy: () => flock.some(D => D.st === 1 || D.st === 5),
          offer(x, z) { if (!plPos) return null; for (const D of flock) if (D.st === 3 && Math.hypot(x - D.g.position.x, z - D.g.position.z) < FLY.talkR) return D; return null; },   // naga yang sedang melayang & cukup dekat dengan pemain (null = tidak ada)
          beginBattle(D) {   // game.js: model naga dipindah ke musuh pertarungan. Mengembalikan { holder, mats, k, span, pos, yaw } (null bila tidak bisa)
            if (!D || D.st !== 5 || D.inBattle) return null;
            D.inBattle = true; const mats = []; D.g.traverse(o => { if (o.isMesh && o.material && o.material.emissive && !mats.includes(o.material)) mats.push(o.material); });
            const pos = D.g.position.clone(), yaw = D.ya; if (D.g.parent) D.g.parent.remove(D.g); D.g.position.set(0, 0, 0); D.g.rotation.set(0, 0, 0);
            return { holder: D.g, mats, k: D.k, span: D.k * 32, pos, yaw };
          },
          endBattle(D, mode, at) {   // 'won' = naga kalah → melayang di tempat jatuhnya & bisa diajak bicara (jinakkan) | 'giveup' = pemain kabur / kalah → naga kembali ke orbit
            if (!D || !D.inBattle) return; D.inBattle = false; D.g.rotation.set(0, 0, 0); D.g.scale.setScalar(1);
            if (at) { D.g.position.set(at.x, at.y, at.z); D.ya = at.yaw || 0; } D.pa = 0; group.add(D.g);
            if (mode === 'won') { D.st = 3; D.tm = FLY.hoverTime; D.hold = 0; D.hAng = D.ya; } else { D.st = 2; D.cd = FLY.cooldown; }
          },
          hold(D) { D.hold = 20; },                                    // dialog dibuka: naga tidak pergi dulu
          dismiss(D) { D.hold = 0; D.st = 2; D.cd = FLY.cooldown; },   // naga pergi
          tame(D) {                                                    // true = berhasil; false = ditolak (Naga Kuno belum dikalahkan)
            if (!globalThis.NAGA_IZIN || !D || D.st !== 3) return false;
            if (NL.tamed && NL.tamed !== D) { NL.tamed.st = 2; NL.tamed.cd = FLY.cooldown; }
            D.st = 4; D.hold = 0; D.ta = Math.atan2(D.g.position.z - (plPos ? plPos.z : 0), D.g.position.x - (plPos ? plPos.x : 0)); NL.tamed = D;
            try { localStorage.setItem('naga_jinak', D.col.n); } catch (e) { /* abaikan */ }
            return true;
          },
          release() { const D = NL.tamed; if (D) { D.st = 2; D.cd = FLY.cooldown; } NL.tamed = null; try { localStorage.removeItem('naga_jinak'); } catch (e) { /* abaikan */ } }
        };
        let restored = false;   // naga jinak dari sesi sebelumnya dipulihkan di frame pertama (izin NAGA_IZIN diisi game.js)
        flyUpd = (dt, pp) => {
          if (!restored) { restored = true; try { const nm = localStorage.getItem('naga_jinak'); if (nm && globalThis.NAGA_IZIN) { const D = flock.find(x => x.col.n === nm) || flock[0]; if (D) { D.st = 4; D.ta = 0; NL.tamed = D; } } } catch (e) { /* abaikan */ } }
          plPos = pp && isFinite(pp.x) && isFinite(pp.z) ? pp : null; const py = plPos && isFinite(plPos.y) ? plPos.y : 0;
          if (gapT > 0) gapT -= dt;
          for (const D of flock) {
            if (D.cd > 0) D.cd -= dt;
            const p = D.g.position; let roll = 0, calm = 0;   // calm = 1: sayap mengepak kuat (melayang)
            if (D.st === 0 || D.st === 2) {   // mengorbit / kembali ke orbit
              D.a += D.dir * D.w * dt;
              place(D, D.a, D.p0); place(D, D.a + D.dir * 0.08, D.p1);
              if (D.st === 2) {   // terbang menuju titik orbitnya; sampai (< 8 m) → orbit lagi
                if (steer(D, D.p0, 22, dt, 2.5) < 8) { D.st = 0; D.ya = Math.atan2(D.p1.x - D.p0.x, D.p1.z - D.p0.z); }
                roll = -D.turn * 0.2;
              } else {
                const dx = D.p1.x - D.p0.x, dz = D.p1.z - D.p0.z, vy = Math.cos(tClock * D.vs + D.ph) * D.va * D.vs;
                p.copy(D.p0); D.ya = Math.atan2(dx, dz); D.pa = -Math.atan2(vy, 11); roll = -D.turn * (0.32 + 0.1 * Math.sin(tClock * 0.6 + D.ph));
                if (plPos && NL.enabled && D.cd <= 0 && gapT <= 0 && !NL.busy()) {   // undian serangan
                  if (Math.hypot(plPos.x - p.x, plPos.z - p.z) < FLY.alertR) { D.cd = FLY.cooldown; if (Math.random() < FLY.attackChance) { D.st = 1; D.tm = 0; } }
                }
              }
            } else if (D.st === 1) {   // turun menghampiri pemain (terbang rendah, di depannya); sampai → pertarungan dimulai (game.js)
              D.tm += dt; D.a += D.dir * D.w * dt;
              if (!plPos || !NL.enabled || D.tm > 14) { D.st = 2; D.cd = FLY.cooldown; }
              else {
                const vx = p.x - plPos.x, vz = p.z - plPos.z, vl = Math.hypot(vx, vz) || 1;
                const dist = steer(D, { x: plPos.x + vx / vl * FLY.engageDist, y: py + FLY.engageH, z: plPos.z + vz / vl * FLY.engageDist }, FLY.diveSpeed, dt, 6); roll = 0;
                if (dist < 3) {
                  D.st = 5; D.ya = Math.atan2(plPos.x - p.x, plPos.z - p.z); D.pa = 0; gapT = FLY.gap;
                  try { globalThis.dispatchEvent(new CustomEvent('naga-liar-tempur', { detail: { D } })); } catch (e) { /* abaikan */ }
                  if (!D.inBattle) { D.st = 2; D.cd = FLY.cooldown; }   // game.js tidak mengambil alih: naga pergi
                }
              }
            } else if (D.st === 3) {   // melayang beberapa meter di depan arah luncurnya, menghadap pemain; setelah hoverTime (atau dialog selesai) pergi
              if (D.hold > 0) D.hold -= dt; else D.tm -= dt;
              D.a += D.dir * D.w * dt; calm = 1;
              if (!plPos || D.tm <= 0) { D.st = 2; D.cd = FLY.cooldown; }
              else {
                const tgt = { x: plPos.x + Math.sin(D.hAng) * 9, y: py + 4.5 + Math.sin(tClock * 1.3 + D.ph) * 0.6, z: plPos.z + Math.cos(D.hAng) * 9 };
                const dist = steer(D, tgt, 18, dt, 4);
                if (dist < 2.5) D.ya += wrapA(Math.atan2(plPos.x - p.x, plPos.z - p.z) - D.ya) * Math.min(1, 3 * dt);   // sudah di posisi: menghadap pemain
              }
            } else if (D.st === 5) {   // pertarungan: posisi & arah diatur game.js (model sudah jadi anak musuh); sayap tetap mengepak kuat
              calm = 1;
            } else if (D.st === 4) {   // jinak: mengitari pemain pada jarak & tinggi tetap
              if (!plPos) continue;
              D.ta += dt * 0.7; const R = 11 + Math.sin(tClock * 0.4 + D.ph) * 2.5, hh = py + 9 + Math.sin(tClock * 0.6 + D.ph) * 1.8;
              const q = { x: plPos.x + Math.cos(D.ta) * R, y: hh, z: plPos.z + Math.sin(D.ta) * R }, q1 = { x: plPos.x + Math.cos(D.ta + 0.1) * R, z: plPos.z + Math.sin(D.ta + 0.1) * R };
              const k = Math.min(1, 5 * dt); p.x += (q.x - p.x) * k; p.y += (q.y - p.y) * k; p.z += (q.z - p.z) * k;
              D.ya += wrapA(Math.atan2(q1.x - q.x, q1.z - q.z) - D.ya) * Math.min(1, 6 * dt); D.pa += (0 - D.pa) * Math.min(1, 3 * dt); roll = -0.25;
            }
            if (D.st !== 5) D.g.rotation.set(D.pa, D.ya, roll);
            const env = calm ? 1 : Math.pow(0.5 + 0.5 * Math.sin(tClock * 0.3 + D.ph * 1.7), 1.5), fp = tClock * D.fl * (calm || D.st === 1 ? 2.2 : 1) * 6.2832 + D.ph;   // melayang / menukik: kepakan lebih cepat
            for (const w of D.wings) w.b.quaternion.copy(w.q0).premultiply(_q.setFromAxisAngle(w.ax, w.sg * w.amp * FLY.flapAmp * (0.25 + 0.75 * env) * Math.sin(fp + w.lag)));
          }
        };
        console.log('[dataran-tl] kawanan naga terbang: ' + flock.length + ' ekor');
      } catch (err) { console.warn('kawanan naga terbang gagal disiapkan', err); }
    }, undefined, err => console.warn(FLY.file + ' gagal dimuat — tanpa kawanan naga terbang', err));
  }

  return {
    group,
    update(dt, pp) {   // awan bergoyang pelan, air terjun mengalir, kabut berdenyut   // pp = posisi pemain (dari world.js)
      tClock += dt || 0.016; wfTex.offset.y -= (dt || 0.016) * 0.9; if (villageUpd) villageUpd(dt || 0.016); if (dragonUpd) dragonUpd(dt || 0.016, pp); if (flyUpd) flyUpd(dt || 0.016);
      for (const m of clouds) { const u = m.userData; m.position.x = u.x + Math.sin(tClock * u.sp + u.ph) * u.amp; m.position.z = u.z + Math.cos(tClock * u.sp * 0.7 + u.ph) * u.amp * 0.6; }
      for (const m of mists) { const u = m.userData; if (!u.s0) u.s0 = m.scale.x; m.scale.setScalar(u.s0 * (1 + Math.sin(tClock * 0.8 + u.ph) * 0.06)); }
    },
  };
}
