import * as THREE from 'three';
import { DUSUN, dusunYaw, D_HOUSES, D_PLAZA_R, D_WELL, D_PLOT, D_HAYSTACKS, D_BARRELS, D_CRATES, D_LAMPS, D_SIGN, D_ENTRANCE, D_PEN, footprintCircles, doorPoint } from './meadow-village-layout.js';

// ============================================================
//  Membangun Dusun Ilalang (desa kecil di Padang Rumput) — gaya low-poly yang sama dengan Desa Padang Hijau (village.js).
//  Dipanggil dari meadow.js pada bagian padang yang memuat dusun ini. Datar di y = 0, seperti seluruh padang.
//  Memakai generator acak sendiri supaya letak rumput / pohon / batu padang tidak bergeser.
// ============================================================
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildDusun({ colliders, ribbon, tex }) {
  const g = new THREE.Group(); g.name = 'dusun-ilalang';
  const rand = mulberry32(1101202), R = (a, b) => a + rand() * (b - a);
  const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = shadow(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const wp = (c, lx, lz) => ({ x: c.x + DUSUN.tx * lx - DUSUN.tz * lz, z: c.z + DUSUN.tz * lx + DUSUN.tx * lz });   // titik lokal (sejajar jalan) -> dunia

  const M = {
    stone: std(0x8d8a85), timber: std(0x5b3d22), door: std(0x5a3a22), hay: std(0xd8b44a), soil: std(0x5d4128), crop: std(0x4f9c39),
    water: new THREE.MeshStandardMaterial({ color: 0x2a5a8a, roughness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa83a, emissiveIntensity: 0.55, roughness: 0.6 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb040, emissiveIntensity: 1.4 }),
    iron: std(0x3a3a40),
  };
  const wallMats = {}, roofMats = {};
  const wallMat = c => wallMats[c] || (wallMats[c] = std(c)), roofMat = c => roofMats[c] || (roofMats[c] = std(c));

  // ---------- Jalan tanah: dari jalan padang ke alun-alun, alun-alun, dan jalan setapak ke tiap pintu ----------
  const dirtMat = () => new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1, transparent: true, alphaMap: tex.edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const road = (pts, w, y) => {
    const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.z))), pp = c.getPoints(Math.max(8, Math.round(c.getLength() * 1.6)));
    const m = new THREE.Mesh(ribbon(pp, w, 3.2), dirtMat()); m.position.y = y; m.receiveShadow = true; g.add(m);
  };
  road(D_ENTRANCE, 2.9, 0.0185);
  for (const h of D_HOUSES) {
    const d = doorPoint(h, 0.6), a = Math.atan2(d.x - DUSUN.x, d.z - DUSUN.z), e = { x: DUSUN.x + Math.sin(a) * (D_PLAZA_R - 1), z: DUSUN.z + Math.cos(a) * (D_PLAZA_R - 1) };
    road([e, { x: (e.x + d.x) / 2, z: (e.z + d.z) / 2 }, d], 1.7, 0.0165);
  }
  { const plaza = new THREE.Mesh(new THREE.CircleGeometry(D_PLAZA_R, 40), new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1, transparent: true, alphaMap: tex.radialAlpha(0.72), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(DUSUN.x, 0.02, DUSUN.z); plaza.receiveShadow = true; g.add(plaza); }

  // ---------- Rumah & lumbung ----------
  const WALL_H = 2.5, BASE_H = 0.35;
  function roofGeo(h) {
    if (h.kind === 'hip') {
      const geo = new THREE.ConeGeometry(1, 1.7, 4, 1); geo.rotateY(Math.PI / 4);
      geo.scale((h.w + 1.0) / 2 / 0.7071, 1, (h.d + 1.0) / 2 / 0.7071); geo.translate(0, 0.85, 0); return { geo, h: 1.7 };
    }
    const rh = h.kind === 'barn' ? 2.3 : 1.7, hd = (h.d + 0.9) / 2, len = h.w + 0.9;
    const s = new THREE.Shape(); s.moveTo(-hd, 0); s.lineTo(hd, 0); s.lineTo(0, rh); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2); geo.rotateY(Math.PI / 2); return { geo, h: rh };
  }
  function makeHouse(h) {
    const grp = new THREE.Group(); grp.position.set(h.x, 0, h.z); grp.rotation.y = h.yaw;
    const wm = wallMat(h.wall), barn = h.kind === 'barn';
    add(grp, box(h.w + 0.3, BASE_H, h.d + 0.3), M.stone, 0, BASE_H / 2, 0);
    add(grp, box(h.w, WALL_H, h.d), wm, 0, BASE_H + WALL_H / 2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(grp, box(0.2, WALL_H, 0.2), M.timber, sx * h.w / 2, BASE_H + WALL_H / 2, sz * h.d / 2);
    add(grp, box(h.w + 0.1, 0.16, h.d + 0.1), M.timber, 0, BASE_H + WALL_H - 0.1, 0);
    if (!barn) add(grp, box(h.w + 0.1, 0.12, h.d + 0.1), M.timber, 0, BASE_H + 1.05, 0);
    const rg = roofGeo(h); add(grp, rg.geo, roofMat(h.roof), 0, BASE_H + WALL_H, 0);
    const fz = h.d / 2;
    if (barn) {
      add(grp, box(2.6, 2.0, 0.12), M.door, 0, BASE_H + 1.0, fz + 0.04);
      add(grp, box(0.14, 2.0, 0.16), M.timber, 0, BASE_H + 1.0, fz + 0.06);
      add(grp, box(2.8, 0.14, 0.16), M.timber, 0, BASE_H + 1.55, fz + 0.06);
    } else {
      add(grp, box(0.95, 1.75, 0.12), M.door, 0, BASE_H + 0.875, fz + 0.04);
      add(grp, box(1.15, 0.12, 0.16), M.timber, 0, BASE_H + 1.8, fz + 0.05);
      add(grp, box(1.3, 0.1, 0.6), M.stone, 0, 0.05, fz + 0.45);
      for (const sx of [-1, 1]) {
        const wx = sx * h.w * 0.3;
        add(grp, box(0.78, 0.78, 0.1), M.glass, wx, BASE_H + 1.55, fz + 0.03);
        add(grp, box(0.95, 0.1, 0.16), M.timber, wx, BASE_H + 1.1, fz + 0.06);
        add(grp, box(0.16, 0.9, 0.16), M.timber, wx - 0.5, BASE_H + 1.55, fz + 0.06);
        add(grp, box(0.16, 0.9, 0.16), M.timber, wx + 0.5, BASE_H + 1.55, fz + 0.06);
      }
      add(grp, box(0.7, 1.6, 0.7), M.stone, h.w * 0.25, BASE_H + WALL_H + rg.h * 0.55, -h.d * 0.2);   // cerobong
    }
    g.add(grp);
    for (const c of footprintCircles(h)) colliders.push({ x: c.x, z: c.z, r: c.r + 0.1 });
  }
  D_HOUSES.forEach(makeHouse);

  // ---------- Sumur ----------
  { const w = new THREE.Group(); w.position.set(D_WELL.x, 0, D_WELL.z);
    add(w, new THREE.CylinderGeometry(0.95, 1.05, 0.95, 12), M.stone, 0, 0.475, 0);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.72, 12), M.water); water.rotation.x = -Math.PI / 2; water.position.y = 0.8; w.add(water);
    for (const s of [-1, 1]) add(w, box(0.14, 2.1, 0.14), M.timber, s * 0.95, 1.5, 0);
    add(w, new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6).rotateZ(Math.PI / 2), M.timber, 0, 2.3, 0);
    const roof = add(w, new THREE.ConeGeometry(1.5, 0.9, 4), roofMat(0x8a3b2c), 0, 2.85, 0); roof.rotation.y = Math.PI / 4;
    add(w, new THREE.CylinderGeometry(0.2, 0.17, 0.26, 8), M.timber, 0.25, 1.75, 0);
    g.add(w); colliders.push({ x: D_WELL.x, z: D_WELL.z, r: D_WELL.r }); }

  // ---------- Kebun sayur + pagar + orang-orangan sawah (sejajar jalan) ----------
  { const p = new THREE.Group(); p.position.set(D_PLOT.x, 0, D_PLOT.z); p.rotation.y = dusunYaw; g.add(p);
    const soil = new THREE.Mesh(box(D_PLOT.w, 0.12, D_PLOT.d), M.soil); soil.position.y = 0.04; soil.receiveShadow = true; p.add(soil);
    const rows = 4, per = 7, d = new THREE.Object3D(), tc = new THREE.Color();
    const crops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), M.crop, rows * per); crops.castShadow = true; let n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < per; c++) {
      d.position.set(-D_PLOT.w / 2 + 0.5 + c * ((D_PLOT.w - 1.0) / (per - 1)), 0.25, -D_PLOT.d / 2 + 0.55 + r * ((D_PLOT.d - 1.1) / (rows - 1))); d.scale.set(R(0.9, 1.3), R(1.0, 1.8), R(0.9, 1.3)); d.rotation.set(0, 0, 0); d.updateMatrix();
      crops.setMatrixAt(n, d.matrix); crops.setColorAt(n, tc.setRGB(R(0.8, 1.1), R(0.9, 1.2), R(0.7, 1))); n++;
    }
    p.add(crops);
    const hx = D_PLOT.w / 2 + 0.5, hz = D_PLOT.d / 2 + 0.5, posts = [];
    for (let x = -hx; x <= hx + 0.01; x += hx / 2) { posts.push([x, -hz]); posts.push([x, hz]); }
    for (let z = -hz + hz / 2; z < hz - 0.01; z += hz / 2) { posts.push([hx, z]); posts.push([-hx, z]); }
    const pi = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6).translate(0, 0.5, 0), M.timber, posts.length); pi.castShadow = true;
    posts.forEach(([x, z], i) => { d.position.set(x, 0, z); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0); d.updateMatrix(); pi.setMatrixAt(i, d.matrix); const w = wp(D_PLOT, x, z); colliders.push({ x: w.x, z: w.z, r: 0.14 }); });
    p.add(pi);
    for (const z of [-hz, hz]) for (const y of [0.35, 0.75]) add(p, box(hx * 2, 0.07, 0.06), M.timber, 0, y, z);
    for (const x of [-hx, hx]) for (const y of [0.35, 0.75]) add(p, box(0.06, 0.07, hz * 2), M.timber, x, y, 0);
    const sc = new THREE.Group(); sc.position.set(0.3, 0, 0.1);
    add(sc, box(0.08, 1.6, 0.08), M.timber, 0, 0.8, 0); add(sc, box(1.1, 0.07, 0.07), M.timber, 0, 1.25, 0);
    add(sc, new THREE.IcosahedronGeometry(0.2, 0), std(0xe8d28a), 0, 1.7, 0); add(sc, new THREE.ConeGeometry(0.32, 0.3, 6), std(0x8a5a3a), 0, 1.95, 0);
    p.add(sc); const sw = wp(D_PLOT, 0.3, 0.1); colliders.push({ x: sw.x, z: sw.z, r: 0.2 }); }

  // ---------- Tumpukan jerami, tong, peti ----------
  for (const h of D_HAYSTACKS) {
    add(g, new THREE.CylinderGeometry(1.05, 1.15, 1.3, 9), M.hay, h.x, 0.65, h.z);
    add(g, new THREE.ConeGeometry(1.15, 1.1, 9), M.hay, h.x, 1.85, h.z); colliders.push({ x: h.x, z: h.z, r: 1.1 });
  }
  for (const b of D_BARRELS) { add(g, new THREE.CylinderGeometry(0.38, 0.34, 0.95, 9), std(0x7a5230), b.x, 0.475, b.z); add(g, new THREE.CylinderGeometry(0.4, 0.4, 0.06, 9), M.iron, b.x, 0.62, b.z); colliders.push({ x: b.x, z: b.z, r: 0.42 }); }
  D_CRATES.forEach((c, i) => { const m = add(g, box(0.8, 0.8, 0.8), std(0x9a6a3a), c.x, 0.4, c.z); m.rotation.y = i * 0.7 + dusunYaw; colliders.push({ x: c.x, z: c.z, r: 0.5 }); });

  // ---------- Tiang lampu ----------
  for (const l of D_LAMPS) {
    add(g, new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), M.timber, l.x, 1.3, l.z);
    add(g, box(0.34, 0.42, 0.34), M.lantern, l.x, 2.7, l.z); add(g, new THREE.ConeGeometry(0.3, 0.22, 4), M.iron, l.x, 3.02, l.z);
    colliders.push({ x: l.x, z: l.z, r: 0.14 });
  }

  // ---------- Papan nama dusun (di tepi jalan, menghadap barat) ----------
  { const s = new THREE.Group(); s.position.set(D_SIGN.x, 0, D_SIGN.z); s.rotation.y = D_SIGN.yaw;
    const t = canvasTex(512, (x, n) => {
      x.fillStyle = '#8b6338'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(60,35,15,${Math.random() * 0.25})`; x.fillRect(0, Math.random() * n, n, 1 + Math.random() * 3); }
      x.strokeStyle = '#4a2f18'; x.lineWidth = 18; x.strokeRect(9, 9, n - 18, n - 18);
      x.fillStyle = '#f3e3bd'; x.textAlign = 'center';
      x.font = 'bold 92px Georgia'; x.fillText('DUSUN', n / 2, 170);
      x.font = 'bold 84px Georgia'; x.fillText('ILALANG', n / 2, 290);
      x.font = 'bold 70px Georgia'; x.fillText('▶', n / 2, 420);
    });
    add(s, new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), M.timber, 0, 1.1, 0);
    add(s, box(1.9, 1.15, 0.12), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), 0, 1.95, 0);
    g.add(s); colliders.push({ x: D_SIGN.x, z: D_SIGN.z, r: 0.25 }); }

  // ---------- Kandang kambing & domba (pagar kayu, pintu di barat, palung air, jerami) + hewan yang berkeliaran ----------
  const animals = [];
  { const pen = new THREE.Group(); pen.position.set(D_PEN.x, 0, D_PEN.z); pen.rotation.y = dusunYaw; g.add(pen);
    const hx = D_PEN.w / 2, hz = D_PEN.d / 2, gate = 1.0;
    const rail = (x1, z1, x2, z2) => {   // satu sisi pagar: tiang tiap ±1,5 m + dua palang + lingkaran tabrakan (pintu dilewati)
      const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(L / 1.5)), ang = Math.atan2(-(z2 - z1), x2 - x1);
      for (let i = 0; i <= n; i++) { const x = x1 + (x2 - x1) * i / n, z = z1 + (z2 - z1) * i / n; add(pen, new THREE.CylinderGeometry(0.07, 0.08, 1.1, 6), M.timber, x, 0.55, z); }
      for (const y of [0.4, 0.82]) { const r = add(pen, box(L, 0.07, 0.06), M.timber, (x1 + x2) / 2, y, (z1 + z2) / 2); r.rotation.y = ang; }
      for (let i = 0; i <= Math.ceil(L / 0.9); i++) { const t = i / Math.ceil(L / 0.9), w = wp(D_PEN, x1 + (x2 - x1) * t, z1 + (z2 - z1) * t); colliders.push({ x: w.x, z: w.z, r: 0.3 }); }
    };
    rail(-hx, -hz, hx, -hz); rail(-hx, hz, hx, hz); rail(hx, -hz, hx, hz);
    rail(-hx, -hz, -hx, -gate); rail(-hx, gate, -hx, hz);   // sisi barat dengan celah pintu
    for (const sz of [-1, 1]) add(pen, box(0.16, 1.5, 0.16), M.timber, -hx, 0.75, sz * (gate + 0.05));   // tiang pintu lebih tinggi
    const trough = add(pen, box(2.0, 0.3, 0.45), M.timber, hx - 1.4, 0.15, -hz + 0.9); add(pen, box(1.8, 0.05, 0.3), M.water, hx - 1.4, 0.3, -hz + 0.9);
    const tw = wp(D_PEN, hx - 1.4, -hz + 0.9); colliders.push({ x: tw.x, z: tw.z, r: 0.8 });
    add(pen, new THREE.CylinderGeometry(0.6, 0.75, 0.7, 9), M.hay, hx - 1.2, 0.35, hz - 1.1); add(pen, new THREE.ConeGeometry(0.7, 0.6, 9), M.hay, hx - 1.2, 1.0, hz - 1.1);
    const hw = wp(D_PEN, hx - 1.2, hz - 1.1); colliders.push({ x: hw.x, z: hw.z, r: 0.8 });

    function makeAnimal(goat, shade) {   // depan = +x lokal
      const a = new THREE.Group(), fur = std(goat ? [0x8a6a4a, 0xd9cdb5, 0x5b4636][shade % 3] : [0xf2efe6, 0xe6e1d4, 0xcfc8b8][shade % 3]), dark = std(goat ? 0x3a2c22 : 0x3a3434);
      const body = add(a, new THREE.IcosahedronGeometry(0.4, goat ? 0 : 1), fur, 0, 0.62, 0); body.scale.set(goat ? 1.35 : 1.25, goat ? 0.78 : 0.95, goat ? 0.72 : 0.95);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(a, new THREE.CylinderGeometry(0.045, 0.05, 0.42, 5), dark, sx * 0.3, 0.21, sz * 0.15);
      const head = new THREE.Group(); head.position.set(0.48, 0.78, 0); a.add(head);
      add(head, box(0.3, 0.24, 0.24), goat ? fur : dark, 0.16, 0, 0);
      for (const sz of [-1, 1]) { const e = add(head, box(0.07, 0.1, 0.16), goat ? fur : dark, 0.06, 0.02, sz * 0.17); e.rotation.x = sz * 0.5;
        if (goat) { const h = add(head, new THREE.ConeGeometry(0.035, 0.22, 5), std(0xe3dccb), 0.06, 0.2, sz * 0.07); h.rotation.z = 0.5; } }
      if (goat) add(a, box(0.05, 0.14, 0.05), fur, 0.33, 0.4, 0).position.set(0.78, 0.55, 0);   // jenggot kecil di dagu
      add(a, new THREE.IcosahedronGeometry(0.1, 0), fur, -0.52, goat ? 0.8 : 0.7, 0);              // ekor
      return { g: a, head };
    }
    const spec = [[0, 0], [0, 1], [0, 2], [0, 0], [1, 0], [1, 2]];   // [kambing?, warna]
    spec.forEach(([goat, shade], i) => {
      const m = makeAnimal(!!goat, shade); m.g.scale.setScalar(goat ? 0.95 : 1.05); pen.add(m.g);
      animals.push({ ...m, ax: 1.6 + (i % 3) * 0.9, az: 1.2 + (i % 2) * 0.9, w1: 0.11 + i * 0.013, w2: 0.09 + i * 0.011, p1: i * 1.9, p2: i * 2.7, cx: ((i % 3) - 1) * 0.6, cz: 0, ph: i * 1.3 });
    });
  }
  const upd = t => {
    for (const a of animals) {
      const s1 = a.w1 * t + a.p1, s2 = a.w2 * t + a.p2, x = a.cx + a.ax * Math.sin(s1), z = a.cz + a.az * Math.sin(s2);
      const vx = a.ax * a.w1 * Math.cos(s1), vz = a.az * a.w2 * Math.cos(s2), graze = 0.5 + 0.5 * Math.sin(t * 0.7 + a.ph);
      a.g.position.set(x, 0, z); a.g.rotation.y = Math.atan2(-vz, vx);
      a.head.rotation.z = -0.65 * graze;                 // kepala menunduk saat merumput
      a.g.position.y = 0.018 * Math.abs(Math.sin(t * 3 + a.ph));   // gerak kecil
    }
  };
  upd(0);
  return { group: g, update: upd };
}
