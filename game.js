import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createMutantRig } from './mutan-anim.js';   // animasi Mutan lewat kode (berdiri, jalan, cakar, seruduk, hantam, raung, mati)
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createWorld, HOLE_R, LIMIT, SPAWN, SKY_COLOR, FOG_DENSITY } from './world.js';
import { VILLAGE } from './village-layout.js';
import { FOREST, ANCIENT_GATE, CAMP_FIRE, POND, SECRET_GLADE, SECRET_QUEST } from './forest-layout.js';
import { CITY, CITY_SPAWN, CHURCH, PALACE, cityDist } from './city-layout.js';
import { MEADOW, RUINS, MEADOW_SEG_X, meadowDist } from './meadow-layout.js';
import { SAWAH, KEKAISARAN, SAWAH_SPAWN, sawahDist } from './sawah-layout.js';
import { kekaisaranDist, districtAt, DISTRICTS, GATES, inNwPlain, inNwTown, nwPlainAxis, nwAxisToWorld } from './kekaisaran-layout.js';
import { VILLAGES_BL, desaBLNear, WARGA_BL } from './kekaisaran-dataran.js';
import { DUNGEON_TOWN, DUNGEON_GATES, MAIN_DUNGEON, GUILD_DOOR, SMITH_DOOR, POTION_DOOR, LODGE_DOOR } from './kota-dungeon.js';
import { WARGA, CERITA, KAELEN_TALK } from './kota-warga.js';   // nama + percakapan semua NPC Kota Dungeon (hanya teks) + cerita rumor Kaelen
import { buildGuildInterior } from './kota-guild.js';   // interior Balai Petualang (guild) di Kota Dungeon
import { lyra, LYRA, LYRA_TALK } from './party-lyra.js';   // Lyra: penyihir pendukung, direkrut di Balai Petualang lalu ikut sebagai anggota party (model lyra.vrm)
import { buildLodgeInterior } from './kota-penginapan.js';   // interior Penginapan Kota Dungeon (pola yang sama dengan Pandai Besi / Toko Ramuan)
import { buildPotionInterior } from './kota-toko-ramuan.js';   // interior Toko Ramuan di Kota Dungeon (pola yang sama dengan Pandai Besi)
import { buildSmithInterior } from './kota-pandai-besi.js';   // interior toko Pandai Besi di Kota Dungeon (memakai mekanisme masuk / keluar yang sama dengan guild)
import { createLoot } from './dungeon-loot.js';   // item jatuhan monster (sesuai elemen dungeon), peti hadiah bos, tas item
import { loadSwordModels, buildSwordModel } from './pedang-model.js';   // model 3D pedang equipment (7 pedang pack diwarnai sesuai elemen + pedang kegelapan)
import { buildDungeonJelajah, DJ } from './dungeon-jelajah.js';   // dungeon Kota Dungeon yang bisa dijelajahi (lorong + ruangan + gerbang ruang bos)
import { AULA, inAulaExit } from './kekaisaran-istana-layout.js';
import { DUSUN } from './meadow-village-layout.js';
import { buildSlime, buildGoblin, slimePose, goblinPose, makeBar } from './mobs.js';
import { audio } from './audio.js';
import { RUINS_DOOR, DOOR_FX, GOLEM, GOLEM_WAVES } from './golem-layout.js';
import { buildGolem, poseGolem, newGolemPose, ATTACK } from './golem.js';

const $ = id => document.getElementById(id);
let R = 18; const ARENA_R = 18; // radius arena (ruang bos). Saat menjelajah dungeon, R dibuat sangat besar (lihat startExplore) supaya semua pembatas arena bundar tidak aktif; dikembalikan ke ARENA_R di ruang bos / dunia luar
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
// Resolusi adaptif (OPSIONAL, default mati; buka game dengan ?adaptif untuk mengaktifkan, batas bawah 1x): bila FPS turun (mis. di kota yang ramai) resolusi render diturunkan bertahap sampai ~0.75x; setelah FPS stabil lagi dinaikkan pelan-pelan ke maksimum.
// Ini cara paling murah menambah FPS di layar beresolusi tinggi (beban piksel turun cepat), tanpa mengubah isi dunia. Dipanggil sekali per frame sebelum renderer.render.
const RES = { on: location.search.includes('adaptif'), max: Math.min(devicePixelRatio, COARSE ? 1.5 : 2), min: 1, cur: 0, acc: 0, n: 0, up: 0, wait: 4, sinceUp: 99, last: performance.now() };
RES.cur = RES.max;
function adaptRes() {
  if (!RES.on) return;   // nonaktif: resolusi tetap penuh
  const now = performance.now(), ft = now - RES.last; RES.last = now;
  if (ft > 250 || document.hidden) return;   // lonjakan sesaat (memuat, pindah tab) diabaikan
  RES.acc += ft; RES.n++; if (RES.acc < 1000) return;
  const avg = RES.acc / RES.n; RES.acc = 0; RES.n = 0; RES.sinceUp++;
  let t = RES.cur;
  if (avg > 20) {   // di bawah ~50 fps: turunkan; bila baru saja dinaikkan lalu turun lagi, tahan naik lebih lama (cegah naik-turun terus)
    t = Math.max(RES.min, RES.cur * 0.85); RES.up = 0;
    if (RES.sinceUp < 8) RES.wait = Math.min(32, RES.wait * 2);
  } else if (avg < 18.5 && RES.cur < RES.max) {   // stabil ~54 fps ke atas
    if (++RES.up >= RES.wait) { t = Math.min(RES.max, RES.cur * 1.1); RES.up = 0; RES.sinceUp = 0; }
  } else RES.up = 0;
  if (Math.abs(t - RES.cur) > 0.01) { RES.cur = t; renderer.setPixelRatio(t); renderer.setSize(innerWidth, innerHeight); }
}
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
const hemi = new THREE.HemisphereLight(0x6070a0, 0x201018, 0.5); arenaG.add(hemi);
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
const floorMat = new THREE.MeshStandardMaterial({ map: stoneTex(8), roughness: 0.85 }), ringMats = [];   // bahan lantai & cincin disimpan: tema arena dungeon bisa berganti (applyArenaTheme)
const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 64), floorMat);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; arenaG.add(floor);

for (const [a, b, c] of [[4.6, 4.8, 0.9], [9.4, 9.55, 0.5]]) {
  const rMat = new THREE.MeshStandardMaterial({ color: 0x220a33, emissive: 0x9a35e0, emissiveIntensity: c, roughness: 1 }); ringMats.push(rMat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(a, b, 64), rMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; arenaG.add(ring);
}
const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex(10), roughness: 0.9, side: THREE.BackSide });
const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 1, R + 1, 8, 48, 1, true), wallMat);
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
// Chunk kota dibangun bertahap di latar (world.js / chunks.js). Begitu selesai, kompilasi shader-nya (paralel, tidak memblokir)
// dan unggah teksturnya ke GPU SEKARANG, supaya saat pemain tiba dan chunk pertama kali tampil tidak ada lonjakan frame.
// OPTIMASI: geometri kota (mesh gabungan besar) juga diunggah ke GPU lebih dulu. Tanpa ini, unggahan buffer terjadi di frame pertama
// mesh itu terlihat (= lonjakan saat masuk kota). Caranya: gambar mesh tiruan yang memakai geometri SAMA ke render target 1x1,
// SATU geometri per frame, di latar — buffer GPU-nya dipakai bersama sehingga nanti tidak perlu diunggah lagi.
const uploadQueue = [], upScene = new THREE.Scene(), upMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()), upRT = new THREE.WebGLRenderTarget(1, 1);
upMesh.frustumCulled = false; upScene.add(upMesh);
function uploadStep() {
  const g = uploadQueue.pop(); if (!g) return;
  try {
    upMesh.geometry = g; const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(upRT); renderer.render(upScene, cam); renderer.setRenderTarget(prev);
  } catch (e) { uploadQueue.length = 0; console.warn('unggah geometri awal gagal', e); }
}
// Pemanasan RATU: modelnya (ratuu.vrm, bahan MToon + tekstur besar) dimuat belakangan dan tidak ikut pemanasan chunk, jadi dulu shader-nya dikompilasi &
// tekstur-teksturnya diunggah baru di frame pertama sorotan = patah-patah. Sekarang begitu ratu siap: shader dikompilasi di latar, lalu SATU tekstur diunggah per frame.
// Dipakai untuk ratu & Putri Isabel: getObj() = objek model (null selama belum siap).
const makeWarmStep = getObj => {
  let warm = null;
  return () => {
    if (warm === true) return;
    if (!warm) {
      const q = getObj(); if (!q) return;
      const tex = new Set();
      q.traverse(o => { for (const m of [].concat(o.material || [])) for (const k in m) { const v = m[k]; if (v && v.isTexture) tex.add(v); } });
      warm = { tex: [...tex] };
      try { if (renderer.compileAsync) renderer.compileAsync(q, cam, scene).catch(() => {}); } catch (e) { console.warn('prewarm model gagal', e); }
      return;
    }
    const t = warm.tex.pop();
    if (t) { try { renderer.initTexture(t); } catch (e) { /* abaikan */ } } else warm = true;
  };
};
const queenWarmStep = makeWarmStep(() => world.aula.queenObj());
const isabelWarmStep = makeWarmStep(() => world.aula.isabelObj());
world.setPrewarm(g => {
  try {
    g.traverse(o => {
      for (const m of [].concat(o.material || [])) if (m.map) renderer.initTexture(m.map);
      if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.count > 2000) uploadQueue.push(o.geometry);   // hanya mesh besar (kota, interior); NPC berkulit dilewati
    });
    if (renderer.compileAsync) renderer.compileAsync(g, cam, scene).catch(() => {});
  } catch (e) { console.warn('prewarm chunk gagal', e); }
});
// F3 (atau buka dengan ?debug): status chunk + FPS, untuk memeriksa pembagian dunia
{ const dbg = document.createElement('pre'); dbg.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 9px;background:rgba(0,0,0,.62);color:#bdf;font:12px/1.4 monospace;z-index:30;pointer-events:none;border-radius:6px;white-space:pre';
  let on = location.search.includes('debug'), frames = 0, last = performance.now();
  dbg.style.display = on ? 'block' : 'none'; document.body.appendChild(dbg);
  const loop = () => { requestAnimationFrame(loop); frames++; const n = performance.now(); if (n - last >= 500) { if (on) dbg.textContent = Math.round(frames * 1000 / (n - last)) + ' fps  |  ' + renderer.info.render.calls + ' draw  |  ' + Math.round(renderer.info.render.triangles / 1000) + 'k tri  |  res ' + RES.cur.toFixed(2) + 'x\n' + world.chunkInfo(); frames = 0; last = n; } };
  requestAnimationFrame(loop);
  addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); on = !on; dbg.style.display = on ? 'block' : 'none'; } }); }
const arenaFog = scene.fog, worldFog = new THREE.FogExp2(SKY_COLOR, FOG_DENSITY);
// Tema arena dungeon: 'asal' = dungeon di lubang tengah dunia (ungu-oranye, obor api); 'kota' = Gua Kristal di Gerbang Dungeon Kota Dungeon (biru-kristal, obor kristal)
const ARENA_THEMES = {
  asal: { bg: 0x07060a, fog: arenaFog.color.getHex(), hemi: [0x6070a0, 0x201018, 0.5], moon: [0x9db4ff, 1.2], tint: 0xffffff, ring: [0x220a33, 0x9a35e0], flame: 0xffa040, torch: 0xff7a2a },
  kota: { bg: 0x02090d, fog: 0x03141b, hemi: [0x3f9db5, 0x0a1d24, 0.65], moon: [0x7fe9ff, 1.05], tint: 0x86c3d6, ring: [0x062a33, 0x35e0d0], flame: 0x6ff0ff, torch: 0x35c8e0 },
  cahaya:    { bg: 0x2a2a36, fog: 0x3a3a4a, hemi: [0xfff2c0, 0x6a5a40, 1.0], moon: [0xfff0b0, 1.6], tint: 0xfff3d0, ring: [0x3a2f08, 0xffd34a], flame: 0xffe58a, torch: 0xffd870, stone: 0xb8aa80 },
  kegelapan: { bg: 0x1a0a2e, fog: 0x2a1048, fogD: 0.02, hemi: [0xa070ff, 0x3a1a60, 0.95], moon: [0xb48cff, 1.5], tint: 0xb59ae0, ring: [0x2e0a4a, 0xb050ff], flame: 0xc870ff, torch: 0xa050ff, stone: 0x5a4678 },   // nuansa ungu: latar, kabut, cahaya langit, lantai, dinding & obor ungu (dulu hampir hitam pekat sehingga bos tak terlihat)
  api:       { bg: 0x120503, fog: 0x240a04, hemi: [0xff7a3a, 0x2a0a02, 0.7], moon: [0xff9a50, 1.1], tint: 0xe0a090, ring: [0x330a02, 0xff4a10], flame: 0xff6a20, torch: 0xff5a1a, stone: 0x6a3a2c },
  es:        { bg: 0x0a1420, fog: 0x122436, hemi: [0xa8d8ff, 0x1a2a3a, 0.8], moon: [0xcaeaff, 1.3], tint: 0xcfe8ff, ring: [0x0a2a40, 0x8ae0ff], flame: 0xbfefff, torch: 0x8ad0ff, stone: 0x8aa8c0 },
  batu:      { bg: 0x0b0907, fog: 0x1a1510, hemi: [0xb09a78, 0x1a140c, 0.6], moon: [0xd0b890, 1.0], tint: 0xc0aa88, ring: [0x2a1c0a, 0xc08a3a], flame: 0xffb050, torch: 0xe09a40, stone: 0x6e6250 },
};
// 5 dungeon tambahan di Lembah Bebatuan (Kota Dungeon): tampilan musuh level 1-2 (shape, warna, kekuatan) + bos level 3 (penyihir diberi warna & nama tema)
const DG_THEMES = {
  cahaya:    { name: 'Dungeon Cahaya',    icon: '☀️', boss: 'Seraphim, Penjaga Cahaya',  shape: 'orb',    body: 0xfff1b0, emi: 0x6a5010, glow: 0xffffff, fx: 0xffe27a, bossBody: 0xe8d8a0, bossGlow: 0xffe27a, bossBase: 0x403010, hp: 50, dmg: 10, r: 0.9,  sp: 3.4 },
  kegelapan: { name: 'Dungeon Kegelapan', icon: '🌑', boss: 'Mordrak, Ksatria Kegelapan',  shape: 'wraith', body: 0x1a0f26, emi: 0x1a0540, glow: 0xff2a4a, fx: 0xa040ff, bossBody: 0x3a1a60, bossGlow: 0xb030ff, bossBase: 0x3a1468, hp: 50, dmg: 11, r: 0.9,  sp: 3.6 },
  api:       { name: 'Dungeon Api',       icon: '🔥', boss: 'Ignarok, Raja Api',          shape: 'flame',  body: 0xc83a14, emi: 0x6a1a00, glow: 0xffe060, fx: 0xff7a20, bossBody: 0x5a1408, bossGlow: 0xff7a20, bossBase: 0x4a1000, hp: 55, dmg: 12, r: 0.95, sp: 3.2 },
  es:        { name: 'Dungeon Es',        icon: '❄️', boss: 'Glacivor, Penguasa Es',      shape: 'shard',  body: 0x9fd8f0, emi: 0x1a4a6a, glow: 0xffffff, fx: 0x9fe8ff, bossBody: 0x2a5a80, bossGlow: 0x9fe8ff, bossBase: 0x0a2a40, hp: 50, dmg: 10, r: 0.9,  sp: 3.3 },
  batu:      { name: 'Dungeon Batu',      icon: '🪨', boss: 'Grumbolt, Raksasa Batu',     shape: 'golem',  body: 0x7a6a55, emi: 0x000000, glow: 0xffb040, fx: 0xc8b090, bossBody: 0x4a3d30, bossGlow: 0xffa030, bossBase: 0x000000, hp: 90, dmg: 15, r: 1.05, sp: 2.4 },
};
function applyArenaTheme(name) {
  const t = ARENA_THEMES[name] || ARENA_THEMES.asal;
  scene.background.set(t.bg); arenaFog.color.setHex(t.fog); arenaFog.density = t.fogD || 0.03;
  hemi.color.setHex(t.hemi[0]); hemi.groundColor.setHex(t.hemi[1]); hemi.intensity = t.hemi[2]; moon.color.setHex(t.moon[0]); moon.intensity = t.moon[1];
  floorMat.color.setHex(t.tint); wallMat.color.setHex(t.tint); stoneMat.color.setHex(t.stone || (name === 'kota' ? 0x4c6c7a : 0x5a5560));
  ringMats.forEach(m => { m.color.setHex(t.ring[0]); m.emissive.setHex(t.ring[1]); });
  flameMat.color.setHex(t.flame); torches.forEach(o => o.L.color.setHex(t.torch));
}

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
const P = { hp: 100, max: 100, atk: 0, dur: 0.45, cross: false, combo: 0, comboT: 0, hand: -1, hit: false, jy: 0, fx2: false, fx3: false, set: null, roll: 0, inv: 0, sh: 0, drawT: 0, runT: 0, heavy: 0.3, vs: 0, sl: 0, sm: 0, pt: 0, ex: 0, drawn: false, face: 0, rv: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(), ph: 0, t: 0, air: false, vy: 0, kb: new THREE.Vector3(), push: new THREE.Vector3(), trap: 0, trapMax: 1, hs: 0 };   // push = dorongan (terpental oleh bos es), trap = sisa detik terjebak balok es, hs = sisa detik tak bisa bergerak setelah terpental
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

// tebasan MIRING untuk serangan ke-4: sabit ungu raksasa berlapis (4 pita: 2 utama tebal + 1 luar tipis + 1 dalam), sama gayanya dengan Slash Besar,
// tapi bidang sapuannya dimiringkan (rotasi.z) jadi tebasan diagonal. Set ke-2 dipakai bersama set ke-1 untuk tebasan silang penutup.
const dMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const D_A0 = Math.PI - 0.45, D_A1 = Math.PI * 2 + 0.45; // sudut sapuan: kanan -> depan -> kiri
const dFx = [0, 1].map(() => {
  const g = new THREE.Group(), plane = new THREE.Group(), rib = []; plane.rotation.x = -Math.PI / 2; g.add(plane);
  [[3.3, 3.5, 1.05, 0.95, 0.32, 0, 1], [2.9, 3.1, 0.8, 1.2, -0.3, 0.14, 1], [4.4, 3.9, 0.45, 1.05, 0.12, -0.1, 0.94], [2.3, 2.5, 0.5, 0.8, 0.5, 0.22, 1.06]].forEach(([rc, span, W, h, tilt, off, rate]) => {
    const piv = new THREE.Group(); piv.add(new THREE.Mesh(ribbonGeo(rc, span, W), dMat));
    const hold = new THREE.Group(); hold.position.z = h; hold.rotation.x = tilt; hold.add(piv); plane.add(hold); rib.push({ piv, off, rate });
  });
  g.position.set(0, 1.4, -0.1); g.visible = false; player.add(g); return { g, rib };
});
function dFxSet(i, h, tilt, e, sc, sw = 1, y = 1.4) { // h: 1 = sapuan dari kanan, -1 = dari kiri (cermin); tilt: kemiringan bidang; e: kemajuan sapuan 0..1; sc: ukuran
  sc *= DK.pow > 0 ? DKB.big : 1; const f = dFx[i]; f.g.visible = true; f.g.rotation.z = -h * tilt; f.g.scale.set(h * sc, sc, sc); f.g.position.y = y;
  for (const r of f.rib) r.piv.rotation.z = D_A0 + r.off + (D_A1 - D_A0) * sw * e * r.rate;
}
function dFxHead(i, e, sw = 1) { // posisi dunia ujung sabit utama (untuk percikan)
  const f = dFx[i], a = D_A0 + (D_A1 - D_A0) * sw * e; f.g.updateWorldMatrix(true, false);
  return f.g.localToWorld(new THREE.Vector3(3.3 * Math.cos(a), 0.95, -3.3 * Math.sin(a)));  // (dipakai bersama dFxSet)
}

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

// Equipment pedang (ditempa & dipakai lewat tas, lihat dungeon-loot.js): model 3D + warna bilah + aura, dan pengali damage semua serangan pemain
// Model 3D dari pedang-model.js (free_stylized_low_poly_swords.glb diwarnai ulang sesuai elemen, pedang_kegelapan.glb untuk Pedang Bayangan). Selama GLB belum dimuat / gagal dimuat, dipakai pedang kotak bawaan (cadangan) dengan warna yang sama.
const swordLook = { id: 'biasa', color: 0xc8d4e0, emi: 0x000000, ei: 0, glow: null };
let swordMul = 1;
function fitSheath(sh, vis) {   // sarung di pinggang mengikuti pedang: leher tepat di bawah pelindung (guard), ujung dekat ujung bilah. vis = null -> ukuran pedang kotak lama
  if (!sh) return;
  const top = vis ? vis.throatX : -0.17, bot = vis ? vis.tipX + 0.06 : -1.15, w = vis ? vis.sheathW : 1;
  sh.body.position.x = vis ? (top + bot) / 2 : -0.65; sh.body.scale.set(vis ? (top - bot) / 0.98 : 1, w, w > 1 ? 1.5 : 1);
  sh.throat.position.x = top; sh.throat.scale.y = w; sh.tip.position.x = bot; sh.tip.scale.y = w;
}
function styleSword(s) {   // terapkan pedang yang sedang dipakai ke satu pedang: model 3D bila sudah dimuat, kalau belum pedang kotak bawaan (bilah = anak pertama dari proc)
  const { proc, slot, sheath } = s.userData;
  slot.traverse(o => { if (o.isMesh && o.material) o.material.dispose(); }); slot.clear();
  const vis = buildSwordModel(swordLook.id, swordLook);   // null selama model belum siap
  fitSheath(sheath, vis);
  if (vis) { slot.add(vis.group); slot.visible = true; proc.visible = false; return; }
  slot.visible = false; proc.visible = true;
  const blade = proc.children[0]; blade.material.color.setHex(swordLook.color); blade.material.emissive.setHex(swordLook.emi); blade.material.emissiveIntensity = swordLook.ei;
  let g = proc.getObjectByName('swGlow');
  if (swordLook.glow == null) { if (g) g.visible = false; return; }
  if (!g) { g = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.17, 0.1), new THREE.MeshBasicMaterial({ color: swordLook.glow, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); g.name = 'swGlow'; g.position.x = -0.62; proc.add(g); }
  g.material.color.setHex(swordLook.glow); g.visible = true;
}
function applySwordLook() { for (const sk of Object.values(SKINS)) if (sk) for (const r of sk.rigs || []) styleSword(r.holder.children[0]); }
function onEquipSword(sw) { swordMul = sw.mul; Object.assign(swordLook, { id: sw.id || 'biasa', color: sw.blade, emi: sw.emi, ei: sw.ei, glow: sw.glow }); applySwordLook(); }
loadSwordModels(() => applySwordLook());   // GLB dimuat di latar; begitu siap, pedang yang sedang dipakai diganti ke model 3D

function makeSword() {
  const s = new THREE.Group(), proc = new THREE.Group(), slot = new THREE.Group();   // proc = pedang kotak bawaan (cadangan), slot = model 3D equipment
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8d4e0, metalness: 1, roughness: 0.25 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.02), steel); blade.position.x = -0.62;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.07), new THREE.MeshStandardMaterial({ color: 0xb8902a, metalness: 1, roughness: 0.35 })); guard.position.x = -0.14;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.045), new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.7 })); grip.position.x = -0.065;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), guard.material); pom.position.x = 0.02;
  blade.castShadow = true; proc.add(blade, guard, grip, pom); s.add(proc, slot); s.userData = { proc, slot, sheath: null };
  styleSword(s); return s;   // styleSword: pedang baru langsung memakai pedang yang sedang dipakai
}

function buildFallback() { // jika louiss.vrm gagal dimuat
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 6, 12), m); body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), new THREE.MeshStandardMaterial({ color: 0xf0c8a0 })); head.position.y = 1.75;
  body.castShadow = head.castShadow = true; g.add(body, head); player.add(g);
}

// ---------- Skin (model) pemain ----------
// normal = louiss.vrm (baju petualang, sepasang pedang di pinggang). pajama = louiss_baju_tidur.vrm: otomatis dipakai selama pemain di dalam Penginapan Karavan (tanpa pedang), lalu kembali ke baju biasa saat keluar.
// Isabel punya skin sendiri (isabel_baju_tidur_penginapan.vrm, diatur kekaisaran-aula.js) dan ikut berganti lewat skinSync().
const SKINS = { normal: null, pajama: null }, PAJAMA_FILE = 'louiss_baju_tidur.vrm';
let skinCur = 'normal', skinPref = 'normal', skinPjState = 0;   // skinPref = pilihan pemain lewat tombol (hanya berlaku di dalam penginapan)
// Tombol 'Ganti Baju' (hanya muncul di dalam Penginapan Karavan)   // skinPjState: 0 belum dimuat, 1 memuat, 2 siap, -1 gagal (tetap pakai baju biasa)
function initSkin(gltf, sword) {   // siapkan satu model VRM pemain: bayangan, tulang, dan (bila sword) sepasang pedang
  const v = gltf.userData.vrm;
  VRMUtils.rotateVRM0(v); // model VRM 0.x dihadapkan ke +Z (VRM 1.0 sudah menghadap +Z)
  v.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const h = v.humanoid, b = n => h.getNormalizedBoneNode(n);
  const bn = { hips: b('hips'), spine: b('spine'), chest: b('chest'), neck: b('neck'), head: b('head'),
    lUA: b('leftUpperArm'), rUA: b('rightUpperArm'), lLA: b('leftLowerArm'), rLA: b('rightLowerArm'),
    lUL: b('leftUpperLeg'), rUL: b('rightUpperLeg'), lLL: b('leftLowerLeg'), rLL: b('rightLowerLeg'),
    lH: b('leftHand'), rH: b('rightHand') };
  const rg = [];
  if (sword) { if (bn.rH && bn.hips) rg.push(mkRig(bn.rH, bn.hips, 1)); if (bn.lH && bn.hips) rg.push(mkRig(bn.lH, bn.hips, -1)); }   // pedang kedua (cermin) di tangan kiri
  return { vrm: v, bones: bn, rigs: rg };
}
new GLTFLoader().register(p => new VRMLoaderPlugin(p)).load('louiss.vrm', gltf => {
  const s = initSkin(gltf, true); SKINS.normal = s; vrm = s.vrm; bones = s.bones; player.add(vrm.scene); rigs.push(...s.rigs);
  enterWorld();
  loadPajamaSkin();   // baju tidur dimuat di latar sejak awal (± 15 MB) supaya sudah siap saat pemain sampai di penginapan
}, undefined, err => { console.warn('Gagal memuat louiss.vrm, pakai karakter cadangan:', err); buildFallback(); enterWorld(); });
function loadPajamaSkin() {   // dimuat di latar begitu pemain tiba di Kota Kekaisaran (penginapan ada di sana), supaya saat masuk penginapan sudah siap
  if (skinPjState) return; skinPjState = 1;
  new GLTFLoader().register(p => new VRMLoaderPlugin(p)).load(PAJAMA_FILE, gltf => {
    try { SKINS.pajama = initSkin(gltf, false); skinPjState = 2; console.info('Skin baju tidur siap'); } catch (e) { skinPjState = -1; console.warn('Skin baju tidur gagal disiapkan:', e); toast('⚠️ Baju tidur gagal disiapkan (lihat console F12)', 5000); }
  }, undefined, err => { skinPjState = -1; console.warn(PAJAMA_FILE + ' gagal dimuat, tetap pakai baju biasa:', err); toast('⚠️ ' + PAJAMA_FILE + ' tidak ditemukan / gagal dimuat (cek nama & folder file)', 6000); });
}
function setSkin(name) {   // tukar model pemain (posisi & rotasi badan dipertahankan); false bila skin belum siap / sudah dipakai
  const s = SKINS[name], o = SKINS[skinCur]; if (!s || !o || name === skinCur) return false;
  for (const r of rigs) { r.anchor.attach(r.holder); r.holder.position.set(0, 0, 0); r.holder.quaternion.identity(); r.tr = 1; }   // pedang kembali ke sarung sebelum model lama dilepas
  P.drawn = false; resetFingers(); fingerCache = null;
  s.vrm.scene.position.copy(o.vrm.scene.position); s.vrm.scene.quaternion.copy(o.vrm.scene.quaternion);
  player.remove(o.vrm.scene); player.add(s.vrm.scene);
  rigs.length = 0; rigs.push(...s.rigs);
  vrm = s.vrm; bones = s.bones; skinCur = name;
  try { vrm.springBoneManager && vrm.springBoneManager.reset(); } catch (e) { /* abaikan */ }   // rambut / rok tidak melonjak setelah ditukar
  return true;
}
function skinSync() {   // tiap frame: skin mengikuti pilihan tombol di dalam Penginapan Karavan; di luar penginapan selalu baju biasa (pilihan di-reset)
  if (inKekaisaran && !skinPjState) loadPajamaSkin();
  const inside = state === 'world' && inInn;
  if (!inside) skinPref = 'normal';
  const want = inside ? skinPref : 'normal';
  if (want !== skinCur) setSkin(want);
  world.aula.isabelSkin(want);   // Isabel (bila ikut) memakai skin yang sama dengan pemain
  skinBtnUpdate(inside);
}
const skinBtn = document.createElement('button');
skinBtn.type = 'button'; skinBtn.hidden = true;
skinBtn.style.cssText = 'position:fixed;left:12px;top:42%;z-index:35;padding:10px 14px;background:rgba(28,16,12,.9);border:2px solid #d9b24a;border-radius:12px;color:#fff4dc;font:15px/1.3 system-ui,sans-serif;cursor:pointer;user-select:none;-webkit-user-select:none;box-shadow:0 4px 16px rgba(0,0,0,.5);';
skinBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); skinToggle(); });
skinBtn.addEventListener('mousedown', e => e.stopPropagation());
document.body.appendChild(skinBtn);
let skinBtnKey = '';
function skinBtnUpdate(inside) {   // tampil hanya di dalam penginapan, saat bebas bergerak; label sesuai skin yang akan dipakai
  const show = inside && !innBusy && !QT.phase && !IT.open && skinPjState !== -1 && skinPjState !== 0;
  if (skinBtn.hidden === show) skinBtn.hidden = !show;
  if (!show) return;
  const k = skinPjState === 2 ? skinPref : 'load';
  if (k !== skinBtnKey) { skinBtnKey = k; skinBtn.textContent = k === 'load' ? '⏳ Memuat baju…' : k === 'pajama' ? '🧥 Pakai Baju Biasa' : '👕 Pakai Baju Tidur'; skinBtn.style.opacity = k === 'load' ? 0.6 : 1; }
}
function skinToggle() {   // layar memudar sebentar, skin ditukar (pemain & Isabel), lalu terang lagi
  if (innBusy || QT.phase || IT.open || state !== 'world' || !inInn || skinPjState !== 2) return;
  innBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0);
  const f = $('fade'); f.style.transition = 'opacity .3s'; f.style.opacity = 1;
  setTimeout(() => {
    skinPref = skinPref === 'pajama' ? 'normal' : 'pajama'; skinSync();
    toast(skinPref === 'pajama' ? '👕 Memakai baju tidur' : '🧥 Memakai baju biasa', 2200);
    f.style.transition = 'opacity .4s'; f.style.opacity = 0;
    setTimeout(() => { innBusy = false; }, 450);
  }, 320);
}

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
  sw.userData.sheath = { body, throat, tip }; styleSword(sw);   // sarung ikut menyesuaikan panjang / lebar pedang equipment
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
// Serangan ke-4 = TEBASAN BERUNTUN: n tebasan miring (tiap `step` detik, tangan kanan & kiri bergantian) + 1 tebasan MELINGKAR 360° penutup (finT detik). Total = 2 detik.
// dmg = damage per tebasan, finDmg = damage tebasan penutup. Ubah angka-angka ini untuk mengatur jumlah tebasan / kecepatan / kekuatan.
const CX = { n: 8, step: 0.18, finT: 0.56, dmg: 13, finDmg: 36 }; CX.total = CX.n * CX.step + CX.finT;
const clamp01 = x => Math.min(1, Math.max(0, x));
let stanceK = 0; // 0 = berdiri biasa, 1 = kuda-kuda battle (halus mengikuti P.drawn: pedang terhunus saat / sesudah menyerang)
function pose(b, x, y, z, k) { // geser rotasi tulang pelan-pelan ke target (anti patah)
  if (!b) return;
  const r = b.rotation; r.x += (x - r.x) * k; r.y += (y - r.y) * k; r.z += (z - r.z) * k;
}
function poseAndAnimate(dt, spd) { // spd: 0..1 kecepatan gerak
  P.t += dt;
  if (QT.phase === 10) { backHugPose(dt); return; } // peluk dari belakang
  if (QT.phase === 9) { sleepPose(dt); return; } // tidur di kasur Penginapan Karavan
  if (QT.phase) { kneelPose(dt); return; } // berlutut di depan ratu
  if (P.vs > 0) { vsPose(dt); return; } // skill 1 mengatur pose sendiri
  if (P.sl > 0) { slPose(dt); return; } // skill 2 mengatur pose sendiri
  if (P.sm > 0) { smPose(dt); return; } // skill 3 mengatur pose sendiri
  if (P.ex > 0) { exPose(dt); return; } // skill 6 (Excalibur) mengatur pose sendiri
  if (P.pt > 0) { ptPose(dt); return; } // skill 5 (Dash Petir) mengatur pose sendiri
  const p = P.atk > 0 ? 1 - P.atk / P.dur : 0;
  const q = clamp01((p - 0.2) / 0.4), e = 1 - Math.pow(1 - q, 3); // sapuan: cepat di awal, melambat di akhir
  const ret = clamp01((p - 0.75) / 0.25); // fase 4: kembali ke posisi awal
  const phi = -0.6 + 3.3 * e; // sudut lengan: dari samping kanan karakter -> menyilang ke kiri (kiri ke kanan di layar)
  const h = P.hand; // 1 = tebasan tangan kanan, -1 = tangan kiri (bergantian tiap serangan)
  slash.rotation.z = h * (phi - Math.PI / 2 - 1.2); // ujung terang slash mengikuti ujung pedang
  { const S = DK.pow > 0 ? DKB.big : 1; slash.scale.set(h * S, S, S); } // tebasan kiri = cermin dari kanan; penguatan Dark Excalibur: raksasa
  slash.material.opacity = P.atk > 0 && !P.cross ? Math.sin(clamp01((p - 0.16) / 0.52) * Math.PI) * 0.95 : 0;
  // serangan ke-4: tebasan beruntun miring selama CX.total detik. bi = tebasan ke-berapa (CX.n = tebasan silang penutup), bu = kemajuan 0..1 dalam tebasan itu, bh = tangan (1 kanan, -1 kiri)
  const el = P.atk > 0 && P.cross ? P.dur - P.atk : -1, bT = CX.n * CX.step;
  let xo = 0, dop = 0, bi = -1, bu = 0, bh = 1, bfin = false; P.jy = 0;
  dFx[0].g.visible = dFx[1].g.visible = false;
  if (el >= 0) {
    bfin = el >= bT; bi = bfin ? CX.n : Math.min(CX.n - 1, Math.floor(el / CX.step));
    bu = clamp01(bfin ? (el - bT) / CX.finT : (el - bi * CX.step) / CX.step); bh = dkGs.on ? 1 : bi % 2 ? -1 : 1;
    const e = 1 - Math.pow(1 - clamp01((bu - (bfin ? 0.12 : 0.08)) / (bfin ? 0.6 : 0.5)), 3); // sapuan cepat di awal, melambat di akhir
    dop = Math.pow(Math.sin(Math.PI * clamp01((bu - 0.08) / 0.8)), 0.6) * 0.95; // muncul cepat, memudar pelan
    if (bfin) { dFxSet(0, 1, 0, e, 1.3, 1.6, 1.0); dFxSet(1, 1, -0.1, e, 1.5, 1.5, 1.2); } // penutup: sabit raksasa MELINGKAR mendatar mengelilingi pemain (seperti Slash Besar), 2 lapis
    else dFxSet(0, bh, 0.75 + 0.3 * Math.sin(bi * 1.9), e, 0.85 + 0.1 * e); // kemiringan tiap tebasan sedikit berbeda
    if (bu > 0.12 && bu < 0.7) { const dc = DK.pow > 0 ? DKP.sparks : undefined; lineSparks(dFxHead(0, e, bfin ? 1.6 : 1), 2, 6, 0.8, dc); if (bfin) lineSparks(dFxHead(1, e, 1.5), 2, 6, 0.8, dc); } // percikan garis mengikuti ujung sabit
  }
  xMat.opacity = xo * 0.9; xCore.opacity = xo; dMat.opacity = dop;
  cresMat.opacity = cresCore.opacity = speedMat.opacity = 0;
  if (!bones) return;
  const b = bones, k = 1 - Math.exp(-dt * 14), kf = 1 - Math.exp(-dt * 30), kg = 1 - Math.exp(-dt * 26);
  stanceK += ((P.drawn ? 1 : 0) - stanceK) * (1 - Math.exp(-dt * 5)); // masuk / keluar kuda-kuda pelan-pelan, tidak patah
  let hk = k; // kecepatan kepala (di diam disamakan dengan badan supaya kompensasi napas pas)
  P.ph += dt * (3 + spd * 6.5); // jogging: ~2.5 langkah/detik pada kecepatan penuh
  const sw = Math.sin(P.ph), co = Math.cos(P.ph), br = Math.sin(P.t * 2) * 0.02;
  const bob = P.atk > 0 || P.roll > 0 ? 0 : Math.abs(sw) * 0.07 * spd; // badan naik-turun tiap langkah
  const crouch = P.atk > 0 || P.roll > 0 ? 0 : 0.07 * (1 - spd) * stanceK; // badan turun sedikit hanya saat kuda-kuda battle
  if (vrm) vrm.scene.position.y += (bob + P.jy - crouch - vrm.scene.position.y) * kg;
  let headT = 0;
  if (P.atk > 0 && P.cross) { // serangan ke-4: tebasan beruntun miring
    const kb = 1 - Math.exp(-dt * 24), ks = 1 - Math.exp(-dt * 34), ez = x => 1 - Math.pow(1 - clamp01(x), 3);
    let deep = 0.65;
    if (!bfin) {
      // tangan penyerang: dari atas-luar (aba-aba) menebas MIRING ke bawah menyilang badan; tangan lainnya kembali ke atas bersiap (nilai dalam arah tangan kanan, tangan kiri dicerminkan)
      const e2 = ez((bu - 0.12) / 0.5), sy = 2.1 * e2, sz = -0.85 + 1.75 * e2, ry = 0.25, rz = -0.85;
      pose(b.rUA, 0, bh > 0 ? sy : ry, bh > 0 ? sz : rz, bh > 0 ? ks : k);
      if (dkGs.on) { pose(b.lUA, 0.18, 0, -1.0, k); pose(b.lLA, 0, -0.45, 0, k); } else { pose(b.lUA, 0, -(bh < 0 ? sy : ry), -(bh < 0 ? sz : rz), bh < 0 ? ks : k); pose(b.lLA, 0, 0, 0, k); }
      pose(b.rLA, 0, 0, 0, k);
      const tw = (-0.5 + 1.0 * e2) * bh; // badan memutar mengikuti tebasan (akhir satu tebasan = awal tebasan tangan lawan -> mulus)
      pose(b.spine, 0.22 + 0.1 * e2, tw * 0.6, 0, kb); pose(b.chest, 0, tw * 0.4, 0, kb); pose(b.hips, 0.08, -tw * 0.3, 0, kb);
    } else { // tebasan melingkar penutup: kuda-kuda lebar, kedua pedang menyapu satu putaran besar, badan memutar (seperti Slash Besar)
      const e2 = ez((bu - 0.12) / 0.6), px = -1.0 + 3.2 * e2, zx = 0.5 + 0.5 * e2, ty = -0.7 + 1.5 * e2; deep = 0.9;
      pose(b.rUA, 0, px, zx, ks); pose(b.rLA, 0, 0, 0, k); if (dkGs.on) { pose(b.lUA, 0.18, 0, -1.0, k); pose(b.lLA, 0, -0.45, 0, k); } else { pose(b.lUA, 0, -px, zx, ks); pose(b.lLA, 0, 0, 0, k); }
      pose(b.spine, 0.3, ty * 0.6, 0, kb); pose(b.chest, 0, ty * 0.4, 0, kb); pose(b.hips, 0.2, -ty * 0.3, 0, kb); headT = -0.1 - 0.25 * e2;
    }
    pose(b.lUL, -0.4, 0, 0.2, kb); pose(b.rUL, 0.35, 0, -0.2, kb); pose(b.lLL, deep, 0, 0, kb); pose(b.rLL, 0.25, 0, 0, kb); // kuda-kuda rendah
  } else if (P.atk > 0) {
    // 4 fase: (1) siap, pedang di sisi -> (2) ayunan dari belakang ke depan -> (3) follow through -> (4) kembali ke posisi awal
    const wd = 1 - ret, tw = (-0.55 + 1.15 * e) * h * wd; // badan memutar mengikuti tebasan
    const atkA = h > 0 ? b.rUA : b.lUA, offA = h > 0 ? b.lUA : b.rUA;
    pose(atkA, 0, h * phi * wd, h * 1.1 * ret, kf); pose(h > 0 ? b.rLA : b.lLA, 0, h * 0.9 * ret, 0, k);
    if (dkGs.on) { pose(b.lUA, 0.18, 0, -1.0, k); pose(b.lLA, 0, -0.45, 0, k); } else { pose(offA, 0.3 - 0.15 * ret, 0, -h * (0.9 + 0.2 * ret), k); pose(h > 0 ? b.lLA : b.rLA, 0, h * (0.5 * wd - 0.9 * ret), 0, k); }
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
    const A = spd, ws = 1 - A, dr = P.drawn ? 1 : 0, hv = P.heavy, sk = stanceK, bs = ws * sk; hk = kg; // A: amplitudo lari 0..1, ws: bobot diam, sk: kuda-kuda battle 0..1, bs: bobot diam yang berkuda-kuda
    // napas terengah-engah: makin cepat & dalam setelah menyerang, lalu mereda
    const ps = 0.5 + 0.9 * hv, inh = Math.pow(0.5 + 0.5 * Math.sin(P.t * (1.7 + 1.1 * hv) * 6.283), 1.4), pw = ws * ps;
    // kaki: diam biasa = berdiri tegak; diam saat battle (pedang terhunus) = kuda-kuda lebar, lutut menekuk; lari = ayunan seperti biasa
    pose(b.lUL, -sw * 0.85 * A - 0.22 * bs, 0, 0.30 * bs, kg); pose(b.rUL, sw * 0.85 * A - 0.22 * bs, 0, -0.30 * bs, kg);
    pose(b.lLL, (0.15 + Math.max(0, co) * 1.2) * A + 0.5 * bs, 0, 0, kg); pose(b.rLL, (0.15 + Math.max(0, -co) * 1.2) * A + 0.5 * bs, 0, 0, kg);
    // tangan: lari = siku ~90 derajat mengayun; diam = lengan turun di sisi (pedang terhunus: miring ke bawah-luar seperti sheet)
    const zA = 1.1 * A + (1.25 - 0.25 * dr) * ws - 0.06 * pw * inh; // dada mengembang -> lengan sedikit terangkat
    const elb = A * (0.9 + 0.5 * A) + ws * (0.25 + 0.2 * dr), ux = 0.15 * A + (0.1 + 0.08 * dr) * ws;
    pose(b.lUA, sw * 0.7 * A + ux, 0, -zA, kg); pose(b.rUA, -sw * 0.7 * A + ux, 0, zA, kg);
    pose(b.lLA, 0, -elb, 0, kg); pose(b.rLA, 0, elb, 0, kg);
    // badan: condong ke depan, naik-turun karena napas, goyang pelan saat lelah
    // (goyang lelah hanya saat battle; di luar battle badan tegak, hanya dada yang bernapas)
    pose(b.hips, 0, sw * 0.14 * A + bs * 0.05 * hv * Math.sin(P.t * 1.4), bs * 0.035 * hv * Math.sin(P.t * 0.95 + 1), kg);
    pose(b.spine, 0.04 * (A + bs) + A * 0.14 + ws * (0.2 * sk + 0.05 * sk - 0.07 * ps * inh), -sw * 0.08 * A, bs * 0.03 * hv * Math.sin(P.t * 0.95 + 2.2), kg);
    pose(b.chest, ws * (0.05 * sk - 0.08 * ps * inh), -sw * 0.12 * A, 0, kg);
    headT = ws * (-0.05 * sk + 0.15 * ps * inh); // kepala TIDAK mengangguk: ayun napas spine (0.07) + chest (0.08) dikompensasi di kepala, jadi arah kepala konstan
  }
  pose(b.head, headT, 0, 0, hk); // kepala menengadah saat menerjang, kembali normal setelahnya
}

// ---------- Musuh ----------
const enemies = [], orbs = [], rings = [];
// Bos yang mengincar Lyra: selama AI bos berjalan, posisi pemain DIPINJAMKAN ke posisi Lyra (swapIn) lalu dikembalikan (swapOut), jadi semua bidikan / kejaran / skill bos otomatis tertuju ke Lyra;
// semua damage & efek (hurtPlayer / iceHurt / knHurt / push / trap / launch) selama peminjaman dialihkan ke Lyra, bukan pemain asli.
const AIMSW = { on: false, x: 0, y: 0, z: 0 }; let aimLyra = false;
function swapIn() { const p = player.position, l = lyra.pos; AIMSW.x = p.x; AIMSW.y = p.y; AIMSW.z = p.z; p.set(l.x, l.y, l.z); AIMSW.on = true; }
function swapOut() { if (!AIMSW.on) return; player.position.set(AIMSW.x, AIMSW.y, AIMSW.z); AIMSW.on = false; }
const blasts = []; // bola api raksasa + ledakan hantaman naga
let laser = null; // laser napas naga yang sedang aktif (null = tidak ada)
// ---------- Bos level 3 Gua Kristal: Mutan (monster.glb) — menggantikan penyihir, khusus dungeon kristal (kotaMode) ----------
// Model bertulang (38 tulang Mixamo, pose awal T-pose), tinggi asli ±3,5 unit; diskalakan ke MUTANT.height, kaki di y = 0. Gerakannya dibuat lewat kode (lihat mutan-anim.js), klip bawaan model tidak dipakai.
// Taruh monster_1.glb (versi tanpa gerak) atau monster.glb di folder yang sama dengan dragon.glb; yang dicoba lebih dulu = urutan di MUTANT.files. Kalau semuanya gagal dimuat, bos kembali memakai model penyihir.
const MUTANT = { files: ['monster_1.glb', 'monster.glb'], height: 3.6, face: 0, name: 'Gorvath, Mutan Kristal' };   // face = putaran-y tambahan (radian) bila model tampak menghadap ke arah lain; 0 = menghadap +z
let mutantGltf = null;
const MUTANT_FIGHT = {   // pengaturan serangan Mutan (detik / meter)
  swingWind: 0.55, swingCd: 0.45, swingRec: 0.1,   // CAKAR: aba-aba, jeda sebelum cakar berikutnya, jeda menahan pose (makin kecil = makin rapat adu serangannya)
  jumpTime: 1.0, jumpCrouch: 0.35, jumpHeight: 4.6, jumpMaxDist: 11, slamCd: 8,   // LONCAT-HANTAM: lama total, lama jongkok, tinggi loncatan, jarak pemain maksimal agar dia mau loncat, jeda antar loncatan
};
const MUTANT_ANIM = { roarTime: 1.8 };   // lama raungan pembuka (detik); isi 0 untuk mematikan raungan
(function loadMutant(i) {   // coba file satu per satu sampai ada yang berhasil dimuat
  if (i >= MUTANT.files.length) { console.warn(MUTANT.files.join(' / ') + ' gagal dimuat — bos Gua Kristal memakai model penyihir'); return; }
  new GLTFLoader().load(MUTANT.files[i], g => { mutantGltf = g; }, undefined, () => loadMutant(i + 1));
})(0);
function buildMutant() { // klon model bertulang + mixer animasi (di-update di AI bos)
  const root = SkeletonUtils.clone(mutantGltf.scene); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), k = MUTANT.height / Math.max(0.01, box.max.y - box.min.y);
  root.scale.multiplyScalar(k); root.position.y = -box.min.y * k;
  const pivot = new THREE.Group(); pivot.rotation.y = MUTANT.face; pivot.add(root);
  let mat = null;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); if (!mat) mat = o.material; } });   // bahan diklon: kilatan terkena pukulan (emissive) tidak berbagi antar klon
  const rig = createMutantRig(THREE, root);   // animasi prosedural (null kalau tulangnya tidak lengkap)
  const mixer = new THREE.AnimationMixer(root), clip = mutantGltf.animations[0]; if (clip && !rig) mixer.clipAction(clip).play();   // klip raungan bawaan hanya dipakai kalau rig gagal
  return { pivot, mat: mat || new THREE.MeshStandardMaterial(), mixer, rig };
}
// ---------- Bos level 3 Dungeon Cahaya: Seraphim (seraphim.glb) — menggantikan penyihir emas, khusus Dungeon Cahaya (dgTheme === MAIN_DUNGEON.id, portal TENGAH di ujung lembah) ----------
// Model voxel tanpa tulang (animasi lewat node: idle / fly / spawn / pose); diskalakan ke SERAPH.height dan melayang SERAPH.hover di atas lantai. Taruh seraphim.glb di folder yang sama dengan monster.glb.
// Kalau gagal dimuat, bos kembali memakai model penyihir (tanpa serangan khusus di bawah).
// KEBAL ELEMEN CAHAYA: skill 3 (Summon Blade) & skill 6 (Excalibur) tidak melukainya (lihat hurtEnemy / e.lightImmune).
// 4 serangan, dipilih acak bergiliran (kantong acak, tidak berulang sebelum semuanya keluar):
//   1. Lima Pedang Cahaya   - 5 lingkaran sihir muncul di udara, tiap lingkaran memunculkan pedang yang menghadap pemain, lalu ditembakkan satu per satu ke POSISI pemain saat itu (bisa dihindari)
//   2. Laser Mata           - mata bersinar (aba-aba), lalu laser cahaya menyapu mengejar pemain (kecepatan kejar terbatas: berlari / berguling = lolos)
//   3. Pedang Penghakiman   - penanda merah di lantai mengikuti pemain, terkunci sebentar, lalu pedang raksasa jatuh dari atas (HP < 50%: dua pedang beruntun)
//   4. Meteor Cahaya        - bos naik sedikit & memanggil meteor emas; lingkaran emas di lantai = titik jatuh (yang pertama TEPAT di bawah pemain, lingkaran dalam membesar = hitung mundur), meteor jatuh satu per satu. HP < 50%: lebih banyak, lebih rapat & lebih cepat jatuh
const SERAPH = {
  file: 'seraphim.glb', name: 'Seraphim, Penjaga Cahaya',
  height: 5.2, hover: 0.9, face: Math.PI,   // face = putaran-y tambahan (radian): model aslinya menghadap -z, jadi PI; ubah kalau tampak membelakangi pemain
  hp: 800, sp: 3.0, r: 1.7,
  gap: 2.0, gapP2: 0.65,                    // jeda antar serangan (detik); fase 2 (HP < 50%) = gap x gapP2
  swords: { n: 5, summon: 1.3, interval: 0.3, speed: 26, dmg: 14, hitR: 1.1, scale: 0.6 },                          // summon = lama lingkaran terbentuk sebelum pedang pertama melesat; interval = jeda antar pedang
  laser: { wind: 1.0, dur: 1.9, trackSpd: 4.2, dmg: 12, width: 0.9, tick: 0.18 },                                  // trackSpd = kecepatan titik bidik mengejar pemain (m/dtk; lari pemain ±5,5)
  meteor: { wind: 1.3, n: 6, nP2: 10, interval: 0.34, intervalP2: 0.21, fall: 1.2, fallP2: 1.05, rad: 3.0, dmg: 22, spread: 8.5, H: 24, lift: 1.4 },   // wind = aba-aba (bos naik) sebelum meteor pertama; fall = lama meteor jatuh (= waktu menghindar setelah lingkaran muncul); lift = tinggi bos naik saat memanggil
  judge: { track: 1.2, lock: 0.55, fall: 0.3, rad: 4.4, dmg: 34, scale: 3.2, H: 20, stay: 0.9, gap2: 1.1 },       // track = penanda mengikuti pemain, lock = terkunci (aba-aba terakhir), fall = lama jatuh
};
let seraphGltf = null, seraphTip = false;
new GLTFLoader().load(SERAPH.file, g => { seraphGltf = g; }, undefined, () => console.warn(SERAPH.file + ' gagal dimuat — bos Dungeon Cahaya memakai model penyihir'));
const sSwords = [], sCircles = [], sJudge = [], sMeteors = [], popTexts = []; let sLaser = null;
const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), DOWN = new THREE.Vector3(0, -1, 0);
const disposeMats = g => g.traverse(o => { if (o.material) o.material.dispose(); });
function buildSeraph() {   // klon model + mixer animasi idle (di-update di seraphAI)
  const root = SkeletonUtils.clone(seraphGltf.scene); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), k = SERAPH.height / Math.max(0.01, box.max.y - box.min.y);
  root.scale.multiplyScalar(k); root.position.y = SERAPH.hover - box.min.y * k;
  const pivot = new THREE.Group(); pivot.rotation.y = SERAPH.face; pivot.add(root);
  let mat = null;
  root.traverse(o => { if (o.isMesh) { if (!mat) mat = o.material.clone(); o.material = mat; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });   // satu bahan bersama: kilatan terkena pukulan (emissive) kena ke seluruh tubuh
  const mixer = new THREE.AnimationMixer(root), clip = seraphGltf.animations.find(a => a.name === 'idle') || seraphGltf.animations[0]; if (clip) mixer.clipAction(clip).play();
  return { pivot, mat: mat || new THREE.MeshStandardMaterial(), mixer, eye: root.getObjectByName('Eye_12') || root };
}
function popText(pos, text, color = '#fff2b0') {   // teks kecil melayang naik lalu memudar (dipakai untuk 'KEBAL')
  const c = document.createElement('canvas'); c.width = 420; c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 34px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 7; x.strokeStyle = 'rgba(50,30,0,.9)'; x.strokeText(text, 210, 32); x.fillStyle = color; x.fillText(text, 210, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, fog: false })); s.scale.set(5.25, 0.8, 1); s.position.copy(pos); s.renderOrder = 10; scene.add(s); popTexts.push({ s, t: 0 });
}
function immuneFx(e) {   // pukulan skill cahaya ditangkis: tanpa luka, hanya teks + percikan (dibatasi supaya tidak membanjiri saat skill berdetak berulang)
  e.flash = 0; if (P.t - (e.immT || -9) < 0.45) return; e.immT = P.t;
  const p = e.g.position.clone(); p.y += SERAPH.hover + SERAPH.height * 0.8;
  popText(p, '☀️ KEBAL CAHAYA'); burst(p.clone().setY(p.y - 1.2), 0xfff2c0, 10, 4);
  if (!seraphTip) { seraphTip = true; toast('☀️ ' + SERAPH.name + ' kebal elemen cahaya — skill 3 (Summon Blade) & skill 6 (Excalibur) tidak mempan. Pakai serangan lain!', 4800); }
}
function seraphBlade(scale) {   // pedang cahaya (bentuk sama dengan pedang skill 3), ujung runcing di titik asal grup, menghadap ke bawah (-y lokal)
  const bl = makeBigBlade(); bl.g.scale.setScalar(scale); bl.halo.scale.set(6, 6, 1); setBladeOp(bl, 0, 0.4); return bl;
}
function setBladeOp(bl, a, ch = 0.5) { bl.steel.opacity = bl.gold.opacity = a; bl.steel.emissiveIntensity = 1 + 2 * ch; bl.aura.opacity = a * (0.2 + 0.6 * ch); bl.halo.material.opacity = a * (0.4 + 0.5 * ch); }
function makeAirCircle(pal = HOLY) {   // lingkaran sihir berdiri (bidang xy, menghadap +z lokal; diarahkan dengan lookAt)
  const g = new THREE.Group(), m = glowMat(pal.gold, 0); g.add(new THREE.Mesh(bgeo.ring1, m), new THREE.Mesh(bgeo.ring2, m));
  for (let i = 0; i < 3; i++) { const bar = new THREE.Mesh(bgeo.bar, m); bar.rotation.z = i * Math.PI / 3; g.add(bar); }
  return { g, m };
}
function segDist(p, a, b) { const ab = b.clone().sub(a), t = clamp01(p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq())); return a.clone().addScaledVector(ab, t).distanceTo(p); }
function clearSeraph() {   // bersihkan semua serangan Seraphim (bos mati / pemain kalah / keluar dungeon) + efek bos api
  clearFireBoss(); clearIceBoss(); clearKnight(); clearCaveBoss(); clearCrystalBoss();
  for (const w of sSwords) { scene.remove(w.g); disposeMats(w.g); } sSwords.length = 0;
  for (const c of sCircles) { scene.remove(c.rg.g); c.rg.m.dispose(); if (c.sw) { scene.remove(c.sw.g); disposeMats(c.sw.g); } } sCircles.length = 0;
  for (const j of sJudge) { scene.remove(j.bl.g, j.rg.g, j.warn); disposeMats(j.bl.g); j.rg.m.dispose(); j.warn.material.dispose(); j.warn.geometry.dispose(); } sJudge.length = 0;
  if (sLaser) { scene.remove(sLaser.g); sLaser.g.traverse(o => { if (o.material) o.material.dispose(); }); sLaser = null; }
  for (const m of sMeteors) { scene.remove(m.g, m.wr, m.wd); disposeMats(m.g); m.wr.material.dispose(); m.wd.material.dispose(); } sMeteors.length = 0;
}
// --- Serangan 1: Lima Pedang Cahaya ---
function seraphSwords(e, S, d, dt) {
  const C = SERAPH.swords, mid = e.g.position.clone(); mid.y += SERAPH.hover + SERAPH.height * 0.5;
  const sd = new THREE.Vector3(d.z, 0, -d.x), chest = player.position.clone().setY(player.position.y + 1.1);
  if (!S.init) {
    S.init = true; S.t = 0; S.circ = []; audio.sfx('choir', { delay: 0.1 });
    for (let i = 0; i < C.n; i++) { const rg = makeAirCircle(); rg.g.visible = false; scene.add(rg.g); const c = { rg, i, a: (i - (C.n - 1) / 2) * 0.55, sw: null, fired: false, fade: 0, t: 0, done: false }; sCircles.push(c); S.circ.push(c); }
  }
  S.t += dt;
  for (const c of S.circ) {
    if (c.done) continue;
    c.t = S.t - c.i * 0.12; if (c.t < 0) continue;
    const pos = mid.clone().addScaledVector(sd, Math.sin(c.a) * 4.6).addScaledVector(d, -0.5); pos.y += 1.6 + Math.cos(c.a) * 1.7;   // busur lingkaran di atas-samping bos
    const ap = clamp01(c.t / 0.4);
    c.rg.g.visible = true; c.rg.g.position.copy(pos); c.rg.g.lookAt(chest); c.rg.g.rotateZ(S.t * 2.5); c.rg.g.scale.setScalar(1.5 * ap);
    c.rg.m.opacity = c.fired ? 0.9 * Math.max(0, 1 - c.fade / 0.35) : 0.9 * ap;
    if (!c.sw && !c.fired && c.t >= 0.3) { c.sw = seraphBlade(C.scale); scene.add(c.sw.g); }
    if (c.sw) {   // pedang muncul dari lingkaran, ujungnya selalu menghadap pemain sampai dilepas
      const dir = chest.clone().sub(pos).normalize(), u = clamp01((c.t - 0.3) / 0.6);
      c.sw.g.position.copy(pos).addScaledVector(dir, 1.2 * u); c.sw.g.quaternion.setFromUnitVectors(DOWN, dir); setBladeOp(c.sw, u, 0.4 + 0.6 * u);
      if (S.t >= C.summon + c.i * C.interval) {   // lepas: arah DIKUNCI ke posisi pemain saat ini
        c.fired = true; const w = c.sw; c.sw = null; setBladeOp(w, 1, 1);
        sSwords.push({ g: w.g, bl: w, dir, v: dir.clone().multiplyScalar(C.speed), len: 3.4 * C.scale, life: 2.5, stuck: 0 });
        burst(w.g.position.clone(), 0xfff2c0, 8, 5);
      }
    }
    if (c.fired) { c.fade += dt; if (c.fade > 0.4) { c.done = true; scene.remove(c.rg.g); c.rg.m.dispose(); sCircles.splice(sCircles.indexOf(c), 1); } }
  }
  return S.t > C.summon + C.n * C.interval + 0.5;
}
// --- Serangan 2: Laser Mata ---
function seraphLaser(e, S, d, dt) {
  const C = SERAPH.laser;
  if (!S.init) {
    S.init = true; S.t = 0; S.tick = 0; S.aim = player.position.clone().setY(0); audio.sfx('choir', { delay: 0 });
    const g = new THREE.Group(), warn = new THREE.Mesh(BEAM_GEO, glowMat(0xffe27a, 0)), outer = new THREE.Mesh(BEAM_GEO, glowMat(0xffc83a, 0)), core = new THREE.Mesh(BEAM_GEO, glowMat(0xffffff, 0));
    const spr = () => new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const eyeG = spr(), hitG = spr(); g.add(warn, outer, core, eyeG, hitG); scene.add(g); sLaser = { g, warn, outer, core, eyeG, hitG };
  }
  const L = sLaser; if (!L) return true;
  S.t += dt;
  const eye = new THREE.Vector3(); e.eye.getWorldPosition(eye); eye.addScaledVector(d, 0.7);   // sedikit di depan wajah supaya tidak tertutup badan
  const fire = S.t >= C.wind, end = C.wind + C.dur, spd = !fire ? (S.t < C.wind - 0.35 ? 14 : 0) : C.trackSpd;   // aba-aba: bidikan mengunci pemain, 0,35 dtk terakhir diam (isyarat menghindar); menembak: mengejar pelan
  const to = player.position.clone().setY(0).sub(S.aim), l = to.length(); if (l > 0.001 && spd > 0) S.aim.addScaledVector(to, Math.min(1, spd * dt / l));
  const v = S.aim.clone().sub(eye), len = Math.max(0.1, v.length()), dir = v.clone().divideScalar(len), fade = 1 - clamp01((S.t - end) / 0.25);
  const place = (m, r) => { m.position.copy(eye).addScaledVector(dir, len / 2); m.quaternion.setFromUnitVectors(UP, dir); m.scale.set(r, len, r); };
  const flick = 0.85 + 0.15 * Math.sin(S.t * 60);
  L.eyeG.position.copy(eye); L.hitG.position.copy(S.aim).setY(0.25);
  if (!fire) {
    const p = S.t / C.wind; place(L.warn, 0.05); L.warn.material.opacity = 0.15 + 0.2 * Math.sin(S.t * 25); L.outer.material.opacity = L.core.material.opacity = 0;
    L.eyeG.material.opacity = p; L.eyeG.scale.setScalar(1 + 3 * p); L.hitG.material.opacity = 0.35 * p; L.hitG.scale.setScalar(3);
  } else {
    place(L.outer, C.width * 0.55 * flick); place(L.core, 0.22 * flick); L.warn.material.opacity = 0;
    L.outer.material.opacity = 0.55 * fade; L.core.material.opacity = 0.95 * fade; L.eyeG.material.opacity = fade; L.eyeG.scale.setScalar(4 * flick); L.hitG.material.opacity = 0.8 * fade; L.hitG.scale.setScalar(5.5 * flick);
    if (S.t < end) {
      shake = Math.max(shake, 0.12); if (Math.random() < 0.6) lineSparks(S.aim.clone().setY(0.3), 2, 7, 1, HOLY.sparks);
      if ((S.tick -= dt) <= 0) { S.tick = C.tick; if (segDist(player.position.clone().setY(player.position.y + 0.9), eye, S.aim) < C.width + PLAYER_R) hurtPlayer(C.dmg); }
    }
  }
  if (S.t >= end + 0.25) { scene.remove(L.g); L.g.traverse(o => { if (o.material) o.material.dispose(); }); sLaser = null; return true; }
  return false;
}
// --- Serangan 3: Pedang Penghakiman ---
function spawnJudge() {
  const bl = seraphBlade(SERAPH.judge.scale), rg = makeSummonRing(), warn = new THREE.Mesh(new THREE.RingGeometry(0.1, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  warn.rotation.x = -Math.PI / 2; scene.add(bl.g, rg.g, warn); sJudge.push({ bl, rg, warn, x: player.position.x, z: player.position.z, t: 0, hit: false, stuck: 0 }); audio.sfx('choir', { delay: 0.05 });
}
function judgeImpact(j) {
  const C = SERAPH.judge, pos = new THREE.Vector3(j.x, 0.3, j.z);
  hurtLyraArea(j.x, j.z, C.rad, C.dmg);
  if (Math.hypot(player.position.x - j.x, player.position.z - j.z) < C.rad) hurtPlayer(C.dmg);
  burst(pos.clone().setY(0.8), 0xfff2c0, 24, 9); lineSparks(pos.clone().setY(0.4), 50, 12, 1.4, HOLY.sparks);
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(HOLY.gold)); m.rotation.x = -Math.PI / 2; m.position.copy(pos).setY(0.1); scene.add(m); pulses.push({ m, t: 0.55, dur: 0.55, max: C.rad * 1.4 });
  const pm = new THREE.Mesh(bgeo.pillar, glowMat(0xffe48a, 0.9)); pm.position.set(j.x, 6, j.z); scene.add(pm); pillars.push({ m: pm, t: 0.5, dur: 0.5, s: 3.2 });
  shake = Math.max(shake, 1.0); audio.sfx('swordbreak', { vol: 1, rate: 0.7 });
}
function seraphJudge(e, S, d, dt) {
  const C = SERAPH.judge;
  if (!S.init) { S.init = true; S.t = 0; S.n = e.hp < e.max * 0.5 ? 2 : 1; S.spawned = 0; }
  S.t += dt;
  while (S.spawned < S.n && S.t >= S.spawned * C.gap2) { spawnJudge(); S.spawned++; }   // fase 2: pedang kedua menyusul di posisi pemain yang baru
  return S.spawned >= S.n && !sJudge.length;
}
// --- Serangan 4: Meteor Cahaya (batu emas bercahaya jatuh ke sekitar pemain; lingkaran emas di lantai = titik jatuh) ---
function spawnHolyMeteor(e, i, p2) {
  const C = SERAPH.meteor, pts = sMeteors.map(m => m.end);
  let x = player.position.x, z = player.position.z;   // meteor pertama langsung ke tempat pemain berdiri; sisanya menyebar di sekitarnya
  if (i > 0) for (let tr = 0; tr < 8; tr++) {
    const a = rnd(0, 6.28), r = rnd(1.5, C.spread); x = player.position.x + Math.cos(a) * r; z = player.position.z + Math.sin(a) * r;
    const hl = Math.hypot(x, z); if (hl > R - 1.5) { x *= (R - 1.5) / hl; z *= (R - 1.5) / hl; }
    if (pts.every(q => Math.hypot(q.x - x, q.z - z) > C.rad * 1.0)) break;
  }
  const end = new THREE.Vector3(x, 0, z), start = new THREE.Vector3(e.g.position.x + rnd(-2.5, 2.5), C.H, e.g.position.z + rnd(-2.5, 2.5)), dir = end.clone().sub(start).normalize();
  const g = new THREE.Group();
  const rock = new THREE.Mesh(METEOR_GEO, new THREE.MeshStandardMaterial({ color: 0xf2e2b0, emissive: 0xffc84a, emissiveIntensity: 1.8, roughness: 0.6, flatShading: true })); g.add(rock);
  const shell = new THREE.Mesh(METEOR_GEO, glowMat(0xffe27a, 0.5)); shell.scale.setScalar(1.35); g.add(shell);
  const tail = new THREE.Mesh(METEOR_TAIL, glowMat(0xffd24a, 0.55)), tail2 = new THREE.Mesh(METEOR_TAIL, glowMat(0xffffff, 0.8));
  tail.scale.set(1.15, 7, 1.15); tail2.scale.set(0.6, 5, 0.6); tail.quaternion.setFromUnitVectors(UP, dir.clone().negate()); tail2.quaternion.copy(tail.quaternion); g.add(tail, tail2);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffe27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(7, 7, 1); g.add(halo);
  g.position.copy(start); scene.add(g);
  const wr = new THREE.Mesh(WARN_RING, glowMat(0xffd24a, 0.6)), wd = new THREE.Mesh(WARN_DISC, glowMat(0xffd24a, 0.22));
  for (const m of [wr, wd]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); scene.add(m); } wr.scale.setScalar(C.rad); wd.scale.setScalar(0.01);
  sMeteors.push({ g, rock, tail, halo, wr, wd, start, end, dir, t: 0, fall: p2 ? C.fallP2 : C.fall });
  if (i === 0) audio.sfx('choir', { delay: 0 });
  burst(new THREE.Vector3(e.g.position.x, SERAPH.hover + SERAPH.height * 0.8, e.g.position.z), 0xfff2c0, 8, 6);
}
function holyMeteorImpact(m) {
  const C = SERAPH.meteor, p = m.end, pos = new THREE.Vector3(p.x, 0.3, p.z);
  hurtLyraArea(p.x, p.z, C.rad, C.dmg);
  if (Math.hypot(player.position.x - p.x, player.position.z - p.z) < C.rad) hurtPlayer(C.dmg);   // berguling = kebal (P.inv)
  burst(pos.clone().setY(0.9), 0xfff2c0, 24, 9); burst(pos.clone().setY(0.6), 0xffd24a, 24, 8); lineSparks(pos.clone().setY(0.4), 40, 11, 1.4, HOLY.sparks);
  const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(HOLY.gold)); rm.rotation.x = -Math.PI / 2; rm.position.copy(pos).setY(0.1); scene.add(rm); pulses.push({ m: rm, t: 0.5, dur: 0.5, max: C.rad * 1.4 });
  const pm = new THREE.Mesh(bgeo.pillar, glowMat(0xffe48a, 0.9)); pm.position.set(p.x, 6, p.z); scene.add(pm); pillars.push({ m: pm, t: 0.45, dur: 0.45, s: C.rad * 0.7 });
  shake = Math.max(shake, 0.55); audio.sfx('explosion', { vol: 0.7, rate: rnd(1.0, 1.25) });
}
function seraphMeteor(e, S, d, dt) {
  const C = SERAPH.meteor, p2 = e.hp < e.max * 0.5, n = p2 ? C.nP2 : C.n, iv = p2 ? C.intervalP2 : C.interval, tEnd = C.wind + (n - 1) * iv;
  if (!S.init) { S.init = true; S.t = 0; S.ms = 0; audio.sfx('choir', { delay: 0.05 }); }
  S.t += dt;
  const up = eio(clamp01(S.t / C.wind)) * (1 - clamp01((S.t - tEnd) / 0.5)); e.g.position.y += C.lift * up;   // bos naik sedikit saat memanggil, turun lagi sesudahnya
  if (Math.random() < 0.7 * up) { const a = rnd(0, 6.28); burst(new THREE.Vector3(e.g.position.x + Math.cos(a) * 1.6, e.g.position.y + SERAPH.hover + rnd(0.5, SERAPH.height), e.g.position.z + Math.sin(a) * 1.6), Math.random() < 0.5 ? 0xfff2c0 : 0xffd24a, 1, 1.5); }
  while (S.ms < n && S.t >= C.wind + S.ms * iv) { spawnHolyMeteor(e, S.ms, p2); S.ms++; }
  return S.ms >= n && S.t >= tEnd + 0.6;
}
// --- AI utama Seraphim: melayang menjaga jarak, menyamping pelan, lalu memilih serangan ---
function seraphAI(e, d, dist, dt) {
  const S = e.sx || (e.sx = { st: 'idle', cd: 2.2, bag: [], side: Math.random() < 0.5 ? -1 : 1, sideT: rnd(2, 4) });
  if (e.mixer) e.mixer.update(dt);
  e.g.position.y = Math.sin(P.t * 1.6 + e.ph) * 0.25;   // ayun melayang
  if (S.st === 'idle') {
    if (e.stun <= 0) {
      const fw = dist > 12 ? 1 : dist < 8 ? -1 : 0; if ((S.sideT -= dt) <= 0) { S.side = -S.side; S.sideT = rnd(2.5, 4.5); }
      e.g.position.x += (d.x * fw + d.z * S.side * 0.7) * e.sp * dt; e.g.position.z += (d.z * fw - d.x * S.side * 0.7) * e.sp * dt;
      const hl = Math.hypot(e.g.position.x, e.g.position.z); if (hl > R - 3) { e.g.position.x *= (R - 3) / hl; e.g.position.z *= (R - 3) / hl; }
    }
    if ((S.cd -= dt) <= 0) { if (!S.bag.length) S.bag = ['swords', 'laser', 'judge', 'meteor'].sort(() => Math.random() - 0.5); S.st = S.bag.pop(); S.init = false; }
  } else {
    const done = S.st === 'swords' ? seraphSwords(e, S, d, dt) : S.st === 'laser' ? seraphLaser(e, S, d, dt) : S.st === 'meteor' ? seraphMeteor(e, S, d, dt) : seraphJudge(e, S, d, dt);
    if (done) { S.st = 'idle'; S.cd = SERAPH.gap * (e.hp < e.max * 0.5 ? SERAPH.gapP2 : 1) + rnd(0, 0.7); }
  }
}
function seraphFxTick(dt) {   // pedang yang melesat, Pedang Penghakiman, meteor cahaya, teks melayang (laser & lingkaran diurus seraphAI)
  const SW = SERAPH.swords;
  for (const m of [...sMeteors]) {   // meteor cahaya: jatuh ke titik lingkaran emas
    m.t += dt; const u = Math.min(1, m.t / m.fall), k = Math.pow(u, 1.7), t = P.t;
    m.g.position.copy(m.start).lerp(m.end, k).y += 0.9 * k;
    m.g.scale.setScalar(0.3 + 0.7 * clamp01(u * 8)); m.rock.rotation.x += dt * 5; m.rock.rotation.y += dt * 3;
    const fl = 0.9 + 0.2 * Math.sin(t * 40 + m.fall * 7); m.tail.scale.set(1.15 * fl, 7, 1.15 * fl); m.halo.material.opacity = 0.75 + 0.2 * Math.sin(t * 30);
    if (Math.random() < 0.8) burst(m.g.position.clone().addScaledVector(m.dir, -rnd(0.5, 3)), Math.random() < 0.5 ? 0xfff2c0 : 0xffd24a, 1, 1.2);
    m.wr.material.opacity = 0.35 + 0.3 * Math.sin(m.t * (14 + 14 * u)); m.wd.scale.setScalar(Math.max(0.01, SERAPH.meteor.rad * u)); m.wd.material.opacity = 0.18 + 0.2 * u;
    if (u >= 1) { holyMeteorImpact(m); scene.remove(m.g, m.wr, m.wd); disposeMats(m.g); m.wr.material.dispose(); m.wd.material.dispose(); sMeteors.splice(sMeteors.indexOf(m), 1); }
  }
  for (const w of [...sSwords]) {
    const rm = () => { scene.remove(w.g); disposeMats(w.g); sSwords.splice(sSwords.indexOf(w), 1); };
    if (w.stuck > 0) { w.stuck -= dt; setBladeOp(w.bl, clamp01(w.stuck / 0.3), 0.5); if (w.stuck <= 0) rm(); continue; }
    w.life -= dt; const tip = w.g.position; tip.addScaledVector(w.v, dt);
    const ch = player.position.clone().setY(player.position.y + 1.1); let hit = false;
    for (const s of [0, 0.5, 1]) if (tip.clone().addScaledVector(w.dir, -w.len * s).distanceTo(ch) < SW.hitR) { hit = true; break; }   // ujung, tengah & pangkal bilah
    let lyHit = false;
    if (!hit && lyra.targetable) { const lc = new THREE.Vector3(lyra.pos.x, lyra.pos.y + 1.1, lyra.pos.z); for (const s of [0, 0.5, 1]) if (tip.clone().addScaledVector(w.dir, -w.len * s).distanceTo(lc) < SW.hitR) { if (hurtLyraArea(lyra.pos.x, lyra.pos.z, 1, SW.dmg)) { burst(lc, 0xfff2c0, 14, 7); rm(); lyHit = true; } break; } }
    if (lyHit) continue;
    if (hit) { hurtPlayer(SW.dmg); burst(ch, 0xfff2c0, 14, 7); lineSparks(ch, 16, 8, 1, HOLY.sparks); rm(); }
    else if (tip.y <= 0.1) { tip.y = 0.1; w.v.set(0, 0, 0); w.stuck = 0.6; burst(tip.clone().setY(0.3), 0xfff2c0, 10, 6); lineSparks(tip.clone().setY(0.2), 12, 7, 1, HOLY.sparks); }   // menancap di lantai lalu memudar
    else if (w.life <= 0 || Math.hypot(tip.x, tip.z) > R + 4) rm();
  }
  const JC = SERAPH.judge;
  for (const j of [...sJudge]) {
    j.t += dt; const tEnd = JC.track + JC.lock, tHit = tEnd + JC.fall; let y, a = 1, ch = 0.4;
    if (j.t < JC.track) { const k = 1 - Math.exp(-dt * 5); const ap = aimLyra ? lyra.pos : player.position; j.x += (ap.x - j.x) * k; j.z += (ap.z - j.z) * k; }   // penanda mengikuti pemain (atau Lyra bila bos sedang mengincarnya)
    if (j.t < tEnd) { const u = clamp01(j.t / 0.5); y = JC.H + 1.5 * (1 - u) + Math.sin(j.t * 12) * 0.15; a = u; ch = clamp01(j.t / tEnd); }
    else if (j.t < tHit) { const u = (j.t - tEnd) / JC.fall; y = JC.H * (1 - u * u) + 0.4 * u * u; ch = 1; }   // menukik makin cepat
    else { y = 0.4; ch = 1; if (!j.hit) { j.hit = true; judgeImpact(j); } j.stuck += dt; a = clamp01(1 - (j.stuck - JC.stay) / 0.3); }
    j.bl.g.position.set(j.x, y, j.z); j.bl.g.rotation.y = j.t < tEnd ? j.t * (1.5 + ch * 5) : 0; setBladeOp(j.bl, a, ch);
    j.warn.position.set(j.x, 0.06, j.z); j.warn.scale.setScalar(JC.rad); j.warn.material.opacity = j.hit ? 0 : 0.18 + 0.14 * Math.sin(j.t * (j.t > JC.track ? 30 : 12));
    j.rg.g.position.set(j.x, 0.07, j.z); j.rg.g.scale.setScalar(JC.rad * 1.05); j.rg.g.rotation.z = j.t * 2; j.rg.m.opacity = (j.hit ? 0.4 : 0.85 * clamp01(j.t / 0.4)) * a;
    if (j.t > tHit + JC.stay + 0.3) { scene.remove(j.bl.g, j.rg.g, j.warn); disposeMats(j.bl.g); j.rg.m.dispose(); j.warn.material.dispose(); j.warn.geometry.dispose(); sJudge.splice(sJudge.indexOf(j), 1); }
  }
  for (const t of [...popTexts]) { t.t += dt; t.s.position.y += dt * 1.2; t.s.material.opacity = clamp01(1 - (t.t - 0.7) / 0.5); if (t.t > 1.2) { scene.remove(t.s); t.s.material.map.dispose(); t.s.material.dispose(); popTexts.splice(popTexts.indexOf(t), 1); } }
}
// ---------- Bos level 3 Dungeon Api: Ignarok, Raja Api (fire_monster.glb) — menggantikan penyihir api, khusus Dungeon Api (dgTheme === 'api') ----------
// Model bertulang (rangka Mixamo 23 tulang, pose diam), diskalakan ke FIREBOSS.height, kaki di y = 0, menghadap +z. Gerakannya dibuat lewat kode (fireRigApply / firePose), klip bawaan model tidak dipakai.
// Taruh fire_monster.glb di folder yang sama dengan dragon.glb / seraphim.glb. Kalau gagal dimuat, bos kembali memakai model penyihir api biasa (tanpa serangan khusus di bawah).
// 3 serangan:
//   1. TINJU (jarak dekat)  - tangan ditarik ke belakang (aba-aba), lalu menonjok ke depan + ledakan api kecil & bara di lantai. HP < 50%: tinju ganda (kiri lalu kanan).
//   2. METEOR (jarak jauh)  - kedua tangan diangkat, bola api muncul di atas kepala, lalu meteor berapi jatuh ke sekitar pemain (lingkaran merah di lantai = titik jatuh) dan meninggalkan api di tanah.
//   3. DASH                 - membungkuk (aba-aba, jalur merah di lantai), lalu menerjang lurus ke tempat pemain berdiri sambil meninggalkan jejak api. Habis dash langsung disambung tinju kalau pemain masih dekat.
const FIREBOSS = {
  file: 'fire_monster.glb', name: 'Ignarok, Raja Api',
  height: 4.6, face: 0,   // face = putaran-y tambahan (radian) bila model tampak menghadap ke arah lain; 0 = menghadap +z
  hp: 650, sp: 3.1, r: 1.4, roar: 1.8,   // roar = lama raungan pembuka (detik)
  p2: 0.5, p2gap: 0.5, p2sp: 1.3,   // fase 2 (HP < 50%): jeda antar serangan dikali p2gap (dulu 0.7 -> 0.5), p2sp = pengali kecepatan jalan; meteor jauh lebih banyak + gelombang api, tinju 3x, dash 3x
  punch:  { n: 3, reachP2: 3.0, trigger: 3.2, reach: 2.3, wind: 0.6, wind2: 0.4, rec: 0.45, cd: 0.9, dmg: 24 },   // trigger = jarak (di luar radius badan) bos mulai menonjok; reach = radius kena di titik tinju
  meteor: { nP2: 14, intervalP2: 0.17, fallP2: 1.0, radP2: 3.7, spreadP2: 11, dmgP2: 30, cd: 8, wind: 1.2, n: 5, interval: 0.3, fall: 1.15, rad: 3.2, dmg: 26, H: 24, spread: 9, rec: 0.7, minDist: 6.5 },   // fall = lama meteor jatuh (= waktu menghindar setelah lingkaran muncul)
  dash:   { chainN: 2, teleChain: 0.32, cd: 6.5, minDist: 6, tele: 0.85, lock: 0.25, speed: 26, over: 3, maxLen: 22, width: 2.8, dmg: 30, rec: 0.7 },   // lock = sisa aba-aba saat arah dikunci; over = jarak menerjang melewati pemain
  burn:   { dur: 2.6, dmg: 6, tick: 0.7 },   // api yang tertinggal di lantai
  nova:   { rings: [5, 8, 11], n: [7, 11, 15], rad: 1.8, warn: 1.0, gap: 0.35, dur: 2.8, dmg: 9, hit: 16 },   // fase 2: GELOMBANG API di sekeliling bos (3 cincin kolam api, menyala bergiliran dari dalam ke luar; ada celah antar kolam; hit = damage saat kolam menyala)
};
const FB_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];   // urutan induk -> anak
let fireGltf = null;
new GLTFLoader().load(FIREBOSS.file, g => { fireGltf = g; }, undefined, () => console.warn(FIREBOSS.file + ' gagal dimuat — bos Dungeon Api memakai model penyihir'));
const fMeteors = [], fBurns = [], fNova = []; let fLane = null;
const METEOR_GEO = new THREE.IcosahedronGeometry(1, 1), METEOR_TAIL = new THREE.ConeGeometry(1, 1, 10, 1, true).translate(0, 0.5, 0);   // ekor: pangkal di y=0 (di batu), ujung di y=1 (diarahkan ke belakang lintasan)
const BURN_GEO = new THREE.CircleGeometry(1, 36), BURN_FLAME = new THREE.ConeGeometry(0.4, 1, 7, 1, true).translate(0, 0.5, 0), WARN_RING = new THREE.RingGeometry(0.93, 1, 48), WARN_DISC = new THREE.CircleGeometry(1, 40), LANE_GEO = new THREE.BoxGeometry(1, 0.04, 1);
const _fbQ = new THREE.Quaternion(), _fbP = new THREE.Quaternion(), _fbD = new THREE.Quaternion(), _fbG = new THREE.Quaternion(), _fbE = new THREE.Euler(0, 0, 0, 'YXZ'), _fbV = new THREE.Vector3();
const eio = t => t * t * (3 - 2 * t);
function buildFireBoss() {   // klon model + rangka animasi kode (di-update di firePose)
  const root = SkeletonUtils.clone(fireGltf.scene); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), k = FIREBOSS.height / Math.max(0.01, box.max.y - box.min.y);
  root.scale.multiplyScalar(k); root.position.y = -box.min.y * k;
  const face = new THREE.Group(); face.rotation.y = FIREBOSS.face; face.add(root);
  const lean = new THREE.Group(); lean.add(face);   // lean: condong ke depan/belakang dengan poros di kaki + naik-turun + maju (lunge)
  const bone = {}; root.traverse(o => { if (o.isBone) { const nm = o.name.replace(/^mixamorig:?/, '').replace(/_\d+$/, ''); if (FB_BONES.includes(nm)) bone[nm] = o; } });
  root.updateMatrixWorld(true); if (bone.Hips) { bone.Hips.getWorldPosition(_fbV); root.position.x -= _fbV.x; root.position.z -= _fbV.z; }   // pusatkan badan pada pinggul (jambul api di kepala membuat kotak pembatas tidak simetris)
  let mat = null;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); if (!mat) mat = o.material; } });   // bahan diklon: kilatan terkena pukulan (emissive) tidak berbagi antar klon
  const rest = {}, parentName = {}, cur = {};
  for (const nm of FB_BONES) {
    const b = bone[nm]; if (!b) continue;
    rest[nm] = b.quaternion.clone(); cur[nm] = [0, 0, 0];
    let p = b.parent; parentName[nm] = null; while (p && p !== root) { const pn = FB_BONES.find(n => bone[n] === p); if (pn) { parentName[nm] = pn; break; } p = p.parent; }
  }
  const rig = bone.Hips && bone.Spine2 && bone.LeftArm && bone.RightArm ? { bone, rest, parentName } : null;   // null kalau tulang tidak lengkap: bos tetap tampil (hanya condong & naik-turun)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xff6a20, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));   // bola api di atas kepala saat memanggil meteor
  halo.position.set(0, FIREBOSS.height + 1.3, 0.2); halo.visible = false;
  return { lean, halo, mat: mat || new THREE.MeshStandardMaterial(), rig, cur, lv: 0, lf: 0, lg: 0, ph: 0, hk: 0, heat: 0, lp: new THREE.Vector3(), light: null };
}
function fireRigApply(rig, g, cur) {   // tiap tulang diputar oleh rotasi "delta" yang dinyatakan di kerangka bos (x = kiri, y = atas, z = depan), jadi tidak bergantung pada arah sumbu tulang di model
  g.getWorldQuaternion(_fbG).invert();
  const rel = {};
  for (const nm of FB_BONES) {
    const b = rig.bone[nm]; if (!b) continue;
    const pn = rig.parentName[nm]; let pr;
    if (pn && rel[pn]) pr = rel[pn]; else { b.parent.getWorldQuaternion(_fbP); pr = _fbG.clone().multiply(_fbP); }
    const c = cur[nm];
    if (c[0] || c[1] || c[2]) { _fbD.setFromEuler(_fbE.set(c[0], c[1], c[2], 'YXZ')); b.quaternion.copy(pr).invert().multiply(_fbD).multiply(pr).multiply(rig.rest[nm]); }
    else b.quaternion.copy(rig.rest[nm]);
    rel[nm] = pr.clone().multiply(b.quaternion);
  }
}
function firePose(e, dt, dying) {   // pose tubuh sesuai keadaan serangan (e.atk / e.rec / e.rk) + denyut api
  const S = e.fb, F = FIREBOSS, gp = e.g.position, t = P.t;
  const speed = dt > 1e-4 ? Math.hypot(gp.x - S.lp.x, gp.z - S.lp.z) / dt : 0; S.lp.copy(gp);
  const T = {}, add = (nm, x = 0, y = 0, z = 0) => { const a = T[nm] || (T[nm] = [0, 0, 0]); a[0] += x; a[1] += y; a[2] += z; };
  let lean = 0, lift = 0, lunge = 0, rate = 10, heat = S.p2 ? 0.35 : 0, halo = 0;
  const dash = e.atk === 'dash', side = e.side || 1, arm = side > 0 ? 'Right' : 'Left', oth = side > 0 ? 'Left' : 'Right', inn = side > 0 ? 1 : -1;   // side +1 = tangan kanan bos
  const w = dying || (e.atk && !dash) ? 0 : clamp01((dash ? 30 : speed) / 3);
  S.ph += (dash ? 15 : Math.min(speed, 6) * 1.05) * dt;
  const sw = Math.sin(S.ph), br = Math.sin(t * 1.7 + e.ph), amp = dash ? 0.85 : 0.5;
  add('LeftUpLeg', -sw * amp * w); add('RightUpLeg', sw * amp * w); add('LeftLeg', Math.max(0, -sw) * 0.75 * w); add('RightLeg', Math.max(0, sw) * 0.75 * w);   // jalan: paha maju-mundur, lutut menekuk
  add('LeftArm', sw * 0.4 * w); add('RightArm', -sw * 0.4 * w); add('Spine2', br * 0.02, sw * 0.06 * w); add('Head', -br * 0.02);
  lift = Math.abs(sw) * 0.1 * w + br * 0.03 + 0.04; lean = 0.07 * w;
  if (dying) {   // runtuh perlahan: berlutut & menunduk
    const p = clamp01((1 - slow.t / SLOW_TOTAL) / SLOW_DEATH); rate = 6; lean = 0.1 + 0.55 * p; lift = -0.05 * p; heat = 0.8 * (1 - p);
    add('Head', 0.6 * p); add('Spine1', 0.3 * p); add('LeftArm', 0.5 * p, 0, 0.3 * p); add('RightArm', 0.5 * p, 0, -0.3 * p);
    add('LeftUpLeg', -0.6 * p); add('LeftLeg', 0.9 * p); add('RightUpLeg', -0.6 * p); add('RightLeg', 0.9 * p);
  } else if (e.atk === 'roar') {   // raungan: kepala menengadah, tangan terbuka lebar
    const p = clamp01(1 - e.at / Math.max(0.01, S.roarT)), s = clamp01(p * 5) * (1 - clamp01((p - 0.8) * 5)); rate = 12; heat = Math.max(heat, s);
    add('LeftArm', -0.3 * s, 0, 1.6 * s); add('RightArm', -0.3 * s, 0, -1.6 * s); add('Head', -0.55 * s); add('Spine2', -0.4 * s); add('Spine', 0, Math.sin(t * 40) * 0.04 * s); lean = -0.12 * s;
  } else if (e.atk === 'punch') {   // aba-aba tinju: tangan ditarik ke belakang, badan memutar
    const wt = S.chained ? F.punch.wind2 : F.punch.wind, u = eio(clamp01(1 - e.at / wt)); rate = 16; heat = Math.max(heat, u);
    add(arm + 'Arm', 1.4 * u, inn * 0.3 * u); add(arm + 'ForeArm', -1.7 * u); add(oth + 'Arm', -0.5 * u, -inn * 0.2 * u); add('Spine2', 0, -side * 0.55 * u); add('Spine', 0, -side * 0.2 * u); lean = -0.1 * u;
  } else if (e.rec > 0 && e.rk === 'punch') {   // tinju kena: lengan terjulur, badan menerjang ke depan
    rate = 32; heat = 1; add(arm + 'Arm', -1.45, inn * 0.55); add(arm + 'ForeArm', -0.15); add(oth + 'Arm', 0.4, -inn * 0.2); add('Spine2', 0, side * 0.4); lean = 0.28; lunge = 0.7;
  } else if (e.atk === 'meteor') {   // memanggil meteor: kedua tangan terangkat, dada membusung
    const u = eio(clamp01(e.mt / F.meteor.wind)), wob = Math.sin(t * 16) * 0.07 * u; rate = 9; heat = Math.max(heat, u); halo = u;
    add('LeftArm', -0.35 * u, 0, 2.1 * u + wob); add('RightArm', -0.35 * u, 0, -2.1 * u - wob); add('Head', -0.45 * u); add('Spine2', -0.3 * u); lean = -0.1 * u;
  } else if (e.rec > 0 && e.rk === 'meteor') {   // tangan dihempas turun
    rate = 14; heat = Math.max(heat, 0.4); add('LeftArm', 0.3, 0, 0.1); add('RightArm', 0.3, 0, -0.1); lean = 0.12;
  } else if (e.atk === 'dtele') {   // aba-aba dash: membungkuk seperti akan berlari, tubuh bergetar
    const u = eio(clamp01(1 - e.at / F.dash.tele)); rate = 12; heat = Math.max(heat, u); lean = 0.42 * u;
    add('LeftArm', 1.2 * u, 0, 0.15 * u); add('RightArm', 1.2 * u, 0, -0.15 * u); add('LeftUpLeg', -0.7 * u); add('LeftLeg', 1.0 * u); add('RightUpLeg', 0.35 * u); add('RightLeg', 0.5 * u); add('Head', 0.25 * u); add('Spine', 0, Math.sin(t * 50) * 0.03 * u);
  } else if (dash) {   // menerjang: badan condong, tangan di belakang, kaki berlari cepat
    rate = 14; heat = 1; lean = 0.55; lift += 0.1; add('LeftArm', 1.3, 0, 0.2); add('RightArm', 1.3, 0, -0.2); add('Head', 0.2);
  } else if (e.rec > 0 && e.rk === 'dash') { rate = 8; heat = Math.max(heat, 0.5); lean = 0.2; add('Spine', 0.1); }
  if (e.stun > 0 && !dying) { lean -= 0.25; add('Head', 0.3); rate = 24; }   // terkena pukulan: terhentak ke belakang
  S.heat += (heat - S.heat) * (1 - Math.exp(-dt * 8));
  const kk = 1 - Math.exp(-rate * dt);
  for (const nm of FB_BONES) { const c = S.cur[nm]; if (!c) continue; const tg = T[nm]; for (let i = 0; i < 3; i++) c[i] += ((tg ? tg[i] : 0) - c[i]) * kk; }
  S.lv += (lean - S.lv) * kk; S.lf += (lift - S.lf) * kk; S.lg += (lunge - S.lg) * kk;
  S.lean.rotation.x = S.lv; S.lean.position.set(0, S.lf, S.lg);
  if (S.rig) fireRigApply(S.rig, e.g, S.cur);
  S.hk += (halo - S.hk) * (1 - Math.exp(-dt * 7)); S.halo.visible = S.hk > 0.02; S.halo.material.opacity = 0.95 * S.hk; S.halo.scale.setScalar(2 + 7 * S.hk * (1 + 0.08 * Math.sin(t * 25)));
  if (S.light) S.light.intensity = 12 + S.heat * 22 + Math.sin(t * 9) * 3;
  if (dying) { e.mat.emissiveIntensity = 1.6; return; }
  e.mat.emissive.setHex(0xffffff); e.mat.emissiveIntensity = 1 + S.heat * 0.9 + (e.flash > 0 ? 2.2 : 0);   // tekstur emissive model = nyala api; setelah garis umum di updateEnemies yang menimpa warna emissive
  if (Math.random() < 0.35 + 0.4 * S.heat) { const a = rnd(0, 6.28); burst(new THREE.Vector3(gp.x + Math.cos(a) * 0.8, rnd(0.5, 3.8), gp.z + Math.sin(a) * 0.8), Math.random() < 0.5 ? 0xff7a20 : 0xffc060, 1, 1.5); }   // bara api beterbangan
}
// --- api yang tertinggal di lantai (bekas tinju, meteor & jejak dash): cakram menyala + lidah api, melukai pemain yang berdiri di dalamnya ---
function addBurn(x, z, rad, dur, dmg) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const disc = new THREE.Mesh(BURN_GEO, glowMat(0xff4a10, 0.3)); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; disc.scale.setScalar(rad); g.add(disc);
  const fl = [], n = Math.max(4, Math.round(rad * 2.4));
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(BURN_FLAME, glowMat(i % 2 ? 0xff8a20 : 0xffc040, 0.75)), a = rnd(0, 6.28), r = rad * Math.sqrt(Math.random()) * 0.9;
    f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); f.userData.ph = rnd(0, 6.28); f.userData.h = rnd(0.9, 1.8) * (0.6 + rad * 0.25); g.add(f); fl.push(f);
  }
  scene.add(g); fBurns.push({ g, disc, fl, x, z, rad, dmg, t: 0, dur, tick: 0.25 });
}
// --- Meteor: batu berapi jatuh dari atas bos ke titik di sekitar pemain; lingkaran merah di lantai = titik jatuh (lingkaran dalam membesar = hitung mundur) ---
function spawnMeteor(e, i, n) {
  const C = FIREBOSS.meteor, pts = fMeteors.filter(m => !m.done).map(m => m.end), p2 = !!(e.fb && e.fb.p2), mr = p2 ? C.radP2 : C.rad;   // fase 2: meteor lebih besar, lebih cepat jatuh, tersebar lebih luas
  let x = player.position.x, z = player.position.z;   // meteor pertama langsung ke tempat pemain berdiri; sisanya menyebar di sekitarnya
  if (i > 0) for (let tr = 0; tr < 8; tr++) {
    const a = rnd(0, 6.28), r = rnd(1.5, p2 ? C.spreadP2 : C.spread); x = player.position.x + Math.cos(a) * r; z = player.position.z + Math.sin(a) * r;
    const hl = Math.hypot(x, z); if (hl > R - 1.5) { x *= (R - 1.5) / hl; z *= (R - 1.5) / hl; }
    if (pts.every(p => Math.hypot(p.x - x, p.z - z) > mr * 1.0)) break;
  }
  const end = new THREE.Vector3(x, 0, z), start = new THREE.Vector3(e.g.position.x + rnd(-2.5, 2.5), C.H, e.g.position.z + rnd(-2.5, 2.5)), dir = end.clone().sub(start).normalize();
  const g = new THREE.Group();
  const rock = new THREE.Mesh(METEOR_GEO, new THREE.MeshStandardMaterial({ color: 0x2a0e08, emissive: 0xff4a10, emissiveIntensity: 1.7, roughness: 0.85, flatShading: true })); rock.scale.setScalar(1.0); g.add(rock);
  const shell = new THREE.Mesh(METEOR_GEO, glowMat(0xff5a10, 0.5)); shell.scale.setScalar(1.35); g.add(shell);
  const tail = new THREE.Mesh(METEOR_TAIL, glowMat(0xff6a18, 0.55)), tail2 = new THREE.Mesh(METEOR_TAIL, glowMat(0xffd070, 0.8));
  tail.scale.set(1.15, 7, 1.15); tail2.scale.set(0.6, 5, 0.6); tail.quaternion.setFromUnitVectors(UP, dir.clone().negate()); tail2.quaternion.copy(tail.quaternion); g.add(tail, tail2);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xff7a30, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(7, 7, 1); g.add(halo);
  g.position.copy(start); g.visible = true; scene.add(g);
  const wr = new THREE.Mesh(WARN_RING, glowMat(0xff3010, 0.6)), wd = new THREE.Mesh(WARN_DISC, glowMat(0xff3010, 0.22));
  for (const m of [wr, wd]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); scene.add(m); } wr.scale.setScalar(mr); wd.scale.setScalar(0.01);
  fMeteors.push({ g, rock, shell, tail, tail2, halo, wr, wd, start, end, dir, t: 0, fall: p2 ? C.fallP2 : C.fall, rad: mr, dmg: p2 ? C.dmgP2 : C.dmg, done: false });
  if (i === 0) audio.sfx('fireball', { vol: 0.7 });
  const top = new THREE.Vector3(e.g.position.x, FIREBOSS.height + 1.3, e.g.position.z); burst(top, 0xffa040, 8, 6);
}
function meteorImpact(m) {
  const p = m.end, pos = new THREE.Vector3(p.x, 0.3, p.z);
  hurtLyraArea(p.x, p.z, m.rad, m.dmg);
  if (Math.hypot(player.position.x - p.x, player.position.z - p.z) < m.rad) hurtPlayer(m.dmg);   // berguling = kebal (P.inv)
  burst(pos.clone().setY(0.9), 0xffe0a0, 24, 9); burst(pos.clone().setY(0.6), 0xff5018, 26, 8); lineSparks(pos.clone().setY(0.4), 34, 11, 1.4, [0xffe0a0, 0xff6a18]);
  const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(0xff7a20)); rm.rotation.x = -Math.PI / 2; rm.position.copy(pos).setY(0.1); scene.add(rm); pulses.push({ m: rm, t: 0.5, dur: 0.5, max: m.rad * 1.35 });
  const pm = new THREE.Mesh(bgeo.pillar, glowMat(0xff6a18, 0.9)); pm.position.set(p.x, 6, p.z); scene.add(pm); pillars.push({ m: pm, t: 0.45, dur: 0.45, s: m.rad * 0.7 });
  addBurn(p.x, p.z, m.rad * 0.85, FIREBOSS.burn.dur, FIREBOSS.burn.dmg);
  shake = Math.max(shake, 0.55); audio.sfx('explosion', { vol: 0.75, rate: rnd(0.9, 1.1) });
}
function startNova(e) {   // fase 2: cincin-cincin kolam api (peringatan merah dulu, lalu menyala bergiliran dari cincin dalam ke luar)
  const C = FIREBOSS.nova, gp = e.g.position;
  C.rings.forEach((r, k) => {
    const n = C.n[k], a0 = rnd(0, 6.28);
    for (let j = 0; j < n; j++) {
      const a = a0 + j / n * Math.PI * 2, x = gp.x + Math.cos(a) * r, z = gp.z + Math.sin(a) * r;
      if (Math.hypot(x, z) > R - 0.8) continue;
      const wr = new THREE.Mesh(WARN_RING, glowMat(0xff3010, 0.6)), wd = new THREE.Mesh(WARN_DISC, glowMat(0xff3010, 0.22));
      for (const m of [wr, wd]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); m.scale.setScalar(C.rad); scene.add(m); }
      fNova.push({ x, z, wr, wd, t: 0, at: C.warn + k * C.gap });
    }
  });
  burst(gp.clone().setY(0.4), 0xff7a20, 24, 9); shake = Math.max(shake, 0.5);
}
function clearFireBoss() {   // bersihkan semua efek bos api (bos mati / pemain kalah / keluar dungeon)
  for (const n of fNova) { scene.remove(n.wr, n.wd); n.wr.material.dispose(); n.wd.material.dispose(); } fNova.length = 0;
  for (const m of fMeteors) { scene.remove(m.g, m.wr, m.wd); disposeMats(m.g); m.wr.material.dispose(); m.wd.material.dispose(); } fMeteors.length = 0;
  for (const b of fBurns) { scene.remove(b.g); disposeMats(b.g); } fBurns.length = 0;
  if (fLane) { scene.remove(fLane); fLane.material.dispose(); fLane = null; }
}
function fireFxTick(dt) {   // meteor yang jatuh, api di lantai (AI bos mengurus sisanya)
  const t = P.t;
  for (const n of [...fNova]) {   // kolam api gelombang: peringatan berkedip -> menyala (melukai yang berdiri di situ) -> meninggalkan api
    n.t += dt; const u = clamp01(n.t / n.at), C = FIREBOSS.nova;
    n.wr.material.opacity = 0.35 + 0.3 * Math.sin(n.t * (14 + 14 * u)); n.wd.scale.setScalar(Math.max(0.01, C.rad * u)); n.wd.material.opacity = 0.18 + 0.2 * u;
    if (n.t >= n.at) {
      if (Math.hypot(player.position.x - n.x, player.position.z - n.z) < C.rad && !(P.air && player.position.y > 1.0)) hurtPlayer(C.hit);
      const pos = new THREE.Vector3(n.x, 0.3, n.z); burst(pos.clone().setY(0.8), 0xff7a20, 12, 8); burst(pos.clone().setY(0.5), 0xffe0a0, 6, 6);
      addBurn(n.x, n.z, C.rad, C.dur, C.dmg); audio.sfx('explosion', { vol: 0.35, rate: rnd(1.0, 1.3) });
      scene.remove(n.wr, n.wd); n.wr.material.dispose(); n.wd.material.dispose(); fNova.splice(fNova.indexOf(n), 1);
    }
  }
  for (const m of [...fMeteors]) {
    m.t += dt; const u = Math.min(1, m.t / m.fall), k = Math.pow(u, 1.7);
    m.g.position.copy(m.start).lerp(m.end, k).y += 0.9 * k;   // pusat batu sedikit di atas lantai saat mendarat
    const sc = clamp01(u * 8); m.g.scale.setScalar(0.3 + 0.7 * sc); m.rock.rotation.x += dt * 5; m.rock.rotation.y += dt * 3;
    const fl = 0.9 + 0.2 * Math.sin(t * 40 + m.fall * 7); m.tail.scale.set(1.15 * fl, 7, 1.15 * fl); m.halo.material.opacity = 0.75 + 0.2 * Math.sin(t * 30);
    if (Math.random() < 0.8) burst(m.g.position.clone().addScaledVector(m.dir, -rnd(0.5, 3)), Math.random() < 0.5 ? 0xff7a20 : 0xffc060, 1, 1.2);
    m.wr.material.opacity = 0.35 + 0.3 * Math.sin(m.t * (14 + 14 * u)); m.wd.scale.setScalar(Math.max(0.01, m.rad * u)); m.wd.material.opacity = 0.18 + 0.2 * u;
    if (u >= 1) { m.done = true; meteorImpact(m); scene.remove(m.g, m.wr, m.wd); disposeMats(m.g); m.wr.material.dispose(); m.wd.material.dispose(); fMeteors.splice(fMeteors.indexOf(m), 1); }
  }
  for (const b of [...fBurns]) {
    b.t += dt; const fade = clamp01((b.dur - b.t) / 0.6) * clamp01(b.t / 0.2);
    b.disc.material.opacity = 0.3 * fade * (0.8 + 0.2 * Math.sin(t * 9));
    for (const f of b.fl) { const ph = f.userData.ph; f.scale.set(1, Math.max(0.01, f.userData.h * (0.7 + 0.3 * Math.sin(t * 12 + ph)) * fade), 1); f.material.opacity = 0.75 * fade; }
    if (Math.random() < 0.25 * fade) burst(new THREE.Vector3(b.x + rnd(-b.rad, b.rad) * 0.8, 0.3, b.z + rnd(-b.rad, b.rad) * 0.8), 0xff8a30, 1, 1.5);
    if (fade > 0.3 && (b.tick -= dt) <= 0) { b.tick = FIREBOSS.burn.tick; hurtLyraArea(b.x, b.z, b.rad * 0.95, b.dmg); if (!P.air && Math.hypot(player.position.x - b.x, player.position.z - b.z) < b.rad * 0.95) hurtPlayer(b.dmg); }
    if (b.t >= b.dur) { scene.remove(b.g); disposeMats(b.g); fBurns.splice(fBurns.indexOf(b), 1); }
  }
  if (fLane) { fLane.material.opacity = 0.22 + 0.2 * Math.sin(t * 28); }
}
// --- AI utama Ignarok: mengejar pemain, lalu memilih tinju (dekat), meteor / dash (jauh) ---
function fireBossAI(e, d, dist, dt) {
  const F = FIREBOSS, S = e.fb, gp = e.g.position; gp.y = 0;
  S.mcd -= dt; S.dcd -= dt;
  const clampArena = () => { const hl = Math.hypot(gp.x, gp.z); if (hl > R - 2) { gp.x *= (R - 2) / hl; gp.z *= (R - 2) / hl; } };
  const p2 = e.hp < e.max * F.p2, gm = p2 ? F.p2gap : 1, face = v => { e.g.rotation.y = Math.atan2(v.x, v.z); };
  if (p2 && !S.p2 && !e.atk) {   // masuk fase 2: meraung lagi, api makin ganas
    S.p2 = true; e.atk = 'roar'; S.roarT = 1.2; e.at = 1.2; e.rec = 0; audio.sfx('roar'); shake = Math.max(shake, 0.8);
    burst(gp.clone().setY(2), 0xff7a20, 40, 10); const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(0xff7a20)); rm.rotation.x = -Math.PI / 2; rm.position.set(gp.x, 0.1, gp.z); scene.add(rm); pulses.push({ m: rm, t: 0.8, dur: 0.8, max: 9 });
    S.mcd = Math.min(S.mcd, 2.5); S.dcd = Math.min(S.dcd, 3); e.sp = F.sp * F.p2sp;   // mengamuk: jalan lebih cepat
  }
  if (e.atk === 'roar') {
    e.at -= dt; if (Math.random() < 0.5) burst(gp.clone().setY(rnd(1, 4)), 0xff7a20, 2, 6); if (e.at <= 0) e.atk = null;
  } else if (e.atk === 'punch') {   // aba-aba tinju; arah dikunci 0,18 dtk terakhir (bisa dihindari ke samping)
    e.at -= dt; if (e.at > 0.18) S.pdir.copy(d); face(S.pdir);
    if (e.at <= 0) {
      e.atk = null; const fp = gp.clone().addScaledVector(S.pdir, e.r + 1.7);
      if (Math.hypot(player.position.x - fp.x, player.position.z - fp.z) < (p2 ? F.punch.reachP2 : F.punch.reach)) hurtPlayer(F.punch.dmg);
      const hp = fp.clone().setY(2); burst(hp, 0xff7a20, 22, 8); burst(hp, 0xffe0a0, 10, 6); lineSparks(hp, 24, 9, 0.8, [0xffe0a0, 0xff6a18]);
      const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(0xff7a20)); rm.rotation.x = -Math.PI / 2; rm.position.set(fp.x, 0.1, fp.z); scene.add(rm); pulses.push({ m: rm, t: 0.4, dur: 0.4, max: 3.4 });
      addBurn(fp.x, fp.z, 1.7, 1.6, Math.round(F.punch.dmg * 0.2)); shake = Math.max(shake, 0.5); audio.sfx('thud', { vol: 1, rate: 0.55 });
      if (p2 && (S.chained | 0) < F.punch.n - 1) { S.chained = (S.chained | 0) + 1; e.atk = 'punch'; e.at = F.punch.wind2; e.side = -(e.side || -1); S.pdir.copy(d); }   // fase 2: tinju 3x beruntun, tangan kiri-kanan bergantian (chained = hitungan tinju lanjutan)
      else { S.chained = false; e.rec = F.punch.rec; e.rk = 'punch'; e.cd = F.punch.cd * gm; }
    }
  } else if (e.atk === 'meteor') {   // memanggil meteor satu per satu sambil berdiri diam
    e.mt += dt; const n = p2 ? F.meteor.nP2 : F.meteor.n, iv = p2 ? F.meteor.intervalP2 : F.meteor.interval;
    if (p2 && !S.nv && e.mt >= F.meteor.wind) { S.nv = true; startNova(e); }   // fase 2: gelombang api muncul bersamaan dengan hujan meteor
    while (S.ms < n && e.mt >= F.meteor.wind + S.ms * iv) { spawnMeteor(e, S.ms, n); S.ms++; }
    if (S.ms >= n && e.mt >= F.meteor.wind + (n - 1) * iv + 0.4) { e.atk = null; e.rec = F.meteor.rec; e.rk = 'meteor'; S.mcd = F.meteor.cd * gm; e.cd = Math.max(e.cd, 0.6); }
  } else if (e.atk === 'dtele') {   // aba-aba dash: jalur mengikuti pemain, lalu terkunci (jalur berkedip) sebelum menerjang
    e.at -= dt; const D = F.dash;
    if (e.at > D.lock) { S.dd.copy(d); S.dlen = Math.min(D.maxLen, dist + D.over); }
    face(S.dd);
    if (fLane) { fLane.scale.set(D.width, 1, S.dlen); fLane.position.set(gp.x, 0.06, gp.z).addScaledVector(S.dd, S.dlen / 2); fLane.rotation.y = Math.atan2(S.dd.x, S.dd.z); }
    if (e.at <= 0) { e.atk = 'dash'; S.dleft = S.dlen; S.dhit = false; S.dtrail = 0; S.dpuff = 0; audio.sfx('roar', { vol: 0.6, rate: 1.4 }); }
  } else if (e.atk === 'dash') {   // menerjang lurus sepanjang jalur; jejak api tertinggal di lantai
    const D = F.dash, step = Math.min(S.dleft, D.speed * dt); gp.addScaledVector(S.dd, step); S.dleft -= step; face(S.dd); clampArena();
    if (!S.dhit && dist < e.r + 1.0) {
      S.dhit = true; hurtPlayer(D.dmg); shake = Math.max(shake, 0.6);
      const pp = player.position.clone().sub(gp).setY(0), sg = (pp.x * -S.dd.z + pp.z * S.dd.x) >= 0 ? 1 : -1;   // pemain terdorong ke samping jalur
      player.position.x += -S.dd.z * sg * 2.5; player.position.z += S.dd.x * sg * 2.5;
    }
    S.dpuff -= dt; if (S.dpuff <= 0) { S.dpuff = 0.05; burst(gp.clone().setY(0.4), 0xff7a20, 3, 4); burst(gp.clone().setY(1.2), 0xffc060, 2, 3); }
    S.dtrail += step; if (S.dtrail >= (S.p2 ? 1.6 : 2.4)) { S.dtrail = 0; addBurn(gp.x, gp.z, S.p2 ? 1.8 : 1.3, S.p2 ? 2.4 : 1.6, Math.round(F.burn.dmg * (S.p2 ? 1.2 : 0.8))); }   // fase 2: jejak api lebih rapat, lebih besar & lebih lama
    if (S.dleft <= 0.01 || Math.hypot(gp.x, gp.z) >= R - 2.01) {
      e.atk = null; e.rec = D.rec; e.rk = 'dash'; S.dcd = D.cd * gm; e.cd = 0.15; shake = Math.max(shake, 0.4);   // e.cd kecil: kalau pemain masih dekat, langsung disambung tinju
      if (fLane) { scene.remove(fLane); fLane.material.dispose(); fLane = null; }
      burst(gp.clone().setY(0.5), 0xffe0a0, 16, 7);
      if (S.dn > 0) {   // dash lanjutan (fase 2: 3x berturut-turut): berbalik singkat lalu menerjang lagi ke arah pemain
        S.dn--; const dv = player.position.clone().sub(gp).setY(0), dl = dv.length(); dv.normalize();
        e.atk = 'dtele'; e.rec = 0; e.at = F.dash.teleChain; S.dd.copy(dv); S.dlen = Math.min(F.dash.maxLen, dl + F.dash.over);
        fLane = new THREE.Mesh(LANE_GEO, glowMat(0xff3010, 0.3)); fLane.scale.set(F.dash.width, 1, S.dlen); scene.add(fLane);
      }
    }
  } else if (e.rec > 0) {   // jeda menahan pose setelah menyerang
    e.rec -= dt;
  } else if (e.stun <= 0) {   // mengejar & memilih serangan
    const near = dist < e.r + F.punch.trigger, canM = S.mcd <= 0 && (dist > F.meteor.minDist || S.mcd < -3), canD = S.dcd <= 0 && dist > F.dash.minDist;
    if (near && e.cd <= 0) {
      e.atk = 'punch'; e.at = F.punch.wind; e.side = -(e.side || -1); S.chained = false; S.pdir.copy(d);   // tangan kiri & kanan bergantian
    } else if (canM && (!canD || Math.random() < 0.5)) {
      e.atk = 'meteor'; e.mt = 0; S.ms = 0; S.nv = false; audio.sfx('roar', { vol: 0.5, rate: 0.9 });
    } else if (canD) {
      e.atk = 'dtele'; e.at = F.dash.tele; S.dd.copy(d); S.dlen = Math.min(F.dash.maxLen, dist + F.dash.over);
      S.dn = p2 ? F.dash.chainN : 0;   // fase 2: 3 dash berturut-turut (dn = sisa dash lanjutan)
      fLane = new THREE.Mesh(LANE_GEO, glowMat(0xff3010, 0.3)); fLane.scale.set(F.dash.width, 1, S.dlen); scene.add(fLane);
    } else if (!near) { gp.addScaledVector(d, e.sp * dt); clampArena(); }
  }
  firePose(e, dt, false);
}
// ---------- Bos level 3 Dungeon Es: Glacivor, Penguasa Es (lowpoly_bigfoot.glb) — menggantikan penyihir es, khusus Dungeon Es (dgTheme === 'es') ----------
// Model Bigfoot bertulang (rangka Mixamo, pose diam), diskalakan ke ICEBOSS.height, kaki di y = 0. Gerakannya dibuat lewat kode (memakai ulang fireRigApply & FB_BONES dari bos api); klip bawaan model tidak dipakai.
// Taruh lowpoly_bigfoot.glb di folder yang sama dengan fire_monster.glb. Kalau gagal dimuat, bos kembali memakai model penyihir es biasa (tanpa serangan khusus di bawah).
// 3 serangan khas + tinju:
//   1. ES DARI BAWAH (quake) - bos mengangkat kedua tinju lalu menghantam tanah. Lingkaran biru di lantai = titik es akan menyembul (lingkaran dalam membesar = hitung mundur). Dua pola: HUJAN (jatuh di sekitar pemain, yang pertama tepat di bawah pemain)
//                              dan GELOMBANG (barisan es menyapu lurus dari bos ke arah pemain; fase 2 = 3 barisan). Berguling / keluar dari lingkaran = aman. KENA = terluka + TERJEBAK di dalam balok es (tidak bisa bergerak / menyerang / berguling);
//                              tekan tombol apa saja berulang-ulang untuk memecahkan es lebih cepat.
//   2. BOLA ES RAKSASA (ball) - bos menciptakan bola es di atas kepala (jalur biru di lantai = arah gelinding, terkunci sebelum dilempar), lalu melemparnya & bola menggelinding lurus. Kena = terluka + terpental. Menabrak dinding arena = pecah & meledak.
//                               Fase 2: tiga bola sekaligus (menyebar).
//   3. DASH + TINJU (dtele / dash) - membungkuk (jalur biru di lantai), menerjang lurus ke tempat pemain berdiri, dan begitu sampai LANGSUNG menonjok (aba-aba sangat singkat). Tinju kena = terluka + TERPENTAL jauh.
//   (+ TINJU jarak dekat: juga memberi knockback. Fase 2: tinju ganda.)
const ICEBOSS = {
  file: 'lowpoly_bigfoot.glb', name: 'Glacivor, Penguasa Es',
  height: 5.4, face: -0.153,   // face = putaran-y tambahan (radian): model Sketchfab ini miring ±8,8° dari sumbu +z, -0.153 meluruskannya (ubah bila masih tampak menyamping)
  hp: 600, sp: 3.0, r: 1.5, roar: 1.8,   // roar = lama raungan pembuka (detik)
  p2: 0.5, p2gap: 0.7,   // fase 2 (HP < 50%): jeda antar serangan dikali p2gap, es & bola lebih banyak, tinju jadi dua kali beruntun
  punch: { trigger: 3.4, reach: 2.5, wind: 0.65, wind2: 0.4, windDash: 0.28, rec: 0.5, cd: 1.0, dmg: 22, kb: 26 },   // windDash = aba-aba tinju yang langsung menyambung dash; kb = kecepatan awal terpental pemain
  spike: { cd: 7.5, wind: 1.0, n: 6, nP2: 9, interval: 0.28, warn: 1.0, rad: 2.2, dmg: 16, trap: 2.2, struggle: 0.2, rise: 0.14, life: 1.5, spread: 8, rec: 0.7, lineStep: 2.6 },   // warn = waktu menghindar setelah lingkaran muncul; trap = lama terjebak; struggle = es berkurang sekian detik tiap tombol ditekan
  ball:  { cd: 9, minDist: 5, wind: 1.3, lock: 0.4, speed: 15, r: 2.0, dmg: 28, kb: 20, rec: 0.8, fan: 0.34, splash: 3.6, splashDmg: 14 },   // lock = sisa aba-aba saat arah dikunci
  dash:  { cd: 6.5, minDist: 6, tele: 0.85, teleTrap: 0.4, lock: 0.25, speed: 26, over: 3, maxLen: 22, width: 2.8, dmg: 20, rec: 0.35 },
};
let iceGltf = null;
new GLTFLoader().load(ICEBOSS.file, g => { iceGltf = g; }, undefined, () => console.warn(ICEBOSS.file + ' gagal dimuat — bos Dungeon Es memakai model penyihir'));
const iSpikes = [], iBalls = [], iLanes = []; let iTrap = null, iCharge = null;
const ICE_CONE = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0), ICE_BALL_GEO = new THREE.IcosahedronGeometry(1, 1), _iv = new THREE.Vector3(), _iw = new THREE.Vector3(), _iceC = new THREE.Color();
const iceMat = (o = 0.92) => new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x2a86c0, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.1, transparent: true, opacity: o, flatShading: true });
function buildIceBoss() {   // klon model + rangka animasi kode (di-update di icePose)
  const root = SkeletonUtils.clone(iceGltf.scene); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), bone = {}; let floorY = Infinity;
  root.traverse(o => { if (o.isBone) { const nm = o.name.replace(/^mixamorig:?/, '').replace(/_\d+$/, ''); if (FB_BONES.includes(nm)) bone[nm] = o; _fbV.setFromMatrixPosition(o.matrixWorld); floorY = Math.min(floorY, _fbV.y); } });
  let hgt = box.max.y - box.min.y, y0 = box.min.y;
  if (bone.Head) { _fbV.setFromMatrixPosition(bone.Head.matrixWorld); const est = (_fbV.y - floorY) * 1.12; if (!(hgt > est * 0.7 && hgt < est * 1.4)) { hgt = est; y0 = floorY; } }   // cadangan: kalau kotak pembatas model tidak masuk akal (mesh bertulang), tinggi diukur dari tulang kepala & kaki
  const k = ICEBOSS.height / Math.max(0.01, hgt);
  root.scale.multiplyScalar(k); root.position.y = -y0 * k;
  const face = new THREE.Group(); face.rotation.y = ICEBOSS.face; face.add(root);
  const lean = new THREE.Group(); lean.add(face);   // lean: condong ke depan/belakang dengan poros di kaki + naik-turun + maju (lunge)
  root.updateMatrixWorld(true); if (bone.Hips) { bone.Hips.getWorldPosition(_fbV); root.position.x -= _fbV.x; root.position.z -= _fbV.z; }   // pusatkan badan pada pinggul
  let mat = null;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); if (!mat) mat = o.material; } });   // bahan diklon: kilatan terkena pukulan (emissive) tidak berbagi antar klon
  const rest = {}, parentName = {}, cur = {};
  for (const nm of FB_BONES) {
    const b = bone[nm]; if (!b) continue;
    rest[nm] = b.quaternion.clone(); cur[nm] = [0, 0, 0];
    let p = b.parent; parentName[nm] = null; while (p && p !== root) { const pn = FB_BONES.find(n => bone[n] === p); if (pn) { parentName[nm] = pn; break; } p = p.parent; }
  }
  const rig = bone.Hips && bone.Spine2 && bone.LeftArm && bone.RightArm ? { bone, rest, parentName } : null;   // null kalau tulang tidak lengkap: bos tetap tampil (hanya condong & naik-turun)
  return { lean, mat: mat || new THREE.MeshStandardMaterial(), rig, cur, lv: 0, lf: 0, lg: 0, ph: 0, heat: 0, lp: new THREE.Vector3(), light: null };
}
function icePose(e, dt, dying) {   // pose tubuh sesuai keadaan serangan (e.atk / e.rec / e.rk) + cahaya es
  const S = e.ib, F = ICEBOSS, gp = e.g.position, t = P.t;
  const speed = dt > 1e-4 ? Math.hypot(gp.x - S.lp.x, gp.z - S.lp.z) / dt : 0; S.lp.copy(gp);
  const T = {}, add = (nm, x = 0, y = 0, z = 0) => { const a = T[nm] || (T[nm] = [0, 0, 0]); a[0] += x; a[1] += y; a[2] += z; };
  let lean = 0, lift = 0, lunge = 0, rate = 10, heat = S.p2 ? 0.35 : 0;
  const dash = e.atk === 'dash', side = e.side || 1, arm = side > 0 ? 'Right' : 'Left', oth = side > 0 ? 'Left' : 'Right', inn = side > 0 ? 1 : -1;   // side +1 = tangan kanan bos
  const w = dying || (e.atk && !dash) ? 0 : clamp01((dash ? 30 : speed) / 3);
  S.ph += (dash ? 15 : Math.min(speed, 6) * 1.0) * dt;
  const sw = Math.sin(S.ph), br = Math.sin(t * 1.5 + e.ph), amp = dash ? 0.85 : 0.5;
  add('LeftUpLeg', -sw * amp * w); add('RightUpLeg', sw * amp * w); add('LeftLeg', Math.max(0, -sw) * 0.75 * w); add('RightLeg', Math.max(0, sw) * 0.75 * w);   // jalan berat: paha maju-mundur, lutut menekuk
  add('LeftArm', sw * 0.5 * w); add('RightArm', -sw * 0.5 * w); add('Spine2', br * 0.025, sw * 0.07 * w); add('Head', -br * 0.02);
  lift = Math.abs(sw) * 0.12 * w + br * 0.03 + 0.04; lean = 0.1 * w;
  if (dying) {   // runtuh perlahan: berlutut & menunduk
    const p = clamp01((1 - slow.t / SLOW_TOTAL) / SLOW_DEATH); rate = 6; lean = 0.1 + 0.55 * p; lift = -0.05 * p; heat = 0.8 * (1 - p);
    add('Head', 0.6 * p); add('Spine1', 0.3 * p); add('LeftArm', 0.5 * p, 0, 0.3 * p); add('RightArm', 0.5 * p, 0, -0.3 * p);
    add('LeftUpLeg', -0.6 * p); add('LeftLeg', 0.9 * p); add('RightUpLeg', -0.6 * p); add('RightLeg', 0.9 * p);
  } else if (e.atk === 'roar') {   // raungan: kepala menengadah, memukul dada bergantian
    const p = clamp01(1 - e.at / Math.max(0.01, S.roarT)), s = clamp01(p * 5) * (1 - clamp01((p - 0.8) * 5)), bl = Math.max(0, Math.sin(t * 16)), br2 = Math.max(0, -Math.sin(t * 16)); rate = 12; heat = Math.max(heat, s);
    add('LeftArm', -0.9 * s, 0, 0.5 * s); add('RightArm', -0.9 * s, 0, -0.5 * s); add('LeftForeArm', (-1.5 - 0.5 * bl) * s); add('RightForeArm', (-1.5 - 0.5 * br2) * s); add('Head', -0.55 * s); add('Spine2', -0.4 * s); add('Spine', 0, Math.sin(t * 40) * 0.03 * s); lean = -0.12 * s;
  } else if (e.atk === 'punch') {   // aba-aba tinju: tangan ditarik ke belakang, badan memutar
    const u = eio(clamp01(1 - e.at / Math.max(0.01, S.pw))); rate = 16; heat = Math.max(heat, u);
    add(arm + 'Arm', 1.4 * u, inn * 0.3 * u); add(arm + 'ForeArm', -1.7 * u); add(oth + 'Arm', -0.5 * u, -inn * 0.2 * u); add('Spine2', 0, -side * 0.55 * u); add('Spine', 0, -side * 0.2 * u); lean = -0.1 * u;
  } else if (e.rec > 0 && e.rk === 'punch') {   // tinju kena: lengan terjulur, badan menerjang ke depan
    rate = 32; heat = 1; add(arm + 'Arm', -1.45, inn * 0.55); add(arm + 'ForeArm', -0.15); add(oth + 'Arm', 0.4, -inn * 0.2); add('Spine2', 0, side * 0.4); lean = 0.28; lunge = 0.7;
  } else if (e.atk === 'quake') {   // es dari bawah: kedua tinju diangkat tinggi, lalu dihantamkan ke tanah
    const C = F.spike;
    if (e.mt < C.wind) { const u = eio(clamp01(e.mt / C.wind)); rate = 9; heat = Math.max(heat, u); add('LeftArm', -2.7 * u, 0, 0.3 * u); add('RightArm', -2.7 * u, 0, -0.3 * u); add('LeftForeArm', -0.4 * u); add('RightForeArm', -0.4 * u); add('Spine2', -0.35 * u); add('Head', -0.3 * u); add('Spine', Math.sin(t * 45) * 0.02 * u); lean = -0.2 * u; lift += 0.1 * u; }
    else { rate = 30; heat = 1; add('LeftArm', -0.9, 0, 0.15); add('RightArm', -0.9, 0, -0.15); add('LeftForeArm', -0.2); add('RightForeArm', -0.2); add('Spine2', 0.3); add('Head', 0.2); add('LeftUpLeg', -0.3); add('RightUpLeg', -0.3); lean = 0.35; lunge = 0.5; }
  } else if (e.rec > 0 && e.rk === 'quake') {   // menahan pose hantam
    rate = 10; heat = Math.max(heat, 0.5); add('LeftArm', -0.7, 0, 0.15); add('RightArm', -0.7, 0, -0.15); add('Spine2', 0.2); lean = 0.25;
  } else if (e.atk === 'ball') {   // memanggil bola es: kedua tangan terangkat memegang bola di atas kepala
    const u = eio(clamp01(e.mt / F.ball.wind)), wob = Math.sin(t * 14) * 0.05 * u; rate = 9; heat = Math.max(heat, u);
    add('LeftArm', -2.5 * u, 0, 0.55 * u + wob); add('RightArm', -2.5 * u, 0, -0.55 * u - wob); add('LeftForeArm', -0.7 * u); add('RightForeArm', -0.7 * u); add('Head', -0.4 * u); add('Spine2', -0.3 * u); lean = -0.18 * u; lift += 0.08 * u;
  } else if (e.rec > 0 && e.rk === 'ball') {   // bola dilempar: tangan dihempas ke depan
    rate = 26; heat = Math.max(heat, 0.6); add('LeftArm', -1.3, 0, 0.1); add('RightArm', -1.3, 0, -0.1); add('Spine2', 0.25); lean = 0.3; lunge = 0.5;
  } else if (e.atk === 'dtele') {   // aba-aba dash: membungkuk seperti akan berlari, tubuh bergetar
    const u = eio(clamp01(1 - e.at / F.dash.tele)); rate = 12; heat = Math.max(heat, u); lean = 0.42 * u;
    add('LeftArm', 1.2 * u, 0, 0.15 * u); add('RightArm', 1.2 * u, 0, -0.15 * u); add('LeftUpLeg', -0.7 * u); add('LeftLeg', 1.0 * u); add('RightUpLeg', 0.35 * u); add('RightLeg', 0.5 * u); add('Head', 0.25 * u); add('Spine', 0, Math.sin(t * 50) * 0.03 * u);
  } else if (dash) {   // menerjang: badan condong, tangan di belakang, kaki berlari cepat
    rate = 14; heat = 1; lean = 0.55; lift += 0.1; add('LeftArm', 1.3, 0, 0.2); add('RightArm', 1.3, 0, -0.2); add('Head', 0.2);
  } else if (e.rec > 0 && e.rk === 'dash') { rate = 8; heat = Math.max(heat, 0.5); lean = 0.2; add('Spine', 0.1); }
  if (e.stun > 0 && !dying) { lean -= 0.25; add('Head', 0.3); rate = 24; }   // terkena pukulan: terhentak ke belakang
  S.heat += (heat - S.heat) * (1 - Math.exp(-dt * 8));
  const kk = 1 - Math.exp(-rate * dt);
  for (const nm of FB_BONES) { const c = S.cur[nm]; if (!c) continue; const tg = T[nm]; for (let i = 0; i < 3; i++) c[i] += ((tg ? tg[i] : 0) - c[i]) * kk; }
  S.lv += (lean - S.lv) * kk; S.lf += (lift - S.lf) * kk; S.lg += (lunge - S.lg) * kk;
  S.lean.rotation.x = S.lv; S.lean.position.set(0, S.lf, S.lg);
  if (S.rig) fireRigApply(S.rig, e.g, S.cur);
  if (S.light) S.light.intensity = 10 + S.heat * 18 + Math.sin(t * 7) * 2;
  if (dying) { e.mat.emissiveIntensity = 1.2; return; }
  if (e.flash <= 0 && S.heat > 0.02) e.mat.emissive.lerp(_iceC.setHex(0x5ac8ff), Math.min(1, S.heat * 0.7));   // warna emissive dasar diatur di updateEnemies; di sini ditambah cahaya es saat menyerang
  e.mat.emissiveIntensity = 1 + (e.flash > 0 ? 1.6 : 0);
  if (Math.random() < 0.3 + 0.4 * S.heat) { const a = rnd(0, 6.28); burst(new THREE.Vector3(gp.x + Math.cos(a) * 0.9, rnd(0.4, 4.2), gp.z + Math.sin(a) * 0.9), Math.random() < 0.5 ? 0xbfefff : 0xffffff, 1, 1.2); }   // serpihan es / salju beterbangan
}

// --- efek ke pemain: kena (terluka) -> terpental / terjebak balok es ---
function iceHurt(n) {   // true bila serangan MENGENAI (tidak kebal / berguling); efek tambahan (terjebak / terpental) hanya berlaku bila kena
  if (AIMSW.on) return lyra.hurt(Math.round(n * bossMul()));   // sasaran = Lyra
  if (P.inv > 0 || (state !== 'play' && state !== 'world')) return false;
  hurtPlayer(n); return true;
}
function pushPlayer(dir, force) {
  if (AIMSW.on) return;   // sasaran bos = Lyra: pemain asli tidak ikut terpental
   // pemain terpental ke arah dir (kecepatan awal force, melambat sendiri); tidak bisa bergerak / menyerang sebentar
  if (P.trap > 0) releaseTrap();   // pukulan yang kena memecahkan balok es, pemain langsung terlempar
  P.push.set(dir.x, 0, dir.z).normalize().multiplyScalar(force); P.hs = 0.35;
  P.atk = 0; P.cross = false; P.combo = 0; P.hit = false; P.roll = 0;
}
function trapPlayer(sec) {
  if (AIMSW.on) return;
   // pemain membeku di dalam balok es
  if (P.trap > 0 || state !== 'play') return;
  P.trap = P.trapMax = sec; P.atk = 0; P.cross = false; P.combo = 0; P.hit = false; P.roll = 0; P.v.set(0, 0, 0); P.push.set(0, 0, 0);
  const g = new THREE.Group(), mat = iceMat(0.6); g.position.copy(player.position);
  const blk = new THREE.Mesh(ICE_BALL_GEO, mat); blk.scale.set(1.25, 1.75, 1.25); blk.position.y = 0.95; g.add(blk);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, c = new THREE.Mesh(ICE_CONE, mat); c.scale.set(0.3, rnd(1.0, 1.8), 0.3); c.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95); c.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); g.add(c); }
  scene.add(g); iTrap = { g, mat, jit: 0 };
  burst(player.position.clone().setY(1), 0xbfefff, 18, 6); audio.sfx('swordbreak', { vol: 0.5, rate: 0.6 });
}
function releaseTrap() {
  if (iTrap) { const p = player.position.clone().setY(1); burst(p, 0xdff6ff, 26, 9); lineSparks(p, 30, 10, 1.2, [0xffffff, 0x7fdcff]); scene.remove(iTrap.g); disposeMats(iTrap.g); iTrap = null; audio.sfx('swordbreak', { vol: 0.8, rate: 1.6 }); }
  P.trap = 0; P.inv = Math.max(P.inv, 0.5);   // jeda kebal sebentar setelah es pecah
}
const iceStruggle = ev => { if (P.trap > 0 && !ev.repeat) { P.trap -= ICEBOSS.spike.struggle; if (iTrap) iTrap.jit = 0.15; } };   // tombol apa saja / sentuhan = memecahkan es sedikit
addEventListener('keydown', iceStruggle); addEventListener('pointerdown', iceStruggle);

// --- Es dari bawah: lingkaran peringatan (biru) -> es menyembul dari tanah -> bertahan sebentar -> tenggelam lagi ---
function spawnIceSpike(x, z, delay, rad, warn) {   // delay = jeda sebelum lingkaran peringatan muncul; warn = lama peringatan sampai es menyembul
  const g = new THREE.Group(); g.position.set(x, 0, z); g.visible = false;
  const mat = iceMat(), cones = [];
  const addC = (px, pz, h, wd, tx, tz) => { const m = new THREE.Mesh(ICE_CONE, mat); m.position.set(px, 0, pz); m.scale.set(wd, 0.001, wd); m.rotation.set(tx, rnd(0, 6.28), tz); m.castShadow = true; g.add(m); cones.push({ m, h }); };
  addC(0, 0, rnd(3.8, 4.6), 0.9, 0, 0);
  const n = Math.max(5, Math.round(rad * 3.2));
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rnd(-0.3, 0.3), r = rad * rnd(0.35, 0.85), t = rnd(0.15, 0.4); addC(Math.cos(a) * r, Math.sin(a) * r, rnd(1.6, 3.2), rnd(0.35, 0.6), Math.sin(a) * t, -Math.cos(a) * t); }   // miring ke luar
  scene.add(g);
  const wr = new THREE.Mesh(WARN_RING, glowMat(0x3ab8ff, 0.6)), wd = new THREE.Mesh(WARN_DISC, glowMat(0x3ab8ff, 0.22));
  for (const m of [wr, wd]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); m.visible = false; scene.add(m); } wr.scale.setScalar(rad); wd.scale.setScalar(0.01);
  iSpikes.push({ g, mat, cones, wr, wd, x, z, rad, warn, t: -delay, shown: false, up: false });
}
function eruptIceSpike(s) {
  const C = ICEBOSS.spike; s.up = true; s.g.visible = true; s.wr.visible = s.wd.visible = false;
  const pos = new THREE.Vector3(s.x, 0.4, s.z);
  burst(pos.clone().setY(1.2), 0xdff6ff, 16, 9); lineSparks(pos.clone().setY(0.5), 22, 9, 1.3, [0xffffff, 0x7fdcff]);
  const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(0x9fe8ff)); rm.rotation.x = -Math.PI / 2; rm.position.set(s.x, 0.1, s.z); scene.add(rm); pulses.push({ m: rm, t: 0.4, dur: 0.4, max: s.rad * 1.5 });
  shake = Math.max(shake, 0.3); audio.sfx('thud', { vol: 0.7, rate: rnd(1.2, 1.5) });
  hurtLyraArea(s.x, s.z, s.rad, C.dmg);
  if (P.trap <= 0 && Math.hypot(player.position.x - s.x, player.position.z - s.z) < s.rad && iceHurt(C.dmg)) trapPlayer(C.trap);   // kena = terluka + terjebak (berguling = kebal, lihat P.inv)
}
function removeIceSpike(s) { scene.remove(s.g, s.wr, s.wd); disposeMats(s.g); s.wr.material.dispose(); s.wd.material.dispose(); iSpikes.splice(iSpikes.indexOf(s), 1); }
function spawnRainSpike(i) {   // pola HUJAN: yang pertama tepat di bawah pemain, sisanya menyebar di sekitarnya (tidak saling tumpang tindih)
  const C = ICEBOSS.spike, pts = iSpikes.filter(s => !s.up).map(s => s);
  let x = player.position.x, z = player.position.z;
  if (i > 0) for (let tr = 0; tr < 10; tr++) {
    const a = rnd(0, 6.28), r = rnd(1.5, C.spread); x = player.position.x + Math.cos(a) * r; z = player.position.z + Math.sin(a) * r;
    const hl = Math.hypot(x, z); if (hl > R - 1.5) { x *= (R - 1.5) / hl; z *= (R - 1.5) / hl; }
    if (pts.every(p => Math.hypot(p.x - x, p.z - z) > C.rad * 1.3)) break;
  }
  spawnIceSpike(x, z, 0, C.rad, C.warn);
}
function spikeLine(e, dir, ang) {   // pola GELOMBANG: barisan es lurus dari bos; semua lingkaran muncul bersamaan, menyembul berurutan dari yang terdekat (menyamping = aman)
  const C = ICEBOSS.spike, d = _iv.set(dir.x, 0, dir.z).applyAxisAngle(UP, ang).clone(), gp = e.g.position;
  for (let k = 0; k < 14; k++) {
    const dd = e.r + 2.2 + k * C.lineStep, x = gp.x + d.x * dd, z = gp.z + d.z * dd;
    if (Math.hypot(x, z) > R - 1) break;
    spawnIceSpike(x, z, 0, C.rad * 0.85, C.warn + k * 0.1);
  }
}

// --- Bola es raksasa: dipegang di atas kepala (membesar) -> dilempar -> menggelinding lurus; kena = terpental, dinding arena = pecah ---
function makeIceBall(scale) {
  const g = new THREE.Group(), C = ICEBOSS.ball;
  const core = new THREE.Mesh(ICE_BALL_GEO, iceMat(0.9)); core.scale.setScalar(C.r); core.castShadow = true; g.add(core);
  const shell = new THREE.Mesh(ICE_BALL_GEO, glowMat(0x7fdcff, 0.28)); shell.scale.setScalar(C.r * 1.18); g.add(shell);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x9fe8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(C.r * 5, C.r * 5, 1); g.add(halo);
  g.scale.setScalar(scale); return { g, core };
}
function launchIceBall(origin, dir) {
  const C = ICEBOSS.ball, b = makeIceBall(1); b.g.position.copy(origin); scene.add(b.g);
  iBalls.push({ g: b.g, core: b.core, d: dir.clone().setY(0).normalize(), y0: origin.y, t: 0, r: C.r, hitFx: 0 });
}
function iceBallBurst(b, splash) {   // splash = meledak di dinding (area kecil melukai pemain yang dekat)
  const C = ICEBOSS.ball, p = b.g.position.clone();
  burst(p.clone().setY(Math.max(1, p.y)), 0xdff6ff, 26, 10); burst(p.clone().setY(0.8), 0x7fdcff, 22, 8); lineSparks(p.clone().setY(1), 34, 12, 1.3, [0xffffff, 0x7fdcff]);
  const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(0x9fe8ff)); rm.rotation.x = -Math.PI / 2; rm.position.set(p.x, 0.1, p.z); scene.add(rm); pulses.push({ m: rm, t: 0.45, dur: 0.45, max: splash ? C.splash * 1.2 : b.r * 2 });
  if (splash && Math.hypot(player.position.x - p.x, player.position.z - p.z) < C.splash && iceHurt(C.splashDmg)) pushPlayer(_iv.set(player.position.x - p.x, 0, player.position.z - p.z), 14);
  shake = Math.max(shake, splash ? 0.6 : 0.45); audio.sfx('explosion', { vol: 0.7, rate: 1.3 });
  scene.remove(b.g); disposeMats(b.g); iBalls.splice(iBalls.indexOf(b), 1);
}
function addIceLane(w) { const m = new THREE.Mesh(LANE_GEO, glowMat(0x5ad0ff, 0.3)); m.scale.set(w, 1, 1); scene.add(m); iLanes.push(m); return m; }
function setIceLane(m, from, d, len, w) { m.scale.set(w, 1, len); m.position.set(from.x, 0.06, from.z).addScaledVector(d, len / 2); m.rotation.y = Math.atan2(d.x, d.z); }
function clearIceLanes() { for (const m of iLanes) { scene.remove(m); m.material.dispose(); } iLanes.length = 0; }
function rayToWall(p, d, rr) { const b = p.x * d.x + p.z * d.z, c = p.x * p.x + p.z * p.z - rr * rr; return Math.max(2, -b + Math.sqrt(Math.max(0, b * b - c))); }   // jarak dari p searah d sampai lingkaran arena (radius rr)
function clearIceBoss() {   // bersihkan semua efek bos es (bos mati / pemain kalah / keluar dungeon); pemain dibebaskan dari es & dorongan
  for (const s of [...iSpikes]) removeIceSpike(s);
  for (const b of iBalls) { scene.remove(b.g); disposeMats(b.g); } iBalls.length = 0;
  if (iCharge) { scene.remove(iCharge); disposeMats(iCharge); iCharge = null; }
  clearIceLanes();
  if (iTrap) { scene.remove(iTrap.g); disposeMats(iTrap.g); iTrap = null; }
  P.trap = 0; P.hs = 0; P.push.set(0, 0, 0);
}
function iceFxTick(dt) {   // es yang menyembul, bola yang menggelinding, balok es pemain (AI bos mengurus sisanya)
  const C = ICEBOSS.spike, B = ICEBOSS.ball, t = P.t;
  for (const s of [...iSpikes]) {
    s.t += dt; if (s.t < 0) continue;
    if (!s.up) {
      if (!s.shown) { s.shown = true; s.wr.visible = s.wd.visible = true; }
      const u = clamp01(s.t / s.warn);
      s.wr.material.opacity = 0.35 + 0.3 * Math.sin(s.t * (14 + 14 * u)); s.wd.scale.setScalar(Math.max(0.01, s.rad * u)); s.wd.material.opacity = 0.18 + 0.2 * u;
      if (s.t >= s.warn) eruptIceSpike(s);
    } else {
      const k = s.t - s.warn, up = 1 - Math.pow(1 - clamp01(k / C.rise), 3), sink = clamp01((C.life - k) / 0.5);
      for (const c of s.cones) c.m.scale.y = Math.max(0.001, c.h * up * sink);
      s.mat.opacity = 0.92 * (0.3 + 0.7 * sink);
      if (k >= C.life) removeIceSpike(s);
    }
  }
  for (const b of [...iBalls]) {
    b.t += dt; const p = b.g.position, u = clamp01(b.t / 0.45);
    p.x += b.d.x * B.speed * dt; p.z += b.d.z * B.speed * dt; p.y = b.y0 + (b.r - b.y0) * u * u;   // turun dari ketinggian tangan ke lantai, lalu menggelinding
    b.core.rotateOnWorldAxis(_iv.set(b.d.z, 0, -b.d.x), B.speed / b.r * dt);
    if (Math.random() < 0.7) burst(p.clone().addScaledVector(b.d, -b.r * 0.8).setY(rnd(0.3, b.r)), Math.random() < 0.5 ? 0xdff6ff : 0x7fdcff, 1, 2);
    if (b.t > 0.3) {
      const rx = player.position.x - p.x, rz = player.position.z - p.z;
      if (Math.hypot(rx, rz) < b.r + 0.55 && iceHurt(B.dmg)) {   // kena: terpental ke arah gelinding + sedikit ke samping, bola pecah
        const f = rx * b.d.x + rz * b.d.z; _iw.set(rx - b.d.x * f, 0, rz - b.d.z * f); pushPlayer(_iv.copy(b.d).multiplyScalar(2).addScaledVector(_iw, 1.5), B.kb);
        burst(player.position.clone().setY(1.3), 0xdff6ff, 14, 8); iceBallBurst(b, false); continue;
      }
    }
    if (Math.hypot(p.x, p.z) > R - b.r * 0.6) iceBallBurst(b, true);   // menabrak dinding arena
  }
  if (iTrap && P.trap <= 0) releaseTrap();   // es dipecahkan lewat tombol (P.trap sudah habis di iceStruggle) -> balok es tetap harus dibersihkan
  else if (P.trap > 0) {
    P.v.set(0, 0, 0); P.push.set(0, 0, 0);
    if (iTrap) {
      iTrap.jit = Math.max(0, iTrap.jit - dt); const r = clamp01(P.trap / Math.max(0.01, P.trapMax));
      iTrap.g.position.set(player.position.x + (iTrap.jit > 0 ? Math.sin(t * 90) * 0.06 : 0), 0, player.position.z); iTrap.mat.opacity = 0.25 + 0.4 * r; iTrap.g.scale.setScalar(0.85 + 0.15 * r);
    }
    P.trap -= dt; if (P.trap <= 0) releaseTrap();
  }
}
// --- AI utama Glacivor: mengejar pemain, lalu memilih tinju (dekat), es dari bawah / bola es / dash (jauh) ---
function iceBossAI(e, d, dist, dt) {
  const F = ICEBOSS, S = e.ib, gp = e.g.position; gp.y = 0;
  S.qcd -= dt; S.bcd -= dt; S.dcd -= dt;
  const clampArena = () => { const hl = Math.hypot(gp.x, gp.z); if (hl > R - 2) { gp.x *= (R - 2) / hl; gp.z *= (R - 2) / hl; } };
  const p2 = e.hp < e.max * F.p2, gm = p2 ? F.p2gap : 1, face = v => { e.g.rotation.y = Math.atan2(v.x, v.z); };
  const ring = (x, z, max, dur) => { const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(0x9fe8ff)); rm.rotation.x = -Math.PI / 2; rm.position.set(x, 0.1, z); scene.add(rm); pulses.push({ m: rm, t: dur, dur, max }); };
  if (p2 && !S.p2 && !e.atk) {   // masuk fase 2: meraung lagi, makin ganas
    S.p2 = true; e.atk = 'roar'; S.roarT = 1.2; e.at = 1.2; e.rec = 0; audio.sfx('roar'); shake = Math.max(shake, 0.8);
    burst(gp.clone().setY(2), 0xbfefff, 40, 10); ring(gp.x, gp.z, 9, 0.8); S.qcd = Math.min(S.qcd, 2.5);
  }
  if (P.trap <= 0) S.punished = false;
  else if (!S.punished && (!e.atk || e.atk === 'quake') && e.stun <= 0) {   // pemain terjebak es -> bos LANGSUNG menerjang (dash, atau tinju kalau sudah dekat); pukulan yang kena memecahkan es & melempar pemain
    S.punished = true; e.rec = 0; e.cd = 0; if (e.atk === 'quake') S.qcd = F.spike.cd * gm;
    if (dist > e.r + F.punch.trigger) { e.atk = 'dtele'; e.at = F.dash.teleTrap; S.dd.copy(d); S.dlen = Math.min(F.dash.maxLen, dist + F.dash.over); clearIceLanes(); addIceLane(F.dash.width); audio.sfx('roar', { vol: 0.6, rate: 1.2 }); }
    else { e.atk = 'punch'; S.chained = false; S.fast = true; S.pw = F.punch.windDash; e.at = S.pw; e.side = -(e.side || -1); S.pdir.copy(d); }
  }
  if (e.atk === 'roar') {
    e.at -= dt; if (Math.random() < 0.5) burst(gp.clone().setY(rnd(1, 4)), 0xbfefff, 2, 6); if (e.at <= 0) e.atk = null;
  } else if (e.atk === 'punch') {   // aba-aba tinju; arah dikunci di akhir (bisa dihindari ke samping / berguling)
    e.at -= dt; if (e.at > (S.fast ? 0.1 : 0.18)) S.pdir.copy(d); face(S.pdir);
    if (e.at <= 0) {
      e.atk = null; const fp = gp.clone().addScaledVector(S.pdir, e.r + 1.8);
      if (Math.hypot(player.position.x - fp.x, player.position.z - fp.z) < F.punch.reach && iceHurt(F.punch.dmg)) { pushPlayer(S.pdir, F.punch.kb); burst(player.position.clone().setY(1.3), 0xdff6ff, 14, 8); }   // kena = terpental (knockback)
      const hp = fp.clone().setY(1.6); burst(hp, 0xdff6ff, 22, 8); burst(hp, 0x7fdcff, 12, 6); lineSparks(hp, 24, 9, 0.8, [0xffffff, 0x7fdcff]);
      ring(fp.x, fp.z, 3.4, 0.4); shake = Math.max(shake, 0.55); audio.sfx('thud', { vol: 1, rate: 0.55 });
      if (p2 && !S.chained) { S.chained = true; S.fast = true; S.pw = F.punch.wind2; e.atk = 'punch'; e.at = S.pw; e.side = -(e.side || -1); S.pdir.copy(d); }   // fase 2: tinju kedua dengan tangan satunya
      else { S.chained = false; S.fast = false; e.rec = F.punch.rec; e.rk = 'punch'; e.cd = F.punch.cd * gm; }
    }
  } else if (e.atk === 'quake') {   // es dari bawah: angkat tinju -> hantam tanah -> es menyembul (pola hujan / gelombang)
    const C = F.spike, n = p2 ? C.nP2 : C.n; e.mt += dt;
    if (e.mt < C.wind) { S.pdir.copy(d); face(S.pdir); }
    if (!S.slam && e.mt >= C.wind) {
      S.slam = true; burst(gp.clone().setY(0.4), 0xdff6ff, 24, 9); ring(gp.x, gp.z, 7, 0.5); shake = Math.max(shake, 0.6); audio.sfx('thud', { vol: 1, rate: 0.5 });
      if (S.qk === 'line') for (const a of p2 ? [-0.42, 0, 0.42] : [0]) spikeLine(e, S.pdir, a);
    }
    if (S.qk === 'rain') while (S.ms < n && e.mt >= C.wind + S.ms * C.interval) { spawnRainSpike(S.ms); S.ms++; }
    if (e.mt >= (S.qk === 'rain' ? C.wind + (n - 1) * C.interval + 0.45 : C.wind + 0.55)) { e.atk = null; e.rec = C.rec; e.rk = 'quake'; S.qcd = C.cd * gm; e.cd = Math.max(e.cd, 0.6); }
  } else if (e.atk === 'ball') {   // bola es: membesar di atas kepala; jalur (biru) mengikuti pemain lalu terkunci; lalu dilempar
    const C = F.ball, fan = p2 ? [-C.fan, 0, C.fan] : [0]; e.mt += dt;
    if (e.mt < C.wind - C.lock) S.bd.copy(d); face(S.bd);
    const fwd = S.bd;
    if (iCharge) { iCharge.position.set(gp.x + fwd.x * 0.8, F.height + 1.3 + Math.sin(P.t * 6) * 0.08, gp.z + fwd.z * 0.8); iCharge.scale.setScalar(Math.max(0.01, eio(clamp01(e.mt / C.wind)))); }
    iLanes.forEach((m, i) => { const dv = fwd.clone().applyAxisAngle(UP, fan[i]); setIceLane(m, gp, dv, rayToWall(gp, dv, R - 0.5), C.r * 2); m.material.opacity = e.mt > C.wind - C.lock ? 0.3 + 0.25 * Math.sin(P.t * 30) : 0.2; });
    if (e.mt >= C.wind) {   // lempar
      const org = new THREE.Vector3(gp.x + fwd.x * 1.2, F.height * 0.8, gp.z + fwd.z * 1.2);
      for (const a of fan) launchIceBall(org, fwd.clone().applyAxisAngle(UP, a));
      if (iCharge) { scene.remove(iCharge); disposeMats(iCharge); iCharge = null; }
      clearIceLanes(); burst(org, 0xdff6ff, 18, 8); shake = Math.max(shake, 0.4); audio.sfx('fireball', { vol: 0.6, rate: 0.7 });
      e.atk = null; e.rec = C.rec; e.rk = 'ball'; S.bcd = C.cd * gm; e.cd = Math.max(e.cd, 0.5);
    }
  } else if (e.atk === 'dtele') {   // aba-aba dash: jalur mengikuti pemain, lalu terkunci (jalur berkedip) sebelum menerjang
    e.at -= dt; const D = F.dash;
    if (e.at > D.lock) { S.dd.copy(d); S.dlen = Math.min(D.maxLen, dist + D.over); }
    face(S.dd);
    if (iLanes[0]) { setIceLane(iLanes[0], gp, S.dd, S.dlen, D.width); iLanes[0].material.opacity = 0.22 + 0.2 * Math.sin(P.t * 28); }
    if (e.at <= 0) { e.atk = 'dash'; S.dleft = S.dlen; S.dhit = false; S.dpuff = 0; audio.sfx('roar', { vol: 0.6, rate: 1.4 }); }
  } else if (e.atk === 'dash') {   // menerjang lurus sepanjang jalur
    const D = F.dash, step = Math.min(S.dleft, D.speed * dt); gp.addScaledVector(S.dd, step); S.dleft -= step; face(S.dd); clampArena();
    if (!S.dhit && dist < e.r + 1.0) {   // tersambar: terluka + terdorong ke samping jalur
      const pp = player.position.clone().sub(gp).setY(0), sg = (pp.x * -S.dd.z + pp.z * S.dd.x) >= 0 ? 1 : -1;
      if (iceHurt(D.dmg)) { S.dhit = true; shake = Math.max(shake, 0.6); pushPlayer(_iv.set(-S.dd.z * sg, 0, S.dd.x * sg), 12); }
    }
    S.dpuff -= dt; if (S.dpuff <= 0) { S.dpuff = 0.05; burst(gp.clone().setY(0.4), 0xdff6ff, 3, 4); burst(gp.clone().setY(1.2), 0x7fdcff, 2, 3); }
    if (S.dleft <= 0.01 || Math.hypot(gp.x, gp.z) >= R - 2.01) {
      e.atk = null; S.dcd = D.cd * gm; shake = Math.max(shake, 0.4); clearIceLanes(); burst(gp.clone().setY(0.5), 0xdff6ff, 16, 7);
      const dx = player.position.x - gp.x, dz = player.position.z - gp.z, dd = Math.hypot(dx, dz);
      if (dd < e.r + F.punch.trigger + 1.0) {   // pemain masih dekat: LANGSUNG tinju (aba-aba sangat singkat)
        if (dd > 1e-3) S.pdir.set(dx / dd, 0, dz / dd); else S.pdir.copy(S.dd);
        S.chained = false; S.fast = true; S.pw = F.punch.windDash; e.atk = 'punch'; e.at = S.pw; e.side = -(e.side || -1);
      } else { e.rec = D.rec; e.rk = 'dash'; e.cd = 0.15; }
    }
  } else if (e.rec > 0) {   // jeda menahan pose setelah menyerang
    e.rec -= dt;
  } else if (e.stun <= 0) {   // mengejar & memilih serangan
    const near = dist < e.r + F.punch.trigger, opts = [];
    if (S.qcd <= 0) opts.push('quake');
    if (S.bcd <= 0 && dist > F.ball.minDist) opts.push('ball');
    if (S.dcd <= 0 && dist > F.dash.minDist) opts.push('dash');
    if (near && e.cd <= 0) {
      e.atk = 'punch'; S.pw = F.punch.wind; e.at = S.pw; e.side = -(e.side || -1); S.chained = false; S.fast = false; S.pdir.copy(d);   // tangan kiri & kanan bergantian
    } else if (opts.length) {
      const pick = opts[(Math.random() * opts.length) | 0];
      if (pick === 'quake') { e.atk = 'quake'; e.mt = 0; S.ms = 0; S.slam = false; S.qk = Math.random() < 0.5 ? 'rain' : 'line'; S.pdir.copy(d); audio.sfx('roar', { vol: 0.5, rate: 0.8 }); }
      else if (pick === 'ball') {
        e.atk = 'ball'; e.mt = 0; S.bd.copy(d); iCharge = makeIceBall(0.01).g; scene.add(iCharge);
        for (let i = 0; i < (p2 ? 3 : 1); i++) addIceLane(F.ball.r * 2);
        audio.sfx('roar', { vol: 0.5, rate: 0.9 });
      } else {
        e.atk = 'dtele'; e.at = F.dash.tele; S.dd.copy(d); S.dlen = Math.min(F.dash.maxLen, dist + F.dash.over);
        addIceLane(F.dash.width);
      }
    } else if (!near) { gp.addScaledVector(d, e.sp * dt); clampArena(); }
  }
  icePose(e, dt, false);
}
// ---------- Bos level 3 Dungeon Kegelapan: Mordrak, Ksatria Kegelapan (rogue_knight.glb) — menggantikan penyihir kegelapan, khusus Dungeon Kegelapan (dgTheme === 'kegelapan') ----------
// Model bertulang (rangka Biped "Bip001", tanpa animasi bawaan) diskalakan ke KNIGHT.height, kaki di y = 0. Semua gerakan dibuat lewat kode (memakai ulang fireRigApply & FB_BONES dari bos api; nama tulang Bip001 dipetakan ke nama Mixamo di KN_MAP).
// Taruh rogue_knight.glb di folder yang sama dengan seraphim.glb / fire_monster.glb. Kalau gagal dimuat, bos kembali memakai model penyihir kegelapan biasa (tanpa serangan khusus di bawah).
// Petarung JARAK DEKAT dengan 1 pedang besar di tangan kanan (dibuat dari kode, menempel di tulang tangan). Mengejar pemain, tebasan dasar (cleave) saat dekat, dan 3 skill yang dipilih bergiliran:
//   1. TEBAS 3x (slash)     - tiga tebasan beruntun (diagonal -> datar -> tegak dari atas). Tiap tebasan melepas gelombang SLASH berukuran sedang (bulan sabit hitam berpinggir ungu) yang melesat jauh ke arah pemain
//                             (dikunci sesaat sebelum tebasan, jadi bisa dihindari ke samping / berguling). HP < 50%: tiap tebasan melepas dua gelombang (menyebar).
//   2. TERJANG + TEBAS (lunge) - membungkuk (jalur ungu di lantai = arah terjang, terkunci di akhir aba-aba), menerjang cepat ke tempat pemain berdiri, lalu LANGSUNG menebas beruntun kiri-kanan (4x; fase 2: 6x) sambil terus menempel.
//   3. LASER BAYANGAN (laser) - tangan kiri terangkat mengumpulkan bayangan dari sekeliling (partikel hitam mengalir ke telapak tangan, bola bayangan membesar, garis bidik ungu = aba-aba), lalu menembakkan LASER HITAM yang menyapu mengejar pemain
//                             (kecepatan kejar terbatas: berlari menyamping / berguling = lolos).
const KNIGHT = {
  file: 'rogue_knight.glb', name: 'Mordrak, Ksatria Kegelapan',
  height: 4.4, modelH: 2.14, face: 0,   // modelH = tinggi model asli setelah transformasi node GLB (rogue_knight.glb = 2,14); face = putaran-y tambahan (radian) bila model tampak menghadap ke arah lain; 0 = menghadap +z (sudah benar untuk model ini)
  hp: 650, sp: 3.4, r: 1.15, roar: 1.6,   // roar = lama raungan pembuka (detik)
  p2: 0.5, p2gap: 0.5, p2sp: 1.3, gap: 1.1,         // fase 2 (HP < 50%): jeda antar serangan dikali p2gap (dulu 0.7 -> 0.5); p2sp = pengali kecepatan jalan; gap = jeda minimal setelah skill
  cleave: { trigger: 2.7, reach: 3.1, wind: 0.5, rec: 0.45, cd: 1.1, dmg: 16, kb: 9 },   // trigger = jarak (di luar radius badan) bos mulai menebas; reach = jangkauan tebasan
  shadow: { cd: 11, minDist: 3.5, cast: 0.9, n: 3, nP2: 4, len: 15, width: 1.7, spread: 4.5, warn: 1.1, warnP2: 0.9, wave2: 0.8, life: 1.2, dmg: 10, trap: 3.0, rec: 0.5 },   // SKILL 4 - GARIS BAYANGAN: garis ungu di lantai (peringatan) -> bayangan menyembul -> kena = terluka + TERJEBAK dalam kepompong bayangan. Garis pertama selalu lewat tempat pemain berdiri; fase 2: gelombang ke-2 (wave2) mengejar posisi baru pemain, nP2 garis per gelombang
  combo:  { tele: 0.3, dmg: 12, chainDmg: 7, chainDmgP2: 8, chainP2: 7, fin: 20, finP2: 26, finKb: 18 },   // KOMBO setelah pemain terjebak: terjang kilat -> tebasan beruntun (jebakan tidak pecah oleh tebasan biasa) -> tebasan pamungkas (fin) yang melempar pemain
  slash:  { cd: 6.5, minDist: 3.2, winds: [0.55, 0.42, 0.66], hold: 0.2, speed: 17, life: 1.5, dmg: [12, 12, 17], size: [1.8, 1.8, 2.3], rolls: [0.75, 0, Math.PI / 2], fan: 0.22, rec: 0.6 },   // winds = aba-aba tiap tebasan; size = setengah lebar gelombang; rolls = kemiringan bidang gelombang
  lunge:  { cd: 8, minDist: 6.5, tele: 0.8, lock: 0.25, speed: 30, maxLen: 22, stop: 1.7, dmg: 15, kb: 14, chain: 4, chainP2: 8, step: 0.26, chainDmg: 9, reach: 3.2, rec: 0.6 },   // stop = jarak berhenti di depan pemain; step = jeda antar tebasan beruntun
  laser:  { cd: 12, minDist: 4, charge: 2.6, lock: 1.0, dur: 1.2, durP2: 1.5, trk: 0.3, trkP2: 0.45, width: 0.6, dmg: 6, tick: 0.25, rec: 1.0 },   // DI-NERF: jeda antar laser lebih lama (cd), garis bidik terkunci 1,0 dtk sebelum menembak (lock) = waktu menghindar, sapuan lebih lambat (trk), lebih tipis (width), lebih singkat (dur), damage/detik turun dari ~78 ke ~24 (dmg / tick), bos diam lebih lama sesudahnya (rec)   // trk = kecepatan sapuan mengejar pemain (rad/dtk; lari menyamping ±0,7)
};
// Pose lengan kanan (pegang pedang) dihitung dengan IK pada rangka model (nilai = rotasi "delta" Euler YXZ di kerangka bos: x = depan(-)/belakang(+), y = putar, z = samping; lihat fireRigApply). Pose lain disusun dari tulang yang sama.
const KN_Z = [0, 0, 0];
const KN_POSE = {
  ready:   { Spine2: [0.05, 0, 0], RightArm: [-0.46, 0.06, 0.59], RightForeArm: [-0.52, -0.08, 0.07], LeftArm: [-0.3, 0, -0.45], LeftForeArm: [-0.7, 0, 0] },
  windA:   { Spine2: [-0.1, -0.55, 0], Spine1: [0, -0.2, 0], RightArm: [-1.81, -0.42, 0.32], RightForeArm: [-0.8, -0.44, -0.57], LeftArm: [-0.2, 0, -0.8], LeftForeArm: [-0.5, 0, 0] },
  strikeA: { Spine2: [0.35, 0.9, 0], Spine1: [0, 0.3, 0], RightArm: [-0.24, 0.12, 0.6], RightForeArm: [-0.08, -0.8, -0.6], LeftArm: [0.3, 0, -0.8], LeftForeArm: [-0.3, 0, 0] },
  windB:   { Spine2: [0, 0.6, 0], Spine1: [0, 0.15, 0], RightArm: [-0.33, 0.9, 0.74], RightForeArm: [-0.09, -0.5, -0.6], LeftArm: [-0.5, 0, -0.4], LeftForeArm: [-0.8, 0, 0] },
  strikeB: { Spine2: [0, -0.9, 0], Spine1: [0, -0.3, 0], RightArm: [-1.21, 0.41, -0.41], RightForeArm: [-0.48, -0.01, 0.37], LeftArm: [0.4, 0, -0.9], LeftForeArm: [-0.3, 0, 0] },
  windV:   { Spine2: [-0.4, 0, 0], RightArm: [-1.81, 0.62, 0.12], RightForeArm: [-0.6, -0.21, -0.13], LeftArm: [-0.6, 0, -0.5], LeftForeArm: [-0.5, 0, 0] },
  strikeV: { Spine2: [0.6, 0, 0], Spine1: [0.2, 0, 0], RightArm: [-0.95, 1.36, 0.18], RightForeArm: [-0.91, -0.8, -0.6], LeftArm: [-0.2, 0, -0.5], LeftForeArm: [-0.2, 0, 0] },
  thrust:  { Spine2: [0.15, 0.5, 0], RightArm: [-0.59, 0.21, 0.73], RightForeArm: [0.1, -0.8, -0.44], LeftArm: [0.2, 0, -0.7], LeftForeArm: [-0.2, 0, 0] },
  pull:    { Spine2: [0.1, -0.5, 0], RightArm: [-0.32, 0.35, 0.37], RightForeArm: [-0.12, -0.02, -0.1], LeftArm: [-0.1, 0, -0.5], LeftForeArm: [-0.3, 0, 0] },
  lowered: { RightArm: [-0.01, 0.46, 0.59], RightForeArm: [0.1, -0.58, -0.42], LeftArm: [-0.1, 0, -0.45], LeftForeArm: [-0.4, 0, 0] },
  roar:    { Spine2: [-0.45, 0, 0], Head: [-0.5, 0, 0], RightArm: [-1.81, 0.62, 0.12], RightForeArm: [-0.6, -0.21, -0.13], LeftArm: [-0.3, 0, 1.5], LeftForeArm: [-0.4, 0, 0] },
  laserCharge: { Spine2: [-0.15, 0, 0], Head: [-0.15, 0, 0], RightArm: [-0.01, 0.46, 0.59], RightForeArm: [0.1, -0.58, -0.42], LeftArm: [-2.0, 0, -0.5], LeftForeArm: [-0.8, 0, 0] },
  laserFire:   { Spine2: [0.1, 0, 0], RightArm: [-0.01, 0.46, 0.59], RightForeArm: [0.1, -0.58, -0.42], LeftArm: [-1.55, 0, -0.45], LeftForeArm: [-0.1, 0, 0] },
};
const KN_MAP = { 'Bip001-Pelvis': 'Hips', 'Bip001-Spine': 'Spine', 'Bip001-Spine1': 'Spine1', 'Bip001-Spine2': 'Spine2', 'Bip001-Neck': 'Neck', 'Bip001-Head': 'Head',
  'Bip001-L-Clavicle': 'LeftShoulder', 'Bip001-L-UpperArm': 'LeftArm', 'Bip001-L-Forearm': 'LeftForeArm', 'Bip001-L-Hand': 'LeftHand',
  'Bip001-R-Clavicle': 'RightShoulder', 'Bip001-R-UpperArm': 'RightArm', 'Bip001-R-Forearm': 'RightForeArm', 'Bip001-R-Hand': 'RightHand',
  'Bip001-L-Thigh': 'LeftUpLeg', 'Bip001-L-Calf': 'LeftLeg', 'Bip001-L-Foot': 'LeftFoot', 'Bip001-R-Thigh': 'RightUpLeg', 'Bip001-R-Calf': 'RightLeg', 'Bip001-R-Foot': 'RightFoot' };
let knGltf = null;
new GLTFLoader().load(KNIGHT.file, g => { knGltf = g; console.log('[Mordrak] model berhasil dimuat:', KNIGHT.file); }, undefined, err => console.error('[Mordrak] GAGAL memuat "' + KNIGHT.file + '" (nama file harus persis sama & satu folder dengan game.js) — bos memakai model penyihir cadangan.', err));
const kSlashes = [], kFx = [], kMotes = [], kShadows = []; let kLane = null, kLaser = null, kOrb = null, kGround = null;
const _knHand = new THREE.Vector3();   // posisi dunia telapak tangan kiri (diperbarui di knightPose; dipakai efek bayangan & laser)
// gelombang slash: bulan sabit datar (bidang xy lokal, sisi cembung ke +y = arah luncur, ujung runcing di y = 0, lebar -1..1)
const KN_CRES = (() => {
  const N = 14, pos = [], idx = [];
  for (let k = 0; k <= N; k++) { const t = -1 + 2 * k / N, yo = 0.9 * (1 - t * t), yi = yo - 0.34 * (1 - Math.pow(Math.abs(t), 1.2)); pos.push(t, yo, 0, t, yi, 0); }
  for (let k = 0; k < N; k++) { const a = 2 * k, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
})();
const KN_MOTE_GEO = new THREE.SphereGeometry(0.16, 6, 6);
const KN_MOTE_B = new THREE.MeshBasicMaterial({ color: 0x06000c, transparent: true, opacity: 0.95 });
const KN_MOTE_V = new THREE.MeshBasicMaterial({ color: 0x9a40ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const _kqM = new THREE.Matrix4(), _kx = new THREE.Vector3(), _ky = new THREE.Vector3(), _kz = new THREE.Vector3();

// ---- RANGKA BUATAN KODE untuk rogue_knight.glb (modelnya statis: tanpa tulang & tanpa animasi) ----
// Sendi diukur dari bentuk model (satuan model; x dihitung dari tengah badan, + = sisi kiri bos, y = tinggi dari lantai). Sisi kanan = cermin sisi kiri.
const KN_JOINTS = { Hips: [0, 0.95, 0.04], Spine: [0, 1.12, 0.04], Spine1: [0, 1.3, 0.04], Spine2: [0, 1.5, 0.04], Neck: [0, 1.68, 0.04], Head: [0, 1.78, 0.05],
  LeftShoulder: [0.18, 1.62, 0.02], LeftArm: [0.45, 1.58, 0.02], LeftForeArm: [0.58, 1.27, 0.05], LeftHand: [0.70, 1.0, 0.08],
  LeftUpLeg: [0.17, 0.92, 0.03], LeftLeg: [0.17, 0.48, 0.05], LeftFoot: [0.17, 0.12, 0.08] };
const KN_PARENT = { Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', Shoulder: 'Spine2', Arm: 'Shoulder', ForeArm: 'Arm', Hand: 'ForeArm', UpLeg: 'Hips', Leg: 'UpLeg', Foot: 'Leg' };
const knSide = nm => nm.startsWith('Left') ? 'Left' : nm.startsWith('Right') ? 'Right' : '';
const knJoint = nm => { const sd = knSide(nm), a = KN_JOINTS[sd ? 'Left' + nm.slice(sd.length) : nm]; return new THREE.Vector3(sd === 'Right' ? -a[0] : a[0], a[1], a[2]); };
const KN_SIDED = ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot'];
const knParent = nm => { const sd = knSide(nm), p = KN_PARENT[nm.slice(sd.length)]; return !p ? null : KN_SIDED.includes(p) ? sd + p : p; };   // tulang sisi kiri/kanan punya induk bersisi sama, kecuali Shoulder (induknya Spine2) dan UpLeg (induknya Hips)
// ruas tulang untuk pembobotan kulit: [tulang, titik awal, titik akhir, radius efektif] — radius kecil = pengaruh sempit (lengan), besar = badan
const KN_SEGS = (() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z), out = [];
  const add = (bn, a, b, r) => out.push({ bn, a, b, r });
  add('Hips', knJoint('Hips'), knJoint('Spine'), 0.4); add('Spine', knJoint('Spine'), knJoint('Spine1'), 0.4); add('Spine1', knJoint('Spine1'), knJoint('Spine2'), 0.45);
  add('Spine2', knJoint('Spine2'), knJoint('Neck'), 0.45); add('Neck', knJoint('Neck'), knJoint('Head'), 0.12); add('Head', knJoint('Head'), V(0, 2.02, 0.05), 0.24);
  for (const sd of ['Left', 'Right']) { const m = sd === 'Right' ? -1 : 1;
    add(sd + 'Shoulder', knJoint(sd + 'Shoulder'), V(0.42 * m, 1.6, 0.02), 0.2); add(sd + 'Arm', knJoint(sd + 'Arm'), knJoint(sd + 'ForeArm'), 0.17);
    add(sd + 'ForeArm', knJoint(sd + 'ForeArm'), knJoint(sd + 'Hand'), 0.16); add(sd + 'Hand', knJoint(sd + 'Hand'), V(0.745 * m, 0.86, 0.09), 0.13);
    add(sd + 'UpLeg', knJoint(sd + 'UpLeg'), knJoint(sd + 'Leg'), 0.22); add(sd + 'Leg', knJoint(sd + 'Leg'), knJoint(sd + 'Foot'), 0.2); add(sd + 'Foot', knJoint(sd + 'Foot'), V(0.17 * m, 0.03, 0.3), 0.18); }
  return out;
})();
const KN_SWORD = { grip: [0.273, 1.869, -0.274], tip: [-0.397, -0.918, -0.005], guard: [0.913, -0.395, 0.105], hold: [0, -0.35, 1] };   // belati panjang di punggung model: titik gagang, arah ujung bilah, arah pelindung (ruang model); hold = arah bilah saat digenggam (depan, sedikit ke bawah)
const _knSeg = new THREE.Vector3(), _knAB = new THREE.Vector3(), _knAP = new THREE.Vector3();
function knSkin(geo, bnames) {   // bobot kulit: tiap titik ikut tulang terdekat (jarak / radius), maksimal 4 tulang, dihaluskan
  const pos = geo.attributes.position, n = pos.count, idx = new Uint16Array(n * 4), wgt = new Float32Array(n * 4), v = new THREE.Vector3(), ws = new Float32Array(KN_SEGS.length);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    for (let k = 0; k < KN_SEGS.length; k++) {
      const sg = KN_SEGS[k]; _knAB.subVectors(sg.b, sg.a); _knAP.subVectors(v, sg.a);
      const t = Math.max(0, Math.min(1, _knAP.dot(_knAB) / _knAB.lengthSq())); _knSeg.copy(sg.a).addScaledVector(_knAB, t);
      ws[k] = 1 / Math.pow(v.distanceTo(_knSeg) / sg.r + 0.08, 5);
    }
    let tot = 0; const top = [-1, -1, -1, -1];
    for (let j = 0; j < 4; j++) { let bi = -1; for (let k = 0; k < ws.length; k++) if (top.indexOf(k) < 0 && (bi < 0 || ws[k] > ws[bi])) bi = k; top[j] = bi; tot += ws[bi]; }
    for (let j = 0; j < 4; j++) { idx[i * 4 + j] = bnames.indexOf(KN_SEGS[top[j]].bn); wgt[i * 4 + j] = ws[top[j]] / tot; }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
}

function buildKnight() {   // model statis (rogue_knight.glb) + rangka buatan kode + belati panjang di tangan kanan; rangka digerakkan oleh fireRigApply (pose KN_POSE) di knightPose
  const src = knGltf.scene; src.updateMatrixWorld(true);
  const parts = []; src.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push({ g, m: o.material }); } });   // geometri dipanggang ke ruang model
  let si = -1, best = 0;   // bilah panjang = bagian ber-bahan "Dagger" yang paling besar; sisanya (badan, ikat pinggang) di-skin ke rangka
  parts.forEach((q, i) => { if (/dagger/i.test(q.m.name || '')) { q.g.computeBoundingBox(); const d = q.g.boundingBox.getSize(_kx).length(); if (d > best) { best = d; si = i; } } });
  const bb = new THREE.Box3(); parts.forEach((q, i) => { if (i !== si) { q.g.computeBoundingBox(); bb.union(q.g.boundingBox); } });
  const cx = (bb.min.x + bb.max.x) / 2; parts.forEach(q => q.g.translate(-cx, 0, 0));   // x dihitung dari tengah badan (sama seperti KN_JOINTS)
  const root = new THREE.Group(), bone = {}, blist = [];
  for (const nm of FB_BONES) { const b = new THREE.Bone(); b.name = nm; bone[nm] = b; blist.push(b); }
  for (const nm of FB_BONES) { const pn = knParent(nm), j = knJoint(nm); if (pn) { bone[nm].position.copy(j).sub(knJoint(pn)); bone[pn].add(bone[nm]); } else { bone[nm].position.copy(j); root.add(bone[nm]); } }
  const mats = [], skinned = [];
  parts.forEach((q, i) => {
    const m = q.m.clone(); if (m.map) m.emissiveMap = m.map; m.transparent = false; m.opacity = 1; m.depthWrite = true; mats.push(m);   // emissiveMap = tekstur warna (tekstur model gelap, dicerahkan lewat emissive)
    if (i === si) { q.sword = new THREE.Mesh(q.g, m); q.sword.castShadow = true; q.sword.frustumCulled = false; return; }
    knSkin(q.g, FB_BONES); const sm = new THREE.SkinnedMesh(q.g, m); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false; root.add(sm); skinned.push(sm);
  });
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(blist); skinned.forEach(sm => sm.bind(skel, sm.matrixWorld));   // pose awal (bind) = bentuk asli model
  // belati panjang: dipindah dari punggung ke tangan kanan. Ujung bilah diputar ke arah "hold"; pelindung diselaraskan dengan arah lengan bawah (seperti pedang lama)
  if (si >= 0) {
    const sw = parts[si].sword, tipV = new THREE.Vector3(...KN_SWORD.tip).normalize(), hold = new THREE.Vector3(...KN_SWORD.hold).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(tipV, hold), flat = v => v.addScaledVector(hold, -v.dot(hold)).normalize();
    const g1 = flat(new THREE.Vector3(...KN_SWORD.guard).applyQuaternion(q)), g2 = flat(knJoint('RightHand').sub(knJoint('RightForeArm')));
    let ang = Math.atan2(new THREE.Vector3().crossVectors(g1, g2).dot(hold), g1.dot(g2)); if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;   // pelindung simetris
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(hold, ang));
    sw.quaternion.copy(q); sw.position.set(...KN_SWORD.grip).applyQuaternion(q).negate();   // titik gagang tepat di sendi tangan
    bone.RightHand.add(sw);
  }
  // pose istirahat model = lengan menggantung hampir lurus; pose lama dibuat untuk lengan miring ke luar ~41° di bawah datar, jadi lengan dibuka 0,44 rad
  bone.LeftArm.quaternion.setFromEuler(new THREE.Euler(0, 0, 0.44)); bone.RightArm.quaternion.setFromEuler(new THREE.Euler(0, 0, -0.44));
  const k = KNIGHT.height / KNIGHT.modelH; root.scale.setScalar(k); root.position.set(0, -bb.min.y * k, 0); root.updateMatrixWorld(true);   // kaki di y = 0, badan di tengah
  const face = new THREE.Group(); face.rotation.y = KNIGHT.face; face.add(root);
  const twist = new THREE.Group(); twist.add(face);   // (cadangan untuk model tanpa rangka; tidak dipakai bila rig ada)
  const lean = new THREE.Group(); lean.add(twist);   // lean: condong ke depan/belakang dengan poros di kaki + naik-turun + maju (lunge)
  const edgeM = glowMat(0xb050ff, 0.7);   // tidak dipasang ke apa pun; hanya agar S.edgeM.opacity di knightPose tetap valid
  const rest = {}, parentName = {}, cur = {};
  for (const nm of FB_BONES) {
    const b = bone[nm]; rest[nm] = b.quaternion.clone(); cur[nm] = [0, 0, 0];
    let p = b.parent; parentName[nm] = null; while (p && p !== root) { const pn = FB_BONES.find(n => bone[n] === p); if (pn) { parentName[nm] = pn; break; } p = p.parent; }
  }
  const rig = { bone, rest, parentName };
  return { lean, twist, mat: new THREE.MeshStandardMaterial(), mats, rig, cur, handL: bone.LeftHand, hOff: new THREE.Vector3(0.05, -0.12, 0.04), edgeM, lv: 0, lf: 0, lg: 0, ph: 0, heat: 0, light: null, lp: new THREE.Vector3(),
    // keadaan AI
    p2: false, roarT: KNIGHT.roar, c1: 3.5, c2: 6, c3: 8.5, pnear: true, k: 0, t: 0, rel: false, prev: 'ready', last: 'strikeB', hi: -1, n: 0, dlen: 0, dleft: 0, dhit: false, dpuff: 0, macc: 0, tick: 0, side: Math.random() < 0.5 ? -1 : 1, sideT: rnd(1.5, 3),
    fd: new THREE.Vector3(0, 0, 1), dd: new THREE.Vector3(0, 0, 1), ad: new THREE.Vector3(0, 0, 1),
    // permintaan pose per frame (diisi knightAI, dipakai knightPose)
    pa: 'ready', pb: 'ready', pu: 0, rate: 12, tLean: 0, tLift: 0, tLunge: 0, tHeat: 0, crouch: 0 };
}
function knPose(T, a, b, u) {   // campurkan pose a -> b (u 0..1) ke target T
  const A = KN_POSE[a] || {}, B = KN_POSE[b] || {};
  for (const nm of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const p = A[nm] || KN_Z, q = B[nm] || KN_Z, o = T[nm] || (T[nm] = [0, 0, 0]);
    o[0] += p[0] + (q[0] - p[0]) * u; o[1] += p[1] + (q[1] - p[1]) * u; o[2] += p[2] + (q[2] - p[2]) * u;
  }
}
function knightPose(e, dt, dying) {   // pose tubuh sesuai permintaan AI (S.pa -> S.pb) + jalan / bernapas + bahan & cahaya
  const S = e.kn, gp = e.g.position, t = P.t;
  const speed = dt > 1e-4 ? Math.hypot(gp.x - S.lp.x, gp.z - S.lp.z) / dt : 0; S.lp.copy(gp);
  const T = {}, add = (nm, x = 0, y = 0, z = 0) => { const a = T[nm] || (T[nm] = [0, 0, 0]); a[0] += x; a[1] += y; a[2] += z; };
  const run = !dying && e.atk === 'ldash', w = dying || (e.atk && !run) ? 0 : clamp01((run ? 30 : speed) / 3);
  S.ph += (run ? 15 : Math.min(speed, 6) * 1.0) * dt;
  const sw = Math.sin(S.ph), br = Math.sin(t * 1.5 + e.ph), amp = run ? 0.85 : 0.5;
  let lean = 0, lift = 0, lunge = 0, rate = 10, heat = S.p2 ? 0.35 : 0;
  if (dying) {   // berlutut perlahan, pedang terkulai
    const p = clamp01((1 - slow.t / SLOW_TOTAL) / SLOW_DEATH); rate = 6; lean = 0.12 + 0.45 * p; lift = -0.04 * p; heat = 0.8 * (1 - p);
    knPose(T, 'ready', 'lowered', p); add('Head', 0.6 * p); add('Spine1', 0.3 * p);
    add('LeftUpLeg', -0.8 * p); add('LeftLeg', 1.3 * p); add('RightUpLeg', -0.8 * p); add('RightLeg', 1.3 * p);
  } else {
    knPose(T, S.pa, S.pb, S.pu); rate = S.rate; lean = S.tLean; lift = S.tLift; lunge = S.tLunge; heat = Math.max(heat, S.tHeat);
    const c = S.crouch; if (c > 0) { add('LeftUpLeg', -0.7 * c); add('LeftLeg', 1.0 * c); add('RightUpLeg', 0.35 * c); add('RightLeg', 0.5 * c); add('Head', 0.2 * c); add('Spine', 0, Math.sin(t * 50) * 0.03 * c); }
    add('LeftUpLeg', -sw * amp * w); add('RightUpLeg', sw * amp * w); add('LeftLeg', Math.max(0, -sw) * 0.75 * w); add('RightLeg', Math.max(0, sw) * 0.75 * w);   // jalan berat: paha maju-mundur, lutut menekuk
    add('LeftArm', sw * 0.35 * w); add('RightArm', -sw * 0.06 * w); add('Spine2', br * 0.02, sw * 0.06 * w); add('Head', -br * 0.02);
    lift += Math.abs(sw) * 0.1 * w + br * 0.03 + 0.04; lean += 0.08 * w;
    if (e.stun > 0) { lean -= 0.22; add('Head', 0.3); rate = 24; }   // terkena pukulan: terhentak ke belakang
  }
  S.heat += (heat - S.heat) * (1 - Math.exp(-dt * 8));
  const kk = 1 - Math.exp(-rate * dt);
  for (const nm of FB_BONES) { const c = S.cur[nm]; if (!c) continue; const tg = T[nm]; for (let i = 0; i < 3; i++) c[i] += ((tg ? tg[i] : 0) - c[i]) * kk; }
  S.lv += (lean - S.lv) * kk; S.lf += (lift - S.lf) * kk; S.lg += (lunge - S.lg) * kk;
  S.lean.rotation.x = S.lv; S.lean.position.set(0, S.lf, S.lg);
  if (S.rig) fireRigApply(S.rig, e.g, S.cur);
  else if (S.twist) { const sp = S.cur.Spine2, ra = S.cur.RightArm; S.twist.rotation.set(sp[0] * 0.5 + ra[0] * 0.1, sp[1] * 0.8 + ra[1] * 0.1, 0, 'YXZ'); }   // tanpa rangka: pose serangan memutar/memiringkan seluruh badan
  if (S.handL) { if (S.hOff) _knHand.copy(S.hOff); else _knHand.set(22, 0, 0); S.handL.localToWorld(_knHand); }
  else { _knHand.set(0, KNIGHT.height * 0.62, 0.7); S.lean.localToWorld(_knHand); }   // tanpa tulang tangan: titik kumpul bayangan / sumber laser = depan dada bos   // pusat telapak tangan kiri (22 satuan model dari pergelangan ke arah jari); localToWorld memperbarui rantai induk, jadi sudah memakai pose terbaru
  if (S.light) S.light.intensity = 14 + S.heat * 14 + Math.sin(t * 7) * 1.5;
  S.edgeM.opacity = 0.55 + 0.4 * S.heat + 0.08 * Math.sin(t * 9);
  e.mat.emissiveIntensity = dying ? 2 : 2.2 + S.heat * 0.8 + (e.flash > 0 ? 1.4 : 0);   // tekstur model ~14% terang, jadi dikali ~2,6 supaya terlihat jelas
  for (const m of S.mats) if (m.emissive) { m.emissive.copy(e.mat.emissive); m.emissiveIntensity = e.mat.emissiveIntensity * (m.emissiveMap ? 1 : 0.15); }   // bahan tanpa tekstur (warna polos) diredam supaya tidak jadi bercak terang   // kilatan terkena pukulan / mati berlaku ke seluruh bahan model
  if (!dying && Math.random() < 0.25 + 0.4 * S.heat) { const a = rnd(0, 6.28); burst(new THREE.Vector3(gp.x + Math.cos(a) * 0.9, rnd(0.3, 4.0), gp.z + Math.sin(a) * 0.9), Math.random() < 0.55 ? 0x2a0a40 : 0xa040ff, 1, 1.2); }   // asap bayangan & percik ungu
}

// --- efek ---
const knDisp = c => { c.glow.material.dispose(); c.core.material.dispose(); };
function makeCrescent(sz) {   // sz = setengah lebar (satuan dunia). inti hitam + pinggir ungu menyala
  const g = new THREE.Group();
  const glow = new THREE.Mesh(KN_CRES, glowMat(0xb050ff, 0.85)); glow.scale.set(1.12, 1.12, 1); glow.renderOrder = 4;
  const core = new THREE.Mesh(KN_CRES, new THREE.MeshBasicMaterial({ color: 0x040008, transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false })); core.scale.set(0.9, 0.82, 1); core.renderOrder = 5;
  g.add(glow, core); g.scale.setScalar(sz); return { g, glow, core };
}
function orientCres(g, f, roll) {   // f = arah luncur (datar, ternormalisasi); roll 0 = bidang datar (sapuan mendatar), PI/2 = bidang tegak (tebasan dari atas), di antaranya = diagonal
  _kx.set(-f.z, 0, f.x).multiplyScalar(Math.cos(roll)).addScaledVector(UP, Math.sin(roll)); _ky.copy(f); _kz.crossVectors(_kx, _ky);
  g.quaternion.setFromRotationMatrix(_kqM.makeBasis(_kx, _ky, _kz));
}
function knSlashShot(e, f, roll, size, dmg) {   // gelombang slash jarak jauh
  const c = makeCrescent(size), p = e.g.position.clone(); p.y = 1.3 + 0.35 * Math.abs(Math.sin(roll)); p.addScaledVector(f, e.r + 0.9);
  orientCres(c.g, f, roll); c.g.position.copy(p); scene.add(c.g);
  kSlashes.push({ g: c.g, c, f: f.clone(), roll, pos: p, size, dmg, t: 0 });
  burst(p, 0xb050ff, 8, 5);
}
function knSlashFx(e, f, roll, size) {   // kilatan tebasan jarak dekat (tanpa melesat): bulan sabit muncul di depan bos lalu memudar
  const c = makeCrescent(size), p = e.g.position.clone(); p.y = 1.6; p.addScaledVector(f, e.r + 1.5);
  orientCres(c.g, f, roll); c.g.position.copy(p); scene.add(c.g); kFx.push({ g: c.g, c, t: 0, dur: 0.22, size });
  burst(p, 0xb050ff, 6, 5); lineSparks(p, 8, 7, 0.6, [0xe8c8ff, 0x9a30ff]);
}
function knMote(cx, cz) {   // partikel bayangan yang mengalir ke telapak tangan kiri
  const a = rnd(0, 6.28), r = rnd(3, 8.5), m = new THREE.Mesh(KN_MOTE_GEO, Math.random() < 0.6 ? KN_MOTE_B : KN_MOTE_V), from = new THREE.Vector3(cx + Math.cos(a) * r, rnd(0.1, 2.2), cz + Math.sin(a) * r), s = rnd(0.6, 1.6);
  m.position.copy(from); m.scale.setScalar(s); scene.add(m); kMotes.push({ m, from, t: 0, dur: rnd(0.55, 0.95), sc: s, sw: Math.random() < 0.5 ? 1 : -1 });
}
function knOrbMake() {   // bola bayangan di telapak tangan kiri
  const g = new THREE.Group(), core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xa040ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.3, 40), glowMat(0xc080ff, 0.7));
  g.add(core, halo, ring); scene.add(g); kOrb = { g, core, halo, ring };
}
function knGroundMake() {   // bayangan gelap menyebar di lantai di bawah bos saat mengumpulkan kekuatan
  kGround = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })); kGround.rotation.x = -Math.PI / 2; kGround.position.y = 0.05; scene.add(kGround);
}
function knLaserMake() {   // laser hitam: inti hitam pekat + pinggir ungu menyala + halo; garis bidik tipis untuk aba-aba
  const g = new THREE.Group(), mk = (c, add) => new THREE.Mesh(BEAM_GEO, add ? glowMat(c, 0) : new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  const halo = mk(0xa040ff, true), rim = mk(0xd9a0ff, true), core = mk(0x000000, false), warn = mk(0xb050ff, true);
  halo.renderOrder = 3; rim.renderOrder = 4; core.renderOrder = 5;
  const spr = c => new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const flare = spr(0xb050ff), hit = spr(0xb050ff);
  g.add(halo, rim, core, warn, flare, hit); scene.add(g); kLaser = { g, halo, rim, core, warn, flare, hit };
}
function knAim(S, muzzle, dt, trk) {   // arah bidik: berputar (datar) mengejar pemain dengan kecepatan terbatas, miring ke dada pemain
  const tx = player.position.x - muzzle.x, tz = player.position.z - muzzle.z, tl = Math.hypot(tx, tz) || 1, cur = Math.atan2(S.ad.x, S.ad.z);
  let da = Math.atan2(tx, tz) - cur; da = Math.atan2(Math.sin(da), Math.cos(da));
  const a = cur + Math.max(-trk * dt, Math.min(trk * dt, da)), pitch = Math.atan2(1.0 - muzzle.y, Math.max(3, tl));
  S.ad.set(Math.sin(a), 0, Math.cos(a));
  return new THREE.Vector3(S.ad.x * Math.cos(pitch), Math.sin(pitch), S.ad.z * Math.cos(pitch));
}
function knBeamEnd(o, dir) {   // ujung laser: menyentuh lantai atau dinding arena (mana yang lebih dulu)
  let t = 34; if (dir.y < -0.01) t = Math.min(t, -o.y / dir.y);
  const a = dir.x * dir.x + dir.z * dir.z, b = 2 * (o.x * dir.x + o.z * dir.z), c = o.x * o.x + o.z * o.z - (R + 0.5) * (R + 0.5);
  if (a > 1e-6) { const disc = b * b - 4 * a * c; if (disc > 0) { const te = (-b + Math.sqrt(disc)) / (2 * a); if (te > 0) t = Math.min(t, te); } }
  return o.clone().addScaledVector(dir, Math.max(1, t));
}
function knHurt(n, from, force = 0) {   // true bila MENGENAI (tidak kebal / berguling); knockback hanya bila kena
  if (!iceHurt(n)) return false;
  if (force && from) { const dx = player.position.x - from.x, dz = player.position.z - from.z, l = Math.hypot(dx, dz) || 1; pushPlayer(_iv.set(dx / l, 0, dz / l), force); }
  return true;
}
function knRing(x, z, max, dur, col = 0xa040ff) { const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(col)); rm.rotation.x = -Math.PI / 2; rm.position.set(x, 0.1, z); scene.add(rm); pulses.push({ m: rm, t: dur, dur, max }); }
function clearKnight() {   // bersihkan semua efek bos (bos mati / pemain kalah / keluar dungeon)
  clearShadows(); if (P.trap > 0 || iTrap) clearIceBoss();   // garis bayangan hilang & pemain bebas dari kepompong bayangan
  for (const s of kSlashes) { scene.remove(s.g); knDisp(s.c); } kSlashes.length = 0;
  for (const f of kFx) { scene.remove(f.g); knDisp(f.c); } kFx.length = 0;
  for (const m of kMotes) scene.remove(m.m); kMotes.length = 0;
  if (kLane) { scene.remove(kLane); kLane.material.dispose(); kLane = null; }
  if (kLaser) { scene.remove(kLaser.g); kLaser.g.traverse(o => { if (o.material) o.material.dispose(); }); kLaser = null; }
  if (kOrb) { scene.remove(kOrb.g); kOrb.g.traverse(o => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); }); kOrb = null; }
  if (kGround) { scene.remove(kGround); kGround.material.dispose(); kGround.geometry.dispose(); kGround = null; }
}
const KN_SPIKE = new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0);
function spawnShadowLine(cx, cz, ang, len, w, warn) {   // satu garis bayangan di lantai: tengah (cx, cz), arah (sin ang, cos ang)
  const bar = new THREE.Mesh(LANE_GEO, glowMat(0xa020ff, 0.3)); bar.scale.set(w, 1, len); bar.position.set(cx, 0.06, cz); bar.rotation.y = ang; scene.add(bar);
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x0c0418, emissive: 0x7a30ff, emissiveIntensity: 0.9, roughness: 0.4, flatShading: true, transparent: true, opacity: 1 }), cones = [];
  const dx = Math.sin(ang), dz = Math.cos(ang), n = Math.max(4, Math.round(len / 1.2));
  for (let k = 0; k < n; k++) {
    const t = -len / 2 + (k + 0.5) * len / n, lat = rnd(-w * 0.25, w * 0.25), m = new THREE.Mesh(KN_SPIKE, mat), wd = rnd(0.45, 0.8);
    m.position.set(cx + dx * t + dz * lat, 0, cz + dz * t - dx * lat); m.scale.set(wd, 0.001, wd); m.rotation.set(rnd(-0.2, 0.2), rnd(0, 6.28), rnd(-0.2, 0.2)); m.castShadow = true; g.add(m); cones.push({ m, h: rnd(1.6, 3.4) });
  }
  g.visible = false; scene.add(g);
  kShadows.push({ bar, g, mat, cones, cx, cz, ang, len, w, warn, t: 0, up: false });
}
function eruptShadowLine(s) {
  const C = KNIGHT.shadow; s.up = true; s.g.visible = true; s.bar.material.opacity = 0.5;
  burst(new THREE.Vector3(s.cx, 0.8, s.cz), 0xb050ff, 14, 8); lineSparks(new THREE.Vector3(s.cx, 0.4, s.cz), 24, 9, 1.2, [0xe8c8ff, 0x9a30ff]);
  shake = Math.max(shake, 0.25); audio.sfx('thud', { vol: 0.6, rate: rnd(0.8, 1.0) });
  lyra.hurtSeg(s.cx, s.cz, Math.sin(s.ang), Math.cos(s.ang), s.len, s.w / 2, Math.round(C.dmg * bossMul()));
  const dx = player.position.x - s.cx, dz = player.position.z - s.cz, along = dx * Math.sin(s.ang) + dz * Math.cos(s.ang), lat = Math.abs(dx * Math.cos(s.ang) - dz * Math.sin(s.ang));
  if (P.trap <= 0 && Math.abs(along) < s.len / 2 + PLAYER_R && lat < s.w / 2 + PLAYER_R && !(P.air && player.position.y > 1.0) && knHurt(C.dmg, null)) {   // kena = terluka + terjebak dalam kepompong bayangan (berguling / lompat = lolos)
    trapPlayer(C.trap);
    if (iTrap) { iTrap.mat.color.setHex(0x14062a); iTrap.mat.emissive.setHex(0x8a30ff); }   // balok pemain diwarnai bayangan (mekanik terjebak sama dengan bos es)
  }
}
function removeShadowLine(s) { scene.remove(s.bar, s.g); s.bar.material.dispose(); s.mat.dispose(); const i = kShadows.indexOf(s); if (i >= 0) kShadows.splice(i, 1); }
function clearShadows() { for (const s of [...kShadows]) removeShadowLine(s); }
function castShadowLines(e, wave) {   // gelombang garis bayangan: garis pertama tepat di bawah pemain, sisanya menyebar di sekitarnya
  const C = KNIGHT.shadow, p2 = !!e.kn.p2, n = p2 ? C.nP2 : C.n, warn = p2 ? C.warnP2 : C.warn, a0 = rnd(0, Math.PI), px = player.position.x, pz = player.position.z;
  for (let i = 0; i < n; i++) {
    const ang = a0 + i * Math.PI / n + rnd(-0.15, 0.15), dx = Math.sin(ang), dz = Math.cos(ang), off = i === 0 ? 0 : rnd(-C.spread, C.spread), al = i === 0 ? 0 : rnd(-2, 2);
    const cx = px - dz * off + dx * al, cz = pz + dx * off + dz * al;
    const t0 = -(cx * dx + cz * dz), fx = cx + dx * t0, fz = cz + dz * t0, dd = Math.hypot(fx, fz), lim = R - 0.8;   // foot = titik terdekat garis ke pusat arena; potong garis agar tidak keluar dinding
    if (dd >= lim - 1.5) continue;
    const h = Math.sqrt(lim * lim - dd * dd), lo = Math.max(-C.len / 2, t0 - h), hi = Math.min(C.len / 2, t0 + h);
    if (hi - lo < 3) continue;
    const mid = (lo + hi) / 2; spawnShadowLine(cx + dx * mid, cz + dz * mid, ang, hi - lo, C.width, warn);
  }
  audio.sfx('roar', { vol: 0.4, rate: 1.1 }); shake = Math.max(shake, 0.4);
}
function shadowFxTick(dt) {   // peringatan berkedip -> bayangan menyembul -> bertahan -> tenggelam (jebakan pemain diurus iceFxTick)
  const C = KNIGHT.shadow;
  for (const s of [...kShadows]) {
    s.t += dt;
    if (!s.up) {
      const u = clamp01(s.t / s.warn); s.bar.material.opacity = 0.2 + 0.3 * Math.abs(Math.sin(s.t * (10 + 18 * u))); s.bar.scale.x = s.w * (0.3 + 0.7 * u);
      if (s.t >= s.warn) eruptShadowLine(s);
    } else {
      const k = s.t - s.warn, up = 1 - Math.pow(1 - clamp01(k / 0.14), 3), sink = clamp01((C.life - k) / 0.5);
      for (const c of s.cones) c.m.scale.y = Math.max(0.001, c.h * up * sink);
      s.mat.opacity = 0.3 + 0.7 * sink; s.bar.material.opacity = 0.5 * sink;
      if (Math.random() < 0.3) burst(new THREE.Vector3(s.cx + (Math.random() - 0.5) * s.len * Math.sin(s.ang), rnd(0.3, 2.5), s.cz + (Math.random() - 0.5) * s.len * Math.cos(s.ang)), 0xa040ff, 1, 1.2);
      if (k >= C.life) removeShadowLine(s);
    }
  }
}
function knightFxTick(dt) {   // gelombang slash yang melesat, kilatan tebasan, partikel bayangan (AI mengurus laser, bola & lantai)
  shadowFxTick(dt);
  const SC = KNIGHT.slash;
  for (const s of [...kSlashes]) {
    const rm = () => { scene.remove(s.g); knDisp(s.c); kSlashes.splice(kSlashes.indexOf(s), 1); };
    s.t += dt; s.pos.addScaledVector(s.f, SC.speed * dt); s.g.position.copy(s.pos);
    const fade = 1 - clamp01((s.t - (SC.life - 0.3)) / 0.3); s.c.glow.material.opacity = 0.85 * fade; s.c.core.material.opacity = 0.96 * fade;
    if (Math.random() < 0.7) burst(s.pos.clone().addScaledVector(s.f, -rnd(0.2, 1.2)).add(new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1))), Math.random() < 0.5 ? 0x1a0630 : 0xb050ff, 1, 1.2);
    const r = player.position.clone().setY(player.position.y + 0.9).sub(s.pos), fw = r.dot(s.f), lat = Math.abs(-r.x * s.f.z + r.z * s.f.x), cr = Math.abs(Math.cos(s.roll)), sr = Math.abs(Math.sin(s.roll));
    const hw = 0.4 + s.size * 0.85 * cr + PLAYER_R, hv = 0.4 + s.size * 0.85 * sr + 0.5;   // bidang datar = lebar ke samping; bidang tegak = tinggi ke atas-bawah
    if (Math.abs(fw) < 1.1 && lat < hw && Math.abs(r.y) < hv && knHurt(s.dmg, s.pos, 6)) { burst(player.position.clone().setY(1.1), 0xb050ff, 14, 7); lineSparks(player.position.clone().setY(1.1), 16, 8, 1, [0xe8c8ff, 0x9a30ff]); shake = Math.max(shake, 0.35); rm(); }
    else if (s.t >= SC.life || Math.hypot(s.pos.x, s.pos.z) > R + 3) { burst(s.pos.clone(), 0xb050ff, 6, 4); rm(); }
  }
  for (const f of [...kFx]) {
    f.t += dt; const u = clamp01(f.t / f.dur); f.g.scale.setScalar(f.size * (1 + 0.3 * u)); f.c.glow.material.opacity = 0.85 * (1 - u); f.c.core.material.opacity = 0.96 * (1 - u);
    if (u >= 1) { scene.remove(f.g); knDisp(f.c); kFx.splice(kFx.indexOf(f), 1); }
  }
  for (const m of [...kMotes]) {
    m.t += dt; const u = clamp01(m.t / m.dur), k = u * u, a = m.sw * u * 1.6, ca = Math.cos(a), sa = Math.sin(a);
    const rx = m.from.x - _knHand.x, rz = m.from.z - _knHand.z;   // melingkar masuk menuju telapak tangan
    m.m.position.set(_knHand.x + (rx * ca - rz * sa) * (1 - k), m.from.y + (_knHand.y - m.from.y) * k, _knHand.z + (rx * sa + rz * ca) * (1 - k)); m.m.scale.setScalar(m.sc * (1 - u * 0.7));
    if (u >= 1) { scene.remove(m.m); kMotes.splice(kMotes.indexOf(m), 1); }
  }
}

// --- AI utama Mordrak: mengejar pemain, tebasan dasar saat dekat, lalu memilih skill: tebas 3x (slash), terjang + tebas beruntun (lunge), laser bayangan (laser) ---
function knightAI(e, d, dist, dt) {
  const F = KNIGHT, S = e.kn, gp = e.g.position; gp.y = 0;
  S.c1 -= dt; S.c2 -= dt; S.c3 -= dt; S.c4 = (S.c4 === undefined ? 5 : S.c4) - dt;   // c4 = jeda skill garis bayangan
  const clampArena = () => { const hl = Math.hypot(gp.x, gp.z); if (hl > R - 2) { gp.x *= (R - 2) / hl; gp.z *= (R - 2) / hl; } };
  const p2 = e.hp < e.max * F.p2, gm = p2 ? F.p2gap : 1, face = v => { e.g.rotation.y = Math.atan2(v.x, v.z); };
  S.pa = 'ready'; S.pb = 'ready'; S.pu = 0; S.rate = 12; S.tLean = 0; S.tLift = 0; S.tLunge = 0; S.tHeat = 0; S.crouch = 0;   // diatur ulang tiap frame; tiap keadaan mengisi sendiri
  if (p2 && !S.p2 && !e.atk) {   // masuk fase 2: meraung lagi, bayangan makin ganas
    S.p2 = true; e.atk = 'roar'; S.roarT = 1.1; e.at = 1.1; e.rec = 0; audio.sfx('roar'); shake = Math.max(shake, 0.8);
    burst(gp.clone().setY(2), 0xa040ff, 40, 10); knRing(gp.x, gp.z, 9, 0.8); S.c1 = Math.min(S.c1, 2); S.c3 = Math.min(S.c3, 3.5); S.c4 = Math.min(S.c4, 2); e.sp = F.sp * F.p2sp;   // mengamuk: jalan lebih cepat, garis bayangan datang cepat
  }
  if (P.trap <= 0) S.cmbd = false;
  else if (!S.cmbd && (!e.atk || e.atk === 's4') && e.stun <= 0) {   // pemain terjebak kepompong bayangan -> KOMBO: terjang kilat, tebasan beruntun, tebasan pamungkas (kalau sudah dekat: langsung tebas)
    const D = F.lunge; S.cmbd = true; S.cmb = true; e.rec = 0; e.cd = 0; e.wind = 0;
    if (e.atk === 's4') S.c4 = F.shadow.cd * gm;
    if (dist > e.r + 3) {
      e.atk = 'ltele'; e.at = F.combo.tele; S.dd.copy(d); S.dlen = Math.max(2, Math.min(D.maxLen, dist - e.r - D.stop));
      if (!kLane) { kLane = new THREE.Mesh(LANE_GEO, glowMat(0xa020ff, 0.25)); scene.add(kLane); }
    } else { e.atk = 'lchain'; S.t = 0; S.hi = -1; S.n = p2 ? F.combo.chainP2 : D.chain; S.last = 'thrust'; S.fd.copy(d); }
    audio.sfx('roar', { vol: 0.7, rate: 1.3 });
  }
  if (e.atk === 'roar') {   // raungan: pedang diangkat, tangan kiri terbuka, kepala menengadah
    e.at -= dt; const p = clamp01(1 - e.at / Math.max(0.01, S.roarT)), s = clamp01(p * 5) * (1 - clamp01((p - 0.8) * 5));
    S.pa = 'ready'; S.pb = 'roar'; S.pu = s; S.rate = 12; S.tLean = -0.1 * s; S.tHeat = s;
    if (Math.random() < 0.5) burst(gp.clone().setY(rnd(1, 4)), 0xa040ff, 2, 6);
    if (e.at <= 0) e.atk = null;
  } else if (e.atk === 'cleave') {   // tebasan dasar: aba-aba (pedang di atas bahu kanan), arah dikunci 0,15 dtk terakhir, lalu menebas diagonal
    e.at -= dt; if (e.at > 0.15) S.fd.copy(d); face(S.fd);
    const u = eio(clamp01(1 - e.at / F.cleave.wind)); S.pa = 'ready'; S.pb = 'windA'; S.pu = u; S.rate = 16; S.tLean = -0.08 * u; S.tHeat = u;
    if (e.at <= 0) {
      e.atk = null; e.rec = F.cleave.rec; e.rk = 'cleave'; e.cd = F.cleave.cd * gm;
      if (dist < e.r + F.cleave.reach) knHurt(F.cleave.dmg, gp, F.cleave.kb);
      knSlashFx(e, S.fd, 0.75, 1.7); audio.sfx('slash'); shake = Math.max(shake, 0.3);
    }
  } else if (e.atk === 's4') {   // SKILL 4 - GARIS BAYANGAN: tangan kiri terangkat -> garis bayangan muncul di lantai (garis pertama tepat di bawah pemain) -> menyembul & menjebak. Fase 2: gelombang kedua mengejar posisi baru pemain
    const C = F.shadow; e.mt += dt; if (e.mt < C.cast) S.fd.copy(d); face(S.fd);
    if (!S.ls) { const u = eio(clamp01(e.mt / C.cast)); S.pa = 'ready'; S.pb = 'laserCharge'; S.pu = u; S.rate = 11; S.tLean = -0.1 * u; S.tHeat = u; if (Math.random() < 0.5) burst(_knHand.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3))), 0xa040ff, 1, 2); }
    else { S.pa = 'laserFire'; S.pb = 'laserFire'; S.pu = 1; S.rate = 16; S.tLean = 0.1; S.tHeat = 1; }
    if (S.ls === 0 && e.mt >= C.cast) { S.ls = 1; castShadowLines(e, 0); knRing(gp.x, gp.z, 6, 0.4); }
    if (S.ls === 1 && p2 && e.mt >= C.cast + C.wave2) { S.ls = 2; castShadowLines(e, 1); knRing(gp.x, gp.z, 6, 0.4); }
    if (e.mt >= C.cast + (p2 ? C.wave2 : 0) + 0.5) { e.atk = null; e.rec = C.rec; e.rk = 'laser'; S.c4 = C.cd * gm; e.cd = F.gap * gm; }
  } else if (e.atk === 's1') {   // SKILL 1 - tebas 3x: tiap tebasan = aba-aba -> lepas gelombang slash -> tahan sebentar
    const C = F.slash, k = S.k, WK = ['windA', 'windB', 'windV'], SK = ['strikeA', 'strikeB', 'strikeV'], w = C.winds[k] * (p2 ? 0.85 : 1);
    S.t += dt;
    if (!S.rel) {
      if (S.t < w - 0.15) S.fd.copy(d); face(S.fd);   // arah dikunci 0,15 dtk sebelum menebas
      const u = eio(clamp01(S.t / w)); S.pa = S.prev; S.pb = WK[k]; S.pu = u; S.rate = 16; S.tLean = -0.08 * u; S.tHeat = u;
      if (S.t >= w) {
        S.rel = true; S.t = 0;
        knSlashShot(e, S.fd, C.rolls[k], C.size[k], C.dmg[k]);
        if (p2) for (const a of [C.fan, -C.fan, C.fan * 2, -C.fan * 2]) knSlashShot(e, S.fd.clone().applyAxisAngle(UP, a), C.rolls[k], C.size[k], C.dmg[k]);   // fase 2: 5 gelombang menyebar (dulu 3)
        audio.sfx('slash'); shake = Math.max(shake, 0.3 + 0.1 * k); knRing(gp.x, gp.z, 3.2, 0.3);
      }
    } else {
      face(S.fd); const u = eio(clamp01(S.t / 0.12)); S.pa = WK[k]; S.pb = SK[k]; S.pu = u; S.rate = 30; S.tLean = 0.22; S.tLunge = 0.3; S.tHeat = 1;
      if (S.t >= C.hold) { S.prev = SK[k]; S.k++; S.t = 0; S.rel = false; if (S.k >= 3) { e.atk = null; e.rec = C.rec; e.rk = 's1'; S.c1 = C.cd * gm; e.cd = F.gap * gm; } }
    }
  } else if (e.atk === 'ltele') {   // SKILL 2 - aba-aba terjang: membungkuk, jalur ungu mengikuti pemain lalu terkunci (berkedip) sebelum menerjang
    const D = F.lunge; e.at -= dt;
    if (e.at > D.lock) { S.dd.copy(d); S.dlen = Math.max(2, Math.min(D.maxLen, dist - e.r - D.stop)); }
    face(S.dd);
    if (kLane) { kLane.scale.set(2.4, 1, S.dlen + 2); kLane.position.set(gp.x, 0.06, gp.z).addScaledVector(S.dd, (S.dlen + 2) / 2); kLane.rotation.y = Math.atan2(S.dd.x, S.dd.z); kLane.material.opacity = e.at > D.lock ? 0.25 : 0.25 + 0.25 * Math.sin(P.t * 40); }
    const u = eio(clamp01(1 - e.at / D.tele)); S.pa = 'ready'; S.pb = 'pull'; S.pu = u; S.rate = 12; S.crouch = u; S.tLean = 0.32 * u; S.tHeat = u;
    if (e.at <= 0) { e.atk = 'ldash'; S.dleft = S.dlen; S.dhit = false; S.dpuff = 0; audio.sfx('roar', { vol: 0.6, rate: 1.4 }); }
  } else if (e.atk === 'ldash') {   // menerjang lurus sepanjang jalur dengan pedang terjulur ke depan; sampai di ujung langsung menebas beruntun
    const D = F.lunge, step = Math.min(S.dleft, D.speed * dt); gp.addScaledVector(S.dd, step); S.dleft -= step; face(S.dd); clampArena();
    S.pa = 'pull'; S.pb = 'thrust'; S.pu = 1; S.rate = 18; S.tLean = 0.5; S.tLift = 0.1; S.tHeat = 1;
    if (!S.dhit && dist < e.r + 1.1) { S.dhit = true; if (S.cmb) iceHurt(F.combo.dmg); else knHurt(D.dmg, gp, D.kb);   // kombo: pemain tetap terjebak (tidak terpental)
      shake = Math.max(shake, 0.6); audio.sfx('thud', { vol: 0.9, rate: 0.6 }); }
    S.dpuff -= dt; if (S.dpuff <= 0) { S.dpuff = 0.05; burst(gp.clone().setY(0.4), 0x2a0a40, 3, 4); burst(gp.clone().setY(1.2), 0xa040ff, 2, 3); }
    if (S.dleft <= 0.01 || Math.hypot(gp.x, gp.z) >= R - 2.01) {
      e.atk = 'lchain'; S.t = 0; S.hi = -1; S.n = p2 ? (S.cmb ? F.combo.chainP2 : D.chainP2) : D.chain; S.last = 'thrust'; S.fd.copy(d);
      if (kLane) { scene.remove(kLane); kLane.material.dispose(); kLane = null; }
      burst(gp.clone().setY(0.5), 0xa040ff, 16, 7); shake = Math.max(shake, 0.4);
    }
  } else if (e.atk === 'lchain') {   // tebasan beruntun kiri-kanan: diagonal kanan -> sapuan balik, terus menempel pada pemain
    const D = F.lunge, T = D.step; S.t += dt; const i = Math.floor(S.t / T);
    if (i >= S.n) { e.atk = null; e.rec = D.rec; e.rk = 'lchain'; S.c2 = D.cd * gm; e.cd = F.gap * gm; if (S.cmb) { S.cmb = false; if (p2) { S.f4 = true; S.c4 = 0; e.rec = 0.3; } } }   // habis kombo; fase 2: langsung disambung garis bayangan lagi
    else {
      const tt = S.t - i * T, uw = clamp01(tt / (T * 0.5)), us = clamp01((tt - T * 0.5) / (T * 0.18)), even = i % 2 === 0, wk = even ? 'windA' : 'windB', sk = even ? 'strikeA' : 'strikeB', pk = i === 0 ? 'thrust' : (even ? 'strikeB' : 'strikeA');
      if (us <= 0) { S.fd.copy(d); S.pa = pk; S.pb = wk; S.pu = eio(uw); S.rate = 22; S.tLean = 0.05; S.tHeat = 0.8; if (dist > e.r + 2.3) { gp.addScaledVector(d, 6 * dt); clampArena(); } }
      else { S.pa = wk; S.pb = sk; S.pu = eio(us); S.rate = 34; S.tLean = 0.2; S.tLunge = 0.25; S.tHeat = 1; S.last = sk; }
      face(S.fd);
      if (us > 0 && S.hi < i) {   // saat bilah menyabet
        S.hi = i;
        if (dist < e.r + D.reach) {
          if (!S.cmb) knHurt(D.chainDmg, gp, 5);
          else if (i === S.n - 1) { if (P.trap > 0) P.inv = 0; knHurt(p2 ? F.combo.finP2 : F.combo.fin, gp, F.combo.finKb); shake = Math.max(shake, 0.7); }   // tebasan pamungkas: pasti kena selama masih terjebak, pemain terlempar & kepompong pecah
          else iceHurt(p2 ? F.combo.chainDmgP2 : F.combo.chainDmg);   // tebasan kombo: tidak melempar pemain, jebakan tetap
        }
       
        knSlashFx(e, S.fd, even ? 0.75 : -0.75, 1.6); audio.sfx('slash', { vol: 0.8, rate: 1 + 0.08 * i }); shake = Math.max(shake, 0.25);
      }
    }
  } else if (e.atk === 'lcharge') {   // SKILL 3 - kumpulkan bayangan: tangan kiri terangkat, partikel hitam mengalir ke telapak tangan, bola membesar, garis bidik ungu = aba-aba
    const L = F.laser; S.t += dt;
    const cu = clamp01(S.t / L.charge), lockT = S.t >= L.charge - L.lock; if (!lockT) S.fd.copy(d); face(S.fd);
    const muz = _knHand.clone().addScaledVector(S.fd, 0.4), dir = knAim(S, muz, dt, lockT ? 0 : 6);
    S.pa = 'ready'; S.pb = 'laserCharge'; S.pu = eio(clamp01(S.t / 0.5)); S.rate = 10; S.tLean = -0.12 * S.pu; S.tHeat = cu;
    S.macc += dt * 75 * clamp01(S.t / 0.5); while (S.macc >= 1) { S.macc--; knMote(gp.x, gp.z); }
    if (!kOrb) knOrbMake(); if (!kGround) knGroundMake(); if (!kLaser) knLaserMake();
    const rr = 0.12 + 0.95 * eio(cu); kOrb.g.position.copy(_knHand).addScaledVector(S.fd, 0.15); kOrb.g.position.y += 0.1; kOrb.core.scale.setScalar(rr); kOrb.halo.scale.setScalar(rr * 4.5 * (1 + 0.1 * Math.sin(P.t * 30))); kOrb.ring.scale.setScalar(rr); kOrb.ring.lookAt(cam.position); kOrb.ring.rotateZ(P.t * 3);
    kGround.position.x = gp.x; kGround.position.z = gp.z; kGround.scale.setScalar(1.6 + 3.2 * eio(cu)); kGround.material.opacity = 0.65 * clamp01(S.t / 0.4);
    const L2 = kLaser, wp = clamp01((S.t - (L.charge - 0.9)) / 0.4);   // garis bidik tipis muncul 0,9 dtk sebelum menembak
    if (wp > 0) {
      const end = knBeamEnd(muz, dir), len = muz.distanceTo(end); L2.warn.position.copy(muz).addScaledVector(dir, len / 2); L2.warn.quaternion.setFromUnitVectors(UP, dir); L2.warn.scale.set(0.05, len, 0.05);
      L2.warn.material.opacity = (lockT ? 0.45 + 0.3 * Math.sin(S.t * 45) : 0.25) * wp;
    }
    if (Math.random() < 0.4) burst(_knHand.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3))), 0xa040ff, 1, 2);
    shake = Math.max(shake, 0.05 + 0.08 * cu);
    if (S.t >= L.charge) { e.atk = 'lfire'; S.t = 0; S.tick = 0; S.fireDur = p2 ? L.durP2 : L.dur; audio.sfx('breath', { maxDur: 2.4 }); audio.sfx('explosion', { vol: 0.5, rate: 0.7 }); knRing(gp.x, gp.z, 6, 0.4); }
  } else if (e.atk === 'lfire') {   // laser hitam menyapu mengejar pemain
    const L = F.laser, end0 = S.fireDur; S.t += dt; face(S.fd.set(d.x, 0, d.z));
    const L2 = kLaser; if (!L2) { e.atk = null; e.rec = 0.3; e.rk = 'laser'; } else {
      const muz = _knHand.clone().addScaledVector(d, 0.4), dir = knAim(S, muz, dt, p2 ? L.trkP2 : L.trk), end = knBeamEnd(muz, dir), len = muz.distanceTo(end);
      const fire = S.t < end0, fade = clamp01(Math.min(S.t / 0.12, 1)) * (1 - clamp01((S.t - end0) / 0.25)), flick = 0.88 + 0.12 * Math.sin(S.t * 70);
      S.pa = 'laserFire'; S.pb = 'laserFire'; S.pu = 1; S.rate = 16; S.tLean = 0.06; S.tHeat = 1;
      const place = (m, r) => { m.position.copy(muz).addScaledVector(dir, len / 2); m.quaternion.setFromUnitVectors(UP, dir); m.scale.set(r, len, r); };
      place(L2.halo, L.width * 1.55 * flick); place(L2.rim, L.width * 0.88 * flick); place(L2.core, L.width * 0.64); L2.warn.material.opacity = 0;
      L2.halo.material.opacity = 0.42 * fade; L2.rim.material.opacity = 0.65 * fade; L2.core.material.opacity = 0.98 * fade;
      L2.flare.position.copy(muz); L2.flare.material.opacity = fade; L2.flare.scale.setScalar(3.2 * flick);
      L2.hit.position.copy(end).setY(0.3); L2.hit.material.opacity = 0.8 * fade; L2.hit.scale.setScalar(5 * flick);
      if (kOrb) { kOrb.g.position.copy(muz); kOrb.core.scale.setScalar(1.05 * fade + 0.01); kOrb.halo.scale.setScalar(4.5 * flick); kOrb.ring.scale.setScalar(1.05); kOrb.ring.lookAt(cam.position); kOrb.ring.rotateZ(P.t * 5); }
      if (kGround) { kGround.position.x = gp.x; kGround.position.z = gp.z; kGround.material.opacity = 0.65 * fade; }
      if (fire) {
        shake = Math.max(shake, 0.14);
        if (Math.random() < 0.7) lineSparks(end.clone().setY(0.3), 2, 7, 1, [0xe8c8ff, 0x8a30ff]);
        if (Math.random() < 0.5) burst(muz.clone().addScaledVector(dir, rnd(1, len)).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5))), 0x0a0010, 1, 1.5);
        if ((S.tick -= dt) <= 0) { S.tick = L.tick; if (segDist(player.position.clone().setY(player.position.y + 0.9), muz, end) < L.width + PLAYER_R) knHurt(L.dmg, gp, 0); }
      }
      if (S.t >= end0 + 0.25) {
        e.atk = null; e.rec = L.rec; e.rk = 'laser'; S.c3 = L.cd * gm; e.cd = F.gap * gm;
        scene.remove(L2.g); L2.g.traverse(o => { if (o.material) o.material.dispose(); }); kLaser = null;
        if (kOrb) { scene.remove(kOrb.g); kOrb.g.traverse(o => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); }); kOrb = null; }
        if (kGround) { scene.remove(kGround); kGround.material.dispose(); kGround.geometry.dispose(); kGround = null; }
      }
    }
  } else if (e.rec > 0) {   // jeda menahan pose setelah menyerang
    e.rec -= dt; const key = e.rk === 'cleave' ? 'strikeA' : e.rk === 's1' ? 'strikeV' : e.rk === 'lchain' ? S.last : e.rk === 'laser' ? 'laserFire' : 'ready';
    S.pa = key; S.pb = key; S.pu = 1; S.rate = 9; S.tLean = e.rk === 'laser' ? 0.04 : 0.15; S.tHeat = 0.4;
  } else if (e.stun <= 0) {   // mengejar & memilih serangan
    const near = dist < e.r + F.cleave.trigger;
    const r1 = S.c1 <= 0 && e.cd <= 0 && dist > F.slash.minDist, r2 = S.c2 <= 0 && e.cd <= 0 && dist > F.lunge.minDist, r3 = S.c3 <= 0 && e.cd <= 0 && dist > F.laser.minDist;
    const r4 = S.c4 <= 0 && e.cd <= 0 && dist > F.shadow.minDist;
    const pick = []; if (r1) pick.push('s1'); if (r2) pick.push('s2'); if (r3) pick.push('s3'); if (r4) pick.push('s4');
    let go = null;
    if (pick.length && (!near || S.pnear)) go = r2 && dist > 9 ? 's2' : pick[(Math.random() * pick.length) | 0];   // jauh -> terjang diutamakan; dekat -> skill hanya kadang-kadang (S.pnear), selebihnya tebasan dasar
    if (S.f4 && e.cd <= 0 && dist > 2) { go = 's4'; S.f4 = false; }   // fase 2: setelah kombo langsung garis bayangan lagi
    if (go === 's4') { e.atk = 's4'; e.mt = 0; S.ls = 0; S.fd.copy(d); audio.sfx('roar', { vol: 0.5, rate: 0.7 }); S.pnear = Math.random() < 0.5; }
    else if (go === 's1') { e.atk = 's1'; S.k = 0; S.t = 0; S.rel = false; S.prev = 'ready'; S.fd.copy(d); audio.sfx('roar', { vol: 0.4, rate: 1.3 }); S.pnear = Math.random() < 0.5; }
    else if (go === 's2') {
      e.atk = 'ltele'; e.at = F.lunge.tele; S.dd.copy(d); S.dlen = Math.max(2, Math.min(F.lunge.maxLen, dist - e.r - F.lunge.stop)); audio.sfx('roar', { vol: 0.5, rate: 0.9 }); S.pnear = Math.random() < 0.5;
      kLane = new THREE.Mesh(LANE_GEO, glowMat(0xa020ff, 0.25)); kLane.scale.set(2.4, 1, S.dlen + 2); scene.add(kLane);
    } else if (go === 's3') { e.atk = 'lcharge'; S.t = 0; S.macc = 0; S.fd.copy(d); S.ad.copy(d); audio.sfx('roar', { vol: 0.4, rate: 0.8 }); S.pnear = Math.random() < 0.5; }
    else if (near && e.cd <= 0) { e.atk = 'cleave'; e.at = F.cleave.wind; S.fd.copy(d); S.pnear = Math.random() < 0.5; }
    else if (!near) { gp.addScaledVector(d, e.sp * dt); clampArena(); }
    else {   // dekat tapi masih menunggu jeda: melangkah menyamping pelan mengitari pemain
      if ((S.sideT -= dt) <= 0) { S.side = -S.side; S.sideT = rnd(1.5, 3); }
      gp.x += d.z * S.side * 1.4 * dt; gp.z -= d.x * S.side * 1.4 * dt; clampArena();
    }
  }
}

// ---------- Bos level 3 Dungeon Batu: Grumbolt, Raksasa Batu (cave_monster.glb) — menggantikan penyihir batu, khusus Dungeon Batu (dgTheme === 'batu') ----------
// Model voxel ala Minecraft (tanpa tulang; kepala, kedua lengan & kedua kaki = grup terpisah yang diputar lewat kode), menghadap +z, diskalakan ke CAVEBOSS.height, kaki di y = 0.
// Klip bawaan model ('Standing') tidak dipakai. Taruh cave_monster.glb di folder yang sama dengan seraphim.glb. Kalau gagal dimuat, bos kembali memakai model penyihir batu biasa (tanpa skil khusus di bawah).
// 4 skil + gigitan dasar (dipilih acak bergiliran; tiap skil punya jeda sendiri, fase 2 (HP < 50%) = jeda dikali p2gap & lebih banyak batu):
//   1. Panggil Golem      - bos mengangkat kedua tangan; lingkaran cokelat di lantai = tempat golem muncul; lalu golem batu naik dari dalam tanah (maks. CAVEBOSS.summon.max golem hidup sekaligus; semua hancur bila bos mati)
//   2. Batu dari Tanah    - bos menghantam tanah, lalu batu runcing menyembul dari lantai. Dua pola: HUJAN (yang pertama tepat di bawah pemain) & GELOMBANG (barisan batu lurus ke arah pemain; fase 2 = 3 barisan). Lompat / berguling / keluar lingkaran = aman
//   3. 5 Batu Besar       - bos meraung ke langit; 5 lingkaran merah muncul di sekitar pemain (yang pertama tepat di posisi pemain), lalu batu raksasa jatuh satu per satu dari atas
//   4. Terjang + Gigit    - bos membungkuk (jalur oranye di lantai = arah terjang, terkunci sebelum menerjang), menerjang lurus; kalau pemain masih dekat sesudahnya langsung menggigit. Gigitan juga dipakai sebagai serangan dasar jarak dekat
const CAVEBOSS = {
  file: 'cave_monster.glb', name: 'Grumbolt, Raksasa Batu',
  height: 5.4, face: 0, cz: 0.2,   // face = putaran-y tambahan (radian): model ini menghadap +z, jadi 0; ubah kalau tampak membelakangi pemain. cz = titik tengah badan (satuan model, sumbu z) yang dijadikan pusat bos
  hp: 700, sp: 3.0, r: 2.0, roar: 1.8,   // roar = lama raungan pembuka (detik)
  p2: 0.5, p2gap: 0.5, gap: 1.8, p2sp: 1.3,   // fase 2 (HP < 50%): jeda antar skil dikali p2gap (dulu 0.7, sekarang 0.5 = skil datang jauh lebih sering); p2sp = pengali kecepatan jalan bos; gap = jeda minimal antar skil besar (detik)
  summon:  { cd: 15, wind: 1.5, n: 2, nP2: 4, max: 6, rad: 1.5, rise: 1.1, spread: [4.5, 7.5], rec: 0.8 },   // n = golem sekali panggil; max = golem hidup maksimal; rise = lama golem naik dari tanah (tidak bisa menyerang selama itu)
  rocks:   { cd: 7.5, wind: 0.95, n: 7, nP2: 16, interval: 0.22, intervalP2: 0.13, linesP2: [-0.84, -0.42, 0, 0.42, 0.84], warn: 1.0, rad: 2.1, dmg: 18, kb: 9, rise: 0.12, life: 1.3, spread: 8, rec: 0.7, lineStep: 2.5 },   // warn = waktu menghindar setelah lingkaran muncul
  boulder: { cd: 11, wind: 1.4, n: 5, nP2: 9, intervalP2: 0.28, spreadP2: 9, interval: 0.45, warn: 1.15, fall: 0.45, rad: 3.1, dmg: 30, kb: 12, spread: 7, H: 24, scale: 1.8, stay: 0.9, rec: 1.0 },   // n = jumlah batu besar (5); warn = lama lingkaran sampai batu menghantam; fall = lama batu jatuh
  charge:  { cd: 8.5, minDist: 6, chainN: 2, teleChain: 0.38, tele: 0.95, lock: 0.3, speed: 22, over: 3, maxLen: 22, width: 3.2, dmg: 22, kb: 14, rec: 0.4 },   // lock = sisa aba-aba saat arah dikunci
  bite:    { biteN: 3, trigger: 2.7, reach: 3.3, wind: 0.5, windDash: 0.22, rec: 0.7, cd: 1.7, dmg: 26, kb: 18 },   // windDash = aba-aba gigitan yang menyambung langsung setelah terjang
};
let caveGltf = null;
new GLTFLoader().load(CAVEBOSS.file, g => { caveGltf = g; }, undefined, () => console.warn(CAVEBOSS.file + ' gagal dimuat — bos Dungeon Batu memakai model penyihir'));
const cRocks = [], cBoulders = [], cbMarks = new Set(); let cLane = null;
const CB_PARTS = { head: /^head/i, armR: /^right[_ ]?arm/i, armL: /^left[_ ]?arm/i, legR: /^right[_ ]?leg/i, legL: /^left[_ ]?leg/i };   // nama grup di model (spasi diganti _ oleh GLTFLoader)
const CB_CONE = new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0), CB_BOULDER = new THREE.IcosahedronGeometry(1, 0), _cE = new THREE.Euler(), _cQ = new THREE.Quaternion();
function buildCaveBoss() {   // klon model + grup anggota badan (diputar di cavePose)
  const root = SkeletonUtils.clone(caveGltf.scene); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), k = CAVEBOSS.height / Math.max(0.01, box.max.y - box.min.y);
  root.scale.multiplyScalar(k); root.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -CAVEBOSS.cz * k);
  const pivot = new THREE.Group(); pivot.rotation.y = CAVEBOSS.face; pivot.add(root);
  const lean = new THREE.Group(); lean.add(pivot);   // lean = membungkuk / condong / roboh (berputar di sekitar kaki)
  let mat = null;
  root.traverse(o => { if (o.isMesh) { if (!mat) mat = o.material.clone(); o.material = mat; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });   // satu bahan bersama: kilatan terkena pukulan (emissive) kena ke seluruh tubuh
  const bone = {}, rest = {};
  root.traverse(o => { for (const key in CB_PARTS) if (!bone[key] && CB_PARTS[key].test(o.name || '')) { bone[key] = o; rest[key] = o.quaternion.clone(); } });
  if (Object.keys(bone).length < 5) console.warn('[Grumbolt] anggota badan tidak lengkap:', Object.keys(bone).join(', '));
  return { lean, mat: mat || new THREE.MeshStandardMaterial(), bone, rest, cur: { head: 0, aL: 0, aR: 0, zL: 0.08, zR: -0.08, lL: 0, lR: 0, lean: 0, dy: 0 }, wp: 0, lp: null, pdir: new THREE.Vector3(0, 0, 1), dd: new THREE.Vector3(0, 0, 1) };
}
// --- Pose: sudut tiap anggota badan (rad; x negatif = lengan terangkat ke depan / kaki melangkah maju / kepala mendongak; lean positif = membungkuk ke depan) ---
function cbRot(o, q0, rx, rz = 0) { if (!o) return; o.quaternion.copy(_cQ.setFromEuler(_cE.set(rx, 0, rz))).multiply(q0); }
function cavePose(e, dt, dying) {
  const S = e.cb, c = S.cur, F = CAVEBOSS, gp = e.g.position, lp = S.lp || (S.lp = gp.clone());
  const speed = dt > 1e-4 ? Math.hypot(gp.x - lp.x, gp.z - lp.z) / dt : 0; lp.copy(gp);
  const at = e.atk, mt = e.mt || 0, t = P.t + e.ph; S.wp += (at === 'charge' ? 20 : speed * 2.0) * dt;
  const wk = at ? 0 : Math.min(1, speed / 3), sw = Math.sin(S.wp);
  const T = { head: Math.sin(t * 1.4) * 0.05, aL: Math.sin(t * 1.1) * 0.04 + sw * 0.45 * wk, aR: Math.sin(t * 1.1 + 1) * 0.04 - sw * 0.45 * wk, zL: 0.08, zR: -0.08, lL: -sw * 0.7 * wk, lR: sw * 0.7 * wk, lean: 0.06 * wk, dy: Math.abs(sw) * 0.12 * wk };
  let sh = 0;   // sh = getaran badan (aba-aba)
  const up = (a, h, l) => { T.aL = T.aR = a; T.head = h; T.lean = l; };   // kedua tangan diangkat / diturunkan bersama
  if (dying) { const p = clamp01((1 - slow.t / SLOW_TOTAL) / SLOW_DEATH); T.lean = 1.1 * eio(p); T.aL = T.aR = -0.4 * (1 - p); T.head = 0.6 * p; T.dy = -0.5 * p; }
  else if (at === 'roar') { up(-0.9, -0.75 + Math.sin(P.t * 40) * 0.05, -0.15); T.zL = 1.0; T.zR = -1.0; sh = 0.04; }
  else if (at === 'summon') { const p = clamp01(mt / F.summon.wind); up(-2.3 * eio(p), -0.5 * p, -0.1 * p); T.zL = 0.5; T.zR = -0.5; sh = 0.03 * p; }
  else if (at === 'rocks') { const C = F.rocks, p = clamp01(mt / C.wind); if (mt < C.wind) up(-2.8 * eio(p), -0.4 * p, -0.2 * p); else up(0.5, 0.5, 0.5); }   // angkat kedua tinju lalu hantam tanah
  else if (at === 'boulder') { const p = clamp01(mt / F.boulder.wind); up(-3.0 * eio(p), -0.8 * p, -0.25 * p); T.zL = 0.35; T.zR = -0.35; sh = 0.03 * p; }
  else if (at === 'ctele') { up(0.9, 0.35, 0.4); T.dy = -0.15; sh = 0.05; T.lL = -0.5; T.lR = 0.4; }   // membungkuk, lengan ke belakang, siap menerjang
  else if (at === 'charge') { const g = Math.sin(S.wp); up(1.1, 0.2, 0.55); T.lL = -g * 1.0; T.lR = g * 1.0; T.dy = Math.abs(g) * 0.15; }
  else if (at === 'bite') { const C = F.bite, p = clamp01(1 - e.at / (S.fast ? C.windDash : C.wind)); up(-0.3 * p, -0.85 * p, -0.2 * p); sh = 0.03; }   // kepala ditarik ke atas-belakang, lalu menyambar
  else if (e.rec > 0) {   // menahan pose akhir
    if (e.rk === 'bite') up(-0.5, 0.75, 0.5);
    else if (e.rk === 'rocks') up(0.3, 0.3, 0.35);
    else if (e.rk === 'boulder') up(-2.6, -0.6, -0.2);
    else if (e.rk === 'summon') up(0.3, 0.3, 0.3);
    else if (e.rk === 'charge') up(0.6, 0.2, 0.2);
  }
  const k = 1 - Math.exp(-dt * (at === 'bite' || e.rec > 0 ? 22 : 12));
  for (const key in T) c[key] += (T[key] - c[key]) * k;
  const B = S.bone, Q = S.rest;
  cbRot(B.head, Q.head, c.head); cbRot(B.armL, Q.armL, c.aL, c.zL); cbRot(B.armR, Q.armR, c.aR, c.zR); cbRot(B.legL, Q.legL, c.lL); cbRot(B.legR, Q.legR, c.lR);
  S.lean.rotation.x = c.lean; S.lean.position.set(sh ? (Math.random() - 0.5) * sh * 2 : 0, c.dy, 0);
}
// --- Penanda lantai (lingkaran + cakram yang membesar = hitung mundur) ---
function cbMark(x, z, rad, color = 0xffa03a) {
  const wr = new THREE.Mesh(WARN_RING, glowMat(color, 0.6)), wd = new THREE.Mesh(WARN_DISC, glowMat(color, 0.22));
  for (const m of [wr, wd]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); scene.add(m); } wr.scale.setScalar(rad); wd.scale.setScalar(0.01);
  const mk = { wr, wd, rad }; cbMarks.add(mk); return mk;
}
function cbMarkSet(mk, u, t) { mk.wr.material.opacity = 0.35 + 0.3 * Math.sin(t * (14 + 14 * u)); mk.wd.scale.setScalar(Math.max(0.01, mk.rad * u)); mk.wd.material.opacity = 0.18 + 0.2 * u; }
function cbMarkDel(mk) { scene.remove(mk.wr, mk.wd); mk.wr.material.dispose(); mk.wd.material.dispose(); cbMarks.delete(mk); }
function cbRing(x, z, max, dur, col = 0xe0b060) { const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(col)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); scene.add(m); pulses.push({ m, t: dur, dur, max }); }
function cbLaneSet(from, d, len, w, op) {
  if (!cLane) { cLane = new THREE.Mesh(LANE_GEO, glowMat(0xff7a30, 0.3)); scene.add(cLane); }
  cLane.scale.set(w, 1, len); cLane.position.set(from.x, 0.06, from.z).addScaledVector(d, len / 2); cLane.rotation.y = Math.atan2(d.x, d.z); cLane.material.opacity = op;
}
function cbLaneDel() { if (cLane) { scene.remove(cLane); cLane.material.dispose(); cLane = null; } }
const cbArena = (v, m) => { const hl = Math.hypot(v.x, v.z); if (hl > R - m) { v.x *= (R - m) / hl; v.z *= (R - m) / hl; } return v; };   // jaga titik tetap di dalam arena
// --- Skil 2: Batu dari Tanah (lingkaran peringatan -> batu runcing menyembul -> bertahan sebentar -> tenggelam) ---
function spawnCaveRock(x, z, delay, rad, warn) {   // delay = jeda sebelum lingkaran muncul; warn = lama peringatan sampai batu menyembul
  const g = new THREE.Group(); g.position.set(x, 0, z); g.visible = false;
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a6a55, roughness: 0.95, flatShading: true, transparent: true, opacity: 1 }), cones = [];
  const addC = (px, pz, h, wd, tx, tz) => { const m = new THREE.Mesh(CB_CONE, mat); m.position.set(px, 0, pz); m.scale.set(wd, 0.001, wd); m.rotation.set(tx, rnd(0, 6.28), tz); m.castShadow = true; g.add(m); cones.push({ m, h }); };
  addC(0, 0, rnd(3.6, 4.4), 1.1, 0, 0);
  const n = Math.max(5, Math.round(rad * 3));
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rnd(-0.3, 0.3), r = rad * rnd(0.35, 0.85), t = rnd(0.15, 0.4); addC(Math.cos(a) * r, Math.sin(a) * r, rnd(1.5, 3.0), rnd(0.4, 0.7), Math.sin(a) * t, -Math.cos(a) * t); }   // miring ke luar
  scene.add(g); cRocks.push({ g, mat, cones, x, z, rad, warn, t: -delay, mk: null, up: false });
}
function eruptCaveRock(s) {
  const C = CAVEBOSS.rocks; s.up = true; s.g.visible = true; if (s.mk) { cbMarkDel(s.mk); s.mk = null; }
  const pos = new THREE.Vector3(s.x, 0.4, s.z);
  burst(pos.clone().setY(1.2), 0x9a8a70, 16, 9); lineSparks(pos.clone().setY(0.5), 16, 8, 1.2, [0xffe0a0, 0xc08a3a]); cbRing(s.x, s.z, s.rad * 1.5, 0.4);
  shake = Math.max(shake, 0.3); audio.sfx('thud', { vol: 0.7, rate: rnd(0.7, 0.95) });
  hurtLyraArea(s.x, s.z, s.rad, C.dmg);
  if (Math.hypot(player.position.x - s.x, player.position.z - s.z) < s.rad && !(P.air && player.position.y > 1.0) && iceHurt(C.dmg)) {   // kena = terluka + terpental keluar (lompat tinggi / berguling = lolos)
    pushPlayer(_iv.set(player.position.x - s.x, 0, player.position.z - s.z), C.kb); burst(player.position.clone().setY(1.3), 0xc8b090, 12, 7);
  }
}
function removeCaveRock(s) { scene.remove(s.g); s.mat.dispose(); if (s.mk) cbMarkDel(s.mk); cRocks.splice(cRocks.indexOf(s), 1); }
function spawnRainRock(i) {   // pola HUJAN: yang pertama tepat di bawah pemain, sisanya menyebar di sekitarnya (tidak saling tumpang tindih)
  const C = CAVEBOSS.rocks, pts = cRocks.filter(s => !s.up);
  let x = player.position.x, z = player.position.z;
  if (i > 0) for (let tr = 0; tr < 10; tr++) {
    const a = rnd(0, 6.28), r = rnd(1.5, C.spread); x = player.position.x + Math.cos(a) * r; z = player.position.z + Math.sin(a) * r;
    const hl = Math.hypot(x, z); if (hl > R - 1.5) { x *= (R - 1.5) / hl; z *= (R - 1.5) / hl; }
    if (pts.every(p => Math.hypot(p.x - x, p.z - z) > C.rad * 1.3)) break;
  }
  spawnCaveRock(x, z, 0, C.rad, C.warn);
}
function rockLine(e, dir, ang) {   // pola GELOMBANG: barisan batu lurus dari bos; menyembul berurutan dari yang terdekat (menyamping = aman)
  const C = CAVEBOSS.rocks, v = new THREE.Vector3(dir.x, 0, dir.z).applyAxisAngle(UP, ang), gp = e.g.position;
  for (let k = 0; k < 10; k++) { const dd = e.r + 1.8 + k * C.lineStep, x = gp.x + v.x * dd, z = gp.z + v.z * dd; if (Math.hypot(x, z) > R - 1.2) break; spawnCaveRock(x, z, 0, C.rad, C.warn + k * 0.1); }
}
// --- Skil 3: 5 Batu Besar (lingkaran merah -> batu raksasa jatuh dari atas -> hancur berserakan -> tenggelam) ---
function spawnBoulder(i, p2 = false) {   // yang pertama tepat di posisi pemain saat ini, sisanya menyebar di sekitarnya
  const C = CAVEBOSS.boulder, pts = cBoulders.map(b => b), sprd = p2 ? C.spreadP2 : C.spread;
  let x = player.position.x, z = player.position.z;
  if (i > 0) for (let tr = 0; tr < 12; tr++) {
    const a = rnd(0, 6.28), r = rnd(2, sprd); x = player.position.x + Math.cos(a) * r; z = player.position.z + Math.sin(a) * r;
    const hl = Math.hypot(x, z); if (hl > R - 1.5) { x *= (R - 1.5) / hl; z *= (R - 1.5) / hl; }
    if (pts.every(p => Math.hypot(p.x - x, p.z - z) > C.rad * (p2 ? 0.95 : 1.2))) break;
  }
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x6a5c4a, roughness: 0.95, flatShading: true, emissive: 0x3a1a00, emissiveIntensity: 0.5, transparent: true, opacity: 1 });
  const main = new THREE.Mesh(CB_BOULDER, mat); main.scale.set(1, 0.9, 1.05); main.castShadow = true; g.add(main);
  for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(CB_BOULDER, mat), a = rnd(0, 6.28); m.position.set(Math.cos(a) * 0.7, rnd(-0.4, 0.5), Math.sin(a) * 0.7); m.scale.setScalar(rnd(0.35, 0.55)); m.rotation.set(rnd(0, 3), rnd(0, 3), 0); m.castShadow = true; g.add(m); }
  g.scale.setScalar(C.scale); g.visible = false; g.position.set(x, C.H, z); scene.add(g);
  cBoulders.push({ g, mat, x, z, t: -i * (p2 ? C.intervalP2 : C.interval), mk: null, hit: false, st: 0, sp: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)) });
}
function boulderImpact(b) {
  const C = CAVEBOSS.boulder, pos = new THREE.Vector3(b.x, 0.3, b.z); b.hit = true; if (b.mk) { cbMarkDel(b.mk); b.mk = null; }
  hurtLyraArea(b.x, b.z, C.rad, C.dmg);
  if (Math.hypot(player.position.x - b.x, player.position.z - b.z) < C.rad && iceHurt(C.dmg)) { pushPlayer(_iv.set(player.position.x - b.x, 0, player.position.z - b.z), C.kb); burst(player.position.clone().setY(1.3), 0xc8b090, 14, 8); }
  burst(pos.clone().setY(0.8), 0x9a8a70, 30, 10); burst(pos.clone().setY(1.2), 0xffd9a0, 14, 7); lineSparks(pos.clone().setY(0.4), 40, 11, 1.3, [0xffe0a0, 0xc08a3a]); cbRing(b.x, b.z, C.rad * 1.4, 0.55);
  shake = Math.max(shake, 1.0); audio.sfx('thud', { vol: 1, rate: 0.55 });
}
function removeBoulder(b) { scene.remove(b.g); b.mat.dispose(); if (b.mk) cbMarkDel(b.mk); cBoulders.splice(cBoulders.indexOf(b), 1); }
function killMinions() {   // golem panggilan bos hancur bersama bosnya
  for (const m of [...enemies]) if (m.minion) { burst(m.g.position.clone().setY(1.2), 0xc8b090, 22, 8); scene.remove(m.g); enemies.splice(enemies.indexOf(m), 1); }
}
function clearCaveBoss(minions = false) {   // bersihkan semua efek bos batu (bos mati / pemain kalah / keluar dungeon)
  for (const s of [...cRocks]) removeCaveRock(s);
  for (const b of [...cBoulders]) removeBoulder(b);
  for (const mk of [...cbMarks]) cbMarkDel(mk);
  cbLaneDel(); if (minions) killMinions();
}
function caveFxTick(dt) {   // batu yang menyembul, batu besar yang jatuh, golem yang naik dari tanah (AI bos mengurus sisanya)
  const C = CAVEBOSS.rocks, B = CAVEBOSS.boulder;
  for (const s of [...cRocks]) {
    s.t += dt; if (s.t < 0) continue;
    if (!s.up) {
      if (!s.mk) s.mk = cbMark(s.x, s.z, s.rad);
      cbMarkSet(s.mk, clamp01(s.t / s.warn), s.t); if (s.t >= s.warn) eruptCaveRock(s);
    } else {
      const k = s.t - s.warn, rise = 1 - Math.pow(1 - clamp01(k / C.rise), 3), sink = clamp01((C.life - k) / 0.5);
      for (const c of s.cones) c.m.scale.y = Math.max(0.001, c.h * rise * sink);
      s.mat.opacity = 0.3 + 0.7 * sink; if (k >= C.life) removeCaveRock(s);
    }
  }
  for (const b of [...cBoulders]) {
    b.t += dt; if (b.t < 0) continue;
    if (!b.hit) {
      if (!b.mk) b.mk = cbMark(b.x, b.z, B.rad, 0xff3020);
      cbMarkSet(b.mk, clamp01(b.t / B.warn), b.t);
      const u = clamp01((b.t - (B.warn - B.fall)) / B.fall);
      if (u > 0) { b.g.visible = true; b.g.position.set(b.x, B.H * (1 - u * u) + B.scale * 0.55 * u * u, b.z); b.g.rotation.x += b.sp.x * dt * 3; b.g.rotation.z += b.sp.z * dt * 3; }
      if (b.t >= B.warn) boulderImpact(b);
    } else {
      b.st += dt; const sink = clamp01((B.stay - b.st) / 0.5);
      b.g.position.y = B.scale * 0.55 - (1 - sink) * B.scale * 0.8; b.mat.opacity = 0.3 + 0.7 * sink; if (b.st >= B.stay) removeBoulder(b);
    }
  }
  for (const m of enemies) if (m.rise > 0) {   // golem panggilan: naik dari dalam tanah, tidak bisa bergerak / menyerang selama naik
    m.rise -= dt; m.cd = Math.max(m.cd, 0.3); const u = clamp01(1 - m.rise / CAVEBOSS.summon.rise);
    m.g.position.y = -2.4 * (1 - eio(u)); if (Math.random() < 0.5) burst(m.g.position.clone().setY(0.2), 0x9a8a70, 1, 3);
    if (m.rise <= 0) { m.rise = 0; m.g.position.y = 0; m.sp = m.sp0; }
  }
}
// --- AI utama Grumbolt: mengejar pemain, menggigit saat dekat, dan memilih skil besar bergiliran ---
function caveBossAI(e, d, dist, dt) {
  const F = CAVEBOSS, S = e.cb, gp = e.g.position; gp.y = 0;
  S.scd -= dt; S.rcd -= dt; S.bcd -= dt; S.ccd -= dt; S.gap -= dt; e.wind = 0;
  const p2 = e.hp < e.max * F.p2, gm = p2 ? F.p2gap : 1, face = v => { e.g.rotation.y = Math.atan2(v.x, v.z); };
  const minions = () => enemies.reduce((n, o) => n + (o.minion && !o.dying ? 1 : 0), 0);
  const finish = (key, cd, rec) => { e.atk = null; e.wind = 0; e.rec = rec; e.rk = key; if (key === 'summon') S.scd = cd * gm; else if (key === 'rocks') S.rcd = cd * gm; else if (key === 'boulder') S.bcd = cd * gm; S.gap = F.gap * gm + rnd(0, 0.5); e.cd = Math.max(e.cd, 0.6); };
  const startBite = (fast, dir) => { e.atk = 'bite'; S.fast = fast; e.at = fast ? F.bite.windDash : F.bite.wind; S.pdir.copy(dir); };
  if (p2 && !S.p2 && !e.atk) {   // masuk fase 2: meraung lagi, makin ganas
    S.p2 = true; e.atk = 'roar'; e.at = 1.2; e.rec = 0; audio.sfx('roar'); shake = Math.max(shake, 0.8); burst(gp.clone().setY(2), 0xc8b090, 40, 10); cbRing(gp.x, gp.z, 9, 0.8); S.scd = Math.min(S.scd, 3); S.rcd = Math.min(S.rcd, 2); S.bcd = Math.min(S.bcd, 4); S.ccd = Math.min(S.ccd, 3); e.sp = F.sp * F.p2sp;   // mengamuk: jalan lebih cepat, skil pertama datang cepat
  }
  if (e.atk === 'roar') {
    e.at -= dt; if (Math.random() < 0.5) burst(gp.clone().setY(rnd(1, 4)), 0xc8b090, 2, 6); if (e.at <= 0) e.atk = null;
  } else if (e.atk === 'bite') {   // gigit: aba-aba (arah dikunci di akhir, bisa dihindari ke samping / berguling), maju sedikit lalu menyambar
    const C = F.bite; e.at -= dt; e.wind = 0.01; if (e.at > (S.fast ? 0.08 : 0.15)) S.pdir.copy(d); face(S.pdir);
    if (e.at <= 0) {
      e.atk = null; e.wind = 0; gp.addScaledVector(S.pdir, 1.1); cbArena(gp, 2);
      const fp = gp.clone().addScaledVector(S.pdir, e.r + 1.2);
      if (Math.hypot(player.position.x - fp.x, player.position.z - fp.z) < C.reach && iceHurt(C.dmg)) { pushPlayer(S.pdir, C.kb); burst(player.position.clone().setY(1.3), 0xff4030, 16, 8); }
      const hp = fp.clone().setY(2.6); burst(hp, 0xffe0b0, 18, 8); lineSparks(hp, 20, 8, 0.8, [0xffe0a0, 0xc08a3a]); cbRing(fp.x, fp.z, 3.2, 0.35);
      shake = Math.max(shake, 0.5); audio.sfx('thud', { vol: 1, rate: 0.6 });
      if (p2 && (S.chained | 0) < C.biteN - 1) { S.chained = (S.chained | 0) + 1; S.fast = true; e.atk = 'bite'; e.at = C.windDash; S.pdir.copy(d); }   // fase 2: gigit 3 kali beruntun (chained = hitungan gigitan lanjutan)
      else { S.chained = false; S.fast = false; e.rec = C.rec; e.rk = 'bite'; e.cd = C.cd * gm; }
    }
  } else if (e.atk === 'summon') {   // panggil golem: lingkaran cokelat -> hentakan -> golem naik dari tanah
    const C = F.summon; e.mt += dt; e.wind = 0.01; face(d);
    for (const p of S.pts) cbMarkSet(p.mk, clamp01(e.mt / C.wind), e.mt);
    if (e.mt >= C.wind) {
      const n = Math.min(S.pts.length, C.max - minions());
      for (let i = 0; i < S.pts.length; i++) {
        const p = S.pts[i]; cbMarkDel(p.mk); cbRing(p.x, p.z, C.rad * 2, 0.5); burst(new THREE.Vector3(p.x, 0.4, p.z), 0x9a8a70, 20, 8);
        if (i >= n) continue;
        const m = mkEnemy(false, i % 3 === 2 ? 1 : 0); m.g.position.set(p.x, -2.4, p.z); m.minion = true; m.rise = C.rise; m.sp0 = m.sp; m.sp = 0; m.cd = C.rise + 0.4;
      }
      S.pts = []; shake = Math.max(shake, 0.7); audio.sfx('thud', { vol: 1, rate: 0.5 }); burst(gp.clone().setY(0.4), 0xc8b090, 24, 9); cbRing(gp.x, gp.z, 7, 0.5);
      finish('summon', C.cd, C.rec);
    }
  } else if (e.atk === 'rocks') {   // batu dari tanah: angkat tinju -> hantam tanah -> batu menyembul (pola hujan / gelombang)
    const C = F.rocks, n = p2 ? C.nP2 : C.n, iv = p2 ? C.intervalP2 : C.interval; e.mt += dt; e.wind = e.mt < C.wind ? 0.01 : 0;
    if (e.mt < C.wind) { S.pdir.copy(d); face(S.pdir); }
    if (!S.slam && e.mt >= C.wind) {
      S.slam = true; burst(gp.clone().setY(0.4), 0xc8b090, 24, 9); cbRing(gp.x, gp.z, 7.5, 0.5); shake = Math.max(shake, 0.6); audio.sfx('thud', { vol: 1, rate: 0.5 });
      if (S.qk !== 'rain') for (const a of p2 ? C.linesP2 : [0]) rockLine(e, S.pdir, a);   // fase 2: 5 barisan batu menyebar (kipas) + hujan batu sekaligus
    }
    if (S.qk !== 'line') while (S.ms < n && e.mt >= C.wind + S.ms * iv) { spawnRainRock(S.ms); S.ms++; }
    if (e.mt >= (S.qk === 'line' ? C.wind + 0.55 : C.wind + (n - 1) * iv + 0.45)) finish('rocks', C.cd, C.rec);
  } else if (e.atk === 'boulder') {   // 5 batu besar: meraung ke langit -> lingkaran merah muncul -> batu jatuh satu per satu
    const C = F.boulder; e.mt += dt; e.wind = e.mt < C.wind ? 0.01 : 0; if (e.mt < C.wind) face(d);
    if (!S.bs && e.mt >= C.wind) { S.bs = true; for (let i = 0, nb = p2 ? C.nP2 : C.n; i < nb; i++) spawnBoulder(i, p2); audio.sfx('roar', { vol: 0.7, rate: 0.8 }); burst(gp.clone().setY(5), 0xc8b090, 24, 8); shake = Math.max(shake, 0.5); }
    if (S.bs && e.mt >= C.wind + 0.6) finish('boulder', C.cd, C.rec);
  } else if (e.atk === 'ctele') {   // aba-aba terjang: jalur mengikuti pemain, lalu terkunci (jalur berkedip) sebelum menerjang
    const D = F.charge; e.at -= dt; e.wind = 0.01;
    if (e.at > D.lock) { S.dd.copy(d); S.dlen = Math.min(D.maxLen, dist + D.over); }
    face(S.dd); cbLaneSet(gp, S.dd, S.dlen, D.width, 0.22 + 0.2 * Math.sin(P.t * 28));
    if (e.at <= 0) { e.atk = 'charge'; S.dleft = S.dlen; S.dhit = false; S.dpuff = 0; audio.sfx('roar', { vol: 0.6, rate: 1.3 }); }
  } else if (e.atk === 'charge') {   // menerjang lurus sepanjang jalur; kena pemain = terluka + terdorong ke samping, lalu langsung menggigit
    const D = F.charge, step = Math.min(S.dleft, D.speed * dt); gp.addScaledVector(S.dd, step); S.dleft -= step; face(S.dd); cbArena(gp, 2);
    if (!S.dhit && dist < e.r + 1.0) {
      const pp = player.position.clone().sub(gp).setY(0), sg = (pp.x * -S.dd.z + pp.z * S.dd.x) >= 0 ? 1 : -1;
      if (iceHurt(D.dmg)) { S.dhit = true; S.dleft = Math.min(S.dleft, 0.01); shake = Math.max(shake, 0.6); pushPlayer(_iv.set(-S.dd.z * sg, 0, S.dd.x * sg), D.kb); burst(player.position.clone().setY(1.3), 0xc8b090, 14, 8); }
    }
    S.dpuff -= dt; if (S.dpuff <= 0) { S.dpuff = 0.05; burst(gp.clone().setY(0.4), 0x9a8a70, 3, 4); burst(gp.clone().setY(1.2), 0xc8b090, 2, 3); }
    if (S.dleft <= 0.01 || Math.hypot(gp.x, gp.z) >= R - 2.01) {
      e.atk = null; S.ccd = D.cd * gm; S.gap = F.gap * gm; shake = Math.max(shake, 0.4); cbLaneDel(); burst(gp.clone().setY(0.5), 0x9a8a70, 16, 7);
      const dx = player.position.x - gp.x, dz = player.position.z - gp.z, dd = Math.hypot(dx, dz);
      if (S.cn > 0) { S.cn--; e.atk = 'ctele'; e.at = D.teleChain; S.dd.copy(d); S.dlen = Math.min(D.maxLen, dist + D.over); e.rec = 0; }   // terjang lanjutan: berbalik singkat lalu menerjang lagi ke arah pemain
      else if (dd < e.r + F.bite.reach + 1.0) { _iv.set(dd > 1e-3 ? dx / dd : S.dd.x, 0, dd > 1e-3 ? dz / dd : S.dd.z); S.chained = false; startBite(true, _iv); }   // pemain masih dekat: LANGSUNG menggigit (aba-aba sangat singkat)
      else { e.rec = D.rec; e.rk = 'charge'; e.cd = 0.2; }
    }
  } else if (e.rec > 0) {   // jeda menahan pose setelah menyerang
    e.rec -= dt;
  } else if (e.stun <= 0) {   // mengejar & memilih serangan
    const near = dist < e.r + F.bite.trigger, opts = [];
    if (S.gap <= 0) {
      if (S.scd <= 0 && minions() < F.summon.max) opts.push('summon');
      if (S.rcd <= 0) opts.push('rocks');
      if (S.bcd <= 0) opts.push('boulder');
      if (S.ccd <= 0 && dist > F.charge.minDist) opts.push('charge');
    }
    if (opts.length) {
      const pick = opts[(Math.random() * opts.length) | 0]; e.mt = 0; S.pdir.copy(d);
      if (pick === 'summon') {
        const C = F.summon, n = p2 ? C.nP2 : C.n, a0 = rnd(0, 6.28); e.atk = 'summon'; S.pts = [];
        for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2 + rnd(-0.3, 0.3), r = rnd(C.spread[0], C.spread[1]), v = cbArena(new THREE.Vector3(gp.x + Math.cos(a) * r, 0, gp.z + Math.sin(a) * r), 2.5); S.pts.push({ x: v.x, z: v.z, mk: cbMark(v.x, v.z, C.rad, 0xd0a050) }); }
        audio.sfx('roar', { vol: 0.6, rate: 0.7 });
      } else if (pick === 'rocks') { e.atk = 'rocks'; S.ms = 0; S.slam = false; S.qk = p2 ? 'both' : Math.random() < 0.5 ? 'rain' : 'line'; audio.sfx('roar', { vol: 0.5, rate: 0.8 }); }
      else if (pick === 'boulder') { e.atk = 'boulder'; S.bs = false; audio.sfx('roar', { vol: 0.6, rate: 0.7 }); }
      else { e.atk = 'ctele'; e.at = F.charge.tele; S.dd.copy(d); S.dlen = Math.min(F.charge.maxLen, dist + F.charge.over); S.cn = p2 ? F.charge.chainN : 0; }   // fase 2: 3 terjang berturut-turut (cn = sisa terjang lanjutan)
    } else if (near && e.cd <= 0) { S.chained = false; startBite(false, d); }   // gigitan dasar jarak dekat
    else if (!near) { gp.addScaledVector(d, e.sp * dt); cbArena(gp, 2); }
  }
  cavePose(e, dt, false);
}
function mkEnemy(boss, variant = 0, at = null) {   // at = {x, z}: posisi awal tertentu (dungeon jelajah); null = di tepi arena   // variant (hanya Gua Kristal level 1-2): 0 = Pecahan Kristal (biru), 1 = Kristal Besar (ungu, lebih tangguh)
  const g = new THREE.Group(); let cry = null;
  const mat = new THREE.MeshStandardMaterial({ color: boss ? (dgTheme ? DG_THEMES[dgTheme].bossBody : 0x2a1040) : 0x7a1f2b, roughness: 0.55, emissive: 0x000000 });
  const glow = new THREE.MeshBasicMaterial({ color: boss ? (dgTheme ? DG_THEMES[dgTheme].bossGlow : 0xff3cf0) : 0xffe14a });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const mu = boss && kotaMode && !dgTheme && mutantGltf ? buildMutant() : null;   // (dungeon bertema: bos penyihir berwarna tema, bukan Mutan)   // Gua Kristal: bos level 3 = Mutan, bukan penyihir
  const se = boss && dgTheme === MAIN_DUNGEON.id && seraphGltf ? buildSeraph() : null;
  const ib = boss && dgTheme === 'es' && iceGltf ? buildIceBoss() : null;   // Dungeon Es: bos level 3 = Glacivor, Bigfoot es (lowpoly_bigfoot.glb; cadangan: penyihir es)
  const kn = boss && dgTheme === 'kegelapan' && knGltf ? buildKnight() : null;   // Dungeon Kegelapan: bos level 3 = Mordrak, Ksatria Kegelapan (monster_ribal_-_i20562.glb; cadangan: penyihir kegelapan)
  const fb = boss && dgTheme === 'api' && fireGltf ? buildFireBoss() : null;   // Dungeon Api: bos level 3 = Ignarok, Raja Api (fire_monster.glb; cadangan: penyihir api)   // Dungeon Cahaya (portal tengah): bos level 3 = Seraphim (seraphim.glb; cadangan: penyihir emas)
  const cb = boss && dgTheme === 'batu' && caveGltf ? buildCaveBoss() : null;   // Dungeon Batu: bos level 3 = Grumbolt, Raksasa Batu (cave_monster.glb; cadangan: penyihir batu)
  if (mu) g.add(mu.pivot);
  else if (se) { g.add(se.pivot); const lt = new THREE.PointLight(0xffe27a, 10, 16, 2); lt.position.set(0, SERAPH.hover + SERAPH.height * 0.5, 0); g.add(lt); }
  else if (fb) { g.add(fb.lean, fb.halo); const lt = new THREE.PointLight(0xff6a20, 14, 18, 2); lt.position.set(0, FIREBOSS.height * 0.55, 1.2); g.add(lt); fb.light = lt; }
  else if (kn) { g.add(kn.lean); const lt = new THREE.PointLight(0xb070ff, 16, 20, 2); lt.position.set(0, KNIGHT.height * 0.55, 1.2); g.add(lt); kn.light = lt; const rim = new THREE.PointLight(0x8a50ff, 10, 16, 2); rim.position.set(0, KNIGHT.height * 0.8, -1.8); g.add(rim); }   // lampu depan + lampu rim di belakang kepala = tepi tubuh bersinar ungu
  else if (ib) { g.add(ib.lean); const lt = new THREE.PointLight(0x7fdcff, 12, 18, 2); lt.position.set(0, ICEBOSS.height * 0.55, 1.2); g.add(lt); ib.light = lt; }
  else if (cb) { g.add(cb.lean); const lt = new THREE.PointLight(0xffa030, 12, 18, 2); lt.position.set(0, CAVEBOSS.height * 0.55, 1.5); g.add(lt); cb.light = lt; }
  else if (boss) {
    add(new THREE.ConeGeometry(1.0, 2.7, 16), mat, 0, 1.35, 0);
    add(new THREE.SphereGeometry(0.42, 16, 16), new THREE.MeshStandardMaterial({ color: 0xcfc0d8, roughness: 0.4 }), 0, 2.95, 0);
    add(new THREE.SphereGeometry(0.08, 8, 8), glow, -0.15, 3.0, 0.36); add(new THREE.SphereGeometry(0.08, 8, 8), glow, 0.15, 3.0, 0.36);
    add(new THREE.ConeGeometry(0.13, 0.7, 6), mat, -0.3, 3.45, 0); add(new THREE.ConeGeometry(0.13, 0.7, 6), mat, 0.3, 3.45, 0);
    add(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }), 0.9, 1.6, 0.5);
    add(new THREE.IcosahedronGeometry(0.24, 1), glow, 0.9, 3.3, 0.5);
    const lt = new THREE.PointLight(dgTheme ? DG_THEMES[dgTheme].bossGlow : 0xc030e0, 15, 10, 2); lt.position.set(0.9, 3.3, 0.5); g.add(lt); // (position bersifat read-only di three.js, jadi tidak boleh lewat Object.assign)
  } else if (dgTheme) {   // dungeon bertema (cahaya / kegelapan / api / es / batu) level 1-2: monster sesuai tema
    const TH = DG_THEMES[dgTheme], big = variant === 1;   // variant 1 = versi besar & lebih tangguh
    mat.color.setHex(TH.body); mat.roughness = 0.4; mat.flatShading = true; glow.color.setHex(TH.glow);
    const fxM = new THREE.MeshBasicMaterial({ color: TH.fx });
    const bodyG = new THREE.Group(); bodyG.scale.setScalar(big ? 1.3 : 1); g.add(bodyG);   // ukuran lewat grup ini (g.scale sering di-reset ke 1 oleh efek pukulan)
    const ad = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; bodyG.add(o); return o; };
    const spin = new THREE.Group(); bodyG.add(spin); let floats = true;   // spin = benda yang mengorbit (hanya untuk monster melayang)
    const eyes = (y, z, dx) => { ad(new THREE.SphereGeometry(0.09, 8, 8), glow, -dx, y, z); ad(new THREE.SphereGeometry(0.09, 8, 8), glow, dx, y, z); };
    if (TH.shape === 'orb') {   // cahaya: bola cahaya dengan cincin halo + 4 titik cahaya mengorbit
      ad(new THREE.IcosahedronGeometry(0.65, 1), mat, 0, 1.1, 0); eyes(1.2, 0.55, 0.22);
      ad(new THREE.TorusGeometry(0.55, 0.07, 8, 20), fxM, 0, 2.0, 0).rotation.x = Math.PI / 2;
      spin.position.y = 1.1; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2, c = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), fxM); c.position.set(Math.cos(a), 0, Math.sin(a)); spin.add(c); }
    } else if (TH.shape === 'wraith') {   // kegelapan: hantu berjubah dengan mata merah + 3 api ungu mengorbit
      ad(new THREE.ConeGeometry(0.75, 1.9, 8), mat, 0, 1.0, 0); ad(new THREE.SphereGeometry(0.4, 12, 12), mat, 0, 2.1, 0); eyes(2.15, 0.34, 0.15);
      ad(new THREE.ConeGeometry(0.1, 0.5, 5), mat, -0.25, 2.55, 0); ad(new THREE.ConeGeometry(0.1, 0.5, 5), mat, 0.25, 2.55, 0);
      spin.position.y = 1.0; for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), fxM); c.position.set(Math.cos(a) * 1.0, 0.2, Math.sin(a) * 1.0); spin.add(c); }
    } else if (TH.shape === 'flame') {   // api: makhluk lava berjalan dengan nyala di kepala
      floats = false; ad(new THREE.IcosahedronGeometry(0.75, 1), mat, 0, 0.95, 0).scale.set(1, 1.2, 1); eyes(1.35, 0.62, 0.25);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ad(new THREE.ConeGeometry(0.2, 0.9 + (i % 2) * 0.3, 5), fxM, Math.cos(a) * 0.35, 2.05, Math.sin(a) * 0.35); }
      ad(new THREE.ConeGeometry(0.1, 0.55, 6), mat, -0.8, 0.9, 0.3).rotation.z = 1.2; ad(new THREE.ConeGeometry(0.1, 0.55, 6), mat, 0.8, 0.9, 0.3).rotation.z = -1.2;
    } else if (TH.shape === 'shard') {   // es: kristal es melayang + 6 pecahan es mengorbit
      ad(new THREE.IcosahedronGeometry(0.6, 0), mat, 0, 1.0, 0).scale.set(1, 1.4, 1); eyes(1.15, 0.5, 0.2);
      spin.position.y = 1.0; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 5), mat); c.position.set(Math.cos(a) * 1.0, Math.sin(i * 2.1) * 0.35, Math.sin(a) * 1.0); c.rotation.z = Math.PI / 2; c.rotation.y = -a; c.castShadow = true; spin.add(c); }
    } else {   // batu: golem batu kecil (berjalan, lambat tapi tangguh)
      floats = false; ad(new THREE.BoxGeometry(1.2, 1.1, 0.85), mat, 0, 1.1, 0); ad(new THREE.BoxGeometry(0.62, 0.5, 0.6), mat, 0, 1.95, 0.05); eyes(1.97, 0.36, 0.17);
      for (const sx of [-1, 1]) { ad(new THREE.BoxGeometry(0.4, 1.0, 0.4), mat, sx * 0.82, 1.05, 0); ad(new THREE.BoxGeometry(0.45, 0.7, 0.5), mat, sx * 0.3, 0.35, 0); ad(new THREE.IcosahedronGeometry(0.35, 0), mat, sx * 0.8, 1.7, 0); }
    }
    cry = { crystal: floats, spin, base: TH.emi, fx: TH.fx, dmg: Math.round(TH.dmg * (big ? 1.4 : 1)), hp: Math.round(TH.hp * (big ? 1.6 : 1)), max: Math.round(TH.hp * (big ? 1.6 : 1)), r: TH.r * (big ? 1.25 : 1), sp: TH.sp * (big ? 0.85 : 1) };
  } else if (kotaMode) {   // Gua Kristal level 1-2: monster kristal melayang (inti permata + pecahan yang berputar), menggantikan iblis merah
    const big = variant === 1;
    mat.color.setHex(big ? 0xb070ff : 0x5fd8ff); mat.roughness = 0.25; mat.metalness = 0.2; mat.flatShading = true;
    glow.color.setHex(0xffffff);
    const bodyG = new THREE.Group(); bodyG.scale.setScalar(big ? 1.3 : 1); g.add(bodyG);   // ukuran lewat grup ini (g.scale sering di-reset ke 1 oleh efek pukulan)
    const ad = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; bodyG.add(o); return o; };
    ad(new THREE.IcosahedronGeometry(0.7, 0), mat, 0, 1.0, 0).scale.set(1, 1.3, 1);   // inti permata
    ad(new THREE.SphereGeometry(0.09, 8, 8), glow, -0.22, 1.2, 0.6); ad(new THREE.SphereGeometry(0.09, 8, 8), glow, 0.22, 1.2, 0.6);   // mata
    for (const sx of [-0.3, 0, 0.3]) ad(new THREE.ConeGeometry(0.17, 0.75 + (sx === 0 ? 0.3 : 0), 5), mat, sx, 2.05 + (sx === 0 ? 0.1 : 0), 0);   // kristal di kepala
    const spin = new THREE.Group(); spin.position.y = 1.0; bodyG.add(spin);   // pecahan kristal yang mengorbit (diputar di updateEnemies)
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 5), mat); c.position.set(Math.cos(a) * 1.0, Math.sin(i * 2.1) * 0.35, Math.sin(a) * 1.0); c.rotation.z = Math.PI / 2; c.rotation.y = -a; c.castShadow = true; spin.add(c); }
    cry = { crystal: true, base: big ? 0x2a0a60 : 0x0a4a6a, spin, dmg: big ? 14 : 10, hp: big ? 80 : 50, max: big ? 80 : 50, r: big ? 1.15 : 0.9, sp: big ? 2.8 : 3.4 };
  } else {
    add(new THREE.IcosahedronGeometry(0.75, 1), mat, 0, 0.95, 0).scale.set(1, 1.2, 1);
    add(new THREE.SphereGeometry(0.09, 8, 8), glow, -0.25, 1.35, 0.62); add(new THREE.SphereGeometry(0.09, 8, 8), glow, 0.25, 1.35, 0.62);
    add(new THREE.ConeGeometry(0.12, 0.5, 6), mat, -0.4, 1.95, 0); add(new THREE.ConeGeometry(0.12, 0.5, 6), mat, 0.4, 1.95, 0);
    add(new THREE.ConeGeometry(0.1, 0.55, 6), mat, -0.8, 0.9, 0.3).rotation.z = 1.2; add(new THREE.ConeGeometry(0.1, 0.55, 6), mat, 0.8, 0.9, 0.3).rotation.z = -1.2;
  }
  const a = camMode === 'depan' ? rnd(-Math.PI * 0.9, -Math.PI * 0.1) : rnd(0, Math.PI * 2); // mode depan: musuh muncul di depan kamera
  if (at) g.position.set(at.x, 0, at.z); else g.position.set(Math.cos(a) * (R - 3), 0, Math.sin(a) * (R - 3));
  scene.add(g);
  const e = { g, mat: mu ? mu.mat : se ? se.mat : fb ? fb.mat : ib ? ib.mat : kn ? kn.mat : cb ? cb.mat : mat, mixer: mu ? mu.mixer : se ? se.mixer : null, rig: mu ? mu.rig : null, mutant: !!mu, boss, hp: boss ? 260 : 50, max: boss ? 260 : 50, sp: boss ? (mu ? 3.4 : 2.4) : 3.2, r: boss ? (mu ? 1.7 : 1.3) : 0.9, cd: 1, wind: 0, flash: 0, kv: new THREE.Vector3(), stun: 0, orb: 2.5, slam: 6, chg: 4, atk: null, at: 0, rec: 0, rk: '', side: -1, ph: rnd(0, 6.28) };
  if (cry) Object.assign(e, cry);
  if (se) Object.assign(e, { seraph: true, eye: se.eye, hp: SERAPH.hp, max: SERAPH.hp, sp: SERAPH.sp, r: SERAPH.r, lightImmune: true });   // Seraphim: kebal skill 3 & 6 (lihat hurtEnemy)
  if (dgTheme && boss) { e.fx = DG_THEMES[dgTheme].fx; e.base = DG_THEMES[dgTheme].bossBase; }   // bos dungeon bertema: warna ledakan & cahaya tubuh sesuai tema
  if (kn) {   // Mordrak: HP, kecepatan & ukuran sendiri; membuka pertarungan dengan raungan (tidak menyerang selama meraung)
    Object.assign(e, { knight: true, kn, hp: KNIGHT.hp, max: KNIGHT.hp, sp: KNIGHT.sp, r: KNIGHT.r, atk: 'roar', at: KNIGHT.roar, mt: 0, base: 0xc8a0ff });   // base = tint emissive ungu muda; dikalikan tekstur model (emissiveMap, lihat buildKnight) sehingga detail tubuh tetap terlihat, bukan ungu rata
    kn.roarT = KNIGHT.roar; kn.lp.copy(g.position); audio.sfx('roar');
  }
  if (fb) {   // Ignarok: HP, kecepatan & ukuran sendiri; membuka pertarungan dengan raungan (tidak menyerang selama meraung)
    Object.assign(e, { fireboss: true, fb, hp: FIREBOSS.hp, max: FIREBOSS.hp, sp: FIREBOSS.sp, r: FIREBOSS.r, base: 0xffffff, atk: 'roar', at: FIREBOSS.roar, mt: 0 });   // base putih: warna emissive dikalikan tekstur api model
    Object.assign(fb, { p2: false, roarT: FIREBOSS.roar, mcd: 4.5, dcd: 3, ms: 0, chained: false, dleft: 0, dlen: 0, dhit: false, dtrail: 0, dpuff: 0, pdir: new THREE.Vector3(0, 0, 1), dd: new THREE.Vector3(0, 0, 1) });
    fb.lp.copy(g.position); audio.sfx('roar');
  }
  if (ib) {   // Glacivor: HP, kecepatan & ukuran sendiri; membuka pertarungan dengan raungan (tidak menyerang selama meraung)
    Object.assign(e, { iceboss: true, ib, hp: ICEBOSS.hp, max: ICEBOSS.hp, sp: ICEBOSS.sp, r: ICEBOSS.r, atk: 'roar', at: ICEBOSS.roar, mt: 0 });   // base tetap warna dasar tema es (kebiruan tipis)
    Object.assign(ib, { p2: false, roarT: ICEBOSS.roar, qcd: 3.5, bcd: 5.5, dcd: 2.5, ms: 0, qk: 'rain', slam: false, punished: false, chained: false, fast: false, pw: ICEBOSS.punch.wind, dleft: 0, dlen: 0, dhit: false, dpuff: 0, bd: new THREE.Vector3(0, 0, 1), pdir: new THREE.Vector3(0, 0, 1), dd: new THREE.Vector3(0, 0, 1) });
    ib.lp.copy(g.position); audio.sfx('roar');
  }
  if (cb) {   // Grumbolt: HP, kecepatan & ukuran sendiri; membuka pertarungan dengan raungan (tidak menyerang selama meraung)
    Object.assign(e, { caveboss: true, cb, hp: CAVEBOSS.hp, max: CAVEBOSS.hp, sp: CAVEBOSS.sp, r: CAVEBOSS.r, atk: 'roar', at: CAVEBOSS.roar, mt: 0 });
    Object.assign(cb, { p2: false, scd: 7, rcd: 3.5, bcd: 9, ccd: 5.5, gap: 2.5, ms: 0, qk: 'rain', slam: false, bs: false, fast: false, chained: false, pts: [], dlen: 0, dleft: 0, dhit: false, dpuff: 0 });
    audio.sfx('roar');
  }
  if (mu && mu.rig) { e.atk = 'roar'; e.at = MUTANT_ANIM.roarTime; }   // Mutan membuka pertarungan dengan raungan (tidak menyerang selama meraung)
  enemies.push(e); return e;
}

// ---------- Tingkat kesulitan bos: dinaikkan karena party punya Lyra (belati + clone) ----------
// hp = pengali HP semua bos (Mutan, Seraphim, bos api / es / gua, Mordrak, naga, golem; HP bar tetap proporsional) | dmg = pengali damage SEMUA serangan ke pemain
// selama ada bos hidup di arena (termasuk serangan area, laser & anak buahnya) | sp = pengali kecepatan gerak bos. Kaelen (duel 1 lawan 1, Lyra tidak ikut) tidak diubah.
// onlyWithLyra: true = bonus kesulitan hanya aktif saat Lyra sedang ikut di party (bos menyesuaikan jumlah party).
const BOSS_BUFF = { hp: 2, dmg: 1.35, sp: 1.1, onlyWithLyra: false };
const bossBuffOn = () => !BOSS_BUFF.onlyWithLyra || lyra.recruited;
const bossMul = () => bossBuffOn() && !kaelenOn() && enemies.some(e => e.boss && !e.minion && !e.dying && !e.kaelen) ? BOSS_BUFF.dmg : 1;
function buffBosses() {   // dipanggil tiap frame: bos yang baru muncul diperkuat sekali saja
  if (!bossBuffOn()) return;
  for (const e of enemies) if (e.boss && !e.minion && !e.kaelen && !e.buffed) { e.buffed = true; e.hp = Math.round(e.hp * BOSS_BUFF.hp); e.max = Math.round(e.max * BOSS_BUFF.hp); e.sp *= BOSS_BUFF.sp; }
}
function hurtPlayer(n) {
  if (AIMSW.on) { lyra.hurt(Math.round(n * bossMul())); return; }   // bos sedang membidik Lyra: Lyra yang terkena
  if (P.inv > 0 || (state !== 'play' && state !== 'world')) return; // di dungeon & di dunia luar (monster hutan)
  n = Math.round(n * bossMul());   // bos hidup = semua serangan lebih sakit
  lyra.onPlayerHurt(n);   // Lyra di dekat pemain ikut menerima sebagian damage
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
  e.dying = true; e.hp = 1; e.stun = 0; e.wind = 0; e.atk = null; e.kv.set(0, 0, 0); e.g.scale.setScalar(1);
  slow.t = SLOW_TOTAL; P.inv = 5; // pemain kebal selama adegan
  [...orbs, ...rings].forEach(o => scene.remove(o.m)); orbs.length = 0; rings.length = 0; stopLaser(); clearBlasts(); clearGPillars(); clearSeraph(); if (e.caveboss) killMinions(); // bersihkan serangan boss (golem panggilan Grumbolt ikut hancur)
  burst(e.g.position.clone().setY(1.3), 0xffffff, 30, 8); shake = 0.6;
}
function dyingTick(e) { // musuh bergetar & bersinar sebelum hancur
  const p = 1 - slow.t / SLOW_TOTAL;
  if (e.golem) { e.pose.at = null; e.pose.wk = 0; e.pose.die = p; poseGolem(e.rig, e.pose); }   // golem runtuh perlahan
  e.mat.emissive.setHex(Math.sin(p * 70) > 0 ? 0xffffff : 0x802010);
  e.g.scale.setScalar(1 + Math.sin(p * 110) * 0.05 * (1 + p));
  if (Math.random() < 0.3) burst(e.g.position.clone().setY(rnd(0.5, e.dragon ? 7 : e.golem ? 6 : 2.2)), 0xffd060, 4, 3);
  if (p >= SLOW_DEATH) { // hancur
    burst(e.g.position.clone().setY(e.dragon || e.golem ? 3 : 1), 0xffffff, 45, 10); burst(e.g.position.clone().setY(e.dragon || e.golem ? 4 : 1.5), e.golem ? 0xbfefff : e.dragon ? 0xff8a40 : 0xff60f0, 25, 7);
    lootOnDefeat(e); scene.remove(e.g); enemies.splice(enemies.indexOf(e), 1); shake = 0.9;
  }
}
// ---------- Kaelen (Kota Dungeon): duel memakai SISTEM game.js ----------
// kaelen-battle.js hanya mengurus AI / telegraf / fase Kaelen. Serangan dasar, 6 skill, Dark Mode, Shift = roll (kebal), HP (P.hp) & ramuan (H) milik game.js.
// Kaelen didaftarkan sebagai musuh di array `enemies` selama duel, jadi semua serangan & skill yang memeriksa `enemies` otomatis mengenainya.
let kaelenFoe = null;
const kaelenOn = () => !!kaelenFoe;
function kaelenSync() { const KB = globalThis.KAELEN_BATTLE; if (KB && kaelenFoe) { KB.enemy.getPosition(kaelenFoe.g.position); kaelenFoe.hp = KB.enemy.hp; } }
function kaelenHurt(n, force) {   // pukulan/skill pemain -> Kaelen. force >= 20 (tebasan besar / skill) = berat: lebih cepat membuatnya terhuyung
  const KB = globalThis.KAELEN_BATTLE; if (!KB) return false;
  KB.enemy.takeDamage(n, { heavy: force >= 20 || n >= 45 }); kaelenSync(); return false;
}
function kaelenGuard() {   // duel dibatalkan (Kaelen menyerah) kalau pemain keluar dari Kota Dungeon / masuk guild / masuk portal / kalah di tempat lain
  const KB = globalThis.KAELEN_BATTLE;
  if (KB && KB.isActive() && (state !== 'world' || !inKotaDungeon || inGuild || dgBusy)) KB.cancel();
}
globalThis.KAELEN_HOST = {
  dmgScale: 0.55,   // 1 = damage mentah Kaelen (HP pemain 100). Naikkan kalau terlalu mudah, turunkan kalau terlalu sakit
  getPlayer: () => ({ x: player.position.x, y: player.position.y, z: player.position.z, face: P.face }),
  mobile: () => document.body.classList.contains('touch'),
  inv: () => P.inv > 0,   // roll / habis kena / skill kebal
  swing: () => (P.atk > 0 && !P.cross) ? P.dur * 0.38 - (P.dur - P.atk) : null,   // detik sampai serangan dasar "mengenai" (negatif = sudah lewat); dipakai untuk menangkis tebasan Kaelen
  attacking: () => P.atk > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0 || P.pt > 0 || P.ex > 0,
  hurt(n, { dirX = 0, dirZ = 0, heavy = false } = {}) {   // serangan Kaelen -> hurtPlayer game.js (perisai BF ikut berlaku)
    if (state !== 'world') return 'skip';
    const lethal = !BF.on && P.hp - n <= 0;
    hurtPlayer(lethal ? Math.max(0, P.hp - 1) : n);   // duel: tidak mati sungguhan (tidak diseret ke layar kalah / dunia luar), cukup tumbang
    if (P.inv > 0) P.push.set(dirX * (heavy ? 7 : 3.5), 0, dirZ * (heavy ? 7 : 3.5));   // terpental (mekanisme push milik game.js)
    return lethal ? 'down' : 'hit';
  },
  heal: f => { P.hp = Math.min(P.max, P.hp + P.max * f); },
  onShake: k => { shake = Math.max(shake, 0.45 * k); },
  onStart(e) {
    kaelenFoe = { kaelen: true, g: new THREE.Object3D(), r: 0.7, hp: e.hp, maxHp: e.maxHp, kv: new THREE.Vector3(), stun: 0, wind: 0, flash: 0, dying: false, col: 0xffd45a };
    kaelenSync(); enemies.push(kaelenFoe);
  },
  onEnd({ result }) {
    if (kaelenFoe) { const i = enemies.indexOf(kaelenFoe); if (i >= 0) enemies.splice(i, 1); }
    kaelenFoe = null; P.push.set(0, 0, 0);
    if (result !== 'flee') P.hp = P.max;   // menang / tumbang: bangkit dengan HP penuh
  },
};
// ---------- Aggro: musuh menyerang siapa yang memberi damage (pemain atau Lyra) ----------
let hitSrc = '';   // asal pukulan yang sedang diproses: 'lyra' (dari lyra.bind.hit) atau kosong = pemain
function noteThreat(e, who, n) {   // who: 'p' = pemain, 'l' = Lyra
  const A = LYRA.aggro; if (!A || !A.enabled) return;
  const th = e.th || (e.th = { p: 0, l: 0 });
  th[who] += who === 'l' ? n * A.weight : n;
}
function enemyTargetsLyra(e, dt) {   // true = musuh ini sedang mengincar Lyra (bukan pemain). Bos (termasuk naga & golem) ikut bila LYRA.aggro.bosses; Kaelen (duel 1 lawan 1) tidak
  const A = LYRA.aggro, big = !!(e.boss || e.dragon || e.golem);
  if (!A || !A.enabled || (big && !A.bosses) || e.kaelen || !lyra.targetable) { e.agL = false; return false; }
  e.agLock = Math.max(0, (e.agLock || 0) - dt);
  const th = e.th, lp = lyra.pos, pp = player.position;
  let want;
  if (th && (th.p > 0 || th.l > 0)) {   // sudah pernah dipukul: incar yang paling banyak memberi damage (ancaman memudar seiring waktu)
    th.p = Math.max(0, th.p - A.decay * dt); th.l = Math.max(0, th.l - A.decay * dt);
    want = e.agL ? th.l * A.hyst >= th.p : th.l > th.p * A.hyst;
  } else {   // belum dipukul: deteksi — Lyra yang lebih dekat (dan dalam jarak deteksi) diincar lebih dulu
    const dl = Math.hypot(lp.x - e.g.position.x, lp.z - e.g.position.z), dp = Math.hypot(pp.x - e.g.position.x, pp.z - e.g.position.z);
    want = dl < (big ? A.bossDetect : A.detect) && (e.agL ? dl < dp * 1.2 : dl < dp * 0.85);
  }
  if (want !== !!e.agL) { if (big && e.agLock > 0) want = !!e.agL; else if (big) e.agLock = A.bossLock; }   // bos: tidak ganti sasaran terlalu sering
  return (e.agL = want);
}
// ---------- Skill bos & Lyra: area bahaya yang bisa dibaca Lyra (lalu dihindari) + damage ke Lyra saat mendarat ----------
const hurtLyraArea = (x, z, r, n) => lyra.hurtArea(x, z, r, Math.round(n * bossMul()));
function collectDangers() {   // daftar area bahaya aktif: { x, z, r, t } (t = sisa detik sebelum mendarat) atau jalur { seg: true, x, z, dx, dz, len, r, t }
  const Z = [], c = (x, z, r, t) => Z.push({ x, z, r, t: Math.max(0, t) });
  for (const r of rings) c(r.m.position.x, r.m.position.z, r.rad || 4.6, r.t);   // hantaman penyihir / naga / golem / Mutan
  for (const b of blasts) if (!b.boom) c(b.g.position.x, b.g.position.z, b.rad * BLAST_REACH, BLAST_GROW - b.t);
  for (const s of iSpikes) if (!s.up) c(s.x, s.z, s.rad, s.warn - s.t);   // es dari tanah (Glacivor)
  for (const s of krSpikes) if (!s.up) c(s.x, s.z, s.rad, s.warn - s.t);   // kristal (Mutan)
  for (const s of cRocks) if (!s.up) c(s.x, s.z, s.rad, s.warn - s.t);   // batu dari tanah (Grumbolt)
  for (const b of cBoulders) if (!b.hit) c(b.x, b.z, CAVEBOSS.boulder.rad, CAVEBOSS.boulder.warn - b.t);
  for (const m of fMeteors) c(m.end.x, m.end.z, m.rad, m.fall - m.t);   // meteor api (Ignarok)
  for (const m of sMeteors) c(m.end.x, m.end.z, SERAPH.meteor.rad, m.fall - m.t);   // meteor cahaya (Seraphim)
  for (const j of sJudge) if (!j.hit) c(j.x, j.z, SERAPH.judge.rad, SERAPH.judge.track + SERAPH.judge.lock + SERAPH.judge.fall - j.t);
  for (const p of gPillars) if (p.st === 0) c(p.x, p.z, PILLAR.rad + 0.3, PILLAR.warn - p.t);   // pilar golem
  for (const b of fBurns) c(b.x, b.z, b.rad * 0.95, 0);   // api yang tertinggal di lantai
  for (const s of kShadows) if (!s.up) Z.push({ seg: true, x: s.cx, z: s.cz, dx: Math.sin(s.ang), dz: Math.cos(s.ang), len: s.len, r: s.w / 2, t: Math.max(0, s.warn - s.t) });   // garis bayangan (Mordrak)
  for (const o of orbs) {   // proyektil bos (bola sihir, batu golem): jalur lurus ke depan selama ±1,5 detik
    const sp = Math.hypot(o.v.x, o.v.z); if (sp < 1e-3) continue;
    Z.push({ seg: true, x: o.m.position.x + o.v.x * 0.75, z: o.m.position.z + o.v.z * 0.75, dx: o.v.x / sp, dz: o.v.z / sp, len: sp * 1.5, r: 1.3, t: 0.3 });
  }
  return Z;
}
function lyraOrbHit(o) {   // proyektil bos mengenai Lyra (true = proyektil habis)
  if (!lyra.targetable) return false;
  const p = o.m.position, l = lyra.pos;
  return p.y > 0.2 && p.y < 2.4 && Math.hypot(p.x - l.x, p.z - l.z) < 0.9 && hurtLyraArea(l.x, l.z, 1, 12);
}
function hurtEnemy(e, n, dir, force = 0, src = '') { // dir: arah dorong (ternormalisasi), force: kecepatan awal knockback, src: asal serangan ('s3' / 's6' = skill cahaya). Mengembalikan true bila pukulan DITANGKIS (kebal)
  if (e.dying) return false; // sedang adegan slowmo
  n = Math.round(n * swordMul); if (e.kaelen) return kaelenHurt(n, force);   // pedang yang dipakai (tas item) menambah semua damage pemain
  if (e.lightImmune && (src === 's3' || src === 's6')) { immuneFx(e); return true; } // Seraphim kebal elemen cahaya: skill 3 (Summon Blade) & skill 6 (Excalibur)
  e.hp -= n; e.flash = 0.12; noteThreat(e, hitSrc === 'lyra' ? 'l' : 'p', n); if (e.wild || e.xroom != null) e.aggro = true; // monster hutan yang dipukul langsung marah
  if (dir && force) { e.kv.set(dir.x, 0, dir.z).multiplyScalar(force * (e.dragon || e.golem ? 0.1 : e.boss ? 0.3 : 1)); e.stun = e.dragon || e.golem ? 0 : e.boss ? 0.15 : 0.35; e.wind = 0; e.g.scale.setScalar(1); }
  burst(e.g.position.clone().setY(e.dragon || e.golem ? 3 : 1.3), e.wild ? e.col : e.fx ? e.fx : e.golem ? 0xbfefff : e.dragon ? 0xff8a40 : e.boss ? 0xff60f0 : e.crystal ? 0x9fe8ff : 0xffd060, 10);
  if (e.hp <= 0 && !e.wild && enemies.every(o => o === e || o.minion) && wave === WAVES.length - 1) { startKillCam(e); return; } // musuh terakhir: slowmo dulu
  if (e.hp <= 0) {
    burst(e.g.position.clone().setY(1), 0xffffff, 24, 7);
    if (e.mutant) { clearCrystalBoss(); clearIceBoss(); }   // Mutan mati: kristal lenyap & pemain bebas dari kristal
    if (e.caveboss) clearCaveBoss(true);   // Grumbolt mati tanpa adegan slowmo: batu & golem panggilan ikut lenyap
    if (e.knight) clearKnight();   // bos mati tanpa adegan slowmo (masih ada musuh lain): bersihkan efeknya
    if (e.wild) { burst(e.g.position.clone().setY(0.8), e.col, 22, 6); removeWild(e); return; }
    lootOnDefeat(e); scene.remove(e.g); enemies.splice(enemies.indexOf(e), 1);
  }
}

// Tabrakan pemain-monster: pemain tidak bisa menembus monster. Kalau tumpang tindih, pemain didorong keluar (jadi bisa menyamping di sekitar monster)
const PLAYER_R = 0.45; // "lebar badan" pemain
function collidePlayer() {
  for (const e of enemies) {
    if (P.pt === 2) continue;   // Dash Petir: menembus musuh tanpa terdorong
    if (e.mutant && e.g.position.y > 1.2) continue;   // Mutan sedang melompat di atas: tidak mendorong pemain
    const dx = player.position.x - e.g.position.x, dz = player.position.z - e.g.position.z, min = PLAYER_R + e.r, l = Math.hypot(dx, dz);
    if (l >= min) continue;
    const nx = l > 1e-4 ? dx / l : -Math.sin(P.face), nz = l > 1e-4 ? dz / l : -Math.cos(P.face); // arah dorong: dari pusat monster ke pemain
    player.position.x = e.g.position.x + nx * min; player.position.z = e.g.position.z + nz * min;
  }
  if (state === 'world' && inGuild && guild) { guild.collide(player.position, PLAYER_R); player.position.y = 0; return; }   // dalam Balai Petualang: dinding & perabot (kota-guild.js)
  if (state === 'world' && inInn) { // dalam Penginapan Karavan: dinding & perabot (kekaisaran-penginapan.js); pemain berdiri di lantai penginapan
    if (QT.phase === 9 && SLEEP.spot && SLEEP.stage !== 4) { player.position.y = SLEEP.spot.y; return; }   // sedang tidur di kasur: tidak didorong keluar, tinggi = permukaan kasur (fase 4 = sudah bangun di samping kasur, tabrakan normal; fase 5 = berbaring & ngobrol, tetap di kasur)
    world.inn.collide(player.position, PLAYER_R); player.position.y = world.inn.groundY(); return;
  }
  if (state === 'world' && inAula) { // dalam Aula Raja: dinding, tiang, perabot & tangga panggung (tinggi pemain mengikuti lantai)
    world.aula.collide(player.position, PLAYER_R);
    player.position.y = world.aula.groundY(player.position.x, player.position.z, player.position.y); return;
  }
  if (state === 'world' && inPalace) { // dalam istana: dinding, perabot & NPC per lantai; tinggi pemain mengikuti lantai / tangga / panggung singgasana
    world.palace.collide(player.position, PLAYER_R); world.clamp(player.position);
    player.position.y = world.palace.groundY(player.position.x, player.position.z, player.position.y); return;
  }
  if (state === 'world') { world.collide(player.position, PLAYER_R); world.clamp(player.position); if (!P.air) player.position.y = inKekaisaran ? world.kekGroundY(player.position.x, player.position.z) : 0; return; } // dunia luar: pohon & batas dunia (dataran + desa + Hutan Besar); di Kota Kekaisaran tinggi pemain mengikuti tangga istana
  if (exploreMode && dgX) {
    if (P.pt === 2) return;   // saat terjang Dash Petir tidak ditabrak dinding (lintasan lurus); titik mendarat sudah dijamin kosong (dgX.dashLen)
    dgX.collide(player.position, PLAYER_R);
    if (dgX.solidAt(player.position.x, player.position.z)) { player.position.x = xSafe.x; player.position.z = xSafe.z; P.v.set(0, 0, 0); P.push.set(0, 0, 0); P.kb.set(0, 0, 0); }   // pengaman: kalau sampai berada di dalam batu / luar dinding (mis. mendarat di tembok), kembali ke titik aman terakhir, bukan didorong keluar dungeon
    else { xSafe.x = player.position.x; xSafe.z = player.position.z; }
    return;
  }
  { const hl = Math.hypot(player.position.x, player.position.z); if (hl > R - 1.5) { player.position.x *= (R - 1.5) / hl; player.position.z *= (R - 1.5) / hl; } } // tetap di dalam arena (hanya bidang xz)
}
// ---------- Skill Mutan: KRISTAL DARI TANAH (menjebak) + LONCAT & PUKUL ----------
// 1. Mutan menghantam tanah -> lingkaran peringatan ungu muncul (yang pertama TEPAT di bawah pemain) -> kristal menyembul. Kena = terluka + TERJEBAK di dalam kristal (tidak bisa gerak / menyerang / berguling;
//    tekan tombol apa saja / sentuh layar untuk memecahkan kristal lebih cepat). Keluar dari lingkaran / berguling saat kristal menyembul = aman.
// 2. Begitu pemain terjebak, Mutan LANGSUNG meloncat ke arah pemain lalu memukulnya (kena = terluka besar + terpental, kristal pecah). Kalau pemain sudah dekat, langsung dipukul tanpa loncat.
const CRYSTAL = {
  cd: 9, wind: 0.9, n: 5, nP2: 14, interval: 0.3, intervalP2: 0.17, cage: 5, cageR: 3.6, cageRad: 1.5,   // fase 2: 14 titik kristal, muncul lebih rapat, + KURUNGAN 5 kristal melingkari pemain (ada celah; berguling = lolos)
  warn: 1.0, rad: 2.0, dmg: 14, trap: 2.8, spread: 7, rise: 0.14, life: 1.6, rec: 0.6, p2: 0.5,   // n / nP2 = jumlah titik kristal (fase 2 = HP < p2); warn = waktu menghindar; trap = lama terjebak (detik); cd = jeda skill
  pounce: { time: 0.7, crouch: 0.22, height: 3.6, wind: 0.22, dmg: 30, kb: 20, reach: 3.6, near: 3.2 },   // time = lama loncat total; wind = aba-aba pukulan setelah mendarat; kb = kekuatan terpental; near = jarak (di luar badan bos) di bawahnya bos tidak loncat, langsung memukul
};
const krSpikes = [];
const krMat = c => new THREE.MeshStandardMaterial({ color: c, emissive: c === 0xa8e4ff ? 0x2a6ab8 : 0x6a2ad8, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.94, flatShading: true });
function spawnCrystalSpike(x, z, delay, rad, warn) {   // delay = jeda sebelum lingkaran muncul; warn = lama peringatan sampai kristal menyembul
  const g = new THREE.Group(); g.position.set(x, 0, z); g.visible = false;
  const mats = [krMat(0xa8e4ff), krMat(0xc9a0ff)], cones = [];
  const addC = (px, pz, h, wd, tx, tz, mi) => { const m = new THREE.Mesh(ICE_CONE, mats[mi]); m.position.set(px, 0, pz); m.scale.set(wd, 0.001, wd); m.rotation.set(tx, rnd(0, 6.28), tz); m.castShadow = true; g.add(m); cones.push({ m, h }); };
  addC(0, 0, rnd(3.6, 4.4), 0.95, 0, 0, 1);
  const n = Math.max(5, Math.round(rad * 3.2));
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rnd(-0.3, 0.3), r = rad * rnd(0.35, 0.85), t = rnd(0.15, 0.4); addC(Math.cos(a) * r, Math.sin(a) * r, rnd(1.6, 3.2), rnd(0.35, 0.6), Math.sin(a) * t, -Math.cos(a) * t, i % 2); }   // miring ke luar
  scene.add(g);
  const wr = new THREE.Mesh(WARN_RING, glowMat(0xb070ff, 0.6)), wd = new THREE.Mesh(WARN_DISC, glowMat(0xb070ff, 0.22));
  for (const m of [wr, wd]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); m.visible = false; scene.add(m); } wr.scale.setScalar(rad); wd.scale.setScalar(0.01);
  krSpikes.push({ g, mats, cones, wr, wd, x, z, rad, warn, t: -delay, shown: false, up: false });
}
function eruptCrystalSpike(s) {
  const C = CRYSTAL; s.up = true; s.g.visible = true; s.wr.visible = s.wd.visible = false;
  const pos = new THREE.Vector3(s.x, 0.4, s.z);
  burst(pos.clone().setY(1.2), 0xe0c8ff, 16, 9); lineSparks(pos.clone().setY(0.5), 22, 9, 1.3, [0xffffff, 0xa23cff]);
  const rm = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(0xc9a0ff)); rm.rotation.x = -Math.PI / 2; rm.position.set(s.x, 0.1, s.z); scene.add(rm); pulses.push({ m: rm, t: 0.4, dur: 0.4, max: s.rad * 1.5 });
  shake = Math.max(shake, 0.3); audio.sfx('thud', { vol: 0.7, rate: rnd(1.2, 1.5) });
  hurtLyraArea(s.x, s.z, s.rad, C.dmg);
  if (P.trap <= 0 && Math.hypot(player.position.x - s.x, player.position.z - s.z) < s.rad && iceHurt(C.dmg)) {   // kena = terluka + terjebak di dalam kristal (berguling = kebal, lihat P.inv)
    trapPlayer(C.trap);
    if (iTrap) { iTrap.mat.color.setHex(0xc9a8ff); iTrap.mat.emissive.setHex(0x5a1ec8); }   // balok pemain diwarnai kristal ungu (mekanik terjebak sama dengan bos es)
  }
}
function removeCrystalSpike(s) { scene.remove(s.g, s.wr, s.wd); disposeMats(s.g); s.wr.material.dispose(); s.wd.material.dispose(); const i = krSpikes.indexOf(s); if (i >= 0) krSpikes.splice(i, 1); }
function spawnCrystalRain(i) {   // yang pertama tepat di bawah pemain, sisanya menyebar di sekitarnya (tidak saling tumpang tindih)
  const C = CRYSTAL, pts = krSpikes.filter(s => !s.up);
  let x = player.position.x, z = player.position.z;
  if (i > 0) for (let tr = 0; tr < 10; tr++) {
    const a = rnd(0, 6.28), r = rnd(1.5, C.spread); x = player.position.x + Math.cos(a) * r; z = player.position.z + Math.sin(a) * r;
    const hl = Math.hypot(x, z); if (hl > R - 1.5) { x *= (R - 1.5) / hl; z *= (R - 1.5) / hl; }
    if (pts.every(q => Math.hypot(q.x - x, q.z - z) > C.rad * 1.3)) break;
  }
  spawnCrystalSpike(x, z, 0, C.rad, C.warn);
}
function spawnCrystalCage() {   // fase 2: cincin kristal di sekeliling pemain (celah di antaranya; berguling menembusnya = kebal)
  const C = CRYSTAL, a0 = rnd(0, 6.28);
  for (let i = 0; i < C.cage; i++) {
    const a = a0 + i / C.cage * Math.PI * 2; let x = player.position.x + Math.cos(a) * C.cageR, z = player.position.z + Math.sin(a) * C.cageR;
    const hl = Math.hypot(x, z); if (hl > R - 1.5) { x *= (R - 1.5) / hl; z *= (R - 1.5) / hl; }
    spawnCrystalSpike(x, z, 0, C.cageRad, C.warn);
  }
}
function startSlam(e, d, dist, T, chain, p2) {   // LONCAT & HANTAM (chain = sisa loncatan beruntun setelah yang ini; fase 2 = 3 kali berturut-turut)
  const F = MUTANT_FIGHT; e.atk = 'slam'; e.at = T; e.sT = T; e.sc = chain;
  e.jf = e.g.position.clone(); e.jl = e.g.position.clone().addScaledVector(d, Math.max(0, dist - (e.r + PLAYER_R + 0.3)));   // titik mendarat dikunci sekarang (di sebelah pemain)
  const hl = Math.hypot(e.jl.x, e.jl.z); if (hl > R - 2) { e.jl.x *= (R - 2) / hl; e.jl.z *= (R - 2) / hl; }
  const rad = p2 ? 6.6 : 5.6, m = new THREE.Mesh(new THREE.RingGeometry(0.1, rad - 0.1, 48), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.copy(e.jl).setY(0.05); scene.add(m);
  rings.push({ m, t: T, rad, dmg: p2 ? 30 : 26 });   // meledak saat Mutan mendarat; pemain harus keluar dari cincin (atau berguling)
}
function clearCrystalBoss() { for (const s of [...krSpikes]) removeCrystalSpike(s); }   // bos mati / pemain kalah / keluar dungeon (balok pemain dibersihkan oleh clearIceBoss)
function crystalFxTick(dt) {   // peringatan -> kristal menyembul -> bertahan -> tenggelam (balok & waktu terjebak pemain diurus iceFxTick)
  const C = CRYSTAL;
  for (const s of [...krSpikes]) {
    s.t += dt; if (s.t < 0) continue;
    if (!s.up) {
      if (!s.shown) { s.shown = true; s.wr.visible = s.wd.visible = true; }
      const u = clamp01(s.t / s.warn);
      s.wr.material.opacity = 0.35 + 0.3 * Math.sin(s.t * (14 + 14 * u)); s.wd.scale.setScalar(Math.max(0.01, s.rad * u)); s.wd.material.opacity = 0.18 + 0.2 * u;
      if (s.t >= s.warn) eruptCrystalSpike(s);
    } else {
      const k = s.t - s.warn, up = 1 - Math.pow(1 - clamp01(k / C.rise), 3), sink = clamp01((C.life - k) / 0.5);
      for (const c of s.cones) c.m.scale.y = Math.max(0.001, c.h * up * sink);
      for (const m of s.mats) m.opacity = 0.94 * (0.3 + 0.7 * sink);
      if (k >= C.life) removeCrystalSpike(s);
    }
  }
}
function mutantAI(e, d, dist, dt) {   // Bos level 3 Gua Kristal: Mutan = monster JARAK DEKAT. Mengejar pemain lalu: cakar (dekat), seruduk (jauh), hantaman tanah (area di sekelilingnya)
  e.g.position.y = 0; if (e.mixer) e.mixer.update(dt);
  e.chg -= dt; e.slam -= dt; e.kcd = (e.kcd === undefined ? 4 : e.kcd) - dt;   // (e.cd sudah dikurangi di updateEnemies) kcd = jeda skill kristal
  const clampArena = () => { const hl = Math.hypot(e.g.position.x, e.g.position.z); if (hl > R - 2) { e.g.position.x *= (R - 2) / hl; e.g.position.z *= (R - 2) / hl; } };
  const p2 = e.hp < e.max * CRYSTAL.p2;   // FASE 2 (HP < 50%): seruduk 3x, loncat 3x, kristal jauh lebih banyak + kurungan, semua jeda lebih singkat
  if (P.trap <= 0) e.pounced = false;
  else if (!e.pounced && (!e.atk || e.atk === 'cquake') && e.stun <= 0) {   // pemain terjebak kristal -> Mutan LANGSUNG meloncat ke arahnya lalu memukul (kalau sudah dekat: langsung memukul)
    const Q = CRYSTAL.pounce; e.pounced = true; e.rec = 0; e.cd = 0; e.wind = 0; e.g.scale.setScalar(1);
    if (e.atk === 'cquake') e.kcd = CRYSTAL.cd;
    if (dist > e.r + Q.near) {
      e.atk = 'pounce'; e.at = Q.time; e.jf = e.g.position.clone(); e.jl = e.g.position.clone().addScaledVector(d, Math.max(0, dist - (e.r + PLAYER_R + 0.4)));   // titik mendarat dikunci di depan pemain
      const hl = Math.hypot(e.jl.x, e.jl.z); if (hl > R - 2) { e.jl.x *= (R - 2) / hl; e.jl.z *= (R - 2) / hl; }
    } else { e.atk = 'swing'; e.at = Q.wind; e.pp = true; e.side = -(e.side || -1); }
    audio.sfx('roar', { vol: 0.7, rate: 1.2 });
  }
  if (p2 && !e.p2 && !e.atk) {   // masuk fase 2: meraung marah, serangan berikutnya datang cepat
    e.p2 = true; e.atk = 'roar'; e.at = 1.4; e.rec = 0; e.wind = 0; e.g.scale.setScalar(1); audio.sfx('roar'); shake = Math.max(shake, 0.8);
    burst(e.g.position.clone().setY(2), 0xe0c8ff, 40, 10); e.kcd = Math.min(e.kcd, 2); e.slam = Math.min(e.slam, 3); e.chg = Math.min(e.chg, 3);
  }
  if (e.atk === 'roar') {   // raungan pembuka: diam sambil meraung
    e.at -= dt; if (e.at <= 0) e.atk = null;
  } else if (e.atk === 'swing') {   // cakar: aba-aba singkat (badan merah & bergetar), lalu kena kalau pemain masih dekat
    e.at -= dt; e.wind = Math.max(0.01, e.at); e.g.scale.setScalar(1 + Math.sin(e.at * 30) * 0.04);
    if (e.at <= 0) {
      e.atk = null; e.wind = 0; e.g.scale.setScalar(1); e.cd = MUTANT_FIGHT.swingCd; e.rec = MUTANT_FIGHT.swingRec; e.rk = 'swing';   // rec = jeda menahan pose setelah memukul
      if (e.pp) {   // PUKULAN setelah loncat: pasti kena selama pemain masih terjebak; terluka besar + terpental (kristal pecah)
        e.pp = false; const Q = CRYSTAL.pounce; if (P.trap > 0) P.inv = 0;
        if (dist < e.r + Q.reach && iceHurt(Q.dmg)) { pushPlayer(d, Q.kb); burst(player.position.clone().setY(1.3), 0xe0c8ff, 18, 9); shake = 0.7; audio.sfx('thud', { vol: 1, rate: 0.55 }); }
        e.rec = 0.55;
      } else if (dist < e.r + 2.8) hurtPlayer(22);
      burst(e.g.position.clone().addScaledVector(d, 2.4).setY(1.3), 0xbfe9ff, 18, 6); shake = 0.35;
    }
  } else if (e.atk === 'pounce') {   // LONCAT ke pemain yang terjebak: jongkok singkat -> melengkung di udara -> mendarat -> langsung memukul
    const Q = CRYSTAL.pounce; e.at -= dt;
    const el = Q.time - e.at;
    e.wind = el < Q.crouch ? 0.01 : 0;
    if (el >= Q.crouch) {
      const u = Math.min(1, (el - Q.crouch) / (Q.time - Q.crouch));
      e.g.position.x = e.jf.x + (e.jl.x - e.jf.x) * u; e.g.position.z = e.jf.z + (e.jl.z - e.jf.z) * u;
      e.g.position.y = Q.height * 4 * u * (1 - u);
    }
    if (e.at <= 0) {   // mendarat -> aba-aba pukulan sangat singkat
      e.g.position.set(e.jl.x, 0, e.jl.z); e.wind = 0; e.atk = 'swing'; e.at = Q.wind; e.pp = true; e.side = -(e.side || -1); shake = 0.5;
      burst(e.g.position.clone().setY(0.4), 0xe0c8ff, 22, 8);
    }
  } else if (e.atk === 'cquake') {   // KRISTAL DARI TANAH: angkat tangan -> hantam tanah -> kristal menyembul berurutan di sekitar pemain
    const C = CRYSTAL, n = p2 ? C.nP2 : C.n, iv = p2 ? C.intervalP2 : C.interval; e.mt += dt;
    if (!e.ksl && e.mt >= C.wind) { e.ksl = true; burst(e.g.position.clone().setY(0.4), 0xe0c8ff, 24, 9); shake = Math.max(shake, 0.6); audio.sfx('thud', { vol: 1, rate: 0.5 }); if (p2) spawnCrystalCage(); }
    while (e.ks < n && e.mt >= C.wind + e.ks * iv) { spawnCrystalRain(e.ks); e.ks++; }
    if (e.mt >= C.wind + (n - 1) * iv + 0.45) { e.atk = null; e.rec = C.rec; e.rk = 'slam'; e.kcd = C.cd * (p2 ? 0.7 : 1); e.cd = Math.max(e.cd, 0.6); }
  } else if (e.atk === 'tele') {   // aba-aba seruduk: berhenti, menghadap arah serudukan (dikunci di awal, jadi bisa dihindari ke samping)
    e.at -= dt; e.wind = Math.max(0.01, e.at); e.g.rotation.y = Math.atan2(e.dir.x, e.dir.z);
    if (e.at <= 0) { e.atk = 'dash'; e.at = 0.55; e.hit = false; e.wind = 0; }
  } else if (e.atk === 'dash') {   // seruduk lurus
    e.at -= dt; e.g.position.addScaledVector(e.dir, (e.p2 ? 21 : 17) * dt); e.g.rotation.y = Math.atan2(e.dir.x, e.dir.z); clampArena();
    if (!e.hit && dist < e.r + 1.3) {
      e.hit = true; shake = 0.5;
      if (iceHurt(28) && e.p2) { const pp = player.position.clone().sub(e.g.position), sg = (pp.x * -e.dir.z + pp.z * e.dir.x) >= 0 ? 1 : -1; pushPlayer(_iv.set(-e.dir.z * sg, 0, e.dir.x * sg), 13); }   // fase 2: tersambar = terpental ke samping
    }
    if (Math.random() < 0.5) burst(e.g.position.clone().setY(0.3), 0xbfe9ff, 2, 3);
    if (e.at <= 0) {
      if (e.dc > 0) { e.dc--; e.atk = 'tele'; e.at = 0.32; e.dir = d.clone(); }   // seruduk lanjutan: berbalik sebentar (aba-aba singkat) lalu menyeruduk lagi ke arah pemain
      else { e.atk = null; e.cd = 1.2; e.rec = 0.5; e.rk = 'skid'; }
    }   // habis menyeruduk: mengerem sebentar
  } else if (e.atk === 'slam') {   // LONCAT & HANTAM: jongkok dulu, melompat ke tempat pemain berdiri, lalu menghantam tanah (cincin merah = titik mendarat, ledakannya diurus di updateEnemies)
    const F = MUTANT_FIGHT, T = e.sT || F.jumpTime, cr = Math.min(F.jumpCrouch, T * 0.3); e.at -= dt;
    const el = T - e.at;   // waktu yang sudah lewat sejak mulai
    e.wind = el < cr ? 0.01 : 0;   // badan memerah saat jongkok (aba-aba)
    if (el >= cr) {   // di udara: bergerak lurus ke titik mendarat sambil melengkung ke atas
      const u = Math.min(1, (el - cr) / (T - cr));
      e.g.position.x = e.jf.x + (e.jl.x - e.jf.x) * u; e.g.position.z = e.jf.z + (e.jl.z - e.jf.z) * u;
      e.g.position.y = F.jumpHeight * 4 * u * (1 - u);
    }
    if (e.at <= 0) {   // mendarat
      e.g.position.set(e.jl.x, 0, e.jl.z); e.wind = 0; e.atk = null; shake = 0.7;
      burst(e.g.position.clone().setY(0.4), 0xbfe9ff, 26, 8);   // debu pendaratan
      if (e.sc > 0) {   // loncat beruntun (fase 2): langsung loncat lagi ke tempat pemain berdiri sekarang
        const dv = player.position.clone().sub(e.g.position).setY(0), dd = dv.length(); dv.normalize();
        startSlam(e, dv, dd, 0.8, e.sc - 1, true);
      } else { e.cd = 1.0; e.rec = 0.6; e.rk = 'slam'; e.sc = 0; }   // tangan masih menancap di tanah sebentar
    }
  } else if (e.rec > 0) {   // jeda setelah menyerang (pose ditahan oleh animasi)
    e.rec -= dt;
  } else if (e.stun <= 0) {   // mengejar & memilih serangan
    if (dist > e.r + 1.7) { e.g.position.addScaledVector(d, e.sp * dt); clampArena(); }
    if (e.kcd <= 0 && dist > 4.5) {   // skill kristal dari tanah (jarak menengah / jauh)
      e.atk = 'cquake'; e.mt = 0; e.ks = 0; e.ksl = false; audio.sfx('roar', { vol: 0.6, rate: 0.8 });
    } else if (e.slam <= 0 && dist < MUTANT_FIGHT.jumpMaxDist) {   // mau loncat (fase 2: 3 kali berturut-turut)
      e.slam = MUTANT_FIGHT.slamCd * (p2 ? 0.7 : 1); startSlam(e, d, dist, MUTANT_FIGHT.jumpTime, p2 ? 2 : 0, p2);
    } else if (e.chg <= 0 && dist > 6.5) {
      e.chg = p2 ? 5 : 7; e.atk = 'tele'; e.at = 0.8; e.dir = d.clone(); e.dc = p2 ? 2 : 0;   // fase 2: 3 seruduk berturut-turut (dc = sisa seruduk lanjutan)
    } else if (dist < e.r + 2.6 && e.cd <= 0) {
      e.atk = 'swing'; e.at = MUTANT_FIGHT.swingWind; e.side = -(e.side || -1);   // tangan kiri & kanan bergantian
    }
  }
}
// Kirim keadaan Mutan saat ini ke rig animasi (mode + kemajuan gerakan). dying = true saat adegan slowmo kematian.
const SWING_T = MUTANT_FIGHT.swingWind, TELE_T = 0.8, DASH_T = 0.55, SLAM_T = MUTANT_FIGHT.jumpTime;   // harus sama dengan lama aba-aba di mutantAI
function mutantPose(e, dt, dying) {
  if (!e.rig) return;
  const g = e.g.position, lp = e.lp || (e.lp = new THREE.Vector3());
  const speed = dt > 1e-4 ? Math.hypot(g.x - lp.x, g.z - lp.z) / dt : 0; lp.copy(g);   // kecepatan jalan -> ayunan kaki & tangan
  let mode = 'idle', p = 0;
  if (dying) { mode = 'die'; p = Math.min(1, (1 - slow.t / SLOW_TOTAL) / SLOW_DEATH); }
  else if (e.atk === 'roar') { mode = 'roar'; p = 1 - e.at / Math.max(0.01, MUTANT_ANIM.roarTime); }
  else if (e.atk === 'swing') { mode = 'swing'; p = 1 - e.at / SWING_T; }
  else if (e.atk === 'tele') { mode = 'tele'; p = 1 - e.at / TELE_T; }
  else if (e.atk === 'dash') { mode = 'dash'; }
  else if (e.atk === 'slam') { mode = 'jump'; p = 1 - e.at / (e.sT || SLAM_T); }
  else if (e.atk === 'pounce') { mode = 'jump'; p = 1 - e.at / CRYSTAL.pounce.time; }   // loncat ke pemain yang terjebak (memakai pose loncat yang sama)
  else if (e.atk === 'cquake') { if (e.mt < CRYSTAL.wind) { mode = 'roar'; p = e.mt / CRYSTAL.wind; } else { mode = 'slam'; p = 1; } }   // angkat tangan, lalu tangan menancap di tanah   // loncat; setelah mendarat pose 'slam' ditahan lewat e.rec
  else if (e.rec > 0) { mode = e.rk === 'skid' ? 'skid' : e.rk; p = 1; }   // menahan pose akhir (cakar / hantam sudah kena)
  e.rig.update(dt, { mode, p: Math.max(0, Math.min(1, p)), side: e.side || 1, speed: dying || e.atk ? 0 : speed, flinch: e.stun > 0 && !dying ? 1 : 0 });
}
function updateEnemies(dt) {
  aimLyra = false;
  for (const e of [...enemies]) {
    if (e.kaelen) { kaelenSync(); continue; }   // Kaelen digerakkan kaelen-battle.js
    if (e.dying) { dyingTick(e); if (e.mutant) mutantPose(e, dt, true); else if (e.fireboss) firePose(e, dt, true); else if (e.iceboss) icePose(e, dt, true); else if (e.knight) knightPose(e, dt, true); else if (e.caveboss) cavePose(e, dt, true); continue; }
    const tl = enemyTargetsLyra(e, dt);   // mengincar Lyra? (d & dist = arah & jarak ke SASARAN; pdist = jarak ke pemain untuk menentukan apakah pemain ikut terkena)
    const d = (tl ? lyra.pos : player.position).clone().sub(e.g.position).setY(0), dist = d.length();
    d.normalize();
    const pdist = tl ? Math.hypot(player.position.x - e.g.position.x, player.position.z - e.g.position.z) : dist;
    const bossSw = tl && !!(e.boss || e.dragon || e.golem);   // bos membidik Lyra: pinjamkan posisi pemain = posisi Lyra selama AI bos berjalan
    if (bossSw) { swapIn(); aimLyra = true; }
    try {
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
    } else if (!e.wild && !e.golem) e.g.rotation.y = Math.atan2(d.x, d.z); // (golem berbelok sendiri di golemAI) monster hutan mengatur arah hadapnya sendiri
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
    e.mat.emissive.setHex(e.flash > 0 ? 0xffffff : e.wind > 0 ? 0x802010 : (e.base || 0x000000));
    if (e.dragon) dragonAI(e, d, dist, dt);
    else if (e.golem) golemAI(e, d, dist, dt);
    else if (e.wild) wildAI(e, d, dist, dt, pdist);
    else if (e.boss && e.mutant) { mutantAI(e, d, dist, dt); mutantPose(e, dt, false); }
    else if (e.boss && e.seraph) seraphAI(e, d, dist, dt);   // Seraphim: melayang, 3 serangan cahaya
    else if (e.boss && e.fireboss) fireBossAI(e, d, dist, dt);   // Ignarok: tinju (dekat), meteor & dash (jauh)
    else if (e.boss && e.knight) { knightAI(e, d, dist, dt); knightPose(e, dt, false); }   // Mordrak: tebasan dasar (dekat), tebas 3x, terjang + tebas beruntun & laser bayangan
    else if (e.boss && e.caveboss) caveBossAI(e, d, dist, dt);   // Grumbolt: gigit (dekat), panggil golem, batu dari tanah, 5 batu besar & terjang+gigit
    else if (e.boss && e.iceboss) iceBossAI(e, d, dist, dt);   // Glacivor: tinju (dekat), es dari bawah, bola es raksasa & dash+tinju
    else if (e.boss) {
      const keep = e.stun > 0 ? 0 : dist > 8 ? 1 : dist < 5 ? -1 : 0;
      e.g.position.addScaledVector(d, keep * e.sp * dt);
      e.g.position.y = e.mutant ? 0 : Math.sin(P.t * 2) * 0.15;   // penyihir melayang; Mutan berpijak di tanah
      if (e.mixer) e.mixer.update(dt);
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
      if (e.crystal) { e.spin.rotation.y += dt * 1.8; e.g.position.y = 0.2 + Math.sin(P.t * 3 + e.ph) * 0.12; }   // monster kristal melayang & pecahannya berputar
      if (e.wind > 0) {
        e.wind -= dt; e.g.scale.setScalar(1 + Math.sin(e.wind * 30) * 0.06);
        if (e.wind <= 0) { e.g.scale.setScalar(1); lyra.hurtNear(e.g.position.x, e.g.position.z, 2.4 + (e.r - 0.9), (e.dmg || 10) * bossMul()); if (pdist < 2.4 + (e.r - 0.9)) hurtPlayer(e.dmg || 10); }
      } else if (e.stun > 0) { /* sedang terpental */ }
      else if (e.xroom != null && !xAggro(e, dist)) { /* dungeon jelajah: belum menyadari pemain */ }
      else if (dist > 1.7) e.g.position.addScaledVector(d, e.sp * dt);
      else if (e.cd <= 0) { e.wind = 0.5; e.cd = 1.6; }
    }
    for (const o of enemies) if (o !== e) { // saling menjauh
      const s = e.g.position.clone().sub(o.g.position).setY(0), l = s.length();
      if (l < 1.6 && l > 0.001) e.g.position.addScaledVector(s.normalize(), (1.6 - l) * 0.5);
    }
    if (exploreMode && dgX && e.xroom != null) dgX.collide(e.g.position, e.r * 0.75);   // musuh tidak menembus dinding dungeon
    } finally { if (bossSw) swapOut(); }
  }
  for (const o of [...orbs]) {
    o.m.position.addScaledVector(o.v, dt); if (o.spin) o.m.rotation.x += o.spin * dt;
    if (o.m.position.distanceTo(player.position.clone().setY(1.1)) < 1.0) { hurtPlayer(12); kill(o); }
    else if (lyraOrbHit(o)) kill(o);
    else if (o.m.position.length() > R + 2 || o.m.position.y < 0) kill(o);
  }
  function kill(o) { if (o.rock) { burst(o.m.position.clone(), 0xbfe6f5, 10, 5); golemImpact(0.45); } scene.remove(o.m); orbs.splice(orbs.indexOf(o), 1); }
  for (const r of [...rings]) {
    r.t -= dt; r.m.material.opacity = 0.25 + Math.sin(r.t * 20) * 0.1;
    if (r.t <= 0) {
      if (!r.big) hurtLyraArea(r.m.position.x, r.m.position.z, r.rad || 4.6, r.dmg || 25);
      if (!r.big && player.position.distanceTo(r.m.position) < (r.rad || 4.6)) hurtPlayer(r.dmg || 25); // hantaman naga (big): damage diberikan saat ledakan
      if (r.kind === 'golem') spawnQuake(r.m.position, r.rad, r.dmg); else if (r.big) spawnBlast(r.m.position, r.rad, r.dmg || 30, r.kind); else { burst(r.m.position, 0xff6030, 30, 8); shake = 0.6; }
      scene.remove(r.m); rings.splice(rings.indexOf(r), 1);
    }
  }
  updateBlasts(dt); updateQuakes(dt); updateGPillars(dt); seraphFxTick(dt); fireFxTick(dt); iceFxTick(dt); knightFxTick(dt); caveFxTick(dt); crystalFxTick(dt);
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
  if (!enemies.some(e => e.wild && e.aggro)) { calmT += dt; if (calmT > 4 && P.hp < P.max && !DK.on) P.hp = Math.min(P.max, P.hp + 2.5 * dt); } else calmT = 0; // aman beberapa detik -> darah pulih pelan
  if (fa < 0.4) { wildT = Math.min(wildT, 1.5); return; }
  if ((wildT -= dt) > 0) return;
  wildT = rnd(2.5, 5.5); trySpawnWild();
}
function wildAI(e, d, dist, dt, pdist = dist) {   // dist = jarak ke sasaran (pemain / Lyra), pdist = jarak ke pemain
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
      lyra.hurtNear(pos.x, pos.z, slime ? 2.4 : 2.7, slime ? 7 : 10);
      if (pdist < (slime ? 2.4 : 2.7)) { hurtPlayer(slime ? 7 : 10); audio.sfx(slime ? 'thud' : 'sword', { vol: 0.6, rate: slime ? 1.5 : 0.8 }); }
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
  if (e.code === 'Escape') { if (GU.open) { guildClose(); return; } openSettings(!settingsOpen); return; }   // Esc menutup dialog guild dulu
  if (settingsOpen) return; // game dijeda saat menu terbuka
  keys[e.code] = true;
  if (GU.open) { guildKey(e); return; }   // dialog Balai Petualang: pilih 1-7, Q = tutup
  if (IT.open) { itKey(e); return; }   // mengobrol dengan Isabel: pilih jawaban (1-5 / panah / E)
  if (QT.phase) { if (QT.phase === 2 && !e.repeat && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); qtAdvance(); } return; }   // saat membungkuk / berbicara dengan ratu: aksi lain dikunci
  if (e.code === 'Space') { e.preventDefault(); attack(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') roll();
  const sk = { Digit1: 's1', Digit2: 's2', Digit3: 's3', Digit4: 's4', Digit5: 's5', Digit6: 's6' }[e.code]; if (sk) skill(sk);
  if (e.code === 'KeyC') toggleCam();
  if (e.code === 'KeyB' && !e.repeat) loot.toggleBag();   // tas item
  if (e.code === 'KeyH' && !e.repeat) loot.usePotion();   // pakai Ramuan Pemulih
  if (e.code === 'KeyX' && !e.repeat) toggleDark(); // Dark Mode Luis
  if (e.code === 'KeyE' && !e.repeat && state === 'world') talkAct(); // mengobrol dengan warga desa / membungkuk di depan ratu
  if (e.code === 'KeyF') toggleFS(); // layar penuh
  if ((e.code === 'KeyR' || e.code === 'Enter') && canAgain) restart(); // R / Enter (khusus keyboard PC)
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', e => {
  if (settingsOpen) return;
  if (orbit() && !locked() && !slCamOn() && e.button === 0 && e.target === renderer.domElement && !document.body.classList.contains('touch') && renderer.domElement.requestPointerLock) {
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

const canFight = () => (state === 'play' || state === 'world') && skinCur !== 'pajama' && !(P.trap > 0 || P.hs > 0);   // (terjebak es / terpental: tidak bisa menyerang)   // baju tidur tanpa pedang: tidak bisa menyerang // serang & skill juga bisa dipakai di dunia luar (melawan monster hutan)
function attack() {
  if (QT.phase || IT.open || !canFight() || P.air || P.atk > 0 || P.roll > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0 || P.pt > 0 || P.ex > 0) return;
  if (PT.buff > 0) { startPT(true); return; } // mode Lari Petir: serangan dasar = terjang petir
  P.hit = false; P.comboT = 1.2;
  if (++P.combo >= 4) { P.combo = 0; P.cross = true; P.dur = P.atk = CX.total; P.cn = 0; } // serangan ke-4: tebasan beruntun miring selama 2 detik (suara & damage diatur crossTick)
  else { P.cross = false; P.dur = P.atk = ATK_T; P.hand = dkGs.on ? 1 : -P.hand; audio.sfx('sword'); } // bergantian kanan-kiri
}
function roll() {
  if (QT.phase || IT.open || (state !== 'play' && !(state === 'world' && kaelenOn())) || P.air || P.trap > 0 || P.hs > 0 || P.roll > 0 || P.atk > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0 || P.pt > 0 || P.ex > 0) return;
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
addEventListener('wheel', e => { e.preventDefault(); if (slCamOn()) slZoom(SLU.zoom * Math.exp(e.deltaY * 0.0012)); else setZoom(zoom * Math.exp(e.deltaY * 0.0012)); }, { passive: false });
const tps = new Map(); let pd0 = 0, z0 = 1; // jari yang menyentuh layar (di luar joystick/tombol)
const pdist = () => { const [a, b] = [...tps.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || e.target !== renderer.domElement || slCamOn()) return;
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
  for (const m of [slash.material, dMat, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
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
  for (const m of [slash.material, dMat, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
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
// ---- DARK MODE: palet gelap (hitam + merah) & palet aktif untuk skill 3 / 6 (CP = HOLY saat mode biasa, DKP saat Dark Mode) ----
Object.assign(HOLY, { ring: 0xffd35a, ring2: 0xfff4cf, ring3: 0xffe08a, burst: 0xffe9a0, glow: 0xffffff, light: 0xffc860, bolt: { glow: 0xffb52e, core: 0xfff4cf } });
const dkTexMake = stops => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const DKP = { white: 0x1c0a10, gold: 0xe0001c, deep: 0xc00018, trim: 0x2a0810, trimE: 0x600008, ring: 0xd0001a, ring2: 0xff3a4a, ring3: 0xff1a2e, burst: 0xff2236, glow: 0xff2030, light: 0xff1830,
  sparks: [0xff4a5a, 0xc00018], bolt: { glow: 0xff1030, core: 0xff9aa6 },
  tex: dkTexMake([[0, 'rgba(255,90,100,1)'], [0.25, 'rgba(230,10,40,.6)'], [0.6, 'rgba(140,0,20,.2)'], [1, 'rgba(100,0,10,0)']]) };
let CP = HOLY;   // palet yang sedang dipakai skill 3 & 6
function makeBigBlade(pal = HOLY) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: pal.white, metalness: 1, roughness: 0.2, emissive: pal.deep, emissiveIntensity: 1.1, transparent: true, opacity: 0 });
  const gold = new THREE.MeshStandardMaterial({ color: pal.trim || 0xffd34d, metalness: 1, roughness: 0.3, emissive: pal.trimE || 0x9a6400, transparent: true, opacity: 0 });
  const aura = glowMat(pal.gold, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: pal.tex || haloTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.position.y = 1.5; halo.scale.set(7, 7, 1); g.add(halo); // cahaya suci di sekeliling pedang
  const add = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; g.add(o); return o; };
  add(bgeo.blade, steel, 1.35); add(bgeo.tip, steel, 0).rotation.x = Math.PI; // ujung runcing menghadap ke bawah
  add(bgeo.guard, gold, 2.5); add(bgeo.grip, gold, 2.95); add(bgeo.pom, gold, 3.38);
  const a1 = add(bgeo.aura, aura, 1.5), a2 = add(bgeo.aura, aura, 1.5); a2.rotation.y = Math.PI / 2;
  return { g, steel, gold, aura, halo };
}
function makeSummonRing(pal = HOLY) { // lingkaran sihir datar di lantai
  const g = new THREE.Group(), m = glowMat(pal.gold, 0);
  g.add(new THREE.Mesh(bgeo.ring1, m), new THREE.Mesh(bgeo.ring2, m));
  for (let i = 0; i < 3; i++) { const bar = new THREE.Mesh(bgeo.bar, m); bar.rotation.z = i * Math.PI / 3; g.add(bar); } // bintang bersudut 6
  g.rotation.x = -Math.PI / 2; return { g, m };
}
function startSM() {
  audio.sfx('choir', { delay: 0.3 }); // paduan suara saat lingkaran sihir pertama muncul
  SM.mode = 3;
  Object.assign(P, { sm: SM.dur, smD: 0, atk: 0, cross: false, roll: 0 });
  for (const m of [slash.material, dMat, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
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
  P.sm = 0; P.smD = 0; P.drawT = DRAW_HOLD;
  if (full) { dkClear(); for (const b of blades) { scene.remove(b.bl.g, b.rg.g); } blades.length = 0; for (const p of pillars) scene.remove(p.m); pillars.length = 0; }
}
function smTick(dt) { P.sm -= dt; P.inv = Math.max(P.inv, 0.15); if (P.sm <= 0) endSM(); }
function bladeImpact(b) {
  const pos = new THREE.Vector3(b.x, 0.3, b.z);
  for (const e of [...enemies]) {
    const d = e.g.position.clone().sub(pos).setY(0), l = d.length();
    if (e === b.e) hurtEnemy(e, SM.dmg, l > 0.01 ? d.normalize() : null, 6, 's3');
    else if (l < SM.splashR * b.k + e.r) hurtEnemy(e, SM.splash, d.normalize(), 10, 's3');
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

// ---------- DARK MODE (tombol X) ----------
// Luis masuk mode gelap: aura merah-hitam. Skill 3 berubah jadi "Dark Blades" (5 lingkaran sihir -> 5 pedang kegelapan -> mengunci target -> diluncurkan serentak),
// skill 6 tetap Excalibur dengan animasi yang sama tetapi sinar & efeknya hitam-merah (lihat exTheme). Serangan gelap BUKAN elemen cahaya (src 'd3' / 'd6'), jadi Seraphim tidak kebal.
const DK = { on: false, cd: 0, em: 0, sw: [], snd: false, aura: null, mist: null, badge: null, pow: 0, pT: 0, pe: 0, rt: 0, sp: null, bt: '' };
const DK3 = { n: 5, dur: 1.5, ca: 0.1, step: 0.08, emerge: 0.4, lock: 0.72, launch: 1.08, fly: 0.18, scale: 0.8, dmg: 42, splash: 18, splashR: 2.2, range: 22 };
// Penguatan Dark Excalibur: setelah sinar selesai, selama DKB.dur detik serangan dasar = slash MERAH raksasa (visual x big, jangkauan x rng, damage x dmg),
// dan aura merah berputar (pita spiral seperti skill 6) memancar ke seluruh arena (reach).
const DKB = { gs: 0.75, dur: 4, big: 2.4, rng: 1.8, dmg: 1.6, reach: 20, drain: 0.01, lethal: false };   // drain: HP berkurang (x HP maks) per detik selama Dark Mode; lethal false = berhenti di 1 HP
const _dkA = new THREE.Vector3(), _dkB = new THREE.Vector3(), _dkP = new THREE.Vector3();
DK.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: DKP.tex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); DK.aura.position.y = 1; DK.aura.scale.set(4.4, 4.4, 1); DK.aura.visible = false; player.add(DK.aura);
DK.mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: dkTexMake([[0, 'rgba(0,0,0,.9)'], [0.5, 'rgba(10,0,6,.45)'], [1, 'rgba(0,0,0,0)']]), transparent: true, opacity: 0, depthWrite: false, fog: false })); DK.mist.position.y = 0.9; DK.mist.scale.set(5.8, 5.8, 1); DK.mist.visible = false; player.add(DK.mist);
DK.badge = document.createElement('div'); DK.badge.textContent = '🌑 DARK MODE';
DK.badge.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);padding:4px 14px;border-radius:14px;font:700 13px sans-serif;letter-spacing:2px;color:#ff5a6a;background:rgba(10,0,6,.72);border:1px solid #c0001c;box-shadow:0 0 14px #c0001c;pointer-events:none;z-index:3;display:none';
document.body.appendChild(DK.badge);
const dkRetGeo = [0, 1, 2, 3].map(i => new THREE.RingGeometry(0.82, 1, 14, 1, i * Math.PI / 2 + 0.2, Math.PI / 2 - 0.4)), dkRetIn = new THREE.RingGeometry(0.06, 0.14, 16);
DK.sp = new THREE.Group();
[[1.5, 6.5, 1.1, 5.5, 0.7, 0], [2, 7.5, 0.9, 3.2, 0.55, 2.1], [1.2, 5, 1.4, 7.5, 0.45, 4.2], [3, 8.5, 0.8, 2, 0.5, 1], [1, 4, 1.6, 6.5, 0.35, 3.3]].forEach(([r0, r1, tu, h, W, ph]) => {
  const m = new THREE.Mesh(exSpiralGeo(r0, r1, tu, h, W), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xff1830, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.rotation.y = ph; m.userData.sp = 0.8 + Math.random() * 0.8; DK.sp.add(m);
});
DK.sp.visible = false; scene.add(DK.sp);
// aura Dark Mode: pita spiral merah berputar mengelilingi badan Luis (gaya skill 6, ukuran badan) selama mode aktif
DK.sp2 = new THREE.Group();
[[1.5, 6.5, 1.1, 5.5, 0.7, 0], [2, 7.5, 0.9, 3.2, 0.55, 2.1], [1.2, 5, 1.4, 7.5, 0.45, 4.2], [3, 8.5, 0.8, 2, 0.5, 1], [1, 4, 1.6, 6.5, 0.35, 3.3]].forEach(([r0, r1, tu, h, W, ph]) => {
  const m = new THREE.Mesh(exSpiralGeo(r0, r1, tu, h, W), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xff1830, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.rotation.y = ph; m.userData.sp = 0.8 + Math.random() * 0.8; DK.sp2.add(m);
});
DK.sp2.scale.set(0.5, 0.45, 0.5); DK.sp2.visible = false; scene.add(DK.sp2);
let dkFlip = 1;
function dkSlashWave(off = 0) {   // slash ke depan seperti aura penguatan skill 4 (bfSlash), tapi HITAM berpinggir merah; selama penguatan Dark Excalibur ukurannya raksasa
  const S = DK.pow > 0 ? DKB.big : 1.15, a = P.face + off, f = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); dkFlip *= -1;
  const wg = new THREE.Group(), pl = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x0a0004, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });   // badan hitam (blending biasa)
  const mat2 = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xff1020, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });   // pinggir merah menyala
  pl.rotation.x = -Math.PI / 2; wg.add(pl);
  [[2.2, 2.6, 0.9, 0.0, 0.25], [2.8, 2.2, 0.35, 0.2, -0.2]].forEach(([rc, span, W, h, tilt]) => {
    const piv = new THREE.Group(), red = new THREE.Mesh(ribbonGeo(rc, span, W), mat2), blk = new THREE.Mesh(ribbonGeo(rc, span, W), mat);
    red.scale.set(1.1, 1.1, 1); red.renderOrder = 1; blk.renderOrder = 2; piv.add(red, blk); piv.rotation.z = -Math.PI / 2 + span / 2;
    const hold = new THREE.Group(); hold.position.z = h; hold.rotation.x = tilt; hold.add(piv); pl.add(hold);
  });
  wg.position.copy(player.position).addScaledVector(f, 0.6).setY(0.95); wg.rotation.y = a; wg.scale.set(dkFlip * S, S, S); scene.add(wg);
  waves.push({ g: wg, v: f.clone().multiplyScalar(DK.pow > 0 ? 20 : 15), life: DK.pow > 0 ? 0.8 : 0.55, hit: new Set(), dmg: DK.pow > 0 ? 30 : 22, mat, mat2, rad: 1.3 * S });
  lineSparks(player.position.clone().addScaledVector(f, 1.5).setY(1), 10, 7, 1, DKP.sparks);
}
function dkTint(on) {   // warna efek serangan dasar: ungu -> merah
  for (const m of [slash.material, dMat]) m.color.setHex(on ? 0xff1020 : 0xffffff);
  xMat.color.setHex(on ? 0xff1a2a : 0xa23cff); xCore.color.setHex(on ? 0xff6a76 : 0xf3e6ff);
}
// Great sword: selama penguatan Luis menggenggam pedang Excalibur (GLB yang sama dengan skill 6) di tangan kanan, dua pedang aslinya disembunyikan
const dkGs = { on: false, h: new THREE.Group(), root: null, halo: null };
function dkGreatsword(on) {
  const r = rigs.find(q => q.side > 0);
  if (!on) { if (dkGs.h.parent) dkGs.h.parent.remove(dkGs.h); dkGs.on = false; for (const q of rigs) q.holder.visible = true; return; }
  if (!EXS.glb || !EXS.root || !r || !r.hand) return;   // model pedang belum dimuat: tetap pakai dua pedang
  if (!dkGs.root) {
    dkGs.root = EXS.root.clone(true); dkGs.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: DKP.tex, color: 0xff2030, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    dkGs.h.add(dkGs.root, dkGs.halo); dkGs.h.rotation.z = Math.PI / 2;   // bilah searah bilah pedang biasa di tangan kanan (-x)
  }
  const sc = EX.len * EXS.Ls / EXS.h * DKB.gs;
  dkGs.root.scale.setScalar(sc); dkGs.root.position.set(0, EXG.low * sc, 0); dkGs.halo.position.y = EXS.tip / (EX.len * EXS.Ls / EXS.h) * sc * 0.5; dkGs.halo.scale.setScalar(4 * DKB.gs);
  r.hand.add(dkGs.h); dkGs.on = true; for (const q of rigs) q.holder.visible = false;
}
function dkPowStart() {
  DK.pow = DKB.dur; DK.pT = 0; DK.rt = 0; dkTint(true); dkGreatsword(true);
  toast('🩸 DARK EXCALIBUR — penguatan ' + DKB.dur + ' dtk: great sword + slash merah raksasa!', 2800);
}
function dkPowEnd() {
  if (!DK.pow && !DK.sp.visible && !dkGs.on) return;
  DK.pow = 0; dkGreatsword(false); DK.pe = 0; DK.sp.visible = false; for (const c of DK.sp.children) c.material.opacity = 0; dkTint(false);
}
function dkPowFx(dt) {   // aura merah berputar memancar ke seluruh arena
  const pp = player.position, env = Math.min(1, DK.pT / 0.35, DK.pow / 0.6);
  DK.sp.visible = true; DK.sp.position.set(pp.x, 0.05, pp.z);
  DK.sp.children.forEach((c, i) => {
    const ph = (DK.pT * 0.55 + i / DK.sp.children.length) % 1, s = 0.35 + ph * (DKB.reach / 8.5);   // tiap pita melebar dari Luis sampai tepi arena
    c.scale.set(s, Math.min(s, 1.5), s); c.rotation.y += dt * c.userData.sp * 5; c.material.opacity = env * 0.9 * Math.sin(Math.PI * ph);
  });
  if ((DK.rt -= dt) <= 0) {   // cincin kejut merah menyapu arena
    DK.rt = 0.32; ptRing(pp.clone().setY(0.08), null, DKB.reach, 0.9, { c: DKP.ring }); ptRing(pp.clone().setY(0.1), null, DKB.reach * 0.7, 0.8, { c: DKP.ring2, delay: 0.1 });
    shake = Math.max(shake, 0.08);
  }
  for (let i = 0; i < 2; i++) { const a = rnd(0, 6.283), r = rnd(2, DKB.reach * 0.9); lineSparks(new THREE.Vector3(pp.x + Math.cos(a) * r, 0.1, pp.z + Math.sin(a) * r), 2, 5, 3, DKP.sparks); }
}
// ---- penampilan Dark Mode: rambut Luis jadi hitam, mata jadi merah (memudar halus lewat DK.em) ----
// Material dikenali dari NAMA material / mesh di model VRM (DKL.hair / DKL.eye). Kalau rambut / mata tidak berubah, lihat console (F12): daftar nama material dicetak di sana,
// lalu sesuaikan DKL.hair / DKL.eye dengan nama yang dipakai model.
const DKL = { hair: /hair|rambut|kami|bang|fringe|ponytail|twin/i, eye: /iris|pupil|hitomi|eye|mata/i, skip: /lash|brow|white|line|shadow|highlight|spec|hl\b|sclera|mouth|mayu|kuchi/i,
  hairCol: new THREE.Color(0.03, 0.03, 0.04), eyeCol: new THREE.Color(1, 0.18, 0.2), eyeEm: new THREE.Color(0.8, 0, 0.05) };
let dkLookV = null, dkLookB = -1, dkHair = [], dkEye = [];
function dkLookScan() {
  dkHair = []; dkEye = []; const seen = new Set(), names = [];
  vrm.scene.traverse(o => {
    if (!o.isMesh) return;
    for (const mt of [].concat(o.material)) {
      if (!mt || seen.has(mt)) continue; seen.add(mt); names.push((mt.name || '?') + (o.name ? ' @' + o.name : ''));
      if (!mt.userData._dkO) mt.userData._dkO = { c0: mt.color ? mt.color.clone() : null, s0: mt.shadeColorFactor ? mt.shadeColorFactor.clone() : null, e0: mt.emissive ? mt.emissive.clone() : null };
      const nm = (mt.name || '') + ' ' + (o.name || ''), rec = { mt, o: mt.userData._dkO };
      if (DKL.skip.test(nm)) continue;
      if (DKL.hair.test(nm)) dkHair.push(rec); else if (DKL.eye.test(nm)) dkEye.push(rec);
    }
  });
  if (!dkHair.length || !dkEye.length) console.warn('Dark Mode: material ' + (!dkHair.length ? 'rambut ' : '') + (!dkEye.length ? 'mata ' : '') + 'tidak ditemukan. Nama material model:', names);
}
function dkLookTick() {
  if (!vrm) return;
  if (vrm !== dkLookV) { dkLookV = vrm; dkLookScan(); dkLookB = -1; }
  const b = Math.round(DK.em * 100) / 100; if (b === dkLookB) return; dkLookB = b;
  for (const { mt, o } of dkHair) { if (o.c0) mt.color.copy(o.c0).lerp(DKL.hairCol, b); if (o.s0 && mt.shadeColorFactor) mt.shadeColorFactor.copy(o.s0).lerp(DKL.hairCol, b); }
  for (const { mt, o } of dkEye) { if (o.c0) mt.color.copy(o.c0).lerp(DKL.eyeCol, b); if (o.e0 && mt.emissive) mt.emissive.copy(o.e0).lerp(DKL.eyeEm, b); }
}
function toggleDark() {
  if (QT.phase || IT.open || !canFight() || P.air || P.roll > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0 || P.pt > 0 || P.ex > 0 || (P.atk > 0 && P.cross) || DK.cd > 0) return;
  DK.cd = 0.8; DK.on = !DK.on; dkPowEnd(); exTheme(DK.on);
  const pp = player.position;
  pulse(DK.on ? DKP.gold : HOLY.gold, 5, 0.6); lineSparks(pp.clone().setY(0.2), 30, 8, 1, DK.on ? DKP.sparks : HOLY.sparks); shake = Math.max(shake, 0.35); EX.fl = Math.max(EX.fl, 0.35);
  audio.sfx('thud', { vol: 0.9, rate: DK.on ? 0.45 : 0.9 });
  toast(DK.on ? '🌑 DARK MODE — skill 3 jadi Dark Blades, skill 6 jadi Dark Excalibur (X untuk kembali)' : '☀️ Dark Mode nonaktif', 2600);
  if (skBtn.s3) { skBtn.s3.title = DK.on ? 'Dark Blades (3)' : 'Summon Blade (3)'; skBtn.s3.style.filter = DK.on ? 'hue-rotate(-60deg) saturate(1.6) brightness(.75)' : ''; }
  if (skBtn.s6) { skBtn.s6.title = DK.on ? 'Dark Excalibur (6)' : 'Excalibur (6)'; skBtn.s6.style.filter = DK.on ? 'hue-rotate(-60deg) saturate(1.6) brightness(.75)' : ''; }
}
function dkClear() {
  for (const b of DK.sw) { scene.remove(b.bl.g, b.og, b.ret, b.line); b.ret.material.dispose(); b.line.geometry.dispose(); b.line.material.dispose(); }
  DK.sw.length = 0;
}
function startDK3() {   // Skill 3 (Dark Mode): 5 lingkaran sihir di belakang Luis -> pedang kegelapan keluar -> mengunci target -> diluncurkan serentak
  audio.sfx('thud', { vol: 0.7, rate: 0.5 });
  SM.mode = 3; DK.snd = false;
  Object.assign(P, { sm: DK3.dur, smD: DK3.dur, atk: 0, cross: false, roll: 0 });
  for (const m of [slash.material, dMat, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
  dkClear();
  const pp = player.position, f = faceVec(), sd = new THREE.Vector3(f.z, 0, -f.x);
  const tg = [...enemies].filter(e => !e.dying && (state === 'play' || e.g.position.distanceTo(pp) < DK3.range)).sort((a, b) => a.g.position.distanceTo(pp) - b.g.position.distanceTo(pp));
  const lat = [-4.2, -2.1, 0, 2.1, 4.2], hh = [2.6, 3.7, 4.4, 3.7, 2.6];   // sayap lingkaran sihir di belakang pemain
  for (let i = 0; i < DK3.n; i++) {
    const e = tg.length ? tg[i % tg.length] : null;   // < 5 musuh: pedang dibagi rata (bisa lebih dari 1 pedang ke musuh yang sama)
    const c = pp.clone().addScaledVector(f, -0.6).addScaledVector(sd, lat[i]); c.y = hh[i];
    const fix = e ? e.g.position.clone() : pp.clone().addScaledVector(f, 14).addScaledVector(sd, lat[i] * 1.4);
    fix.y = e ? (e.dragon || e.golem ? 2.2 : 1) : 0.3;
    const og = new THREE.Group(), rg = makeAirCircle(DKP); og.add(rg.g); og.visible = false; og.position.copy(c); scene.add(og);
    const bl = makeBigBlade(DKP); bl.g.scale.setScalar(DK3.scale); bl.g.visible = false; scene.add(bl.g);
    const ret = new THREE.Group(), rm = glowMat(DKP.gold, 0);
    for (const gg of dkRetGeo) ret.add(new THREE.Mesh(gg, rm)); ret.add(new THREE.Mesh(dkRetIn, rm)); ret.rotation.x = -Math.PI / 2; ret.visible = false; ret.material = rm; scene.add(ret);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false })); line.frustumCulled = false; line.visible = false; scene.add(line);
    DK.sw.push({ i, e, er: e ? e.r : 0.9, c, og, rg, bl, ret, line, fix, d: f.clone(), want: new THREE.Vector3(), start: new THREE.Vector3(), end: new THREE.Vector3(), t: 0, ca: DK3.ca + i * DK3.step, ea: DK3.ca + i * DK3.step + 0.22, fl: false, imp: false });
  }
  pulse(DKP.gold, 3.5, 0.5); lineSparks(pp.clone().setY(0.2), 16, 6, 0.8, DKP.sparks);
}
function dkImpact(b, p) {
  const pos = new THREE.Vector3(p.x, 0.3, p.z);
  for (const e of [...enemies]) {
    const d = e.g.position.clone().sub(pos).setY(0), l = d.length(), dir = l > 0.01 ? d.normalize() : null;
    if (e === b.e) hurtEnemy(e, DK3.dmg, dir, 6, 'd3');
    else if (l < DK3.splashR + e.r) hurtEnemy(e, DK3.splash, dir, 10, 'd3');
  }
  if (!DK.snd) { DK.snd = true; audio.sfx('swordbreak', { vol: 0.9, rate: 0.8 }); }
  burst(pos.clone().setY(0.9), DKP.burst, 14, 7); burst(pos.clone().setY(0.7), 0x1a0008, 12, 6); lineSparks(pos.clone().setY(0.4), 30, 10, 1.2, DKP.sparks);
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(DKP.gold)); m.rotation.x = -Math.PI / 2; m.position.copy(pos).setY(0.1); scene.add(m); pulses.push({ m, t: 0.45, dur: 0.45, max: 3.4 });
  const m2 = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 48), new THREE.MeshBasicMaterial({ color: 0x08000a, transparent: true, side: THREE.DoubleSide, depthWrite: false })); m2.rotation.x = -Math.PI / 2; m2.position.copy(pos).setY(0.12); scene.add(m2); pulses.push({ m: m2, t: 0.5, dur: 0.5, max: 3.0 });
  const pr = new THREE.Mesh(bgeo.pillar, glowMat(DKP.gold, 0.9)), pk = new THREE.Mesh(bgeo.pillar, new THREE.MeshBasicMaterial({ color: 0x07000a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  pr.position.set(p.x, 6, p.z); pk.position.set(p.x, 6, p.z); pk.scale.set(0.7, 1, 0.7); scene.add(pr, pk); pillars.push({ m: pr, t: 0.4, dur: 0.4, s: 1 }, { m: pk, t: 0.4, dur: 0.4, s: 0.7 });   // pilar merah + inti hitam
  shake = Math.max(shake, 0.3);
}
function dkTick(dt) {
  DK.cd = Math.max(0, DK.cd - dt);
  // aura gelap di sekeliling Luis selama Dark Mode
  const on = DK.on && (state === 'play' || state === 'world');
  DK.em += ((on ? 1 : 0) - DK.em) * (1 - Math.exp(-dt * 6));
  dkLookTick();
  DK.aura.visible = DK.mist.visible = DK.sp2.visible = DK.em > 0.02;
  if (DK.aura.visible) {
    DK.pe += ((DK.pow > 0 ? 1 : 0) - DK.pe) * (1 - Math.exp(-dt * 8));
    DK.aura.material.opacity = Math.min(1, DK.em * (0.5 + 0.12 * Math.sin(P.t * 5) + 0.4 * DK.pe)); DK.aura.scale.setScalar(4.2 + 0.4 * Math.sin(P.t * 3) + 3.5 * DK.pe);
    DK.mist.material.opacity = DK.em * 0.55;
    DK.sp2.position.set(player.position.x, player.position.y + 0.05, player.position.z);
    DK.sp2.children.forEach((c, i) => { c.rotation.y += dt * c.userData.sp * (3 + 4 * DK.pe); c.material.opacity = Math.min(1, DK.em * (0.7 + 0.2 * Math.sin(P.t * 4 + i))); });
  }
  DK.badge.style.display = DK.on ? 'block' : 'none';
  if (on && P.hp > 0) {   // harga Dark Mode: HP terkuras 1% per detik
    const lo = DKB.lethal ? 0 : 1; P.hp = Math.max(lo, P.hp - P.max * DKB.drain * dt);
    if (DKB.lethal && P.hp <= 0) end(false);
  }
  if (DK.pow > 0) { DK.pow -= dt; DK.pT += dt; if (DK.pow <= 0) dkPowEnd(); else dkPowFx(dt); }
  const bt = DK.pow > 0 ? '🩸 PENGUATAN ' + DK.pow.toFixed(1) + 's' : '🌑 DARK MODE'; if (bt !== DK.bt) { DK.bt = bt; DK.badge.textContent = bt; }
  if (on && Math.random() < dt * 16) lineSparks(player.position.clone().add(_dkA.set(rnd(-0.7, 0.7), rnd(0.1, 1.2), rnd(-0.7, 0.7))), 1, 3, 3, DKP.sparks);
  // 5 pedang kegelapan
  const E = k => 1 - Math.pow(1 - clamp01(k), 3), L = 3.5 * DK3.scale;
  for (const b of [...DK.sw]) {
    b.t += dt; const t = b.t, bl = b.bl, A = _dkA;
    if (b.e && enemies.includes(b.e) && !b.e.dying) { b.fix.copy(b.e.g.position); b.fix.y = b.e.dragon || b.e.golem ? 2.2 : 1; }   // ikuti target sampai diluncurkan
    A.copy(b.fix);
    const ca = clamp01((t - b.ca) / 0.3), ek = E((t - b.ea) / DK3.emerge), fk = (t - DK3.launch) / DK3.fly, lkT = DK3.lock + b.i * 0.03;
    if (!b.fl) { b.want.copy(A).sub(b.c).normalize(); b.d.lerp(b.want, 1 - Math.exp(-dt * 9)).normalize(); }
    // lingkaran sihir (berputar, menghadap arah target), memudar setelah pedang melesat
    const post = t > DK3.launch ? clamp01((t - DK3.launch - 0.1) / 0.35) : 0;
    b.og.visible = ca > 0 && post < 1;
    b.og.position.copy(b.c); b.og.lookAt(_dkB.copy(b.c).add(b.d)); b.og.scale.setScalar(2.0 * (0.4 + 0.6 * E(ca)) * (1 - 0.5 * post));
    b.rg.g.rotation.z += dt * (2.2 + 4 * clamp01((t - lkT) / 0.4)); b.rg.m.opacity = 0.95 * ca * (1 - post) * (0.78 + 0.22 * Math.sin(t * 18 + b.i));
    // pedang: keluar dari lingkaran -> melayang & mengunci -> melesat
    let a = clamp01(ek * 1.4), lk = clamp01((t - lkT) / Math.max(0.05, DK3.launch - lkT)), tip = _dkP;
    if (!b.fl) {
      tip.copy(b.c).addScaledVector(b.d, L * ek + Math.sin(t * 14 + b.i) * 0.04 * lk);
      if (t >= DK3.launch) { b.fl = true; b.start.copy(tip); }
    }
    if (b.fl) {
      const k = clamp01(fk); b.end.copy(A);
      tip.copy(b.start).lerp(b.end, Math.pow(k, 1.7)); if (k < 1) b.d.copy(b.end).sub(b.start).normalize();
      if (k < 1) lineSparks(tip, 2, 4, 0.5, DKP.sparks);
      if (k >= 1 && !b.imp) { b.imp = true; dkImpact(b, b.end); }
      lk = 1; if (b.imp) a = 1 - clamp01((t - DK3.launch - DK3.fly) / 0.3);
    }
    bl.g.visible = a > 0.01; bl.g.position.copy(tip); bl.g.quaternion.setFromUnitVectors(DOWN, b.d);
    bl.steel.opacity = bl.gold.opacity = a; bl.steel.emissiveIntensity = 1.2 + 3 * lk;
    bl.aura.opacity = a * (0.25 + 0.6 * lk); bl.halo.material.opacity = a * (0.35 + 0.5 * lk) * (0.88 + 0.12 * Math.sin(t * 24)); bl.halo.scale.setScalar(5 + 3 * lk);
    // penanda kunci target: reticle berputar di tanah + garis merah dari pedang ke target
    const lockVis = t >= lkT && !b.imp;
    b.ret.visible = b.line.visible = lockVis;
    if (lockVis) {
      const q = clamp01((t - lkT) / 0.3);
      b.ret.position.set(A.x, 0.09, A.z); b.ret.rotation.z = t * 3; b.ret.scale.setScalar((b.er + 0.9) * (1 + 1.2 * (1 - E(q))));
      b.ret.material.opacity = 0.9 * q * (0.8 + 0.2 * Math.sin(t * 30));
      const ar = b.line.geometry.attributes.position.array; ar[0] = tip.x; ar[1] = tip.y; ar[2] = tip.z; ar[3] = A.x; ar[4] = A.y; ar[5] = A.z; b.line.geometry.attributes.position.needsUpdate = true;
      b.line.material.opacity = 0.75 * q * (0.7 + 0.3 * Math.sin(t * 40));
    }
    if (t > DK3.launch + DK3.fly + 0.5) { scene.remove(bl.g, b.og, b.ret, b.line); b.ret.material.dispose(); b.line.geometry.dispose(); b.line.material.dispose(); DK.sw.splice(DK.sw.indexOf(b), 1); }
  }
}
function smPose(dt) {
  if (SM.mode === 4) { bfPose(dt); return; }
  // mengangkat dua pedang ke atas (memanggil) -> menghentak ke depan
  const D = P.smD || SM.dur, u = clamp01((D - P.sm) / D), spl = P.smD ? 0.72 : 0.5;   // Dark Blades: panggil lebih lama, menghentak tepat saat pedang diluncurkan
  if (vrm) vrm.scene.position.y += (-0.05 - vrm.scene.position.y) * (1 - Math.exp(-dt * 26));
  if (!bones) return;
  const b = bones, kb = 1 - Math.exp(-dt * 20), kf = 1 - Math.exp(-dt * 26), k = 1 - Math.exp(-dt * 14);
  if (u < spl) { // memanggil: kedua lengan terangkat tinggi, badan condong ke belakang, kepala menengadah
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
  for (const m of [slash.material, dMat, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
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

// ---------- Skill 5: Dash Petir (Lightning Dash) ----------
// Alur (tombol 5): KUNCI target terdekat (reticle belah ketupat) -> ISI petir sebentar -> mode LARI PETIR selama PT.buffT (5 dtk): lari jauh lebih cepat + aura petir,
// target terkunci terus (otomatis pindah ke musuh terdekat kalau target mati), dan SETIAP serangan dasar (Space / tombol serang) berubah jadi terjang petir:
// TERJANG LURUS dengan kecepatan sangat tinggi (FOV melebar, jejak petir panjang, busur petir di badan) menembus target dan berhenti di titik TERJAUH di seberangnya
// -> tiap musuh yang dilewati garis terjang kena TEBASAN X, lalu sambaran PETIR dari langit tepat di posisinya (ledakan, retakan lantai, serpihan).
// Semua angka bisa diubah di PT. Tidak ada target = menerjang lurus ke depan sejauh PT.noTgt.
const PT = {
  range: 28,        // jarak maksimal mengunci target
  buffT: 5,         // lama mode Lari Petir (detik)
  runMul: 3,      // pengali kecepatan lari selama mode aktif
  charge: 0.4,      // lama mengisi saat mengaktifkan skill (detik)
  dashWind: 0.12,   // aba-aba singkat sebelum tiap terjang (serangan dasar)
  speed: 46,        // kecepatan rata-rata terjang (satuan/detik)
  over: 6.5,        // seberapa jauh melewati target (dari tepi target) = titik berhenti
  noTgt: 13,        // jarak terjang kalau tidak ada target
  rec: 0.4,         // jeda pemulihan setelah terjang
  hitR: 1.25,       // kelonggaran kena (ditambah radius musuh)
  dmg1: 30,         // tebasan X (serangan dasar diperkuat)
  dmg2: 26,         // sambaran petir (ke musuh yang ditebas)
  dmg3: 18,         // sambaran petir (musuh lain di sekitar)
  strikeDelay: 0.22, strikeR: 3.4,
  buff: 0, acq: 0, chg: 0.4, after: 'buff', ph: '', t: 0, tgt: null, S: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), L: 0, s: 0, dur: 0.3, hit: new Set(),
  flash: 0, fk: 0, hold: 0, ra: 0, rt: 0, rpos: new THREE.Vector3(), rbase: 3
};
SK.s5 = { cd: 14, t: 0 }; // 5 dtk aktif + 9 dtk jeda

// tombol layar sentuh ke-5: dibuat otomatis dengan menggandakan tombol skill 4 (kalau index.html sudah punya tombol data-a="s5", yang itu dipakai)
skBtn.s5 = document.querySelector('[data-a=s5]');
if (!skBtn.s5) {
  const b4 = skBtn.s4; let nb = null;
  if (b4 && b4.parentNode) {
    nb = b4.cloneNode(true); nb.dataset.a = 's5'; nb.title = 'Dash Petir (5)';
    const w = document.createTreeWalker(nb, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) n.nodeValue = n.nodeValue.replace('4', '5');
    if (!/5/.test(nb.textContent)) nb.textContent = '⚡';
    b4.parentNode.appendChild(nb);
  }
  skBtn.s5 = nb || document.createElement('button');
}

// ---- efek suara (file mp3 ditaruh sefolder dengan game.js; volume mengikuti slider efek di pengaturan) ----
const ptSnd = { run: new Audio('petir_berlari.mp3'), dash: new Audio('petir_menerjang.mp3'), strike: new Audio('petir_menyambar.mp3') };
for (const k in ptSnd) ptSnd[k].preload = 'auto';
ptSnd.run.loop = true; // petir_berlari.mp3: diputar berulang selama mode Lari Petir aktif
function ptPlay(k, vol = 1) { try { const a = ptSnd[k].cloneNode(); a.volume = Math.max(0, Math.min(1, audio.sfxVolume * vol)); a.play().catch(() => {}); } catch (e) { /* abaikan */ } }

// ---- tekstur & bahan bersama ----
const ptTexC = {};
function ptTex(k) {
  if (ptTexC[k]) return ptTexC[k];
  const c = document.createElement('canvas'), x = c.getContext('2d');
  if (k === 'ret') { // reticle kunci target: belah ketupat + tanda silang (seperti gambar referensi)
    c.width = c.height = 256; x.translate(128, 128); x.lineCap = 'round'; x.shadowColor = '#8a2dff'; x.shadowBlur = 16; x.strokeStyle = '#efe4ff';
    const dia = (r, w) => { x.lineWidth = w; x.beginPath(); x.moveTo(0, -r); x.lineTo(r, 0); x.lineTo(0, r); x.lineTo(-r, 0); x.closePath(); x.stroke(); };
    dia(84, 6); dia(34, 4);
    x.lineWidth = 4;
    for (let i = 0; i < 4; i++) { x.rotate(Math.PI / 2); x.beginPath(); x.moveTo(0, -124); x.lineTo(0, -98); x.moveTo(0, -24); x.lineTo(0, -8); x.stroke(); }
    x.beginPath(); x.arc(0, 0, 4, 0, 7); x.fillStyle = '#fff'; x.fill();
  } else if (k === 'slash') { // goresan tebasan: lensa tipis, ekor ungu -> kepala putih
    c.width = 256; c.height = 64;
    const g = x.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(140,70,255,0)'); g.addColorStop(0.4, 'rgba(180,130,255,.85)'); g.addColorStop(0.75, '#ffffff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.shadowColor = '#9a4dff'; x.shadowBlur = 10;
    x.beginPath(); x.moveTo(4, 32); x.quadraticCurveTo(150, 6, 252, 32); x.quadraticCurveTo(150, 58, 4, 32); x.fill();
  } else { // cahaya bulat
    c.width = c.height = 128; const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(190,150,255,.6)'); g.addColorStop(1, 'rgba(120,60,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (ptTexC[k] = t);
}
const ptSprMat = (k, o = {}) => new THREE.SpriteMaterial({ map: ptTex(k), transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, ...o });
const ptRingG = new THREE.RingGeometry(0.955, 1, 64), ptBoxG = new THREE.BoxGeometry(1, 1, 1);
const ptBolts = [], ptV = [], ptEv = [];
const ptLight = new THREE.PointLight(0xa070ff, 0, 18, 2); scene.add(ptLight); // kilatan cahaya petir
const ptCR = new THREE.Mesh(ptRingG, glowMat(0xb98cff, 0.8)), ptCR2 = new THREE.Mesh(ptRingG, glowMat(0xefe4ff, 0.7)); // cincin petir di kaki saat mengisi
ptCR.rotation.x = ptCR2.rotation.x = -Math.PI / 2; ptCR.visible = ptCR2.visible = false; scene.add(ptCR, ptCR2);
const ptRet = new THREE.Sprite(ptSprMat('ret', { opacity: 0 })); ptRet.visible = false; ptRet.renderOrder = 40; scene.add(ptRet); // reticle kunci target

// ---- petir bergerigi (a -> b). glow = lapisan tebal ungu, core = inti putih. Hanya hidup sebentar lalu memudar ----
function ptBolt(a, b, o = {}) {
  const seg = o.seg || 8, jit = o.jit ?? 0.5, w = o.w || 0.05, life = o.life || 0.2, fork = o.fork || 0;
  const d = b.clone().sub(a), len = d.length(); if (len < 1e-3) return;
  const dn = d.clone().divideScalar(len), p1 = new THREE.Vector3().crossVectors(dn, Math.abs(dn.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize(), p2 = new THREE.Vector3().crossVectors(dn, p1);
  const pts = [a.clone()];
  for (let i = 1; i < seg; i++) pts.push(a.clone().addScaledVector(d, i / seg).addScaledVector(p1, rnd(-1, 1) * jit).addScaledVector(p2, rnd(-1, 1) * jit));
  pts.push(b.clone());
  const g = new THREE.Group(), mG = glowMat(o.glow ?? 0xa23cff, 0.55), mC = glowMat(o.core ?? 0xf3e6ff, 1);
  for (let i = 0; i < seg; i++) {
    const p = pts[i], q = pts[i + 1], l = p.distanceTo(q); if (l < 1e-4) continue;
    for (const [m, k] of [[mG, 3.4], [mC, 1]]) { const s = new THREE.Mesh(ptBoxG, m); s.position.copy(p).add(q).multiplyScalar(0.5); s.lookAt(q); s.scale.set(w * k, w * k, l + w * k); g.add(s); }
    if (fork && Math.random() < fork) ptBolt(p, p.clone().add(new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.3), rnd(-1, 1)).normalize().multiplyScalar(len * rnd(0.12, 0.28))), { seg: 4, jit: jit * 0.6, w: w * 0.6, life: life * 0.8, glow: o.glow, core: o.core });
  }
  scene.add(g); ptBolts.push({ g, mats: [mG, mC], life, max: life });
}
function ptAdd(o, dur, upd, delay = 0) { scene.add(o); o.visible = delay <= 0; ptV.push({ o, t: -delay, dur, upd }); } // efek sementara: upd(k 0..1)
function ptRing(pos, dir, r1, dur, o = {}) { // cincin cahaya mengembang (dir = arah hadap cincin; tanpa dir = rebah di lantai)
  const m = new THREE.Mesh(ptRingG, glowMat(o.c ?? 0xcdb4ff, 0.9)); m.position.copy(pos);
  if (dir) m.lookAt(pos.clone().add(dir)); else m.rotation.x = -Math.PI / 2;
  ptAdd(m, dur, k => { const e = 1 - Math.pow(1 - k, 3); m.scale.setScalar(r1 * (0.15 + 0.85 * e)); m.material.opacity = 0.9 * (1 - k); }, o.delay || 0);
}
function ptSlashX(c, sc) { // tebasan silang "X" menghadap kamera + kilatan
  const base = Math.random() * 0.4 - 0.2;
  [[0.62 + base, 0], [-0.62 + base, 0.06]].forEach(([ang, dl]) => {
    const s = new THREE.Sprite(ptSprMat('slash', { rotation: ang })); s.position.copy(c); s.renderOrder = 30;
    ptAdd(s, 0.34, k => { const w = 1 - Math.pow(1 - Math.min(1, k / 0.25), 3); s.scale.set(7.5 * sc * w + 0.01, 0.9 * sc * (1 - 0.5 * k) + 0.01, 1); s.material.opacity = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7; }, dl);
  });
  const g = new THREE.Sprite(ptSprMat('glow')); g.position.copy(c); g.renderOrder = 29;
  ptAdd(g, 0.28, k => { g.scale.setScalar((2 + 5 * k) * sc); g.material.opacity = 0.9 * (1 - k); });
}

// ---- mulai / akhir ----
function ptAcquire() { // target = musuh terdekat, yang searah hadap pemain diprioritaskan
  const f = faceVec(); let best = null, bs = 1e9;
  for (const e of enemies) {
    if (e.dying) continue;
    const d = e.g.position.clone().sub(player.position).setY(0), l = d.length(); if (l > PT.range || l < 0.05) continue;
    const sc = l * (1.8 - 0.8 * d.divideScalar(l).dot(f)); if (sc < bs) { bs = sc; best = e; }
  }
  return best;
}
function ptLockOn(e) { // reticle mulai mengunci musuh e
  PT.tgt = e; PT.rt = 0; if (!e) return;
  PT.rbase = Math.min(7, Math.max(2.6, 2 + e.r * 1.6)); PT.rpos.copy(e.g.position).setY(e.dragon || e.golem ? 3 : 1.4);
}
function startPT(dash) { // dash = false: aktifkan skill (isi petir lalu mode Lari Petir) | dash = true: serangan dasar saat mode aktif -> terjang
  const cur = PT.tgt && enemies.includes(PT.tgt) && !PT.tgt.dying && PT.tgt.g.position.distanceTo(player.position) <= PT.range * 1.2 ? PT.tgt : null;
  const best = dash && cur ? cur : ptAcquire();
  if (best !== PT.tgt) ptLockOn(best);
  Object.assign(PT, { ph: 'charge', t: 0, after: dash ? 'dash' : 'buff', chg: dash ? PT.dashWind : PT.charge, hold: 0, ra: best ? PT.ra : 0 }); PT.hit.clear();
  Object.assign(P, { pt: 1, atk: 0, cross: false, roll: 0 });
  for (const m of [slash.material, dMat, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
  if (best) { const d = best.g.position.clone().sub(player.position); P.face = Math.atan2(d.x, d.z); }
  pulse(0x8a2dff, 3, 0.4); lineSparks(player.position.clone().setY(0.1), dash ? 8 : 16, 5, 0.7); shake = Math.max(shake, 0.15);
}
function ptBuffOn() { // selesai mengisi: mode Lari Petir aktif
  PT.buff = PT.buffT; PT.acq = 0; endPT();
  pulse(0xb98cff, 5, 0.5); ptRing(player.position.clone().setY(0.1), null, 6, 0.5); ptRing(player.position.clone().setY(1), UP, 3.5, 0.5, { c: 0xffffff, delay: 0.05 });
  lineSparks(player.position.clone().setY(0.2), 40, 10, 1.2); shake = Math.max(shake, 0.4); PT.flash = 1;
  try { ptSnd.run.currentTime = 0; ptSnd.run.volume = Math.min(1, audio.sfxVolume * 0.7); ptSnd.run.play().catch(() => {}); } catch (e) { /* abaikan */ }
  toast('⚡ Lari Petir aktif ' + PT.buffT + ' dtk! Lari lebih cepat, serangan dasar = terjang petir', 2800);
}
function endPT() {
  if (!P.pt) return;
  P.pt = 0; PT.ph = ''; PT.hold = 0.5; P.drawT = DRAW_HOLD; ptCR.visible = ptCR2.visible = false;
}
function beginDash(T) { // garis terjang DIKUNCI sekarang: lurus dari pemain, menembus target, berhenti di titik terjauh
  const S = player.position.clone().setY(0), dir = new THREE.Vector3();
  let L;
  if (T) { dir.copy(T.g.position).sub(S).setY(0); const dl = dir.length(); if (dl < 1e-3) dir.copy(faceVec()); else dir.divideScalar(dl); L = Math.max(4, dl + T.r + PT.over); }
  else { dir.copy(faceVec()); L = PT.noTgt; }
  if (state === 'play') { // dalam arena bundar: titik berhenti dijepit di dalam dinding
    const Rr = R - 1.6, b = S.x * dir.x + S.z * dir.z, c = S.x * S.x + S.z * S.z - Rr * Rr, disc = b * b - c;
    if (disc > 0) L = Math.min(L, Math.max(3, -b + Math.sqrt(disc)));
  }
  if (exploreMode && dgX) L = Math.max(0.5, dgX.dashLen(S, dir, L, PLAYER_R + 0.35));   // dungeon jelajah: boleh menembus tembok, tapi mendarat di lantai kosong & berhenti sebelum gerbang / pintu keluar
  PT.S.copy(S); PT.dir.copy(dir); PT.L = L; PT.s = 0; PT.dur = Math.min(0.6, Math.max(0.22, L / PT.speed)); PT.ph = 'dash'; PT.t = 0; P.pt = 2;
  P.face = Math.atan2(dir.x, dir.z);
  const c0 = player.position.clone().setY(1);
  ptRing(c0, dir, 4.5, 0.35); ptRing(c0.clone().addScaledVector(dir, 1.2), dir, 7, 0.45, { c: 0x9a6bff, delay: 0.04 });
  pulse(0xb98cff, 4.5, 0.4); lineSparks(player.position.clone().setY(0.3), 34, 11, 0.9); ptPlay('dash'); shake = Math.max(shake, 0.5); PT.flash = 1;
  ptLight.position.set(c0.x, 1.5, c0.z);
  ptCR.visible = ptCR2.visible = false;
}
function ptHit(e) { // kena: tebasan X sekarang, sambaran petir sebentar kemudian
  hurtEnemy(e, PT.dmg1, PT.dir.clone(), 16);
  const c = e.g.position.clone().setY(e.dragon || e.golem ? 3 : 1.3), sc = Math.max(1, e.r * 0.9);
  ptSlashX(c, sc); ptRing(c, PT.dir, 5 + e.r * 2, 0.4, { c: 0xd9c6ff });
  lineSparks(c, 24, 10, 1.2); shake = Math.max(shake, 0.45); PT.flash = 1; ptLight.position.copy(c);
  ptEv.push({ t: PT.strikeDelay, fn: () => ptStrike(e, c) });
}
function ptStrike(e, c) { // sambaran petir dari langit
  const alive = enemies.includes(e), p = (alive ? e.g.position : c).clone().setY(0), top = p.clone().add(new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1))).setY(18);
  ptBolt(top, p, { seg: 14, jit: 1.1, w: 0.16, life: 0.4, fork: 0.3 });
  ptBolt(top.clone().add(new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1))), p, { seg: 12, jit: 0.8, w: 0.07, life: 0.3, fork: 0.2 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + rnd(-0.3, 0.3); ptBolt(p.clone().setY(0.08), p.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rnd(2.5, 5))).setY(0.08), { seg: 6, jit: 0.35, w: 0.05, life: 0.35 }); } // retakan petir di lantai
  ptRing(p.clone().setY(0.1), null, 5.5, 0.45); ptRing(p.clone().setY(0.1), null, 3.2, 0.3, { c: 0xffffff, delay: 0.05 });
  ptAdd((() => { const s = new THREE.Sprite(ptSprMat('glow')); s.position.copy(p).setY(1.2); s.renderOrder = 29; return s; })(), 0.35, (k, s) => { s.scale.setScalar(4 + 7 * k); s.material.opacity = 0.95 * (1 - k); });
  lineSparks(p.clone().setY(0.4), 46, 12, 1.8); burst(p.clone().setY(0.5), 0x5a4a86, 14, 8); burst(p.clone().setY(1), 0xf3e6ff, 12, 7);
  PT.flash = 1; ptLight.position.copy(p).setY(3); ptPlay('strike'); shake = Math.max(shake, 0.85);
  if (alive) hurtEnemy(e, PT.dmg2, PT.dir.clone(), 8);
  for (const o of [...enemies]) { // musuh lain di dekat sambaran
    if (o === e || o.dying) continue;
    const d = o.g.position.clone().sub(p).setY(0);
    if (d.length() < PT.strikeR + o.r) hurtEnemy(o, PT.dmg3, d.normalize(), 10);
  }
}

// ---- per frame saat skill aktif ----
function ptTick(dt) {
  PT.t += dt; P.inv = Math.max(P.inv, 0.2);
  let T = PT.tgt && enemies.includes(PT.tgt) && !PT.tgt.dying ? PT.tgt : null; const pp = player.position;
  if (!T && PT.buff > 0 && PT.ph === 'charge') { const n = ptAcquire(); if (n) { ptLockOn(n); T = n; } } // target mati saat aba-aba terjang: pindah ke musuh berikutnya, bukan terjang kosong
  if (PT.ph === 'charge') {
    if (T) { const d = T.g.position.clone().sub(pp); P.face = Math.atan2(d.x, d.z); } // terus menghadap target yang terkunci
    const u = clamp01(PT.t / PT.chg);
    for (let i = 0; i < 2; i++) if (Math.random() < 0.55 + 0.4 * u) { // busur petir merayap dari lantai ke badan
      const a = rnd(0, 6.283), r = 0.9 + 1.1 * (1 - u) * Math.random();
      ptBolt(new THREE.Vector3(pp.x + Math.cos(a) * r, 0.06, pp.z + Math.sin(a) * r), new THREE.Vector3(pp.x + rnd(-0.35, 0.35), rnd(0.3, 1.8), pp.z + rnd(-0.35, 0.35)), { seg: 5, jit: 0.22, w: 0.022, life: 0.14 });
    }
    if (Math.random() < 0.5) lineSparks(pp.clone().setY(0.1), 1, 4, 1.4);
    PT.flash = Math.max(PT.flash, 0.12 + 0.3 * u); ptLight.position.set(pp.x, 1.2, pp.z);
    if (PT.t >= PT.chg) { if (PT.after === 'buff') ptBuffOn(); else beginDash(T); }
  } else if (PT.ph === 'dash') {
    const u = clamp01(PT.t / PT.dur), s1 = PT.L * (1 - Math.pow(1 - u, 2)), ds = s1 - PT.s; PT.s = s1; // cepat sekali di awal, melambat di ujung
    const a = pp.clone(); pp.addScaledVector(PT.dir, ds); const b = pp.clone();
    ptBolt(a.clone().setY(1), b.clone().setY(1), { seg: 1, jit: 0, w: 0.13, life: 0.42, glow: 0x8a4dff }); // garis petir panjang di belakang
    ptBolt(a.clone().setY(0.35), b.clone().setY(0.35), { seg: 1, jit: 0, w: 0.05, life: 0.3, glow: 0x7a3dff });
    for (let i = 0; i < 2; i++) { // busur petir menyambar di sekeliling badan
      const o = new THREE.Vector3(b.x + rnd(-0.6, 0.6), rnd(0.2, 1.8), b.z + rnd(-0.6, 0.6));
      ptBolt(o, o.clone().add(new THREE.Vector3(rnd(-1.6, 1.6), rnd(-0.8, 1.2), rnd(-1.6, 1.6))).addScaledVector(PT.dir, -rnd(0.3, 2.2)), { seg: 5, jit: 0.25, w: 0.03, life: 0.18 });
    }
    lineSparks(b.clone().setY(0.2), 3, 7, 1.0);
    const ax = a.x, az = a.z, dx = b.x - ax, dz = b.z - az, l2 = dx * dx + dz * dz;
    for (const e of [...enemies]) { // tiap musuh yang dilewati garis terjang (diperiksa sepanjang ruas, jadi tidak tembus karena terlalu cepat)
      if (e.dying || PT.hit.has(e)) continue;
      const t = l2 > 1e-6 ? clamp01(((e.g.position.x - ax) * dx + (e.g.position.z - az) * dz) / l2) : 0;
      if (Math.hypot(e.g.position.x - (ax + dx * t), e.g.position.z - (az + dz * t)) < e.r + PT.hitR) { PT.hit.add(e); ptHit(e); }
    }
    PT.flash = Math.max(PT.flash, 0.5); ptLight.position.set(b.x, 1.5, b.z);
    if (u >= 1) { // mendarat di titik terjauh
      PT.ph = 'rec'; PT.t = 0; P.pt = 3; pulse(0xa23cff, 3.5, 0.4); lineSparks(pp.clone().setY(0.2), 30, 9, 0.9); shake = Math.max(shake, 0.25);
    }
  } else {
    if (T) { const d = T.g.position.clone().sub(pp); P.face = Math.atan2(d.x, d.z); } // setelah mendarat: berbalik menghadap musuh
    if (PT.t < 0.25 && Math.random() < 0.5) lineSparks(pp.clone().setY(0.15), 1, 5, 1.2);
    if (PT.t >= PT.rec) endPT();
  }
}
function ptPose(dt) { // badan: kuda-kuda lari (isi) -> membungkuk lurus seperti anak panah (terjang) -> meluncur & bangkit (pulih)
  if (!bones) return;
  const b = bones, kb = 1 - Math.exp(-dt * 26), k = 1 - Math.exp(-dt * 16), kg = 1 - Math.exp(-dt * 22);
  let ly = 0;
  if (PT.ph === 'charge') {
    const u = clamp01(PT.t / PT.chg), tr = 0.03 * Math.sin(P.t * 70) * u; ly = -0.12 * u;
    pose(b.spine, 0.5 + tr, -0.25, 0, kb); pose(b.chest, 0.1, -0.2, 0, kb); pose(b.hips, 0.25, 0.3, 0, kb);
    pose(b.lUL, -1.0, 0, 0.45, kb); pose(b.rUL, 0.45, 0, -0.4, kb); pose(b.lLL, 1.3, 0, 0, kb); pose(b.rLL, 0.55, 0, 0, kb);
    pose(b.rUA, 1.0, 0, 0.9, kb); pose(b.lUA, -0.6, 0, -0.9, kb); pose(b.rLA, 0, 0.4, 0, k); pose(b.lLA, 0, -0.6, 0, k);
    pose(b.head, -0.25, 0.1, 0, k);
  } else if (PT.ph === 'dash') {
    ly = 0.05;
    pose(b.spine, 1.05, 0, 0, kb); pose(b.chest, 0.15, 0, 0, kb); pose(b.hips, 0.35, 0, 0, kb);
    pose(b.lUL, 0.9, 0, 0.1, kb); pose(b.rUL, 0.5, 0, -0.1, kb); pose(b.lLL, 1.4, 0, 0, kb); pose(b.rLL, 0.9, 0, 0, kb);
    pose(b.rUA, 1.3, 0, 0.6, kb); pose(b.lUA, 1.3, 0, -0.6, kb); pose(b.rLA, 0, 0.3, 0, k); pose(b.lLA, 0, -0.3, 0, k);
    pose(b.head, -0.85, 0, 0, k);
  } else {
    const u = clamp01(PT.t / PT.rec), cr = 1 - clamp01((u - 0.5) / 0.5); ly = -0.1 * cr;
    pose(b.spine, 0.6 * cr, 0.2 * cr, 0, kb); pose(b.chest, 0.05, 0, 0, kb); pose(b.hips, 0.2 * cr, 0, 0, kb);
    pose(b.lUL, -1.0 * cr, 0, 0.3 * cr, kb); pose(b.rUL, 0.5 * cr, 0, -0.3 * cr, kb); pose(b.lLL, 1.4 * cr, 0, 0, kb); pose(b.rLL, 0.9 * cr, 0, 0, kb);
    pose(b.rUA, 0.2, 0, 1.1, kb); pose(b.lUA, 0.2, 0, -1.0, kb); pose(b.rLA, 0, 0.3, 0, k); pose(b.lLA, 0, -0.3, 0, k);
    pose(b.head, -0.1, 0, 0, k);
  }
  if (vrm) vrm.scene.position.y += (ly - vrm.scene.position.y) * kg;
}

// ---- efek yang tetap jalan walau skill sudah selesai (petir, ring, sambaran tertunda, reticle, FOV) ----
function ptFxTick(dt) {
  for (const v of [...ptEv]) { v.t -= dt; if (v.t <= 0) { ptEv.splice(ptEv.indexOf(v), 1); v.fn(); } }
  for (const bl of [...ptBolts]) {
    bl.life -= dt; const k = Math.max(0, bl.life / bl.max);
    bl.mats[0].opacity = 0.55 * k * (0.6 + 0.4 * Math.random()); bl.mats[1].opacity = k * (0.7 + 0.3 * Math.random());
    if (bl.life <= 0) { scene.remove(bl.g); bl.mats.forEach(m => m.dispose()); ptBolts.splice(ptBolts.indexOf(bl), 1); }
  }
  for (const v of [...ptV]) {
    v.t += dt; if (v.t < 0) continue; v.o.visible = true;
    const k = v.t / v.dur;
    if (k >= 1) { scene.remove(v.o); v.o.traverse(c => { if (c.material && c.material.dispose) c.material.dispose(); }); ptV.splice(ptV.indexOf(v), 1); continue; }
    v.upd(k, v.o);
  }
  PT.flash = Math.max(0, PT.flash - dt * 3.5); ptLight.intensity = PT.flash * 170;
  const want = (P.pt === 2 || P.ex === 4) ? 1 : 0; // FOV melebar saat menerjang
  PT.fk += (want - PT.fk) * (1 - Math.exp(-dt * (want ? 18 : 6)));
  if (!want && PT.fk < 0.002) { PT.fk = 0; if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } }
  else { cam.fov = 50 + 14 * PT.fk; cam.updateProjectionMatrix(); }
  if (P.pt === 1) { // cincin petir di lantai saat mengisi
    const u = clamp01(PT.t / PT.chg), e = 1 - Math.pow(1 - u, 2);
    ptCR.visible = ptCR2.visible = true; ptCR.position.set(player.position.x, 0.06, player.position.z); ptCR2.position.copy(ptCR.position);
    ptCR.scale.setScalar(0.4 + 1.9 * e); ptCR2.scale.setScalar(0.25 + 1.2 * e); ptCR.rotation.z += dt * 3; ptCR2.rotation.z -= dt * 5;
    ptCR.material.opacity = 0.4 + 0.5 * u; ptCR2.material.opacity = 0.3 + 0.5 * u;
  }
  if (PT.buff > 0) ptSnd.run.volume = Math.max(0, Math.min(1, audio.sfxVolume * 0.7 * Math.min(1, PT.buff / 0.4))); // mengikuti slider efek, memudar 0,4 dtk terakhir
  else if (!ptSnd.run.paused) ptSnd.run.pause();   // mode habis / game di-reset / kalah
  if (PT.buff > 0) { // mode Lari Petir: aura petir, jejak petir saat berlari, kunci otomatis ke musuh terdekat
    PT.buff -= dt; const pp = player.position, mvg = P.pt === 0 && P.v.length() > 1.5;
    if (PT.buff <= 0) { PT.buff = 0; toast('Lari Petir berakhir', 1200); }
    if (Math.random() < (mvg ? 0.85 : 0.35)) { const o = new THREE.Vector3(pp.x + rnd(-0.5, 0.5), rnd(0.1, 1.8), pp.z + rnd(-0.5, 0.5)); ptBolt(o, o.clone().add(new THREE.Vector3(rnd(-1.1, 1.1), rnd(-0.7, 0.7), rnd(-1.1, 1.1))), { seg: 4, jit: 0.2, w: 0.025, life: 0.15 }); }
    if (mvg) {
      lineSparks(pp.clone().setY(0.15), 1, 5, 1.0);
      if (Math.random() < 0.6) { const bk = P.v.clone().normalize().multiplyScalar(-rnd(1, 2.6)); ptBolt(pp.clone().setY(0.06), pp.clone().add(bk).setY(0.06), { seg: 3, jit: 0.15, w: 0.03, life: 0.25 }); }
    }
    PT.flash = Math.max(PT.flash, 0.16);
    { // target mati / terlalu jauh: LANGSUNG pindah kunci ke musuh terdekat berikutnya (dicek tiap frame, juga saat sedang menerjang)
      const ok = PT.tgt && enemies.includes(PT.tgt) && !PT.tgt.dying && PT.tgt.g.position.distanceTo(pp) <= PT.range * 1.2;
      if (!ok) ptLockOn(ptAcquire());
    }
    ptLight.position.set(pp.x, 1.3, pp.z);
  }
  // reticle kunci target: menyusut + berputar saat mengunci, lalu berdenyut; memudar bila target mati / skill selesai
  if (P.pt <= 0 && PT.hold > 0) PT.hold -= dt;
  const T = PT.tgt && enemies.includes(PT.tgt) && !PT.tgt.dying ? PT.tgt : null, live = !!T && (P.pt > 0 || PT.hold > 0 || PT.buff > 0);
  if (live) { PT.rt += dt; PT.ra = Math.min(1, PT.ra + dt * 8); PT.rpos.copy(T.g.position).setY(T.dragon || T.golem ? 3 : 1.4); } else PT.ra = Math.max(0, PT.ra - dt * 5);
  ptRet.visible = PT.ra > 0.01;
  if (ptRet.visible) {
    const kk = clamp01(PT.rt / 0.25), inv = (1 - kk) * (1 - kk);
    ptRet.position.copy(PT.rpos); ptRet.scale.setScalar(PT.rbase * (1 + inv * 1.2) * (1 + 0.05 * Math.sin(PT.rt * 16)));
    ptRet.material.rotation = inv * 1.4 + (P.pt === 2 ? 0.4 : 0); ptRet.material.opacity = PT.ra;
  }
}

// ---------- Skill 6: EXCALIBUR (tombol 6) ----------
// 4 tahap seperti gambar referensi:
//  1. Sword Fusion   - kedua pedang diangkat membentuk V, didekatkan sampai bilahnya MENEMPEL, lalu melebur jadi SATU pedang (song_of_broken_pines_sword_free.glb) yang DIGENGGAM kedua tangan + garis cahaya vertikal ke langit
//  2. Divine Charge  - pemain melayang, lingkaran sihir berputar, pita energi emas berputar mengelilingi, partikel & serpihan batu melayang, cahaya makin terang
//  3. Holy Release   - pedang diayun ke depan, bola cahaya di ujung pedang, gelombang kejut cahaya menyapu lantai arena, layar berkilat
//  4. Excalibur Impact - SINAR EMAS raksasa menerjang lurus ke depan memenuhi layar: semua musuh di lintasan terkena berulang kali, ledakan, serpihan batu, retakan, cincin kejut
// Arah sinar dikunci ke musuh terdekat (yang searah hadap diprioritaskan); tanpa musuh = lurus ke depan. Semua angka bisa diubah di EX.
const EX = {
  fuse: 1.4, charge: 1.7, rel: 0.45, imp: 1.5, rec: 0.6, // lama tiap tahap (detik)
  vee: 0.4,         // fusion, detik pertama: kedua pedang diangkat membentuk V
  join: 0.36,       // lalu kedua pedang didekatkan sampai bilahnya menempel (menempel di detik vee + join)
  fuseAt: 0.9,      // detik ke-berapa kedua pedang melebur jadi satu (sebelum itu bilahnya menempel & berkilat)
  hi: 0.85,         // tinggi tangan kanan saat pedang diangkat (kelipatan panjang lengan di atas bahu; makin besar makin tinggi, di atas ±0,9 lengan jadi lurus & tidak sampai)
  fwd: 0.15,        // jarak tangan ke depan badan (kecil = pedang lebih dekat ke kepala)
  rise: 0.03,       // tambahan naik saat charge
  swing: 2.5,       // sudut akhir ayunan (rad): 1.57 = pedang mendatar ke depan, 3.14 = menunjuk lurus ke bawah; 2.5 = menghunjam miring ke lantai di depan
  reach: 0.9,       // jarak tangan dari bahu saat mengayun (x panjang lengan; di atas ±0,95 lengan tidak sampai)
  len: 3.5,         // panjang pedang gabungan = kelipatan panjang lengan karakter (3.5 = sekitar 2 unit)
  range: 45,        // jarak maksimal mengunci arah ke musuh
  beamL: 90,        // panjang sinar
  beamR: 2.8,       // lebar lintasan yang terkena (ditambah radius musuh)
  tick: 0.18,       // selang damage berulang oleh sinar
  dmgFirst: 70,     // damage pertama kali musuh terkena sinar
  dmg: 45,          // damage tiap tick berikutnya (sinar 1,5 dtk = sekitar 8 tick)
  push: 10,         // dorongan ke arah sinar
  ph: 0, t: 0, tickT: 0, cr: 0, fused: false, clash: false, vis: false, fl: 0, hit: new Set(), dir: new THREE.Vector3(0, 0, 1), org: new THREE.Vector3()
};
SK.s6 = { cd: 45, t: 0 };
const exGo = n => { EX.ph = P.ex = n; EX.t = 0; };

// tombol layar sentuh ke-6 (menggandakan tombol skill 5; kalau index.html sudah punya data-a="s6", yang itu dipakai)
skBtn.s6 = document.querySelector('[data-a=s6]');
if (!skBtn.s6) {
  const bs = skBtn.s5 && skBtn.s5.parentNode ? skBtn.s5 : skBtn.s4; let nb = null;
  if (bs && bs.parentNode) {
    nb = bs.cloneNode(true); nb.dataset.a = 's6'; nb.title = 'Excalibur (6)';
    const w = document.createTreeWalker(nb, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) n.nodeValue = n.nodeValue.replace(/[45]/, '6');
    if (!/6/.test(nb.textContent)) nb.textContent = '✨';
    bs.parentNode.appendChild(nb);
  }
  skBtn.s6 = nb || document.createElement('button');
}

// ---- objek visual (dibuat sekali, disembunyikan sampai dipakai) ----
const exMat = (c, o = 0) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const _exA = new THREE.Vector3(), _exB = new THREE.Vector3(), _exT = new THREE.Vector3();
// pedang gabungan: DIPEGANG kedua tangan (tangan kanan dekat guard, tangan kiri di bawahnya), ujung ke atas -> diayun ke depan.
// Memakai song_of_broken_pines_sword_free.glb (taruh sefolder dengan louiss.vrm); kalau file tidak ada / gagal dimuat, dipakai pedang emas buatan kode (cadangan).
// Titik (0,0,0) pada exW = tempat tangan kanan; tangan kiri memegang di (0, EXS.up, 0).
const EXS = { glb: false, root: null, halo: null, main: null, mainE: 1, mats: [], y0: -9.8, h: 19.6, tip: 3.2 * 0.72, up: -0.25, ok: false, sy: 1.3, Ls: 0.6,
  r0: new THREE.Vector3(), l0: new THREE.Vector3(), tR: new THREE.Vector3(), tL: new THREE.Vector3(), dR: new THREE.Vector3(0, 1, 0), dL: new THREE.Vector3(0, 1, 0), fing: null, fingV: null };
const EXG = { file: 'song_of_broken_pines_sword_free.glb', low: 7.7, high: 8.3, metal: 0.6 };   // low / high = tinggi gagang (satuan model, sudah diukur) tempat tangan kanan / kiri memegang; metal = batas kilap logam (null = bawaan model)
const exW = new THREE.Group(), exB = makeBigBlade(); exB.g.rotation.x = Math.PI; exB.g.scale.setScalar(0.72); exB.g.position.y = 2.95 * 0.72; exW.add(exB.g); exW.visible = false; player.add(exW);
const exTip = out => { exW.updateWorldMatrix(true, false); return exW.localToWorld(out.set(0, EXS.tip, 0)); }; // ujung bilah dalam koordinat dunia
function exFit() {   // ukuran pedang GLB mengikuti panjang lengan model
  if (!EXS.glb) return;
  const s = EX.len * EXS.Ls / EXS.h;
  EXS.root.scale.setScalar(s); EXS.root.position.set(0, EXG.low * s, 0);   // tempat tangan kanan = titik asal exW
  EXS.tip = (EXG.low - EXS.y0) * s; EXS.up = (EXG.low - EXG.high) * s; EXS.halo.position.y = EXS.tip * 0.4;
}
new GLTFLoader().load(EXG.file, g => {
  try {
    const root = new THREE.Group(), bb = new THREE.Box3();
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox);
      const m = o.clone(); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.frustumCulled = false; root.add(m);   // rantai transform bawaan model (skala 0,01 + putaran) dibuang, geometri dipakai apa adanya
      for (const mt of [].concat(m.material)) {
        if (mt.transmission) mt.transmission = 0;   // permata kaca (transmission) berat di HP: jadi transparan biasa
        if (EXG.metal !== null && mt.metalness > EXG.metal) mt.metalness = EXG.metal;
        mt._o = mt.opacity; mt.transparent = true; if (!EXS.mats.includes(mt)) EXS.mats.push(mt);
        if (mt.emissiveMap && !EXS.main) { EXS.main = mt; EXS.mainE = mt.emissiveIntensity; }
      }
    });
    if (!root.children.length) throw new Error('model kosong');
    root.rotation.z = Math.PI;   // di model ujung bilah ada di -Y dan pommel di +Y: dibalik supaya ujung bilah ke atas (+Y)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    EXS.y0 = bb.min.y; EXS.h = bb.max.y - bb.min.y; EXS.root = root; EXS.halo = halo;
    exW.remove(exB.g); exW.add(root, halo); EXS.glb = true; exFit(); exPaintSword();
  } catch (e) { console.warn('Pedang fusion GLB gagal disiapkan, pakai pedang cadangan:', e); }
}, undefined, err => console.warn(EXG.file + ' gagal dimuat, Excalibur memakai pedang cadangan:', err));
function exSwordOp(op) { for (const m of EXS.mats) m.opacity = m._o * op; }   // memudar (khusus pedang GLB)
// garis cahaya vertikal ke langit
const exPG = new THREE.CylinderGeometry(1, 1, 70, 16, 1, true); exPG.translate(0, 35, 0);
const exPm = [exMat(0xffb52e), exMat(0xfff4cf)], exPc = exPm.map(m => new THREE.Mesh(exPG, m)), exPil = new THREE.Group();
exPil.add(...exPc); exPil.visible = false; scene.add(exPil);
// sinar Excalibur (3 lapis: inti putih, tengah emas, luar jingga) + cahaya di lantai sepanjang sinar
const exBG = new THREE.CylinderGeometry(1, 0.45, 1, 28, 1, true); exBG.rotateX(Math.PI / 2); exBG.translate(0, 0, 0.5);
const exBm = [exMat(0xff9a1a), exMat(0xffd45e), exMat(0xfffbe8)], exBc = exBm.map(m => new THREE.Mesh(exBG, m)), exBeam = new THREE.Group();
exBeam.add(...exBc); exBeam.visible = false; scene.add(exBeam);
const exGG = new THREE.PlaneGeometry(1, 1); exGG.rotateX(-Math.PI / 2); exGG.translate(0, 0, 0.5);
const exGround = new THREE.Mesh(exGG, exMat(0xffc040)); exGround.visible = false; scene.add(exGround);
// lingkaran sihir di lantai (2 lapis, berputar berlawanan)
const exC1 = makeSummonRing(), exC2 = makeSummonRing(); exC1.g.visible = exC2.g.visible = false; scene.add(exC1.g, exC2.g);
// pita energi emas berputar naik mengelilingi pemain
function exSpiralGeo(r0, r1, turns, h, W) {
  const N = 72, pos = [], col = [], idx = [], cA = new THREE.Color(0xffa820), cB = new THREE.Color(0xfff4cf);
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = turns * Math.PI * 2 * t, r = r0 + (r1 - r0) * t, y = h * Math.pow(t, 0.8), w = W * Math.sin(Math.PI * t) + 0.02, br = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8), cx = Math.cos(a), cz = Math.sin(a);
    for (const [o, m] of [[-1, 0], [0, 1], [1, 0]]) { pos.push(cx * (r + o * w), y, cz * (r + o * w)); const c = cA.clone().lerp(cB, m).multiplyScalar(br * (m ? 1 : 0.6)); col.push(c.r, c.g, c.b); }
    if (i < N) { const k = i * 3; idx.push(k, k + 1, k + 3, k + 1, k + 4, k + 3, k + 1, k + 2, k + 4, k + 2, k + 5, k + 4); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
}
const exSp = new THREE.Group(), exSpm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
[[1.5, 6.5, 1.1, 5.5, 0.7, 0], [2, 7.5, 0.9, 3.2, 0.55, 2.1], [1.2, 5, 1.4, 7.5, 0.45, 4.2], [3, 8.5, 0.8, 2, 0.5, 1], [1, 4, 1.6, 6.5, 0.35, 3.3]].forEach(([r0, r1, tu, h, W, ph]) => {
  const m = new THREE.Mesh(exSpiralGeo(r0, r1, tu, h, W), exSpm); m.rotation.y = ph; m.userData.sp = 0.8 + Math.random() * 0.8; exSp.add(m);
});
exSp.visible = false; scene.add(exSp);
// butiran cahaya emas melayang naik
const EXN = 240, exMg = new THREE.BufferGeometry(), exMp = new Float32Array(EXN * 3), exMs = [];
for (let i = 0; i < EXN; i++) exMs.push({ a: rnd(0, 6.28), r: rnd(0.8, 8), y: rnd(0, 9), vy: rnd(0.8, 2.6), w: rnd(0.6, 2) });
exMg.setAttribute('position', new THREE.BufferAttribute(exMp, 3));
const exMotes = new THREE.Points(exMg, new THREE.PointsMaterial({ map: haloTex, color: CP.ring3, size: 0.4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
exMotes.frustumCulled = false; exMotes.visible = false; scene.add(exMotes);
// bola cahaya di ujung pedang, lampu emas, kilat layar
const exOrb = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false })); exOrb.renderOrder = 36; exOrb.visible = false; scene.add(exOrb);
const exLight = new THREE.PointLight(0xffc860, 0, 45, 2); scene.add(exLight);
const exFlash = document.createElement('div');
exFlash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;mix-blend-mode:screen;background:radial-gradient(circle at 50% 55%,#fff8dc 0%,#ffd45e 45%,rgba(255,181,46,.15) 100%)';
document.body.appendChild(exFlash);
// serpihan batu: melayang saat mengisi, terlempar saat sinar dilepas
const exRocks = [], exRockG = new THREE.DodecahedronGeometry(0.25, 0), exRockM = new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.8, emissive: 0x6a4300, emissiveIntensity: 0.35 });
function exRock(pos, mode) {
  const m = new THREE.Mesh(exRockG, exRockM); m.scale.set(rnd(0.6, 1.8), rnd(0.5, 1.4), rnd(0.6, 1.8)); m.position.copy(pos); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); scene.add(m);
  exRocks.push({ m, mode, h: rnd(0.8, 3.6), v: new THREE.Vector3(), w: new THREE.Vector3(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)), life: 0, max: mode === 'float' ? 30 : 2.2 });
  if (exRocks.length > 70) { const o = exRocks.shift(); scene.remove(o.m); }
}
function exGlow(p, s0, s1, dur, op = 0.95) { // kilatan cahaya emas yang mengembang lalu memudar
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: CP.glow, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false })); sp.position.copy(p); sp.renderOrder = 35;
  ptAdd(sp, dur, k => { sp.scale.setScalar(s0 + (s1 - s0) * k); sp.material.opacity = op * (1 - k); });
}
const exGold = { glow: 0xffb52e, core: 0xfff4cf }; // warna petir emas untuk ptBolt


// ---- tema warna Excalibur: emas (biasa) <-> hitam-merah (Dark Mode). Animasi tetap sama, hanya warna / blending yang berganti ----
const _dkMul = new THREE.Color(0.22, 0.07, 0.09), exFlashBg = exFlash.style.background;
function exPaintSword() {   // pedang GLB (dan pedang cadangan) digelapkan + cahaya merah
  const d = DK.on;
  for (const mt of EXS.mats) {
    if (!mt._c0) { mt._c0 = mt.color.clone(); mt._e0 = mt.emissive.clone(); }
    if (d) { mt.color.copy(mt._c0).multiply(_dkMul); mt.emissive.setHex(mt.emissiveMap ? 0xff2030 : 0x40000a); }
    else { mt.color.copy(mt._c0); mt.emissive.copy(mt._e0); }
  }
  if (EXS.halo) EXS.halo.material.color.setHex(d ? 0xff2030 : 0xffffff);
  exB.steel.color.setHex(d ? DKP.white : HOLY.white); exB.steel.emissive.setHex(d ? DKP.deep : HOLY.deep); exB.gold.color.setHex(d ? DKP.trim : 0xffd34d); exB.gold.emissive.setHex(d ? DKP.trimE : 0x9a6400);
  exB.aura.color.setHex(d ? DKP.gold : HOLY.gold); exB.halo.material.color.setHex(d ? 0xff2030 : 0xffffff);
}
function exTheme(dark) {
  if (exTheme.cur === dark) return; exTheme.cur = dark;
  CP = dark ? DKP : HOLY; Object.assign(exGold, CP.bolt);
  const mat = (m, c, add) => { m.color.setHex(c); const bl = add ? THREE.AdditiveBlending : THREE.NormalBlending; if (m.blending !== bl) { m.blending = bl; m.needsUpdate = true; } };
  mat(exPm[0], dark ? 0xff1030 : 0xffb52e, true); mat(exPm[1], dark ? 0x8a0012 : 0xfff4cf, !dark);          // garis ke langit: merah terang + inti merah pekat
  mat(exBm[0], dark ? 0xe0001c : 0xff9a1a, true); mat(exBm[1], dark ? 0x8a0012 : 0xffd45e, !dark); mat(exBm[2], dark ? 0xff3a4a : 0xfffbe8, true);   // sinar: tepi merah terang, badan merah pekat, inti merah panas
  exPc.forEach((m, i) => m.renderOrder = dark ? 30 + i : 0); exBc.forEach((m, i) => m.renderOrder = dark ? 30 + i : 0);   // urutan gambar luar -> dalam supaya lapisan merah pekat tampil di atas tepi
  mat(exGround.material, dark ? 0xb00018 : 0xffc040, true);
  exOrb.material.color.setHex(dark ? 0xff2030 : 0xffffff); exLight.color.setHex(CP.light);
  exSpm.color.setHex(dark ? 0xff1830 : 0xffffff); exMotes.material.color.setHex(dark ? 0xff3040 : 0xffe08a);
  exRockM.emissive.setHex(dark ? 0x70000f : 0x6a4300);
  for (const r of [exC1, exC2]) r.m.color.setHex(CP.gold);
  exFlash.style.mixBlendMode = dark ? 'normal' : 'screen';
  exFlash.style.background = dark ? 'radial-gradient(circle at 50% 55%,rgba(255,70,80,.85) 0%,rgba(150,0,20,.8) 50%,rgba(70,0,10,.85) 100%)' : exFlashBg;
  exPaintSword();
}

// ---- tangan menggenggam pedang (IK memakai bhArm milik adegan peluk) ----
const exSt = new Map();   // status pose-biasa (Euler) tiap tulang lengan, supaya hasil IK tidak merusak interpolasi pose
function exPoseA(bn, x, y, z, k) {
  if (!bn) return; let st = exSt.get(bn); if (!st) { st = [bn.rotation.x, bn.rotation.y, bn.rotation.z]; exSt.set(bn, st); }
  bn.rotation.set(st[0], st[1], st[2]); pose(bn, x, y, z, k); st[0] = bn.rotation.x; st[1] = bn.rotation.y; st[2] = bn.rotation.z;
}
function exCapture() {   // ukur bahu & panjang lengan model, simpan posisi awal kedua tangan
  const b = bones; EXS.ok = false;
  if (!b || !b.rUA || !b.rLA || !b.rH || !b.lUA || !b.lLA || !b.lH) return;
  player.updateMatrixWorld(true);
  const L3 = n => player.worldToLocal(n.getWorldPosition(new THREE.Vector3()));
  const rs = L3(b.rUA), ls = L3(b.lUA), re = L3(b.rLA), rh = L3(b.rH), lh = L3(b.lH), lift = vrm ? vrm.scene.position.y : 0;
  EXS.sy = (rs.y + ls.y) / 2 - lift; EXS.Ls = rs.distanceTo(re) + re.distanceTo(rh);
  EXS.r0.copy(rh); EXS.l0.copy(lh); EXS.ok = EXS.Ls > 0.1; exFit();
}
const _hU = new THREE.Vector3(), _hF = new THREE.Vector3(), _hD = new THREE.Vector3(), _hA = new THREE.Vector3(), _hB = new THREE.Vector3();
const _sR = new THREE.Vector3(), _sL = new THREE.Vector3(), _sC = new THREE.Vector3(), _sW = new THREE.Vector3(), _sN = new THREE.Vector3();   // bantu: posisi bahu asli (ruang pemain) untuk ayunan lengan lurus
function exHold(ph, t, lift) {   // tentukan posisi/arah pedang gabungan (exW) + titik pegang & arah bilah kedua tangan; semua di ruang pemain
  const S = EXS, Ls = S.Ls, sy = S.sy + lift, eo = x => 1 - Math.pow(1 - clamp01(x), 3);
  const up = _hU.set(0, sy + EX.hi * Ls, EX.fwd * Ls);   // titik pegang tangan kanan saat pedang terangkat di depan wajah
  if (ph === 1 && t < EX.fuseAt) {   // KEDUA PEDANG ASLI: tangan naik membentuk V, lalu saling mendekat sampai bilahnya menempel
    const s1 = smo(t / EX.vee), s2 = smo((t - EX.vee) / EX.join), tl = 0.55 * (1 - s2);
    S.tR.copy(S.r0).lerp(_hA.set(-0.75 * Ls, sy + 0.45 * Ls, 0.3 * Ls), s1).lerp(_hB.copy(up).add(_hD.set(0, 0, 0.012)), s2);
    S.tL.copy(S.l0).lerp(_hA.set(0.75 * Ls, sy + 0.45 * Ls, 0.3 * Ls), s1).lerp(_hB.copy(up).add(_hD.set(0, -0.09, -0.012)), s2);
    S.dR.set(-tl, 1, 0.1).normalize(); S.dL.set(tl, 1, 0.1).normalize();   // bilah miring ke luar (V) -> tegak lurus sejajar saat menempel
    return;
  }
  const TH0 = Math.atan2(EX.fwd, EX.hi + EX.rise);   // pedang sedikit condong ke depan, searah lengan
  let th = TH0, sl = 1, lg = 1; _hF.copy(up);   // lg = skala jarak pegangan tangan kiri dari tangan kanan
  if (ph === 1) sl = smo((t - EX.fuseAt) / 0.3);   // tangan kiri bergeser turun ke pangkal gagang
  else if (ph === 2) _hF.y += EX.rise * Ls * eo(t / EX.charge * 1.5);
  else {
    // AYUNAN: lengan lurus + pedang = satu batang yang berputar di bahu (tangan selalu sejajar dengan bilah, pergelangan tidak menekuk)
    const r0 = Ls * Math.hypot(EX.hi + EX.rise, EX.fwd), r1 = Ls * EX.reach, e = ph === 3 ? eo(t / (EX.rel * 0.6)) : 1;
    th = TH0 + (EX.swing - TH0) * e; const r = r0 + (r1 - r0) * e;
    _hF.set(0, sy + r * Math.cos(th), r * Math.sin(th));   // posisi lama (dipakai di awal ayunan supaya gerakan tetap mulus)
    lg = 1 - 0.8 * e;   // tangan kiri makin dekat ke tangan kanan saat mengayun (supaya KEDUA siku bisa benar-benar lurus)
    const b = bones;
    if (S.ok && b && b.rUA && b.lUA) {
      // LENGAN LURUS: pakai posisi bahu yang ASLI (badan sudah condong ke depan), lalu hitung jarak tangan dari bahu = panjang lengan penuh.
      // Dengan begitu siku tidak menekuk sama sekali selama ayunan, hunjaman, dan saat kembali.
      player.updateMatrixWorld(true);
      player.worldToLocal(b.rUA.getWorldPosition(_sR)); player.worldToLocal(b.lUA.getWorldPosition(_sL));
      _sC.copy(_sR).add(_sL).multiplyScalar(0.5);
      const Lf = Ls * 1.01, u = _hD.set(0, Math.cos(th), Math.sin(th)), off = S.up * 0.2;   // Lf sedikit > panjang lengan => IK terkunci lurus
      _sW.copy(_sC).sub(_sR); let q = _sW.dot(u); const rR = -q + Math.sqrt(Math.max(0, q * q - _sW.lengthSq() + Lf * Lf));   // jarak pegangan agar lengan kanan lurus
      _sW.copy(_sC).sub(_sL); q = _sW.dot(u); const rL = -q - off + Math.sqrt(Math.max(0, q * q - _sW.lengthSq() + Lf * Lf));   // sama untuk lengan kiri (pegangan kiri sedikit di bawah)
      const rS = Math.max(rR, rL);
      _sN.copy(_sC).addScaledVector(u, rS);   // posisi pegangan baru: lengan lurus penuh
      _hF.lerp(_sN, e);
    }
    if (ph === 4) th += rnd(-0.012, 0.012);
  }
  exW.position.copy(_hF); exW.rotation.set(th, 0, 0);
  _hD.set(0, Math.cos(th), Math.sin(th));   // arah ujung pedang
  S.dR.copy(_hD); S.dL.copy(_hD);
  S.tR.copy(_hF); S.tR.z += 0.012 * (1 - sl);
  _hA.copy(_hF).addScaledVector(_hD, S.up * lg);   // pegangan tangan kiri (lebih dekat ke pommel)
  _hB.copy(up); _hB.y -= 0.09; _hB.z -= 0.012;
  S.tL.copy(_hB).lerp(_hA, sl);
}
const _gT = new THREE.Vector3(), _gP = new THREE.Vector3(), _gV1 = new THREE.Vector3(), _gV2 = new THREE.Vector3();
const _gQ = new THREE.Quaternion(), _gQ1 = new THREE.Quaternion(), _gQ2 = new THREE.Quaternion(), _gQ3 = new THREE.Quaternion();
function exWrist(H, s, dir, w) {   // putar pergelangan (swing terkecil, tanpa memuntir) supaya bilah / gagang di tangan menunjuk ke `dir` (ruang pemain)
  const par = H.parent; par.updateWorldMatrix(true, false); par.getWorldQuaternion(_gQ1);
  _gV1.set(-s, 0, 0).applyQuaternion(_gQ1).normalize();   // arah bilah (dunia) bila pergelangan tidak diputar: tangan kanan -x, kiri +x
  _gV2.copy(dir).applyQuaternion(_gQ).normalize();
  _gQ2.setFromUnitVectors(_gV1, _gV2);
  _gQ3.copy(_gQ1).invert().multiply(_gQ2).multiply(_gQ1);   // swing dunia -> ruang tulang
  H.quaternion.set(0, 0, 0, 1).slerp(_gQ3, w); H.updateMatrixWorld(true);
}
function exFingers() {
  if (EXS.fing && EXS.fingV === vrm) return EXS.fing;
  EXS.fingV = vrm; EXS.fing = [];
  if (vrm) for (const [side, sg] of [['left', -1], ['right', 1]]) for (const n in FINGER_CURL) { const nd = vrm.humanoid.getNormalizedBoneNode(side + n); if (nd) EXS.fing.push({ nd, v: sg * FINGER_CURL[n] * 0.9 }); }
  return EXS.fing;
}
function exGrip(k) {   // dipanggil di akhir exPose: kedua lengan (IK) mengejar titik pegang, jari menggenggam
  const b = bones, ph = P.ex, t = EX.t;
  exHold(ph, t, vrm ? vrm.scene.position.y : 0);
  if (!EXS.ok) return;
  const w = ph === 1 ? smo(t / 0.12) : ph === 5 ? 1 - smo(t / 0.45) : 1, wo = ph === 1 ? smo(t / 0.3) : w, wg = ph === 1 ? smo(t / 0.5) : w;   // w = bobot IK, wo = pergelangan, wg = jari
  for (const f of exFingers()) pose(f.nd, 0, 0, f.v * wg, k);
  if (w < 0.001) return;
  player.updateMatrixWorld(true); player.getWorldQuaternion(_gQ);
  for (const s of [1, -1]) {   // 1 = tangan kanan, -1 = tangan kiri
    const R = s > 0, UA = R ? b.rUA : b.lUA, LA = R ? b.rLA : b.lLA, H = R ? b.rH : b.lH;
    _gT.copy(R ? EXS.tR : EXS.tL); player.localToWorld(_gT);
    _gP.set(-s * 1.0, -0.2, -0.3).applyQuaternion(_gQ);   // siku condong ke luar-bawah
    bhArm(UA, LA, H, _gT, _gP, w);
    exWrist(H, s, R ? EXS.dR : EXS.dL, wo);
  }
}

// ---- alur skill ----
function exAcquire() { // arah serangan = musuh terdekat, yang searah hadap diprioritaskan
  const f = faceVec(); let best = null, bs = 1e9;
  for (const e of enemies) {
    if (e.dying) continue;
    const d = e.g.position.clone().sub(player.position).setY(0), l = d.length(); if (l > EX.range || l < 0.05) continue;
    const sc = l * (1.8 - 0.8 * d.divideScalar(l).dot(f)); if (sc < bs) { bs = sc; best = e; }
  }
  return best;
}
function startEX() {
  EX.hit.clear(); EX.fused = false; EX.clash = false; EX.vis = true; EX.cr = 0; exSt.clear(); exCapture(); exGo(1);
  Object.assign(P, { atk: 0, cross: false, roll: 0 });
  for (const m of [slash.material, dMat, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0;
  audio.sfx('choir', { delay: 0.2 }); pulse(CP.gold, 4, 0.6); lineSparks(player.position.clone().setY(0.2), 24, 7, 1, CP.sparks); toast(DK.on ? '🌑 DARK EXCALIBUR' : '✨ EXCALIBUR', 1800);
}
function endEX() {
  if (!P.ex && !EX.vis) return;
  EX.ph = P.ex = 0; EX.vis = false; P.drawT = DRAW_HOLD;
  for (const r of rigs) r.holder.visible = !dkGs.on; // pedang asli muncul lagi (kecuali great sword penguatan sedang dipegang)
  if (bones) for (const n of [bones.rH, bones.lH]) if (n) n.quaternion.set(0, 0, 0, 1);   // pergelangan & jari kembali normal
  if (EXS.fing) for (const f of EXS.fing) f.nd.rotation.set(0, 0, 0);
  exW.scale.setScalar(1); exSwordOp(1); exSt.clear();
  for (const o of [exW, exPil, exBeam, exGround, exC1.g, exC2.g, exSp, exMotes, exOrb]) o.visible = false;
  exLight.intensity = 0;
  for (const r of exRocks) if (r.mode === 'float') { r.mode = 'blast'; r.life = r.max - 0.6; }
}
function beginRelease() { // tahap 3
  exGo(3); const pp = player.position, tip = exTip(_exT).clone();
  EX.fl = 0.85; shake = Math.max(shake, 1);
  audio.sfx('thud', { vol: 1, rate: 0.5 });
  ptRing(pp.clone().setY(0.08), null, 32, 1.0, { c: CP.ring }); ptRing(pp.clone().setY(0.1), null, 20, 0.8, { c: CP.ring2, delay: 0.08 }); // gelombang kejut cahaya menyapu arena
  ptRing(tip, faceVec(), 9, 0.5, { c: CP.ring3 });
  lineSparks(tip, 60, 16, 1.5, CP.sparks); exGlow(tip, 3, 20, 0.5); pulse(CP.gold, 9, 0.6);
}
function beginImpact() { // tahap 4: sinar dilepas
  exGo(4); const pp = player.position; EX.dir.copy(faceVec()); exTip(EX.org); EX.org.y = Math.max(EX.org.y, 0.9); EX.tickT = 0; EX.hit.clear();
  EX.fl = 0.6; shake = Math.max(shake, 1.2); audio.sfx('thud', { vol: 1, rate: 0.35 });
  const o = EX.org, d = EX.dir, sd = new THREE.Vector3(d.z, 0, -d.x);
  [0, 3, 7, 12].forEach((k, i) => ptRing(o.clone().addScaledVector(d, k), d, 8 + k * 0.3, 0.6, { c: CP.ring, delay: i * 0.08 })); // cincin kejut sepanjang sinar
  for (let i = 0; i < 10; i++) { // retakan petir emas di lantai
    const a = o.clone().setY(0.08).addScaledVector(d, rnd(1, 10)), b = a.clone().addScaledVector(d, rnd(3, 20)).addScaledVector(sd, rnd(-5, 5)).setY(0.08);
    ptBolt(a, b, { seg: 8, jit: 0.5, w: 0.06, life: 0.7, ...exGold });
  }
  lineSparks(o, 70, 18, 1.3, CP.sparks); exGlow(o, 4, 26, 0.6);
  for (const r of exRocks) if (r.mode === 'float') { // serpihan yang melayang terlempar keluar
    const v = r.m.position.clone().sub(pp).setY(0); if (v.lengthSq() < 0.01) v.set(rnd(-1, 1), 0, rnd(-1, 1));
    r.mode = 'blast'; r.life = 0; r.max = 2.2; r.v.copy(v.normalize().multiplyScalar(rnd(10, 20))); r.v.y = rnd(5, 10);
  }
  for (let i = 0; i < 12; i++) { const r = new THREE.Vector3(rnd(-2, 2), 0.2, rnd(-2, 2)).add(o).setY(0.2); exRock(r, 'blast'); const q = exRocks[exRocks.length - 1]; q.v.set(rnd(-14, 14), rnd(6, 12), rnd(-14, 14)).addScaledVector(d, rnd(0, 12)); }
}
function exHitFx(e, first) {
  const c = e.g.position.clone().setY(e.dragon || e.golem ? 3 : 1.3);
  lineSparks(c, first ? 40 : 12, 12, 1.5, CP.sparks); burst(c, CP.burst, first ? 16 : 6, 8);
  if (first) { exGlow(c, 2, 12, 0.45); ptRing(c, EX.dir, 7 + e.r * 2, 0.45, { c: CP.ring3 }); }
}
function exTick(dt) {
  EX.t += dt; P.inv = Math.max(P.inv, 0.3);
  const pp = player.position, ph = EX.ph;
  if (ph <= 2) { const T = exAcquire(); if (T) { const d = T.g.position.clone().sub(pp); P.face = Math.atan2(d.x, d.z); } } // terus menghadap musuh yang akan dihantam
  if (ph === 1) {
    if (!EX.clash && EX.t >= EX.vee + EX.join) { // kedua bilah bertemu & menempel
      EX.clash = true; audio.sfx('sword', { vol: 0.9, rate: 1.6 }); shake = Math.max(shake, 0.25);
      _exA.copy(EXS.tR).add(EXS.tL).multiplyScalar(0.5); player.localToWorld(_exA); _exA.y += 0.5; lineSparks(_exA, 24, 8, 1.2, CP.sparks);
    }
    if (!EX.fused && EX.t >= EX.fuseAt) { // kedua bilah melebur jadi SATU pedang yang digenggam kedua tangan
      EX.fused = true; for (const r of rigs) r.holder.visible = false; EX.fl = Math.max(EX.fl, 0.6);
      exHold(1, EX.t, vrm ? vrm.scene.position.y : 0); const tip = exTip(_exT).clone();
      exW.localToWorld(_exA.set(0, EXS.tip * 0.4, 0)); exGlow(_exA, 2, 12, 0.45);
      ptRing(tip, UP, 6, 0.5, { c: CP.ring3 }); lineSparks(tip, 40, 12, 1.5, CP.sparks); exGlow(tip, 2, 14, 0.5); shake = Math.max(shake, 0.4);
    }
    if (EX.t > EX.vee && !EX.fused && Math.random() < 0.8) { // percikan di sepanjang bilah yang saling menempel
      _exA.copy(EXS.tR).add(EXS.tL).multiplyScalar(0.5); player.localToWorld(_exA); _exA.y += rnd(0.1, 0.9); lineSparks(_exA, 2, 5, 1.2, CP.sparks);
    }
    if (EX.t >= EX.fuse) {
      exGo(2); EX.cr = 0; audio.sfx('choir');
      for (let i = 0; i < 16; i++) { const a = rnd(0, 6.283), r = rnd(2.5, 8); exRock(new THREE.Vector3(pp.x + Math.cos(a) * r, 0.1, pp.z + Math.sin(a) * r), 'float'); }
    }
  } else if (ph === 2) {
    const u = EX.t / EX.charge; shake = Math.max(shake, 0.08 + 0.3 * u);
    if ((EX.cr -= dt) <= 0) { EX.cr = 0.38 - 0.18 * u; ptRing(pp.clone().setY(0.08), null, 6 + 3 * u, 0.7, { c: CP.ring }); } // denyut cincin di lantai
    const a = rnd(0, 6.283), r = rnd(1, 5); lineSparks(new THREE.Vector3(pp.x + Math.cos(a) * r, 0.1, pp.z + Math.sin(a) * r), 3, 4, 3, CP.sparks); // percikan naik
    if (Math.random() < 0.25 + 0.4 * u) { const tip = exTip(_exT); ptBolt(tip, tip.clone().add(new THREE.Vector3(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3))), { seg: 6, jit: 0.3, w: 0.03, life: 0.2, ...exGold }); }
    if (EX.t >= EX.charge) beginRelease();
  } else if (ph === 3) {
    shake = Math.max(shake, 0.6);
    if (EX.t >= EX.rel) beginImpact();
  } else if (ph === 4) {
    const u = EX.t / EX.imp; shake = Math.max(shake, 0.8 * (1 - u * 0.5));
    pp.addScaledVector(EX.dir, -3 * (1 - u) * dt); // hentakan ke belakang
    const o = EX.org, d = EX.dir, sd = new THREE.Vector3(d.z, 0, -d.x);
    exTip(o); o.y = Math.max(o.y, 0.9);   // ujung pedang menancap di lantai: sinar tetap keluar setinggi 0,9
    if ((EX.tickT -= dt) <= 0) { // damage berulang ke semua musuh di lintasan sinar
      EX.tickT = EX.tick;
      for (const e of [...enemies]) {
        if (e.dying) continue;
        const rx = e.g.position.x - o.x, rz = e.g.position.z - o.z, along = rx * d.x + rz * d.z, lat = Math.abs(rx * d.z - rz * d.x);
        if (along > -1 && along < EX.beamL && lat < EX.beamR + e.r) {
          const first = !EX.hit.has(e); EX.hit.add(e); if (!hurtEnemy(e, first ? EX.dmgFirst : EX.dmg, d.clone(), EX.push, DK.on ? 'd6' : 's6')) exHitFx(e, first);
        }
      }
    }
    for (let i = 0; i < 3; i++) lineSparks(o.clone().addScaledVector(d, rnd(1, 40)).addScaledVector(sd, rnd(-2, 2)).setY(rnd(0.2, 2.5)), 2, 9, 1.5, CP.sparks);
    if (Math.random() < 0.3) { const p = o.clone().addScaledVector(d, rnd(2, 30)); ptBolt(p, p.clone().add(new THREE.Vector3(rnd(-6, 6), rnd(-1, 4), rnd(-6, 6))), { seg: 7, jit: 0.4, w: 0.05, life: 0.25, ...exGold }); }
    if (EX.t >= EX.imp) { exGo(5); if (DK.on) dkPowStart(); }
  } else if (ph === 5) {
    if (EX.t >= EX.rec) endEX();
  }
}
function exPose(dt) { // badan: tangan terangkat V (fusion) -> menempel & melebur -> tahan melayang (charge) -> kedua tangan menghunjam ke depan (release / impact) -> kembali
  if (!bones) return;
  const b = bones, kb = 1 - Math.exp(-dt * 18), k = 1 - Math.exp(-dt * 12), ph = P.ex, t = EX.t;
  //        rUAx  rUAz  lUAx  lUAz  rLAy  lLAy  spine chest hipsX lULx  lULz  rULx  rULz  lLLx  rLLx  head
  const A = [0.1, 1.25, 0.1, -1.25, 0.25, -0.25, 0.05, 0, 0, 0, 0.05, 0, -0.05, 0.1, 0.1, 0];
  const U = [-0.35, -1.2, -0.35, 1.2, 0.6, -0.6, -0.12, -0.08, 0, -0.15, 0.4, -0.15, -0.4, 0.25, 0.25, -0.35];
  const F = [-1.5, -0.2, -1.5, 0.2, 0.1, -0.1, 0.35, 0.05, 0.1, -0.7, 0.3, 0.5, -0.3, 0.9, 0.3, -0.1];
  const L = (p, q, w) => p.map((v, i) => v + (q[i] - v) * w), ease = x => 1 - Math.pow(1 - clamp01(x), 2);
  let v = U, ly = 0, trem = 0;
  if (ph === 1) v = L(A, U, ease(t / EX.fuse));
  else if (ph === 2) { const u = clamp01(t / EX.charge); ly = 0.45 * ease(u * 2); trem = 0.012 * Math.sin(t * 60) * u; }
  else if (ph === 3) { const e = 1 - Math.pow(1 - clamp01(t / (EX.rel * 0.6)), 3); v = L(U, F, e); ly = 0.45 * (1 - e); }
  else if (ph === 4) { v = F; trem = 0.03 * Math.sin(t * 70); }
  else { v = L(F, A, ease(t / EX.rec)); }
  exPoseA(b.rUA, v[0], 0, v[1], kb); exPoseA(b.lUA, v[2], 0, v[3], kb); exPoseA(b.rLA, 0, v[4], 0, kb); exPoseA(b.lLA, 0, v[5], 0, kb);   // pose dasar lengan (IK menimpanya, lalu memudar saat pemulihan)
  pose(b.spine, v[6] + trem, 0, 0, kb); pose(b.chest, v[7], 0, 0, kb); pose(b.hips, v[8], 0, 0, kb);
  pose(b.lUL, v[9], 0, v[10], kb); pose(b.rUL, v[11], 0, v[12], kb); pose(b.lLL, v[13], 0, 0, kb); pose(b.rLL, v[14], 0, 0, kb); pose(b.head, v[15], 0, 0, k);
  if (vrm) vrm.scene.position.y += (ly - vrm.scene.position.y) * (1 - Math.exp(-dt * 14));
  exGrip(k);   // terakhir: tangan menggenggam pedang (badan sudah di pose akhirnya)
}

// ---- efek visual per frame (juga jalan setelah skill selesai: serpihan batu, kilat layar) ----
function exFxTick(dt) {
  EX.fl = Math.max(0, EX.fl - dt * 2.2); const fo = EX.fl > 0.01 ? EX.fl.toFixed(2) : '0'; if (exFlash.style.opacity !== fo) exFlash.style.opacity = fo;
  for (const r of [...exRocks]) {
    r.life += dt; const m = r.m;
    if (r.mode === 'float') { m.position.y += (r.h + Math.sin(r.life * 2 + r.h) * 0.25 - m.position.y) * Math.min(1, dt * 1.5); m.rotation.x += r.w.x * 0.15 * dt; m.rotation.y += r.w.y * 0.15 * dt; }
    else {
      r.v.y -= 18 * dt; m.position.addScaledVector(r.v, dt); m.rotation.x += r.w.x * dt; m.rotation.y += r.w.y * dt; m.rotation.z += r.w.z * dt;
      if (m.position.y < 0.15) { m.position.y = 0.15; r.v.y = Math.abs(r.v.y) * 0.3; r.v.x *= 0.6; r.v.z *= 0.6; }
      if (r.life > r.max - 0.4) m.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
      if (r.life >= r.max) { scene.remove(m); exRocks.splice(exRocks.indexOf(r), 1); }
    }
  }
  if (!EX.vis) { if (exLight.intensity) exLight.intensity = 0; return; }
  const ph = P.ex, t = EX.t, pp = player.position, u1 = clamp01(t / EX.fuse), u2 = clamp01(t / EX.charge), u3 = clamp01(t / EX.rel), u4 = clamp01(t / EX.imp), u5 = clamp01(t / EX.rec);
  const chg = ph === 2 ? u2 : ph >= 3 ? 1 : 0, easeO = x => 1 - Math.pow(1 - clamp01(x), 3);
  // pedang gabungan (GLB): digenggam kedua tangan; posisi & arahnya diatur exHold() dari exPose
  if (!EXS.ok) exHold(ph, t, 0);   // cadangan bila tulang tangan model tidak lengkap
  const op = ph === 1 ? (t < EX.fuseAt ? 0 : clamp01((t - EX.fuseAt) * 6)) : ph === 5 ? 1 - clamp01(u5 * 2.5) : 1;
  exW.visible = op > 0.01;
  if (exW.visible) {
    exW.scale.setScalar(ph === 1 ? 0.35 + 0.65 * easeO((t - EX.fuseAt) / 0.3) : 1 + (ph === 2 ? 0.03 * Math.sin(t * 20) : 0));
    const hs = EXS.glb ? EXS.halo : exB.halo, h = 5.5 * (1 + 1.2 * chg);
    if (EXS.glb) { exSwordOp(op); if (EXS.main) EXS.main.emissiveIntensity = EXS.mainE * (1 + 1.6 * chg); }
    else { exB.steel.opacity = exB.gold.opacity = op; exB.aura.opacity = 0.55 * op; exB.steel.emissiveIntensity = 1.1 + 2 * chg; }
    hs.material.opacity = 0.9 * op; hs.scale.set(h, h, 1);
  }
  const tip = exW.visible ? exTip(_exT).clone() : null;
  // garis cahaya vertikal ke langit
  const wP = !tip ? 0 : ph === 1 ? 0.5 * clamp01((u1 - 0.5) * 2) : ph === 2 ? 0.6 + 1.5 * u2 : ph === 3 ? 2.1 * (1 - clamp01(u3 / 0.35)) : 0;
  exPil.visible = wP > 0.01;
  if (exPil.visible) { exPil.position.copy(tip); exPc[0].scale.set(0.5 * wP, 1, 0.5 * wP); exPc[1].scale.set(0.1 * wP, 1, 0.1 * wP); exPm[0].opacity = 0.3 * Math.min(1, wP); exPm[1].opacity = 0.9 * Math.min(1, wP); }
  // lingkaran sihir
  const cs = ph === 1 ? 0.6 * clamp01((u1 - 0.3) / 0.7) : ph === 2 ? 0.6 + 0.4 * u2 : ph === 3 ? 1 : ph === 4 ? 1 + 0.2 * u4 : 1.2;
  const co = ph === 1 ? 0.7 * u1 : ph === 2 ? 0.7 + 0.3 * u2 : ph === 3 ? 1 : ph === 4 ? 1 - 0.6 * u4 : 0.4 * (1 - u5);
  exC1.g.visible = exC2.g.visible = co > 0.01;
  if (exC1.g.visible) {
    exC1.g.position.set(pp.x, 0.05, pp.z); exC2.g.position.set(pp.x, 0.07, pp.z); exC1.g.scale.setScalar(Math.max(0.01, 6 * cs)); exC2.g.scale.setScalar(Math.max(0.01, 3.4 * cs));
    exC1.g.rotation.z += dt * (0.6 + 1.8 * chg); exC2.g.rotation.z -= dt * (1.2 + 3 * chg); exC1.m.opacity = co; exC2.m.opacity = co * 0.9;
  }
  // pita energi
  const so = ph === 2 ? 0.85 * u2 : ph === 3 ? 0.9 : ph === 4 ? 0.9 * (1 - u4) : 0, ss = ph === 1 ? 0.3 : ph === 2 ? 0.4 + 0.6 * u2 : ph === 3 ? 1 + 0.25 * u3 : 1.25 + 2.2 * u4;
  exSp.visible = so > 0.01;
  if (exSp.visible) { exSp.position.set(pp.x, 0.05, pp.z); exSp.scale.setScalar(ss); exSpm.opacity = so; const spd = 1.5 + 5 * (ph === 2 ? u2 : ph === 3 ? 1 : ph === 4 ? 2 : 0); for (const c of exSp.children) c.rotation.y += dt * c.userData.sp * spd; }
  // butiran cahaya
  const mo = ph === 1 ? 0.5 : ph === 2 || ph === 3 ? 1 : ph === 4 ? 0.8 * (1 - u4) : 0;
  exMotes.visible = mo > 0.01;
  if (exMotes.visible) {
    exMotes.material.opacity = mo;
    for (let i = 0; i < EXN; i++) {
      const s = exMs[i]; s.a += s.w * dt * (1 + chg * 2); s.y += s.vy * dt * (1 + (ph >= 2 ? 1 : 0)); if (s.y > 9) { s.y = 0; s.r = rnd(0.8, 8); s.a = rnd(0, 6.283); }
      const r = s.r * (1 - 0.5 * (s.y / 9)); exMp[i * 3] = pp.x + Math.cos(s.a) * r; exMp[i * 3 + 1] = s.y; exMp[i * 3 + 2] = pp.z + Math.sin(s.a) * r;
    }
    exMg.attributes.position.needsUpdate = true;
  }
  // sinar Excalibur
  const w = ph === 4 ? clamp01(u4 < 0.1 ? u4 / 0.1 : u4 < 0.75 ? 1 : (1 - u4) / 0.25) : 0, fl = 0.92 + 0.08 * Math.random();
  exBeam.visible = exGround.visible = w > 0.01;
  if (exBeam.visible) {
    const o = EX.org, d = EX.dir; exBeam.position.copy(o); exBeam.lookAt(o.x + d.x, o.y + d.y, o.z + d.z);
    [[2.6, 0.45], [1.4, 0.75], [0.55, 1]].forEach(([r, a], i) => { exBc[i].scale.set(r * w * fl, r * w * fl, EX.beamL); exBm[i].opacity = a * Math.min(1, w * 1.5); });
    exGround.position.set(o.x, 0.06, o.z); exGround.rotation.y = Math.atan2(d.x, d.z); exGround.scale.set(6 * w, 1, EX.beamL); exGround.material.opacity = 0.55 * w;
  }
  // bola cahaya di ujung pedang
  const oo = !tip ? 0 : ph === 3 ? 0.6 + 0.4 * u3 : ph === 4 ? Math.max(w, 0.0) : 0;
  exOrb.visible = oo > 0.01;
  if (exOrb.visible) { exOrb.position.copy(ph === 4 ? EX.org : tip); exOrb.scale.setScalar(ph === 3 ? 1.5 + 9 * u3 : 12 * (0.6 + 0.4 * w) * fl); exOrb.material.opacity = oo; }
  // lampu emas
  exLight.position.set(tip ? tip.x : pp.x, (tip ? tip.y : 1.5) + 1, tip ? tip.z : pp.z);
  exLight.intensity = ph === 1 ? 20 * u1 : ph === 2 ? 40 + 120 * u2 : ph === 3 ? 200 : ph === 4 ? 260 * Math.max(0.15, w) * fl : 60 * (1 - u5);
}

function pulse(color, max, dur) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), glowMat(color));
  m.rotation.x = -Math.PI / 2; m.position.copy(player.position).setY(0.1); scene.add(m);
  pulses.push({ m, t: dur, dur, max });
}
function skill(k) {
  const s = SK[k];
  if (QT.phase || IT.open || !canFight() || P.air || s.t > 0 || P.roll > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0 || P.pt > 0 || P.ex > 0 || (P.atk > 0 && P.cross)) return;
  s.t = s.cd;
  const f = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face));
  if (k === 's1') { // 1. Vertical Spin: berputar vertikal dengan dua pedang
    startVS();
  } else if (k === 's2') { // 2. Slash Besar: mengayunkan dua pedang dalam satu tebasan besar
    startSL();
  } else if (k === 's6') { // 6. Excalibur: dua pedang menyatu, mengisi cahaya suci, melepas sinar emas raksasa
    exTheme(DK.on); startEX();
  } else if (k === 's5') { // 5. Dash Petir: kunci target, terjang lurus menembus target, tebasan + sambaran petir
    startPT(false);
  } else if (k === 's3') { // 3. Summon Blade: memanggil pedang yang spawn di atas monster, lalu menghantamnya (Dark Mode: Dark Blades)
    if (DK.on) startDK3(); else startSM();
  } else { // 4. Penguatan dan Perlindungan: perisai + serangan dasar diperkuat
    startBF();
  }
}
function tickSkills(dt) {
  bladesTick(dt); dkTick(dt); bfTick(dt); ptFxTick(dt); exFxTick(dt);
  for (const k in SK) { const s = SK[k]; s.t = Math.max(0, s.t - dt); skBtn[k].style.setProperty('--cd', s.t / s.cd); }
  P.sh = Math.max(0, P.sh - dt); shield.visible = P.sh > 0; shield.material.opacity = 0.2 + Math.sin(P.t * 10) * 0.08;
  for (const w of [...waves]) {
    w.life -= dt; w.g.position.addScaledVector(w.v, dt); if (w.mat) w.mat.opacity = Math.min(1, w.life / 0.2) * 0.95; if (w.mat2) w.mat2.opacity = Math.min(1, w.life / 0.2) * 0.95;
    for (const e of [...enemies]) {
      if (!w.hit.has(e) && Math.hypot(e.g.position.x - w.g.position.x, e.g.position.z - w.g.position.z) < e.r + (w.rad || 1.3)) { w.hit.add(e); hurtEnemy(e, w.dmg || 32, w.v.clone().normalize(), 12); }
    }
    if (w.life <= 0 || (state === 'play' && w.g.position.length() > R)) { scene.remove(w.g); if (w.mat) w.mat.dispose(); if (w.mat2) w.mat2.dispose(); waves.splice(waves.indexOf(w), 1); }
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

const ACT = { atk: () => attack(), roll: () => roll(), s1: () => skill('s1'), s2: () => skill('s2'), s3: () => skill('s3'), s4: () => skill('s4'), s5: () => skill('s5'), s6: () => skill('s6') };
ACT.dk = () => toggleDark();
if (skBtn.s6 && skBtn.s6.parentNode) {   // tombol layar sentuh Dark Mode (menggandakan tombol skill 6)
  const nb = skBtn.s6.cloneNode(true); nb.dataset.a = 'dk'; nb.title = 'Dark Mode (X)'; nb.style.setProperty('--cd', 0);
  const w = document.createTreeWalker(nb, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) n.nodeValue = n.nodeValue.replace(/6/, 'X');
  if (!/X/.test(nb.textContent)) nb.textContent = '🌑';
  skBtn.s6.parentNode.appendChild(nb);
}
document.querySelectorAll('#btns button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); ACT[b.dataset.a](); }));
$('talk').addEventListener('pointerdown', e => { e.preventDefault(); talkAct(); });
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
function clearBlasts() { for (const b of blasts) scene.remove(b.g); blasts.length = 0; for (const q of quakes) scene.remove(q.wave); quakes.length = 0; }
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
        hurtLyraArea(b.g.position.x, b.g.position.z, b.rad * BLAST_REACH, b.dmg);
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

// ---------- Bos golem: Tharok (golem.glb), dilawan lewat Pintu Penjaga di Reruntuhan Kuno ----------
// Model & gerak sendi ada di golem.js; di sini AI, serangan & efeknya. Serangan: Palu (satu lengan, jarak dekat), Hentakan (kedua lengan, gelombang kejut di sekitarnya),
// Lempar Batu (3 bongkah, jarak jauh), Pilar Beruntun (deretan pilar tanah menyembul mengejar pemain & melontarkannya ke atas), dan setelah darah < 50% ia mengamuk (lebih cepat) + Hujan Batu (lingkaran peringatan di sekitar pemain).
const quakes = []; // gelombang kejut berbentuk cincin
// Batu lempar golem: bongkah RUNCING (ikosahedron yang sebagian titiknya ditarik keluar jadi duri; titik yang sama = duri yang sama, jadi tidak ada retakan)
const rockGeo = (() => {
  const g = new THREE.IcosahedronGeometry(0.5, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453, k = h - Math.floor(h);
    p.setXYZ(i, ...[x, y, z].map(v => v * (k > 0.55 ? 2.1 : 0.8)));
  }
  g.computeVertexNormals(); return g;
})();
// Efek suara hantaman (golem-impact.mp3): dimainkan saat batu dilempar & saat batu pecah; mengikuti volume efek di pengaturan
const impactSnd = new Audio('golem-impact.mp3'); impactSnd.preload = 'auto';
function golemImpact(vol = 1) { try { const a = impactSnd.cloneNode(); a.volume = Math.max(0, Math.min(1, audio.sfxVolume * vol)); a.play().catch(() => {}); } catch (e) { /* abaikan */ } }
function spawnQuake(pos, rad, dmg) { // hantaman tanah: cincin menyapu keluar + serpihan es; melukai pemain di dalam radius (berguling = kebal)
  const am = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64), am(0x9fefff, 0.85)); wave.rotation.x = -Math.PI / 2; wave.position.set(pos.x, 0.1, pos.z); wave.scale.setScalar(0.1); scene.add(wave);
  quakes.push({ wave, rad, t: 0 });
  shake = Math.max(shake, 0.45 + rad * 0.07); audio.sfx('thud', { vol: 0.9, rate: 0.55 });
  hurtLyraArea(pos.x, pos.z, rad, dmg);
  if (Math.hypot(player.position.x - pos.x, player.position.z - pos.z) < rad) hurtPlayer(dmg);
  const c = new THREE.Vector3(pos.x, 0.4, pos.z); burst(c, 0xcfefff, 26, 9); burst(c, 0x8fb8d0, 18, 6);
  for (let i = 0; i < Math.min(40, 14 + rad * 3); i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xcfefff : 0x8fb8d0, transparent: true })); m.scale.setScalar(rnd(1.5, 4));
    const a = Math.random() * Math.PI * 2, dd = Math.random() * rad * 0.9; m.position.set(pos.x + Math.cos(a) * dd, 0.2, pos.z + Math.sin(a) * dd);
    fx.push({ m, v: new THREE.Vector3(rnd(-2, 2), rnd(5, 12), rnd(-2, 2)), life: rnd(0.7, 1.3), max: 1.3 }); scene.add(m);
  }
}
function updateQuakes(dt) {
  for (const q of [...quakes]) {
    q.t += dt; const u = Math.min(1, q.t / 0.5);
    q.wave.scale.setScalar(Math.max(0.1, q.rad * (0.1 + 0.95 * u))); q.wave.material.opacity = 0.85 * (1 - u);
    if (u >= 1) { scene.remove(q.wave); q.wave.geometry.dispose(); q.wave.material.dispose(); quakes.splice(quakes.indexOf(q), 1); }
  }
}

// ---------- Pilar Beruntun (skill golem): deretan pilar batu menyembul dari tanah satu demi satu, mengejar pemain ----------
// Tiap pilar punya lingkaran peringatan merah yang terisi; saat penuh, pilar menyembul & MELONTARKAN pemain ke atas (kebal saat berguling).
const PILLAR = { rad: 1.9, warn: 0.65, gap: 0.17, step: 2.6, H: 6.4, rise: 0.14, hold: 0.85, sink: 0.4, launch: 15, gravity: 24 };
const gPillars = [], gChains = [];
const gPillarGeo = (() => {   // batang runcing bersegi 7, titik-titiknya digeser sedikit supaya tidak mulus
  const g = new THREE.CylinderGeometry(0.8, 1.4, PILLAR.H, 7, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453, k = h - Math.floor(h), top = (y / PILLAR.H + 0.5);
    p.setXYZ(i, x * (0.85 + 0.35 * k), y + (y > PILLAR.H * 0.45 ? 0.5 * k : 0), z * (0.85 + 0.35 * k) * (1 - 0.15 * top));
  }
  g.computeVertexNormals(); return g;
})();
const gPillarMat = new THREE.MeshStandardMaterial({ color: 0x9fc2d6, emissive: 0x103848, roughness: 0.85, flatShading: true });
const warnGeo = new THREE.CircleGeometry(1, 32);
function spawnPillarChain(from, dir, n, dmg) { // from: posisi golem, dir: arah awal (ternormalisasi), n: jumlah pilar
  gChains.push({ x: from.x + dir.x * 2.0, z: from.z + dir.z * 2.0, dx: dir.x, dz: dir.z, n, i: 0, t: 0, dmg });
}
function addPillar(x, z, dmg, k) {
  const am = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
  const base = new THREE.Mesh(warnGeo, am(0xff2020, 0.25)), fill = new THREE.Mesh(warnGeo, am(0xff5030, 0.45));
  for (const m of [base, fill]) { m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); scene.add(m); }
  base.scale.setScalar(PILLAR.rad); fill.scale.setScalar(0.01); fill.position.y = 0.07;
  gPillars.push({ x, z, dmg, k, st: 0, t: 0, base, fill, m: null });
}
function launchPlayer(fx, fz, vy = PILLAR.launch) {
  if (AIMSW.on) return;
 // lontarkan pemain ke atas (+ sedikit terdorong menjauhi pusat pilar)
  const dx = player.position.x - fx, dz = player.position.z - fz, l = Math.hypot(dx, dz) || 1;
  P.air = true; P.vy = vy; P.kb.set(dx / l * 3.2, 0, dz / l * 3.2);
  P.atk = 0; P.cross = false; P.combo = 0; P.roll = 0; P.hit = false;
  burst(player.position.clone().setY(0.4), 0xcfefff, 12, 7);
}
function erupt(p) {
  scene.remove(p.base); scene.remove(p.fill); p.base.material.dispose(); p.fill.material.dispose();
  const m = new THREE.Mesh(gPillarGeo, gPillarMat); m.castShadow = m.receiveShadow = true;
  const sc = rnd(0.9, 1.15); m.scale.set(sc, rnd(0.9, 1.1), sc); m.rotation.set(rnd(-0.06, 0.06), rnd(0, 6.28), rnd(-0.06, 0.06));
  m.position.set(p.x, -PILLAR.H / 2, p.z); scene.add(m); p.m = m; p.st = 1; p.t = 0;
  shake = Math.max(shake, 0.32); const c = new THREE.Vector3(p.x, 0.3, p.z); burst(c, 0xcfefff, 14, 7); burst(c, 0x8fb8d0, 10, 5);
  if (p.k % 2 === 0) audio.sfx('thud', { vol: 0.6, rate: 0.5 + Math.random() * 0.2 }); if (p.k % 3 === 0) golemImpact(0.35);
  hurtLyraArea(p.x, p.z, PILLAR.rad + 0.3, p.dmg);
  if (Math.hypot(player.position.x - p.x, player.position.z - p.z) < PILLAR.rad + 0.3 && player.position.y < 1.2) { // kena: damage + terlontar (berguling / kebal = menghindar)
    const can = P.inv <= 0 && state === 'play';
    hurtPlayer(p.dmg); if (can) launchPlayer(p.x, p.z);
  }
}
function updateGPillars(dt) {
  for (const c of [...gChains]) { // rantai: tiap `gap` detik letakkan pilar berikutnya, arahnya membelok ke pemain
    c.t -= dt;
    while (c.t <= 0 && c.i < c.n) {
      const a0 = Math.atan2(c.dx, c.dz); let da = Math.atan2(player.position.x - c.x, player.position.z - c.z) - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
      const a = a0 + Math.max(-0.3, Math.min(0.3, da)); c.dx = Math.sin(a); c.dz = Math.cos(a);
      c.x += c.dx * PILLAR.step; c.z += c.dz * PILLAR.step;
      if (Math.hypot(c.x, c.z) > R - 1.2) { c.i = c.n; break; } // mentok di tepi arena
      addPillar(c.x, c.z, c.dmg, c.i); c.i++; c.t += c.gap || PILLAR.gap;
    }
    if (c.i >= c.n) gChains.splice(gChains.indexOf(c), 1);
  }
  for (const p of [...gPillars]) {
    p.t += dt;
    if (p.st === 0) {
      const u = clamp01(p.t / PILLAR.warn); p.fill.scale.setScalar(Math.max(0.01, u) * PILLAR.rad); p.base.material.opacity = 0.22 + 0.08 * Math.sin(p.t * 24);
      if (p.t >= PILLAR.warn) erupt(p);
    } else {
      const top = PILLAR.H * 0.85; let y;
      if (p.st === 1) { const u = clamp01(p.t / PILLAR.rise); y = top * (1 - Math.pow(1 - u, 3)); if (u >= 1) { p.st = 2; p.t = 0; } }
      else if (p.st === 2) { y = top; p.m.position.x = p.x + 0.04 * Math.sin(p.t * 60) * Math.max(0, 1 - p.t * 3); if (p.t >= PILLAR.hold) { p.st = 3; p.t = 0; } }
      else { const u = clamp01(p.t / PILLAR.sink); y = top * (1 - u * u * (3 - 2 * u)); if (u >= 1) { scene.remove(p.m); gPillars.splice(gPillars.indexOf(p), 1); continue; } }
      p.m.position.y = y - PILLAR.H / 2;
    }
  }
}
function clearGPillars() {
  for (const p of gPillars) { scene.remove(p.base); scene.remove(p.fill); if (p.m) scene.remove(p.m); else { p.base.material.dispose(); p.fill.material.dispose(); } }
  gPillars.length = 0; gChains.length = 0;
}
function airTick(dt) { // pemain terlontar: gravitasi, terdorong menjauh, mendarat
  if (!P.air) return;
  P.vy -= PILLAR.gravity * dt; player.position.y += P.vy * dt; player.position.addScaledVector(P.kb, dt); P.kb.multiplyScalar(Math.exp(-dt * 2.2));
  if (player.position.y <= 0 && P.vy < 0) {
    player.position.y = 0; P.air = false; P.vy = 0; P.kb.set(0, 0, 0); P.inv = Math.max(P.inv, 0.5); // jeda kebal sebentar setelah mendarat
    shake = Math.max(shake, 0.25); burst(player.position.clone().setY(0.2), 0xcfefff, 10, 5); audio.sfx('thud', { vol: 0.5, rate: 0.8 });
  }
}
function mkGolem() {
  const rig = buildGolem(), g = new THREE.Group(); g.add(rig.root);
  g.position.set(GOLEM.spawn.x, 0, GOLEM.spawn.z); g.rotation.y = 0; scene.add(g);   // menghadap +z, ke arah pemain
  const pose = newGolemPose(); pose.intro = 0; poseGolem(rig, pose);
  const e = { g, rig, pose, mat: rig.mat, boss: true, golem: true, hp: GOLEM.hp, max: GOLEM.hp, sp: GOLEM.speed, r: GOLEM.r, cd: 1, wind: 0, flash: 0, kv: new THREE.Vector3(), stun: 0,
    intro: 1.6, ign: false, at: null, t: 0, hit: false, gap: 0.6, cdA: 1.2, cdB: 5, cdC: 3.5, cdD: 6, cdE: 4, rage: false, fs: 0 };
  enemies.push(e); return e;
}
function golemStart(e, at, d, fwd) {
  const A = ATTACK[at], ps = e.pose, g = e.g; e.at = ps.at = at; e.t = ps.t = 0; e.hit = false;
  const ringAt = (x, z, rad, t, dmg) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.1, rad, 48), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); scene.add(m); rings.push({ m, t, rad, dmg, big: true, kind: 'golem' }); };
  if (at === 'punch') { ps.side = Math.random() < 0.5 ? 1 : -1; e.cdA = e.rage ? 1.8 : 2.6; }
  else if (at === 'slam') { e.cdB = e.rage ? 5.5 : 7.5; ringAt(g.position.x + fwd.x * 1.5, g.position.z + fwd.z * 1.5, 7.5, A.hit, 30); }
  else if (at === 'rocks') e.cdC = e.rage ? 4.5 : 6.5;
  else if (at === 'pillars') e.cdE = e.rage ? 7 : 10;
  else if (at === 'rain') {
    e.cdD = 8; const pp = player.position;
    [[0, 0], [3.2, 1], [-3.4, 2.4], [1.2, -3.6], [-1.4, 4.2]].forEach(([ox, oz], i) => {
      let x = pp.x + ox, z = pp.z + oz; const hl = Math.hypot(x, z); if (hl > R - 2) { x *= (R - 2) / hl; z *= (R - 2) / hl; }
      ringAt(x, z, 2.6, A.hit + i * 0.2, 18);
    });
  } else if (at === 'roar') { e.rage = true; audio.sfx('roar'); }
}
function golemHit(e, d, dist, fwd) { // saat gerakan "kena": damage & efek (hentakan / hujan dihitung lewat cincin peringatan -> spawnQuake)
  const g = e.g, ps = e.pose;
  if (e.at === 'punch') {
    shake = Math.max(shake, 0.45); burst(g.position.clone().addScaledVector(fwd, 3.9).setY(0.4), 0xcfefff, 18, 8); audio.sfx('thud', { vol: 0.8, rate: 0.7 });
    if (dist < 6.4 && fwd.dot(d) > 0.3) hurtPlayer(22);
  } else if (e.at === 'rocks') {
    const o = g.position.clone().addScaledVector(fwd, 1.8).setY(4.2), to = player.position.clone().setY(1.1).sub(o).normalize(); golemImpact(1);
    for (const a of [-0.26, 0, 0.26]) {
      const m = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x9fc2d6, emissive: 0x103848, roughness: 0.8, flatShading: true }));
      m.position.copy(o); m.castShadow = true; scene.add(m); orbs.push({ m, v: to.clone().applyAxisAngle(UP, a).multiplyScalar(13), spin: rnd(4, 8), rock: true });
    }
  } else if (e.at === 'pillars') { // tangan menghantam tanah -> rantai pilar mulai dari depan golem (mengamuk: dua rantai menjepit dari kiri & kanan)
    shake = Math.max(shake, 0.6); burst(g.position.clone().addScaledVector(fwd, 3.2).setY(0.4), 0xcfefff, 20, 8); audio.sfx('thud', { vol: 0.8, rate: 0.6 }); golemImpact(0.8);
    if (e.rage) for (const a of [-0.3, 0.3]) spawnPillarChain(g.position, fwd.clone().applyAxisAngle(UP, a), 8, 24);
    else spawnPillarChain(g.position, fwd, 8, 20);
  } else if (e.at === 'roar') { shake = Math.max(shake, 0.9); ps.glow = 1; burst(g.position.clone().setY(3), 0xcfefff, 40, 10); }
}
function golemAI(e, d, dist, dt) {
  const ps = e.pose, g = e.g, A = e.at && ATTACK[e.at];
  ps.ph += dt; ps.glow = Math.max(0, ps.glow - dt * 1.5); ps.rage += ((e.rage ? 1 : 0) - ps.rage) * (1 - Math.exp(-dt * 3));
  e.cdA -= dt; e.cdB -= dt; e.cdC -= dt; e.cdD -= dt; e.cdE -= dt; if (e.gap > 0) e.gap -= dt;
  const fwd = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
  let df = Math.atan2(d.x, d.z) - g.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); ps.look = df;
  const turn = (rate) => { g.rotation.y += Math.max(-rate * dt, Math.min(rate * dt, df)); };
  if (e.intro > 0) { // bersimpuh -> mata menyala -> bangkit -> meraung
    const t = 1.6 - e.intro; e.intro -= dt;
    ps.intro = t < 0.5 ? 0 : easeIO(clamp01((t - 0.5) / 1.0));
    if (!e.ign && t >= 0.5) { e.ign = true; ps.glow = 1; shake = 0.5; audio.sfx('thud', { vol: 0.8, rate: 0.5 }); }
    if (e.intro <= 0) { ps.intro = 1; golemStart(e, 'roar', d, fwd); }
    return;
  }
  if (e.at) {
    e.t += dt; ps.t = e.t;
    if (e.t < A.hit - 0.15 && e.at !== 'roar') turn(e.rage ? 1.6 : 1.1);   // membidik pemain selama aba-aba, lalu terkunci saat menghantam
    if (!e.hit && e.t >= A.hit) { e.hit = true; golemHit(e, d, dist, fwd); }
    if (e.t >= A.dur) { e.at = ps.at = null; e.gap = e.rage ? 0.4 : 0.8; }
    if (e.flash <= 0) { const k = clamp01(e.t / A.hit) * (e.t < A.hit ? 1 : 0.3); if (e.rage) e.mat.emissive.setRGB(0.4 * k, 0.12 * k, 0.01 * k); else e.mat.emissive.setRGB(0.02 * k, 0.22 * k, 0.32 * k); }   // aba-aba: badan menyala
  } else {
    turn(e.rage ? 2.6 : 1.9);
    if (!e.rage && e.hp < e.max * 0.5) golemStart(e, 'roar', d, fwd);   // separuh darah habis: mengamuk
    else if (e.gap <= 0) {
      if (dist < 6.2 && e.cdA <= 0) golemStart(e, 'punch', d, fwd);
      else if (dist < 9.5 && e.cdB <= 0) golemStart(e, 'slam', d, fwd);
      else if (dist > 4 && e.cdE <= 0) golemStart(e, 'pillars', d, fwd);
      else if (dist > 5.5 && e.cdC <= 0) golemStart(e, 'rocks', d, fwd);
      else if (e.rage && e.cdD <= 0) golemStart(e, 'rain', d, fwd);
    }
  }
  // melangkah mendekati pemain (hanya saat tidak menyerang & sudah menghadapnya)
  let v = 0;
  if (!e.at && dist > 4.4 && Math.abs(df) < 1.0) { v = e.sp * (e.rage ? 1.35 : 1); g.position.addScaledVector(fwd, v * dt); }
  const hl = Math.hypot(g.position.x, g.position.z); if (hl > R - 3) { g.position.x *= (R - 3) / hl; g.position.z *= (R - 3) / hl; }
  ps.wk += ((v > 0.1 ? 1 : 0) - ps.wk) * (1 - Math.exp(-dt * 6)); ps.wp += v * 1.26 * dt;
  const fs = Math.floor(ps.wp / Math.PI); if (fs !== e.fs) { e.fs = fs; if (v > 0.1) { shake = Math.max(shake, 0.14); audio.sfx('thud', { vol: 0.35, rate: 0.6 }); } }   // tiap telapak menghentak tanah
  poseGolem(e.rig, ps);
}

// ---------- Alur permainan ----------
const DUNGEON_WAVES = [2, 4, 'boss', 'dragon']; // level 1-2: musuh biasa, level 3: bos penyihir, level 4: bos naga
const KOTA_WAVES = [3, 6, 'boss'];   // semua dungeon Kota Dungeon (Gua Kristal di relung kiri lembah, Dungeon Cahaya di portal tengah, dst.): lebih banyak musuh biasa, bos level 3 = Mutan (monster.glb; cadangan: Penyihir Kristal), tanpa naga
let WAVES = DUNGEON_WAVES, golemMode = false, kotaMode = false, dgTheme = null;   // dgTheme: id dungeon tambahan yang sedang dimasuki (cahaya/kegelapan/api/es/batu); null = Gua Kristal / dungeon lain // golemMode: sedang di arena golem (lewat Pintu Penjaga) -> WAVES = GOLEM_WAVES
let xSafe = { x: 0, z: 0 };   // posisi terakhir yang pasti di lantai kosong (dungeon jelajah): tempat pemain dikembalikan kalau sampai terdorong ke dalam batu / luar denah
let exploreMode = false, bossRoom = false, dgX = null, xLeft = 0, xBusy = false;   // exploreMode: sedang menjelajah dungeon Kota Dungeon (lorong + ruangan); bossRoom: sedang di ruang bos (arena bundar); dgX = dungeon jelajah yang sedang dibangun; xLeft = sisa musuh
const loot = createLoot(THREE, {   // lihat dungeon-loot.js
  scene, rnd, burst, lineSparks, toast,
  player: () => player.position,
  clampPos: p => { if (exploreMode && dgX) dgX.collide(p, 0.4); },   // item tidak jatuh ke dalam dinding dungeon jelajah
  onEquip: onEquipSword,
  atSmith: () => { try { return inGuild && !!smithRoom && guild === smithRoom; } catch (e) { return false; } },   // menempa pedang hanya di dalam toko Pandai Besi (lewat Borin)
  heal: frac => { if (P.hp <= 0 || P.hp >= P.max || (state !== 'play' && state !== 'world')) return false; P.hp = Math.min(P.max, P.hp + Math.round(P.max * frac)); burst(player.position.clone().setY(1.2), 0xff6a8a, 14, 4); return true; },
});
loot.applyEquip();   // pakai pedang terakhir yang dipilih
const lootElement = e => golemMode ? 'batu' : e.dragon ? 'api' : (dgTheme || (kotaMode ? 'kota' : 'asal'));   // elemen item = elemen dungeon yang sedang dimasuki
function lootOnDefeat(e) {   // dipanggil saat musuh benar-benar hilang: monster biasa -> item berhamburan, bos -> peti hadiah
  if (e.wild || e.minion || state !== 'play') return;
  const p = e.g.position, el = lootElement(e);
  if (e.boss || e.dragon || e.golem) { const q = player.position; loot.chest(p.x + (q.x - p.x) * 0.4, p.z + (q.z - p.z) * 0.4, el); }   // peti jatuh di antara bos & pemain
  else loot.drop(p.x, p.z, el, { strong: e.max >= 80 });
}
const BOSS_WAVES = ['boss'];   // ruang bos = hanya bos level 3 (musuh biasa kini ada di ruangan-ruangan dungeon jelajah)
let state = 'load', wave = 0, shake = 0, next = 0, camMode = 'orbit';
syncCam(); document.body.classList.add('orbit'); toast(matchMedia('(pointer:coarse)').matches ? 'Geser layar 1 jari: kiri-kanan memutar, atas-bawah menaik-turunkan kamera' : 'Klik layar untuk mengunci mouse, lalu gerakkan mouse: kiri-kanan memutar, atas-bawah menaik-turunkan kamera (Esc = lepas)', 5000);
function spawnWave() {
  const w = WAVES[wave];
  const bn = $('boss').querySelector('span');
  if (w === 'boss') { mkEnemy(true); bn.textContent = dgTheme ? DG_THEMES[dgTheme].boss : kotaMode ? (mutantGltf ? MUTANT.name : 'Velkaris, Penyihir Kristal') : 'Malzareth, Penyihir Kegelapan'; $('boss').hidden = false; $('wave').textContent = bossRoom ? '👹 Ruang Bos' : `Level ${wave + 1} / ${WAVES.length} — Bos`; }
  else if (w === 'dragon') { mkDragon(); bn.textContent = 'Vyrmgar, Naga Api Merah'; $('boss').hidden = false; $('wave').textContent = 'Level 4 — Pertarungan Terakhir'; }
  else if (w === 'golem') { mkGolem(); bn.textContent = GOLEM.name; $('boss').hidden = false; $('wave').textContent = '🏛️ Penjaga Reruntuhan'; }
  else { $('boss').hidden = true; for (let i = 0; i < w; i++) mkEnemy(false, kotaMode && wave === 1 && i % 3 === 2 ? 1 : 0); $('wave').textContent = `Level ${wave + 1} / ${WAVES.length}`; }
}
function banner(t, ms = 1800) { $('msg').textContent = t; setTimeout(() => { if (state === 'play') $('msg').textContent = ''; }, ms); }
// ---------- Dunia luar -> lubang -> dungeon ----------
const F = { t: 0 }, FALL_TOTAL = 1.3;
const START_IN_KOTA = true;   // true: permainan baru langsung dimulai di Kota Dungeon (menang atas START_IN_KEKAISARAN); false: pakai pengaturan di bawah
const START_IN_KEKAISARAN = true;   // true: permainan baru langsung dimulai di Halaman Istana, Kota Kekaisaran (false: mulai di Ladang Sawah / Dataran Hijau)
const KOTA_START = (() => { const d = DUNGEON_GATES[0].d - 28, a = nwAxisToWorld(d), b = nwAxisToWorld(d + 16); return { x: a.x, z: a.z, face: Math.atan2(b.x - a.x, b.z - a.z) }; })();   // spawn awal: di tengah mulut Lembah Bebatuan, sedikit sebelum pasangan gerbang pertama (Kristal / Kegelapan), menghadap ke dalam lembah (dulu: di dalam lengkung gerbang kota, d0 + 24)
const KOTA_OUT = (() => { const a = nwAxisToWorld(DUNGEON_TOWN.gateD - 6), b = nwAxisToWorld(DUNGEON_TOWN.gateD - 16); return { x: a.x, z: a.z, face: Math.atan2(b.x - a.x, b.z - a.z) }; })();   // muncul 6 m di depan portal, menghadap kota
const gateOut = id => { const g = DUNGEON_GATES.find(x => x.id === id), off = g.side * (g.w - 7), a = nwAxisToWorld(g.d, off), b = nwAxisToWorld(g.d, off - g.side * 10); return { x: a.x, z: a.z, face: Math.atan2(b.x - a.x, b.z - a.z) }; };   // muncul 7 m di depan relung gerbang, menghadap tengah lembah
function enterWorld(fromHole = false, note = null) {
  clearGPillars(); P.air = false; P.vy = 0; player.position.y = 0; // mulai game di dataran hijau (fromHole: muncul di tepi lubang setelah keluar dungeon)
  state = 'world'; arenaG.visible = false; world.group.visible = true; audio.setScene('world');
  scene.background.set(SKY_COLOR); scene.fog = worldFog;
  const fromGolem = fromHole && golemMode;   // keluar dari arena golem -> muncul di depan Pintu Penjaga
  const fromKota = fromHole && kotaMode, kT = fromKota ? dgTheme : null, kId = fromKota ? (kT === null ? 'kristal' : kT === MAIN_DUNGEON.id ? null : kT) : null;   // kT = tema dungeon yang baru ditinggalkan (null = Gua Kristal); kId = relung gerbang di dinding lembah tempat muncul (null = gerbang TENGAH = Dungeon Cahaya)
       // keluar dari Gua Kristal -> muncul di depan Gerbang Dungeon, Kota Dungeon
  if (golemMode) { golemMode = false; WAVES = DUNGEON_WAVES; $('exit').textContent = '🌿 Keluar Dungeon'; }
  if (kotaMode) { kotaMode = false; dgTheme = null; WAVES = DUNGEON_WAVES; $('exit').textContent = '🌿 Keluar Dungeon'; applyArenaTheme('asal'); }
  exploreMode = false; bossRoom = false; R = ARENA_R; disposeExplore();   // keluar dari dungeon jelajah / ruang bos
  const kOut = kId ? gateOut(kId) : KOTA_OUT;   // keluar dari dungeon tambahan -> muncul di depan gerbangnya
  const startKota = !fromHole && !fromGolem && START_IN_KOTA;   // mulai permainan: muncul di Kota Dungeon
  const inKek = !fromHole && !fromGolem && !startKota && START_IN_KEKAISARAN;   // mulai permainan: muncul di halaman istana Kota Kekaisaran, menghadap pintu agung
  const inTown = !fromHole && !inKek && !startKota && CITY.open;   // mulai permainan: muncul di depan Ladang Sawah, di balik gerbang padang (kembali dari dungeon tetap di tepi lubang)
  if (fromKota || startKota) world.ensure('kota-dungeon');   // Kota Dungeon harus sudah selesai dibangun sebelum pemain muncul di sana
  const sp = startKota ? KOTA_START : fromKota ? kOut : fromGolem ? RUINS_DOOR.out : fromHole ? { x: 1.6, z: 6.0 } : inKek ? { x: AULA.spawnOut.x, z: AULA.spawnOut.z, face: AULA.spawnOut.face + Math.PI } : inTown ? SAWAH_SPAWN : SPAWN;
  if (inKek) world.ensure('kekaisaran');   // Kota Kekaisaran (termasuk tangga istana & interior aula) harus sudah selesai dibangun sebelum pemain muncul di sana
  player.position.set(sp.x, inKek ? world.kekGroundY(sp.x, sp.z) : 0, sp.z); player.rotation.set(0, 0, 0); if (vrm) vrm.scene.rotation.x = 0;
  if (inTown) { world.ensure('padang-' + (MEADOW_SEG_X.length - 1)); world.ensure('sawah-1'); }   // gerbang padang & bagian pertama ladang harus sudah selesai dibangun sebelum pemain muncul di sana
  world.refresh(player.position);   // chunk yang tampil langsung menyesuaikan posisi baru (mis. kembali dari dungeon / mulai ulang)
  P.face = startKota ? KOTA_START.face : fromKota ? kOut.face : fromGolem ? RUINS_DOOR.out.face : fromHole ? Math.atan2(sp.x, sp.z) : inKek ? sp.face : inTown ? SAWAH_SPAWN.face : Math.atan2(-SPAWN.x, -SPAWN.z); player.rotation.y = P.face; P.v.set(0, 0, 0);
  camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 9, player.position.y + 4.2, sp.z - Math.cos(P.face) * 9);
  $('boss').hidden = true; $('wave').textContent = fromKota || startKota ? '⚔️ ' + DUNGEON_TOWN.name : fromGolem ? '🏛️ ' + RUINS.name : inKek ? '👑 Halaman Istana' : inTown ? '🌾 ' + SAWAH.name : '🌿 Dataran Hijau'; $('obj').hidden = false; doorBusy = false; doorNear = false;
  inVillage = false; inForest = false; inDeepForest = false; nearAncientGate = false; inCity = false; inMeadow = false; inSawah = false; inDusun = false; inKekaisaran = false; inDataranBL = false; desaBL = -1; inKotaDungeon = false; dgNear = false; dgNearId = -1; kekDistrict = -1; inChurch = false; churchBusy = false; world.church.show(false); inPalace = false; palaceBusy = false; palaceArea = ''; world.palace.show(false); inAula = false; aulaBusy = false; aulaCine = null; aulaArea = ''; world.aula.show(false); inInn = false; innBusy = false; world.inn.show(false); inGuild = false; guildBusy = false; guildNear = false; guildClose(); loot.closeForge(); if (guildRoom) guildRoom.show(false); if (smithRoom) smithRoom.show(false); if (potionRoom) potionRoom.show(false); if (lodgeRoom) lodgeRoom.show(false); guild = null; smithNear = false; potionNear = false; lodgeNear = false; worldFog.density = FOG_DENSITY;
  if (fromKota) { inKotaDungeon = true; dgNear = !kId; dgNearId = kId ? DUNGEON_GATES.findIndex(x => x.id === kId) : -1; }
  if (startKota) inKotaDungeon = true;   // sudah di kota (pesan sambutan ditampilkan di bawah); dgNear tetap false supaya petunjuk portal muncul saat dekat   // sudah di kota: pesan masuk & petunjuk portal tidak perlu muncul lagi
  if (inTown) inSawah = true;   // sudah di ladang: pesan masuk ladang tidak perlu muncul lagi
  if (inKek) { inKekaisaran = true; kekDistrict = -1; }   // sudah di kota: tinggi pemain mengikuti tangga istana; nama distrik muncul di tick pertama
  $('msg').textContent = note || (startKota ? '⚔️ ' + DUNGEON_TOWN.name + '\n' + DUNGEON_TOWN.sub + ' — kota kecil para petualang\nKamu berada di Lembah Bebatuan\nPortal dungeon ada di dinding & ujung lembah' : fromKota ? '⚔️ ' + DUNGEON_TOWN.name + '\nKamu keluar dari ' + (kT ? DG_THEMES[kT].name : 'Gua Kristal') : inKek ? '👑 Halaman Istana\nIstana Kekaisaran\n🚪 Naiki tangga & masuk lewat pintu agung menuju Aula Raja' : fromGolem ? '🏛️ ' + RUINS.name + (golemBeaten ? '\nPenjaga telah ditaklukkan' : '\nKamu selamat keluar dari Pintu Penjaga') : inTown ? '🌾 ' + SAWAH.name + '\nJalan terus ke timur menuju ' + KEKAISARAN.name + '\nKota Arunika ada di barat' : fromHole ? 'Kembali ke Dataran Hijau' : 'Dataran Hijau\nCari lubang menuju dungeon\n🏘️ ' + VILLAGE.name + ' ada di sebelah timur\n🌲 ' + FOREST.name + ' ada di timur desa');
  wildT = 1; calmT = 0;
  setTimeout(() => { if (state === 'world') $('msg').textContent = ''; }, 3500);
  const f = $('fade'); f.style.transition = 'opacity .9s'; f.style.opacity = 0;
}
// Sorotan kamera ke ratu saat masuk Aula Raja: kamera menyapu dari kaki ke wajah ratu (world.aula.queenShot), pemain diam, lalu kamera kembali ke belakang pemain. Ketuk / tekan tombol apa saja = lewati.
const AULA_INTRO = { wait: 8, sweep: 10.0, hold: 2.5, back: 2.0, once: false };   // detik: menunggu ratu selesai dimuat (maks), menyapu, menahan di wajah, kembali ke kamera biasa; once = hanya saat masuk pertama
let aulaCine = null, aulaIntroSeen = false;
const QWALK_CAM = { in: 1.0, out: 1.4 };   // detik: kamera beralih ke sorotan ratu berjalan / kembali ke kamera biasa (sorotan aktif selama ratu berdiri & berjalan menghampiri pemain)
let qwT = 0;   // 0..1 kekuatan sorotan ratu berjalan
// Sorotan kamera ke Isabel saat mengobrol: kamera di depan Isabel (sisi pemain), digeser ke samping supaya pemain tidak menutupi; dist = jarak kamera ke Isabel (m); side = geser sudut (rad, + / - = kiri / kanan);
// h = tinggi kamera di atas kaki Isabel (m); lookH = tinggi titik pandang (sedikit di bawah wajah supaya wajahnya naik ke atas kotak dialog); in / out = detik beralih ke sorotan / kembali ke kamera biasa.
const ITCAM = { dist: 1.25, side: 0.45, h: 1.45, lookH: 1.22, in: 0.7, out: 1.0 };
let itCamT = 0;   // 0..1 kekuatan sorotan Isabel
const LYCAM = { dist: 1.1, side: 0.28, up: 0.1, lookUp: 0.06, in: 0.6, out: 0.8 };   // sorotan wajah Lyra saat ngobrol: dist = jarak kamera dari kepala (m), side = geser ke samping (rad), up = tinggi kamera di atas tulang kepala, lookUp = titik bidik di atas tulang kepala
let lyCamT = 0; const _lyH = new THREE.Vector3();   // 0..1 kekuatan sorotan Lyra
const _cineV = new THREE.Vector3(), _camN = new THREE.Vector3(); let _cineOver = false;   // _camN = posisi kamera ikut-pemain yang terpisah dari kamera sorotan   // dipakai ulang tiap frame sorotan (tanpa alokasi)
const skipAulaCine = () => { if (aulaCine && aulaCine.t < AULA_INTRO.sweep + AULA_INTRO.hold) aulaCine.t = AULA_INTRO.sweep + AULA_INTRO.hold; };
addEventListener('pointerdown', skipAulaCine); addEventListener('keydown', skipAulaCine);
let inVillage = false, inForest = false, inDeepForest = false, nearAncientGate = false, inCity = false, inMeadow = false, inSawah = false, inDusun = false, inKekaisaran = false, inDataranBL = false, desaBL = -1, inKotaDungeon = false, dgNear = false, dgNearId = -1, dgBusy = false, kekDistrict = -1, inChurch = false, churchBusy = false, inPalace = false, palaceBusy = false, palaceArea = '', inAula = false, aulaBusy = false, aulaArea = '', aulaWave = '', inInn = false, innBusy = false, innWave = '', innSaveNear = false, inGuild = false, guildBusy = false, guildWave = '', guildNear = false, guild = null, guildRoom = null, smithRoom = null, smithNear = false, potionRoom = null, potionNear = false, lodgeRoom = null, lodgeNear = false, shopDoor = GUILD_DOOR, GU = { open: false, el: null, opts: null };
// Masuk / keluar Katedral Arunika: layar memudar, pemain dipindah ke ruang dalam (church.js) atau kembali ke alun-alun
function churchGo(inside) {
  churchBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0);
  const f = $('fade'); f.style.transition = 'opacity .35s'; f.style.opacity = 1;
  setTimeout(() => {
    if (state !== 'world') { churchBusy = false; return; }
    const sp = inside ? CHURCH.inSpawn : CHURCH.outSpawn;
    inChurch = inside; world.church.show(inside);
    player.position.set(sp.x, 0, sp.z); P.face = sp.face; player.rotation.y = P.face; P.v.set(0, 0, 0); world.refresh(player.position);
    camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 6, 4, sp.z - Math.cos(P.face) * 6);
    const m = inside ? '⛪ ' + CHURCH.name + '\nMelangkahlah ke pintu untuk keluar' : '🏙️ ' + CITY.name; $('msg').textContent = m;
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3000);
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    setTimeout(() => { churchBusy = false; }, 700);
  }, 380);
}
// Masuk / keluar Istana Arunika (2 lantai, lihat palace.js & palace-layout.js): sama seperti katedral, layar memudar lalu pemain dipindah
function palaceGo(inside) {
  palaceBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0); if (inside) clearWild();
  const f = $('fade'); f.style.transition = 'opacity .35s'; f.style.opacity = 1;
  setTimeout(() => {
    if (state !== 'world') { palaceBusy = false; return; }
    const sp = inside ? PALACE.inSpawn : PALACE.outSpawn;
    inPalace = inside; world.palace.show(inside); palaceArea = '';
    player.position.set(sp.x, 0, sp.z); P.face = sp.face; player.rotation.y = P.face; P.v.set(0, 0, 0); world.refresh(player.position);
    camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 6, 4, sp.z - Math.cos(P.face) * 6);
    if (inside) world.palace.clipCam(player.position, cam.position);   // kamera tidak boleh di luar dinding saat muncul
    const m = inside ? '🏰 ' + PALACE.name + '\nTangga agung menuju balairung' : '🏙️ ' + CITY.name;
    $('msg').textContent = m; $('wave').textContent = inside ? '🏰 ' + PALACE.name : '🌿 Dataran Hijau';
    setTimeout(() => { if (m && $('msg').textContent === m) $('msg').textContent = ''; }, 3600);
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    setTimeout(() => { palaceBusy = false; }, 700);
  }, 380);
}
// Masuk / keluar Aula Raja (Istana Kekaisaran, lantai 1; lihat kekaisaran-istana-layout.js & kekaisaran-aula.js): layar memudar, pemain dipindah ke dalam / ke tangga luar
function aulaGo(inside) {
  aulaBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0); if (inside) clearWild();
  const f = $('fade'); f.style.transition = 'opacity .35s'; f.style.opacity = 1;
  setTimeout(() => {
    if (state !== 'world') { aulaBusy = false; return; }
    const sp = inside ? AULA.spawnIn : AULA.spawnOut;
    inAula = inside; world.aula.show(inside); aulaArea = '';
    if (inside) world.aula.isabelEnter({ x: sp.x, z: sp.z, y: world.aula.groundY(sp.x, sp.z, 0), face: sp.face }); else world.aula.isabelExit({ x: sp.x, z: sp.z, face: sp.face }, ISA_ENV);   // Isabel yang ikut, ikut masuk / keluar
    player.position.set(sp.x, inside ? world.aula.groundY(sp.x, sp.z, 0) : world.kekGroundY(sp.x, sp.z), sp.z); P.face = sp.face; player.rotation.y = P.face; P.v.set(0, 0, 0); world.refresh(player.position);
    camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 6, player.position.y + 4, sp.z - Math.cos(P.face) * 6);
    if (inside) world.aula.clipCam(player.position, cam.position);   // kamera tidak boleh di luar dinding saat muncul
    if (inside) aulaWave = $('wave').textContent;
    if (inside && !(AULA_INTRO.once && aulaIntroSeen) && world.aula.queenReady() >= 0) { aulaCine = { t: 0, wait: 0 }; aulaIntroSeen = true; } else aulaCine = null;   // sorotan ke ratu
    if (!inside) aulaCine = null;
    const m = inside ? '' : '👑 Halaman Istana';   // masuk aula: tanpa tulisan (hanya label gelombang di atas)
    $('msg').textContent = m; $('wave').textContent = inside ? '🏯 ' + AULA.name : (aulaWave || '🌿 Dataran Hijau');
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3600);
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    setTimeout(() => { aulaBusy = false; }, 700);
  }, 380);
}
// Masuk / keluar Penginapan Karavan (Distrik 2; lihat kekaisaran-penginapan.js): layar memudar, pemain dipindah ke ruang dalam yang kecil / kembali ke depan pintu
function innGo(inside) {
  innBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0); if (inside) clearWild();
  const f = $('fade'); f.style.transition = 'opacity .35s'; f.style.opacity = 1;
  setTimeout(() => {
    if (state !== 'world') { innBusy = false; return; }
    const sp = inside ? world.inn.spawn.in : world.inn.spawn.out;   // titik muncul (dunia) + arah hadap
    if (inside) innWave = $('wave').textContent;                    // simpan teks label atas supaya bisa dikembalikan saat keluar
    inInn = inside; if (!inside) AFTER.back = false; innSaveNear = false; world.inn.show(inside);
    player.position.set(sp.x, inside ? world.inn.groundY() : world.kekGroundY(sp.x, sp.z), sp.z); P.face = sp.face; player.rotation.y = P.face; P.v.set(0, 0, 0); world.refresh(player.position);
    camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 6, player.position.y + 4, sp.z - Math.cos(P.face) * 6);
    if (inside) world.inn.clipCam(player.position, cam.position);   // kamera tidak boleh di luar dinding saat muncul
    const isp = { x: sp.x, y: player.position.y, z: sp.z, face: sp.face };   // Isabel: yang ikut muncul di sisi pemain di dalam; saat keluar, yang ikut / tertinggal di dalam muncul di depan pintu
    if (inside) world.aula.isabelWarp(isp, INN_ENV);
    else { const q = world.aula.isabelPos(); if (q && world.inn.inside(q.x, q.z)) world.aula.isabelWarp(isp, ISA_ENV, true); }
    const m = inside ? '🛏️ ' + world.inn.name + '\nMelangkahlah ke pintu untuk keluar' : '🛍️ Distrik 2 — Merchant Quarter';
    $('msg').textContent = m; $('wave').textContent = inside ? '🛏️ ' + world.inn.name : (innWave || '🌿 Dataran Hijau');
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3000);
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    setTimeout(() => { innBusy = false; }, 700);
  }, 380);
}
// ============================================================
//  BALAI PETUALANG (guild) di Kota Dungeon — interior di kota-guild.js. Melangkah ke lingkaran cahaya di depan pintu guild (GUILD_DOOR, kota-dungeon.js) = layar memudar, pemain dipindah ke ruangan; melangkah ke pintu depan ruangan = keluar.
//  Isi: Mira (resepsionis: daftar, makan & istirahat = HP penuh, kartu petualang, info dungeon), Garrick (Master Guild: cerita & saran), Papan Misi (6 dungeon + status). Peringkat naik tiap bos dungeon baru dikalahkan (tersimpan di perangkat).
// ============================================================
const GSAVE = 'luis-balai-petualang';
const gLoad = () => { try { return JSON.parse(localStorage.getItem(GSAVE) || '{}'); } catch (e) { return {}; } };
const gSave = p => { try { localStorage.setItem(GSAVE, JSON.stringify({ ...gLoad(), ...p })); } catch (e) { /* abaikan */ } };
function guildClear(id) { const s = gLoad(); gSave({ clears: { ...(s.clears || {}), [id]: true } }); }   // dipanggil end(true) saat bos dungeon Kota Dungeon dikalahkan
const GUILD_RANKS = ['F · Pemula', 'E · Perunggu', 'D · Perak', 'C · Emas', 'B · Platinum', 'A · Berlian', 'S · Penakluk Lembah'];
const GUILD_ORDER = ['kristal', 'batu', 'api', 'es', 'kegelapan', 'cahaya'];   // urutan dari mulut lembah sampai ujungnya
const guildInfo = () => { const s = gLoad(), c = s.clears || {}, n = GUILD_ORDER.filter(i => c[i]).length; return { member: !!s.member, clears: c, n, rank: GUILD_RANKS[n] }; };
const guildQuest = id => {
  if (id === MAIN_DUNGEON.id) return { id, icon: MAIN_DUNGEON.icon, name: MAIN_DUNGEON.name, sub: MAIN_DUNGEON.sub, boss: DG_THEMES.cahaya.boss, where: 'Portal emas di ujung Lembah Bebatuan' };
  const g = DUNGEON_GATES.find(x => x.id === id), th = DG_THEMES[id], k = DUNGEON_GATES.indexOf(g);
  return { id, icon: g.icon, name: g.name, sub: g.sub, boss: th ? th.boss : 'Mutan Kristal / Penyihir Kristal', where: 'Dinding ' + (g.side < 0 ? 'kiri' : 'kanan') + ' lembah, ' + (k < 2 ? 'dekat mulut lembah' : k < 4 ? 'di tengah lembah' : 'di bagian terdalam lembah') };
};
const getGuild = () => guildRoom || (guildRoom = (() => { const G = buildGuildInterior(); world.group.add(G.group); return G; })());   // dibangun saat pertama dipakai (tidak membebani saat game dimulai)
const getLodge = () => lodgeRoom || (lodgeRoom = (() => { const G = buildLodgeInterior(); world.group.add(G.group); return G; })());   // interior Penginapan Kota Dungeon (dibangun saat pertama dipakai)
const getPotion = () => potionRoom || (potionRoom = (() => { const G = buildPotionInterior(); world.group.add(G.group); return G; })());   // interior Toko Ramuan (dibangun saat pertama dipakai)
const getSmith = () => smithRoom || (smithRoom = (() => { const G = buildSmithInterior(); world.group.add(G.group); return G; })());   // interior Pandai Besi: `guild` = interior yang sedang dimasuki (guild atau pandai besi)
const guildSpotNow = () => { const sp = state === 'world' && inGuild && guild && !guildBusy && !GU.open && !QT.phase && !IT.open ? guild.nearSpot(player.position.x, player.position.z) : null; return sp && sp.id === 'lyra' && lyra.waiting ? null : sp; };   // saat Lyra menunggu di tempat lain, titik bicara 'lyra' di guild tidak aktif (lyraNearNow yang menangani)

// ---- kotak dialog (DOM sederhana; pilih dengan klik / ketuk atau tombol angka, Q / Esc = tutup) ----
const GUI_CSS = 'position:fixed;left:50%;bottom:4%;transform:translateX(-50%);width:min(620px,94vw);max-height:78vh;overflow:auto;z-index:60;background:rgba(30,18,10,.95);border:3px solid #d9b24a;border-radius:14px;padding:14px 16px;color:#f2e8c8;font:16px/1.45 Georgia,serif;box-shadow:0 8px 30px rgba(0,0,0,.6);';
// panel LEBAR & PENDEK (dipakai Lyra supaya wajahnya tidak tertutup): melebar ke samping di dasar layar; teks dulu, klik / E / Spasi / Enter -> baru pilihan jawaban
const GUI_FLAT = { css: 'position:fixed;left:50%;bottom:1.5%;transform:translateX(-50%);width:min(980px,97vw);max-height:26vh;overflow:auto;z-index:60;background:rgba(30,18,10,.88);border:2px solid #d9b24a;border-radius:12px;padding:8px 14px;color:#f2e8c8;font:15px/1.4 Georgia,serif;box-shadow:0 4px 18px rgba(0,0,0,.5);', btn: 'flex:1 1 auto;text-align:left;padding:7px 12px;background:#4a2f18;color:#ffe9a8;border:1px solid #d9b24a;border-radius:8px;font:inherit;font-size:14px;cursor:pointer' };
function guildShow(who, text, opts, flat) {
  if (!GU.el) {
    const el = document.createElement('div'); el.id = 'guildui';
    el.style.cssText = GUI_CSS;
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) el.addEventListener(ev, e => e.stopPropagation());   // klik di kotak tidak ikut menyerang / menggerakkan
    el.addEventListener('click', () => { if (GU.wait && GU.go) GU.go(); });   // panel teks Lyra: klik = lanjut ke pilihan
    document.body.appendChild(el); GU.el = el;
  }
  const el = GU.el; el.replaceChildren(); GU.wait = false; GU.go = null; el.style.cssText = flat ? GUI_FLAT.css : GUI_CSS;
  if (flat) {   // tahap 1: hanya teks lawan bicara; tahap 2 (GU.go): ganti dengan baris pilihan jawaban
    const head = () => { const h = document.createElement('div'); h.textContent = who; h.style.cssText = 'color:#ffd24a;font-weight:bold;font-size:15px;margin-bottom:3px'; return h; };
    const t = document.createElement('div'); t.textContent = text; t.style.cssText = 'white-space:pre-wrap';
    const hint = document.createElement('div'); hint.textContent = '▶ E / klik untuk lanjut'; hint.style.cssText = 'text-align:right;font-size:12px;color:#d9b24a;margin-top:2px';
    GU.opts = opts; GU.wait = true; if (who === LYRA_NAME) lyra.say(text);   // mulut Lyra bergerak sepanjang teks
    GU.go = () => {
      if (who === LYRA_NAME) lyra.say(null);
      const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
      opts.forEach((o, i) => { const b = document.createElement('button'); b.textContent = (i + 1) + '. ' + o.t; b.style.cssText = GUI_FLAT.btn; b.addEventListener('click', ev => { ev.stopPropagation(); guildPick(i); }); row.appendChild(b); });
      el.replaceChildren(head(), row); GU.wait = false; GU.go = null;
    };
    el.append(head(), t, hint);
    el.hidden = false; GU.open = true; stick.x = stick.y = 0; P.v.set(0, 0, 0); try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* abaikan */ }
    return;
  }
  const h = document.createElement('div'); h.textContent = who; h.style.cssText = 'color:#ffd24a;font-weight:bold;font-size:18px;margin-bottom:6px';
  const t = document.createElement('div'); t.textContent = text; t.style.cssText = 'white-space:pre-wrap;margin-bottom:10px';
  el.append(h, t); GU.opts = opts;
  opts.forEach((o, i) => {
    const b = document.createElement('button'); b.textContent = (i + 1) + '. ' + o.t;
    b.style.cssText = 'display:block;width:100%;text-align:left;margin:5px 0;padding:9px 12px;background:#4a2f18;color:#ffe9a8;border:1px solid #d9b24a;border-radius:8px;font:inherit;cursor:pointer';
    b.addEventListener('click', ev => { ev.stopPropagation(); guildPick(i); }); el.appendChild(b);
  });
  el.hidden = false; GU.open = true; stick.x = stick.y = 0; P.v.set(0, 0, 0); try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* abaikan */ }
}
const guildPick = i => { const o = GU.opts && GU.opts[i]; if (o) o.f(); };
function guildClose() { lyra.setTalk(false); GU.wait = false; GU.go = null; GU.opts = null; if (GU.el) GU.el.hidden = true; GU.open = false; }
function guildKey(e) {   // dipanggil dari keydown selagi kotak dialog terbuka
  if (GU.wait) {   // tahap teks (panel Lyra): E / Spasi / Enter = lanjut ke pilihan, Q = tutup; angka diabaikan sampai pilihan muncul
    if (e.code === 'KeyQ' || e.code === 'Backspace') { e.preventDefault(); guildClose(); }
    else if (!e.repeat && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) { e.preventDefault(); if (GU.go) GU.go(); }
    return;
  }
  const n = e.code.startsWith('Digit') ? +e.code.slice(5) : e.code.startsWith('Numpad') ? +e.code.slice(6) : NaN;
  if (n >= 1 && GU.opts && n <= GU.opts.length) { e.preventDefault(); guildPick(n - 1); }
  else if (e.code === 'KeyQ' || e.code === 'Backspace') { e.preventDefault(); guildClose(); }
}
const gBye = { t: 'Sampai nanti.', f: guildClose };

// ---- Warga Kota Dungeon (NPC berpapan nama di jalan, alun-alun, gerbang lembah; isi percakapan ada di kota-warga.js) ----
// talkTarget(): siapa yang bisa diajak bicara sekarang? Kaelen (bila dekat) atau warga terdekat (radius 2.8 m). Mengembalikan { id, nama } atau null.
let wargaHint = false;
function talkTarget() {
  if (state === 'world' && inDataranBL && !inKotaDungeon && !inGuild && !inInn && !GU.open && !QT.phase && !IT.open && !kaelenOn()) { const d = desaBLNear(player.position.x, player.position.z); if (d) return { id: 'bl:' + d.id, nama: d.name }; }   // warga dusun di padang
  if (state !== 'world' || !inKotaDungeon || inGuild || inInn || GU.open || QT.phase || IT.open || kaelenOn()) return null;
  const KB = globalThis.KAELEN_BATTLE; if (KB && KB.nearChallenge()) return { id: 'kaelen', nama: 'Kaelen' };
  const K = globalThis.KOTA_WARGA;
  if (!wargaHint) { wargaHint = true; toast(K ? '💬 Dekati NPC berpapan nama lalu tekan E untuk bicara' : '⚠️ Warga belum aktif: kota-dungeon.js masih versi lama / belum termuat', 4200); }   // pesan sekali per sesi (sekaligus tanda bahwa kode baru terpasang)
  const w = K && K.near(player.position.x, player.position.z, 2.8);
  return w && WARGA[w.id] ? { id: w.id, nama: WARGA[w.id].nama } : null;
}
function desaTalk(id, pre) {   // warga 3 dusun di Padang Rumput Barat Laut (data: WARGA_BL di kekaisaran-dataran.js)
  const w = WARGA_BL.find(x => x.id === id); if (!w) return;
  guildShow('🧑‍🌾 ' + w.name + ' — ' + w.role, pre || w.sapa, [
    { t: '💬 Apa kabar?', f: () => desaTalk(id, w.kabar) },
    { t: '📜 Ada rumor apa?', f: () => desaTalk(id, w.rumor) },
    ...(w.topik || []).map(k => ({ t: k.t, f: () => desaTalk(id, k.a) })),
    gBye]);
}
function wargaTalk(id, pre) {   // pre = kalimat yang ditampilkan (kosong = sapaan pertama)
  if (id.startsWith('bl:')) return desaTalk(id.slice(3), pre);
  const w = WARGA[id]; if (!w) return;
  guildShow((w.ikon || '🧑') + ' ' + w.nama + ' — ' + w.peran, pre || w.sapa, [
    { t: '💬 Apa kabar?', f: () => wargaTalk(id, w.kabar) },
    { t: '📜 Ada rumor apa di kota ini?', f: () => wargaTalk(id, w.rumor) },
    ...(w.topik || []).map(k => ({ t: k.t, f: () => wargaTalk(id, k.a) })),   // pilihan tambahan khusus NPC ini (kalau ada)
    gBye]);
}
// ---- Kaelen: bicara dulu, duel hanya kalau pemain memilih menantang ----
const KAELEN_NAMA = '🛡️ Kaelen — Pendekar Kardus';
function kaelenMenu(pre) {
  guildShow(KAELEN_NAMA, pre || KAELEN_TALK.sapa, [
    { t: 'Kaukah Kaelen yang terkenal itu?', f: () => kaelenMenu(KAELEN_TALK.siapa) },
    { t: 'Kenapa zirahmu dari kardus?', f: () => kaelenMenu(KAELEN_TALK.kardus) },
    { t: 'Ceritakan soal Dungeon Es.', f: () => kaelenMenu(KAELEN_TALK.es) },
    { t: '⚔️ Aku menantangmu duel!', f: () => { guildClose(); const KB = globalThis.KAELEN_BATTLE; if (KB && KB.nearChallenge()) KB.start(); } },
    gBye]);
}

// ---- Mira, resepsionis ----
const MIRA = '🧑‍💼 Mira — Resepsionis Guild';
function miraMenu(pre) {
  const gi = guildInfo();
  if (!gi.member) {
    guildShow(MIRA, pre || 'Selamat datang di Balai Petualang! Kamu belum terdaftar, ya? Pendaftarannya gratis. Dengan kartu petualang, kamu boleh turun ke dungeon Lembah Bebatuan atas nama guild, dan keberhasilanmu dicatat di Papan Misi.', [
      { t: '📝 Daftar jadi petualang', f: () => { gSave({ member: true }); miraMenu('Selesai! Selamat bergabung, Louis. Peringkat awalmu F · Pemula. Kalahkan bos dungeon untuk naik peringkat.'); } },
      { t: '❔ Apa saja yang ada di guild ini?', f: miraAbout },
      { t: '📜 Dengar rumor kota', f: () => miraMenu(CERITA.mira) },
      gBye]);
    return;
  }
  guildShow(MIRA, pre || ('Selamat datang kembali, Louis!\nPeringkat: ' + gi.rank + ' · ' + gi.n + '/' + GUILD_ORDER.length + ' dungeon ditaklukkan.'), [
    { t: '🍲 Makan & istirahat (pulihkan HP)', f: guildRest },
    { t: '🪪 Kartu petualang', f: miraCard },
    { t: '🗺️ Tanya soal dungeon', f: miraDungeons },
    { t: '📜 Dengar rumor kota', f: () => miraMenu(CERITA.mira) },
    gBye]);
}
function miraAbout() {
  guildShow(MIRA, 'Di sini aku yang mengurus pendaftaran dan menyiapkan makanan hangat bagi petualang yang terluka. Master Garrick, di meja paling belakang, tahu banyak soal Lembah Bebatuan. Dan Papan Misi di dinding kanan mencatat semua bos dungeon beserta siapa yang sudah menaklukkannya.', [{ t: '← Kembali', f: () => miraMenu() }, gBye]);
}
function guildRest() {
  if (P.hp >= P.max) { miraMenu('Kamu kelihatan masih segar bugar. Datanglah lagi kalau sudah terluka.'); return; }
  P.hp = P.max; burst(player.position.clone().setY(1.2), 0x6dff9c, 16, 4);
  miraMenu('Duduklah dan makan sup hangat ini... Nah, sudah segar lagi! HP-mu pulih sepenuhnya.');
}
function miraCard() {
  const gi = guildInfo();
  guildShow(MIRA, '🪪 KARTU PETUALANG\nNama: Louis\nPeringkat: ' + gi.rank + '\nDungeon ditaklukkan: ' + gi.n + '/' + GUILD_ORDER.length + '\n\n' + GUILD_ORDER.map(id => { const q = guildQuest(id); return (gi.clears[id] ? '✅ ' : '⬜ ') + q.icon + ' ' + q.name; }).join('\n'), [{ t: '← Kembali', f: () => miraMenu() }, gBye]);
}
function miraDungeons() {
  guildShow(MIRA, 'Dungeon mana yang ingin kamu tanyakan? Semuanya ada di Lembah Bebatuan, di ujung jalan utama kota.', [
    ...GUILD_ORDER.map(id => { const q = guildQuest(id); return { t: q.icon + ' ' + q.name, f: () => guildShow(MIRA, q.icon + ' ' + q.name + '\n“' + q.sub + '”\n\nLokasi: ' + q.where + '\nBos: ' + q.boss, [{ t: '← Dungeon lain', f: miraDungeons }, { t: 'Menu utama', f: () => miraMenu() }, gBye]) }; }),
    { t: '← Kembali', f: () => miraMenu() }]);
}

// ---- Garrick, Master Guild ----
const GARRICK = '🧙 Garrick — Master Guild';
function garrickMenu(pre) {
  guildShow(GARRICK, pre || 'Hm? Seorang petualang baru... atau sudah lama? Duduk saja, Nak. Ada yang ingin kau tanyakan padaku?', [
    { t: 'Siapa Anda?', f: () => garrickMenu('Garrick. Dulu aku turun ke semua dungeon di lembah ini, sekarang tugasku menjaga agar para petualang pulang dengan selamat. Kursi ini nyaman, tapi jangan bilang siapa-siapa aku mulai betah.') },
    { t: 'Ceritakan tentang Lembah Bebatuan.', f: () => garrickMenu('Lembah ini memanjang dari mulut kota sampai portal emas di ujungnya. Di dinding kiri dan kanan ada gerbang-gerbang lain: kristal, batu, api, es, dan kegelapan. Dan di ujung, Dungeon Cahaya. Konon siapa pun yang menaklukkan semuanya akan dikenang sebagai penguasa lembah.') },
    { t: 'Ada saran untukku?', f: garrickAdvice },
    { t: 'Siapa petualang terkuat di lembah ini?', f: () => garrickMenu(CERITA.garrickTerkuat) },
    { t: 'Ceritakan soal Kaelen, si zirah kardus.', f: () => garrickMenu(CERITA.garrickKaelen) },
    gBye]);
}
function garrickAdvice() {
  const gi = guildInfo(), next = GUILD_ORDER.find(id => !gi.clears[id]);
  if (!gi.member) return garrickMenu('Daftarlah dulu pada Mira di meja resepsionis. Setelah itu, baru kita bicara soal dungeon.');
  if (!next) return garrickMenu('Semua dungeon sudah kau taklukkan, Nak. Aku tidak punya saran lagi. Justru akulah yang harus belajar darimu.');
  const q = guildQuest(next);
  garrickMenu('Peringkatmu sekarang ' + gi.rank + '. Untuk naik, cobalah ' + q.icon + ' ' + q.name + ' berikutnya. Bosnya ' + q.boss + '. Letaknya: ' + q.where.toLowerCase() + '. Bawa ramuan, dan jangan lupa makan dulu di tempat Mira.');
}

// ---- Papan Misi ----
function boardView() {
  const gi = guildInfo();
  guildShow('📋 Papan Misi — Basmi Bos', GUILD_ORDER.map(id => { const q = guildQuest(id); return (gi.clears[id] ? '✅ ' : '⬜ ') + q.icon + ' ' + q.name + '\n      Bos: ' + q.boss + '\n      ' + q.where; }).join('\n') + '\n\nDitaklukkan: ' + gi.n + '/' + GUILD_ORDER.length + ' · Peringkat ' + gi.rank + (gi.member ? '' : '\n(Daftar dulu pada Mira untuk menjadi anggota guild.)'), [{ t: 'Tutup', f: guildClose }]);
}
// ---- Borin, pandai besi (toko Pandai Besi; dialog sederhana, belum ada jual-beli) ----
const BORIN = '⚒️ Borin — Pandai Besi';
function borinMenu(pre) {
  guildShow(BORIN, pre || 'Selamat datang! Awas lantai yang panas, dan jangan sentuh besi yang masih merah. Ada yang bisa kubantu, Nak?', [
    { t: '🔨 Tempa equipment', f: () => { guildClose(); loot.openForge(true); } },
    { t: 'Apa yang kau tempa di sini?', f: () => borinMenu('Pedang, kapak, perisai, zirah... apa pun yang dibawa petualang pulang dari lembah dalam keadaan penyok. Yang bagus kupajang di rak belakang. Yang retak ya kutempa ulang.') },
    { t: 'Ceritakan soal senjata untuk dungeon.', f: () => borinMenu('Dungeon Api melelehkan baja biasa, dungeon Es membuatnya getas, dan Dungeon Batu menumpulkan mata pedang dalam sekejap. Tidak ada senjata sempurna. Yang ada petualang yang tahu medannya.') },
    { t: 'Boleh aku melihat-lihat?', f: () => borinMenu('Silakan. Rak senjata di belakangku, perisai di dinding kanan, dan baju zirah di pojok itu cuma pajangan. Jangan dipakai, orang-orangannya marah kalau dibongkar.') },
    { t: 'Soal zirah kardus Kaelen...', f: () => borinMenu(CERITA.borinKaelen) },
    gBye]);
}
// ---- Dewi, penjual ramuan (Toko Ramuan; dialog sederhana, belum ada jual-beli) ----
const DEWI = '🧪 Dewi — Penjual Ramuan';
function dewiMenu(pre) {
  guildShow(DEWI, pre || CERITA.dewi, [
    { t: 'Ramuan apa saja yang ada di sini?', f: () => dewiMenu('Merah memulihkan tenaga, hijau menawar racun, biru menahan dingin, emas menambah semangat. Yang ungu hanya kupajang, karena belum ada yang berani meminumnya.') },
    { t: 'Ada saran untuk masuk dungeon?', f: () => dewiMenu(CERITA.dewiDungeon) },
    { t: 'Soal Kaelen, si zirah kardus...', f: () => dewiMenu(CERITA.dewiKaelen) },
    gBye]);
}
// ---- Ratri, pemilik Penginapan Kota Dungeon (menginap = pulihkan HP; belum ada biaya karena game belum punya uang) ----
const RATRI = '🛏️ Ratri — Pemilik Penginapan';
function ratriMenu(pre) {
  guildShow(RATRI, pre || CERITA.ratri, [
    { t: '🛏️ Menginap semalam (pulihkan HP)', f: ratriRest },
    { t: 'Bagaimana kamar-kamarnya?', f: () => ratriMenu(CERITA.ratriKamar) },
    { t: '📜 Ada rumor apa di penginapan ini?', f: () => ratriMenu(CERITA.ratriRumor) },
    { t: 'Soal Kaelen, si zirah kardus...', f: () => ratriMenu(CERITA.ratriKaelen) },
    gBye]);
}
function ratriRest() {
  if (P.hp >= P.max) { ratriMenu('Kamu masih segar bugar, Nak. Datanglah lagi kalau sudah letih.'); return; }
  P.hp = P.max; burst(player.position.clone().setY(1.2), 0x6dff9c, 16, 4);
  ratriMenu('Kasur sudah kusiapkan... Nah, bangunlah. HP-mu pulih sepenuhnya. Sarapan hangat menunggu di meja.');
}
// ---- Lyra, penyihir pendukung (VRM): direkrut di guild, lalu ikut sebagai anggota party. Logika gerak / serang / pulihkan ada di party-lyra.js ----
const LYRA_NAME = LYRA.icon + ' ' + LYRA.name + ' — ' + LYRA.role;
const lyraNearNow = () => state === 'world' && !QT.phase && !IT.open && !GU.open && !kaelenOn() && lyra.near();
function lyraMenu(pre) {
  const inParty = lyra.recruited, waiting = lyra.waiting; lyra.setTalk(true);   // Lyra menghadap pemain & kamera menyorot wajahnya sampai dialog ditutup
  guildShow(LYRA_NAME, pre || (inParty ? LYRA_TALK.sapaParty : waiting ? LYRA_TALK.sapaTunggu : LYRA_TALK.sapa), waiting ? [
    { t: '🤝 Ayo ikut lagi!', f: lyraJoin },
    { t: '💬 Bagaimana perasaanmu?', f: () => lyraMenu(LYRA_TALK.ngobrolTunggu) },
    { t: '✨ Apa kemampuanmu?', f: () => lyraMenu(LYRA_TALK.skill) },
    gBye] : inParty ? [
    { t: '💬 Bagaimana perasaanmu?', f: () => lyraMenu(LYRA_TALK.ngobrol) },
    { t: '✨ Apa saja yang bisa kamu lakukan?', f: () => lyraMenu(LYRA_TALK.skill) },
    { t: '⚡ Kamu juga pakai petir, kan?', f: () => lyraMenu(LYRA_TALK.petir) },
    { t: '😏 Mau lihat petirku?', f: () => lyraMenu(LYRA_TALK.tantang) },
    { t: '⏳ Tunggu di sini dulu.', f: lyraLeave },
    gBye] : [
    { t: '👤 Siapa kamu?', f: () => lyraMenu(LYRA_TALK.siapa) },
    { t: '✨ Apa kemampuanmu?', f: () => lyraMenu(LYRA_TALK.skill) },
    { t: '🤝 Bergabunglah dengan party-ku!', f: lyraJoin },
    gBye], true);
}
function lyraJoin() { const was = lyra.waiting; lyra.recruit(); toast(LYRA.icon + ' ' + LYRA.name + ' bergabung ke party!', 3200); lyraMenu(was ? LYRA_TALK.gabungLagi : LYRA_TALK.gabung); }
function lyraLeave() { lyra.dismiss(); toast(LYRA.icon + ' ' + LYRA.name + (lyra.waiting ? ' menunggu di sini' : ' kembali menunggu di Balai Petualang'), 3200); guildShow(LYRA_NAME, LYRA_TALK.pisah, [gBye], true); }
function guildTalk(id) { if (id === 'recep') miraMenu(); else if (id === 'master') garrickMenu(); else if (id === 'smith') borinMenu(); else if (id === 'potion') dewiMenu(); else if (id === 'lodge') ratriMenu(); else if (id === 'lyra') lyraMenu(); else boardView(); }

// ---- masuk / keluar ----
function guildGo(inside, kind = 'guild') {   // kind: 'guild' (Balai Petualang) atau 'smith' (Pandai Besi); saat keluar dipakai interior yang sedang aktif
  guildBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0); guildClose(); loot.closeForge(); if (inside) clearWild();
  const f = $('fade'); f.style.transition = 'opacity .35s'; f.style.opacity = 1;
  setTimeout(() => {
    if (state !== 'world') { guildBusy = false; return; }
    const G = inside ? (kind === 'smith' ? getSmith() : kind === 'potion' ? getPotion() : kind === 'lodge' ? getLodge() : getGuild()) : (guild || getGuild());
    if (inside) { guild = G; shopDoor = kind === 'smith' ? SMITH_DOOR : kind === 'potion' ? POTION_DOOR : kind === 'lodge' ? LODGE_DOOR : GUILD_DOOR; }
    const sp = inside ? G.spawn : { x: shopDoor.outX, z: shopDoor.outZ, face: shopDoor.face };
    if (inside) guildWave = $('wave').textContent; else world.ensure('kota-dungeon');   // keluar: Kota Dungeon harus sudah ada saat pemain muncul
    inGuild = inside; guildNear = false; smithNear = false; potionNear = false; lodgeNear = false; G.show(inside);
    player.position.set(sp.x, 0, sp.z); P.face = sp.face; player.rotation.y = P.face; P.v.set(0, 0, 0); world.refresh(player.position);
    camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 6, 4, sp.z - Math.cos(P.face) * 6);
    if (inside) G.clipCam(player.position, cam.position);
    const isp = { x: sp.x, y: 0, z: sp.z, face: sp.face };   // Isabel ikut masuk / keluar bersama pemain (sama seperti di penginapan)
    if (inside) world.aula.isabelWarp(isp, GUILD_ENV);
    else { const q = world.aula.isabelPos(); if (q && G.inside(q.x, q.z)) world.aula.isabelWarp(isp, ISA_ENV, true); }
    const ic = G.icon || '⚔️', m = inside ? ic + ' ' + G.name + '\n' + (G.hint || 'Bicaralah dengan Mira & Garrick, atau lihat Papan Misi\nMelangkahlah ke pintu untuk keluar') : '⚔️ ' + DUNGEON_TOWN.name;
    $('msg').textContent = m; $('wave').textContent = inside ? ic + ' ' + G.name : (guildWave || '⚔️ ' + DUNGEON_TOWN.name);
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3200);
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    setTimeout(() => { guildBusy = false; }, 700);
  }, 380);
}
function guildTick() {   // tiap frame selama di dalam guild (menggantikan worldTick luar): pintu keluar
  if (guildBusy || GU.open || !guild) return;
  if (guild.nearExit(player.position.x, player.position.z)) guildGo(false);
}
// Masuk / keluar KAMAR Penginapan Karavan: pintu kamar tertutup; melangkah ke pintu = layar memudar & pemain pindah ke kamar yang luas (id = 0..2; null = kembali ke ruang umum)
function innRoomGo(id) {
  innBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0);
  const f = $('fade'); f.style.transition = 'opacity .35s'; f.style.opacity = 1;
  setTimeout(() => {
    if (state !== 'world' || !inInn) { innBusy = false; return; }
    const sp = id === null ? world.inn.leaveRoom() : world.inn.enterRoom(id);   // titik muncul (dunia) + arah hadap + nama
    if (!sp) { innBusy = false; f.style.transition = 'opacity .5s'; f.style.opacity = 0; return; }
    innSaveNear = false;
    player.position.set(sp.x, sp.y, sp.z); P.face = sp.face; player.rotation.y = P.face; P.v.set(0, 0, 0); world.refresh(player.position);
    camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 6, sp.y + 4, sp.z - Math.cos(P.face) * 6);
    world.inn.clipCam(player.position, cam.position);   // kamera tidak boleh di luar dinding saat muncul
    world.aula.isabelWarp({ x: sp.x, y: sp.y, z: sp.z, face: sp.face }, INN_ENV);   // Isabel yang ikut pindah bersama pemain (ke kamar / kembali ke ruang umum)
    const m = id === null ? '🛏️ ' + sp.name : '🛏️ ' + sp.name + '\nMelangkahlah ke pintu di dinding belakangmu untuk keluar';
    $('msg').textContent = m; $('wave').textContent = '🛏️ ' + sp.name;
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3200);
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    setTimeout(() => { innBusy = false; }, 700);
  }, 380);
}
// Masuk / keluar kamar lantai 2 (Istana Kekaisaran): pintu kamar di galeri selalu tertutup; melangkah ke pintu = layar memudar & pemain dipindah ke ruang kamar yang lebar (id = kamar; null = kembali ke galeri)
function roomGo(id) {
  aulaBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0);
  const f = $('fade'); f.style.transition = 'opacity .35s'; f.style.opacity = 1;
  setTimeout(() => {
    if (state !== 'world' || !inAula) { aulaBusy = false; return; }
    const sp = id ? world.aula.enterRoom(id) : world.aula.leaveRoom();
    if (!sp) { aulaBusy = false; f.style.transition = 'opacity .5s'; f.style.opacity = 0; return; }
    aulaArea = '';
    player.position.set(sp.x, sp.y, sp.z); P.face = sp.face; player.rotation.y = P.face; P.v.set(0, 0, 0); world.refresh(player.position);
    camYaw = P.face + Math.PI; cam.position.set(sp.x - Math.sin(P.face) * 6, sp.y + 4, sp.z - Math.cos(P.face) * 6);
    world.aula.clipCam(player.position, cam.position);   // kamera tidak boleh di luar dinding saat muncul
    const m = id ? '🛏️ ' + sp.name + '\nIstana Kekaisaran · Lantai 2\nMelangkahlah ke pintu di dinding belakangmu untuk keluar ke galeri' : '🏯 ' + sp.name;
    $('msg').textContent = m; $('wave').textContent = '🏯 ' + sp.name;
    setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3200);
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    setTimeout(() => { aulaBusy = false; }, 700);
  }, 380);
}
let secretFound = false; try { secretFound = !!JSON.parse(localStorage.getItem(SECRET_QUEST.storageKey) || '{}').found; } catch (e) { /* abaikan */ }
const ruinsLoad = () => { try { return JSON.parse(localStorage.getItem(RUINS.storageKey) || '{}'); } catch (e) { return {}; } };
const ruinsSave = p => { try { localStorage.setItem(RUINS.storageKey, JSON.stringify({ ...ruinsLoad(), ...p })); } catch (e) { /* abaikan */ } };
let golemBeaten = !!ruinsLoad().golem, doorBusy = false, doorNear = false;
let ruinsFound = false; try { ruinsFound = !!JSON.parse(localStorage.getItem(RUINS.storageKey) || '{}').found; } catch (e) { /* abaikan */ }
function worldTick() {
  if (inGuild) { guildTick(); return; }   // di dalam Balai Petualang: tidak ada pesan area / portal dunia luar
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
  const md = meadowDist(px, pz); // masuk / keluar Padang Rumput Arunika (negatif = di dalam padang); cd > 4 = sudah di luar tembok kota
  if (CITY.open && !inMeadow && md < -10 && cd > 4) { inMeadow = true; say('🌾 ' + MEADOW.name + '\nIkuti jalan tanah ke timur menuju ' + KEKAISARAN.name); }
  else if (inMeadow && (md > -2 || cd < 0)) inMeadow = false;
  const dd = Math.hypot(px - DUSUN.x, pz - DUSUN.z); // masuk / keluar Dusun Ilalang (desa kecil di padang)
  if (!inDusun && dd < DUSUN.radius - 4) { inDusun = true; say('🏡 ' + DUSUN.name + '\nDekati warga lalu tekan tombol Mengobrol'); }
  else if (inDusun && dd > DUSUN.radius + 2) inDusun = false;
  const sd = sawahDist(px, pz); // masuk / keluar Ladang Sawah Gemah Ripah (negatif = di dalam ladang), di balik gerbang padang
  if (!inSawah && sd < -8) { inSawah = true; say('🌾 ' + SAWAH.name + '\nPetak sawah, saluran irigasi & gubuk tani\nJalan terus ke timur menuju ' + KEKAISARAN.name); }
  else if (inSawah && sd > -1) inSawah = false;
  { // Kota Kekaisaran (segi lima): pesan masuk kota & nama distrik saat berpindah
    const kd = kekaisaranDist(px, pz), dn = kd < -2 ? districtAt(px, pz) : -1;
    if (!inKekaisaran && dn >= 0) { inKekaisaran = true; kekDistrict = -1; say('🏯 ' + KEKAISARAN.name + '\nKota segi lima dengan 5 distrik & istana di tengah\nSudah selesai: ' + DISTRICTS.filter(q => q.built).map(q => q.name + ' (' + q.sub + ')').join(', ')); }
    else if (inKekaisaran && kd > 6) inKekaisaran = false;
    if (inKekaisaran && dn !== kekDistrict && dn >= 0) {
      kekDistrict = dn;
      if (dn === 0) say('👑 Halaman Istana\nIstana Kekaisaran\n🚪 Naiki tangga & masuk lewat pintu agung menuju Aula Raja');
      else { const d = DISTRICTS[dn - 1]; say((d.n === 1 ? '⚔️ ' : d.n === 2 ? '🛍️ ' : d.n === 3 ? '🏰 ' : d.n === 4 ? '🔮 ' : d.n === 5 ? '🏛️ ' : '🚧 ') + d.name + ' — ' + d.sub + (d.built ? '' : '\nSegera dibangun')); }
    }
  }
  { // Padang Rumput Barat Laut: hamparan 400 m di luar Gerbang Barat Laut (histeresis 6 m supaya pesan tidak berulang di tepinya)
    if (!inDataranBL && inNwPlain(px, pz)) { inDataranBL = true; say('🌾 Padang Rumput Barat Laut\nHamparan rumput, bunga liar & hutan sejauh 400 m dari Gerbang Barat Laut'); }
    else if (inDataranBL && !inNwPlain(px, pz, 6)) inDataranBL = false;
    { // 3 desa di padang: pesan saat masuk (radius 34 m dari pusat desa; keluar di 42 m supaya pesan tidak berulang)
      const a = inDataranBL ? nwPlainAxis(px, pz) : null; let k = -1;
      if (a) VILLAGES_BL.forEach((v, i) => { if (Math.abs(a.d - v.d) < (desaBL === i ? 42 : 34) && Math.abs(a.off) < (desaBL === i ? 34 : 28)) k = i; });
      if (k !== desaBL) { desaBL = k; if (k >= 0) say('🏡 ' + VILLAGES_BL[k].name + '\nRumah-rumah warga di tepi jalan padang'); }
    }
  }
  { // Kota Dungeon (ujung Padang Rumput Barat Laut): pesan masuk kota, petunjuk di dekat portal, melangkah ke portal = masuk dungeon
    if (!inKotaDungeon && inNwTown(px, pz)) { inKotaDungeon = true; say('⚔️ ' + DUNGEON_TOWN.name + '\n' + DUNGEON_TOWN.sub + ' — kota kecil para petualang'); }
    else if (inKotaDungeon && !inNwTown(px, pz, 6)) { inKotaDungeon = false; dgNear = false; }
    if (inKotaDungeon) {
      if (GUILD_DOOR.ready && !guildBusy && !dgBusy && !innBusy) {   // pintu Balai Petualang: lingkaran cahaya di depan pintu = masuk
        const gdist = Math.hypot(px - GUILD_DOOR.x, pz - GUILD_DOOR.z);
        if (gdist < GUILD_DOOR.r) guildGo(true);
        else if (!guildNear && gdist < 9) { guildNear = true; say('⚔️ Balai Petualang\nMelangkahlah ke lingkaran cahaya di depan pintu untuk masuk'); }
        else if (guildNear && gdist > 16) guildNear = false;
      }
      if (SMITH_DOOR.ready && !guildBusy && !dgBusy && !innBusy) {   // pintu toko Pandai Besi: lingkaran cahaya di depan pintu = masuk
        const sdist = Math.hypot(px - SMITH_DOOR.x, pz - SMITH_DOOR.z);
        if (sdist < SMITH_DOOR.r) guildGo(true, 'smith');
        else if (!smithNear && sdist < 9) { smithNear = true; say('⚒️ Pandai Besi\nMelangkahlah ke lingkaran cahaya di depan pintu untuk masuk'); }
        else if (smithNear && sdist > 16) smithNear = false;
      }
      if (POTION_DOOR.ready && !guildBusy && !dgBusy && !innBusy) {   // pintu Toko Ramuan: lingkaran cahaya di depan pintu = masuk
        const pdist = Math.hypot(px - POTION_DOOR.x, pz - POTION_DOOR.z);
        if (pdist < POTION_DOOR.r) guildGo(true, 'potion');
        else if (!potionNear && pdist < 9) { potionNear = true; say('🧪 Toko Ramuan\nMelangkahlah ke lingkaran cahaya di depan pintu untuk masuk'); }
        else if (potionNear && pdist > 16) potionNear = false;
      }
      if (LODGE_DOOR.ready && !guildBusy && !dgBusy && !innBusy) {   // pintu Penginapan Kota Dungeon: lingkaran cahaya di depan pintu = masuk
        const ldist = Math.hypot(px - LODGE_DOOR.x, pz - LODGE_DOOR.z);
        if (ldist < LODGE_DOOR.r) guildGo(true, 'lodge');
        else if (!lodgeNear && ldist < 9) { lodgeNear = true; say('🛏️ Penginapan\nMelangkahlah ke lingkaran cahaya di depan pintu untuk masuk'); }
        else if (lodgeNear && ldist > 16) lodgeNear = false;
      }
      const a = nwPlainAxis(px, pz), dg = Math.abs(a.d - DUNGEON_TOWN.gateD), inOpen = Math.abs(a.off) < DUNGEON_TOWN.portalHalfW + 6;
      if (!dgNear && dg < 16 && inOpen) { dgNear = true; say(MAIN_DUNGEON.icon + ' ' + MAIN_DUNGEON.name + '\nPortal emas menuju cahaya suci. Melangkahlah ke dalamnya.'); }
      else if (dgNear && (dg > 26 || !inOpen)) dgNear = false;
      if (!dgBusy && dg < 1.6 && Math.abs(a.off) < DUNGEON_TOWN.portalHalfW) dungeonGateGo(MAIN_DUNGEON.id);   // gerbang TENGAH = Dungeon Cahaya
      DUNGEON_GATES.forEach((g, i) => {   // 5 dungeon tambahan di dinding Lembah Bebatuan: dekat = petunjuk, masuk relung = masuk dungeon bertema
        const gd = Math.abs(a.d - g.d), go = a.off * g.side, near = Math.hypot(gd, go - g.w);   // go: jarak ke arah dinding sisi gerbang ini
        if (dgNearId !== i && near < 16) { dgNearId = i; say(g.icon + ' ' + g.name + '\n' + g.sub + '\nMelangkahlah ke portal di dinding lembah.'); }
        else if (dgNearId === i && near > 26) dgNearId = -1;
        if (!dgBusy && gd < 2.6 && go > g.w - 0.6) dungeonGateGo(g.id === 'kristal' ? null : g.id);   // relung 'kristal' = Gua Kristal (tema null)
      });
    }
  }
  if (CITY.open && !churchBusy) { // pintu katedral (luar) & pintu keluar (dalam)
    if (!inChurch && Math.hypot(px - CHURCH.door.x, pz - CHURCH.door.z) < CHURCH.door.r) churchGo(true);
    else if (inChurch && Math.hypot(px - CHURCH.exit.x, pz - CHURCH.exit.z) < CHURCH.exit.r) churchGo(false);
  }
  if (CITY.open && !palaceBusy) { // gerbang istana (luar) & pintu utama (dalam)
    if (!inPalace && Math.hypot(px - PALACE.door.x, pz - PALACE.door.z) < PALACE.door.r) palaceGo(true);
    else if (inPalace && player.position.y < 1 && Math.hypot(px - PALACE.exit.x, pz - PALACE.exit.z) < PALACE.exit.r) palaceGo(false);
  }
  if (inPalace && !palaceBusy) { // nama ruangan (judul di atas layar + toast) saat berpindah ruang / lantai
    const a = world.palace.area(px, pz, player.position.y);
    if (a && a !== palaceArea) { palaceArea = a; $('wave').textContent = '🏰 ' + a; toast('🏰 ' + a, 2200); }
  }
  if (!aulaBusy && world.aula.ready && !inPalace && !inChurch) { // pintu agung Istana Kekaisaran (luar, di portico) & ujung serambi (dalam)
    if (!inAula && inKekaisaran && Math.hypot(px - AULA.door.x, pz - AULA.door.z) < AULA.door.r) aulaGo(true);
    else if (inAula) {
      if (world.aula.inRoom()) { if (world.aula.roomExit(px, pz)) roomGo(null); }                     // di dalam kamar: pintu keluar -> kembali ke galeri
      else if (inAulaExit(px, pz)) aulaGo(false);
      else { const rid = world.aula.doorAt(px, pz, player.position.y); if (rid) roomGo(rid); }       // di galeri lantai 2: pintu kamar -> masuk kamar
    }
  }
  if (!innBusy && world.inn.ready && !inPalace && !inChurch && !inAula) { // pintu Penginapan Karavan (luar, depan pintu) & depan pintu keluar (dalam)
    if (!inInn && inKekaisaran && world.inn.nearDoor(px, pz)) innGo(true);
    else if (inInn) {
      if (world.inn.inRoom() !== null) { if (world.inn.roomExit(px, pz)) innRoomGo(null); }   // di dalam kamar: pintu keluar -> kembali ke ruang umum
      else if (world.inn.nearExit(px, pz)) innGo(false);                                      // ruang umum: pintu depan -> keluar penginapan
      else { const rid = world.inn.doorAt(px, pz); if (rid !== null) innRoomGo(rid); }          // ruang umum: pintu kamar -> masuk kamar
    }
  }
  if (inInn && !innBusy) { // dekat Buku Tamu = tempat save game (fitur simpan menyusul): tampilkan petunjuk sekali tiap mendekat
    const ns = world.inn.nearSave(px, pz);
    if (ns && !innSaveNear) toast('📖 Buku Tamu — tempat menyimpan game (segera hadir)', 3200);
    innSaveNear = ns;
  }
  if (inAula && !aulaBusy) { // nama ruangan (judul di atas layar + toast) saat berpindah ruang / ke singgasana
    const a = world.aula.area(px, pz, player.position.y);
    if (a && a !== aulaArea) { const first = !aulaArea; aulaArea = a; $('wave').textContent = '🏯 ' + a; if (!first) toast('🏯 ' + a, 2200); }
  }
  if (!secretFound && Math.hypot(px - SECRET_GLADE.x, pz - SECRET_GLADE.z) < SECRET_GLADE.r + 3) { // pertama kali menemukan tempat rahasia (tersimpan di perangkat)
    secretFound = true; try { localStorage.setItem(SECRET_QUEST.storageKey, JSON.stringify({ found: true })); } catch (e) { /* abaikan */ }
    say('✨ Tempat Tersembunyi\nSesuatu menunggu di tengah lingkaran batu...'); }
  if (!ruinsFound && Math.hypot(px - RUINS.x, pz - RUINS.z) < RUINS.r + 4) { // pertama kali menemukan Reruntuhan Kuno di ujung Sungai Bening (tersimpan di perangkat)
    ruinsFound = true; ruinsSave({ found: true });
    say('🏛️ ' + RUINS.name + '\nSungai Bening berakhir di tempat yang terlupakan...'); }
  { // Pintu Penjaga (Reruntuhan Kuno): daun pintu terbuka saat didekati; melangkah ke lorongnya = masuk arena golem
    const nd = Math.hypot(px - RUINS_DOOR.near.x, pz - RUINS_DOOR.near.z);
    DOOR_FX.open += (clamp01((RUINS_DOOR.near.r - nd) / 6) - DOOR_FX.open) * 0.06;
    if (!doorNear && nd < 14) { doorNear = true; say('🚪 ' + RUINS_DOOR.name + '\n' + (golemBeaten ? 'Penjaga sudah ditaklukkan, tapi pintunya masih terbuka...' : 'Getaran berat terasa dari dalam. Bersiaplah.')); }
    else if (doorNear && nd > 24) doorNear = false;
    if (!doorBusy && Math.hypot(px - RUINS_DOOR.trigger.x, pz - RUINS_DOOR.trigger.z) < RUINS_DOOR.trigger.r) golemGo();
  }
  const fw = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) }, rt = { x: Math.cos(camYaw), z: -Math.sin(camYaw) }; // arah depan & kanan kamera
  $('objA').style.transform = `rotate(${Math.atan2(-px * rt.x - pz * rt.z, -px * fw.x - pz * fw.z)}rad)`;
  $('objD').textContent = Math.max(0, Math.round(Math.hypot(px, pz) - HOLE_R)) + ' m';
  if (Math.hypot(px, pz) < HOLE_R - 0.4) startFall();
}
function dungeonGateGo(id = null) { // melangkah ke portal Gerbang Dungeon (Kota Dungeon): layar memudar, lalu masuk arena dungeon yang sama dengan lubang di tengah dunia
  dgBusy = true; clearWild(); audio.setScene(null); stick.x = stick.y = 0; P.v.set(0, 0, 0); $('msg').textContent = ''; $('obj').hidden = true;
  const f = $('fade'); f.style.transition = 'opacity .5s'; f.style.opacity = 1;
  setTimeout(() => { dgBusy = false; if (state !== 'world') return; enterKotaDungeon(id); }, 540);
}
function enterKotaDungeon(id = null) { // dungeon Kota Dungeon (Gua Kristal, Cahaya, Kegelapan, Api, Es, Batu): kini DUNGEON YANG BISA DIJELAJAHI (lorong + ruangan berisi musuh); ruang bos (arena bundar) ada di ujungnya lewat Gerbang Ruang Bos
  kotaMode = true; dgTheme = id; $('exit').textContent = '⚔️ Keluar ke Kota Dungeon';
  applyArenaTheme(id || 'kota'); audio.setScene('dungeon'); world.group.visible = false; scene.fog = arenaFog;
  $('obj').hidden = true; if (vrm) vrm.scene.rotation.x = 0;
  startExplore(); state = 'play';
  banner(exploreName() + '\nJelajahi dungeon & kalahkan semua musuh\nGerbang Ruang Bos terbuka setelahnya', 3800); shake = 0.6; burst(player.position.clone().setY(0.2), id ? DG_THEMES[id].fx : 0x7fe9ff, 22, 4);
  const f = $('fade'); f.style.transition = 'opacity .9s'; f.style.opacity = 0;
}
// ---------- Dungeon jelajah (Kota Dungeon): lorong + ruangan, gerbang bos terkunci sampai semua musuh kalah ----------
const exploreName = () => dgTheme ? DG_THEMES[dgTheme].icon + ' ' + DG_THEMES[dgTheme].name : '💎 Gua Kristal';
const bossName = () => dgTheme ? DG_THEMES[dgTheme].boss : mutantGltf ? MUTANT.name : 'Velkaris, Penyihir Kristal';
const exploreHud = () => { $('wave').textContent = exploreName() + (xLeft > 0 ? ' — Musuh tersisa: ' + xLeft : ' — Gerbang Ruang Bos terbuka'); };
function disposeExplore() { if (dgX) { dgX.dispose(); dgX = null; } }
function startExplore() { // bangun denah (tetap untuk tiap dungeon), taruh musuh di tiap ruangan, pemain muncul di ruang awal
  loot.clear(); disposeExplore();
  const key = dgTheme || 'kota';
  dgX = buildDungeonJelajah(THREE, { id: key, theme: ARENA_THEMES[key], tex: floorMat.map, onGate: exploreGateGo, onExit: exploreExit, onHeal: exploreHeal });
  scene.add(dgX.group);
  { const lt = c => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.4);   // latar & kabut dungeon jelajah dibuat terang + tipis (tidak gelap); dikembalikan oleh applyArenaTheme saat masuk ruang bos
    scene.background.copy(lt(ARENA_THEMES[key].bg)); arenaFog.color.copy(lt(ARENA_THEMES[key].fog)); arenaFog.density = 0.012; }
  xSafe.x = dgX.start.x; xSafe.z = dgX.start.z;
  exploreMode = true; bossRoom = false; R = 1e4; WAVES = KOTA_WAVES; wave = 0; next = 0; xBusy = false;   // R sangat besar = pembatas arena bundar (di skill, bos & musuh) tidak aktif selama menjelajah
  arenaG.visible = false;
  P.face = dgX.start.face; player.position.set(dgX.start.x, 0, dgX.start.z); player.rotation.set(0, P.face, 0); P.v.set(0, 0, 0); P.kb.set(0, 0, 0); P.push.set(0, 0, 0);
  camYaw = P.face + Math.PI; cam.position.set(dgX.start.x - Math.sin(P.face) * 9, 5, dgX.start.z - Math.cos(P.face) * 9);
  for (const sp of dgX.spawns) { const e = mkEnemy(false, sp.variant, sp); e.xroom = sp.room; }
  xLeft = dgX.spawns.length; $('boss').hidden = true; exploreHud();
}
function xAggro(e, dist) { // musuh dungeon jelajah diam sampai pemain masuk ruangannya / mendekat (atau dipukul); sesudah itu terus mengejar
  if (!e.aggro && dgX && (dist < 9 || dgX.roomAt(player.position.x, player.position.z) === e.xroom)) e.aggro = true;
  return !!e.aggro;
}
function exploreTick(dt) {
  if (!dgX || state !== 'play') return;
  dgX.update(dt, clock.elapsedTime, player.position);
  let n = 0; for (const e of enemies) if (e.xroom != null && !e.dying) n++;
  if (n !== xLeft) { xLeft = n; exploreHud(); }
  if (n === 0 && !dgX.gateOpen) { dgX.setGateOpen(true); exploreHud(); banner('🔓 Gerbang Ruang Bos terbuka!\nMasuklah ke gerbang bercahaya di ujung dungeon', 3800); burst(player.position.clone().setY(1), 0xffe27a, 18, 5); }
}
function exploreHeal(n, x, z) { P.hp = Math.min(P.max, P.hp + n); burst(new THREE.Vector3(x, 1.2, z), 0x6dff9c, 16, 4); toast('💚 Kristal penyembuh: +' + n + ' HP', 1800); }
function exploreFade(then) { // layar memudar, lalu pindah (dipakai gerbang bos & pintu keluar)
  if (xBusy) return; xBusy = true; stick.x = stick.y = 0; P.v.set(0, 0, 0);
  const f = $('fade'); f.style.transition = 'opacity .6s'; f.style.opacity = 1;
  setTimeout(() => { xBusy = false; if (state === 'play') then(); else f.style.opacity = 0; }, 650);
}
function exploreGateGo() { exploreFade(enterBossRoom); }
function exploreExit() { exploreFade(() => restart(true)); }   // pintu keluar di ruang awal -> kembali ke Kota Dungeon
function enterBossRoom() { // masuk ruang bos: arena bundar lama, hanya berisi bos level 3
  loot.collectAll();   // item yang masih tercecer di lorong ikut terambil
  exploreMode = false; bossRoom = true; R = ARENA_R; WAVES = BOSS_WAVES; wave = 0; next = 0;
  if (dgX) dgX.group.visible = false; arenaG.visible = true; applyArenaTheme(dgTheme || 'kota'); scene.fog = arenaFog;
  [...enemies].forEach(e => scene.remove(e.g)); enemies.length = 0;
  P.hp = Math.min(P.max, P.hp + 30); P.kb.set(0, 0, 0); P.push.set(0, 0, 0);
  player.position.set(0, 0, 0); player.rotation.set(0, 0, 0); P.face = 0; P.v.set(0, 0, 0); camYaw = 0; cam.position.set(0, 6, 13);
  banner('👹 Ruang Bos\n' + bossName(), 2800); spawnWave(); shake = 0.6; burst(player.position.clone().setY(0.2), dgTheme ? DG_THEMES[dgTheme].fx : 0x7fe9ff, 22, 4);
  const f = $('fade'); f.style.transition = 'opacity .9s'; f.style.opacity = 0;
}
function restartExplore() { // kalah di dalam dungeon jelajah: mulai lagi dari ruang awal (denah sama, semua musuh kembali, kristal penyembuh pulih)
  startExplore(); state = 'play'; $('msg').textContent = ''; banner(exploreName() + '\nMulai lagi dari pintu masuk', 2200);
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
  applyArenaTheme('asal'); audio.setScene('dungeon');
  world.group.visible = false; arenaG.visible = true;
  scene.background.set(0x07060a); scene.fog = arenaFog;
  player.position.set(0, 0, 0); player.rotation.set(0, 0, 0); P.face = 0; if (vrm) vrm.scene.rotation.x = 0;
  camYaw = 0; cam.position.set(0, 6, 13);
  begin(); shake = 0.6; burst(player.position.clone().setY(0.2), 0xb8b8c8, 22, 4);
  const f = $('fade'); f.style.transition = 'opacity .9s'; f.style.opacity = 0;
}

// Masuk Pintu Penjaga: layar memudar, pemain dipindah ke arena (arena dungeon yang sama, tetapi hanya berisi golem)
function golemGo() {
  doorBusy = true; clearWild(); stick.x = stick.y = 0; P.v.set(0, 0, 0); $('msg').textContent = '';
  const f = $('fade'); f.style.transition = 'opacity .5s'; f.style.opacity = 1;
  setTimeout(() => { if (state !== 'world') { doorBusy = false; return; } enterGolemArena(); }, 540);
}
function golemSetup() { // pemain di sisi selatan menghadap golem di sisi utara
  player.position.set(GOLEM.player.x, 0, GOLEM.player.z); P.face = Math.PI; player.rotation.set(0, Math.PI, 0); P.v.set(0, 0, 0);
  camYaw = 0; cam.position.set(GOLEM.player.x, 6, GOLEM.player.z + 11);
}
function enterGolemArena() {
  golemMode = true; WAVES = GOLEM_WAVES; wave = 0; next = 0; $('exit').textContent = '🏛️ Keluar ke Reruntuhan'; applyArenaTheme('asal');
  audio.setScene('dungeon'); world.group.visible = false; arenaG.visible = true; scene.background.set(0x07060a); scene.fog = arenaFog;
  $('obj').hidden = true; DOOR_FX.open = 0; doorBusy = false; if (vrm) vrm.scene.rotation.x = 0;
  golemSetup(); state = 'play'; banner('🏛️ Penjaga Reruntuhan\nGolem terbangun...', 2800); spawnWave();
  const f = $('fade'); f.style.transition = 'opacity .9s'; f.style.opacity = 0;
}

function exitDungeon() { // menang -> naik keluar dungeon ke dataran hijau
  loot.clear();
  if (!canAgain) return;
  canAgain = false; $('again').hidden = true; $('exit').hidden = true; $('msg').textContent = '';
  const f = $('fade'); f.style.transition = 'opacity .6s'; f.style.opacity = 1;
  setTimeout(() => restart(true), 650);
}
$('exit').onclick = exitDungeon;

function begin() { state = 'play'; banner('Arena Terbuka!\nKalahkan semua musuh'); spawnWave(); }
const againHint = () => document.body.classList.contains('touch') ? 'Ketuk tombol di bawah untuk main lagi' : 'Klik atau tekan R untuk main lagi';
function showAgain() { canAgain = true; $('again').hidden = false; $('exit').hidden = state !== 'win' && !golemMode && !kotaMode; $('msg').textContent += '\n\n' + againHint(); }
function end(win) {
  loseInWorld = !win && state === 'world'; // kalah di hutan -> bangun lagi di dunia luar, bukan masuk dungeon
  stopLaser(); clearBlasts(); clearGPillars(); clearSeraph(); state = win ? 'win' : 'lose'; canAgain = false; $('again').hidden = true; $('exit').hidden = true;
  if (win) { if (kotaMode) guildClear(dgTheme || 'kristal'); if (golemMode) { golemBeaten = true; ruinsSave({ golem: true }); } $('msg').textContent = golemMode ? 'GOLEM HANCUR!\nPenjaga Reruntuhan telah dikalahkan' : dgTheme ? ('KEMENANGAN!\n' + DG_THEMES[dgTheme].boss + ' telah dikalahkan') : kotaMode ? (mutantGltf ? 'KEMENANGAN!\nMutan Kristal telah dikalahkan' : 'KEMENANGAN!\nPenyihir Kristal telah dikalahkan') : 'KEMENANGAN!\nVillain telah dikalahkan'; setTimeout(() => { if (state === 'win') showAgain(); }, 900); }
  else { $('msg').textContent = ''; startDefeat(); }
}
function restart(toWorld = false) {
  loot.clear(); resetDefeat(); slow.t = 0; stopLaser(); clearBlasts(); clearGPillars(); clearSeraph(); endVS(); endSL(); endSM(true); endBF(); endPT(); PT.buff = 0; endEX(); dkPowEnd();
  [...enemies].forEach(e => scene.remove(e.g)); enemies.length = 0;
  [...orbs, ...rings].forEach(o => scene.remove(o.m)); orbs.length = 0; rings.length = 0;
  Object.assign(P, { hp: P.max, atk: 0, combo: 0, cross: false, jy: 0, roll: 0, inv: 0, sh: 0, drawT: 0, runT: 0, heavy: 0.3, air: false, vy: 0 }); P.kb.set(0, 0, 0);
  Object.values(SK).forEach(s => s.t = 0); waves.forEach(w => scene.remove(w.g)); waves.length = 0; player.position.set(0, 0, 0); P.v.set(0, 0, 0);
  wave = 0; next = 0; $('boss').hidden = true; $('exit').hidden = true;
  if (toWorld || loseInWorld) { const lost = loseInWorld; loseInWorld = false; enterWorld(true, lost ? 'Louis pingsan...\nTerbangun kembali di Dataran Hijau' : null); return; }
  if (kotaMode && !bossRoom) { restartExplore(); return; }   // kalah di lorong / ruangan dungeon: ulang dungeon dari ruang awal (kalah di ruang bos: hanya bos yang diulang, di bawah)
  state = 'play'; $('msg').textContent = ''; if (golemMode) golemSetup(); spawnWave();
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
  endVS(); endSL(); endSM(true); endBF(); endPT(); PT.buff = 0; endEX(); dkPowEnd();
  Object.assign(D, { t: 0, dropped: false, k1: false, k3: false, lift: 0, by: vrm ? vrm.scene.position.y : 0 });
  Object.assign(P, { atk: 0, cross: false, roll: 0, jy: 0, sh: 0 });
  for (const m of [slash.material, dMat, xMat, xCore, cresMat, cresCore, speedMat]) m.opacity = 0; // matikan efek tebasan
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
    if (!loseInWorld) { const hl = Math.hypot(player.position.x, player.position.z); if (hl > R - 1.5) { player.position.x *= (R - 1.5) / hl; player.position.z *= (R - 1.5) / hl; } }
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

// ---------- Serangan ke-4: tebasan beruntun (2 detik) ----------
// Tebasan ke-i mengenai musuh di depan saat 40% durasinya berjalan (tepat saat ayunan tangan mencapai puncak). Tebasan ke-CX.n = tebasan silang penutup.
function crossTick() {
  const el = P.dur - Math.max(0, P.atk), f = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face)), PUR = DK.pow > 0 ? 0xff2236 : 0xb45cff;
  while (P.cn <= CX.n) {
    const fin = P.cn === CX.n, i = P.cn, at = fin ? CX.n * CX.step + 0.35 * CX.finT : i * CX.step + 0.4 * CX.step;
    if (el < at) break;
    P.cn++;
    audio.sfx(fin ? 'slash' : 'sword');
    if (DK.on) { if (fin) { if (DK.pow > 0) { dkSlashWave(-0.5); dkSlashWave(0.5); } dkSlashWave(0); } else if (i % (DK.pow > 0 ? 2 : 3) === 0) dkSlashWave(0); }   // penguatan Dark Excalibur: slash merah raksasa ke depan (penutup: 3 arah)
    if (BF.on && (fin || i % 3 === 0)) bfSlash(); // aura penguatan: slash tambahan tiap 3 tebasan + penutup (supaya tidak kebanyakan)
    shake = Math.max(shake, fin ? 0.5 : 0.12);
    burst(player.position.clone().addScaledVector(f, fin ? 1.9 : 1.6).setY(1.2), PUR, fin ? 28 : 7, fin ? 8 : 5);
    pulse(DK.pow > 0 ? 0xff1a2e : fin ? 0xb35cff : 0xa23cff, fin ? 5.5 : 3, fin ? 0.4 : 0.2);
    for (const e of [...enemies]) {
      const d = e.g.position.clone().sub(player.position).setY(0), l = d.length();
      if (l < (fin ? 4.8 : 3.2) * (DK.pow > 0 ? DKB.rng : 1) + e.r && (fin || d.clone().normalize().dot(f) > -0.1)) // penutup melingkar: kena musuh ke segala arah
 { hurtEnemy(e, Math.round(((fin ? CX.finDmg : CX.dmg) + (Math.random() * 4 | 0)) * (BF.on ? 1.3 : 1) * (DK.pow > 0 ? DKB.dmg : 1)), d.normalize(), fin ? 22 : 5); lineSparks(e.g.position.clone().setY(1.2), fin ? 22 : 10, 9, 1, DK.pow > 0 ? DKP.sparks : undefined); }
    }
  }
}

// ---------- Menghadap Ratu: pemain HARUS berlutut dulu sebelum bisa berbicara dengan ratu ----------
// Alur: dekati singgasana -> tombol "Berlutut" (E / ketuk) -> pemain menghadap ratu & berlutut satu kaki -> ratu berbicara sementara pemain tetap berlutut
// (ketuk / E = kalimat berikutnya) -> setelah kalimat terakhir pemain bangkit. Ubah kalimat ratu di QUEEN_LINES (satu elemen = satu kotak dialog); KNEEL = lama berlutut / bangkit (detik).
const QUEEN_NAME = '👑 Ratu';
const ISABEL_NAME = '👸 Putri Isabel';
const ISABEL_LINES = { follow: ['Dengan senang hati. Aku akan menemanimu.', 'Baiklah, mari berjalan bersama.', 'Tentu! Aku ikut denganmu.'], stay: ['Baik, aku menunggu di sini.', 'Tentu. Kembalilah kapan saja.', 'Aku akan menunggumu di sini.'] };
const QUEEN_LINES = [
  'Angkat kepalamu, Louis. Penghormatanmu kuterima di aula ini.',
  'Kabar tentang keberanianmu sudah sampai ke istana.',
  'Kerajaan selalu membutuhkan orang yang berani sepertimu. Pergilah dengan restuku.'
];
const KNEEL = { down: 0.9, up: 0.8 };
const QT = { phase: 0, t: 0, line: 0, label: 'talk', hinted: false };   // phase: 0 tidak ada, 1 berlutut (turun), 4 menunggu ratu berjalan menghampiri, 2 berbicara (tetap berlutut), 3 bangkit
const queenNear = () => state === 'world' && inAula && !aulaBusy && !aulaCine && !QT.phase && world.aula.queenNear(player.position.x, player.position.z, player.position.y);
const qbox = document.createElement('div');
qbox.hidden = true;
qbox.style.cssText = 'position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(560px,92vw);box-sizing:border-box;padding:12px 18px 10px;background:rgba(28,16,12,.9);border:2px solid #d9b24a;border-radius:12px;color:#fff4dc;font:16px/1.5 system-ui,sans-serif;z-index:40;box-shadow:0 6px 24px rgba(0,0,0,.55);cursor:pointer;user-select:none;-webkit-user-select:none;pointer-events:auto;';
qbox.innerHTML = '<b style="color:#ffd980"></b><div style="margin:4px 0 6px"></div><small style="display:block;text-align:right;opacity:.65">Ketuk / E ▶</small>';
document.body.appendChild(qbox);
const qName = qbox.children[0], qText = qbox.children[1];
qName.textContent = QUEEN_NAME;
qbox.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); qtAdvance(); });
qbox.addEventListener('mousedown', e => e.stopPropagation());
const qtShow = () => { qText.textContent = QUEEN_LINES[QT.line]; qbox.hidden = false; };
function qtEnd() {   // selesai / dibatalkan: pose & posisi badan dikembalikan
  QT.phase = 0; QT.t = 0; qbox.hidden = true; world.aula.queenTalk(false);
  if (vrm) { vrm.scene.rotation.x = 0; vrm.scene.position.z = 0; }
  resetFingers();   // jari kembali lurus
}
function qtAdvance() {
  if (QT.phase !== 2) return;
  if (++QT.line < QUEEN_LINES.length) qtShow();
  else { QT.phase = 3; QT.t = 0; qbox.hidden = true; world.aula.queenTalk(false); world.aula.queenLeave(); }   // kalimat terakhir selesai: pemain bangkit, ratu kembali ke singgasana
}
function startKneel() {
  if (!queenNear()) return;
  const q = world.aula.queenPos(); if (q) P.face = Math.atan2(q.x - player.position.x, q.z - player.position.z);   // menghadap ratu
  const sp = world.aula.kneelSpot(); QT.from = { x: player.position.x, z: player.position.z }; QT.to = sp || null;   // pemain bergeser halus ke titik berlutut di lantai sebelum tangga
  QT.phase = 1; QT.t = 0; QT.line = 0; P.drawT = 0; P.runT = 0; P.v.set(0, 0, 0); stick.x = stick.y = 0;
}
const _isaV = new THREE.Vector3();
const ISA_ENV = {   // dunia luar untuk Isabel (ikut keluar istana): induk objek, tabrakan pohon / bangunan / batas dunia, tinggi pijakan (tangga istana di Kota Kekaisaran)
  parent: world.group,
  push: (x, z, r) => {
    if (guildRoom && GUILD_DOOR.ready && guildRoom.inside(x, z)) return [GUILD_DOOR.outX, GUILD_DOOR.outZ];   // Isabel masih di dalam guild padahal pemain sudah keluar: ia muncul di depan pintu guild
    if (smithRoom && SMITH_DOOR.ready && smithRoom.inside(x, z)) return [SMITH_DOOR.outX, SMITH_DOOR.outZ];   // sama untuk toko Pandai Besi
    if (potionRoom && POTION_DOOR.ready && potionRoom.inside(x, z)) return [POTION_DOOR.outX, POTION_DOOR.outZ];   // sama untuk Toko Ramuan
    if (lodgeRoom && LODGE_DOOR.ready && lodgeRoom.inside(x, z)) return [LODGE_DOOR.outX, LODGE_DOOR.outZ];   // sama untuk Penginapan Kota Dungeon
    if (inKekaisaran && world.inn.ready && world.inn.inside(x, z)) { const o = world.inn.spawn.out; return [o.x, o.z]; }   // Isabel masih di dalam penginapan padahal pemain sudah keluar: ia muncul di depan pintu
    _isaV.set(x, 0, z); world.collide(_isaV, r); world.clamp(_isaV); return [_isaV.x, _isaV.z];
  },
  ground: (x, z) => inKekaisaran ? world.kekGroundY(x, z) : 0,
};
const isabelNear = () => state === 'world' && !inPalace && !inChurch && !aulaBusy && !aulaCine && !QT.phase && !IT.open && world.aula.isabelNear(player.position.x, player.position.z, player.position.y);
const INN_ENV = {   // Isabel ikut masuk Penginapan Karavan (ruang umum & kamar): tabrakan dinding/perabot penginapan (posisinya dijepit ke dalam ruangan = ia langsung muncul di dalam bersama pemain), lantai = lantai ruangan
  parent: world.group,
  push: (x, z, r) => { _isaV.set(x, 0, z); world.inn.collide(_isaV, r); return [_isaV.x, _isaV.z]; },
  ground: () => world.inn.groundY(),
};
const GUILD_ENV = {   // Isabel ikut masuk Balai Petualang: tabrakan dinding/perabot guild, lantai datar
  parent: world.group,
  push: (x, z, r) => { _isaV.set(x, 0, z); guild.collide(_isaV, r); return [_isaV.x, _isaV.z]; },
  ground: () => 0,
};
function isabelTalk() {   // ajak Isabel jalan bareng / suruh menunggu
  const m = world.aula.isabelToggle(player.position.x, player.position.z); if (!m) return;
  const L = ISABEL_LINES[m]; toast(ISABEL_NAME + ': “' + L[Math.floor(Math.random() * L.length)] + '”', 2800);
}
// ---------- Mengobrol dengan Isabel (pilihan jawaban) ----------
// Pohon dialog: tiap simpul punya text (string, atau fungsi(c) dengan c = { follow: Isabel sedang ikut, out: pemain di luar istana }) dan choices.
// Pilihan: { label, next: id simpul berikutnya | end: true tutup dialog | act: 'toggle' ajak / suruh menunggu lalu tutup, if: fungsi(c) -> tampil bila true }. Maksimal 5 pilihan (tombol angka 1-5). Ubah / tambah isi dialog di sini.
const ISABEL_TALK = {
  menu: { text: c => c.follow ? 'Ada yang ingin kau bicarakan? Aku ada di sampingmu.' : 'Oh, halo! Ada yang bisa kubantu?',
    choices: [ { label: '💬 Mengobrol', next: 'chat' }, { label: '🚶 Ajak jalan bareng', act: 'toggle', if: c => !c.follow }, { label: '✋ Tunggu di sini', act: 'toggle', if: c => c.follow }, { label: '🛏️ Tidur bersama Isabel', act: 'sleep', together: true, if: c => c.bed && c.follow }, { label: '🛏️ Tidur sendiri', act: 'sleep', if: c => c.bed }, { label: '🤗 Peluk dari belakang', act: 'backhug', if: c => c.follow && c.back }, { label: 'Tidak apa-apa', end: true } ] },
  chat: { text: c => c.inn ? 'Penginapan ini hangat dan nyaman, ya. Apa yang ingin kau bicarakan?' : c.out ? 'Udara di luar istana segar sekali, ya. Apa yang ingin kau bicarakan?' : 'Dengan senang hati. Apa yang ingin kau bicarakan?',
    choices: [ { label: 'Ceritakan tentang dirimu', next: 'who' }, { label: 'Bagaimana hidup di istana?', next: 'life' }, { label: 'Apa yang kau sukai?', next: 'hobby' }, { label: 'Ceritakan tentang kota ini', next: 'city' }, { label: 'Cukup, terima kasih', next: 'bye' } ] },
  who: { text: 'Aku Isabel, putri di istana ini. Biasanya aku berdiri di samping singgasana saat Ratu menerima tamu, jadi aku terbiasa memperhatikan siapa pun yang datang.',
    choices: [ { label: 'Kau tampak sabar', next: 'who2' }, { label: 'Aku ingin tahu hal lain', next: 'chat' }, { label: 'Sampai nanti', next: 'bye' } ] },
  who2: { text: 'Terima kasih. Itu pelajaran pertama di istana. Pelajaran keduanya: tetap tersenyum walau kaki pegal berdiri berjam-jam.',
    choices: [ { label: 'Aku ingin tahu hal lain', next: 'chat' }, { label: 'Sampai nanti', next: 'bye' } ] },
  life: { text: 'Ramai dan penuh aturan. Tapi aku suka galeri lantai dua saat cahaya senja masuk dari jendela.',
    choices: [ { label: 'Apa kau kesepian?', next: 'lonely' }, { label: 'Aku ingin tahu hal lain', next: 'chat' }, { label: 'Sampai nanti', next: 'bye' } ] },
  lonely: { text: c => c.follow ? 'Kadang. Tapi tidak hari ini. Berjalan bersamamu membuat istana terasa jauh lebih hidup.' : 'Kadang. Karena itu aku senang sekali kalau ada yang mau berbincang denganku.',
    choices: [ { label: 'Aku ingin tahu hal lain', next: 'chat' }, { label: 'Sampai nanti', next: 'bye' } ] },
  hobby: { text: 'Aku suka mendengar kisah para pengelana. Katanya dunia di luar tembok kota luas sekali, dengan hutan, desa, dan reruntuhan kuno.',
    choices: [ { label: 'Kau ingin melihatnya?', next: 'travel' }, { label: 'Aku ingin tahu hal lain', next: 'chat' }, { label: 'Sampai nanti', next: 'bye' } ] },
  travel: { text: c => c.follow ? 'Kita sedang melihatnya sekarang, dan aku menikmatinya!' : 'Sungguh, aku ingin. Maukah kau mengajakku berjalan bersamamu?',
    choices: [ { label: 'Tentu, ikutlah denganku', act: 'toggle', if: c => !c.follow }, { label: 'Mungkin lain kali', next: 'chat', if: c => !c.follow }, { label: 'Aku ingin tahu hal lain', next: 'chat', if: c => c.follow }, { label: 'Sampai nanti', next: 'bye', if: c => c.follow } ] },
  city: { text: 'Kota ini punya lima distrik yang berpusat di istana. Orang-orangnya ramah, meski sering sibuk dengan urusan masing-masing.',
    choices: [ { label: 'Apa kau sering keluar istana?', next: 'outside' }, { label: 'Aku ingin tahu hal lain', next: 'chat' }, { label: 'Sampai nanti', next: 'bye' } ] },
  outside: { text: c => c.inn ? 'Jarang sekali. Bahkan menginap di tempat seperti ini terasa seperti petualangan bagiku.' : c.out ? 'Jarang sekali. Jadi hari ini terasa seperti petualangan.' : 'Jarang. Karena itu aku iri pada siapa pun yang bebas berkelana.',
    choices: [ { label: 'Aku ingin tahu hal lain', next: 'chat' }, { label: 'Sampai nanti', next: 'bye' } ] },
  // ---- sebelum tidur bersama: pemain & Isabel sudah berbaring (kamera menyorot wajah). act: 'sleep' = lanjut tidur (layar gelap); act: 'getup' = bangun lagi tanpa tidur ----
  sleepAsk: { text: 'Hangat sekali berbaring di sampingmu. Mau mengobrol sebentar dulu, atau langsung tidur saja?',
    choices: [ { label: '💬 Ngobrol dulu', next: 'night' }, { label: '😴 Langsung tidur', act: 'sleep', together: true }, { label: '↩️ Bangun lagi', act: 'getup' } ] },
  night: { text: 'Malam ini tenang sekali, ya. Apa yang ingin kau bicarakan sebelum kita tidur?',
    choices: [ { label: 'Bagaimana harimu?', next: 'nDay' }, { label: 'Apa yang kau pikirkan malam ini?', next: 'nThink' }, { label: 'Ceritakan dongeng pengantar tidur', next: 'nStory' }, { label: '😄 Bercanda dengan Isabel', next: 'joke' }, { label: 'Sudah, ayo tidur', act: 'sleep', together: true } ] },
  nDay: { text: 'Menyenangkan. Berjalan di luar istana bersamamu, melihat kota dari dekat... itu hal yang belum pernah kulakukan sebelumnya.',
    choices: [ { label: 'Aku juga senang', next: 'nGlad' }, { label: 'Bicara hal lain', next: 'night' }, { label: 'Ayo tidur', act: 'sleep', together: true } ] },
  nGlad: { text: 'Benarkah? Kalau begitu besok kita jalan lagi, ya. Janji?',
    choices: [ { label: 'Janji', next: 'nPromise' }, { label: 'Bicara hal lain', next: 'night' } ] },
  nPromise: { text: 'Terima kasih. Aku jadi tidak sabar menunggu pagi. Selamat tidur, ya.', choices: [ { label: '😴 Selamat tidur', act: 'sleep', together: true } ] },
  nThink: { text: 'Tentang besok. Kalau kau akan pergi jauh, aku ingin ikut, asal kau tidak berjalan terlalu cepat.',
    choices: [ { label: 'Aku akan jalan pelan-pelan', next: 'nSlow' }, { label: 'Bicara hal lain', next: 'night' }, { label: 'Ayo tidur', act: 'sleep', together: true } ] },
  nSlow: { text: 'Hehe, aku pegang kata-katamu. Sekarang istirahatlah, kau pasti lelah.', choices: [ { label: '😴 Ayo tidur', act: 'sleep', together: true }, { label: 'Bicara hal lain', next: 'night' } ] },
  nStory: { text: 'Dahulu ada lentera kecil yang takut gelap. Tiap malam ia menyala sedikit lebih terang, sampai ia sadar bahwa gelaplah yang membuat cahayanya berarti. Nah, sekarang giliranmu memejamkan mata.',
    choices: [ { label: 'Terima kasih, ayo tidur', act: 'sleep', together: true }, { label: 'Bicara hal lain', next: 'night' } ] },
  // ---- BERCANDA di kasur -> (tiba-tiba) Luis memeluk Isabel dari atas. act: 'hug' = mulai adegan peluk (dialog tertutup, animasi, lalu simpul 'hugAfter' muncul); act: 'unhug' = lepas pelukan lalu simpul 'hugDone' ----
  joke: { text: 'Bercanda? Hehe, boleh. Tapi jangan yang aneh-aneh ya, Luis. Kau mau mulai dari mana?',
    choices: [ { label: 'Tadi kau mendengkur, lho', next: 'jk1' }, { label: 'Selimutnya kutarik semua, ya', next: 'jk2' }, { label: 'Tebak, aku sedang memikirkan apa?', next: 'jk3' }, { label: 'Bicara hal lain', next: 'night' } ] },
  jk1: { text: 'A-aku tidak mendengkur! Putri tidak pernah mendengkur. ...Mungkin sedikit. Tapi kau juga, tahu! Suaramu seperti naga yang kelaparan.',
    choices: [ { label: 'Naga kelaparan? Grrrr!', next: 'jk4' }, { label: 'Iya, iya, aku mengalah', next: 'jk4' } ] },
  jk2: { text: 'Hei, jangan! Dingin tahu! Kalau berani, aku tarik balik semuanya lalu menggulung diri seperti kepompong, dan kau tidak kebagian apa-apa!',
    choices: [ { label: 'Coba saja, kepompong', next: 'jk4' }, { label: 'Baiklah, kukembalikan', next: 'jk4' } ] },
  jk3: { text: 'Hmm... pedang? Makan malam? ...Atau jangan-jangan kau sedang memikirkan aku?',
    choices: [ { label: 'Salah semua. Kau terlalu percaya diri', next: 'jk4' }, { label: 'Mungkin... benar', next: 'jk4' } ] },
  jk4: { text: 'Hihihi... aduh, perutku sakit karena tertawa. Sudah lama sekali aku tidak tertawa selepas ini di istana. Kau penghibur yang payah, tapi aku suka.',
    choices: [ { label: '😄 “Hehe... sini kau, Putri!”', act: 'hug' } ] },
  hugAfter: { text: 'E-eh?! L-Luis...? K-kau mengagetkanku... Jantungku berdebar kencang sekali, kau pasti bisa merasakannya.',
    choices: [ { label: 'Maaf, aku tidak tahan', next: 'hug2' }, { label: 'Kau lucu sekali kalau wajahnya merah begitu', next: 'hug3' } ] },
  hug3: { text: 'J-jangan menggodaku! Wajahku... aduh, jangan dilihat!',
    choices: [ { label: 'Hehe, maaf, maaf', next: 'hug2' }, { label: '💋 Cium dia', act: 'kiss' }, { label: '↩️ Lepaskan pelukan', act: 'unhug' } ] },
  hug2: { text: 'Dasar... Tapi hangat. Jangan dilepas dulu, ya. Sebentar saja.',
    choices: [ { label: '💋 Cium dia', act: 'kiss' }, { label: '😴 Tidur sambil berpelukan', act: 'sleep', together: true }, { label: '↩️ Lepaskan pelukan', act: 'unhug' } ] },
  kissAfter: { text: 'P-pelan-pelan ya... ini pengalaman pertamaku.',
    choices: [ { label: '😴 Tidur sambil berpelukan', act: 'sleep', together: true } ] },
  backHug: { text: 'L-Luis...! J-jangan sekarang... kita harus kembali ke Bunda. Orang-orang di istana pasti khawatir.',
    choices: [ { label: '🏰 Baik, ayo kembali ke Bunda', act: 'bhend' } ] },
  hugDone: { text: 'Hehe... jantungku masih belum tenang. Jadi, kita mau apa sekarang?',
    choices: [ { label: '😴 Ayo tidur', act: 'sleep', together: true }, { label: 'Bercanda lagi', next: 'joke' }, { label: 'Bicara hal lain', next: 'night' } ] },
  bye: { text: 'Senang berbincang denganmu. Panggil aku kapan saja.', choices: [ { label: 'Sampai nanti', end: true } ] },
};
const IT = { open: false, node: '', sel: 0, list: [] };
const ibox = document.createElement('div');
ibox.hidden = true;
ibox.style.cssText = 'position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(560px,92vw);box-sizing:border-box;padding:12px 18px 12px;background:rgba(28,16,12,.9);border:2px solid #d9b24a;border-radius:12px;color:#fff4dc;font:16px/1.5 system-ui,sans-serif;z-index:40;box-shadow:0 6px 24px rgba(0,0,0,.55);user-select:none;-webkit-user-select:none;pointer-events:auto;max-height:72vh;overflow:auto;';
ibox.innerHTML = '<b style="color:#ffd980"></b><div style="margin:4px 0 8px"></div><div></div>';
document.body.appendChild(ibox);
const iName = ibox.children[0], iText = ibox.children[1], iList = ibox.children[2];
iName.textContent = ISABEL_NAME;
ibox.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
ibox.addEventListener('mousedown', e => e.stopPropagation());
const ITBTN = 'display:block;width:100%;box-sizing:border-box;text-align:left;margin-top:6px;padding:9px 12px;border-radius:8px;font:inherit;color:#fff4dc;cursor:pointer;';
function itMark() { [...iList.children].forEach((b, i) => { const on = i === IT.sel; b.style.cssText = ITBTN + (on ? 'background:rgba(125,82,30,.95);border:1px solid #ffd980;' : 'background:rgba(60,36,24,.85);border:1px solid rgba(217,178,74,.55);'); }); }
function itShow(id) {
  const n = ISABEL_TALK[id]; if (!n) { itEnd(); return; }
  const c = { follow: world.aula.isabelMode() === 'follow', out: !inAula, inn: inInn, bed: !!bedRaw(), back: AFTER.back && inInn };
  const txt = typeof n.text === 'function' ? n.text(c) : n.text;
  IT.node = id; IT.list = n.choices.filter(ch => !ch.if || ch.if(c)); IT.sel = 0;
  iText.textContent = txt; iList.innerHTML = '';
  IT.list.forEach((ch, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = (i + 1) + '. ' + ch.label;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); itPick(i); });
    b.addEventListener('mousedown', e => e.stopPropagation());
    iList.appendChild(b); });
  itMark(); ibox.hidden = false; world.aula.isabelSpeak(Math.min(7, txt.length * 0.06), txt);   // mulut Isabel bergerak selama ia berbicara
}
function itPick(i) {
  const ch = IT.list[i]; if (!IT.open || !ch) return;
  if (ch.next || ch.act === 'sleep' || ch.act === 'hug') luisSpeak(ch.label);   // Luis mengucapkan jawaban yang dipilih (mulutnya bergerak)
  if (ch.act === 'toggle') { itEnd(); isabelTalk(); }
  else if (ch.act === 'sleep') { itEnd(); if (SLEEP.stage === 5) sleepResume(false); else startSleep(!!ch.together); }   // stage 5 = sudah berbaring & ngobrol: lanjut tidur
  else if (ch.act === 'hug') { itEnd(); hugStart(ch.after || 'hugAfter'); }   // adegan peluk dari atas
  else if (ch.act === 'kiss') { itEnd(); kissStart(ch.after || 'kissAfter'); }   // ciuman saat berpelukan
  else if (ch.act === 'unhug') { itEnd(); hugEnd(ch.after || 'hugDone'); }
  else if (ch.act === 'backhug') { itEnd(); bhStart(); }   // peluk dari belakang (setelah bangun tidur bersama)
  else if (ch.act === 'bhend') { itEnd(); BH.tgt = 0; }   // lepas pelukan, kembali berdiri biasa
  else if (ch.act === 'getup') { itEnd(); sleepResume(true); }
  else if (ch.end) itEnd();
  else itShow(ch.next);
}
function itEnd() { IT.open = false; ibox.hidden = true; world.aula.isabelChat(false); }
function itKey(e) {
  const k = e.code, m = /^(?:Digit|Numpad)([1-9])$/.exec(k), n = IT.list.length;
  if (m) { e.preventDefault(); if (!e.repeat) itPick(+m[1] - 1); }
  else if (k === 'ArrowUp' || k === 'KeyW') { e.preventDefault(); if (n) { IT.sel = (IT.sel + n - 1) % n; itMark(); } }
  else if (k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); if (n) { IT.sel = (IT.sel + 1) % n; itMark(); } }
  else if (!e.repeat && (k === 'KeyE' || k === 'Enter' || k === 'Space')) { e.preventDefault(); itPick(IT.sel); }
}
function itWatch() {   // dialog ditutup otomatis bila pemain berpindah tempat / Isabel menghilang
  if (!IT.open) return;
  const q = world.aula.isabelPos();
  if (state !== 'world' || inPalace || inChurch || aulaBusy || !q || Math.hypot(q.x - player.position.x, q.z - player.position.z) > 4.5) itEnd();
}
function isabelMenu() {   // mulai bicara dengan Isabel: pemain diam & menghadapnya, lalu menu (mengobrol / ajak jalan / tunggu)
  if (!isabelNear()) return;
  const q = world.aula.isabelPos(); if (q) P.face = Math.atan2(q.x - player.position.x, q.z - player.position.z);
  P.drawT = 0; P.runT = 0; P.v.set(0, 0, 0); stick.x = stick.y = 0;
  IT.open = true; world.aula.isabelChat(true); itShow('menu');
}
const talkAct = () => { if (QT.phase || IT.open || GU.open) return; if (kaelenOn()) return; { const KB = globalThis.KAELEN_BATTLE; if (state === 'world' && KB && KB.nearChallenge()) { kaelenMenu(); return; } } const gs = guildSpotNow(); const tt = talkTarget(); if (state === 'world' && queenNear()) startKneel(); else if (isabelNear()) isabelMenu(); else if (bedNow()) startSleep(); else if (gs) guildTalk(gs.id); else if (lyraNearNow()) lyraMenu(); else if (tt) wargaTalk(tt.id); else world.talk(); };
function qtTick(dt) {
  itWatch();
  if (!inAula) QT.hinted = false;
  if (QT.phase === 10) { bhTick(dt); return; }   // peluk Isabel dari belakang (setelah bangun)
  if (QT.phase === 9) { sleepTick(dt); return; }   // tidur di kasur (QT.phase 9 = semua kontrol terkunci seperti saat berlutut)
  if (!QT.phase) return;
  if (!(state === 'world' && inAula)) { qtEnd(); return; }
  QT.t += dt;
  if (QT.phase === 1 && QT.to) {   // geser ke titik berlutut sambil turun, tetap menghadap ratu
    const u = clamp01(QT.t / KNEEL.down), e = u * u * (3 - 2 * u);
    player.position.x = QT.from.x + (QT.to.x - QT.from.x) * e; player.position.z = QT.from.z + (QT.to.z - QT.from.z) * e;
    const q = world.aula.queenPos(); if (q) P.face = Math.atan2(q.x - player.position.x, q.z - player.position.z);
  }
  if (QT.phase === 1 && QT.t >= KNEEL.down) {   // sudah berlutut: ratu berdiri & berjalan menghampiri; kalau tidak bisa, langsung berbicara
    if (world.aula.queenCome()) { QT.phase = 4; QT.t = 0; } else { QT.phase = 2; QT.t = 0; QT.line = 0; qtShow(); world.aula.queenTalk(true); }
  }
  else if (QT.phase === 4 && (world.aula.queenArrived() || QT.t > 40)) { QT.phase = 2; QT.t = 0; QT.line = 0; qtShow(); world.aula.queenTalk(true); }   // ratu tiba -> dialog
  else if (QT.phase === 3 && QT.t >= KNEEL.up) qtEnd();
}
// ---------- Tidur di kasur Penginapan Karavan (kamar 1-3) ----------
// Alur: 1 berbaring (badan bergeser & rebah ke kasur, selimut menutup) -> 2 layar menggelap -> 3 tidur (HP pulih penuh) -> 4 layar terang, bangun di samping kasur.
// Memakai QT.phase = 9 supaya kontrol (gerak, serang, tombol) terkunci seperti saat berlutut; pose diatur oleh sleepPose.
const SLEEP = { lie: 1.5, dark: 0.7, hold: 1.5, wake: 0.8, stage: 0, t: 0, amt: 0, spot: null, from: null, f0: 0, faded: false, together: false, noSleep: false, ox: 0, oz: 0, ix: 0, iz: 0, iFrom: null, hug: null };   // hug = keadaan adegan peluk (lihat newHug). together = tidur bersama Isabel (ox/oz = geseran pemain di kasur, ix/iz = titik Isabel, iFrom = posisi awal Isabel)
// ---- ADEGAN PELUK DARI ATAS (saat berbaring berdampingan & ngobrol, tahap 5) ----
// Dipicu simpul dialog dengan act: 'hug' (lihat jk4). Luis berguling ke arah Isabel, menopang badan di atasnya (menelungkup, lengan di kanan-kiri Isabel),
// lalu turun & melingkarkan kedua lengan ke punggung Isabel. Dialog ditutup selama animasi; sesudahnya simpul 'hugAfter' muncul. 'unhug' = animasi dibalik.
// Semua angka bisa diubah di sini:
//   t = lama animasi (detik) | pause = jeda sebelum dialog berikutnya muncul | up = tinggi badan Luis saat menopang di atas Isabel (m) | hover = tinggi saat sudah memeluk
//   (naikkan hover bila badan Luis tembus badan / wajah Isabel, turunkan bila masih terlalu renggang) | turn = kepala Luis menoleh (rad; 0 = wajah lurus menghadap wajah Isabel) | arch = punggung Luis melengkung ke atas (rad) supaya kepalanya terangkat & tidak menembus kepala Isabel (naikkan bila wajah keduanya masih bertabrakan) | camYaw / camPitch = kamera berputar ke sisi Isabel & agak lebih rendah supaya wajah keduanya kelihatan
// ---- CIUMAN (saat berpelukan, tahap 5): dipicu simpul dialog dengan act: 'kiss'. Wajah Luis turun mendekat ke wajah Isabel, keduanya memejamkan mata, bertahan sebentar, lalu naik lagi & dialog 'kissAfter' muncul.
//   t = lama turun / naik (detik) | hold = lama bertahan (detik) | drop = badan Luis turun sekian meter | arch = lengkung punggung yang DIHILANGKAN saat mencium (0.3 = HUG.arch -> kepala turun sampai sejajar wajah Isabel; kecilkan bila kepala Luis menembus kepala Isabel, naikkan sampai 0.3 bila masih jauh) | pause = jeda sebelum dialog berikutnya
const KISS = { t: 1.0, hold: 2.2, drop: 0.05, arch: 0.3, pause: 0.6 };
const HUG = { t: 2.4, pause: 0.7, up: 0.36, hover: 0.18, turn: 0, arch: 0.3, camYaw: 1.1, camPitch: -0.2 };
const newHug = () => ({ amt: 0, tgt: 0, next: null, busy: false, wait: 0, said: false, shy: false, k: 0, kOn: false, kT: 0, kSaid: false });   // amt 0..1 = seberapa jauh adegan berjalan, tgt = tujuan (1 memeluk, 0 lepas), busy = animasi sedang berjalan (dialog tertutup)
const smo = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const hugK = a => ({ lift: smo(a / 0.35), roll: smo((a - 0.1) / 0.5), move: smo((a - 0.2) / 0.4), lower: smo((a - 0.6) / 0.4) });   // tahap: naik -> berguling menelungkup -> bergeser ke atas Isabel -> turun & memeluk
SLEEP.hug = newHug();
function hugStart(next) {   // Luis tiba-tiba memeluk Isabel dari atas
  const H = SLEEP.hug; if (SLEEP.stage !== 5 || !SLEEP.together || !world.aula.isabelPos()) { if (next) { IT.open = true; world.aula.isabelChat(true); itShow('night'); } return; }
  H.tgt = 1; H.next = next; H.busy = true; H.wait = 0; H.said = false; H.shy = true;   // shy = Isabel tersipu (tetap agak merah walau pelukan dilepas)
}
function kissStart(next) {   // Luis mencium Isabel (hanya saat sedang berpelukan)
  const H = SLEEP.hug; if (SLEEP.stage !== 5 || !SLEEP.together || !world.aula.isabelPos() || H.amt < 1) { if (next) { IT.open = true; world.aula.isabelChat(true); itShow('hug2'); } return; }
  H.kOn = true; H.kT = 0; H.kSaid = false; H.next = next; H.busy = true; H.wait = 0; H.shy = true;
}
function hugEnd(next) { const H = SLEEP.hug; H.tgt = 0; H.next = next; H.busy = true; H.wait = 0; }   // lepas pelukan: animasi dibalik, lalu dialog `next`
const bedRaw = () => state === 'world' && inInn && !innBusy && !QT.phase ? world.inn.bedAt(player.position.x, player.position.z) : null;   // kasur di dekat pemain (null = tidak ada); dipakai juga oleh menu Isabel (pilihan Tidur)
const bedNow = () => IT.open ? null : bedRaw();
function startSleep(together) {   // together = tidur bersama Isabel (hanya bila ia sedang ikut): berdampingan di kasur
  const bd = bedNow(); if (!bd) return;
  const iq = together && world.aula.isabelMode() === 'follow' ? world.aula.isabelPos() : null, lx = Math.cos(bd.face) * 0.4, lz = -Math.sin(bd.face) * 0.4;   // (lx, lz) = geseran ke samping kasur
  Object.assign(SLEEP, { stage: 1, t: 0, amt: 0, spot: bd, from: { x: player.position.x, z: player.position.z, y: player.position.y }, f0: P.face, faded: false, together: !!iq, noSleep: false, ox: iq ? -lx : 0, oz: iq ? -lz : 0, ix: lx, iz: lz, iFrom: iq, hug: newHug() });
  QT.phase = 9; QT.t = 0; P.drawT = 0; P.runT = 0; P.v.set(0, 0, 0); stick.x = stick.y = 0;
  bd.cover(true);   // selimut menutupi badan
}
// ---------- PELUK DARI BELAKANG (setelah bangun tidur bersama Isabel) ----------
// Muncul pilihan 'Peluk dari belakang' di menu Isabel sekali setelah bangun (AFTER.back; hilang saat keluar penginapan atau setelah dipakai). Luis berjalan ke belakang Isabel, kedua lengannya melingkar ke pinggangnya,
// lalu Isabel berkata ia harus kembali ke Bunda; pemain memilih melepas pelukan. Memakai QT.phase = 10 (kontrol terkunci). Semua angka bisa diubah di sini:
//   t = lama berjalan ke belakang & memeluk (detik) | pause = jeda sebelum dialog muncul | dist = jarak Luis di belakang Isabel (m; kecilkan bila masih renggang, besarkan bila badan menembus) |
//   waist = tinggi tangan (perut) Isabel di atas pinggul Luis (m; naikkan bila tangan terlalu rendah) | reach = tangan Luis menjangkau sekian m ke DEPAN dari titik tengah pinggang Isabel (besarkan bila tangan masih menembus perut, kecilkan bila tidak sampai) |
//   gap = jarak tiap tangan dari garis tengah perut (m; kedua tangan terpisah 2 x gap, naikkan bila masih bersentuhan) | lean = badan Luis condong ke depan (rad) | headDown = kepala Luis menunduk bersandar di bahu Isabel (rad)
//   Lengan membentuk huruf O di sekeliling badan Isabel: bahu -> siku MEMBUKA selebar badannya (elbowW = jarak siku ke kiri/kanan dari tengah badan Isabel (m); elbowF = siku maju(+)/mundur(-) dari tengah badan Isabel (m); elbowY = siku sekian m di atas pinggang),
//   lalu siku -> tangan MERAPAT miring turun ke arah perut (siku lebih tinggi dari tangan: atur lewat elbowY dan waist) dan kedua tangan berhenti di depan perutnya tanpa bersentuhan. Lingkaran kurang besar: naikkan elbowW / reach; kurang dekat: kecilkan dist.
const BACKHUG = { t: 1.4, pause: 0.8, dist: 0.20, waist: 0.05, reach: 0.14, gap: 0.07, elbowW: 0.34, elbowF: -0.02, elbowY: 0.20, lean: 0.12, headDown: 0.25 };
const AFTER = { back: false };
const BH = { amt: 0, tgt: 0, t: 0, from: null, f0: 0, said: false, wait: 0 };
function bhStart() {
  const q = world.aula.isabelPos(); if (!q || QT.phase || q.rot === undefined) return;
  Object.assign(BH, { amt: 0, tgt: 1, t: 0, from: { x: player.position.x, z: player.position.z }, f0: P.face, said: false, wait: 0 });
  QT.phase = 10; QT.t = 0; P.drawT = 0; P.runT = 0; P.v.set(0, 0, 0); stick.x = stick.y = 0;
  world.aula.isabelHold(true);   // Isabel berdiri diam selama dipeluk
}
function bhEnd() {
  QT.phase = 0; QT.t = 0; BH.amt = BH.tgt = 0; AFTER.back = false;
  world.aula.isabelHold(false); world.aula.isabelShy(0); world.aula.isabelBlush(0);
  if (IT.open) itEnd();
}
function bhTick(dt) {
  const q = world.aula.isabelPos();
  if (state !== 'world' || !inInn || !q || q.rot === undefined) { bhEnd(); return; }
  if (BH.amt !== BH.tgt) { const d = BACKHUG.t > 0 ? dt / BACKHUG.t : 1; BH.amt = BH.tgt > BH.amt ? Math.min(BH.tgt, BH.amt + d) : Math.max(BH.tgt, BH.amt - d); }
  const e = smo(BH.amt), tx = q.x - Math.sin(q.rot) * BACKHUG.dist, tz = q.z - Math.cos(q.rot) * BACKHUG.dist;   // titik berdiri di belakang Isabel
  player.position.x = BH.from.x + (tx - BH.from.x) * e; player.position.z = BH.from.z + (tz - BH.from.z) * e;
  let d = q.rot - BH.f0; d = Math.atan2(Math.sin(d), Math.cos(d)); P.face = BH.f0 + d * e; player.rotation.y = P.face;   // menghadap arah yang sama dengan Isabel
  world.aula.isabelShy(e); world.aula.isabelBlush(0.2 + 0.6 * e);
  if (BH.tgt === 1 && BH.amt >= 1) {
    if (!BH.said) { BH.wait += dt; if (BH.wait >= BACKHUG.pause) { BH.said = true; IT.open = true; world.aula.isabelChat(true); itShow('backHug'); } }
    else if (!IT.open) BH.tgt = 0;   // dialog tertutup tak terduga: lepas pelukan
  } else if (BH.tgt === 0 && BH.amt <= 0) bhEnd();
}
const _bA = new THREE.Vector3(), _bB = new THREE.Vector3(), _bC = new THREE.Vector3(), _bD = new THREE.Vector3(), _bS = new THREE.Vector3(), _bE = new THREE.Vector3(), _bT = new THREE.Vector3(), _bP = new THREE.Vector3(), _bW = new THREE.Vector3();
const _bq1 = new THREE.Quaternion(), _bq2 = new THREE.Quaternion(), _bq3 = new THREE.Quaternion();
function bhAim(node, child, target, w) {   // putar tulang `node` supaya anaknya (`child`) mengarah ke `target` (dunia); w = seberapa jauh (0..1) menuju hasil
  player.updateMatrixWorld(true);
  node.getWorldPosition(_bA); child.getWorldPosition(_bB);
  _bC.copy(_bB).sub(_bA).normalize(); _bD.copy(target).sub(_bA).normalize();
  _bq1.setFromUnitVectors(_bC, _bD);
  node.getWorldQuaternion(_bq2); _bq2.premultiply(_bq1);
  node.parent.getWorldQuaternion(_bq3); _bq3.invert().multiply(_bq2);
  node.quaternion.slerp(_bq3, w); node.updateMatrixWorld(true);
}
function bhArm(UA, LA, H, T, pole, w) {   // IK dua tulang: bahu -> siku -> tangan mencapai T; siku condong ke arah `pole`
  player.updateMatrixWorld(true);
  UA.getWorldPosition(_bS); LA.getWorldPosition(_bE); H.getWorldPosition(_bW);
  const l1 = _bS.distanceTo(_bE), l2 = _bE.distanceTo(_bW);
  _bP.copy(T).sub(_bS); const d = Math.min(Math.max(_bP.length(), 0.05), (l1 + l2) * 0.995); _bP.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _bT.copy(_bS).addScaledVector(_bP, d);   // titik tangan yang bisa dicapai
  _bD.copy(pole).addScaledVector(_bP, -pole.dot(_bP)).normalize();   // arah siku tegak lurus garis bahu -> tangan
  _bE.copy(_bS).addScaledVector(_bP, a).addScaledVector(_bD, h);
  const tg = _bT.clone(), el = _bE.clone();
  bhAim(UA, LA, el, w); bhAim(LA, H, tg, w);
}
const _bPole = new THREE.Vector3(), _bTgt = new THREE.Vector3();
function backHugPose(dt) {   // berdiri di belakang Isabel, kedua lengan melingkar ke pinggangnya (IK), kepala bersandar di bahunya
  const k = 1 - Math.exp(-dt * 10), b = bones, a = smo(BH.amt);
  if (vrm) { const sc = vrm.scene; sc.rotation.x = 0; sc.rotation.y = 0; sc.position.z = 0; sc.position.y += (0 - sc.position.y) * (1 - Math.exp(-dt * 14)); }
  if (!b) return;
  const wr = smo((a - 0.45) / 0.55), kp = k * (1 - wr);   // wr = lengan sudah melingkar (IK); kp = pose biasa (lengan turun) memudar saat melingkar
  pose(b.hips, 0, 0, 0, k); pose(b.spine, BACKHUG.lean * a, 0, 0, k); pose(b.chest, BACKHUG.lean * a, 0, 0, k); pose(b.neck, 0.08 * a, 0, 0, k); pose(b.head, BACKHUG.headDown * a, 0, 0.08 * a, k);
  pose(b.lUA, 0.1, 0, -1.25, kp); pose(b.rUA, 0.1, 0, 1.25, kp); pose(b.lLA, 0, 0, 0, kp); pose(b.rLA, 0, 0, 0, kp);
  pose(b.lUL, 0, 0, 0, k); pose(b.rUL, 0, 0, 0, k); pose(b.lLL, 0, 0, 0, k); pose(b.rLL, 0, 0, 0, k);
  const q = world.aula.isabelPos();
  if (wr > 0.001 && q && q.rot !== undefined && b.lUA && b.lLA && b.lH && b.rUA && b.rLA && b.rH && b.hips) {
    player.updateMatrixWorld(true); b.hips.getWorldPosition(_bTgt);
    const fx = Math.sin(q.rot), fz = Math.cos(q.rot), lx = Math.cos(q.rot), lz = -Math.sin(q.rot), wy = _bTgt.y + BACKHUG.waist, w = (1 - Math.exp(-dt * 12)) * wr;   // (fx, fz) = arah hadap Isabel, (lx, lz) = sisi KIRI Luis
    for (const sd of [1, -1]) {   // sd = 1 lengan kiri Luis, -1 lengan kanan
      _bTgt.set(q.x + fx * BACKHUG.reach + lx * sd * BACKHUG.gap, wy, q.z + fz * BACKHUG.reach + lz * sd * BACKHUG.gap);   // tangan di depan perut, kiri & kanan TIDAK bersentuhan (jarak 2 x gap)
      _bPole.set(q.x + lx * sd * BACKHUG.elbowW + fx * BACKHUG.elbowF, wy + BACKHUG.elbowY, q.z + lz * sd * BACKHUG.elbowW + fz * BACKHUG.elbowF);   // titik siku: di samping badan Isabel (lebar)
      if (sd === 1) { bhAim(b.lUA, b.lLA, _bPole, w); bhAim(b.lLA, b.lH, _bTgt, w); } else { bhAim(b.rUA, b.rLA, _bPole, w); bhAim(b.rLA, b.rH, _bTgt, w); }   // lengan atas ke siku, lengan bawah ke tangan (bertemu di depan perut)
    }
  }
}
function isabelWake(p) {   // Isabel bangun & berdiri di samping pemain (p = titik muncul pemain)
  if (!SLEEP.together) return; SLEEP.together = false;
  world.aula.isabelLie(0); if (p) world.aula.isabelWarp({ x: p.x, y: p.y, z: p.z, face: p.face }, INN_ENV);
}
function endSleep() {   // selesai / dibatalkan: pose, selimut, dan layar dikembalikan
  SLU.hinted = false;
  if (IT.open && SLEEP.stage === 5) itEnd();   // dibatalkan saat ngobrol di kasur: dialog ditutup
  if (SLEEP.together) isabelWake({ x: player.position.x, y: player.position.y, z: player.position.z, face: P.face });   // dibatalkan di tengah jalan: Isabel tetap dikembalikan berdiri
  if (SLEEP.spot) SLEEP.spot.cover(false);
  SLEEP.stage = 0; SLEEP.spot = null; QT.phase = 0; QT.t = 0; SLEEP.hug = newHug();
  if (vrm) { vrm.scene.rotation.x = 0; vrm.scene.rotation.y = 0; vrm.scene.position.z = 0; }
  if (SLEEP.faded) { const f = $('fade'); f.style.transition = 'opacity .5s'; f.style.opacity = 0; SLEEP.faded = false; }
}
function sleepTick(dt) {
  if (state !== 'world' || !inInn || !SLEEP.spot) { endSleep(); return; }   // mis. mati / pindah tempat saat tidur
  const S = SLEEP, sp = S.spot, f = $('fade'), sm = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
  S.t += dt;
  if (S.together) world.aula.isabelShy(smo((S.hug.amt - 0.45) / 0.45));   // ekspresi malu / gugup seperti referensi: alis cemas, mulut kecil terbuka (hanya saat dipeluk; hilang pelan saat pelukan dilepas)
  if (S.together) world.aula.isabelBlush(S.hug.shy ? Math.max(0.45, smo((S.hug.amt - 0.4) / 0.6), S.hug.k) : 0); world.aula.isabelKiss(S.hug.k);   // Isabel memerah saat dipeluk
  if (S.stage === 1) {   // berbaring: bergeser ke kasur, menghadap ke arah kaki, rebah terlentang
    const e = sm(S.t / S.lie); S.amt = e;
    player.position.x = S.from.x + (sp.x + S.ox - S.from.x) * e; player.position.z = S.from.z + (sp.z + S.oz - S.from.z) * e; player.position.y = S.from.y + (sp.y - S.from.y) * e;
    if (S.together && S.iFrom) { const q = S.iFrom, dr = Math.atan2(Math.sin(sp.face - q.rot), Math.cos(sp.face - q.rot));   // Isabel ikut berbaring di sisi lain kasur
      const hb = bones && bones.head ? bones.head.getWorldPosition(_slH) : null;   // kepala Isabel diarahkan tepat di samping kepala pemain (2x geseran samping)
      world.aula.isabelLie(Math.max(e, 0.001), q.x + (sp.x + S.ix - q.x) * e, q.y + (sp.y - q.y) * e, q.z + (sp.z + S.iz - q.z) * e, q.rot + dr * e, hb ? hb.x + 2 * S.ix : undefined, hb ? hb.z + 2 * S.iz : undefined); }
    let d = sp.face - S.f0; d = Math.atan2(Math.sin(d), Math.cos(d)); P.face = S.f0 + d * e; player.rotation.y = P.face;
    if (S.t >= S.lie + 0.3) {
      if (S.together && world.aula.isabelPos()) { S.stage = 5; S.t = 0; IT.open = true; world.aula.isabelChat(true); itShow('sleepAsk'); }   // sudah berbaring berdampingan: ngobrol dulu atau langsung tidur (kamera menyorot wajah)
      else sleepResume(false);
    }
  } else if (S.stage === 5) {   // berbaring & mengobrol (dialog Isabel terbuka)
    const H = S.hug;   // adegan peluk: amt bergerak ke tgt; setelah sampai, jeda sebentar lalu dialog berikutnya muncul
    if (H.kOn) {   // ciuman: turun -> bertahan -> naik (H.k 0..1)
      const T = 2 * KISS.t + KISS.hold; H.kT += dt; H.k = smo(Math.min(H.kT / KISS.t, (T - H.kT) / KISS.t, 1));
      if (!H.kSaid && H.kT >= KISS.t) { H.kSaid = true; toast(ISABEL_NAME + ': “...!”', 1600); }
      if (H.kT >= T) { H.kOn = false; H.k = 0; H.wait = 0; }
    } else if (H.amt !== H.tgt) {
      const d = HUG.t > 0 ? dt / HUG.t : 1; H.amt = H.tgt > H.amt ? Math.min(H.tgt, H.amt + d) : Math.max(H.tgt, H.amt - d);
      if (H.tgt === 1 && !H.said && H.amt >= 0.55) { H.said = true; world.aula.isabelSpeak(1.2, 'Eh?!'); toast(ISABEL_NAME + ': “Eh—?! L-Luis...?!”', 2200); }
    } else if (H.busy) {
      H.wait += dt;
      if (H.wait >= HUG.pause) { H.busy = false; const n = H.next; H.next = null; if (n) { IT.open = true; world.aula.isabelChat(true); itShow(n); } }
    }
    const K = hugK(H.amt); player.position.x = sp.x + S.ox + 2 * S.ix * K.move; player.position.z = sp.z + S.oz + 2 * S.iz * K.move;   // bergeser ke atas Isabel (2 x geseran = jarak dua kepala)
    if (!IT.open && !H.busy) sleepResume(true);   // dialog tertutup tak terduga (mis. Isabel menghilang): bangun lagi
  } else if (S.stage === 2) {   // layar menggelap
    if (S.t >= S.dark) {   // gelap total
      if (S.noSleep) { S.stage = 3; S.t = S.hold; }   // tidak jadi tidur: langsung bangun (tanpa pemulihan HP)
      else { S.stage = 3; S.t = 0; P.hp = P.max; $('msg').textContent = '💤 Zzz...'; }   // HP pulih
    }
  } else if (S.stage === 3) {   // tidur (layar gelap)
    if (S.t >= S.hold) {   // bangun: pindah ke samping kasur, badan tegak lagi, layar terang
      sp.cover(false); S.hug = newHug();
      if (vrm) { vrm.scene.rotation.x = 0; vrm.scene.rotation.y = 0; vrm.scene.position.z = 0; }
      player.position.set(sp.out.x, sp.out.y, sp.out.z); P.face = sp.out.face; player.rotation.y = P.face; camYaw = P.face + Math.PI; S.amt = 0;
      const tg = S.together; if (tg && !S.noSleep) AFTER.back = true; isabelWake(sp.out); if (tg) setTimeout(() => toast(ISABEL_NAME + (S.noSleep ? ': “Baiklah, mungkin lain kali.”' : ': “Aku tidur nyenyak sekali. Terima kasih sudah menemaniku.”'), 3400), 900);
      const m = S.noSleep ? '🛏️ Kamu bangun lagi' : '☀️ Kamu terbangun dengan segar\nHP pulih sepenuhnya'; $('msg').textContent = m;
      setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3200);
      f.style.transition = 'opacity ' + S.wake + 's'; f.style.opacity = 0; S.stage = 4; S.t = 0;
    }
  } else if (S.stage === 4 && S.t >= S.wake) { S.faded = false; endSleep(); }
}
function sleepResume(noSleep) {   // lanjut dari berbaring: layar menggelap (noSleep = tidak jadi tidur, hanya bangun lagi)
  const S = SLEEP; if (!S.spot || (S.stage !== 1 && S.stage !== 5)) return;
  S.noSleep = !!noSleep; S.stage = 2; S.t = 0; S.faded = true;
  const f = $('fade'); f.style.transition = 'opacity ' + S.dark + 's'; f.style.opacity = 1;
  if (!noSleep && S.together) toast(ISABEL_NAME + ': “Selamat tidur.”', 2400);
}
// Sorotan wajah saat tidur bersama (berbaring & ngobrol): kamera di atas kasur dari sisi kaki, menunduk ke WAJAH kedua orang. Titik bidik = titik tengah antara kepala pemain dan kepala Isabel yang DIBACA dari tulang
// kepala keduanya (bukan perkiraan), jadi kamera tidak bisa meleset ke badan / kaki. fwd = jarak ke arah kaki dari wajah (m); up = tinggi di atas wajah (m) (fwd & up = jarak dasar, otomatis diperbesar agar kedua wajah muat di lebar layar);
// tilt = derajat (radian) kamera menunduk lebih rendah dari wajah supaya wajah naik ke atas kotak dialog; maxK = batas pembesaran jarak (layar HP tegak); in / out = detik beralih ke sorotan / kembali.
const SLCAM = { fwd: 0.85, up: 0.75, tilt: 0.16, pad: 0.22, maxK: 2.8, in: 1.2, out: 0.9 };
let slCamT = 0;   // 0..1 kekuatan sorotan wajah
const _slH = new THREE.Vector3(), _slI = new THREE.Vector3(), SL_SHOT = { cam: new THREE.Vector3(), look: new THREE.Vector3() };
let _slWarned = false;
// ---- Geser kamera sendiri saat berbaring & ngobrol: seret layar = putar kamera mengelilingi wajah (kiri-kanan = putar, atas-bawah = naik-turun); roll mouse / cubit dua jari = zoom; tombol 🎥 = atur ulang ----
const SLU = { yaw: 0, pitch: 0, zoom: 1, ys: 0, ps: 0, zs: 1, hinted: false };   // yaw / pitch / zoom = keinginan pemain; ys / ps / zs = nilai yang sudah dihaluskan (dipakai sleepShot)
const SL_T0 = Math.atan2(SLCAM.up, SLCAM.fwd);   // sudut naik kamera bawaan
const slCamOn = () => state === 'world' && inInn && SLEEP.together && SLEEP.stage === 5 && (IT.open || SLEEP.hug.busy);
const slDrag = (dx, dy) => { SLU.yaw -= dx * 0.006; SLU.pitch = Math.min(1.5 - SL_T0, Math.max(0.12 - SL_T0, SLU.pitch + dy * 0.005)); };
const slZoom = z => { SLU.zoom = Math.min(2.2, Math.max(0.4, z)); };
const slPts = new Map(); let slPd0 = 1, slZ0 = 1;   // jari di layar (sentuh)
addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || !slCamOn() || e.target !== renderer.domElement) return;
  slPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (slPts.size === 2) { const [a, b] = [...slPts.values()]; slPd0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; slZ0 = SLU.zoom; }
});
addEventListener('pointermove', e => {
  if (!slCamOn()) { if (slPts.size) slPts.clear(); return; }
  if (e.pointerType === 'mouse') { if ((e.buttons & 3) && e.target === renderer.domElement) slDrag(e.movementX, e.movementY); return; }
  const t = slPts.get(e.pointerId); if (!t) return;
  const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
  if (slPts.size === 1) slDrag(dx, dy);
  else if (slPts.size === 2) { const [a, b] = [...slPts.values()]; slZoom(slZ0 * slPd0 / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y))); }   // jari merenggang = zoom in
});
const slUp = e => { slPts.delete(e.pointerId); };
addEventListener('pointerup', slUp); addEventListener('pointercancel', slUp);
const slBtn = document.createElement('button');
slBtn.type = 'button'; slBtn.hidden = true; slBtn.textContent = '🎥 Atur ulang kamera';
slBtn.style.cssText = skinBtn.style.cssText;
slBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); SLU.yaw = SLU.pitch = 0; SLU.zoom = 1; });
slBtn.addEventListener('mousedown', e => e.stopPropagation());
document.body.appendChild(slBtn);
// ---- Panel diagnosa (sementara): tampil di pojok kiri-atas saat berbaring & ngobrol, untuk melacak kenapa Luis tidak terlihat. Ubah SL_DEBUG ke false bila sudah beres. ----
const SL_DEBUG = false;
const slDbg = document.createElement('pre');
slDbg.hidden = true; slDbg.style.cssText = 'position:fixed;left:8px;top:8px;z-index:60;margin:0;padding:6px 8px;background:rgba(0,0,0,.75);color:#9fffa8;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;border-radius:6px;pointer-events:none;white-space:pre;max-width:96vw;overflow:hidden;';
document.body.appendChild(slDbg);
let slDbgT = 0; const _slD1 = new THREE.Vector3(), _slD2 = new THREE.Vector3();
function slDebugUpdate(dt) {
  const on = SL_DEBUG && slCamOn();
  if (slDbg.hidden === on) slDbg.hidden = !on;
  if (!on) return;
  slDbgT -= dt; if (slDbgT > 0) return; slDbgT = 0.25;
  const f = v => v.x.toFixed(2) + ', ' + v.y.toFixed(2) + ', ' + v.z.toFixed(2), ndc = v => { const p = v.clone().project(cam); return 'layar ' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + (p.z > 1 ? ' (DI BELAKANG KAMERA)' : ''); };
  const L = bones && bones.head ? bones.head.getWorldPosition(_slD1) : null, hasI = world.aula.isabelHead && world.aula.isabelHead(_slD2), ip = world.aula.isabelPos();
  let n = 0, vis = 0; if (vrm) vrm.scene.traverse(o => { if (o.isMesh) { n++; if (o.visible && o.parent) vis++; } });
  const rows = [
    'Luis kepala   : ' + (L ? f(L) + '  ' + ndc(L) : 'tidak ada'),
    'Luis akar     : ' + f(player.position) + '  hadap ' + P.face.toFixed(2),
    'Luis model    : skin ' + skinCur + ' | scene.visible ' + (vrm ? vrm.scene.visible : '-') + ' | player.visible ' + player.visible + ' | mesh tampil ' + vis + '/' + n + ' | rotX ' + (vrm ? vrm.scene.rotation.x.toFixed(2) : '-') + ' | posY ' + (vrm ? vrm.scene.position.y.toFixed(2) : '-'),
    'Isabel kepala : ' + (hasI ? f(_slD2) + '  ' + ndc(_slD2) : 'belum terbaca'),
    'Isabel akar   : ' + (ip ? f(new THREE.Vector3(ip.x, ip.y, ip.z)) : 'null'),
    'Kamera        : ' + f(cam.position) + ' | fov ' + cam.fov + ' aspek ' + cam.aspect.toFixed(2),
    'Kasur         : x ' + SLEEP.spot.x.toFixed(2) + ' y ' + SLEEP.spot.y.toFixed(2) + ' z ' + SLEEP.spot.z.toFixed(2) + ' hadap ' + SLEEP.spot.face.toFixed(2) + ' | geser (' + SLEEP.ix.toFixed(2) + ', ' + SLEEP.iz.toFixed(2) + ')',
    'Geseran kamera: yaw ' + SLU.yaw.toFixed(2) + ' pitch ' + SLU.pitch.toFixed(2) + ' zoom ' + SLU.zoom.toFixed(2)
  ];
  slDbg.textContent = rows.join('\n');
}
function slBtnUpdate() {   // tombol atur ulang + petunjuk tampil hanya saat berbaring & ngobrol
  const on = slCamOn();
  if (slBtn.hidden === on) slBtn.hidden = !on;
  if (on && !SLU.hinted) { SLU.hinted = true; toast('🎥 Seret layar untuk memutar kamera · roll mouse / cubit dua jari untuk zoom', 4600); }
}
function sleepShot(dt = 0.016) {
  const S = SLEEP, sp = S.spot; if (!sp || !bones || !bones.head) return null;
  bones.head.getWorldPosition(_slH);   // kepala pemain
  const dx = Math.sin(sp.face), dz = Math.cos(sp.face);   // arah kepala -> kaki
  let mx = _slH.x + S.ix, my = _slH.y, mz = _slH.z + S.iz, sep = Math.hypot(S.ix, S.iz) * 2;   // cadangan (Isabel belum terbaca): kepala pemain digeser ke tengah kasur
  if (world.aula.isabelHead && world.aula.isabelHead(_slI)) {   // kepala Isabel yang sebenarnya -> titik tengah dua wajah
    mx = (_slH.x + _slI.x) / 2; my = (_slH.y + _slI.y) / 2; mz = (_slH.z + _slI.z) / 2;
    sep = Math.abs((_slI.x - _slH.x) * dz - (_slI.z - _slH.z) * dx);   // jarak menyamping antar wajah
    const along = Math.abs((_slI.x - _slH.x) * dx + (_slI.z - _slH.z) * dz);   // selisih sepanjang kasur (kepala dua orang harusnya sejajar)
    if (!_slWarned && S.stage === 5 && (along > 0.6 || sep > 1.4)) { _slWarned = true; console.warn('Kamera tidur: posisi kepala Isabel janggal (selisih sepanjang kasur ' + along.toFixed(2) + ' m, menyamping ' + sep.toFixed(2) + ' m). Cek arah / tinggi baring Isabel.'); }
  }
  const base = Math.hypot(SLCAM.fwd, SLCAM.up), tanH = Math.tan(cam.fov * Math.PI / 360) * cam.aspect;   // tanH = setengah lebar pandang (tan)
  const k = Math.min(SLCAM.maxK, Math.max(1, ((sep / 2 + SLCAM.pad) / tanH) / base));   // jarak diperbesar sampai kedua wajah muat di lebar layar (HP tegak)
  const e = 1 - Math.exp(-dt * 12); SLU.ys += (SLU.yaw - SLU.ys) * e; SLU.ps += (SLU.pitch - SLU.ps) * e; SLU.zs += (SLU.zoom - SLU.zs) * e;   // geseran pemain dihaluskan
  const hgR = hugK(S.hug.amt).roll, yw = SLU.ys + HUG.camYaw * hgR, ca = Math.cos(yw), sa = Math.sin(yw), hx = dx * ca + dz * sa, hz = dz * ca - dx * sa;   // arah mendatar kamera dari wajah (dx, dz diputar sebesar yaw)
  const D = base * k * SLU.zs, t1 = Math.min(1.5, Math.max(0.12, SL_T0 + SLU.ps + HUG.camPitch * hgR));   // jarak (x zoom) & sudut naik kamera
  const cx = mx + hx * Math.cos(t1) * D, cy = my + Math.sin(t1) * D, cz = mz + hz * Math.cos(t1) * D;
  SL_SHOT.cam.set(cx, cy, cz);
  const th = Math.min(1.52, t1 + SLCAM.tilt);   // bidikan sedikit lebih menunduk dari arah wajah: wajah muncul di bagian atas layar
  SL_SHOT.look.set(cx - hx * Math.cos(th) * D, cy - Math.sin(th) * D, cz - hz * Math.cos(th) * D);
  return SL_SHOT;
}
let sleepTurn = 0, sleepLaugh = 0;   // sleepTurn 0..1 seberapa jauh Luis menoleh ke Isabel; sleepLaugh 0..1 getar tertawa
function sleepPose(dt) {   // pose berbaring terlentang: badan direbahkan 90 derajat, tangan & kaki rileks, tinggi badan dihitung dari titik terendah supaya pas di atas kasur. Adegan peluk: badan berguling menelungkup di atas Isabel (lihat HUG)
  const k = 1 - Math.exp(-dt * 10), b = bones, a = SLEEP.amt, H = SLEEP.hug, K = hugK(H.amt), hg = H.amt > 0.001;
  if (vrm) {
    const sc = vrm.scene, ks = 1 - Math.exp(-dt * 14);
    sc.rotation.x += (-Math.PI / 2 * a - sc.rotation.x) * ks; sc.position.z += (0 - sc.position.z) * ks;
    if (hg || sc.rotation.y !== 0) sc.rotation.y = Math.PI * K.roll;   // berguling mengelilingi sumbu badan (sebelum direbahkan): 0 = terlentang, PI = menelungkup
    sc.updateMatrixWorld(true);
    let minY = 1e9;
    for (const [n, m] of FLOOR_BONES) { if (hg && /Arm|Hand/.test(n)) continue; const nd = vrm.humanoid.getNormalizedBoneNode(n); if (nd) minY = Math.min(minY, nd.getWorldPosition(_fp).y - m); }   // saat memeluk, lengan tidak dihitung (lengan memang menjulur ke bawah)
    const lift = HUG.up * K.lift - (HUG.up - HUG.hover) * K.lower - KISS.drop * H.k;   // tinggi badan di atas kasur (menopang -> turun memeluk)
    if (minY < 1e9) sc.position.y += -(minY - player.position.y - lift) * (1 - Math.exp(-dt * 14));
  }
  if (!b) return;
  // saling menoleh: saat berbaring berdampingan dengan Isabel & ngobrol (tahap 5) atau mulai tidur (tahap 2-3), kepala + leher Luis menoleh ke Isabel (sisi +x badan Luis)
  const lt = SLEEP.together && (SLEEP.stage === 5 || SLEEP.stage === 2 || SLEEP.stage === 3) ? 1 : 0; sleepTurn += (lt - sleepTurn) * (1 - Math.exp(-dt * 3));
  if (SLEEP.spot && SLEEP.together && world.aula.isabelLook) world.aula.isabelLook(lt * (1 - K.roll));   // Isabel menoleh ke Luis (saat dipeluk ia menatap lurus ke atas, ke wajah Luis) pada saat yang sama
  const mx = (p, q, t) => p + (q - p) * t, hw = K.roll, wr = K.lower;   // hw = badan sudah menelungkup, wr = lengan melingkar memeluk
  const lau = SLEEP.stage === 5 && IT.open && /^jk/.test(IT.node) ? 1 : 0; sleepLaugh += (lau - sleepLaugh) * (1 - Math.exp(-dt * 6));   // tertawa saat becanda: dada bergetar halus
  const sh = Math.sin(P.t * 17) * 0.035 * sleepLaugh;
  const ar = (HUG.arch - KISS.arch * H.k) * K.lower;   // punggung melengkung ke atas (spine + chest), kepala menunduk balik sebesar jumlahnya supaya wajah tetap lurus ke bawah
  pose(b.hips, 0, 0, 0, k); pose(b.spine, sh - ar * 0.45, 0, 0, k); pose(b.chest, sh - ar * 0.55, 0, 0, k); pose(b.neck, 0, mx(0.3 * sleepTurn, 0, hw), 0, k); pose(b.head, mx(0.05 * a, 0, hw) + ar + sh, mx(0.2 * a + 0.6 * sleepTurn, HUG.turn, hw), 0, k);
  const uy = mx(1.4, 0.95, wr), ly = mx(0.2, 1.3, wr);   // lengan atas: menjulur ke bawah di sisi Isabel -> melingkar; lengan bawah: lurus -> menekuk ke punggung Isabel
  pose(b.lUA, 0.1 * (1 - hw), -uy * hw, -1.15 * (1 - hw), k); pose(b.rUA, 0.1 * (1 - hw), uy * hw, 1.15 * (1 - hw), k);
  pose(b.lLA, 0, mx(-0.25 * a, -ly, hw), 0, k); pose(b.rLA, 0, mx(0.25 * a, ly, hw), 0, k);
  pose(b.lUL, 0, 0, mx(0.08, 0.12, hw), k); pose(b.rUL, 0, 0, mx(-0.08, -0.12, hw), k);
  pose(b.lLL, mx(0.05, 0.5 + 0.12 * Math.sin(P.t * 3), hw), 0, 0, k); pose(b.rLL, mx(0.05, 0.35 + 0.12 * Math.sin(P.t * 3 + 1.6), hw), 0, 0, k);   // saat menelungkup: kaki ditekuk ke atas, bergoyang kecil
}
function qtButton(qn, isb, bd, gs, wg, ly) {   // label tombol: dekat ratu = Berlutut; dekat Isabel = Isabel; selain itu Mengobrol; petunjuk sekali per kunjungan
  const m = qn ? 'kneel' : isb ? (bedRaw() ? 'isabelbed' : 'isabel') : bd ? 'sleep' : gs ? 'guild-' + gs.id : ly ? 'lyra' : wg ? 'warga-' + wg.id : 'talk';
  if (m !== QT.label) { QT.label = m; $('talk').innerHTML = m === 'kneel' ? '🧎 Berlutut <small>E</small>' : m === 'isabelbed' ? '👸 Isabel / 🛏️ Tidur <small>E</small>' : m === 'isabel' ? '👸 Bicara dengan Isabel <small>E</small>' : m === 'sleep' ? '🛏️ Tidur <small>E</small>' : m === 'lyra' ? '💬 Bicara dengan ' + LYRA.name + ' <small>E</small>' : m.startsWith('warga-') ? '💬 Bicara dengan ' + wg.nama + ' <small>E</small>' : m.startsWith('guild-') ? (gs.id === 'board' ? '📋 Lihat Papan Misi' : '💬 Bicara dengan ' + gs.short) + ' <small>E</small>' : '💬 Mengobrol <small>E</small>'; }
  if (bd && !QT.bhinted) { QT.bhinted = true; toast('🛏️ Tekan E untuk tidur di kasur dan memulihkan HP', 3400); }
  if (qn && !QT.hinted) { QT.hinted = true; toast('👑 Berlututlah (E) untuk menghadap Ratu', 3200); }
  if (isb && !QT.ihinted) { QT.ihinted = true; toast('👸 Tekan E untuk berbicara dengan Putri Isabel: mengobrol atau mengajaknya berjalan bersama', 3600); }
}
const kneelAmt = () => { const sm = x => { x = clamp01(x); return x * x * (3 - 2 * x); }; return QT.phase === 1 ? sm(QT.t / KNEEL.down) : QT.phase === 3 ? 1 - sm(QT.t / KNEEL.up) : 1; };
// Pose berlutut mengikuti siluet referensi (berlutut.jpe), dilihat dari samping:
//  - kaki kiri di depan: paha hampir mendatar ke depan, betis tegak, telapak rata di lantai
//  - kaki kanan di belakang: lutut menyentuh lantai, paha miring sedikit ke belakang, betis mendatar ke belakang, ujung kaki menapak ke bawah
//  - badan condong ke depan ~30 derajat, kepala tertunduk dalam
//  - lengan kiri: siku bertumpu di paha depan, lengan bawah mendatar ke depan (tangan terkepal di atas lutut); lengan kanan rileks di samping
// Semua nilai dikalikan a (0..1) supaya turun / bangkitnya halus. Tinggi badan dihitung otomatis dari titik terendah kaki & lutut (KNEE_FLOOR), jadi pas di lantai walau ukuran model beda.
const KNEE_FLOOR = [['leftFoot', .06], ['leftToes', .03], ['rightLowerLeg', .07], ['rightFoot', .06], ['rightToes', .03]];   // [tulang, jari-jari tubuh]: titik yang tidak boleh tembus lantai
const _kfp = new THREE.Vector3();
// Jari: tangan kiri menggenggam erat (kepalan), tangan kanan menggenggam longgar. Sumbu tekuk jari = z lokal (kiri negatif, kanan positif). Tulang jari yang tidak ada di model dilewati.
const FINGER_CURL = { IndexProximal: 1.3, IndexIntermediate: 1.6, IndexDistal: 1.1, MiddleProximal: 1.35, MiddleIntermediate: 1.6, MiddleDistal: 1.1, RingProximal: 1.4, RingIntermediate: 1.6, RingDistal: 1.1, LittleProximal: 1.45, LittleIntermediate: 1.6, LittleDistal: 1.1, ThumbMetacarpal: 0.2, ThumbProximal: 0.5, ThumbIntermediate: 0.6, ThumbDistal: 0.6 };
let fingerCache = null;
function getFingers() {
  if (fingerCache || !vrm) return fingerCache;
  fingerCache = [];
  for (const [side, sg, amt] of [['left', -1, 1], ['right', 1, 0.35]]) for (const n in FINGER_CURL) { const nd = vrm.humanoid.getNormalizedBoneNode(side + n); if (nd) fingerCache.push({ nd, v: sg * amt * FINGER_CURL[n] }); }
  return fingerCache;
}
function resetFingers() { if (fingerCache) for (const f of fingerCache) f.nd.rotation.set(0, 0, 0); }
function kneelPose(dt) {
  const a = kneelAmt(), k = 1 - Math.exp(-dt * 12), b = bones;
  if (vrm) {
    const sc = vrm.scene, ks = 1 - Math.exp(-dt * 14);
    sc.rotation.x += (0 - sc.rotation.x) * ks;
    sc.updateMatrixWorld(true);
    let minY = 1e9;
    for (const [n, m] of KNEE_FLOOR) { const nd = vrm.humanoid.getNormalizedBoneNode(n); if (nd) minY = Math.min(minY, nd.getWorldPosition(_kfp).y - m); }
    if (minY < 1e9) sc.position.y += -(minY - player.position.y) * (1 - Math.exp(-dt * 12));   // turun / naik sampai titik terendah pas di lantai
  }
  if (!b) return;
  // badan: pinggul + tulang belakang + dada = condong ~0.55 rad ke depan, kepala menunduk lagi
  pose(b.hips, 0.15 * a, 0, 0, k); pose(b.spine, 0.25 * a, 0, 0, k); pose(b.chest, 0.15 * a, 0, 0, k); pose(b.head, 0.8 * a, 0, 0, k);
  // kaki depan (kiri): paha mendatar (total -1.5), betis tegak (total 0)
  pose(b.lUL, -1.65 * a, 0, 0.08 * a, k); pose(b.lLL, 1.5 * a, 0, 0, k);
  // kaki belakang (kanan): paha miring ke belakang (total +0.3), betis mendatar ke belakang sedikit naik (total +1.65), ujung kaki menapak
  pose(b.rUL, 0.15 * a, 0, -0.08 * a, k); pose(b.rLL, 1.35 * a, 0, 0, k);
  // lengan kiri: siku menekuk ke belakang, tangan menumpu di atas dengkul kiri
  pose(b.lUA, -0.2 * a + 0.1 * (1 - a), 0, -1.45 * a - 1.25 * (1 - a), k); pose(b.lLA, 0, -1.7 * a, 0, k);
  // lengan kanan: rileks di samping badan, siku sedikit menekuk
  pose(b.rUA, -0.65 * a + 0.1 * (1 - a), 0, 1.4 * a + 1.25 * (1 - a), k); pose(b.rLA, 0, 0.7 * a, 0, k);
  const fg = getFingers(); if (fg) for (const f of fg) pose(f.nd, 0, 0, f.v * a, k);   // genggaman
}

// ---------- Ekspresi wajah Luis: berkedip & mulut bicara ----------
// Kedip acak (lebih sering saat bicara, sesekali dua kali berturut-turut). Mulut bergerak mengikuti huruf hidup (a/i/u/e/o) pada kalimat yang diucapkan (luisSpeak).
// Berlaku untuk skin yang sedang dipakai (baju biasa / baju tidur). Ubah angka LFX bila terlalu besar / kecil.
const LFX = { blinkIdle: [2.4, 5.8], blinkTalk: [1.8, 4.2], mouthMax: 0.75, mouthSpeed: 18 };
const LF_VOWEL = { a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh' }, LF_MOUTH = ['aa', 'ih', 'ou', 'ee', 'oh'];
const LF = { vrm: null, T: 0, blinkAt: 1.5, blinkT: -1, blinkV: 0, seq: [], seqI: 0, seqT: 0, m: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 } };
function luisSpeak(text) {   // mulut Luis bergerak selama mengucapkan text
  const out = [];
  for (const ch of String(text || '').toLowerCase()) {
    if (LF_VOWEL[ch]) out.push({ v: LF_VOWEL[ch], amp: 0.6 + Math.random() * 0.4, d: 1 });
    else if (/[a-z]/.test(ch)) { if (out.length && out[out.length - 1].v) out.push({ v: null, amp: 0.15, d: 0.35 }); }
    else if (/[,;:]/.test(ch)) out.push({ v: null, amp: 0, d: 3 });
    else if (/[.!?…]/.test(ch)) out.push({ v: null, amp: 0, d: 6 });
    else if (ch === ' ') out.push({ v: null, amp: 0, d: 0.6 });
  }
  const sec = Math.min(5, 0.5 + String(text || '').length * 0.07), sum = out.reduce((a, o) => a + o.d, 0) || 1;
  for (const o of out) o.d = o.d / sum * sec;
  LF.seq = out; LF.seqI = 0; LF.seqT = 0;
}
function luisFace(dt) {
  const em = vrm && vrm.expressionManager;
  if (LF.vrm !== vrm) {   // skin ditukar: ekspresi skin lama dikosongkan, skin baru mulai dari awal
    const o = LF.vrm && LF.vrm.expressionManager; if (o) { o.setValue('blink', 0); for (const k of LF_MOUTH) o.setValue(k, 0); }
    LF.vrm = vrm; LF.blinkT = -1; LF.blinkV = 0; LF.blinkAt = LF.T + 1.5; for (const k of LF_MOUTH) LF.m[k] = 0;
  }
  if (!em) return;
  dt = Math.min(0.05, Math.max(0, dt)); LF.T += dt;
  const talking = LF.seqI < LF.seq.length;
  // kedip: kelopak menutup cepat lalu membuka sedikit lebih lambat
  if (LF.blinkT < 0 && LF.T >= LF.blinkAt) { LF.blinkT = 0; const r = a => a[0] + Math.random() * (a[1] - a[0]); LF.blinkAt = LF.T + (Math.random() < 0.15 ? 0.45 : r(talking ? LFX.blinkTalk : LFX.blinkIdle)); }
  let b = 0;
  if (LF.blinkT >= 0) { LF.blinkT += dt; const k = LF.blinkT / 0.22; if (k >= 1) LF.blinkT = -1; else { b = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65; b = b * b * (3 - 2 * b); } }
  if (SLEEP.hug && SLEEP.hug.k > b) b = SLEEP.hug.k;   // memejamkan mata saat mencium
  if (b !== LF.blinkV) { LF.blinkV = b; em.setValue('blink', b); }
  // mulut: ikuti urutan huruf
  let cur = null;
  if (talking) { LF.seqT += dt; while (LF.seqI < LF.seq.length && LF.seqT >= LF.seq[LF.seqI].d) { LF.seqT -= LF.seq[LF.seqI].d; LF.seqI++; } cur = LF.seq[LF.seqI] || null; }
  const sm = Math.min(1, dt * LFX.mouthSpeed);
  for (const k of LF_MOUTH) { const t = cur && cur.v === k ? cur.amp * LFX.mouthMax : 0, n = LF.m[k] + (t - LF.m[k]) * sm; LF.m[k] = n < 0.002 ? 0 : n; em.setValue(k, LF.m[k]); }
}

// ---------- Loop utama ----------
const clock = new THREE.Clock();
// ---------- Lyra (party): hubungan ke game ----------
lyra.bind({
  scene,
  state: () => state,
  ctx: () => [state, exploreMode ? 1 : 0, golemMode ? 1 : 0, inGuild ? 1 : 0, inInn ? 1 : 0, inPalace ? 1 : 0, inAula ? 1 : 0, inChurch ? 1 : 0].join('|'),   // berubah = pemain pindah tempat: Lyra muncul lagi di dekat pemain
  playerPos: () => player.position,
  footY: () => (P.air ? null : player.position.y),
  face: () => P.face,
  enemies: () => enemies,
  hit: (e, n, dir, force) => { hitSrc = 'lyra'; try { return hurtEnemy(e, n, dir, force); } finally { hitSrc = ''; } },   // hitSrc = 'lyra' -> musuh mencatat Lyra sebagai pemberi damage
  fx: (pos, col, n, sp) => burst(pos, col, n, sp),
  toast: (m, ms) => toast(m, ms),
  hpFrac: () => P.hp / P.max,
  heal: frac => { if (!(P.hp > 0) || P.hp >= P.max) return false; P.hp = Math.min(P.max, P.hp + P.max * frac); return true; },
  noCombat: () => kaelenOn() || !!QT.phase || GU.open,   // tidak menyerang saat duel Kaelen / dialog
  sfx: (k, v) => ptPlay(k, v),   // efek suara skill Petir Louis (petir_menerjang.mp3 / petir_menyambar.mp3 / petir_berlari.mp3); mengikuti slider efek
  shake: v => { shake = Math.max(shake, v); },   // guncangan layar
  dangers: collectDangers,   // area bahaya skill bos yang dibaca Lyra untuk menghindar
  clamp: (x, z) => {   // titik mundur Lyra harus di dalam arena / tidak di dalam dinding dungeon (null = tidak boleh)
    if (state === 'play') { const hl = Math.hypot(x, z), lim = R - 1.5; if (hl > lim) { x *= lim / hl; z *= lim / hl; } }
    if (exploreMode && dgX) { const p = new THREE.Vector3(x, 0, z); dgX.collide(p, 0.45); if (dgX.solidAt(p.x, p.z)) return null; x = p.x; z = p.z; }
    return { x, z };
  },
  dashLen: (x, z, dx, dz, L) => {   // skill Lyra (Tarian Bayangan): jepit jarak terjang seperti Dash Petir (arena bundar & dinding dungeon)
    const S = new THREE.Vector3(x, 0, z), dir = new THREE.Vector3(dx, 0, dz);
    if (state === 'play') { const Rr = R - 1.6, bq = S.x * dir.x + S.z * dir.z, cq = S.x * S.x + S.z * S.z - Rr * Rr, disc = bq * bq - cq; if (disc > 0) L = Math.min(L, Math.max(3, -bq + Math.sqrt(disc))); }
    if (exploreMode && dgX) L = Math.max(0.5, dgX.dashLen(S, dir, L, PLAYER_R + 0.35));
    return L;
  },
});

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
  skinSync();
  if (state === 'play' || state === 'world') {
    const mv = new THREE.Vector3((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), 0, (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0));
    if (Math.hypot(stick.x, stick.y) > 0.2) { mv.x += stick.x; mv.z += stick.y; } // joystick layar
    mv.applyAxisAngle(UP, camYaw); // gerak mengikuti arah kamera
    if (aulaCine || QT.phase || IT.open || GU.open) { mv.set(0, 0, 0); stick.x = stick.y = 0; }   // diam selama sorotan ratu / saat menghadap ratu
    const moving = mv.lengthSq() > 0;
    if (P.trap > 0 || P.hs > 0) { P.v.set(0, 0, 0); }   // terjebak balok es / baru terpental: tidak bisa berjalan (dorongan di bawah)
    else if (P.roll > 0) { player.position.addScaledVector(P.rv, 11 * dt); P.roll -= dt; P.v.copy(P.rv).multiplyScalar(5); }
    else if (P.vs > 0 || P.sl > 0 || P.sm > 0 || P.pt > 0 || P.ex > 0) { P.v.set(0, 0, 0); } // saat Vertical Spin / Slash Besar, gerak diatur vsTick / slTick
    else if (P.atk > 0 && P.cross) { // gerak otomatis: maju sedikit di tiap tebasan (melangkah saat menebas)
      const el = P.dur - P.atk, f = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face)), bT = CX.n * CX.step, fin = el >= bT;
      const u = fin ? (el - bT) / CX.finT : (el % CX.step) / CX.step;
      player.position.addScaledVector(f, (u > 0.15 && u < 0.65 ? (fin ? 2 : 2.4) : 0) * dt); P.v.set(0, 0, 0);
    } else {
      if (P.atk > 0 && !P.cross) { const pp = 1 - P.atk / P.dur; if (pp > 0.15 && pp < 0.55) player.position.addScaledVector(new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face)), 2.6 * dt); } // langkah maju kecil saat mengayun
      if (moving) { mv.normalize(); if (P.atk <= 0) P.face = Math.atan2(mv.x, mv.z); }
      P.v.lerp(moving ? mv.multiplyScalar(P.atk > 0 ? 1.5 : 5.5 * (PT.buff > 0 ? PT.runMul : 1) * (state === 'world' && !kaelenOn() && (keys.ShiftLeft || keys.ShiftRight) ? 1.7 : 1)) : ZERO, 1 - Math.exp(-dt * 10));
      player.position.addScaledVector(P.v, dt);
    }
    P.hs = Math.max(0, P.hs - dt);
    if (P.push.lengthSq() > 0.04) { player.position.addScaledVector(P.push, dt); P.push.multiplyScalar(Math.exp(-dt * 5)); } else P.push.set(0, 0, 0);   // terpental (tinju / bola es bos es): melaju lalu melambat
    if (state === 'play') { const hl = Math.hypot(player.position.x, player.position.z); if (hl > R - 1.5) { player.position.x *= (R - 1.5) / hl; player.position.z *= (R - 1.5) / hl; } }
    collidePlayer(); // tidak bisa menembus monster / pohon
    P.inv = Math.max(0, P.inv - dt);
    let fd = P.face - player.rotation.y;
    fd = Math.atan2(Math.sin(fd), Math.cos(fd)); player.rotation.y += fd * (1 - Math.exp(-dt * 14));

    if (P.atk > 0) {
      P.atk -= dt;
      if (P.cross) crossTick();
      else if (!P.hit && P.atk < P.dur * 0.62) {
        P.hit = true; if (BF.on) bfSlash(); if (DK.on) dkSlashWave(0);   // Dark Mode: tiap serangan dasar melempar slash hitam ke depan (seperti penguatan skill 4)
        const f = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face));
        for (const e of [...enemies]) {
          const d = e.g.position.clone().sub(player.position).setY(0), l = d.length();
          if (l < 2.8 * (DK.pow > 0 ? DKB.rng : 1) + e.r && d.normalize().dot(f) > 0.1) hurtEnemy(e, Math.round((22 + (Math.random() * 6 | 0)) * (BF.on ? 1.3 : 1) * (DK.pow > 0 ? DKB.dmg : 1)), d, 16);
        }
      }
    } else if (P.comboT > 0 && (P.comboT -= dt) <= 0) P.combo = 0; // jeda terlalu lama: hitungan combo reset
    if (P.vs > 0) vsTick(dt);
    if (P.sl > 0) slTick(dt);
    if (P.sm > 0) smTick(dt);
    if (P.pt > 0) ptTick(dt);
    if (P.ex > 0) exTick(dt);
    // pedang: terhunus saat menyerang & DRAW_HOLD detik sesudahnya; disarungkan saat berlari / sudah lewat waktunya
    if (P.atk > 0 || P.vs > 0 || P.sl > 0 || P.sm > 0 || P.pt > 0 || P.ex > 0) { P.drawT = DRAW_HOLD; P.runT = 0; }
    else { if (P.drawT > 0) P.drawT -= dt; P.runT = moving && P.roll <= 0 ? P.runT + dt : 0; if (P.runT > RUN_SHEATH) P.drawT = 0; }
    setDrawn(P.atk > 0 || P.drawT > 0);
    P.heavy += ((P.drawT > 0 ? 1 : 0.3) - P.heavy) * (1 - Math.exp(-dt * (P.drawT > 0 ? 8 : 1.5))); // napas berat -> ringan
    updateEnemies(dt); collidePlayer(); kaelenGuard(); // musuh bergerak/terpental lalu cek tabrakan lagi
    loot.update(dt, state);   // item jatuhan, peti hadiah, tombol tas
    if (exploreMode) exploreTick(dt);   // dungeon jelajah: cahaya, kristal, gerbang bos, hitung musuh
    if (state === 'world') wildSpawnTick(dt); // monster liar di hutan: muncul acak, hilang kalau jauh, darah pulih saat aman
    qtTick(dt);
    poseAndAnimate(dt, P.roll > 0 ? 0 : Math.min(1, P.v.length() / 5.5));
    if (state === 'world') worldTick(); // petunjuk arah & cek masuk lubang
    if (state === 'play' && !exploreMode && !enemies.length) {   // (di dungeon jelajah tidak ada wave: gerbang bos dibuka oleh exploreTick)
      if (wave === WAVES.length - 1) { if (!loot.blocksWin()) end(true); }   // bos terakhir kalah: layar kemenangan menunggu peti hadiah dibuka
      else if ((next += dt) > 1.5) { next = 0; wave++; P.hp = Math.min(P.max, P.hp + 30); banner(WAVES[wave] === 'dragon' ? 'Level 4\nNaga Api Muncul!' : WAVES[wave] === 'boss' ? (dgTheme ? 'Level 3\nBos ' + DG_THEMES[dgTheme].boss.split(',')[0] : kotaMode && mutantGltf ? 'Level 3\nBos Mutan' : 'Level 3\nBos Penyihir') : `Level ${wave + 1}`); spawnWave(); }
    }
  } else if (state === 'lose') defeatTick(dt);
  else if (state === 'fall') fallTick(dt);
  airTick(dt);
  updateSwords(dt);
  tickSkills(dt);
  luisFace(dt);   // kedip & mulut Luis (sebelum vrm.update menerapkannya)
  vrm && vrm.update(dt);
  buffBosses();   // bos baru muncul: HP & kecepatan dinaikkan (BOSS_BUFF)
  lyra.tick(dt);   // Lyra (party): ikut berjalan, menyerang musuh, memulihkan HP
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
  if (_cineOver) { cam.position.copy(_camN); _cineOver = false; }   // kamera ikut-pemain melanjutkan dari posisinya sendiri (bukan dari posisi hasil sorotan ratu): peralihan balik jadi mulus
  const target = player.position.clone();
  if (state === 'fall') target.y = 0; // saat jatuh kamera tetap di atas, hanya menunduk melihat pemain
  const C = CAMS[camMode];
  if (!orbit()) camYaw += (0 - camYaw) * Math.min(1, rdt * 5); // mode lain: kembali ke depan. Mode 360°: bebas
  zoomS += (zoom - zoomS) * Math.min(1, rdt * 10);
  let lx = target.x, lz = target.z, ly = C.look + (state === 'fall' ? player.position.y * 0.85 : (inPalace || inAula || (state === 'world' && inKekaisaran)) ? player.position.y : P.air ? player.position.y * 0.8 : 0); // di istana lantai 2 / panggung singgasana kamera ikut menatap setinggi lantai
  if (state === 'lose') { // kamera sinematik: turun rendah, mendekat dari samping
    const f = faceVec(), sd = new THREE.Vector3(f.z, 0, -f.x), low = clamp01((D.t - 0.3) / 1.2);
    const want = target.clone().addScaledVector(sd, 4.6 - 1.3 * low).addScaledVector(f, 0.8).setY(1.4 - 0.85 * low);
    cam.position.lerp(want, Math.min(1, dt * 3)); ly = 0.9 - 0.45 * low; lx += f.x * 0.35 * low; lz += f.z * 0.35 * low;
  } else {
    const D = Math.hypot(C.off.y, C.off.z), pit = orbit() ? camPitch : Math.atan2(C.off.y, C.off.z); // jarak tetap, sudut naik-turun bebas di mode 360°
    const off = new THREE.Vector3(C.off.x, Math.sin(pit) * D, Math.cos(pit) * D).multiplyScalar(zoomS * (1 - 0.3 * slowK)).applyAxisAngle(UP, camYaw); // slowmo: kamera mendekat
    const want = target.clone().add(off);
    if (exploreMode && dgX) dgX.clipCam(player.position, want);               // kamera tidak menembus dinding dungeon
    if (inPalace) world.palace.clipCam(player.position, want);               // tidak menembus dinding / langit-langit istana
    if (inAula) world.aula.clipCam(player.position, want);                   // sama untuk Aula Raja
    if (inInn) world.inn.clipCam(player.position, want);                     // dan Penginapan Karavan
    if (inGuild && guild) guild.clipCam(player.position, want);              // dan Balai Petualang
    cam.position.lerp(want, Math.min(1, rdt * 4));
    if (exploreMode && dgX) {   // kamera tidak menembus dinding; kalau pemain baru menembus tembok (Dash Petir) garis pemain->kamera terhalang & kamera akan menciut ke bawah pemain -> langsung pindah ke posisi ideal (want, sudah dipotong)
      const pp = player.position, d0 = Math.hypot(cam.position.x - pp.x, cam.position.z - pp.z);
      dgX.clipCam(pp, cam.position);
      const d1 = Math.hypot(cam.position.x - pp.x, cam.position.z - pp.z);
      if (d1 < d0 * 0.6 && d1 < Math.hypot(want.x - pp.x, want.z - pp.z) * 0.8) cam.position.copy(want);
    }
    if (inPalace) world.palace.clipCam(player.position, cam.position);       // peralihan halus tadi pun tidak boleh sempat di luar dinding
    if (inAula) world.aula.clipCam(player.position, cam.position);
    if (inInn) world.inn.clipCam(player.position, cam.position);
    if (inGuild && guild) guild.clipCam(player.position, cam.position);
  }
  cam.position.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), 0).multiplyScalar(shake * 0.4));
  _camN.copy(cam.position);   // simpan posisi kamera ikut-pemain sebelum ditimpa sorotan
  const dy = enemies.find(e => e.dying); if (dy && slowK > 0) { lx += (dy.g.position.x - lx) * 0.45 * slowK; lz += (dy.g.position.z - lz) * 0.45 * slowK; } // slowmo: kamera menoleh ke musuh terakhir
  if (aulaCine && !(state === 'world' && inAula)) aulaCine = null;
  if (aulaCine) {   // sorotan ke ratu: menunggu ratu selesai dimuat, menyapu kaki -> wajah, menahan, lalu menyatu kembali ke kamera biasa
    const A = AULA_INTRO, rd = world.aula.queenReady();
    if (rd === 2) aulaCine.t += rdt; else if (rd < 0 || (aulaCine.wait += rdt) > A.wait) aulaCine = null;
    if (aulaCine) {
      const t = aulaCine.t, k = clamp01(t / A.sweep), u = clamp01((t - A.sweep - A.hold) / A.back), w = 1 - u * u * (3 - 2 * u), sh = world.aula.queenShot(k);
      if (t >= A.sweep + A.hold + A.back) aulaCine = null;
      else if (sh) { _cineOver = true; cam.position.lerp(_cineV.set(sh.cam.x, sh.cam.y, sh.cam.z), w); lx += (sh.look.x - lx) * w; ly += (sh.look.y - ly) * w; lz += (sh.look.z - lz) * w; }
    }
  }
  if (!inAula || state !== 'world') qwT = 0;   // sorotan ratu berjalan: kamera menyatu ke kamera ratu selama QT.phase 4 (ratu berdiri & berjalan ke pemain), lalu kembali halus
  else qwT = (QT.phase === 4 && !aulaCine) ? Math.min(1, qwT + rdt / QWALK_CAM.in) : Math.max(0, qwT - rdt / QWALK_CAM.out);
  if (qwT > 0) {
    const sh = world.aula.queenWalkShot();
    if (sh) { const w = qwT * qwT * (3 - 2 * qwT); _cineOver = true; cam.position.lerp(_cineV.set(sh.cam.x, sh.cam.y, sh.cam.z), w); lx += (sh.look.x - lx) * w; ly += (sh.look.y - ly) * w; lz += (sh.look.z - lz) * w; } else qwT = 0;
  }
  slCamT = (state === 'world' && inInn && SLEEP.together && SLEEP.spot && (SLEEP.stage === 1 || SLEEP.stage === 5)) ? Math.min(1, slCamT + rdt / SLCAM.in) : Math.max(0, slCamT - rdt / SLCAM.out);   // tidur bersama: kamera menyorot wajah pemain & Isabel
  if (slCamT > 0) {
    const sh = sleepShot(rdt);
    if (sh) {
      _cineV.copy(sh.cam); if (inInn) world.inn.clipCam(player.position, _cineV);   // kamera tidak menembus dinding / langit-langit kamar
      const w = slCamT * slCamT * (3 - 2 * slCamT); _cineOver = true; cam.position.lerp(_cineV, w); lx += (sh.look.x - lx) * w; ly += (sh.look.y - ly) * w; lz += (sh.look.z - lz) * w;
    } else slCamT = 0;
  }
  slBtnUpdate(); slDebugUpdate(rdt);
  itCamT = (IT.open && state === 'world' && !SLEEP.stage) ? Math.min(1, itCamT + rdt / ITCAM.in) : Math.max(0, itCamT - rdt / ITCAM.out);   // mengobrol dengan Isabel: kamera menyorot Isabel
  if (itCamT > 0) {
    const q = world.aula.isabelPos();
    if (q) {
      const ang = Math.atan2(player.position.x - q.x, player.position.z - q.z) + ITCAM.side + (QT.phase === 10 ? Math.PI : 0);   // peluk dari belakang: kamera dari depan Isabel (wajahnya kelihatan)   // arah dari Isabel ke pemain, digeser ke samping
      _cineV.set(q.x + Math.sin(ang) * ITCAM.dist, q.y + ITCAM.h, q.z + Math.cos(ang) * ITCAM.dist);
      if (inAula) world.aula.clipCam(player.position, _cineV);   // di dalam istana kamera tidak menembus dinding
      if (inInn) world.inn.clipCam(player.position, _cineV);     // sama di penginapan
      if (inGuild && guild) guild.clipCam(player.position, _cineV);   // dan di guild
      const w = itCamT * itCamT * (3 - 2 * itCamT); _cineOver = true; cam.position.lerp(_cineV, w); lx += (q.x - lx) * w; ly += (q.y + ITCAM.lookH - ly) * w; lz += (q.z - lz) * w;
    } else itCamT = 0;
  }
  lyCamT = (GU.open && lyra.talking && state === 'world' && !SLEEP.stage) ? Math.min(1, lyCamT + rdt / LYCAM.in) : Math.max(0, lyCamT - rdt / LYCAM.out);   // ngobrol dengan Lyra: kamera menyorot wajah Lyra
  if (lyCamT > 0) {
    const hd = lyra.headPos(_lyH);
    if (hd) {
      const ang = Math.atan2(player.position.x - hd.x, player.position.z - hd.z) + LYCAM.side;   // arah dari Lyra ke pemain, digeser sedikit ke samping
      _cineV.set(hd.x + Math.sin(ang) * LYCAM.dist, hd.y + LYCAM.up, hd.z + Math.cos(ang) * LYCAM.dist);
      if (inAula) world.aula.clipCam(player.position, _cineV);
      if (inInn) world.inn.clipCam(player.position, _cineV);
      if (inGuild && guild) guild.clipCam(player.position, _cineV);   // di dalam ruangan kamera tidak menembus dinding
      const w = lyCamT * lyCamT * (3 - 2 * lyCamT); _cineOver = true; cam.position.lerp(_cineV, w); lx += (hd.x - lx) * w; ly += (hd.y + LYCAM.lookUp - ly) * w; lz += (hd.z - lz) * w;
    } else lyCamT = 0;
  }
  cam.lookAt(lx, ly, lz);
  if (!(state === 'world' && !inPalace && !inChurch)) world.aula.isabelPause();   // Isabel ikut di dunia luar, Istana Kekaisaran, dan Penginapan Karavan; di tempat lain ia menunggu   (di penginapan Isabel memakai INN_ENV: tabrakan & lantai penginapan)
  if (world.group.visible) { uploadStep(); queenWarmStep(); isabelWarmStep(); if (state === 'world' && !inPalace && !inChurch) world.aula.isabelUpdate(player.position.x, player.position.z, rdt, inGuild ? GUILD_ENV : inInn ? INN_ENV : ISA_ENV); world.update(rdt, clock.elapsedTime, player.position, cam.position, cam); if (inGuild && guild) guild.update(rdt, clock.elapsedTime, player.position.x, player.position.z); const qn = state === 'world' && queenNear(), isb = !qn && isabelNear(), bd = !qn && !isb && !!bedNow(), gs = !qn && !isb && !bd ? guildSpotNow() : null, ly = !qn && !isb && !bd && !gs && lyraNearNow(), wg = !qn && !isb && !bd && !gs && !ly ? talkTarget() : null, ct = state === 'world' && !QT.phase && !IT.open && !GU.open && (qn || isb || bd || !!gs || ly || !!wg || world.canTalk()); if ($('talk').hidden === ct) $('talk').hidden = !ct; qtButton(qn, isb, bd, gs, wg, ly); } else if (!$('talk').hidden) $('talk').hidden = true;
  adaptRes();
  renderer.render(scene, cam);
}
frame();
