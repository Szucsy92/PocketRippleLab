import sys; sys.path.insert(0,'.')
import numpy as np, cv2
from PIL import Image
from pack import Pack
OUT='../../src/assets/models'; K=0.92
class Mesh:
    def __init__(s): s.V=[];s.UV=[];s.C=[];s.T=[]
    def add(s,V,UV,C,T):
        o=sum(len(v) for v in s.V); s.V.append(V);s.UV.append(UV);s.C.append(C);s.T.append(T+o)
    def cat(s): return np.concatenate(s.V),np.concatenate(s.UV),np.concatenate(s.C),np.concatenate(s.T)
def grid_tris(nu,nv,wrap_u=False):
    idx=np.arange(nu*nv).reshape(nv,nu); t=[]
    nuu=nu if wrap_u else nu-1
    for j in range(nv-1):
        for i in range(nuu):
            a,b,c,d=idx[j,i],idx[j,(i+1)%nu],idx[j+1,i],idx[j+1,(i+1)%nu]; t+=[(a,b,c),(b,d,c)]
    return np.array(t)
def normals(V,T):
    n=np.zeros_like(V); fn=np.cross(V[T[:,1]]-V[T[:,0]],V[T[:,2]]-V[T[:,0]])
    for k in range(3): np.add.at(n,T[:,k],fn)
    return n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
def sm(a,b,x): t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
def hull_w(x): return np.where(x>=0,0.6*np.clip(1-(x/1.3)**2,0,None)**0.55,0.6*np.clip(1-(-x/1.05)**5,0,None)**0.5)
def cyl(p0,p1,r,col,n=14):
    p0=np.array(p0,float);p1=np.array(p1,float); d=p1-p0; L=np.linalg.norm(d); d/=L
    a=np.cross(d,[0,0,1.0]); 
    if np.linalg.norm(a)<1e-6: a=np.array([1.0,0,0])
    a/=np.linalg.norm(a); b=np.cross(d,a)
    ang=np.linspace(0,2*np.pi,n,endpoint=False)
    ring=lambda p: p+r*(np.cos(ang)[:,None]*a+np.sin(ang)[:,None]*b)
    V=np.concatenate([ring(p0),ring(p1),[p0],[p1]]); T=[]
    for i in range(n):
        j=(i+1)%n; T+=[(i,j,n+i),(j,n+j,n+i),(2*n,j,i),(2*n+1,n+i,n+j)]
    return V,np.zeros((len(V),2)),np.tile(np.array(col,np.uint8),(len(V),1)),np.array(T)
def sail(Tk,Hd,C,billow,col_fn,nu=18,nv=18):
    Tk,Hd,C=map(np.array,(Tk,Hd,C)); us,vs=np.meshgrid(np.linspace(0,1,nu),np.linspace(0,1,nv))
    P=Tk+us[...,None]*(C-Tk)*(1-vs[...,None])+vs[...,None]*(Hd-Tk)
    P=P+np.array([0,1,0.0])*(billow*16*us*(1-us)*vs*(1-vs))[...,None]
    cols=col_fn(us,vs).reshape(-1,4)
    return P.reshape(-1,3),np.zeros((nu*nv,2)),cols,grid_tris(nu,nv)
def build():
    # --- deck (wood texture) and hull body (vertex colours)
    nx,nvv=60,21
    xs=np.linspace(-1.05,1.3,nx); vs=np.linspace(-1,1,nvv)
    X,Vv=np.meshgrid(xs,vs); W=hull_w(X); Y=Vv*W
    zt=0.34*np.clip(1-np.abs(Vv)**6,0,None)**0.5+0.05*np.exp(-((np.abs(Vv)-0.93)/0.05)**2)
    Pdeck=np.stack([X,Y,zt],-1)
    inner=np.abs(Vv)<=0.86
    # deck: columns with |v|<=0.86 ; rim: the rest of the top ; bottom: full lower surface
    j_in=np.where(np.abs(vs)<=0.86)[0]; j0,j1=j_in[0],j_in[-1]
    def sub(jlo,jhi):
        Pp=Pdeck[jlo:jhi+1]; n=jhi-jlo+1; return Pp.reshape(-1,3),n
    m=Mesh()
    Pd,n=sub(j0,j1); UVd=np.stack([Pd[:,0]*0.45,Pd[:,1]*0.9+0.5],1); Cd=np.full((len(Pd),4),255,np.uint8)
    deckT=grid_tris(nx,n)
    # fix grid orientation: our array is [v][x]; grid_tris expects (nu along row, nv rows) -> rows=v
    deck=(Pd,UVd,Cd,deckT)
    # rim strips left/right
    rimP=[];rimT=[];off=0
    for sl in (slice(0,j0+1),slice(j1,nvv)):
        Pp=Pdeck[sl].reshape(-1,3); nn=Pdeck[sl].shape[0]; rimP.append(Pp); rimT.append(grid_tris(nx,nn)+off); off+=len(Pp)
    Pr=np.concatenate(rimP); Tr=np.concatenate(rimT); Cr=np.tile(np.array([240,232,214,255],np.uint8),(len(Pr),1))
    # hull bottom: from the gunwale edge down to a keel
    zb=zt[:, :]*0
    Pb=np.stack([X,Y,0.28-0.62*np.sqrt(np.clip(1-Vv**2,0,None))*(0.4+0.6*np.clip(W/0.6,0,1))],-1).reshape(-1,3); Tb=grid_tris(nx,nvv)
    red=np.array([178,26,22,255],np.uint8); Cb=np.tile(red,(len(Pb),1))
    # cabin: rounded box (superellipsoid)
    nu,nv2=40,24; th=np.linspace(0,2*np.pi,nu,endpoint=False); ph=np.linspace(-np.pi/2,np.pi/2,nv2)
    TH,PH=np.meshgrid(th,ph); p=5.0
    sgn=lambda a: np.sign(a)*np.abs(a)**(2/p)
    cx,cy,cz,ax_,ay_,az=-0.22,0,0.34+0.0,0.42,0.30,0.2
    Pc=np.stack([cx+ax_*sgn(np.cos(PH))*sgn(np.cos(TH)),cy+ay_*sgn(np.cos(PH))*sgn(np.sin(TH)),cz+az*sgn(np.sin(PH))],-1).reshape(-1,3)
    keep=Pc[:,2]>=0.30
    Cc=np.tile(np.array([236,226,204,255],np.uint8),(len(Pc),1))
    dark=(np.abs(Pc[:,0]-cx)<0.22)&(np.abs(Pc[:,1])<0.1)&(Pc[:,2]>0.34+az*0.93); Cc[dark]=[28,31,38,255]
    Tc=grid_tris(nu,nv2,wrap_u=True)
    parts=[('deck',)+deck,('hull',Pr,np.zeros((len(Pr),2)),Cr,Tr),('hull',Pb,np.zeros((len(Pb),2)),Cb,Tb),('hull',Pc,np.zeros((len(Pc),2)),Cc,Tc)]
    dk=[60,38,20,255]
    masts=[cyl((0.42,0,0.34),(0.42,0,1.9),0.04,dk),cyl((0.42,0,0.52),(-0.85,0.3,0.58),0.03,dk)]
    cloth=lambda u,v: np.where(((v>0.62)&(v<0.74))[...,None],np.array([214,36,26,255],np.uint8),np.array([246,243,236,255],np.uint8))
    jibc=lambda u,v: np.tile(np.array([205,225,240,255],np.uint8),u.shape+(1,))
    main=sail((0.42,0,0.52),(0.42,0,1.85),(-0.85,0.3,0.58),0.11,cloth)
    jib=sail((1.08,0,0.4),(0.42,0,1.7),(0.25,0.28,0.5),0.08,jibc)
    flag=(np.array([[0.42,0,1.9],[0.42,0,1.99],[0.7,0.05,1.95]]),np.zeros((3,2)),np.tile(np.array([214,36,26,255],np.uint8),(3,1)),np.array([[0,1,2]]))
    return parts,masts,main,jib,flag
def export():
    parts,masts,main,jib,flag=build()
    groups=[('deck',[parts[0]]),('hull',parts[1:]),('trim',masts),('sail',[main,jib,flag])]
    Vs=[];UVs=[];Cs=[];Ts=[];plist=[];start=0;o=0
    for name,items in groups:
        ts=[]
        for it in items:
            V,UV,C,T=it[-4:]
            T=np.array(T)+o; Vs.append(np.asarray(V,float)*K); UVs.append(np.asarray(UV,float)); Cs.append(np.asarray(C)); ts.append(T); o+=len(V)
        T=np.concatenate(ts).reshape(-1); mat=dict(tex='boat_wood.webp',rough=0.55,spec=0.25,vcol=True) if name=='deck' else dict(rough=0.28 if name=='hull' else (0.6 if name=='trim' else 0.85),spec=0.6 if name=='hull' else (0.25 if name=='trim' else 0.05),vcol=True)
        plist.append(dict(start=start,count=len(T),mat=mat)); start+=len(T); Ts.append(T)
    V=np.concatenate(Vs); UV=np.concatenate(UVs); C=np.concatenate(Cs); T=np.concatenate(Ts)
    # smooth normals per part group, welded by position so seams (deck/rim) light evenly
    key=np.round(V/1e-4).astype(np.int64); _,grp=np.unique(key,axis=0,return_inverse=True); grp=grp.ravel()
    tri=T.reshape(-1,3); fn=np.cross(V[tri[:,1]]-V[tri[:,0]],V[tri[:,2]]-V[tri[:,0]])
    acc=np.zeros((grp.max()+1,3)); 
    for k in range(3): np.add.at(acc,grp[tri[:,k]],fn)
    N=acc[grp]; N/=np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-12)
    pk=Pack('boat'); pk.parts=plist; pk.meta=dict(radius=1.2,waterline=0.14*K+0.0)
    UV=np.stack([UV[:,0],UV[:,1]],1)
    pk.build(V,N,UV,T,col=C); print('boat',pk.save(f'{OUT}/boat.prm'),len(V),'verts','z',V[:,2].min(),V[:,2].max())
    # wood texture: planks along u, grain noise
    rng=np.random.default_rng(3); S=256; img=np.zeros((S,S,3),np.float32)
    yy,xx=np.mgrid[0:S,0:S]/S
    plank=np.floor(yy*8); base=np.array([0.72,0.48,0.26])
    tone=0.9+0.1*rng.random(9)[plank.astype(int)]
    grain=0.04*np.sin(xx*60+np.sin(yy*30)*3)+0.03*np.sin(xx*130+yy*40)
    img=base[None,None]*(tone+grain)[...,None]
    seam=np.abs(((yy*8)%1.0)-0.5)>0.47; img[seam]*=0.45
    Image.fromarray((np.clip(img,0,1)*255).astype(np.uint8)).save(f'{OUT}/boat_wood.webp','WEBP',quality=90)
if __name__=='__main__': export()
