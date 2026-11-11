import type { AddonPermissionRisk } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheckIcon, ShieldIcon } from 'lucide-react';
import { useState } from 'react';
import { orgAddonDetailQueryKey, putOrgAddonGrants } from '@/shared/api/addons';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { ConsentDialog } from '../consent-dialog';
import { grantedIdsOf } from '../lib/grant-diff';
import type { SectionProps } from '../lib/section-props';

const RISK_TONE: Record<AddonPermissionRisk, 'danger' | 'warn' | 'neutral'> = {
  high: 'danger',
  medium: 'warn',
  low: 'neutral',
};

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
      actions={
        installed && declared.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            data-testid="addon-grants-edit"
          >
            Edit grants
          </Button>
        ) : undefined
      }
    >
      {declared.length === 0 ? (
        <RowItem title="No rights declared" />
      ) : (
        declared.map((permission) => {
          const isGranted = grantedIds.has(permission.id);
          return (
            <Row
              key={permission.id}
              testId={`addon-permission-${permission.id}`}
              icon={
                isGranted ? (
                  <ShieldCheckIcon className="text-status-ok" />
                ) : (
                  <ShieldIcon className="text-muted-foreground/60" />
                )
              }
              title={permission.id}
              chips={
                <>
                  <RowChip tone={RISK_TONE[permission.risk]}>{permission.risk}</RowChip>
                  {permission.optional ? (
                    <RowChip>optional</RowChip>
                  ) : (
                    <RowChip tone="info">required</RowChip>
                  )}
                  {installed ? (
                    <RowChip tone={isGranted ? 'ok' : 'neutral'}>
                      {isGranted ? 'granted' : 'not granted'}
                    </RowChip>
                  ) : null}
                </>
              }
              summary={permission.reason}
            />
          );
        })
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
