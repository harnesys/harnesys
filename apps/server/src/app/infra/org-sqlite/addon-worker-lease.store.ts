import type { Database } from 'bun:sqlite';
import type {
  WorkerLeaseClaim,
  WorkerLeaseRelease,
  WorkerLeaseState,
} from '../../domain/addons/ports/worker-lease.port.ts';

interface LeaseRecord {
  holder_id: string;
  epoch: number;
  expires_at: string;
}

export class AddonWorkerLeaseStore {
  constructor(private readonly db: Database) {}

  claim(input: WorkerLeaseClaim): WorkerLeaseState {
    const nowIso = new Date(input.nowMs).toISOString();
    const expiresAt = new Date(input.nowMs + input.ttlMs).toISOString();
    const existing = this.find(input.orgId, input.addonId, input.workerId);
    if (
      existing !== null &&
      existing.expires_at > nowIso &&
      existing.holder_id !== input.holderId
    ) {
      return { held: false, epoch: existing.epoch, expiresAt: existing.expires_at };
    }
    const epoch = existing === null ? 1 : existing.epoch + 1;
    this.db
      .query(
        `INSERT INTO addon_worker_leases
           (org_id, addon_id, worker_id, holder_id, epoch, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (org_id, addon_id, worker_id) DO UPDATE SET
           holder_id = excluded.holder_id,
           epoch = excluded.epoch,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`,
      )
      .run(input.orgId, input.addonId, input.workerId, input.holderId, epoch, expiresAt, nowIso);
    return { held: true, epoch, expiresAt };
  }

  release(input: WorkerLeaseRelease): boolean {
    const existing = this.find(input.orgId, input.addonId, input.workerId);
    if (existing === null || existing.holder_id !== input.holderId) {
      return false;
    }
    this.db
      .query('DELETE FROM addon_worker_leases WHERE org_id = ? AND addon_id = ? AND worker_id = ?')
      .run(input.orgId, input.addonId, input.workerId);
    return true;
  }

  private find(orgId: string, addonId: string, workerId: string): LeaseRecord | null {
    const row = this.db
      .query(
        `SELECT holder_id, epoch, expires_at FROM addon_worker_leases
         WHERE org_id = ? AND addon_id = ? AND worker_id = ?`,
      )
      .get(orgId, addonId, workerId) as LeaseRecord | null;
    return row;
  }
}
