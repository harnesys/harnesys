import type { Database } from 'bun:sqlite';
import type {
  TransportSessionPatch,
  TransportSessionRow,
  TransportSessionStatus,
} from '../../domain/addons/transport-session.ts';

const OUTBOUND_KEEP = 256;

interface SessionRecord {
  org_id: string;
  addon_id: string;
  provider: string;
  external_chat_id: string;
  thread_id: string;
  run_id: string;
  draft: string;
  last_seq: number;
  message_id: string | null;
  status: TransportSessionStatus;
  ask_id: string | null;
  ask_options_json: string | null;
  created_at: string;
  updated_at: string;
}

export class AddonTransportSessionStore {
  constructor(private readonly db: Database) {}

  find(
    orgId: string,
    threadId: string,
    runId: string,
    addonId: string,
  ): TransportSessionRow | null {
    const row = this.db
      .query(
        `SELECT * FROM addon_transport_sessions
         WHERE org_id = ? AND thread_id = ? AND run_id = ? AND addon_id = ?`,
      )
      .get(orgId, threadId, runId, addonId) as SessionRecord | null;
    return row ? toRow(row) : null;
  }

  findParked(orgId: string, addonId: string, externalChatId: string): TransportSessionRow | null {
    const row = this.db
      .query(
        `SELECT * FROM addon_transport_sessions
         WHERE org_id = ? AND addon_id = ? AND external_chat_id = ? AND status = 'parked'
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(orgId, addonId, externalChatId) as SessionRecord | null;
    return row ? toRow(row) : null;
  }

  open(row: TransportSessionRow): void {
    this.db
      .query(
        `INSERT INTO addon_transport_sessions
           (org_id, addon_id, provider, external_chat_id, thread_id, run_id, draft, last_seq,
            message_id, status, ask_id, ask_options_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (org_id, thread_id, run_id, addon_id) DO UPDATE SET
           provider = excluded.provider,
           external_chat_id = excluded.external_chat_id,
           draft = excluded.draft,
           last_seq = excluded.last_seq,
           message_id = excluded.message_id,
           status = excluded.status,
           ask_id = excluded.ask_id,
           ask_options_json = excluded.ask_options_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        row.orgId,
        row.addonId,
        row.provider,
        row.externalChatId,
        row.threadId,
        row.runId,
        row.draft,
        row.lastSeq,
        row.messageId,
        row.status,
        row.askId,
        row.askOptionsJson,
        row.createdAt,
        row.updatedAt,
      );
  }

  listOpen(): TransportSessionRow[] {
    const rows = this.db
      .query(
        `SELECT * FROM addon_transport_sessions
         WHERE status <> 'closed' ORDER BY updated_at ASC`,
      )
      .all() as SessionRecord[];
    return rows.map(toRow);
  }

  patch(
    orgId: string,
    threadId: string,
    runId: string,
    addonId: string,
    patch: TransportSessionPatch,
  ): void {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    if (patch.draft !== undefined) {
      fields.push('draft = ?');
      values.push(patch.draft);
    }
    if (patch.lastSeq !== undefined) {
      fields.push('last_seq = ?');
      values.push(patch.lastSeq);
    }
    if (patch.messageId !== undefined) {
      fields.push('message_id = ?');
      values.push(patch.messageId);
    }
    if (patch.status !== undefined) {
      fields.push('status = ?');
      values.push(patch.status);
    }
    if (patch.askId !== undefined) {
      fields.push('ask_id = ?');
      values.push(patch.askId);
    }
    if (patch.askOptionsJson !== undefined) {
      fields.push('ask_options_json = ?');
      values.push(patch.askOptionsJson);
    }
    fields.push('updated_at = ?');
    values.push(patch.updatedAt ?? new Date().toISOString());
    this.db
      .query(
        `UPDATE addon_transport_sessions SET ${fields.join(', ')}
         WHERE org_id = ? AND thread_id = ? AND run_id = ? AND addon_id = ?`,
      )
      .run(...values, orgId, threadId, runId, addonId);
  }

  removeAddon(orgId: string, addonId: string): void {
    this.db
      .query('DELETE FROM addon_transport_sessions WHERE org_id = ? AND addon_id = ?')
      .run(orgId, addonId);
    this.db
      .query('DELETE FROM addon_transport_outbound WHERE org_id = ? AND addon_id = ?')
      .run(orgId, addonId);
  }

  rememberOutbound(orgId: string, addonId: string, messageId: string): void {
    this.db
      .query(
        `INSERT INTO addon_transport_outbound (org_id, addon_id, message_id, created_at)
         VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      )
      .run(orgId, addonId, messageId, new Date().toISOString());
    this.db
      .query(
        `DELETE FROM addon_transport_outbound
         WHERE org_id = ? AND addon_id = ? AND message_id NOT IN (
           SELECT message_id FROM addon_transport_outbound
           WHERE org_id = ? AND addon_id = ?
           ORDER BY created_at DESC, rowid DESC LIMIT ${OUTBOUND_KEEP}
         )`,
      )
      .run(orgId, addonId, orgId, addonId);
  }

  isOutbound(orgId: string, addonId: string, messageId: string): boolean {
    const row = this.db
      .query(
        `SELECT 1 AS present FROM addon_transport_outbound
         WHERE org_id = ? AND addon_id = ? AND message_id = ?`,
      )
      .get(orgId, addonId, messageId) as { present: number } | null;
    return row !== null;
  }
}

function toRow(record: SessionRecord): TransportSessionRow {
  return {
    orgId: record.org_id,
    addonId: record.addon_id,
    provider: record.provider,
    externalChatId: record.external_chat_id,
    threadId: record.thread_id,
    runId: record.run_id,
    draft: record.draft,
    lastSeq: record.last_seq,
    messageId: record.message_id,
    status: record.status,
    askId: record.ask_id,
    askOptionsJson: record.ask_options_json,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
