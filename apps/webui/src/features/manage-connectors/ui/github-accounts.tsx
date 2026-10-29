import type { ConnectorCapability, Integration } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderGit2Icon, UnplugIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { openSystemBrowser } from '@/features/manage-connectors/lib/system-browser';
import { orgSourcesQueryKey } from '@/features/manage-connectors/model/drive-sources';
import {
  gitSourceCount,
  integrationGitSources,
} from '@/features/manage-connectors/model/github-sources';
import {
  integrationStatusLabel,
  integrationStatusTone,
} from '@/features/manage-connectors/model/integration-status';
import {
  confirmDisconnect,
  useDisconnectIntegration,
} from '@/features/manage-connectors/model/use-disconnect-integration';
import { githubAppStatusQuery, githubReposQuery } from '@/shared/api/integrations';
import { projectQueryKey } from '@/shared/api/projects';
import { attachGit, type Source } from '@/shared/api/sources';
import { env } from '@/shared/config/env';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { RowListSkeleton, SettingsSection, SettingsWarnBanner } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { toast } from '@/shared/ui/toast';
import { CapabilityChips } from './capability-chips';
import { CONNECTOR_INSET_CLASSES, ConnectorCard } from './connector-card';
import { GitSourcesList } from './git-sources-list';

interface GithubAccountsSectionProps {
  orgId: string;
  capabilities: ConnectorCapability[];
  accounts: Integration[];
  sources: Source[] | undefined;
  sourcesLoading: boolean;
  onAdd: () => void;
}

export function GithubAccountsSection({
  orgId,
  capabilities,
  accounts,
  sources,
  sourcesLoading,
  onAdd,
}: GithubAccountsSectionProps) {
  const appStatus = useQuery(githubAppStatusQuery(orgId));
  const configured = appStatus.data?.configured === true;
  const disconnect = useDisconnectIntegration(orgId, 'GitHub');
  const [reposFor, setReposFor] = useState<string | null>(null);

  const openPermissions = () => {
    const slug = appStatus.data?.appSlug;
    if (!slug) {
      return;
    }
    const url = `https://github.com/settings/apps/${slug}/permissions`;
    if (env.isTauri) {
      void openSystemBrowser(url).catch(() => {});
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  const needsWriteAccess =
    configured && accounts.length > 0 && appStatus.data?.contentsAccess !== 'write';

  return (
    <SettingsSection
      label="Accounts"
      count={accounts.length}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={onAdd}
          data-testid="connectors-connect-another"
        >
          Connect another account
        </Button>
      }
      testId="connectors-accounts"
    >
      <div className="flex flex-col gap-3">
        {needsWriteAccess ? (
          <SettingsWarnBanner
            title="Push access is missing"
            testId="connectors-github-permissions-warning"
          >
            <p>
              The GitHub App cannot push code — set Contents to Read and write in the app
              permissions, accept the permission request GitHub shows for this installation, then
              re-add the repository.
            </p>
            <div className="flex gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" onClick={openPermissions}>
                Open GitHub permissions
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={appStatus.isFetching}
                onClick={() => {
                  void appStatus.refetch();
                }}
              >
                Check again
              </Button>
            </div>
          </SettingsWarnBanner>
        ) : null}
        {accounts.map((account) => {
          const linked = integrationGitSources(sources ?? [], account.id);
          return (
            <ConnectorCard key={account.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <StatusDot tone={integrationStatusTone(account.status)} label={account.status} />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate font-medium text-sm"
                    data-testid={`connectors-account-${account.id}`}
                  >
                    {account.accountLabel}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {integrationStatusLabel(account.status)}
                    {linked.length > 0 ? ` · ${linked.length} repositories` : ''}
                  </p>
                  <div className="pt-0.5">
                    <CapabilityChips capabilities={capabilities} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={account.status !== 'connected'}
                  onClick={() => {
                    setReposFor(reposFor === account.id ? null : account.id);
                  }}
                  data-testid={`connectors-add-repos-${account.id}`}
                >
                  <FolderGit2Icon data-icon="inline-start" />
                  Add repositories
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={disconnect.isPending}
                  onClick={() => {
                    confirmDisconnect(
                      gitSourceCount(sources ?? [], account.id),
                      account.accountLabel,
                      () => disconnect.mutate(account.id),
                    );
                  }}
                  data-testid={`connectors-disconnect-${account.id}`}
                >
                  <UnplugIcon data-icon="inline-start" />
                  Disconnect
                </Button>
              </div>
              {reposFor === account.id ? (
                <AddReposRows
                  orgId={orgId}
                  integrationId={account.id}
                  onClose={() => {
                    setReposFor(null);
                  }}
                />
              ) : null}
              <GitSourcesList orgId={orgId} sources={linked} loading={sourcesLoading} />
            </ConnectorCard>
          );
        })}
      </div>
    </SettingsSection>
  );
}

interface AddReposRowsProps {
  orgId: string;
  integrationId: string;
  onClose: () => void;
}

function AddReposRows({ orgId, integrationId, onClose }: AddReposRowsProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const repos = useQuery(githubReposQuery(orgId, integrationId));

  const toggle = (fullName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) {
        next.delete(fullName);
      } else {
        next.add(fullName);
      }
      return next;
    });
  };

  const attachMutation = useMutation({
    mutationFn: async (repoFullNames: string[]) => {
      for (const repo of repoFullNames) {
        await attachGit(orgId, { integrationId, repo });
      }
      return repoFullNames.length;
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: orgSourcesQueryKey(orgId) });
      await queryClient.invalidateQueries({ queryKey: projectQueryKey });
      toast.add({
        title:
          count === 1
            ? 'Repository attached as a source'
            : `${count} repositories attached as sources`,
      });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Attach failed';
      toast.add({ title: 'Attach failed', description: msg });
    },
  });

  const items = repos.data?.repos ?? [];
  const canAdd = selected.size > 0 && !attachMutation.isPending;

  let list: ReactNode;
  if (repos.isPending) {
    list = <RowListSkeleton rows={3} testId="connectors-github-repos-loading" />;
  } else if (repos.isError) {
    list = (
      <p className="text-destructive text-xs leading-4">
        {repos.error instanceof Error ? repos.error.message : 'Failed to load repositories'}
      </p>
    );
  } else if (items.length === 0) {
    list = (
      <p className="text-muted-foreground text-xs leading-4">
        No repositories are accessible to this installation. Install the GitHub App on repositories
        first.
      </p>
    );
  } else {
    list = (
      <div
        className="flex max-h-60 flex-col divide-y divide-border/40 overflow-y-auto"
        data-testid="connectors-github-repos-list"
      >
        {items.map((repo) => (
          <div
            key={repo.fullName}
            className="flex items-center gap-2 py-1.5"
            data-testid={`connectors-github-repo-${repo.fullName}`}
          >
            <Checkbox
              checked={selected.has(repo.fullName)}
              onCheckedChange={() => {
                toggle(repo.fullName);
              }}
              aria-label={`Attach ${repo.fullName}`}
            />
            <span className="min-w-0 flex-1 truncate text-[13px]">{repo.fullName}</span>
            {repo.private ? <Badge variant="outline">Private</Badge> : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${CONNECTOR_INSET_CLASSES} flex flex-col gap-2 p-3`}
      data-testid={`connectors-add-repos-panel-${integrationId}`}
    >
      {list}
      <div className="flex items-center justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canAdd}
          onClick={() => {
            attachMutation.mutate([...selected]);
          }}
        >
          {attachMutation.isPending ? 'Adding…' : 'Add selected'}
        </Button>
      </div>
    </div>
  );
}
