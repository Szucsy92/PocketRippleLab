"""Texture / rig helpers shared by the fish exporters (extracted from the older sprite baker)."""
import numpy as np, cv2
SRC = '../../assets-src'
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def tex_rgb(path): return cv2.cvtColor(cv2.imread(path),cv2.COLOR_BGR2RGB).astype(np.float32)/255
def tex_gray(path): return cv2.imread(path,0).astype(np.float32)/255
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
