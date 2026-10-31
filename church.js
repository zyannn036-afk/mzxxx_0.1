import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHURCH } from './city-layout.js';

// ============================================================
//  Interior Katedral Arunika. Dibangun sekali di titik jauh (CHURCH.x, CHURCH.z), disembunyikan sampai pemain masuk (show(true)).
//  Dinding/langit-langit menghadap ke dalam, jadi dari luar tak terlihat: kamera yang "tembus" dinding tidak masalah.
//  Hanya 3 gambar (lantai, benda padat, benda bercahaya); tanpa lampu tambahan (lampu dunia sudah cukup, kaca patri & lilin bercahaya sendiri).
// ============================================================
const WOOD = 0x6b4a2d, WOOD_D = 0x4a3220, STONE = 0xcfc9bb, STONE_D = 0x8d8a85, CREAM = 0xe3d9c3, GOLD = 0xd9a93a, IRON = 0x2a2220, RED = 0x9b2a24;

export function buildChurch({ colliders }) {
  const group = new THREE.Group(); group.name = 'katedral-dalam'; group.position.set(CHURCH.x, 0, CHURCH.z); group.visible = false;
  const hw = CHURCH.w / 2, hl = CHURCH.l / 2, H = CHURCH.h;
  const solid = [], glow = [], tmp = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  function put(list, geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.deleteAttribute('uv');
    m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(eu.set(rx, ry, rz)), one); g.applyMatrix4(m4);
    const n = g.attributes.position.count, col = new Float32Array(n * 3); tmp.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); list.push(g);
  }
  const box = (w, h, d, x, y, z, c) => put(solid, new THREE.BoxGeometry(w, h, d), c, x, y, z);
  const cyl = (r0, r1, h, x, y, z, c, seg = 12) => put(solid, new THREE.CylinderGeometry(r0, r1, h, seg), c, x, y, z);
  const flame = (x, y, z, r = 0.09) => put(glow, new THREE.SphereGeometry(r, 6, 5), 0xffb347, x, y, z);
  const ring = (x, z, r, n, fn) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; fn(x + Math.cos(a) * r, z + Math.sin(a) * r); } };
  const circ = (x, z, r) => colliders.push({ x: CHURCH.x + x, z: CHURCH.z + z, r });
  const HP = Math.PI / 2;

  // ---------- Dinding & langit-langit (menghadap ke dalam) ----------
  put(solid, new THREE.PlaneGeometry(CHURCH.w, H), CREAM, 0, H / 2, -hl);                       // utara (belakang altar)
  put(solid, new THREE.PlaneGeometry(CHURCH.w, H), CREAM, 0, H / 2, hl, 0, Math.PI, 0);         // selatan (pintu)
  put(solid, new THREE.PlaneGeometry(CHURCH.l, H), CREAM, hw, H / 2, 0, 0, -HP, 0);             // timur
  put(solid, new THREE.PlaneGeometry(CHURCH.l, H), CREAM, -hw, H / 2, 0, 0, HP, 0);             // barat
  put(solid, new THREE.PlaneGeometry(CHURCH.w, CHURCH.l), 0x8a6a48, 0, H, 0, HP, 0, 0);         // langit-langit kayu
  for (const z of [-11, -7, -3, 1, 5, 9]) box(CHURCH.w, 0.4, 0.5, 0, H - 0.2, z, WOOD_D);      // balok melintang
  for (const x of [-3.5, 3.5]) box(0.5, 0.4, CHURCH.l, x, H - 0.2, 0, WOOD_D);                  // balok memanjang
  for (const sx of [-1, 1]) box(0.12, 1.4, CHURCH.l, sx * (hw - 0.06), 0.7, 0, WOOD);           // lambrisering kayu di kaki dinding
  box(CHURCH.w, 1.4, 0.12, 0, 0.7, -hl + 0.06, WOOD); box(CHURCH.w, 1.4, 0.12, 0, 0.7, hl - 0.06, WOOD);

  // ---------- Tiang ----------
  for (const sx of [-1, 1]) for (const z of [-9, -4.5, 0, 4.5, 9]) {
    const x = sx * 4.4;
    box(1.4, 0.4, 1.4, x, 0.2, z, STONE_D); cyl(0.5, 0.55, H - 0.8, x, H / 2, z, STONE); box(1.3, 0.4, 1.3, x, H - 0.6, z, STONE_D);
    circ(x, z, 0.65);
  }

  // ---------- Karpet, bangku, altar ----------
  box(2.0, 0.03, 22, 0, 0.02, 1, RED); box(0.14, 0.035, 22, -1.07, 0.02, 1, GOLD); box(0.14, 0.035, 22, 1.07, 0.02, 1, GOLD);
  for (const sx of [-1, 1]) for (const z of [-6.8, -4.6, -2.4, -0.2, 2.0, 4.2, 6.4, 8.6]) {
    const cx = sx * 2.7;
    box(2.2, 0.1, 0.65, cx, 0.5, z, 0x7a5232); box(2.2, 0.9, 0.1, cx, 1.0, z + 0.33, 0x6b4a2d);
    for (const ex of [-1.05, 1.05]) box(0.1, 0.5, 0.55, cx + ex, 0.25, z, WOOD_D);
    for (const dx of [-0.8, 0, 0.8]) circ(cx + dx, z + 0.1, 0.45);
  }
  box(10, 0.06, 4, 0, 0.03, -11, 0x9a9488);                                                       // panggung altar (tipis, bisa diinjak)
  box(3.2, 1.1, 1.1, 0, 0.61, -11.2, 0xe9e2d0); box(3.4, 0.08, 1.3, 0, 1.2, -11.2, 0xf6f1e4);   // altar + taplak
  for (const sx of [-1, 1]) { cyl(0.06, 0.08, 0.5, sx * 1.2, 1.49, -11.2, GOLD, 8); flame(sx * 1.2, 1.82, -11.2, 0.07); }
  circ(-1.2, -11.2, 0.7); circ(0, -11.2, 0.7); circ(1.2, -11.2, 0.7);
  for (const sx of [-1, 1]) { cyl(0.05, 0.15, 1.5, sx * 4, 0.81, -11, IRON, 8); flame(sx * 4, 1.7, -11, 0.11); circ(sx * 4, -11, 0.3); }
  box(0.9, 1.2, 0.7, 3.4, 0.66, -9.6, WOOD); box(0.9, 0.08, 0.8, 3.4, 1.3, -9.6, WOOD_D); circ(3.4, -9.6, 0.6);   // mimbar
  box(0.35, 3.2, 0.12, 0, 6.4, -hl + 0.2, GOLD); box(1.8, 0.35, 0.12, 0, 7.0, -hl + 0.2, GOLD);   // salib emas di dinding belakang
  put(glow, new THREE.CircleGeometry(2.7, 28), 0xffe9a8, 0, 6.7, -hl + 0.05);                      // cahaya di belakang salib

  // ---------- Kaca patri & jendela mawar ----------
  const GLASS = [0x3a6fd8, 0xd84a3a, 0xe0b33a, 0x4aa05a, 0x8a4ad8];
  for (const sx of [-1, 1]) [-9, -4.5, 0, 4.5, 9].forEach((z, i) => {
    const ry = sx > 0 ? -HP : HP;
    put(solid, new THREE.PlaneGeometry(1.9, 4.7), WOOD_D, sx * (hw - 0.04), 6.4, z, 0, ry, 0);
    put(glow, new THREE.PlaneGeometry(1.5, 4.3), GLASS[(i + (sx > 0 ? 2 : 0)) % 5], sx * (hw - 0.07), 6.4, z, 0, ry, 0);
  });
  [[1.9, 0x8a4ad8], [1.5, 0xd84a3a], [1.1, 0xe0b33a], [0.65, 0x3a6fd8]].forEach(([r, c], i) => put(glow, new THREE.CircleGeometry(r, 24), c, 0, 8.2, hl - 0.05 - i * 0.01, 0, Math.PI, 0));

  // ---------- Pintu keluar, lampu gantung, kolam baptis ----------
  box(2.8, 4.4, 0.15, 0, 2.2, hl - 0.1, 0x5a3a22); box(3.4, 0.3, 0.22, 0, 4.55, hl - 0.12, WOOD_D); box(0.25, 4.4, 0.22, -1.6, 2.2, hl - 0.12, WOOD_D); box(0.25, 4.4, 0.22, 1.6, 2.2, hl - 0.12, WOOD_D);
  put(solid, new THREE.SphereGeometry(0.1, 8, 6), GOLD, 0.9, 2.1, hl - 0.22);
  for (const z of [-5, 2, 9]) {
    put(solid, new THREE.TorusGeometry(1.2, 0.07, 6, 20), GOLD, 0, 7.6, z, HP, 0, 0); cyl(0.03, 0.03, 3.2, 0, 9.2, z, IRON, 5);
    ring(0, z, 1.2, 8, (x, zz) => { cyl(0.05, 0.05, 0.3, x, 7.8, zz, 0xf3ecd8, 6); flame(x, 8.03, zz, 0.07); });
  }
  cyl(0.6, 0.75, 0.9, -5.6, 0.45, 10.6, STONE, 12); put(glow, new THREE.CylinderGeometry(0.5, 0.5, 0.02, 12), 0x6aa9d8, -5.6, 0.92, 10.6); circ(-5.6, 10.6, 0.85);

  // ---------- Pagar tabrakan di sepanjang dinding (pemain tak bisa keluar ruangan) ----------
  for (let x = -hw - 0.9; x <= hw + 0.91; x += 1.2) { circ(x, -hl - 0.9, 0.9); circ(x, hl + 0.9, 0.9); }
  for (let z = -hl; z <= hl; z += 1.2) { circ(-hw - 0.9, z, 0.9); circ(hw + 0.9, z, 0.9); }

  // ---------- Gabungkan jadi sedikit mesh ----------
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const sm = new THREE.Mesh(mergeGeometries(solid), solidMat), gm = new THREE.Mesh(mergeGeometries(glow), glowMat);
  sm.frustumCulled = gm.frustumCulled = false; group.add(sm, gm);

  // lantai batu kotak-kotak (1 m per kotak)
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const g = (i + j) % 2 ? 150 : 196; x.fillStyle = `rgb(${g + 6},${g},${g - 14})`; x.fillRect(i * 64, j * 64, 64, 64); x.strokeStyle = 'rgba(60,52,44,.55)'; x.lineWidth = 3; x.strokeRect(i * 64 + 1.5, j * 64 + 1.5, 61, 61); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(CHURCH.w / 2, CHURCH.l / 2); tex.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CHURCH.w, CHURCH.l).rotateX(-HP), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  floor.position.y = 0.01;   // dulu y=0 persis sebidang dengan tanah rumput dunia -> berkedip (z-fighting); sedikit diangkat + polygonOffset supaya lantai batu selalu menang
  floor.frustumCulled = false; group.add(floor);

  return { group, show(v) { group.visible = !!v; } };
}
