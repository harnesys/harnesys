import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import type { OrgAuditItem } from '@/shared/api/org-audit';
import { formatClock, formatDateTime, formatShortDate } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { auditResultLabel } from '../model/audit-filters';

const RESULT_TONE: Record<string, string> = {
  ok: 'border-status-ok/30 bg-status-ok/10 text-status-ok',
  accepted: 'border-status-ok/30 bg-status-ok/10 text-status-ok',
  ready: 'border-status-info/30 bg-status-info/10 text-status-info',
  denied: 'border-status-warn/30 bg-status-warn/10 text-status-warn',
  late: 'border-status-warn/30 bg-status-warn/10 text-status-warn',
  family_revoked: 'border-status-warn/30 bg-status-warn/10 text-status-warn',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
};

const NODE_ID_RESOURCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

function resultBadgeClass(result: string): string {
  return RESULT_TONE[result] ?? 'border-border bg-muted/60 text-muted-foreground';
}

function resourceLabel(resource: string): string {
  return resource.replace(NODE_ID_RESOURCE_PATTERN, '');
}

export function AuditTable({ rows }: { rows: OrgAuditItem[] }) {
  return (
    <div className="overflow-hidden rounded-lg border" data-testid="audit-table">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[11px] text-muted-foreground uppercase tracking-wide">
              <th className="w-28 px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="w-52 px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Resource</th>
              <th className="w-36 px-3 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <AuditTableRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTableRow({ row }: { row: OrgAuditItem }) {
  const timeZone = useOrgTimeZone();
  return (
    <tr
      className="border-b transition-colors last:border-b-0 hover:bg-muted/30"
      data-testid="audit-row"
    >
      <td
        className="whitespace-nowrap px-3 py-2 align-top"
        title={formatDateTime(row.at, timeZone)}
      >
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-xs tabular-nums">{formatClock(row.at, timeZone)}</span>
          <span className="text-[11px] text-muted-foreground">
            {formatShortDate(row.at, timeZone)}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <span className="break-all font-mono text-xs">{row.action}</span>
      </td>
      <td className="max-w-52 px-3 py-2 align-top">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground uppercase leading-4 tracking-wide">
            {row.actorKind}
          </span>
          <span className="truncate font-mono text-muted-foreground text-xs" title={row.actorId}>
            {row.actorId}
          </span>
        </div>
      </td>
      <td className="max-w-sm px-3 py-2 align-top">
        <div className="flex flex-col gap-0.5">
          <span className="truncate text-xs" title={row.resource}>
            {resourceLabel(row.resource)}
          </span>
          {row.viaNodeId ? (
            <span
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={row.viaNodeId}
            >
              via {row.viaNodeId}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <Badge variant="outline" className={cn('gap-1.5', resultBadgeClass(row.result))}>
          <span className="size-1.5 rounded-full bg-current" />
          {auditResultLabel(row.result)}
        </Badge>
      </td>
    </tr>
  );
}
