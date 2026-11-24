import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import type { OrgAuditItem } from '@/shared/api/org-audit';
import { formatDateTime } from '@/shared/lib/format-clock';
import { Badge } from '@/shared/ui/badge';

const RESULT_BADGE_CLASS: Record<string, string> = {
  ok: 'bg-status-ok/15 text-status-ok',
  denied: 'bg-status-warn/15 text-status-warn',
  failed: 'bg-destructive/10 text-destructive',
};

function resultBadgeClass(result: string): string {
  return RESULT_BADGE_CLASS[result] ?? 'bg-muted text-muted-foreground';
}

function actorIdLabel(actorId: string): string {
  return actorId.length > 12 ? `${actorId.slice(0, 12)}...` : actorId;
}

export function AuditTable({ rows }: { rows: OrgAuditItem[] }) {
  return (
    <div className="overflow-hidden rounded-lg border" data-testid="audit-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Actor</th>
            <th className="px-3 py-2 font-medium">Resource</th>
            <th className="px-3 py-2 font-medium">Via</th>
            <th className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AuditTableRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTableRow({ row }: { row: OrgAuditItem }) {
  const timeZone = useOrgTimeZone();
  return (
    <tr className="border-b last:border-b-0" data-testid="audit-row">
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground text-xs">
        {formatDateTime(row.at, timeZone)}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
      <td className="px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span>{row.actorKind}</span>
          <span className="font-mono text-muted-foreground">{actorIdLabel(row.actorId)}</span>
        </span>
      </td>
      <td className="max-w-72 truncate px-3 py-2 text-xs" title={row.resource}>
        {row.resource}
      </td>
      <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{row.viaNodeId ?? null}</td>
      <td className="px-3 py-2">
        <Badge variant="outline" className={resultBadgeClass(row.result)}>
          {row.result}
        </Badge>
      </td>
    </tr>
  );
}
