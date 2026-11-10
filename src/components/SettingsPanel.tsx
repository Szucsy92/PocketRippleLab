import type { ReactNode } from "react";
import { BACKGROUNDS, GLOWS, LIQUIDS, type Settings, type Swatch } from "@/lib/water/settings";
import type { Kind } from "@/lib/water/objects";

const THINGS: { kind: Kind; label: string; icon: string }[] = [
  { kind: "duck", label: "Kacsa", icon: "🦆" },
  { kind: "boat", label: "Hajó", icon: "⛵" },
  { kind: "fish", label: "Hal", icon: "🐟" },
  { kind: "ball", label: "Golyó", icon: "🔮" },
  { kind: "pebble", label: "Kavics", icon: "🪨" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-sm tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Swatches({ list, value, onPick }: { list: Swatch[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="flex gap-3">
      {list.map((s, i) => (
        <button
          key={s.name}
          onClick={() => onPick(i)}
          className="swatch"
          data-active={value === i}
          data-clear={s.hex === "transparent"}
          style={s.hex === "transparent" ? undefined : { background: s.hex }}
          aria-label={s.name}
          title={s.name}
        />
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="toggle-row" onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span>{label}</span>
      <span className="toggle" data-on={on}>
        <span />
      </span>
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm">{label}</span>
      <input type="range" className="neon-range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function SettingsPanel(props: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onAdd: (k: Kind) => void;
  onClear: () => void;
  onLevel: () => void;
  onClose: () => void;
}) {
  const { settings: s, onChange } = props;
  return (
    <div className="sheet-veil" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-primary text-glow">Beállítások</h2>
          <button onClick={props.onClose} className="btn-ghost">Kész</button>
        </div>

        <Section title="Tegyél valamit a vízbe">
          <div className="grid grid-cols-5 gap-2">
            {THINGS.map((t) => (
              <button key={t.kind} className="thing-btn" onClick={() => props.onAdd(t.kind)}>
                <span className="text-2xl">{t.icon}</span>
                <span className="text-xs">{t.label}</span>
              </button>
            ))}
          </div>
          <button className="btn-ghost w-full" onClick={props.onClear}>Mindent kiveszek</button>
        </Section>

        <Section title="Háttér">
          <Swatches list={BACKGROUNDS} value={s.bg} onPick={(i) => onChange({ bg: i })} />
        </Section>

        <Section title="Folyadék">
          <Swatches list={LIQUIDS} value={s.liquid} onPick={(i) => onChange({ liquid: i })} />
        </Section>

        <Section title="Ragyogás">
          <Toggle label="Ragyogó hullámok" on={s.glowOn} onChange={(v) => onChange({ glowOn: v })} />
          {s.glowOn && (
            <>
              <Slider label="Erősség" value={s.glowAmount} min={0.05} max={1} step={0.05} onChange={(v) => onChange({ glowAmount: v })} />
              <Swatches list={GLOWS} value={s.glowColor} onPick={(i) => onChange({ glowColor: i })} />
            </>
          )}
        </Section>

        <Section title="Hullámok">
          <Slider label="Sebesség" value={s.waveSpeed} min={1} max={3} step={0.25} onChange={(v) => onChange({ waveSpeed: v })} />
          <Slider label="Meddig hullámzik" value={s.waveLife} min={0} max={1} step={0.05} onChange={(v) => onChange({ waveLife: v })} />
        </Section>

        <Section title="Döntés">
          <Toggle label="A telefon döntése mozgatja a vizet" on={s.tiltOn} onChange={(v) => onChange({ tiltOn: v })} />
          <button className="btn-ghost w-full" onClick={props.onLevel}>A mostani helyzet legyen a vízszintes</button>
        </Section>

        <Section title="Gyerekzár">
          <button className="btn-neon w-full" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            Teljes képernyő
          </button>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><b className="text-foreground">iPhone:</b> Beállítások → Kisegítő lehetőségek → Irányított hozzáférés bekapcsolása. Az appban nyomd meg háromszor az oldalsó gombot.</p>
            <p><b className="text-foreground">Android:</b> Beállítások → Biztonság → Alkalmazás rögzítése. Majd az alkalmazásváltóban rögzítsd ezt az appot.</p>
            <p>Tipp: a böngésző Megosztás menüjében a „Hozzáadás a kezdőképernyőhöz” után saját ikonról indul.</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
