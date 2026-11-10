import type { LogLineView } from '@harnesys/contracts';
import { useEffect, useState } from 'react';
import { getOrgAddonLogs, watchAddonLogStream } from '@/shared/api/addons';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';

const LOG_LIMIT = 200;

export function AddonLogPanel({ orgId, addonId }: { orgId: string; addonId: string }) {
  const [lines, setLines] = useState<LogLineView[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getOrgAddonLogs(orgId, addonId).then(
      (response) => {
        if (!cancelled) {
          setLines((current) => (current.length > 0 ? current : response.items.slice(-LOG_LIMIT)));
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setBackfillError(err instanceof Error ? err.message : String(err));
        }
      },
    );
    const unsubscribe = watchAddonLogStream(
      orgId,
      addonId,
      (line) => {
        setStreamError(null);
        setLines((current) => [...current, line].slice(-LOG_LIMIT));
      },
      () => setStreamError('Log stream unavailable'),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [addonId, orgId]);

  return (
    <RowSection label="Logs" count={lines.length}>
      {streamError ? <SettingsErrorBanner message={streamError} testId="addon-log-error" /> : null}
      {backfillError ? (
        <SettingsErrorBanner message={backfillError} testId="addon-log-backfill-error" />
      ) : null}
      {lines.length === 0 ? (
        <RowItem title="No log lines yet" description="Live output appears here as it arrives." />
      ) : (
        <div
          className="flex max-h-64 min-w-0 flex-col gap-0.5 overflow-y-auto"
          data-testid="addon-log-lines"
        >
          {lines.map((line) => (
            <div
              key={line.seq}
              className="flex min-w-0 items-baseline gap-2 font-mono text-[11px] leading-4"
              data-testid={`addon-log-${line.seq}`}
            >
              <span className="shrink-0 text-muted-foreground tabular-nums">{toTime(line.at)}</span>
              <span className="w-10 shrink-0 text-muted-foreground uppercase">{line.level}</span>
              <span className="wrap-anywhere min-w-0">{line.message}</span>
            </div>
          ))}
        </div>
      )}
    </RowSection>
  );
}

function toTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return at;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
