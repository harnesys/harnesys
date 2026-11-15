import type { AddonGrantEntry, OrgAddonDetail } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PackageOpenIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { RowListSkeleton, SettingsEmpty, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { toast } from '@/shared/ui/toast';
import { AddonTile } from './addon-tile';
import { ConsentDialog } from './consent-dialog';
import { HostPolicyDialog } from './host-policy-dialog';
import { InstallAddonDialog } from './install-addon-dialog';
import type { AddonCardModel } from './lib/addon-cards';
import { buildCards } from './lib/addon-cards';

interface AddonEmptyState {
  testId: string;
  title: string;
  description: string;
}

const INSTALLED_EMPTY: AddonEmptyState = {
  testId: 'manage-addons-installed-empty',
  title: 'No add-ons enabled yet',
  description: 'Enable an add-on from the Marketplace tab.',
};

const MARKETPLACE_EMPTY: AddonEmptyState = {
  testId: 'manage-addons-marketplace-empty',
  title: 'No add-ons found',
  description:
    'Add-ons from the host directory appear here automatically. Use Reload after adding packages manually, or install one from a path or URL.',
};

export function ManageAddonsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const list = useQuery(orgAddonsQuery(orgId));
  const packages = useQuery(addonPackagesQuery());
  const [consent, setConsent] = useState<OrgAddonDetail | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

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
  const query = q.trim().toLowerCase();
  const matches = (card: AddonCardModel) =>
    query === '' ||
    card.title.toLowerCase().includes(query) ||
    card.description.toLowerCase().includes(query) ||
    card.id.toLowerCase().includes(query);
  const visibleCards = query === '' ? cards : cards.filter(matches);
  const installedCards = visibleCards.filter((card) => card.org?.enabled === true);
  const marketplaceCards = visibleCards.filter((card) => card.org?.enabled !== true);

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

  const renderGrid = (items: AddonCardModel[]) => (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="manage-addons-list">
      {items.map(renderTile)}
    </div>
  );

  const renderTab = (items: AddonCardModel[], empty: AddonEmptyState) => {
    if (isPending) {
      return <RowListSkeleton rows={3} testId="manage-addons-skeleton" />;
    }
    if (items.length > 0) {
      return renderGrid(items);
    }
    const searching = query !== '';
    return (
      <SettingsEmpty
        title={searching ? 'No matches' : empty.title}
        description={searching ? 'Nothing matches this search.' : empty.description}
        testId={empty.testId}
      />
    );
  };

  return (
    <div className="flex w-full flex-col gap-4" data-testid="manage-addons-pane">
      {error ? <SettingsErrorBanner message={error} testId="manage-addons-error" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 max-w-sm grow basis-52">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-8 pl-8 font-mono text-sm"
            placeholder="Search add-ons..."
            value={q}
            onChange={(event) => setQ(event.target.value)}
            data-testid="addon-search"
          />
          {q ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQ('')}
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
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
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setPolicyOpen(true)}
            data-testid="addon-source-policy"
          >
            <ShieldCheckIcon />
            Source policy
          </Button>
        </div>
      </div>
      <Tabs defaultValue="installed">
        <TabsList className="w-full">
          <TabsTrigger value="installed" className="flex-1">
            Installed
          </TabsTrigger>
          <TabsTrigger value="marketplace" className="flex-1">
            Marketplace
          </TabsTrigger>
        </TabsList>
        <TabsContent value="installed" className="mt-4" data-testid="manage-addons-installed">
          {renderTab(installedCards, INSTALLED_EMPTY)}
        </TabsContent>
        <TabsContent value="marketplace" className="mt-4" data-testid="manage-addons-marketplace">
          {renderTab(marketplaceCards, MARKETPLACE_EMPTY)}
        </TabsContent>
      </Tabs>
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
      {policyOpen ? <HostPolicyDialog onResolve={() => setPolicyOpen(false)} /> : null}
    </div>
  );
}
