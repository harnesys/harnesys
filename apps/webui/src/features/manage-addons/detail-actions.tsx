import type { AddonGrantEntry, OrgAddonDetail } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EllipsisIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Undo2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { addonPackagesQuery } from '@/shared/api/addon-packages';
import {
  deleteOrgAddon,
  disableOrgAddon,
  enableOrgAddon,
  resetOrgAddonQuarantine,
  restartOrgAddon,
  rollbackOrgAddon,
  updateOrgAddon,
} from '@/shared/api/addons';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { ConsentDialog } from './consent-dialog';
import { invalidateAddonScope } from './lib/addon-scope';

function failureMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stateHint(detail: OrgAddonDetail): string {
  if (detail.compatibility.outcome === 'incompatible') {
    return 'Not compatible with this host, so it cannot be started here.';
  }
  if (!detail.installed) {
    return 'Starting grants the requested rights and runs the add-on for this organization.';
  }
  if (!detail.enabled) {
    return 'Stopped. Starting runs the instance and registers its capabilities.';
  }
  if (detail.health === 'quarantined') {
    return 'Quarantined after repeated crashes. Reset the quarantine to start it again.';
  }
  if (detail.health === 'failed') {
    return 'The instance failed. Fix the cause listed below, then restart it.';
  }
  return 'Running for this organization. Stopping unregisters its capabilities.';
}

export function AddonControls({
  orgId,
  detail,
  onRemoved,
}: {
  orgId: string;
  detail: OrgAddonDetail;
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState<'enable' | 'update' | null>(null);
  const packages = useQuery(addonPackagesQuery());
  const candidates = (packages.data?.items ?? [])
    .filter((pkg) => pkg.id === detail.addonId)
    .map((pkg) => pkg.version)
    .filter((version) => version !== detail.version)
    .sort();

  const incompatible = detail.compatibility.outcome === 'incompatible';
  const canStart = !incompatible;
  const updateVersion = detail.updateAvailable;
  const needsApproval = detail.permissions.diff.added.length > 0;
  const hasMenuItems = detail.installed || candidates.length > 0;

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    try {
      await action();
      await invalidateAddonScope(queryClient, orgId);
    } catch (err) {
      toast.add({ title: 'Add-on action failed', description: failureMessage(err) });
    } finally {
      setPending(false);
    }
  };

  const enable = (grants: AddonGrantEntry[]) => {
    setDialog(null);
    void run(() => enableOrgAddon(orgId, detail.addonId, { grants }));
  };

  const approveUpdate = (grants: AddonGrantEntry[]) => {
    setDialog(null);
    if (!updateVersion) {
      return;
    }
    void run(() => updateOrgAddon(orgId, detail.addonId, { version: updateVersion, grants }));
  };

  const update = () => {
    if (!updateVersion) {
      return;
    }
    if (needsApproval) {
      setDialog('update');
      return;
    }
    void run(() => updateOrgAddon(orgId, detail.addonId, { version: updateVersion }));
  };

  const rollback = (version: string) => {
    void alert
      .confirm({
        title: `Roll back ${detail.title} to ${version}?`,
        testId: 'addon-rollback-confirm',
      })
      .then((ok) => {
        if (ok) {
          void run(() => rollbackOrgAddon(orgId, detail.addonId, { version }));
        }
      });
  };

  const remove = async (data: 'keep' | 'purge') => {
    const ok = await alert.confirm({
      title:
        data === 'purge' ? 'Remove and erase all add-on data?' : 'Remove and keep add-on data?',
      description:
        data === 'purge'
          ? 'The add-on database, files, secrets, bindings, triggers, and job state are deleted.'
          : 'Configuration is kept; the add-on is disabled and unregistered.',
      confirmText: 'Remove',
      variant: 'destructive',
      testId: 'addon-remove-confirm',
    });
    if (!ok) {
      return;
    }
    setPending(true);
    try {
      await disableOrgAddon(orgId, detail.addonId);
      await deleteOrgAddon(orgId, detail.addonId, data);
      onRemoved();
    } catch (err) {
      toast.add({ title: 'Add-on removal failed', description: failureMessage(err) });
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t pt-4"
      data-testid="addon-controls"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-sm">
          {detail.enabled ? 'Stop add-on' : 'Start add-on'}
        </span>
        <span className="text-muted-foreground text-xs leading-4">{stateHint(detail)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {updateVersion ? (
          <Button
            type="button"
            size="sm"
            variant={needsApproval ? 'default' : 'outline'}
            disabled={pending}
            onClick={update}
            data-testid="addon-update"
          >
            Update to {updateVersion}
          </Button>
        ) : null}
        <Switch
          checked={detail.enabled}
          disabled={pending || !canStart}
          onCheckedChange={(next) => {
            if (next === true) {
              setDialog('enable');
              return;
            }
            void run(() => disableOrgAddon(orgId, detail.addonId));
          }}
          aria-label={detail.enabled ? `Stop ${detail.title}` : `Start ${detail.title}`}
          data-testid="addon-toggle"
        />
        {hasMenuItems ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label="Add-on actions"
                  data-testid="addon-menu"
                >
                  <EllipsisIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-52">
              {detail.enabled ? (
                <DropdownMenuItem
                  onClick={() => void run(() => restartOrgAddon(orgId, detail.addonId))}
                  data-testid="addon-restart"
                >
                  <RefreshCwIcon />
                  Restart
                </DropdownMenuItem>
              ) : null}
              {detail.enabled && detail.health === 'quarantined' ? (
                <DropdownMenuItem
                  onClick={() => void run(() => resetOrgAddonQuarantine(orgId, detail.addonId))}
                  data-testid="addon-quarantine-reset"
                >
                  <TriangleAlertIcon />
                  Reset quarantine
                </DropdownMenuItem>
              ) : null}
              {candidates.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  {candidates.map((version) => (
                    <DropdownMenuItem
                      key={version}
                      onClick={() => rollback(version)}
                      data-testid={`addon-rollback-${version}`}
                    >
                      <Undo2Icon />
                      Roll back to {version}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              {detail.installed ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void remove('keep')}
                    data-testid="addon-remove-keep"
                  >
                    <Trash2Icon />
                    Remove, keep data
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void remove('purge')}
                    data-testid="addon-remove-purge"
                  >
                    <Trash2Icon />
                    Remove, erase data
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <ConsentDialog
        key={`enable-${detail.addonId}:${detail.version}`}
        open={dialog === 'enable'}
        onOpenChange={(open) => setDialog(open ? 'enable' : null)}
        title={`Start ${detail.title}`}
        description="Review the rights the add-on requests. Required rights cannot be declined; optional rights start off."
        permissions={detail.permissions.declared}
        pending={pending}
        confirmLabel="Start"
        onConfirm={enable}
      />
      <ConsentDialog
        key={`update-${detail.addonId}:${updateVersion ?? ''}`}
        open={dialog === 'update'}
        onOpenChange={(open) => setDialog(open ? 'update' : null)}
        title={`Update ${detail.title} to ${updateVersion ?? ''}`}
        description={`This version requests ${detail.permissions.diff.added.length === 1 ? 'a new right' : 'new rights'}. Confirm to update, or cancel to stay on ${detail.version}.`}
        permissions={detail.permissions.diff.added}
        removed={detail.permissions.diff.removed}
        pending={pending}
        confirmLabel="Confirm update"
        onConfirm={approveUpdate}
      />
    </div>
  );
}
