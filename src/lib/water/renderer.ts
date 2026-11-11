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
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uDepth;
uniform vec2 uLight;
uniform float uMood;
uniform float uSlosh;
uniform float uLightGlow;

float ambient(vec2 p){
  vec2 q = p * vec2(uAspect, 1.0);
  float amp = uMood == 1.0 ? 0.16 : 0.0;
  return amp * (sin(dot(q, vec2(24.0, 17.0)) + uTime * 1.3)
    + 0.5 * sin(dot(q, vec2(-36.0, 29.0)) - uTime * 1.7)
    + 0.22 * sin(dot(q, vec2(67.0, 48.0)) + uTime * 2.2));
}

float H(vec2 p){ return texture(uH, p).r + ambient(p); }

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
  vec3 n = normalize(vec3(-g * 1.6, 1.0));
  float lap = hl + hr + hu + hd - 4.0 * hc;

  // Refracted view of the bottom
  vec2 ruv = clamp(uv + n.xy * vec2(1.0, uAspect) * (0.025 + uDepth * 0.09), vec2(0.001), vec2(0.999));
  vec2 q = ruv * vec2(uAspect, 1.0);

  float vign = 1.0 - smoothstep(0.25, 1.05, length((ruv - 0.5) * vec2(uAspect, 1.0) * 1.3));
  vec3 bottom = uBg * (0.55 + 0.9 * vign);
  float sand = vnoise(q * 9.0) * 0.6 + vnoise(q * 23.0) * 0.4;
  bottom += vec3(0.022) * sand * (0.5 + vign);
  if (uMood == 0.0) { vec2 f = abs(fract(q * 7.0) - 0.5); bottom += vec3(0.018) * smoothstep(0.46, 0.5, max(f.x, f.y)); }
  else if (uMood == 1.0) bottom += vec3(0.03, 0.024, 0.012) * (sin(q.x * 34.0 + vnoise(q * 4.0) * 6.0) * 0.5 + 0.5);
  else if (uMood == 2.0) bottom += vec3(0.016, 0.02, 0.008) * smoothstep(0.55, 0.8, vnoise(q * 14.0));
  vec3 tint = uLiquidAmt > 0.0 ? uLiquid : uGlow;
  bottom += tint * 0.035 * vnoise(q * 3.0 + uTime * 0.03);

  vec4 obj = texture(uObj, ruv);
  bottom = mix(bottom, obj.rgb, obj.a);

  // Beer–Lambert transmission: red attenuates faster with optical path length.
  float opticalDepth = max(0.04, 0.18 + uDepth * 2.8 - hc * 0.055);
  vec3 transmission = exp(-vec3(1.45, 0.48, 0.23) * opticalDepth);
  vec3 waterTint = mix(uDeep, uShallow, exp(-opticalDepth * 0.8));
  waterTint = mix(waterTint, uLiquid, 0.35);
  vec3 col = mix(bottom, bottom * transmission + waterTint * (1.0-transmission), uLiquidAmt);
  // Clear water stays untinted; its depth still changes light loss and refraction.
  col *= mix(vec3(1.0), exp(-vec3(0.16, 0.07, 0.035) * opticalDepth), 1.0-uLiquidAmt);

  // Caustics: converging wavefronts focus light
  float caustic = clamp(-lap * 0.92, 0.0, 1.0);
  col += caustic * mix(vec3(0.65), tint, 0.3) * 0.24;

  // Specular highlight
  vec3 L = normalize(vec3(uLight.x, -uLight.y, 0.48));
  vec3 V = normalize(vec3((0.5-uv) * vec2(uAspect, 1.0) * 0.65, 1.0));
  vec3 Hv = normalize(L + V);
  float spec = pow(max(dot(n, Hv), 0.0), 340.0);
  // Schlick Fresnel, water's normal-incidence reflectance is about 2%.
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 reflected = mix(vec3(0.12, 0.19, 0.23), vec3(0.7, 0.84, 0.89), clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
  col = mix(col, reflected, fresnel * 0.8);
  col += vec3(1.0, 0.98, 0.91) * spec * (1.65 + uLightGlow * 1.8);
  col += caustic * vec3(0.9, 0.88, 0.8) * 0.18 * uLightGlow;
  float rim = clamp(length(g) * 0.52, 0.0, 1.0);
  col += vec3(0.06) * rim;

  // Glow: ripples emit light
  float energy = clamp(abs(hc) * 0.22 + rim * 1.15 + caustic * 0.32, 0.0, 1.2);
  col += uGlow * uGlowAmt * (energy * 0.95 + caustic * 1.2);

  vec2 e = min(uv, 1.0 - uv) * vec2(uAspect, 1.0);
  float edge = 1.0 - smoothstep(0.0, 0.06, min(e.x, e.y));
  float foamN = vnoise(uv * vec2(uAspect, 1.0) * 70.0 + uTime * 0.6);
  float foam = clamp(edge * uSlosh * smoothstep(0.3, 1.6, abs(hc) + length(g) * 2.0) * smoothstep(0.35, 0.7, foamN) * 1.6, 0.0, 0.7);
  col = mix(col, vec3(0.92, 0.96, 0.97), foam);
  o = vec4(col / (vec3(1.0) + col * 0.28), 1.0);
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
    for (const n of ["uH", "uObj", "uTexel", "uBg", "uLiquid", "uLiquidAmt", "uGlow", "uGlowAmt", "uAspect", "uTime", "uShallow", "uDeep", "uDepth", "uLight", "uMood", "uSlosh", "uLightGlow"])
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
    shallow: [number, number, number];
    deep: [number, number, number];
    depth: number;
    light: { x: number; y: number };
    mood: number;
    slosh: number;
    lightGlow: number;
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
    gl.uniform3fv(u["uShallow"] ?? null, opts.shallow);
    gl.uniform3fv(u["uDeep"] ?? null, opts.deep);
    gl.uniform1f(u["uDepth"] ?? null, opts.depth);
    gl.uniform2f(u["uLight"] ?? null, opts.light.x, opts.light.y);
    gl.uniform1f(u["uMood"] ?? null, opts.mood);
    gl.uniform1f(u["uSlosh"] ?? null, opts.slosh);
    gl.uniform1f(u["uLightGlow"] ?? null, opts.lightGlow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
