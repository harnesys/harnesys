import { randomUUID } from 'node:crypto';
import type { OrgAuditRow } from '../../domain/fleet/org-audit.port.ts';

export interface OrgAuditEntry {
  actorKind: string;
  actorId: string;
  viaNodeId: string | null;
  action: string;
  resource: string;
  result: string;
}

export function orgAuditRow(at: string, entry: OrgAuditEntry): OrgAuditRow {
  return {
    id: randomUUID(),
    at,
    actorKind: entry.actorKind,
    actorId: entry.actorId,
    viaNodeId: entry.viaNodeId,
    action: entry.action,
    resource: entry.resource,
    result: entry.result,
  };
}
