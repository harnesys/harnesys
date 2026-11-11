import type { AccountView } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { AccountPicker } from '@/features/manage-apps';
import { orgAddonDetailQueryKey, putOrgAddonBindings } from '@/shared/api/addons';
import { accountsQuery } from '@/shared/api/apps';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { RowChip, RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import type { SectionProps } from '../lib/section-props';

function accountTitle(account: AccountView | undefined, accountId: string): string {
  if (!account) {
    return accountId.length > 12 ? `${accountId.slice(0, 12)}…` : accountId;
  }
  return account.label || account.externalAccountId || accountId;
}

export function ConnectionsSection({ orgId, detail, section }: SectionProps) {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountsResult = useQuery(accountsQuery(orgId));
  const accountById = new Map(
    (accountsResult.data?.accounts ?? []).map((account) => [account.id, account]),
  );

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
          className="flex min-w-0 flex-col gap-2.5 rounded-lg border px-3 py-2.5"
          data-testid={`addon-connection-${connection.connectionId}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium text-sm">{connection.label}</span>
            {connection.needsSetup ? <RowChip tone="danger">needs setup</RowChip> : null}
            {connection.optional ? <RowChip>optional</RowChip> : null}
            <RowChip>{connection.cardinality === 'one' ? 'single' : 'multi'}</RowChip>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            {connection.accountIds.length === 0 ? (
              <p className="text-muted-foreground text-xs leading-4">No accounts bound</p>
            ) : (
              connection.accountIds.map((accountId) => {
                const account = accountById.get(accountId);
                return (
                  <div
                    key={accountId}
                    className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 py-1 pr-1 pl-1.5"
                    data-testid={`addon-binding-${accountId}`}
                  >
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[10px]">
                        {accountTitle(account, accountId).slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-4">
                        {accountTitle(account, accountId)}
                      </p>
                      {account && account.label !== account.externalAccountId ? (
                        <p className="truncate text-[11px] text-muted-foreground leading-3">
                          {account.externalAccountId}
                        </p>
                      ) : null}
                    </div>
                    {account && account.status !== 'connected' ? (
                      <RowChip tone="danger">{account.status}</RowChip>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Unbind ${accountTitle(account, accountId)}`}
                      disabled={pendingId === connection.connectionId}
                      onClick={() =>
                        void saveBinding(
                          connection.connectionId,
                          connection.accountIds.filter((id) => id !== accountId),
                        )
                      }
                    >
                      <XIcon />
                    </Button>
                  </div>
                );
              })
            )}
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
