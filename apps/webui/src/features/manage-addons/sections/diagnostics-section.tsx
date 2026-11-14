import { useQuery } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { orgAddonDataExportUrl, orgAddonMetricsQuery } from '@/shared/api/addons';
import { apiUrl } from '@/shared/api/client';
import { cn } from '@/shared/lib/utils';
import { buttonVariants } from '@/shared/ui/button';
import { Row, RowItem, RowSection } from '@/shared/ui/capability-rows';

const MAX_COUNTERS = 12;

export function DiagnosticsSection({ orgId, addonId }: { orgId: string; addonId: string }) {
  const metrics = useQuery(orgAddonMetricsQuery(orgId, addonId));
  const [expanded, setExpanded] = useState(true);
  const counters = metrics.data?.counters ?? [];
  return (
    <RowSection
      label="Diagnostics"
      count={counters.length}
      actions={
        <a
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}
          href={apiUrl(orgAddonDataExportUrl(orgId, addonId))}
          download
          data-testid="addon-data-export"
        >
          <DownloadIcon />
          Export data
        </a>
      }
    >
      {metrics.isPending ? <RowItem title="Loading counters..." /> : null}
      {!metrics.isPending && counters.length === 0 ? (
        <RowItem
          title="No counters reported"
          description="The add-on has not recorded metrics since it started."
        />
      ) : null}
      {counters.length > 0 ? (
        <Row
          testId="addon-diagnostics-toggle"
          mono={false}
          title="Counters"
          meta={String(counters.length)}
          onToggle={() => setExpanded((value) => !value)}
          expanded={expanded}
        >
          <div className="flex min-w-0 flex-col gap-0.5" data-testid="addon-metrics">
            {counters.slice(0, MAX_COUNTERS).map((point) => (
              <div
                key={`${point.name}:${JSON.stringify(point.labels)}`}
                className="flex min-w-0 items-baseline justify-between gap-3"
              >
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {point.name}
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums">{point.value}</span>
              </div>
            ))}
            {counters.length > MAX_COUNTERS ? (
              <p className="pt-0.5 text-[11px] text-muted-foreground">
                {counters.length - MAX_COUNTERS} more counters hidden
              </p>
            ) : null}
          </div>
        </Row>
      ) : null}
    </RowSection>
  );
}
