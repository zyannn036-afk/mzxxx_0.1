import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createWorld, HOLE_R, LIMIT, SPAWN, SKY_COLOR, FOG_DENSITY } from './world.js';
import { VILLAGE } from './village-layout.js';
import { FOREST, ANCIENT_GATE, CAMP_FIRE, POND, SECRET_GLADE, SECRET_QUEST } from './forest-layout.js';
import { CITY, CHURCH, cityDist } from './city-layout.js';
import { buildSlime, buildGoblin, slimePose, goblinPose, makeBar } from './mobs.js';
import { audio } from './audio.js';

const $ = id => document.getElementById(id);
const R = 18; // radius arena
const rnd = (a, b) => a + Math.random() * (b - a);
const COARSE = matchMedia('(pointer:coarse)').matches; // true di HP/tablet

// ---------- Renderer, scene, kamera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.5 : 2)); // HP: lebih ringan
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060a);
scene.fog = new THREE.FogExp2(0x07060a, 0.03);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 700);
cam.position.set(0, 12, 12);
addEventListener('resize', () => {
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Cahaya ----------
const arenaG = new THREE.Group(); scene.add(arenaG); // semua isi dungeon/arena (disembunyikan saat di dunia luar)
arenaG.add(new THREE.HemisphereLight(0x6070a0, 0x201018, 0.5));
const moon = new THREE.DirectionalLight(0x9db4ff, 1.2);
moon.position.set(8, 20, 6); moon.castShadow = true;
moon.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 50 });
arenaG.add(moon);

// ---------- Arena ----------
function stoneTex(rep) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#4a4750'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4500; i++) {
    const g = 60 + Math.random() * 45 | 0;
    x.fillStyle = `rgba(${g},${g},${g + 8},.35)`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  x.strokeStyle = '#15131a'; x.lineWidth = 5;
  for (let i = 0; i <= 512; i += 128) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 64),
  new THREE.MeshStandardMaterial({ map: stoneTex(8), roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; arenaG.add(floor);

for (const [a, b, c] of [[4.6, 4.8, 0.9], [9.4, 9.55, 0.5]]) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(a, b, 64),
    new THREE.MeshStandardMaterial({ color: 0x220a33, emissive: 0x9a35e0, emissiveIntensity: c, roughness: 1 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; arenaG.add(ring);
}
const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 1, R + 1, 8, 48, 1, true),
  new THREE.MeshStandardMaterial({ map: stoneTex(10), roughness: 0.9, side: THREE.BackSide }));
wall.position.y = 4; wall.receiveShadow = true; arenaG.add(wall);

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5560, roughness: 0.8 });
for (let i = 0; i < 12; i++) {
  const a = i / 12 * Math.PI * 2;
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 8, 10), stoneMat);
  p.position.set(Math.cos(a) * (R - 0.3), 4, Math.sin(a) * (R - 0.3));
  p.castShadow = p.receiveShadow = true; arenaG.add(p);
}
const torches = [];
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
for (let i = 0; i < 12; i++) {
  const a = (i + 0.5) / 12 * Math.PI * 2;
  const x = Math.cos(a) * (R - 0.9), z = Math.sin(a) * (R - 0.9);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 }));
  stand.position.set(x, 1.1, z); stand.castShadow = true; arenaG.add(stand);
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), flameMat);
  fl.position.set(x, 2.5, z); arenaG.add(fl);
  const L = new THREE.PointLight(0xff7a2a, 30, 16, 2);
  L.position.set(x, 2.8, z); arenaG.add(L);
  torches.push({ L, fl, o: Math.random() * 10 });
}

// ---------- Dunia luar (dataran hijau) ----------
const world = createWorld({ COARSE });
world.group.visible = false; scene.add(world.group);
const arenaFog = scene.fog, worldFog = new THREE.FogExp2(SKY_COLOR, FOG_DENSITY);

// ---------- Efek ----------
const fx = [];
const sparkGeo = new THREE.SphereGeometry(0.07, 6, 6);
function burst(pos, color, n = 10, speed = 5) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos);
    fx.push({ m, v: new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).multiplyScalar(speed), life: 0.6 });
    scene.add(m);
  }
}

// ---------- Player ----------
const player = new THREE.Group(); scene.add(player);
const P = { hp: 100, max: 100, atk: 0, dur: 0.45, cross: false, combo: 0, comboT: 0, hand: -1, hit: false, jy: 0, fx2: false, fx3: false, set: null, roll: 0, inv: 0, sh: 0, drawT: 0, runT: 0, heavy: 0.3, vs: 0, sl: 0, sm: 0, drawn: false, face: 0, rv: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(), ph: 0, t: 0 };
let bones = null, vrm = null;

const slashGeo = (() => { // busur ungu: ekor tipis & redup -> kepala tebal & terang (putih keunguan)
  const N = 32, span = 2.4, th0 = -Math.PI / 2 - 1.2, rc = 2.05, W = 0.45, pos = [], col = [], idx = [];
  const c1 = new THREE.Color(0x8a2dff), c2 = new THREE.Color(0xf3e6ff);
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = th0 + span * t, w = W * Math.pow(t, 1.3) + 0.02, br = Math.pow(t, 1.3);
    for (const [o, m] of [[-1, 0], [0, 1], [1, 0]]) {
      const r = rc + o * w; pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      const c = c1.clone().lerp(c2, m * t).multiplyScalar(br * (m ? 1 : 0.75)); col.push(c.r, c.g, c.b);
    }
    if (i < N) { const k = i * 3; idx.push(k, k + 1, k + 3, k + 1, k + 4, k + 3, k + 1, k + 2, k + 4, k + 2, k + 5, k + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
})();
const slash = new THREE.Mesh(slashGeo,
  new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
slash.rotation.x = -Math.PI / 2; slash.position.y = 1.05; player.add(slash);

// efek tebasan silang (X) di depan pemain
const fxMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const xMat = fxMat(0xa23cff), xCore = fxMat(0xf3e6ff); // tebasan silang ungu + inti putih
const xSlash = new THREE.Group();
for (const a of [Math.PI / 4, -Math.PI / 4]) {
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.3), xMat), core = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.08), xCore);
  bar.rotation.z = core.rotation.z = a; core.position.z = 0.01; xSlash.add(bar, core);
}
xSlash.position.set(0, 1.15, 1.7); player.add(xSlash);

// bulan sabit besar (tahap 3): ujung runcing, melengkung ke depan
const cresMat = fxMat(0x9a3dff), cresCore = fxMat(0xf3e6ff);
const cresGeo = (() => {
  const R = 3, a = 1.05, d = 1.7, x = R * Math.cos(a), y = R * Math.sin(a), r2 = Math.hypot(x + d, y), b = Math.atan2(y, x + d);
  const sh = new THREE.Shape(); sh.absarc(0, 0, R, -a, a, false); sh.absarc(-d, 0, r2, b, -b, true);
  return new THREE.ShapeGeometry(sh, 32);
})();
const cres = new THREE.Group();
const cresA = new THREE.Mesh(cresGeo, cresMat), cresB = new THREE.Mesh(cresGeo, cresCore);
cresA.rotation.y = cresB.rotation.y = -Math.PI / 2; cresB.scale.set(0.97, 0.88, 1); cresB.position.y = 0;
cres.add(cresA, cresB); cres.position.set(0, 1.2, 0.6); cres.rotation.z = 0.25; player.add(cres);

// garis kecepatan ungu di belakang pemain saat menerjang
const speedMat = fxMat(0xc27bff), speedLines = [];
for (let i = 0; i < 16; i++) {
  const L = 2.5 + Math.random() * 3, m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, L), speedMat);
  m.userData = { o: Math.random() * 6, L }; m.position.set((Math.random() - 0.5) * 3, 0.2 + Math.random() * 2, -2);
  player.add(m); speedLines.push(m);
}

function makeSword() {
  const s = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8d4e0, metalness: 1, roughness: 0.25 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.02), steel); blade.position.x = -0.62;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.07), new THREE.MeshStandardMaterial({ color: 0xb8902a, metalness: 1, roughness: 0.35 })); guard.position.x = -0.14;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.045), new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.7 })); grip.position.x = -0.065;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), guard.material); pom.position.x = 0.02;
  blade.castShadow = true; s.add(blade, guard, grip, pom); return s;
}

function buildFallback() { // jika louiss.vrm gagal dimuat
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 6, 12), m); body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), new THREE.MeshStandardMaterial({ color: 0xf0c8a0 })); head.position.y = 1.75;
  body.castShadow = head.castShadow = true; g.add(body, head); player.add(g);
}

new GLTFLoader().register(p => new VRMLoaderPlugin(p)).load('louiss.vrm', gltf => {
  vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm); // model VRM 0.x dihadapkan ke +Z
  vrm.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  player.add(vrm.scene);
  const h = vrm.humanoid, b = n => h.getNormalizedBoneNode(n);
  bones = { hips: b('hips'), spine: b('spine'), chest: b('chest'), head: b('head'),
    lUA: b('leftUpperArm'), rUA: b('rightUpperArm'), lLA: b('leftLowerArm'), rLA: b('rightLowerArm'),
    lUL: b('leftUpperLeg'), rUL: b('rightUpperLeg'), lLL: b('leftLowerLeg'), rLL: b('rightLowerLeg'),
    lH: b('leftHand'), rH: b('rightHand') };
  if (bones.rH && bones.hips) rigs.push(mkRig(bones.rH, bones.hips, 1));
  if (bones.lH && bones.hips) rigs.push(mkRig(bones.lH, bones.hips, -1)); // pedang kedua (cermin) di tangan kiri
  enterWorld();
}, undefined, err => { console.warn('Gagal memuat louiss.vrm, pakai karakter cadangan:', err); buildFallback(); enterWorld(); });

// ---------- Pedang: sarung di pinggang <-> tangan ----------
const DRAW_HOLD = 3;     // detik pedang tetap terhunus setelah serangan terakhir, lalu kembali ke posisi semula
const RUN_SHEATH = 0.35; // detik berlari terus-menerus sebelum pedang otomatis disarungkan
const rigs = [], QI = new THREE.Quaternion();
function mkRig(hand, hips, side) { // side: 1 = kanan, -1 = kiri
  const holder = new THREE.Group(), sw = makeSword(); if (side < 0) sw.scale.x = -1; holder.add(sw);
  const anchor = new THREE.Group(); // titik sarung di pinggang, miring ke belakang-bawah
  anchor.position.set(-side * 0.2, -0.02, -0.1);
  anchor.quaternion.setFromUnitVectors(new THREE.Vector3(-side, 0, 0), new THREE.Vector3(-side * 0.3, -0.65, -0.7).normalize());
  const sh = new THREE.Group(); sh.scale.x = side;
  const dark = new THREE.MeshStandardMaterial({ color: 0x14141c, metalness: 0.3, roughness: 0.55 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb8902a, metalness: 1, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.09, 0.055), dark); body.position.x = -0.65;
  const throat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.105, 0.07), gold); throat.position.x = -0.17;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), gold); tip.position.x = -1.15;
  sh.add(body, throat, tip); anchor.add(sh); hips.add(anchor); anchor.add(holder);
  return { side, holder, hand, anchor, tr: 1, p0: new THREE.Vector3(), q0: new THREE.Quaternion() };
}
function setDrawn(on) {
  if (P.drawn === on) return; P.drawn = on;
  for (const r of rigs) {
    (on ? r.hand : r.anchor).attach(r.holder); // pindah induk tanpa loncat, lalu meluncur ke posisi tujuan
    r.p0.copy(r.holder.position); r.q0.copy(r.holder.quaternion); r.tr = 0;
    burst(r.holder.getWorldPosition(new THREE.Vector3()), 0xdfe8ff, 5, 3);
  }
}
function updateSwords(dt) {
  for (const r of rigs) if (r.tr < 1) {
    r.tr = Math.min(1, r.tr + dt / 0.13); const e = 1 - Math.pow(1 - r.tr, 2);
    r.holder.position.copy(r.p0).multiplyScalar(1 - e); r.holder.quaternion.copy(r.q0).slerp(QI, e);
  }
}

const ATK_T = 0.45, ZERO = new THREE.Vector3();
const CX = { t1: 0.40, t2: 0.28, t3: 0.42, t4: 0.20 }; CX.total = CX.t1 + CX.t2 + CX.t3 + CX.t4; // 4 tahap serangan ke-4
const clamp01 = x => Math.min(1, Math.max(0, x));
function pose(b, x, y, z, k) { // geser rotasi tulang pelan-pelan ke target (anti patah)
  if (!b) return;
  const r = b.rotation; r.x += (x - r.x) * k; r.y += (y - r.y) * k; r.z += (z - r.z) * k;
}
function poseAndAnimate(dt, spd) { // spd: 0..1 kecepatan gerak
  P.t += dt;
  if (P.vs > 0) { vsPose(dt); return; } // skill 1 mengatur pose sendiri
  if (P.sl > 0) { slPose(dt); return; } // skill 2 mengatur pose sendiri
  if (P.sm > 0) { smPose(dt); return; } // skill 3 mengatur pose sendiri
  const p = P.atk > 0 ? 1 - P.atk / P.dur : 0;
  const q = clamp01((p - 0.2) / 0.4), e = 1 - Math.pow(1 - q, 3); // sapuan: cepat di awal, melambat di akhir
  const ret = clamp01((p - 0.75) / 0.25); // fase 4: kembali ke posisi awal
  const phi = -0.6 + 3.3 * e; // sudut lengan: dari samping kanan karakter -> menyilang ke kiri (kiri ke kanan di layar)
  const h = P.hand; // 1 = tebasan tangan kanan, -1 = tangan kiri (bergantian tiap serangan)
  slash.rotation.z = h * (phi - Math.PI / 2 - 1.2); // ujung terang slash mengikuti ujung pedang
  slash.scale.x = h; // tebasan kiri = cermin dari kanan
  slash.material.opacity = P.atk > 0 && !P.cross ? Math.sin(clamp01((p - 0.16) / 0.52) * Math.PI) * 0.95 : 0;
  // serangan ke-4, 3 tahap: (1) tebasan silang  (2) lompat mundur  (3) lompat menerjang + tebasan silang
  const el = P.atk > 0 && P.cross ? P.dur - P.atk : -1, s1 = CX.t1, s2 = s1 + CX.t2, s3 = s2 + CX.t3;
  let xo = 0, ca = 0; P.jy = 0;
  if (el >= 0) {
    if (el < s1) {
      xo = Math.sin(clamp01((el - 0.1) / 0.26) * Math.PI);
      xSlash.position.z = 1.7; xSlash.scale.setScalar(0.7 + 0.5 * clamp01((el - 0.1) / 0.2));
    } else if (el >= s2) {
      xo = Math.sin(clamp01((el - s2 - 0.1) / 0.32) * Math.PI);
      xSlash.position.z = 2.5; xSlash.scale.setScalar(1.0 + 0.5 * clamp01((el - s2 - 0.1) / 0.25));
      ca = Math.sin(clamp01((el - s2) / (CX.t3 + 0.12)) * Math.PI);
      cres.scale.setScalar(0.7 + 0.6 * clamp01((el - s2) / 0.3));
    }
    if (el >= s1 && el < s2) P.jy = 0.8 * Math.sin(Math.PI * (el - s1) / CX.t2); // lompat mundur
    else if (el >= s2 && el < s3) P.jy = 0.1 + 0.9 * Math.sin(Math.PI * (el - s2) / CX.t3); // lompat menerjang
  }
  xMat.opacity = xo * 0.9; xCore.opacity = xo;
  cresMat.opacity = ca * 0.85; cresCore.opacity = ca; speedMat.opacity = ca * 0.8;
  for (const m of speedLines) m.position.z = -1 - m.userData.L / 2 - ((P.t * 28 + m.userData.o) % 5);
  if (!bones) return;
  const b = bones, k = 1 - Math.exp(-dt * 14), kf = 1 - Math.exp(-dt * 30), kg = 1 - Math.exp(-dt * 26);
  P.ph += dt * (3 + spd * 6.5); // jogging: ~2.5 langkah/detik pada kecepatan penuh
  const sw = Math.sin(P.ph), co = Math.cos(P.ph), br = Math.sin(P.t * 2) * 0.02;
  const bob = P.atk > 0 || P.roll > 0 ? 0 : Math.abs(sw) * 0.07 * spd; // badan naik-turun tiap langkah
  const crouch = P.atk > 0 || P.roll > 0 ? 0 : 0.07 * (1 - spd); // badan turun sedikit saat kuda-kuda lebar
  if (vrm) vrm.scene.position.y += (bob + P.jy - crouch - vrm.scene.position.y) * kg;
  let headT = 0;
  if (P.atk > 0 && P.cross) { // serangan ke-4: 3 tahap
    const kb = 1 - Math.exp(-dt * 24);
    const sweep = q => { const ee = 1 - Math.pow(1 - clamp01(q), 3); return [0.1 + 2.2 * ee, -0.7 + 1.4 * ee, ee]; }; // [px, zx, e]
    const arms = (px, zx) => { pose(b.rUA, 0, px, zx, kf); pose(b.lUA, 0, -px, zx, kf); pose(b.rLA, 0, 0, 0, k); pose(b.lLA, 0, 0, 0, k); };
    if (el < s1) { // 1. tebasan silang: kedua pedang menyapu serentak dan bersilang (X), kuda-kuda rendah
      const [px, zx, ee] = sweep((el - 0.04) / 0.3); arms(px, zx);
      pose(b.spine, 0.25 + 0.2 * ee, 0, 0, kb); pose(b.chest, 0, 0, 0, k); pose(b.hips, 0.1, 0, 0, kb);
      pose(b.lUL, -0.6, 0, 0, kb); pose(b.rUL, 0.6, 0, 0, kb); pose(b.lLL, 0.7, 0, 0, kb); pose(b.rLL, 0.3, 0, 0, kb);
    } else if (el < s2) { // 2. lompat mundur: badan condong ke belakang, pedang terseret ke belakang, kaki ditekuk
      pose(b.rUA, 0.1, -0.9, 0.5, kf); pose(b.lUA, 0.1, 0.9, -0.5, kf); pose(b.rLA, 0, 0, 0, k); pose(b.lLA, 0, 0, 0, k);
      pose(b.spine, -0.25, 0, 0, kb); pose(b.chest, -0.1, 0, 0, kb); pose(b.hips, -0.1, 0, 0, kb);
      pose(b.lUL, -0.7, 0, 0, kb); pose(b.rUL, -0.4, 0, 0, kb); pose(b.lLL, 1.1, 0, 0, kb); pose(b.rLL, 1.3, 0, 0, kb);
    } else if (el < s3) { // 3. lompat menerjang: badan menunduk ke depan, kaki terseret, tebasan silang
      const [px, zx] = sweep((el - s2 - 0.05) / 0.25); arms(px, zx);
      pose(b.hips, 0.85, 0, 0, kb); pose(b.spine, 0.25, 0, 0, kb); pose(b.chest, 0.1, 0, 0, kb); headT = -0.55;
      pose(b.lUL, 0.3, 0, 0, kb); pose(b.rUL, 0.1, 0, 0, kb); pose(b.lLL, 0.9, 0, 0, kb); pose(b.rLL, 1.2, 0, 0, kb);
    } else { // 4. mendarat jongkok
      arms(2.3, 0.7);
      pose(b.hips, 0.2, 0, 0, kb); pose(b.spine, 0.2, 0, 0, kb); pose(b.chest, 0, 0, 0, kb);
      pose(b.lUL, -0.5, 0, 0, kb); pose(b.rUL, 0.4, 0, 0, kb); pose(b.lLL, 0.8, 0, 0, kb); pose(b.rLL, 0.6, 0, 0, kb);
    }
  } else if (P.atk > 0) {
    // 4 fase: (1) siap, pedang di sisi -> (2) ayunan dari belakang ke depan -> (3) follow through -> (4) kembali ke posisi awal
    const wd = 1 - ret, tw = (-0.55 + 1.15 * e) * h * wd; // badan memutar mengikuti tebasan
    const atkA = h > 0 ? b.rUA : b.lUA, offA = h > 0 ? b.lUA : b.rUA;
    pose(atkA, 0, h * phi * wd, h * 1.1 * ret, kf); pose(h > 0 ? b.rLA : b.lLA, 0, h * 0.9 * ret, 0, k);
    pose(offA, 0.3 - 0.15 * ret, 0, -h * (0.9 + 0.2 * ret), k); pose(h > 0 ? b.lLA : b.rLA, 0, h * (0.5 * wd - 0.9 * ret), 0, k);
    pose(b.spine, 0.18 * e * wd, tw * 0.6, 0, k); pose(b.chest, 0, tw * 0.4, 0, k); pose(b.hips, 0.05 * wd, -tw * 0.3, 0, k);
    // kuda-kuda lebar (lunge): kaki depan menekuk, kaki belakang lurus; kembali melebar ringan saat siap
    const fl = h > 0 ? b.lUL : b.rUL, bl = h > 0 ? b.rUL : b.lUL, fk = h > 0 ? b.lLL : b.rLL, bk = h > 0 ? b.rLL : b.lLL;
    pose(fl, -0.45 * wd, 0, h * 0.25 * wd + h * 0.12 * ret, k); pose(bl, 0.45 * wd, 0, -h * 0.25 * wd - h * 0.12 * ret, k);
    pose(fk, 0.7 * wd + 0.12 * ret, 0, 0, k); pose(bk, 0.15 * wd + 0.12 * ret, 0, 0, k);
  } else if (P.roll > 0) {
    pose(b.rUA, 0, 0, 1.0, k); pose(b.lUA, 0, 0, -1.0, k); pose(b.rLA, 0, 0, 0, k); pose(b.lLA, 0, 0, 0, k);
    pose(b.spine, 0.9, 0, 0, k); pose(b.chest, 0, 0, 0, k); pose(b.hips, 0, 0, 0, k);
    pose(b.lUL, 0, 0, 0, k); pose(b.rUL, 0, 0, 0, k); pose(b.lLL, 0.8, 0, 0, k); pose(b.rLL, 0.8, 0, 0, k);
  } else {
    const A = spd, ws = 1 - A, dr = P.drawn ? 1 : 0, hv = P.heavy; // A: amplitudo lari 0..1, ws: bobot diam
    // napas terengah-engah: makin cepat & dalam setelah menyerang, lalu mereda
    const ps = 0.5 + 0.9 * hv, inh = Math.pow(0.5 + 0.5 * Math.sin(P.t * (1.7 + 1.1 * hv) * 6.283), 1.4), pw = ws * ps;
    // kaki: diam = kuda-kuda lebar, lutut menekuk; lari = ayunan seperti biasa
    pose(b.lUL, -sw * 0.85 * A - 0.22 * ws, 0, 0.30 * ws, kg); pose(b.rUL, sw * 0.85 * A - 0.22 * ws, 0, -0.30 * ws, kg);
    pose(b.lLL, (0.15 + Math.max(0, co) * 1.2) * A + 0.5 * ws, 0, 0, kg); pose(b.rLL, (0.15 + Math.max(0, -co) * 1.2) * A + 0.5 * ws, 0, 0, kg);
    // tangan: lari = siku ~90 derajat mengayun; diam = lengan turun di sisi (pedang terhunus: miring ke bawah-luar seperti sheet)
    const zA = 1.1 * A + (1.25 - 0.25 * dr) * ws - 0.06 * pw * inh; // dada mengembang -> lengan sedikit terangkat
    const elb = A * (0.9 + 0.5 * A) + ws * (0.25 + 0.2 * dr), ux = 0.15 * A + (0.1 + 0.08 * dr) * ws;
    pose(b.lUA, sw * 0.7 * A + ux, 0, -zA, kg); pose(b.rUA, -sw * 0.7 * A + ux, 0, zA, kg);
    pose(b.lLA, 0, -elb, 0, kg); pose(b.rLA, 0, elb, 0, kg);
    // badan: condong ke depan, naik-turun karena napas, goyang pelan saat lelah
    pose(b.hips, 0, sw * 0.14 * A + ws * 0.05 * hv * Math.sin(P.t * 1.4), ws * 0.035 * hv * Math.sin(P.t * 0.95 + 1), kg);
    pose(b.spine, 0.04 + A * 0.14 + ws * (0.2 + 0.05 * dr - 0.07 * ps * inh), -sw * 0.08 * A, ws * 0.03 * hv * Math.sin(P.t * 0.95 + 2.2), kg);
    pose(b.chest, ws * (0.05 - 0.08 * ps * inh), -sw * 0.12 * A, 0, kg);
    headT = ws * (-0.05 + 0.1 * ps * (1 - inh)); // kepala sedikit tertunduk saat menghembuskan napas
  }
  pose(b.head, headT, 0, 0, k); // kepala menengadah saat menerjang, kembali normal setelahnya
}

// ---------- Musuh ----------
const enemies = [], orbs = [], rings = [];
const blasts = []; // bola api raksasa + ledakan hantaman naga
let laser = null; // laser napas naga yang sedang aktif (null = tidak ada)
function mkEnemy(boss) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: boss ? 0x2a1040 : 0x7a1f2b, roughness: 0.55, emissive: 0x000000 });
  const glow = new THREE.MeshBasicMaterial({ color: boss ? 0xff3cf0 : 0xffe14a });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (boss) {
    add(new THREE.ConeGeometry(1.0, 2.7, 16), mat, 0, 1.35, 0);
    add(new THREE.SphereGeometry(0.42, 16, 16), new THREE.MeshStandardMaterial({ color: 0xcfc0d8, roughness: 0.4 }), 0, 2.95, 0);
    add(new THREE.SphereGeometry(0.08, 8, 8), glow, -0.15, 3.0, 0.36); add(new THREE.SphereGeometry(0.08, 8, 8), glow, 0.15, 3.0, 0.36);
    add(new THREE.ConeGeometry(0.13, 0.7, 6), mat, -0.3, 3.45, 0); add(new THREE.ConeGeometry(0.13, 0.7, 6), mat, 0.3, 3.45, 0);
    add(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }), 0.9, 1.6, 0.5);
    add(new THREE.IcosahedronGeometry(0.24, 1), glow, 0.9, 3.3, 0.5);
    const lt = new THREE.PointLight(0xc030e0, 15, 10, 2); lt.position.set(0.9, 3.3, 0.5); g.add(lt); // (position bersifat read-only di three.js, jadi tidak boleh lewat Object.assign)
  } else {
    add(new THREE.IcosahedronGeometry(0.75, 1), mat, 0, 0.95, 0).scale.set(1, 1.2, 1);
    add(new THREE.SphereGeometry(0.09, 8, 8), glow, -0.25, 1.35, 0.62); add(new THREE.SphereGeometry(0.09, 8, 8), glow, 0.25, 1.35, 0.62);
    add(new THREE.ConeGeometry(0.12, 0.5, 6), mat, -0.4, 1.95, 0); add(new THREE.ConeGeometry(0.12, 0.5, 6), mat, 0.4, 1.95, 0);
    add(new THREE.ConeGeometry(0.1, 0.55, 6), mat, -0.8, 0.9, 0.3).rotation.z = 1.2; add(new THREE.ConeGeometry(0.1, 0.55, 6), mat, 0.8, 0.9, 0.3).rotation.z = -1.2;
  }
  const a = camMode === 'depan' ? rnd(-Math.PI * 0.9, -Math.PI * 0.1) : rnd(0, Math.PI * 2); // mode depan: musuh muncul di depan kamera
  g.position.set(Math.cos(a) * (R - 3), 0, Math.sin(a) * (R - 3));
  scene.add(g);
  const e = { g, mat, boss, hp: boss ? 260 : 50, max: boss ? 260 : 50, sp: boss ? 2.4 : 3.2, r: boss ? 1.3 : 0.9, cd: 1, wind: 0, flash: 0, kv: new THREE.Vector3(), stun: 0, orb: 2.5, slam: 6 };
  enemies.push(e); return e;
}

function hurtPlayer(n) {
  if (P.inv > 0 || (state !== 'play' && state !== 'world')) return; // di dungeon & di dunia luar (monster hutan)
  if (BF.on) { BF.hp -= n; BF.flash = 1; P.inv = 0.35; lineSparks(player.position.clone().setY(1.3), 10, 7); if (BF.hp <= 0) breakBF('Aura pelindung hancur!'); return; } // perisai menyerap serangan
  P.hp = Math.max(0, P.hp - n); P.inv = 0.6;
  $('vig').classList.add('on'); setTimeout(() => $('vig').classList.remove('on'), 80);
  shake = 0.4;
  burst(player.position.clone().setY(1.2), 0xff3030, 8);
  if (P.hp <= 0) end(false);
}
// ---------- Slow motion: pukulan terakhir ke musuh terakhir ----------
const SLOW_TOTAL = 1.8, SLOW_SCALE = 0.15, SLOW_DEATH = 0.7; // lama (detik nyata), kecepatan game saat slowmo (0.15 = 15%), kapan musuh mati (70% dari durasi)
const slow = { t: 0 }; // sisa waktu slowmo (detik nyata)
function startKillCam(e) {
  e.dying = true; e.hp = 1; e.stun = 0; e.wind = 0; e.kv.set(0, 0, 0); e.g.scale.setScalar(1);
  slow.t = SLOW_TOTAL; P.inv = 5; // pemain kebal selama adegan
  [...orbs, ...rings].forEach(o => scene.remove(o.m)); orbs.length = 0; rings.length = 0; stopLaser(); clearBlasts(); // bersihkan serangan boss
  burst(e.g.position.clone().setY(1.3), 0xffffff, 30, 8); shake = 0.6;
}
function dyingTick(e) { // musuh bergetar & bersinar sebelum hancur
  const p = 1 - slow.t / SLOW_TOTAL;
  e.mat.emissive.setHex(Math.sin(p * 70) > 0 ? 0xffffff : 0x802010);
  e.g.scale.setScalar(1 + Math.sin(p * 110) * 0.05 * (1 + p));
  if (Math.random() < 0.3) burst(e.g.position.clone().setY(rnd(0.5, e.dragon ? 7 : 2.2)), 0xffd060, 4, 3);
  if (p >= SLOW_DEATH) { // hancur
    burst(e.g.position.clone().setY(e.dragon ? 3 : 1), 0xffffff, 45, 10); burst(e.g.position.clone().setY(e.dragon ? 4 : 1.5), e.dragon ? 0xff8a40 : 0xff60f0, 25, 7);
    scene.remove(e.g); enemies.splice(enemies.indexOf(e), 1); shake = 0.9;
  }
}
function hurtEnemy(e, n, dir, force = 0) { // dir: arah dorong (ternormalisasi), force: kecepatan awal knockback
  if (e.dying) return; // sedang adegan slowmo
  e.hp -= n; e.flash = 0.12; if (e.wild) e.aggro = true; // monster hutan yang dipukul langsung marah
  if (dir && force) { e.kv.set(dir.x, 0, dir.z).multiplyScalar(force * (e.dragon ? 0.1 : e.boss ? 0.3 : 1)); e.stun = e.dragon ? 0 : e.boss ? 0.15 : 0.35; e.wind = 0; e.g.scale.setScalar(1); }
  burst(e.g.position.clone().setY(e.dragon ? 3 : 1.3), e.wild ? e.col : e.dragon ? 0xff8a40 : e.boss ? 0xff60f0 : 0xffd060, 10);
  if (e.hp <= 0 && !e.wild && enemies.length === 1 && wave === WAVES.length - 1) { startKillCam(e); return; } // musuh terakhir: slowmo dulu
  if (e.hp <= 0) {
    burst(e.g.position.clone().setY(1), 0xffffff, 24, 7);
    if (e.wild) { burst(e.g.position.clone().setY(0.8), e.col, 22, 6); removeWild(e); return; }
    scene.remove(e.g); enemies.splice(enemies.indexOf(e), 1);
  }
}

// Tabrakan pemain-monster: pemain tidak bisa menembus monster. Kalau tumpang tindih, pemain didorong keluar (jadi bisa menyamping di sekitar monster)
const PLAYER_R = 0.45; // "lebar badan" pemain
function collidePlayer() {
  for (const e of enemies) {
    const dx = player.position.x - e.g.position.x, dz = player.position.z - e.g.position.z, min = PLAYER_R + e.r, l = Math.hypot(dx, dz);
    if (l >= min) continue;
    const nx = l > 1e-4 ? dx / l : -Math.sin(P.face), nz = l > 1e-4 ? dz / l : -Math.cos(P.face); // arah dorong: dari pusat monster ke pemain
    player.position.x = e.g.position.x + nx * min; player.position.z = e.g.position.z + nz * min;
  }
  if (state === 'world') { world.collide(player.position, PLAYER_R); world.clamp(player.position); return; } // dunia luar: pohon & batas dunia (dataran + desa + Hutan Besar)
  if (player.position.length() > R - 1.5) player.position.setLength(R - 1.5); // tetap di dalam arena
}
function updateEnemies(dt) {
  for (const e of [...enemies]) {
    if (e.dying) { dyingTick(e); continue; }
    const d = player.position.clone().sub(e.g.position).setY(0), dist = d.length();
    d.normalize();
    if (e.dragon) { // naga berbelok perlahan (bukan langsung menghadap), sambil melangkah di tempat
      let stp;
      if (e.bt > BREATH_T.fire && e.bt <= BREATH_T.end) stp = (e.ls || 1) * LASER_SWEEP / LASER_DUR * dt; // laser menyala: badan & kepala ikut menyapu searah laser (tidak mengunci pemain)
      else {
        const sp = (e.rec = Math.max(0, (e.rec || 0) - dt)) > 0 ? 7 : 3.2; // habis menyembur: berputar cepat mengejar pemain
        const off = e.bt > 0 && e.bt <= BREATH_T.fire ? -(e.ls || 1) * LASER_SWEEP / 2 : 0; // aba-aba laser: menghadap sedikit ke samping pemain (titik awal sapuan)
        let df = Math.atan2(d.x, d.z) + off - e.g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df));
        stp = Math.max(-sp * dt, Math.min(sp * dt, df));
      }
      e.g.rotation.y += stp; e.turn = dt > 0 ? stp / dt : 0;
    } else if (!e.wild) e.g.rotation.y = Math.atan2(d.x, d.z); // monster hutan mengatur arah hadapnya sendiri
    e.cd -= dt; e.flash = Math.max(0, e.flash - dt);
    // knockback: terdorong lalu melambat (gesekan), musuh pusing sebentar & tidak bisa menyerang
    const wasStun = e.stun > 0; e.stun = Math.max(0, e.stun - dt);
    if (e.kv.lengthSq() > 0.04) {
      e.g.position.x += e.kv.x * dt; e.g.position.z += e.kv.z * dt; e.kv.multiplyScalar(Math.exp(-dt * 7));
      const hl = Math.hypot(e.g.position.x, e.g.position.z); // tetap di dalam arena (hanya di dungeon)
      if (state === 'play' && hl > R - 1.5) { e.g.position.x *= (R - 1.5) / hl; e.g.position.z *= (R - 1.5) / hl; }
    } else e.kv.set(0, 0, 0);
    if (e.stun > 0) { const s = e.stun / 0.35; e.g.scale.set(1 + s * 0.25, 1 - s * 0.25, 1 + s * 0.25); }
    else if (wasStun) e.g.scale.setScalar(1);
    e.mat.emissive.setHex(e.flash > 0 ? 0xffffff : e.wind > 0 ? 0x802010 : 0x000000);
    if (e.dragon) dragonAI(e, d, dist, dt);
    else if (e.wild) wildAI(e, d, dist, dt);
    else if (e.boss) {
      const keep = e.stun > 0 ? 0 : dist > 8 ? 1 : dist < 5 ? -1 : 0;
      e.g.position.addScaledVector(d, keep * e.sp * dt);
      e.g.position.y = Math.sin(P.t * 2) * 0.15;
      if ((e.orb -= dt) <= 0) {
        e.orb = 2.8; const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff3cf0 }));
        m.position.copy(e.g.position).setY(2.2).addScaledVector(d, 1);
        orbs.push({ m, v: player.position.clone().setY(1.1).sub(m.position).normalize().multiplyScalar(10) }); scene.add(m); // diarahkan ke dada pemain (dulu terbang datar di ketinggian 2,2 sehingga lewat di atas kepala & tidak pernah kena)
      }
      if ((e.slam -= dt) <= 0) {
        e.slam = 7;
        const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 4.5, 48), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2; m.position.copy(player.position).setY(0.05); scene.add(m);
        rings.push({ m, t: 1.1, rad: 4.6, dmg: 25, big: true, kind: 'wizard' }); // hantaman penyihir: bola api + ledakan + semburan api, sama seperti naga tapi lebih kecil
      }
    } else {
      if (e.wind > 0) {
        e.wind -= dt; e.g.scale.setScalar(1 + Math.sin(e.wind * 30) * 0.06);
        if (e.wind <= 0) { e.g.scale.setScalar(1); if (dist < 2.4) hurtPlayer(10); }
      } else if (e.stun > 0) { /* sedang terpental */ }
      else if (dist > 1.7) e.g.position.addScaledVector(d, e.sp * dt);
      else if (e.cd <= 0) { e.wind = 0.5; e.cd = 1.6; }
    }
    for (const o of enemies) if (o !== e) { // saling menjauh
      const s = e.g.position.clone().sub(o.g.position).setY(0), l = s.length();
      if (l < 1.6 && l > 0.001) e.g.position.addScaledVector(s.normalize(), (1.6 - l) * 0.5);
    }
  }
  for (const o of [...orbs]) {
    o.m.position.addScaledVector(o.v, dt);
    if (o.m.position.distanceTo(player.position.clone().setY(1.1)) < 1.0) { hurtPlayer(12); kill(o); }
    else if (o.m.position.length() > R + 2 || o.m.position.y < 0) kill(o);
  }
  function kill(o) { scene.remove(o.m); orbs.splice(orbs.indexOf(o), 1); }
  for (const r of [...rings]) {
    r.t -= dt; r.m.material.opacity = 0.25 + Math.sin(r.t * 20) * 0.1;
    if (r.t <= 0) {
      if (!r.big && player.position.distanceTo(r.m.position) < (r.rad || 4.6)) hurtPlayer(r.dmg || 25); // hantaman naga (big): damage diberikan saat ledakan
      if (r.big) spawnBlast(r.m.position, r.rad, r.dmg || 30, r.kind); else { burst(r.m.position, 0xff6030, 30, 8); shake = 0.6; }
      scene.remove(r.m); rings.splice(rings.indexOf(r), 1);
    }
  }
  updateBlasts(dt);
}

// ---------- Monster liar di Hutan Besar: slime & goblin muncul acak, hanya selama pemain di dalam hutan ----------
const WILD_MAX = 6, WILD_MAX_DEEP = 9; // jumlah maksimum di sekitar pemain (Hutan Dalam lebih ramai)
let wildT = 0, calmT = 0, loseInWorld = false;
const wildCount = () => enemies.reduce((n, e) => n + (e.wild ? 1 : 0), 0);
function mkWild(kind, x, z) {
  const m = kind === 'slime' ? buildSlime() : buildGoblin(), bar = makeBar(m.h);
  m.g.add(bar.g); m.g.position.set(x, 0, z); m.g.rotation.y = rnd(0, Math.PI * 2);
  const e = { g: m.g, mat: m.mat, mats: m.mats, body: m.body, parts: m.parts, wild: true, kind, col: m.col, boss: false, bar,
    hp: m.hp, max: m.hp, sp: kind === 'slime' ? 5.2 : 3.6, r: m.r, cd: rnd(0.4, 1.2), wind: 0, windMax: kind === 'slime' ? 0.45 : 0.55, flash: 0, kv: new THREE.Vector3(), stun: 0,
    home: new THREE.Vector3(x, 0, z), aggro: false, t: rnd(0, 6), ph: rnd(0, 1), hopH: 0.75, hd: new THREE.Vector3(), hs: 0, wt: rnd(0.3, 2), wd: new THREE.Vector3(), mv: 0, wk: 0, sw: 0 };
  scene.add(m.g); enemies.push(e); return e;
}
function disposeWild(e) { for (const m of e.mats) m.dispose(); }
function removeWild(e) { scene.remove(e.g); const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); disposeWild(e); }
function clearWild() { for (const e of [...enemies]) if (e.wild) removeWild(e); }
function trySpawnWild() {
  const deep = player.position.x > 172;
  if (wildCount() >= (deep ? WILD_MAX_DEEP : WILD_MAX)) return false;
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, Math.PI * 2), dd = rnd(20, 34), x = player.position.x + Math.cos(a) * dd, z = player.position.z + Math.sin(a) * dd;
    if (world.forestAmount(x, z) < 0.6) continue;                                   // hanya di dalam hutan
    if (Math.hypot(x - CAMP_FIRE.x, z - CAMP_FIRE.z) < 16) continue;                // perkemahan penjaga hutan aman
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 2) continue;                  // bukan di kolam
    if (Math.hypot(x - SECRET_GLADE.x, z - SECRET_GLADE.z) < SECRET_GLADE.r + 14) continue; // tempat rahasia centaur selalu tenang
    const p = new THREE.Vector3(x, 0, z); world.collide(p, 0.9);
    if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;                              // tepat di batang pohon / batu
    if (enemies.some(o => o.wild && Math.hypot(o.g.position.x - x, o.g.position.z - z) < 6)) continue;
    const goblin = Math.random() < (deep ? 0.55 : 0.35), n = goblin ? (Math.random() < 0.35 ? 2 : 1) : 1; // goblin kadang berdua
    for (let k = 0; k < n && wildCount() < WILD_MAX_DEEP + 1; k++) {
      const q = new THREE.Vector3(x + (k ? rnd(-2, 2) : 0), 0, z + (k ? rnd(-2, 2) : 0)); world.collide(q, 0.9);
      const e = mkWild(goblin ? 'goblin' : 'slime', q.x, q.z); burst(new THREE.Vector3(q.x, 0.4, q.z), e.col, 8, 2.5);
    }
    return true;
  }
  return false;
}
function wildSpawnTick(dt) {
  const fa = world.forestAmount(player.position.x, player.position.z);
  for (const e of [...enemies]) if (e.wild && !e.dying) { // terlalu jauh / pemain sudah keluar hutan -> hilang diam-diam
    const d = e.g.position.distanceTo(player.position);
    if (d > 62 || (fa < 0.1 && !e.aggro && d > 28)) removeWild(e);
  }
  if (!enemies.some(e => e.wild && e.aggro)) { calmT += dt; if (calmT > 4 && P.hp < P.max) P.hp = Math.min(P.max, P.hp + 2.5 * dt); } else calmT = 0; // aman beberapa detik -> darah pulih pelan
  if (fa < 0.4) { wildT = Math.min(wildT, 1.5); return; }
  if ((wildT -= dt) > 0) return;
  wildT = rnd(2.5, 5.5); trySpawnWild();
}
function wildAI(e, d, dist, dt) {
  const slime = e.kind === 'slime', pos = e.g.position, px = pos.x, pz = pos.z;
  e.t += dt;
  const inF = world.forestAmount(player.position.x, player.position.z) > 0.1, aggroR = slime ? 10 : 14;
  if (!e.aggro && inF && dist < aggroR) e.aggro = true;
  else if (e.aggro && (!inF || dist > aggroR * 2.4)) e.aggro = false;
  const face = (dx, dz, k = 10) => { let df = Math.atan2(dx, dz) - e.g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); e.g.rotation.y += df * Math.min(1, dt * k); };
  e.mv = 0;
  if (e.stun > 0) { /* sedang terpental */ }
  else if (e.wind > 0) { // aba-aba pukulan, lalu menghantam
    e.wind -= dt; face(d.x, d.z, 14);
    if (e.wind <= 0) {
      e.sw = 0.25;
      if (dist < (slime ? 2.4 : 2.7)) { hurtPlayer(slime ? 7 : 10); audio.sfx(slime ? 'thud' : 'sword', { vol: 0.6, rate: slime ? 1.5 : 0.8 }); }
      if (slime) e.kv.addScaledVector(d, 7); // slime menerjang ke depan
    }
  } else if (e.aggro) {
    face(d.x, d.z);
    if (dist > (slime ? 1.5 : 1.9)) {
      if (slime) {
        if (e.ph < 0.4) pos.addScaledVector(e.hd, e.hs * dt);
        e.ph += dt / 0.85;
        if (e.ph >= 1) { e.ph -= 1; e.hd.copy(d); e.hs = e.sp; }
      } else { pos.addScaledVector(d, e.sp * dt); e.mv = e.sp; }
    } else if (e.cd <= 0) { e.wind = e.windMax; e.cd = slime ? 1.9 : 1.7; }
    else if (slime && e.ph >= 0.4 && e.ph < 0.6) { /* diam menunggu */ } else if (slime) e.ph = Math.min(e.ph + dt / 0.85, 0.6);
  } else { // berkeliaran santai di sekitar tempat munculnya
    e.wt -= dt;
    if (e.wt <= 0) {
      e.wt = rnd(2, 4.5);
      const far = Math.hypot(px - e.home.x, pz - e.home.z) > 12;
      if (far) e.wd.set(e.home.x - px, 0, e.home.z - pz).normalize();
      else if (Math.random() < 0.45) e.wd.set(0, 0, 0);
      else { const a = rnd(0, Math.PI * 2); e.wd.set(Math.sin(a), 0, Math.cos(a)); }
    }
    if (slime) {
      if (e.ph < 0.4) pos.addScaledVector(e.hd, e.hs * dt);
      e.ph += dt / 1.5;
      if (e.ph >= 1) { e.ph -= 1; e.hd.copy(e.wd); e.hs = 2.2; if (e.wd.lengthSq() > 0) face(e.wd.x, e.wd.z, 40); }
    } else if (e.wd.lengthSq() > 0) { pos.addScaledVector(e.wd, 1.3 * dt); e.mv = 1.3; face(e.wd.x, e.wd.z, 6); }
  }
  // tidak menembus pohon & tidak keluar dari hutan
  world.collide(pos, e.r * 0.8);
  if (world.forestAmount(pos.x, pos.z) < 0.02 || Math.hypot(pos.x - SECRET_GLADE.x, pos.z - SECRET_GLADE.z) < SECRET_GLADE.r + 1) { pos.x = px; pos.z = pz; } // tidak keluar hutan & tidak masuk tempat rahasia
  // tampilan: animasi, kilatan terkena pukulan, bar darah menghadap kamera
  const em = e.flash > 0 ? 0xffffff : e.wind > 0 ? 0x802010 : 0x000000;
  for (const m of e.mats) m.emissive.setHex(em);
  if (slime) slimePose(e, dt); else goblinPose(e, dt);
  const show = e.hp < e.max && !e.dying; e.bar.g.visible = show;
  if (show) { e.bar.fill.scale.x = Math.max(0.001, e.hp / e.max) * e.bar.w; e.bar.g.rotation.y = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z) - e.g.rotation.y; }
}

// ---------- Input ----------
const keys = {};
addEventListener('keydown', e => {
  if (e.code === 'Escape') { openSettings(!settingsOpen); return; }
  if (settingsOpen) return; // game dijeda saat menu terbuka
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); attack(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') roll();
  const sk = { Digit1: 's1', Digit2: 's2', Digit3: 's3', Digit4: 's4' }[e.code]; if (sk) skill(sk);
  if (e.code === 'KeyC') toggleCam();
  if (e.code === 'KeyE' && state === 'world') world.talk(); // mengobrol dengan warga desa
  if (e.code === 'KeyF') toggleFS(); // layar penuh
  if ((e.code === 'KeyR' || e.code === 'Enter') && canAgain) restart(); // R / Enter (khusus keyboard PC)
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', e => {
  if (settingsOpen) return;
  if (orbit() && !locked() && e.button === 0 && e.target === renderer.domElement && !document.body.classList.contains('touch') && renderer.domElement.requestPointerLock) {
    renderer.domElement.requestPointerLock(); return; // klik pertama hanya mengunci mouse
  }
  if (e.button === 0 && canFight() && performance.now() - pinchEnd >= 400) attack();
});
// Restart lewat sentuhan/klik (berlaku untuk HP & PC): ketuk di mana saja setelah animasi kalah selesai
addEventListener('pointerdown', e => {
  if (!canAgain || (e.target.closest && e.target.closest('#top, #settings, #exit'))) return;
  e.preventDefault(); // cegah mousedown tiruan agar tidak langsung menyerang setelah restart
  restart();
});
addEventListener('contextmenu', e => e.preventDefault()); // tahan lama di HP tidak memunculkan menu

const canFight = () => state === 'play' || state === 'world'; // serang & skill juga bisa dipakai di dunia luar (melawan monster hutan)
function attack() {
  if (!canFight() || P.atk > 0 || P.roll > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0) return;
  P.hit = false; P.comboT = 1.2;
  if (++P.combo >= 4) { P.combo = 0; P.cross = true; P.dur = P.atk = CX.total; P.fx2 = P.fx3 = P.sx = false; P.set = new Set(); audio.sfx('slash'); } // serangan ke-4: silang -> lompat mundur -> terjang + silang
  else { P.cross = false; P.dur = P.atk = ATK_T; P.hand = -P.hand; audio.sfx('sword'); } // bergantian kanan-kiri
}
function roll() {
  if (state !== 'play' || P.roll > 0 || P.atk > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0) return;
  P.roll = 0.45; P.inv = Math.max(P.inv, 0.5);
  P.rv.set(Math.sin(P.face), 0, Math.cos(P.face));
}

// ---------- Kamera ----------
const CAMS = { // ubah angka off (x, tinggi, jarak) kalau mau angle lain
  depan: { off: new THREE.Vector3(0, 4.2, 9), look: 1.4 },
  atas: { off: new THREE.Vector3(0, 12, 11), look: 1 },
  orbit: { off: new THREE.Vector3(0, 4.2, 9), look: 1.4 } // kamera berputar bebas 360° (mouse / geser layar)
};
const CAM_NAMES = { depan: 'Depan', atas: 'Atas', orbit: '360°' };
const UP = new THREE.Vector3(0, 1, 0), mouse = { x: 0, y: 0 };
let camYaw = 0; // putaran kamera kiri-kanan (radian, bebas tanpa batas)
const PITCH_MIN = 0.06, PITCH_MAX = 1.45; // sudut kamera naik-turun: hampir sejajar tanah ... hampir tegak lurus dari atas
let camPitch = Math.atan2(4.2, 9); // sudut ketinggian kamera di atas pemain (radian); awal = sudut bawaan
const tiltCam = dy => { camPitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, camPitch + dy)); }; // dy > 0: kamera naik
const orbit = () => camMode === 'orbit';
const locked = () => document.pointerLockElement === renderer.domElement;
let toastT = 0;
function toast(t, ms = 3500) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, ms); }
// Mouse (PC): setelah klik, mouse "terkunci" sehingga bisa diputar terus 360°. Esc = lepas kunci. Cadangan: tahan klik kanan lalu geser.
addEventListener('mousemove', e => {
  if (!orbit() || settingsOpen) return;
  if (locked() || (e.buttons & 2)) { camYaw -= e.movementX * 0.005; tiltCam(e.movementY * 0.004); } // mouse kiri-kanan = putar, atas-bawah = naik-turun
});
document.addEventListener('pointerlockchange', () => { document.body.classList.toggle('locked', locked()); });
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; });
// ---------- Zoom: roll mouse (PC) / cubit dua jari (Android) ----------
const ZOOM_MIN = 0.35, ZOOM_MAX = 2.2; // pengali jarak kamera (1 = jarak awal)
let zoom = 1, zoomS = 1, pinchEnd = 0;
const setZoom = z => zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
addEventListener('wheel', e => { e.preventDefault(); setZoom(zoom * Math.exp(e.deltaY * 0.0012)); }, { passive: false });
const tps = new Map(); let pd0 = 0, z0 = 1; // jari yang menyentuh layar (di luar joystick/tombol)
const pdist = () => { const [a, b] = [...tps.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || e.target !== renderer.domElement) return;
  tps.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (tps.size === 2) { pd0 = pdist() || 1; z0 = zoom; }
});
addEventListener('pointermove', e => {
  const t = tps.get(e.pointerId); if (!t) return;
  if (tps.size === 1 && orbit() && !settingsOpen) { camYaw -= (e.clientX - t.x) * 0.007; tiltCam((e.clientY - t.y) * 0.005); } // geser 1 jari: kiri-kanan = putar, atas-bawah = naik-turun
  t.x = e.clientX; t.y = e.clientY;
  if (tps.size === 2) { setZoom(z0 * pd0 / Math.max(10, pdist())); pinchEnd = performance.now(); } // jari merenggang = zoom in
});
const pinchUp = e => { if (tps.delete(e.pointerId) && tps.size < 2) pinchEnd = performance.now(); };
addEventListener('pointerup', pinchUp); addEventListener('pointercancel', pinchUp);

function setCam(m) {
  camMode = m; syncCam(); document.body.classList.toggle('orbit', m === 'orbit');
  if (m !== 'orbit' && document.pointerLockElement) document.exitPointerLock();
  if (m === 'orbit') toast(document.body.classList.contains('touch') ? 'Geser layar 1 jari: kiri-kanan memutar, atas-bawah menaik-turunkan kamera' : 'Klik layar untuk mengunci mouse, lalu gerakkan mouse: kiri-kanan memutar, atas-bawah menaik-turunkan kamera (Esc = lepas)');
}
function toggleCam() { const ks = Object.keys(CAMS); setCam(ks[(ks.indexOf(camMode) + 1) % ks.length]); } // tombol C
function syncCam() { document.querySelectorAll('#segcam button').forEach(b => b.classList.toggle('on', b.dataset.cam === camMode)); }

// ---------- 3 Skill ----------
const SK = { s1: { cd: 6, t: 0 }, s2: { cd: 7, t: 0 }, s3: { cd: 12, t: 0 }, s4: { cd: 25, t: 0 } };
const waves = [], pulses = [];
const skBtn = Object.fromEntries(Object.keys(SK).map(k => [k, document.querySelector(`[data-a=${k}]`)]));
const crescent = new THREE.RingGeometry(0.7, 1.5, 24, 1, -Math.PI / 2 - 0.9, 1.8);
const glowMat = (c, o = 0.9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const shield = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), glowMat(0xffe27a, 0.25));
shield.position.y = 1; shield.visible = false; player.add(shield);

// ---------- Skill 1: Vertical Spin ----------
// Badan salto ke depan 2x pada bidang miring (sumbu putar dimiringkan), dua pedang terjulur ke depan menyapu lingkaran,
// dikelilingi pita ungu. Pemain kebal & melayang sedikit, 3 kali serangan area saat berputar.
function ribbonGeo(rc, span, W) { // pita melengkung: ekor tipis & redup -> kepala tebal & terang di sudut 0
  const N = 36, th0 = -span, pos = [], col = [], idx = [];
  const c1 = new THREE.Color(0x8a2dff), c2 = new THREE.Color(0xf3e6ff);
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = th0 + span * t, w = W * Math.pow(t, 1.2) + 0.02, br = Math.pow(t, 1.2);
    for (const [o, m] of [[-1, 0], [0, 1], [1, 0]]) {
      const r = rc + o * w; pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      const c = c1.clone().lerp(c2, m * t).multiplyScalar(br * (m ? 1 : 0.75)); col.push(c.r, c.g, c.b);
    }
    if (i < N) { const k = i * 3; idx.push(k, k + 1, k + 3, k + 1, k + 4, k + 3, k + 1, k + 2, k + 4, k + 2, k + 5, k + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
const VS = { active: false, dur: 1.15, tilt: 0.55, hitAt: [], hits: 0, q0: new THREE.Quaternion(), c: new THREE.Vector3(0, 0.95, 0), axis: new THREE.Vector3() }; // tilt = kemiringan bidang putar (radian)
VS.axis.set(Math.cos(VS.tilt), Math.sin(VS.tilt), 0);
VS.hitAt = [0.2, 0.5, 0.8].map(s => 0.12 + 0.74 * s); // kapan 3 serangan terjadi (0-1 dari durasi)
const vsFx = new THREE.Group(); vsFx.visible = false; player.add(vsFx);
const vsPlane = new THREE.Group(); vsFx.add(vsPlane); // bidang putar: sumbu x = depan pemain, sumbu z = sumbu putar miring
{
  const xp = new THREE.Vector3(0, 0, 1), yp = new THREE.Vector3(VS.axis.y, -VS.axis.x, 0);
  vsPlane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xp, yp, VS.axis));
}
const vsMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const vsRibbons = [];
// [radius, panjang busur, lebar, geser sepanjang sumbu, kecepatan putar relatif, kemiringan cincin]: 2 pita pedang + cincin pusaran besar
[[1.4, 2.8, 0.6, 0.28, 1, 0], [1.4, 2.4, 0.55, -0.28, 1, 0], [2.4, 3.4, 0.4, 0.5, 0.7, 0.6], [2.6, 3.0, 0.35, -0.5, 0.8, -0.6], [3.0, 4.5, 0.25, 0, 0.55, 0.2]].forEach(([rc, span, W, zo, rate, tilt]) => {
  const piv = new THREE.Group(); piv.add(new THREE.Mesh(ribbonGeo(rc, span, W), vsMat));
  const hold = new THREE.Group(); hold.position.z = zo; hold.rotation.x = tilt; hold.add(piv); vsPlane.add(hold);
  vsRibbons.push({ piv, rate });
});

function startVS() {
  if (bones) { const w = bones.hips.getWorldPosition(new THREE.Vector3()); player.worldToLocal(w); VS.c.set(0, w.y, 0); } // pusat putaran = pinggul
  if (vrm) VS.q0.copy(vrm.scene.quaternion); // simpan arah badan awal
  VS.active = true;
  Object.assign(P, { vs: VS.dur, atk: 0, cross: false, roll: 0 }); VS.hits = 0;
  for (const m of [slash.material, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
  vsFx.visible = true; pulse(0xa23cff, 4.3, 0.45); lineSparks(player.position.clone().setY(0.2), 22, 6, 0.8); shake = 0.3;
}
function endVS() { // kembalikan badan tegak
  if (!VS.active) return; VS.active = false;
  P.vs = 0; vsFx.visible = false; vsMat.opacity = 0;
  if (vrm) { vrm.scene.quaternion.copy(VS.q0); vrm.scene.position.x = 0; vrm.scene.position.z = 0; }
  P.drawT = DRAW_HOLD;
}
function vsHit() { // serangan area di sekitar pemain
  for (const e of [...enemies]) {
    const d = e.g.position.clone().sub(player.position).setY(0), l = d.length();
    if (l < 4.3 + e.r) { hurtEnemy(e, 26, d.normalize(), 14); lineSparks(e.g.position.clone().setY(1.2), 14, 7); }
  }
  pulse(0xa23cff, 4.3, 0.3); lineSparks(player.position.clone().setY(1), 14, 8); shake = 0.35;
}
function vsTick(dt) { // waktu, gerak maju, kebal, serangan
  P.vs -= dt; const u = (VS.dur - P.vs) / VS.dur;
  P.inv = Math.max(P.inv, 0.15);
  player.position.addScaledVector(faceVec(), 2.2 * dt * (u > 0.12 && u < 0.86 ? 1 : 0.3)); // meluncur maju
  while (VS.hits < VS.hitAt.length && u >= VS.hitAt[VS.hits]) { VS.hits++; vsHit(); audio.sfx('sword', { from: 0.1 }); } // suara basic attack, 3x mengikuti 3 tebasan
  if (P.vs <= 0) endVS();
}
function vsPose(dt) { // badan + pedang + efek tiap frame
  const u = clamp01((VS.dur - P.vs) / VS.dur), s = clamp01((u - 0.12) / 0.74); // s: 0-1 selama fase berputar
  const ang = Math.PI * 4 * (s * s * (3 - 2 * s)), lift = 0.8 * Math.sin(Math.PI * s); // 2 putaran penuh, melayang naik-turun
  const Q = new THREE.Quaternion().setFromAxisAngle(VS.axis, ang);
  if (vrm) { // putar badan mengelilingi pinggul (bukan telapak kaki)
    const sc = vrm.scene, cr = VS.c.clone().applyQuaternion(Q);
    sc.quaternion.copy(Q).multiply(VS.q0); sc.position.set(VS.c.x - cr.x, VS.c.y - cr.y + lift, VS.c.z - cr.z);
  }
  vsFx.position.set(0, VS.c.y + lift, 0);
  vsMat.opacity = Math.pow(Math.sin(Math.PI * s), 0.4) * 0.95;
  for (const r of vsRibbons) r.piv.rotation.z = ang * r.rate;
  if (!bones) return;
  const b = bones, kb = 1 - Math.exp(-dt * 24);
  if (u < 0.12 || u > 0.86) { // bersiap (badan merunduk, pedang ditarik ke belakang) / mendarat
    pose(b.rUA, 0, u < 0.12 ? -0.6 : 0.8, 0.5, kb); pose(b.lUA, 0, u < 0.12 ? 0.6 : -0.8, -0.5, kb);
    pose(b.hips, 0.25, 0, 0, kb); pose(b.spine, 0.25, 0, 0, kb); pose(b.chest, 0, 0, 0, kb);
    pose(b.lUL, -0.6, 0, 0.1, kb); pose(b.rUL, 0.3, 0, -0.1, kb); pose(b.lLL, 0.9, 0, 0, kb); pose(b.rLL, 0.7, 0, 0, kb);
  } else { // berputar: kedua lengan terjulur ke depan, kaki ditekuk
    pose(b.rUA, 0, 1.25, 0.1, kb); pose(b.lUA, 0, -1.25, -0.1, kb);
    pose(b.hips, 0.1, 0, 0, kb); pose(b.spine, 0.3, 0, 0, kb); pose(b.chest, 0, 0, 0, kb);
    pose(b.lUL, -0.9, 0, 0.05, kb); pose(b.rUL, -0.7, 0, -0.05, kb); pose(b.lLL, 1.3, 0, 0, kb); pose(b.rLL, 1.2, 0, 0, kb);
  }
  pose(b.rLA, 0, 0, 0, kb); pose(b.lLA, 0, 0, 0, kb); pose(b.head, -0.2, 0, 0, kb);
}

// ---------- Skill 2: Slash Besar ----------
// Kuda-kuda rendah, badan memutar ke kanan (bersiap), lalu menerjang maju sambil mengayunkan dua pedang dalam satu tebasan besar
// dari kanan ke kiri. Muncul bulan sabit ungu raksasa (ekor tipis redup -> kepala tebal putih keunguan), percikan garis, 2 kali serangan area di depan.
const SL = { dur: 1.0, hitAt: [0.40, 0.50], hits: 0, a0: Math.PI - 0.45, a1: Math.PI * 2 + 0.45 }; // a0 -> a1: sudut sapuan (kanan -> depan -> kiri)
const slFx = new THREE.Group(); slFx.visible = false; player.add(slFx);
const slPlane = new THREE.Group(); slPlane.rotation.x = -Math.PI / 2; slFx.add(slPlane); // bidang XY dibaringkan jadi horizontal
const slMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const slRibbons = [];
// [radius, panjang busur, lebar, tinggi, kemiringan, geser sudut, kecepatan relatif]: 2 sabit pedang utama + sabit luar tipis + sabit dalam
[[3.3, 3.5, 1.05, 0.95, 0.32, 0, 1], [2.9, 3.1, 0.8, 1.2, -0.3, 0.14, 1], [4.4, 3.9, 0.45, 1.05, 0.12, -0.1, 0.94], [2.3, 2.5, 0.5, 0.8, 0.5, 0.22, 1.06]].forEach(([rc, span, W, h, tilt, off, rate]) => {
  const piv = new THREE.Group(); piv.add(new THREE.Mesh(ribbonGeo(rc, span, W), slMat));
  const hold = new THREE.Group(); hold.position.z = h; hold.rotation.x = tilt; hold.add(piv); slPlane.add(hold);
  slRibbons.push({ piv, off, rate });
});
const slHead = (r, a, h) => new THREE.Vector3(r * Math.cos(a), h, -r * Math.sin(a)).applyAxisAngle(UP, player.rotation.y).add(player.position); // posisi dunia ujung sabit

function startSL() {
  audio.sfx('slash', { delay: 0.2 }); // puncak suara tepat saat tebasan (0,40-0,50 dtk)
  Object.assign(P, { sl: SL.dur, atk: 0, cross: false, roll: 0 }); SL.hits = 0;
  for (const m of [slash.material, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
  slFx.visible = true; slMat.opacity = 0;
  pulse(0xa23cff, 3.2, 0.35); lineSparks(player.position.clone().setY(0.2), 14, 5, 0.6);
}
function endSL() {
  if (!P.sl && !slFx.visible) return;
  P.sl = 0; slFx.visible = false; slMat.opacity = 0; P.drawT = DRAW_HOLD;
}
function slHit(power) { // serangan area: setengah lingkaran besar di depan pemain
  const f = faceVec();
  for (const e of [...enemies]) {
    const d = e.g.position.clone().sub(player.position).setY(0), l = d.length();
    if (l < 6.2 + e.r && (l < 1.2 || d.clone().normalize().dot(f) > -0.2)) {
      hurtEnemy(e, power, d.normalize(), 22); lineSparks(e.g.position.clone().setY(1.2), 20, 9);
    }
  }
  pulse(0xb35cff, 5.5, 0.4); lineSparks(player.position.clone().addScaledVector(f, 3).setY(0.8), 26, 9); shake = 0.5;
}
function slTick(dt) { // waktu, terjang maju, kebal, serangan, percikan
  P.sl -= dt; const u = clamp01((SL.dur - P.sl) / SL.dur);
  P.inv = Math.max(P.inv, 0.15);
  player.position.addScaledVector(faceVec(), (u < 0.26 ? 0 : u < 0.52 ? 9 : 1.2) * dt); // diam bersiap -> menerjang -> meluncur pelan
  while (SL.hits < SL.hitAt.length && u >= SL.hitAt[SL.hits]) { slHit(SL.hits === 0 ? 30 : 24); SL.hits++; }
  if (u > 0.28 && u < 0.62) { // percikan garis mengikuti ujung sabit
    const e = clamp01((u - 0.26) / 0.32), a = SL.a0 + (SL.a1 - SL.a0) * (1 - Math.pow(1 - e, 3));
    lineSparks(slHead(3.3, a, 0.95), 2, 6, 0.8);
  }
  if (P.sl <= 0) endSL();
}
function slPose(dt) { // badan + pedang + efek tiap frame
  const u = clamp01((SL.dur - P.sl) / SL.dur), q = clamp01((u - 0.26) / 0.32), e = 1 - Math.pow(1 - q, 3); // e: sapuan cepat di awal, melambat di akhir
  slFx.position.set(0, 0, -0.2);
  const env = Math.pow(Math.sin(Math.PI * clamp01((u - 0.24) / 0.6)), 0.5); // sabit muncul cepat, memudar pelan
  slMat.opacity = (u > 0.24 && u < 0.84 ? env : 0) * 0.95;
  for (const r of slRibbons) r.piv.rotation.z = SL.a0 + r.off + (SL.a1 - SL.a0) * e * r.rate;
  slFx.scale.setScalar(0.85 + 0.2 * e);
  if (!bones) return;
  const b = bones, kb = 1 - Math.exp(-dt * 24), kf = 1 - Math.exp(-dt * 30), kg = 1 - Math.exp(-dt * 26), k = 1 - Math.exp(-dt * 14);
  const lift = 0.22 * Math.sin(Math.PI * clamp01((u - 0.2) / 0.45)); // melompat kecil saat menerjang
  if (vrm) vrm.scene.position.y += (lift - 0.06 * (u < 0.26 ? u / 0.26 : 0) - vrm.scene.position.y) * kg;
  const ty = -0.7 + 1.5 * e; // puntiran badan: ke kanan (bersiap) -> ke kiri (menebas)
  const rr = clamp01((u - 0.82) / 0.18); // fase kembali
  let px = (-1.0 + 3.2 * e) * (1 - rr) + 0.1 * rr, zx = (0.5 + 0.5 * e) * (1 - rr) + 0.4 * rr;
  pose(b.rUA, 0, px, zx, kf); pose(b.lUA, 0, -px, zx, kf); pose(b.rLA, 0, 0, 0, k); pose(b.lLA, 0, 0, 0, k);
  const tw = ty * (1 - rr);
  pose(b.spine, 0.3 * (1 - rr) + 0.1 * rr, tw * 0.6, 0, kb); pose(b.chest, 0, tw * 0.4, 0, kb); pose(b.hips, 0.2 * (1 - rr), -tw * 0.3, 0, kb);
  pose(b.lUL, -0.6, 0, 0.3, kb); pose(b.rUL, 0.5, 0, -0.3, kb); pose(b.lLL, 0.85, 0, 0, kb); pose(b.rLL, 0.25, 0, 0, kb); // kuda-kuda lebar (lunge)
  pose(b.head, -0.1 - 0.25 * e, -tw * 0.2, 0, k);
}

// ---------- Skill 3: Summon Blade ----------
// Pemain mengangkat dua pedang lalu menghentak ke depan: lingkaran sihir ungu muncul di bawah tiap monster (maks. 5 terdekat),
// pedang raksasa terpanggil melayang di atasnya, berputar mengisi cahaya, lalu menghujam cepat -> ledakan, pilar cahaya, percikan garis.
const SM = { mode: 3, dur: 1.0, maxT: 5, H: 6, dmg: 48, splash: 22, splashR: 2.4 };
const blades = [], pillars = [];
const bgeo = { blade: new THREE.BoxGeometry(0.28, 2.2, 0.05), tip: new THREE.ConeGeometry(0.14, 0.5, 4), guard: new THREE.BoxGeometry(1.0, 0.12, 0.14),
  grip: new THREE.BoxGeometry(0.1, 0.7, 0.1), pom: new THREE.SphereGeometry(0.1, 8, 8), aura: new THREE.PlaneGeometry(1.2, 4.6),
  ring1: new THREE.RingGeometry(0.92, 1, 64), ring2: new THREE.RingGeometry(0.6, 0.65, 48), bar: new THREE.PlaneGeometry(0.035, 1.9), pillar: new THREE.CylinderGeometry(0.45, 0.45, 12, 16, 1, true) };
const HOLY = { white: 0xfff4cf, gold: 0xffc83a, deep: 0xffb52e, sparks: [0xfff2c0, 0xffc83a] }; // palet emas suci skill 3
const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,248,214,1)'); g.addColorStop(0.25, 'rgba(255,214,102,.55)'); g.addColorStop(0.6, 'rgba(255,184,40,.16)'); g.addColorStop(1, 'rgba(255,170,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
function makeBigBlade() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: HOLY.white, metalness: 1, roughness: 0.2, emissive: HOLY.deep, emissiveIntensity: 1.1, transparent: true, opacity: 0 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 1, roughness: 0.3, emissive: 0x9a6400, transparent: true, opacity: 0 });
  const aura = glowMat(HOLY.gold, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.position.y = 1.5; halo.scale.set(7, 7, 1); g.add(halo); // cahaya suci di sekeliling pedang
  const add = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; g.add(o); return o; };
  add(bgeo.blade, steel, 1.35); add(bgeo.tip, steel, 0).rotation.x = Math.PI; // ujung runcing menghadap ke bawah
  add(bgeo.guard, gold, 2.5); add(bgeo.grip, gold, 2.95); add(bgeo.pom, gold, 3.38);
  const a1 = add(bgeo.aura, aura, 1.5), a2 = add(bgeo.aura, aura, 1.5); a2.rotation.y = Math.PI / 2;
  return { g, steel, gold, aura, halo };
}
function makeSummonRing() { // lingkaran sihir datar di lantai
  const g = new THREE.Group(), m = glowMat(HOLY.gold, 0);
  g.add(new THREE.Mesh(bgeo.ring1, m), new THREE.Mesh(bgeo.ring2, m));
  for (let i = 0; i < 3; i++) { const bar = new THREE.Mesh(bgeo.bar, m); bar.rotation.z = i * Math.PI / 3; g.add(bar); } // bintang bersudut 6
  g.rotation.x = -Math.PI / 2; return { g, m };
}
function startSM() {
  audio.sfx('choir', { delay: 0.3 }); // paduan suara saat lingkaran sihir pertama muncul
  SM.mode = 3;
  Object.assign(P, { sm: SM.dur, atk: 0, cross: false, roll: 0 });
  for (const m of [slash.material, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
  let tg = [...enemies].filter(e => state === 'play' || e.g.position.distanceTo(player.position) < 16).sort((a, b) => a.g.position.distanceTo(player.position) - b.g.position.distanceTo(player.position)).slice(0, SM.maxT)
    .map(e => ({ e, x: e.g.position.x, z: e.g.position.z, r: e.r }));
  if (!tg.length) { const f = faceVec(), sd = new THREE.Vector3(f.z, 0, -f.x); // tidak ada musuh: 3 pedang jatuh di depan
    tg = [-2.2, 0, 2.2].map((o, i) => { const p = player.position.clone().addScaledVector(f, i === 1 ? 6 : 5).addScaledVector(sd, o); return { e: null, x: p.x, z: p.z, r: 0.9 }; }); }
  tg.forEach((t, i) => {
    const bl = makeBigBlade(), rg = makeSummonRing();
    bl.g.visible = rg.g.visible = false; scene.add(bl.g, rg.g);
    const k = Math.max(1, t.r / 0.9), rate = 1 / Math.pow(k, 0.4); // k = skala ukuran musuh; musuh besar -> pedang lebih besar & suara lebih berat
    blades.push({ ...t, bl, rg, k, rate, t: 0, delay: 0.3 + i * 0.13, imp: false, sndAt: 0.92 - 0.25 / rate });
  });
  pulse(HOLY.gold, 3.5, 0.5); lineSparks(player.position.clone().setY(0.2), 16, 6, 0.8, HOLY.sparks);
}
function endSM(full) {
  P.sm = 0; P.drawT = DRAW_HOLD;
  if (full) { for (const b of blades) { scene.remove(b.bl.g, b.rg.g); } blades.length = 0; for (const p of pillars) scene.remove(p.m); pillars.length = 0; }
}
function smTick(dt) { P.sm -= dt; P.inv = Math.max(P.inv, 0.15); if (P.sm <= 0) endSM(); }
function bladeImpact(b) {
  const pos = new THREE.Vector3(b.x, 0.3, b.z);
  for (const e of [...enemies]) {
    const d = e.g.position.clone().sub(pos).setY(0), l = d.length();
    if (e === b.e) hurtEnemy(e, SM.dmg, l > 0.01 ? d.normalize() : null, 6);
    else if (l < SM.splashR * b.k + e.r) hurtEnemy(e, SM.splash, d.normalize(), 10);
  }
  burst(pos.clone().setY(0.8), 0xfff2c0, 16, 7); lineSparks(pos.clone().setY(0.4), 36, 10, 1.2, HOLY.sparks);
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(HOLY.gold)); m.rotation.x = -Math.PI / 2; m.position.copy(pos).setY(0.1); scene.add(m);
  pulses.push({ m, t: 0.45, dur: 0.45, max: 3.4 * b.k });
  const pm = new THREE.Mesh(bgeo.pillar, glowMat(0xffe48a, 0.9)); pm.position.set(b.x, 6, b.z); scene.add(pm); pm.scale.set(b.k, 1, b.k); pillars.push({ m: pm, t: 0.4, dur: 0.4, s: b.k }); // pilar cahaya (melebar sesuai ukuran musuh)
  shake = Math.max(shake, 0.45 + 0.1 * (b.k - 1));
}
function bladesTick(dt) {
  const ease = k => 1 - Math.pow(1 - k, 3);
  for (const b of [...blades]) {
    b.t += dt; const t = b.t - b.delay, bl = b.bl, rg = b.rg, K = b.k, H = SM.H * (1 + (K - 1) * 0.35);
    if (t < 0) continue;
    bl.g.visible = rg.g.visible = true;
    if (!b.snd && t >= b.sndAt) { b.snd = true; audio.sfx('swordbreak', { vol: 0.85, rate: b.rate }); } // puncak suara (0,25 dtk) tepat saat pedang menghantam (t=0,92)
    if (t < 0.8 && b.e) { if (enemies.includes(b.e)) { b.x = b.e.g.position.x; b.z = b.e.g.position.z; } else b.e = null; } // ikuti monster sampai pedang menukik
    let a = 1, y = H, ch = 0, rs = 1, sc = 1;
    if (t < 0.4) { const k = t / 0.4; a = k; rs = ease(k); sc = 0.7 + 0.3 * k; y = H + 0.8 * (1 - k); }
    else if (t < 0.8) { ch = (t - 0.4) / 0.4; y = H + Math.sin(t * 14) * 0.08; }
    else if (t < 0.92) { const k = (t - 0.8) / 0.12; y = H + (0.45 - H) * k * k; ch = 1; } // menukik cepat
    else { y = 0.45; ch = 1; if (!b.imp) { b.imp = true; bladeImpact(b); } if (t > 1.4) a = Math.max(0, 1 - (t - 1.4) / 0.25); }
    bl.g.position.set(b.x, y, b.z); bl.g.scale.setScalar(sc * K);
    if (t < 0.8) bl.g.rotation.y = t * (2 + ch * 6);
    bl.steel.opacity = bl.gold.opacity = a; bl.steel.emissiveIntensity = 1 + 2 * ch;
    bl.halo.material.opacity = a * (0.4 + 0.5 * ch) * (0.88 + 0.12 * Math.sin(t * 24)); bl.halo.scale.setScalar((6 + 3 * ch) * (0.95 + 0.05 * Math.sin(t * 17)));
    bl.aura.opacity = a * (0.2 + 0.6 * ch); bl.aura.opacity *= t > 0.92 ? Math.max(0, 1 - (t - 0.92) * 2.5) : 1;
    rg.g.position.set(b.x, 0.07, b.z); rg.g.scale.setScalar((b.r + 0.9) * 1.25 * rs); rg.g.rotation.z = t * 2.5;
    rg.m.opacity = 0.9 * a * (0.6 + 0.4 * ch);
    if (t > 1.65) { scene.remove(bl.g, rg.g); blades.splice(blades.indexOf(b), 1); }
  }
  for (const p of [...pillars]) {
    p.t -= dt; const k = 1 - p.t / p.dur;
    p.m.scale.set((p.s || 1) * (1 + 1.6 * k), 1, (p.s || 1) * (1 + 1.6 * k)); p.m.material.opacity = 0.9 * (1 - k);
    if (p.t <= 0) { scene.remove(p.m); pillars.splice(pillars.indexOf(p), 1); }
  }
}
function smPose(dt) {
  if (SM.mode === 4) { bfPose(dt); return; }
  // mengangkat dua pedang ke atas (memanggil) -> menghentak ke depan
  const u = clamp01((SM.dur - P.sm) / SM.dur);
  if (vrm) vrm.scene.position.y += (-0.05 - vrm.scene.position.y) * (1 - Math.exp(-dt * 26));
  if (!bones) return;
  const b = bones, kb = 1 - Math.exp(-dt * 20), kf = 1 - Math.exp(-dt * 26), k = 1 - Math.exp(-dt * 14);
  if (u < 0.5) { // memanggil: kedua lengan terangkat tinggi, badan condong ke belakang, kepala menengadah
    pose(b.rUA, 0, 0.2, -1.4, kf); pose(b.lUA, 0, -0.2, 1.4, kf); pose(b.rLA, 0, 0, 0, k); pose(b.lLA, 0, 0, 0, k);
    pose(b.spine, -0.22, 0, 0, kb); pose(b.chest, -0.1, 0, 0, kb); pose(b.hips, 0.05, 0, 0, kb); pose(b.head, -0.4, 0, 0, k);
  } else { // menghentak: lengan terjulur ke depan, badan condong maju
    pose(b.rUA, 0, 1.25, 0.1, kf); pose(b.lUA, 0, -1.25, -0.1, kf); pose(b.rLA, 0, 0, 0, k); pose(b.lLA, 0, 0, 0, k);
    pose(b.spine, 0.32, 0, 0, kb); pose(b.chest, 0.05, 0, 0, kb); pose(b.hips, 0.2, 0, 0, kb); pose(b.head, 0.1, 0, 0, k);
  }
  pose(b.lUL, -0.55, 0, 0.3, kb); pose(b.rUL, 0.45, 0, -0.3, kb); pose(b.lLL, 0.8, 0, 0, kb); pose(b.rLL, 0.3, 0, 0, kb); // kuda-kuda lebar
}

// ---------- Skill 4: Penguatan dan Perlindungan ----------
// Tubuh dipenuhi energi (duri cahaya naik dari lingkaran sihir) -> aura ungu menyelubungi badan (tanpa kubah).
// Selama aktif: perisai menyerap serangan (sampai habis), serangan dasar +30% dan tiap serangan dasar melepas slash tambahan.
const BF = { on: false, dur: 14, hp: 80, max: 80, t: 0, age: 0, flash: 0, flip: 1, cast: 0.9 };
const bfG = new THREE.Group(); bfG.visible = false; scene.add(bfG);
const bfRingA = makeSummonRing(), bfRingB = makeSummonRing(); bfRingA.g.position.y = bfRingB.g.position.y = 0.1; bfG.add(bfRingA.g, bfRingB.g);
function auraGeo(r0, r1, h) { // selubung aura mengikuti badan: terang di kaki -> memudar ke atas, bergaris vertikal seperti api
  const g = new THREE.CylinderGeometry(r1, r0, h, 48, 12, true); g.translate(0, h / 2, 0);
  const p = g.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h, an = Math.atan2(p.getZ(i), p.getX(i)), k = Math.pow(1 - t, 1.5) * (0.55 + 0.45 * Math.sin(an * 7 + t * 4));
    c.push(0.62 * k, 0.24 * k, 1.0 * k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g;
}
const bfAuraMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const bfAuraA = new THREE.Mesh(auraGeo(0.85, 0.5, 2.5), bfAuraMat()), bfAuraB = new THREE.Mesh(auraGeo(1.15, 0.65, 3.0), bfAuraMat());
bfG.add(bfAuraA, bfAuraB);
const bfCore = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), glowMat(0xb35cff, 0)); bfCore.position.y = 1.0; bfCore.scale.set(1, 1.35, 1); bfG.add(bfCore); // cahaya halus di sekitar badan
const bfSpikeMat = glowMat(0xb35cff, 0), bfSpikes = []; // garis cahaya naik di sekitar badan
for (let i = 0; i < 22; i++) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.05, 1, 4), bfSpikeMat), an = Math.random() * 6.283, r = 0.5 + Math.random() * 0.6;
  m.position.set(Math.cos(an) * r, 0, Math.sin(an) * r); bfG.add(m); bfSpikes.push({ m, h: 0.5 + Math.random() * 1.0, o: Math.random(), sp: 0.7 + Math.random() * 0.6 });
}
const shW = document.createElement('div'); shW.className = 'bar'; shW.style.marginTop = '3px'; shW.hidden = true; // bar perisai di HUD
const shI = document.createElement('i'); shI.style.background = 'linear-gradient(90deg,#7a2dff,#d2a8ff)'; shW.appendChild(shI); $('pl').appendChild(shW);

function startBF() {
  audio.sfx('thud');
  Object.assign(P, { sm: BF.cast, atk: 0, cross: false, roll: 0 }); SM.mode = 4;
  for (const m of [slash.material, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
  Object.assign(BF, { on: true, t: BF.dur, hp: BF.max, age: 0, flash: 0 });
  bfG.visible = true; shW.hidden = false;
  pulse(0xa23cff, 4.2, 0.6); setTimeout(() => pulse(0xd2a8ff, 5.5, 0.5), 250);
  lineSparks(player.position.clone().setY(0.2), 34, 8, 1.2);
  const pm = new THREE.Mesh(bgeo.pillar, glowMat(0xf3e6ff, 0.8)); pm.position.set(player.position.x, 6, player.position.z); pm.scale.set(2.4, 1, 2.4); scene.add(pm); pillars.push({ m: pm, t: 0.5, dur: 0.5 });
  shake = Math.max(shake, 0.3); toast('Aura Penguatan & Perlindungan aktif! Serangan +30%, slash tambahan tiap serangan dasar', 3000);
}
function endBF() { BF.on = false; bfG.visible = false; shW.hidden = true; }
function breakBF(msg) { // perisai pecah / waktu habis
  lineSparks(player.position.clone().setY(1.2), 44, 10, 1.1); burst(player.position.clone().setY(1.2), 0xd2a8ff, 20, 7);
  pulse(0xb35cff, 5, 0.4); shake = Math.max(shake, 0.3); endBF(); toast(msg || 'Aura pelindung berakhir', 1800);
}
function bfSlash() { // slash tambahan: sabit ungu melesat ke depan, bergantian kiri-kanan
  const f = faceVec(); BF.flip *= -1;
  const wg = new THREE.Group(), pl = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  pl.rotation.x = -Math.PI / 2; wg.add(pl);
  [[2.2, 2.6, 0.9, 0.0, 0.25], [2.8, 2.2, 0.35, 0.2, -0.2]].forEach(([rc, span, W, h, tilt]) => {
    const piv = new THREE.Group(); piv.add(new THREE.Mesh(ribbonGeo(rc, span, W), mat)); piv.rotation.z = -Math.PI / 2 + span / 2;
    const hold = new THREE.Group(); hold.position.z = h; hold.rotation.x = tilt; hold.add(piv); pl.add(hold);
  });
  wg.position.copy(player.position).addScaledVector(f, 0.6).setY(0.95); wg.rotation.y = P.face; wg.scale.x = BF.flip; scene.add(wg);
  waves.push({ g: wg, v: f.clone().multiplyScalar(15), life: 0.55, hit: new Set(), dmg: 20, mat });
  lineSparks(player.position.clone().addScaledVector(f, 1.5).setY(1), 10, 7);
}
function bfTick(dt) {
  if (!BF.on) return;
  BF.age += dt; BF.t -= dt; BF.flash = Math.max(0, BF.flash - dt * 4);
  bfG.position.copy(player.position);
  const ease = k => 1 - Math.pow(1 - k, 3), rise = ease(clamp01(BF.age / 0.55)), dk = ease(clamp01((BF.age - 0.4) / 0.5));
  const warn = BF.t < 2.5 ? 0.65 + 0.35 * Math.sin(BF.age * 18) : 1; // berkedip saat hampir habis
  bfRingA.g.scale.setScalar(2.7 * rise); bfRingA.g.rotation.z = BF.age * 0.9; bfRingA.m.opacity = 0.9 * rise * warn;
  bfRingB.g.scale.setScalar(3.6 * rise); bfRingB.g.rotation.z = -BF.age * 0.6; bfRingB.m.opacity = 0.5 * rise * warn;
  const rs = ease(clamp01(BF.age / 0.6)), w = clamp01((BF.age - 0.8) / 0.5), fl = BF.flash;
  const wob = 1 + 0.05 * Math.sin(BF.age * 5);
  bfAuraA.scale.set(wob * (0.6 + 0.4 * dk), 0.5 + 0.5 * dk, wob * (0.6 + 0.4 * dk)); bfAuraA.rotation.y = BF.age * 1.4;
  bfAuraB.scale.set(1 / wob * (0.6 + 0.4 * dk), 0.5 + 0.5 * dk, 1 / wob * (0.6 + 0.4 * dk)); bfAuraB.rotation.y = -BF.age * 0.9;
  bfAuraA.material.opacity = (0.75 + 0.15 * Math.sin(BF.age * 3) + fl * 0.6) * dk * warn;
  bfAuraB.material.opacity = (0.4 + fl * 0.5) * dk * warn;
  bfCore.material.opacity = (0.1 + fl * 0.3 + 0.04 * Math.sin(BF.age * 4)) * dk * warn;
  bfSpikeMat.opacity = 0.85 * rs * warn * (1 - 0.2 * w);
  for (const s of bfSpikes) {
    const ph = (BF.age * 0.8 * s.sp + s.o) % 1, boost = 1 + 1.3 * (1 - w), hh = Math.max(0.01, s.h * boost * Math.sin(Math.PI * ph) * rs);
    s.m.scale.y = hh; s.m.position.y = ph * 1.8 + hh / 2; // naik dari kaki sambil memudar
  }
  shI.style.width = Math.max(0, BF.hp / BF.max * 100) + '%';
  if (BF.t <= 0) breakBF('Aura pelindung berakhir');
}
function bfPose(dt) { // aktivasi: berjongkok mengumpulkan energi -> berdiri tegak, lengan terbuka, pedang menjuntai ke bawah
  const u = clamp01((BF.cast - P.sm) / BF.cast);
  if (vrm) vrm.scene.position.y += ((u < 0.4 ? -0.1 : 0.12 * Math.sin(Math.PI * clamp01((u - 0.4) / 0.6))) - vrm.scene.position.y) * (1 - Math.exp(-dt * 24));
  if (!bones) return;
  const b = bones, kb = 1 - Math.exp(-dt * 20), kf = 1 - Math.exp(-dt * 26), k = 1 - Math.exp(-dt * 14), open = u < 0.4 ? 0 : 1;
  pose(b.rUA, 0.1, 0.1, 0.95 - 0.35 * open, kf); pose(b.lUA, 0.1, -0.1, -0.95 + 0.35 * open, kf); pose(b.rLA, 0, 0.2, 0, k); pose(b.lLA, 0, -0.2, 0, k);
  pose(b.spine, u < 0.4 ? 0.25 : -0.12, 0, 0, kb); pose(b.chest, u < 0.4 ? 0.1 : -0.15, 0, 0, kb); pose(b.hips, u < 0.4 ? 0.15 : 0, 0, 0, kb); pose(b.head, u < 0.4 ? 0.1 : -0.3, 0, 0, k);
  pose(b.lUL, -0.4, 0, 0.35, kb); pose(b.rUL, -0.4, 0, -0.35, kb); pose(b.lLL, 0.7, 0, 0, kb); pose(b.rLL, 0.7, 0, 0, kb); // kuda-kuda lebar
}

function pulse(color, max, dur) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(color));
  m.rotation.x = -Math.PI / 2; m.position.copy(player.position).setY(0.1); scene.add(m);
  pulses.push({ m, t: dur, dur, max });
}
function skill(k) {
  const s = SK[k];
  if (!canFight() || s.t > 0 || P.roll > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0 || (P.atk > 0 && P.cross)) return;
  s.t = s.cd;
  const f = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face));
  if (k === 's1') { // 1. Vertical Spin: berputar vertikal dengan dua pedang
    startVS();
  } else if (k === 's2') { // 2. Slash Besar: mengayunkan dua pedang dalam satu tebasan besar
    startSL();
  } else if (k === 's3') { // 3. Summon Blade: memanggil pedang yang spawn di atas monster, lalu menghantamnya
    startSM();
  } else { // 4. Penguatan dan Perlindungan: perisai + serangan dasar diperkuat
    startBF();
  }
}
function tickSkills(dt) {
  bladesTick(dt); bfTick(dt);
  for (const k in SK) { const s = SK[k]; s.t = Math.max(0, s.t - dt); skBtn[k].style.setProperty('--cd', s.t / s.cd); }
  P.sh = Math.max(0, P.sh - dt); shield.visible = P.sh > 0; shield.material.opacity = 0.2 + Math.sin(P.t * 10) * 0.08;
  for (const w of [...waves]) {
    w.life -= dt; w.g.position.addScaledVector(w.v, dt); if (w.mat) w.mat.opacity = Math.min(1, w.life / 0.2) * 0.95;
    for (const e of [...enemies]) {
      if (!w.hit.has(e) && Math.hypot(e.g.position.x - w.g.position.x, e.g.position.z - w.g.position.z) < e.r + 1.3) { w.hit.add(e); hurtEnemy(e, w.dmg || 32, w.v.clone().normalize(), 12); }
    }
    if (w.life <= 0 || (state === 'play' && w.g.position.length() > R)) { scene.remove(w.g); if (w.mat) w.mat.dispose(); waves.splice(waves.indexOf(w), 1); }
  }
  for (const p of [...pulses]) {
    p.t -= dt; const k = 1 - p.t / p.dur;
    p.m.scale.setScalar(0.2 + p.max * k); p.m.material.opacity = 0.9 * (1 - k);
    if (p.t <= 0) { scene.remove(p.m); pulses.splice(pulses.indexOf(p), 1); }
  }
}

// ---------- Mode Android (kontrol layar sentuh) ----------
const stick = { x: 0, y: 0 }, st = $('stick'), kn = $('knob');
let sid = null;
function stickMove(e) {
  const r = st.getBoundingClientRect(), m = r.width / 2;
  let dx = e.clientX - (r.left + m), dy = e.clientY - (r.top + m); const l = Math.hypot(dx, dy);
  if (l > m) { dx *= m / l; dy *= m / l; }
  stick.x = dx / m; stick.y = dy / m; kn.style.transform = `translate(${dx}px,${dy}px)`;
}
st.addEventListener('pointerdown', e => { e.preventDefault(); sid = e.pointerId; st.setPointerCapture(sid); stickMove(e); });
st.addEventListener('pointermove', e => { if (e.pointerId === sid) stickMove(e); });
const stickEnd = e => { if (e.pointerId !== sid) return; sid = null; stick.x = stick.y = 0; kn.style.transform = ''; };
st.addEventListener('pointerup', stickEnd); st.addEventListener('pointercancel', stickEnd);

const ACT = { atk: () => attack(), roll: () => roll(), s1: () => skill('s1'), s2: () => skill('s2'), s3: () => skill('s3'), s4: () => skill('s4') };
document.querySelectorAll('#btns button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); ACT[b.dataset.a](); }));
$('talk').addEventListener('pointerdown', e => { e.preventDefault(); world.talk(); });
['top', 'btns', 'stick', 'settings', 'talk'].forEach(i => $(i).addEventListener('mousedown', e => e.stopPropagation()));
function setTouch(on) {
  document.body.classList.toggle('touch', on);
  document.querySelectorAll('#segmode button').forEach(b => b.classList.toggle('on', (b.dataset.mode === 'android') === on));
}

// ---------- Menu Pengaturan (kamera + mode kontrol jadi satu) ----------
let settingsOpen = false;
function openSettings(on) {
  settingsOpen = on; $('settings').hidden = !on;
  if (on && document.pointerLockElement) document.exitPointerLock(); // lepas kunci mouse agar bisa klik menu
  if (on) { stick.x = stick.y = 0; kn.style.transform = ''; sid = null; for (const k in keys) keys[k] = false; } // lepas joystick & tombol yang sedang ditahan
}
$('tset').onclick = () => openSettings(true);
$('sclose').onclick = () => openSettings(false);
// ---------- Pengaturan audio ----------
const volEl = $('vol'), volTxt = $('voltxt');
function syncAudioUI() {
  document.querySelectorAll('#segmusic button').forEach(b => b.classList.toggle('on', (b.dataset.music === 'on') === audio.music));
  volEl.value = Math.round(audio.volume * 100); volTxt.textContent = volEl.value + '%'; volEl.disabled = !audio.music;
}
document.querySelectorAll('#segmusic button').forEach(b => b.onclick = () => { audio.setMusic(b.dataset.music === 'on'); syncAudioUI(); });
volEl.addEventListener('input', () => { audio.setVolume(volEl.value / 100); volTxt.textContent = volEl.value + '%'; });
const sfxEl = $('sfxvol'), sfxTxt = $('sfxtxt');
sfxEl.value = Math.round(audio.sfxVolume * 100); sfxTxt.textContent = sfxEl.value + '%';
sfxEl.addEventListener('input', () => { audio.setSfxVolume(sfxEl.value / 100); sfxTxt.textContent = sfxEl.value + '%'; });
sfxEl.addEventListener('change', () => audio.sfx('sword')); // contoh suara saat slider dilepas
syncAudioUI();
$('settings').addEventListener('pointerdown', e => { if (e.target === $('settings')) openSettings(false); }); // ketuk area gelap = tutup
document.querySelectorAll('#segcam button').forEach(b => b.onclick = () => setCam(b.dataset.cam));
document.querySelectorAll('#segmode button').forEach(b => b.onclick = () => setTouch(b.dataset.mode === 'android'));
setTouch(matchMedia('(pointer:coarse)').matches); // otomatis aktif di HP/tablet

// ---------- Layar penuh ----------
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const canFS = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); // iPhone Safari tidak mendukung
function toggleFS() {
  if (!canFS) return;
  if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); try { screen.orientation.unlock(); } catch (e) {} return; }
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  Promise.resolve(req.call(el, { navigationUI: 'hide' })).then(() => {
    if (COARSE) try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} // di HP: kunci layar miring
  }).catch(() => {});
}
function syncFS() { $('sfs').textContent = fsEl() ? '⛶ Keluar Layar Penuh' : '⛶ Layar Penuh'; }
if (canFS) {
  $('tfs').onclick = toggleFS; $('sfs').onclick = toggleFS;
  document.addEventListener('fullscreenchange', syncFS); document.addEventListener('webkitfullscreenchange', syncFS);
} else { $('tfs').hidden = true; $('sfs').disabled = true; $('sfs').textContent = 'Tidak didukung di perangkat ini'; }

// ---------- Bos level 4: Naga (dragon.glb) ----------
// Model dari dragon_obj (OBJ + tekstur) yang sudah dikonversi ke dragon.glb: kaki di y=0, menghadap +z, tinggi ±7,9 unit.
let dragonGltf = null;
new GLTFLoader().load('dragon.glb', g => { dragonGltf = g; }, undefined, () => console.warn('dragon.glb gagal dimuat'));
// Rig naga: dragon.glb hanya satu mesh statis tanpa tulang, jadi kerangka dibuat saat runtime & bobot kulit dihitung dari posisi vertex.
// Tulang: 0 badan | 1 bahu kanan(+x) | 2 pergelangan kanan | 3 bahu kiri(-x) | 4 pergelangan kiri | 5 leher | 6 kepala
//         | 7 sayap kanan | 8 ujung sayap kanan | 9 sayap kiri | 10 ujung sayap kiri
//         | 11 pinggul kanan | 12 sendi kaki belakang kanan | 13 pinggul kiri | 14 sendi kaki belakang kiri | 15 ekor | 16 rahang bawah
const SH = { x: 0.9, y: 2.25, z: 1.0 }, WR = { x: 0.95, y: 1.2, z: 1.3 }; // sendi bahu & pergelangan kaki depan (ruang model)
const NK = { y: 3.9, z: 1.7 }, HD = { y: 4.9, z: 2.5 }; // pangkal leher & pangkal tengkorak
const WG = { x: 0.7, y: 4.3, z: -0.5 }, WT = { x: 2.3, y: 5.0 }; // pangkal sayap & sendi tengah sayap
const HP_ = { x: 0.95, y: 2.7, z: -1.7 }, HK = { x: 0.9, y: 1.0, z: -1.2 }, TL = { x: 1.3, y: 1.9, z: -2.6 }; // pinggul, sendi tungkai belakang, pangkal ekor
const JAW = { y: 5.15, z: 3.5 }, MOUTH = { y: 5.15, z: 4.25 }, JAW_OPEN = 0.65; // engsel rahang, titik mulut (ruang model), sudut buka maksimum (rad)
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function addDragonSkin(geo) { // sekali saja per geometri
  if (geo.getAttribute('skinIndex')) return;
  const p = geo.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x), side = x >= 0 ? 0 : 2;
    const ws = sstep(0.35, 0.65, ax) * (1 - sstep(1.35, 1.6, ax)) * sstep(0.2, 0.6, z) * (1 - sstep(2.1, 3.0, y)); // kaki depan
    const ww = ws * (1 - sstep(0.9, 1.5, y)); // bagian bawah kaki ikut pergelangan
    const wy = sstep(3.5, 4.1, y) + (sstep(1.7, 2.1, y) - sstep(3.5, 4.1, y)) * sstep(1.4, 2.0, ax);
    const W = sstep(0.5, 1.3, ax) * wy * (1 - sstep(1.5, 2.2, z) * (1 - sstep(0.9, 1.3, ax))); // sayap (bukan kepala)
    const Wt = W * sstep(1.8, 3.0, ax); // setengah luar sayap
    const hr = sstep(1.5, 1.9, z) * (1 - sstep(1.0, 1.4, ax)) * sstep(3.7, 4.2, y); // leher + kepala
    const hh = hr * sstep(4.5, 5.3, y) * sstep(2.1, 2.7, z), r = 1 - W;
    const hs = sstep(0.2, 0.55, ax) * (1 - sstep(1.45, 1.8, ax)) * (1 - sstep(-0.4, 0.2, z)) * (1 - sstep(2.5, 3.3, y)) * sstep(-4.0, -3.4, z); // paha belakang
    const hw = hs * (1 - sstep(1.0, 1.8, y)); // tungkai bawah belakang
    const tm = x > 0 ? (1 - sstep(-2.3, -1.9, z)) * sstep(0.9, 1.7, x) * (1 - sstep(0, 0.3, y - Math.max(1.4, Math.min(2.0, 2.7 - 1.3 * (x - 1.0))))) : 0; // ekor yang melingkar ke sisi +x
    const wj = sstep(3.3, 3.8, z) * (1 - sstep(5.12, 5.3, y)) * (1 - sstep(0.4, 0.65, ax)) * sstep(4.3, 4.6, y); // rahang bawah (dagu) -> tulang 16
    const e = [[1 + side, (ws - ww) * r], [2 + side, ww * r], [5, (hr - hh) * r], [6, hh * r], [7 + side, W - Wt], [8 + side, Wt], [11 + side, (hs - hw) * r], [12 + side, hw * r], [15, tm * r]].map(([bi, w]) => [bi, w * (1 - wj)]);
    e.push([16, wj]);
    e.push([0, Math.max(0, 1 - e.reduce((a, c) => a + c[1], 0))]);
    e.sort((a, c) => c[1] - a[1]); const top = e.slice(0, 4), tot = top.reduce((a, c) => a + c[1], 0) || 1;
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = top[k][0]; sw[i * 4 + k] = top[k][1] / tot; }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
}
function rigDragon(mesh) {
  addDragonSkin(mesh.geometry);
  const root = new THREE.Bone(), sh = [], wr = [], wi = [], wt = [], nk = new THREE.Bone(), hd = new THREE.Bone();
  nk.position.set(0, NK.y, NK.z); hd.position.set(0, HD.y - NK.y, HD.z - NK.z); nk.add(hd); root.add(nk);
  const hp = [], hk = [], tl = new THREE.Bone();
  const jw = new THREE.Bone(); jw.position.set(0, JAW.y - HD.y, JAW.z - HD.z); hd.add(jw); // engsel rahang bawah
  const mp = new THREE.Object3D(); mp.position.set(0, MOUTH.y - HD.y, MOUTH.z - HD.z); hd.add(mp); // titik keluar napas di mulut (ikut kepala)
  const cav = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: 0x3a0606 })); // bagian dalam mulut
  cav.position.set(0, 5.1 - HD.y, 3.6 - HD.z); cav.scale.setScalar(0.001); cav.visible = false; hd.add(cav);
  const mg = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); // cahaya pengisi napas
  mg.scale.setScalar(0.001); mg.visible = false; mp.add(mg);
  tl.position.set(TL.x, TL.y, TL.z); root.add(tl);
  for (const s of [1, -1]) {
    const a = new THREE.Bone(), b = new THREE.Bone(), c = new THREE.Bone(), d = new THREE.Bone();
    a.position.set(s * SH.x, SH.y, SH.z); b.position.set(s * (WR.x - SH.x), WR.y - SH.y, WR.z - SH.z);
    a.rotation.order = 'YXZ'; // angkat dulu (X), baru menyapu mendatar (Y)
    c.position.set(s * WG.x, WG.y, WG.z); d.position.set(s * (WT.x - WG.x), WT.y - WG.y, 0);
    a.add(b); c.add(d); root.add(a); root.add(c); sh.push(a); wr.push(b); wi.push(c); wt.push(d);
    const f = new THREE.Bone(), g = new THREE.Bone(); // tungkai belakang: pinggul -> sendi
    f.position.set(s * HP_.x, HP_.y, HP_.z); g.position.set(s * (HK.x - HP_.x), HK.y - HP_.y, HK.z - HP_.z); f.add(g); root.add(f); hp.push(f); hk.push(g);
  }
  const sm = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
  sm.castShadow = true; sm.frustumCulled = false; sm.add(root);
  sm.bind(new THREE.Skeleton([root, sh[0], wr[0], sh[1], wr[1], nk, hd, wi[0], wt[0], wi[1], wt[1], hp[0], hk[0], hp[1], hk[1], tl, jw]));
  const par = mesh.parent; par.add(sm); par.remove(mesh);
  return { sh, wr, wi, wt, nk, hd, hp, hk, tl, sm, jw, mp, cav, mg };
}
function mkDragon() {
  const g = new THREE.Group(), model = new THREE.Group(); g.add(model);
  let mat = new THREE.MeshStandardMaterial({ color: 0xb02030, roughness: 0.6 }), rig = null;
  if (dragonGltf) {
    const root = dragonGltf.scene.clone(true), meshes = [];
    root.traverse(o => { if (o.isMesh) { o.material = mat = o.material.clone(); o.castShadow = true; o.frustumCulled = false; meshes.push(o); } });
    model.add(root);
    if (meshes[0]) rig = rigDragon(meshes[0]);
  } else { const b = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 14), mat); b.position.y = 3; b.castShadow = true; model.add(b); } // cadangan jika file gagal dimuat
  const a = camMode === 'depan' ? rnd(-Math.PI * 0.9, -Math.PI * 0.1) : rnd(0, Math.PI * 2);
  g.position.set(Math.cos(a) * (R - 5), 0, Math.sin(a) * (R - 5)); g.rotation.y = Math.atan2(-g.position.x, -g.position.z); scene.add(g); // awalnya menghadap pusat arena
  const e = { g, model, mat, boss: true, dragon: true, hp: 420, max: 420, sp: 2.6, r: 2.4, cd: 1, wind: 0, flash: 0, kv: new THREE.Vector3(), stun: 0, orb: 2.5, slam: 7, ph: 0, bt: 0, st: 0, fired: false, rig, fa: 1, wp: 0, wk: 0, wv: 0, turn: 0, px: g.position.x, pz: g.position.z, claw: 2, cl: 0, h1: false, h2: false, roarT: 0.2, ro: 0, rx: 0, rw: 0 };
  enemies.push(e); return e;
}
// ---- Laser napas: keluar dari mulut, mengikuti pemain selama LASER_DUR detik (kecepatan putarnya terbatas, jadi masih bisa dihindari) ----
const LASER_DUR = 2.0;   // lama laser menyala (detik)
const LASER_SWEEP = 1.0; // total sudut sapuan laser ke samping (rad) selama LASER_DUR — laser TIDAK mengikuti pemain, hanya menyapu pelan ke satu sisi
// kecepatan sapuan = LASER_SWEEP / LASER_DUR (0,5 rad/detik) — makin besar LASER_SWEEP makin cepat & makin susah dihindari
const LASER_R = 0.8;     // lebar sengat laser terhadap badan pemain
const LASER_DMG = 10;    // damage per kena (pemain kebal sebentar setelah terkena, jadi bukan tiap frame)
const BREATH_T = { open: 0.4, fire: 0.5, end: 0.5 + LASER_DUR, done: 0.5 + LASER_DUR + 0.4 }; // jadwal semburan: buka mulut -> laser menyala -> laser mati -> mulut menutup
const Y_AXIS = new THREE.Vector3(0, 1, 0);
function dragonMouth(e, out) {
  if (e.rig) return e.rig.mp.getWorldPosition(out);
  return out.copy(e.g.position).addScaledVector(new THREE.Vector3(Math.sin(e.g.rotation.y), 0, Math.cos(e.g.rotation.y)), 3.4).setY(5.6);
}
function startLaser(e) {
  stopLaser(); audio.sfx('breath', { maxDur: 2.8 });
  const o = dragonMouth(e, new THREE.Vector3()), dir = player.position.clone().setY(1.1).sub(o).normalize();
  const side = e.ls || 1; // arah sapuan (dipilih acak saat aba-aba): kiri->kanan atau kanan->kiri
  dir.applyAxisAngle(Y_AXIS, -side * LASER_SWEEP / 2).normalize(); // mulai dari samping pemain (bukan tepat di pemain), lalu menyapu melewatinya
  const g = new THREE.Group(), mat = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = (r, c, op) => { const geo = new THREE.CylinderGeometry(r, r, 1, 14, 1, true); geo.translate(0, 0.5, 0); const m = new THREE.Mesh(geo, mat(c, op)); m.frustumCulled = false; g.add(m); return [m, op]; };
  const parts = [beam(0.12, 0xfff6d0, 1), beam(0.3, 0xffa030, 0.6), beam(0.62, 0xff4a10, 0.25)]; // inti putih -> tengah oranye -> selubung merah
  const mouthG = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 12), mat(0xffc060, 0.8)), hitG = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 12), mat(0xff7a20, 0.7)); // cahaya di mulut & di titik tumbukan
  g.add(mouthG, hitG); scene.add(g);
  laser = { e, g, parts, mouthG, hitG, dir, t: 0, o: new THREE.Vector3(), rate: side * LASER_SWEEP / LASER_DUR };
  shake = Math.max(shake, 0.25);
}
function stopLaser() {
  if (!laser) return;
  scene.remove(laser.g); laser.g.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); laser = null;
}
function updateLaser(dt) {
  const z = laser; if (!z) return;
  const e = z.e; z.t += dt;
  if (z.t >= LASER_DUR || e.dying || !enemies.includes(e)) { stopLaser(); return; }
  const o = dragonMouth(e, z.o);
  z.dir.applyAxisAngle(Y_AXIS, z.rate * dt).normalize(); // menyapu mendatar ke satu sisi dengan kecepatan tetap, tanpa auto-lock
  const L = z.dir.y < -0.05 ? Math.min(o.y / -z.dir.y, 60) : 60; // sampai menembus lantai
  const end = o.clone().addScaledVector(z.dir, L);
  const p = player.position.clone().setY(1.0), tt = Math.max(0, Math.min(L, p.clone().sub(o).dot(z.dir))); // titik terdekat pemain pada garis laser
  if (o.clone().addScaledVector(z.dir, tt).distanceTo(p) < LASER_R) hurtPlayer(LASER_DMG);
  const env = Math.min(1, z.t / 0.12) * Math.min(1, (LASER_DUR - z.t) / 0.2), pul = 1 + 0.15 * Math.sin(z.t * 60);
  z.g.position.copy(o); z.g.quaternion.setFromUnitVectors(Y_AXIS, z.dir);
  z.parts.forEach(([m, op]) => { m.scale.set(env * pul, L, env * pul); m.material.opacity = op * env; });
  z.mouthG.scale.setScalar(env * (0.9 + 0.2 * Math.sin(z.t * 45))); z.hitG.position.set(0, L, 0); z.hitG.scale.setScalar(env * (0.9 + 0.25 * Math.sin(z.t * 52 + 1)));
  if (Math.random() < 0.8) burst(end.clone().setY(0.15), Math.random() < 0.5 ? 0xffa040 : 0xffe0a0, 3, 6); // percikan api di lantai
  shake = Math.max(shake, 0.12 * env);
}
// ---- Hantaman naga: bola api raksasa seukuran area hantaman (muncul & membesar), disusul ledakan + gelombang kejut ----
const BLAST_GROW = 0.45, BLAST_BOOM = 0.6; // lama bola api membesar, lama ledakan memudar (detik)
const BLAST_REACH = 1.15; // jangkauan damage ledakan = radius area hantaman x angka ini
const pillarGeo = new THREE.CylinderGeometry(0.35, 1, 1, 12, 1, true); pillarGeo.translate(0, 0.5, 0); // tiang api: lancip ke atas, dasar di y=0
function mkPillar(g, x, z, r, h, delay) {
  const am = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const outer = new THREE.Mesh(pillarGeo, am(0xff5a10, 0.8)), inner = new THREE.Mesh(pillarGeo, am(0xffe090, 0.9));
  outer.frustumCulled = inner.frustumCulled = false; outer.visible = inner.visible = false; outer.position.set(x, 0, z); inner.position.set(x, 0, z); g.add(outer, inner);
  return { outer, inner, r, h, delay };
}
function spawnBlast(pos, rad, dmg, kind) {
  const am = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), am(0xff6a18, 0.9)), core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), am(0xffe8a0, 0.95));
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), am(0xffc070, 0.8)); wave.rotation.x = -Math.PI / 2; wave.visible = false;
  const g = new THREE.Group(); g.position.set(pos.x, 0, pos.z); g.add(ball, core, wave); scene.add(g);
  const pl = [mkPillar(g, 0, 0, rad * 0.32, 20, 0)]; // kolom api utama di tengah
  for (let i = 0; i < 12; i++) { const a = Math.random() * Math.PI * 2, d = rad * (0.25 + 0.7 * Math.random()); pl.push(mkPillar(g, Math.cos(a) * d, Math.sin(a) * d, rnd(0.55, 1.2), rnd(7, 14), Math.random() * 0.3)); } // semburan api di sekitarnya
  blasts.push({ g, ball, core, wave, rad, dmg, pl, kind, t: 0, boom: false });
  shake = Math.max(shake, 0.5); burst(new THREE.Vector3(pos.x, 0.3, pos.z), 0xff8a30, 30, 8);
}
function clearBlasts() { for (const b of blasts) scene.remove(b.g); blasts.length = 0; }
function updateBlasts(dt) {
  for (const b of [...blasts]) {
    b.t += dt; const t = b.t;
    if (t < BLAST_GROW) { // fase 1: bola api membengkak sampai selebar area hantaman
      const k = 1 - Math.pow(1 - t / BLAST_GROW, 3), s = b.rad * (0.12 + 0.88 * k) * (1 + 0.03 * Math.sin(t * 70));
      b.ball.scale.setScalar(s); b.ball.position.y = s * 0.3; b.core.scale.setScalar(s * 0.62); b.core.position.y = s * 0.3;
    } else { // fase 2: meledak — bola api melebar & memudar, gelombang kejut menyapu keluar
      if (!b.boom) {
        b.boom = true; b.wave.visible = true; shake = Math.max(shake, 1.1);
        audio.sfx(b.kind === 'dragon' ? 'explosion' : 'fireball'); // ledakan naga = explosion; semburan api dari bawah penyihir = fire_ball
        if (Math.hypot(player.position.x - b.g.position.x, player.position.z - b.g.position.z) < b.rad * BLAST_REACH) hurtPlayer(b.dmg); // ledakan melukai siapa pun di dalam jangkauannya (berguling = kebal)
        const c = new THREE.Vector3(b.g.position.x, 1.2, b.g.position.z); burst(c, 0xffe0a0, 45, 15); burst(c, 0xff5018, 40, 10); burst(c, 0xffffff, 20, 18);
        for (let i = 0; i < 70; i++) { // bara api melambung tinggi lalu jatuh
          const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xff8a30 : 0xffd070, transparent: true })); m.scale.setScalar(rnd(1.2, 3));
          const a = Math.random() * Math.PI * 2, d = Math.random() * b.rad * 0.9; m.position.set(b.g.position.x + Math.cos(a) * d, 0.3, b.g.position.z + Math.sin(a) * d);
          fx.push({ m, v: new THREE.Vector3(rnd(-2, 2), rnd(10, 22), rnd(-2, 2)), life: rnd(0.9, 1.6), max: 1.6 }); scene.add(m);
        }
      }
      for (const p of b.pl) { // tiang api menyembur ke atas, lalu memudar
        const tt = t - BLAST_GROW - p.delay; p.outer.visible = p.inner.visible = tt >= 0 && tt < 0.75; if (!p.outer.visible) continue;
        const k = 1 - Math.pow(1 - clamp01(tt / 0.22), 3), f = clamp01((tt - 0.25) / 0.5), w = p.r * (1 + 0.35 * f) * (1 + 0.08 * Math.sin(tt * 60)), hh = p.h * (0.15 + 0.85 * k) * (1 + 0.12 * f);
        p.outer.scale.set(w, hh, w); p.inner.scale.set(w * 0.5, hh * 0.92, w * 0.5); p.outer.material.opacity = 0.8 * (1 - f); p.inner.material.opacity = 0.9 * (1 - f);
      }
      const u = clamp01((t - BLAST_GROW) / BLAST_BOOM), s = b.rad * (1 + 0.4 * u);
      b.ball.scale.setScalar(s); b.ball.position.y = s * 0.3; b.ball.material.opacity = 0.9 * (1 - u);
      b.core.scale.setScalar(b.rad * 0.62 * (1 + 0.8 * u)); b.core.position.y = s * 0.3; b.core.material.opacity = 0.95 * (1 - u) * (1 - u);
      b.wave.scale.setScalar(b.rad * (0.9 + 1.1 * u)); b.wave.position.y = 0.12; b.wave.material.opacity = 0.8 * (1 - u);
      if (t > BLAST_GROW + 1.1) { scene.remove(b.g); b.g.traverse(o => { if (o.isMesh) { o.material.dispose(); if (o.geometry !== pillarGeo) o.geometry.dispose(); } }); blasts.splice(blasts.indexOf(b), 1); }
    }
  }
}
// ---- Serangan cakar ganda: kaki kanan lalu kiri; tiap kaki: angkat -> tahan (aba-aba) -> tebas diagonal -> kembali ----
const CLAW_T = 1.8, CLAW_B = 0.55; // durasi total & jeda mulai lengan kedua
const easeIO = t => t * t * (3 - 2 * t);
function clawArm(u) { // u = detik sejak lengan mulai -> [L angkat 0..1, S sapuan 0..1]
  if (u <= 0 || u >= 1.25) return [0, 0];
  if (u < 0.5) return [easeIO(u / 0.5), 0];
  if (u < 0.6) return [1, 0];
  if (u < 0.76) { const k = (u - 0.6) / 0.16, q = k * k; return [1 - 0.85 * q, q]; } // tebasan cepat (ease-in)
  const k = easeIO((u - 0.76) / 0.49); return [0.15 * (1 - k), 1 - k];
}
function clawMark(e, d, side) { // tiga garis cakaran menyala di udara, searah tebasan
  const g = new THREE.BufferGeometry(), pos = [], idx = [], N = 10;
  for (const off of [-0.45, 0, 0.45]) for (let i = 0; i <= N; i++) {
    const t = i / N, w = 0.09 * Math.sin(Math.PI * t) + 0.005;
    const x = side * (1.7 - 2.5 * t) + off, y = 3.0 - 2.4 * t;
    pos.push(x - w * 0.4, y + w, 0, x + w * 0.4, y - w, 0);
    if (i < N) { const b = pos.length / 3 - 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff8a40, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.copy(e.g.position).addScaledVector(d, 3.4).setY(0.6); m.rotation.y = e.g.rotation.y; scene.add(m);
  fx.push({ m, v: new THREE.Vector3(), life: 0.35, max: 0.35, slash: true });
}
function clawHit(e, d, dist, side) {
  clawMark(e, d, side); shake = Math.max(shake, 0.35);
  burst(e.g.position.clone().addScaledVector(d, 3.2).setY(0.8), 0xffd9a0, 14, 7);
  if (dist < 5.6) hurtPlayer(24); // jangkauan cakar dari pusat naga
}
function dragonClaw(e, d, dist, dt) { // dipanggil tiap frame selama e.cl > 0; mengembalikan {pitch, bob, glow, twist}
  e.cl += dt; const t = e.cl, rg = e.rig;
  const a = clawArm(t), b = clawArm(t - CLAW_B); // a: kaki kanan (+x), b: kaki kiri (-x)
  if (rg) [[0, 1, a], [1, -1, b]].forEach(([i, s, [L, S]]) => {
    rg.sh[i].rotation.set(-1.05 * L, s * (0.45 * L - 0.8 * S), 0); rg.wr[i].rotation.x = -0.15 * L + 0.55 * S;
  });
  if (!e.h1 && t >= 0.68) { e.h1 = true; clawHit(e, d, dist, 1); }
  if (!e.h2 && t >= 0.68 + CLAW_B) { e.h2 = true; clawHit(e, d, dist, -1); }
  if (t < 0.6 && dist > 4.4) e.g.position.addScaledVector(d, 4.5 * dt); // melompat maju mendekati pemain saat aba-aba
  const rear = easeIO(clamp01(t / 0.5)) * (1 - easeIO(clamp01((t - 0.68) / 0.3))) + 0.7 * easeIO(clamp01((t - CLAW_B) / 0.5)) * (1 - easeIO(clamp01((t - 0.68 - CLAW_B) / 0.3)));
  const out = { pitch: -0.3 * Math.min(1, rear) + 0.06 * Math.max(0, 1 - Math.abs(t - 0.75) / 0.2), bob: 0.3 * Math.min(1, rear), glow: t < 0.6 ? t / 0.6 : t < 0.68 + CLAW_B ? 0.6 : 0, twist: 0.12 * (b[1] - a[1]) };
  if (t >= CLAW_T) { e.cl = 0; if (rg) { rg.sh.forEach(x => x.rotation.set(0, 0, 0)); rg.wr.forEach(x => x.rotation.set(0, 0, 0)); } }
  return out;
}
// ---- Kepala & sayap: gerak idle (napas, menoleh, kepak) + reaksi tiap serangan ----
function kf(t, k) { // interpolasi keyframe [[waktu, nilai], ...] dengan easing
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t < k[i][0]) { const u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * easeIO(u); }
  return k[k.length - 1][1];
}
function dragonLife(e, dt, d) {
  const rg = e.rig; if (!rg) return;
  // kecepatan maju(+)/mundur(-) sebenarnya, dihaluskan; fase langkah maju sebanding jarak tempuh agar telapak tidak 'meluncur'
  const v = ((e.g.position.x - e.px) * d.x + (e.g.position.z - e.pz) * d.z) / Math.max(dt, 1e-3); e.px = e.g.position.x; e.pz = e.g.position.z;
  e.wv += (Math.max(-4, Math.min(4, v)) - e.wv) * (1 - Math.exp(-dt * 10));
  const tn = Math.abs(e.turn), pv = e.wv < -0.3 ? e.wv : e.wv + tn * 1.1; // sambil berbelok kaki tetap melangkah
  e.wk += (clamp01(Math.max(Math.abs(e.wv) / 1.2, tn / 1.5)) - e.wk) * (1 - Math.exp(-dt * 6));
  e.wp += pv * 1.4 * dt;
  const wk = e.wk, wp = e.wp, moving = wk > 0.3;
  for (let i = 0; i < 2; i++) { // jalan diagonal: kaki depan kanan + belakang kiri melangkah bersamaan
    const pf = wp + (i ? Math.PI : 0), ph2 = wp + (i ? 0 : Math.PI);
    if (e.cl <= 0) { rg.sh[i].rotation.set(-0.36 * Math.sin(pf) * wk, 0, 0); rg.wr[i].rotation.set(-0.55 * Math.max(0, Math.cos(pf)) * wk, 0, 0); } // saat mencakar, kaki depan diatur dragonClaw
    rg.hp[i].rotation.set(-0.28 * Math.sin(ph2) * wk, 0, 0); rg.hk[i].rotation.set(-0.6 * Math.max(0, Math.cos(ph2)) * wk, 0, 0);
  }
  rg.tl.rotation.set(0, 0.2 * Math.sin(wp - 0.8) * wk + 0.07 * Math.sin(e.ph * 0.8), 0.05 * Math.sin(2 * wp) * wk);
  let hp = 0, wo = 0, busy = false; // hp: kepala menengadah(-)/menunduk(+), wo: sayap terangkat(+)/menghentak turun(-)
  if (e.cl > 0) { // cakar: mendongak saat aba-aba, menyentak ke bawah tiap tebasan; sayap mengembang lalu menghentak
    const t = e.cl; busy = true;
    hp = kf(t, [[0, 0], [0.5, -0.5], [0.6, -0.5], [0.76, 0.6], [1.1, 0.05], [1.15, 0.05], [1.31, 0.55], [1.8, 0]]);
    wo = kf(t, [[0, 0], [0.5, 0.32], [0.6, 0.32], [0.78, -0.22], [1.1, 0.2], [1.15, 0.2], [1.33, -0.2], [1.8, 0]]);
  } else if (e.bt > 0) { // semburan laser: kepala mendongak, lalu menunduk membidik pemain selama laser menyala; sayap mengembang
    const t = e.bt; busy = true;
    hp = kf(t, [[0, 0], [0.5, -0.6], [0.65, 0.4], [BREATH_T.end, 0.4], [BREATH_T.done, 0]]);
    wo = kf(t, [[0, 0], [0.5, 0.38], [0.65, 0.12], [BREATH_T.end, 0.12], [BREATH_T.done, 0]]);
  } else if (e.st > 0) { // hentakan: berdiri tegak, sayap terentang lebar lalu menghantam turun
    const t = e.st; busy = true;
    hp = kf(t, [[0, 0], [1.2, -0.45], [1.32, 0.55], [1.7, 0]]);
    wo = kf(t, [[0, 0], [1.2, 0.5], [1.32, -0.4], [1.7, 0]]);
  }
  const rx = e.rx || 0; wo += 0.3 * rx; // sayap mengembang saat meraung
  e.fa += ((busy ? 0.25 : 1 + 0.7 * wk) - e.fa) * (1 - Math.exp(-dt * 4)); // kepakan lebih kuat saat berjalan, tenang saat menyerang
  const ph = e.ph, f1 = Math.sin(ph * 2.4), f2 = Math.sin(ph * 2.4 - 1.0); // ujung sayap tertinggal sedikit
  [1, -1].forEach((s, i) => { rg.wi[i].rotation.z = s * (wo + 0.11 * f1 * e.fa); rg.wt[i].rotation.z = s * (wo * 0.6 + 0.2 * f2 * e.fa); });
  const k = busy ? 0.4 : 1; // saat menyerang, gerak santai dikurangi
  rg.nk.rotation.set(hp * 0.55 + 0.04 * Math.sin(ph * 1.6 + 0.5) * k + 0.03 * Math.sin(2 * wp + 1.6) * wk * k, 0.1 * Math.sin(ph * 0.7) * k, 0);
  rg.hd.rotation.set(hp * 0.45 + 0.05 * Math.sin(ph * 1.6 + 1.0) * k, 0.14 * Math.sin(ph * 0.9 + 1.3) * k, 0);
  rg.nk.position.set(0, NK.y - 0.15 * rx, NK.z + 0.55 * rx); rg.hd.position.set(0, HD.y - NK.y, HD.z - NK.z + 1.0 * rx); // leher menjulur ke depan (kepala maju relatif ke leher)
  rg.nk.rotation.x += 0.42 * rx; rg.hd.rotation.x -= 0.55 * rx; rg.hd.rotation.y += 0.05 * Math.sin(e.ph * 22) * rx; // leher condong ke depan, kepala mendongak, bergetar saat meraung
  const mo = Math.max(e.mo || 0, 0.95 * rx), ch = e.charge || 0; // rahang bawah turun saat mulut terbuka (bergetar sedikit saat laser menyala)
  rg.jw.rotation.x = JAW_OPEN * mo + (e.bt > BREATH_T.fire && e.bt < BREATH_T.end ? 0.04 * Math.sin(e.ph * 55) : 0) + 0.05 * Math.sin(e.ph * 32) * rx;
  rg.cav.visible = mo > 0.03; rg.cav.scale.set(0.3 * mo + 0.001, 0.28 * mo + 0.001, 0.75);
  rg.mg.visible = ch > 0.02; rg.mg.scale.setScalar(0.15 + 0.85 * ch * (1 + 0.12 * Math.sin(e.ph * 40)));
}
const ROAR_T = 3.2; // lama animasi raungan (detik); file raungan ±3,4 dtk
function dragonAI(e, d, dist, dt) {
  // ---- Raungan tiap 5 detik: leher menjulur ke depan, kepala mendongak, mulut terbuka lebar, sayap mengembang ----
  const atkNow = e.bt > 0 || e.st > 0 || e.cl > 0;
  if (e.ro > 0) { e.ro += dt; if (e.ro >= ROAR_T) e.ro = 0; }
  if ((e.roarT -= dt) <= 0 && !atkNow) { e.roarT = 5; e.ro = 0.001; audio.sfx('roar'); } // jika sedang menyerang, raungan menunggu sampai selesai
  e.rw += (((e.ro > 0 && !atkNow) ? 1 : 0) - e.rw) * (1 - Math.exp(-dt * (e.ro > 0 && !atkNow ? 14 : 9))); // serangan memotong animasi raungan dengan halus
  e.rx = e.rw * kf(e.ro, [[0, 0], [0.5, 1], [ROAR_T - 0.6, 1], [ROAR_T, 0]]);
  e.ph += dt; const m = e.model, busy = e.bt > 0 || e.st > 0;
  const busy2 = busy || e.cl > 0, keep = e.stun > 0 || busy2 ? 0 : dist > 9 ? 1 : dist < 5.5 ? -1 : 0; // menjaga jarak 5.5-9
  e.g.position.addScaledVector(d, keep * e.sp * dt);
  if (!busy2 && e.stun <= 0) {
    e.claw -= dt;
    if (e.claw <= 0 && dist < 6.6) { e.claw = 4.5; e.cl = 0.001; e.h1 = e.h2 = false; } // pemain terlalu dekat -> dicakar
    else if ((e.orb -= dt) <= 0) { e.orb = 4.2; e.bt = 0.001; e.fired = false; e.ls = Math.random() < 0.5 ? -1 : 1; }
    else if ((e.slam -= dt) <= 0) { // hentakan: lingkaran peringatan di posisi pemain, naga menegakkan badan lalu menghantam
      e.slam = 8; e.st = 0.001;
      const rm = new THREE.Mesh(new THREE.RingGeometry(0.1, 6.8, 48), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      rm.rotation.x = -Math.PI / 2; rm.position.copy(player.position).setY(0.05); scene.add(rm); rings.push({ m: rm, t: 1.32, rad: 6.9, dmg: 30, big: true, kind: 'dragon' }); // t = saat kaki menghantam tanah
    }
  }
  let pitch = Math.sin(e.ph * 1.6) * 0.02 - 0.08 * e.rx, bob = Math.sin(e.ph * 1.6) * 0.06, glow = 0; // saat meraung badan sedikit condong ke belakang
  let twist = 0;
  if (e.cl > 0) { const c = dragonClaw(e, d, dist, dt); pitch = c.pitch; bob = c.bob; glow = c.glow; twist = c.twist; }
  else if (e.bt > 0) { // semburan laser: menengadah (0-0,5 dtk, mulut membuka & cahaya terkumpul) -> menunduk & laser menyala 2 dtk -> mulut menutup
    e.bt += dt; const t = e.bt;
    pitch = t < 0.5 ? -0.3 * (t / 0.5) : t < BREATH_T.end ? -0.3 + 0.42 * clamp01((t - 0.5) / 0.15) : 0.12 * (1 - clamp01((t - BREATH_T.end) / 0.4));
    glow = t < 0.5 ? t / 0.5 : 0;
    e.mo = kf(t, [[0, 0], [BREATH_T.open, 1], [BREATH_T.end, 1], [BREATH_T.done, 0]]); // seberapa terbuka mulutnya (0-1)
    e.charge = t < BREATH_T.fire ? t / BREATH_T.fire : t < BREATH_T.end ? 1 : Math.max(0, 1 - (t - BREATH_T.end) / 0.25);
    if (!e.fired && t >= BREATH_T.fire) { e.fired = true; startLaser(e); }
    if (t >= BREATH_T.done) { e.bt = 0; e.mo = 0; e.charge = 0; e.rec = 1.2; stopLaser(); }
  } else if (e.st > 0) { // hentakan: menegakkan badan (0-1,2 dtk) lalu menghantam ke depan
    e.st += dt; const t = e.st;
    pitch = t < 1.2 ? -0.45 * (t / 1.2) : -0.45 + 0.65 * clamp01((t - 1.2) / 0.12) - 0.2 * clamp01((t - 1.35) / 0.3);
    bob = t < 1.2 ? 0.5 * (t / 1.2) : 0; glow = t < 1.3 ? t / 1.3 : 0;
    if (t >= 1.7) e.st = 0;
  }
  const wk = e.wk, wp = e.wp; // gerak badan mengikuti siklus langkah: naik-turun tiap tapak, miring & memuntir bergantian
  if (e.cl <= 0 && !(e.bt > 0) && !(e.st > 0)) { pitch += 0.022 * Math.sin(2 * wp + 1.2) * wk; bob += 0.05 * (1 + Math.cos(2 * wp)) * wk; twist += 0.05 * Math.sin(wp) * wk; }
  const roll = 0.035 * Math.cos(wp) * wk;
  m.rotation.z += (roll - m.rotation.z) * (1 - Math.exp(-dt * 12));
  m.rotation.y += (twist - m.rotation.y) * (1 - Math.exp(-dt * 18)); m.rotation.x += (pitch - m.rotation.x) * (1 - Math.exp(-dt * 18)); m.position.y += (bob - m.position.y) * (1 - Math.exp(-dt * 18));
  dragonLife(e, dt, d);
  if (laser && laser.e === e) updateLaser(dt); // setelah pose kepala diperbarui, supaya laser keluar tepat dari mulut
  if (e.flash <= 0 && glow > 0) e.mat.emissive.setRGB(0.5 * glow, 0.12 * glow, 0.02 * glow); // memerah saat bersiap menyerang
}

// ---------- Alur permainan ----------
const WAVES = [2, 4, 'boss', 'dragon']; // level 1-2: musuh biasa, level 3: bos penyihir, level 4: bos naga
let state = 'load', wave = 0, shake = 0, next = 0, camMode = 'orbit';
syncCam(); document.body.classList.add('orbit'); toast(matchMedia('(pointer:coarse)').matches ? 'Geser layar 1 jari: kiri-kanan memutar, atas-bawah menaik-turunkan kamera' : 'Klik layar untuk mengunci mouse, lalu gerakkan mouse: kiri-kanan memutar, atas-bawah menaik-turunkan kamera (Esc = lepas)', 5000);
function spawnWave() {
  const w = WAVES[wave];
  const bn = $('boss').querySelector('span');
  if (w === 'boss') { mkEnemy(true); bn.textContent = 'Malzareth, Penyihir Kegelapan'; $('boss').hidden = false; $('wave').textContent = `Level ${wave + 1} / ${WAVES.length} — Bos`; }
  else if (w === 'dragon') { mkDragon(); bn.textContent = 'Vyrmgar, Naga Api Merah'; $('boss').hidden = false; $('wave').textContent = 'Level 4 — Pertarungan Terakhir'; }
  else { $('boss').hidden = true; for (let i = 0; i < w; i++) mkEnemy(false); $('wave').textContent = `Level ${wave + 1} / ${WAVES.length}`; }
}
function banner(t, ms = 1800) { $('msg').textContent = t; setTimeout(() => { if (state === 'play') $('msg').textContent = ''; }, ms); }
// ---------- Dunia luar -> lubang -> dungeon ----------
const F = { t: 0 }, FALL_TOTAL = 1.3;
function enterWorld(fromHole = false, note = null) { // mulai game di dataran hijau (fromHole: muncul di tepi lubang setelah keluar dungeon)
  state = 'world'; arenaG.visible = false; world.group.visible = true; audio.setScene('world');
  scene.background.set(SKY_COLOR); scene.fog = worldFog;
  const sp = fromHole ? { x: 1.6, z: 6.0 } : SPAWN;
  player.position.set(sp.x, 0, sp.z); player.rotation.set(0, 0, 0); if (vrm) vrm.scene.rotation.x = 0;
  P.face = fromHole ? Math.atan2(sp.x, sp.z) : Math.atan2(-SPAWN.x, -SPAWN.z); player.rotation.y = P.face; P.v.set(0, 0, 0);
  camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 9, 4.2, sp.z - Math.cos(P.face) * 9);
  $('boss').hidden = true; $('wave').textContent = '🌿 Dataran Hijau'; $('obj').hidden = false;
  inVillage = false; inForest = false; inDeepForest = false; nearAncientGate = false; inCity = false; inChurch = false; churchBusy = false; world.church.show(false); worldFog.density = FOG_DENSITY;
  $('msg').textContent = note || (fromHole ? 'Kembali ke Dataran Hijau' : 'Dataran Hijau\nCari lubang menuju dungeon\n🏘️ ' + VILLAGE.name + ' ada di sebelah timur\n🌲 ' + FOREST.name + ' ada di timur desa');
  wildT = 1; calmT = 0;
  setTimeout(() => { if (state === 'world') $('msg').textContent = ''; }, 3500);
  const f = $('fade'); f.style.transition = 'opacity .9s'; f.style.opacity = 0;
}
let inVillage = false, inForest = false, inDeepForest = false, nearAncientGate = false, inCity = false, inChurch = false, churchBusy = false;
// Masuk / keluar Katedral Arunika: layar memudar, pemain dipindah ke ruang dalam (church.js) atau kembali ke alun-alun
function churchGo(inside) {
  churchBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0);
  const f = $('fade'); f.style.transition = 'opacity .35s'; f.style.opacity = 1;
  setTimeout(() => {
    if (state !== 'world') { churchBusy = false; return; }
    const sp = inside ? CHURCH.inSpawn : CHURCH.outSpawn;
    inChurch = inside; world.church.show(inside);
    player.position.set(sp.x, 0, sp.z); P.face = sp.face; player.rotation.y = P.face; P.v.set(0, 0, 0);
    camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 6, 4, sp.z - Math.cos(P.face) * 6);
    const m = inside ? '⛪ ' + CHURCH.name + '\nMelangkahlah ke pintu untuk keluar' : '🏙️ ' + CITY.name; $('msg').textContent = m;
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3000);
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    setTimeout(() => { churchBusy = false; }, 700);
  }, 380);
}
let secretFound = false; try { secretFound = !!JSON.parse(localStorage.getItem(SECRET_QUEST.storageKey) || '{}').found; } catch (e) { /* abaikan */ }
function worldTick() {
  const px = player.position.x, pz = player.position.z;
  const vd = Math.hypot(px - VILLAGE.x, pz - VILLAGE.z); // masuk / keluar Desa Padang Hijau
  if (!inVillage && vd < VILLAGE.radius - 3) {
    inVillage = true; const m = '🏘️ ' + VILLAGE.name + '\nDekati warga lalu tekan tombol Mengobrol'; $('msg').textContent = m;
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3000);
  } else if (inVillage && vd > VILLAGE.radius + 2) inVillage = false;
  // masuk / keluar Hutan Besar: pesan + kabut makin tebal di dalam hutan (peralihan halus)
  const fa = world.forestAmount(px, pz);
  worldFog.density += (FOG_DENSITY * (1 + 0.5 * fa) - worldFog.density) * 0.05;
  if (!inForest && fa > 0.5) {
    inForest = true; const m = '🌲 ' + FOREST.name + '\nIkuti jalan setapak, atau jelajahi bebas\n⚠️ Waspada slime & goblin liar'; $('msg').textContent = m; wildT = 0.4; for (let i = 0; i < 2; i++) trySpawnWild();
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3000);
  } else if (inForest && fa < 0.15) inForest = false;
  // Hutan Dalam (perpanjangan ke timur) & Gerbang Batu Kuno di ujung jalan
  const say = m => { $('msg').textContent = m; setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3200); };
  if (!inDeepForest && px > 172 && fa > 0.5) { inDeepForest = true; say('🌲 Hutan Dalam\nJalan setapak masih panjang ke timur...'); }
  else if (inDeepForest && (px < 160 || fa < 0.15)) inDeepForest = false;
  const gd = Math.hypot(px - ANCIENT_GATE.x, pz - ANCIENT_GATE.z);
  if (!nearAncientGate && gd < 16) { nearAncientGate = true; say(CITY.open ? '🗿 Gerbang Batu Kuno\nTerbuka. ' + CITY.name + ' menunggu di timur...' : '🗿 Gerbang Batu Kuno\nTersegel. Belum ada yang bisa membukanya...'); }
  else if (nearAncientGate && gd > 22) nearAncientGate = false;
  const cd = cityDist(px, pz); // masuk / keluar Kota Arunika (negatif = di dalam kota)
  if (CITY.open && !inCity && cd < -8) { inCity = true; say('🏙️ ' + CITY.name + '\nKota di ujung timur Hutan Besar'); }
  else if (inCity && cd > -2) inCity = false;
  if (CITY.open && !churchBusy) { // pintu katedral (luar) & pintu keluar (dalam)
    if (!inChurch && Math.hypot(px - CHURCH.door.x, pz - CHURCH.door.z) < CHURCH.door.r) churchGo(true);
    else if (inChurch && Math.hypot(px - CHURCH.exit.x, pz - CHURCH.exit.z) < CHURCH.exit.r) churchGo(false);
  }
  if (!secretFound && Math.hypot(px - SECRET_GLADE.x, pz - SECRET_GLADE.z) < SECRET_GLADE.r + 3) { // pertama kali menemukan tempat rahasia (tersimpan di perangkat)
    secretFound = true; try { localStorage.setItem(SECRET_QUEST.storageKey, JSON.stringify({ found: true })); } catch (e) { /* abaikan */ }
    say('✨ Tempat Tersembunyi\nSesuatu menunggu di tengah lingkaran batu...'); }
  const fw = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) }, rt = { x: Math.cos(camYaw), z: -Math.sin(camYaw) }; // arah depan & kanan kamera
  $('objA').style.transform = `rotate(${Math.atan2(-px * rt.x - pz * rt.z, -px * fw.x - pz * fw.z)}rad)`;
  $('objD').textContent = Math.max(0, Math.round(Math.hypot(px, pz) - HOLE_R)) + ' m';
  if (Math.hypot(px, pz) < HOLE_R - 0.4) startFall();
}
function startFall() { // melangkah ke lubang -> jatuh
  clearWild(); audio.setScene(null); state = 'fall'; F.t = 0; stick.x = stick.y = 0; P.v.set(0, 0, 0); $('msg').textContent = ''; $('obj').hidden = true;
  $('fade').style.transition = 'none';
}
function fallTick(dt) {
  F.t += dt;
  const k = Math.min(1, dt * 5);
  player.position.x -= player.position.x * k; player.position.z -= player.position.z * k; // tertarik ke tengah lubang
  const g = Math.max(0, F.t - 0.12); player.position.y = -0.5 * 26 * g * g;
  if (vrm) vrm.scene.rotation.x = Math.min(0.9, F.t * 1.6); // badan condong saat jatuh
  $('fade').style.opacity = clamp01((F.t - 0.55) / 0.6);
  if (F.t >= FALL_TOTAL) enterDungeon();
}
function enterDungeon() { // mendarat di arena dungeon
  audio.setScene('dungeon');
  world.group.visible = false; arenaG.visible = true;
  scene.background.set(0x07060a); scene.fog = arenaFog;
  player.position.set(0, 0, 0); player.rotation.set(0, 0, 0); P.face = 0; if (vrm) vrm.scene.rotation.x = 0;
  camYaw = 0; cam.position.set(0, 6, 13);
  begin(); shake = 0.6; burst(player.position.clone().setY(0.2), 0xb8b8c8, 22, 4);
  const f = $('fade'); f.style.transition = 'opacity .9s'; f.style.opacity = 0;
}

function exitDungeon() { // menang -> naik keluar dungeon ke dataran hijau
  if (!canAgain) return;
  canAgain = false; $('again').hidden = true; $('exit').hidden = true; $('msg').textContent = '';
  const f = $('fade'); f.style.transition = 'opacity .6s'; f.style.opacity = 1;
  setTimeout(() => restart(true), 650);
}
$('exit').onclick = exitDungeon;

function begin() { state = 'play'; banner('Arena Terbuka!\nKalahkan semua musuh'); spawnWave(); }
const againHint = () => document.body.classList.contains('touch') ? 'Ketuk tombol di bawah untuk main lagi' : 'Klik atau tekan R untuk main lagi';
function showAgain() { canAgain = true; $('again').hidden = false; $('exit').hidden = state !== 'win'; $('msg').textContent += '\n\n' + againHint(); }
function end(win) {
  loseInWorld = !win && state === 'world'; // kalah di hutan -> bangun lagi di dunia luar, bukan masuk dungeon
  stopLaser(); clearBlasts(); state = win ? 'win' : 'lose'; canAgain = false; $('again').hidden = true; $('exit').hidden = true;
  if (win) { $('msg').textContent = 'KEMENANGAN!\nVillain telah dikalahkan'; setTimeout(() => { if (state === 'win') showAgain(); }, 900); }
  else { $('msg').textContent = ''; startDefeat(); }
}
function restart(toWorld = false) {
  resetDefeat(); slow.t = 0; stopLaser(); clearBlasts(); endVS(); endSL(); endSM(true); endBF();
  [...enemies].forEach(e => scene.remove(e.g)); enemies.length = 0;
  [...orbs, ...rings].forEach(o => scene.remove(o.m)); orbs.length = 0; rings.length = 0;
  Object.assign(P, { hp: P.max, atk: 0, combo: 0, cross: false, jy: 0, roll: 0, inv: 0, sh: 0, drawT: 0, runT: 0, heavy: 0.3 });
  Object.values(SK).forEach(s => s.t = 0); waves.forEach(w => scene.remove(w.g)); waves.length = 0; player.position.set(0, 0, 0); P.v.set(0, 0, 0);
  wave = 0; next = 0; $('boss').hidden = true; $('exit').hidden = true;
  if (toWorld || loseInWorld) { const lost = loseInWorld; loseInWorld = false; enterWorld(true, lost ? 'Louis pingsan...\nTerbangun kembali di Dataran Hijau' : null); return; }
  state = 'play'; $('msg').textContent = ''; spawnWave();
}

// ---------- Animasi kalah: terkena serangan -> berlutut -> terkapar ----------
let canAgain = false; // true setelah animasi kalah selesai & tombol "Main Lagi" muncul
const D = { by: 0, lift: 0, t: 0, v: 0, dir: new THREE.Vector3(), dropped: false, k1: false, k3: false, flash: 0 };
const T_STAG = 0.35, T_KNEEL = 1.15, T_FALL = 0.7, T_MSG = 2.2, T_BTN = 2.6; // detik tiap tahap (ubah kalau mau lebih cepat/lambat)
const faceVec = () => new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face));
const sparks = [], lineGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
const hitLight = new THREE.PointLight(0xa040ff, 0, 9, 2); scene.add(hitLight); // kilatan ungu saat terkena serangan

function lineSparks(pos, n = 30, speed = 7, up = 1, cols = [0xf3e6ff, 0xa23cff]) { // percikan ungu berbentuk garis tipis (seperti di gambar referensi)
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: Math.random() < 0.25 ? cols[0] : cols[1], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    const v = new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1.5) * up, rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.35, 1));
    const life = rnd(0.5, 1.0);
    sparks.push({ m, v, life, max: life, len: rnd(0.25, 0.8) }); scene.add(m);
  }
}
function updateSparks(dt) {
  for (const s of [...sparks]) {
    s.life -= dt; s.v.y -= 10 * dt; s.m.position.addScaledVector(s.v, dt);
    if (s.m.position.y < 0.03) { s.m.position.y = 0.03; s.v.y = Math.abs(s.v.y) * 0.25; s.v.x *= 0.7; s.v.z *= 0.7; } // memantul di lantai
    if (s.v.lengthSq() > 1e-6) s.m.lookAt(s.m.position.clone().add(s.v)); // garis memanjang searah gerak
    s.m.scale.z = s.len * (0.4 + Math.min(1, s.v.length() / 6));
    s.m.material.opacity = Math.max(0, s.life / s.max);
    if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(sparks.indexOf(s), 1); }
  }
  D.flash = Math.max(0, D.flash - dt * 4); hitLight.intensity = D.flash * 60; hitLight.position.set(player.position.x, 1.3, player.position.z);
}

function startDefeat() {
  endVS(); endSL(); endSM(true); endBF();
  Object.assign(D, { t: 0, dropped: false, k1: false, k3: false, lift: 0, by: vrm ? vrm.scene.position.y : 0 });
  Object.assign(P, { atk: 0, cross: false, roll: 0, jy: 0, sh: 0 });
  for (const m of [slash.material, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0; // matikan efek tebasan
  let near = null, nd = 1e9; // arah penyerang = musuh terdekat
  for (const e of enemies) { const d = e.g.position.distanceTo(player.position); if (d < nd) { nd = d; near = e; } }
  const f = faceVec();
  if (near) { f.copy(near.g.position).sub(player.position).setY(0).normalize(); P.face = Math.atan2(f.x, f.z); } // menghadap penyerang
  D.dir.copy(f).negate(); D.v = 6.5; // terdorong ke belakang
  stick.x = stick.y = 0; kn.style.transform = ''; // lepas joystick
  setDrawn(true); // pedang di tangan saat jatuh
  lineSparks(player.position.clone().setY(1.1), 45, 9); D.flash = 1; shake = 0.8;
}
function dropSwords() { // pedang terlepas dari tangan & mendarat di lantai
  D.dropped = true;
  const f = faceVec(), sd = new THREE.Vector3(f.z, 0, -f.x), up = new THREE.Vector3(0, 1, 0);
  rigs.forEach((r, i) => {
    scene.attach(r.holder); r.tr = 1;
    r.dp0 = r.holder.position.clone(); r.dq0 = r.holder.quaternion.clone(); r.dt = 0;
    const lat = r.side; // pedang kanan ke satu sisi, kiri ke sisi lain
    r.dp1 = player.position.clone().addScaledVector(sd, lat * 0.9).addScaledVector(f, i ? 0.3 : 0.8).setY(0.04);
    const d = f.clone().multiplyScalar(i ? -0.5 : -0.8).addScaledVector(sd, lat * (i ? 0.85 : 0.6)).normalize(); // arah bilah di lantai
    const xA = d.clone().multiplyScalar(-r.side), yA = new THREE.Vector3().crossVectors(up, xA); // bilah rebah, sisi pipih menghadap atas
    r.dq1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, up));
  });
}
function defeatTick(dt) {
  D.t += dt; const t = D.t, b = bones || {}, f = faceVec();
  if (D.v > 0.05) { // terdorong lalu melambat
    player.position.addScaledVector(D.dir, D.v * dt); D.v *= Math.exp(-dt * 5);
    if (!loseInWorld && player.position.length() > R - 1.5) player.position.setLength(R - 1.5);
  }
  let fd = P.face - player.rotation.y; fd = Math.atan2(Math.sin(fd), Math.cos(fd)); player.rotation.y += fd * (1 - Math.exp(-dt * 14));
  const kb = 1 - Math.exp(-dt * (t < T_STAG ? 20 : 10));
  const s = clamp01((t - T_KNEEL) / T_FALL), e = s * s; // tahap jatuh makin cepat (gravitasi)
  let ty, trx, tz = 0, hx, hy = 0;
  if (t < T_STAG) { // 1. KALAH: kena serangan, badan melengkung ke belakang, lengan terlempar
    ty = -0.05; trx = -0.1; hx = -0.35;
    pose(b.hips, -0.12, 0, 0, kb); pose(b.spine, -0.35, 0, 0, kb); pose(b.chest, -0.15, 0, 0, kb);
    pose(b.rUA, 0.25, 0, 0.55, kb); pose(b.lUA, 0.25, 0, -0.55, kb); pose(b.rLA, 0, 0.4, 0, kb); pose(b.lLA, 0, -0.4, 0, kb);
    pose(b.lUL, -0.35, 0, 0.1, kb); pose(b.rUL, 0.25, 0, -0.1, kb); pose(b.lLL, 0.5, 0, 0, kb); pose(b.rLL, 0.4, 0, 0, kb);
  } else if (t < T_KNEEL) { // 2. kehilangan keseimbangan: berlutut satu kaki, satu tangan menahan lantai
    ty = -0.42; trx = 0.05; hx = 0.35;
    pose(b.hips, 0.25, 0, 0, kb); pose(b.spine, 0.55, 0, 0, kb); pose(b.chest, 0.25, 0, 0, kb);
    pose(b.lUL, -1.25, 0, 0.1, kb); pose(b.lLL, 1.35, 0, 0, kb); pose(b.rUL, 0.35, 0, -0.1, kb); pose(b.rLL, 1.9, 0, 0, kb);
    pose(b.rUA, 0, 0.5, 0.8, kb); pose(b.rLA, 0, 0.7, 0, kb); pose(b.lUA, 0, -0.3, -1.0, kb); pose(b.lLA, 0, -0.6, 0, kb);
  } else { // 3. TERKAPAR: jatuh tertelungkup, tangan terbuka, kepala menoleh ke samping
    ty = -0.42 + 0.56 * e; trx = 0.05 + 1.45 * e; tz = -0.55 * e; hx = -0.1; hy = 0.9 * e;
    pose(b.hips, 0, 0, 0, kb); pose(b.spine, 0, 0, 0, kb); pose(b.chest, 0, 0, 0, kb);
    pose(b.rUA, 0, 0.35, 0.3, kb); pose(b.lUA, 0, -0.35, -0.3, kb); pose(b.rLA, 0, 0.25, 0, kb); pose(b.lLA, 0, -0.25, 0, kb);
    pose(b.lUL, 0.05, 0, 0.12, kb); pose(b.rUL, 0.05, 0, -0.12, kb); pose(b.lLL, 0.15, 0, 0, kb); pose(b.rLL, 0.25, 0, 0, kb);
    const tl = t - (T_KNEEL + T_FALL); // pantulan kecil saat menyentuh lantai
    if (tl > 0) { const bn = Math.exp(-tl * 9) * Math.sin(tl * 28); trx -= bn * 0.05; ty += Math.abs(bn) * 0.05; }
  }
  pose(b.head, hx, hy, 0, kb);
  if (vrm) {
    const sc = vrm.scene, ks = 1 - Math.exp(-dt * (t < T_STAG ? 14 : t < T_KNEEL ? 9 : 30));
    D.by += (ty - D.by) * ks; sc.position.y = D.by + D.lift; sc.position.z += (tz - sc.position.z) * ks; sc.rotation.x += (trx - sc.rotation.x) * ks;
  }
  // kejadian: percikan di lantai, pedang terjatuh, mendarat, teks & tombol
  if (!D.k1 && t >= 0.45) { D.k1 = true; D.flash = 0.6; shake = 0.25; lineSparks(player.position.clone().addScaledVector(f, 0.5).setY(0.15), 26, 5.5, 0.8); }
  if (!D.dropped && t >= T_KNEEL + 0.12) { dropSwords(); lineSparks(player.position.clone().setY(0.3), 14, 4); }
  if (!D.k3 && t >= T_KNEEL + T_FALL) { D.k3 = true; shake = 0.5; D.flash = 0.8; burst(player.position.clone().setY(0.15), 0x8a7aa0, 14, 3.5); lineSparks(player.position.clone().setY(0.2), 28, 6, 0.8); }
  if (D.dropped) for (const r of rigs) if (r.dp1) {
    r.dt = Math.min(1, r.dt + dt / 0.3); const q = 1 - Math.pow(1 - r.dt, 2);
    r.holder.position.lerpVectors(r.dp0, r.dp1, q); r.holder.position.y += 0.4 * Math.sin(Math.PI * r.dt);
    r.holder.quaternion.copy(r.dq0).slerp(r.dq1, q);
  }
  if (t >= T_MSG && !$('msg').textContent) { $('msg').textContent = 'KAMU KALAH'; $('msg').classList.add('in'); }
  if (t >= T_BTN && !canAgain) showAgain();
}
// Deteksi lantai: cari titik tubuh paling rendah, kalau tembus lantai badan diangkat (kalau melayang diturunkan)
const FLOOR_BONES = [['hips', .12], ['spine', .12], ['chest', .12], ['head', .12], ['leftUpperArm', .06], ['rightUpperArm', .06], ['leftLowerArm', .06], ['rightLowerArm', .06],
  ['leftHand', .04], ['rightHand', .04], ['leftUpperLeg', .08], ['rightUpperLeg', .08], ['leftLowerLeg', .07], ['rightLowerLeg', .07], ['leftFoot', .06], ['rightFoot', .06], ['leftToes', .03], ['rightToes', .03]];
const _fp = new THREE.Vector3();
function groundFix(dt) {
  if (!vrm) return;
  let minY = 1e9;
  for (const [n, m] of FLOOR_BONES) { const nd = vrm.humanoid.getNormalizedBoneNode(n); if (nd) minY = Math.min(minY, nd.getWorldPosition(_fp).y - m); }
  if (minY === 1e9) return;
  const adj = -minY * (1 - Math.exp(-dt * 25)); // sedikit demi sedikit supaya halus
  D.lift += adj; vrm.scene.position.y += adj;
}
function resetDefeat() { // kembalikan semuanya sebelum main lagi
  canAgain = false; $('again').hidden = true; $('exit').hidden = true; $('msg').classList.remove('in');
  for (const s of sparks) scene.remove(s.m); sparks.length = 0; D.flash = 0; hitLight.intensity = 0;
  if (vrm) { vrm.scene.rotation.x = 0; vrm.scene.position.set(0, 0, 0); }
  for (const r of rigs) { r.anchor.add(r.holder); r.holder.position.set(0, 0, 0); r.holder.quaternion.identity(); r.tr = 1; delete r.dp1; r.dt = 0; } // pedang kembali ke sarung
  P.drawn = false;
}

// ---------- Serangan ke-4 (3 tahap) ----------
function crossTick() {
  const el = P.dur - Math.max(0, P.atk), s1 = CX.t1, s2 = s1 + CX.t2, s3 = s2 + CX.t3;
  const f = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face)), PUR = 0xb45cff;
  if (!P.hit && el >= 0.2) { // tahap 1: tebasan silang
    P.hit = true; if (BF.on) bfSlash(); shake = 0.3; burst(player.position.clone().addScaledVector(f, 1.7).setY(1.2), PUR, 22, 7);
    for (const e of [...enemies]) {
      const d = e.g.position.clone().sub(player.position).setY(0), l = d.length();
      if (l < 3.6 + e.r && d.normalize().dot(f) > -0.2) hurtEnemy(e, Math.round((40 + (Math.random() * 6 | 0)) * (BF.on ? 1.3 : 1)), d, 22);
    }
  }
  if (!P.sx && el >= s2 - 0.1) { P.sx = true; audio.sfx('slash'); } // tebasan silang kedua saat menerjang
  if (!P.fx2 && el >= s1) { P.fx2 = true; burst(player.position.clone().setY(0.2), 0xb8b8c8, 12, 3); } // debu saat melompat mundur
  if (el >= s2 && el < s3) { // tahap 3: menerjang, menebas semua musuh yang dilewati
    burst(player.position.clone().setY(1.0).addScaledVector(f, -0.5), PUR, 2, 3);
    for (const e of [...enemies]) {
      if (P.set.has(e)) continue;
      const d = e.g.position.clone().sub(player.position).setY(0), l = d.length();
      if (l < 2.0 + e.r && d.normalize().dot(f) > -0.3) {
        P.set.add(e); shake = 0.4;
        hurtEnemy(e, 45 + (Math.random() * 8 | 0), d.add(f).normalize(), 26);
        burst(e.g.position.clone().setY(1.2), PUR, 18, 7);
      }
    }
  }
  if (!P.fx3 && el >= s3) { P.fx3 = true; shake = 0.5; burst(player.position.clone().addScaledVector(f, 1.8).setY(1.1), PUR, 30, 8); }
}

// ---------- Loop utama ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const rdt = settingsOpen ? 0 : Math.min(clock.getDelta(), 0.05); // rdt = waktu nyata (0 = game berhenti saat menu terbuka)
  if (settingsOpen) clock.getDelta();
  let ts = 1, slowK = 0; // ts = kecepatan game, slowK = kekuatan efek kamera (0-1)
  if (slow.t > 0) {
    slow.t = Math.max(0, slow.t - rdt); const sp = 1 - slow.t / SLOW_TOTAL;
    ts = sp < SLOW_DEATH ? SLOW_SCALE : SLOW_SCALE + (1 - SLOW_SCALE) * Math.min(1, (sp - SLOW_DEATH) / (1 - SLOW_DEATH)); // lambat, lalu pelan-pelan normal lagi
    slowK = Math.min(1, (SLOW_TOTAL - slow.t) / 0.3) * (1 - Math.min(1, Math.max(0, (sp - SLOW_DEATH) / (1 - SLOW_DEATH))));
  }
  const dt = rdt * ts; // dt = waktu game (dipakai semua gerakan)
  if (state === 'play' || state === 'world') {
    const mv = new THREE.Vector3((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), 0, (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0));
    if (Math.hypot(stick.x, stick.y) > 0.2) { mv.x += stick.x; mv.z += stick.y; } // joystick layar
    mv.applyAxisAngle(UP, camYaw); // gerak mengikuti arah kamera
    const moving = mv.lengthSq() > 0;
    if (P.roll > 0) { player.position.addScaledVector(P.rv, 11 * dt); P.roll -= dt; P.v.copy(P.rv).multiplyScalar(5); }
    else if (P.vs > 0 || P.sl > 0 || P.sm > 0) { P.v.set(0, 0, 0); } // saat Vertical Spin / Slash Besar, gerak diatur vsTick / slTick
    else if (P.atk > 0 && P.cross) { // gerak otomatis: maju sedikit -> mundur -> terjang jauh ke depan
      const el = P.dur - P.atk, f = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face));
      const sp = el < CX.t1 ? 1.5 : el < CX.t1 + CX.t2 ? -8 : el < CX.t1 + CX.t2 + CX.t3 ? 17 : 0;
      player.position.addScaledVector(f, sp * dt); P.v.set(0, 0, 0);
      if (el >= CX.t1 && el < CX.t1 + CX.t2 + CX.t3) P.inv = Math.max(P.inv, 0.1); // kebal saat melompat
    } else {
      if (P.atk > 0 && !P.cross) { const pp = 1 - P.atk / P.dur; if (pp > 0.15 && pp < 0.55) player.position.addScaledVector(new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face)), 2.6 * dt); } // langkah maju kecil saat mengayun
      if (moving) { mv.normalize(); if (P.atk <= 0) P.face = Math.atan2(mv.x, mv.z); }
      P.v.lerp(moving ? mv.multiplyScalar(P.atk > 0 ? 1.5 : 5.5 * (state === 'world' && (keys.ShiftLeft || keys.ShiftRight) ? 1.7 : 1)) : ZERO, 1 - Math.exp(-dt * 10));
      player.position.addScaledVector(P.v, dt);
    }
    if (state === 'play' && player.position.length() > R - 1.5) player.position.setLength(R - 1.5);
    collidePlayer(); // tidak bisa menembus monster / pohon
    P.inv = Math.max(0, P.inv - dt);
    let fd = P.face - player.rotation.y;
    fd = Math.atan2(Math.sin(fd), Math.cos(fd)); player.rotation.y += fd * (1 - Math.exp(-dt * 14));

    if (P.atk > 0) {
      P.atk -= dt;
      if (P.cross) crossTick();
      else if (!P.hit && P.atk < P.dur * 0.62) {
        P.hit = true; if (BF.on) bfSlash();
        const f = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face));
        for (const e of [...enemies]) {
          const d = e.g.position.clone().sub(player.position).setY(0), l = d.length();
          if (l < 2.8 + e.r && d.normalize().dot(f) > 0.1) hurtEnemy(e, Math.round((22 + (Math.random() * 6 | 0)) * (BF.on ? 1.3 : 1)), d, 16);
        }
      }
    } else if (P.comboT > 0 && (P.comboT -= dt) <= 0) P.combo = 0; // jeda terlalu lama: hitungan combo reset
    if (P.vs > 0) vsTick(dt);
    if (P.sl > 0) slTick(dt);
    if (P.sm > 0) smTick(dt);
    // pedang: terhunus saat menyerang & DRAW_HOLD detik sesudahnya; disarungkan saat berlari / sudah lewat waktunya
    if (P.atk > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0) { P.drawT = DRAW_HOLD; P.runT = 0; }
    else { if (P.drawT > 0) P.drawT -= dt; P.runT = moving && P.roll <= 0 ? P.runT + dt : 0; if (P.runT > RUN_SHEATH) P.drawT = 0; }
    setDrawn(P.atk > 0 || P.drawT > 0);
    P.heavy += ((P.drawT > 0 ? 1 : 0.3) - P.heavy) * (1 - Math.exp(-dt * (P.drawT > 0 ? 8 : 1.5))); // napas berat -> ringan
    updateEnemies(dt); collidePlayer(); // musuh bergerak/terpental lalu cek tabrakan lagi
    if (state === 'world') wildSpawnTick(dt); // monster liar di hutan: muncul acak, hilang kalau jauh, darah pulih saat aman
    poseAndAnimate(dt, P.roll > 0 ? 0 : Math.min(1, P.v.length() / 5.5));
    if (state === 'world') worldTick(); // petunjuk arah & cek masuk lubang
    if (state === 'play' && !enemies.length) {
      if (wave === WAVES.length - 1) end(true);
      else if ((next += dt) > 1.5) { next = 0; wave++; P.hp = Math.min(P.max, P.hp + 30); banner(WAVES[wave] === 'dragon' ? 'Level 4\nNaga Api Muncul!' : WAVES[wave] === 'boss' ? 'Level 3\nBos Penyihir' : `Level ${wave + 1}`); spawnWave(); }
    }
  } else if (state === 'lose') defeatTick(dt);
  else if (state === 'fall') fallTick(dt);
  updateSwords(dt);
  tickSkills(dt);
  vrm && vrm.update(dt);
  if (state === 'lose') groundFix(dt);
  updateSparks(dt);
  for (const f of [...fx]) {
    f.life -= dt; if (!f.slash) f.v.y -= 12 * dt; f.m.position.addScaledVector(f.v, dt); f.m.material.opacity = Math.max(0, f.life / (f.max || 0.6)) * (f.slash ? 0.9 : 1);
    if (f.life <= 0) { scene.remove(f.m); fx.splice(fx.indexOf(f), 1); }
  }
  const tt = clock.elapsedTime;
  torches.forEach(t => { t.L.intensity = 26 + Math.sin(tt * 9 + t.o) * 5 + Math.random() * 3; t.fl.scale.y = 1 + Math.sin(tt * 12 + t.o) * 0.2; });
  const boss = enemies.find(e => e.boss);
  $('hpbar').style.width = P.hp / P.max * 100 + '%';
  if (boss) $('bossbar').style.width = Math.max(0, boss.hp / boss.max * 100) + '%';
  shake = Math.max(0, shake - dt);
  const target = player.position.clone();
  if (state === 'fall') target.y = 0; // saat jatuh kamera tetap di atas, hanya menunduk melihat pemain
  const C = CAMS[camMode];
  if (!orbit()) camYaw += (0 - camYaw) * Math.min(1, rdt * 5); // mode lain: kembali ke depan. Mode 360°: bebas
  zoomS += (zoom - zoomS) * Math.min(1, rdt * 10);
  let lx = target.x, lz = target.z, ly = C.look + (state === 'fall' ? player.position.y * 0.85 : 0);
  if (state === 'lose') { // kamera sinematik: turun rendah, mendekat dari samping
    const f = faceVec(), sd = new THREE.Vector3(f.z, 0, -f.x), low = clamp01((D.t - 0.3) / 1.2);
    const want = target.clone().addScaledVector(sd, 4.6 - 1.3 * low).addScaledVector(f, 0.8).setY(1.4 - 0.85 * low);
    cam.position.lerp(want, Math.min(1, dt * 3)); ly = 0.9 - 0.45 * low; lx += f.x * 0.35 * low; lz += f.z * 0.35 * low;
  } else {
    const D = Math.hypot(C.off.y, C.off.z), pit = orbit() ? camPitch : Math.atan2(C.off.y, C.off.z); // jarak tetap, sudut naik-turun bebas di mode 360°
    const off = new THREE.Vector3(C.off.x, Math.sin(pit) * D, Math.cos(pit) * D).multiplyScalar(zoomS * (1 - 0.3 * slowK)).applyAxisAngle(UP, camYaw); // slowmo: kamera mendekat
    cam.position.lerp(target.clone().add(off), Math.min(1, rdt * 4));
  }
  cam.position.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), 0).multiplyScalar(shake * 0.4));
  const dy = enemies.find(e => e.dying); if (dy && slowK > 0) { lx += (dy.g.position.x - lx) * 0.45 * slowK; lz += (dy.g.position.z - lz) * 0.45 * slowK; } // slowmo: kamera menoleh ke musuh terakhir
  cam.lookAt(lx, ly, lz);
  if (world.group.visible) { world.update(rdt, clock.elapsedTime, player.position, cam.position); const ct = state === 'world' && world.canTalk(); if ($('talk').hidden === ct) $('talk').hidden = !ct; } else if (!$('talk').hidden) $('talk').hidden = true;
  renderer.render(scene, cam);
}
frame();
