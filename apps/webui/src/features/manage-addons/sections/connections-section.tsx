import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AccountPicker } from '@/features/manage-apps';
import { orgAddonDetailQueryKey, putOrgAddonBindings } from '@/shared/api/addons';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import type { SectionProps } from '../lib/section-props';

export function ConnectionsSection({ orgId, detail, section }: SectionProps) {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onlyConnections = Array.isArray(section.connections)
    ? (section.connections as string[])
    : undefined;
  const connections = onlyConnections
    ? detail.connections.filter((connection) => onlyConnections.includes(connection.connectionId))
    : detail.connections;

  const saveBinding = async (connectionId: string, accountIds: string[]) => {
    setPendingId(connectionId);
    setError(null);
    try {
      await putOrgAddonBindings(orgId, detail.addonId, connectionId, accountIds);
      await queryClient.invalidateQueries({
        queryKey: orgAddonDetailQueryKey(orgId, detail.addonId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  };

  if (connections.length === 0) {
    return null;
  }

  return (
    <RowSection label="Connections" count={connections.length}>
      {error ? <SettingsErrorBanner message={error} testId="addon-connections-error" /> : null}
      {connections.map((connection) => (
        <div
          key={connection.connectionId}
          className="flex min-w-0 flex-col gap-1.5 rounded-md border px-3 py-2"
          data-testid={`addon-connection-${connection.connectionId}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium text-sm">{connection.label}</span>
            {connection.needsSetup ? <Badge variant="destructive">needs setup</Badge> : null}
            {connection.optional ? <Badge variant="outline">optional</Badge> : null}
            <Badge variant="secondary">{connection.cardinality}</Badge>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {connection.accountIds.map((accountId) => (
              <span
                key={accountId}
                className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2 font-mono text-[11px]"
                data-testid={`addon-binding-${accountId}`}
              >
                {accountId}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Unbind ${accountId}`}
                  disabled={pendingId === connection.connectionId}
                  onClick={() =>
                    void saveBinding(
                      connection.connectionId,
                      connection.accountIds.filter((id) => id !== accountId),
                    )
                  }
                >
                  ×
                </Button>
              </span>
            ))}
            {connection.accountIds.length === 0 ? (
              <span className="text-muted-foreground text-xs">No accounts bound</span>
            ) : null}
          </div>
          {connection.cardinality === 'many' || connection.accountIds.length === 0 ? (
            <AccountPicker
              key={`${connection.connectionId}:${connection.accountIds.length}`}
              orgId={orgId}
              kinds={connection.accountKinds}
              value={null}
              allowCreate
              onChange={(accountId) => {
                if (!accountId) {
                  return;
                }
                void saveBinding(
                  connection.connectionId,
                  connection.cardinality === 'one'
                    ? [accountId]
                    : [...connection.accountIds, accountId],
                );
              }}
            />
          ) : null}
        </div>
      ))}
      {connections.every((connection) => connection.accountIds.length === 0) ? (
        <RowItem title="Bind accounts to let the add-on act on your behalf" />
      ) : null}
    </RowSection>
  );
}
