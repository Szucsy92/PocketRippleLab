"""Skinned, animated triangle soups from an FBX (bind = mesh-node global, works with 3ds Max / Blender exports)."""
import numpy as np
from fbxscene import Scene, skin_matrices
from meshio import load_fbx_geoms
class Part:
    pass
def load_parts(path, only=None):
    sc=Scene(path); G=load_fbx_geoms(path); sk=sc.skins(); parts=[]
    bind=sc.globals(None,0.0)
    for mid,mo in sc.models.items():
        if mo.props[2]!='Mesh': continue
        gid=[b for (b,_) in sc.children_of.get(mid,[]) if b in G]
        if not gid: continue
        gid=gid[0]; nm=sc.name[mid]
        if only and nm not in only: continue
        g=G[gid]; p=Part(); p.name=nm; p.gid=gid; p.g=g; p.MG=bind[mid]
        p.cl=sk.get(gid,[]); p.nv=len(g['V']); p.Vh=np.c_[g['V'],np.ones(p.nv)]
        p.mats=[sc.name[b] for (b,_) in sc.children_of.get(mid,[]) if sc.objs[b].name=='Material']
        parts.append(p)
    return sc,parts
def pose(sc,part,stack,t,amp=1.0,twist=None):
    """-> corner positions (ntri,3,3), normals (ntri,3,3), uv (ntri,3,2) in FBX world space at time t."""
    g=part.g
    if part.cl:
        cur=sc.stacks[stack] if stack else None
        if cur is not None and amp<0.999:
            from fbxscene import blended_globals
            tl={b:Tl for (b,_,_,_,Tl) in part.cl}
            Gb=blended_globals(sc,cur,t,tl,amp)
        elif cur is None: Gb={b:Tl for (b,_,_,_,Tl) in part.cl}   # stack=None -> straight bind pose
        else: Gb=sc.globals(cur,t)
        M=skin_matrices(sc,part.cl,part.nv,Gb,part.MG)
    else:
        M=np.broadcast_to(part.MG,(part.nv,4,4))
    Vh=part.Vh if twist is None else twist(part)
    Pv=np.einsum('nij,nj->ni',M,Vh)[:,:3]
    vi=g['corner_vi'][g['tri']]
    P=Pv[vi]
    if 'n' in g:
        Nn=g['n'][g['tri']]; Mc=M[vi][...,:3,:3]
        N=np.einsum('tcij,tcj->tci',Mc,Nn); N/=np.maximum(np.linalg.norm(N,axis=-1,keepdims=True),1e-9)
    else: N=None
    return P,N,g['uv'][g['tri']]
