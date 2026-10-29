import type { ConnectorCapability, Integration } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { openSystemBrowser } from '@/features/manage-connectors/lib/system-browser';
import { githubAppStatusQuery } from '@/shared/api/integrations';
import type { Source } from '@/shared/api/sources';
import { env } from '@/shared/config/env';
import { Button } from '@/shared/ui/button';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { ConnectorCard } from './connector-card';
import { GithubAccountsSection } from './github-accounts';
import { GithubConnectSection } from './github-connect';

interface GithubDetailProps {
  orgId: string;
  capabilities: ConnectorCapability[];
  accounts: Integration[];
  sources: Source[] | undefined;
  sourcesLoading: boolean;
}

export function GithubDetail({
  orgId,
  capabilities,
  accounts,
  sources,
  sourcesLoading,
}: GithubDetailProps) {
  const [adding, setAdding] = useState(false);

  let body: ReactNode;
  if (accounts.length === 0 || adding) {
    body = (
      <GithubConnectSection
        orgId={orgId}
        onCancel={accounts.length > 0 ? () => setAdding(false) : undefined}
      />
    );
  } else {
    body = (
      <GithubAccountsSection
        orgId={orgId}
        capabilities={capabilities}
        accounts={accounts}
        sources={sources}
        sourcesLoading={sourcesLoading}
        onAdd={() => setAdding(true)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {accounts.length > 0 ? <GithubAppSection orgId={orgId} /> : null}
      {body}
    </div>
  );
}

function GithubAppSection({ orgId }: { orgId: string }) {
  const status = useQuery(githubAppStatusQuery(orgId));
  const slug = status.data?.appSlug;
  const installed = slug !== null && slug !== undefined;

  const openApp = () => {
    if (!slug) {
      return;
    }
    const url = `https://github.com/settings/apps/${slug}`;
    if (env.isTauri) {
      void openSystemBrowser(url).catch(() => {});
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  return (
    <SettingsSection
      label="GitHub App"
      description="One app per server; each account installs it on the repositories agents should read."
      testId="connectors-github-app-section"
    >
      <ConnectorCard className="flex items-center gap-3 p-4">
        <StatusDot
          tone={installed ? 'ok' : 'idle'}
          label={installed ? 'Installed' : 'Not created'}
        />
        <p className="min-w-0 flex-1 text-[13px]">
          {statusDescription(status.isPending, installed)}
        </p>
        {installed ? (
          <Button type="button" variant="outline" size="sm" onClick={openApp}>
            Manage on GitHub
          </Button>
        ) : null}
      </ConnectorCard>
    </SettingsSection>
  );
}

function statusDescription(isPending: boolean, installed: boolean): string {
  if (isPending) {
    return 'Checking…';
  }
  if (installed) {
    return 'Installed — permissions and repository access are managed on GitHub.';
  }
  return 'Not created yet — it is created when you connect the first account.';
}
