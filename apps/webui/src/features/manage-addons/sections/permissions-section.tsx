import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { orgAddonDetailQueryKey, putOrgAddonGrants } from '@/shared/api/addons';
import { Button } from '@/shared/ui/button';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { ConsentDialog } from '../consent-dialog';
import { grantedIdsOf } from '../lib/grant-diff';
import type { SectionProps } from '../lib/section-props';

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
    <RowSection label="Permissions" count={declared.length}>
      {declared.length === 0 ? (
        <RowItem title="No rights declared" />
      ) : (
        declared.map((permission) => {
          const isGranted = grantedIds.has(permission.id);
          return (
            <RowItem
              key={permission.id}
              title={permission.id}
              description={
                <>
                  {permission.reason}
                  <span className="ml-1 font-mono">
                    [{permission.risk}
                    {permission.optional ? '' : ', required'},{' '}
                    {isGranted ? 'granted' : 'not granted'}]
                  </span>
                </>
              }
              testId={`addon-permission-${permission.id}`}
            />
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
      <div>
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
      </div>
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
