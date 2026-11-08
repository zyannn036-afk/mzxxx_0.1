import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ============================================================
//  Model penghuni Istana Arunika (Ratu & Putri) — VRM 1.0, data penempatan: palace-npc-layout.js
//  VRM tidak membawa animasi, jadi di sini ada gerak diam sederhana yang dihitung dari kode: napas, goyang pinggul pelan,
//  kepala menoleh sedikit, kedip mata, dan lambaian tangan saat diajak bicara. Dimuat malas (file besar, ~19 MB per model).
// ============================================================
const loadVRM = url => new Promise((ok, fail) => new GLTFLoader().register(p => new VRMLoaderPlugin(p)).load(url, g => (g.userData.vrm ? ok(g.userData.vrm) : fail(new Error('bukan file VRM'))), undefined, fail));
const ease = x => x * x * (3 - 2 * x);
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'], WAVE_T = 2.0;

// satu NPC: { holder, mixer: { update(dt) }, headY, onTalk }. Semua tulang memakai tulang "normalized" VRM (T-pose = rotasi nol).
function build(vrm, def, phase) {
  VRMUtils.rotateVRM0(vrm);                       // VRM 0.x dihadapkan ke +Z (VRM 1.0 sudah menghadap +Z: tidak berubah)
  vrm.scene.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
  const holder = new THREE.Group(); holder.add(vrm.scene);
  const hy = new THREE.Box3().setFromObject(vrm.scene).max.y;
  const headY = Math.min(2.1, Math.max(1.55, hy));

  const g = n => vrm.humanoid.getNormalizedBoneNode(n);
  const b = { hips: g('hips'), spine: g('spine'), chest: g('chest'), neck: g('neck'), head: g('head'),
    rUA: g('rightUpperArm'), lUA: g('leftUpperArm'), rLA: g('rightLowerArm'), lLA: g('leftLowerArm'), rH: g('rightHand'), lH: g('leftHand'),
    rUL: g('rightUpperLeg'), lUL: g('leftUpperLeg') };
  const fing = { r: [], l: [] };                  // jari-jari sedikit menekuk (tidak lurus kaku seperti T-pose)
  for (const [s, side] of [['r', 'right'], ['l', 'left']]) for (const f of FINGERS) for (const [k, bend] of [['Proximal', 0.22], ['Intermediate', 0.34], ['Distal', 0.2]]) {
    const node = g(side + f + k); if (node) fing[s].push({ node, bend });
  }
  const em = vrm.expressionManager, has = n => !!(em && em.getExpression && em.getExpression(n));
  const grace = def.pose === 'anggun';
  const st = { t: phase, blink: 2 + (phase % 3), blinkT: 0, wave: -1 };   // wave: detik sejak lambaian dimulai (-1 = tidak melambai)

  const update = dt => {
    st.t += dt; const t = st.t, br = Math.sin(t * 1.5), sw = Math.sin(t * 0.55 + 1.3), hd = Math.sin(t * 0.8 + 0.7);
    let w = 0;                                    // bobot lambaian 0..1: naik cepat, bertahan, turun halus
    if (st.wave >= 0) { st.wave += dt; w = ease(Math.max(0, Math.min(1, st.wave / 0.3, (WAVE_T - st.wave) / 0.45))); if (st.wave >= WAVE_T) st.wave = -1; }
    // lengan: turun dari T-pose (kanan +z, kiri -z); anggun = siku menekuk, tangan di depan perut
    const upZ = grace ? 1.05 : 1.2, upX = grace ? 0.42 : 0.1, el = grace ? 1.05 : 0.38;
    b.lUA.rotation.set(upX + 0.01 * br, grace ? 0.25 : 0, -(upZ + 0.015 * br));
    b.lLA.rotation.set(0, -el, 0);
    // lengan kanan bercampur dengan lambaian (dipakai saat diajak bicara)
    b.rUA.rotation.set(upX * (1 - w) + 0.35 * w, (grace ? -0.25 : 0) * (1 - w), (upZ + 0.015 * br) * (1 - w) + 0.55 * w);
    b.rLA.rotation.set(0, el * (1 - w) + (1.5 + 0.3 * Math.sin(t * 10)) * w, 0);
    for (const s of ['r', 'l']) for (const f of fing[s]) f.node.rotation.z = (s === 'r' ? 1 : -1) * f.bend;
    // badan: napas + goyang pelan, kepala menoleh sedikit
    b.spine.rotation.set(0.02 + 0.012 * br, 0.03 * sw, 0.012 * sw); b.chest.rotation.set(0.01 + 0.014 * br, 0.02 * sw, 0);
    b.hips.rotation.set(0, 0.025 * sw, 0.012 * Math.sin(t * 0.55)); b.neck.rotation.set(0.02, 0.05 * hd, 0); b.head.rotation.set(0.03 + 0.015 * br, 0.07 * hd, 0.02 * sw);
    if (b.rUL) { b.rUL.rotation.set(0, 0, -0.01 - 0.008 * sw); b.lUL.rotation.set(0, 0, 0.01 + 0.008 * sw); }
    // ekspresi: kedip sesekali + senyum tipis
    if (em) {
      st.blink -= dt; if (st.blink <= 0) { st.blinkT = 0.16; st.blink = 2.2 + ((t * 7.3) % 3.2); }
      st.blinkT = Math.max(0, st.blinkT - dt);
      if (has('blink')) em.setValue('blink', st.blinkT > 0 ? Math.sin(Math.PI * (1 - st.blinkT / 0.16)) : 0);
      if (has('happy')) em.setValue('happy', 0.22 + 0.5 * w);
    }
    vrm.update(dt);
  };
  update(0.001);
  return { holder, mixer: { update }, headY, onTalk: () => { st.wave = 0; } };
}

// Muat satu per satu (parsing VRM besar menahan layar sebentar, jadi diberi jeda). onNpc(def, hasil build) dipanggil begitu modelnya siap.
export function loadPalaceNpcs(defs, onNpc) {
  let i = 0;
  const next = () => {
    if (i >= defs.length) return;
    const def = defs[i], idx = i++;
    loadVRM(def.file).then(vrm => {
      console.info(`Penghuni istana: ${def.file} dimuat`);
      try { onNpc(def, build(vrm, def, idx * 2.1)); } catch (e) { console.warn('NPC istana gagal dibuat:', def.name, e); }
    }).catch(err => console.warn('Model penghuni istana gagal dimuat:', def.file, err)).finally(() => setTimeout(next, 800));
  };
  next();
}
