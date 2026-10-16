# Panggang karakter realistis Quaternius (CC0) menjadi mesh statis berpose berdiri untuk pustaka SketchClone.
# Keluaran: JSON {name: {v:[x,y,z,...] (0,1 mm, Z-atas, alas z=0, menghadap -Y), t:[i,j,k,...], c:[palet idx per segitiga],
#                        p:[bagian per segitiga], pal:[hex...]}}
import json, os, sys
from panda3d.core import Texture, MaterialAttrib, loadPrcFileData, Filename, Thread, TextureAttrib, LColor, Point3, GeomVertexReader
loadPrcFileData('', 'window-type none\naudio-library-name null\nload-file-type p3assimp\n')
from direct.showbase.ShowBase import ShowBase
from direct.actor.Actor import Actor

R = r'D:\LadangNusantara3D\assets\models\chars_r'
NAMES = sys.argv[2:] or ['m_tani', 'm_tani_cepak', 'm_tani_jenggot', 'm_pengembara', 'm_pemburu',
                         'f_tani', 'f_tani_panjang', 'f_tani_pendek', 'f_pengembara', 'f_pemburu']
OUT = sys.argv[1]
base = ShowBase()
anims = loader.loadModel(Filename.from_os_specific(os.path.join(R, 'anims.glb')))
bund = {n.node().getBundle().getName(): n for n in anims.findAllMatches('**/+AnimBundleNode')}
POSE = 'Idle_Loop'


def part_of(meshname, matname):
    """k kulit, r rambut, m mata, b baju (badan), a lengan baju, l celana/rok, f alas kaki, x aksesori (sabuk, tudung)"""
    mt, ms = matname.lower(), meshname.lower()
    if 'eye' in mt or ms == 'eyes':
        return 'm'
    if 'hair' in mt or 'brow' in ms or 'hair' in ms:
        return 'r'
    if 'superhero' in mt or 'regular' in mt:
        return 'k'
    if any(w in ms for w in ('belt', 'hood', 'pauldron', 'bracer')):
        return 'x'
    if '_body' in ms:
        return 'b'
    if '_arms' in ms:
        return 'a'
    if '_legs' in ms:
        return 'l'
    if 'feet' in ms:
        return 'f'
    return 'x'


res = {}
for name in NAMES:
    a = Actor(Filename.from_os_specific(os.path.join(R, name + '.glb')).getFullpath(), {POSE: bund[POSE]})
    a.reparentTo(render)
    # pose berdiri santai: dari pose dasar (T), lengan atas diturunkan, siku sedikit ditekuk
    for side in 'lr':
        hand = a.exposeJoint(None, 'modelRoot', 'hand_' + side)
        up = a.controlJoint(None, 'modelRoot', 'upperarm_' + side)
        h = up.getHpr()
        best = None
        for d in range(-90, 91, 2):
            up.setHpr(h[0], h[1] + d, h[2])
            a.update(force=True)
            q = hand.getPos(render)
            sh = a.exposeJoint(None, 'modelRoot', 'upperarm_' + side).getPos(render)
            # tangan ~0,58 m di bawah bahu, sedikit di luar pinggul
            sc = abs(q.y - (sh.y - .58)) + abs(abs(q.x) - (abs(sh.x) + .06)) + abs(q.z - sh.z)
            if best is None or sc < best[0]:
                best = (sc, d)
        up.setHpr(h[0], h[1] + best[1], h[2])
        lo = a.controlJoint(None, 'modelRoot', 'lowerarm_' + side)
        lh = lo.getHpr()
        lo.setHpr(lh[0] + (12 if side == 'l' else -12), lh[1], lh[2])
        a.update(force=True)
        print(side, 'arm delta', best[1], 'hand', hand.getPos(render))
    wrist_y = a.exposeJoint(None, 'modelRoot', 'hand_l').getPos(render).y + .015
    verts, tris, cols, parts = [], [], [], []
    peek = {}
    for gnp in a.findAllMatches('**/+GeomNode'):
        gn = gnp.node()
        mat = gnp.getMat(render)
        net = gnp.getNetState()
        for gi in range(gn.getNumGeoms()):
            geom = gn.getGeom(gi)
            st = net.compose(gn.getGeomState(gi))
            ta = st.getAttrib(TextureAttrib)
            tex = ta.getTexture() if ta else None
            pk = None
            if tex is not None:
                if tex.getName() not in peek:
                    peek[tex.getName()] = tex.peek()
                pk = peek[tex.getName()]
            vd = geom.getAnimatedVertexData(True, Thread.getCurrentThread())
            rv = GeomVertexReader(vd, 'vertex')
            uvcol = 'texcoord' if vd.hasColumn('texcoord') else 'texcoord.0'
            ru = GeomVertexReader(vd, uvcol) if vd.hasColumn(uvcol) else None
            P, UV = [], []
            while not rv.isAtEnd():
                p = mat.xformPoint(rv.getData3())
                P.append((p.x, p.y, p.z))
                if ru:
                    u = ru.getData2()
                    UV.append((u.x, u.y))
            off = len(verts)
            verts += P
            ma = st.getAttrib(MaterialAttrib)
            mname = ma.getMaterial().getName() if ma and ma.getMaterial() else ''
            pt = part_of(gnp.getName(), mname)
            for pi in range(geom.getNumPrimitives()):
                prim = geom.getPrimitive(pi).decompose()
                for k in range(prim.getNumPrimitives()):
                    s, e = prim.getPrimitiveStart(k), prim.getPrimitiveEnd(k)
                    ix = [prim.getVertex(j) for j in range(s, e)]
                    if len(ix) != 3:
                        continue
                    tris.append(tuple(off + i for i in ix))
                    cy_ = sum(P[i][1] for i in ix) / 3
                    c = LColor(.8, .8, .8, 1)
                    if pk and UV:
                        u = sum(UV[i][0] for i in ix) / 3 % 1.0
                        v = sum(UV[i][1] for i in ix) / 3 % 1.0
                        pk.lookup(c, u, (1 - v) if os.getenv('FLIPV') == '1' else v)
                    if tex is not None and tex.getFormat() in (Texture.F_srgb, Texture.F_srgb_alpha):
                        c = [x * 12.92 if x <= .0031308 else 1.055 * x ** (1 / 2.4) - .055 for x in (c[0], c[1], c[2])]
                    cols.append((c[0], c[1], c[2]))
                    parts.append('k' if pt == 'a' and cy_ < wrist_y else pt)  # telapak tangan pada mesh lengan
    # orientasi: Z-atas, alas di 0, berpusat X/Y
    xs, ys, zs = zip(*verts)
    ext = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    if ext[1] > ext[2] * 1.5:  # Y-atas -> Z-atas
        verts = [(x, -z, y) for x, y, z in verts]
        xs, ys, zs = zip(*verts)
    h = max(zs) - min(zs)
    k = (1.70 if name.startswith('f') else 1.72) / h
    cx, cy, z0 = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)
    verts = [((x - cx) * k, (y - cy) * k, (z - z0) * k) for x, y, z in verts]
    # arah wajah: mata harus di sisi -Y
    eyeY = [verts[i][1] for t, p in zip(tris, parts) if p == 'm' for i in t]
    if eyeY and sum(eyeY) / len(eyeY) > 0:
        verts = [(-x, -y, z) for x, y, z in verts]
    # haluskan warna: rata-rata warna segitiga tetangga (sebagian) agar tidak tampak mosaik
    import collections
    for _ in range(2):
        acc = collections.defaultdict(lambda: [0., 0., 0., 0])
        for t, c, p in zip(tris, cols, parts):
            for i in t:
                q = (p,) + tuple(int(round(x * 2000)) for x in verts[i])
                e = acc[q]
                e[0] += c[0]; e[1] += c[1]; e[2] += c[2]; e[3] += 1
        nc = []
        for t, c, p in zip(tris, cols, parts):
            sm = [0., 0., 0.]
            for i in t:
                e = acc[(p,) + tuple(int(round(x * 2000)) for x in verts[i])]
                for k in range(3):
                    sm[k] += e[k] / e[3]
            nc.append(tuple(.5 * c[k] + .5 * sm[k] / 3 for k in range(3)))
        cols = nc
    # palet: kuantisasi warna (tiap kanal ke 1/24) per bagian
    pal, pidx, ci = [], {}, []
    for (r, g, b), p in zip(cols, parts):
        q = '#%02x%02x%02x' % tuple(min(255, int(round(round(x * 32) / 32 * 255))) for x in (r, g, b))
        if q not in pidx:
            pidx[q] = len(pal)
            pal.append(q)
        ci.append(pidx[q])
    # gabungkan titik kembar (agar normal halus menyatu)
    vk, nv, remap = {}, [], []
    for p in verts:
        q = tuple(int(round(x * 10000)) for x in p)
        if q not in vk:
            vk[q] = len(nv)
            nv.append(q)
        remap.append(vk[q])
    T = []
    for t in tris:
        T += [remap[i] for i in t]
    res[name] = dict(v=[c for p in nv for c in p], t=T, c=ci, p=''.join(parts), pal=pal)
    print(name, 'verts', len(nv), 'tris', len(tris), 'pal', len(pal), {x: parts.count(x) for x in 'krmbalfx'}, flush=True)
    a.cleanup()
    a.removeNode()
json.dump(res, open(OUT, 'w'), separators=(',', ':'))
print('ok', os.path.getsize(OUT))
