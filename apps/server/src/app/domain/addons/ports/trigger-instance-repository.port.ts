export interface TriggerInstanceRow {
  id: string;
  orgId: string;
  addonId: string;
  triggerId: string;
  label: string;
  configJson: string;
  targetJson: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerInstancePatch {
  label?: string;
  configJson?: string;
  targetJson?: string;
  enabled?: boolean;
}

export abstract class TriggerInstanceRepositoryPort {
  abstract list(orgId: string, addonId?: string): TriggerInstanceRow[];

  abstract find(orgId: string, instanceId: string): TriggerInstanceRow | null;

  abstract create(row: TriggerInstanceRow): TriggerInstanceRow;

  abstract update(orgId: string, instanceId: string, patch: TriggerInstancePatch): void;

  abstract remove(orgId: string, instanceId: string): void;

  abstract removeAddon(orgId: string, addonId: string): void;

  abstract recordFire(instanceId: string, runKey: string, firedAt: number): boolean;

  abstract cleanupFires(olderThan: number): void;
}
