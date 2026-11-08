import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { meadowDist } from './meadow-layout.js';
import { SAWAH, KEKAISARAN, KEKAISARAN_GATE, SAWAH_PTS, SAWAH_LEN, SAWAH_CIRCLES, SAWAH_PLOTS, SAWAH_LANES, SAWAH_SPOTS, SAWAH_SEG_X, CANAL, DIKE_W, sroadAt, sside, sawahDist, plotAt } from './sawah-layout.js';

// ============================================================
//  Membangun satu BAGIAN Ladang Sawah Gemah Ripah (dipanggil dari world.js, satu chunk per bagian — lihat SAWAH_SEG_X).
//  Isinya: jalan tanah + saluran irigasi di kedua sisi (air mengalir, jembatan bambu di tiap setapak), petak-petak sawah berpematang
//  (digenangi / bibit / anakan / hijau / menguning / sisa panen / lumpur dibajak / jagung / kolam ikan), gubuk tani, lumbung padi, kebun kelapa,
//  orang-orangan sawah, tumpukan jerami, kerbau membajak, kincir air, saung istirahat, rumpun bambu, papan petunjuk, dan (di bagian terakhir)
//  gerbang perbatasan Kota Kekaisaran yang masih tertutup.
//  Generator: tiap `yield` = titik berhenti (ChunkManager melanjutkannya di frame berikutnya, jadi tidak ada frame yang tersendat).
// ============================================================

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- Geometri & material bersama (dibuat sekali, dipakai semua bagian) ----------
function setColor(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function gradColor(g, c0, c1, y0, y1) { const A = new THREE.Color(c0), B = new THREE.Color(c1), c = new THREE.Color(), p = g.attributes.position, a = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { c.lerpColors(A, B, Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)))); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }

// rumpun padi / jagung: beberapa helai (pita 2 ruas + ujung) berwarna gradasi pangkal -> tengah -> ujung
function clumpGeo(rng, { blades, h0, h1, w, cb, cm, ct, bend, head = 1 }) {
  const pos = [], col = [], nrm = [], A = new THREE.Color(cb), B = new THREE.Color(cm), C = new THREE.Color(ct);
  for (let b = 0; b < blades; b++) {
    const bx = (rng() - 0.5) * 0.3, bz = (rng() - 0.5) * 0.3, ang = rng() * 6.283, h = h0 + rng() * (h1 - h0), ww = w * (0.8 + rng() * 0.5), lean = bend * (0.6 + rng() * 0.8) * h;
    const ca = Math.cos(ang), sa = Math.sin(ang), P = (x, y, z) => [bx + x * ca + z * sa, y, bz - x * sa + z * ca], hm = h * 0.62, zm = lean * 0.25, wm = ww * head;
    const v = [P(-ww, 0, 0), P(ww, 0, 0), P(-wm, hm, zm), P(wm, hm, zm), P(0, h, lean)], cv = [A, A, B, B, C];
    for (const t of [[0, 1, 2], [1, 3, 2], [2, 3, 4]]) for (const i of t) { pos.push(...v[i]); col.push(cv[i].r, cv[i].g, cv[i].b); nrm.push(0, 1, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
// pelepah kelapa: pita melengkung ke atas lalu menjuntai, berujung runcing
function frondGeo(len, wmax, lift, droop, c0, c1) {
  const N = 6, pos = [], col = [], idx = [], A = new THREE.Color(c0), B = new THREE.Color(c1), c = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const t = i / N, px = t * len, py = lift * Math.sin(t * 1.3) - droop * t * t, hw = wmax * Math.sin(Math.min(1, t * 1.05 + 0.04) * Math.PI) * (1 - t * 0.35) + 0.01;
    pos.push(px, py, -hw, px, py, hw); c.lerpColors(A, B, t); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}

let SH = null;
function shared(o) {
  if (SH && SH.key === o.mat.swayMat) return SH;
  const { prep, mat } = o, rng = mulberry32(2026110201), S = {};
  S.key = mat.swayMat;
  const T = {   // jenis tanaman
    seed:  { blades: 3, h0: 0.13, h1: 0.22, w: 0.022, cb: 0x3d7a2a, cm: 0x6fb040, ct: 0xa6dc62, bend: 0.25 },
    young: { blades: 4, h0: 0.30, h1: 0.48, w: 0.028, cb: 0x2f7a2b, cm: 0x5fae38, ct: 0x9ad050, bend: 0.35 },
    green: { blades: 5, h0: 0.60, h1: 0.85, w: 0.035, cb: 0x276b27, cm: 0x4c9f35, ct: 0x86c540, bend: 0.35 },
    ripe:  { blades: 5, h0: 0.78, h1: 0.98, w: 0.034, cb: 0x6d8a2a, cm: 0xc8a638, ct: 0xf2cf56, bend: 0.65, head: 2.1 },
    stub:  { blades: 3, h0: 0.06, h1: 0.13, w: 0.030, cb: 0x8a7a42, cm: 0xa8965a, ct: 0xc7b678, bend: 0.1 },
    corn:  { blades: 6, h0: 1.15, h1: 1.50, w: 0.070, cb: 0x2c6a22, cm: 0x4f9a30, ct: 0x8bc43c, bend: 0.7, head: 1.4 },
  };
  const AMP = { seed: 0.03, young: 0.06, green: 0.09, ripe: 0.12, stub: 0, corn: 0.1 };
  S.rice = {}; S.riceMat = {};
  for (const k in T) {
    S.rice[k] = clumpGeo(rng, T[k]);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    S.riceMat[k] = AMP[k] ? mat.swayMat(m, AMP[k], 0, true) : m;
  }
  // pohon kelapa: batang melengkung + 10 pelepah + 3 buah
  { const H = 7.2, lean = 0.9, trunk = prep(new THREE.CylinderGeometry(0.1, 0.17, H, 6, 6)); trunk.translate(0, H / 2, 0);
    const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / H; p.setX(i, p.getX(i) + lean * t * t); }
    trunk.computeVertexNormals(); gradColor(trunk, 0x6e5a3c, 0x8a7550, 0, H);
    const parts = [trunk];
    for (let k = 0; k < 10; k++) { const f = frondGeo(2.9 + rng() * 1.0, 0.42, 0.9 + rng() * 0.5, 1.5 + rng() * 1.2, 0x2a6428, 0x78b640); f.rotateY(k * 0.628 + rng() * 0.25); f.translate(lean, H, 0); parts.push(f); }
    for (let k = 0; k < 3; k++) { const n = prep(new THREE.SphereGeometry(0.2, 6, 5)); n.translate(lean + Math.cos(k * 2.1) * 0.28, H - 0.3, Math.sin(k * 2.1) * 0.28); setColor(n, 0x6b4a24); parts.push(n); }
    S.palm = mergeGeometries(parts);
    S.palmMat = mat.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }), 0.045, 5.6);
  }
  // rumpun bambu: 9 batang miring keluar + daun di pucuk
  { const parts = [];
    for (let k = 0; k < 9; k++) {
      const h = 6 + rng() * 3.5, a = rng() * 6.283, d = rng() * 0.7, lx = Math.cos(a) * (0.05 + rng() * 0.12), lz = Math.sin(a) * (0.05 + rng() * 0.12);
      const c = prep(new THREE.CylinderGeometry(0.04, 0.065, h, 5)); c.translate(0, h / 2, 0); c.rotateZ(-lx); c.rotateX(lz); c.translate(Math.cos(a) * d, 0, Math.sin(a) * d); setColor(c, 0x9bb04a); parts.push(c);
      const tx = Math.cos(a) * d - Math.sin(-lx) * h, tz = Math.sin(a) * d + Math.sin(lz) * h, ty = Math.cos(lx) * Math.cos(lz) * h * 0.92;
      for (let q = 0; q < 3; q++) { const l = prep(new THREE.ConeGeometry(0.28, 1.5, 3)); l.rotateZ(Math.PI / 2 + 0.35); l.rotateY(q * 2.1 + rng()); l.translate(tx, ty - 0.2, tz); setColor(l, 0x4f8a2a); parts.push(l); }
    }
    S.bamboo = mergeGeometries(parts);
    S.bambooMat = mat.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }), 0.035, 3.0);
  }
  // tumpukan jerami
  { const a = prep(new THREE.CylinderGeometry(0.75, 0.9, 1.1, 9)); a.translate(0, 0.55, 0); setColor(a, 0xcdae55);
    const b = prep(new THREE.ConeGeometry(0.85, 0.95, 9)); b.translate(0, 1.55, 0); setColor(b, 0xd8ba62);
    const c = prep(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 5)); c.translate(0, 2.2, 0); setColor(c, 0x6b4a2d);
    S.hay = mergeGeometries([a, b, c]); S.hayMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  }
  S.box = new THREE.BoxGeometry(1, 1, 1); S.plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  S.soilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  S.waterMat = new THREE.MeshStandardMaterial({ color: 0x8fcbd6, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  S.dikeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a50, roughness: 1, flatShading: true });
  S.padMat = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 1, side: THREE.DoubleSide });
  return (SH = S);
}

const SOIL = { mud: 0x5b4330, flood: 0x4e3d2a, young: 0x4d3e2b, grown: 0x56502c, ripe: 0x7a6c3a, harvest: 0x8c7845, corn: 0x6a4f30, pond: 0x3f3a2a, hut: 0x8e7d4e, barn: 0x8e7d4e, palm: 0x6f9a3c };
const WATER = { flood: [0.95, 1, 1], young: [0.9, 0.98, 0.98], mud: [0.6, 0.52, 0.42], pond: [0.5, 0.78, 0.85] };   // tint air tiap jenis petak (dikali warna dasar air)
const CROP = { flood: 'seed', young: 'young', grown: 'green', ripe: 'ripe', harvest: 'stub' };

export function* buildSawahGen(o) {
  const { seg, colliders, rand, COARSE, geo, mat, tex, ribbon, jitter, prep } = o;
  const X0 = SAWAH_SEG_X[seg], X1 = SAWAH_SEG_X[seg + 1], LEN_F = (X1 - X0) / 250;
  const R = (a, b) => a + rand() * (b - a);
  const group = new THREE.Group(); group.name = 'sawah-' + (seg + 1);
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const stdC = new Map(), std = (color, extra) => { if (extra) return new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra }); let m = stdC.get(color); if (!m) stdC.set(color, m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })); return m; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const k = new THREE.Mesh(g, m); k.position.set(x, y, z); k.castShadow = k.receiveShadow = true; parent.add(k); return k; };
  const inSeg = x => x >= X0 && x < X1;
  const S = shared(o);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (a, b, h, n = 6) => new THREE.CylinderGeometry(a, b, h, n);
  const woodMat = std(0x8b6338), timber = std(0x5b3d22), stoneMat = std(0x8d8a85), lanternMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa83a, emissiveIntensity: 0.9, roughness: 0.6, flatShading: true });
  const thatchMat = std(0xb99a4e, { side: THREE.DoubleSide }), bambooMat = std(0xb59a52);

  // batas kotak area jelajah di bagian ini (+ margin untuk sabuk pohon)
  let zmin = Infinity, zmax = -Infinity;
  for (const c of SAWAH_CIRCLES) if (c.x + c.r > X0 - 30 && c.x - c.r < X1 + 30) { zmin = Math.min(zmin, c.z - c.r - 30); zmax = Math.max(zmax, c.z + c.r + 30); }
  const RX = () => R(X0, X1), RZ = () => R(zmin, zmax);
  const rpts = SAWAH_PTS.filter(p => p.x > X0 - 70 && p.x < X1 + 70);
  const roadD = (x, z) => { let m = 1e9; for (let i = 0; i < rpts.length; i++) { const d = Math.hypot(x - rpts[i].x, z - rpts[i].z); if (d < m) m = d; } return m; };
  const roadS = (x, z) => { let m = 1e9, s = 0; for (let i = 0; i < rpts.length; i++) { const d = Math.hypot(x - rpts[i].x, z - rpts[i].z); if (d < m) { m = d; s = rpts[i].s; } } return s; };
  const plots = SAWAH_PLOTS.filter(p => inSeg(p.x));
  const rest = SAWAH_SPOTS.rest, G = KEKAISARAN_GATE, gn = { x: -G.tz, z: G.tx };
  const specials = [{ x: rest.x, z: rest.z, r: rest.r + 2 }];
  const nearSpecial = (x, z, pad = 0) => { for (const f of specials) if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return true; return false; };
  const onFence = (x, z, pad) => { if (KEKAISARAN.open) return false; const a = (x - G.x) * G.tx + (z - G.z) * G.tz, b = (x - G.x) * gn.x + (z - G.z) * gn.z; return Math.abs(a) < pad && Math.abs(b) < G.half + 2; };
  const yawAt = s => { const p = sroadAt(s); return Math.atan2(-p.tz, p.tx); };   // rotation.y yang membuat sumbu-x lokal searah jalan dan sumbu-z lokal ke sisi kanan (beta > 0)

  // ---------- 1) Bercak warna tanah ----------
  { const alpha = tex.radialAlpha(0.25), pm = (c, op) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: op, alphaMap: alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mats = [pm(0x6aa83a, 0.5), pm(0x9bbd4a, 0.5), pm(0x4f8f33, 0.5), pm(0xc9b85a, 0.34)], lists = [[], [], [], []], pg = new THREE.CircleGeometry(1, 24), N = Math.round((COARSE ? 24 : 46) * LEN_F);
    for (let i = 0, n = 0; n < N && i < N * 12; i++) {
      if (i % 350 === 0 && i) yield;
      const x = RX(), z = RZ(); if (sawahDist(x, z) > 4) continue;
      const s = R(7, 20); dummy.position.set(x, 0.011 + (n % 4) * 0.0008, z); dummy.rotation.set(-Math.PI / 2, 0, rand() * 3); dummy.scale.set(s, s * R(0.55, 1), 1); dummy.updateMatrix(); lists[n % 4].push(dummy.matrix.clone()); n++;
    }
    lists.forEach((l, k) => { if (!l.length) return; const im = new THREE.InstancedMesh(pg, mats[k], l.length); l.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; group.add(im); });
  }
  yield;

  // ---------- 2) Jalan tanah + tepi terinjak + kerikil, saluran irigasi di kedua sisi ----------
  let flowTex = null;
  { let i0 = -1, i1 = -1; SAWAH_PTS.forEach((p, i) => { if (p.x >= X0 && p.x <= X1) { if (i0 < 0) i0 = i; i1 = i; } });
    if (i0 >= 0) {
      i0 = Math.max(0, i0 - (seg ? 1 : 0)); i1 = Math.min(SAWAH_PTS.length - 1, i1 + 1);
      const pts = SAWAH_PTS.slice(i0, i1 + 1);
      const rm = (map, extra) => new THREE.MeshStandardMaterial({ map, roughness: 1, transparent: true, alphaMap: tex.edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra });
      const verge = mesh(ribbon(pts, 8.4, 3.2), rm(null, { color: 0x8c8a48, opacity: 0.45 }), 0, 0.012, 0); verge.castShadow = false;
      const road = mesh(ribbon(pts, 4.6, 3.2), rm(tex.dirt), 0, 0.017, 0); road.castShadow = false;
      const pebG = jitter(prep(new THREE.DodecahedronGeometry(1, 0)), 0.2), pebN = Math.round((COARSE ? 50 : 110) * LEN_F), peb = new THREE.InstancedMesh(pebG, std(0x8d8a85), pebN); let pn = 0;
      for (let k = 0; k < pebN * 3 && pn < pebN; k++) {
        const ix = (rand() * (pts.length - 1)) | 0, p = pts[ix], q = pts[ix + 1], l = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = -(q.z - p.z) / l, nz = (q.x - p.x) / l, off = R(-3.4, 3.4);
        if (Math.abs(off) < 1.5) continue;
        const sc = R(0.07, 0.2); dummy.position.set(p.x + nx * off, sc * 0.3, p.z + nz * off); dummy.rotation.set(R(0, 3), R(0, 6), R(0, 3)); dummy.scale.set(sc * R(1, 1.5), sc * 0.6, sc * R(1, 1.5)); dummy.updateMatrix();
        peb.setMatrixAt(pn, dummy.matrix); const g = R(0.7, 1.15); peb.setColorAt(pn, tmpC.setRGB(g, g, g * 0.97)); pn++;
      }
      peb.count = pn; peb.receiveShadow = true; peb.frustumCulled = false; group.add(peb);

      // saluran irigasi: pita air mengalir + tepi lumpur, mengikuti jalan di jarak CANAL.off (dimulai sedikit di balik gerbang padang, berhenti sebelum gerbang kota)
      const cpts = pts.filter(p => p.s >= 18 && p.s <= SAWAH_LEN - 40);
      if (cpts.length > 2) {
        const offs = beta => cpts.map((p, i) => { const a = cpts[Math.max(0, i - 1)], b = cpts[Math.min(cpts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: p.x - dz / l * beta, z: p.z + dx / l * beta }; });
        const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
        const gr = x.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, '#79bfca'); gr.addColorStop(0.2, '#4a98b4'); gr.addColorStop(0.5, '#2f7a98'); gr.addColorStop(0.8, '#4a98b4'); gr.addColorStop(1, '#79bfca'); x.fillStyle = gr; x.fillRect(0, 0, 128, 256);
        for (let i = 0; i < 34; i++) { const px = 128 * (0.12 + rand() * 0.76), py = rand() * 256, l = 14 + rand() * 36; x.strokeStyle = `rgba(215,240,250,${0.12 + rand() * 0.25})`; x.lineWidth = 1 + rand() * 1.4; for (const oy of [-256, 0, 256]) { x.beginPath(); x.moveTo(px, py + oy); x.quadraticCurveTo(px + (rand() - 0.5) * 8, py + oy + l / 2, px + (rand() - 0.5) * 4, py + oy + l); x.stroke(); } }
        flowTex = new THREE.CanvasTexture(c); flowTex.colorSpace = THREE.SRGBColorSpace; flowTex.wrapS = THREE.ClampToEdgeWrapping; flowTex.wrapT = THREE.RepeatWrapping; flowTex.anisotropy = 4;
        const waterM = new THREE.MeshStandardMaterial({ map: flowTex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.93 });
        for (const sd of [-1, 1]) {
          const line = offs(sd * CANAL.off);
          const bank = mesh(ribbon(line, CANAL.w + 2.4, 3.2), rm(tex.dirt, { color: 0xc4b48f }), 0, 0.0145, 0); bank.castShadow = false;
          const wat = mesh(ribbon(line, CANAL.w, 3.2), waterM, 0, 0.05, 0); wat.castShadow = false;
        }
        for (const sd of [-1, 1]) for (const q of [cpts[0], cpts[cpts.length - 1]]) if (inSeg(q.x)) {   // kepala saluran dari batu
          const a = Math.atan2(-sroadAt(q.s).tz, sroadAt(q.s).tx), pp = sside(q.s, sd * CANAL.off); const b = mesh(box(0.7, 0.55, CANAL.w + 1.4), stoneMat, pp.x, 0.27, pp.z); b.rotation.y = a;
        }
      }
    }
  }
  yield;

  // ---------- 3) Setapak tegak lurus jalan + jembatan bambu di atas saluran ----------
  for (const L of SAWAH_LANES) {
    if (!inSeg(L.x)) continue;
    const yaw = yawAt(L.s);
    for (const sd of [-1, 1]) {
      const pts = []; for (let b = CANAL.off + 1.2; b <= 47.6; b += 5) pts.push(sside(L.s, sd * b));
      const path = mesh(ribbon(pts, 1.8, 3.2), new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1, transparent: true, alphaMap: tex.edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 0, 0.026, 0); path.castShadow = false;
      const bp = sside(L.s, sd * CANAL.off), bg = new THREE.Group(); bg.position.set(bp.x, 0, bp.z); bg.rotation.y = yaw; group.add(bg);
      mesh(box(1.5, 0.1, 3.6), bambooMat, 0, 0.16, 0, bg);
      for (const sx of [-1, 1]) { mesh(box(0.06, 0.06, 3.6), timber, sx * 0.7, 0.8, 0, bg); for (const sz of [-1, 1]) mesh(cyl(0.05, 0.06, 0.85, 5), timber, sx * 0.7, 0.42, sz * 1.6, bg); }
    }
  }
  yield;

  // ---------- 4) Petak sawah: pematang, permukaan tanah / air, tanaman ----------
  const palms = [], bamboos = [], hays = [], pads = [];
  const CELL = 48, crops = new Map();   // petak 48 m -> InstancedMesh per jenis tanaman
  const addCrop = (type, x, z) => { const k = type + '|' + Math.floor(x / CELL) + '|' + Math.floor(z / CELL); let l = crops.get(k); if (!l) crops.set(k, l = { type, list: [] }); l.list.push(x, z); };
  const gubuk = (x, z, yaw, sc = 1) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; g.scale.setScalar(sc); group.add(g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(cyl(0.09, 0.11, 3.1, 6), timber, sx * 1.3, 1.55, sz * 1.3, g);
    mesh(box(3.1, 0.14, 3.1), woodMat, 0, 1.2, 0, g);
    mesh(box(3.0, 0.9, 0.08), bambooMat, 0, 1.75, -1.3, g); for (const sx of [-1, 1]) mesh(box(0.08, 0.9, 2.6), bambooMat, sx * 1.3, 1.75, 0, g);
    mesh(new THREE.ConeGeometry(2.9, 1.7, 4).rotateY(Math.PI / 4), thatchMat, 0, 3.95, 0, g);
    const lad = mesh(box(0.5, 1.6, 0.06), timber, 0.2, 0.65, 1.95, g); lad.rotation.x = -0.45;
    mesh(cyl(0.2, 0.2, 0.35, 8), std(0x7a5230), -0.8, 1.45, 0.6, g);   // kendi air
    return g;
  };
  const lumbung = (x, z, yaw) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; group.add(g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { mesh(cyl(0.11, 0.13, 1.1, 6), timber, sx * 1.5, 0.55, sz * 1.1, g); mesh(cyl(0.36, 0.36, 0.05, 10), timber, sx * 1.5, 0.95, sz * 1.1, g); }   // pelindung tikus
    mesh(box(3.7, 0.14, 2.8), woodMat, 0, 1.12, 0, g); mesh(box(3.3, 1.9, 2.5), std(0xb78e58), 0, 2.15, 0, g);
    for (const s of [-1, 1]) { const rp = mesh(box(2.5, 0.12, 3.4), thatchMat, s * 1.0, 3.75, 0, g); rp.rotation.z = -s * 0.62; }
    mesh(box(0.9, 1.2, 0.05), std(0x3a2a1a), 0, 1.9, 1.27, g); const lad = mesh(box(0.5, 1.5, 0.06), timber, 0, 0.6, 1.75, g); lad.rotation.x = -0.5;
    return g;
  };
  const orangOrang = (x, z) => {
    const g = new THREE.Group(); g.position.set(x, 0.05, z); g.rotation.set(0, rand() * 6, R(-0.08, 0.08)); group.add(g);
    mesh(cyl(0.05, 0.06, 1.9, 5), timber, 0, 0.95, 0, g); mesh(box(1.25, 0.07, 0.07), timber, 0, 1.45, 0, g);
    mesh(box(0.42, 0.62, 0.2), std([0xb34b3a, 0x3a6aa8, 0xc9a44a][(rand() * 3) | 0]), 0, 1.28, 0, g);
    mesh(new THREE.SphereGeometry(0.15, 8, 6), std(0xe6c79c), 0, 1.78, 0, g); mesh(new THREE.ConeGeometry(0.4, 0.28, 10), std(0xc9a04a), 0, 2.0, 0, g); mesh(cyl(0.44, 0.44, 0.03, 12), std(0xc9a04a), 0, 1.88, 0, g);
    for (const sx of [-1, 1]) mesh(box(0.1, 0.32, 0.03), std(0xa8452f), sx * 0.6, 1.28, 0, g);
  };
  const kerbau = (x, z, yaw) => {
    const g = new THREE.Group(); g.position.set(x, 0.05, z); g.rotation.y = yaw; group.add(g);
    const hide = std(0x5a5a5e), dark = std(0x3b3b3f), horn = std(0xd9d2bd), wood = std(0x7a5230);
    const body = mesh(new THREE.SphereGeometry(1, 12, 9), hide, 0, 1.25, 0, g); body.scale.set(1.45, 0.82, 0.78);
    const neck = mesh(new THREE.SphereGeometry(1, 10, 8), hide, 1.25, 1.15, 0, g); neck.scale.set(0.6, 0.55, 0.55);
    const head = mesh(new THREE.SphereGeometry(1, 10, 8), hide, 1.85, 0.95, 0, g); head.scale.set(0.55, 0.42, 0.4);
    mesh(box(0.35, 0.28, 0.5), dark, 2.3, 0.82, 0, g);
    for (const sz of [-1, 1]) { const h = mesh(new THREE.ConeGeometry(0.07, 0.8, 6), horn, 1.7, 1.3, sz * 0.45, g); h.rotation.set(sz * 1.25, 0, 0.5); }
    for (const [lx, lz] of [[0.85, 0.42], [0.85, -0.42], [-0.85, 0.42], [-0.85, -0.42]]) mesh(cyl(0.13, 0.12, 0.95, 6), hide, lx, 0.48, lz, g);
    const tail = mesh(cyl(0.03, 0.05, 0.9, 4), dark, -1.5, 1.05, 0, g); tail.rotation.z = 0.4;
    const beam = mesh(box(2.6, 0.08, 0.1), wood, -2.3, 0.75, 0, g); beam.rotation.z = -0.28;
    for (const sz of [-1, 1]) { const hd = mesh(box(0.07, 1.3, 0.07), wood, -3.45, 1.0, sz * 0.2, g); hd.rotation.z = 0.35; }
    mesh(box(0.5, 0.1, 0.34), std(0x555555), -3.1, 0.1, 0, g);
    colliders.push({ x, z, r: 1.3 });
  };

  { const dikeL = [], soilL = [], waterL = [];
    const sp = { seed: 0.8, young: 0.74, green: 0.7, ripe: 0.7, stub: 1.0 }, spc = COARSE ? 1.35 : 1;
    let pi = 0;
    for (const p of plots) {
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw), W = (lx, lz) => [p.x + lx * c + lz * sn, p.z - lx * sn + lz * c];
      // pematang: dua balok panjang (sisi) + dua pendek (ujung)
      for (const sz of [-1, 1]) { const [x, z] = W(0, sz * p.w / 2); dikeL.push([x, 0.11 + R(-0.015, 0.02), z, p.yaw, p.d + DIKE_W, 0.22, DIKE_W]); }
      for (const sx of [-1, 1]) { const [x, z] = W(sx * p.d / 2, 0); dikeL.push([x, 0.11 + R(-0.015, 0.02), z, p.yaw, DIKE_W, 0.22, p.w - DIKE_W]); }
      const iw = p.w - DIKE_W, id = p.d - DIKE_W;
      soilL.push([p.x, 0.05, p.z, p.yaw, id, 1, iw, SOIL[p.kind]]);
      if (WATER[p.kind]) { const inset = p.kind === 'pond' ? 1.5 : 0; waterL.push([p.x, 0.075, p.z, p.yaw, id - inset * 2, 1, iw - inset * 2, WATER[p.kind]]); }
      const hd = id / 2 - 0.35, hw = iw / 2 - 0.35, k = p.kind;
      if (CROP[k]) {   // padi (atau sisa panen): rumpun tersebar rapi dengan sedikit goyang posisi
        const st = sp[CROP[k]] * spc;
        for (let lx = -hd; lx <= hd; lx += st) for (let lz = -hw; lz <= hw; lz += st) { const [x, z] = W(lx + R(-0.12, 0.12) * st, lz + R(-0.12, 0.12) * st); addCrop(CROP[k], x, z); }
      } else if (k === 'corn') {   // jagung: baris lurus searah jalan
        for (let lz = -hw; lz <= hw; lz += 1.15 * spc) for (let lx = -hd; lx <= hd; lx += 0.95 * spc) { const [x, z] = W(lx + R(-0.1, 0.1), lz + R(-0.1, 0.1)); addCrop('corn', x, z); }
      }
      if (k === 'ripe' && rand() < 0.4 || k === 'grown' && rand() < 0.22) { const [x, z] = W(R(-hd * 0.5, hd * 0.5), R(-hw * 0.5, hw * 0.5)); orangOrang(x, z); }
      else if (k === 'harvest') { const n = 2 + ((rand() * 2) | 0); for (let q = 0; q < n; q++) { const [x, z] = W(R(-hd * 0.7, hd * 0.7), R(-hw * 0.7, hw * 0.7)); hays.push({ x, z, s: R(0.85, 1.15), a: rand() * 6 }); colliders.push({ x, z, r: 0.85 }); } }
      else if (k === 'mud' && rand() < 0.55) { const [x, z] = W(R(-hd * 0.35, hd * 0.35), R(-hw * 0.3, hw * 0.3)); kerbau(x, z, p.yaw + R(-0.5, 0.5)); }
      else if (k === 'hut') {
        const [x, z] = W(R(-1.5, 1.5), 0); gubuk(x, z, p.yaw + (p.sd > 0 ? Math.PI : 0) + R(-0.2, 0.2)); colliders.push({ x, z, r: 2.1 });
        for (let q = 0; q < 2; q++) { const [hx, hz] = W(R(-hd * 0.8, hd * 0.8), (q ? 1 : -1) * R(hw * 0.5, hw * 0.85)); hays.push({ x: hx, z: hz, s: R(0.9, 1.2), a: rand() * 6 }); colliders.push({ x: hx, z: hz, r: 0.85 }); }
      } else if (k === 'barn') {
        const [x, z] = W(0, 0), yw = p.yaw + (p.sd > 0 ? Math.PI : 0); lumbung(x, z, yw); for (const o2 of [-1.1, 1.1]) { const [bx, bz] = W(o2, 0); colliders.push({ x: bx, z: bz, r: 2.0 }); }
      } else if (k === 'palm') {
        const n = 5 + ((rand() * 3) | 0), got = [];
        for (let t = 0, q = 0; q < n && t < 60; t++) { const [x, z] = W(R(-hd, hd), R(-hw, hw)); if (got.some(g => Math.hypot(g[0] - x, g[1] - z) < 2.6)) continue; got.push([x, z]); palms.push({ x, z, s: R(0.9, 1.25), a: rand() * 6.283 }); colliders.push({ x, z, r: 0.34 }); q++; }
      } else if (k === 'pond') {
        for (let q = 0; q < 8; q++) { const [x, z] = W(R(-hd * 0.7, hd * 0.7), R(-hw * 0.7, hw * 0.7)); pads.push({ x, z, s: R(0.8, 1.5) }); }
      }
      if ((++pi) % 3 === 0) yield;
    }
    // pematang
    { const im = new THREE.InstancedMesh(S.box, S.dikeMat, dikeL.length);
      dikeL.forEach((d, i) => { dummy.position.set(d[0], d[1], d[2]); dummy.rotation.set(0, d[3], 0); dummy.scale.set(d[4], d[5], d[6]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      im.castShadow = im.receiveShadow = true; im.frustumCulled = false; group.add(im); }
    // permukaan tanah & air
    const flat = (list, material) => { if (!list.length) return null; const im = new THREE.InstancedMesh(S.plane, material, list.length);
      list.forEach((d, i) => { dummy.position.set(d[0], d[1], d[2]); dummy.rotation.set(0, d[3], 0); dummy.scale.set(d[4], d[5], d[6]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); const c = d[7]; if (Array.isArray(c)) im.setColorAt(i, tmpC.setRGB(c[0], c[1], c[2])); else im.setColorAt(i, tmpC.setHex(c)); });
      im.receiveShadow = true; im.frustumCulled = false; group.add(im); return im; };
    flat(soilL, S.soilMat); flat(waterL, S.waterMat);
    yield;
    // tanaman: satu InstancedMesh per petak 48 m dan jenis
    let cn = 0;
    for (const { type, list } of crops.values()) {
      const n = list.length / 2, im = new THREE.InstancedMesh(S.rice[type], S.riceMat[type], n);
      for (let i = 0; i < n; i++) {
        const sc = R(0.85, 1.25); dummy.position.set(list[i * 2], 0.04, list[i * 2 + 1]); dummy.rotation.set(0, rand() * 6.283, 0); dummy.scale.set(sc, sc * R(0.9, 1.15), sc); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        const g = R(0.88, 1.12); im.setColorAt(i, tmpC.setRGB(g, g, g * R(0.9, 1.05)));
      }
      im.receiveShadow = true; im.castShadow = false; group.add(im); if ((++cn % 2) === 0) yield;
    }
    if (hays.length) { const im = new THREE.InstancedMesh(S.hay, S.hayMat, hays.length); hays.forEach((h, i) => { dummy.position.set(h.x, 0.04, h.z); dummy.rotation.set(0, h.a, 0); dummy.scale.setScalar(h.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }); im.castShadow = im.receiveShadow = true; group.add(im); }
    if (pads.length) { const im = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 10).rotateX(-Math.PI / 2), S.padMat, pads.length); pads.forEach((q, i) => { dummy.position.set(q.x, 0.09, q.z); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.setScalar(q.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }); group.add(im); }
  }
  yield;

  // ---------- 5) Pohon: rumput tinggi di luar petak, kelapa & bambu, sabuk pohon di tepi, semak ----------
  const trees = [], bushes = [], tcell = 4, tgrid = new Map(), tk = (cx, cz) => (cx + 2000) * 5000 + (cz + 2000);
  const tooClose = (x, z, d) => { const cx = Math.floor(x / tcell), cz = Math.floor(z / tcell), r = Math.ceil(d / tcell);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const l = tgrid.get(tk(cx + i, cz + j)); if (l) for (const t of l) if (Math.hypot(t.x - x, t.z - z) < d) return true; } return false; };
  const regTree = (x, z) => { const k = tk(Math.floor(x / tcell), Math.floor(z / tcell)); (tgrid.get(k) || tgrid.set(k, []).get(k)).push({ x, z }); };
  for (const q of [...palms, ...bamboos]) regTree(q.x, q.z);
  const free = (x, z, edge, rd) => sawahDist(x, z) < -edge && roadD(x, z) > rd && !plotAt(x, z, 1.2) && !nearSpecial(x, z, 2) && !onFence(x, z, 12);
  { // rumput tinggi (di bagian yang bukan petak / jalan / saluran)
    const grassMat = mat.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.15, 0, true);
    const CL = 40, cells = new Map(), N = Math.round((COARSE ? 2600 : 5200) * LEN_F);
    for (let i = 0, n = 0; n < N && i < N * 6; i++) {
      if (i % 350 === 0 && i) yield;
      const x = RX(), z = RZ(); if (sawahDist(x, z) > -1.2 || roadD(x, z) < 7.4 || plotAt(x, z, 0.9) || nearSpecial(x, z) || onFence(x, z, 2.6)) continue;
      const k = Math.floor(x / CL) + ',' + Math.floor(z / CL); let c = cells.get(k); if (!c) cells.set(k, c = []);
      c.push({ x, z, sx: R(0.9, 1.9), sy: R(0.8, 1.5), a: rand() * 6.283, r: R(0.8, 1.1), g: R(0.85, 1.12), b: R(0.7, 1.0) }); n++;
    }
    let cn = 0;
    for (const c of cells.values()) {
      const im = new THREE.InstancedMesh(geo.grassGeo, grassMat, c.length);
      c.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.set(t.sx, t.sy, t.sx); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.setRGB(t.r, t.g, t.b)); });
      im.receiveShadow = true; group.add(im); if ((++cn % 2) === 0) yield;
    }
  }
  yield;
  { // kelapa & bambu di dalam area jelajah (di luar petak), dengan collider
    for (let i = 0, cl = 0; cl < Math.round((COARSE ? 5 : 10) * LEN_F) && i < 400; i++) {
      const cx = RX(), cz = RZ(); if (!free(cx, cz, 8, 9)) continue; cl++;
      const m = 2 + ((rand() * 3) | 0); for (let k = 0; k < m; k++) { const a = rand() * 6.283, d = R(0, 4), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (free(x, z, 5, 8) && !tooClose(x, z, 2.6)) { palms.push({ x, z, s: R(0.9, 1.3), a: rand() * 6.283 }); colliders.push({ x, z, r: 0.34 }); regTree(x, z); } }
    }
    for (let i = 0, n = 0; n < Math.round((COARSE ? 3 : 7) * LEN_F) && i < 400; i++) { const x = RX(), z = RZ(); if (!free(x, z, 7, 9) || tooClose(x, z, 4)) continue; bamboos.push({ x, z, s: R(0.9, 1.3), a: rand() * 6.283 }); colliders.push({ x, z, r: 0.9 }); regTree(x, z); n++; }
    // sabuk pohon di luar tepi ladang (tak terjangkau pemain: tanpa collider). Yang dekat padang diurus meadow.js.
    const depth = COARSE ? 14 : 22, N = Math.round((COARSE ? 260 : 600) * LEN_F);
    for (let i = 0, n = 0; n < N && i < N * 14; i++) {
      const x = RX(), z = RZ(), sd = sawahDist(x, z); if (sd < 1.6 || sd > depth || meadowDist(x, z) < 24 || onFence(x, z, 2.2)) continue;
      const md = sd < 7 ? 3.4 : 4.4; if (tooClose(x, z, md)) continue;
      const u = rand(); if (u < 0.18) bamboos.push({ x, z, s: R(0.9, 1.4), a: rand() * 6.283, far: true }); else if (u < 0.36) palms.push({ x, z, s: R(0.9, 1.4), a: rand() * 6.283, far: true }); else trees.push({ x, z, s: R(0.95, 1.6), a: rand() * 6.283, pine: rand() < 0.2 });
      regTree(x, z); n++; if (i % 300 === 0 && i) yield;
    }
    // semak di tepi dalam (3..12 m dari tepi)
    for (let i = 0, n = 0; n < Math.round((COARSE ? 24 : 55) * LEN_F) && i < 2000; i++) {
      if (i % 350 === 0 && i) yield;
      const x = RX(), z = RZ(), sd = sawahDist(x, z); if (sd > -2.5 || sd < -12 || roadD(x, z) < 8 || plotAt(x, z, 1.5) || nearSpecial(x, z, 1) || onFence(x, z, 6)) continue;
      bushes.push({ x, z, s: R(0.8, 1.6), a: rand() * 6 }); n++;
    }
  }
  yield;
  { // pohon / kelapa / bambu -> InstancedMesh per petak 48 m
    const TC = 48, cellOf = t => Math.floor(t.x / TC) + ',' + Math.floor(t.z / TC), oakM = mat.leafMat(0.03), pineM = mat.leafMat(0.02); let cn = 0;
    for (const pine of [false, true]) {
      const cells = new Map(); for (const t of trees) if (t.pine === pine) { const k = cellOf(t); (cells.get(k) || cells.set(k, []).get(k)).push(t); }
      for (const l of cells.values()) {
        const trunk = new THREE.InstancedMesh(pine ? geo.trunkPine : geo.trunkOak, mat.barkMat, l.length), leaf = new THREE.InstancedMesh(pine ? geo.pineLeaf : geo.oakLeaf, pine ? pineM : oakM, l.length);
        l.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix); leaf.setMatrixAt(i, dummy.matrix); leaf.setColorAt(i, tmpC.setRGB(R(0.8, 1.15), R(0.88, 1.12), R(0.75, 1.1))); });
        for (const m of [trunk, leaf]) { m.castShadow = m.receiveShadow = true; group.add(m); } if ((++cn % 3) === 0) yield;
      }
    }
    for (const [list, g, m] of [[palms, S.palm, S.palmMat], [bamboos, S.bamboo, S.bambooMat]]) {
      const cells = new Map(); for (const t of list) { const k = cellOf(t); (cells.get(k) || cells.set(k, []).get(k)).push(t); }
      for (const l of cells.values()) {
        const im = new THREE.InstancedMesh(g, m, l.length);
        l.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
        im.castShadow = im.receiveShadow = true; group.add(im); if ((++cn % 3) === 0) yield;
      }
    }
    if (bushes.length) {
      const bg = jitter(prep(new THREE.IcosahedronGeometry(1, 1)), 0.25), bm = new THREE.InstancedMesh(bg, std(0xffffff), bushes.length);
      bushes.forEach((b, i) => { dummy.position.set(b.x, 0.45 * b.s, b.z); dummy.rotation.set(0, b.a, 0); dummy.scale.set(b.s * 1.1, b.s * 0.75, b.s * 1.1); dummy.updateMatrix(); bm.setMatrixAt(i, dummy.matrix); bm.setColorAt(i, tmpC.setHSL(R(0.25, 0.32), R(0.45, 0.6), R(0.2, 0.3))); if (b.s > 1.2) colliders.push({ x: b.x, z: b.z, r: b.s * 0.8 }); });
      bm.castShadow = bm.receiveShadow = true; group.add(bm);
    }
  }
  yield;

  // ---------- 6) Batu besar + bukit jauh di balik sabuk pohon ----------
  { const rg = jitter(prep(new THREE.DodecahedronGeometry(1, 0)), 0.18), N = Math.round((COARSE ? 6 : 12) * LEN_F), rm = new THREE.InstancedMesh(rg, std(0x8a8a8e), N); let n = 0;
    for (let i = 0; i < N * 30 && n < N; i++) {
      if (i % 350 === 0 && i) yield;
      const x = RX(), z = RZ(); if (sawahDist(x, z) > -3 || roadD(x, z) < 8 || plotAt(x, z, 1.5) || nearSpecial(x, z, 1) || onFence(x, z, 5)) continue;
      const s = R(0.45, 1.4); dummy.position.set(x, s * 0.2, z); dummy.rotation.set(R(0, 3), R(0, 6), R(0, 3)); dummy.scale.set(s * R(1, 1.4), s * R(0.6, 0.95), s * R(1, 1.4)); dummy.updateMatrix();
      rm.setMatrixAt(n, dummy.matrix); const g = R(0.75, 1.15); rm.setColorAt(n, tmpC.setRGB(g, g, g * R(0.95, 1.05))); if (s > 0.8) colliders.push({ x, z, r: s }); n++;
    }
    rm.count = n; rm.castShadow = rm.receiveShadow = true; group.add(rm);
    const hg = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm = [std(0x5d9c4c), std(0x6aa955)];
    for (let i = 0, k = 0; k < (COARSE ? 3 : 6) && i < 120; i++) {
      const s0 = R(0, SAWAH_LEN), p = sroadAt(s0), sd = rand() < 0.5 ? -1 : 1, off = R(105, 175), s = R(26, 44), sx = s * R(1, 1.6), x = p.x - p.tz * sd * off, z = p.z + p.tx * sd * off;
      if (!inSeg(x) || sawahDist(x, z) < sx * 1.1 + 8 || meadowDist(x, z) < sx * 1.1 + 12) continue;
      const h = new THREE.Mesh(hg, hm[k % 2]); h.scale.set(sx, R(10, 24), s); h.position.set(x, -1, z); h.rotation.y = rand() * 6; h.receiveShadow = true; group.add(h); k++;
    }
  }
  yield;

  // ---------- 7) Papan petunjuk, saung istirahat, kincir air ----------
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
  function signPost(x, z, fx, fz, rowsFn, scale = 1, w = 2.0, h = 1.0) {   // papan menghadap titik (fx, fz); e = +1 bila arah menuju Kota Kekaisaran ada di sisi kanan papan
    const yaw = Math.atan2(fx - x, fz - z), rp = sroadAt(roadS(x, z)), east = Math.cos(yaw) * rp.tx - Math.sin(yaw) * rp.tz > 0 ? 1 : -1;
    const front = new THREE.MeshStandardMaterial({ map: signTex(rowsFn(east)), roughness: 1 });
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; g.scale.setScalar(scale); group.add(g);
    mesh(cyl(0.07, 0.09, 2.3, 8), timber, 0, 1.15, 0, g);
    const board = new THREE.Mesh(box(w, h, 0.1), [woodMat, woodMat, woodMat, woodMat, front, woodMat]); board.position.set(0, 1.95, 0.08); board.castShadow = true; g.add(board);
    mesh(box(w + 0.2, 0.08, 0.16), timber, 0, 1.95 + h / 2 + 0.05, 0.08, g);
    colliders.push({ x, z, r: 0.28 });
  }
  const m10 = v => Math.round(v / 10) * 10;
  if (seg === 0) { const p = sside(10, 3.6), q = sroadAt(10); signPost(p.x, p.z, q.x - q.tx * 10, q.z - q.tz * 10, () => [{ text: SAWAH.name.toUpperCase(), sub: 'Pematang & saluran irigasi', arrow: 0 }, { text: 'KOTA KEKAISARAN', sub: m10(SAWAH_LEN) + ' m', arrow: 0 }], 1.1, 2.4, 1.1); }
  for (let s = SAWAH_SPOTS.signEvery, k = 0; s < SAWAH_LEN - 60; s += SAWAH_SPOTS.signEvery, k++) {
    const p = sroadAt(s); if (!inSeg(p.x) || Math.abs(s - rest.s) < 26) continue;
    let sd = k % 2 ? -1 : 1, q = sside(s, sd * 3.7);
    signPost(q.x, q.z, p.x, p.z, e => [{ text: 'KOTA KEKAISARAN', sub: m10(SAWAH_LEN - s) + ' m', arrow: e }, { text: 'PADANG ARUNIKA', sub: m10(s) + ' m', arrow: -e }]);
  }
  if (inSeg(rest.x)) {   // saung istirahat di tepi jalan: pondok besar + bangku + lampu, dihubungkan jalan setapak ke jalan utama
    const yaw = Math.atan2(rest.tz, -rest.tx);   // menghadap jalan
    const pts = []; for (let b = 3.4; b <= 10.5; b += 3.5) pts.push(sside(rest.s, b)); const pth = mesh(ribbon(pts, 1.9, 3.2), new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1, transparent: true, alphaMap: tex.edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 0, 0.026, 0); pth.castShadow = false;
    gubuk(rest.x, rest.z, yaw, 1.5); colliders.push({ x: rest.x, z: rest.z, r: 3.1 });
    for (const sd of [-1, 1]) { const q = sside(rest.s + sd * 5, 8.2), l = new THREE.Group(); l.position.set(q.x, 0, q.z); group.add(l); mesh(cyl(0.07, 0.1, 2.5, 6), timber, 0, 1.25, 0, l); mesh(box(0.3, 0.38, 0.3), lanternMat, 0, 2.65, 0, l).castShadow = false; mesh(box(0.42, 0.08, 0.42), timber, 0, 2.88, 0, l); colliders.push({ x: q.x, z: q.z, r: 0.22 }); }
    { const q = sside(rest.s - 8, 7.2); signPost(q.x, q.z, rest.x - rest.tx * 8, rest.z - rest.tz * 8, () => [{ text: 'SAUNG ISTIRAHAT', sub: 'Berteduhlah, petani', arrow: 0 }], 1, 2.0, 0.55); }
  }
  let wheel = null;
  { const ws = 230, wp = sside(ws, CANAL.off);
    if (inSeg(wp.x)) {
      const g = new THREE.Group(); g.position.set(wp.x, 0, wp.z); g.rotation.y = yawAt(ws); group.add(g);
      wheel = new THREE.Group(); wheel.position.y = 1.7; g.add(wheel);
      mesh(new THREE.TorusGeometry(1.9, 0.07, 6, 18), woodMat, 0, 0, 0, wheel); mesh(cyl(0.12, 0.12, 0.9, 8), timber, 0, 0, 0, wheel).rotation.x = Math.PI / 2;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, sp = mesh(box(3.8, 0.06, 0.1), woodMat, 0, 0, 0, wheel); sp.rotation.z = a; const pd = mesh(box(0.5, 0.06, 0.8), bambooMat, Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0, wheel); pd.rotation.z = a + Math.PI / 2; }
      { const wy = yawAt(ws); for (const sz of [-1, 1]) { mesh(cyl(0.08, 0.1, 2.4, 6), timber, 0, 1.2, sz * 0.85, g); colliders.push({ x: wp.x + sz * 0.85 * Math.sin(wy), z: wp.z + sz * 0.85 * Math.cos(wy), r: 0.4 }); } }
    }
  }
  yield;

  // ---------- 8) Gerbang perbatasan menuju Kota Kekaisaran (BELUM dibuka) ----------
  if (!KEKAISARAN.open && inSeg(G.x)) {
    const E = (b, a = 0) => ({ x: G.x + G.tx * a + gn.x * b, z: G.z + G.tz * a + gn.z * b });
    const gateB = G.gap + 2.0, beamYaw = Math.atan2(-gn.z, gn.x), logBase = std(0x6b4a2d), logVar = std(0x5b3d22);
    const logs = []; for (let b = -G.half; b <= G.half; b += 0.95) { if (Math.abs(b) < gateB + 1.9) continue; logs.push(b); }
    const lg = new THREE.CylinderGeometry(0.4, 0.45, 1, 7).translate(0, 0.5, 0), tg = new THREE.ConeGeometry(0.4, 0.9, 7).translate(0, 0.45, 0);
    const lm = new THREE.InstancedMesh(lg, logBase, logs.length), tm = new THREE.InstancedMesh(tg, logVar, logs.length);
    logs.forEach((b, i) => { const p = E(b + R(-0.05, 0.05)), H = 3.3 + 0.45 * Math.sin(b * 1.3) + R(-0.15, 0.15);
      dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(1, H, 1); dummy.updateMatrix(); lm.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, H, p.z); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); tm.setMatrixAt(i, dummy.matrix);
      const g = R(0.8, 1.15); lm.setColorAt(i, tmpC.setRGB(g, g * 0.95, g * 0.9)); });
    lm.castShadow = tm.castShadow = lm.receiveShadow = tm.receiveShadow = true; group.add(lm, tm);
    for (const sg of [-1, 1]) { const from = gateB + 2, to = G.half, p = E(sg * (from + to) / 2, -0.5); for (const y of [1.1, 2.3]) { const bm = mesh(box(to - from, 0.18, 0.22), timber, p.x, y, p.z); bm.rotation.y = beamYaw; } }
    for (const sg of [-1, 1]) {   // menara jaga batu di kiri-kanan pintu
      const p = E(sg * gateB), t2 = new THREE.Group(); t2.position.set(p.x, 0, p.z); t2.rotation.y = G.yaw; group.add(t2);
      mesh(box(3.6, 8, 3.6), stoneMat, 0, 4, 0, t2); mesh(box(4.2, 0.4, 4.2), std(0x6f6c68), 0, 8.2, 0, t2);
      mesh(new THREE.ConeGeometry(3.3, 3.4, 4).rotateY(Math.PI / 4), std(0x7b3b2a), 0, 10.1, 0, t2); mesh(new THREE.ConeGeometry(0.1, 1.2, 6), std(0xe0b33a), 0, 12.4, 0, t2);
      const wm = mesh(new THREE.PlaneGeometry(0.8, 1.6), lanternMat, 0, 5.4, -1.84, t2); wm.rotation.y = Math.PI; wm.castShadow = false;
      mesh(box(0.06, 1.3, 1.9), std(0xa8301f), 1.1, 11.6, 0.1, t2).castShadow = false;
    }
    for (const sg of [-1, 1]) { const p = E(sg * G.gap / 2), d = mesh(box(G.gap, 4.6, 0.32), std(0x4f3420), p.x, 2.3, p.z); d.rotation.y = G.yaw; for (const y of [0.9, 2.3, 3.7]) { const bd = mesh(box(G.gap + 0.05, 0.16, 0.38), std(0x2a2220), p.x, y, p.z); bd.rotation.y = G.yaw; } }
    { const p = E(0), lt = mesh(box(2 * gateB + 1.0, 1.0, 1.0), timber, p.x, 5.1, p.z); lt.rotation.y = beamYaw; const em = mesh(box(1.8, 1.0, 0.1), std(0xe0b33a), p.x - G.tx * 0.6, 5.1, p.z - G.tz * 0.6); em.rotation.y = G.yaw; }
    for (let b = -G.half; b <= G.half; b += 1.2) { const p = E(b); colliders.push({ x: p.x, z: p.z, r: 0.85 }); }
    for (const sg of [-1, 1]) { const p = E(sg * gateB); colliders.push({ x: p.x, z: p.z, r: 2.2 }); }
    { const q = { x: G.x - G.tx * 7 + gn.x * 6.2, z: G.z - G.tz * 7 + gn.z * 6.2 }; signPost(q.x, q.z, q.x - G.tx * 10, q.z - G.tz * 10, () => [{ text: KEKAISARAN.name.toUpperCase(), sub: 'Gerbang perbatasan masih tertutup', arrow: 0 }, { text: 'JALAN BELUM DIBUKA', sub: 'Kembalilah nanti, pengelana', arrow: 0 }], 1.15, 2.4, 1.2); }
    for (const sg of [-1, 1]) { const p = E(sg * 5.2, -6); mesh(cyl(0.07, 0.1, 2.5, 6), timber, p.x, 1.25, p.z); mesh(box(0.3, 0.38, 0.3), lanternMat, p.x, 2.65, p.z).castShadow = false; colliders.push({ x: p.x, z: p.z, r: 0.22 }); }
  }
  yield;

  const upd = (flowTex || wheel) ? (t => { if (flowTex) flowTex.offset.y = -t * 0.12; if (wheel) wheel.rotation.z = -t * 0.8; }) : null;   // update(t): air saluran mengalir, kincir berputar
  return { group, update: upd };
}

export function buildSawah(opts) { const it = buildSawahGen(opts); let r; while (!(r = it.next()).done); return r.value; }
