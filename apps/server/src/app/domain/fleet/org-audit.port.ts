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

export interface OrgAuditListQuery {
  limit: number;
  offset: number;
  from?: string;
  to?: string;
  action?: string;
  actorKind?: string;
  result?: string;
  actorId?: string;
  q?: string;
}

export abstract class OrgAudit {
  abstract append(orgId: string, row: OrgAuditRow): void;
  abstract list(orgId: string, query: OrgAuditListQuery): OrgAuditPage;
}
