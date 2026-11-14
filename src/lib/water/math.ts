export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
