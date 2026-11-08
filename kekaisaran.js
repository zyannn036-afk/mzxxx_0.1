import * as THREE from 'three';
import { buildAulaRaja } from './kekaisaran-aula.js';
import { buildPenginapan } from './kekaisaran-penginapan.js';
import { buildCitizens } from './kekaisaran-npc.js';
import { APOTHEM, SIDE, WALL, RING, PLAZA_R, PALACE_SITE, ROAD_W, AVENUE_W, GATES, DISTRICTS, VERTS, EMPIRE_C, EMPIRE_YAW, GATE_OFFSET, toWorld, toLocal, D1, d1Blocked, inD1, insidePoly, D2, d2p, d2Face, d2Blocked, inD2, D3, d3p, d3Face, d3Blocked, inD3, D4, d4p, d4Face, d4Blocked, inD4, D5, d5p, d5Face, d5Blocked, inD5 } from './kekaisaran-layout.js';

// ============================================================
//  Membangun Kota Kekaisaran (satu chunk, dipanggil dari world.js).
//  Isi: tembok segi lima + 5 menara sudut + 5 gerbang (Gerbang Utama & Gerbang Barat Laut terbuka, 3 lainnya tertutup; dataran di luar Gerbang Barat Laut = chunk terpisah, lihat kekaisaran-dataran.js), jalan lingkar & 5 jalan radial,
//  jalan raya Gerbang Utama (saluran air + jembatan), halaman & ISTANA KEKAISARAN, dan DISTRIK 1 — Military Quarter
//  (lapangan apel, markas komando, 4 barak, gudang senjata, kandang, pandai besi, rumah perwira, 2 lapangan latihan, pagar kayu, saluran air).
//  DISTRIK 2 — Merchant Quarter (alun-alun pasar bundar dengan kios berwarna & air mancur, 8 toko, penginapan, kedai, bank, rumah timbang, gudang dagang, Balai Serikat Pedagang).
//  DISTRIK 3 — Noble Quarter (taman formal berpagar tanaman dengan air mancur, 6 kediaman bangsawan, Kediaman Adipati, kapel keluarga, rumah kaca).
//  DISTRIK 4 — Academy Quarter (alun-alun lingkaran sihir bercahaya dengan kristal melayang, Aula Akademi, perpustakaan, asrama, laboratorium, ruang kuliah, balai rektor, menara penyihir, observatorium).
//  DISTRIK 5 — Administration Quarter (alun-alun sipil berkolonade dengan tugu timbangan, Balai Kekaisaran berkubah, perbendaharaan, arsip, pencatatan, pengadilan, kantor pos, kantor pengawas, menara jam, balai kesehatan).
//  Kelima distrik sudah dibangun. NPC: 14 warga di halaman istana, model & animasi sama dengan warga Kota Arunika (lihat kekaisaran-npc.js).
//
//  Semua mesh dibuat di kerangka lokal kota (grup `city`): sumbu-x = ke depan (searah jalan ladang), sumbu-z = ke kanan, pusat istana = (0,0).
//  Collider (lingkaran) dimasukkan ke koordinat DUNIA lewat toWorld().
//  Generator: tiap `yield` = titik berhenti (ChunkManager melanjutkannya di frame berikutnya).
// ============================================================

const D2R = Math.PI / 180;

export function* buildKekaisaranGen(o) {
  const { colliders, rand, COARSE, geo, mat } = o;
  const Rn = (a, b) => a + rand() * (b - a);
  const group = new THREE.Group(); group.name = 'kekaisaran';
  const city = new THREE.Group(); city.position.set(EMPIRE_C.x, 0, EMPIRE_C.z); city.rotation.y = EMPIRE_YAW; group.add(city);
  const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const col = (lx, lz, r) => { const p = toWorld(lx, lz); colliders.push({ x: p.x, z: p.z, r }); };   // collider dunia dari koordinat lokal kota

  // ---------- Tekstur (digambar lewat canvas, tanpa file gambar) ----------
  const ctex = (size, draw, w = size, h = size) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const noise = (x, s, n, c0, c1, a) => { for (let i = 0; i < n; i++) { const g = c0 + Math.random() * (c1 - c0) | 0; x.fillStyle = `rgba(${g},${g - 4},${g - 12},${a})`; x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
  const T = {
    cobble: ctex(256, (x, s) => { x.fillStyle = '#6f6a60'; x.fillRect(0, 0, s, s); for (let r = 0; r < 8; r++) for (let c = -1; c < 9; c++) { const g = 138 + Math.random() * 46 | 0; x.fillStyle = `rgb(${g},${g - 6},${g - 18})`; x.fillRect(c * 32 + (r % 2) * 16 + 1.5, r * 32 + 1.5, 29, 29); } noise(x, s, 600, 90, 200, 0.25); }),
    slab: ctex(256, (x, s) => { x.fillStyle = '#9a937f'; x.fillRect(0, 0, s, s); for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const g = 196 + Math.random() * 18 | 0; x.fillStyle = `rgb(${g},${g - 6},${g - 20})`; x.fillRect(c * 128 + 2, r * 128 + 2, 124, 124); } noise(x, s, 900, 150, 230, 0.22); }),
    stone: ctex(128, (x, s) => { x.fillStyle = '#85806f'; x.fillRect(0, 0, s, s); for (let r = 0; r < 6; r++) { const off = (r % 2) * 20; for (let c = -1; c < 4; c++) { const g = 178 + Math.random() * 30 | 0; x.fillStyle = `rgb(${g},${g - 6},${g - 16})`; x.fillRect(c * 40 + off + 1, r * (s / 6) + 1, 38, s / 6 - 2); } } noise(x, s, 300, 120, 220, 0.2); }),
    roof: ctex(128, (x, s) => { x.fillStyle = '#9fa6b8'; x.fillRect(0, 0, s, s); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const g = 215 + Math.random() * 30 | 0; x.fillStyle = `rgb(${g},${g},${g + 8})`; x.beginPath(); x.moveTo(c * 16 + (r % 2) * 8, r * 16); x.lineTo(c * 16 + (r % 2) * 8 + 16, r * 16); x.lineTo(c * 16 + (r % 2) * 8 + 16, r * 16 + 11); x.arc(c * 16 + (r % 2) * 8 + 8, r * 16 + 11, 8, 0, Math.PI); x.closePath(); x.fill(); } }),
    sand: ctex(128, (x, s) => { x.fillStyle = '#c4aa72'; x.fillRect(0, 0, s, s); noise(x, s, 1400, 150, 235, 0.3); }),
    water: ctex(128, (x, s) => { x.fillStyle = '#2f7db3'; x.fillRect(0, 0, s, s); for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(190,230,250,${0.15 + Math.random() * 0.25})`; x.fillRect(Math.random() * s, Math.random() * s, 10 + Math.random() * 30, 2); } }),
    target: ctex(128, (x, s) => { [['#f3ead0', 64], ['#26356e', 52], ['#f3ead0', 40], ['#b8322a', 28], ['#e8c14a', 12]].forEach(([c, r]) => { x.fillStyle = c; x.beginPath(); x.arc(s / 2, s / 2, r, 0, 7); x.fill(); }); }),
    emblem: ctex(256, (x, s) => { x.fillStyle = '#1d3266'; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill(); x.strokeStyle = '#d9b24a'; x.lineWidth = 10; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 12, 0, 7); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 34, 0, 7); x.stroke(); swords(x, s / 2, s / 2, 78, '#e7c862'); }),
  };
  function swords(x, cx, cy, L, c) {   // dua pedang bersilang
    x.save(); x.translate(cx, cy); x.strokeStyle = c; x.fillStyle = c; x.lineCap = 'round';
    for (const sg of [-1, 1]) { x.save(); x.rotate(sg * Math.PI / 4); x.lineWidth = L * 0.11; x.beginPath(); x.moveTo(0, -L); x.lineTo(0, L * 0.55); x.stroke(); x.lineWidth = L * 0.1; x.beginPath(); x.moveTo(-L * 0.3, L * 0.38); x.lineTo(L * 0.3, L * 0.38); x.stroke(); x.beginPath(); x.arc(0, L * 0.72, L * 0.09, 0, 7); x.fill(); x.restore(); }
    x.restore();
  }
  function crown(x, cx, cy, L, c) { x.fillStyle = c; x.beginPath(); x.moveTo(cx - L, cy + L * 0.6); x.lineTo(cx - L, cy - L * 0.2); x.lineTo(cx - L * 0.5, cy + L * 0.15); x.lineTo(cx, cy - L * 0.6); x.lineTo(cx + L * 0.5, cy + L * 0.15); x.lineTo(cx + L, cy - L * 0.2); x.lineTo(cx + L, cy + L * 0.6); x.closePath(); x.fill(); }
  const bannerTex = kind => ctex(128, (x, w, h) => {
    x.fillStyle = kind === 'palace' ? '#4a2a78' : '#1f3770'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d9b24a'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
    if (kind === 'sword') swords(x, w / 2, h * 0.42, 34, '#e7c862'); else crown(x, w / 2, h * 0.42, 32, '#e7c862');
    x.fillStyle = '#d9b24a'; x.beginPath(); x.moveTo(8, h - 8); x.lineTo(w / 2, h - 52); x.lineTo(w - 8, h - 8); x.lineTo(w - 8, h - 24); x.lineTo(w / 2, h - 70); x.lineTo(8, h - 24); x.closePath(); x.fill();
  }, 128, 256);
  const plaqueTex = (text, sub) => ctex(512, (x, w, h) => {
    x.fillStyle = '#6b4a2a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(40,22,8,${Math.random() * 0.25})`; x.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2); }
    x.strokeStyle = '#d9b24a'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#f3e3bd'; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = sub ? 54 : 64; x.font = `bold ${fs}px Georgia`; while (x.measureText(text).width > w - 50 && fs > 20) x.font = `bold ${fs -= 2}px Georgia`;
    x.fillText(text, w / 2, sub ? h * 0.38 : h / 2); if (sub) { x.fillStyle = '#e3c98a'; x.font = 'bold 34px Georgia'; x.fillText(sub, w / 2, h * 0.74); }
  }, 512, 128);

  // ---------- Material bersama ----------
  const stdC = new Map(), std = (color, extra) => { if (extra) return new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra }); let m = stdC.get(color); if (!m) stdC.set(color, m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })); return m; };
  const tm = (map, color = 0xffffff, extra = {}) => new THREE.MeshStandardMaterial({ map, color, roughness: 1, ...extra });
  const M = {
    wall: tm(T.stone, 0xcfc8b6), tower: tm(T.stone, 0xc2bbaa), plinth: tm(T.stone, 0xa9a292), hall: tm(T.stone, 0xd8d0bc),
    roofBlue: tm(T.roof, 0x3555b0, { side: THREE.DoubleSide }), roofDark: tm(T.roof, 0x2b3c6e, { side: THREE.DoubleSide }), roofRed: tm(T.roof, 0x9c4a3a, { side: THREE.DoubleSide }),
    plaster: std(0xe2d9c0), plasterGrey: std(0xc6c0b0), timber: std(0x5b3d22), wood: std(0x8b6338), woodDark: std(0x4f3420), iron: std(0x2f2f35), gold: std(0xd9b24a),
    straw: std(0xcdae55), sandy: std(0xb99a4e), rope: std(0xa68b52),
    lantern: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa83a, emissiveIntensity: 0.9, roughness: 0.6, flatShading: true }),
    glow: new THREE.MeshStandardMaterial({ color: 0xff9a3a, emissive: 0xff6a1a, emissiveIntensity: 1.3, roughness: 0.6, flatShading: true }),
    window: new THREE.MeshStandardMaterial({ color: 0x31405e, emissive: 0xffc46a, emissiveIntensity: 0.55, roughness: 0.4 }),
    cobble: tm(T.cobble, 0xffffff, { side: THREE.DoubleSide, polygonOffset: true }), slab: tm(T.slab, 0xffffff, { side: THREE.DoubleSide, polygonOffset: true }),
    slabDark: tm(T.slab, 0x9aa4c0, { side: THREE.DoubleSide, polygonOffset: true }), sand: tm(T.sand, 0xffffff, { side: THREE.DoubleSide, polygonOffset: true }),
    water: new THREE.MeshStandardMaterial({ map: T.water, roughness: 0.12, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
    waterFloor: new THREE.MeshStandardMaterial({ color: 0x4d5d70, roughness: 1 }),
  };
  const levelMat = (() => { const cache = new Map(); return (m, lvl) => { const k = m.uuid + ':' + lvl; let c = cache.get(k); if (!c) { c = m.clone(); c.polygonOffset = true; c.polygonOffsetFactor = -lvl; c.polygonOffsetUnits = -lvl; cache.set(k, c); } return c; }; })();

  // ---------- Geometri & pembantu ----------
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (a, b, h, n = 8) => new THREE.CylinderGeometry(a, b, h, n);
  function boxUV(w, h, d, s = 0.5) {   // kotak dengan UV dalam satuan meter (tekstur tidak melar)
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const [a, b] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h]; uv.setXY(i, uv.getX(i) * a * s, uv.getY(i) * b * s); }
    return g;
  }
  const scaleUV = (g, su, sv = su) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = city, shadow = true) => { const k = new THREE.Mesh(g, m); k.position.set(x, y, z); k.castShadow = shadow; k.receiveShadow = true; parent.add(k); return k; };
  const worldUV = (g, s) => { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * s; uv[i * 2 + 1] = p.getZ(i) * s; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
  const upNormals = g => { const n = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < n.length; i += 3) n[i + 1] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g; };
  // dekal datar: poligon (daftar [x,z] lokal) / persegi panjang berputar / cincin / cakram
  function decalPoly(pts, m, lvl, uvs = 0.3) {
    const pos = [], idx = []; pts.forEach(([x, z]) => pos.push(x, 0, z));
    for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); upNormals(g); worldUV(g, uvs);
    const k = new THREE.Mesh(g, levelMat(m, lvl)); k.position.y = 0.02 + lvl * 0.004; k.receiveShadow = true; city.add(k); return k;
  }
  function decalStrip(x0, z0, x1, z1, w, m, lvl, uvs = 0.3) {   // jalur lurus selebar w dari (x0,z0) ke (x1,z1)
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
    return decalPoly([[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]], m, lvl, uvs);
  }
  function decalRect(cx, cz, w, d, m, lvl, uvs = 0.3) { return decalPoly([[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]], m, lvl, uvs); }
  function decalRing(r0, r1, m, lvl, uvs = 0.3, seg = 96, cx = 0, cz = 0) { const g = new THREE.RingGeometry(r0, r1, seg, 1).rotateX(-Math.PI / 2).translate(cx, 0, cz); worldUV(g, uvs); const k = new THREE.Mesh(g, levelMat(m, lvl)); k.position.y = 0.02 + lvl * 0.004; k.receiveShadow = true; city.add(k); return k; }
  function decalDisc(cx, cz, r, m, lvl, uvs = 0.3, seg = 64) { const g = new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2).translate(cx, 0, cz); worldUV(g, uvs); const k = new THREE.Mesh(g, levelMat(m, lvl)); k.position.y = 0.02 + lvl * 0.004; k.receiveShadow = true; city.add(k); return k; }
  const place = (x, z, face, parent = city) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2 - face; parent.add(g); return g; };   // bangunan: sumbu-z lokal = arah depan (face)
  const plaque = (g, text, sub, x, y, z, w, h, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: plaqueTex(text, sub), roughness: 1 })); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  const bannerMats = {}; const banner = (g, kind, x, y, z, w, h, ry = 0) => { const m = bannerMats[kind] || (bannerMats[kind] = new THREE.MeshStandardMaterial({ map: bannerTex(kind), roughness: 1, side: THREE.DoubleSide })); const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; g.add(b); return b; };
  const lamp = (x, z) => { const l = new THREE.Group(); l.position.set(x, 0, z); city.add(l); mesh(cyl(0.07, 0.1, 2.6, 6), M.timber, 0, 1.3, 0, l); mesh(box(0.3, 0.38, 0.3), M.lantern, 0, 2.75, 0, l, false); mesh(box(0.44, 0.08, 0.44), M.timber, 0, 2.99, 0, l); col(x, z, 0.22); };
  const crenelRing = (g, r, y, n, s = 1.2) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; mesh(box(s, 1.0, s), M.tower, Math.cos(a) * r, y + 0.5, Math.sin(a) * r, g).rotation.y = -a; } };
  const colRect = (f, pad = 0.25) => {   // collider persegi berputar: deretan lingkaran sepanjang sisi panjang
    const fx = Math.cos(f.face), fz = Math.sin(f.face), r = Math.min(f.w, f.d) / 2 + pad, L = Math.max(f.w, f.d) / 2 - r, alongW = f.w >= f.d;
    const ax = alongW ? -fz : fx, az = alongW ? fx : fz;
    if (L <= 0) { col(f.x, f.z, Math.hypot(f.w, f.d) / 2); return; }
    for (let a = -L; a < L; a += r * 1.15) col(f.x + ax * a, f.z + az * a, r); col(f.x + ax * L, f.z + az * L, r);
  };

  // ---------- Papan petunjuk ----------
  function signTex(rows) {
    return ctex(512, (x, W, H) => {
      x.fillStyle = '#8b6338'; x.fillRect(0, 0, W, H); for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(60,35,15,${Math.random() * 0.25})`; x.fillRect(0, Math.random() * H, W, 1 + Math.random() * 2); }
      x.strokeStyle = '#4a2f18'; x.lineWidth = 10; x.strokeRect(5, 5, W - 10, H - 10); x.textAlign = 'center'; x.textBaseline = 'middle';
      const rh = (H - 12) / rows.length; rows.forEach((r, i) => { const cy = 6 + rh * (i + 0.5); x.fillStyle = '#f3e3bd'; let fs = r.sub ? 46 : 58; x.font = `bold ${fs}px Georgia`; while (x.measureText(r.text).width > W - 60 && fs > 18) x.font = `bold ${fs -= 2}px Georgia`; x.fillText(r.text, W / 2, r.sub ? cy - 22 : cy); if (r.sub) { x.fillStyle = '#e3c98a'; x.font = 'bold 30px Georgia'; x.fillText(r.sub, W / 2, cy + 24); } if (i < rows.length - 1) { x.fillStyle = 'rgba(60,35,15,.6)'; x.fillRect(22, 6 + rh * (i + 1) - 2, W - 44, 4); } });
    }, 512, 256);
  }
  function signPost(x, z, fx, fz, rows, scale = 1, w = 2.4, h = 1.2) {   // papan menghadap titik (fx,fz) (koordinat lokal kota)
    const yaw = Math.atan2(fx - x, fz - z), front = new THREE.MeshStandardMaterial({ map: signTex(rows), roughness: 1 });
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; g.scale.setScalar(scale); city.add(g);
    mesh(cyl(0.07, 0.09, 2.5, 8), M.timber, 0, 1.25, 0, g);
    const b = new THREE.Mesh(box(w, h, 0.1), [M.wood, M.wood, M.wood, M.wood, front, M.wood]); b.position.set(0, 2.1, 0.08); b.castShadow = true; g.add(b);
    mesh(box(w + 0.2, 0.08, 0.16), M.timber, 0, 2.1 + h / 2 + 0.05, 0.08, g); col(x, z, 0.3 * scale);
  }

  // ---------- Jalan & lantai (dekal) ----------
  const GATE_MAIN = GATES[2];
  // 1) tapak istana + halaman
  decalDisc(0, 0, PLAZA_R, M.slab, 1, 0.16, 72);
  decalDisc(0, 0, PALACE_SITE.r, M.slabDark, 2, 0.16, 64);
  decalRing(PALACE_SITE.r - 1.4, PALACE_SITE.r, M.slab, 3, 0.2, 64);
  decalRing(RING.r - RING.w / 2, RING.r + RING.w / 2, M.cobble, 2, 0.33, 120);
  // 2) jalan radial ke gerbang samping + jalan raya Gerbang Utama
  for (const g of GATES) {
    const dx = Math.cos(g.psi), dz = Math.sin(g.psi), w = g.k === 2 ? AVENUE_W : ROAD_W;
    decalStrip(dx * (RING.r - 3), dz * (RING.r - 3), dx * (APOTHEM + 3), dz * (APOTHEM + 3), w, M.cobble, 3, 0.33);
  }
  decalStrip(-APOTHEM, 0, -APOTHEM - GATE_OFFSET, 0, GATE_MAIN.gap + 3, M.cobble, 3, 0.33);   // apron di luar Gerbang Utama (menyambung ke jalan ladang)
  yield;

  // ---------- TEMBOK, MENARA, GERBANG ----------
  const crenelM = [], crenelG = box(1.5, 1.2, 1.0);
  function wallSeg(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 1) return;
    const ang = Math.atan2(dz, dx), mx = (ax + bx) / 2, mz = (az + bz) / 2, ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const w = mesh(boxUV(L, WALL.h, WALL.t, 0.5), M.wall, mx, WALL.h / 2, mz); w.rotation.y = -ang;
    const cap = mesh(box(L, 0.4, WALL.t + 0.5), M.plinth, mx, WALL.h + 0.2, mz); cap.rotation.y = -ang;
    for (let s = 1.3; s < L - 0.6; s += 2.7) for (const sd of [-1, 1]) {   // gigi tembok di tepi luar & dalam
      const px = ax + ux * s + nx * sd * (WALL.t / 2 + 0.1), pz = az + uz * s + nz * sd * (WALL.t / 2 + 0.1);
      dummy.position.set(px, WALL.h + 0.4 + 0.6, pz); dummy.rotation.set(0, -ang, 0); dummy.scale.set(1, 1, 0.8); dummy.updateMatrix(); crenelM.push(dummy.matrix.clone());
    }
    for (let s = 0; s <= L; s += 2.2) col(ax + ux * s, az + uz * s, WALL.t / 2 + 0.25);
    col(bx, bz, WALL.t / 2 + 0.25);
  }
  function roundTower(g, r, h, roofH, roofMat) {
    scaleUV(mesh(cyl(r, r + 0.5, h, 14), M.tower, 0, h / 2, 0, g).geometry, Math.PI * r, h * 0.5);
    mesh(cyl(r + 0.7, r + 0.7, 0.5, 14), M.plinth, 0, h + 0.1, 0, g); crenelRing(g, r + 0.25, h + 0.35, 12, 1.5);
    mesh(new THREE.ConeGeometry(r + 0.6, roofH, 14), roofMat, 0, h + 0.4 + roofH / 2, 0, g);
    mesh(cyl(0.06, 0.06, 3.2, 6), M.gold, 0, h + roofH + 1.6, 0, g, false);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6; mesh(new THREE.PlaneGeometry(0.5, 1.5), M.window, Math.cos(a) * (r + 0.52), h * 0.62, Math.sin(a) * (r + 0.52), g, false).rotation.y = Math.PI / 2 - a; }
  }
  // menara di tiap titik sudut
  VERTS.forEach((v, k) => {
    const g = new THREE.Group(); g.position.set(v.x, 0, v.z); city.add(g);
    roundTower(g, WALL.towerR, WALL.towerH, 8.5, M.roofBlue);
    banner(g, k === 0 ? 'sword' : 'crown', 0.85, WALL.towerH + 8.9 + 2.0, 0, 1.5, 0.85, 0);
    col(v.x, v.z, WALL.towerR + 0.5);
  });
  // gerbang: gerbang lokal (x = keluar, z = menyusuri tembok)
  function archShape(w, h, holeHW, holeH) {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
    const p = new THREE.Path(); p.moveTo(-holeHW, 0); p.lineTo(-holeHW, holeH); p.absarc(0, holeH, holeHW, Math.PI, 0, true); p.lineTo(holeHW, 0); p.lineTo(-holeHW, 0); s.holes.push(p); return s;
  }
  function doorShape(hw, hy) { const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, hy); s.absarc(0, hy, hw, 0, Math.PI, false); s.lineTo(-hw, 0); return s; }
  const extrude = (shape, depth, rot = true) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 }); g.translate(0, 0, -depth / 2); if (rot) g.rotateY(Math.PI / 2); return g; };   // sumbu-z hasil = sumbu-x gerbang (keluar); sumbu-x hasil -> -z
  const wallEnd = new Map();
  for (const g of GATES) {
    const grp = new THREE.Group(); grp.position.set(g.x, 0, g.z); grp.rotation.y = -g.psi; city.add(grp);
    const half = g.gap / 2, tw = 7.6, tz = half + tw / 2, out = { x: Math.cos(g.psi), z: Math.sin(g.psi) }, tan = { x: -Math.sin(g.psi), z: Math.cos(g.psi) };
    const P = (a, b) => ({ x: g.x + out.x * a + tan.x * b, z: g.z + out.z * a + tan.z * b });
    for (const sd of [-1, 1]) {   // dua menara persegi di kiri-kanan lorong
      const t = new THREE.Group(); t.position.set(0, 0, sd * tz); grp.add(t);
      mesh(boxUV(9, 15, tw, 0.5), M.tower, 0, 7.5, 0, t); mesh(box(10, 0.9, tw + 1.0), M.plinth, 0, 15.4, 0, t);
      for (let i = -2; i <= 2; i++) for (const e of [-1, 1]) { mesh(box(1.1, 1.0, 1.1), M.tower, i * 2.1, 16.3, e * (tw / 2 + 0.2), t); }
      mesh(new THREE.ConeGeometry(6.9, 8, 4).rotateY(Math.PI / 4), M.roofBlue, 0, 20, 0, t); mesh(cyl(0.06, 0.06, 3.0, 5), M.gold, 0, 25.3, 0, t, false);
      for (const fx of [-1, 1]) mesh(new THREE.PlaneGeometry(0.8, 1.8), M.window, fx * 4.55, 10.5, 0, t, false).rotation.y = fx > 0 ? Math.PI / 2 : -Math.PI / 2;
      banner(t, g.k === 2 ? 'crown' : 'sword', 4.58, 8.2, 0, 2.0, 4.6, Math.PI / 2); banner(t, g.k === 2 ? 'crown' : 'sword', -4.58, 8.2, 0, 2.0, 4.6, -Math.PI / 2);
      for (const a of [-2.2, 2.2]) { const c = P(a, sd * tz); col(c.x, c.z, 3.9); }
    }
    // lengkung gerbang di atas lorong
    const holeHW = half - 1.2, holeH = g.k === 2 ? 5.2 : 4.0, archDepth = 7;
    const arch = mesh(extrude(archShape(g.gap, 12.5, holeHW, holeH), archDepth), M.tower, 0, 0, 0, grp); scaleUV(arch.geometry, 0.5, 0.5);
    mesh(box(archDepth + 0.6, 0.5, g.gap + 0.8), M.plinth, 0, 12.7, 0, grp);
    plaque(grp, g.name.toUpperCase(), null, archDepth / 2 + 0.06, 10.7, 0, Math.min(6.2, g.gap - 1), 1.3, Math.PI / 2);
    plaque(grp, g.name.toUpperCase(), null, -archDepth / 2 - 0.06, 10.7, 0, Math.min(6.2, g.gap - 1), 1.3, -Math.PI / 2);
    for (const sx of [-1, 1]) for (const sd of [-1, 1]) { const lx = sx * (archDepth / 2 + 0.3), lz = sd * (holeHW + 0.55); mesh(box(0.26, 0.34, 0.26), M.lantern, lx, 6.1, lz, grp, false); mesh(box(0.1, 0.8, 0.1), M.iron, lx, 6.6, lz, grp, false); }
    for (const sd of [-1, 1]) for (const a of [-2.6, 0, 2.6]) { const c = P(a, sd * (holeHW + 0.6)); col(c.x, c.z, 0.85); }   // tiang lengkung (batu) di kiri-kanan lorong
    if (g.open) {   // Gerbang Utama & Gerbang Barat Laut: jeruji besi terangkat di dalam lengkung, lorong bebas
      for (let z = -holeHW + 0.45; z < holeHW - 0.2; z += 0.75) { const top = holeH + Math.sqrt(Math.max(0, holeHW * holeHW - z * z)) - 0.15, bot = holeH - 0.2; if (top - bot < 0.5) continue; mesh(box(0.1, top - bot, 0.1), M.iron, 0, (top + bot) / 2, z, grp, false); }
      mesh(box(0.16, 0.14, 2 * holeHW), M.iron, 0, holeH - 0.2, 0, grp, false);
    } else {   // gerbang samping: pintu kayu dua daun, tertutup
      const door = mesh(extrude(doorShape(holeHW, holeH), 0.5), M.woodDark, 0, 0, 0, grp); void door;
      for (const y of [1.0, 2.6, holeH + holeHW * 0.35]) mesh(box(0.6, 0.18, 2 * holeHW), M.iron, 0, y, 0, grp, false);
      mesh(box(0.62, holeH + holeHW, 0.1), M.iron, 0, (holeH + holeHW) / 2, 0, grp, false);
      for (let z = -holeHW + 1.0; z < holeHW; z += 1.4) { const k = mesh(new THREE.SphereGeometry(0.1, 6, 4), M.gold, 0.32, 1.6, z, grp, false); void k; }
      for (let a = -holeHW; a <= holeHW; a += 1.2) { const c = P(0, a); col(c.x, c.z, 0.9); }
    }
    wallEnd.set(g.k, tz + tw / 2);   // jarak dari tengah gerbang ke ujung menara (tempat tembok bersambung)
  }
  // tembok antar menara sudut & gerbang
  for (let k = 0; k < 5; k++) {
    const A = VERTS[k], B = VERTS[(k + 1) % 5], g = GATES[k], ux = (B.x - A.x) / SIDE, uz = (B.z - A.z) / SIDE, e = wallEnd.get(k) - 0.3, vt = WALL.towerR - 0.6;
    wallSeg(A.x + ux * vt, A.z + uz * vt, g.x - ux * e, g.z - uz * e);
    wallSeg(g.x + ux * e, g.z + uz * e, B.x - ux * vt, B.z - uz * vt);
  }
  { const cm = new THREE.InstancedMesh(crenelG, M.wall, Math.max(1, crenelM.length)); cm.castShadow = cm.receiveShadow = true; crenelM.forEach((m, i) => cm.setMatrixAt(i, m)); city.add(cm); }
  yield;

  // ---------- JALAN RAYA GERBANG UTAMA: saluran air di tengah + jembatan + lampu + pohon ----------
  function canal(x0, z0, x1, z1, w, bridges = [], edge = true) {   // saluran lurus (di sepanjang sumbu-x atau sumbu-z); jembatan = posisi (x atau z) tempat jembatan batu menyeberang
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), L = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = new THREE.PlaneGeometry(alongX ? L : w, alongX ? w : L).rotateX(-Math.PI / 2).translate(cx, 0.045, cz); scaleUV(g, alongX ? L / 4 : w / 4, alongX ? w / 4 : L / 4);
    const wm = new THREE.Mesh(g, M.water); wm.receiveShadow = true; city.add(wm);
    if (edge) for (const sd of [-1, 1]) { const off = sd * (w / 2 + 0.28), ex = alongX ? cx : cx + off, ez = alongX ? cz + off : cz; mesh(alongX ? box(L, 0.42, 0.55) : box(0.55, 0.42, L), M.plinth, ex, 0.21, ez, city, false); }
    for (let s = 0; s <= L; s += 1.5) {   // tepi saluran tidak bisa diseberangi kecuali lewat jembatan
      const px = alongX ? x0 + (x1 - x0) * s / L : x0, pz = alongX ? z0 : z0 + (z1 - z0) * s / L, pos = alongX ? px : pz;
      if (bridges.some(b => Math.abs(pos - b) < 2.6)) continue;
      for (const sd of [-1, 1]) col(alongX ? px : px + sd * (w / 2 + 0.3), alongX ? pz + sd * (w / 2 + 0.3) : pz, 0.8);
    }
    for (const b of bridges) {   // jembatan batu pendek di atas saluran
      const bw = 3.8, bx = alongX ? b : cx, bz = alongX ? cz : b, by = 0.27;
      mesh(alongX ? box(bw, 0.34, w + 2.2) : box(w + 2.2, 0.34, bw), M.plinth, bx, by, bz);
      for (const sd of [-1, 1]) mesh(alongX ? box(0.28, 0.55, w + 2.2) : box(w + 2.2, 0.55, 0.28), M.plinth, alongX ? bx + sd * (bw / 2 - 0.14) : bx, 0.72, alongX ? bz : bz + sd * (bw / 2 - 0.14), city, false);
    }
    return wm;
  }
  { const x0 = -APOTHEM + 8, x1 = -RING.r - RING.w / 2 - 6; canal(x0, 0, x1, 0, 2.2, [-122, -104, -88]);
    for (let x = x0 + 4; x < x1 - 2; x += 17) for (const sd of [-1, 1]) lamp(x, sd * (AVENUE_W / 2 + 0.6));
  }
  yield;

  // ---------- Halaman istana: 4 air mancur + tugu + papan ----------
  for (let k = 0; k < 4; k++) {
    const a = (45 + k * 90) * D2R, fx = Math.cos(a) * 47, fz = Math.sin(a) * 47, g = new THREE.Group(); g.position.set(fx, 0, fz); city.add(g);
    mesh(cyl(2.9, 3.1, 0.9, 14), M.plinth, 0, 0.45, 0, g); mesh(new THREE.CircleGeometry(2.55, 20).rotateX(-Math.PI / 2), M.water, 0, 0.88, 0, g, false);
    mesh(cyl(0.35, 0.5, 2.2, 8), M.plinth, 0, 1.8, 0, g); mesh(cyl(1.2, 0.5, 0.4, 10), M.plinth, 0, 2.9, 0, g); mesh(new THREE.SphereGeometry(0.28, 8, 6), M.gold, 0, 3.3, 0, g, false);
    col(fx, fz, 3.3);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k * 90) * D2R, ox = Math.cos(a) * (PALACE_SITE.r - 3.2), oz = Math.sin(a) * (PALACE_SITE.r - 3.2), g = new THREE.Group(); g.position.set(ox, 0, oz); city.add(g);
    mesh(box(1.6, 0.6, 1.6), M.plinth, 0, 0.3, 0, g); mesh(box(0.9, 7, 0.9), M.hall, 0, 4.1, 0, g); mesh(new THREE.ConeGeometry(0.75, 1.1, 4).rotateY(Math.PI / 4), M.gold, 0, 8.15, 0, g); col(ox, oz, 1.0);
  }
  signPost(-PALACE_SITE.r - 8, 7, -PALACE_SITE.r - 60, 7, [{ text: 'ISTANA KEKAISARAN', sub: 'Kediaman Kaisar' }], 1.2, 3.2, 1.0);
  // papan nama di Gerbang Utama (arah jalan)
  signPost(-APOTHEM + 6, 11, -APOTHEM - 30, 11, [{ text: 'KOTA KEKAISARAN', sub: 'Selamat datang, pengelana' }, { text: 'Distrik 1 · Military Quarter', sub: 'Lurus, melewati istana' }], 1.15, 3.0, 1.5);
  for (const sd of [-1, 1]) lamp(-APOTHEM - 6, sd * (GATE_MAIN.gap / 2 + 1.6));
  yield;

  // ---------- Pohon hias (instancing, geometri milik dunia) ----------
  const trees = [];
  const addTree = (x, z, s) => trees.push({ x, z, s, a: rand() * 6.283 });
  for (let x = -APOTHEM + 22; x < -RING.r - 14; x += 19) for (const sd of [-1, 1]) addTree(x, sd * (AVENUE_W / 2 + 4.5), Rn(0.65, 0.85));

  // ======================================================================
  //  DISTRIK 1 — MILITARY QUARTER
  // ======================================================================
  // ---------- lantai: jalan utama, lapangan apel, jalur ke bangunan ----------
  decalStrip(D1.avenue.x0 - 2, 0, D1.avenue.x1, 0, D1.avenue.w, M.cobble, 4, 0.33);
  const P1 = D1.parade;
  decalRect(P1.x, P1.z, P1.w + 2.4, P1.d + 2.4, M.cobble, 5, 0.33);        // bingkai batu kali di sekeliling
  decalRect(P1.x, P1.z, P1.w, P1.d, M.slab, 6, 0.14);                      // lantai lapangan apel
  // lambang di tengah lapangan: UV cakram dipetakan 0..1 supaya gambar utuh
  (() => { const g = new THREE.CircleGeometry(7.5, 48).rotateX(-Math.PI / 2); const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 15 + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / 15; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); const t = T.emblem.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 1, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 })); m.position.set(P1.x - 2, 0.02 + 10 * 0.004, 0); m.receiveShadow = true; city.add(m); })();
  const lane = (x0, z0, x1, z1, w = 3) => decalStrip(x0, z0, x1, z1, w, M.cobble, 5, 0.33);
  for (const sd of [-1, 1]) {
    const b1 = D1.buildings.find(b => b.id === (sd < 0 ? 'barak-1' : 'barak-2')), b3 = D1.buildings.find(b => b.id === (sd < 0 ? 'barak-3' : 'barak-4'));
    lane(b1.x, sd * 26, b1.x, sd * (Math.abs(b1.z) - b1.d / 2 - 0.5)); lane(b3.x, sd * 26, b3.x, sd * (Math.abs(b3.z) - b3.d / 2 - 0.5));
    for (const y of D1.yards) if (y.z * sd > 0) lane(y.x, sd * 5.5, y.x, sd * (Math.abs(y.z) - y.d / 2 + 0.5), 3.4);          // dari jalan utama ke gerbang lapangan latihan (lewat jembatan)
    const sm = D1.buildings.find(b => b.id === (sd < 0 ? 'tempa' : 'perwira'));
    { const zd = sd * (Math.abs(sm.z) - sm.d / 2 - 0.6); lane(118.6, sd * 26, 118.6, zd, 2.4); lane(sm.x, zd, 118.6, zd, 2.4); }
    for (const id of ['gudang', 'kandang']) { const b = D1.buildings.find(q => q.id === id); if (b.z * sd > 0) lane(b.x - b.d / 2 - 0.5, b.z, P1.x + P1.w / 2, b.z, 3); }
  }
  yield;

  // ---------- saluran air + jembatan di tepi jalan utama ----------
  for (const sd of [-1, 1]) canal(D1.canal.x0, sd * D1.canal.off, D1.canal.x1, sd * D1.canal.off, D1.canal.w, [D1.yards[0].x], true);
  // ---------- bangunan ----------
  const roofFor = { barracks: M.roofBlue, officers: M.roofBlue, armory: M.roofDark, stable: M.roofRed, smithy: M.roofDark, hq: M.roofBlue };
  function shell(g, w, d, H, rh, { wall = M.plaster, roof = M.roofBlue, ov = 0.9, beams = true, chimney = true, windows = true } = {}) {
    const y0 = 0.7;
    mesh(boxUV(w + 0.5, 0.7, d + 0.5, 0.5), M.plinth, 0, 0.35, 0, g);
    g.userData.wall = mesh(box(w, H, d), wall, 0, y0 + H / 2, 0, g);   // disimpan: istana menyembunyikan kotak ini saat pemain di dalam (kotak padat = tembok di depan pintu dalam)
    if (beams) {
      const n = Math.max(2, Math.round(w / 3.2));
      for (let i = 0; i <= n; i++) for (const e of [-1, 1]) mesh(box(0.28, H, 0.2), M.timber, -w / 2 + i * w / n, y0 + H / 2, e * (d / 2 + 0.02), g, false);
      for (const e of [-1, 1]) { mesh(box(w, 0.24, 0.2), M.timber, 0, y0 + H, e * (d / 2 + 0.02), g, false); mesh(box(w, 0.2, 0.2), M.timber, 0, y0 + H * 0.5, e * (d / 2 + 0.02), g, false); }
      for (const e of [-1, 1]) { mesh(box(0.2, H, 0.28), M.timber, e * (w / 2 + 0.02), y0 + H / 2, 0, g, false); mesh(box(0.2, 0.24, d), M.timber, e * (w / 2 + 0.02), y0 + H, 0, g, false); }
    }
    if (windows) { const n = Math.max(2, Math.round(w / 4.2)); for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; if (Math.abs(x) < 1.9) continue; for (const e of [-1, 1]) { const wm = mesh(new THREE.PlaneGeometry(0.95, 1.25), M.window, x, y0 + H * 0.58, e * (d / 2 + 0.07), g, false); if (e < 0) wm.rotation.y = Math.PI; mesh(box(1.15, 0.12, 0.14), M.timber, x, y0 + H * 0.58 - 0.68, e * (d / 2 + 0.07), g, false); } } }
    // atap pelana: punggung atap sejajar fasad (sumbu-x lokal)
    const hz = d / 2 + ov, ang = Math.atan2(rh, hz), sl = Math.hypot(hz, rh);
    for (const e of [-1, 1]) { const s = mesh(boxUV(w + 2 * ov * 0.6, 0.26, sl, 0.5), roof, 0, y0 + H + rh / 2 + 0.05, e * hz / 2, g); s.rotation.x = e * ang; }
    mesh(box(w + 2 * ov * 0.6 + 0.2, 0.22, 0.4), M.timber, 0, y0 + H + rh + 0.05, 0, g, false);
    for (const e of [-1, 1]) { const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rh); const tg = new THREE.ShapeGeometry(tri); tg.rotateY(e * Math.PI / 2); const t = mesh(tg, wall, e * (w / 2 + 0.01), y0 + H, 0, g, false); void t; }
    if (chimney) { mesh(box(1.1, rh + 1.6, 1.1), M.tower, w * 0.28, y0 + H + (rh + 1.6) / 2 - 0.1, -d * 0.18, g); mesh(box(1.4, 0.2, 1.4), M.plinth, w * 0.28, y0 + H + rh + 1.4, -d * 0.18, g, false); }
    return y0;
  }
  function door(g, d, y0, wd = 1.9, hd = 2.9) {
    mesh(box(wd, hd, 0.2), M.woodDark, 0, y0 + hd / 2, d / 2 + 0.06, g, false); mesh(box(wd + 0.5, 0.35, 0.3), M.plinth, 0, y0 + hd + 0.2, d / 2 + 0.1, g, false);
    for (const sd of [-1, 1]) mesh(box(0.3, hd + 0.3, 0.3), M.plinth, sd * (wd / 2 + 0.2), y0 + (hd + 0.3) / 2, d / 2 + 0.1, g, false);
    mesh(box(wd + 1.3, 0.36, 1.3), M.plinth, 0, 0.18, d / 2 + 0.65, g, false); mesh(box(wd + 0.9, 0.36, 0.7), M.plinth, 0, 0.54, d / 2 + 0.35, g, false);   // anak tangga
    for (const sd of [-1, 1]) { mesh(box(0.2, 0.3, 0.2), M.lantern, sd * (wd / 2 + 0.95), y0 + 2.5, d / 2 + 0.2, g, false); mesh(box(0.06, 0.5, 0.06), M.iron, sd * (wd / 2 + 0.95), y0 + 2.85, d / 2 + 0.2, g, false); }
  }
  const rack = (g, x, z, ry = 0) => { const r = new THREE.Group(); r.position.set(x, 0, z); r.rotation.y = ry; g.add(r); for (const sd of [-1, 1]) mesh(cyl(0.06, 0.07, 1.5, 5), M.timber, sd * 0.9, 0.75, 0, r, false); mesh(box(2.0, 0.1, 0.1), M.timber, 0, 1.15, 0, r, false); mesh(box(2.0, 0.1, 0.1), M.timber, 0, 0.55, 0, r, false);
    for (let i = 0; i < 5; i++) { const s = mesh(cyl(0.025, 0.025, 2.3, 4), i % 2 ? M.iron : M.wood, -0.7 + i * 0.35, 1.0, 0, r, false); s.rotation.z = 0.12 * (i - 2) * 0.4; } return r; };
  const hay = (g, x, z, ry = 0, n = 1) => { for (let i = 0; i < n; i++) { const h = mesh(cyl(0.38, 0.38, 0.95, 8), M.straw, x, 0.38 + (i % 2) * 0.76, z + (i % 2) * 0.1, g); h.rotation.z = Math.PI / 2; h.rotation.y = ry; } };
  const barrel = (g, x, z) => { mesh(cyl(0.38, 0.34, 0.8, 8), M.wood, x, 0.4, z, g); mesh(cyl(0.39, 0.39, 0.07, 8), M.iron, x, 0.22, z, g, false); mesh(cyl(0.39, 0.39, 0.07, 8), M.iron, x, 0.6, z, g, false); };

  for (const b of D1.buildings) {
    const g = place(b.x, b.z, b.face);
    const w = b.w, d = b.d;
    if (b.kind === 'barracks') {
      const y0 = shell(g, w, d, 4.4, 3.4, { wall: M.plaster, roof: M.roofBlue });
      door(g, d, y0); plaque(g, b.name.toUpperCase(), null, 0, y0 + 4.55, d / 2 + 0.1, 3.8, 0.78);
      for (const sd of [-1, 1]) banner(g, 'sword', sd * w * 0.3, y0 + 2.3, d / 2 + 0.14, 0.9, 2.0);
      rack(g, -w / 2 + 2.6, d / 2 + 1.1, 0); barrel(g, w / 2 - 1.6, d / 2 + 1.0); barrel(g, w / 2 - 2.5, d / 2 + 1.2);
    } else if (b.kind === 'officers') {
      const y0 = shell(g, w, d, 5.0, 3.8, { wall: M.plaster, roof: M.roofBlue });
      door(g, d, y0, 1.7, 2.8); plaque(g, b.name.toUpperCase(), null, 0, y0 + 4.3, d / 2 + 0.1, 3.8, 0.78);
      const t = new THREE.Group(); t.position.set(-w / 2 - 0.4, 0, d / 2 - 1.0); g.add(t); roundTower(t, 1.9, 8.2, 3.6, M.roofBlue);
      { const fx = Math.cos(b.face), fz = Math.sin(b.face), lx = -w / 2 - 0.4, lz = d / 2 - 1.0; col(b.x + fz * lx + fx * lz, b.z - fx * lx + fz * lz, 2.2); }
      for (let i = 0; i < 2; i++) { mesh(box(1.3, 0.1, 0.9), M.wood, -w / 4 + i * 4.5, y0 + 2.4, d / 2 + 0.55, g, false); mesh(box(1.3, 0.8, 0.1), M.woodDark, -w / 4 + i * 4.5, y0 + 2.8, d / 2 + 1.0, g, false); }
      banner(g, 'sword', w / 2 - 1.4, y0 + 2.6, d / 2 + 0.14, 0.9, 2.0);
    } else if (b.kind === 'armory') {
      const y0 = shell(g, w, d, 4.6, 3.4, { wall: M.plasterGrey, roof: M.roofDark, windows: false });
      door(g, d, y0, 2.4, 3.2); plaque(g, 'GUDANG SENJATA', null, 0, y0 + 4.85, d / 2 + 0.1, 4.2, 0.82);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 6), new THREE.MeshStandardMaterial({ map: bannerTex('sword'), roughness: 1 })); sh.position.set(0, y0 + 3.9, d / 2 + 0.08); g.add(sh);
      rack(g, -w / 2 + 1.8, d / 2 + 1.1, 0); rack(g, w / 2 - 1.8, d / 2 + 1.1, 0);
      for (let i = 0; i < 3; i++) mesh(box(0.9, 0.7, 0.7), M.wood, w / 2 + 1.2 + (i % 2) * 0.1, 0.35 + (i > 1 ? 0.7 : 0), -d * 0.2 + (i % 2) * 0.8, g);
    } else if (b.kind === 'stable') {
      const y0 = shell(g, w, d, 3.4, 3.0, { wall: M.plaster, roof: M.roofRed, windows: false });
      door(g, d, y0, 2.6, 2.6); plaque(g, 'KANDANG KUDA', null, 0, y0 + 3.7, d / 2 + 0.1, 3.6, 0.72);
      for (const sd of [-1, 1]) { mesh(box(2.0, 2.2, 0.14), M.woodDark, sd * w * 0.3, y0 + 1.15, d / 2 + 0.07, g, false); mesh(box(2.2, 0.16, 0.22), M.timber, sd * w * 0.3, y0 + 2.3, d / 2 + 0.1, g, false); }
      mesh(box(2.6, 0.5, 0.7), M.wood, w / 2 + 1.0, 0.45, 0.5, g); hay(g, -w / 2 - 1.2, 1.2, 0, 3); hay(g, -w / 2 - 1.2, -0.3, 0.4, 2);
      for (const sd of [-1, 1]) { mesh(cyl(0.08, 0.1, 1.5, 5), M.timber, sd * 1.7, 0.75, d / 2 + 2.0, g); } mesh(box(3.5, 0.12, 0.12), M.timber, 0, 1.3, d / 2 + 2.0, g, false);
    } else if (b.kind === 'smithy') {
      const y0 = shell(g, w, d, 3.8, 2.8, { wall: M.plasterGrey, roof: M.roofDark, windows: false, chimney: false });
      door(g, d, y0, 1.9, 2.6); plaque(g, 'PANDAI BESI', null, 0, y0 + 3.4, d / 2 + 0.1, 3.0, 0.62);
      mesh(box(1.6, 8.4, 1.6), M.tower, w * 0.28, 4.2, -d * 0.2, g); mesh(box(2.0, 0.3, 2.0), M.plinth, w * 0.28, 8.5, -d * 0.2, g);
      mesh(new THREE.PlaneGeometry(1.5, 1.1), M.glow, 0, y0 + 1.5, d / 2 + 0.1, g, false); mesh(box(1.9, 0.18, 0.24), M.iron, 0, y0 + 2.2, d / 2 + 0.12, g, false);
      mesh(box(0.9, 0.5, 0.6), M.iron, -w / 2 - 1.3, 0.55, d / 2 - 1.0, g); mesh(box(0.55, 0.9, 0.5), M.timber, -w / 2 - 1.3, 0.45, d / 2 - 1.0, g); barrel(g, w / 2 + 1.0, d / 2 - 0.8); barrel(g, w / 2 + 1.0, d / 2 - 1.8);
    }
    colRect(b);
  }
  yield;

  // ---------- Markas Komando ----------
  { const h = D1.hq, g = place(h.x, h.z, h.face), w = h.w, d = h.d;
    const y0 = shell(g, w, d, 7.2, 4.8, { wall: M.plaster, roof: M.roofBlue, ov: 1.1, chimney: false });
    mesh(boxUV(7.4, 13.5, 5.2, 0.5), M.hall, 0, 6.75, d / 2 + 1.8, g);   // menara tengah di fasad
    mesh(box(8.2, 0.6, 6.0), M.plinth, 0, 13.7, d / 2 + 1.8, g); mesh(new THREE.ConeGeometry(5.6, 8.5, 4).rotateY(Math.PI / 4), M.roofBlue, 0, 18.2, d / 2 + 1.8, g); mesh(cyl(0.06, 0.06, 3.4, 5), M.gold, 0, 23.6, d / 2 + 1.8, g, false);
    { mesh(extrude(doorShape(1.9, 3.6), 0.5, false), M.woodDark, 0, 0, d / 2 + 4.4, g, false); for (const y of [1.4, 3.2]) mesh(box(3.9, 0.16, 0.2), M.iron, 0, y, d / 2 + 4.5, g, false); mesh(box(0.14, 5.4, 0.2), M.iron, 0, 2.7, d / 2 + 4.52, g, false); }
    for (const sd of [-1, 1]) mesh(box(0.7, 5.6, 0.7), M.plinth, sd * 2.4, 2.8, d / 2 + 4.5, g); mesh(box(5.6, 0.9, 0.9), M.plinth, 0, 5.7, d / 2 + 4.5, g);
    mesh(box(8.6, 0.5, 2.2), M.plinth, 0, 0.55, d / 2 + 5.0, g); mesh(box(7.2, 0.5, 1.6), M.plinth, 0, 0.25, d / 2 + 5.9, g);   // tangga lebar
    { const em = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24), new THREE.MeshStandardMaterial({ map: T.emblem, roughness: 1 })); em.position.set(0, 9.6, d / 2 + 4.43); g.add(em); }
    plaque(g, 'MARKAS KOMANDO', 'Military Quarter', 0, 7.4, d / 2 + 4.45, 5.0, 1.25);
    for (const sd of [-1, 1]) {
      const t = new THREE.Group(); t.position.set(sd * (w / 2 + 0.4), 0, d / 2 - 0.5); g.add(t); roundTower(t, 2.7, 11.5, 5.0, M.roofBlue);
      banner(g, 'sword', sd * (w / 2 - 3.2), y0 + 3.4, d / 2 + 0.14, 1.2, 2.8); banner(g, 'sword', sd * 3.15, y0 + 7.2, d / 2 + 4.45, 1.0, 3.0);
      mesh(box(0.2, 0.3, 0.2), M.lantern, sd * 3.2, y0 + 2.4, d / 2 + 4.6, g, false);
    }
    colRect(h, 0.4); { const fx = Math.cos(h.face), fz = Math.sin(h.face), ax = -fz, az = fx; for (const sd of [-1, 1]) col(h.x + ax * sd * (w / 2 + 0.4) + fx * (d / 2 - 0.5), h.z + az * sd * (w / 2 + 0.4) + fz * (d / 2 - 0.5), 3.0); col(h.x + fx * (d / 2 + 1.8), h.z + fz * (d / 2 + 1.8), 3.6); }
  }
  // pos jaga bundar di gerbang distrik
  for (const p of D1.posts) { const g = new THREE.Group(); g.position.set(p.x, 0, p.z); city.add(g); roundTower(g, p.r, 8.4, 3.8, M.roofBlue); banner(g, 'sword', 0, 6.4, p.r + 0.07, 0.9, 2.0, 0); col(p.x, p.z, p.r + 0.3); }
  yield;

  // ---------- Pagar kayu (palisade) di sepanjang jalan radial sisi Distrik 1 ----------
  { const posts = [], rails = [];
    for (const sg of [-1, 1]) {
      const phi = sg * 36 * D2R, ux = Math.cos(phi), uz = Math.sin(phi), probe = { x: 120, z: 0 };
      let nx = Math.sin(phi), nz = -Math.cos(phi); if ((probe.x - 0) * nx + (probe.z) * nz < 0 || sg < 0) { nx = -nx; nz = -nz; }
      // pastikan normal menunjuk ke dalam Distrik 1 (ke arah sumbu-x): uji titik kecil
      const t0 = { x: ux * 100 + nx * 3, z: uz * 100 + nz * 3 }; if (!inD1(t0.x, t0.z, 0)) { nx = -nx; nz = -nz; }
      const off = ROAD_W / 2 + 0.9, s0 = 80, s1 = 138;
      for (let s = s0; s <= s1; s += 0.95) { const x = ux * s + nx * off, z = uz * s + nz * off; if (!insidePoly(x, z, WALL.t / 2 + 2)) break; posts.push({ x, z, h: 2.9 + 0.25 * Math.sin(s * 1.9) + Rn(-0.1, 0.1) }); if (Math.round(s / 0.95) % 2 === 0) col(x, z, 0.62); }
      const ax = ux * s0 + nx * off, az = uz * s0 + nz * off, bx = ux * s1 + nx * off, bz = uz * s1 + nz * off, L = Math.hypot(bx - ax, bz - az);
      for (const y of [0.9, 2.0]) { const r = mesh(box(L, 0.14, 0.14), M.timber, (ax + bx) / 2, y, (az + bz) / 2, city, false); r.rotation.y = -Math.atan2(bz - az, bx - ax); }
    }
    const lg = new THREE.CylinderGeometry(0.2, 0.23, 1, 6).translate(0, 0.5, 0), tg = new THREE.ConeGeometry(0.21, 0.5, 6).translate(0, 0.25, 0);
    const pm = new THREE.InstancedMesh(lg, M.wood, Math.max(1, posts.length)), pt = new THREE.InstancedMesh(tg, M.woodDark, Math.max(1, posts.length));
    posts.forEach((p, i) => { dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, rand() * 6, 0); dummy.scale.set(1, p.h, 1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); dummy.position.y = p.h; dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pt.setMatrixAt(i, dummy.matrix); });
    pm.castShadow = pt.castShadow = pm.receiveShadow = true; city.add(pm, pt);
  }
  // ---------- Lapangan latihan & panah ----------
  const fenceSegs = [];   // [x0,z0,x1,z1]
  const fenceBuild = () => {
    const posts = [];
    for (const [ax, az, bx, bz] of fenceSegs) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.8)); for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; posts.push([x, z]); col(x, z, 0.55); }
      for (const y of [0.55, 1.05]) { const r = mesh(box(L, 0.1, 0.1), M.wood, (ax + bx) / 2, y, (az + bz) / 2, city, false); r.rotation.y = -Math.atan2(bz - az, bx - ax); }
    }
    const pm = new THREE.InstancedMesh(cyl(0.07, 0.09, 1.3, 5).translate(0, 0.65, 0), M.timber, Math.max(1, posts.length)); posts.forEach(([x, z], i) => { dummy.position.set(x, 0, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); }); pm.castShadow = true; city.add(pm);
  };
  for (const y of D1.yards) {
    const sd = Math.sign(y.z), hx = y.w / 2, hz = y.d / 2, x0 = y.x - hx, x1 = y.x + hx, zIn = y.z - sd * hz, zOut = y.z + sd * hz;   // zIn = sisi yang menghadap jalan utama (ada gerbang)
    decalRect(y.x, y.z, y.w, y.d, M.sand, 6, 0.28);
    fenceSegs.push([x0, zOut, x1, zOut], [x0, zIn, x0, zOut], [x1, zIn, x1, zOut], [x0, zIn, y.x - 2.0, zIn], [y.x + 2.0, zIn, x1, zIn]);   // sisi dalam punya celah gerbang selebar 4 m
    for (const px of [-2.0, 2.0]) { mesh(box(0.34, 2.4, 0.34), M.timber, y.x + px, 1.2, zIn); }
    mesh(box(4.4, 0.3, 0.36), M.timber, y.x, 2.45, zIn);
    plaque(city, y.name.toUpperCase(), null, y.x, 2.95, zIn, 3.6, 0.7, sd > 0 ? Math.PI : 0);
    if (y.kind === 'training') {
      for (let i = 0; i < 3; i++) { const dx = x0 + 3.2 + i * (y.w - 6.4) / 2, dz = zOut - sd * 2.4, g = new THREE.Group(); g.position.set(dx, 0, dz); g.rotation.y = Math.atan2(0, 1) + (sd > 0 ? Math.PI : 0); city.add(g);
        mesh(cyl(0.1, 0.12, 1.9, 6), M.timber, 0, 0.95, 0, g); mesh(box(1.1, 0.12, 0.12), M.timber, 0, 1.5, 0, g); mesh(cyl(0.3, 0.3, 0.75, 8), M.straw, 0, 1.35, 0.0, g); mesh(new THREE.SphereGeometry(0.2, 8, 6), M.straw, 0, 1.95, 0, g);
        mesh(box(0.5, 0.6, 0.06), M.roofBlue, 0.48, 1.25, 0.2, g, false); col(dx, dz, 0.55); }
      rack(city, y.x - 4.0, zIn + sd * 2.0, sd > 0 ? Math.PI : 0); hay(city, x1 - 1.6, zIn + sd * 1.8, 0, 2); col(y.x - 4.0, zIn + sd * 2.0, 1.1); col(x1 - 1.6, zIn + sd * 1.8, 0.8);
    } else {
      for (let i = 0; i < 4; i++) { const tx = x0 + 2.4 + i * (y.w - 4.8) / 3, tz = zOut - sd * 1.6, g = new THREE.Group(); g.position.set(tx, 0, tz); g.rotation.y = sd > 0 ? Math.PI : 0; city.add(g);
        for (const s2 of [-1, 1]) { const lg = mesh(cyl(0.05, 0.06, 1.9, 5), M.timber, s2 * 0.45, 0.85, -0.25, g); lg.rotation.x = -0.2; } mesh(cyl(0.05, 0.05, 1.9, 5), M.timber, 0, 0.85, -0.55, g).rotation.x = 0.3;
        const tgt = mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.14, 20), [M.straw, new THREE.MeshStandardMaterial({ map: T.target, roughness: 1 }), M.straw], 0, 1.55, 0.06, g); tgt.rotation.x = Math.PI / 2; col(tx, tz, 0.6); }
      for (let i = 0; i < 3; i++) mesh(box(0.14, 0.5, 0.14), M.timber, y.x - 3 + i * 3, 0.25, zIn + sd * 2.6, city, false);
      mesh(box(9.4, 0.06, 0.06), M.rope, y.x, 0.5, zIn + sd * 2.6, city, false);
      mesh(box(1.5, 0.16, 0.5), M.wood, x1 - 1.8, 0.45, zIn + sd * 1.3).castShadow = true; col(x1 - 1.8, zIn + sd * 1.3, 0.8);
    }
  }
  fenceBuild();
  yield;

  // ---------- Lapangan apel: tiang bendera, tugu penjaga, lampu ----------
  for (const [fx, fz] of [[P1.x - P1.w / 2 + 2, -P1.d / 2 + 2], [P1.x - P1.w / 2 + 2, P1.d / 2 - 2], [P1.x + P1.w / 2 - 2, -P1.d / 2 + 2], [P1.x + P1.w / 2 - 2, P1.d / 2 - 2]]) {
    const g = new THREE.Group(); g.position.set(fx, 0, fz); city.add(g); mesh(box(1.2, 0.4, 1.2), M.plinth, 0, 0.2, 0, g); mesh(cyl(0.09, 0.14, 9.6, 6), M.timber, 0, 4.8, 0, g); mesh(new THREE.SphereGeometry(0.2, 8, 6), M.gold, 0, 9.8, 0, g, false);
    banner(g, 'sword', 0.8, 8.0, 0, 1.5, 3.0, 0); col(fx, fz, 0.65);
  }
  for (const sd of [-1, 1]) {   // patung penjaga bersenjata di kiri-kanan jalan menuju markas
    const sx = P1.x + P1.w / 2 - 6, sz = sd * 9.5, g = new THREE.Group(); g.position.set(sx, 0, sz); g.rotation.y = Math.PI; city.add(g);
    mesh(box(1.9, 1.3, 1.9), M.plinth, 0, 0.65, 0, g); mesh(cyl(0.42, 0.55, 1.9, 8), M.hall, 0, 2.25, 0, g); mesh(new THREE.SphereGeometry(0.34, 8, 6), M.hall, 0, 3.4, 0, g); mesh(box(0.14, 3.2, 0.14), M.hall, 0.62, 2.7, 0.1, g, false); mesh(box(0.8, 1.3, 0.12), M.roofBlue, -0.55, 2.2, 0.35, g, false); col(sx, sz, 1.3);
  }
  for (let x = P1.x - P1.w / 2 + 6; x < P1.x + P1.w / 2 - 3; x += 12) for (const sd of [-1, 1]) lamp(x, sd * (D1.avenue.w / 2 + 0.9));
  for (let x = 104; x <= 148; x += 14) for (const sd of [-1, 1]) if (x < P1.x - P1.w / 2 || x > P1.x + P1.w / 2) lamp(x, sd * (D1.avenue.w / 2 + 0.9));
  for (const sd of [-1, 1]) lamp(72, sd * (D1.avenue.w / 2 + 0.9));
  // papan Distrik 1 di pintu masuk (tepi jalan lingkar)
  signPost(RING.r + RING.w / 2 + 4.5, 8.5, RING.r - 40, 8.5, [{ text: 'DISTRIK 1', sub: 'Military Quarter' }, { text: 'Lapangan Apel · Markas Komando', sub: '' }], 1.1, 3.0, 1.3);
  yield;

  // ---------- pohon di Distrik 1 (hanya di ruang kosong) ----------
  for (let n = 0, tries = 0; n < (COARSE ? 14 : 28) && tries < 800; tries++) {
    const x = Rn(RING.r + 6, 172), z = Rn(-75, 75);
    if (!inD1(x, z, 3.5) || d1Blocked(x, z, 5.5) || Math.hypot(x - 80, Math.abs(z) - 14) < 6) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 9)) continue;
    addTree(x, z, Rn(0.55, 0.8)); n++;
  }
  // ======================================================================
  //  DISTRIK 2 — MERCHANT QUARTER (alun-alun pasar bundar, toko, penginapan, kedai, bank, rumah timbang, balai serikat, gudang dagang)
  //  Koordinat distrik (u, v) -> lokal kota lewat d2p(); arah depan bangunan sudah dihitung di kekaisaran-layout.js (b.x, b.z, b.face).
  // ======================================================================
  const AWN_COL = ['#c73a2a', '#2f6fb0', '#e0a82e', '#3a8a4a', '#8a3a8f', '#e07a2a'];
  const stripeTex = c => ctex(64, (x, s) => { x.fillStyle = '#f3ead0'; x.fillRect(0, 0, s, s); x.fillStyle = c; x.fillRect(0, 0, s / 2, s); });
  const awnMats = AWN_COL.map(c => tm(stripeTex(c), 0xffffff, { side: THREE.DoubleSide }));
  function scales(x, cx, cy, L, c) {   // timbangan dua piring
    x.save(); x.translate(cx, cy); x.strokeStyle = c; x.fillStyle = c; x.lineCap = 'round'; x.lineWidth = L * 0.1;
    x.beginPath(); x.moveTo(0, -L * 0.85); x.lineTo(0, L * 0.8); x.stroke(); x.beginPath(); x.moveTo(-L * 0.55, L * 0.8); x.lineTo(L * 0.55, L * 0.8); x.stroke();
    x.beginPath(); x.moveTo(-L * 0.8, -L * 0.5); x.lineTo(L * 0.8, -L * 0.5); x.stroke(); x.lineWidth = L * 0.04;
    for (const sg of [-1, 1]) { x.beginPath(); x.moveTo(sg * L * 0.8, -L * 0.5); x.lineTo(sg * L * 1.0, L * 0.1); x.moveTo(sg * L * 0.8, -L * 0.5); x.lineTo(sg * L * 0.6, L * 0.1); x.stroke(); x.beginPath(); x.arc(sg * L * 0.8, L * 0.1, L * 0.2, 0, Math.PI); x.fill(); }
    x.restore();
  }
  const mbannerTex = ctex(128, (x, w, h) => {
    x.fillStyle = '#1f5a3a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d9b24a'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
    scales(x, w / 2, h * 0.4, 30, '#e7c862');
    x.fillStyle = '#d9b24a'; x.beginPath(); x.moveTo(8, h - 8); x.lineTo(w / 2, h - 52); x.lineTo(w - 8, h - 8); x.lineTo(w - 8, h - 24); x.lineTo(w / 2, h - 70); x.lineTo(8, h - 24); x.closePath(); x.fill();
  }, 128, 256);
  const mbannerMat = new THREE.MeshStandardMaterial({ map: mbannerTex, roughness: 1, side: THREE.DoubleSide });
  const mbanner = (g, x, y, z, w, h, ry = 0) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mbannerMat); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; g.add(b); return b; };
  const emblemM = tm(ctex(256, (x, s) => { x.fillStyle = '#1f5a3a'; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill(); x.strokeStyle = '#d9b24a'; x.lineWidth = 10; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 12, 0, 7); x.stroke(); scales(x, s / 2, s / 2, 78, '#e7c862'); }), 0xffffff);
  const WHEEL = ['#d96a5a', '#e69a4a', '#e8cd5a', '#9cc65a', '#5aa86a', '#4aa8a0', '#5a8ed0', '#6a6ad0', '#9a6ac8', '#c86aa8', '#d8798a', '#e0b89a'];
  const wheelTex = ctex(512, (x, s) => {
    const c = s / 2; x.fillStyle = '#a79f88'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 12; i++) { const a0 = i * Math.PI / 6, a1 = (i + 1) * Math.PI / 6; x.fillStyle = WHEEL[i]; x.beginPath(); x.moveTo(c, c); x.arc(c, c, c - 14, a0, a1); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.28)'; x.beginPath(); x.moveTo(c, c); x.arc(c, c, c * 0.62, a0, a1); x.closePath(); x.fill(); }
    x.strokeStyle = '#f1e8cf'; x.lineWidth = 6; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.beginPath(); x.moveTo(c + Math.cos(a) * c * 0.24, c + Math.sin(a) * c * 0.24); x.lineTo(c + Math.cos(a) * (c - 14), c + Math.sin(a) * (c - 14)); x.stroke(); }
    for (const r of [c - 14, c * 0.62, c * 0.24]) { x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); }
    x.fillStyle = '#d8d0b8'; x.beginPath(); x.arc(c, c, c * 0.24, 0, 7); x.fill(); noise(x, s, 1200, 120, 230, 0.12);
  });
  wheelTex.wrapS = wheelTex.wrapT = THREE.ClampToEdgeWrapping;
  const D2c = d2p(D2.plaza.u, 0), PLR = D2.plaza.r;
  const dpt = (u, v) => d2p(u, v);
  const goodsCol = [0xd0452f, 0xe8b23a, 0x6fae48, 0xd77b2e, 0x8a4fa0, 0xe9e2c8];
  const crate = (g, x, y, z, s = 0.8, ry = 0) => { const k = mesh(box(s, s * 0.8, s), M.wood, x, y + s * 0.4, z, g); k.rotation.y = ry; mesh(box(s * 0.92, 0.06, s * 0.92), M.woodDark, x, y + s * 0.82, z, g, false).rotation.y = ry; return k; };
  const sack = (g, x, z, c = 0xcdbb8e) => { const k = mesh(new THREE.SphereGeometry(0.42, 8, 6), std(c), x, 0.32, z, g); k.scale.set(1, 0.85, 0.8); mesh(new THREE.SphereGeometry(0.16, 6, 4), std(c), x, 0.7, z, g, false); return k; };
  function wagon(x, z, ry, cargo = 'crates') {   // gerobak barang beroda 4 (koordinat lokal kota)
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; city.add(g);
    mesh(box(3.6, 0.2, 1.7), M.wood, 0, 0.8, 0, g); for (const sd of [-1, 1]) mesh(box(3.6, 0.55, 0.12), M.woodDark, 0, 1.15, sd * 0.82, g, false); mesh(box(0.12, 0.55, 1.7), M.woodDark, -1.75, 1.15, 0, g, false);
    for (const sx of [-1.1, 1.1]) for (const sd of [-1, 1]) { const w = mesh(cyl(0.55, 0.55, 0.14, 12), M.woodDark, sx, 0.55, sd * 0.98, g, false); w.rotation.x = Math.PI / 2; mesh(cyl(0.14, 0.14, 0.2, 6), M.iron, sx, 0.55, sd * 0.98, g, false).rotation.x = Math.PI / 2; }
    mesh(box(2.4, 0.1, 0.1), M.timber, 2.8, 0.7, 0, g, false);
    if (cargo === 'crates') { crate(g, -0.9, 0.9, 0.3, 0.9); crate(g, 0.1, 0.9, -0.3, 0.9, 0.2); crate(g, 0.9, 0.9, 0.3, 0.8, -0.1); crate(g, -0.3, 1.7, 0, 0.8, 0.1); }
    else { for (let i = 0; i < 6; i++) { const k = mesh(new THREE.SphereGeometry(0.45, 8, 6), std(i % 2 ? 0xcdbb8e : 0xbfa974), -1.1 + (i % 3) * 1.0, 1.35 + (i > 2 ? 0.55 : 0), (i % 2) * 0.35 - 0.2, g); k.scale.set(1, 0.85, 0.85); } }
    col(x, z, 1.9);
  }
  yield;

  // ---------- lantai: jalan utama, alun-alun pasar berwarna, jalur ke bangunan ----------
  { const a = dpt(D2.avenue.u0 - 2, 0), b = dpt(D2.avenue.u1, 0); decalStrip(a.x, a.z, b.x, b.z, D2.avenue.w, M.cobble, 4, 0.33); }
  decalDisc(D2c.x, D2c.z, PLR + 1.4, M.cobble, 5, 0.33, 72);                                    // bingkai batu kali
  (() => { const g = new THREE.CircleGeometry(PLR, 72).rotateX(-Math.PI / 2); const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / (2 * PLR) + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / (2 * PLR); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.translate(D2c.x, 0, D2c.z);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wheelTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })); m.position.y = 0.02 + 8 * 0.004; m.receiveShadow = true; city.add(m); })();
  { // jalur dari depan tiap bangunan (selain balai) ke tepi alun-alun
    for (const b of [...D2.buildings.filter(q => q.id !== 'balai'), ...D2.shops]) {
      const fx = Math.cos(b.face), fz = Math.sin(b.face), sx = b.x + fx * (b.d / 2 + 0.5), sz = b.z + fz * (b.d / 2 + 0.5), dx = D2c.x - sx, dz = D2c.z - sz, L = Math.hypot(dx, dz), t = Math.max(0, L - (PLR + 0.5)) / L;
      if (L > PLR + 1.5) decalStrip(sx, sz, sx + dx * t, sz + dz * t, 3, M.cobble, 5, 0.33);
    }
  }
  yield;

  // posisi dunia-kota dari koordinat lokal bangunan (lx = sepanjang fasad, lz = searah depan)
  const bp = (b, lx, lz) => ({ x: b.x + Math.sin(b.face) * lx + Math.cos(b.face) * lz, z: b.z - Math.cos(b.face) * lx + Math.sin(b.face) * lz });
  const bcol = (b, lx, lz, r) => { const p = bp(b, lx, lz); col(p.x, p.z, r); };
  yield;

  // ---------- gapura pintu masuk Distrik 2 (tiang kayu + papan nama + panji) ----------
  { const u = RING.r + RING.w / 2 + 3.5, c = dpt(u, 0), g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = -72 * D2R; city.add(g);   // sumbu-x grup = menjauhi istana, sumbu-z grup = sisi v
    for (const sd of [-1, 1]) { mesh(box(1.2, 0.5, 1.2), M.plinth, 0, 0.25, sd * 7.2, g); mesh(box(0.8, 6.4, 0.8), M.timber, 0, 3.7, sd * 7.2, g); mesh(box(1.0, 0.3, 1.0), M.gold, 0, 7.0, sd * 7.2, g, false); const q = dpt(u, sd * 7.2); col(q.x, q.z, 0.9); }
    mesh(box(0.8, 0.8, 15.6), M.timber, 0, 6.6, 0, g); mesh(box(0.5, 0.3, 14.6), M.gold, 0, 7.15, 0, g, false);
    plaque(g, 'MERCHANT QUARTER', 'Distrik 2 · Pasar', 0.46, 6.1, 0, 7.0, 1.7, Math.PI / 2); plaque(g, 'MERCHANT QUARTER', 'Distrik 2 · Pasar', -0.46, 6.1, 0, 7.0, 1.7, -Math.PI / 2);
    for (const sd of [-1, 1]) { mbanner(g, 0, 3.6, sd * 5.6, 1.3, 3.0, Math.PI / 2); }
  }

  // ---------- air mancur pasar + bangku ----------
  { const g = new THREE.Group(); g.position.set(D2c.x, 0, D2c.z); city.add(g);
    mesh(cyl(3.6, 3.8, 0.9, 16), M.plinth, 0, 0.45, 0, g); mesh(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2), M.water, 0, 0.88, 0, g, false);
    mesh(cyl(0.5, 0.7, 1.6, 10), M.plinth, 0, 1.7, 0, g); mesh(cyl(1.7, 0.6, 0.4, 12), M.plinth, 0, 2.6, 0, g); mesh(cyl(0.2, 0.3, 1.4, 8), M.plinth, 0, 3.5, 0, g); mesh(cyl(0.9, 0.3, 0.3, 10), M.plinth, 0, 4.3, 0, g);
    mesh(new THREE.SphereGeometry(0.32, 8, 6), M.gold, 0, 4.7, 0, g, false);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; mesh(cyl(0.22, 0.22, 0.06, 10), M.gold, Math.cos(a) * 3.3, 0.96, Math.sin(a) * 3.3, g, false).rotation.z = 0; }
    col(D2c.x, D2c.z, 4.1);
    for (let k = 0; k < 4; k++) { const a = (45 + k * 90) * D2R, bx = D2c.x + Math.cos(a) * 7.4, bz = D2c.z + Math.sin(a) * 7.4, b = new THREE.Group(); b.position.set(bx, 0, bz); b.rotation.y = -a + Math.PI / 2; city.add(b);
      mesh(box(2.4, 0.14, 0.6), M.wood, 0, 0.5, 0, b); mesh(box(2.4, 0.5, 0.1), M.wood, 0, 0.85, -0.3, b, false); for (const sd of [-1, 1]) mesh(box(0.14, 0.5, 0.5), M.plinth, sd * 1.0, 0.25, 0, b, false); col(bx, bz, 1.2); }
  }
  // ---------- kios pasar beratap kain bergaris (melingkar di alun-alun) ----------
  for (let i = 0; i < D2.stalls.n; i++) {
    if (D2.stalls.skip.includes(i)) continue;
    const th = i * 2 * Math.PI / D2.stalls.n, p = dpt(D2.plaza.u + D2.stalls.r * Math.cos(th), D2.stalls.r * Math.sin(th)), face = d2Face(-Math.cos(th), -Math.sin(th)), g = place(p.x, p.z, face), kind = i % 3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(cyl(0.07, 0.08, 2.7, 6), M.timber, sx * 1.55, 1.35, sz * 1.15, g, false);
    const aw = mesh(scaleUV(box(3.9, 0.1, 3.2), 4, 1), awnMats[i % awnMats.length], 0, 2.85, 0, g); aw.rotation.x = 0.14;
    mesh(box(3.2, 0.9, 0.9), M.wood, 0, 0.45, 1.0, g); mesh(box(3.3, 0.08, 1.0), M.woodDark, 0, 0.94, 1.0, g, false);
    for (let j = 0; j < 5; j++) {
      const x = -1.2 + j * 0.6, z = 1.0 + (j % 2) * 0.1 - 0.05;
      if (kind === 0) mesh(new THREE.SphereGeometry(0.17, 8, 6), std(goodsCol[(i + j) % goodsCol.length]), x, 1.14, z, g, false);          // buah
      else if (kind === 1) { const r = mesh(cyl(0.16, 0.16, 0.7, 8), std(goodsCol[(i + j * 2) % goodsCol.length]), x, 1.2, z, g, false); r.rotation.z = Math.PI / 2; r.rotation.y = 0.3; }   // gulungan kain
      else mesh(cyl(0.17, 0.12, 0.34, 8), std(j % 2 ? 0xb5683a : 0x9c5a32), x, 1.12, z, g, false);                                               // keramik
    }
    crate(g, -1.1, 0, -0.6, 0.8); crate(g, 1.1, 0, -0.5, 0.7, 0.3); barrel(g, 0, -0.7);
    mesh(box(0.2, 0.28, 0.2), M.lantern, 0, 2.55, 1.3, g, false);
    col(p.x, p.z, 2.0);
  }
  yield;

  // ---------- bangunan Distrik 2 ----------
  let shopIdx = 0;
  let inn = null;   // interior Penginapan Karavan (dibuat di cabang 'inn' di bawah; lihat kekaisaran-penginapan.js)
  for (const b of D2.shops) {
    const g = place(b.x, b.z, b.face), w = b.w, d = b.d, H = 6.4, ci = shopIdx++ % awnMats.length;
    const y0 = shell(g, w, d, H, 3.4, { wall: M.plaster, roof: M.roofRed });
    door(g, d, y0, 1.8, 2.8);
    const can = mesh(scaleUV(box(5.4, 0.1, 1.9), 5, 1), awnMats[ci], 0, y0 + 3.85, d / 2 + 0.95, g); can.rotation.x = 0.26;
    plaque(g, b.name.toUpperCase(), null, 0, y0 + 5.3, d / 2 + 0.1, 4.4, 0.8);
    for (const sx of [-1, 1]) mesh(new THREE.PlaneGeometry(0.95, 1.1), M.window, sx * (w / 2 - 1.3), y0 + H * 0.88, d / 2 + 0.07, g, false);
    mesh(box(0.1, 0.1, 1.5), M.iron, w / 2 - 1.2, y0 + 4.6, d / 2 + 0.75, g, false); mesh(box(0.7, 0.7, 0.1), std(parseInt(AWN_COL[ci].slice(1), 16)), w / 2 - 1.2, y0 + 4.1, d / 2 + 1.45, g, false);
    crate(g, -w / 2 + 1.6, 0, d / 2 + 1.3, 0.9); crate(g, -w / 2 + 2.6, 0, d / 2 + 1.2, 0.8, 0.2); barrel(g, w / 2 - 1.6, d / 2 + 1.1);
    colRect(b);
  }
  for (const b of D2.buildings) {
    const g = place(b.x, b.z, b.face), w = b.w, d = b.d;
    if (b.kind === 'guild') {
      const y0 = shell(g, w, d, 8.4, 5.2, { wall: M.hall, roof: M.roofBlue, ov: 1.2, chimney: false });
      mesh(boxUV(6.4, 14, 4.6, 0.5), M.hall, 0, 7, d / 2 + 1.6, g); mesh(box(7.2, 0.6, 5.4), M.plinth, 0, 14.2, d / 2 + 1.6, g);
      mesh(new THREE.ConeGeometry(5.0, 8, 4).rotateY(Math.PI / 4), M.roofBlue, 0, 18.5, d / 2 + 1.6, g); mesh(cyl(0.06, 0.06, 3.2, 5), M.gold, 0, 23.9, d / 2 + 1.6, g, false);
      mesh(extrude(doorShape(1.8, 3.4), 0.5, false), M.woodDark, 0, 0, d / 2 + 3.9, g, false); for (const y of [1.3, 3.0]) mesh(box(3.7, 0.16, 0.2), M.iron, 0, y, d / 2 + 4.0, g, false); mesh(box(0.14, 5.0, 0.2), M.iron, 0, 2.5, d / 2 + 4.02, g, false);
      for (const sd of [-1, 1]) mesh(box(0.7, 5.2, 0.7), M.plinth, sd * 2.3, 2.6, d / 2 + 4.0, g); mesh(box(5.4, 0.9, 0.9), M.plinth, 0, 5.4, d / 2 + 4.0, g);
      mesh(box(8.4, 0.5, 2.2), M.plinth, 0, 0.55, d / 2 + 4.9, g); mesh(box(7.0, 0.5, 1.6), M.plinth, 0, 0.25, d / 2 + 5.8, g);
      { const em = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshStandardMaterial({ map: emblemM.map, roughness: 1 })); em.position.set(0, 10.4, d / 2 + 3.93); g.add(em); }
      plaque(g, 'BALAI SERIKAT PEDAGANG', 'Merchant Quarter', 0, 7.0, d / 2 + 3.95, 5.4, 1.3);
      for (const sd of [-1, 1]) {
        const t = new THREE.Group(); t.position.set(sd * (w / 2 + 0.4), 0, d / 2 - 0.5); g.add(t); roundTower(t, 2.3, 10, 4.4, M.roofBlue);
        mbanner(g, sd * (w / 2 - 3.2), y0 + 4.2, d / 2 + 0.14, 1.2, 2.8); mbanner(g, sd * 3.2, y0 + 6.2, d / 2 + 3.95, 1.0, 3.0);
        mesh(box(0.2, 0.3, 0.2), M.lantern, sd * 3.0, y0 + 2.4, d / 2 + 4.1, g, false); bcol(b, sd * (w / 2 + 0.4), d / 2 - 0.5, 2.7);
      }
      colRect(b, 0.4); bcol(b, 0, d / 2 + 1.8, 3.4);
    } else if (b.kind === 'bank') {
      const y0 = shell(g, w, d, 5.6, 3.6, { wall: M.hall, roof: M.roofDark, windows: false, chimney: false, beams: false });
      for (let i = 0; i < 4; i++) { const x = -2.7 + i * 1.8; mesh(cyl(0.38, 0.42, 4.8, 10), M.plinth, x, y0 + 2.4, d / 2 + 1.5, g); mesh(box(1.0, 0.3, 1.0), M.plinth, x, y0 + 4.95, d / 2 + 1.5, g, false); bcol(b, x, d / 2 + 1.5, 0.5); }
      mesh(box(7.6, 0.5, 2.6), M.plinth, 0, y0 + 5.25, d / 2 + 1.4, g);
      { const tri = new THREE.Shape(); tri.moveTo(-3.8, 0); tri.lineTo(3.8, 0); tri.lineTo(0, 1.7); mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false }), M.hall, 0, y0 + 5.5, d / 2 + 2.4, g); }
      door(g, d, y0, 1.9, 3.0);
      for (const sx of [-1, 1]) { mesh(new THREE.PlaneGeometry(0.9, 1.3), M.window, sx * (w / 2 - 2.0), y0 + 2.4, d / 2 + 0.07, g, false); for (let k = -1; k <= 1; k++) mesh(box(0.06, 1.3, 0.06), M.iron, sx * (w / 2 - 2.0) + k * 0.28, y0 + 2.4, d / 2 + 0.12, g, false); }
      { const em = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshStandardMaterial({ map: emblemM.map, roughness: 1 })); em.position.set(0, y0 + 5.0, d / 2 + 2.72); g.add(em); }
      plaque(g, 'BANK KEKAISARAN', null, 0, y0 + 4.1, d / 2 + 0.1, 4.2, 0.8);
      mesh(box(7.4, 0.5, 1.6), M.plinth, 0, 0.25, d / 2 + 2.9, g, false);
      mbanner(g, -w / 2 + 0.9, y0 + 3.2, d / 2 + 0.14, 0.9, 2.1); mbanner(g, w / 2 - 0.9, y0 + 3.2, d / 2 + 0.14, 0.9, 2.1);
      colRect(b);
    } else if (b.kind === 'scale') {
      const y0 = shell(g, w, d, 4.8, 3.4, { wall: M.plaster, roof: M.roofRed });
      door(g, d, y0, 2.4, 2.9); plaque(g, 'RUMAH TIMBANG', null, 0, y0 + 4.3, d / 2 + 0.1, 3.8, 0.78);
      { const ry = y0 + 4.8 + 3.4 + 0.1; mesh(cyl(0.12, 0.16, 2.4, 6), M.gold, 0, ry + 1.2, 0, g, false); mesh(box(3.8, 0.14, 0.14), M.gold, 0, ry + 2.4, 0, g, false);
        for (const sd of [-1, 1]) { mesh(cyl(0.7, 0.55, 0.12, 12), M.gold, sd * 1.8, ry + 1.2, 0, g, false); for (const k of [-0.4, 0.4]) mesh(cyl(0.02, 0.02, 1.2, 4), M.gold, sd * 1.8 + k, ry + 1.8, 0, g, false); } }
      { const q = new THREE.Group(); q.position.set(-w / 2 - 3.0, 0, d / 2 - 0.2); g.add(q);   // timbangan umum di halaman
        mesh(box(2.6, 0.3, 2.6), M.plinth, 0, 0.15, 0, q); mesh(cyl(0.1, 0.12, 2.2, 6), M.iron, 0, 1.4, 0, q); mesh(box(2.8, 0.1, 0.1), M.iron, 0, 2.5, 0, q, false);
        for (const sd of [-1, 1]) { mesh(cyl(0.5, 0.4, 0.1, 10), M.iron, sd * 1.3, 1.5, 0, q, false); mesh(cyl(0.015, 0.015, 1.0, 4), M.iron, sd * 1.3, 2.0, 0, q, false); }
        sack(q, 1.3, 0.0, 0xcdbb8e); bcol(b, -w / 2 - 3.0, d / 2 - 0.2, 1.6); }
      crate(g, w / 2 - 1.4, 0, d / 2 + 1.3, 0.9); sack(g, w / 2 - 2.6, d / 2 + 1.2); colRect(b);
    } else if (b.kind === 'inn') {
      const y0 = shell(g, w, d, 6.4, 3.8, { wall: M.plaster, roof: M.roofRed });
      door(g, d, y0, 2.2, 2.9); plaque(g, b.name.toUpperCase(), null, 0, y0 + 4.5, d / 2 + 0.1, 5.0, 0.9);
      for (const sx of [-1, 1]) mesh(new THREE.PlaneGeometry(0.95, 1.1), M.window, sx * (w / 2 - 1.5), y0 + 5.2, d / 2 + 0.07, g, false);
      const pc = mesh(scaleUV(box(w * 0.5, 0.12, 2.3), 6, 1), awnMats[1], 0, y0 + 3.7, d / 2 + 1.9, g); pc.rotation.x = 0.16;
      for (const sx of [-1, 1]) { mesh(cyl(0.08, 0.09, 3.6, 6), M.timber, sx * w * 0.24, y0 + 1.8, d / 2 + 2.9, g, false); bcol(b, sx * w * 0.24, d / 2 + 2.9, 0.4); }
      mesh(box(0.1, 0.1, 1.5), M.iron, w / 2 - 1.0, y0 + 4.8, d / 2 + 0.75, g, false); mesh(box(1.0, 0.7, 0.1), M.gold, w / 2 - 1.0, y0 + 4.3, d / 2 + 1.5, g, false);
      for (const sd of [-1, 1]) { mesh(box(0.2, 0.3, 0.2), M.lantern, sd * 1.9, y0 + 3.1, d / 2 + 0.2, g, false); }
      mesh(box(4.6, 0.1, 0.1), M.timber, 0, 1.0, d / 2 + 4.3, g, false); for (const sx of [-1, 1]) mesh(cyl(0.07, 0.08, 1.1, 5), M.timber, sx * 2.3, 0.55, d / 2 + 4.3, g, false);
      barrel(g, -w / 2 + 1.2, d / 2 + 1.2); barrel(g, -w / 2 + 2.1, d / 2 + 1.0); hay(g, w / 2 + 0.9, 1.0, 0.3, 2);
      colRect(b);
      inn = buildPenginapan({ b, g, wall: g.userData.wall, toWorld, toLocal, M, std, ctex, box, cyl, plaque, mbanner });   // ruang dalam kecil (tersembunyi sampai pemain masuk lewat pintu)
    } else if (b.kind === 'tavern') {
      const y0 = shell(g, w, d, 5.6, 3.6, { wall: M.plaster, roof: M.roofRed });
      door(g, d, y0, 1.9, 2.8); plaque(g, b.name.toUpperCase(), null, 0, y0 + 4.2, d / 2 + 0.1, 4.2, 0.8);
      mesh(box(0.1, 0.1, 1.5), M.iron, w / 2 - 1.2, y0 + 4.6, d / 2 + 0.75, g, false); { const m = mesh(cyl(0.3, 0.26, 0.55, 8), M.gold, w / 2 - 1.2, y0 + 4.2, d / 2 + 1.5, g, false); void m; }
      for (let k = 0; k < 2; k++) { const tx = -w / 2 + 2.6 + k * 4.2, tz = d / 2 + 3.0; mesh(cyl(0.7, 0.7, 0.1, 10), M.wood, tx, 0.9, tz, g); mesh(cyl(0.08, 0.1, 0.9, 6), M.woodDark, tx, 0.45, tz, g, false);
        for (const a of [0, 2.1, 4.2]) mesh(cyl(0.22, 0.22, 0.1, 8), M.wood, tx + Math.cos(a) * 1.1, 0.5, tz + Math.sin(a) * 1.1, g, false);
        mesh(cyl(0.04, 0.04, 2.3, 5), M.timber, tx, 1.7, tz, g, false); mesh(new THREE.ConeGeometry(1.5, 0.5, 8), awnMats[(k + 2) % awnMats.length], tx, 2.9, tz, g, false); bcol(b, tx, tz, 1.3); }
      barrel(g, w / 2 - 1.2, d / 2 + 1.0); barrel(g, w / 2 - 2.1, d / 2 + 1.2); barrel(g, w / 2 - 1.6, d / 2 + 1.9);
      colRect(b);
    } else if (b.kind === 'warehouse') {
      const y0 = shell(g, w, d, 5.2, 3.2, { wall: M.plasterGrey, roof: M.roofDark, windows: false, chimney: false });
      mesh(box(4.4, 3.9, 0.2), M.woodDark, 0, y0 + 1.95, d / 2 + 0.08, g, false); for (const y of [0.8, 2.0, 3.2]) mesh(box(4.6, 0.16, 0.26), M.iron, 0, y0 + y, d / 2 + 0.14, g, false); mesh(box(0.12, 3.9, 0.26), M.iron, 0, y0 + 1.95, d / 2 + 0.14, g, false);
      mesh(box(5.4, 0.4, 0.5), M.plinth, 0, y0 + 4.1, d / 2 + 0.2, g, false); plaque(g, b.name.toUpperCase(), null, 0, y0 + 4.5, d / 2 + 0.1, 3.8, 0.78);
      { const hx = -w / 2 + 3.4; mesh(box(0.25, 0.25, 2.6), M.timber, hx, y0 + 4.3, d / 2 + 1.3, g, false); mesh(box(0.2, 0.2, 1.2), M.timber, hx, y0 + 3.8, d / 2 + 0.6, g, false).rotation.x = -0.6; mesh(cyl(0.02, 0.02, 1.7, 4), M.rope, hx, y0 + 3.4, d / 2 + 2.4, g, false); crate(g, hx, 0.9, d / 2 + 2.4, 0.8); }
      for (let i = 0; i < 3; i++) sack(g, w / 2 - 1.4 - (i % 2) * 0.8, d / 2 + 1.2 + (i > 1 ? 0.8 : 0), i % 2 ? 0xcdbb8e : 0xbfa974);
      crate(g, w / 2 - 1.5, 0.0, d / 2 + 2.6, 0.9); crate(g, w / 2 - 1.5, 0.75, d / 2 + 2.6, 0.7, 0.2);
      bcol(b, w / 2 - 1.5, d / 2 + 1.8, 1.7);
      { const p = bp(b, -5.5, d / 2 + 5.2); wagon(p.x, p.z, Math.PI / 2 - b.face, b.id === 'gudang-1' ? 'crates' : 'sacks'); }
      colRect(b);
    }
  }
  yield;

  // ---------- lampu jalan (alun-alun & jalan utama) + pohon di ruang kosong ----------
  for (let i = 0; i < 12; i++) { if ([0, 5, 6, 11].includes(i)) continue; const a = (15 + i * 30) * D2R, p = dpt(D2.plaza.u + 21.8 * Math.cos(a), 21.8 * Math.sin(a)); lamp(p.x, p.z); }
  for (const u of [78, 88, 134]) for (const sd of [-1, 1]) { const p = dpt(u, sd * (D2.avenue.w / 2 + 0.9)); lamp(p.x, p.z); }
  for (let n = 0, tries = 0; n < (COARSE ? 6 : 12) && tries < 800; tries++) {
    const p = dpt(Rn(76, 165), Rn(-85, 85)); if (!inD2(p.x, p.z, 3.5) || d2Blocked(p.x, p.z, 5)) continue;
    if (trees.some(t => Math.hypot(t.x - p.x, t.z - p.z) < 10)) continue; addTree(p.x, p.z, Rn(0.55, 0.8)); n++;
  }
  yield;
  // ======================================================================

  // ======================================================================
  //  DISTRIK 3 — NOBLE QUARTER (taman formal bundar berpagar tanaman, kediaman bangsawan, kapel keluarga, rumah kaca, Kediaman Adipati)
  //  Koordinat distrik (u, v) -> lokal kota lewat d3p(); arah depan bangunan dihitung di kekaisaran-layout.js (b.x, b.z, b.face).
  // ======================================================================
  const hedgeM = std(0x2f6b34), hedgeDark = std(0x275a2c);
  const grassM = new THREE.MeshStandardMaterial({ color: 0x5c9a46, roughness: 1, side: THREE.DoubleSide });
  const gravelM = tm(T.sand, 0xe2dcc8, { side: THREE.DoubleSide, polygonOffset: true });
  const glassM = new THREE.MeshStandardMaterial({ color: 0xa8d8ea, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const crownEmM = new THREE.MeshStandardMaterial({ map: ctex(256, (x, s) => { x.fillStyle = '#1d3266'; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill(); x.strokeStyle = '#d9b24a'; x.lineWidth = 10; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 12, 0, 7); x.stroke(); crown(x, s / 2, s / 2, 70, '#e7c862'); }), roughness: 1 });
  const G3 = D3.garden, g3c = d3p(G3.u, 0), q3 = (r, th) => d3p(G3.u + r * Math.cos(th), r * Math.sin(th));
  const FLOWER = [0xd9456a, 0xf0c43a, 0xf2f2f2, 0x9a5ad0, 0xf08a3a, 0x58a8e0];
  const cone = (g, x, z, h = 1.8, r = 0.8) => { mesh(cyl(0.12, 0.16, 0.5, 6), M.woodDark, x, 0.25, z, g, false); mesh(new THREE.ConeGeometry(r, h, 8), hedgeM, x, 0.5 + h / 2, z, g); };
  const statue3 = (x, z, tx, tz, h = 2.2) => {   // patung bangsawan di atas alas batu (koordinat lokal kota)
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(tx - x, tz - z); city.add(g);
    mesh(box(1.5, 1.1, 1.5), M.plinth, 0, 0.55, 0, g); mesh(box(1.1, 0.25, 1.1), M.hall, 0, 1.22, 0, g); mesh(cyl(0.3, 0.45, h * 0.6, 8), M.hall, 0, 1.35 + h * 0.3, 0, g);
    mesh(new THREE.SphereGeometry(0.28, 8, 6), M.hall, 0, 1.45 + h * 0.6 + 0.15, 0, g); mesh(box(0.1, h * 0.55, 0.1), M.gold, 0.45, 1.5 + h * 0.3, 0.1, g, false); col(x, z, 0.9);
  };
  // ---------- lantai: jalan utama, taman, jalur ----------
  { const a = d3p(D3.avenue.u0 - 2, 0), b = d3p(D3.avenue.u1, 0); decalStrip(a.x, a.z, b.x, b.z, D3.avenue.w, M.cobble, 4, 0.33); }
  decalDisc(g3c.x, g3c.z, G3.r + 1.4, M.cobble, 5, 0.33, 72);
  decalDisc(g3c.x, g3c.z, G3.r - 0.2, grassM, 6, 0.3, 72);
  decalRing(8.2, 11.4, gravelM, 7, 0.3, 64, g3c.x, g3c.z);
  for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = d3p(G3.u + du * 3, dv * 3), b = d3p(G3.u + du * (G3.r - 0.5), dv * (G3.r - 0.5)); decalStrip(a.x, a.z, b.x, b.z, 3.2, gravelM, 7, 0.3); }
  for (let k = 0; k < 4; k++) {   // petak bunga bundar di empat diagonal
    const th = (45 + k * 90) * D2R, p = q3(9.6, th); decalDisc(p.x, p.z, 2.5, std(0x7a5a38), 8, 0.3, 24);
  }
  { const n = 4 * 16, im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 5), new THREE.MeshStandardMaterial({ roughness: 1 }), n); let i = 0;
    for (let k = 0; k < 4; k++) { const p = q3(9.6, (45 + k * 90) * D2R); for (let j = 0; j < 16; j++) { const a = j * 2.4, r = 0.3 + 2.0 * Math.sqrt((j + 0.5) / 16); dummy.position.set(p.x + Math.cos(a) * r, 0.3, p.z + Math.sin(a) * r); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Rn(0.9, 1.4)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.setHex(FLOWER[(k + j) % FLOWER.length])); i++; } }
    city.add(im); }
  yield;
  // ---------- pagar tanaman bundar (4 pintu) + topiary ----------
  { const segs = [], gaps = [0, 90, 180, 270];
    for (let a = 0; a < 360; a += 4) { if (gaps.some(g => Math.abs(((a - g + 540) % 360) - 180) < 13)) continue; segs.push(a); }
    const hg = new THREE.InstancedMesh(box(1.4, 1.5, 4.1), hedgeM, segs.length), top = new THREE.InstancedMesh(box(1.0, 0.3, 3.9), hedgeDark, segs.length);
    segs.forEach((a, i) => { const th = a * D2R, p = q3(G3.hedgeR, th), ph = d3Face(-Math.sin(th), Math.cos(th));
      dummy.position.set(p.x, 0.75, p.z); dummy.rotation.set(0, -ph, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); hg.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 1.55; dummy.updateMatrix(); top.setMatrixAt(i, dummy.matrix); if (i % 2 === 0) col(p.x, p.z, 1.35); });
    hg.castShadow = hg.receiveShadow = top.castShadow = true; city.add(hg, top);
    for (const g0 of gaps) for (const sd of [-1, 1]) { const p = q3(G3.hedgeR, (g0 + sd * 15) * D2R); cone(city, p.x, p.z, 2.6, 0.9); col(p.x, p.z, 0.9); }
  }
  // ---------- air mancur, patung, lampu taman ----------
  { const g = new THREE.Group(); g.position.set(g3c.x, 0, g3c.z); city.add(g);
    mesh(cyl(3.9, 4.1, 0.9, 18), M.plinth, 0, 0.45, 0, g); mesh(new THREE.CircleGeometry(3.5, 24).rotateX(-Math.PI / 2), M.water, 0, 0.88, 0, g, false);
    mesh(cyl(0.6, 0.8, 1.8, 10), M.hall, 0, 1.8, 0, g); mesh(cyl(1.9, 0.7, 0.4, 14), M.hall, 0, 2.8, 0, g); mesh(cyl(0.22, 0.32, 1.6, 8), M.hall, 0, 3.8, 0, g); mesh(cyl(1.0, 0.3, 0.3, 12), M.hall, 0, 4.7, 0, g); mesh(new THREE.SphereGeometry(0.34, 8, 6), M.gold, 0, 5.1, 0, g, false);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; mesh(cyl(0.3, 0.3, 0.9, 8), M.hall, Math.cos(a) * 4.7, 0.45, Math.sin(a) * 4.7, g); mesh(new THREE.SphereGeometry(0.34, 8, 6), M.gold, Math.cos(a) * 4.7, 1.1, Math.sin(a) * 4.7, g, false); }
    col(g3c.x, g3c.z, 4.6); }
  for (let k = 0; k < 4; k++) { const th = (45 + k * 90) * D2R, p = q3(5.6, th); statue3(p.x, p.z, g3c.x, g3c.z); }
  for (let i = 0; i < 8; i++) { const th = (22.5 + i * 45) * D2R, p = q3(G3.r + 2.4, th); lamp(p.x, p.z); }
  yield;
  // ---------- gapura masuk Distrik 3 ----------
  { const u = RING.r + RING.w / 2 + 3.5, c = d3p(u, 0), g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = -144 * D2R; city.add(g);
    for (const sd of [-1, 1]) { mesh(box(1.5, 0.6, 1.5), M.plinth, 0, 0.3, sd * 7.2, g); mesh(box(1.0, 6.4, 1.0), M.hall, 0, 3.8, sd * 7.2, g); mesh(box(1.4, 0.4, 1.4), M.plinth, 0, 7.0, sd * 7.2, g); mesh(new THREE.ConeGeometry(0.7, 1.4, 4).rotateY(Math.PI / 4), M.gold, 0, 7.9, sd * 7.2, g); const q = d3p(u, sd * 7.2); col(q.x, q.z, 1.0); }
    mesh(box(0.9, 0.9, 15.6), M.hall, 0, 6.5, 0, g); mesh(box(0.5, 0.3, 15), M.gold, 0, 7.1, 0, g, false);
    plaque(g, 'NOBLE QUARTER', 'Distrik 3 · Kediaman', 0.5, 6.0, 0, 7.0, 1.7, Math.PI / 2); plaque(g, 'NOBLE QUARTER', 'Distrik 3 · Kediaman', -0.5, 6.0, 0, 7.0, 1.7, -Math.PI / 2);
    for (const sd of [-1, 1]) banner(g, 'crown', 0, 3.6, sd * 5.6, 1.3, 3.0, Math.PI / 2);
  }
  for (const u of [78, 88, 134]) for (const sd of [-1, 1]) { const p = d3p(u, sd * (D3.avenue.w / 2 + 0.9)); lamp(p.x, p.z); }
  for (const u of [83, 140]) for (const sd of [-1, 1]) { const p = d3p(u, sd * 8.2), t = d3p(u, 0); statue3(p.x, p.z, t.x, t.z); }
  yield;
  // ---------- jalur batu dari tiap kediaman ke taman / jalan ----------
  for (const b of [...D3.mansions, D3.buildings[1], D3.buildings[2]]) {
    const fx = Math.cos(b.face), fz = Math.sin(b.face), sx = b.x + fx * (b.d / 2 + 0.5), sz = b.z + fz * (b.d / 2 + 0.5), dx = g3c.x - sx, dz = g3c.z - sz, L = Math.hypot(dx, dz), t = Math.max(0, L - (G3.r + 0.5)) / L;
    if (L > G3.r + 1.5) decalStrip(sx, sz, sx + dx * t, sz + dz * t, 3, M.cobble, 5, 0.33);
  }
  // ---------- bangunan ----------
  const hedgeBox = (g, x, z, w = 3.2) => { mesh(box(w, 1.0, 1.2), hedgeM, x, 0.5, z, g); mesh(box(w - 0.4, 0.2, 1.0), hedgeDark, x, 1.05, z, g, false); };
  for (const b of D3.mansions) {
    const g = place(b.x, b.z, b.face), w = b.w, d = b.d, H = 6.8;
    const y0 = shell(g, w, d, H, 4.4, { wall: M.hall, roof: M.roofBlue, beams: false });
    door(g, d, y0, 2.1, 3.2); plaque(g, b.name.toUpperCase(), null, 0, y0 + 4.6, d / 2 + 0.1, 4.4, 0.8);
    for (const x of [-(w / 2 - 1.8), -(w / 2 - 5.0), w / 2 - 5.0, w / 2 - 1.8]) { if (Math.abs(x) < 2.6) continue; mesh(new THREE.PlaneGeometry(0.95, 1.3), M.window, x, y0 + H * 0.9, d / 2 + 0.07, g, false); }
    mesh(box(4.4, 0.2, 1.6), M.plinth, 0, y0 + 3.55, d / 2 + 0.8, g, false);   // balkon di atas pintu
    for (const sx of [-1, 1]) { mesh(box(0.14, 0.8, 1.6), M.plinth, sx * 2.1, y0 + 4.0, d / 2 + 0.8, g, false); mesh(cyl(0.12, 0.12, 3.5, 6), M.hall, sx * 2.0, y0 + 1.75, d / 2 + 1.5, g, false); }
    mesh(box(4.4, 0.08, 0.1), M.iron, 0, y0 + 4.45, d / 2 + 1.55, g, false);
    for (const sx of [-1, 1]) banner(g, 'crown', sx * (w / 2 - 1.0), y0 + 2.4, d / 2 + 0.14, 0.9, 2.1);
    hedgeBox(g, -4.6, d / 2 + 2.6); hedgeBox(g, 4.6, d / 2 + 2.6); cone(g, -7.0, d / 2 + 2.6, 1.9, 0.7); cone(g, 7.0, d / 2 + 2.6, 1.9, 0.7);
    if (b.variant === 0) { const t = new THREE.Group(); t.position.set(-w / 2 - 0.4, 0, d / 2 - 1.0); g.add(t); roundTower(t, 2.0, 9.6, 4.2, M.roofBlue); bcol(b, -w / 2 - 0.4, d / 2 - 1.0, 2.4); }
    else if (b.variant === 1) { for (const sx of [-1, 1]) { const t = new THREE.Group(); t.position.set(sx * (w / 2 + 0.3), 0, d / 2 - 0.8); g.add(t); roundTower(t, 1.5, 8.6, 3.6, M.roofBlue); bcol(b, sx * (w / 2 + 0.3), d / 2 - 0.8, 1.9); } }
    else { mesh(boxUV(5.2, 3.0, 1.6, 0.5), M.hall, 0, y0 + H + 1.5, d / 2 - 0.6, g); { const tri = new THREE.Shape(); tri.moveTo(-2.9, 0); tri.lineTo(2.9, 0); tri.lineTo(0, 2.0); mesh(new THREE.ShapeGeometry(tri), M.hall, 0, y0 + H + 3.0, d / 2 + 0.22, g, false); } }
    colRect(b);
  }
  { // Kediaman Adipati
    const b = D3.buildings[0], g = place(b.x, b.z, b.face), w = b.w, d = b.d;
    const y0 = shell(g, w, d, 8.4, 5.4, { wall: M.hall, roof: M.roofBlue, ov: 1.2, chimney: false, beams: false });
    mesh(boxUV(7.6, 15, 5.0, 0.5), M.hall, 0, 7.5, d / 2 + 1.5, g); mesh(box(8.4, 0.6, 5.8), M.plinth, 0, 15.2, d / 2 + 1.5, g);
    mesh(new THREE.ConeGeometry(5.4, 9, 4).rotateY(Math.PI / 4), M.roofBlue, 0, 20, d / 2 + 1.5, g); mesh(cyl(0.06, 0.06, 3.4, 5), M.gold, 0, 26, d / 2 + 1.5, g, false);
    mesh(extrude(doorShape(2.0, 3.6), 0.5, false), M.woodDark, 0, 0, d / 2 + 4.0, g, false); for (const y of [1.4, 3.2]) mesh(box(4.1, 0.16, 0.2), M.iron, 0, y, d / 2 + 4.1, g, false); mesh(box(0.14, 5.6, 0.2), M.iron, 0, 2.8, d / 2 + 4.12, g, false);
    for (const sd of [-1, 1]) mesh(box(0.7, 5.8, 0.7), M.plinth, sd * 2.5, 2.9, d / 2 + 4.1, g); mesh(box(5.8, 0.9, 0.9), M.plinth, 0, 5.9, d / 2 + 4.1, g);
    mesh(box(9.0, 0.5, 2.4), M.plinth, 0, 0.55, d / 2 + 5.1, g); mesh(box(7.6, 0.5, 1.8), M.plinth, 0, 0.25, d / 2 + 6.1, g);
    { const em = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), crownEmM); em.position.set(0, 10.8, d / 2 + 4.03); g.add(em); }
    plaque(g, 'KEDIAMAN ADIPATI', 'Noble Quarter', 0, 7.6, d / 2 + 4.05, 5.6, 1.3);
    for (const sd of [-1, 1]) {
      for (const zz of [d / 2 - 0.5, -d / 2 + 0.5]) { const t = new THREE.Group(); t.position.set(sd * (w / 2 + 0.4), 0, zz); g.add(t); roundTower(t, 2.4, 11, 4.6, M.roofBlue); bcol(b, sd * (w / 2 + 0.4), zz, 3.0); }
      banner(g, 'crown', sd * (w / 2 - 3.4), y0 + 4.2, d / 2 + 0.14, 1.2, 2.8); banner(g, 'crown', sd * 3.4, y0 + 6.4, d / 2 + 4.05, 1.0, 3.0);
      mesh(box(0.2, 0.3, 0.2), M.lantern, sd * 3.1, y0 + 2.4, d / 2 + 4.2, g, false);
      hedgeBox(g, sd * 8.0, d / 2 + 3.2, 4.4); cone(g, sd * 11.2, d / 2 + 3.2, 2.2, 0.8);
    }
    colRect(b, 0.4); bcol(b, 0, d / 2 + 1.5, 3.5);
  }
  { // Kapel Keluarga
    const b = D3.buildings[1], g = place(b.x, b.z, b.face), w = b.w, d = b.d, H = 6.2, rh = 4.4, y0 = 0.7;
    mesh(boxUV(w + 0.5, 0.7, d + 0.5, 0.5), M.plinth, 0, 0.35, 0, g); mesh(boxUV(w, H, d, 0.5), M.hall, 0, y0 + H / 2, 0, g);
    { const hx = w / 2 + 0.8, ang = Math.atan2(rh, hx), sl = Math.hypot(hx, rh);
      for (const e of [-1, 1]) { const s = mesh(boxUV(sl, 0.26, d + 1.2, 0.5), M.roofBlue, e * hx / 2, y0 + H + rh / 2 + 0.05, 0, g); s.rotation.z = -e * ang; }
      mesh(box(0.4, 0.22, d + 1.3), M.timber, 0, y0 + H + rh + 0.05, 0, g, false);
      for (const e of [-1, 1]) { const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, rh); const tg = new THREE.ShapeGeometry(tri); const t = mesh(tg, M.hall, 0, y0 + H, e * (d / 2 + 0.01), g, false); if (e < 0) t.rotation.y = Math.PI; } }
    for (const sx of [-1, 1]) for (let z = -d / 2 + 3; z < d / 2 - 2; z += 4) mesh(new THREE.PlaneGeometry(0.9, 2.8), M.window, sx * (w / 2 + 0.06), y0 + 3.6, z, g, false).rotation.y = sx * Math.PI / 2;
    mesh(boxUV(4.6, 12.5, 4.6, 0.5), M.hall, 0, 6.95, d / 2 + 0.3, g); mesh(box(5.2, 0.5, 5.2), M.plinth, 0, 13.4, d / 2 + 0.3, g);
    mesh(new THREE.ConeGeometry(3.4, 9.5, 4).rotateY(Math.PI / 4), M.roofBlue, 0, 18.4, d / 2 + 0.3, g); mesh(box(0.14, 2.2, 0.14), M.gold, 0, 24.3, d / 2 + 0.3, g, false); mesh(box(1.2, 0.14, 0.14), M.gold, 0, 24.7, d / 2 + 0.3, g, false);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) mesh(new THREE.PlaneGeometry(1.1, 2.6), M.window, Math.sin(a) * 2.32, 10.5, d / 2 + 0.3 + Math.cos(a) * 2.32, g, false).rotation.y = a;
    mesh(extrude(doorShape(1.4, 2.8), 0.5, false), M.woodDark, 0, 0, d / 2 + 2.62, g, false); for (const y of [1.2, 2.6]) mesh(box(2.9, 0.14, 0.2), M.iron, 0, y, d / 2 + 2.72, g, false);
    mesh(box(4.4, 0.4, 1.4), M.plinth, 0, 0.2, d / 2 + 3.3, g, false); mesh(box(3.6, 0.4, 0.8), M.plinth, 0, 0.55 - 0.35, d / 2 + 4.0, g, false);
    { const em = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), crownEmM); em.position.set(0, 5.6, d / 2 + 2.63); g.add(em); }
    plaque(g, 'KAPEL KELUARGA', null, 0, 7.6, d / 2 + 2.64, 3.8, 0.8);
    colRect(b); bcol(b, 0, d / 2 + 0.3, 2.8);
    for (let i = 0; i < 4; i++) { const sx = i < 2 ? -1 : 1, z = -2 + (i % 2) * 5; mesh(box(0.8, 1.2, 0.5), M.hall, sx * (w / 2 + 2.2), 0.6, z - d * 0.1, g); }   // batu nisan kecil
  }
  { // Rumah Kaca
    const b = D3.buildings[2], g = place(b.x, b.z, b.face), w = b.w, d = b.d, H = 3.4;
    mesh(boxUV(w + 0.4, 0.8, d + 0.4, 0.5), M.plinth, 0, 0.4, 0, g); mesh(box(w, H, d), glassM, 0, 0.8 + H / 2, 0, g, false);
    for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 7) for (const e of [-1, 1]) mesh(box(0.12, H, 0.12), M.iron, x, 0.8 + H / 2, e * d / 2, g, false);
    for (const e of [-1, 1]) { mesh(box(0.12, H, 0.12), M.iron, e * w / 2, 0.8 + H / 2, 0, g, false); mesh(box(w, 0.12, 0.12), M.iron, 0, 0.8 + H, e * d / 2, g, false); mesh(box(w, 0.1, 0.1), M.iron, 0, 0.8 + H / 2, e * d / 2, g, false); }
    { const rh = 2.2, hz = d / 2 + 0.3, ang = Math.atan2(rh, hz), sl = Math.hypot(hz, rh);
      for (const e of [-1, 1]) { const s = mesh(box(w + 0.4, 0.1, sl), glassM, 0, 0.8 + H + rh / 2, e * hz / 2, g, false); s.rotation.x = e * ang; for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 7) { const r = mesh(box(0.1, 0.1, sl), M.iron, x, 0.8 + H + rh / 2 + 0.06, e * hz / 2, g, false); r.rotation.x = e * ang; } }
      mesh(box(w + 0.4, 0.14, 0.2), M.iron, 0, 0.8 + H + rh, 0, g, false); }
    mesh(box(1.8, 2.6, 0.12), M.iron, 0, 0.8 + 1.3, d / 2 + 0.05, g, false); mesh(box(2.2, 0.3, 1.2), M.plinth, 0, 0.15, d / 2 + 0.9, g, false);
    plaque(g, 'RUMAH KACA', null, 0, 0.8 + H + 0.9, d / 2 + 0.1, 3.0, 0.62);
    for (let i = 0; i < 7; i++) { const x = -w / 2 + 1.2 + i * (w - 2.4) / 6, z = (i % 2 ? -1 : 1) * 1.4; mesh(cyl(0.3, 0.22, 0.5, 8), M.woodDark, x, 1.05, z, g, false); mesh(new THREE.SphereGeometry(0.75, 8, 6), hedgeM, x, 1.9, z, g, false); if (i % 3 === 0) mesh(new THREE.SphereGeometry(0.2, 6, 5), std(FLOWER[i % FLOWER.length]), x + 0.3, 2.5, z, g, false); }
    colRect(b);
  }
  yield;
  // ---------- pohon taman di ruang kosong ----------
  for (let n = 0, tries = 0; n < (COARSE ? 8 : 16) && tries < 900; tries++) {
    const p = d3p(Rn(76, 168), Rn(-90, 90)); if (!inD3(p.x, p.z, 3.5) || d3Blocked(p.x, p.z, 5)) continue;
    if (trees.some(t => Math.hypot(t.x - p.x, t.z - p.z) < 10)) continue; addTree(p.x, p.z, Rn(0.6, 0.9)); n++;
  }
  yield;
  // ======================================================================

  // ======================================================================
  //  DISTRIK 4 — ACADEMY QUARTER (alun-alun lingkaran sihir dengan kristal melayang, Aula Akademi, perpustakaan, asrama, laboratorium, menara penyihir, observatorium)
  //  Koordinat distrik (u, v) -> lokal kota lewat d4p(); arah depan bangunan dihitung di kekaisaran-layout.js (b.x, b.z, b.face).
  // ======================================================================
  const spin = [];
  const hallL = tm(T.stone, 0xcfc6e4), roofPur = tm(T.roof, 0x6b4aa6, { side: THREE.DoubleSide }), roofDeep = tm(T.roof, 0x4a3680, { side: THREE.DoubleSide });
  const crystalM = new THREE.MeshStandardMaterial({ color: 0xb98cff, emissive: 0x8a4aff, emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.92 });
  const glowGreen = new THREE.MeshStandardMaterial({ color: 0x7af0a0, emissive: 0x2fd070, emissiveIntensity: 1.3, roughness: 0.4 });
  const domeM = std(0x6f93b8, { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
  function starPath(x, cx, cy, R, n = 8, k = 0.5) { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, r = i % 2 ? R * k : R; x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); }
  const abannerMat = new THREE.MeshStandardMaterial({ map: ctex(128, (x, w, h) => { x.fillStyle = '#4a2f86'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d9b24a'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12); x.fillStyle = '#e7c862'; starPath(x, w / 2, h * 0.4, 36, 8, 0.45); x.fill(); x.fillStyle = '#4a2f86'; x.beginPath(); x.arc(w / 2, h * 0.4, 9, 0, 7); x.fill(); }, 128, 256), roughness: 1, side: THREE.DoubleSide });
  const abanner = (g, x, y, z, w, h, ry = 0) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), abannerMat); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; g.add(b); return b; };
  const aemM = new THREE.MeshStandardMaterial({ map: ctex(256, (x, s) => { x.fillStyle = '#4a2f86'; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill(); x.strokeStyle = '#d9b24a'; x.lineWidth = 10; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 12, 0, 7); x.stroke(); x.fillStyle = '#e7c862'; starPath(x, s / 2, s / 2, 86, 8, 0.45); x.fill(); x.fillStyle = '#4a2f86'; x.beginPath(); x.arc(s / 2, s / 2, 20, 0, 7); x.fill(); }), roughness: 1 });
  const arcaneTex = ctex(512, (x, s) => {
    const c = s / 2; x.fillStyle = '#251b40'; x.fillRect(0, 0, s, s); noise(x, s, 1500, 40, 90, 0.18);
    x.strokeStyle = '#c9a8ff'; x.fillStyle = '#c9a8ff'; x.lineCap = 'round';
    x.lineWidth = 7; for (const r of [c - 12, c * 0.78, c * 0.5, c * 0.2]) { x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); }
    x.lineWidth = 5; for (let k = 0; k < 2; k++) { x.save(); x.translate(c, c); x.rotate(k * Math.PI / 4); x.strokeRect(-c * 0.5 * 0.9, -c * 0.5 * 0.9, c * 0.9, c * 0.9); x.restore(); }
    x.lineWidth = 3; for (let i = 0; i < 36; i++) { const a = i * Math.PI / 18, r0 = c * 0.78, r1 = c - 12; x.beginPath(); x.moveTo(c + Math.cos(a) * (r0 + 6), c + Math.sin(a) * (r0 + 6)); x.lineTo(c + Math.cos(a) * (i % 3 ? r0 + 18 : r1 - 4), c + Math.sin(a) * (i % 3 ? r0 + 18 : r1 - 4)); x.stroke(); }
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.arc(c + Math.cos(a) * c * 0.64, c + Math.sin(a) * c * 0.64, 11, 0, 7); x.stroke(); starPath(x, c + Math.cos(a + Math.PI / 8) * c * 0.89, c + Math.sin(a + Math.PI / 8) * c * 0.89, 9, 4, 0.4); x.fill(); }
    x.lineWidth = 4; starPath(x, c, c, c * 0.46, 8, 0.55); x.stroke(); x.beginPath(); x.arc(c, c, c * 0.1, 0, 7); x.fill();
  });
  arcaneTex.wrapS = arcaneTex.wrapT = THREE.ClampToEdgeWrapping;
  const P4 = D4.plaza, p4c = d4p(P4.u, 0), PR4 = P4.r;
  const alamp = (x, z) => { const l = new THREE.Group(); l.position.set(x, 0, z); city.add(l); mesh(cyl(0.08, 0.12, 2.8, 6), M.iron, 0, 1.4, 0, l); mesh(cyl(0.2, 0.2, 0.1, 8), M.gold, 0, 2.85, 0, l, false); mesh(new THREE.ConeGeometry(0.2, 0.7, 5), crystalM, 0, 3.3, 0, l, false); mesh(new THREE.ConeGeometry(0.2, 0.4, 5).rotateX(Math.PI), crystalM, 0, 2.95, 0, l, false); col(x, z, 0.24); };
  const tipCrystal = (g, x, y, z, s = 1) => { mesh(new THREE.ConeGeometry(0.3 * s, 1.0 * s, 5), crystalM, x, y + 0.5 * s, z, g, false); };
  // ---------- lantai ----------
  { const a = d4p(D4.avenue.u0 - 2, 0), b = d4p(D4.avenue.u1, 0); decalStrip(a.x, a.z, b.x, b.z, D4.avenue.w, M.cobble, 4, 0.33); }
  decalDisc(p4c.x, p4c.z, PR4 + 1.4, M.cobble, 5, 0.33, 72);
  (() => { const g = new THREE.CircleGeometry(PR4, 72).rotateX(-Math.PI / 2); const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / (2 * PR4) + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / (2 * PR4); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.translate(p4c.x, 0, p4c.z);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: arcaneTex, emissiveMap: arcaneTex, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })); m.position.y = 0.02 + 8 * 0.004; m.receiveShadow = true; city.add(m); })();
  yield;
  // ---------- kristal melayang di tengah lingkaran sihir + empat pilar ----------
  { const g = new THREE.Group(); g.position.set(p4c.x, 0, p4c.z); city.add(g);
    mesh(cyl(2.6, 2.9, 0.6, 14), M.plinth, 0, 0.3, 0, g); mesh(cyl(1.7, 1.9, 0.5, 14), M.hall, 0, 0.85, 0, g); mesh(cyl(0.5, 0.7, 1.4, 8), M.plinth, 0, 1.8, 0, g);
    const cg = new THREE.Group(); cg.position.set(0, 5.2, 0); g.add(cg); mesh(new THREE.ConeGeometry(1.2, 2.8, 6), crystalM, 0, 1.4, 0, cg, false); mesh(new THREE.ConeGeometry(1.2, 1.8, 6).rotateX(Math.PI), crystalM, 0, -0.9, 0, cg, false);
    spin.push({ m: cg, y: 5.2, k: 0.6 }); col(p4c.x, p4c.z, 3.0); }
  for (let k = 0; k < 4; k++) { const th = (45 + k * 90) * D2R, p = d4p(P4.u + 11.2 * Math.cos(th), 11.2 * Math.sin(th)), g = new THREE.Group(); g.position.set(p.x, 0, p.z); city.add(g);
    mesh(box(1.3, 0.5, 1.3), M.plinth, 0, 0.25, 0, g); mesh(box(0.8, 3.2, 0.8), M.hall, 0, 2.1, 0, g); mesh(box(1.1, 0.25, 1.1), M.gold, 0, 3.8, 0, g, false); tipCrystal(g, 0, 3.9, 0, 1.5); col(p.x, p.z, 0.9); }
  for (let i = 0; i < 12; i++) { if ([0, 5, 6, 11].includes(i)) continue; const a = (15 + i * 30) * D2R, p = d4p(P4.u + 21.8 * Math.cos(a), 21.8 * Math.sin(a)); alamp(p.x, p.z); }
  for (const u of [78, 88, 134]) for (const sd of [-1, 1]) { const p = d4p(u, sd * (D4.avenue.w / 2 + 0.9)); alamp(p.x, p.z); }
  yield;
  // ---------- gapura masuk Distrik 4 ----------
  { const u = RING.r + RING.w / 2 + 3.5, c = d4p(u, 0), g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = -216 * D2R; city.add(g);
    for (const sd of [-1, 1]) { mesh(box(1.5, 0.6, 1.5), M.plinth, 0, 0.3, sd * 7.2, g); mesh(box(1.0, 6.6, 1.0), hallL, 0, 3.9, sd * 7.2, g); mesh(box(1.4, 0.4, 1.4), M.plinth, 0, 7.2, sd * 7.2, g); tipCrystal(g, 0, 7.4, sd * 7.2, 2.2); const q = d4p(u, sd * 7.2); col(q.x, q.z, 1.0); }
    mesh(box(0.9, 0.9, 15.6), hallL, 0, 6.6, 0, g); mesh(box(0.5, 0.3, 15), M.gold, 0, 7.2, 0, g, false);
    plaque(g, 'ACADEMY QUARTER', 'Distrik 4 · Akademi', 0.5, 6.1, 0, 7.0, 1.7, Math.PI / 2); plaque(g, 'ACADEMY QUARTER', 'Distrik 4 · Akademi', -0.5, 6.1, 0, 7.0, 1.7, -Math.PI / 2);
    for (const sd of [-1, 1]) abanner(g, 0, 3.6, sd * 5.6, 1.3, 3.0, Math.PI / 2);
  }
  // ---------- jalur batu dari tiap bangunan ke alun-alun ----------
  for (const b of [...D4.halls, D4.buildings[1], D4.buildings[2]]) {
    const fx = Math.cos(b.face), fz = Math.sin(b.face), sx = b.x + fx * (b.d / 2 + 0.5), sz = b.z + fz * (b.d / 2 + 0.5), dx = p4c.x - sx, dz = p4c.z - sz, L = Math.hypot(dx, dz), t = Math.max(0, L - (PR4 + 0.5)) / L;
    if (L > PR4 + 1.5) decalStrip(sx, sz, sx + dx * t, sz + dz * t, 3, M.cobble, 5, 0.33);
  }
  yield;
  // ---------- bangunan ----------
  const acadFacade = (g, b, y0, H, { rows = true, banners = true } = {}) => {
    const w = b.w, d = b.d; door(g, d, y0, 2.0, 3.0); plaque(g, b.name.toUpperCase(), null, 0, y0 + 4.4, d / 2 + 0.1, 4.6, 0.8);
    if (rows) for (const x of [-(w / 2 - 1.8), -(w / 2 - 5.0), w / 2 - 5.0, w / 2 - 1.8]) { if (Math.abs(x) < 2.8) continue; mesh(new THREE.PlaneGeometry(0.9, 1.5), M.window, x, y0 + H * 0.87, d / 2 + 0.07, g, false); mesh(new THREE.PlaneGeometry(0.9, 1.3), M.window, x, y0 + H * 0.3, d / 2 + 0.07, g, false); }
    if (banners) for (const sx of [-1, 1]) abanner(g, sx * (w / 2 - 1.0), y0 + 2.5, d / 2 + 0.14, 0.9, 2.1);
    mesh(box(4.0, 0.4, 1.4), M.plinth, 0, 0.2, d / 2 + 0.9, g, false);
  };
  for (const b of D4.halls) {
    const g = place(b.x, b.z, b.face), w = b.w, d = b.d;
    if (b.kind === 'dorm') {
      const H = 8.4, y0 = shell(g, w, d, H, 4.2, { wall: hallL, roof: roofPur, beams: false }); acadFacade(g, b, y0, H);
      const t = new THREE.Group(); t.position.set(w / 2 + 0.3, 0, -d / 2 + 1.0); g.add(t); roundTower(t, 1.8, 10.4, 3.8, roofPur); bcol(b, w / 2 + 0.3, -d / 2 + 1.0, 2.2);
    } else if (b.kind === 'library') {
      const H = 7.6, y0 = shell(g, w, d, H, 4.6, { wall: hallL, roof: roofPur, beams: false });
      mesh(boxUV(7.0, H + 0.4, 2.0, 0.5), hallL, 0, 0.7 + (H + 0.4) / 2 - 0.7 + 0.7, d / 2 + 0.4, g);
      { const tri = new THREE.Shape(); tri.moveTo(-3.5, 0); tri.lineTo(3.5, 0); tri.lineTo(0, 3.0); mesh(new THREE.ShapeGeometry(tri), hallL, 0, y0 + H + 0.4, d / 2 + 1.41, g, false); }
      mesh(new THREE.CircleGeometry(1.2, 20), M.window, 0, y0 + H + 1.3, d / 2 + 1.43, g, false);
      mesh(extrude(doorShape(1.7, 3.2), 0.5, false), M.woodDark, 0, 0, d / 2 + 1.4, g, false); mesh(box(0.14, 3.2, 0.2), M.iron, 0, 1.6, d / 2 + 1.92, g, false);
      for (const sx of [-1, 1]) { const t = new THREE.Group(); t.position.set(sx * (w / 2 + 0.2), 0, d / 2 - 0.6); g.add(t); roundTower(t, 1.6, 10.6, 4.0, roofPur); bcol(b, sx * (w / 2 + 0.2), d / 2 - 0.6, 2.0); abanner(g, sx * 5.2, y0 + 3.0, d / 2 + 0.14, 1.0, 2.4); }
      mesh(box(5.4, 0.4, 2.0), M.plinth, 0, 0.2, d / 2 + 2.3, g, false); plaque(g, 'PERPUSTAKAAN AGUNG', null, 0, y0 + 5.2, d / 2 + 1.42, 4.6, 0.8);
      for (const sx of [-1, 1]) for (const z of [-2, 2]) mesh(new THREE.PlaneGeometry(0.9, 2.2), M.window, sx * (w / 2 + 0.06), y0 + 3.6, z, g, false).rotation.y = sx * Math.PI / 2;
    } else if (b.kind === 'lecture') {
      const H = 6.8, y0 = shell(g, w, d, H, 4.0, { wall: hallL, roof: roofPur, beams: false, windows: false });
      for (let i = 0; i < 4; i++) { const x = -2.7 + i * 1.8; mesh(cyl(0.38, 0.42, 4.8, 10), M.plinth, x, y0 + 2.4, d / 2 + 1.5, g); mesh(box(1.0, 0.3, 1.0), M.plinth, x, y0 + 4.95, d / 2 + 1.5, g, false); bcol(b, x, d / 2 + 1.5, 0.5); }
      mesh(box(7.6, 0.5, 2.6), M.plinth, 0, y0 + 5.25, d / 2 + 1.4, g);
      { const tri = new THREE.Shape(); tri.moveTo(-3.8, 0); tri.lineTo(3.8, 0); tri.lineTo(0, 1.7); mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false }), hallL, 0, y0 + 5.5, d / 2 + 2.4, g); }
      door(g, d, y0, 1.9, 3.0); for (const sx of [-1, 1]) for (const x of [w / 2 - 1.6, w / 2 - 4.4]) mesh(new THREE.PlaneGeometry(0.9, 1.7), M.window, sx * x, y0 + 3.4, d / 2 + 0.07, g, false);
      plaque(g, 'RUANG KULIAH', null, 0, y0 + 4.1, d / 2 + 0.1, 3.4, 0.78); mesh(box(7.4, 0.5, 1.6), M.plinth, 0, 0.25, d / 2 + 2.9, g, false);
      { const em = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), aemM); em.position.set(0, y0 + 5.0, d / 2 + 2.72); g.add(em); }
    } else if (b.kind === 'lab') {
      const H = 6.2, y0 = shell(g, w, d, H, 3.6, { wall: hallL, roof: roofDeep, beams: false, chimney: false }); acadFacade(g, b, y0, H, { banners: false });
      for (const sx of [-1, 1]) { const cx = sx * 3.4; mesh(box(1.0, 3.6, 1.0), M.plinth, cx, y0 + H + 2.6, -1.0, g); mesh(box(1.3, 0.25, 1.3), M.plinth, cx, y0 + H + 4.5, -1.0, g, false); mesh(new THREE.SphereGeometry(0.42, 8, 6), glowGreen, cx, y0 + H + 5.0, -1.0, g, false); }
      { const cx = w / 2 - 1.8, cz = d / 2 + 1.8; mesh(cyl(0.9, 0.7, 0.9, 10), M.iron, cx, 0.5, cz, g); mesh(new THREE.CircleGeometry(0.78, 10).rotateX(-Math.PI / 2), glowGreen, cx, 0.97, cz, g, false); bcol(b, cx, cz, 1.0); }
      crate(g, -w / 2 + 1.6, 0, d / 2 + 1.3, 0.9); barrel(g, -w / 2 + 2.6, d / 2 + 1.1);
      mesh(new THREE.SphereGeometry(0.34, 8, 6), glowGreen, -4.2, y0 + 4.4, d / 2 + 0.3, g, false); mesh(cyl(0.12, 0.14, 0.4, 6), M.iron, -4.2, y0 + 4.7, d / 2 + 0.3, g, false);
    } else if (b.kind === 'rector') {
      const H = 7.2, y0 = shell(g, w, d, H, 4.4, { wall: hallL, roof: roofPur, beams: false }); acadFacade(g, b, y0, H);
      const t = new THREE.Group(); t.position.set(-w / 2 - 0.3, 0, d / 2 - 1.0); g.add(t); roundTower(t, 2.1, 12.4, 5.2, roofPur); bcol(b, -w / 2 - 0.3, d / 2 - 1.0, 2.5);
      mesh(box(4.4, 0.2, 1.6), M.plinth, 0, y0 + 3.55, d / 2 + 0.8, g, false); for (const sx of [-1, 1]) mesh(cyl(0.12, 0.12, 3.5, 6), hallL, sx * 2.0, y0 + 1.75, d / 2 + 1.5, g, false);
      mesh(box(4.4, 0.08, 0.1), M.iron, 0, y0 + 4.05, d / 2 + 1.55, g, false);
    }
    colRect(b);
  }
  { // Aula Akademi
    const b = D4.buildings[0], g = place(b.x, b.z, b.face), w = b.w, d = b.d;
    const y0 = shell(g, w, d, 8.4, 5.4, { wall: hallL, roof: roofPur, ov: 1.2, chimney: false, beams: false });
    mesh(boxUV(7.6, 16, 5.0, 0.5), hallL, 0, 8, d / 2 + 1.5, g); mesh(box(8.4, 0.6, 5.8), M.plinth, 0, 16.2, d / 2 + 1.5, g);
    mesh(new THREE.ConeGeometry(5.4, 10, 4).rotateY(Math.PI / 4), roofPur, 0, 21.5, d / 2 + 1.5, g); mesh(cyl(0.06, 0.06, 3.0, 5), M.gold, 0, 27.5, d / 2 + 1.5, g, false); tipCrystal(g, 0, 28.0, d / 2 + 1.5, 2.2);
    mesh(extrude(doorShape(2.0, 3.6), 0.5, false), M.woodDark, 0, 0, d / 2 + 4.0, g, false); for (const y of [1.4, 3.2]) mesh(box(4.1, 0.16, 0.2), M.iron, 0, y, d / 2 + 4.1, g, false); mesh(box(0.14, 5.6, 0.2), M.iron, 0, 2.8, d / 2 + 4.12, g, false);
    for (const sd of [-1, 1]) mesh(box(0.7, 5.8, 0.7), M.plinth, sd * 2.5, 2.9, d / 2 + 4.1, g); mesh(box(5.8, 0.9, 0.9), M.plinth, 0, 5.9, d / 2 + 4.1, g);
    mesh(box(9.0, 0.5, 2.4), M.plinth, 0, 0.55, d / 2 + 5.1, g); mesh(box(7.6, 0.5, 1.8), M.plinth, 0, 0.25, d / 2 + 6.1, g);
    { const em = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), aemM); em.position.set(0, 11.2, d / 2 + 4.03); g.add(em); }
    mesh(new THREE.CircleGeometry(1.0, 20), M.window, 0, 13.8, d / 2 + 4.03, g, false);
    plaque(g, 'AULA AKADEMI', 'Academy Quarter', 0, 7.7, d / 2 + 4.05, 5.2, 1.3);
    for (const sd of [-1, 1]) {
      for (const zz of [d / 2 - 0.5, -d / 2 + 0.5]) { const t = new THREE.Group(); t.position.set(sd * (w / 2 + 0.4), 0, zz); g.add(t); roundTower(t, 2.4, 11, 4.8, roofPur); tipCrystal(t, 0, 11 + 4.8 + 0.1, 0, 1.6); bcol(b, sd * (w / 2 + 0.4), zz, 3.0); }
      abanner(g, sd * (w / 2 - 3.4), y0 + 4.2, d / 2 + 0.14, 1.2, 2.8); abanner(g, sd * 3.4, y0 + 6.4, d / 2 + 4.05, 1.0, 3.0);
      mesh(box(0.2, 0.3, 0.2), M.lantern, sd * 3.1, y0 + 2.4, d / 2 + 4.2, g, false);
      for (const x of [sd * 7.5]) mesh(new THREE.PlaneGeometry(1.0, 2.6), M.window, x, y0 + 3.6, d / 2 + 0.07, g, false);
    }
    colRect(b, 0.4); bcol(b, 0, d / 2 + 1.5, 3.5);
  }
  { // Menara Penyihir
    const b = D4.buildings[1], g = place(b.x, b.z, b.face), w = b.w, d = b.d, tz = -3;
    const t = new THREE.Group(); t.position.set(0, 0, tz); g.add(t); roundTower(t, 3.6, 18, 8.5, roofPur);
    mesh(cyl(4.7, 4.7, 0.4, 16), M.plinth, 0, 12.2, tz, g); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; mesh(box(0.14, 0.9, 0.14), M.iron, Math.cos(a) * 4.5, 12.85, tz + Math.sin(a) * 4.5, g, false); }
    for (const y of [5.5, 9, 15]) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; mesh(new THREE.PlaneGeometry(0.8, 1.5), M.window, Math.sin(a) * 3.64, y, tz + Math.cos(a) * 3.64, g, false).rotation.y = a; }
    { const cg = new THREE.Group(); cg.position.set(0, 29.5, tz); g.add(cg); mesh(new THREE.ConeGeometry(0.9, 2.2, 6), crystalM, 0, 1.1, 0, cg, false); mesh(new THREE.ConeGeometry(0.9, 1.4, 6).rotateX(Math.PI), crystalM, 0, -0.7, 0, cg, false); spin.push({ m: cg, y: 29.5, k: 0.9 }); }
    const a = new THREE.Group(); a.position.set(0, 0, 4); g.add(a); const ya = shell(a, 7, 6, 4.4, 2.4, { wall: hallL, roof: roofPur, windows: false, chimney: false, beams: false });
    door(a, 6, ya, 1.6, 2.6); plaque(a, 'MENARA PENYIHIR', null, 0, ya + 3.6, 3.1, 4.4, 0.78); abanner(a, 2.6, ya + 2.0, 3.14, 0.8, 1.8); abanner(a, -2.6, ya + 2.0, 3.14, 0.8, 1.8);
    colRect(b); bcol(b, 0, tz, 4.4); bcol(b, 0, 4, 3.4);
  }
  { // Observatorium
    const b = D4.buildings[2], g = place(b.x, b.z, b.face), w = b.w, d = b.d, H = 4.8, y0 = 0.7;
    mesh(boxUV(w + 0.4, 0.7, d + 0.4, 0.5), M.plinth, 0, 0.35, 0, g); mesh(boxUV(w, H, d, 0.5), hallL, 0, y0 + H / 2, 0, g); mesh(box(w + 0.5, 0.3, d + 0.5), M.plinth, 0, y0 + H + 0.15, 0, g, false);
    for (let i = 0; i < 9; i++) { const x = -w / 2 + 0.5 + i * (w - 1) / 8; for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) mesh(box(0.6, 0.6, 0.5), M.plinth, x, y0 + H + 0.6, z, g, false); }
    mesh(cyl(4.3, 4.5, 1.3, 20), hallL, 0, y0 + H + 0.9, 0, g); mesh(new THREE.SphereGeometry(4.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeM, 0, y0 + H + 1.55, 0, g);
    mesh(box(1.0, 4.2, 0.5), M.woodDark, 0, y0 + H + 3.6, 3.0, g, false).rotation.x = -0.72;
    { const tel = mesh(cyl(0.28, 0.4, 4.6, 8), M.iron, 0, y0 + H + 5.1, 4.2, g, false); tel.rotation.x = -1.0; mesh(cyl(0.2, 0.2, 0.2, 8), M.gold, 0, y0 + H + 6.9, 6.0, g, false).rotation.x = -1.0; }
    for (const sx of [-1, 1]) for (const x of [w / 2 - 1.6]) mesh(new THREE.PlaneGeometry(0.9, 1.7), M.window, sx * x, y0 + 2.6, d / 2 + 0.07, g, false);
    door(g, d, y0, 1.8, 2.8); plaque(g, 'OBSERVATORIUM', null, 0, y0 + 3.9, d / 2 + 0.1, 3.4, 0.7); mesh(box(3.4, 0.4, 1.2), M.plinth, 0, 0.2, d / 2 + 0.8, g, false);
    colRect(b); bcol(b, 0, 0, 4.6);
  }
  yield;
  // ---------- pohon di ruang kosong ----------
  for (let n = 0, tries = 0; n < (COARSE ? 6 : 12) && tries < 900; tries++) {
    const p = d4p(Rn(76, 168), Rn(-90, 90)); if (!inD4(p.x, p.z, 3.5) || d4Blocked(p.x, p.z, 5)) continue;
    if (trees.some(t => Math.hypot(t.x - p.x, t.z - p.z) < 10)) continue; addTree(p.x, p.z, Rn(0.6, 0.85)); n++;
  }
  yield;
  // ======================================================================

  // ======================================================================
  //  DISTRIK 5 — ADMINISTRATION QUARTER (alun-alun sipil berkolonade dengan tugu timbangan, Balai Kekaisaran berkubah, perbendaharaan, arsip, pencatatan sipil, pengadilan, kantor pos, kantor pengawas, menara jam, balai kesehatan)
  //  Koordinat distrik (u, v) -> lokal kota lewat d5p(); arah depan bangunan dihitung di kekaisaran-layout.js (b.x, b.z, b.face).
  // ======================================================================
  const P5 = D5.plaza, p5c = d5p(P5.u, 0), PR5 = P5.r;
  const civicTex = ctex(512, (x, s) => {
    const c = s / 2; x.fillStyle = '#cfc6b0'; x.fillRect(0, 0, s, s); noise(x, s, 1500, 90, 150, 0.14);
    x.strokeStyle = '#8a7440'; x.fillStyle = '#8a7440'; x.lineCap = 'round';
    x.lineWidth = 8; for (const r of [c - 12, c * 0.7, c * 0.3]) { x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); }
    x.lineWidth = 5; starPath(x, c, c, c * 0.7, 8, 0.28); x.stroke(); x.lineWidth = 3; for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16, r0 = c * 0.7, r1 = c - 12; x.beginPath(); x.moveTo(c + Math.cos(a) * (r0 + 8), c + Math.sin(a) * (r0 + 8)); x.lineTo(c + Math.cos(a) * (i % 4 ? r0 + 22 : r1 - 4), c + Math.sin(a) * (i % 4 ? r0 + 22 : r1 - 4)); x.stroke(); }
  });
  civicTex.wrapS = civicTex.wrapT = THREE.ClampToEdgeWrapping;
  const clockMat = new THREE.MeshStandardMaterial({ map: ctex(256, (x, s) => {
    const c = s / 2; x.fillStyle = '#d9b24a'; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill(); x.fillStyle = '#f3ead0'; x.beginPath(); x.arc(c, c, c - 14, 0, 7); x.fill();
    x.strokeStyle = '#2a2a2a'; x.lineCap = 'round'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.lineWidth = i % 3 ? 4 : 8; x.beginPath(); x.moveTo(c + Math.cos(a) * (c - 34), c + Math.sin(a) * (c - 34)); x.lineTo(c + Math.cos(a) * (c - 50), c + Math.sin(a) * (c - 50)); x.stroke(); }
    x.lineWidth = 9; x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(-2.6) * c * 0.5, c + Math.sin(-2.6) * c * 0.5); x.stroke(); x.lineWidth = 6; x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(-1.05) * c * 0.72, c + Math.sin(-1.05) * c * 0.72); x.stroke();
    x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc(c, c, 8, 0, 7); x.fill(); }), roughness: 0.8 });
  const crossEmM = new THREE.MeshStandardMaterial({ map: ctex(256, (x, s) => { x.fillStyle = '#3a9a5a'; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill(); x.fillStyle = '#f4f1e6'; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 14, 0, 7); x.fill(); x.fillStyle = '#3a9a5a'; x.fillRect(s / 2 - 22, s * 0.2, 44, s * 0.6); x.fillRect(s * 0.2, s / 2 - 22, s * 0.6, 44); }), roughness: 1 });
  const columnAt = (g, x, y, z, h, r = 0.4) => { mesh(box(r * 2.6, 0.3, r * 2.6), M.plinth, x, y + 0.15, z, g, false); mesh(cyl(r * 0.9, r, h, 10), M.hall, x, y + 0.3 + h / 2, z, g); mesh(box(r * 2.5, 0.3, r * 2.5), M.plinth, x, y + 0.3 + h + 0.15, z, g, false); };
  // ---------- lantai ----------
  { const a = d5p(D5.avenue.u0 - 2, 0), b = d5p(D5.avenue.u1, 0); decalStrip(a.x, a.z, b.x, b.z, D5.avenue.w, M.cobble, 4, 0.33); }
  decalDisc(p5c.x, p5c.z, PR5 + 1.4, M.cobble, 5, 0.33, 72);
  (() => { const g = new THREE.CircleGeometry(PR5, 72).rotateX(-Math.PI / 2); const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / (2 * PR5) + 0.5; uv[i * 2 + 1] = 0.5 - p.getZ(i) / (2 * PR5); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.translate(p5c.x, 0, p5c.z);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: civicTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })); m.position.y = 0.02 + 8 * 0.004; m.receiveShadow = true; city.add(m); })();
  yield;
  // ---------- tugu timbangan di tengah + kolonade + tiang bendera ----------
  { const g = new THREE.Group(); g.position.set(p5c.x, 0, p5c.z); city.add(g);
    mesh(cyl(3.6, 3.9, 0.4, 16), M.plinth, 0, 0.2, 0, g); mesh(cyl(2.9, 3.2, 0.4, 16), M.plinth, 0, 0.6, 0, g); mesh(cyl(2.2, 2.5, 0.5, 16), M.hall, 0, 1.05, 0, g);
    mesh(cyl(0.95, 1.15, 8.4, 12), M.hall, 0, 5.5, 0, g); mesh(cyl(1.35, 1.0, 0.5, 12), M.plinth, 0, 9.95, 0, g);
    mesh(cyl(0.12, 0.16, 1.4, 6), M.gold, 0, 10.9, 0, g, false); mesh(box(3.4, 0.12, 0.12), M.gold, 0, 11.6, 0, g, false);
    for (const sd of [-1, 1]) { mesh(cyl(0.6, 0.45, 0.1, 12), M.gold, sd * 1.65, 10.7, 0, g, false); for (const k of [-0.35, 0.35]) mesh(cyl(0.015, 0.015, 0.9, 4), M.gold, sd * 1.65 + k, 11.15, 0, g, false); }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; mesh(cyl(0.3, 0.3, 0.9, 8), M.hall, Math.cos(a) * 3.3, 1.5, Math.sin(a) * 3.3, g); mesh(new THREE.SphereGeometry(0.3, 8, 6), M.gold, Math.cos(a) * 3.3, 2.1, Math.sin(a) * 3.3, g, false); }
    col(p5c.x, p5c.z, 3.8); }
  for (let k = 0; k < 24; k++) {
    if (k % 6 === 0) continue;   // 4 pintu: sumbu u dan v
    const th = k * 15 * D2R, p = d5p(P5.u + P5.colR * Math.cos(th), P5.colR * Math.sin(th)), g = new THREE.Group(); g.position.set(p.x, 0, p.z); city.add(g); columnAt(g, 0, 0, 0, 3.6); col(p.x, p.z, 0.55);
    const nk = (k + 1) % 24; if (nk % 6 !== 0) { const th2 = nk * 15 * D2R, p2 = d5p(P5.u + P5.colR * Math.cos(th2), P5.colR * Math.sin(th2)), mx = (p.x + p2.x) / 2, mz = (p.z + p2.z) / 2, len = Math.hypot(p2.x - p.x, p2.z - p.z); const ar = mesh(box(len + 0.2, 0.5, 0.6), M.plinth, mx, 4.5, mz, city); ar.rotation.y = -Math.atan2(p2.z - p.z, p2.x - p.x); }
  }
  for (let k = 0; k < 4; k++) { const th = (45 + k * 90) * D2R, p = d5p(P5.u + 8.2 * Math.cos(th), 8.2 * Math.sin(th)), g = new THREE.Group(); g.position.set(p.x, 0, p.z); city.add(g);
    mesh(box(0.9, 0.4, 0.9), M.plinth, 0, 0.2, 0, g); mesh(cyl(0.07, 0.1, 7.6, 6), M.iron, 0, 4.2, 0, g, false); mesh(new THREE.SphereGeometry(0.14, 6, 5), M.gold, 0, 8.1, 0, g, false);
    banner(g, 'crown', 0.7, 6.4, 0, 1.3, 1.8); banner(g, 'crown', 0.7, 6.4, 0.001, 1.3, 1.8, Math.PI); col(p.x, p.z, 0.4); }
  for (let i = 0; i < 12; i++) { if ([0, 5, 6, 11].includes(i)) continue; const a = (15 + i * 30) * D2R, p = d5p(P5.u + 21.8 * Math.cos(a), 21.8 * Math.sin(a)); lamp(p.x, p.z); }
  for (const u of [78, 88, 134]) for (const sd of [-1, 1]) { const p = d5p(u, sd * (D5.avenue.w / 2 + 0.9)); lamp(p.x, p.z); }
  yield;
  // ---------- gapura masuk Distrik 5 ----------
  { const u = RING.r + RING.w / 2 + 3.5, c = d5p(u, 0), g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = -288 * D2R; city.add(g);
    for (const sd of [-1, 1]) { mesh(box(1.5, 0.6, 1.5), M.plinth, 0, 0.3, sd * 7.2, g); mesh(box(1.0, 6.4, 1.0), M.hall, 0, 3.8, sd * 7.2, g); mesh(box(1.4, 0.4, 1.4), M.plinth, 0, 7.0, sd * 7.2, g); mesh(box(0.2, 1.6, 0.2), M.gold, 0, 8.0, sd * 7.2, g, false); mesh(box(1.0, 0.2, 0.2), M.gold, 0, 8.4, sd * 7.2, g, false); const q = d5p(u, sd * 7.2); col(q.x, q.z, 1.0); }
    mesh(box(0.9, 0.9, 15.6), M.hall, 0, 6.5, 0, g); mesh(box(0.5, 0.3, 15), M.gold, 0, 7.1, 0, g, false);
    plaque(g, 'ADMINISTRATION QUARTER', 'Distrik 5 · Pemerintahan', 0.5, 6.0, 0, 7.4, 1.7, Math.PI / 2); plaque(g, 'ADMINISTRATION QUARTER', 'Distrik 5 · Pemerintahan', -0.5, 6.0, 0, 7.4, 1.7, -Math.PI / 2);
    for (const sd of [-1, 1]) banner(g, 'crown', 0, 3.6, sd * 5.6, 1.3, 3.0, Math.PI / 2);
  }
  for (const b of [...D5.halls, D5.buildings[1], D5.buildings[2]]) {
    const fx = Math.cos(b.face), fz = Math.sin(b.face), sx = b.x + fx * (b.d / 2 + 0.5), sz = b.z + fz * (b.d / 2 + 0.5), dx = p5c.x - sx, dz = p5c.z - sz, L = Math.hypot(dx, dz), t = Math.max(0, L - (PR5 + 0.5)) / L;
    if (L > PR5 + 1.5) decalStrip(sx, sz, sx + dx * t, sz + dz * t, 3, M.cobble, 5, 0.33);
  }
  yield;
  // ---------- bangunan ----------
  const portico = (b, g, y0, n, sp, h, pw) => {   // portico bertiang + entablatur + pediment
    const d = b.d, zc = d / 2 + 1.5;
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * sp; columnAt(g, x, 0, zc, h, 0.4); bcol(b, x, zc, 0.5); }
    mesh(box(pw, 0.6, 2.6), M.plinth, 0, y0 + h + 0.55, zc - 0.1, g);
    const tri = new THREE.Shape(); tri.moveTo(-pw / 2, 0); tri.lineTo(pw / 2, 0); tri.lineTo(0, pw * 0.17); mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false }), M.hall, 0, y0 + h + 0.85, zc + 0.9, g);
    mesh(box(pw - 0.4, 0.4, 1.4), M.plinth, 0, 0.2, zc + 2.0, g, false);
  };
  for (const b of D5.halls) {
    const g = place(b.x, b.z, b.face), w = b.w, d = b.d;
    if (b.kind === 'treasury') {
      const y0 = shell(g, w, d, 5.8, 3.6, { wall: M.hall, roof: M.roofDark, windows: false, chimney: false, beams: false }); portico(b, g, y0, 4, 1.8, 4.6, 7.6); door(g, d, y0, 1.9, 3.0);
      for (const sx of [-1, 1]) { mesh(new THREE.PlaneGeometry(0.9, 1.3), M.window, sx * (w / 2 - 2.0), y0 + 2.4, d / 2 + 0.07, g, false); for (let k = -1; k <= 1; k++) mesh(box(0.06, 1.3, 0.06), M.iron, sx * (w / 2 - 2.0) + k * 0.28, y0 + 2.4, d / 2 + 0.12, g, false); }
      { const em = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), emblemM.map ? new THREE.MeshStandardMaterial({ map: emblemM.map, roughness: 1 }) : emblemM); em.position.set(0, y0 + 5.6, d / 2 + 2.45); g.add(em); }
      plaque(g, 'PERBENDAHARAAN', null, 0, y0 + 4.1, d / 2 + 0.1, 3.6, 0.78);
    } else if (b.kind === 'archive') {
      const H = 7.8, y0 = shell(g, w, d, H, 3.8, { wall: M.wall, roof: M.roofDark, windows: false, beams: false }); door(g, d, y0, 2.0, 3.0); plaque(g, 'ARSIP KEKAISARAN', null, 0, y0 + 4.4, d / 2 + 0.1, 4.4, 0.8);
      for (const x of [-6, -3.4, 3.4, 6]) for (const y of [2.4, 5.4]) mesh(new THREE.PlaneGeometry(0.7, 1.9), M.window, x, y0 + y, d / 2 + 0.07, g, false);
      for (const sx of [-1, 1]) { const t = new THREE.Group(); t.position.set(sx * (w / 2 + 0.2), 0, d / 2 - 0.6); g.add(t); roundTower(t, 1.5, 9.8, 3.8, M.roofBlue); bcol(b, sx * (w / 2 + 0.2), d / 2 - 0.6, 1.9); banner(g, 'crown', sx * 4.6, y0 + 3.0, d / 2 + 0.14, 0.9, 2.2); }
      mesh(box(4.0, 0.4, 1.4), M.plinth, 0, 0.2, d / 2 + 0.9, g, false);
    } else if (b.kind === 'registry') {
      const H = 6.6, y0 = shell(g, w, d, H, 4.0, { wall: M.hall, roof: M.roofBlue, beams: false }); door(g, d, y0, 1.9, 2.9); plaque(g, 'BALAI PENCATATAN', null, 0, y0 + 4.2, d / 2 + 0.1, 4.2, 0.8);
      for (const sx of [-1, 1]) mesh(new THREE.PlaneGeometry(0.95, 1.1), M.window, sx * (w / 2 - 1.5), y0 + H * 0.88, d / 2 + 0.07, g, false);
      const ry = y0 + H + 4.0; mesh(boxUV(2.4, 3.0, 2.4, 0.5), M.hall, 0, ry + 0.4, 0, g); mesh(new THREE.ConeGeometry(1.9, 2.2, 4).rotateY(Math.PI / 4), M.roofBlue, 0, ry + 3.0, 0, g);
      for (const e of [-1, 1]) { const c = mesh(new THREE.CircleGeometry(0.9, 20), clockMat, 0, ry + 0.6, e * 1.22, g, false); if (e < 0) c.rotation.y = Math.PI; }
      mesh(box(4.0, 0.4, 1.4), M.plinth, 0, 0.2, d / 2 + 0.9, g, false); for (const sx of [-1, 1]) banner(g, 'crown', sx * (w / 2 - 1.0), y0 + 2.4, d / 2 + 0.14, 0.8, 2.0);
    } else if (b.kind === 'court') {
      const y0 = shell(g, w, d, 6.8, 4.0, { wall: M.hall, roof: M.roofBlue, windows: false, beams: false }); portico(b, g, y0, 4, 2.2, 5.0, 8.4); door(g, d, y0, 2.0, 3.2);
      { const em = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshStandardMaterial({ map: emblemM.map, roughness: 1 })); em.position.set(0, y0 + 6.8, d / 2 + 2.45); g.add(em); }
      mesh(new THREE.SphereGeometry(0.3, 8, 6), M.gold, 0, y0 + 8.0, d / 2 + 2.4, g, false);
      for (const sx of [-1, 1]) for (const x of [w / 2 - 1.6, w / 2 - 4.0]) mesh(new THREE.PlaneGeometry(0.9, 1.9), M.window, sx * x, y0 + 3.4, d / 2 + 0.07, g, false);
      plaque(g, 'PENGADILAN AGUNG', null, 0, y0 + 4.9, d / 2 + 0.1, 4.0, 0.78);
      for (const sx of [-1, 1]) { mesh(box(0.9, 0.9, 0.9), M.plinth, sx * 5.4, 0.45, d / 2 + 3.2, g); mesh(new THREE.SphereGeometry(0.42, 8, 6), M.hall, sx * 5.4, 1.3, d / 2 + 3.2, g, false); bcol(b, sx * 5.4, d / 2 + 3.2, 0.7); }
    } else if (b.kind === 'post') {
      const H = 5.8, y0 = shell(g, w, d, H, 3.4, { wall: M.plaster, roof: M.roofBlue }); door(g, d, y0, 1.8, 2.8); plaque(g, 'KANTOR POS', null, 0, y0 + 4.0, d / 2 + 0.1, 3.4, 0.78);
      const can = mesh(scaleUV(box(5.0, 0.1, 1.8), 5, 1), awnMats[2], 0, y0 + 3.6, d / 2 + 0.9, g); can.rotation.x = 0.26;
      { const cx = w / 2 - 1.8, cz = d / 2 + 1.6; mesh(cyl(0.38, 0.38, 1.1, 10), std(0xb22a2a), cx, 0.65, cz, g); mesh(new THREE.SphereGeometry(0.38, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0xb22a2a), cx, 1.2, cz, g); mesh(box(0.3, 0.06, 0.04), M.iron, cx, 0.95, cz + 0.38, g, false); bcol(b, cx, cz, 0.5); }
      mesh(box(0.1, 0.1, 1.4), M.iron, -w / 2 + 1.4, y0 + 4.4, d / 2 + 0.7, g, false); mesh(box(0.7, 0.7, 0.1), M.gold, -w / 2 + 1.4, y0 + 3.9, d / 2 + 1.4, g, false);
      crate(g, -w / 2 + 2.8, 0, d / 2 + 1.3, 0.8); sack(g, -w / 2 + 3.8, d / 2 + 1.2); for (const sx of [-1, 1]) mesh(new THREE.PlaneGeometry(0.95, 1.1), M.window, sx * (w / 2 - 1.3), y0 + H * 0.58, d / 2 + 0.07, g, false);
    } else {   // office: Kantor Pengawas
      const H = 6.8, y0 = shell(g, w, d, H, 4.0, { wall: M.hall, roof: M.roofBlue, beams: false }); acadFacade(g, b, y0, H, { banners: false });
      for (const sx of [-1, 1]) banner(g, 'crown', sx * (w / 2 - 1.0), y0 + 2.5, d / 2 + 0.14, 0.9, 2.1);
      mesh(box(4.4, 0.2, 1.6), M.plinth, 0, y0 + 3.55, d / 2 + 0.8, g, false); for (const sx of [-1, 1]) mesh(cyl(0.12, 0.12, 3.5, 6), M.hall, sx * 2.0, y0 + 1.75, d / 2 + 1.5, g, false);
    }
    colRect(b);
  }
  { // Balai Kekaisaran (gedung utama berkubah)
    const b = D5.buildings[0], g = place(b.x, b.z, b.face), w = b.w, d = b.d, H = 8.6;
    const y0 = shell(g, w, d, H, 5.0, { wall: M.hall, roof: M.roofBlue, ov: 1.2, chimney: false, beams: false, windows: false });
    mesh(cyl(4.7, 4.9, 2.2, 20), M.hall, 0, y0 + H + 2.4, 0, g); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; mesh(new THREE.PlaneGeometry(0.8, 1.3), M.window, Math.cos(a) * 4.72, y0 + H + 2.5, Math.sin(a) * 4.72, g, false).rotation.y = Math.PI / 2 - a; }
    mesh(new THREE.SphereGeometry(4.5, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeM, 0, y0 + H + 3.5, 0, g); mesh(cyl(0.9, 1.2, 1.4, 10), M.hall, 0, y0 + H + 8.2, 0, g); mesh(cyl(0.06, 0.06, 3.0, 5), M.gold, 0, y0 + H + 10.4, 0, g, false); mesh(new THREE.SphereGeometry(0.3, 8, 6), M.gold, 0, y0 + H + 9.6, 0, g, false);
    for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 2.5; columnAt(g, x, 0, d / 2 + 3.3, 7.4, 0.5); bcol(b, x, d / 2 + 3.3, 0.6); }
    mesh(box(15.8, 0.8, 3.8), M.plinth, 0, y0 + 7.8 + 0.1, d / 2 + 2.0, g);
    { const tri = new THREE.Shape(); tri.moveTo(-7.9, 0); tri.lineTo(7.9, 0); tri.lineTo(0, 2.7); mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false }), M.hall, 0, y0 + 8.8, d / 2 + 3.4, g); }
    { const em = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), crownEmM); em.position.set(0, y0 + 10.0, d / 2 + 3.93); g.add(em); }
    plaque(g, 'BALAI KEKAISARAN', 'Administration Quarter', 0, y0 + 7.85, d / 2 + 3.92, 7.0, 0.8);
    door(g, d, y0, 2.6, 3.8); for (const sx of [-1, 1]) for (const x of [4.2, 6.6]) { mesh(new THREE.PlaneGeometry(1.0, 2.2), M.window, sx * x, y0 + 3.8, d / 2 + 0.07, g, false); mesh(new THREE.PlaneGeometry(1.0, 1.6), M.window, sx * x, y0 + 7.0, d / 2 + 0.07, g, false); }
    for (const sx of [-1, 1]) { const px = sx * (w / 2 - 2.5); mesh(boxUV(5, 9.8, 1.2, 0.5), M.hall, px, y0 + 4.9, d / 2 + 0.6, g); mesh(new THREE.ConeGeometry(3.9, 3.0, 4).rotateY(Math.PI / 4), M.roofBlue, px, y0 + 11.3, d / 2 + 0.6, g); for (const y of [3.4, 6.8]) mesh(new THREE.PlaneGeometry(1.0, 1.8), M.window, px, y0 + y, d / 2 + 1.22, g, false); banner(g, 'crown', sx * (w / 2 - 0.6), y0 + 2.4, d / 2 + 0.14, 0.7, 2.0); }
    for (const y of [0.2, 0.55]) mesh(box(14 - y * 4, 0.35, 1.3), M.plinth, 0, y, d / 2 + 4.6 + (0.35 - y) * 2, g, false);
    colRect(b, 0.4); bcol(b, 0, 0, 5.0);
  }
  { // Menara Jam
    const b = D5.buildings[1], g = place(b.x, b.z, b.face), tz = -3;
    mesh(boxUV(5.4, 19, 5.4, 0.5), M.hall, 0, 9.5, tz, g); mesh(box(6.4, 0.7, 6.4), M.plinth, 0, 19.2, tz, g); mesh(boxUV(4.6, 3.4, 4.6, 0.5), M.hall, 0, 21.2, tz, g); mesh(box(5.6, 0.6, 5.6), M.plinth, 0, 23.2, tz, g);
    mesh(new THREE.ConeGeometry(4.0, 7.5, 4).rotateY(Math.PI / 4), M.roofBlue, 0, 27.2, tz, g); mesh(cyl(0.06, 0.06, 2.6, 5), M.gold, 0, 32.2, tz, g, false);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const c = mesh(new THREE.CircleGeometry(1.5, 24), clockMat, Math.sin(a) * 2.32, 21.2, tz + Math.cos(a) * 2.32, g, false); c.rotation.y = a; }
    for (const y of [6, 12]) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; mesh(new THREE.PlaneGeometry(0.8, 2.0), M.window, Math.sin(a) * 2.72, y, tz + Math.cos(a) * 2.72, g, false).rotation.y = a; }
    const a = new THREE.Group(); a.position.set(0, 0, 4); g.add(a); const ya = shell(a, 7, 6, 4.4, 2.4, { wall: M.hall, roof: M.roofBlue, windows: false, chimney: false, beams: false });
    door(a, 6, ya, 1.6, 2.6); plaque(a, 'MENARA JAM', null, 0, ya + 3.6, 3.1, 3.6, 0.78); banner(a, 'crown', 2.6, ya + 2.0, 3.14, 0.8, 1.8); banner(a, 'crown', -2.6, ya + 2.0, 3.14, 0.8, 1.8);
    colRect(b); bcol(b, 0, tz, 3.8); bcol(b, 0, 4, 3.4);
  }
  { // Balai Kesehatan
    const b = D5.buildings[2], g = place(b.x, b.z, b.face), w = b.w, d = b.d, H = 5.4;
    const y0 = shell(g, w, d, H, 3.4, { wall: M.plaster, roof: M.roofBlue }); door(g, d, y0, 1.9, 2.8);
    { const em = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), crossEmM); em.position.set(0, y0 + 4.3, d / 2 + 0.08); g.add(em); }
    plaque(g, 'BALAI KESEHATAN', null, 0, y0 + 3.5, d / 2 + 0.1, 3.8, 0.7);
    for (const sx of [-1, 1]) for (const x of [w / 2 - 1.5, w / 2 - 3.9]) mesh(new THREE.PlaneGeometry(0.9, 1.2), M.window, sx * x, y0 + 2.4, d / 2 + 0.07, g, false);
    for (const sx of [-1, 1]) { const bx = sx * 3.8, bz = d / 2 + 2.2; mesh(box(2.8, 0.45, 1.5), M.woodDark, bx, 0.22, bz, g); for (let i = 0; i < 6; i++) mesh(new THREE.SphereGeometry(0.28, 6, 5), hedgeM, bx - 1.0 + (i % 3) * 1.0, 0.65, bz + (i > 2 ? 0.35 : -0.35), g, false); bcol(b, bx, bz, 1.2); }
    mesh(box(3.4, 0.4, 1.2), M.plinth, 0, 0.2, d / 2 + 0.8, g, false);
    colRect(b);
  }
  yield;
  // ---------- pohon di ruang kosong ----------
  for (let n = 0, tries = 0; n < (COARSE ? 6 : 12) && tries < 900; tries++) {
    const p = d5p(Rn(76, 168), Rn(-90, 90)); if (!inD5(p.x, p.z, 3.5) || d5Blocked(p.x, p.z, 5)) continue;
    if (trees.some(t => Math.hypot(t.x - p.x, t.z - p.z) < 10)) continue; addTree(p.x, p.z, Rn(0.6, 0.85)); n++;
  }
  yield;
  // ======================================================================

  // ======================================================================
  //  ISTANA KEKAISARAN (pusat kota, tapak r = 36): aula utama + menara gerbang bersepuh, dua sayap, aula takhta berkubah di belakang, 4 menara sudut
  //  Menghadap Gerbang Utama (-x). Kerangka istana: lx = lateral (+z kota), lz = ke depan (-x kota) dari pusat istana (0,0).
  // ======================================================================
  const pw = (lx, lz) => ({ x: -lz, z: lx });
  const PI_ = Math.PI;
  // ---- Tangga agung istana (koordinat lokal kota; zl = jarak ke depan dari pusat aula utama, x kota = 2 - zl) ----
  // Pelataran portico setinggi lantai dalam (0,7) lalu 5 anak tangga turun ke tanah. Pemain NAIK mengikuti tinggi tangga (lihat groundY di bawah)
  // dan sisi-sisi tangga ditutup collider agar tidak bisa 'menembus' dari samping.
  const STAIR = { cx0: 2, zl0: 18.1, zl1: 21.5, tread: 1.3, n: 5, top: 0.7, hw0: 10, dhw: 0.75 };
  STAIR.rise = STAIR.top / (STAIR.n + 1); STAIR.zEnd = STAIR.zl1 + STAIR.n * STAIR.tread;
  const stairY = (x, z) => {   // tinggi permukaan tangga di (x, z) lokal kota; 0 di luar tangga. Naik mulus tepat sebelum tepi tiap anak tangga
    const zl = STAIR.cx0 - x; if (zl < STAIR.zl0 || zl > STAIR.zEnd + 0.45) return 0;
    const k = Math.min(STAIR.n - 1, Math.max(0, Math.floor((zl - STAIR.zl1) / STAIR.tread)));
    if (Math.abs(z) > STAIR.hw0 + STAIR.dhw * (zl < STAIR.zl1 ? 0 : k) + 0.05) return 0;
    const t = (STAIR.zEnd - zl) / STAIR.tread, q = t + 0.3, i = Math.floor(q), f = Math.min(1, (q - i) / 0.3), h = STAIR.rise * (i + f * f * (3 - 2 * f));
    return Math.max(0, Math.min(STAIR.top, h));
  };
  const hideIn = [];   // bagian luar istana yang menjorok ke ruang dalam (balok menara gerbang, pita hias selebar lantai, menara sudut): disembunyikan selama pemain di dalam (lihat kekaisaran-aula.js)
  const winRow = (g, xs, y, z, w = 1.0, h = 2.0, ry = 0) => { for (const x of xs) mesh(new THREE.PlaneGeometry(w, h), M.window, x, y, z, g, false).rotation.y = ry; };
  { // ---- aula utama ----
    const mp = pw(0, -2), MB = { x: mp.x, z: mp.z, w: 34, d: 26, face: PI_ }, g = place(MB.x, MB.z, MB.face), w = MB.w, d = MB.d, H = 14;
    const y0 = shell(g, w, d, H, 8, { wall: M.hall, roof: M.roofBlue, ov: 1.6, chimney: false, beams: false, windows: false }); hideIn.push(g.userData.wall);   // kotak padat badan aula: sisi depannya menutup ambang serambi -> disembunyikan dari dalam
    hideIn.push(mesh(box(w + 0.5, 0.4, d + 0.5), M.plinth, 0, y0 + 7.2, 0, g, false)); mesh(box(w + 0.7, 0.5, d + 0.7), M.plinth, 0, y0 + H - 0.1, 0, g, false);
    const fxs = [-15.2, -11.4, -7.6, 7.6, 11.4, 15.2], rows = [3.4, 7.8, 11.0];
    for (const r of rows) { winRow(g, fxs, y0 + r, d / 2 + 0.07, 1.0, 2.0); winRow(g, [...fxs, -3.8, 0, 3.8], y0 + r, -d / 2 - 0.07, 1.0, 2.0, PI_); }
    for (const r of rows) for (const sd of [-1, 1]) for (const z of [-9, -4.5, 0, 4.5, 9]) mesh(new THREE.PlaneGeometry(1.0, 2.0), M.window, sd * (w / 2 + 0.07), y0 + r, z, g, false).rotation.y = sd * PI_ / 2;
    // menara gerbang (keep) di depan
    hideIn.push(mesh(boxUV(14, 28, 9, 0.5), M.hall, 0, 14, d / 2 + 1.0, g)); mesh(box(15.4, 0.9, 10.4), M.plinth, 0, 28.3, d / 2 + 1.0, g);
    mesh(boxUV(10.4, 9, 7, 0.5), M.hall, 0, 33, d / 2 + 1.0, g); mesh(box(11.6, 0.8, 8.2), M.plinth, 0, 37.6, d / 2 + 1.0, g);
    mesh(new THREE.ConeGeometry(8.2, 17, 4).rotateY(PI_ / 4), M.roofBlue, 0, 46.6, d / 2 + 1.0, g); mesh(cyl(0.1, 0.1, 6, 6), M.gold, 0, 56.6, d / 2 + 1.0, g, false); mesh(new THREE.SphereGeometry(0.5, 8, 6), M.gold, 0, 55.4, d / 2 + 1.0, g, false);
    // pintu agung + portico
    hideIn.push(mesh(extrude(doorShape(3.2, 5.6), 0.5, false), M.woodDark, 0, 0, d / 2 + 5.5, g, false)); for (const y of [2.0, 4.6]) hideIn.push(mesh(box(6.6, 0.22, 0.25), M.iron, 0, y, d / 2 + 5.62, g, false)); hideIn.push(mesh(box(0.2, 8.6, 0.25), M.iron, 0, 4.3, d / 2 + 5.62, g, false));   // daun pintu luar tertutup: disembunyikan dari dalam (pintu dalam sudah terbuka)
    for (const x of [-8.4, -4.8, 4.8, 8.4]) { columnAt(g, x, 0, d / 2 + 6.8, 10.2, 0.55); bcol(MB, x, d / 2 + 6.8, 0.7); }
    mesh(box(20, 0.9, 3.4), M.plinth, 0, 11.3, d / 2 + 6.8, g); { const tri = new THREE.Shape(); tri.moveTo(-10, 0); tri.lineTo(10, 0); tri.lineTo(0, 3.6); mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false }), M.hall, 0, 11.75, d / 2 + 7.8, g); }
    { const em = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), crownEmM); em.position.set(0, 13.4, d / 2 + 8.32); g.add(em); }
    plaque(g, 'ISTANA KEKAISARAN', null, 0, 11.3, d / 2 + 8.56, 8.6, 0.8);
    mesh(box(20, STAIR.top, 3.4), M.plinth, 0, STAIR.top / 2, d / 2 + 6.8, g);   // pelataran portico: tinggi 0,7 = sama dengan lantai dalam (tanpa undakan di ambang pintu)
    for (const y of [9, 15, 21]) { winRow(g, [-3.2, 3.2], y0 + y, d / 2 + 5.52, 1.2, 2.6); }
    mesh(new THREE.CircleGeometry(2.0, 28), M.window, 0, 25.5, d / 2 + 5.52, g, false);
    { const em = new THREE.Mesh(new THREE.CircleGeometry(2.0, 28), crownEmM); em.position.set(0, 33.2, d / 2 + 4.52); g.add(em); }
    for (const sx of [-1, 1]) { banner(g, 'palace', sx * 9.5, y0 + 7.0, d / 2 + 0.14, 1.5, 5.0); banner(g, 'palace', sx * 13.3, y0 + 7.0, d / 2 + 0.14, 1.5, 5.0); banner(g, 'palace', sx * 3.2, y0 + 17.0, d / 2 + 5.53, 1.5, 6.0); mesh(box(0.25, 0.4, 0.25), M.lantern, sx * 10.7, y0 + 2.0, d / 2 + 8.6, g, false); }
    for (let k = 0; k < STAIR.n; k++) {   // 5 anak tangga (k = 0 paling dekat pintu & paling tinggi): tiap anak tangga balok padat dari tanah
      const h = STAIR.rise * (STAIR.n - k), zc = STAIR.zl1 + (k + 0.5) * STAIR.tread;   // z lokal gedung = zl
      mesh(box(2 * (STAIR.hw0 + STAIR.dhw * k), h, STAIR.tread), M.plinth, 0, h / 2, zc, g);
    }
    for (const sx of [-1, 1]) for (const zz of [d / 2 - 0.4, -d / 2 + 0.4]) { const t = new THREE.Group(); t.position.set(sx * (w / 2 + 0.2), 0, zz); g.add(t); hideIn.push(t); roundTower(t, 3.4, 24, 10.5, M.roofBlue); bcol(MB, sx * (w / 2 + 0.2), zz, 4.0); }
    colRect(MB, 0.4); { const tp = bp(MB, 0, d / 2 + 1.0); colRect({ x: tp.x, z: tp.z, w: 14, d: 9, face: PI_ }, 0.3); }
    // sisi kiri-kanan pelataran & tangga ditutup deretan collider kecil: tidak bisa menembus tangga dari samping, naik hanya dari depan
    for (const sd of [-1, 1]) {
      for (let zl = STAIR.zl0; zl < STAIR.zl1; zl += 0.55) col(STAIR.cx0 - zl, sd * (STAIR.hw0 + 0.2), 0.3);
      for (let k = 0; k < STAIR.n; k++) for (let a = 0; a < STAIR.tread - 1e-6; a += 0.55) col(STAIR.cx0 - (STAIR.zl1 + k * STAIR.tread + a), sd * (STAIR.hw0 + STAIR.dhw * k + 0.2), 0.3);
    }
  }
  yield;
  for (const sdn of [-1, 1]) { // ---- dua sayap ----
    const wp = pw(sdn * 23, -4), WB = { x: wp.x, z: wp.z, w: 12, d: 20, face: PI_ }, g = place(WB.x, WB.z, WB.face), w = WB.w, d = WB.d, H = 11;
    const y0 = shell(g, w, d, H, 6.5, { wall: M.hall, roof: M.roofBlue, ov: 1.3, chimney: false, beams: false, windows: false });
    hideIn.push(mesh(box(w + 0.4, 0.35, d + 0.4), M.plinth, 0, y0 + 5.6, 0, g, false)); hideIn.push(g.userData.wall);   // kotak padat sayap: menutup pintu lengkung ke Ruang Dewan / Perpustakaan dari dalam
    for (const r of [3.2, 6.8, 9.4]) { winRow(g, [-3.8, 0, 3.8], y0 + r, d / 2 + 0.07, 1.0, 1.9); winRow(g, [-3.8, 0, 3.8], y0 + r, -d / 2 - 0.07, 1.0, 1.9, PI_); for (const s2 of [-1, 1]) for (const z of [-7, -2.3, 2.3, 7]) mesh(new THREE.PlaneGeometry(1.0, 1.9), M.window, s2 * (w / 2 + 0.07), y0 + r, z, g, false).rotation.y = s2 * PI_ / 2; }
    door(g, d, y0, 1.7, 3.0); banner(g, 'palace', 0, y0 + 6.4, d / 2 + 0.14, 1.3, 3.4);
    mesh(box(4.4, 0.4, 1.6), M.plinth, 0, 0.2, d / 2 + 0.9, g, false);
    const tx = sdn * 5.6; { const t = new THREE.Group(); t.position.set(tx, 0, d / 2 - 0.3); g.add(t); hideIn.push(t); roundTower(t, 2.4, 17, 7, M.roofBlue); bcol(WB, tx, d / 2 - 0.3, 3.0); }
    colRect(WB, 0.4);
  }
  { // ---- aula takhta berkubah di belakang ----
    const rp = pw(0, -20), RB = { x: rp.x, z: rp.z, w: 20, d: 10, face: PI_ }, g = place(RB.x, RB.z, RB.face), w = RB.w, d = RB.d, H = 11;
    const y0 = shell(g, w, d, H, 6, { wall: M.hall, roof: M.roofBlue, ov: 1.2, chimney: false, beams: false, windows: false });
    for (const r of [3.4, 7.2]) { winRow(g, [-7, -3.5, 0, 3.5, 7], y0 + r, d / 2 + 0.07, 1.0, 2.0); winRow(g, [-7, -3.5, 0, 3.5, 7], y0 + r, -d / 2 - 0.07, 1.0, 2.0, PI_); }
    // kubah: tambur turun sampai bibir dinding (tidak melayang di atas genteng) dan lebih sempit dari lebar aula
    { const rh = 6, top = H + rh + 3.2, dr = 4.4;
      mesh(cyl(dr, dr + 0.2, top + 0.2, 24), M.hall, 0, y0 - 0.2 + (top + 0.2) / 2, 0, g);
      for (let i = 0; i < 10; i++) { const a = i * PI_ / 5; mesh(new THREE.PlaneGeometry(0.9, 1.9), M.window, Math.cos(a) * (dr + 0.02), y0 + H + rh + 1.0, Math.sin(a) * (dr + 0.02), g, false).rotation.y = PI_ / 2 - a; }
      mesh(cyl(dr + 0.4, dr + 0.4, 0.35, 24), M.gold, 0, y0 + top, 0, g, false);
      mesh(new THREE.SphereGeometry(dr, 26, 14, 0, PI_ * 2, 0, PI_ / 2), domeM, 0, y0 + top + 0.1, 0, g);
      mesh(cyl(0.8, 1.0, 1.4, 10), M.hall, 0, y0 + top + dr + 0.6, 0, g); mesh(new THREE.ConeGeometry(0.9, 2.0, 8), M.gold, 0, y0 + top + dr + 2.3, 0, g, false); mesh(cyl(0.07, 0.07, 3.0, 5), M.gold, 0, y0 + top + dr + 4.0, 0, g, false); }
    colRect(RB, 0.4);
  }
  // ---- halaman depan: jalur ke tangga, lampu, singa penjaga ----
  decalStrip(-RING.r + 6, 0, -25, 0, 12, M.cobble, 4, 0.33);
  for (const x of [-56, -46, -36]) for (const sd of [-1, 1]) lamp(x, sd * 7.4);
  for (const sd of [-1, 1]) { const gx = -24.6, gz = sd * 10.5, g = new THREE.Group(); g.position.set(gx, 0, gz); city.add(g);
    mesh(box(2.0, 1.2, 2.6), M.plinth, 0, 0.6, 0, g); mesh(box(1.1, 0.9, 1.9), M.hall, 0, 1.65, 0, g); mesh(new THREE.SphereGeometry(0.62, 10, 8), M.hall, -0.5, 2.3, 0, g); mesh(box(0.35, 0.5, 0.35), M.gold, 0.1, 2.4, 0, g, false); col(gx, gz, 1.4); }
  yield;
  // ======================================================================
  //  DEKORASI HALAMAN ISTANA: taman bunga berpagar, taman mawar bundar bertugu patung, tiang bendera kerajaan, patung di sepanjang jalur,
  //  bangku di air mancur, perapian di tangga, dan sulaman emas di lantai. Semua di antara tapak istana (r 36) dan jalan lingkar.
  // ======================================================================
  const flames = [];
  const soilM = std(0x6b4a2e), goldInlay = new THREE.MeshStandardMaterial({ color: 0xd9b24a, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const flameM = new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff7a18, emissiveIntensity: 1.6, roughness: 0.5 });
  decalRing(40.4, 41.2, goldInlay, 5, 0.3, 120); decalRing(52.2, 52.9, goldInlay, 5, 0.3, 120);
  const blooms = [];   // posisi bunga { x, z, c }
  // --- dua petak bunga persegi di kiri-kanan jalur depan ---
  for (const sd of [-1, 1]) {
    const zc = sd * 13, x0 = -55, x1 = -39, xc = (x0 + x1) / 2;
    decalStrip(x0, zc, x1, zc, 8, soilM, 6, 0.3);
    for (const e of [-1, 1]) { mesh(box(x1 - x0 + 1.0, 0.9, 1.0), hedgeM, xc, 0.45, zc + e * 4, city); mesh(box(1.0, 0.9, 8.0), hedgeM, e > 0 ? x1 : x0, 0.45, zc, city); }
    for (let x = x0; x <= x1 + 0.1; x += 2.6) { col(x, zc + 4, 1.1); col(x, zc - 4, 1.1); } for (let z = zc - 2.6; z <= zc + 2.6; z += 2.6) { col(x0, z, 1.1); col(x1, z, 1.1); }
    for (let i = 0; i < 7; i++) for (let j = -1; j <= 1; j++) { if (i === 3 && j === 0) continue; blooms.push({ x: x0 + 1.3 + i * 2.2, z: zc + j * 2.4, c: FLOWER[(i + (j + 1) * 2 + (sd > 0 ? 1 : 0)) % FLOWER.length] }); }
    cone(city, xc, zc, 2.8, 1.0);
  }
  // --- tiga taman mawar bundar bertugu patung (belakang & kedua sisi istana) ---
  for (const [cx, cz] of [[47, 0], [0, 47], [0, -47]]) {
    decalDisc(cx, cz, 5.6, soilM, 6, 0.3, 32);
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, px = cx + Math.cos(a) * 6.2, pz = cz + Math.sin(a) * 6.2; const h = mesh(box(2.2, 0.95, 1.0), hedgeM, px, 0.475, pz, city); h.rotation.y = -Math.atan2(Math.cos(a), -Math.sin(a)); if (i % 2 === 0) col(px, pz, 1.3); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.2; blooms.push({ x: cx + Math.cos(a) * 4.3, z: cz + Math.sin(a) * 4.3, c: FLOWER[i % FLOWER.length] }); }
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; blooms.push({ x: cx + Math.cos(a) * 2.6, z: cz + Math.sin(a) * 2.6, c: FLOWER[(i + 3) % FLOWER.length] }); }
    statue3(cx, cz, 0, 0, 2.6);
  }
  { const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 6, 5), new THREE.MeshStandardMaterial({ roughness: 1 }), blooms.length);
    blooms.forEach((b, i) => { dummy.position.set(b.x, 0.38, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Rn(0.9, 1.4)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, tmpC.setHex(b.c)); });
    city.add(im); }
  yield;
  // --- tiang bendera kerajaan (cincin r = 54, kecuali di depan petak bunga) ---
  for (let k = 0; k < 12; k++) {
    const deg = 15 + k * 30; if (Math.abs(deg - 180) < 20) continue;
    const a = deg * D2R, px = Math.cos(a) * 54, pz = Math.sin(a) * 54, g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = Math.PI / 2 - a; city.add(g);
    mesh(box(1.0, 0.4, 1.0), M.plinth, 0, 0.2, 0, g); mesh(cyl(0.08, 0.12, 9, 6), M.iron, 0, 4.7, 0, g, false); mesh(new THREE.SphereGeometry(0.2, 8, 6), M.gold, 0, 9.3, 0, g, false);
    banner(g, 'palace', 0.78, 7.6, 0, 1.4, 2.4); col(px, pz, 0.45);
  }
  // --- patung bangsawan di sepanjang jalur depan ---
  for (const x of [-51, -41, -31]) for (const sd of [-1, 1]) statue3(x, sd * 7.4, x, 0, 2.4);
  // --- bangku melingkari tiap air mancur ---
  for (let k = 0; k < 4; k++) {
    const a = (45 + k * 90) * D2R, fx = Math.cos(a) * 47, fz = Math.sin(a) * 47;
    for (let j = 0; j < 4; j++) {
      const bx = fx + Math.cos(j * Math.PI / 2) * 5.4, bz = fz + Math.sin(j * Math.PI / 2) * 5.4, g = new THREE.Group(); g.position.set(bx, 0, bz); g.rotation.y = Math.atan2(fx - bx, fz - bz); city.add(g);
      mesh(box(2.4, 0.14, 0.6), M.wood, 0, 0.5, 0, g); mesh(box(2.4, 0.5, 0.1), M.wood, 0, 0.85, -0.3, g, false); for (const sx of [-1, 1]) mesh(box(0.14, 0.5, 0.5), M.plinth, sx * 1.0, 0.25, 0, g, false); col(bx, bz, 1.2);
    }
  }
  // --- perapian berapi di kedua sisi tangga ---
  for (const sd of [-1, 1]) {
    const bx = -27.5, bz = sd * 14, g = new THREE.Group(); g.position.set(bx, 0, bz); city.add(g);
    mesh(cyl(0.5, 0.65, 0.5, 8), M.plinth, 0, 0.25, 0, g); mesh(cyl(0.3, 0.4, 1.0, 8), M.plinth, 0, 1.0, 0, g); mesh(cyl(0.95, 0.55, 0.6, 12), M.iron, 0, 1.8, 0, g);
    const f = mesh(new THREE.ConeGeometry(0.5, 1.3, 7), flameM, 0, 2.5, 0, g, false); flames.push(f); col(bx, bz, 1.0);
  }
  yield;
  // ======================================================================

  // ---------- patok lahan kosong (hanya jika masih ada distrik yang belum dibangun) ----------
  const stakes = [];
  for (const g of GATES) {   // patok di tepi jalan radial yang berbatasan dengan distrik yang belum dibangun
    const dx = Math.cos(g.psi), dz = Math.sin(g.psi), nx = -dz, nz = dx;
    for (let s = RING.r + 8; s < APOTHEM - 10; s += 7) for (const sd of [-1, 1]) {
      const off = (g.k === 2 ? AVENUE_W : ROAD_W) / 2 + 1.0, x = dx * s + nx * sd * off, z = dz * s + nz * sd * off;
      if (inD1(x, z, -1.5) || d1Blocked(x, z, 1) || inD2(x, z, -1.5) || d2Blocked(x, z, 1) || inD3(x, z, -1.5) || d3Blocked(x, z, 1) || inD4(x, z, -1.5) || d4Blocked(x, z, 1) || inD5(x, z, -1.5) || d5Blocked(x, z, 1)) continue; if (g.k === 2 && x < -RING.r - 8 && Math.abs(z) < 12) continue;
      stakes.push({ x, z });
    }
  }
  if (stakes.length) { const sm = new THREE.InstancedMesh(cyl(0.05, 0.06, 1.3, 5).translate(0, 0.65, 0), M.timber, Math.max(1, stakes.length)), fm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.28).translate(0.22, 1.15, 0), new THREE.MeshStandardMaterial({ color: 0xc73a2a, roughness: 1, side: THREE.DoubleSide }), Math.max(1, stakes.length));
    stakes.forEach((p, i) => { dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, rand() * 6.283, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); fm.setMatrixAt(i, dummy.matrix); });
    sm.castShadow = true; city.add(sm, fm); }
  for (const d of DISTRICTS.filter(q => !q.built)) {
    const a = (d.n - 1) * 72 * D2R, r = RING.r + RING.w / 2 + 6, sx = Math.cos(a) * r, sz = Math.sin(a) * r;
    signPost(sx, sz, 0, 0, [{ text: d.name.toUpperCase(), sub: d.sub }, { text: 'Segera dibangun', sub: '' }], 1.1, 3.0, 1.3);
    for (let n = 0, tries = 0; n < 5 && tries < 200; tries++) {   // beberapa pohon muda di lahan kosong
      const rr = Rn(RING.r + 16, APOTHEM - 14), aa = a + Rn(-30, 30) * D2R, x = Math.cos(aa) * rr, z = Math.sin(aa) * rr;
      if (!insidePoly(x, z, 8) || trees.some(t => Math.hypot(t.x - x, t.z - z) < 14)) continue; addTree(x, z, Rn(0.6, 0.9)); n++;
    }
  }
  { const nT = trees.length, lm = mat.leafMat(0.03), tr = new THREE.InstancedMesh(geo.trunkOak, mat.barkMat, Math.max(1, nT)), lf = new THREE.InstancedMesh(geo.oakLeaf, lm, Math.max(1, nT));
    trees.forEach((t, i) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.a, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix); lf.setMatrixAt(i, dummy.matrix); lf.setColorAt(i, tmpC.setRGB(Rn(0.8, 1.1), Rn(0.9, 1.1), Rn(0.8, 1.05))); col(t.x, t.z, 0.34 * t.s); });
    tr.count = lf.count = nT; tr.castShadow = lf.castShadow = true; tr.receiveShadow = lf.receiveShadow = true; city.add(tr, lf); }
  yield;

  // ======================================================================
  //  INTERIOR ISTANA — lantai 1: AULA RAJA (di dalam badan istana; tersembunyi sampai pemain masuk lewat pintu agung di portico).
  //  Data tata letak & titik pindah: kekaisaran-istana-layout.js; isi ruangan, tabrakan & kamera: kekaisaran-aula.js; masuk/keluar: game.js (aulaGo).
  // ======================================================================
  const aula = buildAulaRaja({ hide: hideIn }); city.add(aula.group);
  yield;

  // ---------- Warga halaman istana (NPC; model FBX dimuat asinkron, collider dibuat sekarang) ----------
  const citizens = buildCitizens({ parent: city, col, player: o.player });
  yield;

  // ---------- Pembaruan per frame: air mengalir ----------
  const upd = t => { T.water.offset.x = -t * 0.08; flames.forEach((f, i) => { f.scale.set(1 + 0.08 * Math.sin(t * 9 + i), 1 + 0.18 * Math.sin(t * 7 + i * 2), 1 + 0.08 * Math.sin(t * 9 + i)); }); for (const q of spin) { q.m.rotation.y = t * q.k; q.m.position.y = q.y + Math.sin(t * 1.3 + q.k) * 0.25; } };
  return { group, update: t => { upd(t); aula.update(t); citizens.update(t); if (inn) inn.update(t); }, aula, inn, groundY: (wx, wz) => { const p = toLocal(wx, wz); return stairY(p.x, p.z); } };   // groundY: tinggi tangga istana di luar (0 di tempat lain)
}

export function buildKekaisaran(opts) { const it = buildKekaisaranGen(opts); let r; while (!(r = it.next()).done); return r.value; }
