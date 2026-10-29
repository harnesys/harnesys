import { randomUUID } from 'node:crypto';
import type { IdentityAuditRow } from '../../domain/identity/identity-audit.port.ts';

export interface IdentityAuditEntry {
  actorKind: string;
  actorId: string;
  action: string;
  result: string;
  reason: string | null;
}

export function identityAuditRow(at: string, entry: IdentityAuditEntry): IdentityAuditRow {
  return {
    id: randomUUID(),
    at,
    actorKind: entry.actorKind,
    actorId: entry.actorId,
    action: entry.action,
    result: entry.result,
    reason: entry.reason,
  };
}
