import type { Database } from 'bun:sqlite';
import type { JobStateRow } from '../../domain/addons/ports/job-state-repository.port.ts';

interface JobStateRecord {
  org_id: string;
  addon_id: string;
  job_id: string;
  next_run_at: number | null;
  last_run_at: number | null;
  last_status: string | null;
  enabled: number;
}

export class AddonJobStateStore {
  constructor(private readonly db: Database) {}

  list(orgId: string, addonId?: string): JobStateRow[] {
    if (addonId === undefined) {
      const records = this.db
        .query('SELECT * FROM addon_job_state WHERE org_id = ? ORDER BY addon_id, job_id')
        .all(orgId) as JobStateRecord[];
      return records.map(toRow);
    }
    const records = this.db
      .query('SELECT * FROM addon_job_state WHERE org_id = ? AND addon_id = ? ORDER BY job_id')
      .all(orgId, addonId) as JobStateRecord[];
    return records.map(toRow);
  }

  listAll(): JobStateRow[] {
    const records = this.db
      .query('SELECT * FROM addon_job_state ORDER BY org_id, addon_id, job_id')
      .all() as JobStateRecord[];
    return records.map(toRow);
  }

  find(orgId: string, addonId: string, jobId: string): JobStateRow | null {
    const record = this.db
      .query('SELECT * FROM addon_job_state WHERE org_id = ? AND addon_id = ? AND job_id = ?')
      .get(orgId, addonId, jobId) as JobStateRecord | null;
    return record ? toRow(record) : null;
  }

  upsert(row: JobStateRow): void {
    this.db
      .query(
        `INSERT INTO addon_job_state
           (org_id, addon_id, job_id, next_run_at, last_run_at, last_status, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (org_id, addon_id, job_id) DO UPDATE SET
           next_run_at = excluded.next_run_at,
           last_run_at = excluded.last_run_at,
           last_status = excluded.last_status,
           enabled = excluded.enabled`,
      )
      .run(
        row.orgId,
        row.addonId,
        row.jobId,
        row.nextRunAt,
        row.lastRunAt,
        row.lastStatus,
        row.enabled ? 1 : 0,
      );
  }

  recordRun(
    orgId: string,
    addonId: string,
    jobId: string,
    ranAt: number,
    status: string | null,
  ): void {
    this.db
      .query(
        `UPDATE addon_job_state
         SET last_run_at = ?, last_status = ?, next_run_at = NULL
         WHERE org_id = ? AND addon_id = ? AND job_id = ?`,
      )
      .run(ranAt, status, orgId, addonId, jobId);
  }

  setEnabled(orgId: string, addonId: string, jobId: string, enabled: boolean): void {
    this.db
      .query(
        `UPDATE addon_job_state SET enabled = ?
         WHERE org_id = ? AND addon_id = ? AND job_id = ?`,
      )
      .run(enabled ? 1 : 0, orgId, addonId, jobId);
  }

  removeAddon(orgId: string, addonId: string): void {
    this.db
      .query('DELETE FROM addon_job_state WHERE org_id = ? AND addon_id = ?')
      .run(orgId, addonId);
  }
}

function toRow(record: JobStateRecord): JobStateRow {
  return {
    orgId: record.org_id,
    addonId: record.addon_id,
    jobId: record.job_id,
    nextRunAt: record.next_run_at,
    lastRunAt: record.last_run_at,
    lastStatus: record.last_status,
    enabled: record.enabled === 1,
  };
}
