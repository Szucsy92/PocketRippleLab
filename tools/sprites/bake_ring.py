"""Life ring rebuilt as a real mesh that follows the supplied render: a soft white tube with 6 fat, glossy sleeves
(rounded lips, dark seam), orange and blue. Top-down, 448 px, outer radius 1.0 (extent 2.16 radii)."""
import sys; sys.path.insert(0,'.')
from bake_anim import *
from r3d import vertex_normals
NSEG=6; FRAC=0.56; RT=0.32; GROW=0.12; EPS=0.07
def ring_mesh(phase=0.0,nt=1440,nf=64):
    Rm=1.0-RT*(1+GROW)
    th=np.linspace(0,2*np.pi,nt,endpoint=False); ph=np.linspace(0,2*np.pi,nf,endpoint=False)
    u=((th/(2*np.pi))*NSEG+phase)%1.0                       # position inside one white+sleeve period
    inside=(u<FRAC); dist=np.where(inside,np.minimum(u,FRAC-u),0.0)/FRAC   # 0 at sleeve edge .. 0.5 at its middle
    x=np.clip(dist/EPS,0,1); prof=np.where(inside,np.sqrt(np.clip(1-(1-x)**2,0,1)),0.0)
    r=RT*(1+GROW*prof)
    TH,PH=np.meshgrid(th,ph,indexing='ij'); R=np.broadcast_to(r[:,None],TH.shape)
    rho=Rm+R*np.cos(PH); P=np.stack([rho*np.cos(TH),rho*np.sin(TH),R*np.sin(PH)],-1)
    idx=np.arange(nt*nf).reshape(nt,nf); a=idx; b=np.roll(idx,-1,0); c=np.roll(np.roll(idx,-1,0),-1,1); d=np.roll(idx,-1,1)
    F=np.concatenate([np.stack([a,b,c],-1).reshape(-1,3),np.stack([a,c,d],-1).reshape(-1,3)])
    V=P.reshape(-1,3).astype(np.float32); Nv=vertex_normals(V,F)
    seam=np.broadcast_to(np.where(inside,np.clip(dist/0.025,0,1),1.0)[:,None],TH.shape).reshape(-1)   # dark gap line at the lips
    sleeve=np.broadcast_to(inside[:,None],TH.shape).reshape(-1)
    return V,Nv,F,seam,sleeve
def ring_soups(color,phase):
    V,Nv,F,seam,sleeve=ring_mesh(phase)
    white=np.array([0.93,0.93,0.94],np.float32); col=np.array(color,np.float32)
    sl_f=sleeve[F].all(1); wh_f=~sleeve[F].any(1)
    out=[]
    for mask,alb,rough,spec,refl in ((wh_f,white,0.55,0.28,0.2),(sl_f,col,0.28,0.8,0.4)):
        Fm=F[mask]; P=V[Fm]; N=Nv[Fm]; UV=np.stack([np.zeros(Fm.shape),np.zeros(Fm.shape)],-1)[...,:2].astype(np.float32); UV[...,1]=seam[Fm]
        mat=Mat(lambda u,v,alb=alb: np.asarray(alb,np.float32)*(0.50+0.50*v)[...,None],spec=spec,rough=rough,ambient=0.78,diffuse=0.7,ao_k=0.7,ao_rad=10,exposure=1.12,refl=refl)
        out.append(Soup(P,N,UV,mat))
    # white tube keeps a faint shade where it enters the sleeves
    return out
if __name__=='__main__':
    S=448; scale=S/2.16
    for nm,col,ph in (('ring0',(0.93,0.40,0.09),0.0),('ring1',(0.03,0.38,0.60),0.5)):
        img=render(ring_soups(col,ph),S,S,scale); save_webp(img,f'{OUT}/{nm}.webp',q=92)
    print('rings baked')
