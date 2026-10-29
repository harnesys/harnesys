export interface IdentityAuditRow {
  id: string;
  at: string;
  actorKind: string;
  actorId: string;
  action: string;
  result: string;
  reason: string | null;
}

export abstract class IdentityAudit {
  abstract append(row: IdentityAuditRow): void;
}
