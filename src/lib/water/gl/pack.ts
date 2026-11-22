/** Mesh pack (.prm) reader. Written by tools/models/pack.py: a JSON header followed by binary blobs. */
export type PackMat = {
  tex?: string | string[]; // texture file name(s); an array = variants picked per object
  rmap?: string; // roughness map (gray)
  nmap?: string; // tangent-space normal map
  rough: number;
  spec: number;
  gain?: number; // albedo gain / gamma applied to the texture
  gamma?: number;
  nstrength?: number;
  nearest?: boolean; // crisp palette textures
  alpha?: "cut"; // alpha-tested (fins)
  vcol?: boolean;
};
export type PackPart = { start: number; count: number; mat: PackMat };
export type PackClip = { start: number; count: number; fps: number; loop: boolean };
export type PackData = {
  name: string;
  frames: number;
  verts: number;
  /** Bounding radius in model units (1 = the object's radius). */
  radius: number;
  /** Model-space z of the water plane when the object floats upright. */
  waterline: number;
  /** Fish: full length (nose to tail tip) in model units and how far the pivot is behind the nose. */
  length: number;
  parts: PackPart[];
  clips: Record<string, PackClip>;
  lo: [number, number, number];
  span: [number, number, number];
  pos: Uint16Array;
  nrm: Int8Array | Int16Array;
  nScale: number;
  uv: Float32Array;
  col: Uint8Array | null;
  idx: Uint16Array | Uint32Array;
};

type Header = {
  name: string; frames: number; verts: number; itype: "u16" | "u32"; nfmt: "i8" | "i16";
  lo: [number, number, number]; span: [number, number, number];
  blobs: Record<string, [number, number]>;
  parts: PackPart[]; clips?: Record<string, PackClip>;
  radius?: number; waterline?: number; length?: number;
};

/** Fetch a pack; compressed ones (magic PRMZ = raw deflate) are inflated in the browser. */
export async function loadPack(url: string): Promise<PackData> {
  const res = await fetch(url);
  let buf = await res.arrayBuffer();
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic === "PRMZ") {
    const stream = new Blob([buf.slice(8)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    buf = await new Response(stream).arrayBuffer();
  }
  return parsePack(buf);
}

export function parsePack(buf: ArrayBuffer): PackData {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "PRM1") throw new Error("not a mesh pack");
  const jl = dv.getUint32(4, true);
  const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)).replace(/[\0\s]+$/, "")) as Header;
  const base = 8 + jl;
  const view = <T>(k: string, C: new (b: ArrayBuffer, o: number, n: number) => T): T => {
    const e = hdr.blobs[k];
    if (!e) throw new Error(`missing blob ${k}`);
    return new C(buf, base + e[0], e[1]);
  };
  return {
    name: hdr.name, frames: hdr.frames, verts: hdr.verts,
    radius: hdr.radius ?? 1, waterline: hdr.waterline ?? 0, length: hdr.length ?? 1,
    parts: hdr.parts, clips: hdr.clips ?? {}, lo: hdr.lo, span: hdr.span,
    pos: view("pos", Uint16Array),
    nrm: hdr.nfmt === "i16" ? view("nrm", Int16Array) : view("nrm", Int8Array),
    nScale: hdr.nfmt === "i16" ? 1 / 32767 : 1 / 127,
    uv: view("uv", Float32Array),
    col: hdr.blobs["col"] ? view("col", Uint8Array) : null,
    idx: hdr.itype === "u16" ? view("idx", Uint16Array) : view("idx", Uint32Array),
  };
}

/** Dequantized positions of one frame (or a blend of two) into `out` (verts * 3 floats). */
export function framePositions(p: PackData, f0: number, f1: number, t: number, out: Float32Array) {
  const n = p.verts * 3, a = f0 * n, b = f1 * n;
  const sx = p.span[0] / 65535, sy = p.span[1] / 65535, sz = p.span[2] / 65535;
  const [lx, ly, lz] = p.lo;
  const u = 1 - t;
  for (let i = 0; i < n; i += 3) {
    const x0 = p.pos[a + i]!, y0 = p.pos[a + i + 1]!, z0 = p.pos[a + i + 2]!;
    const x1 = p.pos[b + i]!, y1 = p.pos[b + i + 1]!, z1 = p.pos[b + i + 2]!;
    out[i] = lx + (x0 * u + x1 * t) * sx;
    out[i + 1] = ly + (y0 * u + y1 * t) * sy;
    out[i + 2] = lz + (z0 * u + z1 * t) * sz;
  }
}
export function frameNormals(p: PackData, f0: number, f1: number, t: number, out: Float32Array) {
  const n = p.verts * 3, a = f0 * n, b = f1 * n, k = p.nScale, u = 1 - t;
  for (let i = 0; i < n; i += 3) {
    const x = (p.nrm[a + i]! * u + p.nrm[b + i]! * t) * k;
    const y = (p.nrm[a + i + 1]! * u + p.nrm[b + i + 1]! * t) * k;
    const z = (p.nrm[a + i + 2]! * u + p.nrm[b + i + 2]! * t) * k;
    const l = Math.hypot(x, y, z) || 1;
    out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
  }
}
/** Frame index and blend for a clip played at `time` seconds. */
export function clipFrame(c: PackClip, time: number): { f0: number; f1: number; t: number } {
  const f = time * c.fps;
  const n = c.count;
  let i = Math.floor(f), t = f - i;
  if (c.loop) { i = ((i % n) + n) % n; return { f0: c.start + i, f1: c.start + ((i + 1) % n), t }; }
  if (i >= n - 1) { i = n - 1; t = 0; } else if (i < 0) { i = 0; t = 0; }
  return { f0: c.start + i, f1: c.start + Math.min(n - 1, i + 1), t };
}
