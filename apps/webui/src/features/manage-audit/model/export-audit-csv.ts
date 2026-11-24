import { listOrgAudit, type OrgAuditItem, type OrgAuditQuery } from '@/shared/api/org-audit';

const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_ROWS = 5000;
const CSV_HEADER = 'at,actorKind,actorId,viaNodeId,action,resource,result';

function csvField(value: string): string {
  const flat = value.replaceAll('\r', ' ').replaceAll('\n', ' ');
  return `"${flat.replaceAll('"', '""')}"`;
}

export function auditRowsToCsv(rows: OrgAuditItem[]): string {
  const lines = rows.map((row) =>
    [row.at, row.actorKind, row.actorId, row.viaNodeId ?? '', row.action, row.resource, row.result]
      .map(csvField)
      .join(','),
  );
  return [CSV_HEADER, ...lines].join('\n');
}

export function auditCsvFilename(orgId: string, now: Date = new Date()): string {
  return `audit-${orgId}-${now.toISOString().slice(0, 10)}.csv`;
}

function downloadCsv(name: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportAuditCsv(orgId: string, filters: OrgAuditQuery): Promise<void> {
  const rows: OrgAuditItem[] = [];
  let total = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < Math.min(total, EXPORT_MAX_ROWS); offset += EXPORT_PAGE_SIZE) {
    const page = await listOrgAudit(orgId, { ...filters, limit: EXPORT_PAGE_SIZE, offset });
    rows.push(...page.items);
    total = page.total;
    if (page.items.length === 0) {
      break;
    }
  }
  downloadCsv(auditCsvFilename(orgId), auditRowsToCsv(rows));
}
