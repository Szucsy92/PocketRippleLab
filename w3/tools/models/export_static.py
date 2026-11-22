import sys, io, json; sys.path.insert(0,'.')
import numpy as np, cv2
from PIL import Image
from pack import Pack, weld
from meshio import load_fbx_geoms
from glb import load, accessor
from fishbake import subdivide_phong
OUT='../../src/assets/models'
def save_tex(arr,name,gray=False,q=88):
    a=np.clip(arr,0,1); a=(a*255+0.5).astype(np.uint8)
    Image.fromarray(a,'L' if gray else 'RGB').save(f'{OUT}/{name}','WEBP',quality=q,method=6)
def hexrgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)],np.float32)
# ---------------------------------------------------------------- ball (GLB)
def export_ball():
    js,bn=load('../../assets-src/beach-ball-free-download/source/beach_ball_free_download.glb')
    p=js['meshes'][0]['primitives'][0]
    V=accessor(js,bn,p['attributes']['POSITION']).astype(np.float64); N=accessor(js,bn,p['attributes']['NORMAL']).astype(np.float64)
    UV=accessor(js,bn,p['attributes']['TEXCOORD_0']).astype(np.float64); idx=accessor(js,bn,p['indices']).astype(np.int64).ravel()
    # glTF is y-up: canonical = (x fwd, y left, z up) <- (x, -z, y)
    c=lambda a: np.stack([a[:,0],-a[:,2],a[:,1]],1)
    V=c(V); N=c(N); r=np.linalg.norm(V,axis=1).mean(); V/=r
    # glTF v is top-down, and textures are uploaded unflipped, so the UVs are used as they are
    pk=Pack('ball'); pk.meta=dict(radius=1.0,waterline=-0.72)
    pk.parts=[dict(start=0,count=len(idx),mat=dict(tex=['ball0.webp','ball1.webp'],rough=0.28,spec=0.9,gain=1.0,nearest=True))]
    pk.build(V,N,UV,idx); print('ball',pk.save(f'{OUT}/ball.prm'),'bytes',len(V),'verts')
    tex=np.array(Image.open(io.BytesIO(bn[js['bufferViews'][js['images'][0]['bufferView']]['byteOffset']:][:js['bufferViews'][js['images'][0]['bufferView']]['byteLength']])).convert('RGB')).astype(np.float32)/255
    big=cv2.resize(tex,(128,128),interpolation=cv2.INTER_NEAREST)
    save_tex(big,'ball0.webp',q=95)
    t=np.zeros((3,2,3),np.float32); cols=['#e0158f','#2fb0f0']*3
    for k in range(6): t[k//2,k%2]=hexrgb(cols[k])
    save_tex(cv2.resize(t,(128,128),interpolation=cv2.INTER_NEAREST),'ball1.webp',q=95)
# ---------------------------------------------------------------- ring (procedural torus, 2 colours via a palette texture)
def export_ring():
    nth,nph=192,28; Rc,rt=0.67,0.33
    th=np.linspace(0,2*np.pi,nth+1)[:-1]; ph=np.linspace(0,2*np.pi,nph+1)[:-1]
    TH,PH=np.meshgrid(th,ph,indexing='ij')
    sec=(TH/(2*np.pi)*8); frac=sec%1.0; edge=np.minimum(frac,1-frac); sleeve=((np.floor(sec)%2)==0)
    sm=lambda a,b,x: np.clip((x-a)/(b-a),0,1)**2*(3-2*np.clip((x-a)/(b-a),0,1))
    S=sm(0.03,0.075,edge)*sleeve
    rte=rt*(1+0.07*S)
    rad=Rc+rte*np.cos(PH)
    P=np.stack([rad*np.cos(TH),rad*np.sin(TH),rte*np.sin(PH)],-1)
    # normals from the grid
    dth=np.roll(P,-1,0)-np.roll(P,1,0); dph=np.roll(P,-1,1)-np.roll(P,1,1)
    Nn=np.cross(dth,dph); Nn/=np.linalg.norm(Nn,axis=-1,keepdims=True)
    outward=np.stack([np.cos(TH)*np.cos(PH),np.sin(TH)*np.cos(PH),np.sin(PH)],-1)
    Nn=np.where(((Nn*outward).sum(-1)<0)[...,None],-Nn,Nn)
    seam=sleeve&(edge<0.045)
    u=np.where(S>0.5,0.375,0.125)+np.where(seam,0.25,0.0)   # white / sleeve / seam texels of an 4x1 palette
    UV=np.stack([u,np.full_like(u,0.5)],-1)
    idx=np.arange(nth*nph).reshape(nth,nph); tri=[]
    a=idx; b=np.roll(idx,-1,0); c=np.roll(idx,-1,1); d=np.roll(np.roll(idx,-1,0),-1,1)
    tri=np.concatenate([np.stack([a,b,c],-1).reshape(-1,3),np.stack([b,d,c],-1).reshape(-1,3)])
    pk=Pack('ring'); pk.meta=dict(radius=1.0,waterline=-0.08)
    pk.parts=[dict(start=0,count=tri.size,mat=dict(tex=['ring0.webp','ring1.webp'],rough=0.3,spec=0.75,nearest=True))]
    pk.build(P.reshape(-1,3),Nn.reshape(-1,3),UV.reshape(-1,2),tri.ravel()); print('ring',pk.save(f'{OUT}/ring.prm'))
    for nm,hx in (('ring0.webp','#f0761a'),('ring1.webp','#1d7fc0')):
        # texels: 0 white, 1 sleeve, 2 white-seam, 3 sleeve-seam
        row=np.stack([[0.95,0.95,0.93],hexrgb(hx),np.array([0.62,0.62,0.6]),hexrgb(hx)*0.55])[None]
        save_tex(cv2.resize(row,(32,8),interpolation=cv2.INTER_NEAREST),nm,q=98)
# ---------------------------------------------------------------- duck (FBX)
def export_duck():
    SRC='../../assets-src/rubber-duck-toy'
    g=list(load_fbx_geoms(f'{SRC}/source/rubber_duck_toy.fbx').values())[0]
    P=g['V'][g['corner_vi'][g['tri']]]; N=g['n'][g['tri']]; UV=g['uv'][g['tri']]
    k=7.36
    canon=lambda p: np.stack([-p[...,1],p[...,0],p[...,2]],-1)    # beak (-y) -> +x forward, z up
    P=canon(P)*k; N=canon(N)
    P,N,UV=subdivide_phong(P,N,UV,1)
    Pw,Nw,Uw,_,inv=weld(P,N,UV)
    idx=inv.reshape(-1)
    cx=(Pw[:,0].min()+Pw[:,0].max())/2; cy=(Pw[:,1].min()+Pw[:,1].max())/2
    Pw[:,0]-=cx; Pw[:,1]-=cy
    pk=Pack('duck'); pk.meta=dict(radius=1.2,waterline=0.62)
    pk.parts=[dict(start=0,count=len(idx),mat=dict(tex='duck_base.webp',rmap='duck_rough.webp',nmap='duck_normal.webp',rough=0.5,spec=0.5,gain=1.25,gamma=0.8,nstrength=0.8))]
    # UV: FBX v is bottom-up; we upload images unflipped -> flip v here
    Uw=np.stack([Uw[:,0],1-Uw[:,1]],1)
    pk.build(Pw,Nw,Uw,idx); print('duck',pk.save(f'{OUT}/duck.prm'),Pw.shape,'z',Pw[:,2].min(),Pw[:,2].max())
    def ld(f,gray=False):
        im=cv2.imread(f'{SRC}/textures/{f}',0 if gray else cv2.IMREAD_COLOR); im=cv2.resize(im,(1024,1024),interpolation=cv2.INTER_AREA)
        return im.astype(np.float32)/255 if gray else cv2.cvtColor(im,cv2.COLOR_BGR2RGB).astype(np.float32)/255
    save_tex(ld('dirty_base_color.jpg'),'duck_base.webp',q=86); save_tex(ld('dirty_roughness.jpg',True),'duck_rough.webp',gray=True,q=80)
    save_tex(ld('toy_normal.jpg'),'duck_normal.webp',q=90)
if __name__=='__main__':
    for w in sys.argv[1:]: {'ball':export_ball,'ring':export_ring,'duck':export_duck}[w]()
