import type { RainMode } from "./settings";

/** Silent rainfall: interaction adds intensity, then relaxes back to drizzle. */
export class Rainfall {
  intensity = 0;
  private budget = 0;

  touch(amount = 0.1) {
    this.intensity = Math.min(1, this.intensity + amount);
  }

  rate(mode: RainMode, touching: boolean) {
    if (mode === "touch" && !touching) return 0;
    return (mode === "auto" ? 5 : 8) + this.intensity * 32;
  }

  step(dt: number, mode: RainMode, touching: boolean) {
    if (touching) this.touch(dt * 0.3);
    else this.intensity *= Math.exp(-dt * 0.65);
    this.budget += this.rate(mode, touching) * dt;
    const drops = Math.floor(this.budget);
    this.budget -= drops;
    return drops;
  }

  reset() { this.intensity = 0; this.budget = 0; }
}