// ============================================================
//  Musik latar: world.mp3 (dunia luar & desa) dan dungeon.mp3 (arena dungeon)
//  - Pindah area = cross-fade halus; pengaturan (musik nyala/mati + volume) tersimpan di perangkat.
//  - Browser memblokir suara sebelum ada sentuhan/klik pertama, jadi musik baru mulai setelah itu.
// ============================================================
const KEY = 'dungeon.audio.v1';
const FILES = { world: 'world.mp3', dungeon: 'dungeon.mp3' };
const FADE = 0.7; // detik (konstanta waktu cross-fade)

const SFX_FILES = { sword: 'sfx/sword.mp3', slash: 'sfx/slash.mp3', choir: 'sfx/choir.mp3', swordbreak: 'sfx/swordbreak.mp3', thud: 'sfx/thud.mp3', roar: 'sfx/roar.mp3', breath: 'sfx/breath.mp3', explosion: 'sfx/explosion.mp3', fireball: 'sfx/fireball.mp3' };

const BOOST = { sword: 2.2, slash: 1.3, fireball: 1.3, choir: 1.6, swordbreak: 1.3 }; // file aslinya pelan -> dikeraskan sedikit biar seimbang dengan yang lain
const st = { music: true, vol: 0.6, sfx: 0.8 };
try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* penyimpanan tidak tersedia */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* abaikan */ } };

let ctx = null, master = null, sfxBus = null, cur = null, unlocked = false;
const tr = {}, bufs = {};

function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = st.vol; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = st.sfx; sfxBus.connect(ctx.destination);
  for (const k in SFX_FILES) // efek suara dimuat sebagai buffer (tanpa jeda saat dipicu)
    fetch(SFX_FILES[k]).then(r => r.arrayBuffer()).then(ab => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no))).then(b => { bufs[k] = b; }).catch(e => console.warn('SFX gagal dimuat:', k, e));
  for (const k in FILES) { // lewat GainNode supaya volume juga bekerja di iPhone/iPad
    const el = new Audio(FILES[k]); el.loop = true; el.preload = 'auto';
    const g = ctx.createGain(); g.gain.value = 0;
    ctx.createMediaElementSource(el).connect(g); g.connect(master);
    tr[k] = { el, g };
  }
}

function apply() {
  if (!ctx || !unlocked) return;
  master.gain.setTargetAtTime(st.vol, ctx.currentTime, 0.05); sfxBus.gain.setTargetAtTime(st.sfx, ctx.currentTime, 0.05);
  for (const k in tr) {
    const t = tr[k], on = st.music && k === cur;
    t.g.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, FADE);
    if (on) { if (t.el.paused) { if (k === 'dungeon') t.el.currentTime = 0; t.el.play().catch(() => {}); } }
    else if (!t.el.paused) setTimeout(() => { if (!(st.music && k === cur)) t.el.pause(); }, FADE * 5000); // pause setelah fade selesai
  }
}

function unlock() {
  init(); if (!ctx) return;
  ctx.resume().then(() => { unlocked = true; apply(); }).catch(() => {});
  removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); removeEventListener('touchend', unlock, true);
}
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true); addEventListener('touchend', unlock, true);

document.addEventListener('visibilitychange', () => { // tab disembunyikan -> musik berhenti
  if (document.hidden) for (const k in tr) tr[k].el.pause(); else apply();
});

export const audio = {
  get music() { return st.music; },
  get volume() { return st.vol; },
  setScene(name) { if (name === cur) return; cur = name; apply(); }, // 'world' | 'dungeon' | null (hening)
  setMusic(on) { st.music = !!on; save(); apply(); },
  setVolume(v) { st.vol = Math.min(1, Math.max(0, v)); save(); apply(); },
  get sfxVolume() { return st.sfx; },
  setSfxVolume(v) { st.sfx = Math.min(1, Math.max(0, v)); save(); apply(); },
  // putar efek suara. opts: vol (0-1), delay (detik), from (mulai dari detik ke-n), maxDur (dipotong halus setelah n detik), rate (kecepatan/nada)
  sfx(name, opts = {}) {
    const b = bufs[name]; if (!ctx || !unlocked || !b || st.sfx <= 0) return;
    const src = ctx.createBufferSource(), g = ctx.createGain(), t0 = ctx.currentTime + (opts.delay || 0), from = opts.from || 0;
    src.buffer = b; if (opts.rate) src.playbackRate.value = opts.rate;
    g.gain.value = (opts.vol == null ? 1 : opts.vol) * (BOOST[name] || 1); src.connect(g); g.connect(sfxBus);
    src.start(t0, from);
    if (opts.maxDur) { g.gain.setValueAtTime(g.gain.value, t0 + opts.maxDur - 0.5); g.gain.linearRampToValueAtTime(0, t0 + opts.maxDur); src.stop(t0 + opts.maxDur + 0.05); }
    src.onended = () => { src.disconnect(); g.disconnect(); };
  },
};
