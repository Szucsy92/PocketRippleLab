import { Button } from "./ui/button";
import { lightFromDisk, type Settings } from "@/lib/water/settings";

export function WaterLightControls({ settings: s, onChange, onPreview }: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onPreview: (control: "light" | "depth" | null) => void;
}) {
  const moveLight = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onChange({ light: lightFromDisk((e.clientX - rect.left - rect.width / 2) / (rect.width / 2 - 16), (e.clientY - rect.top - rect.height / 2) / (rect.height / 2 - 16)) });
  };
  return (
    <>
      <section className="space-y-3" data-control="light">
        <h3 className="font-display text-sm text-muted-foreground uppercase">Fény iránya</h3>
        <div className="light-layout">
          <Button variant="ghost" className="light-disk live-control" aria-label="Fény iránya" title="Fény iránya"
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onPreview("light"); moveLight(e); }}
            onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) moveLight(e); }}
            onPointerUp={() => onPreview(null)} onPointerCancel={() => onPreview(null)} onLostPointerCapture={() => onPreview(null)}
            onKeyDown={(e) => {
              const arrows: Record<string, [number, number]> = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, -0.05], ArrowDown: [0, 0.05] };
              const delta = arrows[e.key];
              if (!delta) return;
              e.preventDefault();
              onChange({ light: lightFromDisk(s.light.x + delta[0], s.light.y + delta[1]) });
            }}>
            <svg viewBox="0 0 160 160" aria-hidden="true">
              <circle className="disk-orbit" cx="80" cy="80" r="46" />
              <path className="disk-axis" d="M80 12V148M12 80H148" />
              <line className="disk-ray" x1="80" y1="80" x2={80 + s.light.x * 62} y2={80 + s.light.y * 62} />
              <circle className="disk-center" cx="80" cy="80" r="3" />
              <circle className="disk-sun" cx={80 + s.light.x * 62} cy={80 + s.light.y * 62} r="9" />
            </svg>
          </Button>
          <div className="light-values space-y-3">
            <label className="numeric-label">Vízszintes
              <input type="number" min={-1} max={1} step={0.05} aria-label="Fény vízszintes iránya" value={Number(s.light.x.toFixed(2))}
                onChange={(e) => { if (Number.isFinite(e.target.valueAsNumber)) onChange({ light: lightFromDisk(e.target.valueAsNumber, s.light.y) }); }} />
            </label>
            <label className="numeric-label">Függőleges
              <input type="number" min={-1} max={1} step={0.05} aria-label="Fény függőleges iránya" value={Number(s.light.y.toFixed(2))}
                onChange={(e) => { if (Number.isFinite(e.target.valueAsNumber)) onChange({ light: lightFromDisk(s.light.x, e.target.valueAsNumber) }); }} />
            </label>
          </div>
        </div>
      </section>
      <section className="space-y-3" data-control="depth">
        <div className="depth-heading">
          <h3 className="font-display text-sm text-muted-foreground uppercase">Mélység</h3>
          <label className="depth-value"><input aria-label="Mélység százalékban" type="number" min={0} max={100} step={1} value={Math.round(s.depth * 100)}
            onChange={(e) => { if (Number.isFinite(e.target.valueAsNumber)) onChange({ depth: e.target.valueAsNumber / 100 }); }} /><span>%</span></label>
        </div>
        <input className="neon-range live-control" aria-label="Mélység" type="range" min={0} max={1} step={0.01} value={s.depth}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPreview("depth"); }}
          onPointerUp={() => onPreview(null)} onPointerCancel={() => onPreview(null)} onLostPointerCapture={() => onPreview(null)} onBlur={() => onPreview(null)}
          onChange={(e) => onChange({ depth: Number(e.target.value) })} />
      </section>
    </>
  );
}