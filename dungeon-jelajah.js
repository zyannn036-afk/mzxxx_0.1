// ---------- Dungeon yang bisa dijelajahi (khusus dungeon di Kota Dungeon) ----------
// Isi dungeon = rangkaian ruangan + lorong berbentuk grid petak (tiap dungeon punya denah tetap, diacak dari id-nya):
//   ruang awal (pintu keluar ke kota) -> ruangan musuh -> ... -> ruang penjaga terakhir -> GERBANG RUANG BOS.
// Ruangan samping (jalan buntu) berisi musuh + kristal penyembuh. Gerbang bos terkunci sampai semua musuh kalah.
// Ruang bos sendiri = arena bundar lama di game.js (arenaG); modul ini hanya membangun bagian jelajahnya.
//
// Dipakai dari game.js:  const X = buildDungeonJelajah(THREE, { id, theme, tex, onGate, onExit, onHeal });  scene.add(X.group);
//   X.start {x,z,face}, X.spawns [{x,z,room,variant}], X.collide(pos, r), X.clipCam(playerPos, camPos), X.dashLen(pos, dir, L, r), X.roomAt(x,z),
//   X.update(dt, t, playerPos), X.setGateOpen(bool), X.gateOpen, X.dispose()

export const DJ = {
  T: 3,                 // lebar 1 petak (m)
  H: 5,                 // tinggi dinding (m)
  rooms: 6,             // jumlah ruangan di jalur utama (termasuk ruang awal & ruang penjaga terakhir)
  side: 2,              // jumlah ruangan samping (jalan buntu) paling banyak
  counts: [2, 2, 3, 3, 4],   // jumlah musuh di ruangan jalur utama ke-1, 2, 3, ... (ruang awal kosong; yang terakhir = ruang penjaga)
  sideCount: 2,         // jumlah musuh di tiap ruangan samping
  heal: 40,             // HP yang dipulihkan kristal di ruangan samping
  roomMin: 7, roomMax: 11,
};

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mkRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const CELL = 14, CW = 5, CH = 4, PAD = 6;   // papan kasar CW x CH, tiap sel CELL petak; PAD = tepi kosong di sekeliling
const W = CW * CELL + PAD * 2, Hh = CH * CELL + PAD * 2;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function genLayout(id, attempt) {
  const r = mkRng(hashStr(id) + attempt * 7919);
  const key = (x, y) => x + ',' + y;
  // 1) jalur acak tanpa berpotongan di papan kasar
  const path = [[(r() * CW) | 0, (r() * CH) | 0]], used = new Set([key(...path[0])]);
  const dfs = () => {
    if (path.length === DJ.rooms) return true;
    const [cx, cy] = path[path.length - 1];
    const nb = DIRS4.map(d => [cx + d[0], cy + d[1]]).filter(([x, y]) => x >= 0 && y >= 0 && x < CW && y < CH && !used.has(key(x, y))).sort(() => r() - 0.5);
    for (const c of nb) { path.push(c); used.add(key(...c)); if (dfs()) return true; path.pop(); used.delete(key(...c)); }
    return false;
  };
  if (!dfs()) return null;
  const solid = new Uint8Array(W * Hh).fill(1), at = (x, y) => y * W + x, inGrid = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh;
  const rooms = [];
  const mkRoom = (cell, kind) => {
    const big = kind === 'last', w = DJ.roomMin + ((r() * (DJ.roomMax - DJ.roomMin + 1)) | 0) + (big ? 1 : 0), h = DJ.roomMin + ((r() * (DJ.roomMax - DJ.roomMin + 1)) | 0) + (big ? 1 : 0);
    const cw = Math.min(w, CELL - 2), ch = Math.min(h, CELL - 2);
    const x = PAD + cell[0] * CELL + ((CELL - cw) >> 1), y = PAD + cell[1] * CELL + ((CELL - ch) >> 1);
    const room = { x, y, w: cw, h: ch, cx: x + (cw >> 1), cy: y + (ch >> 1), kind, idx: rooms.length, cell };
    for (let j = y; j < y + ch; j++) for (let i = x; i < x + cw; i++) solid[at(i, j)] = 0;
    rooms.push(room); return room;
  };
  const corridor = (A, B) => {   // lorong 2 petak: mendatar lalu menegak (bentuk L)
    const x0 = Math.min(A.cx, B.cx), x1 = Math.max(A.cx, B.cx), y0 = Math.min(A.cy, B.cy), y1 = Math.max(A.cy, B.cy);
    for (let i = x0; i <= x1 + 1; i++) { solid[at(i, A.cy)] = 0; solid[at(i, A.cy + 1)] = 0; }
    for (let j = y0; j <= y1 + 1; j++) { solid[at(B.cx, j)] = 0; solid[at(B.cx + 1, j)] = 0; }
  };
  path.forEach((c, i) => mkRoom(c, i === 0 ? 'start' : i === path.length - 1 ? 'last' : 'main'));
  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i]);
  // 2) ruangan samping: sel kosong di samping ruangan jalur utama (bukan ruang awal / terakhir)
  let sides = 0;
  for (const i of path.map((_, i) => i).filter(i => i > 0 && i < path.length - 1).sort(() => r() - 0.5)) {
    if (sides >= DJ.side) break;
    const [cx, cy] = path[i], free = DIRS4.map(d => [cx + d[0], cy + d[1]]).filter(([x, y]) => x >= 0 && y >= 0 && x < CW && y < CH && !used.has(key(x, y)));
    if (!free.length) continue;
    const c = free[(r() * free.length) | 0]; used.add(key(...c));
    const s = mkRoom(c, 'side'); corridor(rooms[i], s); sides++;
  }
  // 3) lorong pendek + gerbang (3 petak ke luar dari dinding ruangan): pintu keluar di ruang awal, gerbang bos di ruang terakhir
  const vest = (room, away) => {
    const order = DIRS4.map((d, k) => ({ d, k, s: d[0] * away[0] + d[1] * away[1] + r() * 0.6 })).sort((a, b) => b.s - a.s);
    for (const { d } of order) {
      const f = d, l = d[0] !== 0 ? [0, 1] : [1, 0];
      const b = d[0] === 1 ? [room.x + room.w, room.cy] : d[0] === -1 ? [room.x - 1, room.cy] : d[1] === 1 ? [room.cx, room.y + room.h] : [room.cx, room.y - 1];
      let ok = true;
      for (let k = 0; k <= 3 && ok; k++) for (let j = -1; j <= 2 && ok; j++) { const x = b[0] + f[0] * k + l[0] * j, y = b[1] + f[1] * k + l[1] * j; if (!inGrid(x, y) || !solid[at(x, y)]) ok = false; }
      if (!ok) continue;
      const tiles = [];
      for (let k = 0; k <= 2; k++) for (let j = 0; j <= 1; j++) { const x = b[0] + f[0] * k + l[0] * j, y = b[1] + f[1] * k + l[1] * j; solid[at(x, y)] = 0; tiles.push({ x, y, k, j }); }
      return { f, l, b, tiles, plug: tiles.filter(t => t.k === 2) };
    }
    return null;
  };
  const first = rooms[0], second = rooms[1], last = rooms[rooms.length - 1], prev = rooms[Math.max(0, path.length - 2)];
  const exit = vest(first, [first.cx - second.cx, first.cy - second.cy]); if (!exit) return null;
  const gate = vest(last, [last.cx - prev.cx, last.cy - prev.cy]); if (!gate) return null;
  return { r, solid, rooms, exit, gate, path };
}

export function buildDungeonJelajah(THREE, opts) {
  let L = null;
  for (let a = 0; a < 40 && !L; a++) L = genLayout(opts.id, a);
  if (!L) throw new Error('denah dungeon gagal dibuat');
  const { T, H } = DJ, th = opts.theme || {}, { solid, rooms, exit, gate, r } = L;
  const OX = rooms[0].cx, OY = rooms[0].cy;
  const wx = ix => (ix + 0.5 - OX) * T, wz = iy => (iy + 0.5 - OY) * T;   // pusat petak -> koordinat dunia (ruang awal di sekitar (0,0))
  const tx = x => Math.floor(x / T + OX), tz = z => Math.floor(z / T + OY);
  const group = new THREE.Group(), disposables = [];
  const keep = o => { disposables.push(o); return o; };

  // ---- bahan ----
  const mkTex = () => { if (!opts.tex) return null; const t = opts.tex.clone(); t.repeat.set(1, 1); t.needsUpdate = true; return keep(t); };
  const lighten = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k);   // campur warna dengan putih supaya dungeon tidak gelap
  const floorMat = keep(new THREE.MeshStandardMaterial({ map: mkTex(), color: lighten(th.tint ?? 0xffffff, 0.3), roughness: 0.9 }));
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: mkTex(), color: lighten(th.stone ?? th.tint ?? 0x777777, 0.4), roughness: 0.85 }));
  const flameMat = keep(new THREE.MeshBasicMaterial({ color: th.flame ?? 0xffa040 }));
  const postMat = keep(new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 }));

  // ---- lantai & dinding (InstancedMesh) ----
  const openAt = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && !solid[y * W + x];
  const floors = [], walls = [];
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    if (openAt(x, y)) floors.push([x, y]);
    else if (openAt(x + 1, y) || openAt(x - 1, y) || openAt(x, y + 1) || openAt(x, y - 1) || openAt(x + 1, y + 1) || openAt(x - 1, y - 1) || openAt(x + 1, y - 1) || openAt(x - 1, y + 1)) walls.push([x, y]);
  }
  const fg = keep(new THREE.BoxGeometry(T, 0.4, T)), wg = keep(new THREE.BoxGeometry(T, H, T));
  const fm = new THREE.InstancedMesh(fg, floorMat, floors.length), wm = new THREE.InstancedMesh(wg, wallMat, walls.length), m4 = new THREE.Matrix4(), col = new THREE.Color();
  floors.forEach(([x, y], i) => { m4.makeTranslation(wx(x), -0.2, wz(y)); fm.setMatrixAt(i, m4); const v = 0.82 + r() * 0.22; fm.setColorAt(i, col.setRGB(v, v, v)); });
  walls.forEach(([x, y], i) => { m4.makeTranslation(wx(x), H / 2 - 0.4, wz(y)); wm.setMatrixAt(i, m4); const v = 0.75 + r() * 0.3; wm.setColorAt(i, col.setRGB(v, v, v)); });
  fm.frustumCulled = wm.frustumCulled = false; group.add(fm, wm);

  // ---- cahaya: 1 lampu tiap ruangan (jumlah tetap supaya shader tidak dikompilasi ulang) + obor hiasan ----
  // terang merata: cahaya langit + cahaya sekitar (tanpa sumber) supaya lorong tanpa obor pun tetap terlihat jelas
  const hemi = new THREE.HemisphereLight(lighten(th.hemi ? th.hemi[0] : 0x6070a0, 0.45), lighten(th.hemi ? th.hemi[1] : 0x201018, 0.45), 1.9); group.add(hemi);
  const ambient = new THREE.AmbientLight(lighten(th.torch ?? 0xffffff, 0.6), 0.9); group.add(ambient);
  const lantern = new THREE.PointLight(0xfff0d0, 45, 22, 2); lantern.position.set(0, 3.2, 0); group.add(lantern);   // lentera mengikuti pemain
  const lights = [];
  const torchGeo = keep(new THREE.CylinderGeometry(0.08, 0.12, 2.2, 8)), flameGeo = keep(new THREE.ConeGeometry(0.22, 0.6, 8));
  const addTorch = (x, z) => {
    const s = new THREE.Mesh(torchGeo, postMat); s.position.set(x, 1.1, z); group.add(s);
    const f = new THREE.Mesh(flameGeo, flameMat); f.position.set(x, 2.5, z); group.add(f); return f;
  };
  const flames = [];
  for (const rm of rooms) {
    const x = wx(rm.x + rm.w / 2 - 0.5), z = wz(rm.y + rm.h / 2 - 0.5);
    const lt = new THREE.PointLight(th.torch ?? 0xff7a2a, 80, 34, 2); lt.position.set(x, 3.6, z); group.add(lt); lights.push({ lt, o: r() * 10, base: 80 });
    // 4 obor di tengah tiap sisi dinding ruangan; dilewati kalau tepat di balik dinding itu ada mulut lorong / gerbang
    const eN = (rm.y - OY) * T, eS = (rm.y + rm.h - OY) * T, eW = (rm.x - OX) * T, eE = (rm.x + rm.w - OX) * T;
    [[wx(rm.cx), eN + 0.6, rm.cx, rm.y - 1], [wx(rm.cx), eS - 0.6, rm.cx, rm.y + rm.h], [eW + 0.6, wz(rm.cy), rm.x - 1, rm.cy], [eE - 0.6, wz(rm.cy), rm.x + rm.w, rm.cy]].forEach(([px, pz, ox, oy]) => {
      if (!openAt(ox, oy)) flames.push({ m: addTorch(px, pz), o: r() * 10 });
    });
  }

  // ---- gerbang: kusen batu + bidang cahaya, melintang di antara petak k=1 dan k=2 lorong pendek ----
  const mkGate = (V, color, withLight) => {
    const fx = V.f[0], fz = V.f[1], cxT = V.b[0] + fx * 1.5 + V.l[0] * 0.5, czT = V.b[1] + fz * 1.5 + V.l[1] * 0.5;
    const g = new THREE.Group(); g.position.set(wx(cxT), 0, wz(czT)); g.rotation.y = Math.atan2(fx, fz);
    const stone = keep(new THREE.MeshStandardMaterial({ color: th.stone ?? 0x6a6a72, roughness: 0.8 }));
    const pg = keep(new THREE.BoxGeometry(1.1, H, 1.3)), lg = keep(new THREE.BoxGeometry(2 * T + 2.2, 1.1, 1.3));
    const pl = new THREE.Mesh(pg, stone); pl.position.set(-(T + 0.55), H / 2, 0); const pr = pl.clone(); pr.position.x = T + 0.55;
    const lin = new THREE.Mesh(lg, stone); lin.position.set(0, H - 0.55, 0); g.add(pl, pr, lin);
    const pm = keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    const plane = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * T, H - 1.1)), pm); plane.position.set(0, (H - 1.1) / 2, 0); g.add(plane);
    let lt = null; if (withLight) { lt = new THREE.PointLight(color, 20, 14, 2); lt.position.set(0, 2.6, -1.5); g.add(lt); }   // -z lokal = sisi ruangan
    group.add(g);
    // obor kiri-kanan di sisi dalam
    const side = [-(T + 1.3), T + 1.3].map(sx => { const px = g.position.x + Math.cos(g.rotation.y) * sx, pz = g.position.z - Math.sin(g.rotation.y) * sx; return { m: addTorch(px, pz), o: r() * 10 }; });
    flames.push(...side);
    return { g, pm, plane, lt };
  };
  const LOCK_COLOR = 0xff3a30, openColor = th.ring ? th.ring[1] : (th.torch ?? 0x9a35e0);
  const gateV = mkGate(gate, LOCK_COLOR, true), exitV = mkGate(exit, 0x7fe9ff, false);
  const plugKeys = new Set(gate.plug.map(t => t.x + ',' + t.y)), exitKeys = new Set(exit.plug.map(t => t.x + ',' + t.y));
  let gateOpen = false;
  const setGateOpen = on => { gateOpen = !!on; gateV.pm.color.setHex(on ? openColor : LOCK_COLOR); gateV.pm.opacity = on ? 0.7 : 0.5; };

  // ---- kristal penyembuh di ruangan samping ----
  const pickups = [];
  const cg = keep(new THREE.OctahedronGeometry(0.5)), cm = keep(new THREE.MeshBasicMaterial({ color: 0x6dff9c, transparent: true, opacity: 0.9 }));
  rooms.filter(rm => rm.kind === 'side').forEach(rm => {
    const m = new THREE.Mesh(cg, cm); m.position.set(wx(rm.cx), 1.2, wz(rm.cy)); group.add(m); pickups.push({ m, x: m.position.x, z: m.position.z, o: r() * 6, on: true });
  });

  // ---- titik muncul musuh ----
  const spawns = [];
  rooms.forEach(rm => {
    const n = rm.kind === 'start' ? 0 : rm.kind === 'side' ? DJ.sideCount : (DJ.counts[Math.min(DJ.counts.length - 1, rm.idx - 1)] ?? 3);
    const pts = [];
    for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
      const x = wx(rm.x + 1.2 + r() * (rm.w - 2.4) - 0.5), z = wz(rm.y + 1.2 + r() * (rm.h - 2.4) - 0.5);
      if (pts.some(p => Math.hypot(p.x - x, p.z - z) < 2.2)) continue;
      const p = { x, z, room: rm.idx, variant: rm.idx >= 3 && k % 3 === 2 ? 1 : 0 }; pts.push(p); spawns.push(p); k++;
    }
  });

  // ---- posisi awal: tengah ruang awal, menghadap ruangan berikutnya ----
  const s0 = rooms[0], s1 = rooms[1];
  const start = { x: wx(s0.cx), z: wz(s0.cy), face: Math.atan2(s1.cx - s0.cx, s1.cy - s0.cy) };

  // ---- tabrakan: lingkaran vs petak padat (petak sumbat gerbang padat selama terkunci) ----
  const isSolid = (ix, iy) => ix < 0 || iy < 0 || ix >= W || iy >= Hh || !!solid[iy * W + ix] || (!gateOpen && plugKeys.has(ix + ',' + iy));
  function collide(p, rad) {
    const cx = tx(p.x), cz = tz(p.z);
    for (let iz = cz - 1; iz <= cz + 1; iz++) for (let ix = cx - 1; ix <= cx + 1; ix++) {
      if (!isSolid(ix, iz)) continue;
      const x0 = (ix - OX) * T, x1 = x0 + T, z0 = (iz - OY) * T, z1 = z0 + T;
      const nx = Math.max(x0, Math.min(p.x, x1)), nz = Math.max(z0, Math.min(p.z, z1)), dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (rad - d) / d; p.x += dx * k; p.z += dz * k; }
      else { // pusat tepat di dalam petak: dorong ke sisi terdekat
        const dl = p.x - x0, dr = x1 - p.x, dt = p.z - z0, db = z1 - p.z, m = Math.min(dl, dr, dt, db);
        if (m === dl) p.x = x0 - rad; else if (m === dr) p.x = x1 + rad; else if (m === dt) p.z = z0 - rad; else p.z = z1 + rad;
      }
    }
  }
  // kamera tidak boleh menembus dinding: dipendekkan sepanjang garis pemain -> kamera (dan sedikit diturunkan)
  function clipCam(pp, cam) {
    const dx = cam.x - pp.x, dz = cam.z - pp.z, len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    if (isSolid(tx(pp.x), tz(pp.z))) return;   // pemain sedang di dalam petak dinding (Dash Petir menembus tembok): garis pemain->kamera tidak bermakna, jangan potong (kalau dipotong kamera menciut ke bawah pemain)
    const bad = (x, z) => { const ix = tx(x), iz = tz(z); return isSolid(ix, iz) || isSolid(tx(x + Math.sign(dx) * 0.9), iz) || isSolid(ix, tz(z + Math.sign(dz) * 0.9)); };
    let t = 1;   // telusuri garis dari pemain ke kamera; berhenti sedikit sebelum titik pertama yang menyentuh dinding
    const steps = Math.max(2, Math.ceil(len / 0.5));
    for (let i = 1; i <= steps; i++) { if (bad(pp.x + dx * i / steps, pp.z + dz * i / steps)) { t = Math.max(0.12, (i - 1) / steps - 0.02); break; } }
    if (t < 1) { cam.x = pp.x + dx * t; cam.z = pp.z + dz * t; cam.y = pp.y + (cam.y - pp.y) * (0.55 + 0.45 * t); }
  }
  // titik (x,z) dengan jari-jari rad benar-benar di lantai kosong: semua petak yang tertimpa tubuh tidak padat (tidak memakai collide(), karena titik di dalam batu padat bisa lolos dari collide dengan pergeseran kecil)
  const clearAt = (x, z, rad) => {
    for (let iz = tz(z - rad); iz <= tz(z + rad); iz++) for (let ix = tx(x - rad); ix <= tx(x + rad); ix++) if (isSolid(ix, iz)) return false;
    return true;
  };
  const solidAt = (x, z) => isSolid(tx(x), tz(z));   // titik pusat ada di petak padat (dinding / batu / gerbang terkunci / luar denah)
  // panjang terjang yang aman untuk Dash Petir (boleh menembus tembok, tapi harus mendarat di lantai kosong; berhenti sebelum gerbang bos / pintu keluar)
  function dashLen(p, dir, L, rad) {
    let cap = L;
    for (let s = 0.4; s <= L; s += 0.4) {
      const k = tx(p.x + dir.x * s) + ',' + tz(p.z + dir.z * s);
      if (plugKeys.has(k) || exitKeys.has(k)) { cap = Math.max(0, s - 1.2); break; }
    }
    for (let s = cap; s > 0.3; s -= 0.4) {   // mundur dari ujung sampai titik pendaratan benar-benar kosong
      if (clearAt(p.x + dir.x * s, p.z + dir.z * s, rad)) return s;
    }
    return 0;
  }
  const roomAt = (x, z) => { const ix = tx(x), iz = tz(z); for (const rm of rooms) if (ix >= rm.x && iz >= rm.y && ix < rm.x + rm.w && iz < rm.y + rm.h) return rm.idx; return -1; };

  let hitG = false, hitE = false;
  function update(dt, t, pp) {
    lantern.position.set(pp.x, 3.2, pp.z);
    lights.forEach(o => { o.lt.intensity = o.base * (1 + Math.sin(t * 9 + o.o) * 0.09) + Math.random() * 1.5; });
    flames.forEach(f => { f.m.scale.y = 1 + Math.sin(t * 12 + f.o) * 0.2; });
    if (gateV.lt) gateV.lt.intensity = (gateOpen ? 26 : 16) * (1 + Math.sin(t * 4) * 0.12);
    gateV.plane.material.opacity = (gateOpen ? 0.62 : 0.4) + Math.sin(t * 3) * 0.08; exitV.plane.material.opacity = 0.42 + Math.sin(t * 3 + 1) * 0.08;
    for (const p of pickups) {
      if (!p.on) continue; p.m.rotation.y += dt * 1.8; p.m.position.y = 1.2 + Math.sin(t * 2.4 + p.o) * 0.18;
      if (Math.hypot(pp.x - p.x, pp.z - p.z) < 1.5) { p.on = false; group.remove(p.m); opts.onHeal && opts.onHeal(DJ.heal, p.x, p.z); }
    }
    const ix = tx(pp.x), iz = tz(pp.z), k = ix + ',' + iz;
    if (gateOpen && plugKeys.has(k)) { if (!hitG) { hitG = true; opts.onGate && opts.onGate(); } } else hitG = false;
    if (exitKeys.has(k)) { if (!hitE) { hitE = true; opts.onExit && opts.onExit(); } } else hitE = false;
  }
  function dispose() {
    if (group.parent) group.parent.remove(group);
    disposables.forEach(o => o.dispose && o.dispose()); fm.dispose(); wm.dispose();
  }

  const plugPos = V => ({ x: wx(V.b[0] + V.f[0] * 2 + V.l[0] * 0.5), z: wz(V.b[1] + V.f[1] * 2 + V.l[1] * 0.5) });   // pusat petak sumbat (tempat pemicu gerbang / pintu keluar)
  return { group, start, gatePos: plugPos(gate), exitPos: plugPos(exit), spawns, rooms, collide, clipCam, dashLen, solidAt, roomAt, update, setGateOpen, get gateOpen() { return gateOpen; }, dispose };
}
