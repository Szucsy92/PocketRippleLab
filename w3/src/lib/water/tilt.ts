/** Reads device tilt as a gravity vector in screen space (-1..1 per axis). */
export class Tilt {
  raw = { x: 0, y: 0 };
  value = { x: 0, y: 0 };
  available = false;
  private handler = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    this.available = true;
    const b = (Math.max(-90, Math.min(90, e.beta)) * Math.PI) / 180;
    const g = (Math.max(-90, Math.min(90, e.gamma)) * Math.PI) / 180;
    let x = Math.sin(g);
    let y = Math.sin(b);
    const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    if (angle === 90) [x, y] = [y, -x];
    else if (angle === -90 || angle === 270) [x, y] = [-y, x];
    else if (angle === 180) [x, y] = [-x, -y];
    this.raw = { x, y };
  };

  start() {
    window.addEventListener("deviceorientation", this.handler);
  }
  stop() {
    window.removeEventListener("deviceorientation", this.handler);
  }

  /** iOS needs an explicit permission from a tap. */
  static async requestPermission() {
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceOrientationEvent;
    if (D?.requestPermission) {
      try {
        await D.requestPermission();
      } catch {
        /* ignore */
      }
    }
  }

  update(dt: number, zero: { x: number; y: number }, enabled: boolean) {
    const tx = enabled ? this.raw.x - zero.x : 0;
    const ty = enabled ? this.raw.y - zero.y : 0;
    const k = Math.min(1, dt * 8);
    this.value.x += (tx - this.value.x) * k;
    this.value.y += (ty - this.value.y) * k;
  }
}
