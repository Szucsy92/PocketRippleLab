export const VERT = `#version 300 es
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
}`;

export const FRAG = `#version 300 es
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
}`;
