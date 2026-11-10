import type { Database } from 'bun:sqlite';
import type {
  OrgAddonHealth,
  OrgAddonRow,
} from '../../domain/addons/ports/org-addon-repository.port.ts';

interface OrgAddonsRecord {
  org_id: string;
  addon_id: string;
  version: string;
  enabled: number;
  grants_json: string;
  grants_digest: string;
  config_json: string;
  health: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class OrgAddonStore {
  constructor(private readonly db: Database) {}

  list(orgId: string): OrgAddonRow[] {
    return (
      this.db
        .query('SELECT * FROM org_addons WHERE org_id = ? ORDER BY addon_id')
        .all(orgId) as OrgAddonsRecord[]
    ).map(toRow);
  }

  listAll(): OrgAddonRow[] {
    return (
      this.db.query('SELECT * FROM org_addons ORDER BY org_id, addon_id').all() as OrgAddonsRecord[]
    ).map(toRow);
  }

  find(orgId: string, addonId: string): OrgAddonRow | null {
    const row = this.db
      .query('SELECT * FROM org_addons WHERE org_id = ? AND addon_id = ?')
      .get(orgId, addonId) as OrgAddonsRecord | null;
    return row ? toRow(row) : null;
  }

  upsert(row: OrgAddonRow): void {
    this.db
      .query(
        `INSERT INTO org_addons
           (org_id, addon_id, version, enabled, grants_json, grants_digest, config_json,
            health, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (org_id, addon_id) DO UPDATE SET
           version = excluded.version,
           enabled = excluded.enabled,
           grants_json = excluded.grants_json,
           grants_digest = excluded.grants_digest,
           config_json = excluded.config_json,
           health = excluded.health,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
      )
      .run(
        row.orgId,
        row.addonId,
        row.version,
        row.enabled ? 1 : 0,
        row.grantsJson,
        row.grantsDigest,
        row.configJson,
        row.health,
        row.lastError,
        row.createdAt,
        row.updatedAt,
      );
  }

  setEnabled(orgId: string, addonId: string, enabled: boolean): void {
    this.db
      .query(
        `UPDATE org_addons SET enabled = ?, updated_at = ?
         WHERE org_id = ? AND addon_id = ?`,
      )
      .run(enabled ? 1 : 0, new Date().toISOString(), orgId, addonId);
  }

  updateGrants(orgId: string, addonId: string, grantsJson: string, grantsDigest: string): void {
    this.db
      .query(
        `UPDATE org_addons SET grants_json = ?, grants_digest = ?, updated_at = ?
         WHERE org_id = ? AND addon_id = ?`,
      )
      .run(grantsJson, grantsDigest, new Date().toISOString(), orgId, addonId);
  }

  updateConfig(orgId: string, addonId: string, configJson: string): void {
    this.db
      .query(
        `UPDATE org_addons SET config_json = ?, updated_at = ?
         WHERE org_id = ? AND addon_id = ?`,
      )
      .run(configJson, new Date().toISOString(), orgId, addonId);
  }

  updateHealth(
    orgId: string,
    addonId: string,
    health: OrgAddonHealth,
    lastError?: string | null,
  ): void {
    this.db
      .query(
        `UPDATE org_addons SET health = ?, last_error = ?, updated_at = ?
         WHERE org_id = ? AND addon_id = ?`,
      )
      .run(health, lastError ?? null, new Date().toISOString(), orgId, addonId);
  }

  remove(orgId: string, addonId: string): void {
    this.db.query('DELETE FROM org_addons WHERE org_id = ? AND addon_id = ?').run(orgId, addonId);
  }
}

function toRow(record: OrgAddonsRecord): OrgAddonRow {
  return {
    orgId: record.org_id,
    addonId: record.addon_id,
    version: record.version,
    enabled: record.enabled === 1,
    grantsJson: record.grants_json,
    grantsDigest: record.grants_digest,
    configJson: record.config_json,
    health: record.health as OrgAddonHealth,
    lastError: record.last_error,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
