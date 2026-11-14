"""Bakes fish / shark sprite sheets from the REAL skeletal animations in the FBX files.
   python3 bake_anim.py clown|shark|bite [preview]
"""
import sys, os, json; sys.path.insert(0,'.')
import numpy as np, cv2
from skinmesh import load_parts, pose
from fishbake import subdivide_phong, deform
from r3d import rasterize
from common import *
OUT='../../src/assets/sprites'; SRC='../../assets-src'
CLOWN_FBX=f'{SRC}/clown/source/cab939cb4ecb4ab583940af6e5c384c5.fbx.fbx'
SHARK_FBX=f'{SRC}/shark/source/Realistic Shark.fbx'
PH=8

def samp(img,u,v):
    h,w=img.shape[:2]
    return cv2.remap(img,(np.clip(u,-2,3)*w).astype(np.float32)-0.5,((1-np.clip(v,-2,3))*h).astype(np.float32)-0.5,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
def tex_rgb(path): return cv2.cvtColor(cv2.imread(path),cv2.COLOR_BGR2RGB).astype(np.float32)/255
def tex_gray(path): return cv2.imread(path,0).astype(np.float32)/255

class Mat:
    """Per-part material: albedo/alpha/spec/bump are functions of (u,v) -> full-frame arrays."""
    def __init__(s,albedo,alpha=None,spec=0.4,rough=0.4,bump=None,bump_k=0.0,**shade_kw):
        s.albedo=albedo; s.alpha=alpha; s.spec=spec; s.rough=rough; s.bump=bump; s.bump_k=bump_k; s.kw=shade_kw
class Soup:
    def __init__(s,P,N,UV,mat): s.P,s.N,s.UV,s.mat=P,N,UV,mat

def render(soups,W,H,scale,ss=SS,light=LIGHT):
    """soups: list of Soup in canonical coords (x fwd, y left, z up) centred on the pivot -> RGBA uint8 (H,W,4)."""
    Ws,Hs=W*ss,H*ss
    P=np.concatenate([s.P for s in soups]); N=np.concatenate([s.N for s in soups]); UV=np.concatenate([s.UV for s in soups])
    tid=np.concatenate([np.full(len(s.P),i,np.float32) for i,s in enumerate(soups)])
    Ps=np.stack([P[...,0]*scale*ss+Ws/2,-P[...,1]*scale*ss+Hs/2,P[...,2]],-1)
    Ns=np.stack([N[...,0],-N[...,1],N[...,2]],-1)
    A=np.zeros(P.shape[:2]+(8,),np.float32); A[...,0:3]=Ns; A[...,3:5]=UV
    out=rasterize(Ps,A,tid,Ws,Hs)
    Z=out[...,0]; m=Z>-1e29
    n=out[...,1:4].copy(); u=np.nan_to_num(out[...,4]); v=np.nan_to_num(out[...,5]); T=np.rint(out[...,6]).astype(int)
    alb=np.zeros((Hs,Ws,3),np.float32); alpha=np.zeros((Hs,Ws),np.float32)
    spec=np.zeros((Hs,Ws),np.float32); rough=np.zeros((Hs,Ws),np.float32); kw={}
    for i,s in enumerate(soups):
        mk=m&(T==i)
        if not mk.any(): continue
        mt=s.mat
        a=mt.albedo(u,v); alb[mk]=a[mk]
        al=np.ones((Hs,Ws),np.float32) if mt.alpha is None else mt.alpha(u,v)
        alpha[mk]=al[mk]
        sp=mt.spec(u,v) if callable(mt.spec) else np.full((Hs,Ws),mt.spec,np.float32); spec[mk]=sp[mk]
        rough[mk]=mt.rough
        if mt.bump is not None and mt.bump_k>0:
            h=cv2.GaussianBlur(mt.bump(u,v).astype(np.float32),(0,0),0.7*ss/3)
            gy,gx=np.gradient(h); nn=n.copy(); nn[...,0]-=mt.bump_k*gx*ss; nn[...,1]-=mt.bump_k*gy*ss
            nn/=np.maximum(np.linalg.norm(nn,axis=-1,keepdims=True),1e-6); n[mk]=nn[mk]
        for k,val in mt.kw.items(): kw[k]=val
    a=m.astype(np.float32)*alpha
    rgb=shade(alb,n,Z,m,rough=rough,spec=spec,light=light,**kw)
    return finalize(rgb,a,ss)

def rotate_pitch(P,N,deg):
    """nose-up pitch (about the lateral y axis); +x fwd, +z toward the viewer."""
    t=np.radians(deg); c,s=np.cos(t),np.sin(t)
    def r(A):
        x,z=A[...,0].copy(),A[...,2].copy(); B=A.copy(); B[...,0]=x*c-z*s; B[...,2]=x*s+z*c; return B
    return r(P),r(N)

def rotate_roll(P,N,deg):
    """roll about the long x axis; positive turns the belly toward -y... (side shown to the viewer)."""
    t=np.radians(deg); c,s=np.cos(t),np.sin(t)
    def r(A):
        y,z=A[...,1].copy(),A[...,2].copy(); B=A.copy(); B[...,1]=y*c-z*s; B[...,2]=y*s+z*c; return B
    return r(P),r(N)

# ---------------------------------------------------------------- clown fish
def hsv_recolor(tex,eye_keep,hue,sat_k,val_k,stripe_tint=None):
    hsv=cv2.cvtColor(tex,cv2.COLOR_RGB2HSV); sat=hsv[...,1]; val=hsv[...,2]
    stripe=smooth(0.0,1.0,np.clip((0.42-sat)/0.2,0,1))*(val>0.45)
    out=hsv.copy(); out[...,0]=hue; out[...,1]=np.clip(sat*sat_k,0,1); out[...,2]=np.clip(val*val_k,0,1)
    body=cv2.cvtColor(out,cv2.COLOR_HSV2RGB)
    st=tex.copy()
    if stripe_tint is not None: st=np.clip(st*0.55+np.array(stripe_tint,np.float32)*val[...,None]*0.5,0,1)
    rgb=body*(1-stripe[...,None])+st*stripe[...,None]
    k=eye_keep[...,None]; return rgb*(1-k)+tex*k
def eye_mask(tex):
    hsv=cv2.cvtColor(tex,cv2.COLOR_RGB2HSV)
    iris=((hsv[...,0]>85)&(hsv[...,0]<175)&(hsv[...,1]>0.25)&(hsv[...,2]>0.12)).astype(np.uint8)
    iris=cv2.morphologyEx(iris,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    n,lab,st,cen=cv2.connectedComponentsWithStats(iris)
    idx=sorted(range(1,n),key=lambda i:-st[i,4])[:2]
    m=np.zeros(iris.shape,np.float32)
    for i in idx:
        r=max(st[i,2],st[i,3])*1.05+8; cv2.circle(m,(int(cen[i][0]),int(cen[i][1])),int(r),1.0,-1)
    return cv2.GaussianBlur(m,(0,0),3)

CLOWN_AMP=0.6
def tail_twist(deg,start=0.74):
    """Rolls the caudal peduncle + fin about the spine in the bind pose (before skinning), so the vertical tail fin
    fans out when seen from above. Works in the bind world space of the FBX (nose = +z)."""
    def fn(part):
        Pw=(part.MG@part.Vh.T).T; z=Pw[:,2]; L=z.max()-z.min(); s=np.clip((z.max()-z)/L,0,1)
        w=smooth(start,1.0,s)*np.radians(deg); tail=s>start; y0=Pw[tail,1].mean()
        c,sn=np.cos(w),np.sin(w); x=Pw[:,0].copy(); y=Pw[:,1]-y0
        Pw=Pw.copy(); Pw[:,0]=x*c-y*sn; Pw[:,1]=x*sn+y*c+y0
        return (np.linalg.inv(part.MG)@Pw.T).T
    return fn
CLOWN_TWIST=38.0
def clown_soups(sc,part,t,stack,tex,opac,bump,refl,amp=None):
    P,N,UV=pose(sc,part,stack,t,amp=CLOWN_AMP if amp is None else amp,twist=tail_twist(CLOWN_TWIST))
    canon=lambda p: np.stack([p[...,2],-p[...,0],-p[...,1]],-1)   # nose = +z, back = -y (seen from above)
    P,N=canon(P),canon(N)
    P,N,UV=subdivide_phong(P,N,UV,2)
    return P,N,UV

def bake_clown(preview=False):
    sc,parts=load_parts(CLOWN_FBX); part=parts[0]; stack=list(sc.stacks)[0]
    t0,t1=sc.stack_range(stack); period=t1-t0
    tex=tex_rgb(f'{SRC}/clown/textures/Fish_001_diff.jpeg'); opac=tex_gray(f'{SRC}/clown/textures/Fish_001_opac.jpeg')
    bump=tex_gray(f'{SRC}/clown/textures/Fish_001_bump.jpg'); refl=tex_gray(f'{SRC}/clown/textures/reflct.jpg')
    em=eye_mask(tex)
    variants={'koi':tex,
      'tang':hsv_recolor(tex,em,282,0.82,0.80,stripe_tint=(0.86,0.80,1.0)),
      'perch':hsv_recolor(tex,em,47,0.88,1.12,stripe_tint=(1.0,0.97,0.88))}
    if preview: cv2.imwrite('/tmp/clown_variants.png',cv2.cvtColor((np.hstack([cv2.resize(v,(512,512)) for v in variants.values()])*255).astype(np.uint8),cv2.COLOR_RGB2BGR))
    # extents of the bind pose (straight fish) fix scale and pivot for every frame
    Pb,Nb,UVb=clown_soups(sc,part,0,None,None,None,None,None)
    xn,xt=float(Pb[...,0].max()),float(Pb[...,0].min()); Lm=xn-xt; pivot=xn-0.444*Lm
    Lpx,cw,ch=224,288,208; scale=Lpx/Lm
    solid=lambda u,v: smooth(0.30,0.62,samp(opac,u,v))              # solid fish: opaque body and fins
    out={}
    for name,tx in variants.items():
        mat=Mat(lambda u,v,tx=tx: samp(tx,u,v),alpha=solid,spec=lambda u,v: 0.18+0.55*samp(refl,u,v),rough=0.34,
                bump=lambda u,v: samp(bump,u,v),bump_k=2.2,ambient=0.85,diffuse=0.66,ao_k=0.2,exposure=1.38,refl=0.28)
        sheet=np.zeros(((3+1)*ch,PH*cw,4),np.uint8)
        rows=[(0.0,0.0),(0.55,9.0),(1.0,18.0)]
        for r,(bm,bk) in enumerate(rows):
            for k in range(PH):
                P,N,UV=clown_soups(sc,part,t0+period*k/PH,stack,None,None,None,None)
                P=P.copy(); P[...,0]-=pivot
                P,N=deform(P,N,xn-pivot,xt-pivot,0,bm*0.15,0.0,0.0,bank_deg=bk)
                sheet[r*ch:(r+1)*ch,k*cw:(k+1)*cw]=render([Soup(P,N,UV,mat)],cw,ch,scale)
            print(name,'row',r,flush=True)
        P,N,UV=clown_soups(sc,part,0,None,None,None,None,None)
        P=P.copy(); P[...,0]-=pivot; P,N=deform(P,N,xn-pivot,xt-pivot,0,0,0.0,0.0,bank_deg=0)
        sheet[3*ch:4*ch,0:cw]=render([Soup(P,N,UV,mat)],cw,ch,scale)
        save_webp(sheet,f'{OUT}/{name}.webp',q=88)
        out[name]=dict(name=name,cw=cw,ch=ch,cols=PH,rows=3,lenPx=Lpx,pivot=0.444)
    return out

# ---------------------------------------------------------------- shark
JAW_GAIN=1.9
def amplify_jaw(sc,stack,gain):
    nid=[i for i in sc.models if sc.name[i].startswith('Jaw')][0]
    for ax in 'XYZ':
        cv=sc.stacks[stack].get((nid,'Lcl Rotation',ax))
        if cv is not None: cv.v=cv.v[0]+gain*(cv.v-cv.v[0])
def shark_setup():
    sc,parts=load_parts(SHARK_FBX,only=['white-shark_body','white-shark_tooth-top.001','white-shark_tooth-bottom.001','white-shark_eyes.003'])
    amplify_jaw(sc,'Shark Rig|bite_skeletal.3',JAW_GAIN)
    tex=tex_rgb(f'{SRC}/shark/textures/Shark_Skin.jpeg')
    lum=tex.mean(-1,keepdims=True)
    tint=np.clip((lum**0.85*1.25)*np.array([0.72,0.86,1.02]),0,1)
    graded=np.clip(tint+(tex-lum)*1.0,0,1)                    # slate-blue skin, but keep the pink gums / cream teeth
    body=Mat(lambda u,v: samp(graded,u,v),spec=0.34,rough=0.42,ambient=0.8,diffuse=0.6,ao_k=0.3,exposure=1.05,refl=0.3)
    teeth=Mat(lambda u,v: samp(np.clip(tex*1.35,0,1),u,v),spec=0.55,rough=0.28)
    eye=Mat(lambda u,v: np.broadcast_to(np.array([0.02,0.025,0.05],np.float32),u.shape+(3,)).copy(),spec=1.0,rough=0.12)
    mats={'white-shark_body':body,'white-shark_tooth-top.001':teeth,'white-shark_tooth-bottom.001':teeth,'white-shark_eyes.003':eye}
    canon=lambda p: np.stack([p[...,2],p[...,0],p[...,1]],-1)
    b=[canon(pose(sc,p,None,0)[0]) for p in parts]
    allp=np.concatenate([x.reshape(-1,3) for x in b]); xn,xt=float(allp[:,0].max()),float(allp[:,0].min())
    return sc,parts,mats,canon,xn,xt
def shark_frame(sc,parts,mats,canon,stack,t,pivot,pitch=0.0):
    soups=[]
    for p in parts:
        P,N,UV=pose(sc,p,stack,t); P,N=canon(P),canon(N); P=P.copy(); P[...,0]-=pivot
        soups.append([P,N,UV,mats[p.name]])
    return soups
def bake_shark():
    sc,parts,mats,canon,xn,xt=shark_setup(); Lm=xn-xt; pivot=xn-0.444*Lm
    Lpx,cw,ch=400,480,256; scale=Lpx/Lm; st='Shark Rig|swimming_skeletal.3'; period=2.0
    sheet=np.zeros(((3+1)*ch,PH*cw,4),np.uint8)
    rows=[(0.0,0.0),(0.55,6.0),(1.0,12.0)]
    for r,(bm,bk) in enumerate(rows):
        for k in range(PH):
            soups=[]
            for P,N,UV,mt in shark_frame(sc,parts,mats,canon,st,period*k/PH,pivot):
                P,N=deform(P,N,xn-pivot,xt-pivot,0,bm*0.13,0.0,0.0,bank_deg=bk); soups.append(Soup(P,N,UV,mt))
            sheet[r*ch:(r+1)*ch,k*cw:(k+1)*cw]=render(soups,cw,ch,scale)
        print('shark row',r,flush=True)
    soups=[Soup(*a) for a in shark_frame(sc,parts,mats,canon,None,0,pivot)]
    sheet[3*ch:4*ch,0:cw]=render(soups,cw,ch,scale)
    save_webp(sheet,f'{OUT}/shark.webp',q=86)
    return dict(name='shark',cw=cw,ch=ch,cols=PH,rows=3,lenPx=Lpx,pivot=0.444)
BITE_N=28; BITE_COLS=7
def bake_bite():
    """'ham, ham': two jaw snaps from the rig's own bite_skeletal clip, head lifted toward the viewer so the teeth show."""
    sc,parts,mats,canon,xn,xt=shark_setup(); Lm=xn-xt; pivot=xn-0.444*Lm
    Lpx,cw,ch=400,512,352; scale=Lpx/Lm; st='Shark Rig|bite_skeletal.3'
    rows=(BITE_N+BITE_COLS-1)//BITE_COLS; sheet=np.zeros((rows*ch,BITE_COLS*cw,4),np.uint8)
    for n in range(BITE_N):
        f=4+(n%14); t=f/24.0
        env=smooth(0,6,n)*(1-smooth(21,27,n)); pitch=15.0*env; roll=-72.0*env
        soups=[]
        for P,N,UV,mt in shark_frame(sc,parts,mats,canon,st,t,pivot):
            P,N=rotate_pitch(P,N,pitch); P,N=rotate_roll(P,N,roll); soups.append(Soup(P,N,UV,mt))
        r,c=divmod(n,BITE_COLS); sheet[r*ch:(r+1)*ch,c*cw:(c+1)*cw]=render(soups,cw,ch,scale)
        print('bite',n,flush=True)
    save_webp(sheet,f'{OUT}/shark_bite.webp',q=86)
    return dict(name='shark_bite',cw=cw,ch=ch,cols=BITE_COLS,frames=BITE_N,lenPx=Lpx,pivot=0.444)
if __name__=='__main__':
    meta={}
    mp='./fish_meta.json'; old=json.load(open(mp)) if os.path.exists(mp) else {}
    for what in sys.argv[1:]:
        if what=='clown': old.update(bake_clown(preview=True))
        elif what=='shark': old['shark']=bake_shark()
        elif what=='bite': old['shark_bite']=bake_bite()
    json.dump(old,open(mp,'w'),indent=1); print(json.dumps(old))
