import { FRAG, VERT } from "./shaders";
import { PACKS, TEXTURES, modelKey, variantOf, type ModelKey } from "./models";
import { clipFrame, framePositions, frameNormals, loadPack, type PackData, type PackMat } from "./pack";
import { modelMatrix, normalize, rotationMatrix3, viewProj, type Vec3 } from "./mat";
import { toyEye, type Eye } from "./camera";
import { isFish, type Thing } from "../things";
import { poseOf } from "../body";

type Model = {
  pack: PackData;
  vao: WebGLVertexArrayObject;
  pos: WebGLBuffer;
  nrm: WebGLBuffer;
  animated: boolean;
  posBuf: Float32Array;
  nrmBuf: Float32Array;
  indexType: number;
  indexBytes: number;
};

export type ObjectStyle = {
  /** Light direction in the settings' screen convention (x right, y up). */
  light: { x: number; y: number };
  /** Deep water tint (0..1 rgb) the submerged parts fade into. */
  water: Vec3;
};

/** Draws toys and fish as real 3D meshes, seen from the tilt-driven eye of the box view. */
export class ObjectRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private models = new Map<ModelKey, Model | "loading" | "failed">();
  private textures = new Map<string, WebGLTexture>();
  private white: WebGLTexture;
  private model = new Float32Array(16);
  private vp = new Float32Array(16);
  private rot3 = new Float32Array(9);
  width = 1;
  height = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;
    this.prog = this.link(VERT, FRAG);
    for (const n of ["uModel", "uVP", "uRot", "uTex", "uRMap", "uNMap", "uEye", "uLight", "uWater", "uDepthK", "uRough", "uSpec", "uGain", "uGamma", "uNStr", "uHasTex", "uHasR", "uHasN", "uVCol", "uCut", "uFish", "uAlpha"])
      this.u[n] = gl.getUniformLocation(this.prog, n);
    this.white = this.makeTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    return p;
  }

  resize(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  private makeTexture(px: Uint8Array | HTMLImageElement, w = 0, h = 0, nearest = false): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (px instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (nearest) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, nearest ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, nearest ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    return t;
  }

  /** A texture by file name; a white pixel stands in until the image has loaded. */
  private texture(name: string | undefined, nearest: boolean): WebGLTexture {
    if (!name) return this.white;
    const key = name + (nearest ? "#n" : "");
    const have = this.textures.get(key);
    if (have) return have;
    const url = TEXTURES[name];
    if (!url) return this.white;
    const placeholder = this.makeTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, true);
    this.textures.set(key, placeholder);
    const img = new Image();
    img.onload = () => {
      this.textures.set(key, this.makeTexture(img, 0, 0, nearest));
    };
    img.src = url;
    return placeholder;
  }

  private load(key: ModelKey) {
    this.models.set(key, "loading");
    loadPack(PACKS[key])
      .then((pack) => this.models.set(key, this.upload(pack)))
      .catch((e) => { console.error("model load failed", key, e); this.models.set(key, "failed"); });
  }

  private upload(pack: PackData): Model {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const animated = pack.frames > 1;
    const posBuf = new Float32Array(pack.verts * 3), nrmBuf = new Float32Array(pack.verts * 3);
    framePositions(pack, 0, 0, 0, posBuf);
    frameNormals(pack, 0, 0, 0, nrmBuf);
    const attr = (loc: number, data: ArrayBufferView, size: number, usage: number, type: number = gl.FLOAT, normalized = false) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, normalized, 0, 0);
      return b;
    };
    const use = animated ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
    const pos = attr(0, posBuf, 3, use);
    const nrm = attr(1, nrmBuf, 3, use);
    attr(2, pack.uv, 2, gl.STATIC_DRAW);
    if (pack.col) attr(3, pack.col, 4, gl.STATIC_DRAW, gl.UNSIGNED_BYTE, true);
    else gl.vertexAttrib4f(3, 1, 1, 1, 1);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pack.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const u32 = pack.idx instanceof Uint32Array;
    return { pack, vao, pos, nrm, animated, posBuf, nrmBuf, indexType: u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, indexBytes: u32 ? 4 : 2 };
  }

  /** Which frame of an animated model a thing shows right now. */
  private frameOf(t: Thing, m: Model): { f0: number; f1: number; blend: number } {
    const clips = m.pack.clips;
    const swim = clips["swim"];
    if (swim) {
      // One tail phase (2 pi) plays 1 / cycles of the loop: the alien's long loop holds several tail beats.
      const f = clipFrame(swim, (t.tail / (Math.PI * 2 * (swim.cycles ?? 1))) * (swim.count / swim.fps));
      return { f0: f.f0, f1: f.f1, blend: f.t };
    }
    return { f0: 0, f1: 0, blend: 0 };
  }

  private bindMat(mat: PackMat, t: Thing, fish: boolean) {
    const gl = this.gl, u = this.u;
    const variants = Array.isArray(mat.tex) ? mat.tex : mat.tex ? [mat.tex] : [];
    const tex = variants[Math.min(variants.length - 1, variantOf(t.kind, t.skin))];
    const near = !!mat.nearest;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(tex, near));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(mat.rmap, false));
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(mat.nmap, false));
    gl.uniform1f(u["uHasTex"]!, tex ? 1 : 0);
    gl.uniform1f(u["uHasR"]!, mat.rmap ? 1 : 0);
    gl.uniform1f(u["uHasN"]!, mat.nmap ? 1 : 0);
    gl.uniform1f(u["uRough"]!, mat.rough);
    gl.uniform1f(u["uSpec"]!, mat.spec);
    gl.uniform1f(u["uGain"]!, mat.gain ?? 1);
    gl.uniform1f(u["uGamma"]!, mat.gamma ?? 1);
    gl.uniform1f(u["uNStr"]!, mat.nstrength ?? 1);
    gl.uniform1f(u["uVCol"]!, mat.vcol ? 1 : 0);
    gl.uniform1f(u["uCut"]!, mat.alpha === "cut" ? 1 : 0);
    gl.uniform1f(u["uFish"]!, fish ? 1 : 0);
  }

  /** True once the mesh of this thing is on the GPU (also starts loading it). */
  ready(kind: Thing["kind"]): boolean {
    const key = modelKey(kind);
    const m = this.models.get(key);
    if (m === undefined) { this.load(key); return false; }
    return typeof m !== "string";
  }

  draw(things: Thing[], eye: Eye, W: number, H: number, style: ObjectStyle) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!things.length) return;
    gl.useProgram(this.prog);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    const u = this.u;
    const L = normalize([style.light.x, style.light.y, 0.48]);
    gl.uniform3f(u["uLight"]!, L[0], L[1], L[2]);
    gl.uniform3f(u["uWater"]!, style.water[0], style.water[1], style.water[2]);
    gl.uniform1f(u["uDepthK"]!, 2.2 / Math.max(60, eye.floor));
    gl.uniform1i(u["uTex"]!, 0);
    gl.uniform1i(u["uRMap"]!, 1);
    gl.uniform1i(u["uNMap"]!, 2);

    const toys = things.filter((t) => !isFish(t.kind));
    const fish = things.filter((t) => isFish(t.kind)).sort((a, b) => b.z - a.z);
    this.setEye(W, H, toyEye(W, H, eye));
    for (const t of toys) this.drawThing(t, eye, false);
    this.setEye(W, H, eye);
    for (const t of fish) this.drawThing(t, eye, true);
    gl.bindVertexArray(null);
  }

  private setEye(W: number, H: number, e: Eye) {
    viewProj(this.vp, W, H, e.x, e.y, e.h);
    this.gl.uniformMatrix4fv(this.u["uVP"]!, false, this.vp);
    this.gl.uniform3f(this.u["uEye"]!, e.x, -e.y, e.h);
  }

  private drawThing(t: Thing, eye: Eye, fish: boolean) {
    const gl = this.gl, u = this.u;
    if (!this.ready(t.kind)) return;
    const m = this.models.get(modelKey(t.kind)) as Model;
    const pose = poseOf(t, eye);
    modelMatrix(this.model, pose.pos, pose.q, pose.scale);
    rotationMatrix3(this.rot3, pose.q);
    gl.uniformMatrix4fv(u["uModel"]!, false, this.model);
    gl.uniformMatrix3fv(u["uRot"]!, false, this.rot3);
    gl.uniform1f(u["uAlpha"]!, pose.alpha);
    gl.bindVertexArray(m.vao);
    if (m.animated) {
      const f = this.frameOf(t, m);
      framePositions(m.pack, f.f0, f.f1, f.blend, m.posBuf);
      frameNormals(m.pack, f.f0, f.f1, f.blend, m.nrmBuf);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.posBuf);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.nrmBuf);
    }
    for (const part of m.pack.parts) {
      this.bindMat(part.mat, t, fish);
      gl.drawElements(gl.TRIANGLES, part.count, m.indexType, part.start * m.indexBytes);
    }
  }
}
