import type { AddonPermissionRisk } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { orgAddonDetailQueryKey, putOrgAddonGrants } from '@/shared/api/addons';
import { Button } from '@/shared/ui/button';
import { RowChip, RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { ConsentDialog } from '../consent-dialog';
import { grantedIdsOf } from '../lib/grant-diff';
import type { SectionProps } from '../lib/section-props';

const RISK_TONE: Record<AddonPermissionRisk, 'danger' | 'warn' | 'neutral'> = {
  high: 'danger',
  medium: 'warn',
  low: 'neutral',
};

export function PermissionsSection({ orgId, detail }: SectionProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const declared = detail.permissions.declared;
  const granted = detail.permissions.granted;
  const grantedIds = grantedIdsOf(granted);

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
      label="Permissions"
      count={declared.length}
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={declared.length === 0}
          onClick={() => setEditing(true)}
          data-testid="addon-grants-edit"
        >
          Edit grants
        </Button>
      }
    >
      {declared.length === 0 ? (
        <RowItem title="No rights declared" />
      ) : (
        declared.map((permission) => {
          const isGranted = grantedIds.has(permission.id);
          return (
            <div
              key={permission.id}
              className="flex min-w-0 flex-col gap-0.5 px-1 py-0.5"
              data-testid={`addon-permission-${permission.id}`}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <p className="truncate font-mono text-[12px] leading-snug">{permission.id}</p>
                <RowChip tone={RISK_TONE[permission.risk]}>{permission.risk}</RowChip>
                {permission.optional ? null : <RowChip>required</RowChip>}
                <RowChip tone={isGranted ? 'ok' : 'neutral'}>
                  {isGranted ? 'granted' : 'not granted'}
                </RowChip>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{permission.reason}</p>
            </div>
          );
        })
      )}
      {detail.permissions.diff.added.length > 0 || detail.permissions.diff.removed.length > 0 ? (
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
        key={`${detail.addonId}:${grantedIds.size}:${detail.version}`}
        open={editing}
        onOpenChange={setEditing}
        title="Grant rights"
        description="Choose which declared rights the add-on receives. Required rights cannot be declined."
        permissions={declared}
        pending={pending}
        confirmLabel="Save grants"
        onConfirm={(grants) => void saveGrants(grants)}
      />
    </RowSection>
  );
}
