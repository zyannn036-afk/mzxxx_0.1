import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VILLAGE, HOUSES, PLAZA_R, ENTRANCE_PATH, doorPoint, villageClearAt } from './village-layout.js';
import { buildVillage } from './village.js';
import { createNPCs } from './npcs.js';
import { FOREST, FOREST_EXT, FOREST_ROAD, FOREST_ROAD_2, TRAIL_GROVE, TRAIL_POND, TRAIL_STONES, forestAmount, clampToWorld, zoneDist } from './forest-layout.js';
import { buildForest } from './forest.js';
import { buildCityGen } from './city.js';
import { buildChurch } from './church.js';
import { buildPalaceGen } from './palace.js';
import { CITY_ZONES } from './city-layout.js';
import { buildMeadowGen } from './meadow.js';
import { MEADOW_CIRCLES, MEADOW_SEG_X, RUINS_CIRCLES } from './meadow-layout.js';
import { DUSUN } from './meadow-village-layout.js';
import { buildSawahGen } from './sawah.js';
import { SAWAH_CIRCLES, SAWAH_SEG_X } from './sawah-layout.js';
import { buildKekaisaranGen } from './kekaisaran.js';
import { citizenTalk, citizenCanTalk, citizenTalkName } from './kekaisaran-npc.js';
import { KEKAISARAN_CITY_CIRCLES, NW_PLAIN_CIRCLES, NW_TOWN_CIRCLES, NE_PLAIN_CIRCLES, NE_MTN_CIRCLES } from './kekaisaran-layout.js';
import { buildDataranBLGen } from './kekaisaran-dataran.js';
import { buildDataranTLGen } from './kekaisaran-dataran-tl.js';
import { buildKotaDungeonGen } from './kota-dungeon.js';
import { ChunkManager, CHUNK_CFG } from './chunks.js';

// ============================================================
//  DUNIA LUAR — dataran hijau, pohon, rumput, bunga, & lubang menuju dungeon
//  Pusat dunia (0,0,0) = lubang dungeon. Pemain muncul di SPAWN dan berjalan mengikuti jalan tanah.
//
//  SISTEM CHUNK (lihat chunks.js): dunia tetap satu hamparan, isinya dibagi dua chunk:
//    1) 'hutan-desa' = dataran + lubang dungeon + Desa Padang Hijau + Hutan Besar/Dalam (+ Gerbang Batu Kuno). Dibangun di awal.
//    2) 'kota'       = Kota Arunika + interior katedral + interior istana (+ warga kota & Ratu/Putri). Dibangun BERTAHAP di latar
//                      saat pemain mulai mendekat, hanya digambar bila dekat, collider-nya hanya dicek bila dekat.
//    4) 'sawah-1..N' = Ladang Sawah Gemah Ripah (ujung timur padang, ±770 m): beberapa bagian berurutan (lihat SAWAH_SEG_X), cara kerjanya sama seperti padang.
//    3) 'padang-1..N' = Padang Rumput Arunika (timur kota, ±1.600 m + Sungai Bening): beberapa bagian berurutan (lihat MEADOW_SEG_X), masing-masing dibangun bertahap & hanya digambar bila dekat.
//  Langit, awan, matahari & tanah dasar milik dunia (global), jadi perbatasan antar-chunk tidak terlihat.
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

// dekal tanah transparan (jalan, bercak rumput, lantai kota): digambar paling awal agar tidak menimpa efek skill transparan
const fixDecals = root => root.traverse(o => { const m = o.material; if (m && !Array.isArray(m) && m.transparent && m.depthWrite === false && m.polygonOffset && m.blending === THREE.NormalBlending) o.renderOrder = Math.min(o.renderOrder, -5); });

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
  // ---------- Chunk ----------
  const wildG = new THREE.Group(); wildG.name = 'chunk-hutan-desa';   // seluruh isi dataran + desa + hutan
  const cityG = new THREE.Group(); cityG.name = 'chunk-kota';          // kota + interior katedral/istana + warga kota
  const wildDyn = [], cityDyn = [], dusunDyn = [], sawahDyn = SAWAH_SEG_X.slice(1).map(() => []);                                     // collider BERGERAK (NPC) per chunk; collider statis ada di `colliders` / chunk.colliders
  const chunks = new ChunkManager(group, { budgetMs: COARSE ? 2.5 : CHUNK_CFG.BUDGET_MS, log: m => console.info('[chunk]', m) });
  let prewarm = null;                                                   // diisi game.js: kompilasi shader + unggah tekstur sebelum chunk pertama kali tampil
  // interior katedral & istana dibangun belakangan (di dalam chunk kota); game.js memanggilnya lewat objek perantara ini
  const churchRef = { v: null }, palaceRef = { v: null }, palaceQueue = [];
  const church = { get group() { return churchRef.v && churchRef.v.group; }, show: v => { if (churchRef.v) churchRef.v.show(v); } };
  // Interior Istana Kekaisaran (Aula Raja, lantai 1): hidup di chunk Kota Kekaisaran; ready = false selama chunk belum selesai dibangun
  const innRef = { v: null }; let dimInn = false;   // Penginapan Karavan (Distrik 2): dimInn = true saat pemain di dalamnya (untuk tingkat redup cahaya)
  const aulaRef = { v: null }, kekRef = { v: null }; let indoor = 0, indoorK = 0;   // kekRef: Kota Kekaisaran (tinggi tangga istana di luar)   // indoor 0/1 = pemain di dalam aula; indoorK = nilainya yang dihaluskan (meredupkan matahari & cahaya langit)
  const aula = {
    get ready() { return !!aulaRef.v; },
    show: v => { indoor = v ? 1 : 0; dimInn = false; if (aulaRef.v) aulaRef.v.show(v); },
    collide: (p, r) => { if (aulaRef.v) aulaRef.v.collide(p, r); },
    groundY: (x, z, y) => aulaRef.v ? aulaRef.v.groundY(x, z, y) : y,
    area: (x, z, y) => aulaRef.v ? aulaRef.v.area(x, z, y) : '',
    clipCam: (from, to) => aulaRef.v ? aulaRef.v.clipCam(from, to) : to,
    queenReady: () => aulaRef.v ? aulaRef.v.queenReady() : 0,                   // 2 = ratu siap, 1 = memuat, -1 = gagal
    queenNear: (x, z, y) => aulaRef.v ? aulaRef.v.queenNear(x, z, y) : false,    // pemain cukup dekat di depan singgasana
    kneelSpot: () => aulaRef.v ? aulaRef.v.kneelSpot() : null,                 // titik berlutut (dunia) di lantai sebelum tangga singgasana
    queenCome: () => aulaRef.v ? aulaRef.v.queenCome() : false,                  // ratu berdiri & berjalan menghampiri pemain
    queenArrived: () => aulaRef.v ? aulaRef.v.queenArrived() : false,
    queenLeave: () => { if (aulaRef.v) aulaRef.v.queenLeave(); },               // ratu kembali ke singgasana
    queenBusy: () => aulaRef.v ? aulaRef.v.queenBusy() : false,
    isabelMode: () => aulaRef.v ? aulaRef.v.isabelMode() : 'home',              // 'home' | 'follow' | 'stay'
    isabelNear: (x, z, y) => aulaRef.v ? aulaRef.v.isabelNear(x, z, y) : false,  // pemain dekat Isabel (tombol Ajak / Suruh menunggu)
    isabelToggle: (x, z) => aulaRef.v ? aulaRef.v.isabelToggle(x, z) : null,     // ajak / suruh menunggu -> 'follow' | 'stay' | null
    isabelUpdate: (x, z, dt, env) => { if (aulaRef.v) aulaRef.v.isabelUpdate(x, z, dt, env); },   // Isabel mengikuti pemain (tiap frame di dunia luar & dalam istana); env = { parent, push, ground } dunia luar
    isabelPos: () => aulaRef.v ? aulaRef.v.isabelPos() : null,                   // posisi Isabel (dunia) atau null
    isabelHead: v => aulaRef.v && aulaRef.v.isabelHead ? aulaRef.v.isabelHead(v) : false,   // posisi dunia kepala Isabel ke vektor v (kamera tidur bersama); false bila belum siap
    isabelLook: t => { if (aulaRef.v && aulaRef.v.isabelLook) aulaRef.v.isabelLook(t); },   // 0..1: Isabel menoleh ke pemain saat berbaring berdampingan
    isabelHold: on => { if (aulaRef.v && aulaRef.v.isabelHold) aulaRef.v.isabelHold(on); },   // Isabel berdiri diam (dipeluk dari belakang)
    isabelKiss: v => { if (aulaRef.v && aulaRef.v.isabelKiss) aulaRef.v.isabelKiss(v); },   // 0..1: Isabel memejamkan mata saat dicium
    isabelShy: v => { if (aulaRef.v && aulaRef.v.isabelShy) aulaRef.v.isabelShy(v); },   // 0..1: ekspresi malu / gugup saat dipeluk
    isabelBlush: v => { if (aulaRef.v && aulaRef.v.isabelBlush) aulaRef.v.isabelBlush(v); },   // 0..1: wajah Isabel memerah (tersipu) saat dipeluk; TANPA ini sleepTick error tiap frame -> layar freeze saat tidur bareng
    isabelChat: on => { if (aulaRef.v) aulaRef.v.isabelChat(on); },              // mulai / selesai mengobrol (Isabel menoleh ke pemain)
    isabelSpeak: (sec, text) => { if (aulaRef.v) aulaRef.v.isabelSpeak(sec, text); },          // mulut Isabel bergerak sekian detik
    isabelPause: () => { if (aulaRef.v) aulaRef.v.isabelPause(); },              // Isabel berhenti ikut & menunggu (pemain masuk gereja / istana lain / arena)
    isabelSkin: key => aulaRef.v ? aulaRef.v.isabelSkin(key) : false,                 // ganti skin Isabel ('normal' | 'pajama'); aman dipanggil tiap frame
    isabelLie: (a, x, y, z, face, hx, hz) => { if (aulaRef.v) aulaRef.v.isabelLie(a, x, y, z, face, hx, hz); },   // Isabel berbaring di kasur (tidur bersama pemain); a = 0 -> berdiri lagi
    isabelWarp: (sp, env, force) => { if (aulaRef.v) aulaRef.v.isabelWarp(sp, env, force); },   // pemain pindah masuk / keluar penginapan: Isabel muncul di sisinya (force = yang menunggu juga)
    isabelExit: (sp, env) => { if (aulaRef.v) aulaRef.v.isabelExit(sp, env); },  // pemain keluar aula: Isabel yang ikut juga keluar
    isabelEnter: sp => { if (aulaRef.v) aulaRef.v.isabelEnter(sp); },            // pemain masuk aula: Isabel yang ikut juga masuk
    isabelObj: () => aulaRef.v ? aulaRef.v.isabelObj() : null,                   // objek Putri Isabel (pemanasan shader & tekstur)
    queenObj: () => aulaRef.v ? aulaRef.v.queenObj() : null,                   // objek ratu (pemanasan shader & tekstur)
    queenPos: () => aulaRef.v ? aulaRef.v.queenPos() : null,                       // posisi ratu (dunia) atau null bila belum siap
    queenTalk: on => { if (aulaRef.v) aulaRef.v.queenTalk(on); },                  // gerakan mulut ratu saat berbicara
    queenShot: k => aulaRef.v ? aulaRef.v.queenShot(k) : null,                 // sorotan kamera ke ratu (k 0..1: kaki -> wajah); { cam, look } dunia
    queenWalkShot: () => aulaRef.v ? aulaRef.v.queenWalkShot() : null,          // sorotan kamera saat ratu berjalan menghampiri pemain; { cam, look } dunia
    inRoom: () => aulaRef.v ? aulaRef.v.inRoom() : null,                       // id kamar yang sedang dimasuki (null = di aula / galeri)
    doorAt: (x, z, y) => aulaRef.v ? aulaRef.v.doorAt(x, z, y) : null,         // id kamar bila pemain berdiri di depan pintu kamar (galeri lantai 2)
    roomExit: (x, z) => aulaRef.v ? aulaRef.v.roomExit(x, z) : false,          // pemain di depan pintu keluar kamar
    enterRoom: id => aulaRef.v ? aulaRef.v.enterRoom(id) : null,
    leaveRoom: () => aulaRef.v ? aulaRef.v.leaveRoom() : null,
  };
  const palace = {
    get group() { return palaceRef.v && palaceRef.v.group; },
    show: v => { if (palaceRef.v) palaceRef.v.show(v); },
    addCircle: (c, lvl) => { if (palaceRef.v) palaceRef.v.addCircle(c, lvl); else palaceQueue.push([c, lvl]); },
    collide: (p, r) => { if (palaceRef.v) palaceRef.v.collide(p, r); },
    groundY: (x, z, y) => palaceRef.v ? palaceRef.v.groundY(x, z, y) : y,
    area: (x, z, y) => palaceRef.v ? palaceRef.v.area(x, z, y) : '',
    clipCam: (from, to) => palaceRef.v ? palaceRef.v.clipCam(from, to) : to,
  };

  // ---------- Cahaya matahari ----------
  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x5f7f3c, 1.15);
  const sun = new THREE.DirectionalLight(0xfff0d2, 3.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  group.add(hemi, sun, sun.target);
  // Penginapan Karavan: pembungkus tipis ke interior (dibangun di chunk Kota Kekaisaran); aman dipanggil sebelum chunk selesai
  const inn = {
    get ready() { return !!innRef.v; },
    get name() { return innRef.v ? innRef.v.name : ''; },
    get spawn() { return innRef.v ? innRef.v.spawn : null; },
    show: v => { indoor = v ? 1 : 0; dimInn = !!v; if (innRef.v) innRef.v.show(v); },
    collide: (p, r) => { if (innRef.v) innRef.v.collide(p, r); },
    groundY: () => innRef.v ? innRef.v.groundY() : 0,
    clipCam: (from, to) => innRef.v ? innRef.v.clipCam(from, to) : to,
    nearDoor: (x, z) => innRef.v ? innRef.v.nearDoor(x, z) : false,
    nearExit: (x, z) => innRef.v ? innRef.v.nearExit(x, z) : false,
    nearSave: (x, z) => innRef.v ? innRef.v.nearSave(x, z) : false,   // pemain di depan Buku Tamu (tempat save game nanti)
    inRoom: () => innRef.v ? innRef.v.inRoom() : null,                 // null = di ruang umum, 0..2 = sedang di Kamar 1..3
    doorAt: (x, z) => innRef.v ? innRef.v.doorAt(x, z) : null,         // nomor pintu kamar (0..2) bila pemain berdiri di depannya, selain itu null
    inside: (x, z) => innRef.v ? innRef.v.inside(x, z) : false,        // titik di dalam telapak bangunan penginapan
    bedAt: (x, z) => innRef.v ? innRef.v.bedAt(x, z) : null,           // kasur yang bisa ditiduri di dekat pemain (null bila tidak ada)
    roomExit: (x, z) => innRef.v ? innRef.v.roomExit(x, z) : false,    // pemain di depan pintu keluar kamar
    enterRoom: i => innRef.v ? innRef.v.enterRoom(i) : null,           // pindah ke kamar i -> { x, y, z, face, name }
    leaveRoom: () => innRef.v ? innRef.v.leaveRoom() : null,           // kembali ke ruang umum -> { x, y, z, face, name }
  };
  const hemiSky0 = hemi.color.clone(), hemiGround0 = hemi.groundColor.clone(), hemiSkyIn = new THREE.Color(0xffe4c0), hemiGroundIn = new THREE.Color(0x8a6a48);   // di dalam aula: cahaya langit jadi hangat (krem / cokelat), bukan biru / hijau
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
  const shape = new THREE.Shape(); shape.absarc(0, 0, 5400, 0, Math.PI * 2, false); // 4400 -> 5400 (Jalur Turun Lembah Salju di ujung Punggungan Langit: lembah bersalju ±350 m di luar Tanjung Pandang harus ikut berpijak) // 3700 -> 4000 -> 4400 (Padang Rumput Barat Laut 400 m + Kota Dungeon 200 m di luar Gerbang Barat Laut Kota Kekaisaran; tepi tanah tetap tak terlihat). dulu 170 -> 240 -> 380 -> 560 -> 640 -> 1400 (Padang Rumput Arunika sampai x≈1250) -> 2400 (padang diperpanjang sampai x≈2070) -> 3700 (Ladang Sawah Gemah Ripah di ujung padang, sampai x≈2840); diperluas lagi supaya Kota Arunika (di timur Gerbang Batu Kuno, sampai x≈392) ikut berpijak dan tepi tanah tidak terlihat dari sana
  const holePath = new THREE.Path(); holePath.absarc(0, 0, HOLE_R, 0, Math.PI * 2, true); shape.holes.push(holePath);
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape, 64), new THREE.MeshStandardMaterial({ map: gTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 }));   // didorong ke belakang: segitiga raksasa tanah dasar kadang menembus lapisan tipis di atasnya (tanah salju, jalan, sungai) -> bercak hijau
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // bercak warna rumput (supaya tanah tidak terlihat berulang)
  const patchTex = radialAlpha(0.25);
  const patchMats = [0x3f8a30, 0x6bb044, 0x5aa03a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: 0.55, alphaMap: patchTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const patchGeo = new THREE.CircleGeometry(1, 24);
  for (let i = 0; i < (COARSE ? 18 : 34); i++) {
    const m = new THREE.Mesh(patchGeo, patchMats[i % 3]), s = R(6, 15);
    m.rotation.x = -Math.PI / 2; m.scale.set(s, s * R(0.6, 1), 1); m.rotation.z = rand() * 3;
    const a = rand() * Math.PI * 2, d = R(8, 95); m.position.set(Math.cos(a) * d, 0.01, Math.sin(a) * d); m.receiveShadow = true; wildG.add(m);
  }

  // ---------- Jalan tanah dari titik muncul menuju lubang ----------
  const pathCurve = new THREE.CatmullRomCurve3([[SPAWN.x, SPAWN.z], [11, 21], [7, 16], [8.5, 11], [3.6, 8], [1.2, 4.7]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const pathPts = pathCurve.getPoints(90);
  const dTex = dirtTex(); dTex.repeat.set(1, 1);
  const pathMesh = new THREE.Mesh(ribbon(pathPts, 2.9, 3.2), new THREE.MeshStandardMaterial({ map: dTex, roughness: 1, transparent: true, alphaMap: edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pathMesh.position.y = 0.015; pathMesh.receiveShadow = true; wildG.add(pathMesh);
  // ---------- Desa Padang Hijau: jalan masuk dari titik muncul, alun-alun, dan jalan setapak ke tiap pintu ----------
  const walkPts = pathPts.slice(); // semua titik jalan (dipakai agar pohon / rumput tidak menutupi jalan)
  const forestWalk = [];           // titik jalan menuju Hutan Besar (digabung ke walkPts setelah pohon lama dibuat)
  { const vMat = () => new THREE.MeshStandardMaterial({ map: dTex, roughness: 1, transparent: true, alphaMap: edgeAlpha(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const road = (pts, w) => { // pts: [{x,z}], digambar sebagai pita tanah
      const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.z))), pp = c.getPoints(Math.max(8, Math.round(c.getLength() * 1.6)));
      const m = new THREE.Mesh(ribbon(pp, w, 3.2), vMat()); m.position.y = 0.016; m.receiveShadow = true; wildG.add(m); walkPts.push(...pp);
    };
    road(ENTRANCE_PATH.map(([x, z]) => ({ x, z })), 2.9);
    for (const h of HOUSES) { const d = doorPoint(h, 0.6), a = Math.atan2(d.x - VILLAGE.x, d.z - VILLAGE.z), e = { x: VILLAGE.x + Math.sin(a) * (PLAZA_R - 1), z: VILLAGE.z + Math.cos(a) * (PLAZA_R - 1) }; road([e, { x: (e.x + d.x) / 2, z: (e.z + d.z) / 2 }, d], 1.7); }
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 40), new THREE.MeshStandardMaterial({ map: dTex, roughness: 1, transparent: true, alphaMap: radialAlpha(0.72), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(VILLAGE.x, 0.02, VILLAGE.z); plaza.receiveShadow = true; wildG.add(plaza);
    // jalan dari desa ke Hutan Besar + dua jalan cabang (kolam & batu kuno).
    // Titiknya disimpan di forestWalk dulu (belum di walkPts) supaya tata letak pohon & batu lama tidak berubah.
    for (const [pts, w] of [[FOREST_ROAD, 2.9], [FOREST_ROAD_2, 2.9], [TRAIL_POND, 2.0], [TRAIL_STONES, 2.0], [TRAIL_GROVE, 2.0]]) {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))), pp = c.getPoints(Math.max(8, Math.round(c.getLength() * 1.6)));
      const m = new THREE.Mesh(ribbon(pp, w, 3.2), vMat()); m.position.y = 0.016; m.receiveShadow = true; wildG.add(m); forestWalk.push(...pp);
    }
  }
  const nearPath = (x, z, pad) => { for (let i = 0; i < walkPts.length; i++) if (Math.hypot(x - walkPts[i].x, z - walkPts[i].z) < pad) return true; return false; };
  const blocked = (x, z, pad = 0) => Math.hypot(x, z) < HOLE_R + 6.5 + pad || nearPath(x, z, 2.4 + pad) || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6 + pad || Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius + pad;

  // ---------- Bangunan desa + NPC ----------
  const vrand = mulberry32(31102026); // generator acak terpisah, supaya tata letak pohon & batu dunia lama tidak berubah
  const village = buildVillage({ colliders, rand: vrand }); wildG.add(village.group);
  // warga desa/hutan di chunk hutan-desa; warga kota + Ratu & Putri di chunk kota. Model besar mereka baru dimuat SETELAH chunk kota selesai dibangun.
  const npcs = createNPCs({ colliders: wildDyn, cityColliders: cityDyn, meadowColliders: dusunDyn, sawahColliders: sawahDyn, rand: vrand, palace, cityReady: () => cityChunk.state === 'ready', prewarm: g => { if (prewarm) prewarm(g); } });
  wildG.add(npcs.group); cityG.add(npcs.cityGroup);

  // ---------- Lubang menuju dungeon ----------
  const pit = new THREE.Group(); wildG.add(pit);
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
  wildG.add(rockI);

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
    sg.add(post, board); sg.position.set(-0.2, 0, 6.2); sg.rotation.y = Math.atan2(2.6, 1.4); wildG.add(sg);
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
  // Satu InstancedMesh per petak 48 m (bukan satu mesh raksasa untuk seluruh dataran): frustum culling & pass bayangan
  // hanya memproses pohon di sekitar kamera. Urutan pemanggilan R() sengaja SAMA dengan sebelumnya (tata letak & warna tidak berubah).
  const TCELL = 48, cellOf = t => Math.floor(t.x / TCELL) + ',' + Math.floor(t.z / TCELL);
  const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.castShadow = true; m.receiveShadow = true; wildG.add(m); return m; };
  for (const pine of [false, true]) {
    const list = trees.filter(t => t.pine === pine), cells = new Map();
    for (const t of list) { const k = cellOf(t); const c = cells.get(k) || cells.set(k, { n: 0, i: 0 }).get(k); c.n++; }
    const lm = leafMat(pine ? 0.02 : 0.03);
    for (const c of cells.values()) { c.trunk = mk(pine ? trunkPine : trunkOak, barkMat, c.n); c.leaf = mk(pine ? pineLeaf : oakLeaf, lm, c.n); }
    list.forEach(t => {
      const c = cells.get(cellOf(t)), i = c.i++;
      dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix();
      c.trunk.setMatrixAt(i, dummy.matrix); c.leaf.setMatrixAt(i, dummy.matrix);
      c.leaf.setColorAt(i, tmpC.setRGB(R(0.8, 1.15), R(0.88, 1.12), R(0.75, 1.1)));
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
  grass.count = gN; wildG.add(grass);

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
  wildG.add(stems, heads);

  // ---------- Hutan Besar (di sebelah timur desa) ----------
  const forest = buildForest({
    colliders, rand: mulberry32(8112026), existing: trees, roadPts: forestWalk, COARSE, LIMIT, jitter, prep,
    geo: { trunkOak, trunkPine, oakLeaf, pineLeaf, grassGeo },
    mat: { barkMat, leafMat, swayMat },
    tex: { radialAlpha, canvasTex, dirt: dTex },
  });
  wildG.add(forest.group);

  // (Kota Arunika + interior katedral & istana dibangun bertahap oleh chunk 'kota' di bagian paling bawah)

  fixDecals(wildG);

  // ---------- Bukit jauh (tertutup kabut, memberi kedalaman) ----------
  const hillGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x5d9c4c, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const h = new THREE.Mesh(hillGeo, hillMat), a = (i / 16) * 6.283 + R(-0.15, 0.15), d = R(125, 155), s = R(24, 40);
    h.scale.set(s * R(1, 1.6), R(10, 22), s); h.position.set(Math.cos(a) * d, -1, Math.sin(a) * d); h.rotation.y = rand() * 6;
    if (zoneDist(h.position.x, h.position.z) > 45) wildG.add(h); // bukit yang menimpa area hutan dilewati
  }

  // ---------- Daftarkan chunk ----------
  // Lingkaran area dipakai untuk jarak pemain -> chunk. +30 m menutup pohon "tembok hutan" di luar lingkaran jelajah.
  const wildCircles = [{ x: 0, z: 0, r: LIMIT }, { x: VILLAGE.x, z: VILLAGE.z, r: 24 }, { x: 62, z: 30, r: 10 }, { x: FOREST.x, z: FOREST.z, r: FOREST.radius }, ...FOREST_EXT].map(c => ({ ...c, r: c.r + 30 }));
  const plainDeco = [grass, stems, heads];   // rumput & bunga dataran: tidak bisa di-frustum-cull (tersebar di seluruh dataran), jadi dimatikan kalau pemain jauh dari dataran
  const wildChunk = chunks.add({
    id: 'hutan-desa', name: 'Hutan + Desa', circles: wildCircles, group: wildG, colliders, dyn: wildDyn, adopt: true,   // sudah dibangun di atas
    update(dt, t, pp) {
      village.update(t); forest.update(t);
      const plainNear = Math.hypot(pp.x, pp.z) < LIMIT + 150; for (const o of plainDeco) o.visible = plainNear;   // rumput tertinggi ±1 m; di atas jarak ini sudah tertutup kabut
      pitLight.intensity = 24 + Math.sin(t * 3.1) * 4 + Math.sin(t * 7.3) * 2;   // cahaya & partikel lubang dungeon
      beamMat.opacity = 0.5 + Math.sin(t * 1.7) * 0.08;
      for (let i = 0; i < NP; i++) { pPos[i * 3 + 1] += pSpd[i] * dt; pPos[i * 3] += Math.sin(t + i) * 0.2 * dt; if (pPos[i * 3 + 1] > 9) resetP(i); }
      pGeo.attributes.position.needsUpdate = true;
    },
  });

  const cityChunk = chunks.add({
    id: 'kota', name: 'Kota Arunika', group: cityG, dyn: cityDyn, loadR: 240,   // mulai dibangun di latar saat pemain < 240 m dari tepi kota (di jalan hutan, jauh sebelum gerbang)
    circles: CITY_ZONES.map(c => ({ ...c, r: c.r + 8 })),                        // termasuk lingkaran interior katedral & istana (di titik jauh di luar peta)
    *build(c) {   // tiap yield = lanjut di frame berikutnya (jatah waktu per frame diatur ChunkManager)
      const gen = buildCityGen({ colliders: c.colliders, COARSE }); let r;
      while (!(r = gen.next()).done) yield;
      cityG.add(r.value.group); yield;
      churchRef.v = buildChurch({ colliders: c.colliders }); cityG.add(churchRef.v.group); yield;   // interior katedral (tersembunyi sampai pemain masuk lewat pintu)
      { const g = buildPalaceGen(); let r; while (!(r = g.next()).done) yield; palaceRef.v = r.value; }   // interior istana (2 lantai; tersembunyi sampai pemain masuk), dibangun per ruangan
      cityG.add(palaceRef.v.group);
      for (const [cc, lvl] of palaceQueue) palaceRef.v.addCircle(cc, lvl); palaceQueue.length = 0;
      fixDecals(cityG); yield;
    },
    onReady() { if (prewarm) prewarm(cityG); },
  });
  // ---------- Padang Rumput Arunika: beberapa chunk berurutan di timur kota (jumlahnya mengikuti MEADOW_SEG_X) ----------
  // Tiap bagian punya grup, collider & jatah bangun sendiri. Mulai dibangun saat pemain < 240 m dari tepinya (bagian pertama sudah mulai dari dalam hutan,
  // bersamaan dengan kota), jadi saat pemain keluar dari Gerbang Timur padang sudah siap.
  const meadowChunks = Array.from({ length: MEADOW_SEG_X.length - 1 }, (_, i) => {
    const g = new THREE.Group(); g.name = 'chunk-padang-' + (i + 1); let flow = null;
    const hasDusun = DUSUN.x >= MEADOW_SEG_X[i] && DUSUN.x < MEADOW_SEG_X[i + 1];   // bagian padang yang memuat Dusun Ilalang: warganya (NPC) ikut di chunk ini
    if (hasDusun) g.add(npcs.meadowGroup);   // flow(t): animasi aliran Sungai Bening (hanya ada di bagian yang memuat sungai)
    const circles = [...MEADOW_CIRCLES, ...RUINS_CIRCLES].filter(c => c.x + c.r > MEADOW_SEG_X[i] - 30 && c.x - c.r < MEADOW_SEG_X[i + 1] + 30).map(c => ({ ...c, r: c.r + 8 }));   // + area rahasia Reruntuhan Kuno (supaya tabrakannya aktif di sana)
    return chunks.add({
      id: 'padang-' + (i + 1), name: 'Padang Rumput ' + (i + 1), group: g, loadR: 240, circles, dyn: hasDusun ? dusunDyn : [],
      update(dt, t) { if (flow) flow(t); },   // dipanggil ChunkManager hanya saat bagian ini tampil
      *build(c) {
        const gen = buildMeadowGen({
          seg: i, colliders: c.colliders, rand: mulberry32(20261101 + i * 977), COARSE, jitter, prep, ribbon,
          geo: { trunkOak, trunkPine, oakLeaf, pineLeaf, grassGeo },
          mat: { barkMat, leafMat, swayMat },
          tex: { radialAlpha, edgeAlpha, dirt: dTex },
        });
        let r; while (!(r = gen.next()).done) yield;
        flow = r.value.update; g.add(r.value.group); fixDecals(g); yield;
      },
      onReady() { if (prewarm) prewarm(g); },
    });
  });
  // ---------- Ladang Sawah Gemah Ripah: beberapa chunk berurutan di ujung timur padang (jumlahnya mengikuti SAWAH_SEG_X) ----------
  const sawahChunks = Array.from({ length: SAWAH_SEG_X.length - 1 }, (_, i) => {
    const g = new THREE.Group(); g.name = 'chunk-sawah-' + (i + 1); let flow = null;
    g.add(npcs.sawahGroups[i]);   // warga ladang di bagian ini
    const circles = SAWAH_CIRCLES.filter(c => c.x + c.r > SAWAH_SEG_X[i] - 30 && c.x - c.r < SAWAH_SEG_X[i + 1] + 30).map(c => ({ ...c, r: c.r + 8 }));
    return chunks.add({
      id: 'sawah-' + (i + 1), name: 'Ladang Sawah ' + (i + 1), group: g, loadR: 240, circles, dyn: sawahDyn[i],
      update(dt, t) { if (flow) flow(t); },   // air saluran mengalir & kincir berputar (hanya saat bagian ini tampil)
      *build(c) {
        const gen = buildSawahGen({
          seg: i, colliders: c.colliders, rand: mulberry32(20261102 + i * 1301), COARSE, jitter, prep, ribbon,
          geo: { trunkOak, trunkPine, oakLeaf, pineLeaf, grassGeo },
          mat: { barkMat, leafMat, swayMat },
          tex: { radialAlpha, edgeAlpha, dirt: dTex },
        });
        let r; while (!(r = gen.next()).done) yield;
        flow = r.value.update; g.add(r.value.group); fixDecals(g); yield;
      },
      onReady() { if (prewarm) prewarm(g); },
    });
  });
  const kekPlayer = { x: 0, z: 0, cam: null };   // posisi pemain (dunia) untuk NPC Kota Kekaisaran: yang jauh disembunyikan; diisi tiap frame di update(); cam = kamera (NPC di luar layar tidak digambar)
  // ---------- Kota Kekaisaran: satu chunk di ujung ladang (tembok segi lima, 5 gerbang, Distrik 1; lihat kekaisaran.js) ----------
  const kekChunk = (() => {
    const g = new THREE.Group(); g.name = 'chunk-kekaisaran'; let upd = null;
    return chunks.add({
      id: 'kekaisaran', name: 'Kota Kekaisaran', group: g, loadR: 240, circles: KEKAISARAN_CITY_CIRCLES.map(c => ({ ...c, r: c.r + 8 })), dyn: [],   // belum ada NPC
      update(dt, t) { if (upd) upd(t); },
      *build(c) {
        const gen = buildKekaisaranGen({ player: kekPlayer, colliders: c.colliders, rand: mulberry32(20261103), COARSE, geo: { trunkOak, trunkPine, oakLeaf, pineLeaf, grassGeo }, mat: { barkMat, leafMat, swayMat } });
        let r; while (!(r = gen.next()).done) yield;
        upd = r.value.update; aulaRef.v = r.value.aula; innRef.v = r.value.inn; kekRef.v = r.value; g.add(r.value.group); fixDecals(g); yield;
      },
      onReady() { if (prewarm) prewarm(g); },
    });
  })();
  // ---------- Padang Rumput Barat Laut: chunk terpisah di luar Gerbang Barat Laut Kota Kekaisaran (400 m; 3 desa + hutan; lihat kekaisaran-dataran.js) ----------
  // Dibangun hanya saat pemain mendekat (< 240 m dari tepinya), tidak ikut membebani chunk kota maupun pemuatan awal.
  let dataranPP = null;   // posisi pemain terakhir, diisi tiap frame oleh update() dunia
  const dataranChunk = (() => {
    const g = new THREE.Group(); g.name = 'chunk-dataran-bl'; let upd = null;
    return chunks.add({
      id: 'dataran-bl', name: 'Padang Rumput Barat Laut', group: g, loadR: 240, circles: NW_PLAIN_CIRCLES.map(c => ({ ...c, r: c.r + 8 })), dyn: [],
      update(dt) { if (upd && dataranPP) upd(dt, dataranPP); },   // warga dusun: animasi & menoleh ke pemain (hanya saat chunk tampil)
      *build(c) {
        const gen = buildDataranBLGen({ colliders: c.colliders, COARSE, geo: { trunkOak, trunkPine, oakLeaf, pineLeaf, grassGeo }, mat: { barkMat, leafMat, swayMat }, tex: { radialAlpha } });
        let r; while (!(r = gen.next()).done) yield;
        upd = r.value.update; g.add(r.value.group); fixDecals(g); yield;
      },
      onReady() { if (prewarm) prewarm(g); },
    });
  })();
  // ---------- Padang Rumput Timur Laut: chunk terpisah di luar Gerbang Timur Laut Kota Kekaisaran (500 m; lihat kekaisaran-dataran-tl.js) ----------
  // Sama seperti padang barat laut: dibangun hanya saat pemain mendekat (< 240 m dari tepinya).
  let dataranTLPP = null;   // posisi pemain terakhir, diisi tiap frame oleh update() dunia
  const dataranTLChunk = (() => {
    const g = new THREE.Group(); g.name = 'chunk-dataran-tl'; let upd = null;
    return chunks.add({
      id: 'dataran-tl', name: 'Padang Rumput Timur Laut', group: g, loadR: 240, circles: NE_PLAIN_CIRCLES.concat(NE_MTN_CIRCLES).map(c => ({ ...c, r: c.r + 8 })), dyn: [],   // padang + Gunung Pendakian dalam satu chunk
      update(dt) { if (upd && dataranTLPP) upd(dt, dataranTLPP); },
      *build(c) {
        const gen = buildDataranTLGen({ colliders: c.colliders, COARSE, rand: mulberry32(20261109), geo: { trunkOak, trunkPine, oakLeaf, pineLeaf, grassGeo }, mat: { barkMat, leafMat, swayMat } });
        let r; while (!(r = gen.next()).done) yield;
        upd = r.value.update; g.add(r.value.group); fixDecals(g); yield;
      },
      onReady() { if (prewarm) prewarm(g); },
    });
  })();
  // ---------- Kota Dungeon: chunk terpisah di ujung Padang Rumput Barat Laut (kota kecil + Gerbang Dungeon berportal; lihat kota-dungeon.js) ----------
  // Dibangun hanya saat pemain mendekat (< 240 m dari tepinya), jadi tidak membebani pemuatan awal maupun chunk padang.
  const kotaDungeonChunk = (() => {
    const g = new THREE.Group(); g.name = 'chunk-kota-dungeon'; let upd = null;
    return chunks.add({
      id: 'kota-dungeon', name: 'Kota Dungeon', group: g, loadR: 240, circles: NW_TOWN_CIRCLES.map(c => ({ ...c, r: c.r + 8 })), dyn: [],
      update() { if (upd) upd(); },   // portal berdenyut & kristal berputar (hanya saat chunk tampil)
      *build(c) {
        const gen = buildKotaDungeonGen({ colliders: c.colliders, COARSE, geo: { trunkOak, trunkPine, oakLeaf, pineLeaf, grassGeo }, mat: { barkMat, leafMat, swayMat }, tex: { radialAlpha } });
        let r; while (!(r = gen.next()).done) yield;
        upd = r.value.update; g.add(r.value.group); fixDecals(g); yield;
      },
      onReady() { if (prewarm) prewarm(g); },
    });
  })();
  chunks.refresh(SPAWN.x, SPAWN.z);

  // ---------- API ----------
  return {
    group,
    village: VILLAGE,
    chunks,                                          // ChunkManager (info() untuk debug)
    chunkInfo: () => chunks.info(),
    ensure: id => chunks.ensure(id),                 // paksa bangun chunk sekarang juga (hanya untuk keadaan darurat, mis. teleport)
    refresh: pos => chunks.refresh(pos.x, pos.z),    // nilai ulang chunk mana yang tampil seketika (dipanggil setelah pemain dipindahkan jauh)
    setPrewarm: fn => { prewarm = fn; if (cityChunk.state === 'ready') fn(cityG); },
    collide(pos, r) { chunks.collide(pos, r); },     // dorong pemain/musuh keluar dari pohon / batu / bangunan (grid, hanya chunk di dekatnya)
    clamp: pos => clampToWorld(pos, LIMIT),          // batas dunia: dataran lama + desa + Hutan Besar
    forestAmount,                                    // 0..1 seberapa dalam pemain di hutan (dipakai kabut di game.js)
    forest: FOREST,
    church,                                          // church.show(true/false): tampilkan interior katedral
    kekGroundY: (x, z) => kekRef.v ? kekRef.v.groundY(x, z) : 0,   // tinggi pijakan di luar (tangga agung Istana Kekaisaran); 0 di tempat lain
    inn,                                             // inn.show(true/false): interior Penginapan Karavan (Distrik 2); inn.collide / clipCam / nearDoor / nearExit / nearSave dipakai game.js
    aula,                                            // aula.show(true/false): interior Istana Kekaisaran (Aula Raja); aula.ready / collide / groundY / clipCam / area dipakai game.js saat pemain di dalam
    palace,                                          // palace.show(true/false): interior istana; palace.collide / groundY / clipCam / area dipakai game.js saat pemain di dalam
    talk: () => npcs.talk() || citizenTalk(), canTalk: () => npcs.canTalk() || citizenCanTalk(), talkName: () => npcs.canTalk() ? npcs.talkName() : citizenCanTalk() ? citizenTalkName() : npcs.talkName(),   // + warga Kota Kekaisaran (kekaisaran-npc.js)
    update(dt, t, pp, cp, cam) {
      uTime.value = t; kekPlayer.x = pp.x; kekPlayer.z = pp.z; kekPlayer.cam = cam;
      if (cityChunk.state !== 'ready' && cityChunk.dist < 60) chunks.ensure('kota');   // pengaman: pemain sudah di depan kota tetapi belum siap
      for (const mc of meadowChunks) if (mc.state !== 'ready' && mc.dist < 40) chunks.ensure(mc.id);   // sama untuk tiap bagian Padang Rumput
      for (const sc of sawahChunks) if (sc.state !== 'ready' && sc.dist < 40) chunks.ensure(sc.id);     // dan tiap bagian Ladang Sawah
      if (kekChunk.state !== 'ready' && kekChunk.dist < 40) chunks.ensure('kekaisaran');                 // dan Kota Kekaisaran
      if (dataranChunk.state !== 'ready' && dataranChunk.dist < 40) chunks.ensure('dataran-bl');         // dan Padang Rumput Barat Laut
      if (kotaDungeonChunk.state !== 'ready' && kotaDungeonChunk.dist < 40) chunks.ensure('kota-dungeon');   // dan Kota Dungeon
      if (dataranTLChunk.state !== 'ready' && dataranTLChunk.dist < 40) chunks.ensure('dataran-tl');     // dan Padang Rumput Timur Laut
      dataranPP = pp; dataranTLPP = pp;
      chunks.update(dt, t, pp, cp);                  // membangun / menampilkan / menyembunyikan chunk; chunk yang tampil meng-update isinya sendiri
      npcs.update(dt, t, pp, cam);                      // NPC sudah menyembunyikan diri bila jauh (>70 m)
      const fa = forestAmount(pp.x, pp.z); // di dalam hutan: cahaya sedikit lebih redup (teduh di bawah tajuk)
      indoorK += (indoor - indoorK) * Math.min(1, dt * 6);   // di dalam aula: matahari hampir padam & cahaya langit dikurangi (diterangi lampu gantung)
      hemi.color.copy(hemiSky0).lerp(hemiSkyIn, indoorK); hemi.groundColor.copy(hemiGround0).lerp(hemiGroundIn, indoorK);
      hemi.intensity = (1.15 - 0.3 * fa) * (1 - (dimInn ? (innRef.v ? innRef.v.dim : 0.35) : (aulaRef.v ? aulaRef.v.dim : 0.3)) * indoorK); sun.intensity = (3.3 - 0.9 * fa) * (1 - 0.92 * indoorK);
      sun.position.set(pp.x + SUN_OFF.x, SUN_OFF.y, pp.z + SUN_OFF.z); sun.target.position.set(pp.x, 0, pp.z);
      sky.position.copy(cp); clouds.position.set(cp.x, 0, cp.z);
      for (const c of clouds.children) { c.position.x += dt * c.userData.sp; if (c.position.x > 260) c.position.x = -260; }
    }
  };
}
