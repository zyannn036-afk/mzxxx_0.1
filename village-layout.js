// ============================================================
//  DESA PADANG HIJAU — data tata letak (murni angka, tanpa THREE)
//  Dipakai oleh world.js (bangun desa), npcs.js (penempatan NPC) dan game.js (pesan masuk desa).
// ============================================================
export const VILLAGE = { name: 'Desa Padang Hijau', x: 34, z: 31, radius: 17 };
const V = (x, z) => ({ x: VILLAGE.x + x, z: VILLAGE.z + z });
const faceCenter = (p, dx = VILLAGE.x, dz = VILLAGE.z) => Math.atan2(dx - p.x, dz - p.z); // yaw agar sisi depan (+z lokal) menghadap pusat desa

// kind: 'hip' = atap limas, 'gable' = atap pelana, 'barn' = lumbung (pelana besar, dinding papan)
export const HOUSES = [
  { id: 'A', ...V(-4, -9.5), w: 4.8, d: 4.0, kind: 'hip', wall: 0xe3d3ae, roof: 0xa8472e },
  { id: 'B', ...V(6, -9.5), w: 4.4, d: 3.8, kind: 'gable', wall: 0xdccaa0, roof: 0xc7a24d },
  { id: 'C', ...V(11.5, 0.5), w: 4.2, d: 4.4, kind: 'hip', wall: 0xe8dcc0, roof: 0x8a3b2c },
  { id: 'D', ...V(6.5, 9.5), w: 5.0, d: 4.0, kind: 'gable', wall: 0xdccaa0, roof: 0xa8472e },
  { id: 'E', ...V(-5, 10.5), w: 7.0, d: 5.0, kind: 'barn', wall: 0xa8744a, roof: 0x7b3b2a },
].map(h => ({ ...h, yaw: faceCenter(h) }));

// lingkaran penghalang yang mengikuti bentuk persegi panjang bangunan
export function footprintCircles(h) {
  const r = h.d / 2, span = Math.max(0, h.w / 2 - r), n = span < 0.05 ? 1 : Math.ceil(span / (r * 0.9)) + 1, out = [];
  for (let i = 0; i < n; i++) {
    const lx = n === 1 ? 0 : -span + (2 * span * i) / (n - 1);
    out.push({ x: h.x + Math.cos(h.yaw) * lx, z: h.z - Math.sin(h.yaw) * lx, r });
  }
  return out;
}

export const WELL = { ...V(0, 0), r: 1.1 };
export const CAMPFIRE = V(-2.8, 3.4);
export const STALL = { ...V(-8, 4), yaw: Math.PI / 2, w: 3.2, d: 1.8 };   // sisi depan menghadap timur (ke alun-alun)
export const PLOT = { ...V(-10.5, -6.5), w: 5, d: 4 };                    // ladang / kebun
export const HAYSTACKS = [V(-11.5, 9.5), V(-10.2, 12.2)];
export const BARRELS = [V(3.9, 7.2), V(9.4, 7), V(-7.6, 6.4), V(-6.9, 6.9)];
export const CRATES = [V(4.4, -7.1), V(3.6, -6.6), V(-8.4, 2.2)];
export const LAMPS = [V(4, 3.4), V(-4.2, -3.6), V(8.2, -5)];
export const PLAZA_R = 5.6;
export const SIGN = { x: 24.6, z: 33.4, yaw: Math.atan2(-1, -0.25) };     // papan nama di jalan masuk

// jalan tanah: dari titik muncul pemain ke alun-alun, lalu cabang ke pintu tiap rumah
export const ENTRANCE_PATH = [[13, 27], [18, 27.6], [23, 29.2], [27.5, 30.6], [31, 31]];
export function doorPoint(h, out = 0.9) { // titik tepat di depan pintu
  return { x: h.x + Math.sin(h.yaw) * (h.d / 2 + out), z: h.z + Math.cos(h.yaw) * (h.d / 2 + out) };
}

// NPC: tex = warna tekstur Peasant; patrol = titik jalan, dilalui bolak-balik (kalau ada)
export const NPCS = [
  { name: 'Pak Tarno', role: 'Petani', tex: 'green', ...V(-10.6, -2.8), look: V(-10.5, -6.5),
    lines: ['Panen tahun ini bagus... tapi cahaya ungu dari lubang itu bikin ayam-ayamku gelisah.', 'Kalau mau ke dungeon, ikuti jalan tanah ke arah barat daya.'] },
  { name: 'Bu Sari', role: 'Pedagang', tex: 'yellow', ...V(-8.4, 4), look: V(0, 4),
    lines: ['Selamat datang! Dagangan lagi sepi, jalur dagang ditutup monster dari lubang.', 'Pahlawan seperti kamu pasti bisa membereskannya!'] },
  { name: 'Bu Lastri', role: 'Warga', tex: 'blue', ...V(1.9, -1.8), look: V(0, 0),
    lines: ['Air sumur ini dingin dan segar. Minumlah dulu sebelum berangkat.', 'Katanya ada naga api di dasar lubang itu... hiii.'] },
  { name: 'Mang Ujang', role: 'Warga', tex: 'brown', ...V(-4.4, 4.6), look: CAMPFIRE,
    lines: ['Api unggun ini menghangatkan malam. Duduklah sebentar.', 'Dulu lubang itu cuma kubangan. Sekarang cahayanya ungu...'] },
  { name: 'Pak Hasan', role: 'Penjaga Desa', tex: 'blue', ...V(-11.8, 1.6), look: V(-13, -1.2),
    lines: ['Hati-hati di luar sana. Aku berjaga di sini sejak monster mulai muncul.', 'Lubang dungeon ada di tengah dataran, ikuti papan petunjuk.', 'Di sebelah timur desa ada Hutan Besar. Lewati gerbang kayu, tapi jangan sampai tersesat ya.'] },
  { name: 'Dewi', role: 'Anak Desa', tex: 'brown', ...V(8.6, 5.2), look: V(11.5, 0.5), scale: 0.72,
    lines: ['Kak, Kakak pendekar ya? Keren!', 'Aku nggak boleh dekat-dekat lubang. Kata ibu bahaya.'] },
  // dua warga yang berjalan-jalan di desa
  { name: 'Pak Darmo', role: 'Warga', tex: 'yellow', ...V(-1, -5.5), look: V(0, 0),
    patrol: [V(-1, -5.5), V(4.5, -4.2), V(4.8, 5.2)],
    lines: ['Aku sedang jalan sore. Udara desa kita memang paling segar.', 'Jangan lupa mampir ke warung Bu Sari.'] },
  { name: 'Bu Minah', role: 'Warga', tex: 'green', ...V(7.8, -2.4), look: V(0, 0),
    patrol: [V(7.8, -2.4), V(2.5, -6), V(-6.5, -2.2)],
    lines: ['Permisi, permisi... mau ke ladang dulu.', 'Pahlawan, semoga selamat dari dungeon ya!'] },
];

// area yang harus bebas rumput / bunga di dalam desa
export function villageClearAt(x, z, pad = 0) {
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < PLAZA_R + pad) return true;
  for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < Math.max(h.w, h.d) / 2 + 1.4 + pad) return true;
  if (Math.abs(x - PLOT.x) < PLOT.w / 2 + 0.8 + pad && Math.abs(z - PLOT.z) < PLOT.d / 2 + 0.8 + pad) return true;
  if (Math.hypot(x - STALL.x, z - STALL.z) < 2.6 + pad) return true;
  if (Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 3 + pad) return true;
  return false;
}
