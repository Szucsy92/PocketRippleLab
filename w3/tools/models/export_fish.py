import sys; sys.path.insert(0,'.')
import numpy as np, cv2, json
from PIL import Image
import fishtex as B
from pack import Pack
from skinmesh import load_parts, pose
from fishbake import subdivide_phong
OUT='../../src/assets/models'
CLOWN='../../assets-src/clown-fish'
CLOWN_FBX=f'{CLOWN}/source/cab939cb4ecb4ab583940af6e5c384c5.fbx.fbx'
def save_tex(arr,name,q=86,alpha=None):
    a=(np.clip(arr,0,1)*255+0.5).astype(np.uint8)
    if alpha is not None: Image.fromarray(np.dstack([a,(np.clip(alpha,0,1)*255+0.5).astype(np.uint8)]),'RGBA').save(f'{OUT}/{name}','WEBP',quality=q,alpha_quality=100,method=6)
    else: Image.fromarray(a,'RGB').save(f'{OUT}/{name}','WEBP',quality=q,method=6)
def rs(img,n): return cv2.resize(img,(n,n),interpolation=cv2.INTER_AREA)
def vertex_normals(V,T,pg=None):
    """Area-weighted vertex normals; vertices sharing a position group (UV-seam copies) share one normal."""
    key=np.arange(len(V)) if pg is None else pg
    n=np.zeros((int(key.max())+1,3)); fn=np.cross(V[T[:,1]]-V[T[:,0]],V[T[:,2]]-V[T[:,0]])
    for k in range(3): np.add.at(n,key[T[:,k]],fn)
    n=n[key]; return n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
def weld_pos_uv(P,UV,tol=1e-5):
    P=P.reshape(-1,3); UV=UV.reshape(-1,2)
    key=np.concatenate([np.round(P/tol).astype(np.int64),np.round(UV*4096).astype(np.int64)],1)
    _,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True); return first,inv.ravel()
def cluster(P,UV,cell,uvcell=1/48):
    key=np.concatenate([np.floor(P/cell).astype(np.int64),np.floor(UV/uvcell).astype(np.int64)],1)
    _,first,cid=np.unique(key,axis=0,return_index=True,return_inverse=True); return cid.ravel()
class SoupMesh:
    """A skinned part reduced to a clustered, indexed mesh whose vertex positions can be re-evaluated for any pose."""
    def __init__(s,sc,part,canon,stack0,cell=None,subdiv=0):
        s.sc,s.part,s.canon,s.subdiv=sc,part,canon,subdiv
        P,N,UV=s.raw(None,0)
        s.first,s.inv=weld_pos_uv(P,UV)
        Pw=P.reshape(-1,3)[s.first]; UVw=UV.reshape(-1,2)[s.first]
        if cell: s.cid=cluster(Pw,UVw,cell)
        else: s.cid=np.arange(len(s.first))
        s.nv=int(s.cid.max())+1; s.cnt=np.bincount(s.cid,minlength=s.nv).astype(np.float64)
        first_of=np.zeros(s.nv,np.int64); first_of[s.cid[::-1]]=np.arange(len(s.cid))[::-1]
        s.uv=UVw[first_of]
        Pc=Pw[first_of]; ref=cell if cell else 1e-4*float(np.abs(Pw).max())
        _,s.pg=np.unique(np.round(Pc/ref).astype(np.int64),axis=0,return_inverse=True); s.pg=s.pg.ravel()
        T=s.cid[s.inv.reshape(-1,3)]
        ok=(T[:,0]!=T[:,1])&(T[:,1]!=T[:,2])&(T[:,0]!=T[:,2]); T=T[ok]
        srt=np.sort(T,axis=1); _,u=np.unique(srt,axis=0,return_index=True); s.T=T[np.sort(u)]
    def raw(s,stack,t):
        P,N,UV=pose(s.sc,s.part,stack,t); P,N=s.canon(P),s.canon(N)
        if s.subdiv: P,N,UV=subdivide_phong(P,N,UV,s.subdiv)
        return P,N,UV
    def frame(s,stack,t,xf):
        P,_,_=s.raw(stack,t); Pw=xf(P.reshape(-1,3)[s.first])
        out=np.zeros((s.nv,3)); 
        for k in range(3): out[:,k]=np.bincount(s.cid,weights=Pw[:,k],minlength=s.nv)/s.cnt
        return out
def build(name,meshes,stackframes,xf,mats,length,extra_cols=None,clips=None):
    """meshes: list of SoupMesh; stackframes: list of (stack,t) -> frames; returns Pack."""
    offs=np.cumsum([0]+[m.nv for m in meshes]); nvt=int(offs[-1])
    pos=np.zeros((len(stackframes),nvt,3),np.float32); nrm=np.zeros_like(pos)
    for fi,(stk,t) in enumerate(stackframes):
        for m,o in zip(meshes,offs):
            V=m.frame(stk,t,xf); pos[fi,o:o+m.nv]=V; nrm[fi,o:o+m.nv]=vertex_normals(V,m.T,m.pg)
    uv=np.concatenate([m.uv for m in meshes]); uv=np.stack([uv[:,0],1-uv[:,1]],1)
    parts=[]; idx=[]; start=0
    for m,o,mt in zip(meshes,offs,mats):
        ii=(m.T+o).ravel(); idx.append(ii); parts.append(dict(start=start,count=len(ii),mat=mt)); start+=len(ii)
    pk=Pack(name); pk.parts=parts; pk.clips=clips or {}; pk.meta=dict(radius=0.6,waterline=0.0,length=length)
    col=None
    if extra_cols is not None: col=np.concatenate(extra_cols).astype(np.uint8)
    pk.build(pos,nrm,uv,np.concatenate(idx),col); return pk
def export_clown():
    sc,parts=load_parts(CLOWN_FBX); part=parts[0]; stack=list(sc.stacks)[0]; t0,t1=sc.stack_range(stack); period=t1-t0
    canon=lambda p: np.stack([p[...,2],p[...,0],p[...,1]],-1)   # fwd = +z (nose), left = +x, up = +y (the fish's back)
    m=SoupMesh(sc,part,canon,stack,cell=None,subdiv=2)
    Pb,_,_=m.raw(None,0); xn,xt=float(Pb[...,0].max()),float(Pb[...,0].min()); Lm=xn-xt; pivot=xn-0.444*Lm
    xf=lambda P: (P-np.array([pivot,0,0]))/Lm
    NF=24; frames=[(stack,t0+period*k/NF) for k in range(NF)]
    mat=dict(tex=['koi.webp','tang.webp','perch.webp'],nmap='fish_normal.webp',rough=0.38,spec=0.5,gain=1.35,alpha='cut',nstrength=0.7)
    pk=build('clown',[m],frames,xf,[mat],1.0,clips=dict(swim=dict(start=0,count=NF,fps=NF/period,loop=True)))
    print('clown',pk.save(f'{OUT}/clown.prm'),'verts',m.nv,'tris',len(m.T),'period',period)
    SRC=CLOWN
    tex=B.tex_rgb(f'{SRC}/textures/Fish_001_diff.jpeg'); opac=B.tex_gray(f'{SRC}/textures/Fish_001_opac.jpeg'); bump=B.tex_gray(f'{SRC}/textures/Fish_001_bump.jpg')
    em=B.eye_mask(tex)
    variants={'koi':tex,'tang':B.hsv_recolor(tex,em,282,0.82,0.80,stripe_tint=(0.86,0.80,1.0)),'perch':B.hsv_recolor(tex,em,47,0.88,1.12,stripe_tint=(1.0,0.97,0.88))}
    solid=B.smooth(0.30,0.62,opac)
    for nm,tx in variants.items(): save_tex(rs(tx,1024),f'{nm}.webp',alpha=rs(solid,1024),q=88)
    h=rs(bump,1024); h=cv2.GaussianBlur(h,(0,0),1.0); gy,gx=np.gradient(h); n=np.dstack([-gx*8,-gy*8,np.ones_like(h)]); n/=np.linalg.norm(n,axis=-1,keepdims=True)
    save_tex(n*0.5+0.5,'fish_normal.webp',q=90)
def export_alien():
    """The alien fish: one skinned mesh with an 8.3 s looping swim; reduced by vertex clustering, baked per frame."""
    ALIEN='../../assets-src/alien-fish'
    sc,parts=load_parts(f'{ALIEN}/source/Alien Fish (animated).fbx')
    stack=list(sc.stacks)[0]; t0,t1=sc.stack_range(stack); period=float(t1-t0)
    canon=lambda p: np.stack([p[...,2],p[...,0],p[...,1]],-1)   # fwd = +z (nose), left = +x, up = +y (the back)
    Pb=canon(pose(sc,parts[0],None,0)[0]); xn,xt=float(Pb[...,0].max()),float(Pb[...,0].min()); Lm=xn-xt; pivot=xn-0.444*Lm
    xf=lambda P: (P-np.array([pivot,0,0]))/Lm
    m=SoupMesh(sc,parts[0],canon,None,cell=Lm/90)
    print('alien verts',m.nv,'tris',len(m.T),'period',period,flush=True)
    NF=32
    frames=[(stack,t0+period*k/NF) for k in range(NF)]
    mat=dict(tex='alien.webp',rmap='alien_rough.webp',nmap='alien_normal.webp',rough=0.5,spec=0.6,gain=1.0,nstrength=0.8)
    # the loop holds about 5 tail beats: one tail phase (2 pi) plays a fifth of it
    pk=build('alien',[m],frames,xf,[mat],1.0,clips=dict(swim=dict(start=0,count=NF,fps=NF/period,loop=True,cycles=5)))
    print('alien',pk.save(f'{OUT}/alien.prm'))
    from PIL import Image
    Image.MAX_IMAGE_PIXELS=None
    def rd(f,mode): return Image.open(f'{ALIEN}/textures/{f}').convert(mode)
    rd('texture_pbr_20250901.png','RGB').resize((2048,2048),Image.LANCZOS).save(f'{OUT}/alien.webp','WEBP',quality=84,method=6)
    rd('texture_pbr_20250901_normal.png','RGB').resize((1024,1024),Image.LANCZOS).save(f'{OUT}/alien_normal.webp','WEBP',quality=90,method=6)
    rd('texture_pbr_20250901_roughness.png','L').resize((1024,1024),Image.LANCZOS).save(f'{OUT}/alien_rough.webp','WEBP',quality=80,method=6)

if __name__=='__main__':
    for w in sys.argv[1:]: {'clown':export_clown,'alien':export_alien}[w]()
