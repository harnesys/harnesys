import type { Database } from 'bun:sqlite';
import type { AddonBindingRow } from '../../domain/addons/ports/binding-repository.port.ts';

interface AddonBindingsRecord {
  org_id: string;
  addon_id: string;
  connection_id: string;
  account_id: string;
  created_at: string;
}

export class AddonBindingStore {
  constructor(private readonly db: Database) {}

  list(orgId: string, addonId?: string): AddonBindingRow[] {
    if (addonId === undefined) {
      const records = this.db
        .query('SELECT * FROM addon_bindings WHERE org_id = ? ORDER BY addon_id, connection_id')
        .all(orgId) as AddonBindingsRecord[];
      return records.map(toRow);
    }
    const records = this.db
      .query(
        'SELECT * FROM addon_bindings WHERE org_id = ? AND addon_id = ? ORDER BY connection_id',
      )
      .all(orgId, addonId) as AddonBindingsRecord[];
    return records.map(toRow);
  }

  accountsFor(orgId: string, addonId: string, connectionId: string): AddonBindingRow[] {
    const records = this.db
      .query(
        `SELECT * FROM addon_bindings
         WHERE org_id = ? AND addon_id = ? AND connection_id = ?
         ORDER BY account_id`,
      )
      .all(orgId, addonId, connectionId) as AddonBindingsRecord[];
    return records.map(toRow);
  }

  byAccount(orgId: string, accountId: string): AddonBindingRow[] {
    const records = this.db
      .query(
        `SELECT * FROM addon_bindings
         WHERE org_id = ? AND account_id = ?
         ORDER BY addon_id, connection_id`,
      )
      .all(orgId, accountId) as AddonBindingsRecord[];
    return records.map(toRow);
  }

  add(row: AddonBindingRow): void {
    this.db
      .query(
        `INSERT OR IGNORE INTO addon_bindings
           (org_id, addon_id, connection_id, account_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(row.orgId, row.addonId, row.connectionId, row.accountId, row.createdAt);
  }

  remove(orgId: string, addonId: string, connectionId: string, accountId: string): void {
    this.db
      .query(
        `DELETE FROM addon_bindings
         WHERE org_id = ? AND addon_id = ? AND connection_id = ? AND account_id = ?`,
      )
      .run(orgId, addonId, connectionId, accountId);
  }

  setBindings(
    orgId: string,
    addonId: string,
    connectionId: string,
    accountIds: readonly string[],
  ): void {
    const tx = this.db.transaction(() => {
      const existing = this.accountsFor(orgId, addonId, connectionId);
      const keep = new Set(accountIds);
      for (const row of existing) {
        if (!keep.has(row.accountId)) {
          this.remove(orgId, addonId, connectionId, row.accountId);
        }
      }
      for (const accountId of accountIds) {
        this.add({
          orgId,
          addonId,
          connectionId,
          accountId,
          createdAt: new Date().toISOString(),
        });
      }
    });
    tx.immediate();
  }

  removeAddon(orgId: string, addonId: string): void {
    this.db
      .query('DELETE FROM addon_bindings WHERE org_id = ? AND addon_id = ?')
      .run(orgId, addonId);
  }
}

function toRow(record: AddonBindingsRecord): AddonBindingRow {
  return {
    orgId: record.org_id,
    addonId: record.addon_id,
    connectionId: record.connection_id,
    accountId: record.account_id,
    createdAt: record.created_at,
  };
}
