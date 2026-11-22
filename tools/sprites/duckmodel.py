import sys; sys.path.insert(0,'.')
import numpy as np, cv2
from meshio import *; from r3d import *; from common import *
from fishbake import subdivide_phong
SRC='../../assets-src/rubber-duck-toy'
def load():
    g=list(load_fbx_geoms(f'{SRC}/source/rubber_duck_toy.fbx').values())[0]
    P=g['V'][g['corner_vi'][g['tri']]]; N=g['n'][g['tri']]; UV=g['uv'][g['tri']]
    return P,N,UV
def tex(path,gray=False):
    im=cv2.imread(path,0 if gray else cv2.IMREAD_COLOR)
    if im.shape[0]>1024: im=cv2.resize(im,(1024,1024),interpolation=cv2.INTER_AREA)
    return (im.astype(np.float32)/255) if gray else cv2.cvtColor(im,cv2.COLOR_BGR2RGB).astype(np.float32)/255
def samp(img,u,v):
    h,w=img.shape[:2]
    return cv2.remap(img,(np.clip(u,-2,3)*w).astype(np.float32)-0.5,((1-np.clip(v,-2,3))*h).astype(np.float32)-0.5,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
def canon(p,fwd='y+'):
    # geo: x lateral, y length, z up. -> fwd, left, up
    if fwd=='y+': return np.stack([p[...,1],-p[...,0],p[...,2]],-1)
    return np.stack([-p[...,1],p[...,0],p[...,2]],-1)
if __name__=='__main__':
    P,N,UV=load(); base=tex(f'{SRC}/textures/dirty_base_color.jpg'); rough=tex(f'{SRC}/textures/dirty_roughness.jpg',True)
    for fw in ('y+','y-'):
        Pc=canon(P,fw); Nc=canon(N,fw)
        W=H=300*SS; sc=W/0.46
        S=np.stack([Pc[...,0]*sc+W/2,-Pc[...,1]*sc+H/2,Pc[...,2]*sc],-1)
        A=np.zeros((len(P),3,8),np.float32); A[...,0:3]=np.stack([Nc[...,0],-Nc[...,1],Nc[...,2]],-1); A[...,3:5]=UV
        out=rasterize(S,A,np.zeros(len(P)),W,H); m=out[...,0]>-1e29
        u=np.nan_to_num(out[...,4]); v=np.nan_to_num(out[...,5])
        alb=samp(base,u,v); img=(np.clip(alb,0,1)*255).astype(np.uint8); img[~m]=(40,120,150)
        cv2.imwrite(f'/tmp/duck_{fw[1]}.png',cv2.cvtColor(cv2.resize(img,(300,300),interpolation=cv2.INTER_AREA),cv2.COLOR_RGB2BGR))
    a=cv2.imread('/tmp/duck_+.png'); b=cv2.imread('/tmp/duck_-.png'); cv2.imwrite('/tmp/duck_fw.png',np.hstack([a,b]))
