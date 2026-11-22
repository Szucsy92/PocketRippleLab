import sys; sys.path.insert(0,'.')
from duckmodel import *
from PIL import Image
OUT='../../src/assets/sprites'
P0,N0,UV0=load()
P0,N0,UV0=subdivide_phong(canon(P0,'y-'),canon(N0,'y-'),UV0,1)      # canonical: x fwd (beak), y left, z up
base=tex(f'{SRC}/textures/dirty_base_color.jpg'); rough=tex(f'{SRC}/textures/dirty_roughness.jpg',True)
# the supplied set is the worn "dirty" version: lift it a little so it reads on the water
base=np.clip(base**0.8*1.25,0,1)
SZ=256; EXT=2.9; UNIT=8.0     # model units -> sprite units (mesh is ~0.3 long)
NH=16
sheet=np.zeros((2*SZ,8*SZ,4),np.uint8)
for k in range(NH):
    a=2*np.pi*k/NH; c,s=np.cos(a),np.sin(a)
    P=P0.copy(); N=N0.copy()
    sx0=P[...,0]; sy0=-P[...,1]                        # screen frame (x right, y down) before heading
    nx0=N[...,0]; ny0=-N[...,1]
    W=SZ*SS; ppu=W/EXT*UNIT
    sx=(sx0*c-sy0*s)*ppu+W/2; sy=(sx0*s+sy0*c)*ppu+W/2; sz=P[...,2]*UNIT
    Ns=np.stack([nx0*c-ny0*s,nx0*s+ny0*c,N[...,2]],-1)
    A=np.zeros((len(P),3,8),np.float32); A[...,0:3]=Ns; A[...,3:5]=UV0
    out=rasterize(np.stack([sx,sy,sz],-1),A,np.zeros(len(P)),W,W); m=out[...,0]>-1e29
    u=np.nan_to_num(out[...,4]); v=np.nan_to_num(out[...,5])
    alb=samp(base,u,v); r=samp(rough,u,v)
    rg=0.28+0.5*r
    rgb=shade(alb,out[...,1:4],out[...,0],m,rough=rg,spec=0.55,refl=0.25,ambient=0.8,diffuse=0.7,ao_k=0.8,ao_rad=8,warm=0.2,exposure=1.1)
    img=finalize(rgb,m.astype(np.float32),SS)
    rr,cc=divmod(k,8); sheet[rr*SZ:(rr+1)*SZ,cc*SZ:(cc+1)*SZ]=img
Image.fromarray(sheet,'RGBA').save(f'{OUT}/duck.webp','WEBP',quality=90,alpha_quality=100,method=6)
d=Image.open(f'{OUT}/duck.webp').convert('RGBA'); bg=(30,120,150,255)
W_=Image.new('RGBA',(SZ*4,SZ*2),bg)
for i,k in enumerate([0,2,4,6]): W_.alpha_composite(d.crop((k*SZ,0,k*SZ+SZ,SZ)),(SZ*i,0))
for i,k in enumerate([1,3,5,7]): W_.alpha_composite(d.crop((k*SZ,SZ,k*SZ+SZ,2*SZ)),(SZ*i,SZ))
W_.convert('RGB').save('/tmp/duck_new.png'); print('ok')
