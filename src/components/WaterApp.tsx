import { useEffect, useRef, useState } from "react";
import { WaterSim } from "@/lib/water/sim";
import { WaterRenderer } from "@/lib/water/renderer";
import { Tilt } from "@/lib/water/tilt";
import { drawSurface, drawUnder, isFloating, makeThing, updateThings, type Kind, type World } from "@/lib/water/objects";
import {
  BACKGROUNDS,
  GLOWS,
  LIQUIDS,
  SETTINGS_HOLD_MS,
  dampingFor,
  hexToRgb,
  loadSettings,
  saveSettings,
  type Settings,
} from "@/lib/water/settings";
import { SettingsPanel } from "./SettingsPanel";
import { Button } from "./ui/button";

export function WaterApp() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [hold, setHold] = useState(0);
  const [failed, setFailed] = useState(false);
  const engine = useRef<{
    add: (k: Kind) => void;
    clear: () => void;
    tilt: Tilt;
  } | null>(null);

  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    setSettings(s);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...(prev as Settings), ...patch };
      settingsRef.current = next;
      saveSettings(next);
      return next;
    });
  };

  useEffect(() => {
    const glc = glRef.current;
    const top = topRef.current;
    if (!glc || !top) return;
    let renderer: WaterRenderer;
    try {
      renderer = new WaterRenderer(glc);
    } catch {
      setFailed(true);
      return;
    }
    const topCtx = top.getContext("2d");
    const under = document.createElement("canvas");
    const underCtx = under.getContext("2d");
    if (!topCtx || !underCtx) { setFailed(true); return; }
    const tilt = new Tilt();
    tilt.start();

    let sim = new WaterSim(2, 2);
    const world: World = { things: [], width: 1, height: 1, cell: 1, tilt: tilt.value, touches: [] };
    let dpr = 1;
    let underScale = 1;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cell = Math.max(w, h) / 420;
      const sw = Math.max(8, Math.round(w / cell));
      const shh = Math.max(8, Math.round(h / cell));
      const old = sim;
      sim = new WaterSim(sw, shh);
      if (old.w === sw && old.h === shh) {
        sim.cur.set(old.cur);
        sim.prev.set(old.prev);
      }
      world.width = w;
      world.height = h;
      world.cell = w / sw;
      renderer.resize(Math.round(w * dpr), Math.round(h * dpr), sw, shh);
      top.width = Math.round(w * dpr);
      top.height = Math.round(h * dpr);
      underScale = Math.min(dpr, 1.25);
      under.width = Math.round(w * underScale);
      under.height = Math.round(h * underScale);
      for (const t of world.things) {
        t.x = Math.min(w - t.r, t.x);
        t.y = Math.min(h - t.r, t.y);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const objScale = () => Math.max(0.8, Math.min(1.6, Math.min(world.width, world.height) / 390));

    const add = (k: Kind) => {
      const m = 60;
      const x = m + Math.random() * (world.width - 2 * m);
      const y = m + Math.random() * (world.height - 2 * m);
      const t = makeThing(k, x, y, objScale());
      world.things.push(t);
      const big = k === "fish" ? 2.5 : k === "pebble" ? 5 : 7;
      sim.disturb(x / world.cell, y / world.cell, Math.max(5.5, (t.r / world.cell) * 1.65), -big * 1.45);
      if (world.things.length > 40) world.things.shift();
    };
    const clear = () => {
      world.things = [];
    };
    engine.current = { add, clear, tilt };

    // Pointers
    const pointers = new Map<number, { x: number; y: number; t: number; grab: number | null }>();
    const toSim = (v: number) => v / world.cell;
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const x = e.clientX;
      const y = e.clientY;
      let grab: number | null = null;
      for (let i = world.things.length - 1; i >= 0; i--) {
        const t = world.things[i];
        if (!t) continue;
        if (isFloating(t.kind) && t.grabbed === null && Math.hypot(t.x - x, t.y - y) < t.r * 1.3) {
          t.grabbed = e.pointerId;
          t.vx = t.vy = 0;
          grab = t.id;
          break;
        }
      }
      pointers.set(e.pointerId, { x, y, t: performance.now(), grab });
      if (grab === null) sim.disturb(toSim(x), toSim(y), 8.5, -7.5);
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const x = e.clientX;
      const y = e.clientY;
      const now = performance.now();
      const dt = Math.max(1, now - p.t) / 1000;
      if (p.grab !== null) {
        const t = world.things.find((o) => o.id === p.grab);
        if (t) {
          t.vx = t.vx * 0.5 + ((x - t.x) / dt) * 0.5;
          t.vy = t.vy * 0.5 + ((y - t.y) / dt) * 0.5;
          t.x = x;
          t.y = y;
          const sp = Math.hypot(t.vx, t.vy);
          if (sp > 10) t.angle = Math.atan2(t.vy, t.vx);
        }
      } else {
        const dx = x - p.x;
        const dy = y - p.y;
        const dist = Math.hypot(dx, dy);
        const stepPx = world.cell * 1.5;
        const n = Math.max(1, Math.ceil(dist / stepPx));
        const speed = dist / dt;
        const s = -Math.min(3.2, 0.4 + speed * 0.0017);
        for (let i = 1; i <= n; i++) {
          const f = i / n;
          sim.disturb(toSim(p.x + dx * f), toSim(p.y + dy * f), 6.2, s / Math.sqrt(n) * 2.0);
        }
      }
      p.x = x;
      p.y = y;
      p.t = now;
    };
    const onUp = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (p?.grab !== null && p) {
        const t = world.things.find((o) => o.id === p.grab);
        if (t) {
          t.grabbed = null;
          // set down: a splash
          sim.disturb(toSim(t.x), toSim(t.y), Math.max(6, (t.r / world.cell) * 1.5), -6.2);
        }
      }
      pointers.delete(e.pointerId);
    };
    glc.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", noMenu);

    // Loop
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastPlane = { x: 0, y: 0 };
    const start = last;
    const frame = (now: number) => {
      const s = settingsRef.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (s) {
        tilt.update(dt, s.tiltZero, s.tiltOn);
        sim.damping = dampingFor(s.waveLife);

        // Tilt the resting surface: the water sloshes toward the low side.
        const PK = 0.035;
        const px = tilt.value.x * PK;
        const py = tilt.value.y * PK;
        const ddx = Math.max(-0.004, Math.min(0.004, px - lastPlane.x));
        const ddy = Math.max(-0.004, Math.min(0.004, py - lastPlane.y));
        if (Math.abs(ddx) + Math.abs(ddy) > 1e-5) {
          sim.shiftPlane(ddx, ddy);
          lastPlane = { x: lastPlane.x + ddx, y: lastPlane.y + ddy };
        }

        world.touches = [...pointers.values()].filter((p) => p.grab === null);
        updateThings(world, sim, dt);

        acc += dt * 60 * s.waveSpeed;
        let steps = 0;
        while (acc >= 1 && steps < 8) {
          sim.step();
          acc -= 1;
          steps++;
        }
        if (acc > 1) acc = 0;

        const hasUnder = world.things.some((t) => !isFloating(t.kind));
        if (hasUnder) {
          drawUnder(underCtx, world.things, underScale);
          renderer.uploadObjects(under);
        } else renderer.uploadObjects(null);
        drawSurface(topCtx, world.things, dpr);

        const liq = LIQUIDS[s.liquid] ?? { hex: "transparent" };
        renderer.draw({
          height: sim.cur,
          bg: hexToRgb(BACKGROUNDS[s.bg]?.hex ?? "#0a0a14"),
          liquid: liq.hex === "transparent" ? [0, 0, 0] : hexToRgb(liq.hex),
          liquidAmt: liq.hex === "transparent" ? 0 : 0.42,
          glow: hexToRgb(GLOWS[s.glowColor]?.hex ?? "#36f1cd"),
          glowAmt: s.glowOn ? s.glowAmount * 1.65 : 0,
          time: (now - start) / 1000,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Keep the screen on
    let lock: { release: () => Promise<void> } | null = null;
    const wake = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === "visible") lock = await nav.wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    };
    wake();
    document.addEventListener("visibilitychange", wake);

    return () => {
      cancelAnimationFrame(raf);
      tilt.stop();
      window.removeEventListener("resize", resize);
      glc.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("contextmenu", noMenu);
      document.removeEventListener("visibilitychange", wake);
      lock?.release().catch(() => {});
    };
  }, []);

  // Long-press corner to open settings
  const holdTimer = useRef<number | null>(null);
  const startHold = (e: React.PointerEvent) => {
    e.stopPropagation();
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / SETTINGS_HOLD_MS);
      setHold(p);
      if (p >= 1) {
        holdTimer.current = null;
        setHold(0);
        setOpen(true);
        return;
      }
      holdTimer.current = requestAnimationFrame(tick);
    };
    holdTimer.current = requestAnimationFrame(tick);
  };
  const endHold = () => {
    if (holdTimer.current) cancelAnimationFrame(holdTimer.current);
    holdTimer.current = null;
    setHold(0);
  };

  const begin = async () => {
    setStarted(true);
    void Tilt.requestPermission();
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* ignore */
    }
    setStarted(true);
  };

  return (
    <div className="water-stage">
      <canvas ref={glRef} className="water-layer" />
      <canvas ref={topRef} className="water-layer pointer-events-none" />

      <div
        className="corner-hold"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onPointerLeave={endHold}
        aria-label="Beállítások: tartsd nyomva 3 másodpercig"
      >
        {hold > 0 && (
          <svg viewBox="0 0 40 40" className="h-11 w-11">
            <circle cx="20" cy="20" r="16" className="hold-track" />
            <circle
              cx="20"
              cy="20"
              r="16"
              className="hold-ring"
              strokeDasharray={100.5}
              strokeDashoffset={100.5 * (1 - hold)}
            />
          </svg>
        )}
      </div>

      {failed && (
        <div className="welcome-veil">
          <div className="glass-card">
            <p className="text-lg">Ez a készülék sajnos nem tudja megjeleníteni a vizet.</p>
          </div>
        </div>
      )}

      {!started && !failed && (
        <div className="welcome-veil">
          <div className="glass-card max-w-sm text-center">
            <h1 className="font-display text-4xl text-primary text-glow">Víztükör</h1>
            <p className="mt-3 text-muted-foreground">
              Érintsd meg a vizet, és nézd, ahogy fodrozódik. A beállításokhoz tartsd nyomva a{" "}
              <b className="text-foreground">jobb felső sarkot</b> 3 másodpercig.
            </p>
            <Button onClick={begin} className="btn-neon mt-6 w-full">
              Kezdjük!
            </Button>
          </div>
        </div>
      )}

      {open && settings && (
        <SettingsPanel
          settings={settings}
          onChange={update}
          onAdd={(k) => engine.current?.add(k)}
          onClear={() => engine.current?.clear()}
          onLevel={() => {
            const t = engine.current?.tilt;
            if (t) update({ tiltZero: { ...t.raw } });
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
