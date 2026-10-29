export interface OrgAuditRow {
  id: string;
  at: string;
  actorKind: string;
  actorId: string;
  viaNodeId: string | null;
  action: string;
  resource: string;
  result: string;
}

export interface OrgAuditPage {
  items: OrgAuditRow[];
  total: number;
}

export abstract class OrgAudit {
  abstract append(orgId: string, row: OrgAuditRow): void;
  abstract list(orgId: string, limit: number, offset: number): OrgAuditPage;
}
