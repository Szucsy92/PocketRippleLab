import type { WaterSim } from "./sim";

export type Kind = "duck" | "boat" | "ball" | "ring";

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
};

let nextId = 1;
export const isFloating = (_k: Kind) => true;

/** Feel constants: lighter toys get carried further by the waves. */
export const PHYS: Record<Kind, { push: number; drag: number; size: number; flow: number }> = {
  ball: { push: 3400, drag: 0.7, size: 20, flow: 12 },
  ring: { push: 3000, drag: 0.85, size: 30, flow: 11 },
  duck: { push: 2000, drag: 1.25, size: 26, flow: 8 },
  boat: { push: 1700, drag: 1.1, size: 32, flow: 7 },
};

export function makeThing(kind: Kind, x: number, y: number, scale: number): Thing {
  return {
    id: nextId++, kind, x, y, vx: 0, vy: 0,
    r: PHYS[kind].size * scale * (0.92 + Math.random() * 0.16),
    angle: Math.random() * Math.PI * 2, spin: 0,
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
  touches: { x: number; y: number }[];
};

const G = 900;

export function updateThings(world: World, sim: WaterSim, dt: number) {
  const { things, width, height, cell, tilt } = world;
  for (const t of things) {
    const sx = t.x / cell, sy = t.y / cell;
    t.phase += dt;
    const [gx, gy] = sim.gradient(sx, sy);
    // Rocking spring: wave slope and tilt tip the toy; it settles slowly.
    const tx = -gx * 0.9 + tilt.x * 0.35, ty = -gy * 0.9 + tilt.y * 0.35;
    t.rockVX += ((tx - t.rockX) * 60 - t.rockVX * 3.2) * dt;
    t.rockVY += ((ty - t.rockY) * 60 - t.rockVY * 3.2) * dt;
    t.rockX = Math.max(-0.6, Math.min(0.6, t.rockX + t.rockVX * dt));
    t.rockY = Math.max(-0.6, Math.min(0.6, t.rockY + t.rockVY * dt));
    if (t.grabbed !== null) continue;

    const ph = PHYS[t.kind];
    const [fx, fy] = sim.flow(sx, sy);
    // Wave push grows with the crest's slope, so bigger sweeps carry toys further.
    const ax = -gx * ph.push + tilt.x * G * 0.55 + fx * cell * ph.flow;
    const ay = -gy * ph.push + tilt.y * G * 0.55 + fy * cell * ph.flow;
    t.lift += (sim.sample(sx, sy) - t.lift) * Math.min(1, dt * 12);
    const sp0 = Math.hypot(t.vx, t.vy);
    t.wakeT -= dt;
    if (sp0 > 25 && t.wakeT <= 0) {
      t.wakeT = 0.05;
      sim.disturb(sx, sy, (t.r / cell) * 1.2, -Math.min(2.2, sp0 * 0.005));
    }

    t.vx += ax * dt;
    t.vy += ay * dt;
    const k = Math.exp(-ph.drag * dt);
    t.vx *= k; t.vy *= k;
    const sp = Math.hypot(t.vx, t.vy);
    if (sp > 1400) { t.vx *= 1400 / sp; t.vy *= 1400 / sp; }
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

/** Soft shadows cast onto the floor – refracted by the water in the renderer. */
export function drawUnder(ctx: CanvasRenderingContext2D, things: Thing[], scale: number, tilt: V = { x: 0, y: 0 }, depth = 1) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const off = 10 + depth * 30;
  for (const t of things) {
    const lifted = t.grabbed !== null ? 1.8 : 1;
    const x = t.x + (0.35 + tilt.x * 1.4) * off * lifted;
    const y = t.y + (0.45 + tilt.y * 1.4) * off * lifted;
    const blur = t.r * (0.5 + depth * 0.6) * lifted;
    const alpha = 0.42 - depth * 0.14;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.angle);
    const sx = t.kind === "duck" ? 1.05 : t.kind === "boat" ? 1.15 : 1;
    const sy = t.kind === "duck" ? 0.78 : t.kind === "boat" ? 0.5 : 1;
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
export function drawSurface(ctx: CanvasRenderingContext2D, things: Thing[], dpr: number, tilt: V = { x: 0, y: 0 }) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const t of things) {
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
    if (t.kind === "duck") drawDuck(ctx, t, l);
    else if (t.kind === "boat") drawBoat(ctx, t, l);
    else if (t.kind === "ball") drawBall(ctx, t, l);
    else drawRing(ctx, t, l);
    ctx.restore();
  }
}
