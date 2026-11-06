import type { AddonDatabase } from 'harnesys/integration';
import type { ReaderRecord, ReaderStatus } from '../model/records.ts';
import { assign, num, optText, type Row, text } from './rows.ts';

function toReader(row: Row): ReaderRecord {
  return {
    id: text(row, 'id'),
    label: text(row, 'label'),
    status: text(row, 'status') as ReaderStatus,
    apiId: num(row, 'api_id'),
    phoneMasked: text(row, 'phone_masked'),
    dcId: optText(row, 'dc_id') === null ? null : Number(optText(row, 'dc_id')),
    lastError: optText(row, 'last_error'),
    lastSeenAt: optText(row, 'last_seen_at'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

export function insertReader(db: AddonDatabase, rec: ReaderRecord): void {
  db.run(
    `INSERT INTO readers (id, label, status, api_id, phone_masked, dc_id, last_error, last_seen_at,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.id,
      rec.label,
      rec.status,
      rec.apiId,
      rec.phoneMasked,
      rec.dcId,
      rec.lastError,
      rec.lastSeenAt,
      rec.createdAt,
      rec.updatedAt,
    ],
  );
}

export function listReaders(db: AddonDatabase): ReaderRecord[] {
  return db.all(`SELECT * FROM readers ORDER BY created_at ASC`).map((row) => toReader(row as Row));
}

export function findReader(db: AddonDatabase, id: string): ReaderRecord | undefined {
  const row = db.get(`SELECT * FROM readers WHERE id = ?`, [id]);
  return row ? toReader(row as Row) : undefined;
}

export function updateReader(
  db: AddonDatabase,
  id: string,
  patch: Partial<Omit<ReaderRecord, 'id' | 'createdAt'>>,
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  assign(sets, params, 'label', patch.label);
  assign(sets, params, 'status', patch.status);
  assign(sets, params, 'api_id', patch.apiId);
  assign(sets, params, 'phone_masked', patch.phoneMasked);
  assign(sets, params, 'dc_id', patch.dcId);
  assign(sets, params, 'last_error', patch.lastError);
  assign(sets, params, 'last_seen_at', patch.lastSeenAt);
  assign(sets, params, 'updated_at', patch.updatedAt ?? new Date().toISOString());
  params.push(id);
  db.run(`UPDATE readers SET ${sets.join(', ')} WHERE id = ?`, params);
}

export function deleteReader(db: AddonDatabase, id: string): void {
  db.run(`DELETE FROM readers WHERE id = ?`, [id]);
}
