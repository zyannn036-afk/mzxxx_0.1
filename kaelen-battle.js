import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================
//  KAELEN — BOSS BATTLE di alun-alun Kota Dungeon.
//  Kaelen tampak "bersenjata & berbaju zirah kardus" (memang itu tekstur modelnya), tapi aslinya kuat:
//    FASE 1  "Kardus"        : santai, serangan sederhana (tebas, tameng, tebasan atas).
//    FASE 2  "Kardus Sobek"  : (HP < 60%) kardus meledak jadi serpihan -> baju zirah baja-emas, kombo, dash, menghindar.
//    FASE 3  "Pedang Sejati" : (HP < 25%) aura emas, gelombang kejut area, kombo 3 serangan.
//  Pemain: F/J = tebas (kombo 3 pukulan) · Q/K = menghindar (kebal sesaat) · tahan E/L = tangkis (tepat waktu = PARRY, Kaelen terhuyung)
//          B = tantang Kaelen (saat dekat). Tombol layar juga tersedia (sentuh).
//  Modul ini tidak mengendalikan gerak pemain — hanya membaca posisinya lewat getPlayer() -> { x, z, face?, y? } (koordinat DUNGEON dunia).
//  MODE HOST (dipakai game.js): bila globalThis.KAELEN_HOST ada, pemain memakai sistem game.js (serangan dasar, skill, Dark Mode, Shift = roll, HP/ramuan). Modul ini hanya AI, telegraf & fase Kaelen;
//          tombol F/J/Q/K/E/L/B & bar stamina bawaan dimatikan. Tantang Kaelen = tombol E (talkAct) atau ketuk tombol di layar. Handle: globalThis.KAELEN_BATTLE.
//  Hook opsional: onPlayerHit({ dmg, dirX, dirZ, heavy, blocked }) -> dorong/guncang pemain; onShake(kekuatan); onStart(); onEnd({ result: 'win' | 'lose' | 'flee' }).
// ============================================================
export const KAELEN = { name: 'Kaelen', title: 'Pendekar Kardus', file: 'low_poly_character_swordsman.glb', height: 1.82, maxHp: 650, phase2: 0.6, phase3: 0.25 };

// ---------- pose (rotasi tulang, radian, sumbu DUNIA model: x = kiri-kanan, y = atas, z = depan) ----------
//   [ax, ay, az] lengan pedang (kiri tokoh)  ·  fb tekuk siku pedang (negatif = menekuk ke depan)  ·  tw putar badan (y)  ·  ln condong depan (x)
//   [sx, sy, sz] lengan tameng (kanan tokoh)  ·  kn berlutut 0..1
const P = (ax = 0, ay = 0, az = 0, fb = 0, tw = 0, ln = 0, sx = 0, sy = 0, sz = 0, kn = 0) => [ax, ay, az, fb, tw, ln, sx, sy, sz, kn];
const POSE = {
  idle: P(0, 0, 0, 0, 0, 0.04), ready: P(-0.7, -0.25, 0, -0.5, -0.2, 0.1, -0.5, 0, -0.1),
  slashW: P(-1.5, -1.0, 0, 0, -0.8, -0.05, 0.3, 0, -0.2), slashS: P(-1.45, 1.3, 0, 0, 0.9, 0.12, -0.2, 0, 0),
  chopW: P(-2.8, 0.1, 0, -0.6, 0, -0.25, -0.6, 0, 0.3), chopS: P(-0.5, 0, 0, -0.1, 0, 0.4, 0, 0, 0),
  bashW: P(0, 0, 0, 0, 0.5, 0, 0.7, 0.3, -0.3), bashS: P(0, 0, 0, 0, -0.4, 0.15, -1.6, -0.2, -0.1),
  thrustW: P(0.2, -0.5, 0, -1.2, -0.7, -0.1, 0.3, 0, -0.3), thrustS: P(-1.55, 0.1, 0, -0.1, 0.4, 0.5, -0.3, 0, 0),
  shockW: P(-2.9, 0, 0.3, -0.2, 0, -0.35, -2.9, 0, -0.3), shockS: P(-0.2, 0, 0, 0, 0, 0.6, -0.2, 0, 0),
  stagger: P(0.5, 0.4, 0, 0, 0.5, -0.45, 0.4, 0, 0), kneel: P(0.2, 0, 0, 0.3, 0, 0.5, 0.2, 0, 0, 1), roar: P(-2.2, 0, 0.8, 0, 0, -0.3, -2.2, 0, -0.8),
};
// w = aba-aba (detik), a = fase serang, r = pemulihan, dmg dasar, reach (m), arc (derajat), lunge = maju saat menyerang, dash = kecepatan terjang
const ATK = {
  slash:    { w: 0.55, a: 0.14, r: 0.5,  dmg: 10, reach: 2.7, arc: 110, p: ['slashW', 'slashS'], lunge: 2.5, tell: 'sector', chain: true, parry: true },
  backhand: { w: 0.30, a: 0.14, r: 0.45, dmg: 11, reach: 2.7, arc: 110, p: ['slashS', 'slashW'], lunge: 2.2, tell: 'sector', chain: true, parry: true },
  chop:     { w: 0.80, a: 0.12, r: 0.7,  dmg: 16, reach: 3.0, arc: 80,  p: ['chopW', 'chopS'],   lunge: 3.0, tell: 'sector', heavy: true },
  bash:     { w: 0.50, a: 0.14, r: 0.55, dmg: 9,  reach: 2.3, arc: 100, p: ['bashW', 'bashS'],   lunge: 1.5, tell: 'sector' },
  thrust:   { w: 0.65, a: 0.40, r: 0.7,  dmg: 18, reach: 2.4, arc: 50,  p: ['thrustW', 'thrustS'], dash: 11, tell: 'line', heavy: true },
  swave:    { w: 0.55, a: 0.12, r: 0.6,  dmg: 12, reach: 2, arc: 0, p: ['slashW', 'slashS'], tell: 'line', len: 16, wid: 1.4, proj: true },   // tebasan jarak jauh: melepas gelombang slash (fase 1: 1, fase 2: 2 beruntun, fase 3: kipas 3 + 1)
  leap:     { w: 0.95, a: 0.18, r: 0.8,  dmg: 22, reach: 3.4, arc: 360, p: ['shockW', 'shockS'], tell: 'ring', heavy: true, armor: true, aoe: true, leap: true },   // melompat ke posisi pemain & menghantam (area)
  shock:    { w: 1.15, a: 0.20, r: 0.9,  dmg: 26, reach: 7.0, arc: 360, p: ['shockW', 'shockS'], tell: 'ring', heavy: true, armor: true, aoe: true },
};
const COMBOS = [
  [['slash'], ['bash', 'slash'], ['chop'], ['slash', 'swave']],                                                        // fase 1
  [['slash', 'backhand', 'chop'], ['thrust', 'slash'], ['bash', 'chop'], ['slash', 'backhand', 'slash', 'backhand'], ['leap', 'slash', 'backhand'], ['thrust', 'slash', 'backhand', 'chop'], ['slash', 'backhand', 'swave']],   // fase 2
  [['slash', 'backhand', 'thrust'], ['shock', 'slash', 'backhand'], ['chop', 'shock'], ['thrust', 'slash', 'backhand', 'chop'], ['slash', 'backhand', 'slash', 'backhand', 'thrust'], ['leap', 'shock'], ['leap', 'slash', 'backhand', 'chop', 'shock'], ['thrust', 'thrust', 'shock'], ['slash', 'backhand', 'swave', 'shock'], ['swave', 'leap']],   // fase 3
];
// Tebasan pedang (slash / backhand) yang berantai: jarak dari tebasan ke tebasan berikutnya = SLASH_GAP detik NYATA (di semua fase).
// Tebasan pedang bisa DITANGKIS: bila saat Kaelen menebas, serangan dasar pemain juga sedang "mengenai" (selisih waktu <= PARRY_WIN detik), tebasannya batal & Kaelen terhuyung.
const SLASH_GAP = 0.5, PARRY_WIN = 0.18;
const PHASE_DMG = [1, 1.7, 2.4], PHASE_SPEED = [1, 1.3, 1.6], PHASE_CD = [1.0, 0.4, 0.15], PHASE_RUN = [4.2, 6.0, 7.5];   // fase 2 & 3 jauh lebih agresif: damage, kecepatan aba-aba, jeda antar kombo, kecepatan kejar
const LINES = {
  intro: ['Oh, penantang baru? Hati-hati ya, senjataku ini... kardus. Kena sedikit bisa sobek, lho.', 'Tenang, aku akan pelan-pelan. Mungkin.'],
  p2: ['Kardus ini cuma penyamaran. Kau pikir aku berlatih dengan mainan?', 'Baiklah — ini baru pemanasan!'],
  p3: ['Hmm... sudah lama ada yang memaksaku sejauh ini.', 'Lihat baik-baik. INI pedang sejatiku!'],
  win: ['Hahaha! Kardusku hancur semua... Kau lulus. Datanglah ke guild, aku traktir.'], lose: ['Cukup, istirahatlah dulu. Kardusku masih banyak, kok.'],
  evade: ['Lambat!', 'Terlalu mudah ditebak.', 'Hup!'], taunt: ['Awas kardusnya sobek!', 'Sudah capek?', 'Kena!'], parry: ['Wah, tangkisan bagus!', 'Hoo, kau baca seranganku?'], flee: ['Kabur? ...Ya sudah, kapan-kapan lagi.'],
};
const rnd = a => a[Math.random() * a.length | 0], damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)), clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

const CSS = `
#kb-root{position:fixed;inset:0;pointer-events:none;z-index:60;font-family:Georgia,serif;color:#fff3c4;display:none}
#kb-root.on{display:block}
#kb-boss{position:absolute;top:14px;left:50%;transform:translateX(-50%);width:min(560px,86vw);text-align:center;text-shadow:0 2px 6px #000}
#kb-boss .n{font-size:18px;letter-spacing:2px;font-weight:bold}#kb-boss .n small{display:block;font-size:11px;color:#f0d98a;letter-spacing:1px;font-weight:normal}
.kb-bar{position:relative;height:14px;background:#2a2108;border:2px solid #e0b845;border-radius:3px;overflow:hidden;margin-top:4px}
.kb-bar i{position:absolute;left:0;top:0;bottom:0;transition:width .12s}.kb-bar i.t{background:#fff3c4;opacity:.7;transition:width .7s .25s}
#kb-bhp{background:linear-gradient(#ff6a4a,#b01e1e)}#kb-php{background:linear-gradient(#ff7a6a,#c02828)}#kb-pst{background:linear-gradient(#9be86a,#3f9a2a)}#kb-pois{background:linear-gradient(#ffd96a,#d89a10)}
.kb-bar b{position:absolute;top:0;bottom:0;width:2px;background:#e0b845}
#kb-poise{height:5px;margin-top:3px}#kb-poise.kb-bar{border-width:1px}
#kb-ply{position:absolute;left:16px;bottom:18px;width:min(280px,46vw)}#kb-ply .kb-bar{height:16px}#kb-ply .kb-bar.s{height:9px}
#kb-sub{position:absolute;left:50%;bottom:22%;transform:translateX(-50%);max-width:min(620px,88vw);text-align:center;font-size:17px;line-height:1.35;padding:8px 16px;background:rgba(40,30,8,.72);border:1px solid #e0b845;border-radius:6px;opacity:0;transition:opacity .25s}
#kb-sub b{color:#ffd96a}#kb-sub.on{opacity:1}
#kb-toast{position:absolute;top:30%;left:50%;transform:translate(-50%,0);font-size:30px;font-weight:bold;letter-spacing:3px;text-shadow:0 0 12px #ffb81c,0 2px 4px #000;opacity:0;transition:opacity .2s,transform .5s}
#kb-toast.on{opacity:1;transform:translate(-50%,-14px)}
#kb-prompt{position:absolute;left:50%;bottom:30%;transform:translateX(-50%);min-height:52px;padding:14px 26px;background:rgba(60,42,8,.92);border:3px solid #ffd96a;border-radius:12px;font-size:20px;font-weight:bold;display:none;pointer-events:auto;cursor:pointer;touch-action:manipulation;box-shadow:0 0 18px rgba(255,200,60,.55);animation:kbp 1.2s infinite alternate;white-space:nowrap}@keyframes kbp{to{box-shadow:0 0 30px rgba(255,200,60,.95)}}
#kb-btns{position:absolute;right:14px;bottom:18px;display:flex;gap:10px;pointer-events:none}
#kb-btns button{pointer-events:auto;width:62px;height:62px;border-radius:50%;border:2px solid #e0b845;background:rgba(40,30,8,.75);color:#fff3c4;font-size:22px;line-height:1.05;touch-action:none;user-select:none}
#kb-btns button small{display:block;font-size:10px}
#kb-help{position:absolute;right:16px;bottom:18px;padding:10px 14px;background:rgba(40,30,8,.78);border:1px solid #e0b845;border-radius:8px;font-size:14px;line-height:1.55;display:none}#kb-help kbd{display:inline-block;min-width:22px;padding:0 6px;margin-right:6px;text-align:center;background:#e0b845;color:#2a2108;border-radius:4px;font-family:inherit;font-weight:bold}#kb-help small{display:block;margin-top:4px;color:#f0d98a;font-size:12px}
#kb-flash{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .5s}
#kb-vig{position:absolute;inset:0;box-shadow:inset 0 0 120px 40px rgba(200,0,0,0);transition:box-shadow .25s}
#kb-res{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:54px;font-weight:bold;letter-spacing:6px;text-shadow:0 0 20px #ffb81c,0 3px 6px #000;background:rgba(0,0,0,.35)}
`;

export function createKaelenBattle(o = {}) {
  const parent = o.parent, center = o.center || { x: 0, z: 0 }, home = o.home || { x: center.x + 11, z: center.z };
  const H = () => globalThis.KAELEN_HOST || null, hosted = () => !!H();   // host = game.js (dibaca lazy, urutan muat tidak penting)
  const getPlayer0 = o.getPlayer || (() => globalThis.KOTA_PLAYER), getPlayer = () => { const h = H(); return h && h.getPlayer ? h.getPlayer() : getPlayer0(); }, file = o.file || KAELEN.file;
  // mode Android? -> tombol layar; mode PC -> panel petunjuk tombol. Sambungkan ke pengaturan game: isMobile: () => settings.androidMode
  const isMobile0 = typeof o.isMobile === 'function' ? o.isMobile : () => globalThis.KOTA_ANDROID ?? (typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches);
  const isMobile = () => { const h = H(); return h && h.mobile ? !!h.mobile() : isMobile0(); };
  const keys = Object.assign({ attack: ['f', 'j'], dodge: ['q', 'k'], guard: ['e', 'l'], challenge: ['b'] }, o.keys || {});
  const ARENA_R = o.arenaR || 17, OBELISK_R = o.obeliskR || 3.2, CHALLENGE_R = 5.5;
  const group = new THREE.Group(); group.name = 'kaelen-battle'; parent.add(group);
  const fx = new THREE.Group(); group.add(fx);

  // ---------- cadangan: bila game.js tidak memberi posisi pemain, pakai posisi KAMERA (orang ketiga: pemain ~ CAM_OFF m di depan kamera) ----------
  const CAM_OFF = o.camOffset ?? 5, camP = new THREE.Vector3(), camD = new THREE.Vector3(); let camAt = -9;
  const probe = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  probe.frustumCulled = false; probe.position.y = 1; fx.add(probe);
  probe.onBeforeRender = (r, sc, cam) => { cam.getWorldPosition(camP); cam.getWorldDirection(camD); camAt = performance.now() / 1000; };

  // ---------- state ----------
  const S = { mode: 'idle', phase: 1, time: 0, ready: false, warned: false };
  const K = { x: home.x, z: home.z, yaw: Math.PI, hp: KAELEN.maxHp, poise: 100, st: 'idle', t: 0, cd: 1, atk: null, seq: [], si: 0, hit: false, vx: 0, vz: 0, stag: 0, ev: 0, evx: 0, evz: 0, iframe: 0, gait: 0, speed: 0, reveal: 0, revealT: 0, track: true, dmgTaken: 0, lineT: 0 };
  const PL = { hp: 120, maxHp: 120, st: 100, maxSt: 100, ifr: 0, guard: false, guardAge: 9, atkT: -1, step: 0, buf: false, hit: false, dodgeCd: 0, lastUse: 0, px: 0, pz: 0, face: 0, stagger: 0 };
  const cur = POSE.idle.slice(), tgt = POSE.idle.slice();

  // ---------- HUD ----------
  let hud = null;
  if (typeof document !== 'undefined') {
    if (!document.getElementById('kb-css')) { const s = document.createElement('style'); s.id = 'kb-css'; s.textContent = CSS; document.head.appendChild(s); }
    const r = document.createElement('div'); r.id = 'kb-root';
    r.innerHTML = `<div id="kb-vig"></div><div id="kb-flash"></div>
      <div id="kb-boss"><div class="n">KAELEN<small id="kb-title">Pendekar Kardus</small></div><div class="kb-bar"><i class="t" id="kb-bhpt"></i><i id="kb-bhp"></i><b style="left:60%"></b><b style="left:25%"></b></div><div class="kb-bar" id="kb-poise"><i id="kb-pois"></i></div></div>
      <div id="kb-ply"><div class="kb-bar"><i id="kb-php"></i></div><div class="kb-bar s" style="margin-top:4px"><i id="kb-pst"></i></div></div>
      <div id="kb-toast"></div><div id="kb-sub"></div><div id="kb-prompt"></div>
      <div id="kb-help"><div><kbd id="kh-a"></kbd>Tebas (kombo 3x)</div><div><kbd id="kh-d"></kbd>Hindar (kebal sesaat)</div><div><kbd id="kh-g"></kbd>Tahan = Tangkis</div><small>Tangkis tepat sebelum kena = PARRY<br>Area merah di tanah = serangan datang<br>Gelombang kejut: harus dihindari<br><span id="kh-dist"></span></small></div>
      <div id="kb-btns"><button id="kb-b-atk">⚔️<small>Tebas</small></button><button id="kb-b-dod">🌀<small>Hindar</small></button><button id="kb-b-grd">🛡️<small>Tangkis</small></button></div><div id="kb-res"></div>`;
    document.body.appendChild(r);
    const $ = id => r.querySelector('#' + id); hud = { r, bhp: $('kb-bhp'), bhpt: $('kb-bhpt'), pois: $('kb-pois'), php: $('kb-php'), pst: $('kb-pst'), title: $('kb-title'), toast: $('kb-toast'), sub: $('kb-sub'), prompt: $('kb-prompt'), flash: $('kb-flash'), vig: $('kb-vig'), res: $('kb-res'), btns: $('kb-btns'), help: $('kb-help'), hdist: $('kh-dist'), ply: $('kb-ply'), boss: $('kb-boss') };
  }
  let toastTm = 0, subTm = 0;
  const timers = []; const later = (sec, fn) => { const t = { at: S.time + sec, fn }; timers.push(t); return t; }, unlater = t => { if (t) t.dead = true; };   // jadwal berbasis jam game (bukan setTimeout)
  const toast = (t, ms = 1400) => { if (!hud) return; hud.toast.textContent = t; hud.toast.classList.add('on'); clearTimeout(toastTm); toastTm = setTimeout(() => hud.toast.classList.remove('on'), ms); };
  const say = (t, ms = 2800) => { if (!hud) return; hud.sub.innerHTML = '<b>Kaelen:</b> ' + t; hud.sub.classList.add('on'); clearTimeout(subTm); subTm = setTimeout(() => hud.sub.classList.remove('on'), ms); };
  const flash = (a = 0.9, ms = 500) => { if (!hud) return; hud.flash.style.transition = 'none'; hud.flash.style.opacity = a; requestAnimationFrame(() => { hud.flash.style.transition = `opacity ${ms}ms`; hud.flash.style.opacity = 0; }); };
  const vig = (a) => { if (!hud) return; hud.vig.style.boxShadow = `inset 0 0 120px 40px rgba(200,0,0,${a})`; setTimeout(() => { hud.vig.style.boxShadow = 'inset 0 0 120px 40px rgba(200,0,0,0)'; }, 220); };
  const shake = k => { try { o.onShake && o.onShake(k); const h = H(); h && h.onShake && h.onShake(k); } catch (e) { /* abaikan */ } };
  const showHud = on => { if (hud) hud.r.classList.toggle('on', on); };
  const hudFight = on => { if (!hud) return; hud.boss.style.display = on ? '' : 'none'; hud.ply.style.display = on && !hosted() ? '' : 'none'; };
  const fighting = () => S.mode === 'fight' || S.mode === 'intro' || S.mode === 'end';
  const syncInput = () => {   // mode PC: petunjuk tombol · mode Android: tombol layar
    if (!hud) return; const mob = !!isMobile(), f = fighting(), nm = a => a[0].toUpperCase();
    hud.btns.style.display = f && mob && !hosted() ? 'flex' : 'none'; hud.help.style.display = f && !mob && !hosted() ? 'block' : 'none';
    if (f && !mob && !hosted()) { hud.r.querySelector('#kh-a').textContent = nm(keys.attack); hud.r.querySelector('#kh-d').textContent = nm(keys.dodge); hud.r.querySelector('#kh-g').textContent = nm(keys.guard); hud.hdist.textContent = 'Jarak ke Kaelen: ' + distK().toFixed(1) + ' m (tebasan kena ≤ 3 m)'; }
  };
  const syncHud = () => {
    if (!hud) return; const hp = clamp(K.hp / KAELEN.maxHp, 0, 1) * 100;
    hud.bhp.style.width = hp + '%'; hud.bhpt.style.width = hp + '%'; hud.pois.style.width = K.poise + '%';
    hud.php.style.width = PL.hp / PL.maxHp * 100 + '%'; hud.pst.style.width = PL.st / PL.maxSt * 100 + '%';
    hud.title.textContent = ['Pendekar Kardus', 'Kardus Sobek', 'Pedang Sejati'][S.phase - 1];
  };

  // ---------- model ----------
  let model = null, bones = {}, mats = [], glow = null, steelMap = null, tag = null, swapped = false;
  const steelTexture = () => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#d4dce8'); g.addColorStop(0.5, '#8794a6'); g.addColorStop(1, '#e0c680'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(40,50,70,.55)'; x.lineWidth = 3; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) x.strokeRect(i * 64 + 2, j * 64 + 2, 60, 60);
    x.fillStyle = '#ffe9a0'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (const [a, b] of [[10, 10], [54, 10], [10, 54], [54, 54]]) { x.beginPath(); x.arc(i * 64 + a, j * 64 + b, 2.4, 0, 6.3); x.fill(); }
    x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1; for (let i = 0; i < 60; i++) { x.beginPath(); const a = Math.random() * 256, b = Math.random() * 256; x.moveTo(a, b); x.lineTo(a + Math.random() * 40 - 20, b + Math.random() * 40 - 20); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
  };
  const glowTex = (() => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = 8; c.height = 64; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,200,60,0)'); g.addColorStop(0.5, 'rgba(255,230,140,0.9)'); g.addColorStop(1, 'rgba(255,200,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 8, 64); return new THREE.CanvasTexture(c); })();
  const aura = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.55, 2.6, 24, 1, true), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc23a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.position.y = 1.2; aura.visible = false; fx.add(aura);
  const boneInfo = (b, m) => { m.updateMatrixWorld(true); const mq = m.getWorldQuaternion(new THREE.Quaternion()).invert(); const pW = b.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(mq); return { b, q0: b.quaternion.clone(), pW, pWi: pW.clone().invert() }; };
  const find = (m, re) => { let r = null; m.traverse(n => { if (!r && n.isBone && re.test(n.name)) r = n; }); return r; };
  const tag3 = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 80; const x = c.getContext('2d'); x.textAlign = 'center'; x.fillStyle = 'rgba(40,30,8,.75)'; x.fillRect(8, 8, 240, 64); x.strokeStyle = '#e0b845'; x.lineWidth = 3; x.strokeRect(8, 8, 240, 64); x.fillStyle = '#fff3c4'; x.font = 'bold 30px Georgia'; x.fillText('Kaelen', 128, 40); x.fillStyle = '#f0d98a'; x.font = 'bold 17px Georgia'; x.fillText('Pendekar Pedang', 128, 62); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(1.5, 0.47, 1); s.renderOrder = 10; return s; };

  new GLTFLoader().load(file, gltf => {
    try {
      const m = gltf.scene; m.traverse(n => { if (n.isMesh) for (const mt of [].concat(n.material)) if (/ground/i.test(mt.name || '')) n.visible = false; });
      m.updateMatrixWorld(true);
      const box = new THREE.Box3(), tmp = new THREE.Box3(); m.traverse(n => { if (n.isMesh && n.visible && ![].concat(n.material).some(mt => /weapon|ground/i.test(mt.name || ''))) box.union(tmp.setFromObject(n)); });
      const hh = box.max.y - box.min.y, k = isFinite(hh) && hh > 1e-4 ? KAELEN.height / hh : 1;
      const defs = { spine: /^spine_/i, torso: /spine.?003/i, armL: /upper_?arm.?L/i, foreL: /forearm.?L/i, handL: /^hand.?L/i, armR: /upper_?arm.?R/i, thighL: /thigh.?L/i, thighR: /thigh.?R/i, shinL: /shin.?L/i, shinR: /shin.?R/i };
      for (const key in defs) { const b = find(m, defs[key]); if (b && b.parent) bones[key] = boneInfo(b, m); else console.warn('Kaelen: tulang ' + key + ' tidak ditemukan'); }
      const foreR = find(m, /forearm.?R/i); if (foreR) bones.foreR = boneInfo(foreR, m);
      // cahaya bilah pedang: menempel di tangan kiri (mengikuti animasi)
      if (bones.handL) {
        const hb = bones.handL.b, rest = new THREE.Matrix4().compose(new THREE.Vector3(0.27, 0.855, 0.3), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        glow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.2, 0.9), new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.matrixAutoUpdate = false; glow.matrix.copy(hb.matrixWorld).invert().multiply(m.matrixWorld).multiply(rest); glow.visible = false; hb.add(glow);
      }
      m.traverse(n => { if (n.isMesh) { n.frustumCulled = false; n.castShadow = true; for (const mt of [].concat(n.material)) { mt.fog = false; mt.metalnessMap = null; mt.metalness = 0.05; mt.roughness = 1; if (mt.map && !/HEAD|ground/i.test(mt.name || '')) mats.push({ mt, map0: mt.map }); } } });
      const inner = new THREE.Group(); inner.add(m); m.scale.setScalar(k); m.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
      model = new THREE.Group(); model.add(inner); group.add(model);
      tag = tag3(); tag.position.y = KAELEN.height + 0.5; model.add(tag);
      steelMap = steelTexture(); S.ready = true; place();
    } catch (e) { console.warn('Kaelen gagal dipasang:', e); }
  }, undefined, () => console.warn(file + ' gagal dimuat — Kaelen tidak ditampilkan'));

  // ---------- efek: telegraf serangan, tebasan pemain, serpihan kardus ----------
  const telMat = new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const sectors = {}; for (const key in ATK) { const a = ATK[key]; if (a.tell === 'sector') sectors[key] = new THREE.CircleGeometry(1, 24, -a.arc * Math.PI / 360, a.arc * Math.PI / 180).rotateX(-Math.PI / 2); }
  const ringG = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), lineG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const tel = new THREE.Mesh(ringG, telMat); tel.visible = false; tel.position.y = 0.06; fx.add(tel);
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); wave.position.y = 0.12; wave.visible = false; fx.add(wave);
  let waveT = -1;
  const slashFx = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 20, 1, -1.0, 2.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); slashFx.position.y = 1.1; slashFx.visible = false; fx.add(slashFx);
  let slashT = -1, slashHeavy = false;
  const NDEB = 90, deb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.025, 0.11), new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 1, flatShading: true }), NDEB), dd = [], dummy = new THREE.Object3D();
  for (let i = 0; i < NDEB; i++) { dd.push({ x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0, l: 0, rx: 0, ry: 0, rs: 0 }); dummy.position.set(0, -99, 0); dummy.updateMatrix(); deb.setMatrixAt(i, dummy.matrix); } deb.frustumCulled = false; fx.add(deb); let debI = 0;
  const burst = (x, y, z, n, sp, gold) => { if (gold) deb.material.color.setHex(0xffd45a); else deb.material.color.setHex(0xb08a5a); for (let i = 0; i < n; i++) { const d = dd[debI++ % NDEB], a = Math.random() * 6.283, s = sp * (0.4 + Math.random()); d.x = x; d.y = y + Math.random() * 0.8; d.z = z; d.vx = Math.cos(a) * s; d.vz = Math.sin(a) * s; d.vy = 2 + Math.random() * sp * 0.7; d.l = 1.6 + Math.random(); d.rx = Math.random() * 6; d.ry = Math.random() * 6; d.rs = (Math.random() - 0.5) * 12; } };
  const stepDebris = dt => { for (let i = 0; i < NDEB; i++) { const d = dd[i]; if (d.l > 0) { d.l -= dt; d.vy -= 11 * dt; d.x += d.vx * dt; d.z += d.vz * dt; d.y += d.vy * dt; if (d.y < 0.03) { d.y = 0.03; d.vy = 0; d.vx *= 0.8; d.vz *= 0.8; d.rs = 0; } d.rx += d.rs * dt; dummy.position.set(d.x, d.y, d.z); dummy.rotation.set(d.rx, d.ry, 0); dummy.scale.setScalar(d.l > 0.3 ? 1 : d.l / 0.3); } else { dummy.position.set(0, -99, 0); dummy.scale.setScalar(0); } dummy.updateMatrix(); deb.setMatrixAt(i, dummy.matrix); } deb.instanceMatrix.needsUpdate = true; };

  // ---------- gelombang tebasan (slash jarak jauh) ----------
  //  Melaju lurus ke arah hadap Kaelen. Kena badan pemain = damage; DITANGKIS bila serangan dasar pemain mengenai tepat saat gelombang tiba (selisih <= PARRY_WIN);
  //  menghindar / roll (kebal) = gelombang lewat menembus. Hilang di tepi alun-alun / obelisk.
  const NW = 9, waveP = [], crG = new THREE.RingGeometry(0.75, 1.05, 28, 1, -Math.PI / 2 - 0.95, 1.9).rotateX(-Math.PI / 2), crG2 = new THREE.RingGeometry(0.55, 0.7, 28, 1, -Math.PI / 2 - 0.8, 1.6).rotateX(-Math.PI / 2);
  for (let i = 0; i < NW; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), g = new THREE.Group(), a = new THREE.Mesh(crG, m), b = new THREE.Mesh(crG2, m);
    a.scale.set(1.5, 1, 1.5); b.scale.set(1.5, 1, 1.5); b.position.z = -0.45; g.add(a, b); g.visible = false; g.position.y = 1.0; fx.add(g);
    waveP.push({ g, m, on: false, done: false, x: 0, z: 0, dx: 0, dz: 0, life: 0, atk: null });
  }
  const WAVE_SEQ = [[[0, 0]], [[0, 0], [0, 0.28]], [[-0.28, 0], [0, 0], [0.28, 0], [0, 0.4]]];   // [selisih sudut (rad), tunda (dtk)] per fase
  function spawnWave(atk, ang) {
    const p = waveP.find(w => !w.on); if (!p) return; const yaw = K.yaw + ang, sp = [14, 17, 20][S.phase - 1];
    p.on = true; p.done = false; p.atk = atk; p.dx = Math.sin(yaw) * sp; p.dz = Math.cos(yaw) * sp; p.x = K.x + Math.sin(yaw) * 1.4; p.z = K.z + Math.cos(yaw) * 1.4; p.life = 2.2;
    p.g.rotation.y = yaw; p.g.position.set(p.x, 1.0, p.z); p.m.color.setHex([0xfff3c4, 0xffd45a, 0xff9a3a][S.phase - 1]); p.g.visible = true; burst(p.x, 1.0, p.z, 4, 3, true); shake(0.15);
  }
  function fireWave(atk) { for (const [ang, dl] of WAVE_SEQ[S.phase - 1]) { if (dl) later(dl, () => { if (S.mode === 'fight') spawnWave(atk, ang); }); else spawnWave(atk, ang); } }
  function stepWaves(dt) {
    for (const p of waveP) {
      if (!p.on) continue; p.life -= dt; p.x += p.dx * dt; p.z += p.dz * dt; p.g.position.set(p.x, 1.0, p.z);
      const out = Math.hypot(p.x - center.x, p.z - center.z); let kill = p.life <= 0 || out > ARENA_R + 3 || out < OBELISK_R;
      if (!kill && !p.done && S.mode === 'fight' && Math.hypot(p.x - PL.px, p.z - PL.pz) < 1.2) {
        const h = H();
        if (h ? (h.inv && h.inv()) : PL.ifr > 0) { p.done = true; toast('Luput!', 500); }   // sedang kebal (roll): gelombang menembus
        else { kill = true; if (!tryParry(p.x, p.z, false)) hurtPlayer(p.atk.dmg, p.atk); }
      }
      if (kill) { p.on = false; p.g.visible = false; }
    }
  }
  function clearWaves() { for (const p of waveP) { p.on = false; p.g.visible = false; } }

  // ---------- wujud: sobek jadi baju zirah emas ----------
  function setReveal(r) {
    K.reveal = r; const pulse = 0.75 + 0.25 * Math.sin(S.time * 5);
    for (const e of mats) { const mt = e.mt; mt.emissive.setRGB(r, 0.62 * r, 0.12 * r); mt.emissiveIntensity = (0.35 + 0.45 * (S.phase - 1) / 2) * pulse; mt.metalness = 0.05 + 0.5 * r; mt.roughness = 1 - 0.5 * r; mt.color.setRGB(1 + 0.15 * r, 1 + 0.1 * r, 1); }
    if (glow) { glow.visible = r > 0.02; glow.material.opacity = r * (0.55 + 0.3 * Math.sin(S.time * 9)); }
    aura.visible = r > 0.02; aura.material.opacity = r * (S.phase === 3 ? 0.55 : 0.28) * pulse; aura.scale.set(1 + 0.25 * (S.phase - 1), 1 + 0.1 * Math.sin(S.time * 3), 1 + 0.25 * (S.phase - 1)); aura.rotation.y = S.time * 1.5;
  }
  function swapSteel(on) {
    if (swapped === on) return; swapped = on;
    for (const e of mats) { e.mt.map = on ? steelMap : e.map0; e.mt.emissiveMap = on ? steelMap : null; e.mt.needsUpdate = true; }
  }

  // ---------- tulang ----------
  const qa = new THREE.Quaternion(), eu = new THREE.Euler();
  const rot = (bi, rx, ry, rz) => { if (!bi) return; eu.set(rx, ry, rz, 'YXZ'); qa.setFromEuler(eu); bi.b.quaternion.copy(bi.pWi).multiply(qa).multiply(bi.pW).multiply(bi.q0); };
  function applyPose(dt, gait, bob) {
    const c = cur, B = bones, kn = c[9];
    rot(B.armL, c[0], c[1], c[2]); rot(B.foreL, c[3], 0, 0); rot(B.spine, c[5] * 0.5 + bob * 0.02, 0, 0); rot(B.torso, c[5] * 0.5, c[4], 0); rot(B.armR, c[6], c[7], c[8]);
    const sw = Math.sin(gait) * 0.7 * clamp(K.speed / 3.5, 0, 1) * (1 - kn);
    rot(B.thighL, -sw + 0.1 * kn, 0, 0); rot(B.thighR, sw + 0.1 * kn, 0, 0);
    rot(B.shinL, Math.max(0, Math.sin(gait + 1.6)) * 0.9 * clamp(K.speed / 3.5, 0, 1) + 1.5 * kn, 0, 0); rot(B.shinR, Math.max(0, Math.sin(gait + 1.6 + Math.PI)) * 0.9 * clamp(K.speed / 3.5, 0, 1) + 1.5 * kn, 0, 0);
    if (model) model.position.y = -0.55 * kn + Math.abs(Math.sin(gait)) * 0.05 * clamp(K.speed / 3.5, 0, 1);
  }
  function place() { if (model) { model.position.x = K.x; model.position.z = K.z; model.rotation.y = K.yaw; } for (const f of [aura]) { f.position.x = K.x; f.position.z = K.z; } }

  // ---------- pemain ----------
  const tmpV = new THREE.Vector3(); let pYawW = 0, last = 0, endTm = 0;
  function readPlayer() {
    let pl = getPlayer(); S.viaCam = false;
    if (!pl || !isFinite(pl.x)) {
      if (performance.now() / 1000 - camAt > 0.5) return false;   // kamera pun belum terbaca
      const l = Math.hypot(camD.x, camD.z) || 1; pl = { x: camP.x + camD.x / l * CAM_OFF, z: camP.z + camD.z / l * CAM_OFF }; S.viaCam = true;
      if (!S.warned) { S.warned = true; console.info('Kaelen battle: window.KOTA_PLAYER belum diisi — memakai posisi kamera sebagai perkiraan posisi pemain.'); }
    }
    parent.updateWorldMatrix(true, false); const e = parent.matrixWorld.elements; pYawW = Math.atan2(e[8], e[10]);
    tmpV.set(pl.x, pl.y || 0, pl.z); parent.worldToLocal(tmpV); PL.px = tmpV.x; PL.pz = tmpV.z;
    PL.face = typeof pl.face === 'number' ? pl.face - pYawW : Math.atan2(K.x - PL.px, K.z - PL.pz); return true;
  }
  const toWorldDir = (dx, dz) => ({ x: dx * Math.cos(pYawW) + dz * Math.sin(pYawW), z: -dx * Math.sin(pYawW) + dz * Math.cos(pYawW) });
  const distK = () => Math.hypot(PL.px - K.x, PL.pz - K.z);

  function useStamina(n) { if (PL.st < n) { toast('Stamina habis!', 500); return false; } PL.st -= n; PL.lastUse = S.time; return true; }
  function playerAttack() {
    if (S.mode !== 'fight' || PL.stagger > 0) return;
    if (PL.atkT >= 0) { if (PL.atkT > 0.08) PL.buf = true; return; }
    if (!useStamina(10)) return;
    PL.atkT = 0; PL.hit = false; PL.step = S.time - (PL.lastAtk || -9) < 0.9 ? (PL.step + 1) % 3 : 0; PL.lastAtk = S.time;
    if (S.phase >= 2 && K.st !== 'atk' && K.st !== 'stagger' && K.ev <= 0 && K.cd < 0.5 && Math.random() < 0.25 && distK() < 3.5) startEvade();
  }
  function playerDodge() { if (S.mode !== 'fight' || PL.dodgeCd > 0 || PL.stagger > 0 || !useStamina(22)) return; PL.ifr = 0.45; PL.dodgeCd = 0.6; }
  function playerGuard(on) { if (on && !PL.guard && S.mode === 'fight') PL.guardAge = 0; PL.guard = on && S.mode === 'fight'; }
  function playerUpdate(dt) {
    PL.guardAge += dt; PL.ifr = Math.max(0, PL.ifr - dt); PL.dodgeCd = Math.max(0, PL.dodgeCd - dt); PL.stagger = Math.max(0, PL.stagger - dt);
    if (S.time - PL.lastUse > 0.7 && !PL.guard) PL.st = Math.min(PL.maxSt, PL.st + 30 * dt);
    if (PL.atkT >= 0) {
      const dur = PL.step === 2 ? 0.5 : 0.34, hitT = PL.step === 2 ? 0.2 : 0.12; PL.atkT += dt;
      if (!PL.hit && PL.atkT >= hitT) { PL.hit = true; playerStrike(); }
      if (PL.atkT >= dur) { if (PL.buf) { PL.buf = false; PL.atkT = -1; playerAttack(); } else if (PL.atkT >= dur + 0.2) { PL.atkT = -1; } }
    }
  }
  function playerStrike() {
    const heavy = PL.step === 2, reach = (heavy ? 3.4 : 3.0) + (S.viaCam ? 1.5 : 0), d = distK(), aim = d < 10 ? Math.atan2(K.x - PL.px, K.z - PL.pz) : PL.face;   // auto-bidik ke Kaelen (arah hadap pemain tidak dipakai)
    slashT = 0; slashHeavy = heavy; slashFx.position.set(PL.px + Math.sin(aim) * 1.0, 1.1, PL.pz + Math.cos(aim) * 1.0); slashFx.rotation.set(0, aim - Math.PI / 2, heavy ? 0.5 : (PL.step ? -0.35 : 0.35)); slashFx.scale.setScalar(heavy ? 1.35 : 1); slashFx.visible = true;
    if (K.st === 'dead') return;
    if (d > reach) { if (d < 14 && S.time - (PL.hintAt || -9) > 1.5) { PL.hintAt = S.time; toast('Terlalu jauh — dekati Kaelen!', 800); } return; }
    if (K.iframe > 0) { toast('Dihindari!', 500); return; }
    hurtKaelen([16, 16, 30][PL.step], heavy);
  }
  // dipakai tebasan bawaan DAN skill/serangan dari game.js lewat enemy.takeDamage()
  function hurtKaelen(base, heavy) {
    if (S.mode !== 'fight' || K.st === 'dead' || K.iframe > 0) return false;
    let dmg = base * (K.st === 'stagger' ? 1.5 : 1); K.hp = Math.max(0, K.hp - dmg); K.dmgTaken += dmg;
    const small = base < 8;   // pukulan kecil beruntun (mis. sinar skill game.js): hanya mengurangi HP, tanpa kilat/guncangan/terhuyung tiap frame
    const armored = K.atk && K.st === 'atk' && (K.atk.armor || (S.phase === 3 && K.atk.heavy)), pm = [1, 0.75, 0.55][S.phase - 1];   // fase 3: serangan berat tak bisa dipotong; fase 2/3: poise lebih alot, terhuyung lebih singkat
    if (!small && !armored) { K.poise = Math.max(0, K.poise - (heavy ? 38 : 13) * pm); K.flinch = 0.12; if (K.poise <= 0 && K.st !== 'stagger' && S.time >= (K.noStagger || 0)) startStagger(1.2 * [1, 0.8, 0.6][S.phase - 1]); }
    if (!small) { flash(0.12, 120); shake(heavy ? 0.5 : 0.2); burst(K.x, 0.9, K.z, heavy ? 10 : 5, heavy ? 5 : 3, K.reveal > 0.5); K.hitFlash = 0.1; }
    if (K.hp <= 0) return win();
    if (S.phase === 1 && K.hp / KAELEN.maxHp < KAELEN.phase2) return toPhase(2);
    if (S.phase === 2 && K.hp / KAELEN.maxHp < KAELEN.phase3) return toPhase(3);
    if (Math.random() < 0.08) say(rnd(LINES.taunt), 1400);
    return true;
  }
  // selisih detik antara saat serangan dasar pemain "mengenai" dan sekarang (negatif = sudah lewat); null = pemain tidak sedang menebas
  function swingOffset() { const h = H(); if (h) return h.swing ? h.swing() : null; return PL.atkT >= 0 ? (PL.step === 2 ? 0.2 : 0.12) - PL.atkT : null; }
  function tryParry(px = K.x + Math.sin(K.yaw) * 1.4, pz = K.z + Math.cos(K.yaw) * 1.4, stag = true) {   // tebasan Kaelen bertemu serangan dasar pemain di waktu yang sama = tangkis
    const s = swingOffset(); if (s == null || Math.abs(s) > PARRY_WIN) return false;
    toast('TANGKIS!', 900); flash(0.35, 250); shake(0.5); say(rnd(LINES.parry), 1500); burst(px, 1.2, pz, 10, 5, true);
    if (stag && K.atk && !K.atk.armor) startStagger(0.9); return true;
  }
  function hurtPlayer(base, atk) {
    let dmg = base * PHASE_DMG[S.phase - 1]; const dx = PL.px - K.x, dz = PL.pz - K.z, l = Math.hypot(dx, dz) || 1, wd = toWorldDir(dx / l, dz / l);
    if (PL.ifr > 0) { toast('Luput!', 500); return; }
    const h = H();
    if (h) {   // MODE HOST: kebal (roll) & HP milik game.js
      if (h.inv && h.inv()) { toast('Luput!', 500); return; }
      dmg = Math.max(1, Math.round(dmg * (h.dmgScale ?? 0.55))); let r = null;
      try { r = h.hurt && h.hurt(dmg, { dirX: wd.x, dirZ: wd.z, heavy: !!atk.heavy }); } catch (e) { /* abaikan */ }
      shake(atk.heavy ? 0.7 : 0.35); if (Math.random() < 0.15) say(rnd(LINES.taunt), 1200);
      if (r === 'down') lose(); return;
    }
    if (PL.guard && !atk.aoe) {
      if (PL.guardAge < 0.25) { toast('PARRY!', 900); PL.st = Math.min(PL.maxSt, PL.st + 25); flash(0.35, 250); shake(0.4); say(rnd(LINES.parry), 1500); if (!atk.armor) startStagger(1.3); burst(K.x + dx / l * 1.4, 1.2, K.z + dz / l * 1.4, 8, 4, true); return; }
      PL.st -= dmg * 1.1; PL.lastUse = S.time;
      if (PL.st <= 0) { PL.st = 0; PL.guard = false; PL.stagger = 0.7; toast('Tangkisan jebol!', 800); } else { dmg *= 0.25; try { o.onPlayerHit && o.onPlayerHit({ dmg, dirX: wd.x, dirZ: wd.z, heavy: false, blocked: true }); } catch (e) { /* abaikan */ } PL.hp = Math.max(0, PL.hp - dmg); shake(0.15); return playerCheckDead(); }
    }
    PL.hp = Math.max(0, PL.hp - dmg); PL.atkT = -1; PL.buf = false; vig(0.55); shake(atk.heavy ? 0.7 : 0.35); if (Math.random() < 0.15) say(rnd(LINES.taunt), 1200);
    try { o.onPlayerHit && o.onPlayerHit({ dmg, dirX: wd.x, dirZ: wd.z, heavy: !!atk.heavy, blocked: false }); } catch (e) { /* abaikan */ }
    playerCheckDead();
  }
  function playerCheckDead() { if (PL.hp <= 0 && S.mode === 'fight') lose(); }

  // ---------- Kaelen: AI ----------
  function startStagger(d) { K.noStagger = S.time + d + 2.5; K.st = 'stagger'; K.t = 0; K.stag = d; K.atk = null; K.seq = []; K.poise = 100; hideTel(); toast('Kaelen terhuyung!', 700); }
  function startEvade() { const side = Math.random() < 0.5 ? 1 : -1, a = Math.atan2(PL.px - K.x, PL.pz - K.z) + side * Math.PI / 2; K.st = 'evade'; K.ev = 0.28; K.evx = Math.sin(a) * 12; K.evz = Math.cos(a) * 12; K.iframe = 0.3; K.atk = null; K.seq = []; hideTel(); if (Math.random() < 0.6) say(rnd(LINES.evade), 1000); }
  function startAtk(name) {
    const a = ATK[name]; K.atk = a; K.an = name; K.st = 'atk'; K.t = 0; K.hit = false; K.track = true; K.lineT = 0;
    { const sp = PHASE_SPEED[S.phase - 1], prev = K.si > 0 ? ATK[K.seq[K.si - 1]] : null, nxt = ATK[K.seq[K.si + 1]]; K.aw = a.w; K.ar = a.r;   // waktu aba-aba / pemulihan yang dipakai (dalam jam serangan = detik nyata x kecepatan fase)
      if (a.chain && nxt && nxt.chain) K.ar = 0.1 * sp;
      if (a.chain && prev && prev.chain) K.aw = Math.max(0.12, SLASH_GAP * sp - prev.a - 0.1 * sp); }
    if (a.leap) { K.track = false; K.lx0 = K.x; K.lz0 = K.z; const c = clampA(PL.px, PL.pz); K.lx1 = c.x; K.lz1 = c.z; }
    tel.geometry = a.tell === 'sector' ? sectors[name] : a.tell === 'line' ? lineG : ringG; tel.visible = true; telMat.opacity = 0.1;
    if (a.tell === 'sector') tel.scale.set(a.reach, 1, a.reach); else if (a.tell === 'ring') tel.scale.set(a.reach, 1, a.reach); else tel.scale.set(a.wid || 1.6, 1, a.len || 8);
  }
  const clampA = (x, z) => { let cx = x - center.x, cz = z - center.z, r = Math.hypot(cx, cz) || 1e-4; if (r > ARENA_R - 0.5) { cx *= (ARENA_R - 0.5) / r; cz *= (ARENA_R - 0.5) / r; r = ARENA_R - 0.5; } if (r < OBELISK_R + 0.5) { const k = (OBELISK_R + 0.5) / r; cx *= k; cz *= k; } return { x: center.x + cx, z: center.z + cz }; };
  function hideTel() { tel.visible = false; }
  function pickCombo() { const g = COMBOS[S.phase - 1]; K.seq = rnd(g).slice(); K.si = 0; startAtk(K.seq[0]); }
  function kaelenUpdate(dt) {
    if (!(K.st === 'atk' && K.atk && K.atk.leap)) K.lift = 0;
    const sp = PHASE_SPEED[S.phase - 1]; K.iframe = Math.max(0, K.iframe - dt); K.hitFlash = Math.max(0, (K.hitFlash || 0) - dt); K.flinch = Math.max(0, (K.flinch || 0) - dt);
    const dx = PL.px - K.x, dz = PL.pz - K.z, d = Math.hypot(dx, dz) || 1, want = Math.atan2(dx, dz);
    let vx = 0, vz = 0, spd = 0;
    const face = k => { K.yaw += wrapA(want - K.yaw) * Math.min(1, dt * k); };
    if (hosted()) { const h = H(), at = !!(h.attacking && h.attacking()); if (at && !K.pAt && S.phase >= 2 && (K.st === 'idle' || K.st === 'move') && K.cd < 0.5 && d < 3.5 && Math.random() < 0.25) startEvade(); K.pAt = at; }
    if (K.st === 'idle' || K.st === 'move') {
      K.cd -= dt; face(9);
      const near = S.phase === 1 ? 2.3 : 2.1;
      if (d > near) { spd = d > 9 ? PHASE_RUN[S.phase - 1] * 1.25 : PHASE_RUN[S.phase - 1]; vx = dx / d * spd; vz = dz / d * spd; K.st = 'move'; } else if (d < 1.4) { spd = 2.5; vx = -dx / d * spd; vz = -dz / d * spd; K.st = 'move'; } else { K.st = 'idle'; const s = Math.sin(S.time * 0.9) * 1.4; vx = dz / d * s; vz = -dx / d * s; spd = Math.abs(s); }   // mengitari pemain pelan
      if (K.cd <= 0) {
        if (S.phase >= 2 && d > 6.5 && Math.random() < 0.5) { K.seq = ['thrust']; K.si = 0; startAtk('thrust'); }
        else if (S.phase >= 2 && d > 4.5 && Math.random() < (S.phase === 3 ? 0.55 : 0.4)) { K.seq = ['leap']; K.si = 0; startAtk('leap'); }
        else if (S.phase === 3 && d > 3.2 && Math.random() < 0.4) { K.seq = ['shock']; K.si = 0; startAtk('shock'); }
        else if (d > 4.5 && Math.random() < [0.3, 0.3, 0.35][S.phase - 1]) { K.seq = ['swave']; K.si = 0; startAtk('swave'); }
        else if (d < 3.4) pickCombo(); else K.cd = 0.1;
      }
    } else if (K.st === 'atk') {
      const a = K.atk, t = K.t += dt * sp;
      if (a.leap) {   // terbang ke titik pendaratan (cincin merah): titik mengikuti pemain separuh pertama aba-aba, lalu terkunci
        if (t < K.aw * 0.5) { const c = clampA(PL.px, PL.pz); K.lx1 = c.x; K.lz1 = c.z; }
        const u = clamp(t / K.aw, 0, 1), e = u * u * (3 - 2 * u);
        moveK(K.lx0 + (K.lx1 - K.lx0) * e - K.x, K.lz0 + (K.lz1 - K.lz0) * e - K.z); K.lift = 2.6 * Math.sin(Math.PI * u);
        K.yaw += wrapA(Math.atan2(K.lx1 - K.x, K.lz1 - K.z) - K.yaw) * Math.min(1, dt * 12);
      }
      if (K.track && t < K.aw * 0.75) face(a.tell === 'ring' ? 3 : 7); else K.track = false;
      if (t < K.aw) { telMat.opacity = 0.12 + 0.38 * (t / K.aw); }
      else if (t < K.aw + a.a) {
        telMat.opacity = 0; tel.visible = false;
        if (a.dash) { vx = Math.sin(K.yaw) * a.dash; vz = Math.cos(K.yaw) * a.dash; spd = a.dash; K.lineT += dt; if (!K.hit && d < a.reach + 0.4) { K.hit = true; hurtPlayer(a.dmg, a); } }
        else if (a.lunge) { vx = Math.sin(K.yaw) * a.lunge / a.a; vz = Math.cos(K.yaw) * a.lunge / a.a; }
        if (!K.hit && !a.dash) {
          K.hit = true;
          if (a.aoe) { K.waveS = a.leap ? 9 : 22; waveT = 0; wave.visible = true; wave.position.set(K.x, 0.12, K.z); shake(0.9); burst(K.x, 0.3, K.z, 24, 8, true); flash(0.25, 300); if (d < a.reach) hurtPlayer(a.dmg, a); }
          else if (a.proj) fireWave(a);
          else { const ang = Math.abs(wrapA(want - K.yaw)); if (d < a.reach + 0.3 && ang < a.arc * Math.PI / 360 + 0.15) { if (!(a.parry && tryParry())) hurtPlayer(a.dmg, a); } }
        }
      } else if (t >= K.aw + a.a + K.ar) {
        K.si++;
        if (K.si < K.seq.length && PL.hp > 0) startAtk(K.seq[K.si]); else { K.atk = null; K.st = 'idle'; K.cd = PHASE_CD[S.phase - 1] * (0.7 + Math.random() * 0.6); }
      }
    } else if (K.st === 'stagger') { K.t += dt; if (K.t >= K.stag) { K.st = 'idle'; K.cd = 0.3; } }
    else if (K.st === 'evade') { K.ev -= dt; vx = K.evx * (K.ev / 0.28); vz = K.evz * (K.ev / 0.28); spd = 8; if (K.ev <= 0) { K.st = 'idle'; K.cd = 0.15; } }
    else if (K.st === 'roar') { K.t += dt; face(5); if (K.t > K.roarT) { K.st = 'idle'; K.cd = 0.25; } }
    moveK(vx * dt, vz * dt); K.speed = damp(K.speed, spd, 10, dt); K.gait += K.speed * dt * 2.0;
    if (K.st === 'move' || K.st === 'idle') { K.atk = null; }
    // jarak terlalu jauh dari alun-alun -> menyerah
    if (Math.hypot(PL.px - center.x, PL.pz - center.z) > ARENA_R + 40) flee();
  }
  function moveK(dx, dz) {
    K.x += dx; K.z += dz;
    let cx = K.x - center.x, cz = K.z - center.z, r = Math.hypot(cx, cz);
    if (r > ARENA_R) { K.x = center.x + cx / r * ARENA_R; K.z = center.z + cz / r * ARENA_R; }
    cx = K.x - center.x; cz = K.z - center.z; r = Math.hypot(cx, cz); if (r < OBELISK_R) { const s = r > 1e-4 ? OBELISK_R / r : 1; K.x = center.x + (r > 1e-4 ? cx * s : OBELISK_R); K.z = center.z + cz * s; }
  }

  // ---------- fase / hasil ----------
  function toPhase(n) {
    S.phase = n; K.st = 'roar'; K.t = 0; K.roarT = n === 2 ? 2.2 : 2.6; K.iframe = K.roarT; K.atk = null; K.seq = []; K.poise = 100; hideTel(); PL.atkT = -1; PL.buf = false;
    flash(0.95, 900); shake(1.0); burst(K.x, 0.6, K.z, n === 2 ? 60 : 30, n === 2 ? 7 : 9, n === 3);
    toast(n === 2 ? 'KARDUSNYA SOBEK!' : 'PEDANG SEJATI!', 1800); const L = n === 2 ? LINES.p2 : LINES.p3; say(L[0], 2300); later(2.4, () => { if (S.mode === 'fight') say(L[1], 2300); });
    PL.hp = Math.min(PL.maxHp, PL.hp + 18); { const h = H(); h && h.heal && h.heal(0.15); } K.revealT = 0; later(0.12, () => { if (S.phase >= 2) swapSteel(true); });
  }
  function endCommon() { PL.guard = false; PL.atkT = -1; hideTel(); aura.material.opacity = 0; clearWaves(); }
  function win() {
    if (S.mode !== 'fight') return; S.mode = 'end'; K.st = 'dead'; K.hp = 0; endCommon(); flash(0.9, 1200); shake(1.0); burst(K.x, 0.8, K.z, 70, 8, true);
    if (hud) { hud.res.textContent = 'KAELEN TERKALAHKAN'; hud.res.style.display = 'flex'; } say(LINES.win[0], 4500);
    unlater(endTm); endTm = later(5.2, () => finish('win'));
  }
  function lose() {
    if (S.mode !== 'fight') return; S.mode = 'end'; K.st = 'idle'; K.atk = null; endCommon();
    if (hud) { hud.res.textContent = 'KAMU TUMBANG'; hud.res.style.display = 'flex'; } say(LINES.lose[0], 4000);
    unlater(endTm); endTm = later(4.2, () => finish('lose'));
  }
  function flee() { if (S.mode !== 'fight') return; S.mode = 'end'; say(LINES.flee[0], 2500); endCommon(); unlater(endTm); endTm = later(1.2, () => finish('flee')); }
  function finish(result) {
    resetKaelen(); S.mode = 'idle'; if (hud) hud.res.style.display = 'none'; hudFight(false); showHud(false);
    try { o.onEnd && o.onEnd({ result, enemy }); const h = H(); h && h.onEnd && h.onEnd({ result, enemy }); } catch (e) { /* abaikan */ }
  }
  function resetKaelen() {
    K.x = home.x; K.z = home.z; K.yaw = Math.PI; K.hp = KAELEN.maxHp; K.poise = 100; K.st = 'idle'; K.atk = null; K.seq = []; K.cd = 1; K.speed = 0; K.dmgTaken = 0; K.revealT = 0; K.hitFlash = 0; K.lift = 0; clearWaves(); K.flinch = 0; K.iframe = 0; K.noStagger = 0; K.pAt = false; K.ev = 0; K.stag = 0; S.phase = 1; swapSteel(false); setReveal(0);
    PL.hp = PL.maxHp; PL.st = PL.maxSt; PL.guard = false; PL.atkT = -1; PL.step = 0; PL.ifr = 0; PL.stagger = 0; tgt.splice(0, 12, ...POSE.idle); cur.splice(0, 12, ...POSE.idle); place();
  }
  function start() {
    if (!S.ready || S.mode !== 'idle') return false; if (!readPlayer()) return false;
    resetKaelen(); S.mode = 'intro'; K.st = 'idle'; K.cd = 99; showHud(true); hudFight(true); syncHud(); hud && (hud.prompt.style.display = 'none'); if (tag) tag.visible = false;
    toast('PERTARUNGAN DIMULAI', 1600); say(LINES.intro[0], 3200); later(3.3, () => { if (S.mode === 'intro') say(LINES.intro[1], 2400); });
    unlater(endTm); endTm = later(4.8, () => { if (S.mode === 'intro') { S.mode = 'fight'; K.cd = 0.5; toast('LAWAN!', 800); } });
    try { o.onStart && o.onStart(enemy); const h = H(); h && h.onStart && h.onStart(enemy); } catch (e) { /* abaikan */ } return true;
  }

  // ---------- input ----------
  const inField = e => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (typeof window !== 'undefined') {
    // fase capture + stopImmediatePropagation: tombol ini diambil DULU oleh battle (tidak sampai ke inventory/aksi lain di game.js)
    window.addEventListener('keydown', e => {
      if (inField(e) || !e.key || hosted()) return; const k = e.key.toLowerCase(), fighting = S.mode === 'fight' || S.mode === 'intro';
      const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (keys.challenge.includes(k) && S.mode === 'idle' && nearHome()) { eat(); if (!e.repeat) start(); }
      else if (fighting && keys.attack.includes(k)) { eat(); if (!e.repeat) playerAttack(); }
      else if (fighting && keys.dodge.includes(k)) { eat(); if (!e.repeat) playerDodge(); }
      else if (fighting && keys.guard.includes(k)) { eat(); playerGuard(true); }
    }, true);
    window.addEventListener('keyup', e => { if (e.key && keys.guard.includes(e.key.toLowerCase()) && PL.guard) { e.stopImmediatePropagation(); playerGuard(false); } else if (e.key && keys.guard.includes(e.key.toLowerCase())) playerGuard(false); }, true);
    if (hud) {
      const tap = (id, fn) => { const b = hud.r.querySelector(id); b.addEventListener('pointerdown', ev => { ev.preventDefault(); fn(true); }); b.addEventListener('pointerup', () => fn(false)); b.addEventListener('pointerleave', () => fn(false)); };
      tap('#kb-b-atk', d => d && playerAttack()); tap('#kb-b-dod', d => d && playerDodge()); tap('#kb-b-grd', d => playerGuard(d));
      hud.prompt.addEventListener('pointerdown', ev => { ev.preventDefault(); if (S.mode === 'idle' && nearHome()) start(); });
      hudFight(false);
    }
  }
  const nearHome = () => Math.hypot(PL.px - K.x, PL.pz - K.z) < (S.viaCam ? CHALLENGE_R + 4 : CHALLENGE_R);

  // ---------- loop ----------
  function update() {
    const now = performance.now() / 1000, dt = Math.min(0.05, now - (last || now)); last = now; S.time += dt;
    const has = readPlayer();
    for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; if (t.dead) timers.splice(i, 1); else if (S.time >= t.at) { timers.splice(i, 1); t.fn(); } }
    if (S.ready && has) {
      if (S.mode === 'idle') {
        const near = nearHome(); if (hud) { hud.prompt.style.display = near ? 'block' : 'none'; hud.prompt.textContent = '⚔️ Tantang Kaelen' + (isMobile() ? '' : '  [' + (hosted() ? 'E' : keys.challenge[0].toUpperCase()) + ']'); hudFight(false); showHud(near); }
        if (near) K.yaw += wrapA(Math.atan2(PL.px - K.x, PL.pz - K.z) - K.yaw) * Math.min(1, dt * 3); if (tag) tag.visible = true;
        Object.assign(tgt, POSE.idle); tgt[5] = 0.04 + Math.sin(S.time * 1.7) * 0.02;
      } else if (S.mode === 'intro') {
        K.yaw += wrapA(Math.atan2(PL.px - K.x, PL.pz - K.z) - K.yaw) * Math.min(1, dt * 5); const t = POSE.ready; for (let i = 0; i < 10; i++) tgt[i] = t[i];
        playerUpdate(dt);
      } else if (S.mode === 'fight') {
        playerUpdate(dt); kaelenUpdate(dt); poseFromState();
      } else if (S.mode === 'end') { poseFromState(); if (K.st === 'dead') { const t = POSE.kneel; for (let i = 0; i < 10; i++) tgt[i] = t[i]; } }
    }
    // pose -> tulang
    const kk = S.mode === 'fight' && K.st === 'atk' ? 22 : 9; for (let i = 0; i < 10; i++) cur[i] = damp(cur[i], tgt[i], kk, dt);
    if (S.mode === 'idle' || S.mode === 'intro') { K.speed = damp(K.speed, 0, 8, dt); }
    if (model) { place(); applyPose(dt, K.gait, Math.sin(S.time * 3)); model.position.y += K.lift || 0; }
    // reveal
    if (S.phase >= 2) K.revealT = Math.min(1, K.revealT + dt * 1.2); setReveal(S.phase >= 2 ? K.revealT : 0);
    if (S.mode !== 'fight') K.hitFlash = Math.max(0, (K.hitFlash || 0) - dt);   // kilat merah dihitung mundur juga di luar fight (dulu macet menyala setelah pukulan terakhir)
    if (K.hitFlash > 0) for (const e of mats) { e.mt.emissive.setRGB(1, 0.2, 0.1); e.mt.emissiveIntensity = 0.9; }
    // efek
    if (tel.visible) { { const lp = K.atk && K.atk.leap; tel.position.x = lp ? K.lx1 : K.x; tel.position.z = lp ? K.lz1 : K.z; } const tt = K.atk && K.atk.tell; tel.rotation.y = tt === 'ring' ? 0 : tt === 'sector' ? K.yaw - Math.PI / 2 : K.yaw; }
    if (waveT >= 0) { waveT += dt; const s = 0.5 + waveT * (K.waveS || 22); wave.scale.set(s, 1, s); wave.material.opacity = clamp(0.9 - waveT * 1.8, 0, 1); if (waveT > 0.5) { waveT = -1; wave.visible = false; } }
    if (slashT >= 0) { slashT += dt; slashFx.material.opacity = clamp(0.95 - slashT * 5, 0, 1); slashFx.scale.setScalar((slashHeavy ? 1.35 : 1) * (1 + slashT * 1.2)); if (slashT > 0.2) { slashT = -1; slashFx.visible = false; } }
    stepDebris(dt); stepWaves(dt); syncHud(); syncInput();
  }
  function poseFromState() {
    let name = 'idle';
    if (K.st === 'atk' && K.atk) { const a = K.atk, t = K.t; name = t < K.aw ? a.p[0] : t < K.aw + a.a ? a.p[1] : 'idle'; }
    else if (K.st === 'stagger') name = 'stagger'; else if (K.st === 'roar') name = 'roar'; else if (K.st === 'move' || K.st === 'idle') name = S.phase >= 2 ? 'ready' : 'idle';
    const t = POSE[name]; for (let i = 0; i < 10; i++) tgt[i] = t[i];
    if (K.flinch > 0) tgt[5] -= 0.25;
  }

  // ---------- Kaelen sebagai MUSUH untuk sistem lock-on / skill game.js ----------
  //  Daftarkan di onKaelenStart(enemy) dan lepas di onKaelenEnd(). Posisi dalam koordinat DUNGEON dunia (selalu terbarui).
  const _w = new THREE.Vector3(), MAX_HIT = o.maxHitPct ?? 0.12;
  const worldPos = out => { parent.updateWorldMatrix(true, false); _w.set(K.x, 0, K.z); parent.localToWorld(_w); out = out || {}; out.x = _w.x; out.y = 0; out.z = _w.z; return out; };
  const enemy = {
    id: 'kaelen', name: 'Kaelen', isEnemy: true, isBoss: true, radius: 0.6, height: KAELEN.height, maxHp: KAELEN.maxHp,
    get hp() { return K.hp; }, get alive() { return K.hp > 0 && S.mode === 'fight'; }, get targetable() { return S.mode === 'fight'; },
    get x() { return worldPos().x; }, get y() { return 0; }, get z() { return worldPos().z; },
    getPosition: worldPos, getAimPoint(out) { out = worldPos(out); out.y = KAELEN.height * 0.6; return out; },
    takeDamage(n, opt = {}) { return hurtKaelen(Math.min(Math.max(0, n), KAELEN.maxHp * MAX_HIT), !!opt.heavy); },   // satu pukulan dibatasi 12% HP agar tidak sekali mati
    object3D: group,
  };
  const api = {
    enemy, group, update, start, isActive: () => S.mode !== 'idle', mode: () => S.mode, phase: () => S.phase, ready: () => S.ready,
    nearChallenge: () => S.mode === 'idle' && nearHome(), cancel: () => { if (S.mode !== 'idle') { unlater(endTm); endCommon(); finish('flee'); } },
    player: PL, boss: K, KAELEN,
  };
  globalThis.KAELEN_BATTLE = api;   // game.js mengambil handle ini (world.js tidak perlu diubah)
  return api;
}
