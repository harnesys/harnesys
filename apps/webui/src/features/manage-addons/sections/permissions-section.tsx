import type { AddonPermissionView } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheckIcon, ShieldIcon } from 'lucide-react';
import { useState } from 'react';
import { orgAddonDetailQueryKey, putOrgAddonGrants } from '@/shared/api/addons';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RowChip, RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { ConsentDialog } from '../consent-dialog';
import { grantedIdsOf } from '../lib/grant-diff';
import { PERMISSION_RISK_TONE } from '../lib/permission-risk';
import type { SectionProps } from '../lib/section-props';

export function PermissionsSection({ orgId, detail, installed }: SectionProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const declared = detail.permissions.declared;
  const granted = detail.permissions.granted;
  const grantedIds = grantedIdsOf(granted);
  const grantedKey = [...grantedIds].sort().join('|');

  const saveGrants = async (grants: { id: string; scope?: Record<string, unknown> }[]) => {
    setPending(true);
    setError(null);
    try {
      await putOrgAddonGrants(orgId, detail.addonId, { grants });
      setEditing(false);
      await queryClient.invalidateQueries({
        queryKey: orgAddonDetailQueryKey(orgId, detail.addonId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <RowSection
      label={installed ? 'Permissions' : 'Requested permissions'}
      count={declared.length}
      className="gap-0"
      actions={
        installed && declared.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            data-testid="addon-grants-edit"
            className="text-muted-foreground"
          >
            <ShieldCheckIcon />
            Edit grants
          </Button>
        ) : undefined
      }
    >
      {declared.length === 0 ? (
        <RowItem title="No rights declared" />
      ) : (
        declared.map((permission) => (
          <PermissionLine
            key={permission.id}
            permission={permission}
            granted={grantedIds.has(permission.id)}
            showState={installed}
          />
        ))
      )}
      {installed &&
      (detail.permissions.diff.added.length > 0 || detail.permissions.diff.removed.length > 0) ? (
        <div className="rounded-md border border-status-warn/40 bg-status-warn/10 px-3 py-2 text-xs">
          <p className="font-medium text-status-warn">Pending grant change</p>
          {detail.permissions.diff.added.length > 0 ? (
            <p>Added: {detail.permissions.diff.added.map((p) => p.id).join(', ')}</p>
          ) : null}
          {detail.permissions.diff.removed.length > 0 ? (
            <p>Removed: {detail.permissions.diff.removed.join(', ')}</p>
          ) : null}
        </div>
      ) : null}
      {error ? <SettingsErrorBanner message={error} testId="addon-grants-error" /> : null}
      <ConsentDialog
        key={`${detail.addonId}:${grantedKey}:${detail.version}`}
        open={editing}
        onOpenChange={setEditing}
        title="Grant rights"
        description="Choose which declared rights the add-on receives in this organization. Required rights cannot be declined."
        permissions={declared}
        initialGranted={[...grantedIds]}
        pending={pending}
        confirmLabel="Save grants"
        onConfirm={(grants) => void saveGrants(grants)}
      />
    </RowSection>
  );
}

function PermissionLine({
  permission,
  granted,
  showState,
}: {
  permission: AddonPermissionView;
  granted: boolean;
  showState: boolean;
}) {
  const declined = showState && !granted;
  return (
    <div
      className="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40"
      data-testid={`addon-permission-${permission.id}`}
    >
      {granted ? (
        <ShieldCheckIcon className="size-3.5 shrink-0 text-status-ok" aria-hidden />
      ) : (
        <ShieldIcon
          className={cn(
            'size-3.5 shrink-0',
            declined ? 'text-status-warn' : 'text-muted-foreground/60',
          )}
          aria-hidden
        />
      )}
      <span className="min-w-0 truncate font-mono text-[13px] leading-5">{permission.id}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs leading-4">
        {permission.reason}
      </span>
      {permission.optional ? <RowChip>optional</RowChip> : null}
      {declined ? <RowChip tone="warn">not granted</RowChip> : null}
      <RowChip tone={PERMISSION_RISK_TONE[permission.risk]}>{permission.risk}</RowChip>
    </div>
  );
}
