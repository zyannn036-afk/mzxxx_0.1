#!/usr/bin/env python3
"""
Mengubah FBX golem (FBX.fbx) menjadi golem.glb yang siap dimuat game.

Isi FBX: dua salinan golem (pose istirahat "B" + pose angkat-lengan "A"), kamera, lampu & lantai (semuanya dibuang), serta 4 bola mata.
Tiap golem = 3 mesh: 'hands&leg' (8 balok lepas: 2 kaki, 2 lengan bawah, 2 lengan atas, 2 bahu), 'torso', 'head'. Tidak ada tulang / animasi,
jadi skrip ini memecah mesh 'hands&leg' per balok (komponen terhubung) lalu menyusunnya jadi hierarki sendi kaku:

  golem
   |- hipL, hipR                      (kaki; berputar di pangkal paha)
   '- body                            (torso; pivot di pinggul)
       |- head (+ eyeL, eyeR)          (kepala; pivot di leher)
       |- core                         (titik inti kristal di dada, node kosong)
       '- shoulderL/R (bahu + lengan atas) -> elbowL/R (lengan bawah + tinju)

Sisi "L" = sisi +x (kiri golem; golem menghadap +z). Satuan meter, telapak kaki di y=0, tinggi = GOLEM_H.
Pose A di FBX ternyata murni putaran kaku seluruh lengan kiri sebesar -68,6° terhadap sumbu X di bahu -> dipakai sebagai pose "tinju siap" di golem.js.

Pemakaian:  python3 fbx_to_golem_glb.py FBX.fbx golem.glb
"""
import json, struct, sys, zlib
import numpy as np

GOLEM_H = 6.5   # tinggi golem di game (meter)

# ---------------------------------------------------------------- pembaca FBX biner (cukup untuk file ini)
def parse_fbx(path):
    d = open(path, 'rb').read()
    ver = struct.unpack_from('<I', d, 23)[0]; big = ver >= 7500
    def node(pos):
        if big: end, npr, plen, nlen = struct.unpack_from('<QQQB', d, pos); pos += 25
        else: end, npr, plen, nlen = struct.unpack_from('<IIIB', d, pos); pos += 13
        if end == 0: return None, pos
        name = d[pos:pos + nlen].decode('latin1'); pos += nlen; props = []
        for _ in range(npr):
            t = chr(d[pos]); pos += 1
            if t in 'YCIFDL':
                fmt, n = {'Y': ('<h', 2), 'C': ('<B', 1), 'I': ('<i', 4), 'F': ('<f', 4), 'D': ('<d', 8), 'L': ('<q', 8)}[t]
                props.append(struct.unpack_from(fmt, d, pos)[0]); pos += n
            elif t in 'fdlib':
                n, enc, clen = struct.unpack_from('<III', d, pos); pos += 12
                raw = d[pos:pos + clen]; pos += clen
                if enc == 1: raw = zlib.decompress(raw)
                props.append(np.frombuffer(raw, dtype={'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1'}[t], count=n))
            elif t in 'SR':
                n = struct.unpack_from('<I', d, pos)[0]; pos += 4
                props.append(d[pos:pos + n].decode('latin1') if t == 'S' else d[pos:pos + n]); pos += n
            else: raise ValueError('tipe properti FBX tak dikenal: ' + t)
        kids = []
        while pos < end:
            k, pos = node(pos)
            if k is None: break
            kids.append(k)
        return (name, props, kids), end
    pos = 27; top = []
    while pos < len(d) - 200:
        n, pos = node(pos)
        if n is None: break
        top.append(n)
    return top

def rot_xyz(rx, ry, rz):   # urutan putar default FBX (XYZ): R = Rz*Ry*Rx
    rx, ry, rz = np.radians([rx, ry, rz]); c, s = np.cos, np.sin
    X = np.array([[1, 0, 0], [0, c(rx), -s(rx)], [0, s(rx), c(rx)]]); Y = np.array([[c(ry), 0, s(ry)], [0, 1, 0], [-s(ry), 0, c(ry)]]); Z = np.array([[c(rz), -s(rz), 0], [s(rz), c(rz), 0], [0, 0, 1]])
    return Z @ Y @ X

def read_scene(path):
    top = parse_fbx(path); obj = next(n for n in top if n[0] == 'Objects'); conn = next(n for n in top if n[0] == 'Connections')
    nm = lambda k: k[1][1].split('\x00')[0]
    geos = {}
    for k in obj[2]:
        if k[0] != 'Geometry': continue
        v = idx = None
        for c in k[2]:
            if c[0] == 'Vertices': v = c[1][0].reshape(-1, 3)
            if c[0] == 'PolygonVertexIndex': idx = c[1][0]
        geos[k[1][0]] = (nm(k), v, idx)
    models = {}
    for k in obj[2]:
        if k[0] != 'Model': continue
        p = {'T': [0, 0, 0], 'R': [0, 0, 0], 'S': [1, 1, 1]}
        for c in k[2]:
            if c[0] == 'Properties70':
                for q in c[2]:
                    key = {'Lcl Translation': 'T', 'Lcl Rotation': 'R', 'Lcl Scaling': 'S'}.get(q[1][0])
                    if key: p[key] = [float(x) for x in q[1][4:7]]
        models[k[1][0]] = (nm(k), p)
    geo_of = {c[1][2]: c[1][1] for c in conn[2] if c[1][0] == 'OO' and c[1][1] in geos and c[1][2] in models}
    scene = {}
    for mid, (name, p) in models.items():
        M = rot_xyz(*p['R']) @ np.diag(p['S']); T = np.array(p['T'])
        if mid in geo_of:
            _, v, idx = geos[geo_of[mid]]; scene[name] = {'w': v @ M.T + T, 'idx': idx}
        else: scene[name] = {'ctr': T}
    return scene

def triangles(idx):   # poligon FBX (indeks negatif = akhir poligon) -> segitiga (kipas)
    tris, poly = [], []
    for i in idx:
        poly.append(int(~i) if i < 0 else int(i))
        if i < 0:
            tris += [(poly[0], poly[j], poly[j + 1]) for j in range(1, len(poly) - 1)]; poly = []
    return np.array(tris, dtype=np.int64)

def components(tris, n):
    par = list(range(n))
    def f(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for a, b, c in tris: par[f(b)] = f(a); par[f(c)] = f(a)
    groups = {}
    for i in np.unique(tris): groups.setdefault(f(int(i)), []).append(int(i))
    return [np.array(g) for g in groups.values()]

# ---------------------------------------------------------------- bangun bagian-bagian
def build():
    sc = read_scene(sys.argv[1])
    limbs, torso, head = sc['hands&leg.001'], sc['torso.001'], sc['head.001']   # pose istirahat (B)
    cx = (torso['w'][:, 0].min() + torso['w'][:, 0].max()) / 2; yf = limbs['w'][:, 1].min()
    legs_z = np.mean([limbs['w'][c][:, 2].mean() for c in components(triangles(limbs['idx']), len(limbs['w'])) if limbs['w'][c][:, 1].min() < yf + 20])
    def to_g(w):   # dunia FBX (golem menghadap -z) -> bingkai golem (menghadap +z), meter, kaki di y=0
        h = max(limbs['w'][:, 1].max(), torso['w'][:, 1].max(), head['w'][:, 1].max()) - yf
        return np.stack([-(w[:, 0] - cx), w[:, 1] - yf, -(w[:, 2] - legs_z)], 1) * (GOLEM_H / h)
    P = {}
    lw = to_g(limbs['w']); ltri = triangles(limbs['idx'])
    pieces = []
    for c in components(ltri, len(lw)):
        p = lw[c]; pieces.append((c, p.min(0), p.max(0), p.mean(0)))
    def pick(pred): return [t for t in pieces if pred(t)]
    legs = pick(lambda t: t[1][1] < 0.1); rest = [t for t in pieces if not any(t is l for l in legs)]
    fore = [t for t in rest if t[3][1] < 3.0]; upper = [t for t in rest if 3.0 <= t[3][1] < 4.5]; paul = [t for t in rest if t[3][1] >= 4.5]
    assert len(legs) == len(fore) == len(upper) == len(paul) == 2, 'struktur balok tak sesuai: ' + str([len(x) for x in (legs, fore, upper, paul)])
    side = lambda lst, s: next(t for t in lst if (t[3][0] > 0) == (s > 0))
    sel = {}
    for s, S in ((1, 'L'), (-1, 'R')):
        sel['leg' + S] = side(legs, s); sel['fore' + S] = side(fore, s); sel['upper' + S] = side(upper, s); sel['paul' + S] = side(paul, s)
    P['verts'] = {k: (lw, ltri, t[0]) for k, t in sel.items()}
    tw = to_g(torso['w']); P['torso'] = (tw, triangles(torso['idx']), np.arange(len(tw)))
    hw = to_g(head['w']); P['head'] = (hw, triangles(head['idx']), np.arange(len(hw)))
    # titik sendi
    piv = {}
    for s, S in ((1, 'L'), (-1, 'R')):
        leg = lw[sel['leg' + S][0]]; top = leg[leg[:, 1] > leg[:, 1].max() - 0.4]; piv['hip' + S] = np.array([top[:, 0].mean(), leg[:, 1].max() - 0.15, top[:, 2].mean()])
        pa = lw[sel['paul' + S][0]]; piv['shoulder' + S] = pa.mean(0)                                                   # pusat bahu = sumbu putar pose A
        fo = lw[sel['fore' + S][0]]; tp = fo[fo[:, 1] > fo[:, 1].max() - 0.35]; piv['elbow' + S] = np.array([tp[:, 0].mean(), fo[:, 1].max() - 0.2, tp[:, 2].mean()])
    piv['body'] = np.array([0.0, 3.0, tw[:, 2].mean() * 0.5])
    hv = hw[hw[:, 1] < hw[:, 1].min() + 0.25]; piv['head'] = np.array([hv[:, 0].mean(), hw[:, 1].min() + 0.05, hv[:, 2].mean()])
    eyes = [to_g(sc[n]['w'].mean(0)[None])[0] for n in ('Esfera.002', 'Esfera.003')]   # bola mata pose istirahat (pusat awan titiknya)
    front = tw[(abs(tw[:, 0]) < 0.35) & (tw[:, 1] > 3.7) & (tw[:, 1] < 4.6)]
    piv['core'] = np.array([0.0, 4.15, front[:, 2].max() - 0.05])
    return P, piv, sorted(eyes, key=lambda e: -e[0])

def smooth_normals(v, t):
    n = np.zeros_like(v); fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    for i in range(3): np.add.at(n, t[:, i], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)

def vertex_colors(v, n, tint):   # batu kebiruan; sisi atas diselimuti "es" pucat, sisi bawah lebih gelap, sedikit belang
    stone, frost = np.array([0.36, 0.45, 0.54]), np.array([0.86, 0.95, 1.0])
    t = np.clip(0.18 + 0.95 * np.maximum(n[:, 1], 0) + 0.06 * (v[:, 1] - 3.0), 0, 1)[:, None]
    noise = (0.9 + 0.14 * (np.sin(v[:, 0] * 7.1 + v[:, 2] * 3.3) * np.sin(v[:, 1] * 5.7 + v[:, 0] * 2.1))[:, None])
    return np.clip((stone * (1 - t) + frost * t) * noise * tint, 0, 1)

class Glb:
    def __init__(s): s.nodes = []; s.meshes = []; s.acc = []; s.bv = []; s.bin = bytearray()
    def _view(s, arr, target=None):
        pad = (-len(s.bin)) % 4; s.bin += b'\0' * pad
        s.bv.append({'buffer': 0, 'byteOffset': len(s.bin), 'byteLength': arr.nbytes, **({'target': target} if target else {})}); s.bin += arr.tobytes(); return len(s.bv) - 1
    def _acc(s, arr, ctype, typ, target, minmax=False):
        a = {'bufferView': s._view(arr, target), 'componentType': ctype, 'count': len(arr), 'type': typ}
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        s.acc.append(a); return len(s.acc) - 1
    def mesh(s, name, pos, nor, col, idx):
        pos, nor, col = pos.astype('<f4'), nor.astype('<f4'), col.astype('<f4'); idx = idx.astype('<u2' if len(pos) < 65535 else '<u4')
        prim = {'attributes': {'POSITION': s._acc(pos, 5126, 'VEC3', 34962, True), 'NORMAL': s._acc(nor, 5126, 'VEC3', 34962), 'COLOR_0': s._acc(col, 5126, 'VEC3', 34962)},
                'indices': s._acc(idx.reshape(-1), 5123 if idx.dtype == np.dtype('<u2') else 5125, 'SCALAR', 34963), 'material': 0, 'mode': 4}
        s.meshes.append({'name': name, 'primitives': [prim]}); return len(s.meshes) - 1
    def node(s, name, t=(0, 0, 0), mesh=None, parent=None):
        n = {'name': name, 'translation': [float(x) for x in t]}
        if mesh is not None: n['mesh'] = mesh
        s.nodes.append(n); i = len(s.nodes) - 1
        if parent is not None: s.nodes[parent].setdefault('children', []).append(i)
        return i
    def save(s, path):
        js = {'asset': {'version': '2.0', 'generator': 'fbx_to_golem_glb.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': s.nodes, 'meshes': s.meshes, 'accessors': s.acc, 'bufferViews': s.bv,
              'buffers': [{'byteLength': len(s.bin)}], 'materials': [{'name': 'batu-es', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.8}}]}
        j = json.dumps(js, separators=(',', ':')).encode(); j += b' ' * ((-len(j)) % 4); b = bytes(s.bin) + b'\0' * ((-len(s.bin)) % 4)
        open(path, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(j) + 8 + len(b)) + struct.pack('<I4s', len(j), b'JSON') + j + struct.pack('<I4s', len(b), b'BIN\0') + b)

def main():
    P, piv, eyes = build(); g = Glb(); root = g.node('golem')
    def part(name, w, tris, ids, pivot, tint=1.0):   # satu mesh: hanya titik milik komponen, relatif ke pivot
        remap = -np.ones(len(w), dtype=np.int64); remap[ids] = np.arange(len(ids)); tri = remap[tris[np.isin(tris, ids).all(1)]]
        v = w[ids]; n = smooth_normals(v, tri); return g.mesh(name, v - pivot, n, vertex_colors(v, n, tint), tri)
    V = P['verts']; rel = lambda a, b: piv[a] - piv[b]
    for S in 'LR':
        w, tris, ids = V['leg' + S]; g.node('hip' + S, piv['hip' + S], part('leg' + S, w, tris, ids, piv['hip' + S]), root)
    body = g.node('body', piv['body'], part('torso', *P['torso'], piv['body']), root)
    hd = g.node('head', rel('head', 'body'), part('head', *P['head'], piv['head'], 1.05), body)
    for i, e in enumerate(eyes): g.node('eye' + 'LR'[i], e - piv['head'], None, hd)
    g.node('core', piv['core'] - piv['body'], None, body)
    for S in 'LR':
        w, tris, ids = V['paul' + S]; w2, tris2, ids2 = V['upper' + S]
        # bahu + lengan atas digabung jadi satu mesh (satu node hanya boleh punya satu mesh)
        allw = w; both = np.concatenate([ids, ids2]); sh = g.node('shoulder' + S, rel('shoulder' + S, 'body'), part('shoulder' + S, allw, tris, both, piv['shoulder' + S]), body)
        w3, tris3, ids3 = V['fore' + S]; g.node('elbow' + S, rel('elbow' + S, 'shoulder' + S), part('forearm' + S, w3, tris3, ids3, piv['elbow' + S], 0.97), sh)
    g.save(sys.argv[2])
    print('OK ->', sys.argv[2], len(g.bin) // 1024, 'KB')
    for k, v in piv.items(): print(f'  {k:10s}', np.round(v, 3))
    print('  eyes', [np.round(e, 3).tolist() for e in eyes])

if __name__ == '__main__': main()
