import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// ============================================================
//  Model warga Kota Arunika — paket karakter manusia (FBX): Humans_Master.fbx & All_together.fbx.
//  Satu file memuat BANYAK karakter (King, Witch, Soldier, ...) yang berbagi satu rangka (79 tulang) dan 24 animasi.
//  Tiap NPC = salinan rangka + hanya mesh karakter yang dipilih (Body/Legs/Feet/Head). File dimuat sekali, lalu dikloning.
//  Warna: material polos (tanpa tekstur). Dibaca langsung dari file.
// ============================================================
export const HUMAN_HEIGHT = 1.75;   // tinggi NPC dewasa (meter dunia), sama dengan warga desa
const key = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');                         // 'Wrist.R' / 'WristR' -> 'wristr'
const clipName = c => c.name.toLowerCase().split('|').pop().trim().replace(/[\s-]+/g, '_');  // 'CharacterArmature|Idle_Sword' -> 'idle_sword'
const charOf = name => { const p = name.split('_')[0].toLowerCase(); return p === 'formad' ? 'formal' : p; }; // di file ada salah ketik "Formad_Head"
const PROPS = new Set(['sword', 'pistol', 'backpack']);                                       // benda lepas (tidak ikut animasi) di dalam file

const loadFBX = url => new Promise((ok, fail) => new FBXLoader().load(url, ok, undefined, fail));

// Warna material di file ini ditulis Blender dalam ruang warna linear, sedangkan FBXLoader menganggapnya sRGB (jadi terlalu gelap).
// Baca ulang angka aslinya, lalu pakai sebagai linear. Juga: matikan kilap berlebihan & transparansi.
function fixMaterials(fbx) {
  const seen = new Set(), c = { r: 0, g: 0, b: 0 };
  fbx.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      if (seen.has(m)) continue; seen.add(m);
      if (m.color) { m.color.getRGB(c, THREE.SRGBColorSpace); m.color.setRGB(c.r, c.g, c.b, THREE.LinearSRGBColorSpace); }
      m.transparent = false; m.opacity = 1; m.alphaTest = 0;
      if (m.specular) m.specular.set(0x161616);
      if ('shininess' in m) m.shininess = 6;
    }
  });
}

// buang semua mesh karakter lain; benda lepas (pedang/pistol/ransel) dilepas dulu & dikembalikan sebagai { sword, pistol, backpack }
function keepOnly(model, ch) {
  const drop = [], props = {};
  model.traverse(o => {
    if (!o.isMesh) return;
    const k = key(o.name);
    if (PROPS.has(k)) props[k] = o;
    else if (charOf(o.name) !== ch) drop.push(o);
  });
  drop.forEach(o => o.removeFromParent());
  Object.values(props).forEach(o => o.removeFromParent());
  return props;
}
const boneMap = model => { const b = {}; model.traverse(o => { if (o.isBone) b[key(o.name)] = o; }); return b; };

// ukuran & arah depan model: diukur dari satu karakter acuan ('Casual', ada di kedua file)
function inspect(fbx) {
  const ref = cloneSkinned(fbx); keepOnly(ref, 'casual'); ref.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(ref, true).getSize(new THREE.Vector3());
  const s = size.y > 0 ? HUMAN_HEIGHT / size.y : 0.0094;
  let flip = 0; // putaran agar muka menghadap +Z (depan di game ini): arah dari pergelangan kaki ke ujung kaki, dibulatkan ke kelipatan 90 derajat
  const b = boneMap(ref), toe = b.ptl, ankle = b.footl;
  if (toe && ankle) {
    const a = toe.getWorldPosition(new THREE.Vector3()), c = ankle.getWorldPosition(new THREE.Vector3()), dx = a.x - c.x, dz = a.z - c.z;
    if (Math.hypot(dx, dz) > 1e-3) flip = Math.round(-Math.atan2(dx, dz) / (Math.PI / 2)) * (Math.PI / 2);
  }
  return { s, flip, height: size.y };
}

// satu NPC: { holder, mixer, idle, walk, greet, greetDur, headY }
function build(fbx, info, def) {
  const model = cloneSkinned(fbx), props = keepOnly(model, def.char.toLowerCase());
  model.scale.multiplyScalar(info.s); model.updateMatrixWorld(true);
  const headY = Math.max(1.4, new THREE.Box3().setFromObject(model, true).max.y); // tinggi kepala sebenarnya (penyihir bertopi lebih tinggi)

  // pedang / ransel: pasang ke tulang terdekat (tangan kanan / dada) tanpa menggeser posisinya, supaya ikut bergerak bersama animasi
  const bones = boneMap(model);
  const mount = (prop, names) => {
    if (!prop) return;
    model.add(prop); model.updateMatrixWorld(true);
    const p = prop.getWorldPosition(new THREE.Vector3()); let best = null, bd = Infinity;
    for (const n of names) { const b = bones[n]; if (!b) continue; const d = b.getWorldPosition(new THREE.Vector3()).distanceTo(p); if (d < bd) { bd = d; best = b; } }
    if (best) best.attach(prop);
  };
  if (def.weapon === 'sword') mount(props.sword, ['wristr', 'wristl']);
  if (def.pack) mount(props.backpack, ['chest', 'torso']);

  const clips = fbx.animations, find = (...names) => { for (const n of names) { const c = clips.find(c => clipName(c) === n); if (c) return c; } return null; };
  const idleClip = find(def.weapon === 'sword' ? 'idle_sword' : 'idle_neutral', 'idle_neutral', 'idle') || clips[0];
  const walkClip = find('walk') || idleClip, greetClip = def.greet === false ? null : find('wave');
  const mixer = new THREE.AnimationMixer(model), idle = mixer.clipAction(idleClip), walk = mixer.clipAction(walkClip);
  let greet = null;
  if (greetClip) { greet = mixer.clipAction(greetClip); greet.setLoop(THREE.LoopOnce, 1); greet.clampWhenFinished = true; greet.weight = 0; }

  const holder = new THREE.Group(); holder.rotation.y = info.flip; holder.add(model);
  return { holder, mixer, idle, walk, greet, greetDur: greetClip ? greetClip.duration : 0, headY };
}

// Muat file satu per satu (parsing FBX besar menahan layar sebentar, jadi diberi jeda antar file).
// onNpc(def, hasil build) dipanggil untuk tiap NPC begitu modelnya siap.
export function loadCityHumans(files, defs, onNpc) {
  const jobs = Object.keys(files).filter(k => defs.some(d => d.file === k));
  let i = 0;
  const next = () => {
    if (i >= jobs.length) return;
    const k = jobs[i++];
    loadFBX(files[k]).then(fbx => {
      fixMaterials(fbx);
      const info = inspect(fbx);
      console.info(`Warga kota: ${files[k]} dimuat — tinggi asli ${info.height.toFixed(1)}, skala ${info.s.toFixed(5)}, putar-depan ${info.flip.toFixed(2)} rad`);
      for (const d of defs) if (d.file === k) { try { onNpc(d, build(fbx, info, d)); } catch (e) { console.warn('NPC kota gagal dibuat:', d.name, e); } }
    }).catch(err => console.warn('Model warga kota gagal dimuat:', files[k], err)).finally(() => setTimeout(next, 1500));
  };
  next();
}
