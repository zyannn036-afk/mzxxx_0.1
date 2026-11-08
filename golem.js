import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================
//  GOLEM PENJAGA — model & animasi (dipakai game.js)
//  Model dari FBX.fbx (golem es/batu, 8 balok lepas + torso + kepala) yang dibongkar jadi golem.glb oleh tools/fbx_to_golem_glb.py:
//  tinggi 6,5 m, telapak kaki di y=0, MENGHADAP +z. Hierarki sendi kaku (tidak ada tulang kulit):
//    golem > hipL, hipR | body > head(eyeL, eyeR), core, shoulderL > elbowL, shoulderR > elbowR     (L = sisi +x)
//  Pose "lengan kiri terangkat ke depan" di FBX ternyata putaran kaku -68,6° di bahu -> dipakai di bawah (FIST).
//  Konvensi putar: rotation.x NEGATIF pada bahu = lengan terangkat ke DEPAN; rotation.z POSITIF = lengan kiri membuka ke samping.
//  Jika golem.glb gagal dimuat, dipakai golem cadangan dari kotak (nama sendi sama), jadi pertarungan tetap jalan.
// ============================================================
let golemGltf = null;
new GLTFLoader().load('golem.glb', g => { golemGltf = g; }, undefined, () => console.warn('golem.glb gagal dimuat, pakai golem cadangan'));

const FIST = -68.6 * Math.PI / 180;       // pose A di FBX
const HIP_H = 2.9;                        // tinggi pangkal paha (untuk menjaga telapak tetap menyentuh lantai saat melangkah)
const easeIO = t => t * t * (3 - 2 * t);
const clamp01 = x => Math.min(1, Math.max(0, x));
function kf(t, k) {                       // interpolasi keyframe [[waktu, nilai], ...] dengan easing
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t < k[i][0]) { const u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * easeIO(u); }
  return k[k.length - 1][1];
}
// lama tiap serangan (detik) & saat "kena" (dipakai game.js supaya damage pas dengan gerakan)
export const ATTACK = {
  punch: { dur: 1.8, hit: 0.92 },
  slam: { dur: 2.4, hit: 1.32 },
  rocks: { dur: 2.0, hit: 1.0 },
  rain: { dur: 2.1, hit: 1.1 },
  roar: { dur: 2.0, hit: 0.6 },
  pillars: { dur: 2.2, hit: 1.15 },   // Pilar Beruntun: hantam tanah -> deretan pilar batu menyembul berurutan mengejar pemain
};

function fallbackGolem(mat) {             // kotak-kotak dengan hierarki & nama sama seperti golem.glb
  const root = new THREE.Group(), mk = (parent, name, pos, w, h, d, cy) => {
    const n = new THREE.Group(); n.name = name; n.position.set(...pos); parent.add(n);
    if (w) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.y = cy; n.add(m); } return n; };
  mk(root, 'hipL', [1.1, 2.9, 0], 1.3, 2.9, 1.2, -1.45); mk(root, 'hipR', [-1.1, 2.9, 0], 1.3, 2.9, 1.2, -1.45);
  const body = mk(root, 'body', [0, 3, 0], 3, 3.4, 2, 1.4), head = mk(body, 'head', [0, 2.15, 0.5], 1.3, 1.3, 1.2, 0.6);
  mk(head, 'eyeL', [0.28, 0.75, 0.55]); mk(head, 'eyeR', [-0.28, 0.75, 0.55]); mk(body, 'core', [0, 1.15, 0.8]);
  for (const [S, s] of [['L', 1], ['R', -1]]) { const sh = mk(body, 'shoulder' + S, [s * 1.9, 2.2, 0], 1.2, 1.6, 1.1, -0.9); mk(sh, 'elbow' + S, [s * 1.4, -1.6, 0], 1.3, 2.8, 1.2, -1.2); }
  return root;
}

// membuat satu golem baru. Hasil: { root, mat, eyeMat, coreMat, light, n: {sendi...}, baseBodyY }
export function buildGolem() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: !!golemGltf, color: golemGltf ? 0xffffff : 0x8aa6bb, roughness: 0.8, metalness: 0.05 });   // satu bahan untuk semua balok: kilatan terkena pukulan ikut semuanya
  let root;
  if (golemGltf) root = golemGltf.scene.clone(true); else root = fallbackGolem(mat);
  root.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
  const n = {}; root.traverse(o => { if (o.name) n[o.name] = o; });
  const need = ['hipL', 'hipR', 'body', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'eyeL', 'eyeR', 'core'];
  for (const k of need) if (!n[k]) throw new Error('golem: sendi "' + k + '" tidak ada');
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff }), eyeGeo = new THREE.SphereGeometry(1, 12, 8);
  for (const k of ['eyeL', 'eyeR']) { const m = new THREE.Mesh(eyeGeo, eyeMat); m.scale.set(0.14, 0.088, 0.04); m.position.z = 0.04; n[k].add(m); }
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x9cf0ff }), core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), coreMat); core.scale.set(0.8, 1.2, 0.8); n.core.add(core);
  const light = new THREE.PointLight(0x7fd8ff, 6, 14, 2); light.position.set(0, 0, 1.0); n.core.add(light);
  return { root, mat, eyeMat, coreMat, light, n, baseBodyY: n.body.position.y };
}

// keadaan pose (disimpan di musuh): ph = jam, wp/wk = fase & bobot langkah, look = sudut ke pemain relatif arah hadap,
// at/t = serangan berjalan (null = tidak ada) & waktunya, side = lengan yang memukul (+1 kiri, -1 kanan),
// intro 0..1 (0 = bersimpuh mati, 1 = berdiri), rage 0..1 (mengamuk), die 0..1 (runtuh)
export const newGolemPose = () => ({ ph: 0, wp: 0, wk: 0, look: 0, at: null, t: 0, side: 1, intro: 1, rage: 0, die: 0, glow: 0 });

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
export function poseGolem(rig, s) {
  const n = rig.n, ph = s.ph, wk = s.wk, wp = s.wp;
  const th = 0.45 * wk * Math.sin(wp), breath = Math.sin(ph * 1.7);
  // ---- dasar: napas + langkah ----
  const v = { hipL: th, hipR: -th, sxL: -0.62 * th + 0.03 * breath, sxR: 0.62 * th + 0.03 * breath, szL: 0.1 + 0.02 * breath, szR: -0.1 - 0.02 * breath, exL: -0.12, exR: -0.12,
    bx: 0.04 * wk + 0.012 * breath, by: 0.12 * wk * Math.sin(wp), bz: 0.03 * wk * Math.cos(wp), hx: -0.04 * wk, hy: Math.max(-0.7, Math.min(0.7, s.look)) * 0.7, root: -HIP_H * (1 - Math.cos(th)) + 0.02 * breath };
  // ---- serangan: ditimpa gerakan sesuai waktu, dicampur dengan bobot aw supaya masuk/keluar halus ----
  if (s.at) {
    const t = s.t, sd = s.side, o = {}; let aw = 1;
    if (s.at === 'punch') {            // palu: angkat lengan tinggi di atas kepala -> hantam turun ke pose tinju FBX
      aw = kf(t, [[0, 0], [0.25, 1], [1.5, 1], [1.8, 0]]);
      const a = kf(t, [[0, 0], [0.8, -2.6], [0.92, FIST], [1.25, FIST], [1.8, 0]]), e = kf(t, [[0, 0], [0.8, -0.7], [0.92, -0.08], [1.25, -0.08], [1.8, 0]]), z = kf(t, [[0, 0], [0.8, 0.35], [0.92, 0.05], [1.8, 0]]);
      const tw = kf(t, [[0, 0], [0.8, 0.5], [0.92, -0.35], [1.25, -0.3], [1.8, 0]]);
      if (sd > 0) { o.sxL = a; o.exL = e; o.szL = 0.1 + z; o.sxR = 0.4 * Math.abs(a) * 0.3; } else { o.sxR = a; o.exR = e; o.szR = -0.1 - z; o.sxL = 0.4 * Math.abs(a) * 0.3; }
      o.by = sd * tw; o.bx = kf(t, [[0, 0], [0.8, -0.2], [0.92, 0.28], [1.25, 0.2], [1.8, 0]]); o.hx = kf(t, [[0, 0], [0.8, -0.3], [0.92, 0.25], [1.8, 0]]); o.root = kf(t, [[0, 0], [0.8, 0.08], [0.92, -0.25], [1.4, -0.2], [1.8, 0]]);
    } else if (s.at === 'slam') {      // hentakan: kedua lengan ke atas, hantam tanah
      aw = kf(t, [[0, 0], [0.3, 1], [1.9, 1], [2.4, 0]]);
      const a = kf(t, [[0, 0], [1.2, -2.9], [1.32, -0.9], [1.9, -0.9], [2.4, 0]]), e = kf(t, [[0, 0], [1.2, -0.4], [1.32, 0], [2.4, 0]]), z = kf(t, [[0, 0], [1.2, 0.3], [1.32, 0.15], [2.4, 0]]);
      o.sxL = o.sxR = a; o.exL = o.exR = e; o.szL = 0.1 + z; o.szR = -0.1 - z;
      o.bx = kf(t, [[0, 0], [1.2, -0.32], [1.32, 0.42], [1.9, 0.36], [2.4, 0]]); o.hx = kf(t, [[0, 0], [1.2, -0.45], [1.32, 0.3], [2.4, 0]]); o.root = kf(t, [[0, 0], [1.2, 0.1], [1.32, -0.4], [1.9, -0.32], [2.4, 0]]);
    } else if (s.at === 'rocks') {     // membungkuk menarik batu, lalu melempar
      aw = kf(t, [[0, 0], [0.3, 1], [1.5, 1], [2, 0]]);
      const a = kf(t, [[0, 0], [0.9, 0.7], [1.0, -1.15], [1.4, -1.0], [2, 0]]), e = kf(t, [[0, 0], [0.9, -0.9], [1.0, -0.2], [2, 0]]);
      o.sxL = o.sxR = a; o.exL = o.exR = e; o.bx = kf(t, [[0, 0], [0.9, 0.5], [1.0, -0.22], [1.4, -0.15], [2, 0]]); o.hx = kf(t, [[0, 0], [0.9, 0.3], [1.0, -0.2], [2, 0]]); o.root = kf(t, [[0, 0], [0.9, -0.55], [1.0, -0.1], [2, 0]]);
    } else if (s.at === 'rain') {      // mengangkat kedua lengan memanggil hujan batu
      aw = kf(t, [[0, 0], [0.3, 1], [1.7, 1], [2.1, 0]]);
      const a = kf(t, [[0, 0], [0.9, -2.8], [1.25, -2.8], [1.4, -1.0], [2.1, 0]]);
      o.sxL = o.sxR = a; o.exL = o.exR = -0.2; o.szL = 0.35; o.szR = -0.35; o.bx = kf(t, [[0, 0], [0.9, -0.3], [1.4, 0.3], [2.1, 0]]) + 0.02 * Math.sin(t * 40); o.hx = kf(t, [[0, 0], [0.9, -0.5], [1.4, 0.2], [2.1, 0]]); o.root = kf(t, [[0, 0], [1.4, -0.25], [2.1, 0]]);
    } else if (s.at === 'pillars') {   // Pilar Beruntun: kedua lengan naik, hantam tanah, lalu menekan tanah selagi pilar-pilar menyembul
      aw = kf(t, [[0, 0], [0.3, 1], [1.8, 1], [2.2, 0]]);
      const a = kf(t, [[0, 0], [0.95, -2.9], [1.15, -0.85], [1.8, -0.85], [2.2, 0]]), e = kf(t, [[0, 0], [0.95, -0.4], [1.15, 0], [2.2, 0]]), z = kf(t, [[0, 0], [0.95, 0.3], [1.15, 0.15], [2.2, 0]]);
      o.sxL = o.sxR = a; o.exL = o.exR = e; o.szL = 0.1 + z; o.szR = -0.1 - z;
      o.bx = kf(t, [[0, 0], [0.95, -0.34], [1.15, 0.45], [1.8, 0.38], [2.2, 0]]) + (t > 1.15 && t < 1.8 ? 0.015 * Math.sin(t * 45) : 0); o.hx = kf(t, [[0, 0], [0.95, -0.45], [1.15, 0.3], [2.2, 0]]); o.root = kf(t, [[0, 0], [0.95, 0.1], [1.15, -0.42], [1.8, -0.34], [2.2, 0]]);
    } else if (s.at === 'roar') {      // meraung: dada membusung, lengan terbuka, badan bergetar
      aw = kf(t, [[0, 0], [0.3, 1], [1.5, 1], [2.0, 0]]); const sh = 0.015 * Math.sin(t * 55);
      o.sxL = o.sxR = -0.5; o.szL = 1.0; o.szR = -1.0; o.exL = o.exR = -0.5; o.bx = -0.28 + sh; o.hx = -0.55; o.root = 0.05;
    }
    for (const k in o) v[k] += (o[k] - v[k]) * aw;
  }
  // ---- bangkit dari tidur & runtuh saat kalah ----
  const cr = 1 - s.intro, d = s.die;
  v.root += -0.95 * cr - 1.0 * d; v.bx += 0.5 * cr + 0.45 * d; v.hx += 0.9 * cr + 1.0 * d; v.sxL += 0.35 * cr + 0.4 * d; v.sxR += 0.35 * cr + 0.4 * d; v.hipL += 0.3 * d; v.hipR += 0.3 * d; v.szL += 0.15 * d; v.szR -= 0.15 * d;
  // ---- terapkan ----
  rig.root.position.y = v.root;
  n.hipL.rotation.x = v.hipL; n.hipR.rotation.x = v.hipR;
  n.body.rotation.set(v.bx, v.by, v.bz); n.body.position.y = rig.baseBodyY;
  n.head.rotation.set(v.hx, v.hy, 0);
  n.shoulderL.rotation.set(v.sxL, 0, v.szL); n.shoulderR.rotation.set(v.sxR, 0, v.szR);
  n.elbowL.rotation.x = v.exL; n.elbowR.rotation.x = v.exR;
  // ---- mata & inti: padam saat tidur, cyan saat normal, oranye saat mengamuk ----
  const on = clamp01(s.intro * 1.2 - 0.2) * (1 - 0.8 * d), pulse = 0.85 + 0.15 * Math.sin(ph * 4 + 1);
  _c1.setHex(0x0e2a33); _c2.setHex(0x7fe8ff).lerp(_c1.setHex(0xff7a35), s.rage); _c1.setHex(0x0e2a33).lerp(_c2, on);
  rig.eyeMat.color.copy(_c1).multiplyScalar(0.55 + 0.45 * pulse + 0.5 * s.glow); rig.coreMat.color.copy(_c1).multiplyScalar(0.8 + 0.4 * pulse + 0.6 * s.glow);
  rig.light.color.copy(_c2); rig.light.intensity = (1 + 5.5 * on) * (0.85 + 0.15 * pulse) + 8 * s.glow;
}
