import type {
  AccountView,
  AppView,
  CatalogResponse,
  ProviderCatalogEntry,
} from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import { Link } from 'react-router';
import { accountsQuery, appsQuery, catalogQuery } from '@/shared/api/apps';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Card } from '@/shared/ui/card';
import {
  RowListSkeleton,
  SettingsEmpty,
  SettingsErrorBanner,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { buildKindIndex } from '../model/catalog.ts';
import { ProviderMark } from './provider-mark.tsx';

interface ProviderCounts {
  apps: number;
  accounts: number;
  problems: string[];
}

interface ProviderView {
  provider: ProviderCatalogEntry;
  counts: ProviderCounts;
}

export function AppsPane({ orgId }: { orgId: string }) {
  const catalogResult = useQuery(catalogQuery(orgId));
  const appsResult = useQuery(appsQuery(orgId));
  const accountsResult = useQuery(accountsQuery(orgId));

  const catalog = catalogResult.data;
  const loadError = catalogResult.error ?? appsResult.error ?? accountsResult.error;
  const pending = catalogResult.isPending || appsResult.isPending || accountsResult.isPending;

  const refresh = () => {
    void catalogResult.refetch();
    void appsResult.refetch();
    void accountsResult.refetch();
  };

  const views = catalog
    ? providerViews(
        catalog,
        appsResult.data?.apps ?? [],
        accountsResult.data?.accounts ?? [],
      ).filter((view) => view.provider.appKinds.length + view.provider.accountKinds.length > 0)
    : [];

  return (
    <div className="flex w-full flex-col gap-8" data-testid="manage-apps-pane">
      <SettingsSection
        label="Connections"
        description="Provider applications and connected accounts shared by every add-on. Secrets are encrypted per organization."
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={refresh}
            data-testid="apps-refresh"
          >
            Refresh
          </Button>
        }
      >
        {loadError ? (
          <SettingsErrorBanner message={loadError.message} testId="manage-apps-error" />
        ) : null}
        {pending || !catalog ? <RowListSkeleton rows={3} testId="manage-apps-loading" /> : null}
        {!pending && catalog && views.length === 0 ? (
          <SettingsEmpty
            title="No providers installed"
            description="Install an integration that registers apps and accounts."
            testId="apps-empty"
          />
        ) : null}
      </SettingsSection>
      {!pending && views.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="apps-grid">
          {views.map(({ provider, counts }) => (
            <ProviderTile key={provider.id} orgId={orgId} provider={provider} counts={counts} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function providerViews(
  catalog: CatalogResponse,
  apps: AppView[],
  accounts: AccountView[],
): ProviderView[] {
  const index = buildKindIndex(catalog);
  return catalog.providers.map((provider) => {
    const providerApps = apps.filter(
      (app) => index.appKinds.get(app.kind)?.provider === provider.id,
    );
    const providerAccounts = accounts.filter(
      (account) => index.accountKinds.get(account.kind)?.provider === provider.id,
    );
    const problems: string[] = [];
    if (providerApps.some((app) => app.status === 'invalid')) {
      problems.push('app invalid');
    }
    if (providerAccounts.some((account) => account.status === 'expired')) {
      problems.push('expired');
    }
    if (providerAccounts.some((account) => account.status === 'error')) {
      problems.push('account error');
    }
    return {
      provider,
      counts: {
        apps: providerApps.length,
        accounts: providerAccounts.length,
        problems,
      } satisfies ProviderCounts,
    };
  });
}

function plural(count: number, word: string): string {
  return count === 1 ? `1 ${word}` : `${count} ${word}s`;
}

interface ProviderTileProps {
  orgId: string;
  provider: ProviderCatalogEntry;
  counts: ProviderCounts;
}

function ProviderTile({ orgId, provider, counts }: ProviderTileProps) {
  const path = studioPath.app(orgId, provider.id);
  return (
    <Card className="gap-3 bg-popover p-4" data-testid={`apps-tile-${provider.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <ProviderMark label={provider.label} iconSvg={provider.iconSvg} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            to={path}
            className="truncate font-medium text-sm hover:underline"
            data-testid={`apps-open-${provider.id}`}
          >
            {provider.label}
          </Link>
          <p className="line-clamp-2 text-[13px] text-muted-foreground">{provider.description}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-border/40 border-t pt-2.5">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {plural(counts.apps, 'app')} · {plural(counts.accounts, 'account')}
          </span>
          {counts.problems.map((problem) => (
            <RowChip key={problem} tone="danger">
              {problem}
            </RowChip>
          ))}
        </span>
        <Link
          to={path}
          className="shrink-0 text-muted-foreground text-sm hover:text-foreground"
          data-testid={`apps-details-${provider.id}`}
        >
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>
    </Card>
  );
}
