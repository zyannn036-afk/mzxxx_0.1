import * as THREE from 'three';
import { HOUSES, WELL, CAMPFIRE, STALL, PLOT, HAYSTACKS, BARRELS, CRATES, LAMPS, SIGN, VILLAGE, footprintCircles } from './village-layout.js';

// ============================================================
//  Membangun bangunan & perabot Desa Padang Hijau (low-poly, gaya sama dengan dunia luar)
//  Jalan tanah & alun-alun dibuat di world.js (butuh fungsi pita jalan).
// ============================================================
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });

export function buildVillage({ colliders, rand }) {
  const g = new THREE.Group(); g.name = 'desa';
  const R = (a, b) => a + rand() * (b - a);
  const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = shadow(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  const M = {
    stone: std(0x8d8a85), timber: std(0x5b3d22), door: std(0x5a3a22), hay: std(0xd8b44a), soil: std(0x5d4128),
    crop: std(0x4f9c39), crop2: std(0x7cbf3f), water: new THREE.MeshStandardMaterial({ color: 0x2a5a8a, roughness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa83a, emissiveIntensity: 0.55, roughness: 0.6 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb040, emissiveIntensity: 1.4 }),
    log: std(0x6b4a2d), iron: std(0x3a3a40),
  };
  const wallMats = {}, roofMats = {};
  const wallMat = c => wallMats[c] || (wallMats[c] = std(c)), roofMat = c => roofMats[c] || (roofMats[c] = std(c));

  // ---------- Rumah & lumbung ----------
  const WALL_H = 2.5, BASE_H = 0.35;
  function roofGeo(h) {
    if (h.kind === 'hip') {
      const geo = new THREE.ConeGeometry(1, 1.7, 4, 1); geo.rotateY(Math.PI / 4);
      geo.scale((h.w + 1.0) / 2 / 0.7071, 1, (h.d + 1.0) / 2 / 0.7071); geo.translate(0, 0.85, 0); return { geo, h: 1.7 }; // alas kerucut tepat di atas dinding
    }
    const rh = h.kind === 'barn' ? 2.3 : 1.7, hd = (h.d + 0.9) / 2, len = h.w + 0.9;
    const s = new THREE.Shape(); s.moveTo(-hd, 0); s.lineTo(hd, 0); s.lineTo(0, rh); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2); geo.rotateY(Math.PI / 2); // bubungan memanjang searah lebar rumah
    return { geo, h: rh };
  }
  function makeHouse(h) {
    const grp = new THREE.Group(); grp.position.set(h.x, 0, h.z); grp.rotation.y = h.yaw;
    const wm = wallMat(h.wall), barn = h.kind === 'barn';
    add(grp, box(h.w + 0.3, BASE_H, h.d + 0.3), M.stone, 0, BASE_H / 2, 0);
    add(grp, box(h.w, WALL_H, h.d), wm, 0, BASE_H + WALL_H / 2, 0);
    // rangka kayu: tiang sudut + balok melintang
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(grp, box(0.2, WALL_H, 0.2), M.timber, sx * h.w / 2, BASE_H + WALL_H / 2, sz * h.d / 2);
    add(grp, box(h.w + 0.1, 0.16, h.d + 0.1), M.timber, 0, BASE_H + WALL_H - 0.1, 0);
    if (!barn) add(grp, box(h.w + 0.1, 0.12, h.d + 0.1), M.timber, 0, BASE_H + 1.05, 0);
    // atap
    const rg = roofGeo(h); add(grp, rg.geo, roofMat(h.roof), 0, BASE_H + WALL_H, 0);
    // pintu & jendela (sisi depan = +z lokal)
    const fz = h.d / 2;
    if (barn) {
      add(grp, box(2.6, 2.0, 0.12), M.door, 0, BASE_H + 1.0, fz + 0.04);
      add(grp, box(0.14, 2.0, 0.16), M.timber, 0, BASE_H + 1.0, fz + 0.06);
      add(grp, box(2.8, 0.14, 0.16), M.timber, 0, BASE_H + 1.55, fz + 0.06);
    } else {
      add(grp, box(0.95, 1.75, 0.12), M.door, 0, BASE_H + 0.875, fz + 0.04);
      add(grp, box(1.15, 0.12, 0.16), M.timber, 0, BASE_H + 1.8, fz + 0.05);
      add(grp, box(1.3, 0.1, 0.6), M.stone, 0, 0.05, fz + 0.45); // undakan
      for (const sx of [-1, 1]) {
        const wx = sx * h.w * 0.3;
        add(grp, box(0.78, 0.78, 0.1), M.glass, wx, BASE_H + 1.55, fz + 0.03);
        add(grp, box(0.95, 0.1, 0.16), M.timber, wx, BASE_H + 1.1, fz + 0.06);
        add(grp, box(0.16, 0.9, 0.16), M.timber, wx - 0.5, BASE_H + 1.55, fz + 0.06);
        add(grp, box(0.16, 0.9, 0.16), M.timber, wx + 0.5, BASE_H + 1.55, fz + 0.06);
      }
      add(grp, box(0.7, 1.6, 0.7), M.stone, h.w * 0.25, BASE_H + WALL_H + rg.h * 0.55, -h.d * 0.2); // cerobong
    }
    g.add(grp);
    for (const c of footprintCircles(h)) colliders.push({ x: c.x, z: c.z, r: c.r + 0.1 });
  }
  HOUSES.forEach(makeHouse);

  // ---------- Sumur ----------
  { const w = new THREE.Group(); w.position.set(WELL.x, 0, WELL.z);
    add(w, new THREE.CylinderGeometry(0.95, 1.05, 0.95, 12), M.stone, 0, 0.475, 0);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.72, 12), M.water); water.rotation.x = -Math.PI / 2; water.position.y = 0.8; w.add(water);
    for (const s of [-1, 1]) add(w, box(0.14, 2.1, 0.14), M.timber, s * 0.95, 1.5, 0);
    add(w, new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6).rotateZ(Math.PI / 2), M.timber, 0, 2.3, 0);
    const roof = add(w, new THREE.ConeGeometry(1.5, 0.9, 4), roofMat(0x8a3b2c), 0, 2.85, 0); roof.rotation.y = Math.PI / 4;
    add(w, new THREE.CylinderGeometry(0.2, 0.17, 0.26, 8), M.timber, 0.25, 1.75, 0);
    g.add(w); colliders.push({ x: WELL.x, z: WELL.z, r: WELL.r }); }

  // ---------- Api unggun + tempat duduk kayu ----------
  const fire = new THREE.Group(); fire.position.set(CAMPFIRE.x, 0, CAMPFIRE.z); g.add(fire);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; add(fire, new THREE.DodecahedronGeometry(0.2, 0), M.stone, Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7); }
  for (let i = 0; i < 3; i++) { const l = add(fire, new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6).rotateZ(Math.PI / 2.4), M.log, 0, 0.22, 0); l.rotation.y = i * 1.05; }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, fog: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 7), flameMat); flame.position.y = 0.6; fire.add(flame);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xffd36a, fog: false })); flame2.position.y = 0.5; fire.add(flame2);
  const fireLight = new THREE.PointLight(0xff9a4a, 7, 11, 2); fireLight.position.y = 1.0; fire.add(fireLight);
  for (let i = 0; i < 3; i++) { const a = 0.6 + i * 2.1, seat = add(fire, new THREE.CylinderGeometry(0.22, 0.22, 1.3, 7).rotateZ(Math.PI / 2), M.log, Math.cos(a) * 2.2, 0.22, Math.sin(a) * 2.2); seat.rotation.y = -a + Math.PI / 2; }
  colliders.push({ x: CAMPFIRE.x, z: CAMPFIRE.z, r: 0.75 });

  // ---------- Warung / lapak ----------
  { const s = new THREE.Group(); s.position.set(STALL.x, 0, STALL.z); s.rotation.y = STALL.yaw;
    const stripes = canvasTex(128, (x, n) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f1e6cc' : '#b8352a'; x.fillRect(i * n / 8, 0, n / 8, n); } });
    const hw = STALL.w / 2, hd = STALL.d / 2;
    for (const sx of [-1, 1]) { add(s, box(0.12, 2.2, 0.12), M.timber, sx * hw, 1.1, hd); add(s, box(0.12, 2.5, 0.12), M.timber, sx * hw, 1.25, -hd); }
    const canopy = add(s, box(STALL.w + 0.5, 0.1, STALL.d + 0.9), new THREE.MeshStandardMaterial({ map: stripes, roughness: 1 }), 0, 2.45, -0.05); canopy.rotation.x = 0.17;
    add(s, box(STALL.w, 0.95, 0.7), wallMat(0xa8744a), 0, 0.475, hd - 0.2);        // meja
    add(s, box(STALL.w + 0.1, 0.08, 0.85), M.timber, 0, 0.98, hd - 0.2);
    add(s, box(STALL.w, 1.6, 0.08), wallMat(0xa8744a), 0, 0.8, -hd);               // papan belakang
    const fruit = [0xd0392b, 0xe9a23b, 0x6aa84f];
    for (let i = 0; i < 9; i++) add(s, new THREE.IcosahedronGeometry(0.11, 0), std(fruit[i % 3]), -1.1 + (i % 5) * 0.55, 1.12, hd - 0.2 + (i < 5 ? -0.12 : 0.14));
    g.add(s);
    colliders.push({ x: STALL.x + 0.8, z: STALL.z - 1.0, r: 0.9 }, { x: STALL.x + 0.8, z: STALL.z + 1.0, r: 0.9 }); }

  // ---------- Ladang + pagar ----------
  { const p = new THREE.Group(); p.position.set(PLOT.x, 0, PLOT.z); g.add(p);
    const soil = new THREE.Mesh(box(PLOT.w, 0.12, PLOT.d), M.soil); soil.position.y = 0.04; soil.receiveShadow = true; p.add(soil);
    const rows = 4, per = 8, cropGeo = new THREE.IcosahedronGeometry(0.2, 0);
    const crops = new THREE.InstancedMesh(cropGeo, M.crop, rows * per); crops.castShadow = true; const d = new THREE.Object3D(), tc = new THREE.Color();
    let n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < per; c++) {
      d.position.set(-PLOT.w / 2 + 0.55 + c * ((PLOT.w - 1.1) / (per - 1)), 0.25, -PLOT.d / 2 + 0.6 + r * ((PLOT.d - 1.2) / (rows - 1))); d.scale.set(R(0.9, 1.3), R(1.0, 1.8), R(0.9, 1.3)); d.updateMatrix();
      crops.setMatrixAt(n, d.matrix); crops.setColorAt(n, tc.setRGB(R(0.8, 1.1), R(0.9, 1.2), R(0.7, 1))); n++;
    }
    p.add(crops);
    // pagar kayu mengelilingi ladang (sisi yang menghadap jalan / barat dibiarkan bercelah sebagai pintu masuk)
    const hx = PLOT.w / 2 + 0.5, hz = PLOT.d / 2 + 0.5, post = new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6).translate(0, 0.5, 0);
    const posts = [];
    for (let x = -hx; x <= hx + 0.01; x += hx / 3) { posts.push([x, -hz]); posts.push([x, hz]); }
    for (let z = -hz + hz / 2; z < hz - 0.01; z += hz / 2) { posts.push([hx, z]); if (Math.abs(z) > 0.2) posts.push([-hx, z]); }
    const pi = new THREE.InstancedMesh(post, M.timber, posts.length); pi.castShadow = true;
    posts.forEach(([x, z], i) => { d.position.set(x, 0, z); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0); d.updateMatrix(); pi.setMatrixAt(i, d.matrix); colliders.push({ x: PLOT.x + x, z: PLOT.z + z, r: 0.14 }); });
    p.add(pi);
    for (const z of [-hz, hz]) for (const y of [0.35, 0.75]) add(p, box(hx * 2, 0.07, 0.06), M.timber, 0, y, z);
    for (const y of [0.35, 0.75]) add(p, box(0.06, 0.07, hz * 2), M.timber, hx, y, 0);
    // orang-orangan sawah
    const sc = new THREE.Group(); sc.position.set(0.4, 0, 0.1);
    add(sc, box(0.08, 1.6, 0.08), M.timber, 0, 0.8, 0); add(sc, box(1.1, 0.07, 0.07), M.timber, 0, 1.25, 0);
    add(sc, new THREE.IcosahedronGeometry(0.2, 0), std(0xe8d28a), 0, 1.7, 0); add(sc, new THREE.ConeGeometry(0.32, 0.3, 6), std(0x8a5a3a), 0, 1.95, 0);
    p.add(sc); colliders.push({ x: PLOT.x + 0.4, z: PLOT.z + 0.1, r: 0.2 }); }

  // ---------- Tumpukan jerami, tong, peti ----------
  for (const h of HAYSTACKS) {
    add(g, new THREE.CylinderGeometry(1.05, 1.15, 1.3, 9), M.hay, h.x, 0.65, h.z);
    add(g, new THREE.ConeGeometry(1.15, 1.1, 9), M.hay, h.x, 1.85, h.z); colliders.push({ x: h.x, z: h.z, r: 1.1 });
  }
  for (const b of BARRELS) { add(g, new THREE.CylinderGeometry(0.38, 0.34, 0.95, 9), std(0x7a5230), b.x, 0.475, b.z); add(g, new THREE.CylinderGeometry(0.4, 0.4, 0.06, 9), M.iron, b.x, 0.62, b.z); colliders.push({ x: b.x, z: b.z, r: 0.42 }); }
  CRATES.forEach((c, i) => { const m = add(g, box(0.8, 0.8, 0.8), std(0x9a6a3a), c.x, 0.4, c.z); m.rotation.y = i * 0.7; colliders.push({ x: c.x, z: c.z, r: 0.5 }); });

  // ---------- Tiang lampu ----------
  const lampLights = [];
  for (const l of LAMPS) {
    add(g, new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), M.timber, l.x, 1.3, l.z);
    add(g, box(0.34, 0.42, 0.34), M.lantern, l.x, 2.7, l.z); add(g, new THREE.ConeGeometry(0.3, 0.22, 4), M.iron, l.x, 3.02, l.z);
    colliders.push({ x: l.x, z: l.z, r: 0.14 });
  }

  // ---------- Papan nama desa ----------
  { const s = new THREE.Group(); s.position.set(SIGN.x, 0, SIGN.z); s.rotation.y = SIGN.yaw;
    const tex = canvasTex(512, (x, n) => {
      x.fillStyle = '#8b6338'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(60,35,15,${Math.random() * 0.25})`; x.fillRect(0, Math.random() * n, n, 1 + Math.random() * 3); }
      x.strokeStyle = '#4a2f18'; x.lineWidth = 18; x.strokeRect(9, 9, n - 18, n - 18);
      x.fillStyle = '#f3e3bd'; x.textAlign = 'center';
      x.font = 'bold 84px Georgia'; x.fillText('DESA', n / 2, 150);
      x.font = 'bold 86px Georgia'; x.fillText('PADANG', n / 2, 270); x.fillText('HIJAU', n / 2, 370);
      x.font = 'bold 70px Georgia'; x.fillText('▶', n / 2, 462);
    });
    add(s, new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), M.timber, 0, 1.1, 0);
    add(s, box(1.9, 1.15, 0.12), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), 0, 1.95, 0);
    g.add(s); colliders.push({ x: SIGN.x, z: SIGN.z, r: 0.25 }); }

  return {
    group: g,
    update(t) { // api berkedip
      const f = 1 + Math.sin(t * 11) * 0.12 + Math.sin(t * 17.3) * 0.08;
      flame.scale.set(1 + Math.sin(t * 9) * 0.1, f, 1 + Math.cos(t * 8) * 0.1); flame2.scale.y = 1 + Math.sin(t * 13 + 1) * 0.18;
      fireLight.intensity = 7 + Math.sin(t * 9) * 1.3 + Math.sin(t * 23) * 0.8;
    },
  };
}
