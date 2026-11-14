"""Rubber duck: 1:1 from the supplied rubber_duck_toy.fbx with its dirty base colour / roughness / normal textures."""
import sys; sys.path.insert(0,'.')
from bake_anim import *
DUCK_FBX=f'{SRC}/duck/source/rubber_duck_toy.fbx'; TEX=f'{SRC}/duck/textures'
def down(img,n=2048): return cv2.resize(img,(n,n),interpolation=cv2.INTER_AREA)
def tangents(part,P,UV):
    g=part.g; vi=g['corner_vi'][g['tri']]
    d1=P[:,1]-P[:,0]; d2=P[:,2]-P[:,0]; u1=UV[:,1]-UV[:,0]; u2=UV[:,2]-UV[:,0]
    det=u1[:,0]*u2[:,1]-u2[:,0]*u1[:,1]; det=np.where(np.abs(det)<1e-12,1e-12,det)
    T=(d1*u2[:,1:2]-d2*u1[:,1:2])/det[:,None]
    acc=np.zeros((part.nv,3)); 
    for k in range(3): np.add.at(acc,vi[:,k],T)
    return acc[vi]
def duck_setup(flip_green=False):
    sc,parts=load_parts(DUCK_FBX); part=parts[0]
    P,N,UV=pose(sc,part,None,0)
    ymax=P.reshape(-1,3)[P.reshape(-1,3)[:,1].argmax()]; sgn=1.0 if ymax[2]>0 else -1.0   # head (highest point) decides which way is "forward"
    Tg=tangents(part,P,UV)
    if sgn>0: canon=lambda p: np.stack([p[...,2],p[...,0],p[...,1]],-1)
    else: canon=lambda p: np.stack([-p[...,2],-p[...,0],p[...,1]],-1)
    Pc,Nc,Tc=canon(P),canon(N),canon(Tg)
    Tc=Tc-Nc*(Tc*Nc).sum(-1,keepdims=True); Tc/=np.maximum(np.linalg.norm(Tc,axis=-1,keepdims=True),1e-9)
    base=down(tex_rgb(f'{TEX}/dirty_base_color.jpg')); rough=down(tex_gray(f'{TEX}/dirty_roughness.jpg')); nm=down(tex_rgb(f'{TEX}/toy_normal.jpg'))*2-1
    if flip_green: nm[...,1]*=-1
    nm/=np.maximum(np.linalg.norm(nm,axis=-1,keepdims=True),1e-6)
    mat=Mat(lambda u,v: samp(base,u,v),spec=lambda u,v: 0.12+0.75*(1-samp(rough,u,v)),rough=lambda u,v: 0.18+0.7*samp(rough,u,v),
            normal=lambda u,v: samp(nm,u,v),normal_k=1.0,ambient=0.78,diffuse=0.7,ao_k=0.9,ao_rad=7,warm=0.4,exposure=1.18,refl=0.3)
    return Pc,Nc,UV,Tc,mat
def rot_z(A,ang):
    c,s=np.cos(ang),np.sin(ang); B=A.copy(); x,y=A[...,0].copy(),A[...,1].copy(); B[...,0]=x*c-y*s; B[...,1]=x*s+y*c; return B
def duck_frame(Pc,Nc,UV,Tc,mat,k,NH,size,scale,cen):
    a=-2*np.pi*k/NH   # screen y points down, so a clockwise (visual) heading is a negative turn in the y-up canonical frame
    P=rot_z(Pc-cen,a); N=rot_z(Nc,a); T=rot_z(Tc,a)
    return render([Soup(P,N,UV,mat,T)],size,size,scale)
if __name__=='__main__':
    flip=len(sys.argv)>1 and sys.argv[1]=='flip'
    Pc,Nc,UV,Tc,mat=duck_setup(flip)
    f=Pc.reshape(-1,3); lo,hi=f.min(0),f.max(0); cen=np.array([(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,0],np.float32)
    L=hi[0]-lo[0]; size=256; scale=204/L; NH=16
    print('extents',lo,hi)
    sheet=np.zeros((2*size,8*size,4),np.uint8)
    for k in range(NH):
        img=duck_frame(Pc,Nc,UV,Tc,mat,k,NH,size,scale,cen); r,c=divmod(k,8); sheet[r*size:(r+1)*size,c*size:(c+1)*size]=img
    save_webp(sheet,f'{OUT}/duck.webp',q=90); print('duck baked'); sys.exit(0)
    tiles=[]
    for k in (0,2,4,6):
        img=duck_frame(Pc,Nc,UV,Tc,mat,k,NH,size,scale,cen)
        bg=np.full((size,size,3),(110,70,20),np.uint8); a=img[...,3:4]/255.0; tiles.append((bg*(1-a)+img[...,:3][...,::-1]*a).astype(np.uint8))
    cv2.imwrite('/tmp/duck_test.png',np.hstack(tiles))
