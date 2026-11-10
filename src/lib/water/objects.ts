import type { WaterSim } from "./sim";

export type Kind = "duck" | "boat" | "ball" | "pebble" | "fish";

export type Thing = {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  color: string;
  z: number; // 0 = surface, 1 = bottom
  phase: number;
  wander: number;
  lift: number; // current water height under it (for bobbing)
  grabbed: number | null;
  wakeT: number;
};

const NEON = ["#36f1cd", "#ff5fa2", "#ffd166", "#7cff6b", "#9ad7ff"];
let nextId = 1;

export const isFloating = (k: Kind) => k === "duck" || k === "boat";
export const isUnder = (k: Kind) => !isFloating(k);

export function makeThing(kind: Kind, x: number, y: number, scale: number): Thing {
  const pick = () => (NEON[Math.floor(Math.random() * NEON.length)] ?? "#36f1cd");
  const base = { duck: 26, boat: 30, ball: 15, pebble: 13, fish: 20 }[kind] * scale;
  return {
    id: nextId++,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    r: base * (0.85 + Math.random() * 0.3),
    angle: Math.random() * Math.PI * 2,
    color: kind === "duck" ? "#ffd166" : kind === "pebble" ? "#8a8f9c" : pick(),
    z: kind === "fish" ? 0.5 : 0,
    phase: Math.random() * 10,
    wander: Math.random() * Math.PI * 2,
    lift: 0,
    grabbed: null,
    wakeT: 0,
  };
}

export type World = {
  things: Thing[];
  width: number; // css px
  height: number;
  cell: number; // css px per sim cell
  tilt: { x: number; y: number };
  touches: { x: number; y: number }[];
};

const G = 900; // px/s² at full tilt

export function updateThings(world: World, sim: WaterSim, dt: number) {
  const { things, width, height, cell, tilt } = world;
  for (const t of things) {
    const sx = t.x / cell;
    const sy = t.y / cell;
    t.phase += dt;
    if (t.grabbed !== null) continue;

    let ax = 0;
    let ay = 0;
    let drag = 1.5;

    if (isFloating(t.kind)) {
      const [gx, gy] = sim.gradient(sx, sy);
      // Water pushes floaters downhill; tilt slides them.
      const push = t.kind === "boat" ? 2600 : 2000;
      ax = -gx * push + tilt.x * G * 0.55;
      ay = -gy * push + tilt.y * G * 0.55;
      drag = t.kind === "boat" ? 0.9 : 1.3;
      t.lift += (sim.sample(sx, sy) - t.lift) * Math.min(1, dt * 12);
      // Floaters push water back: a wake when moving, a slight dip from weight.
      const sp = Math.hypot(t.vx, t.vy);
      t.wakeT -= dt;
      if (sp > 25 && t.wakeT <= 0) {
        t.wakeT = 0.05;
        sim.disturb(sx, sy, (t.r / cell) * 0.9, -Math.min(1.6, sp * 0.004));
      }
    } else if (t.kind === "fish") {
      t.wander += (Math.random() - 0.5) * dt * 4;
      let dx = Math.cos(t.wander);
      let dy = Math.sin(t.wander);
      const m = 70;
      if (t.x < m) dx += 1.5;
      if (t.x > width - m) dx -= 1.5;
      if (t.y < m) dy += 1.5;
      if (t.y > height - m) dy -= 1.5;
      let speed = 55;
      for (const p of world.touches) {
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d > 0 && d < 160) {
          dx += ((t.x - p.x) / d) * 4;
          dy += ((t.y - p.y) / d) * 4;
          speed = 190;
        }
      }
      const l = Math.hypot(dx, dy) || 1;
      ax = ((dx / l) * speed - t.vx) * 2.5 + tilt.x * 60;
      ay = ((dy / l) * speed - t.vy) * 2.5 + tilt.y * 60;
      drag = 0.3;
      t.wakeT -= dt;
      if (t.wakeT <= 0) {
        t.wakeT = 0.18;
        sim.disturb(sx, sy, 1.6, -0.25 * (Math.hypot(t.vx, t.vy) / 100));
      }
    } else {
      // Sinking ball / pebble
      if (t.z < 1) {
        t.z = Math.min(1, t.z + dt * (t.kind === "pebble" ? 0.9 : 0.6));
        const [gx, gy] = sim.gradient(sx, sy);
        ax = -gx * 400 * (1 - t.z);
        ay = -gy * 400 * (1 - t.z);
        drag = 2.5;
      } else {
        // On the bottom: water damps motion, tilt rolls it. Pebbles need a steeper tilt.
        const tm = Math.hypot(tilt.x, tilt.y);
        const roll = t.kind === "ball" ? 0.45 : tm > 0.3 ? 0.18 : 0;
        ax = tilt.x * G * roll;
        ay = tilt.y * G * roll;
        drag = t.kind === "ball" ? 1.1 : 4;
        // A rolling ball nudges the water above it.
        const sp = Math.hypot(t.vx, t.vy);
        t.wakeT -= dt;
        if (sp > 60 && t.wakeT <= 0) {
          t.wakeT = 0.12;
          sim.disturb(sx, sy, 2, -0.2);
        }
      }
    }

    t.vx += ax * dt;
    t.vy += ay * dt;
    const k = Math.exp(-drag * dt);
    t.vx *= k;
    t.vy *= k;
    const max = 1400;
    const sp = Math.hypot(t.vx, t.vy);
    if (sp > max) {
      t.vx *= max / sp;
      t.vy *= max / sp;
    }
    t.x += t.vx * dt;
    t.y += t.vy * dt;

    // Walls
    const bounce = (v: number) => {
      if (isFloating(t.kind) && Math.abs(v) > 120) sim.disturb(t.x / cell, t.y / cell, t.r / cell, -Math.min(3, Math.abs(v) * 0.004));
      return -v * 0.45;
    };
    if (t.x < t.r) { t.x = t.r; if (t.vx < 0) t.vx = bounce(t.vx); }
    if (t.x > width - t.r) { t.x = width - t.r; if (t.vx > 0) t.vx = bounce(t.vx); }
    if (t.y < t.r) { t.y = t.r; if (t.vy < 0) t.vy = bounce(t.vy); }
    if (t.y > height - t.r) { t.y = height - t.r; if (t.vy > 0) t.vy = bounce(t.vy); }

    // Heading
    if (sp > 12 && t.kind !== "ball" && t.kind !== "pebble") {
      const target = Math.atan2(t.vy, t.vx);
      let d = target - t.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      t.angle += d * Math.min(1, dt * (t.kind === "fish" ? 6 : 2.5));
    } else if (t.kind === "ball" && t.z >= 1) {
      t.angle += (t.vx * dt) / t.r;
    }
  }

  // Collisions within the same layer
  for (let i = 0; i < things.length; i++) {
    const a = things[i];
    if (!a) continue;
    for (let j = i + 1; j < things.length; j++) {
      const b = things[j];
      if (!b) continue;
      if (isFloating(a.kind) !== isFloating(b.kind)) continue;
      if (a.kind === "fish" || b.kind === "fish") continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d > 0 && d < min) {
        const nx = dx / d;
        const ny = dy / d;
        const o = (min - d) / 2;
        a.x -= nx * o; a.y -= ny * o;
        b.x += nx * o; b.y += ny * o;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -rv * 0.8;
          a.vx -= nx * imp * 0.5; a.vy -= ny * imp * 0.5;
          b.vx += nx * imp * 0.5; b.vy += ny * imp * 0.5;
        }
      }
    }
  }
}

/* ---------- Drawing ---------- */

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function drawDuck(ctx: CanvasRenderingContext2D, t: Thing) {
  const r = t.r;
  ctx.fillStyle = shade(t.color, -0.15);
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, 0);
  ctx.lineTo(-r * 0.6, -r * 0.35);
  ctx.lineTo(-r * 0.6, r * 0.35);
  ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(t.color, 0.45));
  g.addColorStop(1, t.color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(t.color, -0.12);
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, -r * 0.5, r * 0.5, r * 0.18, -0.15, 0, Math.PI * 2);
  ctx.ellipse(-r * 0.15, r * 0.5, r * 0.5, r * 0.18, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff8a3d";
  ctx.beginPath();
  ctx.ellipse(r * 1.12, 0, r * 0.28, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  const hg = ctx.createRadialGradient(r * 0.55, -r * 0.15, r * 0.05, r * 0.65, 0, r * 0.48);
  hg.addColorStop(0, shade(t.color, 0.5));
  hg.addColorStop(1, t.color);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(r * 0.65, 0, r * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1b2a";
  ctx.beginPath();
  ctx.arc(r * 0.82, -r * 0.2, r * 0.07, 0, Math.PI * 2);
  ctx.arc(r * 0.82, r * 0.2, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoat(ctx: CanvasRenderingContext2D, t: Thing) {
  const r = t.r;
  const hull = new Path2D();
  hull.moveTo(r * 1.15, 0);
  hull.quadraticCurveTo(r * 0.5, -r * 0.55, -r * 0.9, -r * 0.42);
  hull.lineTo(-r * 0.9, r * 0.42);
  hull.quadraticCurveTo(r * 0.5, r * 0.55, r * 1.15, 0);
  ctx.fillStyle = t.color;
  ctx.fill(hull);
  ctx.save();
  ctx.scale(0.78, 0.7);
  ctx.fillStyle = "#f3efe6";
  ctx.fill(hull);
  ctx.restore();
  // sail seen from above, leaning with the wind
  ctx.fillStyle = shade(t.color, 0.6);
  ctx.beginPath();
  ctx.moveTo(r * 0.25, 0);
  ctx.lineTo(-r * 0.75, r * 0.12);
  ctx.quadraticCurveTo(-r * 0.3, r * 0.55, r * 0.25, 0);
  ctx.fill();
  ctx.fillStyle = "#5a4636";
  ctx.beginPath();
  ctx.arc(r * 0.25, 0, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function drawFish(ctx: CanvasRenderingContext2D, t: Thing) {
  const r = t.r;
  const sp = Math.hypot(t.vx, t.vy);
  const wag = Math.sin(t.phase * (6 + sp * 0.06)) * 0.45;
  ctx.fillStyle = shade(t.color, -0.2);
  ctx.save();
  ctx.translate(-r * 0.75, 0);
  ctx.rotate(wag);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.7, -r * 0.42);
  ctx.quadraticCurveTo(-r * 0.5, 0, -r * 0.7, r * 0.42);
  ctx.fill();
  ctx.restore();
  const g = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.4);
  g.addColorStop(0, shade(t.color, -0.25));
  g.addColorStop(0.5, shade(t.color, 0.35));
  g.addColorStop(1, shade(t.color, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(t.color, -0.1);
  ctx.beginPath();
  ctx.ellipse(r * 0.1, -r * 0.42, r * 0.28, r * 0.1, -0.5 - wag * 0.4, 0, Math.PI * 2);
  ctx.ellipse(r * 0.1, r * 0.42, r * 0.28, r * 0.1, 0.5 + wag * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#101018";
  ctx.beginPath();
  ctx.arc(r * 0.6, -r * 0.18, r * 0.06, 0, Math.PI * 2);
  ctx.arc(r * 0.6, r * 0.18, r * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

function drawBall(ctx: CanvasRenderingContext2D, t: Thing) {
  const r = t.r;
  ctx.shadowColor = t.color;
  ctx.shadowBlur = r * 1.2;
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(t.color, 0.75));
  g.addColorStop(0.6, t.color);
  g.addColorStop(1, shade(t.color, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = shade(t.color, 0.4);
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, t.angle, t.angle + 1.2);
  ctx.stroke();
}

function drawPebble(ctx: CanvasRenderingContext2D, t: Thing) {
  const r = t.r;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, "#c9ccd6");
  g.addColorStop(1, "#4a4e5a");
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rr = r * (0.85 + 0.15 * Math.sin(a * 3 + t.id));
    const px = Math.cos(a) * rr * 1.15;
    const py = Math.sin(a) * rr * 0.85;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.fill();
}

/** Things under the surface – drawn into a texture that the water refracts. */
export function drawUnder(ctx: CanvasRenderingContext2D, things: Thing[], scale: number) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const t of things) {
    if (!isUnder(t.kind)) continue;
    const depthScale = t.kind === "fish" ? 0.9 : 1 - t.z * 0.3;
    // soft shadow on the bottom
    if (t.z < 1 || t.kind === "fish") {
      const off = (1 - (t.kind === "fish" ? 0.5 : t.z)) * 18 + 4;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(t.x + off, t.y + off, t.r * 0.9, t.r * 0.6, t.angle, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.kind === "ball" ? 0 : t.angle);
    ctx.scale(depthScale, depthScale);
    ctx.globalAlpha = t.kind === "fish" ? 0.9 : 1 - t.z * 0.25;
    if (t.kind === "fish") drawFish(ctx, t);
    else if (t.kind === "ball") drawBall(ctx, t);
    else drawPebble(ctx, t);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** Things floating on top – drawn above the water. */
export function drawSurface(ctx: CanvasRenderingContext2D, things: Thing[], dpr: number) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const t of things) {
    if (!isFloating(t.kind)) continue;
    const bob = 1 + Math.max(-0.12, Math.min(0.12, t.lift * 0.02)) + (t.grabbed !== null ? 0.18 : 0);
    const lean = Math.sin(t.phase * 1.7) * 0.06;
    const sh = t.grabbed !== null ? 22 : 9;
    ctx.save();
    ctx.translate(t.x + sh, t.y + sh);
    ctx.rotate(t.angle);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 0, t.r * 1.05, t.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle + lean);
    ctx.scale(bob, bob);
    if (t.kind === "duck") drawDuck(ctx, t);
    else drawBoat(ctx, t);
    ctx.restore();
  }
}
