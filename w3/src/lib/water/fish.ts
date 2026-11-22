import type { WaterSim } from "./sim";
import { clamp, angDiff } from "./math";
import { isFish, type FishKind, type Thing, type Touch, type World } from "./things";

/** Fish personalities: cruise/flee speeds. */
export const FISH_SPEED: Record<FishKind, { cruise: number; flee: number }> = {
  koi: { cruise: 55, flee: 480 },
  tang: { cruise: 55, flee: 480 },
  perch: { cruise: 55, flee: 480 },
  alien: { cruise: 48, flee: 420 }, // a big, slow deep-water fish: it comes to a still finger like the others
};

/** Pure decision: where does a fish want to go? Returns a desired velocity. */
export function fishIntent(kind: FishKind, fx: number, fy: number, touches: Touch[], fear: number): { vx: number; vy: number; mode: "flee" | "come" | "cruise" } {
  const sp = FISH_SPEED[kind];
  let near: Touch | null = null, nd = Infinity;
  for (const t of touches) { const d = Math.hypot(t.x - fx, t.y - fy); if (d < nd) { nd = d; near = t; } }
  if (near && near.speed > 60 && nd < 420) {
    const k = sp.flee / Math.max(1, nd);
    return { vx: (fx - near.x) * k, vy: (fy - near.y) * k, mode: "flee" };
  }
  if (fear > 0.25) return { vx: 0, vy: 0, mode: "flee" };
  if (near) {
    const k = Math.min(1, Math.max(0, nd - 60) / 200) * 160 / Math.max(1, nd);
    return { vx: (near.x - fx) * k, vy: (near.y - fy) * k, mode: "come" };
  }
  return { vx: 0, vy: 0, mode: "cruise" };
}

/** Fish personalities beyond speed: turning, schooling, how often they surface, rest or investigate, and depth range. */
export const FISH_TRAIT: Record<FishKind, { turn: number; school: number; surface: number; rest: number; curious: number; zMin: number; zMax: number }> = {
  koi: { turn: 2.4, school: 0.8, surface: 0.22, rest: 0.14, curious: 0.25, zMin: 0.35, zMax: 0.85 },
  tang: { turn: 2.4, school: 0.8, surface: 0.22, rest: 0.14, curious: 0.25, zMin: 0.35, zMax: 0.85 },
  perch: { turn: 2.4, school: 0.8, surface: 0.22, rest: 0.14, curious: 0.25, zMin: 0.35, zMax: 0.85 },
  alien: { turn: 1.9, school: 0.3, surface: 0.12, rest: 0.18, curious: 0.3, zMin: 0.4, zMax: 0.9 },
};

/**
 * Pure: what does an idle fish do next? Rolls r1/r2 are in 0..1.
 * "surface" = come up for a gulp, "rest" = hover, "inspect" = follow a toy.
 */
export function fishDecision(kind: FishKind, r1: number, r2: number, hasTarget: boolean): { action: "surface" | "rest" | "inspect" | "swim"; z: number } {
  const tr = FISH_TRAIT[kind];
  const depth = tr.zMin + (tr.zMax - tr.zMin) * r2;
  if (r1 < tr.surface) return { action: "surface", z: 0.03 };
  if (r1 < tr.surface + tr.rest) return { action: "rest", z: depth };
  if (hasTarget && r1 < tr.surface + tr.rest + tr.curious) return { action: "inspect", z: 0.55 };
  return { action: "swim", z: depth };
}

function nearest(t: Thing, list: Thing[], ok: (o: Thing) => boolean, maxD: number): Thing | null {
  let best: Thing | null = null, bd = maxD;
  for (const o of list) {
    if (o === t || !ok(o)) continue;
    const d = Math.hypot(o.x - t.x, o.y - t.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function updateFish(t: Thing, kind: FishKind, world: World, sim: WaterSim, dt: number) {
  const { width, height, cell, things, touches } = world;
  const tr = FISH_TRAIT[kind], spd = FISH_SPEED[kind];
  const sx = t.x / cell, sy = t.y / cell;
  t.phase += dt;
  const h = Math.abs(sim.sample(sx, sy));
  const [gx, gy] = sim.gradient(sx, sy);
  const [fx, fy] = sim.flow(sx, sy);
  // Rough water scares the gentle fish; deep fish feel the surface less.
  t.fear = Math.min(1, t.fear + Math.max(0, h * (1 - 0.5 * t.z) - 0.8) * dt * 3);
  t.fear *= Math.exp(-dt * 0.8);
  t.mind -= dt;
  t.restT = Math.max(0, t.restT - dt);
  t.boost = Math.max(0, t.boost - dt);

  const it = fishIntent(kind, t.x, t.y, touches, t.fear);
  let mode: string = it.mode;
  let dvx = it.vx, dvy = it.vy;
  let nearFinger = Infinity;
  for (const p of touches) nearFinger = Math.min(nearFinger, Math.hypot(p.x - t.x, p.y - t.y));

  // Idle brain: now and then surface for a gulp, hover, follow a toy or pick a new depth.
  if (t.mind <= 0 && mode === "cruise") {
    t.mind = 2 + Math.random() * 4;
    const target = nearest(t, things, (o) => !isFish(o.kind), 600);
    const d = fishDecision(kind, Math.random(), Math.random(), !!target);
    t.focus = null;
    t.zGoal = d.z;
    if (d.action === "surface") t.surfT = 1.6 + Math.random() * 2.2;
    else if (d.action === "rest") t.restT = 1.5 + Math.random() * 3;
    else if (d.action === "inspect" && target) { t.focus = target.id; t.mind = 5 + Math.random() * 3; }
  }

  if (mode === "cruise") {
    const tgt = t.focus === null ? null : (things.find((o) => o.id === t.focus) ?? null);
    if (t.focus !== null && !tgt) t.focus = null;
    if (tgt) {
      // Curious: circle slowly around a toy floating above.
      const ang = Math.atan2(t.y - tgt.y, t.x - tgt.x) + 0.9;
      const R = tgt.r * 0.9;
      dvx = (tgt.x + Math.cos(ang) * R - t.x) * 1.4;
      dvy = (tgt.y + Math.sin(ang) * R - t.y) * 1.4;
      const m = Math.hypot(dvx, dvy), cap = spd.cruise * 1.4;
      if (m > cap) { dvx *= cap / m; dvy *= cap / m; }
    } else {
      t.wander += (Math.sin(t.phase * 0.37 + t.id) * 0.5 + (Math.random() - 0.5) * 1.2) * dt;
      const v = spd.cruise * (t.restT > 0 ? 0.08 : 1);
      dvx = Math.cos(t.wander) * v; dvy = Math.sin(t.wander) * v;
      // Light schooling with the own kind at a similar depth.
      let cx = 0, cy = 0, ax = 0, ay = 0, n = 0;
      for (const o of things) {
        if (o === t || !isFish(o.kind) || Math.abs(o.z - t.z) > 0.45) continue;
        const d = Math.hypot(o.x - t.x, o.y - t.y);
        if (d > 320 || d === 0) continue;
        if (o.kind === kind) { cx += o.x; cy += o.y; ax += o.vx; ay += o.vy; n++; }
        const sep = (t.r + o.r) * 1.1;
        if (d < sep) { dvx += ((t.x - o.x) / d) * (sep - d) * 4; dvy += ((t.y - o.y) / d) * (sep - d) * 4; }
      }
      if (n > 0) {
        dvx += ((cx / n - t.x) * 0.35 + (ax / n - t.vx) * 0.8) * tr.school;
        dvy += ((cy / n - t.y) * 0.35 + (ay / n - t.vy) * 0.8) * tr.school;
      }
    }
  } else if (mode === "flee" && dvx === 0 && dvy === 0) {
    const a = Math.hypot(gx, gy) > 1e-3 ? Math.atan2(gy, gx) : t.angle;
    dvx = Math.cos(a) * spd.flee * 0.8; dvy = Math.sin(a) * spd.flee * 0.8;
    t.wander = t.angle;
  } else t.wander = t.angle;

  // Depth goals: bolt to the deep when scared, rise to a still finger.
  if (mode === "flee") { t.surfT = 0; t.focus = null; t.zGoal = Math.max(t.zGoal, 0.85); }
  else if (mode === "come" && nearFinger < 260) { t.zGoal = 0.06; t.mind = Math.min(t.mind, 1.5); }
  else if (t.surfT > 0) t.zGoal = 0.03;

  // Steer away from walls early; a wandering fish also turns its heading back toward open water.
  const m = t.r * 3;
  let wpx = 0, wpy = 0;
  if (t.x < m) wpx += (m - t.x) * 6;
  if (t.x > width - m) wpx -= (t.x - width + m) * 6;
  if (t.y < m) wpy += (m - t.y) * 6;
  if (t.y > height - m) wpy -= (t.y - height + m) * 6;
  dvx += wpx; dvy += wpy;
  if (mode === "cruise" && (wpx !== 0 || wpy !== 0)) {
    t.wander += angDiff(t.wander, Math.atan2(wpy + Math.sin(t.wander) * 20, wpx + Math.cos(t.wander) * 20)) * Math.min(1, dt * 3);
  }

  // Swimming: limited turn rate, slows in sharp turns, kick-and-glide.
  const fast = mode === "flee" || t.boost > 0;
  const ds = Math.hypot(dvx, dvy);
  let want = Math.min(ds, mode === "flee" ? spd.flee : 260);
  const turnMax = tr.turn * (fast ? 3.5 : 1);
  if (ds > 4) {
    const dd = angDiff(t.angle, Math.atan2(dvy, dvx));
    const step = clamp(dd, -turnMax * dt, turnMax * dt);
    t.angle += step;
    t.turn += (step / Math.max(1e-4, dt) - t.turn) * Math.min(1, dt * 8);
    if (Math.abs(t.turn) > 0.25) t.side = Math.sign(t.turn);
    want *= 0.25 + 0.75 * Math.cos(Math.min(Math.abs(dd), Math.PI / 2));
  } else {
    t.turn *= Math.exp(-dt * 4);
    want = 0;
  }
  const kick = want > 20 ? 1 + 0.28 * Math.sin(t.tail * 2 - 0.8) : 1;
  t.speed += (want * kick - t.speed) * Math.min(1, dt * (fast ? 8 : want > t.speed ? 2.6 : 1.4));
  t.vx = Math.cos(t.angle) * t.speed;
  t.vy = Math.sin(t.angle) * t.speed;
  // Only fish near the surface are carried by currents.
  const drift = (1 - t.z) * (1 - t.z) * cell * 1.2;
  t.x = clamp(t.x + (t.vx + fx * drift) * dt, t.r * 0.5, width - t.r * 0.5);
  t.y = clamp(t.y + (t.vy + fy * drift) * dt, t.r * 0.5, height - t.r * 0.5);
  t.tail += dt * (3.2 + t.speed * 0.05 + (t.restT > 0 ? 0.5 : 0) + (fast ? 6 : 0));

  // Depth: a damped spring toward the goal.
  t.zv += ((t.zGoal - t.z) * 6 - t.zv * 3.5) * dt;
  t.z = clamp(t.z + t.zv * dt, 0, 1);
  if (t.z <= 0 || t.z >= 1) t.zv = 0;

  // At the surface: gulps ring the water, a moving fish leaves a faint wake, then it dives back.
  t.bite = Math.max(0, t.bite - dt * 3);
  if (t.z < 0.1) {
    t.popT -= dt;
    if (t.popT <= 0) {
      t.popT = 1.2 + Math.random() * 0.8;
      t.bite = Math.max(t.bite, 0.7);
      sim.disturb((t.x + Math.cos(t.angle) * t.r) / cell, (t.y + Math.sin(t.angle) * t.r) / cell, (t.r / cell) * 0.5, -0.6);
    }
    t.wakeT -= dt;
    if (t.speed > 25 && t.wakeT <= 0) {
      t.wakeT = 0.09;
      sim.disturb((t.x - Math.cos(t.angle) * t.r * 0.8) / cell, (t.y - Math.sin(t.angle) * t.r * 0.8) / cell, (t.r / cell) * 0.45, -Math.min(0.3, t.speed * 0.0015));
    }
  } else if (t.z > 0.3) t.popT = 0.2;
  if (t.surfT > 0 && t.z < 0.12) {
    t.surfT -= dt;
    if (t.surfT <= 0) t.zGoal = tr.zMin + (tr.zMax - tr.zMin) * Math.random();
  }
}
