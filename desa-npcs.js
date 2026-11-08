import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// ============================================================
//  Model warga DESA (npc/peasant.fbx) untuk dipakai di luar desa (mis. distrik Kota Kekaisaran).
//  Pengaturan model sama persis dengan npcs.js (tinggi 1,75 m, putar-depan PI, tekstur per def.tex), hanya dipisah supaya
//  bisa dimuat MALAS & bergantian per distrik. Keluarannya berbentuk sama dengan loadCityHumans: { holder, mixer, idle, walk, headY, meshes }.
//  OPTIMASI: FBX di-parse sekali (di-cache); material TIDAK dikloning per NPC melainkan per (material asli x tekstur), jadi 10 warga
//  berkaos sama berbagi satu material (npcs.js mengkloning material tiap NPC). Pembuatan antre, satu NPC per ~90 ms.
// ============================================================
const MODEL = 'npc/peasant.fbx';
const TEX = { green: 'npc/peasant_green.jpg', blue: 'npc/peasant_blue.jpg', brown: 'npc/peasant_brown.jpg', yellow: 'npc/peasant_yellow.jpg' };
const HEIGHT = 1.75, FRONT_FLIP = Math.PI;

let basePromise = null;
function loadBase() {
  if (basePromise) return basePromise;
  basePromise = new Promise((ok, fail) => {
    const mgr = new THREE.LoadingManager();
    mgr.setURLModifier(u => /\.(png|tga|jpe?g|bmp)$/i.test(decodeURIComponent(u)) ? TEX.green : u);   // FBX menyimpan path tekstur Windows
    new FBXLoader(mgr).load(MODEL, fbx => {
      fbx.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(fbx, true), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const s = HEIGHT / size.y, offY = -box.min.y * s;
      fbx.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
        for (const m of [].concat(o.material)) { m.transparent = false; m.opacity = 1; m.alphaTest = 0; if (m.color) m.color.set(0xffffff); if (m.specular) m.specular.set(0x161616); if ('shininess' in m) m.shininess = 6; }
      });
      const clips = fbx.animations, pick = k => clips.find(c => c.name.toLowerCase().includes(k)) || clips[0];
      const idleClip = pick('idle'), walkClip = clips.find(c => c.name.toLowerCase().includes('walk')) || idleClip;
      ok({ fbx, s, offY, ctr, idleClip, walkClip });
    }, undefined, fail);
  }).catch(e => { basePromise = null; throw e; });
  return basePromise;
}

const texCache = {}, matCache = new Map();
const tex = k => texCache[k] || (texCache[k] = (() => { const t = new THREE.TextureLoader().load(TEX[k]); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; })());
const matFor = (m, key) => {                       // satu klon per (material asli, tekstur)
  let per = matCache.get(m); if (!per) matCache.set(m, per = {});
  if (!per[key]) { const c = m.clone(); c.map = tex(key); per[key] = c; }
  return per[key];
};

function build(base, def) {
  const key = TEX[def.tex] ? def.tex : 'green', model = cloneSkinned(base.fbx), holder = new THREE.Group();
  holder.scale.setScalar(def.scale || 1); holder.rotation.y = FRONT_FLIP;
  model.scale.multiplyScalar(base.s); model.position.set(-base.ctr.x * base.s, base.offY, -base.ctr.z * base.s);
  const meshes = [];
  model.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => matFor(m, key)) : matFor(o.material, key); meshes.push(o); } });
  holder.add(model);
  const mixer = new THREE.AnimationMixer(model), idle = mixer.clipAction(base.idleClip), walk = mixer.clipAction(base.walkClip);
  idle.timeScale = 0.9 + Math.random() * 0.2;
  return { holder, mixer, idle, walk, greet: null, greetDur: 0, headY: HEIGHT * (def.scale || 1), meshes };
}

// defs = daftar { tex, scale, ... }; onNpc(def, hasil build) dipanggil tiap model siap (antre ~90 ms)
export function loadVillagers(defs, onNpc) {
  if (!defs.length) return;
  loadBase().then(base => {
    let i = 0;
    const pump = () => {
      const d = defs[i++]; if (!d) return;
      try { onNpc(d, build(base, d)); } catch (e) { console.warn('Warga desa gagal dibuat:', d.name, e); }
      setTimeout(pump, 90);
    };
    pump();
  }).catch(err => console.warn('Model warga desa gagal dimuat:', MODEL, err));
}
