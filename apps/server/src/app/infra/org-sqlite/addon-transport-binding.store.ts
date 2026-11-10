import type { Database } from 'bun:sqlite';
import type { AddonTransportBindingRow } from '../../domain/addons/ports/transport-binding-repository.port.ts';

interface AddonTransportBindingRecord {
  org_id: string;
  addon_id: string;
  provider: string;
  external_chat_id: string;
  thread_id: string;
  created_at: string;
}

export class AddonTransportBindingStore {
  constructor(private readonly db: Database) {}

  find(
    orgId: string,
    addonId: string,
    provider: string,
    externalChatId: string,
  ): AddonTransportBindingRow | null {
    const row = this.db
      .query(
        `SELECT * FROM addon_transport_bindings
         WHERE org_id = ? AND addon_id = ? AND provider = ? AND external_chat_id = ?`,
      )
      .get(orgId, addonId, provider, externalChatId) as AddonTransportBindingRecord | null;
    return row ? toRow(row) : null;
  }

  add(row: AddonTransportBindingRow): void {
    this.db
      .query(
        `INSERT INTO addon_transport_bindings
           (org_id, addon_id, provider, external_chat_id, thread_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (org_id, addon_id, provider, external_chat_id) DO UPDATE SET
           thread_id = excluded.thread_id`,
      )
      .run(row.orgId, row.addonId, row.provider, row.externalChatId, row.threadId, row.createdAt);
  }

  remove(orgId: string, addonId: string, provider: string, externalChatId: string): void {
    this.db
      .query(
        `DELETE FROM addon_transport_bindings
         WHERE org_id = ? AND addon_id = ? AND provider = ? AND external_chat_id = ?`,
      )
      .run(orgId, addonId, provider, externalChatId);
  }

  removeAddon(orgId: string, addonId: string): void {
    this.db
      .query('DELETE FROM addon_transport_bindings WHERE org_id = ? AND addon_id = ?')
      .run(orgId, addonId);
  }
}

function toRow(record: AddonTransportBindingRecord): AddonTransportBindingRow {
  return {
    orgId: record.org_id,
    addonId: record.addon_id,
    provider: record.provider,
    externalChatId: record.external_chat_id,
    threadId: record.thread_id,
    createdAt: record.created_at,
  };
}
