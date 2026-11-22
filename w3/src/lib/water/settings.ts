export type Swatch = { name: string; hex: string };

/** Max 5 colors each. Liquid index 0 = transparent (the default). */
export const BACKGROUNDS: Swatch[] = [
  { name: "Éjfél", hex: "#0a0a14" },
  { name: "Mélytenger", hex: "#04201e" },
  { name: "Éjrózsa", hex: "#220a18" },
  { name: "Borostyán", hex: "#1e1606" },
  { name: "Erdőmély", hex: "#08200c" },
];

export const LIQUIDS: Swatch[] = [
  { name: "Átlátszó", hex: "transparent" },
  { name: "Türkiz", hex: "#36f1cd" },
  { name: "Rózsa", hex: "#ff5fa2" },
  { name: "Méz", hex: "#ffd166" },
  { name: "Lime", hex: "#7cff6b" },
];

export const GLOWS: Swatch[] = LIQUIDS.slice(1).concat({ name: "Hold", hex: "#9ad7ff" });

export const SETTINGS_HOLD_MS = 3000;

export const WATER_COLORS = { shallow: "#7fffd4", deep: "#003366", opacity: 0.85 };
export type Mood = "pool" | "sea" | "lake";
export type RainMode = "auto" | "touch";
export const MOODS: { id: Mood; label: string; settings: Partial<Settings> }[] = [
  { id: "pool", label: "Medence", settings: { bg: 1, liquid: 0, glowOn: false } },
  { id: "lake", label: "Tavacska", settings: { bg: 4, liquid: 0, glowOn: false } },
  { id: "sea", label: "Tengerfenék", settings: { bg: 1, liquid: 1, glowOn: false } },
];

export function applyMood(s: Settings, mood: Mood): Settings {
  return clampSettings({ ...s, ...MOODS.find((m) => m.id === mood)?.settings, mood });
}

export function lightFromDisk(x: number, y: number): { x: number; y: number } {
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}

export type Settings = {
  bg: number;
  liquid: number;
  glowOn: boolean;
  glowAmount: number; // 0..1
  glowColor: number;
  waveSpeed: number; // 1..3
  waveLife: number; // 0..1
  tiltOn: boolean;
  tiltZero: { x: number; y: number };
  mood: Mood | null;
  rainMode: RainMode;
  depth: number;
  light: { x: number; y: number };
};

export const DEFAULT_SETTINGS: Settings = {
  bg: 0,
  liquid: 0,
  glowOn: true,
  glowAmount: 0.55,
  glowColor: 0,
  waveSpeed: 1,
  waveLife: 1,
  tiltOn: true,
  tiltZero: { x: 0, y: 0 },
  mood: null,
  rainMode: "auto",
  depth: 1,
  light: { x: -0.45, y: -0.55 },
};

const KEY = "vizjatek-settings-v1";

export function clampSettings(s: Partial<Settings>): Settings {
  const m = { ...DEFAULT_SETTINGS, ...s };
  const idx = (v: number, n: number) => Math.min(n - 1, Math.max(0, Math.round(v || 0)));
  const unit = (v: number, fallback: number) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  return {
    ...m,
    bg: idx(m.bg, BACKGROUNDS.length),
    liquid: idx(m.liquid, LIQUIDS.length),
    glowColor: idx(m.glowColor, GLOWS.length),
    glowAmount: Math.min(1, Math.max(0, m.glowAmount)),
    waveSpeed: Math.min(3, Math.max(1, m.waveSpeed)),
    waveLife: Math.min(1, Math.max(0, m.waveLife)),
    mood: MOODS.some((p) => p.id === m.mood) ? m.mood : null,
    rainMode: m.rainMode === "touch" ? "touch" : "auto",
    depth: unit(m.depth, DEFAULT_SETTINGS.depth),
    light: lightFromDisk(Number.isFinite(m.light?.x) ? m.light.x : DEFAULT_SETTINGS.light.x, Number.isFinite(m.light?.y) ? m.light.y : DEFAULT_SETTINGS.light.y),
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clampSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Wave life slider -> per-step damping factor. */
export function dampingFor(life: number) {
  return 0.982 + life * 0.016; // Retain more energy; 0.982 .. 0.998.
}

export function hexToRgb(hex: string): [number, number, number] {
  if (!hex.startsWith("#")) return [0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
