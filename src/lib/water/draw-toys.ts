import { BALL, HEADING, RING, sprite } from "./sprites";
import type { Thing } from "./things";

type V = { x: number; y: number };

/** Combined 3D lean in screen space: view tilt + wave rocking. */
export function leanOf(t: Thing, tilt: V): V {
  return { x: tilt.x * 0.5 + t.rockX, y: tilt.y * 0.5 + t.rockY };
}

const TAU = Math.PI * 2;

/** Rolling beach ball: roll frames rotated to the direction of travel, with the light and gloss kept still on top. */
function drawBall(ctx: CanvasRenderingContext2D, t: Thing, l: V) {
  const img = sprite(BALL.urls[t.skin] ?? BALL.urls[0] ?? "");
  const shade = sprite(BALL.shade);
  if (!img) return;
  const S = BALL.size, ds = (t.r * 2) / BALL.sphere;
  const p = ((((t.spin / TAU) % 1) + 1) % 1) * BALL.frames;
  const a = Math.floor(p), f = p - a, b = (a + 1) % BALL.frames;
  ctx.save();
  ctx.rotate(t.angle);
  ctx.drawImage(img, a * S, 0, S, S, -ds / 2, -ds / 2, ds, ds);
  if (f > 0.02) { ctx.globalAlpha = f; ctx.drawImage(img, b * S, 0, S, S, -ds / 2, -ds / 2, ds, ds); }
  ctx.restore();
  if (shade) {
    ctx.drawImage(shade, 0, 0, S, S, -ds / 2, -ds / 2, ds, ds);
    // The gloss slides a little as the ball tips.
    ctx.drawImage(shade, S, 0, S, S, -ds / 2 + l.x * t.r * 0.25, -ds / 2 + l.y * t.r * 0.25, ds, ds);
  }
}

function drawRing(ctx: CanvasRenderingContext2D, t: Thing) {
  const img = sprite(RING.urls[t.skin] ?? RING.urls[0] ?? "");
  if (!img) return;
  const ds = t.r * RING.extent;
  ctx.drawImage(img, -ds / 2, -ds / 2, ds, ds);
}

/** Nearest pre-rendered heading and the small angle left over (pure). */
export function headingFrame(angle: number, frames: number) {
  const step = TAU / frames;
  const ang = ((angle % TAU) + TAU) % TAU;
  const n = Math.round(ang / step);
  return { idx: n % frames, rest: ang - n * step };
}

/** Duck / boat: the pre-rendered heading closest to the current one, rotated by the small remainder. */
function drawHeading(ctx: CanvasRenderingContext2D, t: Thing, kind: "duck" | "boat") {
  const H = HEADING[kind];
  const img = sprite(H.url);
  if (!img) return;
  const { idx, rest } = headingFrame(t.angle, H.frames);
  const ds = H.extent * H.unit * t.r;
  ctx.save();
  ctx.rotate(rest);
  ctx.drawImage(img, (idx % H.cols) * H.size, Math.floor(idx / H.cols) * H.size, H.size, H.size, -ds / 2, -ds / 2, ds, ds);
  ctx.restore();
}

/** A floating toy above the water, leaning in 3D with tilt and waves. */
export function drawToy(ctx: CanvasRenderingContext2D, t: Thing, tilt: V) {
  const bob = 1 + Math.max(-0.06, Math.min(0.08, t.lift * 0.015)) + (t.grabbed !== null ? 0.14 : 0);
  const l = leanOf(t, tilt);
  ctx.save();
  ctx.translate(t.x, t.y);
  // Waterline contact shade
  ctx.save();
  ctx.rotate(t.angle);
  ctx.fillStyle = "rgba(0,20,30,0.22)";
  ctx.beginPath();
  const ws = t.kind === "boat" ? [1.15, 0.5] : t.kind === "duck" ? [1.05, 0.8] : [1.04, 1.04];
  ctx.ellipse(0, 0, t.r * (ws[0] ?? 1), t.r * (ws[1] ?? 1), 0, 0, TAU);
  if (t.kind === "ring") ctx.arc(0, 0, t.r * 0.32, 0, TAU, true);
  ctx.fill("evenodd");
  ctx.restore();
  // 3D: foreshorten along the lean, shift the top
  ctx.translate(l.x * t.r * 0.12, l.y * t.r * 0.12);
  ctx.scale(bob * (1 - Math.abs(l.x) * 0.12), bob * (1 - Math.abs(l.y) * 0.12));
  if (t.kind === "duck" || t.kind === "boat") drawHeading(ctx, t, t.kind);
  else if (t.kind === "ball") drawBall(ctx, t, l);
  else if (t.kind === "ring") drawRing(ctx, t);
  ctx.restore();
}
