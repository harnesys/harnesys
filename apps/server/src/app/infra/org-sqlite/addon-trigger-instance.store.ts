import type { Database } from 'bun:sqlite';
import type {
  TriggerInstancePatch,
  TriggerInstanceRow,
} from '../../domain/addons/ports/trigger-instance-repository.port.ts';

interface TriggerInstancesRecord {
  id: string;
  org_id: string;
  addon_id: string;
  trigger_id: string;
  label: string;
  config_json: string;
  target_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface TriggerFiresRecord {
  instance_id: string;
  run_key: string;
  fired_at: number;
}

export class AddonTriggerInstanceStore {
  constructor(private readonly db: Database) {}

  list(orgId: string, addonId?: string): TriggerInstanceRow[] {
    if (addonId === undefined) {
      const records = this.db
        .query(
          `SELECT * FROM addon_trigger_instances WHERE org_id = ?
           ORDER BY addon_id, trigger_id, id`,
        )
        .all(orgId) as TriggerInstancesRecord[];
      return records.map(toRow);
    }
    const records = this.db
      .query(
        `SELECT * FROM addon_trigger_instances
         WHERE org_id = ? AND addon_id = ? ORDER BY trigger_id, id`,
      )
      .all(orgId, addonId) as TriggerInstancesRecord[];
    return records.map(toRow);
  }

  find(orgId: string, instanceId: string): TriggerInstanceRow | null {
    const record = this.db
      .query('SELECT * FROM addon_trigger_instances WHERE org_id = ? AND id = ?')
      .get(orgId, instanceId) as TriggerInstancesRecord | null;
    return record ? toRow(record) : null;
  }

  create(row: TriggerInstanceRow): TriggerInstanceRow {
    const effective: TriggerInstanceRow = {
      ...row,
      id: instanceKey(row.orgId, row.id),
    };
    this.db
      .query(
        `INSERT INTO addon_trigger_instances
           (id, org_id, addon_id, trigger_id, label, config_json, target_json,
            enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        effective.id,
        effective.orgId,
        effective.addonId,
        effective.triggerId,
        effective.label,
        effective.configJson,
        effective.targetJson,
        effective.enabled ? 1 : 0,
        effective.createdAt,
        effective.updatedAt,
      );
    return effective;
  }

  update(orgId: string, instanceId: string, patch: TriggerInstancePatch): void {
    const current = this.find(orgId, instanceId);
    if (!current) {
      return;
    }
    this.db
      .query(
        `UPDATE addon_trigger_instances
         SET label = ?, config_json = ?, target_json = ?, enabled = ?, updated_at = ?
         WHERE org_id = ? AND id = ?`,
      )
      .run(
        patch.label ?? current.label,
        patch.configJson ?? current.configJson,
        patch.targetJson ?? current.targetJson,
        (patch.enabled ?? current.enabled) ? 1 : 0,
        new Date().toISOString(),
        orgId,
        instanceId,
      );
  }

  remove(orgId: string, instanceId: string): void {
    this.db
      .query('DELETE FROM addon_trigger_instances WHERE org_id = ? AND id = ?')
      .run(orgId, instanceId);
  }

  removeAddon(orgId: string, addonId: string): void {
    this.db
      .query('DELETE FROM addon_trigger_instances WHERE org_id = ? AND addon_id = ?')
      .run(orgId, addonId);
  }

  recordFire(instanceId: string, runKey: string, firedAt: number): boolean {
    const result = this.db
      .query(
        `INSERT OR IGNORE INTO addon_trigger_fires (instance_id, run_key, fired_at)
         VALUES (?, ?, ?)`,
      )
      .run(instanceId, runKey, firedAt);
    return result.changes === 1;
  }

  cleanupFires(olderThan: number): void {
    this.db.query('DELETE FROM addon_trigger_fires WHERE fired_at < ?').run(olderThan);
  }

  listFires(instanceId: string): Array<{ runKey: string; firedAt: number }> {
    return (
      this.db
        .query(
          'SELECT run_key, fired_at FROM addon_trigger_fires WHERE instance_id = ? ORDER BY run_key',
        )
        .all(instanceId) as TriggerFiresRecord[]
    ).map((record) => ({ runKey: record.run_key, firedAt: record.fired_at }));
  }
}

function toRow(record: TriggerInstancesRecord): TriggerInstanceRow {
  return {
    id: record.id,
    orgId: record.org_id,
    addonId: record.addon_id,
    triggerId: record.trigger_id,
    label: record.label,
    configJson: record.config_json,
    targetJson: record.target_json,
    enabled: record.enabled === 1,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function instanceKey(orgId: string, instanceId: string): string {
  const prefix = `${orgId}/`;
  return instanceId.startsWith(prefix) ? instanceId : `${prefix}${instanceId}`;
}

export function orgIdOfInstanceKey(instanceId: string): string | null {
  const separator = instanceId.indexOf('/');
  return separator > 0 ? instanceId.slice(0, separator) : null;
}
