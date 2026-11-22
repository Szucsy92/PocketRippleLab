import sys; sys.path.insert(0,'.')
from toylib import *
# ---------------- ring ----------------
def ring(fr,sleeve,spin=0.0):
    X,Y=fr.SX,fr.SY; rho=np.hypot(X,Y); th=np.arctan2(Y,X)+spin
    R,rt=1.0,0.33; mid=R-rt
    ph=((th/(2*np.pi))*8)%1.0; sector=np.floor(((th/(2*np.pi))*8))%2
    edge=np.minimum(ph,1-ph)
    S=smooth(0.035,0.075,edge)*(sector==0)          # sleeve indicator with rounded ends
    rte=rt*(1+0.07*S)
    d=np.abs(rho-mid)
    h=np.where(d<rte,np.sqrt(np.clip(rte**2-d**2,0,None))+0.0,NEG)
    white=np.array([0.95,0.95,0.93],np.float32); col=np.array(sleeve,np.float32)
    alb=white*(1-S[...,None])+col*S[...,None]
    # darker seam where sleeve ends meet tube
    seam=smooth(0.0,0.03,edge)*(sector==0)
    alb=alb*(0.72+0.28*np.where(sector==0,seam,1.0))[...,None]
    rough=np.where(S>0.5,0.28,0.38)*np.ones_like(h); spec=np.ones_like(h)*0.7; refl=np.ones_like(h)*0.4
    return hf_layer(fr,h,alb,rough,spec,refl)
fr=Frame(448,2.16)
meta={}
for nm,sl in [('ring0','#f0761a'),('ring1','#1d7fc0')]:
    L=ring(fr,rgb(sl)); img=finish(fr,L,dict(ambient=0.75,diffuse=0.7,ao_k=0.7,ao_rad=10,exposure=1.08))
    Image.fromarray(img,'RGBA').save(f'{OUT}/{nm}.webp','WEBP',quality=90,alpha_quality=100,method=6)
meta['ring']=dict(size=448,extent=2.16,outer=1.0)
json.dump(meta,open('./toy_meta.json','w'))
print('ring done')
