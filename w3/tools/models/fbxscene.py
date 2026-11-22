"""Skinned FBX scene: bone hierarchy, skin clusters and animation stacks (no external 3D software)."""
import numpy as np
from fbx import parse
TICKS=46186158000.0
def _rot(deg,order='XYZ'):
    a=np.radians(deg); M={}
    for ax,t in zip('XYZ',a):
        c,s=np.cos(t),np.sin(t); m=np.eye(4)
        if ax=='X': m[1,1]=c;m[1,2]=-s;m[2,1]=s;m[2,2]=c
        if ax=='Y': m[0,0]=c;m[0,2]=s;m[2,0]=-s;m[2,2]=c
        if ax=='Z': m[0,0]=c;m[0,1]=-s;m[1,0]=s;m[1,1]=c
        M[ax]=m
    # FBX eEulerXYZ: X applied first -> Rz*Ry*Rx
    r=np.eye(4)
    for ax in order: r=M[ax]@r
    return r
def _props(node):
    d={}
    p=node.find('Properties70')
    if p:
        for c in p[0].children: d[c.props[0]]=c.props[4:]
    return d
class Curve:
    def __init__(s,node):
        s.t=node.find('KeyTime')[0].props[0].astype(np.float64)/TICKS
        s.v=node.find('KeyValueFloat')[0].props[0].astype(np.float64)
    def at(s,t): return float(np.interp(t,s.t,s.v))
class Scene:
    def __init__(s,path):
        s.ver,s.root=parse(path)
        obj=s.root.find('Objects')[0]; s.objs={}
        for o in obj.children:
            if o.props and isinstance(o.props[0],(int,np.integer)): s.objs[int(o.props[0])]=o
        s.parent_of={}; s.children_of={}; s.op=[]
        for c in s.root.find('Connections')[0].children:
            k=c.props[0]; a=int(c.props[1]); b=int(c.props[2])
            s.children_of.setdefault(b,[]).append((a,c.props[3] if len(c.props)>3 else None))
            s.parent_of.setdefault(a,[]).append((b,c.props[3] if len(c.props)>3 else None))
        s.bones={i:o for i,o in s.objs.items() if o.name=='Model' and o.props[2] in('LimbNode','Null')}
        s.models={i:o for i,o in s.objs.items() if o.name=='Model'}
        s.name={i:o.props[1].split('\x00')[0] for i,o in s.objs.items() if len(o.props)>1 and isinstance(o.props[1],str)}
        s.local={}
        for i,o in s.models.items():
            p=_props(o)
            s.local[i]=dict(T=np.array(p.get('Lcl Translation',[0,0,0]),float),R=np.array(p.get('Lcl Rotation',[0,0,0]),float),
              S=np.array(p.get('Lcl Scaling',[1,1,1]),float),pre=np.array(p.get('PreRotation',[0,0,0]),float),
              post=np.array(p.get('PostRotation',[0,0,0]),float),order={0:'XYZ',1:'XZY',2:'YZX',3:'YXZ',4:'ZXY',5:'ZYX'}.get(int(p.get('RotationOrder',[0])[0]),'XYZ'),
              piv=[k for k in p if k in('RotationPivot','ScalingPivot','RotationOffset','ScalingOffset') and any(abs(x)>1e-9 for x in p[k])])
        s.par={}
        for i in s.models:
            s.par[i]=None
            for (b,_) in s.parent_of.get(i,[]):
                if b in s.models: s.par[i]=b
        s.stacks={}
        for i,o in s.objs.items():
            if o.name=='AnimationStack':
                curves={}
                for (lay,_) in s.children_of.get(i,[]):
                    for (cn,_) in s.children_of.get(lay,[]):
                        if s.objs[cn].name!='AnimationCurveNode': continue
                        tgt=[(b,pn) for (b,pn) in s.parent_of.get(cn,[]) if b in s.models]
                        if not tgt: continue
                        mid,prop=tgt[0]
                        for (cv,ax) in s.children_of.get(cn,[]):
                            if s.objs[cv].name=='AnimationCurve':
                                curves[(mid,prop,ax[-1])]=Curve(s.objs[cv])
                s.stacks[s.name[i]]=curves
    def stack_range(s,name):
        c=s.stacks[name]; t0=min(v.t[0] for v in c.values()); t1=max(v.t[-1] for v in c.values()); return t0,t1
    def local_matrix(s,i,curves,t):
        L=s.local[i]; T=L['T'].copy(); R=L['R'].copy(); S=L['S'].copy()
        for (mid,prop,ax),cv in ([] if curves is None else [((i,p,a),curves[(i,p,a)]) for p in('Lcl Translation','Lcl Rotation','Lcl Scaling') for a in 'XYZ' if (i,p,a) in curves]):
            k='XYZ'.index(ax); val=cv.at(t)
            if prop=='Lcl Translation': T[k]=val
            elif prop=='Lcl Rotation': R[k]=val
            else: S[k]=val
        M=np.eye(4); M[:3,3]=T
        M=M@_rot(L['pre'])@_rot(R,L['order'])@np.linalg.inv(_rot(L['post']))
        Sm=np.diag([*S,1.0]); return M@Sm
    def globals(s,curves,t):
        G={}
        def g(i):
            if i in G: return G[i]
            m=s.local_matrix(i,curves,t); p=s.par[i]
            G[i]=(g(p)@m) if p is not None else m; return G[i]
        for i in s.models: g(i)
        return G
    def skins(s):
        """-> {geom_id: [(bone_id, idx, w, Tmesh(4x4), Tlink(4x4))]}"""
        out={}
        for i,o in s.objs.items():
            if o.name!='Deformer' or o.props[2]!='Skin': continue
            geoms=[b for (b,_) in s.parent_of.get(i,[]) if s.objs.get(b) is not None and s.objs[b].name=='Geometry']
            cl=[]
            for (c,_) in s.children_of.get(i,[]):
                co=s.objs[c]
                if co.name!='Deformer': continue
                bone=[b for (b,_) in s.children_of.get(c,[]) if b in s.models]
                if not bone or not co.find('Indexes'): continue
                cl.append((bone[0],co.find('Indexes')[0].props[0].astype(np.int64),co.find('Weights')[0].props[0].astype(np.float64),
                  co.find('Transform')[0].props[0].reshape(4,4).T,co.find('TransformLink')[0].props[0].reshape(4,4).T))
            for gi in geoms: out.setdefault(gi,[]).extend(cl)
        return out
def skin_matrices(scene,clusters,nverts,G,MG=None):
    """Per-vertex blended 4x4 skinning matrix (nverts,4,4)."""
    acc=np.zeros((nverts,4,4)); wsum=np.zeros(nverts)
    for (b,idx,w,Tm,Tl) in clusters:
        M=G[b]@np.linalg.inv(Tl)@(Tm if MG is None else MG)
        acc[idx]+=w[:,None,None]*M[None]; wsum[idx]+=w
    ident=np.eye(4)
    nz=wsum>1e-9
    acc[nz]/=wsum[nz,None,None]; acc[~nz]=ident
    return acc

def blended_globals(scene,curves,t,tl,amp):
    """Bone globals with the clip's motion scaled by `amp` around the bind pose (tl: bone id -> bind global).
    amp=1 is the clip as authored, amp=0 the straight bind pose (rotations slerped, translations lerped)."""
    from scipy.spatial.transform import Rotation as Rot, Slerp
    G={}
    def g(i):
        if i in G: return G[i]
        m=scene.local_matrix(i,curves,t); p=scene.par[i]
        if amp<0.999 and i in tl and (p is None or p in tl):
            L0=np.linalg.inv(tl[p])@tl[i] if p is not None else tl[i]
            r0=Rot.from_matrix(L0[:3,:3]); r1=Rot.from_matrix(m[:3,:3])
            rr=Slerp([0,1],Rot.concatenate([r0,r1]))([amp])[0]
            mb=np.eye(4); mb[:3,:3]=rr.as_matrix(); mb[:3,3]=L0[:3,3]*(1-amp)+m[:3,3]*amp; m=mb
        G[i]=(g(p)@m) if p is not None else m; return G[i]
    for i in scene.models: g(i)
    return G
