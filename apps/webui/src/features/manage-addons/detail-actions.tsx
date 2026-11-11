import type { AddonGrantEntry, OrgAddonDetail } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpCircleIcon,
  EllipsisIcon,
  PowerIcon,
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
  orgAddonDetailQueryKey,
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
import { toast } from '@/shared/ui/toast';
import { ConsentDialog } from './consent-dialog';

function failureMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  const installedVersions = (packages.data?.items ?? [])
    .filter((pkg) => pkg.id === detail.addonId)
    .map((pkg) => pkg.version);
  const candidates = installedVersions.filter((version) => version !== detail.version).sort();

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    try {
      await action();
      await queryClient.invalidateQueries({
        queryKey: orgAddonDetailQueryKey(orgId, detail.addonId),
      });
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

  const update = (grants: AddonGrantEntry[]) => {
    setDialog(null);
    void run(() =>
      updateOrgAddon(orgId, detail.addonId, {
        version: detail.updateAvailable ?? detail.version,
        grants,
      }),
    );
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
    <div className="flex min-w-0 flex-col gap-2" data-testid="addon-controls">
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
              onClick={() => void run(() => disableOrgAddon(orgId, detail.addonId))}
              data-testid="addon-disable"
            >
              <PowerIcon />
              Disable
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setDialog('enable')} data-testid="addon-enable">
              <PowerIcon />
              Enable
            </DropdownMenuItem>
          )}
          {detail.updateAvailable ? (
            <DropdownMenuItem onClick={() => setDialog('update')} data-testid="addon-update">
              <ArrowUpCircleIcon />
              Update to {detail.updateAvailable}
            </DropdownMenuItem>
          ) : null}
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
        </DropdownMenuContent>
      </DropdownMenu>
      <ConsentDialog
        key={`enable-${detail.addonId}:${detail.version}`}
        open={dialog === 'enable'}
        onOpenChange={(open) => setDialog(open ? 'enable' : null)}
        title={`Enable ${detail.title}`}
        description="Review the rights the add-on requests. Required rights cannot be declined."
        permissions={detail.permissions.declared}
        pending={pending}
        confirmLabel="Enable"
        onConfirm={enable}
      />
      <ConsentDialog
        key={`update-${detail.addonId}:${detail.updateAvailable ?? ''}`}
        open={dialog === 'update'}
        onOpenChange={(open) => setDialog(open ? 'update' : null)}
        title={`Update ${detail.title} to ${detail.updateAvailable ?? ''}`}
        description="The new version requests additional rights. Confirm to apply, cancel to stay pinned."
        permissions={detail.permissions.diff.added}
        removed={detail.permissions.diff.removed}
        pending={pending}
        confirmLabel="Confirm update"
        onConfirm={update}
      />
    </div>
  );
}
