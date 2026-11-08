import * as THREE from 'three';
import { APOTHEM, EMPIRE_C, EMPIRE_YAW, NW_PLAIN, NW_TOWN, toWorld } from './kekaisaran-layout.js';
import { loadKnights } from './kekaisaran-ksatria.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { WARGA } from './kota-warga.js';   // nama + percakapan semua NPC kota (hanya data teks)
import { createKaelenBattle } from './kaelen-battle.js';   // battle melawan Kaelen (boss 3 fase) di alun-alun
const skClone = SkeletonUtils.clone || (SkeletonUtils.SkeletonUtils && SkeletonUtils.SkeletonUtils.clone);   // nama ekspor berbeda antar versi three
const mergeGeos = BufferGeometryUtils.mergeGeometries || BufferGeometryUtils.mergeBufferGeometries;   // ksatria & prajurit yang sama dengan di Kekaisaran (model dari folder prajurit/)

// ============================================================
//  KOTA DUNGEON — kota kecil di ujung Padang Rumput Barat Laut (chunk TERPISAH 'kota-dungeon', dipanggil dari world.js).
//  Dari ujung padang jalan tanah menembus hutan, melewati Gerbang Masuk kota, jalan batu (avenue) menuju alun-alun berobelisk kristal kuning,
//  lalu tebing menyempit jadi LEMBAH BEBATUAN yang berujung di GERBANG DUNGEON TENGAH = DUNGEON CAHAYA (portal emas, di ujung lembah) — melangkah ke portal = masuk dungeon (dipicu di game.js, lihat DUNGEON_TOWN.gateD).
//  Gua Kristal sekarang ada di relung dinding lembah (sisi kiri, id 'kristal'); posisinya DITUKAR dengan Dungeon Cahaya yang dulu di relung itu. Dungeon Batu (kanan, mulut lembah) & Dungeon Kegelapan (kiri, paling dalam) juga sudah ditukar. Nuansa kota = kuning keemasan.
//  Isi: Balai Petualang, Pandai Besi, Penginapan, Toko Ramuan + rumah-rumah warga (instancing per bagian), obor kuning, hutan mengelilingi kota.
//  Tata letak jelajah (lingkaran, ukuran) ada di kekaisaran-layout.js (NW_TOWN, NW_TOWN_CIRCLES). Dibangun bertahap (`yield` = titik berhenti).
//  Koordinat sumbu: d = jarak dari pusat istana searah gerbang barat laut, off = geser ke samping sumbu. Grup `town` = kerangka lokal kota (sama dengan padang).
// ============================================================
export const DUNGEON_TOWN = { name: 'Kota Dungeon', sub: 'Gerbang Bawah Tanah', d0: NW_TOWN.d0, gateD: NW_TOWN.gateD, plazaD: NW_TOWN.d0 + 95, portalHalfW: 3.6 };

// ---------- Lembah Bebatuan (dipakai bersama game.js): lebar lantai lembah + 5 gerbang dungeon samping ----------
//  Lembah memanjang dari mulut (VB) sampai Gerbang Dungeon utama (gateD). Di dindingnya ada 5 relung gerbang, berpasangan berhadapan:
//  Kristal (kiri) <-> Batu (kanan), Api (kiri) <-> Es (kanan), lalu Kegelapan (kiri) sendirian (Batu & Kegelapan sudah ditukar posisinya). side: -1 = kiri, +1 = kanan; d = jarak sepanjang sumbu; w = setengah lebar lembah di gerbang (jarak dinding dari sumbu).
const _VB = NW_TOWN.d0 + NW_TOWN.valley.b, _VA = NW_TOWN.d0 + NW_TOWN.valley.a, _VW = NW_TOWN.valley.halfW, _HW = NW_TOWN.halfW;
const _sstep = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
// Pintu depan Balai Petualang (guild): diisi saat chunk kota dibangun (koordinat DUNGEON dunia). game.js: melangkah ke (x, z) dalam radius r = masuk interior guild (kota-guild.js); keluar -> muncul di (outX, outZ) menghadap `face`.
export const GUILD_DOOR = { ready: false, x: 0, z: 0, r: 1.5, outX: 0, outZ: 0, face: 0 };
// Pintu depan toko Pandai Besi: sama seperti GUILD_DOOR (diisi saat chunk kota dibangun). game.js: melangkah ke (x, z) dalam radius r = masuk interior pandai besi (kota-pandai-besi.js); keluar -> muncul di (outX, outZ) menghadap `face`.
export const SMITH_DOOR = { ready: false, x: 0, z: 0, r: 1.5, outX: 0, outZ: 0, face: 0 };
// Pintu depan Toko Ramuan: sama seperti SMITH_DOOR (diisi saat chunk kota dibangun). game.js: melangkah ke (x, z) dalam radius r = masuk interior toko ramuan (kota-toko-ramuan.js).
export const POTION_DOOR = { ready: false, x: 0, z: 0, r: 1.5, outX: 0, outZ: 0, face: 0 };
// Pintu depan Penginapan Kota Dungeon: sama seperti POTION_DOOR (diisi saat chunk kota dibangun). game.js: melangkah ke (x, z) dalam radius r = masuk interior penginapan (kota-penginapan.js).
export const LODGE_DOOR = { ready: false, x: 0, z: 0, r: 1.5, outX: 0, outZ: 0, face: 0 };
export const MAIN_DUNGEON = { id: 'cahaya', name: 'Dungeon Cahaya', sub: 'Cahaya suci menyilaukan', icon: '☀️' };   // dungeon di portal TENGAH (ujung lembah, d = gateD); dipakai game.js
export const DUNGEON_GATES = [
  { id: 'kristal',   name: 'Gua Kristal',       sub: 'Kristal biru berpendar',  icon: '💎', side: -1, d: _VB + 40 },
  { id: 'batu',      name: 'Dungeon Batu',      sub: 'Reruntuhan batu purba',   icon: '🪨', side: 1,  d: _VB + 40 },
  { id: 'api',       name: 'Dungeon Api',       sub: 'Lautan api membara',      icon: '🔥', side: -1, d: _VB + 110 },
  { id: 'es',        name: 'Dungeon Es',        sub: 'Gua beku abadi',          icon: '❄️', side: 1,  d: _VB + 110 },
  { id: 'kegelapan', name: 'Dungeon Kegelapan', sub: 'Kegelapan tanpa ujung',   icon: '🌑', side: -1, d: _VB + 175 },
];
export function valleyHalfW(d, sx) {   // setengah lebar lantai lembah pada jarak d (sx = sisi -1/+1): lebar kota -> menyempit -> lembah berkelok sedikit + relung di tiap gerbang samping
  const e = _sstep((d - _VA) / (_VB - _VA)), w = (_HW + 4) + (_VW - (_HW + 4)) * e;
  let a = 0; for (const g of DUNGEON_GATES) if (g.side === sx) a += 5.5 * Math.exp(-(((d - g.d) / 9) ** 2));
  return w + e * (3.2 * Math.sin(d * 0.12 + sx * 1.7) + 1.8 * Math.sin(d * 0.29 + sx * 3.1)) + a;
}
for (const g of DUNGEON_GATES) g.w = valleyHalfW(g.d, g.side);

export function* buildKotaDungeonGen(o) {
  const { colliders, COARSE, geo, mat, tex } = o;
  const D0 = NW_TOWN.d0, GD = NW_TOWN.gateD, DC = DUNGEON_TOWN.plazaD, HW = NW_TOWN.halfW, ROAD = 6;
  const VA = D0 + NW_TOWN.valley.a, VB = D0 + NW_TOWN.valley.b, VW = NW_TOWN.valley.halfW;   // lembah: tebing mulai menyempit di VA, selebar 2·VW mulai VB
  const group = new THREE.Group(); group.name = 'kota-dungeon';
  const town = new THREE.Group(); town.position.set(EMPIRE_C.x, 0, EMPIRE_C.z); town.rotation.y = EMPIRE_YAW; group.add(town);
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const col = (lx, lz, r) => { const p = toWorld(lx, lz); colliders.push({ x: p.x, z: p.z, r }); };
  const pr = (() => { let a = 20261107; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const Rp = (a, b) => a + pr() * (b - a);
  const gp = NW_PLAIN.psi, ux = Math.cos(gp), uz = Math.sin(gp), nx = -uz, nz = ux;
  const P = (d, off = 0) => ({ x: ux * d + nx * off, z: uz * d + nz * off });
  const dirFace = (dx, dz) => Math.atan2(dx, dz);   // putaran-y agar +z lokal menghadap (dx, dz)
  const sstep = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };   // 0..1 halus
  const wAt = valleyHalfW;   // lihat di atas (modul): lebar lantai lembah
  const cliffH = d => 3 + 27 * sstep((d - (VA - 4)) / (VB + 6 - (VA - 4)));   // tinggi tebing: rendah di mulut lembah, tinggi di dalam

  // ---------- Tekstur kecil & material ----------
  const ctex = (w, h, draw, repeat = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const noise = (x, s, n, c0, c1, a) => { for (let i = 0; i < n; i++) { const g = c0 + Math.random() * (c1 - c0) | 0; x.fillStyle = `rgba(${g},${g - 4},${g - 8},${a})`; x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
  const cobbleT = ctex(128, 128, (x, w) => { x.fillStyle = '#5a5130'; x.fillRect(0, 0, w, w); for (let r = 0; r < 4; r++) for (let c = -1; c < 5; c++) { const g = 92 + Math.random() * 40 | 0; x.fillStyle = `rgb(${g + 10},${g + 4},${g - 18})`; x.fillRect(c * 32 + (r % 2) * 16 + 1.5, r * 32 + 1.5, 29, 29); } noise(x, w, 260, 60, 150, 0.25); });
  const sandT = ctex(128, 128, (x, w) => { x.fillStyle = '#b89e68'; x.fillRect(0, 0, w, w); noise(x, w, 700, 140, 225, 0.3); });
  const glowT = ctex(256, 256, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(255,226,120,0.8)'); g.addColorStop(0.75, 'rgba(255,184,40,0.45)'); g.addColorStop(1, 'rgba(255,160,20,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); for (let i = 0; i < 5; i++) { x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, w / 2, 30 + i * 22, i, i + 2.2); x.stroke(); } }, false);
  const glowGoldT = ctex(256, 256, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(255,236,150,0.85)'); g.addColorStop(0.75, 'rgba(255,190,60,0.45)'); g.addColorStop(1, 'rgba(255,170,30,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); for (let i = 0; i < 5; i++) { x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, w / 2, 30 + i * 22, i, i + 2.2); x.stroke(); } }, false);
  const decalMat = (map, lvl) => new THREE.MeshStandardMaterial({ map, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -lvl, polygonOffsetUnits: -lvl });
  const M = {
    cobble: decalMat(cobbleT, 3), sand: decalMat(sandT, 2),
    timber: new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1, flatShading: true }), wood: new THREE.MeshStandardMaterial({ color: 0x7a5732, roughness: 1, flatShading: true }),
    rock: new THREE.MeshStandardMaterial({ color: 0x66603f, roughness: 1, flatShading: true }), trim: new THREE.MeshStandardMaterial({ color: 0x8a7a48, roughness: 1, flatShading: true }),
    torch: new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb81c, emissiveIntensity: 1.1, roughness: 0.6, flatShading: true }),
    crystal: new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xe0a010, emissiveIntensity: 1.0, roughness: 0.3, flatShading: true }),
  };
  const cyl = (a, b, h, n = 6) => new THREE.CylinderGeometry(a, b, h, n), box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const mesh = (g, m, x, y, z, parent, shadow = true) => { const k = new THREE.Mesh(g, m); k.position.set(x, y, z); k.castShadow = shadow; k.receiveShadow = true; parent.add(k); return k; };
  const board = (parent, text, sub, w, h, x, y, z) => {   // papan bertulisan (sisi depan +z)
    const tx = ctex(512, 128, (c, cw, ch) => { c.fillStyle = '#3f3414'; c.fillRect(0, 0, cw, ch); c.strokeStyle = '#e0b845'; c.lineWidth = 6; c.strokeRect(5, 5, cw - 10, ch - 10); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff3c4';
      let fs = sub ? 54 : 64; c.font = `bold ${fs}px Georgia`; while (c.measureText(text).width > cw - 40 && fs > 18) c.font = `bold ${fs -= 2}px Georgia`; c.fillText(text, cw / 2, sub ? ch * 0.38 : ch / 2);
      if (sub) { c.fillStyle = '#f0d98a'; fs = 30; c.font = `bold ${fs}px Georgia`; while (c.measureText(sub).width > cw - 40 && fs > 12) c.font = `bold ${fs -= 2}px Georgia`; c.fillText(sub, cw / 2, ch * 0.74); } }, false);
    const front = new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }), b = new THREE.Mesh(box(w, h, 0.14), [M.timber, M.timber, M.timber, M.timber, front, M.timber]); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b;
  };
  function decalStrip(x0, z0, x1, z1, w, m, lvl, uvs) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, ax = -dz / l * w / 2, az = dx / l * w / 2, pos = [], uv = [];
    [[x0 + ax, z0 + az], [x1 + ax, z1 + az], [x1 - ax, z1 - az], [x0 - ax, z0 - az]].forEach(([x, z]) => { pos.push(x, 0, z); uv.push(x * uvs, z * uvs); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const k = new THREE.Mesh(g, m); k.position.y = 0.02 + lvl * 0.004; k.receiveShadow = true; town.add(k); return k;
  }
  const solids = [], mark = (d, off, r) => solids.push({ d, off, r });
  const solidFree = (d, off, pad = 0) => { for (const s of solids) if (Math.hypot(s.d - d, s.off - off) < s.r + pad) return false; return true; };

  // ---------- Jalan: lanjutan jalan tanah dari padang, avenue batu, alun-alun ----------
  { const a = P(D0 - 5), b = P(D0 + 12); decalStrip(a.x, a.z, b.x, b.z, 5, M.sand, 2, 0.3); }
  { const a = P(D0 + 10), b = P(DC - 15); decalStrip(a.x, a.z, b.x, b.z, ROAD, M.cobble, 3, 0.33); }
  { const a = P(DC + 15), b = P(VA); decalStrip(a.x, a.z, b.x, b.z, ROAD, M.cobble, 3, 0.33); }       // avenue batu sampai mulut lembah
  { const a = P(VA - 2), b = P(GD - 14); decalStrip(a.x, a.z, b.x, b.z, 5, M.sand, 2, 0.3); }         // di dalam lembah: jalan tanah berbatu
  { const a = P(GD - 16), b = P(GD - 2); decalStrip(a.x, a.z, b.x, b.z, 16, M.cobble, 3, 0.33); }     // pelataran batu di depan gerbang
  { const a = P(DC - 15), b = P(DC + 15); decalStrip(a.x, a.z, b.x, b.z, 30, M.cobble, 3, 0.33); }
  yield;

  // ---------- Gerbang Masuk kota (lengkung batu + papan nama) ----------
  {
    const p = P(D0 + 16), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = dirFace(-ux, -uz); town.add(g);   // +z lokal menghadap ke arah padang (pendatang)
    for (const sx of [-1, 1]) { mesh(box(1.7, 6.4, 1.7), M.rock, sx * 4.3, 3.2, 0, g); mesh(box(2.2, 0.5, 2.2), M.trim, sx * 4.3, 6.55, 0, g); const q = P(D0 + 16, sx * 4.3); col(q.x, q.z, 1.2); mark(D0 + 16, sx * 4.3, 2); }
    mesh(box(10.8, 1.2, 1.9), M.rock, 0, 6.9, 0, g); board(g, 'KOTA DUNGEON', 'Gerbang Bawah Tanah', 8.2, 1.7, 0, 8.4, 0.2);
  }
  yield;

  // ---------- Alun-alun: obelisk kristal kuning ----------
  let crystal = null;
  {
    const p = P(DC, 0), g = new THREE.Group(); g.position.set(p.x, 0, p.z); town.add(g);
    mesh(cyl(2.3, 2.6, 0.5, 8), M.trim, 0, 0.25, 0, g); mesh(cyl(1.4, 1.8, 0.7, 8), M.rock, 0, 0.85, 0, g); mesh(box(0.9, 3.4, 0.9), M.rock, 0, 2.9, 0, g);
    crystal = mesh(new THREE.IcosahedronGeometry(0.95, 0), M.crystal, 0, 5.2, 0, g, false); crystal.scale.set(0.8, 1.6, 0.8);
    col(p.x, p.z, 2.4); mark(DC, 0, 15);
  }

  // ---------- Obor kuning sepanjang avenue ----------
  const torch = (d, off) => { const p = P(d, off), g = new THREE.Group(); g.position.set(p.x, 0, p.z); town.add(g); mesh(cyl(0.07, 0.1, 2.3), M.timber, 0, 1.15, 0, g); mesh(cyl(0.24, 0.12, 0.34, 6), M.torch, 0, 2.45, 0, g, false); mesh(new THREE.IcosahedronGeometry(0.2, 0), M.torch, 0, 2.8, 0, g, false); col(p.x, p.z, 0.22); mark(d, off, 0.8); };
  for (let d = D0 + 24; d < GD - 8; d += 14) { if (Math.abs(d - DC) < 17) continue; torch(d, ROAD / 2 + 1.1); torch(d, -(ROAD / 2 + 1.1)); }
  for (const a of [-1, 1]) for (const b of [-1, 1]) torch(DC + a * 14.5, b * 14.5);   // empat sudut alun-alun
  for (const b of [-1, 1]) torch(GD - 3, b * 8.2);   // mengapit Gerbang Dungeon
  yield;

  // ---------- Ksatria penjaga kota (model sama dengan ksatria Aula Kekaisaran; dimuat di akhir pembangunan chunk) ----------
  const wargaList = [];   // semua NPC yang bisa diajak bicara: { id, g } (punya model 3D) atau { id, lx, lz } (ksatria, posisi tetap di ruang kota)
  const KN = [];   // definisi ksatria: koordinat ruang kota (x, z) + yaw (0 = menghadap +z ruang kota)
  const knightAt = (name, model, role, x, z, yaw) => { KN.push({ name, role, model, scale: 1, ksatria: true, lines: [], x, z, yaw }); col(x, z, 0.5); };
  const knightPD = (name, model, role, d, off, yaw, id) => { const q = P(d, off); knightAt(name, model, role, q.x, q.z, yaw); mark(d, off, 1.3); if (id) wargaList.push({ id, lx: q.x, lz: q.z }); };   // id = kunci di WARGA (kota-warga.js)

  // ---------- Rumah-rumah (bangunan khusus dulu, lalu rumah warga) ----------
  const houses = [], wallCols = [0x8a7e5a, 0x978a62, 0x7a704c, 0xa39668, 0x857850], roofCols = [0x5a4a22, 0x6e5628, 0x4a3e1c, 0x7a5f2a, 0x42361a];
  const tryHouse = (dd, off, sd, spec = {}) => {
    const w = spec.w || Rp(5.5, 8), dep = spec.dep || Rp(4.5, 6), rad = Math.hypot(w, dep) / 2 + 0.8;
    if (!solidFree(dd, off, rad - 0.5) || houses.some(h => Math.hypot(h.d - dd, h.off - off) < h.rad + rad)) return false;
    houses.push({ d: dd, off, sd, w, dep, wh: spec.wh || Rp(2.8, 3.5), rh: spec.rh || Rp(1.8, 2.6), rad, th: dirFace(-sd * nx, -sd * nz) + Rp(-0.05, 0.05), wc: wallCols[(pr() * wallCols.length) | 0], rc: roofCols[(pr() * roofCols.length) | 0], name: spec.name, sub: spec.sub });
    mark(dd, off, rad); return true;
  };
  tryHouse(D0 + 70, -17, -1, { w: 13, dep: 9, wh: 4.6, rh: 3.2, name: 'BALAI PETUALANG', sub: 'Pendaftaran & misi dungeon' });
  tryHouse(D0 + 70, 15, 1, { w: 9, dep: 7, wh: 3.5, rh: 2.4, name: 'PANDAI BESI', sub: 'Senjata & zirah' });
  tryHouse(D0 + 121, -15, -1, { w: 11, dep: 8, wh: 4.2, rh: 2.8, name: 'PENGINAPAN', sub: 'Istirahat sebelum turun' });
  tryHouse(D0 + 121, 14, 1, { w: 7, dep: 6, wh: 3.2, rh: 2.3, name: 'TOKO RAMUAN', sub: 'Ramuan & perbekalan' });
  for (const sd of [-1, 1]) {
    for (const dd of [D0 + 36, D0 + 52, D0 + 138, D0 + 154]) if (pr() > 0.1) tryHouse(dd + Rp(-2, 2), sd * (14 + Rp(0, 2.5)), sd);              // baris depan (dekat avenue)
    for (const dd of [D0 + 30, D0 + 52, D0 + 74, D0 + 96, D0 + 118, D0 + 140, D0 + 158]) if (pr() < 0.85) tryHouse(dd + Rp(-3, 3), sd * (32 + Rp(0, 2.5)), sd);   // baris belakang
  }
  {
    const H = houses.length, Y = new THREE.Vector3(0, 1, 0), hm = new THREE.Matrix4(), tm = new THREE.Matrix4(), qy = new THREE.Quaternion(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
    const boxB = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), boxC = new THREE.BoxGeometry(1, 1, 1);
    const roofG = (() => {
      const A = [-.5, 0, .5], B = [.5, 0, .5], C = [.5, 1, 0], D = [-.5, 1, 0], E = [-.5, 0, -.5], F = [.5, 0, -.5];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(A, B, C, A, C, D, F, E, D, F, D, C, A, D, E, B, F, C), 3)); g.computeVertexNormals(); return g;
    })();
    const std = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true, ...extra });
    const walls = new THREE.InstancedMesh(boxB, std(0xffffff), H), roofs = new THREE.InstancedMesh(roofG, std(0xffffff, { side: THREE.DoubleSide }), H), doors = new THREE.InstancedMesh(boxC, std(0x3a2616), H),
      wins = new THREE.InstancedMesh(boxC, new THREE.MeshStandardMaterial({ color: 0x31405e, emissive: 0xffc46a, emissiveIntensity: 0.6, roughness: 0.4 }), H * 3), chim = new THREE.InstancedMesh(boxB, std(0x5a5664), H);
    // ---- Detail tambahan rumah warga (instancing): pondasi batu, tiang & ikat kayu, bingkai pintu + undakan, bingkai jendela + kotak bunga, bubungan & papan tepi atap, tutup cerobong, lentera pintu ----
    const flowCols = [0xe8607a, 0xf2c94a, 0xf4f0e8, 0xb06ad8, 0xff8a3a];
    const found = new THREE.InstancedMesh(boxB, std(0x6f6a56), H), posts = new THREE.InstancedMesh(boxB, std(0x3f2c1b), H * 4), belt = new THREE.InstancedMesh(boxB, std(0x3f2c1b), H),
      dframe = new THREE.InstancedMesh(boxC, std(0x3f2c1b), H), dstep = new THREE.InstancedMesh(boxB, std(0x8a8570), H), wfr = new THREE.InstancedMesh(boxC, std(0x3f2c1b), H * 2),
      fbox = new THREE.InstancedMesh(boxB, std(0x6a4a28), H * 2), fol = new THREE.InstancedMesh(boxB, std(0x3f7a3a), H * 2), flw = new THREE.InstancedMesh(boxC, std(0xffffff), H * 6),
      ridge = new THREE.InstancedMesh(boxB, std(0x2e2412), H), eave = new THREE.InstancedMesh(boxB, std(0x2e2412), H * 2), ccap = new THREE.InstancedMesh(boxB, std(0x45414f), H),
      lamp = new THREE.InstancedMesh(boxC, M.torch, H);
    const extras = [[found, 1], [posts, 4], [belt, 1], [dframe, 1], [dstep, 1], [wfr, 2], [fbox, 2], [fol, 2], [flw, 6], [ridge, 1], [eave, 2], [ccap, 1], [lamp, 1]];
    houses.forEach((h, i) => {
      const p = P(h.d, h.off); qy.setFromAxisAngle(Y, h.th); hm.compose(v3.set(p.x, 0, p.z), qy, sc.set(1, 1, 1));
      const put = (m, idx, lx, ly, lz, sx, sy, sz) => { tm.compose(v3.set(lx, ly, lz), q0, sc.set(sx, sy, sz)); tm.premultiply(hm); m.setMatrixAt(idx, tm); };
      put(walls, i, 0, 0, 0, h.w, h.wh, h.dep); put(roofs, i, 0, h.wh, 0, h.w + 0.9, h.rh, h.dep + 0.9); put(doors, i, 0, 0.95, h.dep / 2 + 0.04, 1.2, 1.9, 0.12);
      put(wins, i * 3, -(h.w / 2 - 1.3), h.wh * 0.55, h.dep / 2 + 0.04, 0.8, 0.8, 0.12); put(wins, i * 3 + 1, h.w / 2 - 1.3, h.wh * 0.55, h.dep / 2 + 0.04, 0.8, 0.8, 0.12); put(wins, i * 3 + 2, h.w / 2 + 0.04, h.wh * 0.55, 0, 0.12, 0.8, 0.8);
      put(chim, i, h.w * 0.28, h.wh + h.rh * 0.35, -h.dep * 0.12, 0.75, h.rh * 0.9 + 1.1, 0.75);
      put(found, i, 0, 0, 0, h.w + 0.24, 0.4, h.dep + 0.24);
      { let k = 0; for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(posts, i * 4 + k++, sx * h.w / 2, 0, sz * h.dep / 2, 0.3, h.wh, 0.3); }
      put(belt, i, 0, h.wh - 0.28, 0, h.w + 0.14, 0.28, h.dep + 0.14);
      put(dframe, i, 0, 1.075, h.dep / 2 + 0.0, 1.55, 2.15, 0.1); put(dstep, i, 0, 0, h.dep / 2 + 0.36, 1.9, 0.14, 0.72);
      put(lamp, i, 0, 2.3, h.dep / 2 + 0.14, 0.22, 0.3, 0.22);
      for (let k = 0; k < 2; k++) {
        const wx = (k ? 1 : -1) * (h.w / 2 - 1.3), wy = h.wh * 0.55;
        put(wfr, i * 2 + k, wx, wy, h.dep / 2 + 0.0, 1.08, 1.08, 0.1);
        put(fbox, i * 2 + k, wx, wy - 0.78, h.dep / 2 + 0.2, 1.0, 0.22, 0.32); put(fol, i * 2 + k, wx, wy - 0.56, h.dep / 2 + 0.2, 0.9, 0.12, 0.24);
        for (let f = 0; f < 3; f++) { put(flw, (i * 2 + k) * 3 + f, wx - 0.3 + f * 0.3, wy - 0.46, h.dep / 2 + 0.22 + (f % 2) * 0.03, 0.14, 0.14, 0.14); flw.setColorAt((i * 2 + k) * 3 + f, tmpC.setHex(flowCols[((i * 3 + k * 2 + f) * 7 + 3) % flowCols.length])); }
      }
      put(ridge, i, 0, h.wh + h.rh - 0.02, 0, h.w + 1.0, 0.16, 0.36);
      for (const sz of [-1, 1]) put(eave, i * 2 + (sz > 0 ? 1 : 0), 0, h.wh - 0.04, sz * (h.dep + 0.9) / 2, h.w + 0.95, 0.12, 0.14);
      put(ccap, i, h.w * 0.28, h.wh + h.rh * 0.35 + h.rh * 0.9 + 1.1, -h.dep * 0.12, 1.05, 0.18, 1.05);
      walls.setColorAt(i, tmpC.setHex(h.wc)); roofs.setColorAt(i, tmpC.setHex(h.rc));
      const ax = Math.cos(h.th), az = -Math.sin(h.th), r = h.dep / 2 + 0.25, L = h.w / 2 - r;   // tabrakan: deretan lingkaran sepanjang lebar rumah
      if (L <= 0) col(p.x, p.z, Math.hypot(h.w, h.dep) / 2); else { for (let a = -L; a < L; a += r * 1.15) col(p.x + ax * a, p.z + az * a, r); col(p.x + ax * L, p.z + az * L, r); }
      if (h.name && h.name !== 'BALAI PETUALANG') { const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = h.th; town.add(g); board(g, h.name, h.sub, Math.min(h.w * 0.85, 6.4), 1.1, 0, h.wh + 0.2, h.dep / 2 + 0.2); }
      if (Math.abs(h.off) < 22) { const a = P(h.d, h.sd * ROAD / 2), b = P(h.d, h.off - h.sd * (h.dep / 2 + 0.5)); decalStrip(a.x, a.z, b.x, b.z, 1.5, M.cobble, 3, 0.33); }   // jalan setapak ke pintu (baris depan)
    });
    {   // Balai Petualang memakai bangunan khusus (di bawah): instance rumah kotaknya disembunyikan (skala 0); tabrakan & papan tetap dari data rumah
      for (const nm of ['BALAI PETUALANG', 'PANDAI BESI', 'PENGINAPAN', 'TOKO RAMUAN']) {   // Pandai Besi, Penginapan & Toko Ramuan juga memakai bangunan khusus
        const gi = houses.findIndex(h => h.name === nm);
        if (gi >= 0) { const Z = new THREE.Matrix4().makeScale(0, 0, 0); for (const m of [walls, roofs, doors, chim]) m.setMatrixAt(gi, Z); for (let k = 0; k < 3; k++) wins.setMatrixAt(gi * 3 + k, Z); for (const [em, ek] of extras) for (let k = 0; k < ek; k++) em.setMatrixAt(gi * ek + k, Z); }
      }
    }
    for (const m of [walls, roofs, doors, wins, chim]) { m.castShadow = m !== wins && m !== doors; m.receiveShadow = true; m.frustumCulled = false; town.add(m); }
    for (const [em] of extras) { em.castShadow = em !== lamp && em !== flw; em.receiveShadow = true; em.frustumCulled = false; town.add(em); }

    // ---- Balai Petualang: pintu bisa dimasuki (interior di kota-guild.js) + hiasan pintu (obor, lambang, lingkaran cahaya) ----
    const gh = houses.find(h => h.name === 'BALAI PETUALANG');
    if (gh) {
      const sn = Math.sin(gh.th), cs = Math.cos(gh.th), pc = P(gh.d, gh.off), hd = gh.dep / 2;
      const at = f => toWorld(pc.x + sn * (hd + f), pc.z + cs * (hd + f));   // titik sejauh f dari dinding depan, tepat di depan pintu (sumbu +z lokal rumah)
      const a = at(0.9), b = at(3.4), o = at(3.2);
      Object.assign(GUILD_DOOR, { ready: true, x: a.x, z: a.z, r: 1.5, outX: o.x, outZ: o.z, face: Math.atan2(b.x - a.x, b.z - a.z) });
      const g = new THREE.Group(); g.position.set(pc.x, 0, pc.z); g.rotation.y = gh.th; town.add(g);
      for (const s of [-1, 1]) {   // obor kuning mengapit pintu
        mesh(cyl(0.07, 0.1, 2.3), M.timber, s * 1.7, 1.15, hd + 0.55, g); mesh(cyl(0.24, 0.12, 0.34, 6), M.torch, s * 1.7, 2.45, hd + 0.55, g, false); mesh(new THREE.IcosahedronGeometry(0.2, 0), M.torch, s * 1.7, 2.8, hd + 0.55, g, false);
        const q = toWorld(pc.x + sn * (hd + 0.55) + cs * s * 1.7, pc.z + cs * (hd + 0.55) - sn * s * 1.7); colliders.push({ x: q.x, z: q.z, r: 0.22 });
      }
      const sh = mesh(cyl(0.55, 0.55, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0x6e1420, roughness: 0.8, flatShading: true }), 0, 3.9, hd + 0.08, g); sh.rotation.x = Math.PI / 2;   // perisai merah di atas pintu
      mesh(box(0.1, 1.0, 0.06), M.trim, -0.18, 3.9, hd + 0.16, g).rotation.z = 0.7; mesh(box(0.1, 1.0, 0.06), M.trim, 0.18, 3.9, hd + 0.16, g).rotation.z = -0.7;   // dua pedang bersilang
      const gl = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowGoldT, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      gl.position.set(0, 0.06, hd + 0.9); g.add(gl);   // lingkaran cahaya di depan pintu: tanda "melangkah ke sini untuk masuk"

      // ---- BANGUNAN BALAI PETUALANG (diperindah): pondasi batu, dinding plester berbingkai kayu, atap pelana merah, gable depan bertulisan, menara sudut berbendera, cerobong, jendela berdaun jendela + kotak bunga, bendera guild, tong/peti/bangku/boneka latihan ----
      {
        const hw = gh.w / 2, WH = gh.wh, RH = gh.rh, W = gh.w, DP = gh.dep;
        const S = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, ...extra });
        const plaster = S(0xe0d0a0), stoneM = S(0x7d765e), stoneD = S(0x5f5945), beamM = S(0x3d2a1a), tileM = S(0x8f2c24), tileD = S(0x6a201b), goldM = S(0xe6bd4a, { metalness: 0.45, roughness: 0.45 }), ironM = S(0x2c2c32, { metalness: 0.5, roughness: 0.6 }), doorM = S(0x553519), woodL = S(0x7a5732), leafM = S(0x3f7a3a), flowM = S(0xffd24a);
        const glassM = new THREE.MeshStandardMaterial({ color: 0x31405e, emissive: 0xffc46a, emissiveIntensity: 0.9, roughness: 0.4 });
        const bannerT = ctex(128, 256, (x, w, h) => {
          x.fillStyle = '#8f1f1a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#e6bd4a'; x.lineWidth = 7; x.strokeRect(7, 7, w - 14, h - 14);
          x.lineWidth = 9; x.strokeStyle = '#f3e3a0'; x.lineCap = 'round'; x.beginPath(); x.moveTo(36, 62); x.lineTo(92, 150); x.moveTo(92, 62); x.lineTo(36, 150); x.stroke();   // dua pedang bersilang
          x.strokeStyle = '#e6bd4a'; x.lineWidth = 7; x.beginPath(); x.moveTo(48, 100); x.lineTo(30, 114); x.moveTo(80, 100); x.lineTo(98, 114); x.stroke();
          x.fillStyle = '#e6bd4a'; x.beginPath(); x.moveTo(64, 176); x.lineTo(84, 206); x.lineTo(64, 236); x.lineTo(44, 206); x.closePath(); x.fill();
        }, false);
        const bannerM = new THREE.MeshStandardMaterial({ map: bannerT, roughness: 1, side: THREE.DoubleSide });
        const A = (geo, m, x, y, z, sh = true) => mesh(geo, m, x, y, z, g, sh);
        const L = (lx, lz) => ({ x: pc.x + cs * lx + sn * lz, z: pc.z - sn * lx + cs * lz });   // koordinat lokal bangunan -> ruang kota (untuk tabrakan)
        const colL = (lx, lz, r) => { const q = L(lx, lz); col(q.x, q.z, r); };
        const prism = (w, d, hgt) => { const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, hgt); sh.closePath(); const gg = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }); gg.translate(0, 0, -w / 2); gg.rotateY(Math.PI / 2); return gg; };   // prisma segitiga: bubungan sejajar sumbu x

        // pondasi + dinding + rangka kayu
        A(box(W + 0.4, 0.7, DP + 0.4), stoneM, 0, 0.35, 0);
        A(box(W, WH - 0.7, DP), plaster, 0, 0.7 + (WH - 0.7) / 2, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) A(box(0.36, WH, 0.36), beamM, sx * hw, WH / 2, sz * hd);   // tiang sudut
        for (const sz of [-1, 1]) { A(box(W + 0.3, 0.3, 0.36), beamM, 0, WH - 0.15, sz * hd); A(box(W + 0.3, 0.26, 0.36), beamM, 0, 0.82, sz * hd); }
        for (const sx of [-1, 1]) { A(box(0.36, 0.3, DP + 0.3), beamM, sx * hw, WH - 0.15, 0); A(box(0.36, 0.26, DP + 0.3), beamM, sx * hw, 0.82, 0); }
        for (const sx of [-1, 1]) for (const x of [2.2, 5.0]) { A(box(0.2, WH - 0.9, 0.2), beamM, sx * x, 0.9 + (WH - 0.9) / 2, hd + 0.02); }   // tiang rangka depan
        for (const x of [-4, -1.3, 1.3, 4]) A(box(0.2, WH - 0.9, 0.2), beamM, x, 0.9 + (WH - 0.9) / 2, -hd - 0.02);                            // belakang
        for (const sx of [-1, 1]) { const br = A(box(0.16, 1.9, 0.16), beamM, sx * 5.6, 3.5, hd + 0.03); br.rotation.z = sx * 0.9; }              // penyangga serong di panel sudut atas

        // pintu: kusen batu + daun pintu berpalang besi
        for (const sx of [-1, 1]) A(box(0.36, 3.05, 0.5), stoneM, sx * 1.15, 1.52, hd + 0.22);
        A(box(2.9, 0.42, 0.56), stoneM, 0, 3.05, hd + 0.22); A(box(3.2, 0.14, 0.62), goldM, 0, 3.3, hd + 0.22);
        A(box(1.95, 2.7, 0.14), doorM, 0, 1.35, hd + 0.2);
        for (const y of [0.5, 1.35, 2.2]) A(box(1.97, 0.1, 0.17), ironM, 0, y, hd + 0.21);
        A(box(0.05, 2.7, 0.17), ironM, 0, 1.35, hd + 0.21);
        for (const sx of [-1, 1]) A(new THREE.SphereGeometry(0.07, 6, 6), goldM, sx * 0.2, 1.3, hd + 0.3, false);

        // jendela depan (bingkai, kaca menyala, kisi, daun jendela, ambang + kotak bunga)
        for (const sx of [-1, 1]) {
          const x = sx * 3.6;
          A(box(1.55, 1.75, 0.18), beamM, x, 2.25, hd + 0.05); A(box(1.2, 1.4, 0.1), glassM, x, 2.25, hd + 0.12, false);
          A(box(0.07, 1.4, 0.12), beamM, x, 2.25, hd + 0.14, false); A(box(1.2, 0.07, 0.12), beamM, x, 2.25, hd + 0.14, false);
          for (const o of [-0.95, 0.95]) A(box(0.5, 1.6, 0.09), doorM, x + o, 2.25, hd + 0.1);
          A(box(1.75, 0.12, 0.42), stoneM, x, 1.3, hd + 0.2); A(box(1.4, 0.26, 0.3), woodL, x, 1.5, hd + 0.34);
          for (let k = 0; k < 5; k++) A(new THREE.IcosahedronGeometry(0.1, 0), k % 2 ? flowM : leafM, x - 0.55 + k * 0.275, 1.7, hd + 0.34, false);
        }
        // jendela samping
        for (const sx of [-1, 1]) for (const z of (sx > 0 ? [-2, 1.7] : [1.7])) { A(box(0.18, 1.6, 1.3), beamM, sx * (hw + 0.04), 2.4, z); A(box(0.1, 1.25, 1.0), glassM, sx * (hw + 0.1), 2.4, z, false); A(box(0.12, 1.25, 0.06), beamM, sx * (hw + 0.12), 2.4, z, false); }

        // atap pelana + bubungan + cerobong
        A(prism(W + 1.0, DP + 0.9, RH), tileM, 0, WH, 0);
        A(box(W + 1.25, 0.22, 0.42), tileD, 0, WH + RH + 0.04, 0);
        { const ch = RH + 1.1; A(box(1.0, ch, 1.0), stoneM, hw * 0.5, WH + ch / 2 - 0.1, -hd * 0.12); A(box(1.35, 0.25, 1.35), stoneD, hw * 0.5, WH + ch - 0.05, -hd * 0.12); for (const o of [-0.22, 0.22]) A(box(0.3, 0.3, 0.3), stoneD, hw * 0.5 + o, WH + ch + 0.2, -hd * 0.12); }

        // gable depan (pediment) bertulisan + jendela bulat + hiasan emas
        { const sh = new THREE.Shape(); sh.moveTo(-3.7, 0); sh.lineTo(3.7, 0); sh.lineTo(0, 3.4); sh.closePath();
          const pg = new THREE.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: false }); A(pg, plaster, 0, WH, hd - 0.05);
          const ang = Math.atan2(3.4, 3.7), len = Math.hypot(3.7, 3.4) + 0.5;
          for (const sx of [-1, 1]) { const tr = A(box(len, 0.24, 0.72), tileD, sx * 1.85, WH + 1.72, hd + 0.3); tr.rotation.z = -sx * ang; }
          board(g, 'BALAI PETUALANG', 'Pendaftaran & misi dungeon', 4.8, 0.85, 0, WH + 0.68, hd + 0.62);
          const rw = A(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16), glassM, 0, WH + 2.05, hd + 0.52, false); rw.rotation.x = Math.PI / 2;
          const rr = A(new THREE.TorusGeometry(0.58, 0.07, 6, 18), goldM, 0, WH + 2.05, hd + 0.56, false);
          A(new THREE.IcosahedronGeometry(0.2, 0), goldM, 0, WH + 3.5, hd + 0.28, false); }

        // bendera guild di dinding depan
        for (const sx of [-1, 1]) { A(box(1.15, 0.08, 0.1), goldM, sx * 5.45, 3.95, hd + 0.1, false); const bn = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), bannerM); bn.position.set(sx * 5.45, 2.95, hd + 0.13); g.add(bn); }

        // menara sudut belakang-kiri: batu, celah panah menyala, pelana piramida, tiang bendera
        { const TW = 3.4, TH = 10.4, cx = -hw - 0.3, cz = -hd + 0.6;
          A(box(TW, TH, TW), stoneM, cx, TH / 2, cz); for (const y of [0.4, 5.2, TH - 0.2]) A(box(TW + 0.35, 0.34, TW + 0.35), stoneD, cx, y, cz);
          for (const y of [3.4, 7.6]) { A(box(0.22, 1.1, 0.12), glassM, cx, y, cz + TW / 2 + 0.02, false); A(box(0.12, 1.1, 0.22), glassM, cx - TW / 2 - 0.02, y, cz, false); A(box(0.22, 1.1, 0.12), glassM, cx, y, cz - TW / 2 - 0.02, false); }
          A(box(TW + 0.7, 0.4, TW + 0.7), stoneD, cx, TH + 0.2, cz);
          A(new THREE.ConeGeometry(2.7, 3.2, 4).rotateY(Math.PI / 4), tileM, cx, TH + 0.4 + 1.6, cz);
          A(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), goldM, cx, TH + 3.6 + 1.2, cz, false);
          const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), bannerM); fl.position.set(cx + 0.7, TH + 3.6 + 1.9, cz); fl.rotation.y = Math.PI / 2; g.add(fl);
          colL(cx, cz, 2.2); }

        // hiasan di depan: tong, peti, bangku, boneka latihan
        const barrel = (x, z) => { A(new THREE.CylinderGeometry(0.4, 0.36, 0.85, 10), woodL, x, 0.42, z); A(new THREE.TorusGeometry(0.39, 0.03, 5, 12), ironM, x, 0.28, z, false).rotation.x = Math.PI / 2; A(new THREE.TorusGeometry(0.39, 0.03, 5, 12), ironM, x, 0.62, z, false).rotation.x = Math.PI / 2; colL(x, z, 0.5); };
        barrel(-4.9, hd + 1.3); barrel(-5.6, hd + 0.8); barrel(-4.4, hd + 2.0);
        A(box(0.85, 0.85, 0.85), woodL, 5.1, 0.42, hd + 1.1); A(box(0.89, 0.07, 0.89), ironM, 5.1, 0.7, hd + 1.1, false); A(box(0.6, 0.6, 0.6), doorM, 5.2, 1.15, hd + 1.1); colL(5.1, hd + 1.1, 0.7);
        A(box(2.0, 0.12, 0.5), woodL, 3.9, 0.52, hd + 1.4); for (const sx of [-0.8, 0.8]) A(box(0.1, 0.5, 0.4), beamM, 3.9 + sx, 0.25, hd + 1.4); colL(3.9, hd + 1.4, 0.9);
        { const dx = 8.4, dz = hd + 0.3; A(new THREE.CylinderGeometry(0.1, 0.12, 1.9, 6), beamM, dx, 0.95, dz); A(box(1.3, 0.14, 0.14), beamM, dx, 1.5, dz); A(new THREE.IcosahedronGeometry(0.3, 0), S(0xc9a85a), dx, 1.55, dz, false); A(box(0.55, 0.7, 0.3), S(0xb89a4a), dx, 1.05, dz, false); A(box(0.06, 0.9, 0.04), ironM, dx + 0.75, 0.9, dz + 0.1, false).rotation.z = 0.15; colL(dx, dz, 0.6); }

        // halaman depan berubin batu (di atas jalan setapak yang sudah ada)
        { const a = L(-4.6, hd + 1.9), b = L(4.6, hd + 1.9); decalStrip(a.x, a.z, b.x, b.z, 3.4, M.cobble, 3, 0.33); }
        // dua ksatria berjaga di kiri-kanan jalan setapak depan guild, menghadap jalan
        { const l = L(-2.6, hd + 3.3), r = L(2.6, hd + 3.3); knightAt('Prajurit Arga', 'ksatria', 'Penjaga Balai Petualang', l.x, l.z, gh.th); knightAt('Ksatriawati Dewi', 'ksatriawati', 'Penjaga Balai Petualang', r.x, r.z, gh.th); }
      }
    }

    // ---- Penginapan: pintu bisa dimasuki (interior sederhana di kota-penginapan.js) + obor & lingkaran cahaya di depan pintu ----
    const ln = houses.find(h => h.name === 'PENGINAPAN');
    if (ln) {
      const sn = Math.sin(ln.th), cs = Math.cos(ln.th), pc = P(ln.d, ln.off), hd = ln.dep / 2;
      const at = f => toWorld(pc.x + sn * (hd + f), pc.z + cs * (hd + f));   // titik sejauh f dari dinding depan, tepat di depan pintu
      const a = at(0.9), b = at(3.4), o = at(3.2);
      Object.assign(LODGE_DOOR, { ready: true, x: a.x, z: a.z, r: 1.5, outX: o.x, outZ: o.z, face: Math.atan2(b.x - a.x, b.z - a.z) });
      const g = new THREE.Group(); g.position.set(pc.x, 0, pc.z); g.rotation.y = ln.th; town.add(g);
      for (const s of [-1, 1]) {   // obor kuning mengapit pintu
        mesh(cyl(0.07, 0.1, 2.3), M.timber, s * 1.4, 1.15, hd + 0.55, g); mesh(cyl(0.24, 0.12, 0.34, 6), M.torch, s * 1.4, 2.45, hd + 0.55, g, false); mesh(new THREE.IcosahedronGeometry(0.2, 0), M.torch, s * 1.4, 2.8, hd + 0.55, g, false);
        const q = toWorld(pc.x + sn * (hd + 0.55) + cs * s * 1.4, pc.z + cs * (hd + 0.55) - sn * s * 1.4); colliders.push({ x: q.x, z: q.z, r: 0.22 });
      }
      const gl = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowGoldT, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      gl.position.set(0, 0.06, hd + 0.9); g.add(gl);   // lingkaran cahaya di depan pintu: tanda "melangkah ke sini untuk masuk"
      // ---- BANGUNAN PENGINAPAN (diperindah): pondasi batu, dinding plester dua lantai berrangka kayu, balkon berpagar di atas pintu, atap pelana biru-hijau dengan 2 jendela atap (dormer), cerobong berasap, papan gantung bulan sabit, jendela berdaun jendela + kotak bunga, lentera, palung kuda, bangku, tong & jerami ----
      {
        const hw = ln.w / 2, WH = ln.wh, RH = ln.rh, W = ln.w, DP = ln.dep;
        const S = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, ...extra });
        const plaster = S(0xe8d9b0), stoneM = S(0x7d765e), stoneD = S(0x5a5545), stoneL = S(0x9a937e), beamM = S(0x3d2a1a), tileM = S(0x356a78, { side: THREE.DoubleSide }), tileD = S(0x234a55), goldM = S(0xe6bd4a, { metalness: 0.45, roughness: 0.45 }), ironM = S(0x2c2c32, { metalness: 0.5, roughness: 0.6 });
        const doorM = S(0x553519), woodL = S(0x7a5732), woodD = S(0x4a3322), leafM = S(0x3f7a3a), flowM = S(0xff8aa0), flowY = S(0xffd24a), hayM = S(0xd8b85a), smokeM = new THREE.MeshBasicMaterial({ color: 0x8a8884, transparent: true, opacity: 0.3, depthWrite: false });
        const glassM = new THREE.MeshStandardMaterial({ color: 0x31405e, emissive: 0xffc46a, emissiveIntensity: 1.0, roughness: 0.4 });
        const A = (geo, m, x, y, z, sh = true) => mesh(geo, m, x, y, z, g, sh);
        const L = (lx, lz) => ({ x: pc.x + cs * lx + sn * lz, z: pc.z - sn * lx + cs * lz });
        const colL = (lx, lz, r) => { const q = L(lx, lz); col(q.x, q.z, r); };
        const gz = (w, d, h) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath(); const gg = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); gg.translate(0, 0, -d / 2); return gg; };   // prisma segitiga dengan bubungan sejajar sumbu z
        const win = (x, y, ww, hh, flowers) => {   // jendela depan: bingkai, kaca menyala, kisi, daun jendela, ambang (+ kotak bunga)
          A(box(ww + 0.3, hh + 0.3, 0.16), beamM, x, y, hd + 0.04); A(box(ww, hh, 0.1), glassM, x, y, hd + 0.11, false);
          A(box(0.07, hh, 0.12), beamM, x, y, hd + 0.13, false); A(box(ww, 0.07, 0.12), beamM, x, y, hd + 0.13, false);
          for (const t of [-1, 1]) { const s2 = A(box(0.42, hh + 0.1, 0.06), doorM, x + t * (ww / 2 + 0.3), y, hd + 0.2, false); s2.rotation.y = -t * 0.7; }
          A(box(ww + 0.45, 0.1, 0.4), stoneM, x, y - hh / 2 - 0.2, hd + 0.18, false);
          if (flowers) { A(box(ww + 0.2, 0.24, 0.32), woodL, x, y - hh / 2 - 0.36, hd + 0.3); for (let k = 0; k < 5; k++) A(new THREE.IcosahedronGeometry(0.1, 0), k % 2 ? flowM : leafM, x - ww * 0.4 + k * ww * 0.2, y - hh / 2 - 0.16, hd + 0.3, false); }
        };

        // pondasi + dinding + rangka kayu (tiang sudut, ikat lantai 1 & 2, tiang tegak)
        A(box(W + 0.4, 0.6, DP + 0.4), stoneD, 0, 0.3, 0);
        A(box(W, WH - 0.6, DP), plaster, 0, 0.6 + (WH - 0.6) / 2, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) A(box(0.38, WH, 0.38), beamM, sx * hw, WH / 2, sz * hd);
        for (const sz of [-1, 1]) for (const y of [0.7, 2.45, WH - 0.15]) A(box(W + 0.3, y > 4 ? 0.3 : 0.22, 0.38), beamM, 0, y, sz * hd);
        for (const sx of [-1, 1]) for (const y of [0.7, 2.45, WH - 0.15]) A(box(0.38, y > 4 ? 0.3 : 0.22, DP + 0.3), beamM, sx * hw, y, 0);
        for (const sx of [-1, 1]) for (const x of [1.9, 5.0]) A(box(0.2, WH - 0.9, 0.2), beamM, sx * x, 0.7 + (WH - 0.9) / 2, hd + 0.02);
        for (const x of [-3.6, -1.2, 1.2, 3.6]) A(box(0.2, WH - 0.9, 0.2), beamM, x, 0.7 + (WH - 0.9) / 2, -hd - 0.02);

        // pintu: kusen batu, daun pintu berpalang besi
        for (const sx of [-1, 1]) A(box(0.3, 2.3, 0.46), stoneL, sx * 0.95, 1.15, hd + 0.2);
        A(box(2.2, 0.3, 0.5), stoneL, 0, 2.3, hd + 0.2);
        A(box(1.6, 2.1, 0.14), doorM, 0, 1.1, hd + 0.16);
        for (const y of [0.5, 1.1, 1.7]) A(box(1.62, 0.09, 0.17), ironM, 0, y, hd + 0.18, false);
        A(box(0.05, 2.1, 0.17), ironM, 0, 1.1, hd + 0.18, false);
        for (const sx of [-1, 1]) A(new THREE.SphereGeometry(0.07, 6, 6), goldM, sx * 0.18, 1.1, hd + 0.28, false);
        A(box(2.4, 0.14, 0.8), stoneL, 0, 0.07, hd + 0.4, false);

        // jendela: lantai bawah (berkotak bunga) & lantai atas
        for (const sx of [-1, 1]) { win(sx * 3.4, 1.55, 1.2, 1.0, true); win(sx * 3.4, 3.3, 1.0, 0.95, false); }
        for (const sx of [-1, 1]) for (const z of [-1.6, 1.6]) { A(box(0.18, 1.3, 1.2), beamM, sx * (hw + 0.04), 1.6, z); A(box(0.1, 1.0, 0.9), glassM, sx * (hw + 0.1), 1.6, z, false); A(box(0.18, 1.0, 1.1), beamM, sx * (hw + 0.04), 3.3, z); A(box(0.1, 0.75, 0.8), glassM, sx * (hw + 0.1), 3.3, z, false); }

        // balkon di atas pintu: lantai, 2 tiang penopang, pagar berjeruji, pintu balkon kaca, kain merah, 2 lentera
        A(box(4.6, 0.16, 1.4), woodL, 0, 2.52, hd + 0.7);
        for (const sx of [-1, 1]) { A(box(0.2, 2.5, 0.2), beamM, sx * 2.1, 1.25, hd + 1.3); colL(sx * 2.1, hd + 1.3, 0.28); const br = A(box(0.14, 0.9, 0.14), beamM, sx * 2.1, 2.2, hd + 0.95); br.rotation.x = -0.7; A(box(0.1, 0.1, 1.4), beamM, sx * 2.3, 3.1, hd + 0.7, false); A(new THREE.SphereGeometry(0.14, 8, 6), M.torch, sx * 2.3, 3.4, hd + 1.35, false); }
        A(box(4.7, 0.1, 0.1), beamM, 0, 3.15, hd + 1.35, false);
        for (let k = 0; k < 11; k++) A(box(0.06, 0.62, 0.06), beamM, -2.2 + k * 0.44, 2.8, hd + 1.35, false);
        { const cl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.5), new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 1, side: THREE.DoubleSide })); cl.position.set(0, 2.85, hd + 1.37); g.add(cl); }
        A(box(1.6, 1.5, 0.16), beamM, 0, 3.35, hd + 0.06); A(box(1.3, 1.25, 0.1), glassM, 0, 3.35, hd + 0.13, false); A(box(0.07, 1.25, 0.12), beamM, 0, 3.35, hd + 0.15, false);

        // atap pelana biru-hijau + bubungan + papan tepi + 2 jendela atap
        const roof = A(roofG, tileM, 0, WH, 0); roof.scale.set(W + 1.2, RH, DP + 1.2);
        A(box(W + 1.3, 0.2, 0.4), tileD, 0, WH + RH + 0.04, 0);
        for (const sz of [-1, 1]) A(box(W + 1.2, 0.14, 0.14), beamM, 0, WH + 0.02, sz * (DP + 1.2) / 2, false);
        for (const sx of [-1, 1]) {
          const dx = sx * 3.0, dz = 2.4;
          A(box(1.3, 0.9, 1.2), plaster, dx, 5.45 - 0.1 + (WH - 4.2), dz);
          A(box(0.8, 0.6, 0.1), glassM, dx, 5.45 - 0.1 + (WH - 4.2), dz + 0.63, false);
          A(box(1.0, 0.8, 0.06), beamM, dx, 5.45 - 0.1 + (WH - 4.2), dz + 0.62, false);
          A(gz(1.8, 1.5, 0.6), tileD, dx, 5.9 - 0.1 + (WH - 4.2), dz);
        }
        // cerobong batu + 2 pot + asap
        { const cx = hw * 0.55, cz = -hd * 0.25, top = WH + RH + 0.9;
          A(box(1.1, top, 1.1), stoneM, cx, top / 2, cz); A(box(1.4, 0.22, 1.4), stoneD, cx, top + 0.1, cz); for (const o of [-0.25, 0.25]) A(cyl(0.2, 0.24, 0.4, 8), stoneD, cx + o, top + 0.4, cz, false);
          for (const [dx, dy, r] of [[0.1, 1.2, 0.45], [0.35, 2.2, 0.65]]) A(new THREE.IcosahedronGeometry(r, 1), smokeM, cx + dx, top + dy, cz, false); }

        // papan gantung bulan sabit (menjorok ke jalan)
        { const signT = ctex(128, 128, (x, w, h) => {
            x.fillStyle = '#2b2a4a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#e6bd4a'; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8);
            x.fillStyle = '#ffe9a0'; x.beginPath(); x.arc(58, 62, 30, 0, 6.3); x.fill(); x.fillStyle = '#2b2a4a'; x.beginPath(); x.arc(72, 54, 27, 0, 6.3); x.fill();
            x.fillStyle = '#f3e3a0'; x.font = 'bold 28px Georgia'; x.fillText('Z', 82, 104); x.font = 'bold 20px Georgia'; x.fillText('z', 100, 88);
          }, false);
          const signM = new THREE.MeshStandardMaterial({ map: signT, roughness: 1 });
          A(box(0.09, 0.09, 1.4), ironM, -4.6, 3.65, hd + 0.7, false); for (const z of [hd + 0.45, hd + 1.2]) A(box(0.025, 0.4, 0.025), ironM, -4.6, 3.4, z, false);
          A(box(0.08, 0.9, 1.0), [signM, signM, beamM, beamM, beamM, beamM], -4.6, 2.8, hd + 0.85, false); }

        // halaman depan: jalan batu, palung kuda + tiang tambat, bangku, tong, jerami
        { const a = L(-4.4, hd + 2.0), b = L(4.4, hd + 2.0); decalStrip(a.x, a.z, b.x, b.z, 3.2, M.cobble, 3, 0.33); }
        A(box(1.9, 0.4, 0.55), woodD, -4.2, 0.45, hd + 1.7); A(box(1.7, 0.02, 0.4), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.2 }), -4.2, 0.66, hd + 1.7, false); for (const sx of [-1, 1]) A(box(0.14, 0.45, 0.5), woodD, -4.2 + sx * 0.8, 0.22, hd + 1.7, false); colL(-4.2, hd + 1.7, 0.95);
        for (const sx of [-1, 1]) A(box(0.14, 1.3, 0.14), beamM, -4.2 + sx * 1.3, 0.65, hd + 2.5); A(box(2.7, 0.08, 0.08), beamM, -4.2, 1.1, hd + 2.5, false); colL(-5.5, hd + 2.5, 0.25); colL(-2.9, hd + 2.5, 0.25);
        A(box(2.0, 0.1, 0.5), woodL, 3.4, 0.5, hd + 1.2); for (const sx of [-0.8, 0.8]) A(box(0.1, 0.5, 0.4), beamM, 3.4 + sx, 0.25, hd + 1.2); colL(3.4, hd + 1.2, 0.9);
        const barrel = (x, z) => { A(new THREE.CylinderGeometry(0.4, 0.36, 0.85, 10), woodL, x, 0.42, z); for (const y of [0.28, 0.62]) A(new THREE.TorusGeometry(0.39, 0.03, 5, 12), ironM, x, y, z, false).rotation.x = Math.PI / 2; colL(x, z, 0.5); };
        barrel(5.0, hd + 0.9); barrel(5.7, hd + 0.5); barrel(5.2, hd + 1.7);
        for (const [x, z] of [[-5.9, hd + 0.7], [-5.5, hd + 1.4]]) { const hb = A(cyl(0.5, 0.5, 0.7, 10), hayM, x, 0.35, z); hb.rotation.z = Math.PI / 2; colL(x, z, 0.6); }
      }
    }

    // ---- Toko Ramuan: pintu bisa dimasuki (interior sederhana di kota-toko-ramuan.js) + obor & lingkaran cahaya di depan pintu ----
    const pt = houses.find(h => h.name === 'TOKO RAMUAN');
    if (pt) {
      const sn = Math.sin(pt.th), cs = Math.cos(pt.th), pc = P(pt.d, pt.off), hd = pt.dep / 2;
      const at = f => toWorld(pc.x + sn * (hd + f), pc.z + cs * (hd + f));   // titik sejauh f dari dinding depan, tepat di depan pintu
      const a = at(0.9), b = at(3.4), o = at(3.2);
      Object.assign(POTION_DOOR, { ready: true, x: a.x, z: a.z, r: 1.5, outX: o.x, outZ: o.z, face: Math.atan2(b.x - a.x, b.z - a.z) });
      const g = new THREE.Group(); g.position.set(pc.x, 0, pc.z); g.rotation.y = pt.th; town.add(g);
      for (const s of [-1, 1]) {   // obor kuning mengapit pintu
        mesh(cyl(0.07, 0.1, 2.3), M.timber, s * 1.1, 1.15, hd + 0.55, g); mesh(cyl(0.24, 0.12, 0.34, 6), M.torch, s * 1.1, 2.45, hd + 0.55, g, false); mesh(new THREE.IcosahedronGeometry(0.2, 0), M.torch, s * 1.1, 2.8, hd + 0.55, g, false);
        const q = toWorld(pc.x + sn * (hd + 0.55) + cs * s * 1.1, pc.z + cs * (hd + 0.55) - sn * s * 1.1); colliders.push({ x: q.x, z: q.z, r: 0.22 });
      }
      const gl = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowGoldT, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      gl.position.set(0, 0.06, hd + 0.9); g.add(gl);   // lingkaran cahaya di depan pintu: tanda "melangkah ke sini untuk masuk"
      // ---- BANGUNAN TOKO RAMUAN (diperindah): dinding plester kehijauan berrangka kayu, atap ungu dengan labu kaca bercahaya di bubungan, kanopi bergaris di atas pintu, jendela etalase berpendar, papan gantung botol, rak botol ramuan, kuali mendidih, tong tanaman & ikatan herba ----
      {
        const hw = pt.w / 2, WH = pt.wh, RH = pt.rh, W = pt.w, DP = pt.dep;
        const S = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, ...extra });
        const plaster = S(0xcfdcb4), stoneM = S(0x7d765e), stoneD = S(0x5a5545), stoneL = S(0x9a937e), beamM = S(0x3d2a1a), tileM = S(0x6a3f8a, { side: THREE.DoubleSide }), tileD = S(0x45285c), ironM = S(0x2c2c32, { metalness: 0.5, roughness: 0.6 }), goldM = S(0xe6bd4a, { metalness: 0.45, roughness: 0.45 });
        const doorM = S(0x553519), woodL = S(0x7a5732), woodD = S(0x4a3322), leafM = S(0x3f7a3a), leafL = S(0x6fae4a), herbO = S(0xd88a3a), herbP = S(0xa860c8), smokeM = new THREE.MeshBasicMaterial({ color: 0xa890c0, transparent: true, opacity: 0.32, depthWrite: false });
        const glassM = new THREE.MeshStandardMaterial({ color: 0x4a3a7a, emissive: 0xb07aff, emissiveIntensity: 0.9, roughness: 0.4 });
        const bot = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, roughness: 0.3, transparent: true, opacity: 0.92 });
        const botM = [bot(0xe0405a), bot(0x4a90e8), bot(0x4ae07a), bot(0xb06ad8), bot(0xf2c94a)];
        const A = (geo, m, x, y, z, sh = true) => mesh(geo, m, x, y, z, g, sh);
        const L = (lx, lz) => ({ x: pc.x + cs * lx + sn * lz, z: pc.z - sn * lx + cs * lz });
        const colL = (lx, lz, r) => { const q = L(lx, lz); col(q.x, q.z, r); };
        const flask = (x, y, z, k) => { A(new THREE.CylinderGeometry(0.1, 0.13, 0.26, 8), botM[k % 5], x, y + 0.13, z, false); A(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6), woodL, x, y + 0.32, z, false); };

        // pondasi + dinding + rangka kayu
        A(box(W + 0.4, 0.5, DP + 0.4), stoneD, 0, 0.25, 0);
        A(box(W, WH - 0.5, DP), plaster, 0, 0.5 + (WH - 0.5) / 2, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) A(box(0.36, WH, 0.36), beamM, sx * hw, WH / 2, sz * hd);
        for (const sz of [-1, 1]) for (const y of [0.6, WH - 0.15]) A(box(W + 0.3, 0.26, 0.36), beamM, 0, y, sz * hd);
        for (const sx of [-1, 1]) for (const y of [0.6, WH - 0.15]) A(box(0.36, 0.26, DP + 0.3), beamM, sx * hw, y, 0);
        for (const sx of [-1, 1]) { A(box(0.18, WH - 0.8, 0.18), beamM, sx * 1.4, 0.6 + (WH - 0.8) / 2, hd + 0.02); const br = A(box(0.14, 1.3, 0.14), beamM, sx * 3.0, WH - 0.7, hd + 0.03, false); br.rotation.z = sx * 0.8; }

        // pintu: kusen kayu + daun pintu hijau tua berpalang besi
        for (const sx of [-1, 1]) A(box(0.28, 2.3, 0.4), beamM, sx * 0.78, 1.15, hd + 0.16);
        A(box(1.84, 0.28, 0.42), beamM, 0, 2.3, hd + 0.16);
        A(box(1.28, 2.1, 0.12), S(0x2f5a3a), 0, 1.05, hd + 0.12);
        for (const y of [0.55, 1.5]) A(box(1.3, 0.09, 0.15), ironM, 0, y, hd + 0.14, false);
        A(new THREE.SphereGeometry(0.07, 6, 6), goldM, 0.4, 1.1, hd + 0.2, false);
        A(box(2.0, 0.14, 0.7), stoneL, 0, 0.07, hd + 0.35, false);

        // kanopi bergaris di atas pintu (2 tiang)
        { const stripeT = ctex(128, 64, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f1ead6' : '#7a3f9a'; x.fillRect(i * w / 8, 0, w / 8, h); } }, false);
          const awn = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.7), new THREE.MeshStandardMaterial({ map: stripeT, roughness: 1 })); awn.position.set(0, 2.9, hd + 0.85); awn.rotation.x = 0.28; awn.castShadow = true; g.add(awn);
          for (const sx of [-1, 1]) { A(box(0.12, 2.6, 0.12), beamM, sx * 1.65, 1.3, hd + 1.55); colL(sx * 1.65, hd + 1.55, 0.25); }
          for (let k = 0; k < 7; k++) { const x = -1.35 + k * 0.45, hbl = A(new THREE.ConeGeometry(0.1, 0.4, 5), k % 3 === 0 ? herbO : k % 3 === 1 ? leafL : herbP, x, 2.15, hd + 1.62, false); hbl.rotation.x = Math.PI; A(box(0.02, 0.35, 0.02), woodL, x, 2.5, hd + 1.62, false); } }

        // dua jendela etalase berpendar ungu + daun jendela + kotak tanaman
        for (const s of [-1, 1]) {
          const x = s * 2.3;
          A(box(1.1, 1.0, 0.16), beamM, x, 1.75, hd + 0.04); A(box(0.9, 0.8, 0.1), glassM, x, 1.75, hd + 0.11, false); A(box(0.06, 0.8, 0.12), beamM, x, 1.75, hd + 0.13, false); A(box(0.9, 0.06, 0.12), beamM, x, 1.75, hd + 0.13, false);
          for (let k = 0; k < 3; k++) flask(x - 0.3 + k * 0.3, 1.4, hd + 0.18, k + (s > 0 ? 2 : 0));
          for (const t of [-1, 1]) { const s2 = A(box(0.4, 1.0, 0.06), S(0x2f5a3a), x + t * 0.78, 1.75, hd + 0.2, false); s2.rotation.y = -t * 0.7; }
          A(box(1.3, 0.1, 0.4), stoneL, x, 1.2, hd + 0.18, false); A(box(1.15, 0.22, 0.3), woodL, x, 1.0, hd + 0.3);
          for (let k = 0; k < 4; k++) A(new THREE.IcosahedronGeometry(0.1, 0), k % 2 ? herbP : leafL, x - 0.4 + k * 0.27, 1.2, hd + 0.3, false);
        }
        // jendela bulat di dinding samping
        for (const sx of [-1, 1]) { const rw = A(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 14), glassM, sx * (hw + 0.04), 1.9, 0, false); rw.rotation.z = Math.PI / 2; const rr = A(new THREE.TorusGeometry(0.5, 0.07, 6, 16), beamM, sx * (hw + 0.07), 1.9, 0, false); rr.rotation.y = Math.PI / 2; }

        // atap ungu + bubungan + labu kaca bercahaya di ujung bubungan
        const roof = A(roofG, tileM, 0, WH, 0); roof.scale.set(W + 1.1, RH, DP + 1.1);
        A(box(W + 1.2, 0.18, 0.34), tileD, 0, WH + RH + 0.03, 0);
        for (const sz of [-1, 1]) A(box(W + 1.1, 0.13, 0.12), beamM, 0, WH + 0.02, sz * (DP + 1.1) / 2, false);
        A(new THREE.SphereGeometry(0.3, 10, 8), glassM, -hw - 0.2, WH + RH + 0.45, 0, false); A(cyl(0.06, 0.1, 0.35, 6), goldM, -hw - 0.2, WH + RH + 0.15, 0, false);
        // cerobong kecil + asap ungu
        { const cx = hw * 0.35, cz = -hd * 0.3, top = WH + RH + 0.8;
          A(box(0.9, top, 0.9), stoneM, cx, top / 2, cz); A(box(1.15, 0.2, 1.15), stoneD, cx, top + 0.1, cz);
          for (const [dx, dy, r] of [[0.05, 0.9, 0.35], [0.3, 1.7, 0.5], [0.6, 2.6, 0.65]]) A(new THREE.IcosahedronGeometry(r, 1), smokeM, cx + dx, top + dy, cz, false); }

        // papan gantung botol ramuan
        { const signT = ctex(128, 128, (x, w, h) => {
            x.fillStyle = '#2a1f3a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#e6bd4a'; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8);
            x.fillStyle = '#d8dde6'; x.fillRect(54, 22, 20, 22); x.fillStyle = '#7a5732'; x.fillRect(51, 16, 26, 9);
            x.fillStyle = '#e0405a'; x.beginPath(); x.moveTo(54, 44); x.lineTo(74, 44); x.lineTo(100, 100); x.lineTo(28, 100); x.closePath(); x.fill();
            x.fillStyle = 'rgba(255,255,255,0.7)'; for (const [bx, by, r] of [[52, 78, 5], [72, 70, 4], [64, 88, 6]]) { x.beginPath(); x.arc(bx, by, r, 0, 6.3); x.fill(); }
          }, false);
          const signM = new THREE.MeshStandardMaterial({ map: signT, roughness: 1 });
          A(box(0.09, 0.09, 1.2), ironM, hw - 0.2, 3.0, hd + 0.6, false); for (const z of [hd + 0.4, hd + 1.0]) A(box(0.025, 0.3, 0.025), ironM, hw - 0.2, 2.8, z, false);
          A(box(0.08, 0.75, 0.8), [signM, signM, beamM, beamM, beamM, beamM], hw - 0.2, 2.4, hd + 0.7, false); }

        // halaman depan: jalan batu, rak botol (3 tingkat), kuali mendidih + api, tong tanaman, peti herba
        { const a = L(-3.6, hd + 2.0), b = L(3.6, hd + 2.0); decalStrip(a.x, a.z, b.x, b.z, 3.0, M.cobble, 3, 0.33); }
        { const rx = hw - 0.4, rz = hd + 1.25;   // rak botol di kanan pintu
          for (const s of [-1, 1]) A(box(0.1, 1.6, 0.1), beamM, rx + s * 0.7, 0.8, rz);
          for (const y of [0.35, 0.85, 1.35]) A(box(1.5, 0.07, 0.4), woodL, rx, y, rz);
          for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) flask(rx - 0.55 + k * 0.37, 0.38 + r * 0.5, rz, r * 4 + k);
          colL(rx, rz, 0.95); }
        { const kx = -hw + 0.1, kz = hd + 1.3;   // kuali di kiri pintu
          for (const a of [0, 2.1, 4.2]) A(box(0.1, 0.45, 0.1), ironM, kx + Math.cos(a) * 0.4, 0.22, kz + Math.sin(a) * 0.4, false);
          A(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.72), S(0x2c2c32, { metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide }), kx, 0.95, kz).scale.y = 0.85;
          A(new THREE.TorusGeometry(0.48, 0.06, 6, 14), ironM, kx, 1.27, kz, false).rotation.x = Math.PI / 2;
          A(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 14), new THREE.MeshStandardMaterial({ color: 0x4ae07a, emissive: 0x2ab050, emissiveIntensity: 1.1, roughness: 0.3 }), kx, 1.15, kz, false);
          for (const [dx, dz, r] of [[0.15, 0.1, 0.1], [-0.2, -0.15, 0.08], [0.0, -0.25, 0.07]]) A(new THREE.SphereGeometry(r, 6, 5), new THREE.MeshBasicMaterial({ color: 0x9af0b0 }), kx + dx, 1.17 + r, kz + dz, false);
          for (let k = 0; k < 3; k++) A(new THREE.ConeGeometry(0.12, 0.4, 5), new THREE.MeshBasicMaterial({ color: 0xffa030 }), kx - 0.2 + k * 0.2, 0.2, kz + 0.05, false);
          const fl = new THREE.Mesh(new THREE.CircleGeometry(1.8, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowGoldT, color: 0x6aff9a, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })); fl.position.set(kx, 0.08, kz); g.add(fl);
          colL(kx, kz, 0.85); }
        { const tx = -hw - 0.5, tz = hd - 0.3;   // tong tanaman & peti herba di samping
          A(cyl(0.45, 0.4, 0.8, 10), woodL, tx, 0.4, tz); for (let k = 0; k < 5; k++) A(new THREE.IcosahedronGeometry(0.2, 0), k % 2 ? leafM : leafL, tx - 0.25 + (k % 3) * 0.25, 0.95 + (k % 2) * 0.12, tz + (k > 2 ? 0.15 : -0.1), false); colL(tx, tz, 0.5);
          A(box(0.9, 0.5, 0.6), woodL, hw + 0.6, 0.25, hd - 0.4); for (let k = 0; k < 4; k++) A(new THREE.IcosahedronGeometry(0.17, 0), k % 2 ? herbP : herbO, hw + 0.35 + k * 0.17, 0.58, hd - 0.4, false); colL(hw + 0.6, hd - 0.4, 0.6); }
      }
    }

    // ---- Pandai Besi: pintu bisa dimasuki (interior sederhana di kota-pandai-besi.js) + hiasan pintu (obor, lingkaran cahaya) ----
    const sm = houses.find(h => h.name === 'PANDAI BESI');
    if (sm) {
      const sn = Math.sin(sm.th), cs = Math.cos(sm.th), pc = P(sm.d, sm.off), hd = sm.dep / 2;
      const at = f => toWorld(pc.x + sn * (hd + f), pc.z + cs * (hd + f));   // titik sejauh f dari dinding depan, tepat di depan pintu (sumbu +z lokal rumah)
      const a = at(0.9), b = at(3.4), o = at(3.2);
      Object.assign(SMITH_DOOR, { ready: true, x: a.x, z: a.z, r: 1.5, outX: o.x, outZ: o.z, face: Math.atan2(b.x - a.x, b.z - a.z) });
      const g = new THREE.Group(); g.position.set(pc.x, 0, pc.z); g.rotation.y = sm.th; town.add(g);
      for (const s of [-1, 1]) {   // obor kuning mengapit pintu
        mesh(cyl(0.07, 0.1, 2.3), M.timber, s * 1.25, 1.15, hd + 0.55, g); mesh(cyl(0.24, 0.12, 0.34, 6), M.torch, s * 1.25, 2.45, hd + 0.55, g, false); mesh(new THREE.IcosahedronGeometry(0.2, 0), M.torch, s * 1.25, 2.8, hd + 0.55, g, false);
        const q = toWorld(pc.x + sn * (hd + 0.55) + cs * s * 1.25, pc.z + cs * (hd + 0.55) - sn * s * 1.25); colliders.push({ x: q.x, z: q.z, r: 0.22 });
      }
      const gl = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowGoldT, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      gl.position.set(0, 0.06, hd + 0.9); g.add(gl);   // lingkaran cahaya di depan pintu: tanda "melangkah ke sini untuk masuk"
      // ---- BANGUNAN PANDAI BESI (diperindah): dinding batu berbingkai kayu, atap sirap gelap, cerobong tinggi berasap, pintu berpalang besi, jendela berpendar api, papan gantung landasan, bengkel tempa terbuka di sisi kanan + rak senjata, tong, kayu bakar ----
      {
        const hw = sm.w / 2, WH = sm.wh, RH = sm.rh, W = sm.w, DP = sm.dep;
        const S = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, ...extra });
        const stoneT = ctex(256, 128, (x, w, h) => {
          x.fillStyle = '#6a6455'; x.fillRect(0, 0, w, h);
          for (let r = 0; r < 4; r++) { let cx = (r % 2) * 24 - 24; while (cx < w) { const bw = 40 + (Math.random() * 30 | 0), gr = 96 + (Math.random() * 34 | 0); x.fillStyle = `rgb(${gr + 14},${gr + 8},${gr - 8})`; x.fillRect(cx + 2, r * 32 + 2, bw - 4, 28); cx += bw; } }
        });
        stoneT.repeat.set(3.2, 1.6);
        const stoneW = new THREE.MeshStandardMaterial({ map: stoneT, roughness: 1, flatShading: true });
        const stoneM = S(0x7d765e), stoneD = S(0x4f4b42), stoneL = S(0x9a937e), beamM = S(0x3a2818), woodL = S(0x7a5732), doorM = S(0x553519), soot = S(0x1c1a18);
        const slateM = S(0x464a58, { side: THREE.DoubleSide }), slateD = S(0x2f323c);
        const ironM = S(0x2c2c32, { metalness: 0.5, roughness: 0.6 }), steelM = S(0xb9bfc9, { metalness: 0.6, roughness: 0.4 }), goldM = S(0xe6bd4a, { metalness: 0.45, roughness: 0.45 });
        const coalM = new THREE.MeshStandardMaterial({ color: 0x401a08, emissive: 0xff5a10, emissiveIntensity: 1.4, roughness: 0.8, flatShading: true });
        const glassM = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, emissive: 0xff9a40, emissiveIntensity: 1.2, roughness: 0.4 });
        const flameM = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 });
        const smokeM = new THREE.MeshBasicMaterial({ color: 0x5a5754, transparent: true, opacity: 0.35, depthWrite: false });
        const A = (geo, m, x, y, z, sh = true) => mesh(geo, m, x, y, z, g, sh);
        const L = (lx, lz) => ({ x: pc.x + cs * lx + sn * lz, z: pc.z - sn * lx + cs * lz });   // koordinat lokal bangunan -> ruang kota (untuk tabrakan)
        const colL = (lx, lz, r) => { const q = L(lx, lz); col(q.x, q.z, r); };

        // pondasi + dinding batu + rangka kayu
        A(box(W + 0.4, 0.5, DP + 0.4), stoneD, 0, 0.25, 0);
        A(box(W, WH - 0.5, DP), stoneW, 0, 0.5 + (WH - 0.5) / 2, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) A(box(0.42, WH, 0.42), beamM, sx * hw, WH / 2, sz * hd);   // tiang sudut
        for (const sz of [-1, 1]) A(box(W + 0.3, 0.3, 0.4), beamM, 0, WH - 0.15, sz * hd);
        for (const sx of [-1, 1]) A(box(0.4, 0.3, DP + 0.3), beamM, sx * hw, WH - 0.15, 0);

        // atap sirap gelap + bubungan + papan tepi atap
        const roof = A(roofG, slateM, 0, WH, 0); roof.scale.set(W + 1.0, RH, DP + 1.0);
        A(box(W + 1.1, 0.2, 0.34), slateD, 0, WH + RH + 0.02, 0);
        for (const sz of [-1, 1]) A(box(W + 1.0, 0.14, 0.12), beamM, 0, WH + 0.02, sz * (DP + 1.0) / 2, false);

        // cerobong batu tinggi di belakang + bara di mulutnya + asap
        { const cx = 2.7, cz = -hd - 0.15, top = WH + RH + 1.1;
          A(box(1.4, top, 1.2), stoneM, cx, top / 2, cz); A(box(1.7, 0.22, 1.5), stoneD, cx, top + 0.11, cz); A(box(0.9, 0.06, 0.7), soot, cx, top + 0.24, cz, false); A(box(0.7, 0.05, 0.5), coalM, cx, top + 0.27, cz, false);
          for (const [dx, dy, r] of [[0.1, 1.1, 0.5], [0.35, 2.1, 0.7], [0.7, 3.3, 0.95]]) A(new THREE.IcosahedronGeometry(r, 1), smokeM, cx + dx, top + dy, cz, false);
        }

        // pintu: kusen batu + daun pintu berpalang besi + undakan
        for (const s of [-1, 1]) A(box(0.34, 2.55, 0.4), stoneL, s * 0.95, 1.275, hd + 0.04);
        A(box(2.24, 0.38, 0.4), stoneL, 0, 2.6, hd + 0.04);
        A(box(1.56, 2.3, 0.14), doorM, 0, 1.15, hd + 0.02);
        for (const y of [0.55, 1.3, 2.0]) A(box(1.56, 0.1, 0.05), ironM, 0, y, hd + 0.11, false);
        for (const x of [-0.39, 0.39]) A(box(0.03, 2.3, 0.02), soot, x, 1.15, hd + 0.1, false);
        A(new THREE.TorusGeometry(0.1, 0.02, 5, 10), ironM, 0.5, 1.1, hd + 0.12, false);
        A(box(2.6, 0.1, 0.7), stoneL, 0, 0.05, hd + 0.35, false);

        // dua jendela depan berpendar api (terali besi + daun jendela terbuka)
        for (const s of [-1, 1]) {
          const x = s * 2.9;
          A(box(1.15, 1.05, 0.12), beamM, x, 2.0, hd + 0.03); A(box(0.95, 0.85, 0.1), glassM, x, 2.0, hd + 0.07, false);
          for (const i of [-0.3, 0, 0.3]) A(box(0.04, 0.85, 0.05), ironM, x + i, 2.0, hd + 0.12, false);
          A(box(1.3, 0.1, 0.3), stoneL, x, 1.45, hd + 0.1, false);
          for (const t of [-1, 1]) { const sh2 = A(box(0.46, 1.0, 0.06), woodL, x + t * 0.82, 2.0, hd + 0.22, false); sh2.rotation.y = -t * 0.7; }
        }

        // papan gantung bergambar landasan (menjorok dari dinding, tampak dari jalan)
        { const signT = ctex(128, 128, (x, w, h) => {
            x.fillStyle = '#2b2420'; x.fillRect(0, 0, w, h); x.strokeStyle = '#e6bd4a'; x.lineWidth = 6; x.strokeRect(4, 4, w - 8, h - 8);
            x.fillStyle = '#d8dde6'; x.fillRect(26, 44, 76, 16); x.beginPath(); x.moveTo(102, 44); x.lineTo(124, 52); x.lineTo(102, 60); x.closePath(); x.fill(); x.fillRect(48, 60, 32, 22); x.fillRect(34, 82, 60, 14);
            x.fillStyle = '#ff9a30'; for (const [sx2, sy2, r] of [[40, 30, 4], [64, 22, 5], [88, 32, 4]]) { x.beginPath(); x.arc(sx2, sy2, r, 0, 6.3); x.fill(); }
          }, false);
          const signM = new THREE.MeshStandardMaterial({ map: signT, roughness: 1 });
          A(box(0.09, 0.09, 1.3), ironM, 1.55, 3.0, hd + 0.65, false);
          for (const z of [hd + 0.4, hd + 1.15]) A(box(0.025, 0.35, 0.025), ironM, 1.55, 2.8, z, false);
          A(box(0.08, 0.8, 0.95), [signM, signM, beamM, beamM, beamM, beamM], 1.55, 2.25, hd + 0.78, false);
        }

        // halaman depan: jalan batu, dua tong, rak senjata
        { const a2 = L(-3.4, hd + 1.9), b2 = L(3.4, hd + 1.9); decalStrip(a2.x, a2.z, b2.x, b2.z, 3.0, M.cobble, 3, 0.33); }
        const barrel = (x, z) => { A(cyl(0.4, 0.36, 0.85, 10), woodL, x, 0.42, z); A(new THREE.TorusGeometry(0.39, 0.03, 5, 12), ironM, x, 0.28, z, false).rotation.x = Math.PI / 2; A(new THREE.TorusGeometry(0.39, 0.03, 5, 12), ironM, x, 0.64, z, false).rotation.x = Math.PI / 2; colL(x, z, 0.45); };
        barrel(-3.9, hd + 0.9); barrel(-3.3, hd + 1.5);
        { const rx = -2.3, rz = hd + 0.55;
          for (const s of [-1, 1]) A(box(0.12, 1.6, 0.12), beamM, rx + s * 0.9, 0.8, rz);
          A(box(1.9, 0.1, 0.1), beamM, rx, 1.45, rz); A(box(1.9, 0.1, 0.1), beamM, rx, 0.7, rz);
          for (let i = 0; i < 4; i++) { const x = rx - 0.65 + i * 0.43; A(box(0.07, 0.95, 0.025), steelM, x, 1.0, rz, false); A(box(0.24, 0.05, 0.05), goldM, x, 0.55, rz, false); }
          colL(rx, rz, 1.0);
        }
        // tumpukan kayu bakar di dinding kiri
        for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) { const lg = A(cyl(0.12, 0.12, 1.4, 6), woodL, -hw - 0.45 + (i - (2 - r) / 2) * 0.26, 0.13 + r * 0.23, 0.4, false); lg.rotation.x = Math.PI / 2; }
        colL(-hw - 0.45, 0.4, 0.8);

        // bengkel tempa terbuka di sisi kanan: atap miring, tungku menyala, landasan, tong air, batu asah, rak pedang
        { const SX1 = hw + 4.0, SZ0 = -1.4, SZ1 = 3.0, cxs = hw + 2.0;
          A(box(4.0, 0.08, 4.4), stoneD, cxs, 0.04, 0.8, false);
          A(box(4.0, 2.4, 0.18), stoneW, cxs, 1.2, SZ0);   // dinding belakang bengkel
          for (const z of [SZ0, SZ1]) { A(box(0.26, 2.6, 0.26), beamM, SX1, 1.3, z); colL(SX1, z, 0.3); }
          const lean = A(box(4.3, 0.14, 4.8), slateM, hw + 2.05, 2.8, 0.8); lean.rotation.z = -0.1;
          // tungku
          const fx = hw + 1.1, fz = SZ0 + 0.9;
          A(box(1.6, 0.85, 1.1), stoneM, fx, 0.5, fz); A(box(1.7, 0.1, 1.2), stoneD, fx, 0.97, fz); A(box(1.3, 0.1, 0.8), coalM, fx, 1.04, fz, false);
          for (const dx of [-0.4, 0, 0.4]) A(new THREE.ConeGeometry(0.17, 0.55, 6), flameM, fx + dx, 1.4, fz, false);
          A(box(1.8, 0.5, 0.7), stoneD, fx, 2.3, SZ0 + 0.45);
          colL(fx, fz, 1.0);
          const gl2 = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowT, color: 0xff7a20, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
          gl2.position.set(fx, 0.1, fz + 0.9); g.add(gl2);   // cahaya api di lantai bengkel
          // landasan di atas tunggul
          const ax = hw + 2.5, az = 1.2;
          A(cyl(0.34, 0.4, 0.6, 8), beamM, ax, 0.38, az); A(box(0.62, 0.2, 0.36), ironM, ax, 0.78, az); A(box(0.34, 0.24, 0.26), ironM, ax, 0.98, az); A(box(0.9, 0.16, 0.38), ironM, ax, 1.16, az);
          A(new THREE.ConeGeometry(0.17, 0.5, 6), ironM, ax + 0.68, 1.16, az, false).rotation.z = -Math.PI / 2;
          colL(ax, az, 0.65);
          // tong air + batu asah
          A(cyl(0.45, 0.4, 0.95, 12), woodL, hw + 3.5, 0.5, 2.3); A(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.2 }), hw + 3.5, 0.97, 2.3, false); colL(hw + 3.5, 2.3, 0.5);
          { const gx = hw + 3.3, gz = -0.7;
            A(box(0.1, 0.9, 0.7), beamM, gx - 0.3, 0.5, gz); A(box(0.1, 0.9, 0.7), beamM, gx + 0.3, 0.5, gz); A(cyl(0.45, 0.45, 0.14, 16), stoneD, gx, 1.0, gz, false).rotation.z = Math.PI / 2; colL(gx, gz, 0.6); }
          // rak pedang di dinding belakang bengkel + ingot
          A(box(2.2, 0.1, 0.1), beamM, hw + 2.8, 1.9, SZ0 + 0.14, false);
          for (let i = 0; i < 4; i++) { const x = hw + 2.1 + i * 0.4; A(box(0.08, 0.9, 0.03), steelM, x, 1.4, SZ0 + 0.14, false); A(box(0.26, 0.05, 0.05), goldM, x, 0.95, SZ0 + 0.14, false); }
          for (let r = 0; r < 2; r++) for (let i = 0; i < 3 - r; i++) A(box(0.3, 0.12, 0.18), (i + r) % 3 === 2 ? goldM : steelM, hw + 0.5 + (i - (2 - r) / 2) * 0.34, 0.14 + r * 0.13, 2.4, false);
          A(new THREE.SphereGeometry(0.13, 8, 6), M.torch, cxs, 2.2, 1.2, false); A(cyl(0.01, 0.01, 0.3, 4), ironM, cxs, 2.5, 1.2, false);   // lampu gantung
        }
      }
    }
  }
  yield;

  // ---------- Ksatria penjaga: Gerbang Masuk, alun-alun, kepala lembah (di depan Gerbang Dungeon) ----------
  const knightMixers = []; let knightT = 0;
  let npcStep = null;   // diisi bagian NPC GLB di bawah; dipanggil dari update()
  {
    const toPlain = dirFace(-ux, -uz), toVale = dirFace(ux, uz);   // menghadap ke padang (pendatang) / ke arah lembah
    knightPD('Prajurit Bima', 'ksatria', 'Penjaga Gerbang Kota', D0 + 19, -2.6, toPlain, 'bima'); knightPD('Ksatriawati Laras', 'ksatriawati', 'Penjaga Gerbang Kota', D0 + 19, 2.6, toPlain, 'laras');
    knightPD('Kapten Rangga', 'kapten', 'Kapten Penjaga Kota', DC - 8, -5.5, toPlain, 'rangga'); knightPD('Prajurit Surya', 'ksatria', 'Penjaga Alun-alun', DC - 8, 5.5, toPlain, 'surya');
    knightPD('Prajurit Wira', 'ksatria', 'Penjaga Gerbang Dungeon', GD - 9, -5.6, toPlain, 'wira'); knightPD('Ksatriawati Sari', 'ksatriawati', 'Penjaga Gerbang Dungeon', GD - 9, 5.6, toPlain, 'sari');
    try {
      loadKnights(KN.map(k => { const w = toWorld(k.x, k.z); return { ...k, wx: w.x, wz: w.z, look: null, patrol: null }; }), (def, n) => {
        const pivot = new THREE.Group(); pivot.position.set(def.x, 0, def.z); pivot.rotation.y = def.yaw; pivot.add(n.holder); town.add(pivot);
        n.idle.play(); n.idle.time = Math.random() * n.idle.getClip().duration; n.mixer.update(0); knightMixers.push(n.mixer);
      });
    } catch (e) { console.warn('Ksatria Kota Dungeon gagal dimuat:', e); }
  }
  yield;

  // ---------- Ksatria & petualang bermodel GLB yang MENYEBAR di kota ----------
  //  4 model (taruh .glb-nya di folder yang sama dengan mira.glb): crusader_john (zirah + pedang + perisai), female_knight (ksatriawati), low_poly_knight_-_stylized_game_character (ksatria berpedang di bahu),
  //  low_poly_knight (punya animasi jalan -> BERPATROLI bolak-balik di jalan utama). Tiga model pertama tidak beranimasi: pose-nya "dipanggang" jadi satu mesh per bahan (ringan) + gerak napas halus.
  //  face = putaran-y tambahan (radian) bila model tampak menghadap arah lain (0 = menghadap +z; keempatnya sudah dicek menghadap +z). height = tinggi akhir (m). vc = warna bahan dipanggang jadi warna-vertex (satu mesh).
  const NPC_MODELS = {
    crusader: { file: 'crusader_john_low_poly_knight.glb', height: 1.95, face: 0, vc: true },
    female:   { file: 'female_knight.glb', height: 1.75, face: 0, vc: true },
    stylized: { file: 'low_poly_knight_-_stylized_game_character.glb', height: 1.9, face: 0 },
    walker:   { file: 'low_poly_knight.glb', height: 1.9, face: 0, anim: true },
  };
  const npcPlan = [], npcWalkPlan = [], npcStatic = [], npcWalk = [], npcMixers = [];
  // Papan nama kecil di atas kepala NPC (gambar dari canvas) + mendaftarkan NPC ke wargaList supaya bisa diajak bicara (tombol E di game.js).
  const wargaLabel = (w) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = 'rgba(30,18,10,0.8)'; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#d9b24a'; x.lineWidth = 6; x.strokeRect(4, 4, 504, 120);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = 50; x.font = 'bold ' + fs + 'px Georgia'; while (x.measureText(w.nama).width > 470 && fs > 20) x.font = 'bold ' + (fs -= 2) + 'px Georgia';   // kecilkan huruf bila nama panjang
    x.fillStyle = '#ffd24a'; x.fillText(w.nama, 256, 46);
    fs = 30; x.font = fs + 'px Georgia'; while (x.measureText(w.peran).width > 470 && fs > 14) x.font = (fs -= 2) + 'px Georgia';
    x.fillStyle = '#f2e8c8'; x.fillText(w.peran, 256, 94);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(2.2, 0.55, 1); return sp;
  };
  const wargaTambah = (id, g, tinggi) => {   // g = grup 3D NPC, tinggi = tinggi model (m)
    const w = WARGA[id], e = { id, g, label: null };
    if (w) { e.label = wargaLabel(w); e.label.position.set(0, tinggi + 0.5, 0); e.label.visible = false; g.add(e.label); }
    wargaList.push(e);
  };
  const addNpc = (id, key, d, off, td, toff, free = true) => {   // id = kunci di WARGA (kota-warga.js: nama + percakapan); (d, off) = posisi, (td, toff) = titik yang dihadap; free = lewati bila menabrak bangunan / benda lain
    if (free && !solidFree(d, off, 0.6)) return;
    const a = P(d, off), b = P(td, toff); npcPlan.push({ id, key, x: a.x, z: a.z, yaw: dirFace(b.x - a.x, b.z - a.z), ph: pr() * 6.283 }); col(a.x, a.z, 0.5); mark(d, off, 1.0);
  };
  {
    const S = 5.8;   // jarak dari sumbu jalan: di pinggir avenue, di antara obor
    addNpc('darto', 'stylized', D0 + 30, S, D0 + 31.8, S); addNpc('wulan', 'female', D0 + 31.8, S, D0 + 30, S);                 // dua orang mengobrol
    addNpc('hasan', 'crusader', D0 + 46, -S, D0 + 46, 0); addNpc('sekar', 'female', D0 + 58, S, D0 + 58, 0);
    addNpc('bram', 'crusader', D0 + 77, 9.2, D0 + 72, 15);                                                              // dekat Pandai Besi
    addNpc('jaka', 'crusader', D0 + 90, -S, D0 + 90, 0);
    addNpc('tarno', 'stylized', DC + 7, 6, DC, 0, false); addNpc('rukmini', 'female', DC + 7, -6, DC, 0, false); addNpc('bonar', 'crusader', DC, 9.5, DC, 0, false);   // alun-alun, menghadap obelisk
    addNpc('sumi', 'female', DC + 22, -9, DC + 26, -15); addNpc('lestari', 'female', DC + 22, 9, DC + 26, 14);                     // dekat Penginapan & Toko Ramuan
    addNpc('ayu', 'female', DC + 30, S, DC + 31.8, S); addNpc('gilang', 'crusader', DC + 31.8, S, DC + 30, S);
    addNpc('wiryo', 'stylized', DC + 48, -S, DC + 48, 0); addNpc('sundari', 'female', DC + 62, S, DC + 62, 0);
    for (const [id, key, warga] of [['kristal', 'crusader', 'ferdi'], ['batu', 'female', 'gita'], ['api', 'crusader', 'reza'], ['es', 'female', 'melati']]) {   // petualang memeriksa gerbang-gerbang samping di lembah
      const g = DUNGEON_GATES.find(x => x.id === id); if (g) addNpc(warga, key, g.d - 6, g.side * Math.max(5, g.w - 12), g.d, g.side * g.w);
    }
    const dEnd = Math.max(DC + 45, VA - 6);
    npcWalkPlan.push({ id: 'hendra', d0: D0 + 24, d1: DC - 22, off: 1.6, speed: 0.95 }, { id: 'maya', d0: DC + 22, d1: dEnd, off: -1.6, speed: 0.9 }, { id: 'joni', d0: D0 + 30, d1: DC - 30, off: -1.8, speed: 1.0 }, { id: 'intan', d0: DC + 24, d1: DC + 75, off: 1.8, speed: 0.95 });

    // "panggang" pose model (rangka dihitung sekali) menjadi mesh statis: warna-bahan -> warna-vertex (satu mesh) atau satu mesh per bahan bertekstur
    const bake = (root, vc) => {
      root.updateMatrixWorld(true);
      const groups = new Map(), v = new THREE.Vector3();
      root.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const mt = Array.isArray(o.material) ? o.material[0] : o.material, src = o.geometry, pos = src.attributes.position, n = pos.count, Pp = new Float32Array(n * 3);
        if (o.isSkinnedMesh) o.skeleton.update();
        for (let i = 0; i < n; i++) { if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i); v.applyMatrix4(o.matrixWorld); Pp[i * 3] = v.x; Pp[i * 3 + 1] = v.y; Pp[i * 3 + 2] = v.z; }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Pp, 3));
        if (src.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1)); else { const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
        if (vc) { const c = mt.color || tmpC.setRGB(1, 1, 1), cl = new Float32Array(n * 3); for (let i = 0; i < n; i++) { cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); }
        else if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv.clone());
        g.computeVertexNormals();
        const key = vc ? 'vc' : mt; if (!groups.has(key)) groups.set(key, { mt, geos: [] }); groups.get(key).geos.push(g);
      });
      const fit = new THREE.Group();
      for (const [key, gr] of groups) {
        const geo = gr.geos.length > 1 ? mergeGeos(gr.geos) : gr.geos[0];
        let m = gr.mt; if (vc) m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1, flatShading: true }); else { m.metalness = Math.min(m.metalness ?? 0, 0.1); m.roughness = Math.max(m.roughness ?? 1, 0.7); }
        const k = new THREE.Mesh(geo, m); k.castShadow = true; k.receiveShadow = true; k.frustumCulled = false; fit.add(k);
      }
      return { fit, box: new THREE.Box3().setFromObject(fit) };
    };
    const wr = a => Math.atan2(Math.sin(a), Math.cos(a));
    const placeFit = (fit, box, m) => {   // skala ke m.height, kaki di lantai, badan di tengah, putar m.face
      const hh = box.max.y - box.min.y, k = isFinite(hh) && hh > 1e-4 ? m.height / hh : 1;
      fit.scale.setScalar(k); fit.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
      const rot = new THREE.Group(); rot.rotation.y = m.face; rot.add(fit); return { rot, k };
    };
    for (const key of Object.keys(NPC_MODELS)) {
      const m = NPC_MODELS[key], plans = key === 'walker' ? npcWalkPlan : npcPlan.filter(q => q.key === key);
      if (!plans.length) continue;
      try {
        new GLTFLoader().load(m.file, gltf => {
          try {
            if (key !== 'walker') {
              const { fit, box } = bake(gltf.scene, m.vc), { rot } = placeFit(fit, box, m);
              for (const q of plans) {
                const g = new THREE.Group(), sway = new THREE.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = q.yaw; sway.add(rot.clone()); g.add(sway); town.add(g); npcStatic.push({ sway, ph: q.ph }); wargaTambah(q.id, g, m.height);
              }
            } else {
              const { box } = bake(gltf.scene, false), clip = gltf.animations[0];   // hanya untuk ukuran (pose awal); yang tampil adalah salinan berangka
              for (const q of plans) {
                const sc = skClone(gltf.scene), fit = new THREE.Group(); fit.add(sc);
                sc.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; for (const mt of [].concat(o.material)) { mt.metalness = Math.min(mt.metalness ?? 0, 0.1); } } });
                const { rot } = placeFit(fit, box, m), g = new THREE.Group(); g.add(rot); town.add(g); wargaTambah(q.id, g, m.height);
                const w = { g, d0: q.d0, d1: q.d1, off: q.off, speed: q.speed, s: q.d0 + (q.d1 - q.d0) * pr(), dir: pr() < 0.5 ? 1 : -1, wait: 0, yaw: 0, yF: dirFace(ux, uz), yB: dirFace(-ux, -uz), act: null };
                if (clip) { const mx = new THREE.AnimationMixer(sc); w.act = mx.clipAction(clip); w.act.play(); w.act.time = Math.random() * clip.duration; mx.update(0); npcMixers.push(mx); }
                w.yaw = w.dir > 0 ? w.yF : w.yB; const p0 = P(w.s, w.off); g.position.set(p0.x, 0, p0.z); g.rotation.y = w.yaw; npcWalk.push(w);
              }
            }
          } catch (e) { console.warn('NPC ' + m.file + ' gagal dipasang:', e); }
        }, undefined, () => console.warn(m.file + ' gagal dimuat — NPC ini tidak ditampilkan'));
      } catch (e) { console.warn('NPC ' + m.file + ':', e); }
    }
    npcStep = (t, dt) => {
      for (const q of npcStatic) q.sway.scale.y = 1 + 0.007 * Math.sin(t * 1.7 + q.ph);   // gerak napas
      for (const w of npcWalk) {   // patroli bolak-balik di jalan; berhenti sebentar di ujung
        if (w.wait > 0) { w.wait -= dt; if (w.wait > 0) continue; if (w.act) w.act.paused = false; }
        w.s += w.dir * w.speed * dt;
        if (w.s >= w.d1) { w.s = w.d1; w.dir = -1; w.wait = 2 + Math.random() * 2; if (w.act) w.act.paused = true; }
        else if (w.s <= w.d0) { w.s = w.d0; w.dir = 1; w.wait = 2 + Math.random() * 2; if (w.act) w.act.paused = true; }
        const p = P(w.s, w.off); w.g.position.set(p.x, 0, p.z);
        w.yaw += wr((w.dir > 0 ? w.yF : w.yB) - w.yaw) * Math.min(1, dt * 5); w.g.rotation.y = w.yaw;
      }
      for (const mx of npcMixers) mx.update(dt);
    };
  }
  yield;

  // ---------- GERBANG DUNGEON: fasad batu di kepala lembah (selebar lantai lembah) + lengkung batu + portal emas ----------
  let portalMat = null, swirl = null; const mainFx = { spinG: null, bob: [] };
  {
    const p = P(GD), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = dirFace(ux, uz); town.add(g);   // +z lokal = ke arah belakang gerbang (dalam dungeon); x lokal = -arah samping
    const WALL_H = 6.5, OPEN = 3.8, FH = Math.max(wAt(GD, 1), wAt(GD, -1)) + 3;   // FH = setengah lebar fasad gerbang (menutup lantai lembah, menyatu dengan tebing)
    for (const sx of [-1, 1]) {   // tembok kiri & kanan lubang gerbang sampai dinding lembah
      const len = FH - (OPEN + 2.2), cx = sx * (OPEN + 2.2 + len / 2);
      mesh(box(len, WALL_H, 2.6), M.rock, cx, WALL_H / 2, 0, g); mesh(box(len, 0.5, 3.0), M.trim, cx, WALL_H + 0.25, 0, g);
      for (let off = OPEN + 2.4; off < FH; off += 2.0) { const q = P(GD, sx * off); col(q.x, q.z, 1.5); }
      mesh(box(2.4, 9, 3.2), M.rock, sx * (OPEN + 1.2), 4.5, 0, g); mesh(box(3.0, 0.6, 3.8), M.trim, sx * (OPEN + 1.2), 9.3, 0, g);   // tiang gerbang
    }
    mesh(box(2 * (OPEN + 2.4) + 0.6, 1.5, 3.2), M.rock, 0, 9.75, 0, g); mesh(box(2 * (OPEN + 2.4) + 1.4, 0.5, 3.8), M.trim, 0, 10.7, 0, g);   // ambang atas
    board(g, 'DUNGEON CAHAYA', 'Cahaya suci menyilaukan', 7.4, 1.5, 0, 12.0, -0.1).rotation.y = Math.PI;
    for (const sx of [-1, 1]) { const q = P(GD, sx * (OPEN + 1.2)); col(q.x, q.z, 1.7); }
    // portal: bidang EMAS bercahaya (berdenyut) + pusaran berputar (Dungeon Cahaya)
    portalMat = new THREE.MeshBasicMaterial({ color: 0xffd96a, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(OPEN * 2, 8.8), portalMat); pl.position.set(0, 4.4, 0); g.add(pl);
    swirl = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 8.4), new THREE.MeshBasicMaterial({ map: glowGoldT, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); swirl.position.set(0, 4.4, 0.02); g.add(swirl);
    // hiasan khas Dungeon Cahaya: matahari berputar di atas ambang + dua kristal cahaya melayang di atas tiang
    {
      const goldM = new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc83a, emissiveIntensity: 1.1, roughness: 0.5, flatShading: true });
      const sun = new THREE.Group(); sun.position.set(0, 15.2, -0.5); g.add(sun); mainFx.spinG = sun;
      mesh(new THREE.TorusGeometry(2.0, 0.16, 8, 32), goldM, 0, 0, 0, sun, false); mesh(new THREE.SphereGeometry(0.7, 14, 14), goldM, 0, 0, 0, sun, false);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = mesh(new THREE.ConeGeometry(0.18, 1.0, 4), goldM, Math.cos(a) * 2.75, Math.sin(a) * 2.75, 0, sun, false); r.rotation.z = a - Math.PI / 2; }
      for (const sx of [-1, 1]) { const o = mesh(new THREE.OctahedronGeometry(0.8, 0), goldM, sx * (OPEN + 1.2), 11.6, -0.3, g, false); o.scale.y = 1.7; mainFx.bob.push({ m: o, y0: 11.6, ph: sx * 1.3 }); }
    }
    // lingkaran rune bercahaya di depan portal
    const rune = new THREE.Mesh(new THREE.CircleGeometry(6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowGoldT, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const rp = P(GD - 5); rune.position.set(rp.x, 0.05, rp.z); town.add(rune);
  }
  yield;

  const gateFx = [];   // animasi portal/hiasan 5 gerbang samping
  // ---------- LEMBAH BEBATUAN: tebing tinggi kiri-kanan yang makin sempit, kepala lembah di belakang gerbang, kerikil, batu lepas, kristal ----------
  {
    const OPEN = 3.8, FH = Math.max(wAt(GD, 1), wAt(GD, -1)) + 3;
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    const step = COARSE ? 6.5 : 4.6;
    for (const g of DUNGEON_GATES) mark(g.d, g.side * (g.w - 2), 9);   // area depan tiap gerbang samping dibiarkan lapang

    // --- tebing: 3 baris batu tinggi (baris belakang makin tinggi = tebing berundak) di tiap sisi, + dinding kepala lembah di belakang gerbang ---
    const cliffs = [];
    const addCliff = (d, off, s, top, k) => cliffs.push({ d, off, hx: s * Rp(0.9, 1.3), hz: s * Rp(0.9, 1.3), hy: top / 2, y: top / 2 - 1.2, ry: pr() * 6.283, g: Rp(0.28, 0.46) + k * 0.04 });
    for (const sx of [-1, 1]) for (let d = VA - 8; d < GD + 14; d += step) {
      const w = wAt(Math.min(d, GD), sx), hC = cliffH(d);
      for (let k = 0; k < 3; k++) {
        if (d < VA && k > 0) continue;   // di mulut lembah hanya batu rendah (peralihan dari hutan)
        const s = Rp(5.5, 9), cut = k < 2 && DUNGEON_GATES.some(g => g.side === sx && Math.abs(d - g.d) < 8) ? 6 : 0;   // cut: tebing dimundurkan 6 m di depan gerbang samping (relung tempat gerbang berdiri)
        addCliff(d + Rp(-1.2, 1.2), sx * (w + s * 0.9 + k * 6.5 + cut + Rp(-1, 1.5)), s, hC * (0.5 + 0.25 * k) * Rp(0.85, 1.2) + 1, k);
      }
    }
    for (let off = -(FH + 8); off <= FH + 8; off += step) for (let k = 0; k < 3; k++) {   // kepala lembah: dinding tinggi di belakang fasad gerbang
      const s = Rp(6, 9);
      addCliff(GD + 1.5 + s * 0.95 + k * 6 + Rp(-1, 1), off + Rp(-1, 1), s, (24 + k * 7) * Rp(0.9, 1.15), k);
    }
    const cm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, cliffs.length);
    cliffs.forEach((c, i) => {
      const p = P(c.d, c.off); dummy.position.set(p.x, c.y, p.z); dummy.rotation.set(Rp(-0.08, 0.08), c.ry, Rp(-0.08, 0.08)); dummy.scale.set(c.hx, c.hy, c.hz); dummy.updateMatrix();
      cm.setMatrixAt(i, dummy.matrix); cm.setColorAt(i, tmpC.setRGB(c.g * 1.1, c.g * 1.0, c.g * 0.72));
    });
    cm.castShadow = true; cm.receiveShadow = true; cm.frustumCulled = false; town.add(cm);
    // tabrakan: deretan lingkaran di kaki tebing kiri & kanan (mengikuti lebar lembah) -> pemain tidak bisa menembus tebing
    for (const sx of [-1, 1]) for (let d = VA; d <= GD; d += 2.6) { if (DUNGEON_GATES.some(g => g.side === sx && Math.abs(d - g.d) < 3.6)) continue; const q = P(d, sx * (wAt(d, sx) + 1.5)); col(q.x, q.z, 3.2); }   // (celah di depan tiap gerbang samping: pemain boleh masuk relung)
    yield;

    // --- kerikil di lantai lembah: bercak halus yang makin rapat ke dalam lembah (menyatu dengan rumput di mulut lembah) ---
    const gravelT = ctex(128, 128, (x, w) => {
      x.fillStyle = '#625a3c'; x.fillRect(0, 0, w, w); noise(x, w, 500, 70, 150, 0.5);
      for (let i = 0; i < 40; i++) { const g = 90 + Math.random() * 60 | 0; x.fillStyle = `rgba(${g + 8},${g + 2},${g - 14},0.9)`; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * w, 2 + Math.random() * 4, 1.5 + Math.random() * 3, Math.random() * 3, 0, 6.283); x.fill(); }
      x.globalCompositeOperation = 'destination-in';   // pinggir bercak memudar (alpha)
      const g = x.createRadialGradient(w / 2, w / 2, w * 0.12, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
    }, false);
    const patches = [], pStep = COARSE ? 8 : 6.5;
    for (let d = VA - 12; d < GD + 6; d += pStep) {
      const e = sstep((d - (VA - 12)) / (VB - (VA - 12))), w = wAt(Math.min(d, GD), 1);
      for (let off = -w; off <= w; off += 8) if (pr() < 0.1 + 0.9 * e) patches.push({ d: d + Rp(-3, 3), off: off + Rp(-3, 3), r: Rp(7, 12) });
    }
    const gm = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gravelT, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), patches.length);
    patches.forEach((c, i) => { const p = P(c.d, c.off); dummy.position.set(p.x, 0.02, p.z); dummy.rotation.set(0, pr() * 6.283, 0); dummy.scale.setScalar(c.r); dummy.updateMatrix(); gm.setMatrixAt(i, dummy.matrix); gm.setColorAt(i, tmpC.setRGB(Rp(0.8, 1.1), Rp(0.8, 1.05), Rp(0.85, 1.15))); });
    gm.receiveShadow = true; gm.frustumCulled = false; town.add(gm);

    // --- batu lepas di lantai lembah (yang besar ikut menabrak; jalan tengah tetap bersih) ---
    const bl = [], nB = COARSE ? 70 : 140;
    for (let i = 0; i < nB * 4 && bl.length < nB; i++) {
      const d = Rp(VA + 15, GD - 10), sx = pr() < 0.5 ? -1 : 1, w = wAt(d, sx), off = sx * Rp(7, w - 3), r = Rp(0.7, 2.4);
      if (!solidFree(d, off, r + 0.5) || bl.some(b => Math.hypot(b.d - d, b.off - off) < b.r + r + 0.4)) continue;
      bl.push({ d, off, r });
    }
    const bm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, bl.length);
    bl.forEach((b, i) => {
      const p = P(b.d, b.off); dummy.position.set(p.x, b.r * 0.45, p.z); dummy.rotation.set(Rp(-0.3, 0.3), pr() * 6.283, Rp(-0.3, 0.3)); dummy.scale.set(b.r * Rp(1, 1.4), b.r * Rp(0.6, 1), b.r * Rp(1, 1.4)); dummy.updateMatrix();
      bm.setMatrixAt(i, dummy.matrix); const g = Rp(0.3, 0.5); bm.setColorAt(i, tmpC.setRGB(g * 1.1, g, g * 0.75));
      if (b.r > 1.1) col(p.x, p.z, b.r * 0.9);
    });
    bm.castShadow = true; bm.receiveShadow = true; bm.frustumCulled = false; town.add(bm);
    yield;

    // --- kristal kuning bercahaya: rumpun di kaki tebing & mengapit gerbang ---
    const crys = [], nC = COARSE ? 30 : 64;
    const cluster = (d, off) => { for (let j = 0; j < 3; j++) crys.push({ d: d + Rp(-1, 1), off: off + Rp(-1, 1), h: Rp(1.5, 4.2), w: Rp(0.7, 1.3), tx: Rp(-0.35, 0.35), tz: Rp(-0.35, 0.35) }); };
    for (let i = 0; i < nC; i++) { const d = Rp(VB - 20, GD - 4), sx = pr() < 0.5 ? -1 : 1, off = sx * (wAt(d, sx) - Rp(1.5, 5)); if (solidFree(d, off, 2)) cluster(d, off); }
    for (let i = 0; i < 8; i++) cluster(GD - Rp(2, 9), (i % 2 ? 1 : -1) * Rp(OPEN + 3.5, 13));
    const kg = new THREE.ConeGeometry(0.45, 1, 5); kg.translate(0, 0.5, 0);
    const km = new THREE.InstancedMesh(kg, M.crystal, crys.length);
    crys.forEach((c, i) => { const p = P(c.d, c.off); dummy.position.set(p.x, 0, p.z); dummy.rotation.set(c.tx, pr() * 6.283, c.tz); dummy.scale.set(c.w, c.h, c.w); dummy.updateMatrix(); km.setMatrixAt(i, dummy.matrix); });
    km.frustumCulled = false; town.add(km);
    yield;

    // --- papan penunjuk di mulut lembah (menghadap pendatang dari kota) ---
    { const p = P(VA + 40, -7), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = dirFace(-ux, -uz); town.add(g);
      for (const sx of [-1, 1]) { mesh(cyl(0.12, 0.15, 3.4, 6), M.timber, sx * 2.2, 1.7, 0, g); const q = P(VA + 40, -7); col(q.x + sx * 2.2 * Math.cos(dirFace(-ux, -uz)), q.z - sx * 2.2 * Math.sin(dirFace(-ux, -uz)), 0.3); }
      board(g, 'LEMBAH BATU', 'Gerbang Dungeon di ujung lembah', 5.2, 1.3, 0, 3.1, 0); mark(VA + 40, -7, 3); }
  }
  yield;

  // ---------- 5 DUNGEON TAMBAHAN: gerbang batu di relung dinding lembah (Cahaya, Kegelapan, Api, Es, Batu) ----------
  {
    const glowW = ctex(256, 256, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 5; i++) { x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, w / 2, 30 + i * 22, i, i + 2.2); x.stroke(); } }, false);
    const GC = {   // warna tiap tema: batu, hiasan, cahaya, portal
      kristal:   { stone: 0x4c6c7a, trim: 0x8fd0e8, glow: 0x7fe9ff, portal: 0x35c8e0 },
      kegelapan: { stone: 0x201a28, trim: 0x3a2a4a, glow: 0xa040ff, portal: 0x5a1a9a },
      api:       { stone: 0x4a2a22, trim: 0x7a3a22, glow: 0xff6a20, portal: 0xff5a14 },
      es:        { stone: 0x9ab8cc, trim: 0xd8f0ff, glow: 0x9fe8ff, portal: 0x7fd4ff },
      batu:      { stone: 0x6e6250, trim: 0x8a7c64, glow: 0xffb040, portal: 0xc08a3a },
    };
    const sm = c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true });
    for (const g of DUNGEON_GATES) {
      const C = GC[g.id], OPEN = 2.7, sd = g.side, FO = g.w + 1.3;   // FO = jarak bingkai gerbang dari sumbu (di dalam relung)
      const p = P(g.d, sd * FO), G = new THREE.Group(); G.position.set(p.x, 0, p.z); G.rotation.y = dirFace(-sd * nx, -sd * nz); town.add(G);   // +z lokal menghadap tengah lembah
      const stone = sm(C.stone), trim = sm(C.trim), glowM = new THREE.MeshStandardMaterial({ color: C.glow, emissive: C.glow, emissiveIntensity: 1.1, roughness: 0.5, flatShading: true });
      const colAt = (dOff, zOut, r) => { const q = P(g.d + dOff, sd * (FO - zOut)); col(q.x, q.z, r); };   // tabrakan: dOff = geser sepanjang lembah, zOut = maju ke arah tengah lembah
      // bingkai: dua tiang + ambang + papan nama
      for (const sx of [-1, 1]) { mesh(box(1.9, 7.6, 1.9), stone, sx * (OPEN + 1.0), 3.8, 0, G); mesh(box(2.5, 0.6, 2.5), trim, sx * (OPEN + 1.0), 7.9, 0, G); colAt(sx * (OPEN + 1.0), 0, 1.4); }
      mesh(box(2 * (OPEN + 1.0) + 2.5, 1.3, 2.3), stone, 0, 8.6, 0, G); mesh(box(2 * (OPEN + 1.0) + 3.2, 0.45, 2.8), trim, 0, 9.5, 0, G);
      board(G, g.name.toUpperCase(), g.sub, 7.2, 1.45, 0, 10.7, 0.2);
      for (let dd = -6; dd <= 6; dd += 2.4) colAt(dd, -2.3, 2);   // dinding belakang relung
      // portal: bidang bercahaya (berdenyut) + pusaran, lingkaran cahaya di lantai
      const pm = new THREE.MeshBasicMaterial({ color: C.portal, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(OPEN * 2, 7.4), pm); pl.position.set(0, 3.7, 0.1); G.add(pl);
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.2), new THREE.MeshBasicMaterial({ map: glowW, color: C.glow, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); sw.position.set(0, 3.7, 0.14); G.add(sw);
      const fx = { pm, sw, ph: Rp(0, 6), bob: [], flick: [], spinG: null }; gateFx.push(fx);
      const rp = P(g.d, sd * (g.w - 3.5)), rune = new THREE.Mesh(new THREE.CircleGeometry(5.5, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowW, color: C.glow, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      rune.position.set(rp.x, 0.06, rp.z); town.add(rune);
      // hiasan khas tiap tema
      if (g.id === 'kristal') {
        for (const sx of [-1, 1]) {
          for (let i = 0; i < 3; i++) { const h = Rp(1.8, 3.6), c = mesh(new THREE.ConeGeometry(0.42, h, 5), glowM, sx * (5.2 + i * 0.95), h / 2 - 0.1, 1.0 + i * 0.5, G, false); c.rotation.z = -sx * Rp(0.08, 0.3); }   // rumpun kristal di kiri-kanan
          const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), glowM); o.position.set(sx * 5.6, 3.4, 1.2); o.scale.y = 1.6; G.add(o); fx.bob.push({ m: o, y0: 3.4, ph: sx * 1.3 }); mesh(cyl(0.9, 1.1, 0.5, 8), trim, sx * 5.6, 0.25, 1.2, G);
          mesh(new THREE.ConeGeometry(0.5, 2.4, 5), glowM, sx * (OPEN + 1.0), 9.4, 0, G, false);   // kristal di puncak tiang
        }
        for (let i = 0; i < 7; i++) { const h = Rp(0.9, 2.0), c = mesh(new THREE.ConeGeometry(0.2, h, 5), glowM, -3.6 + i * 1.2, 8.0 - h / 2, 0.9, G, false); c.rotation.x = Math.PI; }   // kristal menggantung di ambang
      } else if (g.id === 'kegelapan') {
        for (const sx of [-1, 1]) {
          mesh(new THREE.ConeGeometry(0.55, 2.6, 5), stone, sx * (OPEN + 1.0), 9.3, 0, G);   // duri di puncak tiang
          for (let i = 0; i < 2; i++) { const c = mesh(new THREE.ConeGeometry(0.3, 1.6, 5), glowM, sx * (OPEN + 2.6 + i * 1.1), 0.8 + i * 0.2, 0.9 + i * 0.7, G, false); c.rotation.z = -sx * (0.25 + i * 0.15); }   // kristal gelap miring
          mesh(new THREE.SphereGeometry(0.28, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff2a4a }), sx * 1.5, 8.6, 1.2, G, false);   // sepasang mata merah di ambang
          const o = mesh(new THREE.SphereGeometry(0.45, 10, 10), glowM, sx * 6.2, 3.6, 0.8, G, false); fx.bob.push({ m: o, y0: 3.6, ph: sx * 0.9 });   // bola gelap melayang
        }
      } else if (g.id === 'api') {
        for (const sx of [-1, 1]) {
          const bx = sx * 5.6; mesh(cyl(0.7, 0.9, 1.4, 7), stone, bx, 0.7, 1.4, G); colAt(bx, 1.4, 0.9);   // tungku api
          for (let i = 0; i < 3; i++) { const f = mesh(new THREE.ConeGeometry(0.42 - i * 0.06, 1.7 + i * 0.4, 5), glowM, bx + (i - 1) * 0.35, 2.0 + i * 0.1, 1.4, G, false); fx.flick.push({ m: f, ph: i * 1.7 + sx }); }
          const h = mesh(new THREE.ConeGeometry(0.5, 3, 5), trim, sx * 5.2, 9.2, 0, G); h.rotation.z = -sx * 0.5;   // tanduk di ujung ambang
        }
      } else if (g.id === 'es') {
        for (let i = 0; i < 9; i++) { const h = Rp(1.0, 2.4), c = mesh(new THREE.ConeGeometry(0.22, h, 5), trim, -4.6 + i * 1.15, 8.0 - h / 2, 0.9, G, false); c.rotation.x = Math.PI; }   // es menggantung
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const h = Rp(1.6, 3.4), c = mesh(new THREE.ConeGeometry(0.4, h, 5), glowM, sx * (5.2 + i * 0.9), 0, 1.0 + i * 0.5, G, false); c.rotation.z = -sx * Rp(0.1, 0.35); }   // kristal es
        const fr = new THREE.Mesh(new THREE.CircleGeometry(7, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: glowW, color: 0xeaf6ff, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); fr.position.set(rp.x, 0.03, rp.z); town.add(fr);   // hamparan salju
      } else if (g.id === 'batu') {
        for (const sx of [-1, 1]) {
          const b1 = mesh(new THREE.IcosahedronGeometry(1.7, 0), stone, sx * 5.8, 1.1, 1.5, G); b1.scale.set(1, 0.8, 1.1); colAt(sx * 5.8, 1.5, 1.6);   // batu besar di kiri-kanan
          const b2 = mesh(new THREE.IcosahedronGeometry(1.0, 0), trim, sx * 7.4, 0.6, 0.6, G); b2.scale.y = 0.7;
          mesh(box(2.2, 0.25, 2.2), sm(0x5a7a3a), sx * (OPEN + 1.0), 8.1, 0, G);   // lumut di puncak tiang
        }
        mesh(new THREE.TorusGeometry(0.6, 0.08, 6, 16), glowM, 0, 8.6, 1.2, G, false);   // lambang rune di ambang
      }
    }
  }
  yield;

  // ---------- Hutan mengelilingi kota (pita lebat di kiri-kanan & penutup sisi depan, jalan masuk tetap terbuka) ----------
  {
    const oaks = [], pines = [], cell = COARSE ? 6.5 : 4.8;
    const dens = (d, off) => Math.max(Math.abs(off) > 72 ? Math.min(1, (Math.abs(off) - 72) / 8 + 0.4) : 0, d < D0 + 14 && Math.abs(off) > 8 ? Math.min(1, (D0 + 14 - d) / 6 + 0.4) : 0);
    for (let d = D0 + 2; d < GD - 4; d += cell) for (let off = -HW + 1; off < HW - 1; off += cell) {
      const dd = d + Rp(0, cell), oo = off + Rp(0, cell);
      if (dd > VB - 10 || (dd > VA && Math.abs(oo) > wAt(dd, oo < 0 ? -1 : 1) - 4)) continue;   // tidak ada pohon di lantai lembah / di dalam tebing
      if (pr() > dens(dd, oo) * 1.1 || !solidFree(dd, oo, 0.5)) continue;
      (pr() < 0.45 ? pines : oaks).push({ d: dd, off: oo, s: Rp(0.95, 1.7), a: pr() * 6.283 });
    }
    const addTrees = (list, trunkGeo, leafGeo) => {
      if (!list.length) return;
      const nT = list.length, tr = new THREE.InstancedMesh(trunkGeo, mat.barkMat, nT), lf = new THREE.InstancedMesh(leafGeo, mat.leafMat(0.03), nT);
      list.forEach((t, i) => { const p = P(t.d, t.off); dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix); lf.setMatrixAt(i, dummy.matrix); lf.setColorAt(i, tmpC.setRGB(Rp(0.55, 0.85), Rp(0.7, 0.95), Rp(0.6, 0.9))); col(p.x, p.z, 0.34 * t.s); });
      tr.castShadow = lf.castShadow = true; tr.receiveShadow = lf.receiveShadow = true; town.add(tr, lf);
    };
    addTrees(oaks, geo.trunkOak, geo.oakLeaf); yield;
    addTrees(pines, geo.trunkPine, geo.pineLeaf);
  }
  yield;

  // ---------- Rumput jarang di sela bangunan (tanah kota tidak sepenuhnya berbatu) ----------
  {
    const cell = COARSE ? 8 : 5.5, gm = mat.swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.12, 0, true), cap = Math.ceil((NW_TOWN.len / cell) * (2 * HW / cell) * 1.2), grass = new THREE.InstancedMesh(geo.grassGeo, gm, cap);
    let n = 0;
    for (let d = D0 + 4; d < GD - 4; d += cell) for (let off = -HW; off < HW; off += cell) {
      const dd = d + Rp(0, cell), oo = off + Rp(0, cell);
      if (n >= cap || dd > VB - 14 || (dd > VA && Math.abs(oo) > wAt(dd, oo < 0 ? -1 : 1) - 4) || Math.abs(oo) < ROAD / 2 + 1 || (Math.abs(dd - DC) < 17 && Math.abs(oo) < 17) || !solidFree(dd, oo, 0.8) || pr() < 0.35) continue;
      const p = P(dd, oo); dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, pr() * 6.283, 0); dummy.scale.set(Rp(0.9, 1.6), Rp(0.8, 1.4), Rp(0.9, 1.6)); dummy.updateMatrix();
      grass.setMatrixAt(n, dummy.matrix); grass.setColorAt(n, tmpC.setRGB(Rp(0.6, 0.9), Rp(0.75, 1.0), Rp(0.55, 0.85))); n++;
    }
    grass.count = n; grass.receiveShadow = true; grass.frustumCulled = false; town.add(grass);
  }
  yield;

  // ---------- KAELEN: boss "pendekar kardus" di alun-alun (tantang dengan tombol B saat dekat) ----------
  //  Butuh posisi pemain: o.getPlayer() -> { x, z, face } (koordinat dunia) ATAU game.js mengisi window.KOTA_PLAYER = { x, z, face } tiap frame.
  //  Hook opsional dari world.js/game.js: o.onKaelenHit({ dmg, dirX, dirZ, heavy, blocked }), o.onShake(k), o.onKaelenStart(), o.onKaelenEnd({ result })
  const kaelen = createKaelenBattle({
    parent: town, center: P(DC, 0), home: P(DC + 11, 0),
    getPlayer: o.getPlayer, onPlayerHit: o.onKaelenHit, onShake: o.onShake, onStart: o.onKaelenStart, onEnd: o.onKaelenEnd, keys: o.kaelenKeys, isMobile: o.isMobile,   // keys opsional, mis. { attack: ['f'], dodge: ['q'], guard: ['e'], challenge: ['b'] }
  });
  yield;

  // ---------- Warga yang bisa diajak bicara: dipakai game.js (tombol E) lewat globalThis.KOTA_WARGA.near(x, z, radius) -> { id } atau null ----------
  const _wp = new THREE.Vector3();
  const wargaPos = e => { if (e.g) e.g.getWorldPosition(_wp); else { _wp.set(e.lx, 0, e.lz); town.localToWorld(_wp); } return _wp; };   // posisi dunia (NPC berpatroli terus bergerak)
  globalThis.KOTA_WARGA = {
    near(x, z, r = 2.8) {
      let best = null, bd = r;
      for (const e of wargaList) { const p = wargaPos(e), d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = e; } }
      return best ? { id: best.id } : null;
    },
  };
  setTimeout(() => console.info('[warga] NPC terdaftar:', wargaList.length, '(seharusnya 29 bila semua model .glb termuat)'), 8000);   // cek di Console (F12)
  const wargaLabels = () => {   // papan nama hanya tampil bila pemain dekat (supaya tidak ramai dari kejauhan)
    const H = globalThis.KAELEN_HOST, pl = H && H.getPlayer ? H.getPlayer() : (o.getPlayer ? o.getPlayer() : globalThis.KOTA_PLAYER);
    if (!pl) return;
    for (const e of wargaList) if (e.label) { const p = wargaPos(e); e.label.visible = Math.hypot(p.x - pl.x, p.z - pl.z) < 15; }
  };

  return {
    group, kaelen,   // kaelen.isActive() = true selama battle (game.js bisa mengunci interaksi lain / portal dungeon)
    update() {   // portal berdenyut, pusaran & kristal berputar (jam sendiri; tidak bergantung argumen pemanggil)
      const t = performance.now() / 1000;
      { const dt = Math.min(0.1, t - (knightT || t)); knightT = t; for (const mx of knightMixers) mx.update(dt); if (npcStep) npcStep(t, dt); }   // ksatria penjaga (napas) + NPC GLB (napas, patroli)
      if (portalMat) portalMat.opacity = 0.72 + 0.12 * Math.sin(t * 2.2);
      if (swirl) swirl.rotation.z = t * 0.5;
      if (mainFx.spinG) mainFx.spinG.rotation.z = t * 0.4;   // matahari gerbang Dungeon Cahaya berputar pelan, kristal cahaya melayang naik-turun
      for (const b of mainFx.bob) b.m.position.y = b.y0 + Math.sin(t * 1.8 + b.ph) * 0.4;
      for (const f of gateFx) {   // 5 gerbang samping: portal berdenyut, pusaran berputar, hiasan melayang / berkobar
        f.pm.opacity = 0.7 + 0.12 * Math.sin(t * 2.2 + f.ph); f.sw.rotation.z = t * 0.5 + f.ph;
        for (const b of f.bob) b.m.position.y = b.y0 + Math.sin(t * 1.8 + b.ph) * 0.35;
        for (const k of f.flick) k.m.scale.set(1, 0.85 + 0.3 * Math.sin(t * 9 + k.ph * 3), 1);
        if (f.spinG) f.spinG.rotation.z = t * 0.4;
      }
      kaelen.update();   // AI & efek battle Kaelen (jam sendiri)
      wargaLabels();   // papan nama warga
      if (crystal) { crystal.rotation.y = t * 0.6; M.crystal.emissiveIntensity = 0.9 + 0.3 * Math.sin(t * 1.6); }
    },
  };
}
