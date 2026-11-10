import type { ClockPort } from '../../../domain/apps/ports/clock.port.ts';

export class CrashBreaker {
  private times: number[] = [];

  constructor(
    private readonly clock: ClockPort,
    private readonly windowMs: number,
    private readonly threshold: number,
  ) {}

  recordCrash(): boolean {
    const now = this.clock.now();
    this.times = [...this.times.filter((time) => now - time < this.windowMs), now];
    return this.times.length > this.threshold;
  }

  reset(): void {
    this.times = [];
  }

  get crashesInWindow(): number {
    return this.times.length;
  }
}

export function backoffDelayMs(restarts: number, initialMs: number, maxMs: number): number {
  const base = Math.min(maxMs, initialMs * 2 ** Math.max(0, restarts - 1));
  return Math.round(base * (1 + Math.random() * 0.25));
}
