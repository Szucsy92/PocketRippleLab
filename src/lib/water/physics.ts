import type { WaterSim } from "./sim";
import { updateFish } from "./fish";
import { stepBody, tumble } from "./body";
import { PHYS, isFish, type World } from "./things";

/**
 * One step of the whole world. Toys drift with waves and currents and have a real 3D body (buoyancy, wobble, flipping,
 * see body.ts); fish swim (fish.ts). The phone's tilt never enters the physics: it only moves the camera (gl/camera.ts).
 */
export function updateThings(world: World, sim: WaterSim, dt: number) {
  const { things, width, height, cell } = world;
  for (const t of things) {
    if (isFish(t.kind)) { updateFish(t, t.kind, world, sim, dt); continue; }
    const sx = t.x / cell, sy = t.y / cell;
    t.phase += dt;
    const [gx, gy] = sim.gradient(sx, sy);
    t.lift += (sim.sample(sx, sy) - t.lift) * Math.min(1, dt * 12);
    stepBody(t, dt, {
      gx, gy,
      splash: (s) => sim.disturb(sx, sy, Math.max(6, (t.r / cell) * 1.5), -s),
    });
    if (t.grabbed !== null) continue;

    const ph = PHYS[t.kind];
    const [fx, fy] = sim.flow(sx, sy);
    // Wave push grows with the crest's slope, so bigger sweeps carry toys further.
    const ax = -gx * ph.push + fx * cell * ph.flow;
    const ay = -gy * ph.push + fy * cell * ph.flow;
    const sp0 = Math.hypot(t.vx, t.vy);
    t.wakeT -= dt;
    if (sp0 > 25 && t.wakeT <= 0 && !t.air) {
      t.wakeT = 0.05;
      sim.disturb(sx, sy, (t.r / cell) * 1.2, -Math.min(2.2, sp0 * 0.005));
    }

    t.vx += ax * dt;
    t.vy += ay * dt;
    const k = Math.exp(-ph.drag * dt * (t.air ? 0.15 : 1));
    t.vx *= k; t.vy *= k;
    const sp = Math.hypot(t.vx, t.vy);
    if (sp > 1400) { t.vx *= 1400 / sp; t.vy *= 1400 / sp; }
    t.x += t.vx * dt;
    t.y += t.vy * dt;

    const bounce = (v: number) => {
      if (Math.abs(v) > 120) sim.disturb(t.x / cell, t.y / cell, (t.r / cell) * 1.3, -Math.min(4, Math.abs(v) * 0.005));
      if (Math.abs(v) > 200) tumble(t, 0.25);
      return -v * 0.45;
    };
    if (t.x < t.r) { t.x = t.r; if (t.vx < 0) t.vx = bounce(t.vx); }
    if (t.x > width - t.r) { t.x = width - t.r; if (t.vx > 0) t.vx = bounce(t.vx); }
    if (t.y < t.r) { t.y = t.r; if (t.vy < 0) t.vy = bounce(t.vy); }
    if (t.y > height - t.r) { t.y = height - t.r; if (t.vy > 0) t.vy = bounce(t.vy); }

    if (t.kind === "duck" || t.kind === "boat") {
      // Turn to face where it is going.
      if (sp > 12) {
        let d = Math.atan2(t.vy, t.vx) - t.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        t.angle += d * Math.min(1, dt * (t.kind === "boat" ? 2 : 2.6));
      }
    } else if (t.kind === "ring") {
      // The ring just drifts and turns slowly with the current.
      t.angle += (fx - fy) * dt * 0.02;
    }
  }

  for (let i = 0; i < things.length; i++) {
    const a = things[i]; if (!a) continue;
    for (let j = i + 1; j < things.length; j++) {
      const b = things[j]; if (!b) continue;
      if (isFish(a.kind) !== isFish(b.kind)) continue;
      if (isFish(a.kind) && Math.abs(a.z - b.z) > 0.35) continue; // swimming at different depths: no bump
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d > 0 && d < min) {
        const nx = dx / d, ny = dy / d, o = (min - d) / 2;
        a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -rv * 0.8;
          a.vx -= nx * imp * 0.5; a.vy -= ny * imp * 0.5;
          b.vx += nx * imp * 0.5; b.vy += ny * imp * 0.5;
          if (!isFish(a.kind)) { tumble(a, 0.2); tumble(b, 0.2); }
        }
      }
    }
  }
}
