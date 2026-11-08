// ============================================================
//  SISTEM CHUNK DUNIA
//  Dunia tetap SATU hamparan (tanpa layar loading / teleport antar-wilayah, langit & tanah dipakai bersama),
//  tetapi isinya dibagi jadi beberapa chunk yang masing-masing:
//    - dibangun terpisah (boleh bertahap: generator yang dijalankan sedikit demi sedikit per frame),
//    - hanya DIGAMBAR kalau pemain cukup dekat (selebihnya sudah tertutup kabut),
//    - hanya DIPERBARUI (animasi, api, partikel) kalau sedang tampil,
//    - punya daftar collider sendiri (pakai grid), hanya dicek kalau pemain di dekatnya.
//  Berkas ini sengaja TIDAK meng-import three.js: hanya butuh objek dengan .add() dan .visible.
// ============================================================

export const CHUNK_CFG = {
  SHOW_R: 190,     // m dari tepi chunk: mulai tampil (kabut dunia sudah ±95% menutup di jarak ini)
  HIDE_R: 215,     // m dari tepi chunk: disembunyikan lagi (selisih = histeresis, supaya tidak kedap-kedip di perbatasan)
  BUDGET_MS: 4,    // jatah waktu membangun chunk per frame (HP: 2.5) — sisanya untuk menggambar
  COLLIDE_PAD: 14, // collider sebuah chunk hanya dicek kalau posisi < sekian m dari tepi chunk
};

const hypot = Math.hypot;

// jarak ke tepi gabungan lingkaran: negatif = di dalam
export function circlesDist(circles, x, z) {
  let m = Infinity;
  for (let i = 0; i < circles.length; i++) { const c = circles[i], d = hypot(x - c.x, z - c.z) - c.r; if (d < m) m = d; }
  return m;
}

// ---------- Grid collider (lingkaran statis {x,z,r}) ----------
// Tanpa grid, tiap panggilan collide() memeriksa SEMUA lingkaran; kota punya ribuan (dinding bangunan, tembok).
export class ColliderGrid {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); this.count = 0; }
  static key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); }
  build(list) { this.map.clear(); this.count = 0; for (const c of list) this.add(c); return this; }
  add(c) {
    const s = this.cell, x0 = Math.floor((c.x - c.r) / s), x1 = Math.floor((c.x + c.r) / s), z0 = Math.floor((c.z - c.r) / s), z1 = Math.floor((c.z + c.r) / s);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = ColliderGrid.key(ix, iz); let l = this.map.get(k); if (!l) this.map.set(k, l = []); l.push(c);
    }
    this.count++;
  }
  // dorong pos (x,z) keluar dari lingkaran yang menyentuh lingkaran pemain berjari-jari r
  collide(pos, r) {
    const s = this.cell, x0 = Math.floor((pos.x - r) / s), x1 = Math.floor((pos.x + r) / s), z0 = Math.floor((pos.z - r) / s), z1 = Math.floor((pos.z + r) / s);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const l = this.map.get(ColliderGrid.key(ix, iz)); if (!l) continue;
      for (let i = 0; i < l.length; i++) pushOut(pos, r, l[i]);
    }
  }
}
function pushOut(pos, r, c) {
  const dx = pos.x - c.x, dz = pos.z - c.z, min = r + c.r, l2 = dx * dx + dz * dz;
  if (l2 >= min * min) return;
  const l = Math.sqrt(l2) || 1e-4; pos.x = c.x + dx / l * min; pos.z = c.z + dz / l * min;
}

// ---------- Manajer chunk ----------
// def: {
//   id, name,
//   circles: [{x,z,r}]        area chunk (untuk jarak ke pemain)
//   group:   objek 3D tempat isi chunk ditaruh (dibuat pemanggil)
//   loadR:   mulai dibangun saat jarak < loadR (default Infinity = langsung)
//   build:   (chunk) => generator | fungsi biasa; tiap `yield` = titik berhenti (lanjut di frame berikutnya)
//   adopt:   true = isi chunk SUDAH dibangun oleh pemanggil (tidak ada build); langsung 'ready'
//   update:  (dt, t, pp, cp) dipanggil tiap frame HANYA saat chunk tampil
//   onReady / onShow / onHide: (chunk) => void
// }
// chunk.colliders = lingkaran statis (diisi saat build, lalu dimasukkan ke grid), chunk.dyn = lingkaran bergerak (NPC)
export class ChunkManager {
  constructor(root, opts = {}) {
    this.root = root; this.chunks = []; this.byId = {};
    this.showR = opts.showR ?? CHUNK_CFG.SHOW_R; this.hideR = opts.hideR ?? CHUNK_CFG.HIDE_R;
    this.budgetMs = opts.budgetMs ?? CHUNK_CFG.BUDGET_MS; this.pad = opts.pad ?? CHUNK_CFG.COLLIDE_PAD;
    this.now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.log = opts.log || (() => {});
  }
  add(def) {
    const c = {
      id: def.id, name: def.name || def.id, def, circles: def.circles, group: def.group, loadR: def.loadR ?? Infinity,
      state: 'idle', visible: false, dist: Infinity, it: null, steps: 0, buildMs: 0,
      colliders: def.colliders || [], dyn: def.dyn || [], grid: new ColliderGrid(),
    };
    this.chunks.push(c); this.byId[c.id] = c;
    if (def.adopt) this._ready(c);
    return c;
  }
  get(id) { return this.byId[id]; }
  _start(c) {
    c.state = 'building'; c._t0 = this.now();
    const r = c.def.build ? c.def.build(c) : null;
    if (r && typeof r.next === 'function') c.it = r; else this._ready(c);
  }
  _ready(c) {
    c.state = 'ready'; c.it = null; c.buildMs = c._t0 ? this.now() - c._t0 : 0;
    c.grid.build(c.colliders);
    if (c.group && c.group.parent !== this.root) this.root.add(c.group);
    if (c.group) c.group.visible = false;   // tampil hanya kalau jaraknya sudah masuk SHOW_R (dinilai di update / refresh)
    this.log(`chunk "${c.id}" siap (${c.steps} langkah, ${c.buildMs.toFixed(0)} ms, ${c.grid.count} collider)`);
    if (c.def.onReady) c.def.onReady(c);
  }
  // bangun SEKARANG sampai selesai (dipakai kalau pemain tiba-tiba butuh chunk-nya, mis. teleport)
  ensure(id) {
    const c = this.byId[id]; if (!c || c.state === 'ready' || c.state === 'failed') return c;
    if (c.state === 'idle') this._start(c);
    try { while (c.it) { const r = c.it.next(); c.steps++; if (r.done) { this._ready(c); break; } } }
    catch (e) { console.error(`chunk "${id}" gagal dibangun`, e); c.state = 'failed'; c.it = null; }
    return c;
  }
  _show(c, v) {
    if (c.visible === v) return; c.visible = v;
    if (c.group) c.group.visible = v;
    if (v && c.def.onShow) c.def.onShow(c);
    if (!v && c.def.onHide) c.def.onHide(c);
  }
  // nilai ulang tampil/sembunyi SEKETIKA tanpa histeresis (setelah pemain dipindah jauh: mulai ulang, keluar-masuk interior)
  refresh(x, z) {
    for (const c of this.chunks) { c.dist = circlesDist(c.circles, x, z); if (c.state === 'ready') this._show(c, c.dist < this.showR); }
  }
  update(dt, t, pp, cp) {
    const x = pp.x, z = pp.z;
    for (const c of this.chunks) {
      c.dist = circlesDist(c.circles, x, z);
      if (c.state === 'idle' && c.dist < c.loadR) this._start(c);
    }
    this._stepBuilds();
    for (const c of this.chunks) {
      if (c.state !== 'ready') continue;
      this._show(c, c.visible ? c.dist < this.hideR : c.dist < this.showR);
      if (c.visible && c.def.update) c.def.update(dt, t, pp, cp);
    }
  }
  _stepBuilds() {
    const t0 = this.now();
    for (const c of this.chunks) {
      if (c.state !== 'building' || !c.it) continue;
      for (;;) {
        let r;
        try { r = c.it.next(); } catch (e) { console.error(`chunk "${c.id}" gagal dibangun`, e); c.state = 'failed'; c.it = null; break; }
        c.steps++;
        if (r.done) { this._ready(c); break; }
        if (this.now() - t0 >= this.budgetMs) return;   // jatah frame ini habis; lanjut frame berikutnya
      }
    }
  }
  // dorong pos keluar dari semua collider chunk yang berada di dekatnya
  collide(pos, r) {
    for (const c of this.chunks) {
      if (c.state !== 'ready') continue;
      if (circlesDist(c.circles, pos.x, pos.z) > this.pad + r) continue;
      c.grid.collide(pos, r);
      for (let i = 0; i < c.dyn.length; i++) pushOut(pos, r, c.dyn[i]);
    }
  }
  info() {
    return this.chunks.map(c => `${c.name}: ${c.state === 'ready' ? (c.visible ? 'TAMPIL' : 'tersembunyi') : c.state === 'building' ? 'membangun ' + c.steps : c.state} · ${isFinite(c.dist) ? Math.round(c.dist) : '-'} m`).join('\n');
  }
}
