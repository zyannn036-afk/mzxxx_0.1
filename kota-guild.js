import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { lyra, LYRA } from './party-lyra.js';   // Lyra: penyihir yang menunggu di guild dan bisa direkrut jadi party (model lyra.vrm; logika di party-lyra.js)
import { DUNGEON_GATES, DUNGEON_TOWN } from './kota-dungeon.js';
import { loadKnights } from './kekaisaran-ksatria.js';   // ksatria & prajurit yang sama dengan di Kekaisaran (model dari folder prajurit/)

// ============================================================
//  BALAI PETUALANG (Guild) — interior yang bisa dimasuki di Kota Dungeon.
//  Ruangan dibangun terpisah jauh dari dunia (GUILD_POS), seperti Penginapan: pintu depan guild (kota-dungeon.js) -> layar memudar -> pemain dipindah ke sini.
//  Isi: meja resepsionis (Mira), meja Master Guild (Garrick), Papan Misi (6 dungeon), peta Lembah Bebatuan, perapian, meja makan + petualang lain, rak senjata.
//  Semua koordinat di file ini LOKAL (pusat ruangan = 0,0; x = kanan, z = ke arah pintu depan). API ke luar memakai koordinat dunia.
// ============================================================
export const GUILD_POS = { x: 7000, z: -7000 };
export const GUILD_ROOM = { hx: 14, hz: 11, h: 7.5 };   // setengah lebar, setengah dalam, tinggi langit-langit

export function buildGuildInterior() {
  const { hx, hz, h } = GUILD_ROOM, OX = GUILD_POS.x, OZ = GUILD_POS.z;
  const group = new THREE.Group(); group.name = 'balai-petualang'; group.position.set(OX, 0, OZ); group.visible = false;
  const anim = [];   // fungsi(dt, t, lx, lz) yang dijalankan tiap frame saat ruangan tampil
  const boxes = [], circles = [];   // tabrakan: kotak {x0,x1,z0,z1} & lingkaran {x,z,r} (lokal)
  const addBox = (cx, cz, w, d) => boxes.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
  const addCircle = (x, z, r) => circles.push({ x, z, r });

  // ---------- helper ----------
  const ctex = (w, hh, draw, rep = false) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; draw(c.getContext('2d'), w, hh); const t = new THREE.CanvasTexture(c); if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const speck = (x, w, hh, n, c0, c1, a) => { for (let i = 0; i < n; i++) { const g = c0 + Math.random() * (c1 - c0) | 0; x.fillStyle = `rgba(${g},${g - 6},${g - 14},${a})`; x.fillRect(Math.random() * w, Math.random() * hh, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, ...o });
  const glow = c => new THREE.MeshBasicMaterial({ color: c });
  const BX = (w, hh, d) => new THREE.BoxGeometry(w, hh, d), CY = (a, b, hh, n = 10) => new THREE.CylinderGeometry(a, b, hh, n);
  const mesh = (geo, m, x, y, z, parent = group) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); parent.add(k); return k; };
  const woodM = M(0x7a5232), darkM = M(0x3f2a18), midM = M(0x5a3b22), tinM = M(0xb9b4a8, { metalness: 0.5, roughness: 0.5 }), goldM = M(0xd9b24a, { metalness: 0.7, roughness: 0.4 });

  // ---------- tekstur ----------
  const floorT = ctex(256, 256, (x, w) => {
    x.fillStyle = '#6a4726'; x.fillRect(0, 0, w, w);
    for (let i = 0; i < 8; i++) { const g = Math.random() * 30 | 0; x.fillStyle = `rgb(${106 + g},${71 + g * 0.6 | 0},${38 + g * 0.4 | 0})`; x.fillRect(i * 32, 0, 31, w); }
    x.fillStyle = 'rgba(20,10,4,.75)'; for (let i = 0; i < 8; i++) { x.fillRect(i * 32 + 31, 0, 1.5, w); x.fillRect(i * 32, (i * 97) % w, 32, 1.5); }
    for (let i = 0; i < 500; i++) { x.fillStyle = 'rgba(40,22,10,.22)'; x.fillRect(Math.random() * w, Math.random() * w, 1, 6 + Math.random() * 12); }
  }, true); floorT.repeat.set(7, 5.5);
  const wallT = ctex(256, 256, (x, w) => { x.fillStyle = '#d6c298'; x.fillRect(0, 0, w, w); speck(x, w, w, 900, 150, 235, 0.25); }, true);
  const stoneT = ctex(128, 128, (x, w) => { x.fillStyle = '#4a4650'; x.fillRect(0, 0, w, w); for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) { const g = 85 + Math.random() * 40 | 0; x.fillStyle = `rgb(${g},${g - 2},${g + 6})`; x.fillRect(c * 32 + (r % 2) * 16 + 1.5, r * 32 + 1.5, 29, 29); } speck(x, w, w, 200, 50, 140, 0.25); }, true);
  const wallMat = (w, hh) => { const t = wallT.clone(); t.needsUpdate = true; t.repeat.set(w / 4, hh / 4); return M(0xffffff, { map: t }); };
  const stoneMat = (w, hh) => { const t = stoneT.clone(); t.needsUpdate = true; t.repeat.set(w / 1.6, hh / 1.6); return M(0xffffff, { map: t }); };

  // ---------- lantai, dinding, langit-langit ----------
  { const f = mesh(new THREE.PlaneGeometry(hx * 2, hz * 2).rotateX(-Math.PI / 2), M(0xffffff, { map: floorT }), 0, 0, 0); f.receiveShadow = true; }
  mesh(BX(hx * 2 + 1, h, 0.5), wallMat(hx * 2, h), 0, h / 2, -hz - 0.25);                                  // belakang
  for (const s of [-1, 1]) mesh(BX(0.5, h, hz * 2 + 1), wallMat(hz * 2, h), s * (hx + 0.25), h / 2, 0);      // kiri & kanan
  for (const s of [-1, 1]) mesh(BX(hx + 0.5 - 1.6, h, 0.5), wallMat(hx, h), s * (1.6 + (hx + 0.5 - 1.6) / 2), h / 2, hz + 0.25);   // depan: dua sisi pintu
  mesh(BX(3.2, h - 3.6, 0.5), wallMat(3.2, h - 3.6), 0, 3.6 + (h - 3.6) / 2, hz + 0.25);                    // di atas pintu
  // panel kayu rendah + pagar dinding
  mesh(BX(hx * 2, 1.3, 0.1), darkM, 0, 0.65, -hz + 0.05); mesh(BX(hx * 2, 0.1, 0.18), woodM, 0, 1.34, -hz + 0.09);
  for (const s of [-1, 1]) { mesh(BX(0.1, 1.3, hz * 2), darkM, s * (hx - 0.05), 0.65, 0); mesh(BX(0.18, 0.1, hz * 2), woodM, s * (hx - 0.09), 1.34, 0);
    mesh(BX(hx - 1.6, 1.3, 0.1), darkM, s * (1.6 + (hx - 1.6) / 2), 0.65, hz - 0.05); mesh(BX(hx - 1.6, 0.1, 0.18), woodM, s * (1.6 + (hx - 1.6) / 2), 1.34, hz - 0.09); }
  { const ct = floorT.clone(); ct.needsUpdate = true; ct.repeat.set(7, 5.5); mesh(BX(hx * 2 + 1, 0.3, hz * 2 + 1), M(0x5a3d22, { map: ct }), 0, h + 0.15, 0); }
  for (let x = -12; x <= 12; x += 4) mesh(BX(0.4, 0.5, hz * 2), darkM, x, h - 0.25, 0);                        // balok melintang
  for (const z of [-7, 0, 7]) mesh(BX(hx * 2, 0.4, 0.4), darkM, 0, h - 0.7, z);
  // pintu depan: kusen + dua daun pintu terbuka ke dalam
  for (const s of [-1, 1]) mesh(BX(0.28, 3.7, 0.6), darkM, s * 1.74, 1.85, hz);
  mesh(BX(3.8, 0.3, 0.6), darkM, 0, 3.75, hz);
  for (const s of [-1, 1]) { const pv = new THREE.Group(); pv.position.set(s * 1.6, 0, hz - 0.05); pv.rotation.y = s * 1.2; mesh(BX(1.6, 3.5, 0.12), woodM, -s * 0.8, 1.75, 0, pv); mesh(BX(1.5, 0.12, 0.14), goldM, -s * 0.8, 1.2, 0.02, pv); mesh(BX(1.5, 0.12, 0.14), goldM, -s * 0.8, 2.6, 0.02, pv); group.add(pv); }
  { const t = ctex(256, 64, (x, w, hh) => { x.fillStyle = '#2a1a0e'; x.fillRect(0, 0, w, hh); x.strokeStyle = '#d9b24a'; x.lineWidth = 4; x.strokeRect(3, 3, w - 6, hh - 6); x.fillStyle = '#ffe9a8'; x.font = 'bold 34px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('⬇ KELUAR', w / 2, hh / 2); });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: t })); p.position.set(0, 4.3, hz - 0.08); p.rotation.y = Math.PI; group.add(p); }
  for (const s of [-1, 1]) { mesh(BX(0.35, 0.5, 0.35), darkM, s * 2.7, 3.0, hz - 0.35); mesh(BX(0.22, 0.34, 0.22), glow(0xffd070), s * 2.7, 3.0, hz - 0.35); }   // lentera di sisi pintu

  // jendela (panel cahaya hangat): dinding kiri & kanan
  const win = (x, z, rotY) => { const g = new THREE.Group(); g.position.set(x, 3.7, z); g.rotation.y = rotY; group.add(g);
    mesh(BX(0.12, 2.4, 1.9), darkM, 0, 0, 0, g); const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.1), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.92 })); p.position.z = 0.07; g.add(p);
    mesh(BX(0.06, 2.1, 0.08), darkM, 0, 0, 0.1, g); mesh(BX(1.6, 0.06, 0.08), darkM, 0, 0, 0.1, g); return g; };
  for (const z of [-7.5, -1, 5.5, 9.2]) win(-hx + 0.09, z, Math.PI / 2);   // normal +x (ke dalam)
  for (const z of [-9, 9]) win(hx - 0.09, z, -Math.PI / 2);

  // ---------- karpet, spanduk lambang, peta, papan misi ----------
  { const t = ctex(128, 512, (x, w, hh) => { x.fillStyle = '#7a1c24'; x.fillRect(0, 0, w, hh); x.fillStyle = '#d9b24a'; x.fillRect(6, 0, 6, hh); x.fillRect(w - 12, 0, 6, hh); x.fillRect(16, 0, 2, hh); x.fillRect(w - 18, 0, 2, hh);
      for (let i = 0; i < hh; i += 64) { x.beginPath(); x.moveTo(w / 2, i + 8); x.lineTo(w / 2 + 14, i + 32); x.lineTo(w / 2, i + 56); x.lineTo(w / 2 - 14, i + 32); x.closePath(); x.fill(); } speck(x, w, hh, 600, 60, 130, 0.15); });
    const c = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 17).rotateX(-Math.PI / 2), M(0xffffff, { map: t })); c.position.set(0, 0.025, 2.4); c.receiveShadow = true; group.add(c); }

  const emblemT = ctex(256, 384, (x, w, hh) => {
    x.fillStyle = '#6e1420'; x.fillRect(0, 0, w, hh); x.fillStyle = '#d9b24a'; x.fillRect(8, 8, w - 16, 6); x.fillRect(8, hh - 14, w - 16, 6); x.fillRect(8, 8, 6, hh - 16); x.fillRect(w - 14, 8, 6, hh - 16);
    x.beginPath(); x.moveTo(w / 2, 56); x.lineTo(w - 46, 86); x.lineTo(w - 46, 200); x.quadraticCurveTo(w / 2 + 40, 280, w / 2, 304); x.quadraticCurveTo(w / 2 - 40, 280, 46, 200); x.lineTo(46, 86); x.closePath();
    x.fillStyle = '#21324f'; x.fill(); x.lineWidth = 7; x.strokeStyle = '#d9b24a'; x.stroke();
    x.lineCap = 'round'; for (const s of [-1, 1]) { x.strokeStyle = '#e8ecf2'; x.lineWidth = 9; x.beginPath(); x.moveTo(w / 2 - s * 56, 100); x.lineTo(w / 2 + s * 56, 232); x.stroke(); x.strokeStyle = '#d9b24a'; x.lineWidth = 12; x.beginPath(); x.moveTo(w / 2 + s * 34 - 14, 208 + (s < 0 ? -2 : 0)); x.stroke(); }
    x.fillStyle = '#d9b24a'; x.beginPath(); x.arc(w / 2, 166, 20, 0, 7); x.fill(); x.fillStyle = '#6e1420'; x.beginPath(); x.arc(w / 2, 166, 9, 0, 7); x.fill();
    x.fillStyle = '#ffe9a8'; x.font = 'bold 26px Georgia'; x.textAlign = 'center'; x.fillText('GUILD', w / 2, 340); x.font = 'bold 15px Georgia'; x.fillText('PETUALANG', w / 2, 362); });
  const emblemM = new THREE.MeshBasicMaterial({ map: emblemT });
  const banner = (x, w, hh, y) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), emblemM); p.position.set(x, y, -hz + 0.12); group.add(p); mesh(BX(w + 0.4, 0.14, 0.14), goldM, x, y + hh / 2 + 0.07, -hz + 0.14); };
  banner(0, 3.0, 4.5, 4.7); banner(-5.2, 1.7, 2.55, 4.2); banner(5.2, 1.7, 2.55, 4.2);

  const COL = { kristal: '#35c8e0', batu: '#a8864a', api: '#e05a1a', es: '#7fd4ff', kegelapan: '#7a4ab0', cahaya: '#ffd24a' };
  const MAIN = { id: 'cahaya', name: 'Dungeon Cahaya', icon: '☀️' };
  const mapT = ctex(512, 384, (x, w, hh) => {
    x.fillStyle = '#d9c28a'; x.fillRect(0, 0, w, hh); speck(x, w, hh, 1500, 150, 220, 0.2); x.strokeStyle = '#6b4a22'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, hh - 12);
    x.fillStyle = '#4a2f12'; x.font = 'bold 28px Georgia'; x.textAlign = 'center'; x.fillText('PETA LEMBAH BEBATUAN', w / 2, 46);
    const cx = w / 2, top = 84, bot = hh - 48;
    x.strokeStyle = 'rgba(90,60,30,.55)'; x.lineWidth = 2; for (let i = 0; i < 160; i++) { const sd = Math.random() < 0.5 ? -1 : 1, px = cx + sd * (70 + Math.random() * 150), py = top + Math.random() * (bot - top); x.beginPath(); x.moveTo(px, py); x.lineTo(px + sd * 12, py - 10); x.stroke(); }
    x.fillStyle = '#c4a96a'; x.fillRect(cx - 62, top, 124, bot - top); x.setLineDash([8, 8]); x.strokeStyle = '#7a5a2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, bot); x.lineTo(cx, top + 10); x.stroke(); x.setLineDash([]);
    const dmin = Math.min(...DUNGEON_GATES.map(g => g.d)) - 50, dmax = DUNGEON_TOWN.gateD, yOf = d => Math.max(top + 24, Math.min(bot - 14, bot - (d - dmin) / Math.max(1, dmax - dmin) * (bot - top - 16)));
    const mark = (px, py, c, icon, name, side) => { x.fillStyle = c; x.beginPath(); x.arc(px, py, 17, 0, 7); x.fill(); x.lineWidth = 3; x.strokeStyle = '#3a2410'; x.stroke(); x.font = '19px sans-serif'; x.textAlign = 'center'; x.fillStyle = '#000'; x.fillText(icon, px, py + 7);
      x.font = 'bold 17px Georgia'; x.fillStyle = '#3a2410'; x.textAlign = side < 0 ? 'right' : side > 0 ? 'left' : 'center'; x.fillText(name, px + side * 26, side ? py + 6 : py - 24); };
    for (const g of DUNGEON_GATES) mark(cx + g.side * 62, yOf(g.d), COL[g.id], g.icon, g.name, g.side);
    mark(cx, top + 6, COL.cahaya, MAIN.icon, MAIN.name, 0);
    x.fillStyle = '#3a2410'; x.font = 'bold 18px Georgia'; x.textAlign = 'center'; x.fillText('▲ Ke Kota Dungeon', cx, hh - 22); });
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), new THREE.MeshBasicMaterial({ map: mapT })); p.position.set(9.5, 3.7, -hz + 0.1); group.add(p);
    mesh(BX(6.3, 0.16, 0.16), darkM, 9.5, 6.0, -hz + 0.13); mesh(BX(6.3, 0.16, 0.16), darkM, 9.5, 1.4, -hz + 0.13); mesh(BX(0.16, 4.8, 0.16), darkM, 6.3, 3.7, -hz + 0.13); mesh(BX(0.16, 4.8, 0.16), darkM, 12.7, 3.7, -hz + 0.13); }

  const NOTE = { kristal: '#bfeaff', batu: '#e3d2a8', api: '#ffd0a8', es: '#e4f6ff', kegelapan: '#d8c8f0', cahaya: '#fff2b8' };
  const boardT = ctex(512, 320, (x, w, hh) => {
    x.fillStyle = '#6b4a2a'; x.fillRect(0, 0, w, hh); for (let i = 0; i < hh; i += 40) { x.fillStyle = 'rgba(20,10,4,.5)'; x.fillRect(0, i, w, 2); } speck(x, w, hh, 1000, 60, 130, 0.25);
    x.fillStyle = '#2a1a0e'; x.fillRect(0, 0, w, 52); x.fillStyle = '#ffe9a8'; x.font = 'bold 34px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('📋 PAPAN MISI', w / 2, 27);
    const ids = ['kristal', 'batu', 'api', 'es', 'kegelapan', 'cahaya'], names = { kristal: 'Gua Kristal', batu: 'Dungeon Batu', api: 'Dungeon Api', es: 'Dungeon Es', kegelapan: 'Dungeon Kegelapan', cahaya: 'Dungeon Cahaya' };
    ids.forEach((id, i) => { const c = i % 3, r = (i / 3) | 0, px = 90 + c * 166, py = 128 + r * 124;
      x.save(); x.translate(px, py); x.rotate((Math.random() - 0.5) * 0.18); x.fillStyle = NOTE[id]; x.fillRect(-64, -48, 128, 96); x.fillStyle = COL[id]; x.fillRect(-64, -48, 128, 8);
      x.fillStyle = '#c0281c'; x.beginPath(); x.arc(0, -42, 6, 0, 7); x.fill(); x.fillStyle = '#3a2410'; x.font = 'bold 15px Georgia'; x.fillText(names[id], 0, -22); x.font = 'bold 13px Georgia'; x.fillText('BASMI BOS', 0, -2);
      for (let k = 0; k < 3; k++) x.fillRect(-46, 12 + k * 12, 70 + Math.random() * 20, 3); x.restore(); }); });
  { const g = new THREE.Group(); g.position.set(hx - 0.14, 0, -3); g.rotation.y = -Math.PI / 2; group.add(g);   // normal -x (ke dalam ruangan)
    mesh(BX(6.4, 0.2, 0.18), darkM, 0, 4.35, 0.0, g); mesh(BX(6.4, 0.2, 0.18), darkM, 0, 0.95, 0.0, g); mesh(BX(0.2, 3.6, 0.18), darkM, -3.2, 2.65, 0.0, g); mesh(BX(0.2, 3.6, 0.18), darkM, 3.2, 2.65, 0.0, g);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.9), new THREE.MeshBasicMaterial({ map: boardT })); p.position.set(0, 2.65, 0.02); g.add(p); }
  for (const z of [-6.4, 0.4]) { mesh(BX(0.3, 0.5, 0.3), darkM, hx - 0.5, 3.3, z); mesh(BX(0.2, 0.3, 0.2), glow(0xffd070), hx - 0.5, 3.3, z); }

  // ---------- perapian di dinding belakang (kiri) ----------
  const flames = []; let fireLight = null;
  { const fx = -9.5, fz = -hz + 0.9; mesh(BX(4.4, 3.8, 1.8), stoneMat(4.4, 3.8), fx, 1.9, fz);
    mesh(BX(3.0, 2.2, 0.3), glow(0x120806), fx, 1.2, fz + 0.9);                                  // lubang api
    mesh(BX(4.8, 0.25, 2.1), darkM, fx, 3.95, fz); mesh(BX(1.8, 0.25, 0.8), stoneMat(1.8, 0.3), fx, 0.12, fz + 1.2);
    for (let i = 0; i < 5; i++) { const f = mesh(new THREE.ConeGeometry(0.34 - i % 2 * 0.06, 1.3 + i % 3 * 0.25, 6), glow(i % 2 ? 0xffb030 : 0xff6a14), fx + (i - 2) * 0.42, 0.65, fz + 0.95); flames.push({ m: f, ph: i * 1.3 }); }
    for (let i = 0; i < 3; i++) mesh(CY(0.17, 0.17, 1.4, 8), darkM, fx + (i - 1) * 0.6, 0.18, fz + 1.0).rotation.z = Math.PI / 2;
    mesh(BX(0.9, 0.9, 0.1), emblemM, fx, 5.3, -hz + 0.1);   // lambang di atas perapian
    fireLight = new THREE.PointLight(0xff8a3a, 30, 15, 2); fireLight.position.set(fx, 1.8, fz + 1.6); group.add(fireLight);
    addBox(fx, fz + 0.2, 4.6, 2.6); }

  // ---------- meja resepsionis (kiri) + lemari arsip ----------
  { const cx = -6.5, cz = -2.5;
    mesh(BX(8, 1.05, 1.4), darkM, cx, 0.525, cz); mesh(BX(8.3, 0.12, 1.7), woodM, cx, 1.11, cz);
    for (let i = 0; i < 4; i++) mesh(BX(1.7, 0.7, 0.05), midM, cx - 3 + i * 2, 0.55, cz + 0.72);
    mesh(BX(0.6, 0.06, 0.8), M(0xe8dcc0), cx - 1.8, 1.19, cz + 0.1).rotation.y = 0.2; mesh(BX(0.5, 0.1, 0.65), M(0x5a1a1a), cx + 1.2, 1.2, cz);
    const bell = mesh(new THREE.ConeGeometry(0.16, 0.2, 10), goldM, cx + 2.6, 1.28, cz + 0.2); bell.position.y = 1.28;
    mesh(CY(0.04, 0.04, 0.3, 6), M(0xf2e8c8), cx - 3.2, 1.32, cz - 0.3); mesh(new THREE.SphereGeometry(0.05, 6, 6), glow(0xffcf60), cx - 3.2, 1.5, cz - 0.3);
    mesh(BX(7.8, 3.2, 0.5), darkM, cx, 1.6, -5.5);   // lemari di belakang resepsionis
    const nb = 3 * 14, inst = new THREE.InstancedMesh(BX(0.45, 0.8, 0.12), M(0xffffff), nb), d = new THREE.Object3D(), col = new THREE.Color();
    for (let r = 0; r < 3; r++) for (let i = 0; i < 14; i++) { d.position.set(cx - 3.5 + i * 0.54, 0.75 + r * 0.95, -5.2); d.scale.set(1, 0.8 + Math.random() * 0.2, 1); d.updateMatrix(); inst.setMatrixAt(r * 14 + i, d.matrix); inst.setColorAt(r * 14 + i, col.setHSL(Math.random(), 0.45, 0.35)); }
    group.add(inst);
    addBox(cx, -4, 8.4, 4.4); }

  // ---------- meja Master Guild (tengah belakang) ----------
  { const cx = 0, cz = -7.5;
    mesh(BX(4.6, 0.95, 1.7), darkM, cx, 0.475, cz); mesh(BX(5, 0.12, 2.0), woodM, cx, 1.0, cz);
    mesh(BX(0.9, 0.12, 0.9), M(0x4a2e1a), cx, 0.06, cz - 1.6); mesh(BX(1.0, 1.7, 0.18), darkM, cx, 1.1, cz - 2.1); mesh(BX(1.0, 0.18, 0.9), M(0x6e1420), cx, 0.55, cz - 1.7);   // kursi
    const gl = mesh(new THREE.SphereGeometry(0.34, 14, 12), M(0x4a7a9a), cx - 1.6, 1.52, cz); mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 20), goldM, cx - 1.6, 1.52, cz).rotation.x = 1.2; mesh(CY(0.08, 0.14, 0.3, 8), goldM, cx - 1.6, 1.2, cz); gl.scale.y = 1;
    for (let i = 0; i < 3; i++) mesh(CY(0.07, 0.07, 0.7, 8), M(0xe8dcc0), cx + 0.6 + i * 0.3, 1.1 + i * 0.12, cz + 0.2).rotation.z = Math.PI / 2;
    mesh(BX(0.7, 0.14, 0.5), M(0x5a1a1a), cx + 1.8, 1.1, cz); mesh(CY(0.05, 0.05, 0.3, 6), M(0xf2e8c8), cx + 2.0, 1.28, cz - 0.4); mesh(new THREE.SphereGeometry(0.06, 6, 6), glow(0xffcf60), cx + 2.0, 1.48, cz - 0.4);
    addBox(cx, -8.9, 5.0, 4.3); }

  // ---------- pilar kayu ----------
  for (const [px, pz] of [[-6.4, 2], [6.4, 2], [-6.4, 7.8], [6.4, 7.8]]) { mesh(CY(0.4, 0.45, h, 10), midM, px, h / 2, pz); mesh(CY(0.55, 0.55, 0.3, 10), darkM, px, 0.15, pz); mesh(CY(0.55, 0.55, 0.3, 10), darkM, px, h - 0.15, pz); addCircle(px, pz, 0.62); }

  // ---------- meja makan + bangku ----------
  const seats = [];
  const table = (tx, tz, angles) => {
    const g = new THREE.Group(); g.position.set(tx, 0, tz); group.add(g);
    mesh(CY(0.95, 0.95, 0.12, 20), woodM, 0, 0.88, 0, g); mesh(CY(0.16, 0.22, 0.85, 10), darkM, 0, 0.42, 0, g); mesh(CY(0.6, 0.6, 0.08, 14), darkM, 0, 0.04, 0, g);
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; mesh(CY(0.09, 0.075, 0.15, 10), tinM, Math.cos(a) * 0.55, 1.02, Math.sin(a) * 0.55, g); }
    mesh(CY(0.05, 0.05, 0.22, 6), M(0xf2e8c8), 0, 1.05, 0, g); mesh(new THREE.SphereGeometry(0.05, 6, 6), glow(0xffcf60), 0, 1.2, 0, g);
    addCircle(tx, tz, 1.05);
    for (const a of angles) { const sx = tx + Math.cos(a) * 1.45, sz = tz + Math.sin(a) * 1.45; mesh(CY(0.34, 0.3, 0.5, 12), woodM, sx, 0.25, sz); addCircle(sx, sz, 0.42); seats.push({ x: sx, z: sz, rot: Math.atan2(tx - sx, tz - sz) }); }
  };
  table(-9.5, 5.0, [0.4, 2.5, 4.6]); table(9.2, 6.5, [0.3, 2.4, 4.5]);

  // ---------- rak senjata (dinding kanan) ----------
  { const g = new THREE.Group(); g.position.set(hx - 0.5, 0, 5.2); g.rotation.y = -Math.PI / 2; group.add(g);
    mesh(BX(3.2, 0.12, 0.7), darkM, 0, 0.9, 0, g); mesh(BX(3.2, 0.12, 0.7), darkM, 0, 1.9, 0, g); mesh(BX(0.15, 2.6, 0.7), darkM, -1.6, 1.3, 0, g); mesh(BX(0.15, 2.6, 0.7), darkM, 1.6, 1.3, 0, g);
    for (let i = 0; i < 5; i++) { const s = mesh(BX(0.07, 1.5, 0.03), tinM, -1.2 + i * 0.6, 1.65, 0.1, g); s.rotation.z = (i - 2) * 0.05; mesh(BX(0.28, 0.06, 0.06), goldM, -1.2 + i * 0.6 + (i - 2) * 0.03, 0.95, 0.1, g); }
    mesh(CY(0.5, 0.5, 0.1, 14), M(0x6e1420), -0.9, 2.9, -0.1, g).rotation.x = Math.PI / 2; mesh(CY(0.5, 0.5, 0.1, 14), M(0x21324f), 0.9, 2.9, -0.1, g).rotation.x = Math.PI / 2;   // dua perisai
    addBox(hx - 0.7, 5.2, 1.4, 3.4); }

  // ---------- tong & peti di sudut ----------
  const barrel = (x, z) => { mesh(CY(0.5, 0.45, 0.95, 12), woodM, x, 0.47, z); mesh(new THREE.TorusGeometry(0.48, 0.04, 6, 14), tinM, x, 0.3, z).rotation.x = Math.PI / 2; mesh(new THREE.TorusGeometry(0.48, 0.04, 6, 14), tinM, x, 0.7, z).rotation.x = Math.PI / 2; addCircle(x, z, 0.55); };
  barrel(-13, 9.6); barrel(-12.1, 10.1); barrel(-13, 8.6);
  for (const [x, z, s] of [[13, 9.8, 1], [13, 8.7, 0.8], [12.2, 9.9, 0.7], [12.9, -9.8, 1]]) { mesh(BX(s, s, s), midM, x, s / 2, z); mesh(BX(s + 0.04, 0.08, s + 0.04), goldM, x, s * 0.75, z); addCircle(x, z, s * 0.75); }

  // ---------- lampu gantung ----------
  const candles = [];
  const chand = (x, z) => { const g = new THREE.Group(); g.position.set(x, h, z); group.add(g); mesh(CY(0.03, 0.03, 1.8, 6), tinM, 0, -0.9, 0, g);
    const r = new THREE.Group(); r.position.y = -1.8; g.add(r); mesh(new THREE.TorusGeometry(1.1, 0.07, 8, 24), goldM, 0, 0, 0, r).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, cx = Math.cos(a) * 1.1, cz = Math.sin(a) * 1.1; mesh(CY(0.05, 0.05, 0.28, 6), M(0xf2e8c8), cx, 0.14, cz, r); candles.push(mesh(new THREE.SphereGeometry(0.075, 6, 6), glow(0xffcf60), cx, 0.34, cz, r)); }
    anim.push((dt, t) => { g.rotation.z = Math.sin(t * 0.8 + x) * 0.025; g.rotation.x = Math.cos(t * 0.7 + z) * 0.02; }); };
  chand(0, 2.5); chand(-8.5, 3.5); chand(8.5, 3.5);

  // ---------- cahaya ----------
  group.add(new THREE.HemisphereLight(0xffe8c0, 0x3a2a1a, 0.6));
  const l1 = new THREE.PointLight(0xffd29a, 45, 26, 2); l1.position.set(0, 5.4, 2.5); group.add(l1);
  const l2 = new THREE.PointLight(0xffd9a0, 28, 17, 2); l2.position.set(0, 5.0, -6); group.add(l2);

  // ---------- NPC ----------
  const tagTex = (name, sub) => ctex(384, 96, (x, w, hh) => { x.fillStyle = 'rgba(30,18,10,.82)'; x.beginPath(); x.roundRect ? x.roundRect(4, 4, w - 8, hh - 8, 16) : x.rect(4, 4, w - 8, hh - 8); x.fill(); x.strokeStyle = '#d9b24a'; x.lineWidth = 3; x.stroke(); x.textAlign = 'center'; x.fillStyle = '#ffe9a8'; x.font = 'bold 34px Georgia'; x.fillText(name, w / 2, 42); x.fillStyle = '#e8d8b0'; x.font = '22px Georgia'; x.fillText(sub, w / 2, 76); });
  const tag = (g, name, sub) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(name, sub), transparent: true, depthWrite: false, fog: false })); s.scale.set(2.2, 0.55, 1); s.position.y = 2.6; g.add(s); return s; };
  const bangMarkT = ctex(64, 64, (x) => { x.fillStyle = '#ffd24a'; x.beginPath(); x.arc(32, 32, 26, 0, 7); x.fill(); x.lineWidth = 4; x.strokeStyle = '#6a4210'; x.stroke(); x.fillStyle = '#4a2a08'; x.font = 'bold 40px Georgia'; x.textAlign = 'center'; x.fillText('!', 32, 46); });
  const mark = (x, y, z) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangMarkT, transparent: true, depthWrite: false, fog: false })); s.scale.set(0.55, 0.55, 1); s.position.set(x, y, z); group.add(s); anim.push((dt, t) => { s.position.y = y + Math.sin(t * 3 + x) * 0.1; }); };
  const MIRA_MODEL = { file: 'mira.glb', height: 1.72, face: 0 };   // face = putaran-y tambahan (radian) bila model tampak menghadap arah lain; 0 = menghadap +z
  const npcs = [];
  function mkNpc(o) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const skin = M(o.skin ?? 0xe6bf98), shirt = M(o.shirt ?? 0x556677), pants = M(o.pants ?? 0x3b3b48), hairM = M(o.hair ?? 0x3a2414);
    const legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.14, 0.85, 0); mesh(BX(0.2, 0.85, 0.22), pants, 0, -0.425, 0, p); body.add(p); return p; });
    const torso = mesh(BX(0.56, 0.72, 0.32), shirt, 0, 1.23, 0, body);
    const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.37, 1.55, 0); mesh(BX(0.16, 0.66, 0.18), shirt, 0, -0.3, 0, p); mesh(BX(0.15, 0.14, 0.16), skin, 0, -0.68, 0, p); body.add(p); return p; });
    if (o.robe) mesh(CY(0.3, 0.62, 1.3, 12), M(o.robe), 0, 0.65, 0, body);
    const head = new THREE.Group(); head.position.y = 1.82; body.add(head);
    mesh(new THREE.SphereGeometry(0.21, 14, 12), skin, 0, 0, 0, head);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.03, 6, 6), darkM, s * 0.08, 0.02, 0.19, head);
    if (o.cap === 'helm') mesh(new THREE.SphereGeometry(0.235, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M(0x9aa0aa, { metalness: 0.6, roughness: 0.5 }), 0, 0.04, 0, head);
    else if (o.cap === 'wizard') { mesh(CY(0.34, 0.34, 0.05, 14), M(o.hat ?? 0x4a2a7a), 0, 0.17, 0, head); mesh(new THREE.ConeGeometry(0.22, 0.6, 12), M(o.hat ?? 0x4a2a7a), 0, 0.46, 0, head); }
    else if (o.cap === 'hood') mesh(new THREE.SphereGeometry(0.255, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), M(o.hat ?? 0x2f5a34), 0, 0.03, -0.02, head);
    else mesh(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.03, -0.01, head);
    if (o.long) mesh(BX(0.4, 0.5, 0.12), hairM, 0, -0.2, -0.16, head);
    if (o.beard) { const b = mesh(new THREE.SphereGeometry(0.17, 10, 8), hairM, 0, -0.14, 0.1, head); b.scale.set(1, 1.2, 0.8); }
    if (o.shoulder) for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.15, 8, 8), M(0x9aa0aa, { metalness: 0.6, roughness: 0.5 }), s * 0.37, 1.6, 0, body);
    if (o.sit) { body.position.y = -0.33; legs.forEach(l => { l.rotation.x = -1.45; }); }
    g.position.set(o.x, 0, o.z); g.rotation.y = o.rot || 0; if (o.scale) g.scale.setScalar(o.scale); group.add(g);
    const tg = o.name ? tag(g, o.name, o.sub) : null;
    const n = { g, body, tag: tg, head, arms, torso, x: o.x, z: o.z, rest: o.rot || 0, look: !!o.look, pose: o.pose || 'stand', ph: Math.random() * 6 }; npcs.push(n);
    if (!o.sit) addCircle(o.x, o.z, 0.5);
    return n;
  }
  const mira = mkNpc({ x: -6.5, z: -4.1, rot: 0, look: true, pose: 'desk', name: 'Mira', sub: 'Resepsionis Guild', shirt: 0x2f5f8f, hair: 0x5a2f1a, long: true });
  // Mira memakai model 3D mira.glb (karakter low-poly berangka Mixamo + animasi IdleAnimation); Mira prosedural di atas dipakai sebagai cadangan bila file gagal dimuat
  let miraMixer = null;
  new GLTFLoader().load(MIRA_MODEL.file, gltf => {
    const m = gltf.scene; let mixer = null;
    if (gltf.animations.length) { mixer = new THREE.AnimationMixer(m); mixer.clipAction(gltf.animations.find(a => /idle/i.test(a.name)) || gltf.animations[0]).play(); mixer.update(0); }
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m), hh = box.max.y - box.min.y, k = isFinite(hh) && hh > 1e-4 ? MIRA_MODEL.height / hh : 0.0095;   // skala otomatis ke tinggi MIRA_MODEL.height
    const wrap = new THREE.Group(); wrap.add(m); m.scale.setScalar(k); m.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);   // kaki di lantai, badan di tengah
    wrap.rotation.y = MIRA_MODEL.face;
    m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; for (const mt of [].concat(o.material)) mt.fog = false; } });
    mira.g.add(wrap); mira.body.visible = false; if (mira.tag) mira.tag.position.y = MIRA_MODEL.height + 0.5; miraMixer = mixer;
  }, undefined, () => { /* gagal dimuat: tetap pakai Mira prosedural */ });
  mkNpc({ x: 0, z: -9.0, rot: 0, look: true, pose: 'hold', name: 'Garrick', sub: 'Master Guild', robe: 0x4a1f2e, shirt: 0x4a1f2e, hair: 0xdcdcdc, beard: true, skin: 0xdcb08a, scale: 1.08 });
  { const s = seats[0]; mkNpc({ x: s.x, z: s.z, rot: s.rot, pose: 'sit', sit: true, shirt: 0x7a8088, cap: 'helm', shoulder: true, pants: 0x4a4a52 }); }
  { const s = seats[1]; mkNpc({ x: s.x, z: s.z, rot: s.rot, pose: 'sit', sit: true, shirt: 0x2f5a34, cap: 'hood', hat: 0x2f5a34, pants: 0x4a3a2a }); }
  { const s = seats[3]; mkNpc({ x: s.x, z: s.z, rot: s.rot, pose: 'sit', sit: true, shirt: 0x5a3a8a, cap: 'wizard', hat: 0x4a2a7a, pants: 0x3a2a4a, beard: true, hair: 0xb0b0b0 }); }
  mkNpc({ x: 12.1, z: -6.2, rot: Math.PI / 2, pose: 'stand', shirt: 0x8a5a2a, hair: 0x2a1a0a, cap: 'hood', hat: 0x6a4a2a });   // membaca papan misi
  mkNpc({ x: -5.6, z: -9.0, rot: -Math.PI / 2, pose: 'stand', shirt: 0x8a3a2a, hair: 0x1a1a1a, shoulder: true });                // dekat perapian

  // ---------- NPC petualang bermodel 3D (GLB) ----------
  // Dua petualang tambahan: low_poly_adventurer__1_.glb (statis, berkacamata, bawa ransel) & low_poly_character_swordsman.glb (berkerangka, tanpa animasi; alas "ground" disembunyikan).
  // Taruh kedua file .glb di folder yang sama dengan mira.glb. Bila gagal dimuat, NPC ini tidak muncul (NPC lain tetap ada).
  // face = putaran-y tambahan (radian) bila model tampak menghadap arah lain (0 = menghadap +z); height = tinggi akhir (m); skipBox = bagian yang tidak ikut hitung tinggi/posisi tengah.
  const GLB_NPCS = [
    { file: 'low_poly_adventurer__1_.glb', name: 'Rowan', sub: 'Petualang', height: 1.75, face: 0, x: 5.2, z: -5.6, rot: -2.3, look: true, flat: true },
    { file: 'low_poly_character_swordsman.glb', name: 'Kaelen', sub: 'Pendekar Pedang', height: 1.82, face: 0, x: 3.4, z: -1.6, rot: 2.6, look: true, hide: /ground/i, skipBox: /weapon|ground/i },
  ];
  const glbNpcs = [], glbMixers = [];
  for (const c of GLB_NPCS) new GLTFLoader().load(c.file, gltf => {
    const m = gltf.scene; let mixer = null;
    if (gltf.animations.length) { mixer = new THREE.AnimationMixer(m); mixer.clipAction(gltf.animations.find(a => /idle|stand/i.test(a.name)) || gltf.animations[0]).play(); mixer.update(0); glbMixers.push(mixer); }
    m.traverse(o => { if (o.isMesh && c.hide && [].concat(o.material).some(mt => c.hide.test(mt.name || ''))) o.visible = false; });
    m.updateMatrixWorld(true);
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    m.traverse(o => { if (o.isMesh && o.visible && !(c.skipBox && [].concat(o.material).some(mt => c.skipBox.test(mt.name || '')))) box.union(tmp.setFromObject(o)); });
    const hh = box.max.y - box.min.y, k = isFinite(hh) && hh > 1e-4 ? c.height / hh : 1;   // skala otomatis ke tinggi c.height
    const inner = new THREE.Group(); inner.add(m); m.scale.setScalar(k); m.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);   // kaki di lantai, badan di tengah
    inner.rotation.y = c.face;
    const g = new THREE.Group(); g.add(inner); g.position.set(c.x, 0, c.z); g.rotation.y = c.rot; group.add(g);
    m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; for (const mt of [].concat(o.material)) { mt.fog = false; if (c.flat) { mt.metalnessMap = null; mt.metalness = 0.05; mt.needsUpdate = true; } } } });
    const tg = tag(g, c.name, c.sub); tg.position.y = c.height + 0.5;
    glbNpcs.push({ g, inner, x: c.x, z: c.z, rest: c.rot, look: c.look, ph: Math.random() * 6 });
    addCircle(c.x, c.z, 0.5);
  }, undefined, () => console.warn(c.file + ' gagal dimuat — NPC ' + c.name + ' tidak ditampilkan'));

  // ---------- Ksatria penjaga guild (model sama dengan ksatria Aula Kekaisaran) ----------
  // model = 'ksatria' | 'kapten' | 'ksatriawati'. Dua penjaga di kiri-kanan pintu depan, satu kapten di belakang dekat meja Garrick; semuanya menghadap pusat ruangan. Tanpa animasi jalan: berdiri jaga (gerak napas).
  const GUILD_KNIGHTS = [
    { name: 'Prajurit Arga', role: 'Penjaga Guild', model: 'ksatria', x: -3.1, z: hz - 1.4 },
    { name: 'Ksatriawati Dewi', role: 'Penjaga Guild', model: 'ksatriawati', x: 3.1, z: hz - 1.4 },
    { name: 'Kapten Bram', role: 'Kapten Penjaga', model: 'kapten', x: 4.6, z: -9.0 },
  ].map(d => ({ ...d, scale: 1, ksatria: true, lines: [], yaw: Math.atan2(-d.x, -d.z), wx: d.x, wz: d.z, look: null, patrol: null }));
  const knightMixers = [];
  try {
    loadKnights(GUILD_KNIGHTS, (def, n) => {
      const pivot = new THREE.Group(); pivot.position.set(def.x, 0, def.z); pivot.rotation.y = def.yaw; pivot.add(n.holder); group.add(pivot);
      n.holder.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); for (const mt of [].concat(o.material)) mt.fog = false; } });   // bahan disalin agar ksatria di kota tidak ikut tanpa kabut
      n.idle.play(); n.idle.time = Math.random() * n.idle.getClip().duration; n.mixer.update(0); knightMixers.push(n.mixer);
      const tg = tag(pivot, def.name, def.role); tg.position.y = 2.7; addCircle(def.x, def.z, 0.5);
    });
  } catch (e) { console.warn('Ksatria guild gagal dimuat:', e); }

  // ---------- Lyra (model VRM lyra.vrm): berdiri di guild sampai direkrut; setelah direkrut ia ikut pemain (dikendalikan party-lyra.js) ----------
  const lyraCircle = { x: LYRA.home.x, z: LYRA.home.z, r: lyra.recruited ? 0 : 0.5 }; circles.push(lyraCircle);   // tabrakan hanya selama ia berdiri di guild
  lyra.placeInGuild(group);

  // ---------- titik interaksi (koordinat dunia) ----------
  const mk = (id, who, short, fx, fy, fz, sx, sz, r, dist) => ({ id, who, short, x: OX + fx, y: fy, z: OZ + fz, sx: OX + sx, sz: OZ + sz, r, dist });
  const spots = [
    mk('recep', '🧑‍💼 Mira — Resepsionis Guild', 'Mira', -6.5, 0, -4.1, -6.5, -0.7, 3.0, 1.7),
    mk('master', '🧙 Garrick — Master Guild', 'Garrick', 0, 0, -9.0, 0, -5.2, 3.0, 2.2),
    mk('board', '📋 Papan Misi', 'Papan Misi', 13.4, 0.55, -3, 11.9, -3, 2.8, 4.4),
    mk('lyra', LYRA.icon + ' ' + LYRA.name + ' — ' + LYRA.role, LYRA.name, LYRA.home.x, 0, LYRA.home.z, LYRA.home.x, LYRA.home.z + 1.3, 2.6, 2.0),   // hanya aktif selama Lyra belum direkrut (lihat nearSpot)
  ];
  mark(-6.5, 3.05, -4.1); mark(0, 3.2, -9.0); mark(hx - 0.7, 5.1, -3);

  // ---------- semua bahan: tanpa kabut (ruangan tertutup) ----------
  group.traverse(o => { const ms = [].concat(o.material || []); for (const m of ms) m.fog = false; });

  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  return {
    group, spots, name: 'Balai Petualang',
    spawn: { x: OX, z: OZ + 6.4, face: Math.PI },   // di depan pintu, menghadap ke dalam (-z)
    show(on) { group.visible = !!on; },
    inside(x, z) { return Math.abs(x - OX) < hx + 1 && Math.abs(z - OZ) < hz + 1; },
    nearExit(x, z) { const lx = x - OX, lz = z - OZ; return lz > hz - 2.3 && Math.abs(lx) < 2.2; },
    nearSpot(x, z) { let best = null, bd = 1e9; for (const s of spots) { if (s.id === 'lyra' && lyra.recruited) continue; const d = Math.hypot(x - s.sx, z - s.sz); if (d < s.r && d < bd) { bd = d; best = s; } } return best; },
    collide(p, r) {   // dorong pemain / Isabel keluar dari dinding & perabot (p dalam koordinat dunia, diubah langsung)
      let x = p.x - OX, z = p.z - OZ;
      for (let it = 0; it < 2; it++) {
        x = Math.min(hx - 0.2 - r, Math.max(-hx + 0.2 + r, x)); z = Math.min(hz - 0.2 - r, Math.max(-hz + 0.2 + r, z));
        for (const b of boxes) {
          const cx = Math.min(b.x1, Math.max(b.x0, x)), cz = Math.min(b.z1, Math.max(b.z0, z)), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d > 1e-5) { x = cx + dx / d * r; z = cz + dz / d * r; }
          else { const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bt = b.z1 - z, m = Math.min(l, rr, t, bt); if (m === l) x = b.x0 - r; else if (m === rr) x = b.x1 + r; else if (m === t) z = b.z0 - r; else z = b.z1 + r; }
        }
        for (const c of circles) { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = r + c.r; if (d < m) { if (d > 1e-5) { x = c.x + dx / d * m; z = c.z + dz / d * m; } else x = c.x + m; } }
      }
      p.x = x + OX; p.z = z + OZ;
    },
    groundY() { return 0; },
    clipCam(pp, cp) {   // kamera tetap di dalam ruangan: dipendekkan sepanjang garis pemain -> kamera
      const px = pp.x - OX, pz = pp.z - OZ, py = pp.y + 1.4, cx = cp.x - OX, cz = cp.z - OZ; let t = 1;
      const lim = (v, p, hi, lo) => { if (v > hi) t = Math.min(t, (hi - p) / (v - p)); else if (v < lo) t = Math.min(t, (lo - p) / (v - p)); };
      lim(cx, px, hx - 0.6, -hx + 0.6); lim(cz, pz, hz - 0.6, -hz + 0.6); lim(cp.y, py, h - 0.45, 0.4);
      if (t < 1) {
        t = Math.max(t, 0.18);   // jangan menciut sampai menempel di kepala pemain
        const nx = px + (cx - px) * t, nz = pz + (cz - pz) * t, ny = py + (cp.y - py) * t;
        cp.set(OX + Math.min(hx - 0.6, Math.max(-hx + 0.6, nx)), Math.min(h - 0.45, Math.max(0.4, ny)), OZ + Math.min(hz - 0.6, Math.max(-hz + 0.6, nz)));   // penjepit akhir: pemain di sudut pun kamera tetap di dalam ruangan
      }
    },
    update(dt, t, wx, wz) {
      const lx = wx - OX, lz = wz - OZ;
      lyraCircle.r = lyra.recruited ? 0 : 0.5;
      for (const f of anim) f(dt, t, lx, lz);
      if (miraMixer) miraMixer.update(dt);
      for (const mx of glbMixers) mx.update(dt);
      for (const mx of knightMixers) mx.update(dt);
      for (const n of glbNpcs) {   // NPC petualang GLB: menoleh ke pemain bila dekat + napas/goyang halus (modelnya tanpa animasi)
        const near = n.look && Math.hypot(lx - n.x, lz - n.z) < 8, tg = near ? Math.atan2(lx - n.x, lz - n.z) : n.rest;
        n.g.rotation.y += wrap(tg - n.g.rotation.y) * Math.min(1, dt * 4);
        n.inner.scale.y = 1 + 0.008 * Math.sin(t * 1.8 + n.ph); n.inner.rotation.z = 0.012 * Math.sin(t * 0.9 + n.ph);
      }
      for (const n of npcs) {   // NPC menoleh ke pemain bila dekat, bernapas, bergerak sesuai pose
        const near = n.look && Math.hypot(lx - n.x, lz - n.z) < 8, tg = near ? Math.atan2(lx - n.x, lz - n.z) : n.rest;
        n.g.rotation.y += wrap(tg - n.g.rotation.y) * Math.min(1, dt * 4);
        n.torso.scale.y = 1 + 0.012 * Math.sin(t * 1.8 + n.ph);
        const a = n.arms, s = Math.sin(t * 2 + n.ph);
        if (n.pose === 'desk') { a[0].rotation.x = -0.8 + 0.06 * s; a[1].rotation.x = -0.9 + 0.1 * Math.sin(t * 3 + n.ph); }
        else if (n.pose === 'hold') { a[0].rotation.x = 0.28; a[1].rotation.x = 0.28; }
        else if (n.pose === 'sit') { a[0].rotation.x = -0.8; a[1].rotation.x = -0.8 - 0.7 * Math.pow(Math.max(0, Math.sin(t * 0.6 + n.ph)), 3); }
        else { a[0].rotation.x = 0.05 * s; a[1].rotation.x = -0.05 * s; }
        n.head.rotation.x = near ? 0 : 0.03 * Math.sin(t * 0.9 + n.ph);
      }
      for (const f of flames) f.m.scale.set(1, 0.8 + 0.35 * Math.sin(t * 9 + f.ph) + 0.1 * Math.random(), 1);
      if (fireLight) fireLight.intensity = 28 + 6 * Math.sin(t * 9) + 3 * Math.random();
      for (let i = 0; i < candles.length; i++) candles[i].scale.setScalar(0.9 + 0.2 * Math.sin(t * 11 + i * 2));
    },
  };
}
