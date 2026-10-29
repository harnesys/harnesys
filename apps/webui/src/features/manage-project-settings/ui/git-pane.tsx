import { useQuery } from '@tanstack/react-query';
import { GitBranchIcon } from 'lucide-react';
import { getGitStatus, gitStatusQueryKey } from '@/shared/api/git';
import { Badge } from '@/shared/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { RowListSkeleton, SettingsField, SettingsSection } from '@/shared/ui/settings-kit';

type DecorationsMode = 'auto' | 'on' | 'off';
function getDecorationsMode(): DecorationsMode {
  try {
    const v = localStorage.getItem('git-decorations');
    if (v === 'on' || v === 'off' || v === 'auto') {
      return v;
    }
  } catch {}
  return 'auto';
}
export function GitPane({ projectId }: { projectId: string }) {
  const statusQuery = useQuery({
    queryKey: gitStatusQueryKey(projectId),
    queryFn: () => getGitStatus(projectId),
    enabled: Boolean(projectId),
  });
  const status = statusQuery.data;
  const isGit = status?.isGit === true;
  const handleDecorationsChange = (value: string) => {
    try {
      localStorage.setItem('git-decorations', value);
    } catch {}
  };
  if (!projectId) {
    return (
      <SettingsSection label="Source Git" description="No source selected.">
        <RowListSkeleton rows={2} />
      </SettingsSection>
    );
  }
  if (statusQuery.isLoading) {
    return (
      <SettingsSection
        label="Source Git"
        description="Read-only diagnostics. Branch actions live in the source root menu in the sidebar."
      >
        <RowListSkeleton rows={2} testId="git-loading" />
      </SettingsSection>
    );
  }
  return (
    <div className="flex w-full flex-col gap-6">
      <SettingsSection
        label="Source Git"
        description="Read-only diagnostics. Branch actions live in the source root menu in the sidebar."
      >
        {!isGit ? (
          <p className="rounded-md border border-dashed px-3 py-2.5 text-muted-foreground text-sm">
            This source is not a git worktree. Use Initialize repository in the source menu, or
            attach a git URL for multi-host agents.{' '}
            {status && 'gitVersion' in status && (status.gitVersion as string | null)
              ? `Git ${status.gitVersion as string}`
              : 'Git not found on server.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 px-1 py-2">
              <GitBranchIcon className="size-4 text-muted-foreground" />
              <span className="font-medium text-sm">{branchLabel(status)}</span>
              {status.dirty ? (
                <Badge variant="secondary" className="text-status-warn">
                  dirty • {status.dirtyCount}
                </Badge>
              ) : (
                <Badge variant="outline">clean</Badge>
              )}
            </div>
            <SettingsField label="Sync">
              <StatusGrid
                items={[
                  ['Ahead', String(status.ahead)],
                  ['Behind', String(status.behind)],
                  ['Remote', status.remote ?? '—'],
                  ['Git', status.gitVersion ?? 'unknown'],
                ]}
              />
            </SettingsField>
            <SettingsField label="Author">
              <StatusGrid
                items={[
                  ['user.name', status.gitUser?.name ?? '—'],
                  ['user.email', status.gitUser?.email ?? '—'],
                ]}
              />
            </SettingsField>
            <SettingsField label="Branches">
              <p className="px-1 py-1 text-sm tabular-nums">
                {status.branches?.local.length ?? 0} local, {status.branches?.recent.length ?? 0}{' '}
                recent
              </p>
            </SettingsField>
          </>
        )}
      </SettingsSection>

      {isGit ? (
        <SettingsSection label="File decorations">
          <SettingsField
            label="Decorations"
            htmlFor="git-decorations"
            description="Auto disables per-file colors when `git status` exceeds 800ms (large repo). Expand a folder to load lazily."
          >
            <Select
              defaultValue={getDecorationsMode()}
              onValueChange={(v: string | null) => handleDecorationsChange(v ?? 'auto')}
            >
              <SelectTrigger id="git-decorations" className="w-48" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (large repo off)</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
          </SettingsField>
        </SettingsSection>
      ) : null}
    </div>
  );
}

function branchLabel(status: {
  noCommits?: boolean;
  branch?: string | null;
  detached?: boolean;
  head?: string | null;
}): string {
  if (status.noCommits) {
    return `${status.branch ?? 'HEAD'} (no commits)`;
  }
  if (status.detached) {
    return `detached at ${status.head?.slice(0, 7)}`;
  }
  return status.branch ?? 'HEAD';
}

function StatusGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 px-1 py-1 text-xs">
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 items-baseline gap-2">
          <dt className="shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 truncate">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
