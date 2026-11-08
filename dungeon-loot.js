// ---------- Loot dungeon: item jatuhan monster (sesuai elemen dungeon), peti hadiah bos, tas item ----------
// Dipakai dari game.js:
//   const loot = createLoot(THREE, { scene, player, rnd, burst, lineSparks, toast, clampPos(p), heal(frac) });
//   loot.drop(x, z, elemen, { strong })   monster biasa mati -> item berhamburan (diambil otomatis saat didekati)
//   loot.chest(x, z, elemen, { faceTo })  bos mati -> peti hadiah jatuh dari atas; dibuka otomatis saat pemain mendekat
//   loot.update(dt, state)                tiap frame (gerak item, peti, tombol tas)
//   loot.blocksWin()                      true selama peti bos belum dibuka (kemenangan menunggu peti)
//   loot.collectAll() / loot.clear()      ambil semua item yang tercecer / bersihkan item & peti (ganti dungeon, mulai ulang)
//   loot.toggleBag() / loot.usePotion()   tas item (tombol 🎒 / tombol B) & pakai Ramuan Pemulih (tombol H)
//   loot.applyEquip()                     terapkan pedang yang sedang dipakai (panggil sekali saat game mulai; selanjutnya otomatis lewat ctx.onEquip(pedang))
//   loot.openForge() / loot.closeForge()  tampilan tempa (dipanggil dari dialog Borin di toko Pandai Besi); ctx.atSmith() = true bila pemain sedang di dalam toko Pandai Besi (tanpa ctx.atSmith, menempa bebas di mana saja)
// Pedang (equipment): ditempa HANYA di toko Pandai Besi (tampilan tempa, lewat Borin) dari bahan elemen + permata + inti bos (FORGE); tas hanya menampilkan & memakai pedang yang sudah dimiliki. Efek: pengali damage (mul) + warna & cahaya bilah. Daftar di SWORDS.
// Isi tas disimpan di localStorage (SAVE_KEY). Semua angka drop & hadiah ada di DROP / CHEST di bawah.

// elemen -> nama item. Kunci sama dengan id tema dungeon di game.js (kota = Gua Kristal, asal = dungeon di lubang dunia luar)
export const ELEMENTS = {
  kota:      { name: 'Gua Kristal',       icon: '💎', col: 0x6ff0ff, mat: 'Serpihan Kristal', gem: 'Permata Kristal',   relic: 'Inti Kristal' },
  cahaya:    { name: 'Dungeon Cahaya',    icon: '✨', col: 0xffe27a, mat: 'Serpihan Cahaya',  gem: 'Permata Cahaya',    relic: 'Inti Cahaya' },
  kegelapan: { name: 'Dungeon Kegelapan', icon: '🌑', col: 0xb050ff, mat: 'Pecahan Bayangan', gem: 'Permata Bayangan',  relic: 'Inti Kegelapan' },
  api:       { name: 'Dungeon Api',       icon: '🔥', col: 0xff7a20, mat: 'Bara Api',         gem: 'Permata Api',       relic: 'Inti Api' },
  es:        { name: 'Dungeon Es',        icon: '❄️', col: 0x9fe8ff, mat: 'Kristal Es',       gem: 'Permata Es',        relic: 'Inti Es' },
  batu:      { name: 'Dungeon Batu',      icon: '🪨', col: 0xd0b890, mat: 'Bongkah Batu',     gem: 'Permata Batu',      relic: 'Inti Batu' },
  asal:      { name: 'Dungeon Purba',     icon: '🔮', col: 0xc070ff, mat: 'Pecahan Purba',    gem: 'Permata Purba',     relic: 'Inti Purba' },
};
const ORDER = ['kota', 'cahaya', 'kegelapan', 'api', 'es', 'batu', 'asal'];

// peluang & jumlah drop monster biasa (strong = monster yang lebih tangguh)
const DROP = {
  mat:    { p: 0.6, pStrong: 0.9, stack2: 0.2 },    // bahan elemen (peluang; peluang tumpukan 2)
  potion: { p: 0.15, pStrong: 0.3 },                // Ramuan Pemulih
  gem:    { p: 0.04, pStrong: 0.1 },                // permata elemen (langka)
};
// isi peti bos (pasti): bahan elemen, ramuan, permata, 1 inti elemen
const CHEST = { mat: [6, 9], potion: [2, 3], gem: [1, 2], relic: 1, open: 2.6 /* jarak buka (m) */, winDelay: 2.8 /* jeda sebelum layar kemenangan (dtk) */ };
// pedang: mul = pengali semua damage pemain; blade/emi/ei = warna bilah, warna & kekuatan pendar; glow = warna aura bilah (null = tanpa aura)
export const SWORDS = {
  biasa:     { name: 'Pedang Biasa',     icon: '🗡️', mul: 1,    blade: 0xc8d4e0, emi: 0x000000, ei: 0,   glow: null,     desc: 'Pedang bawaan' },
  kota:      { name: 'Pedang Kristal',   icon: '💎', mul: 1.2,  blade: 0x9fe8ff, emi: 0x2a9ab8, ei: 0.8, glow: 0x6ff0ff, desc: 'Bilah kristal biru' },
  cahaya:    { name: 'Pedang Cahaya',    icon: '✨', mul: 1.25, blade: 0xfff0b0, emi: 0xb08a20, ei: 0.8, glow: 0xffe27a, desc: 'Bilah emas bercahaya' },
  kegelapan: { name: 'Pedang Bayangan',  icon: '🌑', mul: 1.25, blade: 0x4a2a70, emi: 0x7a20d0, ei: 0.9, glow: 0xb050ff, desc: 'Bilah ungu gelap' },
  api:       { name: 'Pedang Api',       icon: '🔥', mul: 1.3,  blade: 0xff9a50, emi: 0xd03000, ei: 1.1, glow: 0xff6a20, desc: 'Bilah membara' },
  es:        { name: 'Pedang Es',        icon: '❄️', mul: 1.25, blade: 0xcfeaff, emi: 0x3a8ac0, ei: 0.8, glow: 0x9fe8ff, desc: 'Bilah es membeku' },
  batu:      { name: 'Pedang Batu',      icon: '🪨', mul: 1.3,  blade: 0xb8a888, emi: 0x6a5030, ei: 0.4, glow: 0xd0b890, desc: 'Bilah batu berat' },
  asal:      { name: 'Pedang Purba',     icon: '🔮', mul: 1.2,  blade: 0xd090ff, emi: 0x8a30c0, ei: 0.9, glow: 0xc070ff, desc: 'Bilah sihir purba' },
};
const FORGE = { mat: 12, gem: 2, relic: 1 };   // biaya menempa 1 pedang elemen: bahan elemen, permata elemen, inti elemen (inti hanya dari peti bos)
const POTION = { name: 'Ramuan Pemulih', icon: '🧪', col: 0xff5a7a, heal: 0.4 };   // heal = bagian HP maksimum yang dipulihkan
const MAGNET = 3.4;   // jarak item mulai terhisap ke pemain
const SAVE_KEY = 'dungeonLoot.v1';

const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { return {}; } };
const save = inv => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(inv)); } catch (e) { /* abaikan */ } };

export function createLoot(THREE, ctx) {
  let forgeMode = false;   // true = panel sedang menampilkan daftar tempa (dibuka lewat Borin), false = tas biasa
  const canForge = () => { try { return !ctx.atSmith || !!ctx.atSmith(); } catch (e) { return false; } };   // menempa hanya boleh di dalam toko Pandai Besi
  const { scene } = ctx, inv = load();
  const rnd = (a, b) => a + Math.random() * (b - a), ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const itemInfo = id => {
    if (id === 'potion') return { name: POTION.name, icon: POTION.icon, col: POTION.col, kind: 'potion' };
    const [el, kind] = id.split(':'), E = ELEMENTS[el] || ELEMENTS.asal;
    return { el, kind, col: E.col, name: kind === 'mat' ? E.mat : kind === 'gem' ? E.gem : E.relic, icon: kind === 'mat' ? E.icon : kind === 'gem' ? '💠' : '🏆' };
  };

  // ---------- bahan & bentuk bersama ----------
  const mats = new Map();
  const basic = (col, op = 1, add = false) => {
    const k = col + '|' + op + '|' + add; let m = mats.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: col, transparent: op < 1 || add, opacity: op, fog: false, depthWrite: !(op < 1 || add), blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide }); mats.set(k, m); }
    return m;
  };
  const std = (col, o = {}) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0, ...o });
  const octa = new THREE.OctahedronGeometry(0.22), sph = new THREE.SphereGeometry(0.17, 12, 10), neck = new THREE.CylinderGeometry(0.06, 0.08, 0.16, 8);

  // ---------- UI: tombol tas, daftar tas, kartu hadiah, umpan "+1 item" ----------
  const BOX = 'background:rgba(28,16,12,.92);border:2px solid #d9b24a;border-radius:12px;color:#fff4dc;font:15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.55);';
  const stop = el => { for (const t of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(t, e => e.stopPropagation()); };
  const bagBtn = document.createElement('button');
  bagBtn.type = 'button'; bagBtn.hidden = true; bagBtn.title = 'Tas item (B)';
  bagBtn.style.cssText = BOX + 'position:fixed;left:12px;top:30%;z-index:34;padding:8px 12px;cursor:pointer;user-select:none;-webkit-user-select:none;';
  bagBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggleBag(); }); stop(bagBtn);
  const panel = document.createElement('div');
  panel.hidden = true; panel.style.cssText = BOX + 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,92vw);max-height:70vh;overflow:auto;box-sizing:border-box;padding:14px 16px;z-index:41;user-select:none;-webkit-user-select:none;';
  stop(panel);
  const card = document.createElement('div');
  card.hidden = true; card.style.cssText = BOX + 'position:fixed;left:50%;top:14%;transform:translateX(-50%);width:min(380px,90vw);box-sizing:border-box;padding:12px 16px;z-index:42;text-align:center;';
  stop(card); card.addEventListener('pointerdown', () => { card.hidden = true; });
  const feedBox = document.createElement('div');
  feedBox.style.cssText = 'position:fixed;right:12px;top:34%;z-index:33;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none;font:14px/1.3 system-ui,sans-serif;';
  document.body.append(bagBtn, panel, card, feedBox);

  function feed(text, col = 0xffffff) {
    const d = document.createElement('div');
    d.textContent = text; d.style.cssText = 'padding:3px 10px;border-radius:8px;background:rgba(20,12,8,.82);color:#fff4dc;border-left:4px solid #' + col.toString(16).padStart(6, '0') + ';transition:opacity .5s;';
    feedBox.appendChild(d); while (feedBox.children.length > 5) feedBox.firstChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 520); }, 2000);
  }
  const count = id => inv[id] | 0;
  const owns = id => id === 'biasa' || count('sword:' + id) > 0;
  const equippedId = () => (SWORDS[inv._equip] && owns(inv._equip)) ? inv._equip : 'biasa';
  function refreshBag() {
    const pn = count('potion');
    bagBtn.textContent = '🎒' + (pn > 0 ? ' 🧪' + pn : '');
    if (panel.hidden) return;
    let h = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#ffd980;font-size:17px">' + (forgeMode ? '🔨 Tempa di Pandai Besi' : '🎒 Tas Item') + '</b><button data-x style="' + BTN + '">Tutup</button></div>';
    if (!forgeMode) h += '<div style="margin:8px 0;padding:8px;border:1px solid rgba(217,178,74,.5);border-radius:8px;display:flex;justify-content:space-between;align-items:center"><span>' + POTION.icon + ' ' + POTION.name + ' ×' + pn + '<br><small style="opacity:.75">Pulihkan ' + Math.round(POTION.heal * 100) + '% HP (tombol H)</small></span><button data-p style="' + BTN + (pn > 0 ? '' : 'opacity:.45;') + '">Pakai</button></div>';
    h += '<div style="margin-top:10px;color:#ffd980">⚔️ Pedang <small style="opacity:.7">(' + (forgeMode ? 'tempa dari bahan di bawah; menambah damage' : 'menambah damage') + ')</small></div>';
    for (const id of forgeMode ? ORDER : ['biasa', ...ORDER].filter(owns)) {   // tas = hanya pedang yang sudah dimiliki (tanpa resep / tempa); daftar tempa hanya di tampilan Borin
      const S = SWORDS[id], on = id === equippedId(), has = owns(id);
      let right;
      if (on) right = '<span style="color:#9fe89f">Dipakai</span>';
      else if (has) right = '<button data-eq="' + id + '" style="' + BTN + '">Pakai</button>';
      else {
        const E = ELEMENTS[id], need = [[E.icon, count(id + ':mat'), FORGE.mat], ['💠', count(id + ':gem'), FORGE.gem], ['🏆', count(id + ':relic'), FORGE.relic]];
        const ok = need.every(n => n[1] >= n[2]);
        right = canForge() ? '<button data-forge="' + id + '" style="' + BTN + (ok ? '' : 'opacity:.45;') + '">Tempa</button>' : '<span style="opacity:.65;font-size:13px">🔒 Pandai Besi</span>';
        S._cost = need.map(n => '<span style="color:' + (n[1] >= n[2] ? '#9fe89f' : '#ff8a8a') + '">' + n[0] + n[1] + '/' + n[2] + '</span>').join(' ');
      }
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 6px;margin-top:3px;border-radius:8px;' + (on ? 'background:rgba(125,82,30,.55);' : '') + '"><span>' + S.icon + ' ' + S.name + ' <b>×' + S.mul.toFixed(2).replace(/0$/, '') + '</b>' + (has || id === 'biasa' ? '' : '<br><small>' + S._cost + '</small>') + '</span>' + right + '</div>';
    }
    let any = false;
    for (const el of ORDER) {
      const rows = ['mat', 'gem', 'relic'].map(k => [el + ':' + k, count(el + ':' + k)]).filter(r => r[1] > 0);
      if (!rows.length) continue; any = true;
      h += '<div style="margin-top:8px;color:#ffd980">' + ELEMENTS[el].icon + ' ' + ELEMENTS[el].name + '</div>';
      for (const [id, n] of rows) { const I = itemInfo(id); h += '<div style="display:flex;justify-content:space-between;padding:2px 6px"><span>' + I.icon + ' ' + I.name + '</span><b>×' + n + '</b></div>'; }
    }
    if (!any) h += '<div style="opacity:.7;margin-top:8px">Belum ada bahan. Kalahkan monster di dungeon untuk mendapatkan item sesuai elemen dungeon, dan buka peti setelah mengalahkan bos.</div>';
    panel.innerHTML = h;
  }
  panel.addEventListener('click', e => {   // satu penangan klik untuk semua tombol di dalam tas
    const b = e.target.closest && e.target.closest('button'); if (!b) return;
    if ('x' in b.dataset) toggleBag(false); else if ('p' in b.dataset) usePotion(); else if (b.dataset.eq) equip(b.dataset.eq); else if (b.dataset.forge) forge(b.dataset.forge);
  });
  const BTN = 'padding:5px 12px;border-radius:8px;border:1px solid #d9b24a;background:rgba(125,82,30,.95);color:#fff4dc;font:inherit;cursor:pointer;';
  function toggleBag(on = panel.hidden) { forgeMode = false; panel.hidden = !on; refreshBag(); }
  function openForge(on = true) { if (on && !canForge()) { feed('🔒 Menempa hanya bisa di toko Pandai Besi', 0xffd980); return; } forgeMode = !!on; panel.hidden = !on; refreshBag(); }   // tampilan tempa: hanya daftar pedang + bahan
  function closeForge() { if (forgeMode) { forgeMode = false; panel.hidden = true; } }   // dipanggil saat pemain keluar dari toko
  function add(id, n) { inv[id] = count(id) + n; save(inv); refreshBag(); }
  function applyEquip() { if (ctx.onEquip) ctx.onEquip({ id: equippedId(), ...SWORDS[equippedId()] }); }   // id dipakai game.js untuk memilih model 3D pedang (pedang-model.js)
  function equip(id) {
    if (!SWORDS[id] || !owns(id)) return false;
    inv._equip = id; save(inv); applyEquip(); refreshBag(); feed('⚔️ ' + SWORDS[id].name + ' dipakai (damage ×' + SWORDS[id].mul + ')', SWORDS[id].blade); return true;
  }
  function forge(id) {
    if (!ELEMENTS[id] || owns(id)) return false;
    if (!canForge()) { feed('🔒 Menempa hanya bisa di toko Pandai Besi', 0xffd980); return false; }
    if (count(id + ':mat') < FORGE.mat || count(id + ':gem') < FORGE.gem || count(id + ':relic') < FORGE.relic) { feed('Bahan belum cukup untuk ' + SWORDS[id].name, 0xff8a8a); return false; }
    inv[id + ':mat'] = count(id + ':mat') - FORGE.mat; inv[id + ':gem'] = count(id + ':gem') - FORGE.gem; inv[id + ':relic'] = count(id + ':relic') - FORGE.relic;
    inv['sword:' + id] = 1; ctx.burst(ctx.player().clone ? ctx.player().clone().setY(1.2) : ctx.player(), ELEMENTS[id].col, 24, 6);
    feed('🔨 ' + SWORDS[id].name + ' berhasil ditempa!', SWORDS[id].blade); return equip(id);
  }
  function usePotion() {
    if (count('potion') <= 0) { feed('Tidak punya ' + POTION.name, POTION.col); return false; }
    if (!ctx.heal(POTION.heal)) { feed('HP sudah penuh', POTION.col); return false; }
    inv.potion = count('potion') - 1; save(inv); refreshBag(); feed(POTION.icon + ' ' + POTION.name + ' dipakai', POTION.col); return true;
  }
  let cardT = 0;
  function showCard(el, rewards) {
    const E = ELEMENTS[el] || ELEMENTS.asal;
    card.innerHTML = '<b style="color:#ffd980;font-size:17px">🎁 Peti Harta — ' + E.name + '</b>' + rewards.map(([id, n]) => { const I = itemInfo(id); return '<div style="margin-top:4px">' + I.icon + ' ' + I.name + ' <b>×' + n + '</b></div>'; }).join('') + '<div style="margin-top:6px;font-size:12px;opacity:.7">Tersimpan di tas 🎒 (tombol B)</div>';
    card.hidden = false; cardT = 6;
  }
  refreshBag();

  // ---------- item di lantai ----------
  const pickups = [];
  function mkMesh(id) {
    const I = itemInfo(id), g = new THREE.Group();
    if (id === 'potion') { const b = new THREE.Mesh(sph, basic(I.col)); const n = new THREE.Mesh(neck, basic(0xffffff)); n.position.y = 0.2; g.add(b, n); }
    else { const b = new THREE.Mesh(octa, basic(I.kind === 'gem' ? 0xffffff : I.col)); b.scale.set(1, 1.5, 1); if (I.kind === 'gem') b.scale.multiplyScalar(1.3); g.add(b); }
    const aura = new THREE.Mesh(octa, basic(I.col, 0.35, true)); aura.scale.set(1.9, 2.6, 1.9); g.add(aura);
    return g;
  }
  function spawn(id, n, x, z, o = {}) {
    const g = mkMesh(id); if (n > 1) g.scale.setScalar(1.25); scene.add(g);
    const a = rnd(0, 6.283), sp = o.sp ?? rnd(1.5, 3.5);
    const p = { id, n, g, x, z, y: o.y ?? 0.9, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: o.vy ?? rnd(4.5, 7), mode: 'fall', t: 0, ph: rnd(0, 6.283), fly: 0, cos: !!o.cos };
    g.position.set(x, p.y, z); pickups.push(p); return p;
  }
  function drop(x, z, el, o = {}) {
    if (!ELEMENTS[el]) el = 'asal';
    const s = !!o.strong, list = [];
    if (Math.random() < (s ? DROP.mat.pStrong : DROP.mat.p)) list.push([el + ':mat', Math.random() < DROP.mat.stack2 ? 2 : 1]);
    if (Math.random() < (s ? DROP.potion.pStrong : DROP.potion.p)) list.push(['potion', 1]);
    if (Math.random() < (s ? DROP.gem.pStrong : DROP.gem.p)) list.push([el + ':gem', 1]);
    for (const [id, n] of list) spawn(id, n, x, z);
    return list.length;
  }
  function collect(p) {
    scene.remove(p.g);
    if (p.cos) return;
    add(p.id, p.n); const I = itemInfo(p.id); feed('+' + p.n + ' ' + I.icon + ' ' + I.name, I.col);
    ctx.burst(new THREE.Vector3(p.x, p.y, p.z), I.col, 6, 3);
  }

  // ---------- peti hadiah bos ----------
  let chestO = null;
  function mkChest(col) {
    const g = new THREE.Group(), wood = std(0x7a4a22, { emissive: 0x2a1408 }), gold = std(0xd9b24a, { metalness: 0.8, roughness: 0.35, emissive: 0x4a3200 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), wood); base.position.y = 0.35; g.add(base);
    for (const sx of [-0.48, 0.48]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.74, 0.94), gold); b.position.set(sx, 0.35, 0); g.add(b); }
    const pivot = new THREE.Group(); pivot.position.set(0, 0.7, -0.45); g.add(pivot);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 18, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.z = 0.45; pivot.add(lid);
    for (const sx of [-0.48, 0.48]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.14, 18, 1, false, 0, Math.PI), gold); b.rotation.z = Math.PI / 2; b.position.set(sx, 0, 0.45); pivot.add(b); }
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.1), gold); clasp.position.set(0, 0.66, 0.47); g.add(clasp);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), basic(col, 0, true)); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.71; g.add(inner);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.75, 7, 14, 1, true), basic(col, 0.2, true)); beam.position.y = 3.5; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.35, 32), basic(col, 0.5, true)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    return { g, pivot, inner, beam, ring };
  }
  function chest(x, z, el, o = {}) {
    if (chestO) {   // peti lama masih ada (mis. bos level 3 lalu naga di dungeon utama): jangan abaikan peti baru. Peti lama yang belum dibuka dibuka otomatis dulu (hadiahnya tidak hilang), lalu dihapus
      if (chestO.st === 'drop' || chestO.st === 'idle') openChest(chestO);
      scene.remove(chestO.g); chestO = null;
    }
    if (!ELEMENTS[el]) el = 'asal';
    const E = ELEMENTS[el], m = mkChest(E.col), pp = o.faceTo || ctx.player();
    m.g.position.set(x, 9, z); m.g.rotation.y = Math.atan2(pp.x - x, pp.z - z); scene.add(m.g);
    chestO = { ...m, el, x, z, y: 9, vy: 0, st: 'drop', o: 0, t: 0, done: false };
  }
  function openChest(c) {
    c.st = 'opening'; c.o = 0;
    const E = ELEMENTS[c.el], rewards = [[c.el + ':mat', ri(...CHEST.mat)], ['potion', ri(...CHEST.potion)], [c.el + ':gem', ri(...CHEST.gem)], [c.el + ':relic', CHEST.relic]];
    for (const [id, n] of rewards) add(id, n);
    showCard(c.el, rewards);
    const top = new THREE.Vector3(c.x, 1.2, c.z);
    ctx.burst(top, E.col, 30, 8); ctx.burst(top, 0xffffff, 18, 6); ctx.lineSparks(top, 30, 9, 1.2, [0xffffff, E.col]);
    for (const [id, n] of rewards) for (let i = 0; i < Math.min(5, n); i++) spawn(id, 1, c.x, c.z, { y: 1.1, vy: rnd(5, 9), sp: rnd(0.5, 2.2), cos: true });   // hanya hiasan: item beterbangan lalu terhisap ke pemain (isi tas sudah ditambah di atas)
  }
  function chestTick(c, dt, pp) {
    c.t += dt; const E = ELEMENTS[c.el], pulse = 0.5 + 0.5 * Math.sin(c.t * 3);
    if (c.st === 'drop') {
      c.vy -= 22 * dt; c.y += c.vy * dt;
      if (c.y <= 0) { c.y = 0; if (c.vy < -4) c.vy = -c.vy * 0.3; else { c.st = 'idle'; c.vy = 0; const p = new THREE.Vector3(c.x, 0.4, c.z); ctx.burst(p, E.col, 20, 6); ctx.lineSparks(p, 20, 7, 0.8, [0xffffff, E.col]); ctx.toast('🎁 Peti Harta muncul!\nDekati peti untuk membukanya', 3500); } }
      c.g.position.y = c.y;
    } else if (c.st === 'idle') {
      c.beam.material.opacity = 0.16 + 0.12 * pulse; c.ring.scale.setScalar(1 + 0.12 * pulse);
      if (Math.hypot(pp.x - c.x, pp.z - c.z) < CHEST.open) openChest(c);
    } else {
      if (c.st === 'opening') { c.o = Math.min(1, c.o + dt / 0.7); const k = 1 - Math.pow(1 - c.o, 3); c.pivot.rotation.x = -k * 1.95; c.inner.material.opacity = 0.9 * k; c.beam.material.opacity = 0.2 + 0.3 * k; if (c.o >= 1) { c.st = 'open'; c.t = 0; } }
      else { c.beam.material.opacity = 0.35 + 0.1 * pulse; c.inner.material.opacity = 0.7 + 0.2 * pulse; if (c.t > CHEST.winDelay) c.done = true; }
    }
  }

  // ---------- per frame ----------
  let shown = null;
  function update(dt, state) {
    const pp = ctx.player(), vis = state === 'play' || state === 'world';
    if (vis !== shown) { shown = vis; bagBtn.hidden = !vis; if (!vis) panel.hidden = true; }
    if (cardT > 0 && (cardT -= dt) <= 0) card.hidden = true;
    for (const p of [...pickups]) {
      p.t += dt;
      if (p.mode === 'fall') {
        p.vy -= 18 * dt; p.y += p.vy * dt; p.x += p.vx * dt; p.z += p.vz * dt; const f = Math.exp(-2 * dt); p.vx *= f; p.vz *= f; ctx.clampPos(p);
        if (p.y <= 0.55 && p.vy < 0) { p.y = 0.55; if (Math.abs(p.vy) > 2.5) p.vy = -p.vy * 0.4; else p.mode = 'idle'; }
        if (p.cos && p.t > 0.55) p.mode = 'fly';
      } else if (p.mode === 'idle') {
        p.y = 0.6 + 0.12 * Math.sin(p.t * 3 + p.ph);
        const d = Math.hypot(pp.x - p.x, pp.z - p.z);
        if (p.t > 0.7 && d < MAGNET && vis) p.mode = 'fly';
      }
      if (p.mode === 'fly') {
        p.fly += dt; const tx = pp.x - p.x, ty = pp.y + 1 - p.y, tz = pp.z - p.z, d = Math.hypot(tx, ty, tz), step = Math.min(d, (7 + p.fly * 22) * dt);
        if (d < 0.7 || step >= d) { pickups.splice(pickups.indexOf(p), 1); collect(p); continue; }
        p.x += tx / d * step; p.y += ty / d * step; p.z += tz / d * step;
      }
      p.g.position.set(p.x, p.y, p.z); p.g.rotation.y += dt * 3;
    }
    if (chestO) chestTick(chestO, dt, pp);
  }
  function clear() {
    for (const p of pickups) scene.remove(p.g); pickups.length = 0;
    if (chestO) { scene.remove(chestO.g); chestO = null; }
    card.hidden = true; cardT = 0;
  }
  function collectAll() {   // ambil semua item yang masih tercecer (mis. saat masuk ruang bos / keluar dungeon)
    for (const p of pickups) collect(p); pickups.length = 0;
  }
  return { drop, chest, update, clear, collectAll, toggleBag, openForge, closeForge, usePotion, applyEquip, equip, forge, equipped: () => SWORDS[equippedId()], feed, blocksWin: () => !!chestO && !chestO.done, hasChest: () => !!chestO, count };
}
