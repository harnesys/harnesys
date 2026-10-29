import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatClock } from '@/shared/lib/format-clock';
import { RowChip } from '@/shared/ui/capability-rows';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';

interface FleetStatusSectionProps {
  isRelay: boolean;
  live: boolean;
  lastUpdated: number | null;
  relayHint: string | null;
  orgId: string | null | undefined;
  loading: boolean;
  summary: {
    online: number;
    draining: number;
    offline: number;
    syncing: number;
    total: number;
  } | null;
}

export function FleetStatusSection({
  isRelay,
  live,
  lastUpdated,
  relayHint,
  orgId,
  loading,
  summary,
}: FleetStatusSectionProps) {
  const timeZone = useOrgTimeZone();
  return (
    <SettingsSection
      label="This machine"
      description={
        relayHint ? (
          <span className="font-mono">
            relay {relayHint}
            {orgId ? (
              <span className="text-muted-foreground/60"> · org {orgId.slice(0, 8)}</span>
            ) : null}
          </span>
        ) : undefined
      }
      testId="fleet-ops-bar"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 py-2">
        <RowChip tone={isRelay ? 'accent' : 'neutral'}>
          {isRelay ? 'Server desk' : 'Worker desk'}
        </RowChip>
        <span className="flex items-center gap-2 text-sm">
          <StatusDot tone={live ? 'live' : 'off'} label={live ? 'Live' : 'Paused'} />
          <span data-testid="fleet-live-pulse" className="text-foreground">
            {live ? 'Live' : 'Paused'}
          </span>
          {lastUpdated ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatClock(lastUpdated, timeZone)}
            </span>
          ) : null}
        </span>
        {loading ? <span className="text-muted-foreground text-xs">Loading hosts...</span> : null}
        {!loading && summary && summary.total > 0 ? <PresenceStats summary={summary} /> : null}
      </div>
    </SettingsSection>
  );
}

function PresenceStats({
  summary,
}: {
  summary: { online: number; draining: number; offline: number; syncing: number };
}) {
  return (
    <span
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums"
      data-testid="fleet-presence-summary"
    >
      <PresenceStat label="online" value={summary.online} tone="ok" />
      {summary.syncing > 0 ? (
        <PresenceStat label="syncing" value={summary.syncing} tone="info" />
      ) : null}
      {summary.draining > 0 ? (
        <PresenceStat label="draining" value={summary.draining} tone="warn" />
      ) : null}
      <PresenceStat label="offline" value={summary.offline} tone="off" />
    </span>
  );
}

function PresenceStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'info' | 'warn' | 'off';
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot tone={tone} />
      <span className="font-medium text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
