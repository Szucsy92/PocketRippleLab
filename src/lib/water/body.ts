import { clamp, angDiff } from "./math";
import { cross, normalize, qAxisAngle, qIntegrate, qMul, qNorm, qRot, qYawPitchRoll, type Quat, type Vec3 } from "./gl/mat";
import type { Eye } from "./gl/camera";
import { BODY, FISH_LEN, hEq, isFish, type Thing } from "./things";

const G = 2400; // px/s^2

/** Water surface normal (world frame) from the sim's height gradient (gx along x, gy along screen-down y). */
export function surfaceNormal(gx: number, gy: number): Vec3 {
  const k = 0.3, m = 0.5; // small objects ride the wave slope, but only so far
  return normalize([clamp(-gx * k, -m, m), clamp(gy * k, -m, m), 1]);
}

/** Yaw of the body's forward axis in the world frame (0 = +x, counter-clockwise with y up). */
export function yawOf(q: Quat): number {
  const f = qRot(q, [1, 0, 0]);
  return Math.atan2(f[1], f[0]);
}
/** World-z rotation of the whole body, keeping its tilt. */
export function turnBy(q: Quat, dyaw: number): Quat {
  return qNorm(qMul(qAxisAngle(0, 0, 1, dyaw), q));
}

/** A thrown / dropped toy tumbles a little in the direction it moves; harder when it is fast. */
export function tumble(t: Thing, speedScale = 1) {
  const k = speedScale / (1.8 * t.r);
  t.w[0] += -(-t.vy) * k * 0.9 + (Math.random() - 0.5) * 2;
  t.w[1] += t.vx * k * 0.9 + (Math.random() - 0.5) * 2;
}

export type BodyIn = {
  /** Water height gradient under the toy. */
  gx: number;
  gy: number;
  /** Called when the toy hits the water: a splash of this strength (sim units). */
  splash: (strength: number) => void;
};

/**
 * One physics step of a floating toy's body: buoyancy along z, a righting torque toward the water surface
 * (or, while held, toward a lean opposite to the motion), free rolling for the ball and yaw that follows the heading.
 * The phone's tilt is deliberately not an input: it only moves the camera.
 */
export function stepBody(t: Thing, dt: number, io: BodyIn) {
  const B = BODY[t.kind];
  const speed = Math.hypot(t.vx, t.vy);
  const v: Vec3 = [t.vx, -t.vy, 0]; // world frame (y up)
  const rest = hEq(t);
  const held = t.grabbed !== null;

  // --- vertical: buoyancy / free fall / being held up
  if (held) {
    const lift = rest + t.r * (0.7 + Math.min(0.6, speed / 900));
    t.h += (lift - t.h) * Math.min(1, dt * 14);
    t.hv = 0;
    t.air = true;
  } else {
    const hT = rest + clamp(t.lift * 0.015, -0.06, 0.08) * t.r * 2; // bobs with the wave under it
    const dr = Math.max(1, B.draft * t.r);
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const buoy = G * clamp(1 + (hT - t.h) / dr, 0, 7);
      const submerged = t.h < hT + dr;
      const drag = submerged ? 9 + 0.006 * Math.abs(t.hv) : 0.05;
      t.hv += (-G + buoy - drag * t.hv) * h;
      t.h += t.hv * h;
      if (!submerged && !t.air) t.air = true;
      if (submerged && t.air) {
        // Back in the water: splash and a kick that depends on how hard it came down.
        t.air = false;
        const hit = Math.max(0, -t.hv);
        if (hit > 120) {
          io.splash(clamp(hit * 0.012, 1.5, 8));
          const a = Math.random() * Math.PI * 2, k = Math.min(3, hit * 0.0035) * (B.kr > 0 ? 1 : 0.4);
          t.w[0] += Math.cos(a) * k; t.w[1] += Math.sin(a) * k;
          t.hv *= 0.35;
        }
      }
    }
  }

  // --- orientation
  const n = io.gx === 0 && io.gy === 0 ? ([0, 0, 1] as Vec3) : surfaceNormal(io.gx, io.gy);
  let target: Vec3 = n;
  if (held) target = normalize([n[0] - v[0] * 0.0006, n[1] - v[1] * 0.0006, 1]); // the top lags behind the hand
  const sub = 6;
  const hs = dt / sub;
  for (let i = 0; i < sub; i++) {
    if (B.kr > 0) {
      const up = qRot(t.q, [0, 0, 1]);
      const tau = cross(up, target);
      const k = held ? B.kr * 1.4 : B.kr;
      t.w[0] += tau[0] * k * hs; t.w[1] += tau[1] * k * hs; t.w[2] += tau[2] * k * hs;
    }
    const dxy = Math.exp(-B.cd * hs), dz = Math.exp(-B.cy * hs);
    t.w[0] *= dxy; t.w[1] *= dxy; t.w[2] *= dz;
    t.q = qIntegrate(t.q, t.w, hs);
  }
  if (t.kind === "ball" && !held && !t.air) {
    // A floating ball rolls along with its drift: spin follows the motion.
    const r = 0.9 * t.r;
    const want: Vec3 = [-v[1] / r * 0.85, v[0] / r * 0.85, 0];
    const k = 1 - Math.exp(-3 * dt);
    t.w[0] += (want[0] - t.w[0]) * k; t.w[1] += (want[1] - t.w[1]) * k;
  }
  // heading: the duck, boat and ring turn (about the vertical axis) toward the heading the physics picked
  if (t.kind !== "ball") {
    const d = angDiff(yawOf(t.q), -t.angle);
    t.q = turnBy(t.q, d * Math.min(1, dt * (held ? 12 : 6)));
  }
}

export type Pose = { pos: Vec3; q: Quat; scale: number; alpha: number };

/** Where a thing is in the world and how it is oriented. Fish: heading, pitch with their climb, bank into turns. */
export function poseOf(t: Thing, eye: Eye): Pose {
  if (isFish(t.kind)) {
    const depth = t.z * eye.floor * 0.85;
    const pitch = clamp(t.zv * 0.9, -0.5, 0.5);
    const roll = clamp(t.turn * 0.2, -0.7, 0.7);
    return { pos: [t.x, -t.y, -(depth + 0.12 * t.r)], q: qYawPitchRoll(-t.angle, pitch, roll), scale: t.r * FISH_LEN[t.kind], alpha: 1 };
  }
  return { pos: [t.x, -t.y, t.h], q: t.q, scale: t.r, alpha: 1 };
}
