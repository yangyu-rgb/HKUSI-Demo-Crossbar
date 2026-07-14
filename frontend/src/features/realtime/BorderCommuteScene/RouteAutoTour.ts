export class RouteAutoTour {
  private index = -1;
  private nextChangeAt = 0;
  private pausedUntil = 0;
  enabled = true;

  constructor(
    private readonly routeIds: string[],
    private readonly onFocus: (routeId: string | null) => void,
    private readonly initialDelay = 2800,
    private readonly routeDuration = 5200,
  ) {}

  start(now: number): void {
    this.nextChangeAt = now + this.initialDelay;
  }

  update(now: number): void {
    if (!this.enabled || now < this.pausedUntil || now < this.nextChangeAt || this.routeIds.length === 0) return;
    this.index += 1;
    if (this.index >= this.routeIds.length) {
      this.index = -1;
      this.onFocus(null);
      this.nextChangeAt = now + this.initialDelay;
      return;
    }
    this.onFocus(this.routeIds[this.index]);
    this.nextChangeAt = now + this.routeDuration;
  }

  pauseFor(durationMs: number, now = performance.now()): void {
    this.pausedUntil = Math.max(this.pausedUntil, now + durationMs);
  }

  isPaused(now = performance.now()): boolean {
    return this.enabled && now < this.pausedUntil;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.index = -1;
      this.pausedUntil = 0;
      this.nextChangeAt = performance.now() + this.initialDelay;
    } else {
      this.pausedUntil = 0;
      this.onFocus(null);
    }
  }
}
