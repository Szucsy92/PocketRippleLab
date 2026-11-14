import type { WaterSim } from "./sim";

export type Kind = "duck" | "boat" | "ball" | "ring" | FishKind;
export type FishKind = "koi" | "tang" | "perch" | "shark";
export const FISH: FishKind[] = ["koi", "tang", "perch", "shark"];
export const isFish = (k: Kind): k is FishKind => (FISH as string[]).includes(k);

export type Thing = {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  spin: number;
  color: string;
  phase: number;
  lift: number;
  /** 3D rocking (spring), driven by waves and tilt changes. */
  rockX: number;
  rockY: number;
  rockVX: number;
  rockVY: number;
  grabbed: number | null;
  wakeT: number;
  /** Fish: wander target heading, fear (0..1), tail beat phase. */
  wander: number;
  fear: number;
  tail: number;
  bite: number;
};

let nextId = 1;
export const isFloating = (k: Kind) => !isFish(k);
/** Every toy and fish is 3x the original size. */
export const SIZE_FACTOR = 3;

/** Feel constants: lighter toys get carried further by the waves. */
export const PHYS: Record<Kind, { push: number; drag: number; size: number; flow: number }> = {
  ball: { push: 3400, drag: 0.7, size: 20, flow: 12 },
  ring: { push: 3000, drag: 0.85, size: 30, flow: 11 },
  duck: { push: 2000, drag: 1.25, size: 26, flow: 8 },
  boat: { push: 1700, drag: 1.1, size: 32, flow: 7 },
  koi: { push: 500, drag: 2.2, size: 18, flow: 3 },
  tang: { push: 500, drag: 2.2, size: 14, flow: 3 },
  perch: { push: 500, drag: 2.2, size: 15, flow: 3 },
  shark: { push: 250, drag: 1.8, size: 30, flow: 1.5 },
};

/** Fish personalities: cruise/flee speeds. Only the shark hunts a moving finger. */
export const FISH_SPEED: Record<FishKind, { cruise: number; flee: number }> = {
  koi: { cruise: 45, flee: 420 },
  tang: { cruise: 55, flee: 480 },
  perch: { cruise: 60, flee: 500 },
  shark: { cruise: 70, flee: 0 },
};

export type Touch = { x: number; y: number; speed: number };

/** Pure decision: where does a fish want to go? Returns a desired velocity. */
export function fishIntent(kind: FishKind, fx: number, fy: number, touches: Touch[], fear: number): { vx: number; vy: number; mode: "flee" | "come" | "hunt" | "circle" | "cruise" } {
  const sp = FISH_SPEED[kind];
  let near: Touch | null = null, nd = Infinity;
  for (const t of touches) { const d = Math.hypot(t.x - fx, t.y - fy); if (d < nd) { nd = d; near = t; } }
  if (kind === "shark") {
    if (near && near.speed > 60) {
      const k = 520 / Math.max(1, nd);
      return { vx: (near.x - fx) * k, vy: (near.y - fy) * k, mode: "hunt" };
    }
    if (near) {
      const ang = Math.atan2(fy - near.y, fx - near.x) + 0.9;
      const R = 140;
      return { vx: (near.x + Math.cos(ang) * R - fx) * 1.5, vy: (near.y + Math.sin(ang) * R - fy) * 1.5, mode: "circle" };
    }
    return { vx: 0, vy: 0, mode: "cruise" };
  }
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

export function makeThing(kind: Kind, x: number, y: number, scale: number): Thing {
  return {
    id: nextId++, kind, x, y, vx: 0, vy: 0,
    r: PHYS[kind].size * SIZE_FACTOR * scale * (0.92 + Math.random() * 0.16),
    angle: Math.random() * Math.PI * 2, spin: 0,
    wander: Math.random() * Math.PI * 2, fear: 0, tail: Math.random() * 6, bite: 0,
    color: kind === "duck" ? "#ffc93c" : kind === "ring" ? "#ffcf1f" : kind === "ball" ? "#e8322b" : "#b5763f",
    phase: Math.random() * 10, lift: 0,
    rockX: 0, rockY: 0, rockVX: 0, rockVY: 0,
    grabbed: null, wakeT: 0,
  };
}

export type World = {
  things: Thing[];
  width: number;
  height: number;
  cell: number;
  tilt: { x: number; y: number };
  touches: Touch[];
};

const G = 900;

export function updateThings(world: World, sim: WaterSim, dt: number) {
  const { things, width, height, cell } = world;
  for (const t of things) {
    if (isFish(t.kind)) { updateFish(t, t.kind, world, sim, dt); continue; }
    const sx = t.x / cell, sy = t.y / cell;
    t.phase += dt;
    const [gx, gy] = sim.gradient(sx, sy);
    // Rocking spring: wave slope and tilt tip the toy; it settles slowly.
    const tx = -gx * 0.9, ty = -gy * 0.9;
    t.rockVX += ((tx - t.rockX) * 60 - t.rockVX * 3.2) * dt;
    t.rockVY += ((ty - t.rockY) * 60 - t.rockVY * 3.2) * dt;
    t.rockX = Math.max(-0.6, Math.min(0.6, t.rockX + t.rockVX * dt));
    t.rockY = Math.max(-0.6, Math.min(0.6, t.rockY + t.rockVY * dt));
    if (t.grabbed !== null) continue;

    const ph = PHYS[t.kind];
    const [fx, fy] = sim.flow(sx, sy);
    // Wave push grows with the crest's slope, so bigger sweeps carry toys further.
    const ax = -gx * ph.push + fx * cell * ph.flow;
    const ay = -gy * ph.push + fy * cell * ph.flow;
    t.lift += (sim.sample(sx, sy) - t.lift) * Math.min(1, dt * 12);
    const sp0 = Math.hypot(t.vx, t.vy);
    t.wakeT -= dt;
    if (sp0 > 25 && t.wakeT <= 0) {
      t.wakeT = 0.05;
      sim.disturb(sx, sy, (t.r / cell) * 1.2, -Math.min(2.2, sp0 * 0.005));
    }

    t.vx += ax * dt;
    t.vy += ay * dt;
    // Water resistance: linear plus quadratic, so fast throws slow quickly then glide.
    const k = Math.exp(-(ph.drag * 0.8 + sp0 * 0.0016) * dt);
    t.vx *= k; t.vy *= k;
    const sp = Math.hypot(t.vx, t.vy);
    if (sp > 2200) { t.vx *= 2200 / sp; t.vy *= 2200 / sp; }
    t.x += t.vx * dt;
    t.y += t.vy * dt;

    const bounce = (v: number) => {
      if (Math.abs(v) > 120) sim.disturb(t.x / cell, t.y / cell, (t.r / cell) * 1.3, -Math.min(4, Math.abs(v) * 0.005));
      return -v * 0.45;
    };
    if (t.x < t.r) { t.x = t.r; if (t.vx < 0) t.vx = bounce(t.vx); }
    if (t.x > width - t.r) { t.x = width - t.r; if (t.vx > 0) t.vx = bounce(t.vx); }
    if (t.y < t.r) { t.y = t.r; if (t.vy < 0) t.vy = bounce(t.vy); }
    if (t.y > height - t.r) { t.y = height - t.r; if (t.vy > 0) t.vy = bounce(t.vy); }

    if (t.kind === "duck" || t.kind === "boat") {
      if (sp > 12) {
        let d = Math.atan2(t.vy, t.vx) - t.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        t.angle += d * Math.min(1, dt * (t.kind === "boat" ? 2 : 2.6));
      }
    } else {
      // Ball rolls / ring spins slowly with the current.
      t.spin += (sp / t.r) * dt * (t.kind === "ball" ? 1 : 0.15);
      t.angle += (fx - fy) * dt * 0.02;
    }
  }

  for (let i = 0; i < things.length; i++) {
    const a = things[i]; if (!a) continue;
    for (let j = i + 1; j < things.length; j++) {
      const b = things[j]; if (!b) continue;
      if (isFish(a.kind) !== isFish(b.kind)) continue;
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
        }
      }
    }
  }
}

function updateFish(t: Thing, kind: FishKind, world: World, sim: WaterSim, dt: number) {
  const { width, height, cell } = world;
  const sx = t.x / cell, sy = t.y / cell;
  // Rough water nearby scares the gentle fish.
  const h = Math.abs(sim.sample(sx, sy));
  const [gx, gy] = sim.gradient(sx, sy);
  if (kind !== "shark") t.fear = Math.min(1, t.fear + Math.max(0, h - 0.8) * dt * 3);
  t.fear *= Math.exp(-dt * 0.8);
  const it = fishIntent(kind, t.x, t.y, world.touches, t.fear);
  const sp = FISH_SPEED[kind];
  let dvx = it.vx, dvy = it.vy;
  if (it.mode === "cruise" || (it.mode === "flee" && dvx === 0 && dvy === 0)) {
    t.wander += (Math.random() - 0.5) * dt * 1.6;
    const v = it.mode === "flee" ? sp.flee * 0.8 : sp.cruise;
    if (it.mode === "flee" && Math.hypot(gx, gy) > 1e-3) t.wander = Math.atan2(gy, gx);
    dvx = Math.cos(t.wander) * v; dvy = Math.sin(t.wander) * v;
  }
  // Steer away from walls.
  const m = t.r * 2;
  if (t.x < m) dvx += (m - t.x) * 4; if (t.x > width - m) dvx -= (t.x - width + m) * 4;
  if (t.y < m) dvy += (m - t.y) * 4; if (t.y > height - m) dvy -= (t.y - height + m) * 4;
  const resp = it.mode === "flee" || it.mode === "hunt" ? 5 : 1.6;
  t.vx += (dvx - t.vx) * Math.min(1, dt * resp);
  t.vy += (dvy - t.vy) * Math.min(1, dt * resp);
  const v = Math.hypot(t.vx, t.vy);
  if (v > 8) {
    let d = Math.atan2(t.vy, t.vx) - t.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    t.angle += d * Math.min(1, dt * 5);
    t.wander = t.angle;
  }
  t.x = Math.max(t.r * 0.5, Math.min(width - t.r * 0.5, t.x + t.vx * dt));
  t.y = Math.max(t.r * 0.5, Math.min(height - t.r * 0.5, t.y + t.vy * dt));
  t.tail += dt * (4 + v * 0.05);
  // Shark snaps at the moving finger.
  t.bite = Math.max(0, t.bite - dt * 3);
  if (kind === "shark" && it.mode === "hunt") {
    const head = { x: t.x + Math.cos(t.angle) * t.r * 1.1, y: t.y + Math.sin(t.angle) * t.r * 1.1 };
    for (const p of world.touches) if (Math.hypot(p.x - head.x, p.y - head.y) < t.r * 0.8 && t.bite <= 0) {
      t.bite = 1;
      sim.disturb(head.x / cell, head.y / cell, (t.r / cell) * 0.9, -4);
      t.vx *= 0.3; t.vy *= 0.3;
    }
  }
}

/* ---------- Drawing (strict top-down) ---------- */

type V = { x: number; y: number };

/** Combined 3D lean in the toy's local frame: view tilt + wave rocking. */
function lean(t: Thing, tilt: V): V {
  const lx = tilt.x * 0.5 + t.rockX, ly = tilt.y * 0.5 + t.rockY;
  const c = Math.cos(-t.angle), s = Math.sin(-t.angle);
  return { x: lx * c - ly * s, y: lx * s + ly * c };
}

function rg(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, stops: [number, string][], cx = x, cy = y) {
  const g = ctx.createRadialGradient(x, y, r0, cx, cy, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function drawRing(ctx: CanvasRenderingContext2D, t: Thing, l: V) {
  const R = t.r, tube = R * 0.34, mid = R - tube;
  const hx = -0.35 * R + l.x * R * 0.5, hy = -0.35 * R + l.y * R * 0.5;
  // Tube body with toroidal shading
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.arc(0, 0, mid - tube, 0, Math.PI * 2, true);
  ctx.clip("evenodd");
  ctx.fillStyle = rg(ctx, 0, 0, mid - tube, R, [[0, "#8a5a00"], [0.25, "#e8a800"], [0.5, "#ffd84a"], [0.75, "#e8a800"], [1, "#7a4c00"]]);
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  // White stripes
  ctx.rotate(t.spin);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = rg(ctx, 0, 0, mid - tube, R, [[0, "#8d8f94"], [0.5, "#ffffff"], [1, "#8d8f94"]]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -0.26, 0.26);
    ctx.closePath();
    ctx.fill();
  }
  ctx.rotate(-t.spin * 1);
  // Glossy highlight sliding with lean
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = rg(ctx, hx, hy, 0, R * 0.8, [[0, "rgba(255,255,240,0.85)"], [0.25, "rgba(255,255,240,0.25)"], [1, "rgba(255,255,255,0)"]]);
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.restore();
  // Valve
  ctx.fillStyle = "#f4f4f0";
  ctx.beginPath();
  ctx.arc(mid * Math.cos(0.8) + l.x * 2, mid * Math.sin(0.8) + l.y * 2, tube * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBall(ctx: CanvasRenderingContext2D, t: Thing, l: V) {
  const R = t.r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.clip();
  // Beach ball panels, rotating with roll
  const cols = ["#e8322b", "#ffffff", "#1f6fe0", "#ffffff", "#ffc61a", "#ffffff"];
  const cx = l.x * R * 0.35, cy = l.y * R * 0.35;
  for (let i = 0; i < 6; i++) {
    const a0 = t.spin + (i * Math.PI) / 3;
    ctx.fillStyle = cols[i] ?? "#fff";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R * 2, a0, a0 + Math.PI / 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#f4f4f4";
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2);
  ctx.fill();
  // Sphere shading + specular
  ctx.fillStyle = rg(ctx, cx * 0.6, cy * 0.6, R * 0.2, R * 1.05, [[0, "rgba(0,0,0,0)"], [0.7, "rgba(0,0,0,0.12)"], [1, "rgba(0,0,0,0.55)"]], 0, 0);
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  const hx = -R * 0.35 + l.x * R * 0.4, hy = -R * 0.38 + l.y * R * 0.4;
  ctx.fillStyle = rg(ctx, hx, hy, 0, R * 0.45, [[0, "rgba(255,255,255,0.95)"], [0.3, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]);
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.restore();
}

function drawDuck(ctx: CanvasRenderingContext2D, t: Thing, l: V) {
  const r = t.r;
  // Body (rubber, glossy)
  ctx.fillStyle = rg(ctx, -r * 0.2 + l.x * r * 0.3, -r * 0.2 + l.y * r * 0.3, r * 0.1, r * 1.05, [[0, "#fff3a8"], [0.45, "#ffcc2e"], [0.85, "#e09a00"], [1, "#a86b00"]], 0, 0);
  ctx.beginPath();
  ctx.moveTo(-r * 1.05, -r * 0.05);
  ctx.quadraticCurveTo(-r * 1.1, -r * 0.7, -r * 0.1, -r * 0.75);
  ctx.quadraticCurveTo(r * 0.7, -r * 0.7, r * 0.75, 0);
  ctx.quadraticCurveTo(r * 0.7, r * 0.7, -r * 0.1, r * 0.75);
  ctx.quadraticCurveTo(-r * 1.1, r * 0.7, -r * 1.05, r * 0.05);
  ctx.fill();
  // Wing ridges
  ctx.strokeStyle = "rgba(160,100,0,0.45)";
  ctx.lineWidth = r * 0.06;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, s * r * 0.4);
    ctx.quadraticCurveTo(-r * 0.15, s * r * 0.62, r * 0.25, s * r * 0.42);
    ctx.stroke();
  }
  // Head sits higher: shifts more with lean
  const hx = r * 0.45 + l.x * r * 0.32, hy = l.y * r * 0.32;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.arc(hx - l.x * r * 0.12 + r * 0.03, hy - l.y * r * 0.12 + r * 0.04, r * 0.47, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f07a12";
  ctx.beginPath();
  ctx.ellipse(hx + r * 0.42, hy, r * 0.28, r * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rg(ctx, hx - r * 0.12, hy - r * 0.14, r * 0.04, r * 0.48, [[0, "#fff6b8"], [0.5, "#ffcc2e"], [1, "#c98500"]], hx, hy);
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#15110c";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + r * 0.16, hy + s * r * 0.24, r * 0.065, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(hx - r * 0.14, hy - r * 0.15, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoat(ctx: CanvasRenderingContext2D, t: Thing, l: V) {
  const r = t.r;
  const hull = new Path2D();
  hull.moveTo(r * 1.2, 0);
  hull.bezierCurveTo(r * 0.8, -r * 0.5, -r * 0.4, -r * 0.5, -r * 0.95, -r * 0.38);
  hull.lineTo(-r * 0.95, r * 0.38);
  hull.bezierCurveTo(-r * 0.4, r * 0.5, r * 0.8, r * 0.5, r * 1.2, 0);
  const wood = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
  wood.addColorStop(0, "#5e3417"); wood.addColorStop(0.5, "#a8642e"); wood.addColorStop(1, "#5e3417");
  ctx.fillStyle = wood;
  ctx.fill(hull);
  // Deck planks (inset, slightly raised)
  ctx.save();
  ctx.translate(l.x * r * 0.08, l.y * r * 0.08);
  ctx.scale(0.82, 0.72);
  ctx.clip(hull);
  ctx.fillStyle = "#d9a36a";
  ctx.fillRect(-r * 1.3, -r, r * 2.6, r * 2);
  ctx.strokeStyle = "rgba(90,50,20,0.45)";
  ctx.lineWidth = r * 0.025;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-r * 1.3, i * r * 0.11);
    ctx.lineTo(r * 1.3, i * r * 0.11);
    ctx.stroke();
  }
  ctx.restore();
  // Mast is tall: its top & sail shift most with lean
  const mx = r * 0.2, my = 0;
  const tx = mx + l.x * r * 0.9, ty = my + l.y * r * 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.moveTo(mx, my); ctx.lineTo(-r * 0.7, r * 0.12); ctx.lineTo(tx, ty); ctx.fill();
  const sail = ctx.createLinearGradient(mx, my, -r * 0.7, r * 0.3);
  sail.addColorStop(0, "#ffffff"); sail.addColorStop(1, "#d8d4c8");
  ctx.fillStyle = sail;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.quadraticCurveTo(-r * 0.2 + l.x * r * 0.4, r * 0.5 + l.y * r * 0.4, -r * 0.72, r * 0.1);
  ctx.lineTo(mx, my);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3b2616";
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.fillStyle = "#c8312a";
  ctx.beginPath(); ctx.arc(tx, ty, r * 0.07, 0, Math.PI * 2); ctx.fill();
}

const FISH_LOOK: Record<FishKind, { body: [string, string, string]; fin: string; len: number; wid: number }> = {
  koi: { body: ["#fff4e6", "#ff7a1a", "#b33a0a"], fin: "rgba(255,200,160,0.55)", len: 1.25, wid: 0.36 },
  tang: { body: ["#9fd4ff", "#1f5fd6", "#0b2a7a"], fin: "rgba(255,214,40,0.9)", len: 1.1, wid: 0.42 },
  perch: { body: ["#e6efb0", "#7f9a3a", "#3b4a18"], fin: "rgba(210,120,60,0.7)", len: 1.2, wid: 0.32 },
  shark: { body: ["#e8eef2", "#6f8494", "#36454f"], fin: "rgba(80,100,115,0.95)", len: 1.5, wid: 0.3 },
};

function drawFish(ctx: CanvasRenderingContext2D, t: Thing, kind: FishKind) {
  const L = FISH_LOOK[kind], r = t.r, len = r * L.len, w = r * L.wid;
  const sw = Math.sin(t.tail) * 0.35;
  const bite = t.bite;
  // Body spine bends with the tail beat.
  const body = new Path2D();
  const tx = -len, ty = sw * r * 0.5;
  body.moveTo(len, 0);
  body.bezierCurveTo(len * 0.7, -w * 1.1, -len * 0.3, -w * 1.2, tx * 0.85, ty - w * 0.15);
  body.lineTo(tx * 0.85, ty + w * 0.15);
  body.bezierCurveTo(-len * 0.3, w * 1.2, len * 0.7, w * 1.1, len, 0);
  // Tail fin
  ctx.fillStyle = L.fin;
  ctx.beginPath();
  ctx.moveTo(tx * 0.8, ty);
  ctx.quadraticCurveTo(tx * 1.05, ty - w * 0.4, tx * 1.25, ty - w * (kind === "shark" ? 1.4 : 1.1) + sw * r * 0.2);
  ctx.quadraticCurveTo(tx * 1.05, ty, tx * 1.25, ty + w * (kind === "shark" ? 0.9 : 1.1) + sw * r * 0.2);
  ctx.closePath(); ctx.fill();
  // Pectoral fins
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(len * 0.25, s * w * 1.05, r * (kind === "shark" ? 0.45 : 0.25), r * 0.1, s * (kind === "shark" ? 0.9 : 0.6) - sw * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, L.body[2]); g.addColorStop(0.5, L.body[1]); g.addColorStop(1, L.body[2]);
  ctx.fillStyle = g; ctx.fill(body);
  ctx.save(); ctx.clip(body);
  if (kind === "koi") {
    ctx.fillStyle = "rgba(255,250,240,0.9)";
    for (const [x, y, rr] of [[0.4, -0.1, 0.28], [-0.2, 0.15, 0.3], [-0.65, -0.05, 0.2]] as const) { ctx.beginPath(); ctx.arc(len * x, w * y, r * rr, 0, Math.PI * 2); ctx.fill(); }
  } else if (kind === "perch") {
    ctx.fillStyle = "rgba(30,40,10,0.45)";
    for (let i = 0; i < 5; i++) ctx.fillRect(len * (0.45 - i * 0.28), -w * 1.2, r * 0.08, w * 2.4);
  } else if (kind === "tang") {
    ctx.fillStyle = "rgba(5,15,50,0.55)";
    ctx.beginPath(); ctx.ellipse(-len * 0.05, 0, len * 0.5, w * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = "rgba(20,30,40,0.35)";
    ctx.fillRect(-len, -w * 0.18, len * 2, w * 0.36);
  }
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.ellipse(len * 0.2, -w * 0.2, len * 0.5, w * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (kind === "shark") {
    // Dorsal fin seen from above + open jaw when biting
    ctx.fillStyle = L.fin;
    ctx.beginPath(); ctx.moveTo(len * 0.15, 0); ctx.lineTo(-len * 0.35, -w * 0.12); ctx.lineTo(-len * 0.35, w * 0.12); ctx.fill();
    if (bite > 0) {
      ctx.fillStyle = "rgba(120,20,30,0.9)";
      ctx.beginPath(); ctx.ellipse(len * 0.92, 0, r * 0.18 * bite, w * 0.5 * bite, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff";
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(len * (0.82 + i * 0.06), s * w * 0.4 * bite, r * 0.03, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.fillStyle = "#0a0a0a";
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(len * 0.72, s * w * 0.55, r * 0.06, 0, Math.PI * 2); ctx.fill(); }
}

/** Soft shadows cast onto the floor – refracted by the water in the renderer. */
export function drawUnder(ctx: CanvasRenderingContext2D, things: Thing[], scale: number, tilt: V = { x: 0, y: 0 }, depth = 1) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const off = 10 + depth * 30;
  for (const t of things) {
    const lifted = t.grabbed !== null ? 1.8 : 1;
    const x = t.x + (0.35 + tilt.x * 0.25) * off * lifted;
    const y = t.y + (0.45 + tilt.y * 0.25) * off * lifted;
    const blur = t.r * (0.5 + depth * 0.6) * lifted;
    const alpha = 0.42 - depth * 0.14;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.angle);
    const sx = t.kind === "duck" ? 1.05 : t.kind === "boat" ? 1.15 : isFish(t.kind) ? 1.3 : 1;
    const sy = t.kind === "duck" ? 0.78 : t.kind === "boat" ? 0.5 : isFish(t.kind) ? 0.4 : 1;
    ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, t.r + blur);
    if (t.kind === "ring") {
      const inner = (t.r * 0.32) / (t.r + blur);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(inner, "rgba(0,0,0,0.02)");
      g.addColorStop(0.62, `rgba(0,0,0,${alpha})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.7})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, t.r + blur, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Floating toys drawn above the water, leaning in 3D with tilt and waves. */
export function drawSurface(ctx: CanvasRenderingContext2D, things: Thing[], dpr: number, tilt: V = { x: 0, y: 0 }, duck?: (ctx: CanvasRenderingContext2D, t: Thing, lean: V) => void) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Fish swim under the surface: drawn first, slightly softened by the water.
  for (const t of things) {
    if (!isFish(t.kind)) continue;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.translate(t.x + tilt.x * 6, t.y + tilt.y * 6);
    ctx.rotate(t.angle);
    drawFish(ctx, t, t.kind);
    ctx.restore();
  }
  for (const t of things) {
    if (isFish(t.kind)) continue;
    const bob = 1 + Math.max(-0.06, Math.min(0.08, t.lift * 0.015)) + (t.grabbed !== null ? 0.14 : 0);
    const l = lean(t, tilt);
    // Waterline contact shade
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);
    ctx.fillStyle = "rgba(0,20,30,0.22)";
    ctx.beginPath();
    const ws = t.kind === "boat" ? [1.15, 0.5] : t.kind === "duck" ? [1.05, 0.8] : [1.04, 1.04];
    ctx.ellipse(0, 0, t.r * (ws[0] ?? 1), t.r * (ws[1] ?? 1), 0, 0, Math.PI * 2);
    if (t.kind === "ring") ctx.arc(0, 0, t.r * 0.32, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    // 3D: foreshorten along the lean, shift the top
    ctx.translate(l.x * t.r * 0.12, l.y * t.r * 0.12);
    ctx.scale(bob * (1 - Math.abs(l.x) * 0.12), bob * (1 - Math.abs(l.y) * 0.12));
    if (t.kind === "duck" && duck) duck(ctx, t, l);
    else if (t.kind === "duck") drawDuck(ctx, t, l);
    else if (t.kind === "boat") drawBoat(ctx, t, l);
    else if (t.kind === "ball") drawBall(ctx, t, l);
    else drawRing(ctx, t, l);
    ctx.restore();
  }
}
