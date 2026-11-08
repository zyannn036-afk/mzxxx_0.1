import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PRAJURIT_MODELS } from './kekaisaran-istana-layout.js';

// ============================================================
//  KSATRIA KOTA KEKAISARAN (Distrik 1 — Military Quarter)
//  Pemuat model ksatria (FBX / GLB, folder prajurit/ — model yang SAMA dengan penjaga Aula Raja; daftar berkas & tinggi ada di PRAJURIT_MODELS pada
//  kekaisaran-istana-layout.js) untuk sistem warga kekaisaran-npc.js. Antarmukanya sama dengan loadCityHumans / loadVillagers:  loadKnights(defs, onNpc)
//  lalu onNpc(def, n) dipanggil tiap model siap, dengan n = { holder, mixer, idle, walk, greet, greetDur, headY } — sehingga ksatria otomatis ikut semua
//  fitur warga: dimuat saat pemain mendekat, dilepas saat jauh, animasi bertingkat, bayangan dekat, label nama & dialog "Mengobrol".
//
//  Model-model ini tidak punya klip animasi: "idle" dibuat lewat kode: napas (+ napas dalam sesekali), berat badan bergeser, tolehan kecil, dan "kegiatan sendiri" sesekali (melirik kiri-kanan, mengayun tangan, menunduk). Atur di IDLE.
//  Tiap model dimuat SEKALI (templat, dibagi antar-distrik), lalu dikloning per ksatria (SkeletonUtils.clone: rangka terpisah, geometri & tekstur dibagi).
// ============================================================

// Pengaturan gerak diam ksatria (ubah angkanya bila terlalu kecil / besar; 0 = gerakan itu mati)
const IDLE = {
  breathe: 0.012, bob: 0.008,       // napas: ayun tulang punggung (rad) & naik-turun badan (m)
  deepBreath: 2.2,                  // napas dalam sesekali: napas jadi sebesar ini kali lipat
  roll: 0.014, shiftX: 0.012,       // berat badan bergeser: badan miring (rad) & bergeser ke samping (m)
  headYaw: 0.65, headPitch: 0.09,   // menoleh kiri-kanan (rad, 0.65 = sekitar 37 derajat) & sedikit mendongak / menunduk
  bodyYaw: 0.1,                     // badan ikut berputar sedikit saat menoleh (rad)
  noHeadYaw: 0.22,                  // bila model tidak punya tulang kepala: seluruh badan yang berputar pelan (rad)
  lookEvery: [2.5, 6.5],            // jeda antar tolehan (detik)
  // "Kegiatan sendiri": tiap beberapa detik ksatria melakukan satu hal (melirik kiri-kanan / mengayun tangan / menunduk), lalu diam lagi
  actEvery: [5, 12],                // jeda antar kegiatan (detik)
  scanHead: 0.9, scanBody: 0.3,     // melirik kiri-kanan dengan jelas: sudut kepala+leher & badan (rad; 0.9 = sekitar 50 derajat)
  arm: 0.3, armSway: 0.02,          // ayun tangan (rad; 0.3 = sekitar 17 derajat; 0 = lengan tidak pernah bergerak) & goyang lengan halus saat bernapas
  lookDown: 0.35,                   // menunduk melihat tanah (rad)
};
// id model yang lengannya JANGAN digerakkan (mis. memegang senjata / perisai dengan pose khusus). Bisa juga dimatikan di PRAJURIT_MODELS dengan arms: false
const ARMS_OFF = [];
const rnd = (a, b) => a + Math.random() * (b - a);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0), FWD = new THREE.Vector3(0, 0, 1), _p = new THREE.Vector3(), _p2 = new THREE.Vector3();

// cari tulang berdasarkan akhiran namanya (mis. "mixamorigHead" / "Head" / "Bip001_Head"); null bila tidak ada
const findBone = (root, re) => { let f = null; root.traverse(o => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; };

// Sumbu putar tiap tulang beda-beda antar model. Jadi kita cek: sumbu lokal mana yang searah dengan arah "dunia" yang kita mau (atas = menoleh, samping = mengangguk).
// skip = nomor sumbu yang sudah dipakai (0 = x, 1 = y, 2 = z). Hasil: { i: nomor sumbu, s: tanda + / - }
function pickAxis(bone, world, skip) {
  bone.getWorldQuaternion(_q); let best = 0, bd = 0;
  for (let i = 0; i < 3; i++) {
    if (i === skip) continue;
    const d = _v.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(_q).dot(world);
    if (Math.abs(d) > Math.abs(bd)) { bd = d; best = i; }
  }
  return { i: best, s: bd < 0 ? -1 : 1 };
}
const axisVec = a => new THREE.Vector3().setComponent(a.i, a.s);

// siapkan satu tulang untuk digerakkan: simpan posisi awal (q0) + sumbu menoleh (yaw) & mengangguk (pitch)
function rig(bone) {
  if (!bone) return null;
  const y = pickAxis(bone, UP, -1), p = pickAxis(bone, SIDE, y.i);
  return { b: bone, q0: bone.quaternion.clone(), yaw: axisVec(y), pitch: axisVec(p) };
}
// ---- lengan ----
// cari tulang lengan ATAS sisi 'L' / 'R' dari namanya (Mixamo: LeftArm; lainnya: upper_arm.L, Bip001_L_UpperArm, dst.); lengan bawah, tangan, bahu, jari dilewati
const SIDE_RE = { L: /left|(^|[^a-z])l([^a-z]|$)/, R: /right|(^|[^a-z])r([^a-z]|$)/ };
const findArm = (root, side) => {
  let f = null;
  root.traverse(o => {
    if (f || !o.isBone) return; const n = (o.name || '').toLowerCase();
    if (/fore|lower|hand|twist|roll|shoulder|clav|finger|thumb|index|middle|ring|pinky/.test(n)) return;
    if (/upper[_.\s]?arm|arm$|(^|[^a-z])arm([^a-z]|$)/.test(n) && SIDE_RE[side].test(n)) f = o;
  });
  return f;
};
// senjata yang TIDAK menempel ke tulang (benda terpisah) akan tertinggal bila lengan diayun: kalau ada, lengan tidak digerakkan
const WEAPON = /spear|sword|lance|axe|shield|halberd|mace|bow|weapon|tombak|pedang|perisai|senjata/i;
const weaponLoose = root => {
  let loose = false;
  root.traverse(o => {
    if (loose || !o.isMesh || o.isSkinnedMesh || !WEAPON.test(o.name || '')) return;
    let p = o.parent, onBone = false; while (p) { if (p.isBone) { onBone = true; break; } p = p.parent; }
    if (!onBone) loose = true;
  });
  return loose;
};
// siapkan lengan: sumbu ayun = tegak lurus arah lengan & arah depan, supaya sudut POSITIF selalu mengayun ujung lengan ke DEPAN (benar untuk lengan turun maupun pose T)
function rigArm(bone) {
  if (!bone) return null;
  const kid = bone.children.find(c => c.isBone); if (!kid) return null;               // butuh tulang siku untuk tahu arah lengan
  bone.getWorldPosition(_p); kid.getWorldPosition(_p2); _p2.sub(_p).normalize();       // arah lengan di dunia
  _v.copy(_p2).cross(FWD); if (_v.lengthSq() < 1e-4) return null; _v.normalize();      // lengan menunjuk lurus ke depan: tidak bisa diayun maju-mundur
  bone.getWorldQuaternion(_q); _v.applyQuaternion(_q.invert());                         // ubah ke ruang lokal tulang
  return { b: bone, q0: bone.quaternion.clone(), axis: _v.clone() };
}
const swingArm = (r, ang) => { if (r) r.b.quaternion.copy(r.q0).multiply(_q.setFromAxisAngle(r.axis, ang)); };
// putar tulang dari posisi awalnya: yaw = menoleh, pitch = mengangguk (radian)
const turn = (r, yaw, pitch) => r.b.quaternion.copy(r.q0).multiply(_q.setFromAxisAngle(r.yaw, yaw)).multiply(_q2.setFromAxisAngle(r.pitch, pitch));
const tpl = {};                               // id model -> { st: 0 | 1 memuat | 2 siap | -1 gagal, root, waiters: [] }

// normalkan ukuran ke spec.h, tengah di sumbu, telapak di y = 0; atur bahan (tanpa glow: ini di luar ruangan, bukan interior gelap)
function prep(obj, spec) {
  const holder = new THREE.Group(); holder.add(obj); holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder, true), h = box.max.y - box.min.y;
  if (!(h > 1e-4) || !isFinite(h)) throw new Error('ukuran model tidak valid');
  obj.scale.multiplyScalar(spec.h / h); holder.updateMatrixWorld(true);
  box.setFromObject(holder, true); const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y; holder.updateMatrixWorld(true);
  holder.traverse(o => {
    if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = false;
    if (o.isSkinnedMesh) o.frustumCulled = false;                                   // batas FBX berkulit sering salah; sistem warga sudah menyaring lewat jarak & layar
    for (const m of [].concat(o.material)) {
      if (!m) continue;
      if (m.map && spec.pixel) { m.map.magFilter = m.map.minFilter = THREE.NearestFilter; m.map.generateMipmaps = false; m.map.needsUpdate = true; }   // palet warna: tanpa blur
      if (spec.double) m.side = THREE.DoubleSide;                                   // jubah / bulu berupa bidang tipis
      if (/feather|bulu/i.test((m.name || '') + ' ' + ((m.map && m.map.name) || ''))) { m.transparent = true; m.alphaTest = 0.4; m.depthWrite = true; }
      m.needsUpdate = true;
    }
  });
  return holder;
}

function load(id) {
  const t = tpl[id] || (tpl[id] = { st: 0, root: null, waiters: [] });
  if (t.st) return t; t.st = 1;
  const spec = PRAJURIT_MODELS[id], mgr = new THREE.LoadingManager();
  // rujukan tekstur di dalam FBX sering berupa jalur Windows / nama berbeda: ambil nama berkasnya saja, spasi -> garis bawah, arahkan ke folder tekstur model
  mgr.setURLModifier(u => {
    if (!/\.(png|jpe?g|webp)(\?.*)?$/i.test(u) || /^(data|blob):/i.test(u)) return u;
    let f = u.split(/[\\/]/).pop().split('?')[0]; try { f = decodeURIComponent(f); } catch (e) { }
    return spec.tex + encodeURIComponent(f.replace(/ /g, '_'));
  });
  const done = obj => {
    try { t.root = prep(obj, spec); t.st = 2; } catch (e) { t.st = -1; console.warn('Ksatria ' + id + ' gagal dipasang:', e); }
    const w = t.waiters.splice(0); if (t.st === 2) for (const f of w) f(t);
  }, fail = e => { t.st = -1; t.waiters.length = 0; console.warn(spec.file + ' gagal dimuat:', e); };
  if (/\.(glb|gltf)$/i.test(spec.file)) new GLTFLoader(mgr).load(spec.file, g => done(g.scene), undefined, fail);
  else new FBXLoader(mgr).load(spec.file, done, undefined, fail);
  return t;
}

// aksi "palsu" agar kode warga (idle.play(), crossFadeTo, dll.) tetap jalan tanpa klip sungguhan
const fakeAction = () => { const a = { time: 0, play() { return a; }, reset() { return a; }, setEffectiveWeight() { return a; }, crossFadeTo() { return a; }, getClip: () => ({ duration: 1 }) }; return a; };

function make(def, t) {
  const spec = PRAJURIT_MODELS[def.model], m = cloneSkinned(t.root), holder = new THREE.Group();
  m.rotation.order = 'ZYX';                                                        // miring (z) dihitung paling akhir: badan selalu miring ke SAMPING, apa pun arah hadap model
  m.rotation.y = spec.yaw || 0; holder.add(m);                                     // yaw tambahan bila model aslinya tidak menghadap +z
  const yaw0 = m.rotation.y, sp = m.getObjectByName('Spine2') || m.getObjectByName('Spine1'), sx = sp ? sp.rotation.x : 0;
  const ph = Math.random() * 6.283, ph2 = Math.random() * 6.283;                   // fase acak: tiap ksatria bergerak tidak serempak
  holder.updateMatrixWorld(true);
  const head = rig(findBone(m, /head$/i)), neck = rig(findBone(m, /neck\d?$/i));    // null bila model tidak punya tulang itu
  // lengan hanya digerakkan bila aman: tidak dimatikan lewat pengaturan & tidak ada senjata lepas
  const armsOk = IDLE.arm > 0 && spec.arms !== false && !ARMS_OFF.includes(def.model) && !weaponLoose(m);
  const armL = armsOk ? rigArm(findArm(m, 'L')) : null, armR = armsOk ? rigArm(findArm(m, 'R')) : null;
  let tt = 0, deep = 0, deepAt = rnd(5, 12), lookAt = rnd(0.5, 4), tx = 0, tp = 0, gx = 0, gp = 0;
  let act = null, actT = 0, actD = 1, actNext = rnd(3, 8);                         // act = kegiatan sendiri yang sedang berjalan: 'scan' | 'arms' | 'down' | null
  const acts = armL || armR ? ['scan', 'arms', 'down'] : ['scan', 'down'];         // tanpa lengan yang bisa digerakkan: tidak ada kegiatan ayun tangan
  const idle = fakeAction();
  return {
    holder, idle, walk: idle, greet: null, greetDur: 0, headY: spec.h,
    mixer: { update(dt) {
      dt = Math.min(dt, 0.1); tt += dt;
      // 1) napas, sesekali napas dalam
      if (tt >= deepAt) { deep = 1; deepAt = tt + rnd(8, 16); }
      deep = Math.max(0, deep - dt / 1.8);
      const amp = 1 + (IDLE.deepBreath - 1) * Math.sin(Math.PI * deep), s = Math.sin(tt * 1.6 + ph);
      if (sp && IDLE.breathe) sp.rotation.x = sx + IDLE.breathe * amp * s;
      m.position.y = IDLE.bob * amp * (0.5 + 0.5 * s);
      // 2) berat badan bergeser pelan ke kiri-kanan (dua gelombang lambat digabung supaya tidak terasa berulang)
      const w = 0.7 * Math.sin(tt * 0.55 + ph2) + 0.3 * Math.sin(tt * 0.23 + ph);
      m.rotation.z = IDLE.roll * w; m.position.x = IDLE.shiftX * w;
      // 3) kegiatan sendiri: mulai satu kegiatan tiap beberapa detik, jalan sampai selesai (p = kemajuan 0..1, env = naik-turun halus 0..1..0)
      if (!act && tt >= actNext) { act = acts[Math.floor(Math.random() * acts.length)]; actT = 0; actD = act === 'scan' ? 5.5 : act === 'arms' ? 4.5 : 2.6; tx = 0; tp = 0; }
      let ay = 0, ap = 0, aw = 0;                                                  // ay = melirik kiri-kanan (-1..1), ap = menunduk (0..1), aw = ayun tangan (-1..1)
      if (act) {
        actT += dt; const p = Math.min(1, actT / actD), env = Math.sin(Math.PI * p);
        if (act === 'scan') ay = Math.sin(2 * Math.PI * p);                        // lihat ke satu sisi, lalu ke sisi lain, lalu kembali lurus
        else if (act === 'arms') aw = env * Math.sin(2 * Math.PI * 0.7 * actT);   // kedua tangan berayun bergantian (maju-mundur), makin pelan di awal & akhir
        else ap = env;                                                             // menunduk lalu kembali
        if (p >= 1) { act = null; actNext = tt + rnd(IDLE.actEvery[0], IDLE.actEvery[1]); }
      }
      // 4) tolehan kecil acak (hanya saat tidak ada kegiatan): tiap beberapa detik pilih arah lihat baru (30% kembali lurus), lalu beralih pelan ke arah itu
      if (!act && tt >= lookAt) { lookAt = tt + rnd(IDLE.lookEvery[0], IDLE.lookEvery[1]); if (Math.random() < 0.3) { tx = 0; tp = 0; } else { tx = rnd(-1, 1); tp = rnd(-1, 1); } }
      const k = 1 - Math.exp(-dt * 2.2); gx += (tx - gx) * k; gp += (tp - gp) * k;
      if (head) {                                                                  // punya rangka: kepala menoleh, leher & badan ikut sedikit
        const hy = IDLE.headYaw * gx + IDLE.scanHead * ay;
        turn(head, hy * (neck ? 0.7 : 1), IDLE.headPitch * gp + IDLE.lookDown * ap);
        if (neck) turn(neck, hy * 0.3, 0);
        m.rotation.y = yaw0 + IDLE.bodyYaw * gx + IDLE.scanBody * ay;
      } else m.rotation.y = yaw0 + IDLE.noHeadYaw * gx + IDLE.scanBody * 1.5 * ay; // tanpa rangka: seluruh badan berputar pelan
      // 5) lengan: goyang halus mengikuti napas + ayun tangan saat kegiatan 'arms' (kiri & kanan berlawanan arah)
      const sw = IDLE.armSway * s; swingArm(armL, sw + IDLE.arm * aw); swingArm(armR, sw - IDLE.arm * aw);
    } },
  };
}

// defs: daftar { model, ... } (model = kunci di PRAJURIT_MODELS); onNpc(def, n) dipanggil tiap ksatria siap
export function loadKnights(defs, onNpc) {
  for (const def of defs) {
    if (!PRAJURIT_MODELS[def.model]) { console.warn('Model ksatria tidak dikenal:', def.model); continue; }
    const t = load(def.model), go = tt => { try { onNpc(def, make(def, tt)); } catch (e) { console.warn('Ksatria ' + def.name + ' gagal dipasang:', e); } };
    if (t.st === 2) go(t); else if (t.st === 1) t.waiters.push(go);
  }
}
