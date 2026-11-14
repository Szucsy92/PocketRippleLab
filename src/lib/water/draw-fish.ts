import { clamp } from "./math";
import { FISH_SHEET, SHARK_BITE, sprite } from "./sprites";
import { isFish, type FishKind, type Thing } from "./things";

type V = { x: number; y: number };

/** Drawn body length (nose to tail tip) in fish radii, and body half-width as a fraction of that length. */
const CLOWN_LOOK = { len: 2.8, half: 0.2 }; // the three clown fish are identical apart from colour
const LOOK: Record<FishKind, { len: number; half: number }> = {
  koi: CLOWN_LOOK,
  tang: CLOWN_LOOK,
  perch: CLOWN_LOOK,
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

/** Composes one pose on the scratch canvas, tints it toward the water colour with depth (keeping it opaque) and draws it centred on the pivot. */
function drawCell(ctx: CanvasRenderingContext2D, _img: HTMLImageElement, sh: { cw: number; ch: number }, z: number, k: number, paint: (c2: CanvasRenderingContext2D) => void) {
  const sc = scratchCanvas(sh.cw, sh.ch);
  const c2 = sc.getContext("2d");
  if (!c2) return;
  c2.setTransform(1, 0, 0, 1, 0, 0);
  c2.globalCompositeOperation = "source-over";
  c2.globalAlpha = 1;
  c2.clearRect(0, 0, sh.cw, sh.ch);
  paint(c2);
  if (z > 0.05) {
    c2.globalAlpha = 1;
    c2.globalCompositeOperation = "source-atop";
    c2.fillStyle = `rgba(${DEEP},${0.42 * z})`;
    c2.fillRect(0, 0, sh.cw, sh.ch);
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(sc, 0, 0, sh.cw, sh.ch, (-sh.cw * k) / 2, (-sh.ch * k) / 2, sh.cw * k, sh.ch * k);
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
 * One fish from its sprite sheet. Deeper fish are smaller, bluer and drift more with the view tilt
 * (parallax) and the wave slope (refraction). Fish are always fully opaque; nothing is drawn but the baked animation.
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

  // The shark's bite is its own baked sequence (two snaps); it plays from the moment the bite starts.
  const biting = kind === "shark" && t.bite > 0;
  const bimg = biting ? sprite(SHARK_BITE.url) : null;
  if (bimg) {
    const n = clamp(Math.floor((1 - t.bite) * SHARK_BITE.frames), 0, SHARK_BITE.frames - 1);
    drawCell(ctx, bimg, SHARK_BITE, z, k, (c2) => {
      c2.drawImage(bimg, (n % SHARK_BITE.cols) * SHARK_BITE.cw, Math.floor(n / SHARK_BITE.cols) * SHARK_BITE.ch, SHARK_BITE.cw, SHARK_BITE.ch, 0, 0, SHARK_BITE.cw, SHARK_BITE.ch);
    });
  } else if (img) {
    drawCell(ctx, img, sh, z, k, (c2) => {
      const cell = (col: number, row: number, alpha: number) => {
        c2.globalAlpha = alpha;
        c2.drawImage(img, col * sh.cw, row * sh.ch, sh.cw, sh.ch, 0, 0, sh.cw, sh.ch);
      };
      if (amp < 0.98) cell(0, sh.rows, 1);
      cell(colA, bendRow, amp);
      if (f > 0.02) cell(colB, bendRow, amp * f);
    });
  }
  ctx.restore();
}
