import { clamp } from "./math";
import { FISH_PIVOT, FISH_SHEET, sprite } from "./sprites";
import { isFish, type FishKind, type Thing } from "./things";

type V = { x: number; y: number };

/** Drawn body length (nose to tail tip) in fish radii, and body half-width as a fraction of that length. */
const LOOK: Record<FishKind, { len: number; half: number }> = {
  koi: { len: 2.8, half: 0.2 },
  tang: { len: 2.5, half: 0.22 },
  perch: { len: 2.7, half: 0.18 },
  shark: { len: 3.4, half: 0.3 },
};

const DEEP = "0,51,102";
let scratch: HTMLCanvasElement | null = null;
/** Small off-screen canvas to blend the frames and tint them toward the water colour. */
function scratchCanvas(w: number, h: number) {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  return scratch;
}

/** Which sheet cells make up a fish's current pose (pure). */
export function fishPose(t: Pick<Thing, "turn" | "speed" | "tail" | "side">, cols: number) {
  const mirror = t.side > 0; // the sheet holds turns to one side; the other side is its mirror image
  const bendRow = Math.abs(t.turn) < 0.5 ? 0 : Math.abs(t.turn) < 1.6 ? 1 : 2;
  // A hovering fish barely beats its tail (blend toward the still frame); a turning one keeps its full pose.
  const amp = bendRow === 0 ? clamp((t.speed - 8) / 70, 0.15, 1) : 1;
  const p = ((((t.tail / (Math.PI * 2)) % 1) + 1) % 1) * cols;
  const a0 = Math.floor(p);
  const shift = mirror ? cols / 2 : 0; // mirroring flips the wave, so use the opposite phase
  return { mirror, bendRow, amp, colA: (a0 + shift) % cols, colB: (a0 + 1 + shift) % cols, f: p - a0 };
}

/**
 * One fish from its sprite sheet. Deeper fish are smaller, bluer, fainter and drift more with the view tilt
 * (parallax) and the wave slope (refraction); fish at the surface are crisp, foamy and gulp.
 */
export function drawFish(ctx: CanvasRenderingContext2D, t: Thing, tilt: V) {
  const kind = t.kind;
  if (!isFish(kind)) return;
  const z = clamp(t.z, 0, 1);
  const sh = FISH_SHEET[kind], look = LOOK[kind];
  const img = sprite(sh.url);
  const len = t.r * look.len, k = len / sh.lenPx;
  const { mirror, bendRow, amp, colA, colB, f } = fishPose(t, sh.cols);
  const par = 4 + 24 * z;
  const s = 1 - 0.1 * z;
  ctx.save();
  ctx.translate(t.x + tilt.x * par + t.rockX * 34 * z, t.y + tilt.y * par + t.rockY * 34 * z);
  ctx.rotate(t.angle);
  ctx.scale(s, mirror ? -s : s);

  if (img) {
    const sc = scratchCanvas(sh.cw, sh.ch);
    const c2 = sc.getContext("2d");
    if (c2) {
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.globalCompositeOperation = "source-over";
      c2.globalAlpha = 1;
      c2.clearRect(0, 0, sh.cw, sh.ch);
      const cell = (col: number, row: number, alpha: number) => {
        c2.globalAlpha = alpha;
        c2.drawImage(img, col * sh.cw, row * sh.ch, sh.cw, sh.ch, 0, 0, sh.cw, sh.ch);
      };
      if (amp < 0.98) cell(0, sh.rows, 1);
      cell(colA, bendRow, amp);
      if (f > 0.02) cell(colB, bendRow, amp * f);
      if (z > 0.05) {
        c2.globalAlpha = 1;
        c2.globalCompositeOperation = "source-atop";
        c2.fillStyle = `rgba(${DEEP},${0.6 * z})`;
        c2.fillRect(0, 0, sh.cw, sh.ch);
      }
      ctx.globalAlpha = 0.97 - 0.45 * z;
      ctx.drawImage(sc, 0, 0, sh.cw, sh.ch, (-sh.cw * k) / 2, (-sh.ch * k) / 2, sh.cw * k, sh.ch * k);
      ctx.globalAlpha = 1;
    }
  }

  const surf = clamp(1 - z / 0.2, 0, 1);
  if (surf > 0) {
    // Surface contact: a thin foam ring round the body; the shark's fin trails a foamy V.
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * surf})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-0.056 * len, 0, len * 0.47, len * look.half * 0.95, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (kind === "shark" && t.speed > 20) {
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * surf})`;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-0.08 * len, 0);
        ctx.lineTo(-0.08 * len - t.r * 1.3, d * t.r * 0.5);
        ctx.stroke();
      }
    }
  }
  if (t.bite > 0 && kind !== "shark") {
    // Gulp at the surface: a small round mouth.
    ctx.fillStyle = "rgba(70,15,25,0.8)";
    ctx.beginPath();
    ctx.ellipse(FISH_PIVOT * len * 0.97, 0, len * 0.035 * t.bite, len * 0.03 * t.bite, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
