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
};

export const DEFAULT_SETTINGS: Settings = {
  bg: 0,
  liquid: 0,
  glowOn: true,
  glowAmount: 0.55,
  glowColor: 0,
  waveSpeed: 2,
  waveLife: 0.6,
  tiltOn: true,
  tiltZero: { x: 0, y: 0 },
};

const KEY = "vizjatek-settings-v1";

export function clampSettings(s: Partial<Settings>): Settings {
  const m = { ...DEFAULT_SETTINGS, ...s };
  const idx = (v: number, n: number) => Math.min(n - 1, Math.max(0, Math.round(v || 0)));
  return {
    ...m,
    bg: idx(m.bg, BACKGROUNDS.length),
    liquid: idx(m.liquid, LIQUIDS.length),
    glowColor: idx(m.glowColor, GLOWS.length),
    glowAmount: Math.min(1, Math.max(0, m.glowAmount)),
    waveSpeed: Math.min(3, Math.max(1, m.waveSpeed)),
    waveLife: Math.min(1, Math.max(0, m.waveLife)),
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
  return 0.975 + life * 0.0225; // 0.975 .. 0.9975
}

export function hexToRgb(hex: string): [number, number, number] {
  if (!hex.startsWith("#")) return [0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
