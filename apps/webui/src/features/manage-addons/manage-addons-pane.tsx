import type { AddonGrantEntry, OrgAddonDetail } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageOpenIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { addonPackagesQuery, pruneAddonPackages } from '@/shared/api/addon-packages';
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
import { Row, RowChip, RowHeader, RowList } from '@/shared/ui/capability-rows';
import {
  RowListSkeleton,
  SettingsEmpty,
  SettingsErrorBanner,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { ConsentDialog } from './consent-dialog';
import { HostPackagesCard } from './host-packages-card';
import { InstallAddonDialog } from './install-addon-dialog';

export function ManageAddonsPane({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useQuery(orgAddonsQuery(orgId));
  const packages = useQuery(addonPackagesQuery());
  const [consent, setConsent] = useState<OrgAddonDetail | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['addons', orgId] });

  useEffect(() => {
    const unsubscribe = watchAddonEvents(orgId, {
      onEvent: () => {
        void queryClient.invalidateQueries({ queryKey: ['addons', orgId] });
      },
    });
    return unsubscribe;
  }, [queryClient, orgId]);

  const addons = list.data?.items ?? [];

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

  const refreshPackages = () => queryClient.invalidateQueries({ queryKey: ['addon-packages'] });

  const prune = async () => {
    setPending(true);
    setError(null);
    try {
      await pruneAddonPackages();
      toast.add({ type: 'success', title: 'Pruned unused package versions' });
      await refreshPackages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const openInstallDialog = () => {
    void dialog
      .open<boolean, { source?: string }>(InstallAddonDialog, {
        title: 'Install add-on package',
        description: 'Plan a package from a path or URL, review it, then confirm the install.',
        className: 'sm:max-w-lg',
        testId: 'install-addon-dialog',
      })
      .then((installed) => {
        if (installed) {
          void invalidate();
        }
      });
  };

  const enabledIds = new Set(addons.map((addon) => addon.addonId));
  const available = (packages.data?.items ?? [])
    .filter((pkg) => !enabledIds.has(pkg.id))
    .filter((pkg, index, all) => all.findIndex((other) => other.id === pkg.id) === index);

  return (
    <div className="flex w-full flex-col gap-8" data-testid="manage-addons-pane">
      {error ? <SettingsErrorBanner message={error} testId="manage-addons-error" /> : null}
      <RowHeader
        label="Add-ons"
        count={list.isPending ? undefined : addons.length}
        description="Add-ons enabled for this organization. State updates arrive live."
      >
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
      </RowHeader>
      {list.isPending ? <RowListSkeleton rows={3} testId="manage-addons-skeleton" /> : null}
      {!list.isPending && addons.length === 0 ? (
        <SettingsEmpty
          title="No add-ons yet"
          description="Install the starter add-on or a package from source, then enable it here."
          testId="manage-addons-empty"
        />
      ) : null}
      {addons.length > 0 ? (
        <RowList testId="manage-addons-list">
          {addons.map((addon) => (
            <Row
              key={addon.addonId}
              testId={`manage-addon-${addon.addonId}`}
              title={addon.title}
              mono={false}
              summary={addon.addonId}
              alwaysShowActions
              chips={
                <>
                  <RowChip>{addon.version}</RowChip>
                  {addon.enabled ? <RowChip tone="ok">enabled</RowChip> : null}
                  <RowChip tone={healthTone(addon.health)}>{addon.health}</RowChip>
                  {addon.compatibility.outcome === 'needs_consent' ? (
                    <RowChip tone="warn">needs consent</RowChip>
                  ) : null}
                  {addon.compatibility.outcome === 'incompatible' ? (
                    <RowChip tone="danger">incompatible</RowChip>
                  ) : null}
                  {addon.updateAvailable ? (
                    <RowChip tone="warn">update: {addon.updateAvailable}</RowChip>
                  ) : null}
                </>
              }
              actions={
                <>
                  {addon.enabled ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void disable(addon.addonId)}
                      data-testid={`addon-disable-${addon.addonId}`}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => void startEnable(addon.addonId)}
                      data-testid={`addon-enable-${addon.addonId}`}
                    >
                      Enable
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(studioPath.addon(orgId, addon.addonId))}
                    data-testid={`addon-open-${addon.addonId}`}
                  >
                    Open
                  </Button>
                </>
              }
            />
          ))}
        </RowList>
      ) : null}
      {available.length > 0 ? (
        <SettingsSection
          label="Available packages"
          count={available.length}
          description="Installed on this host but not enabled here."
          testId="manage-addons-available"
        >
          <RowList testId="manage-addons-available-list">
            {available.map((pkg) => (
              <Row
                key={`${pkg.id}@${pkg.version}`}
                testId={`available-addon-${pkg.id}`}
                title={pkg.title}
                mono={false}
                summary={pkg.description}
                alwaysShowActions
                chips={
                  <>
                    <RowChip>{pkg.version}</RowChip>
                    <RowChip>{pkg.trust}</RowChip>
                  </>
                }
                actions={
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => void startEnable(pkg.id)}
                    data-testid={`available-addon-enable-${pkg.id}`}
                  >
                    Enable
                  </Button>
                }
              />
            ))}
          </RowList>
        </SettingsSection>
      ) : null}
      <HostPackagesCard />
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

function healthTone(health: string): 'ok' | 'warn' | 'danger' {
  if (health === 'running') {
    return 'ok';
  }
  if (health === 'quarantined' || health === 'failed') {
    return 'danger';
  }
  return 'warn';
}
