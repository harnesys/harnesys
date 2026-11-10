export type InstanceState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'failed'
  | 'quarantined';

export type EnsureRunReason = string;

export interface InstanceSnapshot {
  orgId: string;
  addonId: string;
  generation: number;
  state: InstanceState;
  pid?: number;
  startedAt?: string;
  lastError?: string;
  lastExitReason?: string;
  restarts: number;
}

export abstract class InstanceSupervisorPort {
  abstract ensureRunning(
    orgId: string,
    addonId: string,
    reason: EnsureRunReason,
  ): Promise<InstanceSnapshot>;

  abstract stop(orgId: string, addonId: string, reason?: string): Promise<void>;

  abstract restart(orgId: string, addonId: string, reason?: string): Promise<InstanceSnapshot>;

  abstract snapshot(orgId: string, addonId: string): InstanceSnapshot | null;

  abstract mirrorHealth(
    orgId: string,
    addonId: string,
    state: 'stopped' | 'running' | 'failed' | 'quarantined',
    lastError?: string | null,
  ): void;
}
