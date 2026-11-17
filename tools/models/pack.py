"""Writes a 'mesh pack' (.prm): JSON header + binary blobs, read by src/lib/water/gl/models.ts.
Static packs have 1 frame; animated packs bake one position/normal set per frame (skeletal clips baked offline)."""
import json, struct, numpy as np
def _pad(b,a=4): return b+b'\x00'*((-len(b))%a)
class Pack:
    def __init__(s,name): s.name=name; s.parts=[]; s.clips={}; s.meta={}
    def build(s,pos,nrm,uv,idx,col=None):
        """pos/nrm: (F,N,3) float, uv (N,2), idx (M,) triangle list, col (N,4) uint8 or None."""
        pos=np.asarray(pos,np.float32); nrm=np.asarray(nrm,np.float32)
        if pos.ndim==2: pos=pos[None]; nrm=nrm[None]
        F,N,_=pos.shape
        lo=pos.reshape(-1,3).min(0); hi=pos.reshape(-1,3).max(0); span=np.maximum(hi-lo,1e-9)
        q=np.round((pos-lo)/span*65535).astype(np.uint16)
        nsn=np.round(np.clip(nrm,-1,1)*(32767 if F==1 else 127)).astype(np.int16 if F==1 else np.int8)
        idx=np.asarray(idx); itype='u16' if N<65536 else 'u32'
        blobs=[]; off=0; ent={}
        def add(k,a):
            nonlocal off
            b=_pad(np.ascontiguousarray(a).tobytes()); ent[k]=[off,len(a.ravel())]; blobs.append(b); off+=len(b)
        add('pos',q); add('nrm',nsn); add('uv',np.asarray(uv,np.float32))
        if col is not None: add('col',np.asarray(col,np.uint8))
        add('idx',idx.astype(np.uint16 if itype=='u16' else np.uint32))
        hdr=dict(name=s.name,frames=F,verts=N,tris=len(idx)//3,itype=itype,nfmt='i16' if F==1 else 'i8',
                 lo=lo.tolist(),span=span.tolist(),blobs=ent,parts=s.parts,clips=s.clips,**s.meta)
        s.hdr=hdr; s.blob=b''.join(blobs)
    def save(s,path):
        j=json.dumps(s.hdr,separators=(',',':')).encode(); j+=b' '*((-len(j))%4)
        raw=b'PRM1'+struct.pack('<I',len(j))+j+s.blob
        import zlib
        z=zlib.compressobj(9,zlib.DEFLATED,-15); data=z.compress(raw)+z.flush()
        out=b'PRMZ'+struct.pack('<I',len(raw))+data if len(data)<len(raw)*0.9 else raw
        open(path,'wb').write(out); return len(out)
def weld(P,N,UV,C=None,tol=1e-5):
    """corner soup (ntri,3,*) -> indexed mesh with shared identical corners."""
    P=P.reshape(-1,3); N=N.reshape(-1,3); UV=UV.reshape(-1,2)
    parts=[np.round(P/tol).astype(np.int64),np.round(N*1000).astype(np.int64),np.round(UV*4096).astype(np.int64)]
    if C is not None: parts.append(C.reshape(-1,C.shape[-1]).astype(np.int64))
    key=np.concatenate(parts,1); _,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True)
    inv=inv.ravel()
    return P[first],N[first],UV[first],(C.reshape(-1,C.shape[-1])[first] if C is not None else None),inv.astype(np.int64)
