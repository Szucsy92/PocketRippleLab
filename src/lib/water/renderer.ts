const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uH;
uniform sampler2D uObj;
uniform vec2 uTexel;
uniform vec3 uBg;
uniform vec3 uLiquid;
uniform float uLiquidAmt;
uniform vec3 uGlow;
uniform float uGlowAmt;
uniform float uAspect;
uniform float uTime;

float H(vec2 p){ return texture(uH, p).r; }

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}

void main(){
  vec2 uv = vUv;
  float hc = H(uv);
  float hl = H(uv - vec2(uTexel.x, 0.0));
  float hr = H(uv + vec2(uTexel.x, 0.0));
  float hu = H(uv - vec2(0.0, uTexel.y));
  float hd = H(uv + vec2(0.0, uTexel.y));
  vec2 g = vec2(hr - hl, hd - hu);
  vec3 n = normalize(vec3(-g * 2.35, 1.0));
  float lap = hl + hr + hu + hd - 4.0 * hc;

  // Refracted view of the bottom
  vec2 ruv = clamp(uv + n.xy * vec2(1.0, uAspect) * 0.072, vec2(0.001), vec2(0.999));
  vec2 q = ruv * vec2(uAspect, 1.0);

  float vign = 1.0 - smoothstep(0.25, 1.05, length((ruv - 0.5) * vec2(uAspect, 1.0) * 1.3));
  vec3 bottom = uBg * (0.55 + 0.9 * vign);
  float sand = vnoise(q * 9.0) * 0.6 + vnoise(q * 23.0) * 0.4;
  bottom += vec3(0.022) * sand * (0.5 + vign);
  vec3 tint = uLiquidAmt > 0.0 ? uLiquid : uGlow;
  bottom += tint * 0.035 * vnoise(q * 3.0 + uTime * 0.03);

  vec4 obj = texture(uObj, ruv);
  bottom = mix(bottom, obj.rgb, obj.a);

  vec3 col = mix(bottom, uLiquid * (0.20 + 0.58 * vign), uLiquidAmt);
  // Depth absorption: longer optical paths lose red first, like real water.
  float opticalDepth = clamp(0.22 + length(g) * 1.8, 0.0, 1.0);
  vec3 absorption = vec3(0.94, 0.985, 1.0);
  col *= mix(vec3(1.0), absorption, opticalDepth * (0.35 + uLiquidAmt * 0.5));

  // Caustics: converging wavefronts focus light
  float caustic = clamp(-lap * 0.92, 0.0, 1.0);
  col += caustic * mix(vec3(0.62), tint, 0.72) * 0.78;

  // Specular highlight
  vec3 L = normalize(vec3(-0.45, -0.55, 0.7));
  vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, Hv), 0.0), 220.0);
  col += vec3(1.0) * spec * 1.25;
  float rim = clamp(length(g) * 0.52, 0.0, 1.0);
  col += vec3(0.18) * rim;

  // Glow: ripples emit light
  float energy = clamp(abs(hc) * 0.22 + rim * 1.15 + caustic * 0.32, 0.0, 1.2);
  col += uGlow * uGlowAmt * (energy * 0.95 + caustic * 1.2);

  o = vec4(col, 1.0);
}`;

export class WaterRenderer {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  hTex: WebGLTexture;
  oTex: WebGLTexture;
  u: Record<string, WebGLUniformLocation | null> = {};
  simW = 1;
  simH = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error("Cannot create shader");
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const p = gl.createProgram();
    if (!p) throw new Error("Cannot create program");
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uH", "uObj", "uTexel", "uBg", "uLiquid", "uLiquidAmt", "uGlow", "uGlowAmt", "uAspect", "uTime"])
      this.u[n] = gl.getUniformLocation(p, n);

    const mk = () => {
      const t = gl.createTexture();
      if (!t) throw new Error("Cannot create texture");
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.hTex = mk();
    this.oTex = mk();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  resize(w: number, h: number, simW: number, simH: number) {
    const c = this.gl.canvas as HTMLCanvasElement;
    c.width = w;
    c.height = h;
    this.simW = simW;
    this.simH = simH;
  }

  uploadObjects(src: HTMLCanvasElement | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.oTex);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  draw(opts: {
    height: Float32Array;
    bg: [number, number, number];
    liquid: [number, number, number];
    liquidAmt: number;
    glow: [number, number, number];
    glowAmt: number;
    time: number;
  }) {
    const gl = this.gl;
    const c = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, c.width, c.height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.hTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, this.simW, this.simH, 0, gl.RED, gl.FLOAT, opts.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.oTex);
    const u = this.u;
    gl.uniform1i((u["uH"] ?? null), 0);
    gl.uniform1i((u["uObj"] ?? null), 1);
    gl.uniform2f((u["uTexel"] ?? null), 1 / this.simW, 1 / this.simH);
    gl.uniform3fv((u["uBg"] ?? null), opts.bg);
    gl.uniform3fv((u["uLiquid"] ?? null), opts.liquid);
    gl.uniform1f((u["uLiquidAmt"] ?? null), opts.liquidAmt);
    gl.uniform3fv((u["uGlow"] ?? null), opts.glow);
    gl.uniform1f((u["uGlowAmt"] ?? null), opts.glowAmt);
    gl.uniform1f((u["uAspect"] ?? null), c.width / c.height);
    gl.uniform1f((u["uTime"] ?? null), opts.time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
