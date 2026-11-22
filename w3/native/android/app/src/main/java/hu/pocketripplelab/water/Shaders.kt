package hu.pocketripplelab.water

/** GLSL ES 3.00 sources, identical to the web version (src/lib/water/renderer.ts and gl/shaders.ts). */
object Shaders {
    const val WATER_VERT = """#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}"""

    const val WATER_FRAG = """#version 300 es
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
uniform vec2 uParallax;

float ambient(vec2 p){
  vec2 q = p * vec2(uAspect, 1.0);
  float amp = uMood == 1.0 ? 0.22 : uMood == 2.0 ? 0.05 : 0.0;
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

  // Box view: the screen is the opening of a box, tilting moves the eye.
  // The ray starts at the (refracted) surface point and runs towards the floor.
  float boxD = 0.25 + uDepth * 0.75;              // box depth in screen-height units
  float relief = uMood == 0.0 ? 1.0 : 0.6;         // sea / lake: softer, no hard walls
  vec2 sPhys = clamp(uParallax * boxD * 0.7 * relief, vec2(-0.6), vec2(0.6));
  vec2 start = clamp(uv + n.xy * vec2(1.0, uAspect) * (0.025 + uDepth * 0.09), vec2(0.001), vec2(0.999));
  // Built-in perspective: the eye sits above the centre, so the floor is a smaller rectangle than the
  // opening and the walls form a trapezoid on every side, even without tilt. Tilt then moves the eye.
  float persp = boxD * 0.45 * relief;
  vec2 sh = vec2(sPhys.x / uAspect, sPhys.y) + (start - 0.5) * persp;   // ray offset in uv units

  // Pool only: find where the ray hits a side wall before reaching the floor.
  float tHit = 2.0; float wallAxis = 0.0; float wallAlong = 0.0; float wallSide = 0.0;
  if (uMood == 0.0) {
    float tx = 9.0; float ty = 9.0;
    if (sh.x > 1e-5) tx = (1.0 - start.x) / sh.x; else if (sh.x < -1e-5) tx = -start.x / sh.x;
    if (sh.y > 1e-5) ty = (1.0 - start.y) / sh.y; else if (sh.y < -1e-5) ty = -start.y / sh.y;
    if (tx < ty) { tHit = tx; wallAxis = 0.0; wallAlong = start.y + sh.y * tx; wallSide = sign(sh.x); }
    else         { tHit = ty; wallAxis = 1.0; wallAlong = start.x + sh.x * ty; wallSide = sign(sh.y); }
  }
  bool onWall = tHit < 1.0;

  vec2 ruv = start + sh;                            // floor sample (may leave 0..1 on sea / lake)
  if (uMood == 0.0) ruv = clamp(ruv, vec2(0.001), vec2(0.999));
  vec2 q = ruv * vec2(uAspect, 1.0);
  vec2 shq = sh * vec2(uAspect, 1.0);               // floor shift in q units

  float vign = 1.0 - smoothstep(0.25, 1.05, length((ruv - 0.5) * vec2(uAspect, 1.0) * 1.3));
  vec3 bottom;
  if (uMood == 0.0) {
    // Pool: tiled floor and tiled side walls.
    vec2 pq = q;
    if (onWall) {
      float dd = tHit * boxD * 1.0;
      pq = wallAxis < 0.5 ? vec2(dd, wallAlong) : vec2(wallAlong * uAspect, dd);
    }
    vec2 t = pq * 7.0;
    vec2 f = abs(fract(t) - 0.5);
    float grout = smoothstep(0.47, 0.495, max(f.x, f.y));
    float tileVar = hash(floor(t)) * 0.06;
    bottom = vec3(0.5, 0.78, 0.86) * (0.62 + tileVar) - grout * vec3(0.18, 0.2, 0.2);
    if (onWall) {
      // Walls get darker with depth, side walls are lit differently, the wall/floor corner is shaded.
      float side = wallAxis < 0.5 ? 0.86 : 0.7;
      bottom *= side * mix(1.0, 0.38, tHit) * (1.0 - 0.3 * smoothstep(0.9, 1.0, tHit));
    } else {
      // Floor: soft contact shadow where it meets the walls.
      vec2 e = abs(ruv - 0.5) * 2.0;
      bottom *= 1.0 - 0.18 * smoothstep(0.82, 1.0, max(e.x, e.y)) * min(1.0, length(sh) * 6.0);
    }
  } else if (uMood == 1.0) {
    // Seabed: golden sand ridges with relief parallax (ridge crests sit closer to the eye).
    float ridge0 = sin(q.x * 38.0 + vnoise(q * 4.0) * 6.0 + q.y * 9.0) * 0.5 + 0.5;
    vec2 q2 = q - shq * 0.35 * ridge0;
    float ridge = sin(q2.x * 38.0 + vnoise(q2 * 4.0) * 6.0 + q2.y * 9.0) * 0.5 + 0.5;
    float grain = vnoise(q2 * 60.0);
    bottom = mix(vec3(0.58, 0.48, 0.3), vec3(0.82, 0.7, 0.46), ridge * 0.7 + grain * 0.3);
    // Self shadow on the side facing away from the eye shift.
    float lee = clamp((ridge - ridge0) * 6.0, -1.0, 1.0);
    bottom *= 1.0 + lee * 0.14 * min(1.0, length(shq) * 10.0);
  } else if (uMood == 2.0) {
    // Lake: pebbles stand above the moss, so they shift less than the bed below them.
    vec2 qTop = q - shq * 0.4;
    vec2 c = qTop * 11.0;
    vec2 cell = floor(c);
    float d = 9.0; float id = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o2 = cell + vec2(i, j);
      vec2 pt = o2 + vec2(hash(o2), hash(o2 + 7.3)) * 0.8 + 0.1;
      float dd = length(c - pt);
      if (dd < d) { d = dd; id = hash(o2 + 3.1); }
    }
    vec3 stone = mix(vec3(0.42, 0.36, 0.28), vec3(0.62, 0.56, 0.46), id);
    stone *= 0.8 + vnoise(qTop * 30.0) * 0.3;
    // Stone shading: rounded, darker rim on the far side.
    stone *= 0.78 + 0.35 * (1.0 - smoothstep(0.0, 0.6, d));
    vec3 moss = vec3(0.2, 0.3, 0.14) * (0.5 + vnoise(q * 30.0) * 0.4);
    float stoneMask = 1.0 - smoothstep(0.35, 0.6, d);
    // Dark gap shadow around each stone, stronger when tilted.
    float gap = smoothstep(0.62, 0.35, d) * (1.0 - stoneMask);
    moss *= 1.0 - 0.45 * gap * min(1.0, 0.4 + length(shq) * 8.0);
    bottom = mix(moss, stone, stoneMask);
  } else {
    bottom = uBg * (0.55 + 0.9 * vign);
    float sand = vnoise(q * 9.0) * 0.6 + vnoise(q * 23.0) * 0.4;
    bottom += vec3(0.022) * sand * (0.5 + vign);
  }
  if (uMood >= 0.0 && uMood <= 2.0) bottom *= mix(0.55, 1.0, vign) * mix(1.0, 0.55, uDepth);
  vec3 tint = uLiquidAmt > 0.0 ? uLiquid : uGlow;
  bottom += tint * 0.035 * vnoise(q * 3.0 + uTime * 0.03);
  // Sun net: drifting caustic pattern on the floor, stronger while moving the light.
  float net = 0.0;
  {
    vec2 cq = q * 5.0 + uLight * 0.6;
    float a1 = vnoise(cq + uTime * 0.25), a2 = vnoise(cq * 1.7 - uTime * 0.2);
    net = pow(clamp(1.0 - abs(a1 - a2) * 2.0, 0.0, 1.0), 8.0);
  }
  bottom += vec3(1.0, 0.97, 0.85) * net * (0.08 + uLightGlow * 0.35) * mix(1.0, 0.4, uDepth);

  vec4 obj = texture(uObj, clamp(ruv, vec2(0.001), vec2(0.999)));
  if (!onWall) bottom = mix(bottom, obj.rgb, obj.a);

  // Beer–Lambert transmission: red attenuates faster with optical path length.
  float pathFrac = onWall ? tHit : 1.0;
  float opticalDepth = max(0.04, 0.18 + uDepth * 2.8 * pathFrac - hc * 0.055);
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
  float fresnel = 0.02 + 0.98 * pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 5.0);
  vec3 reflected = mix(vec3(0.12, 0.19, 0.23), vec3(0.7, 0.84, 0.89), clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
  col = mix(col, reflected, fresnel * 0.8);
  col += vec3(1.0, 0.98, 0.91) * spec * (1.65 + uLightGlow * 2.5);
  float spark = pow(max(dot(n, Hv), 0.0), 2200.0);
  col += vec3(1.0) * spark * (0.6 + uLightGlow * 4.0);
  float rim = clamp(length(g) * 0.52, 0.0, 1.0);
  col += vec3(0.06) * rim;

  // Glow: ripples emit light
  float energy = clamp(abs(hc) * 0.22 + rim * 1.15 + caustic * 0.32, 0.0, 1.2);
  col += uGlow * uGlowAmt * (energy * 0.95 + caustic * 1.2);

  col = max(col, vec3(0.0));
  o = vec4(col / (vec3(1.0) + col * 0.28), 1.0);
}"""

    const val OBJECT_VERT = """#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aCol;
uniform mat4 uModel;
uniform mat4 uVP;
uniform mat3 uRot;
out vec3 vW;
out vec3 vN;
out vec2 vUv;
out vec4 vCol;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = uRot * aNrm;
  vUv = aUv;
  vCol = aCol;
  gl_Position = uVP * w;
}"""

    const val OBJECT_FRAG = """#version 300 es
precision highp float;
in vec3 vW;
in vec3 vN;
in vec2 vUv;
in vec4 vCol;
uniform sampler2D uTex;
uniform sampler2D uRMap;
uniform sampler2D uNMap;
uniform vec3 uEye;
uniform vec3 uLight;      // unit vector toward the light
uniform vec3 uWater;      // deep water tint
uniform float uDepthK;    // 1 / depth over which the water swallows the light (px)
uniform float uRough;
uniform float uSpec;
uniform float uGain;
uniform float uGamma;
uniform float uNStr;
uniform float uHasTex;
uniform float uHasR;
uniform float uHasN;
uniform float uVCol;
uniform float uCut;
uniform float uFish;
uniform float uAlpha;
out vec4 o;

vec3 toLin(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }

vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 m){
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 a = cross(dp2, N), b = cross(N, dp1);
  vec3 T = a * du1.x + b * du2.x;
  vec3 B = a * du1.y + b * du2.y;
  float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return normalize(mat3(T * im, B * im, N) * m);
}

void main(){
  vec3 V = normalize(uEye - vW);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;                       // double sided (sails)
  vec4 base = vec4(1.0);
  if (uHasTex > 0.5) base = texture(uTex, vUv);
  if (uCut > 0.5 && base.a < 0.5) discard;
  vec3 alb = toLin(base.rgb);
  if (uGamma != 1.0) alb = pow(alb, vec3(uGamma));
  alb *= uGain;
  if (uVCol > 0.5) alb *= toLin(vCol.rgb);
  if (uHasN > 0.5){
    vec3 m = texture(uNMap, vUv).xyz * 2.0 - 1.0;
    m.y = -m.y;
    m.xy *= uNStr;
    N = perturb(N, vW, vUv, normalize(m));
  }
  float rough = uRough;
  if (uHasR > 0.5) rough = clamp(0.2 + 0.7 * texture(uRMap, vUv).r, 0.08, 1.0);

  vec3 L = normalize(uLight);
  float nl = dot(N, L);
  float wrap = clamp((nl + 0.3) / 1.3, 0.0, 1.0);
  vec3 sky = vec3(0.62, 0.74, 0.95), ground = vec3(0.20, 0.25, 0.30);
  vec3 hemi = mix(ground, sky, N.z * 0.5 + 0.5);
  vec3 col = alb * (hemi * 0.85 + wrap * vec3(1.0, 0.96, 0.9) * 0.75);

  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float a2 = pow(rough, 4.0);
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col += vec3(1.0, 0.98, 0.94) * D * 0.25 * uSpec * wrap;

  vec3 R = reflect(-V, N);
  vec3 env = mix(ground, sky, R.z * 0.5 + 0.5);
  env += vec3(1.0, 0.97, 0.9) * 2.0 * smoothstep(0.82, 0.98, max(dot(R, L), 0.0));
  col += env * F * uSpec * (1.0 - rough * 0.6) * 0.8;

  // Under water: the water swallows light and colour with depth, a thin bright line sits at the water line.
  float d = max(0.0, -vW.z);
  float att = exp(-d * uDepthK);
  col = mix(uWater * (0.25 + 0.5 * wrap), col, att);
  col += vec3(0.9, 0.97, 1.0) * 0.28 * smoothstep(5.0, 0.0, abs(vW.z)) * (1.0 - uFish);

  col = col / (1.0 + col * 0.12);
  col = pow(col, vec3(1.0 / 2.2));
  float alpha = uAlpha * mix(1.0, 0.45 + 0.55 * att, uFish);
  o = vec4(col * alpha, alpha);
}"""
}
