#!/usr/bin/env python3
"""Memeriksa golem.glb (struktur, batas data) dan menggambar pratinjau pose istirahat + pose angkat-lengan."""
import json, struct, sys
import numpy as np

def read_glb(path):
    d = open(path, 'rb').read(); magic, ver, ln = struct.unpack_from('<4sII', d, 0); assert magic == b'glTF' and ver == 2 and ln == len(d), 'header GLB salah'
    jl, jt = struct.unpack_from('<I4s', d, 12); js = json.loads(d[20:20 + jl]); assert jt == b'JSON'
    bl, bt = struct.unpack_from('<I4s', d, 20 + jl); assert bt == b'BIN\0'; return js, d[28 + jl:28 + jl + bl]

def acc(js, b, i):
    a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]
    ct = {5126: '<f4', 5123: '<u2', 5125: '<u4'}[a['componentType']]; n = {'SCALAR': 1, 'VEC3': 3}[a['type']]
    assert bv['byteOffset'] % 4 == 0, 'bufferView tak sejajar 4 byte'
    arr = np.frombuffer(b, dtype=ct, count=a['count'] * n, offset=bv['byteOffset']).reshape(-1, n) if n > 1 else np.frombuffer(b, dtype=ct, count=a['count'], offset=bv['byteOffset'])
    if 'min' in a: assert np.allclose(arr.min(0), a['min'], atol=1e-5) and np.allclose(arr.max(0), a['max'], atol=1e-5), 'min/max accessor salah'
    return arr

def rotx(a): c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def world_meshes(js, b, rot=None):
    rot = rot or {}; out = {}
    def walk(i, R, T):
        n = js['nodes'][i]; t = np.array(n.get('translation', [0, 0, 0])); r = rot.get(n['name'], np.eye(3))
        Rn = R @ r; Tn = T + R @ t
        if 'mesh' in n:
            p = js['meshes'][n['mesh']]['primitives'][0]; v = acc(js, b, p['attributes']['POSITION']); idx = acc(js, b, p['indices']).astype(int)
            assert idx.max() < len(v), 'indeks di luar batas'; assert len(idx) % 3 == 0
            out[n['name']] = (v @ Rn.T + Tn, idx.reshape(-1, 3))
        for c in n.get('children', []): walk(c, Rn, Tn)
    walk(js['scenes'][js['scene']]['nodes'][0], np.eye(3), np.zeros(3)); return out

def draw(ax, meshes, view, title):
    from matplotlib.collections import PolyCollection
    P, C, Z = [], [], []
    for name, (w, t) in meshes.items():
        a, b_, c = w[t[:, 0]], w[t[:, 1]], w[t[:, 2]]; n = np.cross(b_ - a, c - a); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
        cd = np.array({'front': [0, 0, 1.], 'side': [1., 0, 0]}[view]); sh = 0.35 + 0.65 * np.abs(n @ cd)
        base = np.array([0.55, 0.72, 0.9])
        for k in range(len(t)):
            p = w[t[k]]; P.append(p[:, [0, 1]] if view == 'front' else np.stack([-p[:, 2], p[:, 1]], 1)); C.append(np.clip(base * sh[k], 0, 1)); Z.append(p[:, 2].mean() if view == 'front' else p[:, 0].mean())
    o = np.argsort(Z); ax.add_collection(PolyCollection([P[i] for i in o], facecolors=[C[i] for i in o], edgecolors='none')); ax.autoscale_view(); ax.set_aspect('equal'); ax.set_title(title)

if __name__ == '__main__':
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    js, b = read_glb(sys.argv[1]); names = [n['name'] for n in js['nodes']]; print('node:', names)
    rest = world_meshes(js, b); allv = np.concatenate([m[0] for m in rest.values()])
    print('batas pose istirahat: min', allv.min(0).round(2), 'max', allv.max(0).round(2), ' jumlah segitiga', sum(len(m[1]) for m in rest.values()))
    A = world_meshes(js, b, {'shoulderL': rotx(np.radians(-68.6))})
    fig, axs = plt.subplots(1, 4, figsize=(20, 6))
    draw(axs[0], rest, 'front', 'istirahat (depan, +z ke kamera)'); draw(axs[1], rest, 'side', 'istirahat (samping)'); draw(axs[2], A, 'front', 'lengan kiri -68,6 deg (depan)'); draw(axs[3], A, 'side', 'lengan kiri -68,6 deg (samping; kiri layar = depan golem)')
    plt.tight_layout(); plt.savefig(sys.argv[2], dpi=55)
    if len(sys.argv) > 3:   # bandingkan dengan pose A asli di FBX (bingkai golem sama)
        sys.path.insert(0, sys.argv[3]); import fbx_to_golem_glb as F
        print('(bandingkan manual dengan FBX pose A bila perlu)')
