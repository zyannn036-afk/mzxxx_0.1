import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================
//  MODEL 3D PEDANG EQUIPMENT (dipakai game.js lewat styleSword)
//  - free_stylized_low_poly_swords.glb : 7 pedang low-poly. Teksturnya palet warna, jadi tiap pedang dipecah per-segitiga menjadi
//        bilah (abu-abu)  -> diwarnai ulang memakai warna bilah elemen (+ pendar emissive dari SWORDS di dungeon-loot.js)
//        aksen (permata / emas / hiasan berwarna) -> diwarnai ulang memakai warna pendar elemen
//        gagang kulit (cokelat)                    -> warna asli
//  - pedang_kegelapan.glb : 1 pedang naga. Teks emissive aslinya merah; diubah jadi abu-abu lalu diwarnai warna pendar elemen.
//  Taruh kedua file .glb di folder yang sama dengan louiss.vrm / dragon.glb. Bila gagal dimuat, game memakai pedang kotak bawaan.
//
//  CARA MENGGANTI: ubah tabel SWORD_MODEL di bawah.
//    src      = 'pack' (7 pedang) atau 'dark' (pedang kegelapan)
//    node/idx = nama / urutan pedang di dalam file pack (idx = urutan mesh di GLB: 0177=0, 0018=1, 0036=2, 0080=3, 0222=4, 1039=5, 0363=6)
//    len      = panjang pedang di dalam game (satuan dunia; pedang kotak lama = 1.15)
//    guardLo  = posisi (satuan model asli) tepi BAWAH pelindung (guard) di sumbu bilah -> titik genggam = tengah antara ujung gagang dan guard
//    sheathW  = pelebaran sarung di pinggang supaya cocok dengan lebar bilah (1 = sama dengan pedang lama)
//  Kunci tabel = id pedang di SWORDS (dungeon-loot.js): biasa, kota, cahaya, kegelapan, api, es, batu, asal.
// ============================================================
export const SWORD_FILES = { pack: 'free_stylized_low_poly_swords.glb', dark: 'pedang_kegelapan.glb' };

export const SWORD_MODEL = {
  biasa:     { src: 'pack', idx: 1, node: 'PP_Sword_0018', len: 1.15, guardLo: 0.104,  sheathW: 1.3 },   // pedang lurus sederhana
  kota:      { src: 'pack', idx: 2, node: 'PP_Sword_0036', len: 1.25, guardLo: -0.084, sheathW: 2.0 },   // bilah bergelombang seperti kristal
  cahaya:    { src: 'pack', idx: 3, node: 'PP_Sword_0080', len: 1.30, guardLo: -0.087, sheathW: 1.6 },   // pedang ksatria suci
  kegelapan: { src: 'dark',                                len: 1.45, guardLo: -62,    sheathW: 1.3 },   // pedang naga (model sendiri)
  api:       { src: 'pack', idx: 0, node: 'PP_Sword_0177', len: 1.20, guardLo: -0.07,  sheathW: 1.5 },   // bilah menyala + gagang lengkung
  es:        { src: 'pack', idx: 6, node: 'PP_Sword_0363', len: 1.30, guardLo: -0.089, sheathW: 1.4 },   // ramping & berduri
  batu:      { src: 'pack', idx: 4, node: 'PP_Sword_0222', len: 1.35, guardLo: -0.124, sheathW: 1.8 },   // golok besar
  asal:      { src: 'pack', idx: 5, node: 'PP_Sword_1039', len: 1.30, guardLo: -0.138, sheathW: 1.6 },   // pedang purba berhias
};

const HAND_X = -0.07;      // titik genggam (tengah gagang) pada sumbu bilah = sama dengan pedang kotak lama; ujung bilah ke arah -x
const models = {};         // id -> hasil bake (geometri sudah diputar / diskalakan ke ruang pedang game)

// ---------- bantu ----------
const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hsv(r, g, b) {   // r,g,b 0..1 -> [hue derajat, saturasi, nilai]
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
  return [h, mx ? d / mx : 0, mx];
}
// 0 = bilah (abu-abu), 1 = aksen (permata / emas / berwarna), 2 = gagang kulit (cokelat gelap)
function classify(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  if (s < 0.22) return 0;
  if (h >= 12 && h <= 48 && v < 0.6) return 2;
  return 1;
}

async function decodePixels(parser, imageIndex) {   // baca piksel gambar langsung dari GLB (orientasi glTF: baris 0 = atas) supaya tidak tergantung cara three memuat tekstur
  const def = parser.json.images && parser.json.images[imageIndex]; if (!def || def.bufferView == null) return null;
  const buf = await parser.getDependency('bufferView', def.bufferView);
  const bmp = await createImageBitmap(new Blob([buf], { type: def.mimeType || 'image/png' }));
  const canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
  return { canvas, ctx, w: bmp.width, h: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
}
async function emissiveLuma(parser, imageIndex) {   // peta emissive (merah) -> abu-abu, supaya warna pendar bisa diganti lewat material.emissive
  const im = await decodePixels(parser, imageIndex); if (!im) return null;
  const d = im.ctx.getImageData(0, 0, im.w, im.h), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const v = Math.max(a[i], a[i + 1], a[i + 2]); a[i] = a[i + 1] = a[i + 2] = v; }
  im.ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(im.canvas); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- bake: putar + skalakan geometri ke ruang pedang game, pecah per kelompok warna ----------
// Ruang model asli: bilah = +z (ujung ke +z), lebar = x, tebal = y.  Ruang pedang game: bilah = -x (ujung ke -x), lebar = y, tebal = z (sama seperti pedang kotak lama).
function bake(mesh, cfg, px, extra = {}) {
  const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < n; i++) { const z = P.getZ(i); if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
  const s = cfg.len / (zmax - zmin), gc = (zmin + cfg.guardLo) / 2;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = U ? new Float32Array(n * 2) : null;
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    pos[i * 3] = -(z - gc) * s + HAND_X; pos[i * 3 + 1] = -x * s; pos[i * 3 + 2] = y * s;   // rotasi murni (determinan +1): arah putaran segitiga tetap
    if (N) { const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i); nor[i * 3] = -nz; nor[i * 3 + 1] = -nx; nor[i * 3 + 2] = ny; }
    if (U) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); }
  }
  const idx = g.index ? g.index.array : null, nt = (idx ? idx.length : n) / 3, vi = (t, k) => idx ? idx[t * 3 + k] : t * 3 + k;
  const groups = [[], [], []]; let lumSum = 0, lumN = 0;
  for (let t = 0; t < nt; t++) {
    let grp = 0;
    if (px && U) {   // warna palet di titik tengah segitiga
      const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
      const u = (((uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3) % 1 + 1) % 1, v = (((uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3) % 1 + 1) % 1;
      const o = (Math.floor(v * (px.h - 1)) * px.w + Math.floor(u * (px.w - 1))) * 4, r = px.data[o] / 255, gg = px.data[o + 1] / 255, bb = px.data[o + 2] / 255;
      grp = classify(r, gg, bb);
      if (grp === 0) { lumSum += 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(bb); lumN++; }
    }
    groups[grp].push(vi(t, 0), vi(t, 1), vi(t, 2));
  }
  const pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nor, 3), ua = uv ? new THREE.BufferAttribute(uv, 2) : null;
  const mk = arr => {
    if (!arr.length) return null;
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', pa); bg.setAttribute('normal', na); if (ua) bg.setAttribute('uv', ua); bg.setIndex(arr); return bg;
  };
  return {
    parts: groups.map(mk), lum: lumN ? lumSum / lumN : 0.4, map: mesh.material && mesh.material.map, srcMat: mesh.material,
    throatX: -(cfg.guardLo - gc) * s + HAND_X, tipX: -(zmax - gc) * s + HAND_X, pommelX: -(zmin - gc) * s + HAND_X, sheathW: cfg.sheathW || 1, ...extra,
  };
}

// ---------- bangun satu pedang (grup) untuk look = { color, emi, ei, glow } dari SWORDS; null bila model belum siap ----------
export function buildSwordModel(id, look = {}) {
  const M = models[id]; if (!M) return null;
  const grp = new THREE.Group(); grp.name = 'pedang:' + id;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.frustumCulled = false; grp.add(m); return m; };
  const aura = (geo, sx, sy, sz, op) => {   // cangkang sedikit lebih besar, hanya sisi belakang -> pendar di tepi pedang (tidak menutupi pedang)
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: look.glow, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.BackSide }));
    m.scale.set(sx, sy, sz); m.frustumCulled = false; grp.add(m);
  };
  if (M.dark) {   // pedang kegelapan: tekstur asli, pendar rune diganti warna elemen
    const mat = M.srcMat.clone(); mat.side = THREE.DoubleSide;
    if (look.glow != null && M.emiTex) { mat.emissiveMap = M.emiTex; mat.emissive.setHex(look.glow); mat.emissiveIntensity = 0.9 + (look.ei || 0); }
    add(M.parts[0], mat);
    if (look.glow != null) aura(M.parts[0], 1, 1.2, 1.7, 0.35);
  } else {
    const [bladeG, accG, leatherG] = M.parts;
    const tint = new THREE.Color(look.color != null ? look.color : 0xc8d4e0).multiplyScalar(Math.min(5, 0.8 / M.lum));   // kompensasi: bilah abu-abu palet lebih gelap dari warna target
    if (bladeG) add(bladeG, new THREE.MeshStandardMaterial({ map: M.map, color: tint, metalness: 0.5, roughness: 0.4, emissive: look.emi || 0, emissiveIntensity: look.ei || 0, side: THREE.DoubleSide }));
    if (accG) add(accG, look.glow != null
      ? new THREE.MeshStandardMaterial({ color: look.glow, emissive: look.glow, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide })   // aksen = warna pendar elemen
      : new THREE.MeshStandardMaterial({ map: M.map, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));   // pedang biasa: aksen emas asli
    if (leatherG) add(leatherG, new THREE.MeshStandardMaterial({ map: M.map, metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide }));
    if (look.glow != null && bladeG) aura(bladeG, 1, 1.35, 2.5, 0.3);
  }
  return { group: grp, throatX: M.throatX, tipX: M.tipX, pommelX: M.pommelX, sheathW: M.sheathW };
}
export const swordModelReady = id => !!models[id];

// ---------- muat GLB, siapkan semua model; onUpdate dipanggil tiap satu file selesai (game.js lalu memasang ulang pedang yang sedang dipakai) ----------
async function prepare(src, gltf) {
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const J = gltf.parser.json, m0 = J.materials && J.materials[0], texImg = t => (t && J.textures && J.textures[t.index]) ? J.textures[t.index].source : null;
  let px = null, emiTex = null;
  if (src === 'pack') { try { px = await decodePixels(gltf.parser, texImg(m0 && m0.pbrMetallicRoughness && m0.pbrMetallicRoughness.baseColorTexture)); } catch (e) { console.warn('[pedang] palet warna tidak terbaca, semua bagian dianggap bilah:', e); } }
  if (src === 'dark') { try { emiTex = await emissiveLuma(gltf.parser, texImg(m0 && m0.emissiveTexture)); } catch (e) { console.warn('[pedang] peta emissive tidak terbaca, pendar asli dipakai:', e); } }
  for (const [id, cfg] of Object.entries(SWORD_MODEL)) {
    if (cfg.src !== src) continue;
    const mesh = (cfg.node && meshes.find(m => m.name.includes(cfg.node) || (m.parent && m.parent.name.includes(cfg.node)))) || meshes[cfg.idx || 0];
    if (!mesh) { console.warn('[pedang] mesh untuk "' + id + '" tidak ditemukan di ' + SWORD_FILES[src]); continue; }
    models[id] = bake(mesh, cfg, px, src === 'dark' ? { dark: true, emiTex } : {});
  }
}
export function loadSwordModels(onUpdate) {
  for (const [src, file] of Object.entries(SWORD_FILES)) {
    new GLTFLoader().load(file, async gltf => {
      try { await prepare(src, gltf); if (onUpdate) onUpdate(); console.info('[pedang] model siap:', file); }
      catch (e) { console.warn('[pedang] ' + file + ' gagal disiapkan, memakai pedang bawaan:', e); }
    }, undefined, err => console.warn('[pedang] ' + file + ' tidak ditemukan / gagal dimuat (taruh di folder yang sama dengan louiss.vrm); memakai pedang bawaan:', err));
  }
}

export const _test = { bake, classify, models };   // hanya untuk pengujian
