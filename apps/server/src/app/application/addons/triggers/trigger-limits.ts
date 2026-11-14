export interface TriggerLimits {
  perDay?: number;
  throttleSec?: number;
  maxBurst?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BURST_WINDOW_MS = 1000;

import { Injectable } from '@harnesys/brix';

@Injectable()
export class FireWindowTracker {
  private readonly fires = new Map<string, number[]>();

  allow(instanceId: string, limits: TriggerLimits, now: number): boolean {
    const history = this.prune(this.fires.get(instanceId) ?? [], now);
    if (limits.perDay !== undefined) {
      const perDay = history.filter((at) => at > now - DAY_MS).length;
      if (perDay >= limits.perDay) {
        this.fires.set(instanceId, history);
        return false;
      }
    }
    if (limits.throttleSec !== undefined) {
      const last = history.at(-1);
      if (last !== undefined && last > now - limits.throttleSec * 1000) {
        this.fires.set(instanceId, history);
        return false;
      }
    }
    if (limits.maxBurst !== undefined) {
      const burst = history.filter((at) => at > now - BURST_WINDOW_MS).length;
      if (burst >= limits.maxBurst) {
        this.fires.set(instanceId, history);
        return false;
      }
    }
    this.fires.set(instanceId, [...history, now]);
    return true;
  }

  private prune(history: number[], now: number): number[] {
    return history.filter((at) => at > now - DAY_MS * 2);
  }
}
