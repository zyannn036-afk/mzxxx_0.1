// ============================================================
//  LADANG SAWAH GEMAH RIPAH — data tata letak (murni angka, tanpa THREE)
//  Hamparan persawahan di UJUNG Padang Rumput Arunika: dari gerbang perbatasan padang (meadow-layout.js: IMPERIAL / PERBATASAN, sekarang terbuka)
//  jalan tanah berkelok ±760 m ke timur, diapit saluran irigasi dan petak-petak sawah bertingkat tumbuh (macet air, bibit, hijau, menguning, panen),
//  dan berakhir di gerbang Kota Kekaisaran (KEKAISARAN, BELUM dibuka).
//  Dipakai oleh sawah.js (isi ladang), world.js (chunk), forest-layout.js (batas dunia), meadow.js (menyingkirkan pohon di mulut ladang) dan game.js (pesan masuk).
//
//  Seperti padang: area jelajah = rantai lingkaran di sepanjang jalan. Dekat gerbang padang lingkarannya kecil (corong), lalu melebar sampai ±60 m
//  untuk memuat tiga baris petak di tiap sisi jalan, lalu menyempit lagi menuju gerbang Kota Kekaisaran.
// ============================================================
import { IMPERIAL, smooth } from './meadow-layout.js';

export const SAWAH = { name: 'Ladang Sawah Gemah Ripah' };

const SX = IMPERIAL.x, SZ = IMPERIAL.z;   // ujung jalan padang = awal jalan ladang (di balik pagar perbatasan padang)

// titik kendali jalan (world): kurva S yang sangat landai (jari-jari lengkung > ±600 m) supaya petak-petak sejajar jalan tetap rapi
export const SAWAH_ROAD = [
  [SX, SZ], [SX + 50, SZ + 2], [SX + 110, SZ + 8], [SX + 170, SZ + 18], [SX + 230, SZ + 26], [SX + 290, SZ + 28], [SX + 350, SZ + 22],
  [SX + 410, SZ + 12], [SX + 470, SZ + 2], [SX + 530, SZ - 6], [SX + 590, SZ - 10], [SX + 650, SZ - 8], [SX + 710, SZ - 2], [SX + 765, SZ + 4],
];
export const SAWAH_PTS = smooth(SAWAH_ROAD, 12);
export const SAWAH_LEN = SAWAH_PTS[SAWAH_PTS.length - 1].s;
// titik di jalan pada jarak s dari gerbang padang (interpolasi); tx,tz = arah jalan (satuan)
export function sroadAt(s) {
  const P = SAWAH_PTS; s = Math.min(SAWAH_LEN, Math.max(0, s));
  let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], t = (s - a.s) / ((b.s - a.s) || 1), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  return { x: a.x + dx * t, z: a.z + dz * t, tx: dx / l, tz: dz / l, s };
}
// titik di samping jalan: beta > 0 = sisi kanan (selatan saat menghadap timur), beta < 0 = kiri (utara)
export function sside(s, beta) { const p = sroadAt(s); return { x: p.x - p.tz * beta, z: p.z + p.tx * beta, tx: p.tx, tz: p.tz, s }; }

// Kota Kekaisaran (kekaisaran.js): jalan berakhir di Gerbang Utama kota segi lima; gerbang kayu perbatasan lama sudah dibongkar
export const KEKAISARAN = { name: 'Kota Kekaisaran', open: true, x: SAWAH_PTS[SAWAH_PTS.length - 1].x, z: SAWAH_PTS[SAWAH_PTS.length - 1].z };
export const KEKAISARAN_GATE = (() => { const p = sroadAt(SAWAH_LEN - 10); return { x: p.x, z: p.z, tx: p.tx, tz: p.tz, yaw: Math.atan2(p.tx, p.tz), half: 36, gap: 3.2 }; })();

// ---------- Area jelajah ----------
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
export const SAWAH_CIRCLES = [];
for (let s = 0, i = 0; s < SAWAH_LEN - 40; s += 22, i++) {
  const p = sroadAt(s), open = ease(s / 120), close = ease((SAWAH_LEN - 40 - s) / 130);
  const r = Math.min(16 + 44 * open, 32 + 28 * close) + open * close * (3 * Math.sin(i * 1.7) + 2 * Math.sin(i * 0.5));
  SAWAH_CIRCLES.push({ x: p.x, z: p.z, r });
}
{ const p = sroadAt(SAWAH_LEN - 40); SAWAH_CIRCLES.push({ x: p.x, z: p.z, r: 32 }); }   // penutup ujung (gerbang Kota Kekaisaran)

// jarak ke tepi ladang: negatif = di dalam
export function sawahDist(x, z) {
  let m = Infinity;
  for (let i = 0; i < SAWAH_CIRCLES.length; i++) { const c = SAWAH_CIRCLES[i], d = Math.hypot(x - c.x, z - c.z) - c.r; if (d < m) m = d; }
  return m;
}

// ---------- Petak sawah ----------
// Tiga baris petak di tiap sisi jalan (jarak tepi dari garis tengah jalan). Saluran irigasi (±5,2 m) dan tepi jalan ada di antara jalan dan baris pertama.
export const ROW_EDGES = [7.6, 20.6, 34.0, 47.2];
export const CANAL = { off: 5.3, w: 1.5 };   // saluran irigasi di kedua sisi jalan: jarak dari garis tengah & lebar air
export const DIKE_W = 0.8;                   // lebar pematang (tanggul) di tiap tepi petak

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// pos istirahat (saung di tepi jalan, sisi selatan) di tengah ladang
export const SAWAH_SPOTS = (() => {
  const s = Math.round(SAWAH_LEN * 0.5), p = sside(s, 13.5);
  return { rest: { s, x: p.x, z: p.z, r: 9.5, tx: p.tx, tz: p.tz }, signEvery: 125 };
})();

function kappa(s) {   // kelengkungan jalan (rad/m): > 0 = berbelok ke sisi beta > 0
  const a = sroadAt(s - 6), b = sroadAt(s + 6); let d = Math.atan2(b.tz, b.tx) - Math.atan2(a.tz, a.tx);
  while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return d / ((b.s - a.s) || 1);
}

// jenis petak: 'mud' dibajak (lumpur), 'flood' digenangi + bibit baru, 'young' anakan, 'grown' hijau subur, 'ripe' menguning, 'harvest' sisa panen,
// 'corn' palawija (jagung), 'pond' kolam ikan, 'hut' halaman + gubuk, 'barn' lumbung padi, 'palm' kebun kelapa
const FORCED = { 2: ['hut', 1, 0], 5: ['palm', -1, 1], 7: ['pond', 1, 2], 9: ['barn', -1, 0], 10: ['corn', 1, 1], 11: ['hut', -1, 2] };   // (nomor stasiun % 12) -> [jenis, sisi, baris]

export const SAWAH_PLOTS = [];   // {x,z,yaw,w,d,kind,sd,row,s,b}: w = lebar (melintang jalan), d = panjang (searah jalan), keduanya TERMASUK pematang
export const SAWAH_LANES = [];   // jalan setapak tegak lurus jalan (dengan jembatan kecil di atas saluran): {s,x,z,tx,tz}
(() => {
  const rnd = mulberry32(20261102), rest = SAWAH_SPOTS.rest;
  let s = 30, j = 0;
  while (s < SAWAH_LEN - 70) {
    if (j % 5 === 4) { const sc = s + 1.3, p = sroadAt(sc); SAWAH_LANES.push({ s: sc, x: p.x, z: p.z, tx: p.tx, tz: p.tz }); s += 2.6; j++; continue; }   // setapak sempit di antara dua petak
    const L = 17 + rnd() * 6, sc = s + L / 2, p = sroadAt(sc), k = kappa(sc), yaw = Math.atan2(-p.tz, p.tx);
    const cs = Math.cos(yaw), sn = Math.sin(yaw), nx = -p.tz, nz = p.tx;
    for (const sd of [-1, 1]) for (let row = 0; row < 3; row++) {
      const e0 = ROW_EDGES[row], e1 = ROW_EDGES[row + 1], off = (e0 + e1) / 2, beta = sd * off, f = 1 - k * beta;
      const w = e1 - e0, d = L * f, x = p.x + nx * beta, z = p.z + nz * beta;
      // seluruh sudut petak (+ tepi) harus di dalam area jelajah, dan tidak menabrak pos istirahat
      let ok = true;
      for (const [lx, lz] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]]) {
        const ax = lx * d / 2, az = lz * w / 2, wx = x + ax * cs + az * sn, wz = z - ax * sn + az * cs;
        if (sawahDist(wx, wz) > -1.2 || Math.hypot(wx - rest.x, wz - rest.z) < rest.r) { ok = false; break; }
      }
      if (!ok) continue;
      let kind;
      const forced = FORCED[j % 12];
      if (forced && forced[1] === sd && forced[2] === row && j >= 2) kind = forced[0];
      else {
        let v = Math.sin(sc * 0.018 + row * 1.3 + sd * 0.7) + 0.5 * Math.sin(sc * 0.047 + sd * 2.1 + row * 0.8);   // tahap tanam menyatu antar petak tetangga
        if (rnd() < 0.2) v += (rnd() - 0.5) * 1.3;
        kind = v < -1.0 ? 'mud' : v < -0.45 ? 'flood' : v < 0.1 ? 'young' : v < 0.7 ? 'grown' : v < 1.15 ? 'ripe' : 'harvest';
        const q = rnd();
        if (q < 0.07) kind = 'corn'; else if (q < 0.10) kind = 'pond'; else if (q < 0.13) kind = 'hut'; else if (q < 0.17) kind = 'palm';
        else if (q < 0.185) kind = 'barn';
      }
      SAWAH_PLOTS.push({ x, z, yaw, w, d, kind, sd, row, s: sc, b: beta });
    }
    s += L; j++;
  }
})();

// cari petak yang memuat titik (x,z) (+ pad), atau null. Dipakai untuk membersihkan rumput / pohon dari dalam petak.
const PG = new Map(), PC = 16, pk = (i, k) => (i + 4096) * 8192 + (k + 4096);
SAWAH_PLOTS.forEach((p, idx) => {
  const r = Math.hypot(p.w, p.d) / 2 + 1, x0 = Math.floor((p.x - r) / PC), x1 = Math.floor((p.x + r) / PC), z0 = Math.floor((p.z - r) / PC), z1 = Math.floor((p.z + r) / PC);
  for (let i = x0; i <= x1; i++) for (let k = z0; k <= z1; k++) { const key = pk(i, k); let l = PG.get(key); if (!l) PG.set(key, l = []); l.push(idx); }
});
export function plotAt(x, z, pad = 0) {
  const l = PG.get(pk(Math.floor(x / PC), Math.floor(z / PC))); if (!l) return null;
  for (const idx of l) {
    const p = SAWAH_PLOTS[idx], dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= p.d / 2 + pad && Math.abs(lz) <= p.w / 2 + pad) return p;
  }
  return null;
}

// Ladang dibangun dalam beberapa chunk (urut dari gerbang padang, ±260 m per bagian): batas x tiap bagian.
export const SAWAH_SEG_X = (() => { const END = KEKAISARAN.x + 60, xs = [SX]; while (xs[xs.length - 1] + 260 * 1.4 < END) xs.push(xs[xs.length - 1] + 260); xs.push(END); return xs; })();

// ---------- Warga ladang (NPC) ----------
// Dibuat dengan model Peasant yang sama seperti warga Dusun Ilalang (npcs.js). tex = warna tekstur (green / yellow / blue / brown);
// patrol = titik jalan bolak-balik (tetap di jalan, satu bagian chunk); scale < 1 = anak kecil. Semua berdiri di jalan / tepi jalan / setapak, jadi tidak menabrak benda lain.
const at = (s, b) => { const p = sside(s, b); return { x: p.x, z: p.z }; };
const lane = i => SAWAH_LANES[Math.min(i, SAWAH_LANES.length - 1)].s;
export const SAWAH_NPCS = [
  { name: 'Mbah Karto', role: 'Penjaga Gerbang Sawah', tex: 'brown', ...at(26, -3.4), look: at(60, 0),
    lines: ['Gerbang padang sudah lama kututup. Sekarang kubuka lagi, supaya petani bisa pulang pergi.', 'Selamat datang di Ladang Sawah Gemah Ripah. Jangan injak bibit muda, ya!'] },
  { name: 'Pak Slamet', role: 'Petani', tex: 'green', ...at(160, 3.2), look: at(160, 20), patrol: [at(160, 3.2), at(178, 3.2), at(196, 3.2)],
    lines: ['Padi di sini panen tiga kali setahun. Airnya dari saluran di tepi jalan itu.', 'Petak yang menguning itu sebentar lagi kupanen. Sisanya masih bibit atau baru dibajak.'] },
  { name: 'Bu Tini', role: 'Pemetik Padi', tex: 'yellow', ...at(lane(1), 22), look: at(lane(1) + 12, 22),
    lines: ['Hati-hati di pematang, licin. Sudah dua kali aku tercebur ke petak sebelah!', 'Orang-orangan sawah itu buatan suamiku. Burung pipit tetap saja berani hinggap di topinya.'] },
  { name: 'Joko', role: 'Anak Penghalau Burung', tex: 'blue', scale: 0.72, ...at(lane(3), -24), look: at(lane(3) + 14, -24),
    lines: ['Aku jaga padi dari burung! Kutarik tali kaleng ini, krincing-krincing, burungnya kabur.', 'Kerbau di petak lumpur itu namanya Gempal. Dia suka makan rumput, bukan padi, untung saja.'] },
  { name: 'Mbok Rah', role: 'Penjual Wedang', tex: 'yellow', ...at(SAWAH_SPOTS.rest.s + 3, 7.4), look: SAWAH_SPOTS.rest,
    lines: ['Duduklah di saung, Nak. Wedang jahe hangat bikin kaki pegal hilang.', 'Dari sini Kota Kekaisaran masih separuh jalan lagi ke timur.'] },
  { name: 'Kang Ujang', role: 'Pengantar Gabah', tex: 'brown', ...at(585, -3.2), look: at(585, 20), patrol: [at(585, -3.2), at(603, -3.2), at(622, -3.2)],
    lines: ['Gabah ini mau kuantar ke lumbung. Berat, tapi hati senang kalau panen melimpah.', 'Di ujung ladang ada gerbang besar ke Kota Kekaisaran. Sekarang sudah dibuka, tapi baru Distrik 1 yang rampung.'] },
  { name: 'Prajurit Wira', role: 'Penjaga Perbatasan', tex: 'green', ...at(SAWAH_LEN - 26, 4.6), look: at(SAWAH_LEN - 8, 0),
    lines: ['Selamat datang, pengelana. Gerbang Utama Kota Kekaisaran sudah dibuka.', 'Distrik 1, kawasan militer, sudah selesai. Distrik lain masih dibangun, jadi jangan heran kalau masih lahan kosong.'] },
];
export const sawahSegOf = x => { for (let i = 0; i < SAWAH_SEG_X.length - 1; i++) if (x >= SAWAH_SEG_X[i] && x < SAWAH_SEG_X[i + 1]) return i; return -1; };

// Titik muncul pemain saat permainan dimulai: tepat di balik gerbang padang (depan ladang), menghadap timur, supaya tidak jauh dari ladang.
export const SAWAH_SPAWN = (() => { const p = sroadAt(18); return { x: p.x, z: p.z, face: Math.atan2(p.tx, p.tz) }; })();
