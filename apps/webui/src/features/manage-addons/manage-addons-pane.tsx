import type {
  AddonGrantEntry,
  AddonPackageView,
  AddonTrust,
  OrgAddonDetail,
  OrgAddonSummary,
} from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, PackageOpenIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  addonPackagesQuery,
  pruneAddonPackages,
  rescanAddonPackages,
} from '@/shared/api/addon-packages';
import {
  disableOrgAddon,
  enableOrgAddon,
  getOrgAddon,
  orgAddonsQuery,
  watchAddonEvents,
} from '@/shared/api/addons';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { dialog } from '@/shared/services/overlay';
import { Badge } from '@/shared/ui/badge';
import { Button, buttonVariants } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Card } from '@/shared/ui/card';
import {
  RowListSkeleton,
  SettingsEmpty,
  SettingsErrorBanner,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { AddonMark } from './addon-mark';
import { ConsentDialog } from './consent-dialog';
import { InstallAddonDialog } from './install-addon-dialog';
import { addonHealthTone } from './lib/health-tone';

interface AddonCardModel {
  id: string;
  title: string;
  description: string;
  versions: Array<{ version: string; trust: AddonTrust }>;
  org: OrgAddonSummary | null;
}

export function ManageAddonsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const list = useQuery(orgAddonsQuery(orgId));
  const packages = useQuery(addonPackagesQuery());
  const [consent, setConsent] = useState<OrgAddonDetail | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['addons', orgId] });
    void queryClient.invalidateQueries({ queryKey: ['addon-packages'] });
  };

  useEffect(() => {
    const unsubscribe = watchAddonEvents(orgId, {
      onEvent: () => {
        void queryClient.invalidateQueries({ queryKey: ['addons', orgId] });
      },
    });
    return unsubscribe;
  }, [queryClient, orgId]);

  const startEnable = async (addonId: string) => {
    setPending(true);
    setError(null);
    try {
      const detail = await getOrgAddon(orgId, addonId);
      setConsent(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const confirmEnable = async (grants: AddonGrantEntry[]) => {
    if (!consent) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await enableOrgAddon(orgId, consent.addonId, { grants });
      setConsent(null);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const disable = async (addonId: string) => {
    setPending(true);
    setError(null);
    try {
      await disableOrgAddon(orgId, addonId);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const reload = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await rescanAddonPackages();
      toast.add({
        type: result.added.length > 0 ? 'success' : 'info',
        title:
          result.added.length > 0
            ? `Registered ${result.added.length} new package version(s)`
            : 'Add-on directories scanned, nothing new found',
      });
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const prune = async () => {
    setPending(true);
    setError(null);
    try {
      await pruneAddonPackages();
      toast.add({ type: 'success', title: 'Pruned unused package versions' });
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const openInstallDialog = () => {
    void dialog
      .open<boolean, { source?: string }>(InstallAddonDialog, {
        title: 'Install package',
        description:
          'Scan a package directory or repository, review its permissions, then install it on this host.',
        className: 'sm:max-w-lg',
        testId: 'install-addon-dialog',
      })
      .then((installed) => {
        if (installed) {
          void invalidate();
        }
      });
  };

  const cards = buildCards(packages.data?.items ?? [], list.data?.items ?? []);
  const isPending = list.isPending || packages.isPending;
  const enabledCards = cards.filter((card) => card.org?.enabled === true);
  const otherCards = cards.filter((card) => card.org?.enabled !== true);

  const renderTile = (card: AddonCardModel) => (
    <AddonTile
      key={card.id}
      card={card}
      pending={pending}
      path={studioPath.addon(orgId, card.id)}
      onEnable={() => void startEnable(card.id)}
      onDisable={() => void disable(card.id)}
    />
  );

  return (
    <div className="flex w-full flex-col gap-8" data-testid="manage-addons-pane">
      {error ? <SettingsErrorBanner message={error} testId="manage-addons-error" /> : null}
      <SettingsSection
        label="Add-ons"
        count={isPending ? undefined : cards.length}
        description="System add-ons ship with the app. Enable them for this organization, or install extra packages from a path or URL."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={pending}
              onClick={() => void reload()}
              data-testid="addon-reload"
            >
              <RefreshCwIcon />
              Reload
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={openInstallDialog}
              data-testid="addon-install"
            >
              <PackageOpenIcon />
              Install package
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={pending}
              onClick={() => void prune()}
              data-testid="addon-prune"
            >
              <Trash2Icon />
              Prune unused
            </Button>
          </>
        }
      >
        {isPending ? <RowListSkeleton rows={3} testId="manage-addons-skeleton" /> : null}
        {!isPending && cards.length === 0 ? (
          <SettingsEmpty
            title="No add-ons found"
            description="System add-ons appear here automatically from the add-ons directory. Use Reload after adding packages manually, or install from a path or URL."
            testId="manage-addons-empty"
          />
        ) : null}
      </SettingsSection>
      {!isPending && enabledCards.length > 0 ? (
        <SettingsSection label="Enabled" count={enabledCards.length} testId="manage-addons-enabled">
          <div className="grid gap-3 sm:grid-cols-2">{enabledCards.map(renderTile)}</div>
        </SettingsSection>
      ) : null}
      {!isPending && otherCards.length > 0 ? (
        <SettingsSection
          label="Available"
          count={otherCards.length}
          testId="manage-addons-available"
        >
          <div className="grid gap-3 sm:grid-cols-2" data-testid="manage-addons-list">
            {otherCards.map(renderTile)}
          </div>
        </SettingsSection>
      ) : null}
      <ConsentDialog
        key={consent ? `${consent.addonId}:${consent.version}` : 'consent-none'}
        open={consent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConsent(null);
          }
        }}
        title={consent ? `Enable ${consent.title}` : ''}
        description="Review the rights the add-on requests. Required rights cannot be declined."
        permissions={consent?.permissions.declared ?? []}
        pending={pending}
        confirmLabel="Enable"
        onConfirm={(grants) => void confirmEnable(grants)}
      />
    </div>
  );
}

interface AddonTileProps {
  card: AddonCardModel;
  pending: boolean;
  path: string;
  onEnable: () => void;
  onDisable: () => void;
}

function AddonTile({ card, pending, path, onEnable, onDisable }: AddonTileProps) {
  const latest = card.versions[0];
  const org = card.org;
  const enabled = org?.enabled === true;
  return (
    <Card className="gap-3 bg-popover p-4" data-testid={`manage-addon-${card.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <AddonMark size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to={path}
              data-testid={`addon-open-${card.id}`}
              className="truncate font-medium text-sm hover:underline"
            >
              {card.title}
            </Link>
            {enabled ? (
              <Badge variant="secondary" data-testid={`addon-state-${card.id}`}>
                Enabled
              </Badge>
            ) : null}
            {latest?.trust === 'builtin' ? <Badge variant="outline">System</Badge> : null}
          </div>
          <p className="line-clamp-2 text-[13px] text-muted-foreground">
            {card.description || card.id}
          </p>
        </div>
        {org ? (
          <Switch
            size="sm"
            checked={enabled}
            disabled={pending}
            onCheckedChange={(value) => (value === true ? onEnable() : onDisable())}
            data-testid={`addon-switch-${card.id}`}
            aria-label={enabled ? `Disable ${card.title}` : `Enable ${card.title}`}
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-border/40 border-t pt-2.5">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {org ? <StatusDot tone={addonHealthTone(org.health)} label={org.health} /> : null}
          <span className="font-mono text-[11px] text-muted-foreground">
            {org?.version ?? latest?.version ?? card.id}
          </span>
          {card.versions.length > 1 ? (
            <RowChip>{`${card.versions.length} versions`}</RowChip>
          ) : null}
          {latest && latest.trust !== 'builtin' ? <RowChip>{latest.trust}</RowChip> : null}
          {org && org.compatibility.outcome === 'needs_consent' ? (
            <RowChip tone="warn">needs consent</RowChip>
          ) : null}
          {org && org.compatibility.outcome === 'incompatible' ? (
            <RowChip tone="danger">incompatible</RowChip>
          ) : null}
          {org?.updateAvailable ? (
            <RowChip tone="warn">update {org.updateAvailable}</RowChip>
          ) : null}
        </span>
        <Link
          to={path}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'shrink-0 text-muted-foreground',
          )}
          data-testid={`addon-details-${card.id}`}
        >
          Details
          <ChevronRightIcon data-icon="inline-end" />
        </Link>
      </div>
    </Card>
  );
}

function buildCards(packages: AddonPackageView[], orgAddons: OrgAddonSummary[]): AddonCardModel[] {
  const byId = new Map<string, AddonCardModel>();
  for (const pkg of packages) {
    const existing = byId.get(pkg.id);
    if (existing) {
      existing.versions.push({ version: pkg.version, trust: pkg.trust });
      continue;
    }
    byId.set(pkg.id, {
      id: pkg.id,
      title: pkg.title,
      description: pkg.description,
      versions: [{ version: pkg.version, trust: pkg.trust }],
      org: null,
    });
  }
  for (const org of orgAddons) {
    const existing = byId.get(org.addonId);
    if (existing) {
      existing.org = org;
      continue;
    }
    byId.set(org.addonId, {
      id: org.addonId,
      title: org.title,
      description: org.description,
      versions: [],
      org,
    });
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}
