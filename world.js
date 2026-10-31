import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VILLAGE, HOUSES, PLAZA_R, ENTRANCE_PATH, doorPoint, villageClearAt } from './village-layout.js';
import { buildVillage } from './village.js';
import { createNPCs } from './npcs.js';
import { FOREST, FOREST_ROAD, FOREST_ROAD_2, TRAIL_GROVE, TRAIL_POND, TRAIL_STONES, forestAmount, clampToWorld, zoneDist } from './forest-layout.js';
import { buildForest } from './forest.js';
import { buildCity } from './city.js';
import { buildChurch } from './church.js';

// ============================================================
//  DUNIA LUAR — dataran hijau, pohon, rumput, bunga, & lubang menuju dungeon
//  Pusat dunia (0,0,0) = lubang dungeon. Pemain muncul di SPAWN dan berjalan mengikuti jalan tanah.
// ============================================================
export const HOLE_R = 3.4;               // radius lubang
export const LIMIT = 62;                 // batas area yang bisa dijelajahi (dari pusat)
export const SPAWN = { x: 13, z: 27 };   // titik muncul pemain
export const SKY_COLOR = 0xbcd9ee;       // warna cakrawala (dipakai juga untuk kabut)
export const FOG_DENSITY = 0.0095;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- Tekstur (digambar lewat canvas, tanpa file gambar) ----------
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const grassTex = () => canvasTex(256, (x, s) => {
  x.fillStyle = '#4f9c39'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 6000; i++) {
    const d = Math.random() < 0.5;
    x.fillStyle = d ? `rgba(${55 + Math.random() * 30 | 0},${120 + Math.random() * 45 | 0},${35 + Math.random() * 25 | 0},.35)` : `rgba(${105 + Math.random() * 40 | 0},${170 + Math.random() * 40 | 0},${60 + Math.random() * 30 | 0},.28)`;
    x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 2 + Math.random() * 6);
  }
});
const dirtTex = () => canvasTex(256, (x, s) => {
  x.fillStyle = '#7b5b39'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 4500; i++) {
    const g = 70 + Math.random() * 70 | 0;
    x.fillStyle = `rgba(${g + 30},${g},${g - 25},.3)`;
    x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 4, 1 + Math.random() * 4);
  }
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(150,140,125,.55)'; x.beginPath(); x.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.5, 0, 7); x.fill(); }
});
const radialAlpha = solid => canvasTex(128, (x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, '#fff'); g.addColorStop(solid, '#fff'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
}, false);
const edgeAlpha = () => canvasTex(64, (x, s) => {
  const g = x.createLinearGradient(0, 0, s, 0);
  g.addColorStop(0, '#000'); g.addColorStop(0.28, '#fff'); g.addColorStop(0.72, '#fff'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
}, false);

// ---------- Utilitas geometri ----------
function jitter(geo, amt) { // goyang titik-titiknya supaya bentuk organik (tiap titik yang sama bergeser sama)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = k => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 11.13) * 43758.5453; return s - Math.floor(s) - 0.5; };
    p.setXYZ(i, x + h(1) * amt, y + h(2) * amt, z + h(3) * amt);
  }
  geo.computeVertexNormals();
  return geo;
}
const prep = g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
function paint(geo, c0, c1, y0, y1) { // warna gradasi bawah -> atas lewat vertex color
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.lerpColors(a, b, Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
function ribbon(points, w, vRep) { // pita datar mengikuti kurva (untuk jalan tanah)
  const pos = [], uv = [], idx = []; let len = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[Math.min(i + 1, points.length - 1)], o = points[Math.max(i - 1, 0)];
    const tx = q.x - o.x, tz = q.z - o.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
    const wi = w * (0.88 + 0.24 * Math.sin(i * 0.6));
    pos.push(p.x + nx * wi / 2, 0, p.z + nz * wi / 2, p.x - nx * wi / 2, 0, p.z - nz * wi / 2);
    if (i) len += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    uv.push(0, len / vRep, 1, len / vRep);
    if (i < points.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setIndex(idx);
  return g;
}

export function createWorld({ COARSE = false } = {}) {
  const rand = mulberry32(20261031);
  const R = (a, b) => a + rand() * (b - a);
  const group = new THREE.Group();
  const colliders = []; // {x, z, r} lingkaran penghalang (batang pohon, batu, papan)
  const uTime = { value: 0 };

  // ---------- Cahaya matahari ----------
  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x5f7f3c, 1.15);
  const sun = new THREE.DirectionalLight(0xfff0d2, 3.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  group.add(hemi, sun, sun.target);
  const SUN_OFF = new THREE.Vector3(-30, 45, 20);

  // ---------- Langit ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_OFF.clone().normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
      void main(){
        vec3 d = normalize(vP); float h = clamp(d.y, 0.0, 1.0);
        vec3 hor = vec3(0.74,0.85,0.93), top = vec3(0.20,0.47,0.84);
        vec3 c = mix(hor, top, pow(h, 0.5));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0,0.92,0.7) * pow(s, 300.0) * 1.6 + vec3(1.0,0.85,0.6) * pow(s, 10.0) * 0.18;
        gl_FragColor = vec4(c, 1.0);
      }`
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; group.add(sky);

  const clouds = new THREE.Group(); group.add(clouds);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.93, fog: false, toneMapped: false, depthWrite: false });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < (COARSE ? 9 : 16); i++) {
    const c = new THREE.Group(), n = 4 + (rand() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat), s = R(9, 17);
      m.scale.set(s * R(1.2, 1.7), s * 0.5, s); m.position.set((k - n / 2) * 11 + R(-3, 3), R(-2, 3), R(-5, 5)); c.add(m);
    }
    const a = rand() * Math.PI * 2, d = R(90, 230);
    c.position.set(Math.cos(a) * d, R(75, 115), Math.sin(a) * d); c.userData.sp = R(1.2, 3);
    clouds.add(c);
  }

  // ---------- Tanah ----------
  const gTex = grassTex(); gTex.repeat.set(0.11, 0.11);
  const shape = new THREE.Shape(); shape.absarc(0, 0, 640, 0, Math.PI * 2, false); // dulu 170 -> 240 -> 380 -> 560 -> 640 (kota diperluas); diperluas lagi supaya Kota Arunika (di timur Gerbang Batu Kuno, sampai x≈392) ikut berpijak dan tepi tanah tidak terlihat dari sana
  const holePath = new THREE.Path(); holePath.absarc(0, 0, HOLE_R, 0, Math.PI * 2, true); shape.holes.push(holePath);
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape, 64), new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // bercak warna rumput (supaya tanah tidak terlihat berulang)
  const patchTex = radialAlpha(0.25);
  const patchMats = [0x3f8a30, 0x6bb044, 0x5aa03a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: 0.55, alphaMap: patchTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const patchGeo = new THREE.CircleGeometry(1, 24);
  for (let i = 0; i < (COARSE ? 18 : 34); i++) {
    const m = new THREE.Mesh(patchGeo, patchMats[i % 3]), s = R(6, 15);
    m.rotation.x = -Math.PI / 2; m.scale.set(s, s * R(0.6, 1), 1); m.rotation.z = rand() * 3;
    const a = rand() * Math.PI * 2, d = R(8, 95); m.position.set(Math.cos(a) * d, 0.01, Math.sin(a) * d); m.receiveShadow = true; group.add(m);
  }

  // ---------- Jalan tanah dari titik muncul menuju lubang ----------
  const pathCurve = new THREE.CatmullRomCurve3([[SPAWN.x, SPAWN.z], [11, 21], [7, 16], [8.5, 11], [3.6, 8], [1.2, 4.7]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const pathPts = pathCurve.getPoints(90);
  const dTex = dirtTex(); dTex.repeat.set(1, 1);
  const pathMesh = new THREE.Mesh(ribbon(pathPts, 2.9, 3.2), new THREE.MeshStandardMaterial({ map: dTex, roughness: 1, transparent: true, alphaMap: edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pathMesh.position.y = 0.015; pathMesh.receiveShadow = true; group.add(pathMesh);
  // ---------- Desa Padang Hijau: jalan masuk dari titik muncul, alun-alun, dan jalan setapak ke tiap pintu ----------
  const walkPts = pathPts.slice(); // semua titik jalan (dipakai agar pohon / rumput tidak menutupi jalan)
  const forestWalk = [];           // titik jalan menuju Hutan Besar (digabung ke walkPts setelah pohon lama dibuat)
  { const vMat = () => new THREE.MeshStandardMaterial({ map: dTex, roughness: 1, transparent: true, alphaMap: edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const road = (pts, w) => { // pts: [{x,z}], digambar sebagai pita tanah
      const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.z))), pp = c.getPoints(Math.max(8, Math.round(c.getLength() * 1.6)));
      const m = new THREE.Mesh(ribbon(pp, w, 3.2), vMat()); m.position.y = 0.016; m.receiveShadow = true; group.add(m); walkPts.push(...pp);
    };
    road(ENTRANCE_PATH.map(([x, z]) => ({ x, z })), 2.9);
    for (const h of HOUSES) { const d = doorPoint(h, 0.6), a = Math.atan2(d.x - VILLAGE.x, d.z - VILLAGE.z), e = { x: VILLAGE.x + Math.sin(a) * (PLAZA_R - 1), z: VILLAGE.z + Math.cos(a) * (PLAZA_R - 1) }; road([e, { x: (e.x + d.x) / 2, z: (e.z + d.z) / 2 }, d], 1.7); }
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 40), new THREE.MeshStandardMaterial({ map: dTex, roughness: 1, transparent: true, alphaMap: radialAlpha(0.72), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(VILLAGE.x, 0.02, VILLAGE.z); plaza.receiveShadow = true; group.add(plaza);
    // jalan dari desa ke Hutan Besar + dua jalan cabang (kolam & batu kuno).
    // Titiknya disimpan di forestWalk dulu (belum di walkPts) supaya tata letak pohon & batu lama tidak berubah.
    for (const [pts, w] of [[FOREST_ROAD, 2.9], [FOREST_ROAD_2, 2.9], [TRAIL_POND, 2.0], [TRAIL_STONES, 2.0], [TRAIL_GROVE, 2.0]]) {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))), pp = c.getPoints(Math.max(8, Math.round(c.getLength() * 1.6)));
      const m = new THREE.Mesh(ribbon(pp, w, 3.2), vMat()); m.position.y = 0.016; m.receiveShadow = true; group.add(m); forestWalk.push(...pp);
    }
  }
  const nearPath = (x, z, pad) => { for (let i = 0; i < walkPts.length; i++) if (Math.hypot(x - walkPts[i].x, z - walkPts[i].z) < pad) return true; return false; };
  const blocked = (x, z, pad = 0) => Math.hypot(x, z) < HOLE_R + 6.5 + pad || nearPath(x, z, 2.4 + pad) || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6 + pad || Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius + pad;

  // ---------- Bangunan desa + NPC ----------
  const vrand = mulberry32(31102026); // generator acak terpisah, supaya tata letak pohon & batu dunia lama tidak berubah
  const village = buildVillage({ colliders, rand: vrand }); group.add(village.group);
  const npcs = createNPCs({ colliders, rand: vrand }); group.add(npcs.group);

  // ---------- Lubang menuju dungeon ----------
  const pit = new THREE.Group(); group.add(pit);
  const pitDirt = dirtTex(); pitDirt.repeat.set(7, 3);
  const wallGeo = new THREE.CylinderGeometry(HOLE_R, HOLE_R * 0.88, 16, 44, 10, true); wallGeo.translate(0, -8, 0);
  { // gelap makin ke bawah
    const p = wallGeo.attributes.position, col = new Float32Array(p.count * 3), top = new THREE.Color(0x8a6842), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const t = Math.min(1, -p.getY(i) / 10); c.copy(top).multiplyScalar(Math.pow(1 - t, 1.4)); col.set([c.r, c.g, c.b], i * 3); }
    wallGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  pit.add(new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ map: pitDirt, vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
  const pitFloor = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R * 0.88, 32), new THREE.MeshBasicMaterial({ color: 0x8b34e0 }));
  pitFloor.rotation.x = -Math.PI / 2; pitFloor.position.y = -15.8; pit.add(pitFloor);
  const pitLight = new THREE.PointLight(0xa040ff, 24, 20, 2); pitLight.position.set(0, -2.5, 0); pit.add(pitLight);

  // tepi tanah galian + bercak tanah di sekeliling lubang
  const rim = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + 0.15, 0.3, 8, 44), new THREE.MeshStandardMaterial({ color: 0x6f5232, roughness: 1 }));
  rim.rotation.x = Math.PI / 2; rim.scale.z = 0.6; rim.position.y = 0.05; rim.castShadow = rim.receiveShadow = true; pit.add(rim);
  const dirtRing = new THREE.Mesh(new THREE.RingGeometry(HOLE_R, HOLE_R + 2.6, 48, 1),
    new THREE.MeshStandardMaterial({ map: dTex, roughness: 1, transparent: true, alphaMap: radialAlpha((HOLE_R + 0.7) / (HOLE_R + 2.6)), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  dirtRing.rotation.x = -Math.PI / 2; dirtRing.position.y = 0.02; dirtRing.receiveShadow = true; pit.add(dirtRing);

  // cahaya ungu yang naik dari lubang (agar terlihat dari jauh) + partikel
  const beamH = 11, beamGeo = new THREE.CylinderGeometry(HOLE_R * 0.7, HOLE_R * 0.95, beamH, 32, 8, true); beamGeo.translate(0, beamH / 2, 0);
  { const p = beamGeo.attributes.position, col = new Float32Array(p.count * 3), pc = new THREE.Color(0x9a3cff);
    for (let i = 0; i < p.count; i++) { const f = Math.pow(1 - p.getY(i) / beamH, 2.2); col.set([pc.r * f, pc.g * f, pc.b * f], i * 3); }
    beamGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  pit.add(new THREE.Mesh(beamGeo, beamMat));
  const NP = 70, pPos = new Float32Array(NP * 3), pSpd = new Float32Array(NP);
  const resetP = i => { const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * HOLE_R * 0.85; pPos[i * 3] = Math.cos(a) * r; pPos[i * 3 + 1] = R(-1, 0.5); pPos[i * 3 + 2] = Math.sin(a) * r; pSpd[i] = R(0.8, 2.2); };
  for (let i = 0; i < NP; i++) { resetP(i); pPos[i * 3 + 1] = R(0, 8); }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const motes = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xcb94ff, size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  motes.frustumCulled = false; pit.add(motes);

  // ---------- Batu ----------
  const rockGeo = jitter(prep(new THREE.DodecahedronGeometry(1, 0)), 0.18);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8e, roughness: 0.95, flatShading: true });
  const rocks = [];
  const approach = Math.atan2(4.7, 1.2); // arah jalan masuk ke lubang: bagian ini dibiarkan terbuka
  for (let i = 0; i < 10; i++) { // batu di sekeliling lubang
    const a = approach + 0.9 + (i / 9) * (Math.PI * 2 - 1.8) + R(-0.12, 0.12), d = HOLE_R + R(0.9, 1.5), s = R(0.5, 0.95);
    rocks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, s, col: true });
  }
  for (let i = 0; i < (COARSE ? 28 : 50); i++) { // batu tersebar
    let x, z, t = 0; do { const a = rand() * 6.283, d = R(14, LIMIT); x = Math.cos(a) * d; z = Math.sin(a) * d; } while (blocked(x, z, 1) && ++t < 20);
    rocks.push({ x, z, s: R(0.3, 1.1), col: false });
  }
  for (let i = rocks.length - 1; i >= 0; i--) for (const p of forestWalk) if (Math.hypot(rocks[i].x - p.x, rocks[i].z - p.z) < 2.4) { rocks.splice(i, 1); break; } // batu jangan menutupi jalan hutan
  const rockI = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length); rockI.castShadow = rockI.receiveShadow = true;
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  rocks.forEach((r, i) => {
    dummy.position.set(r.x, r.s * 0.22, r.z); dummy.rotation.set(R(0, 3), R(0, 6), R(0, 3)); dummy.scale.set(r.s * R(1, 1.4), r.s * R(0.6, 0.95), r.s * R(1, 1.4)); dummy.updateMatrix();
    rockI.setMatrixAt(i, dummy.matrix); const g = R(0.75, 1.15); rockI.setColorAt(i, tmpC.setRGB(g, g, g * R(0.95, 1.05)));
    if (r.col || r.s > 0.8) colliders.push({ x: r.x, z: r.z, r: r.s * 0.8 });
  });
  group.add(rockI);

  // ---------- Papan petunjuk ----------
  { const sg = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8), new THREE.MeshStandardMaterial({ color: 0x5b3d22, roughness: 1 })); post.position.y = 0.95; post.castShadow = true;
    const tex = canvasTex(256, (x, s) => {
      x.fillStyle = '#8b6338'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(60,35,15,${Math.random() * 0.25})`; x.fillRect(0, Math.random() * s, s, 1 + Math.random() * 2); }
      x.strokeStyle = '#4a2f18'; x.lineWidth = 10; x.strokeRect(5, 5, s - 10, s - 10);
      x.fillStyle = '#f3e3bd'; x.font = 'bold 54px Georgia'; x.textAlign = 'center'; x.fillText('DUNGEON', s / 2, 112); x.font = 'bold 80px Georgia'; x.fillText('▼', s / 2, 200);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })); board.position.y = 1.65; board.castShadow = true;
    sg.add(post, board); sg.position.set(-0.2, 0, 6.2); sg.rotation.y = Math.atan2(2.6, 1.4); group.add(sg);
    colliders.push({ x: -0.2, z: 6.2, r: 0.25 }); }

  // ---------- Pohon ----------
  const swayMat = (mat, amp, base = 1.2, up = false) => { // goyang ditiup angin (base = tinggi mulai bergoyang; up = normal selalu menghadap atas, untuk rumput)
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = 0.0;
        #ifdef USE_INSTANCING
          ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
        #endif
        float hg = max(position.y - ${base.toFixed(2)}, 0.0);
        transformed.x += sin(uTime * 1.4 + ph + position.y * 0.5) * ${amp.toFixed(3)} * hg;
        transformed.z += cos(uTime * 1.1 + ph) * ${(amp * 0.6).toFixed(3)} * hg;`);
      if (up) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
    };
    mat.customProgramCacheKey = () => 'sway' + amp + base + up;
    return mat;
  };
  const trunkOak = prep(new THREE.CylinderGeometry(0.2, 0.36, 2.8, 7)); trunkOak.translate(0, 1.4, 0);
  const trunkPine = prep(new THREE.CylinderGeometry(0.16, 0.3, 2.4, 6)); trunkPine.translate(0, 1.2, 0);
  const oakLeaf = mergeGeometries([[0, 3.8, 0, 1.9], [1.2, 3.3, 0.5, 1.35], [-1.15, 3.4, -0.55, 1.4], [0.2, 4.8, -0.3, 1.25], [-0.3, 3.1, 1.2, 1.1]]
    .map(([x, y, z, r]) => { const g = prep(new THREE.IcosahedronGeometry(r, 1)); jitter(g, r * 0.22); g.translate(x, y, z); return g; }));
  paint(oakLeaf, 0x2c7a30, 0x86c844, 1.8, 5.8);
  const pineLeaf = mergeGeometries([[1.9, 2.7, 2.7], [1.5, 2.5, 4.2], [1.05, 2.3, 5.6]]
    .map(([r, h, y]) => { const g = prep(new THREE.ConeGeometry(r, h, 8, 1)); jitter(g, 0.12); g.translate(0, y, 0); return g; }));
  paint(pineLeaf, 0x1b5632, 0x469a50, 1.5, 7.0);
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2d, roughness: 1, flatShading: true });
  const leafMat = (amp) => swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), amp);

  const trees = []; // {x, z, s, a, pine, far}
  const tryTree = (x, z, minD, far) => {
    if (blocked(x, z)) return false;
    for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < minD) return false;
    trees.push({ x, z, s: R(0.85, 1.5), a: rand() * 6.283, pine: rand() < 0.42 + (Math.hypot(x, z) > 50 ? 0.2 : 0), far }); return true;
  };
  for (let n = 0, tries = 0; n < (COARSE ? 140 : 210) && tries < 6000; tries++) { // hutan di area jelajah (agak jarang di dekat lubang)
    const a = rand() * 6.283, d = LIMIT * Math.sqrt(R(0.05, 1)); if (d < 14) continue;
    if (tryTree(Math.cos(a) * d, Math.sin(a) * d, 4.6, false)) n++;
  }
  for (let n = 0, tries = 0; n < (COARSE ? 200 : 330) && tries < 9000; tries++) { // tembok hutan di tepi + hutan jauh
    const a = rand() * 6.283, d = R(LIMIT - 4, 108);
    if (tryTree(Math.cos(a) * d, Math.sin(a) * d, 3.0, true)) n++;
  }
  { // pohon "tembok" lama yang kini ada di area hutan dibuang (hutan baru punya pohon sendiri); pohon di jalan hutan juga
    const nearForestRoad = (x, z, pad) => { for (const p of forestWalk) if (Math.hypot(x - p.x, z - p.z) < pad) return true; return false; };
    for (let i = trees.length - 1; i >= 0; i--) { const t = trees[i]; if (nearForestRoad(t.x, t.z, 2.8) || (t.far && Math.hypot(t.x, t.z) > LIMIT - 6 && zoneDist(t.x, t.z) < 14)) trees.splice(i, 1); }
  }
  const mk = (geo, mat, list) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length; m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
  for (const pine of [false, true]) {
    const list = trees.filter(t => t.pine === pine);
    const trunk = mk(pine ? trunkPine : trunkOak, barkMat, list), leaf = mk(pine ? pineLeaf : oakLeaf, leafMat(pine ? 0.02 : 0.03), list);
    list.forEach((t, i) => {
      dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix); leaf.setMatrixAt(i, dummy.matrix);
      leaf.setColorAt(i, tmpC.setRGB(R(0.8, 1.15), R(0.88, 1.12), R(0.75, 1.1)));
      if (!t.far) colliders.push({ x: t.x, z: t.z, r: 0.34 * t.s });
    });
  }

  walkPts.push(...forestWalk); // mulai sekarang rumput & bunga juga menghindari jalan hutan

  // ---------- Rumput ----------
  const grassGeo = (() => {
    const pos = [], col = [], nrm = [], dark = new THREE.Color(0x2a6a1c), lite = new THREE.Color(0x8fd050);
    for (let b = 0; b < 6; b++) {
      const bx = R(-0.28, 0.28), bz = R(-0.28, 0.28), ang = rand() * 6.283, h = R(0.45, 0.95), w = R(0.07, 0.12), lean = R(-0.22, 0.22);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (const [x, y, c] of [[-w, 0, dark], [w, 0, dark], [lean, h, lite]]) {
        pos.push(bx + x * ca, y, bz + x * sa); col.push(c.r, c.g, c.b); nrm.push(0, 1, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    return g;
  })();
  const NG = COARSE ? 2600 : 5200;
  const grass = new THREE.InstancedMesh(grassGeo, swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.14, 0, true), NG);
  grass.receiveShadow = true; grass.frustumCulled = false;
  let gN = 0;
  for (let n = 0, tries = 0; n < NG && tries < NG * 4; tries++) {
    const a = rand() * 6.283, d = LIMIT * 1.04 * Math.sqrt(rand()), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x, z) < HOLE_R + 1.2 || nearPath(x, z, 1.2) || villageClearAt(x, z)) continue; // jalan, tepi lubang & area bangunan desa tetap bersih
    dummy.position.set(x, 0, z); dummy.rotation.set(0, rand() * 6.283, 0); dummy.scale.set(R(0.8, 1.7), R(0.7, 1.5), R(0.8, 1.7)); dummy.updateMatrix();
    grass.setMatrixAt(n, dummy.matrix); grass.setColorAt(n, tmpC.setRGB(R(0.75, 1.1), R(0.85, 1.12), R(0.7, 1.0))); n++; gN = n;
  }
  grass.count = gN; group.add(grass);

  // ---------- Bunga ----------
  const NF = COARSE ? 180 : 380, flowerCols = [0xffffff, 0xffd93b, 0xff7aa8, 0xb48cff, 0xff6b4a];
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.018, 0.4, 4).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ color: 0x3f8a2a, roughness: 1 }), NF);
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0).translate(0, 0.42, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), NF);
  let fN = 0;
  for (let n = 0, tries = 0; n < NF && tries < NF * 6; tries++) {
    const a = rand() * 6.283, d = LIMIT * 0.95 * Math.sqrt(rand()), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x, z) < HOLE_R + 2.2 || nearPath(x, z, 1.4) || villageClearAt(x, z, 0.5)) continue;
    dummy.position.set(x, 0, z); dummy.rotation.set(R(-0.15, 0.15), 0, R(-0.15, 0.15)); dummy.scale.setScalar(R(0.8, 1.4)); dummy.updateMatrix();
    stems.setMatrixAt(n, dummy.matrix); heads.setMatrixAt(n, dummy.matrix); heads.setColorAt(n, tmpC.setHex(flowerCols[(rand() * flowerCols.length) | 0])); n++; fN = n;
  }
  stems.count = heads.count = fN; stems.receiveShadow = true; heads.castShadow = false; stems.frustumCulled = heads.frustumCulled = false;
  group.add(stems, heads);

  // ---------- Hutan Besar (di sebelah timur desa) ----------
  const forest = buildForest({
    colliders, rand: mulberry32(8112026), existing: trees, roadPts: forestWalk, COARSE, LIMIT, jitter, prep,
    geo: { trunkOak, trunkPine, oakLeaf, pineLeaf, grassGeo },
    mat: { barkMat, leafMat, swayMat },
    tex: { radialAlpha, canvasTex, dirt: dTex },
  });
  group.add(forest.group);

  // ---------- Kota Arunika (di timur Gerbang Batu Kuno): bangunan saja ----------
  const city = buildCity({ colliders, COARSE }); group.add(city.group);
  const church = buildChurch({ colliders }); group.add(church.group);   // interior katedral (tersembunyi sampai pemain masuk lewat pintu)

  // dekal tanah transparan (jalan, bercak rumput, lantai kota): digambar paling awal agar tidak menimpa efek skill transparan
  group.traverse(o => { const m = o.material; if (m && !Array.isArray(m) && m.transparent && m.depthWrite === false && m.polygonOffset && m.blending === THREE.NormalBlending) o.renderOrder = Math.min(o.renderOrder, -5); });

  // ---------- Bukit jauh (tertutup kabut, memberi kedalaman) ----------
  const hillGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x5d9c4c, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const h = new THREE.Mesh(hillGeo, hillMat), a = (i / 16) * 6.283 + R(-0.15, 0.15), d = R(125, 155), s = R(24, 40);
    h.scale.set(s * R(1, 1.6), R(10, 22), s); h.position.set(Math.cos(a) * d, -1, Math.sin(a) * d); h.rotation.y = rand() * 6;
    if (zoneDist(h.position.x, h.position.z) > 45) group.add(h); // bukit yang menimpa area hutan dilewati
  }

  // ---------- API ----------
  return {
    group,
    village: VILLAGE,
    collide(pos, r) { // dorong pemain keluar dari pohon / batu / papan
      for (const c of colliders) {
        const dx = pos.x - c.x, dz = pos.z - c.z, min = r + c.r, l2 = dx * dx + dz * dz;
        if (l2 >= min * min) continue;
        const l = Math.sqrt(l2) || 1e-4; pos.x = c.x + dx / l * min; pos.z = c.z + dz / l * min;
      }
    },
    clamp: pos => clampToWorld(pos, LIMIT),          // batas dunia: dataran lama + desa + Hutan Besar
    forestAmount,                                    // 0..1 seberapa dalam pemain di hutan (dipakai kabut di game.js)
    forest: FOREST,
    church,                                          // church.show(true/false): tampilkan interior katedral
    talk: () => npcs.talk(), canTalk: () => npcs.canTalk(), talkName: () => npcs.talkName(),
    update(dt, t, pp, cp) {
      uTime.value = t;
      village.update(t); npcs.update(dt, t, pp); forest.update(t);
      const fa = forestAmount(pp.x, pp.z); // di dalam hutan: cahaya sedikit lebih redup (teduh di bawah tajuk)
      hemi.intensity = 1.15 - 0.3 * fa; sun.intensity = 3.3 - 0.9 * fa;
      sun.position.set(pp.x + SUN_OFF.x, SUN_OFF.y, pp.z + SUN_OFF.z); sun.target.position.set(pp.x, 0, pp.z);
      sky.position.copy(cp); clouds.position.set(cp.x, 0, cp.z);
      for (const c of clouds.children) { c.position.x += dt * c.userData.sp; if (c.position.x > 260) c.position.x = -260; }
      pitLight.intensity = 24 + Math.sin(t * 3.1) * 4 + Math.sin(t * 7.3) * 2;
      beamMat.opacity = 0.5 + Math.sin(t * 1.7) * 0.08;
      for (let i = 0; i < NP; i++) { pPos[i * 3 + 1] += pSpd[i] * dt; pPos[i * 3] += Math.sin(t + i) * 0.2 * dt; if (pPos[i * 3 + 1] > 9) resetP(i); }
      pGeo.attributes.position.needsUpdate = true;
    }
  };
}
