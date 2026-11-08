// ============================================================================
//  mutan-anim.js — animasi untuk bos Mutan (monster.glb), dibuat lewat KODE (prosedural)
// ----------------------------------------------------------------------------
//  Kenapa begini? monster.glb cuma punya 1 klip animasi (meraung). Kerangkanya standar Mixamo
//  (Hips, Spine, Arm, Leg, dst.) dan posisi awalnya T-pose, jadi tulangnya bisa kita putar sendiri
//  lewat kode untuk membuat gerakan: berdiri, jalan, cakar, seruduk, hantam tanah, raungan, kena pukul, mati.
//
//  Cara pakai (sudah dipasang di game.js):
//     const rig = createMutantRig(THREE, root);       // root = model Mutan hasil clone
//     rig.update(dt, { mode, p, side, speed, flinch }); // dipanggil tiap frame
//
//  mode  : 'idle' | 'swing' | 'tele' | 'dash' | 'jump' | 'slam' | 'roar' | 'skid' | 'die'   (jump = loncat sebelum menghantam, slam = pose saat tangan menancap di tanah)
//  p     : kemajuan gerakan 0..1 (dipakai swing, tele, slam, roar, die)
//  side  : 1 = cakar pakai tangan kiri, -1 = tangan kanan (khusus swing)
//  speed : kecepatan jalan monster (m/detik) -> kaki & tangan mengayun otomatis
//  flinch: 1 = baru kena pukul (badan tersentak ke belakang)
//
//  Aturan arah (model menghadap +z, tangan KIRI ada di sisi +x):
//     "maju" selalu angka positif. Contoh: spX positif = badan condong ke depan,
//     aSwing positif = lengan terayun ke depan (π/2 = lurus ke depan, π = lurus ke atas).
// ============================================================================

// Daftar "tombol" pose. Semuanya satuan radian. Nilai tiap tombol dihaluskan (smoothing) supaya gerakan mulus.
const NAMES = [
  'spX', 'spY', 'spZ',            // badan: condong depan / putar kiri-kanan / miring
  'neckX', 'headX', 'headY',      // leher & kepala: menunduk(+) / menoleh
  'hipsYaw', 'hipsRoll',          // pinggul: putar / miring
  'aHangL', 'aSwingL', 'aSweepL', 'aElbowL',   // lengan kiri: turun dari T-pose / ayun depan / sapuan datar / tekuk siku
  'aHangR', 'aSwingR', 'aSweepR', 'aElbowR',   // lengan kanan
  'fwdL', 'kneeL', 'fwdR', 'kneeR',            // kaki: paha maju / lutut tekuk
];

// Pose berdiri "monster berat": badan condong, lengan menggantung lebar, kaki berselang
const IDLE = {
  spX: 0.28, neckX: 0.1, headX: 0.12,
  aHangL: 1.15, aSwingL: 0.15, aElbowL: 0.55, aHangR: 1.15, aSwingR: 0.15, aElbowR: 0.55,
  fwdL: 0.32, kneeL: 0.64, fwdR: -0.1, kneeR: 0.3,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };   // 0..1 halus (pelan di awal & akhir)
const mkPose = o => { const t = {}; for (const n of NAMES) t[n] = o[n] || 0; return t; };

// Gabungkan dua pose: a (1-k) + b (k)
function mixPose(a, b, k) { const t = {}; for (const n of NAMES) t[n] = a[n] + (b[n] - a[n]) * k; return t; }

// Atur lengan sekaligus: [hang, swing, sweep, elbow]
function arms(o, L, R) {
  [o.aHangL, o.aSwingL, o.aSweepL, o.aElbowL] = L;
  [o.aHangR, o.aSwingR, o.aSweepR, o.aElbowR] = R || L;
}
// Atur kaki sekaligus: [paha kiri, lutut kiri, paha kanan, lutut kanan]
function legs(o, a, b, c, d) { o.fwdL = a; o.kneeL = b; o.fwdR = c; o.kneeR = d; }

// ---------- Pose per gerakan ----------
function poseFor(st, t, phase) {
  const o = { ...IDLE };
  const p = clamp(st.p || 0, 0, 1);

  switch (st.mode) {
    case 'swing': {   // CAKAR: tarik tangan ke belakang (aba-aba), lalu sapu ke depan dengan cepat. side 1 = kiri, -1 = kanan
      const s = st.side || 1, strike = p >= 0.8, u = ease(p / 0.8);
      const mine = [0.3, 0.05, strike ? 1.7 : -0.9 * u, 0.25], guard = [1.0, 0.6, 0, 1.2];   // tangan yang menyerang / tangan penjaga
      if (s > 0) arms(o, mine, guard); else arms(o, guard, mine);
      o.spY = strike ? -0.85 * s : 0.75 * s * u;        // badan memutar ke belakang lalu menghantam ke depan
      o.spX = strike ? 0.6 : 0.2 + 0.1 * u;
      o.headY = -o.spY * 0.6; o.neckX = 0.15; o.headX = 0.15;
      const lead = strike ? 0.75 : 0.35, rear = strike ? -0.35 : 0.3;   // melangkah maju saat memukul (kaki yang melangkah = kebalikan tangan)
      if (s > 0) legs(o, rear, strike ? 0.4 : 0.7, lead, strike ? 1.15 : 0.75); else legs(o, lead, strike ? 1.15 : 0.75, rear, strike ? 0.4 : 0.7);
      break;
    }
    case 'tele': {    // ABA-ABA SERUDUK: menunduk, merendah, mengais tanah dengan kaki, tangan ditarik ke belakang
      const u = ease(p / 0.3);
      arms(o, [1.2, -0.6 * u, 0, 0.2]);
      o.spX = 0.28 + 0.4 * u; o.neckX = 0.1 + 0.4 * u; o.headX = 0.12 + 0.2 * u;
      legs(o, 0.8 * u + 0.32 * (1 - u), 1.5 * u + 0.64 * (1 - u), 0.2 + 0.45 * Math.sin(p * 26) * u, 0.9 * u);   // kaki kanan mengais
      o.hipsYaw = 0.05 * Math.sin(p * 55) * u;    // badan gemetar menahan tenaga
      break;
    }
    case 'dash': {    // SERUDUK: lari condong ke depan, lengan ke belakang, kaki berlari cepat
      const s = Math.sin(phase), s2 = Math.sin(phase + Math.PI);
      o.spX = 1.0; o.neckX = 0.5; o.headX = -0.6; o.spY = 0.12 * s;
      arms(o, [0.95, -1.2 + 0.25 * s2, 0, 0.3], [0.95, -1.2 + 0.25 * s, 0, 0.3]);
      legs(o, 0.1 + 0.95 * s, 0.3 + 1.2 * Math.max(0, Math.cos(phase)), 0.1 + 0.95 * s2, 0.3 + 1.2 * Math.max(0, Math.cos(phase + Math.PI)));
      break;
    }
    case 'skid': {    // SETELAH SERUDUK: mengerem, badan tertarik ke belakang, kaki menahan
      arms(o, [0.9, 0.8, 0, 0.5]);
      o.spX = -0.1; o.neckX = 0.2; o.headX = -0.1;
      legs(o, 0.7, 1.0, 0.45, 0.8);
      break;
    }
    case 'jump': {    // LONCAT: jongkok mengumpulkan tenaga -> melompat dengan tangan ke atas -> turun, badan condong siap menghantam
      if (p < 0.35) {
        const u = ease(p / 0.35), a = 0.32 + 0.6 * u, k = 0.64 + 1.2 * u;
        arms(o, [1.3, 0.15 - 1.05 * u, 0, 0.3]);
        o.spX = 0.28 + 0.5 * u; o.neckX = 0.1 + 0.3 * u; o.headX = 0.12 + 0.1 * u;
        legs(o, a, k, a, k);
      } else if (p < 0.85) {   // naik & melayang
        arms(o, [1.4, 2.8, 0, 0.5]);
        o.spX = -0.25; o.neckX = -0.2; o.headX = -0.25;
        legs(o, 0.15, 0.3, 0.15, 0.3);
      } else {                 // turun
        arms(o, [1.4, 1.3, 0, 0.2]);
        o.spX = 0.65; o.neckX = 0.4; o.headX = 0.25;
        legs(o, 0.5, 1.0, 0.5, 1.0);
      }
      break;
    }
    case 'slam': {    // HANTAMAN TANAH (pose tangan menancap setelah mendarat): berdiri tegak & angkat kedua tangan tinggi, lalu banting ke bawah sambil merendah
      const strike = p >= 0.78, u = ease(p / 0.78);
      if (strike) {
        arms(o, [1.4, 0.9, 0, 0.15]);
        o.spX = 0.95; o.neckX = 0.6; o.headX = 0.3;
        legs(o, 0.85, 1.7, 0.85, 1.7);
      } else {
        arms(o, [1.4, 3.0 * u + 0.15 * (1 - u), 0, 0.7 * u + 0.55 * (1 - u)]);
        o.spX = 0.28 - 0.78 * u; o.neckX = 0.1 - 0.4 * u; o.headX = 0.12 - 0.3 * u;
        legs(o, 0.32 * (1 - u) + 0.12 * u, 0.64 * (1 - u) + 0.24 * u, 0.32 * (1 - u) + 0.12 * u, 0.64 * (1 - u) + 0.24 * u);   // berdiri menjulang
      }
      break;
    }
    case 'roar': {    // RAUNGAN PEMBUKA: menarik napas (condong), lalu menengadah & merentangkan tangan
      const inhale = ease(p / 0.25), rear = ease((p - 0.25) / 0.2) * (1 - ease((p - 0.85) / 0.15));
      arms(o, [0.7 + 0.45 * (1 - rear), 0.4 * rear + 0.15 * (1 - rear), -0.7 * rear, 0.3 + 0.25 * (1 - rear)]);
      o.spX = 0.28 + 0.25 * inhale * (1 - rear) - 0.75 * rear; o.neckX = 0.1 - 0.4 * rear; o.headX = 0.12 - 0.55 * rear;
      legs(o, 0.4, 0.8, 0.1, 0.4);
      o.hipsYaw = 0.025 * Math.sin(p * 70) * rear;
      break;
    }
    case 'die': {     // MATI: lutut menekuk, badan & kepala terkulai ke depan, lengan lemas
      const u = ease(p);
      arms(o, [1.5, 0.3 * u, 0, 0.4]);
      o.spX = 0.28 + 0.65 * u; o.neckX = 0.1 + 0.5 * u; o.headX = 0.12 + 0.4 * u; o.spZ = 0.15 * u;
      legs(o, 0.32 + 0.98 * u, 0.64 + 1.96 * u, -0.1 + 0.6 * u, 0.3 + 1.4 * u);
      break;
    }
    default: {        // 'idle' (diam / jalan: dicampur dengan siklus jalan sesuai kecepatan)
      const br = Math.sin(t * 2.2);   // napas
      o.spX += br * 0.025; o.neckX -= br * 0.02; o.aSwingL += br * 0.04; o.aSwingR += br * 0.04;
      const w = clamp(st.walk || 0, 0, 1);
      if (w > 0.001) {
        const s = Math.sin(phase), s2 = Math.sin(phase + Math.PI), W = { ...IDLE };
        W.spX = 0.32; W.spY = 0.22 * s; W.headY = -0.12 * s;
        W.fwdL = 0.1 + 0.6 * s; W.fwdR = 0.1 + 0.6 * s2;
        W.kneeL = 0.12 + 0.95 * Math.max(0, Math.cos(phase)); W.kneeR = 0.12 + 0.95 * Math.max(0, Math.cos(phase + Math.PI));
        arms(W, [1.1, 0.15 + 0.5 * s2, 0, 0.65], [1.1, 0.15 + 0.5 * s, 0, 0.65]);
        Object.assign(o, mixPose(mkPose(o), mkPose(W), w));   // campur pose diam & jalan sesuai kecepatan
      }
    }
  }
  if (st.flinch) { o.spX -= 0.35; o.neckX -= 0.2; o.headX -= 0.15; o.aSwingL += 0.3; o.aSwingR += 0.3; }   // tersentak saat kena pukul
  return mkPose(o);
}

// Seberapa cepat pose menyusul target (makin besar = makin cepat/tajam)
function rateFor(st) {
  const p = st.p || 0;
  let r = 9;
  if (st.mode === 'swing') r = p >= 0.8 ? 30 : 7;
  else if (st.mode === 'slam') r = p >= 0.78 ? 34 : 6;
  else if (st.mode === 'jump') r = p < 0.35 ? 8 : p < 0.5 ? 26 : p < 0.85 ? 12 : 20;
  else if (st.mode === 'roar') r = 5;
  else if (st.mode === 'die') r = 4;
  else if (st.mode === 'skid') r = 14;
  if (st.flinch) r = Math.max(r, 18);
  return r;
}

// ---------- Rig ----------
export function createMutantRig(THREE, root) {
  // 1) Cari tulang berdasarkan nama ("Mutant:Hips_01", "mixamorig:Hips_01", atau versi tanpa titik dua -> "Hips")
  const B = {};
  root.traverse(o => {
    if (!o.isBone) return;
    const k = o.name.replace(/^(Mutant|mixamorig):?/, '').replace(/_\d+$/, '');
    if (!(k in B)) B[k] = o;
  });
  for (const k of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']) {
    if (!B[k]) { console.warn('Mutan: tulang "' + k + '" tidak ditemukan — animasi prosedural dimatikan'); return null; }
  }

  // 2) Simpan pose awal (T-pose) tiap tulang
  const rest = {};
  // Arah sumbu putar tiap tulang di file model bisa berbeda-beda (ada yang terbalik/miring). Supaya semua gerakan di bawah
  // tetap pakai arah dunia yang sama (x = kiri, y = atas, z = depan), putaran tiap tulang "diterjemahkan" lewat orientasi awalnya (w).
  const worldRest = b => { const q = new THREE.Quaternion(), chain = []; for (let o = b; o && o !== root; o = o.parent) chain.push(o); for (let i = chain.length - 1; i >= 0; i--) q.multiply(chain[i].quaternion); return q; };
  for (const k in B) { const w = worldRest(B[k]); rest[k] = { p: B[k].position.clone(), q: B[k].quaternion.clone(), w, wInv: w.clone().conjugate() }; }

  // 3) Ukuran kaki (satuan model) -> dipakai untuk menjaga telapak tetap di tanah saat badan merendah
  const hipJ = Math.abs(rest.LeftUpLeg.p.y), L1 = Math.abs(rest.LeftLeg.p.y), L2 = Math.abs(rest.LeftFoot.p.y);
  const footY0 = rest.Hips.p.y - hipJ - L1 - L2;   // tinggi sendi telapak dari tanah saat T-pose
  const H = (f, k) => L1 * Math.cos(f) + L2 * Math.cos(f - k);   // jarak vertikal pinggul -> telapak (f = paha maju, k = lutut)

  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
  const Rx = (q, a) => q.setFromAxisAngle(AX, a), Ry = (q, a) => q.setFromAxisAngle(AY, a), Rz = (q, a) => q.setFromAxisAngle(AZ, a);
  const set = (key, q) => { const r = rest[key]; B[key].quaternion.copy(r.q).multiply(r.wInv).multiply(q).multiply(r.w); };   // q = putaran dalam arah dunia

  const cur = mkPose({ ...IDLE });   // pose saat ini (dihaluskan menuju target)
  let t = 0, phase = 0, spd = 0;

  function apply(c) {
    // Pinggul: tingginya mengikuti kaki (otomatis merunduk waktu lutut ditekuk)
    const hl = H(c.fwdL, c.kneeL), hr = H(c.fwdR, c.kneeR);
    B.Hips.position.set(rest.Hips.p.x, footY0 + hipJ + Math.max(hl, hr), rest.Hips.p.z);
    Ry(qa, c.hipsYaw); Rz(qb, c.hipsRoll); set('Hips', qa.multiply(qb));
    // Badan: dibagi ke 3 ruas tulang belakang
    for (const [k, sh] of [['Spine', 0.3], ['Spine1', 0.35], ['Spine2', 0.35]]) {
      Rx(qa, c.spX * sh); Ry(qb, c.spY * sh); Rz(qc, c.spZ * sh); set(k, qa.multiply(qb).multiply(qc));
    }
    Rx(qa, c.neckX); Ry(qb, c.headY * 0.4); set('Neck', qa.multiply(qb));
    Rx(qa, c.headX); Ry(qb, c.headY * 0.6); set('Head', qa.multiply(qb));
    // Lengan: urutan putar = turun dari T-pose -> ayun ke depan -> sapuan datar (sisi kiri & kanan berlawanan tanda)
    for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
      const hang = c['aHang' + side[0]], swing = c['aSwing' + side[0]], sweep = c['aSweep' + side[0]], elbow = c['aElbow' + side[0]];
      Ry(qa, -sg * sweep); Rx(qb, -swing); Rz(qc, -sg * hang);
      set(side + 'Arm', qa.multiply(qb).multiply(qc));
      Ry(qa, -sg * elbow); set(side + 'ForeArm', qa);
    }
    // Kaki: telapak diputar balik supaya tetap datar di tanah
    for (const [side, f, k] of [['Left', c.fwdL, c.kneeL], ['Right', c.fwdR, c.kneeR]]) {
      Rx(qa, -f); set(side + 'UpLeg', qa);
      Rx(qa, k); set(side + 'Leg', qa);
      Rx(qa, f - k); set(side + 'Foot', qa);
    }
  }
  apply(cur);

  return {
    bones: B,
    update(dt, st) {
      dt = Math.min(dt, 0.1); t += dt;
      spd += ((st.speed || 0) - spd) * (1 - Math.exp(-12 * dt));
      if (st.mode === 'dash') phase += dt * 16;
      else phase += dt * (spd / 2.9) * Math.PI * 2;   // 1 siklus jalan (2 langkah) ≈ 2,9 m
      const target = poseFor({ ...st, walk: spd / 2.2 }, t, phase), k = 1 - Math.exp(-rateFor(st) * dt);
      for (const n of NAMES) cur[n] += (target[n] - cur[n]) * k;
      apply(cur);
    },
  };
}
