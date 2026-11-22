/** Tiny vector / quaternion / matrix helpers. World = right-handed: x right, y up on screen, z toward the viewer. */
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w
export type Mat4 = Float32Array; // column-major

export const Q_IDENTITY: Quat = [0, 0, 0, 1];

export function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qNorm(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export function qAxisAngle(x: number, y: number, z: number, a: number): Quat {
  const s = Math.sin(a / 2);
  return [x * s, y * s, z * s, Math.cos(a / 2)];
}
/** Rotate a vector by a unit quaternion. */
export function qRot(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
/** Integrate a world-frame angular velocity (rad/s) over dt. */
export function qIntegrate(q: Quat, w: Vec3, dt: number): Quat {
  const dq = qMul([w[0], w[1], w[2], 0], q);
  return qNorm([q[0] + 0.5 * dt * dq[0], q[1] + 0.5 * dt * dq[1], q[2] + 0.5 * dt * dq[2], q[3] + 0.5 * dt * dq[3]]);
}
/** Yaw about world z, then pitch about the body's left axis (+ = nose down), then roll about its forward axis (+ = right side down). */
export function qYawPitchRoll(yaw: number, pitch: number, roll: number): Quat {
  return qNorm(qMul(qMul(qAxisAngle(0, 0, 1, yaw), qAxisAngle(0, 1, 0, pitch)), qAxisAngle(1, 0, 0, roll)));
}
export function qRandom(): Quat {
  const u1 = Math.random(), u2 = Math.random() * Math.PI * 2, u3 = Math.random() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Model matrix = translate(pos) * rotate(q) * scale(s). Writes into `out` (column-major). */
export function modelMatrix(out: Mat4, pos: Vec3, q: Quat, s: number): Mat4 {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  out[0] = (1 - 2 * (yy + zz)) * s; out[1] = 2 * (xy + wz) * s; out[2] = 2 * (xz - wy) * s; out[3] = 0;
  out[4] = 2 * (xy - wz) * s; out[5] = (1 - 2 * (xx + zz)) * s; out[6] = 2 * (yz + wx) * s; out[7] = 0;
  out[8] = 2 * (xz + wy) * s; out[9] = 2 * (yz - wx) * s; out[10] = (1 - 2 * (xx + yy)) * s; out[11] = 0;
  out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
  return out;
}
/** Rotation part only, as a 3x3 column-major matrix. */
export function rotationMatrix3(out: Float32Array, q: Quat): Float32Array {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  out[0] = 1 - 2 * (yy + zz); out[1] = 2 * (xy + wz); out[2] = 2 * (xz - wy);
  out[3] = 2 * (xy - wz); out[4] = 1 - 2 * (xx + zz); out[5] = 2 * (yz + wx);
  out[6] = 2 * (xz + wy); out[7] = 2 * (yz - wx); out[8] = 1 - 2 * (xx + yy);
  return out;
}

/**
 * Off-axis "window" projection: the screen rectangle (0..W, 0..H, y down) is the opening of the pool, the eye sits at
 * (ex, ey) in screen px and h px above the surface. A point at height z above the surface lands where the ray from the
 * eye through it crosses the screen plane. World y is up, so a screen y is -y.
 */
export function viewProj(out: Mat4, W: number, H: number, ex: number, ey: number, h: number): Mat4 {
  const hw = W / 2, hh = H / 2;
  // clip.x
  out[0] = h / hw; out[4] = 0; out[8] = -(ex - hw) / hw; out[12] = -h;
  // clip.y
  out[1] = 0; out[5] = h / hh; out[9] = (ey - hh) / hh; out[13] = h;
  // clip.z: monotonic in height, nearer = smaller
  out[2] = 0; out[6] = 0; out[10] = -1; out[14] = 0;
  // clip.w = h - z
  out[3] = 0; out[7] = 0; out[11] = -1; out[15] = h;
  return out;
}
/** Where a world point lands on the screen (px, y down) for the same eye; used by tests and hit testing. */
export function project(W: number, H: number, ex: number, ey: number, h: number, p: Vec3): { x: number; y: number } {
  const k = h / (h - p[2]);
  return { x: ex + (p[0] - ex) * k, y: ey + (-p[1] - ey) * k };
}
