import type { AddonLogLine } from '@harnesys/contracts';
import { useEffect, useState } from 'react';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { getOrgAddonLogs } from './api';

const LOG_POLL_MS = 2000;
const LOG_LIMIT = 200;

function toTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return at;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function AddonLogPanel({ orgId, addonId }: { orgId: string; addonId: string }) {
  const [lines, setLines] = useState<AddonLogLine[]>([]);
  const [lastSeq, setLastSeq] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLines([]);
    setLastSeq(0);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const items = await getOrgAddonLogs(orgId, addonId, lastSeq);
        if (cancelled) {
          return;
        }
        if (items.length > 0) {
          setLastSeq(items[items.length - 1]?.seq ?? lastSeq);
          setLines((current) => [...current, ...items].slice(-LOG_LIMIT));
        }
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    const timer = setInterval(() => void poll(), LOG_POLL_MS);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [addonId, lastSeq, orgId]);

  return (
    <RowSection label="Logs" count={lines.length}>
      {error ? <SettingsErrorBanner message={error} testId="addon-log-error" /> : null}
      {lines.length === 0 ? (
        <RowItem title="No log lines yet" description="Live output appears here every 2s." />
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
