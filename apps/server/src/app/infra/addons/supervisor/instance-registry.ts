import { Injectable } from '@harnesys/brix';
import type {
  InstanceSnapshot,
  InstanceState,
} from '../../../domain/addons/ports/instance-supervisor.port.ts';

export interface InstanceRecord {
  orgId: string;
  addonId: string;
  version: string;
  generation: number;
  state: InstanceState;
  pid?: number;
  startedAt?: string;
  lastError?: string;
  lastExitReason?: string;
  restarts: number;
}

export function instanceKey(orgId: string, addonId: string): string {
  return `${orgId}/${addonId}`;
}

@Injectable()
export class InstanceRegistry {
  private readonly instances = new Map<string, InstanceRecord>();

  get(orgId: string, addonId: string): InstanceRecord | undefined {
    return this.instances.get(instanceKey(orgId, addonId));
  }

  ensure(orgId: string, addonId: string, version: string): InstanceRecord {
    const key = instanceKey(orgId, addonId);
    let record = this.instances.get(key);
    if (!record) {
      record = { orgId, addonId, version, generation: 0, state: 'stopped', restarts: 0 };
      this.instances.set(key, record);
    }
    return record;
  }

  update(
    orgId: string,
    addonId: string,
    patch: Partial<Omit<InstanceRecord, 'orgId' | 'addonId'>>,
  ): InstanceRecord | undefined {
    const record = this.instances.get(instanceKey(orgId, addonId));
    if (!record) {
      return undefined;
    }
    Object.assign(record, patch);
    return record;
  }

  remove(orgId: string, addonId: string): void {
    this.instances.delete(instanceKey(orgId, addonId));
  }

  snapshot(orgId: string, addonId: string): InstanceSnapshot | null {
    const record = this.instances.get(instanceKey(orgId, addonId));
    if (!record) {
      return null;
    }
    const snapshot: InstanceSnapshot = {
      orgId: record.orgId,
      addonId: record.addonId,
      generation: record.generation,
      state: record.state,
      restarts: record.restarts,
    };
    if (record.pid !== undefined) {
      snapshot.pid = record.pid;
    }
    if (record.startedAt !== undefined) {
      snapshot.startedAt = record.startedAt;
    }
    if (record.lastError !== undefined) {
      snapshot.lastError = record.lastError;
    }
    if (record.lastExitReason !== undefined) {
      snapshot.lastExitReason = record.lastExitReason;
    }
    return snapshot;
  }

  all(): InstanceRecord[] {
    return [...this.instances.values()];
  }

  clear(): void {
    this.instances.clear();
  }
}
