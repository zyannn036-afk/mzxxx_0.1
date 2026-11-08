import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { NPCS } from './village-layout.js';
import { FOREST_NPC, SECRET_CENTAUR } from './forest-layout.js';
import { DUSUN_NPCS } from './meadow-village-layout.js';
import { SAWAH_NPCS, SAWAH_SEG_X, sawahSegOf } from './sawah-layout.js';
import { CITY, PALACE } from './city-layout.js';
import { CITY_NPCS, CITY_NPC_FILES } from './city-npc-layout.js';
import { loadCityHumans } from './city-npcs.js';
import { PALACE_NPCS } from './palace-npc-layout.js';
import { loadPalaceNpcs } from './palace-npcs.js';

// ============================================================
//  NPC warga desa — model "Stylized NPC - Peasant Nolant" (FBX) dengan animasi Idle & Walk.
//  Satu model dimuat sekali, lalu dikloning ke tiap NPC dengan tekstur warna berbeda.
// ============================================================
const MODEL = 'npc/peasant.fbx';
const TEX = { green: 'npc/peasant_green.jpg', blue: 'npc/peasant_blue.jpg', brown: 'npc/peasant_brown.jpg', yellow: 'npc/peasant_yellow.jpg' };
const CENTAUR_MODEL = 'npc/centaur.fbx';
const CENTAUR_LOOP = null;   // potong animasi centaur (detik), mis. { from: 0, to: 6 }. null = putar seluruh klip (43,6 dtk)
const CENTAUR_TEX = null;    // isi 'npc/centaur.jpg' (atau .png) kalau kamu punya file tekstur aslinya; null = pakai cat otomatis di bawah

// File centaur.fbx TIDAK membawa warna/tekstur apa pun (semua material cuma abu-abu bawaan Blender, tanpa vertex color),
// jadi dicat otomatis per-vertex dari bobot tulangnya: badan manusia = kulit, badan kuda = bulu cokelat, rambut/ekor = gelap.
const PAINT = { skin: 0xd9a27a, coat: 0x7a4a2b, hair: 0x2e1d12, leather: 0x5b3d24, eye: 0xe8d9a0 };
function boneKind(name) {
  const n = name.toLowerCase();
  if (/hair|tail/.test(n)) return 'hair';
  if (/eye/.test(n)) return 'eye';
  if (/horse|leg|foot|hips\.ik/.test(n)) return 'coat';
  if (/human|chest|neck|head|jaw|shoulder|arm|fist|big|index|middle|ring|pinkie|spine/.test(n)) return 'skin';
  return 'coat';
}
function paintCentaur(root) {
  const col = {}; for (const k in PAINT) col[k] = new THREE.Color(PAINT[k]);
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, n = g.attributes.position.count, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, nm = o.name.toLowerCase();
    const fixed = /^bezier/.test(nm) ? 'hair' : /^cube/.test(nm) ? 'leather' : /^sphere/.test(nm) ? 'eye' : null; // bagian kecil: satu warna
    const kinds = o.skeleton ? o.skeleton.bones.map(b => boneKind(b.name)) : null, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let r = 0, gr = 0, b = 0, wt = 0;
      if (fixed || !si || !kinds) { const c = col[fixed || 'coat']; r = c.r; gr = c.g; b = c.b; wt = 1; }
      else for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (!w) continue; const c = col[kinds[si.getComponent(i, k)] || 'coat']; r += c.r * w; gr += c.g * w; b += c.b * w; wt += w; }
      if (!wt) { const c = col.coat; r = c.r; gr = c.g; b = c.b; wt = 1; }
      arr[i * 3] = r / wt; arr[i * 3 + 1] = gr / wt; arr[i * 3 + 2] = b / wt;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const m of [].concat(o.material)) { m.vertexColors = true; m.color.set(0xffffff); m.needsUpdate = true; }
  });
}
const HEIGHT = 1.75;          // tinggi NPC dewasa (meter dunia)
const FRONT_FLIP = Math.PI;   // model asli menghadap -Z; game memakai +Z sebagai depan. Ubah ke 0 kalau NPC terlihat membelakangi.
const TALK_R = 4.4, TAG_R = 16, WALK_SPEED = 1.15, TALK_TIMEOUT = 8; // detik tanpa ditekan -> gelembung menutup sendiri
const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));

function roundRect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
function makeSprite(w, h, sw, sh) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  spr.scale.set(sw, sh, 1); spr.center.set(0.5, 0); spr.renderOrder = 5;
  return { spr, c, ctx: c.getContext('2d'), tex };
}
function drawTag(t, name, role) {
  const { ctx: x, c } = t; x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(20,14,22,.72)'; roundRect(x, 6, 6, c.width - 12, c.height - 12, 26); x.fill();
  x.strokeStyle = '#6b5a3a'; x.lineWidth = 4; x.stroke();
  x.textAlign = 'center'; x.fillStyle = '#f3e3bd'; x.font = 'bold 46px Georgia'; x.fillText(name, c.width / 2, 58);
  x.fillStyle = '#c9b78a'; x.font = '30px Georgia'; x.fillText(role, c.width / 2, 98); t.tex.needsUpdate = true;
}
function drawBubble(t, name, text) {
  const { ctx: x, c } = t; x.clearRect(0, 0, c.width, c.height);
  x.font = '30px Georgia'; const maxW = c.width - 70, words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const test = cur ? cur + ' ' + w : w; if (x.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  lines.push(cur);
  const bh = 78 + lines.length * 38, oy = c.height - bh - 36; // gelembung menempel di dasar kanvas, tepat di atas kepala NPC
  x.fillStyle = 'rgba(250,244,226,.96)'; roundRect(x, 8, oy, c.width - 16, bh, 24); x.fill(); x.strokeStyle = '#6b5a3a'; x.lineWidth = 5; x.stroke();
  x.beginPath(); x.moveTo(c.width / 2 - 16, oy + bh - 2); x.lineTo(c.width / 2, oy + bh + 26); x.lineTo(c.width / 2 + 16, oy + bh - 2); x.closePath(); x.fillStyle = 'rgba(250,244,226,.96)'; x.fill();
  x.textAlign = 'left'; x.fillStyle = '#8a3b2c'; x.font = 'bold 30px Georgia'; x.fillText(name, 36, oy + 46);
  x.fillStyle = '#3a2a18'; x.font = '30px Georgia'; lines.forEach((l, i) => x.fillText(l, 36, oy + 88 + i * 38)); t.tex.needsUpdate = true;
}

// colliders      = daftar collider BERGERAK milik chunk hutan+desa (warga desa, penjaga hutan, centaur)
// cityColliders  = daftar collider bergerak milik chunk kota (warga kota)
// cityReady()    = true kalau chunk kota sudah selesai dibangun (model warga kota & istana baru mulai dimuat sesudahnya)
// meadowColliders = daftar collider bergerak milik chunk padang yang memuat Dusun Ilalang (warga dusun)
// group dipasang di chunk hutan+desa; cityGroup (warga kota, Ratu & Putri) dipasang di chunk kota; meadowGroup (warga Dusun Ilalang) di chunk padang
export function createNPCs({ colliders, cityColliders = colliders, meadowColliders = colliders, sawahColliders = [], rand, palace = null, cityReady = () => true, prewarm = null }) {
  const group = new THREE.Group(); group.name = 'npc';
  const cityGroup = new THREE.Group(); cityGroup.name = 'npc-kota';
  const meadowGroup = new THREE.Group(); meadowGroup.name = 'npc-dusun';
  const sawahGroups = SAWAH_SEG_X.slice(1).map((_, i) => { const g = new THREE.Group(); g.name = 'npc-sawah-' + (i + 1); return g; });   // satu grup per bagian chunk Ladang Sawah (warga ikut tampil / sembunyi bersama chunk-nya)
  const npcs = [];
  let target = null; // NPC yang bisa diajak bicara sekarang
  const closeTalk = n => { n.talking = false; n.talkT = 0; n.bub.spr.visible = false; };

  const mgr = new THREE.LoadingManager();
  mgr.setURLModifier(u => /\.(png|tga|jpe?g|bmp)$/i.test(decodeURIComponent(u)) ? TEX.green : u); // FBX menyimpan path tekstur Windows; arahkan ke file kita
  new FBXLoader(mgr).load(MODEL, fbx => {
    fbx.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fbx, true), size = box.getSize(new THREE.Vector3());
    const s = HEIGHT / size.y, offY = -box.min.y * s, ctr = box.getCenter(new THREE.Vector3());
    fbx.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      for (const m of [].concat(o.material)) { m.transparent = false; m.opacity = 1; m.alphaTest = 0; if (m.color) m.color.set(0xffffff); if (m.specular) m.specular.set(0x161616); if ('shininess' in m) m.shininess = 6; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; }
    });
    const clips = fbx.animations, pick = k => clips.find(c => c.name.toLowerCase().includes(k)) || clips[0];
    const idleClip = pick('idle'), walkClip = clips.find(c => c.name.toLowerCase().includes('walk')) || idleClip;

    const texCache = {};
    const tex = k => texCache[k] || (texCache[k] = (() => { const t = new THREE.TextureLoader().load(TEX[k]); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; })());

    for (const def of [...NPCS, FOREST_NPC, ...DUSUN_NPCS, ...SAWAH_NPCS]) { // warga desa + penjaga hutan + warga Dusun Ilalang + warga Ladang Sawah
      const inDusun = DUSUN_NPCS.includes(def), sIdx = SAWAH_NPCS.includes(def) ? sawahSegOf(def.x) : -1;
      const root = new THREE.Group(), holder = new THREE.Group(), model = cloneSkinned(fbx);
      holder.scale.setScalar(def.scale || 1); holder.rotation.y = FRONT_FLIP;
      model.scale.multiplyScalar(s); model.position.set(-ctr.x * s, offY, -ctr.z * s);
      model.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); for (const m of [].concat(o.material)) m.map = tex(def.tex); } });
      holder.add(model); root.add(holder);
      root.position.set(def.x, 0, def.z);

      const headY = HEIGHT * (def.scale || 1);
      const tag = makeSprite(512, 128, 2.2, 0.55); drawTag(tag, def.name, def.role); tag.spr.position.y = headY + 0.2; tag.spr.visible = false; root.add(tag.spr);
      const bub = makeSprite(640, 300, 3.4, 3.4 * 300 / 640); bub.spr.position.y = headY + 0.3; bub.spr.visible = false; root.add(bub.spr);

      const mixer = new THREE.AnimationMixer(model), idle = mixer.clipAction(idleClip), walk = mixer.clipAction(walkClip);
      idle.play(); idle.time = rand() * idleClip.duration; idle.timeScale = 0.9 + rand() * 0.2; walk.timeScale = 1.0; walk.play(); walk.weight = 0; walk.enabled = true;
      const col = { x: def.x, z: def.z, r: 0.45 * (def.scale || 1) + 0.05 }; (inDusun ? meadowColliders : sIdx >= 0 ? sawahColliders[sIdx] : colliders).push(col);
      const yaw0 = Math.atan2(def.look.x - def.x, def.look.z - def.z);
      const meshes = []; model.traverse(o => { if (o.isMesh) meshes.push(o); });
      const n = { def, root, mixer, idle, walk, meshes, w: 0, tag, bub, col, yaw: yaw0, yaw0, pos: { x: def.x, z: def.z }, pi: 0, dir: 1, wait: 1 + rand() * 3, walking: false, line: 0, lineT: 0, near: false, talking: false, talkT: 0 };
      root.rotation.y = yaw0; (inDusun ? meadowGroup : sIdx >= 0 ? sawahGroups[sIdx] : group).add(root); npcs.push(n);
    }
  }, undefined, err => console.warn('Model NPC (npc/peasant.fbx) gagal dimuat', err));

  // ---- Centaur (secret quest): model lain, berdiri diam di tengah tempat rahasia, hanya animasi bawaan modelnya ----
  new FBXLoader().load(CENTAUR_MODEL, fbx => {
    const def = SECRET_CENTAUR, key = o => o.name.toLowerCase().replace(/[\s_.]/g, '');
    fbx.updateMatrixWorld(true);
    let head = null, hips = null; fbx.traverse(o => { if (key(o) === 'head') head = o; else if (key(o) === 'horsehips') hips = o; });
    let flip = Math.PI; // arah depan model dicari otomatis: dari pinggul kuda ke kepala (pose awal), lalu diputar agar menghadap +Z
    if (head && hips) { const a = head.getWorldPosition(new THREE.Vector3()), b = hips.getWorldPosition(new THREE.Vector3()); flip = -Math.atan2(a.x - b.x, a.z - b.z); }
    const box = new THREE.Box3().setFromObject(fbx, true), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const s = def.height / size.y, offY = -box.min.y * s;
    fbx.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      for (const m of [].concat(o.material)) { m.transparent = false; m.opacity = 1; m.alphaTest = 0; if (m.specular) m.specular.set(0x161616); if ('shininess' in m) m.shininess = 8; }
    });
    if (CENTAUR_TEX) { // tekstur asli (kalau ada) menggantikan cat otomatis; UV sudah ada di model
      new THREE.TextureLoader().load(CENTAUR_TEX, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        fbx.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { m.map = t; m.vertexColors = false; m.needsUpdate = true; } }); },
        undefined, e => console.warn('Tekstur centaur gagal dimuat', CENTAUR_TEX, e));
    }
    paintCentaur(fbx);
    const root = new THREE.Group(), holder = new THREE.Group();
    holder.rotation.y = flip; fbx.scale.multiplyScalar(s); fbx.position.set(-ctr.x * s, offY, -ctr.z * s);
    holder.add(fbx); root.add(holder); root.position.set(def.x, 0, def.z);
    const tag = makeSprite(512, 128, 2.2, 0.55); drawTag(tag, def.name, def.role); tag.spr.position.y = def.height + 0.2; tag.spr.visible = false; root.add(tag.spr);
    const bub = makeSprite(640, 300, 3.4, 3.4 * 300 / 640); bub.spr.position.y = def.height + 0.3; bub.spr.visible = false; root.add(bub.spr);
    let clip = fbx.animations[0];
    if (clip && CENTAUR_LOOP) clip = THREE.AnimationUtils.subclip(clip, 'loop', Math.round(CENTAUR_LOOP.from * 25), Math.round(CENTAUR_LOOP.to * 25), 25);
    const mixer = new THREE.AnimationMixer(fbx), idle = clip ? mixer.clipAction(clip) : { weight: 1, play() {} }, walk = { weight: 0 };
    idle.play();
    console.info(`Centaur dimuat: tinggi asli ${size.y.toFixed(2)}, klip "${clip ? clip.name : '-'}" ${clip ? clip.duration.toFixed(1) : 0} dtk, putar-depan ${flip.toFixed(2)} rad`);
    const col = { x: def.x, z: def.z, r: 1.15 }; colliders.push(col);
    const yaw0 = Math.atan2(def.look.x - def.x, def.look.z - def.z);
    npcs.push({ def, root, mixer, idle, walk, w: 0, tag, bub, col, yaw: yaw0, yaw0, pos: { x: def.x, z: def.z }, pi: 0, dir: 1, wait: 1, walking: false, line: 0, lineT: 0, near: false, talking: false, talkT: 0 });
    root.rotation.y = yaw0; group.add(root);
  }, undefined, err => console.warn('Model centaur (npc/centaur.fbx) gagal dimuat', err));

  // ---- Warga Kota Arunika: karakter manusia dari npc/Humans_Master.fbx & npc/All_together.fbx (data: city-npc-layout.js) ----
  // Dimuat malas: baru mulai saat pemain sudah dekat ke kota (file besar), supaya awal permainan tetap ringan.
  let cityLoading = false, cityStartT = 0;
  const startCity = () => {
    cityLoading = true;
    loadCityHumans(CITY_NPC_FILES, CITY_NPCS, (def, b) => {
      const root = new THREE.Group(); root.add(b.holder); root.position.set(def.x, 0, def.z);
      const tag = makeSprite(512, 128, 2.2, 0.55); drawTag(tag, def.name, def.role); tag.spr.position.y = b.headY + 0.2; tag.spr.visible = false; root.add(tag.spr);
      const bub = makeSprite(640, 300, 3.4, 3.4 * 300 / 640); bub.spr.position.y = b.headY + 0.3; bub.spr.visible = false; root.add(bub.spr);
      b.idle.play(); b.idle.time = rand() * b.idle.getClip().duration; b.idle.timeScale = 0.9 + rand() * 0.2; b.walk.timeScale = 1.0; b.walk.play(); b.walk.weight = 0; b.walk.enabled = true;
      const col = { x: def.x, z: def.z, r: 0.5 }; cityColliders.push(col);
      const yaw0 = Math.atan2(def.look.x - def.x, def.look.z - def.z);
      npcs.push({ def, root, mixer: b.mixer, idle: b.idle, walk: b.walk, meshes: b.meshes, greet: b.greet, greetDur: b.greetDur, gw: 0, greetT: 0, w: 0, tag, bub, col, yaw: yaw0, yaw0, pos: { x: def.x, z: def.z }, pi: 0, dir: 1, wait: 1 + rand() * 3, walking: false, line: 0, lineT: 0, near: false, talking: false, talkT: 0 });
      root.rotation.y = yaw0; root.visible = false; cityGroup.add(root);
      if (prewarm) prewarm(root);   // kompilasi shader kulit/bayangan SEKARANG (saat NPC masih tersembunyi), bukan saat pertama kali terlihat
    });
  };

  // ---- Penghuni Istana Arunika (Ratu & Putri): model VRM (data: palace-npc-layout.js) ----
  // Dimuat malas (±40 MB): baru mulai ketika pemain sudah dekat ke gerbang istana, jadi sudah siap saat pemain masuk.
  let palaceLoading = false;
  const startPalace = () => {
    palaceLoading = true;
    loadPalaceNpcs(PALACE_NPCS, (def, b) => {
      const root = new THREE.Group(); root.add(b.holder); root.position.set(def.x, def.y || 0, def.z);
      const tag = makeSprite(512, 128, 2.2, 0.55); drawTag(tag, def.name, def.role); tag.spr.position.y = b.headY + 0.2; tag.spr.visible = false; root.add(tag.spr);
      const bub = makeSprite(640, 300, 3.4, 3.4 * 300 / 640); bub.spr.position.y = b.headY + 0.3; bub.spr.visible = false; root.add(bub.spr);
      const col = { x: def.x, z: def.z, r: 0.42 };
      if (palace) palace.addCircle(col, def.y > 3 ? 2 : 1);   // tabrakan khusus lantai istana (bukan daftar dunia, supaya hanya berlaku di lantainya)
      const yaw0 = Math.atan2(def.look.x - def.x, def.look.z - def.z);
      npcs.push({ def, root, mixer: b.mixer, idle: { weight: 1 }, walk: { weight: 0 }, onTalk: b.onTalk, w: 0, tag, bub, col, yaw: yaw0, yaw0, pos: { x: def.x, z: def.z }, pi: 0, dir: 1, wait: 1, walking: false, line: 0, lineT: 0, near: false, talking: false, talkT: 0 });
      root.rotation.y = yaw0; root.visible = false; cityGroup.add(root);
    });
  };

  // ---- LOD NPC (OPTIMASI) ----
  // Mesh berkulit di sini frustumCulled = false (supaya animasi tidak terpotong), artinya SELALU digambar — termasuk di luar layar
  // dan di pass bayangan, padahal kamera bayangan hanya ±34 m dari pemain. Jadi dikendalikan manual:
  //   - di luar kerucut pandang kamera  -> disembunyikan & animasinya dilewati (radius cadangan 4.5 m supaya bayangannya tak hilang mendadak)
  //   - lebih jauh dari 36 m            -> tidak ikut menggambar bayangan
  //   - animasi diperbarui lebih jarang makin jauh (tiap frame / 2 frame / 4 frame), dt-nya diakumulasi supaya gerak tetap mulus
  let frameNo = 0;
  const frustum = new THREE.Frustum(), camMat = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 4.5);
  const SHADOW_R = 36;

  return {
    group, cityGroup, meadowGroup, sawahGroups,
    update(dt, t, pp, cam = null) {
      frameNo++;
      if (cam) { camMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(camMat); }
      // model besar (FBX warga kota ±24 MB, VRM istana ±40 MB) dimuat bertahap & berurutan, baru SESUDAH chunk kota selesai dibangun:
      // memuat + mem-parse dua file besar dalam waktu bersamaan = lonjakan frame
      if (!cityLoading && CITY.open && cityReady() && Math.hypot(pp.x - CITY.x, pp.z - CITY.z) < CITY.radius + 130) { startCity(); cityStartT = t; }
      if (!palaceLoading && CITY.open && cityLoading && t - cityStartT > 5 && (Math.hypot(pp.x - PALACE.door.x, pp.z - PALACE.door.z) < 70 || Math.hypot(pp.x - PALACE.x, pp.z - PALACE.z) < 60)) startPalace();
      let best = null; // NPC terdekat dalam jangkauan bicara
      for (let ni = 0; ni < npcs.length; ni++) {
        const n = npcs[ni]; n.idx = ni;
        const d = n.def, dx = pp.x - n.pos.x, dz = pp.z - n.pos.z, dist = Math.hypot(dx, dz);
        if (dist > 70) { n.root.visible = false; if (n.talking) closeTalk(n); continue; }
        const seen = !cam || (sph.center.set(n.pos.x, (d.y || 0) + 1, n.pos.z), frustum.intersectsSphere(sph));
        n.root.visible = seen || n.talking;
        const sameFloor = Math.abs(pp.y - (d.y || 0)) < 2.5;   // di istana: NPC lantai 2 tidak bisa diajak bicara dari lantai 1 (jarak mendatar saja menipu)
        const near = sameFloor && dist < (d.talkR || TALK_R);
        let want = n.yaw0, move = false;
        if (near) want = Math.atan2(dx, dz); // menoleh ke pemain
        else if (d.patrol) {
          if (n.wait > 0) n.wait -= dt;
          else {
            const tp = d.patrol[n.pi], tx = tp.x - n.pos.x, tz = tp.z - n.pos.z, l = Math.hypot(tx, tz);
            if (l < 0.25) { // sampai titik: berhenti sebentar lalu lanjut (bolak-balik)
              if (n.pi + n.dir < 0 || n.pi + n.dir >= d.patrol.length) n.dir *= -1; n.pi += n.dir; n.wait = 1.5 + rand() * 3;
            } else { move = true; want = Math.atan2(tx, tz); n.pos.x += tx / l * WALK_SPEED * dt; n.pos.z += tz / l * WALK_SPEED * dt; }
          }
          if (!move && !near && n.wait > 0) want = n.yaw;
        }
        n.yaw += wrapAng(want - n.yaw) * (1 - Math.exp(-dt * (move ? 7 : 5)));
        n.root.position.set(n.pos.x, d.y || 0, n.pos.z); n.root.rotation.y = n.yaw; n.col.x = n.pos.x; n.col.z = n.pos.z;
        // animasi: idle <-> walk (cross-fade halus)
        n.w += ((move ? 1 : 0) - n.w) * (1 - Math.exp(-dt * 8));
        let gw = 0; // lambaian saat diajak bicara (hanya warga kota): bobotnya naik-turun halus, sisanya dibagi idle/walk
        if (n.greet) { n.greetT -= dt; n.gw += ((n.greetT > 0.35 ? 1 : 0) - n.gw) * (1 - Math.exp(-dt * 9)); gw = n.gw; n.greet.weight = gw; }
        n.walk.weight = n.w * (1 - gw); n.idle.weight = (1 - n.w) * (1 - gw);
        // bayangan hanya untuk NPC yang dekat; animasi: dilewati kalau tak terlihat, dijarangkan kalau jauh
        const wantShadow = dist < SHADOW_R;
        if (n.meshes && n.shadowOn !== wantShadow) { n.shadowOn = wantShadow; for (const m of n.meshes) m.castShadow = wantShadow; }
        n.acc = (n.acc || 0) + dt;
        if (n.root.visible) {
          const step = dist < 22 ? 1 : dist < 45 ? 2 : 4;
          if (step === 1 || ((frameNo + (n.idx || 0)) % step) === 0 || n.talking) { n.mixer.update(Math.min(n.acc, 0.25)); n.acc = 0; }
        } else if (n.acc > 1) n.acc = 1;   // tak terlihat: animasi berhenti dulu, jangan menumpuk waktu
        // label nama (tetap muncul saat dekat) & gelembung dialog (HANYA setelah tombol Mengobrol ditekan)
        n.near = near;
        if (n.talking) { // tutup obrolan bila pemain menjauh atau sudah lama tidak ditekan
          if (!near || (n.talkT += dt) > TALK_TIMEOUT) closeTalk(n);
        }
        n.bub.spr.visible = n.talking;
        n.tag.spr.visible = sameFloor && dist < (d.tagR || TAG_R) && !n.talking;
        if (near && (!best || dist < best.dist)) best = { n, dist };
      }
      target = best ? best.n : null;
      for (const n of npcs) if (n.talking && n !== target) closeTalk(n); // satu obrolan pada satu waktu
    },
    // dipanggil tombol "Mengobrol": buka dialog NPC terdekat, tekan lagi untuk kalimat berikutnya
    talk() {
      const n = target; if (!n) return false;
      if (!n.talking) { n.talking = true; n.line = 0; if (n.greet) { n.greet.reset().play(); n.greet.weight = 0; n.greetT = n.greetDur; } if (n.onTalk) n.onTalk(); }
      else n.line = (n.line + 1) % n.def.lines.length;
      n.talkT = 0; drawBubble(n.bub, n.def.name, n.def.lines[n.line]); return true;
    },
    canTalk: () => !!target,
    talkName: () => target ? target.def.name : '',
  };
}
