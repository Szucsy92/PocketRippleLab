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

type Cell = { col: number; row: number; alpha: number };
/**
 * Draws the given sheet cells centred on the pivot. Near the surface they go straight to the canvas (one drawImage per fish);
 * deeper fish are composed on a scratch canvas first so the water-colour tint stays inside their silhouette. Always opaque.
 */
function drawPose(ctx: CanvasRenderingContext2D, img: HTMLImageElement, sh: { cw: number; ch: number }, cells: Cell[], z: number, k: number) {
  const dw = sh.cw * k, dh = sh.ch * k;
  if (z <= 0.12) {
    for (const c of cells) {
      ctx.globalAlpha = c.alpha;
      ctx.drawImage(img, c.col * sh.cw, c.row * sh.ch, sh.cw, sh.ch, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.globalAlpha = 1;
    return;
  }
  const sc = scratchCanvas(sh.cw, sh.ch);
  const c2 = sc.getContext("2d");
  if (!c2) return;
  c2.setTransform(1, 0, 0, 1, 0, 0);
  c2.globalCompositeOperation = "source-over";
  c2.clearRect(0, 0, sh.cw, sh.ch);
  for (const c of cells) {
    c2.globalAlpha = c.alpha;
    c2.drawImage(img, c.col * sh.cw, c.row * sh.ch, sh.cw, sh.ch, 0, 0, sh.cw, sh.ch);
  }
  c2.globalAlpha = 1;
  c2.globalCompositeOperation = "source-atop";
  c2.fillStyle = `rgba(${DEEP},${0.42 * z})`;
  c2.fillRect(0, 0, sh.cw, sh.ch);
  ctx.globalAlpha = 1;
  ctx.drawImage(sc, 0, 0, sh.cw, sh.ch, -dw / 2, -dh / 2, dw, dh);
}

/** Which sheet cells make up a fish's current pose (pure). `groups` > 1 = a long, smooth loop: the nearest phase is used, no cross-fade. */
export function fishPose(t: Pick<Thing, "turn" | "speed" | "tail" | "side">, cols: number, groups = 1) {
  const mirror = t.side > 0; // the sheet holds turns to one side; the other side is its mirror image
  const bendRow = Math.abs(t.turn) < 0.5 ? 0 : Math.abs(t.turn) < 1.6 ? 1 : 2;
  // A hovering fish barely beats its tail (blend toward the still frame); a turning one keeps its full pose.
  const amp = bendRow === 0 ? clamp((t.speed - 8) / 70, 0.15, 1) : 1;
  const total = cols * groups;
  const p = ((((t.tail / (Math.PI * 2)) % 1) + 1) % 1) * total;
  const shift = mirror ? total / 2 : 0; // mirroring flips the wave, so use the opposite phase
  let a0 = Math.floor(p), f = p - a0;
  if (groups > 1) { a0 = Math.round(p); f = 0; }
  const iA = (a0 + shift) % total, iB = (a0 + 1 + shift) % total;
  return { mirror, bendRow, amp, colA: iA % cols, colB: iB % cols, grpA: Math.floor(iA / cols), grpB: Math.floor(iB / cols), f };
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
  const g = sh.groups ?? 1;
  const { mirror, bendRow, amp, colA, colB, grpA, grpB, f } = fishPose(t, sh.cols, g);
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
    drawPose(ctx, bimg, SHARK_BITE, [{ col: n % SHARK_BITE.cols, row: Math.floor(n / SHARK_BITE.cols), alpha: 1 }], z, k);
  } else if (img) {
    const cells: Cell[] = [];
    if (amp < 0.98) cells.push({ col: 0, row: sh.rows * g, alpha: 1 });
    cells.push({ col: colA, row: bendRow * g + grpA, alpha: amp });
    if (f > 0.02) cells.push({ col: colB, row: bendRow * g + grpB, alpha: amp * f });
    drawPose(ctx, img, sh, cells, z, k);
  }
  ctx.restore();
}
