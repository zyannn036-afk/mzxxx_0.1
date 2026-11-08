import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// ============================================================
//  NPC GLB berangka untuk Kota Kekaisaran. Tiap def membawa `model` (nama file .glb) & `rig`:
//    'mixamo' = rigged_character_low_poly.glb · 'rigify' = low_poly_adventurer.glb (tulang DEF-*)
//    'rigify' juga dipakai low_poly_mage_rigged_free.glb (pose: 'natural' = lengan tidak diturunkan karena sedang memegang tongkat)
//    'static' = low_poly_boy.glb / low_poly_elf_mage_with_glasses_fantasy_pack.glb / low_poly_archer_fantasy_pack.glb (TANPA tulang: seluruh badan digerakkan sebagai satu benda; lambaian diganti membungkuk & melonjak kecil)
//  Modelnya TANPA animasi (berpose T / A), jadi di sini dibuat sendiri saat runtime:
//   - pose berdiri: kedua lengan diturunkan (dihitung dari arah tulang, tidak bergantung sumbu lokal tulang)
//   - idle: napas halus (tulang punggung) + kepala sedikit bergerak
//   - walk: ayunan lengan (berangka) / melonjak + goyang (tanpa tulang), dipakai warga yang berpatroli
//   - greet: melambai dengan lengan kanan (dipakai tombol "Mengobrol")
//  PEMBARUAN: model 'static' tertentu (STATIC_MODELS di bawah) kini dirakit ulang & diberi RANGKA BUATAN saat runtime (lihat assembleStatic):
//   - archer: panah/busur yang tercecer dibuang, busur + tempat panah + panah ditaruh di PUNGGUNG; alas & pelat lantai disembunyikan
//   - elf: bagian-bagian tubuh yang letaknya bergeser di file digeser ke tempatnya
//   - badan di-skin ke tulang pinggul/punggung/kepala/lengan/kaki, jadi bisa berjalan sungguhan (ayun kaki-lengan, lutut menekuk, pinggul goyang)
//  Bentuk keluaran SAMA dengan loader lain (city-npcs / kekaisaran-ksatria / desa-npcs):
//   onNpc(def, { holder, mixer, idle, walk, greet, greetDur, headY })
// ============================================================

const cache = new Map();   // url -> Promise<gltf> (satu file dimuat sekali, tiap NPC memakai klon)
const loadGltf = url => { if (!cache.has(url)) cache.set(url, new Promise((ok, no) => new GLTFLoader().load(url, ok, undefined, no))); return cache.get(url); };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();

// potongan nama tulang per jenis rangka. GLTFLoader membuang ':' dan '.' dari nama ('mixamorig:Spine2_81' -> 'mixamorigSpine2_81', 'DEF-ARM.L_10' -> 'DEF-ARML_10'),
// jadi kunci di bawah juga dibersihkan dengan cara yang sama sebelum dicocokkan.
const RIGS = {
  mixamo: { spine: 'Spine2', head: 'Head_', lArm: 'LeftArm_', lFore: 'LeftForeArm_', lHand: 'LeftHand_', rArm: 'RightArm_', rFore: 'RightForeArm_', rHand: 'RightHand_',
            pelvis: 'Hips_', lLeg: 'LeftUpLeg_', lShin: 'LeftLeg_', lFoot: 'LeftFoot_', rLeg: 'RightUpLeg_', rShin: 'RightLeg_', rFoot: 'RightFoot_' },
  rigify: { spine: 'DEF-CHEST_', head: 'DEF-HEAD_', lArm: 'DEF-ARM.L_', lFore: 'DEF-FOREARM.L_', lHand: 'DEF-HAND.L_', rArm: 'DEF-ARM.R_', rFore: 'DEF-FOREARM.R_', rHand: 'DEF-HAND.R_',
            pelvis: 'DEF-PELVIS_', lLeg: 'DEF-LEG.L_', lShin: 'DEF-SHIN.L_', lFoot: 'DEF-FOOT.L_', rLeg: 'DEF-LEG.R_', rShin: 'DEF-SHIN.R_', rFoot: 'DEF-FOOT.R_' },
  // rangka buatan untuk model tanpa tulang (dibuat oleh procRig)
  proc:   { spine: 'P_spine', head: 'P_head', lArm: 'P_lArm', lFore: 'P_lFore', lHand: 'P_lHand', rArm: 'P_rArm', rFore: 'P_rFore', rHand: 'P_rHand',
            pelvis: 'P_hips', lLeg: 'P_lLeg', lShin: 'P_lShin', lFoot: 'P_lFoot', rLeg: 'P_rLeg', rShin: 'P_rShin', rFoot: 'P_rFoot' },
};
function bones(root, rig) {
  const keys = RIGS[rig] || RIGS.mixamo, B = {};
  for (const [k, key] of Object.entries(keys)) { const kk = key.replace(/[.:]/g, ''); B[k] = null; root.traverse(o => { if (!B[k] && o.isBone && o.name.includes(kk)) B[k] = o; }); }
  return B;
}

// putar `bone` supaya arah bone -> child menghadap `dir` (dunia); mengembalikan quaternion LOKAL baru (bone juga langsung diubah)
function aim(bone, child, dir) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_v); child.getWorldPosition(_w); _w.sub(_v).normalize();
  _q.setFromUnitVectors(_w, dir.clone().normalize());                    // putaran dunia
  bone.getWorldQuaternion(_q2); _q2.premultiply(_q);                     // orientasi dunia baru
  (bone.parent ? bone.parent.getWorldQuaternion(_pq) : _pq.identity()).invert();
  bone.quaternion.copy(_pq.multiply(_q2)).normalize();                   // ke ruang lokal
  bone.updateWorldMatrix(false, true);
  return bone.quaternion.clone();
}
const rotY = (q, a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a).multiply(q);
const rotX = (q, a) => q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a));

// ---- PERBAIKAN rig Rigify ----
// Di low_poly_adventurer.glb tulang DEF-* tersusun RATA di bawah ROOT: rantai induk-anak Blender (bahu > lengan > lengan bawah > tangan > jari)
// hilang waktu diekspor ke glTF. Akibatnya memutar DEF-ARM hanya memutar tulang itu sendiri: lengan bawah, tangan, jari & PEDANG (tulang DEF-SWORD)
// tertinggal di tempat, dan mesh lengan tertarik jadi bengkok-bengkok. Di sini rantainya disambung lagi; attach() menjaga posisi dunia
// tiap tulang tetap sama, jadi pose bawaan model tidak berubah sama sekali.
function rigifyHierarchy(root, legs = true) {
  const f = {};
  root.traverse(o => { if (o.isBone && o.name.startsWith('DEF-')) f[o.name.replace(/_\d+$/, '')] = o; });   // 'DEF-ARML_10' -> 'DEF-ARML'
  root.updateWorldMatrix(true, true);
  const link = (c, p) => { if (f[c] && f[p] && f[c].parent !== f[p]) f[p].attach(f[c]); };
  link('DEF-SPINE', 'DEF-PELVIS'); link('DEF-CHEST', 'DEF-SPINE'); link('DEF-NECK', 'DEF-CHEST'); link('DEF-HEAD', 'DEF-NECK');
  for (const s of ['L', 'R']) {
    link('DEF-SHOULDER' + s, 'DEF-CHEST'); link('DEF-ARM' + s, 'DEF-SHOULDER' + s); link('DEF-FOREARM' + s, 'DEF-ARM' + s); link('DEF-HAND' + s, 'DEF-FOREARM' + s);
    for (const k of ['FINGER01', 'FINGER02', 'FINGER03', 'THUMB']) link('DEF-' + k + s, 'DEF-HAND' + s);
    link('DEF-THUMB01' + s, 'DEF-THUMB' + s); link('DEF-THUMB02' + s, 'DEF-THUMB01' + s);
    // kaki: paha > betis > telapak > jari kaki (supaya langkah menggerakkan seluruh rantai, termasuk jubah yang di-skin ke tulang kaki)
    if (legs) { link('DEF-LEG' + s, 'DEF-PELVIS'); link('DEF-SHIN' + s, 'DEF-LEG' + s); link('DEF-FOOT' + s, 'DEF-SHIN' + s); link('DEF-TOES' + s, 'DEF-FOOT' + s); }
  }
  link('DEF-BACKPACK', 'DEF-CHEST'); link('DEF-BACKPACK_AXE', 'DEF-BACKPACK');
  link('DEF-BAG01', 'DEF-PELVIS'); link('DEF-BAG02', 'DEF-PELVIS'); link('DEF-BELT', 'DEF-PELVIS'); link('DEF-SWORD-SHEET', 'DEF-PELVIS');
  // aksesori kostum: topi -> kepala, syal -> dada, lengan baju menjuntai -> lengan bawah (tanpa ini mereka tertinggal saat tubuh bergerak)
  for (const k of Object.keys(f)) {
    if (k.startsWith('DEF-HAT')) link(k, 'DEF-HEAD');
    else if (k.startsWith('DEF-SCARF')) link(k, 'DEF-CHEST');
    else { const m = k.match(/^DEF-FOREARM-HANG\d+([LR])$/); if (m) link(k, 'DEF-FOREARM' + m[1]); }
  }
  // benda genggam (pedang / tongkat) ikut tangan yang memegangnya (yang terdekat); kalau jauh dari kedua tangan (disarungkan) ikut pinggul
  for (const nm of ['DEF-SWORD', 'DEF-STAFF']) {
    const sw = f[nm]; if (!sw) continue;
    const sp = sw.getWorldPosition(new THREE.Vector3()), dist = h => (h ? h.getWorldPosition(new THREE.Vector3()).distanceTo(sp) : Infinity);
    const hand = dist(f['DEF-HANDR']) <= dist(f['DEF-HANDL']) ? f['DEF-HANDR'] : f['DEF-HANDL'];
    const near = dist(hand);
    if (hand && near < 1.0) hand.attach(sw); else if (f['DEF-PELVIS']) f['DEF-PELVIS'].attach(sw);
  }
  root.updateWorldMatrix(true, true);
}

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };   // smoothstep (a > b = terbalik)
const Qr = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

function buildClips(model, rig, natural, H = 1.75, noLegs = false) {   // natural = pose bawaan model sudah berdiri wajar (mis. penyihir memegang tongkat): lengan TIDAK diturunkan
  const B = bones(model, rig); model.updateWorldMatrix(true, true);
  if (!B.lArm || !B.lFore || !B.rArm || !B.rFore || !B.spine || !B.head) return null;
  const rest = Object.fromEntries(Object.entries(B).filter(([, b]) => b).map(([k, b]) => [k, b.quaternion.clone()]));
  const side = B.lArm.getWorldPosition(new THREE.Vector3()).x >= B.rArm.getWorldPosition(new THREE.Vector3()).x ? 1 : -1;   // tanda x lengan kiri
  const down = s => new THREE.Vector3(s * 0.12, -1, 0.06);               // lengan turun, sedikit menjauh dari badan
  const pW = b => (b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion());

  // ---- pose berdiri ----
  const stand = {};
  if (natural) { for (const k of ['lArm', 'lFore', 'rArm', 'rFore']) stand[k] = rest[k].clone(); }
  else {
    stand.lArm = aim(B.lArm, B.lFore, down(side));  stand.lFore = aim(B.lFore, B.lHand, down(side).setX(side * 0.05).setZ(0.12));
    stand.rArm = aim(B.rArm, B.rFore, down(-side)); stand.rFore = aim(B.rFore, B.rHand, down(-side).setX(-side * 0.05).setZ(0.12));
  }
  model.updateWorldMatrix(true, true);
  const pwFore = { l: pW(B.lFore), r: pW(B.rFore) };                     // orientasi dunia lengan atas pada pose berdiri (induk lengan bawah)
  // ---- pose melambai: lengan kanan terangkat ke samping-atas, lengan bawah tegak ----
  const wave = {};
  wave.rArm = aim(B.rArm, B.rFore, new THREE.Vector3(-side * 0.85, 0.45, 0.15));
  wave.rForeA = aim(B.rFore, B.rHand, new THREE.Vector3(-side * 0.25, 1, 0.2));
  wave.rForeB = aim(B.rFore, B.rHand, new THREE.Vector3(-side * 0.95, 0.75, 0.2));
  // kembalikan ke rest (klip yang mengatur pose; tulang akan ditimpa mixer)
  for (const k of Object.keys(rest)) B[k].quaternion.copy(rest[k]);
  model.updateWorldMatrix(true, true);
  const pw = {}; for (const k of Object.keys(rest)) pw[k] = pW(B[k]);    // orientasi dunia induk tiap tulang pada pose rest

  // Memutar `k` dengan putaran DUNIA q (relatif terhadap induknya yang sedang bergerak) -> kuaternion lokal. Tidak bergantung sumbu lokal tulang.
  const W = (k, q, from = rest[k]) => pw[k].clone().invert().multiply(q).multiply(pw[k]).multiply(from);
  const Wf = (s, q) => pwFore[s].clone().invert().multiply(q).multiply(pwFore[s]).multiply(stand[s + 'Fore']);

  // SEMUA klip harus menyentuh tulang yang SAMA (kalau tidak, saat crossfade tulang yang tak disebut kembali ke pose T / rest)
  const K = ['pelvis', 'spine', 'head', 'lArm', 'lFore', 'rArm', 'rFore', 'lLeg', 'lShin', 'lFoot', 'rLeg', 'rShin', 'rFoot'].filter(k => B[k] && !(noLegs && /^(pelvis|[lr](Leg|Shin|Foot))$/.test(k)));
  const base = () => { const o = {}; for (const k of K) o[k] = (stand[k] || rest[k]).clone(); return o; };
  const p0 = model.position.clone();                                     // goyang badan (naik-turun / kiri-kanan) lewat posisi model
  const Tq = (k, times, quats) => new THREE.QuaternionKeyframeTrack(B[k].name + '.quaternion', times, quats.flatMap(q => q.toArray()));
  const Tp = (times, rows) => new THREE.VectorKeyframeTrack('.position', times, rows.flatMap(r => [p0.x + r[0], p0.y + r[1], p0.z]));
  function sampled(name, dur, N, fn) {   // fn(fase 0..2π) -> { pose, dx, dy }, siklus mulus (sampel pertama = terakhir)
    const times = [], rows = [];
    for (let i = 0; i <= N; i++) { times.push(dur * i / N); rows.push(fn(2 * Math.PI * i / N)); }
    return new THREE.AnimationClip(name, dur, [...K.map(k => Tq(k, times, rows.map(r => r.pose[k]))), Tp(times, rows.map(r => [r.dx || 0, r.dy || 0]))]);
  }

  // ---- idle: napas halus + kepala sedikit bergerak ----
  const D = 3.6;
  const idle = sampled('idle', D, 24, ph => {
    const s = 0.5 - 0.5 * Math.cos(ph), pose = base();
    pose.spine = W('spine', Qr(-0.022 * s)); pose.head = W('head', Qr(0, 0.07 * s));
    return { pose, dy: 0.0015 * s };
  });

  // ---- greet: melambai dengan lengan kanan ----
  const G = 2.4, gt = [0, 0.4, 0.8, 1.2, 1.6, 2.0, G], b0 = base();
  const hold = k => Tq(k, [0, G], [b0[k], b0[k]]);
  const greet = new THREE.AnimationClip('greet', G, [
    ...K.filter(k => k !== 'rArm' && k !== 'rFore').map(hold),
    Tq('rArm', [0, 0.4, 2.0, G], [stand.rArm, wave.rArm, wave.rArm, stand.rArm]),
    Tq('rFore', gt, [stand.rFore, wave.rForeA, wave.rForeB, wave.rForeA, wave.rForeB, wave.rForeA, stand.rFore]),
    Tp([0, G], [[0, 0], [0, 0]]),
  ]);

  // ---- jalan: siklus 2 langkah (1.2 dtk). Paha berayun ±A, lutut menekuk saat kaki diayun, telapak dijaga datar lalu tumit terangkat saat mendorong,
  // pinggul memutar & bergoyang, dada memutar berlawanan, kepala menstabilkan pandangan, lengan berayun berlawanan dengan kaki satu sisi + siku menekuk saat ke depan.
  // A dipilih supaya panjang langkah ≈ laju geser pivot di kekaisaran-npc.js (WALK_SPEED 1,1 m/dtk, 0,66 m per langkah) -> telapak tidak "meluncur".
  const Wk = 1.2, A = natural ? 0.36 : 0.42, ARM = 0.38, YAW = 0.07, bobA = 0.012 * H, swayA = 0.008 * H;
  const walk = sampled('walk', Wk, 24, ph => {
    const pose = base(), S = Math.sin(ph);
    for (const s of ['l', 'r']) {
      const p = s === 'l' ? ph : ph + Math.PI, f = A * Math.sin(p);                                  // f > 0 = paha ke depan
      const kn = 0.08 + 0.75 * Math.pow(Math.max(0, Math.cos(p + 0.15)), 2);                         // lutut menekuk paling dalam di awal ayunan
      const toe = 0.35 * sm(0.2, 0.9, -Math.sin(p)) - 0.15 * sm(0.5, 1, Math.sin(p));                // tumit naik saat mendorong, ujung kaki naik saat menapak
      if (K.includes(s + 'Leg')) pose[s + 'Leg'] = W(s + 'Leg', Qr(-f));
      if (K.includes(s + 'Shin')) pose[s + 'Shin'] = W(s + 'Shin', Qr(kn));
      if (K.includes(s + 'Foot')) pose[s + 'Foot'] = W(s + 'Foot', Qr((f - kn) * 0.9 + toe));
      if (s === 'l' && natural) continue;                                                              // tangan kiri memegang tongkat: tidak berayun
      const th = (s === 'l' ? 1 : -1) * ARM * S, fw = Math.max(0, -th / ARM);                          // th < 0 = lengan ke depan
      pose[s + 'Arm'] = W(s + 'Arm', Qr(th), stand[s + 'Arm']);
      pose[s + 'Fore'] = Wf(s, Qr(-(0.12 + 0.32 * fw)));
    }
    if (K.includes('pelvis')) pose.pelvis = W('pelvis', Qr(0, -YAW * S * side));
    pose.spine = W('spine', Qr(0, 1.5 * YAW * S * side).multiply(Qr(0.04)));
    pose.head = W('head', Qr(0, -0.5 * YAW * S * side).multiply(Qr(-0.04)));
    return { pose, dy: bobA * Math.cos(2 * ph), dx: -swayA * Math.cos(ph) * side };
  });
  return { idle, greet, walk, greetDur: G };
}

// ---- model tanpa tulang (static): animasi pada grup pembungkus `body` (mixer berakar di body, nama track '.xxx') ----
const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
function staticClips() {
  const D = 3.2, tl = [0, D / 2, D], q = a => a.toArray();
  const idle = new THREE.AnimationClip('idle', D, [
    new THREE.VectorKeyframeTrack('.scale', tl, [1, 1, 1, 1, 1.014, 1, 1, 1, 1]),                                  // napas
    new THREE.QuaternionKeyframeTrack('.quaternion', tl, [...q(Q(0, 0, -0.012)), ...q(Q(0, 0.03, 0.012)), ...q(Q(0, 0, -0.012))]),   // goyang halus
    new THREE.VectorKeyframeTrack('.position', [0, D], [0, 0, 0, 0, 0, 0]),
  ]);
  const G = 1.6, gt = [0, 0.2, 0.45, 0.7, 0.95, 1.2, G];
  const greet = new THREE.AnimationClip('greet', G, [
    new THREE.VectorKeyframeTrack('.scale', gt, gt.flatMap(() => [1, 1, 1])),
    new THREE.QuaternionKeyframeTrack('.quaternion', gt, [Q(0, 0, 0), Q(0.16, 0, 0), Q(0.16, 0, 0), Q(0, 0, 0), Q(0.12, 0, 0), Q(0, 0, 0), Q(0, 0, 0)].flatMap(q)),   // mengangguk 2x
    new THREE.VectorKeyframeTrack('.position', gt, [0,0,0, 0,0.1,0, 0,0,0, 0,0.08,0, 0,0,0, 0,0,0, 0,0,0]),                                                                     // melonjak kecil
  ]);
  // jalan: melonjak tiap langkah + goyang kiri-kanan + sedikit condong ke depan (1 siklus = 2 langkah)
  const W = 1.2, wt = [0, 0.3, 0.6, 0.9, W], roll = [0.05, 0, -0.05, 0, 0.05];
  const walk = new THREE.AnimationClip('walk', W, [
    new THREE.VectorKeyframeTrack('.scale', wt, wt.flatMap(() => [1, 1, 1])),
    new THREE.QuaternionKeyframeTrack('.quaternion', wt, roll.flatMap(r => q(Q(0.04, 0, r)))),
    new THREE.VectorKeyframeTrack('.position', wt, [0,0,0, 0,0.06,0, 0,0,0, 0,0.06,0, 0,0,0]),
  ]);
  return { idle, greet, walk, greetDur: G };
}
// KHR_materials_unlit membuat model tampak menyala sendiri di malam hari: ganti ke material standar bertekstur yang sama (diikuti cahaya matahari / lampu)
const litCache = new Map();
const lit = m => { if (!m.isMeshBasicMaterial) return m; if (!litCache.has(m)) litCache.set(m, new THREE.MeshStandardMaterial({ map: m.map, color: m.color, roughness: 1, metalness: 0, side: m.side, transparent: m.transparent, alphaTest: m.alphaTest })); return litCache.get(m); };


// ============================================================
//  MODEL TANPA TULANG -> dirakit ulang + diberi rangka buatan
//  Semua koordinat di bawah dalam SATUAN MODEL (sebelum diskalakan ke tinggi def.height). Sumbu: +y atas, +z depan, +x = sisi KIRI karakter.
//  Di file archer & elf, tiap bagian (badan, busur, panah, ...) disimpan menumpuk di titik asal tanpa transformasi, jadi harus ditaruh sendiri.
//   hide  : bagian dibuang (alas pajangan, pelat lantai, panah-panah tercecer)
//   shift : geser tinggi (y) bagian yang letaknya salah
//   head  : bagian yang ikut kepala (kaku) · rigid: ikut pinggul (kaku) · noLeg: di-skin tapi tanpa bobot kaki
//   J     : letak sendi (sisi kiri; sisi kanan dicerminkan) — sh = bahu, el = siku, wr = pergelangan [x, y]
// ============================================================
const nm = s => s.replace(/[.:]/g, '');   // GLTFLoader membuang '.' & ':' dari nama node
const STATIC_MODELS = {
  'low_poly_archer_fantasy_pack.glb': {
    hide: ['Cube_3', 'neck_prop_4', 'arrow_7', 'arrows_9'], head: ['ears_1', 'eyes_2', 'hair_5'], backProps: true,
    J: { hipX: 0.2, hipY: 2.05, kneeY: 1.28, ankleY: 0.25, spineY: 2.6, neckY: 3.45, sh: [0.45, 3.27], el: [0.87, 2.63], wr: [1.17, 2.17] },
  },
  'low_poly_elf_mage_with_glasses_fantasy_pack.glb': {
    hide: [], shift: { torso_2: 2.05, belt_5: 2.05, CAPE_6: 2.05, face_3: 3.63, head_0: -0.12, 'Cube.001_4': -0.12, hair_7: -0.12, glasses_8: -0.12 },
    head: ['head_0', 'face_3', 'Cube.001_4', 'hair_7', 'glasses_8'], rigid: ['belt_5', 'CAPE_6'], noLeg: ['torso_2'],
    J: { hipX: 0.2, hipY: 2.1, kneeY: 1.1, ankleY: 0.25, spineY: 2.35, neckY: 3.1, sh: [0.42, 2.8], el: [0.85, 2.02], wr: [1.15, 1.56] },
  },
};

// rangka buatan: hips > (spine > head, lArm > lFore > lHand, rArm ...) + (lLeg > lShin > lFoot, rLeg ...). Semua tulang berorientasi identitas (sumbu model).
function procRig(J) {
  const pos = { hips: [0, J.hipY], spine: [0, J.spineY], head: [0, J.neckY] }, par = { spine: 'hips', head: 'spine' }, list = ['hips', 'spine', 'head'];
  for (const [s, sx] of [['l', 1], ['r', -1]]) {
    Object.assign(pos, { [s + 'Arm']: [sx * J.sh[0], J.sh[1]], [s + 'Fore']: [sx * J.el[0], J.el[1]], [s + 'Hand']: [sx * J.wr[0], J.wr[1]],
      [s + 'Leg']: [sx * J.hipX, J.hipY], [s + 'Shin']: [sx * J.hipX, J.kneeY], [s + 'Foot']: [sx * J.hipX, J.ankleY] });
    Object.assign(par, { [s + 'Arm']: 'spine', [s + 'Fore']: s + 'Arm', [s + 'Hand']: s + 'Fore', [s + 'Leg']: 'hips', [s + 'Shin']: s + 'Leg', [s + 'Foot']: s + 'Shin' });
    list.push(s + 'Arm', s + 'Fore', s + 'Hand', s + 'Leg', s + 'Shin', s + 'Foot');
  }
  const B = {};
  for (const k of list) {
    B[k] = new THREE.Bone(); B[k].name = 'P_' + k;
    const p = pos[k], q = par[k] ? pos[par[k]] : [0, 0];
    B[k].position.set(p[0] - q[0], p[1] - q[1], 0);
    if (par[k]) B[par[k]].add(B[k]);
  }
  return { B, root: B.hips, list: list.map(k => B[k]), index: Object.fromEntries(list.map((k, i) => ['P_' + k, i])) };
}

// bobot kulit tiap titik (x, y) -> sampai 4 pasang [nama tulang, bobot]. Berdasarkan letak titik terhadap sendi (lengan = jarak ke sumbu bahu-pergelangan, kaki = tinggi), dengan peralihan halus di sendi.
// -- skinWeights:begin
function skinWeights(x, y, J, noLeg) {
  const s = x >= 0 ? 'l' : 'r', ax = Math.abs(x), w = {};
  const smo = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const add = (n, v) => { if (v > 1e-4) w[n] = (w[n] || 0) + v; };
  const head = smo(J.neckY - 0.1, J.neckY + 0.12, y);
  // lengan: dekat sumbu bahu->pergelangan, di luar badan, dan di atas pinggul (atau jauh di samping)
  const [sx0, sy0] = J.sh, [ex, ey] = J.el, [wx, wy] = J.wr;
  let dx = wx - sx0, dy = wy - sy0; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
  const vx = ax - sx0, vy = y - sy0, perp = Math.abs(vx * dy - vy * dx), along = vx * dx + vy * dy, alongEl = (ex - sx0) * dx + (ey - sy0) * dy;
  const arm = (1 - smo(0.26, 0.42, perp)) * smo(sx0 - 0.02, sx0 + 0.2, ax) * Math.max(smo(J.hipY, J.hipY + 0.25, y), smo(0.7, 0.9, ax));
  const low = smo(alongEl - 0.12, alongEl + 0.12, along);
  // kaki
  const leg = noLeg ? 0 : smo(J.hipY + 0.05, J.hipY - 0.25, y) * (1 - smo(0.6, 0.8, ax));
  const tot = arm + leg + head, k = tot > 1 ? 1 / tot : 1, a = arm * k, l = leg * k, h = head * k, rest = Math.max(0, 1 - a - l - h);
  add('P_head', h);
  add('P_' + s + 'Arm', a * (1 - low)); add('P_' + s + 'Fore', a * low);
  const lw = smo(-0.07, 0.07, x), kn = smo(J.kneeY + 0.18, J.kneeY - 0.18, y), ft = 1 - smo(J.ankleY - 0.05, J.ankleY + 0.06, y);
  for (const [q, v] of [['l', lw], ['r', 1 - lw]]) {
    const lq = l * v; add('P_' + q + 'Leg', lq * (1 - kn)); add('P_' + q + 'Shin', lq * kn * (1 - ft)); add('P_' + q + 'Foot', lq * kn * ft);
  }
  const sp = smo(J.spineY - 0.25, J.spineY + 0.25, y);
  add('P_spine', rest * sp); add('P_hips', rest * (1 - sp));
  const top = Object.entries(w).sort((p, q) => q[1] - p[1]).slice(0, 4), sum = top.reduce((t, e) => t + e[1], 0) || 1;
  return top.map(([n, v]) => [n, v / sum]);
}
// -- skinWeights:end

// panah, busur, dan tempat panah di PUNGGUNG (ikut tulang punggung). bag/bow = geometri (sudah di ruang model) dari model asli.
function backProps(rig, bagGeo, bowGeo, mat) {
  const g = new THREE.Group(); g.name = 'punggung';
  // tempat panah: miring ke bahu kanan (-x); talinya melingkar ke dada (+z) jadi permukaan belakang badan (z ≈ -0.35) harus menempel di sisi depan tabungnya
  bagGeo.translate(0, -0.15, 0);   // pusat tabung ke titik asal
  const quiver = new THREE.Group(); quiver.add(new THREE.Mesh(bagGeo, mat));
  const shaftM = new THREE.MeshStandardMaterial({ color: 0xb48a55, roughness: 1 }), fl = [0xb3272d, 0xe8d8b0, 0xb3272d, 0x6f7f8f, 0xe8d8b0].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.DoubleSide }));
  const spread = [[-0.09, 0.0, 0.06, 0.03], [0.0, 0.07, -0.05, 0.0], [0.09, -0.03, 0.02, -0.05], [-0.04, -0.08, 0.0, 0.07], [0.05, 0.08, -0.02, 0.0]];   // [x, z, miring-x, miring-z]
  spread.forEach(([ox, oz, tx, tz], i) => {
    const a = new THREE.Group(), shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.15, 5), shaftM); shaft.position.y = 0.775; a.add(shaft);
    for (let j = 0; j < 3; j++) {   // bulu: tiga sirip tipis
      const vg = new THREE.BoxGeometry(0.012, 0.4, 0.16); vg.translate(0, 0, 0.09);
      const v = new THREE.Mesh(vg, fl[i]); v.position.y = 1.62; v.rotation.y = j * Math.PI * 2 / 3; a.add(v);
    }
    a.position.set(ox, 0, -0.065 + oz); a.rotation.set(tx, 0, tz); quiver.add(a);
  });
  quiver.scale.setScalar(0.85); quiver.rotation.z = 0.55; quiver.position.set(-0.05, 2.5, -0.475);
  // busur: disandang menyilang di belakang tempat panah (miring ke bahu kiri, +x), tali busur menghadap badan
  const bow = new THREE.Mesh(bowGeo, mat); bow.scale.setScalar(0.55); bow.rotation.order = 'ZYX'; bow.rotation.set(0, Math.PI, -0.55); bow.position.set(0.1, 2.6, -1.09);
  g.add(bow, quiver);
  rig.B.spine.attach(g);
}

// salinan geometri yang BENAR-BENAR terpisah (atribut GLB berbentuk interleaved bisa berbagi data dengan model cache; clone() lalu translate() bisa
// mengubah data asli & menumpuk tiap kali NPC dirakit). Matriks M (ruang model) & geseran dy diterapkan hanya pada salinan ini.
function freshGeometry(src, M, dy = 0) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name); if (!a) continue;
    const n = a.count, k = a.itemSize, arr = new Float32Array(n * k);
    for (let i = 0; i < n; i++) { arr[i * k] = a.getX(i); if (k > 1) arr[i * k + 1] = a.getY(i); if (k > 2) arr[i * k + 2] = a.getZ(i); }
    g.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  g.applyMatrix4(M); if (dy) g.translate(0, dy, 0);
  return g;
}

function assembleStatic(model, cfg) {
  model.updateMatrixWorld(true);
  const inv = model.matrixWorld.clone().invert(), parts = [];
  model.traverse(o => { if (o.isMesh) parts.push({ name: o.parent && o.parent !== model ? o.parent.name : o.name, mesh: o }); });
  const hide = new Set(cfg.hide.map(nm)), head = new Set((cfg.head || []).map(nm)), rigid = new Set((cfg.rigid || []).map(nm)), noLeg = new Set((cfg.noLeg || []).map(nm));
  const shift = Object.fromEntries(Object.entries(cfg.shift || {}).map(([k, v]) => [nm(k), v]));
  const rig = procRig(cfg.J); model.add(rig.root); model.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(rig.list);
  let bag = null, bow = null;
  for (const { name, mesh } of parts) {
    const holderNode = mesh.parent; mesh.removeFromParent(); if (holderNode && holderNode !== model) holderNode.removeFromParent();
    if (hide.has(name)) continue;
    const g = freshGeometry(mesh.geometry, inv.clone().multiply(mesh.matrixWorld), shift[name] || 0);
    if (cfg.backProps && name === nm('arrow_bag_8')) { bag = { g, m: mesh.material }; continue; }
    if (cfg.backProps && name === nm('bow_6')) { bow = { g, m: mesh.material }; continue; }
    if (head.has(name) || rigid.has(name)) { const m = new THREE.Mesh(g, mesh.material); m.name = name; model.add(m); model.updateMatrixWorld(true); (head.has(name) ? rig.B.head : rig.B.hips).attach(m); continue; }
    const pos = g.attributes.position, n = pos.count, idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const r = skinWeights(pos.getX(i), pos.getY(i), cfg.J, noLeg.has(name));
      r.forEach(([bn, v], j) => { idx[i * 4 + j] = rig.index[bn]; wt[i * 4 + j] = v; });
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    const skinned = new THREE.SkinnedMesh(g, mesh.material); skinned.name = name; model.add(skinned); model.updateMatrixWorld(true); skinned.bind(skel);
  }
  if (bag && bow) { model.updateMatrixWorld(true); backProps(rig, bag.g, bow.g, bag.m); }
  model.updateMatrixWorld(true);
}

export function loadMerchantGlb(defs, onNpc) {
  const byUrl = new Map();
  for (const d of defs) { const u = d.model || 'rigged_character_low_poly.glb'; if (!byUrl.has(u)) byUrl.set(u, []); byUrl.get(u).push(d); }

  // safe = mode aman (tanpa rakit ulang / rangka buatan / tulang kaki): dipakai bila perakitan penuh melempar error, supaya NPC tetap muncul & NPC lain tidak ikut macet
  function build(gltf, def, safe) {
    const model = cloneSkinned(gltf.scene), holder = new THREE.Group(), isStatic = def.rig === 'static', cfg = isStatic && !safe ? STATIC_MODELS[def.model] : null;
    const body = new THREE.Group(); body.add(model); holder.add(body);   // body = akar animasi model tanpa tulang
    const H = def.height || 1.75;
    model.updateMatrixWorld(true);   // WAJIB sebelum mengukur: matriks tulang klon belum dihitung (tulang yang dikunjungi setelah mesh akan terbaca identitas -> tinggi salah)
    if (def.rig === 'rigify') rigifyHierarchy(model, !safe);   // sambung lagi rantai tulang lengan, kaki & pedang (lihat penjelasan di atas)
    if (cfg) assembleStatic(model, cfg);                       // rakit ulang model tanpa tulang + rangka buatan (lihat STATIC_MODELS)
    const box = new THREE.Box3().setFromObject(model, true), h = box.max.y - box.min.y;
    const s = h > 0.01 ? H / h : 0.167; model.scale.setScalar(s); model.position.y = -box.min.y * s;      // kaki di y = 0, tinggi H
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; o.material = Array.isArray(o.material) ? o.material.map(lit) : lit(o.material); } });
    const oldStatic = isStatic && !cfg;   // static tanpa konfigurasi (mis. low_poly_boy.glb): animasi lama pada grup `body`
    const mixer = new THREE.AnimationMixer(oldStatic ? body : model);
    let clips = null;
    try { clips = oldStatic ? staticClips() : buildClips(model, isStatic ? 'proc' : (def.rig || 'mixamo'), def.pose === 'natural', H, safe); }
    catch (e) { console.error('Animasi ' + def.name + ' gagal dibuat', e); }
    let idle, greet = null, walk = null;
    if (clips) { idle = mixer.clipAction(clips.idle); greet = mixer.clipAction(clips.greet); walk = clips.walk ? mixer.clipAction(clips.walk) : null; }
    else idle = mixer.clipAction(new THREE.AnimationClip('idle', 1, []));   // rangka tak dikenali: tetap tampil (pose T)
    if (def.yawOff) model.rotation.y = def.yawOff;   // koreksi arah depan model (rad) bila modelnya tidak menghadap +z
    return { holder, mixer, idle, walk: walk || idle, greet, greetDur: clips ? clips.greetDur : 0, headY: H + 0.1 };
  }

  for (const [url, list] of byUrl) loadGltf(url).then(gltf => {
    for (const def of list) {
      let n = null;
      try { n = build(gltf, def, false); }
      catch (e) {
        console.error('NPC ' + def.name + ' (' + url + ') gagal dirakit, memakai mode aman', e);
        try { n = build(gltf, def, true); } catch (e2) { console.error('NPC ' + def.name + ' tetap gagal', e2); }
      }
      if (n) onNpc(def, n);
    }
  }).catch(e => console.warn(url + ' gagal dimuat', e));
}
