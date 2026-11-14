import type { AddonJobView } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useState } from 'react';
import {
  orgAddonDetailQueryKey,
  orgAddonJobsQuery,
  patchOrgAddonJob,
  runOrgAddonJob,
} from '@/shared/api/addons';
import { Button } from '@/shared/ui/button';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Switch } from '@/shared/ui/switch';
import type { SectionProps } from '../lib/section-props';

function formatSchedule(job: AddonJobView): string {
  return 'cron' in job.schedule ? job.schedule.cron : `every ${job.schedule.everySec}s`;
}

function formatAt(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export function JobsSection({ orgId, detail }: SectionProps) {
  const queryClient = useQueryClient();
  const result = useQuery(orgAddonJobsQuery(orgId, detail.addonId));
  const jobs = result.data?.items ?? [];
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, detail.addonId) });

  const patch = async (job: AddonJobView, enabled: boolean) => {
    setBusyId(job.jobId);
    setError(null);
    try {
      await patchOrgAddonJob(orgId, detail.addonId, job.jobId, { enabled });
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (job: AddonJobView) => {
    setBusyId(job.jobId);
    setError(null);
    try {
      await runOrgAddonJob(orgId, detail.addonId, job.jobId);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  if (jobs.length === 0 && result.isSuccess) {
    return null;
  }

  return (
    <RowSection label="Jobs" count={jobs.length}>
      {error ? <SettingsErrorBanner message={error} testId="addon-jobs-error" /> : null}
      {jobs.length === 0 ? (
        <RowItem title="No scheduled jobs" />
      ) : (
        jobs.map((job) => (
          <div
            key={job.jobId}
            className="flex min-w-0 flex-col gap-1 rounded-md border px-3 py-2"
            data-testid={`addon-job-${job.jobId}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Switch
                checked={job.enabled}
                disabled={busyId === job.jobId}
                onCheckedChange={(next) => void patch(job, next === true)}
                aria-label={`Toggle job ${job.title}`}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{job.title}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatSchedule(job)}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                disabled={busyId === job.jobId}
                onClick={() => void runNow(job)}
                data-testid={`addon-job-run-${job.jobId}`}
              >
                <Play />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs leading-4">
              Next: {formatAt(job.nextRunAt)} · Last: {formatAt(job.lastRunAt)} · Status:{' '}
              {job.lastStatus ?? '—'}
            </p>
          </div>
        ))
      )}
    </RowSection>
  );
}
